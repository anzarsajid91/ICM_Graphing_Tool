/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";

const pageSize=30;
const labels=new Map([
  ["unlocated-timestamps","Invalid timestamp"],["duplicate-timestamp","Duplicate timestamp"],
  ["missing-values","Missing values"],["long-timestep","Long timestep"],["short-timestep","Short timestep"],
  ["flatline","Potential flatline"],["isolated-spike","Potential spike"],["abrupt-change","Abrupt change"],
  ["above-screening-bound","Above screening bound"],["below-screening-bound","Below screening bound"],
  ["quantity-review","Quantity interpretation"],["unit-review","Unit interpretation"]
]);
const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const format=value=>value===null||value===undefined?"Unavailable":typeof value==="number"?new Intl.NumberFormat(undefined,{maximumSignificantDigits:8}).format(value):value;
async function localFingerprint(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value)),digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function mount() {
  const root=node("dialog");root.id="tab-series-quality";root.setAttribute("aria-labelledby","hbQualityTitle");
  root.innerHTML=`<article class="panel">
    <div class="panel-head"><div><h2 id="hbQualityTitle">Time-series quality diagnostics</h2><p>Review suspected issues in instantaneous readings. Use the source clock and channel units to choose thresholds.</p></div>
      <button type="button" id="hbQualityClose">Close diagnostics</button></div>
    <form id="hbQualityForm">
      <div class="mapping-grid">
        <label>Source series<select name="source" required></select></label>
        <label>Expected timestep (s)<input type="number" name="expected_step_s" min="0.001" step="any" required></label>
        <label>Allowed timestep variation (s)<input type="number" name="jitter_s" min="0" value="0" step="any" required></label>
        <label>Start (optional)<input type="datetime-local" name="start" step="1"></label>
        <label>End (optional)<input type="datetime-local" name="end" step="1"></label>
      </div>
      <p id="hbQualityUnit" role="status"></p>
      <details><summary>Value diagnostics</summary>
        <div class="mapping-grid">
          <label>Maximum flatline amplitude<input type="number" name="flat_amplitude" min="0" step="any"></label>
          <label>Minimum flatline duration (s)<input type="number" name="flat_seconds" min="0.001" step="any"></label>
          <label>Abrupt change threshold<input type="number" name="change_limit" min="0" step="any"></label>
          <label>Lower plausible value<input type="number" name="lower" step="any"></label>
          <label>Upper plausible value<input type="number" name="upper" step="any"></label>
        </div>
        <p>Use the displayed canonical unit. Leave both flatline fields blank to omit the flatline check.</p>
      </details>
      <details><summary>Clock comparison</summary>
        <div class="mapping-grid">
          <label>Reference record of the same signal<select name="reference"></select></label>
          <label>Maximum lag steps<input type="number" name="lag" value="6" min="1" max="24" step="1" required></label>
          <label><input type="checkbox" name="clockConfirm"> The reference records the same signal on its own clock</label>
        </div>
        <p>Peak correlation indicates a possible shift. Check recorded clock settings and other evidence.</p>
      </details>
      <div class="actions"><button type="submit" class="primary">Review source quality</button></div>
    </form>
    <p id="hbQualityStatus" role="status"></p>
    <section id="hbQualityResults" hidden>
      <h3>Diagnostic register</h3>
      <p id="hbQualityCoverage"></p><p id="hbQualityClock"></p>
      <div class="actions"><label>Filter diagnostics<select id="hbQualityFilter"></select></label>
        <button type="button" id="hbQualityPrevious">Previous page</button><button type="button" id="hbQualityNext">Next page</button>
        <button type="button" id="hbQualityDownload">Download diagnostic review CSV</button><span id="hbQualityCount"></span>
      </div>
      <div class="table-wrap"><table id="hbQualityRows"><caption>Diagnostic candidates and engineer decisions</caption><thead><tr>
        <th scope="col">Finding</th><th scope="col">Start (project clock)</th><th scope="col">End (project clock)</th><th scope="col">Evidence</th><th scope="col">Review</th>
      </tr></thead><tbody></tbody></table></div>
    </section>
  </article>`;
  document.body.append(root);
  const $=id=>root.querySelector("#"+id),form=$("hbQualityForm"),controls=form.elements;
  const status=$("hbQualityStatus"),view=$("hbQualityResults"),table=$("hbQualityRows").tBodies[0];
  const submit=form.querySelector('[type="submit"]'),ref=controls.reference,picker=controls.source,filter=$("hbQualityFilter");
  let candidates=null,signature=null,workflow=null,selectedPage=0,generation=0;

  const available=()=>allSeries().filter(({item})=>item.status==="ready"&&item.hash&&
    item.parsed?.metadata?.timestamp_convention==="instantaneous"&&item.parsed?.metadata?.time_basis!=="timezone-aware/unresolved");
  const identify=(key)=>available().find(row=>row.key===key);
  function sourceSignature(row){
    if(!row)return null;
    const {item,col}=row,metadata=seriesMetadata(item,col);
    return [item.id,item.hash,col,seriesQuantity(item,col),seriesUnit(item,col),seriesReference(item,col),
      metadata.original_unit,metadata.detected_unit,metadata.conversion_factor];
  }
  function currentSignature(){return JSON.stringify([sourceSignature(identify(picker.value)),sourceSignature(identify(ref.value))]);}
  function invalidate(){
    ++generation;
    if(candidates||status.textContent) status.textContent="Inputs changed. Review the current source to refresh the findings.";
    view.hidden=true;candidates=null;workflow=null;signature=null;
  }
  function refreshSources(){
    const rows=available();
    for(const [select,label,eligible] of [[picker,"Choose an instantaneous series",rows],[ref,"No reference",rows.filter(row=>row.key!==picker.value)]]){
      const saved=select.value;
      select.replaceChildren(new Option(label,""),...eligible.map(row=>new Option(row.label,row.key)));
      select.value=eligible.some(row=>row.key===saved)?saved:"";
    }
    const row=identify(picker.value),unit=row&&seriesUnit(row.item,row.col);
    $("hbQualityUnit").textContent=unit?"Canonical unit "+unit+(seriesQuantity(row.item,row.col)?" · "+seriesQuantity(row.item,row.col):""):
      row?"The source quantity or unit is unresolved. Timestamp diagnostics are available.":"Import an instantaneous series or open Time series to resolve the source clock.";
    if(signature&&currentSignature()!==signature)invalidate();
  }
  picker.addEventListener("change",refreshSources);
  form.addEventListener("input",invalidate);form.addEventListener("change",invalidate);
  $("hbQualityClose").onclick=()=>root.close();

  form.onsubmit=async event=>{
    event.preventDefault();
    invalidate();
    const current=++generation,source=identify(picker.value),reference=identify(ref.value),inputSignature=currentSignature();
    if(!source){status.textContent="Choose a reviewed local source series.";return;}
    if(reference&&!controls.clockConfirm.checked){status.textContent="Confirm the reference records the same measured signal.";return;}
    submit.disabled=true;status.textContent="Inspecting the actual source samples in the local worker…";
    try {
      const criteria=Object.fromEntries(["expected_step_s","jitter_s","flat_amplitude","flat_seconds","change_limit","lower","upper"]
        .map(name=>[name,controls[name].value===""?null:controls[name].valueAsNumber]));
      const start=controls.start.value||null,end=controls.end.value||null,lag=reference?controls.lag.valueAsNumber:null;
      await ensureEngineBoot();
      const result=await engine.call("inspect_local_series",{
        path:source.item.virtualPath,column:source.col,criteria,start,end,
        reference_path:reference?.item.virtualPath||null,reference_column:reference?.col||null,search_steps:lag
      });
      const basis=await localFingerprint([result.method,sourceSignature(source).slice(1),sourceSignature(reference)?.slice(1)||null,
        result.criteria,start,end,lag]);
      if(current!==generation||inputSignature!==currentSignature())return;
      candidates=result;workflow={source,reference,basis};signature=inputSignature;selectedPage=0;filter.replaceChildren(new Option("All findings",""));
      for(const key of Object.keys(result.diagnostics_by_kind))filter.add(new Option(labels.get(key),key));
      view.hidden=false;
      $("hbQualityCoverage").textContent=`${result.valid_values} valid values of ${result.rows} source rows. ${result.candidate_count} candidate findings.`+
        (result.candidate_count>result.displayed_limit?` ${result.displayed_limit} available for review. Choose a shorter period to see the remaining findings.`:"");
      renderClock(result.clock);renderFindings();status.textContent="Diagnostic review ready. Assess the evidence before recording a fault or exclusion.";
    } catch(error){if(current===generation)status.textContent=conciseErrorMessage(error);}
    finally{submit.disabled=false;}
  };
  function renderClock(result){
    const clock=$("hbQualityClock");
    if(!result){clock.textContent="";return;}
    const formatHalf=(name,part)=>part?.best?`${name}: ${part.status==="candidate"?"candidate":"inconclusive best match"} reference shift ${format(part.best.reference_shift_s)} s, correlation ${format(part.best.correlation)}, ${part.best.sample_pairs} exact pairs.`:`${name}: insufficient comparable samples.`;
    clock.textContent=[formatHalf("Early window",result.early),formatHalf("Late window",result.late),
      result.change_in_candidate_shift_s!==null?`Change in candidate shift ${format(result.change_in_candidate_shift_s)} s. Investigate a possible drift or signal mismatch.`:"A change in clock offset is unresolved."].join(" ");
  }
  const reviewKey=value=>workflow.basis+':'+JSON.stringify([value.kind,value.start,value.end,value.observed,value.basis]);
  const reviewFor=key=>window.ICMProjectRegistry?.readSourceReview(key)||{decision:"",note:"",exclusionId:null};
  const exclusionRecorded=review=>review.exclusionId&&state.exclusions.some(row=>row.id===review.exclusionId);
  function allFindings(){return candidates.findings.filter(value=>!filter.value||value.kind===filter.value);}
  function renderFindings(){
    const rows=allFindings(),slice=rows.slice(selectedPage*pageSize,(selectedPage+1)*pageSize);
    table.replaceChildren();
    for(const value of slice){
      const row=table.insertRow(),label=labels.get(value.kind);
      for(const text of [label,value.start||"Unlocated",value.end||"Unlocated",format(value.observed)+" · "+value.basis])
        row.insertCell().textContent=text;
      const cell=row.insertCell(),choice=node("select"),note=node("input"),key=reviewKey(value),review=reviewFor(key);
      const save=()=>{
        if(!exclusionRecorded(review))review.exclusionId=null;
        if(!window.ICMProjectRegistry?.saveSourceReview(key,review))status.textContent="The project can retain up to 1,000 diagnostic decisions. Keep a local export before clearing older decisions.";
      };
      choice.setAttribute("aria-label",label+" review decision");
      note.setAttribute("aria-label",label+" review note");note.maxLength=500;note.placeholder="Review note";
      for(const [key,text] of [["","Unreviewed"],["accepted","Accept finding"],["rejected","Reject finding"]])choice.add(new Option(text,key));
      choice.value=review.decision;note.value=review.note;
      choice.onchange=()=>{review.decision=choice.value;save();};
      note.oninput=()=>{review.note=note.value.trim();save();};
      cell.append(choice,note);
      if(value.start&&value.end&&value.start<value.end){
        const already=Boolean(exclusionRecorded(review));
        const exclude=node("button",already?"Exclusion recorded":"Add review exclusion");exclude.type="button";exclude.disabled=already;
        exclude.onclick=()=>{
          if(currentSignature()!==signature){invalidate();return;}
          if(!review.note){status.textContent="Enter a reason in the review note before adding the exclusion.";note.focus();return;}
          review.exclusionId=crypto.randomUUID();
          addExclusionRow({id:review.exclusionId,start:value.start,end:value.end,reason:review.note,scope:workflow.source.key});
          save();exclude.disabled=true;exclude.textContent="Exclusion recorded";
          status.textContent="Source-specific exclusion added. Manage it in the existing Time series and spill exclusion editor.";
        };
        cell.append(exclude);
      }
    }
    $("hbQualityPrevious").disabled=selectedPage===0;$("hbQualityNext").disabled=(selectedPage+1)*pageSize>=rows.length;
    $("hbQualityCount").textContent=rows.length?`${selectedPage*pageSize+1}–${selectedPage*pageSize+slice.length} of ${rows.length}`:"No matching findings";
  }
  $("hbQualityPrevious").onclick=()=>{--selectedPage;renderFindings();};$("hbQualityNext").onclick=()=>{++selectedPage;renderFindings();};
  filter.onchange=()=>{selectedPage=0;renderFindings();};
  $("hbQualityDownload").onclick=()=>{
    if(!candidates||currentSignature()!==signature){invalidate();return;}
    const {source,reference}=workflow;
    const rows=[["Build",buildToken],["Method",candidates.method],["Source",source.label],["Source SHA-256",source.item.hash],
      ["Canonical unit",candidates.source_contract.canonical_unit],["Reference",reference?.label||""],["Reference SHA-256",reference?.item.hash||""],
      ["Candidate count",candidates.candidate_count],...Object.entries(candidates.criteria),["Clock evidence",JSON.stringify(candidates.clock)],
      ["Finding","Start","End","Observed","Basis","Decision","Review note","Exclusion recorded"],
      ...candidates.findings.map(r=>{
        const review=reviewFor(reviewKey(r));return [labels.get(r.kind),r.start,r.end,r.observed,r.basis,review.decision,review.note,Boolean(exclusionRecorded(review))];
      })];
    downloadBlob("hydra-source-quality-review.csv",rows.map(row=>row.map(ICMSafeCSV.cell).join(",")).join("\r\n"),"text/csv");
  };
  window.addEventListener("icm:route-changed",({detail})=>{if(detail.workspace!=="data"&&root.open)root.close();});
  window.addEventListener("icm:source-pool-changed",refreshSources);
  return ()=>{refreshSources();if(!root.open)root.showModal();};
}

