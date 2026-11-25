/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
/* Derived diagrams only. Source assets, geographic geometry and analyses are never changed here. */
(()=>{'use strict';
const C=globalThis.ICMNetworkCore,R=globalThis.ICMNetworkReviewCore;
const compare=(a,b)=>String(a).localeCompare(String(b));
const primaryNodes=new Set(['cso','storm','emergency','pump','wwtw','tank','outfall']);
const primaryLinks=new Set(['hw_pump','hw_weir']);
const normalise=value=>String(value??'').trim().toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ');
const directionFields=new Set(['direction','flow direction','direction confidence','flow regime']);
const kindFields=new Set(['route type','pipe type','hydraulic type','flow type','discharge type']);
const defaults=mode=>({orientation:'horizontal',level:mode==='strategic'?'compact':'standard',
  controls:mode==='engineering',expanded:[],positions:[],routes:[],hidden:[]});
const routeId=(key,members)=>JSON.stringify([key,members]);

function describeLink(edge){
  const table=edge.icm?.table || '';
  const fields=edge.sourceAttributes?.fields || [];
  const uncertain=C.directionInfo(edge).uncertain;
  const kinds=fields.filter(field=>kindFields.has(normalise(field.name))).map(field=>normalise(field.value));
  let kind='ordinary';
  if(table==='hw_pump'||kinds.some(value=>['rising main','pressure main','pumped','force main'].includes(value)))kind='pumped';
  else if(kinds.some(value=>['overflow','spill','spill route','spill discharge'].includes(value)))kind='overflow';
  else if(kinds.some(value=>['storm return','storage return','return flow'].includes(value)))kind='return';
  else if(kinds.includes('gravity'))kind='gravity';
  return {kind,uncertain,structure:table&&table!=='hw_conduit',primary:primaryLinks.has(table)};
}

function branchGroups(graph,protectedNodes,protectedLinks){
  // A folded feeder has one confirmed exit, no protected asset and no inlet from a retained branch.
  const eligible=new Set(),remaining=new Map(),minor=new Set();
  for(const [id,children] of graph.down){
    const parents=graph.up.get(id);
    if(protectedNodes.has(id)||children.length!==1||protectedLinks.has(children[0].edge)||
      parents.some(parent=>protectedLinks.has(parent.edge)))continue;
    eligible.add(id);remaining.set(id,parents.length);
  }
  const queue=[...eligible].filter(id=>remaining.get(id)===0);
  for(let index=0;index<queue.length;index++){
    const id=queue[index],next=graph.down.get(id)[0].id;
    minor.add(id);
    if(!eligible.has(next))continue;
    const count=remaining.get(next)-1;remaining.set(next,count);
    if(!count)queue.push(next);
  }
  const groups=[];
  for(const root of minor){
    if(minor.has(graph.down.get(root)[0].id))continue;
    const sourceNodes=[],sourceEdges=[],pending=[root];
    while(pending.length){
      const id=pending.pop();sourceNodes.push(id);
      for(const parent of graph.up.get(id))if(minor.has(parent.id)){
        sourceEdges.push(parent.edge);pending.push(parent.id);
      }
    }
    if(sourceNodes.length>1)groups.push({id:root,key:'group:'+root,sourceNodes,sourceEdges,
      to:graph.down.get(root)[0].id});
  }
  return groups.sort((a,b)=>compare(a.id,b.id));
}

function protectCycles(graph,retain){
  const visited=new Set();
  for(const start of graph.byId.keys()){
    const steps=new Map();let id=start;
    while(!visited.has(id)&&!steps.has(id)&&graph.down.get(id).length===1){
      steps.set(id,steps.size);id=graph.down.get(id)[0].id;
    }
    if(steps.has(id)){
      const cycle=[...steps.keys()].slice(steps.get(id));
      let count=cycle.filter(item=>retain.has(item)).length;
      for(const item of cycle)if(count<2&&!retain.has(item)){retain.add(item);count++;}
    }
    for(const item of steps.keys())visited.add(item);
  }
  for(const start of [...retain])for(const first of graph.down.get(start)){
    let id=first.id;
    while(!retain.has(id))id=graph.down.get(id)[0].id;
    if(id===start)retain.add(first.id);
  }
}

function project(network,mode,settings={},showMonitors=true){
  const options={...defaults(mode),...settings};
  const nodes=network.nodes.filter(node=>node.type!=='label').sort((a,b)=>compare(a.id,b.id));
  const ids=new Set(nodes.map(node=>node.id));
  const edges=network.edges.filter(edge=>ids.has(edge.from)&&ids.has(edge.to)).sort((a,b)=>compare(a.id,b.id));
  const sourceGraph=R.index(nodes,edges),sourceEdges=new Map(edges.map(edge=>[edge.id,edge]));
  const descriptions=new Map(edges.map(edge=>[edge.id,describeLink(edge)]));
  const pins=new Set((network.overviewPins||[]).map(R.refKey));
  if(showMonitors&&(network.monitorLocations||[]).length){
    const {byAsset}=R.monitorIndex(network);
    for(const location of network.monitorLocations){
      const key=R.refKey(location.asset);
      if(byAsset.get(key)?.identity===location.identity)pins.add(key);
    }
  }
  const keepNode=new Set(nodes.filter(node=>primaryNodes.has(node.type)||pins.has(R.refKey({kind:'node',id:node.id}))).map(node=>node.id));
  const keepLink=new Set();
  for(const edge of edges){
    const info=descriptions.get(edge.id);
    if(info.uncertain||info.primary||options.controls&&info.structure||info.kind!=='ordinary'&&info.kind!=='gravity'||
      pins.has(R.refKey({kind:'edge',id:edge.id}))){
      keepLink.add(edge.id);keepNode.add(edge.from);keepNode.add(edge.to);
    }
  }
  const expansion=new Set(options.expanded);
  const groups=options.level==='compact'?branchGroups(sourceGraph,keepNode,keepLink):[];
  const hiddenNodes=new Set(),nodeToGroup=new Map(),edgeToGroup=new Map(),expandedByNode=new Map(),expandedByEdge=new Map();
  const folded=[];
  for(const group of groups){
    keepNode.add(group.id);
    if(expansion.has(group.key)){
      for(const id of group.sourceNodes){keepNode.add(id);expandedByNode.set(id,group.key);}
      for(const id of group.sourceEdges)expandedByEdge.set(id,group.key);
      continue;
    }
    folded.push(group);
    for(const id of group.sourceNodes){nodeToGroup.set(id,group);if(id!==group.id)hiddenNodes.add(id);}
    for(const id of group.sourceEdges)edgeToGroup.set(id,group);
  }
  const visibleNodes=nodes.filter(node=>!hiddenNodes.has(node.id));
  const visibleEdges=edges.filter(edge=>!hiddenNodes.has(edge.from)&&!hiddenNodes.has(edge.to));
  const graph=R.index(visibleNodes,visibleEdges);
  const retain=new Set(visibleNodes.filter(node=>keepNode.has(node.id)||graph.up.get(node.id).length!==1||
    graph.down.get(node.id).length!==1).map(node=>node.id));
  protectCycles(graph,retain);
  const projectedEdges=[],nodeToReach=new Map(),edgeToReach=new Map();
  function remember(reach){
    projectedEdges.push(reach);
    for(const id of reach.sourceEdges)edgeToReach.set(id,reach);
    for(const id of reach.sourceNodes.slice(1,-1))nodeToReach.set(id,reach);
  }
  function makeReach(sourceNodes,members,key){
    const first=sourceEdges.get(members[0]),description=descriptions.get(first.id),single=members.length===1;
    return {...(single?first:{id:first.id,colour:'blue',contextSource:true}),
      from:sourceNodes[0],to:sourceNodes.at(-1),sourceNodes,sourceEdges:members,key,
      name:single?first.name||first.id:members.length+' source links',bends:[],labelOffset:undefined,
      routeKind:description.kind,direction:description.uncertain?'unknown':'nominal',arrow:first.arrow!==false};
  }
  const exposed=new Set();
  for(const start of retain)for(const first of graph.down.get(start)){
    const routeNodes=[start,first.id],members=[first.edge];
    let id=first.id;
    while(!retain.has(id)){
      const next=graph.down.get(id)[0];id=next.id;
      routeNodes.push(id);members.push(next.edge);
    }
    const key='reach:'+first.edge;
    if(members.length>1&&expansion.has(key)){
      for(const id of routeNodes.slice(1,-1)){expandedByNode.set(id,key);exposed.add(id);}
      members.forEach((id,index)=>{expandedByEdge.set(id,key);remember(makeReach(routeNodes.slice(index,index+2),[id],key));});
    }else remember(makeReach(routeNodes,members,key));
  }
  // Expanded reach interiors are retained after the traversal. Their links are already owned above.
  const projectedNodes=visibleNodes.filter(node=>retain.has(node.id)||exposed.has(node.id)).map(node=>{
    const group=nodeToGroup.get(node.id);
    const diagramLabel=mode!=='strategic'||group||primaryNodes.has(node.type)||pins.has(R.refKey({kind:'node',id:node.id}))||
      sourceGraph.up.get(node.id).length!==1||sourceGraph.down.get(node.id).length!==1;
    return {...node,pinned:false,labelOffset:undefined,nameOffset:undefined,
      diagramLabel:Boolean(diagramLabel),
      ...(group?{name:group.id+' → '+(sourceGraph.byId.get(group.to)?.name||group.to),diagramGroup:group}:{})};
  });
  return {nodes:projectedNodes,edges:projectedEdges,groups:folded,nodeToGroup,edgeToGroup,nodeToReach,edgeToReach,
    expandedByNode,expandedByEdge};
}

function ranks(graph,nodes,edges){
  const {groupOf,groups}=R.strongComponents(graph,nodes);
  const next=groups.map(()=>new Set()),degree=groups.map(()=>0),rank=groups.map(()=>0);
  for(const edge of edges){
    const from=groupOf.get(edge.from),to=groupOf.get(edge.to);
    if(from===to||next[from].has(to))continue;
    next[from].add(to);degree[to]++;
  }
  const queue=degree.flatMap((count,index)=>count===0?[index]:[]);
  for(let i=0;i<queue.length;i++)for(const to of next[queue[i]]){
    rank[to]=Math.max(rank[to],rank[queue[i]]+1);
    if(--degree[to]===0)queue.push(to);
  }
  return new Map(nodes.map(node=>[node.id,rank[groupOf.get(node.id)]]));
}

function feederTree(nodes,graph,levels){
  const outlets=nodes.filter(node=>graph.down.get(node.id).length===0);
  if(outlets.length!==1||nodes.some(node=>graph.down.get(node.id).length>1))return null;
  const pending=[outlets[0].id],ordered=[];
  while(pending.length){
    const id=pending.pop();ordered.push(id);
    const parents=graph.up.get(id).map(parent=>graph.byId.get(parent.id));
    parents.sort((a,b)=>a.y-b.y||a.x-b.x||compare(a.id,b.id));
    pending.push(...parents.map(parent=>parent.id));
  }
  if(ordered.length!==nodes.length)return null;
  const positions=new Map();let row=0;
  for(const id of ordered.reverse()){
    const parents=graph.up.get(id);
    // Contiguous tributary bands prevent separate catchments competing for the same lanes.
    const y=parents.length?parents.reduce((sum,parent)=>sum+positions.get(parent.id).y,0)/parents.length:70+row++*104;
    positions.set(id,{x:90+levels.get(id)*176,y});
  }
  return positions;
}

function layered(nodes,edges){
  const nominal=edges.filter(edge=>!C.directionInfo(edge).uncertain);
  const graph=R.index(nodes,nominal),levels=ranks(graph,nodes,nominal),layers=[];
  const tree=nominal.length===edges.length?feederTree(nodes,graph,levels):null;
  if(tree)return tree;
  for(const node of [...nodes].sort((a,b)=>a.y-b.y||a.x-b.x||compare(a.id,b.id))){
    const level=levels.get(node.id);
    (layers[level]??=[]).push(node.id);
  }
  const widest=Math.max(...layers.map(layer=>layer.length));
  const order=new Map();
  function stage(layer){layer.forEach((id,i)=>order.set(id,i-(layer.length-1)/2));}
  for(const layer of layers)stage(layer);
  for(let pass=0;pass<8;pass++){
    const forward=pass%2===0,lists=forward?layers:[...layers].reverse();
    for(const layer of lists){
      const scores=new Map();
      for(const id of layer){
        const peers=(forward?graph.up:graph.down).get(id).filter(peer=>levels.get(peer.id)!==levels.get(id));
        scores.set(id,peers.length?peers.reduce((sum,peer)=>sum+order.get(peer.id),0)/peers.length:order.get(id));
      }
      layer.sort((a,b)=>scores.get(a)-scores.get(b)||order.get(a)-order.get(b)||compare(a,b));
      stage(layer);
    }
  }
  const positions=new Map();
  const space=widest>=6?109:119;
  for(const [rank,layer] of layers.entries())for(const id of layer)positions.set(id,{x:90+rank*176,y:70+((widest-1)/2+order.get(id))*space});
  // Align a single continuation with its feeder when it fits between neighbouring symbols.
  for(const layer of layers)if(layer.length===1){
    const id=layer[0],parents=graph.up.get(id).filter(parent=>levels.get(parent.id)<levels.get(id));
    if(parents.length===1)positions.get(id).y=positions.get(parents[0].id).y;
    else if(parents.length>1)positions.get(id).y=parents.reduce((sum,parent)=>sum+positions.get(parent.id).y,0)/parents.length;
  }
  return positions;
}

const samePoint=(a,b)=>a.x===b.x&&a.y===b.y;
const footprint=node=>node.diagramGroup?{x:22,y:18}:C.bounds(node.type);
function clean(points){
  const output=[];
  for(const point of points){
    if(output.length&&samePoint(point,output.at(-1)))continue;
    const a=output.at(-2),b=output.at(-1);
    if(a&&((a.x===b.x&&b.x===point.x&&(b.y-a.y)*(point.y-b.y)>=0)||
      (a.y===b.y&&b.y===point.y&&(b.x-a.x)*(point.x-b.x)>=0)))output.pop();
    output.push(point);
  }
  return output;
}

function spatialIndex(size=180){
  const rows=new Map(),large=[],entries=[];
  const span=box=>[Math.floor(box.left/size),Math.floor(box.right/size),Math.floor(box.top/size),Math.floor(box.bottom/size)];
  return {
    add(item,box){
      entries.push({item,box});
      const [left,right,top,bottom]=span(box);
      if((right-left+1)*(bottom-top+1)>64){large.push({item,box});return;}
      for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++){
        const key=x+':'+y;
        if(!rows.has(key))rows.set(key,[]);
        rows.get(key).push(item);
      }
    },
    find(box){
      const [left,right,top,bottom]=span(box);
      const contains=other=>other.left<=box.right&&other.right>=box.left&&other.top<=box.bottom&&other.bottom>=box.top;
      if((right-left+1)*(bottom-top+1)>64)return new Set(entries.filter(entry=>contains(entry.box)).map(entry=>entry.item));
      const found=new Set(large.filter(entry=>contains(entry.box)).map(entry=>entry.item));
      for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++)for(const item of rows.get(x+':'+y)||[])found.add(item);
      return found;
    }
  };
}
function segment(a,b){return {left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)};}
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;

