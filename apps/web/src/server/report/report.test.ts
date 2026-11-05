import { describe, expect, it } from "vitest";
import { renderPlanPdf } from "./pdf";
import { carrierEmails, crewsPl, mailtoHref, palletsPl, trucksPl, type PlanRow, type ReportMeta } from "./report";

const META: ReportMeta = {
  planDate: "2026-11-09",
  timezone: "Europe/Warsaw",
  warehouseName: "ETPromo",
  signature: "Dział przyjęć ETPromo",
  generatedAt: new Date("2026-11-08T12:00:00Z"),
  runId: 1,
};
const row = (o: Partial<PlanRow>): PlanRow => ({
  arrivalAt: new Date("2026-11-09T05:00:00Z"),
  unloadStartAt: new Date("2026-11-09T05:15:00Z"),
  unloadEndAt: new Date("2026-11-09T06:15:00Z"),
  dock: 1,
  crew: 1,
  waybillNumber: "CMR/1",
  carrier: "Raben",
  carrierEmail: "awizacje@raben.example",
  truckPlate: "WX 12345",
  supplier: "Kartonex",
  pallets: 33,
  late: false,
  ...o,
});

describe("raport", () => {
  it("odmiana palet", () => {
    expect([crewsPl(1, 2), crewsPl(2, 4), crewsPl(5, 3), crewsPl(12, 2)]).toEqual(["1 grupa po 2 os.", "2 grupy po 4 os.", "5 grup po 3 os.", "12 grup po 2 os."]);
    expect([1, 2, 5, 12, 22, 33, 114].map(palletsPl)).toEqual(["1 paleta", "2 palety", "5 palet", "12 palet", "22 palety", "33 palety", "114 palet"]);
  });

  it("jeden mail na przewoźnika, auta posortowane po godzinie przyjazdu", () => {
    const emails = carrierEmails(
      [
        row({ waybillNumber: "CMR/2", arrivalAt: new Date("2026-11-09T09:00:00Z"), dock: 3, truckPlate: "WX 2" }),
        row({}),
        row({ carrier: "DSV", carrierEmail: null, waybillNumber: "CMR/9", pallets: 1 }),
      ],
      META,
    );
    expect(emails).toHaveLength(2);
    const raben = emails.find((e) => e.carrier === "Raben")!;
    expect(raben.to).toBe("awizacje@raben.example");
    expect(raben.subject).toContain("(2 auta)");
    expect(raben.body).toContain("• 06:00 — stanowisko 1 — auto WX 12345 — list przewozowy CMR/1 (33 palety)");
    expect(raben.body.indexOf("CMR/1")).toBeLessThan(raben.body.indexOf("CMR/2"));
    expect(raben.body).toContain("10:00 — stanowisko 3");
    expect(emails.find((e) => e.carrier === "DSV")!.body).toContain("(1 paleta)");
    expect(mailtoHref(raben)).toMatch(/^mailto:awizacje%40raben\.example\?subject=/);
  });

  it("list bez e-maila trafia do maila tego samego przewoźnika; różne adresy = osobne maile", () => {
    const emails = carrierEmails(
      [
        row({ carrier: "Trans-Pol", carrierEmail: null, waybillNumber: "A" }),
        row({ carrier: "Trans-Pol", carrierEmail: "biuro@transpol.example", waybillNumber: "B" }),
        row({ carrier: "Raben", carrierEmail: "a@raben.example", waybillNumber: "C" }),
        row({ carrier: "Raben", carrierEmail: "b@raben.example", waybillNumber: "D" }),
      ],
      META,
    );
    expect(emails.map((e) => [e.carrier, e.to, e.trucks])).toEqual([
      ["Trans-Pol", "biuro@transpol.example", 2],
      ["Raben", "a@raben.example", 1],
      ["Raben", "b@raben.example", 1],
    ]);
  });

  it("odmiana aut", () => expect([1, 2, 5, 22].map(trucksPl)).toEqual(["1 auto", "2 auta", "5 aut", "22 auta"]));

  it("PDF z polskimi znakami się generuje", async () => {
    const pdf = await renderPlanPdf([row({ carrier: "Trans-Pol Łódź Sp. z o.o.", late: true }), row({ dock: 2 })], META, {
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
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1); // jedna strona, bez pustej strony ze stopką
    expect(pdf.length).toBeGreaterThan(5000);
  });
});
