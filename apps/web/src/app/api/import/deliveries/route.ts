import { NextResponse } from "next/server";
import { currentLocale } from "@/i18n/server";
import { translator } from "@/i18n/translator";
import { localizeError } from "@/server/errors";
import { importWaybills, TEMPLATE_HEADERS } from "@/server/deliveries/import";
import { parseUpload } from "@/server/import/table";
import { getActiveParams } from "@/server/scheduling/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXAMPLE = [
  ["CMR/2026/11/0457", "Raben Logistics", "awizacje@raben.example", "WX 12345", "Komponenty Sp. z o.o.", "09.11.2026", "07:00", "11:00", "35", "5", ""],
  ["CMR/2026/11/0458", "DSV Road", "dispatch@dsv.example", "PO 7781K", "Kartonex", "09.11.2026", "", "", "18", "5", "niepełne auto"],
];

/** Szablon CSV listy przewozowej. */
export async function GET() {
  const csv = [TEMPLATE_HEADERS, ...EXAMPLE].map((r) => r.join(";")).join("\n") + "\n";
  return new NextResponse("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="szablon-listy-przewozowe.csv"' },
  });
}

/** multipart: file=<csv|xlsx>, commit=0|1 */
export async function POST(req: Request) {
  const locale = await currentLocale();
  const t = translator(locale);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: t("errors.noFile") }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: t("errors.fileTooLarge") }, { status: 413 });
  try {
    const rows = await parseUpload(file);
    if (rows.length === 0) return NextResponse.json({ error: t("errors.noRows") }, { status: 400 });
    const p = await getActiveParams();
    const summary = await importWaybills(rows, { tz: p.timezone, commit: form.get("commit") === "1", bufferCapacity: p.bufferCapacity, fileName: file.name, locale });
    return NextResponse.json(summary, { status: summary.errors.length > 0 ? 422 : 200 });
  } catch (err) {
    return NextResponse.json({ error: localizeError(err, locale) }, { status: 400 });
  }
}
