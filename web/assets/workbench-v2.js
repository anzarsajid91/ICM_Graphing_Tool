(() => {
  'use strict';

  const FULL_DISPLAY_POINTS = 15000;
  const ZOOM_DISPLAY_POINTS = 60000;
  const ui = {
    poolExpanded: false,
    graphRange: null,
    graphRefreshing: false,
    graphTimer: null,
    graphGeneration: 0,
  };
  window.__ICM_WORKBENCH__.uiV2 = ui;

  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

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
      <div class="v2-threshold-control">
        <label>Observed / EDM spill threshold
          <input id="graphObsThreshold" type="number" step="any" placeholder="Not shown" />
        </label>
        <label class="v2-show-toggle"><input id="showGraphObsThreshold" type="checkbox" checked /> Show line</label>
      </div>
      <div class="v2-threshold-control">
        <label>Model spill threshold
          <input id="graphModelThreshold" type="number" step="any" placeholder="Not shown" />
        </label>
        <label class="v2-show-toggle"><input id="showGraphModelThreshold" type="checkbox" checked /> Show line</label>
      </div>
      <div class="v2-density" id="graphDensity"><strong>Adaptive display</strong>Full view uses up to ${FULL_DISPLAY_POINTS.toLocaleString()} points per trace; zoomed windows use up to ${ZOOM_DISPLAY_POINTS.toLocaleString()}.</div>`;
    panel.insertBefore(toolbar, details);
    const chart = document.getElementById('timeChart');
    if (chart && !document.getElementById('graphStatistics')) {
      const stats = document.createElement('section');
      stats.id = 'graphStatistics';
      stats.className = 'v2-graph-statistics';
      stats.setAttribute('aria-live','polite');
      stats.innerHTML = '<div class="v2-empty">Map a series to calculate native-resolution graph statistics.</div>';
      chart.insertAdjacentElement('afterend', stats);
    }

    const syncFromSpill = () => {
      $('graphObsThreshold').value = $('obsThreshold').value;
      $('graphModelThreshold').value = $('modelThreshold').value;
    };
    syncFromSpill();

    for (const [graphId, spillId] of [['graphObsThreshold','obsThreshold'],['graphModelThreshold','modelThreshold']]) {
      $(graphId).addEventListener('input', () => {
        $(spillId).value = $(graphId).value;
        scheduleGraphRedraw(80);
      });
      $(spillId).addEventListener('input', () => {
        $(graphId).value = $(spillId).value;
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

  async function v2ApplyMapping() {
    state.mapping.observed = $('observedSelect').value;
    state.mapping.models = [...$('modelSelect').selectedOptions].map(o => o.value);
    state.mapping.rain = $('rainSelect').value;
    const obs = mappingObject(state.mapping.observed);
    const models = currentModels();
    if (!obs && !state.mapping.rain) throw new Error('Select an observed or rainfall series.');
    $('mappingStatus').textContent = `Observed: ${obs?seriesLabel(obs.item, obs.col):'not mapped'} · ${models.length} comparison scenario(s) · rainfall ${state.mapping.rain ? 'mapped' : 'not mapped'}.`;
    renderModelColourControls();
    renderExclusions();
    const select=$('spillModelSelect');
    const previous=select.value;
    select.innerHTML='<option value="">No model selected</option>'+state.mapping.models.map(key=>{const m=mappingObject(key);return `<option value="${esc(key)}">${esc(seriesLabel(m.item,m.col))}</option>`;}).join('');
    if(state.mapping.models.includes(previous))select.value=previous;
    if(state.mapping.models.length===1)select.value=state.mapping.models[0];
    autoSuggestAdvanced(allSeries());
    ui.graphRange = null;
    await v2DrawGraph(null);
  }

  async function v2SeriesFor(key, range=null) {
    const source = mappingObject(key);
    if (!source) return null;
    const args = {
      path: source.item.virtualPath,
      column: source.col,
      max_points: range ? ZOOM_DISPLAY_POINTS : FULL_DISPLAY_POINTS,
      max_gap_seconds:Number($('gapInput').value||900),
      start: range?.[0] || null,
      end: range?.[1] || null,
    };
    const data = await engine.call('series_data', args);
    return {...source, data};
  }

  function v2GraphShapes() {
    const shapes = [];
    const xEnd=observedGraphSeries().length>=2?.90:1;
    for(const e of exclusionPayload(false)){if(e.enabled)shapes.push({type:'rect',xref:'x',x0:e.start,x1:e.end,yref:'paper',y0:0,y1:1,fillcolor:'#b45309',opacity:.12,line:{width:0},layer:'below',label:{text:e.reason}});}
    const obs = nullableNumber($('graphObsThreshold')?.value ?? $('obsThreshold').value);
    const model = nullableNumber($('graphModelThreshold')?.value ?? $('modelThreshold').value);
    if ($('showGraphObsThreshold')?.checked !== false && obs !== null) {
      shapes.push({type:'line',xref:'paper',x0:0,x1:xEnd,yref:'y',y0:obs,y1:obs,line:{color:$('threshold1Color').value,width:2,dash:'dash'}});
    }
    if ($('showGraphModelThreshold')?.checked !== false && model !== null) {
      shapes.push({type:'line',xref:'paper',x0:0,x1:xEnd,yref:'y',y0:model,y1:model,line:{color:$('threshold2Color').value,width:2,dash:'dash'}});
    }
    if ($('showEventOverlay').checked) {
      for (const e of state.rainEvents) shapes.push({type:'rect',xref:'x',x0:e.start,x1:e.end,yref:'paper',y0:0,y1:1,fillcolor:$('rainEventColor').value,opacity:.08,line:{width:0},layer:'below'});
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

  function statisticValue(value, unit='') {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return `${fmt(Number(value),3)}${unit ? ` ${unit}` : ''}`;
  }

  function renderGraphStatistics(rows) {
    const target = $('graphStatistics');
    if (!target) return;
    if (!rows.length) { target.innerHTML='<div class="v2-empty">No graph statistics available.</div>'; return; }
    target.innerHTML=`<div class="table-wrap"><table class="data-table v2-stats-table compact"><thead><tr><th>Series</th><th>Unit</th><th>Minimum</th><th>Mean</th><th>Maximum</th></tr></thead><tbody>${rows.map(row=>{const s=row.statistics||{},factor=row.factor||1,scale=v=>v==null?v:Number(v)*factor;return `<tr><td><strong>${esc(row.compact_label||row.role||'Series')}</strong></td><td>${esc(s.unit||'—')}</td><td>${statisticValue(scale(s.minimum))}</td><td>${statisticValue(scale(s.time_weighted_mean??s.mean))}</td><td>${statisticValue(scale(s.maximum))}</td></tr>`;}).join('')}</tbody></table></div>`;
    window.__ICM_WORKBENCH__.lastGraphStatistics=rows;
  }

  async function v2DrawGraph(range=ui.graphRange) {
    if (!state.mapping.observed && !state.mapping.rain) {
      Plotly.purge('timeChart');
      return;
    }
    const generation = ++ui.graphGeneration;
    ui.graphRefreshing = true;
    const pointCounts = {}, statisticRows=[];
    try {
      const observedSources=observedGraphSeries();
      const fdvMode=observedSources.length>=2;
      const quantityColours={depth:$('obsColor').value,flow:'#008b95',velocity:'#ef7d00',level:$('obsColor').value};
      const axisFor=q=>fdvMode?(q==='flow'?'y3':q==='velocity'?'y4':'y'):'y';
      const traces=[];
      const quantities=new Set();

      for(let observedIndex=0;observedIndex<observedSources.length;observedIndex+=1){
        const source=observedSources[observedIndex];
        const obs=await v2SeriesFor(source.key,range);
        if(!obs||generation!==ui.graphGeneration)return;
        const quantity=String(seriesQuantity(obs.item,obs.col)||source.quantity||'').toLowerCase();
        if(quantity)quantities.add(quantity);
        pointCounts[observedIndex===0?'observed':`observed_${quantity||observedIndex+1}`]={raw:obs.data.raw_count,shown:obs.data.display_count,native:obs.data.native_resolution,topology:obs.data.topology_exceeds_budget};
        statisticRows.push({role:'Observed',compact_label:compactGraphRole('Observed',obs.item,obs.col),label:seriesLabel(obs.item,obs.col),statistics:obs.data.statistics});
        traces.push({
          x:obs.data.timestamp,y:obs.data.value,
          name:fdvMode?`Observed ${quantity||obs.col}`:`Observed · ${obs.col}`,
          mode:'lines',connectgaps:false,
          line:{color:quantityColours[quantity]||$('obsColor').value,width:fdvMode?1.45:1.7},
          yaxis:axisFor(quantity),
          hovertemplate:`%{x}<br>${esc(quantity||obs.col)} %{y:.4g}<extra></extra>`,
        });
      }

      let modelIndex = 0;
      for (const key of state.mapping.models) {
        const model = await v2SeriesFor(key, range);
        if (!model || generation !== ui.graphGeneration) return;
        const quantity=String(seriesQuantity(model.item,model.col)||'').toLowerCase();
        if(quantity)quantities.add(quantity);
        pointCounts[`model_${modelIndex+1}`] = {raw:model.data.raw_count,shown:model.data.display_count,native:model.data.native_resolution,topology:model.data.topology_exceeds_budget};
        statisticRows.push({role:`Model ${modelIndex+1}`,compact_label:compactGraphRole(`Model ${modelIndex+1}`,model.item,model.col),label:seriesLabel(model.item,model.col),statistics:model.data.statistics});
        traces.push({x:model.data.timestamp,y:model.data.value,name:`Model ${modelIndex+1} · ${model.col}`,meta:model.item.displayName,mode:'lines',connectgaps:false,line:{color:state.modelColours[key]||palette[modelIndex%palette.length],width:1.35},yaxis:axisFor(quantity)});
        modelIndex += 1;
      }

      let rainValues = [];
      let hasRain = false;
      if (state.mapping.rain) {
        const rain = await v2SeriesFor(state.mapping.rain, range);
        if (rain && generation === ui.graphGeneration) {
          hasRain = true;
          const factor = Number($('rainFactor').value || 1);
          rainValues = rain.data.value.map(v => v == null ? null : Number(v) * factor);
          pointCounts.rainfall = {raw:rain.data.raw_count,shown:rain.data.display_count,native:rain.data.native_resolution,topology:rain.data.topology_exceeds_budget};
          statisticRows.push({role:'Rainfall',compact_label:compactGraphRole('Rainfall',rain.item,rain.col),label:seriesLabel(rain.item,rain.col),statistics:rain.data.statistics,factor});
          traces.push({x:rain.data.timestamp,y:rainValues,name:'Rainfall',type:'bar',yaxis:'y2',marker:{color:rain.data.timestamp.map(t=>inEvent(t)?$('rainEventColor').value:$('rainColor').value)},opacity:.72,hovertemplate:'%{x}<br>Rainfall %{y:.3f}<extra></extra>'});
        }
      }

      const observedThreshold = nullableNumber($('graphObsThreshold')?.value ?? $('obsThreshold').value);
      const modelThreshold = nullableNumber($('graphModelThreshold')?.value ?? $('modelThreshold').value);
      if ($('showGraphObsThreshold')?.checked !== false && observedThreshold !== null) {
        traces.push({x:[null],y:[null],mode:'lines',name:$('threshold1Label').value||'Observed / EDM spill threshold',hoverinfo:'skip',showlegend:true,line:{color:$('threshold1Color').value,width:2,dash:'dash'}});
      }
      if ($('showGraphModelThreshold')?.checked !== false && modelThreshold !== null) {
        traces.push({x:[null],y:[null],mode:'lines',name:$('threshold2Label').value||'Model spill threshold',hoverinfo:'skip',showlegend:true,line:{color:$('threshold2Color').value,width:2,dash:'dash'}});
      }

      const extraHydraulicAxes=fdvMode&&(quantities.has('flow')||quantities.has('velocity'));
      const xaxis = {title:'Time',autorange:!range,showgrid:false,domain:extraHydraulicAxes?[0,.90]:[0,1]};
      if (range?.length === 2) {
        xaxis.range = range;
        xaxis.autorange = false;
      }
      const hydraulicDomain=hasRain?[0,.70]:[0,1];
      const depthUnit=observedSources.map(s=>seriesUnit(s.item,s.col)).find((_,i)=>String(observedSources[i]?.quantity||seriesQuantity(observedSources[i]?.item,observedSources[i]?.col)||'').toLowerCase()==='depth')||'m';
      const layout = {
        template:'plotly_white',
        height:690,
        margin:{l:72,r:extraHydraulicAxes?138:68,t:112,b:58},
        hovermode:'x unified',
        legend:{orientation:'h',y:1.16,x:0,xanchor:'left',yanchor:'bottom',font:{size:11},traceorder:'normal',itemwidth:38},
        xaxis,
        yaxis:{title:fdvMode?`Depth (${depthUnit})`:(observedSources[0]?.col||'Value'),domain:hydraulicDomain,anchor:'x',showgrid:true,gridcolor:'#e8eef3',zerolinecolor:'#d9e2ea',automargin:true},
        shapes:v2GraphShapes(),
        annotations:v2GraphAnnotations(),
        uirevision:'icm-main-v3',
        bargap:0,
      };
      if(fdvMode&&quantities.has('flow'))layout.yaxis3={title:'Flow (m³/s)',domain:hydraulicDomain,overlaying:'y',side:'right',anchor:'x',showgrid:false,zeroline:false,automargin:true};
      if(fdvMode&&quantities.has('velocity'))layout.yaxis4={title:'Velocity (m/s)',domain:hydraulicDomain,overlaying:'y',side:'right',anchor:'free',position:.985,showgrid:false,zeroline:false,automargin:true};
      if (hasRain) {
        layout.yaxis2 = {title:'Rainfall',domain:[.79,1],anchor:'x',side:'right',range:[rainfallMaximum(rainValues),0],showgrid:false,zeroline:false,automargin:true};
      }
      await Plotly.react('timeChart', traces, layout, {responsive:true,displaylogo:false,scrollZoom:true});
      wireAdaptiveZoom();
      if (generation !== ui.graphGeneration) return;
      ui.graphRange = range;
      window.__ICM_WORKBENCH__.lastGraphPointCounts = pointCounts;
      window.__ICM_WORKBENCH__.lastGraphRange = range;
      window.__ICM_WORKBENCH__.lastGraphMode = fdvMode?'fdv-multi-variable':'single-series';
      renderGraphStatistics(statisticRows);
      const density = $('graphDensity');
      if (density) {
        const native = Object.values(pointCounts).every(x => x.native);
        const total = Object.values(pointCounts).reduce((sum,x)=>sum+(x.shown||0),0);
        density.innerHTML = `<strong>${native?'Native timestep detail':'Adaptive display'} · ${total.toLocaleString()} plotted points</strong>${native?'Visible window is showing every available source timestep.':`Zoom further for native detail; zoomed traces may use up to ${ZOOM_DISPLAY_POINTS.toLocaleString()} points each.`}`;
      }
    } finally {
      ui.graphRefreshing = false;
    }
  }

  function relayoutRange(event) {
    if (!event) return undefined;
    if (event['xaxis.autorange'] === true) return null;
    if (Array.isArray(event['xaxis.range']) && event['xaxis.range'].length === 2) return event['xaxis.range'];
    if (event['xaxis.range[0]'] !== undefined && event['xaxis.range[1]'] !== undefined) return [event['xaxis.range[0]'],event['xaxis.range[1]']];
    return undefined;
  }

  function wireAdaptiveZoom() {
    const chart = $('timeChart');
    if (!chart || chart.__v2AdaptiveZoom) return;
    chart.__v2AdaptiveZoom = true;
    chart.on('plotly_relayout', event => {
      const range = relayoutRange(event);
      if (range === undefined) return;
      ui.graphRange = range;
      ++ui.graphGeneration;
      clearTimeout(ui.graphTimer);
      ui.graphTimer = setTimeout(() => void v2DrawGraph(range), 220);
    });
  }

  function scheduleGraphRedraw(delay=120) {
    if ((!state.mapping.observed && !state.mapping.rain) || !$('timeChart')) return;
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

  function annualComparison() {
    const observed = state.spills.observed;
    const model = state.spills.model;
    if (!observed || !model) return '<div class="v2-empty">A model result is optional. Select and calculate a model only when an observed/model comparison is required.</div>';
    const om = new Map(annualRows(observed).map(x=>[Number(x.year),x]));
    const mm = new Map(annualRows(model).map(x=>[Number(x.year),x]));
    const years = [...new Set([...om.keys(),...mm.keys()])].sort((a,b)=>a-b);
    if (!years.length) return '<div class="v2-empty">No annual spill results.</div>';
    return `<p>Individual assessment domains. Differences are withheld because coverage and masks may differ.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Year</th><th>Observed count</th><th>Model count</th><th>Observed duration h</th><th>Model duration h</th></tr></thead><tbody>${years.map(year=>{const o=om.get(year),m=mm.get(year);return `<tr><td>${year}</td><td>${fmt(o?.spill_count,0)}</td><td>${fmt(m?.spill_count,0)}</td><td>${fmt(o?.duration_hours,2)}</td><td>${fmt(m?.duration_hours,2)}</td></tr>`;}).join('')}</tbody></table></div>`;
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
    window.__ICM_WORKBENCH__.lastSpills = {
      observed:state.spills.observed?{excluded_seconds:state.spills.observed.excluded_seconds,count:state.spills.observed.total_spill_count,yearly:state.spills.observed.yearly_summary}:null,
      modelled:state.spills.model?{excluded_seconds:state.spills.model.excluded_seconds,count:state.spills.model.total_spill_count,yearly:state.spills.model.yearly_summary}:null,
    };
  }

  async function v2RunSpills() {
    const observed = mappingObject(state.mapping.observed);
    const model = mappingObject($('spillModelSelect').value);
    if (!observed && !model) throw new Error('Map an observed series first. A model series is optional.');
    const observedThreshold = $('obsThreshold').value;
    const modelThreshold = $('modelThreshold').value;
    if (observedThreshold === '' && (!model || modelThreshold === '')) throw new Error('Enter at least one spill threshold.');

    const exclusionsFor=(role,key)=>JSON.stringify(exclusionPayload(true,role,key));
    const bounds=analysisBounds();
    const config=JSON.parse(JSON.stringify(workspaceObject()));
    const signature=analysisSignature();
    const gap = Number($('gapInput').value || 900);
    state.spills = {};
    const started = performance.now();

    if (observed && observedThreshold !== '') {
      setOperationStatus('Calculating observed EDM spills…', 'running');
      await nextPaint();
      state.spills.observed = await engine.call('spill_result',{path:observed.item.virtualPath,column:observed.col,threshold:Number(observedThreshold),exclusions_json:exclusionsFor('observed',state.mapping.observed),max_gap_seconds:gap,...bounds});
    }
    if (model && modelThreshold !== '') {
      setOperationStatus('Calculating modelled spills…', 'running');
      await nextPaint();
      state.spills.model = await engine.call('spill_result',{path:model.item.virtualPath,column:model.col,threshold:Number(modelThreshold),exclusions_json:exclusionsFor('model',$('spillModelSelect').value),max_gap_seconds:gap,...bounds});
    }
    state.spillSnapshot={config,signature,results:JSON.parse(JSON.stringify(state.spills))};
    renderSpillsV2();
    const elapsed = (performance.now()-started)/1000;
    setOperationStatus(`Completed in ${elapsed.toFixed(1)} s. Yearly 12/24 counts and physical durations are shown below.`, 'done');
  }

  function installHijacks() {
    hijackButton('applyMappingBtn','mappingStatus','Applying…',v2ApplyMapping);
    hijackButton('refreshGraphBtn','mappingStatus','Refreshing…',()=>v2DrawGraph(ui.graphRange));
    hijackButton('runSpillsBtn','spillRunStatus','Calculating…',v2RunSpills);

    // Graph-affecting appearance controls in the original runtime are intercepted so
    // they use the new two-band adaptive graph rather than reverting to the old overlay.
    for (const id of ['obsColor','rainColor','rainFactor','rainAxisMax','threshold1Label','threshold1Color','threshold2Label','threshold2Color','showEventOverlay','rainEventColor']) {
      const el = $(id);
      if (!el) continue;
      el.addEventListener('change', event => {
        event.stopImmediatePropagation();
        scheduleGraphRedraw(80);
      }, {capture:true});
    }
  }

  window.ICMGraph = {draw: v2DrawGraph, applyMapping: v2ApplyMapping};
  const exActions=$('addExclusionBtn').parentElement;
  const rangeButton=document.createElement('button');rangeButton.className='btn quiet';rangeButton.textContent='Exclude visible period';rangeButton.onclick=()=>{const range=ui.graphRange;if(!range)return;addExclusionRow({start:modelClock(range[0]),end:modelClock(range[1])});};exActions.appendChild(rangeButton);
  const undoButton=document.createElement('button');undoButton.className='btn quiet';undoButton.textContent='Undo removal';undoButton.onclick=()=>{const row=state.deletedExclusions?.pop();if(row){state.exclusions.push(row);renderExclusions();void drawTimeChart();}};exActions.appendChild(undoButton);
  installSourcePoolControl();
  installGraphControls();
  installSpillStatus();
  configureExistingCopy();
  installHijacks();
})();
