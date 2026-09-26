(() => {
  'use strict';

  const wb = window.__ICM_WORKBENCH__ || (window.__ICM_WORKBENCH__ = {});
  const survey = wb.survey;
  if (!survey) return;

  survey.reviews = survey.reviews && typeof survey.reviews === 'object' ? survey.reviews : {};
  survey.monitorComments = survey.monitorComments && typeof survey.monitorComments === 'object' ? survey.monitorComments : {};
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

  function monitorComment(name) {
    return survey.monitorComments[String(name || '')] || null;
  }

  function saveMonitorComment(name, text='', author='') {
    const monitor = monitorByName(name);
    if (!monitor) throw new Error('The selected monitor is not present in the current Flow Survey assessment.');
    const clean = String(text || '').trim();
    if (!clean) {
      delete survey.monitorComments[String(name)];
      renderAll();
      return null;
    }
    const previous = monitorComment(name);
    survey.monitorComments[String(name)] = {
      monitor:String(name),
      text:clean,
      author:String(author || '').trim() || previous?.author || null,
      updated_at:nowIso(),
      method:'engineer-comment-v1',
    };
    renderAll();
    return survey.monitorComments[String(name)];
  }

  function clearMonitorComment(name) {
    delete survey.monitorComments[String(name || '')];
    renderAll();
  }

  function isBoundaryShortWeek(row) {
    const start = new Date(row?.start || '');
    const end = new Date(row?.end || '');
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
    return (end.getTime() - start.getTime()) <= 3 * 86400000;
  }

  function calculatedMonitorStatus(monitor) {
    if (!monitor || monitor.status !== 'complete') return 'Grey';
    const weeks = monitor.weekly?.weeks || [];
    if (!weeks.length) return 'Grey';
    // Boundary fragments are still shown in the weekly evidence, but they do
    // not dictate a month-long RAG when substantive (>3 day) weeks exist.
    // If the monitor has only short support, preserve that evidence rather
    // than silently upgrading an incomplete survey.
    const substantive = weeks.filter(row => !isBoundaryShortWeek(row));
    const assessmentWeeks = substantive.length ? substantive : weeks;
    return worstRag(assessmentWeeks.map(row => row.rag));
  }

  function reviewKey(kind, id) {
    return kind + ':' + String(id || '');
  }

  function reviewFor(kind, id) {
    return survey.reviews[reviewKey(kind, id)] || null;
  }

  function calculationSignatureFor(kind) {
    if (kind === 'balance') return survey.balanceSignature || survey.batchSignature || null;
    return survey.batchSignature || null;
  }

  function reviewCurrent(review, calculated, currentSignature=null) {
    if (!review || normaliseRag(review.calculated_status_at_review) !== normaliseRag(calculated)) return false;
    const reviewedSignature = review.calculation_signature_at_review || null;
    if (reviewedSignature && currentSignature && reviewedSignature !== currentSignature) return false;
    return true;
  }

  function reviewedState(kind, id, calculatedStatus) {
    const calculated = normaliseRag(calculatedStatus);
    const review = reviewFor(kind, id);
    const signature = calculationSignatureFor(kind);
    const current = reviewCurrent(review, calculated, signature);
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
      calculation_signature_at_review:calculationSignatureFor(kind),
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
    const substantiveWeeks = weeks.filter(row => !isBoundaryShortWeek(row));
    return {
      weeks,counts,events,failures,state,
      substantiveWeeks:substantiveWeeks.length,
      boundaryWeeks:weeks.length-substantiveWeeks.length,
      monthlyBasis:substantiveWeeks.length ? 'substantive weeks (>3 days)' : 'all available weeks (limited support)',
    };
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
          '<div class="actions left"><button type="button" class="btn" data-w26-review-apply>Apply Engineer Review</button>'+
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

    const pdfButton = document.createElement('button');
    pdfButton.type = 'button';
    pdfButton.className = 'btn';
    pdfButton.id = 'surveyMonthlyPdfBtn';
    pdfButton.textContent = 'Export Monthly PDF';
    pdfButton.title = 'Opens the browser print dialog with an A4 monthly assessment; choose Save as PDF.';
    pdfButton.addEventListener('click', () => {
      try {
        exportMonthlyPdf();
      } catch (err) {
        const status = $('completeSurveyStatus');
        if (status) status.textContent = String(err?.message || err);
      }
    });
    actions.appendChild(pdfButton);

    const runStatus = $('completeSurveyStatus');
    if (runStatus) {
      runStatus.classList.add('w26-run-status');
      $('surveyReviewReadiness')?.insertAdjacentElement('afterend', runStatus);
    }

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
      const gaugeOpen = event.target.closest('[data-w26-gauge]');
      if (gaugeOpen) {
        survey.selectedGauge = gaugeOpen.dataset.w26Gauge;
        renderGaugeDetail();
        $('surveyGaugeDetail')?.scrollIntoView({behavior:'smooth',block:'nearest'});
        return;
      }
      const balanceOpen = event.target.closest('[data-w26-balance]');
      if (balanceOpen) {
        survey.selectedBalanceKey = balanceOpen.dataset.w26Balance;
        renderBalanceReview();
        $('surveyBalanceReviewDetail')?.scrollIntoView({behavior:'smooth',block:'nearest'});
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
      if (revert) {
        revertMonitorReview(revert.dataset.monitor);
        return;
      }
      const commentSave = event.target.closest('#surveyMonitorCommentSave');
      if (commentSave) {
        const error = $('surveyMonitorCommentError');
        try {
          saveMonitorComment(
            commentSave.dataset.monitor,
            $('surveyMonitorComment')?.value || '',
            $('surveyMonitorCommentAuthor')?.value || ''
          );
          if (error) error.textContent = '';
        } catch (err) {
          if (error) error.textContent = String(err?.message || err);
        }
        return;
      }
      const commentClear = event.target.closest('#surveyMonitorCommentClear');
      if (commentClear) {
        clearMonitorComment(commentClear.dataset.monitor);
        return;
      }
      const genericSave = event.target.closest('[data-w26-review-apply]');
      if (genericSave) {
        const form = genericSave.closest('.w26-inline-review');
        const kind = form?.dataset.reviewKind;
        const id = form?.dataset.reviewId;
        const error = form?.querySelector('.w26-review-error');
        let calculated = 'Grey';
        if (kind === 'gauge') calculated = normaliseRag(gaugeByName(id)?.status);
        if (kind === 'balance') calculated = normaliseRag(balanceRowByKey(id)?.rag);
        try {
          applyReview(
            kind,
            id,
            calculated,
            form?.querySelector('.w26-reviewed-status')?.value || calculated,
            form?.querySelector('.w26-review-reason-input')?.value || '',
            form?.querySelector('.w26-reviewer-input')?.value || ''
          );
          if (error) error.textContent = '';
        } catch (err) {
          if (error) error.textContent = String(err?.message || err);
        }
        return;
      }
      const genericRevert = event.target.closest('[data-w26-review-revert]');
      if (genericRevert) {
        const form = genericRevert.closest('.w26-inline-review');
        revertReview(form?.dataset.reviewKind, form?.dataset.reviewId);
      }
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
      const comment = monitorComment(monitor.monitor);
      const commentText = comment ? '<span class="w27-comment-indicator" title="'+esc(comment.text)+'">Comment added</span>' : '<span class="w26-muted">—</span>';
      return '<tr>'+
        '<td><strong>'+esc(monitor.monitor)+'</strong><small>'+esc(monitor.status || '—')+'</small></td>'+
        '<td>'+esc(monitor.rain_gauge || '—')+'</td>'+
        '<td>'+(monitor.diameter_mm == null ? '—' : fmt(monitor.diameter_mm,0)+' mm')+'</td>'+
        '<td>'+weekly+'</td>'+
        '<td>'+esc(eventText)+'</td>'+
        '<td>'+ragPill(state.calculated)+'</td>'+
        '<td>'+reviewText+'</td>'+
        '<td>'+commentText+'</td>'+
        '<td><button type="button" class="btn quiet w26-review-button" data-w26-monitor="'+esc(monitor.monitor)+'">Details / Review</button></td>'+
        '</tr>';
    }).join('');
    target.innerHTML =
      '<div class="survey-table-wrap"><table class="data-table survey-table w26-monitor-table"><thead><tr>'+
      '<th>Monitor</th><th>Mapped RG</th><th>Diameter</th><th>Weekly assessment</th><th>Event response</th><th>Calculated</th><th>Reviewed</th><th>Comment</th><th></th>'+
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
    const comment = monitorComment(monitor.monitor);
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
      '<div class="w26-detail-head"><div><span class="w26-eyebrow">Monitor detail</span><h4>'+esc(monitor.monitor)+'</h4><p>'+esc(monitor.rain_gauge || 'No mapped RG')+(monitor.diameter_mm!=null?' · '+fmt(monitor.diameter_mm,0)+' mm':'')+' · Monthly RAG from '+esc(summary.monthlyBasis)+(summary.boundaryWeeks?' · '+summary.boundaryWeeks+' boundary week'+(summary.boundaryWeeks===1?'':'s')+' retained as evidence':'')+'</p></div>'+
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
            '<div class="actions left"><button type="button" class="btn" id="surveyReviewApply" data-monitor="'+esc(monitor.monitor)+'">Apply Engineer Review</button>'+
            (review ? '<button type="button" class="btn" id="surveyReviewRevert" data-monitor="'+esc(monitor.monitor)+'">Revert to Calculated</button>' : '')+'</div>'+
          '</div></section>'+
        '<section class="w27-comment-section"><div class="w26-section-head"><div><h5>Engineering comments</h5><p>Record site context without changing the automated score. These comments flow into Monthly Review and the monthly PDF.</p></div></div>'+
          '<div class="w26-review-form">'+
            '<label class="w26-review-reason">Monitor comment<textarea id="surveyMonitorComment" rows="4" placeholder="e.g. Tidal impact noted; pumping influence noted; overflow-link behaviour is expected.">'+esc(comment?.text || '')+'</textarea></label>'+
            '<label>Author (optional)<input id="surveyMonitorCommentAuthor" value="'+esc(comment?.author || review?.reviewer || '')+'" placeholder="Name / initials"></label>'+
            '<div class="w26-review-meta">'+(comment ? 'Updated '+esc(new Date(comment.updated_at).toLocaleString()) : 'No engineering comment recorded.')+'</div>'+
            '<div id="surveyMonitorCommentError" class="w26-review-error" role="alert"></div>'+
            '<div class="actions left"><button type="button" class="btn" id="surveyMonitorCommentSave" data-monitor="'+esc(monitor.monitor)+'">Save Comment</button>'+
            (comment ? '<button type="button" class="btn quiet" id="surveyMonitorCommentClear" data-monitor="'+esc(monitor.monitor)+'">Clear Comment</button>' : '')+'</div>'+
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
      renderGaugeDetail();
      return;
    }
    const gauges = network.gauge_summary || [];
    const reviewedCounts = {Green:0,Amber:0,Red:0,Grey:0};
    let staleReviews = 0;
    for (const gauge of gauges) {
      const state = reviewedGaugeState(gauge);
      reviewedCounts[state.reviewed] += 1;
      if (state.historical_review) staleReviews += 1;
    }
    const candidates = network.candidate_wapug_events || [];
    const qualified = network.qualified_wapug_events || [];
    summary.innerHTML =
      '<div class="summary-box w26-summary-box">'+
      '<div><strong>'+gauges.length+'</strong><span>gauges assessed</span></div>'+
      '<div><strong>'+reviewedCounts.Green+'</strong><span>reported Green</span></div>'+
      '<div><strong>'+reviewedCounts.Amber+'</strong><span>reported Amber</span></div>'+
      '<div><strong>'+candidates.length+'</strong><span>candidate WAPUG events</span></div>'+
      '<div><strong>'+qualified.length+'</strong><span>network-qualified</span></div>'+
      '<div><strong>'+(staleReviews ? staleReviews+' stale review'+(staleReviews===1?'':'s') : Number(network.non_uniform_day_count || 0))+'</strong><span>'+(staleReviews?'review integrity':'non-uniform days')+'</span></div>'+
      '</div>';
    gaugesTarget.innerHTML = gauges.length
      ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Gauge</th><th>Operational coverage</th><th>Event strikes</th><th>Dynamic status</th><th>Fault / recovery</th><th>Calculated</th><th>Reviewed</th><th></th></tr></thead><tbody>'+
        gauges.map(row => {
          const state = reviewedGaugeState(row);
          const reviewed = state.review
            ? (state.review_current ? ragPill(state.reviewed,'Reviewed '+state.reviewed) : statusPill('Reconfirm','warn'))
            : '<span class="w26-muted">Calculated result</span>';
          return '<tr><td><strong>'+esc(row.gauge)+'</strong></td><td>'+fmt(row.operational_coverage_percent,1)+'%</td>'+
            '<td>'+Number(row.event_strike_count || 0)+'</td><td>'+esc(row.current_dynamic_status || '—')+'</td>'+
            '<td>'+esc(row.suggested_fault_cutoff ? 'Suggested cutoff '+row.suggested_fault_cutoff : row.recovery_date ? 'Recovered '+row.recovery_date : 'No cutoff evidence')+'</td>'+
            '<td>'+ragPill(state.calculated)+'</td><td>'+reviewed+'</td>'+
            '<td><button type="button" class="btn quiet w26-review-button" data-w26-gauge="'+esc(row.gauge)+'">Details / Review</button></td></tr>';
        }).join('')+'</tbody></table></div>'
      : '<div class="pool-summary">No assessable rain gauges.</div>';
    eventsTarget.innerHTML = candidates.length
      ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Event</th><th>Start</th><th>End</th><th>Duration</th><th>Operational gauges</th><th>Mean depth</th><th>Spatial CV</th><th>Network WAPUG</th></tr></thead><tbody>'+
        candidates.map(row => '<tr><td>'+esc(row.event)+'</td><td>'+esc(row.start || '—')+'</td><td>'+esc(row.end || '—')+'</td>'+
        '<td>'+fmt(row.duration_min,0)+' min</td><td>'+Number(row.operational_gauges || 0)+'</td>'+
        '<td>'+fmt(row.mean_depth_mm,2)+' mm</td><td>'+fmt(row.spatial_cv_percent,1)+'%</td>'+
        '<td>'+(row.qualifies_network_wapug ? statusPill('Qualified','good') : statusPill('Not qualified','neutral'))+'</td></tr>').join('')+
        '</tbody></table></div>'
      : '<div class="pool-summary">No candidate WAPUG events in the current Flow Survey assessment.</div>';
    if (!survey.selectedGauge || !gaugeByName(survey.selectedGauge)) survey.selectedGauge = gauges[0]?.gauge || null;
    renderGaugeDetail();
  }

  function renderGaugeDetail() {
    const root = $('surveyGaugeDetail');
    if (!root) return;
    const gauge = gaugeByName(survey.selectedGauge);
    if (!gauge) {
      root.innerHTML = '<div class="w26-empty-detail">Select a rain gauge to inspect evidence or record an engineer review.</div>';
      return;
    }
    const state = reviewedGaugeState(gauge);
    const evidence =
      'Operational coverage '+fmt(gauge.operational_coverage_percent,1)+'% · '+
      Number(gauge.event_strike_count || 0)+' event strike'+(Number(gauge.event_strike_count || 0)===1?'':'s')+
      (gauge.current_dynamic_status ? ' · dynamic status '+String(gauge.current_dynamic_status) : '')+
      (gauge.suggested_fault_cutoff ? ' · suggested cutoff '+String(gauge.suggested_fault_cutoff) : '');
    root.innerHTML =
      genericReviewFormHtml(
        'gauge',
        gauge.gauge,
        state,
        'Gauge '+gauge.gauge,
        evidence+'. Override only the reported engineering assessment; fault evidence and WAPUG calculations remain unchanged.'
      )+
      '<details class="w26-technical-evidence"><summary>Gauge calculation evidence</summary><pre class="w26-contract-evidence">'+esc(JSON.stringify(gauge,null,2))+'</pre></details>';
  }

  function renderBalanceReview() {
    const table = $('surveyBalanceReviewTable');
    const detail = $('surveyBalanceReviewDetail');
    if (!table || !detail) return;
    const rows = balanceRows();
    if (!rows.length) {
      table.innerHTML = '<div class="pool-summary">No volume-balance rows are available for engineer review.</div>';
      detail.innerHTML = '';
      return;
    }
    table.innerHTML =
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Week</th><th>Network path</th><th>Calculated</th><th>Reviewed</th><th>Calculated recommendation</th><th></th></tr></thead><tbody>'+
      rows.map(row => {
        const key = balanceRowKey(row);
        const state = reviewedBalanceState(row);
        const reviewed = state.review
          ? (state.review_current ? ragPill(state.reviewed,'Reviewed '+state.reviewed) : statusPill('Reconfirm','warn'))
          : '<span class="w26-muted">Calculated result</span>';
        const path = (row.upstream_monitors || []).join(' + ')+' → '+String(row.downstream_monitor || '—');
        return '<tr><td>'+esc(row.week_ending || '—')+'</td><td><strong>'+esc(path)+'</strong></td>'+
          '<td>'+ragPill(state.calculated)+'</td><td>'+reviewed+'</td>'+
          '<td>'+esc(row.recommendation || row.likely_source || '—')+'</td>'+
          '<td><button type="button" class="btn quiet w26-review-button" data-w26-balance="'+esc(key)+'">Details / Review</button></td></tr>';
      }).join('')+'</tbody></table></div>';
    if (!survey.selectedBalanceKey || !balanceRowByKey(survey.selectedBalanceKey)) {
      survey.selectedBalanceKey = balanceRowKey(rows[0]);
    }
    const row = balanceRowByKey(survey.selectedBalanceKey);
    if (!row) {
      detail.innerHTML = '';
      return;
    }
    const state = reviewedBalanceState(row);
    const path = (row.upstream_monitors || []).join(' + ')+' → '+String(row.downstream_monitor || '—');
    const context = [
      'Week '+String(row.week_ending || '—'),
      row.balance_ratio == null ? null : 'ratio '+fmt(row.balance_ratio,3),
      row.legacy_fsat_status ? 'legacy '+String(row.legacy_fsat_status) : null,
      row.coverage_fraction == null ? null : 'coverage '+fmt(Number(row.coverage_fraction)*100,1)+'%',
    ].filter(Boolean).join(' · ');
    detail.innerHTML =
      genericReviewFormHtml(
        'balance',
        balanceRowKey(row),
        state,
        'Balance path '+path,
        context+'. Review changes only the reported RAG; volumes, common support, QA evidence and calculated recommendation remain immutable.'
      )+
      '<details class="w26-technical-evidence"><summary>Balance calculation evidence</summary><pre class="w26-contract-evidence">'+esc(JSON.stringify(row,null,2))+'</pre></details>';
  }

  function monthlyActions() {
    const actions = [];
    const network = survey.batch?.network || {};
    const candidates = network.candidate_wapug_events || [];
    const qualified = network.qualified_wapug_events || [];
    if (survey.batch && qualified.length === 0) {
      actions.push({
        area:'Event suitability',
        subject:'Network rainfall',
        severity:'Amber',
        action:candidates.length
          ? candidates.length+' WAPUG candidate event(s) were assessed but none met the network spatial/coverage criteria. Event Response is not assessed for this period; review Rainfall Check evidence or extend the monitoring period.'
          : 'No WAPUG candidate events were available. Event Response is not assessed for this period; extend the monitoring period if wet-weather verification is required.'
      });
    }
    for (const monitor of survey.batch?.monitors || []) {
      const state = reviewedMonitorState(monitor);
      if (state.historical_review) {
        actions.push({area:'Monitor',subject:monitor.monitor,severity:'Amber',action:'Reconfirm retained engineer review because the calculated assessment changed.'});
      } else if (state.reviewed === 'Red' || state.reviewed === 'Amber') {
        actions.push({area:'Monitor',subject:monitor.monitor,severity:state.reviewed,action:state.review?.reason || monitor.reason || 'Review weekly and Event Response evidence.'});
      }
    }
    for (const gauge of survey.batch?.network?.gauge_summary || []) {
      const state = reviewedGaugeState(gauge);
      if (state.historical_review) {
        actions.push({area:'Rainfall',subject:gauge.gauge,severity:'Amber',action:'Reconfirm retained gauge review because the calculated gauge assessment changed.'});
      } else if (state.reviewed === 'Amber' || state.reviewed === 'Red') {
        actions.push({
          area:'Rainfall',
          subject:gauge.gauge,
          severity:state.reviewed,
          action:state.review?.reason || (gauge.suggested_fault_cutoff ? 'Review gauge fault/cutoff evidence.' : 'Review coverage and network consistency evidence.')
        });
      }
    }
    for (const row of balanceRows()) {
      const state = reviewedBalanceState(row);
      const path = (row.upstream_monitors || []).join(' + ')+' → '+String(row.downstream_monitor || '—');
      if (state.historical_review) {
        actions.push({area:'Volume balance',subject:path,severity:'Amber',action:'Reconfirm retained balance review because the calculated RAG changed.'});
      } else if (state.reviewed === 'Amber' || state.reviewed === 'Red') {
        actions.push({
          area:'Volume balance',
          subject:path,
          severity:state.reviewed,
          action:state.review?.reason || row.recommendation || row.likely_source || 'Review upstream/downstream support and network context.'
        });
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
    const monitorCounts = {Green:0,Amber:0,Red:0,Grey:0};
    const gaugeCounts = {Green:0,Amber:0,Red:0,Grey:0};
    const balanceCounts = {Green:0,Amber:0,Red:0,Grey:0};
    let historical = 0;
    for (const monitor of survey.batch.monitors || []) {
      const state = reviewedMonitorState(monitor);
      monitorCounts[state.reviewed] += 1;
      if (state.historical_review) historical += 1;
    }
    for (const gauge of survey.batch.network?.gauge_summary || []) {
      const state = reviewedGaugeState(gauge);
      gaugeCounts[state.reviewed] += 1;
      if (state.historical_review) historical += 1;
    }
    for (const row of balanceRows()) {
      const state = reviewedBalanceState(row);
      balanceCounts[state.reviewed] += 1;
      if (state.historical_review) historical += 1;
    }
    const network = survey.batch.network || {};
    const qualified = network.qualified_wapug_events?.length || 0;
    const actions = monthlyActions();
    const actionRows = actions.map(item =>
      '<tr><td>'+esc(item.area)+'</td><td><strong>'+esc(item.subject)+'</strong></td><td>'+ragPill(item.severity)+'</td><td>'+esc(item.action)+'</td></tr>'
    ).join('');
    const commentRows = (survey.batch.monitors || []).map(monitor => {
      const comment = monitorComment(monitor.monitor);
      if (!comment?.text) return '';
      const state = reviewedMonitorState(monitor);
      return '<tr><td><strong>'+esc(monitor.monitor)+'</strong></td><td>'+ragPill(state.reviewed)+'</td><td>'+esc(comment.text)+'</td><td>'+esc(comment.author || '—')+'</td><td>'+esc(comment.updated_at ? new Date(comment.updated_at).toLocaleString() : '—')+'</td></tr>';
    }).filter(Boolean).join('');
    root.innerHTML =
      '<div class="w26-monthly-grid">'+
        '<div><span>Monitor status</span><strong>'+monitorCounts.Green+' G · '+monitorCounts.Amber+' A · '+monitorCounts.Red+' R · '+monitorCounts.Grey+' Grey</strong></div>'+
        '<div><span>Rain gauges</span><strong>'+gaugeCounts.Green+' G · '+gaugeCounts.Amber+' A · '+gaugeCounts.Red+' R · '+gaugeCounts.Grey+' Grey</strong></div>'+
        '<div><span>Network WAPUG events</span><strong>'+qualified+'</strong></div>'+
        '<div><span>Volume balance</span><strong>'+balanceCounts.Green+' G · '+balanceCounts.Amber+' A · '+balanceCounts.Red+' R · '+balanceCounts.Grey+' Grey</strong></div>'+
        '<div><span>Review integrity</span><strong>'+(historical ? historical+' review'+(historical===1?'':'s')+' need reconfirmation' : 'Current')+'</strong></div>'+
      '</div>'+
      '<div class="w26-section-head"><div><h4>Engineering action register</h4><p>Exceptions only. Reviewed outcomes drive this register; all calculated evidence remains available underneath.</p></div></div>'+
      (actionRows ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Area</th><th>Subject</th><th>Severity</th><th>Action / rationale</th></tr></thead><tbody>'+actionRows+'</tbody></table></div>' : '<div class="w26-good-state">No Amber/Red monitor, rainfall or volume-balance exceptions in the current reported assessment.</div>')+
      '<div class="w26-section-head"><div><h4>Monitor engineering comments</h4><p>Context recorded by the engineer independently of automated scoring.</p></div></div>'+
      (commentRows ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Monitor</th><th>Reported status</th><th>Comment</th><th>Author</th><th>Updated</th></tr></thead><tbody>'+commentRows+'</tbody></table></div>' : '<div class="pool-summary">No monitor comments recorded for this assessment.</div>');
  }

  function renderAll() {
    renderHeader();
    renderMonitorReview();
    renderRainfallReview();
    renderBalanceReview();
    renderMonthlyReview();
  }

  function monthlyReportHtml() {
    if (!survey.batch) throw new Error('Run Flow Survey Assessment before exporting the monthly report.');
    if (!surveyFresh('complete')) throw new Error('Flow Survey results are stale. Re-run the assessment before exporting the monthly PDF.');
    if (survey.balance && !surveyFresh('balance')) throw new Error('Volume-balance results are stale. Recalculate before exporting the monthly PDF.');

    const monitors = survey.batch.monitors || [];
    const network = survey.batch.network || {};
    const monitorRows = monitors.map(monitor => {
      const state = reviewedMonitorState(monitor);
      const comment = monitorComment(monitor.monitor);
      const review = state.review;
      const weekly = monitor.weekly?.weeks || [];
      const eventRows = monitor.event_response?.rows || [];
      return '<tr>'+
        '<td><strong>'+esc(monitor.monitor)+'</strong></td>'+
        '<td>'+esc(monitor.rain_gauge || '—')+'</td>'+
        '<td>'+(monitor.diameter_mm == null ? '—' : fmt(monitor.diameter_mm,0)+' mm')+'</td>'+
        '<td>'+esc(state.calculated)+'</td>'+
        '<td>'+esc(state.reviewed)+'</td>'+
        '<td>'+weekly.length+'</td>'+
        '<td>'+eventRows.length+'</td>'+
        '<td>'+esc(review?.reason || '—')+'</td>'+
        '<td>'+esc(comment?.text || '—')+'</td>'+
        '</tr>';
    }).join('');

    const gaugeRows = (network.gauge_summary || []).map(gauge => {
      const state = reviewedGaugeState(gauge);
      return '<tr><td><strong>'+esc(gauge.gauge)+'</strong></td>'+
        '<td>'+fmt(gauge.operational_coverage_percent,1)+'%</td>'+
        '<td>'+Number(gauge.event_strike_count || 0)+'</td>'+
        '<td>'+esc(gauge.current_dynamic_status || '—')+'</td>'+
        '<td>'+esc(state.calculated)+'</td><td>'+esc(state.reviewed)+'</td></tr>';
    }).join('');

    const qualifiedEvents = network.qualified_wapug_events || [];
    const eventRows = qualifiedEvents.map(event =>
      '<tr><td>'+esc(event.event || '—')+'</td><td>'+esc(event.start || '—')+'</td><td>'+esc(event.end || '—')+'</td>'+
      '<td>'+fmt(event.mean_depth_mm,2)+' mm</td><td>'+fmt(event.spatial_cv_percent,1)+'%</td><td>'+Number(event.operational_gauges || 0)+'</td></tr>'
    ).join('');

    const balanceRowsHtml = balanceRows().map(row => {
      const state = reviewedBalanceState(row);
      const path = (row.upstream_monitors || []).join(' + ')+' → '+String(row.downstream_monitor || '—');
      return '<tr><td>'+esc(row.week_ending || '—')+'</td><td>'+esc(path)+'</td><td>'+esc(state.calculated)+'</td><td>'+esc(state.reviewed)+'</td>'+
        '<td>'+fmt(row.balance_ratio,3)+'</td><td>'+esc(row.likely_source || '—')+'</td><td>'+esc(row.recommendation || '—')+'</td></tr>';
    }).join('');

    const actions = monthlyActions();
    const actionRows = actions.map(item =>
      '<tr><td>'+esc(item.area)+'</td><td><strong>'+esc(item.subject)+'</strong></td><td>'+esc(item.severity)+'</td><td>'+esc(item.action)+'</td></tr>'
    ).join('');

    const commentRows = monitors.map(monitor => {
      const comment = monitorComment(monitor.monitor);
      if (!comment?.text) return '';
      const state = reviewedMonitorState(monitor);
      return '<tr><td><strong>'+esc(monitor.monitor)+'</strong></td><td>'+esc(state.reviewed)+'</td><td>'+esc(comment.text)+'</td>'+
        '<td>'+esc(comment.author || '—')+'</td><td>'+esc(comment.updated_at || '—')+'</td></tr>';
    }).filter(Boolean).join('');

    const body =
      '<div class="note"><strong>Monthly engineering assessment.</strong> Automated calculations remain preserved separately from engineer-reviewed outcomes. Monitor comments capture contextual observations such as tidal or pumping influence without changing the calculated score.</div>'+
      '<h2>Assessment overview</h2>'+
      '<div class="report-grid">'+
        '<div class="card"><h3>Period</h3><p>'+esc(surveyPeriodText())+'</p></div>'+
        '<div class="card"><h3>Survey context</h3><p>'+Number(monitors.length)+' monitor(s) · '+Number(network.gauge_count || 0)+' rain gauge(s) · '+Number(qualifiedEvents.length)+' network-qualified WAPUG event(s)</p></div>'+
      '</div>'+
      '<h2>Monitor assessment</h2><div class="table-wrap"><table><thead><tr><th>Monitor</th><th>Rain gauge</th><th>Diameter</th><th>Calculated</th><th>Reported</th><th>Weeks</th><th>Events</th><th>Override rationale</th><th>Engineering comment</th></tr></thead><tbody>'+monitorRows+'</tbody></table></div>'+
      '<h2>Rainfall assessment</h2>'+(gaugeRows ? '<div class="table-wrap"><table><thead><tr><th>Gauge</th><th>Coverage</th><th>Event strikes</th><th>Dynamic status</th><th>Calculated</th><th>Reported</th></tr></thead><tbody>'+gaugeRows+'</tbody></table></div>' : '<p class="muted">No gauge assessment rows.</p>')+
      '<h3>Network-qualified WAPUG events</h3>'+(eventRows ? '<div class="table-wrap"><table><thead><tr><th>Event</th><th>Start</th><th>End</th><th>Mean depth</th><th>Spatial CV</th><th>Operational gauges</th></tr></thead><tbody>'+eventRows+'</tbody></table></div>' : '<p class="muted">No network-qualified WAPUG events.</p>')+
      '<h2>Volume balance</h2>'+(balanceRowsHtml ? '<div class="table-wrap"><table><thead><tr><th>Week</th><th>Network path</th><th>Calculated</th><th>Reported</th><th>Ratio</th><th>Likely source</th><th>Recommendation</th></tr></thead><tbody>'+balanceRowsHtml+'</tbody></table></div>' : '<p class="muted">No volume-balance relationships available.</p>')+
      '<h2>Engineering action register</h2>'+(actionRows ? '<div class="table-wrap"><table><thead><tr><th>Area</th><th>Subject</th><th>Severity</th><th>Action / rationale</th></tr></thead><tbody>'+actionRows+'</tbody></table></div>' : '<p class="muted">No Amber/Red exceptions in the current reported assessment.</p>')+
      '<h2>Monitor engineering comments</h2>'+(commentRows ? '<div class="table-wrap"><table><thead><tr><th>Monitor</th><th>Reported status</th><th>Comment</th><th>Author</th><th>Updated</th></tr></thead><tbody>'+commentRows+'</tbody></table></div>' : '<p class="muted">No monitor comments recorded.</p>')+
      '<h2>Audit note</h2><p class="muted">This monthly output is intended as a concise engineering hand-off. Detailed weekly calculations, Event Response evidence, raw gauge evidence, exclusions and source provenance remain available in the workbench/full HTML report.</p>';

    if (typeof reportShell === 'function') {
      return reportShell('ICM Graphing Tool — Monthly Flow Survey Assessment', surveyPeriodText(), body, true);
    }
    return '<!doctype html><html><head><meta charset="utf-8"><title>Monthly Flow Survey Assessment</title></head><body>'+body+'</body></html>';
  }

  function exportMonthlyPdf() {
    const html = monthlyReportHtml();
    const printable = html.replace(
      '</body>',
      '<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},250);});<\/script></body>'
    );
    const win = window.open('', '_blank');
    if (!win) throw new Error('The browser blocked the monthly PDF window. Allow pop-ups for this site and retry.');
    win.document.open();
    win.document.write(printable);
    win.document.close();
    const status = $('completeSurveyStatus');
    if (status) status.textContent = 'Monthly assessment opened in the print dialog. Choose Save as PDF to create the file for Copilot/report hand-off.';
    return true;
  }

  function reviewAuditRows() {
    const rows = [];
    const seen = new Set();
    const add = (kind, subject, label, state) => {
      const review = state.review;
      const key = reviewKey(kind, subject);
      seen.add(key);
      const final = state.review_current ? state.reviewed : state.calculated;
      const note = review
        ? (state.review_current ? review.reason || 'Engineer review recorded.' : 'Retained review is stale because the calculated result changed; calculated result reported until reconfirmed.')
        : 'No engineer override.';
      rows.push({kind,label,calculated:state.calculated,final,note,reviewer:review?.reviewer || '—',reviewed_at:review?.reviewed_at || '—'});
    };
    for (const monitor of survey.batch?.monitors || []) add('monitor',monitor.monitor,'Monitor · '+monitor.monitor,reviewedMonitorState(monitor));
    for (const gauge of survey.batch?.network?.gauge_summary || []) add('gauge',gauge.gauge,'Rain gauge · '+gauge.gauge,reviewedGaugeState(gauge));
    for (const row of balanceRows()) {
      const key = balanceRowKey(row);
      const path = (row.upstream_monitors || []).join(' + ')+' → '+String(row.downstream_monitor || '—');
      add('balance',key,'Volume balance · '+String(row.week_ending || '—')+' · '+path,reviewedBalanceState(row));
    }
    for (const [key,review] of Object.entries(survey.reviews || {})) {
      if (seen.has(key)) continue;
      rows.push({
        kind:review.kind || key.split(':')[0],
        label:'Historical / unmatched · '+String(review.subject || key),
        calculated:normaliseRag(review.calculated_status_at_review),
        final:normaliseRag(review.reviewed_status),
        note:'Review record retained for audit, but its subject is not present in the current calculated result. '+String(review.reason || ''),
        reviewer:review.reviewer || '—',
        reviewed_at:review.reviewed_at || '—',
      });
    }
    return rows;
  }

  function reportHtml() {
    if (!survey.batch && !Object.keys(survey.reviews || {}).length) return '';
    const rows = reviewAuditRows().map(row =>
      '<tr><td>'+esc(row.label)+'</td><td>'+esc(row.calculated)+'</td><td>'+esc(row.final)+'</td><td>'+esc(row.note)+'</td><td>'+esc(row.reviewer)+'</td><td>'+esc(row.reviewed_at)+'</td></tr>'
    ).join('');
    const comments = (survey.batch?.monitors || []).map(monitor => {
      const comment = monitorComment(monitor.monitor);
      if (!comment?.text) return '';
      return '<tr><td><strong>'+esc(monitor.monitor)+'</strong></td><td>'+esc(comment.text)+'</td><td>'+esc(comment.author || '—')+'</td><td>'+esc(comment.updated_at || '—')+'</td></tr>';
    }).filter(Boolean).join('');
    return '<h3>Engineer review / final assessment</h3><div class="note">Calculated results are retained separately from reviewed results for monitors, rain gauges and weekly volume-balance paths. Stale reviews never silently supersede a changed calculation.</div>'+
      '<div class="table-wrap"><table><thead><tr><th>Assessment item</th><th>Calculated</th><th>Reported</th><th>Engineering rationale / review state</th><th>Reviewer</th><th>Reviewed at</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<h3>Monitor engineering comments</h3>'+(comments ? '<div class="table-wrap"><table><thead><tr><th>Monitor</th><th>Comment</th><th>Author</th><th>Updated</th></tr></thead><tbody>'+comments+'</tbody></table></div>' : '<p class="muted">No monitor engineering comments recorded.</p>');
  }

  function installPersistence() {
    if (typeof workspaceObject === 'function') {
      const coreWorkspaceObject = workspaceObject;
      workspaceObject = function(...args) {
        const value = coreWorkspaceObject(...args);
        value.survey = value.survey || {};
        value.survey.engineer_reviews = JSON.parse(JSON.stringify(survey.reviews || {}));
        value.survey.monitor_comments = JSON.parse(JSON.stringify(survey.monitorComments || {}));
        value.survey.review_schema_version = 3;
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
        survey.monitorComments = value?.survey?.monitor_comments && typeof value.survey.monitor_comments === 'object'
          ? JSON.parse(JSON.stringify(value.survey.monitor_comments))
          : {};
        survey.selectedMonitor = null;
        survey.selectedGauge = null;
        survey.selectedBalanceKey = null;
        renderAll();
        return result;
      };
    }
  }

  ensureUi();
  installPersistence();
  wb.workflow26ReportHtml = reportHtml;
  wb.workflow26 = {
    version:3,
    calculatedMonitorStatus,
    reviewedMonitorState,
    reviewedGaugeState,
    reviewedBalanceState,
    balanceRowKey,
    applyReview,
    revertReview,
    applyMonitorReview,
    revertMonitorReview,
    monitorComment,
    saveMonitorComment,
    clearMonitorComment,
    monthlyReportHtml,
    exportMonthlyPdf,
    render:renderAll,
    selectMonitor:name => { survey.selectedMonitor = name; renderMonitorDetail(); },
    selectGauge:name => { survey.selectedGauge = name; renderGaugeDetail(); },
    selectBalance:key => { survey.selectedBalanceKey = key; renderBalanceReview(); },
  };
  renderAll();
})();
