/** Planowanie dnia przyjęć: baza → solver → zapis przydziałów; odczyt planu dla UI i raportu. */
import { localDayStart, slotToDate, SolveRequest, SolveResponse } from "@etpromo/contracts";
import { prisma, type RunStatus, type SchedulingParams } from "@etpromo/db";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { translator } from "@/i18n/translator";
import { LocalizedError, RunFailure, errorPayload } from "../errors";
import { translateRunError } from "./hints";
import { encodeRunError, runState, solvingDeadline, timeLimitOf, type FailureKind, type RunPhase } from "./run-state";
import type { PlanRow, ReportMeta } from "../report/report";
import { buildRequest } from "./derive";
import { callSolver } from "./solver-client";

export async function getActiveParams(): Promise<SchedulingParams> {
  const p = await prisma.schedulingParams.findFirst({ where: { isActive: true }, orderBy: { version: "desc" } });
  if (!p) throw new LocalizedError("noActiveParams");
  return p;
}

export async function activeDocks() {
  return prisma.dock.findMany({ where: { isActive: true }, orderBy: { number: "asc" } });
}

const dateCol = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

export async function deliveriesForDate(isoDate: string) {
  return prisma.delivery.findMany({ where: { deliveryDate: dateCol(isoDate), status: "PLANNED" }, orderBy: [{ windowFrom: "asc" }, { waybillNumber: "asc" }] });
}

export interface RunResult {
  runId: number;
  status: RunStatus;
  hints: { truck_id: string | null; reason: string }[];
}

export async function runPlan(isoDate: string, opts: { timeLimitS?: number } = {}): Promise<RunResult> {
  const [params, docks, deliveries] = await Promise.all([getActiveParams(), activeDocks(), deliveriesForDate(isoDate)]);
  if (docks.length === 0) throw new LocalizedError("noActiveDocks");
  const dayStart = localDayStart(isoDate, params.timezone);
  const request = buildRequest({ dayStart, params, docks: docks.length, deliveries, timeLimitS: opts.timeLimitS });

  // Jedno generowanie naraz dla dnia: trwający (nieprzerwany) przebieg blokuje kolejny — np. z drugiej karty.
  const running = await prisma.scheduleRun.findFirst({
    where: { planDate: dateCol(isoDate), status: "SOLVING" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, requestPayload: true },
  });
  if (running && new Date() <= solvingDeadline(running.createdAt, timeLimitOf(running.requestPayload))) throw new LocalizedError("planSolving");

  const run = await prisma.scheduleRun.create({
    data: { planDate: dateCol(isoDate), horizonStart: dayStart, status: "SOLVING", paramsId: params.id, requestPayload: request as object },
  });
  try {
    const res = await callSolver(request);
    const status: RunStatus = res.status === "OPTIMAL" || res.status === "FEASIBLE" || res.status === "INFEASIBLE" ? res.status : "ERROR";
    const update = {
      status,
      relaxed: res.relaxed,
      objectiveValue: res.objective,
      wallTimeMs: res.wall_time_ms,
      kpis: res.kpis ?? undefined,
      hints: res.hints,
      responsePayload: res as object,
      errorMessage: status === "ERROR" ? `Solver: ${res.status}` : null,
    };
    const ok = status === "OPTIMAL" || status === "FEASIBLE";
    const at = (slot: number) => slotToDate(dayStart, slot, request.slot_minutes);
    await prisma.$transaction([
      ...(ok
        ? [
            prisma.scheduleAssignment.createMany({
              data: res.trucks.map((t) => ({
                runId: run.id,
                deliveryId: Number(t.id),
                dockId: docks[t.dock - 1]!.id,
                crew: t.crew,
                arrivalAt: at(t.arrival_slot),
                unloadStartAt: at(t.unload_start_slot),
                unloadEndAt: at(t.unload_end_slot),
                arrivalSlot: t.arrival_slot,
                startSlot: t.unload_start_slot,
                endSlot: t.unload_end_slot,
                lateBySlots: t.late_by_slots,
              })),
            }),
          ]
        : []),
      prisma.scheduleRun.update({ where: { id: run.id }, data: update }),
    ]);
    return { runId: run.id, status, hints: res.hints };
  } catch (err) {
    // Zapis niezależny od języka (klucz + wartości) — interfejs przetłumaczy go i rozpozna rodzaj błędu.
    const { key, values } = errorPayload(err);
    await prisma.scheduleRun.update({ where: { id: run.id }, data: { status: "ERROR", errorMessage: encodeRunError(key, values) } });
    throw new RunFailure(run.id, err);
  }
}

export interface RunListItem {
  id: number;
  status: RunStatus;
  createdAt: Date;
  phase: RunPhase;
  failure: FailureKind | null;
}

export async function listRuns(isoDate: string): Promise<RunListItem[]> {
  const runs = await prisma.scheduleRun.findMany({
    where: { planDate: dateCol(isoDate) },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, status: true, createdAt: true, errorMessage: true, requestPayload: true },
  });
  return runs.map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    ...runState({ status: r.status, errorMessage: r.errorMessage, createdAt: r.createdAt, timeLimitS: timeLimitOf(r.requestPayload) }),
  }));
}

