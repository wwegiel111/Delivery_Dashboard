"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/tabs";
import { TOUR_TAB_EVENT } from "@/onboarding/events";
import type { PlanTab } from "@/onboarding/tour-definition";

const TABS: readonly PlanTab[] = ["plan", "timeline", "buffer", "emails"];
const isTab = (v: unknown): v is PlanTab => typeof v === "string" && (TABS as readonly string[]).includes(v);

/** Zakładki planu sterowane przez użytkownika i — na czas samouczka — przez zdarzenie `etp:tour-tab`. */
export function PlanTabs({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<PlanTab>("plan");
  useEffect(() => {
    const on = (e: Event) => {
      const v = (e as CustomEvent<unknown>).detail;
      if (isTab(v)) setTab(v);
    };
    window.addEventListener(TOUR_TAB_EVENT, on);
    return () => window.removeEventListener(TOUR_TAB_EVENT, on);
  }, []);
  return (
    <Tabs value={tab} onValueChange={(v) => isTab(v) && setTab(v)}>
      {children}
    </Tabs>
  );
}
