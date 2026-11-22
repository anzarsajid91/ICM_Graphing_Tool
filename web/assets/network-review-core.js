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
function strongComponents(graph,nodes){
  const visited=new Set(),finish=[];
  for(const n of nodes){if(visited.has(n.id))continue;const stack=[[n.id,false]];while(stack.length){const [id,done]=stack.pop();if(done){finish.push(id);continue;}if(visited.has(id))continue;visited.add(id);stack.push([id,true]);for(const x of graph.down.get(id))if(!visited.has(x.id))stack.push([x.id,false]);}}
  const groupOf=new Map(),groups=[];
  for(const root of finish.reverse()){if(groupOf.has(root))continue;const i=groups.length,members=[],queue=[root];while(queue.length){const id=queue.pop();if(groupOf.has(id))continue;groupOf.set(id,i);members.push(id);for(const x of graph.up.get(id))if(!groupOf.has(x.id))queue.push(x.id);}groups.push(members.sort());}
  return {groupOf,groups};
}
function autoLayout(nodes,edges){
  // Strongly connected components become one level; deterministic ordering.
  const graph=index(nodes,edges),{groupOf,groups}=strongComponents(graph,nodes);
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

function mapDetrimentHotspots(network,records){
  const sourceIds=new Map();
  for(const [kind,objects] of [['node',network.nodes],['edge',network.edges]]){
    for(const object of objects){
      if(!object.contextSource||object.type==='label')continue;
      const ref={kind,id:object.id};
      for(const name of new Set([object.id,object.sourceName].filter(Boolean))){
        const key=refKey({kind,id:name});
        if(!sourceIds.has(key))sourceIds.set(key,[]);
        sourceIds.get(key).push(ref);
      }
    }
  }
  const mapped=new Map(),unmatched=[],ambiguous=[],unclassified=[],conflicting=new Set();
  for(const row of records){
    const kind=row.assetKind==='link'?'edge':row.assetKind;
    if(!['node','edge'].includes(kind)){unclassified.push(row);continue;}
    const sources=sourceIds.get(refKey({kind,id:row.assetId}))||[];
    if(!sources.length){unmatched.push(row);continue;}
    if(sources.length!==1){ambiguous.push(row);continue;}
    const ref=sources[0],key=refKey(ref);
    if(mapped.has(key)){
      ambiguous.push(mapped.get(key).row);mapped.delete(key);conflicting.add(key);
    }
    if(conflicting.has(key))ambiguous.push(row);
    else mapped.set(key,{ref,row});
  }
  return {mapped,unmatched,ambiguous,unclassified};
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

function contributingCatchments(network,target,records,lateralRecords=[]){
  if(network.contextFormat!=='icm-csv-v1')throw new Error('Load native ICM geometry to review contributing catchments.');
  const nodes=network.nodes.filter(node=>node.sourceAttributes?.table==='hw_node');
  const links=network.edges.filter(edge=>edge.icm?.table&&edge.sourceAttributes?.table===edge.icm.table);
  const targetLink=target.kind==='edge'?links.find(link=>link.id===target.id):null;
  const stop=targetLink?.from??target.id;
  if(!(target.kind==='node'&&nodes.some(node=>node.id===stop))&&!targetLink)throw new Error('Select a native assessment asset.');
  const normalize=value=>String(value??'').trim().toUpperCase();
  const buckets=(items,key)=>{
    const grouped=new Map();
    for(const item of items){
      const identity=key(item);
      if(!grouped.has(identity))grouped.set(identity,[]);
      grouped.get(identity).push(item);
    }
    return grouped;
  };
  const nodeMap=buckets(nodes,node=>normalize(node.id)),sourceRows=buckets(records,row=>normalize(row.id));
  const linkKey=(node,suffix)=>JSON.stringify([normalize(node),normalize(suffix)]);
  const linkMap=buckets(links,link=>linkKey(link.from,link.icm.linkSuffix));
  if(lateralRecords.length>1000)throw new Error('Review at most 1,000 lateral source rows.');
  for(const entry of lateralRecords){
    if(!normalize(entry.id)||normalize(entry.id).length>128||!normalize(entry.nodeId)||normalize(entry.nodeId).length>128||
       !normalize(entry.linkSuffix)||normalize(entry.linkSuffix).length>16)throw new Error('Every lateral row needs a catchment and a composite receiving link ID.');
    if(!Number.isFinite(entry.weight)||entry.weight<0||entry.weight>1)throw new Error('Every lateral weight must be a reviewed fraction between 0 and 1.');
  }
  const lateralById=buckets(lateralRecords,row=>normalize(row.id));
  const known=links.filter(link=>link!==targetLink&&nominal(link));
  const uncertain=links.filter(link=>link!==targetLink&&!nominal(link));
  const potential=index(nodes,[...known,...uncertain,...uncertain.map(link=>({...link,from:link.to,to:link.from}))]);
  const directed=index(nodes,known),departures=index(nodes,links).down;
  const reverse=(graph,seeds)=>{
    const seen=new Set(),queue=[...seeds];
    while(queue.length){
      const id=queue.pop();
      if(seen.has(id))continue;
      seen.add(id);
      for(const predecessor of graph.up.get(id)||[])queue.push(predecessor.id);
    }
    return seen;
  };
  const unknownTarget=Boolean(targetLink&&!nominal(targetLink));
  const upstream=reverse(directed,[stop]);
  const possible=reverse(potential,unknownTarget?[stop,targetLink.to]:[stop]);
  const branches=reverse(directed,[...upstream].filter(id=>(targetLink||id!==stop)&&departures.get(id)?.length>1));
  const unknownBranches=reverse(directed,uncertain.flatMap(link=>[link.from,link.to])
    .filter(id=>upstream.has(id)&&(targetLink||id!==stop)));
  const controlled=reverse(directed,known.filter(link=>link.icm.table!=='hw_conduit'&&upstream.has(link.to)).map(link=>link.from));
  const cycles=strongComponents(directed,nodes).groups.filter(group=>group.length>1||directed.down.get(group[0]).some(link=>link.id===group[0]));
  const cycleAffected=reverse(directed,cycles.flat().filter(id=>upstream.has(id)));
  function resolve(row){
    const visited=new Set();
    for(;;){
      const id=normalize(row.id);
      if(visited.has(id))return {problem:'Catchment transfer cycle.'};
      visited.add(id);
      const type=normalize(row.drainsTo),ground=normalize(row.groundNode);
      if(ground&&(type!=='NODE'||ground!==normalize(row.nodeId)))return {problem:'Review the separate groundwater destination and allocation.'};
      if(type==='NODE'){
        const candidates=nodeMap.get(normalize(row.nodeId));
        return candidates?.length===1?{node:candidates[0].id}:{problem:'Receiving node is missing or ambiguous.'};
      }
      if(type==='LINK'){
        const candidates=linkMap.get(linkKey(row.nodeId,row.linkSuffix));
        return candidates?.length===1?{node:candidates[0].to,link:candidates[0]}:{problem:'Receiving link is missing or ambiguous.'};
      }
      if(type==='MULTIPLE LINKS')return {lateral:id};
      if(type!=='SUBCATCHMENT')return {problem:'Review the receiving destination.'};
      const transfers=sourceRows.get(normalize(row.toCatchment));
      if(transfers?.length!==1)return {problem:'Receiving catchment is missing or duplicated.'};
      row=transfers[0];
    }
  }
  const result=(status,reason)=>({status,reason});
  function classify(node,link){
    const direct=Boolean(link&&link===targetLink);
    if(direct&&!unknownTarget)return result('Candidate','The reviewed source drains directly to the assessment link.');
    const locations=link&&!nominal(link)?[node,link.from]:[node];
    if(!direct&&!locations.some(id=>possible.has(id)))return result('Disconnected','No route to the selected asset in the imported topology.');
    if(unknownTarget||(link&&!nominal(link))||!upstream.has(node)||unknownBranches.has(node))return result('Ambiguous','Review a route with unknown recorded direction.');
    if(cycleAffected.has(node))return result('Ambiguous','Review the nominal route in the cycle-affected upstream network.');
    if(branches.has(node))return result('Ambiguous','Review the allocation across an upstream branch or parallel link.');
    if(controlled.has(node)||(link&&link.icm.table!=='hw_conduit'))return result('Ambiguous','Review contribution through an upstream pump or flow-control structure.');
    return result('Candidate','Nominal topology reaches the selected assessment asset. Review hydraulic contribution separately.');
  }
  function classifyLaterals(id){
    const rows=lateralById.get(id)||[];
    if(!rows.length)return result('Ambiguous','Review lateral link destinations and weights.');
    const grouped=buckets(rows,row=>linkKey(row.nodeId,row.linkSuffix));
    const laterals=rows.map(row=>{
      const key=linkKey(row.nodeId,row.linkSuffix),links=linkMap.get(key);
      let basis;
      if(grouped.get(key).length!==1)basis=result('Ambiguous','The receiving link occurs more than once in the lateral report.');
      else if(links?.length!==1)basis=result('Ambiguous','The stated receiving link is missing or ambiguous.');
      else if(links[0].icm.table!=='hw_conduit')basis=result('Ambiguous','Review the documented control inlet location and outfall rules.');
      else basis=classify(links[0].to,links[0]);
      return {...row,...basis};
    });
    const total=rows.reduce((sum,row)=>sum+row.weight,0);
    const reason=Math.abs(total-1)>1e-6?'Lateral weights must sum to 1. Review the complete source grid.':
      'Review each lateral path and the separate population, infiltration and trade allocations.';
    return {...result('Ambiguous',reason),laterals};
  }
  return records.map(row=>{
    const sourceId=normalize(row.id);
    let basis;
    if(!sourceId)basis=result('Ambiguous','The catchment ID is missing.');
    else if(sourceRows.get(sourceId).length>1)basis=result('Duplicate','Compare repeated catchment records before allocating any contribution.');
    else{
      const {node,link,problem,lateral}=resolve(row);
      basis=problem?result('Ambiguous',problem):lateral?classifyLaterals(lateral):classify(node,link);
    }
    return {id:row.id,...basis};
  });
}

const closedProfileShapes=new Set(['ARCH','ARCHSPRUNG','EGG','EGG2','OVAL','RECT']);
const profileControlFields={hw_weir:[['crest','Source crest']],hw_orifice:[['invert','Source orifice invert']],
  hw_sluice:[['invert','Source sluice invert']],hw_pump:[['switch_on_level','Source switch-on level'],['switch_off_level','Source switch-off level']]};
function profileSourceElevation(asset,key){
  const source=asset?.sourceAttributes?.fields?.find(field=>field.name.toLowerCase()===key);
  const raw=source?.value.trim()||'',unit=source?.unit.trim().toLowerCase()||'';
  if(!['','m','m ad','metres','meters','metre','meter'].includes(unit)||!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw))return null;
  const value=Number(raw);
  return Number.isFinite(value)?value:null;
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
    const shape=String(fields.shape).toUpperCase();
    const supported=shape==='CIRC'?fields.conduit_width===fields.conduit_height:closedProfileShapes.has(shape);
    const height=conduit&&supported&&fields.conduit_width>0&&fields.conduit_height>0?number(fields.conduit_height/1000):null;
    const levels=edge.sourceAttributes?.table===fields.table?(profileControlFields[fields.table]||[]).flatMap(([key,label])=>{
      const value=profileSourceElevation(edge,key);return value===null?[]:[{label,value}];
    }):[];
    return {id:edge.id,from:edge.from,to:edge.to,name:edge.name||edge.id,type:fields.table||'Connector',
      lengthStatus,length,chainageStart,chainageEnd:chainage,us:number(fields.us_invert),ds:number(fields.ds_invert),
      groundFrom:number(from?.icm?.groundLevelM),groundTo:number(to?.icm?.groundLevelM),
      chamberFrom:number(from?.icm?.chamberFloorM),chamberTo:number(to?.icm?.chamberFloorM),height,
      roofFrom:profileSourceElevation(from,'chamber_roof'),roofTo:profileSourceElevation(to,'chamber_roof'),controlLevels:levels,
      widthMm:number(fields.conduit_width),heightMm:number(fields.conduit_height),shape:fields.shape||null,
      sources:[source(edge),source(from),source(to)].filter(Boolean)};
  });
}

