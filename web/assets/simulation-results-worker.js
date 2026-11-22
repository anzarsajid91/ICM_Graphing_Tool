/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
"use strict";

const token = new URL(self.location.href).searchParams.get("v") || "local";
if (!/^(?:[0-9a-f]{40}|local)$/.test(token)) throw new Error("Unexpected result worker build token.");
importScripts("simulation-results-core.js?v="+encodeURIComponent(token));

const core = self.HydraSimulationResults;
const sources = new Map();
const SOURCE_LIMIT = 16;
const BYTE_LIMIT = 64 * 1024 ** 2;
let active = null, extrema = null, revision = 0;

function summary(index, sourceId, filename,capacity=null) {
  return {sourceId, filename, count:index.count, first:index.first,last:index.last, ...index.metadata,capacity:capacity?.info??null};
}

function sourceKey(index) {
  const m=index.metadata;
  return JSON.stringify([m.fingerprint.digest,m.modelRevision,m.simulation,m.scenario,m.event,
    m.clock,m.missingToken,m.columns.map(c=>[c.series,c.column,c.sourceUnit,c.datum,c.sourceAttribute]),
    index.count,index.first,index.last]);
}

function resolveSource(id) {
  return resolveRecord(id).index;
}
function resolveRecord(id){
  const record=sources.get(id);
  if (!record) throw new Error("Select an available simulation results source.");
  return record;
}

function capacitySummary(record,capacity){
  record.capacity=capacity;
  const {sourceId,filename}=record.summary;
  record.summary=summary(record.index,sourceId,filename,capacity);
  return record.summary;
}

async function operation(id, name, data) {
  switch (name) {
    case "preview": return core.inspectCsv(data.file);
    case "validate-csv-mapping": return core.validateCsvMapping(data.config);
    case "package-preview": return core.inspectPackage(data.file);
    case "capacity-import": {
      if(active)throw new Error("Wait for the current import or cancel it.");
      const record=resolveRecord(data.sourceId);
      if(data.confirmed!==true||!record.index.metadata.columns.some(column=>column.quantity==='flow'&&column.asset.table==='hw_conduit'))
        throw new Error("Review Pipe full capacity for a compatible indexed conduit-flow source.");
      const controller=new AbortController();active={id,controller};
      try{
        const {rows,...metadata}=await core.importCapacityCsv(data.file,data.config,{signal:controller.signal,
          onProgress:(loaded,total)=>self.postMessage({id,type:"progress",loaded,total})});
        controller.signal.throwIfAborted();
        if(sources.get(data.sourceId)!==record)throw new Error('The reviewed conduit-flow source is no longer indexed.');
        const used=[...sources.values()].filter(item=>item!==record).reduce((count,item)=>count+(item.capacity?.values.size||0),0);
        if(used+rows.length>40_000)throw new Error('Remove a capacity table. The local session supports up to 40,000 capacity rows.');
        const info={...metadata,count:rows.length,filename:typeof data.file.name==='string'?data.file.name.slice(0,256):'Local capacity export'};
        return capacitySummary(record,{info,values:new Map(rows.map(row=>[row.key,row.capacity]))});
      }finally{active=null;}
    }
    case "capacity-remove": return capacitySummary(resolveRecord(data.sourceId),null);
    case "capacity-get": {
      const record=resolveRecord(data.sourceId);
      if(!Array.isArray(data.keys)||data.keys.length>20_000)throw new Error('Select up to 20,000 typed conduit results.');
      return record.capacity?{info:record.capacity.info,values:data.keys.map(key=>record.capacity.values.get(key)??null)}:null;
    }
    case "export-package": return resolveSource(data.sourceId).exportPackage();
    case "import-package":
    case "import": {
      if (active) throw new Error("Wait for the current import or cancel it.");
      if (sources.size >= SOURCE_LIMIT) throw new Error("Clear a results source before importing more than 16 files.");
      const controller = new AbortController();
      active = {id,controller};
      const used = Array.from(sources.values(),source=>source.index.metadata.allocationBytes).reduce((a,b)=>a+b,0);
      try {
        const options={
          signal:controller.signal,byteLimit:BYTE_LIMIT-used,
          onProgress:(loaded,total)=>self.postMessage({id,type:"progress",loaded,total})
        };
        const index = name==="import-package"?await core.importPackage(data.file,{...options,fileBacked:data.fileBacked===true}):
          await core.importCsv(data.file,data.config,options);
        controller.signal.throwIfAborted();
        const key=sourceKey(index);
        const filename=typeof data.file.name==="string" ? data.file.name.slice(0,256) : "Local results";
        for (const [sourceId,record] of sources) if (record.key===key){
          if(record.summary.accessMode===index.metadata.accessMode)return {...record.summary,reused:true};
          const metadata=summary(index,sourceId,filename,record.capacity);
          sources.set(sourceId,{index,key,summary:metadata,capacity:record.capacity});
          return {...metadata,accessModeChanged:true};
        }
        const sourceId=++revision;
        const metadata=summary(index,sourceId,filename);
        sources.set(sourceId,{index,key,summary:metadata});
        return metadata;
      } finally {active=null;}
    }
    case "remove": return sources.delete(data.sourceId);
    case "frame": {
      const source=resolveSource(data.sourceId);
      if (!Array.isArray(data.keys) || data.keys.length>20000) throw new Error("Select a valid set of result series.");
      if(data.time==null&&source.frameAt)return source.frameAt(data.index,data.keys);
      const time=data.time ?? await source.timestamp(data.index);
      return {time,values:time===null ? null : await source.frame(time,data.keys)};
    }
    case "series": return resolveSource(data.sourceId).seriesWindow(data.key,data.start,data.end);
    case "envelope": return resolveSource(data.sourceId).envelope(data.key,data.start,data.end);
    case "envelopes": {
      const source=resolveSource(data.sourceId);
      if(!Array.isArray(data.keys)||!data.keys.length||data.keys.length>20000)throw new Error("Select a valid set of result series.");
      if(extrema&&!extrema.controller.signal.aborted)throw new Error("Wait for the current extrema scan or cancel it.");
      const controller=new AbortController();
      extrema={id,controller};
      try{
        return await source.envelopes(data.keys,data.start,data.end,{signal:controller.signal,magnitude:data.magnitude===true,
          onProgress:(loaded,total)=>self.postMessage({id,type:"progress",loaded,total})});
      }finally{if(extrema?.id===id)extrema=null;}
    }
    case "range": return resolveSource(data.sourceId).range(core.parseProjectClock(data.start),core.parseProjectClock(data.end));
    default: throw new Error("Unsupported simulation results operation.");
  }
}

self.addEventListener("message", ({data:message}) => {
  if (!message || !Number.isSafeInteger(message.id)) return;
  const {id,name,data}=message;
  if (name === "cancel") {
    if (active?.id === data?.requestId) active.controller.abort();
    if (extrema?.id === data?.requestId) extrema.controller.abort();
    return;
  }
  void operation(id,name,data||{}).then(value=>{
    const transfer=name==="series" ? [value.times.buffer,value.values.buffer] : [];
    self.postMessage({id,type:"result",value},transfer);
  },error=>self.postMessage({id,type:"error",message:error.name==="AbortError" ?
    (name==="envelopes"?"Extrema scan cancelled. Existing results are available.":"Import cancelled. Existing results are available.") : error.message}));
});
