"use client";

import { slotToDate } from "@etpromo/contracts/time";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtTime } from "@/lib/time-format";
import { cn } from "@/lib/utils";

export interface TimelineTruck {
  deliveryId: number;
  waybillNumber: string;
  carrier: string;
  truckPlate: string | null;
  pallets: number;
  dock: number;
  crew: number;
  arrivalSlot: number;
  startSlot: number;
  endSlot: number;
  lateBySlots: number;
}

interface Props {
  trucks: TimelineTruck[];
  docks: { number: number; name: string }[];
  crews: number;
  horizonStart: string;
  slotMinutes: number;
  horizonSlots: number;
  closedSlots: [number, number][];
  /** Przerwy grup wybrane przez solver. */
  breaks?: { crew: number; start_slot: number; end_slot: number }[];
  tz: string;
}

const BREAK_BG =
  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--text-muted) 28%, transparent) 0 2px, transparent 2px 6px)";

const LABEL_W = 150;
const ROW_H = 40;

let ctx: CanvasRenderingContext2D | null | undefined;
function textWidth(t: string) {
  if (ctx === undefined) {
    ctx =
      typeof document !== "undefined"
        ? document.createElement("canvas").getContext("2d")
        : null;
    if (ctx)
      ctx.font = '500 11px system-ui, -apple-system, "Segoe UI", sans-serif';
  }
  return ctx ? ctx.measureText(t).width : t.length * 7.5;
}

