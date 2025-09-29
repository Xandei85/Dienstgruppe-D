// === CONFIG & CONSTANTS ===
const MONTHS_DE=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const WD=['Mo','Di','Mi','Do','Fr','Sa','So'];
const DEFAULT_NAMES=['Wiesent','Puhl','Botzenhard','Sommer','Schmid'];
const CFG = window.APP_CONFIG || {};
const BASE_NAMES = Array.isArray(CFG.NAMES)&&CFG.NAMES.length? CFG.NAMES.slice() : DEFAULT_NAMES.slice();
const YEAR_START = Number.isFinite(CFG.YEAR_START)? CFG.YEAR_START : 2026;
const YEAR_END   = Number.isFinite(CFG.YEAR_END)? CFG.YEAR_END : 2030;
const START_PATTERN_DATE = (CFG.START_PATTERN_DATE || '2026-01-02');
const PATTERN_SHIFT = (CFG.PATTERN_SHIFT|0) || 0;

// Ferien (BY) – Hinweis: nur exemplarisch (wie zuvor), optisch
const schoolRanges=[[new Date(2026,0,1),new Date(2026,0,5)],[new Date(2026,1,16),new Date(2026,1,20)],[new Date(2026,2,30),new Date(2026,3,10)],[new Date(2026,4,26),new Date(2026,5,5)],[new Date(2026,7,3),new Date(2026,8,14)],[new Date(2026,10,2),new Date(2026,10,6)],[new Date(2026,10,18),new Date(2026,10,18)]];
function inHolidays(d){return schoolRanges.some(([a,b])=>d>=a&&d<=b)}

// 2/2-Muster ab START_PATTERN_DATE
function isWorkday(d){
  const [sy,sm,sd]=START_PATTERN_DATE.split('-').map(n=>parseInt(n,10));
  const startUTC=Date.UTC(sy,sm-1,sd);
  const curUTC=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
  if(curUTC<startUTC) return false;
  const delta=Math.floor((curUTC-startUTC)/86400000);
  const mod=(delta+PATTERN_SHIFT)%4;
  return mod===0||mod===1;
}

// DOM
const monthTitle=document.getElementById('monthTitle');
const gridEl=document.getElementById('grid');
const monthSelect=document.getElementById('monthSelect');
const yearSelect=document.getElementById('yearSelect');
const prevBtn=document.getElementById('prevMonth');
const nextBtn=document.getElementById('nextMonth');
const remarksTA=document.getElementById('monthlyRemarks');
const saveRemarksBtn=document.getElementById('saveRemarks');
const toastEl=document.getElementById('toast');
const meSelect=document.getElementById('meSelect');

let curYear=YEAR_START,curMonth=0,selectedCode=null,isPainting=false;
function toast(m){toastEl.textContent=m;toastEl.classList.add('show');setTimeout(()=>toastEl.classList.remove('show'),1400)}

// === Praktikant (lokal) ===
const INTERN_FLAG_KEY='sp:intern:active';
function isInternActive(){return localStorage.getItem(INTERN_FLAG_KEY)==='1'}
function setInternActive(v){localStorage.setItem(INTERN_FLAG_KEY, v?'1':'0')}
function getActiveNames(){const names=[...BASE_NAMES];if(isInternActive()&&!names.includes('Praktikant'))names.push('Praktikant');return names}
function refreshMeSelect(current){
  const names=getActiveNames();
  meSelect.innerHTML='';
  names.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;meSelect.appendChild(o)});
  if(current&&names.includes(current)){meSelect.value=current}else{meSelect.value=names[0]}
  return meSelect.value;
}
let myName = refreshMeSelect();
meSelect.addEventListener('change',()=>{myName=meSelect.value});

