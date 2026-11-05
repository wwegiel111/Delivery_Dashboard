"use client";

import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function SolveButton({ date, disabled }: { date: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function solve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/schedule/solve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      startTransition(() => {
        router.push(`/schedule?date=${date}&run=${body.runId}`);
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={solve} disabled={busy || disabled}>
        {busy ? <Loader2 className="animate-spin" /> : <Play />}
        {busy ? "Układam plan…" : "Ułóż plan przyjęć"}
      </Button>
      {error && (
        <p role="alert" className="max-w-md text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
