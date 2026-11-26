/**
 * Tłumacz niezależny od Reacta i od żądania HTTP — dla czystych funkcji serwerowych
 * (raport PDF, treść maili, walidacja importu, komunikaty planowania) oraz testów.
 * W komponentach używaj `useTranslations` / `getTranslations` z next-intl.
 */
import { createTranslator } from "next-intl";
import { DEFAULT_TIME_ZONE, type Locale } from "./config";
import { MESSAGES } from "./messages";

export function translator(locale: Locale) {
  return createTranslator({ locale, messages: MESSAGES[locale], timeZone: DEFAULT_TIME_ZONE });
}

export type Translator = ReturnType<typeof translator>;
