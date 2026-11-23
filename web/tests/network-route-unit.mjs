import assert from 'node:assert/strict';
import '../assets/network-schematic-core.js';
import '../assets/network-review-core.js';
import {nativeNetwork,controlProfileNetwork,largeNativeNetwork} from './network-route-fixture.mjs';
const C=globalThis.ICMNetworkCore,R=globalThis.ICMNetworkReviewCore;
const network=C.importNativeContext([{name:'synthetic.csv',text:nativeNetwork}]).network;
const byName=name=>network.edges.find(edge=>edge.name===name);
const e1=byName('00127.1'),e2=byName('B.1'),e3=byName('C.1');
const controls=C.importNativeContext([{name:'synthetic-profile-controls.csv',text:controlProfileNetwork}]).network;
const controlLinks=['A.1','B.P','C.W','D.O','E.S','F.1'].map(name=>controls.edges.find(edge=>edge.name===name));
const controlledProfile=R.longSection(controls,controlLinks);
assert.deepEqual(controlledProfile.map(step=>step.chainageStart),[0,100,100,100,100,100]);
assert.equal(controlledProfile[0].height,.5);
assert.equal(controlledProfile[0].roofTo,11);
assert.equal(controlledProfile.at(-1).height,.6);
assert.deepEqual(controlledProfile.slice(1,5).map(step=>step.controlLevels.map(level=>level.value)),[[10.8,10.1],[10.9],[10.5],[10.6]]);
assert.equal(R.conduitEndProfile(controlledProfile[0],10.7,10.4).status,'wet');
assert.equal(R.conduitEndProfile(controlledProfile[0],11.4,10.4).ends[0].soffit,10.9);
const nativeWeir=controlLinks[2],source=structuredClone(nativeWeir.sourceAttributes);
source.fields.find(field=>field.name==='crest').unit='ft';
assert.deepEqual(R.longSection(controls,[{...nativeWeir,sourceAttributes:source}])[0].controlLevels,[]);
const plan=R.routePlanner(network,'00127','E');
assert.deepEqual(plan.options('00127',new Set()).map(edge=>edge.id),[e1.id]);
assert.deepEqual(plan.options('B',new Set(['00127'])).map(edge=>edge.name),['B.1','B.2','B.3']);
assert.match(R.routePlanner(network,'E','B').issue(),/No forward/);
assert.match(R.routePlanner(network,'Z','B').issue(),/disconnected/);
const catchments=[
  {id:'001',drainsTo:'Node',nodeId:'00127'},
  {id:'002',drainsTo:'Node',nodeId:'Z'},
  {id:'003',drainsTo:'Link',nodeId:'00127',linkSuffix:'1'},
  {id:'004',drainsTo:'Subcatchment',toCatchment:'001'},
  {id:'005',drainsTo:'Node',nodeId:'00127',groundNode:'Z'},
  {id:'006',drainsTo:'Multiple links',nodeId:'00127'},
  {id:'007',drainsTo:'Subcatchment',toCatchment:'008'},
  {id:'008',drainsTo:'Subcatchment',toCatchment:'007'},
  {id:'009',drainsTo:'Node',nodeId:'00127'},
  {id:'009',drainsTo:'Node',nodeId:'Z'},
  {id:'010',drainsTo:'Node',nodeId:'127'},
];
const nativeContext={...network,contextFormat:'icm-csv-v1'};
const contributions=R.contributingCatchments(nativeContext,{kind:'node',id:'B'},catchments);
assert.deepEqual(contributions.map(row=>row.status),[
  'Candidate','Disconnected','Candidate','Candidate','Ambiguous','Ambiguous',
  'Ambiguous','Ambiguous','Duplicate','Duplicate','Ambiguous']);
assert.match(contributions[4].reason,/ground/i);
assert.match(contributions[5].reason,/lateral/i);
assert.match(contributions[6].reason,/cycle/i);
assert.match(R.contributingCatchments(nativeContext,{kind:'edge',id:e2.id},catchments)[0].reason,/branch/i);
assert.equal(R.contributingCatchments(nativeContext,{kind:'edge',id:e1.id},catchments)[2].status,'Candidate');
const alteredDirection={...nativeContext,edges:network.edges.map(edge=>edge.id===e1.id?{...edge,direction:'unknown'}:edge)};
assert.match(R.contributingCatchments(alteredDirection,{kind:'node',id:'B'},catchments)[0].reason,/direction/i);
const borrowedLink=(id,from,to)=>({...e1,id,from,to});
const cyclicContext={...nativeContext,edges:[...nativeContext.edges,borrowedLink('cycle','C','00127')]};
assert.match(R.contributingCatchments(cyclicContext,{kind:'node',id:'B'},catchments)[0].reason,/cycle/i);
const receivingPump=R.contributingCatchments(nativeContext,{kind:'node',id:'C'},[{id:'P',drainsTo:'Link',nodeId:'D',linkSuffix:'P'}]);
assert.match(receivingPump[0].reason,/pump or flow-control/);
assert.throws(()=>R.contributingCatchments(nativeContext,{kind:'node',id:'unknown'},catchments),/native assessment asset/);
const splitRun=[{id:'006',drainsTo:'Multiple links'},{id:'011',drainsTo:'Subcatchment',toCatchment:'006'}];
const lateralRows=[{id:'006',nodeId:'00127',linkSuffix:'1',weight:.25,line:2},
  {id:'006',nodeId:'B',linkSuffix:'3',weight:.75,line:3}];
