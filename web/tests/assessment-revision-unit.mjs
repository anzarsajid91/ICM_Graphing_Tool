/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
import assert from 'node:assert/strict';
import '../assets/assessment-revision-core.js';

const {readSnapshot,compareSnapshots,detrimentAssessmentRecord,storageAssessmentRecords,verificationMatrixRecords}=globalThis.HydraAssessmentRevision;
const field=(key,value,unit)=>({key,label:key,value,unit});
const baseline={schema_version:1,name:'Baseline',build:'1'.repeat(40),records:[{
  id:'hydraulic:pipe:S1',workspace:'Hydraulic calculations',title:'Pipe S1',method:'method-v1',
  basis:[field('Quantity','Flow'),field('Numerical basis','uniform-flow')],
  inputs:[field('Diameter',.3,'m')],results:[field('Capacity',.2,'m³/s'),field('Unknown',null,'m')],
  review:[field('Decision','Review')],actions:[field('Next action','Check roughness')]
}]};
const current=structuredClone(baseline);
current.name='Proposal';current.build='2'.repeat(40);
const pipe=current.records[0];
pipe.basis.reverse();pipe.inputs[0].value=.4;pipe.results[0].value=.3;
pipe.review[0].value='Review recorded';pipe.actions=[];
const compare=(a,b)=>compareSnapshots(readSnapshot(JSON.stringify(a)),readSnapshot(JSON.stringify(b)));
const comparison=compare(baseline,current);
const find=(rows,key)=>rows.find(row=>row.field===key);
assert.equal(find(comparison,'Diameter').status,'Changed');
assert.equal(find(comparison,'Capacity').status,'Changed');
assert.equal(find(comparison,'Decision').status,'Changed');
assert.equal(find(comparison,'Next action').status,'Removed');
assert.equal(find(comparison,'Unknown').status,'Not comparable');
pipe.method='method-v2';
const changedMethod=compare(baseline,current);
assert.equal(find(changedMethod,'Capacity').status,'Not comparable');
assert.match(find(changedMethod,'Capacity').note,/method/i);
assert.equal(find(changedMethod,'Diameter').status,'Changed');
pipe.method='method-v1';pipe.results[0].unit='L/s';
assert.match(find(compare(baseline,current),'Capacity').note,/unit/i);
pipe.results[0].unit='m³/s';pipe.basis[0].value='different-support';
assert.match(find(compare(baseline,current),'Capacity').note,/basis/i);
assert.equal(compare(baseline,{...current,records:[]}).filter(row=>row.group==='Evidence')[0].status,'Removed');
assert.throws(()=>readSnapshot(JSON.stringify({...baseline,records:[pipe,pipe]})),/duplicate evidence/i);
assert.throws(()=>readSnapshot(JSON.stringify({...baseline,records:[{...pipe,results:[field('Bad',[]) ]}]})),/invalid value/i);
assert.throws(()=>readSnapshot('{"schema_version":3}'),/snapshot schema/i);
const cells={...baseline,records:[{...baseline.records[0],id:'__proto__',review:[field('__proto__','Safe text')]}]};
assert.equal(find(compare(cells,cells),'__proto__').status,'Unchanged');

const criterion={kind:'level',method:'test criterion version',criteria:{threshold:.1,freeboard_required:.5},
  scenario_a:{name:'baseline.csv',sha256:'a'.repeat(64),scope:'Matched summer storms',datum:'AOD'},
  scenario_b:{name:'proposal.csv',sha256:'b'.repeat(64),scope:'Matched summer storms',datum:'AOD'}};
const flood={asset_id:'001',a:10.25,b:10.7,delta:.45,unit:'m',status:'detriment',freeboard_a:.75,freeboard_b:.30,
  freeboard_change:-.45,flags:['new_freeboard_breach'],evidence_a:{'Water level (m)':'10.25'},evidence_b:{'Water level (m)':'10.7'}};
