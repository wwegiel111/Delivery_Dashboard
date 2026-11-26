"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Stan generowania planów w przeglądarce. Provider siedzi w layoucie /schedule, więc przetrwa przejścia między dniami
 * (zapytanie do solvera nie ginie, a postęp tygodnia jest dalej widoczny). Źródłem prawdy po odświeżeniu strony jest baza
 * (wersja planu ze statusem SOLVING) — wtedy `SolvingWatcher` odświeża widok, aż wynik będzie gotowy.
 */
type WeekProgress = {
  current: number;
  total: number;
  date: string;
};

interface GenerationApi {
  /** Dni, dla których ta karta czeka na odpowiedź solvera. */
  pending: ReadonlySet<string>;
  week: WeekProgress | null;
  /** Błędy bez zapisanej wersji planu (np. brak aktywnych stanowisk) — pokazywane pod przyciskiem dnia. */
  errors: Readonly<Record<string, string>>;
  weekErrors: string[];
  runDay: (date: string) => Promise<void>;
  runWeek: (days: string[]) => Promise<void>;
  setServerSolving: (solving: boolean) => void;
}

const Ctx = createContext<GenerationApi | null>(null);

export function useGeneration(): GenerationApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGeneration outside <GenerationProvider>");
  return c;
}

/** Co ile odświeżać widok, gdy coś się generuje (bez wymyślonego postępu — tylko sprawdzamy, czy wynik już jest). */
const POLL_MS = 3000;

type SolveBody = { runId?: number; status?: string; error?: string };

export function GenerationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const te = useTranslations("errors");
  const ts = useTranslations("scheduling");
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [week, setWeek] = useState<WeekProgress | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [weekErrors, setWeekErrors] = useState<string[]>([]);
  const [serverSolving, setServerSolving] = useState(false);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const mark = (date: string, on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(date);
      else next.delete(date);
      return next;
    });

  /** Jedno żądanie do /api/schedule/solve. Zwraca odpowiedź albo opis błędu sieci. */
  const solve = useCallback(
    async (date: string): Promise<{ ok: boolean; body: SolveBody }> => {
      try {
        const res = await fetch("/api/schedule/solve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date }) });
        const body = (await res.json().catch(() => ({}))) as SolveBody;
        return { ok: res.ok, body: res.ok ? body : { ...body, error: body.error ?? te("http", { status: res.status }) } };
      } catch (e) {
        return { ok: false, body: { error: e instanceof Error ? e.message : String(e) } };
      }
    },
    [te],
  );

  const currentDate = () => new URLSearchParams(window.location.search).get("date");
  /** Krótko po starcie odświeżamy widok, by wersja „w toku” od razu pojawiła się na liście i w podglądzie tygodnia. */
  const refreshSoon = () => setTimeout(() => router.refresh(), 800);

  const runDay = useCallback(
    async (date: string) => {
      if (pendingRef.current.has(date)) return; // brak zdublowanych żądań dla tego samego dnia
      setErrors(({ [date]: _drop, ...rest }) => rest);
      mark(date, true);
      // Pokazujemy najnowszą wersję dnia (a więc tę generowaną), nawet jeśli wybrana była starsza.
      if (currentDate() === date && new URLSearchParams(window.location.search).has("run")) router.replace(`/schedule?date=${date}`);
      refreshSoon();
      const { body } = await solve(date);
      mark(date, false);
      if (body.error && body.runId === undefined) setErrors((e) => ({ ...e, [date]: body.error! }));
      // Wynik (także nieudany) jest zapisaną wersją — pokazujemy ją, jeśli użytkownik nadal ogląda ten dzień.
      if (body.runId !== undefined && currentDate() === date) router.replace(`/schedule?date=${date}&run=${body.runId}`);
      router.refresh();
    },
    [router, solve],
  );

  const runWeek = useCallback(
    async (days: string[]) => {
      setWeekErrors([]);
      const failed: string[] = [];
      for (const [i, date] of days.entries()) {
        setWeek({ current: i + 1, total: days.length, date });
        mark(date, true);
        refreshSoon();
        const { ok, body } = await solve(date);
        mark(date, false);
        if (!ok && body.runId === undefined) failed.push(ts("weekFailed", { date, error: body.error ?? "" }));
        router.refresh();
      }
      setWeek(null);
      setWeekErrors(failed);
      router.refresh();
    },
    [router, solve, ts],
  );

  // Odświeżanie widoku, dopóki coś się generuje (w tej karcie albo według bazy — np. po odświeżeniu strony).
  const active = pending.size > 0 || serverSolving;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [active, router]);

  const api = useMemo<GenerationApi>(
    () => ({ pending, week, errors, weekErrors, runDay, runWeek, setServerSolving }),
    [pending, week, errors, weekErrors, runDay, runWeek],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Zgłasza providerowi, że według bazy jakiś przebieg w widoku trwa (włącza odświeżanie). */
export function SolvingWatcher({ solving }: { solving: boolean }) {
  const { setServerSolving } = useGeneration();
  useEffect(() => {
    setServerSolving(solving);
    return () => setServerSolving(false);
  }, [solving, setServerSolving]);
  return null;
}

/** Bursztynowy panel „trwa generowanie” — bez czerwieni, ikon błędu i komunikatów o porażce. */
export function GeneratingPanel({ className }: { className?: string }) {
  const t = useTranslations("scheduling.generating");
  const { week } = useGeneration();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-state="generating"
      className={cn("flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-5", className)}
    >
      <Loader2
        aria-hidden
        className="mt-0.5 size-5 shrink-0 animate-spin text-amber-600 motion-reduce:animate-none dark:text-amber-400 [@media(prefers-color-scheme:dark)]:text-amber-400"
      />
      <div className="space-y-1">
        <p className="font-semibold leading-tight">{t("title")}</p>
        <p className="text-sm text-foreground/80">{t("body")}</p>
        {week && <p className="text-xs text-foreground/80">{t("week", week)}</p>}
      </div>
    </div>
  );
}

/**
 * Główny panel planu: w trakcie generowania (w tej karcie lub według bazy) pokazuje GeneratingPanel zamiast wyniku.
 * Decyzję podejmuje serwer (`serverPanel` z `mainPanel()`), a klient dokłada tylko stan „czekam na odpowiedź” tej karty.
 */
export function GenerationGate({
  date,
  serverPanel,
  explicitRun,
  hasView,
  children,
}: {
  date: string;
  serverPanel: "empty" | "generating" | "result" | "failure";
  explicitRun: boolean;
  hasView: boolean;
  children: ReactNode;
}) {
  const { pending } = useGeneration();
  const pendingHere = pending.has(date) && !(explicitRun && hasView);
  if (serverPanel === "generating" || pendingHere) return <GeneratingPanel />;
  return <>{children}</>;
}
