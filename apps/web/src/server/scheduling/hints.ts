/**
 * Tłumaczenie wskazówek i komunikatów solvera.
 * Solver (Python) zwraca polski tekst w `hints[].reason` — kontraktu API nie zmieniamy,
 * więc znane komunikaty rozpoznajemy po wzorcu i podstawiamy tekst ze słownika `solverHints.*`.
 * Nieznany tekst przechodzi bez zmian.
 */
import type { Translator } from "@/i18n/translator";
import { decodeRunError } from "./run-state";

type HintKey = "overBuffer" | "fixedOutside" | "noSlot" | "breaksDontFit" | "infeasible" | "timeout" | "noTrucks" | "duplicateIds" | "late" | "leftover";

const PATTERNS: { re: RegExp; key: HintKey; values?: (m: RegExpExecArray, slotMinutes: number) => Record<string, number> }[] = [
  { re: /^(\d+) palet nie zmieści się w buforze \((\d+)\)$/, key: "overBuffer", values: (m) => ({ pallets: +m[1]!, capacity: +m[2]! }) },
  { re: /^ustalona godzina przyjazdu wypada poza godzinami pracy lub przed awizacją$/, key: "fixedOutside" },
  { re: /^rozładunek nie mieści się w godzinach pracy po godzinie awizacji/, key: "noSlot" },
  { re: /^zmiana (\d+): (\d+) przerw\(y\) nie mieszczą się w zmianie/, key: "breaksDontFit", values: (m) => ({ shift: +m[1]!, count: +m[2]! }) },
  { re: /^Nie da się przyjąć wszystkich aut w godzinach pracy/, key: "infeasible" },
  { re: /^Nie znaleziono planu w limicie czasu/, key: "timeout" },
  { re: /^brak aut do zaplanowania$/, key: "noTrucks" },
  { re: /^Zduplikowane identyfikatory aut$/, key: "duplicateIds" },
  { re: /^rozładunek kończy się (\d+) slot\(y\) po terminie awizacji$/, key: "late", values: (m, slot) => ({ minutes: +m[1]! * slot }) },
  { re: /^(\d+) palet zostaje w buforze po godzinach pracy$/, key: "leftover", values: (m) => ({ count: +m[1]! }) },
];

export function translateHint(reason: string, t: Translator, slotMinutes: number): string {
  for (const p of PATTERNS) {
    const m = p.re.exec(reason);
    if (m) return t(`solverHints.${p.key}`, p.values?.(m, slotMinutes) ?? {});
  }
  return reason;
}

/** Komunikat błędu zapisany przy wersji planu (kod `{key, values}` albo „Solver: UNKNOWN”) w języku interfejsu. */
export function translateRunError(message: string | null, t: Translator): string | null {
  if (!message) return null;
  const coded = decodeRunError(message);
  if (coded) {
    // Klucz pochodzi z zapisu aplikacji (ErrorKey); nieznany klucz — pokazujemy surowe wartości.
    const tt = t as unknown as { has: (k: string) => boolean } & ((k: string, v: Record<string, string | number>) => string);
    return tt.has(`errors.${coded.key}`) ? tt(`errors.${coded.key}`, coded.values) : Object.values(coded.values).join(" ");
  }
  const m = /^Solver: ([A-Z_]+)$/.exec(message);
  if (m) {
    const status = m[1]!;
    const known = ["SOLVING", "OPTIMAL", "FEASIBLE", "INFEASIBLE", "ERROR", "UNKNOWN", "MODEL_INVALID"] as const;
    const label = (known as readonly string[]).includes(status) ? t(`statuses.run.${status as (typeof known)[number]}`) : status;
    return t("errors.solverResult", { status: label });
  }
  return message;
}

/** Domyślna nazwa stanowiska z bazy („Stanowisko N”) w języku interfejsu; nazwy własne bez zmian. */
export function dockLabel(name: string, number: number, t: Translator): string {
  return /^Stanowisko \d+$/.test(name) ? t("charts.timeline.dockName", { n: number }) : name;
}
