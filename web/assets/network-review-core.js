/* Annual review helpers: topology and presentation never alter spill evidence. */
(()=>{'use strict';
const C=globalThis.ICMNetworkCore;
function preferences(n){return {snap:false,locked:false,detail:'auto',showLabels:true,showMonitors:true,overview:false,type:'all',health:'all',result:'all',scenarios:null,...n.preferences};}
function index(nodes,edges){
  const byId=new Map(nodes.map(n=>[n.id,n])),up=new Map(nodes.map(n=>[n.id,[]])),down=new Map(nodes.map(n=>[n.id,[]]));
  for(const e of edges)if(byId.has(e.from)&&byId.has(e.to)){down.get(e.from).push({id:e.to,edge:e.id});up.get(e.to).push({id:e.from,edge:e.id});}
  return {byId,up,down};
}
function trace(nodes,edges,start,direction='down'){
  const graph=index(nodes,edges),ids=new Set(),wires=new Set(),queue=[start];
  if(!graph.byId.has(start))return {ids,wires};
  while(queue.length){const id=queue.pop();if(ids.has(id))continue;ids.add(id);for(const next of (direction==='up'?graph.up:graph.down).get(id)){wires.add(next.edge);queue.push(next.id);}}
  return {ids,wires};
}
function components(nodes,edges){
  const graph=index(nodes,edges),seen=new Set(),out=[];
  for(const n of nodes){if(seen.has(n.id))continue;const group=[],queue=[n.id];while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);group.push(id);queue.push(...graph.up.get(id).map(x=>x.id),...graph.down.get(id).map(x=>x.id));}out.push(group);}
  return out;
}
function audit(nodes,edges){
  const graph=index(nodes,edges),isolated=nodes.filter(n=>!graph.up.get(n.id).length&&!graph.down.get(n.id).length).map(n=>n.id);
  const indegree=new Map(nodes.map(n=>[n.id,graph.up.get(n.id).length])),queue=nodes.filter(n=>!indegree.get(n.id)).map(n=>n.id),removed=new Set();
  while(queue.length){const id=queue.pop();removed.add(id);for(const x of graph.down.get(id)){indegree.set(x.id,indegree.get(x.id)-1);if(!indegree.get(x.id))queue.push(x.id);}}
  // Remaining nodes may be downstream of a cycle; call them cycle-affected.
  return {isolated,components:components(nodes,edges),cycleAffected:nodes.filter(n=>!removed.has(n.id)).map(n=>n.id)};
}
function autoLayout(nodes,edges){
  // Strongly connected components become one level; deterministic ordering.
  const graph=index(nodes,edges),visited=new Set(),finish=[];
  for(const n of nodes){if(visited.has(n.id))continue;const stack=[[n.id,false]];while(stack.length){const [id,done]=stack.pop();if(done){finish.push(id);continue;}if(visited.has(id))continue;visited.add(id);stack.push([id,true]);for(const x of graph.down.get(id))if(!visited.has(x.id))stack.push([x.id,false]);}}
  const groupOf=new Map(),groups=[];
  for(const root of finish.reverse()){if(groupOf.has(root))continue;const i=groups.length,members=[],queue=[root];while(queue.length){const id=queue.pop();if(groupOf.has(id))continue;groupOf.set(id,i);members.push(id);for(const x of graph.up.get(id))if(!groupOf.has(x.id))queue.push(x.id);}groups.push(members.sort());}
  const next=groups.map(()=>new Set()),degree=groups.map(()=>0),level=groups.map(()=>0);
  for(const e of edges){const a=groupOf.get(e.from),b=groupOf.get(e.to);if(a!==undefined&&b!==undefined&&a!==b&&!next[a].has(b)){next[a].add(b);degree[b]++;}}
  const queue=degree.map((d,i)=>d===0?i:-1).filter(i=>i>=0);while(queue.length){const i=queue.shift();for(const j of next[i]){level[j]=Math.max(level[j],level[i]+1);if(--degree[j]===0)queue.push(j);}}
  const slots=new Map(),positions=new Map();
  for(const group of groups.map((members,i)=>({members,level:level[i]})).sort((a,b)=>a.level-b.level||a.members[0].localeCompare(b.members[0]))){for(const id of group.members){const slot=slots.get(group.level)||0;slots.set(group.level,slot+1);const n=graph.byId.get(id);positions.set(id,n.pinned?{x:n.x,y:n.y}:{x:160+group.level*260,y:130+slot*150});}}
  // Keep unpinned symbols clear of pinned points and earlier placements.
  const occupied=nodes.filter(n=>n.pinned).map(n=>({x:n.x,y:n.y}));for(const n of nodes.filter(n=>!n.pinned).sort((a,b)=>a.id.localeCompare(b.id))){const p=positions.get(n.id);while(occupied.some(q=>Math.abs(q.x-p.x)<130&&Math.abs(q.y-p.y)<100))p.y+=150;occupied.push(p);}
  return positions;
}
function health(n,fresh,sourcePresent=true){
  if(!n.bindings?.length)return 'unassigned';if(!sourcePresent)return 'missing';if(!n.applied)return 'uncalculated';if(!fresh)return 'stale';
  if(!(n.applied.rows||[]).some(r=>r.eligible))return 'short';if(n.applied.rows.some(r=>r.eligible&&r.count_status!=='definitive'))return 'provisional';return 'ready';
}
function years(n){return [...new Set([...(n.bindings||[]).flatMap(b=>b.years||[]),...(n.applied?.rows||[]).map(r=>r.year)])].sort((a,b)=>a-b);}
function annualGroups(n,selectedScenarios=null){
  const rows=n.applied?.rows||[],names=[...new Set([...(n.bindings||[]).filter(b=>b.role==='model').map(b=>b.scenario),...rows.filter(r=>r.role==='model').map(r=>r.scenario)])].sort().filter(s=>selectedScenarios===null||selectedScenarios.includes(s));
  const groups=[];for(const year of years(n)){const observed=rows.find(r=>r.year===year&&r.role==='observed');if(!names.length)groups.push({year,scenario:'Observed',observed,model:null});for(const name of names)groups.push({year,scenario:name,observed,model:rows.find(r=>r.year===year&&r.role==='model'&&r.scenario===name)});}return groups;
}
function delta(observed,model){if(observed==null||model==null||!Number.isFinite(observed)||!Number.isFinite(model))return null;return model-observed;}
function review(n){return {comment:'',status:'unreviewed',...n.review};}
const refKey=({kind,id})=>JSON.stringify([kind,id]);
const edgeType=edge=>edge.icm?.table||'';
const nominal=edge=>edge.direction!=='unknown';
const assetIdentity=(kind,asset)=>JSON.stringify(kind==='edge'?[asset.from,asset.to,edgeType(asset)]:[asset.type]);
function monitorIndex(network){
  const byAsset=new Map(),byId=new Map();
  for(const [kind,assets] of [['node',network.nodes.filter(node=>node.type!=='label')],['edge',network.edges]]){
    for(const asset of assets){
      const ref={kind,id:asset.id},record={...ref,label:asset.name||asset.id,identity:assetIdentity(kind,asset)};
      byAsset.set(refKey(ref),record);
      for(const id of new Set([asset.id,asset.sourceName,asset.icm&&kind==='edge'?asset.name:undefined].filter(Boolean))){
        if(!byId.has(id))byId.set(id,[]);
        byId.get(id).push(record);
      }
    }
  }
  return {byId,byAsset};
}
function monitorMatches(table,monitorColumn,network,resolutions=new Map()){
  const {byId}=monitorIndex(network);
  const existing=new Map((network.monitorLocations||[]).map(row=>[row.monitor,row]));
  const input=table.rows.map((columns,index)=>{
    const monitor=columns[monitorColumn],assetId=columns[1-monitorColumn];
    const choices=byId.get(assetId)||[],pick=resolutions.get(index);
    const match=pick?choices.find(ref=>refKey(ref)===pick):choices.length===1?choices[0]:null;
    return {index,monitor,assetId,choices,match};
  });
  const grouped=new Map();
  for(const row of input){
    if(!grouped.has(row.monitor))grouped.set(row.monitor,new Set());
    grouped.get(row.monitor).add(row.match?refKey(row.match):row.assetId);
  }
  const seen=new Set();
  return input.map(row=>{
    const prior=existing.get(row.monitor);
    const key=JSON.stringify([row.monitor,row.assetId,row.match&&refKey(row.match)]);
    let state='Matched';
    if(!row.monitor||!row.assetId)state='Missing name or asset ID';
    else if(grouped.get(row.monitor).size>1)state='Conflicting rows';
    else if(seen.has(key))state='Duplicate';
    else if(!row.choices.length)state='Unmatched';
    else if(!row.match)state='Ambiguous';
    else if(prior&&(refKey(prior.asset)!==refKey(row.match)||prior.identity!==row.match.identity))state='Confirm change';
    else if(prior)state='Already linked';
    seen.add(key);
    return {...row,state,prior};
  });
}