function mountTransformation(){
  const root=node('dialog');root.setAttribute('aria-labelledby','hbTransformTitle');root.id='hbTransformDialog';
  root.innerHTML=`<article class="panel">
    <div class="panel-head"><div><h2 id="hbTransformTitle">Transform time series</h2><p>Derive interval means, supported totals or reviewed state durations from local sources. Shifts apply to the derived output.</p></div>
      <button type="button" class="btn" id="hbTransformClose">Close transformation</button></div>
    <details><summary>Saved derived series</summary><div class="mapping-grid">
      <label>Project derived series<select id="hbDerivedSelection" aria-label="Project derived series"></select></label>
      <label>Open derived series JSON<input type="file" id="hbDerivedFile" accept=".json,application/json"></label></div>
      <div class="actions"><button type="button" class="btn" id="hbDerivedOpen">Open selected record</button>
      <button type="button" class="btn" id="hbDerivedRemove">Remove selected record</button></div>
      <p>Project saves keep references to derived intervals. Download the derived JSON to retain the values for another session.</p>
      <p id="hbDerivedStatus" role="status"></p></details>
    <form id="hbTransformForm"><div class="mapping-grid">
      <label>Source series<select name="source" required></select></label>
      <label>Source time shift (s)<input name="shift" type="number" value="0" required step="any"></label>
      <label>Operation<select name="operation"><option value="single">Resample source</option><option value="add">Add reference</option><option value="subtract">Subtract reference</option></select></label>
      <label id="hbTransformReference" hidden>Reference series<select name="reference" disabled></select></label>
      <label id="hbTransformReferenceShift" hidden>Reference time shift (s)<input name="referenceShift" type="number" value="0" step="any" disabled></label>
      <label id="hbTransformDatum" hidden>Shared vertical datum<input name="datum" maxlength="128" disabled></label>
      <label>Result type<select name="output"><option value="mean">Interval mean</option><option value="total">Interval total</option><option value="distribution" hidden>State durations</option></select></label>
      <label>Output unit<select name="unit"></select></label>
      <label id="hbTransformMissingState" hidden>Missing state token (optional)<input name="missingToken" maxlength="128" disabled></label>
      <label>Output interval (s)<input name="interval" type="number" value="900" min="0.001" step="any" required></label>
      <label>Maximum valid source gap (s)<input name="gap" type="number" value="900" min="0.001" step="any" required></label>
      <label>Start on project clock (optional)<input name="start" type="datetime-local" step="1"></label>
      <label>End on project clock (optional)<input name="end" type="datetime-local" step="1"></label>
      </div><p id="hbTransformBasis"></p>
      <p><label class="hb-transform-confirm"><input name="confirm" type="checkbox" required> <span id="hbTransformConfirmation">I reviewed the quantities, source timing, units and reference arithmetic</span></label></p>
      <div class="actions"><button type="submit" class="btn primary">Derive time series</button></div>
    </form>
    <p id="hbTransformStatus" role="status"></p>
    <section id="hbTransformOutput" hidden><h3>Derived intervals</h3><p id="hbTransformSummary"></p>
      <div class="actions"><button type="button" class="btn" id="hbTransformPrevious">Previous page</button><button type="button" class="btn" id="hbTransformNext">Next page</button>
        <button type="button" class="btn" id="hbTransformPlotButton" aria-pressed="false">Show interval plot</button>
        <button type="button" class="btn" id="hbTransformCsv">Download audit CSV</button><button type="button" class="btn" id="hbTransformJson">Download derived series JSON</button></div>
      <div class="actions" id="hbDerivedKeepControls"><label>Derived series name<input id="hbDerivedName" maxlength="256"></label>
        <button type="button" class="btn" id="hbDerivedKeep">Keep in project</button><span id="hbDerivedKeepStatus" role="status"></span></div>
      <p id="hbTransformPlotStatus" role="status"></p><div id="hbTransformPlot" aria-label="Derived time series for the visible interval page" hidden></div>
      <div class="table-wrap"><table class="data-table"><caption>Resampled values and valid temporal support</caption><thead><tr>
        <th scope="col">Start (included)</th><th scope="col">End (excluded)</th><th scope="col" id="hbTransformUnit">Value</th><th scope="col">Source support (s)</th><th scope="col" id="hbTransformRefSupport">Reference support (s)</th>
        <th scope="col" id="hbTransformStateReview" hidden>State support</th><th scope="col" id="hbTransformStateDuration" hidden>Recorded durations (s)</th>
      </tr></thead><tbody></tbody></table></div>
    </section></article>`;
  document.body.append(root);
  const $=id=>root.querySelector('#'+id),form=$('hbTransformForm'),fields=form.elements;
  const status=$('hbTransformStatus'),output=$('hbTransformOutput'),submit=form.querySelector('[type="submit"]');
  const registry=()=>window.ICMProjectRegistry,saved=$('hbDerivedSelection'),savedStatus=$('hbDerivedStatus');
  const plot=$('hbTransformPlot'),plotButton=$('hbTransformPlotButton'),plotStatus=$('hbTransformPlotStatus');
  const unitChoices={flow:['m³/s','L/s','m³/d','Ml/d'],rainfall:['mm/h'],depth:['m','mm'],level:['m','mm'],velocity:['m/s'],status:['state']};
  const stateWords={uniform:'One recorded state',mixed:'Mixed states',partial:'Partial support',unavailable:'Unavailable'};
  let token=0,page=0,record=null,signature=null,archiveId=null,plotRequest=0,importRequest=0,previousSource='';
  const eligible=item=>item.status==='ready'&&item.hash&&item.parsed?.metadata?.time_basis!=='timezone-aware/unresolved';
  const available=()=>[
    ...allSeries().filter(({item,col})=>eligible(item)&&seriesUnit(item,col)&&Object.hasOwn(unitChoices,seriesQuantity(item,col))),
    ...[...state.files.values()].filter(eligible).flatMap(item=>(item.parsed?.metadata?.status_columns||[]).map(col=>{
      const rawKey=sourceKey(item.id,col);
      return {key:'recorded-state:'+rawKey,rawKey,item,col,stateSeries:true,label:item.displayName+' · '+col+' · Recorded state'};
    })),
  ];
  const selected=field=>available().find(entry=>entry.key===fields[field].value);
  const quantity=row=>row?.stateSeries?'status':row?seriesQuantity(row.item,row.col):'';
  const support=row=>row?.stateSeries?'left_state':quantity(row)==='rainfall'?rainfallSemanticsFor(row.item,row.col):'instantaneous';
  const contract=row=>row?[row.item.hash,row.col,quantity(row),row.stateSeries?'state':seriesUnit(row.item,row.col),
    row.stateSeries?null:seriesReference(row.item,row.col),support(row)]:null;
  const applicableExclusions=row=>exclusionPayload(true,'source',row.rawKey||row.key);
  const inputs=()=>{
    const a=selected('source'),b=fields.operation.value==='single'?null:selected('reference');
    return JSON.stringify([a&&[contract(a),applicableExclusions(a)],b&&[contract(b),applicableExclusions(b)]]);
  };
  function invalidate(){
    ++token;
    if(record||status.textContent)status.textContent='Inputs changed. Derive a new series for these settings.';
    record=null;signature=null;archiveId=null;output.hidden=true;
    hidePlot();$('hbDerivedKeepStatus').textContent='';
  }
  function options(select,choices,label){
    const saved=select.value;
    select.replaceChildren(new Option(label,''),...choices.map(row=>new Option(row.label,row.key)));
    select.value=choices.some(row=>row.key===saved)?saved:'';
  }
  function refresh(){
    const choices=available();
    options(fields.source,choices,'Choose a source series');
    const a=selected('source'),q=quantity(a),categorical=q==='status';
    if(fields.source.value!==previousSource&&(categorical||previousSource.startsWith('recorded-state:')))fields.confirm.checked=false;
    previousSource=fields.source.value;
    if(categorical)fields.operation.value='single';
    fields.operation.disabled=categorical;
    const pair=fields.operation.value!=='single';
    options(fields.reference,choices.filter(row=>row.key!==a?.key&&q===quantity(row)),'Choose a reference series');
    $('hbTransformReference').hidden=$('hbTransformReferenceShift').hidden=!pair;
    fields.reference.disabled=fields.referenceShift.disabled=!pair;fields.reference.required=pair;
    const checkDatum=pair&&q==='level'&&fields.operation.value==='subtract';
    $('hbTransformDatum').hidden=!checkDatum;fields.datum.disabled=!checkDatum;fields.datum.required=checkDatum;
    fields.output.querySelector('[value="total"]').disabled=q!=='flow'&&q!=='rainfall';
    const distributions=fields.output.querySelector('[value="distribution"]');
    distributions.hidden=distributions.disabled=!categorical;
    fields.output.disabled=fields.unit.disabled=categorical;
    if(categorical)fields.output.value='distribution';
    else if(fields.output.selectedOptions[0]?.disabled)fields.output.value='mean';
    $('hbTransformMissingState').hidden=!categorical;fields.missingToken.disabled=!categorical;
    const units=fields.output.value==='total'?(q==='flow'?['m³','L']:['mm']):(unitChoices[q]||[]);
    const wanted=fields.unit.value;
    fields.unit.replaceChildren(...units.map(unit=>new Option(unit,unit)));
    if(units.includes(wanted))fields.unit.value=wanted;
    $('hbTransformConfirmation').textContent=categorical?'I confirmed that each state label applies until the next recorded timestamp':
      'I reviewed the quantities, source timing, units and reference arithmetic';
    $('hbTransformBasis').textContent=a?(categorical?'State labels remain text. Mixed or partial intervals retain the supported duration of each state. ':
      q==='rainfall'?'Rainfall samples use left-labelled interval support. ':'Hydraulic signals use linear support between adjacent valid samples. ')+
      'Source-specific exclusions move with each source. A derived value requires complete support in each operand. Blank dates use the common source period.':
      'Import a supported series and resolve its quantity, unit and clock in Time series.';
    if(signature){try{if(signature!==inputs())invalidate();}catch{invalidate();}}
  }
  function display(){
    const result=record.result,begin=page*pageSize,end=Math.min(begin+pageSize,result.rows.length),categorical=result.quantity==='status';
    $('hbTransformUnit').textContent=categorical?'Recorded state':'Value ('+result.unit+')';
    $('hbTransformRefSupport').hidden=!record.reference;
    $('hbTransformStateReview').hidden=$('hbTransformStateDuration').hidden=!categorical;
    $('hbTransformSummary').textContent='Rows '+(begin+1)+'–'+end+' of '+result.rows.length+' · '+result.complete_periods+' complete periods.';
    const table=root.querySelector('tbody');table.replaceChildren();
    for(const values of result.rows.slice(begin,end)){
      const row=table.insertRow();
      const cells=categorical?[...values.slice(0,4),stateWords[values[4]],values[5].map(([name,duration])=>
        name+' · '+format(duration)).join(', ')]:values;
      for(const value of cells)row.insertCell().textContent=format(value);
    }
    $('hbTransformPrevious').disabled=begin===0;$('hbTransformNext').disabled=end===result.rows.length;
    $('hbDerivedKeepControls').hidden=Boolean(archiveId);
    if(!plot.hidden)void drawPlot();
  }
  function hidePlot(){
    ++plotRequest;plot.hidden=true;plotButton.setAttribute('aria-pressed','false');plotButton.textContent='Show interval plot';
    plotStatus.textContent='';if(plot.data)globalThis.Plotly?.purge(plot);
  }
  async function drawPlot(){
    if(!ensureCurrent())return;
    const request=++plotRequest,rows=record.result.rows.slice(page*pageSize,(page+1)*pageSize);
    plot.hidden=false;plotButton.setAttribute('aria-pressed','true');plotButton.textContent='Hide interval plot';
    if(!rows.some(row=>row[2]!==null)){
      if(plot.data)globalThis.Plotly?.purge(plot);
      plotStatus.textContent='No supported intervals on this page.';return;
    }
    plotStatus.textContent='Drawing the interval page…';
    const {unit,output:statistic,quantity}=record.result,categorical=quantity==='status';
    try{
      const plotly=await loadVendorScript('Plotly');if(request!==plotRequest)return;
      const supported=rows.filter(row=>row[2]!==null),x=supported.flatMap(([start,end])=>[start,end,null]);
      const labels=categorical?[...new Set(supported.map(row=>row[2]))]:[];
      const y=supported.flatMap(([, ,reading])=>{const value=categorical?labels.indexOf(reading):reading;return [value,value,null];});
      const evidence=supported.flatMap(row=>{
        const label=categorical?[row[0],row[1],esc(row[2])]:row.slice(0,2);
        return [label,label,null];
      });
      await plotly.react(plot,[{x,y,customdata:evidence,mode:'lines',connectgaps:false,name:categorical?'Recorded state':'Interval '+statistic,
        hovertemplate:'%{customdata[0]} to %{customdata[1]}<br>'+(categorical?'%{customdata[2]}':'%{y} '+unit)+'<extra></extra>'}],
      {...(window.HydraDesign?.chartLayout()||{}),height:310,margin:{l:68,r:18,t:26,b:68},
        xaxis:{type:'date',range:[rows[0][0],rows.at(-1)[1]],title:{text:'Project clock'}},yaxis:categorical?
          {title:{text:'Recorded state'},tickmode:'array',tickvals:labels.map((_,i)=>i),ticktext:labels.map(esc),automargin:true}:
          {title:{text:statistic+' ('+unit+')'}}},
      plotConfig('hydra-derived-interval-page'));
      if(request===plotRequest)plotStatus.textContent=categorical?'Plot ready for uniform states. The table records mixed and incomplete intervals.':
        'Plot ready for the displayed interval page. Gaps have incomplete support.';
    }catch(error){if(request===plotRequest)plotStatus.textContent=conciseErrorMessage(error);}
  }
  const details=(row,shift)=>({path:row.item.virtualPath,column:row.col,shift_s:shift,
    rainfall_semantics:quantity(row)==='rainfall'?support(row):null,exclusions:applicableExclusions(row)});
  const provenance=row=>row&&({name:row.label,sha256:row.item.hash,column:row.col,
    source_unit:row.stateSeries?null:seriesMetadata(row.item,row.col).original_unit||seriesUnit(row.item,row.col),exclusions:applicableExclusions(row)});
  form.onsubmit=async event=>{
    event.preventDefault();
    invalidate();const current=++token;
    const a=selected('source'),operation=fields.operation.value,b=operation==='single'?null:selected('reference');
    if(!a||(operation!=='single'&&!b)){status.textContent='Choose all required source series.';return;}
    const datum=fields.datum.disabled?null:fields.datum.value.trim();
    if(datum&&[a,b].some(row=>row&&seriesReference(row.item,row.col)&&seriesReference(row.item,row.col)!==datum)){
      status.textContent='The reviewed datum conflicts with a declared source datum. Resolve the datum before deriving a difference.';return;
    }
    submit.disabled=true;status.textContent='Calculating interval support in the local worker…';
    try{
      const reviewed=inputs(),source=provenance(a),reference=provenance(b);
      const settings={source:details(a,fields.shift.valueAsNumber),reference:b?details(b,fields.referenceShift.valueAsNumber):null,
        interval_s:fields.interval.valueAsNumber,max_gap_s:fields.gap.valueAsNumber,operation,output:fields.output.value,unit:fields.unit.value,
        start:fields.start.value||null,end:fields.end.value||null,datum};
      const operationName=a.stateSeries?'transform_recorded_states':'transform_local_series';
      const params=a.stateSeries?{source:settings.source,interval_s:settings.interval_s,max_gap_s:settings.max_gap_s,
        start:settings.start,end:settings.end,support_confirmed:fields.confirm.checked,missing_token:fields.missingToken.value||null}:settings;
      await ensureEngineBoot();const result=await engine.call(operationName,params);
      if(current!==token||reviewed!==inputs())return;
      const next={schema:'hydra-derived-series-v1',build:buildToken,source,reference,result};
      if(a.stateSeries&&new Blob([JSON.stringify(next)]).size>8*1024*1024)
        throw new Error('The state archive exceeds 8 MiB with its provenance. Choose a shorter period or fewer exclusions.');
      record=next;signature=reviewed;page=0;
      $('hbDerivedName').value='';output.hidden=false;display();status.textContent='Derived series ready. Review unsupported intervals before export.';
    }catch(error){if(current===token)status.textContent=conciseErrorMessage(error);}
    finally{submit.disabled=false;}
  };
  function ensureCurrent(){
    try{if(record&&(archiveId?registry()?.derivedSeries(archiveId)===record:signature===inputs()))return true;}catch{}
    invalidate();return false;
  }
  function refreshSaved(){
    const chosen=saved.value,refs=registry()?.listDerived()||[];
    saved.replaceChildren(new Option('Choose a saved reference or add a JSON record',''),...refs.map(ref=>
      new Option(ref.name+' · '+ref.quantity+' · '+ref.unit+(ref.available?'':' · reattach JSON'),ref.fingerprint)));
    if(refs.some(ref=>ref.fingerprint===chosen))saved.value=chosen;
    $('hbDerivedOpen').disabled=!registry()?.derivedSeries(saved.value);
    $('hbDerivedRemove').disabled=!saved.value;
    if(archiveId&&!registry()?.derivedSeries(archiveId))invalidate();
  }
  function revealSaved(id){
    const stored=registry()?.derivedSeries(id);if(!stored)return;
    invalidate();record=stored;archiveId=id;page=0;output.hidden=false;display();
    status.textContent='Saved interval record. Its archived values have their own recorded source basis.';
  }
  async function readRecord(text){
    await ensureEngineBoot();return engine.call('read_derived_series_record',{text});
  }
  saved.onchange=refreshSaved;
  $('hbDerivedOpen').onclick=()=>revealSaved(saved.value);
  $('hbDerivedRemove').onclick=()=>{registry()?.removeDerived(saved.value);savedStatus.textContent='Derived record removed from the current project.';};
  $('hbDerivedFile').onchange=async event=>{
    const input=event.target,file=input.files[0],request=++importRequest;
    if(!file)return;
    try{
      if(file.size>8*1024*1024)throw new Error('Choose a local derived series JSON up to 8 MiB.');
      const expected=saved.value&&!registry()?.derivedSeries(saved.value)?saved.value:null;
      savedStatus.textContent='Validating the local interval record…';
      const loaded=await readRecord(await file.text()),id=await localFingerprint(loaded);
      if(request!==importRequest)return;
      if(expected&&id!==expected)throw new Error('This file does not match the chosen saved reference. Clear the selection to add it separately.');
      registry().retainDerived(id,file.name.replace(/\.json$/i,'').slice(0,256)||'Derived intervals',loaded);
      saved.value=id;refreshSaved();revealSaved(id);savedStatus.textContent='Derived interval record opened locally.';
    }catch(error){if(request===importRequest)savedStatus.textContent=conciseErrorMessage(error);}
    finally{if(request===importRequest)input.value='';}
  };
  $('hbDerivedKeep').onclick=async()=>{
    if(!ensureCurrent()||archiveId)return;
    const started=token,label=$('hbDerivedName').value.trim(),feedback=$('hbDerivedKeepStatus');
    if(!label){feedback.textContent='Enter a name for the derived series.';$('hbDerivedName').focus();return;}
    const button=$('hbDerivedKeep');button.disabled=true;
    try{
      const validated=await readRecord(JSON.stringify(record)),id=await localFingerprint(validated);
      if(started!==token||!ensureCurrent())return;
      registry().retainDerived(id,label,validated);saved.value=id;refreshSaved();
      feedback.textContent='Kept in this session. Save the JSON to reopen the interval values later.';
    }catch(error){if(started===token)feedback.textContent=conciseErrorMessage(error);}
    finally{button.disabled=false;}
  };
  plotButton.onclick=()=>{if(plot.hidden)void drawPlot();else hidePlot();};
  $('hbTransformCsv').onclick=()=>{
    if(!ensureCurrent())return;
    const {source,reference,result}=record,categorical=result.quantity==='status';
    const rows=[['Build',record.build],['Method',result.method],['Quantity',result.quantity],['Operation',result.operation],['Source',source.name],
      ['Source SHA-256',source.sha256],['Reference',reference?.name||''],['Reference SHA-256',reference?.sha256||''],['Input contracts',JSON.stringify(result.inputs)],
      ['Exclusions',JSON.stringify([source.exclusions,reference?.exclusions])],['Output interval (s)',result.interval_s],['Gap (s)',result.max_gap_s],['Datum',result.datum],
      ['Included start','Excluded end',categorical?'Recorded state':result.output+' ('+result.unit+')','Source support (s)',
        ...(categorical?['State support','Recorded durations (s)']:reference?['Reference support (s)']:[])],
      ...result.rows.map(row=>categorical?[...row.slice(0,5),JSON.stringify(row[5])]:row)];
    downloadBlob('hydra-derived-series-audit.csv',rows.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');
  };
  $('hbTransformJson').onclick=()=>{
    if(ensureCurrent())downloadBlob('hydra-derived-series.json',JSON.stringify(record,null,record.result.quantity==='status'?0:2),'application/json');
  };
  $('hbTransformPrevious').onclick=()=>{--page;display();};$('hbTransformNext').onclick=()=>{++page;display();};
  $('hbTransformClose').onclick=()=>root.close();
  root.addEventListener('close',()=>{++importRequest;hidePlot();$('hbDerivedFile').value='';});
  form.oninput=invalidate;form.onchange=()=>{invalidate();refresh();};
  window.addEventListener('icm:route-changed',({detail})=>{if(detail.workspace!=='data'&&root.open)root.close();});
  window.addEventListener('icm:source-pool-changed',refresh);
  window.addEventListener('icm:rainfall-interpretation-changed',refresh);
  window.addEventListener('icm:derived-series-changed',refreshSaved);
  return ()=>{refresh();refreshSaved();if(!root.open)root.showModal();};
}

let openDialog,openTransformation;
window.HydraSeriesQuality={open(){openDialog??=mount();openDialog();},
  transform(){openTransformation??=mountTransformation();openTransformation();}};
})();
