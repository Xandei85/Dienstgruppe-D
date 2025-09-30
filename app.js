const NAMES=window.APP_CONFIG.NAMES;const YEAR_START=window.APP_CONFIG.YEAR_START;const YEAR_END=window.APP_CONFIG.YEAR_END;const MONTHS_DE=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];const WD=['Mo','Di','Mi','Do','Fr','Sa','So'];
const schoolRanges=[[new Date(2026,0,1),new Date(2026,0,5)],[new Date(2026,1,16),new Date(2026,1,20)],[new Date(2026,2,30),new Date(2026,3,10)],[new Date(2026,4,26),new Date(2026,5,5)],[new Date(2026,7,3),new Date(2026,8,14)],[new Date(2026,10,2),new Date(2026,10,6)],[new Date(2026,10,18),new Date(2026,10,18)]];
function inHolidays(d){return schoolRanges.some(([a,b])=>d>=a&&d<=b)}
function isWorkday(d){const s=(window.APP_CONFIG&&window.APP_CONFIG.START_PATTERN_DATE)||'2026-01-02';const sh=(window.APP_CONFIG&&(window.APP_CONFIG.PATTERN_SHIFT|0))||0;const [sy,sm,sd]=s.split('-').map(n=>parseInt(n,10));const startUTC=Date.UTC(sy,sm-1,sd);const curUTC=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());if(curUTC<startUTC)return false;const delta=Math.floor((curUTC-startUTC)/86400000);const mod=(delta+sh)%4;return mod===0||mod===1}
const monthTitle=document.getElementById('monthTitle');const gridEl=document.getElementById('grid');const monthSelect=document.getElementById('monthSelect');const yearSelect=document.getElementById('yearSelect');const prevBtn=document.getElementById('prevMonth');const nextBtn=document.getElementById('nextMonth');const remarksTA=document.getElementById('monthlyRemarks');const saveRemarksBtn=document.getElementById('saveRemarks');const toastEl=document.getElementById('toast');const meSelect=document.getElementById('meSelect');const remarkDay=document.getElementById('remarkDay');const remarkText=document.getElementById('remarkText');const remarkApply=document.getElementById('remarkApply');NAMES.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;meSelect.appendChild(o)});let myName=NAMES[0];meSelect.value=myName;meSelect.addEventListener('change',()=>{myName=meSelect.value});
let names=[...NAMES];
// Praktikant Toggle persists in localStorage
try{ if(localStorage.getItem('sp:praktikant:on')==='1' && !names.includes('Praktikant')) names=[...names,'Praktikant']; }catch(e){}
 let myName=names[0]; meSelect.value=myName; meSelect.addEventListener('change',()=>{myName=meSelect.value});
