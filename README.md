# ETPromo — plan przyjęć dostaw

Z list przewozowych (CSV / XLSX) aplikacja układa dzienny plan przyjęć: **o której ma przyjechać każda ciężarówka
i na które stanowisko**. Plan jest ułożony tak, żeby grupy rozładunkowe pracowały jak najpełniej, a wspólny bufor się
nie przepełnił, zanim wózkowi odniosą palety na regał. Wynik to PDF do rozesłania i gotowe maile do przewoźników
(jeden na przewoźnika).

Zakres: przyjazd → podstawienie na stanowisko → rozładunek przez grupę na bufor → odniesienie na regał. Co dzieje się
z towarem dalej, jest poza zakresem.

```
apps/web            Next.js 15 + Tailwind + shadcn/ui: dostawy + import, plan dnia, PDF, maile, parametry
packages/contracts  kontrakt JSON aplikacja ⟷ solver (zod) + czas lokalny ⟷ sloty (DST-safe)
packages/db         Prisma 6 + PostgreSQL: stanowiska, parametry, dostawy, plany (historia wersji)
services/solver     FastAPI + OR-Tools CP-SAT (Python 3.12, uv)
examples/           przykładowy plik list przewozowych do importu
```

## Model (domyślne parametry — zmienisz je na ekranie Parametry)

| Zasób | Domyślnie |
|---|---|
| Stanowiska rozładunkowe | 4 |
| Grupy rozładunkowe | 2 × 2 osoby; pełne auto (35 palet) = 60 min, krótsze proporcjonalnie do liczby palet |
| Podstawienie auta | 20 min — stanowisko zajęte, grupa w tym czasie kończy poprzednie auto |
| Bufor dostaw (wspólny) | 140 palet = 4 pola × ładunek jednego auta (35 palet) |
| Wózkowi odnoszący na regał | 90 palet/h łącznie (6 wózkowych × ~15 cykli/h) |
| Godziny pracy | 06:00–22:00, slot 5 min |
| Zmiany | 06:00–14:00 i 14:20–22:00; 14:00–14:20 przestój przy zmianie zmian (bez przyjęć i odnoszenia) |
| Przerwy | każda grupa 2 × 15 min w każdej zmianie; godziny wybiera solver (nie w pierwszej/ostatniej godzinie zmiany, ≥ 2 h odstępu) |
| Ostatni przyjazd | 20:00; wszystkie palety na regale przed końcem zmiany (22:00) |
| Wagi celu | opóźnienie 1000 · koniec dnia 50 · auta wcześnie 5 · palety krótko w buforze 10 |

Solver (`services/solver/app/model.py`) wybiera dla każdego auta slot przyjazdu i grupę. Podstawienie i cały rozładunek
muszą się mieścić w godzinach pracy (poza przestojem zmiany zmian), nie przed awizacją i nie po ostatniej godzinie
przyjazdu. Solver pilnuje przy tym kilku rzeczy:
- każda grupa rozładowuje jedno auto naraz, a nie w czasie swoich przerw (przerwy są zmiennymi modelu, więc solver
  kładzie je tam, gdzie najmniej przeszkadzają);
- ≤ liczba stanowisk zajętych naraz (stanowiska są numerowane po rozwiązaniu);
- poziom bufora slot po slocie (palety wjeżdżają równo w czasie rozładunku, wózkowi odbierają do swojej wydajności)
  nigdy ponad pojemność i zero od końca zmiany.

Cel: dotrzymać okien awizacji, skończyć dzień jak najwcześniej i trzymać palety krótko w buforze. Plan układa się na dzień;
przycisk „Ułóż cały tydzień” liczy po kolei wszystkie dni tygodnia z dostawami, a pasek tygodnia pokazuje stan każdego dnia.
Każde ułożenie to nowa wersja planu, a niepotrzebne wersje można usunąć („Usuń wersję”).

**Wąskie gardło przy domyślnych liczbach:** dwie grupy rozładowują ok. 70 palet/h, a wózkowi odnoszą 90 palet/h, więc
bufor praktycznie się nie zapełnia, a o długości dnia decydują grupy (wykorzystanie 75–95% w przykładowym tygodniu, niższe
w dni z późnymi oknami awizacji). Gdy wózkowi są wolniejsi niż grupy, aplikacja pokazuje to na ekranie planu.

## Format listy przewozowej (CSV ze średnikiem lub przecinkiem, albo XLSX)

Wymagane: `numer_listu`, `przewoznik`, `data_dostawy` (RRRR-MM-DD lub DD.MM.RRRR), `liczba_palet`.
Opcjonalne: `email_przewoznika`, `nr_rejestracyjny`, `dostawca`, `awizacja_od`, `awizacja_do` (HH:MM), `priorytet` (1–10), `uwagi`.
Rozpoznawane są też typowe warianty nazw (np. „Numer listu”, „CMR”, „Przewoźnik”, „E-mail przewoźnika”, „Palety”).
Wiele wierszy z tym samym numerem listu = pozycje jednego auta, a palety są sumowane. Szablon: przycisk „szablon CSV” na
stronie Dostawy, przykład: `examples/listy-przewozowe-2026-11-10.csv`.

## Uruchomienie

```bash
npm install
cd services/solver && uv sync && cd -

# Baza: Docker (docker compose up -d postgres) albo lokalnie bez Dockera:
npx -w packages/db prisma dev --name etpromo-przyjecia --detach     # wypisze postgres://…:PORT/template1
#   do URL dopisz &pgbouncer=true&connection_limit=1 (PGlite = jedna sesja)
cp .env.example packages/db/.env && cp .env.example apps/web/.env.local   # popraw DATABASE_URL

npm run db:migrate
SEED_DATE=2026-11-09 npm run db:seed        # 4 stanowiska, parametry, przykładowy tydzień (pon–pt, 90 aut)
npm run solver:dev                          # http://localhost:8000
npm run dev                                 # http://localhost:3000
```

Opcjonalnie w `apps/web/.env.local`: `WAREHOUSE_NAME`, `REPORT_SIGNATURE` (podpis w mailach i PDF).

## Testy

```bash
npm run solver:test                 # model: grupy, stanowiska, bufor, godziny, awizacje, wąskie gardło, kontrakt
npm test                            # TS: czas/DST, import list, budowa żądania, maile, PDF
npm run test:e2e -w apps/web        # baza + solver: plan dnia z seeda, niezależna weryfikacja
npm run contracts:export            # po zmianie kontraktu (test Pythona wykryje rozjazd)
```

## Założenia do potwierdzenia

- Czas rozładunku rośnie proporcjonalnie do liczby palet (pełne auto 35 palet = 60 min) i jest zaokrąglany w górę do slotu (10 min).
- Wydajność wózkowych (90 palet/h) i podstawienie (20 min) to wartości szacowane, a nie zmierzone.
- Godzina w raporcie = przyjazd i podstawienie na stanowisko; rozładunek zaczyna się po podstawieniu.
- Przerwy dotyczą grup rozładunkowych; wózkowi odnoszący na regał (inny zespół) pracują bez przerw w modelu.
- Dane przykładowe są sztuczne (w tym 11.11 — święto, w realnym planie dzień bez dostaw).
- Auto bez okna awizacji może przyjechać o dowolnej porze w godzinach pracy.
