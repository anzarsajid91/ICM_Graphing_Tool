import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});vm.runInContext(fs.readFileSync('web/assets/network-schematic-core.js','utf8'),context);
const C=context.ICMNetworkCore;
assert.equal(C.mainYear('2023-12-01T00:00:00','2025-01-01T00:00:00'),2024);
assert.equal(C.mainYear('2022-01-01T00:00:00','2023-01-01T00:00:00'),2022);
assert.equal(C.rag(20,21),'green');assert.equal(C.rag(20,22),'amber');assert.equal(C.rag(20,23),'red');
assert.equal(C.rag(0,0),'green');assert.equal(C.rag(0,1),'red');assert.equal(C.rag(null,0),null);
const row={eligible:true,count_status:'definitive',analysis_start:'2024-01-01T00:00:00',analysis_end:'2025-01-01T00:00:00',valid_hours:8784,unknown_hours:0,excluded_hours:0,quantity:'depth',unit:'m',exclusions:[]};
assert.equal(C.comparable(row,row,true),'');assert.match(C.comparable(row,row,false),/Confirm/);
assert.match(C.comparable(row,{...row,analysis_start:'2024-04-01T00:00:00'},true),/periods/);
assert.match(C.comparable(row,{...row,count_status:'partial/unknown-gap'},true),/provisional/);
assert.equal(C.comparable(row,{...row,unit:'mm'},true),'');
assert.throws(()=>C.reportingConflicts([{role:'observed',years:[2024]},{role:'observed',years:[2024]}]),/Overlapping/);
C.reportingConflicts([{role:'observed',years:[2024]},{role:'model',scenario:'Baseline',years:[2024]},{role:'model',scenario:'Update',years:[2024]}]);
assert.throws(()=>C.validateYears('2024, nope'));
assert.deepEqual(Array.from(C.validateYears('2024,2022,2024')), [2022,2024]);
assert.throws(()=>C.validateNetwork({schema:1,nodes:[],edges:[{id:'e',from:'missing',to:'missing',colour:'red'}]}));
console.log('Network reporting, independent evidence groups, RAG and import contracts passed.');
const binding={role:'model',quantity:'flow',threshold:'',sourceName:'Baseline'};
assert.equal(C.thresholdRule(binding),'gt');
assert.equal(C.effectiveThreshold(binding,{model:0}).value,0);
assert.equal(C.effectiveThreshold({...binding,threshold:12},{model:0}).value,12);
assert.equal(C.effectiveThreshold({...binding,threshold:0},{model:12}).value,0);
assert.throws(()=>C.effectiveThreshold(binding,{model:''}),/finite threshold/);
assert.throws(()=>C.effectiveThreshold({...binding,threshold:undefined},{model:undefined}),/finite threshold/);
assert.equal(C.comparable({...row,comparison:'gt'},{...row,comparison:'ge'},true),'');
const obs={...row,role:'observed',year:2024},model={...row,role:'model',year:2024,scenario:'Baseline'};
assert.equal(C.evidenceRows([obs,model]).length,1);
assert.equal(C.evidenceRows([obs,model])[0].observed,obs);
assert.equal(C.evidenceRows([obs,{...model,analysis_start:'2024-04-01T00:00:00'}]).length,2);
assert.equal(C.evidenceRows([obs,model,{...model,scenario:'Update'}]).length,2);
assert.equal(C.evidenceRows([obs,model],2023).length,0);
const nodes=[{id:'a',type:'pump',x:100,y:300},{id:'b',type:'outfall',x:500,y:100},{id:'c',type:'cso',x:500,y:500}];
const edges=[{id:'ab',from:'a',to:'b'},{id:'ac',from:'a',to:'c'},{id:'cb',from:'c',to:'b'}];
const routes=edges.map(e=>C.connector(e,nodes,edges));
for(const r of routes){assert.ok(r);assert.match(r.path,/^M[-\d.]+ [-\d.]+L[-\d.]+ [-\d.]+$/);assert.equal(r.arrow.length,3);}
assert.notEqual(routes[0].start.y,routes[1].start.y,'Two outgoing connectors attach to distinct asset ports');
assert.equal(routes[0].start.x,138,'Wire starts on the asset box');
assert.equal(routes[0].end.x,462,'Wire ends on the asset box');
const collinear=[{id:'a',type:'pump',x:100,y:300},{id:'b',type:'outfall',x:500,y:300},{id:'c',type:'cso',x:700,y:300}];
assert.notEqual(C.connector(edges[0],collinear,edges).start.y,C.connector(edges[1],collinear,edges).start.y);
for(const type of Object.keys(C.types))assert.ok(C.bounds(type).x>0);
const manholeRoute=C.connector(edges[0],[{...nodes[0],type:'manhole'},nodes[1]],edges.slice(0,1));
assert.ok(Math.abs(Math.hypot(manholeRoute.start.x-100,manholeRoute.start.y-300)-8)<1e-8);
console.log('Straight boundary connectors, separate ports, comparison rows and explicit threshold rules passed.');
const overviewEdge={...edges[0],contextSource:true};
const overviewRoute=C.connector(overviewEdge,nodes,[overviewEdge],p=>({x:p.x*.005,y:p.y*.005}));
assert.ok(overviewRoute,'An imported topology link survives overlapping symbols at fit scale');
assert.equal(overviewRoute.points[0].x,.5);
assert.equal(overviewRoute.points.at(-1).x,2.5);
assert.equal(overviewRoute.arrow.length,0,'A short overview connector omits the direction marker');
const coincident=nodes.map(node=>({...node,x:0,y:0}));
assert.ok(C.connector(overviewEdge,coincident,[overviewEdge]),'Coincident imported endpoints retain their topology link');
const bent={...edges[0],bends:[{x:180,y:150},{x:400,y:150}]};
const bentRoute=C.connector(bent,nodes,[bent]);
assert.equal(bentRoute.points.length,4);
assert.equal(bentRoute.start.y,272,'First bend determines the asset departure face');
assert.equal(bentRoute.end.x,462,'Last bend determines the arrival face');
assert.ok(bentRoute.path.includes('L180 150L400 150'));
const zoomed=C.connector(bent,nodes,[bent],p=>({x:p.x*2+10,y:p.y*2-20}));
assert.equal(zoomed.points[1].x,370,'Bends use the same world transform as assets');
assert.ok(bentRoute.arrow.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
assert.ok(C.connector({...bent,bends:[bent.bends[0],bent.bends[0]]},nodes,[{...bent,bends:[bent.bends[0],bent.bends[0]]}]),'Repeated points remain renderable');
assert.equal(C.labelOffset(nodes[0]).y,-35,'Existing large asset labels keep their placement');
assert.equal(C.labelLeader(nodes[0]),null);
assert.ok(C.labelLeader({...nodes[0],nameOffset:{x:-100,y:-80}}));
assert.equal(C.labelOffset({...nodes[0],nameOffset:{x:-100,y:-80}}).x,-100);
const summary=C.summaryRows([{...obs,spill_count:20,duration_hours:100},{...model,spill_count:22,duration_hours:105},{...model,scenario:'Update',spill_count:21,duration_hours:120}],2024,'spill_count',true,true);
assert.equal(summary.items[0].label,'O');assert.equal(summary.items[0].value,20);
assert.equal(summary.items[1].label,'M (Baseline)');assert.equal(summary.items[1].rag,'amber');
assert.equal(summary.items[2].rag,'green');
assert.equal(C.summaryRows([{...obs,spill_count:20},{...model,spill_count:22}],2024,'spill_count',false,true).items[1].rag,null);
assert.equal(C.summaryRows([{...obs,spill_count:20},{...model,spill_count:22}],2024,'spill_count',true,false).items[1].value,null);
const latest=C.summaryRows([{...obs,year:2023,spill_count:10},{...model,year:2024,spill_count:22}],'all','spill_count',true,true);
assert.equal(latest.year,2024);assert.equal(latest.items[0].value,null,'Latest-year summary never borrows observed values from a different year');
assert.equal(latest.items[1].rag,null);
const validNode=n=>({...n,name:n.id,colour:'red',bindings:[],exclusions:[]});
const savedLayout={schema:1,nodes:nodes.map(validNode),edges:[{...bent,colour:'red'}]};
assert.equal(C.validateNetwork(savedLayout).edges[0].bends.length,2);
assert.throws(()=>C.validateNetwork({...savedLayout,edges:[{...bent,colour:'red',bends:[{x:NaN,y:0}]}]}),/bends/);
assert.throws(()=>C.validateNetwork({...savedLayout,nodes:[{...validNode(nodes[0]),nameOffset:{x:Infinity,y:0}},...nodes.slice(1).map(validNode)]}),/label placement/);
console.log('Manual bends, attached labels, saved geometry and same-year combined RAG summaries passed.');

// Spill outcome comparisons are independent of the threshold signal's units.
assert.equal(C.comparable(row,{...row,quantity:'flow',unit:'L/s',comparison:'gt'},true),'');
assert.match(C.comparable(row,{...row,unit:''},true),/Assign units/);
assert.equal(C.comparable(row,{...row,count_status:'partial/left-censored-context'},true,'duration_hours'),'');
assert.match(C.comparable(row,{...row,count_status:'partial/left-censored-context'},true),/provisional/);
const annual=C.summaryYears([{...obs,year:2023,spill_count:10},{...obs,spill_count:20},{...model,spill_count:22}], 'all','spill_count',true,true,['Baseline'],[2022,2023,2024]);
assert.deepEqual(Array.from(annual,s=>s.year),[2022,2023,2024]);
assert.equal(annual[0].items[0].value,null);assert.equal(annual[1].items[0].value,10);assert.equal(annual[1].items[1].rag,null);assert.equal(annual[2].items[1].rag,'amber');
assert.equal(C.valueScale('depth','m','mm'),1000);
assert.equal(C.valueScale('flow','m³/s','L/s'),1000);
assert.equal(C.valueScale('flow','m³/s','Ml/d'),86.4);
assert.equal(C.valueScale('depth','','mm'),1,'Unknown source units are assigned without rescaling');
assert.equal(C.valueScale('status','m','1'),1);
assert.throws(()=>C.valueScale('flow','m','L/s'),/matching quantity/);
assert.throws(()=>C.valueScale('depth','m',''),/supported unit/);
console.log('All assigned years, independent missing pairs, outcome RAG, duration eligibility and unit scaling passed.');

const contextCsv=[
  'HydraBench network context v1',
  'record,id,type,name,x_m,y_m,from,to',
  'node,A,manhole,"Upstream, ""North""",350000,425000,,',
  'node,B,outfall,Outlet,350125,425030,,',
  'link,A.1,,Conduit,,,A,B',
].join('\r\n');
const imported=C.importNetworkContext('\uFEFF'+contextCsv);
assert.equal(imported.nodes[0].name,'Upstream, "North"');
assert.equal(imported.nodes[1].y,-425030);
assert.equal(imported.edges[0].id,'A.1');
assert.equal(imported.edges[0].from,'A');
assert.equal(imported.edges[0].to,'B');
assert.throws(()=>C.importNetworkContext(contextCsv.replace(',,,A,B',',,,A,C')),/unknown node/);
assert.throws(()=>C.importNetworkContext(contextCsv.replace('node,B,','node,A,')),/duplicate/);
assert.throws(()=>C.importNetworkContext(contextCsv.replace('425000','0x10')),/coordinates/);
assert.throws(()=>C.importNetworkContext(contextCsv.replace('"Upstream, ""North"""','"Unclosed')),/malformed CSV fields/);
assert.throws(()=>C.importNetworkContext(contextCsv.replace('v1','v2')),/network context v1/);

const nativeCsv=[
  '**** hw_node','node_id,x,y,node_type,ground_level',
  'Up,350000,425000,Manhole,102','Out,350125,425030,Outfall,101',
  '**** hw_conduit','us_node_id,link_suffix,ds_node_id,shape,roughness_type,conduit_width,conduit_height,conduit_length,us_invert,ds_invert,bottom_roughness_CW,top_roughness_CW,sediment_depth,number_of_barrels,point_array',
  'UP,1,OUT,CIRC,CW,450,450,200,101,100,1.5,1.5,0,1,"{350000,425000,350030,425025,350125,425030}"',
  '**** hw_subcatchment','subcatchment_id','abc',
].join('\n');
const native=C.importNativeContext(nativeCsv);
assert.equal(native.network.edges[0].from,'Up');
assert.equal(native.network.edges[0].to,'Out');
assert.equal(native.network.edges[0].bends.length,1);
assert.equal(native.network.edges[0].bends[0].y,-425025);
assert.match(native.warnings.join(' '),/Skipped hw_subcatchment/);
const separateNodes='node_type,node_id,y,x,ground_level_flag,Object Type\n'+
  'Node type,Node ID,Y coordinate,X coordinate,Ground level flag,\n'+
  ',,m,m,,\nManhole,Up,425000,350000,,hw_node\nOutfall,Out,425030,350125,,hw_node';
const separateLinks='link_suffix,ds_node_id,us_node_id,conduit_length\n'+
  'Link suffix,DS node ID,US node ID,Length\n,,,m\n1,OUT,UP,200';
const split=C.importNativeContext([
  C.nativeContextText('export_conduit.csv',separateLinks),
  C.nativeContextText('export_node.csv',separateNodes),
  C.nativeContextText('export_weir.csv','ObjectTable,us_node_id,ds_node_id,link_suffix\nhw_weir,UP,OUT,W'),
].join('\n'));
assert.equal(split.network.nodes.length,2);
assert.equal(split.network.edges[0].from,'Up');
assert.equal(split.network.edges[0].to,'Out');
assert.match(split.warnings.join(' '),/description or unit rows were skipped/);
assert.equal(split.network.edges[1].icm.table,'hw_weir');
assert.throws(()=>C.importNativeContext(nativeCsv.replace('Up,350000','Up,invalid')),/invalid numeric field x/);
const withDefaultHeaders=nativeCsv.replace('node_id,x,y,node_type,ground_level',
  'ObjectTable,node_id,x,y,node_type,ground_level\nFieldDescription,Node ID,x,y,Node type,Ground level\nUserUnits,,m,m,,m AD')
  .replace('\nUp,','\nhw_node,Up,').replace('\nOut,','\nhw_node,Out,');
assert.equal(C.importNativeContext(withDefaultHeaders).network.nodes.length,2);
assert.throws(()=>C.importNativeContext(withDefaultHeaders.replace('UserUnits,,m,m','UserUnits,,ft,ft')),/unsupported declared units/);
const trial=C.conduitTrial(native.network.edges[0]);
assert.equal(trial.diameter,450);
assert.equal(trial.gradient,.005);
assert.equal(trial.roughness,1.5);
assert.equal(C.conduitTrial({...native.network.edges[0],icm:{...native.network.edges[0].icm,top_roughness_cw:3}}),null);
assert.throws(()=>C.importNativeContext(nativeCsv.replace('Out,350125','up,350125')),/duplicate node ID/);
assert.throws(()=>C.importNativeContext(nativeCsv.replace('UP,1,OUT','UP,1,Missing')),/unknown node/);
const first=C.applyContextRevision(C.empty(),native.network,'icm-csv-v1');
first.nodes[0].x+=20;first.nodes[0].nameOffset={x:12,y:0};
first.edges[0].bends=[{x:350015,y:-425010}];
const next=C.applyContextRevision(first,C.importNativeContext(nativeCsv.replace('Out,350125,425030','Out,350150,425030')).network,'icm-csv-v1');
assert.equal(next.nodes[0].x,350020);
assert.equal(next.nodes[1].x,350150);
assert.equal(next.edges[0].bends[0].x,350015);
assert.throws(()=>C.applyContextRevision(C.validateNetwork({...C.empty(),nodes:[first.nodes[0]]}),native.network,'icm-csv-v1'),/empty schematic/);
