/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";

const BLOCK_BYTES = 1024 ** 2;
const MAX_RECORD = BLOCK_BYTES;
const MAX_COLUMNS = 20001;
const MAX_SOURCE = 2 * 1024 ** 3;
const DATA_BYTES = 64 * BLOCK_BYTES;
const WINDOW_SAMPLES = 250000;
const PACKAGE_MAGIC = "HBRES001";
const PACKAGE_PREFIX_BYTES = 12;
const PACKAGE_HEADER_BYTES = 8 * BLOCK_BYTES;
const CSV_FINGERPRINT = "sha256-of-ordered-1MiB-sha256-blocks-v1";
const PACKAGE_FINGERPRINT = "sha256-of-hbresults-header-and-blocks-v1";
const littleEndian = new Uint8Array(Uint16Array.of(1).buffer)[0] === 1;
const blockRows=bytesPerRow=>Math.max(1,Math.min(4096,Math.floor(BLOCK_BYTES/bytesPerRow)));
const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const tables = new Set(["hw_conduit", "hw_pump", "hw_weir", "hw_sluice", "hw_orifice", "hw_flap_valve", "hw_screen", "hw_user_control", "hw_outlet"]);
const dimensions = new Map([
  ["flow", ["m³/s", new Map([["m³/s", 1], ["L/s", .001]])]],
  ["velocity", ["m/s", new Map([["m/s", 1], ["mm/s", .001]])]],
  ...["level", "depth", "total-head", "flood-depth"].map(quantity => [quantity, ["m", new Map([["m", 1], ["mm", .001]])]]),
  ["flood-volume", ["m³", new Map([["m³", 1], ["L", .001]])]],
  ["surcharge-state", ["1", new Map([["1", 1]])]]
]);

function parseRecord(line) {
  if (!line.includes('"')) {
    if (/[\r\n\0]/.test(line)) throw new Error("Invalid character outside a quoted field.");
    return line.split(",");
  }
  const fields = [], token = /("(?:[^"]|"")*"|[^",\r\n\0]*)(?:,|$)/gy;
  let offset = 0;
  while (offset < line.length) {
    const match = token.exec(line);
    if (!match || token.lastIndex <= offset || match[1].includes("\0")) throw new Error("Malformed CSV field.");
    fields.push(match[1].startsWith('"') ? match[1].slice(1,-1).replaceAll('""','"') : match[1]);
    offset = token.lastIndex;
  }
  if (line.endsWith(",")) fields.push("");
  return fields;
}

// Scan independently of the browser's chosen delivery chunk size. Reuse these
// fixed-size blocks when deriving the ordered source fingerprint.
async function readRecords(blob, visit, {signal, onProgress, fingerprint = false} = {}) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > MAX_SOURCE)
    throw new Error("Choose a non-empty result CSV up to 2 GiB.");
  let decoder, pending = "", quoted = false, record = 0;
  const hashes = fingerprint ? new Uint8Array(32 * Math.ceil(blob.size / BLOCK_BYTES)) : null;
  function feed(line) {
    if (line.length > MAX_RECORD) throw new Error("Result CSV record exceeds the supported length.");
    ++record;
    if (!line.trim()) return true;
    try {
      const fields = parseRecord(line);
      if (fields.length > MAX_COLUMNS) throw new Error("Too many columns in a result record.");
      return visit(fields, record) !== false;
    } catch (error) {
      throw new Error(`Result CSV record ${record}. ${error.message}`);
    }
  }
  for (let offset = 0; offset < blob.size; offset += BLOCK_BYTES) {
    signal?.throwIfAborted();
    const bytes = await blob.slice(offset, offset + BLOCK_BYTES).arrayBuffer();
    if (!decoder) {
      const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength,2));
      const encoding = header[0] === 255 && header[1] === 254 ? "utf-16le" :
        header[0] === 254 && header[1] === 255 ? "utf-16be" : "utf-8";
      decoder = new TextDecoder(encoding, {fatal:true});
    }
    const chunk = decoder.decode(bytes, {stream:offset + bytes.byteLength < blob.size});
    let start = 0;
    for (let index = 0; index < chunk.length; ++index) {
      if (chunk[index] === '"') quoted = !quoted;
      else if (chunk[index] === "\n" && !quoted) {
        if (!feed((pending + chunk.slice(start,index)).replace(/\r$/,""))) return null;
        pending = "";
        start = index + 1;
      }
    }
    pending += chunk.slice(start);
    if (pending.length > MAX_RECORD) throw new Error("Result CSV record exceeds the supported length.");
    if (hashes) {
      const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      hashes.set(new Uint8Array(hash), 32 * (offset / BLOCK_BYTES));
    }
    onProgress?.(Math.min(offset + bytes.byteLength, blob.size), blob.size);
  }
  signal?.throwIfAborted();
  if (quoted) throw new Error("Result CSV ends inside a quoted record.");
  if (pending.length) feed(pending.replace(/\r$/,""));
  if (!hashes) return null;
  return finishFingerprint(hashes,blob.size,CSV_FINGERPRINT);
}

