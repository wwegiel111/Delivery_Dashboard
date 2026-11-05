"""Modele Pydantic: lustro kontraktu z packages/contracts/src/solve.ts.

Źródłem prawdy jest plik zod; tests/test_contract.py porównuje kształty z app/contract.schema.json.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SolveStatus = Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN", "MODEL_INVALID"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TruckSpec(_Strict):
    id: str
    ref: str
    pallets: int = Field(gt=0)
    unload_slots: int = Field(gt=0)
    release_slot: int = Field(ge=0)
    deadline_slot: int | None = Field(default=None, ge=0)
    hard_deadline: bool = False
    priority: int = Field(default=5, ge=1, le=10)
    fixed_arrival_slot: int | None = Field(default=None, ge=0)


class Weights(_Strict):
    tardiness: int = Field(default=1000, ge=0)
    makespan: int = Field(default=50, ge=0)
    flow: int = Field(default=5, ge=0)
    buffer: int = Field(default=10, ge=0)


class SolveRequest(_Strict):
    horizon_start: str
    slot_minutes: int = Field(gt=0)
    horizon_slots: int = Field(gt=0)
    time_limit_s: float = Field(default=20, gt=0, le=600)
    docks: int = Field(gt=0)
    crews: int = Field(gt=0)
    dock_setup_slots: int = Field(ge=0)
    buffer_capacity: int = Field(gt=0)
    putaway_per_slot: int = Field(gt=0)
    closed_slots: list[tuple[int, int]] = Field(default_factory=list)
    latest_arrival_slot: int | None = Field(default=None, ge=0)
    putaway_deadline_slot: int | None = Field(default=None, ge=0)
    shifts: list[tuple[int, int]] = Field(default_factory=list)
    breaks_per_shift: int = Field(default=0, ge=0)
    break_slots: int = Field(default=0, ge=0)
    break_edge_slots: int = Field(default=0, ge=0)
    break_gap_slots: int = Field(default=0, ge=0)
    weights: Weights = Field(default_factory=Weights)
    trucks: list[TruckSpec]


class TruckPlan(_Strict):
    id: str
    arrival_slot: int
    unload_start_slot: int
    unload_end_slot: int
    dock: int
    crew: int
    late_by_slots: int


class CrewBreak(_Strict):
    crew: int
    shift: int
    start_slot: int
    end_slot: int


class Hint(_Strict):
    truck_id: str | None
    reason: str


class SolveKpis(_Strict):
    trucks: int
    first_arrival_slot: int
    last_unload_end_slot: int
    all_putaway_slot: int
    crew_utilization: float
    max_buffer: int
    total_tardiness_slots: int
    late_trucks: int


class SolveResponse(_Strict):
    status: SolveStatus
    relaxed: bool = False
    objective: float | None = None
    wall_time_ms: int = 0
    trucks: list[TruckPlan] = Field(default_factory=list)
    breaks: list[CrewBreak] = Field(default_factory=list)
    inflow: list[int] = Field(default_factory=list)
    putaway: list[int] = Field(default_factory=list)
    buffer_level: list[int] = Field(default_factory=list)
    kpis: SolveKpis | None = None
    hints: list[Hint] = Field(default_factory=list)
