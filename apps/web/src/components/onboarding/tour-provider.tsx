"use client";

import { driver, type Driver, type PopoverDOM } from "driver.js";
import "driver.js/dist/driver.css";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { requestPlanTab } from "@/onboarding/events";
import { targetsOf, TOUR, type TourStep } from "@/onboarding/tour-definition";
import {
  INITIAL_TOUR_STATE,
  parseTourState,
  shouldShowWelcome,
  TOUR_COOKIE_MAX_AGE,
  TOUR_LATER_COOKIE,
  TOUR_STATUS_COOKIE,
  TOUR_STORAGE_KEY,
  tourReducer,
  type TourAction,
  type TourState,
  type TourStatus,
} from "@/onboarding/tour-state";
import { WelcomeDialog } from "./welcome-dialog";

interface TourApi {
  status: TourStatus;
  /** Pozycja przerwanego / trwającego przebiegu. */
  progress: { step: number; total: number } | null;
  total: number;
  start: () => void;
  resume: () => void;
}

const TourContext = createContext<TourApi | null>(null);

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside <TourProvider>");
  return ctx;
}

const SESSION_KEY = "etp.tour.session";
/** Krótko czekamy na element (przełączenie zakładki, render); potem pokazujemy krok i dalej szukamy elementu w tle. */
const FIRST_WAIT_MS = 200;
const WAIT_MS = 1500;
/** Ostatnio oglądany dzień planu — samouczek wraca na ten sam dzień zamiast na domyślny. */
const LAST_SCHEDULE_KEY = "etp.tour.lastSchedule";

type Action = TourAction | { type: "load"; state: TourState };
function reducer(state: TourState, action: Action): TourState {
  return action.type === "load" ? action.state : tourReducer(state, action);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function isVisible(el: Element) {
  return el.getClientRects().length > 0;
}

function findTarget(ids: string[]): Element | undefined {
  for (const id of ids) {
    const el = document.querySelector(`[data-tour="${id}"]`);
    if (el && isVisible(el)) return el;
  }
  return undefined;
}

/** Czeka, aż element się pojawi (dane się ładują, zakładka się przełącza) — maks. `ms`. */
function waitForTarget(ids: string[], ms: number, isCancelled: () => boolean): Promise<Element | undefined> {
  if (ids.length === 0) return Promise.resolve(undefined);
  const started = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (isCancelled()) return resolve(undefined);
      const el = findTarget(ids);
      if (el || performance.now() - started > ms) return resolve(el);
      setTimeout(tick, 60);
    };
    tick();
  });
}

function setCookie(name: string, value: string, maxAge?: number) {
  document.cookie = `${name}=${value}; path=/; samesite=lax${maxAge ? `; max-age=${maxAge}` : ""}`;
}

/**
 * Samouczek: stan, trwałość i sterowanie podświetleniem (driver.js).
 * Każdy krok to jedno `highlight()`; przejście między stronami robi router, a krok czeka na swój element.
 * Samouczek tylko pokazuje elementy (interakcja z podświetlonym elementem jest zablokowana) —
 * nie tworzy, nie zmienia i nie usuwa danych, nie uruchamia solvera i niczego nie wysyła.
 */
