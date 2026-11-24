import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeNetwork} from './network-route-fixture.mjs';
import '../assets/network-schematic-core.js';
import '../assets/network-review-core.js';

await import('../assets/network-diagram-core.js');
const D=globalThis.ICMNetworkDiagram;
assert.ok(D,'Engineering and strategic projections must be available');

const C=globalThis.ICMNetworkCore,R=globalThis.ICMNetworkReviewCore;
const bundle=JSON.parse(readFileSync(new URL('../../reference/current-tool/synthetic-manifest.json',import.meta.url)));
const sample=C.empty();
for(const [index,[id,,,upstream]] of bundle.association_rows.entries()){
  sample.nodes.push({id,name:id,type:'manhole',colour:'blue',x:index*100,y:index%3*100,bindings:[]});
  for(const from of upstream.split(',').map(item=>item.trim()).filter(Boolean)){
    sample.edges.push({id:from+'--'+id,from,to:id,colour:'blue',name:from+'–'+id});
  }
}
const original=JSON.stringify(sample);
const engineering=D.project(sample,'engineering');
assert.equal(engineering.nodes.length,9);
assert.equal(engineering.edges.length,8);
assert.equal(JSON.stringify(sample),original,'diagram generation preserves source state');
const strategic=D.project(sample,'strategic');
assert.ok(strategic.nodes.length<engineering.nodes.length);
assert.ok(strategic.groups.length>0);

function verifyProvenance(source,diagram){
  const byId=new Map(source.edges.map(edge=>[edge.id,edge]));
  const accounted=[];
  for(const edge of diagram.edges){
    assert.equal(edge.from,edge.sourceNodes[0]);
    assert.equal(edge.to,edge.sourceNodes.at(-1));
    assert.equal(edge.sourceEdges.length+1,edge.sourceNodes.length);
    edge.sourceEdges.forEach((id,index)=>{
      assert.deepEqual([byId.get(id).from,byId.get(id).to],edge.sourceNodes.slice(index,index+2));
      accounted.push(id);
    });
  }
  for(const group of diagram.groups)for(const id of group.sourceEdges){
    assert(group.sourceNodes.includes(byId.get(id).from));
    assert(group.sourceNodes.includes(byId.get(id).to));
    accounted.push(id);
  }
  assert.deepEqual(accounted.sort(),[...byId.keys()].sort(),'every source link has a single owner');
  const retained=new Set(diagram.nodes.map(node=>node.id));
  for(const id of retained){
    const relevant=network=>[...R.trace(network.nodes,network.edges.filter(edge=>!D.describeLink(edge).uncertain),id).ids]
      .filter(node=>retained.has(node)).sort();
    assert.deepEqual(relevant(diagram),relevant(source),'retained nodes preserve nominal reachability');
  }
}
verifyProvenance(sample,engineering);
verifyProvenance(sample,strategic);
const group=strategic.groups[0];
const expanded=D.project(sample,'strategic',{expanded:[group.key]});
assert(expanded.nodes.length>strategic.nodes.length);
verifyProvenance(sample,expanded);

function verifyLayout(graph,layout){
  assert.equal(layout.routes.size,graph.edges.length);
  for(const route of layout.routes.values()){
    assert(route.length>=2);
    for(let i=1;i<route.length;i++)assert(route[i].x===route[i-1].x||route[i].y===route[i-1].y);
  }
  assert.equal(new Set([...layout.positions.values()].map(p=>JSON.stringify(p))).size,graph.nodes.length);
}
const placed=D.layout(engineering);
verifyLayout(engineering,placed);
assert.deepEqual(D.layout(engineering),placed,'layout is repeatable');
const vertical=D.layout(engineering,{orientation:'vertical'});
const last=sample.nodes.at(-1).id;
assert(vertical.positions.get(last).y>vertical.positions.get(sample.nodes[0].id).y);
const pin={id:last,x:600,y:300};
const edited=D.layout(engineering,{positions:[pin]});
assert.deepEqual(edited.positions.get(last),{x:600,y:300});

const mixed=C.empty();
const mixedTypes=[['feeding','manhole'],['ordinary','manhole'],['spill','cso'],['spill-2','cso'],['tank','tank'],['pump','pump'],
  ['discharge','manhole'],['works','wwtw'],['river','outfall'],['river-2','outfall'],['unknown','manhole'],
  ['parallel-in','manhole'],['L1','manhole'],['L2','manhole'],['L3','manhole'],['isolated','manhole']];
