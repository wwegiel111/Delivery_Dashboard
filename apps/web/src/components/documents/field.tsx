import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Pole formularza z etykietą, opcjonalną podpowiedzią widoczną pod polem (`hint`)
 * i opcjonalną ikoną wyjaśnienia (`help`) za etykietą. Pola wymagane mają gwiazdkę.
 */
export function Field({
  label,
  name,
  hint,
  help,
  tour,
  ...props
}: { label: string; name: string; hint?: string; help?: ReactNode; tour?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${name}-hint` : undefined;
  if (props.type === "checkbox")
    return (
      <div className="flex items-center gap-1 self-end pb-2 text-sm" data-tour={tour}>
        <label className="flex items-center gap-2">
          <input name={name} {...props} className="size-4 accent-current" /> {label}
        </label>
        {help}
      </div>
    );
  return (
    <div className="space-y-1.5" data-tour={tour}>
      <div className="flex min-h-5 items-center gap-1">
        <Label htmlFor={name}>
          {label}
          {props.required && (
            <span aria-hidden className="text-destructive">
              {" "}
              *
            </span>
          )}
        </Label>
        {help}
      </div>
      <Input id={name} name={name} aria-describedby={hintId} {...props} />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
