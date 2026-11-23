/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
/* Network overview: own state, local source bindings and calendar spill results. */
(()=>{'use strict';
const C=ICMNetworkCore,R=ICMNetworkReviewCore,NS='http://www.w3.org/2000/svg',STORE='hydra-network-schematic-v1';
const $=id=>document.getElementById(id),uid=()=>crypto.randomUUID();
// Keep escaping explicit in this module so static analysis resolves every sink.
function html(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
let network=C.empty(),selected=null,editing=false,tool='select',colour='red',connectFrom=null,drag=null,busy=false,history=[],mounted=false,popupVisible=false,observer=null,saveTimer=null;
let inspectorTab='evidence',selectionKind='node';
let redo=[],multi=new Set(),highlight=null,hoverTimer=null,frame=null,analysisGeneration=0,analysisContext=null,analysisTimer=null,analysisReturnFocus=null,pickerReturnFocus=null;
const freshness=new Map();
const prefs=()=>R.preferences(network);
let overviewCache=null,monitorCache=null,detailedCamera=null,simulationView=null,geometryView=null,hotspots=null;
let paintedCamera=null;
const inOverview=()=>prefs().overview&&!editing;
const overviewGraph=()=>overviewCache??=R.overview(network);
const sceneGraph=()=>inOverview()?overviewGraph():network;
function monitorGroups(){
  if(monitorCache)return monitorCache;
  const {byAsset}=R.monitorIndex(network);
  monitorCache=new Map();
  for(const location of network.monitorLocations||[]){
    const key=R.refKey(location.asset);
    if(byAsset.get(key)?.identity!==location.identity)continue;
    if(!monitorCache.has(key))monitorCache.set(key,[]);
    monitorCache.get(key).push(location.monitor);
  }
  return monitorCache;
}
function resetReviewCaches(){overviewCache=null;monitorCache=null;}
function changeOverview(value){
  if(inOverview()===value)return;
  if(value)simulationView?.reset('Simulation playback uses the detailed network.');
  if(value)detailedCamera={...network.camera};
  network.preferences={...prefs(),overview:value};
  if(!value&&detailedCamera)network.camera=detailedCamera;
  simulationView?.refreshSources();
  render();
  if(value||!detailedCamera)fit();
  else persist();
}
const structureCodes={hw_pump:'P',hw_weir:'W',hw_orifice:'O',hw_sluice:'S',hw_flap_valve:'F',hw_screen:'S',hw_user_control:'C',hw_outlet:'O'};
function structureMarker(link,x,y){
  const kind=link.icm?.table;
  if(!Object.hasOwn(structureCodes,kind))return null;
  const code=structureCodes[kind];
  const marker=svgElement('g',{'data-ns-structure':'',transform:translate(x,y)});
  marker.append(svgElement('title',{},kind.slice(3).replaceAll('_',' ')),
    svgElement('rect',{x:-9,y:-9,width:18,height:18,rx:3,fill:'#f8f5ff',stroke:'#6947a1'}),
    svgElement('text',{y:3.5,'text-anchor':'middle',fill:'#513885','font-size':10,'font-weight':700},code));
  return marker;
}
function monitorMarker(kind,id,x,y){
  const names=monitorGroups().get(R.refKey({kind,id}));
  if(!prefs().showMonitors||!names?.length)return null;
  const marker=svgElement('g',{'data-ns-monitor':'',transform:translate(x,y)});
  marker.append(svgElement('title',{},names.join(', ')+(kind==='edge'?' · installed on host link':'')),
    svgElement('circle',{r:10,fill:'#174b64',stroke:'#fff','stroke-width':2}),
    svgElement('text',{y:3.5,'text-anchor':'middle',fill:'#fff','font-size':9,'font-weight':700},names.length>1?String(Math.min(names.length,99)):'M'));
  return marker;
}
const root=()=>$('tab-spill-network');
const node=()=>selectionKind==='node'?network.nodes.find(n=>n.id===selected):null;
const edge=()=>selectionKind==='edge'?network.edges.find(e=>e.id===selected):null;
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
function checkpoint(){resetReviewCaches();redo=[];history.push(JSON.stringify(network));if(history.length>30)history.shift();}
function snapshot(){return JSON.parse(JSON.stringify(network));}
function flushSave(){clearTimeout(saveTimer);try{localStorage.setItem(STORE,JSON.stringify(network));}catch(error){status('Browser save unavailable; use Save network to keep this layout.');}}
function persist(){state.networkSchematicWorkspace=snapshot();clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,250);}
function status(message){if($('nsStatus'))$('nsStatus').textContent=message;}
function changed(geometry=false){if(!geometry)freshness.clear();persist();renderCanvas();if(!geometry)renderFilters();renderReview();}
function restore(value){
  resetReviewCaches();resetRouteDraft();detailedCamera=null;network=value?C.validateNetwork(value):C.empty();branchIsolated=false;selected=null;popupVisible=false;history=[];redo=[];multi.clear();highlight=null;freshness.clear();
  state.networkSchematicWorkspace=snapshot();if(mounted){simulationView?.refreshSources();render();persist();}
}
function point(x,y){return {x:x*network.camera.zoom+Number(network.camera.x),y:y*network.camera.zoom+Number(network.camera.y)};}
function world(x,y){return {x:(x-network.camera.x)/network.camera.zoom,y:(y-network.camera.y)/network.camera.zoom};}
function dimensions(){return {width:Math.max(240,$('nsCanvas')?.clientWidth||1000),height:Math.max(360,$('nsCanvas')?.clientHeight||620)};}
// The scene uses fixed element and attribute names. Project data is assigned as
// text or attribute values, without passing it through an HTML parser.
function svgElement(tag,attributes={},content){
  const element=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attributes))element.setAttribute(key,value);
  if(content!==undefined)element.textContent=content;
  return element;
}
function translate(x,y){return `translate(${x} ${y})`;}
function polygonPoints(points){return points.map(({x,y})=>`${x},${y}`).join(' ');}
function positionRecordedDirection(group){
  const mark=group.querySelector('[data-ns-recorded-direction]'),nominal=group.querySelector('[data-ns-direction]');
  if(!mark||nominal?.points.numberOfItems!==3){if(mark)mark.removeAttribute('points');return;}
  const points=Array.from({length:3},(_,index)=>nominal.points.getItem(index));
  if(group.dataset.nsFlowDirection==='reverse'){
    const [tip,left,right]=points;
    const x=tip.x+(left.x+right.x)/2,y=tip.y+(left.y+right.y)/2;
    mark.setAttribute('points',polygonPoints(points.map(point=>({x:x-point.x,y:y-point.y}))));
  }else mark.setAttribute('points',nominal.getAttribute('points'));
}
function showRecordedDirection(group,direction){
  if(group.dataset.nsFlowDirection===direction)return;
  if(direction)group.dataset.nsFlowDirection=direction;else delete group.dataset.nsFlowDirection;
  let mark=group.querySelector('[data-ns-recorded-direction]');
  if((direction!=='forward'&&direction!=='reverse')||!group.querySelector('[data-ns-direction]')){mark?.remove();return;}
  if(!mark){mark=svgElement('polygon',{'data-ns-recorded-direction':'','aria-hidden':'true'});group.append(mark);}
  positionRecordedDirection(group);
}
function renderBandLegend(legend,title,low,high,missing){
  legend.replaceChildren(inspectorElement('strong',title),...Array.from({length:5},(_,band)=>{
    const a=low+(high-low)*(band/5),b=low+(high-low)*((band+1)/5);
    const item=inspectorElement('span',band===0?'< '+f(b,4):band===4?'≥ '+f(a,4):f(a,4)+' to < '+f(b,4));
    item.dataset.nsSample=String(band);return item;
  }),inspectorElement('span',missing));
}
const iconPaths={
  cso:'M-25 2c8-7 14 5 22 0h5v-18h7v31h17',
  storm:'M-25 2h21v-16h7v28h23',
  emergency:'M-25 4h50M0-15v12M0 12h.01',
  pump:'M-10-14L15 0-10 14Z',
  wwtw:'M-21-22v44M7-22v44M-32-10H32',
  tank:'M-26-16v32M26-16v32M-26 0c10-7 18 7 28 0s17 5 24 0',
  junction:'M-20 0h40M0-20v40',
  outfall:'M-24-12H9V12H-24M9 0h20M22-7l7 7-7 7',
};
function renderIcon(group,type){
  if(type==='label'){
    group.append(svgElement('circle',{r:3,fill:'currentColor'}));
    return;
  }
  const radii={pump:25,junction:12,manhole:8};
  if(Object.hasOwn(radii,type))group.append(svgElement('circle',{r:radii[type]}));
  if(Object.hasOwn(iconPaths,type))group.append(svgElement('path',{d:iconPaths[type]}));
}
function evidenceBadge(attribute,state,offset,colour,letter,title,extra={}){
  const badge=svgElement('g',{[attribute]:state,transform:offset,...extra});
  badge.append(
    svgElement('title',{},title),
    svgElement('circle',{r:8,fill:'#fff',stroke:colour}),
    svgElement('text',{y:4,'text-anchor':'middle','font-size':10,fill:colour},letter),
  );
  return badge;
}
function resultBadge(n){
  if(!n.bindings.length)return '';
  if(prefs().detail==='minimal'||prefs().detail==='auto'&&network.camera.zoom<.55&&selected!==n.id&&!multi.has(n.id))return '';
  const chosen=prefs().scenarios,rows=(n.applied?.rows||[]).filter(r=>r.role==='observed'||chosen===null||chosen.includes(r.scenario));
  const summaries=C.summaryYears(rows,network.year,network.metric,n.confirmed,isFresh(n),n.bindings.filter(b=>b.role==='model'&&(chosen===null||chosen.includes(b.scenario))).map(b=>b.scenario),R.years(n));
  const lines=summaries.flatMap(summary=>[{year:summary.year,header:true,text:String(summary.year)},...summary.items.filter(item=>network.evidenceMode==='combined'||item.label===(network.scenario==='observed'?'O':'M ('+network.scenario+')')).map(item=>({...item,year:summary.year,text:(item.label.length>24?'M ('+item.label.slice(3,-1).slice(0,18)+'…)':item.label)+': '+(item.stale&&n.applied?'↻':f(item.value,network.metric==='spill_count'?0:1))+(network.metric==='duration_hours'&&item.value!==null?' h':'')}))]);
  const width=Math.max(65,...lines.map(item=>item.text.length*7+16)),height=8+lines.length*21;
  const rawOffset=C.labelOffset(n),offset={x:Number(rawOffset.x),y:Number(rawOffset.y)},box=C.bounds(n.type),vertical=Math.abs(offset.y)/box.y>=Math.abs(offset.x)/box.x;
  const x=vertical?offset.x-width/2:offset.x<0?offset.x-width-10:offset.x+10;
  const y=vertical?(offset.y<=0?offset.y+4-height:offset.y+25):offset.y-height/2+14;
  const badge=svgElement('g',{'data-ns-summary':'',transform:translate(x,y)});
  if(network.evidenceMode==='single')badge.setAttribute('data-ns-badge','');
  badge.append(svgElement('rect',{x:0,y:-14,width,height,rx:5,fill:'white',stroke:'#c7d2d9'}));
  for(const [i,item] of lines.entries()){
    const row=svgElement('g',{[item.header?'data-ns-summary-year':'data-ns-summary-row']:item.year});
    if(item.rag)row.setAttribute('class','ns-rag-'+item.rag);
    const title=item.header?item.text:item.label+': '+(item.value===null?'Unavailable':f(item.value))+(item.reason?' · '+item.reason:'');
    const background=item.header?'#f5f7f9':{green:'#eaf6ed',amber:'#fff4d9',red:'#fdebec'}[item.rag]||'white';
    const foreground=item.header?'#60717d':{green:'#267044',amber:'#9a6500',red:'#b93838'}[item.rag]||'#182732';
    row.append(svgElement('title',{},title),
      svgElement('rect',{x:1,y:-10+i*21,width:width-2,height:20,fill:background}),
      svgElement('text',{x:7,y:4+i*21,'font-size':item.header?11:12,'font-weight':item.header?600:400,fill:foreground},item.text));
    badge.append(row);
  }
  return badge;
}
function unitOptions(quantity){return quantity==='status'?[['1','Binary / unitless']]:quantity==='flow'?[['','Assign…'],['m³/s','m³/s'],['L/s','L/s'],['Ml/d','Ml/d'],['m³/d','m³/d']]:[['','Assign…'],['m','m'],['mm','mm']];}
function verificationBadge(point,evidence,reviews){
  if(!point.monitorId)return '';
  const matched=evidence?.asset.kind==='flow-monitor'&&evidence.asset.id===point.monitorId;
  const needsInvestigation=matched&&reviews.some(row=>['Requires investigation','Not suitable for acceptance'].includes(row.decision));
  const state=needsInvestigation?'Review requires attention':!matched?'No comparison':evidence.freshness!=='current'?'Stale evidence':
    evidence.scenarios.some(row=>row.metrics?.pairs&&row.coverage?.status==='complete')?'Evidence available':
    evidence.scenarios.some(row=>row.metrics?.pairs&&row.coverage?.status==='partial')?'Partial evidence':'No valid comparison';
  const decisions=matched?reviews.map(row=>row.scenario+' · '+row.decision).join(' / '):'';
  const colour=needsInvestigation?'#9a6500':'#4740b6';
  return evidenceBadge('data-ns-verification',state,translate(52,-16),colour,'V',
    point.monitorId+' · '+state+(decisions?' · '+decisions:''));
}
function flowSurveyBadge(point,view){
  if(!point.monitorId)return '';
  const item=view?.byMonitor.get(point.monitorId);
  const state=item?.status==='stale'?'Stale survey evidence':!item?.rating?'No survey evidence':
    item.rating+' · '+(item.reviewed?'Engineer reviewed':'Calculated')+(item.short?' · Short boundary week':'');
  const colour={'Green':'#267044','Amber':'#9a6500','Red':'#b93838'}[item?.rating]||'#60717d';
  return evidenceBadge('data-ns-survey',state,translate(52,4),colour,'F',
    point.monitorId+' · '+(view?.week||'No week')+' · '+state);
}
function surveyLayerView(){
  return window.__ICM_WORKBENCH__?.workflow26?.schematicSurveyEvidence(prefs().surveyWeek);
}
const detrimentKinds=[['flooding','Flooding'],['level','Level / freeboard'],['spill','Spill count / duration']];
function detrimentKind(){
  return detrimentKinds.some(([id])=>id===prefs().detrimentKind)?prefs().detrimentKind:'flooding';
}
function detrimentView(kind=detrimentKind()){
  return window.ICMDetriment?.schematicEvidence(kind);
}
function detrimentBadge(object,view,x,y){
  const link=object.detrimentLinks?.[detrimentKind()];
  if(!link)return '';
  const row=link.signature===view?.signature?view.rows.get(link.id):null;
  const state=row?.status||'stale';
  const colour={detriment:'#b93838',improvement:'#267044',risk:'#9a6500'}[state]||'#60717d';
  const delta=row?.delta==null?'':' · Δ '+f(row.delta,6)+' '+row.unit;
  const duration=row?.duration_delta_hours==null?'':' · Δ duration '+f(row.duration_delta_hours,6)+' h';
  const freeboard=row?.freeboard_b==null?'':' · Proposed freeboard '+f(row.freeboard_b,6)+' m';
  const flags=row?.flags.length?' · '+row.flags.join(', ').replaceAll('_',' '):'';
  return evidenceBadge('data-ns-detriment',state,translate(x,y),colour,'D',
    link.id+' · '+(row?view.caption+' · '+state+delta+duration+freeboard+flags:'Stale or unavailable comparison'),
    {'pointer-events':'none'});
}
function hotspotAt(kind,id,applyFilter=false){
  const matched=hotspots?.matches.mapped.get(R.refKey({kind,id}));
  const metric=matched?.row.metrics[hotspots.criterion];
  if(!metric)return null;
  const severity=hotspots.severity;
  if(applyFilter&&severity!=='all'&&(severity==='adverse'?!['risk','detriment'].includes(metric.status):metric.status!==severity))return null;
  return {matched,metric};
}
function hotspotBadge(kind,id,x,y){
  const evidence=hotspotAt(kind,id,true);
  if(!evidence)return null;
  const {matched,metric}=evidence;
  const tone={detriment:'#b93838',risk:'#9a6500',improvement:'#267044'}[metric.status]||'#60717d';
  const value=metric.value==null?'Unavailable':f(metric.value,6)+' '+metric.unit;
  return evidenceBadge('data-ns-hotspot',metric.status,translate(x,y),tone,'H',
    matched.row.assetId+' · '+metric.label+' · '+metric.status+' · '+value,{'pointer-events':'none'});
}
function detrimentAssociation(object){
  if(!object.contextSource)return '';
  const view=detrimentView(),kind=detrimentKind(),link=object.detrimentLinks?.[kind];
  const current=link&&link.signature===view?.signature&&view.rows.has(link.id);
  return '<details><summary>Detriment association</summary><p>'+html(detrimentKinds.find(([id])=>id===kind)[1])+' · '+
    html(view?.caption||'Calculate a comparison first')+'</p>'+
    (view?fields('Exact report asset ID','<input id="nsDetrimentId" aria-label="Exact report asset ID" maxlength="512" value="'+html(link?.id||'')+'">')+
      '<p class="ns-note">Confirm this ID refers to the selected physical object in both reports.</p>'+
      '<button type="button" id="nsConfirmDetriment">Confirm association</button> ':'')+
    (link?'<button type="button" id="nsRemoveDetriment">Remove association</button> ':'')+
    (current?'<button type="button" id="nsOpenDetriment">Open detriment evidence</button>':'')+'</details>';
}
function monitorAssociations(point){
  if(point.type==='label')return '';
  const monitors=(window.ICMProjectRegistry?.snapshot()?.assets||[]).filter(asset=>asset.kind==='flow-monitor');
  if(!monitors.length&&!point.monitorId)return '';
  const options=[['','Unlinked'],...monitors.map(asset=>[asset.id,asset.id])];
  if(point.monitorId&&!monitors.some(asset=>asset.id===point.monitorId))options.push([point.monitorId,point.monitorId+' · source unavailable']);
  return '<details><summary>Monitoring association</summary>'+fields('Flow monitor',selectHtml('id="nsMonitorAssociation" aria-label="Flow monitor"',options,point.monitorId||''))+
    '<p class="ns-note">Select the monitor only when the physical installation is confirmed.</p>'+
    (point.monitorId?'<button type="button" id="nsOpenVerification">Open Verification evidence</button> <button type="button" id="nsOpenFlowSurvey">Open Flow Survey week</button>':'')+'</details>';
}
function renderEdgeHandles(group,route,bendCount){
  for(const [i,p] of route.points.slice(1,-1).entries()){
    group.append(svgElement('circle',{'data-ns-bend':i,cx:p.x,cy:p.y,r:7,fill:'white',stroke:'#087b82','stroke-width':2}));
  }
  if(bendCount>=32)return;
  for(const [i,p] of route.points.slice(1).entries()){
    const a=route.points[i],x=(a.x+p.x)/2,y=(a.y+p.y)/2;
    const handle=svgElement('g',{'data-ns-add-bend':i,'aria-label':'Add bend'});
    handle.append(svgElement('circle',{cx:x,cy:y,r:8,fill:'white',stroke:'#087b82'}),
      svgElement('path',{'data-ns-handle':'',d:`M${x-3} ${y}h6M${x} ${y-3}v6`,stroke:'#087b82','pointer-events':'none'}));
    group.append(handle);
  }
}
function renderNodeLeader(group,n,scale){
  const leader=C.labelLeader(n,scale);
  group.replaceChildren();
  if(leader)group.append(svgElement('path',{'data-ns-leader':'',d:'M'+leader.start.x+' '+leader.start.y+'L'+leader.end.x+' '+leader.end.y,
    stroke:'#82939f','stroke-width':1,fill:'none'}),svgElement('polygon',{points:polygonPoints(leader.arrow),fill:'#82939f'}));
}
function largeScene(graph){return graph.nodes.length+graph.edges.length>3000;}
function sceneMarkerScale(graph=sceneGraph()){
  const zoom=network.camera.zoom,ordinary=C.symbolScale(zoom);
  return largeScene(graph)||inOverview()&&graph.nodes.length>180?Math.min(ordinary,Math.max(.22,zoom*2.5)):ordinary;
}
function sceneWindow(shown,links,byId,width,height){
  const a=world(-100,-100),b=world(width+100,height+100);
  const nodes=shown.filter(n=>n.id===selected&&selectionKind==='node'||n.x>=a.x&&n.x<=b.x&&n.y>=a.y&&n.y<=b.y);
  const edges=links.filter(e=>{
    if(e.id===selected&&selectionKind==='edge')return true;
    const start=byId.get(e.from),end=byId.get(e.to);
    let left=Math.min(start.x,end.x),right=Math.max(start.x,end.x);
    let top=Math.min(start.y,end.y),bottom=Math.max(start.y,end.y);
    for(const p of e.bends||[]){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}
    return left<=b.x&&right>=a.x&&top<=b.y&&bottom>=a.y;
  });
  return {nodes,edges};
}
function compactGeometry(scene,nodes,edges,byId){
  const lines=new Map(),points=new Map();
  function append(byStyle,colour,dimmed,path){
    const style=colour+'|'+(dimmed?'dim':'full');
    if(!byStyle.has(style))byStyle.set(style,{colour,dimmed,paths:[]});
    byStyle.get(style).paths.push(path);
  }
  const coordinate=p=>{const {x,y}=point(p.x,p.y);return Math.round(x*10)/10+' '+Math.round(y*10)/10;};
  for(const n of nodes)append(points,n.colour,highlight&&!highlight.ids.has(n.id),'M'+coordinate(n)+'h.1');
  for(const e of edges){
    const changed=highlight&&!(e.sourceEdges||[e.id]).some(id=>highlight.wires.has(id));
    const style=e.direction==='unknown'?e.colour+'-unknown':e.colour;
    const path=[byId.get(e.from),...(e.bends||[]),byId.get(e.to)].map(coordinate).join('L');
    append(lines,style,changed,'M'+path);
  }
  for(const [marks,width] of [[lines,1.4],[points,3]]){
    for(const {colour,dimmed,paths} of marks.values()){
      const [key,unknown]=colour.split('-');
      scene.append(svgElement('path',{'data-ns-compact':'','aria-hidden':'true',d:paths.join(''),fill:'none',
        stroke:C.colours[key],'stroke-width':width,'stroke-linecap':'round','stroke-dasharray':unknown?'5 4':'',opacity:dimmed?.2:.72}));
    }
  }
}
function renderScene(includeHandles=true){
  const graph=sceneGraph(),includeLabels=includeHandles||prefs().showLabels;
  const {width,height}=dimensions(),scene=document.createDocumentFragment();
  const verificationLayer=prefs().verification===true;
  const evidence=verificationLayer?window.__ICM_WORKBENCH__?.readVerificationEvidence?.():null;
  const reviews=evidence?window.__ICM_WORKBENCH__?.verificationReviews?.report(evidence)||[]:[];
  const surveyLayer=prefs().flowSurvey===true;
  const surveyView=surveyLayer?surveyLayerView():null;
  const detrimentLayer=prefs().detriment===true,comparison=detrimentLayer?detrimentView():null;
  const shown=visibleNodes(graph.nodes),shownIds=new Set(shown.map(n=>n.id)),byId=new Map(graph.nodes.map(n=>[n.id,n]));
  const scale=sceneMarkerScale(graph),markerTransform='scale('+scale+')';
  const hit=scale<C.symbolScale(network.camera.zoom)?Math.max(.55,scale):1;
  const geometry=geometryView?.current();
  const eligibleEdges=graph.edges.filter(e=>shownIds.has(e.from)&&shownIds.has(e.to)&&
    (!branchIsolated||!highlight||(e.sourceEdges||[e.id]).some(id=>highlight.wires.has(id))));
  const windowed=includeHandles&&largeScene(graph)?sceneWindow(shown,eligibleEdges,byId,width,height):{nodes:shown,edges:eligibleEdges};
  const condensed=windowed.nodes.length+windowed.edges.length>1400&&includeHandles&&largeScene(graph)&&
    !geometry&&!verificationLayer&&!surveyLayer&&!detrimentLayer&&!hotspots;
  let {nodes:displayNodes,edges:displayEdges}=windowed;
  if(condensed){
    const locations=monitorGroups(),hasMonitor=(kind,id)=>prefs().showMonitors&&locations.has(R.refKey({kind,id}));
    const focusedNode=n=>selectionKind==='node'&&(n.id===selected||multi.has(n.id));
    const focusedEdge=e=>selectionKind==='edge'&&(e.id===selected||e.sourceEdges?.includes(selected));
    const highlights=items=>items.filter(([,important])=>important).slice(0,240).map(([object])=>object);
    displayNodes=[...displayNodes.filter(focusedNode),...highlights(displayNodes.filter(n=>!focusedNode(n)).map(n=>[n,
      hasMonitor('node',n.id)||n.pinned||!['manhole','junction'].includes(n.type)]))];
    displayEdges=[...displayEdges.filter(focusedEdge),...highlights(displayEdges.filter(e=>!focusedEdge(e)).map(e=>[e,
      hasMonitor('edge',e.id)||Object.hasOwn(structureCodes,e.icm?.table)]))];
    const markers=new Set(displayNodes.map(n=>n.id)),details=new Set(displayEdges.map(e=>e.id));
    compactGeometry(scene,windowed.nodes.filter(n=>!markers.has(n.id)),windowed.edges.filter(e=>!details.has(e.id)),byId);
  }
  const connections=largeScene(graph)&&includeHandles?new Set(displayEdges.flatMap(e=>[e.from,e.to])):null;
  const routeEdges=connections?graph.edges.filter(e=>connections.has(e.from)||connections.has(e.to)):graph.edges;
  const routes=C.connectionRoutes(graph.nodes,routeEdges,n=>point(n.x,n.y),scale);
  for(const e of displayEdges){
    const route=routes.get(e.id);if(!route)continue;
    const a=byId.get(e.from),b=byId.get(e.to),colour=C.colours[e.colour];
    const chosen=selectionKind==='edge'&&(e.id===selected||e.sourceEdges?.includes(selected))||
      selectionKind==='node'&&e.sourceNodes?.slice(1,-1).includes(selected);
    const group=svgElement('g',{'data-ns-edge':e.id,tabindex:0,role:'button','aria-label':'Connector '+(e.name||a.name+' to '+b.name)});
    group.append(svgElement('path',{d:route.path,fill:'none',stroke:'transparent','stroke-width':14}),
      svgElement('path',{'data-ns-wire':'',d:route.path,fill:'none',stroke:colour,'stroke-width':chosen?4:2,
        'stroke-dasharray':e.direction==='unknown'?'6 4':''}));
    if(e.direction!=='unknown'&&e.arrow!==false&&route.arrow.length){
      group.append(svgElement('polygon',{'data-ns-direction':'',points:polygonPoints(route.arrow),fill:colour}));
    }
    const showLinkLabel=editing||selectionKind==='edge'&&e.id===selected||prefs().detail==='full'||prefs().detail==='auto'&&network.camera.zoom>=.65;
    if(e.name&&showLinkLabel&&includeLabels){
      group.append(svgElement('text',{'data-ns-edge-label':'',x:route.label.x+Number(e.labelOffset?.x||0),
        y:route.label.y+Number(e.labelOffset?.y||0),fill:colour,'font-size':13},e.name));
    }
    const badge=detrimentLayer&&detrimentBadge(e,comparison,route.label.x-10,route.label.y-5);
    if(badge)group.append(badge);
    const hotspot=hotspotBadge('edge',e.id,route.label.x-23,route.label.y+10);
    if(hotspot)group.append(hotspot);
    const structure=inOverview()&&structureMarker(e,route.label.x,route.label.y+12);
    if(structure)group.append(structure);
    const monitor=monitorMarker('edge',e.id,route.label.x+14,route.label.y-13);
    if(monitor)group.append(monitor);
    if(includeHandles&&editing&&selectionKind==='edge'&&e.id===selected)renderEdgeHandles(group,route,(e.bends||[]).length);
    if(geometry){
      const reading=R.sourceConduitLayer(e,geometry.quantity);
      if(reading){
        const caption=geometry.name+' · '+(reading.value===null?'Unavailable':f(reading.value,6)+' '+reading.unit)+' · '+reading.basis;
        group.setAttribute('aria-label',group.getAttribute('aria-label')+' · '+caption);
        group.prepend(svgElement('title',{},caption));group.dataset.nsSample=R.simulationBand(reading.value,geometry.low,geometry.high);
      }
    }
    scene.append(group);
  }
  for(const n of displayNodes){
    const p=point(n.x,n.y),colour=C.colours[n.colour],box=C.bounds(n.type),offset=C.labelOffset(n);
    const small=['manhole','label'].includes(n.type);
    const title=n.name+' · '+C.types[n.type];
    const group=svgElement('g',{'data-ns-node':n.id,transform:translate(p.x,p.y),tabindex:0,role:'button','aria-label':title});
    group.append(svgElement('title',{},title));
    if(selectionKind==='node'&&selected===n.id||multi.has(n.id)){
      group.append(svgElement('rect',{'data-ns-selection':'',transform:markerTransform,x:-42,y:-32,width:84,height:64,rx:8,fill:'none',stroke:'#0b8f96','stroke-width':2}));
    }
    if(!box.circle){
      group.append(svgElement('rect',{'data-ns-frame':'',transform:markerTransform,x:-box.x,y:-box.y,width:box.x*2,height:box.y*2,
        rx:6,fill:'white',stroke:colour,'stroke-width':1.5}));
    }
    group.append(svgElement('rect',{x:-37*hit,y:-28*hit,width:74*hit,height:56*hit,fill:'transparent'}));
    const symbol=svgElement('g',{'data-ns-symbol':'',transform:markerTransform,stroke:colour,'stroke-width':1.8,fill:'white',
      'stroke-linecap':'round','stroke-linejoin':'round'});
    renderIcon(symbol,n.type);
    group.append(symbol);
    if(includeLabels&&(small||n.nameOffset)){
      const leader=svgElement('g',{'data-ns-node-leader':''});
      renderNodeLeader(leader,n,scale);group.append(leader);
    }
    if(includeLabels)group.append(svgElement('text',{'data-ns-label':n.id,x:Number(offset.x)+(small?5:0),y:Number(offset.y),
      'text-anchor':small?'start':'middle','font-size':small?13:14,'font-weight':small?400:600,fill:'#182732'},n.name));
    for(const badge of [asset(n)&&resultBadge(n),verificationLayer&&verificationBadge(n,evidence,reviews),
      surveyLayer&&flowSurveyBadge(n,surveyView),detrimentLayer&&detrimentBadge(n,comparison,52,24),hotspotBadge('node',n.id,-29,19)]){
      if(badge)group.append(badge);
    }
    const monitor=monitorMarker('node',n.id,19,13);if(monitor)group.append(monitor);
    scene.append(group);
  }
  if(!network.nodes.length){
    const text=svgElement('text',{x:width/2,y:height/2,'text-anchor':'middle',fill:'#60717d','font-size':15});
    text.append(svgElement('tspan',{x:width/2,dy:-10},'Choose Edit network,'),
      svgElement('tspan',{x:width/2,dy:22},'then add assets and manholes.'));
    scene.append(text);
  }
  return scene;
}
function declutterLabels(svg){
  if(!prefs().showLabels||prefs().detail==='full'||!svg.getClientRects().length)return;
  const viewport=svg.getBoundingClientRect();
  const manualNodes=new Set(network.nodes.filter(n=>n.nameOffset||n.labelOffset).map(n=>n.id));
  const manualEdges=new Set(network.edges.filter(e=>e.labelOffset).map(e=>e.id));
  const labels=[];
  for(const label of svg.querySelectorAll('[data-ns-label], [data-ns-edge-label]')){
    const group=label.parentElement;
    const id=group.dataset.nsNode||group.dataset.nsEdge;
    const priority=id===selected||multi.has(id)||manualNodes.has(id)||manualEdges.has(id)?2:group.dataset.nsNode?1:0;
    labels.push({label,box:label.getBoundingClientRect(),priority});
  }
  labels.sort((a,b)=>b.priority-a.priority);
  const occupied=new Map(),padding=3,bucketSize=128;
  function buckets(box){
    const keys=[];
    for(let y=Math.floor((Math.max(box.top,viewport.top)-padding)/bucketSize);y<=Math.floor((Math.min(box.bottom,viewport.bottom)+padding)/bucketSize);y++)
      for(let x=Math.floor((Math.max(box.left,viewport.left)-padding)/bucketSize);x<=Math.floor((Math.min(box.right,viewport.right)+padding)/bucketSize);x++)keys.push(x+':'+y);
    return keys;
  }
  const overlaps=(a,b)=>a.left<b.right+padding&&a.right>b.left-padding&&a.top<b.bottom+padding&&a.bottom>b.top-padding;
  const obstacles=Array.from(svg.querySelectorAll('[data-ns-symbol], [data-ns-monitor], [data-ns-structure], [data-ns-verification], [data-ns-survey], [data-ns-detriment]'),el=>el.getBoundingClientRect());
  for(const box of obstacles){
    if(!box.width||!overlaps(box,viewport))continue;
    for(const key of buckets(box)){
      if(!occupied.has(key))occupied.set(key,[]);
      occupied.get(key).push(box);
    }
  }
  for(const {label,box,priority} of labels){
    if(!box.width||!overlaps(box,viewport))continue;
    const keys=buckets(box);
    if(priority<2&&(box.left<viewport.left||box.right>viewport.right||
       keys.some(key=>occupied.get(key)?.some(other=>overlaps(box,other))))){
      label.setAttribute('data-ns-label-suppressed','');
      continue;
    }
    for(const key of keys){
      if(!occupied.has(key))occupied.set(key,[]);
      occupied.get(key).push(box);
    }
  }
}
let branchIsolated=false,traceOwner=null,minimapBounds=null,minimapPointer=null,lastInspectClick=null;
const touchPointers=new Map();
let touchTap=null;
function objectAt(target){
  const point=target.closest('[data-ns-node]'),wire=target.closest('[data-ns-edge]');
  if(point)return {id:point.dataset.nsNode,kind:'node'};
  if(wire)return {id:wire.dataset.nsEdge,kind:'edge'};
  return null;
}
function inspectObject(object){
  const reach=inOverview()&&object.kind==='edge'&&overviewGraph().edgeToReach.get(object.id);
  if(reach?.sourceEdges?.length>1){showReach(reach);return;}
  if(object.kind==='edge')selectConnector(object.id);else selectPoint(object.id);
}
function focusSelected(){
  const graph=sceneGraph();
  const n=graph.nodes.find(n=>selectionKind==='node'&&n.id===selected);
  const e=inOverview()?(selectionKind==='node'?graph.nodeToReach:graph.edgeToReach).get(selected):edge();
  if(!n&&!e)return;
  const points=n?[n]:[graph.nodes.find(item=>item.id===e.from),...(e.bends||[]),graph.nodes.find(item=>item.id===e.to)].filter(Boolean);
  if(!points.length)return;
  const {width,height}=dimensions(),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const x=(Math.max(...xs)+Math.min(...xs))/2,y=(Math.max(...ys)+Math.min(...ys))/2;
  const spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys);
  const z=n?Math.max(.7,network.camera.zoom):Math.max(network.contextFormat ? .002 : .2,Math.min(1.5,(width-110)/Math.max(1,spanX),(height-110)/Math.max(1,spanY)));
  network.camera={x:width/2-x*z,y:height/2-y*z,zoom:z};changed(true);
  status('Selected object centred.');
}
function resetView(){
  highlight=null;branchIsolated=false;
  network.preferences={...prefs(),type:'all',health:'all',result:'all',detail:'auto'};
  render();fit();status('Full network view restored.');
}
function traceSelection(direction){
  const e=edge(),start=node()?.id||(direction==='up'?e?.from:e?.to);
  if(!start){status('Select an asset or link to trace.');return;}
  network.preferences={...prefs(),type:'all',health:'all',result:'all'};
  highlight=R.trace(network.nodes,network.edges.filter(link=>link.direction!=='unknown'),start,direction);
  traceOwner=selectionKind+':'+selected;
  if(e){highlight.ids.add(e.from);highlight.ids.add(e.to);highlight.wires.add(e.id);}
  persist();renderCanvas();renderReview();
  status((direction==='up'?'Upstream':'Downstream')+' trace · '+highlight.ids.size+' points and '+highlight.wires.size+' links.');
}
function toggleIsolation(){
  if(!highlight)return;
  branchIsolated=!branchIsolated;
  renderCanvas();renderReview();status(branchIsolated?'Showing only the traced branch.':'Showing the full filtered network.');
}
function renderMinimap(){
  const map=$('nsMinimap');if(!map)return;
  const graph=sceneGraph(),empty=!graph.nodes.length;
  map.toggleAttribute('hidden',empty);
  if(empty){minimapBounds=null;map.replaceChildren();return;}
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const point of [...graph.nodes,...graph.edges.flatMap(e=>e.bends||[])]){
    left=Math.min(left,point.x);right=Math.max(right,point.x);
    top=Math.min(top,point.y);bottom=Math.max(bottom,point.y);
  }
  const scale=Math.min(140/Math.max(1,right-left),80/Math.max(1,bottom-top));
  minimapBounds={scale,x:80-(left+right)/2*scale,y:50-(top+bottom)/2*scale};
  const byId=new Map(graph.nodes.map(n=>[n.id,n]));
  const vertex=point=>[Math.round((point.x*scale+minimapBounds.x)*100)/100,Math.round((point.y*scale+minimapBounds.y)*100)/100];
  const lines=graph.edges.map(e=>[byId.get(e.from),...(e.bends||[]),byId.get(e.to)].filter(Boolean).map(vertex).join('L')).join('M');
  const dots=graph.nodes.map(n=>{const [x,y]=vertex(n);return 'M'+x+' '+y+'h.1';}).join('');
  map.replaceChildren(svgElement('rect',{width:160,height:100,rx:4,fill:'#fff'}),
    svgElement('path',{d:lines?'M'+lines:'',fill:'none',stroke:'#9ca8b6','stroke-width':.7}),
    svgElement('path',{d:dots,fill:'none',stroke:'#345788','stroke-width':largeScene(graph) ? .8 : 2.7,'stroke-linecap':'round'}),
    svgElement('rect',{'data-ns-minimap-viewport':'',fill:'#4f3da51a',stroke:'#4f3da5','stroke-width':1}));
  updateMinimapViewport();
}
function updateMinimapViewport(){
  const box=$('nsMinimap')?.querySelector('[data-ns-minimap-viewport]');
  if(!box||!minimapBounds)return;
  const {width,height}=dimensions(),{scale,x,y}=minimapBounds,topLeft=world(0,0);
  box.setAttribute('x',topLeft.x*scale+x);box.setAttribute('y',topLeft.y*scale+y);
  box.setAttribute('width',width/network.camera.zoom*scale);box.setAttribute('height',height/network.camera.zoom*scale);
}
function panFromMinimap(event){
  if(!minimapBounds)return;
  const rect=$('nsMinimap').getBoundingClientRect(),{width,height}=dimensions();
  const x=((event.clientX-rect.left)*160/rect.width-minimapBounds.x)/minimapBounds.scale;
  const y=((event.clientY-rect.top)*100/rect.height-minimapBounds.y)/minimapBounds.scale;
  network.camera.x=width/2-x*network.camera.zoom;network.camera.y=height/2-y*network.camera.zoom;
  renderGeometry();
}
function closeContext(focus=false){
  const menu=$('nsContextActions');
  if(!menu||menu.hidden)return;
  menu.hidden=true;
  if(focus)$('nsCanvas').focus({preventScroll:true});
}
function showContext(event){
  const object=objectAt(event.target);
  if(!object||editing)return;
  event.preventDefault();
  inspectObject(object);
  const canvas=$('nsCanvas'),rect=canvas.getBoundingClientRect(),menu=$('nsContextActions');
  menu.hidden=false;
  menu.style.left=Math.max(4,Math.min(event.clientX-rect.left,rect.width-menu.offsetWidth-4))+'px';
  menu.style.top=Math.max(4,Math.min(event.clientY-rect.top,rect.height-menu.offsetHeight-4))+'px';
  menu.querySelector('button').focus({preventScroll:true});
}
function startTouch(event){
  if(editing||event.pointerType!=='touch')return false;
  touchPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  touchTap=touchPointers.size===1?objectAt(event.target):null;
  $('nsCanvas').setPointerCapture(event.pointerId);event.preventDefault();hideHover();
  return true;
}
function moveTouch(event){
  const previous=touchPointers.get(event.pointerId);
  if(!previous)return false;
  const next={x:event.clientX,y:event.clientY};
  touchPointers.set(event.pointerId,next);
  const dx=next.x-previous.x,dy=next.y-previous.y;
  if(dx||dy)touchTap=null;
  const other=[...touchPointers].find(([id])=>id!==event.pointerId)?.[1];
  if(!other){network.camera.x+=dx;network.camera.y+=dy;}
  else{
    const rect=$('nsCanvas').getBoundingClientRect();
    const before={x:(previous.x+other.x)/2-rect.left,y:(previous.y+other.y)/2-rect.top};
    const after={x:before.x+dx/2,y:before.y+dy/2};
    const focus=world(before.x,before.y),distance=Math.hypot(previous.x-other.x,previous.y-other.y);
    const ratio=distance>1?Math.hypot(next.x-other.x,next.y-other.y)/distance:1;
    const z=C.cameraZoom(network.camera.zoom*ratio,network.contextFormat);
    network.camera={x:after.x-focus.x*z,y:after.y-focus.y*z,zoom:z};
  }
  if(frame===null)frame=requestAnimationFrame(()=>{frame=null;renderGeometry();});
  return true;
}
function endTouch(event){
  if(!touchPointers.delete(event.pointerId))return false;
  if(touchPointers.size)return true;
  if(frame!==null){cancelAnimationFrame(frame);frame=null;}
  const picked=touchTap;touchTap=null;
  if(picked&&event.type==='pointerup')inspectObject(picked);
  persist();renderCanvas();
  return true;
}
function renderCanvas(){
  const svg=$('nsSvg');if(!svg)return;
  const active=document.activeElement;
  const focused=svg.contains(active)&&active.closest('[data-ns-node],[data-ns-edge]');
  const d=dimensions();svg.setAttribute('viewBox','0 0 '+d.width+' '+d.height);paintedCamera={...network.camera};
  svg.toggleAttribute('data-ns-labels-hidden',!prefs().showLabels);
  svg.replaceChildren(renderScene());
  svg.dataset.nsMarkerScale=sceneMarkerScale();
  declutterLabels(svg);
  const selectedGroup=selectionKind==='node'&&[...svg.children].find(group=>group.dataset.nsNode===selected&&selected!==null);
  if(selectedGroup)svg.append(selectedGroup);
  if(focused){
    const key=focused.hasAttribute('data-ns-node')?'nsNode':'nsEdge';
    const replacement=[...svg.children].find(group=>group.dataset[key]===focused.dataset[key]);
    replacement?.focus({preventScroll:true});
  }
  $('nsZoom').textContent=Number((network.camera.zoom*100).toFixed(1))+'%';$('nsUndo').disabled=!history.length||busy;
  $('nsClearMap').disabled=!canClearMap();
  renderPopup();renderReviewControls();
  applyDecorations();simulationView?.decorate(true);renderMinimap();
  $('nsFocusSelected').disabled=!node()&&!edge();
  $('nsIsolateBranch').disabled=!highlight;
  $('nsIsolateBranch').setAttribute('aria-pressed',String(branchIsolated));
}
function renderGeometry(){
  const svg=$('nsSvg');
  if(paintedCamera&&(drag?.kind==='pan'||touchPointers.size||minimapPointer!==null)){
    const {width,height}=dimensions(),camera=network.camera,ratio=paintedCamera.zoom/camera.zoom;
    const left=paintedCamera.x-camera.x*ratio,top=paintedCamera.y-camera.y*ratio;
    svg.setAttribute('viewBox',[left,top,width*ratio,height*ratio].join(' '));
    updateMinimapViewport();return;
  }
  const graph=sceneGraph(),scale=sceneMarkerScale(graph),scaleChanged=Number(svg.dataset.nsMarkerScale)!==scale;
  const edges=new Map(graph.edges.map(e=>[e.id,e])),nodes=new Map(graph.nodes.map(n=>[n.id,n])),routes=C.connectionRoutes(graph.nodes,graph.edges,n=>point(n.x,n.y),scale);
  for(const g of svg.querySelectorAll('[data-ns-node]')){
    const n=nodes.get(g.dataset.nsNode),p=point(n.x,n.y);
    g.setAttribute('transform',translate(p.x,p.y));
    if(scaleChanged){
      for(const marker of g.querySelectorAll('[data-ns-frame],[data-ns-symbol],[data-ns-selection]'))marker.setAttribute('transform','scale('+scale+')');
      const leader=g.querySelector('[data-ns-node-leader]');if(leader)renderNodeLeader(leader,n,scale);
    }
  }
  svg.dataset.nsMarkerScale=scale;
  for(const g of $('nsSvg').querySelectorAll('[data-ns-edge]')){const route=routes.get(g.dataset.nsEdge);if(!route){g.style.visibility='hidden';continue;}g.style.visibility='';for(const path of g.querySelectorAll(':scope > path'))path.setAttribute('d',route.path);g.querySelector('[data-ns-direction]')?.setAttribute('points',polygonPoints(route.arrow));if(g.dataset.nsFlowDirection)positionRecordedDirection(g);g.querySelector('[data-ns-monitor]')?.setAttribute('transform',translate(route.label.x+14,route.label.y-13));g.querySelector('[data-ns-structure]')?.setAttribute('transform',translate(route.label.x,route.label.y+12));const e=edges.get(g.dataset.nsEdge),offset=e.labelOffset||{x:0,y:0},label=g.querySelector('[data-ns-edge-label]');g.querySelector('[data-ns-detriment]')?.setAttribute('transform','translate('+(route.label.x-10)+' '+(route.label.y-5)+')');if(label){label.setAttribute('x',route.label.x+offset.x);label.setAttribute('y',route.label.y+offset.y);}for(const handle of g.querySelectorAll('[data-ns-bend]')){const p=route.points[Number(handle.dataset.nsBend)+1];handle.setAttribute('cx',p.x);handle.setAttribute('cy',p.y);}for(const handle of g.querySelectorAll('[data-ns-add-bend]')){const i=Number(handle.dataset.nsAddBend),a=route.points[i],b=route.points[i+1],x=(a.x+b.x)/2,y=(a.y+b.y)/2;handle.querySelector('circle').setAttribute('cx',x);handle.querySelector('circle').setAttribute('cy',y);handle.querySelector('path').setAttribute('d','M'+(x-3)+' '+y+'h6M'+x+' '+(y-3)+'v6');}}
  if(drag?.kind==='node'||drag?.kind==='bend')renderMinimap();else updateMinimapViewport();
}
function fit(){
  const graph=sceneGraph(),d=dimensions();if(!graph.nodes.length){network.camera={x:0,y:0,zoom:1};changed(true);return;}
  const geometry=[...graph.nodes,...graph.edges.flatMap(e=>e.bends||[])];
  const extents=points=>points.reduce(([left,right,top,bottom],p)=>[Math.min(left,p.x),Math.max(right,p.x),Math.min(top,p.y),Math.max(bottom,p.y)],[Infinity,-Infinity,Infinity,-Infinity]);
  const [left,right,top,bottom]=extents(geometry);
  const offsets=new Map([...$('nsSvg').querySelectorAll('[data-ns-node]')].map(el=>[el.dataset.nsNode,el.getBBox()]));
  const scene=z=>{
    const xs=[],ys=[];
    for(const n of graph.nodes){const box=offsets.get(n.id)||{x:-45,y:-45,width:90,height:90};xs.push(n.x*z+box.x,n.x*z+box.x+box.width);ys.push(n.y*z+box.y,n.y*z+box.y+box.height);}
    for(const p of graph.edges.flatMap(e=>e.bends||[])){xs.push(p.x*z);ys.push(p.y*z);}
    const [left,right]=xs.reduce(([min,max],x)=>[Math.min(min,x),Math.max(max,x)],[Infinity,-Infinity]);
    const [top,bottom]=ys.reduce(([min,max],y)=>[Math.min(min,y),Math.max(max,y)],[Infinity,-Infinity]);
    return {left,right,top,bottom};
  };
  const minZoom=network.contextFormat ? .002 : .2;
  let z=Math.max(minZoom,Math.min(2,(d.width-160)/Math.max(200,right-left),(d.height-150)/Math.max(180,bottom-top))),box;
  for(let i=0;i<8;i++){box=scene(z);const ratio=Math.min(1,(d.width-40)/Math.max(1,box.right-box.left),(d.height-70)/Math.max(1,box.bottom-box.top));if(ratio>.999||z===minZoom)break;z=Math.max(minZoom,z*ratio);}
  box=scene(z);network.camera={zoom:z,x:d.width/2-(box.left+box.right)/2,y:(d.height-30)/2-(box.top+box.bottom)/2};changed(true);
}
function zoom(factor,anchor){
  const d=dimensions(),p=anchor||{x:d.width/2,y:d.height/2},before=world(p.x,p.y),z=C.cameraZoom(network.camera.zoom*factor,network.contextFormat);
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
  if(e){drawer.innerHTML=common+detrimentAssociation(e)+(e.icm?'<button type="button" id="nsPipeTrial">Open in Hydraulic Calculations</button>':'')+fields('Topology direction',selectHtml('id="nsTopologyDirection"',[['nominal','Nominal from / to'],['unknown','Unconfirmed']],e.direction||'nominal'))+'<label class="ns-check"><input id="nsArrow" type="checkbox" '+(e.arrow!==false?'checked':'')+'> Show direction</label><p class="ns-note">Click + on the line to add a bend; drag the round handles to position it.</p><button id="nsAddBend" '+((e.bends||[]).length>=32?'disabled':'')+'>+ Add bend</button> <button id="nsStraighten" '+(!(e.bends||[]).length?'disabled':'')+'>Straighten</button>'+((e.bends||[]).length?'<div class="ns-bend-list">'+e.bends.map((p,i)=>'<button data-ns-remove-bend="'+i+'">Remove bend '+(i+1)+'</button>').join('')+'</div>':'')+reviewFields(e)+'<button data-ns-delete class="ns-danger">Delete connector</button>';
    const trial=$('nsPipeTrial');
    if(trial)trial.onclick=()=>{
      const inputs=C.conduitTrial(e);
      if(!inputs){status('Calculator handoff requires a circular, single-barrel, sediment-free conduit with uniform Colebrook–White roughness and valid geometry and gradient.');return;}
      window.__ICM_PRECISION_WORKBENCH__.openPipeTrial(inputs);
    };
    return;
  }
  drawer.innerHTML=common+monitorAssociations(n)+detrimentAssociation(n)+fields('Type',selectHtml('id="nsType"',Object.entries(C.types),n.type))+
    '<label class="ns-check"><input id="nsPinned" type="checkbox" '+(n.pinned?'checked':'')+'> Pin position</label><div class="ns-two">'+fields('Label X','<input id="nsLabelX" type="number" min="-10000" max="10000" value="'+html(C.labelOffset(n).x)+'">')+fields('Label Y','<input id="nsLabelY" type="number" min="-10000" max="10000" value="'+html(C.labelOffset(n).y)+'">')+'</div><button id="nsResetLabel">Reset label</button><small>Drag the name or combined summary on the canvas. A leader arrow keeps the label tied to this point.</small>'+
    (asset(n)?spillLinkControls(n):'')+
    reviewFields(n)+'<button data-ns-delete class="ns-danger">Delete point</button>';
}
function spillLinkControls(n){
  return '<section><h4>Observed</h4>'+fields('Shared threshold · blank rows inherit','<input id="nsObservedDefault" type="number" step="any" value="'+html(n.defaults?.observed??'')+'">')+bindingRows(n,'observed')+'<button data-ns-add-sources="observed">+ Add datasets</button></section>'+
      '<section><h4>Modelled scenarios</h4>'+fields('Scenario for new assignments','<input id="nsNewScenario" value="'+html(n.newScenario||'Baseline')+'" maxlength="100">')+fields('Shared model threshold · blank rows inherit','<input id="nsModelDefault" type="number" step="any" value="'+html(n.defaults?.model??'')+'">')+bindingRows(n,'model')+'<button data-ns-add-sources="model">+ Add datasets to scenario</button></section>'+
      '<details><summary>Assessment settings</summary>'+fields('Maximum valid gap (s)','<input id="nsGap" type="number" min="1" value="'+html(n.gap)+'">')+fields('Exclusions · start, end, reason (one per line)','<textarea id="nsExclusions" rows="3" placeholder="2024-05-01T00:00, 2024-05-02T00:00, logger fault">'+html((n.exclusions||[]).map(x=>[x.start,x.end,x.reason].join(', ')).join('\n'))+'</textarea>')+'<small>Local to this asset. Use model-clock ISO dates. Other workspaces are unaffected.</small></details>'+
      '<label class="ns-check"><input id="nsConfirmed" type="checkbox" '+(n.confirmed?'checked':'')+'> Matching clocks, units/datum and model/rainfall basis confirmed for this asset’s comparisons</label>'+
      '<p class="ns-note">Each source defaults to its main reporting year; override years per row. At least three calendar months of valid reporting data are required.</p>'+
      '<button id="nsCalculate" class="ns-primary" '+(busy?'disabled':'')+'>'+(busy?'Calculating…':'Apply & calculate')+'</button>';
}
function popupTable(n){
  if(!n.applied)return '<div data-ns-empty-table></div><small>Assign datasets and calculate.</small>';
  const fresh=isFresh(n),groups=R.annualGroups(n,prefs().scenarios);
  let table='<table><thead><tr><th>Year</th><th>Scenario</th><th>Observed<br>spills</th><th>Modelled<br>spills</th><th>Observed<br>hours</th><th>Modelled<br>hours</th></tr></thead><tbody>';
  const cell=(v,rag)=>'<td'+(rag?' class="ns-rag-'+rag+'"':'')+'>'+f(v,Number.isInteger(v)?0:2)+(rag?'<small class="ns-rag-label">'+html(rag[0].toUpperCase()+rag.slice(1))+' agreement</small>':'')+'</td>';
  for(const group of groups){
    const o=group.observed,m=group.model,reason=!fresh?'Recalculation required':m?C.comparable(o,m,n.confirmed):'No matching model evidence.',countRag=m&&!reason?C.rag(o?.spill_count,m.spill_count):null,durationRag=fresh&&m&&!C.comparable(o,m,n.confirmed,'duration_hours')?C.rag(o?.duration_hours,m.duration_hours):null;
    table+='<tr data-ns-evidence-year="'+group.year+'" title="'+html(reason)+'"><td>'+group.year+'</td><td>'+html(group.scenario)+([o,m].some(r=>r?.continuous_spill)?'<small class="ns-warning">Continuous spill — check threshold</small>':'')+'</td>'+cell(fresh?o?.spill_count:null)+cell(fresh?m?.spill_count:null,countRag)+cell(fresh?o?.duration_hours:null)+cell(fresh?m?.duration_hours:null,durationRag)+'</tr>';
  }
  table+='</tbody></table>'+(groups.length?'':'<p>No evidence for the selected year.</p>');
  const details=groups.map(g=>[g.observed,g.model].filter(Boolean).map(r=>'<p><strong>'+html(r.year+' · '+(r.role==='observed'?'Observed':r.scenario))+'</strong><br>'+html(r.analysis_start?r.analysis_start.slice(0,10)+' to '+r.analysis_end.slice(0,10):'No period')+(r.partial_year?' · partial year':'')+'<br>'+html(r.column)+' · '+(C.thresholdRule(r)==='gt'?'&gt;':'≥')+' '+f(r.threshold,6)+' '+html(r.unit||'')+'<br>Valid '+f(r.valid_hours,1)+' h · gaps '+f(r.unknown_hours,1)+' h · excluded '+f(r.excluded_hours,1)+' h'+(r.value_min!==undefined?'<br>Value range '+f(r.value_min,6)+' to '+f(r.value_max,6)+' '+html(r.unit||''):'')+(r.reason?'<br>'+html(r.reason):'')+(r.count_status&&r.count_status!=='definitive'?'<br>'+html(r.count_status):'')+(r.continuous_spill?'<br>All valid support is classified as spilling. Check channel, threshold, units and datum.':'')+'</p>').join('')+(g.model?'<p>'+html(fresh?C.comparable(g.observed,g.model,n.confirmed)||'Comparison eligible.':'Recalculation required.')+'</p>':'')).join('');
  return table+(fresh?'':'<p class="ns-note">Recalculation required: settings, method or source evidence changed.</p>')+'<details class="ns-evidence-details"><summary>Assessment details</summary>'+details+'</details><small>12/24 counts · duration in hours</small>';
}
function linkedMonitorEvidence(n){
  if(!n.monitorId)return '';
  const survey=surveyLayerView(),week=survey?.byMonitor.get(n.monitorId);
  const workbench=window.__ICM_WORKBENCH__;
  const verification=workbench?.readVerificationEvidence?.();
  const matches=verification?.asset.kind==='flow-monitor'&&verification.asset.id===n.monitorId;
  const reviews=matches?workbench.verificationReviews?.report(verification)||[]:[];
  const surveyStatus=week?.status==='current'?(week.rating||'Current evidence'):
    week?.status==='stale'?'Stale survey evidence':'No survey evidence';
  const verificationStatus=!matches?'No comparison':verification.freshness!=='current'?'Stale evidence':
    reviews.length?reviews.map(review=>review.decision).join(' · '):'Comparison available';
  return '<section class="ns-linked-evidence"><strong>Flow monitor '+html(n.monitorId)+'</strong>'+
    '<p>Flow Survey · '+html(surveyStatus)+(survey?.week?' · '+html(survey.week):'')+'</p>'+
    '<p>Verification · '+html(verificationStatus)+'</p>'+
    '<div class="ns-linked-actions"><button type="button" id="nsOpenFlowSurvey">Open Flow Survey week</button> '+
    '<button type="button" id="nsOpenVerification">Open Verification evidence</button></div></section>';
}
const inspectorTabs=[['properties','Properties'],['upload','Upload data'],['linking','Data linking'],['evidence','Evidence']];
const attributeGroups=['Identifiers and classification','Geometry and levels','Hydraulic and control settings','Other source attributes'];
function inspectorElement(tag,text,className){
  const element=document.createElement(tag);
  if(text!==undefined)element.textContent=text;
  if(className)element.className=className;
  return element;
}
function inspectorButton(text,id){
  const button=inspectorElement('button',text);button.type='button';if(id)button.id=id;
  return button;
}
function attributeGroup(field){
  const name=field.toLowerCase();
  if(/(?:^|_)(?:id|type|suffix|table|name|system)(?:_|$)/.test(name))return attributeGroups[0];
  if(/^(?:x|y|point_array)$|length|width|height|level|floor|invert|depth|diameter|gradient|position|geometry/.test(name))return attributeGroups[1];
  if(/roughness|throttle|shape|coefficient|capacity|control|setting|discharge|flow|barrel/.test(name))return attributeGroups[2];
  return attributeGroups[3];
}
const legacyAttributeUnits={groundLevelM:'m',chamberFloorM:'m',conduit_length:'m',conduit_width:'mm',conduit_height:'mm',
  us_invert:'m',ds_invert:'m',gradient:'m/m',bottom_roughness_cw:'mm',top_roughness_cw:'mm',sediment_depth:'mm'};
