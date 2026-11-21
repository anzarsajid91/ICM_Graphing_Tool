/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";

const number = (key, label, min, max, step = "any") => ({key, label, type:"number", min, max, step});
const pipeFields = [
  number("stage", "Stage", 1, 100, 1), number("diameter_m", "Internal diameter (m)", .001, 20),
  number("length_m", "Length (m)", .001, 1e7), number("darcy_factor", "Darcy friction factor", .0001, 1),
  number("minor_k", "Fittings K", 0, 100000), number("entrance_k", "Entrance K", 0, 100000),
  number("exit_k", "Exit K", 0, 100000)
];
const catchmentFields = [
  {key:"id", label:"Catchment ID", type:"text", maxLength:128},
  {key:"classification", label:"Reviewed class", options:[
    ["","Review classification"], ["combined","Combined"], ["partially-separate","Partially separate"],
    ["qualifying-separate","Qualifying separate foul"], ["surface-water","Surface water"], ["excluded","Excluded"]
  ]},
  number("population", "Population", 0, 1e9), number("domestic_l_head_day", "Domestic (L/head/day)", 0, 1e6),
  number("infiltration_l_day", "Infiltration (L/day)", 0, 1e15), number("trade_l_day", "Trade (L/day)", 0, 1e15),
  {key:"eligibility_confirmed", label:"Evidence confirmed", type:"checkbox", required:false},
  {key:"evidence", label:"Evidence or exclusion reason", type:"text", maxLength:2000, required:false},
];
const pumpFields = [number("flow", "Flow (m³/s)", 0, 1000), number("head", "Head (m)", 0, 100000)];
const eaReference = "EA England storm overflow permitting guidance, Formula A section, checked 2026-11-21";
const pumpReference = "U.S. Department of Energy, Improving Pumping System Performance, 2nd edition";
const format = value => value === null ? "Unavailable" : typeof value === "number"
  ? new Intl.NumberFormat(undefined,{maximumSignificantDigits:9}).format(value) : String(value);
