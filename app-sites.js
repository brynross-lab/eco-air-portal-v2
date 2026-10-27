/* Eco Air Portal v2 - Sites: one place per site for the map, lots, work orders, masters and files. */

var STAGES=[
  {k:'none',label:'Not started',c:'var(--st-none)',fill:'rgba(156,163,175,0.15)',stroke:'rgba(156,163,175,0.6)'},
  {k:'wo',label:'Work order, not invoiced',c:'var(--st-wo)',fill:'rgba(156,163,175,0.28)',stroke:'rgba(107,114,128,0.75)'},
  {k:'rough',label:'Rough-in done',c:'var(--st-rough)',fill:'rgba(234,88,12,0.35)',stroke:'#ea580c'},
  {k:'bsmt',label:'Basement done',c:'var(--st-bsmt)',fill:'rgba(245,158,11,0.35)',stroke:'#d97706'},
  {k:'tie',label:'Tie-in done',c:'var(--st-tie)',fill:'rgba(37,99,235,0.35)',stroke:'#2563eb'}
];
var MASTER_FILL={fill:'rgba(234,179,8,0.38)',stroke:'#ca8a04'};
var SV={tab:null,mapId:null,stage:null,q:''};          // site view state
var MAPV={mapId:null,z:1,x:0,y:0,edit:false,fit:true};  // map viewer state

/* ───────────────────────── site index ───────────────────────── */
function siteKey(b,s){return lc(b)+'|'+lc(s);}
function buildSites(){
  var idx={};
  function add(b,s){
    b=String(b||'').trim()||'No builder';s=String(s||'').trim()||'General';
    var k=siteKey(b,s);
    if(!idx[k])idx[k]={key:k,builder:b,site:s,maps:[],wos:[],masters:[],docs:[]};
    return idx[k];
  }
  D.maps.forEach(function(m){add(m.builder,m.site||m.name).maps.push(m);});
  visibleWOs().forEach(function(w){add(getB(w)||'Unknown',getS(w)||'Unknown Site').wos.push(w);});
  allMasters().filter(canSee).forEach(function(m){add(getB(m)||'Unknown',getS(m)||'Unknown Site').masters.push(m);});
  Object.keys(D.registry.sites||{}).forEach(function(b){(D.registry.sites[b]||[]).forEach(function(s){if(s)add(b,s);});});
  D.docs.forEach(function(d){add(d.builder,d.site).docs.push(d);});
  return idx;
}
function buildersFrom(idx){
  var by={};
  Object.values(idx).forEach(function(s){var k=lc(s.builder);if(!by[k])by[k]={name:s.builder,sites:[]};by[k].sites.push(s);});
  return Object.values(by).sort(function(a,b){return a.name.localeCompare(b.name);});
}
function siteReady(site){return site.wos.filter(function(w){return !w._pendingEdit&&w.status!=='invoiced'&&w.status!=='deleted';});}
function siteFlags(site){
  var n=0;site.maps.forEach(function(m){(m.lots||[]).forEach(function(l){var ld=D.lotData[smLotKey(m._id,l)];if(ld)n+=(ld.flags||[]).filter(function(f){return !f.resolved;}).length;});});return n;
}

/* ───────────────────────── map work orders and lot stage (same rules as the current site map) ───────────────────────── */
function mapWOs(map){
  var mb=lc(map.builder),ms=lc(map.site),byLot={};
  D.wos.forEach(function(w){
    if(w._deleted)return;
    if(mb&&ms){var wb=lc(getB(w)),wsite=lc(getS(w));if(wb&&wsite&&(wb!==mb||wsite!==ms))return;}
    var n=woLot(w);if(!n)return;
    (byLot[n]=byLot[n]||[]).push(w);
  });
  return byLot;
}
function lotWOsFrom(byLot,lot){
  var num=String(lot.num==null?'':lot.num).trim(),b=String(lot.block||'').trim(),u=String(lot.unit||'').trim();
  var all=[];Object.values(byLot).forEach(function(a){all=all.concat(a);});
  return all.filter(function(w){
    var wl=woLot(w),s=woSnap(w);
    if(num&&wl!==num)return false;if(!num&&wl!=='')return false;
    var wb=String(s.fblock||'').trim(),wu=String(s.funit||'').trim();
    if(b&&u&&wb&&wu)return wb===b&&wu===u;
    if(u&&wu)return wu===u;
    return true;
  });
}
function lotStage(byLot,lot){
  var all=byLot[String(lot.num==null?'':lot.num)]||[];
  var b=String(lot.block||'').trim(),u=String(lot.unit||'').trim();
  var wos=all.filter(function(w){var s=woSnap(w),wb=String(s.fblock||'').trim(),wu=String(s.funit||'').trim();
    if(b&&u&&wb&&wu)return wb===b&&wu===u;if(u&&wu)return wu===u;return true;});
  var inv={};wos.forEach(function(w){if(w.status==='invoiced'){var t=woTypeRaw(w);if(t)inv[t]=true;}});
  if(inv.tie_in||inv.hrv)return 'tie';
  if(inv.bsmt||inv['bsmt-hiv'])return 'bsmt';
  if(inv.rough||inv['rough-hiv'])return 'rough';
  if(wos.length)return 'wo';
  return 'none';
}
function isMasterLot(map,lot){
  if(!lot.model)return false;var mm=D.modelMasters[smModelMasterKey(lot.model)];
  return !!(mm&&mm.masterLotKey&&mm.masterLotKey===smLotKey(map._id,lot));
}
function stageOf(k){return STAGES.find(function(s){return s.k===k;})||STAGES[0];}
function sortLots(lots){return lots.slice().sort(function(a,b){return String(a.block||'').localeCompare(String(b.block||''),undefined,{numeric:true})||(parseInt(a.num)||0)-(parseInt(b.num)||0)||String(a.num).localeCompare(String(b.num))||String(a.unit||'').localeCompare(String(b.unit||''));});}