function inspectorProperties(panel,object){
  const source=object.sourceAttributes;
  panel.append(inspectorElement('h4','ICM source properties'));
  if(source)panel.append(inspectorElement('p',[source.file,source.table,'row '+source.row].filter(Boolean).join(' · '),'ns-source-provenance'));
  const imported=source?.fields||Object.entries(object.icm||{}).map(([name,value])=>({name,value,unit:legacyAttributeUnits[name]||''}));
  if(!imported.length)panel.append(inspectorElement('p','No ICM source properties are available for this object.'));
  for(const group of attributeGroups){
    const properties=imported.filter(item=>attributeGroup(item.name)===group);
    if(!properties.length)continue;
    const section=inspectorElement('details'),title=inspectorElement('summary',group),list=inspectorElement('dl',undefined,'ns-property-list');
    section.open=group===attributeGroups[0];
    for(const {name,label,unit,value} of properties){
      const key=inspectorElement('dt',label||name);
      if(label&&label!==name)key.title=name;
      const display=value===null||value===''?'—':String(value);
      list.append(key,inspectorElement('dd',display+(unit&&display!=='—'?' '+unit:'')));
    }
    section.append(title,list);panel.append(section);
  }
  panel.append(inspectorElement('h4','Custom properties'));
  panel.append(inspectorElement('p','Changes stay in Hydra Bench. The original ICM database is read-only here.','ns-note'));
  const custom=object.customProperties||[];
  const form=inspectorElement('form',undefined,'ns-custom-form'),inputs={};
  for(const [key,label,max] of [['name','Property name',128],['value','Value',4096],['unit','Unit (optional)',64]]){
    const field=inspectorElement('label',label,'ns-field');
    const input=inspectorElement('input');input.name=key;input.maxLength=max;input.required=key==='name';
    inputs[key]=input;field.append(input);form.append(field);
  }
  const list=inspectorElement('ul',undefined,'ns-custom-list'),error=inspectorElement('p');
  error.setAttribute('role','status');
  let editIndex=null;
  const save=inspectorButton('Add property');save.type='submit';
  const cancel=inspectorButton('Cancel edit');cancel.hidden=true;
  cancel.onclick=()=>{editIndex=null;form.reset();save.textContent='Add property';cancel.hidden=true;error.textContent='';};
  for(const [index,property] of custom.entries()){
    const row=inspectorElement('li'),title=inspectorElement('span',property.name+': '+property.value+(property.unit?' '+property.unit:''));
    const edit=inspectorButton('Edit'),remove=inspectorButton('Remove');
    edit.setAttribute('aria-label','Edit custom property '+property.name);
    remove.setAttribute('aria-label','Remove custom property '+property.name);
    edit.onclick=()=>{
      editIndex=index;for(const key of Object.keys(inputs))inputs[key].value=property[key];
      save.textContent='Save property';cancel.hidden=false;inputs.name.focus();
    };
    remove.onclick=()=>{if(busy)return;checkpoint();object.customProperties=custom.filter((_,i)=>i!==index);persist();renderPopup();status('Custom property removed.');};
    row.append(title,edit,remove);list.append(row);
  }
  form.append(save,cancel,error);
  form.onsubmit=event=>{
    event.preventDefault();
    if(busy)return;
    const property={name:inputs.name.value.trim(),value:inputs.value.value,unit:inputs.unit.value.trim()};
    if(!property.name){error.textContent='Enter a property name.';return;}
    if(custom.some((item,index)=>index!==editIndex&&item.name.toLowerCase()===property.name.toLowerCase())){
      error.textContent='A custom property with this name already exists.';return;
    }
    if(editIndex===null&&custom.length>=64){error.textContent='This object already has 64 custom properties.';return;}
    checkpoint();
    object.customProperties=editIndex===null?[...custom,property]:custom.map((item,index)=>index===editIndex?property:item);
    persist();renderPopup();status('Custom property saved in Hydra Bench.');
  };
  if(!custom.length)panel.append(inspectorElement('p','No custom properties yet.'));
  panel.append(list,form);
}
function readySeries(){
  return [...state.files.values()].filter(item=>item.status==='ready'&&item.hash&&!item.reportKind&&item.parsed?.columns?.length);
}
function inspectorUpload(panel){
  panel.append(inspectorElement('p','Add local time series or an assessment report to the shared source pool. Then use Data linking to connect evidence to this object.'));
  const button=inspectorButton('Upload local files','nsInspectorUpload');
  button.onclick=()=>$('fileInput').click();
  panel.append(button);
  const files=[...state.files.values()];
  if(!files.length){panel.append(inspectorElement('p','No local files are loaded.'));return;}
  const list=inspectorElement('ul',undefined,'ns-custom-list');
  for(const item of files)list.append(inspectorElement('li',item.displayName+' · '+item.status));
  panel.append(list);
}
function inspectorSeriesLinks(panel,object){
  panel.append(inspectorElement('h4','Time series references'));
  panel.append(inspectorElement('p','References identify the source and channel for this object. Use spill assignments separately to calculate annual evidence.'));
  const links=object.seriesLinks||[],files=readySeries();
  const list=inspectorElement('ul',undefined,'ns-custom-list');
  for(const [index,link] of links.entries()){
    const current=files.some(file=>file.hash===link.sha256&&file.parsed.columns.includes(link.column));
    const row=inspectorElement('li'),remove=inspectorButton('Remove reference');
    row.append(inspectorElement('span',link.sourceName+' · '+link.column+(current?' · Source ready':' · Reload matching file')),remove);
    remove.onclick=()=>{if(busy)return;checkpoint();object.seriesLinks=links.filter((_,i)=>i!==index);persist();renderPopup();};
    list.append(row);
  }
  panel.append(list);
  if(!files.length){panel.append(inspectorElement('p','Upload a supported time series to add a reference.'));return;}
  const source=inspectorElement('select'),channel=inspectorElement('select');
  source.setAttribute('aria-label','Reference source');channel.setAttribute('aria-label','Reference channel');
  source.add(new Option('Select a source',''));
  for(const file of files)source.add(new Option(file.displayName,file.id));
  const button=inspectorButton('Link time series','nsLinkSeries');button.disabled=true;
  source.onchange=()=>{
    channel.replaceChildren();const file=state.files.get(source.value);
    for(const column of file?.parsed?.columns||[])channel.add(new Option(column,column));
    button.disabled=!channel.options.length;
  };
  button.onclick=()=>{
    const file=state.files.get(source.value),column=channel.value;
    if(busy||file?.status!=='ready'||!file.hash||!file.parsed?.columns?.includes(column))return;
    if(links.some(link=>link.sha256===file.hash&&link.column===column)){status('That time series is already linked.');return;}
    if(links.length>=100){status('This object already has 100 time series references.');return;}
    checkpoint();object.seriesLinks=[...links,{sourceId:file.id,sourceName:file.displayName,sha256:file.hash,column}];
    persist();renderPopup();status('Time series reference linked.');
  };
  panel.append(source,channel,button);
}
function inspectorDetriment(panel,object){
  if(!object.detrimentLinks)return;
  for(const [kind,label] of detrimentKinds){
    const link=object.detrimentLinks[kind];if(!link)continue;
    const view=detrimentView(kind),row=link.signature===view?.signature?view.rows.get(link.id):null;
    const section=inspectorElement('section',undefined,'ns-linked-evidence');
    section.append(inspectorElement('strong',label+' · '+link.id));
    section.append(inspectorElement('p',row?view.caption+' · '+row.status:'Stale or unavailable comparison'));
    if(row){
      if(row.delta!=null)section.append(inspectorElement('p','Change: '+f(row.delta,6)+' '+row.unit));
      if(row.duration_delta_hours!=null)section.append(inspectorElement('p','Duration change: '+f(row.duration_delta_hours,6)+' h'));
      if(row.freeboard_b!=null)section.append(inspectorElement('p','Proposed freeboard: '+f(row.freeboard_b,6)+' m'));
      const open=inspectorButton('Open '+label+' evidence');
      open.onclick=()=>{
        const current=detrimentView(kind);
        if(current?.signature===link.signature&&current.rows.has(link.id))window.ICMDetriment.openSchematicEvidence(kind,link.id);
        else status('Detriment evidence has changed. Reconfirm the association.');
      };
      section.append(open);
    }
    panel.append(section);
  }
}
function openInspectorTab(id){
  const previous=$('nsPopup').querySelector('.ns-tab-indicator')?.getBoundingClientRect();
  inspectorTab=id;renderPopup(previous);
  $('nsInspectorTab-'+id)?.focus({preventScroll:true});
}
function renderPopup(previous){
  const pop=$('nsPopup'),n=node(),object=n||edge();if(!pop)return;
  pop.hidden=editing||!popupVisible||!object;
  $('nsLayout').classList.toggle('ns-inspecting',!pop.hidden);
  if(pop.hidden){pop.replaceChildren();return;}
  const oldScroll=pop.querySelector('.ns-popup-body')?.scrollTop||0;
  const openDetails=new Set([...pop.querySelectorAll('details[open] > summary')].map(summary=>summary.textContent));
  const header=inspectorElement('div',undefined,'ns-popup-head');
  const heading=inspectorElement('div');
  heading.append(inspectorElement('h3',object.name||(n?'Asset':'Connector')),inspectorElement('small',n?C.types[n.type]:object.icm?.table?.replace(/^hw_/,'').replaceAll('_',' ')||'Connector'));
  const close=inspectorButton('×');close.dataset.nsClosePopup='';close.setAttribute('aria-label','Close asset evidence');
  header.append(heading,close);
  const tabs=inspectorElement('div',undefined,'ns-inspector-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Asset inspector');
  const panel=inspectorElement('div',undefined,'ns-popup-body');
  panel.id='nsInspectorPanel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','nsInspectorTab-'+inspectorTab);
  for(const [id,label] of inspectorTabs){
    const tab=inspectorButton(label,'nsInspectorTab-'+id);tab.setAttribute('role','tab');
    tab.setAttribute('aria-selected',String(id===inspectorTab));tab.setAttribute('aria-controls',panel.id);
    tab.tabIndex=id===inspectorTab?0:-1;tab.onclick=()=>openInspectorTab(id);tabs.append(tab);
  }
  tabs.onkeydown=event=>{
    const current=inspectorTabs.findIndex(([id])=>id===inspectorTab);
    const next={ArrowLeft:(current+3)%4,ArrowRight:(current+1)%4,Home:0,End:3}[event.key];
    if(next===undefined)return;event.preventDefault();openInspectorTab(inspectorTabs[next][0]);
  };
  const footer=inspectorElement('div',undefined,'ns-popup-footer');
  if(inspectorTab==='properties'){
    inspectorProperties(panel,object);
    const locations=monitorGroups().get(R.refKey({kind:n?'node':'edge',id:object.id}));
    if(locations?.length)panel.prepend(inspectorElement('p','Installed monitors · '+locations.join(', '),'ns-note'));
  }
  if(inspectorTab==='upload')inspectorUpload(panel);
  if(inspectorTab==='linking'){
    inspectorSeriesLinks(panel,object);
    if(object.contextSource){
      const label=inspectorElement('label','Detriment association theme','ns-field'),type=inspectorElement('select');
      for(const [kind,text] of detrimentKinds)type.add(new Option(text,kind));
      type.value=detrimentKind();
      type.onchange=()=>{
        network.preferences={...prefs(),detrimentKind:type.value};changed(true);
      };
      label.append(type);panel.append(label);
    }
    panel.insertAdjacentHTML('beforeend',monitorAssociations(object)+detrimentAssociation(object)+(asset(n)?spillLinkControls(n):''));
  }
  if(inspectorTab==='evidence'){
    panel.innerHTML=linkedMonitorEvidence(object)+(n?popupTable(n):'<p>Connect compatible evidence in Data linking. Annual spill calculations are available on eligible nodes.</p>')+reviewFields(object);
    if(n)panel.querySelector('[data-ns-empty-table]')?.replaceWith(annualTable(n));
    inspectorDetriment(panel,object);
    if(asset(n)){
      for(const [mode,label] of [['series','Time series'],['spills','Spill analysis']]){
        const button=inspectorButton(label);button.dataset.nsOpenAnalysis=mode;footer.append(button);
      }
    }
  }
  const reference={id:object.id,kind:n?'node':'edge'};
  const pinned=(network.overviewPins||[]).some(pin=>R.refKey(pin)===R.refKey(reference));
  const pin=inspectorButton(pinned?'Unpin from overview':'Pin in overview');
  pin.setAttribute('aria-pressed',String(pinned));
  pin.onclick=()=>{
    checkpoint();
    const pins=(network.overviewPins||[]).filter(item=>R.refKey(item)!==R.refKey(reference));
    network.overviewPins=pinned?pins:[...pins,reference];changed(true);
    $('nsPopup').querySelector('[aria-pressed]')?.focus({preventScroll:true});
  };
  if(object.type!=='label')footer.append(pin);
  if(network.contextFormat==='icm-csv-v1'&&(n?object.sourceAttributes?.table==='hw_node':object.icm?.table&&object.sourceAttributes?.table===object.icm.table)){
    const formula=inspectorButton('Review Formula A catchments');
    formula.onclick=()=>{
      state.formulaAssessmentAsset={...reference};
      window.__ICM_PRECISION_WORKBENCH__.navigate('hydraulics','formula-a',true);
    };
    footer.append(formula);
  }
  const edit=inspectorButton('Edit asset');edit.dataset.nsEditSelected='';footer.append(edit);
  pop.replaceChildren(header,tabs,panel,footer);
  window.HydraDesign?.moveSelection(tabs,tabs.querySelector('[aria-selected="true"]'),'ns-tab-indicator',previous);
  for(const detail of panel.querySelectorAll('details'))if(openDetails.has(detail.querySelector('summary')?.textContent))detail.open=true;
  panel.scrollTop=oldScroll;
}
function render(){
  if(!mounted)return;
  $('nsModeLabel').textContent=editing?'Edit mode':'Explore mode';
  $('nsEdit').textContent=editing?'Done editing':'Edit network';$('nsEdit').setAttribute('aria-pressed',String(editing));
  $('nsEditTools').hidden=!editing;$('nsLayout').classList.toggle('ns-editing',editing);
  $('nsPan').setAttribute('aria-pressed',String(tool==='pan'));$('nsConnect').setAttribute('aria-pressed',String(tool==='connect'));
  $('nsZoomMode').setAttribute('aria-pressed',String(tool==='zoom'));
  $('nsCanvas').dataset.tool=tool;
  geometryView?.refresh();
  $('nsColourChoices').innerHTML=colours(colour,'data-ns-colour');renderFilters();renderDrawer();renderCanvas();renderReview();
}
function add(type){
  if(busy||prefs().locked)return;checkpoint();const d=dimensions(),p=world(d.width*.35+network.nodes.length%4*30,d.height*.4+network.nodes.length%4*35);
  if(network.nodes.length>=2000){status('Maximum 2,000 points.');return;}const n={id:uid(),name:C.types[type]+' '+(network.nodes.filter(n=>n.type===type).length+1),type,colour,x:p.x,y:p.y,labelOffset:{x:30,y:-20},bindings:[],defaults:{observed:'',model:''},newScenario:'Baseline',gap:900,exclusions:[],confirmed:false,applied:null};
  network.nodes.push(n);selected=n.id;selectionKind='node';popupVisible=false;editing=true;changed();render();$('nsName')?.focus();
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
  if(selected!==id||selectionKind!=='node')inspectorTab='evidence';
  selected=id;selectionKind='node';if(!multi.has(id))multi=new Set([id]);popupVisible=!editing;hideHover();renderDrawer();renderCanvas();renderReview();
}
function selectConnector(id){
  if(selected!==id||selectionKind!=='edge')inspectorTab='properties';
  selected=id;selectionKind='edge';multi.clear();popupVisible=!editing;hideHover();renderDrawer();renderCanvas();renderReview();
}
function showSourcePicker(role){
  const n=node();if(!n||busy)return;
  const files=[...state.files.values()].filter(x=>x.status==='ready'&&!x.reportKind&&x.parsed?.columns?.length&&x.parsed?.start&&x.parsed?.end);
  pickerReturnFocus=document.activeElement;
  const picker=$('nsPicker');picker.hidden=false;picker.dataset.role=role;
  picker.innerHTML='<div class="ns-popup-head"><h3>Add '+(role==='observed'?'observed datasets':'datasets to '+html(n.newScenario||'Baseline'))+'</h3><button data-ns-close-picker aria-label="Close source picker">×</button></div><input id="nsSourceSearch" type="search" placeholder="Search imported datasets" aria-label="Search imported datasets"><div class="ns-file-list">'+files.map(x=>'<label data-ns-file-name="'+html(x.displayName.toLowerCase())+'"><input type="checkbox" value="'+html(x.id)+'"><span>'+html(x.displayName)+'<small>'+html(x.parsed.start.slice(0,10)+' to '+x.parsed.end.slice(0,10))+'</small></span></label>').join('')+'</div>'+(files.length?'':'<p>Import time-series files in Data / Time Series first. Sources appear after authoritative parsing completes.</p>')+'<button id="nsAddSelected" class="ns-primary">Add selected files</button>';
  $('nsSourceSearch')?.focus();
}
function closeSourcePicker(){
  const role=$('nsPicker').dataset.role;$('nsPicker').hidden=true;
  const target=pickerReturnFocus?.isConnected?pickerReturnFocus:root().querySelector('[data-ns-add-sources="'+CSS.escape(role||'')+'"]')||$('nsCanvas');
  target?.focus({preventScroll:true});pickerReturnFocus=null;
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
  changed();renderDrawer();closeSourcePicker();status('Files assigned together. Review channels, reporting years, units and thresholds, then Apply & calculate.');
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
  if(target.id==='nsTopologyDirection'){
    const link=edge();if(!link||prefs().locked||busy)return;
    checkpoint();link.direction=target.value;highlight=null;branchIsolated=false;changed();return;
  }
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
      if(analysisContext?.id===n.id){renderAnalysisSettings(n);$('nsAnalysisCounts').replaceChildren(annualTable(n,true));$('nsAnalysisAudit').replaceChildren(auditDetails(n));$('nsCommonResult').hidden=true;if(analysisContext.mode==='series')void plotAnalysis(++analysisGeneration);}
    }catch(error){status(error.message);target.setAttribute('aria-invalid','true');}return;
  }
  const object=n||e;
  try{
    checkpoint();
    if(target.id==='nsName'){
      object.name=target.value.trim()||C.types[n?.type]||'Connector';
      $('nsDrawer').querySelector('.ns-drawer-head h3').textContent=object.name;
    }
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
  if(busy||prefs().locked||!selected)return;
  checkpoint();
  const ids=selectionKind==='node'?new Set([...multi,selected]):new Set();
  network.nodes=network.nodes.filter(n=>!ids.has(n.id));
  network.edges=network.edges.filter(e=>(selectionKind!=='edge'||e.id!==selected)&&!ids.has(e.from)&&!ids.has(e.to));
  multi.clear();selected=null;popupVisible=false;changed();renderDrawer();
}
function canClearMap(){
  return !busy&&!drag&&!prefs().locked&&Boolean(
    network.nodes.length||network.edges.length||network.views.length||network.reviewSnapshots.length||network.contextFormat
  );
}
function clearMap(){
  checkpoint();
  network=C.empty();resetRouteDraft();detailedCamera=null;branchIsolated=false;
  selected=null;connectFrom=null;highlight=null;popupVisible=false;tool='select';
  multi.clear();freshness.clear();hideHover();
  $('nsPicker').hidden=true;
  $('nsAuditResult').textContent='';
  simulationView?.refreshSources();persist();render();
  $('nsCanvas').focus({preventScroll:true});
  status('Map cleared. Imported sources are still available. Undo is available in Edit network until you reload.');
}
function addBend(e,index,p){
  if(!e||busy||prefs().locked||(e.bends||[]).length>=32)return false;
  checkpoint();e.bends=e.bends||[];e.bends.splice(index,0,p);changed(true);renderDrawer();return true;
}
function onClick(event){
  const t=event.target;
  if(t.closest('[data-ns-close-picker]')){closeSourcePicker();return;}
  if(t.id==='nsAddSelected'){addSelected();return;}
  const sources=t.closest('[data-ns-add-sources]');if(sources){showSourcePicker(sources.dataset.nsAddSources);return;}
  const remove=t.closest('[data-ns-remove-binding]');if(remove){checkpoint();node().bindings=node().bindings.filter(b=>b.id!==remove.dataset.nsRemoveBinding);changed();renderDrawer();return;}
  if(t.closest('[data-ns-delete]')){removeSelected();return;}
  if(t.closest('[data-ns-close-selection]')){selected=null;renderDrawer();renderCanvas();return;}
  if(t.closest('[data-ns-close-popup]')){popupVisible=false;renderPopup();return;}
  if(t.closest('[data-ns-edit-selected]')){if(inOverview())changeOverview(false);editing=true;popupVisible=false;render();return;}
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
function captureDrag(event,details){
  drag={...details,pointerId:event.pointerId};
  const canvas=$('nsCanvas');
  canvas.setPointerCapture(event.pointerId);
  if(drag.kind==='pan')canvas.dataset.panning='';
  event.preventDefault();
}
function onPointerDown(event){
  if(drag||!event.target.closest('#nsSvg')||(event.button!==0&&event.button!==1))return;
  closeContext();
  if(startTouch(event))return;
  const pan={kind:'pan',x:event.clientX,y:event.clientY,camera:{...network.camera},moved:false};
  if(event.button===1||tool==='pan'||tool==='zoom'){
    hideHover();captureDrag(event,pan);return;
  }
  const canvas=$('nsCanvas'),rect=canvas.getBoundingClientRect(),id=event.target.closest('[data-ns-node]')?.dataset.nsNode,wire=event.target.closest('[data-ns-edge]')?.dataset.nsEdge;
  const object=objectAt(event.target);
  if(object&&!editing){
    const before=lastInspectClick;
    const double=before&&before.id===object.id&&before.kind===object.kind&&
      event.timeStamp-before.time<450&&Math.hypot(event.clientX-before.x,event.clientY-before.y)<6;
    lastInspectClick=double?null:{...object,time:event.timeStamp,x:event.clientX,y:event.clientY};
    inspectObject(object);if(double)focusSelected();return;
  }
  if(wire&&editing){
    selected=wire;selectionKind='edge';multi.clear();const e=edge(),edgeLabel=event.target.closest('[data-ns-edge-label]'),bend=event.target.closest('[data-ns-bend]'),add=event.target.closest('[data-ns-add-bend]');
    if(tool==='select'&&!busy&&!prefs().locked&&edgeLabel){checkpoint();const offset=e.labelOffset||{x:0,y:0};captureDrag(event,{kind:'edge-label',id:wire,x:event.clientX,y:event.clientY,startX:offset.x,startY:offset.y});}
    if(tool==='select'&&!busy&&!prefs().locked&&(bend||add)){
      const index=Number(bend?.dataset.nsBend??add.dataset.nsAddBend);
      if(add){if(!addBend(e,index,world(event.clientX-rect.left,event.clientY-rect.top)))return;}else checkpoint();
      const p=e.bends[index];captureDrag(event,{kind:'bend',id:wire,index,x:event.clientX,y:event.clientY,startX:p.x,startY:p.y,moved:false});
    }
    renderDrawer();renderCanvas();return;
  }
  const label=event.target.closest('[data-ns-label],[data-ns-summary]');
  if(id){if(event.shiftKey&&tool==='select'){if(multi.has(id))multi.delete(id);else multi.add(id);selected=id;selectionKind='node';popupVisible=false;renderCanvas();renderReview();return;}selectPoint(id);if(!editing||tool==='connect'||busy)return;}
  const n=id?network.nodes.find(n=>n.id===id):null;
  if(n&&editing&&tool==='select'&&!prefs().locked&&(!n.pinned||label)){checkpoint();const offset=C.labelOffset(n);captureDrag(event,{kind:label?'label':'node',id,x:event.clientX,y:event.clientY,startX:label?offset.x:n.x,startY:label?offset.y:n.y,moved:false,group:network.nodes.filter(x=>multi.has(x.id)&&!x.pinned).map(x=>({id:x.id,x:x.x,y:x.y}))});}
  else captureDrag(event,pan);
}
function onPointerMove(event){
  if(moveTouch(event))return;
  if(!drag||drag.pointerId!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.moved=drag.moved||Math.abs(dx)+Math.abs(dy)>3;
  if(drag.kind==='node'){for(const saved of drag.group||[]){const n=network.nodes.find(n=>n.id===saved.id),step=prefs().snap?20:0;n.x=saved.x+dx/network.camera.zoom;n.y=saved.y+dy/network.camera.zoom;if(step){n.x=Math.round(n.x/step)*step;n.y=Math.round(n.y/step)*step;}}}
  else if(drag.kind==='label'){const n=network.nodes.find(n=>n.id===drag.id);if(n)n.nameOffset={x:Math.max(-10000,Math.min(10000,drag.startX+dx)),y:Math.max(-10000,Math.min(10000,drag.startY+dy))};}
  else if(drag.kind==='edge-label'){const e=edge();if(e)e.labelOffset={x:Math.max(-10000,Math.min(10000,drag.startX+dx)),y:Math.max(-10000,Math.min(10000,drag.startY+dy))};}
  else if(drag.kind==='bend'){const e=network.edges.find(e=>e.id===drag.id);if(e?.bends[drag.index])e.bends[drag.index]={x:drag.startX+dx/network.camera.zoom,y:drag.startY+dy/network.camera.zoom};}
  else{network.camera.x=drag.camera.x+dx;network.camera.y=drag.camera.y+dy;}
  if(frame===null)frame=requestAnimationFrame(()=>{frame=null;if(drag?.kind==='label')renderCanvas();else renderGeometry();});
}
function onPointerUp(event){
  if(endTouch(event))return;
  if(!drag||drag.pointerId!==event.pointerId)return;
  if(frame!==null){cancelAnimationFrame(frame);frame=null;}
  const canvas=$('nsCanvas');
  drag=null;delete canvas.dataset.panning;renderCanvas();
  if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  persist();if(editing)renderDrawer();
}
function onWheel(event){
  if(tool!=='zoom'||event.ctrlKey||event.metaKey||!event.deltaY)return;
  event.preventDefault();
  if(drag)return;
  const canvas=$('nsCanvas'),rect=canvas.getBoundingClientRect();
  const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1);
  const factor=Math.exp(Math.max(-.5,Math.min(.5,-pixels*.0015)));
  hideHover();zoom(factor,{x:event.clientX-rect.left,y:event.clientY-rect.top});
}
function exportRows(){
  const headers=['asset_id','asset_name','type','year','role','scenario','spill_count','duration_hours','eligible','analysis_start','analysis_end','valid_hours','unknown_hours','excluded_hours','count_status','counting_basis','source_name','source_sha256','column','threshold','comparison','continuous_spill','value_min','value_max','unit','quantity','context_start','max_gap_seconds','exclusions','comparison_basis_confirmed','calculated_at','current'];
  const rows=network.nodes.flatMap(n=>(n.applied?.rows||[]).map(r=>({...r,asset_id:n.id,asset_name:n.name,type:n.type,max_gap_seconds:n.applied.settings?.gap??'',exclusions:JSON.stringify(r.exclusions||[]),comparison_basis_confirmed:n.applied.settings?.confirmed??'',calculated_at:n.applied.calculated_at,current:isFresh(n)})));
  const cell=ICMSafeCSV.cell;downloadBlob('hydra-network-spill-evidence.csv',[headers.join(','),...rows.map(r=>headers.map(k=>cell(r[k])).join(','))].join('\n'),'text/csv');
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
  const layout=$('nsLayout').getBoundingClientRect();
  const width=n?Math.ceil(layout.width):d.width,height=n?Math.ceil(layout.height):d.height;
  if(n)overlay=exportPopupSvg();
  const scene=svgElement('g');
  scene.append(renderScene(false));
  const text='<svg xmlns="'+NS+'" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><rect width="100%" height="100%" fill="white"/><g font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" fill="#182732">'+new XMLSerializer().serializeToString(scene)+overlay+'<text x="12" y="'+(d.height-12)+'" font-size="11" fill="#60717d">Hydra Bench · '+html(network.year==='all'?'All years':network.year)+' · '+html(network.evidenceMode==='combined'?'Observed + all models':network.scenario)+' · connections show topology only</text></g></svg>';
  await window.HydraDesign.prepareReportFont();
  const embedded=text.replace('<rect','<defs><style>'+window.HydraDesign.reportFontCss()+'</style></defs><rect');
  const blob=new Blob([embedded],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
  try{await document.fonts?.ready;const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawImage(image,0,0);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('Could not create screenshot.');const link=document.createElement('a'),pngUrl=URL.createObjectURL(png);link.href=pngUrl;link.download='hydra-network-schematic.png';link.click();setTimeout(()=>URL.revokeObjectURL(pngUrl),1000);status('Network PNG captured with the open evidence table.');}
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
function visibleNodes(nodes=network.nodes){
  const p=prefs();return nodes.filter(n=>(!branchIsolated||!highlight||highlight.ids.has(n.id))&&(p.type==='all'||n.type===p.type)&&(p.health==='all'||nodeHealth(n)===p.health)&&(p.result==='all'||(resultRag(n)||'neutral')===p.result));
}
function applyDecorations(){
  const byId=new Map(network.nodes.map(n=>[n.id,n]));
  const offset=Math.min(1,Number($('nsSvg').dataset.nsMarkerScale));
  for(const g of $('nsSvg').querySelectorAll('[data-ns-node]')){const n=byId.get(g.dataset.nsNode);g.style.opacity=highlight&&!highlight.ids.has(n.id)?'.2':'1';g.classList.toggle('ns-multi-selected',multi.has(n.id));if(asset(n)){const h=nodeHealth(n);if(h!=='ready'){const dot=svgElement('circle',{cx:-34*offset,cy:-24*offset,r:Math.max(2,4*offset),fill:h==='stale'?'#9a6500':h==='missing'?'#b93838':'#82939f'});dot.append(svgElement('title',{},healthLabel(h)));g.append(dot);}}}
  for(const g of $('nsSvg').querySelectorAll('[data-ns-edge]')){
    const members=inOverview()?overviewGraph().edgeToReach.get(g.dataset.nsEdge)?.sourceEdges:[g.dataset.nsEdge];
    g.style.opacity=highlight&&!members?.some(id=>highlight.wires.has(id))?'.15':'1';
  }
  const hidden=network.nodes.length-visibleNodes().length;if($('nsHiddenCount'))$('nsHiddenCount').textContent=hidden?hidden+' hidden':'';
}
function healthLabel(value){return {ready:'Ready',missing:'Reload source',stale:'Recalculate',short:'Short coverage',provisional:'Provisional count',unassigned:'No datasets',uncalculated:'Not calculated'}[value]||value;}
function centre(id){const n=network.nodes.find(n=>n.id===id);if(!n)return;const d=dimensions();network.camera.x=d.width*.3-n.x*network.camera.zoom;network.camera.y=d.height*.5-n.y*network.camera.zoom;selected=id;selectionKind='node';multi=new Set([id]);popupVisible=!editing;persist();render();renderReview();}
function hideHover(){clearTimeout(hoverTimer);if($('nsHover'))$('nsHover').hidden=true;}
function hoverCard(id){
  const n=network.nodes.find(n=>n.id===id);if(!n||!asset(n)||editing||drag||popupVisible)return;
  const hover=$('nsHover'),d=dimensions(),p=point(n.x,n.y);
  const wrapper=document.createElement('div');
  wrapper.className='ns-hover-table';
  wrapper.append(annualTable(n,false,prefs().scenarios,false));
  hover.replaceChildren(textElement('strong',n.name),wrapper,textElement('small','Click asset to inspect'));
  hover.hidden=false;const w=Math.min(460,d.width-24);hover.style.width=w+'px';hover.style.left=Math.max(12,Math.min(d.width-w-12,p.x+45))+'px';hover.style.top=Math.max(12,Math.min(d.height-hover.offsetHeight-70,p.y+15))+'px';
}
function textElement(tag,text){
  const element=document.createElement(tag);
  element.textContent=text;
  return element;
}
function annualTable(n,differences=false,scenarios=prefs().scenarios,interactive=true){
  const fresh=isFresh(n);
  const table=document.createElement('table');
  table.className='ns-annual-table';
  const heading=table.createTHead().insertRow();
  for(const column of ['Year','Scenario','O count','M count','O h','M h',...(differences?['Δ count','Δ h']:[])]){
    heading.append(textElement('th',column));
  }
  const body=table.createTBody();
  const signed=value=>value===null?'—':(value>0?'+':'')+f(value,1);
  for(const g of R.annualGroups(n,scenarios)){
    const reason=metric=>!fresh?'Recalculate':g.model?C.comparable(g.observed,g.model,n.confirmed,metric):'No model evidence';
    const countValid=!reason('spill_count'),durationValid=!reason('duration_hours');
    const o=fresh?g.observed:null,m=fresh?g.model:null;
    const row=body.insertRow();
    row.dataset.nsFocus=n.id;
    row.dataset.nsYear=g.year;
    row.title=reason('spill_count')||reason('duration_hours');
    const yearCell=row.insertCell();
    if(interactive){
      const button=textElement('button',g.year);
      button.type='button';
      button.className='ns-table-year';
      button.setAttribute('aria-label','Focus '+n.name+' in '+g.year);
      yearCell.append(button);
    }else{
      yearCell.textContent=g.year;
    }
    row.insertCell().textContent=g.scenario;
    const cell=(value,rag)=>{
      const td=row.insertCell();
      td.textContent=f(value,Number.isInteger(value)?0:1);
      if(rag){
        td.className='ns-rag-'+rag;
        const label=textElement('small',rag[0].toUpperCase()+rag.slice(1)+' agreement');
        label.className='ns-rag-label';
        td.append(label);
      }
    };
    cell(o?.spill_count);
    cell(m?.spill_count,countValid?C.rag(o.spill_count,m.spill_count):null);
    cell(o?.duration_hours);
    cell(m?.duration_hours,durationValid?C.rag(o.duration_hours,m.duration_hours):null);
    if(differences){
      row.insertCell().textContent=signed(countValid?R.delta(o.spill_count,m.spill_count):null);
      row.insertCell().textContent=signed(durationValid?R.delta(o.duration_hours,m.duration_hours):null);
    }
  }
  return table;
}
function renderReview(){
  if(!$('nsReviewTools'))return;
  const p=prefs(),names=[...new Set(network.nodes.flatMap(n=>n.bindings.filter(b=>b.role==='model').map(b=>b.scenario)))].sort();
  $('nsTypeFilter').value=p.type;$('nsHealthFilter').value=p.health;$('nsResultFilter').value=p.result;$('nsDetail').value=p.detail;$('nsSnap').checked=p.snap;$('nsLocked').checked=p.locked;$('nsVerificationLayer').checked=p.verification===true;
  $('nsFlowSurveyLayer').checked=p.flowSurvey===true;
  $('nsDetrimentLayer').checked=p.detriment===true;
  $('nsDetrimentKind').value=detrimentKind();
  $('nsDetrimentCaption').textContent=p.detriment?(detrimentView()?.caption||'Calculate a detriment comparison to show current evidence.'):'';
  const surveyWeek=$('nsFlowSurveyWeek');
  const surveyView=p.flowSurvey?surveyLayerView():null;
  surveyWeek.replaceChildren();
  for(const week of surveyView?.weeks||[])surveyWeek.add(new Option(week,week));
  surveyWeek.disabled=!surveyView?.weeks.length;
  surveyWeek.value=surveyView?.week||'';
  $('nsRedo').disabled=!redo.length||busy;
  $('nsScenarioChoices').innerHTML=names.map(name=>'<label><input type="checkbox" data-ns-scenario-choice="'+html(name)+'" '+(p.scenarios===null||p.scenarios.includes(name)?'checked':'')+'>'+html(name)+'</label>').join('')||'<small>No model scenarios assigned</small>';
  $('nsViewSelect').innerHTML='<option value="">Saved views</option>'+network.views.map((v,i)=>'<option value="'+i+'">'+html(v.name)+'</option>').join('');
  $('nsSnapshotSelect').innerHTML='<option value="">Review snapshots</option>'+network.reviewSnapshots.map((v,i)=>'<option value="'+i+'">'+html(v.name)+'</option>').join('');
  $('nsSelectionCount').textContent=multi.size>1?multi.size+' selected':'';
  renderHotspotControls();
  if(!$('nsMatrix').hidden)renderMatrix();
}
function renderHotspotControls(){
  const panel=$('nsHotspotLayer');
  if(!panel)return;
  panel.hidden=!hotspots;
  if(!hotspots)return;
  const evidence=hotspotAt(selectionKind,selected,true),matching=hotspots.matches;
  $('nsHotspotTitle').textContent=hotspots.ops.revision+' → '+hotspots.ops.proposal;
  $('nsHotspotSummary').textContent=matching.mapped.size+' matched · '+matching.unmatched.length+' unmatched · '+
    matching.ambiguous.length+' ambiguous · '+matching.unclassified.length+' unclassified';
  $('nsHotspotEvidence').disabled=!evidence;
  $('nsHotspotUp').disabled=!evidence;$('nsHotspotDown').disabled=!evidence;
}
function clearHotspots(){
  hotspots=null;
  if(traceOwner?.startsWith('hotspot:')){highlight=null;traceOwner=null;branchIsolated=false;}
  if($('nsHotspotNote'))$('nsHotspotNote').textContent='';
}
function showDetrimentHotspots(ops){
  if(!mounted||!network.nodes.some(node=>node.contextSource)){
    status('Import the reviewed source network before showing detriment hotspots.');return;
  }
  if(!ops.stillCurrent()){status('The detriment evidence changed. Review the proposal again.');return;}
  clearHotspots();
  const matches=R.mapDetrimentHotspots(network,ops.records);
  const metrics=new Map();
  for(const {row} of matches.mapped.values())for(const [key,metric] of Object.entries(row.metrics))metrics.set(key,metric.label);
  if(!metrics.size){renderCanvas();renderReview();status('No unique typed report asset matches this source network.');return;}
  const criterion=metrics.keys().next().value;
  hotspots={ops,matches,criterion,severity:'adverse'};
  const select=$('nsHotspotCriterion');select.replaceChildren(...[...metrics].map(([key,label])=>new Option(label,key)));
  select.value=criterion;$('nsHotspotSeverity').value='adverse';
  if(editing)$('nsEdit').click();
  if(inOverview())changeOverview(false);
  renderCanvas();renderReview();
  $('nsHotspotLayer').scrollIntoView({block:'nearest'});select.focus({preventScroll:true});
}
function traceHotspot(direction){
  const evidence=hotspotAt(selectionKind,selected,true);
  if(!evidence)return;
  const object=edge(),start=selectionKind==='node'?selected:(direction==='up'?object?.from:object?.to);
  if(!start||(selectionKind==='edge'&&object?.direction==='unknown')){
    $('nsHotspotNote').textContent='This link has unconfirmed direction. Select a mapped node to trace recorded connections.';return;
  }
  highlight=R.trace(network.nodes,network.edges.filter(item=>item.direction!=='unknown'),start,direction);
  traceOwner='hotspot:'+R.refKey(evidence.matched.ref);branchIsolated=false;
  if(selectionKind==='edge')highlight.wires.add(selected);
  const count=highlight.ids.size;
  $('nsHotspotNote').textContent=count+(count===1?' connected node':' connected nodes')+' along recorded '+(direction==='up'?'upstream':'downstream')+
    ' topology. This trace identifies connections for review.';
  renderCanvas();
}
function mountHotspots(){
  $('nsStatus').insertAdjacentHTML('beforebegin',`<section id="nsHotspotLayer" class="ns-review-section" aria-label="Detriment hotspots" hidden>
    <h3>Detriment hotspots</h3><p id="nsHotspotTitle"></p><p id="nsHotspotSummary"></p>
    <p>Hotspots mark reported criterion outcomes. Connections identify branches to investigate.</p>
    <div class="ns-tool-row"><label>Hotspot criterion <select id="nsHotspotCriterion" aria-label="Hotspot criterion"></select></label>
    <label>Hotspot severity <select id="nsHotspotSeverity" aria-label="Hotspot severity"><option value="adverse">Detriment and risk</option>
    <option value="detriment">Detriment only</option><option value="risk">Risk only</option><option value="all">All reported states</option></select></label>
    <button type="button" id="nsHotspotUp">Trace upstream of hotspot</button><button type="button" id="nsHotspotDown">Trace downstream of hotspot</button>
    <button type="button" id="nsHotspotEvidence">Open hotspot evidence</button><button type="button" id="nsHideHotspots">Hide hotspots</button></div>
    <p id="nsHotspotNote" role="status"></p></section>`);
  for(const [id,key] of [['nsHotspotCriterion','criterion'],['nsHotspotSeverity','severity']])$(id).onchange=()=>{
    if(hotspots){hotspots[key]=$(id).value;renderCanvas();renderHotspotControls();}
  };
  $('nsHotspotUp').onclick=()=>traceHotspot('up');$('nsHotspotDown').onclick=()=>traceHotspot('down');
  $('nsHotspotEvidence').onclick=()=>{
    const evidence=hotspotAt(selectionKind,selected,true);
    if(!evidence)return;
    if(!hotspots.ops.openEvidence(evidence.matched.row,evidence.metric.category)){
      clearHotspots();renderCanvas();renderReview();status('This detriment evidence is no longer current.');
    }
  };
  $('nsHideHotspots').onclick=()=>{clearHotspots();renderCanvas();renderReview();};
  const verify=()=>{
    if(hotspots&&!hotspots.ops.stillCurrent()){clearHotspots();renderCanvas();renderReview();status('Detriment inputs changed. Review the proposal again.');}
  };
  window.addEventListener('icm:route-changed',verify);window.addEventListener('icm:source-pool-changed',verify);
}
function renderMatrix(){
  const selectedOnly=$('nsMatrixSelected').checked,query=$('nsMatrixSearch').value.toLowerCase();
  const nodes=network.nodes.filter(n=>asset(n)&&(!selectedOnly||multi.has(n.id))&&n.name.toLowerCase().includes(query));
  const matrix=$('nsMatrixBody');
  matrix.replaceChildren();
  if(!nodes.length)matrix.append(textElement('p','No matching assets.'));
  for(const n of nodes){
    const section=document.createElement('section');
    const button=textElement('button',n.name);
    button.className='ns-asset-link';
    button.dataset.nsCentre=n.id;
    section.append(button,annualTable(n,true));
    matrix.append(section);
  }
}
function undoEdit(forward=false){
  if(busy)return;const source=forward?redo:history,dest=forward?history:redo;if(!source.length)return;dest.push(JSON.stringify(network));resetReviewCaches();resetRouteDraft();network=JSON.parse(source.pop());branchIsolated=false;selected=null;multi.clear();highlight=null;popupVisible=false;freshness.clear();persist();render();renderReview();
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
  if(index==='')return;
  const v=network.views[Number(index)];if(!v)return;checkpoint();for(const key of ['camera','year','scenario','evidenceMode','metric','preferences'])if(v[key]!==undefined)network[key]=JSON.parse(JSON.stringify(v[key]));const nodes=new Map(network.nodes.map(n=>[n.id,n])),edges=new Map(network.edges.map(e=>[e.id,e]));for(const p of v.positions){const n=nodes.get(p.id);if(n){n.x=p.x;n.y=p.y;n.nameOffset=p.nameOffset;}}for(const p of v.edges||[]){const e=edges.get(p.id);if(e){e.bends=p.bends||[];e.labelOffset=p.labelOffset;}}changed(true);render();
}
function saveReviewSnapshot(){
  const name=$('nsViewName').value.trim()||new Date().toLocaleString(),copy=snapshot();delete copy.reviewSnapshots;delete copy.views;
  checkpoint();network.reviewSnapshots.push({name:name.slice(0,100),saved_at:new Date().toISOString(),build:buildToken,method:'occupied 12/24; network method 2',network:copy});network.reviewSnapshots=network.reviewSnapshots.slice(-20);changed(true);status('Assessment snapshot saved.');
}
function downloadReviewSnapshot(index){if(index==='')return;const saved=network.reviewSnapshots[Number(index)];if(saved)downloadBlob('hydra-network-review-snapshot.json',JSON.stringify({...saved,network:C.validateNetwork(saved.network)},null,2),'application/json');}
function wholeSceneSvg(){
  const before={camera:network.camera,preferences:network.preferences,branchIsolated};
  const svg=svgElement('svg'),scene=svgElement('g',{'font-family':'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',fill:'#182732'});
  let bounds;
  try{
    network.camera={x:0,y:0,zoom:1};branchIsolated=false;
    network.preferences={...prefs(),detail:'full',type:'all',health:'all',result:'all'};
    scene.append(renderScene(false));
    svg.append(scene);
    svg.style.cssText='position:fixed;left:-100000px;top:0;width:1000px;height:1000px';
    document.body.append(svg);
    bounds=svg.getBBox();
  }finally{
    svg.remove();
    svg.removeAttribute('style');
    network.camera=before.camera;
    network.preferences=before.preferences;
    branchIsolated=before.branchIsolated;
  }
  const width=Math.max(300,bounds.width+60),height=Math.max(200,bounds.height+100),x=bounds.x-30,y=bounds.y-30;
  svg.setAttribute('width',Math.ceil(width));
  svg.setAttribute('height',Math.ceil(height));
  svg.setAttribute('viewBox',`${x} ${y} ${width} ${height}`);
  svg.prepend(svgElement('rect',{x,y,width,height,fill:'white'}));
  scene.append(
    svgElement('text',{x:x+12,y:y+height-32,'font-size':11},
      'Hydra Bench · '+(network.year==='all'?'All reporting years':network.year)+' · '+(network.metric==='spill_count'?'Spill count':'Duration (h)')),
    svgElement('text',{x:x+12,y:y+height-14,'font-size':10,fill:'#60717d'},
      'Topology only · result RAG: ≤5% / ≤10% / >10% · network colours are user categories'),
  );
  return svg;
}
function reportGeometry(){
  if(!network.nodes.length)return null;
  const overview=inOverview(),graph=sceneGraph();
  const figure=wholeSceneSvg();
  figure.setAttribute('role','img');
  figure.setAttribute('aria-label','Network schematic');
  figure.setAttribute('width','100%');
  figure.removeAttribute('height');
  return {figure:new XMLSerializer().serializeToString(figure),overview,nodes:graph.nodes.length,links:graph.edges.length};
}
async function exportReport(){
  const report=window.open('','_blank');
  if(!report){status('Allow this report window to open.');return;}
  const css='h1,h2,strong,button{font-weight:600}th{font-weight:500}body{font-variant-numeric:tabular-nums}body{font:12px Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#202221;margin:24px}h1{font-size:21px}h2{font-size:16px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{padding:7px;border-bottom:1px solid #e4e5e3;text-align:right}th:nth-child(2),td:nth-child(2){text-align:left}th{background:#f5f5f3}small,details{color:#626660}.ns-rag-green{background:#eaf6ed}.ns-rag-amber{background:#fff4d9}.ns-rag-red{background:#fdebec}svg{width:100%;height:auto;max-height:80vh}section{break-inside:avoid;margin:24px 0}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}svg{max-height:160mm}details:not([open])>*:not(summary){display:block!important}}';
  const title='Network annual spill review';
  const print=textElement('button','Print / save PDF');
  print.id='printReport';
  print.onclick=()=>report.print();
  const content=document.createDocumentFragment();
  content.append(print,textElement('h1',title),textElement('small',
    new Date().toISOString()+' · build '+buildToken+' · counts: occupied 12/24 blocks · duration: hours · Δ = model − observed'),
    wholeSceneSvg());
  for(const n of network.nodes.filter(asset)){
    const section=document.createElement('section');
    const review=R.review(n);
    section.append(textElement('h2',n.name),annualTable(n,true,prefs().scenarios,false));
    if(review.comment)section.append(textElement('p',review.comment));
    const details=document.createElement('details');
    details.open=true;
    details.append(textElement('summary','Assessment basis'),auditDetails(n));
    section.append(textElement('small','Review: '+review.status+' · '+healthLabel(nodeHealth(n))),details);
    content.append(section);
  }
  content.append(textElement('h2','Connector notes'));
  for(const edge of network.edges){
    const comment=R.review(edge).comment;
    if(!comment)continue;
    const paragraph=document.createElement('p');
    paragraph.append(textElement('strong',edge.name||edge.from+' → '+edge.to),': '+comment);
    content.append(paragraph);
  }
  content.append(textElement('p','RAG describes agreement, not spill severity. Partial years are not annualised. Missing or provisional evidence remains qualified.'),
    textElement('footer','Hydra Bench · Anzar Sajid'));
  try{await window.HydraDesign.prepareReportFont();}catch(error){report.close();status(error.message);return;}
  if(report.closed)return;
  report.document.title=title;
  report.document.head.append(textElement('style',css),textElement('style',window.HydraDesign.reportFontCss()));
  report.document.body.replaceChildren(content);
  report.focus();
  status('Report opened. Use Print / Save PDF.');
}
function auditDetails(n){
  const fragment=document.createDocumentFragment();
  for(const r of n.applied?.rows||[]){
    const paragraph=document.createElement('p');
    const lines=[
      r.year+' · '+(r.role==='observed'?'Observed':r.scenario)+' · '+r.source_name+' · '+r.column,
      (r.analysis_start||'—')+' to '+(r.analysis_end||'—')+' · '+(r.partial_year?'partial year':''),
      'Threshold '+(C.thresholdRule(r)==='gt'?'>':'≥')+' '+f(r.threshold,6)+' '+(r.unit||'')+' · '+(r.quantity||'')+' '+(r.datum||''),
      'Valid '+f(r.valid_hours)+' h · unknown '+f(r.unknown_hours)+' h · excluded '+f(r.excluded_hours)+' h · '+(r.count_status||''),
      'SHA-256 '+(r.source_sha256||''),
      'Exclusions '+JSON.stringify(r.exclusions||[]),
    ];
    paragraph.append(lines[0]);
    for(const line of lines.slice(1))paragraph.append(document.createElement('br'),line);
    fragment.append(paragraph);
  }
  fragment.append(textElement('p','Calculated '+(n.applied?.calculated_at||'—')+' · gap '+f(n.applied?.settings?.gap)
    +' s · comparison basis '+(n.applied?.settings?.confirmed?'confirmed':'unconfirmed')));
  return fragment;
}
function renderAnalysisSettings(n){
  const year=Number($('nsAnalysisYear').value),chosen=prefs().scenarios;
  $('nsAnalysisSources').innerHTML=n.bindings.filter(b=>b.years.includes(year)&&(b.role==='observed'||chosen===null||chosen.includes(b.scenario))).map(b=>{
    const source=sourceFor(b),metadata=contract(b);
    return '<div class="ns-source-row" data-ns-binding="'+html(b.id)+'"><strong>'+html((b.role==='observed'?'Observed':b.scenario)+' · '+b.sourceName)+'</strong>'+fields('Channel',selectHtml('data-ns-binding-field="column"',(source?.parsed.columns||[b.column]).map(c=>[c,c]),b.column))+'<div class="ns-two">'+fields('Quantity',selectHtml('data-ns-binding-field="quantity"',[['depth','Depth'],['level','Level'],['flow','Overflow flow'],['status','Spill status']],b.quantity))+fields('Values / threshold unit',selectHtml('data-ns-binding-field="unit"',unitOptions(b.quantity),b.unit))+'</div><div class="ns-two">'+fields('Threshold ('+html(b.unit||'assign unit')+')','<input data-ns-binding-field="threshold" type="number" step="any" value="'+html(b.threshold)+'" placeholder="Asset default">')+fields('Spill when',selectHtml('data-ns-binding-field="comparison"',[['gt','Above (>)'],['ge','At or above (≥)']],C.thresholdRule(b)))+'</div>'+(b.quantity==='level'?fields('Level datum','<input data-ns-binding-field="datum" value="'+html(b.datum||'')+'">'):'')+'<small>'+html(metadata.unit?'Stored values: '+metadata.unit+'. Unit changes convert values and thresholds.':'Unit not detected. Assign the unit of the existing numbers; values and thresholds are retained.')+'</small></div>';
  }).join('');
}
async function openAnalysis(mode='series',preferredYear=null){
  const n=node();if(!n||!asset(n))return;hideHover();const generation=++analysisGeneration,years=R.years(n);
  const year=years.includes(preferredYear)?preferredYear:network.year==='all'?years.at(-1):Number(network.year);
  if(!year){status('Assign reporting years first.');return;}
  analysisContext={id:n.id,year,mode,signature:signature(n)};
  analysisReturnFocus=document.activeElement;
  $('nsAnalysis').hidden=false;if(!$('nsAnalysis').open)$('nsAnalysis').showModal();$('nsCloseAnalysis').focus();$('nsAnalysisTitle').textContent=n.name;
  $('nsAnalysisYear').innerHTML=years.map(y=>'<option '+(y===year?'selected':'')+'>'+y+'</option>').join('');
  renderAnalysisSettings(n);
  $('nsAnalysisCounts').replaceChildren(annualTable(n,true));
  $('nsAnalysisAudit').replaceChildren(auditDetails(n));
  $('nsAnalysisBasis').textContent='Annual evidence';$('nsCommonResult').innerHTML='';$('nsCommonResult').hidden=true;$('nsCommonMessage').textContent='';$('nsAnalysisMessage').textContent='';globalThis.Plotly?.purge('nsAnalysisPlot');
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
  globalThis.Plotly?.purge('nsAnalysisPlot');
  try{
    await loadVendorScript('Plotly');
    if(generation!==analysisGeneration)return;
    const traces=[],shapes=[],groups=new Map(),colours=['#6554c0','#147d92','#d88925','#43854f'];
    for(const b of bindings){
      const source=sourceFor(b);if(!source)throw new Error('Reload '+b.sourceName);const scale=C.valueScale(b.quantity,contract(b).unit,b.unit),key=b.quantity+'|'+b.unit+'|'+(b.datum||'');if(!groups.has(key))groups.set(key,groups.size);const axis=groups.get(key)+1,colour=b.role==='observed'?'#e33434':colours[traces.filter(t=>t.name!=='Observed').length%colours.length];
      const data=await engine.call('series_data',{path:source.virtualPath,column:b.column,max_points:25000,start,end,end_exclusive:true,max_gap_seconds:n.gap,exclusions_json:JSON.stringify(n.exclusions)});
      if(generation!==analysisGeneration||current!==signature(n))return;
      traces.push({x:data.timestamp,y:data.value.map(v=>v===null?null:v*scale),type:'scatter',mode:'lines',name:b.role==='observed'?'Observed':b.scenario,line:{color:colour,width:1.4},connectgaps:false,xaxis:axis===1?'x':'x'+axis,yaxis:axis===1?'y':'y'+axis});
      const threshold=C.effectiveThreshold(b,n.defaults);shapes.push({type:'line',xref:axis===1?'x domain':'x'+axis+' domain',x0:0,x1:1,yref:axis===1?'y':'y'+axis,y0:threshold.value,y1:threshold.value,line:{color:colour,dash:'dash',width:1}});
    }
    if(generation!==analysisGeneration||!traces.length){if(generation===analysisGeneration)$('nsAnalysisMessage').textContent='No assigned series for this year.';return;}
    const layout={height:Math.max(350,groups.size*230),margin:{l:65,r:25,t:30,b:45},legend:{orientation:'h',y:1.1},shapes,template:'plotly_white',...(window.HydraDesign?.chartLayout()||{}),uirevision:n.id+'|'+year};
    for(const [key,index] of groups){const axis=index+1,suffix=axis===1?'':axis;layout['yaxis'+suffix]={title:{text:key.split('|').filter(Boolean).join(' · ')},domain:[1-(index+1)/groups.size+.05,1-index/groups.size-.03],anchor:axis===1?'x':'x'+axis};layout['xaxis'+suffix]={type:'date',anchor:axis===1?'y':'y'+axis,range:[start,end],matches:axis===1?undefined:'x',showticklabels:axis===groups.size};for(const exc of n.exclusions)shapes.push({type:'rect',xref:axis===1?'x':'x'+axis,x0:exc.start,x1:exc.end,yref:axis===1?'y domain':'y'+axis+' domain',y0:0,y1:1,fillcolor:'#82939f',opacity:.15,line:{width:0},layer:'below'});}
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
    $('nsCommonResult').hidden=false;$('nsCommonResult').replaceChildren(textElement('strong','Common period · '+year),annualTable(proxy,true,[scenario]),textElement('small',start+' to '+end));const reason=C.comparable(output[0],output[1],n.confirmed);$('nsCommonMessage').textContent=reason||'Comparable common-period evidence.';
  }catch(error){$('nsCommonMessage').textContent=String(error.message||error);}
  finally{busy=false;$('nsCommonCalculate').disabled=false;renderReview();}
}
function mountReview(){
  $('nsWorkbench').querySelector('.ns-main-toolbar').insertAdjacentHTML('afterbegin','<input id="nsAssetSearch" type="search" placeholder="Find asset" aria-label="Find asset" list="nsAssetNames"><datalist id="nsAssetNames"></datalist>');
  $('nsWorkbench').querySelector('.ns-main-toolbar').insertAdjacentHTML('beforeend','<button id="nsAnnualTable">Annual table</button><details id="nsReviewTools"><summary>Tools</summary><div class="ns-tool-panel"><div class="ns-tool-row"><label>Type'+selectHtml('id="nsTypeFilter"',[['all','All assets'],...Object.entries(C.types)],'all')+'</label><label>Evidence'+selectHtml('id="nsHealthFilter"',[['all','Any'],...['ready','missing','stale','provisional','short','unassigned','uncalculated'].map(s=>[s,healthLabel(s)])],'all')+'</label><label>Result'+selectHtml('id="nsResultFilter"',[['all','Any'],['green','Green'],['amber','Amber'],['red','Red'],['neutral','Neutral']],'all')+'</label><label>Detail'+selectHtml('id="nsDetail"',[['auto','Automatic'],['full','Full'],['minimal','Minimal']],'auto')+'</label></div><div class="ns-tool-row"><button data-ns-trace="up">Upstream</button><button data-ns-trace="down">Downstream</button><button id="nsIsolateBranch" aria-pressed="false">Isolate branch</button><button id="nsClearTrace">Clear trace</button><button id="nsAudit">Connectivity</button><span id="nsHiddenCount"></span></div><details><summary>Scenarios</summary><div id="nsScenarioChoices"></div></details><details><summary>Layout</summary><div class="ns-tool-row"><label><input id="nsSnap" type="checkbox"> Snap</label><label><input id="nsLocked" type="checkbox"> Lock</label><button data-ns-arrange="auto">Auto layout</button><button data-ns-arrange="left">Align left</button><button data-ns-arrange="top">Align top</button><button data-ns-arrange="horizontal">Distribute horizontally</button><button data-ns-arrange="vertical">Distribute vertically</button><button id="nsRedo">Redo</button><span id="nsSelectionCount"></span></div><small>Shift-click to select several assets. Pinned assets stay in place.</small></details><details><summary>Views & snapshots</summary><div class="ns-tool-row"><input id="nsViewName" placeholder="View / review name" maxlength="100"><button id="nsSaveView">Save view</button><select id="nsViewSelect"></select><button id="nsSaveSnapshot">Save review snapshot</button><select id="nsSnapshotSelect"></select></div></details><p id="nsAuditResult"></p></div></details>');
  $('nsWorkbench').querySelector('.ns-export-actions').insertAdjacentHTML('beforeend','<button id="nsSvgExport">Export SVG</button><button id="nsReportExport">Annual report / PDF</button>');
  $('nsCanvas').insertAdjacentHTML('beforeend','<aside id="nsHover" hidden></aside>');
  $('nsWorkbench').insertAdjacentHTML('beforeend','<section id="nsMatrix" hidden><div class="ns-matrix-toolbar"><strong>Annual comparison</strong><input id="nsMatrixSearch" type="search" placeholder="Filter assets"><label><input id="nsMatrixSelected" type="checkbox"> Selected only</label><small>Δ = M − O</small><button id="nsCloseMatrix">Close</button></div><div id="nsMatrixBody"></div></section><dialog id="nsAnalysis" role="dialog" aria-modal="true" aria-label="Asset analysis" hidden><div class="ns-analysis-toolbar"><strong id="nsAnalysisTitle"></strong><select id="nsAnalysisYear" aria-label="Graph year"></select><button id="nsAnalysisMode">Show annual spills</button><button id="nsCloseAnalysis">Close</button></div><div class="ns-analysis-body"><details id="nsAnalysisSettings"><summary>Channels, units &amp; thresholds</summary><div id="nsAnalysisSources"></div><button id="nsAnalysisCalculate" class="ns-primary">Apply &amp; recalculate annual spills</button></details><div id="nsAnalysisPlot"></div><small id="nsAnalysisMessage"></small><strong id="nsAnalysisBasis">Annual evidence</strong><div id="nsAnalysisCounts"></div><details><summary>Common-period comparison</summary><div class="ns-tool-row"><select id="nsCommonYear" aria-label="Common period year"></select><select id="nsCommonScenario" aria-label="Common period scenario"></select><button id="nsCommonCalculate">Calculate overlap</button></div><small id="nsCommonMessage">Annual totals remain unchanged.</small><div id="nsCommonResult" hidden></div></details><details><summary>Assessment details</summary><div id="nsAnalysisAudit"></div></details></div></dialog>');
  $('nsReviewTools').querySelector('.ns-tool-panel').insertAdjacentHTML('afterbegin',
    '<label><input id="nsVerificationLayer" type="checkbox"> Verification evidence layer</label> <label><input id="nsFlowSurveyLayer" type="checkbox"> Flow Survey evidence layer</label> <label>Survey week <select id="nsFlowSurveyWeek" aria-label="Survey week"></select></label> <label><input id="nsDetrimentLayer" type="checkbox"> Detriment evidence layer</label> <label>Detriment theme '+selectHtml('id="nsDetrimentKind" aria-label="Detriment theme"',detrimentKinds,detrimentKind())+'</label> <small id="nsDetrimentCaption"></small>');
  window.addEventListener('icm:route-changed',event=>{
    if(event.detail.workspace==='network'){renderCanvas();renderReview();renderDrawer();}
  });
  window.addEventListener('icm:assessment-published',event=>{
    const route=window.__ICM_PRECISION_WORKBENCH__?.route();
    if(event.detail.id==='verification:comparison'&&prefs().verification===true&&route?.workspace==='network')renderCanvas();
  });
  $('nsDetrimentLayer').onchange=()=>{
    network.preferences={...prefs(),detriment:$('nsDetrimentLayer').checked};
    changed(true);
  };
  $('nsDetrimentKind').onchange=()=>{
    network.preferences={...prefs(),detrimentKind:$('nsDetrimentKind').value};
    changed(true);renderDrawer();
  };
  root().addEventListener('click',event=>{
    const id=event.target.id;
    if(!['nsConfirmDetriment','nsRemoveDetriment','nsOpenDetriment'].includes(id))return;
    const object=node()||edge(),kind=detrimentKind(),view=detrimentView();
    if(!object?.contextSource)return;
    if(id==='nsOpenDetriment'){
      const link=object.detrimentLinks?.[kind];
      if(link&&link.signature===view?.signature)window.ICMDetriment.openSchematicEvidence(kind,link.id);
      return;
    }
    const reportId=$('nsDetrimentId')?.value;
    if(id==='nsConfirmDetriment'&&!view?.rows.has(reportId)){
      status('Enter an exact asset ID present in this detriment comparison.');return;
    }
    checkpoint();
    object.detrimentLinks={...object.detrimentLinks};
    if(id==='nsRemoveDetriment')delete object.detrimentLinks[kind];
    else object.detrimentLinks[kind]={id:reportId,signature:view.signature};
    changed(true);renderDrawer();
    $('nsDrawer').querySelector('#nsDetrimentId')?.closest('details')?.setAttribute('open','');
    status(id==='nsRemoveDetriment'?'Detriment association removed.':'Detriment association confirmed.');
  });
  $('nsFlowSurveyLayer').onchange=()=>{
    network.preferences={...prefs(),flowSurvey:$('nsFlowSurveyLayer').checked};
    changed(true);
  };
  $('nsFlowSurveyWeek').onchange=()=>{
    network.preferences={...prefs(),surveyWeek:$('nsFlowSurveyWeek').value};
    changed(true);
  };
  root().addEventListener('click',event=>{
    if(!event.target.closest('#nsOpenFlowSurvey'))return;
    const point=node()||edge(),view=surveyLayerView(),row=view?.byMonitor.get(point?.monitorId);
    if(!row||row.status!=='current'){
      status('Run a current Flow Survey assessment for the linked monitor and select a week.');return;
    }
    window.__ICM_PRECISION_WORKBENCH__.navigate('survey','fdv-check',true);
    window.__ICM_WORKBENCH__.workflow26.selectReviewWeek('monitor-week',point.monitorId,null,view.week);
  });
  $('nsVerificationLayer').onchange=()=>{
    network.preferences={...prefs(),verification:$('nsVerificationLayer').checked};
    changed(true);
  };
  root().addEventListener('change',event=>{
    if(event.target.id!=='nsMonitorAssociation')return;
    const point=node()||edge(),id=event.target.value;
    if(!point||point.type==='label')return;
    const monitor=window.ICMProjectRegistry?.snapshot()?.assets.find(asset=>asset.id===id&&asset.kind==='flow-monitor');
    if(id&&!monitor)return;
    if(id&&[...network.nodes,...network.edges].some(other=>other!==point&&other.monitorId===id)){
      status('This monitor is already associated with another object. Remove that association before moving it.');
      event.target.value=point.monitorId||'';return;
    }
    checkpoint();
    point.monitorId=id;
    changed(true);renderDrawer();
  });
  root().addEventListener('click',event=>{
    if(!event.target.closest('#nsOpenVerification'))return;
    const point=node()||edge(),assessment=window.__ICM_WORKBENCH__?.readVerificationEvidence?.();
    if(!point?.monitorId||assessment?.asset.kind!=='flow-monitor'||assessment.asset.id!==point.monitorId){
      status('Run a comparison for the linked monitor before opening Verification evidence.');return;
    }
    window.__ICM_PRECISION_WORKBENCH__.navigate('graphs','overview',true);
  });
  const searchable=()=>[
    ...network.nodes.map(n=>({id:n.id,kind:'node',name:n.name})),
    ...network.edges.map(e=>({id:e.id,kind:'edge',name:e.name||e.id})),
  ];
  const matchingAssets=query=>searchable().filter(item=>[item.id,item.name].some(value=>String(value).toLowerCase().includes(query)));
  $('nsAssetSearch').oninput=()=>{
    const candidates=matchingAssets($('nsAssetSearch').value.trim().toLowerCase()).slice(0,30);
    $('nsAssetNames').replaceChildren(...candidates.map(item=>new Option(item.kind==='edge'?'Connector':'Asset',item.name)));
  };
  const search=()=>{
    const query=$('nsAssetSearch').value.trim().toLowerCase();if(!query)return;
    const results=matchingAssets(query),item=results.find(item=>[item.name,item.id].some(value=>String(value).toLowerCase()===query))||results[0];
    if(!item){status('Asset not found.');return;}
    const p=prefs();
    if(selected===item.id&&selectionKind===item.kind&&p.type==='all'&&p.health==='all'&&p.result==='all'&&!branchIsolated)return;
    network.preferences={...p,type:'all',health:'all',result:'all'};
    branchIsolated=false;
    if(item.kind==='node')centre(item.id);else{selectConnector(item.id);focusSelected();}
  };
  $('nsAssetSearch').onchange=search;
  $('nsAssetSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search();}});
  for(const [id,key] of [['nsTypeFilter','type'],['nsHealthFilter','health'],['nsResultFilter','result'],['nsDetail','detail'],['nsSnap','snap'],['nsLocked','locked']])$(id).onchange=()=>{network.preferences={...prefs(),[key]:['snap','locked'].includes(key)?$(id).checked:$(id).value};changed(true);};
  $('nsRedo').onclick=()=>undoEdit(true);$('nsSaveView').onclick=saveView;$('nsViewSelect').onchange=()=>loadView($('nsViewSelect').value);$('nsSaveSnapshot').onclick=saveReviewSnapshot;$('nsSnapshotSelect').onchange=()=>downloadReviewSnapshot($('nsSnapshotSelect').value);
  $('nsAnnualTable').onclick=()=>{$('nsMatrix').hidden=!$('nsMatrix').hidden;renderMatrix();};$('nsCloseMatrix').onclick=()=>{$('nsMatrix').hidden=true;};$('nsMatrixSearch').oninput=renderMatrix;$('nsMatrixSelected').onchange=renderMatrix;
  $('nsIsolateBranch').onclick=toggleIsolation;
  $('nsClearTrace').onclick=()=>{highlight=null;branchIsolated=false;renderCanvas();};$('nsAudit').onclick=()=>{const a=R.audit(network.nodes,network.edges);$('nsAuditResult').textContent=a.components.length+' components · '+a.isolated.length+' isolated · '+a.cycleAffected.length+' cycle-affected';highlight={ids:new Set([...a.isolated,...a.cycleAffected]),wires:new Set()};if(!highlight.ids.size)highlight=null;renderCanvas();};
  $('nsSvgExport').onclick=async()=>{
    const svg=wholeSceneSvg();
    root().querySelector('.ns-export-menu').open=false;
    try{
      await window.HydraDesign.prepareReportFont();
      const defs=svgElement('defs');
      defs.append(svgElement('style',{},window.HydraDesign.reportFontCss()));
      svg.prepend(defs);
      downloadBlob('hydra-network-schematic.svg',new XMLSerializer().serializeToString(svg),'image/svg+xml');
    }catch(error){status(error.message);}
  };
  $('nsReportExport').onclick=()=>{root().querySelector('.ns-export-menu').open=false;exportReport();};
  root().addEventListener('click',event=>{const t=event.target,trace=t.closest('[data-ns-trace]'),arrangeButton=t.closest('[data-ns-arrange]'),focus=t.closest('[data-ns-centre],[data-ns-focus]'),analysis=t.closest('[data-ns-open-analysis]');if(trace&&selected)traceSelection(trace.dataset.nsTrace);if(arrangeButton)arrange(arrangeButton.dataset.nsArrange);if(focus){if(focus.dataset.nsYear)network.year=focus.dataset.nsYear;centre(focus.dataset.nsCentre||focus.dataset.nsFocus);}if(analysis)void openAnalysis(analysis.dataset.nsOpenAnalysis);});
  root().addEventListener('change',event=>{if(event.target.hasAttribute('data-ns-scenario-choice')){network.preferences={...prefs(),scenarios:[...$('nsScenarioChoices').querySelectorAll('input:checked')].map(x=>x.dataset.nsScenarioChoice)};changed(true);}});
  $('nsSvg').addEventListener('pointerover',event=>{const id=event.target.closest('[data-ns-node]')?.dataset.nsNode;if(id){clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>hoverCard(id),250);}});$('nsSvg').addEventListener('pointerout',event=>{if(!event.relatedTarget?.closest?.('[data-ns-node]'))hideHover();});
  $('nsAnalysis').addEventListener('keydown',event=>{if(event.key==='Escape')$('nsCloseAnalysis').click();if(event.key==='Tab'){const controls=[...$('nsAnalysis').querySelectorAll('button,select,summary,input,textarea,a[href],[tabindex]')].filter(el=>el.getClientRects().length&&!el.disabled&&el.tabIndex>=0&&!el.closest('[hidden],[inert]')),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  $('nsAnalysis').addEventListener('cancel',event=>{event.preventDefault();$('nsCloseAnalysis').click();});
  window.addEventListener('icm:route-changed',event=>{if($('nsAnalysis').open&&(event.detail.workspace!=='network'||event.detail.page!=='schematic'))$('nsCloseAnalysis').click();});
  $('nsCloseAnalysis').onclick=()=>{++analysisGeneration;clearTimeout(analysisTimer);$('nsAnalysis').close();$('nsAnalysis').hidden=true;globalThis.Plotly?.purge('nsAnalysisPlot');analysisContext=null;const target=analysisReturnFocus?.isConnected?analysisReturnFocus:$('nsCanvas');target?.focus({preventScroll:true});analysisReturnFocus=null;};$('nsAnalysisYear').onchange=()=>{const n=network.nodes.find(n=>n.id===analysisContext?.id);if(n)renderAnalysisSettings(n);if(analysisContext?.mode==='series')void plotAnalysis(++analysisGeneration);};$('nsAnalysisMode').onclick=()=>{if(!analysisContext)return;analysisContext.mode=analysisContext.mode==='series'?'spills':'series';$('nsAnalysisPlot').hidden=analysisContext.mode==='spills';$('nsAnalysisMode').textContent=analysisContext.mode==='spills'?'Show time series':'Show annual spills';if(analysisContext.mode==='series')void plotAnalysis(++analysisGeneration);};$('nsCommonCalculate').onclick=()=>void calculateCommon();
  $('nsAnalysisCalculate').onclick=async()=>{if(busy)return;await calculate();const n=network.nodes.find(n=>n.id===analysisContext?.id);if(n){$('nsAnalysisCounts').replaceChildren(annualTable(n,true));$('nsAnalysisAudit').replaceChildren(auditDetails(n));if(analysisContext.mode==='series')await plotAnalysis(++analysisGeneration);}};
  renderReview();
}
const defaultProfileView={zoomX:1,zoomY:1,panX:.5,panY:.5,groundShading:false};
let routeDraft={start:'',end:'',choices:new Map(),steps:[],trials:[],model:null,profileView:{...defaultProfileView}};
let routeRevision=0;
let proposedRouteGeometry=null;
const reviewedRouteGeometry=()=>proposedRouteGeometry?.baseline===routeDraft.steps?proposedRouteGeometry:null;
async function routeGeometryDigest(steps){
  const bytes=new TextEncoder().encode(JSON.stringify(steps));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function resetRouteDraft(){
  routeDraft={start:'',end:'',choices:new Map(),steps:[],trials:[],model:null,profileView:{...defaultProfileView}};
  proposedRouteGeometry=null;
  ++routeRevision;
  clearHotspots();
  if($('nsRoute')){
    if($('nsProfileExpanded').open)$('nsProfileExpanded').close();
    $('nsRoute').hidden=true;$('nsProfile').hidden=true;
    $('nsRouteName').value='';$('nsRouteNote').value='';$('nsRouteSavedMessage').textContent='';
  }
  simulationView?.reset('The network changed. Review its revision before applying simulation results.');
}
let monitorDialog,monitorTable=null,monitorColumn=0,monitorGeneration=0;
const monitorResolutions=new Map(),monitorChanges=new Set();

function tableWithHeaders(labels){
  const table=inspectorElement('table');
  const heading=table.createTHead().insertRow();
  for(const label of labels){
    const cell=inspectorElement('th',label);cell.scope='col';heading.append(cell);
  }
  table.createTBody();
  return table;
}
function addCells(row,values){
  for(const value of values){
    const cell=row.insertCell();
    if(value instanceof Node)cell.append(value);else cell.textContent=value;
  }
}

function openMonitorImport(){
  if(!monitorDialog.open){renderMonitorImport();monitorDialog.showModal();}
}
function renderMonitorImport(){
  const target=$('nsMonitorPreview'),apply=$('nsMonitorApply');
  $('nsMonitorClose').textContent=monitorTable?'Cancel':'Close';
  target.replaceChildren();apply.disabled=true;
  const matches=monitorTable?R.monitorMatches(monitorTable,monitorColumn,network,monitorResolutions):[];
  if(!monitorTable){
    const {byAsset}=R.monitorIndex(network);
    const review=network.monitorReview||[];
    const saved=network.monitorLocations||[];
    target.append(inspectorElement('p',saved.length+' saved monitor locations · '+review.length+' unresolved import rows.'));
    if(saved.length||review.length){
      const table=tableWithHeaders(['Monitor','Installed asset','Status']);
      for(const row of saved){
        const asset=byAsset.get(R.refKey(row.asset));
        addCells(table.tBodies[0].insertRow(),[row.monitor,asset?.label||row.sourceId,
          asset?.identity===row.identity?'Linked':'Review after network change']);
      }
      for(const row of review)addCells(table.tBodies[0].insertRow(),[row.monitor,row.assetId,row.status]);
      target.append(table);
    }
    return;
  }
  const table=tableWithHeaders(['Row','Monitor name','Installed asset ID','Match and review']);
  for(const row of matches){
    const decision=inspectorElement('div',row.state+(row.match?' · '+row.match.label:''));
    if(row.choices.length>1){
      const pick=inspectorElement('select');
      pick.setAttribute('aria-label','Choose installed asset for row '+(row.index+2));
      pick.add(new Option('Choose node or link',''));
      for(const choice of row.choices)pick.add(new Option((choice.kind==='node'?'Node · ':'Link · ')+choice.label+' · '+choice.id,R.refKey(choice)));
      pick.value=monitorResolutions.get(row.index)||'';
      pick.onchange=()=>{
        for(const candidate of matches){
          if(candidate.monitor===row.monitor&&candidate.assetId===row.assetId){
            monitorResolutions.set(candidate.index,pick.value);monitorChanges.delete(candidate.index);
          }
        }
        renderMonitorImport();target.querySelector('[aria-label="'+pick.getAttribute('aria-label')+'"]')?.focus();
      };
      decision.append(pick);
    }
    if(row.state==='Confirm change'){
      const label=inspectorElement('label'),check=inspectorElement('input');check.type='checkbox';
      check.checked=monitorChanges.has(row.index);
      check.onchange=()=>{if(check.checked)monitorChanges.add(row.index);else monitorChanges.delete(row.index);};
      label.append(check,document.createTextNode(' Move from '+row.prior.sourceId));decision.append(label);
    }
    addCells(table.tBodies[0].insertRow(),[String(row.index+2),row.monitor,row.assetId,decision]);
  }
  target.append(table);apply.disabled=false;
}
function mountMonitorImport(){
  monitorDialog=inspectorElement('dialog',undefined,'ns-review-dialog');
  monitorDialog.setAttribute('aria-labelledby','nsMonitorTitle');
  monitorDialog.innerHTML='<header class="ns-review-heading"><h3 id="nsMonitorTitle">Import monitor locations</h3><button type="button" id="nsMonitorClose">Close</button></header>'+
    '<p>Choose a local two-column CSV with a header row. Confirm the monitor name and installed manhole or pipe ID columns.</p>'+
    '<label class="ns-field">Monitor locations CSV<input id="nsMonitorFile" type="file" accept=".csv,text/csv"></label>'+
    '<div class="ns-review-actions" id="nsMonitorColumns" hidden><label>Monitor name<select id="nsMonitorNameColumn"></select></label>'+
    '<label>Installed asset ID<select id="nsMonitorAssetColumn"></select></label></div>'+
    '<p id="nsMonitorMessage" role="status"></p><div id="nsMonitorPreview" class="ns-review-table"></div>'+
    '<footer class="ns-review-actions"><button id="nsMonitorApply" class="ns-primary" type="button" disabled>Apply confirmed rows</button></footer>';
  document.body.append(monitorDialog);
  $('nsMonitorClose').onclick=()=>monitorDialog.close();
  monitorDialog.addEventListener('close',()=>{
    ++monitorGeneration;monitorTable=null;$('nsMonitorFile').value='';$('nsMonitorColumns').hidden=true;
    $('nsMonitorMessage').textContent='';renderMonitorImport();
  });
  $('nsMonitorFile').onchange=async event=>{
    const request=++monitorGeneration,file=event.target.files[0];
    monitorTable=null;monitorResolutions.clear();monitorChanges.clear();
    $('nsMonitorColumns').hidden=true;$('nsMonitorMessage').textContent='';renderMonitorImport();
    if(!file)return;
    try{
      if(file.size>4*1024*1024)throw new Error('Choose a monitor CSV no larger than 4 MiB.');
      const bytes=await file.arrayBuffer();
      if(request!==monitorGeneration)return;
      let text;
      try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
      catch{text=new TextDecoder('windows-1252').decode(bytes);}
      monitorTable=C.monitorTable(text);
      const named=monitorTable.headers.map(header=>/^(flow[ _-]*)?monitor([ _-]*(name|id))?$/i.test(header));
      const host=monitorTable.headers.map(header=>/(asset|manhole|pipe|conduit|node|link)/i.test(header));
      monitorColumn=named.filter(Boolean).length===1?named.indexOf(true):host.filter(Boolean).length===1?1-host.indexOf(true):0;
      for(const id of ['nsMonitorNameColumn','nsMonitorAssetColumn']){
        const select=$(id);select.replaceChildren();
        for(const [index,header] of monitorTable.headers.entries())select.add(new Option('Column '+(index+1)+(header?' · '+header:''),String(index)));
      }
      $('nsMonitorColumns').hidden=false;syncMonitorColumns();
      if(!named.some(Boolean)&&!host.some(Boolean))$('nsMonitorMessage').textContent='Generic headers detected. Confirm the column mapping before applying.';
      renderMonitorImport();
    }catch(error){$('nsMonitorMessage').textContent=error.message;}
  };
  function syncMonitorColumns(){
    $('nsMonitorNameColumn').value=String(monitorColumn);$('nsMonitorAssetColumn').value=String(1-monitorColumn);
  }
  for(const [id,offset] of [['nsMonitorNameColumn',0],['nsMonitorAssetColumn',1]])$(id).onchange=()=>{
    monitorColumn=Math.abs(Number($(id).value)-offset);monitorResolutions.clear();monitorChanges.clear();
    syncMonitorColumns();renderMonitorImport();
  };
  $('nsMonitorApply').onclick=()=>{
    if(!monitorTable)return;
    const rows=R.monitorMatches(monitorTable,monitorColumn,network,monitorResolutions);
    const saved=new Map((network.monitorLocations||[]).map(row=>[row.monitor,row]));
    const review=new Map((network.monitorReview||[]).map(row=>[JSON.stringify([row.monitor,row.assetId]),row]));
    let applied=0;
    for(const row of rows){
      const key=JSON.stringify([row.monitor,row.assetId]);
      if(row.state==='Matched'||row.state==='Confirm change'&&monitorChanges.has(row.index)){
        saved.set(row.monitor,{monitor:row.monitor,asset:{kind:row.match.kind,id:row.match.id},sourceId:row.assetId,identity:row.match.identity});
        review.delete(key);applied++;
      }else if(row.state==='Already linked')review.delete(key);
      else if(row.state==='Duplicate')continue;
      else review.set(key,{monitor:row.monitor,assetId:row.assetId,status:row.state});
    }
    if(saved.size>10000||review.size>10000){$('nsMonitorMessage').textContent='The workspace supports 10,000 locations and 10,000 unresolved rows.';return;}
    checkpoint();network.monitorLocations=[...saved.values()];network.monitorReview=[...review.values()];changed(true);
    monitorTable=null;$('nsMonitorColumns').hidden=true;$('nsMonitorFile').value='';renderMonitorImport();
    $('nsMonitorMessage').textContent=applied+' applied · '+review.size+' unresolved. Save the network to share these locations locally.';
  };
  renderMonitorImport();
}

function renderReviewControls(){
  if(!$('nsOverview'))return;
  $('nsOverview').setAttribute('aria-pressed',String(inOverview()));
  $('nsOverview').disabled=editing||!network.nodes.length;
  $('nsShowLabels').checked=prefs().showLabels;
  $('nsShowMonitors').checked=prefs().showMonitors;
  $('nsLongSection').disabled=!network.edges.length&&!network.routeReviews?.length;
  $('nsWorkbench').querySelector('.ns-canvas-note').textContent=inOverview()?
    'Overview · M: monitor · Purple: structure · Dashed: direction unconfirmed':
    $('nsSvg').querySelector('[data-ns-compact]')?'Connections show topology only · Zoom in or use Find asset for details':
      'Connections show topology only · M: installed monitor';
  const panel=$('nsReach');
  if(panel&&!panel.hidden&&(!inOverview()||panel.dataset.selection!==selectionKind+':'+selected))panel.hidden=true;
  if($('nsRoute')&&!$('nsRoute').hidden)updateProfileSelection();
  renderRouteTrace();
}
function showReach(reach){
  selectConnector(reach.id);
  const panel=$('nsReach');panel.dataset.selection=selectionKind+':'+selected;
  panel.replaceChildren(inspectorElement('h3','Schematic reach'),inspectorElement('p',reach.sourceEdges.length+' source links in nominal order.'));
  const select=inspectorElement('select');select.setAttribute('aria-label','Source asset in reach');
  const graph=R.monitorIndex(network).byAsset;
  for(const [index,id] of reach.sourceNodes.entries()){
    const nodeRef={kind:'node',id};
    select.add(new Option('Node · '+(graph.get(R.refKey(nodeRef))?.label||id),R.refKey(nodeRef)));
    if(index<reach.sourceEdges.length){
      const edgeRef={kind:'edge',id:reach.sourceEdges[index]};
      select.add(new Option('Link · '+(graph.get(R.refKey(edgeRef))?.label||edgeRef.id),R.refKey(edgeRef)));
    }
  }
  const show=inspectorButton('Show in detailed network');
  show.onclick=()=>{
    const [kind,id]=JSON.parse(select.value);changeOverview(false);inspectObject({kind,id});focusSelected();$('nsCanvas').focus();
  };
  panel.append(select,show);panel.hidden=false;
}
function reviewRoute(){
  const planner=R.routePlanner(network,routeDraft.start,routeDraft.end),visited=new Set();
  const edges=[],branches=[];
  let id=routeDraft.start;
  while(id!==routeDraft.end){
    const options=planner.options(id,visited);
    if(!options.length)return {edges,branches,issue:planner.issue()};
    const preferred=routeDraft.choices.get(id);
    const branch=options.find(edge=>edge.id===preferred);
    if(options.length>1){
      branches.push({id,options,branch});
      if(!branch)return {edges,branches,pending:true};
    }
    visited.add(id);
    const edge=branch||options[0];edges.push(edge);id=edge.to;
  }
  return {edges,branches,issue:edges.length?'':planner.issue()};
}
function clearProfile(){
  proposedRouteGeometry=null;
  routeDraft.steps=[];routeDraft.trials=[];routeDraft.model=null;++routeRevision;
  $('nsRouteSavedMessage').textContent='';$('nsModelLevelsMessage').textContent='';
  displayProfile();
}
function routeEndpointOptions(select,value){
  select.replaceChildren(new Option('Choose an endpoint',''));
  for(const n of network.nodes.filter(node=>node.type!=='label')){
    select.add(new Option((n.name||n.id)+(n.name&&n.name!==n.id?' · '+n.id:''),n.id));
  }
  select.value=value;
}
function renderRouteTrace(){
  const panel=$('nsRoute');
  if(!panel||panel.hidden&&!$('nsSvg').querySelector('[data-ns-route-member]'))return;
  const route=new Set(panel.hidden?[]:routeDraft.steps.map(step=>step.id));
  const graph=inOverview()?overviewGraph():null;
  for(const group of $('nsSvg').querySelectorAll('[data-ns-edge]')){
    const id=group.dataset.nsEdge,members=graph?.edgeToReach.get(id)?.sourceEdges||[id];
    group.toggleAttribute('data-ns-route-member',members.some(member=>route.has(member)));
  }
}
function updateProfileSelection(){
  const panel=$('nsRoute');
  const selectedInside=selectionKind==='edge'&&routeDraft.steps.some(step=>step.id===selected);
  $('nsProfileFocus').disabled=!selectedInside&&!node();
  $('nsUseStart').disabled=!node()||node().type==='label';
  $('nsUseEnd').disabled=$('nsUseStart').disabled;
  for(const el of panel.querySelectorAll('[data-ns-profile-link]')){
    el.setAttribute('aria-pressed',String(selectionKind==='edge'&&selected===el.dataset.nsProfileLink));
  }
  for(const el of panel.querySelectorAll('[data-ns-profile-node]')){
    el.setAttribute('aria-pressed',String(selectionKind==='node'&&selected===el.dataset.nsProfileNode));
  }
}
function renderRoute(){
  const start=$('nsRouteStart'),end=$('nsRouteEnd'),branches=$('nsRouteBranch');
  routeEndpointOptions(start,routeDraft.start);routeEndpointOptions(end,routeDraft.end);
  branches.replaceChildren();
  const solved=reviewRoute();
  const nodes=new Map(network.nodes.map(node=>[node.id,node]));
  for(const [index,{id,options,branch}] of solved.branches.entries()){
    const point=nodes.get(id);
    const label=inspectorElement('label','Outgoing link at '+(point?.name||id));
    const select=inspectorElement('select');select.add(new Option('Choose a branch',''));
    for(const link of options)select.add(new Option((link.name||link.id)+' → '+(nodes.get(link.to)?.name||link.to),link.id));
    select.value=branch?.id||'';
    select.onchange=()=>{
      routeDraft.choices=new Map(solved.branches.slice(0,index).map(item=>[item.id,item.branch.id]));
      routeDraft.choices.set(id,select.value);
      clearProfile();renderRoute();
      branches.querySelectorAll('select')[index]?.focus();
    };
    label.append(select);branches.append(label);
  }
  const complete=solved.edges.length&&!solved.issue&&!solved.pending;
  $('nsRouteMessage').textContent=solved.pending?'Multiple forward routes reach the endpoint. Confirm the branch to continue.':
    complete?solved.edges.length+' ordered links. Open the long section to review levels and chainage.':solved.issue;
  $('nsOpenProfile').disabled=!complete;
  const saved=$('nsSavedRoutes'),active=saved.value;
  saved.replaceChildren(new Option('Choose a saved review',''));
  for(const entry of network.routeReviews||[])saved.add(new Option(entry.name,entry.name));
  saved.value=active;
  if(saved.selectedIndex<0)saved.selectedIndex=0;
}
function profileModelForView(){
  const model=simulationView?.profile()||routeDraft.model,proposal=model?.proposal;
  if(proposal&&(proposal.ends||proposal.geometry)&&
     (proposal.routeRevision!==routeRevision||proposal.geometry&&proposal.geometry!==reviewedRouteGeometry()))
    return {...model,proposal:null,proposalReviewPending:true};
  return model;
}
function plotProfile(steps){
  const view=$('nsProfilePlot');view.replaceChildren();
  const settings=routeDraft.profileView,model=profileModelForView(),reviewed=reviewedRouteGeometry();
  if(reviewed){
    const proposal=model?.proposal?.geometry===reviewed?model.proposal:null;
    for(const [phase,title,geometry,overlay] of [
      ['baseline','Baseline source geometry',steps,model?{...model,proposal:null}:null],
      ['proposal','Revised source geometry · '+reviewed.revision,reviewed.steps,proposal?
        {scenario:proposal.scenario,time:model.time,datum:model.datum,ends:proposal.ends,
          values:proposal.levels.map(row=>({node:row.id,level:row.level}))}:null],
    ]){
      const section=inspectorElement('section',undefined,'ns-profile-variant');
      section.dataset.nsProfileVariant=phase;
      section.append(inspectorElement('h4',title+(overlay?.scenario?' · '+overlay.scenario:'')));view.append(section);
      drawProfile(section,geometry,settings,overlay,phase,phase==='proposal'?reviewed.datum:'');
    }
  }else drawProfile(view,steps,settings,model,'baseline');
  updateProfileSelection();
}
function drawProfile(view,steps,settings,model,phase,geometryDatum=''){
  const datum=model?.datum||geometryDatum;
  const segments=[];
  let chainage=0,section=[],controls=[];
  function closeSection(){
    if(section.length)segments.push({pipes:section,controls});
    section=[];controls=[];chainage=0;
  }
  for(const step of steps){
    if(step.lengthStatus==='missing'){
      closeSection();continue;
    }
    if(step.lengthStatus==='structure'){controls.push({step,station:chainage});continue;}
    section.push({...step,x1:chainage,x2:chainage+step.length});chainage+=step.length;
  }
  closeSection();
  const plotted=segments.flatMap(segment=>segment.pipes);
  const routeNodes=new Set(steps.flatMap(step=>[step.from,step.to]));
  const imported=new Map((model?.values||[]).filter(record=>routeNodes.has(record.node)).map(record=>[record.node,record.level]));
  const conduitLevels=new Map((model?.ends||[]).map(record=>[record.edge,record]));
  const proposedConduitLevels=new Map((model?.proposal?.ends||[]).map(record=>[record.edge,record]));
  const profileLinks=new Set(plotted.map(step=>step.id));
  const proposalLevels=new Map((model?.proposal?.levels||[])
    .filter(row=>row.location==='node'?routeNodes.has(row.id):profileLinks.has(row.id)).map(row=>[row.id,row]));
  const shownEndLevels=plotted.flatMap(step=>[conduitLevels.get(step.id),proposedConduitLevels.get(step.id)]
    .flatMap(ends=>ends?[ends.upstream,ends.downstream]:[])).filter(Number.isFinite);
  const levels=steps.flatMap(step=>[step.us,step.ds,step.groundFrom,step.groundTo,step.chamberFrom,step.chamberTo,step.roofFrom,step.roofTo,
    ...(step.controlLevels||[]).map(control=>control.value),
    step.us!==null&&step.height!==null?step.us+step.height:null,
    step.ds!==null&&step.height!==null?step.ds+step.height:null]).filter(Number.isFinite)
    .concat([...imported.values()],shownEndLevels,[...proposalLevels.values()].map(row=>row.level));
  if(!segments.length||!levels.length){
    view.append(inspectorElement('p','A profile needs source conduit lengths and levels. Review the source data in the asset table.'));
    return;
  }
  const low=Math.floor(Math.min(...levels)),high=Math.max(low+1,Math.ceil(Math.max(...levels)));
  if(!Number.isFinite(high-low)||high<=low){view.append(inspectorElement('p','The source elevation limits cannot be plotted. Review the source levels.'));return;}
  if(steps.some(step=>step.lengthStatus==='missing'))view.append(inspectorElement('p','A conduit length is missing. Each downstream plot starts at its own local distance; absolute chainage is unavailable after the gap.','ns-note'));
  for(const [index,{pipes:items,controls}] of segments.entries()){
    const absolute=items[0].chainageStart!==null;
    const distance=items.at(-1).x2,origin=items[0].chainageStart||0;
    if(!Number.isFinite(distance)||distance<=0){view.append(inspectorElement('p','The source conduit lengths cannot be plotted. Review length units and values.'));continue;}
    const horizontal=R.profileAxis(0,distance,settings.zoomX,settings.panX),vertical=R.profileAxis(low,high,settings.zoomY,settings.panY);
    const x=value=>76+(value-horizontal.low)/horizontal.span*774,y=value=>245-(value-vertical.low)/vertical.span*213;
    const label=(absolute?'Chainage ':'Local distance ')+f(origin+horizontal.low,2)+' to '+f(origin+horizontal.high,2)+' m';
    const svg=svgElement('svg',{viewBox:'0 0 890 285','aria-label':label,role:'group'});
    const clipId='nsProfileClip-'+phase+'-'+index,clip=svgElement('clipPath',{id:clipId}),defs=svgElement('defs');
    clip.append(svgElement('rect',{x:76,y:27,width:774,height:220}));defs.append(clip);svg.append(defs);
    const plot=svgElement('g',{'clip-path':'url(#'+clipId+')'}),linkLayer=svgElement('g'),pointLayer=svgElement('g');
    plot.append(linkLayer,pointLayer);
    for(let i=0;i<=5;i++){
      const level=vertical.low+vertical.span*i/5,offset=horizontal.low+horizontal.span*i/5;
      svg.append(svgElement('path',{d:'M76 '+y(level)+'H850 M'+x(offset)+' 245V32',stroke:'#dfe6eb',fill:'none'}),
        svgElement('text',{x:68,y:y(level)+4,'text-anchor':'end'},f(level,2)),
        svgElement('text',{x:x(offset),y:265,'text-anchor':'middle'},f(origin+offset,2)));
    }
    svg.append(svgElement('text',{x:12,y:18},'Level (m'+(datum?' '+datum:'')+')'),svgElement('text',{x:460,y:283,'text-anchor':'middle'},absolute?'Chainage (m)':'Local distance (m)'),
      svgElement('text',{x:850,y:18,'text-anchor':'end'},'Vertical exaggeration '+f((213/vertical.span)/(774/horizontal.span),2)+'×'));
    const drawnLevels=new Set(),drawnProposals=new Set(),drawnNodes=new Set(),structures=new Map();
    const proposalMark=(station,level,id,location,ground,aboveSoffit)=>{
      const mark=svgElement('circle',{'data-ns-profile-proposal':location,cx:x(station),cy:y(level),r:7,fill:'none',stroke:'#8f397c','stroke-width':2});
      const freeboard=Number.isFinite(ground)?' · ground freeboard '+f(ground-level,3)+' m':'';
      const head=aboveSoffit>0?' · head above soffit '+f(aboveSoffit,3)+' m':'';
      mark.append(svgElement('title',{},id+' · '+model.proposal.scenario+' proposal '+location+' level '+f(level,3)+' m'+freeboard+head));
      return mark;
    };
    for(const {step,station} of controls){
      if(station<horizontal.low||station>horizontal.high)continue;
      if(!structures.has(station))structures.set(station,[]);
      structures.get(station).push(step);
    }
    for(const [station,items] of structures){
      for(const [index,step] of items.entries()){
        const coordinate=x(station),badgeX=coordinate+(index-(items.length-1)/2)*19;
        const controls=step.controlLevels||[];
        const type=step.type.slice(3).replaceAll('_',' '),levels=controls.map(control=>control.label+' '+f(control.value,3)+' m');
        const caption=[step.name,type,...levels].join(' · '),marker=svgElement('g',{'data-ns-profile-link':step.id,
          'data-ns-profile-structure':step.type,tabindex:0,role:'button','aria-label':'Inspect '+caption});
        marker.append(svgElement('title',{},caption),
          svgElement('path',{d:'M'+badgeX+' 46L'+coordinate+' 55',stroke:'#6947a1',fill:'none'}),
          svgElement('rect',{x:badgeX-8,y:29,width:16,height:17,rx:4,fill:'#6947a1'}),
          svgElement('text',{x:badgeX,y:41,'text-anchor':'middle',fill:'#fff','font-size':10},structureCodes[step.type]||'C'));
        for(const control of controls){
          const level=svgElement('line',{'data-ns-profile-control-level':'',x1:coordinate-8,x2:coordinate+8,
            y1:y(control.value),y2:y(control.value),stroke:'#6947a1','stroke-width':2});
          level.append(svgElement('title',{},control.label+' '+f(control.value,3)+' m'));marker.append(level);
        }
        marker.onclick=()=>selectConnector(step.id);
        marker.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();marker.onclick();}};
        pointLayer.append(marker);
      }
    }
    for(const step of items){
      const visible=step.x2>=horizontal.low&&step.x1<=horizontal.high;
      const group=svgElement('g',{'data-ns-profile-link':step.id,tabindex:visible?0:-1,role:'button','aria-label':'Inspect '+step.name});
      const attrs={fill:'none','stroke-width':2};
      const line=(a,b,stroke,dash)=>a===null||b===null?null:
        svgElement('path',{...attrs,d:'M'+x(step.x1)+' '+y(a)+'L'+x(step.x2)+' '+y(b),stroke,'stroke-dasharray':dash||''});
      group.append(svgElement('title',{},step.name),svgElement('rect',{x:x(step.x1),y:28,width:Math.max(3,x(step.x2)-x(step.x1)),height:220,fill:'transparent'}));
      if(settings.groundShading&&step.groundFrom!==null&&step.groundTo!==null){
        group.append(svgElement('path',{'data-ns-profile-shading':'',d:'M'+x(step.x1)+' '+y(step.groundFrom)+'L'+x(step.x2)+' '+y(step.groundTo)+
          'V245H'+x(step.x1)+'Z',fill:'#b9905b',opacity:.18,'pointer-events':'none'}));
      }
      for(const path of [line(step.groundFrom,step.groundTo,'#936329'),
        step.height!==null&&step.us!==null&&step.ds!==null?line(step.us+step.height,step.ds+step.height,'#477384','3 3'):null,
        line(step.us,step.ds,'#14527c')])if(path)group.append(path);
      const samples=conduitLevels.get(step.id);
      if(samples){
        const hydraulic=R.conduitEndProfile(step,samples.upstream,samples.downstream);
        group.dataset.nsProfileHydraulic=hydraulic.status;
        const status={'sample-missing':'An exact end level is missing','geometry-unavailable':'Barrel geometry is unavailable',
          'dry-or-transition':'An end is at or below invert',surcharge:'An end level is above soffit',wet:'Both ends above invert'}[hydraulic.status];
        group.setAttribute('aria-label','Inspect '+step.name+' · '+status);
        group.append(svgElement('desc',{},status));
        if(hydraulic.waterTop){
          const top=[{x:x(step.x1),y:y(hydraulic.waterTop[0])}];
          if(hydraulic.cap)top.push({x:x(step.x1+hydraulic.cap.fraction*(step.x2-step.x1)),y:y(hydraulic.cap.level)});
          top.push({x:x(step.x2),y:y(hydraulic.waterTop[1])});
          group.append(svgElement('polygon',{'data-ns-profile-water':'',fill:'#72bde8','fill-opacity':.5,'pointer-events':'none',
            points:polygonPoints([...top,{x:x(step.x2),y:y(step.ds)},{x:x(step.x1),y:y(step.us)}])}));
          const grade=line(samples.upstream,samples.downstream,'#126aa5',hydraulic.status==='surcharge'?'5 3':'');
          grade.setAttribute('data-ns-profile-grade','');
          grade.append(svgElement('title',{},'Straight depiction between reported conduit-end levels'));
          group.append(grade);
        }
        for(const [index,end] of hydraulic.ends.entries()){
          if(end.level===null)continue;
          const marker=svgElement('circle',{'data-ns-profile-end-level':index===0?'upstream':'downstream',cx:x(index===0?step.x1:step.x2),
            cy:y(end.level),r:4.5,fill:'#126aa5',stroke:'#fff','stroke-width':1.5});
          const freeboard=end.freeboard===null?'':' · ground freeboard '+f(end.freeboard,3)+' m';
          const head=end.aboveSoffit>0?' · head above soffit '+f(end.aboveSoffit,3)+' m':'';
          marker.append(svgElement('title',{},step.name+' · '+(index===0?'Upstream':'Downstream')+' reported level '+f(end.level,3)+' m'+freeboard+head));
          group.append(marker);
        }
      }
      const proposal=proposedConduitLevels.get(step.id);
      if(proposal){
        const evidence=R.conduitEndProfile(step,proposal.upstream,proposal.downstream);
        if(evidence.waterTop){
          const grade=line(proposal.upstream,proposal.downstream,'#8f397c','6 3');
          const head=Math.max(...evidence.ends.map(end=>end.aboveSoffit||0));
          grade.dataset.nsProfileProposalGrade='';
          grade.append(svgElement('title',{},step.name+' · '+model.proposal.scenario+' · Straight line between reported wet ends'+
            (head>0?' · maximum reported end head above soffit '+f(head,3)+' m':'')));
          group.append(grade);
        }
        for(const [index,end] of evidence.ends.entries()){
          if(end.level===null)continue;
          const upstream=index===0;
          group.append(proposalMark(upstream?step.x1:step.x2,end.level,step.name,upstream?'upstream':'downstream',
            upstream?step.groundFrom:step.groundTo,end.aboveSoffit));
        }
      }
      for(const [station,level] of [[step.x1,step.us],[step.x2,step.ds]])if(level!==null)
        group.append(svgElement('circle',{cx:x(station),cy:y(level),r:3,fill:'#14527c'}));
      const nameWidth=step.name.length*6+12;
      if(visible&&x(step.x2)-x(step.x1)>=nameWidth)group.append(svgElement('text',{x:(x(step.x1)+x(step.x2))/2,y:235,
        'text-anchor':'middle',fill:'#334e60','font-size':10,'pointer-events':'none'},step.name));
      for(const [nodeId,station,ground,floor,roof] of [[step.from,step.x1,step.groundFrom,step.chamberFrom,step.roofFrom],
        [step.to,step.x2,step.groundTo,step.chamberTo,step.roofTo]]){
        if(!drawnNodes.has(nodeId)&&Number.isFinite(ground)&&Number.isFinite(floor)&&floor<=ground&&
          station>=horizontal.low&&station<=horizontal.high&&floor<=vertical.high&&ground>=vertical.low){
          drawnNodes.add(nodeId);
          const chamber=Number.isFinite(roof)&&roof>=floor&&roof<=ground;
          const shaft=svgElement('g',{'data-ns-profile-node':nodeId,tabindex:0,role:'button',
            'aria-label':'Inspect '+nodeId+' · ground '+f(ground,3)+' m · chamber floor '+f(floor,3)+' m'+(chamber?' · chamber roof '+f(roof,3)+' m':'')});
          shaft.append(svgElement('title',{},nodeId+' · Source elevations · symbolic width'),
            svgElement('rect',{x:x(station)-5,y:y(ground),width:10,height:Math.max(2,y(chamber?roof:floor)-y(ground)),fill:'#fff',stroke:'#637987'}));
          if(chamber)shaft.append(svgElement('rect',{'data-ns-profile-chamber':'',x:x(station)-9,y:y(roof),width:18,
            height:Math.max(2,y(floor)-y(roof)),fill:'#f4f8fb',stroke:'#637987'}));
          shaft.onclick=()=>{if(network.nodes.some(node=>node.id===nodeId))selectPoint(nodeId);};
          shaft.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();shaft.onclick();}};
          pointLayer.append(shaft);
        }
        const proposalNode=proposalLevels.get(nodeId);
        if(proposalNode?.location==='node'&&!drawnProposals.has(nodeId)){
          drawnProposals.add(nodeId);pointLayer.append(proposalMark(station,proposalNode.level,nodeId,'node',ground));
        }
        const level=imported.get(nodeId);
        if(!Number.isFinite(level)||drawnLevels.has(nodeId))continue;
        drawnLevels.add(nodeId);
        const dot=svgElement('circle',{cx:x(station),cy:y(level),r:5,fill:'#1a62a0',stroke:'#fff','stroke-width':1.5});
        const freeboard=Number.isFinite(ground)?' · ground freeboard '+f(ground-level,3)+' m':'';
        dot.append(svgElement('title',{},nodeId+' · modelled node level '+f(level,3)+' m'+freeboard));pointLayer.append(dot);
      }
      group.onclick=()=>{if(network.edges.some(edge=>edge.id===step.id))selectConnector(step.id);};
      group.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();group.onclick();}};
      linkLayer.append(group);
    }
    svg.append(plot);
    view.append(svg);
  }
}
function renderProfileControls(){
  const view=routeDraft.profileView;
  $('nsProfileZoomX').value=view.zoomX;$('nsProfileZoomY').value=view.zoomY;
  $('nsProfilePanX').value=view.panX;$('nsProfilePanY').value=view.panY;
  $('nsProfilePanX').disabled=view.zoomX===1;$('nsProfilePanY').disabled=view.zoomY===1;
  $('nsProfileShading').checked=view.groundShading;
  $('nsProfilePlot').toggleAttribute('data-ns-profile-pannable',view.zoomX>1||view.zoomY>1);
  $('nsProfileSvgDownload').disabled=!$('nsProfilePlot').querySelector('svg');
  const geometry=reviewedRouteGeometry();
  $('nsClearRevisedGeometry').hidden=!geometry;
  $('nsRevisedGeometryInfo').textContent=geometry?'Revised geometry '+geometry.revision+' · '+geometry.datum+' · Route SHA-256 '+geometry.sha256+'. Chainage and elevation scales are shown independently.':'';
}
function exportProfileSvg(){
  plotProfile(routeDraft.steps);
  const graphs=[...$('nsProfilePlot').querySelectorAll('svg')];
  if(!graphs.length)return;
  const geometry=reviewedRouteGeometry(),model=profileModelForView();
  const stamp=model?'Recorded levels · '+model.time+' (project clock) · '+model.datum:'';
  const titled=Boolean(geometry),panelHeight=titled?309:285,header=stamp?26:0,height=header+panelHeight*graphs.length;
  const output=svgElement('svg',{width:890,height,viewBox:'0 0 890 '+height,fill:'#182732','font-family':'sans-serif','font-size':13});
  output.append(svgElement('title',{},'Hydra Bench route long section'),svgElement('rect',{width:890,height,fill:'#fff'}));
  if(geometry)output.append(svgElement('desc',{},'Revised geometry '+geometry.revision+' · '+geometry.datum+' · Route SHA-256 '+geometry.sha256));
  if(stamp)output.append(svgElement('text',{x:76,y:17},stamp));
  for(const [index,graph] of graphs.entries()){
    const top=header+index*panelHeight;
    if(titled)output.append(svgElement('text',{x:76,y:top+17},graph.closest('section').querySelector('h4').textContent));
    const copy=graph.cloneNode(true);copy.setAttribute('x',0);copy.setAttribute('y',top+(titled?24:0));copy.setAttribute('width',890);copy.setAttribute('height',285);
    output.append(copy);
  }
  downloadBlob('hydra-long-section.svg',new XMLSerializer().serializeToString(output),'image/svg+xml');
}
function renderProfileModel(){
  const active=simulationView?.profile(),model=profileModelForView();
  const routeNodes=new Set(routeDraft.steps.flatMap(step=>[step.from,step.to]));
  const routeLinks=new Set(routeDraft.steps.map(step=>step.id));
  let comparison='';
  if(model?.proposal){
    const proposal=model.proposal;
    const count=proposal.ends?proposal.ends.filter(row=>routeLinks.has(row.edge)).flatMap(end=>[end.upstream,end.downstream]).filter(Number.isFinite).length:
      proposal.levels.filter(row=>routeNodes.has(row.id)).length;
    comparison=' '+proposal.scenario+' exact proposal level samples: '+count+'. '+(proposal.geometry?
      'The revised plot uses its reviewed conduit geometry and source levels.':
      'Purple rings mark available proposal levels.'+
      (proposal.ends?' The dashed purple line joins wet proposal ends on the reviewed shared geometry.':''));
  }
  if(model?.proposalReviewPending)comparison=' Review the shared geometry and apply the proposal again for this route.';
  $('nsProfileModelLegend').hidden=!model;
  $('nsProfileModelLegend').textContent=model?.ends?'Conduit-end level and supported water fill':'Modelled node level';
  if(model?.ends){
    const byEdge=new Map(model.ends.map(item=>[item.edge,item]));
    const assessments=routeDraft.steps.filter(step=>byEdge.has(step.id)).map(step=>{
      const result=byEdge.get(step.id);return R.conduitEndProfile(step,result.upstream,result.downstream);
    });
    const count=assessments.flatMap(item=>item.ends).filter(end=>Number.isFinite(end.level)).length;
    const missing=assessments.filter(item=>item.status==='sample-missing').length,dry=assessments.filter(item=>item.status==='dry-or-transition').length;
    const geometry=assessments.filter(item=>item.status==='geometry-unavailable').length;
    $('nsProfileModelInfo').textContent=model.scenario+' · '+model.time+' model clock · '+model.datum+' · Exact conduit-end level samples: '+
      count+'. '+(missing?missing+' link(s) with missing end levels. ':'')+(dry?dry+' link(s) at or below invert at an end. ':'')+
      (geometry?geometry+' link(s) with unavailable geometry. ':'')+'Straight lines join supported endpoint levels. '+
      'The displayed line does not calculate levels within a conduit.'+comparison;
    return;
  }
  $('nsProfileModelInfo').textContent=model?model.scenario+' · '+model.time+' model clock · '+model.datum+
    ' · Exact node level samples: '+model.values.filter(row=>routeNodes.has(row.node)).length+(active?' in simulation playback.':
      ' from '+new Set(model.values.map(row=>row.source)).size+' sources.')+comparison : '';
}

function mountGeometryView(){
  $('nsLayout').insertAdjacentHTML('beforebegin','<details id="nsGeometryView" class="ns-review-section"><summary>Conduit geometry layer</summary>'+
    '<form class="ns-review-actions"><label>Source geometry quantity<select name="quantity" aria-label="Source geometry quantity">'+
    '<option value="gradient">Conduit gradient</option><option value="width">Conduit width</option><option value="height">Conduit height</option></select></label>'+
    '<label>Geometry scale minimum<input name="low" type="number" step="any" required></label>'+
    '<label>Geometry scale maximum<input name="high" type="number" step="any" required></label>'+
    '<button type="submit">Apply geometry layer</button><button type="button" id="nsGeometryClear" disabled>Remove geometry layer</button></form>'+
    '<p id="nsGeometryStatus" role="status"></p><div id="nsGeometryLegend" class="ns-simulation-legend" hidden></div></details>');
  const view=$('nsGeometryView'),form=view.querySelector('form'),{quantity,low,high}=form.elements;
  const clear=$('nsGeometryClear'),note=$('nsGeometryStatus'),legend=$('nsGeometryLegend');
  const scales={gradient:[-.005,.02,'m/m'],width:[0,1500,'mm'],height:[0,1500,'mm']};
  let applied=null;
  const eligible=()=>network.contextFormat==='icm-csv-v1'&&!editing&&!inOverview();
  function defaults(){[low.value,high.value]=scales[quantity.value];}
  function refresh(){
    form.hidden=!eligible();legend.hidden=!eligible()||!applied;clear.disabled=!applied;
    if(!eligible())note.textContent='Open a native ICM network in detailed Explore mode to review conduit geometry.';
    else if(!applied)note.textContent='Select an imported conduit dimension or gradient. Choose a scale in the displayed units.';
    else note.textContent='Negative gradient means the downstream invert is above the upstream invert when derived from source levels.';
  }
  function reset(show=true){applied=null;refresh();if(show)renderCanvas();}
  quantity.onchange=()=>{defaults();reset();};
  clear.onclick=()=>reset();
  form.onsubmit=event=>{
    event.preventDefault();if(!eligible())return;
    const limits=[low.valueAsNumber,high.valueAsNumber];
    if(!(limits[0]<limits[1])||!Number.isFinite(limits[1]-limits[0])){
      note.textContent='Enter a finite geometry scale maximum greater than its minimum.';return;
    }
    const name=quantity.selectedOptions[0].textContent;
    simulationView?.reset('Conduit geometry layer is active. Apply simulation results to switch views.');
    applied={quantity:quantity.value,name,low:limits[0],high:limits[1]};
    renderBandLegend(legend,name+' ('+scales[quantity.value][2]+')',...limits,'Dashed conduit: source value unavailable');
    refresh();renderCanvas();
  };
  defaults();refresh();geometryView={current:()=>eligible()?applied:null,refresh,reset};
}

function mountSimulationView(){
  $('nsLayout').insertAdjacentHTML('beforebegin','<details id="nsSimulation" class="ns-review-section">'+
    '<summary>Simulation playback</summary><p id="nsSimulationStatus" role="status"></p>'+
    '<button type="button" id="nsIndexResults">Open simulation results</button>'+
    '<form id="nsSimulationSetup" hidden><div class="ns-review-actions">'+
    '<label>Filter playback events<select name="event" aria-label="Filter playback events"></select></label>'+
    '<label>Indexed results<select name="source" required></select></label>'+
    '<label id="nsSimulationLayerChoice" hidden>Result layer<select name="metric" aria-label="Result layer"></select></label>'+
    '<label>Scale minimum<input name="minimum" type="number" step="any" required></label>'+
    '<label>Scale maximum<input name="maximum" type="number" step="any" required></label>'+
    '<label id="nsSimulationDirectionBasis" hidden>Positive link flow points<select name="flowDirection" aria-label="Positive link flow points">'+
    '<option value="">Hide recorded arrows</option><option value="upstream-to-downstream">Upstream to downstream</option>'+
    '<option value="downstream-to-upstream">Downstream to upstream</option></select></label>'+
    '<label id="nsSimulationFlowQuantity" hidden>Flow display<select name="flowQuantity" aria-label="Flow display">'+
    '<option value="flow">Recorded flow</option><option value="capacity">Full-capacity utilisation</option></select></label>'+
    '<label id="nsSimulationLevelQuantity" hidden>Level display<select name="levelQuantity" aria-label="Level display">'+
    '<option value="level">Recorded level</option><option value="freeboard">Ground-level freeboard</option></select></label>'+
    '<label id="nsSimulationDatum" hidden>Geometry datum<input name="datum" maxlength="128"></label>'+
    '<label id="nsSimulationCompanion" hidden>Other conduit end<select name="companion" aria-label="Other conduit end"></select></label>'+
    '<label id="nsSimulationProposal" hidden>Proposal results<select name="proposal" aria-label="Proposal results"></select></label></div>'+
    '<p id="nsSimulationSourceInfo"></p><p><label><input name="confirm" type="checkbox" required> I reviewed the model revision, typed asset mappings and result convention against this network</label></p>'+
    '<p id="nsSimulationComparison" hidden><span id="nsSimulationProposalInfo"></span><br><label><input name="verifyProposal" type="checkbox"> The proposal uses these same assets, event, result convention and project clock</label></p>'+
    '<div id="nsSimulationProposalProfile" class="ns-review-actions" hidden><label id="nsSimulationProposalEnd">Proposal other conduit end'+
    '<select name="proposalEnd" aria-label="Proposal other conduit end"></select></label><label><input name="verifyProfileGeometry" type="checkbox"> <span id="nsSimulationGeometryText">Both revisions use the displayed route geometry and datum</span></label></div>'+
    '<div class="ns-review-actions"><button type="submit">Apply results layer</button><button type="button" id="nsClearSimulation" disabled>Remove results layer</button></div></form>'+
    '<div id="nsSimulationTransport" class="ns-review-actions" hidden><label>Simulation sample<input id="nsSimulationTime" type="range" min="0" max="0" step="1" value="0"></label>'+
    '<button type="button" id="nsSimulationBack">Previous sample</button><button type="button" id="nsSimulationPlay" aria-pressed="false">Play</button><button type="button" id="nsSimulationNext">Next sample</button>'+
    '<label>Samples per second<select id="nsSimulationSpeed"><option>1</option><option selected>2</option><option>5</option></select></label>'+
    '<label id="nsSimulationShadeChoice" hidden>Map shading<select id="nsSimulationShade" aria-label="Map shading"><option value="primary">Baseline</option>'+
    '<option value="proposal">Proposal</option><option value="difference">Proposal minus baseline</option></select></label>'+
    '<label>Map results<select id="nsSimulationDisplay" aria-label="Map results"><option value="sample">Instantaneous sample</option>'+
    '<option value="min">Independent minimum</option><option value="max">Independent maximum</option></select></label>'+
    '<button type="button" id="nsSimulationCancelExtrema" hidden>Cancel extrema scan</button></div>'+
    '<div id="nsSimulationWindow" hidden></div><p id="nsSimulationStamp"></p><div id="nsSimulationLegend" class="ns-simulation-legend" hidden></div></details>');
  const panel=$('nsSimulation'),form=$('nsSimulationSetup'),fields=form.elements;
  const note=$('nsSimulationStatus'),stamp=$('nsSimulationStamp'),legend=$('nsSimulationLegend');
  const transport=$('nsSimulationTransport'),time=$('nsSimulationTime'),play=$('nsSimulationPlay');
  const back=$('nsSimulationBack'),next=$('nsSimulationNext'),clear=$('nsClearSimulation');
  const titles={level:'Level',flow:'Flow',velocity:'Velocity',depth:'Depth','total-head':'Total head',
    'flood-depth':'Flood depth','flood-volume':'Flood volume','storage-volume':'Storage volume','surcharge-state':'Surcharge state'};
  const shade=$('nsSimulationShade'),display=$('nsSimulationDisplay'),cancelExtrema=$('nsSimulationCancelExtrema');
  let layer=null,profile=null,generation=0,playing=0,timer=null,groups=new Map(),sampleWindow=null,layerChoices=new Map(),companions=new Map(),proposals=new Map(),proposalEnds=new Map(),extremaJob=null;
  let viewportPaint=null;
  const session=()=>window.HydraResultsWorkspace?.session;
  const sources=()=>session()?.sources()||[];
  const candidate=()=>sources().find(item=>item.sourceId===Number(fields.source.value));
  const eligible=()=>network.contextFormat==='icm-csv-v1'&&!editing&&!inOverview();
  const ranges={flow:[-1,1],velocity:[-3,3],level:[0,10],'total-head':[0,10]};
  const selectedColumns=()=>layerChoices.get(fields.metric.value)||[];
  const derivedFreeboard=()=>fields.levelQuantity.value==='freeboard'&&selectedColumns()[0]?.quantity==='level';
  const derivedCapacity=()=>fields.flowQuantity.value==='capacity'&&selectedColumns()[0]?.quantity==='flow';
  function stop(){
    ++playing;clearTimeout(timer);timer=null;play.textContent='Play';play.setAttribute('aria-pressed','false');
  }
  const formatClock=value=>new Date(value).toISOString().slice(0,-1).replace('T',' ');
  function cancelScan(){
    if(extremaJob)session()?.cancelRequest(extremaJob.id);
    extremaJob=null;cancelExtrema.hidden=true;
  }
  function redrawProfile(){
    if($('nsProfile').hidden||!routeDraft.steps.length)return;
    const active=document.activeElement;
    const focused=active.closest('#nsProfilePlot [data-ns-profile-link],#nsProfilePlot [data-ns-profile-node]');
    const kind=focused?.hasAttribute('data-ns-profile-link')?'nsProfileLink':'nsProfileNode';
    const variant=focused?.closest('[data-ns-profile-variant]')?.dataset.nsProfileVariant;
    plotProfile(routeDraft.steps);renderProfileModel();
    if(focused)[...$('nsProfilePlot').querySelectorAll('[tabindex="0"]')].find(item=>item.dataset[kind]===focused.dataset[kind]&&
      item.closest('[data-ns-profile-variant]')?.dataset.nsProfileVariant===variant)?.focus({preventScroll:true});
  }
  function removeMarks(){
    for(const group of groups.values()){
      group.removeAttribute('data-ns-sample');
      showRecordedDirection(group,undefined);
      group.querySelector('[data-ns-result-marker]')?.remove();
      group.querySelector('[data-ns-result-value]')?.remove();
      if(group.dataset.nsSimulationLabel){group.setAttribute('aria-label',group.dataset.nsSimulationLabel);delete group.dataset.nsSimulationLabel;}
    }
    groups.clear();
  }
  function readGroups(){
    groups.clear();
    for(const group of $('nsSvg').children){
      const {nsNode,nsEdge}=group.dataset;
      if(nsNode)groups.set(R.refKey({kind:'node',id:nsNode}),group);
      if(nsEdge)groups.set(R.refKey({kind:'edge',id:nsEdge}),group);
    }
  }
  function selectedFrameColumns(current){
    const keys=new Set(groups.keys());
    if(current.geometryDatum){
      for(const {id,from,to} of routeDraft.steps){
        keys.add(R.refKey({kind:'edge',id}));
        keys.add(R.refKey({kind:'node',id:from}));
        keys.add(R.refKey({kind:'node',id:to}));
      }
    }
    return [...keys].flatMap(key=>current.columnsByAsset.get(key)??[]).sort((a,b)=>a-b);
  }
  function refreshViewportFrame(){
    if(viewportPaint!==null||display.value!=='sample')return;
    viewportPaint=requestAnimationFrame(()=>{
      viewportPaint=null;
      if(!layer||display.value!=='sample')return;
      const indexes=selectedFrameColumns(layer),previous=layer.requested;
      if(!previous||indexes.length!==previous.length||indexes.some((index,i)=>index!==previous[i]))void drawFrame(indexes);
    });
  }
  function decorate(rebuild=false){
    if(!layer){if(rebuild)groups.clear();return;}
    const extrema=display.value!=='sample';
    if(rebuild||!groups.size)readGroups();
    if(rebuild)refreshViewportFrame();
    if(extrema?!layer.envelopes:!layer.values)return;
    for(const [key,group] of groups){
      const index=layer.columnsByAsset.get(key);
      if(index===undefined||!extrema&&!Object.hasOwn(layer.values,index))continue;
      const column=layer.columns[index],match=layer.matches.get(column.series);
      const ground=layer.grounds?.[index],capacity=layer.capacities?.values[index],proposalCapacity=layer.proposalCapacities?.values[index];
      const quantity=layer.grounds?'Ground-level freeboard':layer.capacities?'Full-capacity utilisation':titles[column.quantity];
      const project=(value,full)=>layer.grounds?R.groundFreeboard(ground,value):layer.capacities?R.capacityUtilisation(value,full):value;
      const raw=layer.values?.[index],rawProposal=layer.proposedValues?.[index];
      const value=project(raw,capacity),proposed=project(rawProposal,proposalCapacity);
      const measure=(sample,difference=false)=>Number.isFinite(sample)?f(sample,6)+' '+(layer.capacities?difference?'percentage points':'%':column.unit):'Missing sample';
      let shaded,text;
      if(extrema){
        const extreme=layer.envelopes[index],mode=display.value;
        const reported=layer.grounds?(mode==='min'?'max':'min'):mode;
        shaded=project(extreme[reported],capacity);
        const at=Number.isFinite(shaded)?extreme[reported+'Time']:null;
        text=display.selectedOptions[0].textContent+' '+measure(shaded)+(at===null?'':' at '+formatClock(at)+' (project clock)')+
          ' · '+(layer.grounds&&!Number.isFinite(ground)||layer.capacities&&!(capacity>0)?0:extreme.valid)+' of '+extreme.samples+' valid samples';
      }else{
        const diff=(layer.grounds||layer.capacities)?(Number.isFinite(value)&&Number.isFinite(proposed)?proposed-value:null):layer.difference?.[index];
        text=layer.proposal?'Baseline '+measure(value)+' · Proposal '+measure(proposed)+
          ' · Proposal minus baseline '+measure(diff,true):measure(value);
        shaded={primary:value,proposal:proposed,difference:diff}[shade.value];
      }
      if(layer.grounds)text+=Number.isFinite(ground)?' · source ground '+f(ground,6)+' m · '+layer.geometryDatum:' · source ground unavailable';
      if(layer.capacities){
        const compareProposal=!extrema&&shade.value==='proposal';
        const currentCapacity=compareProposal?proposalCapacity:capacity;
        const currentFlow=compareProposal?rawProposal:raw;
        text+=Number.isFinite(currentCapacity)&&currentCapacity>0?' · imported PFC '+f(currentCapacity,6)+' m³/s':
          ' · positive imported full capacity unavailable';
        if(!extrema&&Number.isFinite(currentFlow))text+=' · recorded flow '+f(currentFlow,6)+' m³/s';
      }
      const direction=layer.flowDirection&&!extrema&&shade.value!=='difference'?
        (R.recordedFlowDirection(shade.value==='proposal'?rawProposal:raw,layer.flowDirection)||'missing'):null;
      showRecordedDirection(group,direction||undefined);
      if(direction&&direction!=='missing')text+=' · '+({forward:'recorded upstream to downstream',reverse:'recorded downstream to upstream',still:'zero net flow'}[direction]);
      text=quantity+' · '+text+(column.location!=='node'?' · '+column.location+' end':'');
      group.dataset.nsSample=R.simulationBand(shaded,layer.low,layer.high);
      if(!group.dataset.nsSimulationLabel)group.dataset.nsSimulationLabel=group.getAttribute('aria-label');
      group.setAttribute('aria-label',group.dataset.nsSimulationLabel+' · '+text);
      let annotation=group.querySelector('[data-ns-result-value]');
      if(!annotation){
        annotation=svgElement('title',{'data-ns-result-value':''});
        group.prepend(annotation);
        if(match.kind==='node')group.append(svgElement('circle',{'data-ns-result-marker':'',cx:-23,cy:-18,r:6}));
      }
      annotation.textContent=text;
    }
  }
  function reset(message=''){
    const wasApplied=Boolean(profile);
    if(viewportPaint!==null){cancelAnimationFrame(viewportPaint);viewportPaint=null;}
    stop();cancelScan();++generation;layer=null;profile=null;removeMarks();
    sampleWindow?.setSource(null);
    transport.hidden=true;legend.hidden=true;stamp.textContent='';clear.disabled=true;shade.value='primary';display.value='sample';
    fields.confirm.checked=false;fields.verifyProposal.checked=false;fields.verifyProfileGeometry.checked=false;
    if(message&&panel.open)note.textContent=message;
    if(wasApplied)redrawProfile();
  }
  function selectSource(){
    const source=candidate();
    layerChoices=R.simulationLayers(source?.columns||[]);
    fields.metric.replaceChildren(...[...layerChoices].map(([key,[column]])=>new Option(titles[column.quantity]+' · '+column.location+
      ' · '+column.unit+(column.datum?' · '+column.datum:''),key)));
    $('nsSimulationLayerChoice').hidden=layerChoices.size<2;
    refreshLayer();
  }
  function refreshLayer(){
    const source=candidate(),column=selectedColumns()[0];
    fields.confirm.checked=false;fields.datum.value='';
    $('nsSimulationDatum').hidden=column?.quantity!=='level';
    $('nsSimulationLevelQuantity').hidden=column?.quantity!=='level';fields.levelQuantity.value='level';
    $('nsSimulationDirectionBasis').hidden=column?.quantity!=='flow'||column?.asset.kind!=='link';
    fields.flowQuantity.value='flow';refreshFlowQuantity(source,column);
    fields.flowDirection.value='';
    const canPair=column?.quantity==='level'&&column.asset.kind==='link';
    $('nsSimulationCompanion').hidden=!canPair;
    fields.companion.value='';refreshCompanions(source,column);
    fields.proposal.value='';refreshProposals(source);
    if(!source||!column){$('nsSimulationSourceInfo').textContent='';return;}
    const [low,high]=ranges[column.quantity]||[0,1];
    fields.minimum.value=low;fields.maximum.value=high;
    $('nsSimulationSourceInfo').textContent=source.simulation+' · Revision '+source.modelRevision+' · '+source.event+
      ' · '+titles[column.quantity]+' ('+column.unit+')'+(column.location==='node'?'':' · '+column.location+' end')+
      (column.datum?' · '+column.datum:'')+(canPair?' · For paired profiles, review both ends on this simulation clock.':'');
  }
  function refreshFlowQuantity(source,column){
    $('nsSimulationFlowQuantity').hidden=column?.quantity!=='flow'||column?.asset.kind!=='link';
    fields.flowQuantity.options[1].disabled=!source?.capacity;
    if(!source?.capacity)fields.flowQuantity.value='flow';
  }
  function matchingEnds(source,column){
    const candidates=new Map();
    if(source&&column?.quantity==='level'&&column.asset.kind==='link'){
      for(const entry of sources()){
        if(!['simulation','modelRevision','scenario','event','temporalSupport'].every(key=>entry[key]===source[key]))continue;
        const other=entry.columns.filter(item=>item.asset.kind==='link'&&item.quantity==='level'&&item.location!==column.location&&
          item.unit===column.unit&&item.datum===column.datum);
        if(other.length)candidates.set(entry.sourceId,{source:entry,columns:other});
      }
    }
    return candidates;
  }
  function chooseCompanion(control,candidates){
    const wanted=Number(control.value);
    control.replaceChildren(new Option('Only the selected end',''),...[...candidates.values()].map(item=>
      new Option(item.source.filename+' · '+item.columns[0].location+' end',item.source.sourceId)));
    if(candidates.has(wanted))control.value=String(wanted);
  }
  function refreshCompanions(source,column){
    companions=matchingEnds(source,column);
    chooseCompanion(fields.companion,companions);
  }
  function showProposal(){
    const source=proposals.get(Number(fields.proposal.value)),proposal=source?.source,column=source?.columns[0];
    const reviewed=reviewedRouteGeometry();
    $('nsSimulationComparison').hidden=!proposal;
    $('nsSimulationProposalProfile').hidden=!(column?.quantity==='level'&&(column.asset.kind==='link'||reviewed));
    proposalEnds=matchingEnds(proposal,column);
    chooseCompanion(fields.proposalEnd,proposalEnds);
    $('nsSimulationProposalEnd').hidden=!proposalEnds.size;
    $('nsSimulationGeometryText').textContent=reviewed?
      'The proposal uses the separately reviewed revision geometry and datum':
      'Both revisions use the displayed route geometry and datum';
    fields.verifyProposal.required=Boolean(proposal);
    $('nsSimulationProposalInfo').textContent=proposal?'Proposal '+proposal.scenario+' · Simulation '+proposal.simulation+
      ' · Revision '+proposal.modelRevision+' · '+proposal.event+'. Only exact shared timestamps are compared.'+
      (derivedFreeboard()?' Confirm the proposed geometry has the same ground elevations and datum.':'')+
      (derivedCapacity()?' The proposal requires its own reviewed full-capacity table.':''):'';
  }
  function refreshProposals(source){
    const wanted=fields.proposal.value;
    proposals=new Map();
    for(const entry of sources()){
      const columns=R.compatibleSimulationColumns(source,selectedColumns(),entry);
      if(columns.length)proposals.set(entry.sourceId,{source:entry,columns});
    }
    fields.proposal.replaceChildren(new Option('No comparison',''),...[...proposals.values()].map(item=>
      new Option(item.source.scenario+' · '+item.source.filename,item.source.sourceId)));
    if(proposals.has(Number(wanted)))fields.proposal.value=wanted;
    $('nsSimulationProposal').hidden=!proposals.size;
    showProposal();
  }
  function refreshSources(){
    const wanted=fields.source.value,available=sources();
    const removed=layer&&[layer.source,layer.companion?.source,layer.proposal?.source,layer.proposal?.companion?.source].some(source=>source&&!available.includes(source));
    if(removed)reset('The results source was removed. Import it again to resume.');
    const filtered=window.HydraResultsWorkspace?.eventSources(fields.event,available)||[];
    fields.source.replaceChildren(new Option('Choose an indexed source',''),...filtered.map(item=>new Option(item.scenario+' · '+item.filename,item.sourceId)));
    fields.source.value=wanted;if(fields.source.selectedIndex<0)fields.source.selectedIndex=0;
    form.hidden=!eligible()||!available.length;
    if(wanted!==fields.source.value)selectSource();
    else{refreshCompanions(candidate(),selectedColumns()[0]);refreshProposals(candidate());}
    refreshFlowQuantity(candidate(),selectedColumns()[0]);
    if(removed)return;
    if(!eligible())note.textContent='Open a native ICM network in detailed Explore mode to use simulation playback.';
    else if(!available.length)note.textContent='Index simulation result columns before applying a layer.';
    else if(!layer)note.textContent='Choose a source and review its model revision before applying a layer.';
  }
  async function drawFrame(needed){
    if(!layer||display.value!=='sample')return;
    if(!groups.size)readGroups();
    const current=layer,index=time.valueAsNumber,request=++generation;
    needed??=selectedFrameColumns(current);
    current.requested=needed;
    back.disabled=index<=Number(time.min);next.disabled=index>=Number(time.max);play.disabled=time.min===time.max;
    try{
      const frame=await session().frame(current.source.sourceId,index,needed.map(position=>current.columns[position].series));
      if(request!==generation)return;
      if(!frame.values||!Number.isFinite(frame.time))throw new Error('The selected sample is unavailable.');
      const values=new Array(current.columns.length);
      for(const [i,position] of needed.entries())values[position]=frame.values[i];
      const datum=current.geometryDatum;
      let proposedValues=null,difference=null,proposalFrame=null;
      if(current.proposal){
        const {source,columns,alignment}=current.proposal;
        const positions=needed.map(position=>alignment[position]).filter(position=>position!==-1);
        const counterpart=await session().frameAtTime(source.sourceId,frame.time,positions.map(position=>columns[position].series));
        if(request!==generation)return;
        proposalFrame=new Array(columns.length);
        for(const [i,position] of positions.entries())proposalFrame[position]=counterpart.values?.[i]??null;
        proposedValues=values.map((value,position)=>proposalFrame[alignment[position]]??null);
        difference=R.compareSimulationSamples(values,proposedValues);
      }
      let conduits=null,proposedConduits=null;
      const showProposalEnds=Boolean(current.proposal&&current.profileRouteRevision===routeRevision);
      if(datum&&current.columns[0].asset.kind==='link'){
        const steps=new Set(routeDraft.steps.map(step=>step.id));
        const ends=async (run,samples)=>{
          const byEdge=new Map();
          const collect=(columns,matches,values)=>{
            for(const [i,column] of columns.entries()){
              const edge=matches.get(column.series).id;
              if(!steps.has(edge))continue;
              if(!byEdge.has(edge))byEdge.set(edge,{edge,upstream:null,downstream:null});
              byEdge.get(edge)[column.location]=Number.isFinite(values?.[i])?values[i]:null;
            }
          };
          collect(run.columns,run.matches,samples);
          if(run.companion&&steps.size){
            const {source,matches,columns}=run.companion;
            const needed=columns.filter(column=>steps.has(matches.get(column.series).id));
            if(needed.length){
              const peer=await session().frameAtTime(source.sourceId,frame.time,needed.map(column=>column.series));
              collect(needed,matches,peer.values);
            }
          }
          return [...byEdge.values()];
        };
        [conduits,proposedConduits]=await Promise.all([ends(current,values),
          showProposalEnds?ends(current.proposal,proposalFrame):null]);
        if(request!==generation)return;
      }
      Object.assign(current,{values,proposedValues,difference});
      const timestamp=formatClock(frame.time);
      const valid=values.filter((value,index)=>Number.isFinite(value)&&(!current.grounds||Number.isFinite(current.grounds[index]))&&
        (!current.capacities||current.capacities.values[index]>0)).length;
      const subset=needed.length<current.columns.length;
      stamp.textContent=current.source.scenario+' · '+timestamp+' (project clock) · '+valid+' of '+needed.length+' matched assets have a sample.'+
        (subset?' Sample coverage is for displayed and route assets. Zoom in or select an asset to load its reading.':'');
      if(current.proposal)stamp.textContent+=' '+current.proposal.source.scenario+' · '+difference.filter((value,index)=>
        Number.isFinite(value)&&(!current.grounds||Number.isFinite(current.grounds[index]))&&
        (!current.capacities||(current.capacities.values[index]>0&&current.proposalCapacities.values[index]>0))).length+
        ' of '+needed.length+' assets have an exact comparison.';
      time.setAttribute('aria-valuetext',timestamp+' project clock');
      decorate();
      profile=null;
      if(datum){
        const levels=values=>current.columns.flatMap((column,index)=>{
          const id=current.matches.get(column.series).id,level=values[index];
          return Number.isFinite(level)?[{id,level,location:column.location}]:[];
        });
        const proposedProfile=current.proposal&&(!conduits&&!current.proposal.geometry||showProposalEnds);
        profile={scenario:current.source.scenario,time:timestamp,datum,ends:conduits,
          values:conduits?[]:levels(values).map(({id,level})=>({node:id,level})),
          proposalReviewPending:Boolean(current.proposal&&!proposedProfile),
          proposal:proposedProfile?{scenario:current.proposal.source.scenario,ends:proposedConduits,routeRevision:current.profileRouteRevision,
            geometry:current.proposal.geometry,
            levels:proposedConduits?[]:levels(proposedValues)}:null};
      }
      if(profile)redrawProfile();
    }catch(error){if(request===generation)reset(error.message);}
  }
  fields.source.onchange=()=>{reset();selectSource();};
  fields.event.onchange=()=>{reset();refreshSources();};
  fields.metric.onchange=()=>{reset();refreshLayer();};
  fields.levelQuantity.onchange=()=>{
    reset();const [low,high]=derivedFreeboard()?[-.5,1.5]:ranges.level;
    fields.minimum.value=low;fields.maximum.value=high;showProposal();
  };
  fields.flowQuantity.onchange=()=>{
    reset();const [low,high]=derivedCapacity()?[0,150]:ranges.flow;
    fields.minimum.value=low;fields.maximum.value=high;showProposal();
  };
  fields.flowDirection.onchange=()=>reset();
  fields.companion.onchange=()=>{reset();};
  fields.proposal.onchange=()=>{reset();fields.proposalEnd.value='';showProposal();};
  fields.proposalEnd.onchange=()=>reset();
  shade.onchange=()=>{renderLegend();decorate();};
  function showExtrema(){
    const window=sampleWindow.current();
    const available=layer.envelopes.filter((result,index)=>result.valid>0&&(!layer.grounds||Number.isFinite(layer.grounds[index]))&&
      (!layer.capacities||layer.capacities.values[index]>0)).length;
    stamp.textContent=layer.source.scenario+' · '+display.selectedOptions[0].textContent+' · '+formatClock(window.first)+' to '+formatClock(window.last)+
      ' (project clock) · '+available+' of '+layer.columns.length+' assets have valid samples. Each asset may reach its extreme at a different time.';
    decorate();
  }
  async function reviewMap(){
    if(!layer)return;
    const instant=display.value==='sample';
    stop();++generation;time.disabled=!instant;$('nsSimulationSpeed').disabled=!instant;
    $('nsSimulationShadeChoice').hidden=!layer.proposal||!instant;
    renderLegend();
    if(instant){cancelScan();layer.values=null;removeMarks();void drawFrame();return;}
    back.disabled=next.disabled=play.disabled=true;
    if(profile){profile=null;redrawProfile();}
    if(layer.envelopes){showExtrema();return;}
    if(extremaJob)return;
    removeMarks();
    const current=layer,window=sampleWindow.current();
    stamp.textContent='Calculating independent extrema…';cancelExtrema.hidden=false;
    const job=session().envelopes(current.source.sourceId,current.columns.map(column=>column.series),window.first,window.last,(loaded,total)=>{
      if(extremaJob===job)stamp.textContent='Calculating independent extrema… '+loaded+' of '+total+' samples scanned.';
    },Boolean(current.capacities));
    extremaJob=job;
    try{
      const result=await job.result;
      if(extremaJob!==job)return;
      current.envelopes=result;showExtrema();
    }catch(error){
      if(extremaJob===job){display.value='sample';note.textContent=error.message;void reviewMap();}
    }finally{
      if(extremaJob===job){extremaJob=null;cancelExtrema.hidden=true;}
    }
  }
  display.onchange=()=>void reviewMap();
  cancelExtrema.onclick=()=>{display.value='sample';note.textContent='Extrema scan cancelled.';void reviewMap();};
  function renderLegend(){
    const first=layer.columns[0],{low,high}=layer;
    const description=display.value!=='sample'?' · '+(layer.proposal?'Baseline ': '')+display.selectedOptions[0].textContent:
      layer.proposal?' · '+shade.selectedOptions[0].textContent:'';
    const quantity=layer.grounds?'Ground-level freeboard':layer.capacities?'Full-capacity utilisation':titles[first.quantity];
    const unit=layer.capacities?(display.value==='sample'&&shade.value==='difference'?'percentage points':'%'):first.unit;
    renderBandLegend(legend,quantity+description+' ('+unit+')',low,high,
      'Dashed link or hollow marker: missing sample');
    if(layer.flowDirection&&display.value==='sample'&&shade.value!=='difference')legend.append(inspectorElement('span',
      'Bold arrows show recorded link flow. Faded arrows show nominal topology.'));
    if(layer.grounds)legend.append(inspectorElement('span','Calculated margin uses source ground minus recorded level. Negative means level above ground.'));
    if(layer.capacities)legend.append(inspectorElement('span','Screening ratio uses flow magnitude divided by positive imported PFC. Independent extrema use the exact supported magnitudes.'),
      ...[['Baseline',layer.capacities],['Proposal',layer.proposalCapacities]].filter(([,entry])=>entry).map(([name,{info}])=>
        inspectorElement('span',name+' capacity source '+info.filename+' · '+info.fingerprint.algorithm+' '+info.fingerprint.digest)));
  }
  form.onsubmit=async event=>{
    event.preventDefault();
    const source=candidate();if(!source||!eligible())return;
    const [low,high]=[fields.minimum.valueAsNumber,fields.maximum.valueAsNumber];
    if(!(low<high)||!Number.isFinite(high-low)){note.textContent='Enter a finite scale maximum greater than its minimum.';return;}
    const useCapacity=derivedCapacity();
    const requested=selectedColumns().filter(column=>!useCapacity||column.asset.table==='hw_conduit');
    const matches=R.simulationBindings(network,requested),columns=requested.filter(column=>matches.has(column.series));
    if(!columns.length){note.textContent='None of the result columns uniquely match the network’s typed asset IDs.';return;}
    const first=columns[0],datum=fields.datum.value.trim();
    if(datum&&(first.quantity!=='level'||!columns.every(column=>column.datum===datum))){
      note.textContent='The entered geometry datum must exactly match the declared results datum. Leave it blank for map-only review.';return;
    }
    let grounds=null;
    if(derivedFreeboard()){
      if(!datum){note.textContent='Confirm the common geometry and result datum to calculate ground-level freeboard.';return;}
      const nodes=new Map(network.nodes.map(node=>[node.id,node.icm?.groundLevelM]));
      const links=new Map(network.edges.map(link=>[link.id,link]));
      grounds=columns.map(column=>{
        const {kind,id}=matches.get(column.series),link=links.get(id);
        return nodes.get(kind==='node'?id:column.location==='upstream'?link?.from:link?.to);
      });
    }
    let companion=companions.get(Number(fields.companion.value));
    if(companion){
      if(!datum){note.textContent='Confirm the geometry datum to review both conduit ends.';return;}
      const peerMatches=R.simulationBindings(network,companion.columns),peerColumns=companion.columns.filter(column=>peerMatches.has(column.series));
      if(!peerColumns.length){note.textContent='No opposite-end columns match typed links in this network.';return;}
      companion={...companion,columns:peerColumns,matches:peerMatches};
    }
    let proposal=proposals.get(Number(fields.proposal.value));
    const geometryReviewed=Boolean(proposal&&datum&&first.quantity==='level'&&routeDraft.steps.length&&
      (first.asset.kind==='link'||reviewedRouteGeometry()));
    if(proposal){
      if(!fields.verifyProposal.checked)return;
      if(geometryReviewed&&!fields.verifyProfileGeometry.checked||!geometryReviewed&&fields.proposalEnd.value){
        note.textContent=reviewedRouteGeometry()?'Review the separately supplied route geometry and datum before showing proposal conduit-end levels.':
          'Review the shared route geometry and datum before showing proposal conduit-end levels.';return;
      }
      const geometry=geometryReviewed?reviewedRouteGeometry():null;
      if(geometry&&(geometry.revision!==proposal.source.modelRevision||geometry.datum!==datum)){
        note.textContent='Choose proposal results matching the reviewed revised model revision and geometry datum.';return;
      }
      if(geometry&&derivedFreeboard()){
        note.textContent='Choose recorded level for the separate geometry comparison. The map freeboard comparison requires a reviewed common ground basis.';return;
      }
      const baseAssets=new Set(columns.map(column=>R.refKey(matches.get(column.series))));
      const proposedMatches=R.simulationBindings(network,proposal.columns);
      const proposedColumns=proposal.columns.filter(column=>proposedMatches.has(column.series)&&baseAssets.has(R.refKey(proposedMatches.get(column.series))));
      if(!proposedColumns.length){note.textContent='The proposal has no typed assets in common with the baseline layer.';return;}
      const positions=new Map(proposedColumns.map((column,index)=>[R.refKey(proposedMatches.get(column.series)),index]));
      let otherEnd=proposalEnds.get(Number(fields.proposalEnd.value));
      if(otherEnd){
        const peerMatches=R.simulationBindings(network,otherEnd.columns);
        const peerColumns=otherEnd.columns.filter(column=>peerMatches.has(column.series)&&positions.has(R.refKey(peerMatches.get(column.series))));
        if(!peerColumns.length){note.textContent='The proposal’s other end has no matching typed links in the selected comparison.';return;}
        otherEnd={...otherEnd,columns:peerColumns,matches:peerMatches};
      }
      proposal={...proposal,columns:proposedColumns,matches:proposedMatches,companion:otherEnd,geometry,
        alignment:columns.map(column=>positions.get(R.refKey(matches.get(column.series)))??-1)};
    }
    let capacities=null,proposalCapacities=null;
    if(useCapacity){
      if(!source.capacity||proposal&&!proposal.source.capacity){note.textContent='Attach a reviewed capacity table to each indexed conduit-flow source used here.';return;}
      const request=++generation,apply=form.querySelector('[type="submit"]'),keys=columns.map(column=>column.key);
      apply.disabled=true;
      try{
        [capacities,proposalCapacities]=await Promise.all([session().capacities(source.sourceId,keys),
          proposal?session().capacities(proposal.source.sourceId,keys):null]);
        if(request!==generation||candidate()!==source)return;
        if(!capacities||proposal&&!proposalCapacities){note.textContent='Capacity tables changed. Review the selected indexed sources.';return;}
      }catch(error){if(request===generation)note.textContent=error.message;return;}
      finally{apply.disabled=false;}
    }
    reset();
    if(geometryView?.current())geometryView.reset();
    fields.confirm.checked=true;
    fields.verifyProposal.checked=Boolean(proposal);
    fields.verifyProfileGeometry.checked=geometryReviewed;
    const flowDirection=first.asset.kind==='link'&&first.quantity==='flow'?fields.flowDirection.value:'';
    const columnsByAsset=new Map(columns.map((column,index)=>[R.refKey(matches.get(column.series)),index]));
    layer={source,columns,matches,columnsByAsset,low,high,values:null,envelopes:null,companion,proposal,flowDirection,grounds,capacities,proposalCapacities,
      geometryDatum:first.quantity==='level'?datum:'',profileRouteRevision:geometryReviewed?routeRevision:null};
    const resultsWorkspace=window.HydraResultsWorkspace;
    if(!sampleWindow)sampleWindow=resultsWorkspace.mountResultWindow($('nsSimulationWindow'),range=>{
      cancelScan();layer.envelopes=null;resultsWorkspace.setSliderWindow(time,range);void reviewMap();
    });
    resultsWorkspace.setSliderWindow(time,sampleWindow.setSource(source));
    transport.hidden=false;clear.disabled=false;legend.hidden=false;
    note.textContent=columns.length+' of '+requested.length+' result columns matched. Other assets retain their schematic styling.'+
      (first.asset.kind==='link'?(flowDirection?' The reviewed sign convention applies to instantaneous link flow.':' Link arrows show nominal topology. Signs are available in asset labels.'):'');
    void reviewMap();
  };
  function step(delta){time.value=String(time.valueAsNumber+delta);return drawFrame();}
  function schedule(run){
    timer=setTimeout(async()=>{
      if(run!==playing)return;
      await step(1);
      if(run!==playing)return;
      if(time.value===time.max)stop();else schedule(run);
    },1000/Number($('nsSimulationSpeed').value));
  }
  play.onclick=()=>{
    if(timer!==null){stop();return;}
    if(time.value===time.max){time.value=time.min;void drawFrame();}
    play.textContent='Pause';play.setAttribute('aria-pressed','true');schedule(++playing);
  };
  time.oninput=()=>{stop();void drawFrame();};back.onclick=()=>{stop();void step(-1);};next.onclick=()=>{stop();void step(1);};
  clear.onclick=()=>reset('Simulation layer removed.');
  $('nsIndexResults').onclick=()=>window.__ICM_PRECISION_WORKBENCH__.navigate('network','simulation-results',true);
  panel.addEventListener('toggle',()=>{if(panel.open)refreshSources();else stop();});
  window.addEventListener('icm:simulation-sources-changed',refreshSources);
  window.addEventListener('icm:route-changed',({detail})=>{if(detail.page!=='schematic')stop();else if(panel.open)refreshSources();});
  simulationView={decorate,reset,refreshSources,profile:()=>profile,refreshProfile:()=>{
    if(!layer?.geometryDatum)return;
    if(layer.profileRouteRevision!==routeRevision)fields.verifyProfileGeometry.checked=false;
    if(routeDraft.steps.length)void drawFrame();
  }};
}

function displayProfile(){
  const steps=routeDraft.steps;
  $('nsProfile').hidden=!steps.length;$('nsCapacityScreen').hidden=true;renderRouteTrace();
  simulationView?.refreshProfile();
  if(!steps.length)return;
  plotProfile(steps);
  renderProfileControls();
  const model=routeDraft.model;
  const nodes=new Set(steps.flatMap(step=>[step.from,step.to]));
  const scenarios=new Set(network.nodes.filter(node=>nodes.has(node.id)).flatMap(node=>
    node.bindings.filter(binding=>binding.role==='model'&&binding.quantity==='level').map(binding=>binding.scenario)));
  $('nsProfileScenarios').replaceChildren(...[...scenarios].sort().map(name=>new Option(name,name)));
  renderProfileModel();
  $('nsClearModelLevels').disabled=!model;
  const table=tableWithHeaders(['Link','Chainage (m)','Length (m)','Invert upstream / downstream (m)','Width × height (mm)','Gradient (m/m)','Review','Source']);
  const current=new Set(network.edges.map(edge=>edge.id));
  for(const step of steps){
    const inspect=inspectorButton(step.name);inspect.dataset.nsProfileLink=step.id;
    inspect.disabled=!current.has(step.id);inspect.onclick=()=>selectConnector(step.id);
    const messages=[];
    if(step.lengthStatus==='structure')messages.push(step.type.replace(/^hw_/,'').replaceAll('_',' ')+' · structure at route station');
    if(step.lengthStatus==='missing')messages.push('Missing length');
    if(step.us===null||step.ds===null)messages.push('Missing invert');
    if(step.us!==null&&step.ds!==null&&step.ds>step.us)messages.push('Adverse gradient');
    const provenance=step.sources.map(source=>source.table+' · row '+source.row+(source.file?' · '+source.file:'')).join(' / ');
    const dimensions=Number.isFinite(step.widthMm)||Number.isFinite(step.heightMm)?f(step.widthMm,3)+' × '+f(step.heightMm,3)+(step.shape?' · '+step.shape:''):'—';
    const gradient=step.length>0&&Number.isFinite(step.us)&&Number.isFinite(step.ds)?(step.us-step.ds)/step.length:null;
    addCells(table.tBodies[0].insertRow(),[inspect,f(step.chainageStart,3)+' → '+f(step.chainageEnd,3),f(step.length,3),
      f(step.us,3)+' / '+f(step.ds,3),dimensions,f(gradient,6),messages.join(' · '),provenance||'Manual or unavailable']);
  }
  $('nsProfileRows').replaceChildren(table);
  const trials=$('nsSavedCapacity');
  trials.replaceChildren();
  if(routeDraft.trials.length){
    const summaries=tableWithHeaders(['Link','Diameter (mm)','Gradient (m/m)','Roughness (mm)','Viscosity (m²/s)','Capacity (L/s)']);
    for(const trial of routeDraft.trials){
      const row=summaries.tBodies[0].insertRow(),reopen=inspectorButton(steps.find(step=>step.id===trial.id)?.name||trial.id);
      reopen.onclick=()=>openCapacityScreen(trial.id,trial);
      addCells(row,[reopen,f(trial.diameter,6),f(trial.gradient,12),f(trial.roughness,8),f(trial.viscosity,12),f(trial.capacity,3)]);
    }
    trials.append(summaries);
  }
  updateProfileSelection();
}
function openCapacityScreen(id=selected,saved=null){
  const link=network.edges.find(edge=>edge.id===id),inputs=C.conduitTrial(link);
  const panel=$('nsCapacityScreen'),form=$('nsCapacityForm');
  ++routeRevision;
  panel.hidden=false;form.hidden=!inputs&&!saved;form.dataset.asset=id||'';
  $('nsCapacityMessage').textContent=saved?'Saved screening capacity · '+f(saved.capacity,3)+' L/s.':
    inputs?'Review the source inputs and enter the kinematic viscosity.':
    !link?'Select a conduit in the route profile or list.':
    Number.isFinite(link.icm?.gradient)||[link.icm?.conduit_length,link.icm?.us_invert,link.icm?.ds_invert].every(Number.isFinite)?
      'This conduit needs supported circular geometry, one barrel, zero sediment, uniform Colebrook–White roughness and a non-adverse gradient.':
      'Missing gradient or source length and inverts. Review the source conduit attributes.';
  if(!inputs&&!saved)return;
  for(const [key,value] of Object.entries(saved||inputs)){
    if(['diameter','gradient','roughness','viscosity'].includes(key))form.elements[key].value=String(Number(value.toPrecision(14)));
  }
  if(!saved)form.elements.viscosity.value='0.000001';
  form.elements.diameter.focus();
}
async function applyModelLevels(event){
  event.preventDefault();
  const fields=event.currentTarget.elements,button=event.submitter,message=$('nsModelLevelsMessage');
  const scenario=fields.scenario.value.trim(),datum=fields.datum.value.trim(),time=fields.time.value;
  if(!scenario||!datum||!time)return;
  const nodeIds=new Set(routeDraft.steps.flatMap(step=>[step.from,step.to]));
  const request=++routeRevision,values=[];
  const normal=value=>String(value||'').trim().toLowerCase();
  const expected=normal(datum),sample=Date.parse(time+'Z');
  const candidates=network.nodes.filter(node=>nodeIds.has(node.id)).flatMap(node=>{
    const matches=node.bindings.filter(binding=>binding.role==='model'&&binding.scenario===scenario&&
      binding.quantity==='level'&&normal(binding.datum)===expected&&binding.years.includes(Number(time.slice(0,4))));
    if(matches.length!==1)return [];
    const binding=matches[0],source=sourceFor(binding);
    if(!source||seriesQuantity(source,binding.column)==='depth')return [];
    const meta=contract(binding);
    if(meta.datum&&normal(meta.datum)!==expected)return [];
    return [{node,binding,source,meta,signature:signature(node)}];
  });
  if(!candidates.length){
    message.textContent='No unique loaded modelled level bindings match the scenario, datum and year.';
    return;
  }
  button.disabled=true;message.textContent='Reading exact model samples…';
  try{
    for(const {node,binding,source,meta,signature:before} of candidates){
      const scale=C.valueScale('level',meta.unit,binding.unit)*C.unitFactor('level',binding.unit);
      const result=await engine.call('series_data',{path:source.virtualPath,column:binding.column,
        max_points:2,start:time,end:time,exclusions_json:JSON.stringify(node.exclusions)});
      if(request!==routeRevision||before!==signature(node))return;
      const index=result.timestamp.findIndex(stamp=>stamp&&Date.parse(stamp+'Z')===sample);
      if(index>=0&&Number.isFinite(result.value[index])&&!node.exclusions.some(range=>range.start<=time&&time<range.end))
        values.push({node:node.id,level:result.value[index]*scale,source:source.displayName,column:binding.column,sha256:binding.sha256});
    }
    if(!values.length){message.textContent='No matching samples at that exact time. Existing overlay retained.';return;}
    routeDraft.model={scenario,time,datum,values};displayProfile();
    message.textContent=values.length+' route node samples plotted · '+(nodeIds.size-values.length)+' unavailable.';
  }catch(error){if(request===routeRevision)message.textContent=error.message;}
  finally{button.disabled=false;}
}

function mountRouteReview(){
  const toolbar=$('nsWorkbench').querySelector('.ns-main-toolbar');
  const controls=inspectorElement('div',undefined,'ns-review-actions ns-view-controls');
  controls.innerHTML='<button type="button" id="nsOverview" aria-pressed="false">Overview</button>'+
    '<label><input id="nsShowLabels" type="checkbox" role="switch"> Show labels</label>'+
    '<label><input id="nsShowMonitors" type="checkbox" role="switch"> Flow monitors</label>'+
    '<button type="button" id="nsLongSection">Long section</button>'+
    '<button type="button" id="nsOpenMonitorImport">Import monitor locations</button>';
  toolbar.after(controls);
  $('nsStatus').insertAdjacentHTML('beforebegin','<section id="nsReach" class="ns-review-section" hidden></section>'+
    '<section id="nsRoute" class="ns-review-section" aria-labelledby="nsRouteTitle" hidden>'+
    '<header class="ns-review-heading"><div><h3 id="nsRouteTitle">Route long section</h3><p>Follow nominal topology and confirm the route before reviewing its profile.</p></div><button id="nsCloseRoute">Close</button></header>'+
    '<div class="ns-review-actions"><label>Start node<select id="nsRouteStart"></select></label>'+
    '<label>End node<select id="nsRouteEnd"></select></label><div id="nsRouteBranch"></div>'+
    '<button id="nsUseStart">Use selection as start</button><button id="nsUseEnd">Use selection as end</button><button id="nsOpenProfile" class="ns-primary">Open profile</button></div><p id="nsRouteMessage" role="status"></p>'+
    '<label class="ns-field">Saved route reviews<select id="nsSavedRoutes"></select></label>'+
    '<div id="nsProfile" hidden><div class="ns-review-actions"><button id="nsFitRoute">Fit route</button>'+
    '<button id="nsProfileFocus">Focus selected</button><button id="nsProfileCapacity">Check pipe capacity</button></div>'+
    '<button type="button" id="nsExpandProfile">Expand profile</button><div id="nsProfilePreview">'+
    '<div id="nsProfileDisplay"><div class="ns-review-actions ns-profile-tools">'+
    '<label>Horizontal zoom<select id="nsProfileZoomX"><option value="1">Fit</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label>'+
    '<label>Vertical zoom<select id="nsProfileZoomY"><option value="1">Fit</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label>'+
    '<label>Horizontal pan<input id="nsProfilePanX" type="range" min="0" max="1" step="0.01"></label>'+
    '<label>Elevation pan<input id="nsProfilePanY" type="range" min="0" max="1" step="0.01"></label>'+
    '<label><input id="nsProfileShading" type="checkbox"> Ground shading</label><button type="button" id="nsResetProfile">Reset profile view</button>'+
    '<button type="button" id="nsProfileSvgDownload">Download profile SVG</button><button type="button" id="nsClearRevisedGeometry" hidden>Remove revised geometry</button></div>'+
    '<p class="ns-profile-legend"><span>Invert</span><span>Soffit</span><span>Ground</span><span>Structure</span><span id="nsProfileModelLegend" hidden>Modelled node level</span></p>'+
    '<p class="ns-note">Levels use the source datum. Shaft widths are symbolic. Modelled node markers show samples at individual nodes. Drag a zoomed plot background to pan.</p>'+
    '<p id="nsProfileModelInfo"></p><p id="nsRevisedGeometryInfo" class="ns-note"></p><div id="nsProfilePlot"></div></div></div>'+
    '<dialog class="ns-review-dialog ns-profile-expanded" id="nsProfileExpanded" aria-labelledby="nsExpandedProfileTitle">'+
    '<header class="ns-review-heading"><h3 id="nsExpandedProfileTitle">Expanded route long section</h3><button type="button" id="nsCloseExpandedProfile">Close expanded profile</button></header>'+
    '<div id="nsExpandedProfileContent"></div></dialog><div id="nsProfileRows" class="ns-review-table"></div>'+
    '<details class="ns-model-overlay"><summary>Overlay modelled levels</summary>'+
    '<p>Use modelled level evidence linked to route nodes. Enter an exact time in the model clock and confirm the datum shared with the geometry.</p>'+
    '<form id="nsProfileModelForm" class="ns-review-actions"><label>Scenario<input name="scenario" list="nsProfileScenarios" maxlength="100" required></label>'+
    '<datalist id="nsProfileScenarios"></datalist><label>Model clock time<input name="time" type="datetime-local" step="1" required></label>'+
    '<label>Shared vertical datum<input name="datum" maxlength="128" required></label>'+
    '<button class="ns-primary" type="submit" id="nsApplyModelLevels">Plot modelled levels</button>'+
    '<button type="button" id="nsClearModelLevels">Remove overlay</button></form><p id="nsModelLevelsMessage" role="status"></p></details>'+
    '<section id="nsCapacityScreen" class="ns-review-section" hidden><h4>Pipe capacity screening</h4>'+
    '<form id="nsCapacityForm" class="ns-review-actions">'+
    '<label>Diameter (mm)<input required name="diameter" type="number" min="1" max="20000" step="any"></label>'+
    '<label>Gradient (m/m)<input required name="gradient" type="number" min="0" max="1" step="any"></label>'+
    '<label>Roughness (mm)<input required name="roughness" type="number" min="0" step="any"></label>'+
    '<label>Kinematic viscosity (m²/s)<input required name="viscosity" type="number" min="0.000000001" max="0.01" step="any"></label>'+
    '<button type="submit" class="ns-primary">Calculate and keep trial</button></form><p id="nsCapacityMessage" role="status"></p></section>'+
    '<div id="nsSavedCapacity" class="ns-review-table"></div>'+
    '<label class="ns-field">Review name<input id="nsRouteName" maxlength="100"></label>'+
    '<label class="ns-field">Engineering review note<textarea id="nsRouteNote" maxlength="10000" rows="3"></textarea></label>'+
    '<button id="nsSaveRoute" class="ns-primary">Save route review</button><p id="nsRouteSavedMessage" role="status"></p></div></section>');
  $('nsOverview').onclick=()=>changeOverview(!inOverview());
  $('nsShowLabels').onchange=()=>{
    const enabled=$('nsShowLabels').checked,svg=$('nsSvg');
    network.preferences={...prefs(),showLabels:enabled};
    svg.toggleAttribute('data-ns-labels-hidden',!enabled);
    persist();
    if(enabled){
      for(const label of svg.querySelectorAll('[data-ns-label-suppressed]'))label.removeAttribute('data-ns-label-suppressed');
      declutterLabels(svg);
    }
  };
  $('nsShowMonitors').onchange=()=>{network.preferences={...prefs(),showMonitors:$('nsShowMonitors').checked};changed(true);};
  $('nsLongSection').onclick=()=>{
    $('nsRoute').hidden=false;renderRoute();updateProfileSelection();renderRouteTrace();$('nsRouteStart').focus();
  };
  $('nsCloseRoute').onclick=()=>{$('nsRoute').hidden=true;renderRouteTrace();$('nsLongSection').focus();};
  const expanded=$('nsProfileExpanded'),profileControls=$('nsProfileDisplay');
  $('nsExpandProfile').onclick=()=>{$('nsExpandedProfileContent').append(profileControls);expanded.showModal();};
  $('nsCloseExpandedProfile').onclick=()=>expanded.close();
  expanded.onclose=()=>{
    if(expanded.open)return;
    $('nsProfilePreview').append(profileControls);
    if(!$('nsRoute').hidden&&!root().hidden)$('nsExpandProfile').focus();
  };
  window.addEventListener('icm:route-changed',({detail})=>{if((detail.workspace!=='network'||detail.page!=='schematic')&&expanded.open)expanded.close();});
  let profileFrame=0;
  const redrawProfile=()=>{
    renderProfileControls();
    if(!profileFrame)profileFrame=requestAnimationFrame(()=>{profileFrame=0;plotProfile(routeDraft.steps);renderProfileControls();});
  };
  const plot=$('nsProfilePlot');
  let profileDrag=null;
  plot.addEventListener('pointerdown',event=>{
    const graph=event.target.closest('svg'),view=routeDraft.profileView;
    if(profileDrag||!graph||view.zoomX===1&&view.zoomY===1||
       event.button!==1&&(event.button!==0||event.target.closest('[role="button"]')))return;
    const matrix=graph.getScreenCTM();
    if(!matrix||!matrix.a||!matrix.d)return;
    profileDrag={id:event.pointerId,view,x:event.clientX,y:event.clientY,panX:view.panX,panY:view.panY,
      width:Math.abs(matrix.a)*774,height:Math.abs(matrix.d)*213};
    plot.setPointerCapture(event.pointerId);plot.setAttribute('data-ns-profile-dragging','');
    event.preventDefault();
  });
  plot.addEventListener('pointermove',event=>{
    const grab=profileDrag,view=routeDraft.profileView;
    if(!grab||grab.id!==event.pointerId||grab.view!==view)return;
    const bound=value=>Math.max(0,Math.min(1,value));
    if(view.zoomX>1)view.panX=bound(grab.panX-(event.clientX-grab.x)/grab.width/(view.zoomX-1));
    if(view.zoomY>1)view.panY=bound(grab.panY+(event.clientY-grab.y)/grab.height/(view.zoomY-1));
    redrawProfile();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])plot.addEventListener(type,event=>{
    if(profileDrag?.id!==event.pointerId)return;
    profileDrag=null;plot.removeAttribute('data-ns-profile-dragging');
  });
  for(const [id,key] of [['nsProfileZoomX','zoomX'],['nsProfileZoomY','zoomY'],['nsProfilePanX','panX'],['nsProfilePanY','panY']]){
    $(id).oninput=()=>{routeDraft.profileView[key]=Number($(id).value);redrawProfile();};
  }
  $('nsProfileShading').onchange=()=>{routeDraft.profileView.groundShading=$('nsProfileShading').checked;redrawProfile();};
  $('nsResetProfile').onclick=()=>{routeDraft.profileView={...defaultProfileView,groundShading:routeDraft.profileView.groundShading};redrawProfile();};
  $('nsProfileSvgDownload').onclick=exportProfileSvg;
  $('nsClearRevisedGeometry').onclick=()=>{
    proposedRouteGeometry=null;simulationView?.reset('Revised route geometry removed. Review any proposal before applying playback.');
    redrawProfile();$('nsProfileSvgDownload').focus();
  };
  $('nsOpenMonitorImport').onclick=openMonitorImport;
  for(const [id,key] of [['nsRouteStart','start'],['nsRouteEnd','end']])$(id).onchange=()=>{
    setRouteEndpoint(key,$(id).value);
  };
  $('nsUseStart').onclick=()=>{if(node())setRouteEndpoint('start',node().id);};
  $('nsUseEnd').onclick=()=>{if(node())setRouteEndpoint('end',node().id);};
  function setRouteEndpoint(key,id){
    routeDraft[key]=id;routeDraft.choices.clear();
    clearProfile();renderRoute();
  }
  $('nsOpenProfile').onclick=()=>{
    proposedRouteGeometry=null;
    routeDraft.steps=R.longSection(network,reviewRoute().edges);routeDraft.trials=[];routeDraft.model=null;++routeRevision;
    routeDraft.profileView={...defaultProfileView,groundShading:routeDraft.profileView.groundShading};
    displayProfile();$('nsFitRoute').focus();
  };
  $('nsSavedRoutes').onchange=async()=>{
    const saved=(network.routeReviews||[]).find(entry=>entry.name===$('nsSavedRoutes').value);
    if(!saved)return;
    proposedRouteGeometry=null;
    routeDraft={...structuredClone(saved),choices:new Map(saved.steps.map(step=>[step.from,step.id]))};++routeRevision;
    routeDraft.profileView={...defaultProfileView,...saved.profileView};
    $('nsRouteName').value=saved.name;$('nsRouteNote').value=saved.note;
    const fields=$('nsProfileModelForm').elements;
    for(const key of ['scenario','time','datum'])fields[key].value=saved.model?.[key]||'';
    renderRoute();displayProfile();
    const live=reviewRoute();
    const same=R.sameProfileSteps(R.longSection(network,live.edges),saved.steps);
    $('nsRouteSavedMessage').textContent=same?'Saved profile and screening assumptions restored.':
      'Saved profile restored. Source geometry or route has changed. Confirm the current route before recalculating.';
    if(!same||!saved.revisedGeometry)return;
    const baseline=routeDraft.steps,geometry=routeDraft.revisedGeometry;
    try{
      const digest=await routeGeometryDigest(geometry.steps);
      if(routeDraft.steps!==baseline)return;
      if(digest!==geometry.sha256)throw new Error('The saved revised geometry digest does not match its recorded values.');
      proposedRouteGeometry={...geometry,baseline};displayProfile();
      $('nsRouteSavedMessage').textContent='Saved baseline and revised geometry restored with the screening assumptions.';
    }catch(error){
      if(routeDraft.steps===baseline)$('nsRouteSavedMessage').textContent=conciseErrorMessage(error);
    }
  };
  $('nsSaveRoute').onclick=()=>{
    const name=$('nsRouteName').value.trim(),message=$('nsRouteSavedMessage');
    if(!name){message.textContent='Enter a review name.';$('nsRouteName').focus();return;}
    const others=(network.routeReviews||[]).filter(entry=>entry.name!==name);
    if(others.length>=30){message.textContent='The network supports up to 30 saved route reviews.';return;}
    const comparison=reviewedRouteGeometry();
    const revisedGeometry=comparison?{steps:comparison.steps,revision:comparison.revision,datum:comparison.datum,sha256:comparison.sha256}:undefined;
    checkpoint();network.routeReviews=[...others,structuredClone({name,note:$('nsRouteNote').value,
      start:routeDraft.start,end:routeDraft.end,steps:routeDraft.steps,trials:routeDraft.trials,model:routeDraft.model,profileView:routeDraft.profileView,revisedGeometry})];
    persist();renderRoute();$('nsSavedRoutes').value=name;message.textContent='Route review saved. Use Save network for a portable copy.';
  };
  $('nsFitRoute').onclick=()=>{
    const graph=sceneGraph(),assetIds=new Set(routeDraft.steps.flatMap(step=>[step.from,step.to]));
    if(inOverview())for(const id of assetIds){
      const reach=graph.nodeToReach.get(id);
      if(reach){assetIds.add(reach.from);assetIds.add(reach.to);}
    }
    const points=graph.nodes.filter(node=>assetIds.has(node.id));
    if(!points.length)return;
    const xs=points.map(point=>point.x),ys=points.map(point=>point.y),width=Math.max(...xs)-Math.min(...xs),
      height=Math.max(...ys)-Math.min(...ys),view=dimensions(),z=C.cameraZoom(Math.min(2,(view.width-120)/Math.max(1,width),
        (view.height-100)/Math.max(1,height)),network.contextFormat);
    network.camera={zoom:z,x:view.width/2-(Math.min(...xs)+width/2)*z,y:view.height/2-(Math.min(...ys)+height/2)*z};
    changed(true);$('nsCanvas').scrollIntoView({block:'nearest'});
  };
  $('nsProfileFocus').onclick=()=>{focusSelected();$('nsCanvas').scrollIntoView({block:'nearest'});};
  $('nsProfileCapacity').onclick=()=>openCapacityScreen(selectionKind==='edge'&&routeDraft.steps.some(step=>step.id===selected)?selected:null);
  $('nsCapacityForm').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,message=$('nsCapacityMessage'),id=form.dataset.asset,request=routeRevision;
    const trial={id};
    for(const key of ['diameter','gradient','roughness','viscosity'])trial[key]=form.elements[key].valueAsNumber;
    const button=event.submitter;button.disabled=true;message.textContent='Calculating screening capacity…';
    try{
      await ensureEngineBoot();
      const values=await engine.call('circular_pipe_capacity',{diameter_m:trial.diameter/1000,gradient:trial.gradient,
        roughness_m:trial.roughness/1000,viscosity_m2_s:trial.viscosity});
      if(request!==routeRevision||form.dataset.asset!==id)return;
      if(!Number.isFinite(values.discharge_m3_s)||values.regime==='transitional')throw new Error('Capacity is unavailable in this flow regime.');
      trial.capacity=values.discharge_m3_s*1000;
      routeDraft.trials=[...routeDraft.trials.filter(entry=>entry.id!==id),trial];
      displayProfile();openCapacityScreen(id,trial);
    }catch(error){if(request===routeRevision&&form.dataset.asset===id)message.textContent=error.message;}
    finally{button.disabled=false;}
  };
  $('nsProfileModelForm').onsubmit=event=>void applyModelLevels(event);
  $('nsClearModelLevels').onclick=()=>{routeDraft.model=null;++routeRevision;displayProfile();$('nsModelLevelsMessage').textContent='Modelled levels removed.';};
  mountMonitorImport();
}

