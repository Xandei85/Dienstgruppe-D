/ Hauptskript für den Schichtplan (v4.6.11) – 1 Tabelle + Mitarbeiter aktiv/deaktiv (Supabase: table "mitarbeiter")
/*
  Ziele:
  - Optik/Design NICHT ändern (Gelb-Muster, Kopf-Farben, etc. bleiben wie bisher)
  - Nur 1 Tabelle (keine zweite "extra"-Tabelle mehr)
  - Mitarbeiter-Liste kommt (wenn Supabase konfiguriert) aus Tabelle "mitarbeiter" (aktiv=true)
  - Buttons:
      "Mitarbeiter hinzufügen" -> per Prompt Name erfassen, in "mitarbeiter" aktiv setzen / anlegen
      "Mitarbeiter entfernen"  -> ausgewählten Namen (Dropdown "Ich bin") in "mitarbeiter" aktiv=false setzen
  - Bessere Fehlermeldungen + console.error, damit Konsole nicht leer bleibt
*/

document.addEventListener('DOMContentLoaded', () => {
  const CFG = window.APP_CONFIG || {};
  const YEAR_START = CFG.YEAR_START || new Date().getFullYear();
  const YEAR_END   = CFG.YEAR_END || YEAR_START;
  const YEAR_MAX   = Math.max(YEAR_END, 2030);
  const START_PATTERN_DATE = CFG.START_PATTERN_DATE ? new Date(CFG.START_PATTERN_DATE) : new Date();
  const PATTERN_SHIFT = CFG.PATTERN_SHIFT || 0;

  // Zustand
  const currentDate = new Date();
  currentDate.setFullYear(YEAR_START);
  currentDate.setMonth(0);

  let selectedCode = null;
  let isPainting = false;
  let overrideMap = {};
  const holidayCache = {};

  // Mitarbeiterliste (dynamisch, aus Supabase oder fallback aus CFG.NAMES)
  let activeNames = Array.isArray(CFG.NAMES) ? [...CFG.NAMES] : [];
  // optional: gespeicherte (alle) Namen, wenn Supabase aktiv ist
  let allNamesCache = [];

  // -------------------------------
  // Ferien (Schulferien) Bayern – grobe Annäherung (wie vorher)
  function isFerien(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (m === 1 && d <= 5) return true;                 // 1.–5. Jan
    if (m === 2 && d >= 16 && d <= 20) return true;     // 16.–20. Feb
    if ((m === 3 && d >= 30) || (m === 4 && d <= 10)) return true; // 30. März – 10. Apr
    if (m === 6 && d >= 2 && d <= 5) return true;       // 2.–5. Jun
    if ((m === 8 && d >= 3) || (m === 9 && d <= 14)) return true;  // 3. Aug – 14. Sep
    if (m === 11 && d >= 2 && d <= 6) return true;      // 2.–6. Nov
    if (m === 12 && d >= 23) return true;               // 23.–31. Dez
    return false;
  }

  // DOM
  const meSelect       = document.getElementById('meSelect');
  const monthSelect    = document.getElementById('monthSelect');
  const yearSelect     = document.getElementById('yearSelect');
  const prevBtn        = document.getElementById('prevBtn');
  const nextBtn        = document.getElementById('nextBtn');
  const legendTop      = document.getElementById('legendTop');
  const gridMain       = document.getElementById('gridMain');
  const gridExtra      = document.getElementById('gridExtra'); // bleibt ggf. im HTML, wird aber nicht mehr genutzt
  const remarksTA      = document.getElementById('remarksTA');
  const saveRemarksBtn = document.getElementById('saveRemarksBtn');
  const toastEl        = document.getElementById('toast');

  // "gridExtra" ausblenden, falls vorhanden (Design bleibt ansonsten unverändert)
  try { if (gridExtra) gridExtra.style.display = 'none'; } catch(_) {}

  // ------------------------------------------------------------
  // Supabase REST Helper (ohne supabase-js Abhängigkeit)
  const SB_URL = CFG.SUPABASE_URL || CFG.SUPABASE_URL?.trim?.();
  const SB_KEY = CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_ANON_KEY?.trim?.();
  const hasSupabase = !!(SB_URL && SB_KEY);

  function sbHeaders(preferReturn=true) {
    const h = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json'
    };
    if (preferReturn) h['Prefer'] = 'return=representation';
    return h;
  }

  async function sbGet(pathAndQuery) {
    const url = SB_URL.replace(/\/$/, '') + '/rest/v1/' + pathAndQuery.replace(/^\//,'');
    const res = await fetch(url, { method:'GET', headers: sbHeaders(false) });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch(_) { data = txt; }
    if (!res.ok) {
      const err = new Error('Supabase GET fehlgeschlagen: ' + res.status);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function sbPatch(pathAndQuery, bodyObj) {
    const url = SB_URL.replace(/\/$/, '') + '/rest/v1/' + pathAndQuery.replace(/^\//,'');
    const res = await fetch(url, { method:'PATCH', headers: sbHeaders(true), body: JSON.stringify(bodyObj) });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch(_) { data = txt; }
    if (!res.ok) {
      const err = new Error('Supabase PATCH fehlgeschlagen: ' + res.status);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function sbPost(pathAndQuery, bodyObj) {
    const url = SB_URL.replace(/\/$/, '') + '/rest/v1/' + pathAndQuery.replace(/^\//,'');
    const res = await fetch(url, { method:'POST', headers: sbHeaders(true), body: JSON.stringify(bodyObj) });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch(_) { data = txt; }
    if (!res.ok) {
      const err = new Error('Supabase POST fehlgeschlagen: ' + res.status);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function loadEmployeesFromSupabase() {
    // nur aktive Mitarbeiter
    // order=created_at.asc sorgt für stabile Reihenfolge (wie eingetragen)
    const rows = await sbGet('mitarbeiter?select=name,aktiv,created_at&aktiv=eq.true&order=created_at.asc');
    activeNames = (rows || []).map(r => r.name).filter(Boolean);
    allNamesCache = activeNames.slice();
    // Fallback, falls (noch) leer
    if (!activeNames.length && Array.isArray(CFG.NAMES) && CFG.NAMES.length) {
      activeNames = [...CFG.NAMES];
    }
  }

  async function setEmployeeActive(name, isActive) {
    // PATCH existing rows by name
    const safe = encodeURIComponent(name);
    const data = await sbPatch(`mitarbeiter?name=eq.${safe}`, { aktiv: !!isActive });
    return data;
  }

  async function ensureEmployeeActive(name) {
    // 1) versuche: aktiv=true setzen (falls existiert)
    try {
      const updated = await setEmployeeActive(name, true);
      // Wenn nichts zurück kam, heißt das oft: kein Match -> dann insert
      if (Array.isArray(updated) && updated.length > 0) return;
    } catch (e) {
      // bei 404/409 etc. weiter probieren (insert)
      console.error(e);
    }
    // 2) insert (neuer Mitarbeiter)
    await sbPost('mitarbeiter', { name, aktiv: true });
  }

  // ------------------------------------------------------------
  // UI: Dropdown füllen (immer nur aktive Namen, aber "Ich bin" ist auch Steuerung für Entfernen)
  function rebuildMeSelect(preserveValue=true) {
    const prev = meSelect.value;
    meSelect.innerHTML = '';
    (activeNames || []).forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      meSelect.appendChild(opt);
    });
    if (preserveValue && prev && activeNames.includes(prev)) {
      meSelect.value = prev;
    } else if (activeNames.length) {
      meSelect.value = activeNames[0];
    }
  }

  // Monatselect
  for (let i = 0; i < 12; i++) {
    const dt = new Date(2023, i, 1);
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = dt.toLocaleString('de', { month:'long' });
    monthSelect.appendChild(opt);
  }

  // Jahrselect
  for (let y = YEAR_START; y <= YEAR_MAX; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }

  // ------------------------------------------------------------
  // Legende
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

  // ------------------------------------------------------------
  // Gelb/Feiertage – unverändert
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
    return holidayCache[y].has(`${y}-${date.getMonth()+1}-${date.getDate()}`);
  }

  // ------------------------------------------------------------
  // Toast
  let toastTimeout = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 2500);
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

  saveRemarksBtn.addEventListener('click', () => {
    const remarks = remarksTA.value || '';
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    window.saveRemarks({ year: y, month: m, remarks })
      .then(() => showToast('Bemerkungen gespeichert'))
      .catch((e) => { console.error(e); showToast('Fehler beim Speichern'); });
  });

  // ------------------------------------------------------------
  // Mitarbeiter Buttons (unten links neben "Bemerkungen speichern")
  function ensureEmployeeButtons() {
    // Wenn schon vorhanden: nichts tun
    if (document.getElementById('addEmpBtn') || document.getElementById('removeEmpBtn')) return;

    const wrap = document.createElement('div');
    wrap.style.marginTop = '8px';
    wrap.style.display = 'flex';
    wrap.style.gap = '10px';
    wrap.style.flexWrap = 'wrap';

    const addBtn = document.createElement('button');
    addBtn.id = 'addEmpBtn';
    addBtn.type = 'button';
    addBtn.textContent = 'Mitarbeiter hinzufügen';
    addBtn.className = 'btn'; // falls CSS existiert; sonst egal

    const removeBtn = document.createElement('button');
    removeBtn.id = 'removeEmpBtn';
    removeBtn.type = 'button';
    removeBtn.textContent = 'Mitarbeiter entfernen';
    removeBtn.className = 'btn';

    addBtn.addEventListener('click', async () => {
      const name = (prompt('Neuen Mitarbeiter eingeben (Name):') || '').trim();
      if (!name) return;
      try {
        if (!hasSupabase) {
          // fallback ohne DB
          if (!activeNames.includes(name)) activeNames.push(name);
          rebuildMeSelect(false);
          loadAndRender();
          showToast('Hinzugefügt (lokal)');
          return;
        }
        await ensureEmployeeActive(name);
        await loadEmployeesFromSupabase();
        rebuildMeSelect(true);
        await loadAndRender();
        showToast('Mitarbeiter hinzugefügt');
      } catch (e) {
        console.error('Add Mitarbeiter Fehler:', e);
        const msg = e?.data?.message || e?.data?.hint || e?.message || 'Fehler';
        showToast('Fehler beim Hinzufügen: ' + msg);
      }
    });

    removeBtn.addEventListener('click', async () => {
      const target = (meSelect.value || '').trim();
      if (!target) return;
      if (!confirm(`Mitarbeiter wirklich entfernen (deaktivieren)?\n\n${target}\n\nHinweis: Daten bleiben erhalten.`)) return;

      try {
        if (!hasSupabase) {
          activeNames = activeNames.filter(n => n !== target);
          rebuildMeSelect(false);
          loadAndRender();
          showToast('Entfernt (lokal)');
          return;
        }
        await setEmployeeActive(target, false);
        await loadEmployeesFromSupabase();
        rebuildMeSelect(false);
        await loadAndRender();
        showToast('Mitarbeiter entfernt');
      } catch (e) {
        console.error('Remove Mitarbeiter Fehler:', e);
        const msg = e?.data?.message || e?.data?.hint || e?.message || 'Fehler';
        showToast('Fehler beim Entfernen: ' + msg);
      }
    });

    wrap.appendChild(addBtn);
    wrap.appendChild(removeBtn);

    // Buttons direkt unter "Bemerkungen speichern" platzieren
    const parent = saveRemarksBtn?.parentElement || saveRemarksBtn;
    if (parent && parent.appendChild) parent.appendChild(wrap);
  }

  // ------------------------------------------------------------
  // Laden + Rendern
  async function loadAndRender() {
    refreshSelects();

    // Mitarbeiter aus DB laden (damit Tabelle wirklich "eine" ist)
    try {
      if (hasSupabase) {
        await loadEmployeesFromSupabase();
      }
    } catch (e) {
      console.error('Load Mitarbeiter Fehler:', e);
      // fallback zu config
      activeNames = Array.isArray(CFG.NAMES) ? [...CFG.NAMES] : activeNames;
    }

    // Dropdown neu (wichtig auch nach Entfernen/Hinzufügen)
    rebuildMeSelect(true);

    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;

    // Zellen laden
    let entries = [];
    try {
      entries = await window.loadMonth({ year: y, month: m });
    } catch (e) {
      console.error('loadMonth Fehler:', e);
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
      console.error('loadOverrides Fehler:', e);
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
      console.error('loadRemarks Fehler:', e);
      remarksTA.value = '';
    }

    // Rendering (1 Tabelle)
    renderGrid(activeNames, gridMain, valueMap);

    // Buttons sicherstellen
    ensureEmployeeButtons();
  }

  // ------------------------------------------------------------
  // Tabelle rendern (Design bleibt)
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

      const clsStr = hclasses.length ? ` class="${hclasses.join(' ')}"` : '';
      html += `<th${clsStr}><span class="daynum">${d}</span><br/><span class="weekday">${wd}</span></th>`;
    }
    html += '</tr></thead><tbody>';

    (namesArr || []).forEach(name => {
      html += '<tr>';
      html += `<td class="name" data-namecell="${name}">${name}</td>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(y, mIdx, d);
        let classes = [];

        // Grundfarbe Gelb (2 Tage Rhythmus) – wie vorher, EXCEPT: "Bullen Kate" bleibt ohne Standard-Gelb
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

    // Name-Zelle klickbar: setzt "Ich bin" auf diese Zeile (damit Entfernen/Eintragen eindeutig ist)
    container.querySelectorAll('td.name[data-namecell]').forEach(td => {
      td.style.cursor = 'pointer';
      td.title = 'Zeile auswählen';
      td.addEventListener('click', () => {
        const n = td.getAttribute('data-namecell');
        if (n && activeNames.includes(n)) {
          meSelect.value = n;
          showToast('Ausgewählt: ' + n);
        }
      });
    });

    // Eventhandler Zellen
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

  // ------------------------------------------------------------
  // Zelle bearbeiten
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

    // Override Gelb/Weiß
    if (selectedCode === 'W2Y' || selectedCode === 'Y2W') {
      const ov = selectedCode === 'W2Y' ? 1 : -1;
      overrideMap[`${name}|${day}`] = ov;
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth() + 1;

      window.saveOverride({ year: y, month: m, day, name, yellow_override: ov })
        .catch((e) => console.error('saveOverride Fehler:', e));

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

    window.saveCell({ year: y, month: m, day, name, value: valueToSave })
      .catch((e) => console.error('saveCell Fehler:', e));

    updateCellValue(cell, valueToSave);
  }

  function updateCellValue(cell, value) {
    cell.classList.remove(
      'code-U','code-AA','code-AZA','code-AZA6','code-AZA12',
      'code-GV','code-LG','code-PE','code-u2','code-s','code-f','code-n'
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

  document.addEventListener('keydown', (e) => {
    if (document.activeElement === remarksTA) return;
  });

  // Start
  refreshSelects();
  // dropdown erst nach Mitarbeiter load
  (async () => {
    try {
      if (hasSupabase) await loadEmployeesFromSupabase();
    } catch(e) {
      console.error('Init Mitarbeiter Fehler:', e);
    }
    rebuildMeSelect(false);
    loadAndRender();
  })();
});

