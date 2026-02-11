// Hauptskript für den Schichtplan (v4.6.10)

document.addEventListener('DOMContentLoaded', () => {
  const CFG = window.APP_CONFIG || {};
  const names = CFG.NAMES || [];
  // Zusätzliche Zeilen (bisher "untere Tabelle")
  const extraNames = ['Praktikant', 'Bullen Kate'];
  // >>> NEU: alles zu einer Namensliste zusammenführen
  const allNames = [...names, ...extraNames];

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
  // Ferien (Schulferien) Bayern
  // Diese Liste ist eine grobe Annäherung der bayerischen Schulferien.
  // Sie markiert zusammenhängende Ferientage, damit der Kopf grün wird.
  function isFerien(date) {
    const y = date.getFullYear();
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
  const gridExtra    = document.getElementById('gridExtra'); // bleibt optional im HTML, wird aber nicht mehr genutzt
  const remarksTA    = document.getElementById('remarksTA');
  const saveRemarksBtn = document.getElementById('saveRemarksBtn');
  const toastEl      = document.getElementById('toast');

  // Fülle Dropdown für Namen (alle Namen, damit auch Praktikant/Bullen Kate bearbeitbar sind)
  allNames.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    meSelect.appendChild(opt);
  });
  // Standardwert (falls vorhanden)
  if (allNames.length > 0) meSelect.value = allNames[0];

  // Fülle Monatselect mit deutschen Monatsnamen
  for (let i = 0; i < 12; i++) {
    const dt = new Date(2023, i, 1);
    const opt = document.createElement('option');
    opt.value = i;
    // localeString mit deutschem Monatsnamen
    opt.textContent = dt.toLocaleString('de', { month:'long' });
    monthSelect.appendChild(opt);
  }

  // Fülle Jahrselect vom Startjahr bis max (2030)
  for (let y = YEAR_START; y <= YEAR_MAX; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }

  // Definition der Legenden-Codes und Beschriftungen
  // Legende mit allen Codes: Grundschichten, Umschalter, Emojis und Sondercodes
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

  // Erstelle Legenden-Buttons in einem Container
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

  // Erzeuge Legende nur einmal (oben).
  buildLegend(legendTop);

  // Hilfsfunktionen für gelbe Tage und Feiertage
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
    // Gibt Liste von "YYYY-M-D"-Strings für bayerische Feiertage zurück
    const easter = calcEaster(year);
    const list = [];
    function toStr(d) { return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }
    list.push(`${year}-1-1`);   // Neujahr
    list.push(`${year}-1-6`);   // Heilige Drei Könige
    // Karfreitag (2 Tage vor Ostersonntag)
    const gf = new Date(easter);
    gf.setDate(easter.getDate() - 2);
    list.push(toStr(gf));
    // Ostermontag (1 Tag nach Ostersonntag)
    const em = new Date(easter);
    em.setDate(easter.getDate() + 1);
    list.push(toStr(em));
    // 1. Mai
    list.push(`${year}-5-1`);
    // Christi Himmelfahrt (39 Tage nach Ostersonntag)
    const asc = new Date(easter);
    asc.setDate(easter.getDate() + 39);
    list.push(toStr(asc));
    // Pfingstmontag (50 Tage nach Ostersonntag)
    const pm = new Date(easter);
    pm.setDate(easter.getDate() + 50);
    list.push(toStr(pm));
    // Fronleichnam (60 Tage nach Ostersonntag)
    const cc = new Date(easter);
    cc.setDate(easter.getDate() + 60);
    list.push(toStr(cc));
    // Mariä Himmelfahrt
    list.push(`${year}-8-15`);
    // Tag der Deutschen Einheit
    list.push(`${year}-10-3`);
    // Allerheiligen
    list.push(`${year}-11-1`);
    // 1. Weihnachtstag
    list.push(`${year}-12-25`);
    // 2. Weihnachtstag
    list.push(`${year}-12-26`);
    return list;
  }
  function isHoliday(date) {
    const y = date.getFullYear();
    if (!holidayCache[y]) {
      const arr = getHolidays(y);
      holidayCache[y] = new Set(arr);
    }
    return holidayCache[y].has(`${y}-${date.getMonth()+1}-${date.getDate()}`);
  }

  // Anzeige von Toast-Nachrichten
  let toastTimeout = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2000);
  }

  // Dropdown-Updates nach Datum ändern
  function refreshSelects() {
    monthSelect.value = currentDate.getMonth();
    yearSelect.value  = currentDate.getFullYear();
  }

  // Event-Handler für Jahr/Monat Navigation
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
      .catch(() => showToast('Fehler beim Speichern der Bemerkungen'));
  });

  // Laden der Daten und Rendering der Tabellen
  async function loadAndRender() {
    refreshSelects();
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    // Lade Einträge für den Monat
    let entries = [];
    try {
      entries = await window.loadMonth({ year: y, month: m });
    } catch (e) {
      entries = [];
    }
    // Mappe Werte nach Name|Tag
    const valueMap = {};
    entries.forEach(rec => {
      if (rec && rec.name && typeof rec.day !== 'undefined') {
        valueMap[`${rec.name}|${rec.day}`] = rec.value;
      }
    });
    // Lade Overrides
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
    // Lade Bemerkungen
    try {
      const remarks = await window.loadRemarks({ year: y, month: m });
      remarksTA.value = remarks || '';
    } catch (e) {
      remarksTA.value = '';
    }

    // >>> NEU: Rendering nur noch EINER Tabelle (alles zusammen)
    renderGrid(allNames, gridMain, valueMap);

    // Optional: zweite Tabelle leeren, falls im HTML noch vorhanden
    if (gridExtra) gridExtra.innerHTML = '';
  }

  // Rendering einer Tabelle (Namen, Container, Wertzuordnung)
  function renderGrid(namesArr, container, valueMap) {
    const y = currentDate.getFullYear();
    const mIdx = currentDate.getMonth();
    const daysInMonth = new Date(y, mIdx + 1, 0).getDate();
    // Kopfzeile
    let html = '<table><thead><tr><th class="name">Name</th>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, mIdx, d);
      const wd = ['So','Mo','Di','Mi','Do','Fr','Sa'][dt.getDay()];
      // Färbe den Kopf: Wochenende vor Ferien (BY) / Feiertag
      const hclasses = [];
      const dow = dt.getDay();
      if (dow === 6) {
        // Samstag
        hclasses.push('sat');
      } else if (dow === 0) {
        // Sonntag
        hclasses.push('sun');
      } else {
        // Ferien oder gesetzlicher Feiertag
        if (isHoliday(dt) || isFerien(dt)) {
          hclasses.push('ferienday');
        }
      }
      const clsStr = hclasses.length > 0 ? ` class="${hclasses.join(' ')}"` : '';
      html += `<th${clsStr}><span class="daynum">${d}</span><br/><span class="weekday">${wd}</span></th>`;
    }
    html += '</tr></thead><tbody>';
    // Zeilen
    namesArr.forEach(name => {
      html += '<tr>';
      html += `<td class="name">${name}</td>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(y, mIdx, d);
        let classes = [];
        // Grundfarbe Gelb (2‑Tage‑Rhythmus)
        // Für die Zeile "Bullen Kate" keine Standard‑Gelbfärbung
        if (name !== 'Bullen Kate' && isYellowDay(dt)) classes.push('yellow');
        // Overrides für Gelb/Weiß
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

  // Behandlung einer einzelnen Zelle beim Bemalen
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
    // Overrides für Gelb/Weiß (schaltet eine Zelle dauerhaft auf Gelb oder Weiß)
    if (selectedCode === 'W2Y' || selectedCode === 'Y2W') {
      const ov = selectedCode === 'W2Y' ? 1 : -1;
      overrideMap[`${name}|${day}`] = ov;
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth() + 1;
      window.saveOverride({ year: y, month: m, day, name, yellow_override: ov })
        .catch(() => {});
      // Zelle neu klassifizieren
      updateOverrideClass(cell, ov);
      return;
    }
    // Bestimme zu speichernden Wert
    let valueToSave;
    if (selectedCode === 'X') {
      valueToSave = '';
    } else if (selectedCode === 'BEER') {
      valueToSave = '🍺';
    } else if (selectedCode === 'PARTY') {
      valueToSave = '🎉';
    } else if (selectedCode === 'STAR') {
      // Speichere ein Stern-Symbol
      valueToSave = '★';
    } else {
      valueToSave = selectedCode;
    }
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    window.saveCell({ year: y, month: m, day, name, value: valueToSave })
      .catch(() => {});
    updateCellValue(cell, valueToSave);
  }

  // Aktualisiere Zellenwert und Code-Klasse
  function updateCellValue(cell, value) {
    cell.classList.remove(
      'code-U','code-AA','code-AZA','code-AZA6','code-AZA12',
      'code-GV','code-LG','code-PE'
    , 'code-u2','code-s','code-f','code-n');
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

    if (value === '🍺' || value === '🎉' || value === '★') {
      cell.textContent = value;
    } else {
      cell.textContent = value || '';
    }
  }

  // Aktualisiere Klassen bei Override (Gelb/Weiß)
  function updateOverrideClass(cell, overrideVal) {
    // Berechne Grundklassen
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
    // Erhalte bestehende Code-Klassen
    const oldCode = Array.from(cell.classList).filter(c => c.startsWith('code-'));
    classes = classes.concat(oldCode);
    cell.className = `editable ${classes.join(' ')}`;
  }

  // Verhindere, dass Rücktaste/Entfernen global verhindert wird, wenn im Textfeld
  document.addEventListener('keydown', (e) => {
    // Im Bemerkungsfeld nichts abfangen
    if (document.activeElement === remarksTA) return;
    // Für Undo/Redo könnte man hier reagieren, lassen wir jedoch offen
  });

  // Start: Auswahl initialisieren und rendern
  refreshSelects();
  loadAndRender();
});
