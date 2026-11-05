"use client";

import { Check, Copy, Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function EmailCard({ carrier, to, subject, body, href, trucks }: { carrier: string; to: string | null; subject: string; body: string; href: string; trucks: number }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(`Temat: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {carrier} <span className="font-normal text-muted-foreground">· {trucks === 1 ? "1 auto" : trucks % 10 >= 2 && trucks % 10 <= 4 && !(trucks % 100 >= 12 && trucks % 100 <= 14) ? `${trucks} auta` : `${trucks} aut`}</span>
        </CardTitle>
        <CardDescription>{to ?? "brak e-maila przewoźnika — uzupełnij w liście przewozowej lub wyślij ręcznie"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm font-medium">{subject}</div>
        <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-sans text-xs leading-relaxed">{body}</pre>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Skopiowano" : "Kopiuj treść"}
          </Button>
          <Button asChild size="sm" variant={to ? "default" : "outline"}>
            <a href={href}>
              <Mail /> Otwórz w poczcie
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
