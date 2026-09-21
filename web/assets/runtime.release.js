const $ = (id) => document.getElementById(id);
const state = {
  files: new Map(), mapping: { observed: '', models: [], rain: '' }, comparisons: [],
  spills: {}, exclusions: [], exclusionHistory: [], rainEvents: [], modelColours: {}, storage: null,
};
const diagnostic = {
  status: 'booting', errors: [],
  stateSummary: () => ({
    files: state.files.size,
    readyFiles: [...state.files.values()].filter(x => x.status === 'ready').length,
    observedMapped: Boolean(state.mapping.observed),
    modelCount: state.mapping.models.length,
    rainfallMapped: Boolean(state.mapping.rain),
    exclusions: exclusionPayload(false).length,
  }),
};
window.__ICM_WORKBENCH__ = diagnostic;
diagnostic.sourcePoolRevision = 0;
function notifySourcePoolChanged(reason='changed'){
  const detail={
    reason,
    revision:++diagnostic.sourcePoolRevision,
    fileCount:state.files.size,
    readyFiles:[...state.files.values()].filter(item=>item.status==='ready').length,
  };
  diagnostic.sourcePool=detail;
  window.dispatchEvent(new CustomEvent('icm:source-pool-changed',{detail}));
}
const buildToken=document.querySelector('meta[name="icm-build-sha"]')?.content||'local';
diagnostic.buildToken=buildToken;

const recognised = (name) => { const n=String(name||'').toLowerCase(); return n.endsWith('.hyd')||n.endsWith('.csv')||n.endsWith('.fdv')||n.endsWith('.fdv.txt')||n.endsWith('.r')||n.endsWith('.r.txt'); };
const esc = (s) => String(s ?? '').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const fmt = (v,digits=4) => (v===null||v===undefined||Number.isNaN(Number(v)))?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:digits});
const mb = (n) => `${(Number(n||0)/1048576).toFixed(2)} MB`;
const palette=['#0008ff','#ef7d00','#2e8b57','#7c4dff','#c43d6f','#008b95','#7a5c00','#5b6d7e'];
const nullableNumber=(v)=>v===''?null:Number(v);
const sourceKey=(id,col)=>JSON.stringify([id,col]);
const parseSourceKey=(v)=>{try{return JSON.parse(v)}catch{return['','']}};
const seriesLabel=(item,col)=>`${item.displayName} — ${col}`;
const baseFileName=(item)=>String(item?.displayName||item?.file?.name||'source').split(/[\\/]/).pop();
function seriesMetadata(item,col){
  const metadata=item?.parsed?.metadata||{};
  return metadata.channels?.[col]||metadata.series_metadata?.[col]||{};
}
function seriesQuantity(item,col){
  const metadata=item?.parsed?.metadata||{}, detail=seriesMetadata(item,col);
  return detail.quantity||metadata.quantity_by_column?.[col]||metadata.quantity||null;
}
function seriesUnit(item,col){
  const metadata=item?.parsed?.metadata||{}, detail=seriesMetadata(item,col);
  return detail.canonical_unit||metadata.canonical_unit||detail.original_unit||metadata.original_unit||null;
}
function isAuxiliarySeries(item,col){
  const token=String(col||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  return ['second','seconds','elapsedsecond','elapsedseconds','simulationsecond','simulationseconds','timeindex','timestep','timesteps','row','rowid','index'].includes(token);
}
function hydraulicSeriesForItem(item){
  if(!item||item.status!=='ready')return[];
  const columns=(item.parsed?.columns||[]).filter(col=>!isAuxiliarySeries(item,col));
  const order=['depth','flow','velocity'];
  const byQuantity=new Map();
  for(const col of columns){
    const quantity=String(seriesQuantity(item,col)||'').toLowerCase();
    if(order.includes(quantity)&&!byQuantity.has(quantity))byQuantity.set(quantity,col);
  }
  return order.filter(q=>byQuantity.has(q)).map(q=>({item,col:byQuantity.get(q),quantity:q,key:sourceKey(item.id,byQuantity.get(q))}));
}
function observedGraphSeries(){
  const selected=mappingObject(state.mapping.observed);
  if(!selected)return[];
  if(String(selected.item?.parsed?.format||'')==='fdv_ascii'){
    const hydraulic=hydraulicSeriesForItem(selected.item);
    if(hydraulic.length>=2)return hydraulic;
  }
  return [{...selected,quantity:seriesQuantity(selected.item,selected.col),key:state.mapping.observed}];
}
function compactGraphRole(role,item,col){
  const quantity=String(seriesQuantity(item,col)||'').toLowerCase();
  const qLabel={depth:'Depth',flow:'Flow',velocity:'Velocity',level:'Level',rainfall:'Rainfall'}[quantity]||'';
  const fdv=String(item?.parsed?.format||'')==='fdv_ascii'&&hydraulicSeriesForItem(item).length>=2;
  return `${role}${fdv&&qLabel?' '+qLabel:''} (${baseFileName(item)})`;
}
const safeName=(name)=>String(name).replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120);
const modelClock=(v)=>String(v||'').trim().replace(' ','T').slice(0,19);
const toLocalInput=(v)=>modelClock(v);
const setEngineStatus=(text,kind='booting')=>{$('engineStatus').innerHTML=`<span class="status-dot ${kind}"></span><span>${esc(text)}</span>`;};
let operationDepth=0;
function operationLabel(target){
  const labels={
    poolSummary:'Loading and parsing source data',
    mappingStatus:'Updating mapped graph',
    metricGrid:'Running model verification',
    ratingSummary:'Fitting hydraulic diagnostic',
    dwfSummary:'Calculating dry-weather baseline',
    rainEventSummary:'Assessing rainfall events',
    healthBody:'Assessing survey data',
    obsSpillSummary:'Calculating spill assessment',
    storageSummary:'Calculating storage diagnostic',
    workspaceStatus:'Preparing workspace / report',
    surveyAssociationStatus:'Reading survey configuration',
    completeSurveyStatus:'Running complete survey assessment',
    surveyBalanceSummary:'Calculating flow continuity diagnostic',
    professionalSurveyStatus:'Running professional survey assessment',
  };
  return labels[target]||'Processing engineering workflow';
}
function ensureOperationOverlay(){
  let root=document.getElementById('globalOperation');
  if(root)return root;
  root=document.createElement('div');
  root.id='globalOperation';
  root.className='global-operation';
  root.hidden=true;
  root.setAttribute('role','status');
  root.setAttribute('aria-live','polite');
  root.innerHTML='<div class="global-operation-card"><span class="global-operation-spinner" aria-hidden="true"></span><div class="global-operation-copy"><strong id="globalOperationTitle">Processing…</strong><span id="globalOperationDetail">Please wait while the current operation completes.</span><div class="global-operation-track"><span id="globalOperationBar"></span></div></div><button type="button" class="btn quiet global-operation-cancel" id="globalOperationCancel">Cancel</button></div>';
  document.body.appendChild(root);
  root.querySelector('#globalOperationCancel')?.addEventListener('click',()=>cancelCurrentOperation());
  return root;
}
function operationUpdate(title,progress=null,detail='Please wait before starting another operation.'){
  const root=ensureOperationOverlay();
  root.hidden=false;
  document.body.classList.add('operation-busy');
  const titleEl=document.getElementById('globalOperationTitle');
  const detailEl=document.getElementById('globalOperationDetail');
  const bar=document.getElementById('globalOperationBar');
  if(titleEl)titleEl.textContent=title||'Processing…';
  if(detailEl)detailEl.textContent=detail||'Please wait before starting another operation.';
  if(bar){
    if(progress===null||progress===undefined||!Number.isFinite(Number(progress))){
      bar.classList.add('indeterminate');
      bar.style.width='38%';
    }else{
      bar.classList.remove('indeterminate');
      bar.style.width=`${Math.max(0,Math.min(100,Number(progress)))}%`;
    }
  }
}
function operationBegin(target){
  operationDepth+=1;
  operationUpdate(operationLabel(target),null);
}
function operationEnd(){
  operationDepth=Math.max(0,operationDepth-1);
  if(operationDepth)return;
  const root=document.getElementById('globalOperation');
  if(root)root.hidden=true;
  document.body.classList.remove('operation-busy');
}
async function operationPaint(){await new Promise(resolve=>requestAnimationFrame(()=>resolve()));}
const showError=(target,message)=>{const el=$(target);if(el)el.innerHTML=`<div class="privacy-note audit-bad"><strong>Operation failed:</strong> ${esc(message)}</div>`;diagnostic.errors.push({time:new Date().toISOString(),target,message:String(message)});console.error(message);};
async function guarded(target,fn){
  operationBegin(target);
  try{
    await operationPaint();
    return await fn();
  }catch(err){
    showError(target,err?.message||err);
    return null;
  }finally{
    operationEnd();
  }
}

class BrowserFastPathEngine {
  constructor(){this.worker=null;this.sequence=0;this.pending=new Map();}
  _spawn(){
    if(this.worker)return;
    if(typeof Worker!=='function')throw new Error('Web Workers are not available in this browser.');
    this.worker=new Worker('assets/fastpath-worker.js?v='+encodeURIComponent(buildToken));
    this.worker.addEventListener('message',event=>{
      const message=event.data||{},entry=this.pending.get(message.id);
      if(!entry)return;
      this.pending.delete(message.id);
      if(message.ok)entry.resolve(message.result);
      else entry.reject(new Error(message.error||'FastPath preview worker failed.'));
    });
    this.worker.addEventListener('error',event=>{
      const error=new Error(event&&event.message||'FastPath preview worker failed.');
      for(const [,entry] of this.pending)entry.reject(error);
      this.pending.clear();this.worker=null;
    });
  }
  _request(type,payload={},transfer=[]){
    this._spawn();
    const id='fastpath-'+(++this.sequence);
    return new Promise((resolve,reject)=>{
      this.pending.set(id,{resolve,reject});
      try{this.worker.postMessage({id:id,type:type,...payload},transfer);}
      catch(error){this.pending.delete(id);reject(error);}
    });
  }
  async parse(item,buffer,maxPoints=15000){
    const copy=buffer.slice(0);
    return this._request('parse',{name:item.file.name,bytes:copy,maxPoints:maxPoints},[copy]);
  }
  terminate(){
    if(this.worker)this.worker.terminate();
    this.worker=null;
    for(const [,entry] of this.pending)entry.reject(new Error('FastPath worker restarted.'));
    this.pending.clear();
  }
}
class BrowserPythonEngine {
  constructor(){
    this.worker=null;
    this.ready=false;
    this.sequence=0;
    this.pending=new Map();
    this.booting=null;
  }
  _spawn(){
    if(typeof Worker!=='function')throw new Error('Web Workers are not available in this browser.');
    this.worker=new Worker(`assets/analysis-worker.js?v=${encodeURIComponent(buildToken)}`);
    this.worker.addEventListener('message',event=>this._message(event.data||{}));
    this.worker.addEventListener('error',event=>{
      const message=event?.message||'Python analysis worker failed.';
      diagnostic.errors.push({time:new Date().toISOString(),target:'analysis-worker',message});
      for(const [,entry] of this.pending)entry.reject(new Error(message));
      this.pending.clear();
      this.ready=false;
    });
  }
  _message(message){
    if(message.type==='progress'){
      diagnostic.worker={stage:message.stage,progress:message.percent,detail:message.detail,time:new Date().toISOString()};
      if(operationDepth>0&&message.stage!=='Analysis complete'){
        operationUpdate(message.stage,message.percent,message.detail||'Engineering calculation is running off the UI thread.');
      }
      return;
    }
    if(message.type!=='result')return;
    const entry=this.pending.get(message.id);
    if(!entry)return;
    this.pending.delete(message.id);
    if(message.ok)entry.resolve(message.result);
    else entry.reject(new Error(message.error||'Python analysis worker operation failed.'));
  }
  _request(type,payload={},transfer=[]){
    if(!this.worker)throw new Error('Python analysis worker has not started.');
    const id=`analysis-${++this.sequence}`;
    return new Promise((resolve,reject)=>{
      this.pending.set(id,{resolve,reject,type});
      try{this.worker.postMessage({id,type,...payload},transfer);}
      catch(error){this.pending.delete(id);reject(error);}
    });
  }
  async boot(){
    if(this.ready)return {ready:true,manifestCount:diagnostic.manifestCount,execution:'web-worker'};
    if(this.booting)return this.booting;
    this._spawn();
    this.booting=this._request('boot').then(info=>{
      this.ready=true;
      diagnostic.status='ready';
      diagnostic.execution='web-worker';
      diagnostic.manifestCount=Number(info?.manifestCount||0);
      diagnostic.workerBuildToken=info?.buildToken||null;
      if(diagnostic.workerBuildToken&&diagnostic.workerBuildToken!==buildToken){
        throw new Error(`Worker asset version mismatch: page ${buildToken}, worker ${diagnostic.workerBuildToken}.`);
      }
      return info;
    }).finally(()=>{this.booting=null;});
    return this.booting;
  }
  async addFile(item,bytes=null){
    if(!this.ready)throw new Error('Reference Python worker is not ready.');
    const payload=bytes instanceof Uint8Array?bytes:new Uint8Array(await item.file.arrayBuffer());
    const buffer=payload.byteOffset===0&&payload.byteLength===payload.buffer.byteLength?payload.buffer:payload.slice().buffer;
    return this._request('addFile',{path:item.virtualPath,bytes:buffer},[buffer]);
  }
  async call(name,args={},module='python_bridge'){
    if(!this.ready)throw new Error('Reference Python worker is not ready.');
    if(!['python_bridge','advanced_bridge'].includes(module))throw new Error('Unsupported browser bridge.');
    return this._request('call',{name,args,module});
  }
  async clear(){if(this.ready)return this._request('clear');return true;}
  async restart(items=[]){
    this.terminate('Operation cancelled; analysis worker is restarting.');
    const info=await this.boot();
    for(const item of items){
      if(!item?.file||item.status!=='ready')continue;
      const bytes=new Uint8Array(await item.file.arrayBuffer());
      await this.addFile(item,bytes);
    }
    return info;
  }
  terminate(reason='Analysis worker restarted.'){
    if(this.worker)this.worker.terminate();
    this.worker=null;
    this.ready=false;
    this.booting=null;
    for(const [,entry] of this.pending)entry.reject(new Error(reason));
    this.pending.clear();
  }
}
const engine=new BrowserPythonEngine();
const fastpathEngine=new BrowserFastPathEngine();
let engineBootPromise=null;
async function bootAuthoritativeEngine(){
  try{
    const info=await engine.boot();
    diagnostic.engineReadyAt=performance.now();
    setEngineStatus('Advanced analysis ready · authoritative Python engine','ready');
    if($('footerBuild'))$('footerBuild').textContent='Reference engine: Python via Pyodide 0.29.4 Web Worker · '+Number(info&&info.manifestCount||0)+' modules · FastPath preview worker';
    window.ICMProjectRegistry?.render();
    return info;
  }catch(err){
    diagnostic.status='failed';
    diagnostic.errors.push({time:new Date().toISOString(),target:'engine',message:String(err&&err.message||err)});
    console.error(err);
    setEngineStatus('Advanced analysis unavailable: '+String(err&&err.message||err),'error');
    throw err;
  }
}
function ensureEngineBoot(){
  if(!engineBootPromise)engineBootPromise=bootAuthoritativeEngine();
  return engineBootPromise;
}
let cancellingOperation=false;
async function cancelCurrentOperation(){
  if(cancellingOperation||!engine.worker)return;
  cancellingOperation=true;
  operationDepth+=1;
  const button=document.getElementById('globalOperationCancel');
  if(button)button.disabled=true;
  operationUpdate('Cancelling operation…',null,'Restarting the isolated analysis worker and restoring parsed source files.');
  try{
    const readyItems=[...state.files.values()].filter(item=>item.status==='ready');
    const info=await engine.restart(readyItems);
    diagnostic.status='ready';
    setEngineStatus('Reference Python worker ready · files remain local','ready');
    if($('footerBuild'))$('footerBuild').textContent=`Reference engine: Python via Pyodide 0.29.4 Web Worker · ${Number(info?.manifestCount||0)} modules`;
  }catch(err){
    diagnostic.status='failed';
    diagnostic.errors.push({time:new Date().toISOString(),target:'analysis-worker-restart',message:String(err?.message||err)});
    setEngineStatus(`Engine restart failed: ${err?.message||err}`,'error');
  }finally{
    cancellingOperation=false;
    if(button)button.disabled=false;
    operationEnd();
  }
}

