/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const qs=(sel,root=document)=>root.querySelector(sel);
const qsa=(sel,root=document)=>[...root.querySelectorAll(sel)];
const optionalComponents=Object.freeze({
  calculations:{asset:'hydraulic-design.js',mount:()=>window.HydraDesignCalculations.mount(navigate)},
  simulation:{asset:'simulation-results.js',mount:()=>window.HydraResultsWorkspace.mount()},
  diagnostics:{asset:'series-quality.js',mount:()=>{}},
  monitorCompare:{asset:'monitor-comparison.js',mount:()=>{}},
  spillInquiry:{asset:'spill-inquiry.js',mount:()=>{}},
  localSecurity:{asset:'local-security-diagnostics.js',mount:()=>{}},
  monitorDiagnostics:{asset:'survey-monitor-diagnostics.js',mount:()=>{}},
  rainfallSpatial:{asset:'rainfall-spatial.js',mount:()=>{}},
  surveySuitability:{asset:'survey-suitability.js',mount:()=>{}},
  verificationMatrix:{asset:'verification-matrix.js',mount:()=>window.HydraVerificationMatrix.mount()},
  assessmentRevision:{asset:'assessment-revision-core.js',mount:()=>window.HydraAssessmentRevision.mount()},
  gravitySizing:{asset:'gravity-sizing.js',mount:()=>window.HydraGravitySizing.mount()},
  detrimentScenarios:{asset:'detriment-scenarios.js',mount:()=>window.HydraDetrimentScenarios.mount(navigate)}
});
const componentLoads=new Map(),readyComponents=new Set();
function loadComponent(key){
  if(!componentLoads.has(key)){
    const component=optionalComponents[key];
    const loading=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='assets/'+component.asset+'?v='+encodeURIComponent(buildToken);
      script.onload=resolve;
      script.onerror=()=>{script.remove();reject(new Error('The workspace could not load.'));};
      document.head.append(script);
    }).then(()=>{component.mount();readyComponents.add(key);})
      .catch(error=>{componentLoads.delete(key);throw error;});
    componentLoads.set(key,loading);
  }
  return componentLoads.get(key);
}
function optionalPanel(id){
  const existing=$(id);if(existing)return existing;
  const panel=document.createElement('section');panel.id=id;panel.className='tab-panel';panel.hidden=true;
  qs('main.shell').append(panel);return panel;
}
function startOptionalPanel(route,root){
  const key=route.component;
  if(!key||readyComponents.has(key))return;
  const status=document.createElement('p');status.className='pw-empty-state';status.setAttribute('role','status');
  status.textContent='Opening '+route.label.toLowerCase()+'…';root.replaceChildren(status);
  void loadComponent(key).catch(error=>{
    status.textContent=error.message;
    const retry=document.createElement('button');retry.textContent='Retry opening '+route.label.toLowerCase();retry.type='button';
    retry.onclick=()=>startOptionalPanel(route,root);root.append(retry);
  });
}
function installDiagnosticLauncher(){
  let previous=$('clearPoolBtn');
  const actions=[['Source diagnostics','diagnostics',()=>window.HydraSeriesQuality.open()],
    ['Transform time series','diagnostics',()=>window.HydraSeriesQuality.transform()],
    ['Compare monitoring locations','monitorCompare',()=>window.HydraMonitorComparison.open()]];
  for(const [caption,component,open] of actions){
    const launcher=document.createElement('button');launcher.type='button';launcher.className='btn';
    launcher.textContent=caption;launcher.setAttribute('aria-haspopup','dialog');previous.after(launcher);previous=launcher;
    launcher.onclick=async()=>{
      if(launcher.getAttribute('aria-busy')==='true')return;
      launcher.setAttribute('aria-busy','true');
      try{await loadComponent(component);if(current.workspace==='data')open();}
      catch(error){$('mappingStatus').textContent=error.message+' Select '+caption+' to retry.';}
      finally{launcher.removeAttribute('aria-busy');}
    };
  }
}
const ROUTES={
  home:{
    label:'Home',
    icon:'home',
    pages:{overview:{label:'Overview',title:'Hydra Bench',description:'Wastewater network evidence, model verification and scenario assessment.',root:()=>$('tab-home')}}
  },
  data:{
    label:'Data / time series',
    icon:'data',
    pages:{
      'time-series':{label:'Time series',title:'Data / time series',description:'Upload, interpret and assign local sources, then review hydraulic traces, thresholds, rainfall overlays and auditable statistics in one continuous workspace.',tab:'graph',root:()=>$('tab-graph')}
    }
  },
  spills:{
    label:'Spills',
    icon:'spills',
    pages:{
      assessment:{label:'Spill assessment',title:'EDM / model spill assessment',description:'Configure thresholds and exclusions, then review physical spill intervals, 12/24 counts and observed/model evidence.',tab:'spills',root:()=>$('tab-spills')},
      storage:{label:'Storage assessment',title:'Storage assessment',description:'Review support-aware idealised storage screening and modelled spill-volume evidence.',tab:'storage',root:()=>$('tab-storage')},
      'storage-routing':{label:'Storage routing',title:'Storage routing screening',description:'Test spill-volume sensitivity to storage capacity and a constant pass-forward limit.',component:'calculations',root:()=>optionalPanel('tab-storage-routing')}
    }
  },
  network:{
    label:'Network Schematic',
    icon:'network',
    pages:{
      schematic:{label:'Schematic',title:'Network schematic',description:'Arrange a site overview and review individual asset spill evidence across years and scenarios.',root:()=>$('tab-spill-network')},
      'simulation-results':{label:'Simulation results',title:'Simulation results',description:'Index mapped ICM results and inspect exact project-clock samples and independent extrema.',component:'simulation',root:()=>optionalPanel('tab-simulation-results')}
    }
  },
  survey:{
    label:'Flow survey',
    icon:'survey',
    pages:{
      'fdv-check':{label:'FDV check',title:'FDV check',description:'Select a monitor on the schematic to review its weekly data quality, rating and comments.',tab:'data-health',root:()=>$('tab-data-health')},
      'rainfall-check':{label:'Rainfall check',title:'Rainfall check',description:'Review Flow survey gauge health, network WAPUG qualification and event evidence without depending on the standalone Time series rainfall-event workflow.',tab:'data-health',root:()=>$('tab-data-health')},
      'volume-balance':{label:'Volume balance',title:'Volume balance',description:'Assess upstream/downstream flow continuity on common valid temporal support with explicit assumptions.',tab:'data-health',root:()=>$('tab-data-health')},
      'monthly-review':{label:'Monthly review',title:'Monthly survey review',description:'Review effective weekly outcomes, engineering comments and actions, then export the monthly PDF.',tab:'data-health',root:()=>$('tab-data-health')}
    }
  },
  graphs:{
    label:'Verification',
    icon:'verify',
    pages:{
      comparison:{label:'Observed vs modelled',title:'Observed versus modelled diagnostics',description:'Compare scenarios using the canonical bounded-alignment engine, scatter views and verification statistics.',tab:'compare',root:()=>$('tab-compare')},
      overview:{label:'Overview',title:'Verification overview',description:'Review source coverage, comparison metrics and engineering decisions.',root:()=>$('tab-verification-overview')},
      events:{label:'Event Review',title:'Verification event review',description:'Compare observed and modelled responses for a qualifying rainfall event.',root:()=>$('tab-verification-events')},
      matrix:{label:'Verification matrix',title:'Multi-event verification',description:'Review independent agreement criteria across qualifying periods, monitored sites and scenarios.',component:'verificationMatrix',root:()=>optionalPanel('tab-verification-matrix')},
      rating:{label:'Depth / rating',title:'Depth agreement and flow–depth diagnostics',description:'Inspect depth agreement and Q/H rating evidence with sample support and validity limitations.',tab:'compare',root:()=>$('tab-compare')},
      dwf:{label:'DWF',title:'Dry-weather-flow baseline',description:'Review dry-weather qualification and baseline evidence without inferring dry periods from missing rainfall.',tab:'compare',root:()=>$('tab-compare')}
    }
  },
  hydraulics:{
    label:'Hydraulic Calculations',icon:'hydraulics',
    pages:{
      capacity:{label:'Pipe capacity',title:'Hydraulic calculations',description:'Estimate full-bore uniform-flow capacity using Darcy–Weisbach.',root:()=>$('tab-hydraulics')},
      gravity:{label:'Gravity sizing',title:'Gravity pipe sizing',description:'Assess Manning discharge and normal depth, or calculate a continuous full-bore sizing requirement.',component:'gravitySizing',root:()=>optionalPanel('tab-manning-sizing')},
      'system-curve':{label:'System curve',title:'Pipe head loss and system curves',description:'Review the components of head loss in steady full-pipe systems.',component:'calculations',root:()=>optionalPanel('tab-pipe-system')},
      'pump-duty':{label:'Pump duty',title:'Pump duty screening',description:'Compare measured pump curves against the pipe system.',component:'calculations',root:()=>optionalPanel('tab-pump-duty')},
      structures:{label:'Structures',title:'Hydraulic structure screening',description:'Screen weir, orifice, sluice and supplied rating-curve discharge.',component:'calculations',root:()=>optionalPanel('tab-hydraulic-structures')},
      'formula-a':{label:'Formula A',title:'Formula A and wastewater design flows',description:'Review continuation flow for the applicable framework or a documented project method.',component:'calculations',root:()=>optionalPanel('tab-formula-a')},
      'treatment-flow':{label:'Treatment flows',title:'Dry weather flow and full treatment',description:'Review EA and SEPA treatment flows with distinct infiltration allowances.',component:'calculations',root:()=>optionalPanel('tab-design-treatment')},
      'foul-loading':{label:'Peak foul flow',title:'Peak foul flow',description:'Review design foul loading from separate domestic, commercial, infiltration and trade components.',component:'calculations',root:()=>optionalPanel('tab-design-foul')},
      'section-check':{label:'Velocity and shear',title:'Velocity and boundary shear',description:'Review a circular gravity section against the project velocity criterion and a uniform-flow shear assumption.',component:'calculations',root:()=>optionalPanel('tab-section-check')}
    }
  },
  detriment:{...window.ICMDetriment.routes,label:'Detriment assessment',icon:'detriment',pages:{...window.ICMDetriment.routes.pages,
    comparison:{label:'Scenario comparison',title:'Detriment scenario comparison',description:'Review multiple proposals against the same assessed baseline.',
      component:'detrimentScenarios',root:()=>optionalPanel('tab-detriment-scenarios')}}},
  about:{
    label:'About',icon:'about',
    pages:{overview:{label:'Overview',title:'About Hydra Bench',description:'A practical workbench for hydraulic evidence, model verification and scenario assessment.',root:()=>$('tab-about')},
      security:{label:'IT Security',title:'IT Security',description:'Data handling, implemented controls and verification limits.',root:()=>$('tab-security')}}
  },
  reports:{
    label:'Reports',
    icon:'report',
    pages:{
      'report-generation':{label:'Report generation',title:'Report generation',description:'Review result readiness and export a coherent snapshot of current authoritative analyses.',tab:'workspace',root:()=>$('tab-workspace')},
      revisions:{label:'Revision comparison',title:'Assessment revision comparison',description:'Compare saved assessment evidence, methods and engineering review decisions.',component:'assessmentRevision',root:()=>optionalPanel('tab-assessment-revision')},
      workspace:{label:'Workspace save / restore',title:'Workspace save and restore',description:'Persist configuration and source fingerprints without embedding raw engineering files.',tab:'workspace',root:()=>$('tab-workspace')}
    }
  }
};
const ROUTE_ALIASES={
  'data/sources':['data','time-series'],
  'data/series-mapping':['data','time-series'],
  'verification/comparison':['graphs','comparison'],
  'verification/overview':['graphs','overview'],
  'verification/events':['graphs','events'],
  'verification/rating':['graphs','rating'],
  'verification/dwf':['graphs','dwf'],
  'verification/storage':['spills','storage'],
  'spills/thresholds':['spills','assessment'],
  'spills/results':['spills','assessment'],
  'spills/network':['network','schematic'],
  'survey/configuration':['survey','fdv-check'],
  'survey/data-health':['survey','fdv-check'],
  'survey/rainfall-response':['survey','rainfall-check'],
  'survey/flow-continuity':['survey','volume-balance'],
  'rainfall/gauges':['survey','rainfall-check'],
  'rainfall/events':['data','time-series'],
  'report/builder':['reports','report-generation'],
  'report/workspace':['reports','workspace']
};
function canonicalRoute(workspace,page){
  if(ROUTES[workspace]?.pages[page])return {workspace,page};
  const alias=ROUTE_ALIASES[workspace+'/'+page];
  return alias?{workspace:alias[0],page:alias[1]}:null;
}
const DEFAULT_ROUTE={workspace:'home',page:'overview'};
let current=DEFAULT_ROUTE;
let docked=[];
let syncingLegacy=false;
let focusPreference=false;
let railCollapsed=false;
let railExplicit=false;
try{
  const saved=sessionStorage.getItem('icm-pw-focus-canvas');
  if(saved==='on'||saved==='off')focusPreference=saved==='on';
}catch{}
try{const saved=sessionStorage.getItem('icm-pw-rail-collapsed');railCollapsed=saved==='on';railExplicit=saved==='on'||saved==='off';}catch{}
// The document is the scrolling surface, so route swaps need their own memory.
// Keep subtabs separate even where they share a legacy tab-panel element.
const routeScroll=new Map();
let scrollRestore=null;
let routeMounted=false;
try{
  const saved=JSON.parse(sessionStorage.getItem('icm-pw-route-scroll')||'{}');
  for(const [key,position] of Object.entries(saved)){
    if(Number.isFinite(position?.x)&&Number.isFinite(position?.y)&&position.x>=0&&position.y>=0)routeScroll.set(key,position);
  }
}catch{}
function persistRouteScroll(){try{sessionStorage.setItem('icm-pw-route-scroll',JSON.stringify(Object.fromEntries(routeScroll)));}catch{}}
function rememberRouteScroll(){
  if(!routeMounted)return;
  const key=current.workspace+'/'+current.page;
  routeScroll.set(key,scrollRestore?.key===key?scrollRestore.position:{x:window.scrollX,y:window.scrollY});
  persistRouteScroll();
}
function cancelScrollRestore(){
  if(!scrollRestore)return;
  cancelAnimationFrame(scrollRestore.frame);scrollRestore=null;
}
function restoreRouteScroll(){
  cancelScrollRestore();
  const key=current.workspace+'/'+current.page,position=routeScroll.get(key)||{x:0,y:0};
  const task={key,position,deadline:performance.now()+3000,frame:0};scrollRestore=task;
  const apply=()=>{
    if(scrollRestore!==task)return;
    window.scrollTo({left:position.x,top:position.y,behavior:'instant'});
    // A delayed chart/table can make a previously saved offset available later.
    // Stop as soon as it is reachable, or when the engineer starts interacting.
    if((Math.abs(window.scrollY-position.y)<2&&Math.abs(window.scrollX-position.x)<2)||performance.now()>=task.deadline){scrollRestore=null;return;}
    task.frame=requestAnimationFrame(apply);
  };
  task.frame=requestAnimationFrame(apply);
}
function wireScrollMemory(){
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  const interrupt=()=>cancelScrollRestore();
  window.addEventListener('wheel',interrupt,{passive:true});
  window.addEventListener('touchstart',interrupt,{passive:true});
  window.addEventListener('pointerdown',interrupt,{passive:true});
  window.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))interrupt();});
  window.addEventListener('pagehide',rememberRouteScroll);
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function navIcon(name){
  const paths={
    home:'<path d="m3 10 9-7 9 7M5 9v11h14V9M10 20v-6h4v6"/>',
    data:'<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/>',
    survey:'<path d="M3 6c2.3 0 2.3-2 4.5-2S9.8 6 12 6s2.3-2 4.5-2S18.8 6 21 6M3 12c2.3 0 2.3-2 4.5-2s2.3 2 4.5 2 2.3-2 4.5-2 2.3 2 4.5 2M3 18c2.3 0 2.3-2 4.5-2s2.3 2 4.5 2 2.3-2 4.5-2 2.3 2 4.5 2"/>',
    network:'<path d="M6 8v7m2-7 8 7m2-7v7"/><circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    rainfall:'<path d="M7 15a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.5 1.5A3.5 3.5 0 0 1 18 15"/><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"/>',
    hydraulics:'<circle cx="12" cy="12" r="8"/><path d="M5 14h14M8 9l4-3 4 3"/>',
    verify:'<path d="M4 15h3v6H4zM10.5 10h3v11h-3zM17 4h3v17h-3z" fill="currentColor" stroke="none"/>',
    detriment:'<path d="M9 4H6v17h12V4h-3"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 10h6M9 14h6M9 18h4"/>',
    spills:'<path d="M12 2C10 5 5 10.4 5 14.5a7 7 0 0 0 14 0C19 10.4 14 5 12 2Z"/><path d="M8 14.5a4 4 0 0 0 4 4"/>',
    report:'<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6M9 19h4"/>',
    about:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'
  };
  return '<span class="pw-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.data)+'</svg></span>';
}
const navigationToggleIcon='<svg class="pw-navigation-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path class="pw-navigation-chevron" d="m16 9-3 3 3 3"/></svg>';
function identifySubpanels(){
  qsa('#tab-compare .subpanel').forEach(panel=>{
    const t=(qs('h3',panel)?.textContent||'').toLowerCase();
    if(t.includes('depth agreement')||t.includes('rating diagnostic')) panel.id=panel.id||'pwRatingPanel';
    if(t.includes('dry-weather')||t.includes('dry weather')) panel.id=panel.id||'pwDwfPanel';
  });
  const registry=$('domainRegistryPanel');
  if(registry) registry.classList.add('pw-domain-provenance');
}
const ownedSurfaces=[];
function own(node,routes){
  if(!node)return null;
  node.dataset.pwOwned=routes.join(' ');
  if(!ownedSurfaces.includes(node))ownedSurfaces.push(node);
  return node;
}
function ensureSection(id,title,description){
  let section=$(id);if(section)return section;
  section=document.createElement('section');section.id=id;section.className='pw-page-surface';
  section.innerHTML='<div class="pw-surface-head"><div><h3>'+esc(title)+'</h3>'+(description?'<p>'+esc(description)+'</p>':'')+'</div></div>';
  return section;
}
function ensureDataTimeSeriesSurface(){
  const graphPanel=qs('#tab-graph > .panel');
  if(!graphPanel)return null;
  let setup=$('pwDataSetupSurface');
  if(!setup){
    setup=document.createElement('section');
    setup.id='pwDataSetupSurface';
    setup.className='pw-page-surface pw-data-setup-surface';
    setup.innerHTML='<div class="pw-surface-head"><div><h3>Data setup</h3><p>Upload, inspect and assign every source here. Automatic interpretation is a starting point; generic CSV quantities remain independently overridable.</p></div></div>';
    const source=qs('.source-panel'),mapping=qs('.mapping-panel'),shared=$('sharedAnalysisPanel');
    if(source){source.classList.add('pw-embedded-panel','pw-data-source-panel');setup.appendChild(source);}
    const locations=document.createElement('button');
    locations.id='pwImportMonitorLocations';locations.type='button';locations.textContent='Import monitor locations';
    const locationActions=makeActionGroup();locationActions.append(locations);setup.append(locationActions);
    locations.addEventListener('click',async()=>{
      locations.disabled=true;
      try{
        await window.ICMNetworkSchematic.open();
        window.ICMNetworkSchematic.openMonitorImport?.();
      }finally{locations.disabled=false;}
    });
    if(mapping){mapping.classList.add('pw-embedded-panel','pw-data-mapping-panel');setup.appendChild(mapping);}
    if(shared){shared.classList.add('pw-embedded-panel');setup.appendChild(shared);}
    graphPanel.prepend(setup);
  }
  let events=$('pwTimeSeriesEventSurface');
  if(!events){
    const legacy=qs('#tab-rain-events > .panel');
    if(legacy){
      events=document.createElement('details');
      events.id='pwTimeSeriesEventSurface';
      events.className='pw-page-surface pw-timeseries-event-surface';
      events.innerHTML='<summary><span><strong>Rainfall events on Time series</strong><small>WAPUG presets or manual event criteria</small></span><span class="pw-disclosure-hint">Settings and overlay</span></summary>';
      events.open=true;
      legacy.classList.add('pw-embedded-panel');
      const title=qs('.panel-head h2',legacy),copy=qs('.panel-head p',legacy);
      if(title)title.textContent='Time series WAPUG / manual rainfall events';
      if(copy)copy.textContent='Detect events from the rainfall mapped in this Time series workspace and overlay them through the hydraulic graph. These results are independent of Flow survey Rainfall check, while using the same validated event engine.';
      events.appendChild(legacy);
      graphPanel.appendChild(events);
    }
  }
  return setup;
}
function healthSeverity(label){return ({red:4,amber:3,yellow:3,green:2,grey:1,gray:1}[String(label||'').trim().toLowerCase()]||0);}
function refreshHealthSummary(){
  const body=$('healthBody'),target=$('pwHealthSummaryBody'),empty=$('pwHealthSummaryEmpty'),details=$('pwDataHealthDetails');
  if(!body||!target)return;
  const records=qsa(':scope > tr',body).map(tr=>{
    const cells=qsa('td',tr).map(td=>td.textContent.trim());
    return {file:cells[0]||'Unknown source',channel:cells[2]||'—',coverage:Number.parseFloat(cells[3]),rag:cells[11]||'Unknown',comment:cells[12]||''};
  });
  const groups=new Map();
  records.forEach(r=>{const list=groups.get(r.file)||[];list.push(r);groups.set(r.file,list);});
  target.innerHTML=[...groups.entries()].map(([file,rows])=>{
    const channels=[...new Set(rows.map(r=>r.channel).filter(Boolean))];
    const flagged=[...new Set(rows.filter(r=>healthSeverity(r.rag)!==2).map(r=>r.channel).filter(Boolean))];
    const worst=rows.slice().sort((a,b)=>healthSeverity(b.rag)-healthSeverity(a.rag))[0]||{};
    const cov=rows.map(r=>r.coverage).filter(Number.isFinite);
    const minCov=cov.length?Math.min(...cov):null;
    const action=worst.comment||(healthSeverity(worst.rag)<=2?'No flagged finding in current QA':'Review channel/week evidence');
    return '<tr><td><strong>'+esc(file)+'</strong></td><td>'+(minCov==null?'—':minCov.toFixed(1)+'%')+'</td><td><span class="pw-rag pw-rag-'+esc(String(worst.rag||'unknown').toLowerCase())+'">'+esc(worst.rag||'Unknown')+'</span></td><td>'+esc(flagged.length?flagged.length+' of '+channels.length+' channels':channels.length+' channels · none flagged')+'</td><td>'+esc(action)+'</td></tr>';
  }).join('');
  if(empty)empty.hidden=records.length>0;
  if(details){const summary=qs('summary',details);if(summary)summary.textContent='Channel / week evidence · '+records.length+' record'+(records.length===1?'':'s');}
}
function ensureDataHealthSurface(){
  if($('pwDataHealthSummary'))return $('pwDataHealthSummary');
  const body=$('healthBody');if(!body)return null;
  const raw=body.closest('.table-wrap');if(!raw)return null;
  const host=raw.parentElement;
  const section=ensureSection('pwDataHealthSummary','FDV data health','Coverage and source quality by monitor.');
  section.classList.add('pw-data-health-summary');
  const head=qs('.pw-surface-head',section),run=$('runHealthBtn');if(run){run.classList.remove('primary');run.textContent='Run data health assessment';head.appendChild(run);}
  const monitor=document.createElement('button'),monitorStatus=document.createElement('p');
  monitor.className='btn';monitor.type='button';monitor.textContent='Investigate monitor readings';monitor.setAttribute('aria-haspopup','dialog');
  monitorStatus.setAttribute('role','status');head.appendChild(monitor);section.appendChild(monitorStatus);
  async function openClockDiagnostics(){
    navigate('data','time-series',true);
    try{await loadComponent('diagnostics');if(current.workspace==='data')window.HydraSeriesQuality.open();}
    catch(error){$('mappingStatus').textContent=error.message+' Select Source diagnostics to retry.';}
  }
  monitor.onclick=async()=>{
    if(monitor.getAttribute('aria-busy')==='true')return;
    monitor.setAttribute('aria-busy','true');monitorStatus.textContent='';
    try{await loadComponent('monitorDiagnostics');if(current.page==='fdv-check')window.HydraMonitorDiagnostics.open(openClockDiagnostics);}
    catch(error){monitorStatus.textContent=error.message+' Select Investigate monitor readings to retry.';}
    finally{monitor.removeAttribute('aria-busy');}
  };
  const empty=document.createElement('div');empty.id='pwHealthSummaryEmpty';empty.className='pw-empty-state';empty.textContent='Run data health to review source coverage and quality.';
  const wrap=document.createElement('div');wrap.className='table-wrap pw-summary-table-wrap';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Flow survey health summary table');wrap.innerHTML='<table class="data-table pw-summary-table"><thead><tr><th>Monitor / source</th><th>Minimum coverage</th><th>Finding severity</th><th>Affected quantity</th><th>Next action</th></tr></thead><tbody id="pwHealthSummaryBody"></tbody></table>';
  const details=document.createElement('details');details.id='pwDataHealthDetails';details.className='pw-evidence-details';details.innerHTML='<summary>Channel / week evidence</summary><p>Full native assessment records remain available for audit and export.</p>';
  details.appendChild(raw);section.append(empty,wrap,details);host.prepend(section);
  new MutationObserver(refreshHealthSummary).observe(body,{childList:true,subtree:true});refreshHealthSummary();
  return section;
}
function ensureSpillSurfaces(){
  const panel=qs('#tab-spills .panel');if(!panel||$('pwSpillThresholdSurface'))return;
  const threshold=ensureSection('pwSpillThresholdSurface','Thresholds and exclusions','Define assessment thresholds and auditable exclusion periods before calculating spills.');
  const result=ensureSection('pwSpillResultsSurface','Spill assessment evidence','Yearly summaries and compact monthly count / duration comparisons.');
  const thresholdHead=qs('.pw-surface-head',threshold),run=$('runSpillsBtn');if(run){run.textContent='Calculate spills';run.classList.add('primary');thresholdHead.appendChild(run);}
  const reviewActions=document.createElement('div');reviewActions.className='actions';qs('.pw-surface-head',result).append(reviewActions);
  for(const [caption,method] of [['Investigate physical discharges','open'],['Compare spill scenarios','compare']]){
    const button=document.createElement('button');button.className='btn';button.type='button';button.setAttribute('aria-haspopup','dialog');
    button.textContent=caption;reviewActions.append(button);
    button.onclick=async()=>{
      if(button.getAttribute('aria-busy')==='true')return;
      button.setAttribute('aria-busy','true');
      try{await loadComponent('spillInquiry');if(current.workspace==='spills')window.HydraSpillInquiry[method]();}
      catch(error){$('spillRunStatus').textContent=error.message+' Select '+caption+' to retry.';}
      finally{button.removeAttribute('aria-busy');}
    };
  }
  const map=qs('#tab-spills .mapping-grid.compact'),exclude=$('exclusionRows')?.closest('.subpanel');if(map)threshold.appendChild(map);if(exclude)threshold.appendChild(exclude);
  const basis=document.createElement('div');basis.className='spill-local-basis';
  for(const [id,text] of [['timeBasisConfirmed','Sources share the same model-clock time basis'],['levelDatumConfirmed','Absolute levels share a unit and datum (if undeclared)']]){
    const original=$(id);if(!original)continue;
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';input.id='spill-'+id;input.checked=original.checked;
    input.addEventListener('change',()=>{original.checked=input.checked;original.dispatchEvent(new Event('change',{bubbles:true}));});
    original.addEventListener('change',()=>{input.checked=original.checked;});
    label.append(input,document.createTextNode(text));basis.appendChild(label);
  }
  threshold.appendChild(basis);
  const resultNodes=[];
  const two=qs('#tab-spills .two-col');if(two)resultNodes.push(two);
  const cmp=$('spillComparison');if(cmp){const h=cmp.previousElementSibling;if(h?.matches('h3'))resultNodes.push(h);resultNodes.push(cmp);}
  const event=$('eventBody')?.closest('.table-wrap');if(event){
    const heading=event.previousElementSibling;if(heading?.matches('h3'))heading.remove();
    const records=document.createElement('details');records.id='spillRecordDetails';records.className='pw-evidence-details spill-record-details';
    records.innerHTML='<summary>Spill records · observed and modelled <span class="spill-record-show">Show records</span><span class="spill-record-hide">Hide records</span></summary>';
    records.appendChild(event);resultNodes.push(records);
  }
  resultNodes.forEach(x=>result.appendChild(x));
  panel.append(threshold,result);
}
function makeActionGroup(className='pw-surface-actions'){const x=document.createElement('div');x.className=className;return x;}
function refreshReportScenarioOptions(){
  const select=$('reportScenarioSelect'),models=$('modelSelect');if(!select||!models)return;
  const previous=new Set([...select.selectedOptions].map(o=>o.value));
  const mapped=[...models.selectedOptions].filter(o=>o.value);
  const shouldSelectAll=select.options.length===0||previous.size===0;
  select.innerHTML=mapped.map(o=>'<option value="'+esc(o.value)+'" '+((shouldSelectAll||previous.has(o.value))?'selected':'')+'>'+esc(o.textContent)+'</option>').join('');
}
function mountReportSheetSelection(options,enabled){
  const group=document.createElement('fieldset'),legend=document.createElement('legend'),list=document.createElement('div');
  const note=document.createElement('p'),open=document.createElement('button');
  legend.textContent='Calculation sheets';note.setAttribute('role','status');list.className='mapping-grid';
  open.textContent='Open hydraulic calculations';open.type='button';
  open.onclick=()=>navigate('hydraulics','capacity',true);
  group.append(legend,list,note,open);options.append(group);
  const wanted=new Set();
  let pendingCatalog=false;
  const catalog=()=>new Map((window.HydraDesignCalculations?.sheetStatus()||[]).map(entry=>[entry.id,entry]));
  function refresh(){
    group.hidden=!enabled.checked;
    if(group.hidden)return;
    if(!readyComponents.has('calculations')){
      if(!pendingCatalog){
        pendingCatalog=true;note.textContent='Loading calculation sheets…';
        void loadComponent('calculations').then(()=>{pendingCatalog=false;refresh();},()=>{
          pendingCatalog=false;note.textContent='Calculation sheets could not load. Reopen this report section to retry.';
        });
      }
      return;
    }
    const choices=catalog();
    for(const id of wanted)if(!choices.has(id))choices.set(id,{id,title:id.replace(/Form$/,'').replace(/([a-z])([A-Z])/g,'$1 $2'),current:false});
    list.replaceChildren();
    for(const entry of choices.values()){
      if(!entry.current&&!wanted.has(entry.id))continue;
      const label=document.createElement('label'),input=document.createElement('input');
      input.type='checkbox';input.checked=wanted.has(entry.id);
      input.onchange=()=>{if(input.checked)wanted.add(entry.id);else wanted.delete(entry.id);};
      label.append(input,document.createTextNode(entry.title+(entry.current?'':' · calculate again')));list.append(label);
    }
    note.textContent=list.childElementCount?'Select the current sheets to include. Unavailable selections require a new calculation or removal.':
      'Run a supported hydraulic or storage calculation to include its sheet.';
  }
  diagnostic.reportSheetChoices=()=>[...wanted];
  diagnostic.restoreReportSheetChoices=ids=>{
    wanted.clear();
    if(Array.isArray(ids))for(const id of ids.slice(0,16))if(typeof id==='string'&&/^[a-zA-Z0-9]{1,64}$/.test(id))wanted.add(id);
    refresh();
  };
  enabled.addEventListener('change',refresh);
  window.addEventListener('icm:calculation-sheets-changed',refresh);
  window.addEventListener('icm:route-changed',({detail})=>{if(detail.page==='report-generation')refresh();});
  refresh();return refresh;
}
function mountReportLayout(options){
  const list=options.querySelector('#reportSectionList'),template=options.querySelector('#reportTemplate');
  const sections=[
    ['time-series','reportIncludeTimeSeries','Full-period time series'],
    ['spill-storage','reportIncludeSpillsStorage','Spills & storage'],
    ['comparison','reportIncludeComparison','Comparison diagnostics'],
    ['survey','reportIncludeSurvey','Flow-survey evidence'],
    ['network','reportIncludeNetwork','Network schematic'],
    ['calculations','reportIncludeCalculations','Engineering calculation sheets'],
  ];
  const presets={general:sections.slice(0,4).map(([key])=>key),
    verification:['comparison','time-series'],spills:['spill-storage','time-series'],survey:['survey','time-series'],network:['network'],calculations:['calculations']};
  const rows=new Map();
  const announce=options.querySelector('#reportSectionStatus');
  function updateButtons(){
    const items=[...list.children];
    items.forEach((row,index)=>{
      const [up,down]=row.querySelectorAll('button');
      up.disabled=index===0;down.disabled=index===items.length-1;
    });
  }
  function applyOrder(order){
    for(const key of reportSectionOrder(order))list.append(rows.get(key));
    updateButtons();
  }
  for(const [key,id,caption] of sections){
    const row=document.createElement('li'),label=document.createElement('label'),input=document.createElement('input');
    const actions=makeActionGroup('pw-report-section-moves');
    input.type='checkbox';input.id=id;input.checked=presets.general.includes(key);
    input.onchange=()=>{template.value='';};
    label.append(input,document.createTextNode(caption));row.dataset.reportSection=key;row.append(label,actions);
    for(const [offset,arrow,phrase] of [[-1,'↑',' earlier'],[1,'↓',' later']]){
      const button=document.createElement('button');button.type='button';button.textContent=arrow;
      button.setAttribute('aria-label','Move '+caption+phrase);
      button.onclick=()=>{
        const neighbor=offset<0?row.previousElementSibling:row.nextElementSibling;
        if(!neighbor)return;
        list.insertBefore(row,offset<0?neighbor:neighbor.nextElementSibling);
        template.value='';updateButtons();
        (button.disabled?row.querySelector('input'):button).focus();
        announce.textContent=caption+' moved to position '+([...list.children].indexOf(row)+1)+'.';
      };
      actions.append(button);
    }
    rows.set(key,row);list.append(row);
  }
  const updateSheetChoices=mountReportSheetSelection(options,rows.get('calculations').querySelector('input'));
  template.onchange=()=>{
    const chosen=presets[template.value];
    if(!chosen)return;
    for(const [key,row] of rows)row.querySelector('input').checked=chosen.includes(key);
    applyOrder(chosen);updateSheetChoices();announce.textContent=template.selectedOptions[0].textContent+' template applied.';
  };
  window.__ICM_WORKBENCH__.restoreReportSectionOrder=order=>{template.value='';applyOrder(order);};
  updateButtons();
}
function mountAssessmentPreview(actions,builder){
  const preview=document.createElement('button');preview.type='button';preview.textContent='Preview assessment report';
  const dialog=document.createElement('dialog');dialog.className='hb-report-preview';dialog.setAttribute('aria-label','Assessment report preview');
  const controls=makeActionGroup(),close=document.createElement('button'),save=document.createElement('button');
  close.type=save.type='button';close.textContent='Close';save.textContent='Download preview';
  const frame=document.createElement('iframe');frame.title='Assessment report document';frame.setAttribute('sandbox','allow-scripts');
  let packet=null;
  close.onclick=()=>dialog.close();
  save.onclick=()=>{if(packet)downloadAssessmentReport(packet);};
  dialog.addEventListener('close',()=>{
    packet=null;frame.remove();frame.removeAttribute('srcdoc');preview.focus();
  });
  preview.onclick=()=>guarded('workspaceStatus',async()=>{
    preview.disabled=true;$('workspaceStatus').textContent='Preparing the report preview…';
    try{
      packet=await compileAssessmentReport();
      if(!preview.getClientRects().length){packet=null;return;}
      frame.srcdoc=packet.html;
      dialog.append(frame);
      dialog.showModal();$('workspaceStatus').textContent='Report preview ready.';
    }finally{preview.disabled=false;}
  });
  controls.append(save,close);dialog.append(controls);
  actions.prepend(preview);builder.append(dialog);
}
function ensureReportSurfaces(){
  const panel=qs('#tab-workspace .panel');if(!panel||$('pwWorkspaceSurface'))return;
  const builder=ensureSection('pwReportBuilderSurface','Report generation','Check result readiness, choose the report sections/scenarios and report view, then export the engineering report.');
  const workspace=ensureSection('pwWorkspaceSurface','Workspace save / restore','Save local configuration and source fingerprints without embedding raw engineering files.');
  const workspaceName=$('workspaceName')?.closest('label'),named=$('namedWorkspaceSelect')?.closest('.actions');if(workspaceName)workspace.appendChild(workspaceName);if(named)workspace.appendChild(named);
  const wsActions=makeActionGroup();for(const id of ['downloadWorkspaceBtn','loadWorkspaceBtn']){const b=$(id);if(b){b.classList.remove('primary');b.textContent=id==='downloadWorkspaceBtn'?'Export workspace JSON':'Load workspace JSON';wsActions.appendChild(b);}}workspace.appendChild(wsActions);
  const wsStatus=$('workspaceStatus'),privacy=qs('#tab-workspace .privacy-note');if(wsStatus)workspace.appendChild(wsStatus);if(privacy)workspace.appendChild(privacy);
  const year=$('reportYear')?.closest('label');if(year)builder.appendChild(year);const ready=$('reportPreflight');if(ready)builder.appendChild(ready);
  const options=document.createElement('section');options.id='pwReportOptions';options.className='subpanel pw-report-options';
  options.innerHTML='<div class="subhead"><div><h3>Report options</h3><p>Select the authoritative sections and model scenarios to include. These settings are saved with the workspace.</p></div></div>'+
    '<div class="mapping-grid compact-wide">'+
      '<div class="pw-report-sections" role="group" aria-labelledby="pwReportSectionsLabel"><span id="pwReportSectionsLabel">Sections</span>'+
        '<label>Report template<select id="reportTemplate" aria-label="Report template"><option value="">Custom selection</option>'+
        '<option value="general">Engineering assessment</option><option value="verification">Model verification</option>'+
        '<option value="spills">Spills and storage</option><option value="survey">Flow survey</option><option value="network">Network investigation</option>'+
        '<option value="calculations">Engineering calculations</option></select></label>'+
        '<ol id="reportSectionList"></ol><small role="status" id="reportSectionStatus"></small></div>'+
      '<label>Scatter view<select id="reportScatterScale"><option value="current">Current Plots view</option><option value="linear">Linear</option><option value="log">Log₁₀ (positive pairs only)</option></select><small>Report statistics follow the eligible pair population for this selected view.</small></label>'+
      '<label>Comparison scenarios<select id="reportScenarioSelect" multiple size="4"></select><small>Only currently mapped model scenarios are available.</small></label>'+
    '</div>';
  builder.appendChild(options);mountReportLayout(options);refreshReportScenarioOptions();
  const reportActions=makeActionGroup();for(const id of ['downloadReportBtn','downloadFourPeriodBtn']){const b=$(id);if(b){b.classList.toggle('primary',id==='downloadReportBtn');b.textContent=id==='downloadReportBtn'?'Export assessment report':'Export four-period report';reportActions.appendChild(b);}}builder.appendChild(reportActions);
  mountAssessmentPreview(reportActions,builder);
  const mirror=document.createElement('div');mirror.id='pwReportStatusMirror';mirror.className='report-status pw-status-mirror';mirror.textContent=wsStatus?.textContent||'Report export ready when required analyses are current.';builder.appendChild(mirror);
  if(wsStatus)new MutationObserver(()=>{mirror.textContent=wsStatus.textContent;}).observe(wsStatus,{childList:true,subtree:true,characterData:true});
  panel.append(builder,workspace);
}
function installSectionHierarchy(){
  const wb=window.__ICM_WORKBENCH__;
  for(const section of qsa('.pw-page-surface,.subpanel,.w26-review-section')){
    if(section.matches('details')||section.dataset.collapsible==='true')continue;
    const header=qs(':scope > .pw-surface-head,:scope > .subhead,:scope > .w26-section-head',section);
    if(header)wb?.addSectionCollapse?.(section,header,(qs('h3,h4',header)?.textContent||'section').trim());
  }
}
window.__ICM_WORKBENCH__.installSectionHierarchy=installSectionHierarchy;
function installRainfallReviewActions(){
  const section=$('surveyRainfallReview');
  if(!section||$('hbRainfallReviewActions'))return;
  const actions=document.createElement('div'),status=document.createElement('p');
  actions.className='actions';actions.id='hbRainfallReviewActions';status.setAttribute('role','status');
  qs(':scope > .subhead',section).append(actions);$('surveyRainfallSummary').before(status);
  for(const [caption,component,open] of [['Compare rain gauges','rainfallSpatial',()=>window.HydraRainfallSpatial.open()],
    ['Review verification suitability','surveySuitability',()=>window.HydraSurveySuitability.open()]]){
    const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=caption;
    button.setAttribute('aria-haspopup','dialog');actions.append(button);
    button.onclick=async()=>{
      if(button.getAttribute('aria-busy')==='true')return;
      button.setAttribute('aria-busy','true');status.textContent='';
      try{await loadComponent(component);if(current.workspace==='survey'&&current.page==='rainfall-check')open();}
      catch(error){status.textContent=error.message+' Select '+caption+' to retry.';}
      finally{button.removeAttribute('aria-busy');}
    };
  }
}
function preparePageComposition(){
  ensureDataTimeSeriesSurface();ensureDataHealthSurface();ensureSpillSurfaces();ensureReportSurfaces();installRainfallReviewActions();
  const professional=qs('.survey-professional');
  const completeSurvey=$('completeSurveyPanel');
  own($('pwDataSetupSurface'),['data/time-series']);
  own($('pwTimeSeriesEventSurface'),['data/time-series']);
  own($('surveyReviewHeader'),['survey/fdv-check','survey/rainfall-check','survey/volume-balance','survey/monthly-review']);
  own($('surveyMonthlyReview'),['survey/monthly-review']);
  own($('surveyAssociationPanel'),['survey/fdv-check','survey/rainfall-check','survey/volume-balance','survey/monthly-review']);
  own(qs('#tab-data-health .tool-main-section'),['survey/fdv-check']);
  own($('pwDataHealthSummary'),['survey/fdv-check']);
  own(completeSurvey,['survey/fdv-check']);
  own($('surveyRainfallReview'),['survey/rainfall-check']);
  own(professional,['survey/rainfall-check']);
  own($('surveyBalancePanel'),['survey/volume-balance']);
  own(qs('#tab-compare > .panel'),['graphs/comparison','graphs/rating','graphs/dwf']);
  own(qs('#tab-compare > .panel > .panel-head'),['graphs/comparison']);
  own(qs('#tab-compare .tool-main-section'),['graphs/comparison']);
  own($('scenarioComparisonTable'),['graphs/comparison']);
  own($('pwRatingPanel'),['graphs/rating']);
  own($('pwDwfPanel'),['graphs/dwf']);
  own($('tab-storage'),['spills/storage']);
  own($('pwSpillThresholdSurface'),['spills/assessment']);
  own($('pwSpillResultsSurface'),['spills/assessment']);
  own($('pwReportBuilderSurface'),['reports/report-generation']);
  own($('pwWorkspaceSurface'),['reports/workspace']);
  for(const sel of ['#tab-data-health>.panel>.panel-head','#tab-spills>.panel>.panel-head','#tab-workspace>.panel>.panel-head']){const el=qs(sel);if(el)el.classList.add('pw-legacy-framing');}
  for(const selector of ['#tab-spills .tool-main-section','#tab-workspace .tool-main-section']){const legacy=qs(selector);if(legacy)legacy.hidden=true;}
  const balanceBtn=$('runSurveyBalanceBtn');if(balanceBtn){balanceBtn.classList.remove('primary');balanceBtn.textContent='Recalculate balance';}
  const ratingBtn=$('runRatingBtn');if(ratingBtn)ratingBtn.classList.add('primary');
  const dwfBtn=$('runDwfBtn');if(dwfBtn)dwfBtn.classList.add('primary');
  installSectionHierarchy();
}

