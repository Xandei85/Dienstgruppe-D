(function(){
  const cfg = window.AppConfig || {};
  const { createClient } = window.supabase || {};
  let supabase = null;

  // UI elements
  const monthPicker = document.getElementById('monthPicker');
  const calendarWrapper = document.getElementById('calendarWrapper');
  const btnBuildMonth = document.getElementById('btnBuildMonth');
  const btnWhiteToYellow = document.getElementById('btnWhiteToYellow');
  const btnYellowToWhite = document.getElementById('btnYellowToWhite');
  const btnATZA6 = document.getElementById('btnATZA6');
  const btnATZA12 = document.getElementById('btnATZA12');
  const btnPraktikant = document.getElementById('btnPraktikant');
  const btnClearSelection = document.getElementById('btnClearSelection');
  const btnSave = document.getElementById('btnSave');
  const btnLoad = document.getElementById('btnLoad');
  const btnExport = document.getElementById('btnExport');
  const fileImport = document.getElementById('fileImport');
  const btnReset = document.getElementById('btnReset');
  const btnCloudSave = document.getElementById('btnCloudSave');
  const btnCloudLoad = document.getElementById('btnCloudLoad');
  const btnCloudDelete = document.getElementById('btnCloudDelete');
  const cloudStatus = document.getElementById('cloudStatus');

  let state = {
    year: null,
    month: null, // 1-12
    days: [], // {dateISO, cells:{musterA:"",musterB:"",bemerkungen:""}, colors:{musterA:"white|yellow", musterB:"white|yellow"} }
    selection: [] // [ {key, dayIndex, rowKey} ]
  };

  const ROWS = [
    { key:"musterA", label:"Muster A" },
    { key:"musterB", label:"Muster B" },
    { key:"bemerkungen", label:"Bemerkungen (Klick zum Bearbeiten)", isRemark:true }
  ];

  // ===== Supabase Init =====
  function initSupabase(){
    if(createClient && cfg.supabaseUrl && cfg.supabaseKey && cfg.supabaseUrl.startsWith("http")){
      supabase = createClient(cfg.supabaseUrl, cfg.supabaseKey, { db: { schema: cfg.schema || "public" } });
      setCloudStatus("verbunden");
    } else {
      setCloudStatus("nicht verbunden");
    }
  }
  function setCloudStatus(msg){
    if(cloudStatus) cloudStatus.textContent = msg;
  }

  // ===== Helpers =====
  function getStorageKey(y,m){ return (cfg.storageKeyPrefix || "schichtkalender_v4_") + `${y}-${String(m).padStart(2,'0')}`; }
  function getYM(){ return `${state.year}-${String(state.month).padStart(2,'0')}`; }

  function buildMonthStructure(y, m){
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = [];
    for(let d=1; d<=daysInMonth; d++){
      const dt = new Date(y, m-1, d);
      days.push({
        dateISO: dt.toISOString().slice(0,10),
        cells: { musterA:"", musterB:"", bemerkungen:"" },
        colors: { musterA:"white", musterB:"white" }
      });
    }
    state.year = y; state.month = m; state.days = days; state.selection = [];
  }

  function render(){
    calendarWrapper.innerHTML = "";
    if(!state.days.length){ calendarWrapper.textContent = "Bitte Monat wählen und aufbauen."; return; }

    const table = document.createElement("table");

    // header
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    const thEmpty = document.createElement("th"); thEmpty.className = "row-label"; thEmpty.textContent = " ";
    trh.appendChild(thEmpty);

    for(let i=0;i<state.days.length;i++){
      const dt = new Date(state.days[i].dateISO);
      const wd = ["So","Mo","Di","Mi","Do","Fr","Sa"][dt.getDay()];
      const th = document.createElement("th");
      th.className = "day";
      th.innerHTML = `<div>${wd}</div><div>${String(dt.getDate()).padStart(2,'0')}.${String(state.month).padStart(2,'0')}.</div>`;
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    // body rows
    const tbody = document.createElement("tbody");
    for(const row of ROWS){
      const tr = document.createElement("tr");
      const th = document.createElement("th"); th.className = "row-label"; th.textContent = row.label;
      tr.appendChild(th);
      for(let i=0;i<state.days.length;i++){
        const day = state.days[i];
        const td = document.createElement("td");

        if(row.isRemark){
          td.className = "bemerkung-cell";
          const preview = document.createElement("div");
          preview.className = "bemerkung-preview";
          preview.textContent = day.cells.bemerkungen ? day.cells.bemerkungen.slice(0,80) : "—";
          td.appendChild(preview);
          td.addEventListener("click", ()=>openRemarkEditor(i));
        } else {
          td.className = "cell " + (day.colors[row.key]==="yellow" ? "yellow": "");
          td.dataset.dayIndex = i;
          td.dataset.rowKey = row.key;
          td.tabIndex = 0;
          td.innerHTML = renderCellContent(day.cells[row.key]);
          td.addEventListener("click", ()=>toggleSelectCell(td));
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // footer
    const tfoot = document.createElement("tfoot");
    const trf = document.createElement("tr");
    const tdf = document.createElement("td"); tdf.colSpan = state.days.length + 1;
    tdf.innerHTML = `<div><span class="tag atza">ATZA 6/12</span> = Eintragstext | <span class="tag p">Praktikant</span> = Extra-Zeile | Gelb = Markierung</div>`;
    trf.appendChild(tdf);
    tfoot.appendChild(trf);
    table.appendChild(tfoot);

    calendarWrapper.appendChild(table);
  }

  function renderCellContent(text){
    if(!text) return "";
    return text.split("\n").map(line=>`<span class="line">${escapeHtml(line)}</span>`).join("");
  }
  function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function toggleSelectCell(td){
    const key = cellKey(td);
    const idx = state.selection.findIndex(s => s.key===key);
    if(idx>=0){
      state.selection.splice(idx,1);
      td.classList.remove("selected");
    } else {
      state.selection.push({ key, dayIndex: Number(td.dataset.dayIndex), rowKey: td.dataset.rowKey });
      td.classList.add("selected");
    }
  }
  function cellKey(td){ return `${td.dataset.dayIndex}-${td.dataset.rowKey}`; }
  function forEachSelected(fn){
    const toRemove = [];
    state.selection.forEach(sel => {
      const td = findCell(sel.dayIndex, sel.rowKey);
      if(!td){ toRemove.push(sel.key); return; }
      fn(sel, td);
    });
    if(toRemove.length){
      state.selection = state.selection.filter(s => !toRemove.includes(s.key));
    }
  }
  function findCell(dayIndex, rowKey){
    const table = calendarWrapper.querySelector("table");
    if(!table) return null;
    const tbody = table.querySelector("tbody");
    const rowIdx = ROWS.findIndex(r => r.key===rowKey);
    if(rowIdx<0) return null;
    const tr = tbody.children[rowIdx];
    return tr.children[dayIndex+1] || null;
  }

  // Buttons: colors
  btnWhiteToYellow.addEventListener("click", ()=>{
    forEachSelected((sel, td)=>{
      state.days[sel.dayIndex].colors[sel.rowKey] = "yellow";
      td.classList.add("yellow");
    });
  });
  btnYellowToWhite.addEventListener("click", ()=>{
    forEachSelected((sel, td)=>{
      state.days[sel.dayIndex].colors[sel.rowKey] = "white";
      td.classList.remove("yellow");
    });
  });

  // Buttons: ATZA
  function writeTagToCell(sel, label){
    const current = state.days[sel.dayIndex].cells[sel.rowKey] || "";
    let lines = current ? current.split("\n") : [];
    const atzaIdx = lines.findIndex(l => /^ATZA\s+\d+$/i.test(l.trim()));
    if(atzaIdx>=0){
      lines[atzaIdx] = label;
    } else {
      lines.unshift(label);
    }
    state.days[sel.dayIndex].cells[sel.rowKey] = lines.join("\n");
  }
  btnATZA6.addEventListener("click", ()=>{
    forEachSelected((sel, td)=>{
      writeTagToCell(sel, "ATZA 6");
      state.days[sel.dayIndex].colors[sel.rowKey] = "yellow";
      td.classList.add("yellow");
      td.innerHTML = renderCellContent(state.days[sel.dayIndex].cells[sel.rowKey]);
    });
  });
  btnATZA12.addEventListener("click", ()=>{
    forEachSelected((sel, td)=>{
      writeTagToCell(sel, "ATZA 12");
      state.days[sel.dayIndex].colors[sel.rowKey] = "yellow";
      td.classList.add("yellow");
      td.innerHTML = renderCellContent(state.days[sel.dayIndex].cells[sel.rowKey]);
    });
  });

  // Praktikant
  btnPraktikant.addEventListener("click", ()=>{
    forEachSelected((sel, td)=>{
      const current = state.days[sel.dayIndex].cells[sel.rowKey] || "";
      let lines = current ? current.split("\n") : [];
      const pIdx = lines.findIndex(l => l.trim().toLowerCase() === "praktikant");
      if(pIdx>=0){ lines.splice(pIdx,1); } else { lines.push("Praktikant"); }
      state.days[sel.dayIndex].cells[sel.rowKey] = lines.join("\n");
      td.innerHTML = renderCellContent(state.days[sel.dayIndex].cells[sel.rowKey]);
    });
  });

  // Auswahl
  btnClearSelection.addEventListener("click", ()=>{
    forEachSelected((sel, td)=> td.classList.remove("selected"));
    state.selection = [];
  });

  // Remarks
  function openRemarkEditor(dayIndex){
    const dlg = document.createElement("div");
    dlg.className = "bemerkung-editor open";
    dlg.innerHTML = `
      <div class="card" style="background:#fff;border:1px solid #cfd9e3;border-radius:10px;max-width:640px;margin:12px auto;padding:12px">
        <h3>Bemerkung für ${formatDate(state.days[dayIndex].dateISO)}</h3>
        <textarea id="remarkText">${state.days[dayIndex].cells.bemerkungen || ""}</textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
          <button id="remarkCancel">Abbrechen</button>
          <button id="remarkSave">Speichern</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector("#remarkCancel").addEventListener("click", ()=> dlg.remove());
    dlg.querySelector("#remarkSave").addEventListener("click", ()=>{
      const val = dlg.querySelector("#remarkText").value;
      state.days[dayIndex].cells.bemerkungen = val;
      dlg.remove();
      render();
    });
  }
  function formatDate(iso){
    const dt = new Date(iso);
    return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}`;
  }

  // Local Save/Load/Export/Import
  btnSave.addEventListener("click", ()=>{
    if(!state.year || !state.month){ alert("Bitte zuerst Monat aufbauen."); return; }
    const key = getStorageKey(state.year, state.month);
    localStorage.setItem(key, JSON.stringify(state));
    alert("Lokal gespeichert.");
  });
  btnLoad.addEventListener("click", ()=>{
    if(!monthPicker.value){ alert("Bitte Monat wählen (YYYY-MM)."); return; }
    const [y,m] = monthPicker.value.split("-").map(Number);
    const key = getStorageKey(y, m);
    const raw = localStorage.getItem(key);
    if(!raw){ alert("Keine lokale Speicherung gefunden."); return; }
    try{ state = JSON.parse(raw); render(); }catch(e){ alert("Konnte lokale Daten nicht laden."); }
  });
  btnExport.addEventListener("click", ()=>{
    if(!state.days.length){ alert("Nichts zu exportieren."); return; }
    const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `schichtkalender_${getYM()}.json`; a.click();
    URL.revokeObjectURL(url);
  });
  fileImport.addEventListener("change", (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result);
        if(!data.days) throw new Error("Ungültiges Format");
        state = data; render();
      }catch(err){ alert("Import fehlgeschlagen: " + err.message); }
    };
    reader.readAsText(file);
  });
  btnReset.addEventListener("click", ()=>{
    if(confirm("Wirklich alles löschen? Nur der aktuelle Monat wird geleert.")){
      if(state.year && state.month){ buildMonthStructure(state.year, state.month); render(); }
      else { calendarWrapper.innerHTML = "Gelöscht. Bitte Monat neu aufbauen."; }
    }
  });

  // Cloud (Supabase)
  btnCloudSave.addEventListener("click", async ()=>{
    if(!supabase){ return alert("Supabase nicht konfiguriert."); }
    if(!state.year || !state.month){ return alert("Bitte zuerst Monat aufbauen."); }
    const ym = getYM();
    const payload = { ym, data: state };
    // upsert by primary key ym
    const { error } = await supabase.from(cfg.tableName || "schedules").upsert(payload, { onConflict: 'ym' });
    if(error){ alert("Cloud speichern fehlgeschlagen: " + error.message); }
    else { alert("In der Cloud gespeichert."); }
  });

  btnCloudLoad.addEventListener("click", async ()=>{
    if(!supabase){ return alert("Supabase nicht konfiguriert."); }
    if(!monthPicker.value){ return alert("Bitte Monat wählen (YYYY-MM)."); }
    const [y,m] = monthPicker.value.split("-").map(Number);
    const ym = `${y}-${String(m).padStart(2,'0')}`;
    const { data, error } = await supabase.from(cfg.tableName || "schedules").select("data").eq("ym", ym).maybeSingle();
    if(error){ return alert("Cloud laden fehlgeschlagen: " + error.message); }
    if(!data){ return alert("Kein Cloud-Eintrag gefunden."); }
    state = data.data;
    render();
  });

  btnCloudDelete.addEventListener("click", async ()=>{
    if(!supabase){ return alert("Supabase nicht konfiguriert."); }
    if(!monthPicker.value){ return alert("Bitte Monat wählen (YYYY-MM)."); }
    const [y,m] = monthPicker.value.split("-").map(Number);
    const ym = `${y}-${String(m).padStart(2,'0')}`;
    if(!confirm(`Cloud-Eintrag ${ym} wirklich löschen?`)) return;
    const { error } = await supabase.from(cfg.tableName || "schedules").delete().eq("ym", ym);
    if(error){ alert("Cloud löschen fehlgeschlagen: " + error.message); }
    else { alert("Cloud-Eintrag gelöscht."); }
  });

  // Build Month
  btnBuildMonth.addEventListener("click", ()=>{
    if(!monthPicker.value){ return alert("Bitte oben einen Monat auswählen."); }
    const [y,m] = monthPicker.value.split("-").map(Number);
    buildMonthStructure(y,m);
    render();
  });

  // Default: current month
  (function init(){
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    monthPicker.value = ym;
    buildMonthStructure(now.getFullYear(), now.getMonth()+1);
    initSupabase();
    render();
  })();

})();