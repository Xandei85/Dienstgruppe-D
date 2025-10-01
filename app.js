// Schichtplan Polizei – classic stable version with monthly remarks and code palette
// This script builds the monthly shift grid, handles painting codes,
// saving/loading data via Supabase (via supabaseClient.js), and supports
// undo/redo as well as keyboard shortcuts. Daily remark functionality and
// service worker caching have been removed for stability.

const NAMES = window.APP_CONFIG.NAMES;
// Additional names for a separate extra planning table
const EXTRA_NAMES = ["Praktikant","Bullen Kate"];
const YEAR_START = window.APP_CONFIG.YEAR_START;
const YEAR_END = window.APP_CONFIG.YEAR_END;

// German month and weekday names
const MONTHS_DE = [
  'Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'
];
const WD = ['Mo','Di','Mi','Do','Fr','Sa','So'];

// School holiday ranges (Bavaria 2026) used to highlight holidays in the grid
const schoolRanges = [
  [new Date(2026,0,1), new Date(2026,0,5)],
  [new Date(2026,1,16), new Date(2026,1,20)],
  [new Date(2026,2,30), new Date(2026,3,10)],
  [new Date(2026,4,26), new Date(2026,5,5)],
  [new Date(2026,7,3), new Date(2026,8,14)],
  [new Date(2026,10,2), new Date(2026,10,6)],
  [new Date(2026,10,18), new Date(2026,10,18)]
];

function inHolidays(d) {
  return schoolRanges.some(([a,b]) => d >= a && d <= b);
}

// Determine if a day should be pre-painted yellow based on the start pattern
function isWorkday(d) {
  const s = (window.APP_CONFIG && window.APP_CONFIG.START_PATTERN_DATE) || '2026-01-02';
  const sh = (window.APP_CONFIG && (window.APP_CONFIG.PATTERN_SHIFT|0)) || 0;
  const [sy, sm, sd] = s.split('-').map(n => parseInt(n,10));
  const startUTC = Date.UTC(sy, sm-1, sd);
  const curUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  if(curUTC < startUTC) return false;
  const delta = Math.floor((curUTC - startUTC)/86400000);
  const mod = (delta + sh) % 4;
  return mod === 0 || mod === 1;
}

// DOM references
const monthTitle = document.getElementById('monthTitle');
const gridEl = document.getElementById('grid');
const gridExtraEl = document.getElementById('gridExtra');
const monthSelect = document.getElementById('monthSelect');
const yearSelect = document.getElementById('yearSelect');
const prevBtn = document.getElementById('prevMonth');
const nextBtn = document.getElementById('nextMonth');
const remarksTA = document.getElementById('monthlyRemarks');
const saveRemarksBtn = document.getElementById('saveRemarks');
const toastEl = document.getElementById('toast');
const meSelect = document.getElementById('meSelect');

// Populate user names in the dropdown
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

// Application state
let curYear = YEAR_START;
let curMonth = 0;
let selectedCode = null;
let isPainting = false;

// Undo/redo stacks
const undoStack = [];
const redoStack = [];

function pushUndo(entry) {
  undoStack.push(entry);
  // Limit the stack to 500 entries
  if(undoStack.length > 500) undoStack.shift();
  // Clear redo stack on new action
  redoStack.length = 0;
}

function applyCellState(day, name, value) {
  const td = gridEl.querySelector(`.editable[data-name="${name}"][data-day="${day}"]`);
  if(!td) return;
  td.textContent = value || '';
  td.classList.remove('code-U','code-AA','code-AZA','code-AZA6','code-AZA12','code-GV','code-LG','code-PE');
  if(value === 'U') td.classList.add('code-U');
  if(value === 'AA') td.classList.add('code-AA');
  if(value === 'AZA') td.classList.add('code-AZA');
  if(value === 'AZA6') td.classList.add('code-AZA6');
  if(value === 'AZA12') td.classList.add('code-AZA12');
  if(value === 'GV') td.classList.add('code-GV');
  if(value === 'LG') td.classList.add('code-LG');
  if(value === 'PE') td.classList.add('code-PE');
}

// Keyboard shortcuts mapping
const CODE_HOTKEYS = {
  'u': 'U',
  'a': 'AA',
  'z': 'AZA',
  'g': 'GV',
  'l': 'LG',
  'p': 'PE',
  '6': 'AZA6',
  '2': 'AZA12',
  'w': 'W2Y',
  'shift+w': 'Y2W',
  'backspace': 'X',
  'b': 'BEER',
  'p': 'PARTY'
};

function normKey(ev) {
  const k = ev.key.toLowerCase();
  return (ev.shiftKey && k !== 'shift') ? `shift+${k}` : k;
}

// Toast helper
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1400);
}

