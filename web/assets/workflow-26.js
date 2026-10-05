(() => {
  'use strict';

  const wb = window.__ICM_WORKBENCH__ || (window.__ICM_WORKBENCH__ = {});
  const survey = wb.survey;
  if (!survey) return;

  survey.reviews = survey.reviews && typeof survey.reviews === 'object' ? survey.reviews : {};
  survey.reviewLedger = Array.isArray(survey.reviewLedger) ? survey.reviewLedger : [];
  survey.monitorComments = survey.monitorComments && typeof survey.monitorComments === 'object' ? survey.monitorComments : {};
  survey.commentLedger = Array.isArray(survey.commentLedger) ? survey.commentLedger : [];
  survey.selectedMonitor = survey.selectedMonitor || null;
  survey.selectedGauge = survey.selectedGauge || null;
  survey.selectedBalanceKey = survey.selectedBalanceKey || null;
  survey.selectedWeek = survey.selectedWeek || null;
  survey.selectedWeeks = survey.selectedWeeks || {};
  survey.reviewContext = survey.reviewContext && typeof survey.reviewContext === 'object'
    ? survey.reviewContext
    : {kind:'monitor-week',name:null,weekKey:null,drawerTab:'overview',exceptionsOnly:false,search:'',zoom:{fdv:1,rain:1}};
  survey.reviewContext.zoom = survey.reviewContext.zoom || {fdv:1,rain:1};

  const weeklyDrafts = new Map();
  const draftKey = (kind,key) => JSON.stringify([survey.batchSignature||null,kind,key]);

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
  const auditId = () => globalThis.crypto?.randomUUID?.() || ('audit-'+Date.now()+'-'+Math.random().toString(36).slice(2));

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

  function weekKey(name,row){
    return JSON.stringify([String(name),String(row.start||''),String(row.end||''),String(row.week_ending||'')]);
  }
  function weekRows(kind,name){
    return kind==='gauge-week'
      ? (survey.batch?.network?.gauge_weekly||[]).filter(row=>row.gauge===name)
      : (monitorByName(name)?.weekly?.weeks||[]);
  }
  function weekByKey(kind,key){
    const names=kind==='gauge-week'?(survey.batch?.network?.gauge_summary||[]).map(g=>g.gauge):(survey.batch?.monitors||[]).map(m=>m.monitor);
    for(const name of names)for(const row of weekRows(kind,name))if(weekKey(name,row)===key)return {name,row};
    return null;
  }
  function reviewedWeekState(kind,name,row){
    const result=reviewedState(kind,weekKey(name,row),row.rag);
    if(!surveyFresh('complete')&&result.review){
      result.review_current=false;result.historical_review=true;result.reviewed=result.calculated;
    }
    return result;
  }
  function applyWeeklyReview(kind,name,key,status='auto',comment='',reviewer=''){
    if(!['monitor-week','gauge-week'].includes(kind))throw new Error('Select a monitor or gauge week.');
    const match=weekByKey(kind,key);
    if(!match||match.name!==name)throw new Error('This week is not present in the current assessment.');
    if(!surveyFresh('complete'))throw new Error('Re-run the assessment before reviewing changed inputs.');
    if(status!=='auto'&&!VALID_RAG.has(status))throw new Error('Select a valid weekly rating.');
    if(!String(reviewer||'').trim())throw new Error('Enter your name or initials for this weekly review.');
    const rating=status==='auto'?normaliseRag(match.row.rag):status;
    return applyReview(kind,key,match.row.rag,rating,comment,reviewer,{
      use_calculated:status==='auto',
      monitor_or_gauge:name,
      start:String(match.row.start||''),
      end:String(match.row.end||''),
      week_ending:String(match.row.week_ending||''),
      method:'weekly-engineer-review-v2',
    });
  }
  function scalarEvidence(row){
    return '<dl class="weekly-evidence">'+Object.entries(row||{}).filter(([k,v])=>v!=null&&typeof v!=='object'&&!['method','monitor','gauge'].includes(k)).map(([k,v])=>'<dt>'+esc(k.replaceAll('_',' '))+'</dt><dd>'+esc(typeof v==='number'?fmt(v,3):v)+'</dd>').join('')+'</dl>';
  }
  function reviewHistoryHtml(review){
    const rows=review?.audit_events||[];
    return rows.length>1?'<details class="w26-technical-evidence"><summary>Review audit trail ('+rows.length+' events)</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>Event</th><th>Reviewer</th><th>At</th><th>Rating</th><th>Comment</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(String(r.event_type||'review').replaceAll('_',' '))+'</td><td>'+esc(r.reviewer||'—')+'</td><td>'+esc(r.event_at||'—')+'</td><td>'+esc(r.reviewed_status||'—')+'</td><td>'+esc(r.reason||'—')+'</td></tr>').join('')+'</tbody></table></div></details>':'';
  }
  function monitorEventEvidence(monitor){
    const rows=monitor.event_response?.rows||[];
    return rows.length?'<div class="table-wrap"><table class="data-table"><thead><tr><th>Event</th><th>Start</th><th>Depth / velocity response</th><th>Depth at peak flow (m)</th><th>Minimum depth</th><th>Response ratio</th><th>Comments</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.event||'—')+'</td><td>'+esc(r.event_start||'—')+'</td><td>'+esc(r.depth_velocity_response||'—')+'</td><td>'+fmt(r.min_depth_at_peak_flow_m,3)+'</td><td>'+esc(r.min_depth_pass==null?'Not assessed':r.min_depth_pass?'Pass':'Fail')+'</td><td>'+fmt(r.response_ratio,2)+'</td><td>'+esc((r.comments||[]).join(' '))+'</td></tr>').join('')+'</tbody></table></div>':'<p>No network-qualified event response evidence for this monitor in the current period.</p>';
  }
  function weeklyReviewTable(kind,name){
    const rows=weekRows(kind,name);
    if(!rows.length)return '<div class="pool-summary">No weekly evidence available for '+esc(name)+'.</div>';
    return '<div class="table-wrap"><table class="data-table weekly-review-table"><thead><tr><th>Week ending</th><th>Calculated</th><th>Reported</th><th>Reviewer / comment</th><th></th></tr></thead><tbody>'+rows.map(row=>{
      const s=reviewedWeekState(kind,name,row),review=s.review;
      return '<tr data-week-row="'+esc(weekKey(name,row))+'"><td>'+esc(String(row.week_ending||row.end||'').slice(0,10))+'</td><td>'+ragPill(s.calculated)+'</td><td>'+ragPill(s.reviewed)+(s.historical_review?' <small>Recheck review</small>':'')+'</td><td>'+esc(review?.reason||'—')+(review?.reviewer?'<small>'+esc(review.reviewer)+'</small>':'')+'</td><td><button type="button" class="btn quiet" data-week-edit="'+esc(weekKey(name,row))+'" data-week-kind="'+kind+'">Review week</button></td></tr>';
    }).join('')+'</tbody></table></div>';
  }
  function weeklyEditor(kind,name){
    const rows=weekRows(kind,name);
    const selectedKey=survey.selectedWeeks[kind+':'+name];
    const row=rows.find(r=>weekKey(name,r)===selectedKey)||rows.find(r=>String(r.week_ending||'')===survey.schematicWeek)||rows[0];
    if(!row)return '';
    const key=weekKey(name,row),s=reviewedWeekState(kind,name,row),review=s.review;
    survey.selectedWeeks[kind+':'+name]=key;
    const draft=weeklyDrafts.get(draftKey(kind,key));
    const selected=draft?.rating??(review?(review.use_calculated?'auto':review.reviewed_status):'auto');
    return '<section class="weekly-editor" data-week-kind="'+kind+'" data-week-key="'+esc(key)+'" data-week-name="'+esc(name)+'"><div class="w26-section-head"><div><h5>Review '+esc(name)+' · week ending '+esc(String(row.week_ending||row.end||'').slice(0,10))+'</h5><p>'+esc(row.start||'')+' → '+esc(row.end||'')+'</p></div></div>'+
      (s.historical_review?'<div class="w26-review-warning">The retained review needs rechecking. The calculated rating is reported until reconfirmed.</div>':'')+
      '<div class="weekly-editor-fields"><label>Weekly rating<select class="weekly-rating"><option value="auto" '+(selected==='auto'?'selected':'')+'>Use calculated ('+esc(s.calculated)+')</option>'+['Green','Amber','Red','Grey'].map(r=>'<option '+(selected===r?'selected':'')+'>'+r+'</option>').join('')+'</select></label><label>Reviewer<input class="weekly-reviewer" value="'+esc(draft?.reviewer??review?.reviewer??'')+'" placeholder="Name / initials"></label><label class="weekly-comment-label">Weekly comment<textarea class="weekly-comment" rows="3" placeholder="Comment for this week; required when changing its rating.">'+esc(draft?.comment??review?.reason??'')+'</textarea></label></div>'+
      '<div class="weekly-quick-notes"><span>Add context:</span><button type="button" class="btn quiet" data-week-note="Tidal impact noted.">Tidal impact</button><button type="button" class="btn quiet" data-week-note="Pumping influence noted.">Pumping influence</button></div>'+
      '<div class="w26-review-error" role="alert"></div><div class="actions left"><button type="button" class="btn primary" data-week-save>Save weekly review</button>'+(review?'<button type="button" class="btn" data-week-reset>Reset this week</button>':'')+'</div>'+
      '<details class="w26-technical-evidence"><summary>Calculated evidence for this week</summary>'+scalarEvidence(row)+(kind==='gauge-week'?'<p class="muted">Green requires at least 90% operational days and no daily strike or fault evidence. Amber marks coverage or fault evidence for review; Grey means no valid support. Network spatial variation is assessed separately.</p>':'')+'</details>'+reviewHistoryHtml(review)+'</section>';
  }

  function monitorComment(name) {
    return survey.monitorComments[String(name || '')] || null;
  }

  function rebuildCommentSnapshot() {
    const current = {};
    for (const event of survey.commentLedger || []) {
      const monitor = String(event.monitor || '');
      if (!monitor) continue;
      if (event.event_type === 'comment_cleared') {
        delete current[monitor];
      } else if (['comment_created','comment_updated','comment_migrated'].includes(event.event_type)) {
        current[monitor] = {
          monitor,
          text:String(event.text || ''),
          author:event.author || null,
          updated_at:event.updated_at || event.event_at || null,
          method:event.method || 'engineer-comment-v2',
          event_id:event.event_id || null,
        };
      }
    }
    survey.monitorComments = current;
    return current;
  }

  function migrateLegacyComments(legacy) {
    return Object.values(legacy || {}).filter(Boolean).map(comment => ({
      ...comment,
      event_type:'comment_migrated',
      event_id:auditId(),
      event_at:comment.updated_at || nowIso(),
      method:'engineer-comment-v2',
    }));
  }

  if (!survey.commentLedger.length && Object.keys(survey.monitorComments || {}).length) {
    survey.commentLedger = migrateLegacyComments(survey.monitorComments);
  }
  rebuildCommentSnapshot();

  function saveMonitorComment(name, text='', author='') {
    const monitor = monitorByName(name);
    if (!monitor) throw new Error('The selected monitor is not present in the current Flow Survey assessment.');
    const clean = String(text || '').trim();
    if (!clean) return clearMonitorComment(name, author);
    const previous = monitorComment(name);
    const updatedAt = nowIso();
    survey.commentLedger.push(Object.freeze({
      monitor:String(name),
      text:clean,
      author:String(author || '').trim() || previous?.author || null,
      updated_at:updatedAt,
      event_at:updatedAt,
      event_type:previous ? 'comment_updated' : 'comment_created',
      event_id:auditId(),
      method:'engineer-comment-v2',
    }));
    rebuildCommentSnapshot();
    renderAll();
    return survey.monitorComments[String(name)];
  }

  function clearMonitorComment(name, author='') {
    const key = String(name || '');
    const previous = monitorComment(key);
    if (!previous) return null;
    const eventAt = nowIso();
    survey.commentLedger.push(Object.freeze({
      monitor:key,
      text:previous.text,
      author:String(author || '').trim() || previous.author || null,
      event_at:eventAt,
      updated_at:eventAt,
      event_type:'comment_cleared',
      event_id:auditId(),
      previous_comment_event_id:previous.event_id || null,
      method:'engineer-comment-v2',
    }));
    rebuildCommentSnapshot();
    renderAll();
    return null;
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

  function reviewLedgerEvents(kind, id) {
    const key = reviewKey(kind, id);
    return (survey.reviewLedger || []).filter(event => reviewKey(event.kind, event.subject) === key);
  }

  function reviewFromLedgerEvent(event) {
    if (!event || event.event_type === 'reverted_to_calculated') return null;
    return {
      kind:String(event.kind || ''),
      subject:String(event.subject || ''),
      calculated_status_at_review:normaliseRag(event.calculated_status_at_review),
      reviewed_status:normaliseRag(event.reviewed_status),
      calculation_signature_at_review:event.calculation_signature_at_review || null,
      reason:String(event.reason || ''),
      reviewer:event.reviewer || null,
      reviewed_at:event.reviewed_at || event.event_at || null,
      use_calculated:Boolean(event.use_calculated),
      monitor_or_gauge:event.monitor_or_gauge || null,
      start:event.start || '',
      end:event.end || '',
      week_ending:event.week_ending || '',
      method:event.method || 'engineer-review-v2',
      event_id:event.event_id || null,
    };
  }

  function rebuildReviewSnapshot() {
    const active = {};
    for (const event of survey.reviewLedger || []) {
      const key = reviewKey(event.kind, event.subject);
      if (event.event_type === 'reverted_to_calculated') {
        delete active[key];
        continue;
      }
      if (!['review_created','review_updated','review_reconfirmed','review_migrated'].includes(event.event_type)) continue;
      active[key] = reviewFromLedgerEvent(event);
    }
    for (const [key, review] of Object.entries(active)) {
      const events = (survey.reviewLedger || []).filter(event => reviewKey(event.kind,event.subject) === key);
      review.history = events
        .filter(event => ['review_created','review_updated','review_reconfirmed','review_migrated'].includes(event.event_type) && event.event_id !== review.event_id)
        .map(reviewFromLedgerEvent)
        .filter(Boolean);
      review.audit_events = events.map(event => ({
        event_type:event.event_type,
        event_at:event.event_at || event.reviewed_at || null,
        reviewer:event.reviewer || null,
        reviewed_status:event.reviewed_status || null,
        reason:event.reason || '',
        calculation_signature_at_review:event.calculation_signature_at_review || null,
      }));
    }
    survey.reviews = active;
    return active;
  }

  function migrateLegacyReviews(legacy) {
    const ledger = [];
    for (const [key, current] of Object.entries(legacy || {})) {
      if (!current || typeof current !== 'object') continue;
      const split = key.indexOf(':');
      const inferredKind = split >= 0 ? key.slice(0, split) : 'review';
      const inferredSubject = split >= 0 ? key.slice(split + 1) : key;
      const history = Array.isArray(current.history) ? current.history : [];
      for (const old of history) {
        ledger.push({
          ...old,
          kind:String(old.kind || current.kind || inferredKind),
          subject:String(old.subject || current.subject || inferredSubject),
          event_type:'review_migrated',
          event_id:auditId(),
          event_at:old.reviewed_at || nowIso(),
        });
      }
      ledger.push({
        ...current,
        history:undefined,
        kind:String(current.kind || inferredKind),
        subject:String(current.subject || inferredSubject),
        event_type:'review_migrated',
        event_id:auditId(),
        event_at:current.reviewed_at || nowIso(),
      });
    }
    return ledger;
  }

  function appendReviewEvent(event) {
    survey.reviewLedger.push(Object.freeze({...event}));
    rebuildReviewSnapshot();
    return reviewFor(event.kind, event.subject);
  }

  if (!survey.reviewLedger.length && Object.keys(survey.reviews || {}).length) {
    survey.reviewLedger = migrateLegacyReviews(survey.reviews);
  }
  rebuildReviewSnapshot();

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
    const weeks=monitor?.weekly?.weeks||[],substantive=weeks.filter(r=>!isBoundaryShortWeek(r));
    const states=(substantive.length?substantive:weeks).map(row=>reviewedWeekState('monitor-week',monitor.monitor,row));
    const reviews=states.filter(s=>s.review);
    return {calculated:calculatedMonitorStatus(monitor),reviewed:worstRag(states.map(s=>s.reviewed)),
      review:reviews[0]?.review||null,review_current:reviews.length>0&&reviews.every(s=>s.review_current),historical_review:states.some(s=>s.historical_review),weekly_states:states};
  }

  function gaugeByName(name) {
    return (survey.batch?.network?.gauge_summary || []).find(row => String(row.gauge) === String(name)) || null;
  }

  function reviewedGaugeState(gauge) {
    const rows=weekRows('gauge-week',gauge?.gauge);
    if(!rows.length)return reviewedState('gauge',gauge?.gauge,normaliseRag(gauge?.status));
    const states=rows.map(row=>reviewedWeekState('gauge-week',gauge.gauge,row)),reviews=states.filter(s=>s.review);
    return {calculated:worstRag(states.map(s=>s.calculated)),reviewed:worstRag(states.map(s=>s.reviewed)),review:reviews[0]?.review||null,
      review_current:reviews.length>0&&reviews.every(s=>s.review_current),historical_review:states.some(s=>s.historical_review),weekly_states:states};
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

  function applyReview(kind, id, calculatedStatus, reviewedStatus, reason='', reviewer='', details={}) {
    const calculated = normaliseRag(calculatedStatus);
    const reviewed = normaliseRag(reviewedStatus || calculated);
    const cleanReason = String(reason || '').trim();
    if (reviewed !== calculated && !cleanReason) {
      throw new Error('Enter an engineering reason before superseding the calculated assessment.');
    }
    const previous = reviewFor(kind, id);
    const signature = calculationSignatureFor(kind);
    const eventType = !previous
      ? 'review_created'
      : (reviewCurrent(previous, calculated, signature) ? 'review_updated' : 'review_reconfirmed');
    const reviewedAt = nowIso();
    const event = {
      kind:String(kind),
      subject:String(id),
      calculated_status_at_review:calculated,
      reviewed_status:reviewed,
      calculation_signature_at_review:signature,
      reason:cleanReason,
      reviewer:String(reviewer || '').trim() || null,
      reviewed_at:reviewedAt,
      event_at:reviewedAt,
      event_type:eventType,
      event_id:auditId(),
      method:details.method || 'engineer-review-v2',
      ...details,
    };
    const record = appendReviewEvent(event);
    renderAll();
    return record;
  }

  function revertReview(kind, id, reviewer='') {
    const previous = reviewFor(kind, id);
    if (!previous) return null;
    const eventAt = nowIso();
    survey.reviewLedger.push(Object.freeze({
      kind:String(kind),
      subject:String(id),
      event_type:'reverted_to_calculated',
      event_id:auditId(),
      event_at:eventAt,
      reviewer:String(reviewer || '').trim() || previous.reviewer || null,
      calculated_status_at_review:previous.calculated_status_at_review,
      reviewed_status:previous.reviewed_status,
      calculation_signature_at_review:calculationSignatureFor(kind),
      reason:'Reverted to calculated assessment.',
      previous_review_event_id:previous.event_id || null,
      method:'engineer-review-ledger-v2',
    }));
    rebuildReviewSnapshot();
    renderAll();
    return null;
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
    for (const row of weeks) counts[reviewedWeekState('monitor-week',monitor.monitor,row).reviewed] += 1;
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


  function weekValue(row){return String(row?.week_ending||row?.end||'');}
  function weekLabel(value){return String(value||'').slice(0,10)||'—';}
  function matrixNames(kind){
    return kind==='monitor-week'
      ? (survey.batch?.monitors||[]).map(row=>String(row.monitor)).filter(Boolean)
      : (survey.batch?.network?.gauge_summary||[]).map(row=>String(row.gauge)).filter(Boolean);
  }
  function matrixWeeks(kind){
    const set=new Set();
    for(const name of matrixNames(kind))for(const row of weekRows(kind,name))if(weekValue(row))set.add(weekValue(row));
    return [...set].sort();
  }
  function matrixRow(kind,name,week){return weekRows(kind,name).find(row=>weekValue(row)===String(week))||null;}
  function matrixIsException(state){return state.historical_review||['Amber','Red','Grey'].includes(state.reviewed)||state.reviewed!==state.calculated;}
  function weekMatrixHtml(kind,{readonly=false}={}){
    const names=matrixNames(kind),weeks=matrixWeeks(kind);
    if(!names.length||!weeks.length)return '<div class="pool-summary">No weekly assessment matrix is available yet.</div>';
    const query=String(survey.reviewContext.search||'').trim().toLowerCase(),exceptionsOnly=Boolean(survey.reviewContext.exceptionsOnly);
    const shown=names.filter(name=>(!query||name.toLowerCase().includes(query))&&(!exceptionsOnly||weeks.some(week=>{const row=matrixRow(kind,name,week);return row&&matrixIsException(reviewedWeekState(kind,name,row));})));
    return '<div class="w26-matrix-scroll"><table class="w26-week-matrix"><thead><tr><th class="w26-matrix-sticky">Monitor / gauge</th>'+weeks.map(week=>'<th>'+esc(weekLabel(week))+'</th>').join('')+'</tr></thead><tbody>'+
      shown.map(name=>'<tr><th class="w26-matrix-sticky" scope="row">'+esc(name)+'</th>'+weeks.map(week=>{
        const row=matrixRow(kind,name,week);if(!row)return '<td class="w26-matrix-empty">—</td>';
        const state=reviewedWeekState(kind,name,row),key=weekKey(name,row),selected=survey.reviewContext.kind===kind&&survey.reviewContext.name===name&&survey.reviewContext.weekKey===key;
        const marks=(state.review?'<span class="w26-matrix-review-mark" title="Engineer review recorded">R</span>':'')+(state.historical_review?'<span class="w26-matrix-stale" title="Review needs reconfirmation">!</span>':'');
        const title=[name,weekLabel(week),'Calculated '+state.calculated,'Reported '+state.reviewed,state.review?.reviewer?'Reviewer '+state.review.reviewer:'',state.review?.reason||''].filter(Boolean).join(' · ');
        const content='<span class="w26-matrix-rag">'+esc(state.reviewed)+'</span>'+marks;
        return '<td class="w26-matrix-cell w26-matrix-'+state.reviewed.toLowerCase()+(selected?' is-selected':'')+(matrixIsException(state)?' is-exception':'')+'" title="'+esc(title)+'">'+(readonly?'<span>'+content+'</span>':'<button type="button" data-matrix-cell data-week-kind="'+esc(kind)+'" data-week-name="'+esc(name)+'" data-week-key="'+esc(key)+'" data-week-ending="'+esc(week)+'">'+content+'</button>')+'</td>';
      }).join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  function exceptionQueue(kind){
    const queue=[];for(const name of matrixNames(kind))for(const row of weekRows(kind,name)){const state=reviewedWeekState(kind,name,row);if(matrixIsException(state))queue.push({kind,name,row,key:weekKey(name,row),week:weekValue(row),state});}
    return queue.sort((a,b)=>a.week.localeCompare(b.week)||a.name.localeCompare(b.name,undefined,{numeric:true}));
  }
  function selectReviewWeek(kind,name,key=null,week=null){
    const rows=weekRows(kind,name),row=rows.find(r=>weekKey(name,r)===key)||rows.find(r=>weekValue(r)===week)||rows.find(r=>weekValue(r)===survey.schematicWeek)||rows[0];if(!row)return;
    const rowKey=weekKey(name,row);survey.reviewContext.kind=kind;survey.reviewContext.name=name;survey.reviewContext.weekKey=rowKey;survey.selectedWeeks[kind+':'+name]=rowKey;survey.schematicWeek=weekValue(row);survey.selectedWeek=survey.schematicWeek;
    if(kind==='monitor-week')survey.selectedMonitor=name;else survey.selectedGauge=name;renderAll();
  }
  function drawerContent(kind,name){
    if(!name)return '<div class="w26-drawer-empty"><strong>Select a matrix cell or schematic node.</strong><p>The selected week’s evidence and engineer review remain here while you move through the survey.</p></div>';
    const rows=weekRows(kind,name),row=rows.find(r=>weekKey(name,r)===survey.reviewContext.weekKey)||rows.find(r=>weekValue(r)===survey.schematicWeek)||rows[0];if(!row)return '<div class="w26-drawer-empty">No weekly evidence for '+esc(name)+'.</div>';
    const state=reviewedWeekState(kind,name,row),tab=survey.reviewContext.drawerTab||'overview',monitor=kind==='monitor-week'?monitorByName(name):null,gauge=kind==='gauge-week'?gaugeByName(name):null;
    const tabs=['overview','evidence','weekly','audit'].map(value=>'<button type="button" data-drawer-tab="'+value+'" class="'+(tab===value?'is-active':'')+'">'+(value==='audit'?'Edit / Audit':value.charAt(0).toUpperCase()+value.slice(1))+'</button>').join('');
    let body='';
    if(tab==='overview')body='<div class="w26-drawer-status"><span>Calculated '+ragPill(state.calculated)+'</span><span>Reported '+ragPill(state.reviewed)+'</span></div><dl class="weekly-evidence"><dt>Week ending</dt><dd>'+esc(weekLabel(weekValue(row)))+'</dd><dt>Reviewer</dt><dd>'+esc(state.review?.reviewer||'Not reviewed')+'</dd><dt>Review state</dt><dd>'+esc(state.historical_review?'Needs reconfirmation':state.review?'Current':'Calculated only')+'</dd></dl>'+(monitor?'<div class="pool-summary">Rain gauge '+esc(monitor.rain_gauge||'—')+' · pipe diameter '+(monitor.diameter_mm==null?'—':fmt(monitor.diameter_mm,0)+' mm')+'</div>':'')+(gauge?'<div class="pool-summary">Operational coverage '+fmt(gauge.operational_coverage_percent,1)+'% · '+Number(gauge.event_strike_count||0)+' event strike(s).</div>':'');
    else if(tab==='evidence')body=scalarEvidence(row)+(monitor?'<details class="w26-technical-evidence" open><summary>Event response evidence</summary>'+monitorEventEvidence(monitor)+'</details>':'')+(gauge?'<details class="w26-technical-evidence" open><summary>Gauge evidence</summary>'+scalarEvidence(gauge)+'</details>':'');
    else if(tab==='weekly')body=weeklyReviewTable(kind,name);
    else body=weeklyEditor(kind,name);
    const queue=exceptionQueue(kind),at=queue.findIndex(item=>item.name===name&&item.key===weekKey(name,row));
    return '<div class="w26-drawer-head"><div><span class="w26-eyebrow">'+(kind==='monitor-week'?'FDV monitor':'Rain gauge')+'</span><h4>'+esc(name)+' · '+esc(weekLabel(weekValue(row)))+'</h4></div><button type="button" class="btn quiet" data-drawer-close>Close</button></div><div class="w26-drawer-tabs">'+tabs+'</div><div class="w26-drawer-body">'+body+'</div><div class="w26-drawer-nav"><button type="button" class="btn quiet" data-exception-step="-1" '+(queue.length?'':'disabled')+'>← Previous exception</button><span>'+(queue.length?(at>=0?String(at+1):'—')+' / '+queue.length:'No exceptions')+'</span><button type="button" class="btn quiet" data-exception-step="1" '+(queue.length?'':'disabled')+'>Next exception →</button></div>';
  }
  function renderReviewMatrix(kind){
    const suffix=kind==='monitor-week'?'fdv':'rain',matrix=$('assessmentMatrix-'+suffix),drawer=$('assessmentDrawer-'+suffix);if(matrix)matrix.innerHTML=weekMatrixHtml(kind);if(drawer)drawer.innerHTML=drawerContent(kind,survey.reviewContext.kind===kind?survey.reviewContext.name:null);
    const search=$('assessmentSearch-'+suffix);if(search&&search.value!==String(survey.reviewContext.search||''))search.value=survey.reviewContext.search||'';const toggle=$('assessmentExceptions-'+suffix);if(toggle)toggle.checked=Boolean(survey.reviewContext.exceptionsOnly);
    updateSchematicView(suffix);
  }
  const MIN_SCHEMATIC_ZOOM=.25,MAX_SCHEMATIC_ZOOM=4;
  function updateSchematicView(suffix,preserveCentre=false){
    const viewport=$('assessmentSchematicViewport-'+suffix),svg=viewport?.querySelector('svg');
    const requested=Number(survey.reviewContext.zoom?.[suffix]??1);
    const scale=Math.min(MAX_SCHEMATIC_ZOOM,Math.max(MIN_SCHEMATIC_ZOOM,Number.isFinite(requested)?requested:1));
    survey.reviewContext.zoom[suffix]=scale;
    const label=$('assessmentZoom-'+suffix);if(label)label.textContent=Math.round(scale*100)+'%';
    for(const button of document.querySelectorAll('[data-schematic-zoom][data-schematic-kind="'+suffix+'"]')){
      button.disabled=Number(button.dataset.schematicZoom)>0?scale>=MAX_SCHEMATIC_ZOOM:scale<=MIN_SCHEMATIC_ZOOM;
    }
    // Hidden routes have zero width. Do not shrink their SVG to one pixel;
    // ResizeObserver reapplies the camera when the schematic becomes visible.
    if(!svg||viewport.clientWidth<20||viewport.getClientRects().length===0)return;
    const box=svg.viewBox.baseVal;if(!(box.width>0&&box.height>0))return;
    const previous=svg.getBoundingClientRect(),oldLeft=viewport.scrollLeft,oldTop=viewport.scrollTop;
    const availableWidth=viewport.clientWidth-18;
    const maxHeight=Number.parseFloat(getComputedStyle(viewport).maxHeight)||560;
    const decoration=[...svg.parentElement.children].filter(node=>node!==svg).reduce((sum,node)=>sum+node.getBoundingClientRect().height+12,0);
    const fitWidth=Math.min(availableWidth,Math.max(80,maxHeight-18-decoration)*box.width/box.height);
    const width=fitWidth*scale;
    svg.style.transform='none';svg.style.width=width+'px';svg.style.maxWidth='none';
    svg.style.height=(width*box.height/box.width)+'px';
    if(preserveCentre&&previous.width>0){
      const ratio=width/previous.width;
      viewport.scrollLeft=(oldLeft+viewport.clientWidth/2)*ratio-viewport.clientWidth/2;
      viewport.scrollTop=(oldTop+viewport.clientHeight/2)*ratio-viewport.clientHeight/2;
    }
  }
  function bindSchematicPan(viewport){
    let drag=null,suppressClick=false;
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>updateSchematicView(viewport.id.endsWith('-fdv')?'fdv':'rain')).observe(viewport);
    viewport.tabIndex=0;viewport.setAttribute('aria-label','Association schematic. Drag to pan or use arrow keys.');
    viewport.addEventListener('pointerdown',event=>{
      if(event.button!==0||viewport.dataset.pan==='off')return;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};
    });
    viewport.addEventListener('pointermove',event=>{
      if(!drag||drag.id!==event.pointerId)return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!drag.moved&&Math.hypot(dx,dy)<4)return;
      drag.moved=true;viewport.setPointerCapture(event.pointerId);viewport.classList.add('is-panning');
      viewport.scrollLeft=drag.left-dx;viewport.scrollTop=drag.top-dy;event.preventDefault();
    });
    const end=event=>{if(!drag)return;suppressClick=event.type==='pointerup'&&drag.moved;drag=null;viewport.classList.remove('is-panning');};
    viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
    viewport.addEventListener('pointerleave',()=>{if(drag&&!drag.moved)drag=null;});
    viewport.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopPropagation();}},true);
    viewport.addEventListener('keydown',event=>{
      if(event.target!==viewport)return;
      const offsets={ArrowLeft:[-80,0],ArrowRight:[80,0],ArrowUp:[0,-80],ArrowDown:[0,80]};
      if(offsets[event.key]){event.preventDefault();viewport.scrollBy(...offsets[event.key]);}
    });
  }
  function renderAllMatrices(){renderReviewMatrix('monitor-week');renderReviewMatrix('gauge-week');}
  function balanceMatrixHtml(){
    const rows=balanceRows();if(!rows.length)return '<div class="pool-summary">No weekly volume-balance matrix available.</div>';
    const weeks=[...new Set(rows.map(r=>String(r.week_ending||'')).filter(Boolean))].sort(),paths=new Map();
    for(const row of rows){const label=(row.upstream_monitors||[]).join(' + ')+' → '+String(row.downstream_monitor||'—'),key=[String(row.downstream_monitor||''),[...(row.upstream_monitors||[])].sort().join(',')].join('|');if(!paths.has(key))paths.set(key,label);}
    return '<div class="w26-matrix-scroll"><table class="w26-week-matrix"><thead><tr><th class="w26-matrix-sticky">Network path</th>'+weeks.map(w=>'<th>'+esc(weekLabel(w))+'</th>').join('')+'</tr></thead><tbody>'+[...paths].map(([pathKey,label])=>'<tr><th class="w26-matrix-sticky">'+esc(label)+'</th>'+weeks.map(week=>{const row=rows.find(r=>String(r.week_ending||'')===week&&[String(r.downstream_monitor||''),[...(r.upstream_monitors||[])].sort().join(',')].join('|')===pathKey);if(!row)return '<td class="w26-matrix-empty">—</td>';const state=reviewedBalanceState(row),key=balanceRowKey(row);return '<td class="w26-matrix-cell w26-matrix-'+state.reviewed.toLowerCase()+(survey.selectedBalanceKey===key?' is-selected':'')+'"><button type="button" data-balance-matrix="'+esc(key)+'">'+esc(state.reviewed)+(state.review?' <span class="w26-matrix-review-mark">R</span>':'')+'</button></td>';}).join('')+'</tr>').join('')+'</tbody></table></div>';
  }

  function assessmentWeekOptions(){
    return [...new Set([...(survey.batch?.monitors||[]).flatMap(m=>(m.weekly?.weeks||[]).map(r=>String(r.week_ending||''))),...(survey.batch?.network?.gauge_weekly||[]).map(r=>String(r.week_ending||''))].filter(Boolean))].sort();
  }
  function rowForSchematic(kind,name){return weekRows(kind,name).find(r=>String(r.week_ending||'')===survey.schematicWeek)||null;}
  function schematicRating(kind,name){
    if(!surveyFresh('complete'))return 'Grey';
    const row=rowForSchematic(kind,name);
    return row?reviewedWeekState(kind,name,row).reviewed:'Grey';
  }
  function rainfallSchematicHtml(){
    const gauges=survey.batch?.network?.gauge_summary||[],records=survey.association?.records||[];
    if(!gauges.length)return '<div class="pool-summary">Run the assessment to display rainfall gauges.</div>';
    const names=[...new Set(records.map(r=>r.monitor))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const height=Math.max(240,Math.max(gauges.length,names.length)*78+70),positions=new Map(),parts=[];
    gauges.forEach((g,i)=>positions.set('g:'+g.gauge,{x:180,y:55+(height-90)*(i+.5)/gauges.length}));
    names.forEach((n,i)=>positions.set('m:'+n,{x:740,y:55+(height-90)*(i+.5)/Math.max(1,names.length)}));
    for(const record of records){const a=positions.get('g:'+record.rain_gauge),b=positions.get('m:'+record.monitor);if(a&&b)parts.push('<path d="M '+(a.x+95)+' '+a.y+' C 460 '+a.y+',460 '+b.y+','+(b.x-95)+' '+b.y+'" class="rain-association-link"/>');}
    const node=(name,p,kind)=>{const rag=schematicRating(kind,name),attr=kind==='gauge-week'?'data-survey-gauge':'data-survey-node';return '<g class="assessment-node rag-'+rag.toLowerCase()+'" role="button" tabindex="0" '+attr+'="'+esc(name)+'" aria-label="Review '+esc(name)+' · '+rag+'" transform="translate('+(p.x-95)+' '+(p.y-25)+')"><rect width="190" height="50" rx="10"/><text x="16" y="21" class="assessment-node-name">'+esc(name)+'</text><text x="16" y="39" class="assessment-node-status">'+(kind==='gauge-week'?'Gauge':'Monitor')+' · '+rag+'</text></g>';};
    gauges.forEach(g=>parts.push(node(g.gauge,positions.get('g:'+g.gauge),'gauge-week')));
    names.forEach(n=>parts.push(node(n,positions.get('m:'+n),'monitor-week')));
    return '<div class="survey-schematic"><svg viewBox="0 0 1000 '+height+'" role="group" aria-label="Rain gauge and monitor associations"><text x="85" y="22" class="assessment-node-name">Rain gauges</text><text x="645" y="22" class="assessment-node-name">Associated monitors</text>'+parts.join('')+'</svg><p class="schematic-note">Dashed lines show rainfall associations from fm_rg_assoc.xlsx. Colours show the selected week; Grey means no current assessment.</p></div>';
  }
  function renderAssessmentSchematics(){
    ensureSchematicUi();
    const weeks=assessmentWeekOptions();
    if(!weeks.includes(survey.schematicWeek)){
      const fullWeek=(survey.batch?.monitors||[]).flatMap(m=>m.weekly?.weeks||[]).find(r=>!isBoundaryShortWeek(r));
      survey.schematicWeek=String(fullWeek?.week_ending||weeks[0]||'');
    }
    for(const kind of ['fdv','rain']){
      const select=$('assessmentWeek-'+kind),root=$('assessmentSchematic-'+kind);
      if(!root||!select)continue;
      select.innerHTML=weeks.length?weeks.map(w=>'<option value="'+esc(w)+'" '+(w===survey.schematicWeek?'selected':'')+'>Week ending '+esc(w.slice(0,10))+'</option>').join(''):'<option value="">No weeks assessed</option>';
      const monitorNames=[...new Set([...(survey.batch?.monitors||[]).map(m=>m.monitor),...(survey.association?.records||[]).map(r=>r.monitor)])];
      const status=new Map(monitorNames.map(name=>[name,schematicRating('monitor-week',name)]));
      const viewport=$('assessmentSchematicViewport-'+kind),left=viewport?.scrollLeft||0,top=viewport?.scrollTop||0;
      root.innerHTML=kind==='fdv'?wb.surveySchematicHtml?.(null,{monitors:monitorNames,status,interactive:true,note:'Click a monitor to inspect its weekly ratings. Colours show the selected week; Grey means no current assessment.'})||'':rainfallSchematicHtml();
      updateSchematicView(kind);if(viewport){viewport.scrollLeft=left;viewport.scrollTop=top;}
    }
    wb.installSectionHierarchy?.();
  }
  function ensureSchematicUi(){
    const complete=$('completeSurveyPanel'),header=$('surveyReviewHeader'),settingsBody=$('surveyAssessmentSettingsBody');
    if(complete&&header&&header.nextElementSibling!==complete)header.insertAdjacentElement('afterend',complete);
    const notes=complete?.querySelector('.survey-control-grid');if(notes&&settingsBody)settingsBody.appendChild(notes);
    const health=$('pwDataHealthSummary');
    if(health&&!health.dataset.schematicSecondary){
      health.dataset.schematicSecondary='true';health.classList.add('tool-collapsed');
      const toggle=health.querySelector('.tool-collapse-toggle');if(toggle){toggle.textContent='Expand';toggle.setAttribute('aria-expanded','false');}
    }
    for(const [kind,targetId] of [['fdv','completeSurveyMonitors'],['rain','surveyGaugeReview']]){
      const target=$(targetId);
      if(!target||$('assessmentCanvas-'+kind))continue;
      const canvas=document.createElement('section');canvas.id='assessmentCanvas-'+kind;canvas.className='assessment-canvas w26-matrix-workbench';
      canvas.innerHTML='<div class="assessment-canvas-head"><div><h4>'+(kind==='fdv'?'Monitor assessment':'Rainfall assessment')+'</h4><p>Use the week matrix and network together. The evidence drawer stays open while you move through exceptions.</p></div><label>Assessment week<select id="assessmentWeek-'+kind+'"></select></label></div>'+
        '<div class="w26-matrix-layout"><div class="w26-matrix-main"><div class="w26-matrix-toolbar"><label>Find '+(kind==='fdv'?'monitor':'gauge')+'<input id="assessmentSearch-'+kind+'" type="search" placeholder="Search ID"></label><label class="w26-inline-check"><input id="assessmentExceptions-'+kind+'" type="checkbox"> Exceptions only</label><div class="w26-schematic-tools"><button type="button" class="btn quiet" data-schematic-pan data-schematic-kind="'+kind+'" aria-pressed="true" title="Drag the schematic to pan">Pan</button><button type="button" class="btn quiet" data-schematic-zoom="-1" data-schematic-kind="'+kind+'" aria-label="Zoom out">−</button><output id="assessmentZoom-'+kind+'" aria-label="Schematic zoom" aria-live="polite">100%</output><button type="button" class="btn quiet" data-schematic-fit data-schematic-kind="'+kind+'">Fit</button><button type="button" class="btn quiet" data-schematic-zoom="1" data-schematic-kind="'+kind+'" aria-label="Zoom in">+</button><button type="button" class="btn quiet" data-schematic-focus data-schematic-kind="'+kind+'">Focus selected</button></div></div>'+
        '<div id="assessmentMatrix-'+kind+'" class="w26-matrix-region"></div><div id="assessmentSchematicViewport-'+kind+'" class="w26-schematic-viewport"><div id="assessmentSchematic-'+kind+'"></div></div></div><aside id="assessmentDrawer-'+kind+'" class="w26-evidence-drawer" aria-live="polite"></aside></div>';
      target.insertAdjacentElement('beforebegin',canvas);
      bindSchematicPan($('assessmentSchematicViewport-'+kind));
      $('assessmentWeek-'+kind).addEventListener('change',event=>{survey.schematicWeek=event.target.value;renderAssessmentSchematics();renderAllMatrices();});
      $('assessmentSearch-'+kind)?.addEventListener('input',event=>{survey.reviewContext.search=event.target.value;renderAllMatrices();});
      $('assessmentExceptions-'+kind)?.addEventListener('change',event=>{survey.reviewContext.exceptionsOnly=Boolean(event.target.checked);renderAllMatrices();});
      const details=document.createElement('details');details.className='w26-technical-evidence assessment-all-rows';details.innerHTML='<summary>All '+(kind==='fdv'?'monitor':'gauge')+' assessment rows</summary>';
      target.insertAdjacentElement('beforebegin',details);details.appendChild(target);
    }
    const events=$('surveyEventReview');
    if(events&&!events.closest('details')){const section=events.closest('.w26-review-section'),details=document.createElement('details');details.className='w26-technical-evidence';details.innerHTML='<summary>Network rainfall events and qualification</summary>';section.insertAdjacentElement('beforebegin',details);details.appendChild(section);}
    const association=$('surveyAssociationPanel'),settings=$('surveyAssessmentSettingsBody');
    if(association&&settings&&!association.closest('#surveyAssessmentSettings')){
      settings.appendChild(association);
      association.dataset.pwOwned='survey/fdv-check survey/rainfall-check survey/volume-balance survey/monthly-review';
      association.classList.add('tool-collapsed');
      const toggle=association.querySelector('.tool-collapse-toggle');if(toggle){toggle.textContent='Expand';toggle.setAttribute('aria-expanded','false');}
    }
    const monthly=$('surveyMonthlyReview');if(monthly)monthly.open=true;
    for(const id of ['completeSurveySummary'])$(id)?.classList.add('assessment-secondary-summary');
    const standalone=$('surveyRainfallTechnical');if(standalone)standalone.querySelector('summary').textContent='Advanced single-monitor assessment';
    if(!$('assessmentPopup')){
      const dialog=document.createElement('dialog');dialog.id='assessmentPopup';dialog.className='assessment-popup';dialog.setAttribute('aria-labelledby','assessmentPopupTitle');document.body.appendChild(dialog);
      dialog.addEventListener('click',event=>{
        if(event.target.closest('[data-popup-close]'))dialog.close();
        const detail=event.target.closest('[data-popup-detail]');
        if(!detail)return;
        const kind=detail.dataset.weekKind,name=detail.dataset.weekName;survey.selectedWeeks[kind+':'+name]=detail.dataset.popupDetail;
        if(kind==='monitor-week')survey.selectedMonitor=name;else survey.selectedGauge=name;
        dialog.close();window.__ICM_PRECISION_WORKBENCH__?.navigate('survey',kind==='monitor-week'?'fdv-check':'rainfall-check',true);
        renderMonitorDetail();renderGaugeDetail();
        const root=$(kind==='monitor-week'?'surveyMonitorDetail':'surveyGaugeDetail');
        for(let parent=root?.parentElement;parent;parent=parent.parentElement){if(parent.matches('details'))parent.open=true;if(parent.classList.contains('tool-collapsed')){parent.classList.remove('tool-collapsed');const toggle=parent.querySelector('.tool-collapse-toggle');if(toggle){toggle.textContent='Collapse';toggle.setAttribute('aria-expanded','true');}}}
        root?.scrollIntoView({block:'start',behavior:'smooth'});root?.querySelector('.weekly-rating')?.focus({preventScroll:true});
      });
      dialog.addEventListener('click',event=>{if(event.target===dialog&&event.offsetX>=0&&event.offsetY>=0){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    }
  }
  function openAssessmentPopup(kind,name){
    const dialog=$('assessmentPopup'),rows=weekRows(kind,name);
    if(!dialog)return;
    dialog.innerHTML='<div class="assessment-popup-head"><div><h3 id="assessmentPopupTitle">'+esc(name)+' · weekly assessment</h3><p>Calculated and engineer-reviewed results for each week.</p></div><button type="button" class="btn quiet" data-popup-close aria-label="Close weekly assessment">Close</button></div>'+
      (rows.length?'<div class="table-wrap"><table class="data-table"><thead><tr><th>Week ending</th><th>Calculated</th><th>Reported</th><th>Comment</th><th></th></tr></thead><tbody>'+rows.map(row=>{const s=reviewedWeekState(kind,name,row);return '<tr><td>'+esc(String(row.week_ending||row.end||'').slice(0,10))+'</td><td>'+ragPill(s.calculated)+'</td><td>'+ragPill(s.reviewed)+(s.historical_review?' · recheck':'')+'</td><td>'+esc(s.review?.reason||'—')+'</td><td><button type="button" class="btn" data-popup-detail="'+esc(weekKey(name,row))+'" data-week-kind="'+kind+'" data-week-name="'+esc(name)+'">Detail review</button></td></tr>';}).join('')+'</tbody></table></div>':'<p>No assessed weeks for this item. Load its source and run the assessment.</p>');
    if(!dialog.open)dialog.showModal();
  }

  function ensureUi() {
    const panel = document.querySelector('#tab-data-health > .panel');
    if (!panel || $('surveyReviewHeader')) return;

    const header = document.createElement('section');
    header.id = 'surveyReviewHeader';
    header.className = 'w26-survey-header';
    header.innerHTML =
      '<div class="w26-survey-title-row"><div><span class="w26-eyebrow">Flow Survey</span><h3>Assessment review</h3><p>Select a monitor or gauge, review its week, and record your rating and comment.</p></div><div class="w26-header-actions" id="surveyReviewActions"></div></div>' +
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

      window.__ICM_PRECISION_WORKBENCH__?.navigate('survey','monthly-review',true);
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
      if (h) h.textContent = 'FDV assessment';
      if (p) p.textContent = 'Select a week, click a monitor, then review its evidence and record a weekly comment.';
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

    const captureDraft=event=>{
      const form=event.target.closest('.weekly-editor');if(!form)return;
      weeklyDrafts.set(draftKey(form.dataset.weekKind,form.dataset.weekKey),{rating:form.querySelector('.weekly-rating').value,comment:form.querySelector('.weekly-comment').value,reviewer:form.querySelector('.weekly-reviewer').value});
    };
    panel.addEventListener('input',captureDraft);panel.addEventListener('change',captureDraft);
    panel.addEventListener('click', event => {
      const node=event.target.closest('[data-survey-node],[data-survey-gauge]');
      if(node){const kind=node.hasAttribute('data-survey-gauge')?'gauge-week':'monitor-week',name=node.dataset.surveyGauge||node.dataset.surveyNode;selectReviewWeek(kind,name,null,survey.schematicWeek);return;}
      const matrixCell=event.target.closest('[data-matrix-cell]');
      if(matrixCell){selectReviewWeek(matrixCell.dataset.weekKind,matrixCell.dataset.weekName,matrixCell.dataset.weekKey,matrixCell.dataset.weekEnding);return;}
      const drawerTab=event.target.closest('[data-drawer-tab]');
      if(drawerTab){survey.reviewContext.drawerTab=drawerTab.dataset.drawerTab;renderAllMatrices();return;}
      const drawerClose=event.target.closest('[data-drawer-close]');
      if(drawerClose){survey.reviewContext.name=null;survey.reviewContext.weekKey=null;renderAllMatrices();return;}
      const exceptionStep=event.target.closest('[data-exception-step]');
      if(exceptionStep){const kind=survey.reviewContext.kind||'monitor-week',queue=exceptionQueue(kind);if(!queue.length)return;let at=queue.findIndex(item=>item.name===survey.reviewContext.name&&item.key===survey.reviewContext.weekKey);at=(at+Number(exceptionStep.dataset.exceptionStep||1)+queue.length)%queue.length;const item=queue[at];selectReviewWeek(item.kind,item.name,item.key,item.week);return;}
      const balanceCell=event.target.closest('[data-balance-matrix]');
      if(balanceCell){survey.selectedBalanceKey=balanceCell.dataset.balanceMatrix;renderBalanceReview();return;}
      const panButton=event.target.closest('[data-schematic-pan]');
      if(panButton){const viewport=$('assessmentSchematicViewport-'+panButton.dataset.schematicKind),enabled=panButton.getAttribute('aria-pressed')!=='true';panButton.setAttribute('aria-pressed',String(enabled));viewport.dataset.pan=enabled?'on':'off';return;}
      const zoomButton=event.target.closest('[data-schematic-zoom]');
      if(zoomButton){const suffix=zoomButton.dataset.schematicKind,delta=Number(zoomButton.dataset.schematicZoom||0);survey.reviewContext.zoom[suffix]=Math.min(MAX_SCHEMATIC_ZOOM,Math.max(MIN_SCHEMATIC_ZOOM,Number(survey.reviewContext.zoom[suffix]||1)+delta*.25));updateSchematicView(suffix,true);return;}
      const fitButton=event.target.closest('[data-schematic-fit]');
      if(fitButton){survey.reviewContext.zoom[fitButton.dataset.schematicKind]=1;updateSchematicView(fitButton.dataset.schematicKind);const viewport=$('assessmentSchematicViewport-'+fitButton.dataset.schematicKind);if(viewport){viewport.scrollLeft=0;viewport.scrollTop=0;}return;}
      const focusButton=event.target.closest('[data-schematic-focus]');
      if(focusButton){const suffix=focusButton.dataset.schematicKind,name=suffix==='fdv'?survey.selectedMonitor:survey.selectedGauge;if(!name)return;const viewport=$('assessmentSchematicViewport-'+suffix),selector=suffix==='fdv'?'[data-survey-node="'+CSS.escape(name)+'"]':'[data-survey-gauge="'+CSS.escape(name)+'"]',node=viewport?.querySelector(selector);if(node){const outer=viewport.getBoundingClientRect(),inner=node.getBoundingClientRect();viewport.scrollTo({left:viewport.scrollLeft+inner.x+inner.width/2-outer.x-outer.width/2,top:viewport.scrollTop+inner.y+inner.height/2-outer.y-outer.height/2,behavior:'instant'});}return;}
      const weekEdit=event.target.closest('[data-week-edit]');
      if(weekEdit){const kind=weekEdit.dataset.weekKind,match=weekByKey(kind,weekEdit.dataset.weekEdit);if(match){survey.reviewContext.drawerTab='audit';selectReviewWeek(kind,match.name,weekEdit.dataset.weekEdit);$('assessmentDrawer-'+(kind==='monitor-week'?'fdv':'rain'))?.scrollIntoView({block:'nearest',behavior:'smooth'});}return;}
      const quick=event.target.closest('[data-week-note]');
      if(quick){const input=quick.closest('.weekly-editor')?.querySelector('.weekly-comment');if(input){input.value=[input.value.trim(),quick.dataset.weekNote].filter(Boolean).join(' ');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}return;}
      const weeklySave=event.target.closest('[data-week-save]');
      if(weeklySave){const form=weeklySave.closest('.weekly-editor');try{applyWeeklyReview(form.dataset.weekKind,form.dataset.weekName,form.dataset.weekKey,form.querySelector('.weekly-rating').value,form.querySelector('.weekly-comment').value,form.querySelector('.weekly-reviewer').value);weeklyDrafts.delete(draftKey(form.dataset.weekKind,form.dataset.weekKey));renderAllMatrices();}catch(err){form.querySelector('.w26-review-error').textContent=String(err.message||err);}return;}
      const reset=event.target.closest('[data-week-reset]');
      if(reset){const form=reset.closest('.weekly-editor');weeklyDrafts.delete(draftKey(form.dataset.weekKind,form.dataset.weekKey));revertReview(form.dataset.weekKind,form.dataset.weekKey);return;}
      const close=event.target.closest('[data-week-close]');
      if(close){if(close.dataset.weekClose==='monitor')survey.selectedMonitor=null;else survey.selectedGauge=null;survey.selectedWeek=null;renderMonitorDetail();renderGaugeDetail();return;}
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
    panel.addEventListener('keydown',event=>{
      if(['Enter',' '].includes(event.key)&&event.target.matches('[data-survey-node],[data-survey-gauge]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
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
    const networkCandidates = survey.batch?.network?.candidate_wapug_events || [];
    const networkQualified = survey.batch?.network?.qualified_wapug_events || [];
    const noQualifiedEventText = networkCandidates.length
      ? 'Not assessed — no network-qualified WAPUG event'
      : 'Not assessed — no WAPUG candidate event';
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
      const eventText = s.events.length ? (s.failures ? s.failures+' flagged / '+s.events.length : s.events.length+' reviewed') : noQualifiedEventText;
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
      survey.selectedMonitor = null;
    }
    renderMonitorDetail();
  }

  function renderMonitorDetail() {
    const root=$('surveyMonitorDetail'),monitor=monitorByName(survey.selectedMonitor);
    if(!root)return;
    if(!monitor){root.innerHTML='';return;}
    const state=reviewedMonitorState(monitor),legacy=monitorComment(monitor.monitor),legacyReview=reviewFor('monitor',monitor.monitor);
    root.innerHTML='<div class="w26-detail-head"><div><h4>'+esc(monitor.monitor)+' · weekly review</h4><p>'+esc(monitor.rain_gauge||'No mapped gauge')+' · calculated '+esc(state.calculated)+' · reported '+esc(state.reviewed)+'</p></div><button type="button" class="btn quiet" data-week-close="monitor">Close detail</button></div>'+weeklyReviewTable('monitor-week',monitor.monitor)+weeklyEditor('monitor-week',monitor.monitor)+
      '<details class="w26-technical-evidence"><summary>Event response evidence</summary>'+monitorEventEvidence(monitor)+'</details>'+
      (legacy||legacyReview?'<details class="w26-technical-evidence"><summary>Previous monitor-wide review</summary><p>Retained from the earlier review workflow. Weekly ratings are reviewed separately.</p>'+(legacy?'<p>'+esc(legacy.text)+' · '+esc(legacy.author||'—')+'</p>':'')+(legacyReview?'<p>'+esc(legacyReview.reviewed_status)+' · '+esc(legacyReview.reason)+' · '+esc(legacyReview.reviewer||'—')+'</p>':'')+'</details>':'');
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
    if (!gaugeByName(survey.selectedGauge)) survey.selectedGauge = null;
    renderGaugeDetail();
  }

  function renderGaugeDetail() {
    const root=$('surveyGaugeDetail'),gauge=gaugeByName(survey.selectedGauge);
    if(!root)return;
    if(!gauge){root.innerHTML='';return;}
    root.innerHTML='<div class="w26-detail-head"><div><h4>'+esc(gauge.gauge)+' · weekly review</h4><p>Coverage '+fmt(gauge.operational_coverage_percent,1)+'% · '+Number(gauge.event_strike_count||0)+' event strikes</p></div><button type="button" class="btn quiet" data-week-close="gauge">Close detail</button></div>'+weeklyReviewTable('gauge-week',gauge.gauge)+weeklyEditor('gauge-week',gauge.gauge)+
      '<details class="w26-technical-evidence"><summary>Gauge fault and coverage evidence</summary>'+scalarEvidence(gauge)+'</details>';
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
    table.innerHTML = balanceMatrixHtml() +
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

  function weeklyReportTableHtml(commentsOnly=false){
    const rows=[];
    for(const [kind,names] of [['monitor-week',(survey.batch?.monitors||[]).map(m=>m.monitor)],['gauge-week',(survey.batch?.network?.gauge_summary||[]).map(g=>g.gauge)]]){
      for(const name of names)for(const row of weekRows(kind,name)){
        const state=reviewedWeekState(kind,name,row),review=state.review;
        if(commentsOnly&&!review)continue;
        rows.push('<tr><td>'+esc(name)+'</td><td>'+esc(String(row.week_ending||row.end||'').slice(0,10))+'</td><td>'+esc(state.calculated)+'</td><td>'+esc(state.reviewed)+(state.historical_review?' · review needs recheck':'')+'</td><td>'+esc(review?.reason||'—')+'</td><td>'+esc(review?.reviewer||'—')+'</td><td>'+esc(review?.reviewed_at||'—')+'</td></tr>');
        for(const prior of review?.history||[])rows.push('<tr><td>'+esc(name)+'</td><td>'+esc(String(row.week_ending||row.end||'').slice(0,10))+' · prior review</td><td>'+esc(prior.calculated_status_at_review)+'</td><td>'+esc(prior.reviewed_status)+' · historical</td><td>'+esc(prior.reason||'—')+'</td><td>'+esc(prior.reviewer||'—')+'</td><td>'+esc(prior.reviewed_at||'—')+'</td></tr>');
      }
    }
    return rows.length?'<div class="table-wrap"><table class="data-table"><thead><tr><th>Monitor / gauge</th><th>Week ending</th><th>Calculated</th><th>Reported</th><th>Weekly comment / rationale</th><th>Reviewer</th><th>Reviewed at</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div>':'<p class="muted">No weekly reviews recorded.</p>';
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
    for (const kind of ['monitor-week','gauge-week']) {
      const names=kind==='monitor-week'?(survey.batch?.monitors||[]).map(m=>m.monitor):(network.gauge_summary||[]).map(g=>g.gauge);
      for(const name of names)for(const row of weekRows(kind,name)) {
        const state=reviewedWeekState(kind,name,row);
        const subject=name+' · week ending '+String(row.week_ending||row.end||'').slice(0,10);
        if(state.historical_review) {
          actions.push({area:kind==='monitor-week'?'Monitor':'Rainfall',subject,severity:'Amber',action:'Reconfirm retained weekly review because the inputs or calculated assessment changed.'});
        } else if(['Red','Amber'].includes(state.reviewed)) {
          actions.push({area:kind==='monitor-week'?'Monitor':'Rainfall',subject,severity:state.reviewed,action:state.review?.reason||row.decision_path||'Review the evidence for this week.'});
        }
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
    const candidates = network.candidate_wapug_events || [];
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
    const rainfallSuitabilityNote = candidates.length && !qualified
      ? '<div class="w26-review-warning"><strong>Event Response not assessed from network rainfall.</strong> '+candidates.length+' WAPUG candidate event'+(candidates.length===1?' was':'s were')+' identified, but none met the network suitability criteria. This is rainfall/network-quality evidence, not a monitor-response failure.</div>'
      : '';
    root.innerHTML =
      rainfallSuitabilityNote+
      '<div class="w26-monthly-grid">'+
        '<div><span>Monitor status</span><strong>'+monitorCounts.Green+' G · '+monitorCounts.Amber+' A · '+monitorCounts.Red+' R · '+monitorCounts.Grey+' Grey</strong></div>'+
        '<div><span>Rain gauges</span><strong>'+gaugeCounts.Green+' G · '+gaugeCounts.Amber+' A · '+gaugeCounts.Red+' R · '+gaugeCounts.Grey+' Grey</strong></div>'+
        '<div><span>Network WAPUG events</span><strong>'+candidates.length+' candidate'+(candidates.length===1?'':'s')+' · '+qualified+' qualified</strong></div>'+
        '<div><span>Volume balance</span><strong>'+balanceCounts.Green+' G · '+balanceCounts.Amber+' A · '+balanceCounts.Red+' R · '+balanceCounts.Grey+' Grey</strong></div>'+
        '<div><span>Review integrity</span><strong>'+(historical ? historical+' review'+(historical===1?'':'s')+' need reconfirmation' : 'Current')+'</strong></div>'+
      '</div>'+
      '<div class="w26-section-head"><div><h4>Engineering action register</h4><p>Exceptions only. Reviewed outcomes drive this register; all calculated evidence remains available underneath.</p></div></div>'+
      (actionRows ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Area</th><th>Subject</th><th>Severity</th><th>Action / rationale</th></tr></thead><tbody>'+actionRows+'</tbody></table></div>' : '<div class="w26-good-state">No Amber/Red monitor, rainfall or volume-balance exceptions in the current reported assessment.</div>')+
      '<div class="w26-section-head"><div><h4>Weekly assurance matrix</h4><p>Reported monitor-week status; R marks an engineer review and ! marks a review that needs reconfirmation.</p></div></div>'+weekMatrixHtml('monitor-week',{readonly:true})+
      '<div class="w26-section-head"><div><h4>Weekly reviewer comments</h4><p>Each comment belongs to a specific monitor or gauge week.</p></div></div>'+weeklyReportTableHtml(true)+
      (commentRows ? '<div class="w26-section-head"><div><h4>Previous monitor-wide comments</h4><p>Retained from earlier workspaces.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Monitor</th><th>Reported status</th><th>Comment</th><th>Author</th><th>Updated</th></tr></thead><tbody>'+commentRows+'</tbody></table></div>' : '');
    for(const head of [...root.children].filter(el=>el.classList.contains('w26-section-head'))){
      const section=document.createElement('section');section.className='w26-review-section';head.before(section);section.appendChild(head);
      while(section.nextElementSibling&&!section.nextElementSibling.classList.contains('w26-section-head'))section.appendChild(section.nextElementSibling);
    }
  }

  function renderAll() {
    renderHeader();
    renderMonitorReview();
    renderRainfallReview();
    renderBalanceReview();
    renderMonthlyReview();
    renderAssessmentSchematics();
    renderAllMatrices();
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

    const candidateEvents = network.candidate_wapug_events || [];
    const qualifiedEvents = network.qualified_wapug_events || [];
    const minGauges = Number(network.criteria?.minimum_operational_gauges || 2);
    const cvLimit = Number(network.criteria?.spatial_cv_limit_percent || 40);
    const eventRows = candidateEvents.map(event => {
      let decision = 'Qualified';
      if (!event.qualifies_network_wapug) {
        if (Number(event.operational_gauges || 0) < minGauges) decision = 'Not qualified — fewer than '+minGauges+' operational gauges';
        else if (event.spatial_cv_percent != null && Number(event.spatial_cv_percent) > cvLimit) decision = 'Not qualified — spatial CV '+fmt(event.spatial_cv_percent,1)+'% > '+fmt(cvLimit,1)+'%';
        else decision = 'Not qualified — network quality criteria not met';
      }
      return '<tr><td>'+esc(event.event || '—')+'</td><td>'+esc(event.start || '—')+'</td><td>'+esc(event.end || '—')+'</td>'+
        '<td>'+fmt(event.mean_depth_mm,2)+' mm</td><td>'+fmt(event.spatial_cv_percent,1)+'%</td><td>'+Number(event.operational_gauges || 0)+'</td><td>'+esc(decision)+'</td></tr>';
    }).join('');

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
      '<div class="note"><strong>Monthly engineering assessment.</strong> Automated calculations remain preserved separately from engineer-reviewed outcomes. Reviewer comments and overrides belong to individual assessed weeks; calculated scores remain available separately.</div>'+
      '<h2>Assessment overview</h2>'+
      '<div class="report-grid">'+
        '<div class="card"><h3>Period</h3><p>'+esc(surveyPeriodText())+'</p></div>'+
        '<div class="card"><h3>Survey context</h3><p>'+Number(monitors.length)+' monitor(s) · '+Number(network.gauge_count || 0)+' rain gauge(s) · '+Number(candidateEvents.length)+' WAPUG candidate(s) · '+Number(qualifiedEvents.length)+' network-qualified</p></div>'+
      '</div>'+
      '<h2>Monitor assessment</h2><div class="table-wrap"><table><thead><tr><th>Monitor</th><th>Rain gauge</th><th>Diameter</th><th>Calculated</th><th>Reported</th><th>Weeks</th><th>Events</th><th>Override rationale</th><th>Engineering comment</th></tr></thead><tbody>'+monitorRows+'</tbody></table></div>'+
      '<h2>Rainfall assessment</h2>'+(gaugeRows ? '<div class="table-wrap"><table><thead><tr><th>Gauge</th><th>Coverage</th><th>Event strikes</th><th>Dynamic status</th><th>Calculated</th><th>Reported</th></tr></thead><tbody>'+gaugeRows+'</tbody></table></div>' : '<p class="muted">No gauge assessment rows.</p>')+
      '<h3>WAPUG event suitability</h3>'+(eventRows ? '<div class="table-wrap"><table><thead><tr><th>Event</th><th>Start</th><th>End</th><th>Mean depth</th><th>Spatial CV</th><th>Operational gauges</th><th>Network suitability</th></tr></thead><tbody>'+eventRows+'</tbody></table></div>' : '<p class="muted">No candidate WAPUG events in the current Flow Survey assessment.</p>')+
      '<h2>Volume balance</h2>'+(balanceRowsHtml ? '<div class="table-wrap"><table><thead><tr><th>Week</th><th>Network path</th><th>Calculated</th><th>Reported</th><th>Ratio</th><th>Likely source</th><th>Recommendation</th></tr></thead><tbody>'+balanceRowsHtml+'</tbody></table></div>' : '<p class="muted">No volume-balance relationships available.</p>')+
      '<h2>Engineering action register</h2>'+(actionRows ? '<div class="table-wrap"><table><thead><tr><th>Area</th><th>Subject</th><th>Severity</th><th>Action / rationale</th></tr></thead><tbody>'+actionRows+'</tbody></table></div>' : '<p class="muted">No Amber/Red exceptions in the current reported assessment.</p>')+
      '<h2>Weekly assessment and reviewer comments</h2>'+weeklyReportTableHtml()+
      '<h2>Previous monitor-wide comments</h2>'+(commentRows ? '<div class="table-wrap"><table><thead><tr><th>Monitor</th><th>Reported status</th><th>Comment</th><th>Author</th><th>Updated</th></tr></thead><tbody>'+commentRows+'</tbody></table></div>' : '<p class="muted">No monitor comments recorded.</p>')+
      '<h2>Audit note</h2><p class="muted">This monthly output is intended as a concise engineering hand-off. Detailed weekly calculations, Event Response evidence, raw gauge evidence, exclusions and source provenance remain available in the workbench/full HTML report.</p>';

    if (typeof reportShell === 'function') {
      return reportShell('Hydra Bench — Monthly Flow Survey Assessment', surveyPeriodText(), body, true).replace('</head>','<style>@media print{.table-wrap{break-inside:auto;overflow:visible;border-radius:0}thead{display:table-header-group}tr{break-inside:avoid}h2,h3{break-after:avoid}table{min-width:0}th,td{font-size:9px;padding:4px 6px}.report-header{margin-bottom:12px}.note{margin-bottom:12px}}</style></head>');
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
    for (const monitor of survey.batch?.monitors || [])for(const row of weekRows('monitor-week',monitor.monitor))add('monitor-week',weekKey(monitor.monitor,row),'Monitor · '+monitor.monitor+' · week '+String(row.week_ending||row.end||''),reviewedWeekState('monitor-week',monitor.monitor,row));
    for (const gauge of survey.batch?.network?.gauge_summary || []){const weeks=weekRows('gauge-week',gauge.gauge);if(weeks.length)for(const row of weeks)add('gauge-week',weekKey(gauge.gauge,row),'Gauge · '+gauge.gauge+' · week '+String(row.week_ending||''),reviewedWeekState('gauge-week',gauge.gauge,row));else add('gauge',gauge.gauge,'Rain gauge · '+gauge.gauge,reviewedGaugeState(gauge));}
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
    return '<h3>Weekly engineer review</h3>'+weeklyReportTableHtml(true)+'<h3>Engineer review / final assessment</h3><div class="note">Calculated results are retained separately from reviewed results for monitors, rain gauges and weekly volume-balance paths. Stale reviews never silently supersede a changed calculation.</div>'+
      '<div class="table-wrap"><table><thead><tr><th>Assessment item</th><th>Calculated</th><th>Reported</th><th>Engineering rationale / review state</th><th>Reviewer</th><th>Reviewed at</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<h3>Monitor engineering comments</h3>'+(comments ? '<div class="table-wrap"><table><thead><tr><th>Monitor</th><th>Comment</th><th>Author</th><th>Updated</th></tr></thead><tbody>'+comments+'</tbody></table></div>' : '<p class="muted">No monitor engineering comments recorded.</p>');
  }

  function installPersistence() {
    if (typeof workspaceObject === 'function') {
      const coreWorkspaceObject = workspaceObject;
      workspaceObject = function(...args) {
        const value = coreWorkspaceObject(...args);
        value.survey = value.survey || {};
        value.survey.review_ledger = JSON.parse(JSON.stringify(survey.reviewLedger || []));
        value.survey.comment_ledger = JSON.parse(JSON.stringify(survey.commentLedger || []));
        // Retain current snapshots for backward readers; the ledgers above are
        // the authoritative audit records from schema v5 onward.
        value.survey.engineer_reviews = JSON.parse(JSON.stringify(survey.reviews || {}));
        value.survey.monitor_comments = JSON.parse(JSON.stringify(survey.monitorComments || {}));
        value.survey.review_context = JSON.parse(JSON.stringify(survey.reviewContext || {}));
        value.survey.review_schema_version = 5;
        return value;
      };
    }
    if (typeof applyWorkspace === 'function') {
      const coreApplyWorkspace = applyWorkspace;
      applyWorkspace = async function(value) {
        weeklyDrafts.clear();
        const result = await coreApplyWorkspace(value);
        const legacyReviews = value?.survey?.engineer_reviews && typeof value.survey.engineer_reviews === 'object'
          ? JSON.parse(JSON.stringify(value.survey.engineer_reviews))
          : {};
        survey.reviewLedger = Array.isArray(value?.survey?.review_ledger)
          ? JSON.parse(JSON.stringify(value.survey.review_ledger))
          : migrateLegacyReviews(legacyReviews);
        rebuildReviewSnapshot();

        const legacyComments = value?.survey?.monitor_comments && typeof value.survey.monitor_comments === 'object'
          ? JSON.parse(JSON.stringify(value.survey.monitor_comments))
          : {};
        survey.commentLedger = Array.isArray(value?.survey?.comment_ledger)
          ? JSON.parse(JSON.stringify(value.survey.comment_ledger))
          : migrateLegacyComments(legacyComments);
        rebuildCommentSnapshot();
        survey.reviewContext = value?.survey?.review_context && typeof value.survey.review_context === 'object'
          ? {...survey.reviewContext,...JSON.parse(JSON.stringify(value.survey.review_context))}
          : survey.reviewContext;
        survey.reviewContext.zoom = survey.reviewContext.zoom || {fdv:1,rain:1};
        survey.selectedWeeks = {};
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
    version:5,
    weekKey,reviewedWeekState,applyWeeklyReview,weekRows,
    reviewLedgerEvents,rebuildReviewSnapshot,
    weekMatrixHtml,exceptionQueue,selectReviewWeek,drawerContent,balanceMatrixHtml,renderAllMatrices,
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
