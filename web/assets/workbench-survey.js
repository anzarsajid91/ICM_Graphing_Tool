(() => {
  'use strict';

  const survey = {
    association: null,
    associationSource: null,
    batch: null,
    batchSignature: null,
    balance: null,
    balanceSignature: null,
    generation: 0,
  };
  window.__ICM_WORKBENCH__.survey = survey;

  const token = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const basename = value => String(value || '').split(/[\\/]/).pop() || '';
  const stem = value => basename(value).replace(/\.fdv(?:\.txt)?$/i, '').replace(/\.r(?:\.txt)?$/i, '').replace(/\.xlsx$/i, '');
  const isAssociationFile = file => /^fm_rg_assoc(?:\.[^.]+)?\.xlsx$/i.test(file && file.name || '') || /^fm_rg_assoc\.xlsx$/i.test(file && file.name || '');
  const ragClass = value => 'rag-' + String(value || 'Grey').toLowerCase();
  const boolMark = value => value === true ? 'Pass' : value === false ? 'Fail' : '—';
  const ragRank = { Grey:0, Green:1, Amber:2, Red:3 };

  function monitorRagMap(result) {
    const map = new Map();
    const apply = (name, rag) => {
      if (!name || !(rag in ragRank)) return;
      const current = map.get(name) || 'Grey';
      if (ragRank[rag] > ragRank[current]) map.set(name, rag);
    };
    for (const row of result && result.rows || []) {
      apply(String(row.downstream_monitor || ''), String(row.rag || 'Grey'));
      for (const evidence of row.qa_evidence || []) apply(String(evidence.monitor || ''), String(evidence.rag || 'Grey'));
    }
    return map;
  }

  function surveySchematicHtml(result) {
    const records = survey.association && survey.association.records || [];
    if (!records.length) return '<div class="v2-empty">Load fm_rg_assoc.xlsx to generate the monitor connectivity schematic.</div>';
    const nodes = new Map();
    for (const record of records) {
      nodes.set(record.monitor, {...record, upstream:[...(record.upstream || [])]});
      for (const upstream of record.upstream || []) if (!nodes.has(upstream)) nodes.set(upstream, {monitor:upstream, upstream:[], inferred:true});
    }
    const levels = new Map([...nodes.keys()].map(name => [name, 0]));
    for (let pass=0; pass<nodes.size+2; pass+=1) {
      let changed=false;
      for (const record of records) {
        const upstream=record.upstream||[];
        const next=upstream.length?Math.max(...upstream.map(name=>levels.get(name)||0))+1:0;
        if (next>(levels.get(record.monitor)||0)) { levels.set(record.monitor,next); changed=true; }
      }
      if(!changed)break;
    }
    const maxLevel=Math.max(0,...levels.values());
    const groups=new Map();
    for(const [name,level] of levels){if(!groups.has(level))groups.set(level,[]);groups.get(level).push(name);}
    for(const names of groups.values())names.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const maxRows=Math.max(1,...[...groups.values()].map(x=>x.length));
    const height=Math.max(210,maxRows*102+70), width=1000;
    const positions=new Map();
    for(const [level,names] of groups){
      const x=maxLevel?90+(820*level/maxLevel):500;
      names.forEach((name,index)=>positions.set(name,{x,y:70+(height-120)*(index+1)/(names.length+1)}));
    }
    const status=monitorRagMap(result);
    const colours={
      Green:{fill:'#e8f5e9',stroke:'#2e7d32',dot:'#2e7d32'},
      Amber:{fill:'#fff8e1',stroke:'#c28b00',dot:'#c28b00'},
      Red:{fill:'#ffebee',stroke:'#c62828',dot:'#c62828'},
      Grey:{fill:'#f1f4f6',stroke:'#82909b',dot:'#82909b'},
    };
    const edges=[];
    for(const record of records){
      const target=positions.get(record.monitor); if(!target)continue;
      for(const upstream of record.upstream||[]){
        const source=positions.get(upstream); if(!source)continue;
        const x1=source.x+76,x2=target.x-76,mid=(x1+x2)/2;
        edges.push('<path class="schematic-pipe-outer" d="M '+x1+' '+source.y+' C '+mid+' '+source.y+', '+mid+' '+target.y+', '+x2+' '+target.y+'"></path>'+
          '<path class="schematic-pipe-inner" d="M '+x1+' '+source.y+' C '+mid+' '+source.y+', '+mid+' '+target.y+', '+x2+' '+target.y+'" marker-end="url(#flowArrow)"></path>');
      }
    }
    const nodeSvg=[];
    for(const [name,node] of nodes){
      const p=positions.get(name),rag=status.get(name)||'Grey',colour=colours[rag]||colours.Grey;
      const meta=[];
      if(node.rain_gauge)meta.push(node.rain_gauge);
      if(node.diameter_mm!=null)meta.push(fmt(node.diameter_mm,0)+' mm');
      nodeSvg.push('<g class="schematic-monitor" transform="translate('+(p.x-74)+' '+(p.y-30)+')">'+
        '<title>'+esc(name)+' · '+esc(rag)+' · '+esc(meta.join(' · ')||'association node')+'</title>'+
        '<rect width="148" height="60" rx="13" fill="'+colour.fill+'" stroke="'+colour.stroke+'" stroke-width="2"></rect>'+
        '<circle cx="18" cy="19" r="7" fill="'+colour.dot+'"></circle>'+
        '<text x="31" y="23" class="schematic-monitor-name">'+esc(name)+'</text>'+
        '<text x="18" y="44" class="schematic-monitor-meta">'+esc(meta.join(' · ')||'flow monitor')+'</text></g>');
    }
    return '<div class="survey-schematic"><div class="survey-schematic-head"><div><strong>Association schematic</strong><span>Connectivity from fm_rg_assoc.xlsx; layout is schematic, not geographic.</span></div>'+
      '<div class="schematic-legend"><span class="rag-green">Green</span><span class="rag-amber">Amber</span><span class="rag-red">Red</span><span class="rag-grey">Not assessed</span></div></div>'+
      '<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Flow monitor association schematic"><defs><marker id="flowArrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#66879d"></path></marker></defs>'+
      edges.join('')+nodeSvg.join('')+'</svg><div class="schematic-note">Node colour shows the worst available RAG evidence over the current assessed period; Grey means no current result.</div></div>';
  }

  function renderSurveySchematic(result=survey.balance) {
    const target=document.getElementById('surveyNetworkSchematic');
    if(target)target.innerHTML=surveySchematicHtml(result);
  }

  function simplifyNavigation() {
    // The Precision Workbench owns all user-facing navigation. Keep the legacy
    // tab strip intact only as an internal compatibility surface for existing
    // panel switching; do not rename, reorder, remove, or relocate routes here.
    // This avoids two independent navigation systems mutating the same DOM.
    const nav = document.querySelector('nav.tabs');
    if (!nav) return;
    const workflow = {
      graph: {
        label: 'Data / Time Series',
        description: 'Map source channels and review observed, modelled and rainfall time series before moving into engineering diagnostics.',
        tools: ['Source mapping', 'Time-series graph', 'Threshold overlays', 'Graph statistics'],
      },
      spills: {
        label: 'Spills',
        description: 'Assess observed/EDM and model spill behaviour with explicit validity, exclusions and reporting periods.',
        tools: ['12/24 counting', 'Duration / volume', 'Exclusions', 'Storage Assessment'],
      },
      'data-health': {
        label: 'Flow Survey · FDV Check',
        description: 'Assess flow-survey completeness, response and network context using the survey association workbook where supplied.',
        tools: ['fm_rg_assoc', 'Data health', 'FSAT Event Response', 'Flow continuity / volume balance'],
      },
      'rain-events': {
        label: 'Flow Survey · Rainfall Check',
        description: 'Review rainfall quality and identify wet-weather events and their hydraulic response.',
        tools: ['Gauge assessment', 'WAPUG / manual events', 'Event bands', 'Hydraulic response'],
      },
      compare: {
        label: 'Graphs',
        description: 'Compare observed and modelled hydraulics over a controlled period and investigate where the model differs.',
        tools: ['Pairs & calibration metrics', 'Residuals', 'Cumulative / exceedance', 'Depth & rating diagnostics'],
      },
      storage: {
        label: 'Spills · Storage Assessment',
        description: 'Review support-aware storage screening and modelled spill-volume evidence.',
        tools: ['Level threshold', 'Overflow volume', 'Ranked blocks', 'Monthly outputs'],
      },
      workspace: {
        label: 'Reports',
        description: 'Produce reproducible engineering outputs and preserve workspace/provenance context.',
        tools: ['Report Generation', 'Workspace persistence', 'Source provenance', 'Audit appendix'],
      },
    };
    let guide = document.getElementById('workflowGuide');
    if (!guide) {
      guide = document.createElement('section');
      guide.id = 'workflowGuide';
      guide.className = 'workflow-guide';
      guide.setAttribute('aria-live', 'polite');
      nav.insertAdjacentElement('afterend', guide);
    }
    const renderWorkflow = name => {
      const item = workflow[name] || workflow.graph;
      guide.dataset.tab = name || 'graph';
      guide.innerHTML =
        '<div class="workflow-guide-head"><strong id="workflowGuideTitle">Workflow</strong><span class="workflow-current">' + esc(item.label) + '</span></div>' +
        '<div class="workflow-guide-body"><p>' + esc(item.description) + '</p><div class="workflow-tools" aria-label="' + esc(item.label) + ' tools">' +
        item.tools.map(tool => '<span>' + esc(tool) + '</span>').join('') + '</div></div>';
    };
    renderWorkflow(nav.querySelector('.tab.active')?.dataset.tab || 'graph');
    nav.addEventListener('click', event => {
      const button = event.target.closest('.tab[data-tab]');
      if (button) renderWorkflow(button.dataset.tab);
    });
  }

  function installSharedAnalysisControls() {
    const mapping = document.querySelector('.mapping-panel');
    const start = document.getElementById('analysisStart');
    const end = document.getElementById('analysisEnd');
    if (!mapping || !start || !end || document.getElementById('sharedAnalysisPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'sharedAnalysisPanel';
    panel.className = 'panel shared-analysis-panel';
    panel.innerHTML =
      '<div class="panel-head"><div><h2>3. Analysis period</h2><p>One shared period for Survey, Verification and derived engineering calculations. Leave blank to use the full available source domain.</p></div></div>' +
      '<div id="sharedAnalysisInputs" class="mapping-grid compact-wide"></div>' +
      '<div id="sharedAnalysisActions" class="actions left"></div>';
    mapping.insertAdjacentElement('afterend', panel);
    const grid = document.getElementById('sharedAnalysisInputs');
    grid.appendChild(start.closest('label'));
    grid.appendChild(end.closest('label'));
    const actions = document.getElementById('sharedAnalysisActions');
    for (const id of ['useZoomPeriodBtn', 'clearPeriodBtn']) {
      const button = document.getElementById(id);
      if (button) actions.appendChild(button);
    }
  }

  function installSurveyPanels() {
    const panel = document.querySelector('#tab-data-health .panel');
    const head = panel && panel.querySelector('.panel-head');
    if (!panel || !head || document.getElementById('surveyAssociationPanel')) return;

    const association = document.createElement('div');
    association.id = 'surveyAssociationPanel';
    association.className = 'subpanel survey-config-panel';
    association.innerHTML =
      '<div class="subhead"><div><h3>Survey configuration — fm_rg_assoc.xlsx</h3>' +
      '<p>The association workbook is authoritative for monitor → rain gauge, pipe diameter and upstream-flow relationships. Conflicts inferred from FDV/source metadata are shown but do not override the workbook.</p></div>' +
      '<div class="actions"><button class="btn" id="chooseAssocBtn" type="button">Load fm_rg_assoc.xlsx</button>' +
      '<input id="assocFileInput" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></div></div>' +
      '<div id="surveyAssociationStatus" class="pool-summary">No association workbook loaded. You can load it directly or include it in the selected survey folder.</div>' +
      '<div id="surveyAssociationSummary"></div><div id="surveyAssociationTable"></div>';
    head.insertAdjacentElement('afterend', association);

    const full = document.createElement('div');
    full.id = 'completeSurveyPanel';
    full.className = 'subpanel';
    full.innerHTML =
      '<div class="subhead"><div><h3>Complete survey assessment</h3>' +
      '<p>Runs the mapped network rainfall qualification and FSAT-derived weekly monitor assessment across the survey, then applies the workbook diameter to Event Response criteria.</p></div>' +
      '<button class="btn" id="runCompleteSurveyBtn" type="button">Run complete survey assessment</button></div>' +
      '<div class="survey-control-grid">' +
      '<label>Volume-balance Amber tolerance (%)<input id="surveyBalanceTolerance" type="number" min="0" max="50" step="1" value="10"></label>' +
      '<div class="survey-control-note">Analysis start/end and maximum gap use the shared workbench controls. Exclusions remain scoped: Observed / EDM applies to survey hydraulics; Rainfall applies to .R data. Antecedent source data remains available to Event Response diagnostics.</div></div>' +
      '<div id="completeSurveyStatus" class="pool-summary">Load survey files and fm_rg_assoc.xlsx to begin.</div>' +
      '<div id="completeSurveySummary"></div><div id="completeSurveyMonitors"></div>' +
      '<h3>FSAT Event Response</h3><div id="surveyEventResponse"></div>';
    association.insertAdjacentElement('afterend', full);

    const balance = document.createElement('div');
    balance.id = 'surveyBalancePanel';
    balance.className = 'subpanel';
    balance.innerHTML =
      '<div class="subhead"><div><h3>Flow continuity / volume-balance diagnostic</h3>' +
      '<p>Preserves the carried-forward FSAT weekly W-SUN OK/Not OK result and adds support-aware RAG screening. This is a diagnostic, not a closed-system mass balance: lateral/unmonitored inflows, storage and timing effects remain possible.</p></div>' +
      '<button class="btn" id="runSurveyBalanceBtn" type="button">Recalculate volume balance</button></div>' +
      '<div id="surveyNetworkSchematic"></div><div id="surveyBalanceSummary"></div><div id="surveyBalanceTable"></div>';
    full.insertAdjacentElement('afterend', balance);

    document.getElementById('chooseAssocBtn').addEventListener('click', () => document.getElementById('assocFileInput').click());
    document.getElementById('assocFileInput').addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if (file) guarded('surveyAssociationStatus', () => loadAssociationWorkbook(file));
    });
    document.getElementById('runCompleteSurveyBtn').addEventListener('click', event => {
      event.preventDefault();
      guarded('completeSurveyStatus', runCompleteSurvey);
    });
    document.getElementById('runSurveyBalanceBtn').addEventListener('click', event => {
      event.preventDefault();
      guarded('surveyBalanceSummary', runSurveyBalance);
    });
  }

  function workbookCandidate() {
    if (typeof XLSX === 'undefined') throw new Error('Excel reader did not load. Reload with network access to the pinned SheetJS library.');
  }

  function scoreHeader(row) {
    const cells = (row || []).map(token);
    let score = 0;
    if (cells.some(x => ['fm', 'fdv', 'fdvname', 'monitor', 'monitorname', 'flowmonitor'].includes(x))) score += 3;
    if (cells.some(x => x === 'rg' || x === 'rgused' || x.includes('raingauge'))) score += 3;
    if (cells.some(x => x.includes('diameter'))) score += 2;
    if (cells.some(x => x.includes('upstream'))) score += 2;
    return score;
  }

  function extractAssociationMatrix(workbook) {
    let best = null;
    for (const sheetName of workbook.SheetNames || []) {
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: false });
      for (let i = 0; i < Math.min(matrix.length, 12); i += 1) {
        const score = scoreHeader(matrix[i]);
        if (!best || score > best.score) best = { sheetName, matrix, headerIndex: i, score };
      }
    }
    if (!best || !best.matrix.length) throw new Error('The workbook contains no readable worksheet rows.');
    if (best.score < 2) {
      const first = best.matrix.findIndex(row => (row || []).filter(x => String(x || '').trim()).length >= 2);
      best.headerIndex = Math.max(0, first);
    }
    return {
      sheetName: best.sheetName,
      headers: best.matrix[best.headerIndex] || [],
      rows: best.matrix.slice(best.headerIndex + 1).filter(row => (row || []).some(x => String(x || '').trim())),
    };
  }

  function inferredSurveyMetadata() {
    const out = {};
    for (const item of state.files.values()) {
      if (item.status !== 'ready' || String(item.parsed && item.parsed.format || '') !== 'fdv_ascii') continue;
      const metadata = item.parsed.metadata || {};
      const monitor = String(metadata.monitor || stem(item.displayName)).trim();
      if (!monitor) continue;
      const constants = metadata.constants || {};
      let diameter = null;
      let rainGauge = null;
      for (const [key, value] of Object.entries(constants)) {
        const k = token(key);
        if (diameter == null && k.includes('diameter') && k.includes('mm')) {
          const n = Number(String(value).replace(/,/g, ''));
          if (Number.isFinite(n)) diameter = n;
        }
        if (!rainGauge && (k === 'rgused' || k.includes('raingauge'))) rainGauge = String(value || '').trim();
      }
      out[monitor] = { diameter_mm: diameter, rain_gauge: rainGauge || null };
    }
    return out;
  }

  async function loadAssociationWorkbook(file) {
    workbookCandidate();
    const status = document.getElementById('surveyAssociationStatus');
    status.textContent = 'Reading ' + file.name + '…';
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const table = extractAssociationMatrix(workbook);
    const result = await engine.call('survey_association_result', {
      headers_json: JSON.stringify(table.headers),
      rows_json: JSON.stringify(table.rows),
      inferred_json: JSON.stringify(inferredSurveyMetadata()),
    }, 'advanced_bridge');
    result.sheet_name = table.sheetName;
    survey.association = result;
    window.ICMProjectRegistry?.setRelationships(result.records || [], file.name, result.issues || []);
    survey.associationSource = {
      name: file.name,
      size: file.size,
      last_modified: file.lastModified,
      sha256: await sha256(file),
      sheet: table.sheetName,
    };
    survey.batch = null;
    survey.balance = null;
    survey.generation += 1;
    renderAssociation();
    invalidateSurveyResults('Association workbook changed.');
  }

  async function refreshAssociationConflicts() {
    if (!survey.association || !(survey.association.records || []).length) return;
    const headers = ['monitor', 'rain gauge', 'diameter', 'upstream'];
    const rows = survey.association.records.map(record => [
      record.monitor,
      record.rain_gauge || '',
      record.diameter_mm == null ? '' : record.diameter_mm,
      (record.upstream || []).join(', '),
    ]);
    const refreshed = await engine.call('survey_association_result', {
      headers_json: JSON.stringify(headers),
      rows_json: JSON.stringify(rows),
      inferred_json: JSON.stringify(inferredSurveyMetadata()),
    }, 'advanced_bridge');
    refreshed.sheet_name = survey.association.sheet_name || survey.associationSource?.sheet || null;
    survey.association = refreshed;
    window.ICMProjectRegistry?.setRelationships(refreshed.records || [], survey.associationSource?.name || 'fm_rg_assoc.xlsx', refreshed.issues || []);
    renderAssociation();
  }

  function fdvItems() {
    return [...state.files.values()].filter(item =>
      item.status === 'ready' && String(item.parsed && item.parsed.format || '') === 'fdv_ascii'
    );
  }

  function rainfallItems() {
    return [...state.files.values()].filter(item => {
      if (item.status !== 'ready') return false;
      const format = String(item.parsed && item.parsed.format || '').toLowerCase();
      return format === 'rainfall_r_ascii' || /\.r(?:\.txt)?$/i.test(item.file && item.file.name || '');
    });
  }

  function monitorIdentity(item) {
    const metadata = item.parsed && item.parsed.metadata || {};
    return token(metadata.monitor || stem(item.displayName));
  }

  function rainIdentity(item) {
    return token(stem(item.displayName || item.file && item.file.name));
  }

  function matchMonitor(monitor) {
    const key = token(monitor);
    const exact = fdvItems().filter(item => monitorIdentity(item) === key);
    if (exact.length === 1) return { item: exact[0], status: 'matched' };
    if (exact.length > 1) return { item: null, status: 'conflict', matches: exact };
    return { item: null, status: 'missing', matches: [] };
  }

  function matchRain(gauge) {
    const key = token(gauge);
    if (!key) return { item: null, status: 'missing', matches: [] };
    const exact = rainfallItems().filter(item => rainIdentity(item) === key);
    if (exact.length === 1) return { item: exact[0], status: 'matched' };
    if (exact.length > 1) return { item: null, status: 'conflict', matches: exact };
    const relaxed = rainfallItems().filter(item => {
      const value = rainIdentity(item);
      return value.endsWith(key) || key.endsWith(value);
    });
    if (relaxed.length === 1) return { item: relaxed[0], status: 'matched' };
    return { item: null, status: relaxed.length > 1 ? 'conflict' : 'missing', matches: relaxed };
  }

  function quantityColumn(item, quantity) {
    const columns = item.parsed && item.parsed.columns || [];
    const metadata = item.parsed && item.parsed.metadata || {};
    const channels = metadata.channels || {};
    for (const col of columns) {
      if (channels[col] && String(channels[col].quantity) === quantity) return col;
    }
    return columns.find(col => token(col) === token(quantity)) || null;
  }

  function monitorType(name) {
    const upper = String(name || '').trim().toUpperCase();
    const match = upper.match(/^(FM|SM|DM|RM)/);
    return match ? match[1] : 'FM';
  }

  function monitorSourceSpecs() {
    const rows = survey.association && survey.association.records || [];
    return rows.map(record => {
      const match = matchMonitor(record.monitor);
      const item = match.item;
      return {
        monitor: record.monitor,
        path: item && item.virtualPath || null,
        depth_col: item && quantityColumn(item, 'depth') || null,
        velocity_col: item && quantityColumn(item, 'velocity') || null,
        flow_col: item && quantityColumn(item, 'flow') || null,
        monitor_type: monitorType(record.monitor),
        match_status: match.status,
        display_name: item && item.displayName || null,
      };
    });
  }

  function rainSourceSpecs() {
    return rainfallItems().map(item => ({
      name: stem(item.displayName || item.file && item.file.name),
      path: item.virtualPath,
      column: (item.parsed && item.parsed.columns || [])[0] || 'rainfall',
      display_name: item.displayName,
    }));
  }

  function associationConflictText(record) {
    const conflicts = (survey.association && survey.association.conflicts || []).filter(x => token(x.monitor) === token(record.monitor));
    return conflicts.length ? conflicts.map(x => x.field + ': workbook ' + x.workbook + ' overrides inferred ' + x.inferred).join('; ') : '—';
  }

  function renderAssociation() {
    const status = document.getElementById('surveyAssociationStatus');
    const summary = document.getElementById('surveyAssociationSummary');
    const table = document.getElementById('surveyAssociationTable');
    if (!status || !summary || !table) return;
    const association = survey.association;
    if (!association) {
      status.textContent = 'No association workbook loaded. You can load it directly or include it in the selected survey folder.';
      summary.innerHTML = '';
      table.innerHTML = '';
      renderSurveySchematic(null);
      return;
    }
    const records = association.records || [];
    const monitorMatches = records.filter(x => matchMonitor(x.monitor).status === 'matched').length;
    const rainMatches = records.filter(x => x.rain_gauge && matchRain(x.rain_gauge).status === 'matched').length;
    const issueCount = (association.issues || []).length + (association.conflicts || []).length;
    status.innerHTML = '<strong>' + esc(survey.associationSource && survey.associationSource.name || 'fm_rg_assoc.xlsx') + '</strong> · sheet ' + esc(association.sheet_name || survey.associationSource && survey.associationSource.sheet || '—') + ' · workbook values are authoritative.';
    summary.innerHTML =
      '<div class="summary-box survey-summary-box">' +
      '<div><strong>' + records.length + '</strong><span>workbook monitors</span></div>' +
      '<div><strong>' + monitorMatches + '/' + records.length + '</strong><span>FDV matches</span></div>' +
      '<div><strong>' + rainMatches + '/' + records.filter(x => x.rain_gauge).length + '</strong><span>rain-gauge matches</span></div>' +
      '<div><strong>' + issueCount + '</strong><span>conflicts / warnings</span></div></div>';
    const rows = records.map(record => {
      const fm = matchMonitor(record.monitor);
      const rg = record.rain_gauge ? matchRain(record.rain_gauge) : { status: 'missing' };
      return '<tr><td><strong>' + esc(record.monitor) + '</strong></td><td>' + esc(record.rain_gauge || '—') + '</td>' +
        '<td>' + (record.diameter_mm == null ? '—' : fmt(record.diameter_mm, 0) + ' mm') + '</td>' +
        '<td>' + esc((record.upstream || []).join(', ') || '—') + '</td>' +
        '<td><span class="source-match ' + esc(fm.status) + '">' + esc(fm.status) + '</span>' + (fm.item ? '<br><small>' + esc(fm.item.displayName) + '</small>' : '') + '</td>' +
        '<td><span class="source-match ' + esc(rg.status) + '">' + esc(rg.status) + '</span>' + (rg.item ? '<br><small>' + esc(rg.item.displayName) + '</small>' : '') + '</td>' +
        '<td class="survey-conflict">' + esc(associationConflictText(record)) + '</td></tr>';
    }).join('');
    table.innerHTML = '<div class="survey-table-wrap"><table class="data-table survey-table"><thead><tr><th>Monitor</th><th>Rain gauge</th><th>Pipe diameter</th><th>Upstream trace</th><th>FDV source</th><th>RG source</th><th>Workbook precedence / conflicts</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    renderSurveySchematic(survey.balance);
  }

  function currentControls() {
    return {
      start: modelClock(document.getElementById('analysisStart') && document.getElementById('analysisStart').value) || null,
      end: modelClock(document.getElementById('analysisEnd') && document.getElementById('analysisEnd').value) || null,
      hydraulic_exclusions_json: JSON.stringify(exclusionPayload(true, 'observed')),
      rainfall_exclusions_json: JSON.stringify(exclusionPayload(true, 'rainfall')),
      max_gap_seconds: Number(document.getElementById('gapInput') && document.getElementById('gapInput').value || 900),
      amber_tolerance_percent: Number(document.getElementById('surveyBalanceTolerance') && document.getElementById('surveyBalanceTolerance').value || 10),
    };
  }
  function surveyDependencySignature(kind='complete') {
    const controls=currentControls();
    const association=(survey.association?.records||[]).map(row=>({
      monitor:row.monitor||null,rain_gauge:row.rain_gauge||null,diameter_mm:row.diameter_mm??null,upstream:row.upstream||[]
    }));
    return JSON.stringify({
      kind,
      analysis:typeof analysisSignature==='function'?analysisSignature():null,
      association,
      association_source:survey.associationSource?{name:survey.associationSource.name||null,sha256:survey.associationSource.sha256||null,sheet:survey.associationSource.sheet||null}:null,
      monitor_sources:monitorSourceSpecs(),
      rain_sources:kind==='complete'?rainSourceSpecs():[],
      controls,
      population_above_50k:document.getElementById('surveyPopulation')?document.getElementById('surveyPopulation').value==='over50':true,
      apply_fault_cutoff:Boolean(document.getElementById('surveyApplyFaultCutoff')&&document.getElementById('surveyApplyFaultCutoff').checked),
    });
  }
  function surveyFresh(kind){
    if(kind==='balance')return Boolean(survey.balance&&survey.balanceSignature===surveyDependencySignature('balance'));
    return Boolean(survey.batch&&survey.batchSignature===surveyDependencySignature('complete'));
  }
  window.__ICM_WORKBENCH__.surveyDependencySignature=surveyDependencySignature;
  window.__ICM_WORKBENCH__.surveyFresh=surveyFresh;

  function invalidateSurveyResults(reason) {
    // Preserve the previous evidence for review, but invalidate its dependency
    // signature immediately. Stale results are never exported as current.
    survey.generation += 1;
    const status = document.getElementById('completeSurveyStatus');
    if (status && survey.batch) status.textContent = reason + ' Previous complete-survey results are stale; re-run before relying on or exporting them.';
    const summary = document.getElementById('surveyBalanceSummary');
    if (summary && survey.balance) summary.insertAdjacentHTML('afterbegin','<div class="privacy-note"><strong>Stale:</strong> ' + esc(reason) + ' Recalculate volume balance before relying on the previous result.</div>');
    renderReportPreflight();
  }

  async function runSurveyBalance() {
    if (!survey.association || !(survey.association.records || []).length) throw new Error('Load fm_rg_assoc.xlsx first.');
    const button = document.getElementById('runSurveyBalanceBtn');
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Calculating…';
    try {
      const controls = currentControls();
      const signature=surveyDependencySignature('balance'),generation=++survey.generation;
      const result = await engine.call('survey_volume_balance_result', {
        association_json: JSON.stringify(survey.association.records),
        monitor_sources_json: JSON.stringify(monitorSourceSpecs()),
        exclusions_json: controls.hydraulic_exclusions_json,
        max_gap_seconds: controls.max_gap_seconds,
        start: controls.start,
        end: controls.end,
        amber_tolerance_percent: controls.amber_tolerance_percent,
      }, 'advanced_bridge');
      if(generation!==survey.generation||signature!==surveyDependencySignature('balance'))throw new Error('Volume-balance inputs changed while calculation was running. The late result was discarded.');
      survey.balance = result;
      survey.balanceSignature=signature;
      renderVolumeBalance(result);
      renderReportPreflight();
      return result;
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function runCompleteSurvey() {
    if (!survey.association || !(survey.association.records || []).length) throw new Error('Load fm_rg_assoc.xlsx first.');
    const button = document.getElementById('runCompleteSurveyBtn');
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Assessing complete survey…';
    const status = document.getElementById('completeSurveyStatus');
    status.textContent = 'Running network rainfall qualification, weekly monitor assessment, Event Response and flow-continuity diagnostics…';
    const started=performance.now();
    try {
      const controls = currentControls();
      const signature=surveyDependencySignature('complete'),generation=++survey.generation;
      const result = await engine.call('professional_survey_batch_result', {
        association_json: JSON.stringify(survey.association.records),
        monitor_sources_json: JSON.stringify(monitorSourceSpecs()),
        rain_sources_json: JSON.stringify(rainSourceSpecs()),
        population_above_50k: document.getElementById('surveyPopulation') ? document.getElementById('surveyPopulation').value === 'over50' : true,
        apply_fault_cutoff: Boolean(document.getElementById('surveyApplyFaultCutoff') && document.getElementById('surveyApplyFaultCutoff').checked),
        rain_factor: Number(document.getElementById('rainFactor') && document.getElementById('rainFactor').value || 1),
        exclusions_json: controls.hydraulic_exclusions_json,
        hydraulic_exclusions_json: controls.hydraulic_exclusions_json,
        rainfall_exclusions_json: controls.rainfall_exclusions_json,
        max_gap_seconds: controls.max_gap_seconds,
        start: controls.start,
        end: controls.end,
        amber_tolerance_percent: controls.amber_tolerance_percent,
      }, 'advanced_bridge');
      if(generation!==survey.generation||signature!==surveyDependencySignature('complete'))throw new Error('Complete-survey inputs changed while calculation was running. The late result was discarded.');
      survey.batch = result;
      survey.batchSignature=signature;
      survey.balance = result.volume_balance || null;
      survey.balanceSignature=survey.balance?surveyDependencySignature('balance'):null;
      renderCompleteSurvey(result);
      renderVolumeBalance(survey.balance);
      renderReportPreflight();
      const elapsed=(performance.now()-started)/1000;
      status.innerHTML='<strong>Complete survey assessment calculated.</strong> Workbook mappings were authoritative · '+fmt(elapsed,1)+' s.';
      return result;
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function countRag(weeks) {
    const out = { Green: 0, Amber: 0, Red: 0 };
    for (const row of weeks || []) if (out[row.rag] != null) out[row.rag] += 1;
    return out;
  }

  function renderCompleteSurvey(result) {
    const status = document.getElementById('completeSurveyStatus');
    const summary = document.getElementById('completeSurveySummary');
    const monitorTable = document.getElementById('completeSurveyMonitors');
    const eventTable = document.getElementById('surveyEventResponse');
    if (!result) {
      if (status) status.textContent = 'Assessment not calculated.';
      return;
    }
    const monitors = result.monitors || [];
    const complete = monitors.filter(x => x.status === 'complete').length;
    const unavailable = monitors.filter(x => x.status !== 'complete').length;
    const networkEvents = result.network && result.network.qualified_wapug_events || [];
    status.innerHTML = '<strong>Complete survey assessment calculated.</strong> Workbook mappings were used as authoritative survey context.';
    summary.innerHTML =
      '<div class="summary-box survey-summary-box"><div><strong>' + monitors.length + '</strong><span>survey monitors</span></div>' +
      '<div><strong>' + complete + '</strong><span>fully assessed</span></div>' +
      '<div><strong>' + unavailable + '</strong><span>partial / unavailable</span></div>' +
      '<div><strong>' + networkEvents.length + '</strong><span>network-qualified WAPUG events</span></div></div>';

    const monitorRows = monitors.map(monitor => {
      const rag = countRag(monitor.weekly && monitor.weekly.weeks);
      const events = monitor.event_response && monitor.event_response.rows || [];
      const minPass = events.filter(x => x.min_depth_pass === true).length;
      const minFail = events.filter(x => x.min_depth_pass === false).length;
      const ratioPass = events.filter(x => x.response_ratio_pass === true).length;
      const ratioFail = events.filter(x => x.response_ratio_pass === false).length;
      return '<tr><td><strong>' + esc(monitor.monitor) + '</strong></td><td>' + esc(monitor.status || '—') + '</td><td>' + esc(monitor.rain_gauge || '—') + '</td>' +
        '<td>' + (monitor.diameter_mm == null ? '—' : fmt(monitor.diameter_mm, 0) + ' mm') + '</td>' +
        '<td><span class="rag-pill rag-green">G ' + rag.Green + '</span> <span class="rag-pill rag-amber">A ' + rag.Amber + '</span> <span class="rag-pill rag-red">R ' + rag.Red + '</span></td>' +
        '<td>' + events.length + '</td><td>' + minPass + ' / ' + minFail + '</td><td>' + ratioPass + ' / ' + ratioFail + '</td>' +
        '<td>' + esc(monitor.reason || '—') + '</td></tr>';
    }).join('');
    monitorTable.innerHTML = '<div class="survey-table-wrap"><table class="data-table survey-table"><thead><tr><th>Monitor</th><th>Status</th><th>Mapped RG</th><th>Diameter</th><th>Weekly RAG</th><th>Events</th><th>Min D pass/fail</th><th>R pass/fail</th><th>Notes</th></tr></thead><tbody>' + monitorRows + '</tbody></table></div>';

    const eventRows = [];
    for (const monitor of monitors) {
      for (const row of monitor.event_response && monitor.event_response.rows || []) {
        eventRows.push('<tr><td><strong>' + esc(monitor.monitor) + '</strong></td><td>' + esc(row.event || '—') + '</td><td>' + esc(row.event_start || '—') + '</td>' +
          '<td>' + esc(row.depth_velocity_response || '—') + '</td><td>' + (row.min_depth_at_peak_flow_m == null ? '—' : fmt(row.min_depth_at_peak_flow_m, 3)) + '</td>' +
          '<td>' + (row.min_depth_threshold_m == null ? '—' : fmt(row.min_depth_threshold_m, 3)) + '</td><td>' + boolMark(row.min_depth_pass) + '</td>' +
          '<td>' + (row.response_ratio == null ? '—' : fmt(row.response_ratio, 2)) + '</td><td>' + (row.response_ratio_threshold == null ? '—' : fmt(row.response_ratio_threshold, 1)) + '</td>' +
          '<td>' + boolMark(row.response_ratio_pass) + '</td><td>' + esc((row.comments || []).join(' ')) + '</td></tr>');
      }
    }
    eventTable.innerHTML = eventRows.length ?
      '<div class="survey-table-wrap tall"><table class="data-table survey-table"><thead><tr><th>Monitor</th><th>Event</th><th>Start</th><th>D/V response</th><th>Depth @ Qpeak (m)</th><th>Threshold (m)</th><th>Min D</th><th>Response ratio R</th><th>R threshold</th><th>R</th><th>Comments</th></tr></thead><tbody>' + eventRows.join('') + '</tbody></table></div>' :
      '<div class="pool-summary">No qualified Event Response rows were generated.</div>';
  }

  function renderVolumeBalance(result) {
    const summary = document.getElementById('surveyBalanceSummary');
    const table = document.getElementById('surveyBalanceTable');
    if (!summary || !table) return;
    renderSurveySchematic(result);
    if (!result) {
      summary.innerHTML = '<div class="pool-summary">Volume balance not calculated.</div>';
      table.innerHTML = '';
      return;
    }
    const rag = result.summary || {};
    summary.innerHTML =
      '<div class="summary-box survey-summary-box"><div><strong>' + (rag.Green || 0) + '</strong><span>Green</span></div>' +
      '<div><strong>' + (rag.Amber || 0) + '</strong><span>Amber</span></div>' +
      '<div><strong>' + (rag.Red || 0) + '</strong><span>Red</span></div>' +
      '<div><strong>' + (rag.Grey || 0) + '</strong><span>Grey / incomplete</span></div></div>' +
      '<div class="privacy-note"><strong>Method:</strong> ' + esc(result.criteria && result.criteria.legacy_method || 'FSAT weekly volume parity') + '. Enhanced RAG uses actual-timestep valid support, global analysis bounds and exclusions.</div>';
    const rows = (result.rows || []).map(row => {
      const downstream = row.downstream_monitor || '—';
      const upstream = (row.upstream_monitors || []).join(', ') || '—';
      const downstreamVolume = row.downstream_volume_m3 == null ? '—' : fmt(row.downstream_volume_m3, 1) + ' m³';
      const upstreamVolume = row.upstream_sum_m3 == null ? '—' : fmt(row.upstream_sum_m3, 1) + ' m³';
      const coverage = row.minimum_coverage_fraction == null ? '—' : fmt(row.minimum_coverage_fraction * 100, 1) + '%';
      const qa = (row.qa_evidence || []).map(x => x.monitor + ' ' + x.rag).join('; ') || '—';
      return '<tr>' +
        '<td class="balance-week">' + esc(row.week_ending || '—') + '</td>' +
        '<td class="balance-path"><strong>' + esc(downstream) + '</strong><span>Upstream: ' + esc(upstream) + '</span></td>' +
        '<td class="balance-volumes"><span><strong>Downstream</strong> ' + esc(downstreamVolume) + '</span><span><strong>Upstream</strong> ' + esc(upstreamVolume) + '</span></td>' +
        '<td class="balance-status"><strong>' + (row.balance_ratio == null ? '—' : fmt(row.balance_ratio, 3)) + '</strong><span>FSAT: ' + esc(row.legacy_fsat_status || 'NA') + '</span></td>' +
        '<td class="balance-rag"><span class="rag-pill ' + ragClass(row.rag) + '">' + esc(row.rag || 'Grey') + '</span><span>' + esc(coverage) + ' support</span></td>' +
        '<td class="likely-source"><strong>' + esc(row.likely_source || '—') + '</strong><span>QA: ' + esc(qa) + '</span></td>' +
        '<td class="recommendation-cell">' + esc(row.recommendation || '—') + '</td>' +
      '</tr>';
    }).join('');
    table.innerHTML = '<div class="survey-table-wrap tall balance-table-wrap"><table class="data-table survey-table balance-table"><thead><tr><th>Week ending</th><th>Network path</th><th>Volume evidence</th><th>Ratio / legacy</th><th>RAG / coverage</th><th>Likely source / first check</th><th>Recommendation</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function surveyReportHtml() {
    if (!survey.association && !survey.batch && !survey.balance) return '';
    let html = '<h2>Complete flow-survey context</h2>';
    if (survey.association) {
      html += '<div class="note"><strong>Association precedence.</strong> fm_rg_assoc.xlsx is authoritative over inferred FDV/source metadata. Source: ' +
        esc(survey.associationSource && survey.associationSource.name || 'workspace snapshot') + '.</div>';
      const rows = (survey.association.records || []).map(row =>
        '<tr><td>' + esc(row.monitor) + '</td><td>' + esc(row.rain_gauge || '—') + '</td><td>' + (row.diameter_mm == null ? '—' : fmt(row.diameter_mm, 0)) + '</td><td>' + esc((row.upstream || []).join(', ') || '—') + '</td></tr>'
      ).join('');
      html += '<div class="table-wrap"><table><thead><tr><th>Monitor</th><th>Rain gauge</th><th>Diameter mm</th><th>Upstream trace</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    const balance = survey.balance || survey.batch && survey.batch.volume_balance;
    if (balance && (balance.rows || []).length) {
      html += '<h3>Flow continuity / volume balance</h3><div class="note">' + esc(balance.caveat || '') + '</div>';
      const rows = balance.rows.map(row =>
        '<tr><td>' + esc(row.week_ending || '—') + '</td><td>' + esc(row.downstream_monitor) + '</td><td>' + esc((row.upstream_monitors || []).join(', ')) + '</td><td>' + (row.downstream_volume_m3 == null ? '—' : fmt(row.downstream_volume_m3, 1)) + '</td><td>' + (row.upstream_sum_m3 == null ? '—' : fmt(row.upstream_sum_m3, 1)) + '</td><td>' + (row.balance_ratio == null ? '—' : fmt(row.balance_ratio, 3)) + '</td><td>' + esc(row.legacy_fsat_status || 'NA') + '</td><td>' + esc(row.rag || 'Grey') + '</td><td>' + esc(row.likely_source || '—') + '</td><td>' + esc((row.qa_evidence || []).map(x => x.monitor + ' ' + x.rag).join('; ') || '—') + '</td><td>' + esc(row.recommendation || '—') + '</td></tr>'
      ).join('');
      html += '<div class="table-wrap"><table><thead><tr><th>Week</th><th>Downstream</th><th>Upstream</th><th>Downstream m³</th><th>Upstream m³</th><th>Ratio</th><th>Legacy</th><th>RAG</th><th>First check</th><th>QA evidence</th><th>Recommendation</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    return html;
  }

  function addCollapseControl(container, header, label='section') {
    if(!container||!header||container.dataset.collapsible==='true')return;
    const body=document.createElement('div');
    body.className='tool-collapse-body';
    const movable=[...container.children].filter(child=>child!==header);
    if(!movable.length)return;
    header.insertAdjacentElement('afterend',body);
    for(const child of movable)body.appendChild(child);
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='btn quiet tool-collapse-toggle';
    toggle.textContent='Collapse';
    toggle.setAttribute('aria-expanded','true');
    header.appendChild(toggle);
    toggle.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      const collapsed=container.classList.toggle('tool-collapsed');
      toggle.textContent=collapsed?'Expand':'Collapse';
      toggle.setAttribute('aria-expanded',String(!collapsed));
      toggle.setAttribute('aria-label',(collapsed?'Expand ':'Collapse ')+label);
      setTimeout(()=>window.dispatchEvent(new Event('resize')),0);
    });
    container.dataset.collapsible='true';
  }

  function installCollapsibleTools() {
    for(const panel of document.querySelectorAll('.tab-panel > .panel, .embedded-workflow > .panel')){
      const head=panel.querySelector(':scope > .panel-head');
      if(!head)continue;
      // The primary graph is already the work surface; do not wrap it in another collapsible card.
      if(panel.closest('#tab-graph'))continue;
      // Keep injected sub-tools independent rather than hiding them with the main workflow.
      const directSubpanels=[...panel.children].filter(x=>x.classList?.contains('subpanel')||x.classList?.contains('embedded-workflow'));
      if(directSubpanels.length){
        const main=document.createElement('div');
        main.className='tool-main-section';
        const movable=[...panel.children].filter(x=>x!==head&&!directSubpanels.includes(x));
        if(movable.length){
          head.insertAdjacentElement('afterend',main);
          for(const child of movable)main.appendChild(child);
          addCollapseControl(main,(()=>{const h=document.createElement('div');h.className='subhead tool-main-head';h.innerHTML='<div><h3>Main workflow</h3></div>';main.prepend(h);return h;})(),'main workflow');
        }
      }else{
        addCollapseControl(panel,head,(head.querySelector('h2')?.textContent||'workflow').trim());
      }
    }
    for(const subpanel of document.querySelectorAll('.tab-panel .subpanel:not(details), .embedded-workflow .subpanel:not(details)')){
      const head=subpanel.querySelector(':scope > .subhead');
      if(head)addCollapseControl(subpanel,head,(head.querySelector('h3')?.textContent||'tool').trim());
    }
  }

  function wireIngestion() {
    const coreIngest = ingestFiles;
    ingestFiles = async function(files) {
      const list = [...files].filter(Boolean);
      const associations = list.filter(isAssociationFile);
      for (const file of associations) await loadAssociationWorkbook(file);
      const dataFiles = list.filter(file => !isAssociationFile(file));
      if (dataFiles.length) await coreIngest(dataFiles);
      if (survey.association) await refreshAssociationConflicts();
      renderAssociation();
    };
  }

  function wireInvalidation() {
    window.addEventListener('icm:source-pool-changed', () => {
      if (survey.association) {
        renderAssociation();
        if (survey.batch || survey.balance) invalidateSurveyResults('Source pool changed.');
      }
    });
    document.addEventListener('change', event => {
      const id = event.target && event.target.id || '';
      if (['analysisStart', 'analysisEnd', 'gapInput', 'surveyPopulation', 'surveyApplyFaultCutoff', 'rainFactor', 'surveyBalanceTolerance'].includes(id)) {
        if (survey.batch || survey.balance) invalidateSurveyResults('Survey analysis controls changed.');
      }
    }, true);
    const exclusions = document.getElementById('exclusionRows');
    if (exclusions) {
      const exclusionSignature = () => JSON.stringify((state.exclusions || []).map(item => ({
        enabled: item.enabled !== false,
        start: modelClock(item.start) || '',
        end: modelClock(item.end) || '',
        scope: item.scope || 'both',
        reason: String(item.reason || ''),
      })));
      let lastExclusionSignature = exclusionSignature();
      const invalidateForExclusionStateChange = () => {
        const next = exclusionSignature();
        if (next === lastExclusionSignature) return;
        lastExclusionSignature = next;
        if (survey.batch || survey.balance) invalidateSurveyResults('Exclusion periods changed.');
      };
      new MutationObserver(invalidateForExclusionStateChange)
        .observe(exclusions, { childList: true, subtree: true, attributes: true });
      document.addEventListener('change', event => {
        if (event.target && event.target.closest && event.target.closest('#exclusionRows')) {
          invalidateForExclusionStateChange();
        }
      });
    }
  }

  function wireWorkspacePersistence() {
    const coreWorkspaceObject = workspaceObject;
    workspaceObject = function() {
      const value = coreWorkspaceObject();
      value.survey = {
        association: survey.association,
        association_source: survey.associationSource,
        balance_tolerance_percent: Number(document.getElementById('surveyBalanceTolerance') && document.getElementById('surveyBalanceTolerance').value || 10),
        population_above_50k: document.getElementById('surveyPopulation') ? document.getElementById('surveyPopulation').value === 'over50' : true,
        apply_fault_cutoff: Boolean(document.getElementById('surveyApplyFaultCutoff') && document.getElementById('surveyApplyFaultCutoff').checked),
      };
      return value;
    };

    const coreApplyWorkspace = applyWorkspace;
    applyWorkspace = async function(value) {
      const saved = value && value.survey;
      const status = document.getElementById('workspaceStatus');
      if (status) {
        status.setAttribute('aria-busy', 'true');
        status.textContent = 'Restoring workspace… relinking sources, mappings, graph and survey context.';
      }
      try {
        const restored = await coreApplyWorkspace(value);
        if (saved && saved.association) {
          survey.association = saved.association;
          survey.associationSource = saved.association_source || null;
          if (document.getElementById('surveyBalanceTolerance')) document.getElementById('surveyBalanceTolerance').value = saved.balance_tolerance_percent == null ? 10 : saved.balance_tolerance_percent;
          if (document.getElementById('surveyPopulation')) document.getElementById('surveyPopulation').value = saved.population_above_50k === false ? 'under50' : 'over50';
          if (document.getElementById('surveyApplyFaultCutoff')) document.getElementById('surveyApplyFaultCutoff').checked = Boolean(saved.apply_fault_cutoff);
          await refreshAssociationConflicts();
          renderAssociation();
        }
        if (status) status.textContent = 'Workspace loaded. ' + Number(restored && restored.matched || 0) + '/' + Number(restored && restored.expected || 0) + ' source fingerprint(s) matched the current pool.';
        renderReportPreflight();
        return restored;
      } finally {
        if (status) status.removeAttribute('aria-busy');
      }
    };
  }

  function readinessState(snapshot) {
    if (!snapshot) return { state: 'not-calculated', label: 'Not calculated' };
    if (snapshot.signature && typeof analysisSignature === 'function' && snapshot.signature !== analysisSignature()) {
      return { state: 'stale', label: 'Stale' };
    }
    return { state: 'fresh', label: 'Fresh' };
  }

  function renderReportPreflight() {
    const root = document.getElementById('reportReadinessGrid');
    if (!root) return;
    const comparison = readinessState(state.comparisonSnapshot);
    const spill = readinessState(state.spillSnapshot);
    const professional = window.__ICM_WORKBENCH__.lastProfessionalSurvey ?
      (window.__ICM_WORKBENCH__.professionalSurveyFresh?.()?{ state:'fresh',label:'Fresh' }:{ state:'stale',label:'Stale' }) :
      { state: 'not-calculated', label: 'Not calculated' };
    const complete = survey.batch ?
      (surveyFresh('complete')?{ state:'fresh',label:'Fresh' }:{ state:'stale',label:'Stale' }) :
      { state: 'not-calculated', label: 'Not calculated' };
    const balance = survey.balance ?
      (surveyFresh('balance')?{ state:'fresh',label:'Fresh' }:{ state:'stale',label:'Stale' }) :
      { state: 'not-calculated', label: 'Not calculated' };
    const rating = !state.rating ?
      { state: 'not-calculated', label: 'Not calculated' } :
      (state.rating.signature && typeof ratingInputSignature === 'function' && state.rating.signature !== ratingInputSignature() ?
        { state: 'stale', label: 'Stale' } :
        { state: 'fresh', label: 'Fresh' });
    const association = survey.association ?
      { state: 'loaded', label: 'Loaded' } : { state: 'not-loaded', label: 'Not loaded' };
    const rows = [
      ['comparison', 'Comparison', comparison],
      ['spill', 'Spill / EDM', spill],
      ['professional-survey', 'Professional survey', professional],
      ['complete-survey', 'Complete survey', complete],
      ['volume-balance', 'Volume balance', balance],
      ['rating', 'Rating / fitted relationship', rating],
      ['survey-association', 'Survey association', association],
    ];
    root.innerHTML = rows.map(([key, label, status]) =>
      '<div class="report-readiness-item" data-result="' + esc(key) + '">' +
      '<span>' + esc(label) + '</span>' +
      '<strong class="report-readiness-state" data-state="' + esc(status.state) + '">' + esc(status.label) + '</strong>' +
      '</div>'
    ).join('');
  }

  function wireReportPreflight() {
    document.addEventListener('click', event => {
      if (event.target && event.target.closest && event.target.closest('.tab[data-tab="workspace"]')) {
        renderReportPreflight();
      }
    }, true);
    renderReportPreflight();
  }

  function wireSurveyReport() {
    const button = document.getElementById('downloadReportBtn');
    if (!button) return;
    const coreDownloadReport = downloadReport;
    button.addEventListener('click', event => {
      if (!survey.association && !survey.batch && !survey.balance) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      guarded('workspaceStatus', async () => {
        if(survey.batch&&!surveyFresh('complete'))throw new Error('Complete flow-survey results are stale. Re-run the assessment before exporting.');
        if(survey.balance&&!surveyFresh('balance'))throw new Error('Volume-balance results are stale. Recalculate before exporting.');
        if(window.__ICM_WORKBENCH__.lastProfessionalSurvey&&!window.__ICM_WORKBENCH__.professionalSurveyFresh?.())throw new Error('Professional flow-survey results are stale. Re-run the assessment before exporting.');
        const extra = surveyReportHtml();
        if (!state.mapping.observed && !state.mapping.rain) {
          const body = '<div class="note">Survey-only report. No hydraulic or rainfall graph mapping was available for the full engineering report.</div>' + extra + reportSources(workspaceObject()) + reportExclusions(workspaceObject());
          downloadBlob('icm-workbench-survey-report-' + new Date().toISOString().slice(0, 10) + '.html', reportShell('ICM Graphing Tool — Flow Survey Assessment', 'Association-driven survey QA, Event Response and flow-continuity review', body, true), 'text/html');
          document.getElementById('workspaceStatus').textContent = 'Survey assessment HTML downloaded.';
          return;
        }
        const existing = window.__ICM_WORKBENCH__.professionalSurveyReportHtml || '';
        window.__ICM_WORKBENCH__.professionalSurveyReportHtml = existing + extra;
        try {
          await coreDownloadReport();
        } finally {
          window.__ICM_WORKBENCH__.professionalSurveyReportHtml = existing;
        }
      });
    }, true);
  }

  simplifyNavigation();
  installSharedAnalysisControls();
  installSurveyPanels();
  installCollapsibleTools();
  wireIngestion();
  wireInvalidation();
  wireWorkspacePersistence();
  wireSurveyReport();
  wireReportPreflight();
  renderAssociation();
})();
