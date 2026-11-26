import { NextResponse } from "next/server";
import { currentLocale } from "@/i18n/server";
import { translator } from "@/i18n/translator";
import { localizeError } from "@/server/errors";
import { deleteRun, getRunView } from "@/server/scheduling/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const locale = await currentLocale();
  const t = translator(locale);
  const id = Number((await params).runId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  const view = await getRunView(id, locale);
  return view ? NextResponse.json(view) : NextResponse.json({ error: t("errors.planNotFound") }, { status: 404 });
}

/** Usunięcie wersji planu. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const locale = await currentLocale();
  const t = translator(locale);
  const id = Number((await params).runId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  try {
    const date = await deleteRun(id);
    return date ? NextResponse.json({ ok: true, date }) : NextResponse.json({ error: t("errors.planNotFound") }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: localizeError(err, locale) }, { status: 409 });
  }
}
