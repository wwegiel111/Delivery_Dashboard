import { NextResponse } from "next/server";
import { z } from "zod";
import { currentLocale } from "@/i18n/server";
import { translator } from "@/i18n/translator";
import { LocalizedError, localizeError, RunFailure } from "@/server/errors";
import { runPlan } from "@/server/scheduling/plan";
import { SolverError } from "@/server/scheduling/solver-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  /** Dzień przyjęć RRRR-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeLimitS: z.number().int().min(1).max(600).optional(),
});

export async function POST(request: Request) {
  const locale = await currentLocale();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: translator(locale)("errors.invalidRequest", { details: z.prettifyError(parsed.error) }) }, { status: 400 });
  try {
    return NextResponse.json(await runPlan(parsed.data.date, { timeLimitS: parsed.data.timeLimitS }));
  } catch (err) {
    // `runId` (gdy przebieg zdążył się zapisać) pozwala interfejsowi pokazać wynik w panelu planu zamiast osobnego komunikatu.
    const cause = err instanceof RunFailure ? err.cause : err;
    const status = cause instanceof SolverError ? 502 : cause instanceof LocalizedError && cause.key === "planSolving" ? 409 : 500;
    return NextResponse.json({ error: localizeError(err, locale), ...(err instanceof RunFailure ? { runId: err.runId } : {}) }, { status });
  }
}
