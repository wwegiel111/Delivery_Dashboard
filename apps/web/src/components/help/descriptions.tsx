/**
 * Krótkie opisy kontekstowe (słownik `tooltips.*`, maks. dwa krótkie zdania).
 * Synchroniczne — działają w Server i Client Components.
 */
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Messages } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "./info-tooltip";

type Tips = Messages["tooltips"];
export type TipGroup = Exclude<keyof Tips, "infoAria">;
export type TipId<G extends TipGroup> = keyof Tips[G] & string;
export type MetricId = TipId<"metrics">;
export type ParamId = keyof Messages["settings"]["fields"] & string;

/** Ikona ⓘ z opisem `tooltips.<group>.<id>`; `topic` to nazwa elementu dla czytników ekranu. */
export function HelpTip<G extends TipGroup>({ group, id, topic, side }: { group: G; id: TipId<G>; topic: string; side?: "top" | "right" | "bottom" | "left" }) {
  const t = useTranslations("tooltips");
  // Klucz jest typowany przez `group` + `id`; next-intl nie zawęża szablonu z generykiem, stąd rzutowanie.
  const tt = t as unknown as (key: string, values?: Record<string, string>) => string;
  return (
    <InfoTooltip label={tt("infoAria", { topic })} side={side}>
      {tt(`${group}.${id}`)}
    </InfoTooltip>
  );
}

/** Krótka informacja widoczna bez otwierania podpowiedzi. */
export function FieldDescription({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <p id={id} className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/** Tekst z ikoną pomocy — ikona zawsze za tekstem. */
export function WithHelp({ children, help, className }: { children: ReactNode; help: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {children}
      {help}
    </span>
  );
}