export function TourProvider({ initialStatus, laterThisSession, children }: { initialStatus: TourStatus; laterThisSession: boolean; children: ReactNode }) {
  const t = useTranslations("onboarding");
  // Klucze kroków są budowane dynamicznie z definicji; ich kompletność sprawdza test (tour-definition.test.ts).
  const tDyn = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [state, dispatch] = useReducer(reducer, { ...INITIAL_TOUR_STATE, status: initialStatus });
  const [hydrated, setHydrated] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(() => shouldShowWelcome(initialStatus, laterThisSession));
  const driverRef = useRef<Driver | null>(null);
  const steps = TOUR;

  // Odczyt pozycji z localStorage po zamontowaniu (SSR zna tylko status z cookie).
  useEffect(() => {
    let raw: string | null = null;
    let sameSession = false;
    try {
      raw = localStorage.getItem(TOUR_STORAGE_KEY);
      sameSession = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* tryb prywatny / zablokowany storage — działamy bez pozycji */
    }
    const loaded = parseTourState(raw, initialStatus, TOUR.length);
    // Samouczek przerwany zamknięciem przeglądarki wraca jako „przerwany” (do wznowienia z Pomocy).
    dispatch({ type: "load", state: loaded.status === "in_progress" && !sameSession ? { ...loaded, status: "paused" } : loaded });
    setHydrated(true);
  }, [initialStatus]);

  // Zapis: status w cookie (SSR), pozycja w localStorage.
  useEffect(() => {
    if (!hydrated) return;
    setCookie(TOUR_STATUS_COOKIE, state.status, TOUR_COOKIE_MAX_AGE);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ index: state.index }));
      if (state.status === "in_progress") sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignorujemy */
    }
  }, [hydrated, state]);

  const goto = useCallback((index: number) => dispatch({ type: "goto", index, total: steps.length }), [steps.length]);
  const handlers = useRef({ next: () => {}, prev: () => {}, pause: () => {} });
  handlers.current = {
    next: () => goto(state.index + 1),
    prev: () => goto(Math.max(0, state.index - 1)),
    pause: () => dispatch({ type: "pause" }),
  };

  const ensureDriver = useCallback(() => {
    if (driverRef.current) return driverRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    driverRef.current = driver({
      animate: !reduced,
      smoothScroll: !reduced,
      allowClose: true,
      allowKeyboardControl: false,
      overlayClickBehavior: "none",
      disableActiveInteraction: true,
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 8,
      popoverOffset: 12,
      popoverClass: "etp-tour",
      showButtons: ["next", "previous", "close"],
      onNextClick: () => handlers.current.next(),
      onPrevClick: () => handlers.current.prev(),
      onCloseClick: () => handlers.current.pause(),
    });
    return driverRef.current;
  }, []);

  const destroyDriver = useCallback(() => {
    const d = driverRef.current;
    driverRef.current = null;
    if (d?.isActive()) d.destroy();
  }, []);

  const show = useCallback(
    (el: Element | undefined, cur: TourStep, index: number) => {
      const key = `steps.${cur.id}`;
      const missing = !el && targetsOf(cur).length > 0;
      const isLast = index === steps.length - 1;
      const description =
        `<p>${esc(tDyn(`${key}.body`))}</p>` + (missing ? `<p class="etp-tour-missing">${esc(t("tour.missing"))}</p>` : "");
      const decorate = (p: PopoverDOM) => {
        p.wrapper.setAttribute("role", "dialog");
        p.wrapper.setAttribute("aria-modal", "false");
        p.title.id = "etp-tour-title";
        p.description.id = "etp-tour-desc";
        p.wrapper.setAttribute("aria-labelledby", "etp-tour-title");
        p.wrapper.setAttribute("aria-describedby", "etp-tour-desc");
        p.wrapper.lang = locale;
        p.progress.textContent = t("tour.progress", { current: index + 1, total: steps.length });
        p.progress.style.display = "block";
        p.progress.setAttribute("aria-live", "polite");
        p.closeButton.setAttribute("aria-label", t("tour.close"));
        p.closeButton.title = t("tour.close");
        for (const b of [p.nextButton, p.previousButton, p.closeButton]) b.type = "button";
      };
      ensureDriver().highlight({
        element: el,
        disableActiveInteraction: !cur.interactive,
        popover: {
          title: esc(tDyn(`${key}.title`)),
          description,
          side: el ? cur.side : undefined,
          align: "start",
          showButtons: ["next", "previous", "close"],
          disableButtons: index === 0 ? ["previous"] : [],
          nextBtnText: isLast ? t("tour.finish") : t("tour.next"),
          prevBtnText: t("tour.prev"),
          doneBtnText: t("tour.finish"),
          closeBtnLabel: t("tour.close"),
          onPopoverRender: decorate,
        },
      });
    },
    [ensureDriver, locale, steps, t, tDyn],
  );

  // Sterowanie: właściwa strona → zakładka → element → podświetlenie. Zmiana języka odświeża treść kroku.
  useEffect(() => {
    if (!hydrated) return;
    if (state.status !== "in_progress") {
      destroyDriver();
      return;
    }
    const cur = steps[state.index];
    if (!cur) return;
    if (cur.route && pathname !== cur.route) {
      destroyDriver();
      let search = "";
      try {
        search = cur.route === "/schedule" ? (sessionStorage.getItem(LAST_SCHEDULE_KEY) ?? "") : "";
      } catch {
        /* ignorujemy */
      }
      router.push(cur.route + search);
      return;
    }
    let cancelled = false;
    const ids = targetsOf(cur);
    if (cur.tab) requestPlanTab(cur.tab);
    void (async () => {
      const first = await waitForTarget(ids, FIRST_WAIT_MS, () => cancelled);
      if (cancelled) return;
      // Krok pojawia się od razu (bez „zawieszenia” poprzedniego okna); brakujący element szukamy dalej.
      show(first, cur, state.index);
      if (first || ids.length === 0) return;
      const late = await waitForTarget(ids, WAIT_MS, () => cancelled);
      if (!cancelled && late) show(late, cur, state.index);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, state.status, state.index, steps, pathname, locale, router, show, destroyDriver]);

  // Klawiatura: ← → między krokami, Esc przerywa.
  useEffect(() => {
    if (state.status !== "in_progress") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.key === "ArrowRight") handlers.current.next();
      else if (e.key === "ArrowLeft") handlers.current.prev();
      else if (e.key === "Escape") handlers.current.pause();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.status]);

  useEffect(() => () => destroyDriver(), [destroyDriver]);

  // Zapamiętujemy dzień planu, na którym był użytkownik (np. ?date=…&run=…).
  useEffect(() => {
    if (pathname !== "/schedule") return;
    try {
      sessionStorage.setItem(LAST_SCHEDULE_KEY, window.location.search);
    } catch {
      /* ignorujemy */
    }
  });

  const start = useCallback(() => {
    setWelcomeOpen(false);
    dispatch({ type: "start" });
  }, []);

  const api = useMemo<TourApi>(
    () => ({
      status: state.status,
      progress: state.status === "paused" || state.status === "in_progress" ? { step: state.index + 1, total: steps.length } : null,
      total: steps.length,
      start,
      resume: () => dispatch({ type: "resume" }),
    }),
    [state.status, state.index, steps.length, start],
  );

  return (
    <TourContext.Provider value={api}>
      {children}
      <WelcomeDialog
        open={welcomeOpen}
        steps={TOUR.length}
        onStart={start}
        onLater={() => {
          setCookie(TOUR_LATER_COOKIE, "1");
          setWelcomeOpen(false);
        }}
        onSkip={() => {
          setWelcomeOpen(false);
          dispatch({ type: "skip" });
        }}
      />
    </TourContext.Provider>
  );
}
