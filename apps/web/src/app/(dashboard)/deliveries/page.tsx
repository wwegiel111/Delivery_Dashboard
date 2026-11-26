import { prisma } from "@etpromo/db";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DocForm } from "@/components/documents/doc-form";
import { Field } from "@/components/documents/field";
import { FieldDescription, HelpTip, WithHelp } from "@/components/help/descriptions";
import { ImportPanel } from "@/components/plan/import-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { currentLocale } from "@/i18n/server";
import { fmtTime, isoDay } from "@/lib/time-format";
import { cancelDelivery, createDelivery } from "@/server/deliveries/actions";
import { getActiveParams } from "@/server/scheduling/plan";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const [p, locale, t, tc] = await Promise.all([getActiveParams(), currentLocale(), getTranslations("deliveries"), getTranslations("common")]);
  const tz = p.timezone;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  const today = isoDay(new Date(), tz);
  const rows = await prisma.delivery.findMany({
    where: { status: "PLANNED", ...(date ? { deliveryDate: new Date(`${date}T00:00:00Z`) } : { deliveryDate: { gte: new Date(`${today}T00:00:00Z`) } }) },
    orderBy: [{ deliveryDate: "asc" }, { windowFrom: "asc" }, { waybillNumber: "asc" }],
    take: 500,
  });
  const days = [...new Set(rows.map((r) => r.deliveryDate.toISOString().slice(0, 10)))];
  const time = (d: Date) => fmtTime(d, tz, locale);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {date ? t("summaryDay", { date }) : t("summaryFromToday")} · {tc("trucks", { count: rows.length })} ·{" "}
          {tc("pallets", { count: rows.reduce((s, r) => s + r.pallets, 0) })}
          {date && (
            <>
              {" · "}
              <Link className="underline" href="/deliveries">
                {t("showAll")}
              </Link>
            </>
          )}
        </p>
      </div>

      <ImportPanel />

      <Card data-tour="delivery-form">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("addTitle")}</CardTitle>
          <FieldDescription>
            {t("addDescription")} {tc("requiredHint")}
          </FieldDescription>
        </CardHeader>
        <CardContent>
          <DocForm action={createDelivery} submitLabel={t("submit")}>
            <Field label={t("fields.waybillNumber")} name="waybillNumber" required />
            <Field label={t("fields.carrier")} name="carrier" required />
            <Field label={t("fields.carrierEmail")} name="carrierEmail" type="email" />
            <Field label={t("fields.truckPlate")} name="truckPlate" />
            <Field label={t("fields.supplier")} name="supplier" />
            <Field
              label={t("fields.deliveryDate")}
              name="deliveryDate"
              type="date"
              required
              defaultValue={date ?? undefined}
            />
            <Field
              label={t("fields.windowFrom")}
              name="windowFrom"
              type="time"
              hint={t("hints.windowFrom")}
              help={<HelpTip group="fields" id="windows" topic={t("fields.windowFrom")} />}
            />
            <Field
              label={t("fields.windowTo")}
              name="windowTo"
              type="time"
              hint={t("hints.windowTo")}
            />
            <Field
              label={t("fields.pallets")}
              name="pallets"
              type="number"
              min={1}
              max={p.bufferCapacity}
              defaultValue={p.fullTruckPallets}
              required
              hint={t("hints.pallets", { max: p.bufferCapacity })}
            />
            <Field
              label={t("fields.priority")}
              name="priority"
              type="number"
              min={1}
              max={10}
              defaultValue={5}
              hint={t("hints.priority")}
              help={<HelpTip group="fields" id="priority" topic={t("fields.priority")} />}
            />
            <Field label={t("fields.hardWindow")} name="hardWindow" type="checkbox" help={<HelpTip group="fields" id="hardWindow" topic={t("fields.hardWindow")} />} />
          </DocForm>
        </CardContent>
      </Card>

      {days.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">{t("dayLinksLabel")}</span>
          {days.map((d) => (
            <Button key={d} asChild size="sm" variant="outline">
              <Link href={`/schedule?date=${d}`}>{t("planForDay", { date: d })}</Link>
            </Button>
          ))}
        </div>
      )}

      <Card data-tour="deliveries-table">
        <Table>
          <caption className="sr-only">{t("table.caption")}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.date")}</TableHead>
              <TableHead>{t("table.waybill")}</TableHead>
              <TableHead>{t("table.carrier")}</TableHead>
              <TableHead>{t("table.email")}</TableHead>
              <TableHead>{t("table.truck")}</TableHead>
              <TableHead>{t("table.supplier")}</TableHead>
              <TableHead>
                <WithHelp help={<HelpTip group="columns" id="deliveryWindow" topic={t("table.window")} />}>{t("table.window")}</WithHelp>
              </TableHead>
              <TableHead className="text-right">{t("table.pallets")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("table.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <Link className="underline-offset-2 hover:underline" href={`/schedule?date=${d.deliveryDate.toISOString().slice(0, 10)}`}>
                    {d.deliveryDate.toISOString().slice(0, 10)}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{d.waybillNumber}</TableCell>
                <TableCell>{d.carrier}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{d.carrierEmail ?? tc("dash")}</TableCell>
                <TableCell className="font-mono text-xs">{d.truckPlate ?? tc("dash")}</TableCell>
                <TableCell className="text-muted-foreground">{d.supplier ?? tc("dash")}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {d.windowFrom || d.windowTo
                    ? tc("range", { from: d.windowFrom ? time(d.windowFrom) : tc("ellipsis"), to: d.windowTo ? time(d.windowTo) : tc("ellipsis") })
                    : t("wholeDay")}
                  {d.hardWindow && t("hard")}
                </TableCell>
                <TableCell className="text-right">{d.pallets}</TableCell>
                <TableCell>
                  <form action={cancelDelivery}>
                    <input type="hidden" name="id" value={d.id} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={t("cancelAria", { waybill: d.waybillNumber })}>
                      {t("cancel")}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