function applyPageComposition(){
  preparePageComposition();
  const key=current.workspace+'/'+current.page;
  ownedSurfaces.forEach(node=>{
    const hidden=!String(node.dataset.pwOwned||'').split(' ').includes(key);
    node.hidden=hidden;
    // The legacy stylesheet contains display rules for active tab content.
    // Enforce route ownership inline as well so nested/embedded workflows have
    // identical containment in Chromium and Firefox.
    if(hidden)node.style.setProperty('display','none','important');
    else node.style.removeProperty('display');
  });
}
function buildShell(){
  if(qs('.pw-app'))return;
  document.body.classList.add('precision-workbench');
  const topbar=qs('.topbar'),main=qs('main.shell'),footer=qs('footer');
  const review=footer?.previousElementSibling?.matches('section.panel')?footer.previousElementSibling:null;
  const app=document.createElement('div');app.className='pw-app';
  const rail=document.createElement('aside');rail.className='pw-rail';rail.setAttribute('aria-label','Primary workspaces');
  rail.id='pwNavigation';
  rail.innerHTML='<div class="pw-brand"><div class="pw-brand-mark"><span class="pw-brand-icon" aria-hidden="true"><svg class="hb-brand-mark" aria-hidden="true" focusable="false" viewBox="0 0 48 48"><path fill="#fff" stroke="#20252a" stroke-width="3.5" stroke-linejoin="round" d="M9 4h4a5 5 0 0 1 5 5v6a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V9a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v30a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5v-6a4 4 0 0 0-4-4h-4a4 4 0 0 0-4 4v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5Z"/><path stroke="#20252a" stroke-width="3" d="M11 11v15m26 1v10"/><path fill="none" stroke="#4740b6" stroke-width="3.5" stroke-linecap="round" d="M5 37h4c4 0 5-3 5.5-6.5C15.2 25.7 20 24 24 24h16c-3-3-3.5-6-3.5-12"/><path class="hb-brand-pulse" pathLength="100" fill="none" stroke="#c2bcff" stroke-width="2.1" stroke-linecap="round" d="M5 37h4c4 0 5-3 5.5-6.5C15.2 25.7 20 24 24 24h16c-3-3-3.5-6-3.5-12"/><g fill="#fff" stroke="#20252a" stroke-width="2.5"><circle cx="11" cy="11" r="3.1"/><circle cx="37" cy="11" r="3.1"/><circle cx="24" cy="24" r="3.1"/><circle cx="11" cy="37" r="3.1"/><circle cx="37" cy="37" r="3.1"/></g></svg></span><span class="pw-brand-title">Hydra<span class="hb-brand-bench">Bench</span></span><button type="button" id="pwBrandToggle" class="pw-navigation-toggle" aria-controls="pwNavigation" aria-label="Collapse navigation" aria-expanded="true" title="Collapse navigation">'+navigationToggleIcon+'</button></div><small>Browser-local hydraulic evidence and assessment.</small></div><nav class="pw-primary-nav"></nav><section class="pw-asset-browser"><label for="pwAssetSearch">Assets & scenarios</label><input class="pw-asset-search" id="pwAssetSearch" type="search" placeholder="Filter assets…"><div class="pw-assets" id="pwAssets"></div></section>';
  const bottom=document.createElement('div');bottom.className='pw-rail-bottom';
  bottom.innerHTML='<nav class="pw-about-nav" aria-label="About the tool"></nav>';
  bottom.appendChild(qs('.pw-asset-browser',rail));rail.appendChild(bottom);
  const pnav=qs('.pw-primary-nav',rail),aboutNav=qs('.pw-about-nav',rail);
  Object.entries(ROUTES).forEach(([key,w])=>{
    const b=document.createElement('button');b.type='button';b.dataset.workspace=key;b.innerHTML=navIcon(w.icon)+'<span class="pw-nav-label">'+esc(w.label)+'</span>';b.setAttribute('aria-label',w.label);b.addEventListener('click',()=>navigate(key,Object.keys(w.pages)[0],true));(key==='about'?aboutNav:pnav).appendChild(b);
  });
  const stage=document.createElement('div');stage.className='pw-stage';
  const context=document.createElement('section');context.className='pw-context';
  context.innerHTML='<div class="pw-context-head"><div><div class="pw-breadcrumb"><span id="pwBreadcrumbWorkspace"></span><span>›</span><strong id="pwBreadcrumbPage"></strong></div><h2 class="pw-page-title" id="pwPageTitle"></h2><p class="pw-page-description" id="pwPageDescription"></p></div><div class="pw-context-actions"><button class="pw-focus-toggle" id="pwFocusToggle" type="button" aria-pressed="false" hidden>Focus canvas</button><button class="pw-rail-toggle pw-navigation-toggle" id="pwRailToggle" type="button" aria-controls="pwNavigation" aria-expanded="false" aria-label="Expand navigation" title="Expand navigation" hidden>'+navigationToggleIcon+'</button><button class="pw-inspector-toggle" id="pwInspectorToggle" type="button" aria-controls="pwInspector" aria-expanded="false">Inspector</button></div></div><nav class="pw-secondary-nav" id="pwSecondaryNav" aria-label="Workspace pages"></nav>';
  const workarea=document.createElement('div');workarea.className='pw-workarea';
  const inspector=document.createElement('aside');inspector.className='pw-inspector';inspector.id='pwInspector';inspector.innerHTML='<div class="pw-inspector-head"><div><strong>Inspector</strong><span id="pwInspectorSubtitle">Context and settings</span></div><button class="pw-inspector-drawer-close" id="pwInspectorClose" type="button" aria-label="Close inspector">×</button></div><div class="pw-inspector-body" id="pwInspectorBody"></div>';
  const parent=topbar?.parentNode||document.body;
  parent.insertBefore(app,topbar||parent.firstChild);
  app.append(rail,stage);
  if(topbar)stage.appendChild(topbar);
  stage.appendChild(context);
  workarea.append(main,inspector);stage.appendChild(workarea);
  if(review){review.classList.add('pw-review-notes');stage.appendChild(review);}
  if(footer)stage.appendChild(footer);
  const oldTabs=qs('.tabs');if(oldTabs){oldTabs.setAttribute('aria-hidden','true');oldTabs.inert=true;}
  const applyRailState=()=>{
    document.body.classList.toggle('pw-rail-collapsed',railCollapsed);
    document.body.classList.toggle('pw-rail-expanded',railExplicit&&!railCollapsed);
    syncNavigationToggle();
  };
  const toggleRail=()=>{
    if(matchMedia('(max-width:620px)').matches){rail.classList.toggle('is-open');syncNavigationToggle();const target=rail.classList.contains('is-open')?qs('button[aria-current="page"]',rail):$('pwRailToggle');target?.focus({preventScroll:true});return;}
    const expanding=rail.getBoundingClientRect().width<100;
    if(expanding&&document.body.classList.contains('pw-focus-canvas')){
      focusPreference=false;
      try{sessionStorage.setItem('icm-pw-focus-canvas','off');}catch{}
      applyFocusCanvas(true);
    }
    railCollapsed=!expanding;railExplicit=true;
    try{sessionStorage.setItem('icm-pw-rail-collapsed',railCollapsed?'on':'off');}catch{}
    applyRailState();resizeVisuals();
  };
  $('pwRailToggle')?.addEventListener('click',toggleRail);
  $('pwBrandToggle')?.addEventListener('click',toggleRail);
  applyRailState();
  $('pwInspectorToggle')?.addEventListener('click',()=>{
    document.body.classList.remove('pw-inspector-collapsed');
    inspector.classList.add('is-open');syncInspectorAccessibility();resizeVisuals();
    if(inspectorOverlay())$('pwInspectorClose')?.focus({preventScroll:true});
  });
  $('pwInspectorClose')?.addEventListener('click',()=>{
    inspector.classList.remove('is-open');
    document.body.classList.add('pw-inspector-collapsed');syncInspectorAccessibility();resizeVisuals();
    $('pwInspectorToggle')?.focus({preventScroll:true});
  });
  inspector.addEventListener('keydown',event=>{if(event.key==='Escape'&&inspectorOverlay()&&inspector.classList.contains('is-open')){event.preventDefault();$('pwInspectorClose')?.click();}});
  inspector.addEventListener('transitionend',event=>{if(event.target===inspector&&event.propertyName==='transform')resizeVisuals();});
  $('pwFocusToggle')?.addEventListener('click',()=>{
    const next=!document.body.classList.contains('pw-focus-canvas');
    focusPreference=next;
    try{sessionStorage.setItem('icm-pw-focus-canvas',next?'on':'off');}catch{}
    applyFocusCanvas(true);
  });
  $('pwAssetSearch')?.addEventListener('input',renderAssets);
}
function createScenarioChecklist(){
  const select=$('modelSelect');if(!select||$('pwScenarioPicker'))return;
  select.classList.add('pw-canonical-select');
  select.tabIndex=-1;
  select.setAttribute('aria-hidden','true');
  const oldSmall=select.nextElementSibling?.tagName==='SMALL'?select.nextElementSibling:null;
  if(oldSmall)oldSmall.hidden=true;
  const wrap=document.createElement('div');wrap.id='pwScenarioPicker';wrap.className='pw-scenario-picker';
  wrap.innerHTML='<button id="modelPickerTrigger" class="pw-model-picker-trigger" type="button" aria-haspopup="true" aria-controls="modelPickerPopover" aria-expanded="false">No models</button><div id="modelPickerPopover" class="pw-model-picker-popover" hidden><input class="pw-model-search" type="search" placeholder="Search model series…" aria-label="Search model series"><div class="pw-model-picker-actions"><button type="button" data-action="all">Select all</button><button type="button" data-action="none">Deselect all</button></div><div class="pw-scenario-list" role="group" aria-label="Model scenarios"></div></div><div class="pw-scenario-count">No models selected.</div>';
  select.insertAdjacentElement('afterend',wrap);
  const trigger=$('modelPickerTrigger'),popover=$('modelPickerPopover'),search=qs('input[type="search"]',popover),list=qs('.pw-scenario-list',popover),count=qs('.pw-scenario-count',wrap);
  const updateCount=()=>{
    const n=select.selectedOptions.length;
    trigger.textContent=n===0?'No models':n===1?'1 model selected':n+' models selected';
    count.textContent=n===0?'No comparison models selected.':n===1?'1 comparison model selected.':n+' comparison models selected.';
  };
  const render=()=>{
    const selected=new Set([...select.selectedOptions].map(o=>o.value)),term=(search.value||'').trim().toLowerCase();
    const options=[...select.options].filter(o=>o.value&&(!term||o.textContent.toLowerCase().includes(term)));
    list.innerHTML=options.map(o=>'<label class="pw-scenario-option"><input type="checkbox" value="'+esc(o.value)+'" '+(selected.has(o.value)?'checked':'')+'><span>'+esc(o.textContent)+'</span></label>').join('')||'<span class="pw-shell-note">No matching model series.</span>';
    qsa('input[type="checkbox"]',list).forEach(cb=>cb.addEventListener('change',()=>{
      [...select.options].forEach(o=>{if(o.value===cb.value)o.selected=cb.checked;});
      select.dispatchEvent(new Event('change',{bubbles:true}));updateCount();refreshScope();
    }));
    updateCount();
  };
  trigger.addEventListener('click',()=>{const next=popover.hidden;popover.hidden=!next;trigger.setAttribute('aria-expanded',next?'true':'false');if(next){render();search.focus();}});
  popover.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    event.preventDefault();
    popover.hidden=true;
    trigger.setAttribute('aria-expanded','false');
    trigger.focus();
  });
  search.addEventListener('input',render);
  qsa('[data-action]',popover).forEach(btn=>btn.addEventListener('click',()=>{
    const choose=btn.dataset.action==='all';[...select.options].forEach(o=>{if(o.value)o.selected=choose;});
    select.dispatchEvent(new Event('change',{bubbles:true}));render();refreshScope();
  }));
  document.addEventListener('click',event=>{if(!wrap.contains(event.target)&&!popover.hidden){popover.hidden=true;trigger.setAttribute('aria-expanded','false');}});
  new MutationObserver(render).observe(select,{childList:true,subtree:true});
  select.addEventListener('change',()=>{render();refreshScope();});
  render();
}
function restoreDocked(){
  for(const item of docked){if(item.marker?.parentNode)item.marker.parentNode.insertBefore(item.node,item.marker.nextSibling);item.marker?.remove();}
  docked=[];
}
function dock(node){
  if(!node||node.closest('.pw-inspector'))return;
  const marker=document.createComment('precision-workbench-inspector-home');
  node.parentNode.insertBefore(marker,node);$('pwInspectorBody').appendChild(node);docked.push({node,marker});
}
function dockSurveySettings(node){
  const target=$('surveyAssessmentSettingsBody');
  if(!node||!target||target.contains(node))return;
  const marker=document.createComment('survey-settings-home');node.parentNode.insertBefore(marker,node);
  target.prepend(node);docked.push({node,marker});
}
function inspectorContext(page){
  const body=$('pwInspectorBody'),inspector=$('pwInspector'),toggle=$('pwInspectorToggle');if(!body)return;
  body.innerHTML='<div class="pw-context-card"><h4>Current context</h4><dl><dt>Workspace</dt><dd>'+esc(ROUTES[current.workspace].label)+'</dd><dt>Page</dt><dd>'+esc(page.label)+'</dd><dt>Processing</dt><dd>Local browser</dd></dl></div>';
  const root=page.root?.();
  if(current.workspace==='data'&&current.page==='time-series'){dock($('v2GraphToolbar'));dock($('sharedAnalysisPanel'));dock(qs('.appearance-panel',root));}
  if(current.workspace==='graphs'&&current.page==='comparison'){dock($('sharedAnalysisPanel'));dock(qs('.mapping-grid',root));dock(qs('.actions',root));}
  if(current.workspace==='survey'){
    dockSurveySettings($('sharedAnalysisPanel'));
    dockSurveySettings($('gapInput')?.closest('label'));
  }
  if(current.workspace==='graphs'&&['rating','dwf'].includes(current.page))dock($('sharedAnalysisPanel'));
  if(current.workspace==='spills'&&current.page==='storage')dock($('sharedAnalysisPanel'));
  const useful=docked.some(item=>item.node.closest('.pw-inspector'));
  document.body.classList.toggle('pw-has-inspector',useful);
  if(inspector){inspector.hidden=!useful;if(!useful)inspector.classList.remove('is-open');}
  if(toggle)toggle.hidden=!useful;
  syncInspectorAccessibility();
  if(useful){const note=document.createElement('div');note.className='pw-shell-note';note.textContent='Settings shown here use the existing canonical browser/Python calculation paths.';body.appendChild(note);}
}

