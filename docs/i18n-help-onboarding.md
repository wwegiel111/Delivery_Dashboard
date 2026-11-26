# Języki, pomoc kontekstowa i samouczek — dokumentacja techniczna

Dotyczy `apps/web`. Trzy funkcje dzielą jedno źródło treści: słowniki `apps/web/messages/pl.json` i `en.json`.

## 1. Tłumaczenia (next-intl)

**Architektura**

| Element | Plik | Rola |
|---|---|---|
| Konfiguracja języków | `src/i18n/config.ts` | `LOCALES = ["pl","en"]`, domyślnie `pl`, cookie `NEXT_LOCALE` (1 rok), mapowanie na `pl-PL` / `en-GB` dla `Intl` |
| Konfiguracja żądania | `src/i18n/request.ts` | next-intl bez prefiksów w URL — język czytany z cookie przy SSR (poprawny `<html lang>`, bez migania) |
| Słowniki | `messages/pl.json`, `messages/en.json` | ICU MessageFormat (liczba mnoga, argumenty, znaczniki `<b>`, `<link>`) |
| Typowanie kluczy | `src/global.d.ts` | `AppConfig` → literówka w kluczu = błąd `tsc` |
| Tłumacz poza Reactem | `src/i18n/translator.ts` | `translator(locale)` — PDF, e-maile, walidacja importu, testy |
| Język żądania | `src/i18n/server.ts` | `currentLocale()` w Server Components, Server Actions i Route Handlers |
| Błędy serwera | `src/server/errors.ts` | `LocalizedError(key, values)` rzucany w logice; `localizeError(err, locale)` tłumaczy w warstwie HTTP |
| Reguły tekstów (liczenie zdań w testach) | `src/i18n/text-rules.ts` | używane przez testy treści |
| Formatowanie | `src/lib/time-format.ts` | daty, godziny (24 h), liczby, procenty wg języka; zawsze w strefie magazynu |

Przestrzenie nazw: `common`, `metadata`, `navigation`, `language`, `statuses`, `deliveries`, `import`, `scheduling`,
`statistics`, `charts`, `settings`, `validation`, `notifications`, `errors`, `solverHints`, `reports`, `emails`,
`tooltips`, `onboarding`, `help`.

**Czego nie tłumaczymy:** danych z bazy i od użytkowników (przewoźnicy, numery list, rejestracje), nazw kolumn pliku importu
(`numer_listu`, `przewoznik`, …), wartości zapisywanych w bazie, kontraktu z solverem. Wskazówki solvera (polski tekst z Pythona)
tłumaczy `src/server/scheduling/hints.ts` po wzorcu — kontrakt API bez zmian. Domyślna nazwa stanowiska z bazy
(`Stanowisko N`) jest wyświetlana jako `Dock N`; własne nazwy bez zmian.

**Dodanie tłumaczenia**

1. Dodaj klucz w **obu** plikach `messages/*.json` w tej samej przestrzeni nazw.
2. W komponencie: `useTranslations("przestrzeń")` (Server i Client Components), w `async` Server Component:
   `getTranslations`, w kodzie bez Reacta: `translator(locale)`.
3. `npm test -w apps/web` — test `src/i18n/messages.test.ts` sprawdza zgodność kluczy, poprawność ICU w obu językach
   i to, czy angielski używa tylko argumentów dostępnych w polskim.

**Przełącznik języka** (`src/components/layout/language-switcher.tsx`): zapisuje cookie i wywołuje `router.refresh()` —
URL (wybrany dzień, wersja planu), stan komponentów klienta i wpisane w formularze wartości zostają.

**Język dokumentów:** PDF (`GET /api/schedule/{id}/report?lang=pl|en`, parametr opcjonalny) i treść maili mogą mieć inny
język niż interfejs — pole „Język PDF i wiadomości” na ekranie planu (`src/components/plan/document-language.tsx`,
zapamiętane w `localStorage: etp.docLocale`; bez jawnego wyboru = język interfejsu).

## 2. Pomoc kontekstowa

Zasada: opis wyjaśnia, **na co patrzysz i jak to czytać** — najwyżej dwa krótkie zdania, bez wzorów i szczegółów
technicznych. Ikony ⓘ tylko przy elementach, których znaczenie nie wynika z etykiety (nie przy „Zapisz”, „Anuluj”, „Usuń”).

