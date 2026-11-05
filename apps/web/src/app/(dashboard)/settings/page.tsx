import { DocForm } from "@/components/documents/doc-form";
import { Field } from "@/components/documents/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { activeDocks, getActiveParams } from "@/server/scheduling/plan";
import { saveParams } from "@/server/settings/actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [p, docks] = await Promise.all([getActiveParams(), activeDocks()]);
  const crewRate = Math.round((p.crews * p.fullTruckPallets * 60) / p.fullTruckMinutes);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Parametry przyjęć</h1>
        <p className="text-sm text-muted-foreground">
          Wersja {p.version} · {p.timezone}. Zapis tworzy nową wersję — wcześniejsze plany zachowują swoje parametry. Obecnie {p.crews === 1 ? "grupa rozładowuje" : "grupy rozładowują"} ok. {crewRate} palet/h, a wózkowi
          odnoszą {p.putawayPalletsPerHour} palet/h.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zasoby i normatywy</CardTitle>
          <CardDescription>Czas rozładunku auta jest proporcjonalny do liczby palet (pełne auto = podany czas) i zaokrąglany w górę do slotu.</CardDescription>
        </CardHeader>
        <CardContent>
          <DocForm action={saveParams} submitLabel="Zapisz jako nową wersję">
            <Field label="Stanowiska rozładunkowe" name="docks" type="number" min={1} defaultValue={docks.length} />
            <Field label="Grupy rozładunkowe" name="crews" type="number" min={1} defaultValue={p.crews} />
            <Field label="Osób w grupie" name="crewSize" type="number" min={1} defaultValue={p.crewSize} hint="informacyjnie, do raportu" />
            <Field label="Rozładunek pełnego auta (min)" name="fullTruckMinutes" type="number" min={5} defaultValue={p.fullTruckMinutes} />
            <Field label="Palet w pełnym aucie" name="fullTruckPallets" type="number" min={1} defaultValue={p.fullTruckPallets} />
            <Field label="Podstawienie auta (min)" name="dockSetupMinutes" type="number" min={0} defaultValue={p.dockSetupMinutes} hint="stanowisko zajęte, grupa wolna" />
            <Field label="Pojemność bufora (palet)" name="bufferCapacity" type="number" min={1} defaultValue={p.bufferCapacity} />
            <Field label="Wózkowi: palet na godzinę (łącznie)" name="putawayPalletsPerHour" type="number" min={1} defaultValue={p.putawayPalletsPerHour} hint="odnoszenie z bufora na regał" />
            <Field label="Praca od" name="workFrom" defaultValue={p.workFrom} placeholder="06:00" />
            <Field label="Praca do" name="workTo" defaultValue={p.workTo} placeholder="22:00" />
            <Field label="Zmiana zmian o" name="shiftChange" defaultValue={p.shiftChange} placeholder="14:00" />
            <Field label="Przestój przy zmianie zmian (min)" name="shiftChangeMinutes" type="number" min={0} defaultValue={p.shiftChangeMinutes} hint="brak przyjęć i odnoszenia" />
            <Field label="Przerwy na zmianę (każda grupa)" name="breaksPerShift" type="number" min={0} max={4} defaultValue={p.breaksPerShift} hint="godziny przerw dobiera solver" />
            <Field label="Długość przerwy (min)" name="breakMinutes" type="number" min={0} defaultValue={p.breakMinutes} />
            <Field label="Ostatni przyjazd auta" name="lastArrival" defaultValue={p.lastArrival} placeholder="20:00" hint="regał opróżniony przed końcem pracy" />
            <Field label="Slot (min)" name="slotMinutes" type="number" defaultValue={p.slotMinutes} hint="5 / 10 / 15 / 30" />
            <Field label="Limit czasu solvera (s)" name="solverTimeLimitS" type="number" min={1} defaultValue={p.solverTimeLimitS} />
            <Field label="Waga: opóźnienie vs awizacja" name="weightTardiness" type="number" min={0} defaultValue={p.weightTardiness} />
            <Field label="Waga: wcześniejszy koniec dnia" name="weightMakespan" type="number" min={0} defaultValue={p.weightMakespan} />
            <Field label="Waga: auta jak najwcześniej" name="weightFlow" type="number" min={0} defaultValue={p.weightFlow} />
            <Field label="Waga: palety krótko w buforze" name="weightBuffer" type="number" min={0} defaultValue={p.weightBuffer} />
          </DocForm>
        </CardContent>
      </Card>
    </div>
  );
}
