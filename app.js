// Dienstgruppe D – saubere finale Version der app.js
// Diese Version nutzt für die Mitarbeiterverwaltung ausschließlich die REST-API von Supabase.
// Sie enthält keine doppelten Funktionsdefinitionen und verzichtet auf den nicht vorhandenen Supabase-Client.

document.addEventListener("DOMContentLoaded", () => {
  const CFG = window.APP_CONFIG || {};

  // -------- DOM Helper --------
  const $id = (id) => document.getElementById(id);

  const gridMain = $id("gridMain");
  const gridExtra = $id("gridExtra"); // optional
  const legendTop = $id("legendTop");
  const meSelect = $id("meSelect");
  const monthSelect = $id("monthSelect");
  const yearSelect = $id("yearSelect");
  const prevBtn = $id("prevBtn");
  const nextBtn = $id("nextBtn");
  const remarksTA = $id("remarksTA");
  const saveRemarksBtn = $id("saveRemarksBtn");

  // Mitarbeiter-Buttons (falls nicht im HTML: anlegen)
  let addEmployeeBtn = $id("addEmployeeBtn");
  let removeEmployeeBtn = $id("removeEmployeeBtn");
  if (!addEmployeeBtn || !removeEmployeeBtn) {
    const wrap = document.createElement("div");
    wrap.style.marginTop = "10px";
    addEmployeeBtn = document.createElement("button");
    addEmployeeBtn.id = "addEmployeeBtn";
    addEmployeeBtn.textContent = "Mitarbeiter hinzufügen";
    removeEmployeeBtn = document.createElement("button");
    removeEmployeeBtn.id = "removeEmployeeBtn";
    removeEmployeeBtn.textContent = "Mitarbeiter entfernen";
    wrap.appendChild(addEmployeeBtn);
    wrap.appendChild(removeEmployeeBtn);
    (gridExtra || document.body).appendChild(wrap);
  }

  // Toast
  const toastEl =
    $id("toast") ||
    (() => {
      const el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
      return el;
    })();

  let toastTimeout = null;
  function showToast(msg) {
    try {
      console.log("[DG-D]", msg);
    } catch {}
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => (toastEl.style.opacity = "0"), 2200);
  }

  // -------- State / Config --------
  const BASE_NAMES = Array.isArray(CFG.NAMES) ? CFG.NAMES.slice() : [];
  const DEFAULT_EXTRA = ["Praktikant", "Glowczewski", "Kathi", "Bullen Kate"];

  const YEAR_START = CFG.YEAR_START || new Date().getFullYear();
  const YEAR_END = CFG.YEAR_END || YEAR_START;
  const YEAR_MAX = Math.max(YEAR_END, 2030);

  const START_PATTERN_DATE = CFG.START_PATTERN_DATE
    ? new Date(CFG.START_PATTERN_DATE)
    : new Date(YEAR_START, 0, 2);
  const PATTERN_SHIFT = CFG.PATTERN_SHIFT || 0;

  const currentDate = new Date(YEAR_START, 0, 1);

  let currentNames = [];
  let selectedCode = null;
  let overrideMap = {}; // `${name}|${day}` => +1 / -1
  const holidayCache = {};

  // -------- Ferien / Feiertage / Gelbpattern --------
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

  function daysBetween(date1, date2) {
    const t1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const t2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.floor((t2 - t1) / 86400000);
  }

  function isYellowDay(date) {
    const start = new Date(START_PATTERN_DATE);
    const diff = daysBetween(start, date) + PATTERN_SHIFT;
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
    const toStr = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

    list.push(`${year}-1-1`);
    list.push(`${year}-1-6`);

    const gf = new Date(easter);
    gf.setDate(easter.getDate() - 2);
    list.push(toStr(gf));
    const em = new Date(easter);
    em.setDate(easter.getDate() + 1);
    list.push(toStr(em));

    list.push(`${year}-5-1`);

    const asc = new Date(easter);
    asc.setDate(easter.getDate() + 39);
    list.push(toStr(asc));
    const pm = new Date(easter);
    pm.setDate(easter.getDate() + 50);
    list.push(toStr(pm));
    const cc = new Date(easter);
    cc.setDate(easter.getDate() + 60);
    list.push(toStr(cc));

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

  function uniq(arr) {
    const s = new Set();
    const out = [];
    (arr || []).forEach((v) => {
      const t = String(v || "").trim();
      if (!t || s.has(t)) return;
      s.add(t);
      out.push(t);
    });
    return out;
  }

  // ============================
  // Supabase REST (ohne supabase-js) – nur für Mitarbeiterverwaltung
  // ============================
  function sbRestUrl(path) {
    return `${String(SUPABASE_URL).replace(/\/$/, "")}${path}`;
  }

  async function sbFetch(path, { method = "GET", body = null, headers = {} } = {}) {
    const res = await fetch(sbRestUrl(path), {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : null,
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      throw new Error(`Supabase REST Fehler ${res.status}: ${text}`);
    }
    return data;
  }

  // Mitarbeiter aus DB (nur aktiv=true) laden
  async function loadActiveEmployees() {
    try {
      const rows = await sbFetch(
        `/rest/v1/mitarbeiter?select=name,aktiv&aktiv=eq.true&order=name.asc`
      );

      const active = (rows || [])
        .map((r) => (r?.name || "").trim())
        .filter(Boolean);

      if (active.length) return uniq(active);
      return uniq([...BASE_NAMES, ...DEFAULT_EXTRA]);
    } catch (e) {
      console.error("[DG-D] loadActiveEmployees REST error:", e);
      return uniq([...BASE_NAMES, ...DEFAULT_EXTRA]);
    }
  }

  // Mitarbeiter upsert (aktiv true/false)
  async function upsertEmployeeActive(name, aktiv) {
    const cleanName = (name || "").trim();
    if (!cleanName) return;

    const qName = encodeURIComponent(cleanName);
    const found = await sbFetch(
      `/rest/v1/mitarbeiter?select=id,name&name=eq.${qName}&limit=1`
    );

    if (Array.isArray(found) && found.length) {
      const id = found[0].id;
      const qId = encodeURIComponent(id);
      await sbFetch(`/rest/v1/mitarbeiter?id=eq.${qId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { aktiv: !!aktiv },
      });
    } else {
      await sbFetch(`/rest/v1/mitarbeiter`, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: { name: cleanName, aktiv: !!aktiv },
      });
    }
  }

  async function addEmployee() {
    try {
      const name = prompt("Name des neuen Mitarbeiters:");
      if (!name) return;
      await upsertEmployeeActive(name, true);
      showToast("Mitarbeiter hinzugefügt: " + name);
      await loadAndRender();
    } catch (e) {
      console.error(e);
      showToast("Fehler beim Hinzufügen");
    }
  }

  async function removeEmployee() {
    try {
      const name = meSelect.value;
      if (!name) return;
      if (!confirm(`Mitarbeiter wirklich deaktivieren?\n\n${name}`)) return;
      await upsertEmployeeActive(name, false);
      showToast("Mitarbeiter deaktiviert: " + name);
      await loadAndRender();
    } catch (e) {
      console.error(e);
      showToast("Fehler beim Entfernen");
    }
  }

  // -------- UI: Month/Year Selects --------
  function buildMonthYearSelects() {
    monthSelect.innerHTML = "";
    yearSelect.innerHTML = "";

    for (let i = 0; i < 12; i++) {
      const dt = new Date(2023, i, 1);
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = dt.toLocaleString("de", { month: "long" });
      monthSelect.appendChild(opt);
    }
    for (let y = YEAR_START; y <= YEAR_MAX; y++) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }
  }

  function refreshSelects() {
    monthSelect.value = String(currentDate.getMonth());
    yearSelect.value = String(currentDate.getFullYear());
  }

  function rebuildMeSelect(namesArr) {
    const prev = meSelect.value;
    meSelect.innerHTML = "";
    namesArr.forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      meSelect.appendChild(opt);
    });
    if (prev && namesArr.includes(prev)) meSelect.value = prev;
    else if (namesArr.length) meSelect.value = namesArr[0];
  }

  // -------- Legend / Codes --------
  const codes = [
    { code: "N", label: "N" },
    { code: "F", label: "F" },
    { code: "S", label: "S" },
    { code: "U2", label: "U2" },
    { code: "U", label: "U" },
    { code: "AA", label: "AA" },
    { code: "AZA", label: "AZA" },
    { code: "AZA6", label: "AZA6" },
    { code: "AZA12", label: "AZA12" },
    { code: "W2Y", label: "Weiß→Gelb" },
    { code: "Y2W", label: "Gelb→Weiß" },
    { code: "BEER", label: "🍺" },
    { code: "PARTY", label: "🥳" },
    { code: "GV", label: "GV" },
    { code: "LG", label: "LG" },
    { code: "PE", label: "PE" },
    { code: "STAR", label: "★" },
    { code: "X", label: "X" },
  ];

  function buildLegend() {
    if (!legendTop) return;
    legendTop.innerHTML = "";
    codes.forEach(({ code, label }) => {
      const btn = document.createElement("button");
      btn.className = "legend-btn";
      btn.dataset.code = code;
      btn.textContent = label;
      btn.addEventListener("click", () => {
        selectedCode = code;
        document.querySelectorAll(".legend-btn").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
        showToast(
          "Modus: " + label + (meSelect.value ? ` (nur Zeile: ${meSelect.value})` : "")
        );
      });
      legendTop.appendChild(btn);
    });
  }

  // -------- Render Grid --------
  function getCodeClass(val) {
    switch (val) {
      case "U":
      case "S":
      case "F":
      case "N":
        return "code-U";
      case "U2":
        return "code-u2";
      case "AA":
        return "code-AA";
      case "AZA":
        return "code-AZA";
      case "AZA6":
        return "code-AZA6";
      case "AZA12":
        return "code-AZA12";
      case "GV":
        return "code-GV";
      case "LG":
        return "code-LG";
      case "PE":
        return "code-PE";
      default:
        return "";
    }
  }

  function renderGrid(namesArr, container, valueMap) {
    const y = currentDate.getFullYear();
    const mIdx = currentDate.getMonth();
    const daysInMonth = new Date(y, mIdx + 1, 0).getDate();

    let html = `<table class="grid-table"><thead><tr><th class="name-col">Name</th>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, mIdx, d);
      const wd = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][dt.getDay()];
      const cls = [];
      if (dt.getDay() === 6) cls.push("sat");
      if (dt.getDay() === 0) cls.push("sun");
      if (isHoliday(dt) || isFerien(dt)) cls.push("ferienday");
      html += `<th class="${cls.join(" ")}">${d}<div class="wd">${wd}</div></th>`;
    }
    html += `</tr></thead><tbody>`;

    (namesArr || []).forEach((name) => {
      html += `<tr data-name="${encodeURIComponent(name)}"><td class="name-col name-click">${name}</td>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(y, mIdx, d);
        let classes = ["cell"];
        if (name !== "Bullen Kate" && isYellowDay(dt)) classes.push("yellow");

        const key = `${name}|${d}`;
        if (overrideMap[key] === 1) {
          if (!classes.includes("yellow")) classes.push("yellow");
          classes.push("force-yellow");
        } else if (overrideMap[key] === -1) {
          classes = classes.filter((c) => c !== "yellow");
          classes.push("no-yellow");
        }

        const val = valueMap[key] || "";
        const codeClass = getCodeClass(val);
        if (codeClass) classes.push(codeClass);

        let content = val;
        if (val === "BEER") content = "🍺";
        if (val === "PARTY") content = "🥳";
        if (val === "STAR") content = "★";

        html += `<td class="${classes.join(" ")}" data-day="${d}">${content || ""}</td>`;
      }
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;

    // Click name -> set meSelect
    container.querySelectorAll(".name-click").forEach((el) => {
      el.addEventListener("click", () => {
        const n = el.textContent.trim();
        if (n) meSelect.value = n;
      });
    });

    // Cell interactions
    container.querySelectorAll("td.cell").forEach((td) => {
      td.addEventListener("mousedown", async (ev) => {
        ev.preventDefault();
        if (!selectedCode) return;

        const tr = td.closest("tr");
        const name = decodeURIComponent(tr.dataset.name || "");
        const day = parseInt(td.dataset.day, 10);

        // nur eigene Zeile
        if (meSelect.value && name !== meSelect.value) {
          showToast("Nur in deiner Zeile eintragbar");
          return;
        }

        await applyCode(name, day, selectedCode);
      });
    });
  }

  async function applyCode(name, day, code) {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    const key = `${name}|${day}`;

    try {
      if (code === "W2Y") {
        overrideMap[key] = 1;
        if (window.saveOverride) await window.saveOverride({ year: y, month: m, name, day, yellow_override: 1 });
      } else if (code === "Y2W") {
        overrideMap[key] = -1;
        if (window.saveOverride) await window.saveOverride({ year: y, month: m, name, day, yellow_override: -1 });
      } else if (code === "X") {
        if (window.saveCell) await window.saveCell({ year: y, month: m, name, day, value: "" });
      } else {
        if (window.saveCell) await window.saveCell({ year: y, month: m, name, day, value: code });
      }
      await loadAndRender();
    } catch (e) {
      console.error(e);
      showToast("Fehler beim Speichern");
    }
  }

  // -------- Load & Render --------
  async function loadAndRender() {
    refreshSelects();

    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;

    // 1) Namen
    currentNames = await loadActiveEmployees();
    rebuildMeSelect(currentNames);

    // 2) Werte (Dienstplan)
    let entries = [];
    try {
      if (window.loadMonth) entries = await window.loadMonth({ year: y, month: m });
    } catch (e) {
      entries = [];
    }

    const valueMap = {};
    (entries || []).forEach((rec) => {
      if (rec && rec.name && typeof rec.day !== "undefined") {
        valueMap[`${rec.name}|${rec.day}`] = rec.value;
      }
    });

    // 3) Overrides
    let overrides = [];
    try {
      if (window.loadOverrides) overrides = await window.loadOverrides({ year: y, month: m });
    } catch (e) {
      overrides = [];
    }

    overrideMap = {};
    (overrides || []).forEach((r) => {
      if (!r) return;
      overrideMap[`${r.name}|${r.day}`] = r.yellow_override;
    });

    // 4) Bemerkungen
    try {
      if (window.loadRemarks) {
        const txt = await window.loadRemarks({ year: y, month: m });
        remarksTA.value = txt || "";
      }
    } catch (e) {
      remarksTA.value = "";
    }

    // 5) Render
    renderGrid(currentNames, gridMain, valueMap);
    if (gridExtra) gridExtra.innerHTML = "";
  }

  // -------- Events --------
  buildMonthYearSelects();
  buildLegend();

  prevBtn.addEventListener("click", async () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    await loadAndRender();
  });
  nextBtn.addEventListener("click", async () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    await loadAndRender();
  });
  monthSelect.addEventListener("change", async () => {
    currentDate.setMonth(parseInt(monthSelect.value, 10));
    await loadAndRender();
  });
  yearSelect.addEventListener("change", async () => {
    currentDate.setFullYear(parseInt(yearSelect.value, 10));
    await loadAndRender();
  });

  saveRemarksBtn.addEventListener("click", async () => {
    try {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth() + 1;
      const txt = remarksTA.value || "";
      if (window.saveRemarks) await window.saveRemarks({ year: y, month: m, text: txt });
      showToast("Bemerkungen gespeichert");
    } catch (e) {
      console.error(e);
      showToast("Fehler beim Speichern");
    }
  });

  addEmployeeBtn.addEventListener("click", addEmployee);
  removeEmployeeBtn.addEventListener("click", removeEmployee);

  // Start
  loadAndRender().catch((e) => {
    console.error(e);
    showToast("Fehler beim Laden");
  });
});
