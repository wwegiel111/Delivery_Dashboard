"use server";

import { prisma } from "@etpromo/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentLocale } from "@/i18n/server";
import { translator, type Translator } from "@/i18n/translator";
import { localizeError } from "../errors";
import type { FormState } from "../form-state";
import { getActiveParams } from "../scheduling/plan";
import { parseTime } from "./import";

const opt = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().optional());

/** Schemat formularza z komunikatami w języku użytkownika. */
const deliverySchema = (t: Translator) => {
  const hm = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().regex(/^\d{2}:\d{2}$/, t("validation.time")).optional());
  return z.object({
    waybillNumber: z.string({ error: t("validation.waybillRequired") }).trim().min(1, t("validation.waybillRequired")),
    carrier: z.string({ error: t("validation.carrierRequired") }).trim().min(1, t("validation.carrierRequired")),
    carrierEmail: z.preprocess((v) => (v === "" ? undefined : v), z.email(t("validation.emailInvalid")).optional()),
    truckPlate: opt,
    supplier: opt,
    deliveryDate: z.string({ error: t("validation.deliveryDateRequired") }).regex(/^\d{4}-\d{2}-\d{2}$/, t("validation.deliveryDateRequired")),
    windowFrom: hm,
    windowTo: hm,
    pallets: z.coerce.number({ error: t("validation.palletsPositive") }).int(t("validation.palletsPositive")).min(1, t("validation.palletsPositive")),
    priority: z.coerce
      .number({ error: t("validation.priorityRange") })
      .int(t("validation.priorityRange"))
      .min(1, t("validation.priorityRange"))
      .max(10, t("validation.priorityRange")),
    hardWindow: z.preprocess((v) => v === "on", z.boolean()),
  });
};

export async function createDelivery(_: FormState, form: FormData): Promise<FormState> {
  const locale = await currentLocale();
  const t = translator(locale);
  const parsed = deliverySchema(t).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => i.message).join("; ") };
  const d = parsed.data;
  const p = await getActiveParams();
  if (d.pallets > p.bufferCapacity) return { ok: false, message: t("validation.palletsOverBuffer", { pallets: d.pallets, capacity: p.bufferCapacity }) };
  const windowFrom = d.windowFrom ? parseTime(d.windowFrom, d.deliveryDate, p.timezone) : null;
  const windowTo = d.windowTo ? parseTime(d.windowTo, d.deliveryDate, p.timezone) : null;
  if (windowFrom && windowTo && windowTo <= windowFrom) return { ok: false, message: t("validation.windowOrder") };
  try {
    await prisma.delivery.create({
      data: {
        waybillNumber: d.waybillNumber,
        carrier: d.carrier,
        carrierEmail: d.carrierEmail ?? null,
        truckPlate: d.truckPlate ?? null,
        supplier: d.supplier ?? null,
        deliveryDate: new Date(`${d.deliveryDate}T00:00:00Z`),
        windowFrom,
        windowTo,
        hardWindow: d.hardWindow,
        pallets: d.pallets,
        priority: d.priority,
        // Znacznik źródła zapisywany w bazie — bez tłumaczenia (dane, nie tekst interfejsu).
        importedFrom: "ręcznie",
      },
    });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") return { ok: false, message: t("errors.duplicateWaybill") };
    return { ok: false, message: localizeError(err, locale) };
  }
  revalidatePath("/deliveries");
  revalidatePath("/schedule");
  return { ok: true, message: t("notifications.deliveryAdded", { waybill: d.waybillNumber }) };
}

export async function cancelDelivery(form: FormData): Promise<void> {
  const id = z.coerce.number().int().positive().parse(form.get("id"));
  await prisma.delivery.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath("/deliveries");
  revalidatePath("/schedule");
}
