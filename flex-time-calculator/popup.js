/**
 * Flex Time Calculator – popup script
 *
 * Komunikuje się z content.js poprzez chrome.tabs.sendMessage,
 * a ustawienia przechowuje w chrome.storage.local.
 */

const HOURS_PER_DAY_DEFAULT = 8;

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
  const stored = await chrome.storage.local.get(['hoursPerDay', 'manualNorm']);
  const hoursPerDay = stored.hoursPerDay ?? HOURS_PER_DAY_DEFAULT;
  const manualNorm  = stored.manualNorm  ?? 0;

  document.getElementById('hours-per-day').value = hoursPerDay;
  document.getElementById('manual-norm').value   = manualNorm;

  // Pobierz dane z aktywnej karty (content.js)
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {}

  if (!tab) {
    showError('Nie można uzyskać dostępu do aktywnej karty.');
    return;
  }

  // Sprawdź czy strona to SaaSHR
  if (!tab.url?.includes('saashr.com')) {
    showError('Otwórz timesheet na stronie *.saashr.com, aby zobaczyć dane.');
    return;
  }

  let data;
  try {
    data = await chrome.tabs.sendMessage(tab.id, { action: 'getFlexData' });
  } catch (e) {
    // Content script jeszcze nie odpowiada — może strona jest na innej podstronie
    showError('Nie znaleziono danych timesheeta.\nOtwórz zakładkę „Timesheet" w UKG/SaaSHR i spróbuj ponownie.');
    return;
  }

  if (!data || data.error) {
    showError(data?.error || 'Brak danych. Upewnij się, że timesheet jest widoczny.');
    return;
  }

  renderData(data, hoursPerDay, manualNorm);
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

function renderData(data, hoursPerDay, manualNorm) {
  hide('loading');
  show('main-content');

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
    ? `\n🔒 Overtime Payout wykluczone: −${formatMinutes(data.overtimePayoutMinutes)}h`
    : '';
  infoBox.textContent = `📅 Okres: ${periodText}${otInfo}`;
}

// ─── Zapis ustawień ───────────────────────────────────────────────────────────

document.getElementById('save-btn').addEventListener('click', async () => {
  const hoursPerDay = parseFloat(document.getElementById('hours-per-day').value) || HOURS_PER_DAY_DEFAULT;
  const manualNorm  = parseFloat(document.getElementById('manual-norm').value)  || 0;

  await chrome.storage.local.set({ hoursPerDay, manualNorm });

  // Poinformuj content.js o nowych ustawieniach i odśwież widok
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'settingsUpdated',
        hoursPerDay,
        manualNorm,
      });
    } catch (_) {}
  }

  const btn = document.getElementById('save-btn');
  btn.textContent = '✅ Zapisano!';
  setTimeout(() => { btn.textContent = '💾 Zapisz ustawienia'; }, 1500);
});

// ─── Start ────────────────────────────────────────────────────────────────────
init();
