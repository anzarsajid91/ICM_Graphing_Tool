/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";

const quantities={node:["level","flow","flood-depth","flood-volume"],link:["flow","velocity","level","depth","total-head","surcharge-state"]};
const units={level:["m","mm"],depth:["m","mm"],"total-head":["m","mm"],flow:["m³/s","L/s"],
  velocity:["m/s","mm/s"],"flood-depth":["m","mm"],"flood-volume":["m³","L"],"surcharge-state":["1"]};
const formatTime=value=>value===null||value===undefined?"Unavailable":new Date(value).toISOString().slice(0,-1).replace("T"," ");
const formatValue=value=>value===null?"Missing":new Intl.NumberFormat(undefined,{maximumSignificantDigits:8}).format(value);
const title=value=>value[0].toUpperCase()+value.slice(1).replaceAll("-"," ");
const element=(tag,text)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;return result;};
const option=(label,value)=>new Option(label,value);
const selectOptions=(select,values)=>select.replaceChildren(...values.map(value=>option(title(value),value)));

function workerClient(onFailure) {
  let worker, serial=0;
  const pending=new Map();
  function open() {
    if (worker) return;
    const token=document.querySelector('meta[name="icm-build-sha"]')?.content||"local";
    if (!/^(?:[0-9a-f]{40}|local)$/.test(token)) throw new Error("Unexpected result build token.");
    worker = new Worker("assets/simulation-results-worker.js?v="+encodeURIComponent(token));
    worker.onmessage=({data:message})=>{
      const request=pending.get(message.id);
      if (!request) return;
      if (message.type==="progress") {request.progress?.(message.loaded,message.total);return;}
      pending.delete(message.id);
      if (message.type==="result") request.resolve(message.value);
      else request.reject(new Error(message.message));
    };
    worker.onerror=()=>{
      const error=new Error("Simulation worker stopped. Import result files again to resume.");
      worker.terminate();worker=null;
      for (const request of pending.values()) request.reject(error);
      pending.clear();onFailure();
    };
  }
  return {request(name,data,progress){
    open();
    const id=++serial;
    const result=new Promise((resolve,reject)=>{pending.set(id,{resolve,reject,progress});worker.postMessage({id,name,data});});
    return {id,result};
  },cancel(requestId){worker?.postMessage({id:++serial,name:"cancel",data:{requestId}});}};
}

