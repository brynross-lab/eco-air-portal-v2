/* Eco Air Portal v2 - invoice engine.
   Ported unchanged from the original portal (index.html, "INVOICE BUILDER" block) so invoice
   numbers, totals, HST, apprentice/partner payouts and the PDF layout match exactly.
   Changes: the hidden work-order capture reads the Work Order tool from TOOL_HTML; on phones,
   picking a work order no longer jumps to the next tab, and that tab shows how many are picked. */
// ─── INVOICE BUILDER ───
var _invSelectedWOs = new Set();
var _invMobile=false,_invActiveTab=0;
var _invSplitMode=false;
var _splitGroups=[];
function invSetLayout(){
  var grid=document.getElementById('invBuilderGrid');
  var tabBar=document.getElementById('invTabBar');
  if(!grid)return;
  _invMobile=window.innerWidth<700;
  if(_invMobile){
    grid.classList.remove('inv-desktop');
    if(tabBar)tabBar.style.display='flex';
    // Restore tab state
    invTab(_invActiveTab);
  } else {
    grid.classList.add('inv-desktop');
    if(tabBar)tabBar.style.display='none';
    // On desktop show all cols (CSS class handles it)
    [0,1,2].forEach(function(i){
      var c=document.getElementById('invCol'+i);
      if(c)c.style.display='';
      var t=document.getElementById('invTab'+i);
      if(t){t.style.borderBottomColor='transparent';t.style.fontWeight='600';t.style.color='var(--tx2)';}
    });
  }
}
function invTab(n){
  _invActiveTab=n;
  [0,1,2].forEach(function(i){
    var col=document.getElementById('invCol'+i);
    var tab=document.getElementById('invTab'+i);
    var active=(i===n);
    if(col)col.style.display=active?(i===1?'flex':'block'):'none';
    if(tab){
      tab.style.borderBottomColor=active?'var(--G)':'transparent';
      tab.style.fontWeight=active?'700':'600';
      tab.style.color=active?'var(--GD)':'var(--tx2)';
    }
  });
}
window.addEventListener('resize',function(){if(document.getElementById('pane-invoice')&&document.getElementById('pane-invoice').classList.contains('active'))invSetLayout();});
var _invApprents = [], _invApId = 1, _knownCrewNames = [];
var _invEditMode = false, _invEditRecord = null, _invEditLots = [];
var _invTotalOverrides = {}; // key → manual override total
var _invCustomLines = []; // [{id, desc, total}] extra line items
var _invCustomLineId = 0;
function _invGetTotal(w) {
  var key = w._id||w._key||w.num||w.id||'';
  return _invTotalOverrides.hasOwnProperty(key) ? _invTotalOverrides[key] : (w.total||0);
}
function _invSetTotalOverride(key, val) {
  var n = parseFloat(val);
  if (!isNaN(n) && n >= 0) _invTotalOverrides[key] = n;
  else delete _invTotalOverrides[key];
  renderInvAddedWOs(); renderInvPreview();
}
function invAddCustomLine() {
  _invCustomLines.push({id: 'cl_'+(++_invCustomLineId), desc: '', total: 0});
  renderInvCustomLines(); renderInvPreview();
}
function renderInvCustomLines() {
  var el = document.getElementById('invCustomLines');
  if (!el) return;
  if (!_invCustomLines.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--tx3);text-align:center;padding:6px">No extra lines added.</div>';
    return;
  }
  el.innerHTML = '';
  _invCustomLines.forEach(function(line) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px;background:#fefce8;border:1px solid #ca8a04;border-radius:6px';
    var descInp = document.createElement('input');
    descInp.type = 'text'; descInp.placeholder = 'Description…';
    descInp.value = line.desc;
    descInp.style.cssText = 'flex:1;font-size:11px;border:none;background:transparent;outline:none;color:var(--GD);font-weight:600';
    descInp.addEventListener('input', (function(l){return function(){l.desc=this.value;renderInvPreview();};})(line));
    var amtInp = document.createElement('input');
    amtInp.type = 'number'; amtInp.min = '0'; amtInp.step = '0.01';
    amtInp.value = line.total.toFixed(2);
    amtInp.style.cssText = 'width:75px;font-size:11px;font-weight:700;color:#854d0e;border:none;background:transparent;text-align:right;outline:none;padding:0';
    amtInp.addEventListener('change', (function(l){return function(){var v=parseFloat(this.value);l.total=isNaN(v)||v<0?0:v;this.value=l.total.toFixed(2);renderInvAddedWOs();renderInvPreview();};})(line));
    var rmBtn = document.createElement('button'); rmBtn.className='btn br bsm'; rmBtn.style.fontSize='9px'; rmBtn.textContent='×';
    rmBtn.onclick = (function(l){return function(){_invCustomLines=_invCustomLines.filter(function(x){return x.id!==l.id;});renderInvCustomLines();renderInvAddedWOs();renderInvPreview();};})(line);
    row.appendChild(descInp); row.appendChild(amtInp); row.appendChild(rmBtn);
    el.appendChild(row);
  });
}

function openInvoiceForEdit(inv) {
  _invEditMode = true; _invEditRecord = inv;
  _invEditLots = (inv.lots || []).map(function(l, i) {
    return { _id: 'edit_lot_' + i, builder: l.builder || '', site: l.site || l.project || '',
      lot: l.lot || '', layout: l.layout || '', model: l.model || '',
      installer: l.installer || '', masterNum: l.masterNum || '',
      type: l.type || '', total: l.total || 0, snapshot: {} };
  });
  _invSelectedWOs = new Set(_invEditLots.map(function(l) { return l._id; }));
  _invCustomLines = (inv.customLines || []).map(function(l) { return { id: 'cl_'+(++_invCustomLineId), desc: l.desc||'', total: l.total||0 }; });
  _invTotalOverrides = {};
  showPane('invoice');
  var fromEl = document.getElementById('invFromName');
  var billEl = document.getElementById('invBillTo');
  if (fromEl) fromEl.value = inv.installer || '';
  if (billEl) billEl.value = inv.billTo || '';
  _invApprents = (inv.apprentices || []).map(function(a) {
    return { id: 'ia' + (_invApId++), name: a.name || '', role: a.role||'apprentice', type: a.type||'hourly', rate: a.rate || '', hrs: a.hrs || '', pct: a.pct||'' };
  });
  renderInvApprents();
  var banner = document.getElementById('invEditBanner');
  if (banner) banner.style.display = 'flex';
  setTimeout(invSetLayout,50);loadInvoiceBuilderWOs();
}

function exitInvEditMode() {
  _invEditMode = false; _invEditRecord = null; _invEditLots = [];
  _invSelectedWOs.clear(); _invTotalOverrides = {}; _invCustomLines = [];
  var banner = document.getElementById('invEditBanner');
  if (banner) banner.style.display = 'none';
  var fromEl = document.getElementById('invFromName');
  var billEl = document.getElementById('invBillTo');
  if (fromEl) fromEl.value = '';
  if (billEl) billEl.value = '';
  _invApprents = []; renderInvApprents();
  setTimeout(invSetLayout,50);loadInvoiceBuilderWOs();
}