async function finishFingerprint(hashes,size,algorithm){
  const digest=await globalThis.crypto.subtle.digest("SHA-256",hashes);
  return {algorithm,digest:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join(""),size};
}

async function inspectCsv(blob, options) {
  const preview = [];
  await readRecords(blob, (fields, record) => {
    preview.push({record, fields:fields.slice(0,25).map(field => field.slice(0,256)), columnCount:fields.length});
    return preview.length < 12;
  }, options);
  return preview;
}

function requiredText(value, label, limit = 128) {
  if (typeof value !== "string" || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/.test(value))
    throw new Error(`Specify ${label} using 1 to ${limit} printable characters.`);
  return value.trim();
}

function assetKey(asset) {
  if (asset?.kind === "node") return JSON.stringify(["node", requiredText(asset.id,"a node ID").toUpperCase()]);
  if (asset?.kind === "link" && tables.has(asset.table)) return JSON.stringify(["link",asset.table,
    requiredText(asset.upstream,"the upstream node ID").toUpperCase(),requiredText(asset.suffix,"the link suffix",16).toUpperCase()]);
  throw new Error("Map each result column to a typed node or composite ICM link identity.");
}

function clockStamp(text, pattern) {
  const iso = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d)(\.\d{1,3})?)?$/.exec(text);
  const uk = /^(\d\d?)\/(\d\d?)\/(\d{4}) (\d\d):(\d\d)(?::(\d\d)(\.\d{1,3})?)?$/.exec(text);
  const nodes = pattern === "iso" && iso ? iso.slice(1) : pattern === "dmy" && uk ?
    [uk[3],uk[2],uk[1],...uk.slice(4)] : null;
  if (!nodes) throw new Error("Timestamp does not match the selected project clock or includes a timezone.");
  const [year,month,day,hour,minute,second="00",fraction=".000"] = nodes;
  const value = `${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}T${hour}:${minute}:${second}${fraction.padEnd(4,"0")}Z`;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) throw new Error("Invalid project-clock timestamp.");
  return ms;
}

function timeReader(clock) {
  if (clock === "iso" || clock === "dmy") return input => clockStamp(input,clock);
  throw new Error("Select an ISO or day/month/year model clock. Resolve explicit offsets before import.");
}

function unitToken(unit) {
  return unit.trim().toLowerCase().replaceAll("³","3").replaceAll(" ","");
}

