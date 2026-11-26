"use client";

import { Info } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  /** Dostępna nazwa przycisku, np. „Wyjaśnienie: Pojemność bufora”. */
  label: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

const OPEN_DELAY = 120;
const CLOSE_DELAY = 180;

/**
 * Ikona ⓘ z wyjaśnieniem. Otwiera się po najechaniu myszą, po wejściu klawiszem Tab (fokus z klawiatury)
 * oraz po kliknięciu / dotknięciu — dlatego bazuje na Popover, a nie na Tooltip (tooltipy nie działają na dotyk).
 * Esc zamyka; fokus zostaje na przycisku.
 */
export function InfoTooltip({ label, children, side = "top", className }: Props) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const later = (value: boolean, ms: number) => {
    clear();
    timer.current = setTimeout(() => setOpen(value), ms);
  };
  useEffect(() => clear, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-help-icon=""
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "[@media(pointer:coarse)]:size-7",
            className,
          )}
          onPointerEnter={(e) => e.pointerType === "mouse" && later(true, OPEN_DELAY)}
          onPointerLeave={(e) => e.pointerType === "mouse" && later(false, CLOSE_DELAY)}
          onFocus={(e) => e.currentTarget.matches(":focus-visible") && later(true, 0)}
          onBlur={() => later(false, CLOSE_DELAY)}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        className="w-[min(17rem,calc(100vw-2rem))] text-xs leading-relaxed"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={clear}
        onPointerLeave={(e) => e.pointerType === "mouse" && later(false, CLOSE_DELAY)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
