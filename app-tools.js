/* Eco Air Portal v2 - the Work Order, Measure and Estimate builders, and the invoice builder.
 * The builders themselves are unchanged copies (tools/*.html). This file opens them and answers
 * their messages exactly the way the current portal does, so what they save is identical. */

var TOOL_HTML = {};
var _toolLoads = {};
function loadTool(key){
  if(TOOL_HTML[key])return Promise.resolve(TOOL_HTML[key]);
  if(!_toolLoads[key])_toolLoads[key]=fetch('tools/'+key+'.html',{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text();}).then(function(t){TOOL_HTML[key]=t;return t;}).catch(function(e){delete _toolLoads[key];throw e;});
  return _toolLoads[key];
}
var SKINNED={workorder:1,measure:1};   // builders shown with the v2 look
var _skin=null;
function loadSkin(){if(_skin!==null)return Promise.resolve(_skin);return fetch('tools/v2-skin.css',{cache:'no-cache'}).then(function(r){return r.ok?r.text():'';}).catch(function(){return '';}).then(function(t){_skin=t;return t;});}
function preloadTools(){loadSkin();['workorder','measure','estimate'].forEach(function(k){loadTool(k).catch(function(){});});}

var _toolDirty=false, toolJobId=null, pendingSaveJobId=null, _pendingFormData=null, _saveInProgress=false;
function toolFrame(){return document.getElementById('toolFrame');}
function postToTool(msg){var f=toolFrame();if(f&&f.contentWindow)f.contentWindow.postMessage(Object.assign({__portalMsg:true},msg),'*');}
// Run fn once the builder inside the frame has loaded (queued until its load event).
function whenToolReady(fn){
  var e=STACK.find(function(x){return x.type==='tool';});if(!e)return;
  if(e.ready)setTimeout(fn,60);else (e.queue=e.queue||[]).push(fn);
}

/* Read-only database view for the builders' AI Plan Reader (reads only; it has no write methods). */
function eaReadOnlyDB(){
  function q(ref){return {
    orderBy:function(){return q(ref.orderBy.apply(ref,arguments));},
    limit:function(){return q(ref.limit.apply(ref,arguments));},
    where:function(){return q(ref.where.apply(ref,arguments));},
    get:function(){return ref.get();},
    doc:function(id){var d=ref.doc(id);return {get:function(){return d.get();}};}
  };}
  return {collection:function(n){return q(DB.collection(n));}};
}
window.eaReadOnlyDB=eaReadOnlyDB;

