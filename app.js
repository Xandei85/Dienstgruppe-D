/*
 * Main application script for the Schichtplan Polizei PWA.
 *
 * This script renders a monthly shift plan, highlights work days according
 * to a two‑day on/two‑day off pattern starting at a configurable date,
 * and allows users to annotate cells with various codes (U, AA, AZA, GV,
 * LG, PE) or clear them (X).  Entries and remarks are persisted to
 * Supabase if configured via `config.js`; otherwise data are stored
 * locally in the browser.
 */

// Pull configuration from the global object defined in config.js
const NAMES = window.APP_CONFIG.NAMES;
const YEAR_START = window.APP_CONFIG.YEAR_START;
const YEAR_END = window.APP_CONFIG.YEAR_END;
// German month names and weekday abbreviations
const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Bavarian school holiday ranges for 2026; adjust as needed
const schoolRanges = [
  [new Date(2026,0,1), new Date(2026,0,5)],
  [new Date(2026,1,16), new Date(2026,1,20)],
  [new Date(2026,2,30), new Date(2026,3,10)],
  [new Date(2026,4,26), new Date(2026,5,5)],
  [new Date(2026,7,3), new Date(2026,8,14)],
  [new Date(2026,10,2), new Date(2026,10,6)],
  [new Date(2026,10,18), new Date(2026,10,18)]
];

// Determine if a date lies within one of the school holiday ranges
function inHolidays(d) {
  return schoolRanges.some(([a, b]) => d >= a && d <= b);
}

// Determine if a given date is a workday based on a 2‑on/2‑off pattern
function isWorkday(d) {
  const s = (window.APP_CONFIG && window.APP_CONFIG.START_PATTERN_DATE) || '2026-01-02';
  const sh = (window.APP_CONFIG && (window.APP_CONFIG.PATTERN_SHIFT|0)) || 0;
  const [sy, sm, sd] = s.split('-').map(n => parseInt(n, 10));
  const startUTC = Date.UTC(sy, sm - 1, sd);
  const curUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  if (curUTC < startUTC) return false;
  const delta = Math.floor((curUTC - startUTC) / 86400000);
  const mod = (delta + sh) % 4;
  return mod === 0 || mod === 1;
}

// Grab references to DOM elements used throughout the app
const monthTitle = document.getElementById('monthTitle');
const gridEl = document.getElementById('grid');
const monthSelect = document.getElementById('monthSelect');
const yearSelect = document.getElementById('yearSelect');
const prevBtn = document.getElementById('prevMonth');
const nextBtn = document.getElementById('nextMonth');
const remarksTA = document.getElementById('monthlyRemarks');
const saveRemarksBtn = document.getElementById('saveRemarks');
const toastEl = document.getElementById('toast');
const meSelect = document.getElementById('meSelect');

// Populate name selection dropdown
NAMES.forEach(n => {
  const opt = document.createElement('option');
  opt.value = n;
  opt.textContent = n;
  meSelect.appendChild(opt);
});
let myName = NAMES[0];
meSelect.value = myName;
meSelect.addEventListener('change', () => {
  myName = meSelect.value;
});

// Track current month and year
let curYear = YEAR_START;
let curMonth = 0;
// Track selected code and painting state
let selectedCode = null;
let isPainting = false;

// Toast helper to show messages briefly
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1200);
}

