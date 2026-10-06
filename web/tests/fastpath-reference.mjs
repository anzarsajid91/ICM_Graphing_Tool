import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const manifest=JSON.parse(await fs.readFile('reference/current-tool/synthetic-manifest.json','utf8'));
const source=await fs.readFile('web/assets/fastpath-core.js','utf8');
const sandbox={self:{},console,Date,Math,Number,String,Array,Object,RegExp,JSON,Set,Map,TextDecoder,TextEncoder};
sandbox.globalThis=sandbox.self;
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'fastpath-core.js'});
const core=sandbox.self.ICMFastPathCore;
assert.ok(core);

const fm01Text=await fs.readFile('reference/current-tool/sample-data/fdv/FM7413.fdv','utf8');
const fm01=core.parseText('FM7413.fdv',fm01Text,{maxPoints:15000});
assert.equal(fm01.eligible,true);
assert.equal(fm01.rows,manifest.survey_rows);
assert.equal(fm01.monitor,'FM7413');
assert.deepEqual(Array.from(fm01.columns),['flow','depth','velocity']);
const byColumn=Object.fromEntries(fm01.series.map(x=>[x.column,x]));
for(const [col,expected] of Object.entries(manifest.fdv_statistics[manifest.monitors[0]])){
  for(const key of ['minimum','maximum','mean']) assert.ok(Math.abs(byColumn[col].statistics[key]-expected[key])<1e-10);
}
assert.ok(byColumn.flow.display_count<=15000);
assert.equal(byColumn.flow.source_count,manifest.survey_rows);

const edmText=await fs.readFile('reference/current-tool/sample-data/other/CS2666_EDM.csv','utf8');
const edm=core.parseText('CS2666_EDM.csv',edmText,{maxPoints:15000});
assert.equal(edm.eligible,true);
assert.equal(edm.rows,manifest.edm_rows);
assert.ok(edm.series.length>=1);
assert.ok(edm.series.every(x=>x.display_count<=15000));

const rainText=await fs.readFile('reference/current-tool/sample-data/other/CS2666_Rainfall.csv','utf8');
const rain=core.parseText('CS2666_Rainfall.csv',rainText,{maxPoints:15000});
assert.equal(rain.eligible,true);
assert.equal(rain.rows,manifest.rainfall_csv_rows);
const rainSeries=rain.series.find(x=>x.column==='1')||rain.series[0];
assert.equal(rainSeries.quantity,'rainfall');
assert.equal(rainSeries.unit_status,'unresolved');
assert.equal(rainSeries.canonical_unit,null);
assert.ok(rainSeries.display_count<=15000);

console.log(JSON.stringify({
  fm01:{bytes:Buffer.byteLength(fm01Text),rows:fm01.rows,series:fm01.series.map(x=>({column:x.column,display_count:x.display_count}))},
  syntheticCsoEdm:{bytes:Buffer.byteLength(edmText),rows:edm.rows,columns:edm.columns.length},
  syntheticCsoRain:{bytes:Buffer.byteLength(rainText),rows:rain.rows,columns:rain.columns.length}
}));
