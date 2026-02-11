// Hauptskript für den Schichtplan (v4.6.11)
// - Eine einzige Tabelle (alle Namen zusammen)
// - Mitarbeiterverwaltung per Supabase-Tabelle "mitarbeiter" (Spalten: id, created_at, name, aktiv)
// - Buttons "Mitarbeiter hinzufügen" / "Mitarbeiter entfernen" werden unten links unter den Bemerkungen automatisch eingefügt
// - Design/Logik (Gelb-Rhythmus, Ferien/Feiertage im Kopf, Codes, Overrides) bleibt unverändert

document.addEventListener('DOMContentLoaded', () => {
  const CFG = window.APP_CONFIG || {};
  const FALLBACK_NAMES = CFG.NAMES || [];
  // Falls Supabase ausfällt, werden diese Zusatzzeilen dennoch angezeigt:
  const FALLBACK_EXTRA_NAMES = ['Praktikant', 'Bullen Kate'];

  const YEAR_START = CFG.YEAR_START || new Date().getFullYear();
  const YEAR_END   = CFG.YEAR_END || YEAR_START;
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

  // Namen (werden dynamisch geladen)
  let currentNames = [];

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
  const meSelect       = document.getElementById('meSelect');
  const monthSelect    = document.getElementById('monthSelect');
  const yearSelect     = document.getElementById('yearSelect');
  const prevBtn        = document.getElementById('prevBtn');
  const nextBtn        = document.getElementById('nextBtn');
  const legendTop      = document.getElementById('legendTop');
  const gridMain       = document.getElementById('gridMain');
  const gridExtra      = document.getElementById('gridExtra'); // wird nicht mehr benutzt, bleibt aber kompatibel falls vorhanden
  const remarksTA      = document.getElementById('remarksTA');
  const saveRemarksBtn = document.getElementById('saveRemarksBtn');
  const toastEl        = document.getElementById('toast');

  // -------------------------------
  // Legenden-Codes und Beschriftungen (wie bisher)
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
    if (!container) return;
    container.innerHTML = '';
    codes.forEach(({ code, label }) => {
      const btn = document.createElement('button');
      btn.className = 'legend-btn';
      btn.dataset.code = code;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        selectedCode = code;
        document.querySelectorAll('.legend-btn').forEach(b => b.classList.toggle('active', b === btn));
        showToast('Modus: ' + label + (meSelect?.value ? ` (nur Zeile: ${meSelect.value})` : ''));
      });
      container.appendChild(btn);
    });
  }
  buildLegend(legendTop);

  // -------------------------------
  // Toast
  let toastTimeout = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 2000);
  }

  // -------------------------------
  // Hilfsfunktionen für Gelb-Rhythmus / Feiertage (wie bisher)
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
    list.push(`${year}-5-1`);   // 1. Mai
    const asc = new Date(easter); asc.setDate(easter.getDate() + 39); list.push(toStr(asc)); // Christi Himmelfahrt
    const pm = new Date(easter); pm.setDate(easter.getDate() + 50); list.push(toStr(pm)); // Pfingstmontag
    const cc = new Date(easter); cc.setDate(easter.getDate() + 60); list.push(toStr(cc)); // Fronleichnam
    list.push(`${year}-8-15`);  // Mariä Himmelfahrt
    list.push(`${year}-10-3`);  // Tag der Deutschen Einheit
    list.push(`${year}-11-1`);  // Allerheiligen
    list.push(`${year}-12-25`); // 1. Weihnachtstag
    list.push(`${year}-12-26`); // 2. Weihnachtstag
    return list;
  }
  function isHoliday(date) {
    const y = date.getFullYear();
    if (!holidayCache[y]) holidayCache[y] = new Set(getHolidays(y));
    return holidayCache[y].has(`${y}-${date.getMonth()+1}-${date.getDate()}`);
  }

  // -------------------------------
  // Dropdown (Monat/Jahr)
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

  function refreshSelects() {
    monthSelect.value = currentDate.getMonth();
    yearSelect.value  = currentDate.getFullYear();
  }

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

  saveRemarksBtn.addEventListener('click', () => {
    const remarks = remarksTA.value || '';
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    window.saveRemarks({ year: y, month: m, remarks })
      .then(() => showToast('Bemerkungen gespeichert'))
      .catch(() => showToast('Fehler beim Speichern der Bemerkungen'));
  });

  // -------------------------------
  // Mitarbeiter-Buttons automatisch unter die Bemerkungen setzen (unten links)
  function ensureEmployeeControls() {
    if (!saveRemarksBtn) return;

    // Falls schon vorhanden: nichts tun
    if (document.getElementById('addEmployeeBtn')) return;

    const wrap = document.createElement('div');
    wrap.id = 'mitarbeiterControls';
    wrap.style.marginTop = '10px';
    wrap.style.display = 'flex';
    wrap.style.gap = '10px';

    const addBtn = document.createElement('button');
    addBtn.id = 'addEmployeeBtn';
    addBtn.type = 'button';
    addBtn.textContent = 'Mitarbeiter hinzufügen';
    // gleiche Optik wie Bemerkungen-Button: falls dort Klassen drin sind, übernehmen wir sie
    addBtn.className = saveRemarksBtn.className || '';

    const delBtn = document.createElement('button');
    delBtn.id = 'removeEmployeeBtn';
    delBtn.type = 'button';
    delBtn.textContent = 'Mitarbeiter entfernen';
    delBtn.className = saveRemarksBtn.className || '';
    // optisch leicht absetzen, ohne CSS zu ändern
    delBtn.style.borderColor = '#c0392b';
    delBtn.style.color = '#c0392b';

    wrap.appendChild(addBtn);
    wrap.appendChild(delBtn);

    // direkt nach dem "Bemerkungen speichern" Button einfügen
    saveRemarksBtn.insertAdjacentElement('afterend', wrap);

    addBtn.addEventListener('click', onAddEmployee);
    delBtn.addEventListener('click', onRemoveEmployee);
  }

  // -------------------------------
  // Supabase: Mitarbeiter laden / hinzufügen / deaktivieren
  function hasSupabase() {
    return !!(window.supabase && typeof window.supabase.from === 'function');
  }

  async function loadEmployees() {
    if (!hasSupabase()) throw new Error('Supabase not available');
    const { data, error } = await window.supabase
      .from('mitarbeiter')
      .select('name, aktiv')
      .eq('aktiv', true)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => (r?.name || '').trim()).filter(Boolean);
  }

  async function addEmployeeByName(name) {
    if (!hasSupabase()) throw new Error('Supabase not available');
    const clean = (name || '').trim();
    if (!clean) return;

    // Ohne UNIQUE/Upsert: erst schauen, ob es den Namen schon gibt
    const { data: existing, error: selErr } = await window.supabase
      .from('mitarbeiter')
      .select('id, name')
      .eq('name', clean)
      .limit(1);

    if (selErr) throw selErr;

    if (existing && existing.length > 0) {
      // existiert -> aktiv=true setzen
      const { error: updErr } = await window.supabase
        .from('mitarbeiter')
        .update({ aktiv: true })
        .eq('name', clean);
      if (updErr) throw updErr;
    } else {
      // neu -> einfügen
      const { error: insErr } = await window.supabase
        .from('mitarbeiter')
        .insert({ name: clean, aktiv: true });
      if (insErr) throw insErr;
    }
  }

  async function deactivateEmployeeByName(name) {
    if (!hasSupabase()) throw new Error('Supabase not available');
    const clean = (name || '').trim();
    if (!clean) return;
    const { error } = await window.supabase
      .from('mitarbeiter')
      .update({ aktiv: false })
      .eq('name', clean);
    if (error) throw error;
  }

  async function onAddEmployee() {
    const name = prompt('Neuen Mitarbeiter eingeben:');
    if (!name) return;
    try {
      await addEmployeeByName(name);
      await reloadNamesAndRender();
      showToast('Mitarbeiter hinzugefügt');
    } catch (e) {
      showToast('Fehler beim Hinzufügen');
    }
  }

  async function onRemoveEmployee() {
    const name = meSelect?.value;
    if (!name) return;

    const ok = confirm(`Mitarbeiter wirklich entfernen (deaktivieren)?\n\n${name}\n\nHinweis: Daten bleiben erhalten.`);
    if (!ok) return;

    try {
      await deactivateEmployeeByName(name);
      await reloadNamesAndRender();

      // falls der gerade ausgewählte Name deaktiviert wurde, Dropdown neu setzen
      if (meSelect.options.length > 0) meSelect.value = meSelect.options[0].value;

      showToast('Mitarbeiter entfernt (deaktiviert)');
    } catch (e) {
      showToast('Fehler beim Entfernen');
    }
  }

  // -------------------------------
  // Dropdown "Ich bin" neu füllen (wird nach Namen-Load aufgerufen)
  function fillMeSelect(namesArr) {
    if (!meSelect) return;
    const prev = meSelect.value;

    meSelect.innerHTML = '';
    namesArr.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      meSelect.appendChild(opt);
    });

    // versuche alte Auswahl zu behalten
    const stillExists = namesArr.includes(prev);
    if (stillExists) meSelect.value = prev;
    else if (namesArr.length > 0) meSelect.value = namesArr[0];
  }

  // -------------------------------
  // Daten laden und rendern
  async function reloadNamesAndRender() {
    // Namen laden (Supabase -> sonst Fallback)
    try {
      const fromDb = await loadEmployees();
      // Wenn DB leer ist, trotzdem fallback-extra anzeigen (damit Plan nicht "leer" wirkt)
      currentNames = (fromDb && fromDb.length > 0) ? fromDb : [...FALLBACK_NAMES, ...FALLBACK_EXTRA_NAMES];
    } catch (e) {
      currentNames = [...FALLBACK_NAMES, ...FALLBACK_EXTRA_NAMES];
    }

    // Duplikate entfernen, Reihenfolge behalten
    const seen = new Set();
    currentNames = currentNames.filter(n => {
      const k = (n || '').trim();
      if (!k) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    fillMeSelect(currentNames);
    await loadAndRender();
  }

  async function loadAndRender() {
    refreshSelects();

    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;

    // Monatseinträge laden
    let entries = [];
    try {
      entries = await window.loadMonth({ year: y, month: m });
    } catch (e) {
      entries = [];
    }

    const valueMap = {};
    entries.forEach(rec => {
      if (rec && rec.name && typeof rec.day !== 'undefined') {
        valueMap[`${rec.name}|${rec.day}`] = rec.value;
      }
    });

    // Overrides laden
    let overrides = [];
    try {
      overrides = await window.loadOverrides({ year: y, month: m });
    } catch (e) {
      overrides = [];
    }

    overrideMap = {};
    overrides.forEach(r => {
      overrideMap[`${r.name}|${r.day}`] = r.yellow_override;
    });

    // Bemerkungen laden
    try {
      const remarks = await window.loadRemarks({ year: y, month: m });
      remarksTA.value = remarks || '';
    } catch (e) {
      remarksTA.value = '';
    }

    // Rendering: NUR eine Tabelle
    renderGrid(currentNames, gridMain, valueMap);

    // alte zweite Tabelle ausblenden, falls im HTML vorhanden
    if (gridExtra) gridExtra.innerHTML = '';
  }

  // -------------------------------
  // Rendering einer Tabelle
  function renderGrid(namesArr, container, valueMap) {
    if (!container) return;

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
      html += '<tr>';
      html += `<td class="name">${name}</td>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(y, mIdx, d);
        let classes = [];

        // Grundfarbe Gelb (2‑Tage‑Rhythmus) – wie bisher: Bullen Kate ohne Standard-Gelb
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

        // Codes (farbliche Klassen wie bisher)
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
      cell.addEventListener('mouseup', () => {
        isPainting = false;
      });
      cell.addEventListener('click', () => {
        handleCell(cell);
      });
    });
  }

  // global: wenn Maus irgendwo losgelassen wird -> nicht weiter malen
  document.addEventListener('mouseup', () => { isPainting = false; });

  // -------------------------------
  // Behandlung einer einzelnen Zelle beim Bemalen
  function handleCell(cell) {
    const name = cell.dataset.name;
    const day  = parseInt(cell.dataset.day, 10);
    const myName = meSelect?.value;

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

    // Bestimme zu speichernden Wert
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

  // Aktualisiere Zellenwert und Code-Klasse
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
    else if (value === 'U2') cell.classList.add('code-u2');
    else if (value === 'S') cell.classList.add('code-s');
    else if (value === 'F') cell.classList.add('code-f');
    else if (value === 'N') cell.classList.add('code-n');
    else if (value === 'GV') cell.classList.add('code-GV');
    else if (value === 'LG') cell.classList.add('code-LG');
    else if (value === 'PE') cell.classList.add('code-PE');
    else if (value === '★') cell.classList.add('code-STAR');

    if (value === '🍺' || value === '🎉' || value === '★') cell.textContent = value;
    else cell.textContent = value || '';
  }

  // Aktualisiere Klassen bei Override (Gelb/Weiß)
  function updateOverrideClass(cell, overrideVal) {
    const y = currentDate.getFullYear();
    const mIdx = currentDate.getMonth();
    const d  = parseInt(cell.dataset.day, 10);
    const dt = new Date(y, mIdx, d);

    let classes = [];
    // Grund-Gelb: nur wenn nicht Bullen Kate
    if (cell.dataset.name !== 'Bullen Kate' && isYellowDay(dt)) classes.push('yellow');

    if (overrideVal === 1) {
      if (!classes.includes('yellow')) classes.push('yellow');
      classes.push('force-yellow');
    } else if (overrideVal === -1) {
      classes = classes.filter(c => c !== 'yellow');
      classes.push('no-yellow');
    }

    // Erhalte bestehende Code-Klassen
    const oldCode = Array.from(cell.classList).filter(c => c.startsWith('code-'));
    classes = classes.concat(oldCode);

    cell.className = `editable ${classes.join(' ')}`;
  }

  // Im Bemerkungsfeld nichts abfangen
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === remarksTA) return;
  });

  // -------------------------------
  // Start
  refreshSelects();
  ensureEmployeeControls();
  reloadNamesAndRender();
});