function compile(config) {
  const simulation = requiredText(config.simulation,"the simulation ID");
  const modelRevision = requiredText(config.modelRevision,"the model revision");
  const scenario = requiredText(config.scenario,"the scenario");
  const event = requiredText(config.event,"the event");
  if (config.temporalSupport !== "instantaneous" || config.clockConfirmed !== true)
    throw new Error("Playback requires confirmed instantaneous samples on the project clock.");
  const {headerRecord,timeColumn,unitsRecord} = config;
  if (!Number.isInteger(headerRecord) || headerRecord<1 || headerRecord>20 ||
      !Number.isInteger(timeColumn) || timeColumn<0 || (unitsRecord !== undefined && unitsRecord !== headerRecord+1))
    throw new Error("Select a header in the first 20 records, an explicit time column and any following unit row.");
  const parseTime = timeReader(config.clock);
  if (!Array.isArray(config.columns) || !config.columns.length || config.columns.length >= MAX_COLUMNS)
    throw new Error("Map at least one supported result column.");
  const indexes = new Set([timeColumn]), keys = new Set();
  const columns = config.columns.map(raw => {
    const key = assetKey(raw.asset);
    if (!Number.isInteger(raw.column) || raw.column < 0 || indexes.has(raw.column))
      throw new Error("Map each CSV column only once.");
    indexes.add(raw.column);
    const {quantity,location}=raw;
    const allowed = raw.asset.kind === "node" ? location === "node" && ["level","flow","flood-depth","flood-volume"].includes(quantity) :
      ["upstream","downstream"].includes(location) && ["level","depth","flow","velocity","total-head","surcharge-state"].includes(quantity);
    if (!allowed) throw new Error("The quantity and result location must match the asset type.");
    const [unit,factors] = dimensions.get(quantity);
    const sourceUnit = typeof raw.unit === "string" ? [...factors.keys()].find(value=>unitToken(value)===unitToken(raw.unit)) : null;
    if (!sourceUnit) throw new Error(`Resolve units for ${quantity} explicitly.`);
    const datum = ["level","total-head"].includes(quantity) ? requiredText(raw.datum,"the vertical datum") : null;
    const series = JSON.stringify([key,quantity,location]);
    if (keys.has(series)) throw new Error("Duplicate typed asset, quantity and result location.");
    keys.add(series);
    const asset = raw.asset.kind === "node" ? {kind:"node",id:raw.asset.id.trim()} :
      {kind:"link",table:raw.asset.table,upstream:raw.asset.upstream.trim(),suffix:raw.asset.suffix.trim()};
    return {series,key,asset,column:raw.column,quantity,location,datum,unit,scale:factors.get(sourceUnit),
      sourceUnit,sourceAttribute:requiredText(raw.sourceAttribute,"the source result attribute label")};
  });
  const missing = config.missingToken ? requiredText(config.missingToken,"the optional missing-value token",32) : null;
  if (missing && decimal.test(missing)) throw new Error("A missing-value token must be nonnumeric. Zero is an actual sample.");
  return {headerRecord,timeColumn,unitsRecord,columns,parseTime,missing,
    contract:{schemaVersion:1,simulation,modelRevision,scenario,event,clock:config.clock,temporalSupport:"instantaneous"}};
}

function lowerIndex(length,get,target){
  let low=0,high=length;
  while(low<high){
    const pivot=(low+high)>>>1;
    if(get(pivot)<target)low=pivot+1;
    else high=pivot;
  }
  return low;
}

function makeIndex(chunks, rowsPerChunk, count, metadata) {
  const positions = new Map(metadata.columns.map((column,index)=>[column.series,index]));
  const at = index => chunks[Math.floor(index/rowsPerChunk)].time[index%rowsPerChunk];
  const valueAt = (index,column) => {
    const chunk=chunks[Math.floor(index/rowsPerChunk)];
    return chunk.values[column*chunk.time.length+index%rowsPerChunk];
  };
  const lowerBound=clock=>lowerIndex(count,at,clock);
  function bounds(start,end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start>end) throw new Error("Choose a valid result window.");
    const upper = lowerBound(end);
    return [lowerBound(start),upper+(upper<count&&at(upper)===end ? 1 : 0)];
  }
  return {metadata,count,first:at(0),last:at(count-1),
    exportPackage(){return encodePackage(chunks,rowsPerChunk,count,metadata);},
    timestamp(index) {
      if (!Number.isInteger(index) || index<0 || index>=count) return null;
      return at(index);
    },
    frame(time, keys) {
      if (!Number.isFinite(time)) throw new Error("Choose an exact simulation timestamp.");
      const index = lowerBound(time);
      if (index >= count || at(index)!==time) return null;
      return keys.map(key => {
        const column = positions.get(key);
        const sample = column === undefined ? NaN : valueAt(index,column);
        return Number.isNaN(sample) ? null : sample;
      });
    },
    seriesWindow(key,start,end) {
      if (!positions.has(key)) throw new Error("This result series is unavailable.");
      const [left,right]=bounds(start,end), size=right-left;
      if (size>WINDOW_SAMPLES) throw new Error("Select a smaller time window to retrieve up to 250,000 samples.");
      const times=new Float64Array(size), values=new Float64Array(size), column=positions.get(key);
      for (let index=0;index<size;++index) {
        times[index]=at(left+index);
        values[index]=valueAt(left+index,column);
      }
      return {times,values};
    },
    envelope(key,start,end) {
      if (!positions.has(key)) throw new Error("This result series is unavailable.");
      const [left,right]=bounds(start,end), column=positions.get(key);
      let min = null, max = null, minTime = null, maxTime = null, valid = 0;
      for (let index=left;index<right;++index) {
        const value = valueAt(index,column);
        if (Number.isNaN(value)) continue;
        ++valid;
        if (min === null || value < min) {min=value;minTime=at(index);}
        if (max === null || value > max) {max=value;maxTime=at(index);}
      }
      return {min,max,minTime,maxTime,valid,samples:right-left};
    }
  };
}