/** Oś dnia: stanowiska (podstawienie + rozładunek) i grupy rozładunkowe. */
export function Timeline({
  trucks,
  docks,
  crews,
  horizonStart,
  slotMinutes,
  horizonSlots,
  closedSlots,
  breaks = [],
  tz,
}: Props) {
  const start = useMemo(() => new Date(horizonStart), [horizonStart]);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState<{
    t: TimelineTruck;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    setMounted(true);
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  // Pokazujemy godziny pracy (z godziną zapasu), nie całą dobę.
  const openFrom = closedSlots.find(([a]) => a === 0)?.[1] ?? 0;
  const openTo =
    closedSlots.find(([, b]) => b === horizonSlots)?.[0] ?? horizonSlots;
  const perHour = 60 / slotMinutes;
  const from = Math.max(
    0,
    Math.min(openFrom, ...trucks.map((t) => t.arrivalSlot)) - perHour,
  );
  const to = Math.min(
    horizonSlots,
    Math.max(openTo, ...trucks.map((t) => t.endSlot)) + perHour,
  );
  const px = Math.max(48 / perHour, (width - LABEL_W) / (to - from)); // min. 48 px na godzinę
  const inner = (to - from) * px;
  const x = (s: number) => (s - from) * px;
  const at = (s: number) => slotToDate(start, s, slotMinutes);

  const rows = [
    ...docks.map((d) => ({
      key: `d${d.number}`,
      label: d.name,
      sub: "stanowisko",
      items: trucks.filter((t) => t.dock === d.number),
      dock: true,
      breaks: [] as typeof breaks,
    })),
    ...Array.from({ length: crews }, (_, i) => ({
      key: `c${i + 1}`,
      label: `Grupa ${i + 1}`,
      sub: "rozładunek",
      items: trucks.filter((t) => t.crew === i + 1),
      dock: false,
      breaks: breaks.filter((b) => b.crew === i + 1),
    })),
  ];

  return (
    <div className="viz-root space-y-2">
      <ul
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-3 rounded-sm"
            style={{
              background:
                "color-mix(in oklab, var(--flow-inbound) 22%, transparent)",
            }}
          />
          podstawienie auta (stanowisko zajęte, grupa wolna)
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-3 rounded-sm"
            style={{ background: "var(--flow-inbound)" }}
          />
          rozładunek na bufor
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-3 rounded-sm border"
            style={{ background: "var(--closed)" }}
          />
          poza godzinami pracy / zmiana zmian
        </li>
        {breaks.length > 0 && (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-3 rounded-sm border"
              style={{ background: BREAK_BG }}
            />
            przerwa grupy
          </li>
        )}
      </ul>
      <div
        ref={box}
        className="overflow-x-auto rounded-lg border"
        style={{ background: "var(--surface-1)" }}
      >
        <div style={{ width: LABEL_W + inner }}>
          <div
            className="flex border-b"
            style={{ borderColor: "var(--baseline)" }}
          >
            <div
              className="sticky left-0 z-10 shrink-0 border-r"
              style={{
                width: LABEL_W,
                background: "var(--surface-1)",
                borderColor: "var(--grid)",
              }}
            />
            <div className="relative h-7" style={{ width: inner }}>
              {Array.from(
                { length: Math.floor((to - from) / perHour) + 1 },
                (_, h) => from + h * perHour,
              )
                .filter((s) => s < to)
                .map((s) => (
                  <span
                    key={s}
                    className="absolute top-1.5 pl-1 text-[11px] tabular-nums"
                    style={{ left: x(s), color: "var(--text-muted)" }}
                  >
                    {fmtTime(at(s), tz)}
                  </span>
                ))}
            </div>
          </div>
          {rows.map((r, idx) => (
            <div
              key={r.key}
              className={cn(
                "flex border-b last:border-b-0",
                idx === docks.length && "border-t-2",
              )}
              style={{ borderColor: "var(--grid)" }}
            >
              <div
                className="sticky left-0 z-10 shrink-0 border-r px-3 py-1.5"
                style={{
                  width: LABEL_W,
                  background: "var(--surface-1)",
                  borderColor: "var(--grid)",
                }}
              >
                <div
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {r.label}
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {r.items.length} aut · {r.sub}
                </div>
              </div>
              <div
                className="relative"
                style={{
                  width: inner,
                  height: ROW_H + 8,
                  backgroundImage: `repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px ${perHour * px}px)`,
                  backgroundPosition: `${x(Math.ceil(from / perHour) * perHour)}px 0`,
                }}
              >
                {closedSlots
                  .filter(([a, b]) => b > from && a < to)
                  .map(([a, b]) => (
                    <div
                      key={a}
                      aria-hidden
                      className="absolute inset-y-0"
                      style={{
                        left: x(Math.max(a, from)),
                        width: (Math.min(b, to) - Math.max(a, from)) * px,
                        background: "var(--closed)",
                      }}
                    />
                  ))}
                {r.breaks.map((b) => (
                  <div
                    key={b.start_slot}
                    className="absolute top-1 flex items-center justify-center rounded border text-[10px]"
                    style={{
                      left: x(b.start_slot),
                      width: (b.end_slot - b.start_slot) * px - 2,
                      height: ROW_H,
                      background: BREAK_BG,
                      color: "var(--text-secondary)",
                      borderColor: "var(--grid)",
                    }}
                    title={`Przerwa ${fmtTime(at(b.start_slot), tz)}–${fmtTime(at(b.end_slot), tz)}`}
                    aria-label={`${r.label}: przerwa ${fmtTime(at(b.start_slot), tz)}–${fmtTime(at(b.end_slot), tz)}`}
                  >
                    {mounted &&
                    (b.end_slot - b.start_slot) * px >= textWidth("przerwa") + 6
                      ? "przerwa"
                      : ""}
                  </div>
                ))}
                {r.items.map((t) => {
                  const s = r.dock ? t.arrivalSlot : t.startSlot;
                  const w = (t.endSlot - s) * px - 2;
                  const setupW = r.dock
                    ? (t.startSlot - t.arrivalSlot) * px
                    : 0;
                  const label = t.truckPlate ?? t.waybillNumber;
                  const showLabel =
                    mounted &&
                    w - setupW >=
                      textWidth(label) + 12 + (t.lateBySlots > 0 ? 14 : 0);
                  return (
                    <button
                      key={t.deliveryId}
                      type="button"
                      className="viz-block absolute top-1 flex overflow-hidden rounded text-left text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                      style={{
                        left: x(s),
                        width: Math.max(2, w),
                        height: ROW_H,
                      }}
                      aria-label={`${t.truckPlate ?? ""} ${t.carrier}, list ${t.waybillNumber}, przyjazd ${fmtTime(at(t.arrivalSlot), tz)}, stanowisko ${t.dock}, grupa ${t.crew}`}
                      onMouseMove={(e) =>
                        setHover({ t, x: e.clientX, y: e.clientY })
                      }
                      onMouseLeave={() => setHover(null)}
                    >
                      {setupW > 0 && (
                        <span
                          aria-hidden
                          className="h-full shrink-0"
                          style={{
                            width: setupW,
                            background:
                              "color-mix(in oklab, var(--flow-inbound) 22%, transparent)",
                          }}
                        />
                      )}
                      <span
                        className="flex h-full min-w-0 flex-1 items-center gap-1 px-1.5 text-white"
                        style={{ background: "var(--flow-inbound)" }}
                      >
                        {t.lateBySlots > 0 && (
                          <AlertTriangle
                            className="size-3 shrink-0"
                            aria-hidden
                          />
                        )}
                        {showLabel && (
                          <span className="whitespace-nowrap">{label}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="font-semibold">
            {hover.t.truckPlate ?? "auto"} · {hover.t.carrier}
          </div>
          <div className="text-muted-foreground">
            list {hover.t.waybillNumber} · {hover.t.pallets} palet
          </div>
          <div className="tabular-nums text-muted-foreground">
            przyjazd {fmtTime(at(hover.t.arrivalSlot), tz)} · rozładunek{" "}
            {fmtTime(at(hover.t.startSlot), tz)}–
            {fmtTime(at(hover.t.endSlot), tz)}
          </div>
          <div className="text-muted-foreground">
            stanowisko {hover.t.dock} · grupa {hover.t.crew}
          </div>
          {hover.t.lateBySlots > 0 && (
            <div
              className="mt-1 flex items-center gap-1 font-medium"
              style={{ color: "var(--critical)" }}
            >
              <AlertTriangle className="size-3" />{" "}
              {hover.t.lateBySlots * slotMinutes} min po terminie awizacji
            </div>
          )}
        </div>
      )}
    </div>
  );
}
