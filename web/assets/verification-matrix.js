/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
'use strict';

const node=(tag,text)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;};
const print=value=>Number.isFinite(value)?Number(value.toPrecision(6)).toString():'Unavailable';
const titles={coverage:'Common event coverage',peak:'Peak error',volume:'Volume error',timing:'Peak delay'};
const pairsLimit=16,cellLimit=512,pageSize=20;
let assessmentSnapshot=async()=>null;

function mount(){
  const root=document.getElementById('tab-verification-matrix');
  root.innerHTML=`<article class="panel"><div class="panel-head"><div><h2>Multi-event verification</h2>
    <p>Apply reviewed project tolerances to matched observed and simulated records across qualifying events.</p></div></div>
    <form id="hbVerificationForm"><div class="mapping-grid">
    <label>Rainfall evidence<select name="rain"><option value="survey">Flow Survey network WAPUG</option><option value="data">Data rainfall events</option></select></label>
    <label>Hydraulic quantity<select name="quantity"><option value="flow">Flow</option><option value="depth">Depth</option></select></label>
    <label>Maximum interpolation gap (s)<input type="number" name="gap" min="0.001" step="any" value="900" required></label>
    <label>Model clock shift (minutes)<input type="number" name="offset" step="any" value="0" required></label></div>
    <details open><summary>Qualifying events</summary><div class="actions">
      <button id="hbVerifyAll" type="button" class="btn">Select all</button><button id="hbVerifyNone" type="button" class="btn">Clear selection</button></div>
      <div id="hbVerifyEvents" class="mapping-grid"></div></details>
    <fieldset><legend>Observed and modelled pairings</legend><div id="hbVerifyPairs"></div>
      <div class="actions"><button type="button" class="btn" id="hbVerifyAdd">Add pairing</button></div></fieldset>
    <details open><summary>Project tolerances</summary><div class="mapping-grid">
      <label>Minimum common coverage (%)<input name="minimum_coverage_percent" type="number" min="0.001" max="100" step="any" value="90" required></label>
      <label>Allowed absolute peak delay (min)<input name="peak_offset_minutes" type="number" min="0" step="any" required></label>
      <label data-hb-verify-quantity="depth">Allowed absolute peak depth error (m)<input name="depth_peak_error_m" type="number" min="0" step="any"></label>
      <label data-hb-verify-quantity="flow">Allowed absolute peak flow error (%)<input name="flow_peak_error_percent" type="number" min="0" step="any" required></label>
      <label data-hb-verify-quantity="flow">Allowed absolute volume error (%)<input name="flow_volume_error_percent" type="number" min="0" step="any" required></label>
      <label data-hb-verify-quantity="flow">Minimum positive observed peak (m³/s)<input name="flow_peak_floor_m3_s" type="number" min="0.000000000001" step="any" required></label>
      <label data-hb-verify-quantity="flow">Minimum positive observed volume (m³)<input name="flow_volume_floor_m3" type="number" min="0.000000001" step="any" required></label></div></details>
    <label class="hb-transform-confirm"><input type="checkbox" name="clock" required> Confirm each pair matches its site and measurement quantity on the reviewed project clock</label>
    <div class="actions"><button type="button" id="hbVerifyCancel" class="btn" disabled>Cancel calculation</button>
      <button type="submit" class="btn primary">Calculate verification matrix</button></div></form>
    <p id="hbVerifyStatus" role="status"></p><section id="hbVerifyView" hidden>
    <p>Agreement criteria use complete event support. Partial-window values stay visible with their support and withholding reason.</p>
    <div class="actions"><label>Filter outcomes<select id="hbVerifyFilter"><option value="">All results</option><option value="outside">Outside tolerance</option><option value="withheld">Withheld or incomplete</option><option value="meets">All criteria meet</option></select></label>
      <button type="button" class="btn" id="hbVerifyPrev">Previous page</button><button type="button" class="btn" id="hbVerifyNext">Next page</button>
      <button type="button" class="btn" id="hbVerifyExport">Download matrix audit CSV</button></div>
    <p id="hbVerifyPage" aria-live="polite"></p><div class="table-wrap" tabindex="0" role="region" aria-label="Verification matrix results">
    <table class="data-table"><caption>Verification matrix</caption><thead><tr><th scope="col">Event</th><th scope="col">Monitor / scenario</th><th scope="col">Coverage</th>
    <th scope="col">Peak error</th><th scope="col">Volume error</th><th scope="col">Peak delay</th><th scope="col">Evidence</th></tr></thead><tbody></tbody></table></div>
    <section id="hbVerifyDetail" aria-label="Selected comparison evidence" hidden><h3 tabindex="-1"></h3><p id="hbVerifyDetailText"></p><ul id="hbVerifyCriterionDetails"></ul>
      <label>Engineer comment<textarea id="hbVerifyNotes" maxlength="3000" rows="3"></textarea></label>
      <div class="actions"><button type="button" class="btn" id="hbVerifyPlotButton">Plot event records</button>
      <button type="button" class="btn" id="hbCalibrationOpen">Investigate calibration</button></div>
      <p id="hbVerifyPlotStatus" role="status"></p><div id="hbVerifyPlot" role="group" aria-label="Observed and modelled event plot"></div>
      <div id="hbCalibrationPanel" hidden></div></section>
    </section><section id="hbVerifyRevisions" aria-label="Scenario revision tracking"><h3>Scenario revision tracking</h3>
    <p>Save the reviewed results under a revision name. Compare a current matrix with a baseline using the same observations, rainfall evidence, time windows and tolerances.</p>
    <div class="mapping-grid"><label>Revision name<input id="hbRevisionName" type="text" maxlength="160" autocomplete="off"></label>
    <label>Open baseline snapshot<input id="hbRevisionFile" type="file" accept=".json,application/json"></label></div>
    <p id="hbRevisionBaseline">No baseline selected.</p><div class="actions">
    <button class="btn" type="button" id="hbRevisionSave" disabled>Save verification snapshot</button>
    <button class="btn" type="button" id="hbRevisionSet" disabled>Use current as baseline</button>
    <button class="btn" type="button" id="hbRevisionClear" disabled>Clear baseline</button>
    <button class="btn primary" type="button" id="hbRevisionCompare" disabled>Compare with baseline</button></div>
    <p id="hbRevisionStatus" role="status"></p><div id="hbRevisionEvidence" hidden>
      <div class="actions"><label>Filter revision results<select id="hbRevisionFilter"><option value="">All results</option>
      <option>Improved</option><option>Deteriorated</option><option>Unchanged</option><option>Not comparable</option></select></label>
      <button class="btn" id="hbRevisionPrev" type="button">Previous revisions page</button><button class="btn" id="hbRevisionNext" type="button">Next revisions page</button>
      <button class="btn" id="hbRevisionExport" type="button">Download revision comparison CSV</button></div>
      <p id="hbRevisionPage" aria-live="polite"></p><div class="table-wrap" tabindex="0" role="region" aria-label="Revision comparison results">
      <table class="data-table"><caption>Verification change by criterion</caption><thead><tr><th scope="col">Observed record / period</th><th scope="col">Modelled records</th>
      <th scope="col">Criterion</th><th scope="col">Baseline</th><th scope="col">Proposed</th><th scope="col">Result</th><th scope="col">Recorded evidence</th></tr></thead>
      <tbody id="hbRevisionRows"></tbody></table></div></div></section></article>`;
  const $=id=>root.querySelector('#'+id),form=$('hbVerificationForm'),fields=form.elements;
  const status=$('hbVerifyStatus'),view=$('hbVerifyView'),details=$('hbVerifyDetail'),body=root.querySelector('tbody');
  const plot=$('hbVerifyPlot'),plotStatus=$('hbVerifyPlotStatus'),notes=$('hbVerifyNotes');
  const submit=form.querySelector('[type=submit]'),cancel=$('hbVerifyCancel'),addButton=$('hbVerifyAdd');
  const pairControls=[],eventSelections=new Set();
  let sources=[],events=[],eventStamp='',generation=0,plotGeneration=0,activeRun=null,result=null,activeCell=null,page=0;
  let baseline=null,revisionResult=null,revisionPage=0,revisionGeneration=0,revisionBusy=false;
  const active=()=>window.__ICM_PRECISION_WORKBENCH__?.route()?.page==='matrix';
  const calibration=mountCalibration($('hbCalibrationPanel'),()=>({activeCell,result}),plan);

  function stateOfEvents(){
    if(fields.rain.value==='data')return rainEventsFresh()?{basis:state.rainEventSignature,rows:state.rainEvents}:null;
    const wb=window.__ICM_WORKBENCH__;
    return wb.surveyFresh?.('complete')?{basis:wb.surveyDependencySignature('complete'),rows:wb.survey.batch.network?.qualified_wapug_events||[]}:null;
  }
  function clearPlot(){++plotGeneration;if(plot.data)globalThis.Plotly?.purge(plot);plotStatus.textContent='';}
  function clear(message){
    ++generation;result=null;activeCell=null;view.hidden=true;details.hidden=true;clearPlot();clearRevisionResult();
    calibration.reset();
    if(message)status.textContent=message;
  }
  function selectBox(select,options,placeholder){
    const before=select.value;select.replaceChildren(new Option(placeholder,''),...options.map(row=>new Option(row.label,row.key)));
    if(options.some(row=>row.key===before))select.value=before;
  }
  function addPair(){
    const row=node('div');row.className='mapping-grid hb-verification-pair';
    const controls={row,observed:node('select'),model:node('select'),remove:node('button','Remove')};
    controls.remove.type='button';controls.remove.className='btn';
    for(const [key,caption] of [['observed','Observed record'],['model','Modelled scenario']]){
      const label=node('label'),text=node('span',caption);controls[key].required=true;label.append(text,controls[key]);row.append(label);
    }
    controls.remove.onclick=()=>{
      const index=pairControls.indexOf(controls);pairControls.splice(index,1);row.remove();
      clear('Pairing removed. Recalculate for the remaining pairs.');updatePairs();pairControls[Math.min(index,pairControls.length-1)].observed.focus();
    };
    row.append(controls.remove);$('hbVerifyPairs').append(row);pairControls.push(controls);updatePairs();return controls;
  }
  function updatePairs(){
    for(const [index,pair] of pairControls.entries()){
      const {row,observed,model,remove}=pair;
      selectBox(observed,sources.filter(item=>item.role!=='model'),'Choose observed record');
      selectBox(model,sources.filter(item=>item.role!=='observed'),'Choose scenario record');
      row.querySelectorAll('label span')[0].textContent='Observed record '+(index+1);
      row.querySelectorAll('label span')[1].textContent='Modelled scenario '+(index+1);
      remove.setAttribute('aria-label','Remove pairing '+(index+1));remove.hidden=pairControls.length<2;
    }
    addButton.disabled=Boolean(activeRun)||pairControls.length>=pairsLimit;
  }
  function renderEvents(){
    $('hbVerifyEvents').replaceChildren(...events.map(event=>{
      const label=node('label'),input=node('input');input.type='checkbox';input.value=event.key;input.checked=eventSelections.has(event.key);
      input.onchange=()=>{
        if(input.checked)eventSelections.add(event.key);else eventSelections.delete(event.key);
        clear('Event selection changed. Calculate the current matrix.');
      };
      label.append(input,node('span',event.label));return label;
    }));
    $('hbVerifyAll').disabled=$('hbVerifyNone').disabled=!events.length;
  }
  function refresh(){
    const got=stateOfEvents(),stamp=JSON.stringify([fields.rain.value,got?.basis]);
    const changed=eventStamp!==stamp;eventStamp=stamp;
    events=(got?.rows||[]).filter(event=>event.start&&event.end).map((event,index)=>({start:event.start,end:event.end,
      key:String(index),number:event.event??index+1,label:'Event '+(event.event??index+1)+' · '+event.start.replace('T',' ')+' to '+event.end.replace('T',' ')}));
    if(changed){eventSelections.clear();for(const event of events)eventSelections.add(event.key);}
    const canonical=fields.quantity.value==='flow'?'m³/s':'m';
    sources=allSeries().filter(({item,col})=>item.status==='ready'&&item.hash&&seriesQuantity(item,col)===fields.quantity.value&&
      seriesUnit(item,col)===canonical&&item.parsed?.metadata?.timestamp_convention==='instantaneous'&&
      item.parsed?.metadata?.time_basis!=='timezone-aware/unresolved');
    updatePairs();renderEvents();
    for(const label of root.querySelectorAll('[data-hb-verify-quantity]')){
      label.hidden=label.dataset.hbVerifyQuantity!==fields.quantity.value;label.querySelector('input').disabled=label.hidden;
    }
    if(result)try{if(result.signature!==JSON.stringify(plan()))clear('Evidence changed. Calculate the matrix with the current inputs.');}
      catch{clear('Evidence changed. Calculate the matrix with the current inputs.');}
    submit.disabled=Boolean(activeRun)||!events.length||sources.length<2;
    if(!events.length)status.textContent='Calculate a current qualifying rainfall event set from the chosen evidence source.';
    else if(sources.length<2)status.textContent='Import compatible observed and modelled records with resolved units.';
    else if(!result&&!activeRun)status.textContent='Choose events, pair the local sources and set the applicable project tolerances.';
  }
  function plan(){
    const current=stateOfEvents();
    if(!current||JSON.stringify([fields.rain.value,current.basis])!==eventStamp)throw new Error('Rainfall qualification changed. Refresh it before using the matrix.');
    const windows=events.filter(item=>eventSelections.has(item.key));
    if(!windows.length)throw new Error('Select at least one qualifying event.');
    if(windows.length*pairControls.length>cellLimit)throw new Error('Choose at most '+cellLimit+' event–pair combinations per calculation.');
    const series=(key,role)=>{
      const row=sources.find(item=>item.key===key);
      if(!row)throw new Error('Select a ready '+role+' record for each pairing.');
      const exclusions=exclusionPayload(true,role,key);
      if(role==='observed'&&fields.rain.value==='survey'){
        const wb=window.__ICM_WORKBENCH__,quantity=fields.quantity.value;
        const matches=(wb.surveyMonitorSources?.()||[]).filter(item=>item.path===row.item.virtualPath&&item[quantity+'_col']===row.col);
        const scopes=new Set(matches.flatMap(item=>['all',quantity].map(channel=>'survey:monitor:'+item.monitor+':'+channel)));
        exclusions.push(...exclusionPayload(true).filter(item=>item.enabled&&scopes.has(item.scope)));
      }
      return {source_key:key,path:row.item.virtualPath,column:row.col,name:row.label,sha256:row.item.hash,exclusions};
    };
    const pairs=pairControls.map(({observed,model})=>({observed:series(observed.value,'observed'),scenario:series(model.value,'model')}));
    if(pairs.some(pair=>pair.observed.sha256===pair.scenario.sha256&&pair.observed.column===pair.scenario.column))
      throw new Error('Use different observed and modelled records in each pair.');
    const identity=pairs.map(pair=>JSON.stringify([pair.observed.sha256,pair.observed.column,pair.scenario.sha256,pair.scenario.column]));
    if(new Set(identity).size!==pairs.length)throw new Error('Remove duplicate observed and modelled pairings.');
    const criteria=Object.fromEntries([...form.querySelectorAll('details input[type=number]:enabled')].map(input=>[input.name,input.valueAsNumber]));
    return {windows,pairs,criteria,quantity:fields.quantity.value,rain:fields.rain.value,event_stamp:eventStamp,
      max_gap_seconds:fields.gap.valueAsNumber,offset_minutes:fields.offset.valueAsNumber};
  }
  fields.rain.onchange=()=>{clear();refresh();};
  fields.quantity.onchange=()=>{clear();refresh();};
  form.oninput=event=>{if(!event.target.closest('#hbVerifyEvents')&&result)clear('Inputs changed. Recalculate the matrix.');};
  $('hbVerifyAll').onclick=()=>{for(const event of events)eventSelections.add(event.key);renderEvents();clear('All qualifying events selected.');};
  $('hbVerifyNone').onclick=()=>{eventSelections.clear();renderEvents();clear('Select the qualifying events for review.');};
  addButton.onclick=()=>{clear('New pairing added. Choose its local records.');addPair().observed.focus();};
  cancel.onclick=()=>{if(activeRun){activeRun.cancelled=true;cancel.disabled=true;status.textContent='Stopping after the current comparison…';}};
  form.onsubmit=async event=>{
    event.preventDefault();clear();const run=generation;
    try{
      const input=plan(),signature=JSON.stringify(input),rows=[],total=input.pairs.length*input.windows.length;
      activeRun={cancelled:false};cancel.disabled=false;submit.disabled=true;addButton.disabled=true;
      status.textContent='Preparing '+total+' comparisons in the local worker…';await ensureEngineBoot();
      for(const window of input.windows)for(const pair of input.pairs){
        if(activeRun.cancelled||run!==generation)break;
        const unique=[...new Map([...pair.observed.exclusions,...pair.scenario.exclusions].map(item=>[item.id,item])).values()];
        let values=null,error=null;
        try{values=await engine.call('verification_matrix_event',{observed:{path:pair.observed.path,column:pair.observed.column},
          scenario:{path:pair.scenario.path,column:pair.scenario.column},event:window,criteria:input.criteria,
          max_gap_seconds:input.max_gap_seconds,offset_minutes:input.offset_minutes,exclusions:unique});}
        catch(failure){error=conciseErrorMessage(failure);}
        rows.push({window,pair,values,error,comment:''});
        if(!activeRun.cancelled&&run===generation)status.textContent='Compared '+rows.length+' of '+total+' event–pair combinations…';
      }
      if(run!==generation)return;
      if(activeRun.cancelled){status.textContent='Calculation cancelled. '+rows.length+' of '+total+' comparisons finished before cancellation.';return;}
      if(signature!==JSON.stringify(plan()))throw new Error('Inputs changed while running. Calculate the matrix again.');
      result={input,rows,signature};page=0;$('hbVerifyFilter').value='';view.hidden=false;renderRows();
      revisionControls();
      status.textContent='Verification matrix ready. '+rows.length+' comparisons · '+rows.filter(row=>row.error).length+' unavailable.';
    }catch(error){if(run===generation)status.textContent=conciseErrorMessage(error);}
    finally{activeRun=null;cancel.disabled=true;submit.disabled=!events.length||sources.length<2;addButton.disabled=pairControls.length>=pairsLimit;}
  };

  function outcome(cell){
    const checks=Object.values(cell.values?.checks||{});
    if(!checks.length||checks.some(({status})=>status==='Withheld'||status==='Below requirement'))return 'withheld';
    return checks.some(({status})=>status==='Outside tolerance')?'outside':'meets';
  }
  function summary(item){return item?print(item.value)+(item.unit==='%'?'':' ')+item.unit+' · '+item.status:'—';}
  function renderRows(){
    if(!result)return;
    const filter=$('hbVerifyFilter').value,rows=result.rows.filter(row=>!filter||outcome(row)===filter);
    body.replaceChildren();
    for(const cell of rows.slice(page*pageSize,(page+1)*pageSize)){
      const tr=node('tr'),checks=cell.values?.checks||{},period=node('td');
      const {start,end,number}=cell.window,startTime=node('time',start.replace('T',' '));startTime.dateTime=start;
      const endTime=node('time','to '+(end.slice(0,10)===start.slice(0,10)?end.slice(11):end.replace('T',' ')));endTime.dateTime=end;
      period.append(node('strong','Event '+number),startTime,endTime);tr.append(period);
      for(const text of [cell.pair.observed.name+' / '+cell.pair.scenario.name,...['coverage','peak','volume','timing'].map(key=>summary(checks[key]))])
        tr.append(node('td',text));
      const action=node('td'),button=node('button','Review');button.type='button';button.className='btn';
      button.setAttribute('aria-label','Review '+cell.pair.scenario.name+' · '+cell.window.label);button.onclick=()=>openCell(cell);
      action.append(button);tr.append(action);body.append(tr);
    }
    $('hbVerifyPage').textContent=rows.length?'Showing '+(page*pageSize+1)+'–'+Math.min(rows.length,(page+1)*pageSize)+' of '+rows.length:'No comparisons match this filter.';
    $('hbVerifyPrev').disabled=page===0;$('hbVerifyNext').disabled=(page+1)*pageSize>=rows.length;
  }
  function openCell(cell){
    clearPlot();calibration.reset();activeCell=cell;details.hidden=false;const title=details.querySelector('h3');
    title.textContent=cell.pair.observed.name+' / '+cell.pair.scenario.name;
    const values=cell.values?.values;
    $('hbVerifyDetailText').textContent=values?cell.window.label+' · '+print(values.common_support_seconds)+' of '+print(values.requested_seconds)+
      ' s supported · '+print(values.excluded_seconds)+' s excluded · Observed peak '+print(values.observed_peak)+' '+values.unit+
      ' · Modelled peak '+print(values.modelled_peak)+' '+values.unit:cell.error;
    $('hbVerifyCriterionDetails').replaceChildren(...Object.entries(cell.values?.checks||{}).map(([key,item])=>
      node('li',titles[key]+' · '+summary(item)+' · project threshold '+print(item.tolerance)+' '+item.unit+(item.reason?' · '+item.reason:''))));
    notes.value=cell.comment;notes.oninput=()=>{cell.comment=notes.value;if(revisionResult||revisionBusy)clearRevisionResult();};$('hbVerifyPlotButton').disabled=!values;title.focus();
    $('hbCalibrationOpen').hidden=cell.values?.quantity!=='flow';
  }
  $('hbCalibrationOpen').onclick=()=>calibration.open();
  $('hbVerifyPrev').onclick=()=>{page--;renderRows();};$('hbVerifyNext').onclick=()=>{page++;renderRows();};
  $('hbVerifyFilter').onchange=()=>{page=0;renderRows();};
  const shifted=(text,minutes)=>minutes&&text?new Date(new Date(text+'Z').valueOf()+60000*minutes).toISOString().slice(0,-1):text;
  $('hbVerifyPlotButton').onclick=async()=>{
    const cell=activeCell,saved=result;if(!cell||!saved)return;
    clearPlot();const revision=plotGeneration,shift=saved.input.offset_minutes;
    plotStatus.textContent='Preparing local event plot…';
    try{
      if(saved.signature!==JSON.stringify(plan()))throw new Error('Evidence changed. Recalculate before plotting.');
      const resultSeries=[];
      for(const [source,offset] of [[cell.pair.observed,0],[cell.pair.scenario,shift]]){
        const series=await engine.call('series_data',{path:source.path,column:source.column,start:shifted(cell.window.start,-offset),
          end:shifted(cell.window.end,-offset),max_points:5000,max_gap_seconds:saved.input.max_gap_seconds});
        resultSeries.push({x:series.timestamp.map(value=>shifted(value,offset)),y:series.value,name:esc(source.name),connectgaps:false,mode:'lines'});
      }
      const plotly=await loadVendorScript('Plotly');if(revision!==plotGeneration)return;
      const reviewed=[...new Map([...cell.pair.observed.exclusions,...cell.pair.scenario.exclusions].map(item=>[item.id,item])).values()];
      await plotly.react(plot,resultSeries,{...(window.HydraDesign?.chartLayout()||{}),height:360,hovermode:'x unified',
        xaxis:{title:{text:'Project clock'},type:'date',range:[cell.window.start,cell.window.end]},
        shapes:reviewed.map(item=>({type:'rect',x0:item.start,x1:item.end,y0:0,y1:1,yref:'paper',fillcolor:'rgba(115,128,145,0.20)',line:{width:0}})),
        yaxis:{title:{text:'Observed and modelled ('+esc(cell.values.values.unit)+')'}}},plotConfig('hydra-verification-matrix'));
      if(revision===plotGeneration)plotStatus.textContent='Displayed samples are for context. Shading marks reviewed exclusions. Calculations use exact common support.';
    }catch(error){if(revision===plotGeneration)plotStatus.textContent=conciseErrorMessage(error);}
  };
  $('hbVerifyExport').onclick=()=>{
    try{
      if(!result||result.signature!==JSON.stringify(plan()))throw new Error('Evidence changed. Calculate the matrix before export.');
      const {input,rows}=result,out=[['Build',buildToken],['Method','project-event-screens-v1'],['Rainfall evidence',input.rain],['Quantity',input.quantity],
        ['Comparison maximum gap (s)',input.max_gap_seconds],['Model clock shift (min)',input.offset_minutes],
        ['Start','End','Observed','Observed SHA-256','Observed channel','Modelled','Modelled SHA-256','Modelled channel',
          'Requested seconds','Common valid seconds','Excluded seconds','Observed peak','Modelled peak','Peak unit',
          'Observed volume (m³)','Modelled volume (m³)','Metric','Value','Unit','Project threshold','State','Reason','Engineer comment','Observed exclusions','Model exclusions']];
      for(const {window,pair,values,error,comment} of rows){
        const {observed,scenario}=pair,raw=values?.values;
        const columns=[window.start,window.end,observed.name,observed.sha256,observed.column,scenario.name,scenario.sha256,scenario.column,
          raw?.requested_seconds,raw?.common_support_seconds,raw?.excluded_seconds,raw?.observed_peak,raw?.modelled_peak,raw?.unit,
          raw?.observed_volume_m3,raw?.modelled_volume_m3];
        const audit=[comment,JSON.stringify(observed.exclusions),JSON.stringify(scenario.exclusions)];
        if(error){out.push([...columns,'',null,'',null,'Withheld',error,...audit]);continue;}
        for(const [key,item] of Object.entries(values.checks))out.push([...columns,titles[key],item.value,item.unit,item.tolerance,item.status,item.reason,...audit]);
      }
      downloadBlob('hydra-verification-matrix.csv',out.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');
    }catch(error){clear(error.message);}
  };

  const revisionName=$('hbRevisionName'),revisionStatus=$('hbRevisionStatus'),revisionEvidence=$('hbRevisionEvidence');
  const revisionFile=$('hbRevisionFile'),revisionLimit=8*1024*1024;
  const onlyText=value=>typeof value==='string'?value:'';
  function revisionControls(){
    $('hbRevisionSave').disabled=$('hbRevisionSet').disabled=revisionBusy||!result;
    $('hbRevisionCompare').disabled=revisionBusy||!result||!baseline;
    $('hbRevisionClear').disabled=revisionBusy||!baseline;revisionFile.disabled=revisionBusy;
    $('hbRevisionBaseline').textContent=baseline?baseline.summary.label+' · '+baseline.summary.comparisons+' saved comparisons.':'No baseline selected.';
  }
  function clearRevisionResult(){
    ++revisionGeneration;revisionResult=null;revisionEvidence.hidden=true;revisionStatus.textContent='';revisionControls();
  }
  function rainBasis(mode){
    const exclusions=rows=>rows.map(({start,end,scope,reason})=>[start,end,scope,reason]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if(mode==='data'){
      const current=JSON.parse(rainEventInputSignature()),source=mappingObject(state.mapping.rain);
      if(!source?.item?.hash)throw new Error('The current rainfall evidence requires a ready local rainfall source.');
      return [mode,source.item.hash,source.col,current.rainfall_semantics,current.conversion_factor,current.criteria,current.analysis,exclusions(current.exclusions)];
    }
    const wb=window.__ICM_WORKBENCH__,survey=wb.survey,ready=allSeries();
    const gauges=wb.surveyRainSources().map(row=>[row.gauge,ready.find(item=>item.item.virtualPath===row.path&&item.col===row.column)?.item.hash,
      row.column,row.rainfall_semantics]).sort((a,b)=>a[0].localeCompare(b[0]));
    if(!gauges.length||gauges.some(row=>!row[1]))throw new Error('The current qualification requires ready, fingerprinted rain-gauge sources.');
    const applied=exclusionPayload(true).filter(row=>row.enabled&&(row.scope==='rainfall'||row.scope.startsWith('survey:gauge:')));
    return [mode,survey.batch.network.method,survey.batch.network.criteria,gauges,Number(document.getElementById('rainFactor').value),
      survey.associationSource?.sha256||null,exclusions(applied)];
  }
  async function captureSnapshot(label=revisionName.value.trim()){
    const known=result;
    if(!known||known.signature!==JSON.stringify(plan()))throw new Error('Calculate a fresh matrix before capturing a revision.');
    if(!label)throw new Error('Enter a revision name.');
    const {input,rows}=known;
    const rainfall=await sha256Bytes(new TextEncoder().encode(JSON.stringify(rainBasis(input.rain))));
    if(known!==result||known.signature!==JSON.stringify(plan()))throw new Error('The matrix changed while reading its evidence.');
    const frozen={schema:'hydra-verification-snapshot-v1',build:buildToken,method:'project-event-screens-v1',label,
      captured_at:new Date().toISOString(),quantity:input.quantity,rainfall_basis:input.rain,criteria:input.criteria,
      maximum_gap_seconds:input.max_gap_seconds,model_offset_minutes:input.offset_minutes,
      rows:rows.map(({window,pair,values,error,comment})=>({start:window.start,end:window.end,observed_name:pair.observed.name,
        observed_sha256:pair.observed.sha256,observed_column:pair.observed.column,model_name:pair.scenario.name,
        model_sha256:pair.scenario.sha256,model_column:pair.scenario.column,rainfall_provenance:rainfall,
        complete_support:values?.support_complete===true,checks:values?.checks||{},evidence:values?.values||null,error,comment,
        observed_exclusions:pair.observed.exclusions,model_exclusions:pair.scenario.exclusions}))};
    return frozen;
  }
  assessmentSnapshot=async label=>{
    if(!result)return null;
    try{if(result.signature!==JSON.stringify(plan()))return null;}
    catch{return null;}
    return captureSnapshot(label);
  };
  async function revisionOperation(action){
    if(revisionBusy)return;
    const run=revisionGeneration;revisionBusy=true;revisionControls();revisionStatus.textContent='Preparing local revision evidence…';
    try{await action(()=>run===revisionGeneration);}
    catch(error){if(run===revisionGeneration)revisionStatus.textContent=conciseErrorMessage(error);}
    finally{revisionBusy=false;revisionControls();}
  }
  async function setBaseline(snapshot,stillCurrent){
    await ensureEngineBoot();
    const summary=await engine.call('validate_verification_snapshot',{snapshot});
    if(!stillCurrent())return;
    baseline={snapshot,summary};clearRevisionResult();revisionStatus.textContent='Baseline ready. Calculate and name the proposed revision when available.';
  }
  $('hbRevisionSave').onclick=()=>void revisionOperation(async current=>{
    const snapshot=await captureSnapshot(),content=JSON.stringify(snapshot,null,2)+'\n';
    if(new Blob([content]).size>revisionLimit)throw new Error('Reduce the number of rows or review notes before saving this snapshot.');
    if(!current())return;
    downloadBlob('hydra-verification-snapshot.json',content,'application/json');
    revisionStatus.textContent='Verification snapshot downloaded.';
  });
  $('hbRevisionSet').onclick=()=>void revisionOperation(async current=>await setBaseline(await captureSnapshot(),current));
  revisionFile.onchange=()=>{
    const file=revisionFile.files?.[0];revisionFile.value='';if(!file)return;
    void revisionOperation(async current=>{
      if(file.size>revisionLimit)throw new Error('Choose a verification snapshot no larger than 8 MiB.');
      let snapshot;
      try{snapshot=JSON.parse(await file.text());}catch{throw new Error('The selected file is not a readable verification snapshot.');}
      await setBaseline(snapshot,current);
    });
  };
  $('hbRevisionClear').onclick=()=>{baseline=null;clearRevisionResult();revisionStatus.textContent='Baseline cleared.';};
  revisionName.oninput=()=>{if(revisionResult||revisionBusy)clearRevisionResult();};
  $('hbRevisionCompare').onclick=()=>void revisionOperation(async current=>{
    const known=baseline?.snapshot;if(!known)throw new Error('Select a baseline snapshot.');
    const candidate=await captureSnapshot(),signature=result.signature;
    const compared=await engine.call('verification_revision_delta',{baseline:known,candidate});
    if(!current()||signature!==result?.signature||known!==baseline?.snapshot)return;
    revisionResult={baseline:known,candidate,compared,signature};revisionPage=0;$('hbRevisionFilter').value='';revisionEvidence.hidden=false;
    renderRevisions();revisionStatus.textContent='Revision comparison ready.';
  });
  function revisionRows(){
    if(!revisionResult)return [];
    const {baseline:known,candidate,compared}=revisionResult;
    return compared.rows.flatMap(row=>{
      const before=known.rows[row.baseline_row],after=candidate.rows[row.candidate_row];
      return Object.entries(row.checks).map(([key,check])=>({before,after,key,check}));
    });
  }
  function renderRevisions(){
    const filter=$('hbRevisionFilter').value,rows=revisionRows().filter(row=>!filter||row.check.status===filter),target=$('hbRevisionRows');
    target.replaceChildren();
    for(const {before,after,key,check} of rows.slice(revisionPage*pageSize,(revisionPage+1)*pageSize)){
      const row=node('tr'),source=after||before;
      const names=[onlyText(before?.model_name),onlyText(after?.model_name)].filter(Boolean).join(' → ');
      const notes=[onlyText(before?.comment),onlyText(after?.comment)].filter(Boolean).join(' · ');
      const origin=node('td'),period=node('time',source.start.replace('T',' ')+' to '+
        (source.start.slice(0,10)===source.end.slice(0,10)?source.end.slice(11):source.end.replace('T',' ')));
      period.dateTime=source.start;origin.append(node('div',onlyText(source.observed_name)),period);row.append(origin);
      const valueText=value=>Number.isFinite(value)?print(value)+(check.unit==='%'?'':' ')+(check.unit||''):print(value);
      for(const value of [names,titles[key],valueText(check.baseline),valueText(check.candidate),check.status,
        [check.reason,notes].filter(Boolean).join(' · ')])row.append(node('td',value));
      target.append(row);
    }
    $('hbRevisionPage').textContent=rows.length?'Showing '+(revisionPage*pageSize+1)+'–'+Math.min(rows.length,(revisionPage+1)*pageSize)+' of '+rows.length:'No criteria match this filter.';
    $('hbRevisionPrev').disabled=revisionPage===0;$('hbRevisionNext').disabled=(revisionPage+1)*pageSize>=rows.length;
  }
  $('hbRevisionFilter').onchange=()=>{revisionPage=0;renderRevisions();};
  $('hbRevisionPrev').onclick=()=>{revisionPage--;renderRevisions();};$('hbRevisionNext').onclick=()=>{revisionPage++;renderRevisions();};
  $('hbRevisionExport').onclick=()=>{
    try{
      if(!revisionResult||revisionResult.signature!==JSON.stringify(plan()))throw new Error('Recalculate the current revision before exporting.');
      const {baseline:known,candidate,compared}=revisionResult;
      const rows=[['Build',buildToken],['Method',compared.method],['Baseline revision',known.label],['Proposed revision',candidate.label],
        ['Start','End','Observed','Observed SHA-256','Observed channel','Baseline model SHA-256','Proposed model SHA-256',
        'Criterion','Baseline value','Proposed value','Change in error magnitude','Unit','Status','Reason','Baseline note','Proposed note']];
      for(const {before,after,key,check} of revisionRows()){
        const source=after||before;
        rows.push([source.start,source.end,onlyText(source.observed_name),source.observed_sha256,source.observed_column,
          onlyText(before?.model_sha256),onlyText(after?.model_sha256),titles[key],check.baseline,check.candidate,check.change_in_error_magnitude,
          check.unit,check.status,check.reason,onlyText(before?.comment),onlyText(after?.comment)]);
      }
      downloadBlob('hydra-verification-revision-comparison.csv',rows.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');
    }catch(error){clearRevisionResult();revisionStatus.textContent=conciseErrorMessage(error);}
  };

  addPair();refresh();
  window.addEventListener('icm:route-changed',({detail})=>{
    if(detail.workspace==='graphs'&&detail.page==='matrix')refresh();
    else if(activeRun){activeRun.cancelled=true;++generation;}
  });
  for(const type of ['icm:source-pool-changed','icm:rainfall-interpretation-changed'])window.addEventListener(type,()=>{
    if(active())refresh();
  });
}

function mountCalibration(root, context, plan){
  root.innerHTML=`<section aria-labelledby="hbCalibrationTitle"><div class="panel-head"><div><h3 id="hbCalibrationTitle" tabindex="-1">Calibration investigation</h3>
    <p>Review evidence from the selected storm, a preceding period and recovery. Compare the findings with site records before changing model parameters.</p></div>
    <button class="btn" id="hbCalibrationClose" type="button">Close investigation</button></div>
    <form><details open><summary>Preceding conditions and recovery</summary><div class="mapping-grid">
    <label>Preceding start<input name="pre_start" type="datetime-local" step="1"></label><label>Preceding end<input name="pre_end" type="datetime-local" step="1"></label>
    <label>Rainfall channel for preceding period<select name="rain"></select></label><label>Antecedent rainfall limit (mm)<input name="dry_rain_mm" type="number" min="0" step="any"></label>
    <label>Recovery start<input name="post_start" type="datetime-local" step="1"></label><label>Recovery end<input name="post_end" type="datetime-local" step="1"></label></div>
    <label class="hb-transform-confirm"><input name="rain_confirmed" type="checkbox"> Reviewed the gauge and preceding conditions at this location</label></details>
    <details><summary>Paired depth evidence</summary><div class="mapping-grid"><label>Observed depth<select name="obs_depth"></select></label>
    <label>Modelled depth<select name="model_depth"></select></label></div>
    <label class="hb-transform-confirm"><input name="depth_confirmed" type="checkbox"> Confirmed the same site, clock and depth reference as the selected flow pairing</label></details>
    <details><summary>Optional project tolerances</summary><div class="mapping-grid">
    <label>Preceding mean flow difference (m³/s)<input name="dry_mean_m3_s" type="number" min="0" step="any"></label>
    <label>Storm excess volume difference (m³)<input name="storm_excess_m3" type="number" min="0" step="any"></label>
    <label>Recovery residual flow difference (m³/s)<input name="recovery_mean_m3_s" type="number" min="0" step="any"></label>
    <label>Depth peak difference (m)<input name="depth_difference_m" type="number" min="0" step="any"></label></div></details>
    <div class="actions"><button class="btn primary" type="submit">Review calibration evidence</button></div></form>
    <p id="hbCalibrationStatus" role="status"></p><div id="hbCalibrationEvidence" hidden><p id="hbCalibrationCoverage"></p><p id="hbCalibrationHydraulicSupport"></p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Calibration evidence results"><table class="data-table"><caption>Calibration evidence by phase</caption>
    <thead><tr><th scope="col">Evidence</th><th scope="col">Observed</th><th scope="col">Modelled</th><th scope="col">Difference</th><th scope="col">Investigation</th></tr></thead><tbody></tbody></table></div>
    <div class="actions"><button class="btn" id="hbCalibrationExport" type="button">Download calibration evidence CSV</button></div></div></section>`;
  const $=id=>root.querySelector('#'+id),form=root.querySelector('form'),fields=form.elements,status=$('hbCalibrationStatus');
  const report=$('hbCalibrationEvidence'),submit=form.querySelector('[type=submit]'),body=report.querySelector('tbody');
  const names={dry_mean:'Preceding dry-period mean flow',storm_excess:'Storm volume above preceding mean',peak:'Peak flow error',
    timing:'Peak delay',recovery:'Recovery flow above preceding mean',hydraulic_context:'Paired depth peaks'};
  const supportNames={storm:'Storm flow',preceding:'Preceding flow',recovery:'Recovery flow',depth:'Storm depth'};
  let sequence=0,record=null,available=[];
  function clear(message){++sequence;record=null;report.hidden=true;status.textContent=message||'';}
  function reset(){clear();form.reset();root.hidden=true;submit.disabled=false;}
  function refresh(){
    available=allSeries().filter(({item,col})=>item.status==='ready'&&item.hash&&item.parsed?.metadata?.time_basis!=='timezone-aware/unresolved'&&
      ((seriesQuantity(item,col)==='depth'&&seriesUnit(item,col)==='m')||
        (seriesQuantity(item,col)==='rainfall'&&rainfallSemanticsFor(item,col)!=='unresolved')));
    const groups={rain:available.filter(({item,col})=>seriesQuantity(item,col)==='rainfall'),
      obs_depth:available.filter(({item,col,role})=>seriesQuantity(item,col)==='depth'&&role!=='model'),
      model_depth:available.filter(({item,col,role})=>seriesQuantity(item,col)==='depth'&&role!=='observed')};
    for(const [key,rows] of Object.entries(groups)){
      fields[key].replaceChildren(new Option('No source selected',''),...rows.map(row=>new Option(row.label,row.key)));
      if(key==='rain'&&rows.some(row=>row.key===state.mapping.rain))fields[key].value=state.mapping.rain;
    }
  }
  function inputs(){
    const {activeCell:cell,result}=context();
    if(!cell||!result||result.signature!==JSON.stringify(plan()))throw new Error('Calculate a current verification matrix and select a flow pairing.');
    const period=(prefix,caption)=>{
      const start=fields[prefix+'_start'].value,end=fields[prefix+'_end'].value;
      if(!start&&!end)return null;
      if(!start||!end||start>=end)throw new Error('Review both times for the '+caption+' period.');
      return {start,end};
    };
    const chosen=(key,role)=>{
      const row=available.find(item=>item.key===fields[key].value);
      if(!row)return null;
      const {item,col}=row;
      return {key:row.key,name:row.label,sha256:item.hash,path:item.virtualPath,column:col,exclusions:exclusionPayload(true,role,row.key),
        ...(role==='rainfall'?{rainfall_semantics:rainfallSemanticsFor(item,col)}:{})};
    };
    const preceding=period('pre','preceding'),recovery=period('post','recovery');
    const rain=preceding?chosen('rain','rainfall'):null,observedDepth=chosen('obs_depth','observed'),modelDepth=chosen('model_depth','model');
    if(preceding&&(!rain||!fields.rain_confirmed.checked))throw new Error('Confirm the appropriate rainfall source and review preceding conditions.');
    if(Boolean(observedDepth)!==Boolean(modelDepth))throw new Error('Select both depth records for the same flow location.');
    if(observedDepth&&(observedDepth.key===modelDepth.key||!fields.depth_confirmed.checked))throw new Error('Confirm distinct compatible depth records for the flow location.');
    const unique=rows=>[...new Map(rows.map(item=>[item.id,item])).values()];
    const settings=Object.fromEntries([...form.querySelectorAll('input[type=number]')].map(input=>[input.name,
      input.value===''?null:input.valueAsNumber]));
    const {observed,scenario}=cell.pair;
    const worker={observed,scenario,event:cell.window,criteria:result.input.criteria,settings,
      max_gap_seconds:result.input.max_gap_seconds,offset_minutes:result.input.offset_minutes,
      exclusions:unique([...observed.exclusions,...scenario.exclusions]),preceding,recovery,
      rainfall:rain?{...rain,confirmed:true}:null,
      depth:observedDepth?{observed:observedDepth,scenario:modelDepth,confirmed:true,
        exclusions:unique([...observedDepth.exclusions,...modelDepth.exclusions])}:null};
    return {worker,signature:result.signature};
  }
  form.oninput=()=>{if(record)clear('Inputs changed. Review the selected evidence again.');};
  form.onsubmit=async event=>{
    event.preventDefault();clear('Reviewing the selected periods in the local worker…');const run=sequence;submit.disabled=true;
    try{
      const current=inputs(),signature=JSON.stringify(current);
      const result=await engine.call('verification_calibration_diagnostics',current.worker);
      if(run!==sequence)return;
      if(signature!==JSON.stringify(inputs()))throw new Error('Inputs changed during calculation. Review the current evidence again.');
      record={current,result,signature};body.replaceChildren();
      for(const [key,item] of Object.entries(result.findings)){
        const row=node('tr'),unit=item.unit||'';
        const format=(value,units)=>typeof value==='string'?value.replace('T',' '):Number.isFinite(value)?
          print(value)+(units&&units!=='%'?' ':'')+units:'—';
        const sourceUnit=item.source_unit||unit;
        for(const value of [names[key],format(item.observed,sourceUnit),format(item.modelled,sourceUnit),format(item.difference??item.value,unit),
          [item.status,item.basis,item.investigate].filter(Boolean).join(' · ')])row.append(node('td',value));
        body.append(row);
      }
      const rain=result.rainfall;
      $('hbCalibrationCoverage').textContent=rain?'Recorded preceding rainfall '+print(rain.depth_mm)+' mm · '+print(rain.valid_seconds)+' of '+
        print(rain.requested_seconds)+' s supported.':'Preceding rainfall evidence is unavailable.';
      $('hbCalibrationHydraulicSupport').textContent=Object.entries(result.support).filter(([,value])=>value).map(([key,value])=>
        supportNames[key]+' '+print(value.common_support_seconds)+' of '+print(value.requested_seconds)+' s supported · '+
        print(value.excluded_seconds)+' s excluded').join(' | ')+'.';
      status.textContent='Calibration evidence ready.';report.hidden=false;
    }catch(error){if(run===sequence)status.textContent=conciseErrorMessage(error);}
    finally{if(run===sequence)submit.disabled=false;}
  };
  $('hbCalibrationExport').onclick=()=>{
    try{
      if(!record||record.signature!==JSON.stringify(inputs()))throw new Error('Review the current evidence again before exporting.');
      const {result,current}=record,{worker}=current;
      const rows=[['Build',buildToken],['Method',result.method],['Storm start',worker.event.start],['Storm end',worker.event.end],
        ['Preceding start',worker.preceding?.start],['Preceding end',worker.preceding?.end],['Recovery start',worker.recovery?.start],['Recovery end',worker.recovery?.end],
        ['Model clock shift (min)',worker.offset_minutes],['Reviewed thresholds',JSON.stringify(worker.settings)],
        ['Recorded preceding rainfall (mm)',result.rainfall?.depth_mm],['Supported rainfall (s)',result.rainfall?.valid_seconds],
        ['Requested rainfall (s)',result.rainfall?.requested_seconds],['Source','SHA-256','Channel','Exclusions']];
      for(const source of [worker.observed,worker.scenario,worker.rainfall,worker.depth?.observed,worker.depth?.scenario].filter(Boolean))
        rows.push([source.name,source.sha256,source.column,JSON.stringify(source.exclusions)]);
      rows.push(['Hydraulic period','Requested seconds','Common valid seconds','Excluded seconds']);
      for(const [key,value] of Object.entries(result.support))if(value)
        rows.push([supportNames[key],value.requested_seconds,value.common_support_seconds,value.excluded_seconds]);
      rows.push(['Phase','Observed','Modelled','Measurement unit','Difference','Difference unit','Threshold','Screen','Basis','Investigation']);
      for(const [key,row] of Object.entries(result.findings))rows.push([names[key],row.observed,row.modelled,row.source_unit??row.unit,
        row.difference??row.value,row.unit,row.threshold??row.tolerance,row.status,row.basis,row.investigate]);
      downloadBlob('hydra-verification-calibration.csv',rows.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');
    }catch(error){clear(error.message);}
  };
  $('hbCalibrationClose').onclick=()=>{reset();root.ownerDocument.getElementById('hbCalibrationOpen')?.focus();};
  return {reset,open(){refresh();root.hidden=false;$('hbCalibrationTitle').focus();}};
}

window.HydraVerificationMatrix={mount,assessmentSnapshot:label=>assessmentSnapshot(label)};
})();
