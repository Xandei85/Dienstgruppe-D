// minimal app with monthly remarks + grid
const CFG=window.APP_CONFIG||{};let NAMES=CFG.NAMES||["Wiesent","Puhl","Botzenhard","Sommer","Schmid"];
const monthTitle=document.getElementById('monthTitle');const meSelect=document.getElementById('meSelect');const gridEl=document.getElementById('grid');
const monthlyTA=document.getElementById('monthlyRemarks');const saveBtn=document.getElementById('saveRemarks');
const months=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
let now=new Date();let curY=now.getFullYear(),curM=now.getMonth();let my=NAMES[0];
function init(){meSelect.innerHTML="";NAMES.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;meSelect.appendChild(o)});meSelect.value=my;meSelect.onchange=()=>my=meSelect.value;render();}
function key(){return `sp:${curY}-${String(curM+1).padStart(2,'0')}:remark`;}
function loadRemark(){monthlyTA.value=localStorage.getItem(key())||"";}
function saveRemark(){localStorage.setItem(key(),monthlyTA.value||"");alert('Bemerkungen gespeichert');}
function render(){const days=new Date(curY,curM+1,0).getDate();let html='<table><thead><tr><th class="row-label">Name</th>';for(let d=1;d<=days;d++){const wd=["So","Mo","Di","Mi","Do","Fr","Sa"][new Date(curY,curM,d).getDay()];html+=`<th>${d}<br>${wd}</th>`}html+='</tr></thead><tbody>';NAMES.forEach(n=>{html+=`<tr><th class="row-label">${n}</th>`;for(let d=1;d<=days;d++){html+='<td class="cell"></td>'}html+='</tr>'});html+='</tbody></table>';gridEl.innerHTML=html;loadRemark();}
init();
// mobile-first collapse
const topbar=document.getElementById('topbar');const panelToggle=document.getElementById('panelToggle');
function setCollapsed(v){if(!topbar)return;topbar.dataset.collapsed=v?'true':'false';if(panelToggle){panelToggle.textContent=v?'⬇︎ Bedienfeld':'⬆︎ Bedienfeld';panelToggle.setAttribute('aria-expanded',(!v).toString());}try{localStorage.setItem('ui:panelCollapsed',v?'1':'0')}catch(e){}}
function getCollapsed(){try{return localStorage.getItem('ui:panelCollapsed')==='1'}catch(e){return false}}
panelToggle?.addEventListener('click',()=>setCollapsed(topbar?.dataset.collapsed!=='true'));
const small=window.matchMedia('(max-width:820px)').matches;if(small&&getCollapsed()!==false){setCollapsed(true)}else{setCollapsed(getCollapsed())}
const __r=render;window.render=function(){__r();try{const grid=document.getElementById('grid');if(!grid)return;const collapsed=topbar?.dataset.collapsed==='true';if(collapsed||small){const rect=grid.getBoundingClientRect();if(rect.top>120){grid.scrollIntoView({behavior:'smooth'})}}}catch(e){}}