function overview(network){
  const nodes=network.nodes.filter(node=>node.type!=='label').sort((a,b)=>a.id.localeCompare(b.id));
  const edges=[...network.edges].sort((a,b)=>a.id.localeCompare(b.id));
  const graph=index(nodes,edges),source=new Map(edges.map(edge=>[edge.id,edge]));
  const pins=new Set((network.overviewPins||[]).map(refKey));
  const {byAsset}=monitorIndex(network);
  for(const monitor of network.monitorLocations||[]){
    const key=refKey(monitor.asset);
    if(byAsset.get(key)?.identity===monitor.identity)pins.add(key);
  }
  const retain=new Set(nodes.filter(node=>
    !['manhole','junction'].includes(node.type)||pins.has(refKey({kind:'node',id:node.id}))||
    graph.up.get(node.id).length!==1||graph.down.get(node.id).length!==1).map(node=>node.id));
  for(const edge of edges){
    if(!nominal(edge)||edgeType(edge)&&edgeType(edge)!=='hw_conduit'||pins.has(refKey({kind:'edge',id:edge.id}))){
      retain.add(edge.from);retain.add(edge.to);
    }
  }
  // Preserve at least two vertices on a closed run, including loops attached to a branch.
  const visited=new Set();
  for(const node of nodes){
    let id=node.id;
    const walk=new Map();
    while(!visited.has(id)&&!walk.has(id)&&graph.down.get(id).length===1){
      walk.set(id,walk.size);id=graph.down.get(id)[0].id;
    }
    if(walk.has(id)){
      const cycle=[...walk.keys()].slice(walk.get(id));
      let anchors=cycle.filter(key=>retain.has(key)).length;
      for(const key of cycle){
        if(anchors>=2)break;
        if(!retain.has(key)){retain.add(key);anchors++;}
      }
    }
    for(const key of walk.keys())visited.add(key);
  }
  for(const start of [...retain]){
    for(const first of graph.down.get(start)||[]){
      let end=first.id;
      while(!retain.has(end))end=graph.down.get(end)[0].id;
      if(end===start)retain.add(first.id);
    }
  }
  const projectedNodes=nodes.filter(node=>retain.has(node.id)).map(node=>({...node,pinned:false,labelOffset:undefined,nameOffset:undefined}));
  const projectedEdges=[],nodeToReach=new Map(),edgeToReach=new Map();
  for(const node of projectedNodes){
    for(const first of graph.down.get(node.id)){
      const members=[first.edge],interior=[];
      let end=first.id;
      while(!retain.has(end)){
        interior.push(end);
        const next=graph.down.get(end)[0];members.push(next.edge);end=next.id;
      }
      const firstEdge=source.get(first.edge);
      const name=members.length===1?firstEdge.name||firstEdge.id:members.length+' links';
      const projected={...firstEdge,name,from:node.id,to:end,bends:[],labelOffset:undefined,
        arrow:nominal(firstEdge),contextSource:true,sourceEdges:members,sourceNodes:[node.id,...interior,end]};
      projectedEdges.push(projected);
      for(const id of interior)nodeToReach.set(id,projected);
      for(const id of members)edgeToReach.set(id,projected);
    }
  }
  const layout=autoLayout(projectedNodes,projectedEdges);
  return {nodes:projectedNodes.map(node=>({...node,...layout.get(node.id)})),
    edges:projectedEdges,nodeToReach,edgeToReach};
}

