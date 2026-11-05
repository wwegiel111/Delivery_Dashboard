import { NextResponse } from "next/server";
import { deleteRun, getRunView } from "@/server/scheduling/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const id = Number((await params).runId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Nieprawidłowe id" }, { status: 400 });
  const view = await getRunView(id);
  return view ? NextResponse.json(view) : NextResponse.json({ error: "Nie znaleziono planu" }, { status: 404 });
}

/** Usunięcie wersji planu. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const id = Number((await params).runId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Nieprawidłowe id" }, { status: 400 });
  try {
    const date = await deleteRun(id);
    return date ? NextResponse.json({ ok: true, date }) : NextResponse.json({ error: "Nie znaleziono planu" }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
