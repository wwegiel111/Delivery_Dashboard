"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/schedule", key: "schedule", tour: "nav-schedule" },
  { href: "/deliveries", key: "deliveries", tour: "nav-deliveries" },
  { href: "/settings", key: "settings", tour: "nav-settings" },
] as const;

/** Główna nawigacja; bieżąca sekcja oznaczona `aria-current`. */
export function MainNav() {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  return (
    <nav aria-label={t("mainNav")} data-tour="nav" className="flex flex-wrap gap-1 text-sm">
      {NAV.map((n) => {
        const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
        return (
          <Link
            key={n.href}
            href={n.href}
            data-tour={n.tour}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground",
              active && "bg-accent font-medium text-foreground",
            )}
          >
            {t(n.key)}
          </Link>
        );
      })}
    </nav>
  );
}