/* ───────────────────────── Sites tab ───────────────────────── */
App._sitesTabTap=function(){};
SCREENS.sites=function(){
  var idx=buildSites(),nav=NAV.sites[NAV.sites.length-1];
  if(nav&&nav.key){var site=idx[nav.key];if(site)return siteScreen(site);NAV.sites.pop();nav=NAV.sites[NAV.sites.length-1];}
  if(nav&&nav.builder)return builderScreen(nav.builder,idx);
  return sitesRoot(idx);
};
function sitesRoot(idx){
  var q=lc(SV.q);
  var sites=Object.values(idx);
  var active=sites.filter(function(s){return s.maps.some(function(m){return !m._closed;});});
  var match=function(s){return !q||lc(s.builder).indexOf(q)>=0||lc(s.site).indexOf(q)>=0;};
  var html='<div class="hd"><h1>Sites</h1>'+(isAdm()?'<button class="btn ghost mini" onclick="App.uploadMap()">Upload site map</button>':'')+'</div>'
    +'<div style="margin-top:14px"><input type="search" placeholder="Search builders or sites" aria-label="Search sites" value="'+h(SV.q)+'" oninput="App.siteSearch(this.value)"></div>';
  var act=active.filter(match);
  html+='<div class="blk"><h2>Active sites</h2><div class="card">'+(act.length?act.map(siteRow).join(''):'<p class="empty">'+(q?'No active sites match.':'No site maps yet.'+(isAdm()?' Upload one to start tracking lots.':''))+'</p>')+'</div></div>';
  var builders=buildersFrom(idx).filter(function(b){return !q||lc(b.name).indexOf(q)>=0||b.sites.some(match);});
  html+='<div class="blk"><h2>All builders</h2><div class="card">'+(builders.length?builders.map(function(b){
    var ready=b.sites.reduce(function(s,x){return s+siteReady(x).length;},0);
    return '<div class="lrow"><button class="lmain" onclick="App.openBuilder(R('+reg(b.name)+'))"><span class="top"><b>'+h(b.name)+'</b>'+(ready?'<span class="pill warn">'+ready+' to invoice</span>':'')+'</span><span class="s">'+pl(b.sites.length,'site')+'</span></button><span class="chev">›</span></div>';
  }).join(''):'<p class="empty">Nothing matches.</p>')+'</div></div>';
  return html;
}
function siteRow(s){
  var m=s.maps.find(function(x){return !x._closed;})||s.maps[0];
  var openMaps=s.maps.filter(function(x){return !x._closed;});
  var lots=(openMaps.length?openMaps:s.maps).reduce(function(n,x){return n+(x.lots||[]).length;},0);
  var ready=siteReady(s).length,fl=siteFlags(s);
  var thumb=m&&m.imageData?'<img class="thumb" src="'+m.imageData+'" alt="">':'<span class="thumb">'+svg('map')+'</span>';
  return '<button class="site-card" onclick="App.openSite(R('+reg(s.key)+'),R('+reg(s.builder)+'))">'+thumb
    +'<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><b>'+h(s.site)+'</b><span class="s">'+h(s.builder)+(lots?' · '+pl(lots,'lot'):'')+'</span>'
    +'<span class="strip">'+(ready?'<span class="pill warn">'+ready+' to invoice</span>':'')+(fl?'<span class="pill bad">'+pl(fl,'flag')+'</span>':'')+'</span></span><span class="chev">›</span></button>';
}
function builderScreen(name,idx){
  var b=buildersFrom(idx).find(function(x){return lc(x.name)===lc(name);});
  var html='<button class="crumb" onclick="App.siteBack()">‹ Sites</button><h1>'+h(name)+'</h1>';
  if(!b)return html+'<div class="blk"><p class="empty">No sites for this builder.</p></div>';
  var sites=b.sites.slice().sort(function(x,y){var ax=x.maps.some(function(m){return !m._closed;})?0:1,ay=y.maps.some(function(m){return !m._closed;})?0:1;return ax-ay||x.site.localeCompare(y.site);});
  return html+'<p class="muted">'+pl(sites.length,'site')+'</p><div class="blk"><div class="card">'+sites.map(siteRow).join('')+'</div></div>'
    +(isAdm()?'<div class="blk"><button class="btn ghost wide" onclick="App.uploadMap(R('+reg(name)+'))">Upload a site map for '+h(name)+'</button></div>':'');
}
App.siteSearch=function(v){SV.q=v;renderScreen();var i=document.querySelector('#screen input[type=search]');if(i){i.focus();i.setSelectionRange(v.length,v.length);}};
App.openBuilder=function(name){NAV.sites.push({builder:name});window.scrollTo(0,0);renderScreen(false);};
App.openSite=function(key,builder){
  if(TAB!=='sites')TAB='sites';
  NAV.sites=[{builder:builder},{builder:builder,key:key}];
  SV.tab=null;SV.mapId=null;SV.stage=null;MAPV.edit=false;MAPV.fit=true;
  while(STACK.length)popSheet();
  window.scrollTo(0,0);renderScreen(false);
};
App.siteBack=function(){NAV.sites.pop();MAPV.edit=false;window.scrollTo(0,0);renderScreen(false);};
App.siteTab=function(t){SV.tab=t;MAPV.edit=false;renderScreen();};
App.siteMap=function(id){SV.mapId=id;MAPV.fit=true;renderScreen();};
App.siteStage=function(k){SV.stage=SV.stage===k?null:k;renderScreen();};

function siteScreen(site){
  var maps=site.maps.slice().sort(function(a,b){return (a._closed?1:0)-(b._closed?1:0)||String(a.name||'').localeCompare(String(b.name||''));});
  var map=maps.find(function(m){return m._id===SV.mapId;})||maps.find(function(m){return !m._closed;})||maps[0]||null;
  if(map)SV.mapId=map._id;
  var tabs=[];if(map){tabs.push(['map','Map']);tabs.push(['lots','Lots']);}
  tabs.push(['wos','Work orders']);tabs.push(['masters','Masters']);tabs.push(['files','Files']);
  if(!SV.tab||!tabs.some(function(t){return t[0]===SV.tab;}))SV.tab=tabs[0][0];
  var ready=siteReady(site),readySum=ready.reduce(function(s,w){return s+woTotal(w);},0);
  var html='<button class="crumb" onclick="App.siteBack()">‹ '+h(site.builder)+'</button>'
    +'<div class="hd"><div><h1>'+h(site.site)+'</h1><p class="muted">'+h(site.builder)+(map&&map._closed?' · closed':'')+'</p></div>'
    +'<button class="btn ghost mini" onclick="openNewWO(R('+reg({builder:site.builder,site:site.site})+'))">New work order</button></div>';
  if(maps.length>1)html+='<div class="chips" style="margin-top:12px" role="group" aria-label="Site plan">'+maps.map(function(m){return '<button aria-pressed="'+(m._id===SV.mapId)+'" onclick="App.siteMap(\''+h(m._id)+'\')">'+h(m.name||'Plan')+(m._closed?' (closed)':'')+'</button>';}).join('')+'</div>';
  if(map){
    var byLot=mapWOs(map),lots=map.lots||[],cnt={};STAGES.forEach(function(s){cnt[s.k]=0;});
    lots.forEach(function(l){cnt[lotStage(byLot,l)]++;});
    html+='<div class="card" style="padding:14px;margin-top:14px"><div class="sec-h"><span class="s">Lots tied in</span><b class="num" style="font-size:20px">'+cnt.tie+' of '+lots.length+'</b></div>'
      +'<div class="bar" style="margin:10px 0 12px">'+STAGES.map(function(s){return lots.length?'<span style="width:'+(cnt[s.k]/lots.length*100)+'%;background:'+s.c+'"></span>':'';}).join('')+'</div>'
      +'<div class="legend">'+STAGES.map(function(s){return '<button aria-pressed="'+(SV.stage===s.k)+'" onclick="App.siteStage(\''+s.k+'\')"><b><span class="sw" style="background:'+s.c+'"></span>'+cnt[s.k]+'</b>'+s.label+'</button>';}).join('')+'</div>'
      +(ready.length?'<p class="s" style="margin-top:10px">'+pl(ready.length,'work order')+' ready to invoice, '+money0(readySum)+' before HST.</p>':'')+'</div>';
  }else if(ready.length){
    html+='<div class="card" style="padding:14px;margin-top:14px"><p>'+pl(ready.length,'work order')+' ready to invoice, '+money0(readySum)+' before HST.</p></div>';
  }
  html+='<div class="seg" style="margin-top:14px" role="group" aria-label="Site section">'+tabs.map(function(t){return '<button aria-pressed="'+(SV.tab===t[0])+'" onclick="App.siteTab(\''+t[0]+'\')">'+t[1]+'</button>';}).join('')+'</div>';
  html+='<div class="blk" style="margin-top:14px">'+({map:siteMapTab,lots:siteLotsTab,wos:siteWOsTab,masters:siteMastersTab,files:siteFilesTab})[SV.tab](site,map)+'</div>';
  return html;
}

