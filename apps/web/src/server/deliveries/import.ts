/**
 * Import list przewozowych z CSV / XLSX.
 *
 * Jeden wiersz = jedno auto ALBO jedna pozycja listu — wiersze z tym samym numerem listu są łączone,
 * a palety sumowane. Rozpoznawane kolumny (nagłówki bez polskich znaków, wielkość liter dowolna):
 *
 *   numer_listu*      (nr_listu, list_przewozowy, cmr, waybill)
 *   przewoznik*       (carrier, spedytor)
 *   data_dostawy*     (data, date)            RRRR-MM-DD lub DD.MM.RRRR
 *   liczba_palet*     (palety, ilosc_palet, pallets)
 *   email_przewoznika (email, e_mail)
 *   nr_rejestracyjny  (rejestracja, nr_auta, truck_plate)
 *   dostawca          (supplier, nadawca)
 *   awizacja_od / awizacja_do (okno_od / okno_do)   HH:MM lub data + HH:MM
 *   priorytet (1–10), uwagi
 *
 * Ponowny import tego samego numeru listu aktualizuje dostawę (idempotentnie).
 */
import { localDayStart, localTimeOn, zonedTimeToUtc } from "@etpromo/contracts";
import { prisma } from "@etpromo/db";
import { z } from "zod";
import type { RawRow } from "../import/table";

export const TEMPLATE_HEADERS = [
  "numer_listu",
  "przewoznik",
  "email_przewoznika",
  "nr_rejestracyjny",
  "dostawca",
  "data_dostawy",
  "awizacja_od",
  "awizacja_do",
  "liczba_palet",
  "priorytet",
  "uwagi",
];

const ALIASES: Record<string, string[]> = {
  numer_listu: ["nr_listu", "list_przewozowy", "numer_listu_przewozowego", "cmr", "waybill", "waybill_number"],
  przewoznik: ["carrier", "spedytor", "przewoznik_nazwa"],
  email_przewoznika: ["email", "e_mail", "mail", "carrier_email"],
  nr_rejestracyjny: ["rejestracja", "nr_auta", "numer_rejestracyjny", "truck_plate", "tablica"],
  dostawca: ["supplier", "nadawca"],
  data_dostawy: ["data", "date", "delivery_date", "dzien"],
  awizacja_od: ["okno_od", "od", "window_from"],
  awizacja_do: ["okno_do", "do", "window_to"],
  liczba_palet: ["palety", "ilosc_palet", "pallets", "palet"],
  priorytet: ["priority"],
  uwagi: ["notes", "komentarz"],
};

/** Porównanie bez podkreśleń: "e_mail_przewoznika" = "email_przewoznika", "nr_rej" = "nrrej". */
const squash = (k: string) => k.replace(/_/g, "");

export function canonicalize(row: RawRow): RawRow {
  const out: RawRow = {};
  for (const [key, value] of Object.entries(row)) {
    const k = squash(key);
    const canon = Object.entries(ALIASES).find(([c, al]) => squash(c) === k || al.some((a) => squash(a) === k))?.[0] ?? key;
    if (out[canon] === undefined || out[canon] === "") out[canon] = value;
  }
  return out;
}

const empty = (v: unknown) => (v === "" || v === undefined ? undefined : v);
const Row = z.object({
  numer_listu: z.string().trim().min(1, "brak numeru listu przewozowego"),
  przewoznik: z.string().trim().min(1, "brak przewoźnika"),
  email_przewoznika: z.preprocess(empty, z.email("nieprawidłowy e-mail przewoźnika").optional()),
  nr_rejestracyjny: z.preprocess(empty, z.string().trim().optional()),
  dostawca: z.preprocess(empty, z.string().trim().optional()),
  data_dostawy: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      const pl = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
      if (iso) return v;
      if (pl) return `${pl[3]}-${pl[2]!.padStart(2, "0")}-${pl[1]!.padStart(2, "0")}`;
      ctx.addIssue({ code: "custom", message: "data dostawy w formacie RRRR-MM-DD lub DD.MM.RRRR" });
      return z.NEVER;
    }),
  awizacja_od: z.preprocess(empty, z.string().trim().optional()),
  awizacja_do: z.preprocess(empty, z.string().trim().optional()),
  liczba_palet: z.preprocess((v) => (typeof v === "string" ? v.replace(/\s/g, "") : v), z.coerce.number().int("liczba palet musi być całkowita").positive("liczba palet > 0")),
  priorytet: z.preprocess((v) => empty(v) ?? 5, z.coerce.number().int().min(1).max(10)),
  uwagi: z.preprocess(empty, z.string().optional()),
});

export interface ParsedDelivery {
  waybillNumber: string;
  carrier: string;
  carrierEmail: string | null;
  truckPlate: string | null;
  supplier: string | null;
  deliveryDate: string; // RRRR-MM-DD
  windowFrom: Date | null;
  windowTo: Date | null;
  pallets: number;
  priority: number;
  notes: string | null;
  rows: number[];
}

export interface RowError {
  row: number;
  message: string;
}

/** `HH:MM` (w dniu dostawy) albo `RRRR-MM-DD HH:MM` / `DD.MM.RRRR HH:MM` → instant UTC. */
export function parseTime(value: string, deliveryDate: string, tz: string): Date | null {
  const hm = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (hm) return localTimeOn(localDayStart(deliveryDate, tz), `${hm[1]!.padStart(2, "0")}:${hm[2]}`, tz);
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(value);
  if (iso) return zonedTimeToUtc(+iso[1]!, +iso[2]!, +iso[3]!, +iso[4]!, +iso[5]!, tz);
  const pl = /^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2}):(\d{2})$/.exec(value);
  if (pl) return zonedTimeToUtc(+pl[3]!, +pl[2]!, +pl[1]!, +pl[4]!, +pl[5]!, tz);
  return null;
}

