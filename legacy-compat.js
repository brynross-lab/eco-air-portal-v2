/* Eco Air Portal v2 - pieces carried over unchanged from the original portal so the
   data written to Firestore is identical. Each block names where it came from. */

// ── Union price rates defaults and migration (portal lines 2367-2435) ──
var _DEFAULT_PRICES={
  effectiveDate:'May 1, 2026',
  rates:{standard:{rr:21.68,rb:28.82},oneof:{rr:31.76,rb:31.76},custom:{rr:31.76,rb:31.76},hiv:{rr:29.00,rb:31.17}},
  vehPct:3.5,hivVehPct:3.5,
  rough_ra:[{n:'First Floor R/A',p:21.68,r:1},{n:'Second Floor R/A',p:34.22},{n:'Third Floor R/A',p:65.26},{n:'High Walls',p:3.54},{n:'2nd Floor Single R/A (excess joist)',p:62.06},{n:'3rd Floor Single R/A (excess joist)',p:120.86},{n:'Web Joist Extra 1.5x per R/A',p:10.84}],
  rough_du:[{n:'Metal Strips (both sides R/A boot)',p:3.22},{n:'Standard Stack <=7" R/A or S/A',p:32.27,stk:1},{n:'8"-10" R/A or S/A round duct',p:48.41,stk:1},{n:'Horizontal Duct R/A or S/A',p:34.46,stk:1},{n:'Vertical Duct R/A or S/A',p:40.21,stk:1},{n:'Wall Boot',p:5.00},{n:'S/A Holes',p:5.20},{n:'Garage Stacks',p:42.60},{n:'Joist Lining in Garage',p:26.77}],
  rough_vl:[{n:'Bath Exhaust (1 Storey)',p:25.27},{n:'Bath Exhaust (2 Storey)',p:50.54},{n:'Kitchen Exhaust (1 Storey)',p:25.27},{n:'Kitchen Exhaust (2 Storey)',p:50.54},{n:'Dryer Exhaust (1st Floor)',p:25.27},{n:'Dryer Exhaust (2nd Floor)',p:50.54},{n:'Vent Holes',p:5.20},{n:'Vents through Garage',p:28.71}],
  rough_vr:[{n:'Thimbles / Plates',p:2.66},{n:'Vents over 7"',p:37.91},{n:'HRV 1st Floor',p:31.59},{n:'HRV 2nd Floor',p:38.73},{n:'HRV Holes w/ Sleeve',p:9.62},{n:'Runs off Duct',p:28.82},{n:'Tape Duct Work',p:6.49}],
  rough_o:[{id:'ro1',n:'Over 9 Feet',s:'10%',pct:10},{id:'ro2',n:'Cover Holes',s:'$9.62',fl:9.62},{id:'ro3',n:'Delivery',s:'$57.97',fl:57.97},{id:'ro4',n:'Tape S/A + R/A',s:'$2.82/run',pr:2.82,stk:true}],
  bsmt_sa:[{n:'Basement S/A',p:28.82,r:1},{n:'First Floor S/A',p:28.82,r:1},{n:'Second Floor S/A',p:28.82,r:1},{n:'Third Floor S/A',p:28.82,r:1},{n:'Stack Duct S/A',p:28.82,r:1},{n:'Low Walls S/A',p:14.41,r:1},{n:'Plenum Extension',p:17.49}],
  bsmt_ra:[{n:'Basement R/A',p:28.82,r:1},{n:'First Floor R/A',p:28.82,r:1},{n:'Second Floor R/A',p:28.82,r:1},{n:'Third Floor R/A',p:28.82,r:1},{n:'Stack Duct R/A',p:28.82,r:1},{n:'Low Walls R/A',p:14.41,r:1},{n:'Split',p:28.82},{n:'Jumper Box',p:28.82},{n:'Drop Extension',p:17.49}],
  bsmt_el:[{n:'Dryer Vents',p:23.51},{n:'7" + Runs',p:14.41},{n:'Bathroom Fan',p:23.51},{n:'Hang HRV',p:50.23},{n:'HRV Runs',p:30.99},{n:'Additional Zones (Hi-V)',p:31.84},{n:'Air Cleaner Cabinet',p:28.82},{n:'Return Mount Flex',p:46.46},{n:'Canvas Connections',p:28.82,r:1}],
  bsmt_er:[{n:'High Basement (per)',p:4.03},{n:'Zone System',p:2.95},{n:'Snap Fittings',p:17.49},{n:'Cut Holes',p:4.84},{n:'Perfect Platform',p:53.00},{n:'Level Change',p:28.82},{n:'Return Air Box for AC',p:35.61},{n:'Low Level Runs',p:2.95},{n:'Installation of Cooling Coil',p:60.93}],
  bsmt_o:[{id:'bo1',n:'Furnace Set Up',s:'$110.67',fl:110.67},{id:'bo2',n:'Cover Holes',s:'$6.60',fl:6.60},{id:'bo3',n:'Scrap Pick Up',s:'$15.61',fl:15.61},{id:'bo4',n:'Tape',s:'$6.65/run',pr:6.65}],
  hiv_trunk:[{n:'Vertical Riser ≤7"',p:35.25},{n:'Vertical Riser ≤7" w/Garage',p:42.71},{n:'Vertical Riser 8-10"',p:52.88},{n:'Vertical Riser 8-10" w/Garage',p:64.07},{n:'Additional Branch ≤7"',p:33.19},{n:'Additional Branch ≤7" w/Garage',p:39.82},{n:'Hanger Rods',p:31.85}],
  hiv_del:[{n:'Deliver (No Flex)',p:57.97},{n:'Deliver (With Flex)',p:115.95},{n:'Distribute All',p:33.60},{n:'Distribute Excl. Flex',p:25.22}],
  hiv_wall:[{n:'Single Hole Wall Box',p:9.64},{n:'Double/Triple Hole Wall Box',p:14.47},{n:'Install Box',p:10.31}],
  hiv_flex:[{n:'Flex ≤3" per Run',p:31.17},{n:'Cut Floor Holes',p:5.22},{n:'Cut Joist',p:9.28},{n:'Low Wall Flex',p:36.51},{n:'Return/Mount in Bulkhead',p:46.46}],
  hiv_bsmt:[{n:'Flex ≤3"',p:31.17},{n:'Low Wall Flex',p:36.51},{n:'Air Handler Setup',p:173.92},{n:'Air Handler (No Handler)',p:161.28},{n:'Return for Handler',p:76.44},{n:'Add. S/A Trunk ≤6"',p:25.48},{n:'Add. S/A Trunk >6"',p:31.84},{n:'Zoned per Zone',p:31.84},{n:"9' Basement",p:79.64},{n:"Garage Runs 9'",p:32.22},{n:'Riser Connection ≤6"',p:35.61},{n:'Riser Connection >6"',p:53.44},{n:'R/A Box A/C',p:35.61},{n:'Handler from Straps',p:46.46}],
  hiv_add:[{n:'Fan Housing',p:32.97},{n:'Double Fan Housing',p:34.15},{n:'Pickup/Balance Box',p:23.90},{n:'Dryer Booster',p:32.97},{n:'Lint Trap',p:33.32}],
  hiv_o:[]
};

