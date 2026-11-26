/**
 * Treści pomocy współdzielone przez okno „Pomoc” i stronę /help.
 * „Ekran po ekranie” jest generowany z kroków samouczka — jedno źródło, bez rozbieżności.
 */
import { useTranslations } from "next-intl";
import { FAQ_IDS, QUICK_START_IDS } from "@/help/content";
import { TOUR, type TourRoute } from "@/onboarding/tour-definition";

export function QuickStart() {
  const t = useTranslations("help.manual.quickStart");
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
      {QUICK_START_IDS.map((id) => (
        <li key={id}>{t(id)}</li>
      ))}
    </ol>
  );
}

export function FaqList() {
  const t = useTranslations("help.faq.items");
  return (
    <div className="space-y-2">
      {FAQ_IDS.map((id) => (
        <details key={id} className="group rounded-md border bg-card px-3 py-2 text-sm [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <span aria-hidden className="mr-1.5 inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none">
              ›
            </span>
            {t(`${id}.q`)}
          </summary>
          <p className="mt-1.5 leading-relaxed text-muted-foreground">{t(`${id}.a`)}</p>
        </details>
      ))}
    </div>
  );
}

/** Kroki samouczka pogrupowane według strony — tekstowa wersja przewodnika. */
export function ScreenGuide() {
  const ts = useTranslations("onboarding.steps");
  const tn = useTranslations("navigation");
  const tm = useTranslations("help.manual");
  const groups: { route: TourRoute; title: string }[] = [
    { route: null, title: tm("general") },
    { route: "/deliveries", title: tn("deliveries") },
    { route: "/settings", title: tn("settings") },
    { route: "/schedule", title: tn("schedule") },
  ];
  // Kroki ogólne: powitanie, nawigacja, język i zakończenie.
  const general = new Set(["welcome", "navigation", "language", "finish"]);
  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const steps = TOUR.filter((s) => (g.route === null ? general.has(s.id) : !general.has(s.id) && s.route === g.route));
        return (
          <section key={g.title} className="space-y-2">
            <h3 className="text-sm font-semibold">{g.title}</h3>
            <ul className="space-y-1.5 text-sm">
              {steps.map((s) => (
                <li key={s.id}>
                  <span className="font-medium">{ts(`${s.id}.title`)}</span> <span className="text-muted-foreground">— {ts(`${s.id}.body`)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