function routeLayout(nodes,edges,positions,manual,vertical){
  const boxes=spatialIndex(),existing=spatialIndex(),ports=new Map(),routes=new Map(),byId=new Map(nodes.map(node=>[node.id,node]));
  const groups=new Map(),paired=new Map();
  let top=Infinity,bottom=-Infinity;
  for(const node of nodes){
    const p=positions.get(node.id),b=footprint(node),labelWidth=Math.max(b.x+9,Math.min(84,(node.name||'').length*3.4+6));
    const box={id:node.id,left:p.x-(vertical?b.y+9:labelWidth),right:p.x+(vertical?b.y+9:labelWidth),
      top:p.y-(vertical?b.x+9:b.y+38),bottom:p.y+(vertical?b.x+9:b.y+9)};
    top=Math.min(top,box.top);bottom=Math.max(bottom,box.bottom);boxes.add(box,box);
  }
  for(const edge of edges){
    const a=positions.get(edge.from),b=positions.get(edge.to),delta=b.x-a.x;
    const waypoints=manual.get(routeId(edge.key,edge.sourceEdges));
    const first=waypoints?.[0],last=waypoints?.at(-1);
    const facing=Math.abs(delta)>85;
    const fromSide=first?(first.x<a.x?-1:1):facing?(delta>0?1:-1):1;
    const toSide=last?(last.x<b.x?-1:1):facing?-fromSide:1;
    const pairKey=JSON.stringify([edge.from,edge.to].sort(compare));
    const lane=paired.get(pairKey)||0;paired.set(pairKey,lane+1);
    const row={edge,lane,fromSide,toSide};ports.set(edge.id,row);
    for(const [endpoint,side,target,slot] of [[edge.from,fromSide,b,'from'],[edge.to,toSide,a,'to']]){
      const key=JSON.stringify([endpoint,side]);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({row,endpoint,side,target,slot});
    }
  }
  for(const peers of groups.values()){
    peers.sort((a,b)=>a.target.y-b.target.y||a.target.x-b.target.x||compare(a.row.edge.id,b.row.edge.id));
    peers.forEach(({row,endpoint,side,slot},i)=>{
      const p=positions.get(endpoint),b=footprint(byId.get(endpoint)),radius=vertical?b.y:b.x;
      const offset=peers.length===1?0:(i/(peers.length-1)*2-1)*Math.max(5,(vertical?b.x:b.y)-6);
      row[slot]={x:p.x+side*(b.circle?Math.sqrt(radius**2-offset**2):radius),y:p.y+offset};
    });
  }
  function routeScore(points,edge){
    let score=points.length*19;
    for(let i=1;i<points.length;i++){
      const span=segment(points[i-1],points[i]);
      for(const obstacle of boxes.find(span))if(obstacle.id!==edge.from&&obstacle.id!==edge.to&&overlaps(span,obstacle))score+=20_000;
      const buffer={left:span.left-5,right:span.right+5,top:span.top-5,bottom:span.bottom+5};
      for(const previous of existing.find(buffer)){
        if(overlaps(span,previous))score+=550;
        else if(span.left===span.right&&previous.left===previous.right&&Math.abs(span.left-previous.left)<5&&span.top<previous.bottom&&span.bottom>previous.top||
          span.top===span.bottom&&previous.top===previous.bottom&&Math.abs(span.top-previous.top)<5&&span.left<previous.right&&span.right>previous.left)score+=250;
      }
      score+=span.right-span.left+span.bottom-span.top;
    }
    return score;
  }
  const ranked=[...ports.values()].sort((a,b)=>Math.abs(a.from.y-a.to.y)-Math.abs(b.from.y-b.to.y));
  for(const {edge,lane,from,to,fromSide,toSide} of ranked){
    const start={x:from.x+fromSide*(14+lane*7),y:from.y},end={x:to.x+toSide*(14+lane*7),y:to.y};
    const candidates=[];
    const selected=manual.get(routeId(edge.key,edge.sourceEdges));
    if(selected?.length){
      const points=[from,start];
      for(const point of [...selected,end]){
        points.push({x:point.x,y:points.at(-1).y},point);
      }
      candidates.push(clean([...points,to]));
    }else{
      const width=end.x-start.x;
      if(fromSide!==toSide){
        for(const share of nodes.length>700?[.5,.25,.75]:[.5,.25,.75,.12,.88]){
          const x=start.x+width*share;
          candidates.push(clean([from,start,{x,y:start.y},{x,y:end.y},end,to]));
        }
      }else{
        for(const gap of [14,35,62,96]){
          const x=Math.max(start.x,end.x)+gap+lane*7;
          candidates.push(clean([from,start,{x,y:start.y},{x,y:end.y},end,to]));
        }
      }
      const detours=nodes.length>700?[]:[(start.y+end.y)/2,Math.min(start.y,end.y)-54-lane*8,Math.max(start.y,end.y)+49+lane*8];
      if(nodes.length<180)detours.push(top-22-lane*8,bottom+22+lane*8);
      for(const y of detours){
        candidates.push(clean([from,start,{x:start.x,y},{x:end.x,y},end,to]));
      }
    }
    let best=candidates[0],cost=routeScore(best,edge);
    for(const points of candidates.slice(1)){
      const candidate=routeScore(points,edge);
      if(candidate<cost){best=points;cost=candidate;}
    }
    routes.set(edge.id,best);
    for(let i=1;i<best.length;i++){
      const item=segment(best[i-1],best[i]);existing.add(item,item);
    }
  }
  return routes;
}

