/** PDF planu przyjęć (A4, poziomo) — do wysłania mailem lub wydruku. */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import PDFDocument from "pdfkit";
import { crewsPl, hhmm, longDate, palletsPl, sortRows, type PlanRow, type ReportMeta } from "./report";

/** Czcionka z pełnym zestawem polskich znaków (pakiet dejavu-fonts-ttf w node_modules). */
function fontPath(file: string): string {
  let dir = process.cwd();
  for (;;) {
    const p = join(dir, "node_modules", "dejavu-fonts-ttf", "ttf", file);
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) throw new Error(`Nie znaleziono czcionki ${file} (pakiet dejavu-fonts-ttf)`);
    dir = up;
  }
}

export interface PdfSummary {
  trucks: number;
  pallets: number;
  firstArrival: string;
  lastUnloadEnd: string;
  crewUtilization: number;
  docks: number;
  crews: number;
  crewSize: number;
}

/** Suma szerokości = 770 pt (A4 poziomo minus marginesy 2 × 36). */
const COLS = [
  { key: "arrival", label: "Przyjazd", w: 58 },
  { key: "dock", label: "Stanowisko", w: 64 },
  { key: "plate", label: "Nr rej.", w: 80 },
  { key: "carrier", label: "Przewoźnik", w: 140 },
  { key: "waybill", label: "List przewozowy", w: 142 },
  { key: "supplier", label: "Dostawca", w: 116 },
  { key: "pallets", label: "Palety", w: 46 },
  { key: "unload", label: "Rozładunek", w: 82 },
  { key: "crew", label: "Grupa", w: 42 },
] as const;

export async function renderPlanPdf(rows: PlanRow[], meta: ReportMeta, summary: PdfSummary): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, info: { Title: `Plan przyjęć ${meta.planDate}`, Author: meta.signature } });
  doc.registerFont("Regular", fontPath("DejaVuSans.ttf"));
  doc.registerFont("Bold", fontPath("DejaVuSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const tz = meta.timezone;

  doc.font("Bold").fontSize(16).fillColor("#0b0b0b").text(`Plan przyjęć dostaw — ${longDate(meta.planDate)}`, left, 36);
  doc
    .font("Regular")
    .fontSize(9)
    .fillColor("#52514e")
    .text(
      `${meta.warehouseName} · ${summary.trucks} aut · ${palletsPl(summary.pallets)} · przyjazdy ${summary.firstArrival}–${summary.lastUnloadEnd} · ` +
        `${summary.docks} stanowiska · ${crewsPl(summary.crews, summary.crewSize)} · wykorzystanie ${summary.crews === 1 ? "grupy" : "grup"} ${Math.round(summary.crewUtilization * 100)}%`,
    );
  doc.moveDown(0.8);

  const rowH = 20;
  let y = doc.y;
  const header = () => {
    doc.rect(left, y, width, rowH).fill("#f0efec");
    let x = left;
    doc.font("Bold").fontSize(8.5).fillColor("#0b0b0b");
    for (const c of COLS) {
      doc.text(c.label, x + 4, y + 6, { width: c.w - 8, lineBreak: false });
      x += c.w;
    }
    y += rowH;
  };
  header();

  const sorted = sortRows(rows);
  sorted.forEach((r, i) => {
    if (y + rowH > doc.page.height - 50) {
      doc.addPage();
      y = doc.page.margins.top;
      header();
    }
    if (i % 2 === 1) doc.rect(left, y, width, rowH).fill("#fafaf8");
    const cells: Record<(typeof COLS)[number]["key"], string> = {
      arrival: hhmm(r.arrivalAt, tz),
      dock: String(r.dock),
      plate: r.truckPlate ?? "—",
      carrier: r.carrier,
      waybill: r.waybillNumber,
      supplier: r.supplier ?? "—",
      pallets: String(r.pallets),
      unload: `${hhmm(r.unloadStartAt, tz)}–${hhmm(r.unloadEndAt, tz)}`,
      crew: String(r.crew),
    };
    let x = left;
    for (const c of COLS) {
      const bold = c.key === "arrival" || c.key === "dock";
      doc.font(bold ? "Bold" : "Regular").fontSize(bold ? 10 : 8.5).fillColor("#0b0b0b");
      doc.text(cells[c.key], x + 4, y + (bold ? 5 : 6), { width: c.w - 8, lineBreak: false, ellipsis: true });
      x += c.w;
    }
    if (r.late) doc.font("Regular").fontSize(7).fillColor("#d03b3b").text("po terminie awizacji", left + width - 90, y + 12, { width: 86, align: "right", lineBreak: false });
    doc.moveTo(left, y + rowH).lineTo(left + width, y + rowH).lineWidth(0.5).strokeColor("#e1e0d9").stroke();
    y += rowH;
  });

  // Stopka poniżej dolnego marginesu — bez zerowania marginesu pdfkit dodałby pustą stronę.
  doc.page.margins.bottom = 0;
  doc
    .font("Regular")
    .fontSize(8)
    .fillColor("#898781")
    .text(
      `Godzina przyjazdu = podstawienie auta na stanowisko. Wygenerowano ${new Intl.DateTimeFormat("pl-PL", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(meta.generatedAt)} · plan #${meta.runId}`,
      left,
      doc.page.height - 40,
      { width, lineBreak: false },
    );
  doc.end();
  return done;
}
