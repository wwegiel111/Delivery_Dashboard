import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import { sentences } from "@/i18n/text-rules";
import { FAQ_IDS, QUICK_START_IDS } from "./content";

describe("treści pomocy", () => {
  it("listy obejmują wszystkie wpisy FAQ i szybkiego startu; odpowiedzi są krótkie", () => {
    for (const l of LOCALES) {
      expect([...FAQ_IDS].sort()).toEqual(Object.keys(MESSAGES[l].help.faq.items).sort());
      expect([...QUICK_START_IDS].sort()).toEqual(Object.keys(MESSAGES[l].help.manual.quickStart).sort());
      for (const id of FAQ_IDS) expect(sentences(MESSAGES[l].help.faq.items[id].a), `${l}:${id}`).toBeLessThanOrEqual(2);
    }
  });
});