function layout(diagram,settings={}){
  const {nodes,edges}=diagram;
  const vertical=settings.orientation==='vertical';
  const turn=({x,y})=>vertical?{x:y,y:x}:{x,y};
  const fixed=new Map((settings.positions||[]).map(point=>[point.id,turn(point)]));
  const manual=new Map((settings.routes||[]).map(route=>[routeId(route.key,route.members),route.points.map(turn)]));
  const components=R.components(nodes,edges),componentOf=new Map(),byId=new Map(nodes.map(node=>[node.id,node]));
  const componentEdges=components.map(()=>[]);
  components.forEach((ids,index)=>{for(const id of ids)componentOf.set(id,index);});
  for(const edge of edges)componentEdges[componentOf.get(edge.from)].push(edge);
  const positions=new Map(),routes=new Map(),parts=[];
  let row=0;
  for(const [i,ids] of components.entries()){
    const local=ids.map(id=>byId.get(id)),links=componentEdges[i],placed=layered(local,links);
    const occupied=spatialIndex();
    const keep=point=>occupied.add(point,{left:point.x-116,right:point.x+116,top:point.y-82,bottom:point.y+82});
    for(const id of ids)if(fixed.has(id)){placed.set(id,fixed.get(id));keep(fixed.get(id));}
    for(const node of local)if(!fixed.has(node.id)){
      const point=placed.get(node.id);point.y+=row;
      while([...occupied.find(segment(point,point))].some(p=>Math.abs(p.x-point.x)<112&&Math.abs(p.y-point.y)<80))point.y+=85;
      keep(point);
    }
    const localRoutes=routeLayout(local,links,placed,manual,vertical);
    for(const [id,p] of placed)positions.set(id,turn(p));
    for(const [id,path] of localRoutes)routes.set(id,path.map(turn));
    let highest=row;
    for(const {y} of placed.values())highest=Math.max(highest,y);
    for(const points of localRoutes.values())for(const {y} of points)highest=Math.max(highest,y);
    parts.push({ids,label:'Component '+(i+1),point:turn({x:21,y:row+2})});
    row=highest+174;
  }
  return {positions,routes,parts};
}

globalThis.ICMNetworkDiagram={defaults,describeLink,project,layout,routeId};
})();