function _migratePrices(p){
  var dirty=false;
  // Migrate Over 9 Feet from old pr:0.10 per-run to pct:10 percentage
  if(p.rough_o&&p.rough_o[0]&&p.rough_o[0].id==='ro1'&&p.rough_o[0].pct==null){
    p.rough_o[0]={id:'ro1',n:'Over 9 Feet',s:'10%',pct:10};dirty=true;
  }
  // Migrate missing Hi-V sections
  var D=_DEFAULT_PRICES;
  if(!p.hiv_trunk){p.hiv_trunk=D.hiv_trunk;dirty=true;}
  if(!p.hiv_del){p.hiv_del=D.hiv_del;dirty=true;}
  if(!p.hiv_wall){p.hiv_wall=D.hiv_wall;dirty=true;}
  if(!p.hiv_flex){p.hiv_flex=D.hiv_flex;dirty=true;}
  if(!p.hiv_bsmt){p.hiv_bsmt=D.hiv_bsmt;dirty=true;}
  if(!p.hiv_add){p.hiv_add=D.hiv_add;dirty=true;}
  if(!p.hiv_o){p.hiv_o=D.hiv_o;dirty=true;}
  // Remove incorrect r:1 from fixed-price items (they were being overridden by rate tier)
  var fixR1=[
    {arr:'rough_ra',names:['Second Floor R/A','Third Floor R/A','2nd Floor Single R/A (excess joist)','3rd Floor Single R/A (excess joist)','Web Joist Extra 1.5x per R/A']},
    {arr:'rough_du',names:['Standard Stack <=7" R/A or S/A','8"-10" R/A or S/A round duct','Horizontal Duct R/A or S/A','Vertical Duct R/A or S/A']},
    {arr:'rough_vr',names:['Runs off Duct']}
  ];
  // Add stk:1 to duct items that drive run count
  var stkNames=['Standard Stack <=7" R/A or S/A','8"-10" R/A or S/A round duct','Horizontal Duct R/A or S/A','Vertical Duct R/A or S/A'];
  if(p.rough_du) p.rough_du.forEach(function(it){if(stkNames.indexOf(it.n)>=0&&!it.stk){it.stk=1;dirty=true;}});
  // Add stk:true to Tape option
  if(p.rough_o) p.rough_o.forEach(function(it){if(it.id==='ro4'&&!it.stk){it.stk=true;dirty=true;}});
  fixR1.forEach(function(fix){
    if(!p[fix.arr])return;
    p[fix.arr].forEach(function(it){
      if(fix.names.indexOf(it.n)>=0&&it.r){delete it.r;dirty=true;}
    });
  });
  // Add Canvas Connections to bsmt_el if missing
  if(p.bsmt_el&&!p.bsmt_el.find(function(x){return x.n==='Canvas Connections';})){
    p.bsmt_el.push({n:'Canvas Connections',p:28.82,r:1});dirty=true;
  }
  // Add Installation of Cooling Coil to bsmt_er if missing; remove from bsmt_o if present
  if(p.bsmt_er&&!p.bsmt_er.find(function(x){return x.n==='Installation of Cooling Coil';})){
    p.bsmt_er.push({n:'Installation of Cooling Coil',p:60.93});dirty=true;
  }
  if(p.bsmt_o){var coolingIdx=p.bsmt_o.findIndex(function(x){return x.id==='bo5'||x.n==='Installation of Cooling Coil';});if(coolingIdx>=0){p.bsmt_o.splice(coolingIdx,1);dirty=true;}}
  // Migrate oneof rates to custom rates (1.5× now applied to subtotal in calc)
  if(p.rates&&p.rates.oneof&&p.rates.oneof.rr!==31.76){p.rates.oneof={rr:31.76,rb:31.76};dirty=true;}
  if(dirty&&DB) DB.collection('meta').doc('prices').set(p).catch(function(){});
  return p;
}