const tracedSplit=R.contributingCatchments(nativeContext,{kind:'node',id:'B'},splitRun,lateralRows);
assert.deepEqual(tracedSplit.map(row=>row.status),['Ambiguous','Ambiguous']);
assert.deepEqual(tracedSplit[0].laterals.map(row=>[row.line,row.status,row.weight]),[[2,'Candidate',.25],[3,'Disconnected',.75]]);
assert.deepEqual(tracedSplit[1].laterals,tracedSplit[0].laterals,'Catchment transfers follow the terminal lateral destinations');
const incompleteSplit=R.contributingCatchments(nativeContext,{kind:'node',id:'B'},splitRun,[lateralRows[0]]);
assert.match(incompleteSplit[0].reason,/weights.*sum to 1/);
const repeatedSplit=R.contributingCatchments(nativeContext,{kind:'node',id:'B'},splitRun,[{...lateralRows[0],weight:.5},{...lateralRows[0],weight:.5,line:5}]);
assert.deepEqual(repeatedSplit[0].laterals.map(row=>row.status),['Ambiguous','Ambiguous']);
const controlledSplit=R.contributingCatchments(nativeContext,{kind:'node',id:'C'},splitRun,[{id:'006',nodeId:'D',linkSuffix:'P',weight:1,line:4}]);
assert.match(controlledSplit[0].laterals[0].reason,/control inlet/);
assert.throws(()=>R.contributingCatchments(nativeContext,{kind:'node',id:'B'},splitRun,[{...lateralRows[0],weight:1.1}]),/fraction between 0 and 1/);
const steps=R.longSection(network,[e1,e2,e3]);
assert.deepEqual(steps.map(({chainageStart,chainageEnd,us,ds,height})=>[chainageStart,chainageEnd,us,ds,height]),[
  [0,100,10,9.8,.6],[100,220,9.75,9.35,.6],[220,null,9.3,null,.6]]);
assert.deepEqual(steps[0].sources.map(({table,row})=>[table,row]),[['hw_conduit',12],['hw_node',3],['hw_node',4]]);
const revisedNetwork=C.importNativeContext([{name:'synthetic-revised-route.csv',text:nativeNetwork.replace(
  '00127,B,1,CIRC,100,600,600,10,9.8','00127,B,1,CIRC,125,750,750,9.9,9.65')}]).network;
const rebuilt=R.revisedLongSection(revisedNetwork,steps);
assert.deepEqual(rebuilt.issues,[]);
assert.deepEqual(rebuilt.steps.map(({chainageStart,chainageEnd,us,ds,height})=>[chainageStart,chainageEnd,us,ds,height]),[
  [0,125,9.9,9.65,.75],[125,245,9.75,9.35,.6],[245,null,9.3,null,.6]]);
assert.equal(rebuilt.steps[0].sources[0].file,'synthetic-revised-route.csv');
assert.equal(steps[0].chainageEnd,100);
const revisedGeometry={revision:'R2',datum:'AOD',sha256:'a'.repeat(64),steps:rebuilt.steps};
const portableReview={name:'Reviewed route',note:'Two geometries',start:'00127',end:'E',steps,
  trials:[],revisedGeometry};
assert.deepEqual(C.validateNetwork({...network,routeReviews:[portableReview]}).routeReviews[0].revisedGeometry,revisedGeometry);
assert.throws(()=>C.validateNetwork({...network,routeReviews:[{...portableReview,revisedGeometry:{...revisedGeometry,
  steps:[{...revisedGeometry.steps[0],to:'C'},...revisedGeometry.steps.slice(1)]}}]}),/Invalid saved routeReviews/);
assert.throws(()=>C.validateNetwork({...network,routeReviews:[{...portableReview,revisedGeometry:{...revisedGeometry,sha256:'unknown'}}]}),
  /Invalid saved routeReviews/);
const legacyControlReview={...portableReview,revisedGeometry:undefined,
  steps:controlledProfile.map(({controlLevels,roofFrom,roofTo,...step})=>step)};
