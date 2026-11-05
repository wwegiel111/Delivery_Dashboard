/**
 * Raport planu przyjęć: tabela przyjazdów (PDF) i treści maili do przewoźników.
 * Czyste funkcje — wejście to zapisany plan, bez dostępu do bazy.
 */

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
}

export interface CarrierEmail {
  carrier: string;
  to: string | null;
  subject: string;
  body: string;
  trucks: number;
}

export function palletsPl(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (n === 1) return "1 paleta";
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${n} palety`;
  return `${n} palet`;
}

export function trucksPl(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (n === 1) return "1 auto";
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${n} auta`;
  return `${n} aut`;
}

/** „1 grupa po 2 os.”, „2 grupy po 4 os.”, „5 grup po 3 os.” */
export function crewsPl(crews: number, size: number): string {
  const lastTwo = crews % 100;
  const last = crews % 10;
  const word = crews === 1 ? "grupa" : last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? "grupy" : "grup";
  return `${crews} ${word} po ${size} os.`;
}

export function hhmm(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("pl-PL", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
}

export function longDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("pl-PL", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function sortRows(rows: PlanRow[]): PlanRow[] {
  return [...rows].sort((a, b) => a.arrivalAt.getTime() - b.arrivalAt.getTime() || a.dock - b.dock);
}

/**
 * Jeden mail na przewoźnika. Listy bez e-maila dołączają do adresu tego przewoźnika z innych list;
 * osobne maile powstają tylko, gdy przewoźnik podał kilka różnych adresów (np. różni dyspozytorzy).
 */
export function carrierEmails(rows: PlanRow[], meta: ReportMeta): CarrierEmail[] {
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
  const date = longDate(meta.planDate);
  return groups.map(({ to, list }) => {
    const first = list[0]!;
    const lines = list.map((r) => {
      const truck = r.truckPlate ? `auto ${r.truckPlate}` : "auto";
      return `• ${hhmm(r.arrivalAt, meta.timezone)} — stanowisko ${r.dock} — ${truck} — list przewozowy ${r.waybillNumber} (${palletsPl(r.pallets)})`;
    });
    const body = [
      "Dzień dobry,",
      "",
      `potwierdzamy terminy rozładunku w magazynie ${meta.warehouseName} na ${date}:`,
      "",
      ...lines,
      "",
      "Prosimy o przyjazd o wskazanej godzinie i podstawienie auta na wskazane stanowisko rozładunkowe.",
      "W razie opóźnienia prosimy o wcześniejszy kontakt — pozwoli to przesunąć kolejne rozładunki.",
      "",
      "Pozdrawiamy,",
      meta.signature,
    ].join("\n");
    return {
      carrier: first.carrier,
      to,
      subject: `Awizacja rozładunku ${meta.warehouseName} — ${date}${list.length > 1 ? ` (${trucksPl(list.length)})` : ""}`,
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