function readLE(buffer){
  if(littleEndian)return new Float64Array(buffer);
  const view=new DataView(buffer);
  return Float64Array.from({length:buffer.byteLength/8},(_,index)=>view.getFloat64(index*8,true));
}

function fileIndex(blob,layout,lastTimes,first,metadata){
  const {bodyOffset,count,rowsPerChunk,bytesPerRow}=layout;
  const positions=new Map(metadata.columns.map((column,index)=>[column.series,index+1]));
  let cached=null;
  let pending=Promise.resolve();
  function serial(action){
    const request=pending.then(action);
    pending=request.catch(()=>{});
    return request;
  }
  async function readColumns(block,columns){
    if(cached?.block!==block)cached={block,columns:new Map()};
    const cache=cached.columns,rows=Math.min(rowsPerChunk,count-block*rowsPerChunk);
    const missing=[...new Set(columns)].filter(column=>!cache.has(column)).sort((a,b)=>a-b);
    const start=bodyOffset+block*rowsPerChunk*bytesPerRow;
    for(let i=0;i<missing.length;){
      const first=missing[i];let last=first;
      while(++i<missing.length&&missing[i]===last+1)last++;
      const request=blob.slice(start+first*rows*8,start+(last+1)*rows*8).arrayBuffer().then(readLE);
      for(let column=first;column<=last;column++){
        const offset=(column-first)*rows;
        cache.set(column,request.then(values=>values.subarray(offset,offset+rows)));
      }
    }
    return Promise.all(columns.map(column=>cache.get(column)));
  }
  async function timestamp(index){
    if(!Number.isInteger(index)||index<0||index>=count)return null;
    const [times]=await readColumns(Math.floor(index/rowsPerChunk),[0]);
    return times[index%rowsPerChunk];
  }
  async function position(time){
    const block=lowerIndex(lastTimes.length,index=>lastTimes[index],time);
    if(block===lastTimes.length)return {block,index:count,exact:false};
    const [times]=await readColumns(block,[0]);
    const local=lowerIndex(times.length,index=>times[index],time);
    return {block,index:block*rowsPerChunk+local,exact:times[local]===time};
  }
  async function bounds(start,end){
    if(!Number.isFinite(start)||!Number.isFinite(end)||start>end)throw new Error("Choose a valid result window.");
    const left=await position(start),right=await position(end);
    return [left.index,right.index+(right.exact?1:0)];
  }
  async function* pieces(column,left,right){
    for(let index=left;index<right;){
      const local=index%rowsPerChunk,block=Math.floor(index/rowsPerChunk);
      const count=Math.min(rowsPerChunk-local,right-index);
      const [times,values]=await readColumns(block,[0,column]);
      yield [times.subarray(local,local+count),values.subarray(local,local+count)];
      index+=count;
    }
  }
  const seriesPosition=key=>{
    if(!positions.has(key))throw new Error("This result series is unavailable.");
    return positions.get(key);
  };
  async function readFrame(index,keys,includeTime){
    const slots=keys.flatMap(key=>positions.has(key)?[positions.get(key)]:[]);
    if(includeTime)slots.unshift(0);
    const rows=await readColumns(Math.floor(index/rowsPerChunk),slots),local=index%rowsPerChunk;
    let source=includeTime?1:0;
    const values=keys.map(key=>{
      const value=positions.has(key)?rows[source++][local]:NaN;
      return Number.isNaN(value)?null:value;
    });
    return includeTime?{time:rows[0][local],values}:values;
  }
  return {metadata,count,first,last:lastTimes.at(-1),timestamp:index=>serial(()=>timestamp(index)),
    exportPackage(){return blob;},
    frameAt(index,keys){return serial(()=>Number.isInteger(index)&&index>=0&&index<count?
      readFrame(index,keys,true):{time:null,values:null});},
    frame(time,keys){return serial(async()=>{
      if(!Number.isFinite(time))throw new Error("Choose an exact simulation timestamp.");
      const target=await position(time);
      return target.exact?readFrame(target.index,keys,false):null;
    });},
    seriesWindow(key,start,end){return serial(async()=>{
      const column=seriesPosition(key),[left,right]=await bounds(start,end),size=right-left;
      if(size>WINDOW_SAMPLES)throw new Error("Select a smaller time window to retrieve up to 250,000 samples.");
      const times=new Float64Array(size),values=new Float64Array(size);
      let offset=0;
      for await(const [time,series] of pieces(column,left,right)){
        times.set(time,offset);values.set(series,offset);offset+=time.length;
      }
      return {times,values};
    });},
    envelope(key,start,end){return serial(async()=>{
      const column=seriesPosition(key),[left,right]=await bounds(start,end);
      let min=null,max=null,minTime=null,maxTime=null,valid=0;
      for await(const [times,series] of pieces(column,left,right)){
        for(const [index,value] of series.entries()){
          if(Number.isNaN(value))continue;
          valid++;
          if(min===null||value<min){min=value;minTime=times[index];}
          if(max===null||value>max){max=value;maxTime=times[index];}
        }
      }
      return {min,max,minTime,maxTime,valid,samples:right-left};
    });}
  };
}

