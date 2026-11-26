/** Konfiguracja języków interfejsu (bez prefiksów w URL — język trzymamy w cookie). */
export const LOCALES = ["pl", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pl";

/** Cookie z preferencją językową — czytane przy renderowaniu po stronie serwera. */
export const LOCALE_COOKIE = "NEXT_LOCALE";
/** Rok w sekundach — preferencja przetrwa restart przeglądarki. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function resolveLocale(v: unknown): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Tag BCP 47 do Intl: angielski w wariancie brytyjskim (zegar 24 h, dzień przed miesiącem) — standard w logistyce w Europie. */
export const INTL_LOCALE: Record<Locale, string> = { pl: "pl-PL", en: "en-GB" };

/** Strefa czasowa domyślna (magazyn); daty i godziny planu formatujemy jawnie w strefie magazynu z parametrów. */
export const DEFAULT_TIME_ZONE = "Europe/Warsaw";