// === Render ===
function render(){
  // Header
  monthTitle.textContent=`${MONTHS_DE[curMonth]} ${curYear}`;
  selectedCode=null;document.querySelectorAll('.legend-btn').forEach(b=>b.classList.remove('active'));
  // Tage
  const days=new Date(curYear,curMonth+1,0).getDate();
  let html='<table><thead><tr><th class="name">Name</th>';
  for(let d=1;d<=days;d++){const dt=new Date(curYear,curMonth,d);const wd=dt.getDay();const wdIdx=(wd+6)%7;const isSa=wdIdx===5,isSo=wdIdx===6;const dayClasses=[];if(inHolidays(dt))dayClasses.push('ferienday');html+=`<th class="${dayClasses.join(' ')}"><div class="daynum">${d}</div><div class="weekday ${isSa?'sat':isSo?'sun':''}">${WD[wdIdx]}</div></th>`}
  html+='</tr></thead><tbody>';
  // Tages-Bemerkungszeile
  html+='<tr class="day-remarks"><td class="name">Bemerkungen (Tag)</td>';
  for(let d=1;d<=days;d++){html+=`<td class="day-remark-cell" data-day="${d}"></td>`}html+='</tr>';
  // Personen
  getActiveNames().forEach(name=>{html+=`<tr><td class="name">${name}</td>`;for(let d=1;d<=days;d++){const dt=new Date(curYear,curMonth,d);const cls=isWorkday(dt)?'yellow':'';html+=`<td class="editable ${cls}" contenteditable data-name="${name}" data-day="${d}"></td>`}html+='</tr>'});
  html+='</tbody></table>';
  gridEl.innerHTML=html;

  // Laden: Monatsbemerkung, Tagesbemerkungen, Zellen, Overrides
  loadRemarks({year:curYear,month:curMonth+1}).then(txt=>{remarksTA.value=txt||''}).catch(()=>{});
  Promise.all([loadMonth({year:curYear,month:curMonth+1}),loadOverrides({year:curYear,month:curMonth+1})]).then(([rows,dayMap,ovr])=>{
    // Zellen — Praktikant ignorieren (er ist lokal)
    (rows||[]).filter(r=>r.name!=='Praktikant').forEach(r=>{
      const sel=`.editable[data-name="${r.name}"][data-day="${r.day}"]`;const cell=gridEl.querySelector(sel);if(cell){cell.textContent=r.value||"";cell.classList.remove('code-U','code-AA','code-AZA','code-AZA6','code-AZA12','code-GV','code-LG','code-PE','code-GEB');if(r.value==='U')cell.classList.add('code-U');if(r.value==='AA')cell.classList.add('code-AA');if(r.value==='AZA')cell.classList.add('code-AZA');if(r.value==='AZA6')cell.classList.add('code-AZA6');if(r.value==='AZA12')cell.classList.add('code-AZA12');if(r.value==='GV')cell.classList.add('code-GV');if(r.value==='LG')cell.classList.add('code-LG');if(r.value==='PE')cell.classList.add('code-PE');if(r.value==='GEB')cell.classList.add('code-GEB');}
    });
    // Tages-Bemerkungen
    
    // Overrides
    (ovr||[]).forEach(o=>{if(o.name==='Praktikant')return;const sel=`.editable[data-name="${o.name}"][data-day="${o.day}"]`;const cell=gridEl.querySelector(sel);if(!cell)return;cell.classList.remove('force-yellow','no-yellow');if(o.yellow_override==='on')cell.classList.add('force-yellow');if(o.yellow_override==='off')cell.classList.add('no-yellow')});
  }).catch(()=>{});
}

// === Save ===
function trySaveCurrentRemarks(){const txt=remarksTA.value;return saveRemarks({year:curYear,month:curMonth+1,remarks:txt}).then(()=>true).catch(()=>false)}
saveRemarksBtn.addEventListener('click',()=>{trySaveCurrentRemarks().then(()=>toast('Bemerkungen gespeichert')).catch(()=>toast('Fehler'))});
remarkApply.addEventListener('click',()=>{const d=parseInt(remarkDay.value||'0',10);if(!d){toast('Tag fehlt');return}const t=remarkText.value||'';const cell=gridEl.querySelector(`.day-remark-cell[data-day="${d}"]`);if(cell)cell.textContent=cell.textContent? (cell.textContent+'; '+t) : t;saveDayRemark({year:curYear,month:curMonth+1,day:d,text:t}).then(()=>toast('Tagesbemerkung gespeichert')).catch(()=>toast('Fehler'))});

