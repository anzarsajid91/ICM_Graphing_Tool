(() => {
  'use strict';

  const FULL_DISPLAY_POINTS = 15000;
  const ZOOM_DISPLAY_POINTS = 120000;
  function displayPointBudget(range){
    if(!range||range.length!==2)return FULL_DISPLAY_POINTS;
    const start=new Date(range[0]).getTime(),end=new Date(range[1]).getTime();
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 60000;
    const days=(end-start)/86400000;
    if(days<=14)return ZOOM_DISPLAY_POINTS;
    if(days<=45)return 100000;
    if(days<=120)return 80000;
    return 60000;
  }
  const ui = {
    poolExpanded: false,
    graphRange: null,
    graphRefreshing: false,
    graphTimer: null,
    graphGeneration: 0,
    suppressRelayout: false,
    channelMode: 'combined',
    thresholdContexts: {observed:null, model:null},
    exclusionCapture: false,
    lastInspectedPoint: null,
  };
  window.__ICM_WORKBENCH__.uiV2 = ui;

  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const traceUid=(...parts)=>parts.map(part=>String(part??'').replace(/[^a-zA-Z0-9_-]+/g,'_')).join('__');

  const modebarIcons={
    period:{width:512,height:512,path:'M64 96h384v320H64zM128 64v96M384 64v96M128 256h256'},
    fitY:{width:512,height:512,path:'M256 48l-72 72h48v272h-48l72 72 72-72h-48V120h48z'},
    exclusion:{width:512,height:512,path:'M72 96h368v320H72zM112 136l288 240M400 136L112 376'},
  };
  function setGraphInteractionStatus(text,kind=''){
    const el=$('v2GraphInteractionStatus');
    if(!el)return;
    el.className=('v2-graph-interaction-status '+kind).trim();
    el.textContent=text;
  }
  function visibleGraphRange(){
    const range=$('timeChart')?.layout?.xaxis?.range;
    return Array.isArray(range)&&range.length===2?range:null;
  }
  function useVisiblePeriodFromGraph(){
    const range=visibleGraphRange();
    if(!range){setGraphInteractionStatus('No bounded visible period is available yet.','warn');return false;}
    useGraphZoom();
    setGraphInteractionStatus('Visible graph period copied to the analysis start/end controls.','done');
    return true;
  }
  function fitVisibleY(){
    const chart=$('timeChart'),range=visibleGraphRange();
    if(!chart?.data?.length){setGraphInteractionStatus('Load a graph before fitting the Y axes.','warn');return false;}
    const start=range?new Date(range[0]).getTime():-Infinity,end=range?new Date(range[1]).getTime():Infinity;
    const bounds=new Map();
    for(const trace of chart.data){
      if(!trace||trace.type==='table'||trace.visible==='legendonly'||!Array.isArray(trace.x)||!Array.isArray(trace.y))continue;
      const axisRef=trace.yaxis||'y',axisKey=axisRef==='y'?'yaxis':'yaxis'+axisRef.slice(1);
      const axisTitle=String(chart.layout?.[axisKey]?.title?.text||'');
      if(/rainfall/i.test(axisTitle))continue;
      for(let i=0;i<trace.x.length;i+=1){
        const time=new Date(trace.x[i]).getTime(),value=Number(trace.y[i]);
        if(!Number.isFinite(time)||!Number.isFinite(value)||time<start||time>end)continue;
        const current=bounds.get(axisKey)||{min:Infinity,max:-Infinity};
        current.min=Math.min(current.min,value);current.max=Math.max(current.max,value);bounds.set(axisKey,current);
      }
    }
    const update={};
    for(const [axisKey,b] of bounds.entries()){
      if(!Number.isFinite(b.min)||!Number.isFinite(b.max))continue;
      const span=Math.max(Math.abs(b.max-b.min),Math.abs(b.max||b.min||1)*0.02,1e-9),pad=span*0.06;
      update[axisKey+'.range']=[b.min-pad,b.max+pad];
      update[axisKey+'.autorange']=false;
    }
    if(!Object.keys(update).length){setGraphInteractionStatus('No visible hydraulic values were available to fit.','warn');return false;}
    void Plotly.relayout(chart,update);
    setGraphInteractionStatus('Hydraulic Y axes fitted to the currently visible time window.','done');
    return true;
  }
  function setExclusionCapture(enabled){
    ui.exclusionCapture=Boolean(enabled);
    const chart=$('timeChart');
    if(chart?.data?.length)void Plotly.relayout(chart,{dragmode:ui.exclusionCapture?'select':'zoom'});
    setGraphInteractionStatus(
      ui.exclusionCapture
        ?'Exclusion capture active — drag horizontally across the graph. Each selection adds a separate exclusion; repeat as needed, then edit reason/scope under Spills.'
        :'Exclusion capture off — standard zoom/pan behaviour restored.',
      ui.exclusionCapture?'active':''
    );
    return ui.exclusionCapture;
  }
  function captureGraphExclusion(event){
    if(!ui.exclusionCapture)return false;
    const range=event?.range?.x;
    if(!Array.isArray(range)||range.length!==2)return false;
    const a=modelClock(range[0]),b=modelClock(range[1]),start=a<=b?a:b,end=a<=b?b:a;
    if(!start||!end||end<=start)return false;
    addExclusionRow({start,end,reason:'Graph-selected exclusion',scope:'both',enabled:true});
    diagnostic.lastGraphExclusion={start,end,count:state.exclusions.length};
    setGraphInteractionStatus('Added exclusion '+start+' → '+end+'. Capture remains active for additional periods.','done');
    scheduleGraphRedraw(40);
    return true;
  }
  function inspectGraphPoint(event){
    const point=(event?.points||[]).find(p=>p&&p.x!==undefined&&p.y!==undefined&&Number.isFinite(Number(p.y)));
    if(!point)return false;
    const trace=point.fullData||point.data||{},series=String(trace.name||'Series'),timestamp=modelClock(point.x)||String(point.x),value=String(point.y);
    const text=timestamp+' | '+series+' | '+value;
    ui.lastInspectedPoint={timestamp,series,value,text};
    const target=$('v2PointInspectorValue'),copy=$('v2PointInspectorCopy');
    if(target)target.textContent=text;
    if(copy)copy.disabled=false;
    return true;
  }
  async function copyInspectedPoint(){
    const text=ui.lastInspectedPoint?.text;
    if(!text)return false;
    try{
      await navigator.clipboard.writeText(text);
    }catch{
      const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.left='-10000px';document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();
    }
    setGraphInteractionStatus('Selected graph point copied to the clipboard.','done');
    return true;
  }
  function timeGraphModebarButtons(){
    return [
      {name:'Use visible period for analysis',icon:modebarIcons.period,click:()=>useVisiblePeriodFromGraph()},
      {name:'Fit Y axes to visible period',icon:modebarIcons.fitY,click:()=>fitVisibleY()},
      {name:'Add multiple exclusion periods',icon:modebarIcons.exclusion,click:()=>setExclusionCapture(!ui.exclusionCapture)},
    ];
  }
  function wireGraphInteractions(){
    const chart=$('timeChart');
    if(!chart||typeof chart.on!=='function')return;
    for(const [property,eventName] of [['__v2SelectedHandler','plotly_selected'],['__v2ClickHandler','plotly_click']]){
      const previous=chart[property];
      if(previous&&typeof chart.removeListener==='function'){try{chart.removeListener(eventName,previous);}catch{}}
    }
    chart.__v2SelectedHandler=captureGraphExclusion;
    chart.__v2ClickHandler=inspectGraphPoint;
    chart.on('plotly_selected',captureGraphExclusion);
    chart.on('plotly_click',inspectGraphPoint);
  }

  function setOperationStatus(text, kind='') {
    const el = document.getElementById('spillRunStatus');
    if (!el) return;
    el.className = `v2-operation-status ${kind}`.trim();
    el.textContent = text;
  }

  async function withBusy(button, target, runningText, fn) {
    const old = button.textContent;
    button.disabled = true;
    button.classList.add('is-busy');
    button.textContent = runningText;
    // Clear any stale completed spill status before yielding a paint. This makes
    // the visible state truthful during the async hand-off and prevents a user
    // (or acceptance runner) from mistaking the previous result for completion
    // of the newly requested calculation.
    if (target === 'spillRunStatus') setOperationStatus(runningText, 'running');
    operationBegin(target);
    operationUpdate(operationLabel(target), null, runningText);
    await nextPaint();
    try {
      return await fn();
    } catch (err) {
      const message = String(err?.message || err);
      if (target === 'spillRunStatus') setOperationStatus(`Calculation failed: ${message}`, 'error');
      else showError(target, message);
      return null;
    } finally {
      operationEnd();
      button.disabled = false;
      button.classList.remove('is-busy');
      button.textContent = old;
    }
  }

  function hijackButton(id, target, runningText, fn) {
    const button = $(id);
    if (!button) return;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      void withBusy(button, target, runningText, fn);
    }, {capture: true});
  }

  function installSourcePoolControl() {
    const panel = document.querySelector('.source-panel');
    const actions = panel?.querySelector('.panel-head .actions');
    if (!panel || !actions || document.getElementById('sourcePoolToggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'sourcePoolToggle';
    button.className = 'btn quiet pool-toggle';
    actions.appendChild(button);
    button.addEventListener('click', () => {
      ui.poolExpanded = !ui.poolExpanded;
      updateSourcePoolControl();
    });
    const body = $('poolBody');
    new MutationObserver(updateSourcePoolControl).observe(body, {childList:true});
    updateSourcePoolControl();
  }

  function updateSourcePoolControl() {
    const panel = document.querySelector('.source-panel');
    const button = document.getElementById('sourcePoolToggle');
    if (!panel || !button) return;
    const count = $('poolBody')?.children.length || 0;
    if (count <= 3) {
      panel.classList.remove('pool-collapsed');
      button.hidden = true;
      return;
    }
    button.hidden = false;
    panel.classList.toggle('pool-collapsed', !ui.poolExpanded);
    button.textContent = ui.poolExpanded ? 'Show first 3' : `Show all ${count}`;
  }

  function installGraphControls() {
    const panel = document.querySelector('#tab-graph .panel');
    const details = panel?.querySelector('details.subpanel');
    if (!panel || !details || document.getElementById('v2GraphToolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'v2GraphToolbar';
    toolbar.className = 'v2-graph-toolbar';
    toolbar.innerHTML = `
      <div class="v2-threshold-control" data-threshold-role="observed">
        <label>Observed / EDM depth / level threshold
          <input id="graphObsThreshold" type="number" step="any" placeholder="Not shown" />
        </label>
        <small id="graphObsThresholdContext" class="v2-threshold-context"></small>
        <label class="v2-show-toggle"><input id="showGraphObsThreshold" type="checkbox" checked /> Show line</label>
      </div>
      <div class="v2-threshold-control" data-threshold-role="model">
        <label>Model depth / level threshold
          <input id="graphModelThreshold" type="number" step="any" placeholder="Not shown" />
        </label>
        <small id="graphModelThresholdContext" class="v2-threshold-context"></small>
        <label class="v2-show-toggle"><input id="showGraphModelThreshold" type="checkbox" checked /> Show line</label>
      </div>
      <div class="v2-density" id="graphDensity"><strong>Adaptive display</strong>Full view is reduced for speed; zoom progressively refines toward every source timestep. Thresholds are drawn on the Depth / Level panel only.</div>`;
    panel.insertBefore(toolbar, details);
    const chart = document.getElementById('timeChart');
    if (chart && !document.getElementById('v2ChannelStrip')) {
      const strip=document.createElement('div');
      strip.id='v2ChannelStrip';
      strip.className='v2-channel-strip';
      strip.hidden=true;
      strip.innerHTML='<span class="v2-channel-label">Hydraulic view</span><div class="v2-channel-nav fastpath-channel-nav" id="v2ChannelNav" hidden><button type="button" data-channel="flow">Flow</button><button type="button" data-channel="depth">Depth</button><button type="button" data-channel="level">Level</button><button type="button" data-channel="velocity">Velocity</button><button type="button" data-channel="combined" class="active">Combined</button></div>';
      chart.insertAdjacentElement('beforebegin',strip);
    }
    if (chart && !document.getElementById('graphStatistics')) {
      const stats = document.createElement('section');
      stats.id = 'graphStatistics';
      stats.className = 'v2-graph-statistics';
      stats.setAttribute('aria-live','polite');
      stats.innerHTML = '<div class="v2-empty">Map a series to calculate native-resolution graph statistics.</div>';
      chart.insertAdjacentElement('afterend', stats);
    }
    if(chart&&!document.getElementById('v2GraphInteractionStatus')){
      const status=document.createElement('div');
      status.id='v2GraphInteractionStatus';
      status.className='v2-graph-interaction-status';
      status.textContent='Mouse wheel scrolls the page. Use Plotly zoom/pan deliberately; graph actions are available from the modebar.';
      chart.insertAdjacentElement('beforebegin',status);
    }
    if(chart&&!document.getElementById('v2PointInspector')){
      const inspector=document.createElement('div');
      inspector.id='v2PointInspector';
      inspector.className='v2-point-inspector';
      inspector.innerHTML='<span><strong>Point inspector</strong><span id="v2PointInspectorValue">Click a plotted trace to inspect an exact timestamp/value.</span></span><button type="button" class="btn quiet" id="v2PointInspectorCopy" disabled>Copy point</button>';
      const stats=document.getElementById('graphStatistics');
      (stats||chart).insertAdjacentElement('afterend',inspector);
      $('v2PointInspectorCopy')?.addEventListener('click',()=>void copyInspectedPoint());
    }

    const syncFromSpill = () => {
      $('graphObsThreshold').value = $('obsThreshold').value;
      $('graphModelThreshold').value = $('modelThreshold').value;
    };
    syncFromSpill();
    updateGraphThresholdControls();
    updateChannelControls();
    document.querySelectorAll('#v2ChannelNav [data-channel]').forEach(button=>button.addEventListener('click',()=>{
      setChannelMode(button.dataset.channel,true);
    }));

    for (const [graphId, spillId] of [['graphObsThreshold','obsThreshold'],['graphModelThreshold','modelThreshold']]) {
      $(graphId).addEventListener('input', () => {
        $(spillId).value = $(graphId).value;
        scheduleGraphRedraw(80);
      });
      $(spillId).addEventListener('input', () => {
        $(graphId).value = $(spillId).value;
        scheduleGraphRedraw(80);
      });
    }
    for (const id of ['showGraphObsThreshold','showGraphModelThreshold']) {
      $(id).addEventListener('change', () => scheduleGraphRedraw(50));
    }
  }

  function installSpillStatus() {
    const thresholdGrid = document.querySelector('#tab-spills .mapping-grid.compact');
    if (!thresholdGrid || document.getElementById('spillRunStatus')) return;
    const status = document.createElement('div');
    status.id = 'spillRunStatus';
    status.className = 'v2-operation-status';
    status.textContent = 'Set one or both thresholds, then calculate. A comparison model is optional.';
    thresholdGrid.insertAdjacentElement('afterend', status);
    const label=document.createElement('label');label.textContent='Active model for spill assessment';const select=document.createElement('select');select.id='spillModelSelect';label.appendChild(select);thresholdGrid.appendChild(label);
    const comparisonHeading = $('spillComparison')?.previousElementSibling;
    if (comparisonHeading) comparisonHeading.textContent = 'Observed vs modelled yearly comparison';
  }

  function configureExistingCopy() {
    const modelLabel = $('modelSelect')?.closest('label');
    const hint = modelLabel?.querySelector('small');
    if (hint) hint.textContent = 'Optional — select one or more scenarios only when comparison is required.';
    if ($('mappingStatus')) $('mappingStatus').textContent = 'Select an observed series. Model comparison and rainfall are optional.';
  }

  function mappedQuantity(key){
    const source=mappingObject(key);
    return source?String(seriesQuantity(source.item,source.col)||'').toLowerCase():'';
  }
  function isThresholdQuantity(value){
    return ['depth','level'].includes(String(value||'').toLowerCase());
  }
  function thresholdSelectionForKey(key,{fdvFallback=false}={}){
    const selected=mappingObject(key);
    if(!selected)return null;
    if(isThresholdQuantity(seriesQuantity(selected.item,selected.col)))return selected;
    if(fdvFallback&&String(selected.item?.parsed?.format||'')==='fdv_ascii'){
      const hydraulic=hydraulicSeriesForItem(selected.item).find(x=>isThresholdQuantity(x.quantity));
      return hydraulic?mappingObject(hydraulic.key):null;
    }
    return null;
  }
  function observedThresholdSelection(key=state.mapping.observed){
    return thresholdSelectionForKey(key,{fdvFallback:true});
  }
  function modelThresholdSelection(keys=state.mapping.models){
    for(const key of keys||[]){
      const selected=thresholdSelectionForKey(key);
      if(selected)return selected;
    }
    return null;
  }
  function unresolvedSelectionForKey(key){
    const selected=mappingObject(key);
    return selected&&!String(seriesQuantity(selected.item,selected.col)||'').trim()?selected:null;
  }
  function observedUnresolvedSelection(key=state.mapping.observed){
    return unresolvedSelectionForKey(key);
  }
  function modelUnresolvedSelection(keys=state.mapping.models){
    for(const key of keys||[]){
      const selected=unresolvedSelectionForKey(key);
      if(selected)return selected;
    }
    return null;
  }
  function thresholdContext(selection){
    if(!selection)return null;
    const quantity=String(seriesQuantity(selection.item,selection.col)||'').toLowerCase();
    if(!isThresholdQuantity(quantity))return null;
    return {
      quantity,
      unit:seriesUnit(selection.item,selection.col)||null,
      reference:seriesReference(selection.item,selection.col)||null,
      label:seriesLabel(selection.item,selection.col),
    };
  }
  function thresholdContextsCompatible(previous,next){
    if(!previous||!next)return false;
    return previous.quantity===next.quantity&&String(previous.unit||'')===String(next.unit||'')&&String(previous.reference||'')===String(next.reference||'');
  }
  function thresholdContextText(context){
    if(!context)return 'No eligible Depth / Level series is mapped.';
    const quantity=context.quantity==='level'?'Absolute level':'Depth';
    const unit=context.unit||'unit unresolved';
    const reference=context.reference||'reference / datum not supplied';
    return quantity+' · '+unit+' · '+reference;
  }
  function numericThreshold(id,label){
    const raw=$(id)?.value??'';
    if(raw==='')return null;
    const value=Number(raw);
    if(!Number.isFinite(value))throw new Error(label+' must be a finite numeric value.');
    return value;
  }
  function reconcileThresholdContext(role,previous,next){
    const spillId=role==='observed'?'obsThreshold':'modelThreshold';
    const graphId=role==='observed'?'graphObsThreshold':'graphModelThreshold';
    const configured=$(spillId)?.value!=='';
    if(configured&&previous&&!thresholdContextsCompatible(previous,next)){
      $(spillId).value='';
      if($(graphId))$(graphId).value='';
      return role+' threshold cleared because the mapped hydraulic quantity, unit or reference changed; reassign or explicitly convert it.';
    }
    return '';
  }

  function updateChannelControls(){
    const nav=document.getElementById('v2ChannelNav'),strip=document.getElementById('v2ChannelStrip'),selected=mappingObject(state.mapping.observed);
    if(!nav)return;
    const quantities=selected?hydraulicSeriesForItem(selected.item).map(x=>String(x.quantity||'').toLowerCase()):[];
    const available=quantities.length>=2;
    nav.hidden=!available;
    if(strip)strip.hidden=!available;
    if(!available){ui.channelMode='combined';return;}
    if(ui.channelMode!=='combined'&&!quantities.includes(ui.channelMode))ui.channelMode='combined';
    nav.querySelectorAll('[data-channel]').forEach(button=>{
      const mode=button.dataset.channel;
      button.hidden=mode!=='combined'&&!quantities.includes(mode);
      button.classList.toggle('active',mode===ui.channelMode);
      button.setAttribute('aria-pressed',String(mode===ui.channelMode));
    });
  }

  function setChannelMode(mode,redraw=true){
    const next=['flow','depth','level','velocity','combined'].includes(String(mode))?String(mode):'combined';
    ui.channelMode=next;
    updateChannelControls();
    updateGraphThresholdControls();
    ui.graphRange=null;
    if(redraw&&state.mapping.observed)void v2DrawGraph(null);
  }

  function updateGraphThresholdControls(){
    const channelAllowsHydraulicThreshold=!['flow','velocity'].includes(ui.channelMode);
    const observedContext=channelAllowsHydraulicThreshold?thresholdContext(observedThresholdSelection()):null;
    const modelContext=channelAllowsHydraulicThreshold?thresholdContext(modelThresholdSelection()):null;
    const observedUnresolved=channelAllowsHydraulicThreshold?observedUnresolvedSelection():null;
    const modelUnresolved=channelAllowsHydraulicThreshold?modelUnresolvedSelection():null;
    const observedControl=document.querySelector('#v2GraphToolbar [data-threshold-role="observed"]');
    const modelControl=document.querySelector('#v2GraphToolbar [data-threshold-role="model"]');
    if(observedControl)observedControl.hidden=!(observedContext||observedUnresolved);
    if(modelControl)modelControl.hidden=!(modelContext||modelUnresolved);
    const setEnabled=(role,enabled)=>{
      const input=$(role==='observed'?'graphObsThreshold':'graphModelThreshold');
      const toggle=$(role==='observed'?'showGraphObsThreshold':'showGraphModelThreshold');
      if(input)input.disabled=!enabled;
      if(toggle)toggle.disabled=!enabled;
    };
    setEnabled('observed',Boolean(observedContext));
    setEnabled('model',Boolean(modelContext));
    if($('graphObsThresholdContext'))$('graphObsThresholdContext').textContent=observedContext
      ?thresholdContextText(observedContext)
      :(observedUnresolved?'Generic numeric observed series · assign Depth or Level in Series Mapping to enable a hydraulic threshold.':thresholdContextText(null));
    if($('graphModelThresholdContext'))$('graphModelThresholdContext').textContent=modelContext
      ?thresholdContextText(modelContext)
      :(modelUnresolved?'Generic numeric model series · assign Depth or Level in Series Mapping to enable a hydraulic threshold.':thresholdContextText(null));
    ui.thresholdContexts={observed:observedContext,model:modelContext};
  }
  function updateThresholdRangeStatus(observedEntries,modelEntries){
    const apply=(role,context,value,entries)=>{
      const target=$(role==='observed'?'graphObsThresholdContext':'graphModelThresholdContext');
      if(!target||!context)return;
      const values=entries.filter(x=>isThresholdQuantity(x.quantity)).flatMap(x=>x.source?.data?.value||[]).map(Number).filter(Number.isFinite);
      let text=thresholdContextText(context);
      if(value!==null&&values.length){
        const min=Math.min(...values),max=Math.max(...values),unit=context.unit?' '+context.unit:'';
        if(value<min||value>max)text+=' · configured '+fmt(value,4)+unit+' is outside plotted support '+fmt(min,4)+'–'+fmt(max,4)+unit+'; threshold remains configured.';
      }
      target.textContent=text;
    };
    apply('observed',thresholdContext(observedThresholdSelection()),numericThreshold('obsThreshold','Observed threshold'),observedEntries);
    apply('model',thresholdContext(modelThresholdSelection()),numericThreshold('modelThreshold','Model threshold'),modelEntries);
  }

  async function v2ApplyMapping() {
    const previousMapping=JSON.stringify(state.mapping);
    const previousObservedContext=thresholdContext(observedThresholdSelection(state.mapping.observed));
    const previousModelContext=thresholdContext(modelThresholdSelection(state.mapping.models));
    state.mapping.observed = $('observedSelect').value;
    state.mapping.models = [...$('modelSelect').selectedOptions].map(o => o.value);
    state.mapping.rain = $('rainSelect').value;
    const thresholdMessages=[
      reconcileThresholdContext('observed',previousObservedContext,thresholdContext(observedThresholdSelection())),
      reconcileThresholdContext('model',previousModelContext,thresholdContext(modelThresholdSelection())),
    ].filter(Boolean);
    const mappingChanged=previousMapping!==JSON.stringify(state.mapping);
    if(mappingChanged&&state.rating){
      state.rating=null;
      diagnostic.lastRating=null;
      Plotly.purge('ratingChart');
      const summary=$('ratingSummary');
      if(summary)summary.innerHTML='<div class="pool-summary">Rating inputs changed. Recalculate the fitted relationship before interpreting or exporting it.</div>';
    }
    const obs = mappingObject(state.mapping.observed);
    const models = currentModels();
    if (!obs && !models.length && !state.mapping.rain) throw new Error('Select at least one observed, modelled or rainfall series.');
    const mappingSummary = `Observed: ${obs?seriesLabel(obs.item, obs.col):'not mapped'} · ${models.length} comparison scenario(s) · rainfall ${state.mapping.rain ? 'mapped' : 'not mapped'}.`+(thresholdMessages.length?' '+thresholdMessages.join(' '):'');
    $('mappingStatus').textContent = 'Applying mapping and refreshing graph…';
    renderModelColourControls();
    renderExclusions();
    if($('graphObsThreshold'))$('graphObsThreshold').value=$('obsThreshold').value;
    if($('graphModelThreshold'))$('graphModelThreshold').value=$('modelThreshold').value;
    updateGraphThresholdControls();
    updateChannelControls();
    const select=$('spillModelSelect');
    const previous=select.value;
    select.innerHTML='<option value="">No model selected</option>'+state.mapping.models.map(key=>{const m=mappingObject(key);return `<option value="${esc(key)}">${esc(seriesLabel(m.item,m.col))}</option>`;}).join('');
    if(state.mapping.models.includes(previous))select.value=previous;
    else if(state.mapping.models.length)select.value=state.mapping.models[0];
    autoSuggestAdvanced(allSeries());
    ui.graphRange = null;
    await v2DrawGraph(null);
    $('mappingStatus').textContent = mappingSummary;
  }

  async function v2SeriesFor(key, range=null) {
    const source = mappingObject(key);
    if (!source) return null;
    const args = {
      path: source.item.virtualPath,
      column: source.col,
      max_points: displayPointBudget(range),
      max_gap_seconds:Number($('gapInput').value||900),
      start: range?.[0] || null,
      end: range?.[1] || null,
    };
    // Always ask the authoritative worker for the requested visible window.
    // Caching full display slices here can silently defeat native-resolution
    // refinement after Plotly zoom/purge cycles. Engineering calculations were
    // never cached by this layer and remain unchanged.
    const data = await engine.call('series_data', args);
    return {...source, data};
  }

  function v2GraphShapes(targetAxis=null, options={}) {
    const shapes = [];
    const overlayBottom=Number.isFinite(Number(options.plotBottom))?Number(options.plotBottom):0;
    for(const e of exclusionPayload(false)){
      if(e.enabled)shapes.push({type:'rect',xref:'x',x0:e.start,x1:e.end,yref:'paper',y0:overlayBottom,y1:1,fillcolor:'#b45309',opacity:.12,line:{width:0},layer:'below',label:{text:e.reason}});
    }
    // Spill thresholds are the canonical analytical values. Keep the observed
    // and model axes distinct when one is Depth and the other is absolute Level.
    const obs = nullableNumber($('obsThreshold').value);
    const model = nullableNumber($('modelThreshold').value);
    const observedAxis=options.observedAxis||targetAxis||null;
    const modelAxis=options.modelAxis||targetAxis||null;
    const showObserved=Boolean(observedAxis)&&options.showObserved===true&&$('showGraphObsThreshold')?.checked!==false&&obs!==null;
    const showModel=Boolean(modelAxis)&&options.showModel===true&&$('showGraphModelThreshold')?.checked!==false&&model!==null;
    const coincident=showObserved&&showModel&&observedAxis===modelAxis&&Math.abs(Number(obs)-Number(model))<=1e-12;
    if(coincident){
      shapes.push({type:'line',xref:'paper',x0:0,x1:1,yref:observedAxis,y0:obs,y1:obs,line:{color:$('threshold1Color').value,width:2,dash:'dash'},layer:'above'});
    }else{
      if(showObserved)shapes.push({type:'line',xref:'paper',x0:0,x1:1,yref:observedAxis,y0:obs,y1:obs,line:{color:$('threshold1Color').value,width:2,dash:'dash'},layer:'above'});
      if(showModel)shapes.push({type:'line',xref:'paper',x0:0,x1:1,yref:modelAxis,y0:model,y1:model,line:{color:$('threshold2Color').value,width:2,dash:'dash'},layer:'above'});
    }
    if($('showEventOverlay').checked){
      for(const e of state.rainEvents)shapes.push({type:'rect',xref:'x',x0:e.start,x1:e.end,yref:'paper',y0:overlayBottom,y1:1,fillcolor:$('rainEventColor').value,opacity:.08,line:{width:0},layer:'below'});
    }
    return shapes;
  }

  function v2GraphAnnotations() {
    const out = [];
    // Threshold labels are represented in the top legend, not stamped onto the
    // hydraulic trace itself. Event identifiers remain lightweight annotations.
    if ($('showEventOverlay').checked) for (const e of state.rainEvents) out.push({xref:'x',x:e.start,yref:'paper',y:1,text:`E${e.event}`,showarrow:false,yanchor:'bottom',font:{size:9,color:'#8a4b00'}});
    return out;
  }

  function rainfallMaximum(values) {
    const configured = nullableNumber($('rainAxisMax').value);
    if (configured !== null && configured > 0) return configured;
    const finite = values.filter(v => v !== null && Number.isFinite(Number(v))).map(Number);
    const peak = finite.length ? Math.max(...finite) : 0;
    return peak > 0 ? peak * 1.12 : 1;
  }

  function plottedTimestampRange(observedEntries,modelEntries,rainEntry){
    let min=null,max=null;
    const visit=data=>{
      for(const value of data?.timestamp||[]){
        if(value==null)continue;
        const text=String(value);
        if(!text||text==='null')continue;
        if(min===null||text<min)min=text;
        if(max===null||text>max)max=text;
      }
    };
    observedEntries.forEach(x=>visit(x.source?.data));
    modelEntries.forEach(x=>visit(x.source?.data));
    if(rainEntry)visit(rainEntry.source?.data);
    return min&&max&&min<max?[min,max]:null;
  }

  function statisticValue(value, unit='') {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return `${fmt(Number(value),3)}${unit ? ` ${unit}` : ''}`;
  }

  function graphStatisticRow(row) {
    const s=row.statistics||{},factor=row.factor||1;
    const scale=v=>v==null?v:Number(v)*factor;
    const quantity=String(s.quantity||'').toLowerCase();
    const unit=s.unit||(quantity==='rainfall'?'mm/h':quantity==='flow'?'m³/s':quantity==='depth'?'m':quantity==='velocity'?'m/s':'—');
    const value=v=>v==null||!Number.isFinite(Number(v))?'—':fmt(Number(v),3);
    const total=scale(s.total);
    const totalText=total==null?'—':value(total)+(s.total_unit?' '+s.total_unit:'');
    return {
      series:row.compact_label||row.role||'Series',
      unit,
      min:value(scale(s.minimum)),
      max:value(scale(s.maximum)),
      average:value(scale(s.mean)),
      total:totalText,
    };
  }

  function graphStatisticsTrace(rows,domain=[0,.20]) {
    const data=rows.map(graphStatisticRow);
    return {
      type:'table',
      name:'Statistics',
      domain:{x:[0,1],y:domain},
      columnwidth:[2.2,1,1,1,1,1.25],
      header:{
        values:['Series','Unit','Min','Max','Average','Total'],
        align:['left','center','right','right','right','right'],
        fill:{color:'#f2f4f7'},
        line:{color:'#d9e1e8',width:1},
        font:{family:'Arial, sans-serif',size:11,color:'#263746'},
        height:27,
      },
      cells:{
        values:[
          data.map(x=>x.series),data.map(x=>x.unit),data.map(x=>x.min),
          data.map(x=>x.max),data.map(x=>x.average),data.map(x=>x.total),
        ],
        align:['left','center','right','right','right','right'],
        fill:{color:'#ffffff'},
        line:{color:'#e4e9ed',width:1},
        font:{family:'Arial, sans-serif',size:10.5,color:'#253746'},
        height:25,
      },
      hoverinfo:'skip',
    };
  }

  function graphTitle(fdvMode,observedEntries,modelEntries){
    const hasObserved=observedEntries.length>0,hasModel=modelEntries.length>0;
    const prefix=hasObserved&&hasModel?'Observed vs Simulated':hasModel?'Simulated':'Observed';
    if(fdvMode)return prefix+' — All';
    const quantity=String(observedEntries[0]?.quantity||modelEntries[0]?.quantity||'').toLowerCase();
    const label={depth:'Depth',level:'Level',flow:'Flow',velocity:'Velocity',rainfall:'Rainfall'}[quantity];
    return prefix+(label?' — '+label:'');
  }

  function renderGraphStatistics(rows,displayRange=null) {
    const target=$('graphStatistics');
    if(target){
      target.hidden=true;
      target.setAttribute('aria-hidden','true');
      target.innerHTML='';
    }
    const scaled=(row,key)=>{const value=row.statistics?.[key];return value==null?null:Number(value)*(row.factor||1);};
    const rain=rows.find(row=>String(row.statistics?.quantity||row.role).toLowerCase()==='rainfall');
    const flow=rows.find(row=>String(row.role).startsWith('Observed')&&String(row.statistics?.quantity||'').toLowerCase()==='flow')||
      rows.find(row=>String(row.statistics?.quantity||'').toLowerCase()==='flow');
    window.__ICM_WORKBENCH__.lastGraphStatistics=rows;
    window.__ICM_WORKBENCH__.lastGraphPeriodSummary={
      range:displayRange,
      rainfall_total_mm:rain?scaled(rain,'total'):null,
      flow_volume_m3:flow?scaled(flow,'total'):null,
    };
  }

  async function v2DrawGraph(range=ui.graphRange,options={}) {
    if (!state.mapping.observed && !(state.mapping.models||[]).length && !state.mapping.rain) {
      Plotly.purge('timeChart');
      return;
    }
    const generation=++ui.graphGeneration;
    ui.graphRefreshing=true;
    const pointCounts={};
    try{
      let observedSources=observedGraphSeries();
      const sourceFdvMode=observedSources.length>=2;
      if(ui.channelMode!=='combined')observedSources=observedSources.filter(source=>String(source.quantity||mappedQuantity(source.key)).toLowerCase()===ui.channelMode);
      const fdvMode=sourceFdvMode&&ui.channelMode==='combined';
      const selectedObserved=mappingObject(state.mapping.observed);
      const selectedQuantity=String(selectedObserved?seriesQuantity(selectedObserved.item,selectedObserved.col):'').toLowerCase();
      const observedEntries=[],modelEntries=[];
      const canonical=['flow','depth','level','velocity'];

      for(let observedIndex=0;observedIndex<observedSources.length;observedIndex+=1){
        const source=observedSources[observedIndex],obs=await v2SeriesFor(source.key,range);
        if(!obs||generation!==ui.graphGeneration)return;
        const quantity=String(seriesQuantity(obs.item,obs.col)||source.quantity||selectedQuantity||'value').toLowerCase();
        pointCounts[observedIndex===0?'observed':`observed_${quantity||observedIndex+1}`]={
          raw:obs.data.raw_count,shown:obs.data.display_count,native:obs.data.native_resolution,topology:obs.data.topology_exceeds_budget
        };
        observedEntries.push({source:obs,quantity});
      }

      let modelIndex=0;
      for(const key of state.mapping.models){
        const model=await v2SeriesFor(key,range);
        if(!model||generation!==ui.graphGeneration)return;
        let quantity=String(seriesQuantity(model.item,model.col)||'').toLowerCase();
        if(fdvMode&&!canonical.includes(quantity)&&canonical.includes(selectedQuantity))quantity=selectedQuantity;
        pointCounts[`model_${modelIndex+1}`]={
          raw:model.data.raw_count,shown:model.data.display_count,native:model.data.native_resolution,topology:model.data.topology_exceeds_budget
        };
        modelEntries.push({source:model,quantity,index:modelIndex,key});
        modelIndex+=1;
      }

      let rainEntry=null;
      if(state.mapping.rain){
        const rain=await v2SeriesFor(state.mapping.rain,range);
        if(rain&&generation===ui.graphGeneration){
          const factor=Number($('rainFactor').value||1);
          rainEntry={source:rain,factor,values:rain.data.value.map(v=>v==null?null:Number(v)*factor)};
          pointCounts.rainfall={
            raw:rain.data.raw_count,shown:rain.data.display_count,native:rain.data.native_resolution,topology:rain.data.topology_exceeds_budget
          };
        }
      }

      const panelQuantities=new Set([...observedEntries,...modelEntries].map(x=>String(x.quantity||'').toLowerCase()).filter(q=>canonical.includes(q)));
      const multiPanelMode=fdvMode||panelQuantities.size>1;
      const statisticRows=[];
      const addStat=(role,entry,factor=1)=>statisticRows.push({
        role,compact_label:compactGraphRole(role,entry.item,entry.col),
        label:seriesLabel(entry.item,entry.col),statistics:entry.data.statistics,factor
      });
      if(multiPanelMode){
        for(const quantity of canonical){
          for(const item of observedEntries.filter(x=>x.quantity===quantity))addStat('Observed',item.source);
          for(const item of modelEntries.filter(x=>x.quantity===quantity))addStat(`Model ${item.index+1}`,item.source);
        }
        if(rainEntry)addStat('Rainfall',rainEntry.source,rainEntry.factor);
      }else{
        for(const item of observedEntries)addStat('Observed',item.source);
        for(const item of modelEntries)addStat(`Model ${item.index+1}`,item.source);
        if(rainEntry)addStat('Rainfall',rainEntry.source,rainEntry.factor);
      }

      const plottedRange=plottedTimestampRange(observedEntries,modelEntries,rainEntry);
      const displayRange=range?.length===2?range:plottedRange;
      const traceType=data=>Number(data?.display_count||0)>8000?'scattergl':'scatter';
      const colourFor=q=>q==='flow'?($('observedFlowColour')?.value||$('obsColor').value):q==='depth'?($('observedDepthColour')?.value||$('obsColor').value):q==='velocity'?($('observedVelocityColour')?.value||$('obsColor').value):$('obsColor').value;
      const observedThreshold=nullableNumber($('obsThreshold').value);
      const modelThreshold=nullableNumber($('modelThreshold').value);
      const statsDomain=[0,.20],statsTop=.20,plotBottom=.285,axisPosition=.27;
      const rainBottom=.865,hydraulicTop=rainEntry?.805:1;
      let traces=[],layout,panelOrder=[];

      const commonLayout={
        template:'plotly_white',
        title:{text:options.title||graphTitle(multiPanelMode,observedEntries,modelEntries),x:.01,xanchor:'left',font:{size:18,color:'#263746'}},
        margin:{l:86,r:42,t:106,b:38},
        hovermode:'x unified',
        hoversubplots:'axis',
        dragmode:ui.exclusionCapture?'select':'zoom',
        selectdirection:'h',
        legend:{orientation:'h',y:1.025,x:1,xanchor:'right',yanchor:'bottom',font:{size:11},traceorder:'normal',groupclick:'togglegroup'},
        xaxis:{title:null,autorange:!displayRange,showgrid:false,zeroline:false,anchor:'free',position:axisPosition,side:'bottom',rangeslider:{visible:false},automargin:true,tickfont:{size:10,color:'#506272'},showspikes:true,spikemode:'across',spikesnap:'cursor',spikedash:'dot',spikethickness:1,spikecolor:'#9fb0bd'},
        annotations:[...v2GraphAnnotations(),{xref:'paper',x:.5,yref:'paper',y:statsTop+.018,text:'<b>Statistics</b>',showarrow:false,xanchor:'center',yanchor:'bottom',font:{size:11,color:'#263746'}}],
        uirevision:'icm-reference-plot-v2',
        paper_bgcolor:'#ffffff',plot_bgcolor:'#ffffff',
      };
      if(displayRange?.length===2){commonLayout.xaxis.range=displayRange;commonLayout.xaxis.autorange=false;}

      if(multiPanelMode){
        const available=new Set([...observedEntries,...modelEntries].map(x=>x.quantity).filter(q=>canonical.includes(q)));
        const hydraulicPanels=canonical.filter(q=>available.has(q));
        panelOrder=[...(rainEntry?['rainfall']:[]),...hydraulicPanels];
        const hydGap=hydraulicPanels.length>1?.025:0;
        const share=hydraulicPanels.length?(hydraulicTop-plotBottom-hydGap*(hydraulicPanels.length-1))/hydraulicPanels.length:(hydraulicTop-plotBottom);
        const axisByPanel={},panelDomains={},panelDecorations=[];
        layout={...commonLayout,height:Number(options.height)||1005,bargap:0};
        let top=hydraulicTop;
        hydraulicPanels.forEach((panel,index)=>{
          const bottom=Math.max(plotBottom,top-share);
          const n=(rainEntry?2:1)+index,axisKey=n===1?'yaxis':`yaxis${n}`,axisRef=n===1?'y':`y${n}`;
          axisByPanel[panel]=axisRef;panelDomains[panel]=[bottom,top];
          const representative=observedEntries.find(x=>x.quantity===panel)?.source||modelEntries.find(x=>x.quantity===panel)?.source;
          const unit=representative?seriesUnit(representative.item,representative.col):null;
          const reference=representative&&panel==='level'?seriesReference(representative.item,representative.col):null;
          const label={flow:'Flow',depth:'Depth',level:'Level',velocity:'Velocity'}[panel]||panel;
          const defaultUnit={flow:'m³/s',depth:'m',level:'m',velocity:'m/s'}[panel]||'';
          const title=label+' ('+(unit||defaultUnit)+')'+(reference?' · '+reference:'');
          layout[axisKey]={title:{text:title,standoff:10},domain:[bottom,top],anchor:'x',showgrid:true,gridcolor:'#e8eef3',gridwidth:1,zeroline:false,automargin:true,tickfont:{size:10,color:'#506272'},titlefont:{size:11,color:'#263746'},ticks:'outside',ticklen:3,tickcolor:'#9fb0bd'};
          layout.annotations.push({xref:'paper',x:.5,yref:'paper',y:top,text:'<b>'+title.replace(/ \(.+\)$/,'')+'</b>',showarrow:false,xanchor:'center',yanchor:'bottom',font:{size:11,color:'#263746'}});
          if(index>0){const separator=Math.min(1,top+hydGap/2);panelDecorations.push({type:'line',xref:'paper',x0:0,x1:1,yref:'paper',y0:separator,y1:separator,line:{color:'#dfe7ec',width:1},layer:'below'});}
          top=bottom-hydGap;
        });
        if(rainEntry){
          axisByPanel.rainfall='y';
          panelDomains.rainfall=[rainBottom,1];
          layout.yaxis={title:{text:'Rainfall (mm/h)',standoff:10},domain:[rainBottom,1],anchor:'x',range:[rainfallMaximum(rainEntry.values),0],showgrid:false,zeroline:false,automargin:true,tickfont:{size:10,color:'#506272'},titlefont:{size:11,color:'#263746'}};
          layout.annotations.push({xref:'paper',x:.5,yref:'paper',y:1,text:'<b>Rainfall</b>',showarrow:false,xanchor:'center',yanchor:'bottom',font:{size:11,color:'#263746'}});
          traces.push({x:rainEntry.source.data.timestamp,y:rainEntry.values,name:'Rainfall',uid:traceUid('rainfall',rainEntry.source.item.id,rainEntry.source.col),legendgroup:'rainfall',type:'scattergl',mode:'lines',connectgaps:false,yaxis:'y',line:{color:$('rainColor').value,width:1},hovertemplate:'%{x}<br>Rainfall %{y:.3f} mm/h<extra></extra>'});
        }
        for(const quantity of canonical){
          const axis=axisByPanel[quantity];if(!axis)continue;
          for(const item of observedEntries.filter(x=>x.quantity===quantity)){
            const d=item.source.data;
            traces.push({x:d.timestamp,y:d.value,name:`Observed ${quantity}`,uid:traceUid('observed',item.source.item.id,item.source.col),legendgroup:'observed',type:traceType(d),mode:'lines',connectgaps:false,line:{color:colourFor(quantity),width:quantity==='depth'?1.8:1.5},yaxis:axis,hovertemplate:'%{x}<br>'+quantity.charAt(0).toUpperCase()+quantity.slice(1)+' %{y:.4g}<extra></extra>'});
          }
          for(const item of modelEntries.filter(x=>x.quantity===quantity)){
            const d=item.source.data;
            traces.push({x:d.timestamp,y:d.value,name:`Model ${item.index+1} · ${item.source.col}`,uid:traceUid('model',item.source.item.id,item.source.col),legendgroup:'model:'+item.source.item.id,meta:item.source.item.displayName,type:traceType(d),mode:'lines',connectgaps:false,line:{color:state.modelColours[item.key]||palette[item.index%palette.length],width:1.6},yaxis:axis});
          }
        }
        const observedThresholdSeries=observedThresholdSelection();
        const activeModelThresholdSeries=thresholdSelectionForKey($('spillModelSelect')?.value||'')||modelThresholdSelection();
        const observedThresholdQuantity=observedThresholdSeries?String(seriesQuantity(observedThresholdSeries.item,observedThresholdSeries.col)||'').toLowerCase():'';
        const modelThresholdQuantity=activeModelThresholdSeries?String(seriesQuantity(activeModelThresholdSeries.item,activeModelThresholdSeries.col)||'').toLowerCase():'';
        const observedThresholdAxis=axisByPanel[observedThresholdQuantity]||null;
        const modelThresholdAxis=axisByPanel[modelThresholdQuantity]||null;
        const showObserved=Boolean(observedThresholdAxis&&$('showGraphObsThreshold')?.checked!==false&&observedThreshold!==null);
        const showModel=Boolean(modelThresholdAxis&&$('showGraphModelThreshold')?.checked!==false&&modelThreshold!==null);
        const coincident=showObserved&&showModel&&observedThresholdAxis===modelThresholdAxis&&Math.abs(Number(observedThreshold)-Number(modelThreshold))<=1e-12;
        layout.shapes=[...panelDecorations,...v2GraphShapes(null,{observedAxis:observedThresholdAxis,modelAxis:modelThresholdAxis,showObserved,showModel,plotBottom})];
        if(coincident)traces.push({x:[null],y:[null],mode:'lines',name:'Observed + model '+observedThresholdQuantity+' threshold',hoverinfo:'skip',showlegend:true,yaxis:observedThresholdAxis,line:{color:$('threshold1Color').value,width:2.5,dash:'dash'}});
        else{
          if(showObserved)traces.push({x:[null],y:[null],mode:'lines',name:$('threshold1Label').value||'Observed / EDM depth / level threshold',hoverinfo:'skip',showlegend:true,yaxis:observedThresholdAxis,line:{color:$('threshold1Color').value,width:2.5,dash:'dash'}});
          if(showModel)traces.push({x:[null],y:[null],mode:'lines',name:$('threshold2Label').value||'Model depth / level threshold',hoverinfo:'skip',showlegend:true,yaxis:modelThresholdAxis,line:{color:$('threshold2Color').value,width:2.5,dash:'dash'}});
        }
        traces.push(graphStatisticsTrace(statisticRows,statsDomain));
        window.__ICM_WORKBENCH__.lastPanelDomains=panelDomains;
      }else{
        const obs=observedEntries[0],primary=obs||modelEntries[0],quantity=String(primary?.quantity||'').toLowerCase();
        const rainfallOnly=!primary&&Boolean(rainEntry);
        panelOrder=rainfallOnly?['rainfall']:[...(rainEntry?['rainfall']:[]),quantity||'hydraulic'];
        layout={...commonLayout,height:Number(options.height)||(rainfallOnly?720:850),bargap:0};
        const hydDomain=[plotBottom,hydraulicTop];
        const primaryUnit=primary?seriesUnit(primary.source.item,primary.source.col):null;
        const primaryReference=primary?seriesReference(primary.source.item,primary.source.col):null;
        const quantityTitle=quantity?quantity.charAt(0).toUpperCase()+quantity.slice(1):(primary?.source?.col||'Value');
        const hydraulicAxisTitle=quantityTitle+(primaryUnit?' ('+primaryUnit+')':'')+(quantity==='level'&&primaryReference?' · '+primaryReference:'');
        layout.yaxis=rainfallOnly
          ?{title:{text:'Rainfall (mm/h)',standoff:10},domain:[plotBottom,1],anchor:'x',range:[rainfallMaximum(rainEntry.values),0],showgrid:false,zeroline:false,automargin:true}
          :{title:{text:hydraulicAxisTitle,standoff:10},domain:hydDomain,anchor:'x',showgrid:true,gridcolor:'#e8eef3',zeroline:false,automargin:true};
        if(obs){
          traces.push({x:obs.source.data.timestamp,y:obs.source.data.value,name:'Observed '+(quantity?quantity.charAt(0).toUpperCase()+quantity.slice(1):obs.source.col),uid:traceUid('observed',obs.source.item.id,obs.source.col),legendgroup:'observed',type:traceType(obs.source.data),mode:'lines',connectgaps:false,line:{color:$('obsColor').value,width:2.2},yaxis:'y'});
        }
        for(const item of modelEntries){
          traces.push({x:item.source.data.timestamp,y:item.source.data.value,name:`Simulated: ${item.source.col}`,uid:traceUid('model',item.source.item.id,item.source.col),legendgroup:'model:'+item.source.item.id,meta:item.source.item.displayName,type:traceType(item.source.data),mode:'lines',connectgaps:false,line:{color:state.modelColours[item.key]||palette[item.index%palette.length],width:2},yaxis:'y'});
        }
        if(primary)layout.annotations.push({xref:'paper',x:.5,yref:'paper',y:hydraulicTop,text:'<b>'+(quantity?quantity.charAt(0).toUpperCase()+quantity.slice(1):'Hydraulic')+'</b>',showarrow:false,xanchor:'center',yanchor:'bottom',font:{size:11,color:'#263746'}});
        if(rainEntry){
          if(!rainfallOnly){
            layout.yaxis2={title:{text:'Rainfall (mm/h)',standoff:10},domain:[rainBottom,1],anchor:'x',range:[rainfallMaximum(rainEntry.values),0],showgrid:false,zeroline:false,automargin:true};
          }
          layout.annotations.push({xref:'paper',x:.5,yref:'paper',y:1,text:'<b>Rainfall</b>',showarrow:false,xanchor:'center',yanchor:'bottom',font:{size:11,color:'#263746'}});
          traces.push({x:rainEntry.source.data.timestamp,y:rainEntry.values,name:'Rainfall',uid:traceUid('rainfall',rainEntry.source.item.id,rainEntry.source.col),legendgroup:'rainfall',type:'scattergl',mode:'lines',connectgaps:false,yaxis:rainfallOnly?'y':'y2',line:{color:$('rainColor').value,width:1},hovertemplate:'%{x}<br>Rainfall %{y:.3f} mm/h<extra></extra>'});
        }
        // ICM HYD exports commonly describe the vertical hydraulic series as
        // "level" rather than "depth". Both belong to the same threshold-bearing
        // hydraulic axis; flow and velocity remain ineligible. Model-only
        // depth/level review is valid even when no observed series is mapped.
        const singleDepth=isThresholdQuantity(quantity);
        const hasObservedDepth=Boolean(obs)&&isThresholdQuantity(obs.quantity);
        const hasDepthModel=modelEntries.some(x=>isThresholdQuantity(x.quantity));
        const showObserved=hasObservedDepth&&$('showGraphObsThreshold')?.checked!==false&&observedThreshold!==null;
        const showModel=hasDepthModel&&$('showGraphModelThreshold')?.checked!==false&&modelThreshold!==null;
        const coincident=showObserved&&showModel&&Math.abs(Number(observedThreshold)-Number(modelThreshold))<=1e-12;
        const thresholdQuantityLabel=quantity==='level'?'level':'depth';
        layout.shapes=v2GraphShapes(singleDepth?'y':null,{showObserved,showModel,plotBottom});
        if(coincident)traces.push({x:[null],y:[null],mode:'lines',name:`Observed + model ${thresholdQuantityLabel} threshold`,hoverinfo:'skip',showlegend:true,yaxis:'y',line:{color:$('threshold1Color').value,width:2.5,dash:'dash'}});
        else{
          if(showObserved)traces.push({x:[null],y:[null],mode:'lines',name:$('threshold1Label').value||'Observed / EDM depth / level threshold',hoverinfo:'skip',showlegend:true,yaxis:'y',line:{color:$('threshold1Color').value,width:2.5,dash:'dash'}});
          if(showModel)traces.push({x:[null],y:[null],mode:'lines',name:$('threshold2Label').value||'Model depth / level threshold',hoverinfo:'skip',showlegend:true,yaxis:'y',line:{color:$('threshold2Color').value,width:2.5,dash:'dash'}});
        }
        traces.push(graphStatisticsTrace(statisticRows,statsDomain));
        window.__ICM_WORKBENCH__.lastPanelDomains=null;
      }

      // Preserve user zoom/legend state only while the mapped graph identity and
      // subplot topology are stable. Rainfall/source removal can renumber y-axes;
      // carrying state across that structural change would be misleading.
      const graphIdentity=JSON.stringify({
        observed:state.mapping.observed||null,
        models:[...(state.mapping.models||[])],
        rain:state.mapping.rain||null,
        channel:ui.channelMode,
        panels:panelOrder,
      });
      layout.uirevision='icm-reference-plot-v2:'+graphIdentity;
      layout.legend={...(layout.legend||{}),uirevision:layout.uirevision};
      const chartNode=$('timeChart');
      if(chartNode&&chartNode.__v2GraphIdentity===graphIdentity&&Array.isArray(chartNode.data)){
        const previousVisibility=new Map(
          chartNode.data.filter(trace=>trace?.uid).map(trace=>[trace.uid,trace.visible])
        );
        for(const trace of traces){
          if(!trace?.uid||!previousVisibility.has(trace.uid))continue;
          const visible=previousVisibility.get(trace.uid);
          if(visible!==undefined)trace.visible=visible;
        }
      }
      if(chartNode){chartNode.style.height=layout.height+'px';chartNode.style.minHeight=layout.height+'px';}
      ui.suppressRelayout=true;
      try{
        await Plotly.react('timeChart',traces,layout,plotConfig(graphTitle(multiPanelMode,observedEntries,modelEntries),{modeBarButtonsToAdd:timeGraphModebarButtons(),modeBarButtonsToRemove:['select2d','lasso2d']}));
        if(chartNode)chartNode.__v2GraphIdentity=graphIdentity;
      }finally{
        ui.suppressRelayout=false;
      }
      wireAdaptiveZoom();
      wireGraphInteractions();
      if(generation!==ui.graphGeneration)return;
      ui.graphRange=range;
      window.__ICM_WORKBENCH__.lastGraphPointCounts=pointCounts;
      window.__ICM_WORKBENCH__.lastGraphRange=range;
      window.__ICM_WORKBENCH__.lastGraphMode=fdvMode?'fdv-multi-variable':multiPanelMode?'multi-quantity':'single-series';
      window.__ICM_WORKBENCH__.lastPanelOrder=panelOrder;
      renderGraphStatistics(statisticRows,displayRange);
      updateThresholdRangeStatus(observedEntries,modelEntries);
      const density=$('graphDensity');
      if(density){
        const native=Object.values(pointCounts).every(x=>x.native),shown=Object.values(pointCounts).reduce((sum,x)=>sum+(x.shown||0),0),raw=Object.values(pointCounts).reduce((sum,x)=>sum+(x.raw||0),0);
        density.innerHTML=`<strong>${native?'Native resolution':'Adaptive display'} · ${shown.toLocaleString()} / ${raw.toLocaleString()} points</strong>${native?'Every available source timestep in the visible window is plotted.':'Zoom further to progressively refine the visible window toward native source detail.'}`;
      }
    }finally{
      ui.graphRefreshing=false;
    }
  }

  function relayoutRange(event) {
    if (!event) return undefined;
    if (event['xaxis.autorange'] === true) return null;
    if (Array.isArray(event['xaxis.range']) && event['xaxis.range'].length === 2) return event['xaxis.range'];
    if (event['xaxis.range[0]'] !== undefined && event['xaxis.range[1]'] !== undefined) return [event['xaxis.range[0]'],event['xaxis.range[1]']];
    return undefined;
  }

  function adaptiveZoomRelayout(event) {
    // Plotly.react can emit relayout events while the workbench is replacing
    // display traces. Those are implementation-side redraws, not a user's
    // analytical viewport change, and must not overwrite a pending zoom.
    if(ui.suppressRelayout||ui.graphRefreshing)return;
    const range = relayoutRange(event);
    if (range === undefined) return;
    ui.graphRange = range;
    ++ui.graphGeneration;
    clearTimeout(ui.graphTimer);
    ui.graphTimer = setTimeout(() => void v2DrawGraph(range), 220);
  }

  function wireAdaptiveZoom() {
    const chart = $('timeChart');
    if (!chart || typeof chart.on!=='function') return;
    // Plotly.purge removes Plotly event subscriptions but does not guarantee
    // removal of arbitrary DOM properties. Rebind deterministically after each
    // react so a stale marker can never leave zoom refinement disconnected.
    const previous=chart.__v2AdaptiveZoomHandler;
    if(previous&&typeof chart.removeListener==='function'){
      try{chart.removeListener('plotly_relayout',previous);}catch{}
    }
    chart.__v2AdaptiveZoomHandler=adaptiveZoomRelayout;
    chart.on('plotly_relayout',adaptiveZoomRelayout);
  }

  function scheduleGraphRedraw(delay=120) {
    if ((!state.mapping.observed && !(state.mapping.models||[]).length && !state.mapping.rain) || !$('timeChart')) return;
    clearTimeout(ui.graphTimer);
    ui.graphTimer = setTimeout(() => void v2DrawGraph(ui.graphRange), delay);
  }

  function annualRows(result) {
    return result?.yearly_summary || [];
  }

  function annualTable(result) {
    if (!result) return '<div class="v2-empty">Not calculated for this dataset.</div>';
    const rows = annualRows(result);
    const annual = rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Year</th><th>12/24 spill count</th><th>Spill duration (hr)</th><th>Valid h</th><th>Unknown h</th><th>Excluded h</th><th>Requested h</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.year}</td><td>${fmt(x.spill_count,0)}</td><td>${fmt(x.duration_hours,2)}</td><td>${fmt(x.valid_hours,2)}</td><td>${fmt(x.unknown_hours,2)}</td><td>${fmt(x.excluded_hours,2)}</td><td>${fmt(x.requested_hours,2)}</td><td>${esc(x.count_status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="v2-empty">No assessed calendar years.</div>';
    const monthly = monthlyTable(result);
    return `<div class="v2-yearly-title"><h4>Yearly spill summary</h4><span>${esc(result.count_status||result.status||'')}</span></div>${annual}<details class="v2-monthly-detail"><summary>Monthly detail</summary>${monthly}</details>`;
  }

  function spillDeviationRag(observed,model){
    const o=Number(observed),m=Number(model);
    if(!Number.isFinite(o)||!Number.isFinite(m)||o<0||m<0)return {deviation:null,rag:null,label:'Not comparable'};
    if(o===0&&m===0)return {deviation:0,rag:'Green',label:'0.0%'};
    if(o===0)return {deviation:Infinity,rag:'Red',label:'∞'};
    const deviation=Math.abs(m-o)/Math.abs(o)*100;
    const rag=deviation<=5?'Green':deviation<=10?'Amber':'Red';
    return {deviation,rag,label:fmt(deviation,1)+'%'};
  }
  function spillSupport(result){
    if(!result)return null;
    const hours=(hourKey,secondKey)=>{
      const h=Number(result?.[hourKey]);if(Number.isFinite(h))return h;
      const s=Number(result?.[secondKey]);return Number.isFinite(s)?s/3600:null;
    };
    return {valid:hours('valid_hours','valid_seconds'),unknown:hours('unknown_hours','unknown_seconds'),excluded:hours('excluded_hours','excluded_seconds'),requested:hours('requested_hours','requested_seconds')};
  }
  function spillComparisonSupport(observed,model){
    if(!observed||!model)return {comparable:false,reason:'Both observed and modelled results are required.'};
    if(String(observed.count_status||observed.status||'')!=='definitive'||String(model.count_status||model.status||'')!=='definitive'){
      return {comparable:false,reason:'One or both spill results are not definitive because usable temporal support is incomplete.'};
    }
    const a=spillSupport(observed),b=spillSupport(model),toleranceHours=1/3600;
    for(const key of ['valid','unknown','excluded','requested']){
      if(a?.[key]===null||b?.[key]===null)continue;
      if(Math.abs(a[key]-b[key])>toleranceHours)return {comparable:false,reason:'Observed and modelled assessment support/masks differ; RAG is withheld.'};
    }
    return {comparable:true,reason:'Observed and modelled assessment support is aligned.'};
  }
  function spillRagCell(result){
    if(!result?.rag)return '<span class="spill-rag-na">Not comparable</span>';
    return '<span class="spill-rag spill-rag-'+result.rag.toLowerCase()+'">'+esc(result.rag)+' · '+esc(result.label)+'</span>';
  }
  window.__ICM_WORKBENCH__.spillDeviationRag=spillDeviationRag;

  function annualComparison() {
    const observed = state.spills.observed;
    const model = state.spills.model;
    if (observed && !model) return '<div class="v2-empty">A model result is optional. Select and calculate a model only when an observed/model comparison is required.</div>';
    if (!observed && model) return '<div class="v2-empty">Model-only spill assessment is shown. Add and calculate an observed Depth / Level series when an observed/model comparison is required.</div>';
    if (!observed && !model) return '<div class="v2-empty">No spill result has been calculated.</div>';
    const overallSupport=spillComparisonSupport(observed,model);
    const overallCount=overallSupport.comparable?spillDeviationRag(observed.total_spill_count,model.total_spill_count):null;
    const overallDuration=overallSupport.comparable?spillDeviationRag(observed.total_spill_duration_hours,model.total_spill_duration_hours):null;
    const summary='<div class="summary-box spill-compare-summary"><div><strong>'+spillRagCell(overallCount)+'</strong><span>Overall spill-count deviation</span></div><div><strong>'+spillRagCell(overallDuration)+'</strong><span>Overall duration deviation</span></div><div><strong>'+(overallSupport.comparable?'Comparable':'Withheld')+'</strong><span>'+esc(overallSupport.reason)+'</span></div></div>';
    const om = new Map(annualRows(observed).map(x=>[Number(x.year),x]));
    const mm = new Map(annualRows(model).map(x=>[Number(x.year),x]));
    const years = [...new Set([...om.keys(),...mm.keys()])].sort((a,b)=>a-b);
    if (!years.length) return summary+'<div class="v2-empty">No annual spill results.</div>';
    const rows=years.map(year=>{
      const o=om.get(year),m=mm.get(year),support=spillComparisonSupport(o,m);
      const count=support.comparable?spillDeviationRag(o?.spill_count,m?.spill_count):null;
      const duration=support.comparable?spillDeviationRag(o?.duration_hours,m?.duration_hours):null;
      return `<tr><td>${year}</td><td>${fmt(o?.spill_count,0)}</td><td>${fmt(m?.spill_count,0)}</td><td>${support.comparable?esc(count.label):'—'}</td><td>${spillRagCell(count)}</td><td>${fmt(o?.duration_hours,2)}</td><td>${fmt(m?.duration_hours,2)}</td><td>${support.comparable?esc(duration.label):'—'}</td><td>${spillRagCell(duration)}</td><td title="${esc(support.reason)}">${support.comparable?'Matched':'Not comparable'}</td></tr>`;
    }).join('');
    return summary+'<p class="spill-rag-method">RAG uses absolute deviation from observed: Green ≤5%, Amber &gt;5–10%, Red &gt;10%. If observed = 0 and model &gt; 0 the deviation is treated as Red/∞. RAG is withheld where temporal support or masks differ.</p><div class="table-wrap spill-annual-compare"><table class="data-table"><thead><tr><th>Year</th><th>Observed count</th><th>Model count</th><th>Count deviation</th><th>Count RAG</th><th>Observed duration h</th><th>Model duration h</th><th>Duration deviation</th><th>Duration RAG</th><th>Support</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  function renderSpillsV2() {
    $('obsSpillSummary').innerHTML = spillSummaryHtml(state.spills.observed);
    $('modelSpillSummary').innerHTML = spillSummaryHtml(state.spills.model);
    $('obsMonthly').innerHTML = annualTable(state.spills.observed);
    $('modelMonthly').innerHTML = annualTable(state.spills.model);
    $('spillComparison').innerHTML = annualComparison();
    const rows = [];
    for (const [name,result] of [['Observed',state.spills.observed],['Modelled',state.spills.model]]) {
      for (const e of result?.events || []) rows.push(`<tr><td>${name}</td><td>${esc(e.start)}</td><td>${esc(e.end)}</td><td>${fmt(Number(e.duration_seconds)/3600,3)}</td></tr>`);
    }
    $('eventBody').innerHTML = rows.join('');
    const applied=state.spillSnapshot?.config?.applied_exclusions||{};
    window.__ICM_WORKBENCH__.lastSpills = {
      observed:state.spills.observed?{excluded_seconds:state.spills.observed.excluded_seconds,applied_exclusion_count:(applied.observed||[]).length,count:state.spills.observed.total_spill_count,yearly:state.spills.observed.yearly_summary}:null,
      modelled:state.spills.model?{excluded_seconds:state.spills.model.excluded_seconds,applied_exclusion_count:(applied.model||[]).length,count:state.spills.model.total_spill_count,yearly:state.spills.model.yearly_summary}:null,
    };
  }

  async function v2RunSpills() {
    const observed = observedThresholdSelection();
    const activeModelKey=$('spillModelSelect').value;
    const model = thresholdSelectionForKey(activeModelKey);
    const observedThreshold = numericThreshold('obsThreshold','Observed threshold');
    const modelThreshold = numericThreshold('modelThreshold','Model threshold');
    if (observedThreshold!==null&&!observed) throw new Error('Observed spill threshold requires a mapped Depth or Level series. Flow and Velocity cannot consume a hydraulic-level threshold.');
    if (modelThreshold!==null&&activeModelKey&&!model) throw new Error('Model spill threshold requires the active model to be a Depth or Level series. Flow and Velocity cannot consume a hydraulic-level threshold.');
    if (!observed && !model) throw new Error('Map an eligible observed or model Depth / Level series before calculating hydraulic-level spills.');
    if (observedThreshold===null && (!model || modelThreshold===null)) throw new Error('Enter at least one spill threshold.');

    syncExclusionsFromEditor();
    const exclusionsFor=(role,key)=>exclusionPayload(true,role,key);
    const observedExclusions=observed?exclusionsFor('observed',sourceKey(observed.item.id,observed.col)):[];
    const modelExclusions=model?exclusionsFor('model',sourceKey(model.item.id,model.col)):[];
    const bounds=analysisBounds();
    const config=JSON.parse(JSON.stringify(workspaceObject()));
    config.applied_exclusions={observed:observedExclusions,model:modelExclusions};
    const signature=analysisSignature();
    const gap = Number($('gapInput').value || 900);
    state.spills = {};
    const started = performance.now();

    if (observed && observedThreshold !== null) {
      setOperationStatus('Calculating observed EDM spills…', 'running');
      await nextPaint();
      state.spills.observed = await engine.call('spill_result',{path:observed.item.virtualPath,column:observed.col,threshold:observedThreshold,exclusions_json:JSON.stringify(observedExclusions),max_gap_seconds:gap,...bounds});
    }
    if (model && modelThreshold !== null) {
      setOperationStatus('Calculating modelled spills…', 'running');
      await nextPaint();
      state.spills.model = await engine.call('spill_result',{path:model.item.virtualPath,column:model.col,threshold:modelThreshold,exclusions_json:JSON.stringify(modelExclusions),max_gap_seconds:gap,...bounds});
    }
    if(signature!==analysisSignature()){state.spills={};throw new Error('Spill inputs changed while calculation was running. The late result was discarded.');}
    state.spillSnapshot={config,signature,results:JSON.parse(JSON.stringify(state.spills))};
    renderSpillsV2();
    const elapsed = (performance.now()-started)/1000;
    const excludedHours=result=>Number(result?.excluded_seconds||0)/3600;
    const exclusionAudit=[
      observed?`Observed: ${observedExclusions.length} period(s), ${excludedHours(state.spills.observed).toFixed(3)} h excluded`:null,
      model?`Model: ${modelExclusions.length} period(s), ${excludedHours(state.spills.model).toFixed(3)} h excluded`:null,
    ].filter(Boolean).join(' · ');
    setOperationStatus(`Completed in ${elapsed.toFixed(1)} s. ${exclusionAudit}. Yearly 12/24 counts and physical durations are shown below.`, 'done');
  }

  function installHijacks() {
    hijackButton('applyMappingBtn','mappingStatus','Applying…',v2ApplyMapping);
    hijackButton('refreshGraphBtn','mappingStatus','Refreshing…',()=>v2DrawGraph(ui.graphRange));
    hijackButton('runSpillsBtn','spillRunStatus','Calculating…',v2RunSpills);

    // Graph-affecting appearance controls in the original runtime are intercepted so
    // they use the new two-band adaptive graph rather than reverting to the old overlay.
    for (const id of ['obsColor','observedFlowColour','observedDepthColour','observedVelocityColour','rainColor','rainFactor','rainAxisMax','threshold1Label','threshold1Color','threshold2Label','threshold2Color','showEventOverlay','rainEventColor']) {
      const el = $(id);
      if (!el) continue;
      el.addEventListener('change', event => {
        event.stopImmediatePropagation();
        scheduleGraphRedraw(80);
      }, {capture:true});
    }
  }

  window.ICMGraph = {draw:v2DrawGraph,applyMapping:v2ApplyMapping,setChannel:setChannelMode,channel:()=>ui.channelMode,useVisiblePeriod:useVisiblePeriodFromGraph,fitVisibleY,setExclusionCapture,captureExclusionRange:(range)=>captureGraphExclusion({range:{x:range}}),inspectPoint:inspectGraphPoint};
  const exActions=$('addExclusionBtn').parentElement;
  const rangeButton=document.createElement('button');rangeButton.className='btn quiet';rangeButton.textContent='Exclude visible period';rangeButton.onclick=()=>{const range=ui.graphRange;if(!range)return;addExclusionRow({start:modelClock(range[0]),end:modelClock(range[1])});};exActions.appendChild(rangeButton);
  const undoButton=document.createElement('button');undoButton.className='btn quiet';undoButton.textContent='Undo removal';undoButton.onclick=()=>{const row=state.deletedExclusions?.pop();if(row){state.exclusions.push(row);renderExclusions();void drawTimeChart();}};exActions.appendChild(undoButton);
  installSourcePoolControl();
  installGraphControls();
  installSpillStatus();
  configureExistingCopy();
  installHijacks();
})();
