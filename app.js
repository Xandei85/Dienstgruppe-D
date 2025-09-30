// === config ===
const CFG = (window.APP_CONFIG || {});
let { SUPABASE_URL, SUPABASE_ANON_KEY, PROJECT_NAME, NAMES, YEAR_START, YEAR_END, START_PATTERN_DATE, PATTERN_SHIFT } = CFG;

// Fallbacks
if (!Array.isArray(NAMES) || NAMES.length === 0) {
  console.warn('NAMES leer oder fehlt – Fallback wird gesetzt.');
  NAMES = ["Wiesent","Puhl","Botzenhard","Sommer","Schmid"];
}
YEAR_START = YEAR_START || new Date().getFullYear();
YEAR_END   = YEAR_END   || YEAR_START;
START_PATTERN_DATE = START_PATTERN_DATE || `${YEAR_START}-01-01`;
PATTERN_SHIFT = PATTERN_SHIFT || 0;

// === dom ===
const monthTitle = document.getElementById('monthTitle');
const meSelect = document.getElementById('meSelect');
const gridEl = document.getElementById('grid');
const saveRemarksBtn = document.getElementById('saveRemarks');
const monthlyTA = document.getElementById('monthlyRemarks');
const prevBtn = document.getElementById('prevMonth');
const nextBtn = document.getElementById('nextMonth');

// Safety checks
if (!monthTitle || !meSelect || !gridEl || !monthlyTA) {
  console.error('Benötigte DOM-Elemente fehlen. Prüfe index.html IDs.');
}

// === state ===
const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
let cur = new Date();
let curYear = cur.getFullYear();
let curMonth = cur.getMonth();
let myName = NAMES[0];
let selectedCode = null;

// === UI init ===
function initUI(){
  // meSelect
  meSelect.innerHTML = "";
  NAMES.forEach(n => {
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    meSelect.appendChild(o);
  });
  meSelect.value = myName;
  meSelect.addEventListener('change',()=> myName = meSelect.value);

  prevBtn.addEventListener('click', ()=>nav(-1));
  nextBtn.addEventListener('click', ()=>nav(+1));
  saveRemarksBtn.addEventListener('click', ()=> saveMonthlyRemarks());

  document.querySelectorAll('.legend-btn').forEach(b => {
    b.addEventListener('click', ()=>{
      document.querySelectorAll('.legend-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      selectedCode = b.dataset.code;
    });
  });
}

function nav(step){
  curMonth += step;
  if(curMonth < 0){ curMonth = 11; curYear--; }
  if(curMonth > 11){ curMonth = 0; curYear++; }
  // Auto-save Monats-Bemerkungen beim Wechsel
  saveMonthlyRemarks(true).finally(render);
}

// === storage helpers (local only if no Supabase configured) ===
const hasCloud = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
function localKey(){ return `sp:${curYear}-${String(curMonth+1).padStart(2,'0')}`; }

async function loadMonthlyRemarks(){
  if (!hasCloud){ 
    const raw = localStorage.getItem(localKey()+":monthRemark");
    return raw || ""; 
  }
  try{
    const { loadRemarks } = window.SB;
    const res = await loadRemarks({ year: curYear, month: curMonth+1 });
    return res || "";
  }catch(e){ console.warn('loadRemarks error', e); return ""; }
}

async function saveMonthlyRemarks(silent){
  const val = monthlyTA.value || "";
  if (!hasCloud){
    localStorage.setItem(localKey()+":monthRemark", val);
    if(!silent) alert('Bemerkungen gespeichert (lokal).');
    return;
  }
  try{
    const { saveRemarks } = window.SB;
    await saveRemarks({ year: curYear, month: curMonth+1, remarks: val });
    if(!silent) alert('Bemerkungen gespeichert (Cloud).');
  }catch(e){
    if(!silent) alert('Speichern fehlgeschlagen: '+e.message);
  }
}

// === grid render ===
function render(){
  try{
    monthTitle.textContent = `${MONTHS_DE[curMonth]} ${curYear}`;
    // Tage im Monat
    const days = new Date(curYear, curMonth+1, 0).getDate();
    // Kopf
    let html = '<table><thead><tr><th class="row-label">Name</th>';
    for(let d=1; d<=days; d++){
      const dt = new Date(curYear, curMonth, d);
      const wd = ["So","Mo","Di","Mi","Do","Fr","Sa"][dt.getDay()];
      html += `<th>${d}<br>${wd}</th>`;
    }
    html += '</tr></thead><tbody>';
    // Reihen
    NAMES.forEach(name => {
      html += `<tr><th class="row-label">${name}</th>`;
      for(let d=1; d<=days; d++){
        html += `<td class="cell" data-name="${name}" data-day="${d}"></td>`;
      }
      html += '</tr>';
    });
    html += '</tbody></table>';
    gridEl.innerHTML = html;

    // Monatsbemerkungen laden
    monthlyTA.value = "";
    loadMonthlyRemarks().then(txt => { monthlyTA.value = txt || ""; });
  }catch(e){
    console.error('Render-Fehler:', e);
    gridEl.innerHTML = `<div style="padding:10px;color:#900">Render-Fehler: ${e.message}</div>`;
  }
}

// === boot ===
initUI();
render();

// Disable Service Worker entirely
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
}