/** Usuwa wersję planu (przydziały kasowane kaskadowo). Zwraca datę planu. */
export async function deleteRun(runId: number): Promise<string | null> {
  const run = await prisma.scheduleRun.findUnique({
    where: { id: runId },
    select: { planDate: true, status: true, errorMessage: true, createdAt: true, requestPayload: true },
  });
  if (!run) return null;
  // Trwające generowanie chronimy; przerwane (po terminie) można usunąć.
  const { phase } = runState({ status: run.status, errorMessage: run.errorMessage, createdAt: run.createdAt, timeLimitS: timeLimitOf(run.requestPayload) });
  if (phase === "solving") throw new LocalizedError("planSolving");
  await prisma.scheduleRun.delete({ where: { id: runId } });
  return run.planDate.toISOString().slice(0, 10);
}

/** Dni tygodnia (pon–nd) zawierającego datę, RRRR-MM-DD. */
export function weekDays(isoDate: string): string[] {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const monday = d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * 86_400_000).toISOString().slice(0, 10));
}

export interface WeekDay {
  date: string;
  trucks: number;
  pallets: number;
  run: {
    id: number;
    status: RunStatus;
    phase: RunPhase;
    failure: FailureKind | null;
    lastEndSlot: number | null;
    slotMinutes: number;
    horizonStart: string;
    stale: boolean;
  } | null;
}

/** Podsumowanie tygodnia: dostawy i najnowszy plan każdego dnia. */
export async function weekOverview(isoDate: string): Promise<WeekDay[]> {
  const days = weekDays(isoDate);
  const [deliveries, runs] = await Promise.all([
    prisma.delivery.findMany({
      where: { deliveryDate: { in: days.map(dateCol) }, status: "PLANNED" },
      select: { deliveryDate: true, pallets: true, id: true, updatedAt: true },
    }),
    prisma.scheduleRun.findMany({
      where: { planDate: { in: days.map(dateCol) } },
      orderBy: { createdAt: "desc" },
      select: { id: true, planDate: true, status: true, kpis: true, createdAt: true, requestPayload: true, errorMessage: true },
    }),
  ]);
  return days.map((date) => {
    const own = deliveries.filter((d) => d.deliveryDate.toISOString().slice(0, 10) === date);
    const run = runs.find((r) => r.planDate.toISOString().slice(0, 10) === date);
    let view: WeekDay["run"] = null;
    if (run) {
      const req = run.requestPayload as { slot_minutes: number; horizon_start: string; trucks: { id: string }[] };
      const k = run.kpis as { last_unload_end_slot: number } | null;
      const planned = new Set(req.trucks.map((t) => t.id));
      const stale = own.length !== planned.size || own.some((d) => !planned.has(String(d.id)) || d.updatedAt > run.createdAt);
      view = {
        id: run.id,
        status: run.status,
        ...runState({ status: run.status, errorMessage: run.errorMessage, createdAt: run.createdAt, timeLimitS: timeLimitOf(run.requestPayload) }),
        lastEndSlot: k?.last_unload_end_slot ?? null,
        slotMinutes: req.slot_minutes,
        horizonStart: req.horizon_start,
        stale,
      };
    }
    return { date, trucks: own.length, pallets: own.reduce((s, d) => s + d.pallets, 0), run: view };
  });
}

export interface RunView {
  id: number;
  planDate: string;
  status: RunStatus;
  /** Etap cyklu życia: generowanie w toku, gotowy plan albo zakończenie bez planu (z rodzajem porażki). */
  phase: RunPhase;
  failure: FailureKind | null;
  relaxed: boolean;
  createdAt: string;
  wallTimeMs: number | null;
  /** Szczegóły błędu w języku żądania (np. komunikat połączenia z modułem planowania). */
  errorMessage: string | null;
  horizonStart: string;
  slotMinutes: number;
  horizonSlots: number;
  closedSlots: [number, number][];
  shifts: [number, number][];
  latestArrivalSlot: number | null;
  putawayDeadlineSlot: number | null;
  breaks: { crew: number; shift: number; start_slot: number; end_slot: number }[];
  breakSlots: number;
  docks: { number: number; name: string }[];
  crews: number;
  crewSize: number;
  bufferCapacity: number;
  putawayPerSlot: number;
  setupSlots: number;
  kpis: SolveResponse["kpis"];
  hints: { truck_id: string | null; reason: string }[];
  inflow: number[];
  putaway: number[];
  bufferLevel: number[];
  rows: (Omit<PlanRow, "arrivalAt" | "unloadStartAt" | "unloadEndAt"> & {
    deliveryId: number;
    arrivalSlot: number;
    startSlot: number;
    endSlot: number;
    lateBySlots: number;
    windowFrom: string | null;
    windowTo: string | null;
  })[];
  /** Dostawy z dnia dodane lub zmienione po ułożeniu planu — plan jest nieaktualny. */
  staleReasons: string[];
}