let curYear=YEAR_START,curMonth=0,selectedCode=null,isPainting=false;
const undoStack = [];
const redoStack = [];
function pushUndo({day,name,prev,next,prevForce,prevNo}){
  undoStack.push({day,name,prev,next,prevForce,prevNo});
  if(undoStack.length>500) undoStack.shift();
  redoStack.length = 0;
}
function applyCellState(day,name,value,{force,no}={}){
  const td = gridEl.querySelector(`.editable[data-name="${name}"][data-day="${day}"]`);
  if(!td) return;
  td.textContent = value || '';
  td.classList.remove('code-U','code-AA','code-AZA','code-AZA6','code-AZA12','code-GV','code-LG','code-PE','force-yellow','no-yellow');
  if(value==='U') td.classList.add('code-U');
  if(value==='AA') td.classList.add('code-AA');
  if(value==='AZA') td.classList.add('code-AZA');
  if(value==='AZA6') td.classList.add('code-AZA6');
  if(value==='AZA12') td.classList.add('code-AZA12');
  if(value==='GV') td.classList.add('code-GV');
  if(value==='LG') td.classList.add('code-LG');
  if(value==='PE') td.classList.add('code-PE');
  if(force) td.classList.add('force-yellow');
  if(no) td.classList.add('no-yellow');
}
const CODE_HOTKEYS = {'u':'U','a':'AA','z':'AZA','g':'GV','l':'LG','p':'PE','6':'AZA6','2':'AZA12','w':'W2Y','shift+w':'Y2W','backspace':'X','b':'BEER'};
function normalizeKey(ev){const k=ev.key.toLowerCase();return (ev.shiftKey&&k!=='shift')?`shift+${k}`:k;}
document.addEventListener('keydown',(ev)=>{
  if(ev.ctrlKey && ev.key.toLowerCase()==='z'){ev.preventDefault();const a=undoStack.pop();if(!a)return;redoStack.push(a);applyCellState(a.day,a.name,a.prev,{force:a.prevForce,no:a.prevNo});saveCell({year:curYear,month:curMonth+1,day:a.day,name:a.name,value:a.prev}).catch(()=>{});return;}
  if(ev.ctrlKey && ev.key.toLowerCase()==='y'){ev.preventDefault();const a=redoStack.pop();if(!a)return;undoStack.push(a);applyCellState(a.day,a.name,a.next,{force:a.prevForce,no:a.prevNo});saveCell({year:curYear,month:curMonth+1,day:a.day,name:a.name,value:a.next}).catch(()=>{});return;}
  const nk=normalizeKey(ev);const code=CODE_HOTKEYS[nk];if(!code)return;ev.preventDefault();document.querySelectorAll('.legend-btn').forEach(b=>b.classList.remove('active'));const btn=document.querySelector(`.legend-btn[data-code="${code}"]`);if(btn)btn.classList.add('active');selectedCode=code;toast(`Modus: ${selectedCode} (nur Zeile: ${meSelect.value})`);
});
// Enter übernimmt Remark
document.getElementById('remarkText')?.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();document.getElementById('remarkApply')?.click();}});
function toast(m){toastEl.textContent=m;toastEl.classList.add('show');setTimeout(()=>toastEl.classList.remove('show'),1400)}
function render(){selectedCode=null;document.querySelectorAll('.legend-btn').forEach(b=>b.classList.remove('active'));

monthTitle.textContent=`${MONTHS_DE[curMonth]} ${curYear}`;const days=new Date(curYear,curMonth+1,0).getDate();let html='<table><thead><tr>';html+='<th class="name">Name</th>';for(let d=1;d<=days;d++){const dt=new Date(curYear,curMonth,d);const wd=dt.getDay();const wdIdx=(wd+6)%7;const isSa=wdIdx===5,isSo=wdIdx===6;const dayClasses=[];if(inHolidays(dt))dayClasses.push('ferienday');html+=`<th class="${dayClasses.join(' ')}"><div class="daynum">${d}</div><div class="weekday ${isSa?'sat':isSo?'sun':''}">${WD[wdIdx]}</div></th>`}html+='</tr></thead><tbody>';html+='<tr class="day-remarks"><td class="name">Bemerkungen (Tag)</td>';for(let d=1;d<=days;d++){html+=`<td class="day-remark-cell" data-day="${d}"></td>`}html+='</tr>';NAMES.forEach(name=>{html+=`<tr><td class="name">${name}</td>`;for(let d=1;d<=days;d++){const dt=new Date(curYear,curMonth,d);const cls=isWorkday(dt)?'yellow':'';html+=`<td class="editable ${cls}" contenteditable data-name="${name}" data-day="${d}"></td>`}html+='</tr>'});html+='</tbody></table>';gridEl.innerHTML=html;
remarksTA.value='';
Promise.all([loadMonth({year:curYear,month:curMonth+1}),loadRemarks({year:curYear,month:curMonth+1}),loadDayRemarks({year:curYear,month:curMonth+1}),loadOverrides({year:curYear,month:curMonth+1})]).then(([rows,monthRemark,dayMap,ovr])=>{
  rows.forEach(r=>{const sel=`.editable[data-name="${r.name}"][data-day="${r.day}"]`;const cell=gridEl.querySelector(sel);if(cell){cell.textContent=r.value||"";cell.classList.remove('code-U','code-AA','code-AZA','code-AZA6','code-AZA12','code-GV','code-LG','code-PE');if(r.value==='U')cell.classList.add('code-U');if(r.value==='AA')cell.classList.add('code-AA');if(r.value==='AZA')cell.classList.add('code-AZA');if(r.value==='AZA6')cell.classList.add('code-AZA6');if(r.value==='AZA12')cell.classList.add('code-AZA12');if(r.value==='GV')cell.classList.add('code-GV');if(r.value==='LG')cell.classList.add('code-LG');if(r.value==='PE')cell.classList.add('code-PE');}});
  if(typeof monthRemark==='string')remarksTA.value=monthRemark;
  for(const [day,text] of Object.entries(dayMap||{})){const c=gridEl.querySelector(`.day-remark-cell[data-day="${day}"]`);if(c)c.textContent=text||''}
  (ovr||[]).forEach(o=>{const sel=`.editable[data-name="${o.name}"][data-day="${o.day}"]`;const cell=gridEl.querySelector(sel);if(!cell)return;cell.classList.remove('force-yellow','no-yellow');if(o.yellow_override==='on')cell.classList.add('force-yellow');if(o.yellow_override==='off')cell.classList.add('no-yellow')});
}).catch(()=>{});}
function trySaveCurrentRemarks(){const txt=remarksTA.value;return saveRemarks({year:curYear,month:curMonth+1,remarks:txt}).then(()=>true).catch(()=>false)}
saveRemarksBtn.addEventListener('click',()=>{trySaveCurrentRemarks().then(()=>toast('Bemerkungen gespeichert')).catch(()=>toast('Fehler beim Speichern'))});
remarkApply.addEventListener('click',()=>{const d=parseInt(remarkDay.value||'0',10);if(!d){toast('Tag fehlt');return}const t=remarkText.value||'';const cell=gridEl.querySelector(`.day-remark-cell[data-day="${d}"]`);if(cell)cell.textContent=t;saveDayRemark({year:curYear,month:curMonth+1,day:d,text:t}).then(()=>toast('Tagesbemerkung gespeichert')).catch(()=>toast('Fehler'))});
gridEl.addEventListener('click',e=>{const th=e.target.closest('th');if(!th)return;const dnum=th.querySelector('.daynum');if(!dnum)return;const idx=Array.from(th.parentElement.children).indexOf(th);const day=idx;if(!day)return;const cur=(gridEl.querySelector(`.day-remark-cell[data-day="${day}"]`)?.textContent||'').trim();const t=prompt(`Bemerkung für Tag ${day}:`,cur);if(t===null)return;const cell=gridEl.querySelector(`.day-remark-cell[data-day="${day}"]`);if(cell)cell.textContent=t;saveDayRemark({year:curYear,month:curMonth+1,day,text:t}).then(()=>toast('Gespeichert')).catch(()=>toast('Fehler'))});
function paintCell(td,code){if(td.dataset.name!==myName){toast('Nur in deiner Zeile eintragbar');return}
  if(code==='W2Y'){td.classList.remove('no-yellow');td.classList.add('force-yellow');const day=+td.dataset.day;saveOverride({year:curYear,month:curMonth+1,day,name:myName,yellow_override:'on'}).then(()=>toast('Gelb erzwungen')).catch(()=>toast('Fehler'));return}
  if(code==='Y2W'){td.classList.remove('force-yellow');td.classList.add('no-yellow');const day=+td.dataset.day;saveOverride({year:curYear,month:curMonth+1,day,name:myName,yellow_override:'off'}).then(()=>toast('Gelb entfernt')).catch(()=>toast('Fehler'));return}
  td.textContent=(code==='X')?'':(code==='BEER'?'🍺':code);
  td.classList.remove('code-U','code-AA','code-AZA','code-AZA6','code-AZA12','code-GV','code-LG','code-PE');
  if(code==='U')td.classList.add('code-U');
  if(code==='AA')td.classList.add('code-AA');
  if(code==='AZA')td.classList.add('code-AZA');
  if(code==='AZA6')td.classList.add('code-AZA6');
  if(code==='AZA12')td.classList.add('code-AZA12');
  if(code==='GV')td.classList.add('code-GV');
  if(code==='LG')td.classList.add('code-LG');
  if(code==='PE')td.classList.add('code-PE');
  const valueToSave=(code==='BEER'||code==='X')?'':code;
  const day=+td.dataset.day;
  saveCell({year:curYear,month:curMonth+1,day,name:myName,value:valueToSave}).catch(()=>toast('Fehler beim Speichern'));
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

// Praktikant Toggle
const prakBtn = document.querySelector('.legend-btn[data-code="PRAK"]');
if(prakBtn){
  prakBtn.addEventListener('click', ()=>{
    const has = names.includes('Praktikant');
    if(has){
      names = names.filter(n=>n!=='Praktikant');
      try{ localStorage.setItem('sp:praktikant:on','0'); }catch(e){}
      if(myName==='Praktikant'){ myName = names[0]; }
      toast('Praktikant entfernt');
    } else {
      names = [...names, 'Praktikant'];
      try{ localStorage.setItem('sp:praktikant:on','1'); }catch(e){}
      toast('Praktikant hinzugefügt');
    }
    
    render();
  });
}

const prakBtn = document.querySelector('.legend-btn[data-code="PRAK"]');
if(prakBtn){
  prakBtn.addEventListener('click', ()=>{
    const on = praktikantOn();
    try{ localStorage.setItem('sp:praktikant:on', on ? '0' : '1'); }catch(e){}
    
    render();
    toast(on ? 'Praktikant entfernt' : 'Praktikant hinzugefügt');
  });
}
if('serviceWorker'in navigator){navigator.serviceWorker.register('sw.js')}render();
