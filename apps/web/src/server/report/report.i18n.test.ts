import { describe, expect, it } from "vitest";
import { renderPlanPdf } from "./pdf";
import { carrierEmails, crewsPl, longDate, type PlanRow, type ReportMeta } from "./report";

const META: ReportMeta = {
  planDate: "2026-11-09",
  timezone: "Europe/Warsaw",
  warehouseName: "ETPromo",
  signature: "ETPromo Inbound Team",
  generatedAt: new Date("2026-11-08T12:00:00Z"),
  runId: 1,
  locale: "en",
};
const row = (o: Partial<PlanRow>): PlanRow => ({
  arrivalAt: new Date("2026-11-09T05:00:00Z"),
  unloadStartAt: new Date("2026-11-09T05:15:00Z"),
  unloadEndAt: new Date("2026-11-09T06:15:00Z"),
  dock: 1,
  crew: 1,
  waybillNumber: "CMR/1",
  carrier: "Raben",
  carrierEmail: "bookings@raben.example",
  truckPlate: "WX 12345",
  supplier: "Kartonex",
  pallets: 33,
  late: false,
  ...o,
});

describe("raport po angielsku", () => {
  it("mail w języku dokumentu, dane bez zmian (przewoźnik, numer listu, rejestracja)", () => {
    const [e] = carrierEmails([row({}), row({ waybillNumber: "CMR/2", pallets: 1, truckPlate: null, dock: 2 })], META);
    expect(e!.subject).toBe("Unloading slots — ETPromo, Monday, 09/11/2026 (2 trucks)");
    expect(e!.body).toContain("• 06:00 — dock 1 — vehicle WX 12345 — consignment note CMR/1 (33 pallets)");
    expect(e!.body).toContain("dock 2 — vehicle — consignment note CMR/2 (1 pallet)");
    expect(e!.body.startsWith("Hello,")).toBe(true);
    expect(e!.body.endsWith("Kind regards,\nETPromo Inbound Team")).toBe(true);
  });

  it("domyślny język raportu to polski (zgodność wstecz)", () => {
    const [e] = carrierEmails([row({})], { ...META, locale: undefined });
    expect(e!.body.startsWith("Dzień dobry,")).toBe(true);
    expect(longDate("2026-11-09")).toBe("poniedziałek, 09.11.2026");
    expect(longDate("2026-11-09", "en")).toBe("Monday, 09/11/2026");
    expect(crewsPl(2, 4, "en")).toBe("2 teams of 4");
  });

  it("PDF po angielsku generuje się (jedna strona)", async () => {
    const pdf = await renderPlanPdf([row({ late: true }), row({ dock: 2 })], META, {
      trucks: 2,
      pallets: 66,
      firstArrival: "06:00",
      lastUnloadEnd: "07:15",
      crewUtilization: 0.9,
      docks: 4,
      crews: 2,
      crewSize: 4,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(pdf.toString("latin1")).toContain("/Lang (en-GB)");
  });
});
