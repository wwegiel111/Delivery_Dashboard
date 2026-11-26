import { describe, expect, it } from "vitest";
import { LOCALES } from "./config";
import { MESSAGES } from "./messages";
import { sentences } from "./text-rules";
import { translator } from "./translator";

type Tree = { [k: string]: string | Tree };

function flatten(o: Tree, prefix = ""): Record<string, string> {
  return Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) };
  }, {});
}

const flat = { pl: flatten(MESSAGES.pl as unknown as Tree), en: flatten(MESSAGES.en as unknown as Tree) };
/** Argumenty ICU najwyższego poziomu: {name}, {name, plural, …}; bez treści gałęzi. */
const args = (msg: string) => new Set([...msg.matchAll(/(?<!(?:one|few|many|other|=\d+)\s*)\{\s*(\w+)\s*[,}]/g)].map((m) => m[1]!));
const tags = (msg: string) => new Set([...msg.matchAll(/<(\w+)>/g)].map((m) => m[1]!));

describe("słowniki pl / en", () => {
  it("mają identyczne klucze", () => {
    expect(Object.keys(flat.en).sort()).toEqual(Object.keys(flat.pl).sort());
  });

  it("żadne tłumaczenie nie jest puste (poza celowo pustymi podpowiedziami pól)", () => {
    for (const l of LOCALES)
      for (const [k, v] of Object.entries(flat[l])) if (!/^settings\.fields\.\w+\.hint$/.test(k)) expect(v.trim(), `${l}:${k}`).not.toBe("");
  });

  it("angielskie komunikaty używają tylko argumentów i znaczników dostępnych w polskich (kod przekazuje wartości wg PL)", () => {
    for (const [k, en] of Object.entries(flat.en)) {
      const pl = flat.pl[k]!;
      for (const a of args(en)) expect(args(pl).has(a), `${k}: {${a}}`).toBe(true);
      expect([...tags(en)].sort(), k).toEqual([...tags(pl)].sort());
    }
  });

  it("każdy komunikat to poprawny ICU MessageFormat i formatuje się bez błędów w obu językach", () => {
    for (const l of LOCALES) {
      const t = translator(l) as unknown as { rich: (k: string, v: Record<string, unknown>) => unknown };
      for (const [k, msg] of Object.entries(flat[l])) {
        if (!msg) continue;
        const values: Record<string, unknown> = {};
        for (const a of args(msg)) values[a] = 2;
        for (const tag of tags(msg)) values[tag] = (chunks: unknown) => chunks;
        expect(() => t.rich(k, values), `${l}:${k}`).not.toThrow();
      }
    }
  });

  it("opisy kontekstowe mają najwyżej dwa krótkie zdania", () => {
    for (const l of LOCALES)
      for (const [k, v] of Object.entries(flat[l]).filter(([k]) => k.startsWith("tooltips.") && k !== "tooltips.infoAria")) {
        expect(sentences(v), `${l}:${k} → ${v}`).toBeGreaterThanOrEqual(1);
        expect(sentences(v), `${l}:${k} → ${v}`).toBeLessThanOrEqual(2);
        expect(v.length, `${l}:${k}`).toBeLessThanOrEqual(190);
      }
  });

  it("polska odmiana liczebników (1 / 2–4 / 5–21 / 22)", () => {
    const t = translator("pl");
    expect([1, 2, 5, 12, 22, 663].map((count) => t("common.pallets", { count }))).toEqual(["1 paleta", "2 palety", "5 palet", "12 palet", "22 palety", "663 palety"]);
    expect([1, 3, 5].map((count) => t("common.docks", { count }))).toEqual(["1 stanowisko", "3 stanowiska", "5 stanowisk"]);
    const en = translator("en");
    expect([1, 2].map((count) => en("common.trucks", { count }))).toEqual(["1 truck", "2 trucks"]);
    expect(en("common.crews", { count: 2, size: 4 })).toBe("2 teams of 4");
  });
});
