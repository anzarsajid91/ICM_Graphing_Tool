/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
import assert from 'node:assert/strict';
import '../assets/assessment-revision-core.js';

const {readSnapshot, compareSnapshots}=globalThis.HydraAssessmentRevision;
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
console.log('Assessment revision comparisons passed: method and unit compatibility, changed inputs and decisions, missing evidence and bounded validation.');
