/* Dienstgruppe D – app.js
   - Lädt Mitarbeiter aus public.mitarbeiter (aktiv=true)
   - Lädt Einträge aus public.cells (project/year/month)
   - Lädt Bemerkungen aus public.remarks_month
   - Reihenfolge ändern (▲/▼) über Spalte "sort" in public.mitarbeiter
*/

(() => {
  "use strict";

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const pad2 = (n) => String(n).padStart(2, "0");

  function toast(msg) {
    const t = $("#toast");
    if (!t) return alert(msg);
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1800);
  }

  // -----------------------------
  // DOM (muss zu deiner index.html passen)
  // -----------------------------
  const dom = {
    meSelect: $("#meSelect"),
    monthSelect: $("#monthSelect"),
    yearSelect: $("#yearSelect"),
    prevBtn: $("#prevBtn"),
    nextBtn: $("#nextBtn"),
    gridMain: $("#gridMain"),
    remarksTA: $("#remarksTA"),
    saveRemarksBtn: $("#saveRemarksBtn"),
    legendTop: $("#legendTop"), // optional
  };

  // -----------------------------
  // Supabase init
  // Erwartet, dass config.js sowas setzt:
  // window.SUPABASE_URL / window.SUPABASE_ANON_KEY
  // -----------------------------
  const SUPABASE_URL = window.SUPABASE_URL || "";
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";

  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase JS nicht geladen. Prüfe index.html script tags.");
  }

  const sb = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase?.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    project: window.PROJECT_NAME || "",      // wird notfalls automatisch erkannt
    month: null,
    year: null,
    selectedCode: "U",
    employees: [], // [{id, name, sort}]
    cellsMap: new Map(), // key: `${name}__${day}` -> value
  };

  // -----------------------------
  // Constants / month handling
  // -----------------------------
  const monthNamesDE = [
    "Januar","Februar","März","April","Mai","Juni",
    "Juli","August","September","Oktober","November","Dezember"
  ];
  const weekdayDE = ["So","Mo","Di","Mi","Do","Fr","Sa"];

  function daysInMonth(year, month1to12) {
    return new Date(year, month1to12, 0).getDate();
  }
  function weekdayShort(year, month1to12, day) {
    const d = new Date(year, month1to12 - 1, day);
    return weekdayDE[d.getDay()];
  }

  // -----------------------------
  // Project auto-detect (wichtig!)
  // In deinen cells steht project z.B. "Schichtplan Polizei"
  // Falls config nix setzt, nehmen wir den neuesten project Wert aus cells.
  // -----------------------------
  async function detectProjectIfNeeded() {
    if (!sb) return;
    if (state.project) return;

    // Versuch 1: latest row
    const { data, error } = await sb
      .from("cells")
      .select("project")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) {
      console.warn("Project detect failed:", error);
      // fallback
      state.project = "Schichtplan Polizei";
      return;
    }
    if (data && data.length && data[0]?.project) {
      state.project = data[0].project;
      return;
    }
    // fallback
    state.project = "Schichtplan Polizei";
  }

  // -----------------------------
  // UI init
  // -----------------------------
  function initMonthYearSelectors() {
    // Monate
    dom.monthSelect.innerHTML = "";
    monthNamesDE.forEach((m, i) => {
      const opt = el("option");
      opt.value = String(i + 1);
      opt.textContent = m;
      dom.monthSelect.appendChild(opt);
    });

    // Jahre (breiter Bereich, weil du oft springst)
    const now = new Date();
    const start = now.getFullYear() - 3;
    const end = now.getFullYear() + 6;

    dom.yearSelect.innerHTML = "";
    for (let y = start; y <= end; y++) {
      const opt = el("option");
      opt.value = String(y);
      opt.textContent = String(y);
      dom.yearSelect.appendChild(opt);
    }

    state.month = now.getMonth() + 1;
    state.year = now.getFullYear();

    dom.monthSelect.value = String(state.month);
    dom.yearSelect.value = String(state.year);

    dom.monthSelect.addEventListener("change", async () => {
      state.month = Number(dom.monthSelect.value);
      await refreshAll();
    });
    dom.yearSelect.addEventListener("change", async () => {
      state.year = Number(dom.yearSelect.value);
      await refreshAll();
    });

    dom.prevBtn?.addEventListener("click", async () => {
      let m = state.month - 1;
      let y = state.year;
      if (m < 1) { m = 12; y -= 1; }
      state.month = m; state.year = y;
      dom.monthSelect.value = String(m);
      dom.yearSelect.value = String(y);
      await refreshAll();
    });

    dom.nextBtn?.addEventListener("click", async () => {
      let m = state.month + 1;
      let y = state.year;
      if (m > 12) { m = 1; y += 1; }
      state.month = m; state.year = y;
      dom.monthSelect.value = String(m);
      dom.yearSelect.value = String(y);
      await refreshAll();
    });
  }

  function initLegendButtons() {
    // Deine index.html hat Buttons mit class="legend-btn" und data-code="U" etc.
    const btns = document.querySelectorAll(".legend-btn");
    btns.forEach((b) => {
      b.addEventListener("click", () => {
        const code = b.getAttribute("data-code");
        if (!code) return;
        state.selectedCode = code;
        // visuelle Markierung optional:
        btns.forEach(x => x.classList.remove("active"));
        b.classList.add("active");
      });
    });

    // Default: ersten aktiv
    const first = Array.from(btns).find(b => b.getAttribute("data-code") === state.selectedCode) || btns[0];
    if (first) first.classList.add("active");
  }

  // -----------------------------
  // Data loading
  // -----------------------------
  async function loadEmployees() {
    if (!sb) return;

    // Wichtig: sort bevorzugen, dann name
    const { data, error } = await sb
      .from("mitarbeiter")
      .select("id,name,aktiv,sort,created_at")
      .eq("aktiv", true)
      .order("sort", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) {
      console.error("loadEmployees error:", error);
      toast("Fehler beim Laden der Mitarbeiter");
      return;
    }
    state.employees = (data || []).map(r => ({
      id: r.id, name: r.name, sort: r.sort
    }));

    // Falls sort irgendwo NULL ist: initial einmal sauber befüllen
    const needInit = state.employees.some(e => e.sort === null || e.sort === undefined);
    if (needInit) {
      await initializeSortIfMissing();
      // neu laden, damit Reihenfolge korrekt ist
      const { data: data2 } = await sb
        .from("mitarbeiter")
        .select("id,name,aktiv,sort")
        .eq("aktiv", true)
        .order("sort", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      state.employees = (data2 || []).map(r => ({ id: r.id, name: r.name, sort: r.sort }));
    }

    // Me-Select füllen
    if (dom.meSelect) {
      dom.meSelect.innerHTML = "";
      state.employees.forEach(e => {
        const opt = el("option");
        opt.value = e.name;
        opt.textContent = e.name;
        dom.meSelect.appendChild(opt);
      });
    }
  }

  async function initializeSortIfMissing() {
    if (!sb) return;
    try {
      // sort sequential
      const updates = state.employees.map((e, idx) => ({
        id: e.id,
        sort: idx + 1
      }));
      const { error } = await sb.from("mitarbeiter").upsert(updates, { onConflict: "id" });
      if (error) console.warn("initializeSortIfMissing:", error);
    } catch (e) {
      console.warn("initializeSortIfMissing exception:", e);
    }
  }

  function cellKey(name, day) {
    return `${name}__${day}`;
  }

  async function loadCells() {
    if (!sb) return;

    state.cellsMap.clear();

    await detectProjectIfNeeded();

    const { data, error } = await sb
      .from("cells")
      .select("project,year,month,day,name,value")
      .eq("project", state.project)
      .eq("year", state.year)
      .eq("month", state.month);

    if (error) {
      console.error("loadCells error:", error);
      toast("Fehler beim Laden der Einträge (cells)");
      return;
    }

    (data || []).forEach(r => {
      state.cellsMap.set(cellKey(r.name, r.day), r.value ?? "");
    });
  }

  async function loadRemarks() {
    if (!sb || !dom.remarksTA) return;

    await detectProjectIfNeeded();

    const { data, error } = await sb
      .from("remarks_month")
      .select("project,year,month,text")
      .eq("project", state.project)
      .eq("year", state.year)
      .eq("month", state.month)
      .limit(1);

    if (error) {
      console.warn("loadRemarks error:", error);
      dom.remarksTA.value = "";
      return;
    }
    dom.remarksTA.value = (data && data[0]?.text) ? data[0].text : "";
  }

  async function saveRemarks() {
    if (!sb || !dom.remarksTA) return;

    await detectProjectIfNeeded();

    const payload = {
      project: state.project,
      year: state.year,
      month: state.month,
      text: dom.remarksTA.value || ""
    };

    // upsert braucht Unique (project,year,month). Wenn fehlt: delete+insert fallback.
    let ok = true;
    const { error } = await sb.from("remarks_month").upsert(payload, {
      onConflict: "project,year,month"
    });
    if (error) {
      ok = false;
      console.warn("remarks upsert failed, try fallback:", error);
    }
    if (!ok) {
      // fallback
      await sb.from("remarks_month")
        .delete()
        .eq("project", state.project)
        .eq("year", state.year)
        .eq("month", state.month);
      const { error: insErr } = await sb.from("remarks_month").insert(payload);
      if (insErr) {
        console.error("remarks insert failed:", insErr);
        toast("Bemerkungen konnten nicht gespeichert werden");
        return;
      }
    }
    toast("Bemerkungen gespeichert");
  }

  // -----------------------------
  // Rendering
  // -----------------------------
  function renderGrid() {
    if (!dom.gridMain) return;

    const year = state.year;
    const month = state.month;
    const dim = daysInMonth(year, month);

    dom.gridMain.innerHTML = "";

    const table = el("table", "shift-table");

    // Header 1: Tage + Wochentag
    const thead = el("thead");
    const tr1 = el("tr");
    const thName = el("th");
    thName.textContent = "Name";
    tr1.appendChild(thName);

    for (let d = 1; d <= dim; d++) {
      const th = el("th");
      const wd = weekdayShort(year, month, d);
      th.innerHTML = `<div class="daynum">${d}</div><div class="weekday">${wd}</div>`;
      // optional weekend classes:
      if (wd === "Sa") th.classList.add("sat");
      if (wd === "So") th.classList.add("sun");
      tr1.appendChild(th);
    }
    thead.appendChild(tr1);
    table.appendChild(thead);

    const tbody = el("tbody");

    state.employees.forEach((emp) => {
      const tr = el("tr");

      // Name cell with up/down buttons
      const tdName = el("td", "namecell");
      const wrap = el("div", "namewrap");

      const nameSpan = el("span", "empname");
      nameSpan.textContent = emp.name;

      const btnUp = el("button", "reorder-btn");
      btnUp.type = "button";
      btnUp.textContent = "▲";
      btnUp.title = "Nach oben";

      const btnDown = el("button", "reorder-btn");
      btnDown.type = "button";
      btnDown.textContent = "▼";
      btnDown.title = "Nach unten";

      btnUp.addEventListener("click", () => moveEmployee(emp.id, -1));
      btnDown.addEventListener("click", () => moveEmployee(emp.id, +1));

      wrap.appendChild(nameSpan);
      wrap.appendChild(btnUp);
      wrap.appendChild(btnDown);
      tdName.appendChild(wrap);
      tr.appendChild(tdName);

      // cells
      for (let d = 1; d <= dim; d++) {
        const td = el("td", "cell");
        const v = state.cellsMap.get(cellKey(emp.name, d)) || "";

        td.textContent = v === "EMPTY" ? "" : v;

        // click -> set selectedCode
        td.addEventListener("click", async () => {
          await setCell(emp.name, d, state.selectedCode);
        });

        // Right click -> clear
        td.addEventListener("contextmenu", async (ev) => {
          ev.preventDefault();
          await setCell(emp.name, d, "EMPTY"); // konsistent zu deinen Daten
        });

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    dom.gridMain.appendChild(table);
  }

  // -----------------------------
  // Write cells
  // -----------------------------
  async function setCell(name, day, value) {
    if (!sb) return;

    await detectProjectIfNeeded();

    const payload = {
      project: state.project,
      year: state.year,
      month: state.month,
      day,
      name,
      value
    };

    // optimistic UI
    state.cellsMap.set(cellKey(name, day), value);
    renderGrid();

    // upsert (benötigt unique constraint auf (project,year,month,day,name))
    let ok = true;
    const { error } = await sb.from("cells").upsert(payload, {
      onConflict: "project,year,month,day,name"
    });
    if (error) {
      ok = false;
      console.warn("cells upsert failed, try fallback:", error);
    }
    if (!ok) {
      // fallback: delete then insert
      await sb.from("cells")
        .delete()
        .eq("project", state.project)
        .eq("year", state.year)
        .eq("month", state.month)
        .eq("day", day)
        .eq("name", name);

      const { error: insErr } = await sb.from("cells").insert(payload);
      if (insErr) {
        console.error("cells insert failed:", insErr);
        toast("Eintrag konnte nicht gespeichert werden");
        // reload from DB to revert
        await loadCells();
        renderGrid();
        return;
      }
    }
  }

  // -----------------------------
  // Reordering employees
  // -----------------------------
  async function moveEmployee(empId, direction) {
    if (!sb) return;

    // direction: -1 up, +1 down
    const idx = state.employees.findIndex(e => e.id === empId);
    if (idx < 0) return;

    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= state.employees.length) return;

    const a = state.employees[idx];
    const b = state.employees[targetIdx];

    // swap sort values
    const sortA = a.sort ?? (idx + 1);
    const sortB = b.sort ?? (targetIdx + 1);

    // optimistic swap in UI
    state.employees[idx] = { ...b, sort: sortA };
    state.employees[targetIdx] = { ...a, sort: sortB };
    // but keep array order swapped
    const tmp = state.employees[idx];
    state.employees[idx] = state.employees[targetIdx];
    state.employees[targetIdx] = tmp;

    renderGrid();

    // write to DB
    const updates = [
      { id: a.id, sort: sortB },
      { id: b.id, sort: sortA }
    ];
    const { error } = await sb.from("mitarbeiter").upsert(updates, { onConflict: "id" });
    if (error) {
      console.error("moveEmployee update failed:", error);
      toast("Reihenfolge konnte nicht gespeichert werden");
      // reload employees to recover
      await loadEmployees();
      renderGrid();
      return;
    }

    // reload employees to ensure correct order
    await loadEmployees();
    renderGrid();
  }

  // -----------------------------
  // Refresh
  // -----------------------------
  async function refreshAll() {
    if (!sb) {
      toast("Supabase nicht verbunden (URL/Key in config.js?)");
      return;
    }
    await loadEmployees();
    await loadCells();
    await loadRemarks();
    renderGrid();
  }

  // -----------------------------
  // Boot
  // -----------------------------
  async function boot() {
    try {
      initMonthYearSelectors();
      initLegendButtons();

      if (dom.saveRemarksBtn) {
        dom.saveRemarksBtn.addEventListener("click", saveRemarks);
      }

      await refreshAll();
    } catch (e) {
      console.error("boot error:", e);
      toast("Fehler beim Start (siehe Konsole)");
    }
  }

  // Start when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