function revisionGeometry(comparison,rows,layer,full){
  const svg=svgElement('svg',{viewBox:'0 0 620 300',role:'img',
    'aria-label':full?'Full network source geometry with filtered changes':'Changed source geometry in the current page'});
  if(full)svg.setAttribute('data-ns-full-revision','');
  const variants=[['before','#993e55'],['after','#236b77']].filter(([name])=>layer==='both'||layer===name);
  const position=node=>node?.sourcePosition||node;
  const vertices=edge=>edge.sourceBends||edge.bends||[];
  const pointsFor=(graph,kind,object)=>kind==='node'?[position(object)]:
    [position(graph.nodes.get(object.from)),...vertices(object),position(graph.nodes.get(object.to))];
  const finitePoint=point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y);
  const features=[];
  const ext=[Infinity,-Infinity,Infinity,-Infinity];
  function extend(point){
    if(!finitePoint(point))return;
    ext[0]=Math.min(ext[0],point.x);ext[1]=Math.max(ext[1],point.x);
    ext[2]=Math.min(ext[2],point.y);ext[3]=Math.max(ext[3],point.y);
  }
  if(full){
    for(const graph of [comparison.before,comparison.after]){
      for(const node of graph.nodes.values())extend(position(node));
      for(const edge of graph.edges.values())for(const point of vertices(edge))extend(point);
    }
  }
  for(const [name,color] of variants){
    const graph=comparison[name];
    for(const row of rows){
      const object=(row.kind==='node'?graph.nodes:graph.edges).get(row.id);
      if(!object)continue;
      const points=pointsFor(graph,row.kind,object);
      if(!points.every(finitePoint))continue;
      features.push({name,color,row,points});
      if(!full)for(const point of points)extend(point);
    }
  }
  if(!ext.every(Number.isFinite))return svg;
  const scale=Math.min(550/Math.max(1,ext[1]-ext[0]),240/Math.max(1,ext[3]-ext[2]));
  const project=p=>[310+(p.x-(ext[0]+ext[1])/2)*scale,150+(p.y-(ext[2]+ext[3])/2)*scale];
  if(full){
    const coordinate=point=>project(point).map(value=>value.toFixed(1)).join(' ');
    function drawPaths(features,stroke,phase){
      for(const [kind,width] of [['edge',phase==='before'?5:phase==='after'?2:1],['node',phase==='context'?2:6]]){
        const path=features.filter(item=>item.kind===kind)
          .map(({points})=>'M'+points.map(coordinate).join('L')+(kind==='node'?'h.1':'')).join('');
        if(path)svg.append(svgElement('path',{'data-ns-revision-phase':phase,'data-ns-revision-kind':kind,d:path,fill:'none',
          stroke,'stroke-width':width,'stroke-dasharray':phase==='before'&&kind==='edge'?'5 3':'',
          'stroke-linecap':'round',opacity:phase==='context'?.5:phase==='before'&&kind==='node'?.65:1}));
      }
    }
    const graph=comparison[layer==='before'?'before':'after'];
    const context=[];
    for(const [kind,objects] of [['edge',graph.edges],['node',graph.nodes]]){
      for(const object of objects.values()){
        const points=pointsFor(graph,kind,object);
        if(points.every(finitePoint))context.push({kind,points});
      }
    }
    drawPaths(context,'#73848d','context');
    for(const [name,color] of variants)drawPaths(features.filter(feature=>feature.name===name)
      .map(({row,points})=>({kind:row.kind,points})),color,name);
    return svg;
  }
  // The revised line is drawn solid and narrow so a coincident baseline stays visible.
  for(const {name,color,row,points} of features){
    const coords=points.map(project),[cx,cy]=coords[0];
    const shape=row.kind==='node'?svgElement('circle',{cx,cy,r:name==='before'?8:5,fill:'#fff',stroke:color,'stroke-width':2}):
      svgElement('polyline',{points:coords.map(([x,y])=>x+','+y).join(' '),fill:'none',stroke:color,
        'stroke-width':name==='before'?6:2,'stroke-dasharray':name==='before'?'6 4':''});
    shape.append(svgElement('title',{},(name==='before'?'Baseline · ':'Revised · ')+row.name));
    svg.append(shape);
  }
  return svg;
}
function revisionImpact(comparison,row){
  const bucket=row.kind==='node'?'nodes':'edges',previous=comparison.before[bucket].get(row.id),revised=comparison.after[bucket].get(row.id);
  if(!previous)return [];
  const compatible=revised&&(row.kind==='node'?previous.type===revised.type:previous.from===revised.from&&previous.to===revised.to);
  const impacts=[],monitors=new Set(comparison.assignments.get(R.refKey(row))||[]);
  if(previous.monitorId)monitors.add(previous.monitorId);
  for(const name of monitors)impacts.push(['Monitor deployment',name,'',compatible?
    'Review the confirmed host against the revised source geometry.':'The original host changed. Review and confirm a compatible asset.']);
  if(previous.applied)impacts.push(['Applied spill assessment',previous.applied.calculated_at||previous.name,'',
    'Previous results are withdrawn when this revision is applied. Recalculate on the revised basis.']);
  for(const [kind,link] of Object.entries(previous.detrimentLinks||{})){
    impacts.push(['Detriment association',kind+' · '+link.id,'','Review the changed asset and link compatible detriment evidence again.']);
  }
  for(const binding of [...(previous.bindings||[]),...(previous.seriesLinks||[])]){
    impacts.push(['Source series',binding.sourceName+' · '+binding.column,binding.sha256,compatible?
      'The assignment is retained for review. Confirm applicability to the revision.':'The assignment is withdrawn because the original asset changed.']);
  }
  return impacts;
}
function appendRevisedRouteReview(root,comparison){
  if(network.contextFormat!=='icm-csv-v1'||!routeDraft.steps.length)return;
  const baseline=routeDraft.steps,section=inspectorElement('details',undefined,'ns-review-section');
  const sources=side=>({nodes:[...comparison[side].nodes.values()],edges:[...comparison[side].edges.values()]});
  const original=R.revisedLongSection(sources('before'),baseline);
  const revised=R.revisedLongSection(sources('after'),baseline);
  section.append(inspectorElement('summary','Compare the open long section'));root.append(section);
  if(!R.sameProfileSteps(original.steps,baseline)){
    section.append(inspectorElement('p','Reopen the baseline route from the current source geometry before comparing revisions.'));return;
  }
  if(revised.issues.length){
    const reasons={'missing-link':'Link missing from the revised model','changed-endpoints':'Endpoints changed',
      'unconfirmed-direction':'Direction needs review','changed-classification':'Link type changed','source-route-gap':'Route continuity needs review'};
    const report=tableWithHeaders(['Link','Route comparison issue']);
    for(const issue of revised.issues)addCells(report.tBodies[0].insertRow(),[issue.name,reasons[issue.reason]]);
    section.append(inspectorElement('p','Review a route in the revised model to compare these assets.'),report);return;
  }
  const formatChainage=step=>step.chainageEnd===null?'Unknown after a source length gap':f(step.chainageEnd,4)+' m';
  section.append(inspectorElement('p',baseline.length+' typed links match in their original order. Baseline end chainage: '+
    formatChainage(baseline.at(-1))+'. Revised end chainage: '+formatChainage(revised.steps.at(-1))+'.'));
  const form=inspectorElement('form',undefined,'ns-review-actions');
  const revisionLabel=inspectorElement('label','Revised model revision'),revision=inspectorElement('input');
  const datumLabel=inspectorElement('label','Revised geometry datum'),datum=inspectorElement('input');
  const reviewLabel=inspectorElement('label','I reviewed the revised route source and datum'),confirm=inspectorElement('input');
  for(const control of [revision,datum]){control.type='text';control.maxLength=128;control.required=true;}
  confirm.type='checkbox';confirm.required=true;
  revisionLabel.append(revision);datumLabel.append(datum);reviewLabel.prepend(confirm);
  const apply=inspectorButton('Use revised route geometry'),message=inspectorElement('p');
  apply.type='submit';message.setAttribute('role','status');
  form.append(revisionLabel,datumLabel,reviewLabel,apply);section.append(form,message);
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!$('nsContextUnits').checked){message.textContent='Confirm the exported source geometry units first.';return;}
    const revisionId=revision.value.trim(),verticalDatum=datum.value.trim(),dialog=root.closest('dialog');
    if(!revisionId||!verticalDatum){message.textContent='Enter the reviewed model revision and datum.';return;}
    apply.disabled=true;
    try{
      const sha256=await routeGeometryDigest(revised.steps);
      if(!form.isConnected||!dialog.open||routeDraft.steps!==baseline)return;
      proposedRouteGeometry={baseline,steps:revised.steps,revision:revisionId,datum:verticalDatum,sha256};
      simulationView?.reset('Reviewed revised route geometry is available. Apply matching indexed results to compare exact samples.');
      dialog.close();$('nsRoute').hidden=false;displayProfile();
      status('Revised route geometry added to the open profile. The detailed schematic uses the baseline network.');
      $('nsClearRevisedGeometry').focus();
    }catch(error){message.textContent=conciseErrorMessage(error);}
    finally{apply.disabled=false;}
  };
}
function renderRevisionComparison(comparison){
  const root=$('nsRevisionComparison');
  root.replaceChildren();root.hidden=!comparison;root.open=false;
  if(!comparison)return;
  const groups=['Added','Removed','Modified'];
  const totals=Object.fromEntries(groups.map(group=>[group,comparison.rows.filter(row=>row.status===group).length]));
  const heading=inspectorElement('summary','Revision comparison · '+comparison.rows.length+' changed assets');
  root.append(heading,inspectorElement('p',groups.map(group=>group+' '+totals[group]).join(' · ')),
    inspectorElement('p','Nominal model changes identify evidence to review. Confirm any hydraulic impact using compatible simulation results.'));
  appendRevisedRouteReview(root,comparison);
  if(!comparison.rows.length)return;
  const controls=inspectorElement('div',undefined,'ns-review-actions');
  const statusLabel=inspectorElement('label','Change type'),statusSelect=inspectorElement('select');
  for(const group of ['All',...groups])statusSelect.add(new Option(group,group));
  statusLabel.append(statusSelect);
  const searchLabel=inspectorElement('label','Find changed asset'),search=inspectorElement('input');
  search.type='search';search.maxLength=256;searchLabel.append(search);
  const layerLabel=inspectorElement('label','Geometry layer'),layer=inspectorElement('select');
  for(const [name,label] of [['both','Baseline and revised'],['before','Baseline · dashed'],['after','Revised · solid']])
    layer.add(new Option(label,name));
  const scopeLabel=inspectorElement('label','Preview scope'),scope=inspectorElement('select');
  scope.setAttribute('aria-label','Preview scope');
  scope.add(new Option('Changed assets on this page','page'));scope.add(new Option('Full network context','network'));
  const impactLabel=inspectorElement('label','Only changes affecting assignments or evidence','ns-revision-impact-filter');
  const impactsOnly=inspectorElement('input');
  impactsOnly.setAttribute('aria-label','Only changes affecting assignments or evidence');
  impactsOnly.type='checkbox';
  layerLabel.append(layer);scopeLabel.append(scope);impactLabel.prepend(impactsOnly);
  const audit=inspectorButton('Download revision audit');
  controls.append(statusLabel,searchLabel,layerLabel,scopeLabel,impactLabel,audit);
  const preview=inspectorElement('div',undefined,'ns-revision-preview'), register=inspectorElement('div',undefined,'ns-review-table'),
    detail=inspectorElement('div',undefined,'ns-review-table'),nav=inspectorElement('div',undefined,'ns-review-actions'),
    currentPage=inspectorElement('span'),legend=inspectorElement('small');
  currentPage.setAttribute('role','status');
  let number=0,limit=30;
  const previous=inspectorButton('Previous page'),next=inspectorButton('Next page');
  nav.append(previous,next,currentPage);
  root.append(controls,legend,preview,nav,register,detail);
  const value=entry=>{
    if(entry===null)return 'Unavailable';
    if(typeof entry==='object'&&Object.hasOwn(entry,'value'))return String(entry.value)+(entry.unit?' '+entry.unit:'');
    return typeof entry==='object'?JSON.stringify(entry):String(entry);
  };
  function matching(){
    const needle=search.value.trim().toLowerCase();
    return comparison.rows.filter(row=>(statusSelect.value==='All'||row.status===statusSelect.value)&&
      (!impactsOnly.checked||row.monitorReview||row.evidenceReview)&&
      (!needle||row.id.toLowerCase().includes(needle)||row.name.toLowerCase().includes(needle)));
  }
  audit.onclick=()=>{
    const rows=[['Asset ID','Kind','Source name','Change','Field','Baseline','Revised','Affected item','Reference','Source SHA-256','Disposition']];
    for(const row of matching()){
      const asset=[row.id,row.kind==='edge'?'Link':'Node',row.name,row.status];
      if(row.changes.length){
        for(const change of row.changes)rows.push([...asset,change.field,value(change.before),value(change.after),'','','','']);
      }else rows.push([...asset,'','','','','','','']);
      for(const impact of revisionImpact(comparison,row))rows.push([...asset,'','','',...impact]);
    }
    downloadBlob('hydra-network-revision.csv',rows.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');
  };
  function display(){
    const filtered=matching();audit.disabled=!filtered.length;
    const rows=filtered.slice(number*limit,(number+1)*limit);
    const full=scope.value==='network';
    previous.disabled=number===0;next.disabled=(number+1)*limit>=filtered.length;
    currentPage.textContent=filtered.length?'Showing '+(number*limit+1)+'–'+(number*limit+rows.length)+' of '+filtered.length:'No matching changes.';
    legend.textContent='Baseline geometry is red. Revised geometry is teal. '+(full?
      'Gray shows the network around all filtered changes.':'The diagram shows changed assets on this page.');
    preview.replaceChildren(revisionGeometry(comparison,full?filtered:rows,layer.value,full));
    const table=tableWithHeaders(['Asset','Kind','Change','Fields','Review']);
    for(const row of rows){
      const inspect=inspectorButton(row.name);
      inspect.onclick=()=>{
        detail.replaceChildren(inspectorElement('h4',row.name+' · '+row.status+' · '+row.id));
        if(row.changes.length){
          const fields=tableWithHeaders(['Field','Baseline','Revised']);
          for(const item of row.changes)addCells(fields.tBodies[0].insertRow(),[item.field,value(item.before),value(item.after)]);
          detail.append(fields);
        }
        const impacts=revisionImpact(comparison,row);
        if(impacts.length){
          const affected=tableWithHeaders(['Affected item','Reference','Review on apply']);
          for(const [kind,reference,,review] of impacts)addCells(affected.tBodies[0].insertRow(),[kind,reference,review]);
          detail.append(inspectorElement('h4','Affected assignments and evidence'),affected);
        }
      };
      const impacts=[row.monitorReview?'Monitor location':'',row.evidenceReview?'Linked assessment or source evidence':''].filter(Boolean);
      addCells(table.tBodies[0].insertRow(),[inspect,row.kind==='edge'?'Link':'Node',row.status,
        [...new Set(row.changes.map(change=>change.category))].join(', '),impacts.join(', ')||'—']);
    }
    detail.replaceChildren();register.replaceChildren(table);
  }
  previous.onclick=()=>{number--;display();};next.onclick=()=>{number++;display();};
  statusSelect.onchange=impactsOnly.onchange=search.oninput=()=>{number=0;display();};
  layer.onchange=scope.onchange=display;display();
}

function mount(){
  const container=root();if(!container)return;
  container.innerHTML='<div id="nsWorkbench"><div class="ns-main-toolbar"><label>Year<select id="nsYear"></select></label><label>Evidence<select id="nsScenario"></select></label><label>Metric<select id="nsMetric"><option value="spill_count">Spill count</option><option value="duration_hours">Duration (h)</option></select></label><span id="nsModeLabel">Explore mode</span><button id="nsEdit">Edit network</button><button id="nsCapture">Capture PNG</button><details class="ns-export-menu"><summary>Save / Export / Load</summary><div class="ns-export-actions"><button id="nsSave">Save network</button><button id="nsLoad">Load network or context CSV</button><button id="nsCsv">Export evidence CSV</button></div></details><button id="nsClearMap" type="button">Clear map</button><input id="nsLoadInput" type="file" accept=".csv,.json" multiple hidden><span class="ns-network-legend">Network: <i class="ns-red"></i>Red <i class="ns-amber"></i>Amber <i class="ns-blue"></i>Blue</span></div>'+
    '<div id="nsEditTools" class="ns-edit-tools" hidden>'+selectHtml('id="nsAddType"',Object.entries(C.types).filter(([key])=>!['manhole','label'].includes(key)),'cso')+'<button id="nsAddAsset">+ Asset</button><button id="nsAddManhole">+ Manhole</button><button id="nsAddLabel">+ Label</button><button id="nsConnect" aria-pressed="false">Connect</button><span id="nsColourChoices"></span><button id="nsUndo" aria-label="Undo last edit">Undo</button><button id="nsDelete">Delete selected</button></div>'+
    '<div id="nsLayout"><div id="nsCanvas" tabindex="0" aria-label="Network schematic. Drag the background or use the middle mouse button to pan. Turn on Zoom to use the mouse wheel."><svg id="nsSvg" xmlns="'+NS+'" aria-label="Site network overview"></svg><section id="nsPicker" role="dialog" aria-label="Assign imported datasets" hidden></section><div class="ns-canvas-note">Connections show topology only</div><svg id="nsMinimap" viewBox="0 0 160 100" tabindex="0" role="img" aria-label="Network minimap. Click or drag to move the view. Arrow keys pan; Enter fits the network." hidden></svg><div id="nsContextActions" aria-label="Asset actions" hidden><button type="button" data-ns-context="focus">Focus selected</button><button type="button" data-ns-context="up">Trace upstream</button><button type="button" data-ns-context="down">Trace downstream</button><button type="button" data-ns-context="isolate">Isolate branch</button></div><div class="ns-camera-tools"><button id="nsPan" aria-pressed="false">Pan</button><button id="nsZoomMode" aria-pressed="false" title="Use the mouse wheel to zoom at the pointer. Drag with the middle mouse button to pan.">Zoom</button><button id="nsZoomOut" aria-label="Zoom out">−</button><span id="nsZoom">100%</span><button id="nsZoomIn" aria-label="Zoom in">+</button><button id="nsFit">Fit</button><button id="nsFocusSelected">Focus selected</button><button id="nsResetView">Reset view</button></div></div><aside id="nsPopup" aria-label="Selected asset evidence" hidden></aside><aside id="nsDrawer" aria-label="Asset properties" hidden></aside></div><p id="nsStatus" role="status" aria-live="polite">Create your site overview, then assign evidence to individual assets.</p></div>';
  mounted=true;container.addEventListener('click',onClick);container.addEventListener('change',event=>updateField(event.target));
  $('nsEdit').onclick=()=>{if(inOverview())changeOverview(false);editing=!editing;if(editing)clearHotspots();simulationView?.reset();simulationView?.refreshSources();popupVisible=false;tool='select';connectFrom=null;render();};
  $('nsAddAsset').onclick=()=>add($('nsAddType').value);$('nsAddManhole').onclick=()=>add('manhole');$('nsAddLabel').onclick=()=>add('label');
  $('nsConnect').onclick=()=>{tool=tool==='connect'?'select':'connect';connectFrom=null;render();status('Click the upstream point, then the downstream point.');};
  $('nsPan').onclick=()=>{tool=tool==='pan'?'select':'pan';connectFrom=null;render();};
  $('nsZoomMode').onclick=()=>{tool=tool==='zoom'?'select':'zoom';connectFrom=null;hideHover();render();
    status(tool==='zoom'?'Zoom mode on. Scroll the wheel to zoom at the pointer. Drag with the middle mouse button to pan.':'Zoom mode off. The wheel scrolls the page.');
  };
  $('nsUndo').onclick=()=>undoEdit();$('nsDelete').onclick=removeSelected;
  $('nsZoomIn').onclick=()=>zoom(1.25);$('nsZoomOut').onclick=()=>zoom(.8);$('nsFit').onclick=fit;
  $('nsFocusSelected').onclick=focusSelected;$('nsResetView').onclick=resetView;
  for(const [id,key] of [['nsYear','year'],['nsMetric','metric']])$(id).onchange=()=>{network[key]=$(id).value;changed(true);};
  $('nsScenario').onchange=()=>{const value=$('nsScenario').value;network.evidenceMode=value==='combined'?'combined':'single';if(value!=='combined')network.scenario=value==='observed'?'observed':value.slice(6);changed(true);};
  $('nsSave').onclick=()=>downloadBlob('hydra-network-schematic.json',JSON.stringify(snapshot(),null,2),'application/json');$('nsLoad').onclick=()=>$('nsLoadInput').click();
  const importDialog=document.createElement('dialog');
  importDialog.setAttribute('aria-labelledby','nsContextTitle');
  importDialog.innerHTML='<h3 id="nsContextTitle">Model Context Import Audit</h3><p id="nsContextAudit"></p><ul id="nsContextWarnings"></ul><details id="nsRevisionComparison" hidden></details><label id="nsContextUnitsLabel"><input id="nsContextUnits" type="checkbox"> Export uses metres for coordinates, lengths and levels, and millimetres for conduit dimensions and Colebrook–White roughness.</label><label id="nsContextLayoutLabel">Layout <select id="nsContextLayout"><option value="geographic">Geographic coordinates</option><option value="schematic">Engineering schematic</option></select></label><p id="nsContextMessage" role="status"></p><div class="actions"><button id="nsContextApply" type="button">Apply network context</button><button id="nsContextCancel" type="button">Cancel</button></div>';
  container.append(importDialog);
  let stagedContext=null,importGeneration=0;
  const clearDialog=document.createElement('dialog');
  clearDialog.setAttribute('aria-labelledby','nsClearMapTitle');
  clearDialog.setAttribute('aria-describedby','nsClearMapDescription');
  clearDialog.innerHTML='<h3 id="nsClearMapTitle">Clear map</h3><p id="nsClearMapDescription">Remove all assets, connections, schematic evidence, saved views and snapshots from this map? Imported source files are kept. Undo is available in Edit network until you reload.</p><form method="dialog" class="actions"><button autofocus value="cancel">Cancel</button><button id="nsConfirmClearMap" type="button">Clear map</button></form>';
  $('nsWorkbench').append(clearDialog);
  $('nsClearMap').onclick=()=>{if(canClearMap())clearDialog.showModal();};
  $('nsConfirmClearMap').onclick=()=>{
    if(!canClearMap()){clearDialog.close();return;}
    ++importGeneration;
    $('nsLoadInput').value='';
    clearDialog.close();clearMap();
  };
  importDialog.addEventListener('close',()=>{stagedContext=null;renderRevisionComparison(null);});
  $('nsContextCancel').onclick=()=>importDialog.close();
  $('nsContextApply').onclick=()=>{
    if(!stagedContext)return;
    if(stagedContext.format==='icm-csv-v1'&&!$('nsContextUnits').checked){
      $('nsContextMessage').textContent='Confirm the units used in the export.';return;
    }
    try{
      const revised=C.applyContextRevision(network,stagedContext.network,stagedContext.format);
      const first=!network.nodes.length;
      if(first&&$('nsContextLayout').value==='schematic'){
        const points=R.autoLayout(revised.nodes,revised.edges);
        for(const point of revised.nodes)Object.assign(point,points.get(point.id));
        for(const conduit of revised.edges)conduit.bends=[];
      }
      checkpoint();network=revised;resetRouteDraft();branchIsolated=false;selected=null;popupVisible=false;multi.clear();highlight=null;connectFrom=null;freshness.clear();
      simulationView?.refreshSources();render();if(first)fit();persist();
      status('Model context import: '+network.nodes.length+' nodes and '+network.edges.length+' links. Arrows follow nominal topology.');
      importDialog.close();
    }catch(error){$('nsContextMessage').textContent=error.message;}
  };
  $('nsLoadInput').onchange=async event=>{
    const request=++importGeneration;
    try{
      const files=[...event.target.files],file=files[0];
      if(!file)return;
      if(/\.csv$/i.test(file.name)){
        if(files.some(item=>!/\.csv$/i.test(item.name)))throw new Error('Select either network CSV tables together or one saved JSON schematic.');
        if(files.reduce((size,item)=>size+item.size,0)>32*1024*1024)throw new Error('Network context CSV selection exceeds 32 MiB.');
        const csvs=await Promise.all(files.map(async item=>{
          const data=await item.arrayBuffer();
          try{return new TextDecoder('utf-8',{fatal:true}).decode(data);}
          catch{return new TextDecoder('windows-1252').decode(data);}
        }));
        if(request!==importGeneration)return;
        const csv=csvs[0];
        const native=files.length>1||/^\s*\*{4}/.test(csv)||/(?:^|_)(node|conduit|pump|weir|orifice|sluice|flap_valve|screen|user_control|outlet)\.csv$/i.test(file.name)&&!csv.trimStart().startsWith('HydraBench');
        const imported=native?C.importNativeContext(csvs.map((text,index)=>({name:files[index].name,text}))):
          {network:C.importNetworkContext(csv),warnings:[]};
        const format=native?'icm-csv-v1':'canonical-v1';
        C.applyContextRevision(network,imported.network,format);
        stagedContext={...imported,format};
        renderRevisionComparison(network.contextFormat?C.revisionChanges(network,imported.network):null);
        $('nsContextAudit').textContent=imported.network.nodes.length+' imported nodes and '+imported.network.edges.length+' imported links. Arrows show nominal topology.';
        const warnings=$('nsContextWarnings');warnings.replaceChildren();
        const topology=R.audit(imported.network.nodes,imported.network.edges);
        const endpointPairs=new Set(imported.network.edges.map(edge=>JSON.stringify([edge.from,edge.to])));
        const messages=[...imported.warnings];
        if(topology.components.length>1)messages.push(topology.components.length+' disconnected components.');
        if(topology.isolated.length)messages.push(topology.isolated.length+' isolated nodes.');
        if(topology.cycleAffected.length)messages.push('Directed loops affect '+topology.cycleAffected.length+' nodes, including downstream nodes.');
        if(endpointPairs.size<imported.network.edges.length)messages.push('Parallel conduits share one or more directed endpoint pairs.');
        $('nsContextLayoutLabel').hidden=Boolean(network.nodes.length);
        $('nsContextLayout').value='geographic';
        if(network.nodes.length)messages.push('Apply only for a revised export of the same network. Compatible saved views, geometry, properties and evidence will be retained. Changed source attributes, geometry and connectivity invalidate affected results.');
        for(const warning of messages){const row=document.createElement('li');row.textContent=warning;warnings.append(row);}
        $('nsContextUnitsLabel').hidden=!native;
        $('nsContextUnits').checked=false;
        $('nsContextMessage').textContent='';
        if(!importDialog.open)importDialog.showModal();
      }else{
        if(files.length!==1)throw new Error('Select one saved JSON schematic.');
        const saved=JSON.parse(await file.text());
        if(request!==importGeneration)return;
        restore(saved);persist();
        status('Network restored. Reload matching source files to validate and calculate its evidence.');
      }
    }catch(error){if(request===importGeneration)status(error.message);}
    finally{if(request===importGeneration)event.target.value='';}
  };
  for(const id of ['nsSave','nsLoad','nsCsv']){const action=$(id).onclick;$(id).onclick=()=>{document.querySelector('.ns-export-menu').open=false;action?.();};}
  document.addEventListener('click',event=>{const menu=root()?.querySelector('.ns-export-menu');if(menu&&!menu.contains(event.target))menu.open=false;});
  root().addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=root().querySelector('.ns-export-menu');if(menu?.open){menu.open=false;menu.querySelector('summary').focus();}}});
  $('nsCsv').onclick=()=>{root().querySelector('.ns-export-menu').open=false;exportRows();};$('nsCapture').onclick=()=>capture().catch(error=>status(error.message));
  const canvas=$('nsCanvas');canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',onPointerUp);canvas.addEventListener('pointercancel',onPointerUp);
  canvas.addEventListener('lostpointercapture',onPointerUp);
  const svg=$('nsSvg');
  svg.addEventListener('wheel',onWheel,{passive:false});
  svg.addEventListener('contextmenu',showContext);
  $('nsContextActions').onclick=event=>{
    const action=event.target.closest('[data-ns-context]')?.dataset.nsContext;
    if(!action)return;
    closeContext(true);
    if(action==='focus')focusSelected();
    else if(action==='isolate'){if(!highlight||traceOwner!==selectionKind+':'+selected)traceSelection('down');if(!branchIsolated)toggleIsolation();}
    else traceSelection(action);
  };
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#nsContextActions'))closeContext();});
  const map=$('nsMinimap');
  map.addEventListener('pointerdown',event=>{
    if(event.button!==0||minimapPointer!==null)return;
    minimapPointer=event.pointerId;map.setPointerCapture(event.pointerId);panFromMinimap(event);
  });
  map.addEventListener('pointermove',event=>{if(minimapPointer===event.pointerId)panFromMinimap(event);});
  const endMinimap=event=>{if(minimapPointer===event.pointerId){minimapPointer=null;renderCanvas();persist();}};
  map.addEventListener('pointerup',endMinimap);map.addEventListener('pointercancel',endMinimap);
  map.addEventListener('lostpointercapture',endMinimap);
  map.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();fit();}});

  canvas.addEventListener('auxclick',event=>{if(event.button===1&&(event.target===canvas||svg.contains(event.target)))event.preventDefault();});

  $('nsPicker').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSourcePicker();}});
  canvas.addEventListener('keydown',event=>{if(event.target.closest('#nsPopup,#nsPicker'))return;const n=event.target.closest('[data-ns-node]'),e=event.target.closest('[data-ns-edge]');if(['Enter',' '].includes(event.key)&&(n||e)){event.preventDefault();inspectObject(n?{kind:'node',id:n.dataset.nsNode}:{kind:'edge',id:e.dataset.nsEdge});return;}
    if((event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')&&(n||e)){
      const r=event.target.getBoundingClientRect();
      showContext({target:event.target,clientX:r.x+r.width/2,clientY:r.y+r.height/2,preventDefault:()=>event.preventDefault()});return;
    }
    if(event.key==='Escape'){if(!$('nsContextActions').hidden){closeContext(true);return;}connectFrom=null;popupVisible=false;$('nsPicker').hidden=true;renderPopup();return;}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const target=event.target.id!=='nsMinimap'&&editing&&!prefs().locked&&!node()?.pinned&&node();if(target){checkpoint();target.x+=event.key==='ArrowLeft'?-10:event.key==='ArrowRight'?10:0;target.y+=event.key==='ArrowUp'?-10:event.key==='ArrowDown'?10:0;}else{network.camera.x+=event.key==='ArrowLeft'?30:event.key==='ArrowRight'?-30:0;network.camera.y+=event.key==='ArrowUp'?30:event.key==='ArrowDown'?-30:0;}changed(true);}
  });
  container.addEventListener('input',event=>{if(event.target.id==='nsSourceSearch'){const value=event.target.value.toLowerCase();container.querySelectorAll('[data-ns-file-name]').forEach(row=>row.hidden=!row.dataset.nsFileName.includes(value));}});
  observer=new ResizeObserver(()=>renderCanvas());observer.observe(canvas);
  // Flush the latest edit before a rapid refresh/close, rather than losing
  // changes still waiting in the short autosave debounce.
  window.addEventListener('pagehide',flushSave);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave();});
  window.addEventListener('icm:source-pool-changed',()=>{freshness.clear();if(analysisContext){++analysisGeneration;globalThis.Plotly?.purge('nsAnalysisPlot');$('nsAnalysisCounts').replaceChildren(annualTable(network.nodes.find(n=>n.id===analysisContext.id)||{id:'missing',bindings:[]},true));$('nsCommonResult').hidden=true;$('nsAnalysisMessage').textContent='Sources changed. Reopen this analysis to refresh.';}renderCanvas();renderReview();if(editing)renderDrawer();});
  mountReview();mountRouteReview();mountGeometryView();mountSimulationView();mountHotspots();render();
}
async function open(){
  if(!mounted){let value=state.networkSchematicWorkspace;if(!value){try{value=JSON.parse(localStorage.getItem(STORE)||'null');}catch{}}
    if(value){try{network=C.validateNetwork(value);}catch(error){network=C.empty();}}
    mount();
    if(inOverview())fit();
  }else render();
}
const resumeReview={
  capture(){
    if(!mounted||editing)return null;
    const item=node()||edge(),expanded=$('nsProfileExpanded').open;
    if(!item&&!expanded)return null;
    const analysis=item&&analysisContext?.id===item.id&&analysisContext.signature===signature(item)?
      {mode:analysisContext.mode,year:Number($('nsAnalysisYear').value),basis:analysisContext.signature}:null;
    return {item,kind:selectionKind,tab:inspectorTab,popup:popupVisible,analysis,
      profileRevision:expanded?routeRevision:null};
  },
  restore(context){
    if(!mounted||editing)return;
    const objects=context.kind==='node'?network.nodes:network.edges;
    if(context.item&&objects.includes(context.item)){
      selected=context.item.id;selectionKind=context.kind;inspectorTab=context.tab;popupVisible=context.popup;
      multi=context.kind==='node'?new Set([selected]):new Set();hideHover();renderCanvas();renderReview();
      if(context.analysis&&context.analysis.basis===signature(context.item))
        void openAnalysis(context.analysis.mode,context.analysis.year);
    }
    if(context.profileRevision===routeRevision&&!$('nsProfile').hidden&&!$('nsProfileExpanded').open)
      $('nsExpandProfile').click();
  },
};
window.ICMNetworkSchematic={open,snapshot,restore,capture,calculate,openMonitorImport,showDetrimentHotspots,reportGeometry,resumeReview,core:C,debug:()=>({selected,editing,busy,fresh:network.nodes.map(n=>({id:n.id,fresh:isFresh(n)}))})};
})();
