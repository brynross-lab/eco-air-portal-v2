/* Eco Air Portal v2 - Kirin Air measure form.
 * A second way to download a Master / Measure sheet: the same data, filled into Kirin Air
 * Systems' "HVAC Measurement Form" (forms/kirin-measure-form.pdf). It only reads the master;
 * nothing is saved and the Eco Air PDF is unchanged.
 *
 * Page 1 is Kirin's form with the header and every count it has a row for. Sizes the form doesn't
 * print go in its blank rows. Fittings (and anything that still doesn't fit) go on page 2,
 * because the form's fitting drawings are for sketching by hand.
 */
(function(){
var LIB=null,TEMPLATE=null;
function loadLib(){
  if(window.PDFLib)return Promise.resolve(window.PDFLib);
  if(LIB)return LIB;
  LIB=new Promise(function(ok,bad){var s=document.createElement('script');s.src='vendor/pdf-lib-1.17.1.min.js';
    s.onload=function(){ok(window.PDFLib);};s.onerror=function(){LIB=null;bad(new Error('Could not load the PDF maker.'));};document.head.appendChild(s);});
  return LIB;
}
function loadTemplate(){
  if(TEMPLATE)return TEMPLATE;
  TEMPLATE=fetch('forms/kirin-measure-form.pdf').then(function(r){if(!r.ok)throw new Error('Kirin form not found ('+r.status+').');return r.arrayBuffer();})
    .catch(function(e){TEMPLATE=null;throw e;});
  return TEMPLATE;
}

/* ---------- totals, same rules as the Eco Air measure sheet ---------- */
function n(v){return parseFloat(v)||0;}
function inch(v){return String(v==null?'':v).replace(/["”″\s]/g,'');}
function totals(items){
  var d={duct:{},blk:{},jl:{},pipe:{},elbow:{},boot:{},damper:{},tto:{},sto:{},cleat:{},misc:{},fittings:[]};
  var add=function(o,k,v){o[k]=Math.round(((o[k]||0)+v)*10)/10;};
  (items||[]).forEach(function(it){
    var q=parseInt(it.qty,10)||1;
    switch(it.type){
      case 'duct':add(d.duct,inch(it.v1)+'x'+inch(it.v2),n(it.v3)*q);break;
      case 'blockend':add(d.blk,inch(it.v1)+'x'+inch(it.v2),q);break;
      case 'pipe':add(d.pipe,inch(it.v1),n(it.v3)*q);break;
      case 'pipeblockend':add(d.misc,inch(it.v1)+'" pipe block end',q);break;
      case 'elbow':add(d.elbow,inch(it.v1),q);break;
      case 'boot':add(d.boot,inch(it.v1)+' '+(it.v2||'AB'),q);break;
      case 'takeoff':add((it.v2==='STO'?d.sto:d.tto),inch(it.v1),q);break;
      case 'fitting':d.fittings.push(it);break;
      case 'extra':{
        var v1=it.v1||'',v2=it.v2||'',v3=it.v3||'';
        if(v1==='Insulated Flex'&&v2)add(d.misc,inch(v2)+'" insulated flex',q);
        else if(/^S-Cleat$/i.test(v1))add(d.cleat,'S',q);
        else if(/^D-Cleat$/i.test(v1))add(d.cleat,'D',q);
        else if(v1==='Joist Lining'&&v2)add(d.jl,inch(v2),q);
        else if(v1==='Damper'&&v2)add(d.damper,inch(v2),q);
        else if(v1==='Reducer'&&v2&&v3)add(d.misc,'Reducer '+inch(v2)+'" to '+inch(v3)+'"',q);
        else if(v1==='Custom'&&v2)add(d.misc,v2,q);
        else if(v1)add(d.misc,v1,q);
      }
    }
  });
  return d;
}
function fitText(it){
  var v=function(k){return String(it[k]||'').replace(/"/g,'').trim();},t=it.vType||'Fitting',s='';
  if(/^(Side|Stack) 90$|^Taper/.test(t))s=[v('v1')&&v('v1')+'x'+v('v2'),v('v4')&&v('v4')+'x'+v('v5')].filter(Boolean).join(' to ');
  else if(/Y/.test(t))s=['A '+v('v1'),'B '+v('v2'),'C '+v('v3')].filter(function(x){return x.length>2;}).join('  ');
  else if(/45/.test(t))s=v('v1')+'x'+v('v2')+(v('v3')?' throat '+v('v3'):'');
  else if(/PTO/.test(t))s=v('v1')+'x'+v('v2')+(v('v3')?' '+v('v3')+' side':'');
  else if(t==='Riser')s=v('v1')+(v('v2')?'x'+v('v2'):'')+(v('v3')?' rise '+v('v3'):'');
  else s=[v('v1')&&v('v2')?v('v1')+'x'+v('v2'):v('v1'),v('v3')].filter(Boolean).join(' ');
  return {qty:parseInt(it.qty,10)||1,type:t,size:s};
}

/* ---------- where things go on Kirin's form (points, measured from the top-left) ---------- */
var ROW=function(k){return 113.8+11.27*k;};          // text baseline of grid row k
var COL={duct:[478.6,524],blk:[571.7,617],right:[664.8,710]}; // [label x, value x]
var DUCT_ROWS=['8x8','10x8','12x8','14x8','16x8','18x8','20x8','22x8','24x8','26x8','28x8','30x8',null,'22x10','24x10'];
var DUCT_SPARE=[12,15,16,17,18,19,20];
var PIPE_ROWS={'4':22,'5':23,'6':24},PIPE_SPARE=[25,26,27,28];
var RIGHT={jl:{'12':0,'16':1},jlSpare:[2],
  boot:{'5 AB':4,'5 EB':5,'5 UB':6,'6 AB':9,'6 EB':10,'6 UB':11},bootSpare:[7,12],
  damper:{'4':14,'5':15,'6':16},damperSpare:[17,18,19,20],
  tto:{'4':22,'5':23,'6':24},ttoSpare:[25,26],
  sto:{'4':28,'5':29,'6':30},stoSpare:[31,32,33],
  cleat:{S:35,D:36},cleatSpare:[37,38,39,40]};
function fmtLF(v){return (Math.round(v*10)/10)+"'";}

window.eaKirinPDF=async function(data,opts){
  opts=opts||{};
  var f=(data&&data.fields)||{},items=(data&&data.items)||[];
  var L=await loadLib(),bytes=await loadTemplate();
  var pdf=await L.PDFDocument.load(bytes),page=pdf.getPages()[0],H=page.getHeight();
  var font=await pdf.embedFont(L.StandardFonts.Helvetica),bold=await pdf.embedFont(L.StandardFonts.HelveticaBold);
  var ink=L.rgb(0.05,0.18,0.5);
  var put=function(pg,txt,x,y,size,fnt,maxW){
    txt=String(txt==null?'':txt).replace(/[^\x20-\x7E]/g,function(c){return c==='×'?'x':c==='→'?'>':'';});if(!txt)return;
    size=size||8;fnt=fnt||bold;
    if(maxW)while(size>5&&fnt.widthOfTextAtSize(txt,size)>maxW)size-=0.5;
    pg.drawText(txt,{x:x,y:pg.getHeight()-y,size:size,font:fnt,color:ink});
  };
  var d=totals(items),left=[];   // left: lines that didn't fit on page 1

  // header
  var date=f.fdate||'';var dm=String(date).match(/^(\d{4})-(\d\d)-(\d\d)$/);
  if(dm)date=new Date(+dm[1],+dm[2]-1,+dm[3]).toLocaleDateString('en-CA',{year:'numeric',month:'short',day:'numeric'});
  put(page,f.fmaster,120,53.5,10,bold,250);
  put(page,f.flot,632,53.5,10,bold,120);
  put(page,[f.fname,f.fsite].filter(Boolean).join(' - '),86,73,10,bold,286);
  put(page,date,672,73,10,bold,82);
  put(page,f.ffurnace,45,123,9,bold,205);
  put(page,f.fmodel,262.3,123,9,bold,205);
  put(page,f.fplenum,45,157,9,bold,205);

  // grid helpers
  var place=function(col,k,label,val){if(label!=null)put(page,label,COL[col][0],ROW(k),7,font,40);put(page,val,COL[col][1],ROW(k)+0.8,8,bold,40);};
  var fill=function(map,rows,spare,col,labelFn,valFn,section){
    Object.keys(map).sort(function(a,b){return parseFloat(a)-parseFloat(b);}).forEach(function(k){
      var v=map[k];if(!v)return;
      if(rows[k]!=null)place(col,rows[k],null,valFn(v));
      else if(spare.length)place(col,spare.shift(),labelFn(k),valFn(v));
      else left.push(section+': '+labelFn(k)+'  '+valFn(v));
    });
  };
  var dRows={};DUCT_ROWS.forEach(function(k,i){if(k)dRows[k]=i;});
  fill(d.duct,dRows,DUCT_SPARE.slice(),'duct',function(k){return k.replace('x',' x ');},fmtLF,'Duct');
  fill(d.blk,dRows,DUCT_SPARE.slice(),'blk',function(k){return k.replace('x',' x ');},String,'Block ends');
  fill(d.pipe,PIPE_ROWS,PIPE_SPARE.slice(),'duct',function(k){return k+'"';},fmtLF,'Pipe');
  fill(d.elbow,PIPE_ROWS,PIPE_SPARE.slice(),'blk',function(k){return k+'"';},String,'Elbows');
  fill(d.jl,RIGHT.jl,RIGHT.jlSpare.slice(),'right',function(k){return k+'" JL';},String,'Joist lining');
  fill(d.boot,RIGHT.boot,RIGHT.bootSpare.slice(),'right',function(k){return k.replace(' ','" ');},String,'Boots');
  fill(d.damper,RIGHT.damper,RIGHT.damperSpare.slice(),'right',function(k){return k+'" damper';},String,'Dampers');
  fill(d.tto,RIGHT.tto,RIGHT.ttoSpare.slice(),'right',function(k){return k+'" TTO';},String,'TTO');
  fill(d.sto,RIGHT.sto,RIGHT.stoSpare.slice(),'right',function(k){return k+'" STO';},String,'STO');
  var spare=RIGHT.cleatSpare.slice();
  if(d.cleat.S)place('right',RIGHT.cleat.S,null,String(d.cleat.S));
  if(d.cleat.D)place('right',RIGHT.cleat.D,null,String(d.cleat.D));
  Object.keys(d.misc).forEach(function(k){
    if(spare.length)place('right',spare.shift(),k,String(d.misc[k]));else left.push('Other: '+k+'  '+d.misc[k]);
  });

  // ---------- fittings, drawn into Kirin's pictograms (rules from Bryn's marked-up sample) ----------
  var src=await L.PDFDocument.load(bytes),srcPage=src.getPages()[0];   // clean copy to clone pictograms from
  var red=ink;
  var COLX=[38.8,147.3,256.4,365.0,473.5],ROWY=[160.6,228.7,296.8,364.4,432.0,499.5,567.7];
  var cell=function(c,r){return {x:COLX[c],y:ROWY[r],w:COLX[c+1]-COLX[c],h:ROWY[r+1]-ROWY[r],s:1,pg:page,c:c,r:r};};
  var at=function(C,dx,dy){return [C.x+dx*C.s,C.y+dy*C.s];};
  var txt=function(C,t,dx,dy,size,center,fnt){t=String(t||'');if(!t)return;var sz=(size||10)*C.s,F=fnt||bold;var p=at(C,dx,dy);var x=p[0];var w=F.widthOfTextAtSize(t.replace(/[^\x20-\x7E]/g,''),sz);if(center==='r')x-=w;else if(center)x-=w/2;put(C.pg,t,x,p[1],sz,F);};
  // W above the form's "x", H below it
  var dims=function(C,cx,xBase,w,hh){txt(C,w,cx,xBase-10,10,true);txt(C,hh,cx,xBase+12,10,true);};
  var qtyMark=function(C,q,dx,dy){if(q>1)txt(C,'X'+q,dx,dy,11,false);};
  var V=function(it,k){return String(it[k]==null?'':it[k]).replace(/["”″]/g,'').trim();};
  // slot kinds: where on the form each kind lives, and which clean cell to copy for extras
  var KINDS={
    pto:{slots:[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5]],srcC:[0,3],draw:function(C,it,q){
      dims(C,88.2,41,V(it,'v1'),V(it,'v2'));
      var side=/wide/i.test(it.v3)?'WS':/narrow/i.test(it.v3)?'NS':'';
      if(side)txt(C,side,6.7,44,9,false);
      qtyMark(C,q,40,48);}},
    vd:{slots:[[1,0],[1,1]],srcC:[1,0],draw:function(C,it,q){txt(C,V(it,'v1')+'x'+V(it,'v2'),54.4,65,10,true);qtyMark(C,q,8,30);}},
    // Y-Branch / Zoning Y -> the Y shapes; the size of each end is written where its A, B, C goes
    y:{slots:[[1,3],[1,2]],srcC:[1,2],draw:function(C,it,q){
      txt(C,V(it,'v1'),27,35.3,9,'r');txt(C,V(it,'v2'),84.5,36.6,9,false);txt(C,V(it,'v3'),54.2,65,9,true);
      if(it.vType==='Zoning Y')txt(C,'ZONING',4,10,7,false);
      qtyMark(C,q,4,62);}},
    // Semi-Y -> the shoe shapes
    semiy:{slots:[[1,4],[1,5]],srcC:[1,4],draw:function(C,it,q){
      txt(C,V(it,'v1'),40.2,13,9,true);txt(C,V(it,'v2'),84.5,38.6,9,false);txt(C,V(it,'v3'),49.8,65,9,true);
      qtyMark(C,q,4,40);}},
    riser:{slots:[[2,0],[2,1],[2,2],[2,3]],srcC:[2,0],draw:function(C,it,q){
      if(V(it,'v3'))txt(C,V(it,'v3')+'" rise',14,23,10,false);
      dims(C,91.7,40.6,V(it,'v1'),V(it,'v2'));qtyMark(C,q,14,62);}},
    taper:{slots:[[3,1],[3,2],[3,3],[3,4]],srcC:[3,1],draw:function(C,it,q){
      dims(C,8.4,40.2,V(it,'v1'),V(it,'v2'));dims(C,87.9,40.2,V(it,'v4'),V(it,'v5'));qtyMark(C,q,40,62);}},
    elbow:{slots:[[2,4],[2,5],[3,5]],srcC:[2,4],draw:function(C,it,q){
      var ex=C.c===3?87.9:91.7;dims(C,ex,40,V(it,'v1'),V(it,'v2'));
      var b=V(it,'v4')+'x'+V(it,'v5');if(V(it,'v4')&&b!==V(it,'v1')+'x'+V(it,'v2'))txt(C,'to '+b,ex,63,7,true);
      if(/Stack/.test(it.vType))txt(C,'STACK',4,10,7,false);
      qtyMark(C,q,C.c===3?40:45.3,44.1);}},
    rab:{slots:[[3,0]],srcC:[3,0],draw:function(C,it,q){txt(C,[V(it,'v1'),V(it,'v2')].filter(Boolean).join('x'),80,52,10,true);qtyMark(C,q,30,45);}}
  };
  var kindOf=function(it){var t=it.vType||'';
    if(/PTO$/.test(t))return 'pto';if(t==='Y-Branch'||t==='Zoning Y')return 'y';if(t==='Semi-Y')return 'semiy';
    if(t==='Riser')return 'riser';if(/^Taper/.test(t))return 'taper';if(/90$/.test(t))return 'elbow';if(t==='RA Boot')return 'rab';return null;};
  var used={},extras=[],noPic=[];
  var placeKind=function(k,it){var K=KINDS[k],q=parseInt(it.qty,10)||1;used[k]=used[k]||0;
    if(used[k]<K.slots.length){var sl=K.slots[used[k]++];var C=cell(sl[0],sl[1]);K.draw(C,it,q);return sl;}
    extras.push({k:k,it:it,q:q});return null;};
  d.fittings.forEach(function(it){
    var k=kindOf(it);if(!k){noPic.push(fitText(it));return;}
    placeKind(k,it);
    if(k==='pto')placeKind('vd',it);   // every PTO gets a VD the same size
  });
  // extra pictures: copy a clean cell from Kirin's form, then fill it the same way
  var srcBox=function(k){var c=KINDS[k].srcC,C=cell(c[0],c[1]);return {left:C.x,right:C.x+C.w,top:H-C.y,bottom:H-(C.y+C.h)};};
  var drawExtra=function(pg,x,y,s,e){
    var C0=cell(KINDS[e.k].srcC[0],KINDS[e.k].srcC[1]);
    var ep=embedCache[e.k];pg.drawPage(ep,{x:x,y:pg.getHeight()-y-C0.h*s,xScale:s,yScale:s});
    pg.drawRectangle({x:x,y:pg.getHeight()-y-C0.h*s,width:C0.w*s,height:C0.h*s,borderColor:L.rgb(0,0,0),borderWidth:0.75});
    var C={x:x,y:y,w:C0.w*s,h:C0.h*s,s:s,pg:pg,c:C0.c===3&&e.k==='elbow'?2:C0.c,r:C0.r};
    KINDS[e.k].draw(C,e.it,e.q);
  };
  var embedCache={};
  if(extras.length){
    var kinds={};extras.forEach(function(e){kinds[e.k]=1;});
    for(var kk in kinds)embedCache[kk]=await pdf.embedPage(srcPage,srcBox(kk));
    // first two go in the empty box under the duct table on page 1 (as in the sample)
    var spots=[[474.5,502.5],[567.6,502.5]],sc=0.85;
    while(extras.length&&spots.length){var sp=spots.shift();drawExtra(page,sp[0],sp[1],sc,extras.shift());}
  }
  if(extras.length||noPic.length||left.length){
    var p2=pdf.addPage([page.getWidth(),H]),y=48;
    put(p2,'HVAC MEASUREMENT FORM - MORE FITTINGS',39,y,16,bold);y+=22;
    put(p2,[f.fmaster?'Master '+f.fmaster:'',f.flot?'Lot '+f.flot:'',[f.fname,f.fsite].filter(Boolean).join(' - '),date].filter(Boolean).join('     '),39,y,10,font,714);y+=12;
    p2.drawLine({start:{x:39,y:H-y},end:{x:753,y:H-y},thickness:1,color:L.rgb(0,0,0)});y+=16;
    var gx=39,cw=COLX[1]-COLX[0];
    extras.forEach(function(e){
      if(gx+cw>754){gx=39;y+=72;}
      if(y+70>590){p2=pdf.addPage([page.getWidth(),H]);y=48;gx=39;}
      drawExtra(p2,gx,y,1,e);gx+=cw+6;
    });
    if(extras.length)y+=82;
    if(noPic.length){
      put(p2,'FITTINGS WITH NO PICTURE ON THE FORM',39,y,10,bold);y+=16;
      noPic.forEach(function(r){if(y>580){p2=pdf.addPage([page.getWidth(),H]);y=48;}put(p2,'x'+r.qty,45,y,10,bold);put(p2,r.type,95,y,10,font,155);put(p2,r.size,260,y,10,bold,490);y+=15;});
      y+=8;
    }
    if(left.length){
      put(p2,'ALSO ON THIS MASTER (no space on the form)',39,y,10,bold);y+=16;
      left.forEach(function(t){if(y>580){p2=pdf.addPage([page.getWidth(),H]);y=48;}put(p2,t,45,y,10,font,700);y+=15;});
    }
  }
  var fits=d.fittings;
  pdf.setTitle('HVAC Measurement Form '+(f.fmaster||''));pdf.setCreator('Eco Air Staff Portal');pdf.setProducer('Eco Air Staff Portal');
  var out=await pdf.save();
  var name=('Kirin Air - '+[f.fname,f.fmaster,f.flot?'Lot '+f.flot:''].filter(Boolean).join(' - ')).replace(/[\\\/:*?"<>|]+/g,' ').trim()+'.pdf';
  if(opts.returnBytes)return {bytes:out,name:name,fittings:fits.length,overflow:left.length};
  var blob=new Blob([out],{type:'application/pdf'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},4000);
  return {name:name,fittings:fits.length,overflow:left.length};
};

/* From a saved master in the portal */
App.kirinPDF=async function(m,over){
  var fd=m.snapshot&&m.snapshot._formData;
  var data=fd&&(fd.fields||fd.items)?{fields:Object.assign({},fd.fields||{}),items:fd.items||[]}:{fields:{},items:[]};
  var s=m.snapshot||{};
  ['fmaster','flot','fname','fsite','fmodel','fdate','ffurnace','fplenum'].forEach(function(k){if(!data.fields[k]&&s[k])data.fields[k]=s[k];});
  if(!data.fields.fmaster)data.fields.fmaster=m.masterNum||m.num||masterKey(m);
  if(!data.fields.fname)data.fields.fname=getB(m)==='Unknown Builder'?'':getB(m);
  if(!data.fields.flot&&masterLot(m))data.fields.flot=masterLot(m);
  if(over)Object.keys(over).forEach(function(k){if(over[k])data.fields[k]=over[k];});
  if(!data.items.length){showToast('This master has no saved line items, so only the header can be filled.',true);}
  showToast('Making the Kirin Air PDF…');
  try{var r=await window.eaKirinPDF(data);showToast('Downloaded '+r.name);}
  catch(e){showToast('Could not make the Kirin Air PDF: '+(e&&e.message||e),true);}
};
})();
