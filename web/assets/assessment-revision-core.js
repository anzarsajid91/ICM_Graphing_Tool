/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
'use strict';

const maximumSnapshotSize=4*1024*1024;
const sections=[['basis','Evidence basis'],['inputs','Input'],['results','Result'],['review','Review'],['actions','Action']];
const own=(object,key)=>Object.hasOwn(object,key)?object[key]:undefined;
const object=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));

function text(value,field,limit,optional=false){
  if(typeof value!=='string'||value.length>limit||(!optional&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw new Error(`The assessment snapshot has an invalid ${field}.`);
  return value;
}

function readSnapshot(raw){
  if(typeof raw!=='string'||raw.length===0||raw.length>maximumSnapshotSize)
    throw new Error('Choose an assessment snapshot up to 4 MiB of decoded text.');
  if(new Blob([raw]).size>maximumSnapshotSize)throw new Error('Choose an assessment snapshot up to 4 MiB.');
  let packet;
  try{packet=JSON.parse(raw);}catch{throw new Error('The assessment snapshot is not valid JSON.');}
  if(!object(packet)||own(packet,'schema_version')!==1||!Array.isArray(own(packet,'records')))
    throw new Error('Choose a supported assessment snapshot schema.');
  const name=text(own(packet,'name'),'revision name',160);
  const build=text(own(packet,'build'),'build identity',40);
  if(!/^(?:local|[a-f0-9]{40})$/.test(build))throw new Error('The assessment snapshot has an invalid build identity.');
  const created=text(own(packet,'created')??'','timestamp label',64,true);
  if(packet.records.length>1024)throw new Error('An assessment snapshot can contain up to 1,024 evidence records.');
  let total=0;
  const identities=new Set();
  const records=packet.records.map(record=>{
    if(!object(record))throw new Error('The assessment snapshot has an invalid evidence record.');
    const id=text(own(record,'id'),'evidence identity',768);
    if(identities.has(id))throw new Error('The assessment snapshot contains duplicate evidence identities.');
    identities.add(id);
    const workspace=text(own(record,'workspace'),'workspace',96), title=text(own(record,'title'),'evidence title',384);
    const method=text(own(record,'method')??'','method version',192,true);
    const content=Object.fromEntries(sections.map(([key])=>{
      const fields=own(record,key);
      if(!Array.isArray(fields)||fields.length>2048||(total+=fields.length)>32000)
        throw new Error('The assessment snapshot exceeds the supported evidence field limit.');
      const unique=new Set();
      return [key,fields.map(field=>{
        if(!object(field))throw new Error('The assessment snapshot contains an invalid evidence field.');
        const identifier=text(own(field,'key'),'field identity',384);
        if(unique.has(identifier))throw new Error('The assessment snapshot contains duplicate field identities.');
        unique.add(identifier);
        const label=text(own(field,'label'),'field label',384);
        const unit=text(own(field,'unit')??'','result unit',160,true), value=own(field,'value');
        if(typeof value==='string')text(value,'value',10000,true);
        else if(value!==null&&typeof value!=='boolean'&&!Number.isFinite(value))
          throw new Error('The assessment snapshot has an invalid value.');
        return {key:identifier,label,unit,value};
      })];
    }));
    return {id,workspace,title,method,...content};
  });
  return {schema_version:1,name,build,created,records};
}

function compareSnapshots(baseline,current){
  const earlier=new Map(baseline.records.map(record=>[record.id,record]));
  const later=new Map(current.records.map(record=>[record.id,record]));
  const rows=[];
  const index=fields=>new Map(fields.map(field=>[field.key,field]));
  const sameValue=(left,right)=>left?.value===right?.value&&left?.unit===right?.unit;
  function methodReason(left,right){
    if(left.method!==right.method)return 'The recorded calculation method changed.';
    if(!left.method)return 'The calculation method is unavailable.';
    const other=index(right.basis);
    return left.basis.length!==other.size||left.basis.some(field=>!sameValue(field,other.get(field.key)))?
      'The recorded assessment basis changed.':null;
  }
  for(const id of new Set([...earlier.keys(),...later.keys()])){
    const left=earlier.get(id),right=later.get(id);
    const {workspace,title}=right||left;
    const record=(group,field,status,baselineValue,currentValue,note='')=>
      rows.push({id,workspace,title,group,field,status,baseline:baselineValue,current:currentValue,note});
    if(!left||!right){
      record('Evidence','Evidence record',right?'Added':'Removed',left?.title??null,right?.title??null);
      continue;
    }
    record('Method','Method version',left.method===right.method?'Unchanged':'Changed',left.method||null,right.method||null);
    const reason=methodReason(left,right);
    for(const [key,group] of sections){
      const first=index(left[key]),second=index(right[key]);
      for(const fieldId of new Set([...first.keys(),...second.keys()])){
        const a=first.get(fieldId),b=second.get(fieldId),field=(b||a).label;
        const render=cell=>cell?.value==null?null:cell.unit?`${cell.value} ${cell.unit}`:cell.value;
        const issue=key!=='results'?null:reason||(!a||!b||a.value===null||b.value===null?'Comparable values are missing.':
          a.unit!==b.unit?'The recorded result unit changed.':typeof a.value!==typeof b.value?'The reported value types differ.':null);
        const status=issue?'Not comparable':!a?'Added':!b?'Removed':sameValue(a,b)?'Unchanged':'Changed';
        record(group,field,status,render(a),render(b),issue||'');
      }
    }
  }
  return rows;
}

const checkedValue=value=>typeof value==='number'&&!Number.isFinite(value)?null:value??null;
function fields(entries){
  return entries.map(([label,value,unit])=>({key:label,label,value:checkedValue(value),unit:unit||''}));
}
function evidence(id,workspace,title,method,{basis=[],inputs=[],results=[],review=[],actions=[]}={}){
  return {id,workspace,title,method,...Object.fromEntries(Object.entries({basis,inputs,results,review,actions}).map(([key,values])=>[key,fields(values)]))};
}

function collectAssessment(name,note,action){
  const settings=workspaceObject(false),analysis=settings.analysis||{},signature=analysisSignature();
  const analysisBasis=[['Project clock',settings.time_basis],['Start',analysis.analysis_start],['End',analysis.analysis_end],
    ['Maximum sample gap',analysis.max_gap_seconds,'s'],['Applied exclusions',JSON.stringify(settings.exclusions||[])]];
  const sourceMetadata=source=>JSON.stringify([source?.sha256,source?.column,source?.quantity,source?.unit,source?.reference]);
  const notes=$('reviewNotes')?.value||'';
  const records=[evidence('project-context','Reports','Assessment record','workspace-context-v1',{
    inputs:[...analysisBasis,['Model shift',analysis.time_offset_minutes,'min'],['Rainfall scale',analysis.rain_factor]],
    review:[['Workspace review note',notes],['Revision review note',note]],actions:[['Engineer action',action]]
  }),...(window.HydraDesignCalculations?.assessmentRecords()||[])];
  const comparison=state.comparisonSnapshot;
  if(comparison?.signature===signature){
    const observed=comparison.config?.mapping?.observed;
    for(const result of comparison.results){
      const {model,result:outcome,error}=result;
      if(!model)continue;
      const title=`${model.asset_id||model.display_name||'Scenario'} · ${model.column}`;
      const unit=outcome?.comparison_unit||'';
      const values=outcome?.metrics||{};
      const quantities=[['RMSE',values.rmse,unit],['MAE',values.mae,unit],['Mean bias',values.mean_bias,unit],
        ['NSE',values.nse],['KGE 2009',values.kge_2009]];
      records.push(evidence('verification:'+title,'Verification',title,outcome?.pairing_method||'',{
        basis:[...analysisBasis,['Observed source',sourceMetadata(observed)],['Quantity',outcome?.observed_quantity],
          ['Metric weighting',outcome?.metric_weighting],['Requested support',outcome?.requested_seconds,'s'],
          ['Common valid support',outcome?.valid_seconds,'s'],['Coverage',outcome?.coverage_fraction]],
        inputs:[['Model source',sourceMetadata(model)],['Model shift',analysis.time_offset_minutes,'min']],
        results:quantities,review:[['Calculation status',outcome?.calculation_status||'Unavailable']],
        actions:error?[['Result investigation',error]]:[]
      }));
    }
  }else if(comparison)records.push(evidence('stale:verification','Verification','Comparison freshness','',{
    actions:[['Recalculate','Verification evidence is stale for the current inputs.']]}));

  const spills=state.spillSnapshot;
  if(spills?.signature===signature){
    for(const [key,label] of [['observed','Observed EDM'],['model','Modelled spill']]){
      const result=spills.results[key];
      for(const year of result?.yearly_summary||[]){
        const source=workspaceSeries(spills.evidenceSources[key]);
        const id=`spill:${key}:${source?.asset_id||source?.column||label}:${year.year}`;
        records.push(evidence(id,'Spills',`${label} · ${year.year}`,result.method||result.count_method||'',{
          basis:[...analysisBasis,['Asset',source?.asset_id||source?.column],['Period start',year.analysis_start],
            ['Period end',year.analysis_end],['Count support',year.count_status],['Valid time',year.valid_hours,'h'],
            ['Unknown time',year.unknown_hours,'h'],['Excluded time',year.excluded_hours,'h']],
          inputs:[['Source',sourceMetadata(source)],['Hydraulic threshold',result.threshold,source?.unit]],
          results:[['12/24 count',year.spill_count],['Physical duration',year.duration_hours,'h']]
        }));
      }
    }
  }else if(spills)records.push(evidence('stale:spills','Spills','Spill evidence freshness','',{
    actions:[['Recalculate','Spill evidence is stale for the current inputs.']]}));

  const reviews=diagnostic.verificationReviews?.report()||[];
  for(const review of reviews)records.push(evidence('review:'+JSON.stringify([review.asset,review.scenario,review.period]),
    'Verification',`${review.asset} · ${review.scenario}`,'engineer-review-v1',{
      basis:[['Period start',review.period?.start],['Period end',review.period?.end]],
      review:[['Decision',review.decision],['Comments',review.comments],['References',review.references]]
    }));

  const survey=diagnostic.survey;
  if(survey?.batch&&diagnostic.surveyFresh?.('complete')){
    const monitors=survey.batch.monitors||[],evaluated=monitors.filter(row=>row.status==='complete').length;
    records.push(evidence('survey:overview','Flow survey','Complete survey assessment','',{
      basis:[...analysisBasis,['Association source',JSON.stringify(survey.associationSource)]],
      results:[['Monitor count',monitors.length],['Fully assessed monitors',evaluated],['Partial or unavailable monitors',monitors.length-evaluated],
        ['Network-qualified WAPUG events',survey.batch.network?.qualified_wapug_events?.length??0]]
    }));
  }else if(survey?.batch)records.push(evidence('stale:survey','Flow survey','Survey evidence freshness','',{
    actions:[['Recalculate','The complete survey assessment is stale for the current inputs.']]}));

  return readSnapshot(JSON.stringify({schema_version:1,name,build:buildToken,created:new Date().toISOString(),records}));
}

function mount(){
  const root=document.getElementById('tab-assessment-revision');
  root.innerHTML=`<article class="panel"><div class="panel-head"><div><h2>Assessment revision comparison</h2>
    <p>Capture current evidence or open a local snapshot. Compare reviewed inputs, results and decisions with their recorded basis.</p></div></div>
    <div class="mapping-grid"><label>Revision name<input id="hbAssessmentName" type="text" maxlength="160"></label>
    <label>Revision review note<textarea id="hbAssessmentNote" maxlength="10000" rows="3"></textarea></label>
    <label>Outstanding engineering action<textarea id="hbAssessmentAction" maxlength="10000" rows="3"></textarea></label></div>
    <div id="hbAssessmentSides" class="mapping-grid"></div>
    <p id="hbAssessmentStatus" role="status"></p>
    <div class="actions"><button id="hbAssessmentCompare" class="primary" type="button" disabled>Compare assessment snapshots</button></div>
    <section id="hbAssessmentComparison" hidden><div class="actions">
      <label>Change status<select id="hbAssessmentFilter" aria-label="Change status"><option value="">All changes</option></select></label>
      <button id="hbAssessmentPrev" type="button">Previous page</button><button id="hbAssessmentNext" type="button">Next page</button>
      <button id="hbAssessmentCsv" type="button">Download revision audit CSV</button>
      <button id="hbAssessmentReport" type="button">Download revision report</button></div>
      <p id="hbAssessmentPage" role="status"></p><div id="hbAssessmentRows"></div></section>
  </article>`;
  const $=id=>root.querySelector('#'+id),status=$('hbAssessmentStatus'),compare=$('hbAssessmentCompare'),filter=$('hbAssessmentFilter');
  const comparison=$('hbAssessmentComparison'),previous=$('hbAssessmentPrev'),next=$('hbAssessmentNext');
  const sides=new Map(),pageSize=30;
  let rows=[],page=0;
  const elem=(tag,caption)=>{const node=document.createElement(tag);if(caption!==undefined)node.textContent=caption;return node;};
  function reset(){
    rows=[];page=0;comparison.hidden=true;compare.disabled=Array.from(sides.values()).some(side=>!side.packet);
  }
  function announce(side,packet){
    side.packet=packet;side.download.disabled=side.clear.disabled=!packet;reset();
    side.summary.textContent=packet?`${packet.name} · ${packet.records.length} evidence records · ${packet.build.slice(0,12)}`:'No snapshot selected.';
  }
  for(const name of ['Baseline','Proposed']){
    const group=elem('fieldset'),upload=elem('input'),label=elem('label','Open '+name.toLowerCase()+' snapshot');
    upload.type='file';upload.accept='.json,application/json';label.append(upload);
    const summary=elem('p'),capture=elem('button','Capture '+name.toLowerCase()),download=elem('button','Download '+name.toLowerCase()+' snapshot');
    const clear=elem('button','Clear '+name.toLowerCase());
    capture.type=download.type=clear.type='button';
    const side={packet:null,summary,download,clear,generation:0};sides.set(name,side);announce(side,null);
    capture.onclick=()=>{
      ++side.generation;
      try{
        announce(side,collectAssessment($('hbAssessmentName').value.trim(),$('hbAssessmentNote').value,$('hbAssessmentAction').value));
        status.textContent=name+' assessment captured from current local evidence.';
      }catch(error){status.textContent=error.message;}
    };
    upload.onchange=async()=>{
      const generation=++side.generation,file=upload.files[0];upload.value='';if(!file)return;
      try{
        if(file.size>maximumSnapshotSize)throw new Error('Choose an assessment snapshot up to 4 MiB.');
        const packet=readSnapshot(await file.text());
        if(generation!==side.generation)return;
        announce(side,packet);status.textContent=name+' snapshot opened locally.';
      }catch(error){if(generation===side.generation)status.textContent=error.message;}
    };
    download.onclick=()=>{if(side.packet)downloadBlob('hydra-'+name.toLowerCase()+'-assessment.json',JSON.stringify(side.packet),'application/json');};
    clear.onclick=()=>{++side.generation;announce(side,null);status.textContent=name+' snapshot cleared.';};
    const actions=elem('div');actions.className='actions';actions.append(capture,download,clear);
    group.append(elem('legend',name),label,summary,actions);$('hbAssessmentSides').append(group);
  }
  const labels=['Workspace','Evidence','Category','Field','Baseline','Proposed','Change','Reason'];
  const cells=row=>[row.workspace,row.title,row.group,row.field,row.baseline,row.current,row.status,row.note];
  const display=value=>value===null?'Unavailable':String(value);
  function renderTable(records){
    const wrapper=elem('div'),table=elem('table'),heading=table.createTHead().insertRow();
    wrapper.className='table-wrap';table.createCaption().textContent='Assessment changes';
    for(const label of labels){const th=elem('th',label);th.scope='col';heading.append(th);}
    const body=table.createTBody();
    for(const record of records){const row=body.insertRow();for(const value of cells(record))row.insertCell().textContent=display(value);}
    wrapper.append(table);return wrapper;
  }
  function render(){
    const filtered=filter.value?rows.filter(row=>row.status===filter.value):rows;
    const shown=filtered.slice(page*pageSize,page*pageSize+pageSize);
    previous.disabled=page===0;next.disabled=(page+1)*pageSize>=filtered.length;
    $('hbAssessmentRows').replaceChildren(renderTable(shown));
    $('hbAssessmentPage').textContent=filtered.length?`Showing ${page*pageSize+1}–${page*pageSize+shown.length} of ${filtered.length} entries.`:'No matching entries.';
  }
  compare.onclick=()=>{
    const [a,b]=[...sides.values()].map(side=>side.packet);
    rows=compareSnapshots(a,b);page=0;
    filter.replaceChildren(new Option('All changes',''),...['Changed','Not comparable','Added','Removed','Unchanged'].map(state=>new Option(state,state)));
    status.textContent=`Compared ${a.name} with ${b.name}. Review method, support and unit differences before drawing conclusions.`;
    comparison.hidden=false;render();
  };
  filter.onchange=()=>{page=0;render();};previous.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};
  $('hbAssessmentCsv').onclick=()=>{
    const [a,b]=[...sides.values()].map(side=>side.packet);
    const output=[['Baseline',a.name,a.build],['Proposed',b.name,b.build],labels,...rows.map(cells)];
    downloadBlob('hydra-assessment-revision.csv',output.map(line=>line.map(value=>ICMSafeCSV.cell(value??'')).join(',')).join('\r\n'),'text/csv');
  };
  $('hbAssessmentReport').onclick=()=>{
    if(rows.length>5000){status.textContent='This comparison exceeds the 5,000-entry HTML limit. Download the full revision audit CSV.';return;}
    const [a,b]=[...sides.values()].map(side=>side.packet);
    const introduction=`<h2>${esc(a.name)} and ${esc(b.name)}</h2><p>Baseline revision ${esc(a.build)} · Proposed revision ${esc(b.build)}</p>`+
      '<p>Results with different methods, assessment support or units require engineering review.</p>';
    const report=reportShell('Hydra Bench — Assessment Revision Review','Change register with evidence and applicability',introduction+renderTable(rows).outerHTML,true);
    downloadBlob('hydra-assessment-revision.html',report,'text/html');
  };
}

globalThis.HydraAssessmentRevision={readSnapshot,compareSnapshots,mount};
})();
