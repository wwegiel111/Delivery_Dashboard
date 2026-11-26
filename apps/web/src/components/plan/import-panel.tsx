"use client";

import { Download, FileCheck2, Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { HelpTip } from "@/components/help/descriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Summary {
  deliveries: { waybillNumber: string; carrier: string; deliveryDate: string; pallets: number }[];
  errors: { row: number; message: string }[];
  warnings: string[];
  committed: boolean;
  error?: string;
}

export function ImportPanel() {
  const t = useTranslations("import");
  const tc = useTranslations("common");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"check" | "commit" | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function send(commit: boolean) {
    const file = input.current?.files?.[0];
    if (!file) return;
    setBusy(commit ? "commit" : "check");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("commit", commit ? "1" : "0");
    try {
      const res = await fetch("/api/import/deliveries", { method: "POST", body: fd });
      const body = (await res.json()) as Partial<Summary>;
      setSummary({ deliveries: [], errors: [], warnings: [], committed: false, ...body });
      if (body.committed) router.refresh();
    } catch (e) {
      setSummary({ deliveries: [], errors: [], warnings: [], committed: false, error: t("requestFailed", { error: String(e) }) });
    } finally {
      setBusy(null);
    }
  }

  const canCommit = summary && !summary.error && summary.errors.length === 0 && !summary.committed && summary.deliveries.length > 0;
  const dates = summary ? [...new Set(summary.deliveries.map((d) => d.deliveryDate))].sort() : [];
  const counts = summary
    ? { waybills: tc("waybills", { count: summary.deliveries.length }), pallets: tc("pallets", { count: summary.deliveries.reduce((s, d) => s + d.pallets, 0) }) }
    : null;

  return (
    <Card data-tour="import-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-1 text-base">
          {t("title")}
          <HelpTip group="actions" id="import" topic={t("title")} />
        </CardTitle>
        <CardDescription>
          {t("description")}{" "}
          <a className="inline-flex items-center gap-1 underline" href="/api/import/deliveries">
            <Download className="size-3" aria-hidden /> {t("template")}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            ref={input}
            type="file"
            accept=".csv,.xlsx,.txt"
            className="max-w-xs"
            aria-label={t("fileLabel")}
            onChange={() => setSummary(null)}
          />
          <Button variant="outline" onClick={() => send(false)} disabled={busy !== null}>
            {busy === "check" ? <Loader2 className="animate-spin" /> : <FileCheck2 />} {t("check")}
          </Button>
          <Button onClick={() => send(true)} disabled={busy !== null || !canCommit}>
            {busy === "commit" ? <Loader2 className="animate-spin" /> : <Upload />} {t("commit")}
          </Button>
        </div>
        <div aria-live="polite">
          {summary?.error && (
            <p role="alert" className="text-sm text-destructive">
              {summary.error}
            </p>
          )}
          {summary && !summary.error && counts && (
            <div className="space-y-2 text-sm">
              <p>
                {summary.committed ? t("imported", counts) : t("recognized", counts)}
                {dates.length > 0 && <span className="text-muted-foreground">{t("days", { days: dates.join(", ") })}</span>}
              </p>
              {summary.committed && dates.length > 0 && (
                <p>
                  <a className="underline" href={`/schedule?date=${dates[0]}`}>
                    {t("goToPlan", { date: dates[0]! })}
                  </a>
                </p>
              )}
              {summary.warnings.map((w) => (
                <p key={w} className="text-xs text-muted-foreground">
                  {w}
                </p>
              ))}
              {summary.errors.length > 0 && (
                <div role="alert" className="space-y-1">
                  <p className="text-xs font-medium text-destructive">{t("errorsTitle")}</p>
                  <ul className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-destructive/40 p-2 text-xs text-destructive">
                    {summary.errors.map((e, i) => (
                      <li key={i}>{t("rowError", { row: e.row, message: e.message })}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