function element(tag,text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function action(label,handler) {
  const button = element("button",label);
  button.type = "button";
  button.onclick = handler;
  return button;
}
function labelledControl(spec, value, rowTitle) {
  const label = element("label",spec.label);
  const control = element(spec.options ? "select" : "input");
  control.name = spec.key;
  if (rowTitle) control.setAttribute("aria-label",rowTitle+" "+spec.label);
  if (spec.options) {
    for (const [key,name] of spec.options) control.add(new Option(name,key));
  } else {
    control.type = spec.type;
    for (const key of ["min","max","step","maxLength"]) if (spec[key] !== undefined) control[key] = spec[key];
  }
  control.required = spec.required ?? true;
  if (control.type === "checkbox") control.checked = Boolean(value);
  else if (value !== undefined) control.value = String(value);
  label.append(control);
  return {label,control};
}
function read(control) {
  if (control.type === "number") return control.valueAsNumber;
  if (control.type === "checkbox") return control.checked;
  return control.value.trim();
}
function table(headers, rows, caption) {
  const wrapper = element("div");
  wrapper.className = "table-wrap";
  const output = element("table");
  if (caption) output.createCaption().textContent = caption;
  const heading = output.createTHead().insertRow();
  for (const header of headers) {
    const cell = element("th",header);
    cell.scope = "col";
    heading.append(cell);
  }
  const body = output.createTBody();
  for (const row of rows) {
    const line = body.insertRow();
    for (const value of row) line.insertCell().textContent = format(value);
  }
  wrapper.append(output);
  return wrapper;
}
function fields(specs, initial = {}) {
  const group = element("div");
  group.className = "mapping-grid";
  const controls = Object.fromEntries(specs.map(spec => {
    const {label,control} = labelledControl(spec,initial[spec.key]);
    group.append(label);
    return [spec.key,control];
  }));
  return {group, controls, values: () => Object.fromEntries(Object.entries(controls).map(([key,input]) => [key,read(input)]))};
}
function editableRows(title, specs, defaults, configure, minimum = 1) {
  const wrapper = element("div");
  wrapper.className = "table-wrap";
  const grid = element("table");
  grid.createCaption().textContent = title;
  const heading = grid.createTHead().insertRow();
  for (const label of [...specs.map(spec => spec.label),"Action"]) {
    const cell = element("th",label);
    cell.scope = "col";
    heading.append(cell);
  }
  const body = grid.createTBody(), records = new Map(), removeButtons = new Map();
  let serial = 0;
  function add(initial = {}, focus = false) {
    if (records.size >= 100) return;
    const row = body.insertRow(), name = title+" row "+(++serial);
    const controls = Object.fromEntries(specs.map(spec => {
      const {control} = labelledControl(spec,initial[spec.key],name);
      row.insertCell().append(control);
      return [spec.key,control];
    }));
    records.set(row,controls);
    configure?.(controls);
    const remove = action("Remove",() => {
      if (records.size <= minimum) return;
      records.delete(row);removeButtons.delete(row);row.remove();
      updateButtons();
      addButton.focus();
      wrapper.dispatchEvent(new Event("input",{bubbles:true}));
    });
    remove.setAttribute("aria-label","Remove "+name.toLowerCase());
    row.insertCell().append(remove);removeButtons.set(row,remove);updateButtons();
    if (focus) Object.values(controls)[0].focus();
  }
  function updateButtons(){
    addButton.disabled = records.size >= 100;
    for (const button of removeButtons.values()) button.disabled = records.size <= minimum;
  }
  const addButton = action("Add row",() => {
    add({},true);
    wrapper.dispatchEvent(new Event("input",{bubbles:true}));
  });
  wrapper.append(grid,addButton);
  for (const row of defaults) add(row);
  return {wrapper,replace(rows){
    body.replaceChildren();records.clear();removeButtons.clear();serial=0;
    for(const row of rows)add(row);
    wrapper.dispatchEvent(new Event("input",{bubbles:true}));
  }, values: () => [...records.values()].map(controls =>
    Object.fromEntries(Object.entries(controls).map(([key,control]) => [key,read(control)])))};
}
function panel(id,title,description) {
  const root = element("section");
  root.id = id;root.className = "tab-panel";root.hidden = true;
  const article = element("article");article.className = "panel";
  const intro = element("div");intro.className = "panel-head";
  intro.append(element("h2",title),element("p",description));
  article.append(intro);root.append(article);
  document.querySelector("main.shell").append(root);
  return article;
}
function results(article,form,calculate) {
  const actions = element("div");actions.className = "actions";
  const submit = element("button","Calculate");submit.type = "submit";submit.className = "primary";
  const status = element("p");status.setAttribute("role","status");
  const content = element("div");
  let generation = 0, downloadable = null;
  const save = action("Download calculation CSV",() => {
    if (!downloadable) return;
    const csv = downloadable.rows.map(row=>row.map(value=>ICMSafeCSV.cell(value ?? "")).join(",")).join("\r\n");
    downloadBlob(downloadable.filename,csv,"text/csv");
  });
  save.disabled = true;
  actions.append(submit,save);form.append(actions);article.append(form,status,content);
  function invalidate() {
    generation++;downloadable = null;save.disabled = true;
    if (content.childNodes.length || status.textContent) status.textContent = "Inputs changed. Calculate to refresh.";
    content.replaceChildren();
  }
  form.addEventListener("input",invalidate);
  form.addEventListener("change",invalidate);
  form.addEventListener("submit",async event => {
    event.preventDefault();
    const id = ++generation;
    submit.disabled = true;save.disabled = true;content.replaceChildren();downloadable = null;
    status.textContent = "Calculating in the local worker…";
    try {
      const result = await calculate();
      if (id !== generation) return;
      content.replaceChildren(...result.content);
      downloadable = {filename:result.filename, rows:[["Build",buildToken],...result.rows]};
      save.disabled = false;status.textContent = result.summary;
    } catch(error) {
      if (id === generation) status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  return invalidate;
}
function chart(series,xLabel="Flow (m³/s)",yLabel="Head (m)") {
  const width=720,height=250,left=75,right=width-18,top=16,bottom=height-42;
  const bounds=series.flatMap(s=>s.points);
  const maxFlow=Math.max(1e-12,...bounds.map(p=>p[0]));
  const low=Math.min(0,...bounds.map(p=>p[1])),high=Math.max(low+1,...bounds.map(p=>p[1]));
  const x=q=>left+(right-left)*q/maxFlow,y=h=>bottom-(bottom-top)*(h-low)/(high-low);
  const svg=(tag,attrs,text)=>{
    const node=document.createElementNS("http://www.w3.org/2000/svg",tag);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
    if (text!==undefined) node.textContent=text;
    return node;
  };
  const root=svg("svg",{viewBox:"0 0 "+width+" "+height,role:"img","aria-label":series.map(s=>s.label).join(" and "),width:"100%"});
  for (let i=0;i<=4;i++) {
    const u=maxFlow*i/4,v=low+(high-low)*i/4;
    root.append(svg("path",{d:"M"+left+" "+y(v)+"H"+right+" M"+x(u)+" "+top+"V"+bottom,stroke:"#dbe2e7"}),
      svg("text",{x:left-7,y:y(v)+4,"text-anchor":"end","font-size":11},format(v)),
      svg("text",{x:x(u),y:bottom+17,"text-anchor":"middle","font-size":11},format(u)));
  }
  root.append(svg("text",{x:left,y:height-5,"font-size":11},xLabel),
    svg("text",{x:8,y:height-20,"font-size":11},yLabel));
  for (const s of series) {
    root.append(svg("polyline",{points:s.points.map(([q,h])=>x(q)+","+y(h)).join(" "),
      stroke:s.color,"stroke-width":2.5,fill:"none"}));
    if (s.markers) for (const [q,h] of s.points) root.append(svg("circle",{cx:x(q),cy:y(h),r:3.5,fill:s.color}));
  }
  const summary=element("figure");
  summary.append(root,element("figcaption",series.map(s=>s.label).join(" · ")));
  return summary;
}
function systemInputs() {
  const settings=fields([number("static_head_m","Static head (m)",-100000,100000),
    number("flow_m3_s","Duty flow (m³/s)",0,1000),number("curve_max_m3_s","Maximum curve flow (m³/s)",1e-9,1000)]);
  const pipes=editableRows("Pipe branches",pipeFields,[{stage:1,minor_k:0,entrance_k:0,exit_k:0}]);
  return {settings,pipes,stages:()=>{
    const stages=[];
    for (const {stage,...pipe} of pipes.values()) {
      if (!Number.isInteger(stage)) throw new Error("Enter a whole stage number.");
      (stages[stage-1] ??= []).push(pipe);
    }
    if (Object.keys(stages).length !== stages.length) throw new Error("Number stages consecutively from 1.");
    return stages;
  }};
}
function configureCatchment(controls) {
  const update=()=>{
    const classification=controls.classification.value;
    const excluded=["surface-water","excluded"].includes(classification);
    const separate=classification==="qualifying-separate";
    for (const key of ["population","domestic_l_head_day","infiltration_l_day","trade_l_day"]) controls[key].disabled=excluded;
    controls.eligibility_confirmed.disabled=!separate;
    controls.eligibility_confirmed.required=separate;
    if (!separate) controls.eligibility_confirmed.checked=false;
    controls.evidence.required=excluded||separate;
  };
  controls.classification.addEventListener("change",update);
  update();
}
function mountCatchmentImport(article,form,catchments,worker) {
  const definitions=[["id","Catchment ID","subcatchment_id"],["population","Reviewed population","population"],
    ["domestic_l_head_day","Reviewed domestic allowance (L/head/day)",null],
    ["infiltration_l_day","Reviewed infiltration (L/day)",null],["trade_l_day","Reviewed trade (L/day)",null]];
  const actionbar=element("div");actionbar.className="actions";
  const notice=element("p");
  const dialog=element("dialog"),heading=element("h3","Review catchment CSV");
  heading.id="hbCatchmentImportTitle";dialog.setAttribute("aria-labelledby",heading.id);
  const upload=element("input");upload.type="file";upload.accept=".csv,text/csv";
  const label=element("label","Catchment CSV");label.append(upload);
  const description=element("p","Choose a native ICM subcatchment table or a reviewed catchment CSV. Imported rows replace the draft only when applied.");
  const message=element("p");message.setAttribute("role","status");
  const content=element("div"),controls=element("div");controls.className="actions";
  const apply=action("Apply mapped rows",()=>applyRows());
  const cancel=action("Cancel",()=>dialog.close());
  controls.append(cancel,apply);dialog.append(heading,description,label,message,content,controls);
  article.append(dialog);
  let source=null,staged=null,revision=0,mappings={},confirmed=null;
  const open=action("Import catchment CSV",()=>dialog.showModal());
  actionbar.append(open);form.append(actionbar,notice);
  apply.disabled=true;
  function reset(){
    staged=null;content.replaceChildren();mappings={};confirmed=null;apply.disabled=true;
  }
  dialog.addEventListener("close",()=>{
    revision++;reset();upload.value="";message.textContent="";
  });
  upload.addEventListener("change",async()=>{
    const generation=++revision,file=upload.files[0];
    reset();if(!file)return;
    message.textContent="Validating imported rows…";
    try{
      if(file.size>1024*1024)throw new Error("Choose a catchment CSV up to 1 MiB.");
      const bytes=await file.arrayBuffer();
      let text;
      try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
      catch{text=new TextDecoder("windows-1252").decode(bytes);}
      const [data,digest]=await Promise.all([worker("preview_design_catchments",{text}),
        globalThis.crypto.subtle.digest("SHA-256",bytes)]);
      if(generation!==revision)return;
      const fingerprint=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
      staged={data,filename:file.name,fingerprint};
      const options=[["","Enter manually"],...data.header.map((field,i)=>
        [String(i),(field||"Column "+(i+1))+(data.units?.[i]?" ("+data.units[i]+")":"")])];
      const fields=element("div");fields.className="mapping-grid";
      for(const [key,title,suggestion] of definitions){
        const start=suggestion?data.header.findIndex(field=>field.toLowerCase()===suggestion):-1;
        const entry=labelledControl({key,label:title,options,required:key==="id"},start<0?"":start);
        mappings[key]=entry.control;fields.append(entry.label);
      }
      const check=labelledControl({key:"reviewBasis",label:"I checked mapped units and reviewed daily allowances",type:"checkbox"});
      confirmed=check.control;
      content.append(fields,element("p","Blank and inherited values require explicit input. Model base flow and nominal trade flow need a separate review before they can be used as daily allowances."),
        check.label);
      message.textContent=data.rows.length+" catchment row(s) available.";
      apply.disabled=false;
    }catch(error){if(generation===revision)message.textContent=error.message;}
  });
  function unitFactor(key,unit){
    const token=String(unit||"").toLowerCase().replace(/\s+/g,"").replaceAll("³","3")
      .replaceAll("litres","l").replaceAll("liters","l").replaceAll("day","d");
    if(!token||key==="id")return 1;
    if(key==="population")return ["number","person","persons","people","no.","-"].includes(token)?1:null;
    if(key==="domestic_l_head_day")return ["l/head/d","l/person/d","l/capita/d","l/(head*d)"].includes(token)?1:null;
    return new Map([["l/d",1],["l/s",86400],["m3/d",1000],["m3/s",86400000]]).get(token)??null;
  }
  function applyRows(){
    if(!staged)return;
    if(mappings.id.value===""){message.textContent="Select the catchment ID column.";mappings.id.focus();return;}
    if(!confirmed.checked){message.textContent="Confirm the units and allowance basis before applying.";confirmed.focus();return;}
    const choices=Object.fromEntries(definitions.map(([key])=>[key,mappings[key].value===""?null:Number(mappings[key].value)]));
    const chosen=Object.values(choices).filter(i=>i!==null);
    if(new Set(chosen).size!==chosen.length){message.textContent="Select a distinct source column for each mapped field.";return;}
    const {data,filename,fingerprint}=staged;
    const scales=Object.fromEntries(definitions.map(([key])=>[key,unitFactor(key,data.units?.[choices[key]])]));
    const unsupported=definitions.find(([key])=>scales[key]===null);
    if(unsupported){message.textContent="The declared source unit is unsupported for "+unsupported[1]+". Enter that allowance manually after review.";return;}
    let missing=0;
    const rows=data.rows.map(({cells})=>{
      const result={classification:""};
      for(const [key,i] of Object.entries(choices)){
        const raw=String(i===null?"":cells[i]).trim();
        if(key==="id"){
          result.id=raw;
          continue;
        }
        if(i!==null&&/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)&&Number.isFinite(Number(raw)*scales[key]))result[key]=Number(raw)*scales[key];
        else missing++;
      }
      return result;
    });
    if(rows.some(row=>!row.id||row.id.length>128)){
      message.textContent="Each imported row needs a catchment ID within 128 characters.";
      return;
    }
    if(new Set(rows.map(row=>row.id.toLowerCase())).size!==rows.length){
      message.textContent="The mapped catchment IDs contain duplicates. Review the source rows.";
      return;
    }
    source={filename,fingerprint,choices,scales,data};
    catchments.replace(rows);
    notice.textContent=rows.length+" rows loaded from "+filename+". Review every classification and resolve "+missing+" missing or unmapped allowance fields.";
    dialog.close();open.focus();
  }
  return ()=>{
    if(!source)return [];
    const {filename,fingerprint,choices,scales,data}=source;
    const mapped=definitions.filter(([key])=>choices[key]!==null);
    return [["Imported file",filename],["Source SHA-256",fingerprint],["Source schema",data.schema],
      ...mapped.map(([key,title])=>[title,data.header[choices[key]],data.units?.[choices[key]]??"Reviewed units","Conversion factor",scales[key]]),
      ["Original source line",...mapped.map(([key])=>data.header[choices[key]])],
      ...data.rows.map(row=>[row.line,...mapped.map(([key])=>row.cells[choices[key]])])];
  };
}

function mountStorageRouting(navigate,worker) {
  const article=panel("tab-storage-routing","Storage capacity sensitivity",
    "Route instantaneous inflow into a tank with a constant pass-forward limit. Review the resulting spill volumes for the assessed period. The calculation assumes ideal controls and excludes tailwater and hydraulic feedback.");
  article.append(action("Open Storage assessment",()=>navigate("spills","storage",true)),
    action("Open Time series",()=>navigate("data","time-series",true)));
  const form=element("form");form.id="storageRoutingForm";
  const settings=fields([
    {key:"source",label:"Inflow series",options:[["","Select a resolved flow series"]]},
    {key:"capacities",label:"Storage capacities (m³, comma-separated)",type:"text",maxLength:300},
    number("initial_m3","Initial occupied storage (m³)",0,1e9),
    number("release_m3_s","Pass-forward limit (m³/s)",0,10000),
    number("max_gap_s","Maximum supported timestep (s)",.001,31557600),
    {key:"start",label:"Period start (optional, exact sample)",type:"datetime-local",step:1,required:false},
    {key:"end",label:"Period end (optional, exact sample)",type:"datetime-local",step:1,required:false},
    {key:"confirmation",label:"I confirm the source represents instantaneous tank inflow on the project clock",type:"checkbox"},
    {key:"note",label:"Assumption or review note",type:"text",maxLength:2000,required:false}
  ],{initial_m3:0});
  const picker=settings.controls.source;
  const availability=element("p");availability.setAttribute("aria-live","polite");
  form.append(availability,settings.group,element("p","Use increasing capacities and the same initial occupied volume across options. Blank dates use the full source. Routing ends at the first unsupported or excluded interval."));

  function eligible() {
    return allSeries().filter(({item,col})=>item.status==="ready"&&item.hash&&
      item.parsed?.metadata?.timestamp_convention==="instantaneous"&&
      item.parsed?.metadata?.time_basis!=="timezone-aware/unresolved"&&
      seriesQuantity(item,col)==="flow"&&seriesUnit(item,col)==="m³/s");
  }
  function reviewInputs(key) {
    const source=eligible().find(series=>series.key===key);
    if (!source) return null;
    const {item,col}=source;
    const exclusions=exclusionPayload(true).filter(row=>row.enabled&&(
      row.scope==="both"||row.scope===key||
      (row.scope==="observed"&&state.mapping.observed===key)||
      (row.scope==="model"&&state.mapping.models.includes(key))));
    const details=seriesMetadata(item,col);
    const signature=JSON.stringify([item.id,item.hash,col,details.original_unit,details.conversion_factor,exclusions]);
    return {item,col,exclusions,signature};
  }
  let previous=null;
  const invalidate=results(article,form,async()=>{
    const {source,capacities,note,confirmation,start,end,...numeric}=settings.values();
    const inputs=reviewInputs(source);
    if (!inputs || !confirmation) throw new Error("Choose and confirm the inflow series.");
    const parts=capacities.split(",").map(value=>value.trim());
    if (parts.some(value=>!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))) throw new Error("Enter comma-separated decimal capacities in m³.");
    const {item,col,exclusions,signature}=inputs;
    const r=await worker("screen_storage_routing",{
      path:item.virtualPath,column:col,capacities_m3:parts.map(Number),...numeric,start:start||null,end:end||null,
      exclusions_json:JSON.stringify(exclusions)
    });
    if (reviewInputs(source)?.signature!==signature) throw new Error("The source or exclusions changed. Calculate again.");
    previous=signature;
    const header=["Capacity (m³)","Spill volume (m³)","Spill reduction vs. smallest capacity (m³)","Passed volume (m³)",
      "End storage (m³)","Peak storage (m³)","Release shortfall (m³)","Mass residual (m³)"];
    const base=r.rows[0].spill_m3;
    const rows=r.rows.map(row=>[row.capacity_m3,row.spill_m3,base-row.spill_m3,row.passed_m3,
      row.final_m3,row.peak_m3,row.release_shortfall_m3,row.mass_residual_m3]);
    const period=[["Window start",r.window_start],["Window end",r.window_end],["Assessed through",r.assessed_through],
      ["Supported duration (s)",r.elapsed_s],["Selected duration (s)",r.available_s],
      ["Window coverage (%)",100*r.elapsed_s/r.available_s],["Total supported inflow (m³)",r.rows[0].inflow_m3],
      ["First unsupported interval",r.stop_reason||"None in selected window"]];
    const content=[table(["Period","Value"],period,"Inflow support"),
      chart([{label:"Routed spill volume",points:rows.map(row=>row.slice(0,2)),color:"#136b7f",markers:true}],"Storage capacity (m³)","Spill (m³)"),
      table(header,rows,"Storage capacity options"),
      element("p","Release shortfall is the unused part of the pass-forward limit when insufficient volume is available. Use the 12/24 spill assessment for regulatory counts.")];
    return {content,summary:r.stop_reason?"Partial period. Routing stopped at the first "+r.stop_reason+".":"Storage routing completed for the selected period.",
      filename:"hydra-storage-routing.csv",rows:[["Method",r.method],["Equation","Inflow + initial = passed + spilled + final storage"],
        ["Inflow source",item.displayName],["Column",col],["Source SHA-256",item.hash],["Source unit",r.original_unit],
        ["Source samples in selected window",r.sample_count],["Initial storage (m³)",r.initial_m3],
        ["Pass-forward limit (m³/s)",r.release_m3_s],["Maximum timestep (s)",r.max_gap_s],["Review note",note],
        ...period,header,...rows,["Exclusion start","Exclusion end","Reason"],...exclusions.map(row=>[row.start,row.end,row.reason])]};
  });
  function refresh() {
    const selected=picker.value,sourceOptions=eligible();
    picker.replaceChildren(new Option("Select a resolved flow series",""),...sourceOptions.map(source=>new Option(source.label,source.key)));
    picker.value=sourceOptions.some(source=>source.key===selected)?selected:"";
    if (!sourceOptions.length) availability.textContent="Import an eligible instantaneous flow series with resolved units in Time series.";
    else availability.textContent="";
    if (previous) {
      let current=null;
      try {current=reviewInputs(picker.value)?.signature;} catch {}
      if (current!==previous) {previous=null;invalidate();}
    }
  }
  window.addEventListener("icm:route-changed",({detail})=>{if(detail.page==="storage-routing") refresh();});
  window.addEventListener("icm:source-pool-changed",refresh);
}

function mount(navigate) {
  const worker=async (api,args)=>{await ensureEngineBoot();return engine.call(api,args);};
  mountStorageRouting(navigate,worker);
  const system=panel("tab-pipe-system","Pipe head loss and system curves",
    "Use full circular pipes and a justified fixed Darcy friction factor. Each stage is in series and branches within a stage are in parallel. Static head includes elevation and pressure head differences.");
  const design=systemInputs(),systemForm=element("form");
  systemForm.id="pipeSystemForm";systemForm.append(design.settings.group,design.pipes.wrapper);
  const systemHeaders=["Stage","Branch","Diameter (m)","Length (m)","Darcy f","Fittings K","Entrance K","Exit K",
    "Flow (m³/s)","Velocity (m/s)","Friction (m)","Fittings (m)","Entrance (m)","Exit (m)","Branch head loss (m)"];
  const systemRows=r=>r.rows.map(p=>[p.stage,p.branch,p.diameter_m,p.length_m,p.darcy_factor,p.minor_k,p.entrance_k,
    p.exit_k,p.flow_m3_s,p.velocity_m_s,p.friction_m,p.fittings_m,p.entrance_m,p.exit_m,p.loss_m]);
  results(system,systemForm,async()=>{
    const inputs=design.settings.values();
    const r=await worker("pipe_system_curve",{...inputs,stages:design.stages()});
    const detail=systemRows(r),metrics=[["Duty flow (m³/s)",inputs.flow_m3_s],["Static head (m)",r.static_head_m],
      ["System loss (m)",r.loss_m],["Total required head (m)",r.total_head_m]];
    return {content:[table(["Quantity","Value"],metrics,"System duty"),
      table(systemHeaders,detail,"Pipe loss contributions"),
      chart([{label:"System head",points:r.curve,color:"#136b7f"}])],summary:"System curve calculated.",
      filename:"hydra-pipe-system.csv",rows:[["Method",r.method],["Reference",pumpReference],
        ["Equation","H = Hstatic + Σ(fL/D + K) V²/(2g) along each path"],...metrics,systemHeaders,...detail,
        ["Curve flow (m³/s)","Curve head (m)"],...r.curve]};
  });

  const pump=panel("tab-pump-duty","Pump duty screening",
    "Compare a supplied curve with the pipe system. Identical pumps in series add head and identical pumps in parallel add flow. This screen uses steady, full-pipe resistance.");
  pump.append(action("Edit pipe system",()=>navigate("hydraulics","system-curve",true)));
  const pumpForm=element("form");pumpForm.id="pumpDutyForm";
  const pumpControls=fields([{key:"arrangement",label:"Arrangement",options:[
    ["single","Single pump"],["series","Identical pumps in series"],["parallel","Identical pumps in parallel"]]},
    number("pump_count","Number of pumps",1,20,1),number("density_kg_m3","Fluid density (kg/m³)",100,3000),
    {...number("efficiency","Overall efficiency (%)",1,100),required:false}],{pump_count:1});
  const points=editableRows("Pump curve points",pumpFields,[{},{}],undefined,2);
  pumpForm.append(pumpControls.group,points.wrapper);
  const invalidatePump=results(pump,pumpForm,async()=>{
    // Pump duty uses the system geometry and static head. Display and selected
    // head-loss duty flows belong to the other calculation.
    const staticHead=design.settings.controls.static_head_m;
    if (!staticHead.checkValidity() || [...design.pipes.wrapper.querySelectorAll("input")].some(input=>!input.checkValidity())) {
      throw new Error("Enter valid pipe branches and static head under System curve first.");
    }
    const {efficiency,...args}=pumpControls.values();
    const r=await worker("pump_system_duty",{...args,static_head_m:read(staticHead),stages:design.stages(),
      points:points.values().map(p=>[p.flow,p.head]),efficiency:Number.isNaN(efficiency)?null:efficiency/100});
    const header=["Flow (m³/s)","Head (m)","Hydraulic power (kW)","Input power (kW)","Local slope indication"];
    const duties=r.duties.map(d=>[d.flow_m3_s,d.head_m,d.hydraulic_kw,d.input_kw,d.local_slope]);
    return {content:[chart([{label:"System head",points:r.system_curve,color:"#136b7f"},
      {label:"Supplied pump curve",points:r.pump_curve,color:"#72559d"}]),table(header,duties,"Intersections"),
      element("p","Slope indicates the local residual trend. Review manufacturer operating limits and system dynamics before selecting a duty point.")],
      summary:duties.length?duties.length+" supported intersection(s) in the supplied range.":"No intersection within the supplied pump range.",
      filename:"hydra-pump-duty.csv",rows:[["Method",r.method],["Reference",pumpReference],["Interpolation","Linear pump segments within measured range"],
        ["Static head (m)",read(staticHead)],["Arrangement",args.arrangement],["Identical pumps",args.pump_count],["Density (kg/m³)",args.density_kg_m3],
        ["Overall efficiency (%)",Number.isNaN(efficiency)?null:efficiency],header,...duties,
        ["System curve flow (m³/s)","Head (m)"],...r.system_curve,["Composite pump curve flow (m³/s)","Head (m)"],...r.pump_curve]};
  });
  systemForm.addEventListener("input",invalidatePump);
  systemForm.addEventListener("change",invalidatePump);

  const formula=panel("tab-formula-a","Formula A and wastewater design flows",
    "Environment Agency screening for England. Enter reviewed daily allowances. Formula A is the retained continuation flow throughout spilling.");
  const form=element("form");form.id="designFlowForm";
  const catchments=editableRows("Catchment",catchmentFields,[{classification:"combined"}],configureCatchment);
  form.append(element("p","A qualifying separate foul area requires evidence of minimal storm response at or below 3DWF. Record the evidence and confirm eligibility for each qualifying row."),
    catchments.wrapper);
  const catchmentSource=mountCatchmentImport(formula,form,catchments,worker);
  results(formula,form,async()=>{
    const r=await worker("england_continuation_flow",{catchments:catchments.values()});
    const metrics=[["Population",r.totals.population],["Combined / partially separate population",r.totals.combined_population],
      ["Qualifying separate population",r.totals.separate_population],["Domestic flow (L/day)",r.totals.domestic_l_day],
      ["Infiltration (L/day)",r.totals.infiltration_l_day],["Trade (L/day)",r.totals.trade_l_day],
      ["Dry weather flow (L/day)",r.dwf_l_day],["Population or domestic supplement (L/day)",r.totals.supplement_l_day],
      ["Trade supplement (L/day)",r.totals.trade_supplement_l_day],["Retained flow (L/day)",r.retained_l_day],
      ["Retained flow (L/s)",r.retained_l_s],["Retained flow (m³/s)",r.retained_m3_s]];
    const heading=["Catchment","Class","Included","Population","Domestic allowance (L/head/day)","Domestic (L/day)",
      "Infiltration (L/day)","Trade (L/day)","Eligibility confirmed","Evidence"];
    const details=r.rows.map(row=>[row.id,row.classification,row.included?"Yes":"Excluded",row.population??null,
      row.domestic_l_head_day??null,row.domestic_l_day??null,row.infiltration_l_day??null,row.trade_l_day??null,
      row.eligibility_confirmed?"Yes":"",row.evidence]);
    return {content:[table(["Quantity","Value"],metrics,r.regime),table(heading,details,"Catchment audit"),
      element("p",eaReference+". Confirm permit applicability with the project reviewer.")],
      summary:"Retained flow calculated from reviewed catchments.",filename:"hydra-england-continuation-flow.csv",
      rows:[["Method",r.method],["Reference",r.reference],["Regime",r.regime],
        ["Equation","DWF = sum(PᵢGᵢ) + I + E. Retained flow = DWF + 1360Pc + 2 × separate domestic flow + 2E."],
        ...metrics,heading,...details,...catchmentSource()]};
  });
}
window.HydraDesignCalculations={mount};
})();
