"use client";

import { Loader2, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useGeneration } from "@/components/plan/generation";
import { Button } from "@/components/ui/button";

/**
 * Generowanie planu dnia. Zablokowane, gdy ten dzień już się generuje (w tej karcie albo według bazy — `serverSolving`)
 * lub trwa generowanie tygodnia — bez zdublowanych żądań.
 */
export function SolveButton({ date, disabled, serverSolving }: { date: string; disabled?: boolean; serverSolving?: boolean }) {
  const t = useTranslations("scheduling");
  const { pending, week, errors, runDay } = useGeneration();
  const busy = pending.has(date) || !!serverSolving;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={() => void runDay(date)} disabled={busy || disabled || !!week} aria-busy={busy}>
        {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Play />}
        {busy ? t("solving") : t("solveDay")}
      </Button>
      {errors[date] && (
        <p role="alert" className="max-w-md text-right text-xs text-destructive">
          {errors[date]}
        </p>
      )}
    </div>
  );
}
