/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";

const make=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
const textNumber=(value,digits=3)=>Number.isFinite(value)?new Intl.NumberFormat(undefined,{maximumFractionDigits:digits}).format(value):'—';
const covered=(value,total)=>Number.isFinite(value)&&value>=total-Math.max(1e-8,total*1e-12);
const pageSize=25;
const roles={observed:'Observed',model:'Modelled'};
let open;

function mount(){
  const dialog=make('dialog');dialog.id='hbSpillInquiry';dialog.setAttribute('aria-labelledby','hbSpillInquiryTitle');
  dialog.innerHTML=`<article class="panel"><div class="panel-head"><div><h2 id="hbSpillInquiryTitle">Investigate physical discharges</h2>
    <p>Rank the identified discharge intervals and review their supporting evidence. The 12/24 regulatory count is shown separately.</p></div>
    <button type="button" class="btn" id="hbSpillInquiryClose">Close investigation</button></div>
    <form id="hbSpillInquiryForm"><div class="mapping-grid">
      <label>Latest spill assessment<select name="basis" required></select></label>
      <label>Spill flow source (optional)<select name="flow"></select></label>
      <label>Representative rainfall gauge (optional)<select name="rain"></select></label></div>
      <p><label class="hb-transform-confirm"><input name="matches" type="checkbox" disabled>
        The supporting records share the project clock. A selected flow channel measures discharge at this overflow.</label></p>
      <div class="actions"><button class="btn primary" type="submit">Review discharge intervals</button></div>
    </form><p id="hbSpillInquiryStatus" role="status"></p>
    <section id="hbSpillInquiryResults" hidden>
      <p id="hbSpillInquiryBasis"></p><div class="mapping-grid">
        <label>Sort by<select id="hbSpillInquirySort"><option value="start">Earliest first</option><option value="duration_s">Longest first</option><option value="volume_m3">Largest volume first</option><option value="rain_mm">Highest rainfall first</option></select></label>
        <label>Minimum duration (min)<input id="hbSpillInquiryMin" type="number" step="any" min="0" value="0"></label></div>
      <div class="actions"><button type="button" class="btn" id="hbSpillInquiryPrevious">Previous page</button><button type="button" class="btn" id="hbSpillInquiryNext">Next page</button>
        <button type="button" class="btn" id="hbSpillInquiryExport">Download discharge register CSV</button></div>
      <p id="hbSpillInquiryCount"></p><div class="table-wrap"><table class="data-table"><caption>Physical discharge intervals and locally linked evidence</caption><thead><tr>
        <th scope="col">Interval</th><th scope="col">Support / duration (min)</th><th scope="col">Since previous interval (min)</th><th scope="col">Discharge volume (m³)</th><th scope="col">Rainfall (mm)</th><th scope="col">Evidence</th>
      </tr></thead><tbody></tbody></table></div>
    </section></article>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id),form=$('hbSpillInquiryForm'),fields=form.elements;
  const status=$('hbSpillInquiryStatus'),results=$('hbSpillInquiryResults'),sort=$('hbSpillInquirySort'),minimum=$('hbSpillInquiryMin');
  const submit=form.querySelector('[type="submit"]');
  let record=null,index=0,serial=0;
  function snapshot(){
    const current=state.spillSnapshot;
    try{return current?.evidenceSources&&current.signature===analysisSignature()?current:null;}
    catch{return null;}
  }
  function ready(){return allSeries().filter(({item,col})=>item.status==='ready'&&item.hash&&seriesUnit(item,col)&&
    item.parsed?.metadata?.time_basis!=='timezone-aware/unresolved');}
  const source=(list,key)=>list.find(row=>row.key===key)||null;
  function clear(message){record=null;++serial;results.hidden=true;status.textContent=message;}
  function loadOptions(control,rows,text){
    const old=control.value;
    control.replaceChildren(new Option(text,''),...rows.map(({label,key})=>new Option(label,key)));
    if(rows.some(row=>row.key===old))control.value=old;
  }
  function checkMatches(){
    const extras=Boolean(fields.flow.value||fields.rain.value);
    fields.matches.disabled=!extras;fields.matches.required=extras;
    if(!extras)fields.matches.checked=false;
  }
  function refresh(){
    const current=snapshot(),list=ready();
    const choices=Object.entries(current?.results||{}).flatMap(([role,result])=>{
      const channel=source(list,current.evidenceSources[role]);
      return channel&&Array.isArray(result.events)?[{key:role,label:roles[role]+' · '+channel.label}]:[];
    });
    loadOptions(fields.basis,choices,'Choose a calculated assessment');
    if(choices.length===1)fields.basis.value=choices[0].key;
    loadOptions(fields.flow,list.filter(row=>seriesQuantity(row.item,row.col)==='flow'),'No flow evidence');
    loadOptions(fields.rain,list.filter(row=>seriesQuantity(row.item,row.col)==='rainfall'&&
      rainfallSemanticsFor(row.item,row.col)!=='unresolved'),'No rainfall evidence');
    checkMatches();
    submit.disabled=!choices.length;
    if(!choices.length)clear('Calculate current spill evidence before opening the investigation register.');
    else if(record&&!fresh())clear('The assessment or supporting source changed. Refresh the register.');
    else if(!record)status.textContent='Choose a reviewed assessment. Supporting records are optional.';
  }
  function supportSpec(row){
    return row&&{path:row.item.virtualPath,column:row.col,exclusions:exclusionPayload(true,'source',row.key),
      semantics:seriesQuantity(row.item,row.col)==='rainfall'?rainfallSemanticsFor(row.item,row.col):null};
  }
  function sourceStamp(row){return row&&[row.item.hash,row.col,seriesQuantity(row.item,row.col),seriesUnit(row.item,row.col),supportSpec(row)];}
  const auxiliarySignature=(flow,rain)=>JSON.stringify([sourceStamp(flow),sourceStamp(rain)]);
  function fresh(){
    if(!record||snapshot()!==record.snapshot)return false;
    const available=ready();
    try{return record.support===auxiliarySignature(source(available,fields.flow.value),source(available,fields.rain.value));}
    catch{return false;}
  }
  function filtered(){
    if(!record)return [];
    const cutoff=minimum.valueAsNumber,metric=sort.value;
    const rows=record.rows.filter(row=>row.duration_s>=(Number.isFinite(cutoff)?Math.max(0,cutoff)*60:0));
    if(metric!=='start')rows.sort((a,b)=>(b[metric]??-Infinity)-(a[metric]??-Infinity)||a.number-b.number);
    return rows;
  }
  function evidenceCell(value,support,duration){
    if(support===null)return 'Unlinked';
    if(value!==null)return textNumber(value);
    return 'Withheld · '+textNumber(support/60)+' / '+textNumber(duration/60)+' min';
  }
  function render(){
    const rows=filtered(),start=index*pageSize,end=Math.min(start+pageSize,rows.length);
    $('hbSpillInquiryCount').textContent=rows.length?'Showing '+(start+1)+'–'+end+' of '+rows.length+' matching intervals.':'No matching physical discharge intervals.';
    $('hbSpillInquiryPrevious').disabled=!index;$('hbSpillInquiryNext').disabled=end===rows.length;
    const body=dialog.querySelector('tbody');body.replaceChildren();
    for(const entry of rows.slice(start,end)){
      const row=body.insertRow();
      const previous=entry.previous_gap_s===null?'First detected interval':textNumber(entry.previous_gap_s/60)+
        (covered(entry.previous_gap_support_s,entry.previous_gap_s)?'':' · interrupted evidence');
      for(const value of [entry.start+' → '+entry.end,textNumber(entry.source_support_s/60)+' / '+textNumber(entry.duration_s/60),previous,
        evidenceCell(entry.volume_m3,entry.flow_support_s,entry.duration_s),evidenceCell(entry.rain_mm,entry.rain_support_s,entry.duration_s)])row.insertCell().textContent=value;
      const button=make('button','Plot interval');button.type='button';button.className='btn';
      button.setAttribute('aria-label','Plot discharge '+entry.number+' in Time series');
      button.onclick=async()=>{
        if(!fresh()){clear('The assessment changed. Refresh the register.');return;}
        dialog.close();
        window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',true);
        window.ICMGraph?.setChannel('depth',false);
        try{await window.ICMGraph?.draw([entry.start,entry.end]);}
        catch(error){document.getElementById('mappingStatus').textContent=conciseErrorMessage(error);}
      };
      row.insertCell().append(button);
    }
  }
  form.onsubmit=async event=>{
    event.preventDefault();
    const current=snapshot(),role=fields.basis.value,result=current?.results?.[role],rows=ready();
    const basis=source(rows,current?.evidenceSources?.[role]),flow=source(rows,fields.flow.value),rain=source(rows,fields.rain.value);
    if(!basis||!result){refresh();return;}
    clear('Reviewing time support in the local worker…');const generation=serial;
    submit.disabled=true;
    try{
      const applied=current.config.applied_exclusions?.[role]||[],support=auxiliarySignature(flow,rain);
      const gap=current.config.analysis.max_gap_seconds;
      await ensureEngineBoot();
      const report=await engine.call('review_spill_events',{path:basis.item.virtualPath,column:basis.col,events:result.events,
        max_gap_s:gap,exclusions_json:applied,flow:supportSpec(flow),rainfall:supportSpec(rain)});
      if(generation!==serial)return;
      record={snapshot:current,support,method:report.method,rows:report.rows,flow,rain,basis,gap,result,role,applied};
      if(!fresh()){clear('The assessment or source changed. Refresh the register.');return;}
      index=0;results.hidden=false;
      $('hbSpillInquiryBasis').textContent=basis.label+' · '+(result.analysis_start||'')+' → '+(result.analysis_end||'')+
        ' · '+report.rows.length+' physical intervals · 12/24 assessment count '+textNumber(result.total_spill_count,0)+
        ' ('+(result.count_status||result.status)+'). Intervals separated by unobserved time may be part of the same discharge.';
      status.textContent='Discharge evidence is ready. Review each record’s support before interpreting volume or rainfall.';render();
    }catch(error){if(generation===serial)clear(conciseErrorMessage(error));}
    finally{submit.disabled=false;}
  };
  form.onchange=()=>{checkMatches();if(record||submit.disabled)clear('Settings changed. Review the current interval evidence.');};
  sort.onchange=minimum.oninput=()=>{index=0;render();};
  $('hbSpillInquiryPrevious').onclick=()=>{--index;render();};$('hbSpillInquiryNext').onclick=()=>{++index;render();};
  $('hbSpillInquiryClose').onclick=()=>dialog.close();
  $('hbSpillInquiryExport').onclick=()=>{
    if(!fresh()){clear('The assessment or source changed. Refresh the register.');return;}
    const {method,basis,flow,rain,result,gap,role,applied}=record;
    const sources=[['Threshold source',basis],['Discharge flow',flow],['Rainfall gauge',rain]].map(([label,row])=>[label,row?.label||'',row?.item.hash||'']);
    const controls=record.snapshot.config.analysis;
    const cells=[['Build',buildToken],['Method',method],...sources,['Gap (s)',gap],['12/24 count',result.total_spill_count],['Count status',result.count_status],
      ['Threshold',controls[(role==='observed'?'observed':'model')+'_threshold'],seriesUnit(basis.item,basis.col)],
      ['Exclusion basis',JSON.stringify([applied,supportSpec(flow)?.exclusions,supportSpec(rain)?.exclusions])],
      ['Sequence','Project clock start','Project clock end','Duration (s)','Threshold support (s)','Previous interval gap (s)','Previous gap measured (s)','Volume (m³)','Flow support (s)','Rainfall (mm)','Rainfall support (s)'],
      ...filtered().map(x=>[x.number,x.start,x.end,x.duration_s,x.source_support_s,x.previous_gap_s,x.previous_gap_support_s,x.volume_m3,x.flow_support_s,x.rain_mm,x.rain_support_s])];
    downloadBlob('hydra-physical-discharge-register.csv',cells.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');
  };
  window.addEventListener('icm:source-pool-changed',()=>{if(dialog.open)refresh();});
  window.addEventListener('icm:route-changed',({detail})=>{if(detail.workspace!=='spills'&&dialog.open)dialog.close();});
  return ()=>{refresh();if(!dialog.open)dialog.showModal();};
}

window.HydraSpillInquiry={open(){open??=mount();open();}};
})();
