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
    if(left.basis.some(field=>field.key==='Reviewed scope supplied'&&field.value===false)||other.get('Reviewed scope supplied')?.value===false)
      return 'A reviewed assessment scope or dated period is unavailable.';
    if(left.basis.some(field=>field.key==='Complete discharge support'&&field.value===false)||other.get('Complete discharge support')?.value===false)
      return 'Complete discharge support is unavailable for a calendar volume comparison.';
    if(left.basis.some(field=>field.key==='Complete verification window'&&field.value===false)||other.get('Complete verification window')?.value===false)
      return 'The verification comparison requires the full event window with zero exclusions.';
    if(left.basis.some(field=>field.key==='Unique verification baseline'&&field.value===false)||other.get('Unique verification baseline')?.value===false)
      return 'More than one scenario uses this observed record and event. Review the pairings in Verification.';
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

const recordedJSON=value=>value==null?null:JSON.stringify(value,(_key,item)=>object(item)?
  Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);

function storageAssessmentRecords(result,settings,workspaceBasis){
  const physical=result.physical||{};
  const basis=[...workspaceBasis,['Coverage start',physical.analysis_start],['Coverage end',physical.analysis_end],
    ['Supported level time',physical.valid_seconds,'s'],['Unknown level time',physical.unknown_seconds,'s'],
    ['Excluded level time',physical.excluded_seconds,'s'],['Level quantity',result.level_contract?.quantity],
    ['Threshold',result.threshold_canonical_m,'m'],['Target 12/24 count',settings.target_count],
    ['Applied source exclusions',recordedJSON(settings.exclusions)]];
  const sources=[['Level source',recordedJSON(settings.level)],['Flow source',recordedJSON(settings.flow)],
    ['Level conversion',recordedJSON(result.level_contract)],['Flow conversion',recordedJSON(result.flow_contract)],
    ['Entered threshold',settings.threshold,settings.threshold_unit]];
  const saved=[evidence('storage:assessment','Spills','Storage Assessment',result.method,{
    basis,inputs:sources,results:[['Assessment status',result.calculation_status]],
    review:[['Volume accounting',result.volume_year_basis]]
  })];
  for(const year of result.screening||[]){
    saved.push(evidence(`storage:episode:${year.year}`,'Spills',`Storage Assessment · episode year ${year.year}`,result.method,{
      basis:[...basis,['Volume attribution','Episode year'],['Discharge coverage fraction',year.coverage_fraction]],
      results:[['Required storage',year.required_storage_m3,'m³'],['Physical episodes',year.physical_blocks],
        ['Original 12/24 count',year.compatibility_spill_count],['Remaining 12/24 count',year.remaining_spill_count],
        ['Episode-attributed discharge',year.annual_block_volume_m3,'m³'],['Screening status',year.status]],
      review:[['Applicability',year.reason]]
    }));
  }
  for(const year of result.calendar_volumes||[]){
    saved.push(evidence(`storage:calendar:${year.year}`,'Spills',`Storage Assessment · calendar year ${year.year}`,result.method,{
      basis:[...basis,['Volume attribution','Calendar year'],['Complete discharge support',year.status==='complete']],
      results:[['Physical discharge',year.volume_m3,'m³'],['Retained supported discharge',year.volume_m3_partial,'m³'],
        ['Volume status',year.status]]
    }));
  }
  return saved;
}

function reportSource(source,includeName=true){
  if(!source)return null;
  const {path,id,name,reference,...provenance}=source;
  return includeName?{name,...provenance}:provenance;
}

