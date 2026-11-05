import { describe, expect, it } from "vitest";
import { canonicalize, parseTime, parseWaybills } from "./import";

const TZ = "Europe/Warsaw";
const row = (o: Record<string, string>) => ({ numer_listu: "CMR/1", przewoznik: "Raben", data_dostawy: "2026-11-09", liczba_palet: "33", ...o });

describe("import list przewozowych", () => {
  it("aliasy kolumn → nazwy kanoniczne", () => {
    expect(canonicalize({ cmr: "X", carrier: "Y", palety: "3", data: "09.11.2026", email: "a@b.pl" })).toEqual({
      numer_listu: "X",
      przewoznik: "Y",
      liczba_palet: "3",
      data_dostawy: "09.11.2026",
      email_przewoznika: "a@b.pl",
    });
  });

  it("nagłówek z myślnikiem: 'E-mail przewoźnika' → email_przewoznika", () => {
    expect(canonicalize({ e_mail_przewoznika: "a@b.pl", nr_rejestracyjny: "WX 1" })).toEqual({ email_przewoznika: "a@b.pl", nr_rejestracyjny: "WX 1" });
  });

  it("polska data i godziny awizacji w czasie lokalnym", () => {
    const { deliveries, errors } = parseWaybills([row({ data_dostawy: "9.11.2026", awizacja_od: "7:00", awizacja_do: "11:30" })], TZ);
    expect(errors).toEqual([]);
    expect(deliveries[0]).toMatchObject({ deliveryDate: "2026-11-09", pallets: 33, priority: 5 });
    expect(deliveries[0]!.windowFrom!.toISOString()).toBe("2026-11-09T06:00:00.000Z");
    expect(deliveries[0]!.windowTo!.toISOString()).toBe("2026-11-09T10:30:00.000Z");
  });

  it("pozycje tego samego listu są sumowane w jedno auto", () => {
    const { deliveries } = parseWaybills([row({ liczba_palet: "20" }), row({ liczba_palet: "13" }), row({ numer_listu: "CMR/2", liczba_palet: "5" })], TZ);
    expect(deliveries.map((d) => [d.waybillNumber, d.pallets, d.rows])).toEqual([
      ["CMR/1", 33, [2, 3]],
      ["CMR/2", 5, [4]],
    ]);
  });

  it("błędy z numerem wiersza: brak przewoźnika, zła data, odwrócone okno, niespójny list", () => {
    const { errors } = parseWaybills(
      [
        row({ przewoznik: "" }),
        row({ numer_listu: "CMR/3", data_dostawy: "2026/11/09" }),
        row({ numer_listu: "CMR/4", awizacja_od: "12:00", awizacja_do: "08:00" }),
        row({ numer_listu: "CMR/5" }),
        row({ numer_listu: "CMR/5", przewoznik: "DSV" }),
      ],
      TZ,
    );
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4, 6]);
  });

  it("parseTime: HH:MM, ISO i polski format z godziną", () => {
    expect(parseTime("06:00", "2026-11-09", TZ)!.toISOString()).toBe("2026-11-09T05:00:00.000Z");
    expect(parseTime("2026-11-09 06:00", "2026-11-09", TZ)!.toISOString()).toBe("2026-11-09T05:00:00.000Z");
    expect(parseTime("09.11.2026 06:00", "2026-11-09", TZ)!.toISOString()).toBe("2026-11-09T05:00:00.000Z");
    expect(parseTime("6 rano", "2026-11-09", TZ)).toBeNull();
  });
});
