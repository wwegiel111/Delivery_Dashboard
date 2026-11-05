import { localDayStart, localTimeOn, slotToDate } from "@etpromo/contracts";
import { prisma } from "@etpromo/db";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Info,
} from "lucide-react";
import Link from "next/link";
import { BufferChart } from "@/components/plan/buffer-chart";
import { EmailCard } from "@/components/plan/email-card";
import { Timeline } from "@/components/plan/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RUN_STATUS_LABEL } from "@/lib/labels";
import { fmtDayTime, fmtTime, isoDay } from "@/lib/time-format";
import {
  carrierEmails,
  crewsPl,
  longDate,
  mailtoHref,
} from "@/server/report/report";
import {
  deliveriesForDate,
  getActiveParams,
  getRunView,
  listRuns,
  reportData,
  weekOverview,
  type RunView,
  type WeekDay,
} from "@/server/scheduling/plan";
import { DeleteRunButton, SolveWeekButton } from "./run-actions";
import { SolveButton } from "./solve-button";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

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

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; run?: string }>;
}) {
  const sp = await searchParams;
  let params;
  try {
    params = await getActiveParams();
  } catch (e) {
    return <SetupNeeded message={e instanceof Error ? e.message : String(e)} />;
  }
  const tz = params.timezone;
  const date = sp.date && ISO.test(sp.date) ? sp.date : await defaultDate(tz);
  const [deliveries, runs, week] = await Promise.all([
    deliveriesForDate(date),
    listRuns(date),
    weekOverview(date),
  ]);
  const runId = sp.run ? Number(sp.run) : runs[0]?.id;
  const view = runId ? await getRunView(runId) : null;
  const pallets = deliveries.reduce((s, d) => s + d.pallets, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Plan przyjęć — {longDate(date)}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Poprzedni dzień"
            >
              <Link href={`/schedule?date=${shiftDay(date, -1)}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <form action="/schedule" className="flex items-center gap-2">
              <Input
                type="date"
                name="date"
                defaultValue={date}
                className="h-8 w-40"
                aria-label="Dzień przyjęć"
              />
              <Button type="submit" variant="outline" size="sm">
                Pokaż
              </Button>
            </form>
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Następny dzień"
            >
              <Link href={`/schedule?date=${shiftDay(date, 1)}`}>
                <ChevronRight />
              </Link>
            </Button>
            <span>
              {deliveries.length} aut · {pallets} palet do przyjęcia ·{" "}
              <Link className="underline" href={`/deliveries?date=${date}`}>
                lista dostaw
              </Link>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <SolveWeekButton
            days={week.filter((d) => d.trucks > 0).map((d) => d.date)}
            current={date}
          />
          <SolveButton date={date} disabled={deliveries.length === 0} />
        </div>
      </div>

      <WeekStrip week={week} selected={date} tz={tz} />

      {runs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Wersje planu:</span>
          {runs.map((r) => (
            <Link key={r.id} href={`/schedule?date=${date}&run=${r.id}`}>
              <Badge variant={r.id === runId ? "default" : "outline"}>
                #{r.id} · {fmtDayTime(r.createdAt, tz)} ·{" "}
                {RUN_STATUS_LABEL[r.status]}
              </Badge>
            </Link>
          ))}
          {runId && runs.some((r) => r.id === runId) && (
            <DeleteRunButton runId={runId} date={date} />
          )}
        </div>
      )}

      {!view ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {deliveries.length === 0
                ? "Brak dostaw na ten dzień"
                : "Plan jeszcze nie został ułożony"}
            </CardTitle>
            <CardDescription>
              {deliveries.length === 0 ? (
                <>
                  Zaimportuj listy przewozowe na stronie{" "}
                  <Link className="underline" href="/deliveries">
                    Dostawy
                  </Link>
                  .
                </>
              ) : (
                <>
                  Kliknij „Ułóż plan przyjęć”. Solver dobierze godziny przyjazdu
                  i stanowiska tak, by {params.crews === 1 ? "grupa" : "grupy"}{" "}
                  ({crewsPl(params.crews, params.crewSize)}){" "}
                  {params.crews === 1 ? "pracowała" : "pracowały"} bez
                  przestojów, a bufor ({params.bufferCapacity} palet) nie
                  przepełnił się, zanim wózkowi odniosą palety na regał.
                </>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <RunDetails view={view} tz={tz} params={params} />
      )}
    </div>
  );
}

async function RunDetails({
  view,
  tz,
  params,
}: {
  view: RunView;
  tz: string;
  params: Awaited<ReturnType<typeof getActiveParams>>;
}) {
  const ok = view.status === "OPTIMAL" || view.status === "FEASIBLE";
  const start = new Date(view.horizonStart);
  const at = (s: number) => slotToDate(start, s, view.slotMinutes);
  const k = view.kpis;
  const report = ok ? await reportData(view.id) : null;
  const emails = report ? carrierEmails(report.rows, report.meta) : [];
  const rows = [...view.rows].sort(
    (a, b) => a.arrivalSlot - b.arrivalSlot || a.dock - b.dock,
  );
  const dayStart = localDayStart(view.planDate, tz);
  const windowLabel = (from: string | null, to: string | null) =>
    from || to
      ? `${from ? fmtTime(new Date(from), tz) : "…"}–${to ? fmtTime(new Date(to), tz) : "…"}`
      : "cały dzień";

  // Wąskie gardło: tempo rozładunku grup vs tempo odnoszenia wózkowych.
  const crewRate = Math.round(
    (view.crews * params.fullTruckPallets * 60) / params.fullTruckMinutes,
  );
  const putawayRate = Math.round((view.putawayPerSlot * 60) / view.slotMinutes);
  const bottleneck =
    ok &&
    k &&
    k.trucks > 1 &&
    putawayRate < crewRate &&
    k.crew_utilization < 0.8;

  return (
    <>
      {view.staleReasons.length > 0 && (
        <Card className="border-amber-500/60">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4" style={{ color: "#fab219" }} />{" "}
              Plan jest nieaktualny — ułóż go ponownie przed wysłaniem
            </CardTitle>
            <CardDescription>{view.staleReasons.join(" · ")}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {!ok ? (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />{" "}
              {RUN_STATUS_LABEL[view.status]}
            </CardTitle>
            <CardDescription>
              {view.errorMessage ?? "Nie udało się ułożyć planu."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Hints hints={view.hints} rows={view.rows} />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat
              label="Aut / palet"
              value={`${k!.trucks} / ${view.rows.reduce((s, r) => s + r.pallets, 0)}`}
              sub={`${view.docks.length} stanowiska · ${crewsPl(view.crews, view.crewSize)}`}
            />
            <Stat
              label="Przyjazdy"
              value={`${fmtTime(at(k!.first_arrival_slot), tz)}–${fmtTime(at(k!.last_unload_end_slot), tz)}`}
              sub="pierwszy przyjazd – koniec rozładunków"
            />
            <Stat
              label="Wszystko na regale"
              value={fmtTime(at(k!.all_putaway_slot), tz)}
              sub="bufor pusty"
            />
            <Stat
              label="Wykorzystanie grup"
              value={`${Math.round(k!.crew_utilization * 100)}%`}
              sub="czas rozładunków / czas pracy grup"
            />
            <Stat
              label="Opóźnienia względem awizacji"
              value={String(k!.late_trucks)}
              sub={
                k!.late_trucks
                  ? `łącznie ${k!.total_tardiness_slots * view.slotMinutes} min${view.relaxed ? " · twarde okna poluzowane" : ""}`
                  : "wszystkie okna dotrzymane"
              }
            />
          </div>

          {bottleneck && (
            <p className="flex items-start gap-2 rounded-md border bg-card p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                Wąskim gardłem jest odnoszenie z bufora: grupy mogą rozładować
                ok. <b>{crewRate} palet/h</b>, a wózkowi odnoszą{" "}
                <b>{putawayRate} palet/h</b>, przy buforze na{" "}
                {view.bufferCapacity} palet. Dlatego{" "}
                {view.crews === 1 ? "grupa" : "grupy"} część dnia czeka
                (wykorzystanie grup {Math.round(k!.crew_utilization * 100)}%).
                Więcej wózkowych przy odnoszeniu lub większy bufor skróci dzień
                — zmień to w{" "}
                <Link className="underline" href="/settings">
                  Parametrach
                </Link>{" "}
                i ułóż plan ponownie.
              </span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <a href={`/api/schedule/${view.id}/report`}>
                <FileDown /> Pobierz PDF planu
              </a>
            </Button>
            <span className="text-xs text-muted-foreground">
              Plan #{view.id} · ułożony{" "}
              {fmtDayTime(new Date(view.createdAt), tz)} ·{" "}
              {RUN_STATUS_LABEL[view.status]} (
              {((view.wallTimeMs ?? 0) / 1000).toFixed(1)} s)
            </span>
          </div>

          <Tabs defaultValue="plan">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="plan">Plan przyjazdów</TabsTrigger>
              <TabsTrigger value="timeline">Oś czasu</TabsTrigger>
              <TabsTrigger value="buffer">Bufor</TabsTrigger>
              <TabsTrigger value="emails">
                Wiadomości do przewoźników ({emails.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="plan">
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Przyjazd</TableHead>
                      <TableHead>Stanowisko</TableHead>
                      <TableHead>Auto</TableHead>
                      <TableHead>Przewoźnik</TableHead>
                      <TableHead>List przewozowy</TableHead>
                      <TableHead className="text-right">Palety</TableHead>
                      <TableHead>Rozładunek</TableHead>
                      <TableHead>Grupa</TableHead>
                      <TableHead>Awizacja</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.deliveryId}>
                        <TableCell className="text-base font-semibold">
                          {fmtTime(at(r.arrivalSlot), tz)}
                        </TableCell>
                        <TableCell className="text-base font-semibold">
                          {r.dock}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.truckPlate ?? "—"}
                        </TableCell>
                        <TableCell>{r.carrier}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.waybillNumber}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.pallets}
                        </TableCell>
                        <TableCell>
                          {fmtTime(at(r.startSlot), tz)}–
                          {fmtTime(at(r.endSlot), tz)}
                        </TableCell>
                        <TableCell>{r.crew}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {windowLabel(r.windowFrom, r.windowTo)}
                          {r.lateBySlots > 0 && (
                            <span className="ml-1 inline-flex items-center gap-1 font-medium text-destructive">
                              <AlertTriangle className="size-3" /> +
                              {r.lateBySlots * view.slotMinutes} min
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
                docks={view.docks}
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
                Palety wjeżdżają na bufor równomiernie w czasie rozładunku, a
                wózkowi odbierają je na bieżąco. Bufor dzielą wszystkie
                stanowiska; solver nie dopuszcza do jego przepełnienia. Godziny
                pracy: {fmtTime(localTimeOn(dayStart, params.workFrom, tz), tz)}
                –{params.workTo}.
              </p>
            </TabsContent>
            <TabsContent value="emails">
              <div className="grid gap-4 lg:grid-cols-2">
                {emails.map((e) => (
                  <EmailCard
                    key={e.carrier + e.to}
                    carrier={e.carrier}
                    to={e.to}
                    subject={e.subject}
                    body={e.body}
                    trucks={e.trucks}
                    href={mailtoHref(e)}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
          {view.hints.length > 0 && (
            <Hints hints={view.hints} rows={view.rows} />
          )}
        </>
      )}
    </>
  );
}

const WEEKDAY = ["pon", "wt", "śr", "czw", "pt", "sob", "nd"];

/** Tydzień w pigułce: dostawy i ostatni plan każdego dnia. */
function WeekStrip({
  week,
  selected,
  tz,
}: {
  week: WeekDay[];
  selected: string;
  tz: string;
}) {
  const visible = week.filter(
    (d, i) => i < 5 || d.trucks > 0 || d.date === selected,
  );
  const total = week.reduce((s, d) => s + d.trucks, 0);
  const pallets = week.reduce((s, d) => s + d.pallets, 0);
  const isOk = (d: WeekDay) =>
    !!d.run && (d.run.status === "OPTIMAL" || d.run.status === "FEASIBLE");
  const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  return (
    <nav aria-label="Dni tygodnia" className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        Tydzień {fmt(week[0]!.date)}–{fmt(week[6]!.date)} · {total} aut ·{" "}
        {pallets} palet ·{" "}
        {week.filter((d) => d.trucks > 0 && isOk(d) && !d.run!.stale).length}/
        {week.filter((d) => d.trucks > 0).length} dni zaplanowanych
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
        {visible.map((d) => {
          const i = (new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7;
          const ok = isOk(d);
          const warn = d.trucks > 0 && (!ok || !!d.run?.stale);
          const at = (s: number | null) =>
            s === null || !d.run
              ? "—"
              : fmtTime(
                  slotToDate(
                    new Date(d.run.horizonStart),
                    s,
                    d.run.slotMinutes,
                  ),
                  tz,
                );
          const status = !d.trucks
            ? "brak dostaw"
            : !d.run
              ? "bez planu"
              : !ok
                ? RUN_STATUS_LABEL[d.run.status].toLowerCase()
                : d.run.stale
                  ? "plan nieaktualny"
                  : `koniec ${at(d.run.lastEndSlot)} · regał ${at(d.run.putawaySlot)}`;
          return (
            <Link
              key={d.date}
              href={`/schedule?date=${d.date}`}
              aria-current={d.date === selected ? "date" : undefined}
              className={`rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent ${d.date === selected ? "border-foreground" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">
                  {WEEKDAY[i]} {fmt(d.date)}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {d.trucks} aut · {d.pallets} pal.
                </span>
              </div>
              <div
                className={`mt-0.5 flex items-center gap-1 text-xs ${warn ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
              >
                {warn && <AlertTriangle className="size-3 shrink-0" />}
                <span className="truncate">{status}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Hints({
  hints,
  rows,
}: {
  hints: RunView["hints"];
  rows: RunView["rows"];
}) {
  if (hints.length === 0) return null;
  const ref = (id: string | null) =>
    id
      ? (rows.find((r) => String(r.deliveryId) === id)?.waybillNumber ??
        `dostawa #${id}`)
      : null;
  return (
    <ul className="space-y-1.5 text-sm">
      {hints.map((h, i) => (
        <li key={i} className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            {ref(h.truck_id) && (
              <span className="font-mono text-xs">{ref(h.truck_id)} — </span>
            )}
            {h.reason}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SetupNeeded({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Baza nie jest gotowa</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="font-mono text-xs text-muted-foreground">
        npm run db:migrate && npm run db:seed
      </CardContent>
    </Card>
  );
}
