"""Budowanie żądań dnia przyjęć + niezależna weryfikacja planu (bez modelu CP-SAT)."""

from __future__ import annotations

import math

from app.model import pallets_per_slot
from app.schemas import SolveRequest, SolveResponse

SLOT = 15
H = 96  # doba
OPEN_FROM, OPEN_TO = 6 * 4, 22 * 4  # 06:00–22:00


def unload_slots(pallets: int, full_truck_min: int = 60, full_truck_pallets: int = 33) -> int:
    return max(1, math.ceil(pallets * full_truck_min / full_truck_pallets / SLOT - 1e-9))


def truck(n: int, pallets: int = 33, release: int = OPEN_FROM, deadline: int | None = None, **kw) -> dict:
    return {
        "id": f"t{n}",
        "ref": f"LP/{n}",
        "pallets": pallets,
        "unload_slots": unload_slots(pallets),
        "release_slot": release,
        "deadline_slot": deadline,
        **kw,
    }


def request(trucks: list[dict], *, docks: int = 4, crews: int = 2, setup: int = 1, buffer: int = 35,
            putaway: int = 8, hours: bool = True, time_limit_s: float = 10, weights: dict | None = None,
            **extra) -> SolveRequest:
    return SolveRequest.model_validate({
        "horizon_start": "2026-11-09T00:00:00+01:00",
        "slot_minutes": SLOT,
        "horizon_slots": H,
        "time_limit_s": time_limit_s,
        "docks": docks,
        "crews": crews,
        "dock_setup_slots": setup,
        "buffer_capacity": buffer,
        "putaway_per_slot": putaway,
        "closed_slots": [[0, OPEN_FROM], [OPEN_TO, H]] if hours else [],
        "weights": weights or {},
        "trucks": trucks,
        **extra,
    })


def check_plan(req: SolveRequest, res: SolveResponse) -> None:
    """Odtwarza plan slot po slocie i sprawdza wszystkie ograniczenia twarde."""
    assert res.status in ("OPTIMAL", "FEASIBLE"), res.hints
    spec = {t.id: t for t in req.trucks}
    assert {p.id for p in res.trucks} == set(spec)
    closed = set()
    for a, b in req.closed_slots:
        closed.update(range(a, b))
    crews = [0] * req.horizon_slots
    docks = [0] * req.horizon_slots
    inflow = [0] * req.horizon_slots
    per_crew: dict[int, list[tuple[int, int]]] = {}
    per_dock: dict[int, list[tuple[int, int]]] = {}
    for p in res.trucks:
        t = spec[p.id]
        assert p.arrival_slot >= t.release_slot, f"{p.id} przed awizacją"
        assert p.unload_start_slot == p.arrival_slot + req.dock_setup_slots
        assert p.unload_end_slot - p.unload_start_slot == t.unload_slots
        if t.fixed_arrival_slot is not None:
            assert p.arrival_slot == t.fixed_arrival_slot
        assert not closed & set(range(p.arrival_slot, p.unload_end_slot)), f"{p.id} poza godzinami pracy"
        if req.latest_arrival_slot is not None:
            assert p.arrival_slot <= req.latest_arrival_slot, f"{p.id} przyjeżdża po najpóźniejszej godzinie"
        q = pallets_per_slot(t.pallets, t.unload_slots)
        for k, s in enumerate(range(p.unload_start_slot, p.unload_end_slot)):
            crews[s] += 1
            inflow[s] += q[k]
        for s in range(p.arrival_slot, p.unload_end_slot):
            docks[s] += 1
        per_crew.setdefault(p.crew, []).append((p.unload_start_slot, p.unload_end_slot))
        per_dock.setdefault(p.dock, []).append((p.arrival_slot, p.unload_end_slot))
    assert max(crews) <= req.crews and max(docks) <= req.docks
    # Przerwy: w każdej zmianie każda grupa ma dokładnie `breaks_per_shift` przerw, w zmianie, z odstępami.
    if req.breaks_per_shift and req.break_slots:
        for k, (a, b) in enumerate(req.shifts):
            for c in range(1, req.crews + 1):
                own = sorted((x for x in res.breaks if x.crew == c and x.shift == k), key=lambda x: x.start_slot)
                assert len(own) == req.breaks_per_shift
                for x in own:
                    assert x.end_slot - x.start_slot == req.break_slots
                    assert a + req.break_edge_slots <= x.start_slot and x.end_slot <= b - req.break_edge_slots
                for u, v in zip(own, own[1:]):
                    assert v.start_slot >= u.end_slot + req.break_gap_slots
                per_crew.setdefault(c, []).extend((x.start_slot, x.end_slot) for x in own)
    else:
        assert res.breaks == []
    for group in (per_crew, per_dock):  # przydział do konkretnej grupy / stanowiska bez nakładania
        for ivs in group.values():
            ivs.sort()
            for (_, e1), (s2, _) in zip(ivs, ivs[1:]):
                assert s2 >= e1
    assert max(per_crew) <= req.crews and max(per_dock) <= req.docks
    assert res.inflow == inflow
    level = 0
    for t in range(req.horizon_slots):
        assert 0 <= res.putaway[t] <= (0 if t in closed else req.putaway_per_slot)
        assert level + inflow[t] <= req.buffer_capacity, f"bufor przepełniony w slocie {t}"
        level = level + inflow[t] - res.putaway[t]
        assert level >= 0 and level == res.buffer_level[t]
        if req.putaway_deadline_slot is not None and t >= req.putaway_deadline_slot - 1:
            assert level == 0, f"palety w buforze po terminie odniesienia (slot {t})"
