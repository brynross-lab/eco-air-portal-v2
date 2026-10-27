/* Eco Air Portal v2 - Home, Schedule, More, and the lists reached from them. */

var App = {};

/* ───────────────────────── start, sign in, sign out ───────────────────────── */
App.start = async function(){
  document.body.classList.toggle('ro',READ_ONLY);
  document.getElementById('roBanner').hidden=!READ_ONLY;
  var setRoH=function(){var bn=document.getElementById('roBanner');document.documentElement.style.setProperty('--ro-h',(READ_ONLY&&bn?bn.offsetHeight:0)+'px');};
  setRoH();window.addEventListener('resize',setRoH);
  var msg=document.getElementById('bootMsg');
  if(typeof firebase==='undefined'){msg.textContent='Could not load Firebase. Check the internet connection and reload.';return;}
  try{
    if(!firebase.apps.length)firebase.initializeApp(EA.FIREBASE);
    DB=firebase.firestore();
    try{STORAGE=firebase.storage();}catch(e){STORAGE=null;}
    installWriteGuard();
  }catch(e){msg.textContent='Could not connect: '+e.message;return;}
  window.addEventListener('message',portalMessage);
  loadBranding();
  var s=getSession();
  if(s&&s.username){
    var d=await getSafe(DB.collection('staff').doc(s.username).get(),'session');
    if(d&&d.exists&&!d.data()._deleted){CURRENT_USER=Object.assign({username:s.username},d.data());return boot();}
    clearSession();
  }
  showOnly('login');setTimeout(function(){var u=document.getElementById('lgUser');if(u)u.focus();},50);
};
App.login = async function(){
  var u=lc(document.getElementById('lgUser').value),p=document.getElementById('lgPass').value;
  var err=document.getElementById('lgErr'),btn=document.getElementById('lgBtn');
  err.hidden=true;
  if(!u||!p){err.textContent='Enter your username and password.';err.hidden=false;return;}
  btn.disabled=true;btn.textContent='Signing in…';
  try{
    var hash=await sha256(p);
    var d=await DB.collection('staff').doc(u).get();
    if(!d.exists||d.data()._deleted||d.data().passwordHash!==hash){
      err.textContent='That username and password don\'t match. Check them and try again.';err.hidden=false;
      document.getElementById('lgPass').value='';
    }else{
      CURRENT_USER=Object.assign({username:u},d.data());setSession({username:u});boot();
    }
  }catch(e){err.textContent='Could not reach the database: '+e.message;err.hidden=false;}
  btn.disabled=false;btn.textContent='Sign in';
};
function boot(){
  showOnly('app');
  TAB='home';renderScreen();
  loadAll();
  if(typeof preloadTools==='function')preloadTools();
}
App.logout = function(){
  _subs.forEach(function(u){try{u();}catch(e){}});_subs=[];
  while(STACK.length)popSheet();
  clearSession();CURRENT_USER=null;
  D.loaded=false;
  document.getElementById('lgPass').value='';
  showOnly('login');
};
App.explainReadOnly = function(){
  ask('Preview mode','This version of the portal reads your live data, but saving is switched off. Anything you change here is thrown away, and the current portal is never touched.<br><br>When you\'re happy with it, set <b>READ_ONLY</b> to <b>false</b> in <b>config.js</b> and redeploy. Export a Firestore backup first.',[{label:'Got it',value:true}]);
};
App.tab = function(t){TAB=t;if(t==='sites'&&App._sitesTabTap)App._sitesTabTap();window.scrollTo(0,0);renderScreen(false);};
App.pop = function(){var e=curSheet();if(e&&typeof e.beforeClose==='function'){e.beforeClose(e).then(function(ok){if(ok!==false)popSheet();});return;}popSheet();};
App.answer = function(i){var e=curSheet();if(!e||e.type!=='ask')return;e._done=true;var v=e.buttons[i].value;popSheet();e.resolve(v);};
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&STACK.length)App.pop();});

/* ───────────────────────── New menu ───────────────────────── */
App.newMenu = function(){push({type:'newMenu'});};
SHEETS.newMenu = function(){
  var items=[
    ['wo','Work order','Start a work order for any builder and lot','App.pop();openNewWO()'],
    ['measure','Measure sheet','Take measurements and save a master','App.pop();openToolCore(\'measure\',\'Measure sheet\')'],
    ['estimate','Estimate','Itemized estimate with taxes and upgrades','App.pop();openToolCore(\'estimate\',\'Estimate\')'],
    ['invoice','Invoice','Bill work orders that are ready to invoice','App.pop();App.openInvoice()']
  ];
  if(isAdm()){
    items.push(['job','Job','Track a lead or project in the pipeline','App.pop();App.editJob()']);
    items.push(['upload','Site map','Upload a site plan and mark the lots','App.pop();App.uploadMap()']);
  }
  return {title:'New',plain:true,body:'<div class="menu">'+items.map(function(i){return '<button onclick="'+i[3]+'"><i>'+svg(i[0])+'</i><div>'+i[1]+'<span>'+i[2]+'</span></div></button>';}).join('')+'</div>'};
};

/* ───────────────────────── assignments (validated like the current dashboard, but never deleted here) ───────────────────────── */
function lotIndex(){
  var idx={};
  D.maps.forEach(function(m){(m.lots||[]).forEach(function(l){idx[smLotKey(m._id,l)]={map:m,lot:l};});});
  return idx;
}
function validAssignments(){
  var idx=lotIndex(),me=meName();
  return D.assign.filter(function(a){
    if(a.status!=='active'||!a._mapId||!a._jobKey||!a._taskId)return false;
    if(!isAdm()&&a.assignedTo!==me)return false;
    var hit=idx[a._jobKey];if(!hit||hit.map._closed)return false;
    var ld=D.lotData[a._jobKey];
    var task=((ld&&ld.tasks)||[]).find(function(t){return t.id===a._taskId;});
    if(!task)return !ld;  // no lot_data yet: keep, same as the current portal on read errors
    return task.status!=='complete'&&task.assignedTo===a.assignedTo;
  });
}
function groupAssignments(list){
  var idx=lotIndex(),g={};
  list.forEach(function(a){
    var k=a._jobKey;if(!g[k])g[k]={key:k,hit:idx[k],builder:a.builder,site:a.site,mapName:a.mapName,tasks:[]};
    g[k].tasks.push(a);
  });
  return Object.values(g);
}
function openFlags(){
  var idx=lotIndex(),out=[];
  Object.keys(D.lotData).forEach(function(k){
    (D.lotData[k].flags||[]).forEach(function(f){if(!f.resolved)out.push(Object.assign({},f,{_lotKey:k,_hit:idx[k]}));});
  });
  return out.sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));});
}
function followUpsDue(){var t=todayISO();return D.jobs.filter(function(j){return j.followupDate&&j.followupDate<=t&&j.stage!=='not_awarded'&&j.stage!=='complete'&&jobVisible(j);});}
function jobVisible(j){return isAdm()||(j.assignedStaff||[]).indexOf(meUser())>=0;}

