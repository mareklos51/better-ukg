# Changelog

## [1.5.4] – 2026-06-16

### Dodano
- **Pamięć ustawień per osoba** – etat i korekta są teraz zapamiętywane dla konkretnej osoby na podstawie numeru pracowniczego z nagłówka timesheeta (np. `(5978)`); we własnym widoku pod kluczem `self`. Menedżer „skacząc" między timesheetami widzi i ustawia indywidualne wartości każdego pracownika.
  - **Etat** (norma h/dzień) – trwały per osoba, obowiązuje w każdym miesiącu. Standard to 8h; wyjątki (np. 7/8) ustawiasz wprost na banerze danego timesheeta. Znacznik `💾` informuje o zapamiętanym własnym etacie.
  - **Korekta** – zapamiętywana per osoba **i miesiąc**; świeża (0) w nowym miesiącu, poprzednie miesiące zachowane. Edytowalna wprost na banerze.
  - Baner pokazuje, dla kogo zapisywane są ustawienia (👤 imię i nazwisko / „Twój timesheet").
  - Dane przechowywane lokalnie w `chrome.storage.local` (klucz `personData`).
- **Podświetlanie niedokończonych dni** – przeszłe dni robocze (Pn–Pt) bez żadnych godzin w kolumnie *Raw Total* są delikatnie zaznaczane czerwonym tłem. Wyłapuje to typowy błąd: wpisany *Clock In* bez *Clock Out* (Raw Total pusty) oraz całkiem puste dni robocze. Dni z dowolnym wpisem (praca lub absencja: Holiday, Vacation, Blood Donation itp.) mają Raw Total > 0, więc nie są zaznaczane. Dzień bieżący i weekendy są pomijane.

### Zmieniono
- **Etat zamiast globalnej normy dziennej** – pole *Norma godzin/dzień* usunięte z menu wtyczki. Standardowy etat to teraz stała 8h, a wyjątki ustawia się indywidualnie per osoba na banerze. Wcześniej globalna norma była domyślną dla wszystkich, przez co zmiana na np. 7h błędnie narzucała 7h każdemu pracownikowi bez własnego ustawienia.
- **Ujemna korekta w banerze** – wartość ujemnej korekty ręcznej jest teraz pokazywana ze znakiem `−` i czerwonym kolorem (wcześniej bez znaku).

## [1.5.3] – 2026-06-08

### Zmieniono
- **Korekta ręczna (h)** – pole *Sick Leave (dni)* zastąpione polem *Korekta ręczna* w godzinach; obsługuje wartości dodatnie, ujemne i ułamkowe (np. `-4`, `+8`, `-4.5`). Używaj gdy wtyczka liczy coś błędnie z powodu niestandardowej konfiguracji UKG.

### Naprawiono
- **Absencja w bieżącym dniu** – gdy dzień dzisiejszy jest dniem absencji (Child Care, Blood Donation, Vacation on Demand itp.) z zerem godzin w `Calc.Total`, saldo flex było zawyżone o wartość całodniowej normy. Błąd wynikał z jednoczesnego działania logiki `isTodayEmpty` i `absenceNormAdjust`, które wzajemnie się dublowały. Naprawiono przez wyłączenie `isTodayEmpty` dla dni z wpisem absencji.

---

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
