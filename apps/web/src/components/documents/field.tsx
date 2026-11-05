import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Field({ label, name, hint, ...props }: { label: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  if (props.type === "checkbox")
    return (
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input name={name} {...props} className="size-4 accent-current" /> {label}
      </label>
    );
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
