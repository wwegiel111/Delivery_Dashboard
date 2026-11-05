"""Model CP-SAT: dzienny plan przyjęć dostaw.

Przepływ: przyjazd + podstawienie na stanowisko → rozładunek przez grupę na wspólny bufor
→ wózkowi odnoszą palety z bufora na regał.

Model indeksowany czasem (slot = 5 min):
  x[i,a]   = 1, gdy auto i przyjeżdża w slocie a (tylko sloty, w których całe podstawienie
             i rozładunek mieszczą się w godzinach pracy, poza przestojem zmiany zmian,
             nie przed awizacją i nie po najpóźniejszej godzinie przyjazdu),
  grupy    : y[i,c] = 1, gdy auto i rozładowuje grupa c; na każdej grupie NoOverlap(jej rozładunki
             + jej przerwy); w każdej zmianie każda grupa ma `breaks_per_shift` przerw, których
             położenie wybiera solver (z odstępem od brzegów zmiany i między przerwami),
  stanowiska: cumulative([przyjazd, koniec rozładunku)) ≤ liczba stanowisk,
  bufor    : poziom[t] = poziom[t-1] + dopływ[t] − odniesione[t],
             poziom[t-1] + dopływ[t] ≤ pojemność  (dopływ = palety rozkładane równo na sloty rozładunku),
             odniesione[t] ≤ wydajność wózkowych (0 poza godzinami pracy),
             poziom = 0 od `putaway_deadline_slot` (wszystko na regale przed końcem zmiany).

Cel: tardiness·Σ(priorytet·opóźnienie) + makespan·koniec ostatniego rozładunku
     + flow·Σ(końce rozładunków) + buffer·Σ(poziom bufora).
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass

from ortools.sat.python import cp_model

from .schemas import CrewBreak, Hint, SolveKpis, SolveRequest, SolveResponse, TruckPlan, TruckSpec

_STATUS = {
    cp_model.OPTIMAL: "OPTIMAL",
    cp_model.FEASIBLE: "FEASIBLE",
    cp_model.INFEASIBLE: "INFEASIBLE",
    cp_model.MODEL_INVALID: "MODEL_INVALID",
    cp_model.UNKNOWN: "UNKNOWN",
}


def open_mask(req: SolveRequest) -> list[bool]:
    mask = [True] * req.horizon_slots
    for a, b in req.closed_slots:
        for t in range(max(0, a), min(req.horizon_slots, b)):
            mask[t] = False
    return mask


def pallets_per_slot(pallets: int, slots: int) -> list[int]:
    """Równy rozkład palet na sloty rozładunku (reszta na początku): 35 / 4 → [9, 9, 9, 8]."""
    base, rest = divmod(pallets, slots)
    return [base + (1 if k < rest else 0) for k in range(slots)]


def valid_arrivals(truck: TruckSpec, req: SolveRequest, mask: list[bool]) -> list[int]:
    S, D, H = req.dock_setup_slots, truck.unload_slots, req.horizon_slots
    candidates = [truck.fixed_arrival_slot] if truck.fixed_arrival_slot is not None else range(truck.release_slot, H)
    out = []
    for a in candidates:
        end = a + S + D
        if a < truck.release_slot or end > H:
            continue
        if req.latest_arrival_slot is not None and a > req.latest_arrival_slot:
            continue
        if req.putaway_deadline_slot is not None and end > req.putaway_deadline_slot:
            continue
        if all(mask[t] for t in range(a, end)):
            out.append(a)
    return out


@dataclass
class _Built:
    model: cp_model.CpModel
    x: dict[str, dict[int, cp_model.IntVar]]
    start: dict[str, cp_model.LinearExpr]
    late: dict[str, cp_model.IntVar]
    crew_of: dict[str, list[cp_model.IntVar]]
    breaks: list[tuple[int, int, cp_model.IntVar]]
    out: list[cp_model.IntVar]
    level: list[cp_model.IntVar]
    makespan: cp_model.IntVar


def validate(req: SolveRequest) -> tuple[list[Hint], dict[str, list[int]]]:
    hints: list[Hint] = []
    ids = [t.id for t in req.trucks]
    if len(set(ids)) != len(ids):
        raise ValueError("Zduplikowane identyfikatory aut")
    mask = open_mask(req)
    arrivals: dict[str, list[int]] = {}
    for t in req.trucks:
        if t.pallets > req.buffer_capacity:
            hints.append(Hint(truck_id=t.id, reason=f"{t.pallets} palet nie zmieści się w buforze ({req.buffer_capacity})"))
        arr = valid_arrivals(t, req, mask)
        if not arr:
            reason = (
                "ustalona godzina przyjazdu wypada poza godzinami pracy lub przed awizacją"
                if t.fixed_arrival_slot is not None
                else "rozładunek nie mieści się w godzinach pracy po godzinie awizacji (lub awizacja po najpóźniejszym przyjeździe)"
            )
            hints.append(Hint(truck_id=t.id, reason=reason))
        arrivals[t.id] = arr
    if req.breaks_per_shift and req.break_slots:
        n, L, e, g = req.breaks_per_shift, req.break_slots, req.break_edge_slots, req.break_gap_slots
        for k, (a, b) in enumerate(req.shifts):
            if n * L + (n - 1) * g > (b - a) - 2 * e:
                hints.append(Hint(truck_id=None, reason=f"zmiana {k + 1}: {n} przerw(y) nie mieszczą się w zmianie przy podanych odstępach"))
    return hints, arrivals


def _build(req: SolveRequest, arrivals: dict[str, list[int]], relax: bool) -> _Built:
    m = cp_model.CpModel()
    H, S, B = req.horizon_slots, req.dock_setup_slots, req.buffer_capacity
    mask = open_mask(req)

    x: dict[str, dict[int, cp_model.IntVar]] = {}
    start: dict[str, cp_model.LinearExpr] = {}
    late: dict[str, cp_model.IntVar] = {}
    C = req.crews
    crew_iv, dock_iv, ends = [], [], []
    per_crew: list[list[cp_model.IntervalVar]] = [[] for _ in range(C)]
    crew_of: dict[str, list[cp_model.IntVar]] = {}
    inflow_terms: list[list[tuple[cp_model.IntVar, int]]] = [[] for _ in range(H)]

    for t in req.trucks:
        D = t.unload_slots
        xs = {a: m.NewBoolVar(f"x[{t.id},{a}]") for a in arrivals[t.id]}
        m.AddExactlyOne(xs.values())
        x[t.id] = xs
        arr = arrivals[t.id]
        a_var = m.NewIntVarFromDomain(cp_model.Domain.FromValues(arr), f"arrival[{t.id}]")
        m.Add(a_var == sum(a * v for a, v in xs.items()))
        s_expr = a_var + S
        start[t.id] = s_expr
        crew_iv.append(m.NewIntervalVar(s_expr, D, a_var + S + D, f"unload[{t.id}]"))
        ys = [m.NewBoolVar(f"y[{t.id},{c}]") for c in range(C)]
        m.AddExactlyOne(ys)
        crew_of[t.id] = ys
        for c, y in enumerate(ys):
            per_crew[c].append(m.NewOptionalIntervalVar(s_expr, D, a_var + S + D, y, f"unload[{t.id},{c}]"))
        dock_iv.append(m.NewIntervalVar(a_var, S + D, a_var + S + D, f"dock[{t.id}]"))
        end = a_var + S + D
        ends.append(end)
        if t.deadline_slot is not None:
            if t.hard_deadline and not relax:
                m.Add(end <= t.deadline_slot)
            lt = m.NewIntVar(0, H, f"late[{t.id}]")
            m.Add(lt >= end - t.deadline_slot)
            late[t.id] = lt
        q = pallets_per_slot(t.pallets, D)
        for a, v in xs.items():
            for k in range(D):
                inflow_terms[a + S + k].append((v, q[k]))

    # Auta nierozróżnialne (te same palety, okno, priorytet) — ustalona kolejność przyjazdów usuwa symetrię.
    twins: dict[tuple, list[str]] = {}
    for t in req.trucks:
        if t.fixed_arrival_slot is None:
            twins.setdefault((t.pallets, t.unload_slots, t.release_slot, t.deadline_slot, t.hard_deadline, t.priority), []).append(t.id)
    for ids in twins.values():
        for u, v in zip(ids, ids[1:]):
            m.Add(start[u] <= start[v])

    # Przerwy: każda grupa, każda zmiana, `breaks_per_shift` przerw — położenie wybiera solver.
    breaks: list[tuple[int, int, cp_model.IntVar]] = []
    if req.breaks_per_shift and req.break_slots:
        n, L, e, g = req.breaks_per_shift, req.break_slots, req.break_edge_slots, req.break_gap_slots
        for k, (a, b) in enumerate(req.shifts):
            for c in range(C):
                prev_b = None
                for j in range(n):
                    lo = a + e + j * (L + g)
                    hi = b - e - L - (n - 1 - j) * (L + g)
                    st = m.NewIntVar(lo, hi, f"break[{k},{c},{j}]")
                    per_crew[c].append(m.NewIntervalVar(st, L, st + L, f"break_iv[{k},{c},{j}]"))
                    if prev_b is not None:
                        m.Add(st >= prev_b + L + g)
                    prev_b = st
                    breaks.append((c, k, st))
        # Grupy są wymienne — porządek pierwszych przerw usuwa symetrię.
        firsts = [st for c, k, st in breaks if k == 0][:: n]
        for u, v in zip(firsts, firsts[1:]):
            m.Add(u <= v)

    for c in range(C):
        m.AddNoOverlap(per_crew[c])
    m.AddCumulative(crew_iv, [1] * len(crew_iv), C)
    m.AddCumulative(dock_iv, [1] * len(dock_iv), req.docks)

    out: list[cp_model.IntVar] = []
    level: list[cp_model.IntVar] = []
    prev: cp_model.LinearExpr | int = 0
    for t in range(H):
        inflow = sum(v * q for v, q in inflow_terms[t]) if inflow_terms[t] else 0
        o = m.NewIntVar(0, req.putaway_per_slot if mask[t] else 0, f"out[{t}]")
        lv = m.NewIntVar(0, B, f"level[{t}]")
        m.Add(prev + inflow <= B)
        m.Add(lv == prev + inflow - o)
        if req.putaway_deadline_slot is not None and t >= req.putaway_deadline_slot - 1:
            m.Add(lv == 0)
        out.append(o)
        level.append(lv)
        prev = lv

    makespan = m.NewIntVar(0, H, "makespan")
    for e in ends:
        m.Add(makespan >= e)

    w = req.weights
    prio = {t.id: t.priority for t in req.trucks}
    m.Minimize(
        w.tardiness * sum(prio[i] * v for i, v in late.items())
        + w.makespan * makespan
        + w.flow * sum(ends)
        + w.buffer * sum(level)
    )
    return _Built(m, x, start, late, crew_of, breaks, out, level, makespan)


def _assign(intervals: list[tuple[int, int, str]], capacity: int) -> dict[str, int]:
    """Przydział do konkretnych stanowisk / grup: kolorowanie grafu przedziałów (optymalne dla przedziałów)."""
    free_at = [0] * capacity
    out: dict[str, int] = {}
    for s, e, key in sorted(intervals):
        k = next(i for i in range(capacity) if free_at[i] <= s)
        free_at[k] = e
        out[key] = k + 1
    return out


def solve(req: SolveRequest) -> SolveResponse:
    t0 = time.perf_counter()
    ms = lambda: int((time.perf_counter() - t0) * 1000)  # noqa: E731
    try:
        pre, arrivals = validate(req)
    except ValueError as exc:
        return SolveResponse(status="MODEL_INVALID", wall_time_ms=ms(), hints=[Hint(truck_id=None, reason=str(exc))])
    if pre:
        return SolveResponse(status="INFEASIBLE", wall_time_ms=ms(), hints=pre)
    if not req.trucks:
        return SolveResponse(status="OPTIMAL", wall_time_ms=ms(), hints=[Hint(truck_id=None, reason="brak aut do zaplanowania")])

    def run(relax: bool):
        built = _build(req, arrivals, relax)
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = req.time_limit_s
        solver.parameters.num_search_workers = int(os.environ.get("SOLVER_WORKERS", "8"))
        solver.parameters.log_search_progress = os.environ.get("SOLVER_LOG_SEARCH") == "1"
        return built, solver, solver.Solve(built.model)

    relaxed = False
    built, solver, status = run(False)
    if status == cp_model.INFEASIBLE and any(t.hard_deadline for t in req.trucks):
        relaxed = True
        built, solver, status = run(True)

    name = _STATUS.get(status, "UNKNOWN")
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        reason = (
            "Nie da się przyjąć wszystkich aut w godzinach pracy (z przerwami grup, przestojem zmiany zmian i odniesieniem "
            "wszystkiego na regał przed końcem zmiany) — przenieś część dostaw na inny dzień lub dodaj grupę"
            if status == cp_model.INFEASIBLE
            else "Nie znaleziono planu w limicie czasu — zwiększ limit solvera"
        )
        return SolveResponse(status=name, relaxed=relaxed, wall_time_ms=ms(), hints=[Hint(truck_id=None, reason=reason)])

    S = req.dock_setup_slots
    plans: dict[str, dict] = {}
    for t in req.trucks:
        a = next(a for a, v in built.x[t.id].items() if solver.Value(v))
        s, e = a + S, a + S + t.unload_slots
        plans[t.id] = {"arrival": a, "start": s, "end": e, "late": max(0, e - t.deadline_slot) if t.deadline_slot is not None else 0}

    crews = {i: next(c + 1 for c, y in enumerate(built.crew_of[i]) if solver.Value(y)) for i in plans}
    docks = _assign([(p["arrival"], p["end"], i) for i, p in plans.items()], req.docks)
    trucks = [
        TruckPlan(
            id=i,
            arrival_slot=p["arrival"],
            unload_start_slot=p["start"],
            unload_end_slot=p["end"],
            dock=docks[i],
            crew=crews[i],
            late_by_slots=p["late"],
        )
        for i, p in sorted(plans.items(), key=lambda kv: (kv[1]["arrival"], kv[0]))
    ]

    H = req.horizon_slots
    inflow = [0] * H
    for t in req.trucks:
        q = pallets_per_slot(t.pallets, t.unload_slots)
        for k in range(t.unload_slots):
            inflow[plans[t.id]["start"] + k] += q[k]
    putaway = [solver.Value(v) for v in built.out]
    level = [solver.Value(v) for v in built.level]

    breaks = sorted(
        (CrewBreak(crew=c + 1, shift=k, start_slot=solver.Value(st), end_slot=solver.Value(st) + req.break_slots) for c, k, st in built.breaks),
        key=lambda b: (b.start_slot, b.crew),
    )
    busy = sum(t.unload_slots for t in req.trucks)
    first = min(p["start"] for p in plans.values())
    last = max(p["end"] for p in plans.values())
    # Czas pracy grup między pierwszym a ostatnim rozładunkiem bez przestojów i ich przerw.
    mask = open_mask(req)
    available = req.crews * sum(1 for t in range(first, last) if mask[t]) - sum(
        max(0, min(b.end_slot, last) - max(b.start_slot, first)) for b in breaks
    )
    nonempty = [i for i, lv in enumerate(level) if lv > 0]
    late_vals = [p["late"] for p in plans.values()]
    kpis = SolveKpis(
        trucks=len(trucks),
        first_arrival_slot=min(p["arrival"] for p in plans.values()),
        last_unload_end_slot=last,
        all_putaway_slot=(nonempty[-1] + 1) if nonempty else last,
        crew_utilization=round(busy / max(1, available), 4),
        max_buffer=max(lv + inc for lv, inc in zip([0] + level[:-1], inflow)),
        total_tardiness_slots=sum(late_vals),
        late_trucks=sum(1 for v in late_vals if v > 0),
    )
    hints = [Hint(truck_id=p.id, reason=f"rozładunek kończy się {p.late_by_slots} slot(y) po terminie awizacji") for p in trucks if p.late_by_slots > 0]
    if level and level[-1] > 0:
        hints.append(Hint(truck_id=None, reason=f"{level[-1]} palet zostaje w buforze po godzinach pracy"))
    return SolveResponse(
        status=name,
        relaxed=relaxed,
        objective=solver.ObjectiveValue(),
        wall_time_ms=ms(),
        trucks=trucks,
        breaks=breaks,
        inflow=inflow,
        putaway=putaway,
        buffer_level=level,
        kpis=kpis,
        hints=hints,
    )
