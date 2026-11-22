import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
for(const name of ['network-schematic-core','network-review-core'])vm.runInContext(fs.readFileSync('web/assets/'+name+'.js','utf8'),context);
const C=context.ICMNetworkCore,R=context.ICMNetworkReviewCore;
const nodes=['a','b','c','d','e'].map((id,i)=>({id,name:id,type:'cso',colour:'red',x:i*100,y:200,bindings:[],exclusions:[]}));
const edges=[{id:'ab',from:'a',to:'b',colour:'red'},{id:'bc',from:'b',to:'c',colour:'red'},{id:'cb',from:'c',to:'b',colour:'red'},{id:'cd',from:'c',to:'d',colour:'red'}];
assert.deepEqual([...R.trace(nodes,edges,'a').ids].sort(),['a','b','c','d']);
assert.deepEqual([...R.trace(nodes,edges,'d','up').ids].sort(),['a','b','c','d']);
assert.equal(R.trace(nodes,edges,'missing').ids.size,0);
const audit=R.audit(nodes,edges);assert.equal(audit.components.length,2);assert.deepEqual([...audit.isolated],['e']);assert.deepEqual([...audit.cycleAffected].sort(),['b','c','d']);
nodes[0].pinned=true;
const positions=R.autoLayout(nodes,edges);assert.equal(positions.get('a').x,nodes[0].x);assert.equal(positions.get('a').y,nodes[0].y);assert.equal(positions.get('b').x,positions.get('c').x);assert(positions.get('d').x>positions.get('b').x);
assert.equal(JSON.stringify([...positions]),JSON.stringify([...R.autoLayout(nodes,edges)]));
const bindings=[{id:'o23',role:'observed',scenario:'Observed',years:[2023],sourceName:'O',sha256:'hash',column:'depth'},{id:'m24',role:'model',scenario:'Baseline',years:[2024],sourceName:'M',sha256:'hash2',column:'depth'}];
const n={...nodes[1],bindings,applied:{signature:'test',rows:[{year:2023,role:'observed',scenario:'Observed',eligible:true,spill_count:0,duration_hours:0,count_status:'definitive',analysis_start:'2023-01-01',analysis_end:'2024-01-01'}]}};
const groups=R.annualGroups(n);assert.equal(groups.length,2);assert.equal(groups[0].observed.spill_count,0);assert.equal(groups[1].observed,undefined);assert.equal(groups[1].model,undefined);
assert.equal(R.health(n,true),'ready');assert.equal(R.health(n,false),'stale');assert.equal(R.health(n,true,false),'missing');assert.equal(R.health({...n,applied:null},true),'uncalculated');
assert.equal(R.delta(0,1),1);assert.equal(R.delta(null,1),null);
const legacy=C.validateNetwork({schema:1,nodes,edges});assert.equal(legacy.schema,2);assert.equal(legacy.views.length,0);assert.equal(legacy.preferences.detail,'auto');
assert.throws(()=>C.validateNetwork({...legacy,preferences:{...legacy.preferences,scenarios:'all'}}),/preferences/);
assert.throws(()=>C.validateNetwork({...legacy,nodes:[{...nodes[0],review:{comment:'x',status:'made-up'}},...nodes.slice(1)]}),/review/i);
console.log('Annual review: cycle-safe tracing/layout, pinned geometry, independent years/zero/missing, evidence health and legacy migration passed.');

const mappedNetwork={nodes:[{id:'001',sourceName:'001',name:'Edited node',contextSource:true,type:'manhole'},
  {id:'manual',name:'Manual node',type:'manhole'}],edges:[
  {id:'K1',sourceName:'001',name:'Edited link',contextSource:true},
  {id:'K2',sourceName:'001.B',contextSource:true},{id:'K3',sourceName:'001.B',contextSource:true},
  {id:'K4',sourceName:'001.C',contextSource:true}]};
const reviewItems=[['node','001'],['link','001'],['link','001.B'],['unclassified','001'],
  ['node','manual'],['node','Edited node'],['link','001.C'],['link','K4']].map(([assetKind,assetId])=>({assetKind,assetId}));
const hotspots=R.mapDetrimentHotspots(mappedNetwork,reviewItems);
assert.deepEqual([...hotspots.mapped.keys()],['["node","001"]','["edge","K1"]']);
assert.equal(hotspots.ambiguous.length,3,'Duplicate source IDs and duplicate report aliases stay unresolved');
assert.deepEqual(Array.from(hotspots.unmatched,row=>row.assetId),['manual','Edited node']);
assert.equal(hotspots.unclassified.length,1,'Unclassified report evidence stays in the register');
console.log('Detriment hotspot matching preserves original typed identity and withholds ambiguous or unsupported matches.');
assert.equal(R.recordedFlowDirection(0.25, 'upstream-to-downstream'), 'forward');
assert.equal(R.recordedFlowDirection(-0.25, 'upstream-to-downstream'), 'reverse');
assert.equal(R.recordedFlowDirection(-0.25, 'downstream-to-upstream'), 'forward');
assert.equal(R.recordedFlowDirection(0, 'upstream-to-downstream'), 'still');
assert.equal(R.recordedFlowDirection(null, 'upstream-to-downstream'), null);
assert.equal(R.recordedFlowDirection(-0.25, ''), null);