// Render the calendar for the current month/year
function render() {
  // Reset selection
  selectedCode = null;
  document.querySelectorAll('.legend-btn').forEach(b => b.classList.remove('active'));
  monthTitle.textContent = `${MONTHS_DE[curMonth]} ${curYear}`;
  const days = new Date(curYear, curMonth + 1, 0).getDate();
  let html = '<table><thead><tr>';
  html += '<th class="name">Name</th>';
  for (let d = 1; d <= days; d++) {
    const dt = new Date(curYear, curMonth, d);
    const wd = dt.getDay();
    const wdIdx = (wd + 6) % 7; // convert JS Sunday=0 to Monday index
    const isSa = wdIdx === 5;
    const isSo = wdIdx === 6;
    const dayClasses = [];
    if (inHolidays(dt)) dayClasses.push('ferienday');
    html += `<th class="${dayClasses.join(' ')}"><div class="daynum">${d}</div><div class="weekday ${isSa ? 'sat' : isSo ? 'sun' : ''}">${WD[wdIdx]}</div></th>`;
  }
  html += '</tr></thead><tbody>';
  // Row for day remarks
  html += '<tr class="day-remarks"><td class="name">Bemerkungen (Tag)</td>';
  for (let d = 1; d <= days; d++) {
    html += `<td class="day-remark-cell" data-day="${d}"></td>`;
  }
  html += '</tr>';
  // Rows for each name
  NAMES.forEach(name => {
    html += `<tr><td class="name">${name}</td>`;
    for (let d = 1; d <= days; d++) {
      const dt = new Date(curYear, curMonth, d);
      const cls = isWorkday(dt) ? 'yellow' : '';
      html += `<td class="editable ${cls}" contenteditable data-name="${name}" data-day="${d}"></td>`;
    }
    html += '</tr>';
  });
  html += '</tbody></table>';
  gridEl.innerHTML = html;
  // Load saved entries for this month
  loadMonth({ year: curYear, month: curMonth + 1 }).then(rows => {
    rows.forEach(r => {
      const sel = `.editable[data-name="${r.name}"][data-day="${r.day}"]`;
      const cell = gridEl.querySelector(sel);
      if (cell) {
        cell.textContent = r.value || "";
        // Remove all code classes before applying new one
        cell.classList.remove('code-U','code-AA','code-AZA','code-GV','code-LG','code-PE');
        if (r.value === 'U') cell.classList.add('code-U');
        if (r.value === 'AA') cell.classList.add('code-AA');
        if (r.value === 'AZA') cell.classList.add('code-AZA');
        if (r.value === 'GV') cell.classList.add('code-GV');
        if (r.value === 'LG') cell.classList.add('code-LG');
        if (r.value === 'PE') cell.classList.add('code-PE');
      }
    });
  }).catch(() => {});
  // Load monthly remarks
  loadRemarks({ year: curYear, month: curMonth + 1 }).then(text => {
    if (typeof text === 'string') remarksTA.value = text;
  }).catch(() => {});
  // Load per-day remarks
  loadDayRemarks({ year: curYear, month: curMonth + 1 }).then(map => {
    for (const [day, text] of Object.entries(map || {})) {
      const cell = gridEl.querySelector(`.day-remark-cell[data-day="${day}"]`);
      if (cell) cell.textContent = text || '';
    }
  }).catch(() => {});
}

// Handler to edit day remarks by clicking day headings
gridEl.addEventListener('click', e => {
  const th = e.target.closest('th');
  if (!th) return;
  const dayDiv = th.querySelector('.daynum');
  if (!dayDiv) return;
  const idx = Array.from(th.parentElement.children).indexOf(th);
  const day = idx;
  if (!day) return;
  const current = (gridEl.querySelector(`.day-remark-cell[data-day="${day}"]`)?.textContent || '').trim();
  const text = prompt(`Bemerkung für Tag ${day}:`, current);
  if (text === null) return;
  const cell = gridEl.querySelector(`.day-remark-cell[data-day="${day}"]`);
  if (cell) cell.textContent = text;
  saveDayRemark({ year: curYear, month: curMonth + 1, day, text }).catch(console.warn);
});

// Handle clicks on editable cells to apply selected codes
gridEl.addEventListener('click', e => {
  const td = e.target.closest('td.editable');
  if (!td) return;
  if (!selectedCode) return;
  if (td.dataset.name !== myName) {
    toast('Nur in deiner Zeile eintragbar');
    return;
  }
  // Normalize ATZA to AZA if needed (legacy support)
  let code = selectedCode;
  if (code === 'ATZA') code = 'AZA';
  td.textContent = (code === 'X') ? '' : code;
  td.classList.remove('code-U','code-AA','code-AZA','code-GV','code-LG','code-PE');
  if (code === 'U') td.classList.add('code-U');
  if (code === 'AA') td.classList.add('code-AA');
  if (code === 'AZA') td.classList.add('code-AZA');
  if (code === 'GV') td.classList.add('code-GV');
  if (code === 'LG') td.classList.add('code-LG');
  if (code === 'PE') td.classList.add('code-PE');
  const day = +td.dataset.day;
  saveCell({ year: curYear, month: curMonth + 1, day, name: myName, value: (code === 'X') ? '' : code }).catch(console.warn);
});