| Komponent | Plik | Rola |
|---|---|---|
| `HelpTip` | `src/components/help/descriptions.tsx` | ikona ⓘ z tekstem `tooltips.<grupa>.<id>` (grupy: `metrics`, `params`, `fields`, `actions`, `columns`) |
| `InfoTooltip` | `src/components/help/info-tooltip.tsx` | kompaktowy dymek: najechanie, fokus z klawiatury (Tab), kliknięcie / dotknięcie; Esc zamyka |
| `FieldDescription`, `WithHelp` | `descriptions.tsx` | krótka widoczna notka; spójne położenie ikony (zawsze za tekstem) |

**Dodanie opisu:** dopisz jedno-, dwuzdaniowy tekst w `tooltips.<grupa>.<id>` w obu słownikach i wstaw
`<HelpTip group="params" id="bufferCapacity" topic={etykieta} />`. Przy parametrach ustawień dodaj też id do `TIP_PARAMS`
(`src/app/(dashboard)/settings/page.tsx`). Test `messages.test.ts` pilnuje limitu dwóch zdań (i 190 znaków) w obu językach.

## 3. Samouczek (guided tour)

Krótkie wprowadzenie: **17 kroków, ok. 2 minuty** — główny przepływ pracy (dostawy → parametry → plan → wysyłka),
bez omawiania każdego przycisku.

| Element | Plik |
|---|---|
| Lista kroków (jedno źródło dla przewodnika i instrukcji `/help`) | `src/onboarding/tour-definition.ts` |
| Stan i przejścia (czyste funkcje) | `src/onboarding/tour-state.ts` |
| Sterowanie (driver.js), okno powitalne, API `useTour()` | `src/components/onboarding/tour-provider.tsx`, `welcome-dialog.tsx` |
| Zakładki ekranu planu sterowane przez samouczek | `src/components/plan/plan-tabs.tsx`, zdarzenie `etp:tour-tab` |

Kroki wskazują elementy stabilnym atrybutem `data-tour="…"`. Gdy elementu nie ma (np. brak planu), okno pokazuje się na
środku z krótką notką. Samouczek przechodzi między stronami i wraca na ostatnio oglądany dzień planu. Podświetlony element
jest zablokowany (wyjątek: przełącznik języka) — samouczek niczego nie tworzy, nie zmienia, nie usuwa i nie wysyła.
Sterowanie: Dalej / Wstecz / ✕, klawiatura ← → Esc, postęp „Krok N z 17”, `prefers-reduced-motion` wyłącza animacje.

**Dodanie kroku** (utrzymuj limit 20 kroków — pilnuje go test):

1. Dodaj `data-tour="moj-element"` do elementu.
2. Dodaj krok w `TOUR`: `{ id: "mojKrok", route: "/schedule", target: "moj-element", side: "bottom" }`
   (opcjonalnie `tab: "timeline"` albo `interactive: true` — tylko dla bezpiecznych elementów).
3. Dodaj `onboarding.steps.mojKrok.{title, body}` w obu słownikach (treść: maks. 2 zdania).
4. `npm test -w apps/web` — `tour-definition.test.ts` sprawdza liczbę kroków, długość treści, czas czytania i istnienie `data-tour`.

**Statusy i zapamiętywanie**

| Status | Znaczenie | Gdzie |
|---|---|---|
| `not_started` | okno powitalne przy wejściu | cookie `etp_tour` (1 rok, czytane przy SSR) |
| `in_progress` | trwa; odświeżenie strony kontynuuje | + numer kroku w `localStorage: etp.tour.v2` |
| `paused` | przerwany (✕ / Esc lub zamknięcie przeglądarki) — „Wróć do samouczka” w Pomocy | |
| `completed` / `skipped` | okno powitalne się nie pokazuje | |

„Zrobię to później” ustawia cookie sesyjne `etp_tour_later` — okno wróci w następnej sesji przeglądarki.

## 4. Pomoc

