/**
 * Better UKG – content script
 * Strona docelowa: *.saashr.com (UKG Pro)
 *
 * Algorytm:
 *  1. Pobierz zakres okresu z nagłówka timesheeta (span.c-timesheet-header__date-carousel-title)
 *  2. Zsumuj "Calc. Total" ze wszystkich wierszy-podsumowań dnia (tr[data-group-date].m-footer, TD[5])
 *  3. Oblicz minione dni robocze (od początku okresu do dziś)
 *  4. Saldo = przepracowane − minione_dni × hoursPerDay
 *  5. Wstrzyknij baner fixed na górę strony
 */

(function () {
  'use strict';

  // ─── Konfiguracja (nadpisywana przez chrome.storage) ─────────────────────────
  let CFG = {
    hoursPerDay: 8,       // norma godzin dziennie
    manualNorm: 0,        // ręczna norma miesiąca (godziny); 0 = auto
    sickLeaveDays: 0,     // dni Sick Leave bez wpisu w timesheecie
    vacationInDays: true, // wyświetlaj salda urlopowe w dniach (zamiast godzin)
  };

  const BANNER_ID            = 'flex-time-calc-banner';
  const CALC_TOTAL_TD_INDEX  = 5;    // indeks kolumny "Calc. Total" w TR timesheeta
  const POLL_INTERVAL_MS     = 500;
  const POLL_MAX_ATTEMPTS    = 40;   // 20 sekund czekania

  const TIMESHEET_HASH_PATTERNS = [
    '#time/timesheet',
    '#manage/time/timesheet',
    '#time/view/timesheets',
  ];

  const VACATION_HASH_PATTERNS = [
    '#time/timeoff',
    '#manage/time/timeoff',
  ];

  let pollTimer       = null;
  let mutationObs     = null;
  let debounceTimer   = null;

  // ─── Parsowanie i formatowanie ────────────────────────────────────────────────

  /** "8.02 hrs" → 481 min */
  function parseHoursToMinutes(text) {
    const m = (text || '').trim().match(/^([\d.]+)\s*hrs?$/i);
    return m ? Math.round(parseFloat(m[1]) * 60) : 0;
  }

  /** 481 min → "+08:01" lub "-00:45" */
  function formatBalance(minutes) {
    const sign = minutes >= 0 ? '+' : '-';
    const abs  = Math.abs(minutes);
    return sign + fmt2(Math.floor(abs / 60)) + ':' + fmt2(abs % 60);
  }

  /** 481 min → "08:01" (bez znaku) */
  function formatMinutes(minutes) {
    const abs = Math.abs(minutes);
    return fmt2(Math.floor(abs / 60)) + ':' + fmt2(abs % 60);
  }

  function fmt2(n) { return String(n).padStart(2, '0'); }

  /** Zlicza dni robocze Pn–Pt od start do end (włącznie) */
  function countWorkingDays(start, end) {
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end);   e.setHours(0, 0, 0, 0);
    let count = 0;
    const d = new Date(s);
    while (d <= e) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  /** Parsuje "May 01, 2026 - May 31, 2026" → { start: Date, end: Date } */
  function parsePeriodDates(text) {
    const m = (text || '').match(
      /([A-Za-z]+ \d{1,2},?\s*\d{4})\s*[-–—]\s*([A-Za-z]+ \d{1,2},?\s*\d{4})/
    );
    if (!m) return null;
    const start = new Date(m[1]);
    const end   = new Date(m[2]);
    if (isNaN(start) || isNaN(end)) return null;
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return { start, end };
  }

  // ─── Główna kalkulacja ────────────────────────────────────────────────────────

  /**
   * Parsuje format daty z atrybutu data-group-date UKG: "THU May 28" → { month: 4, day: 28 }
   * new Date() nie radzi sobie z tym formatem (brak roku, niestandardowy zapis).
   */
  const MONTH_ABBR = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
                       Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

  function parseDateAttr(attr) {
    const m = (attr || '').trim().match(/^[A-Z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})$/);
    if (!m) return null;
    const month = MONTH_ABBR[m[1]];
    const day   = parseInt(m[2], 10);
    if (month === undefined || isNaN(day)) return null;
    return { month, day };
  }

  /**
   * Zwraca true jeśli m-footer dla dzisiejszej daty istnieje, ale ma 0 godzin.
   * Używane żeby nie naliczać normy za dzień, który jeszcze nie jest wpisany.
   */
  function isTodayEmpty(today) {
    const todayMonth = today.getMonth();
    const todayDay   = today.getDate();
    let foundRow = false;
    let hasHours = false;

    document.querySelectorAll('tr[data-group-date].m-footer').forEach((row) => {
      const parsed = parseDateAttr(row.getAttribute('data-group-date'));
      if (!parsed) return;
      if (parsed.month !== todayMonth || parsed.day !== todayDay) return;

      foundRow = true;
      const tds = row.querySelectorAll('td');
      if (tds.length > CALC_TOTAL_TD_INDEX) {
        if (parseHoursToMinutes(tds[CALC_TOTAL_TD_INDEX].textContent) > 0) hasHours = true;
      }
    });

    return foundRow && !hasHours;
  }

  function calculate() {
    // 1. Nagłówek okresu
    const titleEl = document.querySelector('span.c-timesheet-header__date-carousel-title');
    if (!titleEl) return null;

    const period = parsePeriodDates(titleEl.textContent);
    if (!period) return null;

    // 2. Suma "Calc. Total" ze wszystkich wierszy m-footer
    let totalWorkedMinutes = 0;
    const allRows = document.querySelectorAll('tr[data-group-date]');
    if (allRows.length === 0) return null;   // timesheet się jeszcze ładuje

    allRows.forEach((row) => {
      if (!row.classList.contains('m-footer')) return;
      const tds = row.querySelectorAll('td');
      if (tds.length > CALC_TOTAL_TD_INDEX) {
        totalWorkedMinutes += parseHoursToMinutes(tds[CALC_TOTAL_TD_INDEX].textContent);
      }
    });

    // 2b. Odejmij godziny z wpisów "Overtime Payout" — nie wliczają się do flex.
    //
    // Podejście odporne na zmienną liczbę kolumn (np. dodatkowe pola Accounting):
    //
    // 1. DETEKCJA ACTIVITY: szukamy input[aria-label="Activity"] w wierszu wpisu.
    //    UKG renderuje pole Activity jako kontrolkę z input-em, którego atrybut
    //    i właściwość .value zawiera nazwę wybranej aktywności.
    //
    // 2. CALC. TOTAL: w wierszach wpisów godziny są liczbami dziesiętnymi ("8.02",
    //    nie "8.02 hrs"). RawTotal i CalcTotal to jedyne TD z czystą liczbą dziesiętną.
    //    CalcTotal to zawsze DRUGI taki TD (RawTotal jest pierwszy).
    let overtimePayoutMinutes = 0;
    document.querySelectorAll('tr[data-group-date][data-shift-id]').forEach((row) => {
      // 1. Sprawdź Activity via input[aria-label="Activity"]
      const activityInput = row.querySelector('input[aria-label="Activity"]');
      if (!activityInput) return;

      const activityValue =
        activityInput.value ||                       // właściwość DOM (żywa strona)
        activityInput.getAttribute('value') || '';   // atrybut HTML (snapshot)

      if (!activityValue.includes('Overtime Payout')) return;

      // 2. Znajdź CalcTotal: drugi TD z czystą liczbą dziesiętną
      const tds = [...row.querySelectorAll('td')];
      const decimalTds = tds.filter((td) => {
        const t = td.textContent.replace(/\s+/g, ' ').trim();
        return /^\d+\.\d+$/.test(t);
      });

      // decimalTds[0] = RawTotal, decimalTds[1] = CalcTotal
      const calcTd = decimalTds[1] ?? decimalTds[0];
      if (!calcTd) return;

      const hoursText = calcTd.textContent.replace(/\s+/g, '').trim();
      overtimePayoutMinutes += Math.round(parseFloat(hoursText) * 60);
    });

    // 3. Minione dni robocze
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveToday = today < period.end ? today : period.end;

    // Jeśli dziś jest dzień roboczy bez wpisanych godzin, nie naliczaj normy za dziś
    let normEndDate = effectiveToday;
    const todayIsWeekday = effectiveToday.getDay() !== 0 && effectiveToday.getDay() !== 6;
    if (todayIsWeekday && effectiveToday.getTime() === today.getTime() && isTodayEmpty(today)) {
      normEndDate = new Date(today);
      normEndDate.setDate(normEndDate.getDate() - 1);
    }

    const elapsedWorkingDays   = countWorkingDays(period.start, normEndDate);
    const fullMonthWorkingDays = countWorkingDays(period.start, period.end);

    // 4. Normy
    const normPerDay            = CFG.hoursPerDay * 60;
    const normElapsedMinutes    = elapsedWorkingDays * normPerDay;
    const normFullMonthMinutes  = CFG.manualNorm > 0
      ? Math.round(CFG.manualNorm * 60)
      : fullMonthWorkingDays * normPerDay;

    totalWorkedMinutes -= overtimePayoutMinutes;

    const sickLeaveAdjustMinutes = CFG.sickLeaveDays * CFG.hoursPerDay * 60;
    const balanceMinutes   = totalWorkedMinutes - normElapsedMinutes + sickLeaveAdjustMinutes;
    const remainingMinutes = normFullMonthMinutes - totalWorkedMinutes - sickLeaveAdjustMinutes;

    return {
      balanceMinutes,
      totalWorkedMinutes,
      normElapsedMinutes,
      normFullMonthMinutes,
      elapsedWorkingDays,
      fullMonthWorkingDays,
      remainingMinutes,
      overtimePayoutMinutes,
      sickLeaveAdjustMinutes,
      periodText: titleEl.textContent.trim(),
    };
  }

  // ─── Baner ────────────────────────────────────────────────────────────────────

  function injectBanner(data) {
    document.getElementById(BANNER_ID)?.remove();
    if (!data) return;

    const {
      balanceMinutes,
      totalWorkedMinutes,
      normFullMonthMinutes,
      fullMonthWorkingDays,
      remainingMinutes,
      overtimePayoutMinutes,
      sickLeaveAdjustMinutes,
    } = data;

    const isPositive = balanceMinutes >= 0;
    const normDone   = remainingMinutes <= 0;

    const otNote = overtimePayoutMinutes > 0
      ? `<span class="ftc-sep">│</span>
         <span class="ftc-ot" title="Godziny Overtime Payout wykluczone z kalkulacji flex">
           🔒 OT: ${formatMinutes(overtimePayoutMinutes)}h
         </span>`
      : '';

    const slAdjLabel = sickLeaveAdjustMinutes > 0
      ? ` <span class="ftc-sl-adj">(+${formatMinutes(sickLeaveAdjustMinutes)}h)</span>`
      : '';
    const slNote = `
      <span class="ftc-sep">│</span>
      <span class="ftc-sl">
        🏥 <span class="ftc-sl-label">Sick Leave:</span>
        <input type="number" class="ftc-sl-input" min="0" max="31" value="${CFG.sickLeaveDays}"
               title="Dni Sick Leave w tym miesiącu bez wpisu w timesheecie — dodaje ${CFG.hoursPerDay}h za każdy dzień do salda flex">
        <span class="ftc-sl-unit">dni</span>${slAdjLabel}
      </span>`;

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'status');

    banner.innerHTML = `
      <span class="ftc-icon">⏱</span>
      <span class="ftc-label">Flex Time:</span>
      <span class="ftc-balance ${isPositive ? 'ftc-positive' : 'ftc-negative'}"
            title="Saldo vs norma na dziś (${formatMinutes(data.normElapsedMinutes)}h / ${data.elapsedWorkingDays} dni)">
        ${formatBalance(balanceMinutes)}
      </span>
      <span class="ftc-sep">│</span>
      <span class="ftc-detail">
        Przepracowano: <strong>${formatMinutes(totalWorkedMinutes)}h</strong>
        / ${formatMinutes(normFullMonthMinutes)}h
        <em>(${fullMonthWorkingDays} dni rob.)</em>
      </span>
      <span class="ftc-sep">│</span>
      <span class="ftc-detail ${normDone ? 'ftc-done' : 'ftc-remaining'}">
        ${normDone
          ? `✅ Norma wyrobiona! (${formatBalance(-remainingMinutes)} nadwyżki)`
          : `📋 Pozostało: <strong>${formatMinutes(remainingMinutes)}h</strong>`}
      </span>
      ${otNote}
      ${slNote}
      <button class="ftc-close" title="Ukryj baner">✕</button>
    `;

    document.body.prepend(banner);

    banner.querySelector('.ftc-close').addEventListener('click', () => banner.remove());

    const slInput = banner.querySelector('.ftc-sl-input');
    if (slInput) {
      slInput.addEventListener('change', () => {
        const days = Math.max(0, parseInt(slInput.value) || 0);
        slInput.value = days;
        CFG.sickLeaveDays = days;
        chrome.storage.local.set({ sickLeaveDays: days });
        tryCalculateAndShow();
      });
    }
  }

  // ─── Konwersja sald urlopowych z godzin na dni ────────────────────────────────

  function isVacationPage() {
    return VACATION_HASH_PATTERNS.some((p) => window.location.hash.includes(p));
  }

  function convertVacationBalancesToDays() {
    if (!isVacationPage()) return false;
    if (!CFG.vacationInDays) return revertVacationBalancesToHours();
    let found = false;

    // Request window: "208.00<span>hrs</span>" inside .c-accrual-balances__value
    document.querySelectorAll('.c-accrual-balances__value:not([data-ftc-days])').forEach((el) => {
      const hrsSpan = el.querySelector('span');
      if (!hrsSpan || hrsSpan.textContent.trim() !== 'hrs') return;

      const textNode = [...el.childNodes].find(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== ''
      );
      if (!textNode) return;

      const hrs = parseFloat(textNode.textContent.trim());
      if (isNaN(hrs)) return;

      el.setAttribute('data-ftc-orig-text', textNode.textContent.trim());
      textNode.textContent = String(parseFloat((hrs / 8).toFixed(2)));
      hrsSpan.textContent = 'days';
      el.setAttribute('data-ftc-days', '1');
      found = true;
    });

    // Balances page: Vacation & Childcare PTO cards
    const TARGET_TITLES = ['Vacation', 'Childcare PTO'];
    document.querySelectorAll('.c-card:not([data-ftc-days])').forEach((card) => {
      const titleEl = card.querySelector('.c-card__title-primary');
      if (!titleEl || !TARGET_TITLES.includes(titleEl.textContent.trim())) return;

      // Featured value: 192.00<small class="c-balance-type-text-custom-size">hours</small>
      const valueEl = card.querySelector('.c-featured-content .value');
      if (valueEl && !valueEl.getAttribute('data-ftc-days')) {
        const smallEl = valueEl.querySelector('small.c-balance-type-text-custom-size');
        if (smallEl && smallEl.textContent.trim() === 'hours') {
          const textNode = [...valueEl.childNodes].find(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== ''
          );
          if (textNode) {
            const hrs = parseFloat(textNode.textContent.trim());
            if (!isNaN(hrs)) {
              valueEl.setAttribute('data-ftc-orig-text', textNode.textContent.trim());
              textNode.textContent = String(parseFloat((hrs / 8).toFixed(2)));
              smallEl.textContent = 'days';
              valueEl.setAttribute('data-ftc-days', '1');
            }
          }
        }
      }

      // Detail list items: <b>208.00 hrs</b>
      card.querySelectorAll('.text-list-item--line .data b').forEach((b) => {
        if (b.getAttribute('data-ftc-days')) return;
        const m = b.textContent.trim().match(/^([\d.]+)\s*hrs$/i);
        if (!m) return;
        const hrs = parseFloat(m[1]);
        if (isNaN(hrs)) return;
        b.setAttribute('data-ftc-orig', b.textContent.trim());
        b.textContent = `${parseFloat((hrs / 8).toFixed(2))} days`;
        b.setAttribute('data-ftc-days', '1');
      });

      card.setAttribute('data-ftc-days', '1');
      found = true;
    });

    return found;
  }

  function revertVacationBalancesToHours() {
    // Request window
    document.querySelectorAll('.c-accrual-balances__value[data-ftc-days]').forEach((el) => {
      const orig = el.getAttribute('data-ftc-orig-text');
      if (!orig) return;
      const hrsSpan = el.querySelector('span');
      const textNode = [...el.childNodes].find(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== ''
      );
      if (textNode) textNode.textContent = orig;
      if (hrsSpan) hrsSpan.textContent = 'hrs';
      el.removeAttribute('data-ftc-days');
      el.removeAttribute('data-ftc-orig-text');
    });

    // Balance cards — featured value
    document.querySelectorAll('.c-featured-content .value[data-ftc-days]').forEach((el) => {
      const orig = el.getAttribute('data-ftc-orig-text');
      if (!orig) return;
      const smallEl = el.querySelector('small.c-balance-type-text-custom-size');
      const textNode = [...el.childNodes].find(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== ''
      );
      if (textNode) textNode.textContent = orig;
      if (smallEl) smallEl.textContent = 'hours';
      el.removeAttribute('data-ftc-days');
      el.removeAttribute('data-ftc-orig-text');
    });

    // Balance cards — detail list items
    document.querySelectorAll('.text-list-item--line .data b[data-ftc-days]').forEach((b) => {
      const orig = b.getAttribute('data-ftc-orig');
      if (orig) b.textContent = orig;
      b.removeAttribute('data-ftc-days');
      b.removeAttribute('data-ftc-orig');
    });

    // Usuń markery z kart żeby pozwolić na ponowną konwersję przy przełączeniu
    document.querySelectorAll('.c-card[data-ftc-days]').forEach((card) => {
      card.removeAttribute('data-ftc-days');
    });

    return true;
  }

  // ─── Detekcja strony i odświeżanie ───────────────────────────────────────────

  function isTimesheetPage() {
    return TIMESHEET_HASH_PATTERNS.some((p) => window.location.hash.includes(p));
  }

  function tryCalculateAndShow() {
    if (!isTimesheetPage()) return false;
    const data = calculate();
    if (data) { injectBanner(data); return true; }
    return false;
  }

  function startPolling() {
    clearInterval(pollTimer);
    let attempts = 0;
    pollTimer = setInterval(() => {
      attempts++;
      const done = isVacationPage()
        ? convertVacationBalancesToDays()
        : tryCalculateAndShow();
      if (done || attempts >= POLL_MAX_ATTEMPTS) {
        clearInterval(pollTimer);
      }
    }, POLL_INTERVAL_MS);
  }

  function setupMutationObserver() {
    if (mutationObs) mutationObs.disconnect();
    mutationObs = new MutationObserver((mutations) => {
      if (!isTimesheetPage()) return;
      const relevant = mutations.some((mut) =>
        [...mut.addedNodes].some((node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node.matches?.('tr[data-group-date]') ||
           node.querySelector?.('tr[data-group-date]') ||
           node.querySelector?.('.c-timesheet-header__date-carousel-title') ||
           node.matches?.('.c-accrual-balances__value') ||
           node.querySelector?.('.c-accrual-balances__value'))
        )
      );
      if (relevant) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (isVacationPage()) convertVacationBalancesToDays();
          else tryCalculateAndShow();
        }, 400);
      }
    });
    mutationObs.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Komunikacja z popup ──────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'getFlexData') {
      const data = calculate();
      sendResponse(data || { error: 'Timesheet nie jest widoczny na tej stronie.' });
    }

    if (msg.action === 'settingsUpdated') {
      if (msg.hoursPerDay) CFG.hoursPerDay = msg.hoursPerDay;
      if (msg.manualNorm !== undefined) CFG.manualNorm = msg.manualNorm;
      if (msg.sickLeaveDays !== undefined) CFG.sickLeaveDays = msg.sickLeaveDays;
      if (msg.vacationInDays !== undefined) CFG.vacationInDays = msg.vacationInDays;
      if (isVacationPage()) convertVacationBalancesToDays();
      tryCalculateAndShow();
    }

    return true; // async response
  });

  // ─── Inicjalizacja ────────────────────────────────────────────────────────────

  async function init() {
    // Wczytaj ustawienia z chrome.storage
    try {
      const stored = await chrome.storage.local.get(['hoursPerDay', 'manualNorm', 'sickLeaveDays', 'vacationInDays']);
      if (stored.hoursPerDay) CFG.hoursPerDay = stored.hoursPerDay;
      if (stored.manualNorm  !== undefined) CFG.manualNorm  = stored.manualNorm;
      if (stored.sickLeaveDays !== undefined) CFG.sickLeaveDays = stored.sickLeaveDays;
      if (stored.vacationInDays !== undefined) CFG.vacationInDays = stored.vacationInDays;
    } catch (_) {}

    if (isTimesheetPage() || isVacationPage()) startPolling();
    setupMutationObserver();
  }

  window.addEventListener('hashchange', () => {
    document.getElementById(BANNER_ID)?.remove();
    clearInterval(pollTimer);
    if (isTimesheetPage() || isVacationPage()) startPolling();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
