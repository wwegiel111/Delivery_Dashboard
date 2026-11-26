import type { PlanTab } from "./tour-definition";

/** Zdarzenie przeglądarki: samouczek prosi ekran planu o pokazanie zakładki (bez zmiany danych). */
export const TOUR_TAB_EVENT = "etp:tour-tab";

export function requestPlanTab(tab: PlanTab) {
  window.dispatchEvent(new CustomEvent<PlanTab>(TOUR_TAB_EVENT, { detail: tab }));
}
