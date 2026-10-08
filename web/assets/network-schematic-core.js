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
    const start=pair.get(e.from),end=pair.get(e.to),bends=waypoints.get(e.id),points=[start,...bends,end],pa=positions.get(e.from),pb=positions.get(e.to);
    const segments=points.slice(1).map((p,i)=>({a:points[i],b:p,length:Math.hypot(p.x-points[i].x,p.y-points[i].y)})),length=segments.reduce((s,p)=>s+p.length,0);
    if(length<12||(!bends.length&&((end.x-start.x)*(pb.x-pa.x)+(end.y-start.y)*(pb.y-pa.y))<=0))continue;
    const along=fraction=>{let remaining=length*fraction;for(const s of segments){if(!s.length)continue;if(remaining<=s.length){const ux=(s.b.x-s.a.x)/s.length,uy=(s.b.y-s.a.y)/s.length;return {x:s.a.x+ux*remaining,y:s.a.y+uy*remaining,ux,uy,size:Math.min(10,s.length/2)};}remaining-=s.length;}return {x:end.x,y:end.y,ux:1,uy:0,size:10};};
    const tip=along(.72),middle=along(.5),{ux,uy,size}=tip;
    routes.set(e.id,{start,end,points,path:points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(''),label:{x:middle.x-middle.uy*10,y:middle.y+middle.ux*10},arrow:[{x:tip.x,y:tip.y},{x:tip.x-ux*size-uy*4,y:tip.y-uy*size+ux*4},{x:tip.x-ux*size+uy*4,y:tip.y-uy*size-ux*4}]});
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
  if(value.evidenceMode!==undefined&&!['single','combined'].includes(value.evidenceMode))throw new Error('Invalid evidence display mode.');
  const result=JSON.parse(JSON.stringify(value));
  result.schema=2;
  result.preferences={snap:false,locked:false,detail:'auto',type:'all',health:'all',result:'all',scenarios:null,...result.preferences};
  if(!['auto','full','minimal'].includes(result.preferences.detail)||!['all',...Object.keys(types)].includes(result.preferences.type)||!['all','ready','missing','stale','provisional','short','unassigned','uncalculated'].includes(result.preferences.health)||!['all','green','amber','red','neutral'].includes(result.preferences.result)||![result.preferences.snap,result.preferences.locked].every(v=>typeof v==='boolean')||result.preferences.scenarios!==null&&(!Array.isArray(result.preferences.scenarios)||result.preferences.scenarios.length>1000||result.preferences.scenarios.some(s=>typeof s!=='string'||s.length>100)))throw new Error('Invalid schematic display preferences.');
  for(const n of result.nodes){if(n.pinned!==undefined&&typeof n.pinned!=='boolean')throw new Error('Invalid pinned point.');if(n.review&&(typeof n.review.comment!=='string'||n.review.comment.length>10000||!['unreviewed','in-review','reviewed'].includes(n.review.status)))throw new Error('Invalid review note.');}
  for(const e of result.edges){if(e.labelOffset&&![e.labelOffset.x,e.labelOffset.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=10000))throw new Error('Invalid connector label placement.');if(e.review&&(typeof e.review.comment!=='string'||e.review.comment.length>10000||!['unreviewed','in-review','reviewed'].includes(e.review.status)))throw new Error('Invalid connector review.');}
  result.views=result.views||[];result.reviewSnapshots=result.reviewSnapshots||[];
  if(!Array.isArray(result.views)||result.views.length>30||!Array.isArray(result.reviewSnapshots)||result.reviewSnapshots.length>20)throw new Error('Invalid saved review views.');
  for(const view of result.views)if(typeof view.name!=='string'||view.name.length>100||!Array.isArray(view.positions)||view.positions.length>2000||!view.camera||![view.camera.x,view.camera.y,view.camera.zoom].every(Number.isFinite)||view.camera.zoom<.2||view.camera.zoom>4||view.positions.some(p=>typeof p.id!=='string'||![p.x,p.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6)))throw new Error('Invalid saved view.');
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
  if(![result.camera.x,result.camera.y,result.camera.zoom].every(Number.isFinite)||result.camera.zoom<.2||result.camera.zoom>4)throw new Error('Invalid schematic camera.');
  return result;
}
function reportingConflicts(rows){
  const seen=new Set();for(const row of rows){for(const y of row.years){const key=row.role+'|'+(row.role==='model'?row.scenario:'Observed')+'|'+y;if(seen.has(key))throw new Error('Overlapping assignments for '+(row.role==='model'?row.scenario:'Observed')+' in '+y+'. Keep one authoritative source per reporting year.');seen.add(key);}}
}
globalThis.ICMNetworkCore={colours,types,mainYear,rag,comparable,validateYears,empty,validateNetwork,reportingConflicts,bounds,connector,connectionRoutes,labelOffset,labelLeader,summaryRows,summaryYears,unitFactor,valueScale,thresholdRule,effectiveThreshold,samePeriod,evidenceRows};
})();
