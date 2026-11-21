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
let active = null, revision = 0;

function summary(index, sourceId, filename) {
  return {sourceId, filename, count:index.count, first:index.timestamp(0),
    last:index.timestamp(index.count-1), ...index.metadata};
}

function sourceKey(index) {
  const m=index.metadata;
  return JSON.stringify([m.fingerprint.digest,m.modelRevision,m.simulation,m.scenario,m.event,
    m.clock,m.missingToken,m.columns.map(c=>[c.series,c.column,c.sourceUnit,c.datum,c.sourceAttribute]),
    index.count,index.timestamp(0),index.timestamp(index.count-1)]);
}

function resolveSource(id) {
  const record=sources.get(id);
  if (!record) throw new Error("Select an available simulation results source.");
  return record.index;
}

async function operation(id, name, data) {
  switch (name) {
    case "preview": return core.inspectCsv(data.file);
    case "package-preview": return core.inspectPackage(data.file);
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
        const index = name==="import-package"?await core.importPackage(data.file,options):await core.importCsv(data.file,data.config,options);
        controller.signal.throwIfAborted();
        const key=sourceKey(index);
        for (const record of sources.values()) if (record.key===key) return {...record.summary,reused:true};
        const sourceId=++revision;
        const filename=typeof data.file.name==="string" ? data.file.name.slice(0,256) : "Local results";
        const metadata=summary(index,sourceId,filename);
        sources.set(sourceId,{index,key,summary:metadata});
        return metadata;
      } finally {active=null;}
    }
    case "remove": return sources.delete(data.sourceId);
    case "frame": {
      const source=resolveSource(data.sourceId);
      if (!Array.isArray(data.keys) || data.keys.length>20000) throw new Error("Select a valid set of result series.");
      const time=data.time ?? source.timestamp(data.index);
      return {time,values:time===null ? null : source.frame(time,data.keys)};
    }
    case "series": return resolveSource(data.sourceId).seriesWindow(data.key,data.start,data.end);
    case "envelope": return resolveSource(data.sourceId).envelope(data.key,data.start,data.end);
    default: throw new Error("Unsupported simulation results operation.");
  }
}

self.addEventListener("message", ({data:message}) => {
  if (!message || !Number.isSafeInteger(message.id)) return;
  const {id,name,data}=message;
  if (name === "cancel") {
    if (active?.id === data?.requestId) active.controller.abort();
    return;
  }
  void operation(id,name,data||{}).then(value=>{
    const transfer=name==="series" ? [value.times.buffer,value.values.buffer] : [];
    self.postMessage({id,type:"result",value},transfer);
  },error=>self.postMessage({id,type:"error",message:error.name==="AbortError" ? "Import cancelled. Existing results are available." : error.message}));
});
