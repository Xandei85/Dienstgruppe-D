const NAMES=window.APP_CONFIG.NAMES;const YEAR_START=window.APP_CONFIG.YEAR_START;const YEAR_END=window.APP_CONFIG.YEAR_END;const MONTHS_DE=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];const WD=['Mo','Di','Mi','Do','Fr','Sa','So'];
const schoolRanges=[[new Date(2026,0,1),new Date(2026,0,5)],[new Date(2026,1,16),new Date(2026,1,20)],[new Date(2026,2,30),new Date(2026,3,10)],[new Date(2026,4,26),new Date(2026,5,5)],[new Date(2026,7,3),new Date(2026,8,14)],[new Date(2026,10,2),new Date(2026,10,6)],[new Date(2026,10,18),new Date(2026,10,18)]];
function inHolidays(d){return schoolRanges.some(([a,b])=>d>=a&&d<=b)}
function isWorkday(d){const s=(window.APP_CONFIG&&window.APP_CONFIG.START_PATTERN_DATE)||'2026-01-02';const sh=(window.APP_CONFIG&&(window.APP_CONFIG.PATTERN_SHIFT|0))||0;const [sy,sm,sd]=s.split('-').map(n=>parseInt(n,10));const startUTC=Date.UTC(sy,sm-1,sd);const curUTC=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());if(curUTC<startUTC)return false;const delta=Math.floor((curUTC-startUTC)/86400000);const mod=(delta+sh)%4;return mod===0||mod===1}
const monthTitle=document.getElementById('monthTitle');const gridEl=document.getElementById('grid');const monthSelect=document.getElementById('monthSelect');const yearSelect=document.getElementById('yearSelect');const prevBtn=document.getElementById('prevMonth');const nextBtn=document.getElementById('nextMonth');const remarksTA=document.getElementById('monthlyRemarks');const saveRemarksBtn=document.getElementById('saveRemarks');const toastEl=document.getElementById('toast');const meSelect=document.getElementById('meSelect');const remarkDay=document.getElementById('remarkDay');const remarkText=document.getElementById('remarkText');const remarkApply=document.getElementById('remarkApply');
let myName = refreshMeSelect(); document.getElementById('meSelect').addEventListener('change',()=>{myName=document.getElementById('meSelect').value});
let curYear=YEAR_START,curMonth=0,selectedCode=null,isPainting=false;
// ---- Praktikant Toggle (persisted) ----
const INTERN_FLAG_KEY = 'sp:intern:active';
function isInternActive(){ return localStorage.getItem(INTERN_FLAG_KEY)==='1'; }
function setInternActive(v){ localStorage.setItem(INTERN_FLAG_KEY, v?'1':'0'); }

function getActiveNames(){
  const base = [...window.APP_CONFIG.NAMES];
  if(isInternActive() && !base.includes('Praktikant')) base.push('Praktikant');
  return base;
}

