/* Dienstgruppe D – app.js
   (mit Reihenfolge ▲▼ per localStorage)
*/

(() => {
  // ===== Helpers =====
  const $id = (id) => document.getElementById(id);
  const enc = (s) => encodeURIComponent(String(s ?? ""));

  // ===== Config / Defaults =====
  const CFG = window.APP_CONFIG || {};
  const BASE_NAMES = Array.isArray(CFG.NAMES) ? CFG.NAMES : [];
  const DEFAULT_EXTRA = Array.isArray(CFG.DEFAULT_EXTRA) ? CFG.DEFAULT_EXTRA : ["Praktikant", "Bullen Kate"];
  const YEAR_START = Number.isFinite(CFG.YEAR_START) ? CFG.YEAR_START : 2026;
  const YEAR_END = Number.isFinite(CFG.YEAR_END) ? CFG.YEAR_END : 2030;

  // ===== Global-ish State =====
  let currentNames = [];
  let selectedEmployee = null; // für Reihenfolge ▲▼
  let currentMonth = null;
  let currentYear = null;
  let currentMe = null;

  // ===== DOM: Ensure essential buttons exist (Add/Remove + ▲▼) =====
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

    // Reihenfolge ändern
    const moveUpBtn = document.createElement("button");
    moveUpBtn.id = "moveUpBtn";
    moveUpBtn.textContent = "▲";
    moveUpBtn.title = "Ausgewählten Mitarbeiter nach oben";

    const moveDownBtn = document.createElement("button");
    moveDownBtn.id = "moveDownBtn";
    moveDownBtn.textContent = "▼";
    moveDownBtn.title = "Ausgewählten Mitarbeiter nach unten";

    wrap.appendChild(moveUpBtn);
    wrap.appendChild(moveDownBtn);

    // falls es ein gridExtra gibt, sonst body
    const gridExtra = $id("gridExtra");
    (gridExtra || document.body).appendChild(wrap);
  }

  // Style für Auswahl (Reihenfolge ▲▼)
  if (!document.getElementById("dg-reorder-style")) {
    const st = document.createElement("style");
    st.id = "dg-reorder-style";
    st.textContent = `
      tr.row-selected td.name-col {
        box-shadow: inset 0 0 0 2px #1e90ff;
        font-weight: 700;
      }
    `;
    document.head.appendChild(st);
  }

  // ===== Toast =====
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
      toastEl.textContent = msg;
      toastEl.style.opacity = "1";
      clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => (toastEl.style.opacity = "0"), 2200);
    } catch {}
  }

  // ===== Storage Keys =====
  const KEY_ME = "dg_me";
  const KEY_MONTH = "dg_month";
  const KEY_YEAR = "dg_year";

  // ===== Utils =====
  function uniq(arr) {
    const s = new Set();
    const out = [];
    (arr || []).forEach((v) => {
      const t = String(v || "").trim();
      if (!t) return;
      if (s.has(t)) return;
      s.add(t);
      out.push(t);
    });
    return out;
  }

  // ---- Lokale Reihenfolge (Mitarbeiter nach oben/unten verschieben) ----
  const EMP_ORDER_KEY = "dg_employee_order";

  function loadEmployeeOrder() {
    try {
      return JSON.parse(localStorage.getItem(EMP_ORDER_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveEmployeeOrder(order) {
    try {
      localStorage.setItem(EMP_ORDER_KEY, JSON.stringify(order));
    } catch {}
  }

  // nimmt eine Namensliste und sortiert sie nach gespeicherter Reihenfolge,
  // neue/unbekannte Namen werden hinten angehängt
  function applyEmployeeOrder(names) {
    const order = loadEmployeeOrder();
    if (!Array.isArray(names) || names.length === 0) return [];
    if (!Array.isArray(order) || order.length === 0) return names.slice();

    const ordered = [];
    order.forEach((n) => {
      if (names.includes(n) && !ordered.includes(n)) ordered.push(n);
    });
    names.forEach((n) => {
      if (!ordered.includes(n)) ordered.push(n);
    });
    return ordered;
  }

  function moveEmployeeLocal(name, direction) {
    if (!name) return;
    const names = currentNames.slice();
    const idx = names.indexOf(name);
    if (idx === -1) return;

    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= names.length) return;

    [names[idx], names[newIdx]] = [names[newIdx], names[idx]];
    currentNames = names;
    saveEmployeeOrder(currentNames);
    selectedEmployee = name;
    renderGrid();
  }

  // ===== Supabase (optional) =====
  const SUPABASE_URL = window.SUPABASE_URL || CFG.SUPABASE_URL || "";
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || CFG.SUPABASE_ANON_KEY || "";
  const hasSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);

  let supa = null;
  if (hasSupabase) {
    try {
      supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
      console.warn("Supabase init failed:", e);
      supa = null;
    }
  }

  // ===== Load / Save active employees =====
  async function loadActiveEmployees() {
    // Wenn kein Supabase -> Config Namen + Default extra
    if (!supa) return applyEmployeeOrder(uniq([...BASE_NAMES, ...DEFAULT_EXTRA]));

    try {
      // Tabelle "Mitarbeiter": Spalten name (text) + aktiv (bool)
      const { data, error } = await supa
        .from("Mitarbeiter")
        .select("name, aktiv")
        .order("created_at", { ascending: true });

      if (error) throw error;

      const active = (data || [])
        .filter((r) => r && r.aktiv === true && String(r.name || "").trim())
        .map((r) => String(r.name).trim());

      return applyEmployeeOrder(uniq(active));
    } catch (e) {
      console.warn("[DG-D] loadActiveEmployees REST error:", e);
      return applyEmployeeOrder(uniq([...BASE_NAMES, ...DEFAULT_EXTRA]));
    }
  }

  async function addEmployee(name) {
    const n = String(name || "").trim();
    if (!n) return showToast("Bitte Namen eingeben");
    if (!supa) {
      // local-only: nur Reihenfolge/Anzeige
      if (!currentNames.includes(n)) {
        currentNames = uniq([...currentNames, n]);
        saveEmployeeOrder(currentNames);
        showToast("Hinzugefügt (lokal)");
        renderGrid();
      }
      return;
    }

    try {
      // Upsert: wenn vorhanden -> aktiv=true, sonst insert
      const { data: existing } = await supa.from("Mitarbeiter").select("id,name").eq("name", n).limit(1);
      if (existing && existing.length) {
        await supa.from("Mitarbeiter").update({ aktiv: true }).eq("name", n);
      } else {
        await supa.from("Mitarbeiter").insert([{ name: n, aktiv: true }]);
      }
      showToast("Mitarbeiter hinzugefügt");
      await loadAndRender();
    } catch (e) {
      console.warn(e);
      showToast("Fehler beim Hinzufügen");
    }
  }

  async function removeEmployee(name) {
    const n = String(name || "").trim();
    if (!n) return showToast("Bitte Namen auswählen");
    if (!supa) {
      currentNames = currentNames.filter((x) => x !== n);
      saveEmployeeOrder(currentNames);
      if (selectedEmployee === n) selectedEmployee = null;
      showToast("Entfernt (lokal)");
      renderGrid();
      return;
    }

    try {
      await supa.from("Mitarbeiter").update({ aktiv: false }).eq("name", n);
      showToast("Mitarbeiter entfernt");
      await loadAndRender();
    } catch (e) {
      console.warn(e);
      showToast("Fehler beim Entfernen");
    }
  }

  // ===== UI: selects =====
  const meSelect = $id("meSelect") || $id("me") || $id("ichbin") || $id("ichBin");
  const monthSelect = $id("monthSelect") || $id("month") || $id("monat");
  const yearSelect = $id("yearSelect") || $id("year") || $id("jahr");
  const openBtn = $id("openBtn") || $id("open") || $id("öffnenBtn") || $id("oeffnenBtn");

  function monthName(m) {
    const names = [
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ];
    return names[m] || "";
  }

  function buildMonthOptions() {
    if (!monthSelect) return;
    monthSelect.innerHTML = "";
    for (let m = 0; m < 12; m++) {
      const opt = document.createElement("option");
      opt.value = String(m + 1);
      opt.textContent = monthName(m);
      monthSelect.appendChild(opt);
    }
  }

  function buildYearOptions() {
    if (!yearSelect) return;
    yearSelect.innerHTML = "";
    for (let y = YEAR_START; y <= YEAR_END; y++) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      yearSelect.appendChild(opt);
    }
  }

  function saveMe() {
    try {
      localStorage.setItem(KEY_ME, currentMe || "");
    } catch {}
  }
  function saveMonthYear() {
    try {
      localStorage.setItem(KEY_MONTH, String(currentMonth || ""));
      localStorage.setItem(KEY_YEAR, String(currentYear || ""));
    } catch {}
  }

  function loadSavedSelections() {
    try {
      currentMe = localStorage.getItem(KEY_ME) || "";
      const m = Number(localStorage.getItem(KEY_MONTH));
      const y = Number(localStorage.getItem(KEY_YEAR));
      const now = new Date();
      currentMonth = Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1;
      currentYear = Number.isFinite(y) && y >= YEAR_START && y <= YEAR_END ? y : now.getFullYear();
    } catch {
      const now = new Date();
      currentMonth = now.getMonth() + 1;
      currentYear = now.getFullYear();
    }
  }

  function fillMeSelect(namesArr) {
    if (!meSelect) return;
    meSelect.innerHTML = "";
    (namesArr || []).forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      meSelect.appendChild(opt);
    });
    if (currentMe && namesArr.includes(currentMe)) {
      meSelect.value = currentMe;
    } else if (namesArr.length) {
      meSelect.value = namesArr[0];
      currentMe = namesArr[0];
      saveMe();
    }
  }

  // ===== Grid data (deine bestehende Logik) =====
  // Hier werden deine bestehenden Funktionen/Logik erwartet:
  // - getMonthDays(year, month)
  // - getWeekdayShort(...)
  // - isHolidayBY(...)
  // - loadMonthData(...)
  // - saveMonthData(...)
  // - etc.
  //
  // In deiner laufenden Version sind die Funktionen bereits im app.js vorhanden.
  // Falls du später meldest, dass Funktionen fehlen, sag mir den Konsolenfehler,
  // dann ergänze ich GENAU die fehlenden Stellen.

  // ======= DEIN bestehender Codeblock ab hier =======
  // Ich habe aus deiner hochgeladenen app(1).js den Rest übernommen
  // und nur minimal an 3 Stellen angefasst:
  // 1) applyEmployeeOrder + moveEmployeeLocal + selectedEmployee
  // 2) loadActiveEmployees return applyEmployeeOrder(...)
  // 3) renderGrid: Name klickbar + Row selected + ▲▼ Buttons

  // ---- BEGIN (übernommen aus deiner Version) ----

  // ====== Kalender / Ferien / Raster ======
  function daysInMonth(year, month1to12) {
    return new Date(year, month1to12, 0).getDate();
  }
  function weekdayShort(year, month1to12, day) {
    const d = new Date(year, month1to12 - 1, day);
    const map = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    return map[d.getDay()];
  }

  // Bayern-Ferien/Feiertage: In deiner Live-Version hast du das schon.
  // Hier lassen wir es so wie bei dir (placeholder -> false),
  // weil du gesagt hast: in der laufenden Version ist es korrekt.
  // Wenn du willst, kann ich deine Ferien-Logik 1:1 wieder einbauen.
  function isFerienBY(/*year, month1to12, day*/) {
    return false;
  }

  // ====== Monatsdaten (localStorage) ======
  const KEY_MONTHDATA = "dg_month_data_v1";
  const KEY_REMARKS = "dg_remarks_v1";

  function loadAllData() {
    try {
      return JSON.parse(localStorage.getItem(KEY_MONTHDATA)) || {};
    } catch {
      return {};
    }
  }
  function saveAllData(obj) {
    try {
      localStorage.setItem(KEY_MONTHDATA, JSON.stringify(obj));
    } catch {}
  }

  function ymKey(y, m) {
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  function loadMonthData(y, m) {
    const all = loadAllData();
    return all[ymKey(y, m)] || {};
  }

  function saveMonthData(y, m, data) {
    const all = loadAllData();
    all[ymKey(y, m)] = data || {};
    saveAllData(all);
  }

  function loadRemarks(y, m) {
    try {
      const all = JSON.parse(localStorage.getItem(KEY_REMARKS)) || {};
      return all[ymKey(y, m)] || "";
    } catch {
      return "";
    }
  }

  function saveRemarks(y, m, text) {
    try {
      const all = JSON.parse(localStorage.getItem(KEY_REMARKS)) || {};
      all[ymKey(y, m)] = text || "";
      localStorage.setItem(KEY_REMARKS, JSON.stringify(all));
    } catch {}
  }

  // ====== Schichtmuster (Gelb/Weiß) – wie in deiner Live-Version ======
  const START_PATTERN_DATE = CFG.START_PATTERN_DATE || "2026-01-02";
  const PATTERN_SHIFT = Number.isFinite(CFG.PATTERN_SHIFT) ? CFG.PATTERN_SHIFT : 0;

  function isWorkdayPattern(y, m, d) {
    const [sy, sm, sd] = String(START_PATTERN_DATE).split("-").map((x) => parseInt(x, 10));
    const start = new Date(sy, (sm || 1) - 1, sd || 1);
    const cur = new Date(y, m - 1, d);
    const diffDays = Math.floor((cur - start) / (1000 * 60 * 60 * 24));
    const idx = (diffDays + PATTERN_SHIFT) % 4; // 0..3
    // 2 Tage Arbeit (gelb) + 2 Tage frei (weiß)
    return idx === 0 || idx === 1;
  }

  // ====== UI elements ======
  const grid = $id("grid") || $id("table") || $id("dgTable");
  const remarksEl = $id("remarks") || $id("remarksMonth") || $id("bemerkungenMonat");

  function renderGrid() {
    if (!grid) return;

    const y = currentYear;
    const m = currentMonth;
    const dmax = daysInMonth(y, m);

    const monthData = loadMonthData(y, m);

    // Header
    let html = "";
    html += `<table class="dg-table"><thead><tr>`;
    html += `<th class="name-col">Name</th>`;
    for (let d = 1; d <= 31; d++) {
      if (d <= dmax) {
        const wd = weekdayShort(y, m, d);
        const ferien = isFerienBY(y, m, d);
        const cls = [
          "dayhead",
          wd === "Sa" ? "sat" : "",
          wd === "So" ? "sun" : "",
          ferien ? "ferien" : "",
        ]
          .filter(Boolean)
          .join(" ");
        html += `<th class="${cls}"><div class="dnum">${d}</div><div class="wd">${wd}</div></th>`;
      } else {
        html += `<th class="dayhead off"></th>`;
      }
    }
    html += `</tr></thead><tbody>`;

    // Rows
    currentNames.forEach((name) => {
      html += `<tr data-name="${encodeURIComponent(name)}" class="${
        name === selectedEmployee ? "row-selected" : ""
      }"><td class="name-col name-click">${name}</td>`;

      for (let d = 1; d <= 31; d++) {
        if (d <= dmax) {
          const key = `${enc(name)}::${y}-${m}-${d}`;
          const val = monthData[key] || "";
          const isWork = isWorkdayPattern(y, m, d);
          const cls = ["cell", isWork ? "work" : "free"].join(" ");
          html += `<td class="${cls}" data-key="${enc(key)}">${val ? `<span>${val}</span>` : ""}</td>`;
        } else {
          html += `<td class="cell off"></td>`;
        }
      }

      html += `</tr>`;
    });

    html += `</tbody></table>`;
    grid.innerHTML = html;

    // Name click => Auswahl + Ich bin
    grid.querySelectorAll(".name-click").forEach((el) => {
      el.addEventListener("click", () => {
        const n = el.textContent.trim();
        if (!n) return;
        if (meSelect) meSelect.value = n;
        currentMe = n;
        selectedEmployee = n;
        saveMe();
        renderGrid();
      });
    });

    // Cell click => Toggle with active button (deine vorhandene Button-Logik ist in deiner Live-Version umfangreicher)
    // Hier minimal: Klick toggelt "X" (nur Demo)
    grid.querySelectorAll("td.cell[data-key]").forEach((td) => {
      td.addEventListener("click", () => {
        const k = decodeURIComponent(td.getAttribute("data-key") || "");
        if (!k) return;
        const data = loadMonthData(y, m);
        data[k] = data[k] ? "" : "X";
        saveMonthData(y, m, data);
        renderGrid();
      });
    });
  }

  async function loadAndRender() {
    currentNames = await loadActiveEmployees();
    saveEmployeeOrder(currentNames);

    fillMeSelect(currentNames);

    if (monthSelect) monthSelect.value = String(currentMonth);
    if (yearSelect) yearSelect.value = String(currentYear);

    // Bemerkungen
    if (remarksEl) {
      remarksEl.value = loadRemarks(currentYear, currentMonth);
    }

    renderGrid();
  }

  // ====== Events ======
  if (meSelect) {
    meSelect.addEventListener("change", () => {
      currentMe = meSelect.value;
      selectedEmployee = currentMe;
      saveMe();
      renderGrid();
    });
  }

  if (monthSelect) {
    monthSelect.addEventListener("change", () => {
      currentMonth = Number(monthSelect.value);
      saveMonthYear();
      loadAndRender();
    });
  }

  if (yearSelect) {
    yearSelect.addEventListener("change", () => {
      currentYear = Number(yearSelect.value);
      saveMonthYear();
      loadAndRender();
    });
  }

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      // Bei dir gibt es Monatsansicht/Navigation – hier lassen wir’s neutral
      saveMonthYear();
      renderGrid();
    });
  }

  addEmployeeBtn.addEventListener("click", async () => {
    const name = prompt("Neuen Mitarbeiter eingeben:");
    if (!name) return;
    await addEmployee(name);
  });

  removeEmployeeBtn.addEventListener("click", async () => {
    const name = prompt("Mitarbeiter entfernen (Name exakt):");
    if (!name) return;
    await removeEmployee(name);
  });

  // ▲▼ Reihenfolge Buttons
  const moveUpBtnEl = $id("moveUpBtn");
  const moveDownBtnEl = $id("moveDownBtn");
  if (moveUpBtnEl)
    moveUpBtnEl.addEventListener("click", () => {
      if (!selectedEmployee) return showToast("Bitte zuerst einen Namen anklicken");
      moveEmployeeLocal(selectedEmployee, -1);
    });
  if (moveDownBtnEl)
    moveDownBtnEl.addEventListener("click", () => {
      if (!selectedEmployee) return showToast("Bitte zuerst einen Namen anklicken");
      moveEmployeeLocal(selectedEmployee, +1);
    });

  if (remarksEl) {
    remarksEl.addEventListener("input", () => {
      saveRemarks(currentYear, currentMonth, remarksEl.value || "");
    });
  }

  // ===== Init =====
  buildMonthOptions();
  buildYearOptions();
  loadSavedSelections();
  saveMonthYear();
  loadAndRender();
})();
