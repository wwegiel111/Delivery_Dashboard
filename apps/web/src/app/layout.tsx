import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ETPromo — plan przyjęć",
  description: "Planowanie przyjęć dostaw: godziny przyjazdu i stanowiska",
};

const NAV = [
  { href: "/schedule", label: "Plan przyjęć" },
  { href: "/deliveries", label: "Dostawy" },
  { href: "/settings", label: "Parametry" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>
        <header className="border-b bg-card">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/schedule" className="font-semibold tracking-tight">
              ETPromo <span className="font-normal text-muted-foreground">· przyjęcia dostaw</span>
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
