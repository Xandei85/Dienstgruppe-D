/* Schichtkalender – v4 */
const grid = document.getElementById('grid');
const body = document.getElementById('body');
const badgeTpl = document.getElementById('badge-template');
const STORAGE_KEY = (window.SCHICHTKALENDER_CONFIG && window.SCHICHTKALENDER_CONFIG.storageKey) || 'schichtkalender_v4_state';

// --- Selection handling ---
let lastSelectedCell = null;

function clearSelection(){
  grid.querySelectorAll('td.selected').forEach(td=>td.classList.remove('selected'));
}
function toggleSelect(td, multi=false){
  if(!multi) clearSelection();
  td.classList.toggle('selected');
  lastSelectedCell = td;
}
function selectRange(from, to){
  if(!from || !to) return;
  const tds = [...grid.querySelectorAll('tbody td')];
  const a = tds.indexOf(from);
  const b = tds.indexOf(to);
  if(a<0 || b<0) return;
  clearSelection();
  const [start, end] = a<b ? [a,b] : [b,a];
  for(let i=start;i<=end;i++) tds[i].classList.add('selected');
}

// Click to select; Shift+click selects range; Double-click to edit (contenteditable)
grid.addEventListener('click', (e)=>{
  const td = e.target.closest('td');
  if(!td || !grid.contains(td)) return;
  const multi = e.ctrlKey || e.metaKey;
  if(e.shiftKey && lastSelectedCell){
    selectRange(lastSelectedCell, td);
  } else {
    toggleSelect(td, multi);
  }
});

// Enable quick edit on double click: turn cell into contenteditable temporarily
grid.addEventListener('dblclick', (e)=>{
  const td = e.target.closest('td,th.name-col');
  if(!td) return;
  if(td.tagName==='TD'){
    td.setAttribute('contenteditable','true');
    td.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(td);
    sel.removeAllRanges(); sel.addRange(range);
    td.addEventListener('blur', ()=> td.removeAttribute('contenteditable'), {once:true});
  }
});

// --- Helpers for badges ---
function toggleBadgeOnCell(td, cls){
  // if badge exists -> remove; else add
  const existing = td.querySelector('.badge.'+cls);
  if(existing){ existing.remove(); return; }
  const el = badgeTpl.content.firstElementChild.cloneNode(true);
  el.classList.add(cls);
  td.prepend(el);
}

function applyToSelection(fn){
  const sels = grid.querySelectorAll('td.selected');
  if(!sels.length){
    alert('Bitte zuerst mindestens eine Zelle markieren.');
    return;
  }
  sels.forEach(fn);
  saveStateDebounced();
}

// --- Buttons ---
document.getElementById('btnWhiteToYellow').addEventListener('click', ()=>{
  applyToSelection(td => td.classList.add('yellow'));
});
document.getElementById('btnYellowToWhite').addEventListener('click', ()=>{
  applyToSelection(td => td.classList.remove('yellow'));
});
document.getElementById('btnAtza6').addEventListener('click', ()=>{
  applyToSelection(td => toggleBadgeOnCell(td, 'atza6'));
});
document.getElementById('btnAtza12').addEventListener('click', ()=>{
  applyToSelection(td => toggleBadgeOnCell(td, 'atza12'));
});
document.getElementById('btnPraktikant').addEventListener('click', ()=>{
  applyToSelection(td => toggleBadgeOnCell(td, 'praktikant'));
});

document.getElementById('btnAddRow').addEventListener('click', ()=>{
  const tr = document.createElement('tr');
  tr.innerHTML = `<th contenteditable="true" class="name-col">Neuer Name</th>` + '<td></td>'.repeat(7);
  body.appendChild(tr);
  saveStateDebounced();
});
document.getElementById('btnRemoveRow').addEventListener('click', ()=>{
  // remove the last row OR the row containing a selected cell
  const sel = grid.querySelector('td.selected');
  if(sel){
    sel.parentElement.remove();
  } else if(body.lastElementChild){
    body.lastElementChild.remove();
  }
  saveStateDebounced();
});

