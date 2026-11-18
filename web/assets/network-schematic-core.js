/* Pure schematic contracts. No shared workspace/analysis state. */
(()=>{'use strict';
const colours={red:'#b93838',amber:'#b88112',blue:'#356fa8'};
const types={cso:'CSO',storm:'Storm overflow',emergency:'Emergency overflow',pump:'Pumping station',wwtw:'Treatment works',tank:'Storm tank',junction:'Junction',outfall:'Outfall',manhole:'Manhole',label:'Pointer label'};
const stamp=value=>String(value||'').slice(0,19);
function mainYear(start,end){
  // Treat wall-clock components as UTC for arithmetic, irrespective of the
  // browser timezone. This does not convert or discard source timezones.
  const a=Date.parse(stamp(start)+'Z'),b=Date.parse(stamp(end)+'Z');
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return null;
  let best=null,span=-1;
  for(let y=Number(stamp(start).slice(0,4));y<=Number(stamp(end).slice(0,4));y++){
    const duration=Math.max(0,Math.min(b,Date.UTC(y+1,0,1))-Math.max(a,Date.UTC(y,0,1)));
    if(duration>0&&duration>=span){span=duration;best=y;}
  }
  return best;
}
function rag(observed,modelled){
  if(observed===null||observed===undefined||modelled===null||modelled===undefined)return null;
  const a=Number(observed),b=Number(modelled);if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0)return null;
  const difference=a===0?(b===0?0:Infinity):100*Math.abs(b-a)/a;
  return difference<=5+1e-9?'green':difference<=10+1e-9?'amber':'red';
}
function mask(exclusions,start,end){return (exclusions||[]).map(x=>[stamp(x.start)>start?stamp(x.start):start,stamp(x.end)<end?stamp(x.end):end]).filter(([a,b])=>a<b).sort();}
function comparable(a,b,confirmed,metric='spill_count'){
  if(!a||!b||!a.eligible||!b.eligible)return 'Both sources need eligible reporting data.';
  if(!confirmed)return 'Confirm matching clocks and model/rainfall basis for this asset.';
  if(metric==='spill_count'&&(a.count_status!=='definitive'||b.count_status!=='definitive'))return 'Counts are provisional; resolve gaps, exclusions or initial context.';
  if(stamp(a.analysis_start)!==stamp(b.analysis_start)||stamp(a.analysis_end)!==stamp(b.analysis_end))return 'Individual assessment periods differ.';
  // Compare spill outcomes (counts / hours), not the sensor values that
  // establish spilling. Level, flow and binary status can describe the same
  // discharge using independently defined units, datums and threshold rules.
  if(!a.unit||!b.unit)return 'Assign units to both evidence sources.';
  for(const field of ['valid_hours','unknown_hours','excluded_hours'])if(Math.abs(Number(a[field])-Number(b[field]))>1/3600)return 'Temporal support differs.';
  const start=stamp(a.analysis_start),end=stamp(a.analysis_end);
  if(JSON.stringify(mask(a.exclusions,start,end))!==JSON.stringify(mask(b.exclusions,start,end)))return 'Exclusion masks differ.';
  return '';
}
// Fixed screen-size ports keep each connection independent at its asset boundary.
function bounds(type){return type==='manhole'?{x:8,y:8,circle:true}:type==='label'?{x:3,y:3,circle:true}:type==='junction'?{x:24,y:24}:{x:38,y:28};}
function connectionRoutes(nodes,edges,project=v=>v){
  const byId=new Map(nodes.map(n=>[n.id,n])),positions=new Map(nodes.map(n=>[n.id,project(n)])),bins=new Map(),ports=new Map(),routes=new Map();
  const waypoints=new Map(edges.map(e=>[e.id,(e.bends||[]).map(project)]));
  function face(n,target){const p=positions.get(n.id),box=bounds(n.type),dx=target.x-p.x,dy=target.y-p.y;return Math.abs(dx)/box.x>=Math.abs(dy)/box.y?(dx>=0?'right':'left'):(dy>=0?'bottom':'top');}
  for(const e of edges){
    const a=byId.get(e.from),b=byId.get(e.to);if(!a||!b)continue;
    const bends=waypoints.get(e.id);
    for(const [n,other,target] of [[a,b,bends[0]||positions.get(b.id)],[b,a,bends.at(-1)||positions.get(a.id)]]){const side=face(n,target),key=n.id+'|'+side;if(!bins.has(key))bins.set(key,[]);bins.get(key).push({n,other,target,e,side});}
  }
  for(const peers of bins.values()){
    const centre=positions.get(peers[0].n.id),angle=x=>Math.atan2(x.target.y-centre.y,x.target.x-centre.x);
    peers.sort((x,y)=>angle(x)-angle(y)||String(x.e.id).localeCompare(String(y.e.id)));
    peers.forEach((x,index)=>{
      const box=bounds(x.n.type),spread=peers.length>1?(index-(peers.length-1)/2)/Math.max(1,(peers.length-1)/2):0;
      let port;
      if(box.circle){const t=angle(x)+spread*.45;port={x:centre.x+box.x*Math.cos(t),y:centre.y+box.y*Math.sin(t)};}
      else if(x.side==='right'||x.side==='left')port={x:centre.x+(x.side==='right'?box.x:-box.x),y:centre.y+spread*(box.y-9)};
      else port={x:centre.x+spread*(box.x-9),y:centre.y+(x.side==='bottom'?box.y:-box.y)};
      if(!ports.has(x.e.id))ports.set(x.e.id,new Map());ports.get(x.e.id).set(x.n.id,port);
    });
  }
  for(const e of edges){
    const pair=ports.get(e.id);if(!pair)continue;
    let start=pair.get(e.from),end=pair.get(e.to);
    const bends=waypoints.get(e.id),pa=positions.get(e.from),pb=positions.get(e.to);
    let points=[start,...bends,end];
    const segmentLengths=()=>points.slice(1).map((p,i)=>({a:points[i],b:p,length:Math.hypot(p.x-points[i].x,p.y-points[i].y)}));
    let segments=segmentLengths(),length=segments.reduce((s,p)=>s+p.length,0);
    if(length<12||(!bends.length&&((end.x-start.x)*(pb.x-pa.x)+(end.y-start.y)*(pb.y-pa.y))<=0)){
      if(!e.contextSource)continue;
      // Imported geometry survives when fixed-size symbols overlap at overview scale.
      start=pa;end=pb;points=[start,...bends,end];
      segments=segmentLengths();length=segments.reduce((s,p)=>s+p.length,0);
    }
    const along=fraction=>{let remaining=length*fraction;for(const s of segments){if(!s.length)continue;if(remaining<=s.length){const ux=(s.b.x-s.a.x)/s.length,uy=(s.b.y-s.a.y)/s.length;return {x:s.a.x+ux*remaining,y:s.a.y+uy*remaining,ux,uy,size:Math.min(10,s.length/2)};}remaining-=s.length;}return {x:end.x,y:end.y,ux:1,uy:0,size:10};};
    const tip=along(.72),middle=along(.5),{ux,uy,size}=tip;
    routes.set(e.id,{start,end,points,path:points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(''),label:{x:middle.x-middle.uy*10,y:middle.y+middle.ux*10},arrow:length<12?[]:[{x:tip.x,y:tip.y},{x:tip.x-ux*size-uy*4,y:tip.y-uy*size+ux*4},{x:tip.x-ux*size+uy*4,y:tip.y-uy*size-ux*4}]});
  }
  return routes;
}
function connector(e,nodes,edges,project=v=>v){return connectionRoutes(nodes,edges,project).get(e.id)||null;}
function labelOffset(n){return n.nameOffset||(['manhole','label'].includes(n.type)?n.labelOffset||{x:30,y:-20}:{x:0,y:-35});}
function labelLeader(n){
  const p=labelOffset(n),small=['manhole','label'].includes(n.type),box=bounds(n.type);
  if(!small&&!n.nameOffset)return null;
  if(!small&&Math.abs(p.x)<1&&Math.abs(p.y+35)<1)return null;
  const dx=p.x,dy=p.y+4,length=Math.hypot(dx,dy);if(!length)return null;
  const ux=dx/length,uy=dy/length,d=box.circle?box.x:Math.min(ux?box.x/Math.abs(ux):Infinity,uy?box.y/Math.abs(uy):Infinity);
  if(length<=d+6)return null;
  const start={x:ux*d,y:uy*d},end={x:dx,y:dy};
  return {start,end,arrow:[start,{x:start.x+ux*6-uy*3,y:start.y+uy*6+ux*3},{x:start.x+ux*6+uy*3,y:start.y+uy*6-ux*3}]};
}
function summaryRows(rows,year,metric,confirmed,fresh,scenarios=[]){
  const selectedYear=year==='all'?Math.max(...rows.filter(r=>r.eligible).map(r=>r.year),...(!rows.some(r=>r.eligible)?rows.map(r=>r.year):[])):Number(year);
  const selected=rows.filter(r=>r.year===selectedYear),observed=selected.find(r=>r.role==='observed');
  const names=[...new Set([...scenarios,...rows.filter(r=>r.role==='model').map(r=>r.scenario)])].sort();
  const item=(label,r,model=false)=>{const reason=!fresh?'Recalculation required.':!r?.eligible?'No eligible evidence for this year.':model?comparable(observed,r,confirmed,metric):'';return {label,value:fresh&&r?.eligible?r[metric]:null,rag:model&&!reason?rag(observed[metric],r[metric]):null,reason,stale:!fresh};};
  return {year:Number.isFinite(selectedYear)?selectedYear:null,items:[item('O',observed),...names.map(name=>item('M ('+name+')',selected.find(r=>r.role==='model'&&r.scenario===name),true))]};
}
function summaryYears(rows,year,metric,confirmed,fresh,scenarios=[],assignedYears=[]){
  const years=year==='all'?[...new Set([...assignedYears,...rows.map(r=>r.year)])].sort((a,b)=>a-b):[Number(year)];
  return years.map(y=>summaryRows(rows,y,metric,confirmed,fresh,scenarios));
}
function unitFactor(quantity,unit){
  const u=String(unit||'').trim().toLowerCase().replace(/³/g,'3').replace(/\s/g,'');
  if(quantity==='status')return u==='1'?1:null;
  if(['depth','level'].includes(quantity))return {m:1,mm:.001}[u]??null;
  if(quantity==='flow')return {'m3/s':1,'l/s':.001,'ml/d':1000/86400,'m3/d':1/86400}[u]??null;
  return null;
}
function valueScale(quantity,storedUnit,selectedUnit){
  const target=unitFactor(quantity,selectedUnit);if(target===null)throw new Error('Assign a supported unit for '+quantity+'.');
  // Unknown units are an explicit assignment: preserve source numbers.
  if(!storedUnit||quantity==='status')return 1;
  const source=unitFactor(quantity,storedUnit);if(source===null)throw new Error('Source values are in '+storedUnit+'; select a matching quantity.');
  return source/target;
}
function thresholdRule(b){return b.comparison||(b.quantity==='flow'?'gt':'ge');}
function effectiveThreshold(b,defaults){
  const own=b.threshold,raw=own===''||own===null||own===undefined?defaults?.[b.role==='observed'?'observed':'model']:own;
  if(raw===null||raw===undefined||typeof raw==='boolean'||String(raw).trim()===''||!Number.isFinite(Number(raw)))throw new Error('Enter a finite threshold for '+b.sourceName+'.');
  return {value:Number(raw),comparison:thresholdRule(b),source:own===''||own===null||own===undefined?'asset default':'source override'};
}
function samePeriod(a,b){return Boolean(a?.analysis_start&&b?.analysis_start&&stamp(a.analysis_start)===stamp(b.analysis_start)&&stamp(a.analysis_end)===stamp(b.analysis_end));}
function evidenceRows(rows,year='all'){
  const filtered=rows.filter(r=>year==='all'||String(r.year)===String(year)),obs=filtered.filter(r=>r.role==='observed'),models=filtered.filter(r=>r.role==='model'),used=new Set(),out=[];
  for(const model of models){const observed=obs.find(o=>o.year===model.year&&samePeriod(o,model));if(observed)used.add(observed);out.push({year:model.year,scenario:model.scenario,observed,model});}
  for(const observed of obs)if(!used.has(observed))out.push({year:observed.year,scenario:'Observed',observed,model:null});
  return out.sort((a,b)=>a.year-b.year||a.scenario.localeCompare(b.scenario));
}
function validateYears(value){
  const years=String(value??'').split(/[\s,;]+/).filter(Boolean).map(Number);
  if(!years.length||years.some(y=>!Number.isInteger(y)||y<1900||y>2200))throw new Error('Enter reporting years separated by commas (1900–2200).');
  return [...new Set(years)].sort((a,b)=>a-b);
}
function empty(){return {schema:2,nodes:[],edges:[],camera:{x:0,y:0,zoom:1},year:'all',scenario:'observed',evidenceMode:'combined',metric:'spill_count',preferences:{snap:false,locked:false,detail:'auto',type:'all',health:'all',result:'all',scenarios:null},views:[],reviewSnapshots:[]};}
function validateInspectorProperties(object){
  const bounded=(value,max)=>typeof value==='string'&&value.length<=max;
  if(object.monitorId!==undefined&&!bounded(object.monitorId,128))throw new Error('Invalid monitoring association.');
  const source=object.sourceAttributes;
  if(source!==undefined){
    if(!source||!bounded(source.table,128)||!bounded(source.file,512)||!Number.isSafeInteger(source.row)||source.row<1||
       !Array.isArray(source.fields)||source.fields.length>512||
       source.fields.some(field=>!field||!bounded(field.name,256)||!field.name.trim()||
         !bounded(field.label,512)||!bounded(field.unit,128)||!bounded(field.value,32768)))
      throw new Error('Invalid imported asset attributes.');
  }
  const links=object.seriesLinks;
  if(links!==undefined&&(!Array.isArray(links)||links.length>100||links.some(link=>!link||
      !bounded(link.sourceId,128)||!bounded(link.sourceName,1024)||!bounded(link.sha256,128)||!link.sha256||
      !bounded(link.column,512)||!link.column)))throw new Error('Invalid asset time series reference.');
  const custom=object.customProperties;
  if(custom!==undefined){
    if(!Array.isArray(custom)||custom.length>64||
       custom.some(field=>!field||!bounded(field.name,128)||!field.name.trim()||!bounded(field.value,4096)||!bounded(field.unit,64))||
       new Set(custom.map(field=>field.name.trim().toLowerCase())).size!==custom.length)
      throw new Error('Invalid or duplicate custom asset properties.');
  }
}
function validateNetwork(value){
  if(!value||![1,2].includes(value.schema)||!Array.isArray(value.nodes)||!Array.isArray(value.edges))throw new Error('Unsupported network schematic file.');
  if(value.nodes.length>2000||value.edges.length>5000)throw new Error('This overview supports up to 2,000 points and 5,000 connectors.');
  const ids=new Set();
  for(const n of value.nodes){
    if(!n.id||ids.has(n.id)||!Object.hasOwn(types,n.type)||!Object.hasOwn(colours,n.colour)||typeof n.name!=='string'||!Number.isFinite(n.x)||!Number.isFinite(n.y)||Math.abs(n.x)>1e6||Math.abs(n.y)>1e6)throw new Error('Invalid or duplicate schematic point.');
    if(!Array.isArray(n.bindings)||n.bindings.length>1000||!Array.isArray(n.exclusions||[]))throw new Error('Invalid asset evidence.');
    const bindingIds=new Set();
    for(const b of n.bindings){if(b?.comparison&&!['gt','ge'].includes(b.comparison))throw new Error('Invalid threshold rule.');if(!b||typeof b.id!=='string'||!b.id||bindingIds.has(b.id)||!['observed','model'].includes(b.role)||typeof b.scenario!=='string'||typeof b.sourceName!=='string'||typeof b.sha256!=='string'||typeof b.column!=='string'||!Array.isArray(b.years)||b.years.some(y=>!Number.isInteger(y)||y<1900||y>2200))throw new Error('Invalid source assignment.');bindingIds.add(b.id);}
    if(n.applied&&(!Array.isArray(n.applied.rows)||typeof n.applied.signature!=='string'))throw new Error('Invalid saved assessment.');
    for(const r of n.applied?.rows||[])if(!Number.isInteger(r.year)||r.year<1900||r.year>2200||!['observed','model'].includes(r.role)||typeof r.scenario!=='string'||typeof r.eligible!=='boolean'||[r.spill_count,r.duration_hours].some(v=>v!==null&&(!Number.isFinite(v)||v<0))||[r.analysis_start,r.analysis_end].some(v=>v!==null&&typeof v!=='string'))throw new Error('Invalid saved evidence row.');
    if(n.labelOffset&&![n.labelOffset.x,n.labelOffset.y].every(Number.isFinite))throw new Error('Invalid label pointer.');
    if(n.nameOffset&&![n.nameOffset.x,n.nameOffset.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=10000))throw new Error('Invalid asset label placement.');
    n.defaults=n.defaults||{observed:'',model:''};n.gap=n.gap||900;n.exclusions=n.exclusions||[];
    ids.add(n.id);
  }
  const edges=new Set();for(const e of value.edges){if(!e.id||edges.has(e.id)||!ids.has(e.from)||!ids.has(e.to)||e.from===e.to||!Object.hasOwn(colours,e.colour))throw new Error('Invalid connector.');if(e.bends!==undefined&&(!Array.isArray(e.bends)||e.bends.length>32||e.bends.some(p=>!p||![p.x,p.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6))))throw new Error('Invalid connector bends (maximum 32).');edges.add(e.id);}
  for(const object of [...value.nodes,...value.edges]){
    validateInspectorProperties(object);
    if(object.detrimentLinks===undefined)continue;
    const links=object.detrimentLinks;
    if(!object.contextSource||!links||typeof links!=='object'||Array.isArray(links)||
       Object.entries(links).some(([kind,link])=>!['flooding','level','spill'].includes(kind)||
         typeof link?.id!=='string'||!link.id||link.id.length>512||
         typeof link.signature!=='string'||!link.signature||link.signature.length>32768))
      throw new Error('Invalid detriment association.');
  }
  if(value.evidenceMode!==undefined&&!['single','combined'].includes(value.evidenceMode))throw new Error('Invalid evidence display mode.');
  const result=JSON.parse(JSON.stringify(value));
  result.schema=2;
  result.preferences={snap:false,locked:false,detail:'auto',type:'all',health:'all',result:'all',scenarios:null,...result.preferences};
  if(!['auto','full','minimal'].includes(result.preferences.detail)||!['all',...Object.keys(types)].includes(result.preferences.type)||!['all','ready','missing','stale','provisional','short','unassigned','uncalculated'].includes(result.preferences.health)||!['all','green','amber','red','neutral'].includes(result.preferences.result)||![result.preferences.snap,result.preferences.locked].every(v=>typeof v==='boolean')||result.preferences.scenarios!==null&&(!Array.isArray(result.preferences.scenarios)||result.preferences.scenarios.length>1000||result.preferences.scenarios.some(s=>typeof s!=='string'||s.length>100)))throw new Error('Invalid schematic display preferences.');
  for(const n of result.nodes){if(n.pinned!==undefined&&typeof n.pinned!=='boolean')throw new Error('Invalid pinned point.');if(n.review&&(typeof n.review.comment!=='string'||n.review.comment.length>10000||!['unreviewed','in-review','reviewed'].includes(n.review.status)))throw new Error('Invalid review note.');}
  for(const e of result.edges){if(e.labelOffset&&![e.labelOffset.x,e.labelOffset.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=10000))throw new Error('Invalid connector label placement.');if(e.review&&(typeof e.review.comment!=='string'||e.review.comment.length>10000||!['unreviewed','in-review','reviewed'].includes(e.review.status)))throw new Error('Invalid connector review.');}
  result.views=result.views||[];result.reviewSnapshots=result.reviewSnapshots||[];
  if(!Array.isArray(result.views)||result.views.length>30||!Array.isArray(result.reviewSnapshots)||result.reviewSnapshots.length>20)throw new Error('Invalid saved review views.');
  for(const view of result.views)if(typeof view.name!=='string'||view.name.length>100||!Array.isArray(view.positions)||view.positions.length>2000||!view.camera||![view.camera.x,view.camera.y,view.camera.zoom].every(Number.isFinite)||view.camera.zoom<.002||view.camera.zoom>4||view.positions.some(p=>typeof p.id!=='string'||![p.x,p.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6)))throw new Error('Invalid saved view.');
  for(const view of result.views){
    if(view.edges!==undefined&&(!Array.isArray(view.edges)||view.edges.length>5000)||view.evidenceMode!==undefined&&!['single','combined'].includes(view.evidenceMode)||view.metric!==undefined&&!['spill_count','duration_hours'].includes(view.metric))throw new Error('Invalid saved view display.');
    const test={...result,views:[],reviewSnapshots:[],camera:view.camera,preferences:view.preferences||result.preferences};
    const positions=new Map(view.positions.map(p=>[p.id,p])),geometry=new Map((view.edges||[]).map(e=>[e.id,e]));
    test.nodes=result.nodes.map(n=>({...n,...positions.get(n.id)}));test.edges=result.edges.map(e=>({...e,...geometry.get(e.id)}));
    validateNetwork(test);
  }
  for(const saved of result.reviewSnapshots)if(typeof saved.name!=='string'||saved.name.length>100||typeof saved.saved_at!=='string'||!saved.network||!Array.isArray(saved.network.nodes)||!Array.isArray(saved.network.edges)||saved.network.nodes.length>2000||saved.network.edges.length>5000)throw new Error('Invalid review snapshot.');
  for(const saved of result.reviewSnapshots){if(saved.network.views?.length||saved.network.reviewSnapshots?.length)throw new Error('Nested review snapshots are unsupported.');saved.network=validateNetwork(saved.network);}
  result.camera=result.camera||{x:0,y:0,zoom:1};
  if(![result.camera.x,result.camera.y,result.camera.zoom].every(Number.isFinite)||result.camera.zoom<.002||result.camera.zoom>4)throw new Error('Invalid schematic camera.');
  return result;
}
function readContextRow(line,lineNumber){
  const fields=[];
  const item=/("(?:[^"]|"")*"|[^",]*)(?:,|$)/gy;
  for(let offset=0;offset<line.length;){
    const match=item.exec(line);
    if(!match||item.lastIndex<=offset)throw new Error('Network context row '+lineNumber+': malformed CSV fields.');
    fields.push(match[1].startsWith('"')?match[1].slice(1,-1).replaceAll('""','"'):match[1]);
    offset=item.lastIndex;
  }
  if(line.endsWith(','))fields.push('');
  return fields;
}
// Read metric InfoWorks node and link exports. Unknown blocks are disclosed in the audit.
const nativeLinks=new Set(['hw_conduit','hw_pump','hw_weir','hw_sluice','hw_flap_valve','hw_screen','hw_user_control','hw_orifice','hw_outlet']);
function nativeContextText(name,text){
  if(/^\s*\*{4}/.test(text))return text.trimStart();
  // Separate-table exports identify the section in the filename.
  const table=/(?:^|_)(node|conduit|pump|weir|sluice|screen|user_control|orifice|flap_valve|outlet|subcatchment|deletes)\.csv$/i.exec(name)?.[1];
  if(table)return '**** '+(table.toLowerCase()==='deletes'?'deletes':'hw_'+table.toLowerCase())+'\n'+text;
  const records=splitNativeRecords(text).filter(record=>record.line.trim());
  const first=records[0];
  const header=first?readContextRow(first.line,first.row).map(value=>value.trim().toLowerCase()):[];
  const typeColumn=header.indexOf('objecttable');
  if(typeColumn>=0){
    const types=new Set(records.slice(1).map(({line,row})=>
      readContextRow(line,row)[typeColumn]?.trim().toLowerCase()).filter(value=>/^hw_[a-z0-9_]+$/.test(value||'')));
    if(types.size===1)return '**** '+[...types][0]+'\n'+text;
    if(!types.size)return '**** hw_empty_table\n'+text;
  }
  throw new Error('Keep the ICM table suffix on separate CSV files (for example, network_node.csv).');
}
function splitNativeRecords(text){
  const records=[];let start=0,row=1,startRow=1,quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='"'){
      if(quoted&&text[i+1]==='"')i++;
      else quoted=!quoted;
    }
    if(char==='\n'){
      if(!quoted){
        records.push({line:text.slice(start,i).replace(/\r$/,''),row:startRow});
        start=i+1;startRow=row+1;
      }
      row++;
    }
  }
  if(quoted)throw new Error('Network context row '+startRow+': unterminated CSV quote.');
  if(start<text.length)records.push({line:text.slice(start).replace(/\r$/,''),row:startRow});
  return records;
}
function importNativeContext(input){
  const inputs=Array.isArray(input)?input:[{name:'',text:input}];
  const lines=inputs.flatMap(({name,text})=>{
    const original=text.replace(/^\uFEFF/,'');
    const combined=/^\s*\*{4}/.test(original);
    const content=name&&!combined?nativeContextText(name,original):original;
    return splitNativeRecords(content).map(({line,row})=>({
      line,file:name,sourceRow:row-(name&&!combined?1:0),
    }));
  });
  const network=empty(),nodes=new Map(),blocks=new Set(),warnings=new Set();
  const nodeTypes=new Map([['manhole','manhole'],['outfall','outfall'],['outfall 2d','outfall'],
    ['storage','tank'],['pond','tank'],['break','junction'],['connect 2d','junction']]);
  const supported=type=>type==='hw_node'||nativeLinks.has(type);
  let section=null,headers=null,fieldNames=[],fieldLabels=[],fieldUnits=[],leadingMetadata=true;
  const pending=[];
  for(const [index,{line,file,sourceRow}] of lines.entries()){
    if(!line.trim())continue;
    const block=/^\s*\*{4}\s*([a-z0-9_]+)\s*$/i.exec(line);
    const fail=message=>{throw new Error('ICM context row '+(index+1)+': '+message);};
    if(block){
      section=block[1].toLowerCase();headers=null;fieldLabels=[];fieldUnits=[];leadingMetadata=true;
      if(section==='deletes')fail('delete instructions are not supported.');
      if(blocks.has(section)&&supported(section))fail('duplicate network table.');
      blocks.add(section);
      if(!supported(section))warnings.add('Skipped '+section+' table.');
      continue;
    }
    if(!section)fail('expected a native table delimiter.');
    if(!supported(section))continue;
    const raw=readContextRow(line,index+1),fields=raw.map(value=>value.trim());
    if(!headers){
      fieldNames=fields;
      headers=fields.map(value=>value.toLowerCase());
      if(new Set(headers.filter(Boolean)).size!==headers.filter(Boolean).length)fail('duplicate field names.');
      const required=section==='hw_node'?['node_id','x','y']:['link_suffix'];
      if(required.some(key=>!headers.includes(key))||
         section==='hw_conduit'&&(!headers.some(key=>['us_node_id','upstream_node_id'].includes(key))||
           !headers.some(key=>['ds_node_id','downstream_node_id'].includes(key))))fail('missing required network fields.');
      continue;
    }
    if(fields.length!==headers.length)fail('field count differs from the header.');
    const row=Object.fromEntries(headers.map((name,i)=>[name,fields[i]]));
    if(leadingMetadata){
      const key=section==='hw_node'?row.node_id:row.us_node_id??row.upstream_node_id;
      const coordinateTokens=[row.x,row.y].map(value=>String(value??'').toLowerCase());
      const lengthToken=String(row.conduit_length??'').toLowerCase();
      const lengthUnit=/^(?:m|mm|cm|ft|feet|metres?|meters?|millimetres?|millimeters?|in|inches)$/;
      const description=section==='hw_node'?
        /^node[ _]id$/i.test(key)&&coordinateTokens.some(token=>/coordinate|^easting$|^northing$/.test(token)):
        /^(?:(?:us|upstream)[ _]node[ _]id)$/i.test(key)&&/^link[ _]suffix$/i.test(row.link_suffix);
      const units=!key&&(section==='hw_node'?coordinateTokens.every(token=>lengthUnit.test(token)):lengthUnit.test(lengthToken));
      const marker=row.objecttable?.toLowerCase();
      if(marker==='userunits'||units){
        for(const [keys,expected] of [
          [['x','y','ground_level','chamber_floor','conduit_length','us_invert','ds_invert','point_array'],'m'],
          [['conduit_width','conduit_height','bottom_roughness_cw','top_roughness_cw','sediment_depth'],'mm'],
          [['gradient'],'m/m'],
        ])for(const field of keys){
          if(!['hw_node','hw_conduit'].includes(section)&&field!=='point_array')continue;
          const unit=row[field]?.toLowerCase();
          const accepted=unit===expected||expected==='m'&&/^(?:m ad|metres?|meters?)$/.test(unit)||
            expected==='mm'&&/^(?:millimetres?|millimeters?)$/.test(unit);
          if(unit&&!accepted)
            fail('unsupported declared units for '+field+' (expected '+expected+').');
        }
      }
      if(marker==='fielddescription'||marker==='userunits'||description||units){
        if(marker==='fielddescription'||description)fieldLabels=fields;
        if(marker==='userunits'||units)fieldUnits=fields;
        warnings.add('Optional ICM description or unit rows were skipped as assets and retained as field metadata.');
        continue;
      }
      leadingMetadata=false;
    }
    const sourceAttributes={table:section,file,row:sourceRow,
      fields:fieldNames.flatMap((name,i)=>name?[{
        name,label:fieldLabels[i]||'',unit:fieldUnits[i]||'',value:raw[i],
      }]:[]),
    };
    const number=key=>{
      const value=row[key];
      if(!value)return null;
      if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)||!Number.isFinite(Number(value)))
        fail('invalid numeric field '+key+'.');
      return Number(value);
    };
    if(section==='hw_node'){
      const id=row.node_id?.toUpperCase(),x=number('x'),y=number('y');
      if(!id||id.length>128||nodes.has(id)||x===null||y===null||Math.abs(x)>1e6||Math.abs(y)>1e6)
        fail('invalid or duplicate node ID or metre coordinates.');
      const kind=row.node_type?.toLowerCase(),type=nodeTypes.get(kind)||'junction';
      if(!nodeTypes.has(kind))warnings.add('Missing or unfamiliar node types use a generic junction symbol.');
      nodes.set(id,{id:row.node_id,name:row.node_id,type,x,y:-y,colour:'blue',bindings:[],sourceAttributes,
        icm:{nodeType:row.node_type||null,groundLevelM:number('ground_level'),chamberFloorM:number('chamber_floor')}});
      if(nodes.size>2000)fail('network exceeds 2,000 points.');
    }else{
      const from=(row.us_node_id||row.upstream_node_id)?.toUpperCase(),to=(row.ds_node_id||row.downstream_node_id)?.toUpperCase();
      const suffix=row.link_suffix?.toUpperCase();
      if(!from||!to||from===to||!suffix||suffix.length>16)fail('invalid conduit key or endpoints.');
      const icm={table:section,shape:row.shape||null,roughnessType:row.roughness_type||null,linkSuffix:row.link_suffix};
      for(const key of ['conduit_length','conduit_width','conduit_height','us_invert','ds_invert','gradient',
        'bottom_roughness_cw','top_roughness_cw','sediment_depth','number_of_barrels'])icm[key]=number(key);
      for(const key of ['conduit_length','conduit_width','conduit_height','number_of_barrels'])
        if(icm[key]!==null&&icm[key]<=0)fail('non-positive '+key+'.');
      const edge={id:'ICM '+section.slice(3)+' '+JSON.stringify([from,suffix]),from,to,
        name:(row.us_node_id||row.upstream_node_id)+'.'+row.link_suffix,colour:'blue',icm,sourceAttributes};
      if(row.point_array){
        const packed=/^\{(.*)\}$/.exec(row.point_array);
        const coordinates=packed?.[1].split(',').map(value=>value.trim());
        if(!coordinates||coordinates.length<4||coordinates.length%2||
           coordinates.some(value=>!value||!Number.isFinite(Number(value))||Math.abs(Number(value))>1e6))
          fail('invalid packed conduit geometry.');
        edge.vertices=[];
        for(let i=0;i<coordinates.length;i+=2)edge.vertices.push({x:Number(coordinates[i]),y:-Number(coordinates[i+1])});
      }
      pending.push(edge);
      if(pending.length>5000)fail('network exceeds 5,000 connectors.');
    }
  }
  if(!nodes.size)throw new Error('Expected populated hw_node data in an ICM CSV export.');
  if(pending.some(edge=>!nodes.has(edge.from)||!nodes.has(edge.to)))throw new Error('An ICM conduit references an unknown node.');
  network.nodes=[...nodes.values()];
  network.edges=pending.map(({vertices,...edge})=>{
    const from=nodes.get(edge.from),to=nodes.get(edge.to);
    if(vertices?.length){
      const same=(a,b)=>Math.abs(a.x-b.x)<.001&&Math.abs(a.y-b.y)<.001;
      const bends=vertices.slice(same(vertices[0],from)?1:0,same(vertices.at(-1),to)?-1:undefined);
      if(bends.length<=32)edge.bends=bends;
      else warnings.add('Conduits with more than 32 intermediate vertices display as straight links.');
    }
    return {...edge,from:from.id,to:to.id};
  });
  if(pending.some(edge=>edge.icm.table==='hw_conduit'&&(!edge.icm.shape||edge.icm.conduit_length===null)))warnings.add('Some conduits omit shape or length metadata.');
  return {network:validateNetwork(network),warnings:[...warnings]};
}
// Canonical interchange format. Native exporter mappings belong in adapters.
function importNetworkContext(text){
  const [version,header,...lines]=text.replace(/^\uFEFF/,'').split(/\r?\n/);
  if(version!=='HydraBench network context v1'||header!=='record,id,type,name,x_m,y_m,from,to')
    throw new Error('Expected a HydraBench network context v1 CSV with metre coordinates.');
  if(lines.length>7001)throw new Error('Network context exceeds the schematic size limit.');
  const result=empty();
  const ids={node:new Set(),link:new Set()};
  for(const [index,line] of lines.entries()){
    if(!line.trim())continue;
    const fail=message=>{throw new Error('Network context row '+(index+3)+': '+message);};
    const fields=readContextRow(line,index+3);
    if(fields.length!==8)fail('expected eight CSV fields.');
    const [record,id,type,name,x,y,from,to]=fields.map(field=>field.trim());
    if(!Object.hasOwn(ids,record)||!id||id.length>128||ids[record].has(id)||name.length>256)
      fail('invalid or duplicate object ID, record kind or name.');
    ids[record].add(id);
    if(record==='node'){
      if(!Object.hasOwn(types,type)||type==='label'||!x||!y||from||to||![x,y].every(value=>/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)&&Math.abs(Number(value))<=1e6))
        fail('invalid node type or metre coordinates.');
      result.nodes.push({id,type,name:name||id,x:Number(x),y:-Number(y),colour:'blue',bindings:[]});
    }else{
      if(!from||!to||from===to||type||x||y)fail('invalid link endpoints or unexpected node fields.');
      result.edges.push({id,from,to,name:name||id,colour:'blue'});
    }
  }
  if(!result.nodes.length)throw new Error('Network context contains no nodes.');
  for(const edge of result.edges){
    if(!ids.node.has(edge.from)||!ids.node.has(edge.to))throw new Error('A network context link references an unknown node.');
  }
  return validateNetwork(result);
}
function sameContextFields(previous,next){
  // Compare original values and units, excluding file/row and translated coordinates.
  const attributes=asset=>(asset.sourceAttributes?.fields||[]).filter(field=>!['x','y','point_array'].includes(field.name.toLowerCase()))
    .map(({name,unit,value})=>[name.toLowerCase(),unit,value]).sort((a,b)=>a[0].localeCompare(b[0]));
  return JSON.stringify(previous.icm)===JSON.stringify(next.icm)&&
    JSON.stringify(attributes(previous))===JSON.stringify(attributes(next));
}
function applyContextRevision(current,imported,format){
  if(current.nodes.length&&current.contextFormat!==format)
    throw new Error('Use an empty schematic or revise a previously imported context of the same format.');
  const previousNodes=new Map(current.nodes.map(node=>[node.id,node]));
  const previousEdges=new Map(current.edges.map(edge=>[edge.id,edge]));
  if(current.nodes.some(node=>node.contextSource)&&!imported.nodes.some(node=>previousNodes.get(node.id)?.contextSource))
    throw new Error('No shared imported node IDs. Open an empty schematic to import a different network.');
  const nodes=imported.nodes.map(node=>{
    const old=previousNodes.get(node.id);
    if(old&&!old.contextSource)throw new Error('An imported node ID conflicts with a manually drawn node.');
    const next={...node,contextSource:true,sourceName:node.name,sourcePosition:{x:node.x,y:node.y}};
    if(old?.type===node.type){
      for(const key of ['pinned','nameOffset','labelOffset','review','bindings','defaults','gap','exclusions','confirmed','monitorId','customProperties','seriesLinks','colour'])
        if(old[key]!==undefined)next[key]=old[key];
      if(old.name!==(old.sourceName??node.name))next.name=old.name;
      if(sameContextFields(old,node))for(const key of ['applied','detrimentLinks'])if(old[key]!==undefined)next[key]=old[key];
      if(old.pinned||old.x!==old.sourcePosition?.x||old.y!==old.sourcePosition?.y){
        next.x=old.x;next.y=old.y;
      }
    }
    return next;
  }).concat(current.nodes.filter(node=>!node.contextSource));
  const ids=new Set(nodes.map(node=>node.id));
  const edges=imported.edges.map(edge=>{
    const old=previousEdges.get(edge.id);
    if(old&&!old.contextSource)throw new Error('An imported link ID conflicts with a manually drawn connector.');
    const next={...edge,contextSource:true,sourceName:edge.name,sourceBends:edge.bends||[]};
    if(old?.from===edge.from&&old?.to===edge.to){
      if(JSON.stringify(old.bends||[])!==JSON.stringify(old.sourceBends||[]))next.bends=old.bends||[];
      if(old.name!==(old.sourceName??edge.name))next.name=old.name;
      if(sameContextFields(old,edge)&&old.detrimentLinks!==undefined)next.detrimentLinks=old.detrimentLinks;
      for(const key of ['labelOffset','review','arrow','customProperties','seriesLinks','colour','monitorId'])
        if(old[key]!==undefined)next[key]=old[key];
    }
    return next;
  }).concat(current.edges.filter(edge=>!edge.contextSource&&ids.has(edge.from)&&ids.has(edge.to)));
  const nextNodes=new Map(nodes.map(n=>[n.id,n])),nextEdges=new Map(edges.map(e=>[e.id,e]));
  const views=(current.views||[]).flatMap(view=>{
    const positions=view.positions.filter(({id})=>nextNodes.has(id)&&previousNodes.get(id)?.type===nextNodes.get(id).type);
    const geometry=(view.edges||[]).filter(({id})=>{
      const old=previousEdges.get(id),next=nextEdges.get(id);
      return old&&next&&old.from===next.from&&old.to===next.to;
    });
    return positions.length||geometry.length?[{...view,positions,edges:geometry}]:[];
  });
  return validateNetwork({...current,contextFormat:format,nodes,edges,views});
}
function conduitTrial(edge){
  const fields=edge?.icm;
  if(!fields||(fields.table&&fields.table!=='hw_conduit')||String(fields.shape).toUpperCase()!=='CIRC'||String(fields.roughnessType).toUpperCase()!=='CW'||
     fields.number_of_barrels!==1||fields.sediment_depth!==0)return null;
  const {conduit_width:width,conduit_height:height,bottom_roughness_cw:roughness,top_roughness_cw:top,
    conduit_length:length,us_invert:us,ds_invert:ds}=fields;
  let gradient=fields.gradient;
  if(gradient===null&&[length,us,ds].every(Number.isFinite)&&length>0)gradient=(us-ds)/length;
  if(![width,height,roughness,gradient].every(Number.isFinite)||width!==height||width<1||width>20000||
     roughness<0||roughness/width>.05||(top!==null&&top!==roughness)||gradient<0||gradient>1)return null;
  return {diameter:width,roughness,gradient,label:edge.name||edge.id};
}
function reportingConflicts(rows){
  const seen=new Set();for(const row of rows){for(const y of row.years){const key=row.role+'|'+(row.role==='model'?row.scenario:'Observed')+'|'+y;if(seen.has(key))throw new Error('Overlapping assignments for '+(row.role==='model'?row.scenario:'Observed')+' in '+y+'. Keep one authoritative source per reporting year.');seen.add(key);}}
}
globalThis.ICMNetworkCore={colours,types,mainYear,rag,comparable,validateYears,empty,validateNetwork,importNetworkContext,importNativeContext,nativeContextText,applyContextRevision,conduitTrial,reportingConflicts,bounds,connector,connectionRoutes,labelOffset,labelLeader,summaryRows,summaryYears,unitFactor,valueScale,thresholdRule,effectiveThreshold,samePeriod,evidenceRows};
})();
