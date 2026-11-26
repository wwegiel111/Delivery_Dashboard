import { localDayStart, localTimeOn, slotToDate } from "@etpromo/contracts";
import { prisma } from "@etpromo/db";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Info, Loader2, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { HelpTip, WithHelp, type MetricId } from "@/components/help/descriptions";
import { BufferChart } from "@/components/plan/buffer-chart";
import { CarrierEmails, DocumentLanguageProvider, DocumentLanguageSelect, PdfButton, type EmailsByLocale } from "@/components/plan/document-language";
import { GenerationGate, SolvingWatcher } from "@/components/plan/generation";
import { PlanTabs } from "@/components/plan/plan-tabs";
import { Timeline } from "@/components/plan/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LOCALES, type Locale } from "@/i18n/config";
import { currentLocale } from "@/i18n/server";
import { translator, type Translator } from "@/i18n/translator";
import { fmtDayTime, fmtNumber, fmtPercent, fmtTime, isoDay, longDate, shortDate, weekdayShort } from "@/lib/time-format";
import { localizeError } from "@/server/errors";
import { carrierEmails, crewsPl, docksText, mailtoHref } from "@/server/report/report";
import { dockLabel, translateHint } from "@/server/scheduling/hints";
import { mainPanel, type FailureKind, type RunPhase } from "@/server/scheduling/run-state";
import { deliveriesForDate, getActiveParams, getRunView, listRuns, reportData, weekOverview, type RunView, type WeekDay } from "@/server/scheduling/plan";
import { DeleteRunButton, SolveWeekButton } from "./run-actions";
import { SolveButton } from "./solve-button";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
type RunStatusKey = RunView["status"];