/* ───────────────────────── Home ───────────────────────── */
SCREENS.home = function(){
  var hr=new Date().getHours(),greet=hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  var first=(meName()||'').split(' ')[0];
  var html='<p class="date">'+new Date().toLocaleDateString('en-CA',{weekday:'long',month:'long',day:'numeric'})+'</p><h1>'+h(greet+(first?', '+first:''))+'</h1>';
  if(!D.loaded&&!D.wos.length)return html+'<div class="blk"><div class="card"><p class="empty">Loading your work…</p></div></div>';

  // Today: work orders dated today and jobs scheduled today
  var t=todayISO();
  var todays=visibleWOs().filter(function(w){return woDate(w)===t&&(isAdm()||lc(woInstaller(w))===lc(meName()));})
    .map(function(w){return {kind:'wo',w:w};})
    .concat(D.jobs.filter(function(j){return j.scheduledDate===t&&jobVisible(j);}).map(function(j){return {kind:'job',j:j};}));
  html+='<div class="blk"><div class="blk-h"><h2>Today</h2><button class="link" onclick="App.tab(\'schedule\')">Schedule</button></div><div class="card">'
    +(todays.length?todays.map(function(x){
      if(x.kind==='job')return '<div class="lrow"><button class="lmain" onclick="App.editJob(\''+h(x.j.id)+'\')"><span class="top"><b>'+h(x.j.title||'Job')+'</b></span><span class="s">'+h(x.j.clientName||'')+'</span></button><span class="chev">›</span></div>';
      var w=x.w;return '<div class="lrow"><button class="lmain" onclick="openWOInTool(R('+reg(w)+'))"><span class="top"><b>'+h(woLotLabel(w)||getS(w)||'Work order')+'</b><span class="pill">'+h(woTypeLabel(w))+'</span></span><span class="s">'+h([getB(w),getS(w)].filter(Boolean).join(' · '))+'</span><span class="s">'+h(woInstaller(w))+'</span></button><span class="chev">›</span></div>';
    }).join(''):'<p class="empty">Nothing on the schedule today.</p>')+'</div></div>';

  // My work (assigned lot tasks)
  var groups=groupAssignments(validAssignments());
  if(groups.length||!isAdm()){
    html+='<div class="blk"><h2>'+(isAdm()?'Assigned work':'My work')+'</h2><div class="card">'
      +(groups.length?groups.slice(0,8).map(function(g){
        var label=g.hit?smJobLabel(g.hit.lot):keyToLabel(g.key);
        var where=[g.builder,g.hit?g.hit.map.site:g.site].filter(Boolean).join(' · ');
        var tasks=g.tasks.map(function(a){return a._taskLabel+(isAdm()?' ('+a.assignedTo+')':'');}).join(', ');
        return '<div class="lrow"><button class="lmain" onclick="App.openLotByKey(\''+h(g.key)+'\')"><span class="top"><b>'+h(label)+'</b></span><span class="s">'+h(where)+'</span><span class="s">'+h(tasks)+'</span></button><span class="chev">›</span></div>';
      }).join('')+(groups.length>8?'<div class="lrow"><button class="lmain" onclick="App.assigned()"><b>See all '+groups.length+'</b></button><span class="chev">›</span></div>':'')
      :'<p class="empty">No lot tasks assigned to you.</p>')+'</div></div>';
  }

  // To do
  var todo=[];
  var ready=readyToInvoice(),readySum=ready.reduce(function(s,w){return s+woTotal(w);},0);
  if(isAdm()){
    var ap=approvalCount();if(ap)todo.push(['bad',pl(ap,'approval')+' waiting','Work order edits and share requests','App.approvals()']);
  }else{
    var myEdits=pendingEdits().filter(function(w){return w._owner===meUser();});
    if(myEdits.length)todo.push(['info',pl(myEdits.length,'edit')+' waiting for approval','An admin will review your changes','App.myEdits()']);
  }
  if(ready.length)todo.push(['warn',pl(ready.length,'work order')+' ready to invoice','Worth '+compact(readySum)+' before HST','App.openInvoice()']);
  var fl=openFlags();if(fl.length)todo.push(['bad',pl(fl.length,'open flag'),'Unfinished work and missing material','App.flags()']);
  var fu=followUpsDue();if(fu.length)todo.push(['warn',pl(fu.length,'follow-up')+' due','Jobs with a follow-up date today or earlier','App.jobs(\'followups\')']);
  if(isAdm()&&groups.length)todo.push(['info',pl(groups.reduce(function(s,g){return s+g.tasks.length;},0),'task')+' assigned, not done','Across '+pl(groups.length,'lot'),'App.assigned()']);
  html+='<div class="blk"><h2>To do</h2><div class="card">'+(todo.length?todo.map(function(x){
    return '<div class="lrow"><span class="dot '+x[0]+'"></span><button class="lmain" onclick="'+x[3]+'"><b>'+h(x[1])+'</b><span class="s">'+h(x[2])+'</span></button><span class="chev">›</span></div>';
  }).join(''):'<p class="empty">You\'re all caught up.</p>')+'</div></div>';

  if(isAdm()){
    var m=t.slice(0,7);
    var invMonth=D.invoices.filter(function(i){return String(i._savedAt||'').slice(0,7)===m;}).reduce(function(s,i){return s+(parseFloat(i.lotTotal)||0);},0);
    var activeSites=D.maps.filter(function(x){return !x._closed;}).length;
    var pipe=D.jobs.filter(function(j){return ['complete','not_awarded'].indexOf(j.stage)<0;}).reduce(function(s,j){return s+(parseFloat(j.estimateValue)||0);},0);
    html+='<div class="blk"><h2>Business health</h2><div class="card">'
      +'<div class="stat"><div>Ready to invoice<span>'+pl(ready.length,'work order')+', before HST</span></div><b>'+money0(readySum)+'</b></div>'
      +'<div class="stat"><div>Invoiced this month<span>'+new Date().toLocaleDateString('en-CA',{month:'long'})+', before HST</span></div><b>'+money0(invMonth)+'</b></div>'
      +'<div class="stat"><div>Active sites<span>With a site map</span></div><b>'+activeSites+'</b></div>'
      +'<div class="stat"><div>Open pipeline<span>Jobs not complete or lost</span></div><b>'+money0(pipe)+'</b></div>'
      +'</div></div>';
  }
  return html;
};

