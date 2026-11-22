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
function csvPreview(rows,caption){
  const table=element("table"),outer=element("div");outer.className="table-wrap";
  table.createCaption().textContent=caption;
  const heading=table.createTHead().insertRow();
  for(const label of ["Record","Columns",...Array.from({length:6},(_,i)=>"Column "+(i+1))]){
    const th=element("th",label);th.scope="col";heading.append(th);
  }
  const body=table.createTBody();
  for(const item of rows){
    const row=body.insertRow();
    for(const value of [item.record,item.columnCount,...Array.from({length:6},(_,i)=>item.fields[i]??"")])row.insertCell().textContent=value;
  }
  outer.append(table);return outer;
}
let session=null;
const announceSources=()=>window.dispatchEvent(new Event("icm:simulation-sources-changed"));

function eventSources(select,sources){
  const existing=select.value,events=[...new Set(sources.map(source=>source.event))].sort((a,b)=>a.localeCompare(b));
  select.replaceChildren(option("All indexed events",""),...events.map(event=>option(event,event)));
  select.value=events.includes(existing)?existing:"";
  select.disabled=!events.length;
  return select.value?sources.filter(source=>source.event===select.value):sources;
}

function setSliderWindow(slider,range){
  slider.min=String(range.firstIndex);slider.max=String(range.lastIndex);slider.value=slider.min;
}