async function loadInvoiceBuilderWOs(preSelect) {
  var el = document.getElementById('invWOList');
  if (!el) return;
  if (!_invEditMode) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--tx3);font-size:12px">Loading&hellip;</div>';
    var waited = 0;
    while (!DB && waited < 6000) { await new Promise(function(r){setTimeout(r,200);}); waited+=200; }
    if (!DB) { el.innerHTML = '<div style="padding:16px;color:#dc2626;font-size:12px">Not connected. Tap Refresh.</div>'; return; }
    try {
      var woSnap = await DB.collection('saved_workorder').get();
      var _isAdminInv=CURRENT_USER&&CURRENT_USER.role==='admin';
      var _myUserInv=CURRENT_USER?CURRENT_USER.username:'';
      var _myNameInv=CURRENT_USER?CURRENT_USER.name||CURRENT_USER.username:'';
      _pendingWOs = woSnap.docs.map(function(d){ return Object.assign({_id:d.id}, d.data()); }).filter(function(w){
        if(w._deleted)return false;
        if(w._pendingEdit)return false;
        if(w.status==='invoiced'||w.status==='deleted')return false;
        if(_isAdminInv)return true;
        var by=w._savedBy||w.installer||(w.snapshot&&w.snapshot.fi)||'';
        return by===_myNameInv||by===_myUserInv;
      });
      _pendingWOs.sort(function(a,b){ return (a.date||a._savedAt||'').localeCompare(b.date||b._savedAt||''); });
      console.log('[invoice] loaded',_pendingWOs.length,'pending WOs from Firestore');
      // Load known crew names from meta/staff_names (apprentices and partners)
      try{
        var staffNamesDoc=await DB.collection('meta').doc('staff_names').get();
        var staffEntries=staffNamesDoc.exists?(staffNamesDoc.data().names||[]):[];
        _knownCrewNames=staffEntries
          .filter(function(s){return !s._deleted&&s.name&&(s.role==='apprentice'||s.role==='partner');})
          .map(function(s){return s.name;})
          .sort();
        var dl=document.getElementById('crewNamesList');
        if(dl){dl.innerHTML=_knownCrewNames.map(function(n){return'<option value="'+n.replace(/"/g,'&quot;')+'">';}).join('');}
      }catch(e2){console.warn('[invoice] crew names load:',e2.message);}
    } catch(e) {
      console.error('[invoice] pending_lots query failed:',e.message);
      el.innerHTML = '<div style="padding:16px;color:#dc2626;font-size:12px">Error: ' + esc(e.message) + '<br><button class="btn bw bsm" onclick="loadInvoiceBuilderWOs()">Retry</button></div>';
      return;
    }
  }
  renderInvWOList();
  renderInvAddedWOs();
  renderInvCustomLines();
  renderInvPreview();
}

// ─── SPLIT INVOICE ───
function toggleInvSplit(){
  _invSplitMode=!_invSplitMode;
  var form=document.getElementById('invSplitForm');
  var btn=document.getElementById('splitToggleBtn');
  if(form){form.style.display=_invSplitMode?'flex':'none';}
  if(btn){
    btn.style.background=_invSplitMode?'var(--GD)':'#eff6ff';
    btn.style.borderColor=_invSplitMode?'var(--GD)':'#93c5fd';
    btn.style.color=_invSplitMode?'#fff':'#1e40af';
    btn.innerHTML=_invSplitMode?'<span>&#10005;</span> Cancel Split':'<span>&#9135;</span> Split Invoice by Work Orders';
  }
  if(_invSplitMode){
    var source=_invEditMode?_invEditLots:_pendingWOs;
    var selWOs=source.filter(function(w){return _invSelectedWOs.has(w._id||w._key||w.num||w.id||'');});
    if(!selWOs.length){
      _splitGroups=[{installer:'',billTo:'',woKeys:[]},{installer:'',billTo:'',woKeys:[]}];
    }else{
      var mid=Math.ceil(selWOs.length/2);
      _splitGroups=[
        {installer:'',billTo:'',woKeys:selWOs.slice(0,mid).map(function(w){return w._id||w._key||w.num||w.id||'';})},
        {installer:'',billTo:'',woKeys:selWOs.slice(mid).map(function(w){return w._id||w._key||w.num||w.id||'';})}
      ];
    }
    renderSplitGroups();
    invTab(1);
  }else{
    _splitGroups=[];
  }
}

function addSplitGroup(){
  _splitGroups.forEach(function(g,gi){
    var iEl=document.getElementById('splitInst_'+gi);
    var bEl=document.getElementById('splitBt_'+gi);
    if(iEl)g.installer=iEl.value;
    if(bEl)g.billTo=bEl.value;
  });
  _splitGroups.push({installer:'',billTo:'',woKeys:[]});
  renderSplitGroups();
}

function renderSplitGroups(){
  var cont=document.getElementById('invSplitGroups');
  if(!cont)return;
  var source=_invEditMode?_invEditLots:_pendingWOs;
  var selWOs=source.filter(function(w){return _invSelectedWOs.has(w._id||w._key||w.num||w.id||'');});
  cont.innerHTML='';
  var palettes=[['#eff6ff','#93c5fd','#1e40af'],['#fff7ed','#fdba74','#c2410c'],['#f0fdf4','#86efac','#15803d'],['#fdf4ff','#e9d5ff','#7e22ce']];
  _splitGroups.forEach(function(g,gi){
    var c=palettes[gi%palettes.length];
    var card=document.createElement('div');
    card.style.cssText='background:'+c[0]+';border:1.5px solid '+c[1]+';border-radius:10px;padding:12px;margin-bottom:8px';
    var hdr=document.createElement('div');
    hdr.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:10px';
    var title=document.createElement('span');
    title.style.cssText='font-size:13px;font-weight:700;color:'+c[2];
    title.textContent='Group '+(gi+1);
    hdr.appendChild(title);
    if(_splitGroups.length>2){
      var rmBtn=document.createElement('button');
      rmBtn.style.cssText='font-size:11px;padding:2px 8px;background:'+c[1]+';color:'+c[2]+';border:none;border-radius:5px;cursor:pointer';
      rmBtn.textContent='Remove';
      rmBtn.onclick=(function(idx){return function(){
        _splitGroups.forEach(function(sg,sgi){
          var iEl=document.getElementById('splitInst_'+sgi);
          var bEl=document.getElementById('splitBt_'+sgi);
          if(iEl)sg.installer=iEl.value;
          if(bEl)sg.billTo=bEl.value;
        });
        _splitGroups.splice(idx,1);
        renderSplitGroups();
      };})(gi);
      hdr.appendChild(rmBtn);
    }
    card.appendChild(hdr);
    var instLbl=document.createElement('div');
    instLbl.style.cssText='font-size:11px;font-weight:600;color:'+c[2]+';margin-bottom:3px';
    instLbl.textContent='Installer / Crew';
    card.appendChild(instLbl);
    var instInp=document.createElement('input');
    instInp.id='splitInst_'+gi;
    instInp.placeholder='Installer / crew name';
    instInp.value=g.installer||'';
    instInp.style.cssText='width:100%;background:#fff;border:1px solid '+c[1]+';border-radius:6px;padding:7px 10px;font-size:12px;outline:none;box-sizing:border-box;margin-bottom:8px';
    card.appendChild(instInp);
    var btLbl=document.createElement('div');
    btLbl.style.cssText='font-size:11px;font-weight:600;color:'+c[2]+';margin-bottom:3px';
    btLbl.textContent='Bill To';
    card.appendChild(btLbl);
    var btTa=document.createElement('textarea');
    btTa.id='splitBt_'+gi;
    btTa.rows=2;
    btTa.placeholder='Contractor / Address';
    btTa.value=g.billTo||'';
    btTa.style.cssText='width:100%;background:#fff;border:1px solid '+c[1]+';border-radius:6px;padding:7px 10px;font-size:12px;outline:none;resize:vertical;box-sizing:border-box;margin-bottom:8px';
    card.appendChild(btTa);
    var grpTotal=g.woKeys.reduce(function(s,k){
      var w=selWOs.find(function(x){return (x._id||x._key||x.num||x.id||'')==k;});
      return s+(w?w.total||0:0);
    },0);
    var woLbl=document.createElement('div');
    woLbl.style.cssText='font-size:11px;font-weight:600;color:'+c[2]+';margin-bottom:5px';
    woLbl.textContent='Work Orders ('+g.woKeys.length+' selected — $'+grpTotal.toFixed(2)+')';
    card.appendChild(woLbl);
    selWOs.forEach(function(w){
      var key=w._id||w._key||w.num||w.id||'';
      var inGroup=g.woKeys.indexOf(key)!==-1;
      var wsnap=w.snapshot||{};
      var wlabel=(w.builder||wsnap.fb||'')+(w.site?' / '+(w.site||wsnap.fp||''):'')+' - Lot '+(w.lot||wsnap.fl||'')+' ($'+(w.total||0).toFixed(2)+')';
      var row=document.createElement('label');
      row.style.cssText='display:flex;align-items:center;gap:6px;font-size:11px;padding:4px 0;cursor:pointer;color:'+(inGroup?c[2]:'#555');
      var cb=document.createElement('input');
      cb.type='checkbox';
      cb.checked=inGroup;
      cb.onchange=(function(k,idx){return function(e){
        _splitGroups.forEach(function(sg,sgi){
          var iEl=document.getElementById('splitInst_'+sgi);
          var bEl=document.getElementById('splitBt_'+sgi);
          if(iEl)sg.installer=iEl.value;
          if(bEl)sg.billTo=bEl.value;
        });
        if(e.target.checked){
          _splitGroups.forEach(function(sg,sgi){if(sgi!==idx){var i=sg.woKeys.indexOf(k);if(i!==-1)sg.woKeys.splice(i,1);}});
          if(_splitGroups[idx].woKeys.indexOf(k)===-1)_splitGroups[idx].woKeys.push(k);
        }else{
          var i=_splitGroups[idx].woKeys.indexOf(k);
          if(i!==-1)_splitGroups[idx].woKeys.splice(i,1);
        }
        renderSplitGroups();
      };})(key,gi);
      row.appendChild(cb);
      var sp=document.createElement('span');sp.textContent=wlabel;
      row.appendChild(sp);
      card.appendChild(row);
    });
    // ── Mini invoice preview for this group ──
    var prevDiv=document.createElement('div');
    var fmt2=function(n){return'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');};
    var esc2=function(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
    var isLead=(gi===0);
    var grpApprents=isLead?_invApprents:_invApprents.filter(function(p){return p.role==='partner';});
    var apOnly=grpApprents.filter(function(a){return a.role!=='partner';});
    var partners=grpApprents.filter(function(a){return a.role==='partner';});
    var apPay=0;
    apOnly.forEach(function(a){apPay+=a.type==='pct'?grpTotal*(parseFloat(a.pct||0)/100):parseFloat(a.rate||0)*parseFloat(a.hrs||0);});
    var taxable=grpTotal-apPay;
    var hst=parseFloat((taxable*0.13).toFixed(2));
    var grpGrand=parseFloat((grpTotal+hst).toFixed(2));
    var ph='<div style="margin-top:10px;border-top:1.5px dashed '+c[1]+';padding-top:10px;font-family:Arial,sans-serif;font-size:10px;color:#111">';
    ph+='<div style="font-size:9px;font-weight:700;color:'+c[2]+';text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Invoice Preview</div>';
    // totals table
    ph+='<table style="width:100%;border-collapse:collapse;margin-bottom:6px">';
    ph+='<tr><td style="padding:2px 4px;color:#555">Subtotal</td><td style="text-align:right;padding:2px 4px">'+fmt2(grpTotal)+'</td></tr>';
    if(apPay>0){
      ph+='<tr><td style="padding:2px 4px;color:#c00">Less Apprentice Pay</td><td style="text-align:right;padding:2px 4px;color:#c00">- '+fmt2(apPay)+'</td></tr>';
      ph+='<tr><td style="padding:2px 4px;color:#555">Taxable Amount</td><td style="text-align:right;padding:2px 4px">'+fmt2(taxable)+'</td></tr>';
    }
    ph+='<tr><td style="padding:2px 4px;color:#555">HST (13%)</td><td style="text-align:right;padding:2px 4px">'+fmt2(hst)+'</td></tr>';
    ph+='<tr style="border-top:2px solid #111"><td style="padding:3px 4px;font-weight:900;font-size:11px">INVOICE TOTAL</td><td style="text-align:right;padding:3px 4px;font-weight:900;font-size:11px">'+fmt2(grpGrand)+'</td></tr>';
    ph+='</table>';
    // payment distribution
    if(grpApprents.filter(function(a){return a.name||a.pct||a.rate;}).length){
      var prTotal=0;partners.forEach(function(p){prTotal+=p.type==='pct'?taxable*(parseFloat(p.pct||0)/100):parseFloat(p.rate||0)*parseFloat(p.hrs||0);});
      var instAmt=taxable-prTotal;
      var instNm=(document.getElementById('splitInst_'+gi)||{}).value||g.installer||'Installer';
      ph+='<div style="font-size:8.5px;font-weight:700;color:#555;margin-bottom:3px">PAYMENT DISTRIBUTION</div>';
      ph+='<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#eee"><th style="text-align:left;padding:2px 4px;font-size:8px">NAME / ROLE</th><th style="text-align:left;padding:2px 4px;font-size:8px">RATE</th><th style="text-align:right;padding:2px 4px;font-size:8px">AMOUNT</th></tr></thead><tbody>';
      apOnly.forEach(function(a,i){
        var amt=a.type==='pct'?grpTotal*(parseFloat(a.pct||0)/100):parseFloat(a.rate||0)*parseFloat(a.hrs||0);
        var rs=a.type==='pct'?(a.pct+'% of subtotal'):('$'+(a.rate||0)+'/hr × '+(a.hrs||0)+'h');
        var bg=i%2===0?'#f8f8f8':'#fff';
        ph+='<tr style="background:'+bg+'"><td style="padding:2px 4px">'+esc2(a.name||'—')+' <span style="font-size:8px;font-weight:700;color:#0891b2">Apprentice</span></td><td style="padding:2px 4px;color:#777;font-size:9px">'+esc2(rs)+'</td><td style="text-align:right;padding:2px 4px;font-weight:600">'+fmt2(amt)+'</td></tr>';
      });
      partners.forEach(function(p,i){
        var amt=p.type==='pct'?taxable*(parseFloat(p.pct||0)/100):parseFloat(p.rate||0)*parseFloat(p.hrs||0);
        var rs=p.type==='pct'?(p.pct+'% of taxable'):('$'+(p.rate||0)+'/hr × '+(p.hrs||0)+'h');
        var bg=(apOnly.length+i)%2===0?'#f8f8f8':'#fff';
        ph+='<tr style="background:'+bg+'"><td style="padding:2px 4px">'+esc2(p.name||'—')+' <span style="font-size:8px;font-weight:700;color:#7c3aed">Partner</span></td><td style="padding:2px 4px;color:#777;font-size:9px">'+esc2(rs)+'</td><td style="text-align:right;padding:2px 4px;font-weight:600">'+fmt2(amt)+'</td></tr>';
      });
      var instRow=(apOnly.length+partners.length)%2===0?'#f8f8f8':'#fff';
      ph+='<tr style="background:'+instRow+'"><td style="padding:2px 4px">'+esc2(instNm)+' <span style="font-size:8px;font-weight:700;color:#16a34a">Installer</span></td><td style="padding:2px 4px;color:#777;font-size:9px">Remainder</td><td style="text-align:right;padding:2px 4px;font-weight:600">'+fmt2(instAmt)+'</td></tr>';
      ph+='<tr style="background:#1e3a2a;color:#fff"><td colspan="2" style="padding:3px 4px;font-size:9px;font-weight:700">TOTAL DISTRIBUTED (excl. HST)</td><td style="text-align:right;padding:3px 4px;font-weight:900">'+fmt2(grpTotal)+'</td></tr>';
      ph+='</tbody></table>';
    }
    ph+='</div>';
    prevDiv.innerHTML=ph;
    card.appendChild(prevDiv);
    cont.appendChild(card);
  });
}

async function buildSplitInvoicePDFs(){
  _splitGroups.forEach(function(g,gi){
    var iEl=document.getElementById('splitInst_'+gi);
    var bEl=document.getElementById('splitBt_'+gi);
    if(iEl)g.installer=iEl.value;
    if(bEl)g.billTo=bEl.value;
  });
  var source=_invEditMode?_invEditLots:_pendingWOs;
  var allSel=source.filter(function(w){return _invSelectedWOs.has(w._id||w._key||w.num||w.id||'');});
  if(!allSel.length){alert('No work orders selected. Please add pending work orders first.');return;}
  var validGroups=_splitGroups.filter(function(g){return g.woKeys.length>0;});
  if(!validGroups.length){alert('Please assign at least one work order to a group.');return;}
  var genBtn=document.querySelector('#invSplitForm button:last-child');
  if(genBtn){genBtn.disabled=true;genBtn.textContent='Building...';}
  var sharedNum='INV-'+String(Date.now()).slice(-6);
  var today=new Date().toISOString();
  try{
    for(var gi=0;gi<validGroups.length;gi++){
      var g=validGroups[gi];
      var groupWOs=allSel.filter(function(w){return g.woKeys.indexOf(w._id||w._key||w.num||w.id||'')!==-1;});
      await _buildOneSplitPDF(groupWOs,g.installer,g.billTo,sharedNum,String(gi+1),gi*800);
      if(DB){
        var groupTotal=groupWOs.reduce(function(s,w){return s+_invGetTotal(w);},0);
        var lotData=groupWOs.map(function(w){return{type:w.type,builder:w.builder,site:w.site,lot:w.lot,installer:w.installer,total:w.total};});
        var invId='inv_'+Date.now()+'_g'+gi;
        // Split invoices include partner pay (but NOT apprentices — those are main invoice only)
        var spPartners=_invApprents.filter(function(p){return p.role==='partner'&&p.name&&p.name.trim();});
        var spAfterAp2=groupTotal; // no apprentice deduction on splits
        var spHst=parseFloat((groupTotal*0.13).toFixed(2));
        var spPayees2=[];
        spPartners.forEach(function(p){
          var amt=p.type==='pct'?spAfterAp2*(parseFloat(p.pct||0)/100):parseFloat(p.hrs||0)*parseFloat(p.rate||0);
          spPayees2.push({name:p.name.trim(),type:'partner',val:p.pct||p.rate||'',hrs:p.hrs||'',amount:amt});
        });
        var spRecord={_key:invId,_savedAt:today,status:'active',invoiceNum:sharedNum,installer:g.installer,billTo:g.billTo,lotTotal:groupTotal,lots:lotData,subtotal:groupTotal,hst:spHst,total:parseFloat((groupTotal+spHst).toFixed(2)),isSplit:true,splitGroup:gi+1,splitNum:sharedNum,payees:spPayees2};
        DB.collection('invoices').doc(invId).set(spRecord).catch(function(){});
        if(spPayees2.length)autoRegisterStaff(spRecord);
      }
    }
    var allAssigned=validGroups.reduce(function(acc,g){return acc.concat(g.woKeys);},[]);
    if(DB){allAssigned.forEach(function(k){
      DB.collection('saved_workorder').doc(k).update({status:'invoiced'}).catch(function(){});
      DB.collection('pending_lots').doc(k).update({status:'invoiced'}).catch(function(){});
    });}
    _pendingWOs=_pendingWOs.filter(function(w){return allAssigned.indexOf(w._id||w._key||w.num||w.id||'')===-1;});
    _invSelectedWOs.clear();
    toggleInvSplit();
    loadInvoiceBuilderWOs();
    if(typeof showToast==='function')showToast('Split invoices generated');
  }catch(e){
    console.error('Split PDF error:',e);
    alert('Error generating PDFs: '+(e.message||e));
  }finally{
    if(genBtn){genBtn.disabled=false;genBtn.textContent='⬇ Generate Split Invoices';}
  }
}

async function _buildOneSplitPDF(wos,installerName,billTo,invNum,groupLabel,delayMs){
  await new Promise(function(r){setTimeout(r,delayMs||0);});
  // Group 1 = first invoice: show apprentices + partners. Group 2+ = show partners only.
  var splitApprent=groupLabel==='1'?_invApprents:_invApprents.filter(function(p){return p.role==='partner';});
  var pdf=_generateInvoicePDFObj(wos,installerName,billTo,invNum,0,splitApprent);
  var filename='Invoice-'+invNum+'-Group'+groupLabel+'.pdf';
  var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  if(isIOS){
    var dataUri=pdf.output('datauristring');
    var win=window.open('','_blank');
    if(win){win.document.write('<html><head><title>'+filename+'</title></head><body style="margin:0"><embed width="100%" height="100%" src="'+dataUri+'" type="application/pdf"></body></html>');win.document.close();}
    else window.location.href=dataUri;
  }else{
    pdf.save(filename);
  }
  // Download each work order as its own separate PDF
  wos.forEach(function(wo,i){
    setTimeout(function(){
      var woPdf=_generateWOSummaryPDF(wo);
      if(!woPdf)return;
      var wsnap=wo.snapshot||{};
      var b=(wo.builder||wsnap.fb||'').replace(/[^a-zA-Z0-9 ]/g,'').trim();
      var s=(wo.site||wo.project||wsnap.fp||'').replace(/[^a-zA-Z0-9 ]/g,'').trim();
      var l=(wo.lot||wsnap.fl||'').replace(/[^a-zA-Z0-9 ]/g,'').trim();
      var woFilename='WO'+(b?' - '+b:'')+(s?' '+s:'')+(l?' Lot '+l:'')+'.pdf';
      if(isIOS){
        var uri=woPdf.output('datauristring');
        var w2=window.open('','_blank');
        if(w2){w2.document.write('<html><head><title>'+woFilename+'</title></head><body style="margin:0"><embed width="100%" height="100%" src="'+uri+'" type="application/pdf"></body></html>');w2.document.close();}
      }else{
        woPdf.save(woFilename);
      }
    },(i+1)*700);
  });
}

function _appendWOPageToPDF(pdf,wo){
  pdf.addPage();
  var W=612,M=36,CW=W-2*M;
  var tx=function(s,x,y,sz,fnt,col,align){if(isNaN(x)||isNaN(y))return;pdf.setFontSize(sz||9);pdf.setFont('helvetica',fnt||'normal');pdf.setTextColor.apply(pdf,col||[0,0,0]);pdf.text(String(s||''),x,y,align?{align:align}:{});};
  var fR=function(x,y,w,h,col){pdf.setFillColor(col[0],col[1],col[2]);pdf.rect(x,y,w,h,'F');};
  var sR=function(x,y,w,h,lw,col){var c=col||[120,120,120];pdf.setDrawColor(c[0],c[1],c[2]);pdf.setLineWidth(lw||0.4);pdf.rect(x,y,w,h,'S');};
  var fmt=function(n){return'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');};
  var wsnap=wo.snapshot||{};
  var builder=wo.builder||wsnap.fb||'';
  var site=wo.site||wo.project||wsnap.fp||'';
  var lot=wo.lot||wsnap.fl||'';
  var layout=wo.layout||wsnap.fla||'';
  var model=wo.model||wsnap.fm||'';
  var installer=wo.installer||wsnap.fi||'';
  var total=wo.total||0;
  var hst=parseFloat((total*0.13).toFixed(2));
  var grand=parseFloat((total+hst).toFixed(2));
  var today=new Date().toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'});
  var y=M;
  tx('ECO AIR',M,y+14,14,'bold',[0,0,0]);
  tx('HST: 70246 4132 RT0001',M,y+28,8,'normal',[60,60,60]);
  tx('20 Sixth Street',M,y+38,8,'normal',[60,60,60]);
  tx('Etobicoke, ON M8V 3A2',M,y+48,8,'normal',[60,60,60]);
  tx('(289) 259-7939',M,y+58,8,'normal',[60,60,60]);
  tx('WORK ORDER',W-M,y+14,16,'bold',[0,0,0],'right');
  tx('DATE:',W-M-110,y+28,8,'bold',[80,80,80]);tx(today,W-M,y+28,8,'normal',[0,0,0],'right');
  if(installer){tx('CREW:',W-M-110,y+38,8,'bold',[80,80,80]);tx(installer,W-M,y+38,8,'bold',[0,0,0],'right');}
  y+=68;
  pdf.setDrawColor(0,0,0);pdf.setLineWidth(0.5);pdf.line(M,y,W-M,y);y+=14;
  var RH=16;
  var fields=[['BUILDER',builder],['PROJECT / SITE',site],['LOT #',lot],['LAYOUT',layout],['MODEL',model]];
  fields.forEach(function(f){
    if(!f[1])return;
    fR(M,y,CW,RH,[245,245,245]);sR(M,y,CW,RH,0.3,[200,200,200]);
    tx(f[0],M+4,y+RH*0.72,7,'bold',[80,80,80]);
    tx(f[1],M+130,y+RH*0.72,8,'normal',[0,0,0]);
    y+=RH;
  });
  y+=10;
  pdf.setDrawColor(0,0,0);pdf.setLineWidth(0.5);pdf.line(M,y,W-M,y);y+=14;
  var TTW=200,TTX=M+CW-TTW,TH=13;
  [['Subtotal:',fmt(total)],['HST (13%):',fmt(hst)],['TOTAL:',fmt(grand)]].forEach(function(row,ri){
    var bold=ri===2;
    if(bold)fR(TTX,y,TTW,TH,[210,210,210]);
    sR(TTX,y,TTW,TH,bold?0.6:0.3,[80,80,80]);
    pdf.setDrawColor(80,80,80);pdf.setLineWidth(bold?0.6:0.3);pdf.line(TTX+TTW*0.5,y,TTX+TTW*0.5,y+TH);
    tx(row[0],TTX+TTW*0.5-4,y+TH*0.75,bold?9:8,bold?'bold':'normal',[0,0,0],'right');
    tx(row[1],TTX+TTW-4,y+TH*0.75,bold?9:8,bold?'bold':'normal',[0,0,0],'right');
    y+=TH;
  });
}

function _batchWOCapture(wos){
  if(!wos||!wos.length)return;
  var woHtml=window.TOOL_HTML&&window.TOOL_HTML.workorder;
  if(!woHtml){console.warn('WO tool not loaded');return;}
  var hif=document.createElement('iframe');
  hif.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1200px;height:900px;opacity:0;pointer-events:none';
  document.body.appendChild(hif);
  var idx=0;
  function next(){
    if(idx>=wos.length){document.body.removeChild(hif);return;}
    var wo=wos[idx++];
    var snap=wo.snapshot||{};
    var b=(wo.builder||snap.fb||snap.builder||'').replace(/[\/\\:*?"<>|]/g,'').trim();
    var s=(wo.site||wo.project||snap.fp||snap.site||'').replace(/[\/\\:*?"<>|]/g,'').trim();
    var l=(wo.lot||snap.fl||snap.lot||'').toString().trim();
    var woName=(b||s||l)?((b?b+' – ':'')+(s?s+' – ':'')+(l?'Lot '+l:'Lot')+'.pdf'):'Work Order.pdf';
    window.__woCaptureResolve=function(pdfB64){
      if(pdfB64){
        var _a=document.createElement('a');
        _a.href=pdfB64;_a.download=woName;
        document.body.appendChild(_a);_a.click();document.body.removeChild(_a);
      }
      setTimeout(next,400);
    };
    hif.onload=null;
    hif.srcdoc=woHtml;
    hif.onload=function(){
      setTimeout(function(){
        hif.contentWindow.postMessage({__portalMsg:true,type:'LOAD_WO',snapshot:snap,woId:wo._id||wo._key||wo.num||wo.id||''},'*');
        setTimeout(function(){
          hif.contentWindow.postMessage({__portalMsg:true,type:'CAPTURE_PDF'},'*');
        },1200);
      },800);
    };
  }
  next();
}

function _generateWOSummaryPDF(wo){
  var jsPDF=window.jspdf&&window.jspdf.jsPDF;
  if(!jsPDF)return null;
  var pdf=new jsPDF({orientation:'portrait',unit:'pt',format:'letter'});
  var W=612,M=36,CW=W-2*M;
  var tx=function(s,x,y,sz,fnt,col,align){if(isNaN(x)||isNaN(y))return;pdf.setFontSize(sz||9);pdf.setFont('helvetica',fnt||'normal');if(col)pdf.setTextColor(col[0],col[1],col[2]);else pdf.setTextColor(0,0,0);pdf.text(String(s||''),x,y,align?{align:align}:{});};
  var fR=function(x,y,w,h,col){pdf.setFillColor(col[0],col[1],col[2]);pdf.rect(x,y,w,h,'F');};
  var sR=function(x,y,w,h,lw,col){var c=col||[120,120,120];pdf.setDrawColor(c[0],c[1],c[2]);pdf.setLineWidth(lw||0.4);pdf.rect(x,y,w,h,'S');};
  var fmt=function(n){return'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');};
  var wsnap=wo.snapshot||{};
  var builder=wo.builder||wsnap.fb||wsnap.builder||'';
  var site=wo.site||wo.project||wsnap.fp||wsnap.site||'';
  var lot=wo.lot||wsnap.fl||wsnap.lot||'';
  var layout=wo.layout||wsnap.fla||'';
  var model=wo.model||wsnap.fm||'';
  var installer=wo.installer||wsnap.fi||'';
  var total=wo.total||0;
  var hst=total*0.13;
  var grand=total+hst;
  var today=new Date().toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'});
  var y=M;
  tx('ECO AIR',M,y+14,14,'bold',[0,0,0]);
  tx('HST: 70246 4132 RT0001',M,y+28,8,'normal',[60,60,60]);
  tx('20 Sixth Street',M,y+38,8,'normal',[60,60,60]);
  tx('Etobicoke, ON M8V 3A2',M,y+48,8,'normal',[60,60,60]);
  tx('(289) 259-7939',M,y+58,8,'normal',[60,60,60]);
  tx('WORK ORDER',W-M,y+14,16,'bold',[0,0,0],'right');
  tx('DATE:',W-M-110,y+28,8,'bold',[80,80,80]);tx(today,W-M,y+28,8,'normal',[0,0,0],'right');
  if(installer){tx('CREW:',W-M-110,y+38,8,'bold',[80,80,80]);tx(installer,W-M,y+38,8,'bold',[0,0,0],'right');}
  y+=68;
  pdf.setDrawColor(0,0,0);pdf.setLineWidth(0.5);pdf.line(M,y,W-M,y);y+=14;
  var TH=13,RH=16;
  var fields=[['BUILDER',builder],['PROJECT / SITE',site],['LOT #',lot],['LAYOUT',layout],['MODEL',model]];
  fields.forEach(function(f){
    if(!f[1])return;
    fR(M,y,CW,RH,[245,245,245]);
    sR(M,y,CW,RH,0.3,[200,200,200]);
    tx(f[0],M+4,y+RH*0.72,7,'bold',[80,80,80]);
    tx(f[1],M+130,y+RH*0.72,8,'normal',[0,0,0]);
    y+=RH;
  });
  y+=10;
  pdf.setDrawColor(0,0,0);pdf.setLineWidth(0.5);pdf.line(M,y,W-M,y);y+=14;
  var TTW=200,TTX=M+CW-TTW;
  [['Subtotal:',fmt(total)],['HST (13%):',fmt(hst)],['TOTAL:',fmt(grand)]].forEach(function(row,ri){
    var bold=ri===2;
    if(bold)fR(TTX,y,TTW,TH,[210,210,210]);
    sR(TTX,y,TTW,TH,bold?0.6:0.3,[80,80,80]);
    pdf.setDrawColor(80,80,80);pdf.setLineWidth(bold?0.6:0.3);pdf.line(TTX+TTW*0.5,y,TTX+TTW*0.5,y+TH);
    tx(row[0],TTX+TTW*0.5-4,y+TH*0.75,bold?9:8,bold?'bold':'normal',[0,0,0],'right');
    tx(row[1],TTX+TTW-4,y+TH*0.75,bold?9:8,bold?'bold':'normal',[0,0,0],'right');
    y+=TH;
  });
  return pdf;
}

function _generateInvoicePDFObj(wos,installerName,billTo,invNum,customAmt,apprentOverride){
  var jsPDF=window.jspdf&&window.jspdf.jsPDF;
  if(!jsPDF)throw new Error('PDF library not loaded');
  var pdf=new jsPDF({orientation:'portrait',unit:'pt',format:'letter'});
  var W=612,M=36,CW=W-2*M;
  var tx=function(s,x,y,sz,fnt,col,align){
    if(isNaN(x)||isNaN(y))return;
    pdf.setFontSize(sz||9);pdf.setFont('helvetica',fnt||'normal');
    if(col)pdf.setTextColor(col[0],col[1],col[2]);else pdf.setTextColor(0,0,0);
    pdf.text(String(s||''),x,y,align?{align:align}:{});
  };
  var fR=function(x,y,w,h,col){if(isNaN(x)||isNaN(y))return;pdf.setFillColor(col[0],col[1],col[2]);pdf.rect(x,y,w,h,'F');};
  var sR=function(x,y,w,h,lw,col){var c=col||[120,120,120];pdf.setDrawColor(c[0],c[1],c[2]);pdf.setLineWidth(lw||0.4);pdf.rect(x,y,w,h,'S');};
  var ln=function(x1,y1,x2,y2,lw,col){var c=col||[180,180,180];pdf.setDrawColor(c[0],c[1],c[2]);pdf.setLineWidth(lw||0.3);pdf.line(x1,y1,x2,y2);};
  var fmt=function(n){return'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');};
  var pf2=function(n){return parseFloat(n||0).toFixed(2);};
  var today=new Date().toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'});
  var y=M;
  tx('ECO AIR',M,y+14,14,'bold',[0,0,0]);
  tx('HST: 70246 4132 RT0001',M,y+28,8,'normal',[60,60,60]);
  tx('20 Sixth Street',M,y+38,8,'normal',[60,60,60]);
  tx('Etobicoke, ON M8V 3A2',M,y+48,8,'normal',[60,60,60]);
  tx('(289) 259-7939',M,y+58,8,'normal',[60,60,60]);
  tx('INVOICE',W-M,y+14,20,'bold',[0,0,0],'right');
  tx('DATE:',W-M-110,y+28,8,'bold',[80,80,80]);tx(today,W-M,y+28,8,'normal',[0,0,0],'right');
  tx('INVOICE#:',W-M-110,y+38,8,'bold',[80,80,80]);tx(invNum,W-M,y+38,8,'normal',[0,0,0],'right');
  if(installerName){tx('CREW:',W-M-110,y+48,8,'bold',[80,80,80]);tx(installerName,W-M,y+48,8,'bold',[0,0,0],'right');}
  y+=68;
  pdf.setDrawColor(0,0,0);pdf.setLineWidth(0.5);pdf.line(M,y,W-M,y);y+=8;
  tx('INVOICE TO:',M,y+10,8,'bold',[0,0,0]);
  if(billTo){
    var btLines=billTo.split('\n').slice(0,4);
    btLines.forEach(function(line,i){tx(line,M,y+22+i*11,8,'normal',[0,0,0]);});
    y+=22+btLines.length*11+8;
  }else{y+=30;}
  pdf.setDrawColor(0,0,0);pdf.setLineWidth(0.5);pdf.line(M,y,W-M,y);y+=8;
  var cols=[
    {l:'#',x:M,w:24,r:false},{l:'BUILDER',x:M+24,w:130,r:false},
    {l:'PROJECT',x:M+154,w:100,r:false},{l:'LOT',x:M+254,w:48,r:false},
    {l:'LAYOUT',x:M+302,w:58,r:false},{l:'MODEL',x:M+360,w:78,r:false},
    {l:'TOTAL',x:M+438,w:CW-438,r:true}
  ];
  var TH=12,RH=15;
  fR(M,y,CW,TH,[210,210,210]);sR(M,y,CW,TH,0.5,[80,80,80]);
  cols.forEach(function(c){if(c.r)tx(c.l,c.x+c.w-3,y+TH*0.75,6.5,'bold',[0,0,0],'right');else tx(c.l,c.x+4,y+TH*0.75,6.5,'bold',[0,0,0]);});
  cols.slice(1).forEach(function(c){ln(c.x,y,c.x,y+TH,0.4,[120,120,120]);});
  y+=TH;
  var bTot=customAmt>0?customAmt:wos.reduce(function(s,w){return s+_invGetTotal(w);},0);
  for(var ri=0;ri<20;ri++){
    var r=wos[ri];
    if(ri%2===0)fR(M,y,CW,RH,[248,248,248]);
    sR(M,y,CW,RH,0.25,[200,200,200]);
    cols.slice(1).forEach(function(c){ln(c.x,y,c.x,y+RH,0.25);});
    var ry=y+RH*0.7;
    tx(String(ri+1),M+3,ry,8,'normal',[100,100,100]);
    if(r){
      var rs=r.snapshot||{};
      tx((r.builder||rs.fb||'').substring(0,18),cols[1].x+4,ry,8,'normal',[0,0,0]);
      tx((r.site||rs.fp||'').substring(0,15),cols[2].x+4,ry,8,'normal',[0,0,0]);
      tx((r.lot||rs.fl||'').substring(0,7),cols[3].x+4,ry,8,'normal',[0,0,0]);
      tx((r.layout||rs.fla||'').substring(0,8),cols[4].x+4,ry,8,'normal',[0,0,0]);
      tx((r.model||rs.fm||'').substring(0,11),cols[5].x+4,ry,8,'normal',[0,0,0]);
      tx(fmt(_invGetTotal(r)),cols[6].x+cols[6].w-3,ry,8,'bold',[0,0,0],'right');
    }
    y+=RH;
  }
  // Custom line items after WO rows
  if(_invCustomLines.length){
    _invCustomLines.forEach(function(line,ci){
      if(ci%2===0)fR(M,y,CW,RH,[240,253,244]);
      sR(M,y,CW,RH,0.25,[200,200,200]);
      var cry=y+RH*0.7;
      tx(line.desc||'—',cols[1].x+4,cry,8,'normal',[60,60,60]);
      tx(fmt(line.total||0),cols[6].x+cols[6].w-3,cry,8,'bold',[0,0,0],'right');
      y+=RH;
    });
    var cTot=_invCustomLines.reduce(function(s,l){return s+(l.total||0);},0);
    bTot+=cTot;
  }
  sR(M,y,CW,TH,0.5,[80,80,80]);
  tx(fmt(bTot),cols[6].x+cols[6].w-3,y+TH*0.75,8,'bold',[0,0,0],'right');
  y+=TH+10;
  // Totals + payment distribution
  var _apSource=apprentOverride!==undefined?apprentOverride:_invApprents;
  var apFilled=_apSource.filter(function(p){return p.name||p.rate||p.hrs||p.pct;});
  var apList=apFilled.filter(function(p){return p.role!=='partner';});
  var prList=apFilled.filter(function(p){return p.role==='partner';});
  // Apprentice pay carved out before HST
  var apTotal=0;
  apList.forEach(function(p){apTotal+=p.type==='pct'?bTot*(parseFloat(p.pct||0)/100):parseFloat(p.hrs||0)*parseFloat(p.rate||0);});
  var taxable=bTot-apTotal;
  var hst=taxable*0.13,grand=bTot+hst;
  // Partners split taxable amount
  var afterAp=taxable;
  var prTotal=0;
  prList.forEach(function(p){prTotal+=p.type==='pct'?afterAp*(parseFloat(p.pct||0)/100):parseFloat(p.hrs||0)*parseFloat(p.rate||0);});
  var instAmt=afterAp-prTotal;
  // Totals box
  y+=10;
  var TTW=240,TTX=M+CW-TTW;
  var totRows=[];
  totRows.push(['Subtotal:',fmt(bTot),false]);
  if(apTotal>0)totRows.push(['Less Apprentice Pay:','- '+fmt(apTotal),false]);
  if(apTotal>0)totRows.push(['Taxable Amount:',fmt(taxable),false]);
  totRows.push(['HST (13%):',fmt(hst),false]);
  totRows.push(['INVOICE TOTAL:',fmt(grand),true]);
  totRows.forEach(function(row){
    var lbl=row[0],val=row[1],bold=row[2];
    if(bold)fR(TTX,y,TTW,TH,[210,210,210]);
    sR(TTX,y,TTW,TH,bold?0.6:0.3,[80,80,80]);
    ln(TTX+TTW*0.5,y,TTX+TTW*0.5,y+TH,bold?0.6:0.3,[80,80,80]);
    tx(lbl,TTX+TTW*0.5-4,y+TH*0.75,bold?9:8,bold?'bold':'normal',[0,0,0],'right');
    tx(val,TTX+TTW-4,y+TH*0.75,bold?9:8,bold?'bold':'normal',[0,0,0],'right');
    y+=TH;
  });
  // Payment distribution (only if there are people to pay)
  if(apFilled.length){
    y+=12;
    pdf.setDrawColor(180,180,180);pdf.setLineWidth(0.5);pdf.setLineDash([3,3],0);pdf.line(M,y,W-M,y);pdf.setLineDash([],0);
    y+=10;
    tx('PAYMENT DISTRIBUTION',M,y,8,'bold',[60,60,60]);
    y+=10;
    // ── BLOCK 1: Apprentice Pay (no HST — paid from pre-tax subtotal) ──
    if(apList.length){
      fR(M,y,CW,TH,[215,235,250]);sR(M,y,CW,TH,0.4,[100,130,170]);
      tx('APPRENTICE PAY',M+4,y+TH*0.75,6.5,'bold',[20,60,120]);
      tx('RATE',M+220+4,y+TH*0.75,6.5,'bold',[20,60,120]);
      tx('AMOUNT',W-M-3,y+TH*0.75,6.5,'bold',[20,60,120],'right');
      ln(M+220,y,M+220,y+TH,0.3,[100,130,170]);ln(W-M-80,y,W-M-80,y+TH,0.3,[100,130,170]);
      y+=TH;
      apList.forEach(function(p,ri){
        var amt=p.type==='pct'?bTot*(parseFloat(p.pct||0)/100):parseFloat(p.hrs||0)*parseFloat(p.rate||0);
        var rs=p.type==='pct'?(p.pct+'% of subtotal'):(p.rate?'$'+pf2(p.rate)+'/hr x '+(p.hrs||0)+' hrs':'');
        if(ri%2===0)fR(M,y,CW,RH,[245,250,255]);
        sR(M,y,CW,RH,0.2,[200,215,235]);
        ln(M+220,y,M+220,y+RH,0.2,[180,200,225]);ln(W-M-80,y,W-M-80,y+RH,0.2,[180,200,225]);
        tx((p.name||'—')+' (Apprentice)',M+4,y+RH*0.7,8,'normal',[0,0,0]);
        tx(rs,M+220+4,y+RH*0.7,8,'normal',[80,80,80]);
        tx(fmt(amt),W-M-3,y+RH*0.7,8,'bold',[0,0,0],'right');
        y+=RH;
      });
      fR(M,y,CW,TH+1,[170,210,240]);sR(M,y,CW,TH+1,0.4,[80,130,190]);
      tx('Total Apprentice Pay (excl. HST)',M+4,y+(TH+1)*0.75,7.5,'bold',[10,50,110]);
      tx(fmt(apTotal),W-M-4,y+(TH+1)*0.75,8,'bold',[10,50,110],'right');
      y+=TH+1;
      y+=10; // gap between blocks
    }
    // ── BLOCK 2: Partner & Installer Distribution (each with their HST share) ──
    // Columns: NAME(160) | RATE(100) | SUBTOTAL(90) | HST 13%(90) | TOTAL(100)
    var xN=M,xR=M+160,xS=M+260,xH=M+350,xT=M+440,xEnd=M+CW;
    fR(M,y,CW,TH,[220,230,220]);sR(M,y,CW,TH,0.4,[80,130,80]);
    tx('NAME / ROLE',xN+4,y+TH*0.75,6.5,'bold',[20,70,20]);
    tx('RATE',xR+4,y+TH*0.75,6.5,'bold',[20,70,20]);
    tx('SUBTOTAL',xS+(xH-xS)-3,y+TH*0.75,6.5,'bold',[20,70,20],'right');
    tx('HST (13%)',xH+(xT-xH)-3,y+TH*0.75,6.5,'bold',[20,70,20],'right');
    tx('TOTAL',xT+(xEnd-xT)-3,y+TH*0.75,6.5,'bold',[20,70,20],'right');
    ln(xR,y,xR,y+TH,0.3,[80,150,80]);ln(xS,y,xS,y+TH,0.3,[80,150,80]);
    ln(xH,y,xH,y+TH,0.3,[80,150,80]);ln(xT,y,xT,y+TH,0.3,[80,150,80]);
    y+=TH;
    var prRows=[];
    prList.forEach(function(p){
      var sub=p.type==='pct'?afterAp*(parseFloat(p.pct||0)/100):parseFloat(p.hrs||0)*parseFloat(p.rate||0);
      var pHst=parseFloat((sub*0.13).toFixed(2));
      var rs=p.type==='pct'?(p.pct+'% of taxable'):(p.rate?'$'+pf2(p.rate)+'/hr x '+(p.hrs||0)+' hrs':'');
      prRows.push({name:(p.name||'—')+' (Partner)',rs:rs,sub:sub,pHst:pHst,tot:parseFloat((sub+pHst).toFixed(2))});
    });
    var iHst=parseFloat((instAmt*0.13).toFixed(2));
    prRows.push({name:(installerName||'Installer')+' (Owner)',rs:'Remainder after partners',sub:instAmt,pHst:iHst,tot:parseFloat((instAmt+iHst).toFixed(2))});
    prRows.forEach(function(row,ri){
      if(ri%2===0)fR(M,y,CW,RH,[248,252,248]);
      sR(M,y,CW,RH,0.2,[200,220,200]);
      ln(xR,y,xR,y+RH,0.2,[180,210,180]);ln(xS,y,xS,y+RH,0.2,[180,210,180]);
      ln(xH,y,xH,y+RH,0.2,[180,210,180]);ln(xT,y,xT,y+RH,0.2,[180,210,180]);
      var ry2=y+RH*0.7;
      tx(row.name,xN+4,ry2,8,'normal',[0,0,0]);
      tx(row.rs,xR+4,ry2,7.5,'normal',[80,80,80]);
      tx(fmt(row.sub),xS+(xH-xS)-3,ry2,8,'normal',[0,0,0],'right');
      tx(fmt(row.pHst),xH+(xT-xH)-3,ry2,8,'normal',[40,100,40],'right');
      tx(fmt(row.tot),xT+(xEnd-xT)-3,ry2,8,'bold',[0,0,0],'right');
      y+=RH;
    });
    fR(M,y,CW,TH+2,[30,56,36]);sR(M,y,CW,TH+2,0.5,[20,40,25]);
    tx('TOTAL DISTRIBUTED (incl. HST)',M+4,y+(TH+2)*0.75,8,'bold',[255,255,255]);
    tx(fmt(grand),W-M-4,y+(TH+2)*0.75,9,'bold',[255,255,255],'right');
    y+=TH+2;
  }
  return pdf;
}

function invBatchDelete(){
  var keys=Array.from(_invSelectedWOs);
  if(!keys.length){alert('Select work orders to delete first.');return;}
  if(!confirm('Move '+keys.length+' work order'+(keys.length!==1?'s':'')+' to Trash?\n\nThey can be restored from the Work Orders trash.'))return;
  keys.forEach(function(k){
    if(DB){
      DB.collection('saved_workorder').doc(k).update({_deleted:true,status:'deleted'}).catch(function(){});
      DB.collection('pending_lots').doc(k).delete().catch(function(){});
    }
    _pendingWOs=_pendingWOs.filter(function(x){return(x._id||x._key||x.num||x.id||'')!==k;});
    _invSelectedWOs.delete(k);
  });
  renderInvWOList();renderInvAddedWOs();renderInvPreview();
}
function invSelectAll(){
  var source=_invEditMode?_invEditLots:_pendingWOs;
  source.forEach(function(w){_invSelectedWOs.add(w._id||w._key||w.num||w.id||'');});
  renderInvWOList();renderInvAddedWOs();renderInvPreview();
}
function invSelectNone(){_invSelectedWOs.clear();renderInvWOList();renderInvAddedWOs();renderInvPreview();}
function invUpdateTabBadge(){var t=document.getElementById('invTab1');if(t){var c=_invSelectedWOs.size;t.textContent='2 · Details'+(c?' ('+c+' selected)':'');}}
function renderInvWOList(){
  var el = document.getElementById('invWOList');if(!el)return;
  var source = _invEditMode ? _invEditLots : _pendingWOs;
  if (!source.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--tx3);font-size:12px">No pending work orders.</div>';
    return;
  }
  el.innerHTML = '';
  // Toolbar
  var selCount=_invSelectedWOs.size;
  var toolbar=document.createElement('div');
  toolbar.style.cssText='display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--bdr)';
  var selLabel=document.createElement('span');
  selLabel.style.cssText='font-size:11px;color:var(--tx3);flex:1';
  selLabel.textContent=selCount?selCount+' selected':'Tap a row to select';
  toolbar.appendChild(selLabel);
  var allBtn=document.createElement('button');allBtn.className='btn bw bsm';allBtn.style.fontSize='10px';allBtn.textContent='All';allBtn.onclick=invSelectAll;
  var noneBtn=document.createElement('button');noneBtn.className='btn bw bsm';noneBtn.style.fontSize='10px';noneBtn.textContent='None';noneBtn.onclick=invSelectNone;
  toolbar.appendChild(allBtn);toolbar.appendChild(noneBtn);
  if(selCount&&!_invEditMode){
    var delSelBtn=document.createElement('button');delSelBtn.className='btn br bsm';delSelBtn.style.fontSize='10px';
    delSelBtn.textContent='Delete ('+selCount+')';delSelBtn.onclick=invBatchDelete;
    toolbar.appendChild(delSelBtn);
  }
  el.appendChild(toolbar);
  source.forEach(function(w) {
    var key = w._id || w._key || w.num || w.id || '';
    var added = _invSelectedWOs.has(key);
    var wsnap = w.snapshot || {};
    var builder = w.builder || wsnap.fb || '';
    var site = w.site || wsnap.fp || '';
    var lot = w.lot || wsnap.fl || '';
    var installer = w.installer || wsnap.fi || '';
    var date = (w.date || wsnap.fd || w._savedAt || '').slice(0, 10);
    var total = w.total || 0;
    var masterNum = w.masterNum || '';
    var item = document.createElement('div');
    item.style.cssText = 'padding:8px 10px;border:1px solid '+(added?'#16a34a':'var(--bdr)')+';border-radius:7px;margin-bottom:4px;cursor:pointer;background:'+(added?'#dcfce7':'#fff')+';display:flex;align-items:flex-start;gap:8px';
    // Checkbox
    var chk=document.createElement('div');
    chk.style.cssText='width:16px;height:16px;border-radius:3px;border:2px solid '+(added?'#16a34a':'#ccc')+';background:'+(added?'#16a34a':'#fff')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px';
    if(added){chk.innerHTML='<svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
    var info=document.createElement('div');info.style.flex='1';
    var label = (builder?builder:'')+(site?' / '+site:'')+(lot?' - Lot '+lot:'')+(masterNum?' ('+masterNum+')':'');
    var labelDiv = document.createElement('div');
    labelDiv.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx1);margin-bottom:2px';
    labelDiv.textContent = label||'Work Order';
    var metaDiv = document.createElement('div');
    metaDiv.style.cssText = 'font-size:10px;color:var(--tx3);display:flex;gap:8px;flex-wrap:wrap';
    if(installer)metaDiv.innerHTML+='<span>'+esc(installer)+'</span>';
    if(date)metaDiv.innerHTML+='<span>'+date+'</span>';
    if(total)metaDiv.innerHTML+='<span style="color:#16a34a;font-weight:600">$'+parseFloat(total).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'</span>';
    info.appendChild(labelDiv);info.appendChild(metaDiv);
    // Edit button (separate, doesn't toggle selection)
    var editBtn = document.createElement('button');
    editBtn.className = 'btn bw bsm';editBtn.style.cssText='font-size:10px;flex-shrink:0';editBtn.textContent='Edit';
    editBtn.onclick = (function(w2){return function(e){e.stopPropagation();openWOInTool(w2);};})(w);
    item.appendChild(chk);item.appendChild(info);item.appendChild(editBtn);
    item.onclick = (function(k) { return function() {
      var wasAdded=_invSelectedWOs.has(k);
      if (wasAdded) _invSelectedWOs.delete(k);
      else { _invSelectedWOs.add(k); }
      renderInvWOList(); renderInvAddedWOs(); renderInvPreview(); invUpdateTabBadge();
    }; })(key);
    el.appendChild(item);
  });
}

function renderInvAddedWOs(){
  var el=document.getElementById('invAddedWOs');
  var sumEl=document.getElementById('invSelSummary');
  if(!el)return;
  var source=_invEditMode?_invEditLots:_pendingWOs;
  var added=source.filter(function(w){return _invSelectedWOs.has(w._id||w._key||w.num||w.id||'');});
  if(!added.length){
    el.innerHTML='<div style="font-size:11px;color:var(--tx3);text-align:center;padding:10px">No work orders added yet.</div>';
    if(sumEl)sumEl.textContent='';return;
  }
  var subtotal=added.reduce(function(s,w){return s+_invGetTotal(w);},0);
  el.innerHTML='';
  added.forEach(function(w){
    var snap=w.snapshot||{};
    var lot=w.lot||snap.fl||'';var builder=w.builder||snap.fb||'';var site=w.site||snap.fp||'';
    var label=(builder||'')+(site?' / '+site:'')+(lot?' Lot '+lot:'');
    var total=_invGetTotal(w);
    var key=w._id||w._key||w.num||w.id||'';
    var hasOverride=_invTotalOverrides.hasOwnProperty(key);
    var row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 8px;background:#f0f9f4;border:1px solid '+(hasOverride?'#d97706':'#bbdec9')+';border-radius:6px';
    var inp=document.createElement('input');
    inp.type='number';inp.min='0';inp.step='0.01';inp.value=total.toFixed(2);
    inp.title='Override total (leave as-is to keep WO total)';
    inp.style.cssText='width:80px;font-size:11px;font-weight:700;color:'+(hasOverride?'#d97706':'#16a34a')+';border:none;background:transparent;text-align:right;outline:none;padding:0';
    inp.addEventListener('change',(function(k,orig){return function(){
      var v=parseFloat(this.value);
      if(isNaN(v)||v<0){this.value=orig.toFixed(2);return;}
      _invSetTotalOverride(k,v);
    };})(key,w.total||0));
    row.innerHTML='<div style="flex:1;font-size:11px;font-weight:600;color:var(--GD)">'+esc(label||'Work Order')+'</div>';
    row.appendChild(inp);
    var resetBtn=document.createElement('button');resetBtn.className='btn bsm';resetBtn.title='Reset to WO total';
    resetBtn.style.cssText='font-size:9px;padding:1px 5px;display:'+(hasOverride?'':'none');
    resetBtn.textContent='↺';
    resetBtn.onclick=(function(k,orig){return function(){delete _invTotalOverrides[k];renderInvAddedWOs();renderInvPreview();};})(key,w.total||0);
    row.appendChild(resetBtn);
    var rmBtn=document.createElement('button');rmBtn.className='btn br bsm';rmBtn.style.fontSize='9px';rmBtn.textContent='×';
    rmBtn.onclick=(function(k){return function(){_invSelectedWOs.delete(k);delete _invTotalOverrides[k];renderInvWOList();renderInvAddedWOs();renderInvPreview();};})(key);
    row.appendChild(rmBtn);el.appendChild(row);
  });
  var customTotal=_invCustomLines.reduce(function(s,l){return s+(l.total||0);},0);
  var grandSub=subtotal+customTotal;
  if(sumEl)sumEl.textContent='Subtotal: $'+grandSub.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
}

function renderInvPreview(){
  var el=document.getElementById('invPreview');if(!el)return;
  var fromName=(document.getElementById('invFromName')||{}).value||'';
  var billTo=(document.getElementById('invBillTo')||{}).value||'';
  var source=_invEditMode?_invEditLots:_pendingWOs;
  var added=source.filter(function(w){return _invSelectedWOs.has(w._id||w._key||w.num||w.id||'');});
  var subtotal=added.reduce(function(s,w){return s+_invGetTotal(w);},0)+_invCustomLines.reduce(function(s,l){return s+(l.total||0);},0);
  var today=new Date().toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'});
  var fmt=function(n){return'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');};
  var h='<div style="font-family:Arial,sans-serif;font-size:10px;color:#111;line-height:1.4">'
    +'<div style="display:flex;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid #111">'
    +'<div><div style="font-size:14px;font-weight:900">'+(BRAND.name||'ECO AIR')+'</div>'
    +'<div style="color:#555">HST: 70246 4132 RT0001</div>'
    +'<div style="color:#555">Etobicoke, ON</div></div>'
    +'<div style="text-align:right"><div style="font-size:16px;font-weight:900;letter-spacing:2px">INVOICE</div>'
    +'<div>Date: '+today+'</div>'
    +(fromName?'<div style="font-weight:700">Crew: '+esc(fromName)+'</div>':'')+'</div></div>';
  if(billTo){h+='<div style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #ccc"><div style="font-weight:700;margin-bottom:2px">BILL TO:</div>'
    +billTo.split('\n').map(function(l){return'<div>'+esc(l)+'</div>';}).join('')+'</div>';}
  if(added.length){
    h+='<table style="width:100%;border-collapse:collapse;margin-bottom:8px"><thead><tr style="background:#ddd">'
      +'<th style="text-align:left;padding:3px 5px;font-size:9px">BUILDER / SITE</th>'
      +'<th style="text-align:left;padding:3px 5px;font-size:9px">LOT</th>'
      +'<th style="text-align:right;padding:3px 5px;font-size:9px">TOTAL</th></tr></thead><tbody>';
    added.forEach(function(w,i){
      var s=w.snapshot||{};
      var b=esc(w.builder||s.fb||'');var site=esc(w.site||s.fp||'');var lot=esc(w.lot||s.fl||'');
      var bg=i%2===0?'#f8f8f8':'#fff';
      h+='<tr style="background:'+bg+'"><td style="padding:3px 5px">'+b+(site?' / '+site:'')+'</td>'
        +'<td style="padding:3px 5px">'+lot+'</td>'
        +'<td style="text-align:right;padding:3px 5px;font-weight:600">'+fmt(_invGetTotal(w))+'</td></tr>';
    });
    if(_invCustomLines.length){
      _invCustomLines.forEach(function(line,i){
        var bg=(added.length+i)%2===0?'#f8f8f8':'#fff';
        h+='<tr style="background:'+bg+'"><td style="padding:3px 5px;font-style:italic">'+esc(line.desc||'—')+'</td>'
          +'<td></td>'
          +'<td style="text-align:right;padding:3px 5px;font-weight:600">'+fmt(line.total||0)+'</td></tr>';
      });
    }
    h+='<tr style="border-top:2px solid #111"><td colspan="2" style="padding:4px 5px;font-weight:700;text-align:right">Subtotal</td>'
      +'<td style="padding:4px 5px;font-weight:700;text-align:right">'+fmt(subtotal)+'</td></tr>'
      +'</tbody></table>';
  }
  // Invoice totals — HST on taxable amount (after apprentice pay)
  var apRowsPrev=_invApprents.filter(function(a){return a.name||a.rate||a.hrs||a.pct;});
  var apOnlyPrev=apRowsPrev.filter(function(a){return a.role!=='partner';});
  var apPayPrev=0;apOnlyPrev.forEach(function(a){apPayPrev+=a.type==='pct'?subtotal*(parseFloat(a.pct||0)/100):parseFloat(a.rate||0)*parseFloat(a.hrs||0);});
  var taxablePrev=subtotal-apPayPrev;
  var hstAmt=parseFloat((taxablePrev*0.13).toFixed(2)),grandTotal=parseFloat((subtotal+hstAmt).toFixed(2));
  h+='<table style="width:100%;border-collapse:collapse;margin-bottom:4px">'
    +'<tr><td style="padding:2px 5px;font-size:10px;color:#555">Subtotal</td><td style="text-align:right;padding:2px 5px;font-size:10px">'+fmt(subtotal)+'</td></tr>'
    +(apPayPrev>0?'<tr><td style="padding:2px 5px;font-size:10px;color:#c00">Less Apprentice Pay</td><td style="text-align:right;padding:2px 5px;font-size:10px;color:#c00">- '+fmt(apPayPrev)+'</td></tr>'
    +'<tr><td style="padding:2px 5px;font-size:10px;color:#555">Taxable Amount</td><td style="text-align:right;padding:2px 5px;font-size:10px">'+fmt(taxablePrev)+'</td></tr>':'')
    +'<tr><td style="padding:2px 5px;font-size:10px;color:#555">HST (13%)</td><td style="text-align:right;padding:2px 5px;font-size:10px">'+fmt(hstAmt)+'</td></tr>'
    +'<tr style="border-top:2px solid #111"><td style="padding:4px 5px;font-size:12px;font-weight:900">INVOICE TOTAL</td><td style="text-align:right;padding:4px 5px;font-size:12px;font-weight:900">'+fmt(grandTotal)+'</td></tr>'
    +'</table>';
  // Payment distribution
  var apRows=_invApprents.filter(function(a){return a.name||a.rate||a.hrs||a.pct;});
  if(apRows.length){
    var apListP=apRows.filter(function(a){return a.role!=='partner';});
    var prListP=apRows.filter(function(a){return a.role==='partner';});
    var apTotalP=apPayPrev; // already calculated above for HST
    var afterApP=taxablePrev;
    var prTotalP=0;
    prListP.forEach(function(a){prTotalP+=a.type==='pct'?afterApP*(parseFloat(a.pct||0)/100):parseFloat(a.rate||0)*parseFloat(a.hrs||0);});
    var instAmtP=afterApP-prTotalP;
    var instName=(document.getElementById('invFromName')||{}).value||'Installer';
    h+='<div style="border-top:2px dashed #ccc;margin:8px 0 4px;padding-top:8px">'
      +'<div style="font-size:10px;font-weight:700;color:#555;margin-bottom:4px">PAYMENT DISTRIBUTION'
      +(prListP.length?' <span style="font-weight:400;color:#999;font-size:9px">Partner % after apprentice pay</span>':'')+'</div>';
    h+='<table style="width:100%;border-collapse:collapse;margin-bottom:4px"><thead><tr style="background:#eee">'
      +'<th style="text-align:left;padding:3px 5px;font-size:9px">NAME / ROLE</th>'
      +'<th style="text-align:left;padding:3px 5px;font-size:9px">RATE</th>'
      +'<th style="text-align:right;padding:3px 5px;font-size:9px">AMOUNT</th></tr></thead><tbody>';
    var distRowsP=[];
    apListP.forEach(function(a){
      var amt=a.type==='pct'?subtotal*(parseFloat(a.pct||0)/100):parseFloat(a.rate||0)*parseFloat(a.hrs||0);
      var rs=a.type==='pct'?(a.pct+'% of subtotal'):('$'+(a.rate||0)+'/hr × '+(a.hrs||0)+'h');
      distRowsP.push({name:esc(a.name||'—'),role:'Apprentice',color:'#0891b2',rs:rs,amt:amt});
    });
    prListP.forEach(function(a){
      var amt=a.type==='pct'?afterApP*(parseFloat(a.pct||0)/100):parseFloat(a.rate||0)*parseFloat(a.hrs||0);
      var rs=a.type==='pct'?(a.pct+'% of taxable'):('$'+(a.rate||0)+'/hr × '+(a.hrs||0)+'h');
      distRowsP.push({name:esc(a.name||'—'),role:'Partner',color:'#7c3aed',rs:rs,amt:amt});
    });
    distRowsP.push({name:esc(instName),role:'Installer',color:'#16a34a',rs:'Remainder',amt:instAmtP});
    distRowsP.forEach(function(row,i){
      var bg=i%2===0?'#f8f8f8':'#fff';
      h+='<tr style="background:'+bg+'"><td style="padding:3px 5px">'+row.name+' <span style="font-size:9px;font-weight:700;color:'+row.color+'">'+row.role+'</span></td>'
        +'<td style="padding:3px 5px;color:#777;font-size:10px">'+row.rs+'</td>'
        +'<td style="text-align:right;padding:3px 5px;font-weight:600">'+fmt(row.amt)+'</td></tr>';
    });
    h+='<tr style="background:#1e3a2a;color:#fff"><td colspan="2" style="padding:4px 5px;font-size:10px;font-weight:700">TOTAL DISTRIBUTED (excl. HST)</td>'
      +'<td style="text-align:right;padding:4px 5px;font-weight:900">'+fmt(subtotal)+'</td></tr>'
      +'</tbody></table></div>';
  }
  h+='</div>';
  el.innerHTML=h;
}

function updateInvSummary(){renderInvAddedWOs();renderInvPreview();}
function invSelectAll(){var src=_invEditMode?_invEditLots:_pendingWOs;src.forEach(function(w){_invSelectedWOs.add(w._id||w._key||w.num||w.id||'');});renderInvWOList();renderInvAddedWOs();renderInvPreview();}
function invSelectNone(){_invSelectedWOs.clear();renderInvWOList();renderInvAddedWOs();renderInvPreview();}

function addInvApprent(){
  _invApprents.push({id:'ia'+(_invApId++),name:'',role:'apprentice',type:'hourly',rate:'',hrs:'',pct:''});
  renderInvApprents();
}
function removeInvApprent(id){
  _invApprents=_invApprents.filter(function(a){return a.id!==id;});
  renderInvApprents();renderInvPreview();
}
function renderInvApprents(){
  var c=document.getElementById('invApprentRows');if(!c)return;
  if(!_invApprents.length){c.innerHTML='<div style="font-size:11px;color:var(--tx3);text-align:center;padding:8px">Click Add to include a partner or apprentice.</div>';return;}
  c.innerHTML='';
  _invApprents.forEach(function(a){
    var row=document.createElement('div');
    var isPartner=(a.role==='partner');
    var accentColor=isPartner?'#7c3aed':'#0891b2';
    row.style.cssText='display:flex;flex-direction:column;gap:5px;padding:8px;background:#fafafa;border:1.5px solid '+(isPartner?'#ede9fe':'#e0f2fe')+';border-radius:7px;margin-bottom:5px';
    var isHourly=a.type!=='pct';
    // Row 1: Name (with autocomplete) + delete
    var r1=document.createElement('div');r1.style.cssText='display:flex;gap:6px;align-items:center';
    var nameInp=document.createElement('input');
    nameInp.placeholder='Name';nameInp.value=a.name||'';
    nameInp.setAttribute('list','crewNamesList');
    nameInp.style.cssText='flex:1;background:#fff;border:1px solid var(--bdr);border-radius:5px;padding:5px 8px;font-size:12px;outline:none';
    nameInp.addEventListener('input',(function(id){return function(){var ap=_invApprents.find(function(x){return x.id===id;});if(ap){ap.name=this.value;renderInvPreview();}}.bind(nameInp);})(a.id));
    var delBtn=document.createElement('button');delBtn.className='btn br bsm';delBtn.style.fontSize='10px';delBtn.textContent='✕';
    delBtn.addEventListener('click',(function(id){return function(){removeInvApprent(id);};})(a.id));
    r1.appendChild(nameInp);r1.appendChild(delBtn);
    // Row 2: Role toggle (Apprentice | Partner)
    var r2=document.createElement('div');r2.style.cssText='display:flex;gap:4px;align-items:center';
    var roleLabel=document.createElement('span');roleLabel.style.cssText='font-size:10px;color:var(--tx2);font-weight:600;margin-right:2px';roleLabel.textContent='Role:';
    r2.appendChild(roleLabel);
    var btnAp=document.createElement('button');
    btnAp.style.cssText='padding:3px 9px;border-radius:4px;border:1.5px solid #0891b2;cursor:pointer;font-size:10px;font-weight:700;background:'+(!isPartner?'#0891b2':'#fff')+';color:'+(!isPartner?'#fff':'#0891b2');
    btnAp.textContent='Apprentice';
    btnAp.addEventListener('click',(function(id){return function(){setApRole(id,'apprentice');};})(a.id));
    var btnPr=document.createElement('button');
    btnPr.style.cssText='padding:3px 9px;border-radius:4px;border:1.5px solid #7c3aed;cursor:pointer;font-size:10px;font-weight:700;background:'+(isPartner?'#7c3aed':'#fff')+';color:'+(isPartner?'#fff':'#7c3aed');
    btnPr.textContent='Partner';
    btnPr.addEventListener('click',(function(id){return function(){setApRole(id,'partner');};})(a.id));
    r2.appendChild(btnAp);r2.appendChild(btnPr);
    // Row 3: Pay type toggle ($/hr | % split) + value inputs
    var r3=document.createElement('div');r3.style.cssText='display:flex;gap:4px;align-items:center';
    var btnHr=document.createElement('button');
    btnHr.style.cssText='padding:3px 8px;border-radius:4px;border:1px solid var(--bdr);cursor:pointer;font-size:10px;font-weight:600;background:'+(isHourly?'var(--GD)':'#fff')+';color:'+(isHourly?'#fff':'var(--tx2)');
    btnHr.textContent='$/hr';
    btnHr.addEventListener('click',(function(id){return function(){setApType(id,'hourly');};})(a.id));
    var btnPct=document.createElement('button');
    btnPct.style.cssText='padding:3px 8px;border-radius:4px;border:1px solid var(--bdr);cursor:pointer;font-size:10px;font-weight:600;background:'+(isHourly?'#fff':'var(--GD)')+';color:'+(isHourly?'var(--tx2)':'#fff');
    btnPct.textContent='% split';
    btnPct.addEventListener('click',(function(id){return function(){setApType(id,'pct');};})(a.id));
    r3.appendChild(btnHr);r3.appendChild(btnPct);
    if(isHourly){
      var rateInp=document.createElement('input');rateInp.type='number';rateInp.min='0';rateInp.placeholder='Rate $/hr';rateInp.value=a.rate||'';
      rateInp.style.cssText='flex:1;background:#fff;border:1px solid var(--bdr);border-radius:5px;padding:5px 8px;font-size:12px;outline:none';
      rateInp.addEventListener('input',(function(id){return function(){var ap=_invApprents.find(function(x){return x.id===id;});if(ap){ap.rate=this.value;renderInvPreview();}}.bind(rateInp);})(a.id));
      var hrsInp=document.createElement('input');hrsInp.type='number';hrsInp.min='0';hrsInp.placeholder='Hours';hrsInp.value=a.hrs||'';
      hrsInp.style.cssText='flex:1;background:#fff;border:1px solid var(--bdr);border-radius:5px;padding:5px 8px;font-size:12px;outline:none';
      hrsInp.addEventListener('input',(function(id){return function(){var ap=_invApprents.find(function(x){return x.id===id;});if(ap){ap.hrs=this.value;renderInvPreview();}}.bind(hrsInp);})(a.id));
      r3.appendChild(rateInp);r3.appendChild(hrsInp);
    } else {
      var pctInp=document.createElement('input');pctInp.type='number';pctInp.min='0';pctInp.max='100';pctInp.placeholder='% of invoice';pctInp.value=a.pct||'';
      pctInp.style.cssText='flex:1;background:#fff;border:1px solid var(--bdr);border-radius:5px;padding:5px 8px;font-size:12px;outline:none';
      pctInp.addEventListener('input',(function(id){return function(){var ap=_invApprents.find(function(x){return x.id===id;});if(ap){ap.pct=this.value;renderInvPreview();}}.bind(pctInp);})(a.id));
      r3.appendChild(pctInp);
    }
    row.appendChild(r1);row.appendChild(r2);row.appendChild(r3);
    c.appendChild(row);
  });
}
function setApRole(id,role){
  var ap=_invApprents.find(function(x){return x.id===id;});
  if(ap){ap.role=role;renderInvApprents();renderInvPreview();}
}
function setApType(id,type){
  var ap=_invApprents.find(function(x){return x.id===id;});
  if(ap){ap.type=type;renderInvApprents();renderInvPreview();}
}


async function buildInvoicePDF() {
  if (!_invSelectedWOs.size) { alert('Select at least one work order.'); return; }
  var source = _invEditMode ? _invEditLots : _pendingWOs;
  var wos = source.filter(function(w) { return _invSelectedWOs.has(w._id || w._key || w.num || w.id || ''); });
  if (!wos.length) { alert('No matching work orders found.'); return; }
  var btn = document.getElementById('genInvBtn');
  btn.disabled = true; btn.textContent = 'Building…';
  try {
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) { alert('PDF library not loaded yet. Please wait a moment and try again.'); btn.disabled = false; btn.textContent = '⬇ Generate Invoice'; return; }
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    var W = 612, M = 36, CW = W - 2 * M;
    var fc = function() { pdf.setFillColor.apply(pdf, arguments); };
    var tc = function() { pdf.setTextColor.apply(pdf, arguments); };
    var DC = function() { pdf.setDrawColor.apply(pdf, arguments); };
    var tx = function(s, x, y, sz, fnt, col, align) {
      if (isNaN(x) || isNaN(y)) return;
      pdf.setFontSize(sz || 9); pdf.setFont('helvetica', fnt || 'normal');
      if (col) pdf.setTextColor(col[0], col[1], col[2]); else pdf.setTextColor(0, 0, 0);
      pdf.text(String(s || ''), x, y, align ? { align: align } : {});
    };
    var fR = function(x, y, w, h, col) { if (isNaN(x) || isNaN(y)) return; pdf.setFillColor(col[0], col[1], col[2]); pdf.rect(x, y, w, h, 'F'); };
    var sR = function(x, y, w, h, lw, col) { var c = col || [120, 120, 120]; pdf.setDrawColor(c[0], c[1], c[2]); pdf.setLineWidth(lw || 0.4); pdf.rect(x, y, w, h, 'S'); };
    var ln = function(x1, y1, x2, y2, lw, col) { var c = col || [180, 180, 180]; pdf.setDrawColor(c[0], c[1], c[2]); pdf.setLineWidth(lw || 0.3); pdf.line(x1, y1, x2, y2); };
    var fmt = function(n) { return '$' + parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
    var pf2 = function(n) { return parseFloat(n || 0).toFixed(2); };
    var installerName = (document.getElementById('invFromName').value || '').trim();
    var billTo = (document.getElementById('invBillTo').value || '').trim();
    var today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    var invNum = 'INV-' + String(Date.now()).slice(-6);
    var y = M;
    tx('ECO AIR', M, y + 14, 14, 'bold', [0, 0, 0]);
    tx('HST: 70246 4132 RT0001', M, y + 28, 8, 'normal', [60, 60, 60]);
    tx('20 Sixth Street', M, y + 38, 8, 'normal', [60, 60, 60]);
    tx('Etobicoke, ON M8V 3A2', M, y + 48, 8, 'normal', [60, 60, 60]);
    tx('(289) 259-7939', M, y + 58, 8, 'normal', [60, 60, 60]);
    tx('INVOICE', W - M, y + 14, 20, 'bold', [0, 0, 0], 'right');
    tx('DATE:', W - M - 110, y + 28, 8, 'bold', [80, 80, 80]); tx(today, W - M, y + 28, 8, 'normal', [0, 0, 0], 'right');
    tx('INVOICE#:', W - M - 110, y + 38, 8, 'bold', [80, 80, 80]); tx(invNum, W - M, y + 38, 8, 'normal', [0, 0, 0], 'right');
    if (installerName) { tx('CREW:', W - M - 110, y + 48, 8, 'bold', [80, 80, 80]); tx(installerName, W - M, y + 48, 8, 'bold', [0, 0, 0], 'right'); }
    y += 68;
    pdf.setDrawColor(0, 0, 0); pdf.setLineWidth(0.5); pdf.line(M, y, W - M, y); y += 8;
    tx('INVOICE TO:', M, y + 10, 8, 'bold', [0, 0, 0]);
    if (billTo) {
      var btLines = billTo.split('\n').slice(0, 4);
      btLines.forEach(function(line, i) { tx(line, M, y + 22 + i * 11, 8, 'normal', [0, 0, 0]); });
      y += 22 + btLines.length * 11 + 8;
    } else { y += 30; }
    pdf.setDrawColor(0, 0, 0); pdf.setLineWidth(0.5); pdf.line(M, y, W - M, y); y += 8;
    var cols = [
      { l: '#', x: M, w: 24, r: false }, { l: 'BUILDER', x: M + 24, w: 130, r: false },
      { l: 'PROJECT', x: M + 154, w: 100, r: false }, { l: 'LOT', x: M + 254, w: 48, r: false },
      { l: 'LAYOUT', x: M + 302, w: 58, r: false }, { l: 'MODEL', x: M + 360, w: 78, r: false },
      { l: 'TOTAL', x: M + 438, w: CW - 438, r: true }
    ];
    var TH = 12, RH = 15;
    fR(M, y, CW, TH, [210, 210, 210]); sR(M, y, CW, TH, 0.5, [80, 80, 80]);
    cols.forEach(function(c) { if (c.r) tx(c.l, c.x + c.w - 3, y + TH * 0.75, 6.5, 'bold', [0, 0, 0], 'right'); else tx(c.l, c.x + 4, y + TH * 0.75, 6.5, 'bold', [0, 0, 0]); });
    cols.slice(1).forEach(function(c) { ln(c.x, y, c.x, y + TH, 0.4, [120, 120, 120]); });
    y += TH;
    var bTot = wos.reduce(function(s, w) { return s + _invGetTotal(w); }, 0);
    for (var ri = 0; ri < 20; ri++) {
      var r = wos[ri];
      if (ri % 2 === 0) fR(M, y, CW, RH, [248, 248, 248]);
      sR(M, y, CW, RH, 0.25, [200, 200, 200]);
      cols.slice(1).forEach(function(c) { ln(c.x, y, c.x, y + RH, 0.25); });
      var ry = y + RH * 0.7;
      tx(String(ri + 1), M + 3, ry, 8, 'normal', [100, 100, 100]);
      if (r) {
        var rs = r.snapshot || {};
        tx((r.builder || rs.fb || '').substring(0, 18), cols[1].x + 4, ry, 8, 'normal', [0, 0, 0]);
        tx((r.site || rs.fp || '').substring(0, 15), cols[2].x + 4, ry, 8, 'normal', [0, 0, 0]);
        tx((r.lot || rs.fl || '').substring(0, 7), cols[3].x + 4, ry, 8, 'normal', [0, 0, 0]);
        tx((r.layout || rs.fla || '').substring(0, 8), cols[4].x + 4, ry, 8, 'normal', [0, 0, 0]);
        tx((r.model || rs.fm || '').substring(0, 11), cols[5].x + 4, ry, 8, 'normal', [0, 0, 0]);
        tx(fmt(_invGetTotal(r)), cols[6].x + cols[6].w - 3, ry, 8, 'bold', [0, 0, 0], 'right');
      }
      y += RH;
    }
    if(_invCustomLines.length){
      _invCustomLines.forEach(function(line,ci){
        if(ci%2===0)fR(M,y,CW,RH,[240,253,244]);
        sR(M,y,CW,RH,0.25,[200,200,200]);
        var cry=y+RH*0.7;
        tx(line.desc||'—',cols[1].x+4,cry,8,'normal',[60,60,60]);
        tx(fmt(line.total||0),cols[6].x+cols[6].w-3,cry,8,'bold',[0,0,0],'right');
        y+=RH;
      });
      bTot+=_invCustomLines.reduce(function(s,l){return s+(l.total||0);},0);
    }
    sR(M, y, CW, TH, 0.5, [80, 80, 80]);
    tx(fmt(bTot), cols[6].x + cols[6].w - 3, y + TH * 0.75, 8, 'bold', [0, 0, 0], 'right');
    y += TH + 10;
    y += 10;
    var apFilled2 = _invApprents.filter(function(p) { return p.name || p.rate || p.hrs || p.pct; });
    var apList2 = apFilled2.filter(function(p) { return p.role !== 'partner'; });
    var prList2 = apFilled2.filter(function(p) { return p.role === 'partner'; });
    var apTotal2 = 0;
    apList2.forEach(function(p) { apTotal2 += p.type === 'pct' ? bTot * (parseFloat(p.pct || 0) / 100) : parseFloat(p.hrs || 0) * parseFloat(p.rate || 0); });
    var taxable2 = bTot - apTotal2;
    var hst = parseFloat((taxable2 * 0.13).toFixed(2)), grand = parseFloat((bTot + hst).toFixed(2));
    var afterAp2 = taxable2;
    var prTotal2 = 0;
    prList2.forEach(function(p) { prTotal2 += p.type === 'pct' ? afterAp2 * (parseFloat(p.pct || 0) / 100) : parseFloat(p.hrs || 0) * parseFloat(p.rate || 0); });
    var instAmt2 = afterAp2 - prTotal2;
    var TTW = 240, TTX = M + CW - TTW;
    var totRows2 = [['Subtotal:', fmt(bTot), false]];
    if (apTotal2 > 0) { totRows2.push(['Less Apprentice Pay:', '- ' + fmt(apTotal2), false]); totRows2.push(['Taxable Amount:', fmt(taxable2), false]); }
    totRows2.push(['HST (13%):', fmt(hst), false]);
    totRows2.push(['INVOICE TOTAL:', fmt(grand), true]);
    totRows2.forEach(function(row) {
      var lbl = row[0], val = row[1], bold = row[2];
      if (bold) fR(TTX, y, TTW, TH, [210, 210, 210]);
      sR(TTX, y, TTW, TH, bold ? 0.6 : 0.3, [80, 80, 80]);
      ln(TTX + TTW * 0.5, y, TTX + TTW * 0.5, y + TH, bold ? 0.6 : 0.3, [80, 80, 80]);
      tx(lbl, TTX + TTW * 0.5 - 4, y + TH * 0.75, bold ? 9 : 8, bold ? 'bold' : 'normal', [0, 0, 0], 'right');
      tx(val, TTX + TTW - 4, y + TH * 0.75, bold ? 9 : 8, bold ? 'bold' : 'normal', [0, 0, 0], 'right');
      y += TH;
    });
    // Payment distribution
    if (apFilled2.length) {
      y += 12;
      pdf.setDrawColor(180, 180, 180); pdf.setLineWidth(0.5); pdf.setLineDash([3, 3], 0); pdf.line(M, y, W - M, y); pdf.setLineDash([], 0);
      y += 10;
      tx('PAYMENT DISTRIBUTION', M, y, 8, 'bold', [60, 60, 60]);
      y += 10;
      // ── BLOCK 1: Apprentice Pay (no HST — paid from pre-tax subtotal) ──
      if (apList2.length) {
        fR(M, y, CW, TH, [215, 235, 250]); sR(M, y, CW, TH, 0.4, [100, 130, 170]);
        tx('APPRENTICE PAY', M + 4, y + TH * 0.75, 6.5, 'bold', [20, 60, 120]);
        tx('RATE', M + 220 + 4, y + TH * 0.75, 6.5, 'bold', [20, 60, 120]);
        tx('AMOUNT', W - M - 3, y + TH * 0.75, 6.5, 'bold', [20, 60, 120], 'right');
        ln(M + 220, y, M + 220, y + TH, 0.3, [100, 130, 170]); ln(W - M - 80, y, W - M - 80, y + TH, 0.3, [100, 130, 170]);
        y += TH;
        apList2.forEach(function(p, ri) {
          var amt = p.type === 'pct' ? bTot * (parseFloat(p.pct || 0) / 100) : parseFloat(p.hrs || 0) * parseFloat(p.rate || 0);
          var rs = p.type === 'pct' ? (p.pct + '% of subtotal') : ('$' + pf2(p.rate || 0) + '/hr x ' + (p.hrs || 0) + ' hrs');
          if (ri % 2 === 0) fR(M, y, CW, RH, [245, 250, 255]);
          sR(M, y, CW, RH, 0.2, [200, 215, 235]);
          ln(M + 220, y, M + 220, y + RH, 0.2, [180, 200, 225]); ln(W - M - 80, y, W - M - 80, y + RH, 0.2, [180, 200, 225]);
          tx((p.name || '—') + ' (Apprentice)', M + 4, y + RH * 0.7, 8, 'normal', [0, 0, 0]);
          tx(rs, M + 220 + 4, y + RH * 0.7, 8, 'normal', [80, 80, 80]);
          tx(fmt(amt), W - M - 3, y + RH * 0.7, 8, 'bold', [0, 0, 0], 'right');
          y += RH;
        });
        fR(M, y, CW, TH + 1, [170, 210, 240]); sR(M, y, CW, TH + 1, 0.4, [80, 130, 190]);
        tx('Total Apprentice Pay (excl. HST)', M + 4, y + (TH + 1) * 0.75, 7.5, 'bold', [10, 50, 110]);
        tx(fmt(apTotal2), W - M - 4, y + (TH + 1) * 0.75, 8, 'bold', [10, 50, 110], 'right');
        y += TH + 1;
        y += 10; // gap between blocks
      }
      // ── BLOCK 2: Partner & Installer Distribution (each with their HST share) ──
      // Columns: NAME(160) | RATE(100) | SUBTOTAL(90) | HST 13%(90) | TOTAL(100)
      var xN2=M,xR2=M+160,xS2=M+260,xH2=M+350,xT2=M+440,xEnd2=M+CW;
      fR(M, y, CW, TH, [220, 230, 220]); sR(M, y, CW, TH, 0.4, [80, 130, 80]);
      tx('NAME / ROLE', xN2 + 4, y + TH * 0.75, 6.5, 'bold', [20, 70, 20]);
      tx('RATE', xR2 + 4, y + TH * 0.75, 6.5, 'bold', [20, 70, 20]);
      tx('SUBTOTAL', xS2 + (xH2 - xS2) - 3, y + TH * 0.75, 6.5, 'bold', [20, 70, 20], 'right');
      tx('HST (13%)', xH2 + (xT2 - xH2) - 3, y + TH * 0.75, 6.5, 'bold', [20, 70, 20], 'right');
      tx('TOTAL', xT2 + (xEnd2 - xT2) - 3, y + TH * 0.75, 6.5, 'bold', [20, 70, 20], 'right');
      ln(xR2, y, xR2, y + TH, 0.3, [80, 150, 80]); ln(xS2, y, xS2, y + TH, 0.3, [80, 150, 80]);
      ln(xH2, y, xH2, y + TH, 0.3, [80, 150, 80]); ln(xT2, y, xT2, y + TH, 0.3, [80, 150, 80]);
      y += TH;
      var prRows2 = [];
      prList2.forEach(function(p) {
        var sub = p.type === 'pct' ? afterAp2 * (parseFloat(p.pct || 0) / 100) : parseFloat(p.hrs || 0) * parseFloat(p.rate || 0);
        var pHst2 = parseFloat((sub * 0.13).toFixed(2));
        var rs = p.type === 'pct' ? (p.pct + '% of taxable') : ('$' + pf2(p.rate || 0) + '/hr x ' + (p.hrs || 0) + ' hrs');
        prRows2.push({ name: (p.name || '—') + ' (Partner)', rs: rs, sub: sub, pHst: pHst2, tot: parseFloat((sub + pHst2).toFixed(2)) });
      });
      var iHst2 = parseFloat((instAmt2 * 0.13).toFixed(2));
      prRows2.push({ name: (installerName || 'Installer') + ' (Owner)', rs: 'Remainder after partners', sub: instAmt2, pHst: iHst2, tot: parseFloat((instAmt2 + iHst2).toFixed(2)) });
      prRows2.forEach(function(row, ri) {
        if (ri % 2 === 0) fR(M, y, CW, RH, [248, 252, 248]);
        sR(M, y, CW, RH, 0.2, [200, 220, 200]);
        ln(xR2, y, xR2, y + RH, 0.2, [180, 210, 180]); ln(xS2, y, xS2, y + RH, 0.2, [180, 210, 180]);
        ln(xH2, y, xH2, y + RH, 0.2, [180, 210, 180]); ln(xT2, y, xT2, y + RH, 0.2, [180, 210, 180]);
        var ry2 = y + RH * 0.7;
        tx(row.name, xN2 + 4, ry2, 8, 'normal', [0, 0, 0]);
        tx(row.rs, xR2 + 4, ry2, 7.5, 'normal', [80, 80, 80]);
        tx(fmt(row.sub), xS2 + (xH2 - xS2) - 3, ry2, 8, 'normal', [0, 0, 0], 'right');
        tx(fmt(row.pHst), xH2 + (xT2 - xH2) - 3, ry2, 8, 'normal', [40, 100, 40], 'right');
        tx(fmt(row.tot), xT2 + (xEnd2 - xT2) - 3, ry2, 8, 'bold', [0, 0, 0], 'right');
        y += RH;
      });
      fR(M, y, CW, TH + 2, [30, 56, 36]); sR(M, y, CW, TH + 2, 0.5, [20, 40, 25]);
      tx('TOTAL DISTRIBUTED (incl. HST)', M + 4, y + (TH + 2) * 0.75, 8, 'bold', [255, 255, 255]);
      tx(fmt(grand), W - M - 4, y + (TH + 2) * 0.75, 9, 'bold', [255, 255, 255], 'right');
      y += TH + 2;
    }
    var filename = 'Invoice ' + invNum + '.pdf';
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      var dataUri = pdf.output('datauristring');
      var win = window.open('', '_blank');
      if (win) { win.document.write('<html><head><title>' + filename + '</title></head><body style="margin:0"><embed width="100%" height="100%" src="' + dataUri + '" type="application/pdf"></body></html>'); win.document.close(); }
      else window.location.href = dataUri;
    } else {
      pdf.save(filename);
      // Download each full WO breakdown PDF using the WO iframe
      setTimeout(function(){ _batchWOCapture(wos); }, 800);
    }
    if (DB) {
      // Build payees with pre-computed amounts for staff tracking
      var apFilled3=_invApprents.filter(function(a){return a.name&&a.name.trim();});
      var apList3=apFilled3.filter(function(p){return p.role!=='partner';});
      var prList3=apFilled3.filter(function(p){return p.role==='partner';});
      var apTotal3=0;
      apList3.forEach(function(p){apTotal3+=p.type==='pct'?bTot*(parseFloat(p.pct||0)/100):parseFloat(p.hrs||0)*parseFloat(p.rate||0);});
      var afterAp3=bTot-apTotal3;
      var payees3=[];
      apList3.forEach(function(p){
        var amt=p.type==='pct'?bTot*(parseFloat(p.pct||0)/100):parseFloat(p.hrs||0)*parseFloat(p.rate||0);
        payees3.push({name:p.name.trim(),type:'apprent',val:p.rate||p.pct||'',hrs:p.hrs||'',amount:amt});
      });
      prList3.forEach(function(p){
        var amt=p.type==='pct'?afterAp3*(parseFloat(p.pct||0)/100):parseFloat(p.hrs||0)*parseFloat(p.rate||0);
        payees3.push({name:p.name.trim(),type:'partner',val:p.pct||p.rate||'',hrs:p.hrs||'',amount:amt});
      });
      var invRecord = {
        _savedAt: new Date().toISOString(), status: 'active', installer: installerName, billTo: billTo,
        lotTotal: bTot,
        lots: wos.map(function(w) { return { type: w.type, builder: w.builder, site: w.site, project: w.site, lot: w.lot, installer: w.installer, total: _invGetTotal(w) }; }),
        customLines: _invCustomLines.map(function(l){return {desc:l.desc,total:l.total};}),
        subtotal: bTot, hst: hst, total: grand,
        payees: payees3,
        apprentices: _invApprents.map(function(a) { return { name: a.name, role: a.role||'apprentice', type: a.type||'hourly', rate: a.rate, hrs: a.hrs, pct: a.pct }; })
      };
      if (_invEditMode && _invEditRecord && _invEditRecord._id) {
        DB.collection('invoices').doc(_invEditRecord._id).update(Object.assign({ _updatedAt: new Date().toISOString() }, invRecord)).catch(function(e) { console.warn('inv update:', e.message); });
      } else {
        var newInvId = 'inv_' + Date.now();
        DB.collection('invoices').doc(newInvId).set(Object.assign({ _key: newInvId }, invRecord)).catch(function(e) { console.warn('inv save:', e.message); });
        autoRegisterStaff(invRecord);
        Array.from(_invSelectedWOs).forEach(function(lotId) {
          DB.collection('saved_workorder').doc(lotId).update({ status: 'invoiced' }).catch(function(e) { console.warn('saved_workorder invoiced:', e.message); });
          DB.collection('pending_lots').doc(lotId).update({ status: 'invoiced' }).catch(function(e) { });
        });
        _pendingWOs = _pendingWOs.filter(function(w) { return !_invSelectedWOs.has(w._id || w._key || w.num || w.id || ''); });
        renderPendingWOs();
      }
      _invSelectedWOs.clear();
      if (_invEditMode) { exitInvEditMode(); } else { loadInvoiceBuilderWOs(); }
    }
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:10px 20px;border-radius:8px;font-weight:600;z-index:9999;font-size:13px';
    toast.textContent = _invEditMode ? 'Invoice updated ✓' : 'Invoice downloaded ✓';
    document.body.appendChild(toast); setTimeout(function() { toast.remove(); }, 3000);
  } catch (err) {
    console.error('Invoice PDF error:', err);
    alert('Invoice error: ' + (err.message || err));
  }
  btn.disabled = false; btn.textContent = '⬇ Generate Invoice';
}

