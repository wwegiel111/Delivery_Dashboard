import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import { sentences } from "@/i18n/text-rules";
import { targetsOf, TOUR } from "./tour-definition";

function sourceText(dir: string): string {
  return readdirSync(dir)
    .map((f) => join(dir, f))
    .map((p) => (statSync(p).isDirectory() ? sourceText(p) : p.endsWith(".tsx") ? readFileSync(p, "utf8") : ""))
    .join("\n");
}

describe("samouczek", () => {
  it("jest krótki: maks. 20 kroków, bez powtórzeń", () => {
    expect(TOUR.length).toBeLessThanOrEqual(20);
    expect(TOUR.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TOUR.map((s) => s.id)).size).toBe(TOUR.length);
  });

  it("każdy krok ma krótki tytuł i treść (maks. 2 zdania) w obu językach, bez nadmiarowych tekstów", () => {
    for (const l of LOCALES) {
      const steps = MESSAGES[l].onboarding.steps as Record<string, { title: string; body: string }>;
      expect(Object.keys(steps).sort(), l).toEqual(TOUR.map((s) => s.id).sort());
      for (const s of TOUR) {
        const { title, body } = steps[s.id]!;
        expect(title.length, `${l}:${s.id}`).toBeLessThanOrEqual(40);
        expect(sentences(body), `${l}:${s.id}`).toBeLessThanOrEqual(2);
        expect(body.length, `${l}:${s.id}`).toBeLessThanOrEqual(220);
      }
    }
  });

  it("czytanie zajmuje ok. 2–3 minuty (≈ 200 słów na minutę)", () => {
    for (const l of LOCALES) {
      const words = Object.values(MESSAGES[l].onboarding.steps).reduce((n, s) => n + `${s.title} ${s.body}`.split(/\s+/).length, 0);
      expect(words / 200, l).toBeLessThan(3);
    }
  });

  it("każdy wskazany element ma stabilny atrybut data-tour w kodzie interfejsu", () => {
    const src = sourceText(join(__dirname, ".."));
    const found = (id: string) => src.includes(`"${id}"`) || (/^settings-group-(\w+)$/.test(id) && new RegExp(`group\\(\\s*"${id.slice(15)}"`).test(src));
    for (const s of TOUR) for (const id of targetsOf(s)) expect(found(id), `${s.id} → data-tour="${id}"`).toBe(true);
  });
});
