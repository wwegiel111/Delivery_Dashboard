import { describe, expect, it } from "vitest";
import { parseWaybills } from "./import";

const row = (o: Record<string, string>) => ({ numer_listu: "CMR/1", przewoznik: "Raben", data_dostawy: "2026-11-09", liczba_palet: "33", ...o });

describe("komunikaty walidacji importu w języku użytkownika", () => {
  it("angielskie komunikaty, te same numery wierszy i ten sam format danych", () => {
    const { errors } = parseWaybills(
      [row({ przewoznik: "" }), row({ numer_listu: "CMR/3", data_dostawy: "2026/11/09" }), row({ numer_listu: "CMR/4", awizacja_od: "12:00", awizacja_do: "08:00" }), row({ numer_listu: "CMR/5", liczba_palet: "abc" })],
      "Europe/Warsaw",
      "en",
    );
    expect(errors).toEqual([
      { row: 2, message: "missing carrier" },
      { row: 3, message: "use YYYY-MM-DD or DD.MM.YYYY for the delivery date" },
      { row: 4, message: "the time window closes before it opens" },
      { row: 5, message: "pallets must be a whole number" },
    ]);
  });
  it("domyślnie po polsku", () => {
    expect(parseWaybills([row({ przewoznik: "" })], "Europe/Warsaw").errors[0]!.message).toBe("brak przewoźnika");
  });
});