/* map tab: the viewer is mounted after render */
function siteMapTab(site,map){
  if(!map)return '';
  var admin=isAdm();
  return '<div class="mapwrap'+(MAPV.edit?' drawing':'')+'" id="mapMount" data-map="'+h(map._id)+'">'
    +(map.imageData?'':'<p class="empty">This site map has no image.</p>')
    +'<span class="maphint">'+(MAPV.edit?'Drag on the plan to mark a new lot. Tap a lot to edit or remove it.':'Tap a lot to see its work. Pinch or use the buttons to zoom.')+'</span>'
    +'<div class="zoom"><button aria-label="Zoom in" onclick="mapZoom(1.4)">+</button><button aria-label="Zoom out" onclick="mapZoom(1/1.4)">−</button><button aria-label="Fit the plan" onclick="mapFit()">⤢</button></div></div>'
    +(admin?'<div class="strip" style="margin-top:12px"><button class="btn '+(MAPV.edit?'':'ghost ')+'mini" onclick="App.toggleEdit()">'+(MAPV.edit?'Done marking lots':'Mark lots')+'</button>'
      +(!map._closed?'<button class="btn ghost mini" onclick="App.closeSite(\''+h(map._id)+'\')">Close site</button>':'')
      +'<button class="btn ghost mini" onclick="App.uploadMap(R('+reg(site.builder)+'),R('+reg(site.site)+'))">Add another plan</button></div>':'');
}
App.toggleEdit=function(){MAPV.edit=!MAPV.edit;renderScreen();};
function siteLotsTab(site,map){
  var byLot=mapWOs(map),lots=sortLots(map.lots||[]);
  if(SV.stage)lots=lots.filter(function(l){return lotStage(byLot,l)===SV.stage;});
  if(!lots.length)return '<div class="card"><p class="empty">'+(SV.stage?'No lots at this stage.':'No lots marked on this plan yet.')+'</p></div>';
  return '<div class="card">'+lots.map(function(l){
    var st=stageOf(lotStage(byLot,l)),key=smLotKey(map._id,l),ld=D.lotData[key]||{};
    var tasks=ld.tasks||[],done=tasks.filter(function(t){return t.status==='complete';}).length;
    var fl=(ld.flags||[]).filter(function(f){return !f.resolved;}).length;
    return '<div class="lrow"><button class="lmain" onclick="App.openLot(\''+h(map._id)+'\',\''+h(key)+'\')"><span class="top"><b>'+h(smJobLabel(l))+(isMasterLot(map,l)?' ★':'')+'</b>'+(fl?'<span class="pill bad">'+pl(fl,'flag')+'</span>':'')+'</span>'
      +'<span class="strip"><span class="pill"><span class="sw" style="background:'+st.c+'"></span>'+st.label+'</span>'+(l.model?'<span class="s">'+h(l.model)+'</span>':'')+(tasks.length?'<span class="s">'+done+'/'+tasks.length+' tasks</span>':'')+'</span></button><span class="chev">›</span></div>';
  }).join('')+'</div>';
}
function siteWOsTab(site){
  var wos=site.wos.slice().sort(function(a,b){return String(b._savedAt||b.date||'').localeCompare(String(a._savedAt||a.date||''));});
  if(!wos.length)return '<div class="card"><p class="empty">No work orders for this site yet.</p></div>';
  var groups=[['Edits waiting for approval',wos.filter(function(w){return w._pendingEdit;})],['Ready to invoice',wos.filter(function(w){return !w._pendingEdit&&w.status!=='invoiced';})],['Invoiced',wos.filter(function(w){return !w._pendingEdit&&w.status==='invoiced';})]];
  return groups.filter(function(g){return g[1].length;}).map(function(g){
    var list=g[0]==='Invoiced'?g[1].slice(0,40):g[1];
    return '<h3 style="margin:14px 0 8px">'+g[0]+' <span class="muted">('+g[1].length+')</span></h3><div class="card">'+list.map(woRow).join('')+'</div>'+(list.length<g[1].length?'<p class="s" style="margin-top:6px">Showing the 40 most recent.</p>':'');
  }).join('');
}
function siteMastersTab(site){
  if(!site.masters.length)return '<div class="card"><p class="empty">No masters saved for this site.</p></div>';
  return '<div class="card">'+site.masters.map(function(m){
    var mdl=masterModel(m),canShare=!isAdm()&&!m._shared&&m._owner===meUser();
    return '<div class="lrow"><button class="lmain" onclick="editMasterTemplate(R('+reg(m)+'))"><span class="top"><b>'+h(m.label||masterKey(m))+'</b></span><span class="s">'+h([mdl?'Model '+mdl:'',masterLot(m)?'Lot '+masterLot(m):'',m._savedAt?'Saved '+fmtDate(m._savedAt):''].filter(Boolean).join(' · '))+'</span></button>'
      +(canShare?'<button class="btn ghost mini" onclick="App.shareDoc(\'saved_masters\',\''+h(masterKey(m))+'\',\'master\')">Share</button>':'')
      +(isAdm()?'<button class="btn ghost mini" aria-label="Remove master" onclick="App.removeMaster(\''+h(m.id||masterKey(m))+'\')">Remove</button>':'')+'</div>';
  }).join('')+'</div>';
}
function siteFilesTab(site){
  var docs=D.docs.filter(function(d){return d.builder===site.builder&&d.site===site.site;});
  var by={};docs.forEach(function(d){var l=d.lot||'General';(by[l]=by[l]||[]).push(d);});
  var keys=Object.keys(by).sort(function(a,b){return (parseInt(a)||0)-(parseInt(b)||0)||a.localeCompare(b);});
  return (isAdm()?'<button class="btn ghost wide" style="margin-bottom:12px" onclick="App.uploadDoc(R('+reg({builder:site.builder,site:site.site,lot:'',mapId:(site.maps&&site.maps.length===1)?site.maps[0]._id:''})+'))">Upload a document</button>':'')
    +(keys.length?keys.map(function(k){return '<h3 style="margin:12px 0 8px">'+(k==='General'?'Whole site':'Lot '+h(k))+'</h3><div class="card">'+by[k].map(docRow).join('')+'</div>';}).join(''):'<div class="card"><p class="empty">No heating plans, site maps or drawings uploaded yet.</p></div>');
}
function docRow(d){
  return '<div class="lrow"><a class="lmain" href="'+h(d.url)+'" target="_blank" rel="noopener"><b>'+h(d.label||d.fileName)+'</b><span class="s">'+h([d.type,fmtDate(d.uploadedAt),d.uploadedBy].filter(Boolean).join(' · '))+'</span></a>'
    +(isAdm()?'<button class="btn ghost mini" onclick="App.removeDoc(\''+h(d._id)+'\')">Remove</button>':'<span class="chev">↗</span>')+'</div>';
}
App.closeSite=async function(id){
  var ok=await ask('Close this site?','It moves out of Active sites. You can still find it under its builder.',[{label:'Cancel',value:false,style:'ghost'},{label:'Close site',value:true}]);if(!ok)return;
  if(await save(function(){return DB.collection('site_maps').doc(id).update({_closed:true,_closedAt:new Date().toISOString()});},'Site closed')){var m=D.maps.find(function(x){return x._id===id;});if(m)m._closed=true;changed();}
};
App.removeMaster=async function(id){
  var ok=await ask('Remove this master?','It\'s marked deleted and stops appearing for everyone.',[{label:'Cancel',value:false,style:'ghost'},{label:'Remove',value:true,style:'danger'}]);if(!ok)return;
  await save(function(){return DB.collection('saved_masters').doc(String(id).replace(/[/.]/g,'_')).update({_deleted:true,_deletedAt:new Date().toISOString()});},'Master removed');
};
App.removeDoc=async function(id){
  var ok=await ask('Remove this document?','It moves to trash in the current portal.',[{label:'Cancel',value:false,style:'ghost'},{label:'Remove',value:true,style:'danger'}]);if(!ok)return;
  if(await save(function(){return DB.collection('site_docs').doc(id).update({_deleted:true,_deletedAt:new Date().toISOString()});},'Document removed')){await loadDocs();changed();}
};

