/**
 * Better UKG – popup script
 *
 * Komunikuje się z content.js poprzez chrome.tabs.sendMessage,
 * a ustawienia przechowuje w chrome.storage.local.
 */

// ─── Pomocnicze ──────────────────────────────────────────────────────────────

function formatMinutes(minutes) {
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatBalance(minutes) {
  return (minutes >= 0 ? '+' : '-') + formatMinutes(minutes);
}

function show(id) { document.getElementById(id).style.display = ''; }
function hide(id) { document.getElementById(id).style.display = 'none'; }

// ─── Główna logika popup ──────────────────────────────────────────────────────

async function init() {
  // Wczytaj ustawienia
  const stored = await chrome.storage.local.get(['manualNorm', 'vacationInDays', 'hhmmFormat']);
  const manualNorm      = stored.manualNorm     ?? 0;
  const vacationInDays  = stored.vacationInDays  ?? true;
  const hhmmFormat      = stored.hhmmFormat     ?? true;

  document.getElementById('manual-norm').value        = manualNorm;
  document.getElementById('vacation-in-days').checked = vacationInDays;
  document.getElementById('hhmm-format').checked      = hhmmFormat;

  // Pobierz dane z aktywnej karty (content.js)
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {}

  if (!tab) {
    showError('Nie można uzyskać dostępu do aktywnej karty.');
    return;
  }

  // Sprawdź czy strona to UKG Pro
  if (!tab.url?.includes('saashr.com')) {
    showError('Otwórz timesheet na stronie *.saashr.com, aby zobaczyć dane.');
    return;
  }

  let data;
  try {
    data = await chrome.tabs.sendMessage(tab.id, { action: 'getFlexData' });
  } catch (e) {
    // Content script jeszcze nie odpowiada — może strona jest na innej podstronie
    showError('Nie znaleziono danych timesheeta.\nOtwórz zakładkę „Timesheet" w UKG Pro i spróbuj ponownie.');
    return;
  }

  if (!data || data.error) {
    showError(data?.error || 'Brak danych. Upewnij się, że timesheet jest widoczny.');
    return;
  }

  renderData(data);
}

function showError(msg) {
  hide('loading');
  const box = document.getElementById('period-info');
  box.className = 'info-box error';
  box.textContent = msg;
  box.style.display = '';
  document.getElementById('main-content').style.display = 'block';
  // Ukryj sekcje, które nie mają sensu bez danych
  document.querySelector('.balance-panel').style.display = 'none';
  document.querySelector('.stats').style.display = 'none';
}

function renderData(data) {
  hide('loading');
  show('main-content');

  const correctionHours = data.effCorrectionHours ?? 0;

  const {
    balanceMinutes,
    totalWorkedMinutes,
    normElapsedMinutes,
    normFullMonthMinutes,
    elapsedWorkingDays,
    fullMonthWorkingDays,
    remainingMinutes,
    periodText,
  } = data;

  // Saldo
  const balEl = document.getElementById('balance-value');
  balEl.textContent = formatBalance(balanceMinutes);
  balEl.className = 'balance-value ' + (balanceMinutes >= 0 ? 'positive' : 'negative');

  document.getElementById('balance-sub').textContent =
    `${formatMinutes(totalWorkedMinutes)}h przepracowane − ${formatMinutes(normElapsedMinutes)}h norma (${elapsedWorkingDays} dni)`;

  // Statystyki
  document.getElementById('worked-hours').textContent  = formatMinutes(totalWorkedMinutes) + 'h';
  document.getElementById('norm-hours').textContent    = formatMinutes(normFullMonthMinutes) + 'h';
  document.getElementById('norm-days').textContent     = `${fullMonthWorkingDays} dni roboczych`;
  document.getElementById('elapsed-norm').textContent  = formatMinutes(normElapsedMinutes) + 'h';
  document.getElementById('elapsed-days').textContent  = `${elapsedWorkingDays} dni`;

  if (remainingMinutes <= 0) {
    document.getElementById('remaining-hours').textContent = formatBalance(-remainingMinutes);
    document.getElementById('remaining-hours').style.color = '#4ade80';
    document.getElementById('remaining-label').textContent = 'nadwyżki ✅';
  } else {
    document.getElementById('remaining-hours').textContent = formatMinutes(remainingMinutes) + 'h';
    document.getElementById('remaining-hours').style.color = '#fbbf24';
    document.getElementById('remaining-label').textContent = 'pozostało';
  }

  // Okres
  const infoBox = document.getElementById('period-info');
  infoBox.className = 'info-box';
  const otInfo = data.overtimePayoutMinutes > 0
    ? `\n🔒 Overtime Payout wykluczone: ${formatMinutes(data.overtimePayoutMinutes)}h`
    : '';
  const corrSign = correctionHours > 0 ? '+' : '';
  const corrInfo = correctionHours !== 0
    ? `\n🔧 Korekta (${data.monthKey || 'ten miesiąc'}): ${corrSign}${correctionHours}h (${corrSign}${formatMinutes(Math.round(correctionHours * 60))}h)`
    : '';
  const personInfo = (data.personScope === 'employee' && data.personName)
    ? `\n👤 ${data.personName}`
    : '';
  const etatInfo = data.hasPersonHours
    ? `\n🧑‍💼 Etat: ${data.effHoursPerDay}h/dzień (zapamiętany)`
    : '';
  infoBox.textContent = `📅 Okres: ${periodText}${personInfo}${etatInfo}${otInfo}${corrInfo}`;
}

// ─── Zapis ustawień ───────────────────────────────────────────────────────────

// Toggles działające natychmiast bez klikania "Zapisz"
document.getElementById('vacation-in-days').addEventListener('change', async (e) => {
  const vacationInDays = e.target.checked;
  await chrome.storage.local.set({ vacationInDays });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated', vacationInDays });
    } catch (_) {}
  }
});

document.getElementById('hhmm-format').addEventListener('change', async (e) => {
  const hhmmFormat = e.target.checked;
  await chrome.storage.local.set({ hhmmFormat });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated', hhmmFormat });
    } catch (_) {}
  }
});

document.getElementById('save-btn').addEventListener('click', async () => {
  const manualNorm      = parseFloat(document.getElementById('manual-norm').value)      || 0;
  const vacationInDays  = document.getElementById('vacation-in-days').checked;
  const hhmmFormat      = document.getElementById('hhmm-format').checked;

  await chrome.storage.local.set({ manualNorm, vacationInDays, hhmmFormat });

  // Poinformuj content.js o nowych ustawieniach i odśwież widok
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'settingsUpdated',
        manualNorm,
        vacationInDays,
        hhmmFormat,
      });
    } catch (_) {}
  }

  const btn = document.getElementById('save-btn');
  btn.textContent = '✅ Zapisano!';
  setTimeout(() => { btn.textContent = '💾 Zapisz ustawienia'; }, 1500);
});

// ─── Start ────────────────────────────────────────────────────────────────────
init();
