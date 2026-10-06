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
function comparable(a,b,confirmed){
  if(!a||!b||!a.eligible||!b.eligible)return 'Both sources need eligible reporting data.';
  if(!confirmed)return 'Confirm matching clocks and model/rainfall basis for this asset.';
  if(a.count_status!=='definitive'||b.count_status!=='definitive')return 'Counts are provisional; resolve gaps, exclusions or initial context.';
  if(stamp(a.analysis_start)!==stamp(b.analysis_start)||stamp(a.analysis_end)!==stamp(b.analysis_end))return 'Individual assessment periods differ.';
  if(thresholdRule(a)!==thresholdRule(b))return 'Threshold rules differ.';
  if(a.quantity!==b.quantity)return 'Observed and modelled quantities differ.';
  if(!a.unit||!b.unit||a.unit!==b.unit)return 'Confirm matching source units.';
  if(a.quantity==='level'&&a.datum!==b.datum)return 'Confirm matching level datums.';
  for(const field of ['valid_hours','unknown_hours','excluded_hours'])if(Math.abs(Number(a[field])-Number(b[field]))>1/3600)return 'Temporal support differs.';
  const start=stamp(a.analysis_start),end=stamp(a.analysis_end);
  if(JSON.stringify(mask(a.exclusions,start,end))!==JSON.stringify(mask(b.exclusions,start,end)))return 'Exclusion masks differ.';
  return '';
}
// Fixed screen-size ports keep each connection independent at its asset boundary.
function bounds(type){return type==='manhole'?{x:8,y:8,circle:true}:type==='label'?{x:3,y:3,circle:true}:type==='junction'?{x:24,y:24}:{x:38,y:28};}
function connectionRoutes(nodes,edges,project=v=>v){
  const byId=new Map(nodes.map(n=>[n.id,n])),positions=new Map(nodes.map(n=>[n.id,project(n)])),bins=new Map(),ports=new Map(),routes=new Map();
  function face(n,target){const p=positions.get(n.id),box=bounds(n.type),dx=target.x-p.x,dy=target.y-p.y;return Math.abs(dx)/box.x>=Math.abs(dy)/box.y?(dx>=0?'right':'left'):(dy>=0?'bottom':'top');}
  for(const e of edges){
    const a=byId.get(e.from),b=byId.get(e.to);if(!a||!b)continue;
    for(const [n,other] of [[a,b],[b,a]]){const side=face(n,positions.get(other.id)),key=n.id+'|'+side;if(!bins.has(key))bins.set(key,[]);bins.get(key).push({n,other,e,side});}
  }
  for(const peers of bins.values()){
    const centre=positions.get(peers[0].n.id),angle=x=>{const p=positions.get(x.other.id);return Math.atan2(p.y-centre.y,p.x-centre.x);};
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
    const start=pair.get(e.from),end=pair.get(e.to),pa=positions.get(e.from),pb=positions.get(e.to),dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
    if(length<12||(dx*(pb.x-pa.x)+dy*(pb.y-pa.y))<=0)continue;
    const ux=dx/length,uy=dy/length,tip={x:start.x+dx*.72,y:start.y+dy*.72};
    routes.set(e.id,{start,end,path:`M${start.x} ${start.y}L${end.x} ${end.y}`,label:{x:(start.x+end.x)/2-uy*10,y:(start.y+end.y)/2+ux*10},arrow:[tip,{x:tip.x-ux*10-uy*4,y:tip.y-uy*10+ux*4},{x:tip.x-ux*10+uy*4,y:tip.y-uy*10-ux*4}]});
  }
  return routes;
}
function connector(e,nodes,edges,project=v=>v){return connectionRoutes(nodes,edges,project).get(e.id)||null;}
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
function empty(){return {schema:1,nodes:[],edges:[],camera:{x:0,y:0,zoom:1},year:'all',scenario:'observed',metric:'spill_count'};}
function validateNetwork(value){
  if(!value||value.schema!==1||!Array.isArray(value.nodes)||!Array.isArray(value.edges))throw new Error('Unsupported network schematic file.');
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
    n.defaults=n.defaults||{observed:'',model:''};n.gap=n.gap||900;n.exclusions=n.exclusions||[];
    ids.add(n.id);
  }
  const edges=new Set();for(const e of value.edges){if(!e.id||edges.has(e.id)||!ids.has(e.from)||!ids.has(e.to)||e.from===e.to||!Object.hasOwn(colours,e.colour))throw new Error('Invalid connector.');edges.add(e.id);}
  const result=JSON.parse(JSON.stringify(value));
  result.camera=result.camera||{x:0,y:0,zoom:1};
  if(![result.camera.x,result.camera.y,result.camera.zoom].every(Number.isFinite)||result.camera.zoom<.2||result.camera.zoom>4)throw new Error('Invalid schematic camera.');
  return result;
}
function reportingConflicts(rows){
  const seen=new Set();for(const row of rows){for(const y of row.years){const key=row.role+'|'+(row.role==='model'?row.scenario:'Observed')+'|'+y;if(seen.has(key))throw new Error('Overlapping assignments for '+(row.role==='model'?row.scenario:'Observed')+' in '+y+'. Keep one authoritative source per reporting year.');seen.add(key);}}
}
globalThis.ICMNetworkCore={colours,types,mainYear,rag,comparable,validateYears,empty,validateNetwork,reportingConflicts,bounds,connector,connectionRoutes,thresholdRule,effectiveThreshold,samePeriod,evidenceRows};
})();