/* ───────────────────────── map viewer ───────────────────────── */
function afterScreenRender(){
  var wrap=document.getElementById('mapMount');if(!wrap)return;
  var map=D.maps.find(function(m){return m._id===wrap.dataset.map;});if(!map||!map.imageData)return;
  mountMap(wrap,map);
}
var _mapCtx=null;
function mountMap(wrap,map){
  var W=map.imageWidth||1200,H=map.imageHeight||800;
  var cw=wrap.clientWidth||600;
  wrap.style.height=Math.max(240,Math.min(Math.round(cw*H/W)+2,Math.round(window.innerHeight*0.64)))+'px';
  var ch=wrap.clientHeight||400;
  var s0=Math.min(cw/W,ch/H);var dw=Math.round(W*s0),dh=Math.round(H*s0);
  if(MAPV.mapId!==map._id){MAPV.mapId=map._id;MAPV.fit=true;}
  if(MAPV.fit){MAPV.z=1;MAPV.x=Math.round((cw-dw)/2);MAPV.y=Math.round((ch-dh)/2);MAPV.fit=false;}
  var byLot=mapWOs(map);
  var stage=document.createElement('div');stage.className='mapstage';stage.style.width=dw+'px';stage.style.height=dh+'px';
  var rects=(map.lots||[]).map(function(l,i){
    var st=lotStage(byLot,l),dim=SV.stage&&st!==SV.stage,ms=isMasterLot(map,l);
    var c=MAPV.edit?{fill:'rgba(59,130,246,0.3)',stroke:'#2563eb'}:ms?MASTER_FILL:stageOf(st);
    var x=l.x*dw,y=l.y*dh,w=l.w*dw,hh=l.h*dh;
    return '<rect class="lot" data-i="'+i+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+hh+'" rx="2" fill="'+c.fill+'" stroke="'+c.stroke+'" stroke-width="1.5" opacity="'+(dim?0.25:1)+'"><title>'+h(smJobLabel(l)+' · '+stageOf(st).label)+'</title></rect>'
      +(ms&&w>14&&hh>10?'<text x="'+(x+w-3)+'" y="'+(y+10)+'" text-anchor="end" font-size="'+Math.min(10,hh*0.3)+'" font-weight="900" fill="#92400e" pointer-events="none">★</text>':'');
  }).join('');
  stage.innerHTML='<img src="'+map.imageData+'" alt="Site plan for '+h(map.name||map.site||'')+'" width="'+dw+'" height="'+dh+'" draggable="false">'
    +'<svg width="'+dw+'" height="'+dh+'" viewBox="0 0 '+dw+' '+dh+'"><g id="lotsG">'+rects+'</g><rect id="drawRect" x="0" y="0" width="0" height="0" fill="rgba(34,197,94,0.15)" stroke="#16a34a" stroke-width="2" stroke-dasharray="5 3" display="none"/></svg>';
  wrap.insertBefore(stage,wrap.firstChild);
  _mapCtx={wrap:wrap,stage:stage,map:map,dw:dw,dh:dh};
  applyMapTransform();
  bindMapGestures(wrap);
}
function applyMapTransform(){if(!_mapCtx)return;_mapCtx.stage.style.transform='translate('+MAPV.x+'px,'+MAPV.y+'px) scale('+MAPV.z+')';}
function mapZoom(f,cx,cy){
  if(!_mapCtx)return;var r=_mapCtx.wrap.getBoundingClientRect();
  if(cx==null){cx=r.width/2;cy=r.height/2;}
  var nz=Math.max(0.5,Math.min(8,MAPV.z*f));
  MAPV.x=cx-(cx-MAPV.x)*(nz/MAPV.z);MAPV.y=cy-(cy-MAPV.y)*(nz/MAPV.z);MAPV.z=nz;applyMapTransform();
}
function mapFit(){MAPV.fit=true;renderScreen();}
function bindMapGestures(wrap){
  if(wrap._bound)return;wrap._bound=true;
  var pts={},start=null,pinch=null,moved=false,draw=null;
  function local(ev){var r=wrap.getBoundingClientRect();return {x:ev.clientX-r.left,y:ev.clientY-r.top};}
  function toStage(p){return {x:(p.x-MAPV.x)/MAPV.z,y:(p.y-MAPV.y)/MAPV.z};}
  wrap.addEventListener('pointerdown',function(ev){
    if(ev.target.closest('.zoom'))return;
    wrap.setPointerCapture(ev.pointerId);pts[ev.pointerId]=local(ev);
    var ids=Object.keys(pts);moved=false;
    if(ids.length===1){
      start={p:pts[ev.pointerId],x:MAPV.x,y:MAPV.y,target:ev.target};
      if(MAPV.edit&&!ev.target.closest('rect.lot')){var sp=toStage(pts[ev.pointerId]);draw={x0:sp.x,y0:sp.y,x1:sp.x,y1:sp.y};}
    }else if(ids.length===2){
      draw=null;var a=pts[ids[0]],b=pts[ids[1]];
      pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:MAPV.z,mx:(a.x+b.x)/2,my:(a.y+b.y)/2,x:MAPV.x,y:MAPV.y};
    }
  });
  wrap.addEventListener('pointermove',function(ev){
    if(!pts[ev.pointerId])return;pts[ev.pointerId]=local(ev);
    var ids=Object.keys(pts);
    if(ids.length===2&&pinch){
      var a=pts[ids[0]],b=pts[ids[1]],d=Math.hypot(a.x-b.x,a.y-b.y);
      var nz=Math.max(0.5,Math.min(8,pinch.z*d/pinch.d)),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
      MAPV.x=mx-(pinch.mx-pinch.x)*(nz/pinch.z);MAPV.y=my-(pinch.my-pinch.y)*(nz/pinch.z);MAPV.z=nz;moved=true;applyMapTransform();return;
    }
    if(ids.length===1&&start){
      var p=pts[ids[0]],dx=p.x-start.p.x,dy=p.y-start.p.y;
      if(Math.abs(dx)+Math.abs(dy)>6)moved=true;
      if(draw){var sp=toStage(p);draw.x1=sp.x;draw.y1=sp.y;var r=document.getElementById('drawRect');if(r){r.setAttribute('display','');r.setAttribute('x',Math.min(draw.x0,draw.x1));r.setAttribute('y',Math.min(draw.y0,draw.y1));r.setAttribute('width',Math.abs(draw.x1-draw.x0));r.setAttribute('height',Math.abs(draw.y1-draw.y0));}return;}
      if(moved){MAPV.x=start.x+dx;MAPV.y=start.y+dy;applyMapTransform();}
    }
  });
  function end(ev){
    var had=!!pts[ev.pointerId];delete pts[ev.pointerId];
    if(Object.keys(pts).length===0){
      if(had&&draw&&moved&&_mapCtx){
        var w=Math.abs(draw.x1-draw.x0),hh=Math.abs(draw.y1-draw.y0);
        var r=document.getElementById('drawRect');if(r)r.setAttribute('display','none');
        if(w*MAPV.z>=8&&hh*MAPV.z>=8){
          var c=_mapCtx;App.newLot(c.map._id,{x:Math.max(0,Math.min(draw.x0,draw.x1))/c.dw,y:Math.max(0,Math.min(draw.y0,draw.y1))/c.dh,w:w/c.dw,h:hh/c.dh});
        }
      }else if(had&&!moved&&start&&start.target&&start.target.closest){
        var rect=start.target.closest('rect.lot');
        if(rect&&_mapCtx){var lot=(_mapCtx.map.lots||[])[+rect.dataset.i];if(lot)App.openLot(_mapCtx.map._id,smLotKey(_mapCtx.map._id,lot));}
      }
      start=null;pinch=null;draw=null;
    }else if(Object.keys(pts).length===1){var id=Object.keys(pts)[0];start={p:pts[id],x:MAPV.x,y:MAPV.y,target:null};pinch=null;moved=true;}
  }
  wrap.addEventListener('pointerup',end);wrap.addEventListener('pointercancel',end);
  wrap.addEventListener('wheel',function(ev){ev.preventDefault();var p=local(ev);mapZoom(ev.deltaY<0?1.15:1/1.15,p.x,p.y);},{passive:false});
}
window.addEventListener('resize',function(){if(document.getElementById('mapMount')){MAPV.fit=true;renderScreen();}});

/* ───────────────────────── mark a new lot (admin) ───────────────────────── */
App.newLot=function(mapId,rect){push({type:'newLot',mapId:mapId,rect:rect,d:{block:'',num:'',unit:'',model:''}});};
function modelOptions(map){
  var s=new Set();allMasters().forEach(function(m){var x=masterModel(m);if(x)s.add(x);});
  D.wos.forEach(function(w){var x=woSnap(w).fm||woSnap(w).fmodel||w.model;if(x)s.add(x);});
  if(map)(map.lots||[]).forEach(function(l){if(l.model)s.add(l.model);});
  return '<datalist id="modelList">'+Array.from(s).sort().map(function(m){return '<option value="'+h(m)+'">';}).join('')+'</datalist>';
}
SHEETS.newLot=function(e){
  var map=D.maps.find(function(m){return m._id===e.mapId;});
  return {title:'New lot',body:'<div class="sec"><p class="s">Block, lot and unit together make the lot\'s label. Fill in any of them. The model links the lot to matching masters and work orders.</p>'
    +'<div class="three">'+fld('Block #','block')+fld('Lot #','num')+fld('Unit #','unit')+'</div>'
    +'<label class="field">Model<input list="modelList" value="'+h(e.d.model)+'" oninput="App.setD(\'model\',this.value)" placeholder="e.g. Bungalow 1200"></label>'+modelOptions(map)+'</div>',
    foot:'<button class="btn ghost" onclick="App.pop()">Cancel</button><button class="btn" onclick="App.saveNewLot()">Add lot</button>'};
};
App.saveNewLot=async function(){
  var e=curSheet(),d=e.d,block=String(d.block||'').trim(),num=String(d.num||'').trim(),unit=String(d.unit||'').trim(),model=String(d.model||'').trim();
  if(!block&&!num&&!unit)return rerender('Fill in a block, lot or unit number.');
  var map=D.maps.find(function(m){return m._id===e.mapId;});if(!map)return;
  var lot={x:e.rect.x,y:e.rect.y,w:e.rect.w,h:e.rect.h};if(block)lot.block=block;lot.num=num||'';if(unit)lot.unit=unit;if(model)lot.model=model;
  var lots=(map.lots||[]).concat([lot]);
  if(await save(function(){return DB.collection('site_maps').doc(map._id).update({lots:lots,_updatedAt:new Date().toISOString()});},'Lot added')){map.lots=lots;popSheet();}
};