// Keydown handling for undo/redo and shortcuts
document.addEventListener('keydown', ev => {
  const key = ev.key.toLowerCase();
  // Avoid intercepting key shortcuts when typing in inputs or textareas
  const active = document.activeElement;
  const tag = active && active.tagName ? active.tagName.toLowerCase() : '';
  if(tag === 'input' || tag === 'textarea' || tag === 'select') {
    return;
  }
  // Undo (Ctrl+Z)
  if(ev.ctrlKey && key === 'z') {
    ev.preventDefault();
    const act = undoStack.pop();
    if(!act) return;
    redoStack.push(act);
    applyCellState(act.day, act.name, act.prev);
    saveCell({year: curYear, month: curMonth+1, day: act.day, name: act.name, value: act.prev}).catch(() => {});
    return;
  }
  // Redo (Ctrl+Y)
  if(ev.ctrlKey && key === 'y') {
    ev.preventDefault();
    const act = redoStack.pop();
    if(!act) return;
    undoStack.push(act);
    applyCellState(act.day, act.name, act.next);
    saveCell({year: curYear, month: curMonth+1, day: act.day, name: act.name, value: act.next}).catch(() => {});
    return;
  }
  // Shortcuts for codes
  const nk = normKey(ev);
  const code = CODE_HOTKEYS[nk];
  if(!code) return;
  ev.preventDefault();
  // highlight active button
  document.querySelectorAll('.legend-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.legend-btn[data-code="${code}"]`);
  if(btn) btn.classList.add('active');
  selectedCode = code;
  toast(`Modus: ${code} (nur Zeile: ${meSelect.value})`);
});

// Main render function: builds the table for the current month
function render() {
  // Clear monthly remarks until loaded
  remarksTA.value = '';
  selectedCode = null;
  document.querySelectorAll('.legend-btn').forEach(b => b.classList.remove('active'));
  monthTitle.textContent = `${MONTHS_DE[curMonth]} ${curYear}`;
  const days = new Date(curYear, curMonth+1, 0).getDate();
  let html = '<table><thead><tr>';
  html += '<th class="name">Name</th>';
  for(let d=1; d<=days; d++) {
    const dt = new Date(curYear, curMonth, d);
    const wd = dt.getDay();
    const wdIdx = (wd + 6) % 7;
    const isSa = wdIdx === 5;
    const isSo = wdIdx === 6;
    const dayClasses = [];
    if(inHolidays(dt)) dayClasses.push('ferienday');
    html += `<th class="${dayClasses.join(' ')}"><div class="daynum">${d}</div><div class="weekday ${isSa?'sat':isSo?'sun':''}">${WD[wdIdx]}</div></th>`;
  }
  html += '</tr></thead><tbody>';
  // One row per name
  NAMES.forEach(name => {
    html += `<tr><td class="name">${name}</td>`;
    for(let d=1; d<=days; d++) {
      const dt = new Date(curYear, curMonth, d);
      const cls = isWorkday(dt) ? 'yellow' : '';
      html += `<td class="editable ${cls}" contenteditable data-name="${name}" data-day="${d}"></td>`;
    }
    html += '</tr>';
  });
  html += '</tbody></table>';
  gridEl.innerHTML = html;
  // Render extra planning table with additional names
  if(gridExtraEl) {
    let html2 = '<table><thead><tr>';
    html2 += '<th class="name">Name</th>';
    for(let d=1; d<=days; d++) {
      const dt2 = new Date(curYear, curMonth, d);
      const wd2 = dt2.getDay();
      const wdIdx2 = (wd2 + 6) % 7;
      const isSa2 = wdIdx2 === 5;
      const isSo2 = wdIdx2 === 6;
      const dayClasses2 = [];
      if(inHolidays(dt2)) dayClasses2.push('ferienday');
      html2 += `<th class="${dayClasses2.join(' ')}"><div class="daynum">${d}</div><div class="weekday ${isSa2?'sat':isSo2?'sun':''}">${WD[wdIdx2]}</div></th>`;
    }
    html2 += '</tr></thead><tbody>';
    EXTRA_NAMES.forEach(name => {
      html2 += `<tr><td class="name">${name}</td>`;
      for(let d=1; d<=days; d++) {
        const dt2 = new Date(curYear, curMonth, d);
        const cls2 = isWorkday(dt2) ? 'yellow' : '';
        html2 += `<td class="editable ${cls2}" contenteditable data-name="${name}" data-day="${d}"></td>`;
      }
      html2 += '</tr>';
    });
    html2 += '</tbody></table>';
    gridExtraEl.innerHTML = html2;
  }
  // Load data from Supabase/localStorage
  Promise.all([
    loadMonth({year: curYear, month: curMonth+1}),
    loadRemarks({year: curYear, month: curMonth+1}),
    loadOverrides({year: curYear, month: curMonth+1})
  ]).then(([rows, monthRemark, overrides]) => {
    // Fill cells with saved values
    rows.forEach(r => {
      const sel = `.editable[data-name="${r.name}"][data-day="${r.day}"]`;
      // Update main grid cell
      const cell = gridEl.querySelector(sel);
      if(cell) {
        cell.textContent = r.value || '';
        cell.classList.remove('code-U','code-AA','code-AZA','code-AZA6','code-AZA12','code-GV','code-LG','code-PE');
        if(r.value === 'U') cell.classList.add('code-U');
        if(r.value === 'AA') cell.classList.add('code-AA');
        if(r.value === 'AZA') cell.classList.add('code-AZA');
        if(r.value === 'AZA6') cell.classList.add('code-AZA6');
        if(r.value === 'AZA12') cell.classList.add('code-AZA12');
        if(r.value === 'GV') cell.classList.add('code-GV');
        if(r.value === 'LG') cell.classList.add('code-LG');
        if(r.value === 'PE') cell.classList.add('code-PE');
      }
      // Update extra grid cell
      if(gridExtraEl) {
        const cell2 = gridExtraEl.querySelector(sel);
        if(cell2) {
          cell2.textContent = r.value || '';
          cell2.classList.remove('code-U','code-AA','code-AZA','code-AZA6','code-AZA12','code-GV','code-LG','code-PE');
          if(r.value === 'U') cell2.classList.add('code-U');
          if(r.value === 'AA') cell2.classList.add('code-AA');
          if(r.value === 'AZA') cell2.classList.add('code-AZA');
          if(r.value === 'AZA6') cell2.classList.add('code-AZA6');
          if(r.value === 'AZA12') cell2.classList.add('code-AZA12');
          if(r.value === 'GV') cell2.classList.add('code-GV');
          if(r.value === 'LG') cell2.classList.add('code-LG');
          if(r.value === 'PE') cell2.classList.add('code-PE');
        }
      }
    });
    // Monthly remark
    if(typeof monthRemark === 'string') remarksTA.value = monthRemark;
    // Apply yellow overrides
    (overrides || []).forEach(o => {
      const sel = `.editable[data-name="${o.name}"][data-day="${o.day}"]`;
      const cell = gridEl.querySelector(sel);
      if(cell) {
        cell.classList.remove('force-yellow','no-yellow');
        if(o.yellow_override === 'on') cell.classList.add('force-yellow');
        if(o.yellow_override === 'off') cell.classList.add('no-yellow');
      }
      if(gridExtraEl) {
        const cell2 = gridExtraEl.querySelector(sel);
        if(cell2) {
          cell2.classList.remove('force-yellow','no-yellow');
          if(o.yellow_override === 'on') cell2.classList.add('force-yellow');
          if(o.yellow_override === 'off') cell2.classList.add('no-yellow');
        }
      }
    });
  }).catch(() => {});
}

// Save monthly remarks
function trySaveCurrentRemarks() {
  const txt = remarksTA.value;
  return saveRemarks({year: curYear, month: curMonth+1, remarks: txt})
    .then(() => true)
    .catch(() => false);
}
saveRemarksBtn.addEventListener('click', () => {
  trySaveCurrentRemarks()
    .then(() => toast('Bemerkungen gespeichert'))
    .catch(() => toast('Fehler beim Speichern'));
});

// Paint a cell with the selected code and persist the change
function paintCell(td, code) {
  if(td.dataset.name !== myName) {
    toast('Nur in deiner Zeile eintragbar');
    return;
  }
  // Record undo information
  const before = {
    day: +td.dataset.day,
    name: td.dataset.name,
    prev: td.textContent.trim(),
    next: (code === 'BEER' || code === 'PARTY' || code === 'X') ? '' : (code === 'BEER' ? '🍺' : (code === 'PARTY' ? '🎉' : code))
  };
  pushUndo(before);
  // Yellow overrides
  if(code === 'W2Y') {
    td.classList.remove('no-yellow');
    td.classList.add('force-yellow');
    const day = +td.dataset.day;
    saveOverride({year: curYear, month: curMonth+1, day, name: myName, yellow_override: 'on'})
      .then(() => toast('Gelb erzwungen'))
      .catch(() => toast('Fehler'));
    return;
  }
  if(code === 'Y2W') {
    td.classList.remove('force-yellow');
    td.classList.add('no-yellow');
    const day = +td.dataset.day;
    saveOverride({year: curYear, month: curMonth+1, day, name: myName, yellow_override: 'off'})
      .then(() => toast('Gelb entfernt'))
      .catch(() => toast('Fehler'));
    return;
  }
  // Set text and classes for regular codes and clear
  if(code === 'PARTY') {
    td.textContent = '🎉';
  } else if(code === 'BEER') {
    td.textContent = '🍺';
  } else if(code === 'X') {
    td.textContent = '';
  } else {
    td.textContent = code;
  }
  td.classList.remove('code-U','code-AA','code-AZA','code-AZA6','code-AZA12','code-GV','code-LG','code-PE');
  if(code === 'U') td.classList.add('code-U');
  if(code === 'AA') td.classList.add('code-AA');
  if(code === 'AZA') td.classList.add('code-AZA');
  if(code === 'AZA6') td.classList.add('code-AZA6');
  if(code === 'AZA12') td.classList.add('code-AZA12');
  if(code === 'GV') td.classList.add('code-GV');
  if(code === 'LG') td.classList.add('code-LG');
  if(code === 'PE') td.classList.add('code-PE');
  const valueToSave = (code === 'BEER' || code === 'PARTY' || code === 'X') ? '' : code;
  const day = +td.dataset.day;
  saveCell({year: curYear, month: curMonth+1, day, name: myName, value: valueToSave})
    .catch(() => toast('Fehler beim Speichern'));
}

// Painting interactions
gridEl.addEventListener('click', e => {
  const td = e.target.closest('td.editable');
  if(!td) return;
  if(selectedCode) {
    paintCell(td, selectedCode);
    return;
  }
});

// Apply painting interactions to the extra grid as well
if(gridExtraEl) {
  gridExtraEl.addEventListener('click', e => {
    const td = e.target.closest('td.editable');
    if(!td) return;
    if(selectedCode) {
      paintCell(td, selectedCode);
      return;
    }
  });
  gridExtraEl.addEventListener('mousedown', e => {
    const td = e.target.closest('td.editable');
    if(!td || !selectedCode) return;
    isPainting = true;
    td.classList.add('painting');
    paintCell(td, selectedCode);
  });
  gridExtraEl.addEventListener('mouseover', e => {
    if(!isPainting || !selectedCode) return;
    const td = e.target.closest('td.editable');
    if(!td) return;
    td.classList.add('painting');
    paintCell(td, selectedCode);
  });
}
gridEl.addEventListener('mousedown', e => {
  const td = e.target.closest('td.editable');
  if(!td || !selectedCode) return;
  isPainting = true;
  td.classList.add('painting');
  paintCell(td, selectedCode);
});
gridEl.addEventListener('mouseover', e => {
  if(!isPainting || !selectedCode) return;
  const td = e.target.closest('td.editable');
  if(!td) return;
  td.classList.add('painting');
  paintCell(td, selectedCode);
});
document.addEventListener('mouseup', () => {
  if(isPainting) {
    gridEl.querySelectorAll('td.painting').forEach(td => td.classList.remove('painting'));
    isPainting = false;
  }
});

// Legend buttons
document.querySelectorAll('.legend-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if(btn.classList.contains('active')) {
      btn.classList.remove('active');
      selectedCode = null;
      return;
    }
    document.querySelectorAll('.legend-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCode = btn.dataset.code;
    toast(`Modus: ${selectedCode} (nur Zeile: ${meSelect.value})`);
  });
});