/* ───────────────────────── Schedule ───────────────────────── */
var SCHED={date:todayISO(),who:null};
function scheduleEvents(){
  var ev=[];
  D.wos.forEach(function(w){
    if(w._deleted)return;var s=woSnap(w);var d=normDate(s.fd||s.fdate||'');if(!d)return;
    var payees=[];if(s.payees)try{payees=JSON.parse(s.payees);}catch(e){}
    var inst=s.fi||w.builder||'';
    ev.push({type:'wo',date:d,w:w,title:(woLotLabel(w)||'Work order'),sub:[getB(w),getS(w)].filter(Boolean).join(' · '),who:[inst].concat(payees.map(function(p){return p.name||'';})).filter(Boolean),label:woTypeLabel(w)});
  });
  D.invoices.forEach(function(inv){
    var lots=inv.batchData||inv.lots||[],d='';
    for(var i=0;i<lots.length;i++){var s2=lots[i].snapshot||{};d=s2.fd||s2.fdate||'';if(d)break;}
    if(!d)d=String(inv._savedAt||'').slice(0,10);d=normDate(d);if(!d)return;
    var inst=getInvInstaller(inv);
    ev.push({type:'invoice',date:d,inv:inv,title:'Invoice · '+(inv.builder||(lots[0]&&lots[0].builder)||'')+(inv.lotTotal?' · '+money0(inv.lotTotal):''),sub:inst,who:[inst].concat((inv.payees||[]).map(function(p){return p.name||'';})).filter(Boolean),tendered:inv.status==='tendered'});
  });
  D.jobs.forEach(function(j){
    if(!j.scheduledDate||!jobVisible(j))return;
    var who=(j.assignedStaff||[]).map(function(id){var s=D.staff.find(function(x){return x.id===id;});return s?s.name:id;});
    ev.push({type:'job',date:j.scheduledDate,j:j,title:j.title||'Job',sub:j.clientName||'',who:who});
  });
  return ev;
}
SCREENS.schedule = function(){
  var all=scheduleEvents();
  var people={};all.forEach(function(e){e.who.forEach(function(n){if(n)people[lc(n)]=n;});});
  var names=Object.values(people).sort();
  var f=function(e){return !SCHED.who||e.who.some(function(n){return lc(n)===lc(SCHED.who);});};
  var d0=parseISO(SCHED.date);var wk=new Date(d0);wk.setDate(wk.getDate()-wk.getDay());
  var days=[];for(var i=0;i<7;i++){var x=new Date(wk);x.setDate(wk.getDate()+i);days.push(isoLocal(x));}
  var t=todayISO();
  var dayEv=all.filter(function(e){return e.date===SCHED.date&&f(e);});
  var order={job:0,wo:1,invoice:2};dayEv.sort(function(a,b){return order[a.type]-order[b.type];});
  var html='<div class="hd"><h1>'+d0.toLocaleDateString('en-CA',{month:'long',year:'numeric'})+'</h1></div>'
    +'<div class="wknav"><button class="iconbtn" aria-label="Previous week" onclick="App.schedGo(\''+addDays(SCHED.date,-7)+'\')">‹</button><button class="link" onclick="App.schedGo(\''+t+'\')">Today</button><button class="iconbtn" aria-label="Next week" onclick="App.schedGo(\''+addDays(SCHED.date,7)+'\')">›</button></div>'
    +'<div class="wk">'+days.map(function(d){var has=all.some(function(e){return e.date===d&&f(e);});var dd=parseISO(d);
      return '<button class="'+(d===SCHED.date?'sel ':'')+(d===t?'today':'')+'" aria-pressed="'+(d===SCHED.date)+'" aria-label="'+fmtDay(d)+'" onclick="App.schedGo(\''+d+'\')">'+dd.toLocaleDateString('en-CA',{weekday:'short'})+'<b>'+dd.getDate()+'</b><span class="'+(has?'has':'no')+'"></span></button>';}).join('')+'</div>';
  if(names.length)html+='<div class="chips" role="group" aria-label="Show work for">'+['<button aria-pressed="'+(!SCHED.who)+'" onclick="App.schedWho(null)">Everyone</button>'].concat(names.map(function(n){return '<button aria-pressed="'+(lc(SCHED.who)===lc(n))+'" onclick="App.schedWho(R('+reg(n)+'))">'+h(n)+'</button>';})).join('')+'</div>';
  html+='<div class="blk"><div class="blk-h"><h2>'+(SCHED.date===t?'Today':fmtDay(SCHED.date))+'</h2><span class="muted">'+pl(dayEv.length,'item')+'</span></div><div class="ag">'
    +(dayEv.length?dayEv.map(function(e){
      var cls=e.type==='invoice'?'invoice'+(e.tendered?' tendered':''):e.type==='job'?'job':'';
      var kind=e.type==='wo'?e.label:e.type==='invoice'?(e.tendered?'Invoice · tendered':'Invoice'):'Job';
      var click=e.type==='wo'?'openWOInTool(R('+reg(e.w)+'))':e.type==='job'?'App.editJob(\''+h(e.j.id)+'\')':'App.invoiceDetail(R('+reg(e.inv)+'))';
      return '<button class="ag-item '+cls+'" onclick="'+click+'"><span class="ag-t">'+h(kind)+'</span><span style="flex:1;min-width:0"><b>'+h(e.title)+'</b><br><span class="s">'+h(e.sub||'')+'</span>'+(e.type==='wo'&&e.who.length?'<br><span class="s">'+h(e.who.join(', '))+'</span>':'')+'</span></button>';
    }).join(''):'<div class="card"><p class="empty">Nothing on this day.</p></div>')+'</div></div>';
  return html;
};
App.schedGo=function(d){SCHED.date=d;renderScreen();};
App.schedWho=function(n){SCHED.who=n;renderScreen();};

/* ───────────────────────── More ───────────────────────── */
SCREENS.more = function(){
  var row=function(label,onclick,sub,badge){return '<div class="lrow"><button class="lmain" onclick="'+onclick+'"><span class="top"><b>'+label+'</b>'+(badge?'<span class="pill bad">'+badge+'</span>':'')+'</span>'+(sub?'<span class="s">'+sub+'</span>':'')+'</button><span class="chev">›</span></div>';};
  var html='<h1>More</h1>';
  html+='<div class="blk"><div class="card">'
    +row('Invoices','App.invoices()',pl(D.invoices.length,'saved invoice'))
    +row('Jobs and clients','App.jobs()',pl(D.jobs.filter(jobVisible).length,'job'))
    +row('Flags','App.flags()',pl(openFlags().length,'open flag'))
    +(isAdm()?row('Approvals','App.approvals()','Work order edits and share requests',approvalCount()||''):'')
    +(isAdm()?row('Staff accounts','App.staff()',pl(D.staff.length,'person','people')):'')
    +(isAdm()?row('Activity','App.activity()','Recent actions by everyone'):'')
    +(isAdm()?row('Download a backup','App.backup()','Everything in the shared database, as one file'):'')
    +'</div></div>';
  if(isAdm()&&EA.LEGACY_PORTAL_URL){
    html+='<div class="blk"><h2>Still in the current portal</h2><div class="card">'
      +'<div class="lrow"><a class="lmain" href="'+h(EA.LEGACY_PORTAL_URL)+'" target="_blank" rel="noopener"><b>Branding, price rates, trash, merging builders</b><span class="s">Opens the current portal in a new tab</span></a><span class="chev">↗</span></div>'
      +'</div></div>';
  }
  html+='<div class="blk"><h2>Account</h2><div class="card">'
    +'<div class="stat"><div>'+h(meName())+'<span>@'+h(meUser())+' · '+(isAdm()?'Admin':'Staff')+'</span></div></div>'
    +'<div class="stat"><div>Saving<span>'+(READ_ONLY?'Off. This is a preview of live data.':'On. Changes save to the shared database.')+'</span></div><b class="pill '+(READ_ONLY?'warn':'ok')+'">'+(READ_ONLY?'Preview':'Live')+'</b></div>'
    +'<div class="lrow"><button class="lmain" onclick="App.logout()"><b style="color:var(--bad)">Sign out</b></button></div>'
    +'</div></div>';
  return html;
};

/* ───────────────────────── Assigned work, flags, my edits ───────────────────────── */
App.assigned=function(){push({type:'assigned',live:true});};
SHEETS.assigned=function(){
  var gs=groupAssignments(validAssignments());
  return {title:isAdm()?'Assigned work':'My work',body:'<div class="sec">'+(gs.length?'<div class="card">'+gs.map(function(g){
    var label=g.hit?smJobLabel(g.hit.lot):keyToLabel(g.key);
    return '<div class="lrow"><button class="lmain" onclick="App.openLotByKey(\''+h(g.key)+'\')"><span class="top"><b>'+h(label)+'</b></span><span class="s">'+h([g.builder,g.hit?g.hit.map.site:g.site].filter(Boolean).join(' · '))+'</span><span class="s">'+h(g.tasks.map(function(a){return a._taskLabel+(isAdm()?' ('+a.assignedTo+')':'');}).join(', '))+'</span></button><span class="chev">›</span></div>';
  }).join('')+'</div>':'<p class="empty">No open tasks.</p>')+'</div>'};
};
App.flags=function(){push({type:'flags',live:true});};
SHEETS.flags=function(){
  var fl=openFlags();
  return {title:'Open flags',body:'<div class="sec">'+(fl.length?fl.map(function(f){
    var label=f._hit?smJobLabel(f._hit.lot):keyToLabel(f._lotKey);
    var where=f._hit?[f._hit.map.builder,f._hit.map.site].filter(Boolean).join(' · '):'';
    return '<div class="flag '+h(f.type)+'"><div class="sec-h"><span class="k">'+(f.type==='missing_material'?'Missing material':'Unfinished work')+'</span><span class="s">'+h(String(f.createdAt||'').slice(0,10))+'</span></div>'
      +'<b>'+h(label)+'</b>'+(where?' <span class="s">'+h(where)+'</span>':'')
      +'<p style="margin-top:4px">'+h(f.text)+'</p>'+(f.materials?'<p class="s" style="white-space:pre-wrap;margin-top:4px">Materials: '+h(f.materials)+'</p>':'')
      +(f.photoUrl?'<a href="'+h(f.photoUrl)+'" target="_blank" rel="noopener"><img src="'+h(f.photoUrl)+'" alt="Flag photo" style="max-width:100%;max-height:160px;border-radius:8px;margin-top:6px;display:block"></a>':'')
      +'<div class="strip" style="margin-top:10px">'+(f._hit?'<button class="btn ghost mini" onclick="App.openLotByKey(\''+h(f._lotKey)+'\')">Open lot</button>':'')
      +'<button class="btn mini" onclick="App.resolveFlag(\''+h(f._lotKey)+'\',\''+h(f.id)+'\')">Mark done</button></div></div>';
  }).join('<div style="height:8px"></div>'):'<p class="empty">No open flags. All clear.</p>')+'</div>'};
};
App.myEdits=function(){push({type:'myEdits',live:true});};
SHEETS.myEdits=function(){
  var list=pendingEdits().filter(function(w){return isAdm()||w._owner===meUser();});
  return {title:'Edits waiting for approval',body:'<div class="sec">'+(list.length?'<div class="card">'+list.map(woRow).join('')+'</div>':'<p class="empty">Nothing waiting.</p>')+'</div>'};
};