function conduitEndProfile(step,upstream,downstream){
  const {height}=step;
  const ends=[[upstream,step.us,step.groundFrom],[downstream,step.ds,step.groundTo]].map(([sample,invert,ground])=>{
    const level=Number.isFinite(sample)?sample:null;
    const soffit=Number.isFinite(invert)&&Number.isFinite(height)&&height>0?invert+height:null;
    return {level,invert,soffit,freeboard:level!==null&&Number.isFinite(ground)?ground-level:null,
      aboveSoffit:level!==null&&soffit!==null?Math.max(0,level-soffit):null};
  });
  if(ends.some(end=>end.level===null))return {ends,waterTop:null,status:'sample-missing'};
  if(step.lengthStatus!=='known'||ends.some(end=>end.soffit===null))return {ends,waterTop:null,status:'geometry-unavailable'};
  if(ends.some(end=>end.level<=end.invert))return {ends,waterTop:null,status:'dry-or-transition'};
  const [up,down]=ends.map(end=>end.level-end.soffit);
  const fraction=up*down<0?up/(up-down):null;
  const cap=fraction===null?null:{fraction,level:ends[0].soffit+fraction*(ends[1].soffit-ends[0].soffit)};
  return {ends,waterTop:ends.map(end=>Math.min(end.level,end.soffit)),cap,
    status:ends.some(end=>end.aboveSoffit>0)?'surcharge':'wet'};
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
  const newGeometryKeys=new Set(['roofFrom','roofTo','controlLevels']);
  return current.every((step,index)=>{
    const baseline=saved[index];
    return Object.keys(step).every(key=>{
      if(optionalKeys.has(key)&&!Object.hasOwn(baseline,key))return true;
      if(newGeometryKeys.has(key)&&!Object.hasOwn(baseline,key))return step[key]===null||Array.isArray(step[key])&&!step[key].length;
      return JSON.stringify(step[key])===JSON.stringify(baseline[key]);
    });
  });
}

