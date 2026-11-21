import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import '../assets/simulation-results-core.js';

const {assetKey,inspectCsv,importCsv,inspectPackage,importPackage,streamPackageFromCsv}=globalThis.HydraSimulationResults;
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
assert.deepEqual(index.range(start+1,end-1),{count:1,firstIndex:1,lastIndex:1,first:middle,last:middle});
assert.deepEqual(index.range(start+1,middle-1),{count:0,firstIndex:null,lastIndex:null,first:null,last:null});
assert.throws(()=>index.range(end,start),/valid result window/);

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

const packed=await index.exportPackage();
const packedInfo=await inspectPackage(packed);
assert.equal(packedInfo.count,3);
assert.equal(packedInfo.modelRevision,'REV-02');
const restored=await importPackage(packed);
assert.deepEqual(restored.metadata.originalFingerprint,index.metadata.fingerprint);
assert.notEqual(restored.metadata.fingerprint.digest,index.metadata.fingerprint.digest);
assert.equal(restored.metadata.missingCount,2);
assert.deepEqual(restored.metadata.columns.map(item=>item.series),keys);
assert.deepEqual(restored.frame(middle,keys),[-1,null,21]);
assert.deepEqual(restored.frame(middle+1,keys),null);
assert.deepEqual([...restored.seriesWindow(keys[1],middle,end).values],[NaN,24]);
assert.deepEqual(restored.envelope(keys[0],start,end),index.envelope(keys[0],start,end));
await assert.rejects(importPackage(packed.slice(0,-1)),/size/);
await assert.rejects(importPackage(packed,{byteLimit:64}),/typed-data budget/);
await assert.rejects(importPackage(packed,{signal:cancelled.signal}),{name:'AbortError'});
const buffer=await packed.arrayBuffer(),layout=new DataView(buffer),dataStart=12+layout.getUint32(8,true);
const originalHeader=JSON.parse(new TextDecoder().decode(buffer.slice(12,dataStart)));
const smallBlocks=new TextEncoder().encode(JSON.stringify({...originalHeader,rowsPerChunk:1}));
const rewrittenPrefix=buffer.slice(0,12);new DataView(rewrittenPrefix).setUint32(8,smallBlocks.length,true);
await assert.rejects(importPackage(new Blob([rewrittenPrefix,smallBlocks,buffer.slice(dataStart)])),/block size/);
const invalidMeasure=buffer.slice(0);new DataView(invalidMeasure).setFloat64(dataStart+3*8,Infinity,true);
await assert.rejects(importPackage(new Blob([invalidMeasure])),/non-finite measurement/);
const repeatedClock=buffer.slice(0);new DataView(repeatedClock).setFloat64(dataStart+8,start,true);
await assert.rejects(importPackage(new Blob([repeatedClock])),/timestamps must increase strictly/);

const manyRows=Array.from({length:5001},(_,sample)=>
  new Date(start+sample*300000).toISOString().slice(0,-1)+','+(sample*1000)+','+(sample===4096?'#N/A':20+sample)+',20');
const many=await importCsv(new Blob(['Time,Flow,Level,Node\n'+manyRows.join('\n')]),{...config,headerRecord:1,unitsRecord:undefined});
let bytesRead=0;
class CountedFile extends Blob {
  slice(from,to){const part=super.slice(from,to);bytesRead+=part.size;return part;}
}
const backedFile=new CountedFile([many.exportPackage()]);
const backed=await importPackage(backedFile,{fileBacked:true,byteLimit:150000});
assert.equal(backed.metadata.accessMode,'file');
assert(backed.metadata.allocationBytes<160032,'The package payload does not need a full retained copy');
assert.equal(backed.count,5001);
const boundary=many.timestamp(4096),before=many.timestamp(4095),after=many.timestamp(4097);
assert.deepEqual(await backed.range(before+1,after),{count:2,firstIndex:4096,lastIndex:4097,first:boundary,last:after});
assert.deepEqual(await backed.range(after+1,after+2),{count:0,firstIndex:null,lastIndex:null,first:null,last:null});
bytesRead=0;
assert.deepEqual(await backed.frame(before,[keys[1]]),[4115]);
const initialRead=bytesRead;
assert(initialRead<=2*4096*8,'Lookup reads the time and selected value column only');
assert.deepEqual(await backed.frame(many.timestamp(4094),[keys[1]]),[4114]);
assert.equal(bytesRead,initialRead,'A second position in the cached block needs no file read');
assert.equal(await backed.timestamp(4096),boundary);
assert.deepEqual(await backed.frame(boundary,keys),[4096,null,20]);
assert.equal(await backed.frame(boundary+1,keys),null);
assert.deepEqual([...(await backed.seriesWindow(keys[1],before,after)).values],[4115,NaN,4117]);
assert.deepEqual(await backed.envelope(keys[1],before,after),many.envelope(keys[1],before,after));
assert.equal((await backed.exportPackage()).size,backedFile.size);
await assert.rejects(importPackage(backedFile,{fileBacked:true,byteLimit:1024}),/typed-data budget/);
const bodyBlocks=[];
const streamedHeader=await streamPackageFromCsv(new Blob(['Time,Flow,Level,Node\n'+manyRows.join('\n')]),
  {...config,headerRecord:1,unitsRecord:undefined},async block=>bodyBlocks.push(block));
assert.equal(bodyBlocks.length,2,'The writer emits a full block and an exact final block');
const streamed=new Blob([streamedHeader,...bodyBlocks]);
assert.deepEqual(new Uint8Array(await streamed.arrayBuffer()),new Uint8Array(await many.exportPackage().arrayBuffer()));
const fromStream=await importPackage(streamed,{fileBacked:true});
assert.deepEqual(await fromStream.frame(boundary,keys),[4096,null,20]);
const {packSimulationResults}=await import('../../scripts/pack_simulation_results.mjs');
const folder=await fs.mkdtemp(join(tmpdir(),'hydra-pack-unit-'));
try{
  const input=join(folder,'synthetic.csv'),mapping=join(folder,'mapping.json'),output=join(folder,'result.hbresults');
  await fs.writeFile(input,csv);await fs.writeFile(mapping,JSON.stringify(config));
  await packSimulationResults(input,mapping,output);
  assert.deepEqual(new Uint8Array(await fs.readFile(output)),new Uint8Array(await packed.arrayBuffer()));
  await assert.rejects(packSimulationResults(input,mapping,output),/already exists/);
  await fs.writeFile(input,csv.replace('-1000','1e999'));
  await assert.rejects(packSimulationResults(input,mapping,join(folder,'invalid.hbresults')),/Invalid numeric/);
  assert.deepEqual((await fs.readdir(folder)).sort(),['mapping.json','result.hbresults','synthetic.csv']);
}finally{await fs.rm(folder,{recursive:true,force:true});}
console.log('SIMULATION_RESULTS_UNIT_PASS');