function detrimentAssessmentRecord(result,row,{assetKind='report',baseline=null,proposal=null}={}){
  const anchor=reportSource(result.scenario_a),candidate=reportSource(result.scenario_b);
  const categories={flooding:'Flood volume',level:'Maximum level',spill:result.count_unit==='spills'?'Spill count':'Exported count'};
  const category=categories[result.kind],title=[row.asset_id,category,proposal].filter(Boolean).join(' · ');
  const reviewedScope=[anchor,candidate].every(source=>Boolean(source.scope||source.period_start&&source.period_end));
  const basis=[['Asset identity',assetKind],['Reviewed scope supplied',reviewedScope],['Reviewed common baseline revision',baseline],
    ['Baseline extraction',recordedJSON(reportSource(result.scenario_a,false))],
    ['Proposal scope',candidate.scope],['Proposal period start',candidate.period_start],['Proposal period end',candidate.period_end],
    ['Proposal datum',candidate.datum],['Proposal template',candidate.template],
    ['Proposal flood volume interpretation',candidate.flood_measure],['Proposal attribute filter',candidate.attribute_value],
    ['Criteria',recordedJSON(result.criteria)],['New flooding policy',result.new_flooding_policy],
    ['Spill combination policy',result.spill_combination_policy],['Count tolerance',result.count_tolerance,row.unit],
    ['Duration tolerance',result.duration_tolerance_hours,'h'],['Counting mode',result.counting_mode],
    ['Date convention',result.date_convention],['Boundary policy',result.boundary_policy],
    ['Ground extraction',recordedJSON(reportSource(result.ground_source,false))],
    ['Baseline detail extraction',recordedJSON(reportSource(result.detail_source_a,false))]];
  const results=[[`${category} A`,row.a,row.unit],[`${category} B`,row.b,row.unit],[`Change in ${category.toLowerCase()}`,row.delta,row.unit],
    ['Assessment status',row.status],['Assessment flags',row.flags.join('; ')]];
  if(result.kind==='level')results.push(['Freeboard A',row.freeboard_a,'m'],['Freeboard B',row.freeboard_b,'m'],
    ['Change in freeboard',row.freeboard_change,'m']);
  if(result.kind==='spill')results.push(['Actual duration A',row.duration_a_hours,'h'],['Actual duration B',row.duration_b_hours,'h'],
    ['Change in actual duration',row.duration_delta_hours,'h'],['Count criterion status',row.count_status],
    ['Duration criterion status',row.duration_status]);
  return evidence('detriment:'+JSON.stringify([result.kind,assetKind,row.asset_id,proposal]),'Detriment assessment',title,result.method,{
    basis,inputs:[['Baseline report',anchor.name],['Proposed extraction',recordedJSON(candidate)],
      ['Proposal detail extraction',recordedJSON(reportSource(result.detail_source_b))],
      ['Baseline raw report values',recordedJSON(row.evidence_a)],['Proposed raw report values',recordedJSON(row.evidence_b)]],results
  });
}

function includeDetriment(records,assetId){
  let matches=0,bytes=new Blob([JSON.stringify(records)]).size;
  const exact=row=>!assetId||row.asset_id===assetId;
  function append(result,row,identity){
    const record=detrimentAssessmentRecord(result,row,identity);
    bytes+=new Blob([JSON.stringify(record)]).size+1;
    if(records.length>=1024||bytes>=maximumSnapshotSize)
      throw new Error('The snapshot exceeds its evidence limit. Specify an exact Detriment asset ID or use the full Detriment audit export.');
    records.push(record);matches++;
  }
  for(const {result,assetIds} of window.ICMDetriment?.assessmentPairs()||[]){
    const selected=new Set(assetIds);
    for(const row of result.rows)if(exact(row)&&(!selected.size||selected.has(row.asset_id)))append(result,row);
  }
  for(const {assetKind,baseline,data} of window.HydraDetrimentScenarios?.assessmentGroups()||[]){
    for(const {label:proposal,result} of data.scenarios){
      for(const row of result?.rows||[])if(exact(row))append(result,row,{assetKind,baseline,proposal});
    }
  }
  if(assetId&&!matches)throw new Error('No current Detriment evidence matched that exact asset ID. Review the assessment and its applied asset list.');
}

