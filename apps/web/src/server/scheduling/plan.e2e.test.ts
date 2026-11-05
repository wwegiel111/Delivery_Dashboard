/**
 * E2E: baza po `SEED_DATE=2026-11-09 npm run db:seed` + działający solver (SOLVER_URL).
 *   npm run test:e2e -w apps/web
 */
import { prisma } from "@etpromo/db";
import { afterAll, describe, expect, it } from "vitest";
import { deleteRun, getRunView, runPlan } from "./plan";

const DATE = "2026-11-09";

describe(`plan przyjęć ${DATE} (seed: 20 aut)`, () => {
  afterAll(() => prisma.$disconnect());

  it("auta w godzinach pracy, poza przestojem i przerwami grup, bez nakładania, ostatni przyjazd i regał w terminie", async () => {
    const t0 = Date.now();
    const { runId, status } = await runPlan(DATE, { timeLimitS: 10 });
    expect(["OPTIMAL", "FEASIBLE"]).toContain(status);
    expect(Date.now() - t0).toBeLessThan(30_000);

    const view = (await getRunView(runId))!;
    expect(view.rows).toHaveLength(20);
    expect(view.staleReasons).toEqual([]);

    const closed = new Set(view.closedSlots.flatMap(([a, b]) => Array.from({ length: b - a }, (_, i) => a + i)));
    for (const r of view.rows) {
      expect(r.startSlot - r.arrivalSlot).toBe(view.setupSlots);
      for (let s = r.arrivalSlot; s < r.endSlot; s++) expect(closed.has(s), `${r.waybillNumber} w slocie ${s}`).toBe(false);
      expect(r.arrivalSlot).toBeLessThanOrEqual(view.latestArrivalSlot!);
    }
    // Każda grupa ma 2 przerwy w każdej zmianie, w jej granicach.
    expect(view.shifts).toHaveLength(2);
    for (let c = 1; c <= view.crews; c++)
      view.shifts.forEach(([a, b], k) => {
        const own = view.breaks.filter((x) => x.crew === c && x.shift === k);
        expect(own).toHaveLength(2);
        for (const x of own) {
          expect(x.start_slot).toBeGreaterThanOrEqual(a);
          expect(x.end_slot).toBeLessThanOrEqual(b);
        }
      });
    // Ta sama grupa / to samo stanowisko nigdy nie obsługuje dwóch aut naraz.
    for (const [key, span] of [
      ["crew", (r: (typeof view.rows)[number]) => [r.startSlot, r.endSlot]],
      ["dock", (r: (typeof view.rows)[number]) => [r.arrivalSlot, r.endSlot]],
    ] as const) {
      const groups = Map.groupBy(view.rows, (r) => r[key]);
      for (const [id, list] of groups.entries()) {
        const breaks = key === "crew" ? view.breaks.filter((b) => b.crew === id).map((b) => [b.start_slot, b.end_slot]) : [];
        const ivs = [...list.map(span), ...breaks].sort((a, b) => a[0]! - b[0]!);
        for (let i = 1; i < ivs.length; i++) expect(ivs[i]![0]).toBeGreaterThanOrEqual(ivs[i - 1]![1]!);
      }
    }
    // Bufor: odtworzenie poziomu z dopływu i odnoszenia.
    let level = 0;
    for (let t = 0; t < view.horizonSlots; t++) {
      expect(level + view.inflow[t]!).toBeLessThanOrEqual(view.bufferCapacity);
      expect(view.putaway[t]!).toBeLessThanOrEqual(closed.has(t) ? 0 : view.putawayPerSlot);
      level += view.inflow[t]! - view.putaway[t]!;
      expect(level).toBe(view.bufferLevel[t]);
      if (t >= view.putawayDeadlineSlot! - 1) expect(level, `palety w buforze po końcu zmiany (slot ${t})`).toBe(0);
    }
    console.info("KPI", view.kpis);
    expect(await deleteRun(runId)).toBe(DATE);
    expect(await getRunView(runId)).toBeNull();
  }, 60_000);
});
