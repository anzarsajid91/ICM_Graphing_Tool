(()=>{'use strict';
const $=id=>document.getElementById(id);
const qs=(sel,root=document)=>root.querySelector(sel);
const qsa=(sel,root=document)=>[...root.querySelectorAll(sel)];
const ROUTES={
  data:{
    label:'Data',
    glyph:'▦',
    pages:{
      sources:{label:'Sources',title:'Survey data sources',description:'Import, parse and audit survey, model and rainfall files in one local source pool.',root:()=>qs('.source-panel')},
      'series-mapping':{label:'Series mapping',title:'Series mapping',description:'Map observed, model, rainfall and optional hydraulic channels from the shared catalogue.',root:()=>qs('.mapping-panel')},
      'time-series':{label:'Time series',title:'Flow and rainfall review',description:'Review native hydraulic traces with rainfall, exclusions, thresholds and auditable statistics.',tab:'graph',root:()=>$('tab-graph')}
    }
  },
  survey:{
    label:'Survey',
    glyph:'◎',
    pages:{
      configuration:{label:'Configuration',title:'Survey association configuration',description:'Review authoritative fm_rg_assoc.xlsx relationships, conflicts and topology evidence.',tab:'data-health',root:()=>$('tab-data-health')},
      'data-health':{label:'Data Health',title:'Survey health and data coverage',description:'Inspect coverage, gaps, invalid values, flatlines and engineering suitability evidence.',tab:'data-health',root:()=>$('tab-data-health')},
      'rainfall-response':{label:'Rainfall response',title:'Rainfall response evidence',description:'Review qualified rainfall and hydraulic response evidence with the existing FSAT-derived method.',tab:'data-health',root:()=>$('tab-data-health')},
      'flow-continuity':{label:'Flow continuity',title:'Flow continuity and volume balance',description:'Assess downstream versus common-support upstream volume evidence with explicit limitations.',tab:'data-health',root:()=>$('tab-data-health')}
    }
  },
  rainfall:{
    label:'Rainfall',
    glyph:'≋',
    pages:{
      gauges:{label:'Gauges & accumulation',title:'Network rainfall gauges and accumulation',description:'Review gauge support, accumulation and network rainfall evidence without treating missing rainfall as dry.',tab:'data-health',root:()=>$('tab-data-health')},
      events:{label:'Events & hydraulic response',title:'Rainfall events and hydraulic response',description:'Inspect event qualification, separation, coverage and linked hydraulic response.',tab:'rain-events',root:()=>$('tab-rain-events')}
    }
  },
  verification:{
    label:'Verification',
    glyph:'△',
    pages:{
      comparison:{label:'Comparison diagnostics',title:'Verification diagnostics',description:'Compare observed and modelled data using bounded interpolation and the canonical calibration metrics.',tab:'compare',root:()=>$('tab-compare')},
      rating:{label:'Depth agreement / rating',title:'Depth and flow–depth diagnostics',description:'Inspect depth agreement or Q/H rating evidence with sample support and validity limitations.',tab:'compare',root:()=>$('tab-compare')},
      dwf:{label:'DWF',title:'Dry-weather flow baseline',description:'Review dry-weather qualification and baseline evidence without inferring dry periods from missing rainfall.',tab:'compare',root:()=>$('tab-compare')},
      storage:{label:'Storage screening',title:'Idealised storage screening',description:'Review support-aware storage screening and modelled spill-volume evidence.',tab:'storage',root:()=>$('tab-storage')}
    }
  },
  spills:{
    label:'Spills',
    glyph:'◫',
    pages:{
      thresholds:{label:'Thresholds & exclusions',title:'Spill thresholds and exclusions',description:'Configure thresholds and auditable global/channel-specific exclusion periods.',tab:'spills',root:()=>$('tab-spills')},
      results:{label:'Results',title:'Spill assessment results',description:'Review physical intervals, assessment support, canonical counts and observed/model differences.',tab:'spills',root:()=>$('tab-spills')}
    }
  },
  report:{
    label:'Report',
    glyph:'▤',
    pages:{
      workspace:{label:'Workspace save/restore',title:'Workspace save and restore',description:'Persist configuration and source fingerprints without embedding raw engineering files.',tab:'workspace',root:()=>$('tab-workspace')},
      builder:{label:'Report builder',title:'Engineering report builder',description:'Review section readiness and export coherent engineering-report snapshots.',tab:'workspace',root:()=>$('tab-workspace')},
      provenance:{label:'Provenance',title:'Provenance and calculation audit',description:'Inspect source lineage, project registry, method context and current calculation evidence.',tab:'workspace',root:()=>$('tab-workspace')}
    }
  }
};
let current={workspace:'data',page:'sources'};
let docked=[];
let syncingLegacy=false;
let focusPreference=null;
const FOCUS_ROUTES=new Set(['data/time-series','verification/comparison','rainfall/events']);
try{
  const saved=sessionStorage.getItem('icm-pw-focus-canvas');
  if(saved==='on'||saved==='off')focusPreference=saved==='on';
}catch{}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function identifySubpanels(){
  qsa('#tab-compare .subpanel').forEach(panel=>{
    const t=(qs('h3',panel)?.textContent||'').toLowerCase();
    if(t.includes('depth agreement')||t.includes('rating diagnostic')) panel.id=panel.id||'pwRatingPanel';
    if(t.includes('dry-weather')||t.includes('dry weather')) panel.id=panel.id||'pwDwfPanel';
  });
  const registry=$('domainRegistryPanel');
  if(registry) registry.classList.add('pw-domain-provenance');
}
function buildShell(){
  if(qs('.pw-app'))return;
  document.body.classList.add('precision-workbench');
  const topbar=qs('.topbar'),main=qs('main.shell'),footer=qs('footer');
  const review=footer?.previousElementSibling?.matches('section.panel')?footer.previousElementSibling:null;
  const app=document.createElement('div');app.className='pw-app';
  const rail=document.createElement('aside');rail.className='pw-rail';rail.setAttribute('aria-label','Primary workspaces');
  rail.innerHTML='<div class="pw-brand"><div class="pw-brand-mark"><span class="pw-brand-icon">ICM</span><span>Precision Workbench</span></div><small>Browser-local hydraulic evidence and verification.</small></div><nav class="pw-primary-nav"></nav><section class="pw-asset-browser"><label for="pwAssetSearch">Assets & scenarios</label><input class="pw-asset-search" id="pwAssetSearch" type="search" placeholder="Filter assets…"><div class="pw-assets" id="pwAssets"></div></section>';
  const pnav=qs('.pw-primary-nav',rail);
  Object.entries(ROUTES).forEach(([key,w])=>{
    const b=document.createElement('button');b.type='button';b.dataset.workspace=key;b.innerHTML='<span class="pw-nav-glyph">'+esc(w.glyph)+'</span><span>'+esc(w.label)+'</span>';b.addEventListener('click',()=>navigate(key,Object.keys(w.pages)[0],true));pnav.appendChild(b);
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
  $('pwRailToggle')?.addEventListener('click',()=>rail.classList.toggle('is-open'));
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
  const wrap=document.createElement('div');wrap.id='pwScenarioPicker';wrap.className='pw-scenario-picker';wrap.innerHTML='<div class="pw-scenario-list" role="group" aria-label="Model scenarios"></div><div class="pw-scenario-count">No scenarios selected.</div>';
  select.insertAdjacentElement('afterend',wrap);
  const render=()=>{
    const list=qs('.pw-scenario-list',wrap),selected=new Set([...select.selectedOptions].map(o=>o.value));
    list.innerHTML=[...select.options].filter(o=>o.value).map(o=>'<label class="pw-scenario-option"><input type="checkbox" value="'+esc(o.value)+'" '+(selected.has(o.value)?'checked':'')+'><span>'+esc(o.textContent)+'</span></label>').join('')||'<span class="pw-shell-note">Import model series to choose scenarios.</span>';
    qsa('input[type="checkbox"]',list).forEach(cb=>cb.addEventListener('change',()=>{
      [...select.options].forEach(o=>{if(o.value===cb.value)o.selected=cb.checked;});
      select.dispatchEvent(new Event('change',{bubbles:true}));
      updateCount();
      refreshScope();
    }));
    updateCount();
  };
  const updateCount=()=>{const n=select.selectedOptions.length;qs('.pw-scenario-count',wrap).textContent=n? n+' scenario'+(n===1?'':'s')+' selected.':'No scenarios selected.';};
  new MutationObserver(render).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['selected']});
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
  const body=$('pwInspectorBody');if(!body)return;
  body.innerHTML='<div class="pw-context-card"><h4>Current context</h4><dl><dt>Workspace</dt><dd>'+esc(ROUTES[current.workspace].label)+'</dd><dt>Page</dt><dd>'+esc(page.label)+'</dd><dt>Processing</dt><dd>Local browser</dd><dt>Result state</dt><dd><span class="pw-status current">Live context</span></dd></dl></div>';
  const root=page.root?.();
  if(current.workspace==='data'&&current.page==='time-series'){
    dock($('v2GraphToolbar'));
    dock($('sharedAnalysisPanel'));
    dock(qs('.appearance-panel',root));
  }
  if(current.workspace==='verification'&&current.page==='comparison'){
    dock($('sharedAnalysisPanel'));
    dock(qs(':scope>.panel>.mapping-grid',root));
    dock(qs(':scope>.panel>.actions',root));
  }
  if(current.workspace==='survey'&&current.page==='rainfall-response'){dock($('sharedAnalysisPanel'));dock(qs('.survey-method',root));}
  if(current.workspace==='survey'&&current.page==='flow-continuity')dock($('sharedAnalysisPanel'));
  if(current.workspace==='rainfall'&&current.page==='events')dock($('sharedAnalysisPanel'));
  if(current.workspace==='verification'&&['rating','dwf','storage'].includes(current.page))dock($('sharedAnalysisPanel'));
  if(current.workspace==='spills'&&current.page==='thresholds')dock(qs(':scope>.panel>.mapping-grid.compact',root));
  const note=document.createElement('div');note.className='pw-shell-note';note.textContent='Engineering calculations continue to use the existing canonical browser/Python result paths; this inspector only reorganises presentation controls.';body.appendChild(note);
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
  const root=p.root?.();
  if(root){
    root.classList.add('pw-route-visible');
    let ancestor=root.parentElement;
    while(ancestor&&ancestor!==qs('main.shell')){
      if(ancestor.classList.contains('tab-panel')||ancestor.classList.contains('embedded-workflow'))ancestor.classList.add('pw-route-visible');
      ancestor=ancestor.parentElement;
    }
  }
  if(workspace==='report'&&page==='provenance'){
    const registry=$('domainRegistryPanel');if(registry){registry.open=true;registry.classList.add('pw-route-visible');}
  }
  qsa('.pw-primary-nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.workspace===workspace?'page':'false'));
  $('pwBreadcrumbWorkspace').textContent=spec.label;$('pwBreadcrumbPage').textContent=p.label;$('pwPageTitle').textContent=p.title;$('pwPageDescription').textContent=p.description;
  const sn=$('pwSecondaryNav');sn.innerHTML='';
  Object.entries(spec.pages).forEach(([key,entry])=>{const b=document.createElement('button');b.type='button';b.textContent=entry.label;b.setAttribute('aria-current',key===page?'page':'false');b.addEventListener('click',()=>navigate(workspace,key,true));sn.appendChild(b);});
  inspectorContext(p);refreshScope();renderAssets();
  qs('.pw-rail')?.classList.remove('is-open');qs('.pw-inspector')?.classList.remove('is-open');
  applyFocusCanvas(false);
  if(push){const h='#/'+workspace+'/'+page;if(location.hash!==h)history.pushState(null,'',h);}
  document.title=p.title+' · ICM Precision Workbench';
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
  const eligible=isFocusRoute();
  const active=eligible&&(focusPreference===null?true:focusPreference);
  document.body.classList.toggle('pw-focus-canvas',active);
  const button=$('pwFocusToggle');
  if(button){
    button.hidden=!eligible;
    button.setAttribute('aria-pressed',active?'true':'false');
    button.textContent=active?'Standard layout':'Focus canvas';
    button.title=active?'Restore the full navigation and docked inspector':'Maximise chart width; keep controls in an overlay inspector';
  }
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
  target.innerHTML=rows.length?rows.slice(0,40).map(x=>'<button type="button" class="pw-asset-item"><strong>'+esc(x.name)+'</strong><span>'+esc(x.meta)+'</span></button>').join(''):'<div class="pw-empty-assets">No matching assets.</div>';
}
function wireContextUpdates(){
  ['observedSelect','rainSelect','analysisStart','analysisEnd','workspaceName'].forEach(id=>$(id)?.addEventListener('change',refreshScope));
  window.addEventListener('icm:source-pool-changed',()=>{renderAssets();setTimeout(()=>{createScenarioChecklist();refreshScope();},0);});
  window.addEventListener('hashchange',()=>{const r=parseHash();if(r)navigate(r.workspace,r.page,false);});
}
function mount(){
  identifySubpanels();buildShell();createScenarioChecklist();wireContextUpdates();wireLegacyNavigation();
  const initial=parseHash()||{workspace:'data',page:'sources'};navigate(initial.workspace,initial.page,false);
  window.__ICM_PRECISION_WORKBENCH__={version:2,navigate,route:()=>({...current}),routes:ROUTES,focus:()=>document.body.classList.contains('pw-focus-canvas'),setFocus:value=>{focusPreference=Boolean(value);applyFocusCanvas(true);}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();