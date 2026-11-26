"use server";

import { prisma } from "@etpromo/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentLocale } from "@/i18n/server";
import { translator, type Translator } from "@/i18n/translator";
import type { FormState } from "../form-state";

/** Schemat parametrów z komunikatami w języku użytkownika (zakresy bez zmian). */
const paramsSchema = (t: Translator) => {
  const hm = z.string({ error: t("validation.time") }).regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, t("validation.time"));
  const int = (min: number, max: number) => {
    const msg = t("validation.intRange", { min, max });
    return z.coerce.number({ error: msg }).int(msg).min(min, msg).max(max, msg);
  };
  return z
  .object({
    docks: int(1, 20),
    crews: int(1, 10),
    crewSize: int(1, 20),
    fullTruckMinutes: int(5, 480),
    fullTruckPallets: int(1, 66),
    dockSetupMinutes: int(0, 120),
    bufferCapacity: int(1, 500),
    putawayPalletsPerHour: int(1, 1000),
    workFrom: hm,
    workTo: hm,
    shiftChange: hm,
    shiftChangeMinutes: int(0, 120),
    breaksPerShift: int(0, 4),
    breakMinutes: int(0, 60),
    lastArrival: hm,
    slotMinutes: z.coerce.number({ error: t("validation.slot") }).int(t("validation.slot")).refine((v) => [5, 10, 15, 30].includes(v), t("validation.slot")),
    solverTimeLimitS: int(1, 600),
    weightTardiness: int(0, 100_000),
    weightMakespan: int(0, 100_000),
    weightFlow: int(0, 100_000),
    weightBuffer: int(0, 100_000),
  })
  .refine((p) => p.workTo > p.workFrom, { message: t("validation.workOrder") })
  .refine((p) => p.lastArrival > p.workFrom && p.lastArrival <= p.workTo, { message: t("validation.lastArrivalRange") })
  .refine((p) => p.shiftChange > p.workFrom && p.shiftChange < p.workTo, { message: t("validation.shiftChangeRange") });
};

type ParamField = keyof ReturnType<typeof paramsSchema>["shape"];
const isParamField = (k: unknown, shape: object): k is ParamField => typeof k === "string" && k in shape;

/** Zapis = nowa wersja parametrów (wcześniejsze plany zachowują swoje). Liczba stanowisk aktywuje/dodaje stanowiska. */
export async function saveParams(_: FormState, form: FormData): Promise<FormState> {
  const t = translator(await currentLocale());
  const schema = paramsSchema(t);
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues
        .map((i) => {
          const key = i.path[0];
          // Pola nazywamy tak jak na ekranie (etykieta), a nie technicznym kluczem.
          return isParamField(key, schema.shape) ? t("validation.paramsField", { field: t(`settings.fields.${key}.label`), message: i.message }) : i.message;
        })
        .join("; "),
    };
  const { docks, ...values } = parsed.data;
  const current = await prisma.schedulingParams.findFirst({ where: { isActive: true } });
  const last = await prisma.schedulingParams.aggregate({ _max: { version: true } });
  const version = (last._max.version ?? 0) + 1;
  await prisma.$transaction([
    prisma.schedulingParams.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    prisma.schedulingParams.create({ data: { ...values, version, isActive: true, timezone: current?.timezone ?? "Europe/Warsaw" } }),
    ...Array.from({ length: docks }, (_, i) =>
      prisma.dock.upsert({ where: { number: i + 1 }, update: { isActive: true }, create: { number: i + 1, name: `Stanowisko ${i + 1}` } }),
    ),
    prisma.dock.updateMany({ where: { number: { gt: docks } }, data: { isActive: false } }),
  ]);
  revalidatePath("/", "layout");
  return { ok: true, message: t("notifications.paramsSaved", { version }) };
}