assert.equal(C.validateNetwork({...controls,routeReviews:[legacyControlReview]}).routeReviews[0].steps[1].controlLevels,undefined);
const candidate=(change)=>({...revisedNetwork,edges:revisedNetwork.edges.flatMap(edge=>edge.id===e1.id?change(edge):[edge])});
for(const [change,reason] of [
  [()=>[],'missing-link'],[edge=>[{...edge,to:'C'}],'changed-endpoints'],[edge=>[{...edge,direction:'unknown'}],'unconfirmed-direction'],
]){
  const checked=R.revisedLongSection(candidate(change),steps);
  assert.deepEqual(checked.steps,[]);
  assert.equal(checked.issues[0].reason,reason);
  assert.equal(checked.issues[0].id,e1.id);
}
const paired=R.conduitEndProfile(steps[0],11.2,10.1);
assert.equal(paired.status,'surcharge');
assert.deepEqual(paired.waterTop,[10.6,10.1],'Water fill is clipped to the pipe soffit at each end');
assert(Math.abs(paired.cap.fraction-2/3)<1e-12&&Math.abs(paired.cap.level-10.466666666666667)<1e-12);
assert(Math.abs(paired.ends[0].aboveSoffit-.6)<1e-12);
assert(Math.abs(paired.ends[0].freeboard-(-.2))<1e-12);
assert.equal(paired.ends[1].aboveSoffit,0);
const free=R.conduitEndProfile(steps[0],10.2,10);
assert.equal(free.status,'wet');assert.deepEqual(free.waterTop,[10.2,10]);
assert.equal(R.conduitEndProfile(steps[0],10,10).status,'dry-or-transition');
assert.equal(R.conduitEndProfile(steps[0],10,null).waterTop,null);
assert.equal(R.conduitEndProfile({...steps[0],height:null},11.2,10).status,'geometry-unavailable');
assert.equal(R.conduitEndProfile({...steps[0],lengthStatus:'missing'},10.2,10).waterTop,null);
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
const layerColumns=[{...conduitResult,series:'level-us',quantity:'level',location:'upstream',unit:'m',datum:'AOD'},
  {...conduitResult,series:'level-ds',quantity:'level',location:'downstream',unit:'m',datum:'AOD'},
  {...conduitResult,series:'head-ds',quantity:'total-head',location:'downstream',unit:'m',datum:'AOD'},
  {...nodeResult,series:'level-other-datum',quantity:'level',location:'node',unit:'m',datum:'AD'}];
assert.equal(R.simulationLayers(layerColumns).size,4,'Endpoints, quantity, datum and asset type stay explicit');
assert.equal(R.simulationLayers([...layerColumns,layerColumns[0]]).values().next().value.length,2);
const baselineRun={scenario:'Baseline',event:'Storm E',temporalSupport:'instantaneous'};
const proposalRun={scenario:'Proposal',event:'Storm E',temporalSupport:'instantaneous',columns:[
  {...layerColumns[0],series:'proposed-level-us'},
  {...layerColumns[0],series:'proposed-other-datum',datum:'AD'},
  ...layerColumns.slice(1)]};
assert.deepEqual(R.compatibleSimulationColumns(baselineRun,layerColumns.slice(0,1),proposalRun).map(column=>column.series),['proposed-level-us']);
assert.deepEqual(R.compatibleSimulationColumns(baselineRun,layerColumns.slice(0,1),{...proposalRun,scenario:'Baseline'}),[]);
assert.deepEqual(R.compatibleSimulationColumns(baselineRun,layerColumns.slice(0,1),{...proposalRun,event:'Other storm'}),[]);
assert.deepEqual(R.compatibleSimulationColumns(baselineRun,layerColumns.slice(0,1),{...proposalRun,temporalSupport:'interval'}),[]);
assert.deepEqual(R.compareSimulationSamples([0,5,null,1,2,Number.MAX_VALUE],[0,-1,7,null,3,-Number.MAX_VALUE]),
  [0,-6,null,null,1,null]);
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
const overviewMs=Math.round(performance.now()-started);
const largeNative=C.importNativeContext(largeNativeNetwork(5001)).network;
assert.equal(largeNative.nodes.length,5001);
assert.equal(largeNative.edges.length,5000);
const largeRevision=C.applyContextRevision(C.empty(),largeNative,'icm-csv-v1');
const savedPositions=largeRevision.nodes.map(({id,x,y})=>({id,x,y}));
const savedGeometry=largeRevision.edges.map(({id,bends})=>({id,bends:bends||[]}));
const largeSave={...largeRevision,views:[{name:'Grid',camera:largeRevision.camera,positions:savedPositions,edges:savedGeometry}],
  reviewSnapshots:[{name:'Initial geometry',saved_at:'2026-11-22T12:00:00Z',network:largeRevision}]};
const largeRestored=C.validateNetwork(largeSave);
assert.equal(largeRestored.views[0].positions.length,5001);
assert.equal(largeRestored.reviewSnapshots[0].network.edges.length,5000);
assert.throws(()=>C.importNativeContext(largeNativeNetwork(6001)),/exceeds 6,000 points/);
const parallel='00001,00002,2,75,CIRC,450,450,28,27.85\n00002,00003,2,75,CIRC,450,450,28,27.85\n';
assert.throws(()=>C.importNativeContext(largeNativeNetwork(6000)+parallel),/exceeds 6,000 connectors/);
assert.throws(()=>C.validateNetwork({...largeRevision,contextFormat:undefined}),/2,000 points/);
console.log('Network review geometry, branching, cycle connectivity, monitor validation, migration and dense overview passed in '+overviewMs+' ms for the dense projection. Large native save and limit validated.');