// --- KW → Datumsbeschriftung füllen ---
function getMondayOfISOWeek(week, year) {
  // ISO week: Thursday in week determines the year
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const ISOweekStart = new Date(simple);
  const diff = (dow <= 4 ? dow-1 : dow-8); // move to Monday
  ISOweekStart.setUTCDate(simple.getUTCDate() - diff);
  return ISOweekStart;
}

document.getElementById('btnFillWeek').addEventListener('click', ()=>{
  const kw = parseInt(document.getElementById('kwInput').value,10);
  const year = parseInt(document.getElementById('yearInput').value,10);
  if(!kw || !year){ alert('Bitte KW und Jahr angeben.'); return; }
  const monday = getMondayOfISOWeek(kw, year);
  const dayNames = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  for(let i=0;i<7;i++){
    const d = new Date(monday); d.setUTCDate(monday.getUTCDate()+i);
    const th = grid.querySelector(`thead th[data-day="${i+1}"]`);
    const label = dayNames[i] + ' ' + d.getUTCDate().toString().padStart(2,'0') + '.' + (d.getUTCMonth()+1).toString().padStart(2,'0') + '.' + d.getUTCFullYear();
    th.textContent = label;
  }
  saveStateDebounced();
});

// --- Persistence ---
function serializeTable(){
  // headers
  const headers = [...grid.querySelectorAll('thead th')].map(th => th.textContent);
  // rows
  const rows = [...body.querySelectorAll('tr')].map(tr => {
    const name = tr.querySelector('th.name-col')?.innerText ?? '';
    const cells = [...tr.querySelectorAll('td')].map(td => ({
      html: td.innerHTML,
      yellow: td.classList.contains('yellow')
    }));
    return {name, cells};
  });
  // remarks
  const remarks = [...grid.querySelectorAll('tfoot td.remark')].map(td => td.innerHTML);
  return { headers, rows, remarks };
}

function deserializeTable(state){
  if(!state) return;
  // headers
  const ths = grid.querySelectorAll('thead th');
  state.headers?.forEach((txt, idx)=>{ if(ths[idx]) ths[idx].textContent = txt; });
  // rows
  body.innerHTML = '';
  (state.rows||[]).forEach(r => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.className = 'name-col';
    th.setAttribute('contenteditable','true');
    th.innerText = r.name || '';
    tr.appendChild(th);
    (r.cells||[]).forEach(c => {
      const td = document.createElement('td');
      td.innerHTML = c.html || '';
      if(c.yellow) td.classList.add('yellow');
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  // remarks
  const remarkTds = grid.querySelectorAll('tfoot td.remark');
  (state.remarks||[]).forEach((h, i)=>{
    if(remarkTds[i]) remarkTds[i].innerHTML = h;
  });
}

function saveState(){
  const state = serializeTable();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  toast('Gespeichert.');
}
let saveTimer;
function saveStateDebounced(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 350);
}
function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){ toast('Kein gespeicherter Stand gefunden.'); return; }
  try{
    const state = JSON.parse(raw);
    deserializeTable(state);
    toast('Geladen.');
  }catch(e){
    console.error(e);
    alert('Fehler beim Laden.');
  }
}
function clearState(){
  if(confirm('Wirklich gesamten lokalen Speicher für diesen Plan löschen?')){
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
}

document.getElementById('btnSave').addEventListener('click', saveState);
document.getElementById('btnLoad').addEventListener('click', loadState);
document.getElementById('btnClear').addEventListener('click', clearState);

// --- Small toast ---
const toastBox = document.createElement('div');
toastBox.style.position = 'fixed';
toastBox.style.bottom = '16px';
toastBox.style.right = '16px';
toastBox.style.zIndex = '9999';
document.body.appendChild(toastBox);

function toast(msg){
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.background = '#111827';
  el.style.border = '1px solid #1f2937';
  el.style.padding = '8px 12px';
  el.style.borderRadius = '10px';
  el.style.marginTop = '8px';
  el.style.boxShadow = '0 6px 20px rgba(0,0,0,.35)';
  toastBox.appendChild(el);
  setTimeout(()=> el.remove(), 1600);
}

// Pre-fill KW/Jahr with current
(function initMeta(){
  const now = new Date();
  const year = now.getFullYear();
  // ISO week number calc
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate()+4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7);
  document.getElementById('kwInput').value = weekNo;
  document.getElementById('yearInput').value = year;
})();
