"use client";

import { Loader2, Plus, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/server/form-state";

export function DocForm({
  action,
  submitLabel,
  submitTour,
  icon = "plus",
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  /** Atrybut `data-tour` przycisku zapisu (samouczek). */
  submitTour?: string;
  icon?: "plus" | "save";
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true, message: "" });
  const Icon = icon === "save" ? Save : Plus;
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} data-tour={submitTour}>
          {pending ? <Loader2 className="animate-spin" /> : <Icon />} {submitLabel}
        </Button>
        <p role="status" aria-live="polite" className={state.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {state.message}
        </p>
      </div>
    </form>
  );
}
