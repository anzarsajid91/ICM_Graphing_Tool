import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import '../assets/simulation-results-core.js';

const {assetKey,inspectCsv,importCsv}=globalThis.HydraSimulationResults;
const asset={kind:'link',table:'hw_conduit',upstream:'00127',suffix:'b'};
const config={simulation:'SIM-03',modelRevision:'REV-02',scenario:'Baseline',event:'Event A',
  clock:'iso',clockConfirmed:true,temporalSupport:'instantaneous',headerRecord:2,timeColumn:0,unitsRecord:3,
  missingToken:'#N/A',columns:[
    {column:1,asset,quantity:'flow',location:'upstream',unit:'L/s',sourceAttribute:'US flow'},
    {column:2,asset,quantity:'level',location:'downstream',unit:'m',datum:'ODN',sourceAttribute:'DS level'},
    {column:3,asset:{kind:'node',id:'00127'},quantity:'level',location:'node',unit:'m',datum:'ODN',sourceAttribute:'Level'}
  ]};
const csv='Simulation export\r\n"Project clock","00127.b","US, noted\r\nwith quoted header","00127"\r\n,L/s,m,m\r\n'+
  '2025-01-01 00:00:00,0,20,20\r\n2025-01-01 00:05:00,-1000,#N/A,21\r\n2025-01-01 00:10:00,2000,24,\r\n';
const blob=new Blob([csv]);
const preview=await inspectCsv(blob);
assert.deepEqual(preview[1].fields,['Project clock','00127.b','US, noted\r\nwith quoted header','00127']);
assert.equal(preview[2].record,3);
const progress=[];
const index=await importCsv(blob,config,{onProgress:(loaded,total)=>progress.push([loaded,total])});
assert.deepEqual(progress,[[blob.size,blob.size]]);
assert.equal(index.count,3);
assert.equal(index.metadata.schemaVersion,1);
assert.equal(index.metadata.fingerprint.size,blob.size);
const hash=createHash('sha256').update(createHash('sha256').update(csv).digest()).digest('hex');
assert.equal(index.metadata.fingerprint.digest,hash);
assert.equal(index.metadata.missingCount,2);
assert.equal(assetKey(asset),'["link","hw_conduit","00127","B"]');
assert.notEqual(index.metadata.columns[1].key,index.metadata.columns[2].key);
const keys=index.metadata.columns.map(item=>item.series);
const start=index.timestamp(0),middle=index.timestamp(1),end=index.timestamp(2);
assert.equal(index.timestamp(3),null);
assert.deepEqual(index.frame(start,keys),[0,20,20]);
assert.deepEqual(index.frame(middle,keys),[-1,null,21]);
assert.deepEqual(index.frame(end,keys),[2,24,null]);
assert.equal(index.frame(middle+1,keys),null);
assert.deepEqual(index.frame(middle,['unavailable']),[null]);
assert.deepEqual([...index.seriesWindow(keys[1],middle,end).values],[NaN,24]);
assert.deepEqual(index.envelope(keys[0],start,end),{min:-1,max:2,minTime:middle,maxTime:end,valid:3,samples:3});
assert.deepEqual(index.envelope(keys[1],middle,middle),{min:null,max:null,minTime:null,maxTime:null,valid:0,samples:1});

await assert.rejects(importCsv(new Blob([csv.replace('00:05:00','00:00:00')]),config),/increase strictly/);
await assert.rejects(importCsv(new Blob([csv.replace('2025-01-01','2025-02-30')]),config),/Invalid project-clock/);
await assert.rejects(importCsv(new Blob([csv.replace('00:05:00','00:05:00Z')]),config),/includes a timezone/);
await assert.rejects(importCsv(new Blob([csv.replace('-1000','1e999')]),config),/Invalid numeric/);
await assert.rejects(importCsv(new Blob([csv.replace('-1000','#garbled')]),config),/Invalid numeric/);
await assert.rejects(importCsv(new Blob([csv.replace(',L/s,m,m',',m³/s,m,m')]),config),/units row conflicts/);
await assert.rejects(importCsv(new Blob([csv+'"broken']),config),/ends inside a quoted record/);
await assert.rejects(importCsv(blob,{...config,missingToken:'0'}),/nonnumeric/);
await assert.rejects(importCsv(blob,{...config,clockConfirmed:false}),/confirmed instantaneous/);
await assert.rejects(importCsv(blob,{...config,columns:[{...config.columns[1],datum:''}]}),/vertical datum/);
await assert.rejects(importCsv(blob,{...config,columns:[config.columns[0],{...config.columns[0],column:4}]}),/Duplicate typed asset/);
await assert.rejects(importCsv(blob,{...config,columns:[{...config.columns[0],asset:{kind:'link',id:'00127.b'}}]}),/composite/);
await assert.rejects(importCsv(blob,config,{byteLimit:1024}),/available typed-data budget/);
const cancelled=new AbortController();
cancelled.abort();
await assert.rejects(importCsv(blob,config,{signal:cancelled.signal}),{name:'AbortError'});

// Header starts with a BOM and uses native Windows UTF-16LE output. The first
// read splits through an escaped quote and the second read retains the record.
const nearBoundary='a'.repeat(1024**2-11);
const multi=new Blob(['Preamble\n"'+nearBoundary+'""","x"\r\nTime,00127.b\r\n31/12/2025 01:00:00,5']);
assert.equal((await inspectCsv(multi))[1].columnCount,2);
const utf16=new Blob([Buffer.from('\uFEFFTime,00127.b\r\n31/12/2025 01:00:00,5','utf16le')]);
const dmy=await importCsv(utf16,{...config,headerRecord:1,unitsRecord:undefined,clock:'dmy',columns:[config.columns[0]]});
assert.equal(new Date(dmy.timestamp(0)).toISOString(),'2025-12-31T01:00:00.000Z');
assert.deepEqual(dmy.frame(dmy.timestamp(0),keys.slice(0,1)),[.005]);
console.log('SIMULATION_RESULTS_UNIT_PASS');