mixed.nodes=mixedTypes.map(([id,type],i)=>({id,type,name:id,x:i,y:i%4,bindings:[]}));
function addEdge(target,id,from,to,table='hw_conduit',fields=[]){
  target.edges.push({id,from,to,colour:'blue',name:id,icm:{table},sourceAttributes:{fields:fields.map(([name,value])=>({name,value}))}});
}
for(const args of [
  ['feed','feeding','ordinary'],['ordinary-cso','ordinary','spill'],['continuation','spill','tank'],
  ['weir','spill','river','hw_weir',[['route_type','overflow']]],['tank-return','tank','ordinary','hw_conduit',[['route_type','storm return']]],
  ['orifice','tank','pump','hw_orifice'],['pump-link','pump','discharge','hw_pump'],
  ['rising','discharge','works','hw_conduit',[['route_type','rising main']]],['pass','spill','spill-2'],
  ['sluice','spill-2','river-2','hw_sluice',[['flow_direction','reversible']]],
  ['unknown','unknown','tank','hw_conduit',[['direction','unknown']]],
  ['parallel-1','parallel-in','works'],['parallel-2','parallel-in','works'],['loop-a','L1','L2'],['loop-b','L2','L3'],['loop-c','L3','L1'],
])addEdge(mixed,...args);
const mixedOriginal=structuredClone(mixed);
for(const mode of ['engineering','strategic']){
  const diagram=D.project(mixed,mode);
  verifyProvenance(mixed,diagram);
  const routed=D.layout(diagram);
  verifyLayout(diagram,routed);
  assert.equal(routed.parts.length,3);
  for(const type of ['cso','pump','wwtw','outfall','tank'])assert(diagram.nodes.some(node=>node.type===type));
  assert.equal(diagram.edgeToReach.get('sluice').direction,'unknown');
  for(const [id,kind] of [['weir','overflow'],['rising','pumped'],['tank-return','return']])assert.equal(diagram.edgeToReach.get(id).routeKind,kind);
  assert.notDeepEqual(routed.routes.get('parallel-1'),routed.routes.get('parallel-2'));
  verifyLayout(diagram,D.layout(diagram,{orientation:'vertical'}));
}
assert.deepEqual(mixed,mixedOriginal);
const legacy=structuredClone(sample);
legacy.preferences={...legacy.preferences,overview:true};
assert.equal(C.validateNetwork(legacy).preferences.diagramMode,'engineering');
const imported=text=>C.importNativeContext([{name:'review.csv',text}]).network;
const base=C.applyContextRevision(C.empty(),imported(nativeNetwork),'icm-csv-v1');
const known=base.edges.find(edge=>edge.from==='B'&&edge.to==='C'&&edge.name==='B.1');
assert(known);
const layoutPreferences={...D.defaults('engineering'),positions:[{id:'B',x:620,y:128}],
  routes:[{key:'reach:'+known.id,members:[known.id],points:[{x:420,y:210}]}]};
base.diagrams={version:1,engineering:layoutPreferences};
const restored=C.validateNetwork(base);
assert.deepEqual(restored.diagrams,base.diagrams);
assert.throws(()=>C.validateNetwork({...base,diagrams:{version:1,engineering:{...layoutPreferences,
  positions:[{id:'B',x:Infinity,y:0}]}}}),/Invalid diagram/);
const compatible=C.applyContextRevision(restored,imported(nativeNetwork.replace('11,9.95','11,9.96')),'icm-csv-v1');
assert.deepEqual(compatible.diagrams,base.diagrams);
const revised=C.applyContextRevision(restored,imported(nativeNetwork.replace('B,C,1,CIRC','B,D,1,CIRC')),'icm-csv-v1');
assert.deepEqual(revised.diagrams.engineering.positions,layoutPreferences.positions);
assert.deepEqual(revised.diagrams.engineering.routes,[]);
const routedReach=engineering.edges[0];
const waypoint={x:400,y:85};
const routedWithPin=D.layout(engineering,{routes:[{key:routedReach.key,members:routedReach.sourceEdges,points:[waypoint]}]});
assert(routedWithPin.routes.get(routedReach.id).some((point,index,path)=>{
  const next=path[index+1];
  return next&&(point.y===waypoint.y&&next.y===waypoint.y&&Math.min(point.x,next.x)<=waypoint.x&&Math.max(point.x,next.x)>=waypoint.x||
    point.x===waypoint.x&&next.x===waypoint.x&&Math.min(point.y,next.y)<=waypoint.y&&Math.max(point.y,next.y)>=waypoint.y);
}));

for(const count of [201,801,5001]){
  const dense=C.empty();
  for(let i=0;i<count;i++){
    dense.nodes.push({id:String(i),name:'Manhole '+i,type:i===0?'outfall':i%101===0?'cso':'manhole',x:i%64,y:i/64,bindings:[]});
    if(i)addEdge(dense,String(i),String(i),String(Math.floor((i-1)/2)));
  }
  const measurements={sourceAssets:dense.nodes.length+dense.edges.length};
  for(const mode of ['engineering','strategic']){
    const start=performance.now(),diagram=D.project(dense,mode),layout=D.layout(diagram);
    measurements[mode]={points:diagram.nodes.length,connectors:diagram.edges.length,elapsedMs:Math.round(performance.now()-start)};
    verifyLayout(diagram,layout);
  }
  assert(measurements.strategic.points<measurements.engineering.points/2);
  console.log(JSON.stringify(measurements));
}
console.log('NETWORK_DIAGRAM_UNIT_PASS');
