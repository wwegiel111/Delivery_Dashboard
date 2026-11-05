"use client";

import { slotToDate } from "@etpromo/contracts/time";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtTime } from "@/lib/time-format";

interface Props {
  inflow: number[];
  putaway: number[];
  level: number[];
  capacity: number;
  putawayPerSlot: number;
  horizonStart: string;
  slotMinutes: number;
  closedSlots: [number, number][];
  tz: string;
}

const H = 200;
const M = { top: 14, right: 16, bottom: 24, left: 34 };

/** Zapełnienie bufora w ciągu dnia (jedna seria) z linią pojemności. */
export function BufferChart({ inflow, putaway, level, capacity, putawayPerSlot, horizonStart, slotMinutes, closedSlots, tz }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(300, Math.floor(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const start = useMemo(() => new Date(horizonStart), [horizonStart]);
  const n = level.length;
  // Szczyt w slocie = poziom z końca poprzedniego slotu + palety, które wjechały (przed odniesieniem).
  const peak = useMemo(() => level.map((_, t) => (t > 0 ? level[t - 1]! : 0) + (inflow[t] ?? 0)), [level, inflow]);
  const perHour = 60 / slotMinutes;
  const active = peak.map((v, t) => v > 0 || (putaway[t] ?? 0) > 0);
  const firstActive = active.indexOf(true);
  const lastActive = active.lastIndexOf(true);
  const openFrom = closedSlots.find(([a]) => a === 0)?.[1] ?? 0;
  const openTo = closedSlots.find(([, b]) => b === n)?.[0] ?? n;
  const from = Math.max(0, Math.min(openFrom, firstActive < 0 ? openFrom : firstActive) - perHour);
  const to = Math.min(n, Math.max(openTo, lastActive + 1) + perHour);

  const iw = width - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (s: number) => M.left + ((s - from) / (to - from)) * iw;
  const y = (v: number) => M.top + ih - (v / capacity) * ih;
  const at = (s: number) => slotToDate(start, s, slotMinutes);

  let area = `M${x(from)},${y(0)}`;
  for (let t = from; t < to; t++) area += `L${x(t)},${y(peak[t] ?? 0)}L${x(t + 1)},${y(peak[t] ?? 0)}`;
  const line = area.replace(/^M[^L]+/, "M" + `${x(from)},${y(peak[from] ?? 0)}`);
  area += `L${x(to)},${y(0)}Z`;
  const ticks = [0, Math.round(capacity / 2), capacity];
  const hours = Array.from({ length: Math.floor((to - from) / perHour) + 1 }, (_, h) => Math.ceil(from / perHour) * perHour + h * perHour).filter((s) => s < to);

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(to - 1, Math.max(from, from + Math.floor(((e.clientX - r.left) / r.width) * (to - from)))));
  }

  return (
    <figure className="viz-root rounded-lg border p-4" style={{ background: "var(--surface-1)" }}>
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Zapełnienie bufora (palety)
        </span>
        <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
          szczyt {Math.max(0, ...peak)} / {capacity} · wózkowi odnoszą do {putawayPerSlot} palet na {slotMinutes} min
        </span>
      </figcaption>
      <div ref={box} className="relative">
        <svg width={width} height={H} role="img" aria-label={`Zapełnienie bufora w ciągu dnia, szczyt ${Math.max(0, ...peak)} z ${capacity} palet`}>
          {closedSlots
            .filter(([a, b]) => b > from && a < to)
            .map(([a, b]) => (
              <rect key={a} x={x(Math.max(a, from))} y={M.top} width={x(Math.min(b, to)) - x(Math.max(a, from))} height={ih} fill="var(--closed)" />
            ))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--baseline)" : "var(--grid)"} />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--text-muted)" className="tabular-nums">
                {t}
              </text>
            </g>
          ))}
          {hours.map((s) => (
            <text key={s} x={x(s)} y={H - 6} fontSize={10} textAnchor="middle" fill="var(--text-muted)" className="tabular-nums">
              {fmtTime(at(s), tz)}
            </text>
          ))}
          <path d={area} fill="var(--flow-inbound)" fillOpacity={0.12} />
          <path d={line} fill="none" stroke="var(--flow-inbound)" strokeWidth={2} strokeLinejoin="round" />
          <line x1={M.left} x2={width - M.right} y1={y(capacity)} y2={y(capacity)} stroke="var(--text-secondary)" />
          <text x={width - M.right} y={y(capacity) - 4} textAnchor="end" fontSize={10} fill="var(--text-secondary)">
            pojemność {capacity}
          </text>
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover + 0.5)} x2={x(hover + 0.5)} y1={M.top} y2={M.top + ih} stroke="var(--text-muted)" />
              <circle cx={x(hover + 0.5)} cy={y(peak[hover] ?? 0)} r={4} fill="var(--flow-inbound)" stroke="var(--ring-surface)" strokeWidth={2} />
            </g>
          )}
          <rect x={M.left} y={M.top} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
        {hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2 py-1 text-xs shadow-md tabular-nums"
            style={{ left: Math.min(width - 190, x(hover) + 12), top: 0 }}
          >
            <div className="font-medium">
              {fmtTime(at(hover), tz)}–{fmtTime(at(hover + 1), tz)}
            </div>
            <div className="text-muted-foreground">na buforze: {peak[hover] ?? 0} palet</div>
            <div className="text-muted-foreground">
              wjechało {inflow[hover] ?? 0} · odniesiono {putaway[hover] ?? 0}
            </div>
          </div>
        )}
      </div>
    </figure>
  );
}