/* shared work order row */
function woStatus(w){
  if(w._pendingEdit)return ['warn','Edit waiting for approval'];
  if(w.status==='invoiced')return ['ok','Invoiced'];
  return ['info','Ready to invoice'];
}
function woRow(w){
  var st=woStatus(w),t=woTotal(w);
  return '<div class="lrow"><button class="lmain" onclick="App.woActions(R('+reg(w)+'))"><span class="top"><b>'+h(woLotLabel(w)||w.label||w.masterNum||'Work order')+'</b>'+(t?'<b class="amt">'+money(t)+'</b>':'')+'</span>'
    +'<span class="s">'+h([woTypeLabel(w),woInstaller(w),fmtDay(woDate(w))].filter(Boolean).join(' · '))+'</span><span class="pill '+st[0]+'">'+st[1]+'</span></button><span class="chev">›</span></div>';
}
App.woActions=function(w){push({type:'woActions',w:w});};
SHEETS.woActions=function(e){
  var w=e.w,st=woStatus(w),s=woSnap(w);
  var rows=[['Builder',getB(w)],['Site',getS(w)],['Lot',woLotLabel(w)],['Model',s.fm||s.fmodel||''],['Type',woTypeLabel(w)],['Installer',woInstaller(w)],['Date',fmtDay(woDate(w))],['Total before HST',woTotal(w)?money(woTotal(w)):''],['Number',w.masterNum||'']].filter(function(r){return r[1];});
  var canShare=!isAdm()&&!w._pendingEdit&&!w._shared&&w._owner===meUser();
  return {title:woLotLabel(w)||'Work order',sub:[getB(w),getS(w)].filter(Boolean).join(' · '),
    body:'<div class="sec"><span class="pill '+st[0]+'">'+st[1]+'</span><div class="card">'+rows.map(function(r){return '<div class="stat"><div><span>'+h(r[0])+'</span>'+h(r[1])+'</div></div>';}).join('')+'</div></div>'
      +'<div class="sec"><button class="btn wide big" onclick="App.pop();openWOInTool(R('+reg(w)+'))">Open in Work Order builder</button>'
      +(canShare?'<button class="btn ghost wide" onclick="App.shareDoc(\'saved_workorder\',\''+h(w._id)+'\',\'workorder\')">Share with all staff</button>':'')
      +(isAdm()?'<button class="btn danger wide" onclick="App.trashWO(\''+h(w._id)+'\')">Move to trash</button>':'')+'</div>'};
};
App.trashWO=async function(id){
  var ok=await ask('Move to trash?','The work order is hidden everywhere. You can restore it from Trash in the current portal.',[{label:'Cancel',value:false,style:'ghost'},{label:'Move to trash',value:true,style:'danger'}]);
  if(!ok)return;
  var del={_deleted:true,_deletedAt:new Date().toISOString()};
  if(await save(function(){return Promise.all([DB.collection('saved_workorder').doc(id).update(del),DB.collection('pending_lots').doc(id).update(del).catch(function(){})]);},'Moved to trash'))popSheet();
};
App.shareDoc=async function(collection,docId,type){
  var safeId=String(docId).replace(/[/.]/g,'_');
  var pendingId=(type==='master'?'master_':'wo_')+safeId;
  await save(function(){return DB.collection('pending_review').doc(pendingId).set({_pendingType:type,_targetCollection:collection,_targetDocId:safeId,_submittedBy:meName()||'staff',_submittedByUser:meUser(),_status:'pending',_submittedAt:new Date().toISOString()})
    .then(function(){_logActivity('shared',(type==='master'?'Master ':'WO ')+String(docId));});},'Sent to an admin for approval');
};