async function sha256Bytes(buffer){const digest=await crypto.subtle.digest('SHA-256',buffer);return[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(file){return sha256Bytes(await file.arrayBuffer());}
function mappingObject(v){const[id,col]=parseSourceKey(v);const item=state.files.get(id);return item?{id,col,item}:null;}
function currentModels(){return state.mapping.models.map(mappingObject).filter(Boolean);}
function allSeries(){
  const registry=window.ICMProjectRegistry;
  if(registry){
    const rows=registry.listSeries().map(series=>{
      const item=state.files.get(series.sourceId);
      return item?{item,col:series.column,key:series.key,label:series.label,quantity:series.quantity,unit:series.unit,role:series.role,assetId:series.assetId}:null;
    }).filter(Boolean);
    if(rows.length)return rows;
  }
  const out=[];
  for(const item of state.files.values()){
    if(item.status!=='ready')continue;
    for(const col of item.parsed.columns||[]){
      if(isAuxiliarySeries(item,col))continue;
      out.push({item,col,key:sourceKey(item.id,col),label:seriesLabel(item,col),quantity:seriesQuantity(item,col),unit:seriesUnit(item,col)});
    }
  }
  return out;
}
function setOptions(select,all,{none=false,preserve=true}={}){const prev=preserve?select.value:'';select.innerHTML=(none?'<option value="">None</option>':'<option value="">Select…</option>')+all.map(s=>`<option value='${esc(s.key)}'>${esc(s.label)}</option>`).join('');if([...select.options].some(o=>o.value===prev))select.value=prev;}

function reconcileFastPath(item){
  const preview=item&&item.preview,parsed=item&&item.parsed;
  if(!preview||!preview.eligible||!parsed)return {status:'not-applicable',mismatches:[]};
  const mismatches=[];
  const same=(label,a,b)=>{if(String(a??'')!==String(b??''))mismatches.push({field:label,preview:a??null,authoritative:b??null});};
  same('format',preview.format,parsed.format);
  same('rows',Number(preview.rows),Number(parsed.rows));
  same('start',modelClock(preview.start),modelClock(parsed.start));
  same('end',modelClock(preview.end),modelClock(parsed.end));
  same('columns',JSON.stringify(preview.columns||[]),JSON.stringify(parsed.columns||[]));
  for(const s of preview.series||[]){
    if(!(parsed.columns||[]).includes(s.column)){mismatches.push({field:'series:'+s.column,preview:'present',authoritative:'missing'});continue;}
    same('quantity:'+s.column,s.quantity||null,seriesQuantity(item,s.column)||null);
    same('unit:'+s.column,s.canonical_unit||null,seriesUnit(item,s.column)||null);
  }
  return {status:mismatches.length?'mismatch':'matched',mismatches:mismatches};
}
function recordFastPath(item){
  diagnostic.fastpath=diagnostic.fastpath||{records:[]};
  const timing=item.fastpathTiming||{},record={
    id:item.id,name:item.displayName,size:item.file&&item.file.size||0,eligible:Boolean(item.preview&&item.preview.eligible),
    format:item.preview&&item.preview.format||null,status:item.status,reconciliation:item.fastpathReconciliation||null,
    t0:timing.t0??null,t1:timing.t1??null,t2:timing.t2??null,t3:timing.t3??null,t4:timing.t4??null,t5:timing.t5??null,t6:timing.t6??null,
    time_to_preview_graph_ms:timing.t4!=null&&timing.t0!=null?timing.t4-timing.t0:null,
    time_to_preview_statistics_ms:timing.t5!=null&&timing.t0!=null?timing.t5-timing.t0:null,
    time_to_authoritative_ready_ms:timing.t6!=null&&timing.t0!=null?timing.t6-timing.t0:null
  };
  const index=diagnostic.fastpath.records.findIndex(x=>x.id===item.id);
  if(index>=0)diagnostic.fastpath.records[index]=record;else diagnostic.fastpath.records.push(record);
  diagnostic.fastpath.last=record;
}
async function handoffFastPath(item){
  const active=window.ICMFastPath&&window.ICMFastPath.active?window.ICMFastPath.active():null;
  if(!active||active.sourceId!==item.id||item.status!=='ready')return;
  if(window.ICMFastPath&&window.ICMFastPath.markValidated)window.ICMFastPath.markValidated(item,item.fastpathReconciliation);
  const candidates=allSeries().filter(s=>s.item.id===item.id);
  const preferred=candidates.find(s=>String(s.quantity||'').toLowerCase()===active.mode)||
    candidates.find(s=>['depth','level','flow'].includes(String(s.quantity||'').toLowerCase()))||candidates[0];
  if(!preferred)return;
  if(String(preferred.quantity||'').toLowerCase()==='rainfall'){
    $('observedSelect').value='';
    $('rainSelect').value=preferred.key;
  }else{
    $('observedSelect').value=preferred.key;
  }
  [...$('modelSelect').options].forEach(o=>o.selected=false);
  if(window.ICMGraph&&window.ICMGraph.setChannel)window.ICMGraph.setChannel(active.mode,false);
  if(window.ICMGraph&&window.ICMGraph.applyMapping)await window.ICMGraph.applyMapping();
  if(window.ICMFastPath&&window.ICMFastPath.clear)window.ICMFastPath.clear();
}
async function importGuard(fn){
  try{return await fn();}
  catch(err){showError('poolSummary',err&&err.message||err);return null;}
}

async function ingestFiles(files){
  const list=[...files].filter(f=>f&&recognised(f.name));
  if(!list.length){$('poolSummary').textContent='No recognised CSV / FDV / R files found.';return;}
  let sourcePoolChanged=false,batchPreviewShown=false;
  const pending=[];
  $('poolSummary').textContent='Reading '+list.length+' source file'+(list.length===1?'':'s')+'…';
  for(let index=0;index<list.length;index+=1){
    const file=list[index],displayName=file.webkitRelativePath||file._relativePath||file.name;
    if([...state.files.values()].some(x=>x.displayName===displayName&&x.file.size===file.size&&x.file.lastModified===file.lastModified))continue;
    await operationPaint();
    const id=crypto.randomUUID(),item={
      id:id,file:file,displayName:displayName,virtualPath:'/data/'+id+'_'+safeName(file.name),status:'reading',parsed:null,preview:null,
      hash:null,error:null,loadSeconds:null,fastpathTiming:{t0:performance.now()}
    };
    state.files.set(id,item);sourcePoolChanged=true;renderPool();
    try{
      const buffer=await file.arrayBuffer();item.fastpathTiming.t1=performance.now();item._buffer=buffer;
      const hashPromise=sha256Bytes(buffer);
      const lower=file.name.toLowerCase(),previewEligible=lower.endsWith('.fdv')||lower.endsWith('.fdv.txt')||lower.endsWith('.csv')||lower.endsWith('.hyd');
      if(previewEligible){
        const fastResult=await fastpathEngine.parse(item,buffer,15000);
        item.fastpathTiming.t2=performance.now();
        item.preview=fastResult&&fastResult.parsed||null;
        item.fastpathTiming.t3=performance.now();
      }
      item.hash=await hashPromise;
      if(item.preview&&item.preview.eligible){
        item.status='preview-ready';
        if(!batchPreviewShown&&window.ICMFastPath&&window.ICMFastPath.renderPreview){
          batchPreviewShown=true;
          diagnostic.fastpathActiveSourceId=item.id;
          const painted=await window.ICMFastPath.renderPreview(item,null,true);
          item.fastpathTiming.t4=painted&&painted.graphPaintAt||performance.now();
          item.fastpathTiming.t5=painted&&painted.statsPaintAt||item.fastpathTiming.t4;
        }
      }else{
        item.status='waiting-engine';
        if(item.preview&&item.preview.error)item.previewWarning=item.preview.error;
      }
      pending.push(item);recordFastPath(item);renderPool();
    }catch(err){
      item.status='error';item.error=String(err&&err.message||err);
      diagnostic.errors.push({time:new Date().toISOString(),target:'source-fastpath',message:item.error,file:displayName});
      renderPool();
    }
  }

  if(!pending.length){if(sourcePoolChanged)notifySourcePoolChanged('ingest');return;}
  $('poolSummary').textContent=pending.filter(x=>x.preview&&x.preview.eligible).length+' preview-ready · initialising advanced analysis…';
  let engineInfo=null;
  try{engineInfo=await ensureEngineBoot();}
  catch(err){
    for(const item of pending){
      if(item.status==='error')continue;
      if(item.preview&&item.preview.eligible){item.status='preview-only';item.error='Advanced analysis unavailable; preview remains display-only.';}
      else{item.status='error';item.error='Advanced analysis unavailable and this format has no FastPath preview.';}
      recordFastPath(item);
    }
    renderPool();if(sourcePoolChanged)notifySourcePoolChanged('ingest');return;
  }

  for(let index=0;index<pending.length;index+=1){
    const item=pending[index];if(item.status==='error')continue;
    item.status='validating';renderPool();await operationPaint();
    const started=performance.now();
    try{
      const bytes=new Uint8Array(item._buffer);
      await engine.addFile(item,bytes);
      item._buffer=null;
      item.parsed=await engine.call('parse_source',{path:item.virtualPath});
      item.fastpathTiming.t6=performance.now();
      item.status='ready';
      item.fastpathReconciliation=reconcileFastPath(item);
      if(item.fastpathReconciliation.status==='mismatch'){
        diagnostic.errors.push({time:new Date().toISOString(),target:'fastpath-reconciliation',message:'FastPath preview differed from authoritative parse.',file:item.displayName,detail:item.fastpathReconciliation});
      }
      window.ICMProjectRegistry?.registerSource(item);
    }catch(err){
      item.status='error';item.error=String(err&&err.message||err);
      diagnostic.errors.push({time:new Date().toISOString(),target:'source-pool',message:item.error,file:item.displayName});
    }finally{
      item.loadSeconds=(performance.now()-started)/1000;
      recordFastPath(item);renderPool();renderSeriesOptions();
    }
  }
  const active=state.files.get(diagnostic.fastpathActiveSourceId);
  if(active&&active.status==='ready')await handoffFastPath(active);
  if(engineInfo&&$('poolSummary'))renderPool();
  if(sourcePoolChanged)notifySourcePoolChanged('ingest');
}
function renderPool(){
  const items=[...state.files.values()],ready=items.filter(x=>x.status==='ready').length,preview=items.filter(x=>['preview-ready','validating','preview-only'].includes(x.status)&&x.preview&&x.preview.eligible).length;
  $('poolSummary').textContent=items.length?items.length+' file(s) in the source pool · '+ready+' parsed successfully'+(preview?' · '+preview+' preview-ready/validating':'')+'.':'No files loaded.';
  $('poolBody').innerHTML=items.map(item=>{
    const p=item.parsed||item.preview||{},audit=p.audit||{};
    const sent=Number(audit.sentinel_count||0)+(audit.column_audit?Object.values(audit.column_audit).reduce((a,x)=>a+Number(x.sentinel_count||0),0):0);
    const malformed=Number(audit.malformed_rows||0)+Number(audit.invalid_timestamps||0);
    const period=p.start?esc(modelClock(p.start))+' → '+esc(modelClock(p.end)):'—';
    const statusLabel={reading:'Reading…','waiting-engine':'Waiting for advanced engine…','preview-ready':'Preview ready · validating…',validating:'Preview ready · validating…',ready:'Ready',error:'Error','preview-only':'Preview only · advanced unavailable'}[item.status]||item.status;
    const auditText=item.status==='error'?(item.error||'Failed'):(item.preview&&item.preview.eligible&&item.status!=='ready'?'FastPath structural preview':sent+' sentinel; '+malformed+' malformed/invalid');
    const reconcile=item.fastpathReconciliation&&item.fastpathReconciliation.status==='mismatch'?' · preview mismatch ⚠':item.fastpathReconciliation&&item.fastpathReconciliation.status==='matched'?' · preview validated':'';
    const status=item.status==='error'?'<span class="audit-bad">Error</span>':esc(statusLabel+reconcile)+(item.status==='ready'&&Number.isFinite(item.loadSeconds)?' · '+fmt(item.loadSeconds,1)+' s':'');
    return '<tr><td><div class="file-name">'+esc(item.displayName)+'</div><small>'+mb(item.file.size)+' · SHA '+(item.hash?item.hash.slice(0,10):'…')+'</small></td><td>'+esc(p.format||'—')+'</td><td>'+(p.rows??'—')+'</td><td>'+period+'</td><td class="'+((sent||malformed||(item.fastpathReconciliation&&item.fastpathReconciliation.status==='mismatch'))?'audit-warn':'audit-good')+'">'+esc(auditText)+'</td><td>'+status+'</td></tr>';
  }).join('');
}
function renderSeriesOptions(){
  const all=allSeries(),obs=$('observedSelect'),mod=$('modelSelect'),rain=$('rainSelect'),prevMods=[...mod.selectedOptions].map(o=>o.value);setOptions(obs,all);mod.innerHTML=all.map(s=>`<option value='${esc(s.key)}'>${esc(s.label)}</option>`).join('');[...mod.options].forEach(o=>o.selected=prevMods.includes(o.value));setOptions(rain,all,{none:true});
  for(const id of ['storageLevelSelect','storageFlowSelect','ratingObsDepth','ratingObsFlow','ratingModelDepth','ratingModelFlow','dwfFlowSelect'])setOptions($(id),all);
  autoSuggestMappings(all);autoSuggestAdvanced(all);renderModelColourControls();
}
function autoSuggestMappings(all){
  if(!$('observedSelect').value){
    const s=all.find(x=>x.role==='observed'&&['depth','level','flow'].includes(String(x.quantity||'').toLowerCase()))
      ||all.find(x=>/observ|edm|monitor/i.test(x.item.displayName)&&/depth|level|flow/i.test(x.col))
      ||all.find(x=>['depth','level'].includes(String(x.quantity||'').toLowerCase()));
    if(s)$('observedSelect').value=s.key;
  }
  if(!$('rainSelect').value){
    const s=all.find(x=>x.role==='rainfall'||String(x.quantity||'').toLowerCase()==='rainfall')
      ||all.find(x=>/rain/i.test(x.item.displayName)||/rain/i.test(x.col));
    if(s)$('rainSelect').value=s.key;
  }
}
function prefer(select,all,predicate){if(select.value)return;const s=all.find(predicate);if(s)select.value=s.key;}
function autoSuggestAdvanced(all){
  const obs=mappingObject($('observedSelect').value),model=mappingObject([...$('modelSelect').selectedOptions][0]?.value||'');
  const q=(s,name)=>String(s.quantity||seriesQuantity(s.item,s.col)||'').toLowerCase()===name;
  const depth=s=>q(s,'depth')||q(s,'level');
  prefer($('ratingObsDepth'),all,s=>(!obs||s.item.id===obs.item.id)&&depth(s));
  prefer($('ratingObsFlow'),all,s=>(!obs||s.item.id===obs.item.id)&&q(s,'flow'));
  prefer($('ratingModelDepth'),all,s=>(!model||s.item.id===model.item.id)&&depth(s));
  prefer($('ratingModelFlow'),all,s=>(!model||s.item.id===model.item.id)&&q(s,'flow'));
  prefer($('dwfFlowSelect'),all,s=>(!obs||s.item.id===obs.item.id)&&q(s,'flow'));
  prefer($('storageFlowSelect'),all,s=>q(s,'flow'));
  prefer($('storageLevelSelect'),all,s=>(!model||s.item.id===model.item.id)&&depth(s));
}
function renderModelColourControls(){const models=[...$('modelSelect').selectedOptions].map(o=>mappingObject(o.value)).filter(Boolean);$('modelColourControls').innerHTML=models.map((m,i)=>{const key=sourceKey(m.item.id,m.col);if(!state.modelColours[key])state.modelColours[key]=palette[i%palette.length];return `<label title="${esc(m.item.displayName)} · ${esc(m.col)}"><span class="colour-label-text">Model ${i+1} · ${esc(m.item.displayName)} · ${esc(m.col)}</span><input class="model-colour" aria-label="Model ${i+1} colour" data-key='${esc(key)}' type="color" value="${state.modelColours[key]}"></label>`;}).join('');document.querySelectorAll('.model-colour').forEach(x=>x.addEventListener('input',()=>{state.modelColours[x.dataset.key]=x.value;guarded('mappingStatus',drawTimeChart);}));}

async function applyMapping(){return window.ICMGraph?.applyMapping();}
async function seriesFor(key,maxPoints=25000){const x=mappingObject(key);if(!x)return null;return {...x,data:await engine.call('series_data',{path:x.item.virtualPath,column:x.col,max_points:maxPoints})};}
function inEvent(ts){const t=modelClock(ts);return state.rainEvents.some(e=>t>=modelClock(e.start)&&t<=modelClock(e.end));}
function graphShapes(){const shapes=[],a=nullableNumber($('obsThreshold').value),b=nullableNumber($('modelThreshold').value);if(a!==null)shapes.push({type:'line',xref:'paper',x0:0,x1:1,yref:'y',y0:a,y1:a,line:{color:$('threshold1Color').value,width:2,dash:'dash'}});if(b!==null)shapes.push({type:'line',xref:'paper',x0:0,x1:1,yref:'y',y0:b,y1:b,line:{color:$('threshold2Color').value,width:2,dash:'dash'}});if($('showEventOverlay').checked)for(const e of state.rainEvents)shapes.push({type:'rect',xref:'x',x0:e.start,x1:e.end,yref:'paper',y0:0,y1:1,fillcolor:$('rainEventColor').value,opacity:.1,line:{width:0},layer:'below'});return shapes;}
function graphAnnotations(){const out=[],a=nullableNumber($('obsThreshold').value),b=nullableNumber($('modelThreshold').value);if(a!==null)out.push({xref:'paper',x:1,yref:'y',y:a,text:$('threshold1Label').value,showarrow:false,xanchor:'right',yanchor:'bottom',font:{size:10,color:$('threshold1Color').value}});if(b!==null)out.push({xref:'paper',x:1,yref:'y',y:b,text:$('threshold2Label').value,showarrow:false,xanchor:'right',yanchor:'bottom',font:{size:10,color:$('threshold2Color').value}});if($('showEventOverlay').checked)for(const e of state.rainEvents)out.push({xref:'x',x:e.start,yref:'paper',y:1,text:`E${e.event}`,showarrow:false,yanchor:'bottom',font:{size:9,color:'#8a4b00'}});return out;}
async function drawTimeChart(){return window.ICMGraph?.draw();}

function analysisBounds(){return {start:modelClock($('analysisStart').value)||null,end:modelClock($('analysisEnd').value)||null};}
async function runCompare(){const obs=mappingObject(state.mapping.observed),models=currentModels();if(!obs||!models.length)throw new Error('Apply an observed and at least one modelled series first.');const gap=Number($('gapInput').value||900),offset=Number($('offsetInput').value||0),bounds=analysisBounds(),signature=analysisSignature(),config=workspaceObject();state.comparisons=[];for(const m of models){try{state.comparisons.push({model:m,result:await engine.call('compare_series',{obs_path:obs.item.virtualPath,obs_col:obs.col,model_path:m.item.virtualPath,model_col:m.col,max_gap_seconds:gap,offset_minutes:offset,...bounds,exclusions_json:JSON.stringify([...exclusionPayload(true,'observed',state.mapping.observed),...exclusionPayload(true,'model',sourceKey(m.id,m.col))])})});}catch(err){state.comparisons.push({model:m,error:String(err?.message||err)});}}await renderComparisons();state.comparisonSnapshot={signature,config,results:JSON.parse(JSON.stringify(state.comparisons.map(x=>({model:workspaceSeries(sourceKey(x.model.id,x.model.col)),result:x.result,error:x.error}))))};}
const metricCard=(k,v)=>`<div class="metric"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;
async function renderComparisons(){const ok=state.comparisons.filter(x=>x.result),first=ok[0];if(!first){const issues=state.comparisons.map(x=>({name:`${x.model?.item?.displayName||'Model'} · ${x.model?.col||'series'}`,error:x.error||'Comparison returned no usable result.'}));$('metricGrid').innerHTML='<div class="pool-summary audit-bad"><strong>Comparison could not be calculated.</strong><br>'+issues.map(x=>esc(x.name)+': '+esc(x.error)).join('<br>')+'<br><small>Check quantity mapping, the shared analysis period, exclusions and the maximum interpolation gap. The error above is retained instead of hiding it behind a generic “no pairs” message.</small></div>';$('scenarioBody').innerHTML=issues.map(x=>'<tr><td>'+esc(x.name)+'</td><td colspan="8" class="audit-bad">'+esc(x.error)+'</td></tr>').join('');return;}const m=first.result.metrics||{},status=first.result.calculation_status||'unavailable',coverage=first.result.coverage_fraction;$('metricGrid').innerHTML=[['Calculation status',status],['Valid support',coverage===null||coverage===undefined?'—':fmt(Number(coverage)*100,2)+'%'],['Pairs',m.pairs],['RMSE',fmt(m.rmse)],['MAE',fmt(m.mae)],['Mean bias',fmt(m.mean_bias)],['R²',fmt(m.r2_correlation)],['NSE',fmt(m.nse)],['KGE 2009',fmt(m.kge_2009)],['Obs peak',fmt(m.obs_peak)],['Model peak',fmt(m.sim_peak)],['Peak lag min',fmt(m.peak_timing_minutes_model_minus_observed,2)]].map(([k,v])=>metricCard(k,v)).join('');diagnostic.lastComparisonValidity={status,coverage};let p=first.result.paired||[];const log=$('scatterScale').value==='log';if(log)p=p.filter(x=>Number(x.obs)>0&&Number(x.sim)>0);const vals=p.flatMap(x=>[Number(x.obs),Number(x.sim)]).filter(Number.isFinite),lo=Math.min(...vals),hi=Math.max(...vals),scatter=[{x:p.map(x=>x.obs),y:p.map(x=>x.sim),mode:'markers',name:'Paired',marker:{size:5,opacity:.5,color:'#0a66c2'}}];if(Number.isFinite(lo)&&Number.isFinite(hi))scatter.push({x:[lo,hi],y:[lo,hi],mode:'lines',name:'1:1',line:{dash:'dash',color:'#667085'}});await Plotly.react('scatterChart',scatter,{template:'plotly_white',title:`Observed vs modelled${log?' — log scale':''}`,xaxis:{title:'Observed',type:log?'log':'linear'},yaxis:{title:'Modelled',type:log?'log':'linear'},margin:{l:55,r:20,t:45,b:50}},{responsive:true,displaylogo:false});await Plotly.react('residualChart',[{x:p.map(x=>x.timestamp),y:p.map(x=>x.residual),mode:'lines',name:'Model − observed',line:{color:'#a62929',width:1.4}}],{template:'plotly_white',title:'Residual through time',xaxis:{title:'Time'},yaxis:{title:'Residual'},margin:{l:55,r:20,t:45,b:50}},{responsive:true,displaylogo:false});const obs=mappingObject(state.mapping.observed),d=await engine.call('diagnostic_result',{obs_path:obs.item.virtualPath,obs_col:obs.col,model_path:first.model.item.virtualPath,model_col:first.model.col,max_gap_seconds:Number($('gapInput').value||900),offset_minutes:Number($('offsetInput').value||0),...analysisBounds(),exclusions_json:JSON.stringify([...exclusionPayload(true,'observed',state.mapping.observed),...exclusionPayload(true,'model',sourceKey(first.model.id,first.model.col))])}),cum=d.cumulative||[];await Plotly.react('cumulativeChart',[{x:cum.map(x=>x.timestamp),y:cum.map(x=>x.obs_cumulative_m3),name:'Observed cumulative',mode:'lines',line:{color:$('obsColor').value}},{x:cum.map(x=>x.timestamp),y:cum.map(x=>x.sim_cumulative_m3),name:'Model cumulative',mode:'lines',line:{color:state.modelColours[sourceKey(first.model.id,first.model.col)]||palette[0]}}],{template:'plotly_white',title:d.flow_diagnostics_available?'Cumulative volume':'Unavailable — flow inputs and unmasked support required',xaxis:{title:'Time'},yaxis:{title:/flow/i.test(obs.col)?'m³':'value × s'},margin:{l:55,r:20,t:45,b:50}},{responsive:true,displaylogo:false});const oe=d.observed_exceedance||[],me=d.modelled_exceedance||[],okey=oe.length?Object.keys(oe[0]).find(k=>!['exceedance_fraction','weight'].includes(k)):null,mkey=me.length?Object.keys(me[0]).find(k=>!['exceedance_fraction','weight'].includes(k)):null;await Plotly.react('exceedanceChart',[{x:oe.map(x=>100*x.exceedance_fraction),y:oe.map(x=>x[okey]),name:'Observed',mode:'lines',line:{color:$('obsColor').value}},{x:me.map(x=>100*x.exceedance_fraction),y:me.map(x=>x[mkey]),name:'Modelled',mode:'lines',line:{color:state.modelColours[sourceKey(first.model.id,first.model.col)]||palette[0]}}],{template:'plotly_white',title:d.flow_diagnostics_available?'Flow duration — left-support time weighting':'Unavailable — flow inputs and unmasked support required',xaxis:{title:'Exceedance %'},yaxis:{title:'Value'},margin:{l:55,r:20,t:45,b:50}},{responsive:true,displaylogo:false});$('scenarioBody').innerHTML=state.comparisons.map(x=>{const q=x.result?.metrics||{};return `<tr><td>${esc(x.model.item.displayName)} · ${esc(x.model.col)}</td><td>${q.pairs??'—'}</td><td>${fmt(q.rmse)}</td><td>${fmt(q.mae)}</td><td>${fmt(q.mean_bias)}</td><td>${fmt(q.r2_correlation)}</td><td>${fmt(q.nse)}</td><td>${fmt(q.kge_2009)}</td><td>${fmt(q.peak_timing_minutes_model_minus_observed,2)}</td></tr>`;}).join('');}
function useGraphZoom(){const r=$('timeChart')?.layout?.xaxis?.range;if(r?.length===2){$('analysisStart').value=toLocalInput(r[0]);$('analysisEnd').value=toLocalInput(r[1]);}}

async function runRating(){
  const od=mappingObject($('ratingObsDepth').value),of=mappingObject($('ratingObsFlow').value),md=mappingObject($('ratingModelDepth').value),mf=mappingObject($('ratingModelFlow').value);
  if(!od)throw new Error('Select observed depth.');
  const gap=Number($('gapInput').value||900);

  // Depth-only mode is deliberately supported because calibration review often
  // needs an observed-depth vs model-depth fitted relationship before flow is mapped.
  if(md && (!of || !mf)){
    const depth=await engine.call('compare_series',{
      obs_path:od.item.virtualPath,obs_col:od.col,
      model_path:md.item.virtualPath,model_col:md.col,
      max_gap_seconds:gap,...analysisBounds(),
      exclusions_json:JSON.stringify([
        ...exclusionPayload(true,'observed',sourceKey(od.item.id,od.col)),
        ...exclusionPayload(true,'model',sourceKey(md.item.id,md.col)),
      ]),
    });
    const points=(depth.paired||[]).map(x=>({x:Number(x.obs),y:Number(x.sim)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    if(points.length<2)throw new Error('Depth comparison has fewer than 2 bounded valid pairs in the selected analysis period.');
    const n=points.length,meanX=points.reduce((s,p)=>s+p.x,0)/n,meanY=points.reduce((s,p)=>s+p.y,0)/n;
    const sxx=points.reduce((s,p)=>s+(p.x-meanX)**2,0),sxy=points.reduce((s,p)=>s+(p.x-meanX)*(p.y-meanY),0);
    const slope=sxx>0?sxy/sxx:0,intercept=meanY-slope*meanX;
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),lo=Math.min(...xs,...ys),hi=Math.max(...xs,...ys);
    const metrics=depth.metrics||{};
    $('ratingSummary').innerHTML=`<div class="summary-box"><div><strong>${fmt(n,0)}</strong><span>Depth pairs</span></div><div><strong>${fmt(metrics.rmse,4)}</strong><span>Depth RMSE</span></div><div><strong>${fmt(metrics.mean_bias,4)}</strong><span>Mean error (model − observed)</span></div><div><strong>${fmt(metrics.r2_correlation,4)}</strong><span>R²</span></div><div><strong>Hsim = ${fmt(intercept,4)} + ${fmt(slope,4)} Hobs</strong><span>Least-squares depth fit</span></div></div><div class="pool-summary">Depth-only agreement fit. Add observed and model flow selections to switch to the hydraulic Q = aHᵇ flow–depth rating diagnostic.</div>`;
    const traces=[
      {x:xs,y:ys,mode:'markers',name:'Paired depth',marker:{size:5,opacity:.38,color:$('obsColor').value}},
      {x:[lo,hi],y:[lo,hi],mode:'lines',name:'1:1',line:{dash:'dash',color:'#667085'}},
      {x:[lo,hi],y:[intercept+slope*lo,intercept+slope*hi],mode:'lines',name:'Fitted depth relation',line:{color:state.modelColours[sourceKey(md.item.id,md.col)]||palette[0],width:2}},
    ];
    await Plotly.react('ratingChart',traces,{template:'plotly_white',title:'Observed depth vs modelled depth',legend:{orientation:'h',y:1.12,x:0},xaxis:{title:'Observed depth'},yaxis:{title:'Modelled depth'},margin:{l:60,r:24,t:72,b:56}},{responsive:true,displaylogo:false});
    return;
  }

  if(!of)throw new Error('For a flow–depth rating curve, select observed flow. Alternatively select observed depth + model depth for depth-only agreement fitting.');
  const args={obs_depth_path:od.item.virtualPath,obs_depth_col:od.col,obs_flow_path:of.item.virtualPath,obs_flow_col:of.col,max_gap_seconds:gap};
  if(md&&mf)Object.assign(args,{model_depth_path:md.item.virtualPath,model_depth_col:md.col,model_flow_path:mf.item.virtualPath,model_flow_col:mf.col});
  const r=await engine.call('rating_sources_result',args,'advanced_bridge'),o=r.observed||{},m=r.modelled||null;
  $('ratingSummary').innerHTML=`<div class="summary-box"><div><strong>${o.ok?`Q=${fmt(o.a,4)}H^${fmt(o.b,4)}`:'Unavailable'}</strong><span>Observed fit</span></div><div><strong>${o.ok?fmt(o.r2,4):'—'}</strong><span>Observed R²</span></div><div><strong>${m?.ok?`Q=${fmt(m.a,4)}H^${fmt(m.b,4)}`:'Unavailable'}</strong><span>Model fit</span></div><div><strong>${m?.ok?fmt(m.r2,4):'—'}</strong><span>Model R²</span></div></div>`;
  const traces=[];
  for(const[label,fit,color]of[['Observed',o,$('obsColor').value],['Modelled',m,md?(state.modelColours[sourceKey(md.item.id,md.col)]||palette[0]):palette[0]]]){
    if(!fit?.ok)continue;
    const pts=fit.points||[];
    traces.push({x:pts.map(x=>x.depth),y:pts.map(x=>x.flow),mode:'markers',name:label,marker:{size:5,opacity:.35,color}});
    const x=Array.from({length:80},(_,i)=>fit.depth_min+(fit.depth_max-fit.depth_min)*i/79);
    traces.push({x,y:x.map(h=>fit.a*h**fit.b),mode:'lines',name:`${label} fit`,line:{color,width:2}});
  }
  await Plotly.react('ratingChart',traces,{template:'plotly_white',title:'Flow–depth rating',legend:{orientation:'h',y:1.12,x:0},xaxis:{title:'Depth'},yaxis:{title:'Flow'},margin:{l:60,r:24,t:72,b:56}},{responsive:true,displaylogo:false});
}
async function runDwf(){const flow=mappingObject($('dwfFlowSelect').value),rain=mappingObject(state.mapping.rain);if(!flow)throw new Error('Select observed flow.');const r=await engine.call('dwf_scaled',{flow_path:flow.item.virtualPath,flow_col:flow.col,rain_path:rain?.item.virtualPath||null,rain_col:rain?.col||'rainfall',rain_factor:Number($('rainFactor').value||1),dry_day_mm:Number($('dwfDryDay').value||1),baseline_days:Number($('dwfBaselineDays').value||28),min_dry_days:5,adp_hours:Number($('dwfAdpHours').value||6)},'advanced_bridge');$('dwfSummary').innerHTML=`<div class="summary-box"><div><strong>${esc(r.available)}</strong><span>availability/confidence</span></div><div><strong>${fmt(r.average_dwf,5)}</strong><span>average DWF</span></div><div><strong>${r.dry_days_used??'—'}</strong><span>dry days used</span></div><div><strong>${fmt(r.dry_day_threshold_mm,2)} mm</strong><span>dry-day threshold</span></div><div><strong>${r.baseline_days??'—'}</strong><span>baseline days</span></div><div><strong>${fmt(r.adp_hours,1)} hr</strong><span>ADP window</span></div></div>${r.reason?`<div class="pool-summary">${esc(r.reason)}</div>`:''}`;}

function exclusionPayload(strict=true,role=null,key=null){
  const rows=[];
  for(const x of state.exclusions){
    if(!x.start&&!x.end&&!String(x.reason||'').trim())continue;
    if(!x.start||!x.end||!String(x.reason||'').trim()){if(strict)throw new Error('Every exclusion requires start, end and a reason.');continue;}
    const start=modelClock(x.start),end=modelClock(x.end);
    if(end<=start)throw new Error('Exclusion end must be after start.');
    const scope=x.scope||'both';
    if(role && (x.enabled===false || !(scope===role || (scope==='both'&&['observed','model'].includes(role)) || scope===key || (x.target && key && JSON.stringify(x.target)===JSON.stringify(workspaceSeries(key))))))continue;
    rows.push({...x,id:x.id,start,end,reason:x.reason.trim(),source:'user',scope,enabled:x.enabled!==false,time_basis:'model clock/unspecified',target:scope.startsWith('[')?workspaceSeries(scope):null});
  }
  return rows;
}
function addExclusionRow(value={}){state.exclusions.push({id:crypto.randomUUID(),start:value.start||'',end:value.end||'',reason:'',enabled:true,scope:'both',...value});renderExclusions();}
function renderExclusions(){
  const scopes=[['both','Observed + models'],['observed','Observed / EDM'],['model','All mapped models'],['rainfall','Rainfall'],...state.mapping.models.map(key=>{const m=mappingObject(key);return [key,seriesLabel(m.item,m.col)];})];
  $('exclusionRows').innerHTML=state.exclusions.length?state.exclusions.map(e=>`<div class="ex-row" data-id="${esc(e.id)}"><label>Enabled<input type="checkbox" data-field="enabled" ${e.enabled!==false?'checked':''}></label><label>Start<input type="datetime-local" step="1" data-field="start" value="${esc(modelClock(e.start))}"></label><label>End<input type="datetime-local" step="1" data-field="end" value="${esc(modelClock(e.end))}"></label><label>Scope<select data-field="scope">${scopes.map(([v,n])=>`<option value="${esc(v)}" ${(e.scope||'both')===v?'selected':''}>${esc(n)}</option>`).join('')}</select></label><label>Reason<input type="text" data-field="reason" value="${esc(e.reason)}"></label><button class="btn quiet remove-ex" data-id="${esc(e.id)}">Remove</button></div>`).join(''):'<div class="pool-summary">No exclusion periods.</div>';
  document.querySelectorAll('.ex-row input,.ex-row select').forEach(inp=>inp.addEventListener('change',()=>{const e=state.exclusions.find(x=>x.id===inp.closest('.ex-row').dataset.id);if(e){state.exclusionHistory??=[];state.exclusionHistory.push({...e,changed_at:new Date().toISOString()});e[inp.dataset.field]=inp.type==='checkbox'?inp.checked:inp.value;}void drawTimeChart();}));
  document.querySelectorAll('.remove-ex').forEach(b=>b.addEventListener('click',()=>{state.deletedExclusions??=[];state.deletedExclusions.push(state.exclusions.find(x=>x.id===b.dataset.id));state.exclusions=state.exclusions.filter(x=>x.id!==b.dataset.id);renderExclusions();void drawTimeChart();}));
}

async function runRainEvents(){const rain=mappingObject(state.mapping.rain);if(!rain)throw new Error('Map a rainfall series first.');const preset=$('rainCriteriaMode').value==='wapug',r=await engine.call('rainfall_event_scaled',{path:rain.item.virtualPath,column:rain.col,conversion_factor:Number($('rainFactor').value||1),minimum_intensity:preset?5:Number($('rainMinIntensity').value||5),minimum_intensity_duration_min:preset?6:Number($('rainIntensityDuration').value||6),minimum_depth_mm:preset?5:Number($('rainTotalDepth').value||5),minimum_event_duration_min:preset?60:Number($('rainEventDuration').value||60),dry_gap_min:preset?15:Number($('rainDryGap').value||15),exclusions_json:JSON.stringify(exclusionPayload(true,'rainfall'))},'advanced_bridge');state.rainEvents=r.events||[];$('rainEventSummary').innerHTML=`<div class="summary-box"><div><strong>${r.count}</strong><span>qualifying events</span></div><div><strong>${fmt(r.criteria.minimum_intensity,2)}</strong><span>minimum intensity</span></div><div><strong>${fmt(r.criteria.minimum_depth_mm,2)} mm</strong><span>minimum depth</span></div><div><strong>${fmt(r.criteria.dry_gap_min,1)} min</strong><span>dry gap</span></div></div>`;$('rainEventBody').innerHTML=state.rainEvents.map(e=>`<tr><td>${e.event}</td><td>${esc(e.start)}</td><td>${esc(e.end)}</td><td>${fmt(e.duration_min,1)}</td><td>${fmt(e.total_depth_mm,3)}</td><td>${fmt(e.peak_intensity,3)}</td><td>${fmt(e.intensity_streak_min,1)}</td></tr>`).join('');await drawTimeChart();await renderEventResponses();}
async function renderEventResponses(){const obs=mappingObject(state.mapping.observed),model=currentModels()[0];if(!obs||!model||!state.rainEvents.length){$('eventResponseBody').innerHTML='';return;}const r=await engine.call('event_response_result',{obs_path:obs.item.virtualPath,obs_col:obs.col,model_path:model.item.virtualPath,model_col:model.col,events_json:JSON.stringify(state.rainEvents),baseline_hours:3,post_hours:6});$('eventResponseBody').innerHTML=(r.rows||[]).map(x=>`<tr><td>${x.event}</td><td>${esc(x.rain_start)}</td><td>${fmt(x.rain_depth_mm,2)}</td><td>${fmt(x.observed_baseline,4)}</td><td>${fmt(x.observed_uplift,4)}</td><td>${fmt(x.modelled_uplift,4)}</td><td>${fmt(x.uplift_error_percent,1)}</td><td>${fmt(x.peak_lag_minutes,1)}</td></tr>`).join('');}
function criteriaModeChanged(){const manual=$('rainCriteriaMode').value==='manual';for(const id of ['rainMinIntensity','rainIntensityDuration','rainEventDuration','rainTotalDepth','rainDryGap'])$(id).disabled=!manual;}
async function runHealth(){const rows=[];for(const item of state.files.values()){if(item.status!=='ready')continue;try{const r=await engine.call('data_assessment',{path:item.virtualPath,max_gap_seconds:Number($('gapInput').value||900)});for(const x of r.weekly||[])rows.push({...x,file:item.displayName});}catch(err){rows.push({file:item.displayName,comment:String(err?.message||err),rag:'Red'});}}$('healthBody').innerHTML=rows.map(x=>`<tr><td>${esc(x.file)}</td><td>${x.week_ending?esc(modelClock(x.week_ending).slice(0,10)):'—'}</td><td>${esc(x.channel||'—')}</td><td>${fmt(x.coverage_percent,1)}</td><td>${fmt(x.minimum)}</td><td>${fmt(x.mean)}</td><td>${fmt(x.maximum)}</td><td>${fmt(x.zero_percent,1)}</td><td>${fmt(Number(x.flatline_minutes)/60,1)}</td><td>${x.out_of_range_count??'—'}</td><td>${x.large_gap_count??'—'}</td><td class="${x.rag==='Green'?'audit-good':x.rag==='Red'?'audit-bad':'audit-warn'}">${esc(x.rag||'—')}</td><td>${esc(x.comment||'')}</td></tr>`).join('');}

async function runSpills(){const obs=mappingObject(state.mapping.observed),model=currentModels()[0],exc=JSON.stringify(exclusionPayload()),gap=Number($('gapInput').value||900);if(!obs&&!model)throw new Error('Apply observed/model mappings first.');state.spills={};if(obs&&$('obsThreshold').value!=='')state.spills.observed=await engine.call('spill_result',{path:obs.item.virtualPath,column:obs.col,threshold:Number($('obsThreshold').value),exclusions_json:exc,max_gap_seconds:gap});if(model&&$('modelThreshold').value!=='')state.spills.model=await engine.call('spill_result',{path:model.item.virtualPath,column:model.col,threshold:Number($('modelThreshold').value),exclusions_json:exc,max_gap_seconds:gap});renderSpills();await drawTimeChart();}
function spillSummaryHtml(r){if(!r)return'<div class="pool-summary">Not calculated.</div>';return `<div class="summary-box"><div><strong>${fmt(r.total_spill_count,0)}</strong><span>12/24 spill count</span></div><div><strong>${fmt(r.total_spill_duration_hours,3)} h</strong><span>physical duration</span></div><div><strong>${r.coverage_fraction==null?'—':fmt(r.coverage_fraction*100,1)+'%'}</strong><span>assessable coverage</span></div><div><strong>${fmt((r.excluded_seconds||0)/3600,2)} h</strong><span>excluded</span></div><div><strong>${fmt((r.unknown_seconds||0)/3600,2)} h</strong><span>unknown gap</span></div><div><strong>${esc(r.count_status||r.status)}</strong><span>count status</span></div></div>`;}
function monthlyTable(r){if(!r)return'';const c=new Map((r.monthly_counts||[]).map(x=>[`${x.year}-${String(x.month).padStart(2,'0')}`,x.spill_count])),d=new Map((r.monthly_durations||[]).map(x=>[`${x.year}-${String(x.month).padStart(2,'0')}`,x.duration_hours])),keys=[...new Set([...c.keys(),...d.keys()])].sort();if(!keys.length)return'<div class="pool-summary">No spill months.</div>';return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Month</th><th>12/24 count</th><th>Duration hr</th></tr></thead><tbody>${keys.map(k=>`<tr><td>${esc(k)}</td><td>${c.get(k)??0}</td><td>${fmt(d.get(k)||0,2)}</td></tr>`).join('')}</tbody></table></div>`;}
function spillComparisonHtml(){const o=state.spills.observed,m=state.spills.model;if(!o||!m)return'<div class="pool-summary">Calculate both observed and modelled spills to compare.</div>';if(o.count_status!=='definitive'||m.count_status!=='definitive')return'<div class="privacy-note"><strong>Comparison withheld:</strong> one or both series contain unexcluded unknown coverage. Resolve the data gap or explicitly exclude the unusable period before interpreting count differences.</div>';const om=new Map((o.monthly_counts||[]).map(x=>[`${x.year}-${x.month}`,x.spill_count])),mm=new Map((m.monthly_counts||[]).map(x=>[`${x.year}-${x.month}`,x.spill_count])),keys=[...new Set([...om.keys(),...mm.keys()])].sort();return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Year-month</th><th>Observed</th><th>Modelled</th><th>Difference (model−obs)</th></tr></thead><tbody>${keys.map(k=>`<tr><td>${k}</td><td>${om.get(k)||0}</td><td>${mm.get(k)||0}</td><td>${(mm.get(k)||0)-(om.get(k)||0)}</td></tr>`).join('')}</tbody></table></div>`;}
function renderSpills(){$('obsSpillSummary').innerHTML=spillSummaryHtml(state.spills.observed);$('modelSpillSummary').innerHTML=spillSummaryHtml(state.spills.model);$('obsMonthly').innerHTML=monthlyTable(state.spills.observed);$('modelMonthly').innerHTML=monthlyTable(state.spills.model);$('spillComparison').innerHTML=spillComparisonHtml();const rows=[];for(const[name,r]of[['Observed',state.spills.observed],['Modelled',state.spills.model]])for(const e of r?.events||[])rows.push(`<tr><td>${name}</td><td>${esc(e.start)}</td><td>${esc(e.end)}</td><td>${fmt(Number(e.duration_seconds)/3600,3)}</td></tr>`);$('eventBody').innerHTML=rows.join('');diagnostic.lastSpills={observed:state.spills.observed?{excluded_seconds:state.spills.observed.excluded_seconds,count:state.spills.observed.total_spill_count}:null,modelled:state.spills.model?{excluded_seconds:state.spills.model.excluded_seconds,count:state.spills.model.total_spill_count}:null};}

async function runStorage(){const level=mappingObject($('storageLevelSelect').value),flow=mappingObject($('storageFlowSelect').value);if(!level||!flow)throw new Error('Select modelled level and overflow flow series.');if($('storageThreshold').value==='')throw new Error('Set the modelled level threshold.');const args={level_path:level.item.virtualPath,level_col:level.col,flow_path:flow.item.virtualPath,flow_col:flow.col,threshold:Number($('storageThreshold').value),level_unit_override:$('storageLevelUnit')?.value||null,flow_unit_override:$('storageFlowUnit')?.value||null,exclusions_json:JSON.stringify(exclusionPayload(true,'model',$('storageLevelSelect').value)),...analysisBounds(),target_count:Number($('targetCount').value||10),max_gap_seconds:Number($('gapInput').value||900)},r=await engine.call('storage_result',args);state.storage=r;$('storageSummary').innerHTML=(r.screening||[]).map(x=>`<div class="summary-box"><div><strong>${x.year}</strong><span>year</span></div><div><strong>${x.required_storage_m3==null?'Withheld':fmt(x.required_storage_m3,2)+' m³'}</strong><span>idealised required storage</span></div><div><strong>${x.physical_blocks}</strong><span>counting blocks</span></div><div><strong>${x.max_block_volume_m3==null?'Withheld':fmt(x.max_block_volume_m3,2)+' m³'}</strong><span>maximum block</span></div><div><strong>${x.annual_block_volume_m3==null?'Withheld':fmt(x.annual_block_volume_m3,2)+' m³'}</strong><span>annual block volume</span></div><div><strong>${x.target_count}</strong><span>target count</span></div><div><strong>${esc(x.status||'unknown')}</strong><span>${esc(x.reason||'')}</span></div></div>`).join('')||'<div class="pool-summary">No counted spill blocks.</div>';$('storageBody').innerHTML=(r.blocks||[]).map(x=>`<tr><td>${x.year}</td><td>${x.counting_block}</td><td>${esc(x.start)}</td><td>${esc(x.end)}</td><td>${x.volume_m3==null?'Withheld':fmt(x.volume_m3,3)}</td><td>${x.requested_seconds?fmt(100*Number(x.valid_seconds||0)/Number(x.requested_seconds),1)+'%':'—'}</td><td>${esc(x.status||'unknown')}</td><td>${x.physical_discharges}</td></tr>`).join('');const mv=await engine.call('monthly_spill_volume_result',{...args,target_count:undefined},'advanced_bridge');$('monthlyVolume').innerHTML=monthlyVolumeHtml(mv.rows||[]);diagnostic.lastStorage={screeningRows:(r.screening||[]).length,blocks:(r.blocks||[]).length};}
function monthlyVolumeHtml(rows){if(!rows.length)return'<div class="pool-summary">No physical spill volume in the assessed period.</div>';return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Month</th><th>Volume m³</th><th>Valid hr</th><th>Unknown/uncovered hr</th><th>Excluded hr</th><th>Coverage</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.year}-${String(x.month).padStart(2,'0')}</td><td>${x.volume_m3==null?'Withheld':fmt(x.volume_m3,3)}</td><td>${fmt(x.valid_seconds/3600,2)}</td><td>${fmt((Number(x.gap_seconds||0)+Number(x.uncovered_seconds||0))/3600,2)}</td><td>${fmt(x.excluded_seconds/3600,2)}</td><td>${x.coverage_fraction==null?'—':fmt(100*x.coverage_fraction,1)+'%'}</td><td>${esc(x.status||'unknown')}</td></tr>`).join('')}</tbody></table></div>`;}

function migrateBrowserWorkspace(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Workspace must be a JSON object.');
  const w=JSON.parse(JSON.stringify(input));
  const version=Number(w.schema_version??1);
  if(![1,2,3].includes(version))throw new Error('Unsupported workspace schema version '+String(w.schema_version)+'. Supported versions are 1, 2 and 3.');
  if(!w.mapping&&w.mappings)w.mapping=w.mappings;
  if(!w.mapping)w.mapping={observed:null,models:[],rain:null};
  if(!Array.isArray(w.source_references)){
    const refs=w.source_references&&typeof w.source_references==='object'?Object.values(w.source_references):[];
    w.source_references=refs;
  }
  if(!Array.isArray(w.exclusions))w.exclusions=[];
  if(!w.analysis||typeof w.analysis!=='object')w.analysis={};
  if(!w.appearance||typeof w.appearance!=='object')w.appearance={};
  if(!w.rain_events||typeof w.rain_events!=='object')w.rain_events={criteria_mode:'manual',events:[],manual:{}};
  w.schema_version=3;
  return w;
}
function readNamedWorkspaces(){
  const key='icm-workbench-named',raw=localStorage.getItem(key);
  if(!raw)return {};
  try{
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Named workspace store is not an object.');
    return parsed;
  }catch(err){
    const quarantine='icm-workbench-named-corrupt-'+new Date().toISOString();
    try{localStorage.setItem(quarantine,raw);}catch{}
    localStorage.removeItem(key);
    diagnostic.errors.push({time:new Date().toISOString(),target:'workspace-local-storage',message:'Corrupt named workspace storage quarantined: '+String(err?.message||err)});
    return {};
  }
}
function workspaceSeries(key){
  const x=mappingObject(key);
  if(!x)return null;
  const domain=window.ICMProjectRegistry?.getSeries(key);
  return {sha256:x.item.hash,display_name:x.item.displayName,file_name:x.item.file.name,column:x.col,asset_id:domain?.assetId||null,role:domain?.role||null,quantity:domain?.quantity||seriesQuantity(x.item,x.col)||null,unit:domain?.unit||seriesUnit(x.item,x.col)||null};
}
function workspaceObject(){return {schema_version:3,application:'ICM Graphing Tool GitHub Pages',time_basis:'model clock/unspecified',saved_at:new Date().toISOString(),source_references:[...state.files.values()].filter(x=>x.status==='ready').map(x=>({name:x.file.name,display_name:x.displayName,size:x.file.size,last_modified:x.file.lastModified,sha256:x.hash,format:x.parsed.format,columns:x.parsed.columns})),mapping:{observed:workspaceSeries(state.mapping.observed),models:state.mapping.models.map(workspaceSeries).filter(Boolean),rain:workspaceSeries(state.mapping.rain)},analysis:{max_gap_seconds:Number($('gapInput').value||900),observed_threshold:nullableNumber($('obsThreshold').value),model_threshold:nullableNumber($('modelThreshold').value),time_offset_minutes:Number($('offsetInput').value||0),analysis_start:modelClock($('analysisStart').value)||null,analysis_end:modelClock($('analysisEnd').value)||null,storage_threshold:nullableNumber($('storageThreshold').value),target_count:Number($('targetCount').value||10),storage_level:workspaceSeries($('storageLevelSelect').value),storage_flow:workspaceSeries($('storageFlowSelect').value),storage_level_unit:$('storageLevelUnit')?.value||null,storage_flow_unit:$('storageFlowUnit')?.value||null,rain_factor:Number($('rainFactor').value||1)},appearance:{observed_color:$('obsColor').value,observed_quantity_colours:{flow:$('observedFlowColour')?.value||'#1f77b4',depth:$('observedDepthColour')?.value||$('obsColor').value,velocity:$('observedVelocityColour')?.value||'#2ca02c'},rain_color:$('rainColor').value,model_colours:state.modelColours,threshold1_label:$('threshold1Label').value,threshold1_color:$('threshold1Color').value,threshold2_label:$('threshold2Label').value,threshold2_color:$('threshold2Color').value},rain_events:{criteria_mode:$('rainCriteriaMode').value,events:state.rainEvents,manual:Object.fromEntries(['rainMinIntensity','rainIntensityDuration','rainEventDuration','rainTotalDepth','rainDryGap'].map(id=>[id,$(id).value]))},exclusions:exclusionPayload(),exclusion_history:state.exclusionHistory||[],review_notes:$('reviewNotes')?.value||'',project_registry:window.ICMProjectRegistry?.snapshot()||null,active_spill_model:workspaceSeries($('spillModelSelect')?.value),model_styles:state.mapping.models.map(key=>({series:workspaceSeries(key),color:state.modelColours[key]}))};}
function downloadBlob(name,content,type='application/octet-stream'){const blob=new Blob([content],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
function downloadWorkspace(){downloadBlob(`icm-workbench-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(workspaceObject(),null,2),'application/json');$('workspaceStatus').textContent='Workspace downloaded. Raw files were not embedded.';}
function findSeriesFromWorkspace(ref){if(!ref)return'';const item=[...state.files.values()].find(x=>x.hash===ref.sha256);return item&&item.parsed?.columns.includes(ref.column)?sourceKey(item.id,ref.column):'';}
async function applyWorkspace(w){
  w=migrateBrowserWorkspace(w);
  renderSeriesOptions();
  state.mapping.observed=findSeriesFromWorkspace(w.mapping?.observed);
  state.mapping.models=(w.mapping?.models||[]).map(findSeriesFromWorkspace).filter(Boolean);
  state.mapping.rain=findSeriesFromWorkspace(w.mapping?.rain);
  $('observedSelect').value=state.mapping.observed;
  [...$('modelSelect').options].forEach(o=>o.selected=state.mapping.models.includes(o.value));
  $('rainSelect').value=state.mapping.rain;
  const a=w.analysis||{};
  $('gapInput').value=a.max_gap_seconds??900;
  $('obsThreshold').value=a.observed_threshold??'';
  $('modelThreshold').value=a.model_threshold??'';
  $('offsetInput').value=a.time_offset_minutes??0;
  $('analysisStart').value=toLocalInput(a.analysis_start);
  $('analysisEnd').value=toLocalInput(a.analysis_end);
  $('storageThreshold').value=a.storage_threshold??'';
  $('targetCount').value=a.target_count??10;
  $('rainFactor').value=a.rain_factor??1;
  state.exclusions=(w.exclusions||[]).map(x=>({...x,scope:x.target?(findSeriesFromWorkspace(x.target)||'unresolved-target'):x.scope,id:x.id||crypto.randomUUID(),start:modelClock(x.start),end:modelClock(x.end),reason:x.reason||''}));
  state.exclusionHistory=w.exclusion_history||[];
  if($('reviewNotes'))$('reviewNotes').value=w.review_notes||'';
  renderExclusions();
  $('storageLevelSelect').value=findSeriesFromWorkspace(a.storage_level);
  $('storageFlowSelect').value=findSeriesFromWorkspace(a.storage_flow);
  if($('storageLevelUnit'))$('storageLevelUnit').value=a.storage_level_unit||'';
  if($('storageFlowUnit'))$('storageFlowUnit').value=a.storage_flow_unit||'';
  const ap=w.appearance||{};
  if(ap.observed_color)$('obsColor').value=ap.observed_color;
  if(ap.observed_quantity_colours?.flow&&$('observedFlowColour'))$('observedFlowColour').value=ap.observed_quantity_colours.flow;
  if(ap.observed_quantity_colours?.depth&&$('observedDepthColour'))$('observedDepthColour').value=ap.observed_quantity_colours.depth;
  if(ap.observed_quantity_colours?.velocity&&$('observedVelocityColour'))$('observedVelocityColour').value=ap.observed_quantity_colours.velocity;
  if(ap.rain_color)$('rainColor').value=ap.rain_color;
  state.modelColours=ap.model_colours||{};
  if(ap.threshold1_label)$('threshold1Label').value=ap.threshold1_label;
  if(ap.threshold1_color)$('threshold1Color').value=ap.threshold1_color;
  if(ap.threshold2_label)$('threshold2Label').value=ap.threshold2_label;
  if(ap.threshold2_color)$('threshold2Color').value=ap.threshold2_color;
  state.rainEvents=w.rain_events?.events||[];
  const expected=(w.source_references||[]).length;
  const matched=(w.source_references||[]).filter(r=>[...state.files.values()].some(x=>x.hash===r.sha256)).length;
  $('workspaceStatus').textContent=`Restoring workspace… ${matched}/${expected} source fingerprint(s) matched; rebuilding mappings and graph.`;
  await applyMapping();
  for(const [id,value] of Object.entries(w.rain_events?.manual||{})){if($(id))$(id).value=value;}
  $('rainCriteriaMode').value=w.rain_events?.criteria_mode||'manual';
  criteriaModeChanged();
  for(const style of w.model_styles||[]){
    const key=findSeriesFromWorkspace(style.series);
    if(key)state.modelColours[key]=style.color;
  }
  renderModelColourControls();
  if($('spillModelSelect'))$('spillModelSelect').value=findSeriesFromWorkspace(w.active_spill_model);
  $('graphObsThreshold').value=$('obsThreshold').value;
  $('graphModelThreshold').value=$('modelThreshold').value;
  await drawTimeChart();
  diagnostic.workspaceRestore={expected,matched,completedAt:new Date().toISOString()};
  return {expected,matched};
}
async function loadWorkspaceFile(file){await applyWorkspace(JSON.parse(await file.text()));}
function saveNamedWorkspace(){const name=$('workspaceName').value.trim();if(!name)throw new Error('Enter a workspace name.');const all=readNamedWorkspaces();all[name]=workspaceObject();localStorage.setItem('icm-workbench-named',JSON.stringify(all));renderNamedWorkspaces();$('workspaceStatus').textContent=`Saved named browser workspace: ${name}.`;}
function renderNamedWorkspaces(){const all=readNamedWorkspaces(),s=$('namedWorkspaceSelect'),prev=s.value;s.innerHTML='<option value="">Select saved workspace…</option>'+Object.keys(all).sort().map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join('');if(all[prev])s.value=prev;}
async function loadNamedWorkspace(){const name=$('namedWorkspaceSelect').value,all=readNamedWorkspaces();if(!name||!all[name])throw new Error('Select a saved browser workspace.');await applyWorkspace(all[name]);}

