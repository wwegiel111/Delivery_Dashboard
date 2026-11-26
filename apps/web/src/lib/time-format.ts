import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "@/i18n/config";

const cache = new Map<string, Intl.DateTimeFormat>();

function f(tz: string, opts: Intl.DateTimeFormatOptions, locale: Locale) {
  const key = locale + tz + JSON.stringify(opts);
  let x = cache.get(key);
  if (!x) {
    x = new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: tz, hourCycle: "h23", ...opts });
    cache.set(key, x);
  }
  return x;
}

/** Godzina HH:MM w strefie magazynu (24 h w obu językach). */
export const fmtTime = (d: Date, tz: string, locale: Locale = DEFAULT_LOCALE) => f(tz, { hour: "2-digit", minute: "2-digit" }, locale).format(d);
export const fmtDay = (d: Date, tz: string, locale: Locale = DEFAULT_LOCALE) =>
  f(tz, { weekday: "short", day: "2-digit", month: "2-digit" }, locale).format(d);
export const fmtDayTime = (d: Date, tz: string, locale: Locale = DEFAULT_LOCALE) =>
  f(tz, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }, locale).format(d);
export const fmtDate = (d: Date, tz: string, locale: Locale = DEFAULT_LOCALE) =>
  f(tz, { year: "numeric", month: "2-digit", day: "2-digit" }, locale).format(d);

/** Data kalendarzowa RRRR-MM-DD (bez strefy) w formie długiej, np. „poniedziałek, 09.11.2026” / „Monday, 09/11/2026”. */
export function longDate(isoDate: string, locale: Locale = DEFAULT_LOCALE): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** Krótka data RRRR-MM-DD → „09.11” / „09/11”. */
export function shortDate(isoDate: string, locale: Locale = DEFAULT_LOCALE): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: "UTC", day: "2-digit", month: "2-digit" }).format(d);
}

/** Skrót dnia tygodnia dla daty RRRR-MM-DD („pon.” / „Mon”). */
export function weekdayShort(isoDate: string, locale: Locale = DEFAULT_LOCALE): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: "UTC", weekday: "short" }).format(d);
}

/** Liczba z separatorami tysięcy właściwymi dla języka. */
export function fmtNumber(n: number, locale: Locale = DEFAULT_LOCALE, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], opts).format(n);
}

/** Odsetek 0..1 → „87%” / „87 %” zgodnie z konwencją języka. */
export function fmtPercent(ratio: number, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "percent", maximumFractionDigits: 0 }).format(ratio);
}

/** YYYY-MM-DD w strefie magazynu (parametr URL tygodnia). */
export function isoDay(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
