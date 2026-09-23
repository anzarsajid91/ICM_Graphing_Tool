import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function loadCore(){
  const source=await fs.readFile('web/assets/fastpath-core.js','utf8');
  const sandbox={self:{},console,Date,Math,Number,String,Array,Object,RegExp,JSON,Set,Map,TextDecoder,TextEncoder};
  sandbox.globalThis=sandbox.self;
  vm.createContext(sandbox);
  vm.runInContext(source,sandbox,{filename:'fastpath-core.js'});
  assert.ok(sandbox.self.ICMFastPathCore,'FastPath core was not exported');
  return sandbox.self.ICMFastPathCore;
}
const core=await loadCore();

const fdv=`**DATA_FORMAT: 1,ASCII
**IDENTIFIER: 1,FMX
**FIELD: 3,FLOW,DEPTH,VELOCITY
**UNITS: 3,L/S,MM,M/S
**CONSTANTS: 2,START,INTERVAL
*CSTART
2602010000 1
*CEND
100 200 0.5
200 300 0.6
9999 400 0.7
`;
const parsed=core.parseText('FMX.fdv',fdv,{maxPoints:100});
assert.equal(parsed.eligible,true);
assert.equal(parsed.format,'fdv_ascii');
assert.equal(parsed.monitor,'FMX');
assert.equal(parsed.rows,3);
assert.deepEqual(Array.from(parsed.columns),['flow','depth','velocity']);
assert.equal(parsed.start,'2026-02-01T00:00:00');
assert.equal(parsed.end,'2026-02-01T00:02:00');
const flow=parsed.series.find(x=>x.column==='flow');
const depth=parsed.series.find(x=>x.column==='depth');
assert.equal(flow.canonical_unit,'m³/s');
assert.equal(depth.canonical_unit,'m');
assert.deepEqual(Array.from(flow.values),[0.1,0.2,null]);
assert.ok(Math.abs(flow.statistics.mean-0.15)<1e-12);
assert.equal(flow.statistics.missing_count,1);

const badUnit=core.parseText('bad.fdv',fdv.replace('L/S,MM,M/S','CFS,MM,M/S'));
assert.equal(badUnit.eligible,false);
assert.match(String(badUnit.error||''),/unit/i);

const truncated=core.parseText('truncated.fdv',fdv.replace('200 300 0.6\n','200 300\n'));
assert.equal(truncated.eligible,false);
assert.match(String(truncated.error||''),/field-count|truncated/i);

const incompleteHeader=core.parseText('incomplete.fdv',fdv.replace('*CEND\n',''));
assert.equal(incompleteHeader.eligible,false);
assert.match(String(incompleteHeader.error||''),/incomplete/i);

const iso=core.parseText('observed.csv','timestamp,Flow (L/s),Depth (mm)\n2026-02-01T00:00:00,100,200\n2026-02-01T00:01:00,200,300\n');
assert.equal(iso.eligible,true);
assert.equal(iso.format,'tabular_csv');
assert.equal(iso.rows,2);
assert.equal(iso.series[0].quantity,'flow');
assert.equal(iso.series[0].canonical_unit,'m³/s');
assert.deepEqual(Array.from(iso.series[0].values),[0.1,0.2]);
assert.equal(iso.series[1].canonical_unit,'m');

const level=core.parseText('level.csv','timestamp,level\n2026-02-01T00:00:00,0.2\n2026-02-01T00:01:00,0.3\n');
assert.equal(level.series[0].quantity,'level');
assert.notEqual(level.series[0].quantity,'velocity');
const waterLevel=core.parseText('stage.csv','timestamp,Water Level (m)\n2026-02-01T00:00:00,0.2\n2026-02-01T00:01:00,0.3\n');
assert.equal(waterLevel.series[0].quantity,'level');
assert.equal(waterLevel.series[0].canonical_unit,'m');

const uk=core.parseText('depth.csv','timestamp,Depth (m)\n01/02/2026 00:00:00,0.2\n01/02/2026 00:01:00,0.3\n');
assert.equal(uk.start,'2026-02-01T00:00:00');
assert.equal(uk.end,'2026-02-01T00:01:00');

const quoted=core.parseText('quoted.csv','"timestamp","Flow (L/s)"\n"2026-02-01 00:00:00","100"\n"2026-02-01 00:01:00","200"\n');
assert.equal(quoted.eligible,true);
assert.equal(quoted.series[0].canonical_unit,'m³/s');

const unresolved=core.parseText('mystery.csv','timestamp,Reading\n2026-02-01T00:00:00,1\n2026-02-01T00:01:00,2\n');
assert.equal(unresolved.eligible,true);
assert.equal(unresolved.series[0].unit_status,'unresolved');
assert.equal(unresolved.series[0].canonical_unit,null);

const duplicates=core.parseText('depth.csv','timestamp,Depth (m)\n2026-02-01T00:00:00,0.2\n2026-02-01T00:00:00,0.3\n');
assert.equal(duplicates.audit.duplicate_timestamps,1);

const sentinel=core.parseText('flow.csv','timestamp,Flow (L/s)\n2026-02-01T00:00:00,9999\n2026-02-01T00:01:00,100\n');
assert.equal(sentinel.series[0].statistics.missing_count,1);
assert.equal(sentinel.series[0].values[0],null);

const malformed=core.parseText('flow.csv','timestamp,Flow (L/s)\nnot-a-date,100\n2026-02-01T00:01:00,100\n');
assert.equal(malformed.audit.invalid_timestamps,1);
assert.equal(malformed.rows,1);

const hyd=core.parseText('model.csv','TYPE=HYD\nU_FLOW\nP_DATETIME,value\n01/02/2026 00:00:00,0.1\n01/02/2026 00:01:00,0.2\n');
assert.equal(hyd.eligible,true);
assert.equal(hyd.format,'icm_hyd_p_datetime_csv');
assert.equal(hyd.series[0].quantity,'flow');
assert.equal(hyd.series[0].canonical_unit,'m³/s');

const noTime=core.parseText('invalid.csv','x,value\n1,2\n2,3\n');
assert.equal(noTime.eligible,false);
assert.match(String(noTime.error||''),/timestamp/i);

console.log('FastPath unit contract passed.');