/* ───────────────────────── Approvals (admin) ───────────────────────── */
App.approvals=function(){push({type:'approvals',live:true});loadReviews().then(changed);};
function woDiff(p,o){
  var ps=p.snapshot||{},os=o.snapshot||{},rows=[];
  [['fi','Installer'],['fd','Date'],['fb','Builder'],['fp','Site'],['fl','Lot'],['fm','Model'],['fnotes','Notes']].forEach(function(f){
    var a=String(os[f[0]]||'').trim(),b=String(ps[f[0]]||'').trim();if(a!==b)rows.push([f[1],a||'—',b||'—']);
  });
  var ot=parseFloat(o.total||0),pt=parseFloat(p.total||0);if(Math.abs(ot-pt)>0.005)rows.push(['Total',money(ot),money(pt)]);
  if((os.tier||'standard')!==(ps.tier||'standard'))rows.push(['Tier',os.tier||'standard',ps.tier||'standard']);
  if((os.type||'')!==(ps.type||''))rows.push(['Type',os.type||'—',ps.type||'—']);
  var secs={ra:'Rough air',du:'Ducts',vc1:'Venting C1',vc2:'Venting C2',bsa:'Basement A',bra:'Basement rough',bec1:'Basement EC1',bec2:'Basement EC2',hiv_trunk:'HV trunk',hiv_del:'HV delivery',hiv_wall:'HV wall',hiv_flex:'HV flex',hiv_bsmt:'HV basement',hiv_bra:'HV rough A',hiv_ec1:'HV EC1',hiv_ec2:'HV EC2'};
  Object.keys(secs).forEach(function(k){var om=os.rows&&os.rows[k]||{},pm=ps.rows&&ps.rows[k]||{};if(JSON.stringify(om)!==JSON.stringify(pm)){
    var q=function(m){return Object.values(m).reduce(function(s,v){return s+(parseInt(v)||0);},0);};rows.push([secs[k],q(om)+' units',q(pm)+' units']);}});
  var oo=(os.opts||[]).slice().sort(),po=(ps.opts||[]).slice().sort();
  if(JSON.stringify(oo)!==JSON.stringify(po)){var add=po.filter(function(x){return oo.indexOf(x)<0;}),rem=oo.filter(function(x){return po.indexOf(x)<0;});if(add.length)rows.push(['Options added','',add.join(', ')]);if(rem.length)rows.push(['Options removed',rem.join(', '),'']);}
  if(JSON.stringify(os.hours||[])!==JSON.stringify(ps.hours||[]))rows.push(['Hourly rows',(os.hours||[]).length,(ps.hours||[]).length]);
  if(!rows.length)return '<p class="s">No differences found.</p>';
  return '<div class="card">'+rows.map(function(r){return '<div class="stat"><div><span>'+h(r[0])+'</span>'+(r[1]!==''?'<s class="muted">'+h(r[1])+'</s> → ':'')+'<b>'+h(r[2])+'</b></div></div>';}).join('')+'</div>';
}
SHEETS.approvals=function(){
  var edits=pendingEdits(),shares=D.reviews;
  var html='';
  html+='<div class="sec"><h3>Work order edits</h3>'+(edits.length?edits.map(function(w){
    var orig=D.wos.find(function(x){return x._id===String(w._pendingEditOf||'').replace(/[/.]/g,'_');})||{};
    return '<div class="card" style="padding:12px;display:flex;flex-direction:column;gap:8px"><b>'+h([getB(w),getS(w),woLot(w)?'Lot '+woLot(w):''].filter(Boolean).join(' › ')||w._id)+'</b>'
      +'<span class="s">By '+h(w._owner||'')+(w._savedAt?' · '+fmtDate(w._savedAt):'')+(woTotal(w)?' · '+money(woTotal(w)):'')+'</span>'
      +(orig.snapshot?woDiff(w,orig):'<p class="s">Original not found, so changes can\'t be compared.</p>')
      +'<div class="strip"><button class="btn danger mini" onclick="App.rejectEdit(\''+h(w._id)+'\')">Reject</button><button class="btn mini" onclick="App.approveEdit(\''+h(w._id)+'\')">Approve</button><button class="btn ghost mini" onclick="openWOInTool(R('+reg(w)+'))">Open</button></div></div>';
  }).join(''):'<p class="s">No edits waiting.</p>')+'</div>';
  html+='<div class="sec"><h3>Share requests</h3>'+(shares.length?shares.map(function(d){
    var sn=d.snapshot||{};
    return '<div class="card" style="padding:12px;display:flex;flex-direction:column;gap:6px"><b>'+(d._pendingType==='master'?'Master':'Work order')+' · '+h(d._key||d.num||d._targetDocId||d._id)+'</b>'
      +'<span class="s">'+h([d.builder||sn.fb||sn.fbuilder,d.site||sn.fp||sn.fsite].filter(Boolean).join(' › '))+'</span>'
      +'<span class="s">From '+h(d._submittedBy||'')+(d._submittedAt?' · '+fmtDate(d._submittedAt):'')+'</span>'
      +'<div class="strip"><button class="btn danger mini" onclick="App.rejectShare(\''+h(d._id)+'\')">Reject</button><button class="btn mini" onclick="App.approveShare(\''+h(d._id)+'\')">Approve</button></div></div>';
  }).join(''):'<p class="s">No share requests.</p>')+'</div>';
  return {title:'Approvals',body:html};
};
App.approveEdit=async function(id){
  await save(async function(){
    var snap=await DB.collection('saved_workorder').doc(id).get();if(!snap.exists)throw new Error('Pending edit not found.');
    var d=snap.data(),target=d._pendingEditOf;if(!target)throw new Error('No original work order ID.');
    var clean=Object.assign({},d);delete clean._pendingEdit;delete clean._pendingEditOf;
    clean._approvedAt=new Date().toISOString();clean._approvedBy=meUser()||'admin';
    await DB.collection('saved_workorder').doc(String(target).replace(/[/.]/g,'_')).set(clean);
    await DB.collection('saved_workorder').doc(id).delete();
    _logActivity('approved','WO edit: '+target);
  },'Edit approved. Changes are live.');
};
App.rejectEdit=async function(id){
  var ok=await ask('Reject this edit?','The original work order stays as it is.',[{label:'Cancel',value:false,style:'ghost'},{label:'Reject',value:true,style:'danger'}]);if(!ok)return;
  await save(function(){return DB.collection('saved_workorder').doc(id).delete().then(function(){_logActivity('rejected','WO edit: '+id);});},'Edit rejected');
};
App.approveShare=async function(id){
  await save(async function(){
    var snap=await DB.collection('pending_review').doc(id).get();if(!snap.exists)throw new Error('Item not found.');
    var d=snap.data();
    await DB.collection(d._targetCollection).doc(d._targetDocId).update({_shared:true});
    await DB.collection('pending_review').doc(id).update({_status:'approved',_reviewedAt:new Date().toISOString()});
    _logActivity('approved',d._targetDocId);
  },'Approved. Now visible to all staff.');
  await loadReviews();changed();
};
App.rejectShare=async function(id){
  var ok=await ask('Reject this request?','It stays private to the person who made it.',[{label:'Cancel',value:false,style:'ghost'},{label:'Reject',value:true,style:'danger'}]);if(!ok)return;
  await save(function(){return DB.collection('pending_review').doc(id).update({_status:'rejected',_reviewedAt:new Date().toISOString()}).then(function(){_logActivity('rejected',id);});},'Request rejected');
  await loadReviews();changed();
};

/* ───────────────────────── Jobs and clients ───────────────────────── */
var JOB_GROUPS=[['all','All',null],['leads','Leads',['new_lead','measuring','estimating']],['quoted','Quoted',['estimate_sent']],['active','Won · in progress',['approved','deposit_paid','rough_in','basement','turn_on']],['done','Done',['complete','not_awarded']],['followups','Follow-ups due',null]];
App.jobs=function(filter){push({type:'jobs',filter:filter||'all',q:'',live:true});};
SHEETS.jobs=function(e){
  var g=JOB_GROUPS.find(function(x){return x[0]===e.filter;})||JOB_GROUPS[0];
  var list=D.jobs.filter(jobVisible);
  if(e.filter==='followups')list=followUpsDue();else if(g[2])list=list.filter(function(j){return g[2].indexOf(j.stage||'new_lead')>=0;});
  var q=lc(e.q);if(q)list=list.filter(function(j){return lc(j.title).indexOf(q)>=0||lc(j.clientName).indexOf(q)>=0;});
  var tone=function(s){return {complete:'ok',not_awarded:'bad',estimate_sent:'warn',approved:'info',deposit_paid:'info'}[s]||'';};
  return {title:'Jobs and clients',live:true,
    body:'<div class="sec"><input type="search" placeholder="Search jobs or clients" aria-label="Search jobs" value="'+h(e.q)+'" oninput="App.jobSearch(this.value)">'
      +'<div class="chips">'+JOB_GROUPS.map(function(x){return '<button aria-pressed="'+(x[0]===e.filter)+'" onclick="App.jobFilter(\''+x[0]+'\')">'+x[1]+'</button>';}).join('')+'</div></div>'
      +'<div class="sec" id="jobList">'+(list.length?'<div class="card">'+list.map(function(j){
        var paid=['payDeposit','pay2nd','pay3rd','payFinal'].filter(function(k){return j[k];}).length;
        return '<div class="lrow"><button class="lmain" onclick="App.editJob(\''+h(j.id)+'\')"><span class="top"><b>'+h(j.title||'Untitled')+'</b><b class="amt">'+(j.estimateValue?money0(j.estimateValue):'')+'</b></span>'
          +'<span class="s">'+h(j.clientName||'No client')+(j.followupDate?' · follow up '+fmtDay(j.followupDate):'')+'</span>'
          +'<span class="strip"><span class="pill '+tone(j.stage)+'">'+h(STAGE_LABELS[j.stage]||'New lead')+'</span><span class="s">'+paid+' of 4 payments</span></span></button><span class="chev">›</span></div>';
      }).join('')+'</div>':'<p class="empty">No jobs here.</p>')+'</div>'
      +'<div class="sec"><div class="sec-h"><h3>Clients</h3>'+(isAdm()?'<button class="link" onclick="App.editClient()">Add client</button>':'')+'</div>'
      +(D.clients.length?'<div class="card">'+D.clients.slice(0,200).map(function(c){return '<div class="lrow"><button class="lmain" onclick="App.editClient(\''+h(c.id)+'\')"><b>'+h(c.name||'Unnamed')+'</b><span class="s">'+h([c.company,c.phone,c.city].filter(Boolean).join(' · '))+'</span></button><span class="chev">›</span></div>';}).join('')+'</div>':'<p class="s">No clients yet.</p>')+'</div>',
    foot:isAdm()?'<button class="btn" onclick="App.editJob()">New job</button>':''};
};
App.jobSearch=function(v){var e=curSheet();e.q=v;var b=document.querySelector('#sh'+(STACK.length-1)+' .sh-body');var y=b?b.scrollTop:0;rerender();var inp=document.querySelector('#sh'+(STACK.length-1)+' input[type=search]');if(inp){inp.focus();inp.setSelectionRange(v.length,v.length);}};
App.jobFilter=function(f){curSheet().filter=f;rerender();};