// ── Measure sheet document shape (portal lines 2593-2623) ──
function _buildMeasureDoc(masterKey,flds,fullFormData){
  // Strip ALL undefined values — Firestore rejects undefined anywhere in the document
  var cleanForm=JSON.parse(JSON.stringify(fullFormData===undefined?{}:fullFormData));
  var doc={
    _key:masterKey,
    _savedAt:new Date().toISOString(),
    builder:flds.fbuilder||flds.fname||'Unknown Builder',
    site:flds.fsite||flds.flot||'General',
    label:masterKey,
    fmodel:flds.fmodel||'',
    lot:flds.flot||'',
    block:flds.fblock||'',
    unit:flds.funit||'',
    snapshot:{
      fmaster:masterKey,
      flot:flds.flot||'',
      fblock:flds.fblock||'',
      funit:flds.funit||'',
      fbuilder:flds.fbuilder||flds.fname||'',
      fname:flds.fname||'',
      fsite:flds.fsite||'',
      fmodel:flds.fmodel||'',
      fm:flds.fmodel||'',
      ffurnace:flds.ffurnace||'',
      fac:flds.fac||'',
      fdate:flds.fdate||'',
      _formData:cleanForm
    }
  };
  return JSON.parse(JSON.stringify(doc));
}

// ── Invoice side effects: calendar events and staff names (portal lines 5888-5957) ──
async function addInvoiceToCalendars(record){
  if(!DB)return;
  try{
    // Get invoice date from the lots' snapshot date field, or today
    var lots=record.batchData||record.lots||[];
    var invDate=null;
    for(var i=0;i<lots.length;i++){
      var snap=lots[i].snapshot||{};
      var d=snap.fd||snap.fdate||'';
      if(d){invDate=d;break;}
    }
    if(!invDate) invDate=new Date().toISOString().slice(0,10);

    // Collect all people on this invoice
    var people=[];
    var installer=getInvInstaller(record);
    if(installer) people.push(installer);
    (record.payees||[]).forEach(function(p){if(p.name&&p.name.trim())people.push(p.name.trim());});

    if(!people.length)return;

    // Save a calendar event for each person
    var eventBase={
      date:invDate,
      type:'invoice',
      title:'Invoice — '+(record.builder||lots[0]&&lots[0].builder||''),
      builder:record.builder||'',
      total:record.lotTotal||0,
      _savedAt:new Date().toISOString()
    };

    var staffSnap=await DB.collection('staff').get();
    var staffDocs=staffSnap.docs.map(function(d){return Object.assign({_id:d.id},d.data());});

    people.forEach(function(personName){
      // Find staff member by name match
      var staffMember=staffDocs.find(function(s){
        return (s.name||'').toLowerCase()===personName.toLowerCase();
      });
      var docId=staffMember?staffMember._id:personName.replace(/\s+/g,'_').toLowerCase();
      var event=Object.assign({},eventBase,{staffName:personName,staffId:docId});
      var eventKey='inv_'+invDate+'_'+docId+'_'+Date.now();
      DB.collection('calendar_events').doc(eventKey).set(event).catch(function(e){
        console.warn('Calendar event:',e.message);
      });
    });
  }catch(e){console.warn('addInvoiceToCalendars:',e.message);}
}

