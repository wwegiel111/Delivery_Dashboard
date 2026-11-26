import { SolveResponse, type SolveRequest } from "@etpromo/contracts";
import { LocalizedError, type ErrorKey, type ErrorValues } from "../errors";

/** Błąd komunikacji z solverem (komunikat tłumaczony w warstwie HTTP). */
export class SolverError extends LocalizedError {
  constructor(
    key: ErrorKey,
    values: ErrorValues = {},
    readonly status?: number,
  ) {
    super(key, values);
    this.name = "SolverError";
  }
}

/** Wywołanie POST /solve mikroserwisu. Timeout = limit solvera + zapas na sieć i budowę modelu. */
export async function callSolver(req: SolveRequest): Promise<SolveResponse> {
  const base = process.env.SOLVER_URL ?? "http://localhost:8000";
  const timeoutMs = Number(process.env.SOLVER_TIMEOUT_MS ?? req.time_limit_s * 1000 + 30_000);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${base}/solve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.text();
        // 4xx = błąd kontraktu, ponawianie nic nie da.
        if (res.status < 500) throw new SolverError("solverRejected", { status: res.status, body: body.slice(0, 500) }, res.status);
        throw new SolverError("solverStatus", { status: res.status }, res.status);
      }
      return SolveResponse.parse(await res.json());
    } catch (err) {
      lastError = err;
      const retryable = !(err instanceof SolverError && err.status !== undefined && err.status < 500) && !(err instanceof Error && err.name === "TimeoutError");
      if (!retryable || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (lastError instanceof Error && lastError.name === "TimeoutError") throw new SolverError("solverTimeout", { ms: timeoutMs });
  if (lastError instanceof SolverError) throw lastError;
  throw new SolverError("solverUnreachable", { url: base, error: String(lastError) });
}
