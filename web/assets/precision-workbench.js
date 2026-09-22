(()=>{'use strict';
const $=id=>document.getElementById(id);
const qs=(sel,root=document)=>root.querySelector(sel);
const qsa=(sel,root=document)=>[...root.querySelectorAll(sel)];
const ROUTES={
  data:{
    label:'Data & Time Series',
    icon:'data',
    pages:{
      sources:{label:'Sources',title:'Survey data sources',description:'Import, parse and audit survey, model and rainfall files in one local source pool.',root:()=>qs('.source-panel')},
      'series-mapping':{label:'Series mapping',title:'Series mapping',description:'Map observed, model, rainfall and optional hydraulic channels from the shared catalogue.',root:()=>qs('.mapping-panel')},
      'time-series':{label:'Time series',title:'Flow and rainfall review',description:'Review native hydraulic traces with rainfall, exclusions, thresholds and auditable statistics.',tab:'graph',root:()=>$('tab-graph')}
    }
  },
  survey:{
    label:'Flow Survey',
    icon:'survey',
    pages:{
      configuration:{label:'Configuration',title:'Survey association configuration',description:'Review authoritative fm_rg_assoc.xlsx relationships, conflicts and topology evidence.',tab:'data-health',root:()=>$('tab-data-health')},
      'data-health':{label:'Data Health',title:'Survey health and data coverage',description:'Inspect coverage, gaps, invalid values, flatlines and engineering suitability evidence.',tab:'data-health',root:()=>$('tab-data-health')},
      'rainfall-response':{label:'Rainfall response',title:'Rainfall response evidence',description:'Review qualified rainfall and hydraulic response evidence with the existing FSAT-derived method.',tab:'data-health',root:()=>$('tab-data-health')},
      'flow-continuity':{label:'Flow continuity',title:'Flow continuity and volume balance',description:'Assess downstream versus common-support upstream volume evidence with explicit limitations.',tab:'data-health',root:()=>$('tab-data-health')}
    }
  },
  rainfall:{
    label:'Rainfall',
    icon:'rainfall',
    pages:{
      gauges:{label:'Gauges & accumulation',title:'Network rainfall gauges and accumulation',description:'Review gauge support, accumulation and network rainfall evidence without treating missing rainfall as dry.',tab:'data-health',root:()=>$('tab-data-health')},
      events:{label:'Events & hydraulic response',title:'Rainfall events and hydraulic response',description:'Inspect event qualification, separation, coverage and linked hydraulic response.',tab:'rain-events',root:()=>$('tab-rain-events')}
    }
  },
  verification:{
    label:'Assessment',
    icon:'verify',
    pages:{
      comparison:{label:'Comparison diagnostics',title:'Verification diagnostics',description:'Compare observed and modelled data using bounded interpolation and the canonical calibration metrics.',tab:'compare',root:()=>$('tab-compare')},
      rating:{label:'Depth agreement / rating',title:'Depth and flow–depth diagnostics',description:'Inspect depth agreement or Q/H rating evidence with sample support and validity limitations.',tab:'compare',root:()=>$('tab-compare')},
      dwf:{label:'DWF',title:'Dry-weather flow baseline',description:'Review dry-weather qualification and baseline evidence without inferring dry periods from missing rainfall.',tab:'compare',root:()=>$('tab-compare')},
      storage:{label:'Storage screening',title:'Idealised storage screening',description:'Review support-aware storage screening and modelled spill-volume evidence.',tab:'storage',root:()=>$('tab-storage')}
    }
  },
  spills:{
    label:'Spills',
    icon:'spills',
    pages:{
      thresholds:{label:'Thresholds & exclusions',title:'Spill thresholds and exclusions',description:'Configure thresholds and auditable global/channel-specific exclusion periods.',tab:'spills',root:()=>$('tab-spills')},
      results:{label:'Results',title:'Spill assessment results',description:'Review physical intervals, assessment support, canonical counts and observed/model differences.',tab:'spills',root:()=>$('tab-spills')}
    }
  },
  report:{
    label:'Report',
    icon:'report',
    pages:{
      workspace:{label:'Workspace save/restore',title:'Workspace save and restore',description:'Persist configuration and source fingerprints without embedding raw engineering files.',tab:'workspace',root:()=>$('tab-workspace')},
      builder:{label:'Report builder',title:'Engineering report builder',description:'Review section readiness and export coherent engineering-report snapshots.',tab:'workspace',root:()=>$('tab-workspace')}
    }
  }
};
let current={workspace:'data',page:'sources'};
let docked=[];
let syncingLegacy=false;
let focusPreference=null;
let railCollapsed=false;
const FOCUS_ROUTES=new Set(['data/time-series','verification/comparison','rainfall/events']);
try{
  const saved=sessionStorage.getItem('icm-pw-focus-canvas');
  if(saved==='on'||saved==='off')focusPreference=saved==='on';
}catch{}
try{railCollapsed=sessionStorage.getItem('icm-pw-rail-collapsed')==='on';}catch{}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function navIcon(name){
  const paths={
    data:'<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/>',
    survey:'<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
    rainfall:'<path d="M7 15a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.5 1.5A3.5 3.5 0 0 1 18 15"/><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"/>',
    verify:'<path d="M12 3 4.5 7v5c0 4.6 3.1 7.5 7.5 9 4.4-1.5 7.5-4.4 7.5-9V7z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
    spills:'<path d="M4 9c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2"/><path d="M4 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2"/><path d="M4 19c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2"/>',
    report:'<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6M9 19h4"/>'
  };
  return '<span class="pw-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.data)+'</svg></span>';
}
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
  const section=ensureSection('pwDataHealthSummary','Monitor / source triage','Summary uses the most severe existing row RAG and minimum existing row coverage; it does not recalculate QA.');
  section.classList.add('pw-data-health-summary');
  const head=qs('.pw-surface-head',section),run=$('runHealthBtn');if(run){run.textContent='Run data health assessment';head.appendChild(run);}
  const empty=document.createElement('div');empty.id='pwHealthSummaryEmpty';empty.className='pw-empty-state';empty.textContent='Run Data Health to populate monitor/source triage.';
  const wrap=document.createElement('div');wrap.className='table-wrap pw-summary-table-wrap';wrap.innerHTML='<table class="data-table pw-summary-table"><thead><tr><th>Monitor / source</th><th>Minimum coverage</th><th>Finding severity</th><th>Affected quantity</th><th>Next action</th></tr></thead><tbody id="pwHealthSummaryBody"></tbody></table>';
  const details=document.createElement('details');details.id='pwDataHealthDetails';details.className='pw-evidence-details';details.innerHTML='<summary>Channel / week evidence</summary><p>Full native assessment records remain available for audit and export.</p>';
  details.appendChild(raw);section.append(empty,wrap,details);host.prepend(section);
  new MutationObserver(refreshHealthSummary).observe(body,{childList:true,subtree:true});refreshHealthSummary();
  return section;
}
function ensureSpillSurfaces(){
  const panel=qs('#tab-spills .panel');if(!panel||$('pwSpillThresholdSurface'))return;
  const threshold=ensureSection('pwSpillThresholdSurface','Thresholds and exclusions','Define assessment thresholds and auditable exclusion periods before calculating spills.');
  const result=ensureSection('pwSpillResultsSurface','Spill assessment evidence','Current observed/model counts, durations, coverage and physical intervals.');
  const thresholdHead=qs('.pw-surface-head',threshold),run=$('runSpillsBtn');if(run){run.textContent='Calculate spills';run.classList.add('primary');thresholdHead.appendChild(run);}
  const map=qs('#tab-spills .mapping-grid.compact'),exclude=$('exclusionRows')?.closest('.subpanel');if(map)threshold.appendChild(map);if(exclude)threshold.appendChild(exclude);
  const resultNodes=[];
  const two=qs('#tab-spills .two-col');if(two)resultNodes.push(two);
  const cmp=$('spillComparison');if(cmp){const h=cmp.previousElementSibling;if(h?.matches('h3'))resultNodes.push(h);resultNodes.push(cmp);}
  const event=$('eventBody')?.closest('.table-wrap');if(event){const h=event.previousElementSibling;if(h?.matches('h3'))resultNodes.push(h);resultNodes.push(event);}
  resultNodes.forEach(x=>result.appendChild(x));
  panel.append(threshold,result);
}
function makeActionGroup(className='pw-surface-actions'){const x=document.createElement('div');x.className=className;return x;}
function ensureReportSurfaces(){
  const panel=qs('#tab-workspace .panel');if(!panel||$('pwWorkspaceSurface'))return;
  const workspace=ensureSection('pwWorkspaceSurface','Workspace save / restore','Save local configuration and source fingerprints without embedding raw engineering files.');
  const builder=ensureSection('pwReportBuilderSurface','Report output','Check result readiness, select the report period where required, then export the engineering report.');
  const workspaceName=$('workspaceName')?.closest('label'),named=$('namedWorkspaceSelect')?.closest('.actions');if(workspaceName)workspace.appendChild(workspaceName);if(named)workspace.appendChild(named);
  const wsActions=makeActionGroup();for(const id of ['downloadWorkspaceBtn','loadWorkspaceBtn']){const b=$(id);if(b){b.classList.remove('primary');b.textContent=id==='downloadWorkspaceBtn'?'Export workspace JSON':'Load workspace JSON';wsActions.appendChild(b);}}workspace.appendChild(wsActions);
  const wsStatus=$('workspaceStatus'),privacy=qs('#tab-workspace .privacy-note');if(wsStatus)workspace.appendChild(wsStatus);if(privacy)workspace.appendChild(privacy);
  const year=$('reportYear')?.closest('label');if(year)builder.appendChild(year);const ready=$('reportPreflight');if(ready)builder.appendChild(ready);
  const reportActions=makeActionGroup();for(const id of ['downloadReportBtn','downloadFourPeriodBtn']){const b=$(id);if(b){b.classList.toggle('primary',id==='downloadReportBtn');b.textContent=id==='downloadReportBtn'?'Export assessment report':'Export four-period report';reportActions.appendChild(b);}}builder.appendChild(reportActions);
  const mirror=document.createElement('div');mirror.id='pwReportStatusMirror';mirror.className='report-status pw-status-mirror';mirror.textContent=wsStatus?.textContent||'Report export ready when required analyses are current.';builder.appendChild(mirror);
  if(wsStatus)new MutationObserver(()=>{mirror.textContent=wsStatus.textContent;}).observe(wsStatus,{childList:true,subtree:true,characterData:true});
  panel.append(workspace,builder);
}
function preparePageComposition(){
  ensureDataHealthSurface();ensureSpillSurfaces();ensureReportSurfaces();
  own($('surveyAssociationPanel'),['survey/configuration']);
  own(qs('#tab-data-health .tool-main-section'),['survey/data-health']);
  own(qs('.survey-professional'),['survey/rainfall-response','rainfall/gauges']);
  own($('completeSurveyPanel'),['survey/rainfall-response']);
  own($('surveyBalancePanel'),['survey/flow-continuity']);
  own(qs('#tab-compare .tool-main-section'),['verification/comparison']);
  own($('pwRatingPanel'),['verification/rating']);
  own($('pwDwfPanel'),['verification/dwf']);
  own($('tab-storage'),['verification/storage']);
  own($('pwSpillThresholdSurface'),['spills/thresholds']);
  own($('pwSpillResultsSurface'),['spills/results']);
  own($('pwWorkspaceSurface'),['report/workspace']);
  own($('pwReportBuilderSurface'),['report/builder']);
  for(const sel of ['#tab-data-health>.panel>.panel-head','#tab-data-health .tool-main-head','#tab-spills>.panel>.panel-head','#tab-workspace>.panel>.panel-head']){const el=qs(sel);if(el)el.classList.add('pw-legacy-framing');}
  for(const selector of ['#tab-spills .tool-main-section','#tab-workspace .tool-main-section']){const legacy=qs(selector);if(legacy)legacy.hidden=true;}
  const balanceBtn=$('runSurveyBalanceBtn');if(balanceBtn){balanceBtn.classList.add('primary');balanceBtn.textContent='Recalculate balance';}
  const ratingBtn=$('runRatingBtn');if(ratingBtn)ratingBtn.classList.add('primary');
  const dwfBtn=$('runDwfBtn');if(dwfBtn)dwfBtn.classList.add('primary');
}
function applyPageComposition(){
  preparePageComposition();
  const key=current.workspace+'/'+current.page;
  ownedSurfaces.forEach(node=>{node.hidden=!String(node.dataset.pwOwned||'').split(' ').includes(key);});
}
function buildShell(){
  if(qs('.pw-app'))return;
  document.body.classList.add('precision-workbench');
  const topbar=qs('.topbar'),main=qs('main.shell'),footer=qs('footer');
  const review=footer?.previousElementSibling?.matches('section.panel')?footer.previousElementSibling:null;
  const app=document.createElement('div');app.className='pw-app';
  const rail=document.createElement('aside');rail.className='pw-rail';rail.setAttribute('aria-label','Primary workspaces');
  rail.innerHTML='<div class="pw-brand"><div class="pw-brand-mark"><span class="pw-brand-icon">ICM</span><span class="pw-brand-title">ICM Graphing Tool</span></div><small>Browser-local hydraulic evidence and assessment.</small></div><nav class="pw-primary-nav"></nav><section class="pw-asset-browser"><label for="pwAssetSearch">Assets & scenarios</label><input class="pw-asset-search" id="pwAssetSearch" type="search" placeholder="Filter assets…"><div class="pw-assets" id="pwAssets"></div></section>';
  const pnav=qs('.pw-primary-nav',rail);
  Object.entries(ROUTES).forEach(([key,w])=>{
    const b=document.createElement('button');b.type='button';b.dataset.workspace=key;b.innerHTML=navIcon(w.icon)+'<span class="pw-nav-label">'+esc(w.label)+'</span>';b.setAttribute('aria-label',w.label);b.addEventListener('click',()=>navigate(key,Object.keys(w.pages)[0],true));pnav.appendChild(b);
  });
  const stage=document.createElement('div');stage.className='pw-stage';
  const context=document.createElement('section');context.className='pw-context';
  context.innerHTML='<div class="pw-context-head"><div><div class="pw-breadcrumb"><span id="pwBreadcrumbWorkspace"></span><span>›</span><strong id="pwBreadcrumbPage"></strong></div><h2 class="pw-page-title" id="pwPageTitle"></h2><p class="pw-page-description" id="pwPageDescription"></p></div><div class="pw-context-actions"><button class="pw-focus-toggle" id="pwFocusToggle" type="button" aria-pressed="false" hidden>Focus canvas</button><button class="pw-rail-toggle" id="pwRailToggle" type="button">Menu</button><button class="pw-inspector-toggle" id="pwInspectorToggle" type="button">Inspector</button></div></div><nav class="pw-secondary-nav" id="pwSecondaryNav" aria-label="Workspace pages"></nav><div class="pw-scopebar" id="pwScopebar" aria-label="Current analysis scope"></div>';
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
    const toggle=$('pwRailToggle');if(toggle){toggle.setAttribute('aria-pressed',railCollapsed?'true':'false');toggle.textContent=railCollapsed?'Expand navigation':'Collapse navigation';}
  };
  $('pwRailToggle')?.addEventListener('click',()=>{
    if(matchMedia('(max-width:620px)').matches){rail.classList.toggle('is-open');return;}
    railCollapsed=!railCollapsed;
    try{sessionStorage.setItem('icm-pw-rail-collapsed',railCollapsed?'on':'off');}catch{}
    applyRailState();resizeVisuals();
  });
  applyRailState();
  $('pwInspectorToggle')?.addEventListener('click',()=>inspector.classList.add('is-open'));
  $('pwInspectorClose')?.addEventListener('click',()=>inspector.classList.remove('is-open'));
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
  const oldSmall=select.nextElementSibling?.tagName==='SMALL'?select.nextElementSibling:null;
  if(oldSmall)oldSmall.hidden=true;
  const wrap=document.createElement('div');wrap.id='pwScenarioPicker';wrap.className='pw-scenario-picker';
  wrap.innerHTML='<button id="modelPickerTrigger" class="pw-model-picker-trigger" type="button" aria-haspopup="true" aria-expanded="false">No models</button><div id="modelPickerPopover" class="pw-model-picker-popover" hidden><input class="pw-model-search" type="search" placeholder="Search model series…" aria-label="Search model series"><div class="pw-model-picker-actions"><button type="button" data-action="all">Select all</button><button type="button" data-action="none">Deselect all</button></div><div class="pw-scenario-list" role="group" aria-label="Model scenarios"></div></div><div class="pw-scenario-count">No models selected.</div>';
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
function inspectorContext(page){
  const body=$('pwInspectorBody'),inspector=$('pwInspector'),toggle=$('pwInspectorToggle');if(!body)return;
  body.innerHTML='<div class="pw-context-card"><h4>Current context</h4><dl><dt>Workspace</dt><dd>'+esc(ROUTES[current.workspace].label)+'</dd><dt>Page</dt><dd>'+esc(page.label)+'</dd><dt>Processing</dt><dd>Local browser</dd></dl></div>';
  const root=page.root?.();
  if(current.workspace==='data'&&current.page==='time-series'){dock($('v2GraphToolbar'));dock($('sharedAnalysisPanel'));dock(qs('.appearance-panel',root));}
  if(current.workspace==='verification'&&current.page==='comparison'){dock($('sharedAnalysisPanel'));dock(qs('.mapping-grid',root));dock(qs('.actions',root));}
  if(current.workspace==='survey'&&current.page==='rainfall-response'){dock($('sharedAnalysisPanel'));dock(qs('.survey-method',root));}
  if(current.workspace==='survey'&&current.page==='flow-continuity')dock($('sharedAnalysisPanel'));
  if(current.workspace==='rainfall'&&current.page==='events')dock($('sharedAnalysisPanel'));
  if(current.workspace==='verification'&&['rating','dwf','storage'].includes(current.page))dock($('sharedAnalysisPanel'));
  const useful=docked.length>0;
  document.body.classList.toggle('pw-has-inspector',useful);
  if(inspector){inspector.hidden=!useful;if(!useful)inspector.classList.remove('is-open');}
  if(toggle)toggle.hidden=!useful;
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
    'data-health':['survey','data-health'],
    'rain-events':['rainfall','events'],
    compare:['verification','comparison'],
    storage:['verification','storage'],
    spills:['spills','results'],
    workspace:['report','builder']
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
  const [w,p]=raw.split('/');return ROUTES[w]?.pages[p]?{workspace:w,page:p}:null;
}
function navigate(workspace,page,push=false){
  if(!ROUTES[workspace]?.pages[page])return;
  restoreDocked();
  current={workspace,page};
  const spec=ROUTES[workspace],p=spec.pages[page];
  clearRouteClasses();document.body.classList.add(routeKey());
  qsa('.pw-route-visible').forEach(x=>x.classList.remove('pw-route-visible'));
  legacyTab(p.tab);
  // Route ownership is semantic, not only visual. Explicitly hide every
  // legacy tab panel before exposing the selected Precision route so an
  // old active-tab class can never leak another task's primary action.
  qsa('main.shell>.tab-panel').forEach(x=>{x.hidden=true;});
  const root=p.root?.();
  if(root){
    root.classList.add('pw-route-visible');
    if(root.classList.contains('tab-panel'))root.hidden=false;
    let ancestor=root.parentElement;
    while(ancestor&&ancestor!==qs('main.shell')){
      if(ancestor.classList.contains('tab-panel')||ancestor.classList.contains('embedded-workflow')){
        ancestor.classList.add('pw-route-visible');
        if(ancestor.classList.contains('tab-panel'))ancestor.hidden=false;
      }
      ancestor=ancestor.parentElement;
    }
  }
  applyPageComposition();
  qsa('.pw-primary-nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.workspace===workspace?'page':'false'));
  $('pwBreadcrumbWorkspace').textContent=spec.label;$('pwBreadcrumbPage').textContent=p.label;$('pwPageTitle').textContent=p.title;$('pwPageDescription').textContent=p.description;
  const sn=$('pwSecondaryNav');sn.innerHTML='';
  Object.entries(spec.pages).forEach(([key,entry])=>{const b=document.createElement('button');b.type='button';b.textContent=entry.label;b.setAttribute('aria-current',key===page?'page':'false');b.addEventListener('click',()=>navigate(workspace,key,true));sn.appendChild(b);});
  inspectorContext(p);refreshScope();renderAssets();
  qs('.pw-rail')?.classList.remove('is-open');qs('.pw-inspector')?.classList.remove('is-open');
  applyFocusCanvas(false);
  if(push){const h='#/'+workspace+'/'+page;if(location.hash!==h)history.pushState(null,'',h);}
  document.title=p.title+' · ICM Graphing Tool';
  resizeVisuals();
}
function isFocusRoute(){
  return FOCUS_ROUTES.has(current.workspace+'/'+current.page);
}
function resizeVisuals(){
  requestAnimationFrame(()=>{
    setTimeout(()=>{
      qsa('.js-plotly-plot').forEach(chart=>{
        const rect=chart.getBoundingClientRect();
        if(!chart.isConnected||chart.offsetParent===null||rect.width<2||rect.height<2)return;
        try{
          const pending=window.Plotly?.Plots?.resize?.(chart);
          if(pending&&typeof pending.catch==='function')pending.catch(()=>{});
        }catch{}
      });
      window.dispatchEvent(new Event('resize'));
    },90);
  });
}
function applyFocusCanvas(userInitiated=false){
  const eligible=isFocusRoute(),desktop=matchMedia('(min-width:901px)').matches;
  // Graph-heavy routes default to focus mode unless the user explicitly opts out.
  // This makes the analytical canvas primary while retaining every setting in the
  // overlay inspector and a one-click path back to the standard layout.
  const active=eligible&&desktop&&focusPreference!==false;
  document.body.classList.toggle('pw-focus-canvas',active);
  const button=$('pwFocusToggle');
  if(button){
    button.hidden=!eligible||!desktop;
    button.setAttribute('aria-pressed',active?'true':'false');
    button.textContent=active?'Standard layout':'Focus canvas';
    button.title=active?'Restore the full navigation and docked inspector':'Maximise chart width; keep controls in an overlay inspector';
  }
  const railToggle=$('pwRailToggle');
  if(railToggle)railToggle.hidden=active;
  const inspector=$('pwInspector');
  if(!active&&userInitiated)inspector?.classList.remove('is-open');
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
  const start=$('analysisStart')?.value||'Selected data';
  const end=$('analysisEnd')?.value||'full support';
  const items=[
    ['Observed',observed],
    ['Models',models?String(models):'None'],
    ['Rain gauge',rain],
    ['Period',start+' → '+end],
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
  window.addEventListener('icm:source-pool-changed',()=>{renderAssets();setTimeout(()=>{createScenarioChecklist();refreshScope();},0);});
  window.addEventListener('hashchange',()=>{const r=parseHash();if(r)navigate(r.workspace,r.page,false);});
  const focusMedia=matchMedia('(min-width:901px)');
  focusMedia.addEventListener?.('change',()=>applyFocusCanvas(false));
}
function mount(){
  identifySubpanels();buildShell();preparePageComposition();createScenarioChecklist();wireContextUpdates();wireLegacyNavigation();
  const initial=parseHash()||{workspace:'data',page:'sources'};navigate(initial.workspace,initial.page,false);
  window.__ICM_PRECISION_WORKBENCH__={version:5,navigate,route:()=>({...current}),routes:ROUTES,focus:()=>document.body.classList.contains('pw-focus-canvas'),setFocus:value=>{focusPreference=Boolean(value);applyFocusCanvas(true);},railCollapsed:()=>railCollapsed};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
