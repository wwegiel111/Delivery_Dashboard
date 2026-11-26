/**
 * Błąd z kluczem tłumaczenia (`errors.*`). Kod serwerowy rzuca go bez znajomości języka żądania,
 * a warstwa HTTP / Server Action tłumaczy go na język użytkownika (`localizeError`).
 * `message` zawiera wersję polską (domyślny język) — do logów i dla starszych wywołań.
 */
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { translator } from "@/i18n/translator";

export type ErrorKey = keyof Messages["errors"];
export type ErrorValues = Record<string, string | number>;

export class LocalizedError extends Error {
  constructor(
    readonly key: ErrorKey,
    readonly values: ErrorValues = {},
  ) {
    super(translateError(key, values, "pl"));
    this.name = "LocalizedError";
  }
}

function translateError(key: ErrorKey, values: ErrorValues, locale: Locale): string {
  // Klucz pochodzi z unii ErrorKey; wartości są zawsze tekstem/liczbą.
  return (translator(locale) as unknown as (k: string, v: ErrorValues) => string)(`errors.${key}`, values);
}

/** Nieudany przebieg planowania — zapisany w bazie jako wersja `runId`, pierwotny błąd w `cause`. */
export class RunFailure extends Error {
  constructor(
    readonly runId: number,
    readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "RunFailure";
  }
}

/** Klucz i wartości błędu do zapisu niezależnego od języka; nieznane błędy jako `unexpected`. */
export function errorPayload(err: unknown): { key: ErrorKey; values: ErrorValues } {
  if (err instanceof RunFailure) return errorPayload(err.cause);
  if (err instanceof LocalizedError) return { key: err.key, values: err.values };
  return { key: "unexpected", values: { message: err instanceof Error ? err.message : String(err) } };
}

/** Komunikat błędu w języku użytkownika (nieznane błędy przechodzą bez zmian). */
export function localizeError(err: unknown, locale: Locale): string {
  if (err instanceof RunFailure) return localizeError(err.cause, locale);
  if (err instanceof LocalizedError) return translateError(err.key, err.values, locale);
  return err instanceof Error ? err.message : String(err);
}

/** Zapisany kod błędu (`{key, values}`) w języku użytkownika. */
export function translateErrorKey(key: ErrorKey, values: ErrorValues, locale: Locale): string {
  return translateError(key, values, locale);
}
