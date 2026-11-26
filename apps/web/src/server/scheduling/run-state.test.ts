import { describe, expect, it } from "vitest";
import { translator } from "@/i18n/translator";
import { errorPayload, LocalizedError, RunFailure } from "../errors";
import { translateRunError } from "./hints";
import { SolverError } from "./solver-client";
import { decodeRunError, encodeRunError, errorKind, mainPanel, runState, solvingDeadline, timeLimitOf } from "./run-state";

const created = new Date("2026-11-26T10:00:00Z");
const at = (seconds: number) => new Date(created.getTime() + seconds * 1000);
const run = (status: Parameters<typeof runState>[0]["status"], errorMessage: string | null = null) => ({ status, errorMessage, createdAt: created, timeLimitS: 20 });

describe("stan wersji planu", () => {
  it("REGRESJA: trwające generowanie (SOLVING) to stan „w toku”, a nie porażka", () => {
    const solving = runState(run("SOLVING"), at(5));
    expect(solving).toEqual({ phase: "solving", failure: null });
    expect(mainPanel({ view: solving, explicitRun: false, pendingHere: false })).toBe("generating");
    // także gdy użytkownik otworzył tę wersję wprost (?run=…) albo przełączył język w trakcie
    expect(mainPanel({ view: solving, explicitRun: true, pendingHere: false })).toBe("generating");
  });

  it("plan wykonalny bez dowodu optymalności to sukces", () => {
    expect(runState(run("FEASIBLE"))).toEqual({ phase: "success", failure: null });
    expect(runState(run("OPTIMAL"))).toEqual({ phase: "success", failure: null });
  });

  it("rozróżnia rodzaje porażek", () => {
    expect(runState(run("INFEASIBLE")).failure).toBe("infeasible");
    expect(runState(run("ERROR", "Solver: UNKNOWN")).failure).toBe("timeout");
    expect(runState(run("ERROR", "Solver: MODEL_INVALID")).failure).toBe("unexpected");
    expect(runState(run("ERROR", encodeRunError("solverUnreachable", { url: "http://x", error: "fetch failed" }))).failure).toBe("connection");
    expect(runState(run("ERROR", encodeRunError("solverTimeout", { ms: 50000 }))).failure).toBe("connection");
    expect(runState(run("ERROR", encodeRunError("solverStatus", { status: 503 }))).failure).toBe("connection");
    expect(runState(run("ERROR", encodeRunError("solverRejected", { status: 422, body: "" }))).failure).toBe("unexpected");
    expect(runState(run("ERROR", encodeRunError("unexpected", { message: "boom" }))).failure).toBe("unexpected");
    // komunikaty zapisane przez wcześniejsze wersje aplikacji
    expect(errorKind("Brak połączenia z solverem pod http://localhost:8000: TypeError: fetch failed")).toBe("connection");
    expect(errorKind("Przekroczono czas oczekiwania na solver (50000 ms)")).toBe("connection");
    expect(errorKind("coś innego")).toBe("unexpected");
    expect(errorKind(null)).toBe("unexpected");
  });

  it("przebieg, który nigdy się nie skończył (restart, przerwane żądanie), po terminie jest „przerwany”, a nie wiecznie w toku", () => {
    const deadline = solvingDeadline(created, 20);
    expect(runState(run("SOLVING"), new Date(deadline.getTime() - 1)).phase).toBe("solving");
    expect(runState(run("SOLVING"), new Date(deadline.getTime() + 1))).toEqual({ phase: "failed", failure: "interrupted" });
    expect(timeLimitOf({ time_limit_s: 60 })).toBe(60);
    expect(timeLimitOf(null)).toBe(20);
  });

  it("główny panel: brak wyniku ≠ porażka; wybrana starsza wersja zostaje widoczna w trakcie generowania nowej", () => {
    expect(mainPanel({ view: null, explicitRun: false, pendingHere: false })).toBe("empty");
    expect(mainPanel({ view: null, explicitRun: false, pendingHere: true })).toBe("generating");
    const ok = runState(run("FEASIBLE"));
    expect(mainPanel({ view: ok, explicitRun: false, pendingHere: false })).toBe("result");
    expect(mainPanel({ view: ok, explicitRun: false, pendingHere: true })).toBe("generating");
    expect(mainPanel({ view: ok, explicitRun: true, pendingHere: true })).toBe("result");
    expect(mainPanel({ view: runState(run("INFEASIBLE")), explicitRun: false, pendingHere: false })).toBe("failure");
  });
});

describe("zapis i tłumaczenie błędów przebiegu", () => {
  it("błąd zapisywany niezależnie od języka i tłumaczony przy wyświetleniu", () => {
    const err = new RunFailure(7, new SolverError("solverUnreachable", { url: "http://solver:8000", error: "fetch failed" }));
    const { key, values } = errorPayload(err);
    const stored = encodeRunError(key, values);
    expect(decodeRunError(stored)).toEqual({ key: "solverUnreachable", values: { url: "http://solver:8000", error: "fetch failed" } });
    expect(translateRunError(stored, translator("en"))).toBe("Can’t reach the scheduling engine at http://solver:8000: fetch failed");
    expect(translateRunError(stored, translator("pl"))).toBe("Brak połączenia z modułem planowania (http://solver:8000): fetch failed");
    expect(errorPayload(new Error("boom"))).toEqual({ key: "unexpected", values: { message: "boom" } });
    expect(errorPayload(new LocalizedError("planSolving")).key).toBe("planSolving");
    expect(decodeRunError("zwykły tekst")).toBeNull();
  });
});