function routePlanner(network,start,end){
  const graph=index(network.nodes,network.edges.filter(nominal));
  const edges=new Map(network.edges.map(edge=>[edge.id,edge]));
  const complete=graph.byId.has(start)&&graph.byId.has(end)&&start!==end;
  function options(current,visited){
    if(!complete||current===end)return [];
    const reachable=new Set(),queue=[end],blocked=new Set(visited);
    blocked.add(current);
    while(queue.length){
      const id=queue.pop();
      if(reachable.has(id)||blocked.has(id))continue;
      reachable.add(id);
      for(const previous of graph.up.get(id))queue.push(previous.id);
    }
    return graph.down.get(current).filter(link=>reachable.has(link.id)).map(link=>edges.get(link.edge))
      .sort((a,b)=>a.id.localeCompare(b.id));
  }
  function issue(){
    if(!complete)return 'Choose two different route endpoints.';
    const found=components(network.nodes,network.edges).find(group=>group.includes(start));
    return found?.includes(end)?'No forward route. Check nominal directions and links with unknown direction.':
      'Route break. These endpoints are in disconnected parts of the network.';
  }
  return {options,issue};
}

function longSection(network,edges){
  const nodes=new Map(network.nodes.map(node=>[node.id,node]));
  let chainage=0;
  const number=value=>Number.isFinite(value)?value:null;
  const source=asset=>{
    const values=asset?.sourceAttributes;
    return values?{file:values.file,table:values.table,row:values.row}:null;
  };
  return edges.map(edge=>{
    const from=nodes.get(edge.from),to=nodes.get(edge.to),fields=edge.icm||{};
    const conduit=!fields.table||fields.table==='hw_conduit';
    const length=conduit&&Number.isFinite(fields.conduit_length)&&fields.conduit_length>0?fields.conduit_length:null;
    const lengthStatus=!conduit?'structure':length===null?'missing':'known';
    const chainageStart=chainage;
    if(lengthStatus==='missing')chainage=null;
    if(chainage!==null&&length!==null)chainage+=length;
    const height=conduit&&String(fields.shape).toUpperCase()==='CIRC'&&fields.conduit_width===fields.conduit_height&&
      fields.conduit_height>0?number(fields.conduit_height/1000):null;
    return {id:edge.id,from:edge.from,to:edge.to,name:edge.name||edge.id,type:fields.table||'Connector',
      lengthStatus,length,chainageStart,chainageEnd:chainage,us:number(fields.us_invert),ds:number(fields.ds_invert),
      groundFrom:number(from?.icm?.groundLevelM),groundTo:number(to?.icm?.groundLevelM),
      chamberFrom:number(from?.icm?.chamberFloorM),chamberTo:number(to?.icm?.chamberFloorM),height,
      widthMm:number(fields.conduit_width),heightMm:number(fields.conduit_height),shape:fields.shape||null,
      sources:[source(edge),source(from),source(to)].filter(Boolean)};
  });
}

