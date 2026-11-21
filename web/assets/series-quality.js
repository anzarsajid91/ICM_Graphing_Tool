/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";

const pageSize=30;
const labels=new Map([
  ["unlocated-timestamps","Invalid timestamp"],["duplicate-timestamp","Duplicate timestamp"],
  ["missing-values","Missing values"],["long-timestep","Long timestep"],["short-timestep","Short timestep"],
  ["flatline","Potential flatline"],["isolated-spike","Potential spike"],["abrupt-change","Abrupt change"],
  ["above-screening-bound","Above screening bound"],["below-screening-bound","Below screening bound"]
]);
const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const format=value=>value===null||value===undefined?"Unavailable":typeof value==="number"?new Intl.NumberFormat(undefined,{maximumSignificantDigits:8}).format(value):value;

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
  const decisions=new Map();

  const available=()=>allSeries().filter(({item})=>item.status==="ready"&&item.hash&&
    item.parsed?.metadata?.timestamp_convention==="instantaneous"&&item.parsed?.metadata?.time_basis!=="timezone-aware/unresolved");
  const identify=(key)=>available().find(row=>row.key===key);
  function sourceSignature(row){
    if(!row)return null;
    const {item,col}=row,metadata=seriesMetadata(item,col);
    return [item.id,item.hash,col,seriesQuantity(item,col),seriesUnit(item,col),metadata.original_unit,metadata.conversion_factor];
  }
  function currentSignature(){return JSON.stringify([sourceSignature(identify(picker.value)),sourceSignature(identify(ref.value))]);}
  function invalidate(){
    ++generation;
    if(candidates||status.textContent) status.textContent="Inputs changed. Review the current source to refresh the findings.";
    view.hidden=true;candidates=null;workflow=null;signature=null;decisions.clear();
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
      await ensureEngineBoot();
      const result=await engine.call("inspect_local_series",{
        path:source.item.virtualPath,column:source.col,criteria,start:controls.start.value||null,end:controls.end.value||null,
        reference_path:reference?.item.virtualPath||null,reference_column:reference?.col||null,search_steps:controls.lag.valueAsNumber
      });
      if(current!==generation||inputSignature!==currentSignature())return;
      candidates=result;workflow={source,reference};signature=inputSignature;selectedPage=0;filter.replaceChildren(new Option("All findings",""));
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
  function allFindings(){return candidates.findings.map((value,index)=>({value,index})).filter(row=>!filter.value||row.value.kind===filter.value);}
  function renderFindings(){
    const rows=allFindings(),slice=rows.slice(selectedPage*pageSize,(selectedPage+1)*pageSize);
    table.replaceChildren();
    for(const {value,index} of slice){
      const row=table.insertRow(),label=labels.get(value.kind);
      for(const text of [label,value.start||"Unlocated",value.end||"Unlocated",format(value.observed)+" · "+value.basis])
        row.insertCell().textContent=text;
      const cell=row.insertCell(),choice=node("select"),note=node("input"),review=decisions.get(index)||{decision:"",note:"",excluded:false};
      choice.setAttribute("aria-label",label+" review decision");
      note.setAttribute("aria-label",label+" review note");note.maxLength=500;note.placeholder="Review note";
      for(const [key,text] of [["","Unreviewed"],["accepted","Accept finding"],["rejected","Reject finding"]])choice.add(new Option(text,key));
      choice.value=review.decision;note.value=review.note;
      choice.onchange=()=>{review.decision=choice.value;decisions.set(index,review);};
      note.oninput=()=>{review.note=note.value.trim();decisions.set(index,review);};
      cell.append(choice,note);
      if(value.start&&value.end&&value.start<value.end){
        const exclude=node("button",review.excluded?"Exclusion recorded":"Add review exclusion");exclude.type="button";exclude.disabled=review.excluded;
        exclude.onclick=()=>{
          if(currentSignature()!==signature){invalidate();return;}
          if(!review.note){status.textContent="Enter a reason in the review note before adding the exclusion.";note.focus();return;}
          addExclusionRow({start:value.start,end:value.end,reason:review.note,scope:workflow.source.key});
          review.excluded=true;decisions.set(index,review);exclude.disabled=true;exclude.textContent="Exclusion recorded";
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
      ...candidates.findings.map((r,i)=>[labels.get(r.kind),r.start,r.end,r.observed,r.basis,decisions.get(i)?.decision,decisions.get(i)?.note,Boolean(decisions.get(i)?.excluded)])];
    downloadBlob("hydra-source-quality-review.csv",rows.map(row=>row.map(ICMSafeCSV.cell).join(",")).join("\r\n"),"text/csv");
  };
  window.addEventListener("icm:route-changed",({detail})=>{if(detail.workspace!=="data"&&root.open)root.close();});
  window.addEventListener("icm:source-pool-changed",refreshSources);
  return ()=>{refreshSources();if(!root.open)root.showModal();};
}

window.HydraSeriesQuality={install(){
  const button=node("button","Source diagnostics");button.type="button";button.className="btn";button.setAttribute("aria-haspopup","dialog");
  const tools=document.getElementById("clearPoolBtn");tools.after(button);
  let open;
  button.onclick=()=>{open??=mount();open();};
}};
})();
