import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const sandbox={window:{addEventListener(){}},document:{readyState:'loading',addEventListener(){}},TextDecoder,console};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('web/assets/detriment-workspace.js','utf8'),sandbox);
const api=sandbox.window.ICMDetriment;
assert.equal(api.escape('<001>'),'&lt;001&gt;');
assert.equal(api.detectReport('Worst case\nNode ID\tFlood volume (m³)\n001\t8'),'auto');
assert.equal(api.detectReport('Time,Node ID,Flow (L/s)\n2025-01-01,001,3'),null);
assert.equal(api.detectReport('Seconds,Level\n0,1'),null);
for(const name of ['Worst_Case_Level_Sample.csv','Worst_Case_Volume_Sample.csv','Statistical_Template_spills_Sample.csv']){
  assert.equal(api.detectReport(fs.readFileSync('reference/current-tool/sample-data/other/'+name,'utf8')),'auto',name+' uses report path');
}
assert.equal(api.detectReport('Time (UTC),Node ID,Level (m)\n2025-01-01,001,1'),null);
assert.equal(api.csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
assert.equal(api.csvCell(-.30000000000000004),'"-0.30000000000000004"');
assert.equal(api.csvCell('001'),'"001"');
const r={kind:'flooding',rows:[{asset_id:'001',status:'detriment',a:2,b:8,delta:6,flags:['flood_detriment'],unit:'m³'}],criteria:{threshold:5},scenario_a:{name:'Existing',sha256:'abc'},scenario_b:{name:'Proposed',sha256:'xyz'},method:'unrounded'};
assert.match(api.csv(r,r.rows),/threshold/);
assert.match(api.csv(r,r.rows),/"abc"/);
assert.equal(api.filterRows(r.rows,'detriment','001').length,1);
assert.equal(api.filterRows(r.rows,'unresolved','').length,0);
assert.equal(api.isReport({status:'ready',parsed:{metadata:{source_kind:'detriment_report'}}}),true);
assert.equal(api.isReport({status:'ready',parsed:{format:'csv'}}),false);
console.log('Detriment browser units passed.');
// Existing hydraulic QA must ignore report tables even in a mixed source pool.
const elements={gapInput:{value:'900'},healthBody:{innerHTML:''}};
const runtime={window:{},console,document:{getElementById:id=>elements[id]||null,querySelector:()=>null},setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),crypto:globalThis.crypto,localStorage:{getItem:()=>null},Worker:class{}};
vm.createContext(runtime);
vm.runInContext(fs.readFileSync('web/assets/runtime.release.js','utf8').replace(/start\(\);\s*$/,''),runtime);
vm.runInContext(`state.files.set('report',{id:'report',status:'ready',displayName:'flood.csv',virtualPath:'/report',parsed:{metadata:{source_kind:'detriment_report'},columns:['Flood volume']}});state.files.set('series',{id:'series',status:'ready',displayName:'series.csv',virtualPath:'/series',parsed:{columns:['Flow (L/s)']}});engine.call=async(name,args)=>({weekly:[{channel:args.path,rag:'Green'}]});`,runtime);
assert.equal(vm.runInContext('allSeries().length',runtime),1);
assert.equal(vm.runInContext("hydraulicSeriesForItem(state.files.get('report')).length",runtime),0);
await vm.runInContext('runHealth()',runtime);
assert.equal(vm.runInContext('state.healthResult.rows.length',runtime),1,'Health excludes non-timeseries reports');
console.log('Mixed-source hydraulic isolation passed.');
const provenance={...r,scenario_a:{...r.scenario_a,datum:'AOD',unit:'mm'},ground_source:{sha256:'groundhash',mapping:{asset_id:'ID',ground:'GL'},unit:'m',datum:'AOD'},detail_source_b:{sha256:'detailhash',duration_unit:'min',mapping:{start:'Start'}}};
const exported=api.csv(provenance,provenance.rows);
assert.match(exported,/scenario_a_configuration/);
assert.match(exported,/AOD/);assert.match(exported,/groundhash/);assert.match(exported,/detailhash/);
assert.equal(typeof api.sectionData,'function','Paired level and ground/freeboard section data');
assert.equal(typeof api.timelineData,'function','Selected-CSO event timeline');
assert.equal(api.filterRows([{asset_id:'001',status:'risk',flags:['new_flooding']}],'new_flooding','').length,1);
assert.equal(api.filterRows([{asset_id:'001',status:'detriment',flags:['new_freeboard_breach']}],'new_freeboard_breach','').length,1);
const section=api.sectionData({ground_a:100,ground_b:100,a:99.35,b:99.65},.5);
assert.equal(section.minimum_a,99.5);assert.equal(section.minimum_b,99.5);
const timeline=api.timelineData([{start:'2025-01-01 00:00',end:'2025-01-01 01:00',duration_hours:1}]);
assert.equal(timeline[0].start,'2025-01-01 00:00');assert.equal(timeline[0].end,'2025-01-01 01:00');
assert.equal(api.pairedData([{asset_id:'001',a:2,b:8}])[1].y[0],8);
assert.equal(api.relinkSource({sha256:'a',name:'old.csv'},[{id:'new',hash:'a',displayName:'renamed.csv'}]).id,'new');
assert.equal(api.relinkSource({sha256:'a',name:'old.csv'},[{id:'one',hash:'a',displayName:'other.csv'},{id:'two',hash:'a',displayName:'old.csv'}]).id,'two');
assert.equal(api.relinkSource({sha256:'a',name:'old.csv'},[{id:'one',hash:'a',displayName:'other.csv'},{id:'two',hash:'a',displayName:'also.csv'}]),null);
console.log('Review regressions passed: provenance, named flags, paired comparisons, freeboard section, event timeline and fingerprint relinking.');
assert.equal(api.reportOnlyWorkspace({mapping:{observed:null,models:[],rain:null},detriment:{flooding:{a:{reference:{sha256:'a'}}}}}),true);
assert.equal(api.reportOnlyWorkspace({mapping:{observed:{sha256:'hyd'},models:[],rain:null},detriment:{flooding:{a:{reference:{sha256:'a'}}}}}),false);
assert.equal(api.reportOnlyWorkspace({mapping:{models:[]}}),false);
for(const header of ['Time (s),Node ID,Level (m)','Node ID,Level (m),Date/Time','P_DATETIME,Node ID,Level (m)'])assert.equal(api.detectReport(header+'\n2025-01-01,001,2'),null,'Native timestamp headings retain the existing parser');
assert.equal(api.reportKind({name:'survey.fdv'},new TextEncoder().encode('Node ID,Level\n001,2').buffer),null);

