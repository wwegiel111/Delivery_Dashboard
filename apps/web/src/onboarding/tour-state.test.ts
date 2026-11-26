import { describe, expect, it } from "vitest";
import { INITIAL_TOUR_STATE, parseTourState, parseTourStatus, shouldShowWelcome, tourReducer } from "./tour-state";

describe("stan samouczka", () => {
  it("start, przejście, przerwanie, wznowienie, ukończenie", () => {
    const s1 = tourReducer(INITIAL_TOUR_STATE, { type: "start" });
    expect(s1).toEqual({ status: "in_progress", index: 0 });
    const s2 = tourReducer(s1, { type: "goto", index: 4, total: 17 });
    const s3 = tourReducer(s2, { type: "pause" });
    expect(s3).toEqual({ status: "paused", index: 4 });
    expect(tourReducer(s3, { type: "goto", index: 5, total: 17 })).toBe(s3);
    const s4 = tourReducer(s3, { type: "resume" });
    expect(s4).toEqual({ status: "in_progress", index: 4 });
    expect(tourReducer(s4, { type: "goto", index: 17, total: 17 }).status).toBe("completed");
  });

  it("pominięcie i ponowny start", () => {
    expect(tourReducer({ status: "in_progress", index: 3 }, { type: "skip" }).status).toBe("skipped");
    expect(tourReducer({ status: "completed", index: 0 }, { type: "start" })).toEqual({ status: "in_progress", index: 0 });
    expect(tourReducer(INITIAL_TOUR_STATE, { type: "resume" })).toBe(INITIAL_TOUR_STATE);
  });

  it("odczyt zapisanej pozycji jest odporny na złe dane i dawną, dłuższą wersję samouczka", () => {
    expect(parseTourState(null, "paused", 17)).toEqual({ status: "paused", index: 0 });
    expect(parseTourState("{zepsute", "paused", 17).index).toBe(0);
    expect(parseTourState(JSON.stringify({ index: 5 }), "paused", 17).index).toBe(5);
    expect(parseTourState(JSON.stringify({ chapters: ["import"], index: 40 }), "paused", 17).index).toBe(0);
    expect(parseTourStatus("completed")).toBe("completed");
    expect(parseTourStatus("hack")).toBe("not_started");
  });

  it("okno powitalne tylko przy pierwszym wejściu i bez „później” w tej sesji", () => {
    expect(shouldShowWelcome("not_started", false)).toBe(true);
    expect(shouldShowWelcome("not_started", true)).toBe(false);
    for (const s of ["in_progress", "paused", "completed", "skipped"] as const) expect(shouldShowWelcome(s, false)).toBe(false);
  });
});