/* ───────────────────────── lot sheet ───────────────────────── */
function findLot(mapId,key){
  var map=D.maps.find(function(m){return m._id===mapId;});if(!map)return null;
  var i=(map.lots||[]).findIndex(function(l){return smLotKey(map._id,l)===key;});
  return i<0?null:{map:map,lot:map.lots[i],i:i};
}
App.openLot=function(mapId,key){push({type:'lot',mapId:mapId,key:key,live:true});};
App.openLotByKey=function(key){var hit=lotIndex()[key];if(!hit){showToast('That lot is no longer on a site map.',true);return;}App.openLot(hit.map._id,key);};
function modelMastersFor(model){if(!model)return [];return allMasters().filter(function(m){return lc(masterModel(m))===lc(model);});}
SHEETS.lot=function(e){
  var f=findLot(e.mapId,e.key);
  if(!f)return {title:'Lot',body:'<div class="sec"><p class="empty">This lot was removed from the map.</p></div>'};
  var map=f.map,lot=f.lot,admin=isAdm(),byLot=mapWOs(map),wos=lotWOsFrom(byLot,lot);
  var ld=D.lotData[e.key]||{},flags=(ld.flags||[]).filter(function(x){return !x.resolved;});
  var tasks=ld.tasks||defaultTasks();
  var s0=wos[0]?woSnap(wos[0]):{};
  var builder=map.builder||s0.fb||s0.fbuilder||map.name||'',site=map.site||s0.fp||s0.fsite||'';
  var model=lot.model||s0.fm||s0.fmodel||'';
  var st=stageOf(lotStage(byLot,lot));
  var masters=modelMastersFor(model).filter(canSee);
  var mm=model?D.modelMasters[smModelMasterKey(model)]:null,isMaster=!!(mm&&mm.masterLotKey===e.key);
  // templates from the model's master lot (same rules as the current portal)
  var tplWOs=[],tplDocs=[];
  if(mm&&mm.masterLotKey&&!isMaster){
    var allSite=[];Object.values(byLot).forEach(function(a){allSite=allSite.concat(a);});
    if(mm.masterWOIds&&mm.masterWOIds.length){var ids=new Set(mm.masterWOIds);tplWOs=D.wos.filter(function(w){return ids.has(w._id)&&!w._deleted;});}
    else{var mLot=map.lots.find(function(l){return smLotKey(map._id,l)===mm.masterLotKey;});var mNum=String(mm.masterLotNum||(mLot&&mLot.num)||'').trim();if(mNum)tplWOs=allSite.filter(function(w){return woLot(w)===mNum;});}
    var mNum2=String(mm.masterLotNum||'').trim();
    if(mNum2)tplDocs=D.docs.filter(function(d){return (!d._mapId||d._mapId===map._id)&&d.builder===builder&&d.site===site&&String(d.lot||'').trim()===mNum2;});
  }
  var haveTypes={};wos.forEach(function(w){var t=woTypeRaw(w);if(t)haveTypes[t]=1;});
  tplWOs=tplWOs.filter(function(w){return !haveTypes[woTypeRaw(w)];});
  var docs=D.docs.filter(function(d){return (!d._mapId||d._mapId===map._id)&&(d._mapId===map._id||(d.builder===builder&&d.site===site))&&(String(d.lot)===String(lot.num)||((!d.lot||d.lot==='General')&&['Heating Plan','Extra','Architectural'].indexOf(d.type)>=0));});
  var docNames=new Set(docs.map(function(d){return lc(d.label||d.fileName);}));tplDocs=tplDocs.filter(function(d){return !docNames.has(lc(d.label||d.fileName));});
  var ownMasters=masters.filter(function(m){return String(masterLot(m)).trim()===String(lot.num||'').trim()&&masterLot(m)!=='';});
  var html='';
  // status
  html+='<div class="sec"><div class="strip"><span class="pill"><span class="sw" style="background:'+st.c+'"></span>'+st.label+'</span>'+(isMaster?'<span class="pill warn">★ Master lot for '+h(model)+'</span>':'')+'</div>'
    +'<div class="card">'+[['Model',model],['Builder',builder],['Site',site]].filter(function(r){return r[1];}).map(function(r){return '<div class="stat"><div><span>'+r[0]+'</span>'+h(r[1])+'</div></div>';}).join('')+'</div>'
    +(admin&&model?'<button class="btn ghost mini" style="align-self:flex-start" onclick="App.toggleMasterLot()">'+(isMaster?'Stop using as master lot':'Use as master lot for '+h(model))+'</button>':'')+'</div>';
  // flags
  html+='<div class="sec"><div class="sec-h"><h3>Flags</h3><button class="link" onclick="App.addFlag()">Add flag</button></div>'
    +(flags.length?flags.map(function(x){return '<div class="flag '+h(x.type)+'"><div class="sec-h"><span class="k">'+(x.type==='missing_material'?'Missing material':'Unfinished work')+'</span><button class="btn mini" onclick="App.resolveFlag(\''+h(e.key)+'\',\''+h(x.id)+'\')">Done</button></div><p style="margin-top:4px;font-weight:600">'+h(x.text)+'</p>'
      +(x.materials?'<p class="s" style="white-space:pre-wrap">Materials: '+h(x.materials)+'</p>':'')+(x.photoUrl?'<a href="'+h(x.photoUrl)+'" target="_blank" rel="noopener"><img src="'+h(x.photoUrl)+'" alt="Flag photo" style="max-width:100%;max-height:160px;border-radius:8px;margin-top:6px;display:block"></a>':'')
      +'<p class="s">'+h([x.createdBy,String(x.createdAt||'').slice(0,10)].filter(Boolean).join(' · '))+'</p></div>';}).join(''):'<p class="s">No open flags.</p>')+'</div>';
  // work orders
  html+='<div class="sec"><div class="sec-h"><h3>Work orders</h3><button class="link" onclick="App.newWOForLot()">New work order</button></div>'
    +tplWOs.map(function(w){return '<div class="card tpl" style="padding:10px 12px"><div class="sec-h"><b>'+h(woTypeLabel(w))+'</b><span class="pill ok">From master lot</span></div><p class="s">'+h([woInstaller(w),fmtDay(woDate(w)),woTotal(w)?money(woTotal(w)):''].filter(Boolean).join(' · '))+'</p>'
      +'<button class="btn mini" style="margin-top:8px" onclick="App.copyFromMaster(R('+reg(w)+'))">Copy to this lot</button></div>';}).join('')
    +(wos.length?'<div class="card">'+wos.map(function(w){var ws=woStatus(w);return '<div class="lrow"><button class="lmain" onclick="openWOInTool(R('+reg(w)+'))"><span class="top"><b>'+h(woTypeLabel(w))+'</b>'+(woTotal(w)?'<b class="amt">'+money(woTotal(w))+'</b>':'')+'</span><span class="s">'+h([w.masterNum||w.jobNum,woInstaller(w),fmtDay(woDate(w))].filter(Boolean).join(' · '))+'</span><span class="pill '+ws[0]+'">'+ws[1]+'</span></button>'
      +(admin?'<button class="btn ghost mini" onclick="App.unlinkWO(\''+h(w._id)+'\')">Unlink</button>':'<span class="chev">›</span>')+'</div>';}).join('')+'</div>':(tplWOs.length?'':'<p class="s">No work order for this lot yet.</p>'))+'</div>';
  // masters
  if(model){
    var showTpl=!isMaster&&!ownMasters.length;
    html+='<div class="sec"><h3>Masters for '+h(model)+'</h3>'+(masters.length?'<div class="card">'+masters.map(function(m){
      var ref=mm&&mm.masterKey===masterKey(m);
      return '<div class="lrow"><button class="lmain" onclick="App.openMasterForLot(R('+reg(m)+'))"><span class="top"><b>'+h(masterKey(m))+'</b>'+(showTpl?'<span class="pill ok">From master lot</span>':ref?'<span class="pill ok">Reference</span>':'')+'</span><span class="s">'+h(m._savedAt?'Saved '+fmtDate(m._savedAt):'')+'</span></button>'
        +(admin?'<button class="btn ghost mini" onclick="App.removeMaster(\''+h(m.id||masterKey(m))+'\')">Remove</button>':'<span class="chev">›</span>')+'</div>';
    }).join('')+'</div>':'<p class="s">No masters saved for model '+h(model)+' yet.</p>')+'</div>';
  }
  // documents
  html+='<div class="sec"><div class="sec-h"><h3>Documents</h3>'+(admin?'<button class="link" onclick="App.uploadDoc(R('+reg({builder:builder,site:site,lot:String(lot.num||''),mapId:map._id})+'))">Upload</button>':'')+'</div>'
    +(tplDocs.length||docs.length?'<div class="card">'+tplDocs.map(function(d){return '<div class="lrow"><a class="lmain" href="'+h(d.url)+'" target="_blank" rel="noopener"><span class="top"><b>'+h(d.label||d.fileName)+'</b><span class="pill ok">From master lot</span></span><span class="s">'+h(d.type)+'</span></a></div>';}).join('')+docs.map(docRow).join('')+'</div>':'<p class="s">No documents for this lot.</p>')+'</div>';
  // tasks
  var done=tasks.filter(function(t){return t.status==='complete';}).length;
  var me=meName(),names=staffNamesForPicker();
  html+='<div class="sec"><div class="sec-h"><h3>Tasks</h3><span class="s">'+done+' of '+tasks.length+' done</span></div><div class="prog"><span style="width:'+(tasks.length?done/tasks.length*100:0)+'%"></span></div><div>'
    +tasks.map(function(t,ti){
      var mine=t.assignedTo&&t.assignedTo===me,canTick=admin||mine;
      return '<div class="task"><input type="checkbox" aria-label="'+h(t.label)+' done" '+(t.status==='complete'?'checked':'')+(canTick?'':' disabled')+' onchange="App.taskDone('+ti+',this.checked)"><span class="nm">'+h(t.label)+'</span>'
        +(admin?'<select aria-label="Assign '+h(t.label)+'" onchange="App.assignTask('+ti+',this.value)"><option value="">'+(t.assignedTo?'Unassign':'Assign…')+'</option>'+(t.assignedTo?'<option value="'+h(t.assignedTo)+'" selected>'+h(t.assignedTo)+'</option>':'')+names.filter(function(n){return n!==t.assignedTo;}).map(function(n){return '<option value="'+h(n)+'">'+h(n===me?n+' (me)':n)+'</option>';}).join('')+'</select>'
          :(t.assignedTo?'<span class="pill'+(mine?' info':'')+'">'+h(t.assignedTo)+'</span>':''))+'</div>';
    }).join('')+'</div></div>';
  if(admin){
    html+='<div class="sec"><h3>Lot details</h3><p class="s">Change the block, lot, unit or model. Tasks and flags move with the lot.</p><button class="btn ghost" onclick="App.editLot()">Edit lot details</button>'
      +(MAPV.edit?'<button class="btn danger" onclick="App.removeLot()">Remove this lot from the map</button>':'')+'</div>';
  }
  return {title:smJobLabel(lot),sub:[map.builder,map.site||map.name].filter(Boolean).join(' · '),body:html};
};
function lotCtx(){var e=curSheet();var f=findLot(e.mapId,e.key);return f?Object.assign({e:e},f):null;}
App.newWOForLot=function(){var c=lotCtx();if(!c)return;openNewWOForLot(c.map,c.lot);};
App.openMasterForLot=function(m){var c=lotCtx();if(!c)return;openMasterForLot(m,c.map,c.lot);};

