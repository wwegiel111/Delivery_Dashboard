"use client";

import { CalendarRange, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useGeneration } from "@/components/plan/generation";
import { Button } from "@/components/ui/button";

/** Usuwa wybraną wersję planu (po potwierdzeniu) i wraca do najnowszej wersji dnia. */
export function DeleteRunButton({ runId, date }: { runId: number; date: string }) {
  const t = useTranslations("scheduling");
  const te = useTranslations("errors");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function remove() {
    if (!window.confirm(t("deleteConfirm", { id: runId }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedule/${runId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? te("http", { status: res.status }));
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
        {t("deleteVersion", { id: runId })}
      </Button>
      {error && (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

/** Generuje plan po kolei dla każdego dnia tygodnia z dostawami; postęp i błędy żyją w providerze (przetrwają zmianę dnia). */
export function SolveWeekButton({ days }: { days: string[] }) {
  const t = useTranslations("scheduling");
  const { week, pending, weekErrors, runWeek } = useGeneration();
  const busy = !!week;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={() => void runWeek(days)} disabled={busy || pending.size > 0 || days.length === 0} aria-busy={busy}>
        {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <CalendarRange />}
        <span aria-live="polite">{week ? t("solvingWeek", week) : t("solveWeek")}</span>
      </Button>
      {weekErrors.map((e) => (
        <p key={e} role="alert" className="max-w-md text-right text-xs text-destructive">
          {e}
        </p>
      ))}
    </div>
  );
}