/* ───────────────────────── open a builder ───────────────────────── */
async function openToolCore(key,title,docType,client,jobId){
  var html;
  try{html=await loadTool(key);}catch(e){showToast('Could not load the '+title+'. Check the connection and try again.',true);return;}
  if(SKINNED[key]){var skin=await loadSkin();if(skin)html=html.replace('</head>','<style id="v2-skin">'+skin+'</style></head>');}
  if(key==='measure'||key==='workorder'){
    // AI Plan Reader: while it runs, lend it a read-only view of the saved Masters / Work Orders
    // so it can learn from them. The handle is removed again as soon as the read finishes,
    // so the builder's normal saving still goes through the portal.
    var lend='<scr'+'ipt>(function(){var run=window.drawRun;if(!run)return;window.drawRun=async function(){'+
      'var P=window.parent,ro=null;try{ro=P.eaReadOnlyDB&&P.eaReadOnlyDB();}catch(e){}'+
      'var hadT=typeof _toolDB!=="undefined",a=window._ecoDB,b=hadT?_toolDB:undefined;'+
      'if(ro){if(!a)window._ecoDB=ro;if(hadT&&!b)_toolDB=ro;}'+
      'try{return await run.apply(this,arguments);}finally{if(window._ecoDB===ro)window._ecoDB=a;if(hadT&&_toolDB===ro)_toolDB=b;}};})();</scr'+'ipt>';
    var at=html.lastIndexOf('</body>');html=at>=0?html.slice(0,at)+lend+html.slice(at):html+lend;
  }
  if((key==='measure'||key==='workorder')&&CURRENT_USER){
    // AI tools: tell the AI proxy who is asking, so only staff can use it.
    var who=JSON.stringify({u:meUser(),k:CURRENT_USER.passwordHash||''}).replace(/</g,'\\u003c');
    html=html.replace('<head>','<head><scr'+'ipt>(function(){var W='+who+',F=window.fetch;window.fetch=function(u,o){try{if(String(u).indexOf("claude-proxy")>=0){o=Object.assign({},o||{});o.headers=Object.assign({},o.headers||{},{"x-ea-user":W.u,"x-ea-key":W.k});}}catch(e){}return F.call(this,u,o);};})();</scr'+'ipt>');
  }
  var lines=[];
  if(client){
    var c=client;
    var mp={fnm:c.name,fname:c.name,fph:c.phone,fphone:c.phone,fem:c.email,femail:c.email,fad:c.address,faddr:c.address,fcy:c.city,fcity:c.city,fpv:c.province,fprov:c.province,fpost:c.postal};
    lines.push('if(typeof setClientData==="function")setClientData('+JSON.stringify(mp)+');');
    Object.keys(mp).forEach(function(k){if(mp[k])lines.push('var _f=document.getElementById("'+k+'");if(_f)_f.value='+JSON.stringify(mp[k])+';');});
  }
  if(docType==='invoice')lines.push('if(typeof setDocType==="function")setDocType("invoice");');
  var job=jobId?D.jobs.find(function(x){return x.id===jobId;}):null;
  if(job&&(job.masterNum||job.blockNum||job.unitNum||job.lotNum)){
    lines.push('if(typeof setJobRef==="function")setJobRef('+JSON.stringify(job.masterNum||'')+','+JSON.stringify(job.unitNum||'')+','+JSON.stringify(job.lotNum||'')+','+JSON.stringify(job.blockNum||'')+');');
  }
  if(lines.length){var t1='<scr'+'ipt>',t2='<'+'/scr'+'ipt>';html=html.replace('<'+'/body>',t1+'window.addEventListener("DOMContentLoaded",function(){'+lines.join('')+'});'+t2+'<'+'/body>');}
  // close any tool already open
  var openIdx=STACK.findIndex(function(e){return e.type==='tool';});
  if(openIdx>=0)popSheet(STACK.length-openIdx);
  _toolDirty=false;toolJobId=jobId||null;pendingSaveJobId=jobId||null;
  push({type:'tool',static:true,key:key,title:title,jobId:jobId||null,html:html,beforeClose:toolBeforeClose,onClose:function(){toolJobId=null;pendingSaveJobId=null;_toolDirty=false;}});
}
SHEETS.tool=function(e){
  return {wide:true,raw:'<header class="sh-head"><button class="x" aria-label="Close" onclick="App.pop()">×</button><h2>'+h(e.title)+(READ_ONLY?'<span class="sub">Preview · saving is off</span>':'')+'</h2><span></span></header>'
    +(e.jobId?'<div class="sh-foot" style="border-top:0;border-bottom:1px solid var(--line);padding:8px 16px;align-items:center"><span id="saveStatus" class="s" style="flex:1"></span><button class="btn" id="saveToPortalBtn" style="flex:none;padding:9px 16px;font-size:15px" onclick="triggerPortalSave()">Save to job</button></div>':'')
    +'<iframe id="toolFrame" class="toolframe" title="'+h(e.title)+'"></iframe>',
    after:function(el){
      var f=el.querySelector('#toolFrame');if(!f||f.srcdoc)return;
      f.addEventListener('load',function(){
        var url='';try{url=f.contentDocument&&f.contentDocument.URL;}catch(x){}
        if(url!=='about:srcdoc')return;
        e.ready=true;var q=(e.queue||[]).splice(0);setTimeout(function(){q.forEach(function(fn){try{fn();}catch(x){console.warn(x);}});},250);
      });
      f.srcdoc=e.html;
    }};
};
function toolBeforeClose(){
  if(!_toolDirty)return Promise.resolve(true);
  return ask('Leave without saving?','You have changes in the work order that aren\'t saved yet.',[{label:'Keep editing',value:false,style:'ghost'},{label:'Leave',value:true,style:'danger'}])
    .then(function(v){if(v)_toolDirty=false;return !!v;});
}
function closeTool(){App.pop();}

