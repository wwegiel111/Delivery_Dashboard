"use server";

import { prisma } from "@etpromo/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "../form-state";
import { getActiveParams } from "../scheduling/plan";
import { parseTime } from "./import";

const opt = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().optional());
const hm = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().regex(/^\d{2}:\d{2}$/, "godzina HH:MM").optional());

const Delivery = z.object({
  waybillNumber: z.string().trim().min(1, "numer listu przewozowego jest wymagany"),
  carrier: z.string().trim().min(1, "przewoźnik jest wymagany"),
  carrierEmail: z.preprocess((v) => (v === "" ? undefined : v), z.email("nieprawidłowy e-mail").optional()),
  truckPlate: opt,
  supplier: opt,
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data dostawy jest wymagana"),
  windowFrom: hm,
  windowTo: hm,
  pallets: z.coerce.number().int().min(1, "liczba palet > 0"),
  priority: z.coerce.number().int().min(1).max(10),
  hardWindow: z.preprocess((v) => v === "on", z.boolean()),
});

export async function createDelivery(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Delivery.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => i.message).join("; ") };
  const d = parsed.data;
  const p = await getActiveParams();
  if (d.pallets > p.bufferCapacity) return { ok: false, message: `${d.pallets} palet przekracza pojemność bufora (${p.bufferCapacity})` };
  const windowFrom = d.windowFrom ? parseTime(d.windowFrom, d.deliveryDate, p.timezone) : null;
  const windowTo = d.windowTo ? parseTime(d.windowTo, d.deliveryDate, p.timezone) : null;
  if (windowFrom && windowTo && windowTo <= windowFrom) return { ok: false, message: "Koniec okna awizacji musi być po jego początku" };
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
        importedFrom: "ręcznie",
      },
    });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") return { ok: false, message: "List przewozowy o tym numerze już istnieje" };
    return { ok: false, message: String(err) };
  }
  revalidatePath("/deliveries");
  revalidatePath("/schedule");
  return { ok: true, message: `Dodano dostawę ${d.waybillNumber}` };
}

export async function cancelDelivery(form: FormData): Promise<void> {
  const id = z.coerce.number().int().positive().parse(form.get("id"));
  await prisma.delivery.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath("/deliveries");
  revalidatePath("/schedule");
}
