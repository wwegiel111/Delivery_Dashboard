/**
 * Samouczek — krótkie wprowadzenie (≤ 20 kroków, ok. 2–3 min).
 * Jedno źródło dla interaktywnego przewodnika i instrukcji /help.
 * Treści: `onboarding.steps.<id>.{title,body}` w messages/*.json.
 * Elementy wskazujemy stabilnymi atrybutami `data-tour="…"` (nie klasami CSS).
 */
import type { Messages } from "@/i18n/messages";

export type StepId = keyof Messages["onboarding"]["steps"] & string;

/** Strona kroku (`null` = bieżąca strona). */
export type TourRoute = "/schedule" | "/deliveries" | "/settings" | null;
/** Zakładki ekranu planu, które samouczek może pokazać (zmiana zakładki nie zmienia danych). */
export type PlanTab = "plan" | "timeline" | "buffer" | "emails";

export interface TourStep {
  id: StepId;
  route: TourRoute;
  /** Kandydaci `data-tour` — pierwszy widoczny wygrywa; brak = okno na środku ekranu. */
  target?: string | string[];
  tab?: PlanTab;
  side?: "top" | "right" | "bottom" | "left";
  /** Podświetlony element można kliknąć (tylko bezpieczne akcje — przełącznik języka). */
  interactive?: boolean;
}

export const TOUR: TourStep[] = [
  { id: "welcome", route: "/schedule" },
  { id: "navigation", route: "/schedule", target: "nav", side: "bottom" },
  { id: "language", route: "/schedule", target: "language-switcher", side: "bottom", interactive: true },
  { id: "import", route: "/deliveries", target: "import-panel", side: "bottom" },
  { id: "addDelivery", route: "/deliveries", target: "delivery-form", side: "top" },
  { id: "deliveryList", route: "/deliveries", target: "deliveries-table", side: "top" },
  { id: "resources", route: "/settings", target: "settings-group-resources", side: "bottom" },
  { id: "weights", route: "/settings", target: "settings-group-weights", side: "top" },
  { id: "saveSettings", route: "/settings", target: "settings-save", side: "top" },
  { id: "pickDay", route: "/schedule", target: "week-strip", side: "bottom" },
  { id: "generate", route: "/schedule", target: "solve-buttons", side: "bottom" },
  { id: "kpis", route: "/schedule", target: ["kpis", "plan-empty"], side: "bottom" },
  { id: "arrivals", route: "/schedule", target: "plan-table", tab: "plan", side: "top" },
  { id: "timeline", route: "/schedule", target: "timeline", tab: "timeline", side: "top" },
  { id: "versions", route: "/schedule", target: "versions", side: "bottom" },
  { id: "share", route: "/schedule", target: "share-tools", tab: "emails", side: "bottom" },
  { id: "finish", route: null, target: "help-button", side: "bottom" },
];

/** Kandydaci elementu jako lista. */
export function targetsOf(step: TourStep): string[] {
  return step.target === undefined ? [] : Array.isArray(step.target) ? step.target : [step.target];
}
