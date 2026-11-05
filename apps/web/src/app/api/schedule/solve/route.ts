import { NextResponse } from "next/server";
import { z } from "zod";
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
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  try {
    return NextResponse.json(await runPlan(parsed.data.date, { timeLimitS: parsed.data.timeLimitS }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: err instanceof SolverError ? 502 : 500 });
  }
}
