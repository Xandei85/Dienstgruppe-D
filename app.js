// app.js — saubere Version mit U2 / S / F / N und stabilem Codes-Array
// Kompatibel zu eurer vorhandenen supabaseClient.js (window.*-Funktionen)

(function () {
  "use strict";

  // ---------- Konfiguration aus config.js ----------
  const CFG = (window.APP_CONFIG || {});
  const NAMES = Array.isArray(CFG.NAMES) ? CFG.NAMES.slice() : [];

  const YEAR_START = Number(CFG.YEAR_START || new Date().getFullYear());
  const YEAR_END   = Number(CFG.YEAR_END   || YEAR_START);
  const YEAR_MAX   = Math.max(YEAR_END, new Date().getFullYear() + 5);

  const PATTERN_SHIFT = Number(CFG.PATTERN_SHIFT || 0);

  // ---------- DOM ----------
  let meSelect, monthSelect, yearSelect, prevBtn, nextBtn;
  let legendTop, gridMain, gridExtra, remarksTA, saveRemarksBtn, toastEl;

  // aktuell gewählte Werte
  let currentDate = new Date();
  currentDate.setDate(1); // auf Monatsersten

  let selectedCode = "";  // aus Legende

  // ---------- Codes / Legende ----------
  // label = Button-Text, code = gespeicherter Wert
  const codes = [
    { code: "U",     label: "U"     },
    { code: "AA",    label: "AA"    },
    { code: "AZA",   label: "AZA"   },
    { code: "AZA6",  label: "AZA6"  },
    { code: "AZA12", label: "AZA12" },

    { code: "W2Y",   label: "Weiß→Gelb" },
    { code: "Y2W",   label: "Gelb→Weiß" },

    { code: "BEER",  label: "🍺" },
    { code: "PARTY", label: "🎉" },

    { code: "GV",    label: "GV"    },
    { code: "LG",    label: "LG"    },
    { code: "PE",    label: "PE"    },
    { code: "STAR",  label: "★"     },
    { code: "X",     label: "X"     },

    // ★ neue Buttons wie gewünscht
    { code: "U2",    label: "U2"    },  // eigener Stil
    { code: "S",     label: "S"     },  // neutral → gelb
    { code: "F",     label: "F"     },  // neutral → gelb
    { code: "N",     label: "N"     }   // neutral → gelb
  ];

  // Zuordnung Code → CSS-Klasse (Farben etc. in style.css definieren)
  function applyCodeClass(cell, value) {
    // erst alle code-*-Klassen weg
    const toRemove = Array.from(cell.classList).filter(c => c.startsWith("code-"));
    toRemove.forEach(c => cell.classList.remove(c));

    // Textinhalt standardmäßig leer
    cell.textContent = "";

    // Mapping
    switch (value) {
      case "U":      cell.classList.add("code-U"); break;
      case "AA":     cell.classList.add("code-AA"); break;
      case "AZA":    cell.classList.add("code-AZA"); break;
      case "AZA6":   cell.classList.add("code-AZA6"); break;
      case "AZA12":  cell.classList.add("code-AZA12"); break;

      case "W2Y":    cell.classList.add("code-W2Y"); break;
      case "Y2W":    cell.classList.add("code-Y2W"); break;

      case "GV":     cell.classList.add("code-GV"); break;
      case "LG":     cell.classList.add("code-LG"); break;
      case "PE":     cell.classList.add("code-PE"); break;
      case "STAR":   cell.classList.add("code-STAR"); break;
      case "X":      cell.classList.add("code-X"); break;

      // Emojis als Text
      case "BEER":   cell.textContent = "🍺"; break;
      case "PARTY":  cell.textContent = "🎉"; break;

      // ★ neue Codes
      case "U2":     cell.classList.add("code-U2"); break; // eigene Farbe
      case "S":      cell.classList.add("code-S");  break; // neutral/gelb → CSS
      case "F":      cell.classList.add("code-F");  break;
      case "N":      cell.classList.add("code-N");  break;

      default:
        // leer
        break;
    }
  }

  // ---------- Hilfen ----------
  function ym() {
    return { y: currentDate.getFullYear(), m: currentDate.getMonth() + 1 };
  }
  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 1600);
  }

  // ---------- Legende ----------
  function buildLegend(container) {
    container.innerHTML = "";
    codes.forEach(({ code, label }) => {
      const btn = document.createElement("button");
      btn.className = "legend-btn";
      btn.dataset.code = code;
      btn.textContent = label;
      btn.addEventListener("click", () => {
        selectedCode = code;
        container.querySelectorAll(".legend-btn").forEach(b => b.classList.toggle("active", b === btn));
        showToast(`Modus: ${label}`);
      });
      container.appendChild(btn);
    });
  }

  // ---------- Grid ----------
  function renderGrid(namesArr, container, valueMap) {
    const { y } = ym();
    const m = ym().m;
    const dMax = daysInMonth(y, m);

    let html = "<table class='edittable'><thead><tr><th class='name'>Name</th>";
    for (let d = 1; d <= dMax; d++) {
      const dt = new Date(y, m - 1, d);
      const wd = ["So","Mo","Di","Mi","Do","Fr","Sa"][dt.getDay()];
      html += `<th class="daynum"><span class="d">${d}</span><br><span class="wd">${wd}</span></th>`;
    }
    html += "</tr></thead><tbody>";

    namesArr.forEach(name => {
      html += `<tr><td class="name">${name}</td>`;
      for (let d = 1; d <= dMax; d++) {
        const key = `${name}#${d}`;
        const val = (valueMap[key] || "");
        const cls = [];
        html += `<td class="${cls.join(" ")}" data-name="${name}" data-day="${d}">${""}</td>`;
      }
      html += "</tr>";
    });

    html += "</tbody></table>";
    container.innerHTML = html;

    // Werte anwenden & Interaktion
    container.querySelectorAll("td[data-day]").forEach(cell => {
      const name = cell.dataset.name;
      const day = Number(cell.dataset.day);
      const key = `${name}#${day}`;
      const val = (valueMap[key] || "");
      applyCodeClass(cell, val);

      // malen
      cell.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        paintCell(cell);
      });
      cell.addEventListener("click", () => paintCell(cell));
    });
  }

  async function paintCell(cell) {
    const name = cell.dataset.name;
    const day = Number(cell.dataset.day);
    if (!name || !day) return;

    let valueToSave = selectedCode || "";

    // Farb-Umschalter Weiß↔Gelb (im Kopf markiert, hier nur als Zellcode)
    if (selectedCode === "W2Y" || selectedCode === "Y2W") {
      // Wir speichern den Umschalter als Code; Darstellung ist via CSS-Klasse
      valueToSave = selectedCode;
    }

    try {
      const { y, m } = ym();
      await (window.saveCell ? window.saveCell({ year: y, month: m, day, name, value: valueToSave }) : Promise.resolve());
      applyCodeClass(cell, valueToSave);
    } catch (e) {
      console.error(e);
      showToast("Fehler beim Speichern");
    }
  }

  // ---------- Laden & Rendern ----------
  async function loadAndRender() {
    const { y, m } = ym();
    // Dropdowns synchronisieren
    if (monthSelect) monthSelect.value = String(m);
    if (yearSelect)  yearSelect.value  = String(y);

    let valueMap = {};
    try {
      const entries = (window.loadMonth ? await window.loadMonth({ year: y, month: m }) : []) || [];
      // erwartet: [{day, name, value}, ...]
      entries.forEach(rec => {
        if (!rec || typeof rec.day === "undefined" || !rec.name) return;
        valueMap[`${rec.name}#${rec.day}`] = rec.value || "";
      });
    } catch (e) {
      console.warn("loadMonth fehlgeschlagen", e);
    }

    renderGrid(NAMES, gridMain, valueMap);

    // Bemerkungen laden
    try {
      const r = (window.loadRemarks ? await window.loadRemarks({ year: y, month: m }) : { remarks: "" });
      if (remarksTA && r && typeof r.remarks === "string") remarksTA.value = r.remarks;
    } catch (e) {
      console.warn("loadRemarks fehlgeschlagen", e);
    }
  }

  // ---------- Initialisierung ----------
  window.addEventListener("DOMContentLoaded", () => {
    meSelect        = document.getElementById("meSelect");
    monthSelect     = document.getElementById("monthSelect");
    yearSelect      = document.getElementById("yearSelect");
    prevBtn         = document.getElementById("prevBtn");
    nextBtn         = document.getElementById("nextBtn");
    legendTop       = document.getElementById("legendTop");
    gridMain        = document.getElementById("gridMain");
    gridExtra       = document.getElementById("gridExtra");
    remarksTA       = document.getElementById("remarksTA");
    saveRemarksBtn  = document.getElementById("saveRemarksBtn");
    toastEl         = document.getElementById("toast");

    // Name-Dropdown
    if (meSelect) {
      meSelect.innerHTML = "";
      NAMES.forEach(n => {
        const opt = document.createElement("option");
        opt.value = n;
        opt.textContent = n;
        meSelect.appendChild(opt);
      });
      if (NAMES.length) meSelect.value = NAMES[0];
    }

    // Monat/Jahr
    if (monthSelect) {
      monthSelect.innerHTML = "";
      for (let i = 0; i < 12; i++) {
        const opt = document.createElement("option");
        opt.value = String(i + 1);
        opt.textContent = new Date(2023, i, 1).toLocaleString("de-DE", { month: "long" });
        monthSelect.appendChild(opt);
      }
      monthSelect.addEventListener("change", () => {
        currentDate.setMonth(parseInt(monthSelect.value, 10) - 1);
        loadAndRender();
      });
    }
    if (yearSelect) {
      yearSelect.innerHTML = "";
      for (let y = YEAR_START; y <= YEAR_MAX; y++) {
        const opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = String(y);
        yearSelect.appendChild(opt);
      }
      yearSelect.addEventListener("change", () => {
        currentDate.setFullYear(parseInt(yearSelect.value, 10));
        loadAndRender();
      });
    }

    // Prev/Next
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        const m = currentDate.getMonth();
        if (m === 0) {
          currentDate.setFullYear(currentDate.getFullYear() - 1);
          currentDate.setMonth(11);
        } else {
          currentDate.setMonth(m - 1);
        }
        loadAndRender();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        const m = currentDate.getMonth();
        if (m === 11) {
          currentDate.setFullYear(currentDate.getFullYear() + 1);
          currentDate.setMonth(0);
        } else {
          currentDate.setMonth(m + 1);
        }
        loadAndRender();
      });
    }

    // Legende bauen
    if (legendTop) buildLegend(legendTop);

    // Bemerkungen speichern
    if (saveRemarksBtn && remarksTA) {
      saveRemarksBtn.addEventListener("click", async () => {
        try {
          const { y, m } = ym();
          await (window.saveRemarks ? window.saveRemarks({ year: y, month: m, remarks: remarksTA.value || "" }) : Promise.resolve());
          showToast("Bemerkungen gespeichert");
        } catch (e) {
          console.error(e);
          showToast("Fehler beim Speichern der Bemerkungen");
        }
      });
    }

    // Start
    loadAndRender();
  });

})();
