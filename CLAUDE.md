# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Flex Time Calculator** — rozszerzenie przeglądarki Chrome/Edge (Manifest V3) dla systemu SaaSHR/UKG Pro (Kronos). Automatycznie oblicza saldo czasu flex na podstawie timesheeta wyświetlanego na `*.saashr.com` i pokazuje je jako przypięty baner na górze strony.

Kontekst biznesowy: pracownicy pracują elastycznie (np. 9h dziś, 7h jutro), a system UKG nie wyświetla, ile godzin ktoś jest na plusie/minusie względem normy miesięcznej. Wtyczka rozwiązuje ten problem bez modyfikowania backendu.

## Instalacja i testowanie (bez build tools)

Projekt nie ma bundlera ani package.json — to surowe rozszerzenie MV3, gotowe do załadowania bezpośrednio.

```bash
# Załaduj w Chrome/Edge:
# chrome://extensions → "Tryb dewelopera" → "Załaduj rozpakowane" → wskaż flex-time-calculator/

# Spakuj do ZIP (do dystrybucji):
zip -r flex-time-calculator.zip flex-time-calculator/

# Regeneruj ikony PNG (Python 3, bez zewnętrznych bibliotek):
python3 generate_icons.py   # jeśli plik istnieje, patrz content.js po wzór
```

Nie ma testów automatycznych — weryfikację przeprowadza się ręcznie:
1. Otwórz timesheet na `secure*.saashr.com/#time/timesheet/...`
2. Sprawdź czy baner pojawia się na górze strony
3. Porównaj saldo z ręcznym obliczeniem: `Σ(Calc. Total) - (dni robocze do dziś × 8h)`

## Architektura

```
flex-time-calculator/
├── manifest.json   ← MV3, host_permissions: *.saashr.com, permission: storage
├── content.js      ← GŁÓWNA LOGIKA: parsuje DOM, oblicza saldo, wstrzykuje baner
├── styles.css      ← style banera (prefix: ftc-*, position: fixed top)
├── popup.html      ← panel ustawień (otwierany kliknięciem ikony rozszerzenia)
└── popup.js        ← odczytuje dane z content.js via chrome.tabs.sendMessage
```

### Przepływ danych

```
UKG SPA (hash routing) → hashchange event
        ↓
content.js: isTimesheetPage() → sprawdza window.location.hash
        ↓
startPolling() + MutationObserver → czeka na załadowanie DOM
        ↓
calculate() → odczytuje DOM → zwraca obiekt z saldem
        ↓
injectBanner() → document.body.prepend(div#flex-time-calc-banner)
        ↓
popup.js ← chrome.tabs.sendMessage({action:'getFlexData'}) → renderuje to samo
```

### Kluczowe selektory DOM (SaaSHR/UKG)

| Co szukamy | Selektor |
|---|---|
| Zakres okresu (np. "May 01, 2026 - May 31, 2026") | `span.c-timesheet-header__date-carousel-title` |
| Wiersze podsumowań dziennych | `tr[data-group-date]` z klasą `m-footer` |
| Kolumna "Calc. Total" | `td` pod indeksem `5` (CALC_TOTAL_TD_INDEX) w wierszu m-footer |
| Data dnia | atrybut `data-group-date` na `<tr>` (np. `"FRI May 1"`) |

**Uwaga krytyczna:** `CALC_TOTAL_TD_INDEX = 5` jest hardkodowany na podstawie kolejności kolumn: Date, [Action], From, To, Raw Total, **Calc. Total**, In Date, Time Off, Accounting, Activity, Notes. Jeśli UKG zmieni układ kolumn, ten indeks wymaga aktualizacji.

### Algorytm kalkulacji

1. **Okres** — parsowany z nagłówka przez regex (`parsePeriodDates`)
2. **Przepracowane** — suma `Calc. Total` ze wszystkich `tr.m-footer` (wiersze weekend/brak wpisu mają `0.00 hrs`)
3. **Norma na dziś** — `countWorkingDays(periodStart, today) × hoursPerDay × 60`
4. **Saldo** = przepracowane − norma na dziś (ujemne = za mało, dodatnie = na plusie)
5. **Pozostało do końca miesiąca** = `normFullMonth - przepracowane`

Czas off (PTO/Holiday/Vacation/Sick) jest wpisany w UKG jako `8.00 hrs` w kolumnie Calc. Total → naturalnie wlicza się do sumy bez żadnej specjalnej obsługi.

### Komunikacja popup ↔ content script

- `popup.js → content.js`: `{action: 'getFlexData'}` → zwraca obiekt kalkulacji
- `popup.js → content.js`: `{action: 'settingsUpdated', hoursPerDay, manualNorm}` → przelicza i odświeża baner
- Ustawienia persystują w `chrome.storage.local`: klucze `hoursPerDay`, `manualNorm`

### Obsługa SPA (hash routing)

SaaSHR to React SPA — strona nie przeładowuje się przy zmianie podstrony. Wtyczka obsługuje to przez:
- `window.addEventListener('hashchange', ...)` — wykrywa nawigację
- `MutationObserver` na `document.body` — wykrywa dynamiczne załadowanie tabeli
- Polling co 500ms (max 40 prób = 20s) — fallback gdy MutationObserver nie złapie zmiany

### Plik `timesheet.html`

Zapis HTML strony z timesheetem — używany do analizy struktury DOM i testowania selektorów bez otwierania przeglądarki. Nie jest częścią rozszerzenia. Można go zaktualizować poleceniem w konsoli przeglądarki:
```javascript
copy(document.documentElement.outerHTML)
```
