(() => {
  'use strict';

  const wb = window.__ICM_WORKBENCH__ || (window.__ICM_WORKBENCH__ = {});
  const survey = wb.survey;
  if (!survey) return;

  survey.reviews = survey.reviews && typeof survey.reviews === 'object' ? survey.reviews : {};
  survey.selectedMonitor = survey.selectedMonitor || null;
  survey.selectedGauge = survey.selectedGauge || null;
  survey.selectedBalanceKey = survey.selectedBalanceKey || null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const fmt = (value, digits=1) => {
    const n = Number(value);
    return value == null || !Number.isFinite(n) ? '—' : n.toLocaleString(undefined, {maximumFractionDigits:digits});
  };
  const RANK = {Grey:0, Green:1, Amber:2, Red:3};
  const VALID_RAG = new Set(Object.keys(RANK));
  const nowIso = () => new Date().toISOString();

  function normaliseRag(value) {
    const text = String(value || 'Grey').trim();
    const match = Object.keys(RANK).find(x => x.toLowerCase() === text.toLowerCase());
    return match || 'Grey';
  }

  function worstRag(values) {
    let out = 'Grey';
    for (const value of values || []) {
      const rag = normaliseRag(value);
      if (RANK[rag] > RANK[out]) out = rag;
    }
    return out;
  }

  function monitorByName(name) {
    return (survey.batch?.monitors || []).find(row => String(row.monitor) === String(name)) || null;
  }

  function calculatedMonitorStatus(monitor) {
    if (!monitor || monitor.status !== 'complete') return 'Grey';
    const weeks = monitor.weekly?.weeks || [];
    if (!weeks.length) return 'Grey';
    return worstRag(weeks.map(row => row.rag));
  }

  function reviewKey(kind, id) {
    return kind + ':' + String(id || '');
  }

  function reviewFor(kind, id) {
    return survey.reviews[reviewKey(kind, id)] || null;
  }

  function reviewCurrent(review, calculated) {
    return Boolean(review && normaliseRag(review.calculated_status_at_review) === normaliseRag(calculated));
  }

  function reviewedState(kind, id, calculatedStatus) {
    const calculated = normaliseRag(calculatedStatus);
    const review = reviewFor(kind, id);
    const current = reviewCurrent(review, calculated);
    return {
      kind,
      id:String(id || ''),
      calculated,
      review,
      review_current: current,
      reviewed: current ? normaliseRag(review.reviewed_status) : calculated,
      historical_review: Boolean(review && !current),
    };
  }

  function reviewedMonitorState(monitor) {
    return reviewedState('monitor', monitor?.monitor, calculatedMonitorStatus(monitor));
  }

  function gaugeByName(name) {
    return (survey.batch?.network?.gauge_summary || []).find(row => String(row.gauge) === String(name)) || null;
  }

  function reviewedGaugeState(gauge) {
    return reviewedState('gauge', gauge?.gauge, normaliseRag(gauge?.status));
  }

  function balanceRows() {
    return (survey.balance || survey.batch?.volume_balance)?.rows || [];
  }

  function balanceRowKey(row) {
    const week = String(row?.week_ending || '');
    const downstream = String(row?.downstream_monitor || '');
    const upstream = [...(row?.upstream_monitors || [])].map(String).sort().join(',');
    return [week,downstream,upstream].join('|');
  }

  function balanceRowByKey(key) {
    return balanceRows().find(row => balanceRowKey(row) === String(key)) || null;
  }

  function reviewedBalanceState(row) {
    return reviewedState('balance', balanceRowKey(row), normaliseRag(row?.rag));
  }

  function applyReview(kind, id, calculatedStatus, reviewedStatus, reason='', reviewer='') {
    const calculated = normaliseRag(calculatedStatus);
    const reviewed = normaliseRag(reviewedStatus || calculated);
    const cleanReason = String(reason || '').trim();
    if (reviewed !== calculated && !cleanReason) {
      throw new Error('Enter an engineering reason before superseding the calculated assessment.');
    }
    survey.reviews[reviewKey(kind, id)] = {
      kind:String(kind),
      subject:String(id),
      calculated_status_at_review:calculated,
      reviewed_status:reviewed,
      reason:cleanReason,
      reviewer:String(reviewer || '').trim() || null,
      reviewed_at:nowIso(),
      method:'engineer-review-v1',
    };
    renderAll();
    return survey.reviews[reviewKey(kind, id)];
  }

  function revertReview(kind, id) {
    delete survey.reviews[reviewKey(kind, id)];
    renderAll();
  }

  function applyMonitorReview(name, reviewedStatus, reason='', reviewer='') {
    const monitor = monitorByName(name);
    if (!monitor) throw new Error('The selected monitor is not present in the current Flow Survey assessment.');
    return applyReview('monitor', name, calculatedMonitorStatus(monitor), reviewedStatus, reason, reviewer);
  }

  function revertMonitorReview(name) {
    revertReview('monitor', name);
  }

  function surveyFresh(kind='complete') {
    try {
      return Boolean(wb.surveyFresh?.(kind));
    } catch {
      return false;
    }
  }

  function surveyPeriodText() {
    const c = survey.batch?.analysis_controls || {};
    if (c.start || c.end) return (c.start || 'data start') + ' → ' + (c.end || 'data end');
    const start = $('analysisStart')?.value;
    const end = $('analysisEnd')?.value;
    return start || end ? (start || 'data start') + ' → ' + (end || 'data end') : 'Full available period';
  }

  function statusPill(label, state='neutral') {
    return '<span class="w26-status w26-status-'+esc(state)+'">'+esc(label)+'</span>';
  }

  function ragPill(rag, label=null) {
    const value = normaliseRag(rag);
    return '<span class="w26-rag w26-rag-'+value.toLowerCase()+'">'+esc(label || value)+'</span>';
  }

  function monitorSummary(monitor) {
    const weeks = monitor.weekly?.weeks || [];
    const counts = {Green:0,Amber:0,Red:0,Grey:0};
    for (const row of weeks) counts[normaliseRag(row.rag)] += 1;
    const events = monitor.event_response?.rows || [];
    const failures = events.filter(row => row.min_depth_pass === false || row.response_ratio_pass === false).length;
    const state = reviewedMonitorState(monitor);
    return {weeks,counts,events,failures,state};
  }

  function genericReviewFormHtml(kind, id, state, title, context='') {
    const review = state.review;
    const selected = review?.reviewed_status || state.calculated;
    const options = ['Green','Amber','Red','Grey'].map(rag =>
      '<option value="'+rag+'" '+(normaliseRag(selected)===rag?'selected':'')+'>'+rag+'</option>'
    ).join('');
    const stale = review && !state.review_current
      ? '<div class="w26-review-warning"><strong>Review needs reconfirmation.</strong> The calculated result is now '+esc(state.calculated)+' but this review was made against '+esc(review.calculated_status_at_review)+'. The calculated result remains reportable until reconfirmed.</div>'
      : '';
    return stale +
      '<div class="w26-inline-review" data-review-kind="'+esc(kind)+'" data-review-id="'+esc(id)+'">'+
        '<div class="w26-section-head"><div><h5>'+esc(title)+'</h5><p>'+esc(context || 'Calculated evidence remains unchanged; this records engineering judgement separately.')+'</p></div>'+
        '<div class="w26-detail-status"><span>Calculated '+ragPill(state.calculated)+'</span><span>Current reported '+ragPill(state.reviewed)+'</span></div></div>'+
        '<div class="w26-review-form">'+
          '<label>Reviewed assessment<select class="w26-reviewed-status">'+options+'</select></label>'+
          '<label>Reviewer (optional)<input class="w26-reviewer-input" value="'+esc(review?.reviewer || '')+'" placeholder="Name / initials"></label>'+
          '<label class="w26-review-reason">Engineering reason<textarea class="w26-review-reason-input" rows="3" placeholder="Required when the reviewed assessment differs from the calculated result.">'+esc(review?.reason || '')+'</textarea></label>'+
          '<div class="w26-review-meta">'+(review ? 'Last reviewed '+esc(new Date(review.reviewed_at).toLocaleString())+' · calculated at review '+esc(review.calculated_status_at_review) : 'No engineer review recorded.')+'</div>'+
          '<div class="w26-review-error" role="alert"></div>'+
          '<div class="actions left"><button type="button" class="btn primary" data-w26-review-apply>Apply Engineer Review</button>'+
          (review ? '<button type="button" class="btn" data-w26-review-revert>Revert to Calculated</button>' : '')+'</div>'+
        '</div>'+
      '</div>';
  }

  function ensureUi() {
    const panel = document.querySelector('#tab-data-health > .panel');
    if (!panel || $('surveyReviewHeader')) return;

    const header = document.createElement('section');
    header.id = 'surveyReviewHeader';
    header.className = 'w26-survey-header';
    header.innerHTML =
      '<div class="w26-survey-title-row"><div><span class="w26-eyebrow">Flow Survey</span><h3>Assessment review</h3><p>Calculated evidence remains authoritative and immutable; engineering review is recorded separately.</p></div><div class="w26-header-actions" id="surveyReviewActions"></div></div>' +
      '<div class="w26-readiness" id="surveyReviewReadiness"></div>' +
      '<details class="w26-assessment-settings" id="surveyAssessmentSettings"><summary>Assessment settings &amp; methodology</summary><div class="w26-settings-grid" id="surveyAssessmentSettingsBody"></div></details>' +
      '<details class="w26-monthly-review" id="surveyMonthlyReview"><summary><span>Monthly Review</span><small>Survey synthesis and engineering actions</small></summary><div id="surveyMonthlyReviewBody"></div></details>';
    panel.prepend(header);

    const actions = $('surveyReviewActions');
    const run = $('runCompleteSurveyBtn');
    if (run) {
      run.classList.add('primary');
      run.textContent = 'Run Flow Survey Assessment';
      actions.appendChild(run);
    }
    const monthlyButton = document.createElement('button');
    monthlyButton.type = 'button';
    monthlyButton.className = 'btn';
    monthlyButton.id = 'surveyMonthlyReviewBtn';
    monthlyButton.textContent = 'Monthly Review';
    monthlyButton.addEventListener('click', () => {
      const details = $('surveyMonthlyReview');
      if (details) {
        details.open = true;
        details.scrollIntoView({behavior:'smooth',block:'start'});
      }
    });
    actions.appendChild(monthlyButton);

    const settingsBody = $('surveyAssessmentSettingsBody');
    const population = $('surveyPopulation')?.closest('label');
    const cutoff = $('surveyApplyFaultCutoff');
    const tolerance = $('surveyBalanceTolerance')?.closest('label');
    if (population) settingsBody.appendChild(population);
    if (tolerance) settingsBody.appendChild(tolerance);
    if (cutoff) {
      const wrap = cutoff.closest('label') || cutoff.parentElement;
      if (wrap) settingsBody.appendChild(wrap);
    }
    const methodNote = document.createElement('div');
    methodNote.className = 'w26-method-note';
    methodNote.innerHTML = '<strong>Calculation policy</strong><span>FDV, network rainfall/WAPUG, Event Response and volume-balance calculations continue to use the existing validated browser-local Python engines. This layer only reorganises presentation and records engineer review.</span>';
    settingsBody.appendChild(methodNote);

    const complete = $('completeSurveyPanel');
    if (complete) {
      complete.classList.add('w26-monitor-review-panel');
      const h = complete.querySelector('.subhead h3');
      const p = complete.querySelector('.subhead p');
      if (h) h.textContent = 'Monitor Review';
      if (p) p.textContent = 'One monitor per row. Start with the calculated result, then open a monitor for weekly, event-response and technical evidence or a traceable engineer review.';
      const oldButton = complete.querySelector('.subhead #runCompleteSurveyBtn');
      if (oldButton) oldButton.remove();
      let detail = $('surveyMonitorDetail');
      if (!detail) {
        detail = document.createElement('div');
        detail.id = 'surveyMonitorDetail';
        detail.className = 'w26-monitor-detail';
        const monitors = $('completeSurveyMonitors');
        if (monitors) monitors.insertAdjacentElement('afterend', detail);
      }
      const eventTarget = $('surveyEventResponse');
      if (eventTarget && !$('surveyAllEventEvidence')) {
        const oldTitle = eventTarget.previousElementSibling;
        const evidence = document.createElement('details');
        evidence.id = 'surveyAllEventEvidence';
        evidence.className = 'w26-technical-evidence';
        evidence.innerHTML = '<summary>All-monitor Event Response evidence</summary>';
        if (oldTitle?.matches('h3')) oldTitle.remove();
        eventTarget.insertAdjacentElement('beforebegin', evidence);
        evidence.appendChild(eventTarget);
      }
    }

    const rainfall = document.createElement('section');
    rainfall.id = 'surveyRainfallReview';
    rainfall.className = 'subpanel w26-rainfall-review';
    rainfall.innerHTML =
      '<div class="subhead"><div><h3>Rainfall Review</h3><p>Flow Survey network rainfall assessment. This is separate from the standalone Data / Time Series WAPUG overlay.</p></div></div>' +
      '<div id="surveyRainfallSummary"></div>' +
      '<div class="w26-review-section"><div class="w26-section-head"><div><h4>Gauge Review</h4><p>Operational support and fault evidence.</p></div></div><div id="surveyGaugeReview"></div><div id="surveyGaugeDetail" class="w26-monitor-detail"></div></div>' +
      '<div class="w26-review-section"><div class="w26-section-head"><div><h4>Event Review</h4><p>Candidate events and network WAPUG qualification.</p></div></div><div id="surveyEventReview"></div></div>' +
      '<details class="w26-technical-evidence" id="surveyRainfallTechnical"><summary>Technical / single-monitor evidence</summary></details>';
    const balance = $('surveyBalancePanel');
    if (balance) balance.insertAdjacentElement('beforebegin', rainfall);
    else panel.appendChild(rainfall);
    const professional = document.querySelector('.survey-professional');
    if (professional) {
      professional.classList.add('w26-legacy-professional');
      $('surveyRainfallTechnical')?.appendChild(professional);
    }

    if (balance && !$('surveyBalanceEngineerReview')) {
      const review = document.createElement('div');
      review.id = 'surveyBalanceEngineerReview';
      review.className = 'w26-review-section';
      review.innerHTML =
        '<div class="w26-section-head"><div><h4>Engineer-reviewed balance outcomes</h4><p>Review weekly path RAG without changing volumes, support, legacy FSAT evidence or calculated recommendations.</p></div></div>'+
        '<div id="surveyBalanceReviewTable"></div><div id="surveyBalanceReviewDetail" class="w26-monitor-detail"></div>';
      const table = $('surveyBalanceTable');
      if (table) table.insertAdjacentElement('afterend', review);
      else balance.appendChild(review);
    }

    const assoc = $('surveyAssociationPanel');
    if (assoc) {
      const h = assoc.querySelector('.subhead h3');
      if (h) h.textContent = 'Survey configuration · fm_rg_assoc.xlsx';
    }

    panel.addEventListener('click', event => {
      const open = event.target.closest('[data-w26-monitor]');
      if (open) {
        survey.selectedMonitor = open.dataset.w26Monitor;
        renderMonitorDetail();
        $('surveyMonitorDetail')?.scrollIntoView({behavior:'smooth',block:'nearest'});
        return;
      }
      const save = event.target.closest('#surveyReviewApply');
      if (save) {
        const name = save.dataset.monitor;
        const status = $('surveyReviewStatus')?.value || calculatedMonitorStatus(monitorByName(name));
        const reason = $('surveyReviewReason')?.value || '';
        const reviewer = $('surveyReviewer')?.value || '';
        const error = $('surveyReviewError');
        try {
          applyMonitorReview(name,status,reason,reviewer);
          if (error) error.textContent = '';
        } catch (err) {
          if (error) error.textContent = String(err?.message || err);
        }
        return;
      }
      const revert = event.target.closest('#surveyReviewRevert');
      if (revert) revertMonitorReview(revert.dataset.monitor);
    });

    const observed = [$('completeSurveySummary'), $('surveyBalanceSummary'), $('surveyAssociationStatus')].filter(Boolean);
    for (const node of observed) {
      new MutationObserver(() => queueMicrotask(renderAll)).observe(node,{childList:true,subtree:true,characterData:true});
    }
    ['analysisStart','analysisEnd','surveyPopulation','surveyApplyFaultCutoff','surveyBalanceTolerance'].forEach(id => {
      $(id)?.addEventListener('change', () => queueMicrotask(renderAll));
    });
    window.addEventListener('icm:source-pool-changed', () => queueMicrotask(renderAll));
  }

  function renderHeader() {
    const root = $('surveyReviewReadiness');
    if (!root) return;
    const associationCount = survey.association?.records?.length || 0;
    const gauges = survey.batch?.network?.gauge_count || 0;
    const monitors = survey.batch?.monitors?.length || 0;
    const completeFresh = surveyFresh('complete');
    const balanceFresh = surveyFresh('balance');
    const associationState = associationCount ? statusPill('Ready','good') : statusPill('Required','warn');
    const monitorState = !survey.batch ? statusPill('Not run','neutral') : completeFresh ? statusPill('Current','good') : statusPill('Stale','warn');
    const rainState = !survey.batch ? statusPill('Not run','neutral') : completeFresh ? statusPill('Current','good') : statusPill('Stale','warn');
    const balanceState = !survey.balance ? statusPill('Not run','neutral') : balanceFresh ? statusPill('Current','good') : statusPill('Stale','warn');
    root.innerHTML =
      '<div><span>Assessment period</span><strong>'+esc(surveyPeriodText())+'</strong></div>' +
      '<div><span>fm_rg_assoc</span><strong>'+associationState+' '+associationCount+' monitor'+(associationCount===1?'':'s')+'</strong></div>' +
      '<div><span>Monitor assessment</span><strong>'+monitorState+' '+monitors+' loaded</strong></div>' +
      '<div><span>Rainfall assessment</span><strong>'+rainState+' '+gauges+' gauge'+(gauges===1?'':'s')+'</strong></div>' +
      '<div><span>Volume balance</span><strong>'+balanceState+'</strong></div>';
  }

  function renderMonitorReview() {
    const target = $('completeSurveyMonitors');
    if (!target) return;
    const monitors = survey.batch?.monitors || [];
    if (!monitors.length) {
      target.innerHTML = '<div class="pool-summary">Run Flow Survey Assessment to populate monitor review.</div>';
      renderMonitorDetail();
      return;
    }
    const rows = monitors.map(monitor => {
      const s = monitorSummary(monitor);
      const state = s.state;
      const reviewText = state.review
        ? (state.review_current
          ? ragPill(state.reviewed,'Reviewed '+state.reviewed)
          : statusPill('Review needs reconfirmation','warn'))
        : '<span class="w26-muted">Calculated result</span>';
      const weekly = '<span class="w26-week-counts">'+
        ragPill('Green','G '+s.counts.Green)+' '+
        ragPill('Amber','A '+s.counts.Amber)+' '+
        ragPill('Red','R '+s.counts.Red)+'</span>';
      const eventText = s.events.length ? (s.failures ? s.failures+' flagged / '+s.events.length : s.events.length+' reviewed') : 'No qualified rows';
      return '<tr>'+
        '<td><strong>'+esc(monitor.monitor)+'</strong><small>'+esc(monitor.status || '—')+'</small></td>'+
        '<td>'+esc(monitor.rain_gauge || '—')+'</td>'+
        '<td>'+(monitor.diameter_mm == null ? '—' : fmt(monitor.diameter_mm,0)+' mm')+'</td>'+
        '<td>'+weekly+'</td>'+
        '<td>'+esc(eventText)+'</td>'+
        '<td>'+ragPill(state.calculated)+'</td>'+
        '<td>'+reviewText+'</td>'+
        '<td><button type="button" class="btn quiet w26-review-button" data-w26-monitor="'+esc(monitor.monitor)+'">Details / Review</button></td>'+
        '</tr>';
    }).join('');
    target.innerHTML =
      '<div class="survey-table-wrap"><table class="data-table survey-table w26-monitor-table"><thead><tr>'+
      '<th>Monitor</th><th>Mapped RG</th><th>Diameter</th><th>Weekly assessment</th><th>Event response</th><th>Calculated</th><th>Reviewed</th><th></th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table></div>';
    if (!survey.selectedMonitor || !monitorByName(survey.selectedMonitor)) {
      survey.selectedMonitor = monitors[0]?.monitor || null;
    }
    renderMonitorDetail();
  }

  function renderMonitorDetail() {
    const root = $('surveyMonitorDetail');
    if (!root) return;
    const monitor = monitorByName(survey.selectedMonitor);
    if (!monitor) {
      root.innerHTML = '<div class="w26-empty-detail">Select a monitor to inspect weekly and event-response evidence.</div>';
      return;
    }
    const summary = monitorSummary(monitor);
    const state = summary.state;
    const review = state.review;
    const mismatch = Boolean(review && !state.review_current);
    const selected = review?.reviewed_status || state.calculated;
    const weeks = summary.weeks.map(row =>
      '<tr><td>'+esc(row.week_ending || row.end || '—')+'</td><td>'+ragPill(row.rag)+'</td>'+
      '<td>'+fmt(row.depth_score,0)+'</td><td>'+fmt(row.velocity_score,0)+'</td><td>'+fmt(row.flow_score,0)+'</td>'+
      '<td>'+esc(row.decision_path || '—')+'</td></tr>'
    ).join('');
    const events = summary.events.map(row =>
      '<tr><td>'+esc(row.event || '—')+'</td><td>'+esc(row.event_start || '—')+'</td>'+
      '<td>'+esc(row.depth_velocity_response || '—')+'</td>'+
      '<td>'+(row.min_depth_at_peak_flow_m == null ? '—' : fmt(row.min_depth_at_peak_flow_m,3)+' m')+'</td>'+
      '<td>'+esc(row.min_depth_pass === true ? 'Pass' : row.min_depth_pass === false ? 'Fail' : '—')+'</td>'+
      '<td>'+fmt(row.response_ratio,2)+'</td>'+
      '<td>'+esc(row.response_ratio_pass === true ? 'Pass' : row.response_ratio_pass === false ? 'Fail' : '—')+'</td>'+
      '<td>'+esc((row.comments || []).join(' ') || '—')+'</td></tr>'
    ).join('');
    const options = ['Green','Amber','Red','Grey'].map(rag =>
      '<option value="'+rag+'" '+(normaliseRag(selected)===rag?'selected':'')+'>'+rag+'</option>'
    ).join('');
    root.innerHTML =
      '<div class="w26-detail-head"><div><span class="w26-eyebrow">Monitor detail</span><h4>'+esc(monitor.monitor)+'</h4><p>'+esc(monitor.rain_gauge || 'No mapped RG')+(monitor.diameter_mm!=null?' · '+fmt(monitor.diameter_mm,0)+' mm':'')+'</p></div>'+
      '<div class="w26-detail-status"><span>Calculated '+ragPill(state.calculated)+'</span><span>Current reported '+ragPill(state.reviewed)+'</span></div></div>'+
      (mismatch ? '<div class="w26-review-warning"><strong>Review needs reconfirmation.</strong> The calculated result is now '+esc(state.calculated)+' but the retained review was made against '+esc(review.calculated_status_at_review)+'. Until reconfirmed, the calculated result remains the current reported assessment.</div>' : '')+
      '<div class="w26-detail-grid">'+
        '<section><div class="w26-section-head"><div><h5>Weekly assessment</h5><p>Existing automated weekly evidence; no recalculation is performed here.</p></div></div>'+
          '<div class="table-wrap"><table class="data-table"><thead><tr><th>Week</th><th>RAG</th><th>Depth</th><th>Velocity</th><th>Flow</th><th>Decision path</th></tr></thead><tbody>'+(weeks || '<tr><td colspan="6">No weekly evidence.</td></tr>')+'</tbody></table></div></section>'+
        '<section><div class="w26-section-head"><div><h5>Engineer Review</h5><p>Supersede the calculated assessment only when site/monitor context justifies it.</p></div></div>'+
          '<div class="w26-review-form">'+
            '<label>Reviewed assessment<select id="surveyReviewStatus">'+options+'</select></label>'+
            '<label>Reviewer (optional)<input id="surveyReviewer" value="'+esc(review?.reviewer || '')+'" placeholder="Name / initials"></label>'+
            '<label class="w26-review-reason">Engineering reason<textarea id="surveyReviewReason" rows="3" placeholder="Required when the reviewed assessment differs from the calculated result.">'+esc(review?.reason || '')+'</textarea></label>'+
            '<div class="w26-review-meta">'+(review ? 'Last reviewed '+esc(new Date(review.reviewed_at).toLocaleString())+' · calculated at review '+esc(review.calculated_status_at_review) : 'No engineer review recorded.')+'</div>'+
            '<div id="surveyReviewError" class="w26-review-error" role="alert"></div>'+
            '<div class="actions left"><button type="button" class="btn primary" id="surveyReviewApply" data-monitor="'+esc(monitor.monitor)+'">Apply Engineer Review</button>'+
            (review ? '<button type="button" class="btn" id="surveyReviewRevert" data-monitor="'+esc(monitor.monitor)+'">Revert to Calculated</button>' : '')+'</div>'+
          '</div></section>'+
      '</div>'+
      '<details class="w26-technical-evidence"><summary>Event Response &amp; technical evidence</summary>'+
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>Event</th><th>Start</th><th>D/V response</th><th>Depth @ Qpeak</th><th>Min D</th><th>Response ratio</th><th>R</th><th>Comments</th></tr></thead><tbody>'+(events || '<tr><td colspan="8">No qualified Event Response rows.</td></tr>')+'</tbody></table></div>'+
        '<pre class="w26-contract-evidence">'+esc(JSON.stringify(monitor.contracts || {},null,2))+'</pre>'+
      '</details>';
  }

  function renderRainfallReview() {
    const summary = $('surveyRainfallSummary');
    const gaugesTarget = $('surveyGaugeReview');
    const eventsTarget = $('surveyEventReview');
    if (!summary || !gaugesTarget || !eventsTarget) return;
    const network = survey.batch?.network;
    if (!network) {
      summary.innerHTML = '<div class="pool-summary">Run Flow Survey Assessment to calculate the network rainfall review.</div>';
      gaugesTarget.innerHTML = '';
      eventsTarget.innerHTML = '';
      return;
    }
    const gauges = network.gauge_summary || [];
    const green = gauges.filter(row => normaliseRag(row.status)==='Green').length;
    const amber = gauges.filter(row => normaliseRag(row.status)==='Amber').length;
    const candidates = network.candidate_wapug_events || [];
    const qualified = network.qualified_wapug_events || [];
    summary.innerHTML =
      '<div class="summary-box w26-summary-box">'+
      '<div><strong>'+gauges.length+'</strong><span>gauges assessed</span></div>'+
      '<div><strong>'+green+'</strong><span>Green</span></div>'+
      '<div><strong>'+amber+'</strong><span>Amber / review</span></div>'+
      '<div><strong>'+candidates.length+'</strong><span>candidate WAPUG events</span></div>'+
      '<div><strong>'+qualified.length+'</strong><span>network-qualified</span></div>'+
      '<div><strong>'+Number(network.non_uniform_day_count || 0)+'</strong><span>non-uniform days</span></div>'+
      '</div>';
    gaugesTarget.innerHTML = gauges.length
      ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Gauge</th><th>Operational coverage</th><th>Event strikes</th><th>Dynamic status</th><th>Fault / recovery</th><th>Status</th></tr></thead><tbody>'+
        gauges.map(row => '<tr><td><strong>'+esc(row.gauge)+'</strong></td><td>'+fmt(row.operational_coverage_percent,1)+'%</td>'+
        '<td>'+Number(row.event_strike_count || 0)+'</td><td>'+esc(row.current_dynamic_status || '—')+'</td>'+
        '<td>'+esc(row.suggested_fault_cutoff ? 'Suggested cutoff '+row.suggested_fault_cutoff : row.recovery_date ? 'Recovered '+row.recovery_date : 'No cutoff evidence')+'</td>'+
        '<td>'+ragPill(row.status)+'</td></tr>').join('')+'</tbody></table></div>'
      : '<div class="pool-summary">No assessable rain gauges.</div>';
    eventsTarget.innerHTML = candidates.length
      ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Event</th><th>Start</th><th>End</th><th>Duration</th><th>Operational gauges</th><th>Mean depth</th><th>Spatial CV</th><th>Network WAPUG</th></tr></thead><tbody>'+
        candidates.map(row => '<tr><td>'+esc(row.event)+'</td><td>'+esc(row.start || '—')+'</td><td>'+esc(row.end || '—')+'</td>'+
        '<td>'+fmt(row.duration_min,0)+' min</td><td>'+Number(row.operational_gauges || 0)+'</td>'+
        '<td>'+fmt(row.mean_depth_mm,2)+' mm</td><td>'+fmt(row.spatial_cv_percent,1)+'%</td>'+
        '<td>'+(row.qualifies_network_wapug ? statusPill('Qualified','good') : statusPill('Not qualified','neutral'))+'</td></tr>').join('')+
        '</tbody></table></div>'
      : '<div class="pool-summary">No candidate WAPUG events in the current Flow Survey assessment.</div>';
  }

  function monthlyActions() {
    const actions = [];
    for (const monitor of survey.batch?.monitors || []) {
      const state = reviewedMonitorState(monitor);
      if (state.historical_review) {
        actions.push({area:'Monitor',subject:monitor.monitor,severity:'Amber',action:'Reconfirm retained engineer review because the calculated assessment changed.'});
      } else if (state.reviewed === 'Red' || state.reviewed === 'Amber') {
        actions.push({area:'Monitor',subject:monitor.monitor,severity:state.reviewed,action:state.review?.reason || monitor.reason || 'Review weekly and Event Response evidence.'});
      }
    }
    for (const gauge of survey.batch?.network?.gauge_summary || []) {
      const rag = normaliseRag(gauge.status);
      if (rag === 'Amber' || rag === 'Red') {
        actions.push({area:'Rainfall',subject:gauge.gauge,severity:rag,action:gauge.suggested_fault_cutoff ? 'Review gauge fault/cutoff evidence.' : 'Review coverage and network consistency evidence.'});
      }
    }
    for (const row of (survey.balance || survey.batch?.volume_balance)?.rows || []) {
      const rag = normaliseRag(row.rag);
      if (rag === 'Amber' || rag === 'Red') {
        actions.push({area:'Volume balance',subject:row.downstream_monitor || 'Network path',severity:rag,action:row.recommendation || row.likely_source || 'Review upstream/downstream support and network context.'});
      }
    }
    return actions;
  }

  function renderMonthlyReview() {
    const root = $('surveyMonthlyReviewBody');
    if (!root) return;
    if (!survey.batch) {
      root.innerHTML = '<div class="pool-summary">Monthly Review becomes available after Flow Survey Assessment is run.</div>';
      return;
    }
    const monitors = survey.batch.monitors || [];
    const counts = {Green:0,Amber:0,Red:0,Grey:0};
    let historical = 0;
    for (const monitor of monitors) {
      const state = reviewedMonitorState(monitor);
      counts[state.reviewed] += 1;
      if (state.historical_review) historical += 1;
    }
    const network = survey.batch.network || {};
    const qualified = network.qualified_wapug_events?.length || 0;
    const balance = survey.balance || survey.batch.volume_balance || {};
    const actions = monthlyActions();
    const actionRows = actions.map(item =>
      '<tr><td>'+esc(item.area)+'</td><td><strong>'+esc(item.subject)+'</strong></td><td>'+ragPill(item.severity)+'</td><td>'+esc(item.action)+'</td></tr>'
    ).join('');
    root.innerHTML =
      '<div class="w26-monthly-grid">'+
        '<div><span>Monitor status</span><strong>'+counts.Green+' G · '+counts.Amber+' A · '+counts.Red+' R · '+counts.Grey+' Grey</strong></div>'+
        '<div><span>Network WAPUG events</span><strong>'+qualified+'</strong></div>'+
        '<div><span>Rain gauges</span><strong>'+Number(network.gauge_count || 0)+'</strong></div>'+
        '<div><span>Volume balance</span><strong>'+Number(balance.summary?.Green || 0)+' G · '+Number(balance.summary?.Amber || 0)+' A · '+Number(balance.summary?.Red || 0)+' R</strong></div>'+
        '<div><span>Review integrity</span><strong>'+(historical ? historical+' review'+(historical===1?'':'s')+' need reconfirmation' : 'Current')+'</strong></div>'+
      '</div>'+
      '<div class="w26-section-head"><div><h4>Engineering action register</h4><p>Exceptions only. Final judgement remains traceable to the calculated evidence and any explicit engineer review.</p></div></div>'+
      (actionRows ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Area</th><th>Subject</th><th>Severity</th><th>Action / rationale</th></tr></thead><tbody>'+actionRows+'</tbody></table></div>' : '<div class="w26-good-state">No Amber/Red monitor, rainfall or volume-balance exceptions in the current assessment.</div>');
  }

  function renderAll() {
    renderHeader();
    renderMonitorReview();
    renderRainfallReview();
    renderMonthlyReview();
  }

  function reportHtml() {
    if (!survey.batch && !Object.keys(survey.reviews || {}).length) return '';
    const rows = (survey.batch?.monitors || []).map(monitor => {
      const state = reviewedMonitorState(monitor);
      const review = state.review;
      const final = state.review_current ? state.reviewed : state.calculated;
      const note = review
        ? (state.review_current ? review.reason || 'Engineer review recorded.' : 'Retained review is stale because the calculated result changed; calculated result reported until reconfirmed.')
        : 'No engineer override.';
      return '<tr><td>'+esc(monitor.monitor)+'</td><td>'+esc(state.calculated)+'</td><td>'+esc(final)+'</td><td>'+esc(note)+'</td><td>'+esc(review?.reviewer || '—')+'</td><td>'+esc(review?.reviewed_at || '—')+'</td></tr>';
    }).join('');
    return '<h3>Engineer review / final assessment</h3><div class="note">Calculated results are retained separately from reviewed results. A review made against a different calculated status is reported as stale and does not silently supersede the new calculation.</div>'+
      '<div class="table-wrap"><table><thead><tr><th>Monitor</th><th>Calculated</th><th>Reported</th><th>Engineering rationale / review state</th><th>Reviewer</th><th>Reviewed at</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  function installPersistence() {
    if (typeof workspaceObject === 'function') {
      const coreWorkspaceObject = workspaceObject;
      workspaceObject = function(...args) {
        const value = coreWorkspaceObject(...args);
        value.survey = value.survey || {};
        value.survey.engineer_reviews = JSON.parse(JSON.stringify(survey.reviews || {}));
        value.survey.review_schema_version = 1;
        return value;
      };
    }
    if (typeof applyWorkspace === 'function') {
      const coreApplyWorkspace = applyWorkspace;
      applyWorkspace = async function(value) {
        const result = await coreApplyWorkspace(value);
        survey.reviews = value?.survey?.engineer_reviews && typeof value.survey.engineer_reviews === 'object'
          ? JSON.parse(JSON.stringify(value.survey.engineer_reviews))
          : {};
        survey.selectedMonitor = null;
        renderAll();
        return result;
      };
    }
  }

  ensureUi();
  installPersistence();
  wb.workflow26ReportHtml = reportHtml;
  wb.workflow26 = {
    version:1,
    calculatedMonitorStatus,
    reviewedMonitorState,
    applyMonitorReview,
    revertMonitorReview,
    render:renderAll,
    selectMonitor:name => { survey.selectedMonitor = name; renderMonitorDetail(); },
  };
  renderAll();
})();
