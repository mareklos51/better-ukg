# ⏱ Better UKG

Rozszerzenie przeglądarki **Microsoft Edge / Chrome** dla systemu **UKG Pro**, które automatycznie oblicza saldo czasu elastycznego (flex) na podstawie timesheeta i wyświetla je jako pasek na górze strony. Dodatkowo przelicza salda urlopowe z godzin na dni.

---

## Funkcjonalności

### Kalkulator czasu flex (Timesheet)

Wtyczka odczytuje dane bezpośrednio z timesheeta i oblicza:

- **Saldo flex** (`+HH:MM` / `-HH:MM`) — ile godzin jesteś przed lub za normą *na dziś*
- **Przepracowane / norma miesiąca** — łączna liczba godzin vs pełna norma miesięczna
- **Pozostało** — ile godzin zostało do wyrobienia normy do końca miesiąca
- **Overtime Payout** — godziny oznaczone jako *Overtime Payout* w kolumnie Activity są automatycznie **wykluczone** z salda flex
- **Sick Leave** — możliwość uwzględnienia dni chorobowych bez wpisu w timesheecie (dodaje godziny do salda flex)

![Baner flex time na górze timesheeta](assets/flex-time-bar-timesheet.png)

Sumy godzin w wierszach podsumowujących dzień są wyświetlane w formacie **HH:MM** zamiast domyślnego `X.XX hrs`:

![Sumy godzin w formacie HH:MM](assets/time-in-hhmm-timesheet.png)

### Menu wtyczki

Kliknij ikonę ⏱ na pasku przeglądarki, aby otworzyć panel z saldem flex i ustawieniami:

![Panel ustawień wtyczki](assets/addon-menu.png)

### Salda urlopowe (Time Off Balances)

Na stronie `Time Off → Balances` wtyczka automatycznie przelicza salda urlopowe z godzin na dni dla kart **Vacation** i **Childcare PTO**:

- Duże saldo (`192.00 hours` → `24 days`)
- Wszystkie pozycje na liście (`Current Accrued`, `Current Balance`, `Taken`, `Scheduled`, `Requested`, `Available Balance`)

![Salda urlopowe w dniach – widok Balances](assets/vacation-balance-mgr-view-days.png)

Na stronie `Time Off → Request` wtyczka automatycznie przelicza saldo urlopowe z godzin na dni:

![Salda urlopowe w dniach – widok Request](assets/vacation-balance-request-days.png)

Działa zarówno w widoku pracownika (`My Time`) jak i w widoku menedżera (`Manage → Time`).

---

## Jak to działa

| Co | Jak |
|---|---|
| Norma | Dni robocze (Pn–Pt) w miesiącu × 8h |
| Saldo vs dziś | Przepracowane − (minione dni robocze × 8h) |
| Urlopy / PTO / Holiday | Wpisane w UKG jako 8h → naturalnie wliczają się do normy |
| Overtime Payout | Wykrywane po polu `Activity` i odejmowane od sumy flex |
| Przelicznik urlopu | Godziny ÷ 8 = dni (konfigurowalne w menu wtyczki) |
| Odświeżanie | Automatyczne po nawigacji i zmianie danych (odśwież stronę) |
| Sick Leave | Przy nie wpisanym sick leave, możesz wprowadzić korektę o ilość dni |

---

## Instalacja w Microsoft Edge

### Krok 1 – Pobierz pliki

1. Kliknij zielony przycisk **Code** → **Download ZIP**
2. Rozpakuj archiwum w dowolnym folderze (np. na pulpicie w folderze Better UKG)

### Krok 2 – Włącz tryb dewelopera

1. W pasku adresu wpisz: `edge://extensions`
2. W lewej kolumnie włącz przełącznik **„Tryb dewelopera"**

Uwaga: Edge będzie przypominał o tym, że tryb dewelopera jest włączony. Możliwe jest jedynie przesuwanie tego przypomnienia co 2 tygodnie.

### Krok 3 – Załaduj rozszerzenie

1. Kliknij przycisk **„Załaduj rozpakowane"** / **„Load unpacked"**
2. Wskaż folder z plikami rozszerzenia (ten, w którym jest plik `manifest.json`)
3. Rozszerzenie pojawi się na liście z ikoną ⏱

### Krok 4 – Użytkowanie

1. Zaloguj się do UKG Pro
2. Przejdź do swojego timesheeta (`My Time → Timesheet`) — baner z saldem flex pojawi się automatycznie
3. Przejdź do `Time Off → Request` — salda Vacation zostaną automatycznie przeliczone na dni

---

## Instalacja w Google Chrome

Identyczna procedura jak w Edge:

1. W pasku adresu wpisz: `chrome://extensions`
2. Włącz **„Tryb dewelopera"** (prawy górny róg)
3. Kliknij **„Załaduj rozpakowane"** i wskaż folder z `manifest.json`

---

## Historia wersji

### v1.2.0
- Zmiana nazwy wtyczki na **Better UKG**
- Przeliczanie sald urlopowych z godzin na dni na stronie **Time Off Balances** (Vacation i Childcare PTO)
- Obsługa widoku menedżerskiego (`manage/time/timeoff/balances`)
- Toggle w menu wtyczki: **Urlop w dniach / godzinach** (działa natychmiast, bez zapisywania)

### v1.1.0
- Obsługa strony `Time Off → Request` — salda urlopowe przeliczane na dni
- Obsługa przypadku gdy dzisiejszy dzień jest pusty w timesheecie

### v1.0.0
- Pierwsze wydanie: kalkulator salda flex z banerem na górze strony
- Wykluczanie Overtime Payout z kalkulacji
- Obsługa Sick Leave
- Panel ustawień w popup

---

*Better UKG v1.2 by Marek Łoś · UKG Pro*