/* entry points used across the app */
function openNewWO(ctx){
  openToolCore('workorder','Work order').then(function(){
    if(ctx&&(ctx.builder||ctx.site))whenToolReady(function(){postToTool({type:'RESTORE_FORM',data:{fb:ctx.builder||'',fp:ctx.site||''}});});
  });
}
function openNewWOForLot(map,lot){
  openToolCore('workorder','Work order · '+smJobLabel(lot)).then(function(){
    whenToolReady(function(){postToTool({type:'RESTORE_FORM',data:{fb:map.builder||'',fp:map.site||'',fl:lot.num||'',fblock:lot.block||'',funit:lot.unit||'',fm:lot.model||''}});});
  });
}
function openWOInTool(w){
  var snap=w.snapshot||{},masterNum=w.masterNum||snap.fmaster||'';
  openToolCore('workorder','Work order'+(woLotLabel(w)?' · '+woLotLabel(w):'')).then(function(){
    whenToolReady(function(){postToTool({type:'LOAD_WO',snapshot:snap,masterNum:masterNum,woId:w._id||w._key||w.id||''});},true);
  });
}
function openMasterInWO(masterNum){
  if(!masterNum){showToast('This work order has no number to open.',true);return;}
  openToolCore('workorder','Work order').then(function(){whenToolReady(function(){postToTool({type:'LOAD_MASTER',masterNum:masterNum});});});
}
function editMasterTemplate(master){
  openToolCore('measure','Measure sheet · '+(master.label||masterKey(master))).then(function(){
    whenToolReady(function(){postToTool({type:'LOAD_MASTER',data:master});});
  });
}
function openMasterForLot(master,map,lot){
  var patch={flot:String(lot.num||''),fblock:lot.block||'',funit:lot.unit||'',fbuilder:map.builder||'',fsite:map.site||''};
  openToolCore('measure','Measure sheet · '+smJobLabel(lot)).then(function(){
    whenToolReady(function(){postToTool({type:'LOAD_MASTER',data:master});setTimeout(function(){postToTool({type:'RESTORE_FORM',data:patch});},400);});
  });
}
App.toolForJob=function(key,title,docType){
  var e=curSheet();if(!e||e.type!=='job'||!e.id)return;
  var job=D.jobs.find(function(x){return x.id===e.id;});
  var client=job&&job.clientId?D.clients.find(function(c){return c.id===job.clientId;}):null;
  openToolCore(key,title,docType||null,client,e.id);
};
App.reopenDoc=function(docId){
  var e=curSheet();if(!e||e.type!=='job')return;
  var job=D.jobs.find(function(x){return x.id===e.id;});if(!job)return;
  var doc=(job.documents||[]).find(function(d){return d.id===docId;});
  if(!doc||!doc.formData){showToast('No saved form data for this document.',true);return;}
  var type=String(doc.type||''),key='estimate',docType=null;
  if(/measure/i.test(type))key='measure';else if(/work/i.test(type))key='workorder';else if(/invoice/i.test(type))docType='invoice';
  var client=job.clientId?D.clients.find(function(c){return c.id===job.clientId;}):null;
  openToolCore(key,type||'Document',docType,client,job.id).then(function(){whenToolReady(function(){postToTool({type:'RESTORE_FORM',data:doc.formData});});});
};

