import { describe, expect, it } from "vitest";
import { translator } from "@/i18n/translator";
import { dockLabel, translateHint, translateRunError } from "./hints";

/** Teksty dokładnie takie, jakie zwraca services/solver/app/model.py. */
const SOLVER = [
  "36 palet nie zmieści się w buforze (35)",
  "ustalona godzina przyjazdu wypada poza godzinami pracy lub przed awizacją",
  "rozładunek nie mieści się w godzinach pracy po godzinie awizacji (lub awizacja po najpóźniejszym przyjeździe)",
  "zmiana 1: 4 przerw(y) nie mieszczą się w zmianie przy podanych odstępach",
  "Nie da się przyjąć wszystkich aut w godzinach pracy (z przerwami grup, przestojem zmiany zmian i odniesieniem wszystkiego na regał przed końcem zmiany) — przenieś część dostaw na inny dzień lub dodaj grupę",
  "Nie znaleziono planu w limicie czasu — zwiększ limit solvera",
  "brak aut do zaplanowania",
  "Zduplikowane identyfikatory aut",
  "rozładunek kończy się 3 slot(y) po terminie awizacji",
  "12 palet zostaje w buforze po godzinach pracy",
];

describe("tłumaczenie wskazówek solvera", () => {
  const en = translator("en");
  const pl = translator("pl");
  it("każdy znany komunikat ma tłumaczenie angielskie", () => {
    for (const s of SOLVER) expect(translateHint(s, en, 5), s).not.toBe(s);
    expect(translateHint(SOLVER[0]!, en, 5)).toBe("36 pallets won’t fit in the staging area (35)");
    expect(translateHint(SOLVER[8]!, en, 5)).toBe("unloading finishes 15 min late");
    expect(translateHint(SOLVER[8]!, pl, 10)).toBe("rozładunek skończy się 30 min po terminie");
  });
  it("nieznany tekst przechodzi bez zmian", () => expect(translateHint("coś nowego", en, 5)).toBe("coś nowego"));
  it("błąd zapisany przy planie i nazwa stanowiska", () => {
    expect(translateRunError("Solver: UNKNOWN", en)).toBe("Scheduling engine: unknown");
    expect(translateRunError("inny błąd", en)).toBe("inny błąd");
    expect(translateRunError(null, en)).toBeNull();
    expect(dockLabel("Stanowisko 3", 3, en)).toBe("Dock 3");
    expect(dockLabel("Rampa chłodnicza", 5, en)).toBe("Rampa chłodnicza");
  });
});