function verificationMatrixRecords(snapshot){
  if(!snapshot)return [];
  const keys=['coverage','peak','volume','timing'],labels={coverage:'Common event coverage',peak:'Peak error',volume:'Volume error',timing:'Peak delay'};
  const identity=row=>JSON.stringify([snapshot.quantity,row.observed_sha256,row.observed_column,row.start,row.end]);
  const count=new Map();
  for(const row of snapshot.rows){const key=identity(row);count.set(key,(count.get(key)||0)+1);}
  return snapshot.rows.map(row=>{
    const key=identity(row),unique=count.get(key)===1,raw=row.evidence||{};
    const checks=keys.filter(item=>Object.hasOwn(row.checks,item)).map(item=>[labels[item],row.checks[item]]);
    const full=row.complete_support&&raw.status==='complete'&&raw.requested_seconds===raw.common_support_seconds&&raw.excluded_seconds===0;
    const id='verification-matrix:'+key+(unique?'':':'+JSON.stringify([row.model_sha256,row.model_column]));
    return evidence(id,'Verification',`${row.observed_name} · ${row.start} to ${row.end}`,snapshot.method,{
      basis:[['Quantity',snapshot.quantity],['Observed channel',row.observed_column],['Observed SHA-256',row.observed_sha256],
        ['Event start',row.start],['Event end',row.end],['Rainfall qualification',snapshot.rainfall_basis],
        ['Rainfall evidence SHA-256',row.rainfall_provenance],['Maximum sample gap',snapshot.maximum_gap_seconds,'s'],
        ['Model clock shift',snapshot.model_offset_minutes,'min'],['Project criteria',recordedJSON(snapshot.criteria)],
        ['Unique verification baseline',unique],['Complete verification window',Boolean(full)],['Requested support',raw.requested_seconds,'s'],
        ['Common support',raw.common_support_seconds,'s'],['Exclusions',raw.excluded_seconds,'s'],['Observed peak',raw.observed_peak,raw.unit],
        ['Observed event volume',raw.observed_volume_m3,'m³']],
      inputs:[['Model source',row.model_name],['Model channel',row.model_column],['Model SHA-256',row.model_sha256],
        ['Observed exclusions',recordedJSON(row.observed_exclusions)],['Model exclusions',recordedJSON(row.model_exclusions)]],
      results:[['Modelled peak',raw.modelled_peak,raw.unit],['Modelled event volume',raw.modelled_volume_m3,'m³'],
        ...checks.map(([label,metric])=>[label,metric.status==='Withheld'?null:metric.value,metric.unit])],
      review:[['Engineer comment',row.comment],...checks.map(([label,metric])=>[label+' review',[metric.status,metric.reason].filter(Boolean).join(' · ')])],
      actions:row.error?[['Result investigation',row.error]]:[]
    });
  });
}

function surveyReviewFields(state){
  const review=state?.review;
  return review?[['Review evidence',state.review_current?'Current':'Historical'],['Recorded engineer rating',review.reviewed_status],
    ['Reported rating',state.review_current?state.reviewed:state.calculated],['Calculated at review',review.calculated_status_at_review],
    ['Engineer rationale',review.reason],['Reviewer',review.reviewer],['Reviewed at',review.reviewed_at]]:[];
}

