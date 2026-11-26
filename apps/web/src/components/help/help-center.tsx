"use client";

import { BookOpen, CircleHelp, Play, RotateCcw, StepForward } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useTour } from "@/components/onboarding/tour-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QuickStart } from "./help-content";

/** Przycisk „Pomoc” w nagłówku: wznowienie / uruchomienie samouczka, szybki start i link do instrukcji. */
export function HelpCenter() {
  const t = useTranslations("help");
  const to = useTranslations("onboarding");
  const tc = useTranslations("common");
  const tour = useTour();
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => {
    setOpen(false);
    // Najpierw zamykamy okno (zwalnia fokus i blokadę przewijania), potem startuje samouczek.
    setTimeout(fn, 50);
  };
  const paused = tour.status === "paused" && tour.progress;
  const fresh = tour.status === "not_started" || tour.status === "skipped";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-tour="help-button" aria-label={t("buttonAria")} className="relative">
          <CircleHelp /> <span className="hidden sm:inline">{t("button")}</span>
          {paused && <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500" />}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("center.title")}</DialogTitle>
          <DialogDescription>{t("center.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {paused && tour.progress && (
            <Button className="w-full justify-start" onClick={() => run(tour.resume)}>
              <StepForward /> {t("center.resume", { step: tour.progress.step, total: tour.progress.total })}
            </Button>
          )}
          <Button className="w-full justify-start" variant={paused ? "outline" : "default"} onClick={() => run(tour.start)}>
            {fresh ? <Play /> : <RotateCcw />} {fresh ? t("center.start") : t("center.restart")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("center.status", { status: to(`status.${tour.status}`) })}</p>
        </div>
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-medium">{t("manual.quickStartTitle")}</h3>
          <QuickStart />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <p className="text-xs text-muted-foreground">{t("center.contextHint")}</p>
          <Button asChild variant="outline" size="sm" onClick={() => setOpen(false)}>
            <Link href="/help">
              <BookOpen /> {t("center.manual")}
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
