/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
'use strict';

const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const percentage=(value,duration)=>Number.isFinite(value)?(100*value/duration).toFixed(1)+'%':'Unavailable';
const channelLabels={depth:'Depth',velocity:'Velocity',flow:'Flow'};
let openDialog;

function mount(){
  const dialog=node('dialog');dialog.id='hbSurveySuitability';dialog.setAttribute('aria-labelledby','hbSurveySuitabilityTitle');
  dialog.innerHTML=`<article class="panel"><div class="panel-head"><div><h2 id="hbSurveySuitabilityTitle">Review verification suitability</h2>
    <p>Screen one survey location and storm window for verification evidence. A candidate still requires engineering review of the site, event and observed response.</p></div>
    <button type="button" class="btn" id="hbSuitabilityClose">Close review</button></div>
    <form><div class="mapping-grid">
    <label>Survey monitor<select name="monitor" required></select></label><label>Current rainfall event<select name="event" required></select></label>
    <label>Minimum time coverage (%)<input type="number" name="coverage" min="0.001" max="100" value="90" step="any" required></label>
    <label>Maximum source gap (s)<input type="number" name="gap" min="0.001" value="900" step="any" required></label>
    <label class="hb-transform-confirm"><input name="flow" type="checkbox" checked> Require measured flow coverage</label></div>
    <details open><summary>Reviewed instrument ranges and site evidence</summary><div class="mapping-grid">
    <label>Minimum reliable depth (m)<input type="number" name="depth_min" min="0" step="any"></label>
    <label>Maximum reliable depth (m)<input type="number" name="depth_max" min="0" step="any"></label>
    <label>Minimum reliable signed velocity (m/s)<input type="number" name="velocity_min" step="any"></label>
    <label>Maximum reliable signed velocity (m/s)<input type="number" name="velocity_max" step="any"></label>
    <label>Measurement review<select name="review"><option value="unreviewed">Evidence still to review</option><option value="reviewed">Site evidence reviewed</option><option value="hold">Investigate measurement</option></select></label>
    <label>Site or instrument evidence<textarea name="notes" maxlength="2500" rows="3"></textarea></label></div></details>
    <p>Time coverage, instrument ranges and the site decision are project screening criteria. The rainfall decision uses the current Flow Survey network qualification. The evidence below shows both.</p>
    <div class="actions"><button type="submit" class="btn primary">Screen this monitor and period</button></div></form>
    <p id="hbSuitabilityStatus" role="status"></p><section id="hbSuitabilityFindings" hidden>
    <h3 id="hbSuitabilityDecision"></h3><p id="hbSuitabilityContext"></p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Suitability evidence"><table class="data-table"><caption>Independent review checks</caption>
    <thead><tr><th scope="col">Criterion</th><th scope="col">Evidence</th><th scope="col">Screen</th></tr></thead><tbody></tbody></table></div>
    <p>Check that the selected period includes the relevant response and recession before using it in verification. The site and measurement review should include calibration records, potential faults and conditions that affect representativeness.</p>
    <div class="actions"><button type="button" class="btn" id="hbSuitabilityExport">Download suitability audit CSV</button></div></section></article>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id),form=dialog.querySelector('form'),fields=form.elements;
  const status=$('hbSuitabilityStatus'),findings=$('hbSuitabilityFindings'),body=dialog.querySelector('tbody');
  const submit=form.querySelector('[type=submit]'),wb=window.__ICM_WORKBENCH__;
  let monitors=[],events=[],record=null,epoch=0;

  function stale(message){++epoch;record=null;findings.hidden=true;if(message)status.textContent=message;}
  function options(select,items,placeholder){
    const old=select.value;select.replaceChildren(new Option(placeholder,''),...items.map(value=>new Option(value.label,value.key)));
    if(items.some(value=>value.key===old))select.value=old;
    else if(items.length===1)select.value=items[0].key;
  }
  function refresh(){
    const fresh=wb.surveyFresh?.('complete');
    monitors=fresh?wb.survey.batch.monitors||[]:[];
    events=fresh?wb.survey.batch.network?.candidate_wapug_events||[]:[];
    options(fields.monitor,monitors.map(value=>({key:String(value.monitor),label:value.monitor})),'Choose a mapped monitor');
    options(fields.event,events.map((value,index)=>({key:String(index+1),label:'Event '+value.event+' · '+String(value.start).replace('T',' ')+
      ' · '+(value.qualifies_network_wapug?'Network qualified':'Candidate')})),'Choose a current rainfall event');
    submit.disabled=!monitors.length||!events.length;
    if(!fresh)stale('Run a current complete Flow Survey assessment with reviewed gauge mappings before screening verification suitability.');
    else if(!events.length)stale('No rainfall candidate is available in the current Flow Survey. Review its period and rainfall evidence.');
    else if(!record)status.textContent='Choose a monitor and event, then review the instrument ranges and project criteria.';
  }
  function collect(){
    if(!wb.surveyFresh?.('complete'))throw new Error('The Flow Survey inputs changed. Rerun the complete assessment.');
    const monitor=monitors.find(item=>String(item.monitor)===fields.monitor.value),sourceEvent=events[Number(fields.event.value)-1];
    if(!monitor||!sourceEvent)throw new Error('Choose a current monitor and rainfall event.');
    const source=wb.surveyMonitorSources().find(item=>String(item.monitor)===fields.monitor.value)||{monitor:monitor.monitor};
    const gauge=wb.surveyRainSources().find(item=>item.gauge===monitor.rain_gauge)||null;
    const number=key=>fields[key].value===''?null:fields[key].valueAsNumber;
    const range=key=>({minimum:number(key+'_min'),maximum:number(key+'_max')});
    const ranges={depth:range('depth'),velocity:range('velocity')};
    for(const [key,value] of Object.entries(ranges))if(value.minimum!==null&&value.maximum!==null&&value.minimum>value.maximum)
      throw new Error(channelLabels[key]+' range minimum must not exceed its maximum.');
    const settings={minimum_percent:fields.coverage.valueAsNumber,gap_seconds:fields.gap.valueAsNumber,flow_required:fields.flow.checked,
      measurement_review:fields.review.value,ranges};
    const note=fields.notes.value.trim();
    if(settings.measurement_review!=='unreviewed'&&!note)throw new Error('Record the site or instrument evidence for the selected review status.');
    const event={id:sourceEvent.event,start:sourceEvent.start,end:sourceEvent.end,qualified:sourceEvent.qualifies_network_wapug===true,
      operational_gauges:sourceEvent.operational_gauges,spatial_cv_percent:sourceEvent.spatial_cv_percent};
    const response=monitor.event_response?.rows?.find(item=>item.event===event.id);
    const available=allSeries(),fingerprints=[],scopes=new Set(['observed','both','rainfall']);
    function identify(path,column){
      const row=available.find(({item,col})=>item.virtualPath===path&&col===column);
      if(!row)return null;
      fingerprints.push({column,hash:row.item.hash});scopes.add(row.key);return row.key;
    }
    for(const key of Object.keys(channelLabels)){
      source[key+'_source_key']=identify(source[key+'_path']||source.path,source[key+'_col']);
      scopes.add('survey:monitor:'+monitor.monitor+':'+key);
    }
    scopes.add('survey:monitor:'+monitor.monitor+':all');
    if(gauge){gauge.source_key=identify(gauge.path,gauge.column);scopes.add('survey:gauge:'+gauge.gauge+':rainfall');}
    const selected=exclusionPayload(true).filter(item=>item.enabled&&scopes.has(item.scope));
    const stamp=wb.surveyDependencySignature('complete');
    return {worker:{monitor:source,gauge,event,settings,exclusions:selected},fingerprints,note,stamp,monitorGauge:monitor.rain_gauge,
      response:response?.depth_velocity_response||null};
  }
  function display(data,result){
    body.replaceChildren();
    const {checks,duration_seconds:duration,channels,issues}=result,{monitor,event,settings}=data.worker;
    $('hbSuitabilityDecision').textContent=result.status;
    $('hbSuitabilityContext').textContent=monitor.monitor+' · event '+event.id+' · '+event.start+' to '+event.end+' · '+settings.minimum_percent+'% project coverage threshold.'+
      (data.response?' Existing FSAT response evidence: '+data.response+'.':'');
    const add=(label,evidence,state)=>{
      const tr=node('tr'),scope=node('th',label);scope.scope='row';tr.append(scope,node('td',evidence),node('td',state));body.append(tr);
    };
    add('Network rainfall qualification',event.operational_gauges==null?'No current qualification evidence':event.operational_gauges+' operational gauge(s)'+
      (Number.isFinite(event.spatial_cv_percent)?' · spatial CV '+event.spatial_cv_percent.toFixed(1)+'%':''),checks.rainfall_qualification);
    add('Mapped rainfall coverage',(data.monitorGauge||'No mapping')+' · '+percentage(result.rainfall_seconds,duration)+(issues.rainfall?' · '+issues.rainfall:''),checks.mapped_gauge_coverage);
    for(const key of ['depth','velocity','flow']){
      const label=channelLabels[key],channel=channels[key];
      add(label+' coverage',percentage(channel?.supported_seconds,duration)+(issues[key]?' · '+issues[key]:''),checks[key+'_coverage']||'Optional');
      if(key==='flow')continue;
      const limits=settings.ranges[key];
      add(label+' instrument range',channel?.range_verified?percentage(channel.in_range_seconds,duration)+' within '+limits.minimum+' to '+limits.maximum+
        (key==='depth'?' m':' m/s'):'Confirm the installed instrument range.',checks[key+'_range']);
    }
    add('Site and measurement review',data.note||'No site or instrument review evidence entered.',checks.site_measurement_review);
    findings.hidden=false;
  }
  form.oninput=()=>{if(record)stale('Review inputs changed. Run the screen again.');};
  form.onsubmit=async click=>{
    click.preventDefault();stale('Checking retained time support in the local worker…');const run=epoch;submit.disabled=true;
    try{
      const data=collect(),signature=JSON.stringify(data);await ensureEngineBoot();
      const result=await engine.call('survey_verification_suitability',data.worker,'advanced_bridge');
      if(run!==epoch||!dialog.open)return;
      if(signature!==JSON.stringify(collect()))throw new Error('The review inputs changed during calculation. Run the screen again.');
      display(data,result);record={data,result,signature};status.textContent='Suitability screen ready.';
    }catch(error){if(run===epoch)status.textContent=conciseErrorMessage(error);}
    finally{if(run===epoch)submit.disabled=false;}
  };
  $('hbSuitabilityExport').onclick=()=>{
    try{
      if(!record||record.signature!==JSON.stringify(collect()))throw new Error('The evidence changed. Run the screen again before export.');
      const {data,result}=record,{monitor,event,settings,exclusions}=data.worker;
      const rows=[['Build',buildToken],['Method',result.method],['Monitor',monitor.monitor],['Mapped gauge',data.monitorGauge],
        ['WAPUG event',event.id],['Start',event.start],['End',event.end],['Network qualified',event.qualified],
        ['Required coverage (%)',settings.minimum_percent],['Maximum gap (s)',settings.gap_seconds],['FSAT response',data.response],
        ['Status',result.status],['Site or instrument evidence',data.note],['Criterion','Evidence','Screen'],
        ...[...body.rows].map(row=>[...row.cells].map(cell=>cell.textContent)),['Source column','SHA-256'],
        ...data.fingerprints.map(row=>[row.column,row.hash]),['Reviewed exclusions',JSON.stringify(exclusions)]];
      downloadBlob('hydra-survey-verification-suitability.csv',rows.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');
    }catch(error){stale(error.message);}
  };
  $('hbSuitabilityClose').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{stale();status.textContent='';});
  window.addEventListener('icm:source-pool-changed',()=>{if(dialog.open){stale();refresh();}});
  window.addEventListener('icm:route-changed',({detail})=>{if((detail.workspace!=='survey'||detail.page!=='rainfall-check')&&dialog.open)dialog.close();});
  return ()=>{refresh();if(!dialog.open)dialog.showModal();};
}

window.HydraSurveySuitability={open(){openDialog??=mount();openDialog();}};
})();
