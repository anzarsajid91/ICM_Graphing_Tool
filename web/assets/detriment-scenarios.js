/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(()=>{'use strict';
const categories={flooding:'Flooding',level:'Level and freeboard',spill:'Spill count and duration'};
const magnitude=new Intl.NumberFormat('en-GB',{maximumFractionDigits:6});
const measured=(value,unit='')=>value==null?'Unavailable':(value<0?'−':'')+magnitude.format(Math.abs(value))+(unit?' '+unit:'');
const fields=['Asset ID','Proposal','Baseline','Proposed','Change','Criterion status','Review'];
const supplementary={level:['Level criterion','Freeboard A','Freeboard B','Freeboard change','Freeboard criterion'],
  spill:['Duration A','Duration B','Duration change','Count criterion','Duration criterion']};
let assessmentGroups=()=>[];
const make=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
function button(text,handler){const el=make('button',text);el.type='button';el.onclick=handler;return el;}
function labelled(text,el){const label=make('label');label.className='dt-field';el.setAttribute('aria-label',text);label.append(make('span',text),el);return label;}
function choices(select,options){select.replaceChildren(...options.map(([value,label])=>new Option(label,value)));}
function makeTable(caption,headers){
  const wrapper=make('div'),table=make('table');wrapper.className='table-wrap';wrapper.append(table);
  table.createCaption().textContent=caption;
  const top=table.createTHead().insertRow();
  for(const name of headers){const head=make('th',name);head.scope='col';top.append(head);}
  const body=table.createTBody();
  return {wrapper,body,row(values){const line=body.insertRow();for(const value of values){const cell=line.insertCell();
    if(value instanceof Node)cell.append(value);else cell.textContent=value??'—';}}};
}
function freeboardCriterion(result,row){
  if(result.criteria.freeboard_required==null)return 'No freeboard criterion';
  if(row.freeboard_b==null||row.freeboard_a==null)return 'Unavailable';
  if(row.freeboard_b>=Number(result.criteria.freeboard_required))return 'Meets minimum';
  return row.flags.includes('new_freeboard_breach')?'New breach':row.flags.includes('existing_breach_worsening')?'Worsening breach':'Existing breach';
}
function levelCriterion(row){
  if(row.delta==null)return 'Unavailable';
  if(row.flags.includes('level_detriment'))return 'Detriment';
  if(row.flags.includes('increase_within_tolerance'))return 'Increase within tolerance';
  return row.delta<0?'Improvement':'Unchanged';
}
function independentValues(result,row){
  if(result.kind==='level')return [levelCriterion(row),measured(row.freeboard_a,'m'),measured(row.freeboard_b,'m'),
    measured(row.freeboard_change,'m'),freeboardCriterion(result,row)];
  if(result.kind==='spill')return [measured(row.duration_a_hours,'h'),measured(row.duration_b_hours,'h'),
    measured(row.duration_delta_hours,'h'),row.count_status||'Unavailable',row.duration_status||'Unavailable'];
  return [];
}
function buildRegister(resultSets,baseline){
  const index=new Map();
  for(const {baseline:reference,assetKind,data} of resultSets){
    if(reference!==baseline)continue;
    const namespace=assetKind==='unclassified'?assetKind+':'+data.kind:assetKind;
    for(const {label:proposal,result} of data.scenarios){
      for(const row of result?.rows||[]){
        const key=JSON.stringify([namespace,row.asset_id,proposal]);
        if(!index.has(key))index.set(key,{assetId:row.asset_id,assetKind,proposal,entries:{}});
        index.get(key).entries[data.kind]={result,row};
      }
    }
  }
  return [...index.values()].sort((a,b)=>a.assetId.localeCompare(b.assetId)||a.assetKind.localeCompare(b.assetKind)||a.proposal.localeCompare(b.proposal));
}
function auditRows(batch,args){
  const rows=[['Record','Proposal','Category','Asset ID','Baseline','Proposed','Change','Unit','Overall status','Count status','Duration status',
    'Duration A (h)','Duration B (h)','Duration change (h)','Level criterion','Freeboard A (m)','Freeboard B (m)','Freeboard change (m)','Freeboard criterion',
    'Scope','Period start','Period end','Criteria and sources','Raw baseline report','Raw proposed report','Assessment flags','Unavailable reason']];
  const base=JSON.parse(args.baseline_json),sources=JSON.parse(args.candidates_json);
  const exportSource=source=>{
    if(!source)return null;
    const {path,id,...provenance}=source;
    return provenance;
  };
  batch.scenarios.forEach(({label,result,unavailable},index)=>{
    const basis={schema:'hydra-detriment-scenarios-v1',build:buildToken,baseline:exportSource(result?.scenario_a||base),proposed:exportSource(result?.scenario_b||sources[index].report),
      criteria:result?.criteria||JSON.parse(args.criteria_json),ground:exportSource(result?.ground_source),
      baselineDetail:exportSource(result?.detail_source_a),proposalDetail:exportSource(result?.detail_source_b),method:result?.method||null};
    rows.push(['Proposal',label,batch.kind,...Array(16).fill(''),base.scope,base.period_start,base.period_end,JSON.stringify(basis),'','','',unavailable]);
    for(const row of result?.rows||[]){rows.push(['Asset',label,batch.kind,row.asset_id,row.a,row.b,row.delta,row.unit,row.status,
      row.count_status,row.duration_status,row.duration_a_hours,row.duration_b_hours,row.duration_delta_hours,
      batch.kind==='level'?levelCriterion(row):'',row.freeboard_a,row.freeboard_b,
      row.freeboard_change,batch.kind==='level'?freeboardCriterion(result,row):'',base.scope,base.period_start,base.period_end,'',
      JSON.stringify({values:row.evidence_a,details:row.details_a}),JSON.stringify({values:row.evidence_b,details:row.details_b}),row.flags.join('; '),'']);}
  });
  return rows;
}
function saveCsv(filename,rows){
  downloadBlob(filename,rows.map(row=>row.map(value=>ICMSafeCSV.cell(value??'')).join(',')).join('\r\n'),'text/csv');
}
function combinedSummary(category,result,row){
  if(category==='level')return 'Δ level '+measured(row.delta,row.unit)+' · '+levelCriterion(row)+
    ' · Proposed freeboard '+measured(row.freeboard_b,'m')+' · '+freeboardCriterion(result,row);
  if(category==='spill')return 'Δ count '+measured(row.delta,row.unit)+' · '+(row.count_status||'Unavailable')+
    ' · Δ duration '+measured(row.duration_delta_hours,'h')+' · '+(row.duration_status||'Unavailable');
  return 'Δ flood volume '+measured(row.delta,row.unit)+' · '+row.status;
}
function hotspotMetrics(entries){
  const metrics={};
  if(entries.flooding){const {row}=entries.flooding;
    metrics.flooding={label:'Flood volume',category:'flooding',status:row.status,value:row.delta,unit:row.unit};}
  if(entries.level){const {result,row}=entries.level,level=levelCriterion(row),freeboard=freeboardCriterion(result,row);
    metrics.level={label:'Maximum level',category:'level',status:level==='Increase within tolerance'?'risk':level.toLowerCase(),value:row.delta,unit:row.unit};
    const freeboardStatus=['New breach','Worsening breach'].includes(freeboard)?'detriment':freeboard==='Existing breach'?'risk':
      row.flags.includes('freeboard_breach_resolved')?'improvement':freeboard==='Meets minimum'?'unchanged':'unavailable';
    metrics.freeboard={label:'Minimum freeboard',category:'level',status:freeboardStatus,value:row.freeboard_b,unit:'m'};
  }
  if(entries.spill){const {row}=entries.spill;
    metrics['spill-count']={label:'Spill count',category:'spill',status:row.count_status||'unavailable',value:row.delta,unit:row.unit};
    metrics['spill-duration']={label:'Actual spill duration',category:'spill',status:row.duration_status||'unavailable',value:row.duration_delta_hours,unit:'h'};
  }
  return metrics;
}
function mountCombined(currentCategory,currentBatch,inspect,navigate){
  const assetKinds={node:'Node',link:'Link',unclassified:'Unclassified report ID'};
  const groupings=new Map();
  const controls=make('div'),toggle=make('details'),summary=make('summary','Include category in combined register'),form=make('div');
  const baseline=make('input');baseline.type='text';baseline.maxLength=120;
  const identity=make('select');choices(identity,[['','Choose report identity'],...Object.entries(assetKinds)]);
  const notice=make('p');notice.setAttribute('role','status');
  const include=button('Use this category',()=>{
    const category=currentCategory(),source=currentBatch(category),reference=baseline.value.trim();
    if(!source?.data.scenarios.some(entry=>entry.result)){notice.textContent='Compare compatible proposals for this category first.';return;}
    if(!reference){notice.textContent='Enter the reviewed baseline model revision.';baseline.focus();return;}
    if(!identity.value){notice.textContent='Choose the report asset identity.';identity.focus();return;}
    groupings.set(category,{assetKind:identity.value,baseline:reference,stamp:source.stamp});
    notice.textContent=categories[category]+' included in the combined register.';
    refresh();
  });
  const remove=button('Remove this category',()=>{
    groupings.delete(currentCategory());notice.textContent='Category removed from the combined register.';refresh();
  });
  const open=button('Open combined asset register',()=>{
    const available=eligible();
    const names=[...new Set(available.map(entry=>entry.baseline))];
    choices(reference,names.map(name=>[name,name]));
    if(names.includes(baseline.value.trim()))reference.value=baseline.value.trim();
    rebuild();dialog.showModal();
  });
  form.className='dt-fields';form.append(labelled('Baseline model revision',baseline),labelled('Report asset identity',identity),include,remove);
  toggle.append(summary,make('p','Use the same baseline revision and proposal names for matching exports. Select Node or Link only when the exact report IDs identify the same physical assets across categories. Unclassified IDs stay within their own report category.'),form,notice);
  controls.append(toggle,open);
  const dialog=make('dialog'),heading=make('h3','Combined detriment asset register'),filters=make('div'),body=make('div');
  heading.id='hbCombinedDetrimentTitle';dialog.setAttribute('aria-labelledby',heading.id);dialog.className='dt-combined-dialog';
  const reference=make('select'),search=make('input');search.type='search';
  filters.className='dt-fields';filters.append(labelled('Combined register baseline',reference),labelled('Find combined asset',search));
  const mapProposal=make('select'),mapConfirmed=make('input');mapConfirmed.type='checkbox';
  const mapStatus=make('p');mapStatus.setAttribute('role','status');
  const mapLabel=make('label');mapLabel.className='dt-check';
  mapLabel.append(mapConfirmed,'I checked that these report IDs and model revisions match the active network');
  const map=button('Show proposal on network',async()=>{
    if(!mapConfirmed.checked){mapStatus.textContent='Confirm the active network revision and asset IDs first.';mapConfirmed.focus();return;}
    const selected=mapProposal.value,revision=reference.value;
    const basisStamps=eligible().filter(group=>group.baseline===revision).map(group=>group.stamp);
    const stillCurrent=()=>{
      const stamps=new Set(eligible().filter(group=>group.baseline===revision).map(group=>group.stamp));
      return stamps.size===basisStamps.length&&basisStamps.every(stamp=>stamps.has(stamp));
    };
    const records=joined.filter(group=>group.proposal===selected).map(group=>({...group,metrics:hotspotMetrics(group.entries)}));
    if(!records.length){mapStatus.textContent='Choose a reviewed proposal to display.';return;}
    dialog.close();navigate('network','schematic',true);
    await window.ICMNetworkSchematic?.open();
    if(window.__ICM_PRECISION_WORKBENCH__?.route().workspace!=='network')return;
    window.ICMNetworkSchematic?.showDetrimentHotspots?.({revision,proposal:selected,records,stillCurrent,
      openEvidence:(group,category)=>{
        if(!stillCurrent()||!group.entries[category])return false;
        const {result,row}=group.entries[category];
        navigate('detriment','comparison',true);inspect(selected,result,row);return true;
      }});
  });
  const download=button('Download combined audit CSV',()=>{
    const included=eligible().filter(group=>group.baseline===reference.value);
    const parts=included.map(group=>auditRows(group.data,group.args));
    if(!parts.length)return;
    const rows=[['Baseline model revision','Report asset identity',...parts[0][0]]];
    for(let index=0;index<included.length;index++)for(const row of parts[index].slice(1))
      rows.push([reference.value,included[index].assetKind,...row]);
    saveCsv('hydra-combined-detriment.csv',rows);
  });
  download.id='hbDetrimentCombinedExport';
  const previous=button('Previous combined results',()=>{page--;render();}),next=button('Next combined results',()=>{page++;render();});
  const actions=make('div');actions.className='actions';actions.append(previous,next,download,button('Close',()=>dialog.close()));
  const mapControls=make('div');mapControls.className='dt-scenario-map';
  mapControls.append(make('h4','Network hotspots'),labelled('Proposal to show on network',mapProposal),mapLabel,map,mapStatus);
  dialog.append(heading,make('p','Results retain their own units, thresholds and assessment periods. Open an individual criterion to review its basis.'),filters,body,actions,mapControls);
  let joined=[],page=0;
  function eligible(){
    const accepted=[];
    for(const [kind,definition] of groupings){
      const group=currentBatch(kind);
      if(group?.stamp===definition.stamp)accepted.push({...definition,data:group.data,args:group.args});
    }
    return accepted;
  }
  function refresh(){
    const existing=groupings.get(currentCategory()),available=eligible();
    remove.disabled=!existing;include.disabled=!currentBatch(currentCategory());open.disabled=!available.length;
    if(existing&&existing.stamp!==currentBatch(currentCategory())?.stamp){
      notice.textContent='This category has different inputs. Compare it again and confirm its identity before including it.';
    }
    if(dialog.open){
      const names=[...new Set(available.map(entry=>entry.baseline))],selected=reference.value;
      choices(reference,names.map(name=>[name,name]));
      if(names.includes(selected))reference.value=selected;
      rebuild();
    }
  }
  function rebuild(){
    joined=buildRegister(eligible(),reference.value);page=0;render();
    const names=[...new Set(joined.map(item=>item.proposal))];
    choices(mapProposal,names.map(name=>[name,name]));map.disabled=!names.length;
    mapConfirmed.checked=false;mapStatus.textContent='';
  }
  function render(){
    const term=search.value.trim().toLowerCase(),count=75;
    const visible=term?joined.filter(item=>item.assetId.toLowerCase().includes(term)):joined;
    const table=makeTable('Combined asset evidence',['Asset ID','Asset identity','Proposal',...Object.values(categories)]);
    for(const group of visible.slice(page*count,(page+1)*count)){
      const details=Object.keys(categories).map(category=>{
        const entry=group.entries[category];
        if(!entry)return 'No reviewed evidence';
        const {result,row}=entry,box=make('div',combinedSummary(category,result,row));
        box.append(button('Inspect '+categories[category].toLowerCase(),()=>{dialog.close();inspect(group.proposal,result,row);}));
        return box;
      });
      table.row([group.assetId,assetKinds[group.assetKind],group.proposal,...details]);
    }
    body.replaceChildren(visible.length?table.wrapper:make('p','No reviewed assets match the selected baseline and search.'),
      make('p',visible.length?((page*count+1)+'–'+Math.min((page+1)*count,visible.length)+' of '+visible.length+' assets and proposals'):''));
    previous.disabled=page<=0;next.disabled=(page+1)*count>=visible.length;download.disabled=!joined.length;
  }
  reference.onchange=rebuild;search.oninput=()=>{page=0;render();};
  mapProposal.onchange=()=>{mapConfirmed.checked=false;mapStatus.textContent='';};
  return {controls,dialog,refresh,eligible};
}
function mount(navigate){
  const api=window.ICMDetriment,root=document.getElementById('tab-detriment-scenarios');
  const article=make('article'),intro=make('div'),basis=make('p'),mapping=make('p'),controls=make('div'),draft=make('div'),message=make('p'),output=make('div');
  article.className='panel dt-workspace dt-scenarios';intro.className='panel-head';controls.className='dt-fields';message.setAttribute('role','status');
  intro.append(make('h2','Detriment scenario comparison'),make('p','Compare all rows in each proposed ICM report against the same baseline. Each assessment keeps its own criteria, units and raw evidence.'));
  const select=make('select');choices(select,Object.entries(categories));select.value=api.currentCategory();
  const configure=button('Configure report basis',()=>navigate('detriment',select.value,true));
  const confirm=make('input');confirm.type='checkbox';
  const confirmLabel=make('label');confirmLabel.className='dt-check';confirmLabel.append(confirm,'I reviewed the shared proposal mapping and basis');
  const add=button('Add proposal',()=>{drafts().rows.push({label:'',id:'',detail:''});invalidate();drawDraft(draftRows());});
  const run=button('Compare against baseline',calculate);run.className='primary';
  const save=button('Download scenario audit CSV',download);save.id='hbDetrimentBatchExport';
  const search=make('input');search.type='search';
  const proposalFilter=make('select');
  const filters=make('div');filters.className='dt-fields';filters.append(labelled('Find asset',search),labelled('Show proposals',proposalFilter));
  const previous=button('Previous results',()=>{page--;renderAssets();});
  const next=button('Next results',()=>{page++;renderAssets();});
  const pages=make('div');pages.className='actions';pages.append(previous,next);
  const summary=make('div'),assets=make('div');output.append(summary,filters,assets,pages);
  const dialog=make('dialog'),heading=make('h3'),detail=make('div');heading.id='hbDetrimentBatchEvidence';
  dialog.setAttribute('aria-labelledby',heading.id);dialog.append(heading,detail,button('Close',()=>dialog.close()));
  const actions=make('div');actions.className='actions';actions.append(add,run,save);
  controls.append(labelled('Assessment category',select),configure);
  const savedDrafts=new Map(),savedResults=new Map();
  let active=null,running=false,page=0;
  const category=()=>select.value;
  const combined=mountCombined(category,currentBatch,showEvidence,navigate);
  assessmentGroups=combined.eligible;
  article.append(intro,controls,basis,mapping,draft,confirmLabel,actions,message,output,combined.controls,combined.dialog,dialog);root.replaceChildren(article);
  function drafts(){
    if(!savedDrafts.has(category())){const context=api.batchContext(category());
      savedDrafts.set(category(),{rows:[{label:'',id:context.initialProposal,detail:context.initialDetail}],confirmed:false});}
    return savedDrafts.get(category());
  }
  const draftRows=()=>api.batchContext(category());
  function drawDraft(context){
    const {rows,confirmed}=drafts();confirm.checked=confirmed;add.disabled=rows.length>=6;
    basis.textContent=context.baseline?'Baseline '+context.baseline+(context.scope?' · '+context.scope:' · Declare common scope before comparing.'):
      'Configure the baseline, proposed report mapping and criteria to begin.';
    mapping.textContent=context.proposalTemplate&&context.mapping.length?'Shared proposal mapping from '+context.proposalTemplate+' · '+
      context.mapping.map(([key,column])=>key.replaceAll('_',' ')+' → '+column).join(' · '):'';
    const grid=make('div');
    rows.forEach((entry,index)=>{
      const line=make('div');line.className='dt-fields dt-scenario-entry';const n=index+1;
      const name=make('input');name.type='text';name.maxLength=120;name.value=entry.label;
      const report=make('select');choices(report,[['','Choose a report'],...context.reports]);report.value=entry.id;
      name.oninput=()=>{entry.label=name.value;invalidate();};report.onchange=()=>{entry.id=report.value;invalidate();};
      line.append(labelled('Proposal '+n+' name',name),labelled('Proposal '+n+' report',report));
      if(category()==='spill'){
        const details=make('select');choices(details,[['','No additional detail'],...context.reports]);details.value=entry.detail;
        details.onchange=()=>{entry.detail=details.value;invalidate();};line.append(labelled('Proposal '+n+' detail report',details));
      }
      const remove=button('Remove proposal '+n,()=>{rows.splice(index,1);invalidate();drawDraft(draftRows());add.focus();});
      remove.disabled=rows.length===1;line.append(remove);grid.append(line);
    });
    draft.replaceChildren(grid);
  }
  function readArgs(){return api.batchArguments(category(),drafts().rows);}
  function currentBatch(key){
    const candidate=savedResults.get(key);
    if(!candidate)return null;
    try{return candidate.stamp===JSON.stringify(api.batchArguments(key,savedDrafts.get(key).rows))?candidate:null;}
    catch{return null;}
  }
  function invalidate(){savedResults.delete(category());active=null;message.textContent='Inputs changed. Compare the proposals to update results.';renderResults();}
  function refresh(){
    drawDraft(draftRows());active=savedResults.get(category())||null;
    if(active){let current;
      try{current=JSON.stringify(readArgs());}catch{/* A required report may have been removed. */}
      if(active.stamp!==current){invalidate();return;}}
    message.textContent=active?active.caption:'';renderResults();
  }
  async function calculate(){
    if(running)return;
    if(!confirm.checked){message.textContent='Confirm the common proposal mapping and assessment basis.';confirm.focus();return;}
    const requested=category();let args;
    try{args=readArgs();}catch(error){message.textContent=api.assessmentErrorMessage(error);return;}
    const stamp=JSON.stringify(args);running=true;run.disabled=true;save.disabled=true;message.textContent='Comparing local report evidence…';
    try{
      const data=await api.calculateBatch(args);
      if(category()!==requested)return;
      if(!confirm.checked||stamp!==JSON.stringify(readArgs())){invalidate();return;}
      const comparable=data.scenarios.filter(group=>group.result).length;
      const caption=comparable+' scenarios compared · '+(data.scenarios.length-comparable)+' unavailable.';
      active={data,args,stamp,caption};savedResults.set(category(),active);
      message.textContent=caption;search.value='';renderResults();
    }catch(error){
      savedResults.delete(requested);
      if(category()===requested){active=null;renderResults();message.textContent=api.assessmentErrorMessage(error);}
    }
    finally{running=false;run.disabled=false;save.disabled=!active;}
  }
  function renderResults(){
    output.hidden=!active;save.disabled=!active||running;page=0;
    combined.refresh();
    if(!active){summary.replaceChildren();assets.replaceChildren();return;}
    const old=proposalFilter.value;
    choices(proposalFilter,[['','All proposals'],...active.data.scenarios.filter(group=>group.result).map(group=>[group.label,group.label])]);
    if([...proposalFilter.options].some(option=>option.value===old))proposalFilter.value=old;
    const totals=makeTable('Proposal outcome by report',['Proposal','Matched assets','Detriment','Risk','Unresolved','Evidence status']);
    for(const group of active.data.scenarios){const tally=group.result?.summary;
      totals.row([group.label,tally?.matched,tally?.detriment,tally?.risk,tally?.unresolved,group.unavailable||group.result?.status]);}
    summary.replaceChildren(totals.wrapper);renderAssets();
  }
  function renderAssets(){
    if(!active)return;
    const term=search.value.trim().toLowerCase(),filtered=proposalFilter.value,limit=75;
    const table=makeTable('Proposal asset results',[...fields.slice(0,-1),...(supplementary[category()]||[]),fields.at(-1)]);
    let count=0;
    for(const {label,result} of active.data.scenarios){
      if(!result||(filtered&&filtered!==label))continue;
      for(const row of result.rows){
        if(term&&!row.asset_id.toLowerCase().includes(term))continue;
        const index=count++;
        if(index<page*limit||index>=(page+1)*limit)continue;
        const inspect=button('Inspect',()=>showEvidence(label,result,row));
        table.row([row.asset_id,label,measured(row.a,row.unit),measured(row.b,row.unit),measured(row.delta,row.unit),row.status,
          ...independentValues(result,row),inspect]);
      }
    }
    assets.replaceChildren(count?table.wrapper:make('p','No assessed assets match the selection.'),
      make('p',count?((page*limit+1)+'–'+Math.min((page+1)*limit,count)+' of '+count+' asset results'):''));
    previous.disabled=page===0;next.disabled=(page+1)*limit>=count;
  }
  function showEvidence(label,result,row){
    heading.textContent='Proposal asset evidence';
    const raw=makeTable('Raw report values',['Field','Baseline A','Proposal']);
    for(const key of new Set([...Object.keys(row.evidence_a||{}),...Object.keys(row.evidence_b||{})]))
      raw.row([key,row.evidence_a?.[key],row.evidence_b?.[key]]);
    const criteria=makeTable('Assessment basis',['Setting','Value']);
    const {scope,period_start,period_end,template,datum}=result.scenario_a;
    criteria.row(['Review scope',scope]);
    if(period_start&&period_end)criteria.row(['Assessment period',period_start+' to '+period_end+' (end exclusive)']);
    if(datum)criteria.row(['Vertical datum',datum]);
    if(template)criteria.row(['Statistics template',template]);
    if(result.kind==='spill'){
      criteria.row(['Count increase tolerance',measured(result.count_tolerance,result.count_unit)]);
      criteria.row(['Duration increase tolerance',measured(result.duration_tolerance_hours,'h')]);
    }else{
      criteria.row(['Increase tolerance',measured(Number(result.criteria.threshold),row.unit)]);
      if(result.criteria.freeboard_required!=null)criteria.row(['Minimum freeboard',measured(Number(result.criteria.freeboard_required),'m')]);
    }
    detail.replaceChildren(make('h4',row.asset_id+' · '+label),make('p',result.scenario_a.name+' → '+result.scenario_b.name),
      make('p',row.flags.map(flag=>flag.replaceAll('_',' ')).join(' · ')),criteria.wrapper,raw.wrapper);
    dialog.showModal();
  }
  function download(){
    if(!active)return;
    saveCsv('hydra-detriment-scenarios.csv',auditRows(active.data,active.args));
  }
  select.onchange=refresh;
  confirm.onchange=()=>{drafts().confirmed=confirm.checked;invalidate();};
  search.oninput=proposalFilter.onchange=()=>{page=0;renderAssets();};
  window.addEventListener('icm:source-pool-changed',refresh);
  window.addEventListener('icm:route-changed',event=>{if(event.detail.workspace==='detriment'&&event.detail.page==='comparison')refresh();});
  refresh();
}
window.HydraDetrimentScenarios={mount,buildRegister,assessmentGroups:()=>assessmentGroups()};
})();
