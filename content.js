/**
 * Flex Time Calculator – content script
 * Strona docelowa: *.saashr.com (UKG Pro / Kronos SaaS HR)
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
    hoursPerDay: 8,    // norma godzin dziennie
    manualNorm: 0,     // ręczna norma miesiąca (godziny); 0 = auto
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

    const elapsedWorkingDays   = countWorkingDays(period.start, effectiveToday);
    const fullMonthWorkingDays = countWorkingDays(period.start, period.end);

    // 4. Normy
    const normPerDay            = CFG.hoursPerDay * 60;
    const normElapsedMinutes    = elapsedWorkingDays * normPerDay;
    const normFullMonthMinutes  = CFG.manualNorm > 0
      ? Math.round(CFG.manualNorm * 60)
      : fullMonthWorkingDays * normPerDay;

    totalWorkedMinutes -= overtimePayoutMinutes;

    const balanceMinutes   = totalWorkedMinutes - normElapsedMinutes;
    const remainingMinutes = normFullMonthMinutes - totalWorkedMinutes;

    return {
      balanceMinutes,
      totalWorkedMinutes,
      normElapsedMinutes,
      normFullMonthMinutes,
      elapsedWorkingDays,
      fullMonthWorkingDays,
      remainingMinutes,
      overtimePayoutMinutes,   // godziny wykluczone z flex (informacyjnie)
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
    } = data;

    const isPositive = balanceMinutes >= 0;
    const normDone   = remainingMinutes <= 0;

    const otNote = overtimePayoutMinutes > 0
      ? `<span class="ftc-sep">│</span>
         <span class="ftc-ot" title="Godziny Overtime Payout wykluczone z kalkulacji flex">
           🔒 OT: −${formatMinutes(overtimePayoutMinutes)}h
         </span>`
      : '';

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
      <button class="ftc-close" title="Ukryj baner">✕</button>
    `;

    document.body.prepend(banner);

    banner.querySelector('.ftc-close').addEventListener('click', () => banner.remove());
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
      if (tryCalculateAndShow() || attempts >= POLL_MAX_ATTEMPTS) {
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
           node.querySelector?.('.c-timesheet-header__date-carousel-title'))
        )
      );
      if (relevant) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(tryCalculateAndShow, 400);
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
      tryCalculateAndShow();
    }

    return true; // async response
  });

  // ─── Inicjalizacja ────────────────────────────────────────────────────────────

  async function init() {
    // Wczytaj ustawienia z chrome.storage
    try {
      const stored = await chrome.storage.local.get(['hoursPerDay', 'manualNorm']);
      if (stored.hoursPerDay) CFG.hoursPerDay = stored.hoursPerDay;
      if (stored.manualNorm  !== undefined) CFG.manualNorm  = stored.manualNorm;
    } catch (_) {}

    if (isTimesheetPage()) startPolling();
    setupMutationObserver();
  }

  window.addEventListener('hashchange', () => {
    document.getElementById(BANNER_ID)?.remove();
    clearInterval(pollTimer);
    if (isTimesheetPage()) startPolling();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
