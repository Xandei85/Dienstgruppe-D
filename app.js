
// Hauptskript für den Schichtplan (Single-Table + Mitarbeiter add/remove) - robust build
// Ziel: Optik/Design unverändert lassen (gelbe Spalten, Kopf-Farben etc.)

// Dieses Skript fasst das Grid in eine Tabelle zusammen und fügt eine einfache
// Mitarbeiterverwaltung hinzu. Die Namen werden aus Supabase geladen (Tabelle
// `mitarbeiter`). Ist Supabase nicht verfügbar, fallen wir auf die Namen aus
// `APP_CONFIG.NAMES` und zusätzliche Standard-Namen zurück. Hinzufügen und
// Entfernen von Mitarbeitern wirkt sich nur auf das Flag `aktiv` aus – Daten
// aus den anderen Tabellen bleiben bestehen.

document.addEventListener('DOMContentLoaded', () => {
  try {
    const CFG = window.APP_CONFIG || {};

    // ---- Helpers: robust element lookup (falls mal IDs im HTML abweichen)
    const $id = (id) => document.getElementById(id);
    const gridMain = $id('gridMain') || $id('grid') || $id('gridContainer') || document.querySelector('[data-grid="main"]');
    const gridExtra = $id('gridExtra'); // optional (alte zweite Tabelle)
    const legendTop = $id('legendTop') || document.querySelector('.legend') || document.querySelector('[data-legend="top"]');
    const meSelect = $id('meSelect');
    const monthSelect = $id('monthSelect');
    const yearSelect = $id('yearSelect');
    const prevBtn = $id('prevBtn');
    const nextBtn = $id('nextBtn');
    const remarksTA = $id('remarksTA');
    const saveRemarksBtn = $id('saveRemarksBtn');
    const toastEl = $id('toast') || (() => {
      // Fallback: Toast anlegen, falls nicht vorhanden
      const el = document.createElement('div');
      el.id = 'toast';
      el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;background:#333;color:#fff;padding:10px 12px;border-radius:8px;opacity:0;transition:opacity .2s;';
      document.body.appendChild(el);
      return el;
    })();

    // Hilfsfunktion Toast
    let toastTimeout = null;
    function showToast(msg) {
      try { console.log('[DG-D]', msg); } catch {}
      toastEl.textContent = msg;
      toastEl.style.opacity = '1';
      clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => { toastEl.style.opacity = '0'; }, 2200);
    }

    // ---- Konfiguration / Zustand
    const BASE_NAMES = Array.isArray(CFG.NAMES) ? CFG.NAMES.slice() : [];
    const YEAR_START = CFG.YEAR_START || new Date().getFullYear();
    const YEAR_END = CFG.YEAR_END || YEAR_START;
    const YEAR_MAX = Math.max(YEAR_END, 2030);
    const START_PATTERN_DATE = CFG.START_PATTERN_DATE ? new Date(CFG.START_PATTERN_DATE) : new Date();
    const PATTERN_SHIFT = CFG.PATTERN_SHIFT || 0;

    // Standardmäßige Zusatznamen, falls DB leer ist oder kein Feature verwendet wird
    const DEFAULT_EXTRA = ['Praktikant', 'Bullen Kate'];

    // Aktuelle Namensliste (aus DB)
    let currentNames = [];

    // Datum-State
    const currentDate = new Date();
    currentDate.setFullYear(YEAR_START);
    currentDate.setMonth(0);

    // Painting-State
    let selectedCode = null;
    let isPainting = false;

    // Overrides je Monat
    let overrideMap = {};
    const holidayCache = {};

    // -------------------------------
    // Ferien Bayern (grobe Annäherung)
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

    // Gelb/Weiß Rhythmus (2-2 Pattern)
    function daysBetween(date1, date2) {
      const t1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
      const t2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
      return Math.floor((t2 - t1) / (24*60*60*1000));
    }
    function isYellowDay(date) {
      const start = new Date(START_PATTERN_DATE);
      const diff = daysBetween(start, date) + (PATTERN_SHIFT || 0);
      const mod = ((diff % 4) + 4) % 4;
      return mod === 0 || mod === 1;
    }

    // Osterberechnung und Feiertage
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
      const toStr = (d) => `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
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

    // Dropdowns füllen
    function refreshSelects() {
      monthSelect.value = currentDate.getMonth();
      yearSelect.value = currentDate.getFullYear();
    }
    for (let i = 0; i < 12; i++) {
      const dt = new Date(2023, i, 1);
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = dt.toLocaleString('de', { month: 'long' });
      monthSelect.appendChild(opt);
    }
    for (let y = YEAR_START; y <= YEAR_MAX; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }

    // Legende (Codes + Farben)
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
          document.querySelectorAll('.legend-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
          });
          showToast('Modus: ' + label + (meSelect.value ? ` (nur Zeile: ${meSelect.value})` : ''));
        });
        container.appendChild(btn);
      });
    }
    buildLegend(legendTop);

    // Supabase Client beziehen (verschiedene Varianten prüfen)
    function getSupabaseClient() {
      return window.supabaseClient || window.supabase || window._supabase || null;
    }

    // Mitarbeiter aus DB laden (aktiv = true). Fallback: BASE_NAMES + DEFAULT_EXTRA
    async function loadActiveEmployees() {
      const client = getSupabaseClient();
      if (!client || !client.from) {
        return uniq([...BASE_NAMES, ...DEFAULT_EXTRA]);
      }
      try {
        const { data, error } = await client
          .from('mitarbeiter')
          .select('id, name, aktiv')
          .order('created_at', { ascending: true });
        if (error) throw error;
        const active = (data || []).filter(r => r && r.name && (r.aktiv === true || r.aktiv === 'true')).map(r => r.name);
        const merged = active.length ? active : [...BASE_NAMES, ...DEFAULT_EXTRA];
        return uniq(merged);
      } catch (e) {
        console.error('[DG-D] loadActiveEmployees failed', e);
        return uniq([...BASE_NAMES, ...DEFAULT_EXTRA]);
      }
    }

    function uniq(arr) {
      const seen = new Set();
      const out = [];
      (arr || []).forEach(v => {
        const s = String(v || '').trim();
        if (!s) return;
        if (seen.has(s)) return;
        seen.add(s);
        out.push(s);
      });
      return out;
    }

    // MeSelect (Dropdown) neu aufbauen
    function rebuildMeSelect(namesArr) {
      const prev = meSelect.value;
      meSelect.innerHTML = '';
      namesArr.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        meSelect.appendChild(opt);
      });
      if (prev && namesArr.includes(prev)) meSelect.value = prev;
      else if (namesArr.length) meSelect.value = namesArr[0];
    }

    // Laden & Rendern eines Monats
    async function loadAndRender() {
      refreshSelects();
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth() + 1;
      // 1) Namen
      currentNames = await loadActiveEmployees();
      rebuildMeSelect(currentNames);
      // 2) Einträge
      let entries = [];
      try {
        entries = await window.loadMonth({ year: y, month: m });
      } catch (e) {
        entries = [];
      }
      const valueMap = {};
      (entries || []).forEach(rec => {
        if (rec && rec.name && typeof rec.day !== 'undefined') valueMap[`${rec.name}|${rec.day}`] = rec.value;
      });
      // 3) Overrides
      let overrides = [];
      try {
        overrides = await window.loadOverrides({ year: y, month: m });
      } catch (e) {
        overrides = [];
      }
      overrideMap = {};
      (overrides || []).forEach(r => {
        overrideMap[`${r.name}|${r.day}`] = r.yellow_override;
      });
      // 4) Bemerkungen
      try {
        const remarks = await window.loadRemarks({ year: y, month: m });
        remarksTA.value = remarks || '';
      } catch (e) {
        remarksTA.value = '';
      }
      // 5) Render Grid
      renderGrid(currentNames, gridMain, valueMap);
      if (gridExtra) gridExtra.innerHTML = '';
    }

    // Render-Funktion für die Tabelle
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
        html += `<td class="name name-click" data-name="${name}">${name}</td>`;
        for (let d = 1; d <= daysInMonth; d++) {
          const dt = new Date(y, mIdx, d);
          let classes = [];
          // Gelb-Grundfarbe, außer bei Bullen Kate
          if (name !== 'Bullen Kate' && isYellowDay(dt)) classes.push('yellow');
          // Overrides
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
              case 'U': case 'S': case 'F': case 'N': codeClass = 'code-U'; break;
              case 'U2': codeClass = 'code-u2'; break;
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
      // Klick auf Namen -> Dropdown setzen
      container.querySelectorAll('td.name-click').forEach(td => {
        td.addEventListener('click', () => {
          const n = td.dataset.name;
          if (n) {
            meSelect.value = n;
            showToast('Ausgewählt: ' + n);
          }
        });
      });
      // Eventhandler für die Zellen
      container.querySelectorAll('td.editable').forEach(cell => {
        cell.addEventListener('mousedown', e => {
          if (e.button !== 0) return;
          isPainting = true;
          handleCell(cell);
        });
        cell.addEventListener('mouseenter', () => { if (isPainting) handleCell(cell); });
        cell.addEventListener('mouseup', () => { isPainting = false; });
        cell.addEventListener('click', () => { handleCell(cell); });
      });
    }

    // Aktualisierungsklassen bei Overrides
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

    // Zellenwert aktualisieren
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

    // Zellen‑Handler
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
      // Gelb/Weiß Overrides
      if (selectedCode === 'W2Y' || selectedCode === 'Y2W') {
        const ov = selectedCode === 'W2Y' ? 1 : -1;
        overrideMap[`${name}|${day}`] = ov;
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth() + 1;
        window.saveOverride({ year: y, month: m, day, name, yellow_override: ov })
          .catch(e => console.error('[DG-D] saveOverride failed', e));
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
        .catch(e => console.error('[DG-D] saveCell failed', e));
      updateCellValue(cell, valueToSave);
    }

    // Navigation: Monat/Jahr
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
        .catch(e => { console.error('[DG-D] saveRemarks failed', e); showToast('Fehler beim Speichern'); });
    });

    // Mitarbeiterbuttons einfügen (unterhalb Bemerkungen)
    function ensureEmployeeButtons() {
      let container = $id('employeeControls');
      if (!container) {
        container = document.createElement('div');
        container.id = 'employeeControls';
        container.style.marginTop = '10px';
        saveRemarksBtn.insertAdjacentElement('afterend', container);
      }
      container.innerHTML = `
        <button id="btnAddEmployee" class="btn-primary" type="button">Mitarbeiter hinzufügen</button>
        <button id="btnRemoveEmployee" class="btn-danger" type="button" style="margin-left:10px;">Mitarbeiter entfernen</button>
      `;
      const btnAdd = $id('btnAddEmployee');
      const btnRem = $id('btnRemoveEmployee');
      btnAdd.addEventListener('click', async () => {
        try {
          const name = (prompt('Neuen Mitarbeiter hinzufügen – Name eingeben:') || '').trim();
          if (!name) return;
          await upsertEmployeeActive(name, true);
          showToast('Hinzugefügt: ' + name);
          await loadAndRender();
        } catch (e) {
          console.error('[DG-D] add employee failed', e);
          showToast('Fehler beim Hinzufügen');
        }
      });
      btnRem.addEventListener('click', async () => {
        try {
          const target = meSelect.value;
          if (!target) return;
          const ok = confirm(`Mitarbeiter wirklich entfernen (deaktivieren)?\n\n${target}\n\nHinweis: Daten bleiben erhalten.`);
          if (!ok) return;
          await upsertEmployeeActive(target, false);
          showToast('Entfernt: ' + target);
          await loadAndRender();
        } catch (e) {
          console.error('[DG-D] remove employee failed', e);
          showToast('Fehler beim Entfernen');
        }
      });
    }

    // Mitarbeiter Upsert (Insert/Update aktiv)
    async function upsertEmployeeActive(name, aktiv) {
      const client = getSupabaseClient();
      if (!client || !client.from) throw new Error('Supabase-Client nicht verfügbar');
      const { data: existing, error: selErr } = await client
        .from('mitarbeiter')
        .select('id, name')
        .match({ name })
        .limit(1);
      if (selErr) throw selErr;
      if (existing && existing.length) {
        const { error: updErr } = await client
          .from('mitarbeiter')
          .update({ aktiv })
          .match({ id: existing[0].id });
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await client
          .from('mitarbeiter')
          .insert([{ name, aktiv }]);
        if (insErr) throw insErr;
      }
    }

    // Initialisierung
    refreshSelects();
    ensureEmployeeButtons();
    loadAndRender();

  } catch (e) {
    console.error('[DG-D] Fatal init error', e);
    alert('Schwerer Fehler in app.js – bitte Konsole öffnen (F12) und Screenshot schicken.');
  }
});