function navToMonth(newYear, newMonth) {
  trySaveCurrentRemarks().finally(() => {
    curYear = newYear;
    curMonth = newMonth;
    render();
  });
}

// Month navigation buttons
prevBtn.onclick = () => {
  if(curMonth === 0) {
    navToMonth(curYear - 1, 11);
  } else {
    navToMonth(curYear, curMonth - 1);
  }
};
nextBtn.onclick = () => {
  if(curMonth === 11) {
    navToMonth(curYear + 1, 0);
  } else {
    navToMonth(curYear, curMonth + 1);
  }
};

// Dropdown change handlers
monthSelect.onchange = () => {
  navToMonth(curYear, +monthSelect.value);
};
yearSelect.onchange = () => {
  navToMonth(+yearSelect.value, curMonth);
};

// Populate year and month selects
for(let y = YEAR_START; y <= YEAR_END; y++) {
  const opt = document.createElement('option');
  opt.value = y;
  opt.textContent = y;
  yearSelect.appendChild(opt);
}
for(let m = 0; m < 12; m++) {
  const opt = document.createElement('option');
  opt.value = m;
  opt.textContent = MONTHS_DE[m];
  monthSelect.appendChild(opt);
}
yearSelect.value = curYear;
monthSelect.value = curMonth;

// Disable service worker caching to ensure fresh loads
if('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => {
    rs.forEach(r => r.unregister());
  }).catch(() => {});
}

// Initial render
render();