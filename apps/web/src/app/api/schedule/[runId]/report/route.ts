import { renderPlanPdf } from "@/server/report/pdf";
import { reportData } from "@/server/scheduling/plan";
import { hhmm } from "@/server/report/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PDF planu przyjęć do wysłania / wydruku. */
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const id = Number((await params).runId);
  const data = Number.isInteger(id) ? await reportData(id) : null;
  if (!data) return new Response("Nie znaleziono planu", { status: 404 });
  if (data.rows.length === 0) return new Response("Plan nie zawiera przydziałów (brak rozwiązania)", { status: 409 });
  const { rows, meta, view } = data;
  const sorted = [...rows].sort((a, b) => a.arrivalAt.getTime() - b.arrivalAt.getTime());
  const pdf = await renderPlanPdf(rows, meta, {
    trucks: rows.length,
    pallets: rows.reduce((s, r) => s + r.pallets, 0),
    firstArrival: hhmm(sorted[0]!.arrivalAt, meta.timezone),
    lastUnloadEnd: hhmm(new Date(Math.max(...rows.map((r) => r.unloadEndAt.getTime()))), meta.timezone),
    crewUtilization: view.kpis?.crew_utilization ?? 0,
    docks: view.docks.length,
    crews: view.crews,
    crewSize: view.crewSize,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="plan-przyjec-${meta.planDate}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
