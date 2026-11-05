import { describe, expect, it } from "vitest";
import { localParts, weekHorizonSlots, weekLocalTime, weekStartFor, zonedTimeToUtc } from "./time";

const TZ = "Europe/Warsaw";

describe("time helpers", () => {
  it("week start is local Monday 00:00", () => {
    const ws = weekStartFor(new Date("2026-11-12T15:30:00Z"), TZ); // czwartek
    expect(ws.toISOString()).toBe("2026-11-08T23:00:00.000Z"); // pon 00:00 CET
    expect(localParts(ws, TZ)).toMatchObject({ isoWeekday: 1, hour: 0, minute: 0 });
  });

  it("normal week has 672 slots, DST weeks 668/676", () => {
    expect(weekHorizonSlots(weekStartFor(new Date("2026-11-12T12:00:00Z"), TZ), 15, TZ)).toBe(672);
    // 2026-03-29 przejście na CEST (tydzień krótszy o 1h)
    expect(weekHorizonSlots(weekStartFor(new Date("2026-03-26T12:00:00Z"), TZ), 15, TZ)).toBe(668);
    // 2026-10-25 powrót na CET (tydzień dłuższy o 1h)
    expect(weekHorizonSlots(weekStartFor(new Date("2026-10-22T12:00:00Z"), TZ), 15, TZ)).toBe(676);
  });

  it("weekLocalTime respects summer offset", () => {
    const ws = weekStartFor(new Date("2026-06-10T12:00:00Z"), TZ);
    expect(weekLocalTime(ws, 2, "06:00", TZ).toISOString()).toBe("2026-06-10T04:00:00.000Z");
    expect(weekLocalTime(ws, 0, "24:00", TZ).toISOString()).toBe("2026-06-08T22:00:00.000Z");
  });

  it("zonedTimeToUtc handles a non-existent local hour by moving forward", () => {
    const d = zonedTimeToUtc(2026, 3, 29, 2, 30, TZ);
    expect(localParts(d, TZ).hour).toBe(3);
  });
});

import { dayHorizonSlots, localDayStart, localTimeOn } from "./time";

describe("plan dzienny", () => {
  it("lokalna północ i godziny dnia", () => {
    const ds = localDayStart("2026-11-09", TZ);
    expect(ds.toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(localTimeOn(ds, "06:00", TZ).toISOString()).toBe("2026-11-09T05:00:00.000Z");
  });
  it("doba ma 96 slotów, a w dni zmiany czasu 92 / 100", () => {
    expect(dayHorizonSlots(localDayStart("2026-11-09", TZ), 15, TZ)).toBe(96);
    expect(dayHorizonSlots(localDayStart("2026-03-29", TZ), 15, TZ)).toBe(92);
    expect(dayHorizonSlots(localDayStart("2026-10-25", TZ), 15, TZ)).toBe(100);
  });
});
