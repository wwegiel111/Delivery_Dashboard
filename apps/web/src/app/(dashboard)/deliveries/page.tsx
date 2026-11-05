import { prisma } from "@etpromo/db";
import Link from "next/link";
import { DocForm } from "@/components/documents/doc-form";
import { Field } from "@/components/documents/field";
import { ImportPanel } from "@/components/plan/import-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtTime, isoDay } from "@/lib/time-format";
import { cancelDelivery, createDelivery } from "@/server/deliveries/actions";
import { getActiveParams } from "@/server/scheduling/plan";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const p = await getActiveParams();
  const tz = p.timezone;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  const today = isoDay(new Date(), tz);
  const rows = await prisma.delivery.findMany({
    where: { status: "PLANNED", ...(date ? { deliveryDate: new Date(`${date}T00:00:00Z`) } : { deliveryDate: { gte: new Date(`${today}T00:00:00Z`) } }) },
    orderBy: [{ deliveryDate: "asc" }, { windowFrom: "asc" }, { waybillNumber: "asc" }],
    take: 500,
  });
  const days = [...new Set(rows.map((r) => r.deliveryDate.toISOString().slice(0, 10)))];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dostawy (listy przewozowe)</h1>
        <p className="text-sm text-muted-foreground">
          {date ? `Dzień ${date}` : "Od dziś"} · {rows.length} aut · {rows.reduce((s, r) => s + r.pallets, 0)} palet
          {date && (
            <>
              {" · "}
              <Link className="underline" href="/deliveries">
                pokaż wszystkie
              </Link>
            </>
          )}
        </p>
      </div>

      <ImportPanel />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dodaj dostawę ręcznie</CardTitle>
        </CardHeader>
        <CardContent>
          <DocForm action={createDelivery} submitLabel="Dodaj dostawę">
            <Field label="Numer listu przewozowego" name="waybillNumber" required />
            <Field label="Przewoźnik" name="carrier" required />
            <Field label="E-mail przewoźnika" name="carrierEmail" type="email" />
            <Field label="Nr rejestracyjny auta" name="truckPlate" />
            <Field label="Dostawca" name="supplier" />
            <Field label="Data dostawy" name="deliveryDate" type="date" required defaultValue={date ?? undefined} />
            <Field label="Awizacja od" name="windowFrom" type="time" hint="puste = od początku pracy" />
            <Field label="Awizacja do (koniec rozładunku)" name="windowTo" type="time" hint="puste = do końca pracy" />
            <Field label="Liczba palet" name="pallets" type="number" min={1} max={p.bufferCapacity} defaultValue={p.fullTruckPallets} />
            <Field label="Priorytet (1–10)" name="priority" type="number" min={1} max={10} defaultValue={5} />
            <Field label="Twarde okno awizacji" name="hardWindow" type="checkbox" />
          </DocForm>
        </CardContent>
      </Card>

      {days.length > 1 && (
        <div className="flex flex-wrap gap-1.5 text-sm">
          {days.map((d) => (
            <Button key={d} asChild size="sm" variant="outline">
              <Link href={`/schedule?date=${d}`}>Plan {d} →</Link>
            </Button>
          ))}
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>List przewozowy</TableHead>
              <TableHead>Przewoźnik</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Auto</TableHead>
              <TableHead>Dostawca</TableHead>
              <TableHead>Awizacja</TableHead>
              <TableHead className="text-right">Palety</TableHead>
              <TableHead />
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
                <TableCell className="text-xs text-muted-foreground">{d.carrierEmail ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{d.truckPlate ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{d.supplier ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {d.windowFrom || d.windowTo ? `${d.windowFrom ? fmtTime(d.windowFrom, tz) : "…"}–${d.windowTo ? fmtTime(d.windowTo, tz) : "…"}` : "cały dzień"}
                  {d.hardWindow && " (twarde)"}
                </TableCell>
                <TableCell className="text-right">{d.pallets}</TableCell>
                <TableCell>
                  <form action={cancelDelivery}>
                    <input type="hidden" name="id" value={d.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Anuluj
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                  Brak dostaw — zaimportuj plik CSV z listami przewozowymi.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
