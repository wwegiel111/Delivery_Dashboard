"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Zapis preferencji w cookie (czytane przy SSR) — przetrwa odświeżenie i restart przeglądarki. */
export function persistLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * Przełącznik PL / EN. Zmienia cookie i odświeża Server Components (`router.refresh()`):
 * URL, parametry (wybrany dzień, wersja planu), stan komponentów klienta i wpisane w formularze dane zostają.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("language");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === locale) return;
    persistLocale(next);
    document.documentElement.lang = next;
    startTransition(() => router.refresh());
  }

  return (
    <div role="group" aria-label={t("label")} data-tour="language-switcher" className={cn("inline-flex rounded-md border bg-background p-0.5", pending && "opacity-70")}>
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            aria-label={active ? t("current", { language: t(`names.${l}`) }) : t("switchTo", { language: t(`names.${l}`) })}
            title={t(`names.${l}`)}
            onClick={() => change(l)}
            disabled={pending}
            className={cn(
              "min-w-9 rounded px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {t(`short.${l}`)}
          </button>
        );
      })}
    </div>
  );
}
