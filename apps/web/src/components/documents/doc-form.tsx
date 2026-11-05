"use client";

import { Loader2, Plus } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/server/form-state";

export function DocForm({
  action,
  submitLabel,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true, message: "" });
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} {submitLabel}
        </Button>
        {state.message && (
          <p role="status" className={state.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
