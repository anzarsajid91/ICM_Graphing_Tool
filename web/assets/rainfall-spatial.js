/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
'use strict';

const node=(tag,text)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;};
const format=(value,digits=5)=>Number.isFinite(value)?Number(value.toPrecision(digits)).toLocaleString(undefined,{maximumFractionDigits:9}):'Unavailable';
let openDialog;

function mount(){
  const dialog=node('dialog');dialog.id='hbRainSpatial';dialog.setAttribute('aria-labelledby','hbRainSpatialTitle');
  dialog.innerHTML=`<article class="panel"><div class="panel-head"><div><h2 id="hbRainSpatialTitle">Compare rain gauges</h2>
    <p>Compare rainfall depths, coverage and timing on a common project clock. Gauge differences may reflect real rainfall variation or measurement conditions.</p></div>
    <button type="button" class="btn" id="hbRainSpatialClose">Close comparison</button></div>
    <form><div class="mapping-grid"><label>Assessment window<select name="window"></select></label>
    <label>Project-clock start<input name="start" type="datetime-local" step="any" required></label>
    <label>Project-clock end<input name="end" type="datetime-local" step="any" required></label>
    <label>Comparison interval (s)<input name="interval" type="number" min="1" step="any" value="300" required></label>
    <label>Maximum source gap (s)<input name="gap" type="number" min="1" step="any" value="900" required></label>
    <label>Review intensities above (mm/h, optional)<input name="suspect" type="number" min="0.001" step="any"></label></div>
    <fieldset><legend>Observed rainfall channels</legend><div class="mapping-grid" id="hbRainSpatialChoices"></div>
    <div class="actions"><button type="button" class="btn" id="hbRainSpatialAdd">Add a gauge</button></div></fieldset>
    <label class="hb-transform-confirm"><input type="checkbox" name="clock" required> Confirm all gauges use the same project clock and left-labelled rainfall intervals</label>
    <div class="actions"><button type="submit" class="btn primary">Compare rainfall</button></div></form>
    <p id="hbRainSpatialStatus" role="status"></p><section id="hbRainSpatialReview" hidden>
    <p id="hbRainSpatialVariation"></p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Coverage and rainfall totals"><table class="data-table"><caption>Gauge coverage and event totals</caption>
    <thead><tr><th scope="col">Gauge</th><th scope="col">Covered time</th><th scope="col">Supported depth (mm)</th><th scope="col">Full window depth (mm)</th>
    <th scope="col">Incomplete bins</th><th scope="col">Review evidence</th></tr></thead><tbody id="hbRainSpatialGauges"></tbody></table></div>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Pairwise rainfall comparison"><table class="data-table"><caption>Pairwise rainfall timing and agreement</caption>
    <thead><tr><th scope="col">Gauge pair</th><th scope="col">Common complete bins</th><th scope="col">Pearson r</th><th scope="col">Peak offset of second gauge (s)</th></tr></thead>
    <tbody id="hbRainSpatialPairs"></tbody></table></div>
    <p>Peak timing requires complete window coverage and a unique wettest interval at both gauges. Pearson r uses at least three complete, equal-duration intervals shared by each pair.</p>
    <div id="hbRainSpatialPlot" role="group" aria-label="Accumulated supported rainfall of each gauge"></div>
    <p>Gaps indicate incomplete support. Accumulated supported depth uses the resolved source units. The CSV records coverage and candidate flags for each interval.</p>
    <div class="actions"><button type="button" class="btn" id="hbRainSpatialExport">Download rainfall comparison CSV</button></div></section></article>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id),form=dialog.querySelector('form'),fields=form.elements;
  const status=$('hbRainSpatialStatus'),view=$('hbRainSpatialReview'),choiceHost=$('hbRainSpatialChoices');
  const plot=$('hbRainSpatialPlot'),submit=form.querySelector('[type=submit]');
  const controls=[];
  let sequence=0,record=null,requestIdentity=null,available=[],events=[];

  function rainfallSources(){
    return allSeries().filter(({item,col,role})=>item.status==='ready'&&item.hash&&role!=='model'&&
      seriesQuantity(item,col)==='rainfall'&&['mm','mm/h'].includes(seriesUnit(item,col))&&
      rainfallSemanticsFor(item,col)!=='unresolved'&&item.parsed?.metadata?.time_basis!=='timezone-aware/unresolved');
  }
  function currentEvents(){
    const wb=window.__ICM_WORKBENCH__;
    if(!wb.surveyFresh?.('complete'))return [];
    return (wb.survey?.batch?.network?.candidate_wapug_events||[]).filter(row=>row.start&&row.end);
  }
  function clear(message){
    ++sequence;record=null;requestIdentity=null;view.hidden=true;
    if(plot.data)globalThis.Plotly?.purge(plot);
    if(message)status.textContent=message;
  }
  function renderOptions(){
    const found=new Set(controls.map(({select})=>select.value).filter(Boolean));
    controls.forEach(({section,select,remove},index)=>{
      const was=select.value,caption='Gauge '+(index+1);
      section.querySelector('span').textContent=caption;
      remove.setAttribute('aria-label','Remove '+caption.toLowerCase());remove.hidden=controls.length<=2;
      select.replaceChildren(new Option('Choose a rainfall channel',''),...available.map(row=>{
        const option=new Option(row.label,row.key);option.disabled=found.has(row.key)&&row.key!==was;return option;
      }));
      if(available.some(row=>row.key===was))select.value=was;
    });
    $('hbRainSpatialAdd').disabled=controls.length>=Math.min(8,available.length);
    submit.disabled=available.length<2||Boolean(requestIdentity);
  }
  function add(){
    const section=node('div'),label=node('label'),select=node('select'),remove=node('button','Remove');
    const control={section,select,remove};controls.push(control);select.required=true;
    remove.type='button';remove.className='btn';
    select.onchange=()=>{clear('Gauge selection changed. Run the comparison to use the current inputs.');renderOptions();};
    remove.onclick=()=>{
      const index=controls.indexOf(control);
      controls.splice(index,1);section.remove();clear('Gauge selection changed. Run the comparison to use the current inputs.');renderOptions();
      controls[Math.min(index,controls.length-1)].select.focus();
    };
    label.append(node('span'),select);section.append(label,remove);choiceHost.append(section);
  }
  function updateEvents(){
    const selected=events[Number(fields.window.value)-1];
    events=currentEvents();
    fields.window.replaceChildren(new Option('Manual dates',''),...events.map((row,index)=>new Option(
      'Event '+(row.event??index+1)+' · '+String(row.start).replace('T',' ')+' · '+(row.qualifies_network_wapug?'Network qualified':'Candidate'),String(index+1))));
    const index=selected?events.findIndex(row=>row.start===selected.start&&row.end===selected.end):-1;
    if(index>=0)fields.window.value=String(index+1);
  }
  function collect(){
    const selected=controls.map(({select})=>available.find(row=>row.key===select.value));
    if(selected.some(row=>!row)||new Set(selected.map(row=>row.key)).size!==selected.length)throw new Error('Choose distinct observed rainfall channels.');
    if(fields.start.value>=fields.end.value)throw new Error('Choose a later project-clock end time.');
    const fromSurvey=events[Number(fields.window.value)-1];
    const assignments=window.__ICM_WORKBENCH__.surveyRainSources?.()||[];
    const scoped=exclusionPayload(true).filter(exclusion=>exclusion.enabled&&exclusion.scope.startsWith('survey:gauge:'));
    const descriptions=selected.map(({item,col,key,label})=>{
      const scopes=new Set(assignments.filter(row=>row.path===item.virtualPath&&row.column===col).map(row=>'survey:gauge:'+row.gauge+':rainfall'));
      return {name:label,fingerprint:item.hash,reference:{path:item.virtualPath,column:col,rainfall_semantics:rainfallSemanticsFor(item,col),
        exclusions:[...exclusionPayload(true,'rainfall',key),...scoped.filter(row=>scopes.has(row.scope))]}};
    });
    return {descriptions,qualification:fromSurvey?{event:fromSurvey.event||'',qualified:fromSurvey.qualifies_network_wapug===true}:null,
      config:{sources:descriptions.map(value=>value.reference),start:fields.start.value,end:fields.end.value,
        interval_s:fields.interval.valueAsNumber,max_gap_s:fields.gap.valueAsNumber,suspect_rate_mm_h:fields.suspect.value===''?null:fields.suspect.valueAsNumber}};
  }
  function refresh(){
    available=rainfallSources();updateEvents();renderOptions();
    try{
      const previous=record?.identity||requestIdentity;
      if(previous&&previous!==JSON.stringify(collect()))clear('Source or assessment evidence changed. Run a new comparison.');
    }catch(error){if(record||requestIdentity)clear('Source or assessment evidence changed. Run a new comparison.');}
    renderOptions();
    if(available.length<2)status.textContent='Import at least two observed rainfall channels with resolved units and interval semantics.';
    else if(!record&&!requestIdentity)status.textContent='Choose the gauges and shared project-clock period to compare.';
  }
  function setWindow(){
    const event=events[Number(fields.window.value)-1];
    if(event){fields.start.value=String(event.start).replace(' ','T');fields.end.value=String(event.end).replace(' ','T');}
    clear('Period changed. Run the comparison to use the current window.');renderOptions();
  }
  fields.window.onchange=setWindow;
  for(const name of ['start','end','interval','gap','suspect','clock'])fields[name].onchange=()=>{
    if(name==='start'||name==='end')fields.window.value='';
    if(record||requestIdentity)clear('Settings changed. Run the comparison to use the current inputs.');renderOptions();
  };
  $('hbRainSpatialAdd').onclick=()=>{add();clear('New gauge added. Choose a rainfall channel.');renderOptions();controls.at(-1).select.focus();};
  function appendRow(body,values){
    const row=node('tr');for(const text of values)row.append(node('td',text));body.append(row);
  }
  form.onsubmit=async event=>{
    event.preventDefault();clear('Comparing gauge support in the local worker…');const run=sequence;
    try{
      const data=collect(),identity=JSON.stringify(data);requestIdentity=identity;renderOptions();
      await ensureEngineBoot();
      const result=await engine.call('compare_local_rain_gauges',data.config);
      if(run!==sequence||identity!==JSON.stringify(collect()))return;
      const plotly=await loadVendorScript('Plotly');
      if(run!==sequence||identity!==JSON.stringify(collect()))return;
      const body=$('hbRainSpatialGauges'),pairs=$('hbRainSpatialPairs');body.replaceChildren();pairs.replaceChildren();
      $('hbRainSpatialVariation').textContent='Spatial coefficient of variation for complete event totals · '+
        (result.spatial_cv_percent===null?'Unavailable':format(result.spatial_cv_percent)+'%.');
      result.gauges.forEach((gauge,index)=>appendRow(body,[data.descriptions[index].name,
        format(gauge.valid_seconds/result.duration_seconds*100)+'%',format(gauge.supported_depth_mm),format(gauge.event_depth_mm),
        String(gauge.intervals.length-gauge.complete_intervals),gauge.negative_source_samples+' negative source sample(s) · '+gauge.suspect_intervals+' intense complete bin(s)']));
      result.pairs.forEach(pair=>appendRow(pairs,[data.descriptions[pair.left].name+' / '+data.descriptions[pair.right].name,
        String(pair.common_intervals),format(pair.correlation),format(pair.peak_offset_seconds)]));
      view.hidden=false;
      const traces=result.gauges.map((gauge,index)=>({type:'scatter',mode:'lines+markers',name:esc(data.descriptions[index].name),
        x:result.timestamps,y:[gauge.intervals[0][2]===null?null:0,...gauge.intervals.map(row=>row[2])],connectgaps:false,
        line:{color:palette[index],width:1.8},marker:{size:3},hovertemplate:'%{x}<br>%{y:.5g} mm<extra></extra>'}));
      await plotly.react(plot,traces,{...(window.HydraDesign?.chartLayout()||{}),height:330,hovermode:'x unified',
        margin:{l:72,r:24,t:24,b:64},xaxis:{type:'date',title:{text:'Project clock'}},yaxis:{title:{text:'Accumulated supported depth (mm)'}}},
        plotConfig('hydra-rain-gauge-comparison',{modeBarButtonsToRemove:['select2d','lasso2d']}));
      if(run!==sequence||identity!==JSON.stringify(collect()))return;
      record={data,result,identity};
      status.textContent='Rainfall comparison ready.'+(data.qualification?' WAPUG selection and qualification are unchanged.':'');
    }catch(error){if(run===sequence){clear(conciseErrorMessage(error));renderOptions();}}
    finally{if(run===sequence){requestIdentity=null;renderOptions();}}
  };

  $('hbRainSpatialExport').onclick=()=>{
    try{if(!record||record.identity!==JSON.stringify(collect()))throw new Error();}
    catch{clear('Evidence changed. Recalculate before export.');renderOptions();return;}
    const {data,result}=record,{descriptions,config,qualification}=data;
    const rows=[['Build',buildToken],['Method',result.method],['Start',config.start],['End',config.end],['Interval (s)',config.interval_s],
      ['Maximum source gap (s)',config.max_gap_s],['Suspect intensity screen (mm/h)',config.suspect_rate_mm_h],
      ['WAPUG event',qualification?.event],['Existing network qualification',qualification?.qualified],['Spatial CV (%)',result.spatial_cv_percent],
      ['Gauge','SHA-256','Semantics','Supported seconds','Supported depth (mm)','Full event depth (mm)','Negative samples','Intense complete bins','Source exclusions']];
    result.gauges.forEach((gauge,index)=>{
      const item=descriptions[index];rows.push([item.name,item.fingerprint,item.reference.rainfall_semantics,gauge.valid_seconds,
        gauge.supported_depth_mm,gauge.event_depth_mm,gauge.negative_source_samples,gauge.suspect_intervals,JSON.stringify(item.reference.exclusions)]);
    });
    rows.push(['First gauge','Second gauge','Common complete bins','Pearson r','Second peak offset (s)']);
    result.pairs.forEach(pair=>rows.push([descriptions[pair.left].name,descriptions[pair.right].name,pair.common_intervals,pair.correlation,pair.peak_offset_seconds]));
    rows.push(['Gauge','Start','End','Supported depth (mm)','Supported seconds','Cumulative depth at complete bins (mm)','High intensity candidate']);
    result.gauges.forEach((gauge,index)=>gauge.intervals.forEach((row,i)=>rows.push([descriptions[index].name,result.timestamps[i],result.timestamps[i+1],...row])));
    downloadBlob('hydra-rain-gauge-comparison.csv',rows.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');
  };
  $('hbRainSpatialClose').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{clear();status.textContent='';});
  for(const channel of ['icm:source-pool-changed','icm:rainfall-interpretation-changed','icm:exclusions-changed'])window.addEventListener(channel,()=>{if(dialog.open)refresh();});
  window.addEventListener('icm:route-changed',({detail})=>{if((detail.workspace!=='survey'||detail.page!=='rainfall-check')&&dialog.open)dialog.close();});
  add();add();
  return ()=>{refresh();if(!dialog.open)dialog.showModal();};
}

window.HydraRainfallSpatial={open(){openDialog??=mount();openDialog();}};
})();
