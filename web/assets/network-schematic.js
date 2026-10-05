/* Network overview: own state, local source bindings and calendar spill results. */
(()=>{'use strict';
const C=ICMNetworkCore,NS='http://www.w3.org/2000/svg',STORE='hydra-network-schematic-v1';
const $=id=>document.getElementById(id),html=esc,uid=()=>crypto.randomUUID();
let network=C.empty(),selected=null,editing=false,tool='select',colour='red',connectFrom=null,drag=null,busy=false,history=[],mounted=false,popupVisible=false,observer=null,saveTimer=null;
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
function signature(n){return JSON.stringify({bindings:n.bindings.map(b=>({sha256:b.sha256,column:b.column,role:b.role,scenario:b.scenario,years:b.years,threshold:b.threshold,quantity:b.quantity,unit:b.unit,datum:b.datum,current:contract(b),found:Boolean(sourceFor(b))})),defaults:n.defaults,gap:n.gap,exclusions:n.exclusions,confirmed:n.confirmed});}
function isFresh(n){return Boolean(n.applied&&n.applied.signature===signature(n));}
function checkpoint(){history.push(JSON.stringify(network));if(history.length>30)history.shift();}
function snapshot(){return JSON.parse(JSON.stringify(network));}
function persist(){state.networkSchematicWorkspace=snapshot();clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(STORE,JSON.stringify(network));}catch(error){status('Browser save unavailable; use Save network to keep this layout.');}},250);}
function status(message){if($('nsStatus'))$('nsStatus').textContent=message;}
function changed(geometry=false){persist();renderCanvas();if(!geometry)renderFilters();}
function restore(value){
  network=value?C.validateNetwork(value):C.empty();selected=null;popupVisible=false;history=[];
  state.networkSchematicWorkspace=snapshot();if(mounted){render();persist();}
}
function point(x,y){return {x:x*network.camera.zoom+network.camera.x,y:y*network.camera.zoom+network.camera.y};}
function world(x,y){return {x:(x-network.camera.x)/network.camera.zoom,y:(y-network.camera.y)/network.camera.zoom};}
function dimensions(){return {width:Math.max(240,$('nsCanvas')?.clientWidth||1000),height:Math.max(360,$('nsCanvas')?.clientHeight||620)};}
function icon(type){
  const shapes={cso:'<rect x="-29" y="-22" width="58" height="44" rx="3"/><path d="M-25 2c8-7 14 5 22 0h5v-18h7v31h17"/>',
    storm:'<rect x="-29" y="-22" width="58" height="44" rx="3"/><path d="M-25 2h21v-16h7v28h23"/>',
    emergency:'<rect x="-29" y="-22" width="58" height="44" rx="3"/><path d="M-25 4h50M0-15v12M0 12h.01"/>',
    pump:'<circle r="25"/><path d="M-10-14L15 0-10 14Z"/>',
    wwtw:'<rect x="-32" y="-22" width="64" height="44" rx="2"/><path d="M-21-22v44M7-22v44M-32-10H32"/>',
    tank:'<rect x="-32" y="-22" width="64" height="44" rx="2"/><path d="M-26-16v32M26-16v32M-26 0c10-7 18 7 28 0s17 5 24 0"/>',
    junction:'<circle r="12"/><path d="M-20 0h40M0-20v40"/>',outfall:'<path d="M-24-12H9V12H-24M9 0h20M22-7l7 7-7 7"/>',manhole:'<circle r="8"/>',label:'<circle r="3" fill="currentColor"/>'};
  return shapes[type]||shapes.cso;
}
function badge(n){
  if(!asset(n))return '';
  if(!n.applied)return '—';if(!isFresh(n))return '↻';
  const rows=n.applied.rows.filter(r=>r.eligible&&(network.year==='all'||String(r.year)===network.year)&&(network.scenario==='observed'?r.role==='observed':r.role==='model'&&r.scenario===network.scenario));
  rows.sort((a,b)=>b.year-a.year);return rows.length?f(rows[0][network.metric],network.metric==='spill_count'?0:1)+(network.metric==='duration_hours'?' h':''):'—';
}
function svgContent(){
  const {width,height}=dimensions(),parts=[];
  parts.push('<defs>'+Object.entries(C.colours).map(([name,c])=>'<marker id="nsArrow-'+name+'" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="'+c+'"/></marker>').join('')+'</defs>');
  for(const e of network.edges){
    const a=network.nodes.find(n=>n.id===e.from),b=network.nodes.find(n=>n.id===e.to);if(!a||!b)continue;
    const p=point(a.x,a.y),q=point(b.x,b.y),middle=(p.x+q.x)/2,c=C.colours[e.colour];
    const path='M'+p.x+' '+p.y+'H'+middle+'V'+q.y+'H'+q.x;
    parts.push('<g data-ns-edge="'+html(e.id)+'" tabindex="0" role="button" aria-label="Connector '+html(e.name||a.name+' to '+b.name)+'"><path d="'+path+'" fill="none" stroke="transparent" stroke-width="14"/><path d="'+path+'" fill="none" stroke="'+c+'" stroke-width="'+(e.id===selected?3:2)+'" '+(e.arrow!==false?'marker-end="url(#nsArrow-'+e.colour+')"':'')+'/>'+(e.name?'<text x="'+(middle+7)+'" y="'+((p.y+q.y)/2-8)+'" fill="'+c+'" font-size="13">'+html(e.name)+'</text>':'')+'</g>');
  }
  for(const n of network.nodes){
    const p=point(n.x,n.y),c=C.colours[n.colour],labelOffset=n.labelOffset||{x:30,y:-20},small=['manhole','label'].includes(n.type),value=badge(n);
    const label=small?'<path d="M0 0L'+labelOffset.x+' '+labelOffset.y+'" stroke="'+c+'" stroke-width="1" fill="none"/><text data-ns-label="'+html(n.id)+'" x="'+(labelOffset.x+5)+'" y="'+labelOffset.y+'" font-size="13" fill="#182732">'+html(n.name)+'</text>':'<text y="-35" text-anchor="middle" font-size="14" font-weight="600" fill="#182732">'+html(n.name)+'</text>';
    parts.push('<g data-ns-node="'+html(n.id)+'" transform="translate('+p.x+' '+p.y+')" tabindex="0" role="button" aria-label="'+html(n.name)+' · '+html(C.types[n.type])+'"><title>'+html(n.name+' · '+C.types[n.type])+'</title>'+(selected===n.id?'<rect x="-38" y="-29" width="76" height="58" rx="7" fill="none" stroke="#0b8f96" stroke-width="2"/>':'')+'<rect x="-37" y="-28" width="74" height="56" fill="transparent"/><g stroke="'+c+'" stroke-width="1.8" fill="white" stroke-linecap="round" stroke-linejoin="round">'+icon(n.type)+'</g>'+label+(asset(n)?'<g transform="translate(38 -25)"><rect x="0" y="-12" width="'+Math.max(24,value.length*8+10)+'" height="22" rx="5" fill="white" stroke="#c7d2d9"/><text x="5" y="3" font-size="13" fill="#182732">'+html(value)+'</text></g>':'')+'</g>');
  }
  if(!network.nodes.length)parts.push('<text x="'+width/2+'" y="'+height/2+'" text-anchor="middle" fill="#60717d" font-size="15">Choose Edit network, then add your site assets and manholes.</text>');
  return parts.join('');
}
function renderCanvas(){
  const svg=$('nsSvg');if(!svg)return;const d=dimensions();svg.setAttribute('viewBox','0 0 '+d.width+' '+d.height);svg.innerHTML=svgContent();
  $('nsZoom').textContent=Math.round(network.camera.zoom*100)+'%';$('nsUndo').disabled=!history.length||busy;
  renderPopup();
}
function fit(){
  const d=dimensions();if(!network.nodes.length){network.camera={x:0,y:0,zoom:1};changed(true);return;}
  const xs=network.nodes.map(n=>n.x),ys=network.nodes.map(n=>n.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const zoom=Math.max(.2,Math.min(2,(d.width-160)/Math.max(200,right-left),(d.height-150)/Math.max(180,bottom-top)));
  network.camera={zoom,x:d.width/2-(left+right)/2*zoom,y:d.height/2-(top+bottom)/2*zoom};changed(true);
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
  $('nsScenario').innerHTML=selectHtml('',[['observed','Observed'],...scenarios.map(s=>[s,s])],network.scenario).replace(/^<select[^>]*>|<\/select>$/g,'');
  $('nsMetric').value=network.metric;
}
function colours(value,attribute){return '<div class="ns-swatches">'+Object.entries(C.colours).map(([k,c])=>'<button type="button" '+attribute+'="'+k+'" aria-label="'+k+' network colour" aria-pressed="'+(value===k)+'" style="--swatch:'+c+'"></button>').join('')+'</div>';}
function bindingRows(n,role){return n.bindings.filter(b=>b.role===role).map(b=>{
  const item=sourceFor(b),metadata=contract(b),columns=item?.parsed?.columns||[b.column];
  return '<div class="ns-source-row" data-ns-binding="'+html(b.id)+'"><div class="ns-source-title"><strong title="'+html(b.sourceName)+'">'+html(b.sourceName)+'</strong><button data-ns-remove-binding="'+html(b.id)+'" aria-label="Remove '+html(b.sourceName)+'">×</button></div>'+
    (role==='model'?fields('Scenario','<input data-ns-binding-field="scenario" value="'+html(b.scenario)+'">'):'')+
    fields('Channel',selectHtml('data-ns-binding-field="column"',columns.map(c=>[c,c]),b.column))+
    '<div class="ns-two">'+fields('Reporting years','<input data-ns-binding-field="years" value="'+html(b.years.join(', '))+'" placeholder="2022, 2023">')+fields('Threshold ('+html(b.unit||metadata.unit||'assign unit')+')','<input data-ns-binding-field="threshold" type="number" step="any" value="'+html(b.threshold)+'" placeholder="Group default">')+'</div>'+
    '<div class="ns-two">'+fields('Quantity',selectHtml('data-ns-binding-field="quantity"',[['depth','Depth'],['level','Level'],['flow','Overflow flow'],['status','Spill status']],b.quantity))+fields('Source values unit',selectHtml('data-ns-binding-field="unit"',b.quantity==='status'?[['1','Binary / unitless']]:b.quantity==='flow'?[['','Assign…'],['m³/s','m³/s'],['L/s','L/s'],['Ml/d','Ml/d']]:[['','Assign…'],['m','m'],['mm','mm']],b.unit))+'</div>'+
    (b.quantity==='level'?fields('Level datum','<input data-ns-binding-field="datum" value="'+html(b.datum||'')+'" placeholder="e.g. AOD">'):'')+
    '<small>'+(item?'Main year suggested: '+(C.mainYear(item.parsed.start,item.parsed.end)||'unavailable')+' · '+html(String(item.parsed.start||'').slice(0,10))+' to '+html(String(item.parsed.end||'').slice(0,10))+'. Earlier warm-up is omitted from reported totals.':'Reload the original matching source fingerprint before calculating.')+'</small></div>';
}).join('');}
function renderDrawer(){
  const drawer=$('nsDrawer');if(!drawer)return;drawer.hidden=!editing;const n=node(),e=edge();
  if(!editing)return;
  if(!n&&!e){drawer.innerHTML='<h3>Edit network</h3><p>Add a point or select an existing asset to name it and assign imported evidence.</p><p>Use Connect and click two points to draw a directed wire. Drag points to arrange the site.</p>';return;}
  const common='<div class="ns-drawer-head"><h3>'+html(n?n.name:e.name||'Connector')+'</h3><button data-ns-close-selection aria-label="Close settings">×</button></div>'+
    fields('Name','<input id="nsName" value="'+html(n?n.name:e.name||'')+'" maxlength="160">')+fields('Network colour',colours((n||e).colour,'data-ns-object-colour'));
  if(e){drawer.innerHTML=common+'<label class="ns-check"><input id="nsArrow" type="checkbox" '+(e.arrow!==false?'checked':'')+'> Show direction</label><button data-ns-delete class="ns-danger">Delete connector</button>';return;}
  drawer.innerHTML=common+fields('Type',selectHtml('id="nsType"',Object.entries(C.types),n.type))+
    (['manhole','label'].includes(n.type)?'<div class="ns-two">'+fields('Pointer X','<input id="nsLabelX" type="number" value="'+finite(n.labelOffset?.x,30)+'">')+fields('Pointer Y','<input id="nsLabelY" type="number" value="'+finite(n.labelOffset?.y,-20)+'">')+'</div>':'')+
    (asset(n)?'<section><h4>Observed</h4>'+fields('Shared threshold · blank rows inherit','<input id="nsObservedDefault" type="number" step="any" value="'+html(n.defaults?.observed??'')+'">')+bindingRows(n,'observed')+'<button data-ns-add-sources="observed">+ Add datasets</button></section>'+
      '<section><h4>Modelled scenarios</h4>'+fields('Scenario for new assignments','<input id="nsNewScenario" value="'+html(n.newScenario||'Baseline')+'" maxlength="100">')+fields('Shared model threshold · blank rows inherit','<input id="nsModelDefault" type="number" step="any" value="'+html(n.defaults?.model??'')+'">')+bindingRows(n,'model')+'<button data-ns-add-sources="model">+ Add datasets to scenario</button></section>'+
      '<details><summary>Assessment settings</summary>'+fields('Maximum valid gap (s)','<input id="nsGap" type="number" min="1" value="'+n.gap+'">')+fields('Exclusions · start, end, reason (one per line)','<textarea id="nsExclusions" rows="3" placeholder="2024-05-01T00:00, 2024-05-02T00:00, logger fault">'+html((n.exclusions||[]).map(x=>[x.start,x.end,x.reason].join(', ')).join('\n'))+'</textarea>')+'<small>Local to this asset. Use model-clock ISO dates. Other workspaces are unaffected.</small></details>'+
      '<label class="ns-check"><input id="nsConfirmed" type="checkbox" '+(n.confirmed?'checked':'')+'> Matching clocks, units/datum and model/rainfall basis confirmed for this asset’s comparisons</label>'+
      '<p class="ns-note">Each source defaults to its main reporting year; override years per row. At least three calendar months of valid reporting data are required.</p>'+
      '<button id="nsCalculate" class="ns-primary" '+(busy?'disabled':'')+'>'+(busy?'Calculating…':'Apply & calculate')+'</button>':'')+
    '<button data-ns-delete class="ns-danger">Delete point</button>';
}
function popupTable(n){
  if(!n.applied)return '<p>Assign evidence in Edit network, then Apply & calculate.</p>';
  const fresh=isFresh(n),rows=n.applied.rows||[],observed=new Map(rows.filter(r=>r.role==='observed').map(r=>[r.year,r]));
  const selectedRows=rows.filter(r=>network.year==='all'||String(r.year)===network.year).sort((a,b)=>a.year-b.year||(a.role==='observed'?0:1)-(b.role==='observed'?0:1)||String(a.scenario).localeCompare(String(b.scenario)));
  let table='<table><thead><tr><th>Year</th><th>Evidence / scenario</th><th>Observed</th><th>Modelled</th><th>Obs. h</th><th>Model h</th></tr></thead><tbody>';
  const cell=(v,rag)=>'<td'+(rag?' class="ns-rag-'+rag+'"':'')+'>'+f(v,Number.isInteger(v)?0:2)+'</td>';
  for(const row of selectedRows){
    const o=row.role==='observed'?row:observed.get(row.year),reason=row.role==='model'?(fresh?C.comparable(o,row,n.confirmed):'Recalculation required'):'',countRag=!reason&&row.role==='model'?C.rag(o?.spill_count,row.spill_count):null,durationRag=!reason&&row.role==='model'?C.rag(o?.duration_hours,row.duration_hours):null;
    table+='<tr><td>'+html(row.year)+'</td><td>'+html(row.role==='observed'?'Observed':row.scenario)+(row.eligible?'':'<small>'+html(row.reason)+'</small>')+'</td>'+cell(o?.spill_count)+cell(row.role==='model'?row.spill_count:null,countRag)+cell(o?.duration_hours)+cell(row.role==='model'?row.duration_hours:null,durationRag)+'</tr>';
    const period=row.analysis_start?row.analysis_start.slice(0,10)+' to '+row.analysis_end.slice(0,10):'No period';
    table+='<tr class="ns-period"><td colspan="6">'+html(period)+(row.partial_year?' · partial year':'')+' · valid '+f(row.valid_hours,1)+' h · gaps '+f(row.unknown_hours,1)+' h · excluded '+f(row.excluded_hours,1)+' h'+(row.count_status&&row.count_status!=='definitive'?' · '+html(row.count_status):'')+(reason?' · '+html(reason):'')+'</td></tr>';
  }
  return table+'</tbody></table>'+(fresh?'':'<p class="ns-note">Recalculation required: settings or source evidence changed. These are previous applied values.</p>')+'<div class="ns-rag-legend"><span class="ns-rag-green">Green ≤5%</span><span class="ns-rag-amber">Amber >5–10%</span><span class="ns-rag-red">Red >10%</span></div><small>12/24 counts · individual asset evidence · no annualisation</small>';
}
function renderPopup(){
  const pop=$('nsPopup'),n=node();if(!pop)return;pop.hidden=editing||!popupVisible||!n;
  if(pop.hidden)return;
  pop.innerHTML='<div class="ns-popup-head"><div><h3>'+html(n.name)+'</h3><small>'+html(C.types[n.type])+' · yearly spill evidence</small></div><button data-ns-close-popup aria-label="Close spill evidence">×</button></div><div class="ns-popup-body">'+popupTable(n)+'</div><div class="ns-popup-footer"><button data-ns-edit-selected>Edit asset</button></div>';
  const d=dimensions(),p=point(n.x,n.y),w=Math.min(620,d.width-24);pop.style.width=w+'px';pop.style.maxHeight=(d.height-24)+'px';
  // Keep the camera controls reachable even with a long evidence table.
  pop.style.maxHeight=(d.height-82)+'px';
  pop.style.left=Math.max(12,Math.min(d.width-w-12,p.x+45))+'px';
  pop.style.top=Math.max(12,Math.min(d.height-pop.offsetHeight-72,p.y+20))+'px';
}
function render(){
  if(!mounted)return;
  $('nsEdit').textContent=editing?'Done editing':'Edit network';$('nsEdit').setAttribute('aria-pressed',String(editing));
  $('nsEditTools').hidden=!editing;$('nsLayout').classList.toggle('ns-editing',editing);
  $('nsPan').setAttribute('aria-pressed',String(tool==='pan'));$('nsConnect').setAttribute('aria-pressed',String(tool==='connect'));
  $('nsColourChoices').innerHTML=colours(colour,'data-ns-colour');renderFilters();renderDrawer();renderCanvas();
}
function add(type){
  if(busy)return;checkpoint();const d=dimensions(),p=world(d.width*.35+network.nodes.length%4*30,d.height*.4+network.nodes.length%4*35);
  const n={id:uid(),name:C.types[type]+' '+(network.nodes.filter(n=>n.type===type).length+1),type,colour,x:p.x,y:p.y,labelOffset:{x:30,y:-20},bindings:[],defaults:{observed:'',model:''},newScenario:'Baseline',gap:900,exclusions:[],confirmed:false,applied:null};
  network.nodes.push(n);selected=n.id;popupVisible=false;editing=true;changed();render();$('nsName')?.focus();
}
function selectPoint(id){
  if(tool==='connect'&&editing){
    const n=network.nodes.find(n=>n.id===id);if(n?.type==='label'){status('Pointer labels do not connect. Select an asset or manhole.');return;}
    if(!connectFrom){connectFrom=id;status('Select the downstream point.');return;}
    if(connectFrom===id){connectFrom=null;status('Connection cancelled.');return;}
    if(!network.edges.some(e=>e.from===connectFrom&&e.to===id)){checkpoint();network.edges.push({id:uid(),from:connectFrom,to:id,colour,name:'',arrow:true});changed();}
    connectFrom=null;status('Connector added. Connections do not alter spill calculations.');return;
  }
  selected=id;popupVisible=!editing;renderDrawer();renderCanvas();
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
    const raw=b.threshold===''?n.defaults[b.role==='observed'?'observed':'model']:b.threshold;
    if(raw===''||raw===null||!Number.isFinite(Number(raw)))throw new Error('Enter a finite threshold for '+b.sourceName+'.');
    if(!b.unit)throw new Error('Assign the source-value unit for '+b.sourceName+'.');
    const current=contract(b);
    if(current.quantity&&current.quantity!==b.quantity&&b.quantity!=='status')throw new Error('This source is interpreted as '+current.quantity+'. Use a matching channel, or interpret it in Data / Time Series.');
    if(current.unit&&current.unit!==b.unit)throw new Error('Source values are in '+current.unit+'; thresholds must use that same canonical unit.');
    return {binding:b,source,threshold:Number(raw)};
  });
}
async function calculate(){
  const n=node();if(!n||busy)return;
  if(root().querySelector('[aria-invalid="true"]')){status('Correct the invalid asset settings before calculating.');return;}
  let assignments;try{assignments=calculationRows(n);if(!Number.isFinite(n.gap)||n.gap<=0)throw new Error('Maximum valid gap must be positive.');}catch(error){status(error.message);return;}
  busy=true;const sig=signature(n),rows=[];renderDrawer();
  try{
    for(let i=0;i<assignments.length;i++){
      const {binding:b,source,threshold}=assignments[i];status('Calculating '+(i+1)+'/'+assignments.length+' · '+source.displayName);await new Promise(resolve=>requestAnimationFrame(resolve));
      const result=await engine.call('network_spill_result',{path:source.virtualPath,column:b.column,threshold,years_json:JSON.stringify(b.years),exclusions_json:JSON.stringify(n.exclusions),max_gap_seconds:n.gap});
      rows.push(...result.rows.map(row=>({...row,role:b.role,scenario:b.scenario,source_sha256:b.sha256,source_name:b.sourceName,column:b.column,quantity:b.quantity,unit:b.unit,datum:b.datum,exclusions:n.exclusions,context_start:result.context_start})));
    }
    if(sig!==signature(n))throw new Error('Asset inputs changed while calculating. Reapply the settings.');
    n.applied={signature:sig,rows,settings:{gap:n.gap,confirmed:n.confirmed},calculated_at:new Date().toISOString()};persist();status('Applied '+assignments.length+' sources. Spill results are frozen to these settings.');
  }catch(error){status(String(error.message||error).split('\n').filter(x=>x.trim()).at(-1));}
  finally{busy=false;render();}
}
function updateField(target){
  const n=node(),e=edge();if(!n&&!e)return;
  target.removeAttribute('aria-invalid');
  const container=target.closest('[data-ns-binding]');
  if(container&&n){
    const b=n.bindings.find(b=>b.id===container.dataset.nsBinding),key=target.dataset.nsBindingField;
    if(!b||!key)return;
    try{checkpoint();if(key==='years')b.years=C.validateYears(target.value);else if(key==='threshold')b.threshold=target.value===''?'':Number(target.value);else if(key==='scenario')b.scenario=target.value.trim()||'Baseline';else b[key]=target.value;
      if(key==='column'){const item=sourceFor(b);b.quantity=seriesQuantity(item,b.column)||b.quantity;b.unit=seriesUnit(item,b.column)||'';b.datum=seriesReference(item,b.column)||'';}
      if(key==='quantity')b.unit='';changed();if(['column','quantity'].includes(key))renderDrawer();
    }catch(error){status(error.message);target.setAttribute('aria-invalid','true');}return;
  }
  const object=n||e;
  try{
    checkpoint();
    if(target.id==='nsName')object.name=target.value.trim()||C.types[n?.type]||'Connector';
    else if(target.id==='nsType')n.type=target.value;
    else if(target.id==='nsArrow')e.arrow=target.checked;
    else if(target.id==='nsLabelX'||target.id==='nsLabelY')n.labelOffset={...(n.labelOffset||{x:30,y:-20}),[target.id==='nsLabelX'?'x':'y']:finite(target.value)};
    else if(target.id==='nsObservedDefault')n.defaults.observed=target.value;
    else if(target.id==='nsModelDefault')n.defaults.model=target.value;
    else if(target.id==='nsNewScenario')n.newScenario=target.value.trim()||'Baseline';
    else if(target.id==='nsGap')n.gap=Number(target.value);
    else if(target.id==='nsConfirmed')n.confirmed=target.checked;
    else if(target.id==='nsExclusions')n.exclusions=parsedExclusions(target.value);
    else return;
    changed();if(target.id==='nsType')renderDrawer();
  }catch(error){status(error.message);target.setAttribute('aria-invalid','true');}
}
function removeSelected(){
  if(busy)return;checkpoint();network.nodes=network.nodes.filter(n=>n.id!==selected);network.edges=network.edges.filter(e=>e.id!==selected&&e.from!==selected&&e.to!==selected);selected=null;popupVisible=false;changed();renderDrawer();
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
  if(t.id==='nsCalculate'){void calculate();return;}
}
function onPointerDown(event){
  if(event.button!==0||event.target.closest('#nsPopup,#nsPicker,.ns-camera-tools'))return;
  const canvas=$('nsCanvas'),rect=canvas.getBoundingClientRect(),id=event.target.closest('[data-ns-node]')?.dataset.nsNode,wire=event.target.closest('[data-ns-edge]')?.dataset.nsEdge;
  if(wire&&editing&&tool!=='pan'){selected=wire;renderDrawer();renderCanvas();return;}
  if(id&&tool!=='pan'){selectPoint(id);if(!editing||tool==='connect'||busy)return;}
  const n=id?network.nodes.find(n=>n.id===id):null,p={x:event.clientX-rect.left,y:event.clientY-rect.top};
  if(n&&editing&&tool==='select'){checkpoint();drag={kind:'node',id,x:event.clientX,y:event.clientY,startX:n.x,startY:n.y,moved:false};}
  else{drag={kind:'pan',x:event.clientX,y:event.clientY,camera:{...network.camera},moved:false};}
  canvas.setPointerCapture(event.pointerId);event.preventDefault();
}
function onPointerMove(event){
  if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.moved=drag.moved||Math.abs(dx)+Math.abs(dy)>3;
  if(drag.kind==='node'){const n=network.nodes.find(n=>n.id===drag.id);if(n){n.x=drag.startX+dx/network.camera.zoom;n.y=drag.startY+dy/network.camera.zoom;}}
  else{network.camera.x=drag.camera.x+dx;network.camera.y=drag.camera.y+dy;}
  renderCanvas();
}
function onPointerUp(event){if(!drag)return;drag=null;try{$('nsCanvas').releasePointerCapture(event.pointerId);}catch{}persist();}
function exportRows(){
  const headers=['asset_id','asset_name','type','year','role','scenario','spill_count','duration_hours','eligible','analysis_start','analysis_end','valid_hours','unknown_hours','excluded_hours','count_status','counting_basis','source_name','source_sha256','column','threshold','unit','quantity','context_start','max_gap_seconds','exclusions','comparison_basis_confirmed','calculated_at','current'];
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
  const text='<svg xmlns="'+NS+'" width="'+d.width+'" height="'+d.height+'" viewBox="0 0 '+d.width+' '+d.height+'"><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" fill="#182732">'+svgContent()+overlay+'<text x="12" y="'+(d.height-12)+'" font-size="11" fill="#60717d">Hydra Bench · '+html(network.year==='all'?'All years':network.year)+' · '+html(network.scenario)+' · connections show topology only</text></g></svg>';
  const blob=new Blob([text],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
  try{await document.fonts?.ready;const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=d.width*2;canvas.height=d.height*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawImage(image,0,0);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('Could not create screenshot.');const link=document.createElement('a'),pngUrl=URL.createObjectURL(png);link.href=pngUrl;link.download='hydra-network-schematic.png';link.click();setTimeout(()=>URL.revokeObjectURL(pngUrl),1000);status('Network PNG captured with the open evidence table.');}
  finally{URL.revokeObjectURL(url);}
}
function mount(){
  const container=root();if(!container)return;
  container.innerHTML='<div id="nsWorkbench"><div class="ns-main-toolbar"><label>Year<select id="nsYear"></select></label><label>Evidence<select id="nsScenario"></select></label><label>Metric<select id="nsMetric"><option value="spill_count">Spill count</option><option value="duration_hours">Duration (h)</option></select></label><button id="nsEdit">Edit network</button><button id="nsCapture">Capture PNG</button><details class="ns-export-menu"><summary>Save / export</summary><button id="nsSave">Save network</button><button id="nsLoad">Load network</button><button id="nsCsv">Export evidence CSV</button></details><input id="nsLoadInput" type="file" accept=".json" hidden><span class="ns-network-legend">Network: <i class="ns-red"></i>Red <i class="ns-amber"></i>Amber <i class="ns-blue"></i>Blue</span></div>'+
    '<div id="nsEditTools" class="ns-edit-tools" hidden>'+selectHtml('id="nsAddType"',Object.entries(C.types).filter(([key])=>!['manhole','label'].includes(key)),'cso')+'<button id="nsAddAsset">+ Asset</button><button id="nsAddManhole">+ Manhole</button><button id="nsAddLabel">+ Label</button><button id="nsConnect" aria-pressed="false">Connect</button><span id="nsColourChoices"></span><button id="nsUndo" aria-label="Undo last edit">Undo</button><button id="nsDelete">Delete selected</button></div>'+
    '<div id="nsLayout"><div id="nsCanvas" tabindex="0" aria-label="Network schematic. Drag background to pan; select an asset to review evidence."><svg id="nsSvg" xmlns="'+NS+'" aria-label="Site network overview"></svg><aside id="nsPopup" hidden></aside><section id="nsPicker" role="dialog" aria-label="Assign imported datasets" hidden></section><div class="ns-canvas-note">Connections show topology only</div><div class="ns-camera-tools"><button id="nsPan" aria-pressed="false">Pan</button><button id="nsZoomOut" aria-label="Zoom out">−</button><span id="nsZoom">100%</span><button id="nsZoomIn" aria-label="Zoom in">+</button><button id="nsFit">Fit</button></div></div><aside id="nsDrawer" hidden></aside></div><p id="nsStatus" role="status" aria-live="polite">Create your site overview, then assign evidence to individual assets.</p></div>';
  mounted=true;container.addEventListener('click',onClick);container.addEventListener('change',event=>updateField(event.target));
  $('nsEdit').onclick=()=>{editing=!editing;popupVisible=false;tool='select';connectFrom=null;render();};
  $('nsAddAsset').onclick=()=>add($('nsAddType').value);$('nsAddManhole').onclick=()=>add('manhole');$('nsAddLabel').onclick=()=>add('label');
  $('nsConnect').onclick=()=>{tool=tool==='connect'?'select':'connect';connectFrom=null;render();status('Click the upstream point, then the downstream point.');};
  $('nsPan').onclick=()=>{tool=tool==='pan'?'select':'pan';connectFrom=null;render();};
  $('nsUndo').onclick=()=>{if(history.length){network=JSON.parse(history.pop());selected=null;changed();render();}};$('nsDelete').onclick=removeSelected;
  $('nsZoomIn').onclick=()=>zoom(1.25);$('nsZoomOut').onclick=()=>zoom(.8);$('nsFit').onclick=fit;
  for(const [id,key] of [['nsYear','year'],['nsScenario','scenario'],['nsMetric','metric']])$(id).onchange=()=>{network[key]=$(id).value;changed(true);};
  $('nsSave').onclick=()=>downloadBlob('hydra-network-schematic.json',JSON.stringify(snapshot(),null,2),'application/json');$('nsLoad').onclick=()=>$('nsLoadInput').click();
  $('nsLoadInput').onchange=async event=>{try{const file=event.target.files[0];if(file){restore(JSON.parse(await file.text()));persist();status('Network restored. Reload matching source files to validate and calculate its evidence.');}}catch(error){status(error.message);}finally{event.target.value='';}};
  $('nsCsv').onclick=exportRows;$('nsCapture').onclick=()=>capture().catch(error=>status(error.message));
  const canvas=$('nsCanvas');canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',onPointerUp);canvas.addEventListener('pointercancel',onPointerUp);
  canvas.addEventListener('keydown',event=>{if(event.target.closest('#nsPopup,#nsPicker'))return;const n=event.target.closest('[data-ns-node]'),e=event.target.closest('[data-ns-edge]');if(['Enter',' '].includes(event.key)&&(n||e)){event.preventDefault();if(n)selectPoint(n.dataset.nsNode);else{selected=e.dataset.nsEdge;renderDrawer();renderCanvas();}return;}
    if(event.key==='Escape'){connectFrom=null;popupVisible=false;$('nsPicker').hidden=true;renderPopup();return;}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const target=editing&&node();if(target){checkpoint();target.x+=event.key==='ArrowLeft'?-10:event.key==='ArrowRight'?10:0;target.y+=event.key==='ArrowUp'?-10:event.key==='ArrowDown'?10:0;}else{network.camera.x+=event.key==='ArrowLeft'?30:event.key==='ArrowRight'?-30:0;network.camera.y+=event.key==='ArrowUp'?30:event.key==='ArrowDown'?-30:0;}changed(true);}
  });
  container.addEventListener('input',event=>{if(event.target.id==='nsSourceSearch'){const value=event.target.value.toLowerCase();container.querySelectorAll('[data-ns-file-name]').forEach(row=>row.hidden=!row.dataset.nsFileName.includes(value));}});
  observer=new ResizeObserver(()=>renderCanvas());observer.observe(canvas);
  window.addEventListener('icm:source-pool-changed',()=>{renderCanvas();if(editing)renderDrawer();});
  render();
}
async function open(){
  if(!mounted){let value=state.networkSchematicWorkspace;if(!value){try{value=JSON.parse(localStorage.getItem(STORE)||'null');}catch{}}
    if(value){try{network=C.validateNetwork(value);}catch(error){network=C.empty();}}
    mount();
  }else render();
}
window.ICMNetworkSchematic={open,snapshot,restore,capture,calculate,core:C,debug:()=>({selected,editing,busy,fresh:network.nodes.map(n=>({id:n.id,fresh:isFresh(n)}))})};
})();