Przycisk „Pomoc” w nagłówku (`src/components/help/help-center.tsx`): wznowienie przerwanego samouczka, uruchomienie go
od nowa, „Jak zacząć” (5 kroków) i link do instrukcji `/help`. Strona `/help` zawiera szybki start, opis ekranów
generowany z kroków samouczka i 6 najczęstszych pytań (`src/components/help/help-content.tsx`, `src/help/content.ts`).

## 4a. Generowanie planu — statusy i komunikaty

Wersja planu jest zapisywana ze statusem `SOLVING` przed wywołaniem solvera. Stan widoczny w interfejsie wylicza czysta
funkcja `runState()` (`src/server/scheduling/run-state.ts`):

| Stan | Kiedy | Wygląd |
|---|---|---|
| `solving` | `SOLVING` i nie minął termin (`createdAt` + limit czasu solvera + 90 s) | bursztyn + kręcący się `Loader2` |
| `success` | `OPTIMAL` lub `FEASIBLE` | zielony + `CheckCircle2` |
| `failed` / `infeasible` | `INFEASIBLE` | czerwony + `XCircle` |
| `failed` / `timeout` | solver nie znalazł planu w limicie czasu (`UNKNOWN`) | jw. |
| `failed` / `connection` | brak połączenia, błąd HTTP lub przekroczony czas odpowiedzi modułu planowania | jw. + szczegóły |
| `failed` / `unexpected` | każdy inny błąd | jw. + szczegóły |
| `failed` / `interrupted` | `SOLVING` po terminie (np. restart serwera w trakcie obliczeń) | jw. |
| brak wersji | dzień bez planu — to nie jest błąd | szary + `CircleDashed` |

- Błędy zapisujemy w `errorMessage` jako JSON `{"key","values"}` (klucze z `errors.*`), więc komunikat jest tłumaczony
  przy wyświetlaniu; stare polskie teksty są rozpoznawane wyrażeniem regularnym.
- `GenerationProvider` (`src/components/plan/generation.tsx`, montowany w `schedule/layout.tsx`, więc przeżywa zmianę dnia)
  pamięta dni w trakcie generowania, postęp tygodnia i błędy przycisków. Dopóki coś się generuje — także po odświeżeniu
  strony (`SolvingWatcher`) — co 3 s odświeża dane serwera; wynik pojawia się sam.
- Drugie żądanie dla dnia, który się generuje, serwer odrzuca (HTTP 409, `errors.planSolving`); trwającej wersji nie da się
  usunąć (przycisk ukryty, serwer też odmawia), przerwaną — tak.
- Teksty: `scheduling.generating.*`, `scheduling.failure.*`, `scheduling.state.*`.

## 5. Terminologia (PL / EN)

| PL | EN |
|---|---|
| Plan przyjęć | Delivery schedule (menu: Schedule) |
| Parametry magazynu | Warehouse settings (menu: Settings) |
| List przewozowy | Consignment note |
| Stanowisko rozładunkowe | Unloading dock / Dock |
| Grupa rozładunkowa | Unloading team / Team |
| Bufor, pojemność bufora, zajęcie bufora | Staging area, staging capacity, staging occupancy |
| Wózkowi, wydajność wózkowych | Forklift operators, forklift handling rate |
| Okno awizacji (sztywne) | Time window (fixed) |
| Czas podstawienia | Vehicle positioning time |
| Wagi planowania | Optimization priorities |
| Ułóż plan dnia / tygodnia | Generate daily / weekly schedule |
| Plan optymalny / poprawny / brak wykonalnego planu | Optimal / valid / no feasible schedule |

Teksty w obu językach są pisane niezależnie (naturalnie dla danego języka), a nie tłumaczone słowo w słowo; nazwy kolumn
pliku importu (`numer_listu`, …) zostają bez zmian, bo są formatem danych.

## 6. Uruchamianie i testy

```bash
npm install                      # nowe zależności: next-intl, driver.js, @radix-ui/react-popover, @radix-ui/react-dialog
npm test                         # w tym: zgodność słowników, limit 2 zdań w opisach, ≤20 kroków samouczka, PDF/maile EN
npm run typecheck
npm run build -w apps/web
npm run test:e2e -w apps/web     # baza + solver
```

Ręcznie: wyczyść cookies (`etp_tour`, `etp_tour_later`, `NEXT_LOCALE`) i `localStorage`, aby zobaczyć okno powitalne jak nowy użytkownik.
