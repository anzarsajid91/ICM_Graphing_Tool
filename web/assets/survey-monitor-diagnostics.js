/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";

const labels={'depth-range':'Depth outside reviewed range','velocity-range':'Velocity outside reviewed range','velocity-change':'Abrupt velocity change',
  crown:'Depth reaches reviewed crown','rising-low-velocity':'Rising depth with low or reverse velocity','flat-depth':'Flat depth with changing velocity',
  'flow-consistency':'Discharge differs from area × mean velocity'};
const node=(tag,text)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;return result;};
const number=value=>Number.isFinite(value)?new Intl.NumberFormat(undefined,{maximumSignificantDigits:7}).format(value):'Unavailable';
const pageSize=24;
let open;

function mount(openClock){
  const dialog=node('dialog');dialog.id='hbMonitorDiagnostics';dialog.setAttribute('aria-labelledby','hbMonitorDiagnosticsTitle');
  dialog.innerHTML=`<article class="panel"><div class="panel-head"><div><h2 id="hbMonitorDiagnosticsTitle">Investigate monitor readings</h2>
    <p>Review concurrent depth, velocity and optional flow from one logger record. Candidate patterns support investigation and engineer review.</p></div>
    <button type="button" class="btn" id="hbMonitorDiagnosticsClose">Close investigation</button></div>
    <form><div class="mapping-grid"><label>Local monitor source<select name="source" required></select></label>
    <label>Depth channel<select name="depth" required></select></label><label>Velocity channel<select name="velocity" required></select></label>
    <label>Discharge channel (optional)<select name="flow"></select></label>
    <label>Maximum valid gap (s)<input name="max_gap_s" type="number" min="0.001" step="any" value="900" required></label>
    <label>Start (optional)<input name="start" type="datetime-local" step="1"></label><label>End (optional)<input name="end" type="datetime-local" step="1"></label></div>
    <details open><summary>Geometry and measurement ranges</summary><div class="mapping-grid">
    <label>Circular pipe diameter (m)<input name="diameter_m" type="number" min="0.001" max="20" step="any"></label>
    <label><input name="geometry_confirmed" type="checkbox"> Confirm surveyed circular diameter and depth above invert</label>
    <label>Minimum depth (m)<input name="depth_min_m" type="number" min="0" step="any" value="0"></label>
    <label>Maximum reviewed depth (m)<input name="depth_max_m" type="number" min="0" step="any"></label>
    <label>Minimum signed velocity (m/s)<input name="velocity_min_m_s" type="number" step="any"></label>
    <label>Maximum signed velocity (m/s)<input name="velocity_max_m_s" type="number" step="any"></label></div></details>
    <details><summary>Depth and velocity patterns</summary><div class="mapping-grid">
    <label>Maximum adjacent velocity change (m/s)<input name="velocity_step_m_s" type="number" min="0" step="any"></label>
    <label>Flat depth amplitude (m)<input name="flat_depth_amplitude_m" type="number" min="0" step="any"></label>
    <label>Minimum flat period (s)<input name="flat_duration_s" type="number" min="0.001" step="any"></label>
    <label>Minimum velocity range during flat depth (m/s)<input name="flat_velocity_swing_m_s" type="number" min="0.001" step="any"></label>
    <label>Minimum adjacent depth rise (m)<input name="rise_depth_m" type="number" min="0.000001" step="any"></label>
    <label>Velocity ceiling during rising depth (m/s)<input name="rise_velocity_ceiling_m_s" type="number" min="0" step="any"></label>
    <label><input name="downstream_positive" type="checkbox"> Confirm downstream velocity is positive</label></div></details>
    <details><summary>Discharge consistency</summary><div class="mapping-grid">
    <label>Allowed relative flow difference (%)<input name="flow_relative_tolerance_percent" type="number" min="0" step="any"></label>
    <label>Absolute flow denominator floor (m³/s)<input name="flow_floor_m3_s" type="number" min="0.000000001" step="any"></label>
    <label><input name="flow_basis_confirmed" type="checkbox"> Confirm section-mean velocity and common discharge sign convention</label></div></details>
    <div class="actions"><button type="button" class="btn" id="hbMonitorClock">Review source timing</button>
      <button type="submit" class="btn primary">Review monitor evidence</button></div></form>
    <p id="hbMonitorDiagnosticStatus" role="status"></p><section id="hbMonitorDiagnosticReport" hidden><p id="hbMonitorDiagnosticCoverage"></p>
    <div class="actions"><label>Filter findings<select id="hbMonitorDiagnosticFilter"></select></label>
    <button type="button" class="btn" id="hbMonitorDiagnosticPrev">Previous page</button><button type="button" class="btn" id="hbMonitorDiagnosticNext">Next page</button>
    <button type="button" class="btn" id="hbMonitorDiagnosticExport">Download monitor review CSV</button></div>
    <div class="table-wrap"><table class="data-table"><caption>Monitor findings and review</caption><thead><tr><th scope="col">Finding</th><th scope="col">Project-clock period</th>
    <th scope="col">Observed basis</th><th scope="col">Engineer review</th></tr></thead><tbody></tbody></table></div></section></article>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id),form=dialog.querySelector('form'),fields=form.elements;
  const status=$('hbMonitorDiagnosticStatus'),report=$('hbMonitorDiagnosticReport'),filter=$('hbMonitorDiagnosticFilter');
  const submit=form.querySelector('[type="submit"]'),body=dialog.querySelector('tbody');
  const numeric=[...form.querySelectorAll('input[type=number]')],checks=[...form.querySelectorAll('input[type=checkbox]')];
  let review=null,generation=0,page=0;
  const choices=new Map(),decisions=new Map();

  function clear(message){++generation;review=null;decisions.clear();report.hidden=true;if(message)status.textContent=message;}
  function options(select,items,prompt){
    const was=select.value;select.replaceChildren(new Option(prompt,''),...items.map(row=>new Option(row.label,row.value)));
    if(items.some(row=>row.value===was))select.value=was;else if(select.required&&items.length===1)select.value=items[0].value;
  }
  const contract={depth:'m',velocity:'m/s',flow:'m³/s'};
  function refresh(){
    choices.clear();
    for(const row of allSeries()){
      const item=row.item,quantity=seriesQuantity(item,row.col);
      if(item.status!=='ready'||!item.hash||item.parsed?.metadata?.timestamp_convention!=='instantaneous'||
        item.parsed?.metadata?.time_basis==='timezone-aware/unresolved'||contract[quantity]!==seriesUnit(item,row.col))continue;
      if(!choices.has(item.id))choices.set(item.id,{item,channels:{depth:[],velocity:[],flow:[]}});
      choices.get(item.id).channels[quantity].push({value:row.col,label:row.col,key:row.key});
    }
    for(const [id,{channels}] of choices)if(!channels.depth.length||!channels.velocity.length)choices.delete(id);
    options(fields.source,[...choices.values()].map(({item})=>({label:item.parsed.metadata.monitor||item.displayName,value:item.id})),'Choose a concurrent depth and velocity source');
    channels();
    if(!choices.size)clear('Import a paired monitor record with resolved depth and velocity before review.');
    else if(!review)status.textContent='Choose a monitor record and review the applicable screening settings.';
  }
  function channels(){
    const row=choices.get(fields.source.value);
    for(const key of ['depth','velocity','flow'])options(fields[key],row?.channels[key]||[],key==='flow'?'No discharge comparison':'Choose '+key+' channel');
    submit.disabled=!row;
  }
  function inputs(){
    const {item,channels}=choices.get(fields.source.value)||{};
    if(!item)throw new Error('Select an available monitor record.');
    const source={name:item.displayName,sha256:item.hash};
    const settings=Object.fromEntries([...numeric.map(input=>[input.name,input.value===''?null:input.valueAsNumber]),...checks.map(input=>[input.name,input.checked])]);
    const chosen=['depth','velocity','flow'].flatMap(kind=>channels[kind].filter(row=>row.value===fields[kind].value));
    const exclusions=chosen.flatMap(row=>exclusionPayload(true,'source',row.key));
    const unique=[...new Map(exclusions.map(entry=>[entry.id,entry])).values()];
    return {source,config:{path:item.virtualPath,depth_column:fields.depth.value,velocity_column:fields.velocity.value,flow_column:fields.flow.value||null,
      start:fields.start.value||null,end:fields.end.value||null,settings,exclusions_json:unique}};
  }
  form.onsubmit=async event=>{
    event.preventDefault();clear('Checking paired samples in the local worker…');const requested=generation;
    submit.disabled=true;
    try{
      const data=inputs(),signature=JSON.stringify(data);await ensureEngineBoot();
      const result=await engine.call('review_monitor_channels',data.config);
      if(requested!==generation||signature!==JSON.stringify(inputs()))return;
      review={data,result,signature};page=0;filter.replaceChildren(new Option('All findings',''));
      for(const key of Object.keys(result.counts))filter.add(new Option(labels[key],key));
      report.hidden=false;
      $('hbMonitorDiagnosticCoverage').textContent=`${result.paired_samples} of ${result.rows} paired samples · ${result.excluded_samples} excluded · ${result.flow_checked_samples} discharge checks · ${result.candidate_count} candidate findings.`+
        (result.candidate_count>result.display_limit?' Choose a shorter period to review findings beyond the display limit.':'');
      status.textContent='Monitor review ready. Record the evidence for each engineering decision.';render();
    }catch(error){if(requested===generation)status.textContent=conciseErrorMessage(error);}
    finally{submit.disabled=!fields.source.value;}
  };
  function render(){
    if(!review)return;
    const rows=review.result.findings.map((value,index)=>({value,index})).filter(row=>!filter.value||row.value.kind===filter.value);
    body.replaceChildren();
    for(const {value,index} of rows.slice(page*pageSize,(page+1)*pageSize)){
      const tr=body.insertRow();for(const text of [labels[value.kind],value.start+' → '+value.end,number(value.observed)+' · '+value.basis])tr.insertCell().textContent=text;
      const cell=tr.insertCell(),choice=node('select'),comment=node('input'),record=decisions.get(index)||{choice:'',comment:''};
      choice.add(new Option('Unreviewed',''));choice.add(new Option('Accept for investigation','accepted'));choice.add(new Option('Dismiss candidate','dismissed'));
      choice.value=record.choice;comment.value=record.comment;comment.maxLength=500;comment.placeholder='Engineering note';
      choice.setAttribute('aria-label',labels[value.kind]+' decision');comment.setAttribute('aria-label',labels[value.kind]+' note');
      choice.onchange=()=>{record.choice=choice.value;decisions.set(index,record);};
      comment.oninput=()=>{record.comment=comment.value.trim();decisions.set(index,record);};cell.append(choice,comment);
    }
    $('hbMonitorDiagnosticPrev').disabled=!page;$('hbMonitorDiagnosticNext').disabled=(page+1)*pageSize>=rows.length;
  }
  form.oninput=()=>{if(review||submit.disabled)clear('Inputs changed. Review the current monitor settings.');};
  fields.source.onchange=()=>{clear();channels();};
  filter.onchange=()=>{page=0;render();};$('hbMonitorDiagnosticPrev').onclick=()=>{--page;render();};$('hbMonitorDiagnosticNext').onclick=()=>{++page;render();};
  $('hbMonitorDiagnosticsClose').onclick=()=>dialog.close();$('hbMonitorClock').onclick=()=>{dialog.close();void openClock();};
  $('hbMonitorDiagnosticExport').onclick=()=>{
    let fresh=false;try{fresh=review&&review.signature===JSON.stringify(inputs());}catch{}
    if(!fresh){clear('Sources or exclusions changed. Refresh the review.');return;}
    const {source,config}=review.data;
    const rows=[['Build',buildToken],['Method',review.result.method],['Source',source.name],['SHA-256',source.sha256],['Exclusions',JSON.stringify(config.exclusions_json)],
      ['Depth',config.depth_column],['Velocity',config.velocity_column],['Flow',config.flow_column],['Start',config.start],['End',config.end],...Object.entries(config.settings),
      ['Finding','Start','End','Observed','Basis','Decision','Engineering note'],...review.result.findings.map((row,index)=>
        [labels[row.kind],row.start,row.end,row.observed,row.basis,decisions.get(index)?.choice,decisions.get(index)?.comment])];
    downloadBlob('hydra-monitor-diagnostics.csv',rows.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');
  };
  window.addEventListener('icm:source-pool-changed',()=>{clear();if(dialog.open)refresh();});
  window.addEventListener('icm:route-changed',({detail})=>{if(detail.page!=='fdv-check'&&dialog.open)dialog.close();});
  return ()=>{refresh();if(!dialog.open)dialog.showModal();};
}

window.HydraMonitorDiagnostics={open(openClock){open??=mount(openClock);open();}};
})();