function simulationBindings(network,columns){
  if(network.contextFormat!=='icm-csv-v1')return new Map();
  const key=(id,table='',suffix='')=>JSON.stringify([table,id.trim().toUpperCase(),suffix.trim().toUpperCase()]);
  const assets=new Map();
  const register=(identity,kind,id)=>assets.set(identity,assets.has(identity)?null:{kind,id});
  for(const node of network.nodes){
    if(node.sourceAttributes?.table==='hw_node')register(key(node.id),'node',node.id);
  }
  for(const edge of network.edges){
    if(edge.icm?.table&&edge.icm.linkSuffix&&edge.sourceAttributes?.table===edge.icm.table)
      register(key(edge.from,edge.icm.table,edge.icm.linkSuffix),'edge',edge.id);
  }
  const matches=new Map();
  for(const column of columns){
    const asset=column.asset;
    const identity=asset.kind==='node'?key(asset.id):key(asset.upstream,asset.table,asset.suffix);
    const match=assets.get(identity);
    if(match)matches.set(column.series,match);
  }
  return matches;
}

const simulationLayerKey=column=>JSON.stringify([column.asset.kind,column.quantity,column.unit,column.location,column.datum]);

function simulationLayers(columns){
  const layers=new Map();
  for(const column of columns){
    const key=simulationLayerKey(column);
    if(!layers.has(key))layers.set(key,[]);
    layers.get(key).push(column);
  }
  return layers;
}