async function defaultDate(tz: string): Promise<string> {
  const today = isoDay(new Date(), tz);
  const next = await prisma.delivery.findFirst({
    where: {
      status: "PLANNED",
      deliveryDate: { gte: new Date(`${today}T00:00:00Z`) },
    },
    orderBy: { deliveryDate: "asc" },
    select: { deliveryDate: true },
  });
  return next ? next.deliveryDate.toISOString().slice(0, 10) : today;
}

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; run?: string }> }) {
  const sp = await searchParams;
  const locale = await currentLocale();
  const t = translator(locale);
  let params;
  try {
    params = await getActiveParams();
  } catch (e) {
    return <SetupNeeded title={t("scheduling.setupTitle")} message={localizeError(e, locale)} />;
  }
  const tz = params.timezone;
  const date = sp.date && ISO.test(sp.date) ? sp.date : await defaultDate(tz);
  const [deliveries, runs, week] = await Promise.all([deliveriesForDate(date), listRuns(date), weekOverview(date)]);
  const runId = sp.run ? Number(sp.run) : runs[0]?.id;
  const view = runId ? await getRunView(runId, locale) : null;
  const pallets = deliveries.reduce((s, d) => s + d.pallets, 0);
  const tg = await getTranslations("scheduling");
  const explicitRun = !!sp.run && !!view;
  // Trwające generowanie (według bazy) to stan „w toku”, nigdy porażka — patrz mainPanel().
  const panel = mainPanel({ view, explicitRun, pendingHere: false });
  const daySolving = runs.some((r) => r.phase === "solving");
  const anySolving = daySolving || week.some((d) => d.run?.phase === "solving");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{tg("title", { date: longDate(date, locale) })}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Button asChild variant="ghost" size="icon" aria-label={tg("prevDay")}>
              <Link href={`/schedule?date=${shiftDay(date, -1)}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <form action="/schedule" className="flex items-center gap-2">
              <Input type="date" name="date" defaultValue={date} className="h-8 w-40" aria-label={tg("dayInput")} lang={locale} />
              <Button type="submit" variant="outline" size="sm">
                {tg("show")}
              </Button>
            </form>
            <Button asChild variant="ghost" size="icon" aria-label={tg("nextDay")}>
              <Link href={`/schedule?date=${shiftDay(date, 1)}`}>
                <ChevronRight />
              </Link>
            </Button>
            <span>
              {tg("daySummary", { trucks: t("common.trucks", { count: deliveries.length }), pallets: t("common.pallets", { count: pallets }) })} ·{" "}
              <Link className="underline" href={`/deliveries?date=${date}`}>
                {tg("deliveriesLink")}
              </Link>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2" data-tour="solve-buttons">
          <SolveWeekButton days={week.filter((d) => d.trucks > 0).map((d) => d.date)} />
          <SolveButton date={date} disabled={deliveries.length === 0} serverSolving={daySolving} />
        </div>
      </div>

      <WeekStrip week={week} selected={date} tz={tz} locale={locale} t={t} />

      {runs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" data-tour="versions">
          <WithHelp help={<HelpTip group="actions" id="versions" topic={tg("versions")} />} className="text-muted-foreground">
            {tg("versions")}
          </WithHelp>
          {runs.map((r) => (
            <Link key={r.id} href={`/schedule?date=${date}&run=${r.id}`} aria-current={r.id === runId ? "true" : undefined}>
              <Badge variant={r.id === runId ? "default" : "outline"} className="gap-1">
                <StateIcon phase={r.phase} />
                {tg("versionBadge", { id: r.id, created: fmtDayTime(r.createdAt, tz, locale), status: runLabel(r, t) })}
              </Badge>
            </Link>
          ))}
          {runId && runs.some((r) => r.id === runId && r.phase !== "solving") && <DeleteRunButton runId={runId} date={date} />}
        </div>
      )}

      <SolvingWatcher solving={anySolving} />
      <GenerationGate date={date} serverPanel={panel} explicitRun={explicitRun} hasView={!!view}>
        {!view ? (
          <Card data-tour="plan-empty">
            <CardHeader>
              <CardTitle>{deliveries.length === 0 ? tg("noDeliveriesTitle") : tg("notPlannedTitle")}</CardTitle>
              <CardDescription>
                {deliveries.length === 0
                  ? tg.rich("noDeliveriesBody", {
                      link: (chunks) => (
                        <Link className="underline" href="/deliveries">
                          {chunks}
                        </Link>
                      ),
                    })
                  : tg("notPlannedBody")}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : panel === "failure" ? (
          <FailurePanel view={view} t={t} />
        ) : (
          <RunDetails view={view} tz={tz} params={params} locale={locale} t={t} />
        )}
      </GenerationGate>
    </div>
  );
}

/** Etykieta wersji planu zgodna z jej stanem (w toku / gotowy / rodzaj porażki). */
function runLabel(r: { status: RunView["status"]; phase: RunPhase; failure: FailureKind | null }, t: Translator): string {
  if (r.phase === "solving") return t("scheduling.state.solving");
  if (r.phase === "failed") return t(`scheduling.state.${r.failure ?? "unexpected"}`);
  return t(`statuses.run.${r.status}`);
}

/** Ikona stanu — kolor nie jest jedynym nośnikiem informacji (tekst obok zawsze opisuje stan). */
function StateIcon({ phase, stale }: { phase: RunPhase | null; stale?: boolean }) {
  if (phase === "solving") return <Loader2 aria-hidden className="size-3 shrink-0 animate-spin motion-reduce:animate-none" />;
  if (phase === "failed") return <XCircle aria-hidden className="size-3 shrink-0" />;
  if (phase === "success" && stale) return <AlertTriangle aria-hidden className="size-3 shrink-0" />;
  if (phase === "success") return <CheckCircle2 aria-hidden className="size-3 shrink-0" />;
  return <CircleDashed aria-hidden className="size-3 shrink-0" />;
}

/** Czerwony panel tylko dla zakończonego przebiegu bez planu — z przyczyną i praktyczną wskazówką. */
function FailurePanel({ view, t }: { view: RunView; t: Translator }) {
  const kind = view.failure ?? "unexpected";
  // Ogólne komunikaty solvera powtarzałyby opis — zostawiamy tylko konkretne (np. które auto się nie mieści).
  const generic = new Set([t("solverHints.infeasible"), t("solverHints.timeout")]);
  const hints = view.hints.map((h) => ({ ...h, reason: translateHint(h.reason, t, view.slotMinutes) })).filter((h) => !generic.has(h.reason));
  const showDetails = (kind === "connection" || kind === "unexpected") && view.errorMessage;
  return (
    <Card className="border-destructive" role="alert" data-state="failed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive dark:text-red-400 [@media(prefers-color-scheme:dark)]:text-red-400">
          <XCircle className="size-4 shrink-0" aria-hidden /> {t("scheduling.failure.title")}
        </CardTitle>
        <CardDescription>{t(`scheduling.failure.${kind}`)}</CardDescription>
      </CardHeader>
      {(showDetails || hints.length > 0) && (
        <CardContent className="space-y-2">
          {showDetails && <p className="text-xs text-muted-foreground">{t("scheduling.failure.details", { message: view.errorMessage! })}</p>}
          <Hints hints={hints} rows={view.rows} t={t} />
        </CardContent>
      )}
    </Card>
  );
}

async function RunDetails({
  view,
  tz,
  params,
  locale,
  t,
}: {
  view: RunView;
  tz: string;
  params: Awaited<ReturnType<typeof getActiveParams>>;
  locale: Locale;
  t: Translator;
}) {
  const tg = await getTranslations("scheduling");
  const ok = view.phase === "success";
  const start = new Date(view.horizonStart);
  const at = (s: number) => slotToDate(start, s, view.slotMinutes);
  const time = (s: number) => fmtTime(at(s), tz, locale);
  const k = view.kpis;
  // Maile w obu językach — przełącznik „Język PDF i wiadomości” wybiera wersję bez ponownego zapytania.
  const emails: EmailsByLocale = { pl: [], en: [] };
  if (ok) {
    const report = await reportData(view.id, locale);
    if (report) for (const l of LOCALES) emails[l] = carrierEmails(report.rows, { ...report.meta, locale: l }).map((e) => ({ ...e, href: mailtoHref(e) }));
  }
  const rows = [...view.rows].sort((a, b) => a.arrivalSlot - b.arrivalSlot || a.dock - b.dock);
  const dayStart = localDayStart(view.planDate, tz);
  const windowLabel = (from: string | null, to: string | null) =>
    from || to
      ? t("common.range", {
          from: from ? fmtTime(new Date(from), tz, locale) : t("common.ellipsis"),
          to: to ? fmtTime(new Date(to), tz, locale) : t("common.ellipsis"),
        })
      : t("deliveries.wholeDay");
  const statusLabel = (s: RunStatusKey) => t(`statuses.run.${s}`);
  const hints = view.hints.map((h) => ({ ...h, reason: translateHint(h.reason, t, view.slotMinutes) }));

  // Wąskie gardło: tempo rozładunku grup vs tempo odnoszenia wózkowych.
  const crewRate = Math.round((view.crews * params.fullTruckPallets * 60) / params.fullTruckMinutes);
  const putawayRate = Math.round((view.putawayPerSlot * 60) / view.slotMinutes);
  const bottleneck = ok && k && k.trucks > 1 && putawayRate < crewRate && k.crew_utilization < 0.8;
  const totalPallets = view.rows.reduce((s, r) => s + r.pallets, 0);

  return (
    <>
      {view.staleReasons.length > 0 && (
        <Card className="border-amber-500/60" role="status">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4" style={{ color: "#fab219" }} aria-hidden /> {tg("staleTitle")}
            </CardTitle>
            <CardDescription>{view.staleReasons.join(" · ")}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {ok && (
        <DocumentLanguageProvider>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" data-tour="kpis">
            <Stat
              metric="trucksPallets"
              label={t("statistics.trucksPallets.label")}
              value={`${k!.trucks} / ${totalPallets}`}
              sub={t("statistics.trucksPallets.sub", { docks: docksText(view.docks.length, locale), crews: crewsPl(view.crews, view.crewSize, locale) })}
            />
            <Stat
              metric="arrivals"
              label={t("statistics.arrivals.label")}
              value={t("common.range", { from: time(k!.first_arrival_slot), to: time(k!.last_unload_end_slot) })}
              sub={t("statistics.arrivals.sub")}
            />
            <Stat metric="putaway" label={t("statistics.putaway.label")} value={time(k!.all_putaway_slot)} sub={t("statistics.putaway.sub")} />
            <Stat
              metric="crewUtilization"
              label={t("statistics.crewUtilization.label")}
              value={fmtPercent(k!.crew_utilization, locale)}
              sub={t("statistics.crewUtilization.sub")}
            />
            <Stat
              metric="late"
              label={t("statistics.late.label")}
              value={String(k!.late_trucks)}
              sub={
                k!.late_trucks
                  ? t("statistics.late.subLate", { minutes: k!.total_tardiness_slots * view.slotMinutes }) +
                    (view.relaxed ? t("statistics.late.subRelaxed") : "")
                  : t("statistics.late.subOk")
              }
            />
            <Stat
              metric="bufferPeak"
              label={t("statistics.bufferPeak.label")}
              value={`${k!.max_buffer} / ${view.bufferCapacity}`}
              sub={t("statistics.bufferPeak.sub", {
                percent: fmtPercent(k!.max_buffer / Math.max(1, view.bufferCapacity), locale),
                capacity: view.bufferCapacity,
              })}
            />
          </div>

          {bottleneck && (
            <div className="flex items-start gap-2 rounded-md border bg-card p-3 text-sm" role="note">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                {tg.rich("bottleneck", {
                  crews: view.crews,
                  crewRate,
                  putawayRate,
                  b: (chunks) => <b>{chunks}</b>,
                  link: (chunks) => (
                    <Link className="underline" href="/settings">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-tour="share-tools">
              <PdfButton runId={view.id} />
              <DocumentLanguageSelect />
            </div>
            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
              {tg("runMeta", {
                id: view.id,
                created: fmtDayTime(new Date(view.createdAt), tz, locale),
                status: statusLabel(view.status),
                seconds: fmtNumber((view.wallTimeMs ?? 0) / 1000, locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
              })}
              <HelpTip group="actions" id="runStatus" topic={statusLabel(view.status)} />
            </span>
          </div>

          <PlanTabs>
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="plan">{tg("tabs.plan")}</TabsTrigger>
              <TabsTrigger value="timeline">{tg("tabs.timeline")}</TabsTrigger>
              <TabsTrigger value="buffer">{tg("tabs.buffer")}</TabsTrigger>
              <TabsTrigger value="emails">{tg("tabs.emails", { count: emails[locale].length })}</TabsTrigger>
            </TabsList>
            <TabsContent value="plan">
              <Card data-tour="plan-table">
                <Table>
                  <caption className="sr-only">{tg("table.caption")}</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <WithHelp help={<HelpTip group="columns" id="arrival" topic={tg("table.arrival")} />}>{tg("table.arrival")}</WithHelp>
                      </TableHead>
                      <TableHead>{tg("table.dock")}</TableHead>
                      <TableHead>{tg("table.truck")}</TableHead>
                      <TableHead>{tg("table.carrier")}</TableHead>
                      <TableHead>{tg("table.waybill")}</TableHead>
                      <TableHead className="text-right">{tg("table.pallets")}</TableHead>
                      <TableHead>
                        <WithHelp help={<HelpTip group="columns" id="unload" topic={tg("table.unload")} />}>{tg("table.unload")}</WithHelp>
                      </TableHead>
                      <TableHead>{tg("table.crew")}</TableHead>
                      <TableHead>
                        <WithHelp help={<HelpTip group="columns" id="window" topic={tg("table.window")} />}>{tg("table.window")}</WithHelp>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.deliveryId}>
                        <TableCell className="text-base font-semibold">{time(r.arrivalSlot)}</TableCell>
                        <TableCell className="text-base font-semibold">{r.dock}</TableCell>
                        <TableCell className="font-mono text-xs">{r.truckPlate ?? t("common.dash")}</TableCell>
                        <TableCell>{r.carrier}</TableCell>
                        <TableCell className="font-mono text-xs">{r.waybillNumber}</TableCell>
                        <TableCell className="text-right">{r.pallets}</TableCell>
                        <TableCell>{t("common.range", { from: time(r.startSlot), to: time(r.endSlot) })}</TableCell>
                        <TableCell>{r.crew}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {windowLabel(r.windowFrom, r.windowTo)}
                          {r.lateBySlots > 0 && (
                            <span className="ml-1 inline-flex items-center gap-1 font-medium text-destructive">
                              <AlertTriangle className="size-3" aria-hidden /> {tg("table.late", { minutes: r.lateBySlots * view.slotMinutes })}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
            <TabsContent value="timeline">
              <Timeline
                trucks={view.rows}
                docks={view.docks.map((d) => ({ number: d.number, name: dockLabel(d.name, d.number, t) }))}
                crews={view.crews}
                horizonStart={view.horizonStart}
                slotMinutes={view.slotMinutes}
                horizonSlots={view.horizonSlots}
                closedSlots={view.closedSlots}
                breaks={view.breaks}
                tz={tz}
              />
            </TabsContent>
            <TabsContent value="buffer" className="space-y-2">
              <BufferChart
                inflow={view.inflow}
                putaway={view.putaway}
                level={view.bufferLevel}
                capacity={view.bufferCapacity}
                putawayPerSlot={view.putawayPerSlot}
                horizonStart={view.horizonStart}
                slotMinutes={view.slotMinutes}
                closedSlots={view.closedSlots}
                tz={tz}
              />
              <p className="text-xs text-muted-foreground">
                {tg("bufferNote", { from: fmtTime(localTimeOn(dayStart, params.workFrom, tz), tz, locale), to: params.workTo })}
              </p>
            </TabsContent>
            <TabsContent value="emails">
              <CarrierEmails emails={emails} />
            </TabsContent>
          </PlanTabs>
          {hints.length > 0 && (
            <div>
              <Hints hints={hints} rows={view.rows} t={t} />
            </div>
          )}
        </DocumentLanguageProvider>
      )}
    </>
  );
}

/** Tydzień w pigułce: dostawy i ostatni plan każdego dnia. */
function WeekStrip({ week, selected, tz, locale, t }: { week: WeekDay[]; selected: string; tz: string; locale: Locale; t: Translator }) {
  const visible = week.filter((d, i) => i < 5 || d.trucks > 0 || d.date === selected);
  const total = week.reduce((s, d) => s + d.trucks, 0);
  const pallets = week.reduce((s, d) => s + d.pallets, 0);
  const isOk = (d: WeekDay) => d.run?.phase === "success";
  return (
    <nav aria-label={t("scheduling.week.aria")} className="space-y-1.5" data-tour="week-strip">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {t("scheduling.week.summary", {
          from: shortDate(week[0]!.date, locale),
          to: shortDate(week[6]!.date, locale),
          trucks: t("common.trucks", { count: total }),
          pallets: t("common.pallets", { count: pallets }),
          planned: week.filter((d) => d.trucks > 0 && isOk(d) && !d.run!.stale).length,
          total: week.filter((d) => d.trucks > 0).length,
        })}
        <HelpTip group="actions" id="weekStrip" topic={t("scheduling.week.aria")} />
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
        {visible.map((d) => {
          const at = (s: number | null) =>
            s === null || !d.run ? t("common.dash") : fmtTime(slotToDate(new Date(d.run.horizonStart), s, d.run.slotMinutes), tz, locale);
          // Kolory: szary = brak planu, bursztyn + spinner = generowanie, bursztyn + trójkąt = plan nieaktualny,
          // zielony = gotowy plan, czerwony = porażka. Brak wyniku nie jest porażką.
          const phase = d.trucks ? (d.run?.phase ?? null) : null;
          const tone =
            phase === "solving" || (phase === "success" && d.run?.stale)
              ? "text-amber-700 dark:text-amber-400 [@media(prefers-color-scheme:dark)]:text-amber-400"
              : phase === "failed"
                ? "text-destructive dark:text-red-400 [@media(prefers-color-scheme:dark)]:text-red-400"
                : phase === "success"
                  ? "text-emerald-700 dark:text-emerald-400 [@media(prefers-color-scheme:dark)]:text-emerald-400"
                  : "text-muted-foreground";
          const status = !d.trucks
            ? t("scheduling.week.noDeliveries")
            : !d.run
              ? t("scheduling.week.noPlan")
              : d.run.phase !== "success"
                ? runLabel(d.run, t)
                : d.run.stale
                  ? t("scheduling.week.stale")
                  : t("scheduling.week.done", { end: at(d.run.lastEndSlot) });
          return (
            <Link
              key={d.date}
              href={`/schedule?date=${d.date}`}
              aria-current={d.date === selected ? "date" : undefined}
              className={`rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent ${d.date === selected ? "border-foreground" : ""}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="whitespace-nowrap font-medium">
                  {weekdayShort(d.date, locale)} {shortDate(d.date, locale)}
                </span>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {t("scheduling.week.counts", { trucks: t("common.trucks", { count: d.trucks }), pallets: t("common.palletsShort", { count: d.pallets }) })}
                </span>
              </div>
              <div className={`mt-0.5 flex items-center gap-1 text-xs ${tone}`} data-state={phase ?? "none"}>
                {d.trucks > 0 && <StateIcon phase={phase} stale={d.run?.stale} />}
                <span className="truncate">{status}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Hints({ hints, rows, t }: { hints: RunView["hints"]; rows: RunView["rows"]; t: Translator }) {
  if (hints.length === 0) return null;
  const ref = (id: string | null) => (id ? (rows.find((r) => String(r.deliveryId) === id)?.waybillNumber ?? t("scheduling.hintTruck", { id })) : null);
  return (
    <ul className="space-y-1.5 text-sm">
      {hints.map((h, i) => (
        <li key={i} className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            {ref(h.truck_id) && <span className="font-mono text-xs">{ref(h.truck_id)} — </span>}
            {h.reason}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ metric, label, value, sub }: { metric: MetricId; label: string; value: ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-start justify-between gap-1 text-xs text-muted-foreground">
          <span>{label}</span>
          <HelpTip group="metrics" id={metric} topic={label} />
        </div>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SetupNeeded({ title, message }: { title: string; message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="font-mono text-xs text-muted-foreground">npm run db:migrate && npm run db:seed</CardContent>
    </Card>
  );
}