// Enable painting across multiple cells by dragging
gridEl.addEventListener('mousedown', e => {
  const td = e.target.closest('td.editable');
  if (!td || !selectedCode) return;
  if (td.dataset.name !== myName) {
    toast('Nur in deiner Zeile eintragbar');
    return;
  }
  isPainting = true;
  td.classList.add('painting');
  let code = selectedCode;
  if (code === 'ATZA') code = 'AZA';
  td.textContent = (code === 'X') ? '' : code;
  td.classList.remove('code-U','code-AA','code-AZA','code-GV','code-LG','code-PE');
  if (code === 'U') td.classList.add('code-U');
  if (code === 'AA') td.classList.add('code-AA');
  if (code === 'AZA') td.classList.add('code-AZA');
  if (code === 'GV') td.classList.add('code-GV');
  if (code === 'LG') td.classList.add('code-LG');
  if (code === 'PE') td.classList.add('code-PE');
  const day = +td.dataset.day;
  saveCell({ year: curYear, month: curMonth + 1, day, name: myName, value: (code === 'X') ? '' : code }).catch(console.warn);
});

gridEl.addEventListener('mouseover', e => {
  if (!isPainting || !selectedCode) return;
  const td = e.target.closest('td.editable');
  if (!td || td.dataset.name !== myName) return;
  td.classList.add('painting');
  let code = selectedCode;
  if (code === 'ATZA') code = 'AZA';
  td.textContent = (code === 'X') ? '' : code;
  td.classList.remove('code-U','code-AA','code-AZA','code-GV','code-LG','code-PE');
  if (code === 'U') td.classList.add('code-U');
  if (code === 'AA') td.classList.add('code-AA');
  if (code === 'AZA') td.classList.add('code-AZA');
  if (code === 'GV') td.classList.add('code-GV');
  if (code === 'LG') td.classList.add('code-LG');
  if (code === 'PE') td.classList.add('code-PE');
  const day = +td.dataset.day;
  saveCell({ year: curYear, month: curMonth + 1, day, name: myName, value: (code === 'X') ? '' : code }).catch(console.warn);
});

// Clear painting state on mouseup
document.addEventListener('mouseup', () => {
  if (isPainting) {
    gridEl.querySelectorAll('td.painting').forEach(td => td.classList.remove('painting'));
    isPainting = false;
  }
});

// Legend button click handling
document.querySelectorAll('.legend-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Toggle off if already active
    if (btn.classList.contains('active')) {
      btn.classList.remove('active');
      selectedCode = null;
      return;
    }
    // Deactivate all and activate the clicked button
    document.querySelectorAll('.legend-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCode = btn.dataset.code;
    toast(`Modus: ${selectedCode} (nur Zeile: ${myName})`);
  });
});

// Navigation buttons and selects
prevBtn.onclick = () => {
  if (curMonth === 0) {
    curMonth = 11;
    curYear--;
  } else {
    curMonth--;
  }
  render();
};
nextBtn.onclick = () => {
  if (curMonth === 11) {
    curMonth = 0;
    curYear++;
  } else {
    curMonth++;
  }
  render();
};
monthSelect.onchange = () => {
  curMonth = +monthSelect.value;
  render();
};
yearSelect.onchange = () => {
  curYear = +yearSelect.value;
  render();
};

// Populate year and month dropdowns
for (let y = YEAR_START; y <= YEAR_END; y++) {
  const opt = document.createElement('option');
  opt.value = y;
  opt.textContent = y;
  yearSelect.appendChild(opt);
}
for (let m = 0; m < 12; m++) {
  const opt = document.createElement('option');
  opt.value = m;
  opt.textContent = MONTHS_DE[m];
  monthSelect.appendChild(opt);
}
yearSelect.value = curYear;
monthSelect.value = curMonth;

// PWA installation prompt
let deferredPrompt = null;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  }
});

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// Initial render
render();