function paintCell(td,code){
  if(td.dataset.name!==myName){toast('Nur in deiner Zeile eintragbar');return}
  if(code==='W2Y'){td.classList.remove('no-yellow');td.classList.add('force-yellow');const day=+td.dataset.day;const fn=(myName==='Praktikant'? lsSaveOverride : saveOverride);fn({year:curYear,month:curMonth+1,day,name:myName,yellow_override:'on'}).then(()=>toast('Gelb erzwungen')).catch(()=>toast('Fehler'));return}
  if(code==='Y2W'){td.classList.remove('force-yellow');td.classList.add('no-yellow');const day=+td.dataset.day;const fn=(myName==='Praktikant'? lsSaveOverride : saveOverride);fn({year:curYear,month:curMonth+1,day,name:myName,yellow_override:'off'}).then(()=>toast('Gelb entfernt')).catch(()=>toast('Fehler'));return}
  td.textContent=(code==='X')?'':(code==='BEER'?'🍺':code);
  td.classList.remove('code-U','code-AA','code-AZA','code-AZA6','code-AZA12','code-GV','code-LG','code-PE','code-GEB');
  if(code==='U')td.classList.add('code-U');
  if(code==='AA')td.classList.add('code-AA');
  if(code==='AZA')td.classList.add('code-AZA');
  if(code==='AZA6')td.classList.add('code-AZA6');
  if(code==='AZA12')td.classList.add('code-AZA12');
  if(code==='GV')td.classList.add('code-GV');
  if(code==='LG')td.classList.add('code-LG');
  if(code==='PE')td.classList.add('code-PE');
  if(code==='GEB')td.classList.add('code-GEB');
  const valueToSave=(code==='BEER'||code==='X')?'':code;
  const day=+td.dataset.day;
  const saver=(myName==='Praktikant')? lsSaveEntry : saveCell;
  saver({year:curYear,month:curMonth+1,day,name:myName,value:valueToSave}).catch(()=>toast('Fehler beim Speichern'));
}

// === Pointer painting ===
gridEl.addEventListener('click',e=>{const td=e.target.closest('td.editable');if(!td)return;if(selectedCode){paintCell(td,selectedCode);return}});
gridEl.addEventListener('mousedown',e=>{const td=e.target.closest('td.editable');if(!td||!selectedCode)return;isPainting=true;td.classList.add('painting');paintCell(td,selectedCode)});
gridEl.addEventListener('mouseover',e=>{if(!isPainting||!selectedCode)return;const td=e.target.closest('td.editable');if(!td)return;td.classList.add('painting');paintCell(td,selectedCode)});
document.addEventListener('mouseup',()=>{if(isPainting){gridEl.querySelectorAll('td.painting').forEach(td=>td.classList.remove('painting'));isPainting=false}});

// === Legend button selection ===
document.querySelectorAll('.legend-btn').forEach(btn=>{if(btn.dataset.code==='INTERN')return;btn.addEventListener('click',()=>{if(btn.classList.contains('active')){btn.classList.remove('active');selectedCode=null;return}document.querySelectorAll('.legend-btn').forEach(b=>{if(b.dataset.code!=='INTERN')b.classList.remove('active')});btn.classList.add('active');selectedCode=btn.dataset.code;toast(`Modus: ${selectedCode} (nur Zeile: ${meSelect.value})`)})});

// === Navigation ===
function navToMonth(newYear,newMonth){trySaveCurrentRemarks().finally(()=>{curYear=newYear;curMonth=newMonth;render()})}
prevBtn.onclick=()=>{if(curMonth===0){navToMonth(curYear-1,11)}else navToMonth(curYear,curMonth-1)};
nextBtn.onclick=()=>{if(curMonth===11){navToMonth(curYear+1,0)}else navToMonth(curYear,curMonth+1)};
monthSelect.onchange=()=>{navToMonth(curYear,+monthSelect.value)};
yearSelect.onchange=()=>{navToMonth(+yearSelect.value,curMonth)};

// === Dropdowns initialisieren ===
for(let y=YEAR_START;y<=YEAR_END;y++){const o=document.createElement('option');o.value=y;o.textContent=y;yearSelect.appendChild(o)}
for(let m=0;m<12;m++){const o=document.createElement('option');o.value=m;o.textContent=MONTHS_DE[m];monthSelect.appendChild(o)}
yearSelect.value=curYear;monthSelect.value=curMonth;

// === Praktikant Toggle Button ===
const toggleBtn=document.getElementById('toggleIntern');
function updateInternButtonVisual(){ if(isInternActive())toggleBtn.classList.add('intern-on'); else toggleBtn.classList.remove('intern-on'); }
toggleBtn.addEventListener('click',()=>{ setInternActive(!isInternActive()); updateInternButtonVisual(); myName=refreshMeSelect(myName); render(); });
updateInternButtonVisual();

// === Start ===
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js')}
render();
