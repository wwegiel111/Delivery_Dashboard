import { describe, expect, it } from "vitest";
import { normalizeHeader, parseCsv } from "./table";

describe("parseCsv", () => {
  it("wykrywa średnik, BOM i normalizuje polskie nagłówki", () => {
    const rows = parseCsv("﻿Numer listu;Przewoźnik;Liczba palet\nCMR/1;Raben;33\n\n");
    expect(rows).toEqual([{ numer_listu: "CMR/1", przewoznik: "Raben", liczba_palet: "33" }]);
  });
  it("przecinek jako separator", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([{ a: "1", b: "2" }]);
  });
  it("normalizeHeader", () => {
    expect(normalizeHeader(" Data Dostawy ")).toBe("data_dostawy");
    expect(normalizeHeader("E-mail przewoźnika")).toBe("e_mail_przewoznika");
  });
});