/* lot tasks — same writes as the current portal (lot_data + assignments) */
function lotDataFor(key,mapId){var ld=D.lotData[key];if(!ld){ld={_mapId:mapId,_jobKey:key,tasks:defaultTasks()};}if(!ld.tasks)ld.tasks=defaultTasks();return JSON.parse(JSON.stringify(ld));}
App.assignTask=async function(ti,name){
  var c=lotCtx();if(!c)return;var key=c.e.key,ld=lotDataFor(key,c.map._id),task=ld.tasks[ti];if(!task)return;
  task.assignedTo=name;task.status=name?'assigned':'unassigned';task.assignedBy=meUser();task.assignedAt=name?new Date().toISOString():'';
  ld._updatedAt=new Date().toISOString();
  var ok=await save(async function(){
    await DB.collection('lot_data').doc(key).set(ld);
    if(name)await DB.collection('assignments').doc(key+'__'+task.id).set({_mapId:c.map._id,_jobKey:key,_taskId:task.id,_taskLabel:task.label,assignedTo:name,assignedBy:meUser(),mapName:c.map.name||'',builder:c.map.builder||'',site:c.map.site||'',status:'active',_createdAt:new Date().toISOString()});
    else await DB.collection('assignments').doc(key+'__'+task.id).delete().catch(function(){});
  },name?task.label+' assigned to '+name:task.label+' unassigned');
  if(ok)D.lotData[key]=ld;changed();
};
App.taskDone=async function(ti,done){
  var c=lotCtx();if(!c)return;var key=c.e.key,ld=lotDataFor(key,c.map._id),task=ld.tasks[ti];if(!task)return;
  task.status=done?'complete':(task.assignedTo?'assigned':'unassigned');task.completedAt=done?new Date().toISOString():'';ld._updatedAt=new Date().toISOString();
  if(await save(function(){return DB.collection('lot_data').doc(key).set(ld);}))D.lotData[key]=ld;changed();
};