function profileAxis(minimum,maximum,zoom,pan){
  if(!Number.isFinite(minimum)||!Number.isFinite(maximum)||maximum<=minimum)throw new Error('A profile axis needs increasing source bounds.');
  const boundedZoom=Number.isFinite(zoom)?Math.min(8,Math.max(1,zoom)):1;
  const fraction=Number.isFinite(pan)?Math.min(1,Math.max(0,pan)):.5;
  const full=maximum-minimum,span=full/boundedZoom;
  const low=minimum+fraction*(full-span);
  return {low,high:low+span,span};
}

function sameProfileSteps(current,saved){
  if(current.length!==saved.length)return false;
  const optionalKeys=new Set(['chamberFrom','chamberTo','widthMm','heightMm','shape']);
  return current.every((step,index)=>{
    const baseline=saved[index];
    return Object.keys(step).every(key=>{
      if(optionalKeys.has(key)&&!Object.hasOwn(baseline,key))return true;
      return JSON.stringify(step[key])===JSON.stringify(baseline[key]);
    });
  });
}
globalThis.ICMNetworkReviewCore={preferences,index,trace,components,audit,autoLayout,health,years,annualGroups,delta,review,refKey,monitorIndex,monitorMatches,overview,routePlanner,longSection,profileAxis,sameProfileSteps};
})();