const capture=(example,values,assetKind='node')=>({...baseline,records:[detrimentAssessmentRecord(example,values,{assetKind,proposal:'Design'})]});
const assessed=capture(criterion,flood);
const improved=capture(criterion,{...flood,b:10.4,delta:.15,freeboard_b:.6,freeboard_change:-.15,flags:['level_detriment']});
assert.equal(find(compare(assessed,improved),'Freeboard B').status,'Changed');
assert.equal(find(compare(assessed,improved),'Freeboard B').current,'0.6 m');
const scopeChanged=structuredClone(criterion);
scopeChanged.scenario_b.scope='Different events';
assert.match(find(compare(assessed,capture(scopeChanged,flood)),'Maximum level B').note,/basis changed/);
const unspecified=structuredClone(criterion);
unspecified.scenario_a.scope=unspecified.scenario_b.scope='';
assert.match(find(compare(capture(unspecified,flood),capture(unspecified,flood)),'Maximum level B').note,/scope or dated period/);
const renamed=structuredClone(criterion);
renamed.scenario_a.name='same-source-new-filename.csv';
assert.equal(find(compare(assessed,capture(renamed,flood)),'Maximum level B').status,'Unchanged');
assert.deepEqual(compare(assessed,capture(criterion,flood,'link')).map(row=>row.status),['Removed','Added']);

const storage={method:'whole episode test',physical:{analysis_start:'2026-01-01',analysis_end:'2026-01-02',valid_seconds:86400},
  calculation_status:'complete',threshold_canonical_m:1,screening:[{year:2026,required_storage_m3:24,coverage_fraction:1,status:'complete'}],
  calendar_volumes:[{year:2026,volume_m3:24,requested_seconds:240,valid_seconds:240,status:'complete'}]};
const storageCapture=(value,settings)=>({...baseline,records:storageAssessmentRecords(value,settings,[])});
const firstStorage=storageCapture(storage,{target_count:0});
const shortSupport=storageCapture({...storage,calendar_volumes:[{year:2026,volume_m3:null,volume_m3_partial:12,
  requested_seconds:240,valid_seconds:120,status:'partial'}]},{target_count:0});
assert.equal(find(compare(firstStorage,shortSupport),'Required storage').status,'Unchanged');
assert.equal(find(compare(firstStorage,shortSupport),'Physical discharge').status,'Not comparable');
assert.equal(find(compare(firstStorage,storageCapture(storage,{target_count:1})),'Required storage').status,'Not comparable');

const verificationRow={start:'2025-01-01T10:00:00',end:'2025-01-01T10:10:00',observed_name:'Observed 001',
  observed_sha256:'c'.repeat(64),observed_column:'Flow',model_sha256:'d'.repeat(64),model_column:'Modelled Q',model_name:'Proposed ICM run',
  rainfall_provenance:'a'.repeat(64),checks:{peak:{unit:'%',status:'Meets',value:10}},complete_support:true,
  evidence:{status:'complete',requested_seconds:600,common_support_seconds:600,excluded_seconds:0,unit:'m³/s',observed_peak:1,modelled_peak:1.1}};
const matrix=(rows,criteria={peak:10})=>({...baseline,records:verificationMatrixRecords({method:'project-event-screens-v1',quantity:'flow',
  rainfall_basis:'survey',maximum_gap_seconds:120,model_offset_minutes:5,criteria,rows})});
const firstMatrix=matrix([verificationRow]);
const newModel={...verificationRow,model_sha256:'e'.repeat(64),checks:{peak:{unit:'%',status:'Meets',value:-5}}};
assert.equal(find(compare(firstMatrix,matrix([newModel])),'Peak error').status,'Changed');
assert.equal(find(compare(firstMatrix,matrix([newModel],{peak:8})),'Peak error').status,'Not comparable');
assert.match(find(compare(firstMatrix,matrix([{...newModel,complete_support:false}])),'Peak error').note,/full event window/);
const competing=matrix([verificationRow,newModel]);
assert.notEqual(competing.records[0].id,competing.records[1].id);
assert.match(find(compare(competing,competing),'Peak error').note,/More than one scenario/);
console.log('Assessment revision comparisons passed: method and unit compatibility, changed inputs and decisions, missing evidence and bounded validation.');