function* surveyAssessmentRecords(batch,balance,context,analysisBasis,monitorId,sourceAt,reviews){
  const specs=context.monitor_sources||[],rain=context.rain_sources||[];
  const names=new Map((context.association||[]).map(entry=>[entry.monitor,entry]));
  const monitorSources=new Map(specs.map(({path,monitor,match_status,depth_col,velocity_col,flow_col})=>
    [monitor,{source:sourceAt(path),match:match_status,depth:depth_col,velocity:velocity_col,flow:flow_col}]));
  const gaugeSources=new Map(rain.map(({path,gauge,column,rainfall_semantics,match_status})=>
    [gauge,{source:sourceAt(path),column,interpretation:rainfall_semantics,match:match_status}]));
  const networkGauges=recordedJSON([...gaugeSources]);
  const base=[...analysisBasis,['Workbook SHA-256',context.association_source?.sha256],['Workbook sheet',context.association_source?.sheet],
    ['Population basis exceeds 50,000',context.population_above_50k],['Rain gauge fault cutoff applied',context.apply_fault_cutoff]];
  const applies=name=>!monitorId||name===monitorId;
  if(batch&&!monitorId){
    const monitors=batch.monitors||[],complete=monitors.filter(row=>row.status==='complete').length,network=batch.network;
    yield evidence('survey:overview','Flow survey','Complete survey assessment',network?.method||'',{
      basis:[...base,['Rainfall criteria',recordedJSON(network?.criteria)],['Mapped gauges',networkGauges]],
      results:[['Monitor count',monitors.length],['Fully assessed monitors',complete],['Partial or unavailable monitors',monitors.length-complete],
        ['Network-qualified WAPUG events',network?.qualified_wapug_events?.length??0]]
    });
  }
  for(const monitor of batch?.monitors||[]){
    if(!applies(monitor.monitor))continue;
    const id=monitor.monitor,weekly=monitor.weekly,response=monitor.event_response,comment=reviews?.monitorComment(id);
    const basis=[...base,['Monitor ID',id],['Hydraulic channels',recordedJSON(monitorSources.get(id))],
      ['Mapped rainfall gauge',monitor.rain_gauge],['Mapped rain source',recordedJSON(gaugeSources.get(monitor.rain_gauge))],
      ['Workbook diameter',monitor.diameter_mm,'mm'],['Channel interpretation',recordedJSON(monitor.contracts)]];
    yield evidence('survey:monitor:'+id,'Flow survey',id,weekly?.method||'complete-survey-context-v1',{
      basis,results:[['Survey assessment status',monitor.status],['Assessed weeks',weekly?.weeks?.length],['Response events',response?.rows?.length]],
      review:comment?[['Monitor engineering comment',comment.text],['Comment author',comment.author],['Comment recorded at',comment.updated_at]]:[],
      actions:monitor.reason?[['Investigation',monitor.reason]]:[]
    });
    for(const week of weekly?.weeks||[]){
      yield evidence('survey:week:'+JSON.stringify([id,week.week_ending]),'Flow survey',`${id} · week ending ${week.week_ending}`,weekly.method,{
        basis:[...basis,['Week start',week.start],['Week end',week.end],['Weekly criteria',recordedJSON(weekly.criteria)]],
        results:[['Rainfall',week.rain_total_mm,'mm'],['Depth coverage',week.depth_coverage_percent,'%'],
          ['Velocity coverage',week.velocity_coverage_percent,'%'],['Flow coverage',week.flow_coverage_percent,'%'],
          ['Assessable samples',week.assessable_samples],['Excluded samples',week.excluded_samples],['RAG decision',week.rag],
          ['WAPUG storm',week.wapug_storm],['Survey suitability',week.iw_suitability]],
        review:[['Decision basis',week.decision_path],...surveyReviewFields(reviews?.reviewedWeekState('monitor-week',id,week))]
      });
    }
    for(const event of response?.rows||[]){
      yield evidence('survey:event:'+JSON.stringify([id,event.event,event.event_start,event.event_end]),'Flow survey',`${id} · ${event.event_start}`,response.method,{
        basis:[...basis,['Event start',event.event_start],['Event end',event.event_end],['Event label',event.event],
          ['Event criteria',recordedJSON(response.criteria)],['Network qualification criteria',recordedJSON(batch.network?.criteria)],
          ['Network rainfall sources',networkGauges]],
        results:[['Depth and velocity response',event.depth_velocity_response],['Depth at peak flow',event.min_depth_at_peak_flow_m,'m'],
          ['Minimum depth criterion',event.min_depth_threshold_m,'m'],['Depth criterion status',event.min_depth_pass],
          ['Response ratio',event.response_ratio],['Response ratio criterion',event.response_ratio_threshold],
          ['Ratio criterion status',event.response_ratio_pass]],review:[['Recorded comments',(event.comments||[]).join(' · ')]]
      });
    }
  }
  for(const row of balance?.rows||[]){
    if(!applies(row.downstream_monitor))continue;
    const id=row.downstream_monitor,upstream=row.upstream_monitors||[];
    const scope=[id,...upstream].map(name=>[name,monitorSources.get(name),names.get(name)]);
    yield evidence('survey:balance:'+JSON.stringify([id,row.week_ending]),'Flow survey',`${id} · volume balance ${row.week_ending}`,balance.method,{
      basis:[...base,['Monitored branch',recordedJSON(scope)],['Week ending',row.week_ending],['Scope start',balance.period?.start],
        ['Scope end',balance.period?.end],['Balance criteria',recordedJSON(balance.criteria)],['Least common coverage',row.minimum_coverage_fraction]],
      results:[['Downstream volume',row.downstream_volume_m3,'m³'],['Upstream volume',row.upstream_sum_m3,'m³'],
        ['Deficit',row.deficit_m3,'m³'],['Deficit percentage',row.deficit_percent,'%'],['Balance ratio',row.balance_ratio],
        ['Analytical RAG',row.rag],['Legacy FSAT status',row.legacy_fsat_status]],
      review:[['RAG rationale',row.rag_reason],['Applicability',balance.caveat],...surveyReviewFields(reviews?.reviewedBalanceState(row))],
      actions:[['Review',row.recommendation]]
    });
  }
}