/* ───────────────────────── Save to job (job-linked tools) ───────────────────────── */
function setSaveStatus(msg){var el=document.getElementById('saveStatus');if(el)el.textContent=msg;}
function triggerPortalSave(){
  if(!pendingSaveJobId){showToast('Open this tool from a job to save it there.',true);return;}
  if(READ_ONLY){notifyReadOnly();return;}
  if(_saveInProgress)return;
  setSaveStatus('Collecting the form…');
  postToTool({type:'GET_FORM_DATA'});
}
async function uploadAndSaveDoc(formData,pdfB64,filename){
  _saveInProgress=true;setSaveStatus('Saving…');
  try{
    var docId='doc_'+Date.now(),jobId=pendingSaveJobId;
    var cur=STACK.find(function(x){return x.type==='tool';});
    var type=formData.__docType||(cur&&cur.title)||'Document';
    if(type==='invoice'||type==='estimate')type=type.charAt(0).toUpperCase()+type.slice(1);
    if(pdfB64)downloadDataUrl(pdfB64,filename||type+'.pdf');
    var entry={id:docId,type:type,date:new Date().toISOString(),by:meName(),formData:formData,filename:filename||type+'.pdf'};
    await DB.collection('jobs').doc(jobId).update({documents:firebase.firestore.FieldValue.arrayUnion(entry)});
    if(/measure/i.test(type)){var mf=formData.fields||{},mk=mf.fmaster||formData.fmaster||'';if(mk)saveMeasureToFirestore(mk,mf,formData);}
    setSaveStatus('Saved to job');
    syncLists((formData.fb||formData.fbuilder||(formData.fields&&formData.fields.fname)||'').trim(),(formData.fp||formData.fsite||(formData.fields&&formData.fields.faddr)||'').trim());
    setTimeout(function(){setSaveStatus('');},3000);
  }catch(e){setSaveStatus(e&&e.code==='read-only'?'Not saved (preview)':'Could not save: '+e.message);throw e;}
  finally{_saveInProgress=false;}
}
function downloadDataUrl(b64,name){
  try{
    var data=b64.split(',')[1]||b64,chars=atob(data),arr=new Uint8Array(chars.length);
    for(var i=0;i<chars.length;i++)arr[i]=chars.charCodeAt(i);
    var url=URL.createObjectURL(new Blob([arr],{type:'application/pdf'})),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){a.remove();URL.revokeObjectURL(url);},1000);
  }catch(e){console.warn('PDF download:',e.message);}
}
// Keep meta/lists in step with new builder and site names (as the current portal does).
function syncLists(b,s){
  if(!b&&!s)return;
  DB.collection('meta').doc('lists').get().then(function(ld){
    var d=ld.exists?ld.data():{builders:[],sites:[]},lb=(d.builders||[]).slice(),ls=(d.sites||[]).slice(),chg=false;
    if(b&&lb.indexOf(b)<0){lb.push(b);lb.sort();chg=true;}if(s&&ls.indexOf(s)<0){ls.push(s);ls.sort();chg=true;}
    if(chg)return DB.collection('meta').doc('lists').set({builders:lb,sites:ls},{merge:true});
  }).catch(function(){});
}
function saveMeasureToFirestore(mk,flds,fd){
  var safe=mk.replace(/[.\/\s]/g,'_');
  var doc=_buildMeasureDoc(mk,flds,fd);doc._docType='measure';doc._savedBy=meName()||'staff';
  if(flds.fmtype){doc.masterType=flds.fmtype;doc.masterTypeLabel=MASTER_TYPES[flds.fmtype]||(flds.fmtypec||'').trim()||'Custom';}
  DB.collection('saved_masters').doc(safe).set(doc,{merge:true}).then(function(){showToast('Measure sheet saved. Everyone can see it.');}).catch(function(err){if(err&&err.code!=='read-only')showToast('Could not save the measure sheet: '+err.message,true);});
  DB.collection('saved_measure').doc(safe).set(doc,{merge:true}).catch(function(){});
}
function modelDuplicateChoice(modelNum,lotNum){
  return ask('This model already has a work order','A work order for model <b>'+h(modelNum)+'</b> already exists. How should this one be saved'+(lotNum?' for lot '+h(lotNum):'')+'?',
    [{label:'Cancel',value:null,style:'ghost'},{label:'Save as lot-specific',value:'lot',style:'ghost'},{label:'Replace the existing one',value:'overwrite'}]);
}

/* Lot tasks completed automatically when a work order is saved (same as the current portal). */
var WO_TYPE_TO_TASK={rough:'rough_in','rough-hiv':'rough_in',bsmt:'basement','bsmt-hiv':'basement',tie_in:'tie_ins',hrv:'hrv',mount:'completion'};
async function autoAssignFromWO(w){
  if(!DB||!w)return;
  var snap=w.snapshot||{},lotNum=String(w.lot||snap.fl||'').trim(),inst=(w.installer||snap.fi||'').trim();
  var t=w.type||snap.type||snap.ftype||'';if(snap.tier==='hiv'&&t&&t.indexOf('hiv')<0)t=t+'-hiv';
  var taskId=WO_TYPE_TO_TASK[t];if(!lotNum||!inst||!taskId)return;
  var wb=lc(w.builder||snap.fb||snap.fbuilder),ws=lc(w.site||snap.fp||snap.fsite);
  try{
    var maps=await DB.collection('site_maps').get();
    for(var i=0;i<maps.docs.length;i++){
      var md=maps.docs[i],m=md.data();if(m._deleted)continue;
      var mb=lc(m.builder),ms=lc(m.site);if(wb&&ws&&mb&&ms&&(wb!==mb||ws!==ms))continue;
      var lots=m.lots||[];
      for(var j=0;j<lots.length;j++){
        if(String(lots[j].num||'').trim()!==lotNum)continue;
        var key=smLotKey(md.id,lots[j]),ls=await DB.collection('lot_data').doc(key).get();
        var ld=ls.exists?ls.data():{_mapId:md.id,_jobKey:key,tasks:defaultTasks()};if(!ld.tasks)ld.tasks=defaultTasks();
        var task=ld.tasks.find(function(x){return x.id===taskId;});
        if(task&&task.status!=='complete'){
          task.assignedTo=inst;task.status='complete';task.completedAt=new Date().toISOString();ld._updatedAt=new Date().toISOString();
          await DB.collection('lot_data').doc(key).set(ld);D.lotData[key]=ld;
          await DB.collection('assignments').doc(key+'__'+taskId).delete().catch(function(){});
        }
      }
    }
    changed();
  }catch(e){if(!e||e.code!=='read-only')console.warn('auto-assign:',e&&e.message);}
}

