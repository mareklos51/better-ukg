# Changelog

## [1.3.0] – 2026-05-29

### Dodano
- **Format HH:MM** – sumy godzin w wierszach podsumowujących dzień są wyświetlane jako `08:01` zamiast `8.02 hrs`; przełącznik w ustawieniach wtyczki
- **Sick Leave** – pole korekty dni Sick Leave bezpośrednio w banerze (bez otwierania panelu ustawień)

### Naprawiono
- Baner nie przesuwa już zawartości strony w dół – usunięto `padding-top` z `body`, który powodował ucinanie ostatniego dnia miesiąca przy pełnym widoku timesheeta

### Zmieniono
- Opis rozszerzenia w `manifest.json` zaktualizowany do angielskiego (zgodność z wymogami sklepów)
- Drobne poprawki tekstu w README

---

## [1.2.0] – 2026-05-28

### Dodano
- **Salda urlopowe w dniach** – strony `Time Off → Balances` i `Time Off → Request` automatycznie przeliczają godziny na dni (÷ 8) dla kart Vacation i Childcare PTO; przełącznik w ustawieniach
- **Lepsza obsługa UKG** – poprawiona detekcja timesheeta, bardziej odporna na zmiany konfiguracji kolumn

### Naprawiono
- Poprawna obsługa wiersza dzisiejszego dnia bez wpisanych godzin (norma nie jest naliczana za pusty dzień)

---

## [1.1.0] – 2026-05-20

### Dodano
- Panel ustawień (popup) z konfiguracją normy godzin dziennie i ręcznej normy miesięcznej
- Obsługa trybu menedżera (`Manage → Time → Timesheet`)

---

## [1.0.0] – 2026-05-15

### Pierwsze wydanie
- Baner z saldem czasu flex (`+HH:MM` / `-HH:MM`) wstrzykiwany na górę timesheeta UKG Pro
- Obliczanie normy na podstawie minionych dni roboczych (pon–pt)
- Wykluczanie wpisów `Overtime Payout` z kalkulacji flex
- Obsługa routingu SPA (hashchange, MutationObserver, polling)