function compatibleSimulationColumns(baseline,columns,proposal){
  if(!baseline||!columns.length||baseline.scenario===proposal.scenario||baseline.event!==proposal.event||
    baseline.temporalSupport!=='instantaneous'||proposal.temporalSupport!==baseline.temporalSupport)return [];
  const key=simulationLayerKey(columns[0]);
  return proposal.columns.filter(column=>simulationLayerKey(column)===key);
}

function compareSimulationSamples(baseline,proposal){
  return baseline.map((value,index)=>{
    const other=proposal[index];
    if(!Number.isFinite(value)||!Number.isFinite(other))return null;
    const difference=other-value;
    return Number.isFinite(difference)?difference:null;
  });
}

function simulationBand(value,low,high){
  if(!Number.isFinite(value))return 'missing';
  return String(Math.min(4,Math.max(0,Math.floor(5*(value-low)/(high-low)))));
}

function recordedFlowDirection(value,convention){
  if(!Number.isFinite(value)||!['upstream-to-downstream','downstream-to-upstream'].includes(convention))return null;
  if(value===0)return 'still';
  return (value>0)===(convention==='upstream-to-downstream')?'forward':'reverse';
}
function groundFreeboard(groundM,levelM){
  if(!Number.isFinite(groundM)||!Number.isFinite(levelM))return null;
  const difference=groundM-levelM;
  return Number.isFinite(difference)?difference:null;
}
function capacityUtilisation(flow,capacity){
  if(!Number.isFinite(flow)||!Number.isFinite(capacity)||capacity<=0)return null;
  const percent=100*(Math.abs(flow)/capacity);
  return Number.isFinite(percent)?percent:null;
}
function sourceConduitLayer(link,quantity){
  const fields=link?.icm;
  if(fields?.table!=='hw_conduit'||link.sourceAttributes?.table!=='hw_conduit')return null;
  if(quantity==='width'||quantity==='height'){
    const value=fields['conduit_'+quantity];
    return {value:Number.isFinite(value)&&value>0?value:null,unit:'mm',basis:'Imported conduit '+quantity};
  }
  if(quantity==='gradient'){
    if(Number.isFinite(fields.gradient))return {value:fields.gradient,unit:'m/m',basis:'Imported conduit gradient'};
    const {conduit_length:length,us_invert:us,ds_invert:ds}=fields;
    const value=[length,us,ds].every(Number.isFinite)&&length>0?(us-ds)/length:NaN;
    return {value:Number.isFinite(value)?value:null,unit:'m/m',basis:'Calculated from source invert levels and length'};
  }
  return null;
}
globalThis.ICMNetworkReviewCore={preferences,index,trace,components,audit,autoLayout,health,years,annualGroups,delta,review,refKey,monitorIndex,monitorMatches,mapDetrimentHotspots,overview,routePlanner,contributingCatchments,longSection,conduitEndProfile,profileAxis,sameProfileSteps,simulationBindings,simulationLayers,compatibleSimulationColumns,compareSimulationSamples,simulationBand,recordedFlowDirection,groundFreeboard,sourceConduitLayer,capacityUtilisation};
})();
