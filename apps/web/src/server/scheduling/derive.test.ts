import { localDayStart, localTimeOn } from "@etpromo/contracts";
import { describe, expect, it } from "vitest";
import { buildRequest, closedSlots, putawayPerSlot, setupSlots, unloadSlots, type PlanParams } from "./derive";

export const PARAMS: PlanParams = {
  timezone: "Europe/Warsaw",
  slotMinutes: 15,
  crews: 2,
  fullTruckMinutes: 60,
  fullTruckPallets: 33,
  dockSetupMinutes: 15,
  bufferCapacity: 35,
  putawayPalletsPerHour: 32,
  workFrom: "06:00",
  workTo: "22:00",
  shiftChange: "14:00",
  shiftChangeMinutes: 0,
  breaksPerShift: 0,
  breakMinutes: 15,
  lastArrival: "22:00",
  weightTardiness: 1000,
  weightMakespan: 50,
  weightFlow: 5,
  weightBuffer: 1,
  solverTimeLimitS: 20,
};
const DAY = localDayStart("2026-11-09", PARAMS.timezone);
const at = (hhmm: string) => localTimeOn(DAY, hhmm, PARAMS.timezone);

describe("derive", () => {
  it("pełne auto = 1 h (4 sloty), połowa = 30 min, 34 palety = 5 slotów (zaokrąglenie w górę)", () => {
    expect(unloadSlots(33, PARAMS)).toBe(4);
    expect(unloadSlots(16, PARAMS)).toBe(2);
    expect(unloadSlots(34, PARAMS)).toBe(5);
  });

  it("wydajność wózkowych 32 pal./h → 8 na slot, podstawienie 15 min → 1 slot", () => {
    expect(putawayPerSlot(PARAMS)).toBe(8);
    expect(setupSlots(PARAMS)).toBe(1);
    expect(setupSlots({ ...PARAMS, dockSetupMinutes: 0 })).toBe(0);
  });

  it("parametry bazowe (slot 10 min): 35 palet = 6 slotów, podstawienie 20 min = 2 sloty, 90 pal./h = 15 na slot", () => {
    const base = { ...PARAMS, slotMinutes: 10, crews: 1, fullTruckPallets: 35, dockSetupMinutes: 20, bufferCapacity: 140, putawayPalletsPerHour: 90 };
    expect(unloadSlots(35, base)).toBe(6);
    expect(setupSlots(base)).toBe(2);
    expect(putawayPerSlot(base)).toBe(15);
    expect(closedSlots(DAY, 144, base)).toEqual([
      [0, 36],
      [132, 144],
    ]);
  });

  it("parametry bazowe (slot 5 min): zmiana 14:00 + 20 min przestoju, 2 × 15 min przerwy, ostatni przyjazd 20:00, regał do 22:00", () => {
    const base = { ...PARAMS, slotMinutes: 5, crews: 2, fullTruckPallets: 35, dockSetupMinutes: 20, bufferCapacity: 140, putawayPalletsPerHour: 90, shiftChangeMinutes: 20, breaksPerShift: 2, lastArrival: "20:00" };
    expect(closedSlots(DAY, 288, base)).toEqual([
      [0, 72],
      [168, 172],
      [264, 288],
    ]);
    const req = buildRequest({ dayStart: DAY, params: base, docks: 4, deliveries: [] });
    expect(req).toMatchObject({
      slot_minutes: 5,
      horizon_slots: 288,
      crews: 2,
      dock_setup_slots: 4,
      shifts: [
        [72, 168],
        [172, 264],
      ],
      breaks_per_shift: 2,
      break_slots: 3,
      break_edge_slots: 12,
      break_gap_slots: 24,
      latest_arrival_slot: 240,
      putaway_deadline_slot: 264,
    });
    expect(unloadSlots(35, base)).toBe(12);
  });

  it("godziny pracy 06–22 → zamknięte [0,24) i [88,96)", () => {
    expect(closedSlots(DAY, 96, PARAMS)).toEqual([
      [0, 24],
      [88, 96],
    ]);
  });

  it("okna awizacji i przypięty przyjazd → sloty", () => {
    const req = buildRequest({
      dayStart: DAY,
      params: PARAMS,
      docks: 4,
      deliveries: [
        { id: 7, waybillNumber: "LP/7", pallets: 33, priority: 5, windowFrom: at("08:10"), windowTo: at("12:00"), hardWindow: true },
        { id: 8, waybillNumber: "LP/8", pallets: 20, priority: 5, windowFrom: null, windowTo: null, hardWindow: false, fixedArrival: at("09:30") },
      ],
    });
    expect(req.horizon_slots).toBe(96);
    expect(req.trucks[0]).toMatchObject({ id: "7", release_slot: 33, deadline_slot: 48, hard_deadline: true, unload_slots: 4 });
    expect(req.trucks[1]).toMatchObject({ release_slot: 0, deadline_slot: null, fixed_arrival_slot: 38, unload_slots: 3 });
    expect(req).toMatchObject({ docks: 4, crews: 2, buffer_capacity: 35, putaway_per_slot: 8, dock_setup_slots: 1 });
  });
});
