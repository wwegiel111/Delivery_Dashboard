"use client";

import { Download, FileCheck2, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
      setSummary({ deliveries: [], errors: [], warnings: [], committed: false, error: String(e) });
    } finally {
      setBusy(null);
    }
  }

  const canCommit = summary && !summary.error && summary.errors.length === 0 && !summary.committed && summary.deliveries.length > 0;
  const dates = summary ? [...new Set(summary.deliveries.map((d) => d.deliveryDate))].sort() : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import list przewozowych (CSV / XLSX)</CardTitle>
        <CardDescription>
          Jeden wiersz to jedno auto albo jedna pozycja listu: wiersze z tym samym numerem listu są łączone, a palety sumowane. Ponowny import aktualizuje dostawę.{" "}
          <a className="inline-flex items-center gap-1 underline" href="/api/import/deliveries">
            <Download className="size-3" /> szablon CSV
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input ref={input} type="file" accept=".csv,.xlsx,.txt" className="max-w-xs" onChange={() => setSummary(null)} />
          <Button variant="outline" onClick={() => send(false)} disabled={busy !== null}>
            {busy === "check" ? <Loader2 className="animate-spin" /> : <FileCheck2 />} Sprawdź
          </Button>
          <Button onClick={() => send(true)} disabled={busy !== null || !canCommit}>
            {busy === "commit" ? <Loader2 className="animate-spin" /> : <Upload />} Importuj
          </Button>
        </div>
        {summary?.error && <p className="text-sm text-destructive">{summary.error}</p>}
        {summary && !summary.error && (
          <div className="space-y-2 text-sm">
            <p>
              {summary.committed ? "Zaimportowano" : "Rozpoznano"} {summary.deliveries.length} list(ów) przewozowych,{" "}
              {summary.deliveries.reduce((s, d) => s + d.pallets, 0)} palet
              {dates.length > 0 && <span className="text-muted-foreground"> · dni: {dates.join(", ")}</span>}
            </p>
            {summary.committed && dates.length > 0 && (
              <p>
                <a className="underline" href={`/schedule?date=${dates[0]}`}>
                  Przejdź do planu dnia {dates[0]} →
                </a>
              </p>
            )}
            {summary.warnings.map((w) => (
              <p key={w} className="text-xs text-muted-foreground">
                {w}
              </p>
            ))}
            {summary.errors.length > 0 && (
              <ul className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-destructive/40 p-2 text-xs text-destructive">
                {summary.errors.map((e, i) => (
                  <li key={i}>
                    wiersz {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
