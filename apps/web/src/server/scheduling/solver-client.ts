import { SolveResponse, type SolveRequest } from "@etpromo/contracts";

export class SolverError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
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
        if (res.status < 500) throw new SolverError(`Solver odrzucił żądanie (${res.status}): ${body.slice(0, 500)}`, res.status);
        throw new SolverError(`Solver zwrócił ${res.status}`, res.status);
      }
      return SolveResponse.parse(await res.json());
    } catch (err) {
      lastError = err;
      const retryable = !(err instanceof SolverError && err.status !== undefined && err.status < 500) && !(err instanceof Error && err.name === "TimeoutError");
      if (!retryable || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (lastError instanceof Error && lastError.name === "TimeoutError") throw new SolverError(`Przekroczono czas oczekiwania na solver (${timeoutMs} ms)`);
  if (lastError instanceof SolverError) throw lastError;
  throw new SolverError(`Brak połączenia z solverem pod ${base}: ${String(lastError)}`);
}