function encodePackage(chunks,rowsPerChunk,count,metadata){
  const {simulation,modelRevision,scenario,event,clock,temporalSupport,columns,missingToken}=metadata;
  const fields=columns.map(({asset,column,quantity,location,datum,unit,sourceUnit,sourceAttribute,sourceHeader,sourceUnitLabel})=>
    ({asset,column,quantity,location,datum,unit,sourceUnit,sourceAttribute,sourceHeader,sourceUnitLabel}));
  const header=new TextEncoder().encode(JSON.stringify({schemaVersion:1,count,rowsPerChunk,simulation,modelRevision,scenario,event,
    clock,temporalSupport,columns:fields,missingToken,originalFingerprint:metadata.originalFingerprint||metadata.fingerprint}));
  if(header.byteLength>PACKAGE_HEADER_BYTES)throw new Error("The portable results metadata exceeds 8 MiB. Use fewer mapped columns.");
  const prefix=new Uint8Array(PACKAGE_PREFIX_BYTES);
  prefix.set(new TextEncoder().encode(PACKAGE_MAGIC));
  new DataView(prefix.buffer).setUint32(8,header.byteLength,true);
  const parts=[prefix,header];
  for(const [index,chunk] of chunks.entries()){
    const rows=Math.min(rowsPerChunk,count-index*rowsPerChunk);
    const sections=[chunk.time.subarray(0,rows),...fields.map((_,column)=>
      chunk.values.subarray(column*chunk.time.length,column*chunk.time.length+rows))];
    if(littleEndian)parts.push(new Blob(sections));
    else{
      const block=new DataView(new ArrayBuffer(8*rows*sections.length));
      let offset=0;
      for(const section of sections)for(const value of section){block.setFloat64(offset,value,true);offset+=8;}
      parts.push(new Blob([block.buffer]));
    }
  }
  return new Blob(parts,{type:"application/octet-stream"});
}

function sourceFingerprint(raw){
  if(!raw||raw.algorithm!==CSV_FINGERPRINT||typeof raw.digest!=="string"||!/^[0-9a-f]{64}$/.test(raw.digest)||
      !Number.isSafeInteger(raw.size)||raw.size<1||raw.size>MAX_SOURCE)throw new Error("The original results fingerprint is invalid.");
  return {algorithm:raw.algorithm,digest:raw.digest,size:raw.size};
}

