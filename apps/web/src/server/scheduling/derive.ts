/**
 * Czyste funkcje: parametry + dostawy dnia → SolveRequest (bez bazy, testowalne).
 */
import {
  dateToSlotCeil,
  dateToSlotFloor,
  dayHorizonSlots,
  localTimeOn,
  minutesToSlots,
  SolveRequest,
  type SolveRequestInput,
} from "@etpromo/contracts";

export interface PlanParams {
  timezone: string;
  slotMinutes: number;
  crews: number;
  fullTruckMinutes: number;
  fullTruckPallets: number;
  dockSetupMinutes: number;
  bufferCapacity: number;
  putawayPalletsPerHour: number;
  workFrom: string;
  workTo: string;
  shiftChange: string;
  shiftChangeMinutes: number;
  breaksPerShift: number;
  breakMinutes: number;
  lastArrival: string;
  weightTardiness: number;
  weightMakespan: number;
  weightFlow: number;
  weightBuffer: number;
  solverTimeLimitS: number;
}

export interface DeliveryInput {
  id: number;
  waybillNumber: string;
  pallets: number;
  priority: number;
  windowFrom: Date | null;
  windowTo: Date | null;
  hardWindow: boolean;
  /** Ręcznie ustalona godzina przyjazdu. */
  fixedArrival?: Date | null;
}

/** Czas rozładunku auta przez jedną grupę, proporcjonalnie do liczby palet. */
export function unloadSlots(pallets: number, p: PlanParams): number {
  return minutesToSlots((pallets * p.fullTruckMinutes) / p.fullTruckPallets, p.slotMinutes);
}

/** Wydajność wózkowych na slot (min. 1 paleta). */
export function putawayPerSlot(p: PlanParams): number {
  return Math.max(1, Math.round((p.putawayPalletsPerHour * p.slotMinutes) / 60));
}

export function setupSlots(p: PlanParams): number {
  return p.dockSetupMinutes <= 0 ? 0 : minutesToSlots(p.dockSetupMinutes, p.slotMinutes);
}

/** Przerwa nie w pierwszej / ostatniej godzinie zmiany i co najmniej 2 h od poprzedniej przerwy tej grupy. */
export const BREAK_EDGE_MINUTES = 60;
export const BREAK_GAP_MINUTES = 120;

/** Godziny pracy, zmiana zmian i ostatni przyjazd w slotach doby. */
export function dayFrame(dayStart: Date, horizon: number, p: PlanParams) {
  const slotAt = (hhmm: string, round: "ceil" | "floor") =>
    (round === "ceil" ? dateToSlotCeil : dateToSlotFloor)(dayStart, localTimeOn(dayStart, hhmm, p.timezone), p.slotMinutes);
  const open = Math.max(0, slotAt(p.workFrom, "ceil"));
  const close = Math.min(horizon, slotAt(p.workTo, "floor"));
  const change = slotAt(p.shiftChange, "floor");
  const changeEnd = change + (p.shiftChangeMinutes > 0 ? minutesToSlots(p.shiftChangeMinutes, p.slotMinutes) : 0);
  const hasChange = change > open && changeEnd < close;
  const shifts: [number, number][] = hasChange ? [[open, change], [changeEnd, close]] : [[open, close]];
  const lastArrival = Math.min(slotAt(p.lastArrival, "floor"), close);
  return { open, close, change: hasChange ? ([change, changeEnd] as [number, number]) : null, shifts, lastArrival };
}

/** Sloty poza godzinami pracy w danej dobie + przestój zmiany zmian. */
export function closedSlots(dayStart: Date, horizon: number, p: PlanParams): [number, number][] {
  const f = dayFrame(dayStart, horizon, p);
  const out: [number, number][] = [];
  if (f.open > 0) out.push([0, f.open]);
  if (f.change && f.change[1] > f.change[0]) out.push(f.change);
  if (f.close < horizon) out.push([f.close, horizon]);
  return out;
}

export function buildRequest(opts: {
  dayStart: Date;
  params: PlanParams;
  docks: number;
  deliveries: DeliveryInput[];
  timeLimitS?: number;
}): SolveRequest {
  const { dayStart, params: p } = opts;
  const H = dayHorizonSlots(dayStart, p.slotMinutes, p.timezone);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const frame = dayFrame(dayStart, H, p);
  const brk = p.breaksPerShift > 0 && p.breakMinutes > 0;
  const input: SolveRequestInput = {
    horizon_start: dayStart.toISOString(),
    slot_minutes: p.slotMinutes,
    horizon_slots: H,
    time_limit_s: opts.timeLimitS ?? p.solverTimeLimitS,
    docks: opts.docks,
    crews: p.crews,
    dock_setup_slots: setupSlots(p),
    buffer_capacity: p.bufferCapacity,
    putaway_per_slot: putawayPerSlot(p),
    closed_slots: closedSlots(dayStart, H, p),
    latest_arrival_slot: frame.lastArrival,
    putaway_deadline_slot: frame.close,
    shifts: frame.shifts,
    breaks_per_shift: brk ? p.breaksPerShift : 0,
    break_slots: brk ? minutesToSlots(p.breakMinutes, p.slotMinutes) : 0,
    break_edge_slots: brk ? Math.floor(BREAK_EDGE_MINUTES / p.slotMinutes) : 0,
    break_gap_slots: brk ? Math.floor(BREAK_GAP_MINUTES / p.slotMinutes) : 0,
    weights: { tardiness: p.weightTardiness, makespan: p.weightMakespan, flow: p.weightFlow, buffer: p.weightBuffer },
    trucks: opts.deliveries.map((d) => ({
      id: String(d.id),
      ref: d.waybillNumber,
      pallets: d.pallets,
      unload_slots: unloadSlots(d.pallets, p),
      release_slot: d.windowFrom ? clamp(dateToSlotCeil(dayStart, d.windowFrom, p.slotMinutes), 0, H - 1) : 0,
      deadline_slot: d.windowTo ? clamp(dateToSlotFloor(dayStart, d.windowTo, p.slotMinutes), 0, H) : null,
      hard_deadline: d.hardWindow,
      priority: d.priority,
      fixed_arrival_slot: d.fixedArrival ? clamp(dateToSlotFloor(dayStart, d.fixedArrival, p.slotMinutes), 0, H - 1) : null,
    })),
  };
  return SolveRequest.parse(input);
}
