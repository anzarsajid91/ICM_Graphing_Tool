/* Annual review helpers: topology and presentation never alter spill evidence. */
(()=>{'use strict';
const C=globalThis.ICMNetworkCore;
function preferences(n){return {snap:false,locked:false,detail:'auto',type:'all',health:'all',result:'all',scenarios:null,...n.preferences};}
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
globalThis.ICMNetworkReviewCore={preferences,index,trace,components,audit,autoLayout,health,years,annualGroups,delta,review};
})();
