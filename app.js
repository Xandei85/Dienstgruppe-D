// Hauptskript für den Schichtplan (Single-Table + Mitarbeiter add/remove) – stabile Version

// Dieses Skript behält das bestehende Design bei (Gelb/Weiß‑Rhythmus, Ferien/Feiertagsfarben, Codes etc.),
// rendert aber nur noch eine Tabelle und ergänzt eine einfache Mitarbeiter‑Verwaltung.
//
// Funktionen:
//  - Laden der Namen aus Supabase (Tabelle `mitarbeiter`), fallback auf config + Default‑Namen.
//  - Hinzufügen eines Mitarbeiters (INSERT oder, falls Name existiert, Aktivieren via UPDATE).
//  - Entfernen eines Mitarbeiters (deaktivieren: Aktiv=false via UPDATE).
//  - Auswahl des Mitarbeiters über das bestehende „Ich bin“-Dropdown oder durch Klick auf den Namen in der Zeile.
//  - Rendern des Dienstplans wie gehabt, inklusive gelber/weißer Tage, Feiertage, Ferien und Codes.

document.addEventListener('DOMContentLoaded', () => {
  // Hilfsfunktion für DOM‑Elemente
  const $id = (id) => document.getElementById(id);
  // Zentrale Bereiche
  const gridMain = $id('gridMain');
  const gridExtra = $id('gridExtra'); // wird geleert
  const legendTop = $id('legendTop');
  const meSelect = $id('meSelect');
  const monthSelect = $id('monthSelect');
  const yearSelect = $id('yearSelect');
  const prevBtn = $id('prevBtn');
  const nextBtn = $id('nextBtn');
  const remarksTA = $id('remarksTA');
  const saveRemarksBtn = $id('saveRemarksBtn');
  const toastEl = $id('toast');

  // Sicherheitsprüfung auf notwendige Elemente
  if (!gridMain || !legendTop || !meSelect || !monthSelect || !yearSelect || !prevBtn || !nextBtn || !remarksTA || !saveRemarksBtn || !toastEl) {
    alert('Einige erforderliche Elemente wurden nicht gefunden. Bitte prüfen, ob die index.html angepasst wurde.');
    return;
  }

  // Kleine Toast‑Funktion für Hinweise
  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.opacity = '0';
    }, 2000);
  }

  // Konfiguration aus APP_CONFIG (Namen, Jahresbereich, Muster)
  const CFG = window.APP_CONFIG || {};
  const BASE_NAMES = Array.isArray(CFG.NAMES) ? CFG.NAMES.slice() : [];
  const YEAR_START = CFG.YEAR_START || new Date().getFullYear();
  const YEAR_END = CFG.YEAR_END || YEAR_START;
  const YEAR_MAX = Math.max(YEAR_END, 2030);
  const START_PATTERN_DATE = CFG.START_PATTERN_DATE ? new Date(CFG.START_PATTERN_DATE) : new Date();
  const PATTERN_SHIFT = CFG.PATTERN_SHIFT || 0;

  // Default‑Namen (falls Supabase ausfällt)
  const DEFAULT_EXTRA = ['Praktikant', 'Bullen Kate'];

  // Zustand: aktuell ausgewählte Namen und Datum
  let currentNames = [];
  const currentDate = new Date();
  currentDate.setFullYear(YEAR_START);
  currentDate.setMonth(0);

  // Painting‑State und overrides
  let selectedCode = null;
  let isPainting = false;
  let overrideMap = {};
  const holidayCache = {};

  // Supabase‑Client holen (wird in supabaseClient.js erstellt)
  const supabase = window.supabase || window.supabaseClient || null;

  // Helfer: Ferien (Bayern) – einfache Heuristik
  function isFerien(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (m === 1 && d <= 5) return true;
    if (m === 2 && d >= 16 && d <= 20) return true;
    if ((m === 3 && d >= 30) || (m === 4 && d <= 10)) return true;
    if (m === 6 && d >= 2 && d <= 5) return true;
    if ((m === 8 && d >= 3) || (m === 9 && d <= 14)) return true;
    if (m === 11 && d >= 2 && d <= 6) return true;
    if (m === 12 && d >= 23) return true;
    return false;
  }

  // Gelb/Weiß‑Rhythmus
  function daysBetween(date1, date2) {
    const t1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const t2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.floor((t2 - t1) / (24 * 60 * 60 * 1000));
  }
  function isYellowDay(date) {
    const start = new Date(START_PATTERN_DATE);
    const diff = daysBetween(start, date) + PATTERN_SHIFT;
    const mod = ((diff % 4) + 4) % 4;
    return mod === 0 || mod === 1;
  }

  // Ostern + Feiertage
  function calcEaster(year) {
    const f = Math.floor;
    const G = year % 19;
    const C = f(year / 100);
    const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
    const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
    const J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7;
    const L = I - J;
    const month = 3 + f((L + 40) / 44);
    const day = L + 28 - 31 * f(month / 4);
    return new Date(year, month - 1, day);
  }
  function getHolidays(year) {
    const easter = calcEaster(year);
    const list = [];
    const toStr = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    list.push(`${year}-1-1`);
    list.push(`${year}-1-6`);
    const gf = new Date(easter); gf.setDate(easter.getDate() - 2); list.push(toStr(gf));
    const em = new Date(easter); em.setDate(easter.getDate() + 1); list.push(toStr(em));
    list.push(`${year}-5-1`);
    const asc = new Date(easter); asc.setDate(easter.getDate() + 39); list.push(toStr(asc));
    const pm = new Date(easter); pm.setDate(easter.getDate() + 50); list.push(toStr(pm));
    const cc = new Date(easter); cc.setDate(easter.getDate() + 60); list.push(toStr(cc));
    list.push(`${year}-8-15`);
    list.push(`${year}-10-3`);
    list.push(`${year}-11-1`);
    list.push(`${year}-12-25`);
    list.push(`${year}-12-26`);
    return list;
  }
  function isHoliday(date) {
    const y = date.getFullYear();
    if (!holidayCache[y]) holidayCache[y] = new Set(getHolidays(y));
    return holidayCache[y].has(`${y}-${date.getMonth() + 1}-${date.getDate()}`);
  }

  // Legend (Codes) anlegen
  const codes = [
    { code: 'N', label: 'N' },
    { code: 'F', label: 'F' },
    { code: 'S', label: 'S' },
    { code: 'U2', label: 'U2' },
    { code: 'U', label: 'U' },
    { code: 'AA', label: 'AA' },
    { code: 'AZA', label: 'AZA' },
    { code: 'AZA6', label: 'AZA6' },
    { code: 'AZA12', label: 'AZA12' },
    { code: 'W2Y', label: 'Weiß→Gelb' },
    { code: 'Y2W', label: 'Gelb→Weiß' },
    { code: 'BEER', label: '🍺' },
    { code: 'PARTY', label: '🎉' },
    { code: 'GV', label: 'GV' },
    { code: 'LG', label: 'LG' },
    { code: 'PE', label: 'PE' },
    { code: 'STAR', label: '★' },
    { code: 'X', label: 'X' }
  ];
  function buildLegend(container) {
    container.innerHTML = '';
    codes.forEach(({ code, label }) => {
      const btn = document.createElement('button');
      btn.className = 'legend-btn';
      btn.dataset.code = code;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        selectedCode = code;
        document.querySelectorAll('.legend-btn').forEach(b => b.classList.toggle('active', b === btn));
        showToast('Modus: ' + label + (meSelect.value ? ` (nur Zeile: ${meSelect.value})` : ''));
      });
      container.appendChild(btn);
    });
  }
  buildLegend(legendTop);

  // Dropdowns füllen (Monat/Jahr)
  for (let i = 0; i < 12; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = new Date(2023, i, 1).toLocaleString('de', { month: 'long' });
    monthSelect.appendChild(opt);
  }
  for (let y = YEAR_START; y <= YEAR_MAX; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
  function refreshSelects() {
    monthSelect.value = currentDate.getMonth();
    yearSelect.value = currentDate.getFullYear();
  }

  // Namen aus Supabase laden
  async function loadActiveEmployees() {
    // Wenn es keinen Supabase Client gibt, nur Basenamen + Default
    if (!supabase || !supabase.from) {
      return [...BASE_NAMES, ...DEFAULT_EXTRA];
    }
    try {
      const { data, error } = await supabase
        .from('mitarbeiter')
        .select('name, aktiv')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const active = (data || []).filter(r => r && r.name && r.aktiv === true).map(r => r.name.trim());
      return active.length ? active : [...BASE_NAMES, ...DEFAULT_EXTRA];
    } catch (e) {
      console.error('loadActiveEmployees failed', e);
      return [...BASE_NAMES, ...DEFAULT_EXTRA];
    }
  }

  // Mitarbeiter upsert: aktiv=true zum Hinzufügen, aktiv=false zum Deaktivieren
  async function upsertEmployeeActive(name, aktiv) {
    if (!supabase || !supabase.from) throw new Error('Supabase nicht verfügbar');
    const cleanName = (name || '').trim();
    if (!cleanName) return;
    // Prüfen, ob Name existiert
    const { data: existing, error: selErr } = await supabase
      .from('mitarbeiter')
      .select('id')
      .eq('name', cleanName)
      .limit(1);
    if (selErr) throw selErr;
    if (existing && existing.length) {
      const { error: updErr } = await supabase
        .from('mitarbeiter')
        .update({ aktiv })
        .eq('id', existing[0].id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase
        .from('mitarbeiter')
        .insert([{ name: cleanName, aktiv }]);
      if (insErr) throw insErr;
    }
  }

  // Renderfunktion
  function renderGrid(namesArr, container, valueMap) {
    const y = currentDate.getFullYear();
    const mIdx = currentDate.getMonth();
    const daysInMonth = new Date(y, mIdx + 1, 0).getDate();
    let html = '<table><thead><tr><th class=\"name\">Name</th>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, mIdx, d);
      const wd = ['So','Mo','Di','Mi','Do','Fr','Sa'][dt.getDay()];
      const hclasses = [];
      if (dt.getDay() === 6) hclasses.push('sat');
      else if (dt.getDay() === 0) hclasses.push('sun');
      else if (isHoliday(dt) || isFerien(dt)) hclasses.push('ferienday');
      html += `<th${hclasses.length ? ' class=\"' + hclasses.join(' ') + '\"' : ''}><span class=\"daynum\">${d}</span><br/><span class=\"weekday\">${wd}</span></th>`;
    }
    html += '</tr></thead><tbody>';
    (namesArr || []).forEach(name => {
      html += '<tr>';
      // Name-Spalte: klickbar → Dropdown setzen
      html += `<td class=\"name name-click\" data-name=\"${name}\">${name}</td>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(y, mIdx, d);
        let classes = [];
        if (name !== 'Bullen Kate' && isYellowDay(dt)) classes.push('yellow');
        const key = `${name}|${d}`;
        if (overrideMap[key] === 1) {
          if (!classes.includes('yellow')) classes.push('yellow');
          classes.push('force-yellow');
        } else if (overrideMap[key] === -1) {
          classes = classes.filter(c => c !== 'yellow');
          classes.push('no-yellow');
        }
        const val = valueMap[key] || '';
        switch (val) {
          case 'U': case 'S': case 'F': case 'N': classes.push('code-U'); break;
          case 'U2': classes.push('code-u2'); break;
          case 'AA': classes.push('code-AA'); break;
          case 'AZA': classes.push('code-AZA'); break;
          case 'AZA6': classes.push('code-AZA6'); break;
          case 'AZA12': classes.push('code-AZA12'); break;
          case 'GV': classes.push('code-GV'); break;
          case 'LG': classes.push('code-LG'); break;
          case 'PE': classes.push('code-PE'); break;
          default: break;
        }
        const content = (val === '🍺' || val === '🎉') ? val : (val || '');
        html += `<td class=\"editable ${classes.join(' ')}\" data-name=\"${name}\" data-day=\"${d}\">${content}</td>`;
      }
      html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
    // Name‑Click
    container.querySelectorAll('td.name-click').forEach(td => {
      td.addEventListener('click', () => {
        const n = td.dataset.name;
        meSelect.value = n;
        showToast('Ausgewählt: ' + n);
      });
    });
    // Cell events
    container.querySelectorAll('td.editable').forEach(cell => {
      cell.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        isPainting = true;
        handleCell(cell);
      });
      cell.addEventListener('mouseenter', () => {
        if (isPainting) handleCell(cell);
      });
      cell.addEventListener('mouseup', () => { isPainting = false; });
      cell.addEventListener('click', () => { handleCell(cell); });
    });
  }

  // Einzelzelle bearbeiten
  function updateOverrideClass(cell, overrideVal) {
    const y = currentDate.getFullYear();
    const mIdx = currentDate.getMonth();
    const d = parseInt(cell.dataset.day, 10);
    const dt = new Date(y, mIdx, d);
    let classes = [];
    if (isYellowDay(dt)) classes.push('yellow');
    if (overrideVal === 1) {
      if (!classes.includes('yellow')) classes.push('yellow');
      classes.push('force-yellow');
    } else if (overrideVal === -1) {
      classes = classes.filter(c => c !== 'yellow');
      classes.push('no-yellow');
    }
    const oldCode = Array.from(cell.classList).filter(c => c.startsWith('code-'));
    classes = classes.concat(oldCode);
    cell.className = `editable ${classes.join(' ')}`;
  }

  function updateCellValue(cell, value) {
    cell.classList.remove(
      'code-U','code-AA','code-AZA','code-AZA6','code-AZA12',
      'code-GV','code-LG','code-PE','code-u2'
    );
    if (['U','S','F','N'].includes(value)) cell.classList.add('code-U');
    else if (value === 'U2') cell.classList.add('code-u2');
    else if (value === 'AA') cell.classList.add('code-AA');
    else if (value === 'AZA') cell.classList.add('code-AZA');
    else if (value === 'AZA6') cell.classList.add('code-AZA6');
    else if (value === 'AZA12') cell.classList.add('code-AZA12');
    else if (value === 'GV') cell.classList.add('code-GV');
    else if (value === 'LG') cell.classList.add('code-LG');
    else if (value === 'PE') cell.classList.add('code-PE');
    cell.textContent = value || '';
  }

  function handleCell(cell) {
    const name = cell.dataset.name;
    const day = parseInt(cell.dataset.day, 10);
    const myName = meSelect.value;
    if (myName && myName !== name) {
      showToast('Nur in deiner Zeile eintragbar');
      return;
    }
    if (!selectedCode) {
      showToast('Kein Code ausgewählt');
      return;
    }
    if (selectedCode === 'W2Y' || selectedCode === 'Y2W') {
      const ov = selectedCode === 'W2Y' ? 1 : -1;
      overrideMap[`${name}|${day}`] = ov;
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth() + 1;
      window.saveOverride({ year: y, month: m, day, name, yellow_override: ov }).catch(() => {});
      updateOverrideClass(cell, ov);
      return;
    }
    let valueToSave;
    switch (selectedCode) {
      case 'X': valueToSave = ''; break;
      case 'BEER': valueToSave = '🍺'; break;
      case 'PARTY': valueToSave = '🎉'; break;
      case 'STAR': valueToSave = '★'; break;
      default: valueToSave = selectedCode; break;
    }
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    window.saveCell({ year: y, month: m, day, name, value: valueToSave }).catch(() => {});
    updateCellValue(cell, valueToSave);
  }

  // Laden & Rendern
  async function loadAndRender() {
    refreshSelects();
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    // Namen laden
    currentNames = await loadActiveEmployees();
    // Dropdown neu bauen
    const prevSelected = meSelect.value;
    meSelect.innerHTML = '';
    currentNames.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      meSelect.appendChild(opt);
    });
    if (prevSelected && currentNames.includes(prevSelected)) meSelect.value = prevSelected;
    else if (currentNames.length) meSelect.value = currentNames[0];
    // Monatseinträge laden
    let entries = [];
    try { entries = await window.loadMonth({ year: y, month: m }); } catch (e) { entries = []; }
    const valueMap = {};
    (entries || []).forEach(rec => {
      if (rec && rec.name && typeof rec.day !== 'undefined') {
        valueMap[`${rec.name}|${rec.day}`] = rec.value;
      }
    });
    // Overrides laden
    let overrides = [];
    try { overrides = await window.loadOverrides({ year: y, month: m }); } catch (e) { overrides = []; }
    overrideMap = {};
    (overrides || []).forEach(r => { overrideMap[`${r.name}|${r.day}`] = r.yellow_override; });
    // Bemerkungen laden
    try {
      const remarks = await window.loadRemarks({ year: y, month: m });
      remarksTA.value = remarks || '';
    } catch (e) {
      remarksTA.value = '';
    }
    // Rendern
    renderGrid(currentNames, gridMain, valueMap);
    // gridExtra leeren
    if (gridExtra) gridExtra.innerHTML = '';
  }

  // Mitarbeiter‑Buttons einrichten
  function setupEmployeeButtons() {
    let container = document.getElementById('employeeControls');
    if (!container) {
      container = document.createElement('div');
      container.id = 'employeeControls';
      container.style.marginTop = '10px';
      // Direkt nach „Bemerkungen speichern“-Button
      saveRemarksBtn.insertAdjacentElement('afterend', container);
    }
    container.innerHTML = '';
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Mitarbeiter hinzufügen';
    addBtn.style.marginRight = '10px';
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Mitarbeiter entfernen';
    container.appendChild(addBtn);
    container.appendChild(delBtn);
    addBtn.addEventListener('click', async () => {
      const name = prompt('Neuen Mitarbeiter eingeben:');
      if (!name) return;
      try {
        await upsertEmployeeActive(name, true);
        showToast('Hinzugefügt: ' + name);
        await loadAndRender();
      } catch (e) {
        console.error('add employee failed', e);
        showToast('Fehler beim Hinzufügen');
      }
    });
    delBtn.addEventListener('click', async () => {
      const name = meSelect.value;
      if (!name) return;
      const ok = confirm('Mitarbeiter entfernen (deaktivieren)?\\n\\n' + name + '\\n\\nHinweis: Schichtdaten bleiben erhalten.');
      if (!ok) return;
      try {
        await upsertEmployeeActive(name, false);
        showToast('Entfernt: ' + name);
        await loadAndRender();
      } catch (e) {
        console.error('remove employee failed', e);
        showToast('Fehler beim Entfernen');
      }
    });
  }

  // Event‑Handler für Jahr/Monat Navigation
  monthSelect.addEventListener('change', () => {
    currentDate.setMonth(parseInt(monthSelect.value, 10));
    loadAndRender();
  });
  yearSelect.addEventListener('change', () => {
    currentDate.setFullYear(parseInt(yearSelect.value, 10));
    loadAndRender();
  });
  prevBtn.addEventListener('click', () => {
    const m = currentDate.getMonth();
    if (m === 0) {
      currentDate.setFullYear(currentDate.getFullYear() - 1);
      currentDate.setMonth(11);
    } else {
      currentDate.setMonth(m - 1);
    }
    loadAndRender();
  });
  nextBtn.addEventListener('click', () => {
    const m = currentDate.getMonth();
    if (m === 11) {
      currentDate.setFullYear(currentDate.getFullYear() + 1);
      currentDate.setMonth(0);
    } else {
      currentDate.setMonth(m + 1);
    }
    loadAndRender();
  });
  saveRemarksBtn.addEventListener('click', () => {
    const remarks = remarksTA.value || '';
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    window.saveRemarks({ year: y, month: m, remarks })
      .then(() => showToast('Bemerkungen gespeichert'))
      .catch(() => showToast('Fehler beim Speichern'));
  });

  // Initialisierung
  refreshSelects();
  setupEmployeeButtons();
  loadAndRender();
});
