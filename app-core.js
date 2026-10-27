/* Eco Air Portal v2 - core: connection, read-only guard, data, sign-in, shell, sheets.
 * Reads and writes the same Firestore collections and fields as the current portal. */

var EA = window.EA_CONFIG || {};
var READ_ONLY = EA.READ_ONLY !== false;
var DB = null, STORAGE = null, CURRENT_USER = null;
var BRAND = {name:'',footer:'',logoUrl:'',colorDark:'#143f27',colorMid:'#1b5e38',colorAcc:'#22c55e'};
var S = {clients:[], jobs:[], staff:[], prices:null};   // same shape the tools expect
var _pendingWOs = [];          // shared with the invoice engine
var _selectedWOs = new Set();  // shared with the invoice engine

var D = {
  wos:[], masters:[], measures:[], maps:[], docs:[], lotData:{}, assign:[], invoices:[],
  jobs:[], clients:[], staff:[], reviews:[], modelMasters:{}, lists:{builders:[],sites:[]},
  registry:{builders:[],sites:{}}, staffNames:[], loaded:false
};

var SITE_TASKS = [
  {id:'rough_in',label:'Rough In'},{id:'measure',label:'Measure'},{id:'basement',label:'Basement'},
  {id:'gas_pipe',label:'Gas Pipe'},{id:'line_sets',label:'Line Sets'},{id:'tie_ins',label:'Tie Ins'},
  {id:'hrv',label:'HRV'},{id:'repairs',label:'Repairs'},{id:'completion',label:'Completion'},{id:'meetings',label:'Meetings'}
];
var STAGE_LABELS = {new_lead:'New lead',measuring:'Measuring',estimating:'Estimating',estimate_sent:'Estimate sent',approved:'Approved',
  deposit_paid:'Deposit paid',rough_in:'Rough-in',basement:'Basement',turn_on:'Turn on',complete:'Complete',not_awarded:'Not awarded'};
var WO_TYPE_LABELS = {rough:'Rough-in',bsmt:'Basement',mount:'Mount boots',hour:'Hourly','rough-hiv':'Rough-in (Hi-V)','bsmt-hiv':'Basement (Hi-V)',hiv:'Hi-V',tie_in:'Tie-in',hrv:'HRV'};

