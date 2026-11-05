/**
 * Czas lokalny magazynu ⟷ instant UTC ⟷ sloty solvera.
 *
 * Slot 0 = poniedziałek 00:00 czasu lokalnego (np. Europe/Warsaw) zapisany jako instant UTC.
 * Sloty liczone są w czasie absolutnym, więc tydzień ze zmianą czasu ma 668 lub 676 slotów
 * "ściennych", ale horyzont zawsze obejmuje dokładnie 7 dni kalendarzowych (patrz `weekHorizonSlots`).
 * Bez zależności: wyłącznie Intl.
 */

export interface LocalParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  /** 1 = poniedziałek ... 7 = niedziela */
  isoWeekday: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(date: Date, tz: string): LocalParts {
  const p: Record<string, string> = {};
  for (const part of fmt(tz).formatToParts(date)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    isoWeekday: WEEKDAYS[p.weekday ?? "Mon"] ?? 1,
  };
}

/** Przesunięcie strefy w minutach (lokalny - UTC) w danym instancie. */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - truncated) / 60_000);
}

/** Czas ścienny w strefie `tz` -> instant UTC. Dla nieistniejących godzin (DST) przesuwa do przodu. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let t = guess - off1 * 60_000;
  const off2 = tzOffsetMinutes(new Date(t), tz);
  if (off2 !== off1) t = guess - off2 * 60_000;
  return new Date(t);
}

/** Dodaje dni kalendarzowe do daty lokalnej (bez godzin). */
export function addLocalDays(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Poniedziałek 00:00 czasu lokalnego tygodnia zawierającego `date`, jako instant UTC. */
export function weekStartFor(date: Date, tz: string): Date {
  const p = localParts(date, tz);
  const mon = addLocalDays(p.year, p.month, p.day, -(p.isoWeekday - 1));
  return zonedTimeToUtc(mon.year, mon.month, mon.day, 0, 0, tz);
}

/** Instant UTC dla `HH:MM` w dniu `dayIndex` (0 = poniedziałek) tygodnia zaczynającego się w `weekStart`. */
export function weekLocalTime(weekStart: Date, dayIndex: number, hhmm: string, tz: string): Date {
  const p = localParts(weekStart, tz);
  const d = addLocalDays(p.year, p.month, p.day, dayIndex);
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  if (h === 24 && m === 0) {
    const n = addLocalDays(d.year, d.month, d.day, 1);
    return zonedTimeToUtc(n.year, n.month, n.day, 0, 0, tz);
  }
  return zonedTimeToUtc(d.year, d.month, d.day, h, m, tz);
}

/** Liczba slotów w tygodniu (7 dób kalendarzowych; 668/672/676 w zależności od DST). */
export function weekHorizonSlots(weekStart: Date, slotMinutes: number, tz: string): number {
  const next = weekLocalTime(weekStart, 7, "00:00", tz);
  return Math.round((next.getTime() - weekStart.getTime()) / 60_000 / slotMinutes);
}

export function slotToDate(weekStart: Date, slot: number, slotMinutes: number): Date {
  return new Date(weekStart.getTime() + slot * slotMinutes * 60_000);
}

/** Slot zawierający instant (zaokrąglenie w dół) — dla początku okna. */
export function dateToSlotFloor(weekStart: Date, date: Date, slotMinutes: number): number {
  return Math.floor((date.getTime() - weekStart.getTime()) / 60_000 / slotMinutes);
}

/** Pierwszy slot nie wcześniejszy niż instant (zaokrąglenie w górę) — dla release. */
export function dateToSlotCeil(weekStart: Date, date: Date, slotMinutes: number): number {
  return Math.ceil((date.getTime() - weekStart.getTime()) / 60_000 / slotMinutes);
}

export function minutesToSlots(minutes: number, slotMinutes: number): number {
  return Math.max(1, Math.ceil(minutes / slotMinutes - 1e-9));
}

// ── Planowanie dzienne ────────────────────────────────────────────────────────

/** Lokalna północ dnia `YYYY-MM-DD` w strefie `tz`, jako instant UTC (slot 0 planu dnia). */
export function localDayStart(isoDate: string, tz: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return zonedTimeToUtc(y, m, d, 0, 0, tz);
}

/** Instant UTC dla `HH:MM` (dopuszczalne `24:00`) w dniu zaczynającym się w `dayStart`. */
export function localTimeOn(dayStart: Date, hhmm: string, tz: string): Date {
  return weekLocalTime(dayStart, 0, hhmm, tz);
}

/** Liczba slotów w dobie (92 / 96 / 100 przy slocie 15 min, zależnie od zmiany czasu). */
export function dayHorizonSlots(dayStart: Date, slotMinutes: number, tz: string): number {
  return Math.round((localTimeOn(dayStart, "24:00", tz).getTime() - dayStart.getTime()) / 60_000 / slotMinutes);
}