async function packageHeader(blob){
  if(!(blob instanceof Blob)||blob.size<=PACKAGE_PREFIX_BYTES||blob.size>MAX_SOURCE)
    throw new Error("Choose a non-empty portable results package up to 2 GiB.");
  const prefix=await blob.slice(0,PACKAGE_PREFIX_BYTES).arrayBuffer();
  if(new TextDecoder().decode(new Uint8Array(prefix,0,8))!==PACKAGE_MAGIC)
    throw new Error("This file has no supported Hydra Bench results package header.");
  const length=new DataView(prefix).getUint32(8,true),bodyOffset=PACKAGE_PREFIX_BYTES+length;
  if(length<2||length>PACKAGE_HEADER_BYTES||bodyOffset>=blob.size)
    throw new Error("The results package header size is invalid.");
  const data=await blob.slice(0,bodyOffset).arrayBuffer();
  let header;
  try{header=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(new Uint8Array(data,PACKAGE_PREFIX_BYTES)));}
  catch{throw new Error("The results package header is malformed.");}
  if(!header||header.schemaVersion!==1||!Array.isArray(header.columns)||!header.columns.length||header.columns.length>=MAX_COLUMNS)
    throw new Error("The results package schema or column count is unsupported.");
  const {count,rowsPerChunk}=header,bytesPerRow=8*(header.columns.length+1);
  if(rowsPerChunk!==blockRows(bytesPerRow))throw new Error("The results package block size does not match its column count.");
  if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(count*bytesPerRow)||
     bodyOffset+count*bytesPerRow!==blob.size)throw new Error("The results package size or sample count does not match its header.");
  const checked=compile({simulation:header.simulation,modelRevision:header.modelRevision,scenario:header.scenario,event:header.event,
    clock:header.clock,temporalSupport:header.temporalSupport,clockConfirmed:true,missingToken:header.missingToken,headerRecord:1,timeColumn:0,
    columns:header.columns.map((item,index)=>{
      if(!item||typeof item!=="object")throw new Error("A portable result column is invalid.");
      return {asset:item.asset,column:index+1,quantity:item.quantity,location:item.location,unit:item.sourceUnit,
        datum:item.datum,sourceAttribute:item.sourceAttribute};
    })});
  const nativeColumns=new Set();
  const columns=checked.columns.map((item,index)=>{
    const raw=header.columns[index];
    if(raw.unit!==item.unit||!Number.isInteger(raw.column)||raw.column<0||raw.column>=MAX_COLUMNS||nativeColumns.has(raw.column)||
       typeof raw.sourceHeader!=="string"||raw.sourceHeader.length>256||
       (raw.sourceUnitLabel!==null&&(typeof raw.sourceUnitLabel!=="string"||raw.sourceUnitLabel.length>64)))
      throw new Error("A portable result column has invalid units or source provenance.");
    nativeColumns.add(raw.column);
    return {...item,column:raw.column,sourceHeader:raw.sourceHeader,sourceUnitLabel:raw.sourceUnitLabel};
  });
  return {data,bodyOffset,count,rowsPerChunk,bytesPerRow,metadata:{...checked.contract,missingToken:checked.missing,columns,
    originalFingerprint:sourceFingerprint(header.originalFingerprint),storageFormat:"hbresults-v1"}};
}

async function inspectPackage(blob){
  const {count,metadata}=await packageHeader(blob);
  return {count,...metadata};
}