// Clipboard formats, exact identifier matching and view summaries.
const ids=(text,column='auto',known=[])=>JSON.parse(JSON.stringify(api.parseIdList(text,column,known)));
for(const text of ['001\nMH-12\nMH-12.1','001,MH-12,MH-12.1','001;MH-12;MH-12.1','001\tMH-12\tMH-12.1','001 MH-12 MH-12.1'])assert.deepEqual(ids(text).ids,['001','MH-12','MH-12.1']);
assert.deepEqual(ids('\uFEFFNode ID\r\n001\r\n002\r\n001').ids,['001','002']);
assert.equal(ids('001,001,002').duplicates,1);
assert.deepEqual(ids('"MH 01", "MH,02", "MH;03", "MH\"\"04"').ids,['MH 01','MH,02','MH;03','MH"04']);
assert.deepEqual(ids('MH 01\nMH 02').ids,['MH 01','MH 02']);
assert.deepEqual(ids('MH 01\n').ids,['MH 01']);
assert.deepEqual(ids('ID').ids,['ID']);
assert.deepEqual(ids('MH 01','auto',['MH 01']).ids,['MH 01']);
assert.deepEqual(ids('"MH 01" "MH 02"').ids,['MH 01','MH 02']);
assert.ok(ids('"unfinished').error);
assert.deepEqual(ids('Node ID\tX\tY\n001\t123\t456\nMH-12\t789\t123').ids,['001','MH-12']);
assert.deepEqual(ids('Node ID,X,Y\n001,123,456\n002,789,123').ids,['001','002']);
assert.deepEqual(ids('Node ID;X;Y\n001;123;456\n002;789;123').ids,['001','002']);
assert.ok(ids('Node ID\tLink ID\n001\t001.1').error);
assert.deepEqual(ids('Node ID\tLink ID\n001\t001.1','1').ids,['001.1']);
assert.ok(ids('001\t123\n002\t456').error);
assert.deepEqual(ids('001\t123\n002\t456','0').ids,['001','002']);
assert.deepEqual(ids('001\t123\n002\t456','list').ids,['001','123','002','456']);
assert.ok(ids('Node ID\tX\n001\t2\n002','1').error);
assert.deepEqual(ids('').ids,[]);
assert.deepEqual(ids('001002').ids,['001002'],'An undelimited string stays a single ID');
assert.deepEqual(ids('ID\n001\nID','auto',['ID']).ids,['001','ID'],'Header is removed only as a heading; a later ID remains');
const population=[
 {asset_id:'001',matched:true,status:'detriment',delta:6,flags:[]},
 {asset_id:'001.1',matched:true,status:'unchanged',delta:0,flags:[]},
 {asset_id:'A-only',matched:false,status:'unmatched',delta:null,flags:['missing_scenario_b']},
 {asset_id:'MH 02',matched:true,status:'risk',delta:.1,flags:['freeboard_unavailable']}
];
const selectedRows=JSON.parse(JSON.stringify(api.selectIdRows(population,['A-only','001','ABSENT','001.1'])));
assert.deepEqual(selectedRows.map(r=>r.asset_id),['A-only','001','001.1']);
assert.equal(selectedRows[0].status,'unmatched');assert.equal(selectedRows[0].delta,null);
assert.deepEqual(JSON.parse(JSON.stringify(api.idMatchSummary(population,['001','ABSENT']))),{requested:2,found:1,absent:['ABSENT']});
assert.equal(api.selectIdRows(population,['00']).length,0,'No prefix matching or fallback to all rows');
assert.equal(api.selectIdRows(population,['mh 02']).length,0,'Matching is case-sensitive');
assert.equal(api.selectIdRows(population,[]).length,4,'Blank selection restores the full population');
assert.deepEqual(JSON.parse(JSON.stringify(api.summariseRows(selectedRows))),{assets:3,matched:2,detriment:1,risk:0,improved:0,unresolved:1,max_increase:6});
assert.equal(api.summariseRows([]).max_increase,null,'No evidence does not produce a numeric maximum');
assert.equal(api.summariseRows([population[3]]).unresolved,1);
assert.equal(population.length,4,'Scoping does not mutate the authoritative population');
assert.match(api.csv({...r,asset_selection:{ids:['001','ABSENT'],absent:['ABSENT'],column:'0',duplicates_removed:1}},r.rows),/asset_selection_absent_ids/);
console.log('ID selection units passed: clipboard lists/grids, quotes, ambiguity, leading zeros, exact matches, missing scenarios, empty views and scoped summaries.');
assert.deepEqual(ids('Node ID,X\n"MH;1",123').ids,['MH;1'],'Quoted semicolon does not change CSV grid delimiter');
assert.deepEqual(ids('Node ID,X\n"MH\t1",123').ids,['MH\t1'],'Quoted tab does not change CSV grid delimiter');
assert.deepEqual(ids('Node ID;X\n"MH,1";123').ids,['MH,1']);
assert.deepEqual(ids('Node ID\n001,002\n003;004').ids,['001','002','003','004'],'A one-column heading can precede mixed-separator list rows');
