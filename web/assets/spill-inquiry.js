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

function mountComparison(){
  const dialog=make('dialog');dialog.id='hbSpillScenarios';dialog.setAttribute('aria-labelledby','hbSpillScenariosTitle');
  dialog.innerHTML=`<article class="panel"><div class="panel-head"><div><h2 id="hbSpillScenariosTitle">Compare spill scenarios</h2>
    <p>Compare reviewed model records by asset and reporting year against the same baseline and explicit period.</p></div>
    <button type="button" class="btn" id="hbSpillScenariosClose">Close comparison</button></div>
    <form><div class="mapping-grid"><label>Common baseline name<input name="baseline" maxlength="128" required></label>
      <label>Start on project clock<input name="start" type="datetime-local" step="1" required></label>
      <label>End on project clock<input name="end" type="datetime-local" step="1" required></label>
      <label>Maximum valid gap (s)<input name="gap" type="number" min="0.001" step="any" value="900" required></label></div>
    <div id="hbSpillScenarioAssets"></div><button type="button" class="btn" id="hbSpillScenarioAdd">Add asset</button>
    <p><label class="hb-transform-confirm"><input type="checkbox" required name="reviewed"> I reviewed the asset associations, model clocks and vertical references</label></p>
    <div class="actions"><button type="submit" class="btn primary">Compare against baseline</button></div></form>
    <p id="hbSpillScenarioStatus" role="status"></p>
    <section id="hbSpillScenarioReport" hidden><div class="mapping-grid"><label>Filter asset<select id="hbSpillScenarioAssetFilter"></select></label>
      <label>Filter year<select id="hbSpillScenarioYearFilter"></select></label></div><div class="actions">
      <button type="button" class="btn" id="hbSpillScenarioPrev">Previous page</button><button type="button" class="btn" id="hbSpillScenarioNext">Next page</button>
      <button type="button" class="btn" id="hbSpillScenarioExport">Download comparison CSV</button></div><p id="hbSpillScenarioCount"></p>
      <div class="table-wrap"><table class="data-table"><caption>Baseline → proposed changes by asset and reporting year</caption><thead><tr>
        <th scope="col">Asset / year</th><th scope="col">Scenarios</th><th scope="col">12/24 count</th><th scope="col">Duration (h)</th>
        <th scope="col">Volume (m³)</th><th scope="col">Evidence basis</th></tr></thead><tbody></tbody></table></div></section></article>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id),form=dialog.querySelector('form'),fields=form.elements;
  const status=$('hbSpillScenarioStatus'),report=$('hbSpillScenarioReport'),submit=form.querySelector('[type="submit"]');
  const assetFilter=$('hbSpillScenarioAssetFilter'),yearFilter=$('hbSpillScenarioYearFilter'),body=dialog.querySelector('tbody');
  const groups=[];
  let serial=0,request=0,current=null,page=0;

  const available=()=>allSeries().filter(({item,col})=>item.status==='ready'&&item.hash&&seriesUnit(item,col)&&
    item.parsed?.metadata?.time_basis!=='timezone-aware/unresolved');
  const quantity=row=>seriesQuantity(row.item,row.col);
  function reset(message){++request;current=null;report.hidden=true;if(message)status.textContent=message;}
  function control(panel,label,type,attributes={}){
    const outer=make('label',label),input=make(type==='select'?'select':'input');
    if(type!=='select')input.type=type;
    input.setAttribute('aria-label',label);Object.assign(input,attributes);outer.append(input);panel.append(outer);return input;
  }
  function choose(select,options,caption){
    const old=select.value;
    select.replaceChildren(new Option(caption,''),...options.map(row=>new Option(row.label,row.key)));
    if(options.some(row=>row.key===old))select.value=old;
  }
  function refresh(){
    const rows=available(),thresholds=rows.filter(row=>['depth','level'].includes(quantity(row))&&seriesUnit(row.item,row.col)==='m');
    const flows=rows.filter(row=>quantity(row)==='flow'&&seriesUnit(row.item,row.col)==='m³/s');
    for(const group of groups){
      for(const item of [group.base,...group.cases]){
        choose(item.signal,thresholds,'Choose depth or level');choose(item.flow,flows,'No flow volume evidence');
        item.confirm.disabled=!item.flow.value;item.confirm.required=Boolean(item.flow.value);
        if(!item.flow.value)item.confirm.checked=false;
      }
      const level=[group.base,...group.cases].some(item=>thresholds.some(row=>row.key===item.signal.value&&quantity(row)==='level'));
      group.datum.required=level;group.datum.disabled=!level;group.datum.closest('label').hidden=!level;
      group.remove.disabled=groups.length===1;
      group.add.disabled=group.cases.length>=8;
      for(const item of group.cases)item.remove.disabled=group.cases.length===1;
    }
    $('hbSpillScenarioAdd').disabled=groups.length>=8;
  }
  function fieldsFor(container,prefix,proposed){
    const area=make('fieldset'),legend=make('legend',prefix),grid=make('div');grid.className='mapping-grid';
    area.append(legend,grid);container.append(area);
    const item={area,signal:control(grid,prefix+' threshold channel','select',{required:true}),flow:control(grid,prefix+' discharge flow','select')};
    if(proposed)item.label=control(grid,prefix+' name','text',{required:true,maxLength:128});
    item.confirm=control(grid,prefix+' flow belongs to this overflow and scenario','checkbox');
    for(const input of [item.signal,item.flow])input.onchange=()=>{item.confirm.checked=false;refresh();};
    return item;
  }
  function addAsset(focus){
    const order=++serial,set=make('fieldset'),label='Asset '+order,grid=make('div');grid.className='mapping-grid';
    set.append(make('legend',label),grid);$('hbSpillScenarioAssets').append(set);
    const group={id:control(grid,label+' ID','text',{maxLength:128,required:true}),
      threshold:control(grid,label+' threshold (m)','number',{step:'any',required:true}),
      datum:control(grid,label+' vertical datum','text',{maxLength:128}),cases:[]};
    group.base=fieldsFor(set,label+' baseline',false);
    const cases=make('div');set.append(cases);
    const actions=make('div');actions.className='actions';set.append(actions);
    let sequence=0;
    function addCase(focusRow){
      const item=fieldsFor(cases,label+' proposed '+(++sequence),true);
      item.remove=make('button','Remove proposed scenario');item.remove.type='button';item.remove.className='btn';
      item.remove.onclick=()=>{group.cases.splice(group.cases.indexOf(item),1);item.area.remove();reset();refresh();group.add.focus();};
      item.area.append(item.remove);group.cases.push(item);reset();refresh();if(focusRow)item.label.focus();
    }
    group.add=make('button','Add proposed scenario');group.add.type='button';group.add.className='btn';group.add.onclick=()=>addCase(true);
    group.remove=make('button','Remove asset');group.remove.type='button';group.remove.className='btn';
    group.remove.onclick=()=>{groups.splice(groups.indexOf(group),1);set.remove();reset();refresh();$('hbSpillScenarioAdd').focus();};
    actions.append(group.add,group.remove);groups.push(group);addCase(false);if(focus)group.id.focus();
  }
  function read(){
    const rows=new Map(available().map(row=>[row.key,row])),references=[];
    const source=(key,asset,label,role)=>{
      if(!key)return null;
      const row=rows.get(key);if(!row)throw new Error('A selected source is unavailable. Review the assignments.');
      const exclusions=exclusionPayload(true,'model',key);
      references.push([asset,label,role,row.label,row.item.hash,row.col,quantity(row),seriesUnit(row.item,row.col),JSON.stringify(exclusions)]);
      return {path:row.item.virtualPath,column:row.col,exclusions};
    };
    function scenario(item,asset,label){
      return {...source(item.signal.value,asset,label,'Threshold channel'),name:label,
        flow:source(item.flow.value,asset,label,'Discharge flow'),flow_confirmed:item.confirm.checked};
    }
    const baseline=fields.baseline.value.trim();
    return {settings:{baseline_name:baseline,start:fields.start.value,end:fields.end.value,max_gap_s:fields.gap.valueAsNumber,
      assets:groups.map(group=>{
        const id=group.id.value.trim();
        return {id,threshold_m:group.threshold.valueAsNumber,datum:group.datum.disabled?null:group.datum.value.trim(),
          baseline:scenario(group.base,id,baseline),proposed:group.cases.map(item=>scenario(item,id,item.label.value.trim()))};
      })},references};
  }
  function fresh(){try{return current&&current.signature===JSON.stringify(read());}catch{return false;}}
  function filtered(){return current?.result.rows.filter(row=>(!assetFilter.value||row.asset===assetFilter.value)&&
    (!yearFilter.value||String(row.baseline.year)===yearFilter.value))||[];}
  function display(){
    const rows=filtered(),offset=page*pageSize,end=Math.min(offset+pageSize,rows.length);body.replaceChildren();
    $('hbSpillScenarioCount').textContent=rows.length?'Showing '+(offset+1)+'–'+end+' of '+rows.length+' comparisons.':'No comparisons match these filters.';
    $('hbSpillScenarioPrev').disabled=!page;$('hbSpillScenarioNext').disabled=end===rows.length;
    const delta=(row,key)=>textNumber(row.baseline[key])+' → '+textNumber(row.proposed[key])+' · Δ '+textNumber(row.delta[key]);
    for(const row of rows.slice(offset,end)){
      const tr=body.insertRow(),reason=[row.delta.period_reason,row.delta.count_reason,row.delta.volume_reason,row.baseline.reason,row.proposed.reason].filter(Boolean).join(' ');
      for(const value of [row.asset+' · '+row.baseline.year,row.baseline_name+' → '+row.proposed_name,
        delta(row,'count'),delta(row,'duration_hours'),delta(row,'volume_m3'),reason])tr.insertCell().textContent=value;
    }
  }
  fields.reviewed.onchange=()=>reset();
  form.addEventListener('input',()=>{if(current||submit.disabled)reset('Inputs changed. Run the comparison again.');});
  form.onsubmit=async event=>{
    event.preventDefault();reset('Checking the common periods in the local worker…');const sequence=request;
    submit.disabled=true;
    try{
      const input=read(),signature=JSON.stringify(input);
      await ensureEngineBoot();const result=await engine.call('compare_spill_scenarios',input.settings);
      if(sequence!==request||signature!==JSON.stringify(read()))return;
      current={result,input,signature};page=0;
      assetFilter.replaceChildren(new Option('All assets',''),...[...new Set(result.rows.map(row=>row.asset))].map(id=>new Option(id,id)));
      yearFilter.replaceChildren(new Option('All years',''),...[...new Set(result.rows.map(row=>row.baseline.year))].map(year=>new Option(year,year)));
      report.hidden=false;status.textContent='Comparison ready. Each delta uses its own support and applicability checks.';display();
    }catch(error){if(sequence===request)status.textContent=conciseErrorMessage(error);}
    finally{submit.disabled=false;}
  };
  $('hbSpillScenarioAdd').onclick=()=>addAsset(true);
  $('hbSpillScenariosClose').onclick=()=>dialog.close();
  assetFilter.onchange=yearFilter.onchange=()=>{page=0;display();};
  $('hbSpillScenarioPrev').onclick=()=>{--page;display();};$('hbSpillScenarioNext').onclick=()=>{++page;display();};
  $('hbSpillScenarioExport').onclick=()=>{
    if(!fresh()){reset('A source or assessment setting changed. Run the comparison again.');return;}
    const headers=['Asset','Year','Baseline','Proposed','Start','End','Threshold (m)','Quantity','Datum','Base count','Proposed count','Count change',
      'Base duration (h)','Proposed duration (h)','Duration change (h)','Base volume (m³)','Proposed volume (m³)','Volume change (m³)','Count basis','Period basis','Volume basis'];
    const rows=filtered().map(row=>[row.asset,row.baseline.year,row.baseline_name,row.proposed_name,row.baseline.start,row.baseline.end,row.threshold_m,row.quantity,row.datum,
      row.baseline.count,row.proposed.count,row.delta.count,row.baseline.duration_hours,row.proposed.duration_hours,row.delta.duration_hours,
      row.baseline.volume_m3,row.proposed.volume_m3,row.delta.volume_m3,row.delta.count_reason,row.delta.period_reason,row.delta.volume_reason]);
    const csv=[['Build',buildToken],['Method',current.result.method],['Maximum valid gap (s)',current.input.settings.max_gap_s],
      ['Asset','Scenario','Role','Source','SHA-256','Column','Quantity','Canonical unit','Applied exclusions'],...current.input.references,headers,...rows];
    downloadBlob('hydra-spill-scenario-comparison.csv',csv.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');
  };
  window.addEventListener('icm:source-pool-changed',()=>{if(groups.length){reset('Sources changed. Recheck assignments.');refresh();}});
  window.addEventListener('icm:route-changed',({detail})=>{if(detail.workspace!=='spills'&&dialog.open)dialog.close();});
  addAsset(false);
  return ()=>{refresh();if(current&&!fresh())reset('A source or assessment setting changed. Run the comparison again.');if(!dialog.open)dialog.showModal();};
}

let compare;
window.HydraSpillInquiry={open(){open??=mount();open();},compare(){compare??=mountComparison();compare();}};
})();
