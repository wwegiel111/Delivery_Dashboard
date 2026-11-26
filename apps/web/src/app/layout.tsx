import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { HelpCenter } from "@/components/help/help-center";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { MainNav } from "@/components/layout/main-nav";
import { TourProvider } from "@/components/onboarding/tour-provider";
import { currentLocale } from "@/i18n/server";
import { parseTourStatus, TOUR_LATER_COOKIE, TOUR_STATUS_COOKIE } from "@/onboarding/tour-state";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("title"), description: t("description") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, t, store] = await Promise.all([currentLocale(), getTranslations("common"), cookies()]);
  // Status samouczka z cookie — okno powitalne renderuje się od razu właściwie (bez migania po hydratacji).
  const tourStatus = parseTourStatus(store.get(TOUR_STATUS_COOKIE)?.value);
  const later = store.get(TOUR_LATER_COOKIE)?.value === "1";
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <TourProvider initialStatus={tourStatus} laterThisSession={later}>
            <header className="border-b bg-card">
              <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                <Link href="/schedule" className="font-semibold tracking-tight">
                  {t("appName")} <span className="font-normal text-muted-foreground">· {t("appTagline")}</span>
                </Link>
                <MainNav />
                <div className="ml-auto flex items-center gap-2">
                  <LanguageSwitcher />
                  <HelpCenter />
                </div>
              </div>
            </header>
            <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
          </TourProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
