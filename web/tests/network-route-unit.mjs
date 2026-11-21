import assert from 'node:assert/strict';
import '../assets/network-schematic-core.js';
import '../assets/network-review-core.js';
import {nativeNetwork} from './network-route-fixture.mjs';
const C=globalThis.ICMNetworkCore,R=globalThis.ICMNetworkReviewCore;
const network=C.importNativeContext([{name:'synthetic.csv',text:nativeNetwork}]).network;
const byName=name=>network.edges.find(edge=>edge.name===name);
const e1=byName('00127.1'),e2=byName('B.1'),e3=byName('C.1');
const plan=R.routePlanner(network,'00127','E');
assert.deepEqual(plan.options('00127',new Set()).map(edge=>edge.id),[e1.id]);
assert.deepEqual(plan.options('B',new Set(['00127'])).map(edge=>edge.name),['B.1','B.2','B.3']);
assert.match(R.routePlanner(network,'E','B').issue(),/No forward/);
assert.match(R.routePlanner(network,'Z','B').issue(),/disconnected/);
const steps=R.longSection(network,[e1,e2,e3]);
assert.deepEqual(steps.map(({chainageStart,chainageEnd,us,ds,height})=>[chainageStart,chainageEnd,us,ds,height]),[
  [0,100,10,9.8,.6],[100,220,9.75,9.35,.6],[220,null,9.3,null,.6]]);
assert.deepEqual(steps[0].sources.map(({table,row})=>[table,row]),[['hw_conduit',12],['hw_node',3],['hw_node',4]]);
assert.equal(R.longSection(network,[byName('B.3'),byName('D.P'),e3])[1].lengthStatus,'structure');
assert.equal(steps[0].chamberFrom,network.nodes.find(node=>node.id==='00127').icm.chamberFloorM);
assert.deepEqual(R.profileAxis(0,100,4,0),{low:0,high:25,span:25});
assert.deepEqual(R.profileAxis(0,100,4,1),{low:75,high:100,span:25});
assert.deepEqual(R.profileAxis(9,12,2,.5),{low:9.75,high:11.25,span:1.5});
assert.throws(()=>R.profileAxis(1,1,4,.5),/source bounds/);
assert.deepEqual([steps[0].widthMm,steps[0].heightMm,steps[0].shape],[600,600,'CIRC']);
const legacySteps=steps.map(({chamberFrom,chamberTo,widthMm,heightMm,shape,...step})=>step);
assert(R.sameProfileSteps(steps,legacySteps));
assert(!R.sameProfileSteps(steps,[{...steps[0],chamberFrom:0},...steps.slice(1)]));
assert(!R.sameProfileSteps(steps,[{...legacySteps[0],length:50},...legacySteps.slice(1)]));
const savedRoute={name:'Synthetic route',start:'00127',end:'E',note:'',steps,trials:[],model:null,
  profileView:{zoomX:4,zoomY:2,panX:.4,panY:.7,groundShading:true}};
assert.deepEqual(C.validateNetwork({...network,routeReviews:[savedRoute]}).routeReviews[0].profileView,savedRoute.profileView);
assert.throws(()=>C.validateNetwork({...network,routeReviews:[{...savedRoute,profileView:{...savedRoute.profileView,zoomY:Infinity}}]}),/routeReviews/);

const nodeResult={series:'node',asset:{kind:'node',id:'00127'}};
const conduitResult={series:'conduit',asset:{kind:'link',upstream:'b',table:'hw_conduit',suffix:'1'}};
const wrongTable={series:'weir',asset:{...conduitResult.asset,table:'hw_weir'}};
const trimmedZero={series:'trimmed',asset:{kind:'node',id:'127'}};
const resultNetwork={...network,contextFormat:'icm-csv-v1'};
assert.deepEqual([...R.simulationBindings(resultNetwork,[nodeResult,conduitResult,wrongTable,trimmedZero])],
  [['node',{kind:'node',id:'00127'}],['conduit',{kind:'edge',id:e2.id}]]);
assert.equal(R.simulationBindings({...resultNetwork,nodes:[...network.nodes,{...network.nodes[0]}]},[nodeResult]).size,0);
assert.equal(R.simulationBindings({...resultNetwork,contextFormat:'canonical-v1'},[nodeResult]).size,0);
assert.deepEqual([null,-2,-1,0,1,2].map(value=>R.simulationBand(value,-1,1)),['missing','0','0','2','4','4']);