function analysisSignature(){const w=workspaceObject();return JSON.stringify({mapping:w.mapping,analysis:w.analysis,exclusions:w.exclusions,active_spill_model:w.active_spill_model,rain_events:w.rain_events.manual});}
function assertFreshResults(){const sig=analysisSignature();for(const [label,snapshot] of [['Spill',state.spillSnapshot],['Comparison',state.comparisonSnapshot]]){if(snapshot && snapshot.signature!==sig)throw new Error(`${label} results are stale. Recalculate after changing analytical inputs before exporting.`);}}

function reportCss(landscape=false){
  return ':root{--ink:#182433;--muted:#667788;--line:#d9e1e8;--soft:#f5f8fa;--accent:#315b9b}*{box-sizing:border-box}html{background:#eef2f5}body{margin:0;color:var(--ink);font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.45;background:#fff}.report{max-width:1180px;margin:0 auto;padding:30px 34px 42px}.report-header{border-bottom:3px solid var(--accent);padding-bottom:16px;margin-bottom:22px;display:flex;justify-content:space-between;gap:24px;align-items:flex-end}.report-header h1{font-size:26px;line-height:1.15;margin:0 0 6px;letter-spacing:-.02em}.report-header p{margin:0;color:var(--muted)}.report-meta{text-align:right;color:var(--muted);font-size:12px;white-space:nowrap}h2{font-size:18px;margin:26px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}h3{font-size:14px;margin:18px 0 8px}.note{background:var(--soft);border-left:4px solid var(--accent);padding:10px 12px;margin:12px 0 18px}.report-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.card{min-width:0;border:1px solid var(--line);border-radius:8px;padding:12px 14px;background:#fff;break-inside:avoid}.card h3{margin:0 0 8px}.table-wrap{width:100%;max-width:100%;overflow-x:auto;border:1px solid var(--line);border-radius:7px;margin:8px 0 14px}table{border-collapse:collapse;width:100%;min-width:620px}th,td{padding:7px 9px;border-bottom:1px solid #e8edf1;text-align:left;vertical-align:top;font-size:11.5px}th{background:var(--soft);color:#435466;text-transform:uppercase;letter-spacing:.025em;font-size:10.5px}tr:last-child td{border-bottom:0}.figure{margin:12px 0 20px;break-inside:avoid}.report-plot{width:100%;min-width:0}.graph-stats-compact small{display:block;max-width:240px;overflow-wrap:anywhere}.graph-statistics-note{font-size:12px}.figure img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:6px;background:#fff}.figure figcaption{font-size:11.5px;color:var(--muted);margin-top:6px}.summary-box{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0}.summary-box>div{border:1px solid var(--line);border-radius:7px;padding:9px;background:var(--soft)}.summary-box strong{display:block;font-size:16px}.summary-box span{font-size:10.5px;color:var(--muted)}.swatch{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:6px;vertical-align:-1px;border:1px solid rgba(0,0,0,.14)}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f9fb;border:1px solid var(--line);border-radius:6px;padding:10px;font:11px/1.45 Consolas,monospace}.hash{font-family:Consolas,monospace;font-size:10.5px;overflow-wrap:anywhere}.muted{color:var(--muted)}.report-page{break-after:page;page-break-after:always}.report-page:last-child{break-after:auto;page-break-after:auto}.report-footer{border-top:1px solid var(--line);margin-top:30px;padding-top:10px;color:var(--muted);font-size:11px;display:flex;justify-content:space-between;gap:12px}@media(max-width:760px){.report{padding:20px 16px}.report-header{display:block}.report-meta{text-align:left;margin-top:10px}.report-grid,.summary-box{grid-template-columns:1fr}table{min-width:560px}}@media print{html{background:#fff}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.report{max-width:none;padding:0}.card,.figure,.table-wrap{break-inside:avoid}}@page{size:'+(landscape?'A4 landscape':'A4 portrait')+';margin:12mm}';
}
function reportShell(title,subtitle,body,landscape=false){
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><style>'+reportCss(landscape)+'</style></head><body><main class="report"><header class="report-header"><div><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></div><div class="report-meta">Generated '+esc(new Date().toLocaleString())+'<br>ICM Graphing Tool</div></header>'+body+'<footer class="report-footer"><span>Engineering review output · source data processed locally in the browser</span><span>© 2026 Anzar Sajid</span></footer></main></body></html>';
}
function reportMappingTable(w){
  const rows=[];
  for(const source of observedGraphSeries()){const ref=workspaceSeries(source.key);if(ref)rows.push(['Observed',ref,reportObservedColour(source.quantity||seriesQuantity(source.item,source.col))]);}
  ((w.mapping&&w.mapping.models)||[]).forEach((x,i)=>rows.push(['Model '+(i+1),x,state.modelColours[state.mapping.models[i]]||palette[i%palette.length]]));
  if(w.mapping&&w.mapping.rain)rows.push(['Rainfall',w.mapping.rain,$('rainColor').value]);
  if(!rows.length)return '<p class="muted">No mapped series.</p>';
  return '<div class="table-wrap"><table><thead><tr><th>Role</th><th>Source</th><th>Column</th><th>Trace</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(x[0])+'</td><td>'+esc(x[1].display_name||x[1].file_name||'—')+'</td><td>'+esc(x[1].column||'—')+'</td><td><span class="swatch" style="background:'+esc(x[2])+'"></span>'+esc(x[2])+'</td></tr>').join('')+'</tbody></table></div>';
}
function reportObservedColour(quantity){
  const q=String(quantity||'').toLowerCase();
  if(q==='flow')return $('observedFlowColour')?.value||$('obsColor').value;
  if(q==='depth')return $('observedDepthColour')?.value||$('obsColor').value;
  if(q==='velocity')return $('observedVelocityColour')?.value||$('obsColor').value;
  return $('obsColor').value;
}
function hydraulicGraphLayout({fdvMode=false,quantities=[],statistics=[],hasRain=false,rainMax=1,range=null,title='',shapes=[],annotations=[]}={}){
  const unitFor=q=>statistics.find(r=>r.statistics?.quantity===q)?.statistics?.unit;
  const axisTitle=q=>`${q.charAt(0).toUpperCase()+q.slice(1)} (${unitFor(q)||'unit unresolved'})`;
  const panels=[];
  if(hasRain)panels.push({axis:'yaxis2',title:axisTitle('rainfall'),rain:true});
  if(fdvMode){
    if(quantities.includes('flow'))panels.push({axis:'yaxis3',title:axisTitle('flow')});
    if(quantities.includes('depth')||quantities.includes('level'))panels.push({axis:'yaxis',title:axisTitle(quantities.includes('depth')?'depth':'level')});
    if(quantities.includes('velocity'))panels.push({axis:'yaxis4',title:axisTitle('velocity')});
  }else if(statistics.some(r=>r.role!=='Rainfall')){
    const s=statistics.find(r=>r.role!=='Rainfall')?.statistics||{};
    panels.push({axis:'yaxis',title:`${s.quantity||'Hydraulic value'} (${s.unit||'unit unresolved'})`});
  }
  if(!panels.length)panels.push({axis:'yaxis',title:'Value'});
  const gap=panels.length>2?.055:.09;
  const weight=panels.reduce((sum,p)=>sum+(p.rain&&panels.length>1?(panels.length===2?.30:.65):1),0);
  const available=1-gap*(panels.length-1);
  const legendRows=Math.max(1,Math.ceil((statistics.length+2)/4));
  const layout={template:'plotly_white',height:Math.max(610,panels.length*185+130),
    margin:{l:86,r:34,t:(title?80:44)+legendRows*24,b:62},hovermode:'x unified',
    font:{family:'Segoe UI, Arial, sans-serif',size:12,color:'#334155'},
    legend:{orientation:'h',x:0,y:1.04,xanchor:'left',yanchor:'bottom',font:{size:12},traceorder:'normal'},
    xaxis:{title:{text:'Time'},domain:[0,1],showgrid:false,automargin:true,rangeslider:{visible:false},autorange:!range},
    shapes,annotations:[...annotations],bargap:0,uirevision:'icm-stacked-graph'};
  if(title)layout.title={text:title,x:.01,xanchor:'left',y:.99,yanchor:'top',font:{size:19}};
  if(range)layout.xaxis.range=range;
  let top=1;
  for(const panel of panels){
    const height=available*(panel.rain&&panels.length>1?(panels.length===2?.30:.65):1)/weight;
    layout[panel.axis]={title:{text:panel.title,standoff:12},domain:[Math.max(0,top-height),top],anchor:'x',
      showgrid:true,gridcolor:'#e8eef3',zerolinecolor:'#d9e2ea',automargin:true};
    if(panel.rain)Object.assign(layout[panel.axis],{range:[rainMax>0?rainMax:1,0],autorange:false});
    top-=height+gap;
  }
  // Preserve a primary axis for Plotly when the only selected series is rainfall.
  if(!layout.yaxis)layout.yaxis={visible:false,domain:[0,1]};
  return layout;
}
function graphStatisticsHtml(rows){
  if(!rows?.length)return '<p class="muted">No graph statistics available.</p>';
  const value=v=>v==null||!Number.isFinite(Number(v))?'—':fmt(Number(v),4);
  return '<p class="muted graph-statistics-note">Native source statistics for the displayed period. Average is the arithmetic sample mean; time-weighted mean and totals use valid interval support. Totals are partial where coverage is incomplete. Exclusions are shown on the graph but are not applied to these raw statistics.</p><div class="table-wrap"><table class="graph-stats-compact data-table"><thead><tr><th>Series</th><th>Unit</th><th>Minimum</th><th>Maximum</th><th>Average</th><th>Time-weighted mean</th><th>Total (valid support)</th><th>Valid support</th><th>Status</th></tr></thead><tbody>'+rows.map(row=>{
    const s=row.statistics||{},factor=row.factor??1,scale=v=>v==null?v:Number(v)*factor;
    const label=row.compact_label||row.role||'Series';
    return '<tr><td><strong>'+esc(label)+'</strong><br><small>'+esc(row.label||'')+'</small></td><td>'+esc(s.unit||'Unresolved')+'</td><td>'+value(scale(s.minimum))+'</td><td>'+value(scale(s.maximum))+'</td><td>'+value(scale(s.mean))+'</td><td>'+value(scale(s.time_weighted_mean))+'</td><td>'+value(scale(s.total))+(s.total!=null?' '+esc(s.total_unit||''):'')+'</td><td>'+value(Number(s.valid_support_seconds||0)/3600)+' h'+(s.coverage_fraction==null?'':' · '+fmt(s.coverage_fraction*100,1)+'%')+'</td><td>'+esc(s.status||'unavailable')+(s.unit?'':' · units unresolved')+'</td></tr>';
  }).join('')+'</tbody></table></div>';
}
let reportPlotlyBundle=null;
function reportPlotFigure(id,traces,layout,statistics,caption=''){
  const payload=JSON.stringify({data:traces,layout:{...layout,autosize:true,width:undefined}}).replace(/</g,'\\u003c');
  const stats=statistics?.length?'<h3>Graph statistics</h3>'+graphStatisticsHtml(statistics):'';
  return '<figure class="figure"><div class="report-plot" id="'+id+'" style="height:'+layout.height+'px"></div><script type="application/json" id="'+id+'-data">'+payload+'</script><figcaption>'+esc(caption)+'</figcaption></figure>'+stats;
}
async function interactiveReportHtml(html){
  if(!reportPlotlyBundle){
    const source=[...document.scripts].find(s=>/plotly-[\d.]+(?:\.min)?\.js/.test(s.src))?.src;
    if(!source)throw new Error('The Plotly runtime source is unavailable; reload the application before exporting.');
    const response=await fetch(source);
    if(!response.ok)throw new Error('Could not embed Plotly in the report. Check the connection and retry export.');
    const bundle=await response.text();
    if(bundle.length<10000||!bundle.includes('Plotly'))throw new Error('Invalid Plotly runtime received; report export stopped.');
    reportPlotlyBundle=bundle;
  }
  const boot=`document.querySelectorAll('.report-plot').forEach(el=>{const p=JSON.parse(document.getElementById(el.id+'-data').textContent);Plotly.newPlot(el,p.data,p.layout,{responsive:true,displaylogo:false,scrollZoom:true}).catch(e=>{el.textContent='Graph could not be rendered: '+e.message;});});`;
  const embedded='<script>'+reportPlotlyBundle.replace(/<\/script/gi,'<\\/script')+'</script><script>'+boot+'</script></body>';
  return html.replace('</body>',()=>embedded);
}


