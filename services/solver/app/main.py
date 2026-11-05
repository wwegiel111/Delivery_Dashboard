"""FastAPI: POST /solve, GET /healthz."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool

from .model import solve
from .schemas import SolveRequest, SolveResponse

app = FastAPI(title="ETPromo solver", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/solve", response_model=SolveResponse)
async def solve_endpoint(req: SolveRequest) -> SolveResponse:
    # CP-SAT blokuje wątek na czas time_limit_s — nie blokujemy pętli zdarzeń.
    return await run_in_threadpool(solve, req)