function legacyTab(name){
  if(!name)return;
  const btn=qs('.tabs .tab[data-tab="'+name+'"]');
  if(btn){syncingLegacy=true;btn.click();syncingLegacy=false;}
}
function wireLegacyNavigation(){
  const defaults={
    graph:['data','time-series'],
    'data-health':['survey','fdv-check'],
    'rain-events':['data','time-series'],
    compare:['graphs','comparison'],
    storage:['spills','storage'],
    spills:['spills','assessment'],
    workspace:['reports','report-generation']
  };
  qsa('.tabs .tab[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    if(syncingLegacy)return;
    const next=defaults[btn.dataset.tab];if(next)navigate(next[0],next[1],false);
  }));
}

function routeKey(){return 'pw-route-'+current.workspace+'-'+current.page;}
function clearRouteClasses(){[...document.body.classList].filter(x=>x.startsWith('pw-route-')).forEach(x=>document.body.classList.remove(x));}
function parseHash(){
  const raw=location.hash.replace(/^#\/?/,'').trim();if(!raw)return null;
  const [w,p]=raw.split('/');return canonicalRoute(w,p);
}
function navigate(workspace,page,push=false){
  const resolved=canonicalRoute(workspace,page);if(!resolved)return;
  workspace=resolved.workspace;page=resolved.page;
  if(routeMounted&&(current.workspace!==workspace||current.page!==page))
    window.dispatchEvent(new CustomEvent('icm:route-leaving',{detail:{...current}}));
  const mobileRouteFocus=matchMedia('(max-width:620px)').matches&&Boolean(qs('.pw-rail.is-open')?.contains(document.activeElement));
  rememberRouteScroll();cancelScrollRestore();
  restoreDocked();
  current={workspace,page};
  const spec=ROUTES[workspace],p=spec.pages[page];
  clearRouteClasses();document.body.classList.add(routeKey());
  qsa('.pw-route-visible').forEach(x=>x.classList.remove('pw-route-visible'));
  legacyTab(p.tab);
  // Route ownership is semantic, not only visual. Explicitly hide every
  // legacy tab panel before exposing the selected Precision route so an
  // old active-tab class can never leak another task's primary action.
  qsa('main.shell>.tab-panel').forEach(x=>{x.hidden=true;x.style.setProperty('display','none','important');});
  const root=p.root?.();
  if(root){
    startOptionalPanel(p,root);
    root.classList.add('pw-route-visible');
    if(root.classList.contains('tab-panel')){root.hidden=false;root.style.removeProperty('display');}
    let ancestor=root.parentElement;
    while(ancestor&&ancestor!==qs('main.shell')){
      if(ancestor.classList.contains('tab-panel')||ancestor.classList.contains('embedded-workflow')){
        ancestor.classList.add('pw-route-visible');
        if(ancestor.classList.contains('tab-panel')){ancestor.hidden=false;ancestor.style.removeProperty('display');}
      }
      ancestor=ancestor.parentElement;
    }
  }
  applyPageComposition();
  const railPrevious=qs('.pw-rail-indicator')?.getBoundingClientRect();
  qsa('.pw-primary-nav button,.pw-about-nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.workspace===workspace?'page':'false'));
  $('pwBreadcrumbWorkspace').textContent=spec.label;$('pwBreadcrumbPage').textContent=p.label;$('pwPageTitle').textContent=p.title;$('pwPageDescription').textContent=p.description;
  const sn=$('pwSecondaryNav');
  const sameWorkspace=sn.dataset.workspace===workspace;
  const previousPill=sameWorkspace?qs('.pw-tab-indicator',sn)?.getBoundingClientRect():null;
  if(!sameWorkspace){
    sn.innerHTML='';sn.dataset.workspace=workspace;sn.setAttribute('role','tablist');sn.setAttribute('aria-label',spec.label+' pages');
    Object.entries(spec.pages).forEach(([key,entry])=>{const b=document.createElement('button');b.type='button';b.dataset.page=key;b.textContent=entry.label;b.id='pw-tab-'+workspace+'-'+key;b.setAttribute('role','tab');b.addEventListener('click',()=>navigate(workspace,key,true));sn.appendChild(b);});
  }
  qsa('button',sn).forEach(b=>{const active=b.dataset.page===page;b.setAttribute('aria-current',active?'page':'false');b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;const target=spec.pages[b.dataset.page].root?.();if(target){b.setAttribute('aria-controls',target.id);target.setAttribute('role','tabpanel');if(active)target.setAttribute('aria-labelledby',b.id);}});
  inspectorContext(p);refreshScope();renderAssets();
  // A route change must preserve the layout chosen by the engineer.
  qs('.pw-rail')?.classList.remove('is-open');
  applyFocusCanvas(false);
  if(mobileRouteFocus)qs('button[aria-current="page"]',sn)?.focus({preventScroll:true});
  if(push){const h='#/'+workspace+'/'+page;if(location.hash!==h)history.pushState(null,'',h);}
  document.title=p.title+' · Hydra Bench';
  resizeVisuals();
  window.dispatchEvent(new CustomEvent('icm:route-changed',{detail:{workspace,page}}));
  if(workspace==='network'&&page==='schematic'){
    const networkRoot=$('tab-spill-network');
    if(networkRoot&&!networkRoot.children.length){
      const loading=document.createElement('p');loading.className='pw-empty-state';
      loading.setAttribute('role','status');loading.textContent='Opening network schematic…';
      networkRoot.appendChild(loading);
    }
    void window.ICMNetworkSchematic?.open();
  }
  routeMounted=true;restoreRouteScroll();
  positionRailIndicator(railPrevious);positionTabIndicator(previousPill);
}
function syncNavigationToggle(){
  const toggle=$('pwBrandToggle'),rail=$('pwNavigation'),opener=$('pwRailToggle');if(!toggle||!rail||!opener)return;
  const drawer=matchMedia('(max-width:620px)').matches;
  const expanded=drawer?rail.classList.contains('is-open'):rail.getBoundingClientRect().width>=100;
  const label=expanded?'Collapse navigation':'Expand navigation';
  for(const button of [toggle,opener]){
    button.setAttribute('aria-expanded',String(expanded));
    button.setAttribute('aria-label',label);
    button.title=label;
  }
  rail.inert=drawer&&!expanded;
  opener.hidden=!drawer||expanded;
  positionRailIndicator();
}
function inspectorOverlay(){return matchMedia('(max-width:1260px)').matches||document.body.classList.contains('pw-focus-canvas');}
function syncInspectorAccessibility(){
  const inspector=$('pwInspector'),toggle=$('pwInspectorToggle');if(!inspector)return;
  const expanded=!inspector.hidden&&(inspectorOverlay()?inspector.classList.contains('is-open'):!document.body.classList.contains('pw-inspector-collapsed'));
  inspector.inert=!expanded;
  toggle?.setAttribute('aria-expanded',String(expanded));
}
function positionRailIndicator(previous){
  const rail=$('pwNavigation'),active=rail&&qs('button[aria-current="page"]',rail);
  if(active)window.HydraDesign?.moveSelection(rail,active,'pw-rail-indicator',previous);
}
function positionTabIndicator(previous){
  const nav=$('pwSecondaryNav'),active=nav&&qs('button[aria-current="page"]',nav);if(!active)return;
  const left=active.offsetLeft,width=active.offsetWidth;
  // Keep the selected route discoverable without moving the document or charts.
  if(left<nav.scrollLeft)nav.scrollLeft=left;
  else if(left+width>nav.scrollLeft+nav.clientWidth)nav.scrollLeft=left+width-nav.clientWidth+4;
  window.HydraDesign?.moveSelection(nav,active,'pw-tab-indicator',previous);
}
function isFocusRoute(){
  return true;
}
let resizeFrame=0;
function resizeVisuals(){
  if(resizeFrame)return;
  resizeFrame=requestAnimationFrame(()=>{
    resizeFrame=0;
    // Read geometry together before Plotly writes. Overlays do not change the
    // canvas size; avoid repainting every chart while a drawer is animating.
    const changed=qsa('.js-plotly-plot').filter(chart=>{
      if(!chart.isConnected||chart.offsetParent===null)return false;
      const width=chart.clientWidth,height=chart.clientHeight,layout=chart._fullLayout;
      return width>1&&height>1&&layout&&(Math.abs(layout.width-width)>1||Math.abs(layout.height-height)>1);
    });
    changed.forEach(chart=>{
      try{
        const pending=window.Plotly?.Plots?.resize?.(chart);
        if(pending&&typeof pending.catch==='function')pending.catch(()=>{});
      }catch{}
    });
    // Plotly responsive listeners already handle real window resizes. Sending
    // a synthetic event here repeats the same expensive work a second time.
  });
}
function applyFocusCanvas(userInitiated=false){
  const eligible=isFocusRoute(),desktop=matchMedia('(min-width:901px)').matches;
  // Keep the full labelled navigation visible by default on every route.
  // Focus canvas remains an explicit opt-in for users who want maximum graph width.
  const active=desktop&&focusPreference===true;
  document.body.classList.toggle('pw-focus-canvas',active);
  const button=$('pwFocusToggle');
  if(button){
    button.hidden=!eligible||!desktop;
    button.setAttribute('aria-pressed',active?'true':'false');
    button.textContent=active?'Standard layout':'Focus canvas';
    button.title=active?'Restore the full navigation and docked inspector':'Maximise chart width; keep controls in an overlay inspector';
  }
  const inspector=$('pwInspector');
  if(!active&&userInitiated)inspector?.classList.remove('is-open');
  syncNavigationToggle();syncInspectorAccessibility();
  resizeVisuals();
}
function selectionLabel(id,fallback='—'){
  const el=$(id);if(!el)return fallback;
  if(el instanceof HTMLSelectElement)return el.selectedOptions[0]?.textContent?.trim()||fallback;
  return el.value?.trim()||fallback;
}
function refreshScope(){
  const scope=$('pwScopebar');if(!scope)return;
  const observed=selectionLabel('observedSelect','Not mapped');
  const rain=selectionLabel('rainSelect','Not mapped');
  const models=$('modelSelect')?.selectedOptions?.length||0;
  const start=$('analysisStart')?.value||'';
  const end=$('analysisEnd')?.value||'';
  const period=start||end?(start||'data start')+' → '+(end||'data end'):'Full common series';
  const items=[
    ['Observed',observed],
    ['Models',models?String(models):'None'],
    ['Rain gauge',rain],
    ['Period',period],
    ['Time basis','Source-defined']
  ];
  scope.innerHTML=items.map(([k,v])=>'<div class="pw-scope-item"><span>'+esc(k)+'</span><strong title="'+esc(v)+'">'+esc(v)+'</strong></div>').join('');
}
function assetSnapshot(){
  try{return window.ICMProjectRegistry?.snapshot?.()||null}catch{return null}
}
function renderAssets(){
  const target=$('pwAssets');if(!target)return;
  const filter=($('pwAssetSearch')?.value||'').trim().toLowerCase(),snap=assetSnapshot();
  let rows=[];
  if(snap?.assets?.length)rows=snap.assets.map(a=>({name:a.id||a.name||'Asset',meta:(a.kind||'asset')+(a.sourceIds?.length?' · '+a.sourceIds.length+' source'+(a.sourceIds.length===1?'':'s'):'')}));
  else rows=qsa('#poolBody tr').map(tr=>({name:qs('.file-name',tr)?.textContent?.trim()||qs('td',tr)?.textContent?.trim()||'Source',meta:'source'}));
  rows=rows.filter(x=>!filter||(x.name+' '+x.meta).toLowerCase().includes(filter));
  target.innerHTML=rows.length?rows.slice(0,40).map(x=>'<div class="pw-asset-item"><strong>'+esc(x.name)+'</strong><span>'+esc(x.meta)+'</span></div>').join(''):'<div class="pw-empty-assets">No matching assets.</div>';
}
function wireContextUpdates(){
  ['observedSelect','rainSelect','analysisStart','analysisEnd','workspaceName'].forEach(id=>$(id)?.addEventListener('change',refreshScope));
  $('modelSelect')?.addEventListener('change',()=>{refreshReportScenarioOptions();refreshScope();});
  window.addEventListener('icm:source-pool-changed',()=>{renderAssets();setTimeout(()=>{createScenarioChecklist();refreshReportScenarioOptions();refreshScope();},0);});
  const syncLocationRoute=()=>{const r=parseHash()||(!location.hash?DEFAULT_ROUTE:null);if(r&&(r.workspace!==current.workspace||r.page!==current.page))navigate(r.workspace,r.page,false);};
  window.addEventListener('hashchange',syncLocationRoute);
  // pushState-backed route changes are restored by browser Back/Forward through
  // popstate. Keep this explicit instead of relying on browser-specific fragment
  // event ordering.
  window.addEventListener('popstate',syncLocationRoute);
  const secondary=$('pwSecondaryNav');
  secondary?.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const buttons=qsa('button',secondary).filter(button=>!button.disabled&&!button.hidden);
    if(!buttons.length)return;
    const active=document.activeElement?.closest?.('#pwSecondaryNav button');
    let index=Math.max(0,buttons.indexOf(active));
    if(event.key==='Home')index=0;
    else if(event.key==='End')index=buttons.length-1;
    else if(event.key==='ArrowRight')index=(index+1)%buttons.length;
    else index=(index-1+buttons.length)%buttons.length;
    event.preventDefault();
    const targetPage=buttons[index].dataset.page;
    buttons[index].click();
    // navigate() is synchronous. Restore focus immediately so keyboard state is deterministic
    // across Firefox/Chromium and does not depend on animation-frame timing.
    qs('#pwSecondaryNav button[data-page="'+CSS.escape(targetPage)+'"]')?.focus({preventScroll:true});
  });
  const focusMedia=matchMedia('(min-width:901px)');
  focusMedia.addEventListener?.('change',()=>applyFocusCanvas(false));
  matchMedia('(max-width:620px)').addEventListener?.('change',syncNavigationToggle);
  matchMedia('(max-width:1260px)').addEventListener?.('change',syncInspectorAccessibility);
  new ResizeObserver(()=>positionTabIndicator()).observe(secondary);
  const railObserver=new ResizeObserver(()=>positionRailIndicator());
  for(const group of qsa('.pw-rail .pw-primary-nav,.pw-rail-bottom'))railObserver.observe(group);
  matchMedia('(prefers-reduced-motion:reduce)').addEventListener?.('change',()=>{positionRailIndicator();positionTabIndicator();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&qs('.pw-rail.is-open')){qs('.pw-rail').classList.remove('is-open');syncNavigationToggle();$('pwRailToggle')?.focus({preventScroll:true});}});
}
function buildAboutPage(){
  if($('tab-about'))return;
  const summaries=[
    ['data','time-series','Data / time series','Upload CSV, FDV and rainfall R files, association workbooks and ICM assessment reports into a shared source pool. Assign observed, modelled and rainfall series, confirm their quantities and units, and review hydraulic traces, thresholds, rainfall events and source statistics. This is the starting point for supplying and checking the evidence used by the other workspaces.'],
    ['spills','assessment','Spills','Assess observed and modelled spills using explicit thresholds, exclusions and valid temporal support. Review physical spill intervals, UK 12/24 counts and yearly or monthly comparisons. Storage assessment provides idealised storage screening and modelled spill-volume evidence to support further engineering investigation.'],
    ['network','schematic','Network Schematic','Arrange and annotate a network, assign annual spill evidence and review observed and modelled results by asset and reporting year.'],
    ['survey','fdv-check','Flow survey','Review monitor and rain-gauge weeks from their schematics, record a rating and comment for each week, and check flow continuity in Volume balance. Monthly review brings the outcomes and actions together for PDF export.'],
    ['detriment','flooding','Detriment assessment','Compare baseline Scenario A with proposed Scenario B using exported ICM report evidence. The Flooding, Level and Spill tabs assess changes in flood volume, maximum water-level elevation and freeboard, or spill counts and actual durations. Explicit criteria, raw asset evidence and optional manhole / link ID lists support a focused, traceable assessment.'],
    ['graphs','comparison','Verification','Explore observed versus modelled agreement, depth and flow–depth rating diagnostics, and dry-weather-flow baselines. Use scatter views, fitted relationships and verification statistics to understand model performance and hydraulic behaviour, with sample support and data-validity limitations retained.'],
    ['hydraulics','capacity','Hydraulic Calculations','Assess full-flow capacity and supported turbulent normal depths for steady uniform flow in a circular pipe.'],
    ['reports','report-generation','Reports','Export engineering assessments and graph reports from the current analysis, and save or restore a workspace with its configuration and source fingerprints. Reports carry the relevant criteria, units and evidence so results can be reviewed and shared; saved workspaces reference the original files without embedding their raw data.']
  ];
  const panel=document.createElement('section');panel.id='tab-about';panel.className='tab-panel';panel.hidden=true;
  panel.innerHTML='<article class="panel pw-about-page"><header class="pw-about-intro"><span class="pw-about-monogram" aria-hidden="true">HB</span><div><h2>Hydra Bench</h2><p class="pw-about-lead">Hydraulic evidence. Clear assessment.</p></div></header><p class="pw-about-description">Hydra Bench is a browser-based engineering workbench for reviewing exported InfoWorks ICM results, telemetry, flow surveys and rainfall data. It brings data assessment, model verification, spill analysis and scenario comparison into one place, with explicit assumptions, units and traceable source evidence. Imported engineering data is processed locally in your browser.</p><section aria-labelledby="pwAboutWorkspaces"><h3 id="pwAboutWorkspaces">Your workspaces</h3><div class="pw-about-workspaces">'+summaries.map(([w,p,title,description])=>'<section><h4><button type="button" data-about-workspace="'+w+'" data-about-page="'+p+'">'+esc(title)+' <span aria-hidden="true">↗</span></button></h4><p>'+esc(description)+'</p></section>').join('')+'</div></section><section class="pw-about-author"><h3>Originally created by Anzar Sajid</h3><p>Created from practical hydraulic modelling and data-review workflows, Hydra Bench aims to make engineering evidence easier to inspect, compare and communicate. Its focus is on clear results, explicit assessment criteria and a streamlined path from imported data to an auditable engineering review.</p><p>HydraBench began as a local graphing and hydraulic-data review tool. It grew into an engineering decision support platform with a shared source and evidence model. Anzar Sajid directed its development with AI assistance. Third-party software and fonts retain their original authorship and licence notices.</p><p>© 2026 Anzar Sajid and other applicable rights holders · <span id="hbAboutVersion"></span></p><p><a href="LICENSE.txt">GNU AGPLv3</a> · <a href="https://github.com/anzarsajid91/ICM_Graphing_Tool" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Official repository</a> · <span id="hbAboutSource"></span></p></section></article>';
  qs('main.shell').appendChild(panel);
  panel.querySelector('#hbAboutVersion').textContent=$('appVersion')?.textContent||'Development';
  const source=$('hbBuildSource')?.cloneNode(true);
  if(source){source.removeAttribute('id');panel.querySelector('#hbAboutSource').append(source);}
  qsa('[data-about-workspace]',panel).forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.aboutWorkspace,button.dataset.aboutPage,true)));
  window.HydraMethodLibrary.install(panel,navigate,ROUTES);
}
function buildSecurityPage(){
  const panel=document.createElement('section');panel.id='tab-security';panel.className='tab-panel';panel.hidden=true;
  const article=document.createElement('article');article.className='panel pw-about-page';
  const heading=document.createElement('h2');heading.textContent='IT Security';article.appendChild(heading);
  const identity=document.createElement('p');identity.id='securityBuildIdentity';identity.textContent='Version '+(document.querySelector('meta[name="hydra-bench-version"]')?.content||'unavailable')+' · Revision '+(document.querySelector('meta[name="icm-build-sha"]')?.content||'unavailable');article.appendChild(identity);
  let register;try{register=JSON.parse($('securityClaims')?.textContent||'null');}catch{}
  if(register){
    const scope=document.createElement('p');scope.textContent='Assessment: '+register.assessment;article.appendChild(scope);
    const cards=document.createElement('div');cards.className='pw-security-cards';
    for(const claim of register.claims){
      const card=document.createElement('section');card.dataset.claimId=claim.id;
      const title=document.createElement('h3');title.textContent=claim.title;
      const copy=document.createElement('p');copy.textContent=claim.statement;
      card.append(title,copy);cards.appendChild(card);
    }
    article.appendChild(cards);
  }else{const message=document.createElement('p');message.textContent='Security information is unavailable for this build.';article.appendChild(message);}
  const runtime=document.createElement('button'),runtimeStatus=document.createElement('p');
  runtime.type='button';runtime.className='btn';runtime.textContent='Open local data diagnostics';runtime.setAttribute('aria-haspopup','dialog');
  runtimeStatus.setAttribute('role','status');article.append(runtime,runtimeStatus);
  runtime.onclick=async()=>{
    if(runtime.getAttribute('aria-busy')==='true')return;
    runtime.setAttribute('aria-busy','true');runtimeStatus.textContent='';
    try{await loadComponent('localSecurity');if(current.page==='security')window.HydraLocalSecurity.open(navigate);}
    catch(error){runtimeStatus.textContent=error.message+' Select Open local data diagnostics to retry.';}
    finally{runtime.removeAttribute('aria-busy');}
  };
  const links=document.createElement('p');links.innerHTML='<a href="security/dependencies.json">Dependency inventory</a> · <a href="security/security-audit.md">Assessment and limitations</a> · <a href="security/claims.json">Claim–evidence register</a> · <a href="security/SECURITY.md">Security disclosure guidance</a>';article.appendChild(links);
  panel.appendChild(article);qs('main.shell').appendChild(panel);
}
function wireGuidedImport(){
  const review=$('guidedImportReview'),body=$('guidedImportRows'),status=$('guidedImportStatus');
  const roles={observed:'Observed',model:'Modelled',rainfall:'Rainfall'};
  function render(){
    const registry=window.ICMProjectRegistry,series=registry?.listSeries()||[];
    const previous=new Map(qsa('select',body).map(item=>[item.dataset.series,item.value]));
    review.hidden=!series.length;
    if(!series.length)review.open=false;
    body.replaceChildren();
    status.textContent='';
    const unresolved=series.filter(item=>!item.quantity||!item.unit).length;
    $('guidedImportReadiness').textContent=unresolved?unresolved+' of '+series.length+' series need quantity or unit review.':series.length+' series with detected quantities and units.';
    for(const item of series){
      const row=body.insertRow(), source=registry.source(item.sourceId);
      const recognised=Boolean(item.quantity&&item.unit);
      const role=Object.hasOwn(roles,item.role)?roles[item.role]:'Review required';
      const possible=recognised?role:role+' · confirm quantity and unit';
      const identity=row.insertCell();
      const label=document.createElement('strong');
      label.textContent=item.label;
      const metadata=document.createElement('small');
      metadata.textContent=[source?.format||'Unknown',item.assetId].filter(Boolean).join(' · ');
      identity.append(label,metadata);
      row.insertCell().textContent=(item.quantity||'Unresolved')+' · '+(item.unit||'Unresolved');
      const suggestion=row.insertCell();
      suggestion.textContent=possible;
      if(!recognised)suggestion.setAttribute('data-needs-review','');
      const choose=document.createElement('select');
      choose.dataset.series=item.key;
      choose.setAttribute('aria-label','Role for '+item.label);
      choose.add(new Option('Keep existing assignments',''));
      for(const [key,label] of Object.entries(roles))choose.add(new Option(label,key));
      choose.value=previous.get(item.key)||'';
      row.insertCell().append(choose);
    }
  }
  $('guidedImportApply').addEventListener('click',()=>{
    const selected=qsa('select',body).filter(control=>control.value);
    const checkedRoles={observed:[],model:[],rainfall:[]};
    for(const control of selected){
      const series=window.ICMProjectRegistry?.getSeries(control.dataset.series);
      if(!series){render();status.textContent='Sources changed. Review the current rows again.';return;}
      checkedRoles[control.value].push(series.key);
    }
    if(!selected.length){status.textContent='Choose at least one role to stage.';return;}
    if(checkedRoles.observed.length>1||checkedRoles.rainfall.length>1){
      status.textContent='Choose at most one observed series and one rainfall series.';
      return;
    }
    const plans=[
      [$('observedSelect'),checkedRoles.observed],
      [$('modelSelect'),checkedRoles.model],
      [$('rainSelect'),checkedRoles.rainfall],
    ];
    if(plans.some(([control,keys])=>keys.some(key=>![...control.options].some(option=>option.value===key)))){
      status.textContent='A chosen series is unavailable for that assignment. Check its interpretation and try again.';
      return;
    }
    for(const [control,keys] of plans){
      if(!keys.length)continue;
      if(control.multiple){
        for(const option of control.options)if(keys.includes(option.value))option.selected=true;
      }else{
        control.value=keys[0];
      }
      control.dispatchEvent(new Event('change',{bubbles:true}));
    }
    status.textContent='Selections staged. Review quantity and units and use Apply assignments to confirm.';
  });
  review.addEventListener('toggle',()=>{if(review.open)render();});
  window.addEventListener('icm:source-pool-changed',()=>{
    if(review.open)render();
    else review.hidden=!(window.ICMProjectRegistry?.listSeries().length);
  });
}
function wireVerificationOverview(){
  const table=$('verificationEvidenceTable'),scenario=$('verificationReviewScenario');
  const fields=$('verificationReviewFields'),decision=$('verificationReviewDecision');
  const comments=$('verificationReviewComments'),references=$('verificationReviewReferences');
  const status=$('verificationReviewStatus'),reviews=new Map();
  let evidence=null;
  const available=row=>Boolean(row?.metrics?.pairs&&['complete','partial'].includes(row.coverage?.status));
  function dependencyKey(dependency){
    const [,column]=JSON.parse(dependency.seriesKey);
    return [dependency.fingerprint,column,dependency.quantity,dependency.unit];
  }
  const evidenceKey=record=>JSON.stringify([record.signature,record.dependencies.map(dependencyKey),
    record.scenarios.map(row=>[row.metrics,row.coverage,row.unit,row.error])]);
  const scenarioKey=(record,key)=>{
    const dependency=record.dependencies.find(item=>item.seriesKey===key);
    return dependency?JSON.stringify([record.asset.id,...dependencyKey(dependency)]):null;
  };
  const active=()=>current.workspace==='graphs'&&current.page==='overview';
  function reviewFor(key){
    const review=reviews.get(scenarioKey(evidence,key));
    if(!review)return null;
    return {...review,stale:evidence.freshness!=='current'||review.key!==evidenceKey(evidence)};
  }
  function updateFields(){
    const selected=evidence?.scenarios.find(row=>row.seriesKey===scenario.value);
    const review=selected&&reviewFor(selected.seriesKey);
    fields.disabled=evidence?.freshness!=='current'||!evidence.scenarios.some(available);
    decision.disabled=comments.disabled=references.disabled=$('verificationReviewSave').disabled=!available(selected);
    decision.value=review&&!review.stale?review.decision:'Not reviewed';
    comments.value=review&&!review.stale?review.comments:'';
    references.value=review&&!review.stale?review.references:'';
    status.textContent=review?.stale?'A previous review is stale. Recheck the evidence before recording a decision.':'';
  }
  function render(){
    evidence=window.__ICM_WORKBENCH__?.readVerificationEvidence?.();
    const previous=scenario.value;
    scenario.replaceChildren();
    const body=qs('tbody',table);body.replaceChildren();
    table.hidden=!evidence?.scenarios.length;
    const summary=$('verificationEvidenceStatus');
    if(!evidence){
      summary.textContent='Run an observed and modelled comparison to review its evidence.';
      updateFields();
      return;
    }
    const {start,end}=evidence.period;
    summary.textContent=evidence.asset.id+' · '+(start||'start of common data')+' to '+(end||'end of common data')+
      ' · '+(evidence.freshness==='current'?'Current evidence':'Stale evidence. Recalculate the comparison before review.');
    const metric=value=>Number.isFinite(value)?Number(value.toPrecision(5)).toString():'—';
    for(const row of evidence.scenarios){
      const source=window.ICMProjectRegistry?.getSeries(row.seriesKey)?.label;
      const label=source||'Unavailable source';
      scenario.add(new Option(label,row.seriesKey));
      const review=reviewFor(row.seriesKey);
      const values=[label,metric(row.metrics?.pairs),row.error||(
        Number.isFinite(row.coverage?.coverage_fraction)?
          metric(row.coverage.coverage_fraction*100)+'% · '+row.coverage.status:'Unavailable'
      ),Number.isFinite(row.metrics?.rmse)?metric(row.metrics.rmse)+' '+(row.unit||'(unit unresolved)'):'—',metric(row.metrics?.nse),review?.stale?'Stale review':review?.decision||'Not reviewed'];
      const tr=body.insertRow();
      for(const value of values)tr.insertCell().textContent=value;
    }
    if([...scenario.options].some(option=>option.value===previous))scenario.value=previous;
    else if(evidence.scenarios.some(available))scenario.value=evidence.scenarios.find(available).seriesKey;
    updateFields();
  }
  scenario.addEventListener('change',updateFields);
  $('verificationReviewSave').addEventListener('click',()=>{
    const latest=window.__ICM_WORKBENCH__?.readVerificationEvidence?.();
    if(!evidence||latest?.freshness!=='current'||evidenceKey(latest)!==evidenceKey(evidence)){
      render();return;
    }
    if(!latest.scenarios.some(row=>row.seriesKey===scenario.value&&available(row)))return;
    if(decision.value==='Not reviewed'&&!comments.value.trim()&&!references.value.trim()){
      reviews.delete(scenarioKey(evidence,scenario.value));
    }else{
      const key=scenarioKey(evidence,scenario.value),basis=evidenceKey(evidence);
      if((!reviews.has(key)&&reviews.size>=250)||basis.length>262144){
        status.textContent='This workspace has reached its review storage limit.';return;
      }
      reviews.set(key,{key:basis,decision:decision.value,comments:comments.value.trim(),references:references.value.trim()});
    }
    render();status.textContent='Review recorded. Save the workspace to retain it.';
  });
  const decisions=new Set([...decision.options].map(option=>option.value));
  window.__ICM_WORKBENCH__.verificationReviews={
    snapshot:()=>[...reviews].map(([scenario,review])=>({scenario,...review})),
    restore:entries=>{
      reviews.clear();
      if(Array.isArray(entries)){
        for(const item of entries.slice(0,250)){
          if(!item||typeof item.scenario!=='string'||item.scenario.length>4096||
             typeof item.key!=='string'||item.key.length>262144||!decisions.has(item.decision)||
             typeof item.comments!=='string'||item.comments.length>4000||
             typeof item.references!=='string'||item.references.length>4000)continue;
          const {scenario,key,decision,comments,references}=item;
          reviews.set(scenario,{key,decision,comments,references});
        }
      }
      if(active())render();
    },
    report:(record=window.__ICM_WORKBENCH__.readVerificationEvidence())=>{
      if(record?.freshness!=='current')return [];
      return record.scenarios.flatMap(row=>{
        const review=reviews.get(scenarioKey(record,row.seriesKey));
        if(!review||review.key!==evidenceKey(record))return [];
        const series=window.ICMProjectRegistry?.getSeries(row.seriesKey);
        return [{asset:record.asset.id,scenario:series?.label||row.seriesKey,decision:review.decision,
          comments:review.comments,references:review.references,period:record.period}];
      });
    },
  };
  window.addEventListener('icm:route-changed',()=>{if(active())render();});
  window.addEventListener('icm:source-pool-changed',()=>{if(active())render();});
}
function wireVerificationEvents(){
  const events=$('verificationEventSelect'),models=$('verificationEventModel');
  const run=$('verificationEventRun'),output=$('verificationEventResult');
  const graph=$('verificationEventGraph');
  let generation=0,plottedEvent=null;
  function clearGraph(){plottedEvent=null;graph.disabled=true;}
  const active=()=>current.workspace==='graphs'&&current.page==='events';
  function refresh(){
    ++generation;clearGraph();
    events.replaceChildren();models.replaceChildren();
    if(rainEventsFresh()){
      for(const [index,event] of state.rainEvents.entries())
        events.add(new Option(event.start+' to '+event.end+' · '+event.total_depth_mm+' mm',String(index)));
    }
    for(const model of currentModels()){
      const key=sourceKey(model.id,model.col);
      models.add(new Option(model.item.displayName+' · '+model.col,key));
    }
    run.disabled=!events.options.length||!models.options.length||!state.mapping.observed;
    output.textContent=run.disabled?'Apply an observed and modelled mapping, then calculate rainfall events in Time series.':'Choose a rainfall event and modelled scenario.';
  }
  for(const control of [events,models])control.addEventListener('change',()=>{
    ++generation;clearGraph();run.disabled=false;output.textContent='Selection changed. Compare the selected event to refresh results.';
  });
  run.addEventListener('click',async()=>{
    if(!rainEventsFresh()){refresh();return;}
    const obs=mappingObject(state.mapping.observed),model=mappingObject(models.value);
    const event=state.rainEvents[Number(events.value)];
    if(!obs||!model||!event)return;
    if(!$('timeBasisConfirmed').checked){
      output.textContent='Confirm the comparison time basis in Data / Time series first.';return;
    }
    const request=++generation,signature=analysisSignature(),rainfall=state.rainEventSignature;
    clearGraph();run.disabled=true;output.textContent='Comparing event…';
    try{
      const values=await engine.call('verification_event_comparison',{
        obs_path:obs.item.virtualPath,obs_col:obs.col,model_path:model.item.virtualPath,model_col:model.col,
        start:event.start,end:event.end,max_gap_seconds:Number($('gapInput').value||900),
        offset_minutes:Number($('offsetInput').value||0),
        exclusions_json:JSON.stringify([...exclusionPayload(true,'observed',state.mapping.observed),...exclusionPayload(true,'model',models.value)]),
      });
      if(request!==generation||!active())return;
      if(!rainEventsFresh()||rainfall!==state.rainEventSignature||signature!==analysisSignature()){
        refresh();output.textContent='Event inputs changed. Recalculate before using the result.';return;
      }
      plottedEvent={range:[event.start,event.end],signature,rainfall};graph.disabled=false;
      const number=value=>Number.isFinite(value)?Number(value.toPrecision(5)).toString():'—';
      const rows=[
        ['Common valid support',number(values.common_support_seconds/60)+' min · '+values.status],
        ['Excluded time',number(values.excluded_seconds/60)+' min'],
        ['Observed peak',number(values.observed_peak)+' '+values.unit],
        ['Modelled peak',number(values.modelled_peak)+' '+values.unit],
        ['Peak error (model − observed)',number(values.peak_error)+' '+values.unit],
        ['Peak lag (model − observed)',number(values.peak_lag_minutes)+' min'],
      ];
      if(values.observed_volume_m3!==null)rows.push(['Observed volume',number(values.observed_volume_m3)+' m³'],['Modelled volume',number(values.modelled_volume_m3)+' m³']);
      output.replaceChildren();
      for(const [label,value] of rows){
        const card=document.createElement('div'),title=document.createElement('strong'),caption=document.createElement('span');
        title.textContent=value;caption.textContent=label;card.append(title,caption);output.append(card);
      }
    }catch(error){
      if(request===generation&&active())output.textContent=conciseErrorMessage(error);
    }finally{
      if(request===generation&&active())run.disabled=false;
    }
  });
  graph.addEventListener('click',async()=>{
    if(!plottedEvent||!rainEventsFresh()||plottedEvent.rainfall!==state.rainEventSignature||
       plottedEvent.signature!==analysisSignature()){
      refresh();output.textContent='Event inputs changed. Recalculate before opening the graph.';return;
    }
    const {range}=plottedEvent;
    navigate('data','time-series',true);
    try{await window.ICMGraph.draw(range);}
    catch(error){$('mappingStatus').textContent=conciseErrorMessage(error);}
  });
  diagnostic.resumeVerificationEvent={
    capture(){
      if(!rainEventsFresh()||!events.value||!models.value)return null;
      const signature=analysisSignature(),rainfall=state.rainEventSignature;
      return {event:events.value,model:models.value,signature,rainfall,
        reviewed:plottedEvent?.signature===signature&&plottedEvent?.rainfall===rainfall};
    },
    restore(context){
      if(!active()||!rainEventsFresh()||state.rainEventSignature!==context.rainfall||
         analysisSignature()!==context.signature)return;
      if(![...events.options].some(option=>option.value===context.event)||
         ![...models.options].some(option=>option.value===context.model))return;
      events.value=context.event;models.value=context.model;
      events.dispatchEvent(new Event('change'));
      if(context.reviewed)run.click();
    },
  };
  window.addEventListener('icm:route-changed',()=>{if(active())refresh();else ++generation;});
  window.addEventListener('icm:source-pool-changed',()=>{if(active())refresh();});
}
function wirePipeCapacity(){
  const form=$('pipeCapacityForm'),result=$('pipeCapacityResult');
  const sectionViews=$('pipeSectionViews'),keep=$('pipeKeepResult');
  const table=$('pipeComparisonTable'),body=qs('tbody',table),status=$('pipeCompareStatus');
  const trials=[];
  const precision=value=>value===null?'—':Number(value.toPrecision(5)).toLocaleString(undefined,{maximumSignificantDigits:5});
  const capacity=trial=>trial.design?trial.values.full_capacity_m3_s:trial.values.discharge_m3_s;
  const reportSheet={id:'pipeCapacityForm',title:'Circular pipe capacity calculation sheet',content:document.createElement('div'),
    snapshot:null,revision:null,isCurrent:()=>Boolean(reportSheet.snapshot)};
  diagnostic.pipeCapacityReportSheet=()=>reportSheet;
  const announceSheet=()=>window.dispatchEvent(new Event('icm:calculation-sheets-changed'));
  let generation=0,current=null,sourceTrial=null,invertBasis=null;
  function resetResult(){
    ++generation;current=null;keep.disabled=true;sectionViews.replaceChildren();
    if(reportSheet.snapshot){
      reportSheet.snapshot=null;reportSheet.revision=null;reportSheet.content.replaceChildren();announceSheet();
    }
  }
  function publishReport(trial){
    const {design,inputs,values}=trial;
    const method=design?'circular-darcy-colebrook-normal-depth-si-v1':'circular-darcy-colebrook-full-bore-si-v1';
    const results=[['Full-bore capacity (m³/s)',capacity(trial)],['Flow status',design?values.status:values.regime]];
    const reviewInputs=[['Calculation',design?'Design-flow normal depth':'Full-bore capacity'],
      ['Internal diameter (m)',inputs.diameter_m],['Energy gradient (m/m)',inputs.gradient],
      ['Absolute roughness (m)',inputs.roughness_m],['Kinematic viscosity (m²/s)',inputs.viscosity_m2_s]];
    if(sourceTrial)reviewInputs.push(['Geometry, roughness and gradient copied from source conduit',sourceTrial]);
    if(invertBasis)reviewInputs.push(...invertBasis);
    if(design){
      reviewInputs.push(['Design discharge (m³/s)',inputs.discharge_m3_s]);
      results.push(['Imposed full-bore velocity (m/s)',values.imposed_full_velocity_m_s]);
      for(const [index,point] of values.depths.entries()){
        const label='Solution '+(index+1)+' ';
        results.push([label+'depth (m)',point.depth_m],[label+'velocity (m/s)',point.velocity_m_s],
          [label+'area (m²)',point.area_m2],[label+'hydraulic radius (m)',point.hydraulic_radius_m],
          [label+'Reynolds number',point.reynolds],[label+'Darcy f',point.friction_factor]);
      }
    }else{
      results.push(['Mean velocity (m/s)',values.velocity_m_s],['Reynolds number',values.reynolds],['Darcy f',values.friction_factor]);
    }
    const applicability=document.createElement('p');
    applicability.textContent='Steady, uniform flow in one circular barrel with one effective roughness. Review backwater, surcharge and controls with dynamic hydraulic results.';
    const rendered=result.cloneNode(true);rendered.removeAttribute('id');rendered.removeAttribute('role');rendered.removeAttribute('aria-live');
    const geometry=sectionViews.cloneNode(true);geometry.removeAttribute('id');
    reportSheet.content.replaceChildren(rendered,geometry,applicability);
    reportSheet.snapshot={title:reportSheet.title,summary:reviewInputs[0][1]+' screening',inputs:reviewInputs,
      identity:[['Hydra Bench version',document.querySelector('meta[name="hydra-bench-version"]')?.content||'Unavailable'],
        ['Application revision',buildToken],['Calculation engine revision',diagnostic.workerBuildToken||'Unavailable'],
        ['Method version',method],['Calculated at (UTC)',new Date().toISOString()]],
      rows:[['Reference','C. F. Colebrook (1939) and DOE Fundamentals Handbook DOE-HDBK-1012/3-92, Fluid Flow'],
        ['Equation','S = f V²/(2gDₕ); Q = A V; Re = VDₕ/ν; g = 9.80665 m/s².'],
        ['Equation','1/√f = −2 log₁₀(kₛ/(3.7Dₕ) + 2.51/(Re√f)) for turbulent flow.'],
        design?['Section basis','Dₕ = 4A/P with circular-segment area A and wetted perimeter P. The solver checks both limbs and withholds unsupported depths.']:
          ['Laminar basis','f = 64/Re when laminar. Capacity is withheld in the transitional range.'],
        ...(invertBasis?[['Gradient derivation','S = (upstream invert − downstream invert) / conduit length.']]:[]),...results]};
    reportSheet.revision='capacity:'+generation;announceSheet();
  }
  function drawSection(fraction,label){
    const figure=document.createElement('figure'),circle=document.createElement('div');
    const water=document.createElement('div'),caption=document.createElement('figcaption');
    circle.className='pipe-section-circle';circle.setAttribute('aria-hidden','true');
    water.className='pipe-section-water';water.style.height=(fraction*100)+'%';
    circle.append(water);caption.textContent=label;figure.append(circle,caption);sectionViews.append(figure);
  }
  function trialRow(trial,index){
    const {inputs,values,design}=trial;
    return [index+1,inputs.diameter_m*1000,inputs.gradient,inputs.roughness_m*1000,
      inputs.viscosity_m2_s,capacity(trial)===null?null:capacity(trial)*1000,
      design?inputs.discharge_m3_s*1000:null,design?values.depths.map(depth=>depth.depth_m*1000):null,
      design?values.status:values.regime];
  }
  function showComparison(){
    table.hidden=!trials.length;body.replaceChildren();
    const maxCapacity=Math.max(0,...trials.map(trial=>capacity(trial)||0))*1000;
    for(const [index,trial] of trials.entries()){
      const row=body.insertRow();
      for(const [column,value] of trialRow(trial,index).entries()){
        const cell=row.insertCell();
        cell.textContent=Array.isArray(value)?value.map(precision).join(' / ')||'—':
          typeof value==='string'?value:precision(value);
        if(column===5&&typeof value==='number'&&maxCapacity>0){
          const bar=document.createElement('meter');
          bar.className='pipe-capacity-bar';bar.max=maxCapacity;bar.value=value;
          bar.setAttribute('aria-label','Trial '+(index+1)+' full capacity in L/s');
          cell.append(bar);
        }
      }
    }
    $('pipeExportComparison').disabled=$('pipeClearComparison').disabled=!trials.length;
    keep.disabled=!current||trials.length>=8;
    status.textContent=trials.length?trials.length+' of 8 trials. Capacity bars share a common scale.':'Add up to eight trials. Export to keep a copy.';
  }
  keep.addEventListener('click',()=>{
    if(!current||trials.length>=8)return;
    trials.push(current);current=null;showComparison();
  });
  $('pipeClearComparison').addEventListener('click',()=>{trials.length=0;showComparison();});
  $('pipeExportComparison').addEventListener('click',()=>{
    const headers=['trial','diameter_mm','gradient_m_per_m','roughness_mm','viscosity_m2_s',
      'full_capacity_L_s','design_flow_L_s','normal_depths_mm','status'];
    const rows=trials.map((trial,index)=>trialRow(trial,index).map(value=>Array.isArray(value)?value.join(' / '):value));
    const csv=[headers,...rows].map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n');
    downloadBlob('hydrabench-pipe-comparison.csv',csv,'text/csv');
  });
  form.addEventListener('input',event=>{
    if(event.target===form||['diameter','roughness','gradient'].includes(event.target.name))sourceTrial=null;
    if(event.target===form||event.target.name==='gradient')invertBasis=null;
    resetResult();
    const viscosity=form.elements.viscosity.value;
    $('pipeActiveViscosity').textContent=viscosity?'ν = '+viscosity+' m²/s':'ν required';
    result.textContent='Inputs edited. Calculate to refresh capacity.';
  });
  $('pipeUseInvertGradient').addEventListener('click',()=>{
    const [us,ds,length]=['usInvert','dsInvert','conduitLength'].map(name=>form.elements[name].valueAsNumber);
    if(![us,ds,length].every(Number.isFinite)||length<=0){
      result.textContent='Enter both invert levels and a positive conduit length.';
      return;
    }
    const gradient=(us-ds)/length;
    if(!(gradient>=0&&gradient<=1)){
      result.textContent='The computed gradient is outside the supported 0–1 m/m range.';
      return;
    }
    resetResult();
    sourceTrial=null;
    invertBasis=[['Upstream invert used for gradient (m)',us],['Downstream invert used for gradient (m)',ds],['Conduit length used for gradient (m)',length]];
    form.elements.gradient.value=String(gradient);
    result.textContent='Calculated gradient applied. Calculate to refresh capacity.';
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    resetResult();
    const request=generation;
    const number=name=>form.elements[name].valueAsNumber;
    const inputs={diameter_m:number('diameter')/1000,gradient:number('gradient'),
      roughness_m:number('roughness')/1000,viscosity_m2_s:number('viscosity')};
    const design=event.submitter?.value==='design';
    if(design&&form.elements.discharge.value===''){
      result.textContent='Enter a design discharge in L/s.';
      form.elements.discharge.focus();
      return;
    }
    if(design)inputs.discharge_m3_s=number('discharge')/1000;
    result.textContent=design?'Assessing design flow…':'Calculating capacity…';
    try{
      await ensureEngineBoot();
      const operation=design?'circular_pipe_design_flow':'circular_pipe_capacity';
      const values=await engine.call(operation,inputs);
      if(request!==generation)return;
      current={design,inputs,values};keep.disabled=trials.length>=8;
      if(design){
        const summary=document.createElement('p');
        summary.textContent='Imposed full-bore velocity '+precision(values.imposed_full_velocity_m_s)+
          ' m/s · Available full-flow capacity '+(values.full_capacity_m3_s===null?'unavailable':precision(values.full_capacity_m3_s*1000)+' L/s');
        result.replaceChildren(summary);
        if(values.depths.length){
          const list=document.createElement('ul');
          for(const solution of values.depths){
            const item=document.createElement('li');
            const basis=solution.depth_fraction===1?'Full-bore boundary':'Partially full normal depth';
            item.textContent=basis+' '+precision(solution.depth_m*1000)+' mm · '+precision(solution.velocity_m_s)+
              ' m/s · Area '+precision(solution.area_m2)+' m² · Hydraulic radius '+precision(solution.hydraulic_radius_m)+' m';
            list.append(item);
            drawSection(solution.depth_fraction,precision(solution.depth_m*1000)+' mm depth');
          }
          result.append(list);
        }else{
          const note=document.createElement('p');
          note.textContent=values.status==='unavailable'?'No supported turbulent normal-depth result. Check the flow regime and roughness.':
            'No positive turbulent normal depth · '+values.status+'.';
          result.append(note);
        }
        publishReport(current);
        return;
      }
      if(values.regime==='transitional'){
        result.textContent='Capacity unavailable in the transitional flow range.';
        publishReport(current);
        return;
      }
      if(values.discharge_m3_s>0)drawSection(1,'Flowing just full');
      result.textContent=precision(values.discharge_m3_s*1000)+' L/s · '+precision(values.velocity_m_s)+
        ' m/s · Re '+precision(values.reynolds)+' · Darcy f '+precision(values.friction_factor)+' · '+values.regime;
      publishReport(current);
    }catch(error){
      if(request===generation)result.textContent=typeof conciseErrorMessage==='function'?conciseErrorMessage(error):String(error.message);
    }
  });
  window.addEventListener('icm:assessment-context-restored',()=>{
    sourceTrial=null;invertBasis=null;resetResult();
    result.textContent='Workspace restored. Calculate to refresh capacity.';
  });
  return inputs=>{
    navigate('hydraulics','capacity',true);
    for(const key of ['diameter','roughness','gradient'])form.elements[key].value=String(inputs[key]);
    form.elements.discharge.value='';
    form.dispatchEvent(new Event('input',{bubbles:true}));
    sourceTrial=inputs.label;
    result.textContent='Independent trial from '+inputs.label+'. Review fluid properties before calculating.';
  };
}
function mount(){
  const networkPanel=document.createElement('section');networkPanel.id='tab-spill-network';networkPanel.className='tab-panel';networkPanel.hidden=true;qs('main.shell').appendChild(networkPanel);
  window.HydraProjectHome.mount(navigate,ROUTES);
  installDiagnosticLauncher();
  buildAboutPage();buildSecurityPage();wireGuidedImport();wireVerificationOverview();wireVerificationEvents();
  const openPipeTrial=wirePipeCapacity();
  identifySubpanels();buildShell();preparePageComposition();createScenarioChecklist();wireContextUpdates();wireLegacyNavigation();wireScrollMemory();
  const initial=parseHash()||DEFAULT_ROUTE;navigate(initial.workspace,initial.page,false);
  window.__ICM_PRECISION_WORKBENCH__={version:6,navigate,openPipeTrial,route:()=>({...current}),routes:ROUTES,focus:()=>document.body.classList.contains('pw-focus-canvas'),setFocus:value=>{focusPreference=Boolean(value);applyFocusCanvas(true);},railCollapsed:()=>railCollapsed};
  const startup=$('hbStartup');
  if(startup)startup.hidden=true;
  document.body.classList.remove('hb-starting');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
