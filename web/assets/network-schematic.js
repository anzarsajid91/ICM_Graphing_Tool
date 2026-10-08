/* Network overview: own state, local source bindings and calendar spill results. */
(()=>{'use strict';
const C=ICMNetworkCore,R=ICMNetworkReviewCore,NS='http://www.w3.org/2000/svg',STORE='hydra-network-schematic-v1';
const $=id=>document.getElementById(id),html=esc,uid=()=>crypto.randomUUID();
let network=C.empty(),selected=null,editing=false,tool='select',colour='red',connectFrom=null,drag=null,busy=false,history=[],mounted=false,popupVisible=false,observer=null,saveTimer=null;
let redo=[],multi=new Set(),highlight=null,hoverTimer=null,frame=null,analysisGeneration=0,analysisContext=null,analysisTimer=null;
const freshness=new Map();
const prefs=()=>R.preferences(network);
const root=()=>$('tab-spill-network');
const node=()=>network.nodes.find(n=>n.id===selected),edge=()=>network.edges.find(n=>n.id===selected);
const asset=n=>n&&!['manhole','label','junction','outfall'].includes(n.type);
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const f=(v,d=1)=>v===null||v===undefined?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:d});
const fields=(label,content)=>'<label class="ns-field"><span>'+label+'</span>'+content+'</label>';
const selectHtml=(attr,options,value)=>'<select '+attr+'>'+options.map(([v,l])=>'<option value="'+html(v)+'" '+(String(value)===String(v)?'selected':'')+'>'+html(l)+'</option>').join('')+'</select>';
function sourceFor(b){
  const direct=state.files.get(b.sourceId);if(direct&&direct.hash===b.sha256&&direct.status==='ready')return direct;
  return [...state.files.values()].find(x=>x.status==='ready'&&x.hash&&x.hash===b.sha256)||null;
}
function contract(b){const item=sourceFor(b);return item?{quantity:seriesQuantity(item,b.column)||'',unit:seriesUnit(item,b.column)||'',datum:seriesReference(item,b.column)||''}:{};}
function signature(n){return JSON.stringify({methodVersion:2,bindings:n.bindings.map(b=>({sha256:b.sha256,column:b.column,role:b.role,scenario:b.scenario,years:b.years,threshold:b.threshold,comparison:C.thresholdRule(b),quantity:b.quantity,unit:b.unit,datum:b.datum,current:contract(b),found:Boolean(sourceFor(b))})),defaults:n.defaults,gap:n.gap,exclusions:n.exclusions,confirmed:n.confirmed});}
function isFresh(n){if(!freshness.has(n.id))freshness.set(n.id,Boolean(n.applied&&n.applied.signature===signature(n)));return freshness.get(n.id);}
function checkpoint(){redo=[];history.push(JSON.stringify(network));if(history.length>30)history.shift();}
function snapshot(){return JSON.parse(JSON.stringify(network));}
function flushSave(){clearTimeout(saveTimer);try{localStorage.setItem(STORE,JSON.stringify(network));}catch(error){status('Browser save unavailable; use Save network to keep this layout.');}}
function persist(){state.networkSchematicWorkspace=snapshot();clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,250);}
function status(message){if($('nsStatus'))$('nsStatus').textContent=message;}
function changed(geometry=false){if(!geometry)freshness.clear();persist();renderCanvas();if(!geometry)renderFilters();renderReview();}
function restore(value){
  network=value?C.validateNetwork(value):C.empty();selected=null;popupVisible=false;history=[];redo=[];multi.clear();highlight=null;freshness.clear();
  state.networkSchematicWorkspace=snapshot();if(mounted){render();persist();}
}
function point(x,y){return {x:x*network.camera.zoom+network.camera.x,y:y*network.camera.zoom+network.camera.y};}
function world(x,y){return {x:(x-network.camera.x)/network.camera.zoom,y:(y-network.camera.y)/network.camera.zoom};}
function dimensions(){return {width:Math.max(240,$('nsCanvas')?.clientWidth||1000),height:Math.max(360,$('nsCanvas')?.clientHeight||620)};}
function icon(type){
  const shapes={cso:'<path d="M-25 2c8-7 14 5 22 0h5v-18h7v31h17"/>',
    storm:'<path d="M-25 2h21v-16h7v28h23"/>',
    emergency:'<path d="M-25 4h50M0-15v12M0 12h.01"/>',
    pump:'<circle r="25"/><path d="M-10-14L15 0-10 14Z"/>',
    wwtw:'<path d="M-21-22v44M7-22v44M-32-10H32"/>',
    tank:'<path d="M-26-16v32M26-16v32M-26 0c10-7 18 7 28 0s17 5 24 0"/>',
    junction:'<circle r="12"/><path d="M-20 0h40M0-20v40"/>',outfall:'<path d="M-24-12H9V12H-24M9 0h20M22-7l7 7-7 7"/>',manhole:'<circle r="8"/>',label:'<circle r="3" fill="currentColor"/>'};
  return shapes[type]||shapes.cso;
}
function badgeMarkup(n){
  if(!n.bindings.length)return '';
  if(prefs().detail==='minimal'||prefs().detail==='auto'&&network.camera.zoom<.55&&selected!==n.id&&!multi.has(n.id))return '';
  const chosen=prefs().scenarios,rows=(n.applied?.rows||[]).filter(r=>r.role==='observed'||chosen===null||chosen.includes(r.scenario));
  const summaries=C.summaryYears(rows,network.year,network.metric,n.confirmed,isFresh(n),n.bindings.filter(b=>b.role==='model'&&(chosen===null||chosen.includes(b.scenario))).map(b=>b.scenario),R.years(n));
  const lines=summaries.flatMap(summary=>[{year:summary.year,header:true,text:String(summary.year)},...summary.items.filter(item=>network.evidenceMode==='combined'||item.label===(network.scenario==='observed'?'O':'M ('+network.scenario+')')).map(item=>({...item,year:summary.year,text:(item.label.length>24?'M ('+item.label.slice(3,-1).slice(0,18)+'…)':item.label)+': '+(item.stale&&n.applied?'↻':f(item.value,network.metric==='spill_count'?0:1))+(network.metric==='duration_hours'&&item.value!==null?' h':'')}))]);
  const width=Math.max(65,...lines.map(item=>item.text.length*7+16)),height=8+lines.length*21;
  const offset=C.labelOffset(n),box=C.bounds(n.type),vertical=Math.abs(offset.y)/box.y>=Math.abs(offset.x)/box.x;
  const x=vertical?offset.x-width/2:offset.x<0?offset.x-width-10:offset.x+10;
  const y=vertical?(offset.y<=0?offset.y+4-height:offset.y+25):offset.y-height/2+14;
  return '<g data-ns-summary=""'+(network.evidenceMode==='single'?' data-ns-badge=""':'')+' transform="translate('+x+' '+y+')"><rect x="0" y="-14" width="'+width+'" height="'+height+'" rx="5" fill="white" stroke="#c7d2d9"/>'+lines.map((item,i)=>'<g '+(item.header?'data-ns-summary-year':'data-ns-summary-row')+'="'+item.year+'"'+(item.rag?' class="ns-rag-'+item.rag+'"':'')+'><title>'+html(item.header?item.text:item.label+': '+(item.value===null?'Unavailable':f(item.value))+(item.reason?' · '+item.reason:''))+'</title><rect x="1" y="'+(-10+i*21)+'" width="'+(width-2)+'" height="20" fill="'+(item.header?'#f5f7f9':{green:'#eaf6ed',amber:'#fff4d9',red:'#fdebec'}[item.rag]||'white')+'"/><text x="7" y="'+(4+i*21)+'" font-size="'+(item.header?11:12)+'" font-weight="'+(item.header?600:400)+'" fill="'+(item.header?'#60717d':{green:'#267044',amber:'#9a6500',red:'#b93838'}[item.rag]||'#182732')+'">'+html(item.text)+'</text></g>').join('')+'</g>';
}
function unitOptions(quantity){return quantity==='status'?[['1','Binary / unitless']]:quantity==='flow'?[['','Assign…'],['m³/s','m³/s'],['L/s','L/s'],['Ml/d','Ml/d'],['m³/d','m³/d']]:[['','Assign…'],['m','m'],['mm','mm']];}
function svgContent(includeHandles=true){
  const {width,height}=dimensions(),parts=[];
  const shown=visibleNodes(),shownIds=new Set(shown.map(n=>n.id)),byId=new Map(network.nodes.map(n=>[n.id,n]));
  const routes=C.connectionRoutes(network.nodes,network.edges,n=>point(n.x,n.y));
  for(const e of network.edges){
    if(!shownIds.has(e.from)||!shownIds.has(e.to))continue;
    const route=routes.get(e.id);if(!route)continue;
    const a=byId.get(e.from),b=byId.get(e.to),c=C.colours[e.colour];
    parts.push('<g data-ns-edge="'+html(e.id)+'" tabindex="0" role="button" aria-label="Connector '+html(e.name||a.name+' to '+b.name)+'"><path d="'+route.path+'" fill="none" stroke="transparent" stroke-width="14"/><path data-ns-wire="" d="'+route.path+'" fill="none" stroke="'+c+'" stroke-width="'+(e.id===selected?3:2)+'"/>'+(e.arrow!==false?'<polygon data-ns-direction="" points="'+route.arrow.map(p=>p.x+','+p.y).join(' ')+'" fill="'+c+'"/>':'')+(e.name?'<text data-ns-edge-label="" x="'+(route.label.x+(e.labelOffset?.x||0))+'" y="'+(route.label.y+(e.labelOffset?.y||0))+'" fill="'+c+'" font-size="13">'+html(e.name)+'</text>':'')+(includeHandles&&editing&&e.id===selected?route.points.slice(1,-1).map((p,i)=>'<circle data-ns-bend="'+i+'" cx="'+p.x+'" cy="'+p.y+'" r="7" fill="white" stroke="#087b82" stroke-width="2"/>').join('')+((e.bends||[]).length<32?route.points.slice(1).map((p,i)=>{const a=route.points[i],x=(a.x+p.x)/2,y=(a.y+p.y)/2;return '<g data-ns-add-bend="'+i+'" aria-label="Add bend"><circle cx="'+x+'" cy="'+y+'" r="8" fill="white" stroke="#087b82"/><path data-ns-handle="" d="M'+(x-3)+' '+y+'h6M'+x+' '+(y-3)+'v6" stroke="#087b82" pointer-events="none"/></g>';}).join(''):''):'')+'</g>');
  }
  for(const n of network.nodes){
    if(!shownIds.has(n.id))continue;
    const p=point(n.x,n.y),c=C.colours[n.colour],box=C.bounds(n.type),offset=C.labelOffset(n),small=['manhole','label'].includes(n.type),leader=C.labelLeader(n);
    const label=(leader?'<path data-ns-leader="" d="M'+leader.start.x+' '+leader.start.y+'L'+leader.end.x+' '+leader.end.y+'" stroke="#82939f" stroke-width="1" fill="none"/><polygon points="'+leader.arrow.map(p=>p.x+','+p.y).join(' ')+'" fill="#82939f"/>':'')+'<text data-ns-label="'+html(n.id)+'" x="'+(offset.x+(small?5:0))+'" y="'+offset.y+'" text-anchor="'+(small?'start':'middle')+'" font-size="'+(small?13:14)+'" font-weight="'+(small?400:600)+'" fill="#182732">'+html(n.name)+'</text>';
    parts.push('<g data-ns-node="'+html(n.id)+'" transform="translate('+p.x+' '+p.y+')" tabindex="0" role="button" aria-label="'+html(n.name)+' · '+html(C.types[n.type])+'"><title>'+html(n.name+' · '+C.types[n.type])+'</title>'+(selected===n.id||multi.has(n.id)?'<rect x="-42" y="-32" width="84" height="64" rx="8" fill="none" stroke="#0b8f96" stroke-width="2"/>':'')+(box.circle?'':'<rect data-ns-frame="" x="'+(-box.x)+'" y="'+(-box.y)+'" width="'+(box.x*2)+'" height="'+(box.y*2)+'" rx="6" fill="white" stroke="'+c+'" stroke-width="1.5"/>')+'<rect x="-37" y="-28" width="74" height="56" fill="transparent"/><g stroke="'+c+'" stroke-width="1.8" fill="white" stroke-linecap="round" stroke-linejoin="round">'+icon(n.type)+'</g>'+label+(asset(n)?badgeMarkup(n):'')+'</g>');
  }
  if(!network.nodes.length)parts.push('<text x="'+width/2+'" y="'+height/2+'" text-anchor="middle" fill="#60717d" font-size="15">Choose Edit network, then add your site assets and manholes.</text>');
  return parts.join('');
}
function renderCanvas(){
  const svg=$('nsSvg');if(!svg)return;const d=dimensions();svg.setAttribute('viewBox','0 0 '+d.width+' '+d.height);svg.innerHTML=svgContent();
  $('nsZoom').textContent=Math.round(network.camera.zoom*100)+'%';$('nsUndo').disabled=!history.length||busy;
  renderPopup();
  applyDecorations();
}
function renderGeometry(){
  const edges=new Map(network.edges.map(e=>[e.id,e])),nodes=new Map(network.nodes.map(n=>[n.id,n])),routes=C.connectionRoutes(network.nodes,network.edges,n=>point(n.x,n.y));
  for(const g of $('nsSvg').querySelectorAll('[data-ns-node]')){const n=nodes.get(g.dataset.nsNode),p=point(n.x,n.y);g.setAttribute('transform','translate('+p.x+' '+p.y+')');}
  for(const g of $('nsSvg').querySelectorAll('[data-ns-edge]')){const route=routes.get(g.dataset.nsEdge);if(!route){g.style.visibility='hidden';continue;}g.style.visibility='';for(const path of g.querySelectorAll(':scope > path'))path.setAttribute('d',route.path);g.querySelector('[data-ns-direction]')?.setAttribute('points',route.arrow.map(p=>p.x+','+p.y).join(' '));const e=edges.get(g.dataset.nsEdge),offset=e.labelOffset||{x:0,y:0},label=g.querySelector('text');if(label){label.setAttribute('x',route.label.x+offset.x);label.setAttribute('y',route.label.y+offset.y);}for(const handle of g.querySelectorAll('[data-ns-bend]')){const p=route.points[Number(handle.dataset.nsBend)+1];handle.setAttribute('cx',p.x);handle.setAttribute('cy',p.y);}for(const handle of g.querySelectorAll('[data-ns-add-bend]')){const i=Number(handle.dataset.nsAddBend),a=route.points[i],b=route.points[i+1],x=(a.x+b.x)/2,y=(a.y+b.y)/2;handle.querySelector('circle').setAttribute('cx',x);handle.querySelector('circle').setAttribute('cy',y);handle.querySelector('path').setAttribute('d','M'+(x-3)+' '+y+'h6M'+x+' '+(y-3)+'v6');}}
}
function fit(){
  const d=dimensions();if(!network.nodes.length){network.camera={x:0,y:0,zoom:1};changed(true);return;}
  const geometry=[...network.nodes,...network.edges.flatMap(e=>e.bends||[])],xs=geometry.map(n=>n.x),ys=geometry.map(n=>n.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const offsets=new Map([...$('nsSvg').querySelectorAll('[data-ns-node]')].map(el=>[el.dataset.nsNode,el.getBBox()]));
  const scene=z=>{
    const xs=[],ys=[];
    for(const n of network.nodes){const box=offsets.get(n.id)||{x:-45,y:-45,width:90,height:90};xs.push(n.x*z+box.x,n.x*z+box.x+box.width);ys.push(n.y*z+box.y,n.y*z+box.y+box.height);}
    for(const p of network.edges.flatMap(e=>e.bends||[])){xs.push(p.x*z);ys.push(p.y*z);}
    return {left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
  };
  let z=Math.max(.2,Math.min(2,(d.width-160)/Math.max(200,right-left),(d.height-150)/Math.max(180,bottom-top))),box;
  for(let i=0;i<8;i++){box=scene(z);const ratio=Math.min(1,(d.width-40)/Math.max(1,box.right-box.left),(d.height-70)/Math.max(1,box.bottom-box.top));if(ratio>.999||z===.2)break;z=Math.max(.2,z*ratio);}
  box=scene(z);network.camera={zoom:z,x:d.width/2-(box.left+box.right)/2,y:(d.height-30)/2-(box.top+box.bottom)/2};changed(true);
}
function zoom(factor,anchor){
  const d=dimensions(),p=anchor||{x:d.width/2,y:d.height/2},before=world(p.x,p.y),z=Math.max(.2,Math.min(4,network.camera.zoom*factor));
  network.camera={zoom:z,x:p.x-before.x*z,y:p.y-before.y*z};changed(true);
}
function renderFilters(){
  if(!$('nsYear'))return;
  const years=[...new Set(network.nodes.flatMap(n=>n.bindings.flatMap(b=>b.years||[])))].sort((a,b)=>a-b);
  const scenarios=[...new Set(network.nodes.flatMap(n=>n.bindings.filter(b=>b.role==='model').map(b=>b.scenario)))].sort();
  if(network.year!=='all'&&!years.includes(Number(network.year)))network.year='all';
  if(network.scenario!=='observed'&&!scenarios.includes(network.scenario))network.scenario='observed';
  $('nsYear').innerHTML=selectHtml('',[['all','All years'],...years.map(y=>[String(y),String(y)])],network.year).replace(/^<select[^>]*>|<\/select>$/g,'');
  $('nsScenario').innerHTML=selectHtml('',[['observed','Observed'],['combined','Observed + all models'],...scenarios.map(s=>['model:'+s,s])],network.evidenceMode==='combined'?'combined':network.scenario==='observed'?'observed':'model:'+network.scenario).replace(/^<select[^>]*>|<\/select>$/g,'');
  $('nsMetric').value=network.metric;
}
function colours(value,attribute){return '<div class="ns-swatches">'+Object.entries(C.colours).map(([k,c])=>'<button type="button" '+attribute+'="'+k+'" aria-label="'+k+' network colour" aria-pressed="'+(value===k)+'" style="--swatch:'+c+'"></button>').join('')+'</div>';}
function bindingRows(n,role){return n.bindings.filter(b=>b.role===role).map(b=>{
  const item=sourceFor(b),metadata=contract(b),columns=item?.parsed?.columns||[b.column];
  let effective='Set a source threshold or asset default';try{const t=C.effectiveThreshold(b,n.defaults);effective=(t.comparison==='gt'?'> ':'≥ ')+t.value+' '+(b.unit||metadata.unit||'')+' · '+t.source;}catch{}
  return '<div class="ns-source-row" data-ns-binding="'+html(b.id)+'"><div class="ns-source-title"><strong title="'+html(b.sourceName)+'">'+html(b.sourceName)+'</strong><button data-ns-remove-binding="'+html(b.id)+'" aria-label="Remove '+html(b.sourceName)+'">×</button></div>'+
    (role==='model'?fields('Scenario','<input data-ns-binding-field="scenario" value="'+html(b.scenario)+'">'):'')+
    fields('Channel',selectHtml('data-ns-binding-field="column"',columns.map(c=>[c,c]),b.column))+
    '<div class="ns-two">'+fields('Reporting years','<input data-ns-binding-field="years" value="'+html(b.years.join(', '))+'" placeholder="2022, 2023">')+fields('Threshold ('+html(b.unit||metadata.unit||'assign unit')+')','<input data-ns-binding-field="threshold" type="number" step="any" value="'+html(b.threshold)+'" placeholder="Group default">')+'</div>'+
    fields('Spill when',selectHtml('data-ns-binding-field="comparison"',[['gt','Above threshold (>)'],['ge','At or above threshold (≥)']],C.thresholdRule(b)))+'<small data-ns-effective-threshold>'+html(effective)+'</small>'+
    '<div class="ns-two">'+fields('Quantity',selectHtml('data-ns-binding-field="quantity"',[['depth','Depth'],['level','Level'],['flow','Overflow flow'],['status','Spill status']],b.quantity))+fields('Values / threshold unit',selectHtml('data-ns-binding-field="unit"',unitOptions(b.quantity),b.unit))+'</div>'+
    (b.quantity==='level'?fields('Level datum','<input data-ns-binding-field="datum" value="'+html(b.datum||'')+'" placeholder="e.g. AOD">'):'')+
    '<small>'+(item?'Main year suggested: '+(C.mainYear(item.parsed.start,item.parsed.end)||'unavailable')+' · '+html(String(item.parsed.start||'').slice(0,10))+' to '+html(String(item.parsed.end||'').slice(0,10))+'. Earlier warm-up is omitted from reported totals.':'Reload the original matching source fingerprint before calculating.')+'</small></div>';
}).join('');}
function renderDrawer(){
  const drawer=$('nsDrawer');if(!drawer)return;drawer.hidden=!editing;const n=node(),e=edge();
  if(!editing)return;
  if(!n&&!e){drawer.innerHTML='<h3>Edit network</h3><p>Add a point or select an existing asset to name it and assign imported evidence.</p><p>Use Connect and click two points to draw a directed wire. Drag points to arrange the site.</p>';return;}
  const common='<div class="ns-drawer-head"><h3>'+html(n?n.name:e.name||'Connector')+'</h3><button data-ns-close-selection aria-label="Close settings">×</button></div>'+
    fields('Name','<input id="nsName" value="'+html(n?n.name:e.name||'')+'" maxlength="160">')+fields('Network colour',colours((n||e).colour,'data-ns-object-colour'));
  if(e){drawer.innerHTML=common+'<label class="ns-check"><input id="nsArrow" type="checkbox" '+(e.arrow!==false?'checked':'')+'> Show direction</label><p class="ns-note">Click + on the line to add a bend; drag the round handles to position it.</p><button id="nsAddBend" '+((e.bends||[]).length>=32?'disabled':'')+'>+ Add bend</button> <button id="nsStraighten" '+(!(e.bends||[]).length?'disabled':'')+'>Straighten</button>'+((e.bends||[]).length?'<div class="ns-bend-list">'+e.bends.map((p,i)=>'<button data-ns-remove-bend="'+i+'">Remove bend '+(i+1)+'</button>').join('')+'</div>':'')+reviewFields(e)+'<button data-ns-delete class="ns-danger">Delete connector</button>';return;}
  drawer.innerHTML=common+fields('Type',selectHtml('id="nsType"',Object.entries(C.types),n.type))+
    '<label class="ns-check"><input id="nsPinned" type="checkbox" '+(n.pinned?'checked':'')+'> Pin position</label><div class="ns-two">'+fields('Label X','<input id="nsLabelX" type="number" min="-10000" max="10000" value="'+C.labelOffset(n).x+'">')+fields('Label Y','<input id="nsLabelY" type="number" min="-10000" max="10000" value="'+C.labelOffset(n).y+'">')+'</div><button id="nsResetLabel">Reset label</button><small>Drag the name or combined summary on the canvas. A leader arrow keeps the label tied to this point.</small>'+
    (asset(n)?'<section><h4>Observed</h4>'+fields('Shared threshold · blank rows inherit','<input id="nsObservedDefault" type="number" step="any" value="'+html(n.defaults?.observed??'')+'">')+bindingRows(n,'observed')+'<button data-ns-add-sources="observed">+ Add datasets</button></section>'+
      '<section><h4>Modelled scenarios</h4>'+fields('Scenario for new assignments','<input id="nsNewScenario" value="'+html(n.newScenario||'Baseline')+'" maxlength="100">')+fields('Shared model threshold · blank rows inherit','<input id="nsModelDefault" type="number" step="any" value="'+html(n.defaults?.model??'')+'">')+bindingRows(n,'model')+'<button data-ns-add-sources="model">+ Add datasets to scenario</button></section>'+
      '<details><summary>Assessment settings</summary>'+fields('Maximum valid gap (s)','<input id="nsGap" type="number" min="1" value="'+n.gap+'">')+fields('Exclusions · start, end, reason (one per line)','<textarea id="nsExclusions" rows="3" placeholder="2024-05-01T00:00, 2024-05-02T00:00, logger fault">'+html((n.exclusions||[]).map(x=>[x.start,x.end,x.reason].join(', ')).join('\n'))+'</textarea>')+'<small>Local to this asset. Use model-clock ISO dates. Other workspaces are unaffected.</small></details>'+
      '<label class="ns-check"><input id="nsConfirmed" type="checkbox" '+(n.confirmed?'checked':'')+'> Matching clocks, units/datum and model/rainfall basis confirmed for this asset’s comparisons</label>'+
      '<p class="ns-note">Each source defaults to its main reporting year; override years per row. At least three calendar months of valid reporting data are required.</p>'+
      '<button id="nsCalculate" class="ns-primary" '+(busy?'disabled':'')+'>'+(busy?'Calculating…':'Apply & calculate')+'</button>':'')+
    reviewFields(n)+'<button data-ns-delete class="ns-danger">Delete point</button>';
}
function popupTable(n){
  if(!n.applied)return annualTable(n)+'<small>Assign datasets and calculate.</small>';
  const fresh=isFresh(n),groups=R.annualGroups(n,prefs().scenarios);
  let table='<table><thead><tr><th>Year</th><th>Scenario</th><th>Observed<br>spills</th><th>Modelled<br>spills</th><th>Observed<br>hours</th><th>Modelled<br>hours</th></tr></thead><tbody>';
  const cell=(v,rag)=>'<td'+(rag?' class="ns-rag-'+rag+'"':'')+'>'+f(v,Number.isInteger(v)?0:2)+'</td>';
  for(const group of groups){
    const o=group.observed,m=group.model,reason=!fresh?'Recalculation required':m?C.comparable(o,m,n.confirmed):'No matching model evidence.',countRag=m&&!reason?C.rag(o?.spill_count,m.spill_count):null,durationRag=fresh&&m&&!C.comparable(o,m,n.confirmed,'duration_hours')?C.rag(o?.duration_hours,m.duration_hours):null;
    table+='<tr data-ns-evidence-year="'+group.year+'" title="'+html(reason)+'"><td>'+group.year+'</td><td>'+html(group.scenario)+([o,m].some(r=>r?.continuous_spill)?'<small class="ns-warning">Continuous spill — check threshold</small>':'')+'</td>'+cell(fresh?o?.spill_count:null)+cell(fresh?m?.spill_count:null,countRag)+cell(fresh?o?.duration_hours:null)+cell(fresh?m?.duration_hours:null,durationRag)+'</tr>';
  }
  table+='</tbody></table>'+(groups.length?'':'<p>No evidence for the selected year.</p>');
  const details=groups.map(g=>[g.observed,g.model].filter(Boolean).map(r=>'<p><strong>'+html(r.year+' · '+(r.role==='observed'?'Observed':r.scenario))+'</strong><br>'+html(r.analysis_start?r.analysis_start.slice(0,10)+' to '+r.analysis_end.slice(0,10):'No period')+(r.partial_year?' · partial year':'')+'<br>'+html(r.column)+' · '+(C.thresholdRule(r)==='gt'?'&gt;':'≥')+' '+f(r.threshold,6)+' '+html(r.unit||'')+'<br>Valid '+f(r.valid_hours,1)+' h · gaps '+f(r.unknown_hours,1)+' h · excluded '+f(r.excluded_hours,1)+' h'+(r.value_min!==undefined?'<br>Value range '+f(r.value_min,6)+' to '+f(r.value_max,6)+' '+html(r.unit||''):'')+(r.reason?'<br>'+html(r.reason):'')+(r.count_status&&r.count_status!=='definitive'?'<br>'+html(r.count_status):'')+(r.continuous_spill?'<br>All valid support is classified as spilling. Check channel, threshold, units and datum.':'')+'</p>').join('')+(g.model?'<p>'+html(fresh?C.comparable(g.observed,g.model,n.confirmed)||'Comparison eligible.':'Recalculation required.')+'</p>':'')).join('');
  return table+(fresh?'':'<p class="ns-note">Recalculation required: settings, method or source evidence changed.</p>')+'<details class="ns-evidence-details"><summary>Assessment details</summary>'+details+'</details><small>12/24 counts · duration in hours</small>';
}
function renderPopup(){
  const pop=$('nsPopup'),n=node();if(!pop)return;pop.hidden=editing||!popupVisible||!n;
  if(pop.hidden){pop.replaceChildren();return;}
  const oldScroll=pop.querySelector('.ns-popup-body')?.scrollTop||0;pop.innerHTML='<div class="ns-popup-head"><div><h3>'+html(n.name)+'</h3><small>'+html(C.types[n.type])+' · all reporting years</small></div><button data-ns-close-popup aria-label="Close spill evidence">×</button></div><div class="ns-popup-body">'+popupTable(n)+reviewFields(n)+'</div><div class="ns-popup-footer"><button data-ns-open-analysis="series">Time series</button><button data-ns-open-analysis="spills">Spill analysis</button><button data-ns-edit-selected>Edit asset</button></div>';pop.querySelector('.ns-popup-body').scrollTop=oldScroll;
  const d=dimensions(),p=point(n.x,n.y),w=Math.min(620,d.width-24);pop.style.width=w+'px';pop.style.maxHeight=(d.height-24)+'px';
  // Keep the camera controls reachable even with a long evidence table.
  pop.style.maxHeight=(d.height-82)+'px';
  pop.style.left=Math.max(12,d.width-w-12)+'px';
  pop.style.top='12px';
}
function render(){
  if(!mounted)return;
  $('nsEdit').textContent=editing?'Done editing':'Edit network';$('nsEdit').setAttribute('aria-pressed',String(editing));
  $('nsEditTools').hidden=!editing;$('nsLayout').classList.toggle('ns-editing',editing);
  $('nsPan').setAttribute('aria-pressed',String(tool==='pan'));$('nsConnect').setAttribute('aria-pressed',String(tool==='connect'));
  $('nsColourChoices').innerHTML=colours(colour,'data-ns-colour');renderFilters();renderDrawer();renderCanvas();renderReview();
}
function add(type){
  if(busy||prefs().locked)return;checkpoint();const d=dimensions(),p=world(d.width*.35+network.nodes.length%4*30,d.height*.4+network.nodes.length%4*35);
  if(network.nodes.length>=2000){status('Maximum 2,000 points.');return;}const n={id:uid(),name:C.types[type]+' '+(network.nodes.filter(n=>n.type===type).length+1),type,colour,x:p.x,y:p.y,labelOffset:{x:30,y:-20},bindings:[],defaults:{observed:'',model:''},newScenario:'Baseline',gap:900,exclusions:[],confirmed:false,applied:null};
  network.nodes.push(n);selected=n.id;popupVisible=false;editing=true;changed();render();$('nsName')?.focus();
}
function selectPoint(id){
  if(tool==='connect'&&editing){
    if(prefs().locked||busy)return;
    const n=network.nodes.find(n=>n.id===id);if(n?.type==='label'){status('Pointer labels do not connect. Select an asset or manhole.');return;}
    if(!connectFrom){connectFrom=id;status('Select the downstream point.');return;}
    if(connectFrom===id){connectFrom=null;status('Connection cancelled.');return;}
    if(network.edges.length>=5000){status('Maximum 5,000 connectors.');connectFrom=null;return;}if(!network.edges.some(e=>e.from===connectFrom&&e.to===id)){checkpoint();network.edges.push({id:uid(),from:connectFrom,to:id,colour,name:'',arrow:true});changed();}
    connectFrom=null;status('Connector added. Connections do not alter spill calculations.');return;
  }
  selected=id;if(!multi.has(id))multi=new Set([id]);popupVisible=!editing;hideHover();renderDrawer();renderCanvas();renderReview();
}
function showSourcePicker(role){
  const n=node();if(!n||busy)return;
  const files=[...state.files.values()].filter(x=>x.status==='ready'&&!x.reportKind&&x.parsed?.columns?.length&&x.parsed?.start&&x.parsed?.end);
  const picker=$('nsPicker');picker.hidden=false;picker.dataset.role=role;
  picker.innerHTML='<div class="ns-popup-head"><h3>Add '+(role==='observed'?'observed datasets':'datasets to '+html(n.newScenario||'Baseline'))+'</h3><button data-ns-close-picker aria-label="Close source picker">×</button></div><input id="nsSourceSearch" type="search" placeholder="Search imported datasets" aria-label="Search imported datasets"><div class="ns-file-list">'+files.map(x=>'<label data-ns-file-name="'+html(x.displayName.toLowerCase())+'"><input type="checkbox" value="'+html(x.id)+'"><span>'+html(x.displayName)+'<small>'+html(x.parsed.start.slice(0,10)+' to '+x.parsed.end.slice(0,10))+'</small></span></label>').join('')+'</div>'+(files.length?'':'<p>Import time-series files in Data / Time Series first. Sources appear after authoritative parsing completes.</p>')+'<button id="nsAddSelected" class="ns-primary">Add selected files</button>';
  $('nsSourceSearch')?.focus();
}
function addSelected(){
  const n=node(),role=$('nsPicker').dataset.role,ids=[...$('nsPicker').querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
  if(!ids.length){status('Select at least one imported file.');return;}
  checkpoint();
  for(const id of ids){
    const item=state.files.get(id),col=item.parsed.columns.find(c=>['depth','level'].includes(seriesQuantity(item,c)))||item.parsed.columns[0],year=C.mainYear(item.parsed.start,item.parsed.end);
    const scenario=role==='model'?(n.newScenario||'Baseline').trim():'Observed';
    if(n.bindings.some(b=>b.sha256===item.hash&&b.role===role&&b.scenario===scenario&&b.column===col))continue;
    const quantity=seriesQuantity(item,col)||'depth';
    n.bindings.push({id:uid(),sourceId:id,sha256:item.hash,sourceName:item.displayName,column:col,role,scenario,years:year?[year]:[],threshold:'',quantity:['depth','level','flow'].includes(quantity)?quantity:'status',unit:seriesUnit(item,col)||'',datum:seriesReference(item,col)||''});
  }
  $('nsPicker').hidden=true;changed();renderDrawer();status('Files assigned together. Review channels, reporting years, units and thresholds, then Apply & calculate.');
}
function parsedExclusions(text){
  return String(text).split('\n').filter(x=>x.trim()).map(line=>{const [start,end,...reason]=line.split(',').map(x=>x.trim());if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(start)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(end)||start>=end)throw new Error('Each exclusion needs model-clock ISO start, later end, and reason.');return {start,end,reason:reason.join(', ')||'Asset exclusion'};});
}
function calculationRows(n){
  if(!n.bindings.length)throw new Error('Assign at least one observed or modelled source.');
  C.reportingConflicts(n.bindings);
  return n.bindings.map(b=>{
    const source=sourceFor(b);if(!source)throw new Error('Reload the matching source '+b.sourceName+'.');
    if(!source.parsed.columns.includes(b.column))throw new Error('Select a valid channel for '+b.sourceName+'.');
    if(!b.years.length)throw new Error('Select reporting years for '+b.sourceName+'.');
    const resolved=C.effectiveThreshold(b,n.defaults);
    if(!b.unit)throw new Error('Assign the source-value unit for '+b.sourceName+'.');
    const current=contract(b);
    const scale=C.valueScale(b.quantity,current.unit,b.unit);
    return {binding:b,source,threshold:resolved.value/scale,comparison:resolved.comparison};
  });
}
async function calculate(){
  const n=node();if(!n||busy)return;
  if(root().querySelector('[aria-invalid="true"]')){status('Correct the invalid asset settings before calculating.');return;}
  let assignments;try{assignments=calculationRows(n);if(!Number.isFinite(n.gap)||n.gap<=0)throw new Error('Maximum valid gap must be positive.');}catch(error){status(error.message);return;}
  busy=true;const sig=signature(n),rows=[];renderDrawer();
  try{
    for(let i=0;i<assignments.length;i++){
      const {binding:b,source,threshold,comparison}=assignments[i];status('Calculating '+(i+1)+'/'+assignments.length+' · '+source.displayName);await new Promise(resolve=>requestAnimationFrame(resolve));
      const result=await engine.call('network_spill_result',{path:source.virtualPath,column:b.column,threshold,comparison,years_json:JSON.stringify(b.years),exclusions_json:JSON.stringify(n.exclusions),max_gap_seconds:n.gap});
      const scale=C.valueScale(b.quantity,contract(b).unit,b.unit);
      rows.push(...result.rows.map(row=>({...row,threshold:threshold*scale,value_min:row.value_min==null?row.value_min:row.value_min*scale,value_max:row.value_max==null?row.value_max:row.value_max*scale,role:b.role,scenario:b.scenario,comparison,source_sha256:b.sha256,source_name:b.sourceName,column:b.column,quantity:b.quantity,unit:b.unit,datum:b.datum,exclusions:n.exclusions,context_start:result.context_start})));
    }
    if(sig!==signature(n))throw new Error('Asset inputs changed while calculating. Reapply the settings.');
    freshness.clear();n.applied={signature:sig,rows,settings:{gap:n.gap,confirmed:n.confirmed},calculated_at:new Date().toISOString()};persist();status('Applied '+assignments.length+' sources. Spill results are frozen to these settings.');
  }catch(error){status(String(error.message||error).split('\n').filter(x=>x.trim()).at(-1));}
  finally{busy=false;render();}
}
function updateField(target){
  if(!target.closest('[data-ns-binding]')&&!['nsName','nsType','nsArrow','nsLabelX','nsLabelY','nsObservedDefault','nsModelDefault','nsNewScenario','nsGap','nsConfirmed','nsExclusions','nsPinned','nsReviewComment','nsReviewStatus'].includes(target.id))return;
  const n=node(),e=edge();if(!n&&!e)return;
  target.removeAttribute('aria-invalid');
  if(target.validity?.badInput){target.setAttribute('aria-invalid','true');status('Enter a valid number before calculating.');return;}
  const container=target.closest('[data-ns-binding]');
  if(container&&n){
    const b=n.bindings.find(b=>b.id===container.dataset.nsBinding),key=target.dataset.nsBindingField;
    if(!b||!key)return;
    try{checkpoint();if(key==='unit'&&b.unit&&target.value&&contract(b).unit){let threshold;try{threshold=C.effectiveThreshold(b,n.defaults);}catch{}if(threshold)b.threshold=threshold.value*C.valueScale(b.quantity,b.unit,target.value);}
      if(key==='years')b.years=C.validateYears(target.value);else if(key==='threshold')b.threshold=target.value===''?'':Number(target.value);else if(key==='scenario')b.scenario=target.value.trim()||'Baseline';else b[key]=target.value;
      if(key==='column'){const item=sourceFor(b);b.quantity=seriesQuantity(item,b.column)||b.quantity;b.unit=seriesUnit(item,b.column)||'';b.datum=seriesReference(item,b.column)||'';}
      if(['column','quantity'].includes(key))b.comparison=b.quantity==='flow'?'gt':'ge';if(key==='quantity')b.unit=b.quantity==='status'?'1':'';changed();if(['column','quantity','threshold','comparison','unit'].includes(key))renderDrawer();
      if(analysisContext?.id===n.id){renderAnalysisSettings(n);$('nsAnalysisCounts').innerHTML=annualTable(n,true);$('nsAnalysisAudit').innerHTML=auditHtml(n);$('nsCommonResult').hidden=true;if(analysisContext.mode==='series')void plotAnalysis(++analysisGeneration);}
    }catch(error){status(error.message);target.setAttribute('aria-invalid','true');}return;
  }
  const object=n||e;
  try{
    checkpoint();
    if(target.id==='nsName')object.name=target.value.trim()||C.types[n?.type]||'Connector';
    else if(target.id==='nsType')n.type=target.value;
    else if(target.id==='nsArrow')e.arrow=target.checked;
    else if(target.id==='nsPinned')n.pinned=target.checked;
    else if(target.id==='nsReviewComment'){object.review={...R.review(object),comment:target.value.slice(0,10000)};}
    else if(target.id==='nsReviewStatus'){object.review={...R.review(object),status:target.value};}
    else if(target.id==='nsLabelX'||target.id==='nsLabelY')n.nameOffset={...C.labelOffset(n),[target.id==='nsLabelX'?'x':'y']:Math.max(-10000,Math.min(10000,finite(target.value)))};
    else if(target.id==='nsObservedDefault')n.defaults.observed=target.value;
    else if(target.id==='nsModelDefault')n.defaults.model=target.value;
    else if(target.id==='nsNewScenario')n.newScenario=target.value.trim()||'Baseline';
    else if(target.id==='nsGap')n.gap=Number(target.value);
    else if(target.id==='nsConfirmed')n.confirmed=target.checked;
    else if(target.id==='nsExclusions')n.exclusions=parsedExclusions(target.value);
    else return;
    changed();if(['nsType','nsObservedDefault','nsModelDefault'].includes(target.id))renderDrawer();
  }catch(error){status(error.message);target.setAttribute('aria-invalid','true');}
}
function removeSelected(){
  if(busy||prefs().locked)return;checkpoint();const ids=new Set([...multi,selected]);network.nodes=network.nodes.filter(n=>!ids.has(n.id));network.edges=network.edges.filter(e=>!ids.has(e.id)&&!ids.has(e.from)&&!ids.has(e.to));multi.clear();selected=null;popupVisible=false;changed();renderDrawer();
}
function addBend(e,index,p){
  if(!e||busy||prefs().locked||(e.bends||[]).length>=32)return false;
  checkpoint();e.bends=e.bends||[];e.bends.splice(index,0,p);changed(true);renderDrawer();return true;
}
function onClick(event){
  const t=event.target;
  if(t.closest('[data-ns-close-picker]')){$('nsPicker').hidden=true;return;}
  if(t.id==='nsAddSelected'){addSelected();return;}
  const sources=t.closest('[data-ns-add-sources]');if(sources){showSourcePicker(sources.dataset.nsAddSources);return;}
  const remove=t.closest('[data-ns-remove-binding]');if(remove){checkpoint();node().bindings=node().bindings.filter(b=>b.id!==remove.dataset.nsRemoveBinding);changed();renderDrawer();return;}
  if(t.closest('[data-ns-delete]')){removeSelected();return;}
  if(t.closest('[data-ns-close-selection]')){selected=null;renderDrawer();renderCanvas();return;}
  if(t.closest('[data-ns-close-popup]')){popupVisible=false;renderPopup();return;}
  if(t.closest('[data-ns-edit-selected]')){editing=true;popupVisible=false;render();return;}
  const swatch=t.closest('[data-ns-colour]');if(swatch){colour=swatch.dataset.nsColour;render();return;}
  const objectColour=t.closest('[data-ns-object-colour]');if(objectColour){checkpoint();(node()||edge()).colour=objectColour.dataset.nsObjectColour;changed();renderDrawer();return;}
  if(t.id==='nsResetLabel'){if(prefs().locked)return;checkpoint();delete node().nameOffset;delete node().labelOffset;changed(true);renderDrawer();return;}
  if(t.id==='nsStraighten'){if(prefs().locked)return;checkpoint();edge().bends=[];changed(true);renderDrawer();return;}
  const removeBend=t.closest('[data-ns-remove-bend]');if(removeBend){if(prefs().locked)return;checkpoint();edge().bends.splice(Number(removeBend.dataset.nsRemoveBend),1);changed(true);renderDrawer();return;}
  if(t.id==='nsAddBend'){
    const e=edge(),route=C.connector(e,network.nodes,network.edges,n=>point(n.x,n.y));if(!route)return;
    const lengths=route.points.slice(1).map((p,i)=>Math.hypot(p.x-route.points[i].x,p.y-route.points[i].y)),i=lengths.indexOf(Math.max(...lengths)),a=route.points[i],b=route.points[i+1];
    addBend(e,i,world((a.x+b.x)/2,(a.y+b.y)/2));return;
  }
  if(t.id==='nsCalculate'){void calculate();return;}
}
function onPointerDown(event){
  if(event.button!==0||event.target.closest('#nsPopup,#nsPicker,#nsHover,.ns-camera-tools'))return;
  const canvas=$('nsCanvas'),rect=canvas.getBoundingClientRect(),id=event.target.closest('[data-ns-node]')?.dataset.nsNode,wire=event.target.closest('[data-ns-edge]')?.dataset.nsEdge;
  if(wire&&editing&&tool!=='pan'){
    selected=wire;multi.clear();const e=edge(),edgeLabel=event.target.closest('[data-ns-edge-label]'),bend=event.target.closest('[data-ns-bend]'),add=event.target.closest('[data-ns-add-bend]');
    if(tool==='select'&&!busy&&!prefs().locked&&edgeLabel){checkpoint();const offset=e.labelOffset||{x:0,y:0};drag={kind:'edge-label',id:wire,x:event.clientX,y:event.clientY,startX:offset.x,startY:offset.y};canvas.setPointerCapture(event.pointerId);event.preventDefault();}
    if(tool==='select'&&!busy&&!prefs().locked&&(bend||add)){
      const index=Number(bend?.dataset.nsBend??add.dataset.nsAddBend);
      if(add){if(!addBend(e,index,world(event.clientX-rect.left,event.clientY-rect.top)))return;}else checkpoint();
      const p=e.bends[index];drag={kind:'bend',id:wire,index,x:event.clientX,y:event.clientY,startX:p.x,startY:p.y,moved:false};
      canvas.setPointerCapture(event.pointerId);event.preventDefault();
    }
    renderDrawer();renderCanvas();return;
  }
  const label=event.target.closest('[data-ns-label],[data-ns-summary]');
  if(id&&tool!=='pan'){if(event.shiftKey&&tool==='select'){if(multi.has(id))multi.delete(id);else multi.add(id);selected=id;popupVisible=false;renderCanvas();renderReview();return;}selectPoint(id);if(!editing||tool==='connect'||busy)return;}
  const n=id?network.nodes.find(n=>n.id===id):null;
  if(n&&editing&&tool==='select'&&!prefs().locked&&(!n.pinned||label)){checkpoint();const offset=C.labelOffset(n);drag={kind:label?'label':'node',id,x:event.clientX,y:event.clientY,startX:label?offset.x:n.x,startY:label?offset.y:n.y,moved:false,group:network.nodes.filter(x=>multi.has(x.id)&&!x.pinned).map(x=>({id:x.id,x:x.x,y:x.y}))};}
  else{drag={kind:'pan',x:event.clientX,y:event.clientY,camera:{...network.camera},moved:false};}
  canvas.setPointerCapture(event.pointerId);event.preventDefault();
}
function onPointerMove(event){
  if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.moved=drag.moved||Math.abs(dx)+Math.abs(dy)>3;
  if(drag.kind==='node'){for(const saved of drag.group||[]){const n=network.nodes.find(n=>n.id===saved.id),step=prefs().snap?20:0;n.x=saved.x+dx/network.camera.zoom;n.y=saved.y+dy/network.camera.zoom;if(step){n.x=Math.round(n.x/step)*step;n.y=Math.round(n.y/step)*step;}}}
  else if(drag.kind==='label'){const n=network.nodes.find(n=>n.id===drag.id);if(n)n.nameOffset={x:Math.max(-10000,Math.min(10000,drag.startX+dx)),y:Math.max(-10000,Math.min(10000,drag.startY+dy))};}
  else if(drag.kind==='edge-label'){const e=edge();if(e)e.labelOffset={x:Math.max(-10000,Math.min(10000,drag.startX+dx)),y:Math.max(-10000,Math.min(10000,drag.startY+dy))};}
  else if(drag.kind==='bend'){const e=network.edges.find(e=>e.id===drag.id);if(e?.bends[drag.index])e.bends[drag.index]={x:drag.startX+dx/network.camera.zoom,y:drag.startY+dy/network.camera.zoom};}
  else{network.camera.x=drag.camera.x+dx;network.camera.y=drag.camera.y+dy;}
  if(frame===null)frame=requestAnimationFrame(()=>{frame=null;if(drag?.kind==='label')renderCanvas();else renderGeometry();});
}
function onPointerUp(event){if(!drag)return;if(frame!==null){cancelAnimationFrame(frame);frame=null;}drag=null;renderCanvas();try{$('nsCanvas').releasePointerCapture(event.pointerId);}catch{}persist();if(editing)renderDrawer();}
function exportRows(){
  const headers=['asset_id','asset_name','type','year','role','scenario','spill_count','duration_hours','eligible','analysis_start','analysis_end','valid_hours','unknown_hours','excluded_hours','count_status','counting_basis','source_name','source_sha256','column','threshold','comparison','continuous_spill','value_min','value_max','unit','quantity','context_start','max_gap_seconds','exclusions','comparison_basis_confirmed','calculated_at','current'];
  const rows=network.nodes.flatMap(n=>(n.applied?.rows||[]).map(r=>({...r,asset_id:n.id,asset_name:n.name,type:n.type,max_gap_seconds:n.applied.settings?.gap??'',exclusions:JSON.stringify(r.exclusions||[]),comparison_basis_confirmed:n.applied.settings?.confirmed??'',calculated_at:n.applied.calculated_at,current:isFresh(n)})));
  const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';downloadBlob('hydra-network-spill-evidence.csv',[headers.join(','),...rows.map(r=>headers.map(k=>cell(r[k])).join(','))].join('\n'),'text/csv');
}
function exportPopupSvg(){
  // Compose the actually visible HTML popup as SVG primitives. This includes
  // wrapped labels, period/coverage rows, RAG fills and the current scroll
  // position, without foreignObject or a screenshot dependency.
  const pop=$('nsPopup');if(!pop||pop.hidden)return '';
  const canvas=$('nsCanvas').getBoundingClientRect(),outer=pop.getBoundingClientRect(),body=pop.querySelector('.ns-popup-body'),bodyRect=body.getBoundingClientRect();
  const x=r=>r.left-canvas.left,y=r=>r.top-canvas.top;
  let output='<defs><clipPath id="nsCapturePopup"><rect x="'+x(outer)+'" y="'+y(outer)+'" width="'+outer.width+'" height="'+outer.height+'" rx="8"/></clipPath><clipPath id="nsCaptureBody"><rect x="'+x(bodyRect)+'" y="'+y(bodyRect)+'" width="'+bodyRect.width+'" height="'+bodyRect.height+'"/></clipPath></defs><g clip-path="url(#nsCapturePopup)"><rect x="'+x(outer)+'" y="'+y(outer)+'" width="'+outer.width+'" height="'+outer.height+'" rx="8" fill="white" stroke="#c7d2d9"/>';
  for(const el of pop.querySelectorAll('*')){
    const r=el.getBoundingClientRect(),style=getComputedStyle(el),inside=body.contains(el),clip=inside?' clip-path="url(#nsCaptureBody)"':'';
    if(style.display==='none'||r.bottom<outer.top||r.top>outer.bottom)continue;
    if(style.backgroundColor!=='rgba(0, 0, 0, 0)'&&style.backgroundColor!=='transparent')output+='<rect x="'+x(r)+'" y="'+y(r)+'" width="'+r.width+'" height="'+r.height+'" fill="'+html(style.backgroundColor)+'"'+clip+'/>';
    if(parseFloat(style.borderBottomWidth)>0&&style.borderBottomStyle!=='none')output+='<path d="M'+x(r)+' '+(y(r)+r.height)+'h'+r.width+'" stroke="'+html(style.borderBottomColor)+'" stroke-width="1"'+clip+'/>';
  }
  const walker=document.createTreeWalker(pop,NodeFilter.SHOW_TEXT);let textNode;
  while((textNode=walker.nextNode())){
    if(!textNode.textContent.trim())continue;const parent=textNode.parentElement,style=getComputedStyle(parent);
    if(style.display==='none')continue;const range=document.createRange(),lines=[];let line=null;
    for(let i=0;i<textNode.textContent.length;i++){
      range.setStart(textNode,i);range.setEnd(textNode,i+1);const r=range.getBoundingClientRect();if(!r.width&&!r.height)continue;
      if(!line||Math.abs(line.top-r.top)>2){line={left:r.left,top:r.top,height:r.height,text:''};lines.push(line);}line.text+=textNode.textContent[i];
    }
    const clip=body.contains(parent)?' clip-path="url(#nsCaptureBody)"':'';
    for(const line of lines)output+='<text x="'+(line.left-canvas.left)+'" y="'+(line.top-canvas.top+parseFloat(style.fontSize))+'" font-family="'+html(style.fontFamily)+'" font-size="'+parseFloat(style.fontSize)+'" font-weight="'+html(style.fontWeight)+'" fill="'+html(style.color)+'"'+clip+'>'+html(line.text)+'</text>';
  }
  return output+'</g>';
}
async function capture(){
  const d=dimensions(),n=popupVisible&&!editing?node():null;let overlay='';
  if(n)overlay=exportPopupSvg();
  const text='<svg xmlns="'+NS+'" width="'+d.width+'" height="'+d.height+'" viewBox="0 0 '+d.width+' '+d.height+'"><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" fill="#182732">'+svgContent(false)+overlay+'<text x="12" y="'+(d.height-12)+'" font-size="11" fill="#60717d">Hydra Bench · '+html(network.year==='all'?'All years':network.year)+' · '+html(network.evidenceMode==='combined'?'Observed + all models':network.scenario)+' · connections show topology only</text></g></svg>';
  const blob=new Blob([text],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
  try{await document.fonts?.ready;const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=d.width*2;canvas.height=d.height*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawImage(image,0,0);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('Could not create screenshot.');const link=document.createElement('a'),pngUrl=URL.createObjectURL(png);link.href=pngUrl;link.download='hydra-network-schematic.png';link.click();setTimeout(()=>URL.revokeObjectURL(pngUrl),1000);status('Network PNG captured with the open evidence table.');}
  finally{URL.revokeObjectURL(url);}
}
function reviewFields(object){
  const r=R.review(object);return '<details class="ns-review-notes"><summary>Review notes</summary>'+fields('Status',selectHtml('id="nsReviewStatus"',[['unreviewed','Unreviewed'],['in-review','In review'],['reviewed','Reviewed']],r.status))+fields('Comment','<textarea id="nsReviewComment" rows="3" maxlength="10000">'+html(r.comment)+'</textarea>')+'</details>';
}
function nodeHealth(n){return R.health(n,isFresh(n),n.bindings.every(b=>Boolean(sourceFor(b))));}
function resultRag(n){
  if(!isFresh(n))return null;
  const groups=R.annualGroups(n,prefs().scenarios);
  const values=groups.filter(g=>(network.year==='all'||g.year===Number(network.year))&&g.model&&!C.comparable(g.observed,g.model,n.confirmed,network.metric)).map(g=>C.rag(g.observed[network.metric],g.model[network.metric]));
  return values.includes('red')?'red':values.includes('amber')?'amber':values.includes('green')?'green':null;
}
function visibleNodes(){
  const p=prefs();return network.nodes.filter(n=>(p.type==='all'||n.type===p.type)&&(p.health==='all'||nodeHealth(n)===p.health)&&(p.result==='all'||(resultRag(n)||'neutral')===p.result));
}
function applyDecorations(){
  const byId=new Map(network.nodes.map(n=>[n.id,n]));
  for(const g of $('nsSvg').querySelectorAll('[data-ns-node]')){const n=byId.get(g.dataset.nsNode);g.style.opacity=highlight&&!highlight.ids.has(n.id)?'.2':'1';g.classList.toggle('ns-multi-selected',multi.has(n.id));if(asset(n)){const h=nodeHealth(n);if(h!=='ready'){const dot=document.createElementNS(NS,'circle');dot.setAttribute('cx','-34');dot.setAttribute('cy','-24');dot.setAttribute('r','4');dot.setAttribute('fill',h==='stale'?'#9a6500':h==='missing'?'#b93838':'#82939f');const title=document.createElementNS(NS,'title');title.textContent=healthLabel(h);dot.append(title);g.append(dot);}}}
  for(const g of $('nsSvg').querySelectorAll('[data-ns-edge]'))g.style.opacity=highlight&&!highlight.wires.has(g.dataset.nsEdge)?'.15':'1';
  const hidden=network.nodes.length-visibleNodes().length;if($('nsHiddenCount'))$('nsHiddenCount').textContent=hidden?hidden+' hidden':'';
}
function healthLabel(value){return {ready:'Ready',missing:'Reload source',stale:'Recalculate',short:'Short coverage',provisional:'Provisional count',unassigned:'No datasets',uncalculated:'Not calculated'}[value]||value;}
function centre(id){const n=network.nodes.find(n=>n.id===id);if(!n)return;const d=dimensions();network.camera.x=d.width*.3-n.x*network.camera.zoom;network.camera.y=d.height*.5-n.y*network.camera.zoom;selected=id;multi=new Set([id]);popupVisible=!editing;persist();render();renderReview();}
function hideHover(){clearTimeout(hoverTimer);if($('nsHover'))$('nsHover').hidden=true;}
function hoverCard(id){
  const n=network.nodes.find(n=>n.id===id);if(!n||!asset(n)||editing||drag||popupVisible)return;
  const hover=$('nsHover'),d=dimensions(),p=point(n.x,n.y);hover.innerHTML='<strong>'+html(n.name)+'</strong><div class="ns-hover-table">'+annualTable(n,false)+'</div><small>Click asset to inspect</small>';hover.hidden=false;const w=Math.min(460,d.width-24);hover.style.width=w+'px';hover.style.left=Math.max(12,Math.min(d.width-w-12,p.x+45))+'px';hover.style.top=Math.max(12,Math.min(d.height-hover.offsetHeight-70,p.y+15))+'px';
}
function annualTable(n,differences=false,scenarios=prefs().scenarios){
  const fresh=isFresh(n),groups=R.annualGroups(n,scenarios),cell=(value,rag)=>'<td'+(rag?' class="ns-rag-'+rag+'"':'')+'>'+f(value,Number.isInteger(value)?0:1)+'</td>';
  const signed=value=>value===null?'—':(value>0?'+':'')+f(value,1);
  return '<table class="ns-annual-table"><thead><tr><th>Year</th><th>Scenario</th><th>O count</th><th>M count</th><th>O h</th><th>M h</th>'+(differences?'<th>Δ count</th><th>Δ h</th>':'')+'</tr></thead><tbody>'+groups.map(g=>{
    const reason=metric=>!fresh?'Recalculate':g.model?C.comparable(g.observed,g.model,n.confirmed,metric):'No model evidence',countValid=!reason('spill_count'),durationValid=!reason('duration_hours'),o=fresh?g.observed:null,m=fresh?g.model:null;
    return '<tr data-ns-focus="'+html(n.id)+'" data-ns-year="'+g.year+'" title="'+html(reason('spill_count')||reason('duration_hours'))+'"><td>'+g.year+'</td><td>'+html(g.scenario)+'</td>'+cell(o?.spill_count)+cell(m?.spill_count,countValid?C.rag(o.spill_count,m.spill_count):null)+cell(o?.duration_hours)+cell(m?.duration_hours,durationValid?C.rag(o.duration_hours,m.duration_hours):null)+(differences?'<td>'+signed(countValid?R.delta(o.spill_count,m.spill_count):null)+'</td><td>'+signed(durationValid?R.delta(o.duration_hours,m.duration_hours):null)+'</td>':'')+'</tr>';
  }).join('')+'</tbody></table>';
}
function renderReview(){
  if(!$('nsReviewTools'))return;
  const p=prefs(),names=[...new Set(network.nodes.flatMap(n=>n.bindings.filter(b=>b.role==='model').map(b=>b.scenario)))].sort();
  $('nsTypeFilter').value=p.type;$('nsHealthFilter').value=p.health;$('nsResultFilter').value=p.result;$('nsDetail').value=p.detail;$('nsSnap').checked=p.snap;$('nsLocked').checked=p.locked;
  $('nsRedo').disabled=!redo.length||busy;
  $('nsScenarioChoices').innerHTML=names.map(name=>'<label><input type="checkbox" data-ns-scenario-choice="'+html(name)+'" '+(p.scenarios===null||p.scenarios.includes(name)?'checked':'')+'>'+html(name)+'</label>').join('')||'<small>No model scenarios assigned</small>';
  $('nsViewSelect').innerHTML='<option value="">Saved views</option>'+network.views.map((v,i)=>'<option value="'+i+'">'+html(v.name)+'</option>').join('');
  $('nsSnapshotSelect').innerHTML='<option value="">Review snapshots</option>'+network.reviewSnapshots.map((v,i)=>'<option value="'+i+'">'+html(v.name)+'</option>').join('');
  $('nsSelectionCount').textContent=multi.size>1?multi.size+' selected':'';
  if(!$('nsMatrix').hidden)renderMatrix();
}
function renderMatrix(){
  const selectedOnly=$('nsMatrixSelected').checked,query=$('nsMatrixSearch').value.toLowerCase();
  const nodes=network.nodes.filter(n=>asset(n)&&(!selectedOnly||multi.has(n.id))&&n.name.toLowerCase().includes(query));
  $('nsMatrixBody').innerHTML=nodes.map(n=>'<section><button class="ns-asset-link" data-ns-centre="'+html(n.id)+'">'+html(n.name)+'</button>'+annualTable(n,true)+'</section>').join('')||'<p>No matching assets.</p>';
}
function undoEdit(forward=false){
  if(busy)return;const source=forward?redo:history,dest=forward?history:redo;if(!source.length)return;dest.push(JSON.stringify(network));network=JSON.parse(source.pop());selected=null;multi.clear();highlight=null;popupVisible=false;freshness.clear();persist();render();renderReview();
}
function arrange(kind){
  if(busy||prefs().locked)return;checkpoint();
  if(kind==='auto'){const positions=R.autoLayout(network.nodes,network.edges);for(const n of network.nodes){const p=positions.get(n.id);n.x=p.x;n.y=p.y;}for(const e of network.edges){if(!network.nodes.find(n=>n.id===e.from)?.pinned&&!network.nodes.find(n=>n.id===e.to)?.pinned)e.bends=[];}}
  else{const nodes=network.nodes.filter(n=>multi.has(n.id)&&!n.pinned);if(nodes.length<2){status('Shift-click two or more unpinned assets.');history.pop();return;}const axis=kind==='left'||kind==='horizontal'?'x':'y';if(kind==='left'||kind==='top'){const v=Math.min(...nodes.map(n=>n[axis]));nodes.forEach(n=>n[axis]=v);}else{const ordered=nodes.sort((a,b)=>a[axis]-b[axis]),min=ordered[0][axis],max=ordered.at(-1)[axis];ordered.forEach((n,i)=>n[axis]=min+(max-min)*i/(ordered.length-1));}}
  changed(true);fit();renderReview();
}
function saveView(){
  const name=$('nsViewName').value.trim();if(!name){status('Enter a view name.');return;}
  checkpoint();network.views=network.views.filter(v=>v.name!==name);network.views.push({name:name.slice(0,100),camera:{...network.camera},year:network.year,scenario:network.scenario,evidenceMode:network.evidenceMode,metric:network.metric,preferences:{...prefs()},positions:network.nodes.map(n=>({id:n.id,x:n.x,y:n.y,nameOffset:n.nameOffset})),edges:network.edges.map(e=>({id:e.id,bends:e.bends,labelOffset:e.labelOffset}))});network.views=network.views.slice(-30);changed(true);status('View saved.');
}
function loadView(index){
  const v=network.views[Number(index)];if(!v)return;checkpoint();for(const key of ['camera','year','scenario','evidenceMode','metric','preferences'])if(v[key]!==undefined)network[key]=JSON.parse(JSON.stringify(v[key]));const nodes=new Map(network.nodes.map(n=>[n.id,n])),edges=new Map(network.edges.map(e=>[e.id,e]));for(const p of v.positions){const n=nodes.get(p.id);if(n){n.x=p.x;n.y=p.y;n.nameOffset=p.nameOffset;}}for(const p of v.edges||[]){const e=edges.get(p.id);if(e){e.bends=p.bends||[];e.labelOffset=p.labelOffset;}}changed(true);render();
}
function saveReviewSnapshot(){
  const name=$('nsViewName').value.trim()||new Date().toLocaleString(),copy=snapshot();delete copy.reviewSnapshots;delete copy.views;
  checkpoint();network.reviewSnapshots.push({name:name.slice(0,100),saved_at:new Date().toISOString(),build:buildToken,method:'occupied 12/24; network method 2',network:copy});network.reviewSnapshots=network.reviewSnapshots.slice(-20);changed(true);status('Assessment snapshot saved.');
}
function downloadReviewSnapshot(index){const saved=network.reviewSnapshots[Number(index)];if(saved)downloadBlob('hydra-network-review-snapshot.json',JSON.stringify({...saved,network:C.validateNetwork(saved.network)},null,2),'application/json');}
function wholeSceneSvg(){
  const before={camera:network.camera,preferences:network.preferences},d=dimensions();let content,bounds;
  try{network.camera={x:0,y:0,zoom:1};network.preferences={...prefs(),detail:'full',type:'all',health:'all',result:'all'};content=svgContent(false);const svg=document.createElementNS(NS,'svg');svg.innerHTML=content;svg.style.cssText='position:fixed;left:-100000px;top:0;width:1000px;height:1000px';document.body.append(svg);try{bounds=svg.getBBox();}finally{svg.remove();}}
  finally{network.camera=before.camera;network.preferences=before.preferences;}
  const width=Math.max(300,bounds.width+60),height=Math.max(200,bounds.height+100),x=bounds.x-30,y=bounds.y-30;
  return '<svg xmlns="'+NS+'" width="'+Math.ceil(width)+'" height="'+Math.ceil(height)+'" viewBox="'+x+' '+y+' '+width+' '+height+'"><rect x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'" fill="white"/><g font-family="Arial, sans-serif" fill="#182732">'+content+'<text x="'+(x+12)+'" y="'+(y+height-32)+'" font-size="11">'+html('Hydra Bench · '+(network.year==='all'?'All reporting years':network.year)+' · '+(network.metric==='spill_count'?'Spill count':'Duration (h)'))+'</text><text x="'+(x+12)+'" y="'+(y+height-14)+'" font-size="10" fill="#60717d">Topology only · result RAG: ≤5% / ≤10% / >10% · network colours are user categories</text></g></svg>';
}
function exportReport(){
  const report=window.open('','_blank');if(!report){status('Allow this report window to open.');return;}
  const svg=wholeSceneSvg(),nodes=network.nodes.filter(asset),css='body{font:12px Arial,sans-serif;color:#182732;margin:24px}h1{font-size:21px}h2{font-size:16px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{padding:7px;border-bottom:1px solid #dbe3e8;text-align:right}th:nth-child(2),td:nth-child(2){text-align:left}th{background:#f5f7f9}small,details{color:#60717d}.ns-rag-green{background:#eaf6ed}.ns-rag-amber{background:#fff4d9}.ns-rag-red{background:#fdebec}svg{width:100%;height:auto;max-height:80vh}section{break-inside:avoid;margin:24px 0}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}svg{max-height:160mm}details:not([open])>*:not(summary){display:none!important}}';
  report.document.open();report.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Network annual spill review</title><style>'+css+'</style></head><body><button id="printReport">Print / Save PDF</button><h1>Network annual spill review</h1><small>'+html(new Date().toISOString())+' · build '+html(buildToken)+' · counts: occupied 12/24 blocks · duration: hours · Δ = model − observed</small>'+svg+nodes.map(n=>'<section><h2>'+html(n.name)+'</h2>'+annualTable(n,true)+(R.review(n).comment?'<p>'+html(R.review(n).comment)+'</p>':'')+'<small>Review: '+html(R.review(n).status)+' · '+html(healthLabel(nodeHealth(n)))+'</small><details><summary>Assessment basis</summary>'+auditHtml(n)+'</details></section>').join('')+'<h2>Connector notes</h2>'+network.edges.filter(e=>R.review(e).comment).map(e=>'<p><strong>'+html(e.name||e.from+' → '+e.to)+'</strong>: '+html(R.review(e).comment)+'</p>').join('')+'<p>RAG describes agreement, not spill severity. Partial years are not annualised. Missing or provisional evidence remains qualified.</p><footer>Hydra Bench · Anzar Sajid</footer></body></html>');report.document.close();report.document.getElementById('printReport').onclick=()=>report.print();report.focus();status('Report opened. Use Print / Save PDF.');
}
function auditHtml(n){
  return (n.applied?.rows||[]).map(r=>'<p>'+html(r.year+' · '+(r.role==='observed'?'Observed':r.scenario)+' · '+r.source_name+' · '+r.column)+'<br>'+html((r.analysis_start||'—')+' to '+(r.analysis_end||'—'))+' · '+html(r.partial_year?'partial year':'')+'<br>Threshold '+html(C.thresholdRule(r)==='gt'?'>':'≥')+' '+f(r.threshold,6)+' '+html(r.unit||'')+' · '+html(r.quantity||'')+' '+html(r.datum||'')+'<br>Valid '+f(r.valid_hours)+' h · unknown '+f(r.unknown_hours)+' h · excluded '+f(r.excluded_hours)+' h · '+html(r.count_status||'')+'<br>SHA-256 '+html(r.source_sha256||'')+'<br>Exclusions '+html(JSON.stringify(r.exclusions||[]))+'</p>').join('')+'<p>Calculated '+html(n.applied?.calculated_at||'—')+' · gap '+f(n.applied?.settings?.gap)+' s · comparison basis '+html(n.applied?.settings?.confirmed?'confirmed':'unconfirmed')+'</p>';
}
function renderAnalysisSettings(n){
  const year=Number($('nsAnalysisYear').value),chosen=prefs().scenarios;
  $('nsAnalysisSources').innerHTML=n.bindings.filter(b=>b.years.includes(year)&&(b.role==='observed'||chosen===null||chosen.includes(b.scenario))).map(b=>{
    const source=sourceFor(b),metadata=contract(b);
    return '<div class="ns-source-row" data-ns-binding="'+html(b.id)+'"><strong>'+html((b.role==='observed'?'Observed':b.scenario)+' · '+b.sourceName)+'</strong>'+fields('Channel',selectHtml('data-ns-binding-field="column"',(source?.parsed.columns||[b.column]).map(c=>[c,c]),b.column))+'<div class="ns-two">'+fields('Quantity',selectHtml('data-ns-binding-field="quantity"',[['depth','Depth'],['level','Level'],['flow','Overflow flow'],['status','Spill status']],b.quantity))+fields('Values / threshold unit',selectHtml('data-ns-binding-field="unit"',unitOptions(b.quantity),b.unit))+'</div><div class="ns-two">'+fields('Threshold ('+html(b.unit||'assign unit')+')','<input data-ns-binding-field="threshold" type="number" step="any" value="'+html(b.threshold)+'" placeholder="Asset default">')+fields('Spill when',selectHtml('data-ns-binding-field="comparison"',[['gt','Above (>)'],['ge','At or above (≥)']],C.thresholdRule(b)))+'</div>'+(b.quantity==='level'?fields('Level datum','<input data-ns-binding-field="datum" value="'+html(b.datum||'')+'">'):'')+'<small>'+html(metadata.unit?'Stored values: '+metadata.unit+'. Unit changes convert values and thresholds.':'Unit not detected. Assign the unit of the existing numbers; values and thresholds are retained.')+'</small></div>';
  }).join('');
}
async function openAnalysis(mode='series'){
  const n=node();if(!n||!asset(n))return;hideHover();const generation=++analysisGeneration,years=R.years(n),year=network.year==='all'?years.at(-1):Number(network.year);
  if(!year){status('Assign reporting years first.');return;}
  analysisContext={id:n.id,year,mode,signature:signature(n)};
  $('nsAnalysis').hidden=false;$('nsCloseAnalysis').focus();$('nsAnalysisTitle').textContent=n.name;
  $('nsAnalysisYear').innerHTML=years.map(y=>'<option '+(y===year?'selected':'')+'>'+y+'</option>').join('');
  renderAnalysisSettings(n);
  $('nsAnalysisCounts').innerHTML=annualTable(n,true);
  $('nsAnalysisAudit').innerHTML=auditHtml(n);
  $('nsAnalysisBasis').textContent='Annual evidence';$('nsCommonResult').innerHTML='';$('nsCommonResult').hidden=true;$('nsCommonMessage').textContent='';$('nsAnalysisMessage').textContent='';Plotly.purge('nsAnalysisPlot');
  const names=[...new Set(n.bindings.filter(b=>b.role==='model').map(b=>b.scenario))].sort();$('nsCommonScenario').innerHTML=names.map(s=>'<option>'+html(s)+'</option>').join('');
  $('nsCommonYear').innerHTML=years.map(y=>'<option '+(y===year?'selected':'')+'>'+y+'</option>').join('');
  $('nsAnalysisPlot').hidden=mode==='spills';$('nsAnalysisMode').textContent=mode==='spills'?'Show time series':'Show annual spills';
  if(mode==='series')await plotAnalysis(generation);
}
async function plotAnalysis(generation=analysisGeneration,range=null){
  const context=analysisContext,n=network.nodes.find(n=>n.id===context?.id);if(!n)return;
  const current=signature(n),year=Number($('nsAnalysisYear').value),start=range?.[0]||year+'-01-01T00:00:00',end=range?.[1]||(year+1)+'-01-01T00:00:00',chosen=prefs().scenarios;
  const bindings=n.bindings.filter(b=>b.years.includes(year)&&(b.role==='observed'||chosen===null||chosen.includes(b.scenario)));
  $('nsAnalysisMessage').textContent='Loading series…';
  Plotly.purge('nsAnalysisPlot');
  try{
    const traces=[],shapes=[],groups=new Map(),colours=['#6554c0','#147d92','#d88925','#43854f'];
    for(const b of bindings){
      const source=sourceFor(b);if(!source)throw new Error('Reload '+b.sourceName);const scale=C.valueScale(b.quantity,contract(b).unit,b.unit),key=b.quantity+'|'+b.unit+'|'+(b.datum||'');if(!groups.has(key))groups.set(key,groups.size);const axis=groups.get(key)+1,colour=b.role==='observed'?'#e33434':colours[traces.filter(t=>t.name!=='Observed').length%colours.length];
      const data=await engine.call('series_data',{path:source.virtualPath,column:b.column,max_points:25000,start,end,end_exclusive:true,max_gap_seconds:n.gap,exclusions_json:JSON.stringify(n.exclusions)});
      if(generation!==analysisGeneration||current!==signature(n))return;
      traces.push({x:data.timestamp,y:data.value.map(v=>v===null?null:v*scale),type:'scatter',mode:'lines',name:b.role==='observed'?'Observed':b.scenario,line:{color:colour,width:1.4},connectgaps:false,xaxis:axis===1?'x':'x'+axis,yaxis:axis===1?'y':'y'+axis});
      const threshold=C.effectiveThreshold(b,n.defaults);shapes.push({type:'line',xref:axis===1?'x domain':'x'+axis+' domain',x0:0,x1:1,yref:axis===1?'y':'y'+axis,y0:threshold.value,y1:threshold.value,line:{color:colour,dash:'dash',width:1}});
    }
    if(generation!==analysisGeneration||!traces.length){if(generation===analysisGeneration)$('nsAnalysisMessage').textContent='No assigned series for this year.';return;}
    const layout={height:Math.max(350,groups.size*230),margin:{l:65,r:25,t:30,b:45},legend:{orientation:'h',y:1.1},shapes,template:'plotly_white',uirevision:n.id+'|'+year};
    for(const [key,index] of groups){const axis=index+1,suffix=axis===1?'':axis;layout['yaxis'+suffix]={title:key.split('|').filter(Boolean).join(' · '),domain:[1-(index+1)/groups.size+.05,1-index/groups.size-.03],anchor:axis===1?'x':'x'+axis};layout['xaxis'+suffix]={type:'date',anchor:axis===1?'y':'y'+axis,range:[start,end],matches:axis===1?undefined:'x',showticklabels:axis===groups.size};for(const exc of n.exclusions)shapes.push({type:'rect',xref:axis===1?'x':'x'+axis,x0:exc.start,x1:exc.end,yref:axis===1?'y domain':'y'+axis+' domain',y0:0,y1:1,fillcolor:'#82939f',opacity:.15,line:{width:0},layer:'below'});}
    const host=$('nsAnalysisPlot');host.removeAllListeners?.('plotly_relayout');await Plotly.react(host,traces,layout,plotConfig('network-'+n.name,{scrollZoom:false}));
    if(generation!==analysisGeneration)return;
    host.on('plotly_relayout',event=>{const key=Object.keys(event).find(k=>/^xaxis\d*\.(range\[0\]|autorange)$/.test(k));if(!key)return;const axis=key.split('.')[0],reset=event[axis+'.autorange']===true,a=event[axis+'.range[0]'],b=event[axis+'.range[1]'];if(reset||a&&b){clearTimeout(analysisTimer);analysisTimer=setTimeout(()=>void plotAnalysis(++analysisGeneration,reset?null:[a,b]),180);}});
    $('nsAnalysisMessage').textContent='Dashed lines: thresholds · shaded periods: exclusions'+(!isFresh(n)?' · Recalculate annual spills after changing settings.':'');
  }catch(error){if(generation===analysisGeneration){$('nsAnalysisMessage').textContent=String(error.message||error);$('nsAnalysisSettings').open=true;}}
}
async function calculateCommon(){
  const n=network.nodes.find(n=>n.id===analysisContext?.id);if(!n||busy)return;
  const year=Number($('nsCommonYear').value),scenario=$('nsCommonScenario').value,rows=n.applied?.rows||[],o=rows.find(r=>r.year===year&&r.role==='observed'),m=rows.find(r=>r.year===year&&r.role==='model'&&r.scenario===scenario);
  if(!isFresh(n)||!o?.analysis_start||!m?.analysis_start){$('nsCommonMessage').textContent='Calculate current observed and model evidence first.';return;}
  const start=o.analysis_start>m.analysis_start?o.analysis_start:m.analysis_start,end=o.analysis_end<m.analysis_end?o.analysis_end:m.analysis_end;
  if(start>=end){$('nsCommonMessage').textContent='No overlapping period in this year.';return;}
  const sig=signature(n);busy=true;$('nsCommonCalculate').disabled=true;
  try{
    const output=[];for(const r of [o,m]){const b=n.bindings.find(b=>b.sha256===r.source_sha256&&b.column===r.column&&b.role===r.role&&b.scenario===r.scenario&&b.years.includes(year)),source=b&&sourceFor(b);if(!source)throw new Error('Reload matching evidence sources.');const scale=C.valueScale(b.quantity,contract(b).unit,b.unit),value=await engine.call('network_common_spill_result',{path:source.virtualPath,column:b.column,threshold:r.threshold/scale,start,end,max_gap_seconds:n.gap,comparison:C.thresholdRule(r),exclusions_json:JSON.stringify(n.exclusions)});output.push({...r,...value,threshold:r.threshold,value_min:value.value_min==null?value.value_min:value.value_min*scale,value_max:value.value_max==null?value.value_max:value.value_max*scale,exclusions:n.exclusions});}
    if(sig!==signature(n))throw new Error('Settings changed. Recalculate.');
    n.common={signature:sig,rows:output,calculated_at:new Date().toISOString()};persist();const proxy={...n,applied:{...n.applied,rows:output},bindings:n.bindings.filter(b=>b.years.includes(year)&&(b.role==='observed'||b.scenario===scenario))};
    $('nsCommonResult').hidden=false;$('nsCommonResult').innerHTML='<strong>Common period · '+year+'</strong>'+annualTable(proxy,true,[scenario])+'<small>'+html(start+' to '+end)+'</small>';const reason=C.comparable(output[0],output[1],n.confirmed);$('nsCommonMessage').textContent=reason||'Comparable common-period evidence.';
  }catch(error){$('nsCommonMessage').textContent=String(error.message||error);}
  finally{busy=false;$('nsCommonCalculate').disabled=false;renderReview();}
}
function mountReview(){
  $('nsWorkbench').querySelector('.ns-main-toolbar').insertAdjacentHTML('afterbegin','<input id="nsAssetSearch" type="search" placeholder="Find asset" aria-label="Find asset" list="nsAssetNames"><datalist id="nsAssetNames"></datalist>');
  $('nsWorkbench').querySelector('.ns-main-toolbar').insertAdjacentHTML('beforeend','<button id="nsAnnualTable">Annual table</button><details id="nsReviewTools"><summary>Tools</summary><div class="ns-tool-panel"><div class="ns-tool-row"><label>Type'+selectHtml('id="nsTypeFilter"',[['all','All assets'],...Object.entries(C.types)],'all')+'</label><label>Evidence'+selectHtml('id="nsHealthFilter"',[['all','Any'],...['ready','missing','stale','provisional','short','unassigned','uncalculated'].map(s=>[s,healthLabel(s)])],'all')+'</label><label>Result'+selectHtml('id="nsResultFilter"',[['all','Any'],['green','Green'],['amber','Amber'],['red','Red'],['neutral','Neutral']],'all')+'</label><label>Detail'+selectHtml('id="nsDetail"',[['auto','Automatic'],['full','Full'],['minimal','Minimal']],'auto')+'</label></div><div class="ns-tool-row"><button data-ns-trace="up">Upstream</button><button data-ns-trace="down">Downstream</button><button id="nsClearTrace">Clear trace</button><button id="nsAudit">Connectivity</button><span id="nsHiddenCount"></span></div><details><summary>Scenarios</summary><div id="nsScenarioChoices"></div></details><details><summary>Layout</summary><div class="ns-tool-row"><label><input id="nsSnap" type="checkbox"> Snap</label><label><input id="nsLocked" type="checkbox"> Lock</label><button data-ns-arrange="auto">Auto layout</button><button data-ns-arrange="left">Align left</button><button data-ns-arrange="top">Align top</button><button data-ns-arrange="horizontal">Distribute horizontally</button><button data-ns-arrange="vertical">Distribute vertically</button><button id="nsRedo">Redo</button><span id="nsSelectionCount"></span></div><small>Shift-click to select several assets. Pinned assets stay in place.</small></details><details><summary>Views & snapshots</summary><div class="ns-tool-row"><input id="nsViewName" placeholder="View / review name" maxlength="100"><button id="nsSaveView">Save view</button><select id="nsViewSelect"></select><button id="nsSaveSnapshot">Save review snapshot</button><select id="nsSnapshotSelect"></select></div></details><p id="nsAuditResult"></p></div></details>');
  $('nsWorkbench').querySelector('.ns-export-actions').insertAdjacentHTML('beforeend','<button id="nsSvgExport">Export SVG</button><button id="nsReportExport">Annual report / PDF</button>');
  $('nsCanvas').insertAdjacentHTML('beforeend','<aside id="nsHover" hidden></aside>');
  $('nsWorkbench').insertAdjacentHTML('beforeend','<section id="nsMatrix" hidden><div class="ns-matrix-toolbar"><strong>Annual comparison</strong><input id="nsMatrixSearch" type="search" placeholder="Filter assets"><label><input id="nsMatrixSelected" type="checkbox"> Selected only</label><small>Δ = M − O</small><button id="nsCloseMatrix">Close</button></div><div id="nsMatrixBody"></div></section><section id="nsAnalysis" role="dialog" aria-modal="true" aria-label="Asset analysis" hidden><div class="ns-analysis-toolbar"><strong id="nsAnalysisTitle"></strong><select id="nsAnalysisYear" aria-label="Graph year"></select><button id="nsAnalysisMode">Show annual spills</button><button id="nsCloseAnalysis">Close</button></div><div class="ns-analysis-body"><details id="nsAnalysisSettings"><summary>Channels, units &amp; thresholds</summary><div id="nsAnalysisSources"></div><button id="nsAnalysisCalculate" class="ns-primary">Apply &amp; recalculate annual spills</button></details><div id="nsAnalysisPlot"></div><small id="nsAnalysisMessage"></small><strong id="nsAnalysisBasis">Annual evidence</strong><div id="nsAnalysisCounts"></div><details><summary>Common-period comparison</summary><div class="ns-tool-row"><select id="nsCommonYear" aria-label="Common period year"></select><select id="nsCommonScenario" aria-label="Common period scenario"></select><button id="nsCommonCalculate">Calculate overlap</button></div><small id="nsCommonMessage">Annual totals remain unchanged.</small><div id="nsCommonResult" hidden></div></details><details><summary>Assessment details</summary><div id="nsAnalysisAudit"></div></details></div></section>');
  $('nsAssetSearch').oninput=()=>{$('nsAssetNames').innerHTML=network.nodes.filter(n=>n.name.toLowerCase().includes($('nsAssetSearch').value.toLowerCase())).slice(0,30).map(n=>'<option value="'+html(n.name)+'"></option>').join('');};
  $('nsAssetSearch').onchange=()=>{const query=$('nsAssetSearch').value.toLowerCase(),n=network.nodes.find(n=>n.name.toLowerCase()===query)||network.nodes.find(n=>n.name.toLowerCase().includes(query));if(n){const p=prefs();if(selected!==n.id||p.type!=='all'||p.health!=='all'||p.result!=='all'){network.preferences={...p,type:'all',health:'all',result:'all'};centre(n.id);}}else status('Asset not found.');};
  for(const [id,key] of [['nsTypeFilter','type'],['nsHealthFilter','health'],['nsResultFilter','result'],['nsDetail','detail'],['nsSnap','snap'],['nsLocked','locked']])$(id).onchange=()=>{network.preferences={...prefs(),[key]:['snap','locked'].includes(key)?$(id).checked:$(id).value};changed(true);};
  $('nsRedo').onclick=()=>undoEdit(true);$('nsSaveView').onclick=saveView;$('nsViewSelect').onchange=()=>loadView($('nsViewSelect').value);$('nsSaveSnapshot').onclick=saveReviewSnapshot;$('nsSnapshotSelect').onchange=()=>downloadReviewSnapshot($('nsSnapshotSelect').value);
  $('nsAnnualTable').onclick=()=>{$('nsMatrix').hidden=!$('nsMatrix').hidden;renderMatrix();};$('nsCloseMatrix').onclick=()=>{$('nsMatrix').hidden=true;};$('nsMatrixSearch').oninput=renderMatrix;$('nsMatrixSelected').onchange=renderMatrix;
  $('nsClearTrace').onclick=()=>{highlight=null;renderCanvas();};$('nsAudit').onclick=()=>{const a=R.audit(network.nodes,network.edges);$('nsAuditResult').textContent=a.components.length+' components · '+a.isolated.length+' isolated · '+a.cycleAffected.length+' cycle-affected';highlight={ids:new Set([...a.isolated,...a.cycleAffected]),wires:new Set()};if(!highlight.ids.size)highlight=null;renderCanvas();};
  $('nsSvgExport').onclick=()=>{downloadBlob('hydra-network-schematic.svg',wholeSceneSvg(),'image/svg+xml');root().querySelector('.ns-export-menu').open=false;};$('nsReportExport').onclick=()=>{root().querySelector('.ns-export-menu').open=false;exportReport();};
  root().addEventListener('click',event=>{const t=event.target,trace=t.closest('[data-ns-trace]'),arrangeButton=t.closest('[data-ns-arrange]'),focus=t.closest('[data-ns-centre],[data-ns-focus]'),analysis=t.closest('[data-ns-open-analysis]');if(trace&&selected){highlight=R.trace(network.nodes,network.edges,selected,trace.dataset.nsTrace);renderCanvas();}if(arrangeButton)arrange(arrangeButton.dataset.nsArrange);if(focus){if(focus.dataset.nsYear)network.year=focus.dataset.nsYear;centre(focus.dataset.nsCentre||focus.dataset.nsFocus);}if(analysis)void openAnalysis(analysis.dataset.nsOpenAnalysis);});
  root().addEventListener('change',event=>{if(event.target.hasAttribute('data-ns-scenario-choice')){network.preferences={...prefs(),scenarios:[...$('nsScenarioChoices').querySelectorAll('input:checked')].map(x=>x.dataset.nsScenarioChoice)};changed(true);}});
  $('nsSvg').addEventListener('pointerover',event=>{const id=event.target.closest('[data-ns-node]')?.dataset.nsNode;if(id){clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>hoverCard(id),250);}});$('nsSvg').addEventListener('pointerout',event=>{if(!event.relatedTarget?.closest?.('[data-ns-node]'))hideHover();});
  $('nsAnalysis').addEventListener('keydown',event=>{if(event.key==='Escape')$('nsCloseAnalysis').click();if(event.key==='Tab'){const controls=[...$('nsAnalysis').querySelectorAll('button,select,summary,input')].filter(el=>el.getClientRects().length),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  $('nsCloseAnalysis').onclick=()=>{++analysisGeneration;clearTimeout(analysisTimer);$('nsAnalysis').hidden=true;Plotly.purge('nsAnalysisPlot');analysisContext=null;};$('nsAnalysisYear').onchange=()=>{const n=network.nodes.find(n=>n.id===analysisContext?.id);if(n)renderAnalysisSettings(n);if(analysisContext?.mode==='series')void plotAnalysis(++analysisGeneration);};$('nsAnalysisMode').onclick=()=>{if(!analysisContext)return;analysisContext.mode=analysisContext.mode==='series'?'spills':'series';$('nsAnalysisPlot').hidden=analysisContext.mode==='spills';$('nsAnalysisMode').textContent=analysisContext.mode==='spills'?'Show time series':'Show annual spills';if(analysisContext.mode==='series')void plotAnalysis(++analysisGeneration);};$('nsCommonCalculate').onclick=()=>void calculateCommon();
  $('nsAnalysisCalculate').onclick=async()=>{if(busy)return;await calculate();const n=network.nodes.find(n=>n.id===analysisContext?.id);if(n){$('nsAnalysisCounts').innerHTML=annualTable(n,true);$('nsAnalysisAudit').innerHTML=auditHtml(n);if(analysisContext.mode==='series')await plotAnalysis(++analysisGeneration);}};
  renderReview();
}
function mount(){
  const container=root();if(!container)return;
  container.innerHTML='<div id="nsWorkbench"><div class="ns-main-toolbar"><label>Year<select id="nsYear"></select></label><label>Evidence<select id="nsScenario"></select></label><label>Metric<select id="nsMetric"><option value="spill_count">Spill count</option><option value="duration_hours">Duration (h)</option></select></label><button id="nsEdit">Edit network</button><button id="nsCapture">Capture PNG</button><details class="ns-export-menu"><summary>Save / export</summary><div class="ns-export-actions"><button id="nsSave">Save network</button><button id="nsLoad">Load network</button><button id="nsCsv">Export evidence CSV</button></div></details><input id="nsLoadInput" type="file" accept=".json" hidden><span class="ns-network-legend">Network: <i class="ns-red"></i>Red <i class="ns-amber"></i>Amber <i class="ns-blue"></i>Blue</span></div>'+
    '<div id="nsEditTools" class="ns-edit-tools" hidden>'+selectHtml('id="nsAddType"',Object.entries(C.types).filter(([key])=>!['manhole','label'].includes(key)),'cso')+'<button id="nsAddAsset">+ Asset</button><button id="nsAddManhole">+ Manhole</button><button id="nsAddLabel">+ Label</button><button id="nsConnect" aria-pressed="false">Connect</button><span id="nsColourChoices"></span><button id="nsUndo" aria-label="Undo last edit">Undo</button><button id="nsDelete">Delete selected</button></div>'+
    '<div id="nsLayout"><div id="nsCanvas" tabindex="0" aria-label="Network schematic. Drag background to pan; select an asset to review evidence."><svg id="nsSvg" xmlns="'+NS+'" aria-label="Site network overview"></svg><aside id="nsPopup" hidden></aside><section id="nsPicker" role="dialog" aria-label="Assign imported datasets" hidden></section><div class="ns-canvas-note">Connections show topology only</div><div class="ns-camera-tools"><button id="nsPan" aria-pressed="false">Pan</button><button id="nsZoomOut" aria-label="Zoom out">−</button><span id="nsZoom">100%</span><button id="nsZoomIn" aria-label="Zoom in">+</button><button id="nsFit">Fit</button></div></div><aside id="nsDrawer" hidden></aside></div><p id="nsStatus" role="status" aria-live="polite">Create your site overview, then assign evidence to individual assets.</p></div>';
  mounted=true;container.addEventListener('click',onClick);container.addEventListener('change',event=>updateField(event.target));
  $('nsEdit').onclick=()=>{editing=!editing;popupVisible=false;tool='select';connectFrom=null;render();};
  $('nsAddAsset').onclick=()=>add($('nsAddType').value);$('nsAddManhole').onclick=()=>add('manhole');$('nsAddLabel').onclick=()=>add('label');
  $('nsConnect').onclick=()=>{tool=tool==='connect'?'select':'connect';connectFrom=null;render();status('Click the upstream point, then the downstream point.');};
  $('nsPan').onclick=()=>{tool=tool==='pan'?'select':'pan';connectFrom=null;render();};
  $('nsUndo').onclick=()=>undoEdit();$('nsDelete').onclick=removeSelected;
  $('nsZoomIn').onclick=()=>zoom(1.25);$('nsZoomOut').onclick=()=>zoom(.8);$('nsFit').onclick=fit;
  for(const [id,key] of [['nsYear','year'],['nsMetric','metric']])$(id).onchange=()=>{network[key]=$(id).value;changed(true);};
  $('nsScenario').onchange=()=>{const value=$('nsScenario').value;network.evidenceMode=value==='combined'?'combined':'single';if(value!=='combined')network.scenario=value==='observed'?'observed':value.slice(6);changed(true);};
  $('nsSave').onclick=()=>downloadBlob('hydra-network-schematic.json',JSON.stringify(snapshot(),null,2),'application/json');$('nsLoad').onclick=()=>$('nsLoadInput').click();
  $('nsLoadInput').onchange=async event=>{try{const file=event.target.files[0];if(file){restore(JSON.parse(await file.text()));persist();status('Network restored. Reload matching source files to validate and calculate its evidence.');}}catch(error){status(error.message);}finally{event.target.value='';}};
  for(const id of ['nsSave','nsLoad','nsCsv']){const action=$(id).onclick;$(id).onclick=()=>{document.querySelector('.ns-export-menu').open=false;action?.();};}
  document.addEventListener('click',event=>{const menu=root()?.querySelector('.ns-export-menu');if(menu&&!menu.contains(event.target))menu.open=false;});
  root().addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=root().querySelector('.ns-export-menu');if(menu?.open){menu.open=false;menu.querySelector('summary').focus();}}});
  $('nsCsv').onclick=()=>{root().querySelector('.ns-export-menu').open=false;exportRows();};$('nsCapture').onclick=()=>capture().catch(error=>status(error.message));
  const canvas=$('nsCanvas');canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',onPointerUp);canvas.addEventListener('pointercancel',onPointerUp);
  canvas.addEventListener('keydown',event=>{if(event.target.closest('#nsPopup,#nsPicker'))return;const n=event.target.closest('[data-ns-node]'),e=event.target.closest('[data-ns-edge]');if(['Enter',' '].includes(event.key)&&(n||e)){event.preventDefault();if(n)selectPoint(n.dataset.nsNode);else{selected=e.dataset.nsEdge;renderDrawer();renderCanvas();}return;}
    if(event.key==='Escape'){connectFrom=null;popupVisible=false;$('nsPicker').hidden=true;renderPopup();return;}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const target=editing&&!prefs().locked&&!node()?.pinned&&node();if(target){checkpoint();target.x+=event.key==='ArrowLeft'?-10:event.key==='ArrowRight'?10:0;target.y+=event.key==='ArrowUp'?-10:event.key==='ArrowDown'?10:0;}else{network.camera.x+=event.key==='ArrowLeft'?30:event.key==='ArrowRight'?-30:0;network.camera.y+=event.key==='ArrowUp'?30:event.key==='ArrowDown'?-30:0;}changed(true);}
  });
  container.addEventListener('input',event=>{if(event.target.id==='nsSourceSearch'){const value=event.target.value.toLowerCase();container.querySelectorAll('[data-ns-file-name]').forEach(row=>row.hidden=!row.dataset.nsFileName.includes(value));}});
  observer=new ResizeObserver(()=>renderCanvas());observer.observe(canvas);
  // Flush the latest edit before a rapid refresh/close, rather than losing
  // changes still waiting in the short autosave debounce.
  window.addEventListener('pagehide',flushSave);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave();});
  window.addEventListener('icm:source-pool-changed',()=>{freshness.clear();if(analysisContext){++analysisGeneration;Plotly.purge('nsAnalysisPlot');$('nsAnalysisCounts').innerHTML=annualTable(network.nodes.find(n=>n.id===analysisContext.id)||{id:'missing',bindings:[]},true);$('nsCommonResult').hidden=true;$('nsAnalysisMessage').textContent='Sources changed. Reopen this analysis to refresh.';}renderCanvas();renderReview();if(editing)renderDrawer();});
  mountReview();render();
}
async function open(){
  if(!mounted){let value=state.networkSchematicWorkspace;if(!value){try{value=JSON.parse(localStorage.getItem(STORE)||'null');}catch{}}
    if(value){try{network=C.validateNetwork(value);}catch(error){network=C.empty();}}
    mount();
  }else render();
}
window.ICMNetworkSchematic={open,snapshot,restore,capture,calculate,core:C,debug:()=>({selected,editing,busy,fresh:network.nodes.map(n=>({id:n.id,fresh:isFresh(n)}))})};
})();
