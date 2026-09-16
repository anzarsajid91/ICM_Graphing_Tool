const $ = (id) => document.getElementById(id);
const state = { files: new Map(), mapping: { observed: '', models: [], rain: '' }, comparisons: [], spills: {}, exclusions: [] };
const recognised = (name) => { const n = name.toLowerCase(); return n.endsWith('.csv') || n.endsWith('.fdv') || n.endsWith('.fdv.txt') || n.endsWith('.r') || n.endsWith('.r.txt'); };
const esc = (s) => String(s ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const fmt = (v, digits=4) => (v === null || v === undefined || Number.isNaN(Number(v))) ? '—' : Number(v).toLocaleString(undefined,{maximumFractionDigits:digits});
const mb = (n) => `${(Number(n||0)/1048576).toFixed(2)} MB`;
const colors = ['#0a66c2','#ef7d00','#2e8b57','#7c4dff','#c43d6f','#008b95','#7a5c00','#5b6d7e'];

class BrowserPythonEngine {
  constructor(){ this.pyodide = null; this.ready = false; }
  async boot(){
    this.pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.4/full/' });
    await this.pyodide.loadPackage(['numpy','pandas']);
    const files = [
      'icm_workbench/__init__.py','icm_workbench/domain/__init__.py','icm_workbench/domain/models.py',
      'icm_workbench/parsers/__init__.py','icm_workbench/parsers/common.py','icm_workbench/parsers/csv.py','icm_workbench/parsers/fdv.py','icm_workbench/parsers/rainfall.py',
      'icm_workbench/analysis/__init__.py','icm_workbench/analysis/exclusions.py','icm_workbench/analysis/integration.py','icm_workbench/analysis/alignment.py','icm_workbench/analysis/metrics.py','icm_workbench/analysis/spills.py','icm_workbench/analysis/comparison.py','icm_workbench/analysis/screening.py'
    ];
    this.pyodide.FS.mkdirTree('/workbench/icm_workbench/domain');
    this.pyodide.FS.mkdirTree('/workbench/icm_workbench/parsers');
    this.pyodide.FS.mkdirTree('/workbench/icm_workbench/analysis');
    this.pyodide.FS.mkdirTree('/data');
    for(const rel of files){
      const r = await fetch(`python/${rel}`, {cache:'no-cache'}); if(!r.ok) throw new Error(`Could not load reference engine module ${rel}`);
      this.pyodide.FS.writeFile(`/workbench/${rel}`, await r.text(), {encoding:'utf8'});
    }
    const bridge = await fetch('python_bridge.py',{cache:'no-cache'}); if(!bridge.ok) throw new Error('Could not load browser bridge');
    this.pyodide.FS.writeFile('/workbench/python_bridge.py', await bridge.text(), {encoding:'utf8'});
    await this.pyodide.runPythonAsync(`import sys\nsys.path.insert(0, '/workbench')\nimport python_bridge`);
    this.ready = true;
  }
  async addFile(item){
    const bytes = new Uint8Array(await item.file.arrayBuffer());
    this.pyodide.FS.writeFile(item.virtualPath, bytes);
  }
  async call(name, args={}){
    if(!this.ready) throw new Error('Python engine is not ready');
    this.pyodide.globals.set('_bridge_args', JSON.stringify(args));
    const out = await this.pyodide.runPythonAsync(`import json, python_bridge\n_a=json.loads(_bridge_args)\npython_bridge.${name}(**_a)`);
    return typeof out === 'string' ? JSON.parse(out) : out;
  }
  async clear(){ await this.pyodide.runPythonAsync('python_bridge.clear_cache()'); }
}
const engine = new BrowserPythonEngine();

function setEngineStatus(text, kind='booting'){
  $('engineStatus').innerHTML = `<span class="status-dot ${kind}"></span><span>${esc(text)}</span>`;
}

async function sha256(file){ const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
function safeName(name){ return String(name).replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120); }
function sourceKey(id,col){ return JSON.stringify([id,col]); }
function parseSourceKey(v){ try{return JSON.parse(v)}catch{return ['', '']} }
function seriesLabel(item,col){ return `${item.displayName} — ${col}`; }

async function ingestFiles(files){
  const list = [...files].filter(f=>f && recognised(f.name));
  if(!list.length){ $('poolSummary').textContent='No recognised CSV / FDV / R files found.'; return; }
  for(const file of list){
    const displayName = file.webkitRelativePath || file._relativePath || file.name;
    const duplicate = [...state.files.values()].find(x=>x.displayName===displayName && x.file.size===file.size && x.file.lastModified===file.lastModified);
    if(duplicate) continue;
    const id = crypto.randomUUID();
    const item = {id,file,displayName,virtualPath:`/data/${id}_${safeName(file.name)}`,status:'loading',parsed:null,hash:null,error:null};
    state.files.set(id,item); renderPool();
    try{
      item.hash = await sha256(file); await engine.addFile(item); item.parsed = await engine.call('parse_source',{path:item.virtualPath}); item.status='ready';
    }catch(err){ item.status='error'; item.error=String(err?.message||err); }
    renderPool(); renderSeriesOptions();
  }
}

function renderPool(){
  const items=[...state.files.values()]; $('poolSummary').textContent=items.length?`${items.length} file(s) in the source pool · ${items.filter(x=>x.status==='ready').length} parsed successfully.`:'No files loaded.';
  $('poolBody').innerHTML=items.map(item=>{
    const p=item.parsed||{}; const audit=p.audit||{}; const sent=Number(audit.sentinel_count||0)+(audit.column_audit?Object.values(audit.column_audit).reduce((a,x)=>a+Number(x.sentinel_count||0),0):0); const malformed=Number(audit.malformed_rows||0)+Number(audit.invalid_timestamps||0);
    const period=p.start?`${new Date(p.start).toLocaleString()} → ${new Date(p.end).toLocaleString()}`:'—';
    const auditText=item.status==='ready'?`${sent} sentinel; ${malformed} malformed/invalid`:item.error||'Parsing…';
    return `<tr><td><div class="file-name">${esc(item.displayName)}</div><small>${mb(item.file.size)} · SHA ${item.hash?item.hash.slice(0,10):'…'}</small></td><td>${esc(p.format||'—')}</td><td>${p.rows??'—'}</td><td>${esc(period)}</td><td class="${(sent||malformed)?'audit-warn':'audit-good'}">${esc(auditText)}</td><td>${item.status==='ready'?'Ready':item.status==='error'?'<span class="audit-bad">Error</span>':'Loading…'}</td></tr>`;
  }).join('');
}

function allSeries(){
  const out=[]; for(const item of state.files.values()){ if(item.status!=='ready') continue; for(const col of item.parsed.columns||[]) out.push({item,col,key:sourceKey(item.id,col),label:seriesLabel(item,col)}); } return out;
}
function renderSeriesOptions(){
  const all=allSeries(); const options=all.map(s=>`<option value='${esc(s.key)}'>${esc(s.label)}</option>`).join('');
  const obs=$('observedSelect'), mod=$('modelSelect'), rain=$('rainSelect'); const prevObs=obs.value, prevMods=[...mod.selectedOptions].map(o=>o.value), prevRain=rain.value;
  obs.innerHTML=`<option value="">Select…</option>${options}`; mod.innerHTML=options; rain.innerHTML=`<option value="">None</option>${options}`;
  if([...obs.options].some(o=>o.value===prevObs)) obs.value=prevObs;
  [...mod.options].forEach(o=>o.selected=prevMods.includes(o.value)); if([...rain.options].some(o=>o.value===prevRain)) rain.value=prevRain;
  $('storageLevelSelect').innerHTML=`<option value="">Select modelled level…</option>${options}`;
  $('storageFlowSelect').innerHTML=`<option value="">Select overflow flow…</option>${options}`;
  autoSuggestMappings(all);
}
function autoSuggestMappings(all){
  if(!$('observedSelect').value){ const s=all.find(x=>/observ|edm|monitor|depth/i.test(x.item.displayName)||/depth|level/i.test(x.col)); if(s)$('observedSelect').value=s.key; }
  if(!$('rainSelect').value){ const s=all.find(x=>/rain/i.test(x.item.displayName)||/rain/i.test(x.col)); if(s)$('rainSelect').value=s.key; }
}
function mappingObject(v){ const [id,col]=parseSourceKey(v); const item=state.files.get(id); return item?{id,col,item}:null; }
function currentModels(){ return state.mapping.models.map(mappingObject).filter(Boolean); }

async function applyMapping(){
  state.mapping.observed=$('observedSelect').value; state.mapping.models=[...$('modelSelect').selectedOptions].map(o=>o.value); state.mapping.rain=$('rainSelect').value;
  const obs=mappingObject(state.mapping.observed), models=currentModels();
  if(!obs||!models.length){ $('mappingStatus').textContent='Select one observed series and at least one modelled/comparison series.'; return; }
  $('mappingStatus').textContent=`Observed: ${seriesLabel(obs.item,obs.col)} · ${models.length} modelled/comparison scenario(s) · rainfall ${state.mapping.rain?'mapped':'not mapped'}.`;
  if(!$('storageLevelSelect').value) $('storageLevelSelect').value=state.mapping.models[0];
  await drawTimeChart();
}

async function seriesFor(key){ const x=mappingObject(key); if(!x)return null; const d=await engine.call('series_data',{path:x.item.virtualPath,column:x.col,max_points:25000}); return {...x,data:d}; }
async function drawTimeChart(){
  const obs=await seriesFor(state.mapping.observed); if(!obs){ Plotly.purge('timeChart'); return; }
  const traces=[{x:obs.data.timestamp,y:obs.data.value,name:`Observed · ${obs.col}`,mode:'lines',line:{color:'#101828',width:2}}];
  let i=0; for(const key of state.mapping.models){ const m=await seriesFor(key); if(!m)continue; traces.push({x:m.data.timestamp,y:m.data.value,name:`Model · ${m.item.displayName} · ${m.col}`,mode:'lines',line:{color:colors[i++%colors.length],width:1.7}}); }
  if(state.mapping.rain){ const r=await seriesFor(state.mapping.rain); if(r)traces.push({x:r.data.timestamp,y:r.data.value,name:'Rainfall',type:'bar',yaxis:'y2',marker:{color:'#5ea2e6'},opacity:.28}); }
  const layout={template:'plotly_white',margin:{l:60,r:60,t:40,b:55},hovermode:'x unified',legend:{orientation:'h',y:1.08},xaxis:{title:'Time',rangeslider:{visible:true,thickness:.08}},yaxis:{title:obs.col,showgrid:true},yaxis2:{title:'Rainfall',overlaying:'y',side:'right',autorange:'reversed',showgrid:false,zeroline:false},uirevision:'icm-main'};
  await Plotly.react('timeChart',traces,layout,{responsive:true,displaylogo:false,scrollZoom:true});
}

async function runCompare(){
  const obs=mappingObject(state.mapping.observed), models=currentModels(); if(!obs||!models.length){alert('Apply an observed and at least one modelled series first.');return;}
  const maxGap=Number($('gapInput').value||900), offset=Number($('offsetInput').value||0); state.comparisons=[];
  for(const m of models){
    try{ const r=await engine.call('compare_series',{obs_path:obs.item.virtualPath,obs_col:obs.col,model_path:m.item.virtualPath,model_col:m.col,max_gap_seconds:maxGap,offset_minutes:offset}); state.comparisons.push({model:m,result:r}); }
    catch(err){ state.comparisons.push({model:m,error:String(err?.message||err)}); }
  }
  renderComparisons();
}
function metricCard(k,v){return `<div class="metric"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`}
function renderComparisons(){
  const ok=state.comparisons.filter(x=>x.result); const first=ok[0];
  if(first){ const m=first.result.metrics||{}; $('metricGrid').innerHTML=[['Pairs',m.pairs],['RMSE',fmt(m.rmse)],['MAE',fmt(m.mae)],['Mean bias',fmt(m.mean_bias)],['R²',fmt(m.r2_correlation)],['NSE',fmt(m.nse)],['KGE 2009',fmt(m.kge_2009)],['Obs peak',fmt(m.obs_peak)],['Model peak',fmt(m.sim_peak)],['Peak lag min',fmt(m.peak_timing_minutes_model_minus_observed,2)]].map(([k,v])=>metricCard(k,v)).join('');
    const p=first.result.paired||[]; Plotly.react('scatterChart',[{x:p.map(x=>x.obs),y:p.map(x=>x.sim),mode:'markers',name:'Paired',marker:{size:5,opacity:.5,color:'#0a66c2'}}],{template:'plotly_white',title:'Observed vs modelled',xaxis:{title:'Observed'},yaxis:{title:'Modelled'},margin:{l:55,r:20,t:45,b:50}},{responsive:true,displaylogo:false});
    Plotly.react('residualChart',[{x:p.map(x=>x.timestamp),y:p.map(x=>x.residual),mode:'lines',name:'Model − observed',line:{color:'#a62929',width:1.4}}],{template:'plotly_white',title:'Residual through time',xaxis:{title:'Time'},yaxis:{title:'Residual'},margin:{l:55,r:20,t:45,b:50}},{responsive:true,displaylogo:false});
  } else { $('metricGrid').innerHTML=''; Plotly.purge('scatterChart'); Plotly.purge('residualChart'); }
  $('scenarioBody').innerHTML=state.comparisons.map(x=>{ const m=x.result?.metrics||{}; return `<tr><td>${esc(x.model.item.displayName)} · ${esc(x.model.col)}</td><td>${m.pairs??'—'}</td><td>${fmt(m.rmse)}</td><td>${fmt(m.mae)}</td><td>${fmt(m.mean_bias)}</td><td>${fmt(m.r2_correlation)}</td><td>${fmt(m.nse)}</td><td>${fmt(m.kge_2009)}</td><td>${fmt(m.peak_timing_minutes_model_minus_observed,2)}</td></tr>`; }).join('');
}

function addExclusionRow(value={}){ state.exclusions.push({id:crypto.randomUUID(),start:value.start||'',end:value.end||'',reason:value.reason||''}); renderExclusions(); }
function renderExclusions(){
  $('exclusionRows').innerHTML=state.exclusions.length?state.exclusions.map((e,i)=>`<div class="ex-row" data-id="${e.id}"><label>Start<input type="datetime-local" data-field="start" value="${esc(toLocalInput(e.start))}"></label><label>End<input type="datetime-local" data-field="end" value="${esc(toLocalInput(e.end))}"></label><label>Reason<input type="text" data-field="reason" placeholder="EDM fault / model issue / maintenance…" value="${esc(e.reason)}"></label><button class="btn quiet remove-ex" data-id="${e.id}">Remove</button></div>`).join(''):'<div class="pool-summary">No exclusion periods. All assessable data remains in scope.</div>';
  document.querySelectorAll('.ex-row input').forEach(inp=>inp.addEventListener('change',()=>{const row=inp.closest('.ex-row');const e=state.exclusions.find(x=>x.id===row.dataset.id);if(e)e[inp.dataset.field]=inp.value;}));
  document.querySelectorAll('.remove-ex').forEach(b=>b.addEventListener('click',()=>{state.exclusions=state.exclusions.filter(x=>x.id!==b.dataset.id);renderExclusions();}));
}
function toLocalInput(v){ if(!v)return ''; const d=new Date(v); if(Number.isNaN(d.getTime()))return String(v).slice(0,16); const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
function exclusionPayload(){
  return state.exclusions.filter(x=>x.start&&x.end&&x.reason.trim()).map(x=>({start:new Date(x.start).toISOString(),end:new Date(x.end).toISOString(),reason:x.reason.trim(),source:'user'}));
}

async function runSpills(){
  const obs=mappingObject(state.mapping.observed), model=currentModels()[0], exc=JSON.stringify(exclusionPayload()), gap=Number($('gapInput').value||900); state.spills={};
  if(obs && $('obsThreshold').value!==''){ state.spills.observed=await engine.call('spill_result',{path:obs.item.virtualPath,column:obs.col,threshold:Number($('obsThreshold').value),exclusions_json:exc,max_gap_seconds:gap}); }
  if(model && $('modelThreshold').value!==''){ state.spills.model=await engine.call('spill_result',{path:model.item.virtualPath,column:model.col,threshold:Number($('modelThreshold').value),exclusions_json:exc,max_gap_seconds:gap}); }
  renderSpills();
}
function spillSummaryHtml(r){ if(!r)return '<div class="pool-summary">Not calculated.</div>'; return `<div class="summary-box"><div><strong>${r.total_spill_count}</strong><span>12/24 spill count</span></div><div><strong>${fmt(r.total_spill_duration_hours,3)} h</strong><span>physical duration</span></div><div><strong>${fmt((r.coverage_fraction||0)*100,1)}%</strong><span>assessable coverage</span></div><div><strong>${fmt((r.excluded_seconds||0)/3600,2)} h</strong><span>excluded</span></div><div><strong>${fmt((r.unknown_seconds||0)/3600,2)} h</strong><span>unknown gap</span></div><div><strong>${esc(r.count_status||r.status)}</strong><span>count status</span></div></div>`; }
function monthlyTable(r){
  if(!r)return '';
  const c=new Map((r.monthly_counts||[]).map(x=>[`${x.year}-${x.month}`,x.spill_count])); const d=new Map((r.monthly_durations||[]).map(x=>[`${x.year}-${x.month}`,x.duration_hours])); const keys=[...new Set([...c.keys(),...d.keys()])].sort();
  if(!keys.length)return '<div class="pool-summary">No spill months.</div>';
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Month</th><th>12/24 count</th><th>Duration hr</th></tr></thead><tbody>${keys.map(k=>`<tr><td>${esc(k)}</td><td>${c.get(k)??0}</td><td>${fmt(d.get(k)||0,2)}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderSpills(){
  $('obsSpillSummary').innerHTML=spillSummaryHtml(state.spills.observed); $('modelSpillSummary').innerHTML=spillSummaryHtml(state.spills.model); $('obsMonthly').innerHTML=monthlyTable(state.spills.observed); $('modelMonthly').innerHTML=monthlyTable(state.spills.model);
  const rows=[]; for(const [name,r] of [['Observed',state.spills.observed],['Modelled',state.spills.model]]) for(const e of r?.events||[]) rows.push(`<tr><td>${name}</td><td>${esc(e.start)}</td><td>${esc(e.end)}</td><td>${fmt(Number(e.duration_seconds)/3600,3)}</td></tr>`); $('eventBody').innerHTML=rows.join('');
}

async function runStorage(){
  const level=mappingObject($('storageLevelSelect').value), flow=mappingObject($('storageFlowSelect').value); if(!level||!flow){alert('Select modelled level and overflow flow series.');return;} if($('storageThreshold').value===''){alert('Set the modelled level threshold.');return;}
  const r=await engine.call('storage_result',{level_path:level.item.virtualPath,level_col:level.col,flow_path:flow.item.virtualPath,flow_col:flow.col,threshold:Number($('storageThreshold').value),exclusions_json:JSON.stringify(exclusionPayload()),target_count:Number($('targetCount').value||10),max_gap_seconds:Number($('gapInput').value||900)});
  $('storageSummary').innerHTML=(r.screening||[]).map(x=>`<div class="summary-box"><div><strong>${x.year}</strong><span>year</span></div><div><strong>${fmt(x.required_storage_m3,2)} m³</strong><span>idealised required storage</span></div><div><strong>${x.physical_blocks}</strong><span>counting blocks</span></div><div><strong>${fmt(x.max_block_volume_m3,2)} m³</strong><span>maximum block</span></div><div><strong>${fmt(x.annual_block_volume_m3,2)} m³</strong><span>annual block volume</span></div><div><strong>${x.target_count}</strong><span>target count</span></div></div>`).join('')||'<div class="pool-summary">No counted spill blocks.</div>';
  $('storageBody').innerHTML=(r.blocks||[]).map(x=>`<tr><td>${x.year}</td><td>${x.counting_block}</td><td>${esc(x.start)}</td><td>${esc(x.end)}</td><td>${fmt(x.volume_m3,3)}</td><td>${x.physical_discharges}</td></tr>`).join('');
}

function workspaceObject(){
  return {schema_version:1,application:'ICM Calibration Workbench GitHub Pages',saved_at:new Date().toISOString(),source_references:[...state.files.values()].filter(x=>x.status==='ready').map(x=>({name:x.file.name,display_name:x.displayName,size:x.file.size,last_modified:x.file.lastModified,sha256:x.hash,format:x.parsed.format,columns:x.parsed.columns})),mapping:{observed:workspaceSeries(state.mapping.observed),models:state.mapping.models.map(workspaceSeries).filter(Boolean),rain:workspaceSeries(state.mapping.rain)},analysis:{max_gap_seconds:Number($('gapInput').value||900),observed_threshold:nullableNumber($('obsThreshold').value),model_threshold:nullableNumber($('modelThreshold').value),time_offset_minutes:Number($('offsetInput').value||0),storage_threshold:nullableNumber($('storageThreshold').value),target_count:Number($('targetCount').value||10),storage_level:workspaceSeries($('storageLevelSelect').value),storage_flow:workspaceSeries($('storageFlowSelect').value)},exclusions:exclusionPayload()};
}
function nullableNumber(v){return v===''?null:Number(v)}
function workspaceSeries(key){const x=mappingObject(key);return x?{sha256:x.item.hash,display_name:x.item.displayName,file_name:x.item.file.name,column:x.col}:null}
function downloadBlob(name,content,type='application/octet-stream'){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
function downloadWorkspace(){const w=workspaceObject();downloadBlob(`icm-workbench-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(w,null,2),'application/json');$('workspaceStatus').textContent='Workspace downloaded. Raw files were not embedded.';}
function findSeriesFromWorkspace(ref){if(!ref)return '';const item=[...state.files.values()].find(x=>x.hash===ref.sha256)||[...state.files.values()].find(x=>x.displayName===ref.display_name||x.file.name===ref.file_name);return item&&item.parsed?.columns.includes(ref.column)?sourceKey(item.id,ref.column):''}
async function loadWorkspaceFile(file){
  const w=JSON.parse(await file.text()); renderSeriesOptions(); state.mapping.observed=findSeriesFromWorkspace(w.mapping?.observed); state.mapping.models=(w.mapping?.models||[]).map(findSeriesFromWorkspace).filter(Boolean); state.mapping.rain=findSeriesFromWorkspace(w.mapping?.rain); $('observedSelect').value=state.mapping.observed; [...$('modelSelect').options].forEach(o=>o.selected=state.mapping.models.includes(o.value)); $('rainSelect').value=state.mapping.rain;
  const a=w.analysis||{}; $('gapInput').value=a.max_gap_seconds??900; $('obsThreshold').value=a.observed_threshold??''; $('modelThreshold').value=a.model_threshold??''; $('offsetInput').value=a.time_offset_minutes??0; $('storageThreshold').value=a.storage_threshold??''; $('targetCount').value=a.target_count??10; state.exclusions=(w.exclusions||[]).map(x=>({id:crypto.randomUUID(),start:x.start,end:x.end,reason:x.reason||''})); renderExclusions(); $('storageLevelSelect').value=findSeriesFromWorkspace(a.storage_level); $('storageFlowSelect').value=findSeriesFromWorkspace(a.storage_flow);
  const expected=(w.source_references||[]).length, matched=(w.source_references||[]).filter(r=>[...state.files.values()].some(x=>x.hash===r.sha256)).length; $('workspaceStatus').textContent=`Workspace loaded. ${matched}/${expected} source fingerprint(s) matched the current pool.`; await applyMapping();
}

async function downloadReport(){
  if(!state.mapping.observed){alert('Apply a mapping before exporting the report.');return;}
  let timeImg='',scatterImg='',residImg=''; try{timeImg=await Plotly.toImage($('timeChart'),{format:'svg',width:1200,height:620});}catch{} try{scatterImg=await Plotly.toImage($('scatterChart'),{format:'svg',width:600,height:420});}catch{} try{residImg=await Plotly.toImage($('residualChart'),{format:'svg',width:600,height:420});}catch{}
  const w=workspaceObject(); const scenarioRows=state.comparisons.map(x=>x.result?`<tr><td>${esc(x.model.item.displayName)} · ${esc(x.model.col)}</td><td>${x.result.metrics.pairs??'—'}</td><td>${fmt(x.result.metrics.rmse)}</td><td>${fmt(x.result.metrics.mean_bias)}</td><td>${fmt(x.result.metrics.r2_correlation)}</td><td>${fmt(x.result.metrics.nse)}</td></tr>`:'').join('');
  const exRows=w.exclusions.map(x=>`<tr><td>${esc(x.start)}</td><td>${esc(x.end)}</td><td>${esc(x.reason)}</td></tr>`).join('');
  const html=`<!doctype html><meta charset="utf-8"><title>ICM Calibration Workbench Report</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:28px;color:#16202a}h1{font-size:24px}h2{font-size:17px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:5px}table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid #ddd;padding:7px;text-align:left;font-size:12px}th{background:#f3f6f8}img{max-width:100%;height:auto}.note{background:#f3f6f8;padding:10px;border-left:3px solid #0a66c2}.page{page-break-after:always}</style><h1>ICM Calibration Workbench — Engineering Review</h1><div class="note">Generated ${esc(new Date().toLocaleString())}. Source data were processed locally in the browser. Exclusions and source SHA-256 fingerprints are included below.</div><h2>Mappings</h2><pre>${esc(JSON.stringify(w.mapping,null,2))}</pre>${timeImg?`<h2>Time series</h2><img src="${timeImg}">`:''}<div class="page"></div><h2>Scenario comparison</h2><table><thead><tr><th>Scenario</th><th>Pairs</th><th>RMSE</th><th>Bias</th><th>R²</th><th>NSE</th></tr></thead><tbody>${scenarioRows}</tbody></table>${scatterImg?`<img src="${scatterImg}">`:''}${residImg?`<img src="${residImg}">`:''}<h2>Spill summary</h2>${spillSummaryHtml(state.spills.observed)}${spillSummaryHtml(state.spills.model)}<h2>Exclusions</h2><table><thead><tr><th>Start</th><th>End</th><th>Reason</th></tr></thead><tbody>${exRows}</tbody></table><h2>Source fingerprints</h2><pre>${esc(JSON.stringify(w.source_references,null,2))}</pre>`;
  downloadBlob(`icm-workbench-report-${new Date().toISOString().slice(0,10)}.html`,html,'text/html'); $('workspaceStatus').textContent='HTML engineering report downloaded.';
}

async function fileFromEntry(entry,path=''){
  if(entry.isFile) return new Promise(resolve=>entry.file(f=>{f._relativePath=path+f.name;resolve([f])}));
  if(entry.isDirectory){ const reader=entry.createReader(); const all=[]; while(true){const batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!batch.length)break;for(const child of batch)all.push(...await fileFromEntry(child,`${path}${entry.name}/`));} return all; }
  return [];
}
async function chooseFolder(){
  if('showDirectoryPicker' in window){ try{ const handle=await window.showDirectoryPicker({mode:'read'}); const files=[]; async function walk(dir,prefix=''){for await(const [name,h] of dir.entries()){if(name.startsWith('.'))continue;if(h.kind==='file'){const f=await h.getFile();f._relativePath=prefix+name;files.push(f)}else await walk(h,`${prefix}${name}/`)}} await walk(handle); await ingestFiles(files); return;}catch(err){if(err.name==='AbortError')return;} }
  $('folderInput').click();
}

function wireEvents(){
  $('chooseFolderBtn').addEventListener('click',chooseFolder); $('addFilesBtn').addEventListener('click',()=>$('fileInput').click()); $('fileInput').addEventListener('change',e=>ingestFiles(e.target.files)); $('folderInput').addEventListener('change',e=>ingestFiles(e.target.files));
  $('clearPoolBtn').addEventListener('click',async()=>{state.files.clear();state.mapping={observed:'',models:[],rain:''};state.comparisons=[];state.spills={};await engine.clear();renderPool();renderSeriesOptions();Plotly.purge('timeChart');});
  const dz=$('dropzone'); ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag')})); ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag')})); dz.addEventListener('drop',async e=>{const files=[];for(const item of e.dataTransfer.items||[]){const entry=item.webkitGetAsEntry?.();if(entry)files.push(...await fileFromEntry(entry));else{const f=item.getAsFile();if(f)files.push(f)}}if(!files.length)files.push(...e.dataTransfer.files);await ingestFiles(files)});
  $('applyMappingBtn').addEventListener('click',applyMapping); $('refreshGraphBtn').addEventListener('click',drawTimeChart); $('runCompareBtn').addEventListener('click',runCompare); $('addExclusionBtn').addEventListener('click',()=>addExclusionRow()); $('runSpillsBtn').addEventListener('click',runSpills); $('runStorageBtn').addEventListener('click',runStorage); $('downloadWorkspaceBtn').addEventListener('click',downloadWorkspace); $('loadWorkspaceBtn').addEventListener('click',()=>$('workspaceInput').click()); $('workspaceInput').addEventListener('change',e=>e.target.files[0]&&loadWorkspaceFile(e.target.files[0])); $('downloadReportBtn').addEventListener('click',downloadReport);
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));$(`tab-${btn.dataset.tab}`).classList.add('active');setTimeout(()=>window.dispatchEvent(new Event('resize')),0)}));
}

async function start(){
  wireEvents();renderPool();renderSeriesOptions();renderExclusions();
  try{await engine.boot();setEngineStatus('Reference Python engine ready · files remain local','ready');$('footerBuild').textContent='Reference engine: Python 3.13 via Pyodide 0.29.4';}
  catch(err){console.error(err);setEngineStatus(`Engine failed: ${err.message||err}`,'error');$('poolSummary').textContent='The browser Python engine did not start. Reload with network access to the Pyodide CDN.';}
}
start();
