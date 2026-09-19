(() => {
  'use strict';

  const RAIN_DISPLAY_POINTS = 5000;
  const RAIN_COLOURS = ['#1268b3','#2e8b57','#7c4dff','#ef7d00','#c43d6f','#008b95','#7a5c00','#5b6d7e'];
  const v3 = {rainTimer:null,rainGeneration:0,lastRainFactor:null};
  window.__ICM_WORKBENCH__.uiV3 = v3;

  function ensureCopyrightFooter() {
    const footer = document.querySelector('footer');
    if (!footer) return;
    let owner = footer.querySelector('[data-icm-copyright]');
    if (!owner) {
      owner = footer.querySelector('span:first-child') || document.createElement('span');
      owner.dataset.icmCopyright = 'true';
      if (!owner.parentElement) footer.prepend(owner);
    }
    owner.textContent = 'ICM Calibration Workbench — © 2026 Anzar Sajid';
  }

  function exposeThresholdControlsGlobally() {
    const toolbar = document.getElementById('v2GraphToolbar');
    const mapping = document.querySelector('.mapping-panel');
    if (!toolbar || !mapping || !toolbar.closest('#tab-graph')) return;
    toolbar.classList.add('v3-global-thresholds');
    mapping.insertAdjacentElement('afterend', toolbar);
  }

  function installCumulativeRainfallPanel() {
    const panel = document.querySelector('#tab-rain-events .panel');
    const head = panel?.querySelector('.panel-head');
    if (!panel || !head || document.getElementById('cumulativeRainPanel')) return;
    const tab = document.querySelector('.tab[data-tab="rain-events"]');
    if (tab) tab.textContent = 'Rainfall';

    const section = document.createElement('div');
    section.id = 'cumulativeRainPanel';
    section.className = 'subpanel';
    section.innerHTML = `
      <div class="subhead">
        <div>
          <h3>Cumulative rainfall — all .R files</h3>
          <p>Every parsed .R / .R.txt rainfall file in the source pool is plotted automatically. Cumulative depth is integrated from the complete native interval series before chart downsampling.</p>
        </div>
        <button class="btn" id="refreshCumulativeRainBtn" type="button">Refresh cumulative plot</button>
      </div>
      <div id="cumulativeRainSummary" class="pool-summary">No rainfall .R files loaded.</div>
      <div id="cumulativeRainChart" class="chart small"></div>
      <div id="cumulativeRainTotals"></div>
      <h3>Multi-gauge rainfall quality screening</h3>
      <div id="multiGaugeRainSummary" class="pool-summary">Load at least two rainfall gauges for spatial screening.</div>
      <div id="multiGaugeRainTable"></div>`;
    head.insertAdjacentElement('afterend', section);

    $('refreshCumulativeRainBtn').addEventListener('click', event => {
      event.preventDefault();
      void renderCumulativeRainfall(true);
    });
  }

  function rainfallRItems() {
    return [...state.files.values()].filter(item => {
      if (item.status !== 'ready') return false;
      const format = String(item.parsed?.format || '').toLowerCase();
      const name = String(item.file?.name || item.displayName || '').toLowerCase();
      return format === 'rainfall_r_ascii' || /\.r(?:\.txt)?$/i.test(name);
    });
  }

  function rainfallTotalsTable(results) {
    if (!results.length) return '';
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Rainfall file</th><th>Period</th><th>Interval</th><th>Native samples</th><th>Cumulative depth</th><th>Status</th></tr></thead><tbody>${results.map(({item,data}) => {
      const status = data.complete ? 'Complete' : `Partial — ${data.missing_count} missing interval(s)`;
      const period = data.start && data.end ? `${esc(modelClock(data.start))} → ${esc(modelClock(data.end))}` : '—';
      return `<tr><td>${esc(item.displayName)}</td><td>${period}</td><td>${fmt(data.interval_min,2)} min</td><td>${data.raw_count ?? '—'}</td><td><strong>${fmt(data.final_total_mm,3)} mm</strong></td><td class="${data.complete?'audit-good':'audit-warn'}">${esc(status)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function rainfallQualityTable(result) {
    if (!result?.gauges?.length) return '';
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Gauge</th><th>Operational days</th><th>Operational coverage</th><th>Zero-response strikes</th><th>Repeated zero response</th><th>RAG</th></tr></thead><tbody>${result.gauges.map(x=>`<tr><td>${esc(x.gauge)}</td><td>${x.operational_days} / ${x.days_assessed}</td><td>${fmt(x.operational_coverage_percent,1)}%</td><td>${x.zero_response_strikes}</td><td>${x.repeated_zero_response?'Review':'No'}</td><td class="${x.status==='Green'?'audit-good':'audit-warn'}">${esc(x.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function renderCumulativeRainfall(force=false) {
    const chart = $('cumulativeRainChart');
    const summary = $('cumulativeRainSummary');
    const totals = $('cumulativeRainTotals');
    const qaSummary=$('multiGaugeRainSummary'),qaTable=$('multiGaugeRainTable');
    if (!chart || !summary || !totals) return;
    if (!engine.ready) {
      summary.textContent = 'Rainfall engine is still starting…';
      return;
    }
    if (!force && [...state.files.values()].some(item => item.status === 'loading')) {
      scheduleCumulativeRainfall(600);
      return;
    }

    const items = rainfallRItems();
    if (!items.length) {
      Plotly.purge(chart);
      summary.textContent = 'No parsed .R / .R.txt rainfall files are currently loaded.';
      totals.innerHTML = '';
      if(qaSummary)qaSummary.textContent='Load at least two rainfall gauges for spatial screening.';
      if(qaTable)qaTable.innerHTML='';
      window.__ICM_WORKBENCH__.lastCumulativeRainfall = {files:0,traces:0,totals:[]};
      return;
    }

    const generation = ++v3.rainGeneration;
    const factor = Number($('rainFactor')?.value || 1);
    v3.lastRainFactor = factor;
    summary.textContent = `Calculating cumulative rainfall for ${items.length} .R file(s)…`;
    const results = [];
    for (const item of items) {
      const column = (item.parsed?.columns || [])[0];
      if (!column) continue;
      const data = await engine.call('cumulative_rainfall_series', {
        path:item.virtualPath,
        column,
        conversion_factor:factor,
        max_points:RAIN_DISPLAY_POINTS,
      }, 'advanced_bridge');
      if (generation !== v3.rainGeneration) return;
      results.push({item,column,data});
    }

    const traces = results.map(({item,data}, index) => ({
      x:data.timestamp,
      y:data.value,
      name:item.displayName,
      mode:'lines',
      connectgaps:false,
      line:{width:2,color:RAIN_COLOURS[index % RAIN_COLOURS.length]},
      hovertemplate:`%{x}<br>${esc(item.displayName)}<br>Cumulative %{y:.3f} mm<extra></extra>`,
    }));
    await Plotly.react(chart, traces, {
      template:'plotly_white',
      title:{text:'Cumulative rainfall depth by source .R file',font:{size:15}},
      xaxis:{title:'Time',showgrid:false},
      yaxis:{title:'Cumulative rainfall depth (mm)',rangemode:'tozero',gridcolor:'#e8eef3'},
      hovermode:'x unified',
      legend:{orientation:'h',y:1.12,x:0},
      margin:{l:65,r:25,t:70,b:55},
      uirevision:'icm-cumulative-rainfall-v1',
    }, {responsive:true,displaylogo:false,scrollZoom:true});

    const incomplete = results.filter(x => !x.data.complete).length;
    summary.textContent = `${results.length} rainfall .R file(s) plotted · conversion factor ${factor} · cumulative depth uses interval-average intensity × interval duration. ${incomplete ? `${incomplete} trace(s) contain missing rainfall intervals and are flagged partial.` : 'All plotted rainfall intervals are complete.'}`;
    totals.innerHTML = rainfallTotalsTable(results);
    if(qaSummary&&qaTable){
      if(results.length<2){qaSummary.textContent='One rainfall gauge loaded; cross-gauge variability and zero-response screening require at least two.';qaTable.innerHTML='';}
      else{
        const quality=await engine.call('multi_gauge_rainfall_result',{sources_json:JSON.stringify(results.map(({item,column})=>({path:item.virtualPath,column,name:item.displayName}))),conversion_factor:factor},'advanced_bridge');
        qaSummary.textContent=`${quality.gauge_count} gauges assessed · ${quality.non_uniform_day_count} operational day(s) exceed the ${quality.criteria.variability_cv_limit_percent}% spatial CV screen. Repeated zero response is flagged after ${quality.criteria.strikes_required} strike days within ${quality.criteria.rolling_window_days} days; flags require engineering review and do not remove data.`;
        qaTable.innerHTML=rainfallQualityTable(quality);
        window.__ICM_WORKBENCH__.lastRainfallQuality=quality;
      }
    }
    window.__ICM_WORKBENCH__.lastCumulativeRainfall = {
      files:results.length,
      traces:traces.length,
      conversionFactor:factor,
      totals:results.map(({item,data}) => ({file:item.displayName,total_mm:data.final_total_mm,complete:data.complete,missing_count:data.missing_count,raw_count:data.raw_count})),
    };
  }

  function scheduleCumulativeRainfall(delay=350) {
    clearTimeout(v3.rainTimer);
    v3.rainTimer = setTimeout(() => void renderCumulativeRainfall(false), delay);
  }

  function wireAutomaticCumulativeRefresh() {
    window.addEventListener('icm:source-pool-changed', () => scheduleCumulativeRainfall(120));
    document.addEventListener('change', event => {
      if (event.target?.id === 'rainFactor') scheduleCumulativeRainfall(120);
    }, true);
    document.addEventListener('click', event => {
      const tab = event.target?.closest?.('.tab[data-tab="rain-events"]');
      if (tab) scheduleCumulativeRainfall(120);
    }, true);
    const enginePoll = setInterval(() => {
      if (!engine.ready) return;
      clearInterval(enginePoll);
      scheduleCumulativeRainfall(120);
    }, 250);
  }


  function populateProfessionalSurveySelectors() {
    const all = allSeries();
    const definitions = [
      ['surveyDepthSelect', /(^|[^a-z])(depth|level|stage)([^a-z]|$)/i, true],
      ['surveyVelocitySelect', /(velocity|(^|[^a-z])vel([^a-z]|$))/i, true],
      ['surveyFlowSelect', /(flow|discharge)/i, true],
      ['surveyRainSelect', /rain/i, false],
    ];
    for (const [id, matcher, allowNone] of definitions) {
      const select = $(id);
      if (!select) continue;
      const previous = select.value;
      setOptions(select, all, {none:allowNone, preserve:true});
      if (previous && [...select.options].some(o => o.value === previous)) {
        select.value = previous;
        continue;
      }
      if (id === 'surveyRainSelect' && state.mapping.rain && [...select.options].some(o => o.value === state.mapping.rain)) {
        select.value = state.mapping.rain;
        continue;
      }
      const preferred = all.find(s => matcher.test(String(s.label || '') + ' ' + String(s.col || '')));
      if (preferred) select.value = preferred.key;
    }
  }

  function surveyDate(value) {
    if (!value) return '—';
    const text = modelClock(value);
    return text ? esc(text.replace('T',' ').slice(0,16)) : '—';
  }

  function surveyRatio(linked, events) {
    if (linked == null || events == null) return '—';
    return String(linked) + ' / ' + String(events);
  }

  function surveyRagClass(value) {
    return value === 'Green' ? 'audit-good' : (value === 'Red' ? 'audit-bad' : 'audit-warn');
  }

  function surveyMethodHtml(result) {
    const n = result.network || {}, m = result.monitor || {}, c = n.criteria || {}, mc = m.criteria || {};
    const rows = [
      ['Population preset', c.population_above_50k ? '> 50,000' : '≤ 50,000'],
      ['WAPUG intensity', fmt(c.minimum_intensity_mm_h,2) + ' mm/h'],
      ['WAPUG intensity streak', fmt(c.minimum_intensity_duration_min,0) + ' min'],
      ['WAPUG total depth', fmt(c.minimum_depth_mm,2) + ' mm'],
      ['WAPUG minimum event duration', fmt(c.minimum_event_duration_min,0) + ' min'],
      ['Network CV gate', '≤ ' + fmt(c.spatial_cv_limit_percent,0) + '%'],
      ['Operational gauge support', '≥ ' + fmt(c.operational_coverage_percent,0) + '%'],
      ['Minimum operational gauges', String(c.minimum_operational_gauges ?? 2)],
      ['Correlation search', 'positive lag 0–' + fmt(mc.max_lag_hours,0) + ' h; assess wet weeks ≥ ' + fmt(mc.rain_min_mm_for_correlation,1) + ' mm'],
      ['DWF baseline', fmt(mc.baseline_window_days,0) + ' d window; ≥ ' + fmt(mc.minimum_dry_days_for_baseline,0) + ' complete dry days; ' + fmt(mc.adp_hours,1) + ' h antecedent dry period'],
      ['Event linkage', fmt(mc.event_link_window_hours,0) + ' h response window; responsive when ≥ ' + fmt(mc.link_min_events,0) + ' events and ≥ ' + fmt(100 * Number(mc.link_min_fraction || 0),0) + '% linked'],
      ['Gauge fault cutoff', c.apply_fault_cutoff ? 'Applied to subsequent network WAPUG qualification' : 'Evidence only; not applied'],
      ['Source mutation', 'None — source data remain unchanged'],
    ];
    return '<div class="table-wrap"><table class="data-table"><tbody>' +
      rows.map(x => '<tr><th>' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>').join('') +
      '</tbody></table></div>';
  }

  function surveyReportHtml(result) {
    if (!result) return '';
    const n = result.network || {}, m = result.monitor || {};
    const gauges = (n.gauge_summary || []).map(x =>
      '<tr><td>' + esc(x.gauge) + '</td><td>' + fmt(x.operational_coverage_percent,1) + '%</td><td>' +
      (x.event_strike_count ?? 0) + '</td><td>' + (x.daily_strikes ?? 0) + '</td><td>' +
      esc(x.current_dynamic_status || '—') + '</td><td>' + surveyDate(x.suggested_fault_cutoff) + '</td><td>' +
      esc(x.status || '—') + '</td></tr>'
    ).join('');
    const weeks = (m.weeks || []).map(x =>
      '<tr><td>' + surveyDate(x.week_ending).slice(0,10) + '</td><td>' + fmt(x.rain_total_mm,2) + '</td><td>' +
      (x.wapug_storm ? 'Yes' : 'No') + '</td><td>' + fmt(x.depth_correlation,2) + '</td><td>' +
      fmt(x.depth_lag_min,1) + '</td><td>' + surveyRatio(x.depth_linked_events,x.depth_link_events) + '</td><td>' +
      (x.depth_score ?? '—') + '</td><td>' + fmt(x.velocity_correlation,2) + '</td><td>' +
      surveyRatio(x.velocity_linked_events,x.velocity_link_events) + '</td><td>' + (x.velocity_score ?? '—') +
      '</td><td>' + surveyRatio(x.flow_linked_events,x.flow_link_events) + '</td><td>' + (x.flow_score ?? '—') +
      '</td><td>' + esc(x.rag || '—') + '</td><td>' + esc(x.decision_path || '') + '</td></tr>'
    ).join('');
    return '<h2>Professional flow-survey / rainfall assessment</h2>' +
      '<div class="note"><strong>Method.</strong> Mapped monitor rainfall drives rainfall→hydraulic response assessment; all loaded .R files provide network rainfall context. Gauge-fault cutoffs are auditable and source data are never deleted.</div>' +
      '<div class="summary-box"><div><strong>' + (n.gauge_count ?? 0) + '</strong><span>network gauges</span></div><div><strong>' +
      (n.qualified_wapug_event_count ?? 0) + '</strong><span>network-qualified WAPUG events</span></div><div><strong>' +
      (m.dry_baseline_days_available ?? 0) + '</strong><span>complete dry baseline days</span></div></div>' +
      '<h3>Rain-gauge evidence</h3><div class="table-wrap"><table><thead><tr><th>Gauge</th><th>Operational %</th><th>Event strikes</th><th>Daily strikes</th><th>Dynamic status</th><th>Suggested cutoff</th><th>RAG</th></tr></thead><tbody>' +
      gauges + '</tbody></table></div>' +
      '<h3>Weekly monitor response</h3><div class="table-wrap"><table><thead><tr><th>Week</th><th>Rain mm</th><th>WAPUG</th><th>D corr</th><th>D lag</th><th>D linked</th><th>D score</th><th>V corr</th><th>V linked</th><th>V score</th><th>Q linked</th><th>Q score</th><th>RAG</th><th>Decision</th></tr></thead><tbody>' +
      weeks + '</tbody></table></div>' + surveyMethodHtml(result);
  }

  function renderProfessionalSurvey(result) {
    const n = result.network || {}, m = result.monitor || {}, c = n.criteria || {};
    $('professionalSurveySummary').innerHTML =
      '<div class="summary-box survey-summary">' +
      '<div><strong>' + (n.gauge_count ?? 0) + '</strong><span>network rainfall gauges</span></div>' +
      '<div><strong>' + (n.qualified_wapug_event_count ?? 0) + '</strong><span>network-qualified WAPUG events</span></div>' +
      '<div><strong>' + (n.non_uniform_day_count ?? 0) + '</strong><span>days above spatial CV screen</span></div>' +
      '<div><strong>' + (n.dry_low_rain_days ?? 0) + '</strong><span>dry / low-rain flagged days</span></div>' +
      '<div><strong>' + ((m.weeks || []).length) + '</strong><span>monitor weeks assessed</span></div>' +
      '<div><strong>' + (m.dry_baseline_days_available ?? 0) + '</strong><span>complete dry baseline days</span></div>' +
      '</div>' +
      '<div class="privacy-note"><strong>Applied preset:</strong> ' + (c.population_above_50k ? '&gt;50k' : '≤50k') +
      ' catchment · ≥' + fmt(c.minimum_intensity_mm_h,1) + ' mm/h for ' + fmt(c.minimum_intensity_duration_min,0) +
      ' min · ≥' + fmt(c.minimum_depth_mm,1) + ' mm · ≥' + fmt(c.minimum_event_duration_min,0) +
      ' min event duration · network CV ≤' + fmt(c.spatial_cv_limit_percent,0) + '% with ≥' +
      String(c.minimum_operational_gauges ?? 2) + ' operational gauges.</div>';

    $('professionalGaugeBody').innerHTML = (n.gauge_summary || []).map(x =>
      '<tr><td>' + esc(x.gauge) + '</td><td>' + fmt(x.operational_coverage_percent,1) + '%</td><td>' +
      (x.event_strike_count ?? 0) + '</td><td>' + (x.daily_strikes ?? 0) + '</td><td>' +
      esc(x.current_dynamic_status || '—') + '</td><td>' + surveyDate(x.first_fault_day) + '</td><td>' +
      surveyDate(x.recovery_day) + '</td><td>' + surveyDate(x.suggested_fault_cutoff) + '</td><td class="' +
      surveyRagClass(x.status) + '">' + esc(x.status || '—') + '</td></tr>'
    ).join('');

    $('professionalRainEventBody').innerHTML = (n.candidate_wapug_events || []).map(x =>
      '<tr><td>' + x.event + '</td><td>' + surveyDate(x.start) + '</td><td>' + surveyDate(x.end) + '</td><td>' +
      fmt(x.duration_min,1) + '</td><td>' + x.operational_gauges + '</td><td>' + fmt(x.mean_depth_mm,2) +
      '</td><td>' + fmt(x.spatial_cv_percent,1) + '</td><td class="' +
      (x.qualifies_network_wapug ? 'audit-good' : 'audit-warn') + '">' +
      (x.qualifies_network_wapug ? 'Yes' : 'No') + '</td></tr>'
    ).join('');

    $('professionalWeeklyBody').innerHTML = (m.weeks || []).map(x =>
      '<tr><td>' + surveyDate(x.week_ending).slice(0,10) + '</td><td>' + fmt(x.rain_total_mm,2) + '</td><td>' +
      (x.wapug_storm ? 'Yes' : 'No') + '</td><td>' + (x.iw_suitability ? 'Yes' : 'No') + '</td><td>' +
      fmt(x.depth_coverage_percent,1) + '</td><td>' + fmt(x.depth_correlation,2) + '</td><td>' +
      fmt(x.depth_lag_min,1) + '</td><td>' + surveyRatio(x.depth_linked_events,x.depth_link_events) + '</td><td>' +
      (x.depth_score ?? '—') + '</td><td>' + fmt(x.velocity_correlation,2) + '</td><td>' +
      fmt(x.velocity_lag_min,1) + '</td><td>' + surveyRatio(x.velocity_linked_events,x.velocity_link_events) + '</td><td>' +
      (x.velocity_score ?? '—') + '</td><td>' + surveyRatio(x.flow_linked_events,x.flow_link_events) + '</td><td>' +
      (x.flow_score ?? '—') + '</td><td class="' + surveyRagClass(x.rag) + '">' + esc(x.rag || '—') +
      '</td><td>' + esc(x.decision_path || '') + '</td></tr>'
    ).join('');

    $('professionalSurveyMethod').innerHTML = surveyMethodHtml(result);
    $('professionalSurveyStatus').textContent =
      'Assessment complete · mapped monitor rainfall used for response analysis · ' +
      (n.gauge_count ?? 0) + ' rainfall gauge(s) used for network context · raw sources unchanged.';
    window.__ICM_WORKBENCH__.lastProfessionalSurvey = result;
    window.__ICM_WORKBENCH__.professionalSurveyReportHtml = surveyReportHtml(result);
  }

  async function runProfessionalSurvey() {
    const button = $('runProfessionalSurveyBtn');
    if (!engine.ready) throw new Error('Reference Python engine is still starting.');
    populateProfessionalSurveySelectors();
    let rainKey = $('surveyRainSelect').value;
    if (!rainKey && state.mapping.rain) {
      rainKey = state.mapping.rain;
      $('surveyRainSelect').value = rainKey;
    }
    const depth = mappingObject($('surveyDepthSelect').value);
    const velocity = mappingObject($('surveyVelocitySelect').value);
    const flow = mappingObject($('surveyFlowSelect').value);
    const rain = mappingObject(rainKey);
    if (!depth && !velocity && !flow) throw new Error('Select at least one hydraulic FDV channel.');
    if (!rain) throw new Error('Select the monitor-associated rainfall gauge.');

    const networkSources = rainfallRItems().map(item => ({
      path:item.virtualPath,
      column:(item.parsed?.columns || [])[0],
      name:item.displayName,
    })).filter(x => x.column);

    const args = {
      depth_path:depth?.item.virtualPath || null,
      depth_col:depth?.col || null,
      velocity_path:velocity?.item.virtualPath || null,
      velocity_col:velocity?.col || null,
      flow_path:flow?.item.virtualPath || null,
      flow_col:flow?.col || null,
      rain_path:rain.item.virtualPath,
      rain_col:rain.col,
      network_sources_json:JSON.stringify(networkSources),
      population_above_50k:$('surveyPopulation').value === 'over50',
      apply_fault_cutoff:Boolean($('surveyApplyFaultCutoff').checked),
      rain_factor:Number($('rainFactor')?.value || 1),
      depth_unit_override:$('surveyDepthUnit').value || null,
      velocity_unit_override:$('surveyVelocityUnit').value || null,
      flow_unit_override:$('surveyFlowUnit').value || null,
      exclusions_json:JSON.stringify(exclusionPayload(true,'observed')),
      hydraulic_exclusions_json:JSON.stringify(exclusionPayload(true,'observed')),
      rainfall_exclusions_json:JSON.stringify(exclusionPayload(true,'rainfall')),
      start:modelClock($('analysisStart')?.value) || null,
      end:modelClock($('analysisEnd')?.value) || null,
      max_gap_seconds:Number($('gapInput')?.value || 900),
    };
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Assessing…';
    $('professionalSurveyStatus').textContent = 'Running support-aware network rainfall and weekly monitor assessment…';
    try {
      const result = await engine.call('professional_flow_survey_result', args, 'advanced_bridge');
      renderProfessionalSurvey(result);
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function wireProfessionalSurvey() {
    populateProfessionalSurveySelectors();
    const button = $('runProfessionalSurveyBtn');
    if (button) button.addEventListener('click', event => {
      event.preventDefault();
      guarded('professionalSurveyStatus', runProfessionalSurvey);
    });
    window.addEventListener('icm:source-pool-changed', () => {
      populateProfessionalSurveySelectors();
      const hadResult=Boolean(window.__ICM_WORKBENCH__.lastProfessionalSurvey);
      window.__ICM_WORKBENCH__.lastProfessionalSurvey = null;
      window.__ICM_WORKBENCH__.professionalSurveyReportHtml = '';
      if (hadResult && $('professionalSurveyStatus')) {
        $('professionalSurveyStatus').textContent = 'Source pool changed. Re-run the professional assessment before relying on or exporting these findings.';
      }
    });
    document.addEventListener('click', event => {
      if (event.target?.closest?.('.tab[data-tab="data-health"]')) {
        setTimeout(populateProfessionalSurveySelectors, 0);
      }
    }, true);
    document.addEventListener('change', event => {
      const id = event.target?.id || '';
      if (['surveyDepthSelect','surveyVelocitySelect','surveyFlowSelect','surveyRainSelect','surveyPopulation','surveyApplyFaultCutoff','surveyDepthUnit','surveyVelocityUnit','surveyFlowUnit','rainFactor','analysisStart','analysisEnd','gapInput'].includes(id)) {
        window.__ICM_WORKBENCH__.lastProfessionalSurvey = null;
        window.__ICM_WORKBENCH__.professionalSurveyReportHtml = '';
        if ($('professionalSurveyStatus')) $('professionalSurveyStatus').textContent = 'Assessment inputs changed. Re-run the professional assessment before relying on or exporting these findings.';
      }
    }, true);
  }

  ensureCopyrightFooter();
  exposeThresholdControlsGlobally();
  installCumulativeRainfallPanel();
  wireAutomaticCumulativeRefresh();
  wireProfessionalSurvey();
})();