/* ───────────────────────── messages from the builders ───────────────────────── */
function portalMessage(e){
  var m=e.data;if(!m||!m.__portalMsg)return;

  if(m.type==='REQUEST_DATA'){
    // fbconfig stays null, as on the current portal: the builders never write to Firestore themselves.
    var payload={type:'PORTAL_DATA',
      clients:D.clients.map(function(c){return {id:c.id,name:c.name,phone:c.phone,email:c.email,address:c.address,city:c.city,province:c.province,postal:c.postal,company:c.company};}),
      jobs:D.jobs.map(function(j){return {id:j.id,title:j.title,clientId:j.clientId,clientName:j.clientName,stage:j.stage,estimateValue:j.estimateValue};}),
      builders:[],sites:[],fbconfig:null,prices:S.prices||null};
    postToTool(payload);
    var bs=new Set(),ss=new Set();
    (D.lists.builders||[]).forEach(function(b){if(b)bs.add(b);});(D.lists.sites||[]).forEach(function(s){if(s)ss.add(s);});
    D.masters.concat(D.wos).forEach(function(d){if(d._deleted)return;if(d.builder)bs.add(d.builder);if(d.site)ss.add(d.site);});
    var bArr=Array.from(bs).sort(),sArr=Array.from(ss).sort();
    if(bArr.length||sArr.length){
      if(!READ_ONLY&&(bArr.length!==(D.lists.builders||[]).length||sArr.length!==(D.lists.sites||[]).length))DB.collection('meta').doc('lists').set({builders:bArr,sites:sArr},{merge:true}).catch(function(){});
      postToTool(Object.assign({},payload,{builders:bArr,sites:sArr,brand:BRAND}));
    }
    return;
  }
  if(m.type==='TOOL_DIRTY'){_toolDirty=true;return;}
  if(m.type==='FORM_DATA'){_pendingFormData=m.data;postToTool({type:'CAPTURE_PDF'});return;}
  if(m.type==='INVOICE_SAVED'&&m.record){autoRegisterStaff(m.record);addInvoiceToCalendars(m.record);return;}
  if(m.type==='MASTER_SAVED'){return;}

  if(m.type==='SAVE_MASTER'&&m.data){
    if(READ_ONLY){notifyReadOnly();return;}
    var md=m.data,mk=md.fmodel||md.fmaster||('M-'+Date.now().toString().slice(-6)),dk=mk.replace(/[\/\.]/g,'_');
    var fields=md.__fields||md,items=md.__items||[];
    var mdoc=JSON.parse(JSON.stringify({_savedAt:new Date().toISOString(),_key:mk,num:mk,label:mk,builder:md.fbuilder||fields.fbuilder||'',site:md.fsite||fields.fsite||'',fmodel:md.fmodel||fields.fmodel||'',lot:md.flot||fields.flot||'',block:md.fblock||fields.fblock||'',unit:md.funit||fields.funit||'',fields:fields,items:items}));
    mdoc._owner=meUser();
    var doSave=function(docKey,key){
      mdoc._key=key;mdoc.num=key;mdoc.label=key;
      DB.collection('saved_masters').doc(docKey).get().then(function(ex){mdoc._shared=isAdm()||(ex.exists&&ex.data()._shared===true);return DB.collection('saved_masters').doc(docKey).set(mdoc);})
        .then(function(){_logActivity('master_saved',key);showToast('Master saved: '+key);syncLists(mdoc.builder,mdoc.site);})
        .catch(function(err){if(!err||err.code!=='read-only')showToast('Could not save the master: '+err.message,true);});
    };
    DB.collection('saved_masters').doc(dk).get().then(function(ex){
      if(ex.exists&&!ex.data()._deleted)modelDuplicateChoice(mk,'').then(function(c){if(c==='overwrite')doSave(dk,mk);else if(c==='lot'){var ak=mk+'_'+Date.now();doSave(ak.replace(/[\/\.]/g,'_'),ak);}});
      else doSave(dk,mk);
    }).catch(function(){doSave(dk,mk);});
    return;
  }

  if(m.type==='LOT_ADDED'&&m.lot){
    if(READ_ONLY){notifyReadOnly();return;}
    if(!m.key)return;
    var docId=String(m.key).replace(/[/.]/g,'_');
    var wo=Object.assign({},m.lot,{_savedAt:new Date().toISOString()});wo._owner=meUser();
    if(m.isEdit&&m.isDirectEdit){
      wo._pendingEdit=false;wo._pendingEditOf=null;
      DB.collection('saved_workorder').doc(docId).get().then(function(ex){
        var ol=ex.exists?(ex.data().lot||''):'',nl=wo.lot||'',changedLot=ex.exists&&ol&&nl&&ol!==nl;
        var wid=changedLot?(docId+'_'+String(nl).replace(/[/.]/g,'_')+'_'+Date.now()):docId;
        if(changedLot){wo.status='pending';wo._shared=ex.exists?!!ex.data()._shared:false;}
        return DB.collection('saved_workorder').doc(wid).set(wo).then(function(){
          _toolDirty=false;autoAssignFromWO(wo);showToast('Work order saved');
          if(changedLot)DB.collection('pending_lots').doc(wid).set(wo).catch(function(){});
          else DB.collection('pending_lots').doc(docId).get().then(function(pl){if(pl.exists&&pl.data().status!=='invoiced')DB.collection('pending_lots').doc(docId).set(wo).catch(function(){});}).catch(function(){});
        });
      }).catch(function(err){if(!err||err.code!=='read-only')showToast('Could not save: '+err.message,true);});
    }else if(m.isEdit){
      wo._pendingEdit=true;wo._shared=false;
      DB.collection('saved_workorder').doc(docId).set(wo).then(function(){_toolDirty=false;showToast('Edit sent to an admin for approval');loadReviews().then(changed);})
        .catch(function(err){if(!err||err.code!=='read-only')showToast('Could not save: '+err.message,true);});
    }else{
      var modelKey=m.modelKey||'',modelNum=m.modelNum||'',woLotNum=String(wo.lot||'').trim();
      var saveNew=function(fid){
        var bn=String(wo.builder||'').trim();
        if(bn)DB.collection('clients').where('name','==',bn).get().then(function(s){if(s.empty)DB.collection('clients').add({name:bn,createdAt:new Date().toISOString(),createdBy:'WO',type:'builder'}).catch(function(){});}).catch(function(){});
        wo.status='pending';
        DB.collection('saved_workorder').doc(fid).get().then(function(ex){wo._shared=isAdm()||(ex.exists&&ex.data()._shared===true);return DB.collection('saved_workorder').doc(fid).set(wo);})
          .then(function(){_toolDirty=false;autoAssignFromWO(wo);showToast('Work order saved');return DB.collection('pending_lots').doc(fid).set(wo);})
          .then(function(){syncLists(String(wo.builder||'').trim(),String(wo.site||wo.project||'').trim());})
          .catch(function(err){if(!err||err.code!=='read-only')showToast('Could not save: '+err.message,true);});
      };
      if(modelKey){
        DB.collection('saved_workorder').doc(modelKey).get().then(function(ex){
          if(ex.exists&&!ex.data()._deleted)modelDuplicateChoice(modelNum,woLotNum).then(function(c){if(c==='overwrite')saveNew(modelKey);else if(c==='lot')saveNew(modelKey+(woLotNum?'_Lot_'+woLotNum.replace(/[^a-zA-Z0-9]/g,'_'):'_'+Date.now()));});
          else saveNew(modelKey);
        }).catch(function(){saveNew(docId);});
      }else saveNew(docId);
    }
    return;
  }

  if(m.type==='INVOICE_COMPLETED'&&m.masterNums){
    if(READ_ONLY){notifyReadOnly();return;}
    Array.from(_selectedWOs).forEach(function(id){
      DB.collection('saved_workorder').doc(id).update({status:'invoiced'}).catch(function(){});
      DB.collection('pending_lots').doc(id).update({status:'invoiced'}).catch(function(){});
    });
    _selectedWOs.clear();return;
  }
  if(m.type==='TOTAL_UPDATED'&&m.woId&&m.total!=null){
    var wid2=String(m.woId).replace(/[/.]/g,'_'),tot=parseFloat(m.total)||0;
    if(!READ_ONLY){DB.collection('saved_workorder').doc(wid2).update({total:tot}).catch(function(){});DB.collection('pending_lots').doc(wid2).update({total:tot}).catch(function(){});}
    return;
  }
  if(m.type==='PDF_READY'){
    if(typeof window.__woCaptureResolve==='function'){var res=window.__woCaptureResolve;window.__woCaptureResolve=null;res(m.b64);return;}
    var jobId=m.jobId||pendingSaveJobId,fd=m.formData||_pendingFormData;
    if(fd&&jobId){
      var keep=pendingSaveJobId;pendingSaveJobId=jobId;
      uploadAndSaveDoc(fd,m.b64,m.filename).then(function(){postToTool({type:'SAVE_COMPLETE'});}).catch(function(err){postToTool({type:'SAVE_ERROR',msg:err.message});});
      pendingSaveJobId=keep;
    }else if(m.b64){
      var a=document.createElement('a');a.href=m.b64;a.download=m.filename||'workorder.pdf';document.body.appendChild(a);a.click();a.remove();
    }
    _pendingFormData=null;return;
  }
  if(m.type==='SAVE_MEASURE_DATA'){
    var mfd=m.formData||{},mfl=mfd.fields||{},mkey=m.masterKey||mfl.fmaster||'';
    if(!mkey)return;
    if(READ_ONLY){notifyReadOnly();return;}
    saveMeasureToFirestore(mkey,mfl,mfd);
    if(pendingSaveJobId){
      DB.collection('jobs').doc(pendingSaveJobId).update({documents:firebase.firestore.FieldValue.arrayUnion({id:'msave_'+Date.now(),type:'Measure Sheet',date:new Date().toISOString(),by:meName(),formData:mfd,filename:mkey+' — Measure Sheet.pdf'})}).catch(function(){});
    }
  }
}

