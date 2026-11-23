/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";
const storeKey="icm-pw-recent-pages-v1";
const toolkitJobs=[
  ["network-geometry","Network geometry","Export nodes, selected links and source geometry for Network Schematic."],
  ["simulation-series","Simulation series","Export exact recorded samples for Network Schematic and Data / time series."],
  ["formula-a-catchments","Formula A catchments","Export selected subcatchment fields for reviewed catchment mapping."],
  ["spill-storage-continuation","Spill, storage and continuation flow","Export storage levels and flows from selected links for engineering review."],
  ["monitoring-results","Monitoring results","Export modelled levels, flows and velocities for survey and verification comparisons."],
  ["detriment-results","Detriment results","Export selected water level, flooding and overflow evidence for detriment review."]
];
const guides=[
  ["survey","fdv-check","Flow survey","Import monitor flow, depth and velocity plus rainfall and gauge associations.",
   "Review each monitor and gauge week, then check continuity in Volume balance.","Record ratings and decisions in Monthly review."],
  ["verification","overview","Model verification","Map observed and modelled series and confirm units and comparison time basis.",
   "Review comparable coverage and agreement, then examine rainfall response in Event Review.","Record a decision for each reviewed scenario."],
  ["network","schematic","Network investigation","Load a saved schematic or native ICM node and link CSVs with confirmed units.",
   "Use Overview or trace connectivity. Open a route long section and review missing geometry.","Save reviewed routes and notes with the network."],
  ["spills","assessment","Spill and storage assessment","Prepare eligible observed or modelled series, thresholds, time basis and any exclusions.",
   "Review physical spill periods and 12/24 counts. Use Storage assessment to screen retained volumes.","Confirm coverage before comparing scenarios."],
  ["detriment","flooding","Detriment assessment","Import comparable baseline and proposed ICM reports and identify the relevant asset IDs.",
   "Review flooding, level, freeboard and spills against their separate criteria.","Inspect the underlying changes before recording a decision."],
  ["hydraulics","capacity","Hydraulic calculations","Prepare pipe geometry, roughness, gradients, pump curve points or confirmed catchment allowances.",
   "Choose Pipe capacity, System curve, Pump duty or Formula A and check its assumptions.","Export the calculation sheet for review."]
];
function node(tag,text){
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  return el;
}
function button(label,handler){
  const el=node("button",label);
  el.type="button";el.onclick=handler;return el;
}
function exportToolkit(){
  const panel=node("section");panel.className="panel";panel.id="hbIcmExportToolkit";
  panel.append(node("h2","ICM Export Toolkit"));
  const version=document.querySelector('meta[name="icm-export-toolkit-version"]')?.content;
  if(!/^\d+\.\d+\.\d+$/.test(version||"")) {
    panel.append(node("p","Toolkit downloads are unavailable in this build."));return panel;
  }
  function download(name,extension,label){
    const link=node("a",label),filename=name+"-v"+version+extension;
    link.href="downloads/icm/"+filename+"?v="+encodeURIComponent(buildToken);link.download=filename;return link;
  }
  panel.append(node("p","Scripts v"+version+" for the InfoWorks ICM desktop UI. Syntax and mocked contracts checked. ICM runtime validation pending."));
  const list=node("dl");
  for(const [file,title,description] of toolkitJobs) {
    const name=node("dt");name.append(download(file,".rb","Download "+title+" Ruby script"));
    list.append(name,node("dd",description));
  }
  panel.append(list,download("icm-export-guide",".md","Download the run guide and manual CSV instructions"));
  return panel;
}
function mount(navigate,routes){
  const home=document.getElementById("tab-home");
  const dashboard=node("section"),items=node("div"),recent=node("section"),workflows=node("section");
  dashboard.className="panel";
  dashboard.id="hbProjectDashboard";
  dashboard.setAttribute("aria-labelledby","hbProjectDashboardHeading");
  const heading=node("h2","Project dashboard");heading.id="hbProjectDashboardHeading";
  items.className="hb-project-status";
  const actions=node("ul");actions.className="hb-project-actions";
  dashboard.append(heading,items,actions);
  recent.id="hbRecentWork";recent.className="panel";recent.setAttribute("aria-labelledby","hbRecentHeading");
  const recentHeading=node("h2","Resume work");recentHeading.id="hbRecentHeading";
  const recentList=node("div");
  recent.append(recentHeading,node("p","Reopen recent pages. An active network investigation or verification event can resume in this tab while its evidence is still available."),recentList);
  workflows.className="panel";workflows.id="hbGuidedWorkflows";
  workflows.append(node("h2","Guided workflows"));
  for(const [workspace,page,title,requires,output,next] of guides){
    const details=node("details");
    const guide=node("dl");
    for(const [term,text] of [["Prepare",requires],["Review",output],["Next action",next]])
      guide.append(node("dt",term),node("dd",text));
    details.append(node("summary",title),guide,button("Open "+title,()=>navigate(workspace,page,true)));
    workflows.append(details);
  }
  const panels=node("div");panels.className="hb-project-home";
  const old=home.querySelector(".hb-home-workflows");
  const reports=old.querySelector('a[href="#/reports/report-generation"]');
  const reportActions=node("div");reportActions.className="actions";
  reportActions.append(reports);dashboard.append(reportActions);
  panels.append(dashboard,recent,workflows,exportToolkit());
  old.replaceWith(panels);

  function routeValid(value){
    return value&&typeof value.workspace==="string"&&typeof value.page==="string"&&value.workspace!=="home"&&
      Object.hasOwn(routes,value.workspace)&&Object.hasOwn(routes[value.workspace].pages,value.page);
  }
  let records=[];
  const resumeContexts=new Map();
  const key=route=>route.workspace+"/"+route.page;
  function resumeAdapter(route){
    if(key(route)==="network/schematic")return window.ICMNetworkSchematic?.resumeReview;
    if(key(route)==="graphs/events")return window.__ICM_WORKBENCH__?.resumeVerificationEvent;
    return null;
  }
  try{
    const saved=JSON.parse(sessionStorage.getItem(storeKey)||"[]");
    if(Array.isArray(saved))records=saved.filter(routeValid).slice(0,6).map(({workspace,page})=>({workspace,page}));
  }catch{}
  function persist(){
    try{sessionStorage.setItem(storeKey,JSON.stringify(records));}catch{}
  }
  function renderRecent(){
    recentList.replaceChildren();
    if(!records.length){recentList.append(node("p","Open a workspace to add it here."));return;}
    const list=node("ul");
    for(const route of records){
      const item=node("li"),workspace=routes[route.workspace];
      item.append(button(workspace.label+" · "+workspace.pages[route.page].label,
        ()=>{
          const context=resumeContexts.get(key(route));
          navigate(route.workspace,route.page,true);
          if(context)resumeAdapter(route)?.restore(context);
        }));
      list.append(item);
    }
    recentList.append(list,button("Clear recent pages",()=>{records=[];resumeContexts.clear();persist();renderRecent();}));
  }
  function renderStatus(){
    const wb=window.__ICM_WORKBENCH__,summary=wb.stateSummary(),registry=window.ICMProjectRegistry;
    const monitoredAssets=[...(registry?.assets?.values()||[])].filter(asset=>asset.kind==="flow-monitor");
    const schematic=state.networkSchematicWorkspace;
    const reports=registry?.assessments?.has("verification:comparison")?wb.readVerificationEvidence?.():null;
    const survey=wb.survey;
    const surveyCurrent=Boolean(survey?.batch&&wb.surveyFresh?.("complete"));
    const spillCurrent=Boolean(state.spillSnapshot&&state.spillSnapshot.signature===analysisSignature());
    const storageCurrent=Boolean(state.storage&&state.storageSignature&&state.storageSignature===storageInputSignature());
    const detrimentCount=["flooding","level","spill"].filter(kind=>window.ICMDetriment?.schematicEvidence?.(kind)).length;
    const stale=(present,fresh)=>present?(fresh?"Current result available":"Review or recalculate"):"Awaiting assessment";
    const values=[
      ["Imported sources",summary.readyFiles+" ready of "+summary.files,"data","time-series"],
      ["Flow monitors",monitoredAssets.length+" registered","survey","fdv-check"],
      ["Model series",summary.modelCount+" mapped","data","time-series"],
      ["Network",schematic?.nodes?.length?schematic.nodes.length+" points · "+schematic.edges.length+" links":"Open schematic to check","network","schematic"],
      ["Verification",stale(reports,reports?.freshness==="current"),"verification","overview"],
      ["Flow survey",stale(survey?.batch,surveyCurrent),"survey","fdv-check"],
      ["Spills",stale(state.spillSnapshot,spillCurrent),"spills","assessment"],
      ["Storage",stale(state.storage,storageCurrent),"spills","storage"],
      ["Detriment",detrimentCount?detrimentCount+" assessments available":"Awaiting assessment","detriment","flooding"]
    ];
    items.replaceChildren();
    for(const [label,value,workspace,page] of values){
      const item=node("article");
      const open=button(label,()=>navigate(workspace,page,true));
      open.setAttribute("aria-label","Open workspace for "+label);
      item.append(open,node("p",value));items.append(item);
    }
    const models=state.mapping.models.map(key=>mappingObject(key)).filter(Boolean);
    if(models.length){
      const list=node("ul"),details=node("details");
      for(const model of models)list.append(node("li",model.item.displayName+" · "+model.col));
      details.append(node("summary","Mapped model series"),list);
      items.append(details);
    }
    actions.replaceChildren();
    if(!summary.readyFiles)actions.append(node("li","Import sources to start a data-based assessment."));
    if(summary.readyFiles<summary.files)actions.append(node("li","Review source readiness in Data / time series."));
    if(summary.modelCount&&!summary.observedMapped)actions.append(node("li","Assign an observed series to run model verification."));
    if(reports?.freshness==="stale")actions.append(node("li","Refresh comparison evidence after the input changes."));
    if(survey?.batch&&!surveyCurrent)actions.append(node("li","Rerun the Flow Survey assessment for the current inputs."));
    if(state.spillSnapshot&&!spillCurrent)actions.append(node("li","Recalculate spills for the current inputs."));
    if(state.storage&&!storageCurrent)actions.append(node("li","Recalculate storage for the current inputs."));
    actions.hidden=!actions.childNodes.length;
  }
  for(const event of ["icm:source-pool-changed","icm:assessment-published"])
    window.addEventListener(event,()=>{if(!home.hidden)renderStatus();});
  window.addEventListener("icm:assessment-context-restored",()=>resumeContexts.clear());
  window.addEventListener("icm:source-pool-changed",({detail})=>{
    if(detail.reason==="clear")resumeContexts.clear();
  });
  window.addEventListener("icm:route-leaving",({detail})=>{
    if(!routeValid(detail))return;
    const context=resumeAdapter(detail)?.capture();
    if(context)resumeContexts.set(key(detail),context);
    else resumeContexts.delete(key(detail));
  });
  window.addEventListener("icm:route-changed",({detail})=>{
    if(detail.workspace==="home"){renderRecent();renderStatus();return;}
    if(!routeValid(detail))return;
    records=[{workspace:detail.workspace,page:detail.page},...records.filter(route=>
      route.workspace!==detail.workspace||route.page!==detail.page)].slice(0,6);
    const recentKeys=new Set(records.map(key));
    for(const route of resumeContexts.keys())if(!recentKeys.has(route))resumeContexts.delete(route);
    persist();
  });
}
window.HydraProjectHome={mount};
})();
