import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile('web/assets/fastpath-core.js','utf8');
const sandbox={self:{},console,Date,Math,Number,String,Array,Object,RegExp,JSON,Set,Map,TextDecoder,TextEncoder};
sandbox.globalThis=sandbox.self;
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'fastpath-core.js'});
const core=sandbox.self.ICMFastPathCore;
assert.ok(core);

const fm01Text=await fs.readFile('reference/current-tool/sample-data/fdv/FM01.fdv','utf8');
const fm01=core.parseText('FM01.fdv',fm01Text,{maxPoints:15000});
assert.equal(fm01.eligible,true);
assert.equal(fm01.rows,20161);
assert.equal(fm01.monitor,'FM01');
assert.deepEqual(Array.from(fm01.columns),['flow','depth','velocity']);
const byColumn=Object.fromEntries(fm01.series.map(x=>[x.column,x]));
assert.ok(Math.abs(byColumn.flow.statistics.minimum-.039)<1e-12);
assert.ok(Math.abs(byColumn.flow.statistics.maximum-.769)<1e-12);
assert.ok(Math.abs(byColumn.flow.statistics.mean-.1289310550071921)<1e-10);
assert.ok(Math.abs(byColumn.depth.statistics.mean-.1882285104905501)<1e-10);
assert.ok(Math.abs(byColumn.velocity.statistics.mean-.8804642626853827)<1e-10);
assert.ok(byColumn.flow.display_count<=15000);
assert.equal(byColumn.flow.source_count,20161);

const edmText=await fs.readFile('reference/current-tool/sample-data/other/StationA_EDM.csv','utf8');
const edm=core.parseText('StationA_EDM.csv',edmText,{maxPoints:15000});
assert.equal(edm.eligible,true);
assert.equal(edm.rows,105216);
assert.ok(edm.series.length>=1);
assert.ok(edm.series.every(x=>x.display_count<=15000));

const rainText=await fs.readFile('reference/current-tool/sample-data/other/StationA_Rainfall.csv','utf8');
const rain=core.parseText('StationA_Rainfall.csv',rainText,{maxPoints:15000});
assert.equal(rain.eligible,true);
assert.equal(rain.rows,349387);
const rainSeries=rain.series.find(x=>x.column==='1')||rain.series[0];
assert.equal(rainSeries.quantity,'rainfall');
assert.equal(rainSeries.unit_status,'unresolved');
assert.equal(rainSeries.canonical_unit,null);
assert.ok(rainSeries.display_count<=15000);

console.log(JSON.stringify({
  fm01:{bytes:Buffer.byteLength(fm01Text),rows:fm01.rows,series:fm01.series.map(x=>({column:x.column,display_count:x.display_count}))},
  stationAEdm:{bytes:Buffer.byteLength(edmText),rows:edm.rows,columns:edm.columns.length},
  stationARain:{bytes:Buffer.byteLength(rainText),rows:rain.rows,columns:rain.columns.length}
}));
