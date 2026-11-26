import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { DocForm } from "@/components/documents/doc-form";
import { Field } from "@/components/documents/field";
import { FieldDescription, HelpTip, type ParamId, type TipId } from "@/components/help/descriptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activeDocks, getActiveParams } from "@/server/scheduling/plan";
import { saveParams } from "@/server/settings/actions";

export const dynamic = "force-dynamic";

type FieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">;

/** Parametry z opisem w `tooltips.params` (pozostałe są oczywiste z etykiety). */
const TIP_PARAMS = [
  "fullTruckMinutes",
  "fullTruckPallets",
  "dockSetupMinutes",
  "bufferCapacity",
  "putawayPalletsPerHour",
  "shiftChangeMinutes",
  "breaksPerShift",
  "lastArrival",
  "slotMinutes",
  "solverTimeLimitS",
  "weightTardiness",
  "weightMakespan",
  "weightFlow",
  "weightBuffer",
] as const satisfies readonly TipId<"params">[];
const hasTip = (name: ParamId): name is (typeof TIP_PARAMS)[number] => (TIP_PARAMS as readonly string[]).includes(name);

export default async function SettingsPage() {
  const [p, docks, t] = await Promise.all([getActiveParams(), activeDocks(), getTranslations("settings")]);

  /** Pole parametru; ikona ⓘ tylko przy parametrach, których znaczenie nie wynika z etykiety (`tooltips.params`). */
  const param = (name: ParamId, props: FieldProps) => {
    const label = t(`fields.${name}.label`);
    const hint = t(`fields.${name}.hint`);
    const tip = hasTip(name) ? <HelpTip group="params" id={name} topic={label} /> : undefined;
    return <Field key={name} label={label} name={name} hint={hint || undefined} help={tip} {...props} />;
  };
  const group = (id: "resources" | "times" | "hours" | "breaks" | "solver" | "weights", children: ReactNode, intro?: string) => (
    <fieldset key={id} data-tour={`settings-group-${id}`} className="col-span-full grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
      <legend className="px-1 text-sm font-semibold">{t(`groups.${id}`)}</legend>
      {intro && <FieldDescription className="col-span-full -mt-1">{intro}</FieldDescription>}
      {children}
    </fieldset>
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro", { version: p.version, timezone: p.timezone })}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DocForm action={saveParams} submitLabel={t("save")} submitTour="settings-save" icon="save">
            {group("resources", [
              param("docks", { type: "number", min: 1, max: 20, defaultValue: docks.length }),
              param("crews", { type: "number", min: 1, max: 10, defaultValue: p.crews }),
              param("crewSize", { type: "number", min: 1, max: 20, defaultValue: p.crewSize }),
              param("bufferCapacity", { type: "number", min: 1, max: 500, defaultValue: p.bufferCapacity }),
              param("putawayPalletsPerHour", { type: "number", min: 1, max: 1000, defaultValue: p.putawayPalletsPerHour }),
            ])}
            {group("times", [
              param("fullTruckMinutes", { type: "number", min: 5, max: 480, defaultValue: p.fullTruckMinutes }),
              param("fullTruckPallets", { type: "number", min: 1, max: 66, defaultValue: p.fullTruckPallets }),
              param("dockSetupMinutes", { type: "number", min: 0, max: 120, defaultValue: p.dockSetupMinutes }),
            ])}
            {group("hours", [
              param("workFrom", { defaultValue: p.workFrom, placeholder: "06:00" }),
              param("workTo", { defaultValue: p.workTo, placeholder: "22:00" }),
              param("lastArrival", { defaultValue: p.lastArrival, placeholder: "20:00" }),
              param("shiftChange", { defaultValue: p.shiftChange, placeholder: "14:00" }),
              param("shiftChangeMinutes", { type: "number", min: 0, max: 120, defaultValue: p.shiftChangeMinutes }),
            ])}
            {group("breaks", [
              param("breaksPerShift", { type: "number", min: 0, max: 4, defaultValue: p.breaksPerShift }),
              param("breakMinutes", { type: "number", min: 0, max: 60, defaultValue: p.breakMinutes }),
            ])}
            {group("solver", [
              param("slotMinutes", { type: "number", defaultValue: p.slotMinutes }),
              param("solverTimeLimitS", { type: "number", min: 1, max: 600, defaultValue: p.solverTimeLimitS }),
            ])}
            {group(
              "weights",
              [
                param("weightTardiness", { type: "number", min: 0, max: 100000, defaultValue: p.weightTardiness }),
                param("weightMakespan", { type: "number", min: 0, max: 100000, defaultValue: p.weightMakespan }),
                param("weightFlow", { type: "number", min: 0, max: 100000, defaultValue: p.weightFlow }),
                param("weightBuffer", { type: "number", min: 0, max: 100000, defaultValue: p.weightBuffer }),
              ],
              t("weightsIntro"),
            )}
          </DocForm>
        </CardContent>
      </Card>
    </div>
  );
}