/* ───────────────────────── utilities ───────────────────────── */
// Same behaviour as the current portal's esc() (the invoice engine relies on it).
function esc(s){if(!s)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// v2 escaping: keeps 0 and false visible.
function h(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function money(n){return (parseFloat(n)||0).toLocaleString('en-CA',{style:'currency',currency:'CAD'});}
function money0(n){return (parseFloat(n)||0).toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0});}
function compact(n){n=parseFloat(n)||0;return n>=1000?'$'+(n/1000).toFixed(1).replace(/\.0$/,'')+'k':money0(n);}
function pl(n,w,p){return n+' '+(n===1?w:(p||w+'s'));}
function todayISO(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function isoLocal(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function parseISO(s){var p=String(s).slice(0,10).split('-').map(Number);return new Date(p[0],(p[1]||1)-1,p[2]||1);}
function addDays(s,n){var d=parseISO(s);d.setDate(d.getDate()+n);return isoLocal(d);}
function fmtDay(s){if(!s)return '';var d=parseISO(s);if(isNaN(d))return s;return d.toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'});}
function fmtDate(s){if(!s)return '';var d=s.toDate?s.toDate():new Date(s);if(isNaN(d))return String(s).slice(0,10);return d.toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'});}
function normDate(s){s=String(s||'').replace(/\//g,'-').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
async function sha256(str){var buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));return Array.from(new Uint8Array(buf)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');}
function isAdm(){return !!(CURRENT_USER&&CURRENT_USER.role==='admin');}
function meName(){return CURRENT_USER?(CURRENT_USER.name||CURRENT_USER.username):'';}
function meUser(){return CURRENT_USER?CURRENT_USER.username:'';}
function lc(s){return String(s||'').trim().toLowerCase();}

/* Registry so inline handlers can reference objects without escaping them into HTML. */
var REG = [];
function reg(o){REG.push(o);return REG.length-1;}
function R(i){return REG[i];}

/* ───────────────────────── work order / master field helpers (same rules as the current portal) ───────────────────────── */
function getB(w){return w.builder||(w.snapshot&&(w.snapshot.fb||w.snapshot.fbuilder))||'';}
function getS(w){return w.site||(w.snapshot&&(w.snapshot.fp||w.snapshot.fsite))||'';}
function woSnap(w){return w.snapshot||{};}
function woLot(w){return String(w.lot||woSnap(w).fl||'').trim();}
function woBlock(w){return String(w.block||woSnap(w).fblock||'').trim();}
function woUnit(w){return String(w.unit||woSnap(w).funit||'').trim();}
function woTypeRaw(w){var s=woSnap(w);return w.type||s.type||s.ftype||'';}
function woTypeKey(w){var s=woSnap(w),t=woTypeRaw(w);if(s.tier==='hiv'&&t&&t.indexOf('hiv')<0)t=t+'-hiv';return t;}
function woTypeLabel(w){var t=woTypeKey(w);return WO_TYPE_LABELS[t]||(t?t.charAt(0).toUpperCase()+t.slice(1).replace(/_/g,' '):'Work order');}
function woTotal(w){return parseFloat(w.total)||parseFloat(woSnap(w)['s-tot'])||0;}
function woInstaller(w){return w.installer||woSnap(w).fi||'';}
function woDate(w){return normDate(woSnap(w).fd||woSnap(w).fdate||w.date||'')||String(w._savedAt||'').slice(0,10);}
function woId(w){return w._id||w._key||w.num||w.id||'';}
function woLotLabel(w){var p=[];var b=woBlock(w),l=woLot(w),u=woUnit(w);if(b)p.push('Block '+b);if(l)p.push('Lot '+l);if(u)p.push('Unit '+u);return p.join(' · ');}
function masterKey(m){return m._key||m.num||m.id||'';}
function masterModel(m){return m.fmodel||(m.fields&&m.fields.fmodel)||(m.snapshot&&(m.snapshot.fmodel||m.snapshot.fm))||'';}
var MASTER_TYPES={basement:'Basement',rough:'Rough-in'};
/* Master type: set on the record, or saved in the measure form. Returns {key,label} or null. */
function masterType(m){
  var f=(m.snapshot&&m.snapshot._formData&&m.snapshot._formData.fields)||(m.fields)||{};
  var k=m.masterType||f.fmtype||'';if(!k)return null;
  return {key:k,label:MASTER_TYPES[k]||m.masterTypeLabel||(f.fmtypec||'').trim()||'Custom'};
}
function masterTypePill(m){var t=masterType(m);return t?'<span class="pill mtype mt-'+h(t.key)+'">'+h(t.label)+'</span>':'';}
function masterLot(m){return m.lot||(m.snapshot&&m.snapshot.flot)||(m.fields&&m.fields.flot)||'';}
// Staff visibility for work orders and masters, as in the current portal's _canSee().
function canSee(w){
  if(!CURRENT_USER||isAdm())return true;
  if(w._shared===true||w._shared===undefined||w._shared===null)return true;
  var me=CURRENT_USER.username;
  return w._owner===me||w._savedBy===me||w._savedBy===(CURRENT_USER.name||me);
}
// The Work Orders list rules: admins see everything; staff see regular WOs, with their own pending edits replacing the originals.
function visibleWOs(){
  var all=D.wos.filter(function(w){return !w._deleted;});
  if(isAdm())return all;
  var me=meUser();
  var pend=all.filter(function(w){return w._pendingEdit;});
  var mine=pend.filter(function(w){return w._owner===me;});
  var replaced=new Set(mine.map(function(w){return w._pendingEditOf;}));
  return all.filter(function(w){return !w._pendingEdit&&!replaced.has(w._id);}).concat(mine);
}
// Work orders waiting to be invoiced, as on the current dashboard and invoice builder.
function readyToInvoice(){
  var me=meName(),mu=meUser();
  return D.wos.filter(function(w){
    if(w._deleted||w._pendingEdit)return false;
    if(w.status==='invoiced'||w.status==='deleted')return false;
    if(isAdm())return true;
    var by=w._savedBy||w.installer||(w.snapshot&&w.snapshot.fi)||'';
    return by===me||by===mu;
  }).sort(function(a,b){return String(a.date||a._savedAt||'').localeCompare(String(b.date||b._savedAt||''));});
}
function pendingEdits(){return D.wos.filter(function(w){return w._pendingEdit&&!w._deleted;});}

/* lot keys and labels, identical to the current portal so lot_data and assignments line up */
function smJobLabel(lot){var p=[];if(lot.block)p.push('Block '+lot.block);if(lot.num!==undefined&&lot.num!=='')p.push('Lot '+lot.num);if(lot.unit)p.push('Unit '+lot.unit);return p.join(' – ')||'Job';}
function lotShort(lot){var p=[];if(lot.block)p.push('B'+lot.block);if(lot.num!==undefined&&lot.num!=='')p.push(lot.num);if(lot.unit)p.push('U'+lot.unit);return p.join('-')||'?';}
function smLotKey(mapId,lot){
  if(typeof lot!=='object')return mapId+'__'+String(lot).replace(/[^a-zA-Z0-9_-]/g,'_');
  var p=[];
  if(lot.block)p.push('B'+String(lot.block).replace(/[^a-zA-Z0-9]/g,''));
  if(lot.num!==undefined&&lot.num!=='')p.push('L'+String(lot.num).replace(/[^a-zA-Z0-9_-]/g,'_'));
  if(lot.unit)p.push('U'+String(lot.unit).replace(/[^a-zA-Z0-9]/g,''));
  if(!p.length)p.push('job');
  return mapId+'__'+p.join('_');
}
function smModelMasterKey(model){return 'model__'+String(model).toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');}
function defaultTasks(){return SITE_TASKS.map(function(t){return {id:t.id,label:t.label,assignedTo:'',status:'unassigned'};});}
function keyToLabel(k){var p=(String(k).split('__').slice(1).join('__')||String(k));return p.replace(/^B([^_]+)_L/,'Block $1 · Lot ').replace(/_U(.+)$/,' · Unit $1').replace(/^L/,'Lot ').replace(/_/g,' ').trim();}

/* ───────────────────────── toast, activity log ───────────────────────── */
var _toastT;
function showToast(msg,isError){
  var t=document.getElementById('toast');if(!t)return;
  t.textContent=msg;t.className='toast'+(isError?' bad':'');t.hidden=false;
  clearTimeout(_toastT);_toastT=setTimeout(function(){t.hidden=true;},isError?4200:2800);
}
function _logActivity(type,detail){
  if(!DB)return;
  try{DB.collection('activity_log').add({type:type,detail:detail||'',user:meUser(),userName:meName(),at:new Date().toISOString(),_ts:firebase.firestore.FieldValue.serverTimestamp()}).catch(function(){});}catch(e){}
}

/* ───────────────────────── read-only guard ─────────────────────────
 * Patches the Firestore and Storage SDK so every write is refused before it leaves the browser.
 * Covers this app's code, the carried-over invoice engine and the tool bridge alike. */
var _roNoticeT=0;
function readOnlyError(){var e=new Error('Not saved: this preview is read-only.');e.code='read-only';return e;}
function notifyReadOnly(){var now=Date.now();if(now-_roNoticeT>1500){_roNoticeT=now;showToast('Not saved. Saving is off in this preview.',true);}}
function installWriteGuard(){
  var docProto=Object.getPrototypeOf(DB.doc('_guard/_probe'));
  var colProto=Object.getPrototypeOf(DB.collection('_guard'));
  var batchProto=Object.getPrototypeOf(DB.batch());
  var dbProto=Object.getPrototypeOf(DB);
  function wrap(proto,name){
    var orig=proto[name];if(typeof orig!=='function'||orig.__eaGuard)return;
    var f=function(){if(READ_ONLY){notifyReadOnly();return Promise.reject(readOnlyError());}return orig.apply(this,arguments);};
    f.__eaGuard=true;proto[name]=f;
  }
  ['set','update','delete'].forEach(function(m){wrap(docProto,m);});
  wrap(colProto,'add');wrap(batchProto,'commit');wrap(dbProto,'runTransaction');
  if(STORAGE){
    var refProto=Object.getPrototypeOf(STORAGE.ref('_guard'));
    ['put','putString','delete'].forEach(function(m){
      var orig=refProto[m];if(typeof orig!=='function'||orig.__eaGuard)return;
      var f=function(){
        if(!READ_ONLY)return orig.apply(this,arguments);
        notifyReadOnly();var err=readOnlyError();var p=Promise.reject(err);p.catch(function(){});
        if(m==='delete')return p;
        return {on:function(ev,next,fail){if(typeof fail==='function')setTimeout(function(){fail(err);},0);},then:function(a,b){return p.then(a,b);},catch:function(b){return p.catch(b);},cancel:function(){}};
      };
      f.__eaGuard=true;refProto[m]=f;
    });
  }
}
/* Run a save; returns true on success. Shows a clear message when saving is off or fails. */
var LAST_SAVE_ERR='';
function friendlyErr(e){
  var m=String(e&&e.message||e||'');
  if(e&&e.code==='permission-denied'||/insufficient permissions/i.test(m))return 'the database refused it (permission denied). The Firestore security rules are blocking this kind of record.';
  if(e&&e.code==='unavailable'||/offline|network/i.test(m))return 'no connection to the database. Check your internet and try again.';
  return m;
}
async function save(fn,okMsg){
  LAST_SAVE_ERR='';
  if(READ_ONLY){notifyReadOnly();return false;}
  try{await fn();if(okMsg)showToast(okMsg);return true;}
  catch(e){if(e&&e.code==='read-only')return false;console.error(e);LAST_SAVE_ERR=friendlyErr(e);showToast('Could not save: '+LAST_SAVE_ERR,true);return false;}
}

/* ───────────────────────── data ───────────────────────── */
var _subs=[],_changedT=null;
function changed(){clearTimeout(_changedT);_changedT=setTimeout(function(){if(!CURRENT_USER)return;S.jobs=D.jobs;S.clients=D.clients;renderScreen();refreshLiveSheets();if(typeof searchRefresh==='function')searchRefresh();updateBadges();},120);}
// __doc is always the real document id (a record's own _id field can differ, e.g. a pending edit carries the original's _id)
function snapList(snap,idKey){return snap.docs.map(function(d){var o={};o[idKey||'id']=d.id;o=Object.assign(o,d.data());o.__doc=d.id;return o;});}
function docId(x){return x&&(x.__doc||x._id||x.id)||'';}
function watch(q,fn,label){
  try{_subs.push(q.onSnapshot(function(s){fn(s);changed();},function(e){console.warn(label||'listener',e&&e.message);}));}catch(e){console.warn(label,e);}
}
async function getSafe(p,label){try{return await p;}catch(e){console.warn(label||'read',e&&e.message);return null;}}

function loadAll(){
  var admin=isAdm();
  watch(DB.collection('saved_workorder'),function(s){D.wos=snapList(s,'_id');},'work orders');
  watch(DB.collection('saved_masters'),function(s){D.masters=snapList(s,'id');},'masters');
  watch(DB.collection('jobs').orderBy('createdAt','desc'),function(s){D.jobs=snapList(s,'id');S.jobs=D.jobs;},'jobs');
  watch(DB.collection('clients').orderBy('name'),function(s){D.clients=snapList(s,'id');S.clients=D.clients;},'clients');
  watch(admin?DB.collection('assignments'):DB.collection('assignments').where('assignedTo','==',meName()),function(s){D.assign=snapList(s,'_docId');},'assignments');
  return Promise.all([
    loadStaff(),loadMaps(),loadDocs(),loadLotData(),loadInvoices(),loadReviews(),loadModelMasters(),loadMeta(),loadMeasures()
  ]).then(function(){D.loaded=true;changed();});
}
async function loadStaff(){var s=await getSafe(DB.collection('staff').get(),'staff');if(s){D.staff=snapList(s,'id').filter(function(x){return !x._deleted;});S.staff=D.staff;}}
async function loadMaps(){var s=await getSafe(DB.collection('site_maps').get(),'site maps');if(s){D.maps=snapList(s,'_id').filter(function(m){return !m._deleted;});D.maps.sort(function(a,b){return String(b._createdAt||'').localeCompare(String(a._createdAt||''));});}}
async function loadDocs(){var s=await getSafe(DB.collection('site_docs').get(),'site docs');if(s)D.docs=snapList(s,'_id').filter(function(d){return !d._deleted;});}
async function loadLotData(){var s=await getSafe(DB.collection('lot_data').get(),'lot data');if(s){var o={};s.docs.forEach(function(d){o[d.id]=d.data();});D.lotData=o;}}
async function loadInvoices(){var s=await getSafe(DB.collection('invoices').get(),'invoices');if(s)D.invoices=snapList(s,'_id').filter(function(d){return !d._deleted;});}
async function loadReviews(){if(!isAdm())return;var s=await getSafe(DB.collection('pending_review').where('_status','==','pending').get(),'approvals');if(s)D.reviews=snapList(s,'_id');}
async function loadModelMasters(){var s=await getSafe(DB.collection('model_masters').get(),'model masters');if(s){var o={};s.docs.forEach(function(d){o[d.id]=Object.assign({_id:d.id},d.data());});D.modelMasters=o;}}
async function loadMeasures(){var s=await getSafe(DB.collection('saved_measure').get(),'measures');if(s)D.measures=snapList(s,'id').map(function(m){m._docType='measure';return m;}).filter(function(m){return !m._deleted;});}
async function loadMeta(){
  var r=await Promise.all([
    getSafe(DB.collection('meta').doc('lists').get()),getSafe(DB.collection('meta').doc('builder_registry').get()),
    getSafe(DB.collection('meta').doc('staff_names').get()),getSafe(DB.collection('meta').doc('prices').get())
  ]);
  if(r[0]&&r[0].exists)D.lists=Object.assign({builders:[],sites:[]},r[0].data());
  if(r[1]&&r[1].exists)D.registry=Object.assign({builders:[],sites:{}},r[1].data());
  if(r[2]&&r[2].exists)D.staffNames=r[2].data().names||[];
  try{S.prices=_migratePrices(r[3]&&r[3].exists?r[3].data():JSON.parse(JSON.stringify(_DEFAULT_PRICES)));}
  catch(e){S.prices=JSON.parse(JSON.stringify(_DEFAULT_PRICES));}
}
/* All masters (saved_masters + saved_measure), merged like the current Masters screen. */
function allMasters(){
  var seen=new Set(),out=[];
  D.masters.forEach(function(m){if(m._deleted)return;var k=masterKey(m);seen.add(k);out.push(m);});
  D.measures.forEach(function(m){var k=masterKey(m);if(!seen.has(k)){seen.add(k);out.push(m);}});
  return out.sort(function(a,b){return String(b._savedAt||'').localeCompare(String(a._savedAt||''));});
}
function staffNamesForPicker(){
  var names={};D.staff.forEach(function(s){var n=s.name||s.username||s.id;if(n)names[n]=1;});
  return Object.keys(names).sort();
}

/* ───────────────────────── branding ───────────────────────── */
async function loadBranding(){
  var d=await getSafe(DB.collection('meta').doc('branding').get(),'branding');
  if(d&&d.exists)Object.assign(BRAND,d.data());
  /* v2 keeps its own green to match the logo; the old portal's Branding colours aren't applied here. */
}

/* ───────────────────────── sign in ───────────────────────── */
var SESSION_KEY='ea2_staff';
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY));}catch(e){return null;}}
function setSession(u){try{localStorage.setItem(SESSION_KEY,JSON.stringify(u));}catch(e){}}
function clearSession(){try{localStorage.removeItem(SESSION_KEY);}catch(e){}}
function showOnly(id){['boot','login','app'].forEach(function(x){var el=document.getElementById(x);if(el)el.hidden=(x!==id);});}

/* ───────────────────────── shell ───────────────────────── */
var TAB='home';
var NAV={sites:[]};   // drill-down inside the Sites tab
var ICON={
  home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  sites:'<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  schedule:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  more:'<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  wo:'<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  measure:'<path d="M3 17L17 3l4 4L7 21H3z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  estimate:'<path d="M6 3h9l3 3v15H6z"/><path d="M9 13l2 2 4-4"/>',
  invoice:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  job:'<path d="M14.5 5.5a4 4 0 0 0 4.9 4.9L11 18.8a2 2 0 1 1-2.8-2.8l8.4-8.4"/>',
  map:'<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/>',
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  client:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>'
};
function svg(k){return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">'+(ICON[k]||'')+'</svg>';}
var TABS=[['home','Home'],['sites','Sites'],['schedule','Schedule'],['more','More']];
function renderTabs(){
  var badge=isAdm()?approvalCount():0;
  document.getElementById('tabs').innerHTML=TABS.map(function(t){
    return '<button '+(TAB===t[0]?'aria-current="page"':'')+' onclick="App.tab(\''+t[0]+'\')">'+svg(t[0])+t[1]+(t[0]==='more'&&badge?'<span class="badge">'+badge+'</span>':'')+'</button>';
  }).join('');
}
function updateBadges(){if(CURRENT_USER)renderTabs();}
var _screenScroll={};
function renderScreen(keepScroll){
  if(!CURRENT_USER)return;
  var el=document.getElementById('screen');
  var y=window.scrollY;
  var fn=SCREENS[TAB];
  el.innerHTML=fn?fn():'';
  renderTabs();
  if(keepScroll!==false)window.scrollTo(0,y);
  if(typeof afterScreenRender==='function')afterScreenRender();
}
function approvalCount(){return D.reviews.length+pendingEdits().length;}
var SCREENS={};   // filled by app-screens.js and app-sites.js

/* ───────────────────────── sheets (full-screen panels) ───────────────────────── */
var STACK=[];
var SHEETS={};    // filled by the other files
function curSheet(){return STACK[STACK.length-1];}
function renderSheet(i,err){
  var e=STACK[i];if(!e)return;
  var el=document.getElementById('sh'+i),fresh=false;
  if(el&&e.static)return;   // builders and the invoice engine own their DOM; never redraw them
  if(!el){
    el=document.createElement('div');el.id='sh'+i;el.className='sheet enter';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
    el.style.zIndex=30+i;document.getElementById('sheets').appendChild(el);fresh=true;
  }
  var prev=el.querySelector('.sh-body'),scroll=prev&&!err?prev.scrollTop:0;
  var v;
  window._E=e;
  try{v=SHEETS[e.type](e)||{};}catch(ex){console.error(ex);v={title:'Something went wrong',body:'<div class="sec"><p>'+h(ex.message)+'</p></div>'};}
  e._title=v.title;
  el.classList.toggle('wide',!!v.wide);
  el.setAttribute('aria-label',v.title||'');
  if(v.raw){el.innerHTML=v.raw;}
  else{
    el.innerHTML='<header class="sh-head"><button class="x" aria-label="'+(i>0?'Back':'Close')+'" onclick="App.pop()">'+(i>0?'‹':'×')+'</button><h2>'+h(v.title||'')+(v.sub?'<span class="sub">'+h(v.sub)+'</span>':'')+'</h2>'+(v.action||'<span></span>')+'</header>'
      +(err?'<p class="err" role="alert">'+h(err)+'</p>':'')
      +'<div class="sh-body'+(v.plain?' plain':'')+'">'+(v.body||'')+'</div>'+(v.foot?'<div class="sh-foot">'+v.foot+'</div>':'');
    var b=el.querySelector('.sh-body');if(b)b.scrollTop=scroll;
  }
  if(typeof v.after==='function')v.after(el,e);
  if(fresh){var x=el.querySelector('.x');if(x)x.focus({preventScroll:true});}
}
function push(e){STACK.push(e);document.body.classList.add('locked');renderSheet(STACK.length-1);}
function rerender(err){if(STACK.length)renderSheet(STACK.length-1,err);}
function popSheet(n){
  n=n||1;
  while(n-->0&&STACK.length){
    var i=STACK.length-1,e=STACK.pop();
    if(e&&typeof e.onClose==='function'){try{e.onClose(e);}catch(x){}}
    var el=document.getElementById('sh'+i);if(el)el.remove();
  }
  if(STACK.length)renderSheet(STACK.length-1);else document.body.classList.remove('locked');
  renderScreen();
}
function refreshLiveSheets(){STACK.forEach(function(e,i){if(e.live)renderSheet(i);});}

/* simple confirm sheet that returns a promise */
function ask(title,message,buttons){
  return new Promise(function(resolve){
    push({type:'ask',title:title,message:message,buttons:buttons||[{label:'OK',value:true}],resolve:resolve,onClose:function(e){if(!e._done)resolve(null);}});
  });
}
SHEETS.ask=function(e){
  return {title:e.title,plain:true,
    body:'<div class="sec"><p style="line-height:1.5">'+e.message+'</p></div>',
    foot:e.buttons.map(function(b,i){return '<button class="btn '+(b.style||'')+'" onclick="App.answer('+i+')">'+h(b.label)+'</button>';}).join('')};
};
