"use client";

import { FileDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { isLocale, LOCALES, type Locale } from "@/i18n/config";
import type { CarrierEmail } from "@/server/report/report";
import { EmailCard } from "./email-card";

const STORAGE_KEY = "etp.docLocale";
const Ctx = createContext<{ locale: Locale; setLocale: (l: Locale) => void } | null>(null);

function useDocLocale() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDocLocale outside <DocumentLanguageProvider>");
  return c;
}

/** Język PDF i maili — niezależny od interfejsu, zapamiętany w przeglądarce (domyślnie = język interfejsu). */
export function DocumentLanguageProvider({ children }: { children: ReactNode }) {
  const ui = useLocale();
  // Jawny wybór użytkownika; bez niego dokumenty idą za językiem interfejsu (także po jego zmianie).
  const [chosen, setChosen] = useState<Locale | null>(null);
  const locale = chosen ?? ui;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLocale(saved)) setChosen(saved);
    } catch {
      /* brak dostępu do storage */
    }
  }, []);
  const setLocale = (l: Locale) => {
    setChosen(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignorujemy */
    }
  };
  return <Ctx.Provider value={{ locale, setLocale }}>{children}</Ctx.Provider>;
}

export function DocumentLanguageSelect() {
  const { locale, setLocale } = useDocLocale();
  const t = useTranslations("scheduling");
  const tl = useTranslations("language");
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <label htmlFor="doc-language" className="text-muted-foreground">
        {t("docLanguage")}
      </label>
      <select
        id="doc-language"
        value={locale}
        onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {tl(`short.${l}`)} — {tl(`names.${l}`)}
          </option>
        ))}
      </select>
    </span>
  );
}

export function PdfButton({ runId }: { runId: number }) {
  const { locale } = useDocLocale();
  const t = useTranslations("scheduling");
  return (
    <Button asChild>
      <a href={`/api/schedule/${runId}/report?lang=${locale}`}>
        <FileDown /> {t("pdf")}
      </a>
    </Button>
  );
}

export type EmailsByLocale = Record<Locale, (CarrierEmail & { href: string })[]>;

/** Wiadomości do przewoźników w wybranym języku dokumentów (obie wersje policzone po stronie serwera). */
export function CarrierEmails({ emails }: { emails: EmailsByLocale }) {
  const { locale } = useDocLocale();
  const t = useTranslations("scheduling");
  const list = emails[locale];
  if (list.length === 0) return <p className="text-sm text-muted-foreground">{t("emailsEmpty")}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2" lang={locale}>
      {list.map((e) => (
        <EmailCard
          key={e.carrier + e.to}
          carrier={e.carrier}
          to={e.to}
          subject={e.subject}
          body={e.body}
          trucks={e.trucks}
          href={e.href}
        />
      ))}
    </div>
  );
}