function reportSettingsTable(w){
  const a=w.analysis||{};
  const rows=[['Time basis',w.time_basis||'model clock/unspecified'],['Analysis start',a.analysis_start||'Full available period'],['Analysis end',a.analysis_end||'Full available period'],['Maximum interpolation gap',(a.max_gap_seconds==null?'—':fmt(a.max_gap_seconds,0)+' s')],['Observed spill threshold',a.observed_threshold==null?'—':a.observed_threshold],['Model spill threshold',a.model_threshold==null?'—':a.model_threshold],['Model time offset',fmt(a.time_offset_minutes||0,1)+' min'],['Rainfall conversion factor',fmt(a.rain_factor==null?1:a.rain_factor,4)]];
  return '<div class="table-wrap"><table><tbody>'+rows.map(x=>'<tr><th>'+esc(x[0])+'</th><td>'+esc(x[1])+'</td></tr>').join('')+'</tbody></table></div>';
}
function reportExclusions(w){
  const rows=w.exclusions||[];
  if(!rows.length)return '<p class="muted">No exclusion periods applied.</p>';
  return '<div class="table-wrap"><table><thead><tr><th>Start</th><th>End</th><th>Scope</th><th>Reason</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(x.start||'—')+'</td><td>'+esc(x.end||'—')+'</td><td>'+esc(x.scope||'—')+'</td><td>'+esc(x.reason||'—')+'</td></tr>').join('')+'</tbody></table></div>';
}
function reportSources(w){
  const rows=w.source_references||[];
  if(!rows.length)return '<p class="muted">No source fingerprints recorded.</p>';
  return '<div class="table-wrap"><table><thead><tr><th>File</th><th>Format</th><th>Size</th><th>SHA-256</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(x.display_name||x.name||'—')+'</td><td>'+esc(x.format||'—')+'</td><td>'+esc(mb(x.size||0))+'</td><td class="hash">'+esc(x.sha256||'—')+'</td></tr>').join('')+'</tbody></table></div>';
}
function reportYearlySpills(r){
  const rows=(r&&r.yearly_summary)||[];
  if(!rows.length)return '<p class="muted">No yearly spill rows.</p>';
  return '<div class="table-wrap"><table><thead><tr><th>Year</th><th>12/24 count</th><th>Duration h</th><th>Valid h</th><th>Unknown h</th><th>Excluded h</th><th>Status</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(x.year)+'</td><td>'+fmt(x.spill_count,0)+'</td><td>'+fmt(x.duration_hours,2)+'</td><td>'+fmt(x.valid_hours,2)+'</td><td>'+fmt(x.unknown_hours,2)+'</td><td>'+fmt(x.excluded_hours,2)+'</td><td>'+esc(x.count_status||'—')+'</td></tr>').join('')+'</tbody></table></div>';
}
const REPORT_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function reportSpillCountMatrix(result){
  if(!result)return '<p class="muted">Not calculated.</p>';
  const counts=new Map((result.monthly_counts||[]).map(x=>[`${Number(x.year)}-${Number(x.month)}`,x.spill_count]));
  const yearly=new Map((result.yearly_summary||[]).map(x=>[Number(x.year),x]));
  const years=[...yearly.keys()].sort((a,b)=>a-b);
  if(!years.length)return '<p class="muted">No assessed calendar years.</p>';
  const rows=years.map(year=>{
    const yr=yearly.get(year)||{},unavailable=yr.count_status==='unavailable';
    const months=REPORT_MONTHS.map((_,i)=>unavailable?'—':fmt(counts.get(`${year}-${i+1}`)??0,0));
    const total=yr.spill_count==null?'—':fmt(yr.spill_count,0);
    return '<tr><th>'+year+'</th>'+months.map(v=>'<td>'+v+'</td>').join('')+'<td><strong>'+total+'</strong></td></tr>';
  }).join('');
  return '<div class="table-wrap"><table class="spill-matrix"><thead><tr><th>Year</th>'+REPORT_MONTHS.map(m=>'<th>'+m+'</th>').join('')+'<th>Total</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<p class="muted">Count status: '+esc(result.count_status||result.status||'unknown')+'. Counts use the configured 12/24 methodology and current exclusion/coverage domain.</p>';
}
function reportMonthlySpillComparison(observed,modelled){
  if(!observed||!modelled)return '<p class="muted">Calculate both observed and modelled spills to compare monthly counts.</p>';
  if(observed.count_status!=='definitive'||modelled.count_status!=='definitive'){
    return '<div class="note"><strong>Monthly comparison withheld.</strong> One or both count domains are provisional because of excluded or unknown support. Resolve the support issue before interpreting count differences.</div>';
  }
  const om=new Map((observed.monthly_counts||[]).map(x=>[`${Number(x.year)}-${Number(x.month)}`,Number(x.spill_count||0)]));
  const mm=new Map((modelled.monthly_counts||[]).map(x=>[`${Number(x.year)}-${Number(x.month)}`,Number(x.spill_count||0)]));
  const years=[...new Set([...(observed.yearly_summary||[]).map(x=>Number(x.year)),...(modelled.yearly_summary||[]).map(x=>Number(x.year))])].sort((a,b)=>a-b);
  const rows=[];
  for(const year of years)for(let month=1;month<=12;month++){
    const o=om.get(`${year}-${month}`)||0,m=mm.get(`${year}-${month}`)||0,d=m-o;
    const assessment=d===0?'Matching':d<0?'Under-predicting':'Over-predicting';
    rows.push('<tr><td>'+year+'</td><td>'+REPORT_MONTHS[month-1]+'</td><td>'+o+'</td><td>'+m+'</td><td>'+d+'</td><td>'+assessment+'</td></tr>');
  }
  return '<div class="table-wrap"><table><thead><tr><th>Year</th><th>Month</th><th>Observed spills</th><th>Modelled spills</th><th>Difference</th><th>Assessment</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
}
async function reportChart(id,width,height){try{return await Plotly.toImage($(id),{format:'svg',width:width,height:height});}catch{return'';}}
function reportProjectRegistry(){
  const registry=window.ICMProjectRegistry?.snapshot();
  if(!registry||!registry.assets?.length)return '<p class="muted">No classified project assets available.</p>';
  const sourceMap=new Map((registry.sources||[]).map(x=>[x.id,x]));
  const seriesMap=new Map((registry.series||[]).map(x=>[x.key,x]));
  const rows=registry.assets.map(asset=>{
    const sources=(asset.sourceIds||[]).map(id=>sourceMap.get(id)).filter(Boolean);
    const quantities=[...new Set((asset.seriesKeys||[]).map(key=>seriesMap.get(key)?.quantity).filter(Boolean))];
    const relationships=(registry.relationships||[]).filter(x=>x.from===asset.id||x.to===asset.id).map(x=>x.type==='upstream-flow'?x.from+' → '+x.to:x.from+' ↔ '+x.to);
    const roles=[...new Set(sources.map(x=>x.role).filter(Boolean))];
    return '<tr><td><strong>'+esc(asset.id)+'</strong><br><span class="muted">'+esc(asset.kind||'asset')+'</span></td><td>'+esc(roles.join(', ')||'—')+'</td><td>'+esc(sources.map(x=>x.name).join(', ')||'association only')+'</td><td>'+esc(quantities.join(', ')||'—')+'</td><td>'+esc(relationships.join(', ')||'—')+'</td></tr>';
  }).join('');
  return '<div class="note"><strong>Canonical project context.</strong> Files are classified once into assets, engineering series and workbook relationships; the same registry is reused across workflows.</div><div class="table-wrap"><table><thead><tr><th>Asset</th><th>Role</th><th>Source</th><th>Quantities</th><th>Relationships</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
async function downloadReport(){
  assertFreshResults();
  if(!state.mapping.observed&&!state.mapping.rain)throw new Error('Apply a mapping before exporting the report.');
  await drawTimeChart();
  const reportSignature=analysisSignature();
  const timeFigure=reportPlotFigure('assessment-time-graph',$('timeChart').data,$('timeChart').layout,[],'Displayed source period; the integrated statistics band uses native source values.');
  const images=await Promise.all([Promise.resolve(''),reportChart('scatterChart',680,440),reportChart('residualChart',680,440),reportChart('cumulativeChart',680,440),reportChart('exceedanceChart',680,440)]);
  const timeImg=images[0],scatterImg=images[1],residImg=images[2],cumulativeImg=images[3],exceedanceImg=images[4];
  const w=state.spillSnapshot&&state.spillSnapshot.config||state.comparisonSnapshot&&state.comparisonSnapshot.config||workspaceObject();
  const scenarioRows=state.comparisons.map((x,i)=>x.result?'<tr><td>Model '+(i+1)+' · '+esc(x.model.item.displayName)+' · '+esc(x.model.col)+'</td><td>'+(x.result.metrics.pairs==null?'—':x.result.metrics.pairs)+'</td><td>'+fmt(x.result.metrics.rmse)+'</td><td>'+fmt(x.result.metrics.mae)+'</td><td>'+fmt(x.result.metrics.mean_bias)+'</td><td>'+fmt(x.result.metrics.r2_correlation)+'</td><td>'+fmt(x.result.metrics.nse)+'</td><td>'+esc(x.result.calculation_status||'—')+'</td><td>'+(x.result.coverage_fraction==null?'—':fmt(x.result.coverage_fraction*100,1)+'%')+'</td></tr>':'').join('');
  const scenarioTable=scenarioRows?'<div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Pairs</th><th>RMSE</th><th>MAE</th><th>Bias</th><th>R²</th><th>NSE</th><th>Status</th><th>Valid support</th></tr></thead><tbody>'+scenarioRows+'</tbody></table></div>':'<p class="muted">No scenario comparison has been calculated.</p>';
  let body='<div class="note"><strong>Method note.</strong> Source files were processed locally in the browser. Results retain the current workspace time basis, exclusions, support/coverage status and source fingerprints.</div>';
  body+='<h2>Assessment configuration</h2><div class="report-grid"><div class="card"><h3>Mapped series</h3>'+reportMappingTable(w)+'</div><div class="card"><h3>Analysis settings</h3>'+reportSettingsTable(w)+'</div></div>';
  body+=timeFigure;
  body+='<h2>Scenario comparison</h2>'+scenarioTable;
  if(window.__ICM_WORKBENCH__.professionalSurveyReportHtml)body+=window.__ICM_WORKBENCH__.professionalSurveyReportHtml;
  const diag=[];
  if(scatterImg)diag.push('<figure class="figure"><img src="'+scatterImg+'" alt="Observed versus modelled scatter plot"><figcaption>Observed versus modelled paired values.</figcaption></figure>');
  if(residImg)diag.push('<figure class="figure"><img src="'+residImg+'" alt="Residual plot"><figcaption>Model minus observed residual through time.</figcaption></figure>');
  if(cumulativeImg)diag.push('<figure class="figure"><img src="'+cumulativeImg+'" alt="Cumulative flow volume plot"><figcaption>Cumulative-volume diagnostic where dimensional flow support is available.</figcaption></figure>');
  if(exceedanceImg)diag.push('<figure class="figure"><img src="'+exceedanceImg+'" alt="Flow duration plot"><figcaption>Time-weighted exceedance diagnostic where available.</figcaption></figure>');
  if(diag.length)body+='<div class="report-grid">'+diag.join('')+'</div>';
  body+='<h2>Spill / EDM assessment</h2><div class="report-grid"><div class="card"><h3>Observed / EDM</h3>'+spillSummaryHtml(state.spills.observed)+reportYearlySpills(state.spills.observed)+'</div><div class="card"><h3>Modelled</h3>'+spillSummaryHtml(state.spills.model)+reportYearlySpills(state.spills.model)+'</div></div>';
  body+='<h3>Observed spills by month</h3>'+reportSpillCountMatrix(state.spills.observed);
  body+='<h3>Model spills by month</h3>'+reportSpillCountMatrix(state.spills.model);
  body+='<h3>Observed vs modelled monthly spill comparison</h3>'+reportMonthlySpillComparison(state.spills.observed,state.spills.modelled||state.spills.model);
  body+='<h2>Exclusions</h2>'+reportExclusions(w);
  const notes=$('reviewNotes')&&$('reviewNotes').value||'';
  body+='<h2>Reviewer notes</h2><div class="card">'+(notes?'<p>'+esc(notes).replaceAll('\n','<br>')+'</p>':'<p class="muted">No reviewer notes recorded.</p>')+'</div>';
  body+='<h2>Project data context</h2>'+reportProjectRegistry();
  body+='<h2>Source provenance</h2>'+reportSources(w);
  body+='<h2>Audit appendix</h2><details><summary>Calculation snapshot and workspace state</summary><pre>'+esc(JSON.stringify({spills:state.spillSnapshot,comparison:state.comparisonSnapshot,professional_flow_survey:window.__ICM_WORKBENCH__.lastProfessionalSurvey||null,project_registry:window.ICMProjectRegistry?.snapshot()||null,execution:diagnostic.execution||'unknown'},null,2))+'</pre></details>';
  const html=await interactiveReportHtml(reportShell('ICM Calibration Workbench — Engineering Assessment','Professional hydraulic data review and model-verification output',body,false));
  if(reportSignature!==analysisSignature())throw new Error('Inputs changed during report generation. Retry export.');
  downloadBlob('icm-workbench-report-'+new Date().toISOString().slice(0,10)+'.html',html,'text/html');
  $('workspaceStatus').textContent='Professional HTML engineering report downloaded.';
}
async function reportTraces(period){
  const sources=observedGraphSeries(),fdvMode=sources.length>=2,traces=[],statistics=[],quantities=[];
  const axisFor=q=>fdvMode?(q==='flow'?'y3':q==='velocity'?'y4':'y'):'y';
  const entries=[...sources.map(s=>({key:s.key,role:'Observed',observed:true})),
    ...state.mapping.models.map((key,i)=>({key,role:'Model '+(i+1),colour:state.modelColours[key]||palette[i%palette.length]}))];
  if(state.mapping.rain)entries.push({key:state.mapping.rain,role:'Rainfall',colour:$('rainColor').value});
  let rainMax=1,hasRain=false;
  for(const entry of entries){
    const source=mappingObject(entry.key);if(!source)continue;
    const d=await engine.call('series_data',{path:source.item.virtualPath,column:source.col,max_points:30000,
      start:period[0],end:period[1],end_exclusive:true,max_gap_seconds:Number($('gapInput').value||900)});
    const quantity=String(seriesQuantity(source.item,source.col)||'').toLowerCase();
    if(quantity&&!quantities.includes(quantity))quantities.push(quantity);
    const rain=entry.role==='Rainfall',factor=rain?Number($('rainFactor').value||1):1;
    const traceColour=entry.observed?reportObservedColour(quantity):entry.colour;
    const values=d.value.map(v=>v==null?null:Number(v)*factor);
    traces.push({x:d.timestamp,y:values,name:entry.role+' · '+source.col,meta:source.item.displayName,
      type:rain?'bar':'scatter',mode:rain?undefined:'lines',connectgaps:false,
      yaxis:rain?'y2':axisFor(quantity),line:rain?undefined:{color:traceColour,width:1.5},
      marker:rain?{color:traceColour}:undefined,opacity:rain?.72:1});
    statistics.push({role:entry.role,compact_label:compactGraphRole(entry.role,source.item,source.col),
      label:seriesLabel(source.item,source.col),statistics:d.statistics,factor});
    if(rain){hasRain=true;rainMax=values.reduce((m,v)=>v==null?m:Math.max(m,v*1.12),1);}
  }
  return {traces,statistics,quantities,fdvMode,hasRain,rainMax};
}
async function downloadFourPeriod(){
  assertFreshResults();
  if(!state.mapping.observed&&!state.mapping.rain)throw new Error('Apply a mapping before exporting.');
  const year=Number($('reportYear').value);
  if(!Number.isInteger(year)||year<1900||year>9998)throw new Error('Enter a valid report year.');
  const periods=[['Complete year',year+'-01-01T00:00:00',(year+1)+'-01-01T00:00:00'],['January – April',year+'-01-01T00:00:00',year+'-05-01T00:00:00'],['May – August',year+'-05-01T00:00:00',year+'-09-01T00:00:00'],['September – December',year+'-09-01T00:00:00',(year+1)+'-01-01T00:00:00']];
  await drawTimeChart();
  const shapes=JSON.parse(JSON.stringify($('timeChart').layout?.shapes||[]));
  const thresholdTraces=JSON.parse(JSON.stringify(($('timeChart').data||[]).filter(t=>t.line?.dash==='dash'&&t.x?.every(x=>x==null))));
  const w=workspaceObject(),signature=analysisSignature();
  let body='<div class="note">Interactive Plotly graphs with fixed period statistics from native source data. Zoom changes the view, not the statistics period. Display traces may be reduced; calculations use native data.</div><h2>Series key</h2>'+reportMappingTable(w);
  for(let i=0;i<periods.length;i++){
    const [title,a,b]=periods[i],result=await reportTraces([a,b]);
    result.traces.push(...thresholdTraces);
    const layout=hydraulicGraphLayout({...result,range:[a,b],title:year+' — '+title,shapes});
    body+='<section class="report-page"><h2>'+esc(title)+'</h2><p class="muted">'+esc(a)+' to '+esc(b)+' · end exclusive</p>'+reportPlotFigure('period-graph-'+i,result.traces,layout,result.statistics,'Aligned hydraulic panels with a separate rainfall band above.')+'</section>';
  }
  body+='<h2>Analysis settings</h2>'+reportSettingsTable(w)+'<h2>Exclusions</h2>'+reportExclusions(w)+'<h2>Source provenance</h2>'+reportSources(w);
  const html=await interactiveReportHtml(reportShell('ICM Calibration Workbench — '+year+' Four-Period Report','Annual hydraulic time-series review',body,true));
  if(signature!==analysisSignature())throw new Error('Inputs changed during report generation. Retry export.');
  downloadBlob('icm-'+year+'-four-period-report.html',html,'text/html');
  $('workspaceStatus').textContent='Interactive four-period HTML report downloaded.';
}
function downloadManifest(){const w=workspaceObject(),rows=['workflow_role,asset_id,domain_role,file,column,quantity,unit,sha256,size,format'],roles=[];if(w.mapping.observed)roles.push(['Observed',w.mapping.observed]);for(const x of w.mapping.models||[])roles.push(['Modelled/comparison',x]);if(w.mapping.rain)roles.push(['Rainfall',w.mapping.rain]);if(w.analysis.storage_level)roles.push(['Storage level',w.analysis.storage_level]);if(w.analysis.storage_flow)roles.push(['Overflow flow',w.analysis.storage_flow]);for(const[role,ref]of roles){const src=w.source_references.find(x=>x.sha256===ref.sha256)||{};rows.push([role,ref.asset_id||'',ref.role||'',ref.display_name,ref.column,ref.quantity||'',ref.unit||'',ref.sha256,src.size||'',src.format||''].map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(','));}downloadBlob('icm-workbench-provenance.csv',rows.join('\n'),'text/csv');}

async function fileFromEntry(entry,path=''){if(entry.isFile)return new Promise((resolve,reject)=>entry.file(f=>{f._relativePath=path+f.name;resolve([f]);},reject));if(entry.isDirectory){const reader=entry.createReader(),all=[];while(true){const batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!batch.length)break;for(const child of batch)all.push(...await fileFromEntry(child,`${path}${entry.name}/`));}return all;}return[];}
function snapshotDrop(dataTransfer){
  const files=Array.from(dataTransfer?.files||[]);
  const items=Array.from(dataTransfer?.items||[]).map(item=>({
    entry:typeof item.webkitGetAsEntry==='function'?item.webkitGetAsEntry():null,
    file:typeof item.getAsFile==='function'?item.getAsFile():null,
  }));
  return {files,items};
}
async function droppedFiles(snapshot){
  const files=[...(snapshot?.files||[])];
  for(const item of snapshot?.items||[]){
    if(item.entry){
      try{files.push(...await fileFromEntry(item.entry));}
      catch(err){console.warn('Could not traverse dropped entry',err);}
    }else if(item.file)files.push(item.file);
  }
  return [...new Map(files.filter(Boolean).map(f=>[`${f.webkitRelativePath||f._relativePath||f.name}|${f.size}|${f.lastModified}`,f])).values()];
}
async function chooseFolder(){if('showDirectoryPicker'in window){try{const handle=await window.showDirectoryPicker({mode:'read'}),files=[];async function walk(dir,prefix=''){for await(const[name,h]of dir.entries()){if(name.startsWith('.'))continue;if(h.kind==='file'){const f=await h.getFile();f._relativePath=prefix+name;files.push(f);}else await walk(h,`${prefix}${name}/`);}}await walk(handle);await ingestFiles(files);return;}catch(err){if(err.name==='AbortError')return;throw err;}}$('folderInput').click();}
function switchTab(btn){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));$(`tab-${btn.dataset.tab}`).classList.add('active');setTimeout(()=>window.dispatchEvent(new Event('resize')),0);}
function eventGuard(buttonId,target,fn){$(buttonId).addEventListener('click',()=>guarded(target,fn));}
function wireEvents(){
  $('chooseFolderBtn').addEventListener('click',()=>void importGuard(chooseFolder));$('addFilesBtn').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>void importGuard(()=>ingestFiles(e.target.files)));$('folderInput').addEventListener('change',e=>void importGuard(()=>ingestFiles(e.target.files)));eventGuard('clearPoolBtn','poolSummary',async()=>{const hadSources=state.files.size>0;state.files.clear();window.ICMProjectRegistry?.clearSources();state.mapping={observed:'',models:[],rain:''};state.comparisons=[];state.spills={};state.spillSnapshot=null;state.comparisonSnapshot=null;state.rainEvents=[];state.storage=null;state.exclusions=[];state.exclusionHistory=[];state.modelColours={};diagnostic.fastpathActiveSourceId=null;window.ICMFastPath?.clear?.();await engine.clear();renderPool();renderSeriesOptions();renderExclusions();for(const id of ['timeChart','scatterChart','residualChart','cumulativeChart','exceedanceChart','ratingChart'])Plotly.purge(id);$('mappingStatus').textContent='Source pool cleared. Mappings, exclusions and derived analytical state were invalidated.';if(hadSources)notifySourcePoolChanged('clear');});
  const dz=$('dropzone');for(const ev of ['dragenter','dragover'])dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag');});for(const ev of ['dragleave','drop'])dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag');});dz.addEventListener('drop',e=>{const snapshot=snapshotDrop(e.dataTransfer);void importGuard(async()=>{const files=await droppedFiles(snapshot);$('poolSummary').textContent=files.length+' dropped file'+(files.length===1?'':'s')+' detected · preparing import…';await ingestFiles(files);});});
  eventGuard('applyMappingBtn','mappingStatus',applyMapping);$('modelSelect').addEventListener('change',()=>{renderModelColourControls();autoSuggestAdvanced(allSeries());});eventGuard('refreshGraphBtn','mappingStatus',drawTimeChart);for(const id of ['obsColor','rainColor','rainFactor','rainAxisMax','threshold1Label','threshold1Color','threshold2Label','threshold2Color','showEventOverlay','rainEventColor'])$(id).addEventListener('change',()=>guarded('mappingStatus',drawTimeChart));
  eventGuard('runCompareBtn','metricGrid',runCompare);$('useZoomPeriodBtn').addEventListener('click',useGraphZoom);$('clearPeriodBtn').addEventListener('click',()=>{$('analysisStart').value='';$('analysisEnd').value='';});eventGuard('runRatingBtn','ratingSummary',runRating);eventGuard('runDwfBtn','dwfSummary',runDwf);
  $('rainCriteriaMode').addEventListener('change',criteriaModeChanged);eventGuard('runRainEventsBtn','rainEventSummary',runRainEvents);eventGuard('runHealthBtn','healthBody',runHealth);
  $('addExclusionBtn').addEventListener('click',()=>addExclusionRow());eventGuard('runSpillsBtn','obsSpillSummary',runSpills);eventGuard('runStorageBtn','storageSummary',runStorage);
  $('downloadWorkspaceBtn').addEventListener('click',()=>guarded('workspaceStatus',downloadWorkspace));$('loadWorkspaceBtn').addEventListener('click',()=>$('workspaceInput').click());$('workspaceInput').addEventListener('change',e=>e.target.files[0]&&guarded('workspaceStatus',()=>loadWorkspaceFile(e.target.files[0])));eventGuard('saveNamedWorkspaceBtn','workspaceStatus',saveNamedWorkspace);eventGuard('loadNamedWorkspaceBtn','workspaceStatus',loadNamedWorkspace);eventGuard('downloadReportBtn','workspaceStatus',downloadReport);eventGuard('downloadFourPeriodBtn','workspaceStatus',downloadFourPeriod);$('downloadManifestBtn')?.addEventListener('click',()=>guarded('workspaceStatus',downloadManifest));document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn)));
}
async function start(){window.ICMProjectRegistry?.mount();wireEvents();renderPool();renderSeriesOptions();renderExclusions();renderNamedWorkspaces();criteriaModeChanged();setEngineStatus('Initialising advanced analysis…','booting');void ensureEngineBoot().catch(()=>{});}
start();
