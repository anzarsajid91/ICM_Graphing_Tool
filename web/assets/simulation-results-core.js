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
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", hashes);
  return {algorithm:"sha256-of-ordered-1MiB-sha256-blocks-v1", digest:Array.from(new Uint8Array(bytes), byte =>
    byte.toString(16).padStart(2,"0")).join(""), size:blob.size};
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

function makeIndex(chunks, rowsPerChunk, count, metadata) {
  const positions = new Map(metadata.columns.map((column,index)=>[column.series,index]));
  const at = index => chunks[Math.floor(index/rowsPerChunk)].time[index%rowsPerChunk];
  const valueAt = (index,column) => chunks[Math.floor(index/rowsPerChunk)].values[column*rowsPerChunk+index%rowsPerChunk];
  function lowerBound(clock) {
    let low = 0, high = count;
    while (low < high) {
      const pivot = (low + high) >>> 1;
      if (at(pivot) < clock) low = pivot+1;
      else high = pivot;
    }
    return low;
  }
  function bounds(start,end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start>end) throw new Error("Choose a valid result window.");
    const upper = lowerBound(end);
    return [lowerBound(start),upper+(upper<count&&at(upper)===end ? 1 : 0)];
  }
  return {metadata, count,
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

async function importCsv(blob, config, options = {}) {
  const {headerRecord,timeColumn,unitsRecord,columns,parseTime,missing,contract} = compile(config);
  const bytesPerRow = 8 * (columns.length + 1);
  const rowsPerChunk = Math.max(1, Math.min(4096, Math.floor(BLOCK_BYTES / bytesPerRow)));
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

globalThis.HydraSimulationResults=Object.freeze({inspectCsv,importCsv,assetKey});
})();
