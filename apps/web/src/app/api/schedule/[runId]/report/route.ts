import { isLocale } from "@/i18n/config";
import { currentLocale } from "@/i18n/server";
import { translator } from "@/i18n/translator";
import { renderPlanPdf } from "@/server/report/pdf";
import { hhmm } from "@/server/report/report";
import { reportData } from "@/server/scheduling/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PDF planu przyjęć do wysłania / wydruku.
 * `?lang=pl|en` — język dokumentu (opcjonalny; domyślnie język interfejsu z cookie).
 */
export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const uiLocale = await currentLocale();
  const lang = new URL(req.url).searchParams.get("lang");
  const locale = isLocale(lang) ? lang : uiLocale;
  const t = translator(uiLocale);
  const id = Number((await params).runId);
  const data = Number.isInteger(id) ? await reportData(id, locale) : null;
  if (!data) return new Response(t("errors.planNotFound"), { status: 404 });
  if (data.rows.length === 0) return new Response(t("errors.planEmpty"), { status: 409 });
  const { rows, meta, view } = data;
  const sorted = [...rows].sort((a, b) => a.arrivalAt.getTime() - b.arrivalAt.getTime());
  const pdf = await renderPlanPdf(rows, meta, {
    trucks: rows.length,
    pallets: rows.reduce((s, r) => s + r.pallets, 0),
    firstArrival: hhmm(sorted[0]!.arrivalAt, meta.timezone, locale),
    lastUnloadEnd: hhmm(new Date(Math.max(...rows.map((r) => r.unloadEndAt.getTime()))), meta.timezone, locale),
    crewUtilization: view.kpis?.crew_utilization ?? 0,
    docks: view.docks.length,
    crews: view.crews,
    crewSize: view.crewSize,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${translator(locale)("reports.fileName", { date: meta.planDate })}"`,
      "cache-control": "no-store",
    },
  });
}