// update meSelect options according to active names
function refreshMeSelect(current){
  const names = getActiveNames();
  const sel = document.getElementById('meSelect');
  sel.innerHTML='';
  names.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o); });
  if(current && names.includes(current)){ sel.value=current; } else { sel.value=names[0]; }
  return sel.value;
}
function toast(m){toastEl.textContent=m;toastEl.classList.add('show');setTimeout(()=>toastEl.classList.remove('show'),1400)}
// Geburtstage
const BIRTHDAYS={'Wiesent':{y:1992,m:9,d:1},'Vizent':{y:1992,m:9,d:1},'Puhl':{y:1984,m:4,d:7},'Botzenhard':{y:1985,m:4,d:11},'Sommer':{y:1985,m:5,d:23},'Schmid':{y:1990,m:4,d:8}};
function ageOn(name,year){const b=BIRTHDAYS[name]||null;if(!b)return null;return year-b.y;}
function birthdaysFor(year,month){const list=[];for(const [name,b] of Object.entries(BIRTHDAYS)){if(b.m-1===month){list.push({day:b.d,name,age:ageOn(name,year)})}}return list.sort((a,b)=>a.day-b.day)}
function render(){selectedCode=null;document.querySelectorAll('.legend-btn').forEach(b=>b.classList.remove('active'));monthTitle.textContent=`${MONTHS_DE[curMonth]} ${curYear}`;const days=new Date(curYear,curMonth+1,0).getDate();let html='<table><thead><tr>';html+='<th class="name">Name</th>';for(let d=1;d<=days;d++){const dt=new Date(curYear,curMonth,d);const wd=dt.getDay();const wdIdx=(wd+6)%7;const isSa=wdIdx===5,isSo=wdIdx===6;const dayClasses=[];if(inHolidays(dt))dayClasses.push('ferienday');html+=`<th class="${dayClasses.join(' ')}"><div class="daynum">${d}</div><div class="weekday ${isSa?'sat':isSo?'sun':''}">${WD[wdIdx]}</div></th>`}html+='</tr></thead><tbody>';html+='<tr class="day-remarks"><td class="name">Bemerkungen (Tag)</td>';for(let d=1;d<=days;d++){html+=`<td class="day-remark-cell" data-day="${d}"></td>`}html+='</tr>';getActiveNames().forEach(name=>{html+=`<tr><td class="name">${name}</td>`;for(let d=1;d<=days;d++){const dt=new Date(curYear,curMonth,d);const cls=isWorkday(dt)?'yellow':'';html+=`<td class="editable ${cls}" contenteditable data-name="${name}" data-day="${d}"></td>`}html+='</tr>'});html+='</tbody></table>';gridEl.innerHTML=html;
  const bdays=birthdaysFor(curYear,curMonth);bdays.forEach(b=>{const cell=gridEl.querySelector(`.day-remark-cell[data-day="${b.day}"]`);if(cell){const existing=cell.textContent||'';const add=`GEB: ${b.name} (${b.age})`;cell.textContent=existing?(existing+'; '+add):add;}});
  loadRemarks({year:curYear,month:curMonth+1}).then((monthRemark)=>{if(!monthRemark){const line=bdays.length?('Geburtstage: '+bdays.map(b=>`${String(b.day).padStart(2,'0')}.${String(curMonth+1).padStart(2,'0')} ${b.name} (${b.age})`).join('; ')):'';remarksTA.value=line;}else{remarksTA.value=monthRemark;}});
  Promise.all([loadMonth({year:curYear,month:curMonth+1}),loadDayRemarks({year:curYear,month:curMonth+1}),loadOverrides({year:curYear,month:curMonth+1})]).then(([rows,dayMap,ovr])=>{
    rows.filter(r=>r.name!=='Praktikant').forEach(r=>{const sel=`.editable[data-name="${r.name}"][data-day="${r.day}"]`;const cell=gridEl.querySelector(sel);if(cell){cell.textContent=r.value||"";cell.classList.remove('code-U','code-AA','code-AZA','code-AZA6','code-AZA12','code-GV','code-LG','code-PE','code-GEB');if(r.value==='U')cell.classList.add('code-U');if(r.value==='AA')cell.classList.add('code-AA');if(r.value==='AZA')cell.classList.add('code-AZA');if(r.value==='AZA6')cell.classList.add('code-AZA6');if(r.value==='AZA12')cell.classList.add('code-AZA12');if(r.value==='GV')cell.classList.add('code-GV');if(r.value==='LG')cell.classList.add('code-LG');if(r.value==='PE')cell.classList.add('code-PE');if(r.value==='GEB')cell.classList.add('code-GEB');}});
    for(const [day,text] of Object.entries(dayMap||{})){const c=gridEl.querySelector(`.day-remark-cell[data-day="${day}"]`);if(c&&text){c.textContent=c.textContent?(c.textContent+'; '+text):text}}
    (ovr||[]).forEach(o=>{const sel=`.editable[data-name="${o.name}"][data-day="${o.day}"]`;const cell=gridEl.querySelector(sel);if(!cell)return;cell.classList.remove('force-yellow','no-yellow');if(o.yellow_override==='on')cell.classList.add('force-yellow');if(o.yellow_override==='off')cell.classList.add('no-yellow')});
  }).catch(()=>{});
}
function trySaveCurrentRemarks(){const txt=remarksTA.value;return saveRemarks({year:curYear,month:curMonth+1,remarks:txt}).then(()=>true).catch(()=>false)}
saveRemarksBtn.addEventListener('click',()=>{trySaveCurrentRemarks().then(()=>toast('Bemerkungen gespeichert')).catch(()=>toast('Fehler'))});
document.getElementById('remarkApply').addEventListener('click',()=>{const d=parseInt(remarkDay.value||'0',10);if(!d){toast('Tag fehlt');return}const t=remarkText.value||'';const cell=gridEl.querySelector(`.day-remark-cell[data-day="${d}"]`);if(cell)cell.textContent=cell.textContent?(cell.textContent+'; '+t):t;saveDayRemark({year:curYear,month:curMonth+1,day:d,text:t}).then(()=>toast('Tagesbemerkung gespeichert')).catch(()=>toast('Fehler'))});
function paintCell(td,code){if(td.dataset.name!==myName){toast('Nur in deiner Zeile eintragbar');return}
  if(code==='W2Y'){td.classList.remove('no-yellow');td.classList.add('force-yellow');const day=+td.dataset.day;(myName==='Praktikant'? lsSaveOverride({year:curYear,month:curMonth+1,day,name:myName,yellow_override:'on'}) : saveOverride({year:curYear,month:curMonth+1,day,name:myName,yellow_override:'on'}).then(()=>toast('Gelb erzwungen')).catch(()=>toast('Fehler')));return}
  if(code==='Y2W'){td.classList.remove('force-yellow');td.classList.add('no-yellow');const day=+td.dataset.day;(myName==='Praktikant'? lsSaveOverride({year:curYear,month:curMonth+1,day,name:myName,yellow_override:'off'}) : saveOverride({year:curYear,month:curMonth+1,day,name:myName,yellow_override:'off'}).then(()=>toast('Gelb entfernt')).catch(()=>toast('Fehler')));return}
  td.textContent=(code==='X')?'':(code==='BEER'?'🍺':code);
  td.classList.remove('code-U','code-AA','code-AZA','code-AZA6','code-AZA12','code-GV','code-LG','code-PE','code-GEB');
  if(code==='U')td.classList.add('code-U'); if(code==='AA')td.classList.add('code-AA'); if(code==='AZA')td.classList.add('code-AZA'); if(code==='AZA6')td.classList.add('code-AZA6'); if(code==='AZA12')td.classList.add('code-AZA12');
  if(code==='GV')td.classList.add('code-GV'); if(code==='LG')td.classList.add('code-LG'); if(code==='PE')td.classList.add('code-PE'); if(code==='GEB')td.classList.add('code-GEB');
  const valueToSave=(code==='BEER'||code==='X')?'':code; const day=+td.dataset.day; (myName==='Praktikant' ? lsSaveEntry({year:curYear,month:curMonth+1,day,name:myName,value:valueToSave}) : saveCell({year:curYear,month:curMonth+1,day,name:myName,value:valueToSave}).catch(()=>toast('Fehler beim Speichern')));
}
gridEl.addEventListener('click',e=>{const td=e.target.closest('td.editable');if(!td)return;if(selectedCode){paintCell(td,selectedCode);return}});
gridEl.addEventListener('mousedown',e=>{const td=e.target.closest('td.editable');if(!td||!selectedCode)return;isPainting=true;td.classList.add('painting');paintCell(td,selectedCode)});
gridEl.addEventListener('mouseover',e=>{if(!isPainting||!selectedCode)return;const td=e.target.closest('td.editable');if(!td)return;td.classList.add('painting');paintCell(td,selectedCode)});
document.addEventListener('mouseup',()=>{if(isPainting){gridEl.querySelectorAll('td.painting').forEach(td=>td.classList.remove('painting'));isPainting=false}});
document.querySelectorAll('.legend-btn').forEach(btn=>{btn.addEventListener('click',()=>{if(btn.classList.contains('active')){btn.classList.remove('active');selectedCode=null;return}document.querySelectorAll('.legend-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');selectedCode=btn.dataset.code;toast(`Modus: ${selectedCode} (nur Zeile: ${meSelect.value})`)})});
function navToMonth(newYear,newMonth){trySaveCurrentRemarks().finally(()=>{curYear=newYear;curMonth=newMonth;render()})}
prevBtn.onclick=()=>{if(curMonth===0){navToMonth(curYear-1,11)}else navToMonth(curYear,curMonth-1)};
nextBtn.onclick=()=>{if(curMonth===11){navToMonth(curYear+1,0)}else navToMonth(curYear,curMonth+1)};
monthSelect.onchange=()=>{navToMonth(curYear,+monthSelect.value)};yearSelect.onchange=()=>{navToMonth(+yearSelect.value,curMonth)};
for(let y=YEAR_START;y<=YEAR_END;y++){const o=document.createElement('option');o.value=y;o.textContent=y;yearSelect.appendChild(o)}for(let m=0;m<12;m++){const o=document.createElement('option');o.value=m;o.textContent=MONTHS_DE[m];monthSelect.appendChild(o)}yearSelect.value=curYear;monthSelect.value=curMonth;
// Toggle button wire-up
const toggleBtn = document.getElementById('toggleIntern');
function updateInternButtonVisual(){
  if(isInternActive()){ toggleBtn.classList.add('intern-on'); }
  else { toggleBtn.classList.remove('intern-on'); }
}
toggleBtn.addEventListener('click',()=>{
  setInternActive(!isInternActive());
  updateInternButtonVisual();
  // Refresh selection and re-render with new person added/removed
  myName = refreshMeSelect(myName);
  render();
});
// Set initial visual state
updateInternButtonVisual();

if('serviceWorker'in navigator){navigator.serviceWorker.register('sw.js')}render();