async function autoRegisterStaff(record){
  if(!DB)return;
  var toAdd=[];
  if(record.installer&&record.installer.trim()) toAdd.push({name:record.installer.trim(),role:'installer'});
  (record.payees||[]).forEach(function(p){
    if(!p.name||!p.name.trim())return;
    toAdd.push({name:p.name.trim(),role:p.type==='apprent'?'apprentice':'partner'});
  });
  if(!toAdd.length)return;

  try{
    var listsDoc=await DB.collection('meta').doc('staff_names').get();
    var existing=listsDoc.exists?(listsDoc.data().names||[]):[];
    var changed=false;
    toAdd.forEach(function(person){
      var found=existing.find(function(e){return e.name.toLowerCase()===person.name.toLowerCase();});
      if(!found){existing.push(person);changed=true;}
    });
    if(changed) await DB.collection('meta').doc('staff_names').set({names:existing});
  }catch(e){console.warn('Staff register:',e.message);}
}

// ── Installer name on an invoice (portal lines 6164-6173) ──
function getInvInstaller(inv){
  if(inv.installer&&inv.installer.trim()) return inv.installer.trim();
  var lots=inv.lots||inv.batchData||[];
  for(var i=0;i<lots.length;i++){
    if(lots[i].installer&&lots[i].installer.trim()&&lots[i].installer.trim()!=='—') return lots[i].installer.trim();
    var snap=lots[i].snapshot||{};
    if(snap.fi&&snap.fi.trim()) return snap.fi.trim();
  }
  return '';
}
