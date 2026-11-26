import type { ReactNode } from "react";
import { GenerationProvider } from "@/components/plan/generation";

/** Stan generowania planów żyje w layoucie, więc przejście na inny dzień nie przerywa ani nie ukrywa trwającego generowania. */
export default function ScheduleLayout({ children }: { children: ReactNode }) {
  return <GenerationProvider>{children}</GenerationProvider>;
}
