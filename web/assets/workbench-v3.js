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
      <div id="cumulativeRainTotals"></div>`;
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
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Rainfall file</th><th>Period</th><th>Interval</th><th>Native samples</th><th>Cumulative depth</th><th>Peak intensity</th><th>Mean intensity</th><th>Median intensity</th><th>Wet duration</th><th>Valid support</th><th>Coverage</th><th>Status</th></tr></thead><tbody>${results.map(({item,data}) => {
      const status = data.complete ? 'Complete' : `Partial — ${data.missing_count} missing interval(s)`;
      const period = data.start && data.end ? `${esc(modelClock(data.start))} → ${esc(modelClock(data.end))}` : '—';
      return `<tr><td>${esc(item.displayName)}</td><td>${period}</td><td>${fmt(data.interval_min,2)} min</td><td>${data.raw_count ?? '—'}</td><td><strong>${fmt(data.final_total_mm,3)} mm</strong></td><td>${fmt(data.peak_intensity_mm_h,3)} mm/h</td><td>${fmt(data.mean_intensity_mm_h,3)} mm/h</td><td>${fmt(data.median_intensity_mm_h,3)} mm/h</td><td>${fmt(data.wet_hours,2)} h</td><td>${fmt(data.valid_hours,2)} h</td><td>${data.coverage_fraction==null?'—':fmt(Number(data.coverage_fraction)*100,1)+'%'}</td><td class="${data.complete?'audit-good':'audit-warn'}">${esc(status)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  async function renderCumulativeRainfall(force=false) {
    const chart = $('cumulativeRainChart');
    const summary = $('cumulativeRainSummary');
    const totals = $('cumulativeRainTotals');
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
    const body = $('poolBody');
    if (body) new MutationObserver(() => scheduleCumulativeRainfall(500)).observe(body,{childList:true,subtree:true});
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

  ensureCopyrightFooter();
  exposeThresholdControlsGlobally();
  installCumulativeRainfallPanel();
  wireAutomaticCumulativeRefresh();
})();
