import assert from 'node:assert/strict';
import '../assets/network-schematic-core.js';
import '../assets/network-review-core.js';
import '../assets/network-diagram-core.js';
const C=globalThis.ICMNetworkCore,R=globalThis.ICMNetworkReviewCore,D=globalThis.ICMNetworkDiagram;
const network=C.empty();
network.nodes=['A','B','C','D'].map((id,index)=>({id,name:id,type:'manhole',colour:'blue',x:index*100,y:0,bindings:[]}));
const link=(id,from,to,fields=[])=>({id,from,to,colour:'blue',direction:'nominal',icm:{table:'hw_conduit'},sourceAttributes:{table:'hw_conduit',file:'synthetic.csv',row:1,fields:fields.map(field=>({label:'',unit:'',...field}))}});
network.edges=[link('uncertain','A','B',[{name:'flow_direction',value:'Unknown'}]),link('bc','B','C'),link('ad','A','D'),link('dc','D','C')];
for(const value of ['Unknown','reversible','bidirectional','bi-directional','uncertain','unconfirmed']){
  const edge=link('test','A','B',[{name:'flow_direction',value}]);
  assert.equal(C.directionInfo(edge).direction,'unknown');
  assert.equal(D.describeLink(edge).uncertain,true);
  const restored=C.validateNetwork({...network,edges:[edge]});
  assert.equal(C.directionInfo(restored.edges[0]).direction,'unknown','legacy nominal does not override typed source uncertainty');
  assert.equal(restored.edges[0].sourceAttributes.fields[0].value,value);
}
assert.deepEqual([...R.trace(network.nodes,network.edges,'A').ids].sort(),['A','C','D']);
const plan=R.routePlanner(network,'A','C');assert.deepEqual(plan.options('A',[]).map(edge=>edge.id),['ad']);
for(const mode of ['engineering','strategic'])assert.equal(D.project(network,mode).edgeToReach.get('uncertain').direction,'unknown');
const noAlternate={...network,edges:network.edges.slice(0,2)};
assert.deepEqual(R.routePlanner(noAlternate,'A','C').options('A',[]),[]);
assert.match(R.routePlanner(noAlternate,'A','C').issue(),/unknown direction/);
assert.equal(C.directionInfo(link('plain','A','B')).direction,'nominal');
assert.equal(C.directionInfo({...link('manual','A','B'),direction:'unknown'}).direction,'unknown');
console.log('NETWORK_DIRECTION_CONTRACT_PASS: explicit uncertainty, legacy restore, projections, nominal traces and confirmed alternate paths');