function mount() {
  const root=element("section");root.id="tab-simulation-results";root.className="tab-panel";root.hidden=true;
  root.innerHTML=`<article class="panel">
    <div class="panel-head"><h2>Import simulation results</h2><p>In InfoWorks ICM, export one object and attribute per CSV. Select the Results timestep, include headers and retain the units. Choose columns for the assets under review.</p></div>
    <form id="hbResultsImport">
      <label>Local results CSV<input type="file" name="file" accept=".csv,text/csv" required></label>
      <p id="hbResultPreviewStatus" role="status"></p><div id="hbResultPreview"></div>
      <div class="mapping-grid">
        <label>Simulation ID<input name="simulation" maxlength="128" required></label>
        <label>Model revision<input name="modelRevision" maxlength="128" required></label>
        <label>Scenario<input name="scenario" maxlength="128" required></label>
        <label>Event<input name="event" maxlength="128" required></label>
        <label>Clock format<select name="clock"><option value="iso">YYYY-MM-DD HH:mm:ss</option><option value="dmy">DD/MM/YYYY HH:mm:ss</option></select></label>
        <label>Header record<input type="number" name="header" value="1" min="1" max="20" step="1" required></label>
        <label>Time column number<input type="number" name="time" value="1" min="1" max="20001" step="1" required></label>
        <label>Optional missing-value token<input name="missing" maxlength="32" placeholder="#N/A"></label>
        <label>Asset type<select name="kind"><option value="node">Node</option><option value="link">Link</option></select></label>
        <label id="hbResultAssetTable">Link table<select name="assetTable"></select></label>
        <label id="hbResultLocation">Link end<select name="location"><option value="upstream">Upstream</option><option value="downstream">Downstream</option></select></label>
        <label>Result quantity<select name="quantity"></select></label>
        <label>Source unit<select name="unit"></select></label>
        <label id="hbResultDatum">Vertical datum<input name="datum" maxlength="128"></label>
        <label>Source result attribute<input name="attribute" maxlength="128" required></label>
      </div>
      <p><label><input type="checkbox" name="unitRow"> The next record contains units</label></p>
      <p><label><input type="checkbox" name="clockConfirmed" required> The file contains instantaneous samples on the confirmed project clock</label></p>
      <div class="table-wrap"><table id="hbResultMappings"><caption>Asset column mappings</caption><thead><tr><th scope="col">CSV column number</th><th scope="col">Node or upstream ID</th><th scope="col">Link suffix</th><th scope="col">Action</th></tr></thead><tbody></tbody></table></div>
      <div class="actions"><button type="button" id="hbAddResultMapping">Add mapped column</button><button type="submit" class="primary">Index simulation results</button><button type="button" id="hbCancelResult" hidden>Cancel import</button></div>
      <progress id="hbResultProgress" max="100" hidden aria-label="Simulation import progress"></progress>
      <p id="hbResultImportStatus" role="status"></p>
    </form>
  </article>
  <article class="panel">
    <div class="panel-head"><h2>Review simulation samples</h2><p>Samples are held in this browser tab. Save the original export to reimport later.</p></div>
    <div class="mapping-grid"><label>Indexed source<select id="hbResultSource"></select></label><label>Result series<select id="hbResultSeries"></select></label></div>
    <p id="hbResultDetails"></p>
    <div id="hbResultTransport" hidden>
      <label>Sample position<input type="range" id="hbResultTime" value="0" min="0" max="0" step="1"></label>
      <div class="actions"><button type="button" id="hbResultBack">Previous sample</button><button type="button" id="hbResultPlay" aria-pressed="false">Play</button><button type="button" id="hbResultStep">Next sample</button>
      <label>Samples per second<select id="hbResultSpeed"><option>1</option><option selected>2</option><option>5</option></select></label>
      <button type="button" id="hbRemoveResult">Remove indexed source</button></div>
      <p id="hbResultSample"></p><p id="hbResultEnvelope"></p>
    </div>
    <p id="hbResultReviewStatus" role="status"></p>
  </article>`;
  document.querySelector("main.shell").append(root);
  const $=id=>root.querySelector("#"+id), form=$("hbResultsImport"), controls=form.elements;
  const importer=$("hbResultImportStatus"), review=$("hbResultReviewStatus"), preview=$("hbResultPreview");
  const mappingBody=$("hbResultMappings").tBodies[0], add=$("hbAddResultMapping"), submit=form.querySelector('[type="submit"]');
  const cancel=$("hbCancelResult"), progress=$("hbResultProgress"), source=$("hbResultSource"), series=$("hbResultSeries");
  const time=$("hbResultTime"), transport=$("hbResultTransport"), sample=$("hbResultSample"), envelope=$("hbResultEnvelope");
  const play=$("hbResultPlay"), back=$("hbResultBack"), step=$("hbResultStep"), remove=$("hbRemoveResult");
  const datasets=new Map(), mappings=[];
  let fileGeneration=0, displayGeneration=0, envelopeGeneration=0, currentImport=null, playback=null, playbackGeneration=0, serial=0;
  const client=workerClient(()=>{datasets.clear();refreshSources();review.textContent="The simulation worker stopped. Reimport the source to resume.";});

  function newMapping() {
    const row=mappingBody.insertRow(), label="Mapping "+(++serial);
    const column=element("input"), id=element("input"), suffix=element("input"), button=element("button","Remove");
    column.type="number";column.min=1;column.max=20001;column.step=1;
    column.required=true;id.required=true;id.maxLength=128;suffix.maxLength=16;
    for (const [input,name] of [[column,"CSV column number"],[id,"Node or upstream ID"],[suffix,"Link suffix"],[button,"Remove"]]){
      input.setAttribute("aria-label",label+" "+name);row.insertCell().append(input);
    }
    const mapping={column,id,suffix,button};mappings.push(mapping);
    button.type="button";
    button.onclick=()=>{mappings.splice(mappings.indexOf(mapping),1);row.remove();syncMappings();add.focus();};
    syncMappings();return column;
  }
  function syncMappings() {
    const link=controls.kind.value==="link";
    for (const row of mappings){row.suffix.disabled=!link;row.suffix.required=link;row.button.disabled=mappings.length===1;}
    add.disabled=mappings.length>=100;
  }
  add.onclick=()=>newMapping().focus();
  selectOptions(controls.assetTable,["conduit","pump","weir","sluice","orifice","flap-valve","screen","user-control","outlet"]);
  function quantityChanged() {
    const q=controls.quantity.value, datum=["level","total-head"].includes(q);
    controls.unit.replaceChildren(...units[q].map(value=>option(value,value)));
    $("hbResultDatum").hidden=!datum;controls.datum.required=datum;
  }
  function kindChanged() {
    const kind=controls.kind.value;
    $("hbResultAssetTable").hidden=kind!=="link";$("hbResultLocation").hidden=kind!=="link";
    selectOptions(controls.quantity,quantities[kind]);quantityChanged();syncMappings();
  }
  controls.kind.onchange=kindChanged;controls.quantity.onchange=quantityChanged;
  newMapping();kindChanged();

  controls.file.onchange=async()=>{
    const generation=++fileGeneration, file=controls.file.files[0], note=$("hbResultPreviewStatus");
    preview.replaceChildren();note.textContent="";importer.textContent="";
    if (!file) return;
    try {
      const rows=await client.request("preview",{file}).result;
      if (generation!==fileGeneration) return;
      const table=element("table"), outer=element("div");outer.className="table-wrap";
      table.createCaption().textContent="First records (six columns shown)";
      const heading=table.createTHead().insertRow();
      for (const text of ["Record","Columns",...Array.from({length:6},(_,i)=>"Column "+(i+1))]){
        const th=element("th",text);th.scope="col";heading.append(th);
      }
      const body=table.createTBody();
      for (const item of rows){
        const row=body.insertRow();
        for (const value of [item.record,item.columnCount,...Array.from({length:6},(_,i)=>item.fields[i]??"")]) row.insertCell().textContent=value;
      }
      outer.append(table);preview.append(outer);note.textContent="Preview ready. Enter the record and column numbers from this export.";
    } catch(error) {if (generation===fileGeneration) note.textContent=error.message;}
  };

  form.onsubmit=async event=>{
    event.preventDefault();
    if (currentImport) return;
    const file=controls.file.files[0], f=new FormData(form), kind=f.get("kind"), headerRecord=Number(f.get("header"));
    const config={simulation:f.get("simulation"),modelRevision:f.get("modelRevision"),scenario:f.get("scenario"),event:f.get("event"),
      clock:f.get("clock"),clockConfirmed:controls.clockConfirmed.checked,temporalSupport:"instantaneous",headerRecord,
      timeColumn:Number(f.get("time"))-1,unitsRecord:controls.unitRow.checked?headerRecord+1:undefined,missingToken:f.get("missing"),
      columns:mappings.map(row=>({column:row.column.valueAsNumber-1,quantity:f.get("quantity"),unit:f.get("unit"),datum:f.get("datum"),
        sourceAttribute:f.get("attribute"),location:kind==="node"?"node":f.get("location"),
        asset:kind==="node"?{kind,id:row.id.value}:{kind,upstream:row.id.value,suffix:row.suffix.value,
          table:"hw_"+f.get("assetTable").replaceAll("-","_")}}))};
    submit.disabled=true;controls.file.disabled=true;cancel.hidden=false;progress.hidden=false;progress.value=0;
    importer.textContent="Indexing the selected result columns in a browser worker…";
    try {
      const task=client.request("import",{file,config},(loaded,total)=>{progress.value=100*loaded/total;});
      currentImport=task.id;
      const info=await task.result;
      datasets.set(info.sourceId,info);refreshSources(info.sourceId);
      importer.textContent=info.reused?"This result source and mapping are already indexed.":`${info.count} timestamps indexed for ${info.columns.length} result series.`;
    } catch(error) {importer.textContent=error.message;}
    finally {submit.disabled=false;controls.file.disabled=false;cancel.disabled=false;cancel.hidden=true;progress.hidden=true;currentImport=null;}
  };
  cancel.onclick=()=>{if (currentImport){client.cancel(currentImport);cancel.disabled=true;importer.textContent="Cancelling import…";}};

  function selection() {
    const dataset=datasets.get(Number(source.value));
    return {dataset,column:dataset?.columns[Number(series.value)]};
  }
  function stop() {++playbackGeneration;if (playback!==null) clearTimeout(playback);playback=null;play.textContent="Play";play.setAttribute("aria-pressed","false");}
  function refreshSources(wanted=source.value) {
    source.replaceChildren(option("Select a results source",""),...Array.from(datasets.values(),d=>option(d.scenario+" · "+d.filename,d.sourceId)));
    source.value=String(wanted);if (!source.value) source.selectedIndex=0;
    updateSource();
  }
  function updateSource() {
    stop();review.textContent="";sample.textContent="";envelope.textContent="";displayGeneration++;envelopeGeneration++;
    const {dataset}=selection();
    transport.hidden=!dataset;series.replaceChildren();
    const details=$("hbResultDetails");
    if (!dataset){details.textContent="Import a results CSV to review available samples.";return;}
    details.textContent=`${dataset.simulation} · Revision ${dataset.modelRevision} · ${dataset.event} · ${dataset.missingCount} missing mapped samples`;
    for (const [i,column] of dataset.columns.entries()) {
      const a=column.asset,id=a.kind==="node"?a.id:a.upstream+"."+a.suffix;
      series.add(option(`${id} · ${title(column.quantity)} · ${title(column.location)}`,i));
    }
    time.max=String(dataset.count-1);time.value="0";
    updateSeries();
  }
  async function updateFrame() {
    const {dataset,column}=selection();if (!dataset||!column) return;
    const generation=++displayGeneration,index=time.valueAsNumber;
    back.disabled=index===0;step.disabled=index>=dataset.count-1;play.disabled=dataset.count<2;
    try {
      const result=await client.request("frame",{sourceId:dataset.sourceId,index,keys:[column.series]}).result;
      if (generation!==displayGeneration) return;
      sample.textContent=`${formatTime(result.time)} (project clock) · ${formatValue(result.values[0])} ${column.unit}${column.datum?" · "+column.datum:""}`;
    } catch(error) {if(generation===displayGeneration) review.textContent=error.message;}
  }
  async function updateSeries() {
    const {dataset,column}=selection();if (!dataset||!column) return;
    const generation=++envelopeGeneration;
    envelope.textContent="";void updateFrame();
    try {
      const r=await client.request("envelope",{sourceId:dataset.sourceId,key:column.series,start:dataset.first,end:dataset.last}).result;
      if(generation!==envelopeGeneration) return;
      envelope.textContent=r.valid?`Independent series extrema: minimum ${formatValue(r.min)} ${column.unit} at ${formatTime(r.minTime)}. Maximum ${formatValue(r.max)} ${column.unit} at ${formatTime(r.maxTime)}. ${r.valid} of ${r.samples} samples valid.`:"No valid samples for this result series.";
    } catch(error) {if(generation===envelopeGeneration) review.textContent=error.message;}
  }
  function stepBy(delta) {time.value=String(time.valueAsNumber+delta);return updateFrame();}
  function schedule(generation) {return setTimeout(()=>void tick(generation),1000/Number($("hbResultSpeed").value));}
  async function tick(generation) {
    if (generation!==playbackGeneration) return;
    await stepBy(1);
    if (generation!==playbackGeneration) return;
    if (time.value===time.max){stop();return;}
    playback=schedule(generation);
  }
  play.onclick=()=>{
    if (playback!==null){stop();return;}
    if (time.value===time.max){time.value="0";void updateFrame();}
    play.textContent="Pause";play.setAttribute("aria-pressed","true");playback=schedule(++playbackGeneration);
  };
  back.onclick=()=>{stop();void stepBy(-1);};step.onclick=()=>{stop();void stepBy(1);};
  time.oninput=()=>{stop();void updateFrame();};source.onchange=updateSource;series.onchange=()=>{stop();void updateSeries();};
  remove.onclick=async()=>{
    const id=Number(source.value);stop();
    try {await client.request("remove",{sourceId:id}).result;datasets.delete(id);refreshSources();}
    catch(error){review.textContent=error.message;}
  };
  window.addEventListener("icm:route-changed",({detail})=>{if(detail.page!=="simulation-results") stop();});
  refreshSources();
  return root;
}

window.HydraResultsWorkspace={mount};
})();
