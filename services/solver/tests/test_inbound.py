"""Plan przyjęć: grupy, stanowiska, bufor, godziny pracy, awizacje."""

import pytest

from app.model import pallets_per_slot, solve

from .factory import OPEN_FROM, OPEN_TO, check_plan, request, truck


def test_pallets_spread_evenly():
    assert pallets_per_slot(35, 4) == [9, 9, 9, 8]
    assert sum(pallets_per_slot(33, 4)) == 33


def test_two_crews_unload_at_most_two_trucks_at_once():
    req = request([truck(n) for n in range(4)], putaway=40)  # szybcy wózkowi: ogranicza tylko liczba grup
    res = solve(req)
    check_plan(req, res)
    starts = sorted(p.unload_start_slot for p in res.trucks)
    assert starts[0] == starts[1] == OPEN_FROM + 1  # dwa auta od razu po podstawieniu
    assert starts[2] >= starts[0] + 4  # kolejne po godzinie rozładunku
    assert res.kpis.crew_utilization == pytest.approx(1.0)


def test_buffer_of_one_truck_staggers_parallel_unloading_when_forklifts_are_slow():
    req = request([truck(1), truck(2)], putaway=6, buffer=35)
    res = solve(req)
    check_plan(req, res)
    a, b = sorted(res.trucks, key=lambda p: p.unload_start_slot)
    assert b.unload_start_slot > a.unload_start_slot  # nie mogą ruszyć razem — bufor by się przepełnił
    assert res.kpis.max_buffer <= 35


def test_four_docks_let_next_truck_wait_docked():
    """Podstawienie zajmuje stanowisko, ale nie grupę — następne auto czeka na stanowisku."""
    req = request([truck(n) for n in range(6)], putaway=40, setup=1)
    res = solve(req)
    check_plan(req, res)
    by_crew = {}
    for p in res.trucks:
        by_crew.setdefault(p.crew, []).append(p)
    for plans in by_crew.values():
        plans.sort(key=lambda p: p.unload_start_slot)
        for prev, nxt in zip(plans, plans[1:]):
            assert nxt.unload_start_slot == prev.unload_end_slot  # grupa bez przestoju
            assert nxt.arrival_slot < prev.unload_end_slot  # auto podstawione wcześniej


def test_single_dock_serialises_everything():
    req = request([truck(n) for n in range(3)], docks=1, putaway=40)
    res = solve(req)
    check_plan(req, res)


def test_release_and_working_hours_respected():
    req = request([truck(1, release=OPEN_FROM + 20), truck(2, release=0)])
    res = solve(req)
    check_plan(req, res)
    p = {x.id: x for x in res.trucks}
    assert p["t1"].arrival_slot >= OPEN_FROM + 20
    assert p["t2"].arrival_slot >= OPEN_FROM  # awizacja przed otwarciem → najwcześniej 06:00


def test_fixed_arrival_is_kept():
    req = request([truck(1, fixed_arrival_slot=40), truck(2)])
    res = solve(req)
    check_plan(req, res)
    assert next(p for p in res.trucks if p.id == "t1").arrival_slot == 40


def test_hard_deadline_is_relaxed_with_report():
    req = request([truck(n, deadline=OPEN_FROM + 5, hard_deadline=True) for n in range(4)], putaway=40)
    res = solve(req)
    check_plan(req, res)
    assert res.relaxed is True
    assert res.kpis.late_trucks >= 2
    assert any(h.truck_id for h in res.hints)


def test_truck_larger_than_buffer_is_rejected():
    res = solve(request([truck(1, pallets=40)], buffer=35))
    assert res.status == "INFEASIBLE"
    assert "buforze" in res.hints[0].reason


def test_truck_that_cannot_fit_in_working_hours():
    res = solve(request([truck(1, release=OPEN_TO - 2)]))
    assert res.status == "INFEASIBLE"
    assert res.hints[0].truck_id == "t1"


def test_too_many_trucks_for_one_day_is_infeasible_with_hint():
    # 2 grupy × 16 h = 32 rozładunki po 1 h; 36 aut się nie zmieści
    res = solve(request([truck(n) for n in range(36)], putaway=40, time_limit_s=5))
    assert res.status in ("INFEASIBLE", "UNKNOWN")
    assert res.hints