/* flags */
App.addFlag=function(){var e=curSheet();push({type:'addFlag',key:e.key,d:{type:'unfinished',text:'',materials:''}});};
SHEETS.addFlag=function(e){
  return {title:'Add flag',body:'<div class="sec"><label class="field">Type<select onchange="App.setD(\'type\',this.value)"><option value="unfinished" '+(e.d.type==='unfinished'?'selected':'')+'>Unfinished work</option><option value="missing_material" '+(e.d.type==='missing_material'?'selected':'')+'>Missing material</option></select></label>'
    +'<label class="field">Note<textarea placeholder="What needs doing?" oninput="App.setD(\'text\',this.value)">'+h(e.d.text)+'</textarea></label>'
    +'<label class="field">Material list (optional)<textarea placeholder="e.g. 6&quot; flex duct x2, filter 16x25" oninput="App.setD(\'materials\',this.value)">'+h(e.d.materials)+'</textarea></label>'
    +'<label class="field">Photo (optional)<input type="file" id="flagPhoto" accept="image/*" capture="environment"></label></div>',
    foot:'<button class="btn ghost" onclick="App.pop()">Cancel</button><button class="btn" onclick="App.saveFlag()">Save flag</button>'};
};
App.saveFlag=async function(){
  var e=curSheet(),d=e.d;if(!String(d.text||'').trim())return rerender('Add a note describing the problem.');
  if(READ_ONLY){notifyReadOnly();return;}
  var file=(document.getElementById('flagPhoto')||{}).files;file=file&&file[0];
  var ok=await save(async function(){
    var photoUrl='';
    if(file&&STORAGE){try{var ref=STORAGE.ref('flag_photos/'+e.key+'_'+Date.now()+'_'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_'));var up=await ref.put(file);photoUrl=await up.ref.getDownloadURL();}catch(x){showToast('Photo upload failed. Saving the flag without it.',true);}}
    var flag={id:'flag_'+Date.now(),type:d.type,text:d.text.trim(),materials:String(d.materials||'').trim(),photoUrl:photoUrl,createdAt:new Date().toISOString(),createdBy:meName(),resolved:false};
    var ref2=DB.collection('lot_data').doc(e.key),snap=await ref2.get();
    var list=snap.exists?(snap.data().flags||[]):[];list.push(flag);
    if(snap.exists)await ref2.update({flags:list});else await ref2.set({flags:list});
    D.lotData[e.key]=Object.assign({},snap.exists?snap.data():{},{flags:list});
  },'Flag added');
  if(ok){popSheet();changed();}
};
App.resolveFlag=async function(key,id){
  var ok=await save(async function(){
    var ref=DB.collection('lot_data').doc(key),snap=await ref.get();if(!snap.exists)return;
    var list=(snap.data().flags||[]).map(function(f){return f.id===id?Object.assign({},f,{resolved:true,resolvedAt:new Date().toISOString(),resolvedBy:meName()}):f;});
    await ref.update({flags:list});D.lotData[key]=Object.assign({},snap.data(),{flags:list});
  },'Flag marked done');
  if(ok)changed();
};

/* lot details, master lot, unlink, copy from master (admin) */
App.editLot=function(){var c=lotCtx();if(!c)return;push({type:'editLot',mapId:c.map._id,key:c.e.key,d:{block:c.lot.block||'',num:String(c.lot.num==null?'':c.lot.num),unit:c.lot.unit||'',model:c.lot.model||''}});};
SHEETS.editLot=function(e){
  var map=D.maps.find(function(m){return m._id===e.mapId;});
  return {title:'Edit lot details',body:'<div class="sec"><div class="three">'+fld('Block #','block')+fld('Lot #','num')+fld('Unit #','unit')+'</div><label class="field">Model<input list="modelList" value="'+h(e.d.model)+'" oninput="App.setD(\'model\',this.value)"></label>'+modelOptions(map)+'</div>',
    foot:'<button class="btn ghost" onclick="App.pop()">Cancel</button><button class="btn" onclick="App.saveLot()">Save</button>'};
};
App.saveLot=async function(){
  var e=curSheet(),d=e.d,f=findLot(e.mapId,e.key);if(!f)return;
  var b=String(d.block||'').trim(),n=String(d.num||'').trim(),u=String(d.unit||'').trim(),m=String(d.model||'').trim();
  if(!b&&!n&&!u)return rerender('Fill in a block, lot or unit number.');
  var nl=Object.assign({},f.lot,{num:n||f.lot.num});if(b)nl.block=b;else delete nl.block;if(u)nl.unit=u;else delete nl.unit;if(m)nl.model=m;else delete nl.model;
  var oldKey=e.key,newKey=smLotKey(f.map._id,nl),lots=f.map.lots.slice();lots[f.i]=nl;
  var ok=await save(async function(){
    if(oldKey!==newKey){var ld=lotDataFor(oldKey,f.map._id);await DB.collection('lot_data').doc(newKey).set(ld);await DB.collection('lot_data').doc(oldKey).delete();D.lotData[newKey]=ld;delete D.lotData[oldKey];}
    await DB.collection('site_maps').doc(f.map._id).update({lots:lots,_updatedAt:new Date().toISOString()});
  },'Lot saved');
  if(ok){f.map.lots=lots;popSheet();var parent=STACK.find(function(x){return x.type==='lot'&&x.key===oldKey;});if(parent){parent.key=newKey;}changed();}
};
App.removeLot=async function(){
  var c=lotCtx();if(!c)return;
  var ok=await ask('Remove this lot from the map?','Only the marking is removed. Work orders, masters, tasks and flags stay.',[{label:'Cancel',value:false,style:'ghost'},{label:'Remove lot',value:true,style:'danger'}]);if(!ok)return;
  var lots=c.map.lots.slice();lots.splice(c.i,1);
  if(await save(function(){return DB.collection('site_maps').doc(c.map._id).update({lots:lots,_updatedAt:new Date().toISOString()});},'Lot removed')){c.map.lots=lots;popSheet();}
};
App.toggleMasterLot=async function(){
  var c=lotCtx();if(!c)return;var model=c.lot.model||'';if(!model)return;
  var key=smModelMasterKey(model),mm=D.modelMasters[key],isMaster=!!(mm&&mm.masterLotKey===c.e.key);
  if(isMaster){
    var ok=await ask('Stop using this as the master lot?','Other '+h(model)+' lots stop showing its work orders and documents as templates.',[{label:'Cancel',value:false,style:'ghost'},{label:'Stop',value:true}]);if(!ok)return;
    if(await save(function(){return DB.collection('model_masters').doc(key).update({masterLotKey:null,masterMapId:null,_updatedAt:new Date().toISOString(),_updatedBy:meName()});},'Master lot removed for '+model)){mm.masterLotKey=null;mm.masterMapId=null;changed();}
    return;
  }
  var wos=lotWOsFrom(mapWOs(c.map),c.lot),masters=modelMastersFor(model);
  var mk=masters[0]?masterKey(masters[0]):'';var best=wos.find(function(w){return w.status==='invoiced';})||wos[0];var wk=best?(best.masterNum||best._id||''):'';
  if(!mk&&!wk){showToast('Save a master or work order for this lot first.',true);return;}
  var doc={fmodel:model,masterKey:mk||null,woKey:wk||null,masterLotKey:c.e.key,masterMapId:c.map._id,masterLotNum:String(c.lot.num==null?'':c.lot.num),masterBlock:String(c.lot.block||''),masterUnit:String(c.lot.unit||''),masterWOIds:wos.map(function(w){return w._id;}).filter(Boolean),_jobLabel:smJobLabel(c.lot),_updatedAt:new Date().toISOString(),_updatedBy:meName()};
  if(await save(function(){return DB.collection('model_masters').doc(key).set(doc);},'This lot is now the master for '+model)){D.modelMasters[key]=Object.assign({_id:key},doc);changed();}
};
App.unlinkWO=async function(id){
  var ok=await ask('Unlink this work order?','It\'s removed from this lot but not deleted.',[{label:'Cancel',value:false,style:'ghost'},{label:'Unlink',value:true}]);if(!ok)return;
  await save(function(){return DB.collection('saved_workorder').doc(id).update({lot:'',_unlinkedAt:new Date().toISOString()});},'Work order unlinked');
};
App.copyFromMaster=function(w){var c=lotCtx();if(!c)return;push({type:'copyWO',w:w,mapId:c.map._id,key:c.e.key,d:{installer:''}});};
SHEETS.copyWO=function(e){
  return {title:'Copy work order',body:'<div class="sec"><p>Copies the '+h(woTypeLabel(e.w))+' work order from the master lot to this lot, with today\'s date.</p>'
    +'<label class="field">Who did this job?<input list="instList" value="'+h(e.d.installer)+'" oninput="App.setD(\'installer\',this.value)" placeholder="Installer name"></label>'
    +'<datalist id="instList">'+staffNamesForPicker().map(function(n){return '<option value="'+h(n)+'">';}).join('')+'</datalist></div>',
    foot:'<button class="btn ghost" onclick="App.pop()">Cancel</button><button class="btn" onclick="App.doCopyWO()">Copy to this lot</button>'};
};
App.doCopyWO=async function(){
  var e=curSheet(),f=findLot(e.mapId,e.key);if(!f)return;var inst=String(e.d.installer||'').trim();
  var ok=await save(async function(){
    var src=await DB.collection('saved_workorder').doc(e.w._id).get();if(!src.exists)throw new Error('Could not find the template work order.');
    var wd=src.data(),snap=Object.assign({},wd.snapshot||{});
    snap.fl=String(f.lot.num||'');snap.fblock=f.lot.block||'';snap.funit=f.lot.unit||'';if(inst)snap.fi=inst;snap.fdate=todayISO();
    var nw=Object.assign({},wd,{lot:String(f.lot.num||''),block:f.lot.block||'',unit:f.lot.unit||'',installer:inst||wd.installer||'',status:'pending',snapshot:snap,_savedAt:new Date().toISOString(),_copiedFromMaster:e.w._id,builder:wd.builder||f.map.builder||'',site:wd.site||f.map.site||''});
    delete nw._id;
    await DB.collection('saved_workorder').add(nw);
  },'Work order copied to this lot');
  if(ok)popSheet();
};

/* ───────────────────────── upload a site map (admin) ───────────────────────── */
App.uploadMap=function(builder,site){push({type:'uploadMap',d:{builder:builder||'',site:site||'',name:''},img:null});};
SHEETS.uploadMap=function(e){
  var builders=buildersFrom(buildSites()).map(function(b){return b.name;});
  (D.registry.builders||[]).forEach(function(b){if(b&&builders.indexOf(b)<0)builders.push(b);});
  var sitesFor=Object.values(buildSites()).filter(function(s){return lc(s.builder)===lc(e.d.builder);}).map(function(s){return s.site;});
  return {title:'Upload site map',body:'<div class="sec">'
    +'<label class="field">Builder<input list="bList" value="'+h(e.d.builder)+'" oninput="App.setD(\'builder\',this.value)"></label><datalist id="bList">'+builders.sort().map(function(b){return '<option value="'+h(b)+'">';}).join('')+'</datalist>'
    +'<label class="field">Site or community<input list="sList" value="'+h(e.d.site)+'" oninput="App.setD(\'site\',this.value)"></label><datalist id="sList">'+sitesFor.map(function(s){return '<option value="'+h(s)+'">';}).join('')+'</datalist>'
    +fld('Plan label','name','text','e.g. Phase 2')
    +'<label class="field">Site plan (PDF or image)<input type="file" accept=".pdf,image/*" onchange="App.mapFile(this)"></label>'
    +(e.busy?'<p class="s">Preparing the plan…</p>':'')+(e.img?'<img src="'+e.img.imageData+'" alt="Plan preview" style="max-width:100%;border-radius:8px;border:1px solid var(--line)">':'')+'</div>',
    foot:'<button class="btn ghost" onclick="App.pop()">Cancel</button><button class="btn" '+(e.img?'':'disabled')+' onclick="App.saveMap()">Upload and mark lots</button>'};
};
App.mapFile=function(input){
  var e=curSheet(),file=input.files&&input.files[0];if(!file)return;e.busy=true;e.img=null;rerender();
  var done=function(img){e.busy=false;e.img=img;rerender();};
  var fail=function(m){e.busy=false;rerender(m);};
  if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
    if(typeof pdfjsLib==='undefined')return fail('The PDF reader didn\'t load. Reload the page and try again.');
    var r=new FileReader();r.onload=function(ev){
      pdfjsLib.getDocument({data:new Uint8Array(ev.target.result)}).promise.then(function(pdf){return pdf.getPage(1);}).then(function(page){
        var vp=page.getViewport({scale:1.5}),cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;
        return page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise.then(function(){return {imageData:cv.toDataURL('image/jpeg',0.86),imageWidth:vp.width,imageHeight:vp.height};});
      }).then(done).catch(function(err){fail('Could not read that PDF: '+err.message);});
    };r.readAsArrayBuffer(file);
  }else{
    var r2=new FileReader();r2.onload=function(ev){var img=new Image();img.onload=function(){
      var maxW=1800,s=img.width>maxW?maxW/img.width:1,cv=document.createElement('canvas');cv.width=Math.round(img.width*s);cv.height=Math.round(img.height*s);
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);done({imageData:cv.toDataURL('image/jpeg',0.88),imageWidth:cv.width,imageHeight:cv.height});
    };img.onerror=function(){fail('Could not read that image.');};img.src=ev.target.result;};r2.readAsDataURL(file);
  }
};
App.saveMap=async function(){
  var e=curSheet(),d=e.d;
  if(!String(d.name||'').trim())return rerender('Add a plan label, for example "Phase 2".');
  if(!e.img)return rerender('Choose the site plan file.');
  var doc=Object.assign({name:d.name.trim(),builder:String(d.builder||'').trim(),site:String(d.site||'').trim(),lots:[],_createdAt:new Date().toISOString(),_createdBy:meUser()},e.img);
  var ref=null;
  var ok=await save(async function(){ref=await DB.collection('site_maps').add(doc);},'Site map uploaded');
  if(ok&&ref){doc._id=ref.id;D.maps.unshift(doc);popSheet();App.openSite(siteKey(doc.builder||'No builder',doc.site||doc.name),doc.builder||'No builder');SV.mapId=ref.id;SV.tab='map';MAPV.edit=true;renderScreen();}
};

/* ───────────────────────── upload a document (admin) ───────────────────────── */
App.uploadDoc=function(ctx){push({type:'uploadDoc',ctx:ctx,d:{lot:ctx.lot||'',type:'Heating Plan',label:''}});};
SHEETS.uploadDoc=function(e){
  return {title:'Upload document',sub:[e.ctx.builder,e.ctx.site].filter(Boolean).join(' · '),body:'<div class="sec">'
    +fld('Lot number','lot','text','Use "General" for the whole site')
    +'<label class="field">Type<select onchange="App.setD(\'type\',this.value)">'+['Heating Plan','Site Map','Architectural','Extra'].map(function(t){return '<option '+(t===e.d.type?'selected':'')+'>'+t+'</option>';}).join('')+'</select></label>'
    +fld('Label (optional)','label')+'<label class="field">File<input type="file" id="docFile"></label>'+(e.pct!=null?'<div class="prog"><span style="width:'+e.pct+'%"></span></div>':'')+'</div>',
    foot:'<button class="btn ghost" onclick="App.pop()">Cancel</button><button class="btn" onclick="App.saveDoc()">Upload</button>'};
};
App.saveDoc=async function(){
  var e=curSheet(),d=e.d,lot=String(d.lot||'').trim(),file=(document.getElementById('docFile')||{}).files;file=file&&file[0];
  if(!lot)return rerender('Enter a lot number, or "General" for the whole site.');
  if(!file)return rerender('Choose a file to upload.');
  if(READ_ONLY){notifyReadOnly();return;}
  if(!STORAGE)return rerender('File storage isn\'t connected.');
  var sb=e.ctx.builder.replace(/[^a-zA-Z0-9_-]/g,'_'),ss=e.ctx.site.replace(/[^a-zA-Z0-9_-]/g,'_'),sl=lot.replace(/[^a-zA-Z0-9_-]/g,'_'),id='doc_'+Date.now();
  var path='site_docs/'+sb+'/'+ss+'/'+sl+'/'+id+'_'+file.name;
  var ok=await save(async function(){
    var ref=STORAGE.ref(path),task=ref.put(file);
    await new Promise(function(res,rej){task.on('state_changed',function(s){e.pct=Math.round(s.bytesTransferred/s.totalBytes*100);},rej,res);});
    var url=await ref.getDownloadURL();
    await DB.collection('site_docs').doc(id).set({_id:id,builder:e.ctx.builder,site:e.ctx.site,lot:lot,type:d.type,label:d.label||file.name,fileName:file.name,storagePath:path,url:url,uploadedBy:meName()||'admin',uploadedAt:new Date().toISOString(),_deleted:false,_mapId:e.ctx.mapId||''});
    // Also attach to any job for this lot and builder (same rule as the live portal)
    try{
      var ub=lc(e.ctx.builder),js=await DB.collection('jobs').get();
      var entry={id:id,type:d.type,label:d.label||file.name,date:new Date().toISOString(),by:meName()||'',pdfUrl:url,fileName:file.name,fromSiteDocs:true};
      for(var i=0;i<js.docs.length;i++){
        var jd=js.docs[i].data();if(jd._deleted||jd.status==='deleted')continue;
        var jb=lc(jd.clientName);
        if(String(jd.lotNum||'').trim()===lot&&(!ub||!jb||jb===ub||jb.indexOf(ub)>=0||ub.indexOf(jb)>=0))
          await DB.collection('jobs').doc(js.docs[i].id).update({documents:firebase.firestore.FieldValue.arrayUnion(entry)}).catch(function(){});
      }
    }catch(x){}
  },'Document uploaded');
  if(ok){await loadDocs();popSheet();changed();}
};
