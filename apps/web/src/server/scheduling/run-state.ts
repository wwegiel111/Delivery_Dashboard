/**
 * Cykl życia wersji planu widziany przez interfejs (czyste funkcje — bez bazy i Reacta).
 *
 * W bazie wersja ma status `SOLVING` od chwili wysłania żądania do solvera aż do zapisania wyniku.
 * Taki stan to „generowanie w toku”, a nie porażka. Porażka to wyłącznie zakończony przebieg bez planu:
 *  - `infeasible`  — przy ograniczeniach magazynu nie istnieje plan (solver: INFEASIBLE),
 *  - `timeout`     — w limicie czasu solver nie znalazł żadnego planu (solver: UNKNOWN),
 *  - `connection`  — brak komunikacji z modułem planowania (sieć, timeout HTTP, błąd 5xx),
 *  - `unexpected`  — błąd aplikacji (np. odrzucone żądanie, błędne dane modelu),
 *  - `interrupted` — przebieg zaczął się, ale wynik nigdy nie został zapisany (restart serwera, przerwane żądanie).
 */
import type { RunStatus } from "@etpromo/db";
import type { ErrorKey, ErrorValues } from "../errors";

export type FailureKind = "infeasible" | "timeout" | "connection" | "unexpected" | "interrupted";
export type RunPhase = "solving" | "success" | "failed";
export interface RunState {
  phase: RunPhase;
  failure: FailureKind | null;
}

/** Zapas ponad limit solvera: timeout HTTP klienta (30 s) + minuta marginesu na budowę modelu i zapis. */
export const SOLVING_GRACE_MS = 90_000;

/** Kiedy przebieg `SOLVING` uznajemy za przerwany (wynik nie przyjdzie). */
export function solvingDeadline(createdAt: Date, timeLimitS: number): Date {
  return new Date(createdAt.getTime() + timeLimitS * 1000 + SOLVING_GRACE_MS);
}

/** Błąd zapisywany w `schedule_run.error_message` niezależnie od języka: `{"key":…, "values":…}`. */
export function encodeRunError(key: ErrorKey, values: ErrorValues = {}): string {
  return JSON.stringify({ key, values });
}

export function decodeRunError(message: string | null): { key: ErrorKey; values: ErrorValues } | null {
  if (!message?.startsWith("{")) return null;
  try {
    const v: unknown = JSON.parse(message);
    if (typeof v === "object" && v !== null && "key" in v && typeof v.key === "string") {
      const values = "values" in v && typeof v.values === "object" && v.values !== null ? (v.values as ErrorValues) : {};
      return { key: v.key as ErrorKey, values };
    }
  } catch {
    /* zwykły tekst */
  }
  return null;
}

const CONNECTION_KEYS: ReadonlySet<string> = new Set(["solverUnreachable", "solverStatus", "solverTimeout"]);
/** Komunikaty zapisane przed wprowadzeniem kodów błędów (zgodność ze starszymi wersjami planu). */
const LEGACY_CONNECTION = /Brak połączenia z (solverem|modułem planowania)|Przekroczono czas oczekiwania na solver|nie odpowiedział na czas|Solver zwrócił \d|zwrócił błąd \d/;

/** Rodzaj porażki zakończonego przebiegu ze statusem ERROR. */
export function errorKind(message: string | null): FailureKind {
  if (!message) return "unexpected";
  const solver = /^Solver: ([A-Z_]+)$/.exec(message);
  if (solver) return solver[1] === "UNKNOWN" ? "timeout" : "unexpected";
  const coded = decodeRunError(message);
  if (coded) return CONNECTION_KEYS.has(coded.key) ? "connection" : "unexpected";
  return LEGACY_CONNECTION.test(message) ? "connection" : "unexpected";
}

/** Stan wersji planu na potrzeby interfejsu. */
export function runState(run: { status: RunStatus; errorMessage: string | null; createdAt: Date; timeLimitS: number }, now: Date = new Date()): RunState {
  switch (run.status) {
    case "OPTIMAL":
    case "FEASIBLE":
      return { phase: "success", failure: null };
    case "SOLVING":
      return now > solvingDeadline(run.createdAt, run.timeLimitS) ? { phase: "failed", failure: "interrupted" } : { phase: "solving", failure: null };
    case "INFEASIBLE":
      return { phase: "failed", failure: "infeasible" };
    case "ERROR":
      return { phase: "failed", failure: errorKind(run.errorMessage) };
  }
}

/** Limit czasu solvera zapisany w żądaniu przebiegu (domyślnie 20 s jak w kontrakcie). */
export function timeLimitOf(requestPayload: unknown): number {
  const v = typeof requestPayload === "object" && requestPayload !== null ? (requestPayload as { time_limit_s?: unknown }).time_limit_s : undefined;
  return typeof v === "number" && v > 0 ? v : 20;
}

export type MainPanel = "empty" | "generating" | "result" | "failure";

/**
 * Co pokazać w głównym panelu planu.
 * - Generowanie trwa (w tej karcie albo według bazy) → panel „trwa generowanie”, nigdy błąd.
 * - Jawnie wybrana starsza, gotowa wersja (`?run=`) pozostaje widoczna także w trakcie generowania nowej.
 * - Brak wyniku ≠ porażka: bez wersji pokazujemy stan pusty.
 */
export function mainPanel(input: { view: RunState | null; explicitRun: boolean; pendingHere: boolean }): MainPanel {
  const { view, explicitRun, pendingHere } = input;
  if (view?.phase === "solving") return "generating";
  if (pendingHere && !(explicitRun && view)) return "generating";
  if (!view) return "empty";
  return view.phase === "success" ? "result" : "failure";
}
