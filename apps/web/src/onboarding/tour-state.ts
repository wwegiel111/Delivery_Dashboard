/**
 * Stan samouczka (czyste funkcje — testowalne bez przeglądarki).
 *
 * Statusy: not_started → in_progress → (paused ↔ in_progress) → completed; albo skipped.
 * Trwałość: status w cookie `etp_tour` (czytany przy SSR → okno powitalne bez migania),
 * numer kroku w localStorage `etp.tour.v2`, „Zrobię to później” w cookie sesyjnym.
 */
export const TOUR_STATUSES = ["not_started", "in_progress", "paused", "completed", "skipped"] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];

export const TOUR_STATUS_COOKIE = "etp_tour";
export const TOUR_LATER_COOKIE = "etp_tour_later";
/** v2: krótki samouczek; pozycje zapisane przez dawną, rozdziałową wersję (v1) są ignorowane. */
export const TOUR_STORAGE_KEY = "etp.tour.v2";
export const TOUR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface TourState {
  status: TourStatus;
  /** Indeks bieżącego kroku. */
  index: number;
}

export const INITIAL_TOUR_STATE: TourState = { status: "not_started", index: 0 };

export function isTourStatus(v: unknown): v is TourStatus {
  return typeof v === "string" && (TOUR_STATUSES as readonly string[]).includes(v);
}

export function parseTourStatus(v: unknown): TourStatus {
  return isTourStatus(v) ? v : "not_started";
}

/** Odczyt pozycji z localStorage (odporny na uszkodzone dane i za duży indeks). */
export function parseTourState(raw: string | null | undefined, status: TourStatus, total: number): TourState {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    const index = typeof v === "object" && v !== null && "index" in v ? (v as { index: unknown }).index : 0;
    return { status, index: typeof index === "number" && Number.isInteger(index) && index >= 0 && index < total ? index : 0 };
  } catch {
    return { status, index: 0 };
  }
}

export type TourAction =
  | { type: "start" }
  | { type: "resume" }
  | { type: "goto"; index: number; total: number }
  | { type: "pause" }
  | { type: "skip" };

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "start":
      return { status: "in_progress", index: 0 };
    case "resume":
      return state.status === "paused" || state.status === "in_progress" ? { ...state, status: "in_progress" } : state;
    case "goto":
      if (state.status !== "in_progress") return state;
      if (action.index >= action.total) return { status: "completed", index: 0 };
      return { ...state, index: Math.max(0, action.index) };
    case "pause":
      return state.status === "in_progress" ? { ...state, status: "paused" } : state;
    case "skip":
      return { status: "skipped", index: 0 };
  }
}

/** Okno powitalne: tylko przy pierwszym wejściu i bez „Zrobię to później” w tej sesji. */
export function shouldShowWelcome(status: TourStatus, laterThisSession: boolean): boolean {
  return status === "not_started" && !laterThisSession;
}