/** `locale` — język opisów nieaktualności planu (`staleReasons`); domyślnie polski jak dotąd. */
export async function getRunView(runId: number, locale: Locale = DEFAULT_LOCALE): Promise<RunView | null> {
  const run = await prisma.scheduleRun.findUnique({
    where: { id: runId },
    include: { params: true, assignments: { include: { delivery: true, dock: true }, orderBy: { arrivalSlot: "asc" } } },
  });
  if (!run) return null;
  const req = SolveRequest.parse(run.requestPayload);
  const res = run.responsePayload ? SolveResponse.parse(run.responsePayload) : null;
  const planDate = run.planDate.toISOString().slice(0, 10);
  const docks = await prisma.dock.findMany({ orderBy: { number: "asc" }, take: req.docks, where: { isActive: true } });

  const current = await deliveriesForDate(planDate);
  const planned = new Set(req.trucks.map((t) => t.id));
  const staleReasons: string[] = [];
  const t = translator(locale);
  const added = current.filter((d) => !planned.has(String(d.id)));
  if (added.length) staleReasons.push(t("scheduling.stale.added", { count: added.length, list: added.map((d) => d.waybillNumber).join(", ") }));
  const changed = current.filter((d) => planned.has(String(d.id)) && d.updatedAt > run.createdAt);
  if (changed.length) staleReasons.push(t("scheduling.stale.changed", { list: changed.map((d) => d.waybillNumber).join(", ") }));
  const removed = req.trucks.filter((t) => !current.some((d) => String(d.id) === t.id));
  if (removed.length) staleReasons.push(t("scheduling.stale.removed", { list: removed.map((t) => t.ref).join(", ") }));

  return {
    id: run.id,
    planDate,
    status: run.status,
    ...runState({ status: run.status, errorMessage: run.errorMessage, createdAt: run.createdAt, timeLimitS: req.time_limit_s }),
    relaxed: run.relaxed,
    createdAt: run.createdAt.toISOString(),
    wallTimeMs: run.wallTimeMs,
    errorMessage: translateRunError(run.errorMessage, t),
    horizonStart: req.horizon_start,
    slotMinutes: req.slot_minutes,
    horizonSlots: req.horizon_slots,
    closedSlots: req.closed_slots,
    shifts: req.shifts,
    latestArrivalSlot: req.latest_arrival_slot,
    putawayDeadlineSlot: req.putaway_deadline_slot,
    breaks: res?.breaks ?? [],
    breakSlots: req.break_slots,
    docks: docks.map((d) => ({ number: d.number, name: d.name })),
    crews: req.crews,
    crewSize: run.params.crewSize,
    bufferCapacity: req.buffer_capacity,
    putawayPerSlot: req.putaway_per_slot,
    setupSlots: req.dock_setup_slots,
    kpis: res?.kpis ?? null,
    hints: res?.hints ?? ((run.hints as RunView["hints"]) || []),
    inflow: res?.inflow ?? [],
    putaway: res?.putaway ?? [],
    bufferLevel: res?.buffer_level ?? [],
    rows: run.assignments.map((a) => ({
      deliveryId: a.deliveryId,
      dock: a.dock.number,
      crew: a.crew,
      waybillNumber: a.delivery.waybillNumber,
      carrier: a.delivery.carrier,
      carrierEmail: a.delivery.carrierEmail,
      truckPlate: a.delivery.truckPlate,
      supplier: a.delivery.supplier,
      pallets: a.delivery.pallets,
      late: a.lateBySlots > 0,
      arrivalSlot: a.arrivalSlot,
      startSlot: a.startSlot,
      endSlot: a.endSlot,
      lateBySlots: a.lateBySlots,
      windowFrom: a.delivery.windowFrom?.toISOString() ?? null,
      windowTo: a.delivery.windowTo?.toISOString() ?? null,
    })),
    staleReasons,
  };
}

/** Wiersze raportu (PDF / maile) z zapisanego przebiegu; `locale` — język dokumentu. */
export async function reportData(runId: number, locale: Locale = DEFAULT_LOCALE): Promise<{ rows: PlanRow[]; meta: ReportMeta; view: RunView } | null> {
  const view = await getRunView(runId, locale);
  if (!view) return null;
  const params = await getActiveParams();
  const start = new Date(view.horizonStart);
  const at = (s: number) => slotToDate(start, s, view.slotMinutes);
  return {
    view,
    rows: view.rows.map((r) => ({ ...r, arrivalAt: at(r.arrivalSlot), unloadStartAt: at(r.startSlot), unloadEndAt: at(r.endSlot) })),
    meta: {
      planDate: view.planDate,
      timezone: params.timezone,
      warehouseName: process.env.WAREHOUSE_NAME ?? "ETPromo",
      signature: process.env.REPORT_SIGNATURE ?? translator(locale)("reports.defaultSignature"),
      generatedAt: new Date(),
      runId,
      locale,
    },
  };
}
