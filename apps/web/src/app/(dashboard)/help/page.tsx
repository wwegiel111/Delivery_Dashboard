import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FaqList, QuickStart, ScreenGuide } from "@/components/help/help-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("helpTitle") };
}

/** Krótka instrukcja tekstowa — te same treści co w samouczku, do przeczytania bez uruchamiania przewodnika. */
export default async function HelpPage() {
  const t = await getTranslations("help");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("manual.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("manual.intro")}</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("manual.quickStartTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QuickStart />
        </CardContent>
      </Card>
      <section aria-labelledby="screens-title" className="space-y-3">
        <h2 id="screens-title" className="text-lg font-semibold tracking-tight">
          {t("manual.tourTitle")}
        </h2>
        <ScreenGuide />
      </section>
      <section aria-labelledby="faq-title" className="space-y-3">
        <h2 id="faq-title" className="text-lg font-semibold tracking-tight">
          {t("faq.title")}
        </h2>
        <FaqList />
      </section>
    </div>
  );
}
