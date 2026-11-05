/**
 * Kontrakt JSON: aplikacja Next.js ⟷ solver przyjęć dostaw (FastAPI + CP-SAT).
 *
 * Model przyjęcia:
 *   auto podjeżdża na stanowisko (podstawienie) → grupa rozładowuje je na wspólny bufor
 *   → wózkowi odnoszą palety z bufora na regał. Dalsze procesy nas nie interesują.
 *
 * Czas w slotach (domyślnie 5 min) od `horizon_start` (lokalna północ planowanego dnia jako instant UTC).
 * Przedziały półotwarte: [start, end).
 *
 * Po zmianie uruchom `npm run contracts:export` — test w Pythonie porówna modele Pydantic z tym plikiem.
 */
import { z } from "zod";

const slot = z.number().int().nonnegative();
const id = z.string().min(1).max(128);

export const TruckSpec = z.object({
  id,
  /** Numer listu przewozowego (do raportu). */
  ref: z.string(),
  pallets: z.number().int().positive(),
  /** Czas rozładunku przez jedną grupę. */
  unload_slots: z.number().int().positive(),
  /** Najwcześniejszy przyjazd (awizacja od). */
  release_slot: slot,
  /** Najpóźniejsze zakończenie rozładunku (awizacja do) — miękkie, chyba że hard_deadline. */
  deadline_slot: slot.nullable(),
  hard_deadline: z.boolean().default(false),
  priority: z.number().int().min(1).max(10).default(5),
  /** Ręcznie ustalona godzina przyjazdu (slot podstawienia). */
  fixed_arrival_slot: slot.nullable().default(null),
});
export type TruckSpec = z.infer<typeof TruckSpec>;

export const Weights = z.object({
  /** Kara za slot opóźnienia × priorytet. */
  tardiness: z.number().int().nonnegative().default(1000),
  /** Koniec ostatniego rozładunku w dniu — zwarty plan = grupy bez przestojów. */
  makespan: z.number().int().nonnegative().default(50),
  /** Suma końców rozładunków — auta obsługiwane jak najwcześniej. */
  flow: z.number().int().nonnegative().default(5),
  /** Suma poziomu bufora w czasie — palety szybko trafiają na regał. */
  buffer: z.number().int().nonnegative().default(10),
});
export type Weights = z.infer<typeof Weights>;

export const SolveRequest = z.object({
  horizon_start: z.iso.datetime({ offset: true }),
  slot_minutes: z.number().int().positive(),
  horizon_slots: z.number().int().positive(),
  time_limit_s: z.number().positive().max(600).default(20),
  /** Liczba stanowisk rozładunkowych. */
  docks: z.number().int().positive(),
  /** Liczba grup rozładunkowych (np. 2 × 4 osoby). */
  crews: z.number().int().positive(),
  /** Podstawienie auta na stanowisko przed rozładunkiem (stanowisko zajęte, grupa wolna). */
  dock_setup_slots: z.number().int().nonnegative(),
  /** Pojemność bufora w paletach. */
  buffer_capacity: z.number().int().positive(),
  /** Ile palet wózkowi odnoszą z bufora na regał w jednym slocie. */
  putaway_per_slot: z.number().int().positive(),
  /** Okresy poza godzinami pracy i przestoje (zmiana zmian): brak podstawień, rozładunków i odnoszenia. */
  closed_slots: z.array(z.tuple([slot, slot])).default([]),
  /** Najpóźniejszy przyjazd auta (slot podstawienia), np. 20:00. */
  latest_arrival_slot: slot.nullable().default(null),
  /** Bufor musi być pusty (wszystko na regale) najpóźniej w tym slocie, np. koniec zmiany 22:00. */
  putaway_deadline_slot: slot.nullable().default(null),
  /** Zmiany [start, koniec) — w każdej każda grupa ma `breaks_per_shift` przerw po `break_slots`. */
  shifts: z.array(z.tuple([slot, slot])).default([]),
  breaks_per_shift: z.number().int().nonnegative().default(0),
  break_slots: z.number().int().nonnegative().default(0),
  /** Przerwa nie wcześniej niż tyle slotów od początku i nie później niż tyle przed końcem zmiany. */
  break_edge_slots: z.number().int().nonnegative().default(0),
  /** Minimalny odstęp między kolejnymi przerwami tej samej grupy. */
  break_gap_slots: z.number().int().nonnegative().default(0),
  weights: Weights.prefault({}),
  trucks: z.array(TruckSpec),
});
export type SolveRequest = z.infer<typeof SolveRequest>;
export type SolveRequestInput = z.input<typeof SolveRequest>;

export const SolveStatus = z.enum(["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN", "MODEL_INVALID"]);
export type SolveStatus = z.infer<typeof SolveStatus>;

export const TruckPlan = z.object({
  id,
  /** Przyjazd i podstawienie na stanowisko. */
  arrival_slot: slot,
  unload_start_slot: slot,
  unload_end_slot: slot,
  /** Numer stanowiska 1..docks. */
  dock: z.number().int().positive(),
  /** Numer grupy 1..crews. */
  crew: z.number().int().positive(),
  late_by_slots: z.number().int().nonnegative(),
});
export type TruckPlan = z.infer<typeof TruckPlan>;

export const CrewBreak = z.object({
  crew: z.number().int().positive(),
  /** Indeks zmiany w `shifts`. */
  shift: z.number().int().nonnegative(),
  start_slot: slot,
  end_slot: slot,
});
export type CrewBreak = z.infer<typeof CrewBreak>;

export const Hint = z.object({ truck_id: id.nullable(), reason: z.string() });
export type Hint = z.infer<typeof Hint>;

export const SolveKpis = z.object({
  trucks: z.number().int(),
  first_arrival_slot: z.number().int(),
  last_unload_end_slot: z.number().int(),
  /** Ostatni slot, w którym bufor nie był pusty (+1) — wszystkie palety na regale. */
  all_putaway_slot: z.number().int(),
  /** Zajętość grup między pierwszym a ostatnim rozładunkiem (0..1). */
  crew_utilization: z.number(),
  max_buffer: z.number().int(),
  total_tardiness_slots: z.number().int(),
  late_trucks: z.number().int(),
});
export type SolveKpis = z.infer<typeof SolveKpis>;

export const SolveResponse = z.object({
  status: SolveStatus,
  relaxed: z.boolean(),
  objective: z.number().nullable(),
  wall_time_ms: z.number().int(),
  trucks: z.array(TruckPlan),
  /** Przerwy grup wybrane przez solver. */
  breaks: z.array(CrewBreak).default([]),
  /** Palety wjeżdżające na bufor w każdym slocie. */
  inflow: z.array(z.number().int()),
  /** Palety odniesione na regał w każdym slocie. */
  putaway: z.array(z.number().int()),
  /** Poziom bufora na koniec każdego slotu. */
  buffer_level: z.array(z.number().int()),
  kpis: SolveKpis.nullable(),
  hints: z.array(Hint),
});
export type SolveResponse = z.infer<typeof SolveResponse>;
