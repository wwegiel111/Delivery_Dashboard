/** PDF planu przyjęć (A4, poziomo) — do wysłania mailem lub wydruku. */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import PDFDocument from "pdfkit";
import { DEFAULT_LOCALE, INTL_LOCALE } from "@/i18n/config";
import { translator } from "@/i18n/translator";
import { LocalizedError } from "../errors";
import { crewsPl, docksText, hhmm, longDate, palletsText, sortRows, trucksText, type PlanRow, type ReportMeta } from "./report";

/** Czcionka z pełnym zestawem polskich znaków (pakiet dejavu-fonts-ttf w node_modules). */
function fontPath(file: string): string {
  let dir = process.cwd();
  for (;;) {
    const p = join(dir, "node_modules", "dejavu-fonts-ttf", "ttf", file);
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) throw new LocalizedError("fontMissing", { file });
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
  { key: "arrival", w: 58 },
  { key: "dock", w: 64 },
  { key: "plate", w: 80 },
  { key: "carrier", w: 140 },
  { key: "waybill", w: 142 },
  { key: "supplier", w: 116 },
  { key: "pallets", w: 46 },
  { key: "unload", w: 82 },
  { key: "crew", w: 42 },
] as const;

/** PDF w języku `meta.locale` (domyślnie polski). */
export async function renderPlanPdf(rows: PlanRow[], meta: ReportMeta, summary: PdfSummary): Promise<Buffer> {
  const locale = meta.locale ?? DEFAULT_LOCALE;
  const t = translator(locale);
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, lang: INTL_LOCALE[locale], info: { Title: t("reports.docTitle", { date: meta.planDate }), Author: meta.signature } });
  doc.registerFont("Regular", fontPath("DejaVuSans.ttf"));
  doc.registerFont("Bold", fontPath("DejaVuSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const tz = meta.timezone;

  doc.font("Bold").fontSize(16).fillColor("#0b0b0b").text(t("reports.title", { date: longDate(meta.planDate, locale) }), left, 36);
  doc
    .font("Regular")
    .fontSize(9)
    .fillColor("#52514e")
    .text(
      t("reports.summary", {
        warehouse: meta.warehouseName,
        trucks: trucksText(summary.trucks, locale),
        pallets: palletsText(summary.pallets, locale),
        from: summary.firstArrival,
        to: summary.lastUnloadEnd,
        docks: docksText(summary.docks, locale),
        crews: crewsPl(summary.crews, summary.crewSize, locale),
        crewCount: summary.crews,
        utilization: new Intl.NumberFormat(INTL_LOCALE[locale], { style: "percent", maximumFractionDigits: 0 }).format(summary.crewUtilization),
      }),
    );
  doc.moveDown(0.8);

  const rowH = 20;
  let y = doc.y;
  const header = () => {
    doc.rect(left, y, width, rowH).fill("#f0efec");
    let x = left;
    doc.font("Bold").fontSize(8.5).fillColor("#0b0b0b");
    for (const c of COLS) {
      doc.text(t(`reports.columns.${c.key}`), x + 4, y + 6, { width: c.w - 8, lineBreak: false, ellipsis: true });
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
      arrival: hhmm(r.arrivalAt, tz, locale),
      dock: String(r.dock),
      plate: r.truckPlate ?? "—",
      carrier: r.carrier,
      waybill: r.waybillNumber,
      supplier: r.supplier ?? "—",
      pallets: String(r.pallets),
      unload: `${hhmm(r.unloadStartAt, tz, locale)}–${hhmm(r.unloadEndAt, tz, locale)}`,
      crew: String(r.crew),
    };
    let x = left;
    for (const c of COLS) {
      const bold = c.key === "arrival" || c.key === "dock";
      doc.font(bold ? "Bold" : "Regular").fontSize(bold ? 10 : 8.5).fillColor("#0b0b0b");
      doc.text(cells[c.key], x + 4, y + (bold ? 5 : 6), { width: c.w - 8, lineBreak: false, ellipsis: true });
      x += c.w;
    }
    if (r.late) doc.font("Regular").fontSize(7).fillColor("#d03b3b").text(t("reports.late"), left + width - 90, y + 12, { width: 86, align: "right", lineBreak: false });
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
      t("reports.footer", {
        generated: new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: tz, dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(meta.generatedAt),
        id: meta.runId,
      }),
      left,
      doc.page.height - 40,
      { width, lineBreak: false },
    );
  doc.end();
  return done;
}