App.editJob=async function(id){
  var j=id?D.jobs.find(function(x){return x.id===id;}):null;
  var d=j?JSON.parse(JSON.stringify(j)):{title:'',clientId:'',stage:'new_lead',estimateValue:'',notes:'',followupDate:'',scheduledDate:'',masterNum:'',blockNum:'',unitNum:'',lotNum:'',payDeposit:false,pay2nd:false,pay3rd:false,payFinal:false,documents:[]};
  push({type:'job',id:id||null,d:d});
  if(!id&&!READ_ONLY){try{var n=await generateMasterNumber();if(!d.masterNum){d.masterNum=n;rerender();}}catch(e){}}
};
async function generateMasterNumber(){
  try{
    var ref=DB.collection('meta').doc('counters'),num;
    await DB.runTransaction(async function(tx){var doc=await tx.get(ref);var cur=doc.exists?(doc.data().jobCounter||1000):1000;num=cur+1;tx.set(ref,{jobCounter:num},{merge:true});});
    return 'ECO-'+num;
  }catch(e){return 'ECO-'+Date.now().toString().slice(-4);}
}
function fld(label,key,type,ph){var e=window._E||curSheet();return '<label class="field">'+label+'<input type="'+(type||'text')+'" value="'+h(e.d[key]==null?'':e.d[key])+'" placeholder="'+h(ph||'')+'" oninput="App.setD(\''+key+'\',this.value)"></label>';}
App.setD=function(k,v){curSheet().d[k]=v;};
App.setDBool=function(k,v){curSheet().d[k]=v;};
SHEETS.job=function(e){
  var d=e.d,admin=isAdm();
  var pays=[['payDeposit','Deposit · 10%'],['pay2nd','Second · 40%'],['pay3rd','Third · 40%'],['payFinal','Final · 10%']];
  var docs=(d.documents||[]).slice().reverse();
  return {title:e.id?(d.title||'Job'):'New job',sub:d.clientName||'',
    body:'<div class="sec">'+fld('Job title','title')
      +'<label class="field">Client<select onchange="App.setD(\'clientId\',this.value)"><option value="">No client</option>'+D.clients.map(function(c){return '<option value="'+h(c.id)+'" '+(c.id===d.clientId?'selected':'')+'>'+h(c.name)+'</option>';}).join('')+'</select></label>'
      +'<label class="field">Stage<select onchange="App.setD(\'stage\',this.value)">'+Object.keys(STAGE_LABELS).map(function(k){return '<option value="'+k+'" '+(k===(d.stage||'new_lead')?'selected':'')+'>'+STAGE_LABELS[k]+'</option>';}).join('')+'</select></label>'
      +'<div class="two">'+fld('Estimate value ($)','estimateValue','number')+fld('Follow-up date','followupDate','date')+'</div>'
      +fld('Scheduled date','scheduledDate','date')
      +'<label class="field">Notes<textarea oninput="App.setD(\'notes\',this.value)">'+h(d.notes||'')+'</textarea></label></div>'
      +'<div class="sec"><h3>Reference numbers</h3><div class="two">'+fld('Master #','masterNum')+fld('Block #','blockNum')+fld('Unit #','unitNum')+fld('Lot #','lotNum')+'</div></div>'
      +'<div class="sec"><h3>Payments</h3>'+pays.map(function(p){return '<label class="switch"><span>'+p[1]+(d.estimateValue?' <span class="s">'+money0(d.estimateValue*({payDeposit:.1,pay2nd:.4,pay3rd:.4,payFinal:.1}[p[0]]))+'</span>':'')+'</span><input type="checkbox" role="switch" '+(d[p[0]]?'checked':'')+' onchange="App.setDBool(\''+p[0]+'\',this.checked)"></label>';}).join('')+'</div>'
      +(e.id?'<div class="sec"><h3>Documents</h3><div class="strip">'
        +'<button class="btn ghost mini" onclick="App.toolForJob(\'measure\',\'Measure sheet\')">Measure</button>'
        +'<button class="btn ghost mini" onclick="App.toolForJob(\'estimate\',\'Estimate\')">Estimate</button>'
        +'<button class="btn ghost mini" onclick="App.toolForJob(\'estimate\',\'Invoice\',\'invoice\')">Invoice</button>'
        +'<button class="btn ghost mini" onclick="App.toolForJob(\'workorder\',\'Work order\')">Work order</button></div>'
        +(docs.length?'<div class="card">'+docs.map(function(x){return '<div class="lrow"><div class="lmain" style="cursor:default"><b>'+h(x.type||'Document')+'</b><span class="s">'+h([fmtDate(x.date),x.by,x.notes].filter(Boolean).join(' · '))+'</span></div>'
          +(x.pdfUrl?'<a class="btn ghost mini" href="'+h(x.pdfUrl)+'" target="_blank" rel="noopener">PDF</a>':'')+(x.formData?'<button class="btn ghost mini" onclick="App.reopenDoc(\''+h(x.id)+'\')">Reopen</button>':'')+'</div>';}).join('')+'</div>':'<p class="s">No documents saved to this job yet. Open a tool above, then use Save to job.</p>')+'</div>':'<div class="sec"><p class="s">Save the job first, then attach measure sheets, estimates and work orders to it.</p></div>')
      +(e.id&&admin?'<div class="sec"><button class="btn danger wide" onclick="App.deleteJob()">Delete job</button></div>':''),
    foot:'<button class="btn ghost" onclick="App.pop()">Cancel</button><button class="btn" onclick="App.saveJob()">Save job</button>'};
};
App.saveJob=async function(){
  var e=curSheet(),d=e.d;
  if(!String(d.title||'').trim())return rerender('Add a job title.');
  var c=D.clients.find(function(x){return x.id===d.clientId;});
  var data={title:d.title.trim(),clientId:d.clientId||null,clientName:c?c.name:'',stage:d.stage||'new_lead',estimateValue:parseFloat(d.estimateValue)||0,notes:d.notes||'',followupDate:d.followupDate||null,scheduledDate:d.scheduledDate||null,masterNum:d.masterNum||null,blockNum:d.blockNum||null,unitNum:d.unitNum||null,lotNum:d.lotNum||null,payDeposit:!!d.payDeposit,pay2nd:!!d.pay2nd,pay3rd:!!d.pay3rd,payFinal:!!d.payFinal,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  var ok=await save(function(){
    if(e.id)return DB.collection('jobs').doc(e.id).update(data);
    data.createdAt=firebase.firestore.FieldValue.serverTimestamp();data.createdBy=meUser();data.documents=[];
    return DB.collection('jobs').add(data);
  },'Job saved');
  if(ok)popSheet();
};
App.deleteJob=async function(){
  var e=curSheet();
  var ok=await ask('Delete this job?','“'+h(e.d.title)+'” and its document list are removed. This can\'t be undone.',[{label:'Cancel',value:false,style:'ghost'},{label:'Delete job',value:true,style:'danger'}]);
  if(!ok)return;
  if(await save(function(){return DB.collection('jobs').doc(e.id).delete();},'Job deleted'))popSheet();
};
App.editClient=function(id){
  var c=id?D.clients.find(function(x){return x.id===id;}):null;
  push({type:'client',id:id||null,d:c?JSON.parse(JSON.stringify(c)):{name:'',phone:'',email:'',company:'',address:'',city:'',province:'',postal:'',notes:''}});
};
SHEETS.client=function(e){
  var jobs=e.id?D.jobs.filter(function(j){return j.clientId===e.id&&jobVisible(j);}):[];
  return {title:e.id?(e.d.name||'Client'):'New client',
    body:'<div class="sec">'+fld('Name','name')+fld('Company','company')+'<div class="two">'+fld('Phone','phone','tel')+fld('Email','email','email')+'</div>'
      +fld('Address','address')+'<div class="three">'+fld('City','city')+fld('Province','province')+fld('Postal code','postal')+'</div>'
      +'<label class="field">Notes<textarea oninput="App.setD(\'notes\',this.value)">'+h(e.d.notes||'')+'</textarea></label></div>'
      +(e.id?'<div class="sec"><div class="sec-h"><h3>Jobs</h3>'+(isAdm()?'<button class="link" onclick="App.editJob();curSheet().d.clientId=\''+h(e.id)+'\';rerender()">New job</button>':'')+'</div>'+(jobs.length?'<div class="card">'+jobs.map(function(j){return '<div class="lrow"><button class="lmain" onclick="App.editJob(\''+h(j.id)+'\')"><b>'+h(j.title)+'</b><span class="s">'+h(STAGE_LABELS[j.stage]||'')+'</span></button><span class="chev">›</span></div>';}).join('')+'</div>':'<p class="s">No jobs for this client.</p>')+'</div>':'')
      +(e.id&&isAdm()?'<div class="sec"><button class="btn danger wide" onclick="App.deleteClient()">Delete client</button></div>':''),
    foot:'<button class="btn ghost" onclick="App.pop()">Cancel</button><button class="btn" onclick="App.saveClient()">Save client</button>'};
};
App.saveClient=async function(){
  var e=curSheet(),d=e.d;
  if(!String(d.name||'').trim())return rerender('Add the client\'s name.');
  var data={name:d.name.trim(),phone:d.phone||'',email:d.email||'',company:d.company||'',address:d.address||'',city:d.city||'',province:String(d.province||'').toUpperCase(),postal:String(d.postal||'').toUpperCase(),notes:d.notes||'',updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  var ok=await save(function(){
    if(e.id)return DB.collection('clients').doc(e.id).update(data);
    data.createdAt=firebase.firestore.FieldValue.serverTimestamp();data.createdBy=meUser();return DB.collection('clients').add(data);
  },'Client saved');
  if(ok)popSheet();
};
App.deleteClient=async function(){
  var e=curSheet();
  var ok=await ask('Delete this client?','“'+h(e.d.name)+'” is removed. Their jobs stay but lose the link. This can\'t be undone.',[{label:'Cancel',value:false,style:'ghost'},{label:'Delete client',value:true,style:'danger'}]);
  if(!ok)return;
  if(await save(function(){return DB.collection('clients').doc(e.id).delete();},'Client deleted'))popSheet();
};

/* ───────────────────────── Invoices (saved) ───────────────────────── */
App.invoices=function(){loadInvoices().then(changed);push({type:'invoices',who:null,live:true});};
SHEETS.invoices=function(e){
  var people={};D.invoices.forEach(function(i){var n=getInvInstaller(i);if(n)people[lc(n)]=n;(i.payees||[]).forEach(function(p){if(p.name)people[lc(p.name)]=p.name.trim();});});
  var names=Object.values(people).sort();
  var list=D.invoices.filter(function(i){if(!e.who)return true;return lc(getInvInstaller(i))===lc(e.who)||(i.payees||[]).some(function(p){return lc(p.name)===lc(e.who);});})
    .sort(function(a,b){return String(b._savedAt||'').localeCompare(String(a._savedAt||''));});
  var amountFor=function(inv){
    var full=inv.lotTotal||(inv.lots||[]).reduce(function(s,l){return s+(l.total||0);},0);
    if(!e.who||lc(inv.installer)===lc(e.who))return full;
    var p=(inv.payees||[]).find(function(x){return lc(x.name)===lc(e.who);});
    if(!p)return full;if(p.amount)return p.amount;
    return p.type==='partner'?full*(parseFloat(p.val)||0)/100:(parseFloat(p.val)||0)*(parseFloat(p.hrs)||0);
  };
  var sect=function(title,arr){if(!arr.length)return '';var tot=arr.reduce(function(s,i){return s+amountFor(i);},0);
    return '<div class="sec"><div class="sec-h"><h3>'+title+'</h3><b class="num">'+money(tot)+'</b></div><div class="card">'+arr.map(function(inv){
      var builders=Array.from(new Set((inv.lots||[]).map(function(l){return l.builder||'';}).filter(Boolean))).join(', ');
      return '<div class="lrow"><button class="lmain" onclick="App.invoiceDetail(R('+reg(inv)+'))"><span class="top"><b>'+h(getInvInstaller(inv)||'No installer')+'</b><b class="amt">'+money(amountFor(inv))+'</b></span><span class="s">'+h([builders,pl((inv.lots||[]).length,'lot'),fmtDate(inv._savedAt)].filter(Boolean).join(' · '))+'</span>'+(inv.isSplit?'<span class="pill">Split · group '+h(inv.splitGroup)+'</span>':'')+'</button><span class="chev">›</span></div>';
    }).join('')+'</div></div>';};
  return {title:'Invoices',
    body:'<div class="sec"><div class="chips">'+['<button aria-pressed="'+(!e.who)+'" onclick="App.invWho(null)">Everyone</button>'].concat(names.map(function(n){return '<button aria-pressed="'+(lc(e.who)===lc(n))+'" onclick="App.invWho(R('+reg(n)+'))">'+h(n)+'</button>';})).join('')+'</div>'
      +(e.who?'<p class="s">Amounts show what '+h(e.who)+' earned on each invoice, before HST.</p>':'<p class="s">Amounts are before HST.</p>')+'</div>'
      +(list.length?sect('Active',list.filter(function(i){return i.status!=='tendered';}))+sect('Tendered',list.filter(function(i){return i.status==='tendered';})):'<div class="sec"><p class="empty">No invoices yet.</p></div>'),
    foot:'<button class="btn" onclick="App.openInvoice()">New invoice</button>'};
};
App.invWho=function(n){curSheet().who=n;rerender();};
App.invoiceDetail=function(inv){push({type:'invoiceDetail',inv:inv});};
SHEETS.invoiceDetail=function(e){
  var inv=e.inv,lots=inv.lots||[];
  return {title:'Invoice'+(inv.invoiceNum?' '+inv.invoiceNum:''),sub:getInvInstaller(inv),
    body:'<div class="sec"><span class="pill '+(inv.status==='tendered'?'info':'ok')+'">'+(inv.status==='tendered'?'Tendered':'Active')+'</span>'
      +'<div class="card">'+[['Saved',fmtDate(inv._savedAt)],['Bill to',inv.billTo],['Subtotal',money(inv.subtotal||inv.lotTotal)],['HST',inv.hst!=null?money(inv.hst):''],['Total',inv.total!=null?money(inv.total):'']].filter(function(r){return r[1];}).map(function(r){return '<div class="stat"><div><span>'+h(r[0])+'</span><span style="white-space:pre-wrap;color:var(--ink)">'+h(r[1])+'</span></div></div>';}).join('')+'</div></div>'
      +'<div class="sec"><h3>'+pl(lots.length,'lot')+'</h3><div class="card">'+lots.map(function(l){return '<div class="stat"><div>'+h([l.builder,l.site||l.project,l.lot?'Lot '+l.lot:''].filter(Boolean).join(' · '))+'<span>'+h([WO_TYPE_LABELS[l.type]||l.type,l.installer].filter(Boolean).join(' · '))+'</span></div><b>'+money(l.total)+'</b></div>';}).join('')+'</div>'
      +((inv.payees||[]).length?'<h3>Pay split</h3><div class="card">'+inv.payees.map(function(p){return '<div class="stat"><div>'+h(p.name)+'<span>'+h(p.type==='partner'?'Partner':'Apprentice')+'</span></div><b>'+(p.amount!=null?money(p.amount):'')+'</b></div>';}).join('')+'</div>':'')+'</div>'
      +'<div class="sec"><button class="btn wide big" onclick="App.editInvoice(R('+reg(inv)+'))">Edit and create the PDF again</button>'
      +'<button class="btn ghost wide" onclick="App.toggleTendered(R('+reg(inv)+'))">'+(inv.status==='tendered'?'Mark as active':'Mark as tendered')+'</button>'
      +'<button class="btn danger wide" onclick="App.trashInvoice(\''+h(inv._id)+'\')">Move to trash</button></div>'};
};
App.toggleTendered=async function(inv){
  var ns=inv.status==='tendered'?'active':'tendered';
  if(await save(function(){return DB.collection('invoices').doc(inv._id).update({status:ns});},ns==='tendered'?'Marked as tendered':'Marked as active')){inv.status=ns;await loadInvoices();changed();rerender();}
};
App.trashInvoice=async function(id){
  var ok=await ask('Move this invoice to trash?','You can restore it from Trash in the current portal.',[{label:'Cancel',value:false,style:'ghost'},{label:'Move to trash',value:true,style:'danger'}]);if(!ok)return;
  if(await save(function(){return DB.collection('invoices').doc(id).update({_deleted:true,_deletedAt:new Date().toISOString()});},'Invoice moved to trash')){await loadInvoices();popSheet();}
};

/* ───────────────────────── Staff accounts (admin) ───────────────────────── */
App.staff=function(){push({type:'staff',live:true});};
SHEETS.staff=function(){
  return {title:'Staff accounts',body:'<div class="sec"><div class="card">'+D.staff.slice().sort(function(a,b){return String(a.name||a.id).localeCompare(String(b.name||b.id));}).map(function(s){
    return '<div class="lrow"><button class="lmain" onclick="App.staffDetail(\''+h(s.id)+'\')"><span class="top"><b>'+h(s.name||s.id)+'</b><span class="pill '+(s.role==='admin'?'info':'')+'">'+(s.role==='admin'?'Admin':'Staff')+'</span></span><span class="s">@'+h(s.id)+'</span></button><span class="chev">›</span></div>';
  }).join('')+'</div><p class="s">Installer, partner and apprentice names on invoices are listed under Invoices.</p></div>',
    foot:'<button class="btn" onclick="App.addStaff()">Add staff</button>'};
};
App.staffDetail=function(id){push({type:'staffDetail',id:id,d:{p1:'',p2:''}});};
SHEETS.staffDetail=function(e){
  var s=D.staff.find(function(x){return x.id===e.id;})||{id:e.id};
  var self=e.id===meUser();
  return {title:s.name||s.id,sub:'@'+s.id,
    body:'<div class="sec"><h3>Reset password</h3><p class="s">Pick a new password and give it to them directly. They can sign in with it right away.</p>'
      +fld('New password','p1','password')+fld('Confirm new password','p2','password')+'<button class="btn" onclick="App.resetPw()">Set new password</button></div>'
      +(!self?'<div class="sec"><button class="btn danger wide" onclick="App.removeStaff()">Remove '+h(s.name||s.id)+'</button><p class="s">They can no longer sign in. Their work stays.</p></div>':'')};
};
App.resetPw=async function(){
  var e=curSheet(),p1=e.d.p1||'',p2=e.d.p2||'';
  if(p1.length<6)return rerender('Use at least 6 characters.');
  if(p1!==p2)return rerender('The two passwords don\'t match.');
  var hash=await sha256(p1);
  if(await save(function(){return DB.collection('staff').doc(e.id).update({passwordHash:hash,_pwResetAt:new Date().toISOString(),_pwResetBy:meUser()}).then(function(){_logActivity('pw_reset','Reset password for @'+e.id);});},'Password changed for @'+e.id))popSheet();
};
App.removeStaff=async function(){
  var e=curSheet();
  var ok=await ask('Remove this person?','@'+h(e.id)+' can no longer sign in. Their work orders and invoices stay.',[{label:'Cancel',value:false,style:'ghost'},{label:'Remove',value:true,style:'danger'}]);if(!ok)return;
  if(await save(function(){return DB.collection('staff').doc(e.id).update({_deleted:true,_deletedAt:new Date().toISOString()});},'Removed')){await loadStaff();popSheet();}
};
App.addStaff=function(){push({type:'addStaff',d:{name:'',user:'',pass:'',role:'staff'}});};
SHEETS.addStaff=function(e){
  return {title:'Add staff',body:'<div class="sec">'+fld('Full name','name')+fld('Username','user','text','Lowercase, no spaces')+fld('Password','pass','password','At least 6 characters')
    +'<label class="field">Role<select onchange="App.setD(\'role\',this.value)"><option value="staff" '+(e.d.role!=='admin'?'selected':'')+'>Staff</option><option value="admin" '+(e.d.role==='admin'?'selected':'')+'>Admin</option></select></label></div>',
    foot:'<button class="btn ghost" onclick="App.pop()">Cancel</button><button class="btn" onclick="App.saveStaff()">Add staff</button>'};
};
App.saveStaff=async function(){
  var d=curSheet().d,name=String(d.name||'').trim(),user=lc(d.user),pass=d.pass||'',role=d.role||'staff';
  if(!name||!user||!pass)return rerender('Fill in the name, username and password.');
  if(pass.length<6)return rerender('Use a password with at least 6 characters.');
  if(/\s/.test(user))return rerender('Usernames can\'t contain spaces.');
  var ok=await save(async function(){
    var ex=await DB.collection('staff').doc(user).get();if(ex.exists)throw new Error('Username "'+user+'" is already taken.');
    var hash=await sha256(pass);
    await DB.collection('staff').doc(user).set({name:name,role:role,passwordHash:hash,username:user,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    try{var sn=await DB.collection('meta').doc('staff_names').get();var list=sn.exists?(sn.data().names||[]):[];
      if(!list.find(function(x){return x.name&&lc(x.name)===lc(name);})){list.push({name:name,role:role});await DB.collection('meta').doc('staff_names').set({names:list},{merge:true});}}catch(x){}
    _logActivity('staff_added',name+' (@'+user+') as '+role);
  },'Added '+name);
  if(ok){await loadStaff();popSheet();}
};

/* ───────────────────────── Activity (admin) ───────────────────────── */
App.activity=async function(){
  push({type:'activity',items:null});
  try{var s=await DB.collection('activity_log').orderBy('_ts','desc').limit(120).get();var e=STACK.find(function(x){return x.type==='activity';});if(e){e.items=snapList(s,'_id');rerender();}}
  catch(err){var e2=STACK.find(function(x){return x.type==='activity';});if(e2){e2.items=[];e2.error=err.message;rerender();}}
};
var ACT_LABELS={wo_saved:'Work order saved',master_saved:'Master saved',shared:'Shared for review',approved:'Approved',rejected:'Rejected',staff_added:'Staff added',staff_removed:'Staff removed',pw_reset:'Password reset',merge:'Merge',branding:'Branding updated'};
SHEETS.activity=function(e){
  if(!e.items)return {title:'Activity',body:'<div class="sec"><p class="empty">Loading…</p></div>'};
  if(e.error)return {title:'Activity',body:'<div class="sec"><p class="s">Could not load activity: '+h(e.error)+'</p></div>'};
  var by={};e.items.forEach(function(i){var d=String(i.at||'').slice(0,10)||'Unknown';(by[d]=by[d]||[]).push(i);});
  return {title:'Activity',body:Object.keys(by).sort().reverse().map(function(d){
    return '<div class="sec"><h3>'+(d===todayISO()?'Today':fmtDay(d))+'</h3><div class="card">'+by[d].map(function(i){return '<div class="stat"><div>'+h(ACT_LABELS[i.type]||i.type)+(i.detail?' · <span class="muted">'+h(i.detail)+'</span>':'')+'<span>'+h(i.userName||i.user||'')+'</span></div><span class="s">'+h(String(i.at||'').slice(11,16))+'</span></div>';}).join('')+'</div></div>';
  }).join('')||'<div class="sec"><p class="empty">No activity yet.</p></div>'};
};

/* Backup: reads every collection both portals use and downloads it as one JSON file. Read-only. */
App.backup=async function(){
  var names=['staff','clients','jobs','saved_workorder','pending_lots','saved_masters','saved_measure','model_masters','site_maps','lot_data','assignments','site_docs','invoices','estimates','pending_review','calendar_events','activity_log','meta'];
  showToast('Building backup…');
  var out={_exportedAt:new Date().toISOString(),_by:meUser(),collections:{}},n=0;
  try{
    for(var i=0;i<names.length;i++){
      var snap=await DB.collection(names[i]).get(),m={};
      snap.forEach(function(d){var x=d.data();m[d.id]=x;n++;});
      out.collections[names[i]]=m;
    }
    var blob=new Blob([JSON.stringify(out)],{type:'application/json'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='eco-air-backup-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},2000);
    showToast('Backup downloaded ('+n+' records)');
  }catch(e){showToast('Backup failed: '+e.message,true);}
};