async function collectAssessment(name,note,action,assetId,monitorId){
  text(name,'revision name',160);
  const verification=await window.HydraVerificationMatrix?.assessmentSnapshot(name);
  const settings=workspaceObject(false),analysis=settings.analysis||{},signature=analysisSignature();
  const analysisBasis=[['Project clock',settings.time_basis],['Start',analysis.analysis_start],['End',analysis.analysis_end],
    ['Maximum sample gap',analysis.max_gap_seconds,'s'],['Applied exclusions',JSON.stringify(settings.exclusions||[])]];
  const sourceMetadata=source=>JSON.stringify([source?.sha256,source?.column,source?.quantity,source?.unit,source?.reference]);
  const notes=$('reviewNotes')?.value||'';
  const records=[evidence('project-context','Reports','Assessment record','workspace-context-v1',{
    inputs:[...analysisBasis,['Model shift',analysis.time_offset_minutes,'min'],['Rainfall scale',analysis.rain_factor],
      ['Detriment capture asset ID',assetId||null],['Survey capture monitor ID',monitorId||null]],
    review:[['Workspace review note',notes],['Revision review note',note]],actions:[['Engineer action',action]]
  }),...(window.HydraDesignCalculations?.assessmentRecords()||[]),...verificationMatrixRecords(verification)];
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

  if(state.storage){
    const storageSignature=storageInputSignature();
    if(state.storageSignature===storageSignature)records.push(...storageAssessmentRecords(state.storage,JSON.parse(storageSignature),analysisBasis));
    else records.push(evidence('stale:storage','Spills','Storage evidence freshness','',{
      actions:[['Recalculate','Storage evidence is stale for the current inputs.']]}));
  }

  const reviews=diagnostic.verificationReviews?.report()||[];
  for(const review of reviews)records.push(evidence('review:'+JSON.stringify([review.asset,review.scenario,review.period]),
    'Verification',`${review.asset} · ${review.scenario}`,'engineer-review-v1',{
      basis:[['Period start',review.period?.start],['Period end',review.period?.end]],
      review:[['Decision',review.decision],['Comments',review.comments],['References',review.references]]
    }));

  const survey=diagnostic.survey,batch=diagnostic.surveyFresh?.('complete')?survey.batch:null;
  const separateBalance=diagnostic.surveyFresh?.('balance')?survey.balance:null;
  if(batch||separateBalance){
    const context=JSON.parse(batch?survey.batchSignature:survey.balanceSignature);
    const byPath=new Map([...state.files.values()].filter(item=>item.status==='ready').map(item=>[item.virtualPath,item.hash]));
    let bytes=new Blob([JSON.stringify(records)]).size,matches=0;
    for(const record of surveyAssessmentRecords(batch,separateBalance||batch?.volume_balance,context,analysisBasis,monitorId,
      path=>byPath.get(path)||null,diagnostic.workflow26)){
      bytes+=new Blob([JSON.stringify(record)]).size+1;
      if(records.length>=1024||bytes>=maximumSnapshotSize)
        throw new Error('The snapshot exceeds its evidence limit. Specify an exact Flow survey monitor ID or use the Flow survey report.');
      records.push(record);matches++;
    }
    if(monitorId&&!matches)throw new Error('No current survey evidence matched that exact monitor ID.');
  }else if(monitorId)throw new Error('Calculate a current survey assessment before filtering by monitor ID.');
  if(survey?.batch&&!batch)records.push(evidence('stale:survey','Flow survey','Survey evidence freshness','',{
    actions:[['Recalculate','The complete survey assessment is stale for the current inputs.']]}));

  includeDetriment(records,assetId);
  return readSnapshot(JSON.stringify({schema_version:1,name,build:buildToken,created:new Date().toISOString(),records}));
}

function mount(){
  const root=document.getElementById('tab-assessment-revision');
  root.innerHTML=`<article class="panel"><div class="panel-head"><div><h2>Assessment revision comparison</h2>
    <p>Capture current evidence or open a local snapshot. Compare reviewed inputs, results and decisions with their recorded basis.</p></div></div>
    <div class="mapping-grid"><label>Revision name<input id="hbAssessmentName" type="text" maxlength="160"></label>
    <div><label>Detriment asset ID (optional)<input id="hbAssessmentAsset" type="text" maxlength="384" placeholder="Exact report ID" aria-describedby="hbAssessmentAssetHelp"></label>
    <small id="hbAssessmentAssetHelp">Limits Detriment evidence to this exact ID. Other assessment evidence is included as usual.</small></div>
    <label>Flow survey monitor ID (optional)<input id="hbAssessmentMonitor" type="text" maxlength="384" placeholder="Exact monitor ID"></label>
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
    capture.onclick=async()=>{
      const generation=++side.generation;
      try{
        const packet=await collectAssessment($('hbAssessmentName').value.trim(),$('hbAssessmentNote').value,$('hbAssessmentAction').value,
          $('hbAssessmentAsset').value.trim(),$('hbAssessmentMonitor').value.trim());
        if(generation!==side.generation)return;
        announce(side,packet);
        status.textContent=name+' assessment captured from current local evidence.';
      }catch(error){if(generation===side.generation)status.textContent=error.message;}
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
    wrapper.className='table-wrap';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','Assessment change table');
    table.className='data-table';table.createCaption().textContent='Assessment changes';
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

globalThis.HydraAssessmentRevision={readSnapshot,compareSnapshots,storageAssessmentRecords,detrimentAssessmentRecord,verificationMatrixRecords,mount};
})();