/* ───────────────────────── invoice builder host ───────────────────────── */
App.openInvoice=function(editRecord){
  var existing=STACK.findIndex(function(e){return e.type==='invoice';});
  if(existing>=0)popSheet(STACK.length-existing);
  loadTool('workorder').catch(function(){});
  push({type:'invoice',static:true,wide:true});
  setTimeout(function(){
    if(editRecord)openInvoiceForEdit(editRecord);
    else{invSetLayout();loadInvoiceBuilderWOs(true);}
  },30);
};
App.editInvoice=function(inv){App.openInvoice(inv);};
SHEETS.invoice=function(){
  var tpl=document.getElementById('invoiceTpl').innerHTML;
  return {wide:true,raw:'<header class="sh-head"><button class="x" aria-label="Close" onclick="App.pop()">×</button><h2>Invoice'+(READ_ONLY?'<span class="sub">Preview · PDFs download, nothing is saved</span>':'')+'</h2><span></span></header>'
    +'<div class="sh-body plain" style="padding:16px">'+tpl+'</div>'
    +'<div class="sh-foot"><button class="btn ghost" id="invRefreshBtn" onclick="loadInvoiceBuilderWOs()">Refresh</button><button class="btn" id="genInvBtn" onclick="buildInvoicePDF()">Create invoice PDF</button></div>'};
};
window.addEventListener('resize',function(){if(document.getElementById('invBuilderGrid'))invSetLayout();});

/* names the carried-over invoice engine calls */
function showPane(name){if(name==='invoice'&&!document.getElementById('pane-invoice'))App.openInvoice();}
function renderPendingWOs(){changed();}
