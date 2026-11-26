import { MESSAGES } from "@/i18n/messages";

/**
 * @deprecated Etykiety statusów są w słownikach (`statuses.run.*`) — użyj `t("statuses.run.<STATUS>")`.
 * Zostawione dla zgodności (wersja polska).
 */
export const RUN_STATUS_LABEL: Record<string, string> = MESSAGES.pl.statuses.run;