def _day(n=14):
    return [truck(i, pallets=30 + i % 6, release=OPEN_FROM + (i % 4) * 4, deadline=OPEN_TO) for i in range(n)]


def test_slow_forklifts_are_the_bottleneck_and_plan_hits_the_lower_bound():
    """14 aut, wózkowi 8 palet / 15 min: odnoszenie (32 pal./h) ogranicza przepływ, nie grupy (2 × 33 pal./h)."""
    trucks = _day()
    req = request(trucks, putaway=8, time_limit_s=10)
    res = solve(req)
    check_plan(req, res)
    assert res.kpis.late_trucks == 0
    first_inflow = min(p.unload_start_slot for p in res.trucks)
    lower_bound = first_inflow + -(-sum(t["pallets"] for t in trucks) // 8)  # ceil
    assert res.kpis.all_putaway_slot <= lower_bound + 1
    assert res.wall_time_ms < 15_000


def test_fast_forklifts_keep_both_crews_busy():
    """Gdy wózkowi nadążają (18 palet / 15 min), obie grupy pracują prawie bez przestojów."""
    req = request(_day(), putaway=18, time_limit_s=10)
    res = solve(req)
    check_plan(req, res)
    assert res.kpis.crew_utilization >= 0.85


# --- zmiany, przerwy, przestój zmiany zmian, najpóźniejszy przyjazd, bufor pusty przed końcem zmiany ---
# Slot 5 min: doba = 288 slotów; 06:00 = 72, 14:00 = 168, 14:20 = 172, 20:00 = 240, 22:00 = 264.
S5 = dict(slot_minutes=5, horizon_slots=288)
SHIFTS = [[72, 168], [172, 264]]
DAY5 = dict(
    S5,
    closed_slots=[[0, 72], [168, 172], [264, 288]],
    shifts=SHIFTS,
    breaks_per_shift=2,
    break_slots=3,
    break_edge_slots=12,
    break_gap_slots=24,
    latest_arrival_slot=240,
    putaway_deadline_slot=264,
)


def truck5(n: int, pallets: int = 35, release: int = 72, **kw) -> dict:
    import math

    return {"id": f"t{n}", "ref": f"LP/{n}", "pallets": pallets, "unload_slots": max(1, math.ceil(pallets * 12 / 35 - 1e-9)),
            "release_slot": release, "deadline_slot": None, **kw}


def req5(trucks, **kw):
    from app.schemas import SolveRequest

    base = request([], crews=2, setup=4, buffer=140, putaway=8, time_limit_s=20).model_dump()
    base.update(DAY5)
    base.update(kw)
    base["trucks"] = trucks
    return SolveRequest.model_validate(base)


def test_each_crew_gets_two_breaks_per_shift_and_unloads_avoid_them():
    req = req5([truck5(n) for n in range(16)])
    res = solve(req)
    check_plan(req, res)  # m.in. przerwy grupy nie nachodzą na jej rozładunki
    assert len(res.breaks) == 2 * 2 * 2


def test_shift_change_downtime_has_no_unloading():
    req = req5([truck5(n) for n in range(18)])
    res = solve(req)
    check_plan(req, res)
    for p in res.trucks:
        assert p.unload_end_slot <= 168 or p.arrival_slot >= 172


def test_latest_arrival_and_rack_before_shift_end():
    req = req5([truck5(1, release=230), truck5(2, release=200)])
    res = solve(req)
    check_plan(req, res)
    assert max(p.arrival_slot for p in res.trucks) <= 240
    assert res.kpis.all_putaway_slot <= 264
    # Awizacja po 20:00 — auto nie może przyjechać.
    bad = solve(req5([truck5(1, release=245)]))
    assert bad.status == "INFEASIBLE" and bad.hints[0].truck_id == "t1"


def test_too_much_for_one_day_is_infeasible():
    res = solve(req5([truck5(n) for n in range(32)], time_limit_s=10))
    assert res.status == "INFEASIBLE"
