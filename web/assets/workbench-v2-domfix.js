(() => {
  'use strict';

  const byId = id => document.getElementById(id);

  function triggerV2Refresh(delay=0) {
    window.setTimeout(() => {
      const button = byId('refreshGraphBtn');
      if (button && window.__ICM_WORKBENCH__?.status === 'ready') button.click();
    }, delay);
  }

  function mountGraphToolbar() {
    if (byId('v2GraphToolbar')) return;
    const panel = document.querySelector('#tab-graph .panel');
    const details = panel?.querySelector('details.subpanel');
    if (!panel || !details) return;

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
      <div class="v2-density" id="graphDensity"><strong>Adaptive display</strong>Full view uses up to 5,000 points/trace. Zoom in for native timestep detail.</div>`;
    panel.insertBefore(toolbar, details);

    const pairs = [['graphObsThreshold','obsThreshold'],['graphModelThreshold','modelThreshold']];
    for (const [graphId, spillId] of pairs) {
      const graph = byId(graphId);
      const spill = byId(spillId);
      if (spill?.value) graph.value = spill.value;
      graph.addEventListener('input', () => {
        if (spill) spill.value = graph.value;
        triggerV2Refresh(90);
      });
      spill?.addEventListener('input', () => {
        graph.value = spill.value;
      });
    }
    for (const id of ['showGraphObsThreshold','showGraphModelThreshold']) {
      byId(id)?.addEventListener('change', () => triggerV2Refresh(50));
    }
  }

  function mountSpillStatus() {
    if (byId('spillRunStatus')) return;
    const thresholdGrid = document.querySelector('#tab-spills .mapping-grid.compact');
    if (!thresholdGrid) return;
    const status = document.createElement('div');
    status.id = 'spillRunStatus';
    status.className = 'v2-operation-status';
    status.textContent = 'Set one or both thresholds, then calculate. A comparison model is optional.';
    thresholdGrid.insertAdjacentElement('afterend', status);
  }

  function observedRangeFromGraph() {
    const chart = byId('timeChart');
    const observed = chart?.data?.find(trace => String(trace.name || '').startsWith('Observed'));
    if (!observed?.x?.length) return null;
    const first = observed.x[0];
    const last = observed.x[observed.x.length - 1];
    return first && last && first !== last ? [first, last] : null;
  }

  function anchorToObservedPeriod() {
    const ui = window.__ICM_WORKBENCH__?.uiV2;
    if (!ui || ui.graphRange) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const chart = byId('timeChart');
      const range = observedRangeFromGraph();
      if (chart && range) {
        window.clearInterval(timer);
        Plotly.relayout(chart, {'xaxis.range[0]': range[0], 'xaxis.range[1]': range[1]});
      } else if (attempts > 20) {
        window.clearInterval(timer);
      }
    }, 100);
  }

  function observeText(id, handler) {
    const element = byId(id);
    if (!element) return;
    let previous = element.textContent;
    new MutationObserver(() => {
      const current = element.textContent;
      if (current === previous) return;
      previous = current;
      handler(current);
    }).observe(element, {childList:true,subtree:true,characterData:true});
  }

  mountGraphToolbar();
  mountSpillStatus();

  observeText('mappingStatus', text => {
    if (text.includes('Observed:')) anchorToObservedPeriod();
  });

  // The legacy rainfall-event/workspace handlers can redraw the original graph after
  // they finish. Route the final display back through the adaptive V2 graph so the
  // rainfall band, threshold overlays and visible-range density are retained.
  observeText('rainEventSummary', text => {
    if (text.includes('qualifying events')) triggerV2Refresh(80);
  });
  observeText('workspaceStatus', text => {
    if (/loaded|restored|source fingerprint/i.test(text)) triggerV2Refresh(120);
  });

  window.__ICM_WORKBENCH__.domFix = {mounted:true};
})();
