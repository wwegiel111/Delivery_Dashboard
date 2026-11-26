"use client";

import { Check, Copy, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function EmailCard({
  carrier,
  to,
  subject,
  body,
  href,
  trucks,
}: {
  carrier: string;
  to: string | null;
  subject: string;
  body: string;
  href: string;
  trucks: number;
}) {
  const t = useTranslations("emails.card");
  const tc = useTranslations("common");
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(`${t("subjectPrefix", { subject })}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {carrier} <span className="font-normal text-muted-foreground">· {tc("trucks", { count: trucks })}</span>
        </CardTitle>
        <CardDescription>{to ?? t("noEmail")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm font-medium">{subject}</div>
        <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-sans text-xs leading-relaxed">{body}</pre>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check /> : <Copy />} <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
          </Button>
          <Button asChild size="sm" variant={to ? "default" : "outline"}>
            <a href={href}>
              <Mail /> {t("open")}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