export function parseWaybills(rawRows: RawRow[], tz: string): { deliveries: ParsedDelivery[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const byNumber = new Map<string, ParsedDelivery>();
  rawRows.forEach((raw, i) => {
    const rowNo = i + 2; // nagłówek = wiersz 1
    const res = Row.safeParse(canonicalize(raw));
    if (!res.success) {
      errors.push({ row: rowNo, message: res.error.issues.map((x) => x.message).join("; ") });
      return;
    }
    const r = res.data;
    const from = r.awizacja_od ? parseTime(r.awizacja_od, r.data_dostawy, tz) : null;
    const to = r.awizacja_do ? parseTime(r.awizacja_do, r.data_dostawy, tz) : null;
    if (r.awizacja_od && !from) errors.push({ row: rowNo, message: `awizacja od: "${r.awizacja_od}" — oczekiwano HH:MM` });
    if (r.awizacja_do && !to) errors.push({ row: rowNo, message: `awizacja do: "${r.awizacja_do}" — oczekiwano HH:MM` });
    if (from && to && to <= from) errors.push({ row: rowNo, message: "koniec okna awizacji przed jego początkiem" });

    const prev = byNumber.get(r.numer_listu);
    if (!prev) {
      byNumber.set(r.numer_listu, {
        waybillNumber: r.numer_listu,
        carrier: r.przewoznik,
        carrierEmail: r.email_przewoznika ?? null,
        truckPlate: r.nr_rejestracyjny ?? null,
        supplier: r.dostawca ?? null,
        deliveryDate: r.data_dostawy,
        windowFrom: from,
        windowTo: to,
        pallets: r.liczba_palet,
        priority: r.priorytet,
        notes: r.uwagi ?? null,
        rows: [rowNo],
      });
      return;
    }
    // Kolejna pozycja tego samego listu: sumujemy palety, nagłówek musi się zgadzać.
    if (prev.carrier !== r.przewoznik || prev.deliveryDate !== r.data_dostawy)
      errors.push({ row: rowNo, message: `list ${r.numer_listu}: inny przewoźnik lub data niż w wierszu ${prev.rows[0]}` });
    prev.pallets += r.liczba_palet;
    prev.rows.push(rowNo);
  });
  return { deliveries: [...byNumber.values()], errors };
}

export interface ImportSummary {
  deliveries: { waybillNumber: string; carrier: string; deliveryDate: string; pallets: number }[];
  errors: RowError[];
  warnings: string[];
  committed: boolean;
}

/** Walidacja + opcjonalny zapis (całość albo nic). */
export async function importWaybills(
  rawRows: RawRow[],
  opts: { tz: string; commit: boolean; bufferCapacity: number; fileName: string },
): Promise<ImportSummary> {
  const { deliveries, errors } = parseWaybills(rawRows, opts.tz);
  const warnings: string[] = [];
  for (const d of deliveries)
    if (d.pallets > opts.bufferCapacity)
      errors.push({ row: d.rows[0]!, message: `list ${d.waybillNumber}: ${d.pallets} palet przekracza pojemność bufora (${opts.bufferCapacity})` });
  const summary = deliveries.map((d) => ({ waybillNumber: d.waybillNumber, carrier: d.carrier, deliveryDate: d.deliveryDate, pallets: d.pallets }));
  const missingEmail = deliveries.filter((d) => !d.carrierEmail).length;
  if (missingEmail > 0) warnings.push(`${missingEmail} list(ów) bez e-maila przewoźnika — wiadomość trzeba będzie wysłać ręcznie`);
  if (!opts.commit || errors.length > 0) return { deliveries: summary, errors, warnings, committed: false };

  // Niezmienione listy pomijamy — ponowny import tego samego pliku nie unieważnia gotowego planu.
  const existing = new Map(
    (await prisma.delivery.findMany({ where: { waybillNumber: { in: deliveries.map((d) => d.waybillNumber) } } })).map((e) => [e.waybillNumber, e]),
  );
  const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
  const changed = deliveries.filter((d) => {
    const e = existing.get(d.waybillNumber);
    return (
      !e ||
      e.status !== "PLANNED" ||
      e.carrier !== d.carrier ||
      e.carrierEmail !== d.carrierEmail ||
      e.truckPlate !== d.truckPlate ||
      e.supplier !== d.supplier ||
      e.deliveryDate.toISOString().slice(0, 10) !== d.deliveryDate ||
      !same(e.windowFrom, d.windowFrom) ||
      !same(e.windowTo, d.windowTo) ||
      e.pallets !== d.pallets ||
      e.priority !== d.priority ||
      e.notes !== d.notes
    );
  });
  if (changed.length < deliveries.length) warnings.push(`${deliveries.length - changed.length} list(ów) bez zmian względem bazy — pominięto`);

  await prisma.$transaction(
    changed.map((d) => {
      const data = {
        carrier: d.carrier,
        carrierEmail: d.carrierEmail,
        truckPlate: d.truckPlate,
        supplier: d.supplier,
        deliveryDate: new Date(`${d.deliveryDate}T00:00:00Z`),
        windowFrom: d.windowFrom,
        windowTo: d.windowTo,
        pallets: d.pallets,
        priority: d.priority,
        notes: d.notes,
        status: "PLANNED" as const,
        importedFrom: opts.fileName,
      };
      return prisma.delivery.upsert({ where: { waybillNumber: d.waybillNumber }, update: data, create: { waybillNumber: d.waybillNumber, ...data } });
    }),
  );
  return { deliveries: summary, errors, warnings, committed: true };
}
