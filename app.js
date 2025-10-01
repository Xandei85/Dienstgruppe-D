// ===== CONFIG & STATE =====
const C = window.APP_CONFIG||{};
const NAMES = Array.isArray(C.NAMES)&&C.NAMES.length? C.NAMES : ["Wiesent","Puhl","Botzenhard","Sommer","Schmid"];
const EXTRA_NAMES = ["Praktikant","Bullen Kate"];
const YEAR_START = C.YEAR_START||new Date().getFullYear();
const YEAR_END = C.YEAR_END||2030;
const YEAR_MAX = Math.max(2030, YEAR_END||2030);

const monthTitle=document.getElementById('monthTitle');
const gridEl=document.getElementById('grid');
const gridExtraEl=document.getElementById('gridExtra');
const meSelect=document.getElementById('meSelect');
const prevBtn=document.getElementById('prevMonth');
const nextBtn=document.getElementById('nextMonth');
const remarksTA=document.getElementById('monthlyRemarks');
const saveRemarksBtn=document.getElementById('saveRemarks');

const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
let today=new Date(); let curYear=today.getFullYear(); let curMonth=today.getMonth();
let myName = ([...NAMES,...EXTRA_NAMES])[0];
let selectedCode = null;

// ===== UI INIT =====
function buildSelectors(){
  // Personen
  meSelect.innerHTML='';
  ([...NAMES, ...EXTRA_NAMES]).forEach(n=>{
    const o=document.createElement('option'); o.value=n; o.textContent=n; meSelect.appendChild(o);
  });
  meSelect.value=myName;
  meSelect.onchange=()=>{ myName=meSelect.value; };
}
buildSelectors();

document.querySelectorAll('.legend-btn').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.legend-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    selectedCode = b.dataset.code;
  });
});

prevBtn.onclick=()=>nav(-1);
nextBtn.onclick=()=>nav(+1);
saveRemarksBtn.onclick=()=>saveMonthlyRemarks();

function nav(step){
  curMonth += step;
  if(curMonth<0){ curMonth=11; curYear--; }
  if(curMonth>11){ curMonth=0; curYear++; }
  selectedCode = null; // 🍺/🎉 etc. nicht kleben lassen
  saveMonthlyRemarks(true).finally(render);
}

// ===== STORAGE (via SB stub oder echte SB) =====
const SB = window.SB;

// ===== RENDERING =====
function render(){
  monthTitle.textContent = `${MONTHS_DE[curMonth]} ${curYear}`;

  const days = new Date(curYear,curMonth+1,0).getDate();

  // Kopf
  let html = '<table><thead><tr><th class="name">Name</th>';
  for(let d=1; d<=days; d++){
    const dt=new Date(curYear,curMonth,d);
    const wd=['So','Mo','Di','Mi','Do','Fr','Sa'][dt.getDay()];
    html += `<th>${d}<br>${wd}</th>`;
  }
  html += '</tr></thead><tbody>';

  // Reihen
  NAMES.forEach(name => {
    html += `<tr><th class="name">${name}</th>`;
    for(let d=1; d<=days; d++) html += `<td class="cell editable" data-name="${name}" data-day="${d}"></td>`;
    html += '</tr>';
  });
  html += '</tbody></table>';
  gridEl.innerHTML = html;

  // Extra-Grid
  let html2 = '<table><thead><tr><th class="name">Name</th>';
  for(let d=1; d<=days; d++){
    const dt=new Date(curYear,curMonth,d);
    const wd=['So','Mo','Di','Mi','Do','Fr','Sa'][dt.getDay()];
    html2 += `<th>${d}<br>${wd}</th>`;
  }
  html2 += '</tr></thead><tbody>';
  EXTRA_NAMES.forEach(name => {
    html2 += `<tr><th class="name">${name}</th>`;
    for(let d=1; d<=days; d++) html2 += `<td class="cell editable" data-name="${name}" data-day="${d}"></td>`;
    html2 += '</tr>';
  });
  html2 += '</tbody></table>';
  gridExtraEl.innerHTML = html2;

  // Werte laden
  remarksTA.value='';
  Promise.all([SB.loadMonth({year:curYear,month:curMonth+1}), SB.loadRemarks({year:curYear,month:curMonth+1})]).then(([map,remark])=>{
    if(map){
      Object.entries(map).forEach(([k,v])=>{
        const [name,dayStr]=k.split('|');
        const td = document.querySelector(`.editable[data-name="${CSS.escape(name)}"][data-day="${+dayStr}"]`);
        if(td) td.textContent = v||'';
      });
    }
    remarksTA.value = remark||'';
  });

  // Interaktion
  document.querySelectorAll('.editable').forEach(td=>{
    td.addEventListener('mousedown', e=>{
      if(!selectedCode) return;
      paint(td, selectedCode);
      e.preventDefault();
    });
    td.addEventListener('mouseover', e=>{
      if(e.buttons!==1 || !selectedCode) return;
      paint(td, selectedCode);
    });
    td.addEventListener('dblclick', ()=>{
      // schneller Löschen mit Doppelklick
      paint(td,'X');
    });
  });
}

function paint(td, code){
  const name = td.dataset.name;
  const day = +td.dataset.day;
  let v = td.textContent.trim();

  if(code==='X') v='';
  else if(code==='BEER') v='🍺';
  else if(code==='PARTY') v='🎉';
  else v = code; // normale Codes

  td.textContent = v;
  SB.saveCell({year:curYear,month:curMonth+1,day,name,value:v}).catch(()=>{});
}

// Monatsbemerkungen
function saveMonthlyRemarks(silent){
  const txt = remarksTA.value || "";
  return SB.saveRemarks({year:curYear,month:curMonth+1,remarks:txt}).then(()=>{
    if(!silent) console.log('Bemerkungen gespeichert');
  }).catch(()=>{});
}

// Initial Render
render();

// Keine Service-Worker-Registrierung (bewusst deaktiviert)
if('serviceWorker' in navigator){
  navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));
}
