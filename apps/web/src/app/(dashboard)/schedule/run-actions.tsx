"use client";

import { CalendarRange, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Usuwa wybraną wersję planu (po potwierdzeniu) i wraca do najnowszej wersji dnia. */
export function DeleteRunButton({ runId, date }: { runId: number; date: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function remove() {
    if (!window.confirm(`Usunąć wersję planu #${runId}? Tej operacji nie można cofnąć.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedule/${runId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      startTransition(() => {
        router.push(`/schedule?date=${date}`);
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={remove} disabled={busy}>
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        Usuń wersję #{runId}
      </Button>
      {error && (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

/** Układa plan po kolei dla każdego dnia tygodnia z dostawami. */
export function SolveWeekButton({ days, current }: { days: string[]; current: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  async function solveAll() {
    setErrors([]);
    const failed: string[] = [];
    for (const [i, date] of days.entries()) {
      setProgress(`${i + 1}/${days.length} · ${date}`);
      try {
        const res = await fetch("/api/schedule/solve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) failed.push(`${date}: ${body.error ?? `HTTP ${res.status}`}`);
        else if (body.status !== "OPTIMAL" && body.status !== "FEASIBLE") failed.push(`${date}: plan niewykonalny`);
      } catch (e) {
        failed.push(`${date}: ${e instanceof Error ? e.message : String(e)}`);
      }
      router.refresh();
    }
    setProgress(null);
    setErrors(failed);
    startTransition(() => {
      router.push(`/schedule?date=${current}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={solveAll} disabled={!!progress || days.length === 0}>
        {progress ? <Loader2 className="animate-spin" /> : <CalendarRange />}
        {progress ? `Układam ${progress}` : "Ułóż cały tydzień"}
      </Button>
      {errors.map((e) => (
        <p key={e} role="alert" className="max-w-md text-right text-xs text-destructive">
          {e}
        </p>
      ))}
    </div>
  );
}