function mountResultWindow(container,onChange){
  const field=element("details"),grid=element("div"),actions=element("div"),note=element("p");
  grid.className="mapping-grid";actions.className="actions";note.setAttribute("role","status");
  function dateField(text){
    const label=element("label",text),input=element("input");
    input.type="datetime-local";input.step="0.001";label.append(input);grid.append(label);return input;
  }
  const start=dateField("Window start (project clock)"),end=dateField("Window end (project clock)");
  const apply=element("button","Apply sample window"),reset=element("button","Use entire event");
  apply.type=reset.type="button";
  actions.append(apply,reset);field.append(element("summary","Sample window"),grid,actions,note);container.replaceChildren(field);
  let source=null,active=null,generation=0;
  const inputValue=millis=>new Date(millis).toISOString().slice(0,-1);
  function setRange(range){
    active=range;start.value=inputValue(range.first);end.value=inputValue(range.last);
    note.textContent=`${range.count} recorded ${range.count===1?"sample":"samples"} · ${formatTime(range.first)} to ${formatTime(range.last)} (project clock).`;
  }
  function resetWindow(){
    ++generation;apply.disabled=!source;container.hidden=!source;
    if(source)setRange({count:source.count,firstIndex:0,lastIndex:source.count-1,first:source.first,last:source.last});
    else active=null;
    return active;
  }
  reset.onclick=()=>{const window=resetWindow();if(window)onChange(window);};
  apply.onclick=async()=>{
    if(!source||!start.value||!end.value){note.textContent="Choose a start and end on the project clock.";return;}
    const request=++generation;
    apply.disabled=true;
    try{
      const range=await session.range(source.sourceId,start.value,end.value);
      if(request!==generation)return;
      if(!range.count){note.textContent="No recorded samples in this window. The previous window remains active.";return;}
      setRange(range);onChange(range);
    }catch(error){if(request===generation)note.textContent=error.message;}
    finally{if(request===generation)apply.disabled=false;}
  };
  return {setSource(candidate){source=candidate;return resetWindow();},current:()=>active};
}

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
  const root=document.getElementById("tab-simulation-results");
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
      <div class="actions"><button type="button" id="hbAddResultMapping">Add mapped column</button><button type="submit" class="primary">Index simulation results</button><button type="button" id="hbExportResultMapping">Download CSV mapping</button><button type="button" id="hbCancelResult" hidden>Cancel import</button></div>
      <details id="hbResultPortable"><summary>Portable results package</summary>
        <p>Reopen a Hydra Bench package with its reviewed typed mappings, project clock and units. Check the declared model revision before indexing.</p>
        <label>Local results package<input type="file" name="portable" accept=".hbresults,application/octet-stream"></label>
        <label><input type="checkbox" name="fileBacked"> Read from the local package when needed</label>
        <p>File-backed access retains fewer samples in memory. Keep the selected file available while this tab is open.</p>
        <p id="hbResultPortableStatus" role="status"></p><button type="button" id="hbIndexPortable" disabled>Index portable results</button>
      </details>
      <progress id="hbResultProgress" max="100" hidden aria-label="Simulation import progress"></progress>
      <p id="hbResultImportStatus" role="status"></p>
    </form>
  </article>
  <article class="panel">
    <div class="panel-head"><h2>Review simulation samples</h2><p>Samples are held in this browser tab. To reopen them later, keep the original export or download the indexed samples as a portable package.</p></div>
    <div class="mapping-grid"><label>Filter indexed events<select id="hbResultEventFilter" aria-label="Filter indexed events"></select></label><label>Indexed source<select id="hbResultSource"></select></label><label>Result series<select id="hbResultSeries"></select></label></div>
    <p id="hbResultDetails"></p>
    <details id="hbCapacityResults" hidden><summary>Pipe full capacity table</summary>
      <p>Use the ICM maximum-results attribute Pipe full capacity (PFC) for this reviewed run. Provide one row per conduit, with the upstream node ID, link suffix and capacity.
        Include any native unit row or confirm the reported unit explicitly.</p>
      <div class="mapping-grid">
        <label>Local capacity CSV<input type="file" name="capacityFile" accept=".csv,text/csv"></label>
        <label>Capacity header record<input type="number" name="capacityHeader" min="1" max="20" step="1" value="1" required></label>
        <label>Upstream node ID column<input type="number" name="capacityUpstream" min="1" max="20001" step="1" value="1" required></label>
        <label>Conduit suffix column<input type="number" name="capacitySuffix" min="1" max="20001" step="1" value="2" required></label>
        <label>Full capacity column<input type="number" name="capacityValue" min="1" max="20001" step="1" value="3" required></label>
        <label>Full-capacity units<select name="capacityUnit" aria-label="Full-capacity units" required><option value="">Choose a unit</option><option>m³/s</option><option>L/s</option></select></label>
      </div>
      <label><input type="checkbox" name="capacityUnitsRow"> The next capacity record contains units</label>
      <label><input type="checkbox" name="capacityConfirmed"> The selected results and capacity use the same simulation, revision and scenario</label>
      <div id="hbCapacityPreview"></div><p id="hbCapacityStatus" role="status"></p>
      <progress id="hbCapacityProgress" max="100" hidden aria-label="Capacity import progress"></progress>
      <div class="actions"><button type="button" id="hbCapacityImport" disabled>Index capacity table</button>
        <button type="button" id="hbCapacityCancel" hidden>Cancel capacity import</button>
        <button type="button" id="hbCapacityRemove" disabled>Remove capacity table</button></div>
    </details>
    <div id="hbResultTransport" hidden>
      <div id="hbResultWindow"></div>
      <label>Sample position<input type="range" id="hbResultTime" value="0" min="0" max="0" step="1"></label>
      <div class="actions"><button type="button" id="hbResultBack">Previous sample</button><button type="button" id="hbResultPlay" aria-pressed="false">Play</button><button type="button" id="hbResultStep">Next sample</button>
      <label>Samples per second<select id="hbResultSpeed"><option>1</option><option selected>2</option><option>5</option></select></label>
      <button type="button" id="hbExportPortable">Download portable results</button><button type="button" id="hbRemoveResult">Remove indexed source</button></div>
      <p id="hbResultSample"></p><p id="hbResultEnvelope"></p>
    </div>
    <p id="hbResultReviewStatus" role="status"></p>
  </article>`;
  const $=id=>root.querySelector("#"+id), form=$("hbResultsImport"), controls=form.elements;
  const importer=$("hbResultImportStatus"), review=$("hbResultReviewStatus"), preview=$("hbResultPreview");
  const mappingBody=$("hbResultMappings").tBodies[0], add=$("hbAddResultMapping"), submit=form.querySelector('[type="submit"]');
  const cancel=$("hbCancelResult"), progress=$("hbResultProgress"), source=$("hbResultSource"), series=$("hbResultSeries"),eventFilter=$("hbResultEventFilter");
  const time=$("hbResultTime"), transport=$("hbResultTransport"), sample=$("hbResultSample"), envelope=$("hbResultEnvelope");
  const play=$("hbResultPlay"), back=$("hbResultBack"), step=$("hbResultStep"), remove=$("hbRemoveResult");
  const packageInput=controls.portable, packageStatus=$("hbResultPortableStatus"), indexPackage=$("hbIndexPortable"), exportPackage=$("hbExportPortable");
  const exportMapping=$("hbExportResultMapping");
  const capacityPanel=$("hbCapacityResults"),capacityFields=Object.fromEntries([...capacityPanel.querySelectorAll('[name]')].map(input=>[input.name,input]));
  const capacityStatus=$("hbCapacityStatus"),capacityImport=$("hbCapacityImport"),capacityCancel=$("hbCapacityCancel"),
    capacityRemove=$("hbCapacityRemove"),capacityProgress=$("hbCapacityProgress"),capacityPreview=$("hbCapacityPreview");
  const datasets=new Map(), mappings=[];
  let fileGeneration=0, packageGeneration=0, reviewedPackage=null, displayGeneration=0, envelopeGeneration=0, currentImport=null,
    playback=null, playbackGeneration=0, serial=0,preferredSource="",capacityGeneration=0,reviewedCapacity=null;
  const client=workerClient(()=>{datasets.clear();refreshSources();announceSources();review.textContent="The simulation worker stopped. Reimport the source to resume.";});
  session=Object.freeze({
    sources:()=>Array.from(datasets.values()),
    frame:(sourceId,index,keys)=>client.request("frame",{sourceId,index,keys}).result,
    frameAtTime:(sourceId,time,keys)=>client.request("frame",{sourceId,time,keys}).result,
    range:(sourceId,start,end)=>client.request("range",{sourceId,start,end}).result,
    seriesWindow:(sourceId,key,start,end)=>client.request("series",{sourceId,key,start,end}).result,
    capacities:(sourceId,keys)=>client.request("capacity-get",{sourceId,keys}).result,
    envelope:(sourceId,key,start,end)=>client.request("envelope",{sourceId,key,start,end}).result,
    envelopes:(sourceId,keys,start,end,progress,magnitude=false)=>client.request("envelopes",{sourceId,keys,start,end,magnitude},progress),
    cancelRequest:id=>client.cancel(id)
  });
  const sampleWindow=mountResultWindow($("hbResultWindow"),range=>{stop();setSliderWindow(time,range);void updateSeries();});

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
      preview.append(csvPreview(rows,"First records (six columns shown)"));
      note.textContent="Preview ready. Enter the record and column numbers from this export.";
    } catch(error) {if (generation===fileGeneration) note.textContent=error.message;}
  };

  packageInput.onchange=async()=>{
    const revision=++packageGeneration,file=packageInput.files[0];
    reviewedPackage=null;indexPackage.disabled=true;packageStatus.textContent="";importer.textContent="";
    if(!file)return;
    packageStatus.textContent="Validating the portable package header…";
    try{
      const info=await client.request("package-preview",{file}).result;
      if(revision!==packageGeneration)return;
      reviewedPackage=file;indexPackage.disabled=Boolean(currentImport);
      packageStatus.textContent=`${info.count} timestamps, ${info.columns.length} mapped series · ${info.simulation} · Revision ${info.modelRevision} · ${info.scenario} · ${info.event}`;
    }catch(error){if(revision===packageGeneration)packageStatus.textContent=error.message;}
  };
  indexPackage.onclick=()=>{
    if(reviewedPackage)void indexSource("import-package",{file:reviewedPackage,fileBacked:controls.fileBacked.checked});
  };

  function csvMapping(){
    const f=new FormData(form),kind=f.get("kind"),headerRecord=Number(f.get("header"));
    return {simulation:f.get("simulation"),modelRevision:f.get("modelRevision"),scenario:f.get("scenario"),event:f.get("event"),
      clock:f.get("clock"),clockConfirmed:controls.clockConfirmed.checked,temporalSupport:"instantaneous",headerRecord,
      timeColumn:Number(f.get("time"))-1,unitsRecord:controls.unitRow.checked?headerRecord+1:undefined,missingToken:f.get("missing"),
      columns:mappings.map(row=>({column:row.column.valueAsNumber-1,quantity:f.get("quantity"),unit:f.get("unit"),datum:f.get("datum"),
        sourceAttribute:f.get("attribute"),location:kind==="node"?"node":f.get("location"),
        asset:kind==="node"?{kind,id:row.id.value}:{kind,upstream:row.id.value,suffix:row.suffix.value,
          table:"hw_"+f.get("assetTable").replaceAll("-","_")}}))};
  }
  exportMapping.onclick=async()=>{
    if(currentImport||!form.reportValidity())return;
    const config=csvMapping();
    exportMapping.disabled=true;
    try{
      await client.request("validate-csv-mapping",{config}).result;
      downloadBlob("hydra-results-mapping.json",JSON.stringify(config,null,2)+"\n","application/json");
      importer.textContent="CSV mapping downloaded for the local portable-results tool.";
    }catch(error){importer.textContent=error.message;}
    finally{exportMapping.disabled=Boolean(currentImport);}
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    if(currentImport)return;
    await indexSource("import",{file:controls.file.files[0],config:csvMapping()});
  };
  async function indexSource(operation,data){
    if(currentImport)return;
    submit.disabled=true;controls.file.disabled=true;packageInput.disabled=true;controls.fileBacked.disabled=true;
    indexPackage.disabled=true;exportMapping.disabled=true;
    cancel.hidden=false;progress.hidden=false;progress.value=0;
    importer.textContent=operation==="import-package"?"Checking and indexing the portable samples locally…":
      "Indexing the selected result columns in a browser worker…";
    try {
      const task=client.request(operation,data,(loaded,total)=>{progress.value=100*loaded/total;});
      currentImport=task.id;refreshCapacityControls();
      const info=await task.result;
      if(!datasets.has(info.sourceId)||info.accessModeChanged){datasets.set(info.sourceId,info);announceSources();}
      eventFilter.value="";preferredSource=String(info.sourceId);
      refreshSources();
      importer.textContent=info.reused?"This result source and mapping are already indexed.":info.accessModeChanged?
        "Local access mode updated for this result source.":`${info.count} timestamps indexed for ${info.columns.length} result series.`;
    } catch(error) {importer.textContent=error.message;}
    finally {
      currentImport=null;submit.disabled=false;controls.file.disabled=false;packageInput.disabled=false;controls.fileBacked.disabled=false;
      indexPackage.disabled=!reviewedPackage;exportMapping.disabled=false;
      cancel.disabled=false;cancel.hidden=true;progress.hidden=true;
      refreshCapacityControls();
    }
  }
  cancel.onclick=()=>{if (currentImport){client.cancel(currentImport);cancel.disabled=true;importer.textContent="Cancelling import…";}};

  function selection() {
    const dataset=datasets.get(Number(source.value));
    return {dataset,column:dataset?.columns[Number(series.value)]};
  }
  function refreshCapacityControls(dataset=selection().dataset){
    capacityPanel.hidden=!dataset?.columns.some(column=>column.quantity==='flow'&&column.asset.table==='hw_conduit');
    capacityImport.disabled=Boolean(currentImport)||!reviewedCapacity||capacityPanel.hidden;
    capacityRemove.disabled=Boolean(currentImport)||!dataset?.capacity;
  }
  function updateCapacitySource(dataset){
    capacityFields.capacityConfirmed.checked=false;
    const info=dataset?.capacity;
    capacityStatus.textContent=info?`${info.count} conduits · ${info.filename} · ${info.fingerprint.algorithm} ${info.fingerprint.digest}`:"No capacity table attached to this run.";
    refreshCapacityControls(dataset);
  }
  capacityFields.capacityFile.onchange=async()=>{
    const requested=++capacityGeneration,file=capacityFields.capacityFile.files[0];
    reviewedCapacity=null;capacityPreview.replaceChildren();capacityFields.capacityConfirmed.checked=false;
    refreshCapacityControls();
    if(!file){updateCapacitySource(selection().dataset);return;}
    try{
      if(file.size>16*1024**2)throw new Error("Choose a capacity CSV up to 16 MiB.");
      const records=await client.request('preview',{file}).result;
      if(requested!==capacityGeneration)return;
      capacityPreview.append(csvPreview(records,'Capacity CSV preview'));
      reviewedCapacity=file;capacityStatus.textContent="Capacity preview ready. Review the typed link columns and units.";
      refreshCapacityControls();
    }catch(error){if(requested===capacityGeneration)capacityStatus.textContent=error.message;}
  };
  capacityImport.onclick=async()=>{
    const {dataset}=selection();if(!dataset||!reviewedCapacity||currentImport)return;
    if(!capacityFields.capacityConfirmed.checked){capacityStatus.textContent="Confirm this capacity table belongs to the selected results.";return;}
    if(!Object.values(capacityFields).every(field=>field.reportValidity()))return;
    const {capacityHeader,capacityUpstream,capacitySuffix,capacityValue,capacityUnit,capacityUnitsRow}=capacityFields;
    const headerRecord=capacityHeader.valueAsNumber,config={headerRecord,upstreamColumn:capacityUpstream.valueAsNumber-1,
      suffixColumn:capacitySuffix.valueAsNumber-1,capacityColumn:capacityValue.valueAsNumber-1,sourceUnit:capacityUnit.value,
      unitsRecord:capacityUnitsRow.checked?headerRecord+1:undefined};
    capacityProgress.hidden=false;capacityProgress.value=0;capacityCancel.hidden=false;
    capacityStatus.textContent="Indexing local conduit capacities…";
    const task=client.request('capacity-import',{file:reviewedCapacity,sourceId:dataset.sourceId,confirmed:true,config},
      (loaded,total)=>{capacityProgress.value=100*loaded/total;});
    currentImport=task.id;capacityFields.capacityFile.disabled=true;refreshCapacityControls();
    try{
      const updated=await task.result;
      datasets.set(updated.sourceId,updated);announceSources();
      if(selection().dataset===updated)updateCapacitySource(updated);
    }catch(error){capacityStatus.textContent=error.message;}
    finally{currentImport=null;capacityFields.capacityFile.disabled=false;capacityProgress.hidden=true;capacityCancel.hidden=true;refreshCapacityControls();}
  };
  capacityCancel.onclick=()=>{if(currentImport)client.cancel(currentImport);};
  capacityRemove.onclick=async()=>{
    const {dataset}=selection();if(!dataset?.capacity||currentImport)return;
    try{
      const updated=await client.request('capacity-remove',{sourceId:dataset.sourceId}).result;
      datasets.set(updated.sourceId,updated);announceSources();updateCapacitySource(selection().dataset);
    }catch(error){capacityStatus.textContent=error.message;}
  };
  function stop() {++playbackGeneration;if (playback!==null) clearTimeout(playback);playback=null;play.textContent="Play";play.setAttribute("aria-pressed","false");}
  function refreshSources() {
    const filtered=eventSources(eventFilter,Array.from(datasets.values()));
    source.replaceChildren(option("Select a results source",""),...filtered.map(d=>option(d.scenario+" · "+d.filename,d.sourceId)));
    source.value=preferredSource;if (!source.value) source.selectedIndex=0;
    updateSource();
  }
  function updateSource() {
    stop();review.textContent="";sample.textContent="";envelope.textContent="";displayGeneration++;envelopeGeneration++;
    const {dataset}=selection();
    updateCapacitySource(dataset);
    transport.hidden=!dataset;series.replaceChildren();
    const range=sampleWindow.setSource(dataset);
    const details=$("hbResultDetails");
    if (!dataset){details.textContent="Import a results CSV to review available samples.";return;}
    details.textContent=`${dataset.simulation} · Revision ${dataset.modelRevision} · ${dataset.event} · ${dataset.missingCount} missing mapped samples`;
    if(dataset.storageFormat==="hbresults-v1")details.textContent+=" · Portable package";
    if(dataset.accessMode==="file")details.textContent+=" · File-backed access";
    for (const [i,column] of dataset.columns.entries()) {
      const a=column.asset,id=a.kind==="node"?a.id:a.upstream+"."+a.suffix;
      series.add(option(`${id} · ${title(column.quantity)} · ${title(column.location)}`,i));
    }
    setSliderWindow(time,range);
    updateSeries();
  }
  async function updateFrame() {
    const {dataset,column}=selection();if (!dataset||!column) return;
    const generation=++displayGeneration,index=time.valueAsNumber;
    back.disabled=index<=Number(time.min);step.disabled=index>=Number(time.max);play.disabled=time.min===time.max;
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
      const window=sampleWindow.current(),r=await session.envelope(dataset.sourceId,column.series,window.first,window.last);
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
    if (time.value===time.max){time.value=time.min;void updateFrame();}
    play.textContent="Pause";play.setAttribute("aria-pressed","true");playback=schedule(++playbackGeneration);
  };
  back.onclick=()=>{stop();void stepBy(-1);};step.onclick=()=>{stop();void stepBy(1);};
  time.oninput=()=>{stop();void updateFrame();};
  source.onchange=()=>{preferredSource=source.value;updateSource();};
  series.onchange=()=>{stop();void updateSeries();};
  eventFilter.onchange=()=>refreshSources();
  remove.onclick=async()=>{
    const id=Number(source.value);stop();
    try {await client.request("remove",{sourceId:id}).result;datasets.delete(id);if(preferredSource===String(id))preferredSource="";refreshSources();announceSources();}
    catch(error){review.textContent=error.message;}
  };
  exportPackage.onclick=async()=>{
    const {dataset}=selection();if(!dataset)return;
    exportPackage.disabled=true;review.textContent="Preparing the portable package locally…";
    try{
      const blob=await client.request("export-package",{sourceId:dataset.sourceId}).result;
      downloadBlob("hydra-simulation-results.hbresults",blob);
      if(selection().dataset===dataset)review.textContent="Portable results package downloaded.";
    }catch(error){review.textContent=error.message;}
    finally{exportPackage.disabled=false;}
  };
  window.addEventListener("icm:route-changed",({detail})=>{if(detail.page!=="simulation-results") stop();});
  refreshSources();
  return root;
}

window.HydraResultsWorkspace={mount,mountResultWindow,eventSources,setSliderWindow,get session(){return session;}};
})();
