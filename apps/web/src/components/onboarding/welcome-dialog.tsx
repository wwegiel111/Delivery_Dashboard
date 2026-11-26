"use client";

import { Compass, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Okno powitalne przy pierwszym wejściu — nic nie wymusza; zamknięcie (Esc / ✕) = „Zrobię to później”. */
export function WelcomeDialog({
  open,
  steps,
  onStart,
  onLater,
  onSkip,
}: {
  open: boolean;
  steps: number;
  onStart: () => void;
  onLater: () => void;
  onSkip: () => void;
}) {
  const t = useTranslations("onboarding.welcome");
  const tc = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onLater()}>
      <DialogContent closeLabel={tc("close")} className="max-w-md">
        <DialogHeader>
          <span aria-hidden className="mb-1 inline-flex size-10 items-center justify-center rounded-full bg-muted">
            <Compass className="size-5" />
          </span>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="leading-relaxed">{t("body")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>{t("meta", { steps })}</p>
          <p className="flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("safe")}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onSkip}>
            {t("skip")}
          </Button>
          <Button variant="outline" onClick={onLater}>
            {t("later")}
          </Button>
          <Button onClick={onStart} autoFocus>
            {t("start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