async function importPackage(blob,{signal,onProgress,byteLimit=DATA_BYTES,fileBacked=false}={}){
  signal?.throwIfAborted();
  const layout=await packageHeader(blob);
  const {data,bodyOffset,count,rowsPerChunk,bytesPerRow,metadata}=layout;
  const blockCount=Math.ceil(count/rowsPerChunk),lastTimes=fileBacked?new Float64Array(blockCount):null;
  const allocationBytes=fileBacked?lastTimes.byteLength+Math.min(count,rowsPerChunk)*bytesPerRow:count*bytesPerRow;
  if(allocationBytes>Math.min(DATA_BYTES,Number.isFinite(byteLimit)?byteLimit:DATA_BYTES))
    throw new Error("Selected results exceed the available typed-data budget. Clear a results source or use a smaller package.");
  const chunks=[],hashes=new Uint8Array(32*(1+blockCount));
  const hash=async (bytes,index)=>hashes.set(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",bytes)),index*32);
  await hash(data,0);
  let previous=-Infinity,first=null,missingCount=0;
  for(let start=0;start<count;start+=rowsPerChunk){
    signal?.throwIfAborted();
    const rows=Math.min(rowsPerChunk,count-start),offset=bodyOffset+start*bytesPerRow;
    const buffer=await blob.slice(offset,offset+rows*bytesPerRow).arrayBuffer();
    const block=start/rowsPerChunk;
    await hash(buffer,block+1);
    const decoded=readLE(buffer);
    const time=decoded.subarray(0,rows),values=decoded.subarray(rows);
    for(const sample of time){
      if(!Number.isSafeInteger(sample)||sample< -62167219200000||sample>253402300799999||sample<=previous)
        throw new Error("Portable results timestamps must increase strictly on a valid project clock.");
      if(first===null)first=sample;
      previous=sample;
    }
    for(const value of values){
      if(Number.isNaN(value))missingCount++;
      else if(!Number.isFinite(value))throw new Error("A portable result contains a non-finite measurement.");
    }
    if(fileBacked)lastTimes[block]=previous;
    else chunks.push({time,values});
    onProgress?.(offset+buffer.byteLength,blob.size);
  }
  signal?.throwIfAborted();
  const fingerprint=await finishFingerprint(hashes,blob.size,PACKAGE_FINGERPRINT);
  signal?.throwIfAborted();
  const details={...metadata,allocationBytes,missingCount,fingerprint,accessMode:fileBacked?"file":"memory"};
  return fileBacked?fileIndex(blob,layout,lastTimes,first,details):makeIndex(chunks,rowsPerChunk,count,details);
}

async function importCsv(blob, config, options = {}) {
  const {headerRecord,timeColumn,unitsRecord,columns,parseTime,missing,contract} = compile(config);
  const bytesPerRow = 8 * (columns.length + 1);
  const rowsPerChunk = blockRows(bytesPerRow);
  const byteLimit = Number.isFinite(options.byteLimit) ? Math.min(DATA_BYTES,options.byteLimit) : DATA_BYTES;
  const chunks = [];
  let header, unitLabels = null, last = -Infinity, count = 0, missingCount = 0;
  const fingerprint = await readRecords(blob, (fields, record) => {
    if (record < headerRecord) return;
    if (record === headerRecord) {
      header=fields;
      if (Math.max(timeColumn,...columns.map(column=>column.column))>=header.length)
        throw new Error("A mapped column is outside the selected header.");
      return;
    }
    if (!header || fields.length!==header.length) throw new Error("Record width does not match the selected header.");
    if (record === unitsRecord) {
      unitLabels=fields;
      for (const column of columns) {
        const sourceLabel=unitToken(fields[column.column]);
        if (sourceLabel && sourceLabel!==unitToken(column.sourceUnit))
          throw new Error(`The units row conflicts with the mapped unit for column ${column.column+1}.`);
      }
      return;
    }
    const t = parseTime(fields[timeColumn].trim());
    if (t<=last) throw new Error("Timestamps must increase strictly. Review repeated or out-of-order samples.");
    last=t;
    const local=count%rowsPerChunk;
    if (local === 0) {
      if ((chunks.length+1)*rowsPerChunk*bytesPerRow>byteLimit)
        throw new Error("Selected results exceed the available typed-data budget. Clear a results source, map fewer columns or export a smaller period.");
      chunks.push({time:new Float64Array(rowsPerChunk),values:new Float64Array(rowsPerChunk*columns.length)});
    }
    const chunk=chunks.at(-1);
    chunk.time[local]=t;
    for (let index=0;index<columns.length;++index) {
      const column=columns[index], raw=fields[column.column].trim();
      const position=index*rowsPerChunk+local;
      if (raw==="" || raw===missing) {chunk.values[position]=NaN;++missingCount;continue;}
      const number=Number(raw)*column.scale;
      if (!decimal.test(raw) || !Number.isFinite(number)) throw new Error(`Invalid numeric value in column ${column.column+1}.`);
      chunk.values[position]=number;
    }
    ++count;
  }, {...options,fingerprint:true});
  if (!count || (unitsRecord && !unitLabels)) throw new Error("No samples or confirmed unit row were found.");
  const metadata = {...contract, fingerprint, missingToken:missing, missingCount,
    allocationBytes:chunks.length*rowsPerChunk*bytesPerRow,
    columns:columns.map(column=>({...column,sourceHeader:header[column.column].slice(0,256),
      sourceUnitLabel:unitLabels?.[column.column]?.slice(0,64)??null}))};
  return makeIndex(chunks, rowsPerChunk, count, metadata);
}

globalThis.HydraSimulationResults=Object.freeze({inspectCsv,importCsv,inspectPackage,importPackage,assetKey});
})();
