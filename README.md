# ⏱ Flex Time Calculator

Rozszerzenie przeglądarki **Microsoft Edge / Chrome** dla systemu **UKG Pro**, które automatycznie oblicza saldo czasu elastycznego (flex) na podstawie timesheeta i wyświetla je jako pasek na górze strony.

---

## Problem

W firmach z elastycznym czasem pracy pracownicy mogą pracować np. 9h jednego dnia i 7h następnego, byleby do końca miesiąca wyrobić normę. System UKG/SaaSHR nie pokazuje jednak, ile godzin jesteś aktualnie na plusie lub na minusie — trzeba to liczyć ręcznie.

W firmie dozwolony jest elastyczny czas pracy, np. 9h jednego dnia i 7h następnego tak, aby do końca miesiąca wyrobić normę godzinową. System UKG nie pokazuje, ile godzin jesteś aktualnie na plusie lub na minusie. Trzeba to liczyć ręcznie lub na podstawie Atoss'a.

## Rozwiązanie

Wtyczka odczytuje dane bezpośrednio z timesheeta i oblicza:

- **Saldo flex** (`+HH:MM` / `-HH:MM`) — ile godzin jesteś przed lub za normą *na dziś*
- **Przepracowane / norma miesiąca** — łączna liczba godzin vs pełna norma miesięczna
- **Pozostało** — ile godzin zostało do wyrobienia normy do końca miesiąca
- **Overtime Payout** — godziny oznaczone jako *Overtime Payout* w kolumnie Activity są automatycznie **wykluczone** z salda flex

---

## Jak to działa

| Co | Jak |
|---|---|
| Norma | Dni robocze (Pn–Pt) w miesiącu × 8h |
| Saldo vs dziś | Przepracowane − (minione dni robocze × 8h) |
| Urlopy / PTO / Holiday | Wpisane w UKG jako 8h → naturalnie wliczają się do normy |
| Overtime Payout | Wykrywane po polu `Activity` i odejmowane od sumy flex |
| Odświeżanie | Automatyczne po nawigacji i zmianie danych (SPA-aware) |

---

## Instalacja w Microsoft Edge

### Krok 1 – Pobierz pliki

**Opcja A — pobierz ZIP:**
1. Kliknij zielony przycisk **Code** → **Download ZIP**
2. Rozpakuj archiwum w dowolnym folderze

### Krok 2 – Włącz tryb dewelopera w Edge

1. W pasku adresu wpisz: `edge://extensions`
2. W prawym górnym rogu włącz przełącznik **„Tryb dewelopera"**

### Krok 3 – Załaduj rozszerzenie

1. Kliknij przycisk **„Załaduj rozpakowane"**
2. Wskaż folder z plikami rozszerzenia (ten, w którym jest plik `manifest.json`)
3. Rozszerzenie pojawi się na liście z ikoną ⏱

### Krok 4 – Użytkowanie

1. Zaloguj się do UKG
2. Przejdź do swojego timesheeta (`My Time → Timesheet`)
3. Baner z saldem flex pojawi się automatycznie na górze strony

---

## Instalacja w Google Chrome

Identyczna procedura jak w Edge:

1. W pasku adresu wpisz: `chrome://extensions`
2. Włącz **„Tryb dewelopera"** (prawy górny róg)
3. Kliknij **„Załaduj rozpakowane"** i wskaż folder z `manifest.json`

---