const table=C.monitorTable('\ufeffColumn 1,Column 2\r\n00127,"FM, 01"\r\n00127,"FM, 01"\r\nB.1,FM-02\r\n\r\nunknown,FM-03\r\n');
assert.deepEqual(table.rows[0],['00127','FM, 01']);
assert.deepEqual(R.monitorMatches(table,1,network).map(row=>row.state),['Matched','Duplicate','Ambiguous','Unmatched']);
assert.throws(()=>C.monitorTable('A,B\n"broken'),/unterminated/);
assert.throws(()=>C.monitorTable('A,B\n1,2,3'),/two columns/);
const ambiguous={...network,edges:network.edges.map(edge=>edge===e1?{...edge,id:'00127'}:edge)};
const pick=R.monitorMatches(table,1,ambiguous);
assert.equal(pick[0].state,'Ambiguous');
assert.deepEqual(pick[0].choices.map(ref=>ref.kind),['node','edge']);
const resolved=R.monitorMatches(table,1,ambiguous,new Map([[0,R.refKey(pick[0].choices[1])],[1,R.refKey(pick[1].choices[1])]]));
assert.deepEqual(resolved.slice(0,2).map(row=>row.state),['Matched','Duplicate']);
const monitor={monitor:resolved[0].monitor,asset:{kind:'edge',id:'00127'},sourceId:'00127',identity:resolved[0].match.identity};
assert.equal(R.monitorMatches(table,1,{...ambiguous,monitorLocations:[monitor]},new Map([[0,R.refKey(pick[0].choices[0])],[1,R.refKey(pick[1].choices[0])]]))[0].state,'Confirm change');
assert.equal(C.validateNetwork({...network,monitorLocations:[monitor]}).monitorLocations[0].sourceId,'00127');
assert.throws(()=>C.validateNetwork({...network,monitorLocations:[monitor,monitor]}),/Duplicate/);
assert.equal(C.validateNetwork(network).preferences.showLabels,true);

const makeNode=id=>({id,name:id,type:'manhole',colour:'blue',x:0,y:0,bindings:[]});
const makeEdge=(from,to,id)=>({id,from,to,colour:'blue'});
const loop={...C.empty(),nodes:'ABCDEFGH'.split('').map(makeNode),edges:[
  makeEdge('A','B','ab'),makeEdge('B','C','bc'),makeEdge('C','B','cb'),makeEdge('B','D','bd'),
  makeEdge('D','E','de'),makeEdge('F','G','fg'),makeEdge('G','F','gf'),
  {...makeEdge('E','H','eh'),direction:'unknown'}]};
const simplified=R.overview(loop);
assert.deepEqual(simplified.edgeToReach.get('bd').sourceEdges,['bd','de']);
assert.equal(simplified.nodeToReach.get('D').id,'bd');
assert(simplified.edges.every(edge=>edge.from!==edge.to));
assert.equal(simplified.edgeToReach.get('eh').arrow,false);
for(const retain of simplified.nodes){
  const original=R.trace(loop.nodes,loop.edges,retain.id).ids;
  const overview=R.trace(simplified.nodes,simplified.edges,retain.id).ids;
  assert.deepEqual([...original].filter(id=>simplified.nodes.some(node=>node.id===id)).sort(),[...overview].sort());
}
assert.deepEqual(R.overview(loop).nodes,simplified.nodes);
assert.equal(R.overview(network).edges.filter(edge=>edge.icm.table==='hw_pump').length,1);
assert.equal(R.overview(network).edges.filter(edge=>edge.icm.table==='hw_weir').length,1);

const count=1800;
const dense={...C.empty(),nodes:Array.from({length:count},(_,i)=>makeNode(String(i))),edges:[]};
for(let i=1;i<count;i++){
  dense.edges.push(makeEdge(String(i-1),String(i),'reach-'+i));
  if(i%12===0)dense.edges.push(makeEdge(String(i-1),String(i),'parallel-'+i));
}
const started=performance.now();
const denseOverview=R.overview(dense);
assert.equal(denseOverview.edgeToReach.size,dense.edges.length);
assert(denseOverview.nodes.length<dense.nodes.length/3);
console.log('Network review geometry, branching, cycle connectivity, monitor validation, migration and dense overview passed in '+Math.round(performance.now()-started)+' ms for the dense projection.');
