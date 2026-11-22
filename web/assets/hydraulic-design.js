/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";

const number = (key, label, min, max, step = "any") => ({key, label, type:"number", min, max, step});
const pipeFields = [
  number("stage", "Stage", 1, 100, 1), number("diameter_m", "Internal diameter (m)", .001, 20),
  number("length_m", "Length (m)", .001, 1e7), number("darcy_factor", "Darcy friction factor", .0001, 1),
  number("roughness_mm", "Absolute roughness (mm)", 0, 1000),
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
const sepaReference = "SEPA WAT-G-058, version 1.0, August 2025, section 4.1.1";
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
  control.setAttribute("aria-label",rowTitle?rowTitle+" "+spec.label:spec.label);
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
function editableRows(title, specs, defaults, configure, minimum = 1, maximum = 100) {
  const wrapper = element("div");
  wrapper.className = "table-wrap";
  const grid = element("table");
  grid.createCaption().textContent = title;
  const heading = grid.createTHead().insertRow();
  const headers = new Map();
  for (const {key,label} of [...specs,{key:"actions",label:"Action"}]) {
    const cell = element("th",label);
    cell.scope = "col";headers.set(key,cell);
    heading.append(cell);
  }
  const body = grid.createTBody(), records = new Map(), removeButtons = new Map();
  let serial = 0;
  function add(initial = {}, focus = false) {
    if (records.size >= maximum) return;
    const row = body.insertRow(), name = title+" row "+(++serial);
    const controls = Object.fromEntries(specs.map(spec => {
      const {control} = labelledControl(spec,initial[spec.key],name);
      const cell = row.insertCell();
      cell.hidden = headers.get(spec.key).hidden;
      control.disabled = cell.hidden;
      cell.append(control);
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
    addButton.disabled = records.size >= maximum;
    for (const button of removeButtons.values()) button.disabled = records.size <= minimum;
  }
  const addButton = action("Add row",() => {
    add({},true);
    wrapper.dispatchEvent(new Event("input",{bubbles:true}));
  });
  wrapper.append(grid,addButton);
  for (const row of defaults) add(row);
  return {wrapper,setColumnVisibility(key,visible){
    headers.get(key).hidden = !visible;
    for (const controls of records.values()) {
      controls[key].parentElement.hidden = !visible;
      controls[key].disabled = !visible;
    }
  },replace(rows){
    body.replaceChildren();records.clear();removeButtons.clear();serial=0;
    for(const row of rows)add(row);
    wrapper.dispatchEvent(new Event("input",{bubbles:true}));
  }, values: () => [...records.values()].map(controls =>
    Object.fromEntries(Object.entries(controls).map(([key,control]) => [key,read(control)])))};
}
function panel(id,title,description) {
  let root = document.getElementById(id);
  if(!root){
    root=element("section");root.id=id;root.className="tab-panel";root.hidden=true;
    document.querySelector("main.shell").append(root);
  }
  const article = element("article");article.className = "panel";
  const intro = element("div");intro.className = "panel-head";
  intro.append(element("h2",title),element("p",description));
  article.append(intro);root.replaceChildren(article);
  return article;
}

const sheetStyle = `
  @page{size:A4 landscape;margin:14mm}
  body{font:14px/1.45 system-ui,sans-serif;color:#172935;margin:24px}
  main{margin:auto;max-width:1120px}
  h1{font-size:24px}h2{font-size:17px;margin-top:1.5em;break-after:avoid}
  p{overflow-wrap:anywhere}svg{max-width:100%;height:auto;break-inside:avoid}
  table{width:100%;border-collapse:collapse;margin:1em 0;font-variant-numeric:tabular-nums}
  caption,th{text-align:left;font-weight:600}
  th,td{vertical-align:top;border-bottom:1px solid #ced7df;padding:5px;overflow-wrap:anywhere}
  thead{display:table-header-group}tr{break-inside:avoid}
  @media print{body{margin:0;font-size:9pt}th,td{padding:3px}}
`;

function sheetInputs(form) {
  return [...form.elements].flatMap(control => {
    const label=control.getAttribute("aria-label");
    if (!label||control.matches(":disabled")||!control.matches("input:not([type=file]),select")) return [];
    const value=control.type==="checkbox"?(control.checked?"Yes":"No"):
      control.selectedOptions?.[0]?.textContent||control.value||"Unavailable";
    return [[label,value]];
  });
}

function calculationSheet(snapshot,content,embedded=false) {
  const paper=element(embedded?"section":"main"),audit=element("table"),auditContainer=element("div");
  const heading=embedded?"h4":"h2";
  if(embedded)paper.className="report-calculation-sheet";
  auditContainer.className="table-wrap";auditContainer.append(audit);
  const auditBody=audit.createTBody();
  for (const record of snapshot.rows) {
    const row=auditBody.insertRow();
    for (const value of record) row.insertCell().textContent=value==null?"Unavailable":String(value);
  }
  paper.append(element(embedded?"h3":"h1",snapshot.title),element("p",snapshot.summary),
    table(["Calculation identity","Value"],snapshot.identity),
    element(heading,"Reviewed inputs"),table(["Input","Value"],snapshot.inputs),
    element(heading,"Results and applicability"),content.cloneNode(true),
    element(heading,"Equations and audit record"),auditContainer);
  if(!embedded)paper.append(element("p","Hydra Bench · Anzar Sajid"));
  return paper;
}

function standaloneSheet(snapshot,paper) {
  const file=document.implementation.createHTMLDocument(snapshot.title);
  file.documentElement.lang="en";
  const encoding=element("meta");encoding.setAttribute("charset","utf-8");
  const policy=element("meta");policy.httpEquiv="Content-Security-Policy";
  policy.content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";
  file.head.prepend(encoding,policy);
  file.head.append(element("style",sheetStyle));
  file.body.append(paper.cloneNode(true));
  return file;
}

const publishedSheets=new Map();
let sheetRevision=0;
const announceSheets=()=>window.dispatchEvent(new Event("icm:calculation-sheets-changed"));
function currentSheet(entry){
  try{return Boolean(entry?.snapshot&&entry.isCurrent());}catch{return false;}
}
function sheetStatus(){
  return Array.from(publishedSheets,([id,entry])=>({id,title:entry.title,current:currentSheet(entry)}));
}
function reportSheets(ids,includeHtml){
  if(!ids.length)throw new Error("Select at least one current calculation sheet.");
  const entries=ids.map(id=>publishedSheets.get(id));
  if(entries.some(entry=>!currentSheet(entry)))
    throw new Error("Refresh or deselect unavailable calculation sheets before generating the report.");
  return {revisions:entries.map(entry=>entry.revision),
    html:includeHtml?entries.map(entry=>calculationSheet(entry.snapshot,entry.content,true).outerHTML).join(""):""};
}

function results(article,form,calculate) {
  const actions = element("div");actions.className = "actions";
  const submit = element("button","Calculate");submit.type = "submit";submit.className = "primary";
  const status = element("p");status.setAttribute("role","status");
  const content = element("div");
  const title=(form.querySelector("h3")||article.querySelector("h2")).textContent+" calculation sheet";
  const entry={title,content,snapshot:null,revision:null,isCurrent:()=>true};
  publishedSheets.set(form.id,entry);
  const dialog=element("dialog"),paper=element("div"),sheetActions=element("div"),sheetStatus=element("p");
  dialog.setAttribute("aria-label",title);dialog.className="hb-calculation-sheet";
  sheetActions.className="actions";sheetStatus.setAttribute("role","status");
  let generation = 0, downloadable = null;
  const save = action("Download calculation CSV",() => {
    if (!downloadable) return;
    const csv = [...downloadable.rows,...downloadable.exportRows].map(row=>row.map(value=>ICMSafeCSV.cell(value ?? "")).join(",")).join("\r\n");
    downloadBlob(downloadable.filename,csv,"text/csv");
  });
  const review=action("Review calculation sheet",()=>{
    if(!downloadable)return;
    sheetStatus.textContent="";
    paper.replaceChildren(calculationSheet(downloadable,content));
    dialog.showModal();
  });
  const downloadSheet=action("Download calculation HTML",()=>{
    if(!downloadable||!paper.firstElementChild)return;
    const file=standaloneSheet(downloadable,paper.firstElementChild);
    downloadBlob(downloadable.filename.replace(/\.csv$/,".html"),"<!doctype html>"+file.documentElement.outerHTML,"text/html");
  });
  const print=action("Print calculation sheet",()=>{
    if(!downloadable||!paper.firstElementChild)return;
    const tab=window.open("","_blank");
    if(!tab){sheetStatus.textContent="Allow the local print window or download the HTML sheet.";return;}
    tab.opener=null;
    const file=standaloneSheet(downloadable,paper.firstElementChild);
    tab.document.head.replaceChildren(...file.head.childNodes);
    tab.document.body.replaceChildren(...file.body.childNodes);
    tab.document.documentElement.lang="en";
    tab.focus();tab.print();
  });
  const close=action("Close",()=>dialog.close());
  sheetActions.append(downloadSheet,print,close);dialog.append(sheetActions,sheetStatus,paper);
  dialog.addEventListener("close",()=>{paper.replaceChildren();if(!review.disabled)review.focus();});
  save.disabled = review.disabled = true;
  actions.append(submit,save,review);form.append(actions);article.append(form,status,content,dialog);
  function withdraw(){
    if(!entry.snapshot)return;
    entry.snapshot=null;entry.revision=null;announceSheets();
  }
  function invalidate() {
    generation++;downloadable = null;save.disabled = review.disabled = true;
    withdraw();
    if(dialog.open)dialog.close();
    if (content.childNodes.length || status.textContent) status.textContent = "Inputs changed. Calculate to refresh.";
    content.replaceChildren();
  }
  form.addEventListener("input",invalidate);
  form.addEventListener("change",invalidate);
  window.addEventListener("icm:assessment-context-restored",invalidate);
  form.addEventListener("submit",async event => {
    event.preventDefault();
    const id = ++generation,inputs=sheetInputs(form);
    submit.disabled = true;save.disabled = review.disabled = true;content.replaceChildren();downloadable = null;
    withdraw();
    status.textContent = "Calculating in the local worker…";
    try {
      const result = await calculate();
      if (id !== generation) return;
      content.replaceChildren(...result.content);
      const version=document.querySelector('meta[name="hydra-bench-version"]')?.content||"Unavailable";
      const method=result.rows.find(([key])=>key==="Method")?.[1]??"Unavailable";
      downloadable = {filename:result.filename,title,inputs,summary:result.summary,
        identity:[["Hydra Bench version",version],["Application revision",buildToken],
          ["Calculation engine revision",window.__ICM_WORKBENCH__.workerBuildToken||"Unavailable"],
          ["Method version",method],["Calculated at (UTC)",new Date().toISOString()]],
        rows:[["Build",buildToken],...result.rows],exportRows:result.exportRows||[]};
      entry.snapshot=downloadable;entry.revision=++sheetRevision;entry.isCurrent=result.isCurrent||(()=>true);
      announceSheets();
      save.disabled = review.disabled = false;status.textContent = result.summary;
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
  const levels=bounds.flatMap(([,head])=>head===null?[]:[head]);
  const low=Math.min(0,...levels),high=Math.max(low+1,...levels);
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
    let segment=[];
    const draw=()=>{
      if (segment.length>1) root.append(svg("polyline",{points:segment.map(([q,h])=>x(q)+","+y(h)).join(" "),
        stroke:s.color,"stroke-width":2.5,fill:"none"}));
      if (segment.length===1||s.markers) for (const [q,h] of segment) root.append(svg("circle",{cx:x(q),cy:y(h),r:3.5,fill:s.color}));
      segment=[];
    };
    for (const point of s.points) {
      if (point[1]===null) draw();
      else segment.push(point);
    }
    draw();
  }
  const summary=element("figure");
  summary.append(root,element("figcaption",series.map(s=>s.label).join(" · ")));
  return summary;
}
function systemInputs() {
  const settings=fields([{key:"friction_method",label:"Friction method",options:[
    ["fixed","Specified Darcy factors"],["calculated","Calculated from roughness and Reynolds number"]]},
    number("static_head_m","Static head (m)",-100000,100000),number("flow_m3_s","Duty flow (m³/s)",0,1000),
    number("curve_max_m3_s","Maximum curve flow (m³/s)",1e-9,1000),
    number("viscosity_m2_s","Kinematic viscosity (m²/s)",1e-9,.01)]);
  const pipes=editableRows("Pipe branches",pipeFields,[{stage:1,minor_k:0,entrance_k:0,exit_k:0}]);
  const calculated=()=>settings.controls.friction_method.value==="calculated";
  const update=()=>{
    const active=calculated(), viscosity=settings.controls.viscosity_m2_s;
    viscosity.disabled=!active;
    viscosity.parentElement.hidden=!active;
    pipes.setColumnVisibility("darcy_factor",!active);
    pipes.setColumnVisibility("roughness_mm",active);
  };
  settings.controls.friction_method.addEventListener("change",update);
  update();
  return {settings,pipes,calculated,stages:()=>{
    const stages=[];
    for (const {stage,roughness_mm,darcy_factor,...pipe} of pipes.values()) {
      if (!Number.isInteger(stage)) throw new Error("Enter a whole stage number.");
      const friction=calculated()?{roughness_m:roughness_mm/1000}:{darcy_factor};
      (stages[stage-1] ??= []).push({...pipe,...friction});
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
async function readLocalCSV(file,kind,preview){
  if(file.size>1024*1024)throw new Error("Choose a "+kind+" CSV up to 1 MiB.");
  const bytes=await file.arrayBuffer();
  let text;
  try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
  catch{text=new TextDecoder("windows-1252").decode(bytes);}
  const [data,digest]=await Promise.all([preview(text),globalThis.crypto.subtle.digest("SHA-256",bytes)]);
  const fingerprint=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
  return {data,text,filename:file.name,fingerprint};
}

function mountPumpImport(article,form,points,worker){
  const dialog=element("dialog"),heading=element("h3","Review pump curve CSV");
  heading.id="hbPumpImportTitle";dialog.setAttribute("aria-labelledby",heading.id);
  const upload=element("input");upload.type="file";upload.accept=".csv,text/csv";
  const fileLabel=element("label","Local pump curve CSV");fileLabel.append(upload);
  const message=element("p"),preview=element("div"),applied=element("p");
  message.setAttribute("role","status");applied.setAttribute("role","status");
  const controls=element("div"),buttons=element("div");buttons.className="actions";
  const open=action("Import pump curve CSV",()=>dialog.showModal());
  const cancel=action("Cancel",()=>dialog.close());
  const apply=action("Apply curve",async()=>{
    if(!staged)return;
    const mapping=picks.values();
    if(Object.values(mapping).some(value=>value==="")){message.textContent="Select both columns and their source units.";return;}
    const id=++revision,packet=staged;
    apply.disabled=true;message.textContent="Checking the mapped curve…";
    try{
      const result=await worker("map_pump_curve_csv",{...mapping,text:packet.text,
        flow_column:Number(mapping.flow_column),head_column:Number(mapping.head_column)});
      if(id!==revision||!dialog.open)return;
      source={...result,filename:packet.filename,fingerprint:packet.fingerprint};
      points.replace(result.points.map(([flow,head])=>({flow,head})));
      applied.textContent=result.points.length+" measured points imported. The table shows converted SI values.";
      dialog.close();
    }catch(error){if(id===revision&&dialog.open){message.textContent=error.message;apply.disabled=false;}}
  });
  let revision=0,staged=null,picks=null,source=null;
  apply.disabled=true;buttons.append(cancel,apply);
  dialog.append(heading,element("p","Choose the measured flow and head columns and their units. The source order is preserved."),
    fileLabel,message,preview,controls,buttons);
  const tools=element("div");tools.className="actions";tools.append(open);
  form.append(tools,applied);article.append(dialog);
  function reset(){staged=null;picks=null;apply.disabled=true;preview.replaceChildren();controls.replaceChildren();}
  dialog.addEventListener("close",()=>{revision++;reset();upload.value="";message.textContent="";});
  upload.addEventListener("change",async()=>{
    const id=++revision,file=upload.files[0];reset();
    if(!file){message.textContent="";return;}
    message.textContent="Reading the local curve…";
    try{
      const packet=await readLocalCSV(file,"pump curve",text=>worker("preview_pump_curve_csv",{text}));
      if(id!==revision||!dialog.open)return;
      staged=packet;
      const {headers,first_rows,row_count}=packet.data;
      const columns=[["","Select a column"],...headers.map((header,index)=>[String(index),header])];
      const units=(label,values)=>[["",label],...values.map(unit=>[unit,unit])];
      picks=fields([{key:"flow_column",label:"Flow column",options:columns},{key:"head_column",label:"Head column",options:columns},
        {key:"flow_unit",label:"Flow unit",options:units("Select the flow unit",["m³/s","L/s","m³/h"])},
        {key:"head_unit",label:"Head unit",options:units("Select the head unit",["m","ft"])}]);
      controls.append(picks.group);preview.append(table(headers,first_rows,"Source preview"));
      message.textContent=row_count+" measured points available.";apply.disabled=false;
    }catch(error){if(id===revision&&dialog.open)message.textContent=error.message;}
  });
  return values=>{
    if(!source)return [["Curve input","Entered manually"]];
    const matches=values.length===source.points.length&&values.every(([flow,head],index)=>
      flow===source.points[index][0]&&head===source.points[index][1]);
    return [["Curve input",matches?"As imported":"Edited after import"],["Source file",source.filename],
      ["Source SHA-256",source.fingerprint],["Flow source column",source.flow_column,source.flow_unit],
      ["Head source column",source.head_column,source.head_unit]];
  };
}

const drainageFields=[["drainsTo","Drains to","drains_to"],["nodeId","Receiving node or link upstream ID","node_id"],
  ["linkSuffix","Receiving link suffix","link_suffix"],["toCatchment","Receiving catchment ID","to_subcatchment_id"],
  ["groundNode","Groundwater receiving node","ground_node"]];
const allocationFields=[["population","Population share (%)"],["infiltration_l_day","Infiltration share (%)"],["trade_l_day","Trade share (%)"]];

function readNetworkBasis(){
  const network=window.ICMNetworkSchematic?.snapshot?.();
  if(network?.contextFormat!=="icm-csv-v1")throw new Error("Import native ICM geometry in Network Schematic first.");
  const nodes=network.nodes.filter(node=>node.sourceAttributes?.table==="hw_node");
  const links=network.edges.filter(edge=>edge.icm?.table&&edge.sourceAttributes?.table===edge.icm.table);
  const byId=(left,right)=>left[0].localeCompare(right[0]);
  const stamp=JSON.stringify([nodes.map(node=>[node.id,node.type]).sort(byId),
    links.map(link=>[link.id,link.from,link.to,link.direction,link.icm.table,link.icm.linkSuffix]).sort(byId)]);
  return {network,stamp,assets:[
    ...nodes.map(node=>["node",node.id,node.name||node.id]),...links.map(link=>["edge",link.id,link.name||link.id])]};
}

function stageContributionReview(packet,idInput,output){
  const basis=readNetworkBasis(),{data}=packet;
  const asset=state.formulaAssessmentAsset;
  const preferred=asset&&basis.assets.some(([kind,id])=>kind===asset.kind&&id===asset.id)?
    JSON.stringify({kind:asset.kind,id:asset.id}):"";
  const inputs=fields([{key:"target",label:"Assessment asset",options:[["","Choose a typed assessment asset"],
    ...basis.assets.map(([kind,id,name])=>[JSON.stringify({kind,id}),(kind==="node"?"Node ":"Link ")+name])]}],{target:preferred});
  const columns=[["","Unmapped"],...data.header.map((name,i)=>[String(i),name||"Column "+(i+1)])];
  const drainage=fields(drainageFields.map(([key,label])=>({key,label,options:columns,required:false})),
    Object.fromEntries(drainageFields.map(([key,,native])=>{
      const column=data.header.findIndex(name=>name.toLowerCase()===native);
      return [key,column<0?"":String(column)];
    })));
  const findings=element("div"),message=element("p");
  message.setAttribute("role","status");
  let active=null;
  const review=action("Trace reviewed drainage",()=>{
    active=null;findings.replaceChildren();
    if(idInput.value===""){message.textContent="Map the catchment ID column before tracing.";return;}
    if(!inputs.controls.target.value){message.textContent="Choose an assessment asset.";return;}
    const mapped=drainage.values();
    if(mapped.drainsTo===""){message.textContent="Map the Drains to source column before tracing.";return;}
    const selected=[idInput.value,...Object.values(mapped).filter(value=>value!=="")];
    if(selected.length!==new Set(selected).size){message.textContent="Use distinct drainage source columns.";return;}
    const target=JSON.parse(inputs.controls.target.value);
    const records=data.rows.map(row=>({id:String(row.cells[Number(idInput.value)]||"").trim(),
      ...Object.fromEntries(Object.entries(mapped).map(([key,choice])=>[key,choice===""?"":row.cells[Number(choice)]]))}));
    const classifications=ICMNetworkReviewCore.contributingCatchments(basis.network,target,records);
    const wrap=element("div");wrap.className="table-wrap";
    const grid=element("table"),heading=grid.createTHead().insertRow();
    grid.createCaption().textContent="Contributing catchment review";
    for(const label of ["Catchment","Topology evidence","Review decision",...allocationFields.map(([,label])=>label),"Allocation evidence"]){
      const cell=element("th",label);cell.scope="col";heading.append(cell);
    }
    const body=grid.createTBody();
    const rows=classifications.map(({id,status,reason},i)=>{
      const row=body.insertRow(),label="Catchment source row "+data.rows[i].line;
      row.insertCell().textContent=id||"Missing ID";row.insertCell().textContent=status+" · "+reason;
      const {control:decision}=labelledControl({key:"decision",label:"Decision",options:[["","Review"],
        ["include","Include reviewed share"],["exclude","Exclude"]]},undefined,label);
      row.insertCell().append(decision);
      const shares=Object.fromEntries(allocationFields.map(([key,caption])=>{
        const {control}=labelledControl(number(key,caption,0,100),status==="Candidate"?100:undefined,label);
        row.insertCell().append(control);return [key,control];
      }));
      const {control:evidence}=labelledControl({key:"evidence",label:"Evidence",type:"text",maxLength:1850},undefined,label);
      row.insertCell().append(evidence);
      const update=()=>{for(const control of Object.values(shares))control.disabled=decision.value!=="include";};
      decision.addEventListener("change",update);update();
      return {id,status,reason,decision,shares,evidence};
    });
    const summary=[...new Set(classifications.map(row=>row.status))].map(status=>
      classifications.filter(row=>row.status===status).length+" "+status.toLowerCase()).join(" · ");
    message.textContent=summary+". Confirm or exclude each row before applying.";
    wrap.append(grid);findings.append(wrap);
    active={idColumn:idInput.value,asset:inputs.controls.target.selectedOptions[0].textContent,target,mapped,rows};
  });
  function reset(){
    active=null;findings.replaceChildren();message.textContent="Trace the updated source mappings before applying.";
  }
  idInput.addEventListener("change",reset);
  inputs.group.addEventListener("change",reset);drainage.group.addEventListener("change",reset);
  output.replaceChildren(inputs.group,drainage.group,
    element("p","A route identifies possible connections. Review population, infiltration and trade shares independently. Use documented source allocations or exclude unresolved contributions."),
    review,message,findings);
  return mappedRows=>{
    if(!active||active.idColumn!==idInput.value)throw new Error("Trace the mapped catchments before applying.");
    if(readNetworkBasis().stamp!==basis.stamp)throw new Error("Network topology changed. Reopen the import and review the updated network.");
    const included=new Map(),excluded=new Map(),audit=[];
    for(const [index,row] of active.rows.entries()){
      const {id,status,reason,decision,evidence,shares}=row;
      const note=evidence.value.trim(),key=id.toUpperCase();
      if(!decision.value||!note)throw new Error("Review the decision and evidence for catchment source row "+data.rows[index].line+".");
      const original=mappedRows[index];
      let applied=[null,null,null];
      if(decision.value==="include"){
        if(included.has(key))throw new Error("Allocate repeated catchment "+id+" once.");
        if(Object.values(shares).some(control=>!control.checkValidity()))throw new Error("Enter all three reviewed contribution shares for "+id+".");
        const adjusted={...original,evidence:note};
        applied=Object.entries(shares).map(([name,control])=>{
          const fraction=control.valueAsNumber;
          if(Number.isFinite(adjusted[name]))adjusted[name]*=fraction/100;
          return fraction;
        });
        included.set(key,adjusted);
      }else if(!excluded.has(key))excluded.set(key,{id,classification:"excluded",evidence:note});
      audit.push([data.rows[index].line,id,status,reason,decision.value,...applied,note]);
    }
    if(!included.size)throw new Error("Include at least one reviewed contribution.");
    const rows=[...new Set(mappedRows.map(row=>row.id.toUpperCase()))].map(key=>included.get(key)||excluded.get(key));
    return {rows,stamp:basis.stamp,audit:[["Assessment asset",active.asset],["Typed assessment identity",JSON.stringify(active.target)],
      ...drainageFields.filter(([key])=>active.mapped[key]!=="").map(([key,label])=>[label,data.header[Number(active.mapped[key])]]),
      ["Source line","Catchment","Topology","Topology basis","Decision",...allocationFields.map(([,label])=>label),"Allocation evidence"],...audit]};
  };
}

function mountLandUseReview(packet,worker){
  const section=element("details"),upload=element("input"),label=element("label","Land-use CSV");
  upload.type="file";upload.accept=".csv,text/csv";label.append(upload);
  const bases=fields([
    {key:"area_unit",label:"Contributing-area unit",options:[["","Confirm the export unit"],["ha","ha"],["m²","m²"],["km²","km²"],["acre","acre"]]},
    {key:"density_unit",label:"Population-density unit",options:[["","Confirm the export unit"],["people/ha","people/ha"],
      ["people/m²","people/m²"],["people/km²","people/km²"],["people/acre","people/acre"]]},
    {key:"source_basis",label:"Reviewed ICM revision and land-use export basis",type:"text",maxLength:2000}
  ]);
  const acceptance=fields([{key:"accepted",label:"Use reviewed inherited population for blank native population cells",type:"checkbox",required:false}]);
  const message=element("p"),output=element("div");message.setAttribute("role","status");
  let companion=null,review=null,generation=0,fileGeneration=0;
  const resolve=action("Review ICM defaults",async()=>{
    const requested=++generation;
    resetResult();resolve.disabled=true;
    const values=bases.values();
    try{
      if(!values.area_unit||!values.density_unit||!values.source_basis)throw new Error("Confirm both export units and give the model revision and source basis.");
      const {source_basis:note,...units}=values;
      const result=await worker("review_icm_catchment_defaults",{catchments:packet.data,land_use:companion.data,...units});
      if(requested!==generation||!section.isConnected)return;
      review={result,note,filename:companion.filename,fingerprint:companion.fingerprint};
      const proposal=cell=>cell.value===null?cell.basis:
        `${format(cell.value)} · ${cell.basis}${cell.source_line?" row "+cell.source_line:""}`;
      output.append(table(["Source catchment","ICM system type","Land use","Population (people)","Connectivity (%)",
        "Wastewater profile","Population × connectivity (people)"],result.rows.map(row=>[row.id,row.source_attributes.system_type||"Unavailable",
        row.land_use_id||"Unavailable",proposal(row.population),proposal(row.connectivity),proposal(row.wastewater_profile),row.population_times_connectivity]),
      "Proposed ICM defaults"));
      acceptance.group.hidden=!result.rows.some(row=>row.population.basis==="land use");
      message.textContent=`Reviewed ${result.rows.length} catchment rows against native land-use entries.`;
    }catch(error){if(requested===generation&&section.isConnected)message.textContent=error.message;}
    finally{if(requested===generation)resolve.disabled=!companion;}
  });
  function resetResult(){review=null;output.replaceChildren();acceptance.group.hidden=true;acceptance.controls.accepted.checked=false;}
  resolve.disabled=acceptance.group.hidden=true;
  bases.group.addEventListener("input",()=>{++generation;resetResult();resolve.disabled=!companion;});
  upload.onchange=async()=>{
    const requested=++fileGeneration,file=upload.files[0];
    ++generation;
    companion=null;resetResult();resolve.disabled=true;
    if(!file){message.textContent="";return;}
    message.textContent="Validating the local land-use table…";
    try{
      const result=await readLocalCSV(file,"land-use",text=>worker("preview_design_catchments",{text,table:"hw_land_use"}));
      if(requested!==fileGeneration||!section.isConnected)return;
      companion=result;resolve.disabled=false;message.textContent=`${result.data.rows.length} land-use rows available. Confirm units and provenance.`;
    }catch(error){if(requested===fileGeneration&&section.isConnected)message.textContent=error.message;}
  };
  section.append(element("summary","Review native land-use defaults"),element("p",
    "Use the matching land-use table from the same ICM model revision. Review inherited population separately from model connectivity and profile. Daily regulatory allowances still require project evidence."),
    label,bases.group,resolve,message,output,acceptance.group);
  return {section,current:()=>review&&{...review,applyPopulation:acceptance.controls.accepted.checked}};
}

function mountCatchmentImport(article,form,catchments,worker) {
  const definitions=[["id","Catchment ID","subcatchment_id"],["population","Reviewed population","population"],
    ["domestic_l_head_day","Reviewed domestic allowance (L/head/day)",null],
    ["infiltration_l_day","Reviewed infiltration (L/day)",null],["trade_l_day","Reviewed trade (L/day)",null]];
  const actionbar=element("div");actionbar.className="actions";
  const notice=element("p");
  const dialog=element("dialog"),heading=element("h3","Review catchment CSV");
  dialog.className="assessment-popup";
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
  let source=null,staged=null,revision=0,mappings={},confirmed=null,contribution=null,defaults=null;
  const open=action("Import catchment CSV",()=>dialog.showModal());
  actionbar.append(open);form.append(actionbar,notice);
  apply.disabled=true;
  function reset(){
    staged=null;content.replaceChildren();mappings={};confirmed=null;contribution=null;defaults=null;apply.disabled=true;
  }
  dialog.addEventListener("close",()=>{
    revision++;reset();upload.value="";message.textContent="";
  });
  upload.addEventListener("change",async()=>{
    const generation=++revision,file=upload.files[0];
    reset();if(!file)return;
    message.textContent="Validating imported rows…";
    try{
      const {data,filename,fingerprint}=await readLocalCSV(file,"catchment",text=>worker("preview_design_catchments",{text}));
      if(generation!==revision)return;
      staged={data,filename,fingerprint};
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
      const topology=element("section");
      const trace=action("Review network contributions",async()=>{
        trace.disabled=true;
        try{
          await window.ICMNetworkSchematic?.open();
          if(generation!==revision||!dialog.open)return;
          contribution=stageContributionReview(staged,mappings.id,topology);
        }catch(error){if(generation===revision)message.textContent=error.message;}
        finally{if(!contribution)trace.disabled=false;}
      });
      defaults=mountLandUseReview(staged,worker);
      content.append(fields,element("p","Blank and inherited values require explicit input. Model base flow and nominal trade flow need a separate review before they can be used as daily allowances."),
        check.label,defaults.section,trace,topology);
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
    const inheritance=defaults?.current(),populations=new Map();
    if(inheritance?.applyPopulation){
      const heading=key=>data.header[choices[key]]?.toLowerCase();
      if(heading("id")!=="subcatchment_id"||choices.population!==null&&heading("population")!=="population"){
        message.textContent="Use the native subcatchment ID and population mapping to apply inherited population.";return;
      }
      for(const row of inheritance.result.rows)if(row.population.basis==="land use")populations.set(row.line,row.population.value);
    }
    const appliedPopulation=[];
    let missing=0;
    const rows=data.rows.map(({line,cells})=>{
      const result={classification:""};
      for(const [key,i] of Object.entries(choices)){
        const raw=String(i===null?"":cells[i]).trim();
        if(key==="id"){
          result.id=raw;
          continue;
        }
        if(i!==null&&/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)&&Number.isFinite(Number(raw)*scales[key]))result[key]=Number(raw)*scales[key];
        else if(key==="population"&&populations.has(line)){
          result[key]=populations.get(line);appliedPopulation.push(line);
        }else missing++;
      }
      return result;
    });
    if(rows.some(row=>!row.id||row.id.length>128)){
      message.textContent="Each imported row needs a catchment ID within 128 characters.";
      return;
    }
    if(!contribution&&new Set(rows.map(row=>row.id.toLowerCase())).size!==rows.length){
      message.textContent="The mapped catchment IDs contain duplicates. Review the source rows.";
      return;
    }
    let reviewed=null;
    try{if(contribution)reviewed=contribution(rows);}catch(error){message.textContent=error.message;return;}
    source={filename,fingerprint,choices,scales,data,reviewed,inheritance,appliedPopulation};
    const loaded=reviewed?.rows||rows;
    catchments.replace(loaded);
    notice.textContent=loaded.length+" rows loaded from "+filename+". Review every classification and resolve "+missing+" missing or unmapped allowance fields.";
    dialog.close();open.focus();
  }
  function audit(){
    if(!source)return [];
    const {filename,fingerprint,choices,scales,data,reviewed,inheritance,appliedPopulation}=source;
    const mapped=definitions.filter(([key])=>choices[key]!==null);
    const native=inheritance?[["Model-default review method",inheritance.result.method],["Land-use export",inheritance.filename,inheritance.fingerprint],
      ["ICM revision and basis",inheritance.note],["Area and population-density units",inheritance.result.area_unit,inheritance.result.density_unit],
      ["Population default applied to source lines",...appliedPopulation],...inheritance.result.rows.flatMap(row=>[
        ["Land use",row.line,row.id,row.land_use_id,row.land_line],
        ...["population","connectivity","wastewater_profile"].map(key=>[key,row[key].value,row[key].basis,row[key].source_line]),
        ...Object.entries(row.source_attributes).map(([key,value])=>["Original subcatchment",key,value,row.source_units[key]]),
        ...Object.entries(row.land_attributes).map(([key,value])=>["Original land-use default",key,value])])]:[];
    return [["Imported file",filename],["Source SHA-256",fingerprint],["Source schema",data.schema],
      ...mapped.map(([key,title])=>[title,data.header[choices[key]],data.units?.[choices[key]]??"Reviewed units","Conversion factor",scales[key]]),
      ["Original source line",...mapped.map(([key])=>data.header[choices[key]])],
      ...data.rows.map(row=>[row.line,...mapped.map(([key])=>row.cells[choices[key]])]),...native,...(reviewed?.audit||[])];
  }
  return {audit,assertCurrent(){
    if(source?.reviewed&&readNetworkBasis().stamp!==source.reviewed.stamp)throw new Error("Network topology changed. Review catchment allocations again.");
  }};
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
    return {content,isCurrent:()=>reviewInputs(source)?.signature===signature,
      summary:r.stop_reason?"Partial period. Routing stopped at the first "+r.stop_reason+".":"Storage routing completed for the selected period.",
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
  refresh();
}

function mountStructures(worker) {
  const article=panel("tab-hydraulic-structures","Hydraulic structure screening",
    "Use steady water levels in one datum and a measured or justified discharge coefficient. Check approach effects, venting and gate geometry before relying on the screen.");
  const form=element("form");form.id="structureScreenForm";
  const inputs=fields([
    {key:"kind",label:"Structure",options:[["sharp-crested-weir","Sharp-crested rectangular weir"],["orifice","Orifice"],["sluice","Sluice gate"]]},
    number("level_up","Nominal upstream water level (m)",-1e5,1e5),number("level_down","Nominal downstream water level (m)",-1e5,1e5),
    number("sill_m","Crest or opening invert level (m)",-1e5,1e5),{key:"datum",label:"Common vertical datum",type:"text",maxLength:128},
    {key:"orifice_shape",label:"Orifice shape",options:[["rectangular","Rectangular"],["circular","Circular"]]},
    number("width_m","Effective width (m)",1e-6,10000),number("opening_m","Opening height or diameter (m)",1e-6,10000),
    {...number("coefficient","Free-flow discharge coefficient",1e-9,1),required:false},
    {...number("submerged_coefficient","Submerged-opening discharge coefficient",1e-9,1),required:false},
    {key:"coefficientEvidence",label:"Coefficient source and applicable range",type:"text",maxLength:2000},
    {key:"allow_reverse",label:"Confirm symmetric, reversible flow",type:"checkbox",required:false},
    {key:"applicability_confirmed",label:"I reviewed the setup, datum and applicability",type:"checkbox"}
  ]);
  form.append(inputs.group);
  function showControl(key,shown,required=false) {
    const control=inputs.controls[key];control.parentElement.hidden=!shown;control.disabled=!shown;control.required=shown&&required;
  }
  function configure() {
    const kind=inputs.controls.kind.value,orifice=kind==="orifice",weir=kind==="sharp-crested-weir";
    const circular=orifice&&inputs.controls.orifice_shape.value==="circular";
    showControl("orifice_shape",orifice,true);showControl("width_m",!circular,true);
    showControl("opening_m",!weir,true);showControl("submerged_coefficient",!weir);
  }
  inputs.controls.kind.onchange=configure;inputs.controls.orifice_shape.onchange=configure;configure();
  const clean=value=>typeof value==="number"&&!Number.isFinite(value)?null:value;
  const reference="USBR Water Measurement Manual chapters 2, 7 and 9, USBR PAP-0668 and USACE HEC-RAS Hydraulic Reference Manual gated spillways";
  results(article,form,async()=>{
    const {coefficientEvidence,...values}=inputs.values();
    const arguments_=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,inputs.controls[key].disabled?null:clean(value)]));
    const r=await worker("hydraulic_structure",{inputs:arguments_});
    const metrics=[["Regime",r.regime],["Flow (m³/s)",r.flow_m3_s],["Flow (L/s)",r.flow_m3_s===null?null:1000*r.flow_m3_s],
      ["Signed level difference (m)",r.signed_level_difference_m],["Headwater rise above sill (m)",r.high_head_m],
      ["Tailwater rise above sill (m)",r.low_head_m],["Tailwater ratio",r.tailwater_ratio],["Effective head (m)",r.effective_head_m],
      ["Opening area (m²)",r.area_m2],["Discharge coefficient used",r.coefficient_used],["Equation",r.equation]];
    return {content:[table(["Quantity","Value"],metrics,"Steady discharge screen"),element("p",r.explanation)],
      summary:r.status==="available"?"Hydraulic structure screen completed.":"Discharge withheld for the selected conditions.",filename:"hydra-structure-screening.csv",
      rows:[["Method",r.method],["References",reference],["Coefficient source and applicability",coefficientEvidence],
        ...Object.entries(arguments_),...metrics,["Review note",r.explanation]]};
  });

  const ratingForm=element("form");ratingForm.id="structureRatingForm";
  ratingForm.append(element("h3","Supplied control rating"),element("p","Use a passive, increasing head-difference rating measured for this configuration. The screen uses linear interpolation within the supplied range."));
  const settings=fields([number("head_difference_m","Signed level difference (m)",-1e5,1e5),
    {key:"provenance",label:"Rating source and configuration",type:"text",maxLength:2000},
    {key:"reversible",label:"Confirm rating is symmetric in reverse",type:"checkbox",required:false}]);
  const rating=editableRows("Rated head and flow pairs",[number("head","Head difference (m)",0,1e5),number("flow","Discharge (m³/s)",0,1e5)],[{},{}],undefined,2);
  ratingForm.append(settings.group,rating.wrapper);
  results(article,ratingForm,async()=>{
    const {provenance,...input}=settings.values(),points=rating.values().map(row=>[row.head,row.flow]);
    const r=await worker("hydraulic_control_rating",{...input,points});
    const metrics=[["Status",r.status],["Signed level difference (m)",r.signed_head_difference_m],["Flow (m³/s)",r.flow_m3_s],
      ["Flow (L/s)",r.flow_m3_s===null?null:r.flow_m3_s*1000]];
    const message={available:"Rated discharge interpolated.","outside-curve":"The head difference is outside the measured range.",
      "reverse-not-confirmed":"Confirm that the supplied rating applies in reverse."}[r.status];
    return {content:[table(["Quantity","Value"],metrics,"Rated discharge"),
      chart([{label:"Supplied rating",points,color:"#136b7f",markers:true}],"Head difference (m)","Discharge (m³/s)")],
      summary:message,filename:"hydra-control-rating.csv",rows:[["Method",r.method],["Rating source",provenance],
        ["Equation","Q = Q₁ + (Q₂ − Q₁)(|ΔH| − H₁)/(H₂ − H₁) within a rated segment. Apply the reviewed flow direction."],
        ["Interpolation",r.interpolation],["Reversibility confirmed",r.reversible],...metrics,["Head difference (m)","Discharge (m³/s)"],...points]};
  });
}

function mountWastewaterChecks(worker) {
  const loading=panel("tab-design-foul","Peak foul flow for a new wastewater network",
    "Apply Uisce Éireann CDS-5030-03 Revision 3, Appendix C, section 2.2, Equation 1. Enter the reviewed design population, separate loads and peaking factors.");
  const loadForm=element("form");loadForm.id="foulLoadingForm";
  const loads=fields([number("population","Design population",0,1e9),
    number("domestic_l_head_day","Domestic allowance (L/head/day)",0,1e6),
    number("commercial_l_day","Commercial domestic load (L/day)",0,1e15),
    number("infiltration_l_day","Infiltration (L/day)",0,1e15),number("trade_l_day","Trade flow (L/day)",0,1e15),
    number("domestic_factor","Reviewed domestic peaking factor",1,1000),
    number("commercial_factor","Reviewed commercial peaking factor",1,1000),
    number("trade_factor","Reviewed trade peaking factor",1,1000),
    {key:"evidence",label:"Source, factor basis and design horizon",type:"text",maxLength:2000},
    {key:"applies",label:"I reviewed the new-network foul loading basis and the distinct inputs",type:"checkbox"}]);
  loadForm.append(loads.group);
  results(loading,loadForm,async()=>{
    const {evidence,applies,...inputs}=loads.values();
    if(!applies||!evidence)throw new Error("Confirm applicability and record the basis for each load and peaking factor.");
    const r=await worker("uisce_peak_foul_flow",{inputs});
    const metrics=[["Base domestic (L/day)",r.base_domestic_l_day],["Peaked domestic (L/day)",r.peak_domestic_l_day],
      ["Peaked commercial domestic (L/day)",r.peak_commercial_l_day],["Infiltration (L/day)",r.infiltration_l_day],
      ["Peaked trade (L/day)",r.peak_trade_l_day],["Design foul flow (L/day)",r.peak_l_day],
      ["Design foul flow (L/s)",r.peak_l_s],["Design foul flow (m³/s)",r.peak_m3_s]];
    const note="This is the Equation 1 foul-loading case. Review misconnection allowances, surcharge and flooding in the separate design cases.";
    return {content:[table(["Component","Value"],metrics,"Peak foul loading"),element("p",note)],
      summary:"Reviewed peak foul flow calculated.",filename:"hydra-uisce-peak-foul-flow.csv",
      rows:[["Method",r.method],["Reference",r.reference],["Equation","Foul flow = f_dom PG + f_com PₑGₑ + I + f_trade E"],
        ["Evidence",evidence],...Object.entries(inputs),...metrics,["Applicability",note]]};
  });

  const section=panel("tab-section-check","Circular gravity section velocity and shear",
    "Use the measured or calculated discharge and depth for one section. Choose a project-specific cleansing velocity threshold and record its source.");
  const form=element("form");form.id="gravitySectionReviewForm";
  const settings=fields([number("diameter_m","Internal diameter (m)",.001,20),number("depth_m","Flow depth (m)",0,20),
    number("flow_m3_s","Discharge (m³/s)",0,1000),number("minimum_velocity_m_s","Project velocity threshold (m/s)",.001,20),
    number("energy_gradient","Energy gradient (m/m)",0,1),number("density_kg_m3","Fluid density (kg/m³)",100,3000),
    {key:"uniform_confirmed",label:"Steady uniform flow and the energy gradient are reviewed for mean shear",type:"checkbox",required:false},
    {key:"evidence",label:"Discharge, depth, gradient and velocity criterion basis",type:"text",maxLength:2000}],{density_kg_m3:1000});
  form.append(settings.group);
  results(section,form,async()=>{
    const {evidence,...inputs}=settings.values();
    if(!evidence)throw new Error("Record the source of the section values and the project velocity threshold.");
    const r=await worker("circular_gravity_section_review",{inputs});
    const metrics=[["Wetted area (m²)",r.area_m2],["Hydraulic radius (m)",r.hydraulic_radius_m],["Mean velocity (m/s)",r.velocity_m_s],
      ["Project velocity screen",r.velocity_status],["Flow at threshold and fixed wetted area (m³/s)",r.flow_at_minimum_m3_s],
      ["Mean boundary shear (Pa)",r.mean_shear_pa]];
    const note=r.mean_shear_pa===null?"Mean shear needs a wetted section and reviewed uniform-flow conditions.":
      "Mean shear describes the full wetted perimeter. Assess local sediment and near-bed conditions separately.";
    return {content:[table(["Quantity","Value"],metrics,"Circular section results"),element("p",note)],
      summary:"Circular gravity section reviewed.",filename:"hydra-gravity-velocity-and-shear.csv",
      rows:[["Method",r.method],["Reference","FHWA Hydraulic Design Series No. 4, Introduction to Highway Hydraulics, tractive force"],
        ["Equation","V = Q/A. R = A/P_w. Mean shear = ρgRS_f for steady uniform flow."],
        ["Evidence",evidence],...Object.entries(inputs),...metrics,["Applicability",note]]};
  });
}

function mountContinuationComparisons(form){
  const panel=element("details");
  const inputs=fields([
    {...number("sensitivity","Sensitivity per input (%)",0,100),required:false},
    {...number("permitted","Permit pass-forward flow (L/s)",0,1e9),required:false},
    {key:"permit_note",label:"Permit source and assessed conditions",type:"text",maxLength:2000,required:false},
    {key:"pipe",label:"Compare an eligible native conduit",options:[["","No conduit comparison"]],required:false},
    number("viscosity","Pipe trial kinematic viscosity (m²/s)",1e-9,.01)
  ],{viscosity:.000001});
  const message=element("p");message.setAttribute("role","status");
  const {pipe,viscosity,permitted,permit_note:permitNote}=inputs.controls;
  const find=action("Load conduit choices",async()=>{
    find.disabled=true;
    try{
      await window.ICMNetworkSchematic?.open();
      const previous=pipe.value,{network}=readNetworkBasis();
      const eligible=network.edges.filter(edge=>ICMNetworkCore.conduitTrial(edge));
      pipe.replaceChildren(new Option("No conduit comparison",""),...eligible.map(edge=>new Option(edge.name||edge.id,edge.id)));
      pipe.value=eligible.some(edge=>edge.id===previous)?previous:"";
      message.textContent=eligible.length?eligible.length+" eligible circular conduits. Choose the matching continuation conduit.":
        "No supported conduit has resolved circular geometry, gradient and roughness.";
      update();form.dispatchEvent(new Event("input",{bubbles:true}));
    }catch(error){message.textContent=error.message;}
    finally{find.disabled=false;}
  });
  function update(){
    viscosity.disabled=!pipe.value;viscosity.parentElement.hidden=!pipe.value;
    permitNote.required=permitted.value!=="";
  }
  function pipeDetails(){
    if(!pipe.value)return null;
    const {network}=readNetworkBasis(),edge=network.edges.find(item=>item.id===pipe.value);
    const inputs=ICMNetworkCore.conduitTrial(edge);
    if(!inputs)throw new Error("The selected conduit changed or is no longer eligible. Reload the conduit choices.");
    const source=edge.sourceAttributes;
    return {label:inputs.label,source:[source?.table,source?.row,source?.file],
      inputs:{diameter_m:inputs.diameter/1000,gradient:inputs.gradient,roughness_m:inputs.roughness/1000,
        viscosity_m2_s:viscosity.valueAsNumber}};
  }
  pipe.onchange=update;permitted.oninput=update;update();
  panel.append(element("summary","Sensitivity and comparisons"),
    element("p","Vary each input independently. Review the permit setting and steady uniform full-pipe capacity as separate comparisons."),
    find,message,inputs.group);
  form.append(panel);
  return {pipeDetails,values(){
    const {sensitivity,permitted,permit_note}=inputs.values();
    return {sensitivity_percent:Number.isFinite(sensitivity)?sensitivity:null,
      permitted:Number.isFinite(permitted)?{flow_l_s:permitted,evidence:permit_note}:null};
  }};
}

let continuationTransfer=0;
function mountContinuationSimulation(form,navigate,worker){
  const details=element("details"),section=element("fieldset"),message=element("p");
  message.setAttribute("role","status");
  const enable=fields([{key:"modelled",label:"Include a modelled continuation review",type:"checkbox",required:false}]);
  const configuration=fields([
    {key:"start",label:"Review start (project clock)",type:"datetime-local",step:.001},
    {key:"end",label:"Review end (project clock)",type:"datetime-local",step:.001},
    number("gap","Maximum supported sample gap (s)",.001,31536000),
    number("threshold","Overflow flow threshold (L/s)",0,1e12),
    {key:"evidence",label:"Reviewed overflow and continuation locations and basis",type:"text",maxLength:2000},
    {key:"confirmed",label:"Both links belong to this assessment point and use the same reviewed run and project clock",type:"checkbox"}
  ],{gap:900,threshold:0});
  const {modelled}=enable.controls;
  const sameRun=(a,b)=>a&&b&&["simulation","modelRevision","scenario","event","temporalSupport"].every(key=>a[key]===b[key]);
  const loaded=()=>window.HydraResultsWorkspace?.session?.sources()||[];
  const label=column=>`${column.asset.table.slice(3).replaceAll("_"," ")} ${column.asset.upstream}.${column.asset.suffix} · ${column.location}`;
  const isFlow=column=>column.quantity==="flow"&&column.unit==="m³/s"&&column.asset.kind==="link";
  const invalidateReview=()=>{
    configuration.controls.confirmed.checked=false;
    form.dispatchEvent(new Event("input",{bubbles:true}));
  };
  function sourcePicker(role){
    const picker=fields([
      {key:"source",label:role+" results source",options:[["","Choose a source"]]},
      {key:"filter",label:"Filter "+role.toLowerCase()+" link IDs",type:"search",maxLength:160,required:false},
      {key:"series",label:role+" link and end",options:[["","Choose a link result"]]},
      {key:"direction",label:role+" positive direction",options:[["","Review direction"],
        ["1","As reported"],["-1","Reverse reported sign"]]}
    ]);
    const {source,series,filter,direction}=picker.controls;
    const summary=element("p");
    const getSource=()=>loaded().find(item=>String(item.sourceId)===source.value);
    const selected=()=>{
      const item=getSource();
      return {source:item,column:item?.columns.find(col=>col.series===series.value),direction:Number(direction.value)};
    };
    function refreshLinks(){
      const previous=series.value,item=getSource(),query=filter.value.trim().toLowerCase();
      const choices=item?.columns.filter(column=>isFlow(column)&&label(column).toLowerCase().includes(query))||[];
      const shown=choices.slice(0,100),current=choices.find(column=>column.series===previous);
      if(current&&!shown.includes(current))shown.push(current);
      series.replaceChildren(new Option("Choose a link result",""),...shown.map(column=>new Option(label(column),column.series)));
      series.value=current?previous:"";
      filter.disabled=!item;series.disabled=!item;direction.disabled=!item;
      summary.textContent=item?`${choices.length} matching link results. ${choices.length>100?"Filter by the typed link ID to narrow the list.":""}`:"";
    }
    function refreshSources(sources){
      const prior=source.value;
      source.replaceChildren(new Option("Choose a source",""),...sources.map(item=>
        new Option(`${item.scenario} · ${item.event} · ${item.filename}`,item.sourceId)));
      source.value=sources.some(item=>String(item.sourceId)===prior)?prior:"";
      refreshLinks();
    }
    filter.oninput=()=>{const prior=series.value;refreshLinks();if(prior!==series.value)invalidateReview();};
    series.onchange=direction.onchange=invalidateReview;
    return {group:picker.group,summary,controls:picker.controls,selected,refreshSources};
  }
  const overflow=sourcePicker("Overflow"),continuation=sourcePicker("Continuation");
  function refresh(){
    const sources=loaded().filter(source=>source.columns.some(isFlow));
    overflow.refreshSources(sources);
    continuation.refreshSources(sources.filter(source=>sameRun(source,overflow.selected().source)));
    message.textContent=sources.length?"Choose the two typed link results and confirm their use for this assessment point.":
      "Index the overflow and continuation link-end flow exports in Simulation results.";
  }
  overflow.controls.source.onchange=continuation.controls.source.onchange=()=>{refresh();invalidateReview();};
  const signature=()=>JSON.stringify([overflow,continuation].map(picker=>{
    const {source,column}=picker.selected();return [source?.sourceId,source?.fingerprint?.digest,column?.series];
  }));
  window.addEventListener("icm:simulation-sources-changed",()=>{
    const prior=signature();
    const choices=[overflow,continuation].map(picker=>[picker.controls.source.value,picker.controls.series.value]);
    refresh();
    if(modelled.checked&&(prior!==signature()||[overflow,continuation].some((picker,index)=>
      choices[index][0]!==picker.controls.source.value||choices[index][1]!==picker.controls.series.value)))invalidateReview();
  });
  modelled.onchange=()=>{section.hidden=section.disabled=!modelled.checked;if(modelled.checked)refresh();};
  section.hidden=section.disabled=true;
  section.append(element("legend","Modelled spill-period evidence"),
    action("Open simulation results",()=>navigate("network","simulation-results",true)),message,
    overflow.group,overflow.summary,continuation.group,continuation.summary,configuration.group);
  details.append(element("summary","Modelled continuation during spills"),enable.group,section);
  form.append(details);
  return async required=>{
    if(!modelled.checked)return {content:[],rows:[],exportRows:[]};
    const spill=overflow.selected(),pass=continuation.selected(),reviewed=configuration.values();
    if(!spill.column||!pass.column||!sameRun(spill.source,pass.source)||spill.column.key===pass.column.key)
      throw new Error("Choose two distinct links from the same simulation, model revision, scenario and event.");
    if(!reviewed.evidence||!reviewed.confirmed)throw new Error("Confirm and record the linked model evidence.");
    const clock=value=>Date.parse(value+"Z"),start=clock(reviewed.start),end=clock(reviewed.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error("Choose an increasing project-clock review window.");
    const session=window.HydraResultsWorkspace.session,basis=signature(),pad=Math.ceil(reviewed.gap*1000);
    const samples=await Promise.all([spill,pass].map(item=>
      session.seriesWindow(item.source.sourceId,item.column.series,start-pad,end+pad)));
    const values=samples.flatMap(item=>[item.times,item.values]);
    const packed=new ArrayBuffer(values.reduce((size,value)=>size+value.byteLength,0));
    const view=new DataView(packed);
    let position=0;
    for(const channel of values)for(const value of channel){view.setFloat64(position,value,true);position+=8;}
    const path=`/data/hb-continuation-review-${++continuationTransfer}.bin`;
    await ensureEngineBoot();
    await engine.addFile({virtualPath:path},new Uint8Array(packed));
    let result;
    try{
      result=await worker("modelled_continuation_result",{path,overflow_count:samples[0].times.length,
        continuation_count:samples[1].times.length,start_ms:start,end_ms:end,maximum_gap_seconds:reviewed.gap,
        spill_threshold_m3_s:reviewed.threshold/1000,overflow_direction:spill.direction,continuation_direction:pass.direction,
        required_m3_s:required});
    }finally{await engine.removeFile(path);}
    if(basis!==signature())throw new Error("The selected result sources changed. Recalculate the review.");
    const metrics=[["Evidence coverage",result.status],["Review period (s)",result.review_seconds],
      ["Overflow signal supported (s)",result.overflow_valid_seconds],["Overflow signal unknown (s)",result.overflow_unknown_seconds],
      ["Detected physical spill time (s)",result.physical_spill_seconds],
      ["Continuation supported during detected spills (s)",result.continuation_valid_seconds],
      ["Continuation unknown during detected spills (s)",result.continuation_unknown_seconds],
      ["Supported continuation deficit (m³)",result.deficit_m3],["Supported volume above requirement (m³)",result.above_requirement_m3]];
    const headings=["Physical spill start","Physical spill end","Spill (s)","Supported (s)","Unknown (s)","Deficit (m³)","Above requirement (m³)"];
    const rows=result.rows.map(row=>[row.start,row.end,row.spill_seconds,row.valid_seconds,row.unknown_seconds,row.deficit_m3,row.above_requirement_m3]);
    const content=[table(["Quantity","Value"],metrics,"Modelled continuation during physical spills"),
      element("p","Volumes apply to supported segments. The calculation uses bounded linear support between recorded samples on each channel. Review evidence gaps and the applicable consent conditions.")];
    if(rows.length)content.push(table(headings,rows.slice(0,100),"Physical spill interval evidence"));
    if(rows.length>100)content.push(element("p",`The first 100 intervals are shown. The calculation CSV contains all ${rows.length} intervals.`));
    const provenance=[...["simulation","modelRevision","scenario","event"].map(key=>[key,spill.source[key]]),
      ...[["Overflow",spill],["Continuation",pass]].map(([role,item])=>[role,label(item.column),item.column.sourceAttribute,
        item.column.sourceUnit,item.source.filename,item.source.fingerprint.digest,item.direction,item.column.asset.table])];
    return {content,rows:[["Modelled continuation method",result.method],
      ["Review start and end (project clock)",result.start,result.end],["Overflow threshold (L/s)",reviewed.threshold],
      ["Maximum supported sample gap (s)",reviewed.gap],["Reviewed simulation evidence",reviewed.evidence],...provenance,...metrics],
      exportRows:rows.length?[headings,...rows]:[]};
  };
}

function mount(navigate) {
  const worker=async (api,args)=>{await ensureEngineBoot();return engine.call(api,args);};
  mountStorageRouting(navigate,worker);
  mountStructures(worker);
  mountWastewaterChecks(worker);
  const system=panel("tab-pipe-system","Pipe head loss and system curves",
    "Use steady flow in full circular pipes. Stages are in series and branches within a stage are in parallel. Static head includes elevation and pressure head differences.");
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
    const headers=[...systemHeaders], assumptions=[];
    if (design.calculated()) {
      headers.push("Absolute roughness (mm)","Reynolds number","Regime");
      detail.forEach((row,index)=>row.push(r.rows[index].roughness_m*1000,r.rows[index].reynolds,r.rows[index].regime));
      assumptions.push(["Kinematic viscosity (m²/s)",r.viscosity_m2_s],
        ["Reference","Colebrook (1939) and DOE Fundamentals Handbook, Fluid Flow"],
        ["Supported-flow limits","The curve has gaps where at least one pipe lacks a supported flow regime."]);
    }
    const content=[table(["Quantity","Value"],metrics,"System duty")];
    if (detail.length) content.push(table(headers,detail,"Pipe loss contributions"));
    content.push(chart([{label:"System head",points:r.curve,color:"#136b7f"}]));
    if (assumptions.length) content.push(element("p",assumptions.at(-1)[1]));
    return {content,summary:r.total_head_m===null?"Duty withheld because a branch has no supported flow regime.":"System curve calculated.",
      filename:"hydra-pipe-system.csv",rows:[["Method",r.method],["Reference",pumpReference],...assumptions,
        ["Equation","H = Hstatic + Σ(fL/D + K) V²/(2g) along each path"],...metrics,headers,...detail,
        ["Curve flow (m³/s)","Curve head (m)"],...r.curve]};
  });

  const pump=panel("tab-pump-duty","Pump duty screening",
    "Compare a supplied curve with a system using specified Darcy factors. Identical pumps in series add head and identical pumps in parallel add flow.");
  pump.append(action("Edit pipe system",()=>navigate("hydraulics","system-curve",true)));
  const pumpForm=element("form");pumpForm.id="pumpDutyForm";
  const pumpControls=fields([{key:"arrangement",label:"Arrangement",options:[
    ["single","Single pump"],["series","Identical pumps in series"],["parallel","Identical pumps in parallel"]]},
    number("pump_count","Number of pumps",1,20,1),number("density_kg_m3","Fluid density (kg/m³)",100,3000),
    {...number("efficiency","Overall efficiency (%)",1,100),required:false}],{pump_count:1});
  const points=editableRows("Pump curve points",pumpFields,[{},{}],undefined,2,500);
  pumpForm.append(pumpControls.group);
  const curveProvenance=mountPumpImport(pump,pumpForm,points,worker);
  pumpForm.append(points.wrapper);
  const invalidatePump=results(pump,pumpForm,async()=>{
    // Pump duty uses the system geometry and static head. Display and selected
    // head-loss duty flows belong to the other calculation.
    const staticHead=design.settings.controls.static_head_m;
    if (design.calculated()) throw new Error("Select fixed Darcy friction in System curve before calculating pump duty.");
    if (!staticHead.checkValidity() || [...design.pipes.wrapper.querySelectorAll("input")].some(input=>!input.checkValidity())) {
      throw new Error("Enter valid pipe branches and static head under System curve first.");
    }
    const {efficiency,...args}=pumpControls.values();
    const supplied=points.values().map(p=>[p.flow,p.head]),stages=design.stages();
    const staticHeadM=read(staticHead);
    const r=await worker("pump_system_duty",{...args,static_head_m:staticHeadM,stages,
      points:supplied,efficiency:Number.isNaN(efficiency)?null:efficiency/100});
    const header=["Flow (m³/s)","Head (m)","Hydraulic power (kW)","Input power (kW)","Local slope indication"];
    const duties=r.duties.map(d=>[d.flow_m3_s,d.head_m,d.hydraulic_kw,d.input_kw,d.local_slope]);
    return {content:[chart([{label:"System head",points:r.system_curve,color:"#136b7f"},
      {label:"Supplied pump curve",points:r.pump_curve,color:"#72559d"}]),table(header,duties,"Intersections"),
      element("p","Slope indicates the local residual trend. Review manufacturer operating limits and system dynamics before selecting a duty point.")],
      summary:duties.length?duties.length+" supported intersection(s) in the supplied range.":"No intersection within the supplied pump range.",
      filename:"hydra-pump-duty.csv",rows:[["Method",r.method],["Reference",pumpReference],["Interpolation","Linear pump segments within measured range"],
        ["Equations","Hpump(Q) = Hstatic + RQ² at an intersection. Pwater = ρgQH/1000 kW. Pinput = Pwater/η."],
        ...curveProvenance(supplied),
        ["Static head (m)",staticHeadM],["Arrangement",args.arrangement],["Identical pumps",args.pump_count],["Density (kg/m³)",args.density_kg_m3],
        ["Overall efficiency (%)",Number.isNaN(efficiency)?null:efficiency],header,...duties,
        ["System stage","Branch","Diameter (m)","Length (m)","Darcy f","Fittings K","Entrance K","Exit K"],
        ...stages.flatMap((branches,stage)=>branches.map((pipe,branch)=>[stage+1,branch+1,pipe.diameter_m,pipe.length_m,
          pipe.darcy_factor,pipe.minor_k,pipe.entrance_k,pipe.exit_k])),
        ["Supplied single-pump flow (m³/s)","Supplied head (m)"],...supplied,
        ["System curve flow (m³/s)","Head (m)"],...r.system_curve,["Composite pump curve flow (m³/s)","Head (m)"],...r.pump_curve]};
  });
  systemForm.addEventListener("input",invalidatePump);
  systemForm.addEventListener("change",invalidatePump);

  const formula=panel("tab-formula-a","Formula A and wastewater design flows",
    "Choose the applicable permitting framework and enter reviewed daily allowances for the retained continuation flow.");
  const form=element("form");form.id="designFlowForm";
  const framework=fields([{key:"framework",label:"Permitting framework",options:[
    ["england","England · Environment Agency"],["scotland","Scotland · SEPA low-significance inland discharges"],
    ["wales","Wales · Natural Resources Wales GN066"],["ireland","Ireland · EPA-published combined method"],
    ["documented","Documented project method"]]}],{framework:"england"});
  const scotland=fields([number("dilution","River-to-DWF dilution at low river flow (ratio)",0,1e12),
    number("population_equivalent","Discharge population equivalent (PE)",0,1e9),
    {key:"evidence",label:"Permit and low-significance evidence",type:"text",maxLength:2000},
    {key:"inland",label:"Receiving waters are inland",type:"checkbox"},
    {key:"no_interaction",label:"No interaction with other discharges",type:"checkbox"},
    {key:"imax_confirmed",label:"All reviewed infiltration allowances represent maximum infiltration (Imax)",type:"checkbox"},
    {key:"simpler_combined",label:"Review the simpler combined equation for a mixed catchment",type:"checkbox",required:false}]);
  const simpler=fields([number("separate_fraction_percent","Reviewed separately drained share (%)",0,100),
    {key:"allocation_basis",label:"Separate-drainage allocation basis",type:"text",maxLength:2000}]);
  const details=element("fieldset"),methodNote=element("p");
  details.append(element("legend","SEPA applicability"),
    element("p","Review low-significance inland classification with the project team. Dilution must exceed 8:1 on the guidance basis, PE must be below 10,000 and interactions must be absent."),
    scotland.group,simpler.group);
  const project=fields([
    {key:"name",label:"Documented method name",type:"text",maxLength:128},
    {key:"reference",label:"Reference and revision",type:"text",maxLength:512},
    {key:"evidence",label:"Project methodology and applicability evidence",type:"text",maxLength:2000},
    number("domestic_factor","Factor on domestic load",0,1000),
    number("infiltration_factor","Factor on infiltration",0,1000),
    number("trade_factor","Factor on trade effluent",0,1000),
    number("population_allowance_l_head_day","Additional population allowance (L/head/day)",0,1e6)]);
  const projectSection=element("fieldset");
  projectSection.append(element("legend","Documented additive method"),project.group);
  const reviewed=fields([{key:"evidence",label:"Permit and framework applicability evidence",type:"text",maxLength:2000}]);
  const frameworkKey=()=>framework.controls.framework.value;
  const separateLabel=()=>["scotland","documented"].includes(frameworkKey())?"Reviewed separate foul":"Qualifying separate foul";
  const references={england:eaReference,scotland:sepaReference,wales:"NRW GN066, version 2.0, July 2026, section 2.7",
    ireland:"Department of the Environment, Procedures and Criteria in relation to Storm Water Overflows, section 6.2, published by the EPA"};
  const catchments=editableRows("Catchment",catchmentFields,[{classification:"combined"}],controls=>{
    configureCatchment(controls);
    const option=controls.classification.querySelector('[value="qualifying-separate"]');
    option.textContent=separateLabel();option.disabled=frameworkKey()==="ireland";
  });
  function showFramework(){
    const selected=frameworkKey(),sepa=selected==="scotland",optional=sepa&&scotland.controls.simpler_combined.checked;
    const documented=selected==="documented",permit=["wales","ireland"].includes(selected);
    details.hidden=!sepa;simpler.group.hidden=!optional;projectSection.hidden=!documented;reviewed.group.hidden=!permit;
    for(const input of Object.values(scotland.controls))input.disabled=!sepa;
    for(const input of Object.values(simpler.controls))input.disabled=!optional;
    for(const input of Object.values(project.controls))input.disabled=!documented;
    reviewed.controls.evidence.disabled=!permit;
    for(const option of catchments.wrapper.querySelectorAll('option[value="qualifying-separate"]')){
      option.textContent=separateLabel();option.disabled=selected==="ireland";
    }
    methodNote.textContent={
      scotland:"Use reviewed Imax allowances and explicit allocations to combined and separate foul rows.",
      ireland:"Use the reviewed combined design basis for the EPA-published minimum setting. Add a documented project method for a separate allowance.",
      documented:"Use these factors only when they reproduce the documented project equation. Enter zero for terms absent from the method."
    }[selected]||"Record the design and current separation evidence and confirm minimal storm response at or below 3DWF for each qualifying row.";
  }
  framework.controls.framework.onchange=()=>{
    scotland.controls.imax_confirmed.checked=false;reviewed.controls.evidence.value="";showFramework();
  };
  scotland.controls.simpler_combined.onchange=showFramework;
  form.append(framework.group,details,reviewed.group,projectSection,methodNote,catchments.wrapper);showFramework();
  const catchmentSource=mountCatchmentImport(formula,form,catchments,worker);
  const comparisons=mountContinuationComparisons(form);
  const modelledContinuation=mountContinuationSimulation(form,navigate,worker);
  let lastTrial=null;
  const invalidateFormula=results(formula,form,async()=>{
    catchmentSource.assertCurrent();
    const selected=frameworkKey(),sepa=selected==="scotland",documented=selected==="documented";
    const trial=comparisons.pipeDetails(),trialSignature=trial?JSON.stringify(trial):null;
    const args={catchments:catchments.values(),framework:selected,pipe:trial?.inputs??null,...comparisons.values()};
    if(sepa)args.basis={...scotland.values(),...simpler.values()};
    if(["wales","ireland"].includes(selected))args.basis=reviewed.values().evidence;
    if(documented)args.basis=project.values();
    const r=await worker("review_continuation_flow",args);
    const simulation=await modelledContinuation(r.retained_m3_s);
    catchmentSource.assertCurrent();
    if(trialSignature&&trialSignature!==JSON.stringify(comparisons.pipeDetails()))throw new Error("The conduit trial inputs changed. Calculate again.");
    lastTrial=trialSignature;
    const auditBasis=r.applicability?Object.entries(r.applicability):[];
    const components=documented?[
      ["Weighted domestic (L/day)",r.totals.custom_domestic_l_day],["Weighted infiltration (L/day)",r.totals.custom_infiltration_l_day],
      ["Weighted trade (L/day)",r.totals.custom_trade_l_day],["Population supplement (L/day)",r.totals.custom_population_l_day]]:
      [["Population or domestic supplement (L/day)",r.totals.supplement_l_day],["Trade supplement (L/day)",r.totals.trade_supplement_l_day]];
    const metrics=[["Population",r.totals.population],["Combined / partially separate population",r.totals.combined_population],
      [sepa?"Reviewed separate population":"Qualifying separate population",r.totals.separate_population],["Domestic flow (L/day)",r.totals.domestic_l_day],
      [sepa?"Maximum infiltration Imax (L/day)":"Infiltration (L/day)",r.totals.infiltration_l_day],["Trade (L/day)",r.totals.trade_l_day],
      [sepa?"Formula A base flow with Imax (L/day)":"Dry weather flow (L/day)",r.dwf_l_day],...components,["Retained flow (L/day)",r.retained_l_day],
      ["Retained flow (L/s)",r.retained_l_s],["Retained flow (m³/s)",r.retained_m3_s]];
    const heading=["Catchment","Class","Included","Population","Domestic allowance (L/head/day)","Domestic (L/day)",
      "Infiltration (L/day)","Trade (L/day)","Eligibility confirmed","Evidence"];
    const details=r.rows.map(row=>[row.id,row.classification,row.included?"Yes":"Excluded",row.population??null,
      row.domestic_l_head_day??null,row.domestic_l_day??null,row.infiltration_l_day??null,row.trade_l_day??null,
      row.eligibility_confirmed?"Yes":"",row.evidence]);
    const simplerBasis=Boolean(sepa&&r.applicability.separate_fraction_percent!==null);
    const equation=documented?"DWF = sum(PᵢGᵢ) + I + E. Retained flow = kG × domestic + kI × I + kE × E + kP × P.":
      selected==="ireland"?"DWF = sum(PᵢGᵢ) + I + E. Retained flow = DWF + 1360P + 2E.":
      simplerBasis?"Base = sum(PᵢGᵢ) + Imax + E. Retained flow = Base + 1360P + 2E.":
      sepa?"Base = sum(PᵢGᵢ) + Imax + E. Retained flow = Base + 1360Pc + 2 × separate domestic flow + 2E.":
        "DWF = sum(PᵢGᵢ) + I + E. Retained flow = DWF + 1360Pc + 2 × separate domestic flow + 2E.";
    const labels={population:"Population",domestic_l_head_day:"Domestic allowance",infiltration_l_day:"Infiltration",trade_l_day:"Trade"};
    const sensitivityHeader=["Input varied","Lower case (L/day)","Upper case (L/day)","Boundary review"];
    const sensitivityRows=r.sensitivity.map(row=>[labels[row.key],row.low_l_day,row.high_l_day,[row.low_note,row.high_note].filter(Boolean).join(" · ")]);
    const comparisonHeader=["Basis","Available setting (L/s)","Setting minus reviewed flow (L/s)","Screen","Evidence or regime"];
    const comparisonRows=r.comparisons.map(row=>[row.key==="permit"?"Permit pass-forward flow":"Pipe capacity · "+trial.label,
      row.available_l_s,row.difference_l_s,row.status,row.evidence||row.regime]);
    const support=[];
    if(sensitivityRows.length)support.push(table(sensitivityHeader,sensitivityRows,"Independent ±"+r.sensitivity_percent+"% input sensitivity"));
    if(comparisonRows.length)support.push(table(comparisonHeader,comparisonRows,"Independent continuation-flow comparisons"),
      element("p","Capacity assumes steady uniform full-pipe flow. Use measured or simulated evidence to investigate continuation during spills."));
    const isCurrent=()=>{
      try{
        catchmentSource.assertCurrent();
        return !trialSignature||trialSignature===JSON.stringify(comparisons.pipeDetails());
      }catch{return false;}
    };
    return {isCurrent,content:[table(["Quantity","Value"],metrics,r.regime),table(heading,details,"Catchment audit"),
      ...support,...simulation.content,element("p",(documented?r.reference:references[selected])+". Confirm applicability against the project and permit evidence.")],
      summary:"Retained flow calculated from reviewed catchments.",filename:"hydra-"+selected+"-continuation-flow.csv",
      exportRows:simulation.exportRows,
      rows:[["Method",r.method],["Reference",r.reference],["Regime",r.regime],
        ["Equation",equation],...auditBasis,...metrics,heading,...details,...catchmentSource.audit(),
        ...(sensitivityRows.length?[["Sensitivity per input (%)",r.sensitivity_percent],sensitivityHeader,...sensitivityRows]:[]),
        ...(comparisonRows.length?[comparisonHeader,...comparisonRows]:[]),
        ...(trial?[["Source conduit",trial.label],["Source table, row and file",...trial.source],...Object.entries(trial.inputs)]:[]),...simulation.rows]};
  });
  window.addEventListener("icm:route-changed",({detail})=>{
    if(detail.page!=="formula-a")return;
    try{
      catchmentSource.assertCurrent();
      if(lastTrial&&lastTrial!==JSON.stringify(comparisons.pipeDetails()))invalidateFormula();
    }catch{invalidateFormula();}
  });

  const treatment=panel("tab-design-treatment","Dry weather flow and full treatment",
    "Choose the treatment framework. Record separately reviewed dry-weather and maximum infiltration allowances.");
  const treatmentForm=element("form");treatmentForm.id="sepaTreatmentForm";
  const treatmentFields=[number("population","Population served",0,1e9),number("domestic_l_head_day","Domestic (L/head/day)",0,1e6),
    number("infiltration_dwf_l_day","Dry-weather infiltration (L/day)",0,1e15),number("infiltration_max_l_day","Maximum infiltration Imax (L/day)",0,1e15),
    number("trade_l_day","Trade effluent (L/day)",0,1e15),{key:"evidence",label:"Source and design horizon",type:"text",maxLength:2000}];
  const treatmentControls=fields(treatmentFields);
  const options=fields([{key:"framework",label:"Treatment framework",options:[["sepa","Scotland · SEPA WAT-G-065"],
    ["england","England · Environment Agency"]]},
    {key:"seasonal",label:"Review different winter and summer populations or allowances",type:"checkbox",required:false}]);
  const baseGroup=element("fieldset"),baseLegend=element("legend","Annual design flow"),summerGroup=element("fieldset");
  baseGroup.append(baseLegend,treatmentControls.group);
  const summer=fields(treatmentFields.map(spec=>({...spec,key:"summer_"+spec.key,label:"Summer "+spec.label})));
  summerGroup.append(element("legend","Summer design flow"),summer.group);
  const method=element("p");
  function refreshTreatment(){
    const england=options.controls.framework.value==="england";
    const seasonal=england&&options.controls.seasonal.checked;
    options.controls.seasonal.disabled=!england;options.controls.seasonal.parentElement.hidden=!england;
    summerGroup.hidden=!seasonal;
    for(const input of Object.values(summer.controls))input.disabled=!seasonal;
    baseLegend.textContent=seasonal?"Winter design flow":"Annual design flow";
    method.textContent=england?"For a significant summer population increase, review both seasonal cases and use the higher FFT.":
      "Use the design basis under SEPA WAT-G-065 sections 3.2 and 3.3.";
  }
  options.controls.framework.onchange=refreshTreatment;options.controls.seasonal.onchange=refreshTreatment;
  treatmentForm.append(options.group,method,baseGroup,summerGroup);refreshTreatment();
  results(treatment,treatmentForm,async()=>{
    const {evidence,...inputs}=treatmentControls.values();
    if(!evidence)throw new Error("Record the source and design horizon for the treatment allowances.");
    const equationRows=[["DWF equation","PG + Idwf + E"],["FFT equation","3PG + Imax + 3E"]];
    if(options.controls.framework.value==="england"){
      const seasonal=options.controls.seasonal.checked;
      const {evidence:summerBasis,...summerInputs}=Object.fromEntries(Object.entries(summer.values())
        .map(([key,value])=>[key.slice("summer_".length),value]));
      if(seasonal&&!summerBasis)throw new Error("Record a source and design horizon for the summer allowances.");
      const periods=seasonal?{winter:inputs,summer:summerInputs}:{annual:inputs};
      const r=await worker("england_treatment_design_flows",{periods});
      const header=["Period","Domestic (L/day)","DWF (L/day)","DWF (L/s)","DWF (m³/s)","FFT (L/day)","FFT (L/s)","FFT (m³/s)"];
      const rows=r.periods.map(row=>[row.period,row.domestic_l_day,row.dwf_l_day,row.dwf_l_s,row.dwf_m3_s,
        row.fft_l_day,row.fft_l_s,row.fft_m3_s]);
      const governing=r.governing_periods.join(" and ");
      const metrics=[["Governing EA period",governing],["Governing FFT (L/day)",r.fft_l_day],
        ["Governing FFT (L/s)",r.fft_l_s],["Governing FFT (m³/s)",r.fft_m3_s]];
      return {content:[table(["Quantity","Value"],metrics,"Environment Agency design basis"),
        table(header,rows,"Treatment design periods"),element("p","Use the permit and reviewed future design conditions for final design.")],
        summary:"Governing EA FFT calculated for "+governing+".",filename:"hydra-england-treatment-design.csv",
        rows:[["Method",r.method],["Reference",r.reference],...equationRows,[seasonal?"Winter evidence":"Annual evidence",evidence],
          ...(seasonal?[["Summer evidence",summerBasis]]:[]),...Object.entries(periods).flatMap(([period,values])=>
          [["Period",period],...Object.entries(values)]),...metrics,header,...rows]};
    }
    const r=await worker("scotland_treatment_design_flows",{inputs});
    const header=["Quantity","L/day","L/s","m³/s"],rows=[["Dry weather flow",r.dwf_l_day,r.dwf_l_s,r.dwf_m3_s],
      ["Flow to full treatment",r.fft_l_day,r.fft_l_s,r.fft_m3_s]];
    return {content:[table(header,rows,"SEPA treatment design flows"),element("p","DWF uses the reviewed dry-weather allowance. Full treatment uses the reviewed Imax allowance. Read WAT-G-065 sections 3.2 and 3.3 for estimation and permit reporting." )],
      summary:"DWF and full treatment flows calculated.",filename:"hydra-sepa-treatment-design.csv",
      rows:[["Method",r.method],["Reference",r.reference],["Evidence",evidence],...equationRows,
        ...Object.entries(inputs),header,...rows]};
  });
}
window.HydraDesignCalculations={mount,sheetStatus,reportSheets};
})();
