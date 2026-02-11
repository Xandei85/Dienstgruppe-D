// Hauptskript für den Schichtplan (v4.6.11 - Mitarbeiterverwaltung ohne Login)

document.addEventListener('DOMContentLoaded', () => {
  const CFG = window.APP_CONFIG || {};

  const YEAR_START = CFG.YEAR_START || new Date().getFullYear();
  const YEAR_END   = CFG.YEAR_END || YEAR_START;
  // Bis 2030 umschaltbar
  const YEAR_MAX   = Math.max(YEAR_END, 2030);
  const START_PATTERN_DATE = CFG.START_PATTERN_DATE ? new Date(CFG.START_PATTERN_DATE) : new Date();
  const PATTERN_SHIFT = CFG.PATTERN_SHIFT || 0;

  // Aktuelles Datum (Monat/Jahr) im Zustand
  const currentDate = new Date();
  currentDate.setFullYear(YEAR_START);
  currentDate.setMonth(0);

  // Aktuell ausgewählter Code (Legendenbutton)
  let selectedCode = null;
  // Flag zum Verfolgen des Mehrfachmalens per Maus
  let isPainting = false;
  // Überschreibungen für Gelb/Weiß (je Monat geladen)
  let overrideMap = {};
  // Cache für Feiertage pro Jahr
  const holidayCache = {};

  // -------------------------------
  // Ferien (Schulferien) Bayern (wie bisher)
  function isFerien(date) {
    const m = date.getMonth() + 1; // 1-based
    const d = date.getDate();
    // Weihnachtsferien: 1.–5. Januar
    if (m === 1 && d <= 5) return true;
    // Frühjahrsferien (Winterferien): 16.–20. Februar
    if (m === 2 && d >= 16 && d <= 20) return true;
    // Osterferien: 30. März – 10. April
    if ((m === 3 && d >= 30) || (m === 4 && d <= 10)) return true;
    // Pfingstferien: 2.–5. Juni
    if (m === 6 && d >= 2 && d <= 5) return true;
    // Sommerferien: 3. August – 14. September
    if ((m === 8 && d >= 3) || (m === 9 && d <= 14)) return true;
    // Herbstferien: 2.–6. November
    if (m === 11 && d >= 2 && d <= 6) return true;
    // Weihnachtsferien (zweiter Block): 23.–31. Dezember
    if (m === 12 && d >= 23) return true;
    return false;
  }

  // DOM-Elemente
  const meSelect     = document.getElementById('meSelect');
  const monthSelect  = document.getElementById('monthSelect');
  const yearSelect   = document.getElementById('yearSelect');
  const prevBtn      = document.getElementById('prevBtn');
  const nextBtn      = document.getElementById('nextBtn');
  const legendTop    = document.getElementById('legendTop');
  const gridMain     = document.getElementById('gridMain');
  const remarksTA    = document.getElementById('remarksTA');
  const saveRemarksBtn = document.getElementById('saveRemarksBtn');
  const toastEl      = document.getElementById('toast');

  // -------------------------------
  // Supabase Zugriff (ohne Login)
  function getSupabaseClient() {
    // Je nach Setup heißt das Objekt anders:
    // - window.supabase (typisch: createClient() wurde bereits aufgerufen)
    // - window.supabaseClient (manche Setups)
    return window.supabaseClient || window.supabase || null;
  }

  async function fetchActiveEmployees() {
    const sb = getSupabaseClient();
    if (!sb || !sb.from) return null;

    const { data, error } = await sb
      .from('mitarbeiter')
      .select('name, aktiv')
      .order('name', { ascending: true });

    if (error) return null;

    // Nur aktive Namen
    return (data || [])
      .filter(r => r && r.name && r.aktiv === true)
      .map(r => r.name);
  }

  async function addEmployee(name) {
    const sb = getSupabaseClient();
    if (!sb || !sb.from) throw new Error('no-supabase');
    const { error } = await sb.from('mitarbeiter').insert([{ name, aktiv: true }]);
    if (error) throw error;
  }

  async function deactivateEmployeeByName(name) {
    const sb = getSupabaseClient();
    if (!sb || !sb.from) throw new Error('no-supabase');
    const { error } = await sb.from('mitarbeiter').update({ aktiv: false }).eq('name', name);
    if (error) throw error;
  }

  // -------------------------------
  // Mitarbeiter-Liste (kommt bevorzugt aus Supabase, Fallback aus config.js)
  let allNames = [];
  let employeeLoaded = false;

  async function ensureEmployeesLoaded() {
    if (employeeLoaded) return;

    // 1) Supabase (aktiv=true)
    try {
      const supaNames = await fetchActiveEmployees();
      if (Array.isArray(supaNames) && supaNames.length > 0) {
        allNames = supaNames;
        employeeLoaded = true;
        rebuildMeSelectOptions();
        return;
      }
    } catch (_) {}

    // 2) Fallback: config.js (alter Zustand)
    const namesFromCfg = CFG.NAMES || [];
    const extraNames = ['Praktikant', 'Bullen Kate']; // falls alte Instanzen noch darauf basieren
    allNames = [...namesFromCfg, ...extraNames].filter(Boolean);
    employeeLoaded = true;
    rebuildMeSelectOptions();
  }

  function rebuildMeSelectOptions() {
    if (!meSelect) return;
    const previous = meSelect.value;

    meSelect.innerHTML = '';
    allNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      meSelect.appendChild(opt);
    });

    // Standardwert
    if (previous && allNames.includes(previous)) meSelect.value = previous;
    else if (allNames.length > 0) meSelect.value = allNames[0];
  }

  // -------------------------------
  // UI: Buttons unten links (unterhalb des Bemerkungsbereichs)
  function ensureEmployeeControls() {
    if (document.getElementById('employeeControls')) return;

    // Leichtes Highlight für ausgewählte Zeile (nur optisch, ansonsten Design unverändert)
    const style = document.createElement('style');
    style.textContent = `
      tr.row-selected td.name {
        outline: 2px solid rgba(0,0,0,0.25);
        outline-offset: -2px;
        font-weight: 700;
      }
      #employeeControls {
        margin: 8px 0 0 0;
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }
      #employeeControls button {
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid rgba(0,0,0,0.25);
        background: #fff;
        cursor: pointer;
      }
      #employeeControls button:hover { filter: brightness(0.98); }
    `;
    document.head.appendChild(style);

    const controls = document.createElement('div');
    controls.id = 'employeeControls';

    const btnAdd = document.createElement('button');
    btnAdd.type = 'button';
    btnAdd.textContent = 'Mitarbeiter hinzufügen';

    const btnRemove = document.createElement('button');
    btnRemove.type = 'button';
    btnRemove.textContent = 'Mitarbeiter entfernen';

    controls.appendChild(btnAdd);
    controls.appendChild(btnRemove);

    // Position: direkt unter dem "Bemerkungen speichern"-Button (unten links)
    if (saveRemarksBtn && saveRemarksBtn.parentNode) {
      saveRemarksBtn.parentNode.insertBefore(controls, saveRemarksBtn.nextSibling);
    } else {
      // Fallback: ans Ende
      document.body.appendChild(controls);
    }

    btnAdd.addEventListener('click', async () => {
      const raw = prompt('Name des neuen Mitarbeiters:');
      if (!raw) return;
      const name = raw.trim();
      if (!name) return;

      if (allNames.includes(name)) {
        showToast('Name existiert bereits');
        return;
      }

      try {
        await addEmployee(name);
        showToast('Mitarbeiter hinzugefügt');
        employeeLoaded = false; // neu laden
        await loadAndRender();
      } catch (e) {
        showToast('Fehler beim Hinzufügen');
      }
    });

    btnRemove.addEventListener('click', async () => {
      const name = meSelect?.value || '';
      if (!name) {
        showToast('Kein Mitarbeiter ausgewählt');
        return;
      }

      const ok = confirm(`Soll "${name}" wirklich entfernt (deaktiviert) werden?`);
      if (!ok) return;

      try {
        await deactivateEmployeeByName(name);
        showToast('Mitarbeiter deaktiviert');
        employeeLoaded = false; // neu laden
        await loadAndRender();
      } catch (e) {
        showToast('Fehler beim Entfernen');
      }
    });
  }

  // -------------------------------
  // Monate / Jahre
  for (let i = 0; i < 12; i++) {
    const dt = new Date(2023, i, 1);
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = dt.toLocaleString('de', { month:'long' });
    monthSelect.appendChild(opt);
  }

  for (let y = YEAR_START; y <= YEAR_MAX; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }

  // -------------------------------
  // Legende (wie bisher)
  const codes = [
    { code: 'N', label: 'N' },
    { code: 'F', label: 'F' },
    { code: 'S', label: 'S' },
    { code: 'U2', label: 'U2' },
    { code: 'U',    label: 'U' },
    { code: 'AA',   label: 'AA' },
    { code: 'AZA',  label: 'AZA' },
    { code: 'AZA6', label: 'AZA6' },
    { code: 'AZA12',label: 'AZA12' },
    { code: 'W2Y',  label: 'Weiß→Gelb' },
    { code: 'Y2W',  label: 'Gelb→Weiß' },
    { code: 'BEER', label: '🍺' },
    { code: 'PARTY',label: '🎉' },
    { code: 'GV',   label: 'GV' },
    { code: 'LG',   label: 'LG' },
    { code: 'PE',   label: 'PE' },
    { code: 'STAR', label: '★' },
    { code: 'X',    label: 'X' }
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

  // -------------------------------
  // Hilfsfunktionen
  function daysBetween(date1, date2) {
    const time1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const time2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.floor((time2 - time1) / (24*60*60*1000));
  }
  function isYellowDay(date) {
    const start = new Date(START_PATTERN_DATE);
    const diff = daysBetween(start, date) + (PATTERN_SHIFT || 0);
    const mod = ((diff % 4) + 4) % 4;
    return mod === 0 || mod === 1;
  }

  // Osterberechnung (Gauss'sche Formel)
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
    function toStr(d) { return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }
    list.push(`${year}-1-1`);   // Neujahr
    list.push(`${year}-1-6`);   // Heilige Drei Könige

    const gf = new Date(easter); gf.setDate(easter.getDate() - 2); list.push(toStr(gf)); // Karfreitag
    const em = new Date(easter); em.setDate(easter.getDate() + 1); list.push(toStr(em)); // Ostermontag

    list.push(`${year}-5-1`); // 1. Mai

    const asc = new Date(easter); asc.setDate(easter.getDate() + 39); list.push(toStr(asc)); // Christi Himmelfahrt
    const pm  = new Date(easter); pm.setDate(easter.getDate() + 50); list.push(toStr(pm));  // Pfingstmontag
    const cc  = new Date(easter); cc.setDate(easter.getDate() + 60); list.push(toStr(cc));  // Fronleichnam

    list.push(`${year}-8-15`); // Mariä Himmelfahrt
    list.push(`${year}-10-3`); // Tag der Deutschen Einheit
    list.push(`${year}-11-1`); // Allerheiligen
    list.push(`${year}-12-25`); // 1. Weihnachtstag
    list.push(`${year}-12-26`); // 2. Weihnachtstag
    return list;
  }

  function isHoliday(date) {
    const y = date.getFullYear();
    if (!holidayCache[y]) holidayCache[y] = new Set(getHolidays(y));
    return holidayCache[y].has(`${y}-${date.getMonth()+1}-${date.getDate()}`);
  }

  // Toast
  let toastTimeout = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 2000);
  }

  function refreshSelects() {
    monthSelect.value = currentDate.getMonth();
    yearSelect.value  = currentDate.getFullYear();
  }

  // Navigation
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
    if (m === 0) { currentDate.setFullYear(currentDate.getFullYear() - 1); currentDate.setMonth(11); }
    else currentDate.setMonth(m - 1);
    loadAndRender();
  });
  nextBtn.addEventListener('click', () => {
    const m = currentDate.getMonth();
    if (m === 11) { currentDate.setFullYear(currentDate.getFullYear() + 1); currentDate.setMonth(0); }
    else currentDate.setMonth(m + 1);
    loadAndRender();
  });

  meSelect.addEventListener('change', () => {
    // Nur Anzeige / Restriktion – am Layout ändert sich nichts
    showToast(`Ausgewählt: ${meSelect.value}`);
  });

  saveRemarksBtn.addEventListener('click', () => {
    const remarks = remarksTA.value || '';
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    window.saveRemarks({ year: y, month: m, remarks })
      .then(() => showToast('Bemerkungen gespeichert'))
      .catch(() => showToast('Fehler beim Speichern der Bemerkungen'));
  });

  // -------------------------------
  // Laden + Rendern
  async function loadAndRender() {
    await ensureEmployeesLoaded();
    ensureEmployeeControls();

    refreshSelects();
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;

    // Lade Einträge für den Monat
    let entries = [];
    try { entries = await window.loadMonth({ year: y, month: m }); } catch (_) { entries = []; }

    const valueMap = {};
    entries.forEach(rec => {
      if (rec && rec.name && typeof rec.day !== 'undefined') valueMap[`${rec.name}|${rec.day}`] = rec.value;
    });

    // Lade Overrides
    let overrides = [];
    try { overrides = await window.loadOverrides({ year: y, month: m }); } catch (_) { overrides = []; }
    overrideMap = {};
    overrides.forEach(r => { overrideMap[`${r.name}|${r.day}`] = r.yellow_override; });

    // Lade Bemerkungen
    try { remarksTA.value = (await window.loadRemarks({ year: y, month: m })) || ''; }
    catch (_) { remarksTA.value = ''; }

    // Rendering (nur 1 Tabelle, aber Optik/Logik bleibt)
    renderGrid(allNames, gridMain, valueMap);
  }

  // -------------------------------
  // Rendering (optisch identisch, nur eine Tabelle)
  function renderGrid(namesArr, container, valueMap) {
    const y = currentDate.getFullYear();
    const mIdx = currentDate.getMonth();
    const daysInMonth = new Date(y, mIdx + 1, 0).getDate();

    let html = '<table><thead><tr><th class="name">Name</th>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, mIdx, d);
      const wd = ['So','Mo','Di','Mi','Do','Fr','Sa'][dt.getDay()];
      const hclasses = [];
      const dow = dt.getDay();
      if (dow === 6) hclasses.push('sat');
      else if (dow === 0) hclasses.push('sun');
      else if (isHoliday(dt) || isFerien(dt)) hclasses.push('ferienday');
      const clsStr = hclasses.length > 0 ? ` class="${hclasses.join(' ')}"` : '';
      html += `<th${clsStr}><span class="daynum">${d}</span><br/><span class="weekday">${wd}</span></th>`;
    }
    html += '</tr></thead><tbody>';

    namesArr.forEach(name => {
      html += `<tr data-row-name="${name}">`;
      html += `<td class="name">${name}</td>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(y, mIdx, d);
        let classes = [];

        // Grundfarbe Gelb (2‑Tage‑Rhythmus) – unverändert
        if (name !== 'Bullen Kate' && isYellowDay(dt)) classes.push('yellow');

        // Overrides Gelb/Weiß
        const key = `${name}|${d}`;
        if (overrideMap[key] === 1) {
          if (!classes.includes('yellow')) classes.push('yellow');
          classes.push('force-yellow');
        } else if (overrideMap[key] === -1) {
          classes = classes.filter(c => c !== 'yellow');
          classes.push('no-yellow');
        }

        // Codes
        const val = valueMap[key] || '';
        let codeClass = '';
        if (val) {
          switch (val) {
            case 'U': codeClass = 'code-U'; break;
            case 'AA': codeClass = 'code-AA'; break;
            case 'AZA': codeClass = 'code-AZA'; break;
            case 'AZA6': codeClass = 'code-AZA6'; break;
            case 'AZA12': codeClass = 'code-AZA12'; break;
            case 'GV': codeClass = 'code-GV'; break;
            case 'LG': codeClass = 'code-LG'; break;
            case 'PE': codeClass = 'code-PE'; break;
            default: break;
          }
        }
        if (codeClass) classes.push(codeClass);

        const content = (val === '🍺' || val === '🎉') ? val : (val || '');
        html += `<td class="editable ${classes.join(' ')}" data-name="${name}" data-day="${d}">${content}</td>`;
      }
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Klick auf Name = Auswahl (nur Komfort, Design bleibt)
    container.querySelectorAll('tr[data-row-name] td.name').forEach(td => {
      td.addEventListener('click', () => {
        const row = td.closest('tr');
        const name = row?.dataset?.rowName || td.textContent.trim();
        if (name && allNames.includes(name)) {
          meSelect.value = name;
          container.querySelectorAll('tr.row-selected').forEach(r => r.classList.remove('row-selected'));
          row.classList.add('row-selected');
          showToast(`Ausgewählt: ${name}`);
        }
      });
    });

    // Eventhandler für Zellen
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

  // -------------------------------
  // Zellen-Bemalung (wie bisher, Restriktion: nur ausgewählte Zeile)
  function handleCell(cell) {
    const name = cell.dataset.name;
    const day  = parseInt(cell.dataset.day, 10);
    const myName = meSelect.value;

    if (myName && myName !== name) {
      showToast('Nur in deiner Zeile eintragbar');
      return;
    }
    if (!selectedCode) {
      showToast('Kein Code ausgewählt');
      return;
    }

    // Overrides für Gelb/Weiß
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
    if (selectedCode === 'X') valueToSave = '';
    else if (selectedCode === 'BEER') valueToSave = '🍺';
    else if (selectedCode === 'PARTY') valueToSave = '🎉';
    else if (selectedCode === 'STAR') valueToSave = '★';
    else valueToSave = selectedCode;

    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    window.saveCell({ year: y, month: m, day, name, value: valueToSave }).catch(() => {});
    updateCellValue(cell, valueToSave);
  }

  function updateCellValue(cell, value) {
    cell.classList.remove(
      'code-U','code-AA','code-AZA','code-AZA6','code-AZA12',
      'code-GV','code-LG','code-PE',
      'code-u2','code-s','code-f','code-n'
    );

    if (['U','S','F','N'].includes(value)) cell.classList.add('code-U');
    else if (value === 'AA') cell.classList.add('code-AA');
    else if (value === 'AZA') cell.classList.add('code-AZA');
    else if (value === 'AZA6') cell.classList.add('code-AZA6');
    else if (value === 'AZA12') cell.classList.add('code-AZA12');
    else if (value === "U2") cell.classList.add('code-u2');
    else if (value === "S") cell.classList.add('code-s');
    else if (value === "F") cell.classList.add('code-f');
    else if (value === "N") cell.classList.add('code-n');
    else if (value === 'GV') cell.classList.add('code-GV');
    else if (value === 'LG') cell.classList.add('code-LG');
    else if (value === 'PE') cell.classList.add('code-PE');
    else if (value === '★') cell.classList.add('code-STAR');

    cell.textContent = (value === '🍺' || value === '🎉' || value === '★') ? value : (value || '');
  }

  function updateOverrideClass(cell, overrideVal) {
    const y = currentDate.getFullYear();
    const mIdx = currentDate.getMonth();
    const d  = parseInt(cell.dataset.day, 10);
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

  // -------------------------------
  // Start
  refreshSelects();
  loadAndRender();
});
