/**
 * Seed: 4 stanowiska, parametry planowania i przykładowy tydzień dostaw (pon–pt).
 *
 *   npm run db:seed                         # konfiguracja + dostawy na najbliższy tydzień roboczy
 *   SEED_DATE=2026-11-09 npm run db:seed    # dostawy na tydzień zawierający wskazany dzień
 *   SEED_DELIVERIES=0 npm run db:seed       # tylko konfiguracja
 *
 * Idempotentny: dostawy przykładowe (prefiks LP/DEMO/) z tego tygodnia są usuwane i tworzone od nowa.
 * Dane są sztuczne, ale powtarzalne (stałe ziarno losowania).
 */
import { localDayStart, localParts, localTimeOn } from "@etpromo/contracts";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TZ = "Europe/Warsaw";

const CARRIERS = [
  { carrier: "Raben Logistics", email: "awizacje@raben.example" },
  { carrier: "DSV Road", email: "dispatch@dsv.example" },
  { carrier: "Dachser", email: "planowanie@dachser.example" },
  { carrier: "Trans-Pol Sp. z o.o.", email: "biuro@transpol.example" },
  { carrier: "Girteka", email: "pl.dispatch@girteka.example" },
  { carrier: "Pekaes", email: "awizacje@pekaes.example" },
];
const SUPPLIERS = ["Komponenty Sp. z o.o.", "Kartonex", "Etykiety PL", "Blister-Pak", "Folie-Tech", "Metal-Form"];
/** Liczba aut na dzień tygodnia (pon–pt) — tydzień z wyraźnie cięższymi i lżejszymi dniami. */
const TRUCKS_PER_DAY = [20, 14, 18, 22, 16];

function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}

function nextWorkingMonday(): string {
  const d = new Date(Date.now() + 86_400_000);
  for (;;) {
    const p = localParts(d, TZ);
    if (p.isoWeekday <= 5) return mondayOf(`${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`);
    d.setTime(d.getTime() + 86_400_000);
  }
}

/** Mulberry32 — powtarzalne „losowe” dane. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedConfig() {
  for (const n of [1, 2, 3, 4]) {
    await prisma.dock.upsert({ where: { number: n }, update: {}, create: { number: n, name: `Stanowisko ${n}` } });
  }
  if (!(await prisma.schedulingParams.findFirst({ where: { isActive: true } }))) {
    await prisma.schedulingParams.create({ data: { version: 1, isActive: true, timezone: TZ } });
  }
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

async function seedDay(date: string, count: number, dayIndex: number): Promise<number> {
  const prefix = `LP/DEMO/${date}/`;
  await prisma.delivery.deleteMany({ where: { waybillNumber: { startsWith: prefix } } });
  const day = localDayStart(date, TZ);
  const rand = rng(20261109 + dayIndex * 7919);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  let pallets = 0;
  for (let i = 0; i < count; i++) {
    const c = pick(CARRIERS);
    // ~45% aut ma okno awizacji 3–6 h między 06:00 a 20:00; reszta przyjedzie, kiedy plan wskaże.
    let window: [string, string] | null = null;
    if (rand() < 0.45) {
      const from = 6 * 60 + Math.floor(rand() * 11) * 60; // 06:00–16:00
      const len = (3 + Math.floor(rand() * 4)) * 60;
      window = [hhmm(from), hhmm(Math.min(from + len, 21 * 60 + 30))];
    }
    const full = rand() < 0.7;
    const n = full ? 35 : 12 + Math.floor(rand() * 22);
    pallets += n;
    await prisma.delivery.create({
      data: {
        waybillNumber: `${prefix}${String(i + 1).padStart(3, "0")}`,
        supplier: pick(SUPPLIERS),
        carrier: c.carrier,
        carrierEmail: c.email,
        truckPlate: `${pick(["WX", "WI", "PO", "DW", "KR", "EL"])} ${String(10_000 + Math.floor(rand() * 89_999))}`,
        deliveryDate: new Date(`${date}T00:00:00Z`),
        windowFrom: window ? localTimeOn(day, window[0], TZ) : null,
        windowTo: window ? localTimeOn(day, window[1], TZ) : null,
        pallets: n,
        priority: rand() < 0.15 ? 8 : 5,
        importedFrom: "seed",
      },
    });
  }
  return pallets;
}

async function main() {
  await seedConfig();
  console.log("✓ 4 stanowiska + parametry (2 grupy × 2 os., zmiana 14:00 + 20 min, 2 × 15 min przerwy, ostatni przyjazd 20:00)");
  if (process.env.SEED_DELIVERIES !== "0") {
    const monday = process.env.SEED_DATE ? mondayOf(process.env.SEED_DATE) : nextWorkingMonday();
    for (const [i, count] of TRUCKS_PER_DAY.entries()) {
      const date = new Date(new Date(`${monday}T12:00:00Z`).getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const pallets = await seedDay(date, count, i);
      console.log(`✓ ${date}: ${count} przykładowych dostaw, ${pallets} palet`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
