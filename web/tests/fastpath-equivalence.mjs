import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const source=await fs.readFile('web/assets/fastpath-core.js','utf8');
const sandbox={self:{},console,Date,Math,Number,String,Array,Object,RegExp,JSON,Set,Map,TextDecoder,TextEncoder};
sandbox.globalThis=sandbox.self;
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'fastpath-core.js'});
const core=sandbox.self.ICMFastPathCore;
assert.ok(core);

const authoritative=JSON.parse(execFileSync('python',['scripts/fastpath_authoritative_contract.py'],{encoding:'utf8',maxBuffer:32*1024*1024}));
const paths={
  'FM01.fdv':'reference/current-tool/sample-data/fdv/FM01.fdv',
  'StationA_EDM.csv':'reference/current-tool/sample-data/other/StationA_EDM.csv',
  'StationA_Rainfall.csv':'reference/current-tool/sample-data/other/StationA_Rainfall.csv',
};
const clock=v=>String(v||'').replace(' ','T').slice(0,19);
const near=(a,b,tol=1e-10)=>a==null&&b==null||Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=tol*Math.max(1,Math.abs(Number(b)));

for(const [name,filePath] of Object.entries(paths)){
  const text=await fs.readFile(filePath,'utf8');
  const preview=core.parseText(name,text,{maxPoints:15000});
  const truth=authoritative[name];
  assert.equal(preview.eligible,true,name+' should be FastPath eligible');
  assert.equal(preview.format,truth.format,name+' format');
  assert.equal(preview.rows,truth.rows,name+' rows');
  assert.equal(clock(preview.start),clock(truth.start),name+' start');
  assert.equal(clock(preview.end),clock(truth.end),name+' end');
  assert.deepEqual(Array.from(preview.columns),truth.columns,name+' columns');
  const duplicates=Number(truth.audit?.duplicate_timestamps||0);
  for(const s of preview.series){
    const t=truth.series[s.column];
    assert.ok(t,name+' authoritative series missing '+s.column);
    assert.equal(s.quantity||null,t.quantity||null,name+' quantity '+s.column);
    assert.equal(s.canonical_unit||null,t.unit||null,name+' unit '+s.column);
    if(duplicates===0){
      assert.ok(near(s.statistics.minimum,t.minimum),name+' minimum '+s.column);
      assert.ok(near(s.statistics.mean,t.mean,1e-9),name+' mean '+s.column);
      assert.ok(near(s.statistics.maximum,t.maximum),name+' maximum '+s.column);
      assert.equal(s.statistics.valid_count,t.valid_count,name+' valid count '+s.column);
      assert.equal(s.statistics.missing_count,t.missing_count,name+' missing count '+s.column);
    }
  }
}
console.log('FastPath/Python reference equivalence passed for FM01 and Station A CSVs.');
