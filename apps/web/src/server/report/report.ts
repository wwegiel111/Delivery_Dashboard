/**
 * Raport planu przyjęć: tabela przyjazdów (PDF) i treści maili do przewoźników.
 * Czyste funkcje — wejście to zapisany plan, bez dostępu do bazy.
 * Język dokumentu (`ReportMeta.locale`) jest niezależny od języka interfejsu; domyślnie polski.
 */
import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "@/i18n/config";
import { translator } from "@/i18n/translator";
import { longDate as longDateLocale } from "@/lib/time-format";

export interface PlanRow {
  arrivalAt: Date;
  unloadStartAt: Date;
  unloadEndAt: Date;
  dock: number;
  crew: number;
  waybillNumber: string;
  carrier: string;
  carrierEmail: string | null;
  truckPlate: string | null;
  supplier: string | null;
  pallets: number;
  late: boolean;
}

export interface ReportMeta {
  planDate: string; // RRRR-MM-DD
  timezone: string;
  warehouseName: string;
  signature: string;
  generatedAt: Date;
  runId: number;
  /** Język PDF i treści maili (domyślnie `pl`). */
  locale?: Locale;
}

export interface CarrierEmail {
  carrier: string;
  to: string | null;
  subject: string;
  body: string;
  trucks: number;
}

/** „1 paleta”, „2 palety”, „5 palet” / „1 pallet”, „2 pallets”. */
export function palletsText(n: number, locale: Locale): string {
  return translator(locale)("common.pallets", { count: n });
}

/** „1 auto”, „2 auta”, „5 aut” / „1 truck”, „2 trucks”. */
export function trucksText(n: number, locale: Locale): string {
  return translator(locale)("common.trucks", { count: n });
}

/** Polska odmiana (zgodność wstecz; jeden argument — bezpieczne w `.map(palletsPl)`). */
export const palletsPl = (n: number): string => palletsText(n, "pl");
export const trucksPl = (n: number): string => trucksText(n, "pl");

/** „1 grupa po 2 os.”, „2 grupy po 4 os.”, „5 grup po 3 os.” / „2 crews of 4”. */
export function crewsPl(crews: number, size: number, locale: Locale = DEFAULT_LOCALE): string {
  return translator(locale)("common.crews", { count: crews, size });
}

/** „4 stanowiska” / „4 docks”. */
export function docksText(n: number, locale: Locale = DEFAULT_LOCALE): string {
  return translator(locale)("common.docks", { count: n });
}

export function hhmm(d: Date, tz: string, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

export function longDate(isoDate: string, locale: Locale = DEFAULT_LOCALE): string {
  return longDateLocale(isoDate, locale);
}

export function sortRows(rows: PlanRow[]): PlanRow[] {
  return [...rows].sort((a, b) => a.arrivalAt.getTime() - b.arrivalAt.getTime() || a.dock - b.dock);
}

/**
 * Jeden mail na przewoźnika. Listy bez e-maila dołączają do adresu tego przewoźnika z innych list;
 * osobne maile powstają tylko, gdy przewoźnik podał kilka różnych adresów (np. różni dyspozytorzy).
 */
export function carrierEmails(rows: PlanRow[], meta: ReportMeta): CarrierEmail[] {
  const locale = meta.locale ?? DEFAULT_LOCALE;
  const t = translator(locale);
  const byCarrier = new Map<string, PlanRow[]>();
  for (const r of sortRows(rows)) {
    const key = r.carrier.trim().toLowerCase();
    byCarrier.set(key, [...(byCarrier.get(key) ?? []), r]);
  }
  const groups: { to: string | null; list: PlanRow[] }[] = [];
  for (const list of byCarrier.values()) {
    const addresses = [...new Set(list.map((r) => r.carrierEmail?.trim().toLowerCase()).filter((e): e is string => !!e))];
    if (addresses.length <= 1) {
      groups.push({ to: addresses[0] ?? null, list });
      continue;
    }
    for (const a of addresses) {
      const own = list.filter((r) => r.carrierEmail?.trim().toLowerCase() === a || (!r.carrierEmail && a === addresses[0]));
      groups.push({ to: a, list: own });
    }
  }
  const date = longDate(meta.planDate, locale);
  return groups.map(({ to, list }) => {
    const first = list[0]!;
    const lines = list.map((r) =>
      t("emails.line", {
        time: hhmm(r.arrivalAt, meta.timezone, locale),
        dock: r.dock,
        truck: r.truckPlate ? t("emails.truckWithPlate", { plate: r.truckPlate }) : t("emails.truck"),
        waybill: r.waybillNumber,
        pallets: palletsText(r.pallets, locale),
      }),
    );
    const body = [
      t("emails.greeting"),
      "",
      t("emails.intro", { warehouse: meta.warehouseName, date }),
      "",
      ...lines,
      "",
      t("emails.arrive"),
      t("emails.delay"),
      "",
      t("emails.regards"),
      meta.signature,
    ].join("\n");
    const count = list.length > 1 ? t("emails.subjectCount", { trucks: trucksText(list.length, locale) }) : "";
    return {
      carrier: first.carrier,
      to,
      subject: t("emails.subject", { warehouse: meta.warehouseName, date }) + count,
      body,
      trucks: list.length,
    };
  });
}

/** Link mailto (otwiera klienta poczty z gotową wiadomością). */
export function mailtoHref(e: CarrierEmail): string {
  const q = `subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}`;
  return `mailto:${e.to ? encodeURIComponent(e.to) : ""}?${q}`;
}
