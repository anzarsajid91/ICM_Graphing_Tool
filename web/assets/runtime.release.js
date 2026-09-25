const $ = (id) => document.getElementById(id);
const state = {
  files: new Map(), mapping: { observed: '', models: [], rain: '' }, comparisons: [],
  spills: {}, exclusions: [], exclusionHistory: [], rainEvents: [], rainEventResult: null, rainEventSignature: null, rainEventGeneration: 0,
  modelColours: {}, storage: null, storageSignature: null, rating: null,
  dwfResult: null, dwfSignature: null, dwfGeneration: 0,
  healthResult: null, healthSignature: null, healthGeneration: 0,
  seriesQuantityOverrides: new Map(),
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
const palette=['#0000ff','#ef7d00','#2e8b57','#7c4dff','#c43d6f','#008b95','#7a5c00','#5b6d7e'];
const nullableNumber=(v)=>v===''?null:Number(v);
function safePlotFilename(name='icm-graph'){
  const stem=String(name||'icm-graph').trim().replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'')||'icm-graph';
  return stem+'_'+new Date().toISOString().slice(0,10);
}
function plotConfig(name='icm-graph',extra={}){
  return {
    responsive:true,
    displaylogo:false,
    displayModeBar:'hover',
    scrollZoom:false,
    toImageButtonOptions:{format:'png',filename:safePlotFilename(name),width:1600,height:900,scale:2},
    ...extra,
  };
}
const sourceKey=(id,col)=>JSON.stringify([id,col]);
const parseSourceKey=(v)=>{try{return JSON.parse(v)}catch{return['','']}};
const seriesLabel=(item,col)=>`${item.displayName} — ${col}`;
const baseFileName=(item)=>String(item?.displayName||item?.file?.name||'source').split(/[\\/]/).pop();
function seriesMetadata(item,col){
  const metadata=item?.parsed?.metadata||{};
  return metadata.channels?.[col]||metadata.series_metadata?.[col]||{};
}
function declaredSeriesQuantity(item,col){
  const metadata=item?.parsed?.metadata||{}, detail=seriesMetadata(item,col);
  const token=String(col||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
  const hinted=token.includes('rain')?'rainfall':(token.includes('velocity')||token==='vel')?'velocity':(token.includes('flow')||token==='q'||token.includes('discharge'))?'flow':token.includes('depth')?'depth':(token.includes('level')||token.includes('stage'))?'level':null;
  return detail.quantity||metadata.quantity_by_column?.[col]||hinted||metadata.quantity||null;
}
function seriesQuantity(item,col){
  const key=item?.id?sourceKey(item.id,col):'';
  return (key&&state.seriesQuantityOverrides.get(key))||declaredSeriesQuantity(item,col);
}
function seriesUnit(item,col){
  const metadata=item?.parsed?.metadata||{}, detail=seriesMetadata(item,col);
  return detail.canonical_unit||metadata.canonical_unit||detail.original_unit||metadata.original_unit||null;
}
function seriesReference(item,col){
  const metadata=item?.parsed?.metadata||{}, detail=seriesMetadata(item,col);
  return detail.vertical_reference||detail.level_reference||detail.depth_reference||detail.reference||detail.datum||
    metadata.vertical_reference||metadata.level_reference||metadata.depth_reference||metadata.reference||metadata.datum||null;
}
function isAuxiliarySeries(item,col){
  const token=String(col||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  return ['second','seconds','elapsedsecond','elapsedseconds','simulationsecond','simulationseconds','timeindex','timestep','timesteps','row','rowid','index'].includes(token);
}
function hydraulicSeriesForItem(item){
  if(!item||item.status!=='ready')return[];
  const columns=(item.parsed?.columns||[]).filter(col=>!isAuxiliarySeries(item,col));
  const order=['depth','level','flow','velocity'];
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
function conciseErrorMessage(error){
  const raw=String(error?.message??error??'Operation failed.').trim();
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const tagged=[...lines].reverse().find(line=>/^(?:ValueError|TypeError|RuntimeError|KeyError|AssertionError|Error):\s*/.test(line));
  let message=tagged?tagged.replace(/^(?:ValueError|TypeError|RuntimeError|KeyError|AssertionError|Error):\s*/,''):'';
  if(!message){
    message=[...lines].reverse().find(line=>!/^Traceback\b/.test(line)&&!/^File\s+/.test(line)&&!/^at\s+/.test(line))||raw;
  }
  return message.length>900?message.slice(0,897)+'…':message;
}
const showError=(target,message)=>{
  const raw=String(message?.message??message??'Operation failed.');
  const display=conciseErrorMessage(message);
  const el=$(target);if(el)el.innerHTML=`<div class="privacy-note audit-bad"><strong>Operation failed:</strong> ${esc(display)}</div>`;
  diagnostic.errors.push({time:new Date().toISOString(),target,message:raw,display_message:display});
  console.error(raw);
};
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
  constructor(requestTimeoutMs=60000){
    this.worker=null;this.sequence=0;this.pending=new Map();this.requestTimeoutMs=requestTimeoutMs;this.disabledError=null;
  }
  _disable(error){
    const failure=error instanceof Error?error:new Error(String(error||'FastPath preview worker failed.'));
    const worker=this.worker;this.worker=null;this.disabledError=failure;
    try{if(worker)worker.terminate();}catch{}
    const entries=[...this.pending.values()];this.pending.clear();
    for(const entry of entries)entry.reject(failure);
  }
  _spawn(){
    if(this.worker)return;
    if(this.disabledError)throw this.disabledError;
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
      this._disable(new Error(event&&event.message||'FastPath preview worker failed.'));
    });
  }
  _request(type,payload={},transfer=[]){
    this._spawn();
    const id='fastpath-'+(++this.sequence);
    return new Promise((resolve,reject)=>{
      let timer=null,settled=false;
      const finish=(fn,value)=>{
        if(settled)return;
        settled=true;if(timer!==null)clearTimeout(timer);fn(value);
      };
      this.pending.set(id,{resolve:value=>finish(resolve,value),reject:error=>finish(reject,error)});
      timer=setTimeout(()=>{
        if(!this.pending.has(id))return;
        this._disable(new Error('FastPath preview worker timed out; continuing without preview.'));
      },this.requestTimeoutMs);
      try{this.worker.postMessage({id:id,type:type,...payload},transfer);}
      catch(error){this.pending.delete(id);finish(reject,error);}
    });
  }
  async parse(item,buffer,maxPoints=15000){
    const copy=buffer.slice(0);
    return this._request('parse',{name:item.file.name,bytes:copy,maxPoints:maxPoints},[copy]);
  }
  terminate(){
    if(this.worker)this.worker.terminate();
    this.worker=null;this.disabledError=null;
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
  async removeFile(path){
    if(!this.ready)return true;
    return this._request('removeFile',{path:String(path||'')});
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
let sourceImportEpoch=0;
const TRANSIENT_SOURCE_STATUSES=new Set(['reading','preview-ready','waiting-engine','validating']);
function invalidatePendingSourceImports(){
  sourceImportEpoch+=1;
  fastpathEngine.terminate();
  diagnostic.fastpathActiveSourceId=null;
  window.ICMFastPath?.clear?.();
  let dropped=0;
  for(const [id,item] of state.files){
    if(TRANSIENT_SOURCE_STATUSES.has(item.status)){state.files.delete(id);dropped+=1;}
  }
  return dropped;
}
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
  if(cancellingOperation)return;
  cancellingOperation=true;
  operationDepth+=1;
  const button=document.getElementById('globalOperationCancel');
  if(button)button.disabled=true;
  operationUpdate('Cancelling operation…',null,'Restarting the isolated analysis worker and restoring authoritative-ready source files.');
  const droppedPending=invalidatePendingSourceImports();
  try{
    const readyItems=[...state.files.values()].filter(item=>item.status==='ready');
    const restartPromise=engine.restart(readyItems);
    engineBootPromise=restartPromise;
    const info=await restartPromise;
    diagnostic.status='ready';
    diagnostic.engineReadyAt=performance.now();
    setEngineStatus('Reference Python worker ready · files remain local','ready');
    if($('footerBuild'))$('footerBuild').textContent=`Reference engine: Python via Pyodide 0.29.4 Web Worker · ${Number(info?.manifestCount||0)} modules · FastPath preview worker`;
    if(droppedPending){
      renderPool();
      renderSeriesOptions();
      notifySourcePoolChanged('cancel-pending-import');
    }
  }catch(err){
    engineBootPromise=null;
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

function genericSeriesSemanticsRows(){
  const rows=[],seen=new Set();
  const add=(role,key)=>{
    if(!key||seen.has(key))return;
    const mapped=mappingObject(key);
    if(!mapped)return;
    const declared=declaredSeriesQuantity(mapped.item,mapped.col);
    const overridden=state.seriesQuantityOverrides.has(key);
    if(declared&&!overridden)return;
    seen.add(key);
    rows.push({role,key,mapped,quantity:state.seriesQuantityOverrides.get(key)||''});
  };
  add('Observed',$('observedSelect')?.value||'');
  for(const option of [...($('modelSelect')?.selectedOptions||[])])add('Model',option.value);
  add('Rainfall',$('rainSelect')?.value||'');
  return rows;
}
function renderSeriesSemanticsOverrides(){
  const panel=$('seriesSemanticsPanel'),target=$('seriesSemanticsRows');
  if(!panel||!target)return;
  const rows=genericSeriesSemanticsRows();
  panel.hidden=!rows.length;
  if(!rows.length){target.innerHTML='';return;}
  const options=[
    ['','Unspecified / generic numeric'],
    ['level','Absolute level'],
    ['depth','Depth'],
    ['flow','Flow'],
    ['velocity','Velocity'],
    ['rainfall','Rainfall'],
  ];
  target.innerHTML=rows.map(row=>{
    const source=seriesLabel(row.mapped.item,row.mapped.col);
    return '<div class="series-semantics-row"><div class="series-semantics-source"><strong>'+esc(row.role)+'</strong> · '+esc(source)+'</div><label>Interpret Value as<select data-series-quantity-key="'+esc(row.key)+'">'+options.map(([value,label])=>'<option value="'+value+'"'+(row.quantity===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label></div>';
  }).join('');
  target.querySelectorAll('[data-series-quantity-key]').forEach(select=>select.addEventListener('change',()=>{
    void guarded('mappingStatus',()=>applySeriesQuantityOverride(select.dataset.seriesQuantityKey,select.value||null));
  }));
}
async function applySeriesQuantityOverride(key,quantity,{refresh=true}={}){
  const mapped=mappingObject(key);
  if(!mapped)throw new Error('The selected generic series is no longer available.');
  const declared=declaredSeriesQuantity(mapped.item,mapped.col);
  if(declared&&!state.seriesQuantityOverrides.has(key)&&String(declared).toLowerCase()!==String(quantity||'').toLowerCase()){
    throw new Error('Quantity overrides are only available for unresolved generic series.');
  }
  const requested=quantity?String(quantity).toLowerCase():null;
  await engine.call('set_series_quantity',{path:mapped.item.virtualPath,column:mapped.col,quantity:requested});
  const metadata=mapped.item.parsed.metadata||(mapped.item.parsed.metadata={});
  const seriesMetadata=metadata.series_metadata||(metadata.series_metadata={});
  const details=seriesMetadata[mapped.col]||(seriesMetadata[mapped.col]={});
  const quantityByColumn=metadata.quantity_by_column||(metadata.quantity_by_column={});
  if(requested){
    state.seriesQuantityOverrides.set(key,requested);
    details.quantity=requested;details.quantity_source='user';quantityByColumn[mapped.col]=requested;
  }else{
    state.seriesQuantityOverrides.delete(key);
    if(details.quantity_source==='user'){delete details.quantity;delete details.quantity_source;}
    quantityByColumn[mapped.col]=null;
  }
  window.ICMProjectRegistry?.registerSource(mapped.item);
  if(refresh){
    renderSeriesSemanticsOverrides();
    autoSuggestAdvanced(allSeries());
    $('mappingStatus').textContent=requested
      ?'Generic series classified as '+requested+'. Apply mapping to refresh graphs and threshold controls.'
      :'Generic series returned to unresolved numeric data. Apply mapping to refresh graphs and threshold controls.';
  }
  return true;
}

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

  // FastPath is a display accelerator. If an engineering mapping is already
  // applied, validating a newly imported preview must not replace that context.
  const appliedMapping={
    observed:state.mapping.observed||'',
    models:[...(state.mapping.models||[])],
    rain:state.mapping.rain||''
  };
  const preserveAppliedMapping=Boolean(appliedMapping.observed||appliedMapping.rain||appliedMapping.models.length);
  if(preserveAppliedMapping){
    if([...$('observedSelect').options].some(o=>o.value===appliedMapping.observed))$('observedSelect').value=appliedMapping.observed;
    [...$('modelSelect').options].forEach(o=>o.selected=appliedMapping.models.includes(o.value));
    if([...$('rainSelect').options].some(o=>o.value===appliedMapping.rain))$('rainSelect').value=appliedMapping.rain;
    if(window.ICMGraph&&window.ICMGraph.applyMapping)await window.ICMGraph.applyMapping();
    if(window.ICMFastPath&&window.ICMFastPath.clear)window.ICMFastPath.clear();
    return;
  }

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
  const importEpoch=sourceImportEpoch;
  const importIsCurrent=()=>importEpoch===sourceImportEpoch;
  const itemIsCurrent=item=>importIsCurrent()&&state.files.get(item.id)===item;
  let sourcePoolChanged=false,batchPreviewShown=false;
  const pending=[];
  $('poolSummary').textContent='Reading '+list.length+' source file'+(list.length===1?'':'s')+'…';
  for(let index=0;index<list.length;index+=1){
    if(!importIsCurrent())return;
    const file=list[index],displayName=file.webkitRelativePath||file._relativePath||file.name;
    if([...state.files.values()].some(x=>x.displayName===displayName&&x.file.size===file.size&&x.file.lastModified===file.lastModified))continue;
    await operationPaint();
    if(!importIsCurrent())return;
    const id=crypto.randomUUID(),item={
      id:id,file:file,displayName:displayName,virtualPath:'/data/'+id+'_'+safeName(file.name),status:'reading',parsed:null,preview:null,
      hash:null,error:null,loadSeconds:null,fastpathTiming:{t0:performance.now()}
    };
    state.files.set(id,item);sourcePoolChanged=true;renderPool();
    try{
      const buffer=await file.arrayBuffer();
      if(!itemIsCurrent(item))return;
      item.fastpathTiming.t1=performance.now();item._buffer=buffer;
      const hashPromise=sha256Bytes(buffer);
      const lower=file.name.toLowerCase(),previewEligible=lower.endsWith('.fdv')||lower.endsWith('.fdv.txt')||lower.endsWith('.csv')||lower.endsWith('.hyd');
      if(previewEligible){
        try{
          const fastResult=await fastpathEngine.parse(item,buffer,15000);
          if(!itemIsCurrent(item))return;
          item.fastpathTiming.t2=performance.now();
          item.preview=fastResult&&fastResult.parsed||null;
          item.fastpathTiming.t3=performance.now();
        }catch(previewError){
          if(!itemIsCurrent(item))return;
          // FastPath is an optional display accelerator. A preview-worker failure
          // must never block the authoritative Python import of an otherwise
          // valid engineering source.
          item.fastpathTiming.t2=performance.now();
          item.fastpathTiming.t3=item.fastpathTiming.t2;
          item.preview=null;
          item.previewWarning='Fast preview unavailable; continuing with authoritative analysis.';
          diagnostic.fastpathWarnings=diagnostic.fastpathWarnings||[];
          diagnostic.fastpathWarnings.push({time:new Date().toISOString(),file:displayName,message:String(previewError&&previewError.message||previewError)});
        }
      }
      item.hash=await hashPromise;
      if(!itemIsCurrent(item))return;
      if(item.preview&&item.preview.eligible){
        item.status='preview-ready';
        if(list.length===1&&!batchPreviewShown&&window.ICMFastPath&&window.ICMFastPath.renderPreview){
          batchPreviewShown=true;
          diagnostic.fastpathActiveSourceId=item.id;
          // Prepare the first useful graph immediately, but keep route selection under
          // user control. FastPath is a display accelerator, not a navigation action.
          const painted=await window.ICMFastPath.renderPreview(item,null,false);
          item.fastpathTiming.t4=painted&&painted.graphPaintAt||performance.now();
          item.fastpathTiming.t5=painted&&painted.statsPaintAt||item.fastpathTiming.t4;
        }
      }else{
        item.status='waiting-engine';
        if(item.preview&&item.preview.error)item.previewWarning=item.preview.error;
      }
      pending.push(item);recordFastPath(item);renderPool();
    }catch(err){
      if(!itemIsCurrent(item))return;
      item.status='error';item.error=String(err&&err.message||err);
      diagnostic.errors.push({time:new Date().toISOString(),target:'source-fastpath',message:item.error,file:displayName});
      renderPool();
    }
  }

  if(!importIsCurrent())return;
  if(!pending.length){if(sourcePoolChanged)notifySourcePoolChanged('ingest');return;}
  $('poolSummary').textContent=pending.filter(x=>x.preview&&x.preview.eligible).length+' preview-ready · initialising advanced analysis…';
  let engineInfo=null;
  try{
    engineInfo=await ensureEngineBoot();
    if(!importIsCurrent())return;
  }
  catch(err){
    if(!importIsCurrent())return;
    for(const item of pending){
      if(item.status==='error')continue;
      if(item.preview&&item.preview.eligible){item.status='preview-only';item.error='Advanced analysis unavailable; preview remains display-only.';}
      else{item.status='error';item.error='Advanced analysis unavailable and this format has no FastPath preview.';}
      recordFastPath(item);
    }
    renderPool();if(sourcePoolChanged)notifySourcePoolChanged('ingest');return;
  }

  for(let index=0;index<pending.length;index+=1){
    const item=pending[index];
    if(!itemIsCurrent(item))continue;
    if(item.status==='error')continue;
    item.status='validating';renderPool();await operationPaint();
    if(!itemIsCurrent(item))continue;
    const started=performance.now();
    try{
      const bytes=new Uint8Array(item._buffer);
      await engine.addFile(item,bytes);
      if(!itemIsCurrent(item))continue;
      item._buffer=null;
      const parsed=await engine.call('parse_source',{path:item.virtualPath});
      if(!itemIsCurrent(item))continue;
      item.parsed=parsed;
      item.fastpathTiming.t6=performance.now();
      item.status='ready';
      item.fastpathReconciliation=reconcileFastPath(item);
      if(item.fastpathReconciliation.status==='mismatch'){
        diagnostic.errors.push({time:new Date().toISOString(),target:'fastpath-reconciliation',message:'FastPath preview differed from authoritative parse.',file:item.displayName,detail:item.fastpathReconciliation});
      }
      window.ICMProjectRegistry?.registerSource(item);
    }catch(err){
      if(itemIsCurrent(item)){
        item.status='error';item.error=String(err&&err.message||err);
        diagnostic.errors.push({time:new Date().toISOString(),target:'source-pool',message:item.error,file:item.displayName});
      }
    }finally{
      if(itemIsCurrent(item)){
        item.loadSeconds=(performance.now()-started)/1000;
        recordFastPath(item);renderPool();renderSeriesOptions();
      }
    }
  }
  if(!importIsCurrent())return;
  // Publish the completed source-pool transaction before any slower graph handoff.
  // This keeps the externally observable pool lifecycle atomic: once a source is
  // rendered as Ready, listeners have already received the matching ingest event.
  if(sourcePoolChanged)notifySourcePoolChanged('ingest');
  const active=state.files.get(diagnostic.fastpathActiveSourceId);
  if(active&&active.status==='ready')await handoffFastPath(active);
  if(engineInfo&&$('poolSummary'))renderPool();
}
function sourceKeyBelongsTo(key,sourceId){
  if(!key||!sourceId)return false;
  const [id]=parseSourceKey(key);
  return id===sourceId;
}
function rebuildSpillModelSelect(){
  const select=$('spillModelSelect');
  if(!select)return;
  const previous=select.value;
  select.innerHTML='<option value="">No model selected</option>'+state.mapping.models.map(key=>{
    const mapped=mappingObject(key);
    return mapped?'<option value="'+esc(key)+'">'+esc(seriesLabel(mapped.item,mapped.col))+'</option>':'';
  }).join('');
  if(state.mapping.models.includes(previous))select.value=previous;
  else if(state.mapping.models.length)select.value=state.mapping.models[0];
}
async function removeSourceById(sourceId){
  const item=state.files.get(sourceId);
  if(!item)return false;
  if(TRANSIENT_SOURCE_STATUSES.has(item.status))throw new Error('Wait for '+item.displayName+' to finish importing before removing it.');

  syncExclusionsFromEditor();
  const observedRemoved=sourceKeyBelongsTo(state.mapping.observed,sourceId);
  const removedModelKeys=(state.mapping.models||[]).filter(key=>sourceKeyBelongsTo(key,sourceId));
  const rainfallRemoved=sourceKeyBelongsTo(state.mapping.rain,sourceId);
  const mappedChanged=observedRemoved||removedModelKeys.length>0||rainfallRemoved;
  const selectionRemoved=id=>sourceKeyBelongsTo($(id)?.value||'',sourceId);
  const ratingAffected=['ratingObsDepth','ratingObsFlow','ratingModelDepth','ratingModelFlow'].some(selectionRemoved);
  const storageAffected=['storageLevelSelect','storageFlowSelect'].some(selectionRemoved);
  const dwfAffected=selectionRemoved('dwfFlowSelect')||selectionRemoved('rainSelect')||rainfallRemoved;
  const rainfallAnalysisAffected=selectionRemoved('rainSelect')||rainfallRemoved;

  const orphanedExclusions=(state.exclusions||[]).filter(exclusion=>sourceKeyBelongsTo(exclusion.scope||'',sourceId));
  if(orphanedExclusions.length){
    state.deletedExclusions??=[];
    state.deletedExclusions.push(...orphanedExclusions.map(exclusion=>({...exclusion,removed_with_source:item.displayName,removed_at:new Date().toISOString()})));
    const orphanIds=new Set(orphanedExclusions.map(exclusion=>exclusion.id));
    state.exclusions=state.exclusions.filter(exclusion=>!orphanIds.has(exclusion.id));
  }

  state.files.delete(sourceId);
  window.ICMProjectRegistry?.removeSource(sourceId);
  for(const key of [...state.seriesQuantityOverrides.keys()])if(sourceKeyBelongsTo(key,sourceId))state.seriesQuantityOverrides.delete(key);
  for(const key of Object.keys(state.modelColours||{}))if(sourceKeyBelongsTo(key,sourceId))delete state.modelColours[key];
  if(observedRemoved)state.mapping.observed='';
  if(removedModelKeys.length)state.mapping.models=state.mapping.models.filter(key=>!sourceKeyBelongsTo(key,sourceId));
  if(rainfallRemoved)state.mapping.rain='';

  if(diagnostic.fastpathActiveSourceId===sourceId){
    diagnostic.fastpathActiveSourceId=null;
    window.ICMFastPath?.clear?.();
  }
  try{
    await engine.removeFile(item.virtualPath);
  }catch(error){
    diagnostic.errors.push({time:new Date().toISOString(),target:'source-remove-worker',message:String(error?.message||error),file:item.displayName});
  }

  if(observedRemoved){
    for(const id of ['obsThreshold','graphObsThreshold'])if($(id))$(id).value='';
  }
  if(removedModelKeys.length){
    for(const id of ['modelThreshold','graphModelThreshold'])if($(id))$(id).value='';
  }
  if(mappedChanged){
    state.comparisons=[];
    state.comparisonSnapshot=null;
    state.spills={};
    state.spillSnapshot=null;
    for(const id of ['scatterChart','residualChart','cumulativeChart','exceedanceChart'])Plotly.purge(id);
    renderSpills();
  }
  if(rainfallAnalysisAffected){
    state.rainEvents=[];
    state.rainEventResult=null;
    state.rainEventSignature=null;
    ++state.rainEventGeneration;
    if($('rainEventSummary'))$('rainEventSummary').innerHTML='<div class="pool-summary">Rainfall source removed. Re-run Rainfall Check after selecting another source.</div>';
    if($('rainEventBody'))$('rainEventBody').innerHTML='';
    if($('eventResponseBody'))$('eventResponseBody').innerHTML='';
  }
  if(dwfAffected){
    state.dwfResult=null;
    state.dwfSignature=null;
    ++state.dwfGeneration;
    if($('dwfSummary'))$('dwfSummary').innerHTML='<div class="pool-summary">DWF input source removed. Select a valid flow/rainfall source and recalculate.</div>';
  }
  if(ratingAffected){
    state.rating=null;
    diagnostic.lastRating=null;
    Plotly.purge('ratingChart');
    if($('ratingSummary'))$('ratingSummary').innerHTML='<div class="pool-summary">Rating input source removed. Select valid replacement series and recalculate.</div>';
  }
  if(storageAffected){
    state.storage=null;
    state.storageSignature=null;
    if($('storageSummary'))$('storageSummary').innerHTML='<div class="pool-summary">Storage input source removed. Select valid replacement series and recalculate.</div>';
    if($('storageBody'))$('storageBody').innerHTML='';
    if($('monthlyVolume'))$('monthlyVolume').innerHTML='';
  }
  state.healthResult=null;
  state.healthSignature=null;
  ++state.healthGeneration;
  if($('healthBody'))$('healthBody').innerHTML='';

  renderPool();
  renderSeriesOptions();
  rebuildSpillModelSelect();
  renderExclusions();
  if(mappedChanged)await drawTimeChart();
  notifySourcePoolChanged('remove');
  if($('mappingStatus')){
    const cleared=[
      observedRemoved?'observed mapping':null,
      removedModelKeys.length?removedModelKeys.length+' model mapping'+(removedModelKeys.length===1?'':'s'):null,
      rainfallRemoved?'rainfall mapping':null,
      orphanedExclusions.length?orphanedExclusions.length+' source-specific exclusion'+(orphanedExclusions.length===1?'':'s'):null,
    ].filter(Boolean);
    $('mappingStatus').textContent='Removed '+item.displayName+'. '+(cleared.length?'Cleared '+cleared.join(', ')+'; unaffected sources and mappings were retained.':'Existing mappings were unaffected.');
  }
  return true;
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
    const removeDisabled=TRANSIENT_SOURCE_STATUSES.has(item.status);
    const removeTitle=removeDisabled?'Finish importing before removing':'Remove '+item.displayName;
    return '<tr data-source-id="'+esc(item.id)+'"><td><div class="file-name">'+esc(item.displayName)+'</div><small>'+mb(item.file.size)+' · SHA '+(item.hash?item.hash.slice(0,10):'…')+'</small></td><td>'+esc(p.format||'—')+'</td><td>'+(p.rows??'—')+'</td><td>'+period+'</td><td class="'+((sent||malformed||(item.fastpathReconciliation&&item.fastpathReconciliation.status==='mismatch'))?'audit-warn':'audit-good')+'">'+esc(auditText)+'</td><td>'+status+'</td><td class="source-remove-cell"><button type="button" class="source-remove-btn" data-source-remove="'+esc(item.id)+'" aria-label="'+esc(removeTitle)+'" title="'+esc(removeTitle)+'" '+(removeDisabled?'disabled':'')+'>×</button></td></tr>';
  }).join('');
  document.querySelectorAll('[data-source-remove]').forEach(button=>button.addEventListener('click',()=>void guarded('poolSummary',()=>removeSourceById(button.dataset.sourceRemove))));
}
function renderSeriesOptions(){
  const all=allSeries(),obs=$('observedSelect'),mod=$('modelSelect'),rain=$('rainSelect'),prevMods=[...mod.selectedOptions].map(o=>o.value);
  setOptions(obs,all);
  mod.innerHTML=all.map(s=>`<option value='${esc(s.key)}'>${esc(s.label)}</option>`).join('');
  [...mod.options].forEach(o=>o.selected=prevMods.includes(o.value));
  setOptions(rain,all,{none:true});
  const quantity=s=>String(s.quantity||seriesQuantity(s.item,s.col)||'').toLowerCase();
  const vertical=all.filter(s=>['depth','level'].includes(quantity(s)));
  const flow=all.filter(s=>quantity(s)==='flow');
  for(const id of ['storageLevelSelect','ratingObsDepth','ratingModelDepth'])setOptions($(id),vertical);
  for(const id of ['storageFlowSelect','ratingObsFlow','ratingModelFlow','dwfFlowSelect'])setOptions($(id),flow);
  autoSuggestMappings(all);autoSuggestAdvanced(all);renderModelColourControls();renderSeriesSemanticsOverrides();
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
  const vertical=s=>q(s,'depth')||q(s,'level');
  const obsVertical=obs&&['depth','level'].includes(String(seriesQuantity(obs.item,obs.col)||'').toLowerCase())?String(seriesQuantity(obs.item,obs.col)).toLowerCase():null;
  if(!$('ratingObsDepth').value&&obs&&obsVertical)$('ratingObsDepth').value=sourceKey(obs.item.id,obs.col);
  prefer($('ratingObsDepth'),all,s=>(!obs||s.item.id===obs.item.id)&&vertical(s));
  prefer($('ratingObsFlow'),all,s=>(!obs||s.item.id===obs.item.id)&&q(s,'flow'));
  prefer($('ratingModelDepth'),all,s=>(!model||s.item.id===model.item.id)&&vertical(s)&&(!obsVertical||q(s,obsVertical)));
  prefer($('ratingModelFlow'),all,s=>(!model||s.item.id===model.item.id)&&q(s,'flow'));
  prefer($('dwfFlowSelect'),all,s=>(!obs||s.item.id===obs.item.id)&&q(s,'flow'));
  prefer($('storageFlowSelect'),all,s=>q(s,'flow'));
  prefer($('storageLevelSelect'),all,s=>(!model||s.item.id===model.item.id)&&vertical(s));
}
function renderModelColourControls(){
  const models=[...$('modelSelect').selectedOptions].map(o=>mappingObject(o.value)).filter(Boolean);
  const scenarioIndex=new Map();
  for(const model of models)if(!scenarioIndex.has(model.item.id))scenarioIndex.set(model.item.id,scenarioIndex.size);
  $('modelColourControls').innerHTML=models.map((m,i)=>{
    const key=sourceKey(m.item.id,m.col),scenario=scenarioIndex.get(m.item.id)||0;
    if(!state.modelColours[key])state.modelColours[key]=palette[scenario%palette.length];
    return `<label title="${esc(m.item.displayName)} · ${esc(m.col)}"><span class="colour-label-text">Model ${scenario+1} · ${esc(m.item.displayName)} · ${esc(m.col)}</span><input class="model-colour" aria-label="Model ${scenario+1} colour" data-key='${esc(key)}' type="color" value="${state.modelColours[key]}"></label>`;
  }).join('');
  document.querySelectorAll('.model-colour').forEach(x=>x.addEventListener('input',()=>{state.modelColours[x.dataset.key]=x.value;guarded('mappingStatus',drawTimeChart);}));
}

async function applyMapping(){return window.ICMGraph?.applyMapping();}
async function seriesFor(key,maxPoints=25000){const x=mappingObject(key);if(!x)return null;return {...x,data:await engine.call('series_data',{path:x.item.virtualPath,column:x.col,max_points:maxPoints})};}
function inEvent(ts){const t=modelClock(ts);return state.rainEvents.some(e=>t>=modelClock(e.start)&&t<=modelClock(e.end));}
function graphShapes(){const shapes=[],a=nullableNumber($('obsThreshold').value),b=nullableNumber($('modelThreshold').value);if(a!==null)shapes.push({type:'line',xref:'paper',x0:0,x1:1,yref:'y',y0:a,y1:a,line:{color:$('threshold1Color').value,width:2,dash:'dash'}});if(b!==null)shapes.push({type:'line',xref:'paper',x0:0,x1:1,yref:'y',y0:b,y1:b,line:{color:$('threshold2Color').value,width:2,dash:'dash'}});if($('showEventOverlay').checked)for(const e of state.rainEvents)shapes.push({type:'rect',xref:'x',x0:e.start,x1:e.end,yref:'paper',y0:0,y1:1,fillcolor:$('rainEventColor').value,opacity:.1,line:{width:0},layer:'below'});return shapes;}
function graphAnnotations(){const out=[],a=nullableNumber($('obsThreshold').value),b=nullableNumber($('modelThreshold').value);if(a!==null)out.push({xref:'paper',x:1,yref:'y',y:a,text:$('threshold1Label').value,showarrow:false,xanchor:'right',yanchor:'bottom',font:{size:10,color:$('threshold1Color').value}});if(b!==null)out.push({xref:'paper',x:1,yref:'y',y:b,text:$('threshold2Label').value,showarrow:false,xanchor:'right',yanchor:'bottom',font:{size:10,color:$('threshold2Color').value}});if($('showEventOverlay').checked)for(const e of state.rainEvents)out.push({xref:'x',x:e.start,yref:'paper',y:1,text:`E${e.event}`,showarrow:false,yanchor:'bottom',font:{size:9,color:'#8a4b00'}});return out;}
async function drawTimeChart(){return window.ICMGraph?.draw();}

function analysisBounds(){return {start:modelClock($('analysisStart').value)||null,end:modelClock($('analysisEnd').value)||null};}

function appliedRainCriteria(){
  const preset=$('rainCriteriaMode')?.value==='wapug';
  return {
    mode:preset?'wapug':'manual',
    minimum_intensity:preset?5:Number($('rainMinIntensity')?.value||5),
    minimum_intensity_duration_min:preset?6:Number($('rainIntensityDuration')?.value||6),
    minimum_depth_mm:preset?5:Number($('rainTotalDepth')?.value||5),
    minimum_event_duration_min:preset?60:Number($('rainEventDuration')?.value||60),
    dry_gap_min:preset?15:Number($('rainDryGap')?.value||15),
  };
}
function rainEventInputSignature(){
  return JSON.stringify({
    rain:workspaceSeries(state.mapping.rain),
    conversion_factor:Number($('rainFactor')?.value||1),
    criteria:appliedRainCriteria(),
    exclusions:exclusionPayload(false,'rainfall'),
    time_basis:'model clock/unspecified',
  });
}
function rainEventsFresh(){
  return Boolean(state.rainEventResult&&state.rainEventSignature&&state.rainEventSignature===rainEventInputSignature());
}
function invalidateRainEvents(reason='Rainfall-event inputs changed.'){
  ++state.rainEventGeneration;
  const had=Boolean(state.rainEventResult||state.rainEventSignature||state.rainEvents.length);
  state.rainEventResult=null;state.rainEventSignature=null;state.rainEvents=[];
  if(had){
    if($('rainEventSummary'))$('rainEventSummary').innerHTML='<div class="pool-summary audit-warn"><strong>Stale rainfall-event result cleared.</strong> '+esc(reason)+' Re-run Rainfall Check before relying on event bands or response diagnostics.</div>';
    if($('rainEventBody'))$('rainEventBody').innerHTML='';
    if($('eventResponseBody'))$('eventResponseBody').innerHTML='';
    void drawTimeChart();
  }
}
function dwfInputSignature(){
  const flowKey=$('dwfFlowSelect')?.value||'';
  return JSON.stringify({
    flow:workspaceSeries(flowKey),
    flow_unit_override:$('dwfFlowUnit')?.value||null,
    rain:workspaceSeries(state.mapping.rain),
    rain_factor:Number($('rainFactor')?.value||1),
    dry_day_mm:Number($('dwfDryDay')?.value||1),
    baseline_days:Number($('dwfBaselineDays')?.value||28),
    min_dry_days:5,
    adp_hours:Number($('dwfAdpHours')?.value||6),
    analysis:analysisBounds(),
    flow_exclusions:exclusionPayload(false,'observed',flowKey),
    rainfall_exclusions:exclusionPayload(false,'rainfall',state.mapping.rain),
    time_basis:'model clock/unspecified',
  });
}
function dwfFresh(){return Boolean(state.dwfResult&&state.dwfSignature&&state.dwfSignature===dwfInputSignature());}
function invalidateDwf(reason='DWF inputs changed.'){
  ++state.dwfGeneration;
  const had=Boolean(state.dwfResult||state.dwfSignature);
  state.dwfResult=null;state.dwfSignature=null;
  if(had&&$('dwfSummary'))$('dwfSummary').innerHTML='<div class="pool-summary audit-warn"><strong>Stale DWF result cleared.</strong> '+esc(reason)+' Recalculate the dry-weather baseline before relying on it.</div>';
}
function healthInputSignature(){
  return JSON.stringify({
    sources:[...state.files.values()].filter(x=>x.status==='ready').map(x=>({sha256:x.hash,format:x.parsed?.format,columns:x.parsed?.columns||[]})).sort((a,b)=>String(a.sha256).localeCompare(String(b.sha256))),
    max_gap_seconds:Number($('gapInput')?.value||900),
    time_basis:'model clock/unspecified',
  });
}
function healthFresh(){return Boolean(state.healthResult&&state.healthSignature&&state.healthSignature===healthInputSignature());}
function invalidateHealth(reason='Data Health inputs changed.'){
  ++state.healthGeneration;
  const had=Boolean(state.healthResult||state.healthSignature);
  state.healthResult=null;state.healthSignature=null;
  if(had&&$('healthBody'))$('healthBody').innerHTML='<tr><td colspan="13" class="audit-warn"><strong>Stale Data Health result cleared.</strong> '+esc(reason)+' Re-run FDV Check before relying on QA evidence.</td></tr>';
}
diagnostic.rainEventsFresh=rainEventsFresh;
diagnostic.dwfFresh=dwfFresh;
Object.defineProperty(diagnostic,'dwfResult',{get:()=>state.dwfResult});
diagnostic.healthFresh=healthFresh;
function comparisonQuantityMismatch(observed,model){
  if(!observed||!model)return null;
  const observedQuantity=String(seriesQuantity(observed.item,observed.col)||'').toLowerCase();
  const modelQuantity=String(seriesQuantity(model.item,model.col)||'').toLowerCase();
  if(!observedQuantity&&!modelQuantity)return null;
  if(!observedQuantity||!modelQuantity)return 'One selected series has an unresolved quantity while the other is classified. Classify the generic series to match the hydraulic channel before comparing it.';
  if(observedQuantity===modelQuantity)return null;
  const name=q=>q==='level'?'absolute Level':q.charAt(0).toUpperCase()+q.slice(1);
  return `Observed ${name(observedQuantity)} cannot be compared directly with modelled ${name(modelQuantity)}. Depth and absolute Level remain distinct. Map like-for-like series, or explicitly reclassify a generic Value channel only when its source meaning supports that classification.`;
}
async function runCompare(){
  const obs=mappingObject(state.mapping.observed),models=currentModels();
  if(!obs||!models.length)throw new Error('Apply an observed and at least one modelled series first.');
  const gap=Number($('gapInput').value||900),offset=Number($('offsetInput').value||0),bounds=analysisBounds(),signature=analysisSignature(),config=workspaceObject();
  state.comparisons=[];
  for(const m of models){
    const mismatch=comparisonQuantityMismatch(obs,m);
    if(mismatch){state.comparisons.push({model:m,error:mismatch});continue;}
    try{
      state.comparisons.push({model:m,result:await engine.call('compare_series',{
        obs_path:obs.item.virtualPath,obs_col:obs.col,model_path:m.item.virtualPath,model_col:m.col,
        max_gap_seconds:gap,offset_minutes:offset,...bounds,
        exclusions_json:JSON.stringify([...exclusionPayload(true,'observed',state.mapping.observed),...exclusionPayload(true,'model',sourceKey(m.id,m.col))])
      })});
    }catch(err){
      state.comparisons.push({model:m,error:conciseErrorMessage(err)});
    }
  }
  if(signature!==analysisSignature()){state.comparisons=[];throw new Error('Comparison inputs changed while calculation was running. The late result was discarded.');}
  await renderComparisons();
  state.comparisonSnapshot={signature,config,results:JSON.parse(JSON.stringify(state.comparisons.map(x=>({model:workspaceSeries(sourceKey(x.model.id,x.model.col)),result:x.result,error:x.error}))))};
}
const metricCard=(k,v,reason='')=>`<div class="metric"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>${reason?`<small>${esc(reason)}</small>`:''}</div>`;
function metricPresentation(metrics,key,unit=''){
  const value=metrics?.[key],reason=metrics?.unavailable_reasons?.[key]||'';
  if(value===null||value===undefined||!Number.isFinite(Number(value)))return {text:'Not available',reason};
  return {text:fmt(Number(value),4)+(unit?' '+unit:''),reason:''};
}
function scatterPopulation(result,log=false){
  const raw=(result?.paired||[]).filter(x=>Number.isFinite(Number(x.obs))&&Number.isFinite(Number(x.sim)));
  const pairs=log?raw.filter(x=>Number(x.obs)>0&&Number(x.sim)>0):raw;
  return {
    pairs,
    metrics:(log?result?.positive_metrics:result?.metrics)||{},
    removed_count:log?Number(result?.positive_removed_count||Math.max(0,raw.length-pairs.length)):0,
  };
}
function regressionLinePoints(metrics,pairs,log=false){
  const slope=Number(metrics?.regression_slope),intercept=Number(metrics?.regression_intercept);
  if(!Number.isFinite(slope)||!Number.isFinite(intercept)||pairs.length<2)return null;
  const xs=pairs.map(x=>Number(x.obs)).filter(x=>Number.isFinite(x)&&(log?x>0:true));
  if(xs.length<2)return null;
  let lo=Math.min(...xs),hi=Math.max(...xs);
  if(!(hi>lo))return null;
  if(log){
    const yLo=intercept+slope*lo,yHi=intercept+slope*hi;
    if(yLo<=0&&yHi<=0)return null;
    const root=slope!==0?-intercept/slope:null;
    const eps=x=>Math.max(Math.abs(x||1)*1e-9,1e-12);
    if(yLo<=0&&yHi>0&&Number.isFinite(root))lo=Math.max(lo,root+eps(root));
    if(yHi<=0&&yLo>0&&Number.isFinite(root))hi=Math.min(hi,root-eps(root));
    if(!(lo>0&&hi>lo))return null;
  }
  const y0=intercept+slope*lo,y1=intercept+slope*hi;
  if(!Number.isFinite(y0)||!Number.isFinite(y1)||(log&&(y0<=0||y1<=0)))return null;
  return {x:[lo,hi],y:[y0,y1]};
}
function comparisonUnit(result){return result?.observed_unit||result?.modelled_unit||'';}
function comparisonQuantity(result){return result?.observed_quantity||result?.modelled_quantity||'value';}
async function renderComparisons(){
  const ok=state.comparisons.filter(x=>x.result),first=ok[0];
  if(!first){
    const issues=state.comparisons.map(x=>({name:`${x.model?.item?.displayName||'Model'} · ${x.model?.col||'series'}`,error:x.error||'Comparison returned no usable result.'}));
    $('metricGrid').innerHTML='<div class="pool-summary audit-bad"><strong>Comparison could not be calculated.</strong><br>'+issues.map(x=>esc(x.name)+': '+esc(x.error)).join('<br>')+'<br><small>Check quantity mapping, the shared analysis period, exclusions and the maximum interpolation gap. The error above is retained instead of hiding it behind a generic “no pairs” message.</small></div>';
    $('scenarioBody').innerHTML=issues.map(x=>'<tr><td>'+esc(x.name)+'</td><td colspan="13" class="audit-bad">'+esc(x.error)+'</td></tr>').join('');
    for(const id of ['scatterChart','residualChart','cumulativeChart','exceedanceChart'])Plotly.purge(id);
    return;
  }
  const log=$('scatterScale').value==='log',firstPopulation=scatterPopulation(first.result,log),m=firstPopulation.metrics||{};
  const status=first.result.calculation_status||'unavailable',coverage=first.result.coverage_fraction,unit=comparisonUnit(first.result);
  const metric=(label,key,withUnit=false)=>{const p=metricPresentation(m,key,withUnit?unit:'');return metricCard(label,p.text,p.reason);};
  $('metricGrid').innerHTML=[
    metricCard('Calculation status',status),
    metricCard('Valid support',coverage===null||coverage===undefined?'Not available':fmt(Number(coverage)*100,2)+'%',coverage===null||coverage===undefined?'paired temporal support is unavailable':''),
    metricCard(log?'Positive pairs':'Pairs',m.pairs??firstPopulation.pairs.length),
    ...(log?[metricCard('Removed ≤0 pairs',firstPopulation.removed_count)]:[]),
    metric('Pearson r','correlation'),
    metric('Regression R²','regression_r2'),
    metric('Slope','regression_slope'),
    metric('Intercept','regression_intercept',true),
    metric('RMSE','rmse',true),
    metric('MAE','mae',true),
    metric('Mean bias (M − O)','mean_bias',true),
    metric('NSE','nse'),
    metric('KGE 2009','kge_2009'),
  ].join('');
  const methodNote=$('comparisonMethodNote');
  if(methodNote){
    const genericNote=first.result.generic_numeric_comparison?' Both selected channels are generic numeric values, so the comparison is permitted without asserting a hydraulic quantity or unit; dimensional metric units remain unresolved.':'';
    methodNote.innerHTML='<strong>Pairing and statistics.</strong> '+esc(first.result.pairing_method||'Canonical paired support')+'. Each model scenario uses its own valid paired support unless a common-support option is explicitly selected. '+esc(first.result.metric_weighting||'Sample-weighted metrics')+'. Blank analysis start/end means the complete common observed/modelled support is used.'+esc(genericNote)+' Plot zoom is display-only and does not change the analysis period.';
  }
  diagnostic.lastComparisonValidity={status,coverage,population:log?'positive-only':'all valid pairs'};

  const scatter=[],allValues=[];
  ok.forEach((entry,i)=>{
    const population=scatterPopulation(entry.result,log),pairs=population.pairs,metrics=population.metrics||{};
    const key=sourceKey(entry.model.item.id,entry.model.col),colour=state.modelColours[key]||palette[i%palette.length];
    const scenario=`${entry.model.item.displayName} · ${entry.model.col}`;
    allValues.push(...pairs.flatMap(x=>[Number(x.obs),Number(x.sim)]));
    scatter.push({
      x:pairs.map(x=>x.obs),y:pairs.map(x=>x.sim),mode:'markers',name:scenario,
      marker:{size:6,opacity:.48,color:colour},
      customdata:pairs.map(x=>[x.timestamp,x.obs,x.sim]),
      hovertemplate:'<b>'+esc(scenario)+'</b><br>%{customdata[0]}<br>Observed: %{customdata[1]:.5g}<br>Modelled: %{customdata[2]:.5g}<extra></extra>'
    });
    const fit=regressionLinePoints(metrics,pairs,log);
    if(fit)scatter.push({x:fit.x,y:fit.y,mode:'lines',name:`${scenario} fit`,line:{color:colour,width:2},hoverinfo:'skip'});
  });
  const finite=allValues.filter(Number.isFinite).filter(x=>!log||x>0),lo=Math.min(...finite),hi=Math.max(...finite);
  if(Number.isFinite(lo)&&Number.isFinite(hi)&&hi>lo)scatter.push({x:[lo,hi],y:[lo,hi],mode:'lines',name:'1:1 agreement',line:{dash:'dash',color:'#667085',width:1.6},hoverinfo:'skip'});
  const quantity=comparisonQuantity(first.result),unitSuffix=unit?` (${unit})`:'',axisUnitSuffix=` (${unit||'unit unresolved'})`,bounds=analysisBounds();
  const period=bounds.start||bounds.end?` · ${bounds.start||'data start'} → ${bounds.end||'data end'}`:' · full common support';
  const axisRange=Number.isFinite(lo)&&Number.isFinite(hi)&&hi>lo?(log?[Math.log10(lo),Math.log10(hi)]:[lo,hi]):undefined;
  await Plotly.react('scatterChart',scatter,{
    template:'plotly_white',
    title:`Observed vs modelled ${quantity}${log?' · log₁₀ positive pairs':' · linear'}${period}`,
    legend:{orientation:'h',y:1.16,x:0},
    xaxis:{title:{text:`Observed ${quantity}${axisUnitSuffix}`},type:log?'log':'linear',range:axisRange},
    yaxis:{title:{text:`Modelled ${quantity}${axisUnitSuffix}`},type:log?'log':'linear',range:axisRange,scaleanchor:'x',scaleratio:1},
    margin:{l:68,r:28,t:84,b:64},
    annotations:log&&firstPopulation.removed_count?[{xref:'paper',yref:'paper',x:1,y:-.17,xanchor:'right',showarrow:false,text:`${firstPopulation.removed_count} nonpositive pair(s) removed from log view`,font:{size:11,color:'#667085'}}]:[]
  },plotConfig('engineering-graph'));

  const rawFirst=scatterPopulation(first.result,false).pairs;
  await Plotly.react('residualChart',[{x:rawFirst.map(x=>x.timestamp),y:rawFirst.map(x=>x.residual),mode:'lines',name:'Model − observed',line:{color:'#a62929',width:1.4}}],{template:'plotly_white',title:'Residual through time · all valid pairs',xaxis:{title:'Time'},yaxis:{title:`Residual${unitSuffix}`},margin:{l:60,r:20,t:50,b:50}},plotConfig('engineering-graph'));
  const obs=mappingObject(state.mapping.observed),d=await engine.call('diagnostic_result',{obs_path:obs.item.virtualPath,obs_col:obs.col,model_path:first.model.item.virtualPath,model_col:first.model.col,max_gap_seconds:Number($('gapInput').value||900),offset_minutes:Number($('offsetInput').value||0),...analysisBounds(),exclusions_json:JSON.stringify([...exclusionPayload(true,'observed',state.mapping.observed),...exclusionPayload(true,'model',sourceKey(first.model.id,first.model.col))])}),cum=d.cumulative||[];
  await Plotly.react('cumulativeChart',[{x:cum.map(x=>x.timestamp),y:cum.map(x=>x.obs_cumulative_m3),name:'Observed cumulative',mode:'lines',line:{color:$('obsColor').value}},{x:cum.map(x=>x.timestamp),y:cum.map(x=>x.sim_cumulative_m3),name:'Model cumulative',mode:'lines',line:{color:state.modelColours[sourceKey(first.model.id,first.model.col)]||palette[0]}}],{template:'plotly_white',title:d.flow_diagnostics_available?'Cumulative volume':'Unavailable — flow inputs and unmasked support required',xaxis:{title:'Time'},yaxis:{title:/flow/i.test(obs.col)?'m³':'value × s'},margin:{l:55,r:20,t:45,b:50}},plotConfig('engineering-graph'));
  const oe=d.observed_exceedance||[],me=d.modelled_exceedance||[],okey=oe.length?Object.keys(oe[0]).find(k=>!['exceedance_fraction','weight'].includes(k)):null,mkey=me.length?Object.keys(me[0]).find(k=>!['exceedance_fraction','weight'].includes(k)):null;
  await Plotly.react('exceedanceChart',[{x:oe.map(x=>100*x.exceedance_fraction),y:oe.map(x=>x[okey]),name:'Observed',mode:'lines',line:{color:$('obsColor').value}},{x:me.map(x=>100*x.exceedance_fraction),y:me.map(x=>x[mkey]),name:'Modelled',mode:'lines',line:{color:state.modelColours[sourceKey(first.model.id,first.model.col)]||palette[0]}}],{template:'plotly_white',title:d.flow_diagnostics_available?'Flow duration — left-support time weighting':'Unavailable — flow inputs and unmasked support required',xaxis:{title:'Exceedance %'},yaxis:{title:'Value'},margin:{l:55,r:20,t:45,b:50}},plotConfig('engineering-graph'));

  $('scenarioBody').innerHTML=state.comparisons.map(x=>{
    if(!x.result)return `<tr><td>${esc(x.model.item.displayName)} · ${esc(x.model.col)}</td><td colspan="13" class="audit-bad">${esc(x.error||'Unavailable')}</td></tr>`;
    const pop=scatterPopulation(x.result,false),q=x.result.metrics||pop.metrics||{},uq=comparisonUnit(x.result);
    const cell=(key,withUnit=false)=>{const p=metricPresentation(q,key,withUnit?uq:'');return `<span${p.reason?` title="${esc(p.reason)}"`:''}>${esc(p.text)}</span>`;};
    return `<tr><td>${esc(x.model.item.displayName)} · ${esc(x.model.col)}</td><td>${q.pairs??pop.pairs.length}</td><td>${cell('obs_mean',true)}</td><td>${cell('sim_mean',true)}</td><td>${cell('obs_peak',true)}</td><td>${cell('sim_peak',true)}</td><td>${cell('correlation')}</td><td>${cell('regression_r2')}</td><td>${cell('rmse',true)}</td><td>${cell('mae',true)}</td><td>${cell('mean_bias',true)}</td><td>${cell('nse')}</td><td>${cell('kge_2009')}</td><td>${x.result.coverage_fraction==null?'Not available':fmt(Number(x.result.coverage_fraction)*100,1)+'%'}</td></tr>`;
  }).join('');
}

function useGraphZoom(){const r=$('timeChart')?.layout?.xaxis?.range;if(r?.length===2){$('analysisStart').value=toLocalInput(r[0]);$('analysisEnd').value=toLocalInput(r[1]);}}

function storageInputSignature(){
  const levelKey=$('storageLevelSelect')?.value||'',flowKey=$('storageFlowSelect')?.value||'';
  return JSON.stringify({
    analysis:analysisSignature(),
    level:workspaceSeries(levelKey),
    flow:workspaceSeries(flowKey),
    level_unit_override:$('storageLevelUnit')?.value||null,
    flow_unit_override:$('storageFlowUnit')?.value||null,
    threshold:nullableNumber($('storageThreshold')?.value??''),
    target_count:Number($('targetCount')?.value||10),
    exclusions:exclusionPayload(false,'model',levelKey),
  });
}
function ratingInputSignature(){
  return JSON.stringify({
    analysis:analysisSignature(),
    observedDepth:$('ratingObsDepth')?.value||'',
    observedDepthUnit:$('ratingObsDepthUnit')?.value||'',
    observedFlow:$('ratingObsFlow')?.value||'',
    observedFlowUnit:$('ratingObsFlowUnit')?.value||'',
    modelDepth:$('ratingModelDepth')?.value||'',
    modelDepthUnit:$('ratingModelDepthUnit')?.value||'',
    modelFlow:$('ratingModelFlow')?.value||'',
    modelFlowUnit:$('ratingModelFlowUnit')?.value||'',
  });
}
function ratingAssetIdentity(selection){
  if(!selection)return null;
  const snapshot=window.ICMProjectRegistry?.snapshot?.();
  const source=(snapshot?.sources||[]).find(x=>x.id===selection.item.id);
  return source?.assetId||selection.item?.parsed?.metadata?.monitor||null;
}
function ratingDiameterContext(depthSelection,flowSelection){
  const normalise=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
  const depthAsset=ratingAssetIdentity(depthSelection),flowAsset=ratingAssetIdentity(flowSelection);
  if(depthAsset&&flowAsset&&normalise(depthAsset)!==normalise(flowAsset)){
    return {status:'asset-mismatch',monitor:depthAsset,reason:'Selected observed depth/level and flow resolve to different monitored assets.'};
  }
  const monitor=depthAsset||flowAsset||null;
  if(String(seriesQuantity(depthSelection?.item,depthSelection?.col)||'').toLowerCase()!=='depth'){
    return {status:'generic',monitor,reason:'Absolute level/stage cannot be normalised by pipe diameter without a defensible invert/reference; using a generic data-fitted relationship.'};
  }
  const survey=window.__ICM_WORKBENCH__?.survey,association=survey?.association;
  if(!association||!monitor)return {status:'generic',monitor,reason:'No monitor-specific fm_rg_assoc diameter is available; using a generic data-fitted relationship.'};
  const matches=(association.records||[]).filter(x=>normalise(x.monitor)===normalise(monitor));
  const blocking=(association.issues||[]).filter(x=>String(x.severity).toLowerCase()==='error'&&normalise(x.monitor)===normalise(monitor));
  if(blocking.length||matches.length!==1){
    return {status:'ambiguous',monitor,reason:'The fm_rg_assoc association for this monitor is ambiguous; diameter is not applied.',issues:blocking};
  }
  const record=matches[0],diameter=Number(record.diameter_mm);
  if(!Number.isFinite(diameter)||diameter<=0){
    return {status:'generic',monitor,reason:'The matched fm_rg_assoc row has no valid positive diameter; using a generic data-fitted relationship.'};
  }
  return {
    status:'diameter-informed',monitor,diameter_mm:diameter,
    source:{
      file:survey.associationSource?.name||record.source||'fm_rg_assoc.xlsx',
      sheet:survey.associationSource?.sheet||association.sheet_name||null,
      sha256:survey.associationSource?.sha256||null,
      row:record.row||null,
      source_unit:record.diameter_source_unit||'mm',
    },
    reason:'Monitor-specific fm_rg_assoc diameter applied to H/D and crown-depth context.'
  };
}
function ratingExclusions(role,selections){
  const rows=[];
  for(const selection of selections.filter(Boolean)){
    rows.push(...exclusionPayload(true,role,sourceKey(selection.item.id,selection.col)));
  }
  return [...new Map(rows.map(x=>[JSON.stringify(x),x])).values()];
}
async function runRating(){
  const od=mappingObject($('ratingObsDepth').value),of=mappingObject($('ratingObsFlow').value),md=mappingObject($('ratingModelDepth').value),mf=mappingObject($('ratingModelFlow').value);
  if(!od)throw new Error('Select observed depth or level.');
  const gap=Number($('gapInput').value||900),requestSignature=ratingInputSignature();

  // Depth/level agreement uses the canonical Python comparison regression. Do
  // not create a second JavaScript regression implementation.
  if(md && (!of || !mf)){
    const mismatch=comparisonQuantityMismatch(od,md);
    if(mismatch)throw new Error('Depth / level agreement requires like-for-like vertical quantities. '+mismatch);
    const depth=await engine.call('compare_series',{
      obs_path:od.item.virtualPath,obs_col:od.col,
      model_path:md.item.virtualPath,model_col:md.col,
      max_gap_seconds:gap,...analysisBounds(),
      obs_unit:$('ratingObsDepthUnit')?.value||null,
      model_unit:$('ratingModelDepthUnit')?.value||null,
      exclusions_json:JSON.stringify([
        ...ratingExclusions('observed',[od]),
        ...ratingExclusions('model',[md]),
      ]),
    });
    const points=(depth.paired||[]).map(x=>({x:Number(x.obs),y:Number(x.sim)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    if(points.length<2)throw new Error('Depth/level comparison has fewer than 2 bounded valid pairs in the selected analysis period.');
    const metrics=depth.metrics||{},slope=Number(metrics.regression_slope),intercept=Number(metrics.regression_intercept);
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),lo=Math.min(...xs,...ys),hi=Math.max(...xs,...ys);
    const fitAvailable=Number.isFinite(slope)&&Number.isFinite(intercept);
    const unit=depth.observed_unit||seriesUnit(od.item,od.col)||'';
    $('ratingSummary').innerHTML=`<div class="summary-box"><div><strong>${fmt(points.length,0)}</strong><span>Valid paired points</span></div><div><strong>${fmt(metrics.rmse,4)}${unit?' '+esc(unit):''}</strong><span>RMSE</span></div><div><strong>${fmt(metrics.mean_bias,4)}${unit?' '+esc(unit):''}</strong><span>Mean error (model − observed)</span></div><div><strong>${fmt(metrics.regression_r2,4)}</strong><span>Regression R²</span></div><div><strong>${fitAvailable?'Hmodel = '+fmt(intercept,4)+' + '+fmt(slope,4)+' Hobs':'Unavailable'}</strong><span>Authoritative Python least-squares fit</span></div></div><div class="pool-summary">Depth/level agreement fit from canonical bounded pairs. Add observed and model flow selections to switch to the empirical Q–H rating diagnostic.</div>`;
    const traces=[
      {x:xs,y:ys,mode:'markers',name:'Paired depth / level',marker:{size:5,opacity:.38,color:$('obsColor').value},
       customdata:(depth.paired||[]).map(x=>x.timestamp),hovertemplate:'Observed %{x:.4g}<br>Modelled %{y:.4g}<extra></extra>'},
      {x:[lo,hi],y:[lo,hi],mode:'lines',name:'1:1',line:{dash:'dash',color:'#667085'}},
    ];
    if(fitAvailable)traces.push({x:[lo,hi],y:[intercept+slope*lo,intercept+slope*hi],mode:'lines',name:'Python fitted relationship',line:{width:2,color:state.modelColours[state.mapping.models[0]]||palette[0]}});
    if(requestSignature!==ratingInputSignature())throw new Error('Rating inputs changed while calculation was running. The late result was discarded.');
    state.rating={kind:'depth-agreement',result:depth,context:null,signature:requestSignature};
    await Plotly.react('ratingChart',traces,{template:'plotly_white',title:'Observed vs modelled depth / level agreement',xaxis:{title:'Observed'+(unit?' ('+unit+')':'')},yaxis:{title:'Modelled'+(unit?' ('+unit+')':'')},margin:{l:65,r:24,t:48,b:58},legend:{orientation:'h',y:1.13}},plotConfig('engineering-graph'));
    return;
  }

  if(!of)throw new Error('Select observed flow for a Q–H rating diagnostic.');
  const diameterContext=ratingDiameterContext(od,of);
  if(diameterContext.status==='asset-mismatch')throw new Error(diameterContext.reason);
  const bounds=analysisBounds();
  const args={
    obs_depth_path:od.item.virtualPath,obs_depth_col:od.col,
    obs_flow_path:of.item.virtualPath,obs_flow_col:of.col,
    max_gap_seconds:gap,start:bounds.start,end:bounds.end,
    obs_depth_unit:$('ratingObsDepthUnit')?.value||null,
    obs_flow_unit:$('ratingObsFlowUnit')?.value||null,
    model_depth_unit:$('ratingModelDepthUnit')?.value||null,
    model_flow_unit:$('ratingModelFlowUnit')?.value||null,
    obs_exclusions_json:JSON.stringify(ratingExclusions('observed',[od,of])),
    model_exclusions_json:JSON.stringify(ratingExclusions('model',[md,mf])),
    diameter_mm:diameterContext.status==='diameter-informed'?diameterContext.diameter_mm:null,
    diameter_source:diameterContext.source||null,
    monitor:diameterContext.monitor||null,
  };
  if(md&&mf)Object.assign(args,{model_depth_path:md.item.virtualPath,model_depth_col:md.col,model_flow_path:mf.item.virtualPath,model_flow_col:mf.col});
  const r=await engine.call('rating_sources_result',args,'advanced_bridge');
  const o=r.observed||{},m=r.modelled||null;
  const mode=o.rating_mode==='diameter-informed-data-fit'?'Diameter-informed data fit':'Data-fitted / Generic Rating Curve';
  const provenance=diameterContext.status==='diameter-informed'
    ?`D = ${fmt(diameterContext.diameter_mm,1)} mm · ${esc(diameterContext.source?.file||'fm_rg_assoc.xlsx')}${diameterContext.source?.sheet?' · '+esc(diameterContext.source.sheet):''}`
    :esc(diameterContext.reason||'No reliable diameter association available.');
  const observedEquation=o.ok?`Q = ${fmt(o.a,5)} H^${fmt(o.b,4)}`:'Unavailable';
  const normalised=o.ok&&o.rating_mode==='diameter-informed-data-fit'?`Q = ${fmt(o.k_at_h_over_d_1,5)} (H/D)^${fmt(o.b,4)}`:'—';
  $('ratingSummary').innerHTML=`<div class="summary-box"><div><strong>${esc(mode)}</strong><span>Rating method</span></div><div><strong>${observedEquation}</strong><span>Observed empirical fit · m³/s, m</span></div><div><strong>${fmt(o.r2,4)}</strong><span>Observed log-space R²</span></div><div><strong>${o.n??0}</strong><span>Positive valid fit pairs</span></div><div><strong>${normalised}</strong><span>${o.rating_mode==='diameter-informed-data-fit'?'Diameter-normalised form':'H/D not available'}</span></div><div><strong>${o.rating_mode==='diameter-informed-data-fit'?(o.free_surface_pairs+' / '+o.surcharged_pairs):'—'}</strong><span>Below crown / at-or-above crown pairs</span></div><div><strong>${m?.ok?`Q = ${fmt(m.a,5)} H^${fmt(m.b,4)}`:'Unavailable'}</strong><span>Model empirical fit</span></div><div><strong>${m?.ok?fmt(m.r2,4):'—'}</strong><span>Model log-space R²</span></div></div><div class="pool-summary"><strong>Association:</strong> ${provenance}<br><strong>Method:</strong> Positive finite canonical depth/flow pairs at source resolution; bounded interpolation; exclusions and selected analysis period applied before fitting. Diameter provides H/D/crown context only and does not imply a theoretical Manning capacity.</div>`;
  const traces=[],shapes=[],annotations=[];
  for(const [label,fit,color] of [['Observed',o,$('obsColor').value],['Modelled',m,state.modelColours[state.mapping.models[0]]||palette[0]]]){
    if(!fit?.ok)continue;
    const pts=fit.points||[];
    traces.push({x:pts.map(x=>x.depth),y:pts.map(x=>x.flow),mode:'markers',name:label+' valid pairs',marker:{size:5,opacity:.35,color},
      customdata:pts.map(x=>x.timestamp),hovertemplate:'Depth %{x:.4g} m<br>Flow %{y:.4g} m³/s<br>%{customdata}<extra>'+label+'</extra>'});
    const xmin=fit.depth_min,xmax=fit.depth_max,x=Array.from({length:80},(_,i)=>xmin+(xmax-xmin)*i/79);
    traces.push({x,y:x.map(h=>fit.a*h**fit.b),mode:'lines',name:label+' empirical fit',line:{color,width:2}});
  }
  if(o.rating_mode==='diameter-informed-data-fit'&&Number.isFinite(Number(o.diameter_m))){
    shapes.push({type:'line',xref:'x',yref:'paper',x0:o.diameter_m,x1:o.diameter_m,y0:0,y1:1,line:{dash:'dot',width:1.5,color:'#667085'}});
    annotations.push({xref:'x',yref:'paper',x:o.diameter_m,y:1,text:`Pipe crown D = ${fmt(o.diameter_mm,1)} mm`,showarrow:false,yanchor:'bottom',font:{size:10,color:'#475467'}});
  }
  if(requestSignature!==ratingInputSignature())throw new Error('Rating inputs changed while calculation was running. The late result was discarded.');
  state.rating={kind:'flow-depth',result:r,context:diameterContext,signature:requestSignature,config:{observedDepth:workspaceSeries($('ratingObsDepth').value),observedDepthUnit:$('ratingObsDepthUnit')?.value||null,observedFlow:workspaceSeries($('ratingObsFlow').value),observedFlowUnit:$('ratingObsFlowUnit')?.value||null,modelDepth:workspaceSeries($('ratingModelDepth').value),modelDepthUnit:$('ratingModelDepthUnit')?.value||null,modelFlow:workspaceSeries($('ratingModelFlow').value),modelFlowUnit:$('ratingModelFlowUnit')?.value||null}};
  diagnostic.lastRating={mode:o.rating_mode||'data-fitted-generic',monitor:diameterContext.monitor||null,diameter_mm:diameterContext.diameter_mm||null,pairs:o.n||0};
  await Plotly.react('ratingChart',traces,{template:'plotly_white',title:'Flow–depth rating relationship',xaxis:{title:'Depth / hydraulic head (m)'},yaxis:{title:'Flow (m³/s)'},margin:{l:68,r:24,t:52,b:60},legend:{orientation:'h',y:1.15},shapes,annotations},plotConfig('engineering-graph'));
}

async function runDwf(){
  const flowKey=$('dwfFlowSelect').value,flow=mappingObject(flowKey),rain=mappingObject(state.mapping.rain);
  if(!flow)throw new Error('Select observed flow.');
  const signature=dwfInputSignature(),generation=++state.dwfGeneration,bounds=analysisBounds();
  const r=await engine.call('dwf_scaled',{
    flow_path:flow.item.virtualPath,flow_col:flow.col,
    flow_unit_override:$('dwfFlowUnit')?.value||null,
    rain_path:rain?.item.virtualPath||null,rain_col:rain?.col||'rainfall',
    rain_factor:Number($('rainFactor').value||1),
    dry_day_mm:Number($('dwfDryDay').value||1),
    baseline_days:Number($('dwfBaselineDays').value||28),
    min_dry_days:5,adp_hours:Number($('dwfAdpHours').value||6),
    start:bounds.start,end:bounds.end,
    flow_exclusions_json:JSON.stringify(exclusionPayload(true,'observed',flowKey)),
    rainfall_exclusions_json:JSON.stringify(exclusionPayload(true,'rainfall',state.mapping.rain))
  },'advanced_bridge');
  if(generation!==state.dwfGeneration||signature!==dwfInputSignature())throw new Error('DWF inputs changed while calculation was running. The late result was discarded.');
  state.dwfResult=r;state.dwfSignature=signature;
  const dwfValue=r.average_dwf==null?'—':fmt(r.average_dwf,5)+' '+esc(r.flow_unit||'');
  const period=(r.analysis_start||r.analysis_end)?esc((r.analysis_start||'source start')+' → '+(r.analysis_end||'source end')):'Full mapped source support';
  $('dwfSummary').innerHTML=`<div class="summary-box"><div><strong>${esc(r.available)}</strong><span>availability/confidence</span></div><div><strong>${dwfValue}</strong><span>average DWF</span></div><div><strong>${r.dry_days_used??'—'}</strong><span>dry days used</span></div><div><strong>${fmt(r.dry_day_threshold_mm,2)} mm</strong><span>dry-day threshold</span></div><div><strong>${r.baseline_days??'—'}</strong><span>baseline days</span></div><div><strong>${fmt(r.adp_hours,1)} hr</strong><span>ADP window</span></div></div><div class="pool-summary">Analysis support: ${period} · ${r.excluded_flow_rows||0} excluded flow row(s) · ${r.excluded_rainfall_rows||0} excluded rainfall row(s) · ${esc(r.context_method||'canonical DWF method')}.</div>${r.reason?`<div class="pool-summary">${esc(r.reason)}</div>`:''}`;
}

function syncExclusionsFromEditor(){
  const root=$('exclusionRows');
  if(!root)return;
  root.querySelectorAll('.ex-row').forEach(row=>{
    const entry=state.exclusions.find(x=>x.id===row.dataset.id);
    if(!entry)return;
    row.querySelectorAll('[data-field]').forEach(input=>{
      entry[input.dataset.field]=input.type==='checkbox'?input.checked:input.value;
    });
  });
}
function exclusionPayload(strict=true,role=null,key=null){
  syncExclusionsFromEditor();
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

async function runRainEvents(){
  const rain=mappingObject(state.mapping.rain);if(!rain)throw new Error('Map a rainfall series first.');
  const criteria=appliedRainCriteria(),signature=rainEventInputSignature(),generation=++state.rainEventGeneration;
  const r=await engine.call('rainfall_event_scaled',{
    path:rain.item.virtualPath,column:rain.col,
    conversion_factor:Number($('rainFactor').value||1),
    minimum_intensity:criteria.minimum_intensity,
    minimum_intensity_duration_min:criteria.minimum_intensity_duration_min,
    minimum_depth_mm:criteria.minimum_depth_mm,
    minimum_event_duration_min:criteria.minimum_event_duration_min,
    dry_gap_min:criteria.dry_gap_min,
    exclusions_json:JSON.stringify(exclusionPayload(true,'rainfall'))
  },'advanced_bridge');
  if(generation!==state.rainEventGeneration||signature!==rainEventInputSignature())throw new Error('Rainfall-event inputs changed while calculation was running. The late result was discarded.');
  state.rainEventResult=r;state.rainEventSignature=signature;state.rainEvents=r.events||[];
  $('rainEventSummary').innerHTML=`<div class="summary-box"><div><strong>${r.count}</strong><span>qualifying events</span></div><div><strong>${fmt(r.criteria.minimum_intensity,2)}</strong><span>minimum intensity</span></div><div><strong>${fmt(r.criteria.minimum_depth_mm,2)} mm</strong><span>minimum depth</span></div><div><strong>${fmt(r.criteria.dry_gap_min,1)} min</strong><span>dry gap</span></div></div>`;
  $('rainEventBody').innerHTML=state.rainEvents.map(e=>`<tr><td>${e.event}</td><td>${esc(e.start)}</td><td>${esc(e.end)}</td><td>${fmt(e.duration_min,1)}</td><td>${fmt(e.total_depth_mm,3)}</td><td>${fmt(e.peak_intensity,3)}</td><td>${fmt(e.intensity_streak_min,1)}</td></tr>`).join('');
  await drawTimeChart();
  await renderEventResponses(generation,signature);
}
async function renderEventResponses(expectedGeneration=state.rainEventGeneration,expectedSignature=state.rainEventSignature){
  const obs=mappingObject(state.mapping.observed),model=currentModels()[0];
  if(!obs||!model||!state.rainEvents.length){$('eventResponseBody').innerHTML='';return;}
  const responseSignature=JSON.stringify({event_signature:expectedSignature,observed:workspaceSeries(state.mapping.observed),model:workspaceSeries(sourceKey(model.item.id,model.col))});
  const r=await engine.call('event_response_result',{obs_path:obs.item.virtualPath,obs_col:obs.col,model_path:model.item.virtualPath,model_col:model.col,events_json:JSON.stringify(state.rainEvents),baseline_hours:3,post_hours:6});
  const currentModel=currentModels()[0];
  const currentSignature=JSON.stringify({event_signature:state.rainEventSignature,observed:workspaceSeries(state.mapping.observed),model:currentModel?workspaceSeries(sourceKey(currentModel.item.id,currentModel.col)):null});
  if(expectedGeneration!==state.rainEventGeneration||!rainEventsFresh()||responseSignature!==currentSignature)throw new Error('Event-response inputs changed while calculation was running. The late result was discarded.');
  $('eventResponseBody').innerHTML=(r.rows||[]).map(x=>`<tr><td>${x.event}</td><td>${esc(x.rain_start)}</td><td>${fmt(x.rain_depth_mm,2)}</td><td>${fmt(x.observed_baseline,4)}</td><td>${fmt(x.observed_uplift,4)}</td><td>${fmt(x.modelled_uplift,4)}</td><td>${fmt(x.uplift_error_percent,1)}</td><td>${fmt(x.peak_lag_minutes,1)}</td></tr>`).join('');
}
function criteriaModeChanged(){const manual=$('rainCriteriaMode').value==='manual';for(const id of ['rainMinIntensity','rainIntensityDuration','rainEventDuration','rainTotalDepth','rainDryGap'])$(id).disabled=!manual;}
async function runHealth(){
  const signature=healthInputSignature(),generation=++state.healthGeneration,rows=[];
  for(const item of state.files.values()){
    if(item.status!=='ready')continue;
    try{
      const r=await engine.call('data_assessment',{path:item.virtualPath,max_gap_seconds:Number($('gapInput').value||900)});
      if(generation!==state.healthGeneration||signature!==healthInputSignature())throw new Error('Data Health inputs changed while calculation was running. The late result was discarded.');
      for(const x of r.weekly||[])rows.push({...x,file:item.displayName});
    }catch(err){
      if(generation!==state.healthGeneration||signature!==healthInputSignature())throw err;
      rows.push({file:item.displayName,comment:String(err?.message||err),rag:'Red'});
    }
  }
  if(generation!==state.healthGeneration||signature!==healthInputSignature())throw new Error('Data Health inputs changed while calculation was running. The late result was discarded.');
  state.healthResult={rows:JSON.parse(JSON.stringify(rows))};state.healthSignature=signature;
  $('healthBody').innerHTML=rows.map(x=>`<tr><td>${esc(x.file)}</td><td>${x.week_ending?esc(modelClock(x.week_ending).slice(0,10)):'—'}</td><td>${esc(x.channel||'—')}</td><td>${fmt(x.coverage_percent,1)}</td><td>${fmt(x.minimum)}</td><td>${fmt(x.mean)}</td><td>${fmt(x.maximum)}</td><td>${fmt(x.zero_percent,1)}</td><td>${fmt(Number(x.flatline_minutes)/60,1)}</td><td>${x.out_of_range_count??'—'}</td><td>${x.large_gap_count??'—'}</td><td class="${x.rag==='Green'?'audit-good':x.rag==='Red'?'audit-bad':'audit-warn'}">${esc(x.rag||'—')}</td><td>${esc(x.comment||'')}</td></tr>`).join('');
}

async function runSpills(){const obs=mappingObject(state.mapping.observed),model=currentModels()[0],exc=JSON.stringify(exclusionPayload()),gap=Number($('gapInput').value||900);if(!obs&&!model)throw new Error('Apply observed/model mappings first.');state.spills={};if(obs&&$('obsThreshold').value!=='')state.spills.observed=await engine.call('spill_result',{path:obs.item.virtualPath,column:obs.col,threshold:Number($('obsThreshold').value),exclusions_json:exc,max_gap_seconds:gap});if(model&&$('modelThreshold').value!=='')state.spills.model=await engine.call('spill_result',{path:model.item.virtualPath,column:model.col,threshold:Number($('modelThreshold').value),exclusions_json:exc,max_gap_seconds:gap});renderSpills();await drawTimeChart();}
function spillSummaryHtml(r){if(!r)return'<div class="pool-summary">Not calculated.</div>';return `<div class="summary-box"><div><strong>${fmt(r.total_spill_count,0)}</strong><span>12/24 spill count</span></div><div><strong>${fmt(r.total_spill_duration_hours,3)} h</strong><span>physical duration</span></div><div><strong>${r.coverage_fraction==null?'—':fmt(r.coverage_fraction*100,1)+'%'}</strong><span>assessable coverage</span></div><div><strong>${fmt((r.excluded_seconds||0)/3600,2)} h</strong><span>excluded</span></div><div><strong>${fmt((r.unknown_seconds||0)/3600,2)} h</strong><span>unknown gap</span></div><div><strong>${esc(r.count_status||r.status)}</strong><span>count status</span></div></div>`;}
function monthlyTable(r){if(!r)return'';const c=new Map((r.monthly_counts||[]).map(x=>[`${x.year}-${String(x.month).padStart(2,'0')}`,x.spill_count])),d=new Map((r.monthly_durations||[]).map(x=>[`${x.year}-${String(x.month).padStart(2,'0')}`,x.duration_hours])),keys=[...new Set([...c.keys(),...d.keys()])].sort();if(!keys.length)return'<div class="pool-summary">No spill months.</div>';return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Month</th><th>12/24 count</th><th>Duration hr</th></tr></thead><tbody>${keys.map(k=>`<tr><td>${esc(k)}</td><td>${c.get(k)??0}</td><td>${fmt(d.get(k)||0,2)}</td></tr>`).join('')}</tbody></table></div>`;}
function spillComparisonHtml(){const o=state.spills.observed,m=state.spills.model;if(!o||!m)return'<div class="pool-summary">Calculate both observed and modelled spills to compare.</div>';if(o.count_status!=='definitive'||m.count_status!=='definitive')return'<div class="privacy-note"><strong>Comparison withheld:</strong> one or both series contain unexcluded unknown coverage. Resolve the data gap or explicitly exclude the unusable period before interpreting count differences.</div>';const om=new Map((o.monthly_counts||[]).map(x=>[`${x.year}-${x.month}`,x.spill_count])),mm=new Map((m.monthly_counts||[]).map(x=>[`${x.year}-${x.month}`,x.spill_count])),keys=[...new Set([...om.keys(),...mm.keys()])].sort();return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Year-month</th><th>Observed</th><th>Modelled</th><th>Difference (model−obs)</th></tr></thead><tbody>${keys.map(k=>`<tr><td>${k}</td><td>${om.get(k)||0}</td><td>${mm.get(k)||0}</td><td>${(mm.get(k)||0)-(om.get(k)||0)}</td></tr>`).join('')}</tbody></table></div>`;}
function renderSpills(){$('obsSpillSummary').innerHTML=spillSummaryHtml(state.spills.observed);$('modelSpillSummary').innerHTML=spillSummaryHtml(state.spills.model);$('obsMonthly').innerHTML=monthlyTable(state.spills.observed);$('modelMonthly').innerHTML=monthlyTable(state.spills.model);$('spillComparison').innerHTML=spillComparisonHtml();const rows=[];for(const[name,r]of[['Observed',state.spills.observed],['Modelled',state.spills.model]])for(const e of r?.events||[])rows.push(`<tr><td>${name}</td><td>${esc(e.start)}</td><td>${esc(e.end)}</td><td>${fmt(Number(e.duration_seconds)/3600,3)}</td></tr>`);$('eventBody').innerHTML=rows.join('');diagnostic.lastSpills={observed:state.spills.observed?{excluded_seconds:state.spills.observed.excluded_seconds,count:state.spills.observed.total_spill_count}:null,modelled:state.spills.model?{excluded_seconds:state.spills.model.excluded_seconds,count:state.spills.model.total_spill_count}:null};}

async function runStorage(){
  const level=mappingObject($('storageLevelSelect').value),flow=mappingObject($('storageFlowSelect').value);
  if(!level||!flow)throw new Error('Select modelled level and overflow flow series.');
  if($('storageThreshold').value==='')throw new Error('Set the modelled level threshold.');
  const threshold=Number($('storageThreshold').value);
  if(!Number.isFinite(threshold))throw new Error('Storage level threshold must be a finite numeric value.');
  const signature=storageInputSignature();
  const args={
    level_path:level.item.virtualPath,level_col:level.col,flow_path:flow.item.virtualPath,flow_col:flow.col,threshold,
    level_unit_override:$('storageLevelUnit')?.value||null,flow_unit_override:$('storageFlowUnit')?.value||null,
    exclusions_json:JSON.stringify(exclusionPayload(true,'model',$('storageLevelSelect').value)),
    ...analysisBounds(),target_count:Number($('targetCount').value||10),max_gap_seconds:Number($('gapInput').value||900)
  };
  const r=await engine.call('storage_result',args);
  if(signature!==storageInputSignature())throw new Error('Storage inputs changed while calculation was running. The late result was discarded.');
  const mv=await engine.call('monthly_spill_volume_result',{...args,target_count:undefined},'advanced_bridge');
  if(signature!==storageInputSignature())throw new Error('Storage inputs changed while calculation was running. The late result was discarded.');
  state.storage=r;state.storageSignature=signature;
  $('storageSummary').innerHTML=(r.screening||[]).map(x=>`<div class="summary-box"><div><strong>${x.year}</strong><span>year</span></div><div><strong>${x.required_storage_m3==null?'Withheld':fmt(x.required_storage_m3,2)+' m³'}</strong><span>idealised required storage</span></div><div><strong>${x.physical_blocks}</strong><span>counting blocks</span></div><div><strong>${x.max_block_volume_m3==null?'Withheld':fmt(x.max_block_volume_m3,2)+' m³'}</strong><span>maximum block</span></div><div><strong>${x.annual_block_volume_m3==null?'Withheld':fmt(x.annual_block_volume_m3,2)+' m³'}</strong><span>annual block volume</span></div><div><strong>${x.target_count}</strong><span>target count</span></div><div><strong>${esc(x.status||'unknown')}</strong><span>${esc(x.reason||'')}</span></div></div>`).join('')||'<div class="pool-summary">No counted spill blocks.</div>';
  $('storageBody').innerHTML=(r.blocks||[]).map(x=>`<tr><td>${x.year}</td><td>${x.counting_block}</td><td>${esc(x.start)}</td><td>${esc(x.end)}</td><td>${x.volume_m3==null?'Withheld':fmt(x.volume_m3,3)}</td><td>${x.requested_seconds?fmt(100*Number(x.valid_seconds||0)/Number(x.requested_seconds),1)+'%':'—'}</td><td>${esc(x.status||'unknown')}</td><td>${x.physical_discharges}</td></tr>`).join('');
  $('monthlyVolume').innerHTML=monthlyVolumeHtml(mv.rows||[]);
  diagnostic.lastStorage={screeningRows:(r.screening||[]).length,blocks:(r.blocks||[]).length};
}

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
  const routeAliases={
    'verification/comparison':['graphs','comparison'],'verification/rating':['graphs','rating'],'verification/dwf':['graphs','dwf'],'verification/storage':['spills','storage'],
    'spills/thresholds':['spills','assessment'],'spills/results':['spills','assessment'],
    'survey/configuration':['survey','fdv-check'],'survey/data-health':['survey','fdv-check'],'survey/rainfall-response':['survey','rainfall-check'],'survey/flow-continuity':['survey','volume-balance'],
    'rainfall/gauges':['survey','rainfall-check'],'rainfall/events':['survey','rainfall-check'],
    'report/builder':['reports','report-generation'],'report/workspace':['reports','workspace']
  };
  const nav=w.navigation&&typeof w.navigation==='object'?w.navigation:null;
  if(nav?.workspace&&nav?.page){
    const migrated=routeAliases[nav.workspace+'/'+nav.page]||[nav.workspace,nav.page];
    w.navigation={workspace:migrated[0],page:migrated[1]};
  }
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
  return {sha256:x.item.hash,display_name:x.item.displayName,file_name:x.item.file.name,column:x.col,asset_id:domain?.assetId||null,role:domain?.role||null,quantity:domain?.quantity||seriesQuantity(x.item,x.col)||null,unit:domain?.unit||seriesUnit(x.item,x.col)||null,reference:seriesReference(x.item,x.col)||null};
}
function reportOptions(){
  const checked=id=>$(id)?Boolean($(id).checked):true;
  const selectedScenarioKeys=$('reportScenarioSelect')?[...$('reportScenarioSelect').selectedOptions].map(o=>o.value):[];
  const selectedScenarios=selectedScenarioKeys.map(workspaceSeries).filter(Boolean);
  return {
    include_time_series:checked('reportIncludeTimeSeries'),
    include_spills_storage:checked('reportIncludeSpillsStorage'),
    include_comparison:checked('reportIncludeComparison'),
    include_survey:checked('reportIncludeSurvey'),
    scatter_scale:$('reportScatterScale')?.value||'current',
    scenarios:selectedScenarios,
  };
}
function thresholdWorkspaceSeries(role){
  if(role==='observed'){
    const direct=mappingObject(state.mapping.observed);
    if(direct&&['depth','level'].includes(String(seriesQuantity(direct.item,direct.col)||'').toLowerCase()))return workspaceSeries(state.mapping.observed);
    if(direct&&String(direct.item?.parsed?.format||'')==='fdv_ascii'){
      const hydraulic=hydraulicSeriesForItem(direct.item).find(x=>['depth','level'].includes(String(x.quantity||'').toLowerCase()));
      if(hydraulic)return workspaceSeries(hydraulic.key);
    }
    return null;
  }
  const key=$('spillModelSelect')?.value||state.mapping.models.find(k=>{
    const m=mappingObject(k);return m&&['depth','level'].includes(String(seriesQuantity(m.item,m.col)||'').toLowerCase());
  })||'';
  const model=mappingObject(key);
  return model&&['depth','level'].includes(String(seriesQuantity(model.item,model.col)||'').toLowerCase())?workspaceSeries(key):null;
}
function workspaceObject(strictExclusions=true){return {schema_version:3,application:'ICM Graphing Tool GitHub Pages',time_basis:'model clock/unspecified',saved_at:new Date().toISOString(),navigation:window.__ICM_PRECISION_WORKBENCH__?.route?.()||null,source_references:[...state.files.values()].filter(x=>x.status==='ready').map(x=>({name:x.file.name,display_name:x.displayName,size:x.file.size,last_modified:x.file.lastModified,sha256:x.hash,format:x.parsed.format,columns:x.parsed.columns})),series_quantity_overrides:[...state.seriesQuantityOverrides.entries()].map(([key,quantity])=>({series:workspaceSeries(key),quantity})).filter(x=>x.series&&x.quantity),mapping:{observed:workspaceSeries(state.mapping.observed),models:state.mapping.models.map(workspaceSeries).filter(Boolean),rain:workspaceSeries(state.mapping.rain)},analysis:{max_gap_seconds:Number($('gapInput').value||900),observed_threshold:nullableNumber($('obsThreshold').value),model_threshold:nullableNumber($('modelThreshold').value),observed_threshold_series:thresholdWorkspaceSeries('observed'),model_threshold_series:thresholdWorkspaceSeries('model'),time_offset_minutes:Number($('offsetInput').value||0),analysis_start:modelClock($('analysisStart').value)||null,analysis_end:modelClock($('analysisEnd').value)||null,storage_threshold:nullableNumber($('storageThreshold').value),target_count:Number($('targetCount').value||10),storage_level:workspaceSeries($('storageLevelSelect').value),storage_flow:workspaceSeries($('storageFlowSelect').value),storage_level_unit:$('storageLevelUnit')?.value||null,storage_flow_unit:$('storageFlowUnit')?.value||null,dwf_flow:workspaceSeries($('dwfFlowSelect')?.value),dwf_flow_unit:$('dwfFlowUnit')?.value||null,dwf_dry_day_mm:Number($('dwfDryDay')?.value||1),dwf_baseline_days:Number($('dwfBaselineDays')?.value||28),dwf_adp_hours:Number($('dwfAdpHours')?.value||6),rating_obs_depth_unit:$('ratingObsDepthUnit')?.value||null,rating_obs_flow_unit:$('ratingObsFlowUnit')?.value||null,rating_model_depth_unit:$('ratingModelDepthUnit')?.value||null,rating_model_flow_unit:$('ratingModelFlowUnit')?.value||null,rain_factor:Number($('rainFactor').value||1)},appearance:{observed_color:$('obsColor').value,observed_quantity_colours:{flow:$('observedFlowColour')?.value||'#ff0000',depth:$('observedDepthColour')?.value||$('obsColor').value,velocity:$('observedVelocityColour')?.value||'#ff0000'},rain_color:$('rainColor').value,model_colours:state.modelColours,threshold1_label:$('threshold1Label').value,threshold1_color:$('threshold1Color').value,threshold2_label:$('threshold2Label').value,threshold2_color:$('threshold2Color').value},rain_events:{criteria_mode:$('rainCriteriaMode').value,events:rainEventsFresh()?state.rainEvents:[],manual:Object.fromEntries(['rainMinIntensity','rainIntensityDuration','rainEventDuration','rainTotalDepth','rainDryGap'].map(id=>[id,$(id).value]))},exclusions:exclusionPayload(strictExclusions),exclusion_history:state.exclusionHistory||[],review_notes:$('reviewNotes')?.value||'',project_registry:window.ICMProjectRegistry?.snapshot()||null,report_options:reportOptions(),active_spill_model:workspaceSeries($('spillModelSelect')?.value),model_styles:state.mapping.models.map(key=>({series:workspaceSeries(key),color:state.modelColours[key]}))};}
function downloadBlob(name,content,type='application/octet-stream'){const blob=new Blob([content],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
function downloadWorkspace(){downloadBlob(`icm-workbench-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(workspaceObject(),null,2),'application/json');$('workspaceStatus').textContent='Workspace downloaded. Raw files were not embedded.';}
function findSeriesFromWorkspace(ref){
  if(!ref)return'';
  const files=[...state.files.values()];
  const sameHash=ref.sha256?files.filter(x=>x.hash===ref.sha256):[];
  // A SHA identifies content, not necessarily scenario identity: two separately
  // named model scenarios can legitimately contain identical bytes. Prefer the
  // persisted display/file name within the matching hash set; only fall back to
  // SHA alone when it identifies exactly one loaded source.
  let item=sameHash.find(x=>
    (ref.display_name&&x.displayName===ref.display_name)||
    (ref.file_name&&x.file?.name===ref.file_name)
  );
  if(!item&&sameHash.length===1)item=sameHash[0];
  if(!item&&!ref.sha256){
    const byName=files.filter(x=>
      (ref.display_name&&x.displayName===ref.display_name)||
      (ref.file_name&&x.file?.name===ref.file_name)
    );
    if(byName.length===1)item=byName[0];
  }
  return item&&item.parsed?.columns.includes(ref.column)?sourceKey(item.id,ref.column):'';
}
async function applyWorkspace(w){
  w=migrateBrowserWorkspace(w);
  ++state.rainEventGeneration;state.rainEvents=[];state.rainEventResult=null;state.rainEventSignature=null;
  ++state.dwfGeneration;state.dwfResult=null;state.dwfSignature=null;
  ++state.healthGeneration;state.healthResult=null;state.healthSignature=null;
  state.rating=null;
  diagnostic.lastRating=null;
  Plotly.purge('ratingChart');
  if($('ratingSummary'))$('ratingSummary').innerHTML='<div class="pool-summary">Workspace restored. Recalculate the fitted relationship for the restored inputs.</div>';
  renderSeriesOptions();
  state.seriesQuantityOverrides.clear();
  for(const entry of w.series_quantity_overrides||[]){
    const key=findSeriesFromWorkspace(entry?.series);
    if(key&&entry?.quantity)await applySeriesQuantityOverride(key,entry.quantity,{refresh:false});
  }
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
  if($('dwfFlowSelect'))$('dwfFlowSelect').value=findSeriesFromWorkspace(a.dwf_flow);
  if($('dwfFlowUnit'))$('dwfFlowUnit').value=a.dwf_flow_unit||'';
  if($('dwfDryDay'))$('dwfDryDay').value=a.dwf_dry_day_mm??1;
  if($('dwfBaselineDays'))$('dwfBaselineDays').value=a.dwf_baseline_days??28;
  if($('dwfAdpHours'))$('dwfAdpHours').value=a.dwf_adp_hours??6;
  if($('ratingObsDepthUnit'))$('ratingObsDepthUnit').value=a.rating_obs_depth_unit||'';
  if($('ratingObsFlowUnit'))$('ratingObsFlowUnit').value=a.rating_obs_flow_unit||'';
  if($('ratingModelDepthUnit'))$('ratingModelDepthUnit').value=a.rating_model_depth_unit||'';
  if($('ratingModelFlowUnit'))$('ratingModelFlowUnit').value=a.rating_model_flow_unit||'';
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
  const ro=w.report_options||{};
  if($('reportIncludeTimeSeries')&&ro.include_time_series!==undefined)$('reportIncludeTimeSeries').checked=Boolean(ro.include_time_series);
  if($('reportIncludeSpillsStorage')&&ro.include_spills_storage!==undefined)$('reportIncludeSpillsStorage').checked=Boolean(ro.include_spills_storage);
  if($('reportIncludeComparison')&&ro.include_comparison!==undefined)$('reportIncludeComparison').checked=Boolean(ro.include_comparison);
  if($('reportIncludeSurvey')&&ro.include_survey!==undefined)$('reportIncludeSurvey').checked=Boolean(ro.include_survey);
  if($('reportScatterScale')&&ro.scatter_scale)$('reportScatterScale').value=ro.scatter_scale;
  if($('reportScenarioSelect')&&Array.isArray(ro.scenarios)){
    const restoredScenarioKeys=ro.scenarios.map(findSeriesFromWorkspace).filter(Boolean);
    [...$('reportScenarioSelect').options].forEach(o=>o.selected=restoredScenarioKeys.includes(o.value));
  }
  state.rainEvents=[];
  state.rainEventResult=null;state.rainEventSignature=null;
  if(w.rain_events?.events?.length&&$('rainEventSummary'))$('rainEventSummary').innerHTML='<div class="pool-summary">Workspace contained derived rainfall events. They were not reactivated automatically; re-run Rainfall Check against the reattached authoritative sources.</div>';
  const expected=(w.source_references||[]).length;
  const matched=(w.source_references||[]).filter(r=>[...state.files.values()].some(x=>x.hash===r.sha256)).length;
  $('workspaceStatus').textContent=`Restoring workspace… ${matched}/${expected} source fingerprint(s) matched; rebuilding mappings and graph.`;
  await applyMapping();
  // Rebuild report scenario choices only after the restored model mapping is
  // authoritative, then re-apply the persisted scenario subset by fingerprint.
  $('modelSelect')?.dispatchEvent(new Event('change',{bubbles:true}));
  if($('reportScenarioSelect')&&Array.isArray(ro.scenarios)){
    const restoredScenarioKeys=ro.scenarios.map(findSeriesFromWorkspace).filter(Boolean);
    [...$('reportScenarioSelect').options].forEach(o=>o.selected=restoredScenarioKeys.includes(o.value));
  }
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
  if(w.navigation?.workspace&&w.navigation?.page&&window.__ICM_PRECISION_WORKBENCH__?.navigate){
    window.__ICM_PRECISION_WORKBENCH__.navigate(w.navigation.workspace,w.navigation.page,false);
  }
  diagnostic.workspaceRestore={expected,matched,navigation:w.navigation||null,completedAt:new Date().toISOString()};
  return {expected,matched,navigation:w.navigation||null};
}
async function loadWorkspaceFile(file){await applyWorkspace(JSON.parse(await file.text()));}
function saveNamedWorkspace(){const name=$('workspaceName').value.trim();if(!name)throw new Error('Enter a workspace name.');const all=readNamedWorkspaces();all[name]=workspaceObject();localStorage.setItem('icm-workbench-named',JSON.stringify(all));renderNamedWorkspaces();$('workspaceStatus').textContent=`Saved named browser workspace: ${name}.`;}
function renderNamedWorkspaces(){const all=readNamedWorkspaces(),s=$('namedWorkspaceSelect'),prev=s.value;s.innerHTML='<option value="">Select saved workspace…</option>'+Object.keys(all).sort().map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join('');if(all[prev])s.value=prev;}
async function loadNamedWorkspace(){const name=$('namedWorkspaceSelect').value,all=readNamedWorkspaces();if(!name||!all[name])throw new Error('Select a saved browser workspace.');await applyWorkspace(all[name]);}

function analysisSignature(){
  // Signatures must tolerate a partially edited exclusion row so existing
  // results can become stale immediately without throwing during normal form editing.
  // Calculation/save/export paths continue to call workspaceObject() strictly.
  const w=workspaceObject(false),registry=w.project_registry||{};
  const projectContext={
    relationships:registry.relationships||[],
    issues:registry.issues||[],
    associationSource:registry.associationSource||null,
  };
  return JSON.stringify({mapping:w.mapping,analysis:w.analysis,exclusions:w.exclusions,active_spill_model:w.active_spill_model,rain_events:w.rain_events.manual,time_basis:w.time_basis,project_context:projectContext});
}
function assertFreshResults(options=null){
  const sig=analysisSignature();
  const includeSpills=options?options.include_spills_storage!==false:true;
  const includeComparison=options?options.include_comparison!==false:true;
  const includeSurvey=options?options.include_survey!==false:true;
  if(includeSpills&&state.spillSnapshot&&state.spillSnapshot.signature!==sig)throw new Error('Spill results are stale. Recalculate after changing analytical inputs before exporting.');
  if(includeComparison&&state.comparisonSnapshot&&state.comparisonSnapshot.signature!==sig)throw new Error('Comparison results are stale. Recalculate after changing analytical inputs before exporting.');
  if(includeSpills&&state.storage&&state.storageSignature&&state.storageSignature!==storageInputSignature())throw new Error('Storage results are stale. Recalculate after changing storage mappings, units, threshold, target, exclusions or analysis inputs before exporting.');
  if(includeComparison&&state.rating?.signature&&state.rating.signature!==ratingInputSignature())throw new Error('Rating results are stale. Recalculate the fitted relationship after changing mappings, exclusions or analysis inputs before exporting.');
  if(includeSurvey&&diagnostic.lastProfessionalSurvey&&diagnostic.professionalSurveyFresh&&!diagnostic.professionalSurveyFresh())throw new Error('Professional flow-survey results are stale. Re-run before exporting.');
  if(includeSurvey&&diagnostic.survey?.batch&&diagnostic.surveyFresh&&!diagnostic.surveyFresh('complete'))throw new Error('Complete flow-survey results are stale. Re-run before exporting.');
  if(includeSurvey&&diagnostic.survey?.balance&&diagnostic.surveyFresh&&!diagnostic.surveyFresh('balance'))throw new Error('Volume-balance results are stale. Recalculate before exporting.');
}

function reportCss(landscape=false){
  return ':root{--ink:#182433;--muted:#667788;--line:#d9e1e8;--soft:#f5f8fa;--accent:#315b9b}*{box-sizing:border-box}html{background:#eef2f5}body{margin:0;color:var(--ink);font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.45;background:#fff}.report{max-width:1180px;margin:0 auto;padding:30px 34px 42px}.report-header{border-bottom:3px solid var(--accent);padding-bottom:16px;margin-bottom:22px;display:flex;justify-content:space-between;gap:24px;align-items:flex-end}.report-header h1{font-size:26px;line-height:1.15;margin:0 0 6px;letter-spacing:-.02em}.report-header p{margin:0;color:var(--muted)}.report-meta{text-align:right;color:var(--muted);font-size:12px;white-space:nowrap}h2{font-size:18px;margin:26px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}h3{font-size:14px;margin:18px 0 8px}.note{background:var(--soft);border-left:4px solid var(--accent);padding:10px 12px;margin:12px 0 18px}.report-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.card{min-width:0;border:1px solid var(--line);border-radius:8px;padding:12px 14px;background:#fff;break-inside:avoid}.card h3{margin:0 0 8px}.table-wrap{width:100%;max-width:100%;overflow-x:auto;border:1px solid var(--line);border-radius:7px;margin:8px 0 14px}table{border-collapse:collapse;width:100%;min-width:620px}th,td{padding:7px 9px;border-bottom:1px solid #e8edf1;text-align:left;vertical-align:top;font-size:11.5px}th{background:var(--soft);color:#435466;text-transform:uppercase;letter-spacing:.025em;font-size:10.5px}tr:last-child td{border-bottom:0}.figure{margin:12px 0 20px;break-inside:avoid}.report-plot{width:100%;min-width:0}.report-figure-metrics{margin-top:10px;padding-top:8px;border-top:1px solid var(--line)}.report-figure-metrics-title{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}.report-figure-metrics .graph-statistics-note{margin:0 0 7px}.report-figure-metrics .table-wrap{margin:0}.report-figure-metrics .graph-stats-compact{font-size:10.5px}.graph-stats-compact small{display:block;max-width:240px;overflow-wrap:anywhere}.graph-statistics-note{font-size:12px}.figure img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:6px;background:#fff}.figure figcaption{font-size:11.5px;color:var(--muted);margin-top:6px}.summary-box{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0}.summary-box>div{border:1px solid var(--line);border-radius:7px;padding:9px;background:var(--soft)}.summary-box strong{display:block;font-size:16px}.summary-box span{font-size:10.5px;color:var(--muted)}.swatch{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:6px;vertical-align:-1px;border:1px solid rgba(0,0,0,.14)}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f9fb;border:1px solid var(--line);border-radius:6px;padding:10px;font:11px/1.45 Consolas,monospace}.hash{font-family:Consolas,monospace;font-size:10.5px;overflow-wrap:anywhere}.muted{color:var(--muted)}.report-page{break-after:page;page-break-after:always}.report-page:last-child{break-after:auto;page-break-after:auto}.report-footer{border-top:1px solid var(--line);margin-top:30px;padding-top:10px;color:var(--muted);font-size:11px;display:flex;justify-content:space-between;gap:12px}@media(max-width:760px){.report{padding:20px 16px}.report-header{display:block}.report-meta{text-align:left;margin-top:10px}.report-grid,.summary-box{grid-template-columns:1fr}table{min-width:560px}}@media print{html{background:#fff}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.report{max-width:none;padding:0}.card,.figure,.table-wrap{break-inside:avoid}.period-figure{break-inside:auto}.period-figure .report-plot{break-inside:avoid}.period-figure .report-figure-metrics{break-before:page;page-break-before:always;break-inside:avoid}.period-figure figcaption{break-inside:avoid}}@page{size:'+(landscape?'A4 landscape':'A4 portrait')+';margin:12mm}';
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
  const statisticFor=q=>statistics.find(r=>r.statistics?.quantity===q);
  const unitFor=q=>statisticFor(q)?.statistics?.unit;
  const referenceFor=q=>statisticFor(q)?.reference||statisticFor(q)?.statistics?.vertical_reference||null;
  const axisTitle=q=>{
    const label=q.charAt(0).toUpperCase()+q.slice(1),unit=unitFor(q)||'unit unresolved',reference=q==='level'?referenceFor(q):null;
    return `${label} (${unit})${reference?' · '+reference:''}`;
  };
  const panels=[];
  if(hasRain)panels.push({axis:'yaxis2',title:axisTitle('rainfall'),rain:true});
  if(fdvMode){
    if(quantities.includes('flow'))panels.push({axis:'yaxis3',title:axisTitle('flow')});
    if(quantities.includes('depth')||quantities.includes('level'))panels.push({axis:'yaxis',title:axisTitle(quantities.includes('depth')?'depth':'level')});
    if(quantities.includes('velocity'))panels.push({axis:'yaxis4',title:axisTitle('velocity')});
  }else if(statistics.some(r=>r.role!=='Rainfall')){
    const row=statistics.find(r=>r.role!=='Rainfall'),s=row?.statistics||{},quantity=String(s.quantity||'').toLowerCase();
    panels.push({axis:'yaxis',title:quantity?axisTitle(quantity):`Hydraulic value (${s.unit||'unit unresolved'})`});
  }
  if(!panels.length)panels.push({axis:'yaxis',title:'Value'});
  const gap=panels.length>2?.055:.09;
  const weight=panels.reduce((sum,p)=>sum+(p.rain&&panels.length>1?(panels.length===2?.30:.65):1),0);
  const available=1-gap*(panels.length-1);
  const legendRows=Math.max(1,Math.ceil((statistics.length+2)/4));
  const layout={template:'plotly_white',height:Math.max(610,panels.length*185+130),
    margin:{l:fdvMode?112:86,r:34,t:(title?80:44)+legendRows*24,b:62},hovermode:'x unified',
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
function reportPlotFigure(id,traces,layout,statistics,caption='',options={}){
  const payload=JSON.stringify({data:traces,layout:{...layout,autosize:true,width:undefined}}).replace(/</g,'\\u003c');
  const stats=statistics?.length
    ?'<div class="report-figure-metrics"><div class="report-figure-metrics-title">Graph metrics</div>'+graphStatisticsHtml(statistics)+'</div>'
    :'';
  const captionHtml='<figcaption>'+esc(caption)+'</figcaption>';
  const period=options.period===true;
  return '<figure class="figure'+(period?' period-figure':'')+'"><div class="report-plot" id="'+id+'" style="height:'+layout.height+'px"></div><script type="application/json" id="'+id+'-data">'+payload+'</script>'+(period?captionHtml+stats:stats+captionHtml)+'</figure>';
}
function selectedReportComparisons(){
  const control=$('reportScenarioSelect');
  if(!control)return state.comparisons.filter(entry=>entry.result);
  const selected=new Set([...control.selectedOptions].map(o=>o.value));
  return state.comparisons.filter(entry=>entry.result&&selected.has(sourceKey(entry.model.item.id,entry.model.col)));
}
function reportComparisonScatterFigure(entries,log=false){
  if(!entries?.length)return '<p class="muted">No selected comparison scenario has a current authoritative result.</p>';
  const traces=[],values=[];
  entries.forEach((entry,i)=>{
    const population=scatterPopulation(entry.result,log),pairs=population.pairs,metrics=population.metrics||{};
    const key=sourceKey(entry.model.item.id,entry.model.col),colour=state.modelColours[key]||palette[i%palette.length];
    const scenario=entry.model.item.displayName+' · '+entry.model.col;
    values.push(...pairs.flatMap(x=>[Number(x.obs),Number(x.sim)]));
    traces.push({x:pairs.map(x=>x.obs),y:pairs.map(x=>x.sim),mode:'markers',name:scenario,marker:{size:6,opacity:.5,color:colour},
      customdata:pairs.map(x=>[x.timestamp,x.obs,x.sim]),
      hovertemplate:'<b>'+esc(scenario)+'</b><br>%{customdata[0]}<br>Observed: %{customdata[1]:.5g}<br>Modelled: %{customdata[2]:.5g}<extra></extra>'});
    const fit=regressionLinePoints(metrics,pairs,log);
    if(fit)traces.push({x:fit.x,y:fit.y,mode:'lines',name:scenario+' fit',line:{color:colour,width:2,dash:'dash'},hoverinfo:'skip'});
  });
  const finite=values.filter(v=>Number.isFinite(v)&&(!log||v>0));
  if(finite.length){
    const lo=Math.min(...finite),hi=Math.max(...finite);
    if(hi>lo)traces.push({x:[lo,hi],y:[lo,hi],mode:'lines',name:'1:1 agreement',line:{color:'#64748b',width:1.5,dash:'dot'},hoverinfo:'skip'});
  }
  const first=entries[0].result,quantity=comparisonQuantity(first),unit=comparisonUnit(first);
  const axisLabel=(role)=>role+' '+quantity+(unit?' ('+unit+')':'');
  const layout={template:'plotly_white',height:520,margin:{l:78,r:28,t:72,b:68},
    title:{text:'Observed vs modelled '+(log?'log₁₀':'linear')+' scatter',x:.01,xanchor:'left'},
    legend:{orientation:'h',x:0,y:1.04,xanchor:'left',yanchor:'bottom'},showlegend:true,
    xaxis:{title:{text:axisLabel('Observed')},type:log?'log':'linear',automargin:true},
    yaxis:{title:{text:axisLabel('Modelled')},type:log?'log':'linear',automargin:true,scaleanchor:'x',scaleratio:1},
  };
  const caption=log?'Observed versus modelled log₁₀ scatter; only strictly positive authoritative pairs are shown.':'Observed versus modelled linear scatter using authoritative paired values.';
  return reportPlotFigure('assessment-scatter-report',traces,layout,[],caption);
}
function reportStorageHtml(){
  const r=state.storage;
  if(!r)return '<p class="muted">Storage Assessment not calculated.</p>';
  const screening=(r.screening||[]).map(x=>'<tr><td>'+esc(x.year)+'</td><td>'+(x.required_storage_m3==null?'Withheld':fmt(x.required_storage_m3,2))+'</td><td>'+esc(x.physical_blocks)+'</td><td>'+(x.max_block_volume_m3==null?'Withheld':fmt(x.max_block_volume_m3,2))+'</td><td>'+esc(x.status||'unknown')+'</td><td>'+esc(x.reason||'')+'</td></tr>').join('');
  return '<div class="note">Idealised storage screening is diagnostic evidence, not hydraulic design sizing. Volumes use actual valid support and declared units.</div>'+
    (screening?'<div class="table-wrap"><table><thead><tr><th>Year</th><th>Required storage m³</th><th>Counting blocks</th><th>Maximum block m³</th><th>Status</th><th>Reason</th></tr></thead><tbody>'+screening+'</tbody></table></div>':'<p class="muted">No storage-screening rows were produced.</p>');
}
async function staticReportFallbackHtml(html,reason='Interactive Plotly runtime could not be embedded.'){
  if(!window.Plotly)throw new Error('Plotly is unavailable for report rendering.');
  const doc=new DOMParser().parseFromString(html,'text/html');
  const plots=[...doc.querySelectorAll('.report-plot')];
  for(const placeholder of plots){
    const payloadNode=doc.getElementById(placeholder.id+'-data');
    if(!payloadNode)continue;
    const payload=JSON.parse(payloadNode.textContent||'{}');
    const height=Math.max(320,Number(payload.layout?.height||520));
    const width=980;
    const host=document.createElement('div');
    Object.assign(host.style,{position:'fixed',left:'-12000px',top:'0',width:width+'px',height:height+'px',background:'#fff'});
    document.body.appendChild(host);
    try{
      await Plotly.newPlot(host,payload.data||[],{...(payload.layout||{}),width,height,autosize:false},{staticPlot:true,displaylogo:false,responsive:false});
      const uri=await Plotly.toImage(host,{format:'svg',width,height});
      const img=doc.createElement('img');
      img.setAttribute('src',uri);
      img.setAttribute('alt',(payload.layout?.title?.text||placeholder.id||'Engineering graph').replace(/<[^>]+>/g,''));
      img.setAttribute('class','report-static-plot');
      placeholder.replaceWith(img);
      payloadNode.remove();
    }finally{
      try{Plotly.purge(host);}catch{}
      host.remove();
    }
  }
  const note=doc.createElement('div');
  note.className='note';
  note.innerHTML='<strong>Static graph export.</strong> '+esc(reason)+' Graphs are embedded as self-contained SVG snapshots; calculations and report values are unchanged.';
  const report=doc.querySelector('.report');
  if(report)report.insertBefore(note,report.children[1]||null);
  diagnostic.reportRuntimeFallback={used:true,reason:String(reason),plot_count:plots.length,time:new Date().toISOString()};
  return '<!doctype html>'+doc.documentElement.outerHTML;
}
async function interactiveReportHtml(html){
  const boot=`document.querySelectorAll('.report-plot').forEach(el=>{const p=JSON.parse(document.getElementById(el.id+'-data').textContent);Plotly.newPlot(el,p.data,p.layout,{responsive:true,displaylogo:false,displayModeBar:false,scrollZoom:false}).catch(e=>{el.textContent='Graph could not be rendered: '+e.message;});});`;
  if(!reportPlotlyBundle){
    const source=[...document.scripts].find(s=>/plotly-[\d.]+(?:\.min)?\.js/.test(s.src))?.src;
    if(!source)return staticReportFallbackHtml(html,'The external Plotly script source was not available for embedding.');
    try{
      const response=await fetch(source);
      if(!response.ok)throw new Error('Plotly bundle request returned HTTP '+response.status+'.');
      const bundle=await response.text();
      if(bundle.length<10000||!bundle.includes('Plotly'))throw new Error('The retrieved Plotly runtime was invalid.');
      reportPlotlyBundle=bundle;
    }catch(err){
      return staticReportFallbackHtml(html,conciseErrorMessage(err));
    }
  }
  const embedded='<script>'+reportPlotlyBundle.replace(/<\/script/gi,'<\\/script')+'</script><script>'+boot+'</script></body>';
  return html.replace('</body>',()=>embedded);
}


function reportSettingsTable(w){
  const a=w.analysis||{};
  const thresholdValue=(value,ref)=>{
    if(value==null)return '—';
    const unit=ref?.unit?String(ref.unit):'';
    const quantity=ref?.quantity?String(ref.quantity):'';
    const reference=ref?.reference?String(ref.reference):'reference / datum not supplied';
    return String(value)+(unit?' '+unit:'')+(quantity?' · '+quantity:'')+' · '+reference;
  };
  const observedRef=a.observed_threshold_series||w.mapping?.observed||null;
  const modelRef=a.model_threshold_series||w.active_spill_model||w.mapping?.models?.[0]||null;
  const rows=[['Time basis',w.time_basis||'model clock/unspecified'],['Analysis start',a.analysis_start||'Full available period'],['Analysis end',a.analysis_end||'Full available period'],['Maximum interpolation gap',(a.max_gap_seconds==null?'—':fmt(a.max_gap_seconds,0)+' s')],['Observed / EDM hydraulic threshold',thresholdValue(a.observed_threshold,observedRef)],['Model hydraulic threshold',thresholdValue(a.model_threshold,modelRef)],['Model time offset',fmt(a.time_offset_minutes||0,1)+' min'],['Rainfall conversion factor',fmt(a.rain_factor==null?1:a.rain_factor,4)]];
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
function chartHasReportData(id){
  const chart=$(id);
  return (chart?.data||[]).some(trace=>{
    if(trace?.type==='table')return false;
    const x=Array.isArray(trace?.x)?trace.x:[],y=Array.isArray(trace?.y)?trace.y:[];
    const count=Math.min(x.length,y.length);
    for(let i=0;i<count;i++){
      if(x[i]!=null&&y[i]!=null&&Number.isFinite(Number(y[i])))return true;
    }
    return false;
  });
}
async function reportChart(id,width,height){
  if(!chartHasReportData(id))return'';
  try{return await Plotly.toImage($(id),{format:'svg',width:width,height:height});}catch{return'';}
}
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
    const associationContext=[
      asset.metadata?.diameterMm!=null?'D = '+fmt(asset.metadata.diameterMm,1)+' mm':null,
      asset.metadata?.rainGauge?'RG '+asset.metadata.rainGauge:null,
    ].filter(Boolean).join(' · ');
    return '<tr><td><strong>'+esc(asset.id)+'</strong><br><span class="muted">'+esc(asset.kind||'asset')+'</span></td><td>'+esc(roles.join(', ')||'—')+'</td><td>'+esc(sources.map(x=>x.name).join(', ')||'association only')+'</td><td>'+esc(quantities.join(', ')||'—')+'</td><td>'+esc(associationContext||'—')+'</td><td>'+esc(relationships.join(', ')||'—')+'</td></tr>';
  }).join('');
  const associationSource=registry.associationSource?' Association metadata source: '+esc(registry.associationSource)+'.':'';
  return '<div class="note"><strong>Canonical project context.</strong> Files are classified once into assets, engineering series and workbook relationships; the same registry is reused across workflows.'+associationSource+'</div><div class="table-wrap"><table><thead><tr><th>Asset</th><th>Role</th><th>Source</th><th>Quantities</th><th>Association context</th><th>Relationships</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function reportAnalysisPeriod(){
  const explicit=analysisBounds(),refs=[
    ...observedGraphSeries().map(x=>mappingObject(x.key)),
    ...state.mapping.models.map(mappingObject),
    mappingObject(state.mapping.rain),
  ].filter(Boolean);
  // Source timestamps use the workbench model-clock/unspecified contract. Keep
  // them timezone-neutral: routing them through Date/toISOString shifts the
  // analytical window by the browser timezone and can produce an empty report.
  const starts=refs.map(x=>modelClock(x.item?.parsed?.start)).filter(Boolean).sort();
  const ends=refs.map(x=>modelClock(x.item?.parsed?.end)).filter(Boolean).sort();
  const start=explicit.start||(starts.length?starts[0]:null);
  const end=explicit.end||(ends.length?ends[ends.length-1]:null);
  return [start,end];
}
async function downloadReport(){
  const options=reportOptions();
  assertFreshResults(options);
  if(!state.mapping.observed&&!(state.mapping.models||[]).length&&!state.mapping.rain)throw new Error('Apply at least one observed, modelled or rainfall mapping before exporting the report.');
  await drawTimeChart();
  const reportSignature=analysisSignature(),period=reportAnalysisPeriod();
  let timeFigure='';
  if(options.include_time_series){
    const reportSeries=await reportTraces(period);
    const currentLayout=$('timeChart').layout||{};
    const shapes=JSON.parse(JSON.stringify(currentLayout.shapes||[]));
    const annotations=JSON.parse(JSON.stringify(currentLayout.annotations||[]));
    const fullLayout=hydraulicGraphLayout({...reportSeries,range:period[0]&&period[1]?period:null,title:'Full analysis period',shapes,annotations});
    const thresholdLegendTraces=JSON.parse(JSON.stringify(($('timeChart')?.data||[]).filter(t=>/threshold/i.test(String(t.name||''))&&(t.x||[]).every(x=>x==null))));
    timeFigure=reportPlotFigure('assessment-time-graph',[...reportSeries.traces,...thresholdLegendTraces],fullLayout,reportSeries.statistics,'Declared report analysis period; zoom state is not used as an analytical input.');
  }

  const w=workspaceObject();
  const selectedComparisons=selectedReportComparisons();
  const log=options.scatter_scale==='current'?$('scatterScale').value==='log':options.scatter_scale==='log';
  const scenarioRows=selectedComparisons.map((x,i)=>{
    const population=scatterPopulation(x.result,log),q=population.metrics||{},unit=comparisonUnit(x.result);
    const uv=v=>v==null||!Number.isFinite(Number(v))?'—':fmt(Number(v),4)+(unit?' '+esc(unit):'');
    return '<tr><td>Model '+(i+1)+' · '+esc(x.model.item.displayName)+' · '+esc(x.model.col)+'</td><td>'+(q.pairs??population.pairs.length)+'</td><td>'+fmt(q.correlation)+'</td><td>'+fmt(q.regression_r2)+'</td><td>'+fmt(q.regression_slope)+'</td><td>'+uv(q.regression_intercept)+'</td><td>'+uv(q.rmse)+'</td><td>'+uv(q.mae)+'</td><td>'+uv(q.mean_bias)+'</td><td>'+fmt(q.nse)+'</td><td>'+fmt(q.kge_2009)+'</td><td>'+(log?population.removed_count:'—')+'</td><td>'+esc(x.result.calculation_status||'—')+'</td><td>'+(x.result.coverage_fraction==null?'—':fmt(x.result.coverage_fraction*100,1)+'%')+'</td></tr>';
  }).join('');
  const populationLabel=log?'Positive observed/modelled pairs only (log₁₀ view; nonpositive values are filtered from this view, not altered).':'All finite authoritative paired values (linear view).';
  const scenarioTable=scenarioRows?'<p class="muted">'+esc(populationLabel)+' Metrics are sample-weighted; bias is modelled minus observed. Regression is raw-scale M = intercept + slope × O.</p><div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Pairs</th><th>Pearson r</th><th>Regression R²</th><th>Slope</th><th>Intercept</th><th>RMSE</th><th>MAE</th><th>Bias (M−O)</th><th>NSE</th><th>KGE</th><th>Log filtered</th><th>Status</th><th>Valid support</th></tr></thead><tbody>'+scenarioRows+'</tbody></table></div>':'<p class="muted">No selected scenario comparison has a current result.</p>';

  let body='<div class="note"><strong>Method note.</strong> Source files were processed locally in the browser. Results retain the current workspace time basis, exclusions, support/coverage status and source fingerprints. Report section/scenario choices are explicit and stored in the workspace.</div>';
  body+='<h2>Assessment configuration</h2><div class="report-grid"><div class="card"><h3>Mapped series</h3>'+reportMappingTable(w)+'</div><div class="card"><h3>Analysis settings</h3>'+reportSettingsTable(w)+'</div></div>';

  if(options.include_time_series)body+='<h2>Full time-period graph</h2>'+timeFigure;

  if(options.include_spills_storage){
    body+='<h2>Spill / EDM assessment</h2><div class="report-grid"><div class="card"><h3>Observed / EDM</h3>'+spillSummaryHtml(state.spills.observed)+reportYearlySpills(state.spills.observed)+'</div><div class="card"><h3>Modelled</h3>'+spillSummaryHtml(state.spills.model)+reportYearlySpills(state.spills.model)+'</div></div>';
    body+='<h3>Observed spills by month</h3>'+reportSpillCountMatrix(state.spills.observed);
    body+='<h3>Model spills by month</h3>'+reportSpillCountMatrix(state.spills.model);
    body+='<h3>Observed vs modelled monthly spill comparison</h3>'+reportMonthlySpillComparison(state.spills.observed,state.spills.modelled||state.spills.model);
    body+='<h2>Storage Assessment</h2>'+reportStorageHtml();
  }

  if(options.include_comparison){
    body+='<h2>Scenario comparison</h2>'+scenarioTable;
    body+=reportComparisonScatterFigure(selectedComparisons,log);
    const allCurrent=state.comparisons.filter(x=>x.result);
    const allSelected=selectedComparisons.length===allCurrent.length;
    const images=allSelected?await Promise.all([reportChart('residualChart',680,440),reportChart('cumulativeChart',680,440),reportChart('exceedanceChart',680,440),reportChart('ratingChart',760,500)]):['','','',await reportChart('ratingChart',760,500)];
    const [residImg,cumulativeImg,exceedanceImg,ratingImg]=images,diag=[];
    if(residImg)diag.push('<figure class="figure"><img src="'+residImg+'" alt="Residual plot"><figcaption>Model minus observed residual through time using all valid pairs.</figcaption></figure>');
    if(cumulativeImg)diag.push('<figure class="figure"><img src="'+cumulativeImg+'" alt="Cumulative flow volume plot"><figcaption>Cumulative-volume diagnostic where dimensional flow support is available.</figcaption></figure>');
    if(exceedanceImg)diag.push('<figure class="figure"><img src="'+exceedanceImg+'" alt="Flow duration plot"><figcaption>Time-weighted exceedance diagnostic where available.</figcaption></figure>');
    if(ratingImg&&state.rating){
      const rc=state.rating.context||{},rr=state.rating.result?.observed||state.rating.result?.metrics||{};
      const ratingCaption=state.rating.kind==='flow-depth'
        ?((rr.rating_mode==='diameter-informed-data-fit'?'Diameter-informed empirical Q–H rating curve':'Generic data-fitted Q–H rating curve')+(rc.diameter_mm?' · D = '+fmt(rc.diameter_mm,1)+' mm':'')+(rc.source?.file?' · '+rc.source.file:''))
        :'Observed versus modelled depth / level fitted relationship using authoritative Python regression coefficients.';
      diag.push('<figure class="figure"><img src="'+ratingImg+'" alt="Rating or fitted relationship plot"><figcaption>'+esc(ratingCaption)+'</figcaption></figure>');
    }
    if(!allSelected)body+='<p class="muted">Residual/cumulative/exceedance screenshots are omitted because the report contains a selected scenario subset; this avoids mixing a different on-screen scenario population into the exported snapshot.</p>';
    if(diag.length)body+='<div class="report-grid">'+diag.join('')+'</div>';
  }

  if(options.include_survey&&window.__ICM_WORKBENCH__.professionalSurveyReportHtml)body+=window.__ICM_WORKBENCH__.professionalSurveyReportHtml;
  body+='<h2>Exclusions</h2>'+reportExclusions(w);
  const notes=$('reviewNotes')&&$('reviewNotes').value||'';
  body+='<h2>Reviewer notes</h2><div class="card">'+(notes?'<p>'+esc(notes).replaceAll('\n','<br>')+'</p>':'<p class="muted">No reviewer notes recorded.</p>')+'</div>';
  body+='<h2>Project data context</h2>'+reportProjectRegistry();
  body+='<h2>Source provenance</h2>'+reportSources(w);
  body+='<h2>Audit appendix</h2><details><summary>Calculation snapshot and workspace state</summary><pre>'+esc(JSON.stringify({report_options:options,spills:state.spillSnapshot,storage:state.storage,comparison:state.comparisonSnapshot,professional_flow_survey:window.__ICM_WORKBENCH__.lastProfessionalSurvey||null,rating_diagnostic:state.rating||null,project_registry:window.ICMProjectRegistry?.snapshot()||null,execution:diagnostic.execution||'unknown'},null,2))+'</pre></details>';
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
      label:seriesLabel(source.item,source.col),statistics:d.statistics,factor,reference:seriesReference(source.item,source.col)||null});
    if(rain){hasRain=true;rainMax=values.reduce((m,v)=>v==null?m:Math.max(m,v*1.12),1);}
  }
  return {traces,statistics,quantities,fdvMode,hasRain,rainMax};
}
async function downloadFourPeriod(){
  assertFreshResults({include_spills_storage:false,include_comparison:false,include_survey:false});
  if(!state.mapping.observed&&!(state.mapping.models||[]).length&&!state.mapping.rain)throw new Error('Apply at least one observed, modelled or rainfall mapping before exporting.');
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
    layout.height=Math.min(Number(layout.height||580),580);
    body+='<section class="report-page"><h2>'+esc(title)+'</h2><p class="muted">'+esc(a)+' to '+esc(b)+' · end exclusive</p>'+reportPlotFigure('period-graph-'+i,result.traces,layout,result.statistics,'Aligned hydraulic panels with a separate rainfall band above.',{period:true})+'</section>';
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
  $('chooseFolderBtn').addEventListener('click',()=>void importGuard(chooseFolder));$('addFilesBtn').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>void importGuard(()=>ingestFiles(e.target.files)));$('folderInput').addEventListener('change',e=>void importGuard(()=>ingestFiles(e.target.files)));eventGuard('clearPoolBtn','poolSummary',async()=>{const hadSources=state.files.size>0;invalidatePendingSourceImports();state.files.clear();window.ICMProjectRegistry?.clearSources();state.mapping={observed:'',models:[],rain:''};state.comparisons=[];state.spills={};state.spillSnapshot=null;state.comparisonSnapshot=null;state.rainEvents=[];state.rainEventResult=null;state.rainEventSignature=null;++state.rainEventGeneration;state.dwfResult=null;state.dwfSignature=null;++state.dwfGeneration;state.healthResult=null;state.healthSignature=null;++state.healthGeneration;state.storage=null;state.storageSignature=null;state.rating=null;state.exclusions=[];state.exclusionHistory=[];state.modelColours={};state.seriesQuantityOverrides.clear();for(const id of ['obsThreshold','modelThreshold','graphObsThreshold','graphModelThreshold'])if($(id))$(id).value='';diagnostic.fastpathActiveSourceId=null;window.ICMFastPath?.clear?.();await engine.clear();renderPool();renderSeriesOptions();renderExclusions();for(const id of ['timeChart','scatterChart','residualChart','cumulativeChart','exceedanceChart','ratingChart'])Plotly.purge(id);$('mappingStatus').textContent='Source pool cleared. Mappings, exclusions and derived analytical state were invalidated.';if(hadSources)notifySourcePoolChanged('clear');});
  const dz=$('dropzone');for(const ev of ['dragenter','dragover'])dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag');});for(const ev of ['dragleave','drop'])dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag');});dz.addEventListener('drop',e=>{const snapshot=snapshotDrop(e.dataTransfer);void importGuard(async()=>{const files=await droppedFiles(snapshot);$('poolSummary').textContent=files.length+' dropped file'+(files.length===1?'':'s')+' detected · preparing import…';await ingestFiles(files);});});
  eventGuard('applyMappingBtn','mappingStatus',applyMapping);$('applyMappingBtn').addEventListener('click',()=>{state.rating=null;});$('observedSelect').addEventListener('change',()=>{renderSeriesSemanticsOverrides();autoSuggestAdvanced(allSeries());});$('modelSelect').addEventListener('change',()=>{renderModelColourControls();renderSeriesSemanticsOverrides();autoSuggestAdvanced(allSeries());});$('rainSelect').addEventListener('change',renderSeriesSemanticsOverrides);eventGuard('refreshGraphBtn','mappingStatus',drawTimeChart);for(const id of ['obsColor','rainColor','rainFactor','rainAxisMax','threshold1Label','threshold1Color','threshold2Label','threshold2Color','showEventOverlay','rainEventColor'])$(id).addEventListener('change',()=>guarded('mappingStatus',drawTimeChart));
  eventGuard('runCompareBtn','metricGrid',runCompare);$('scatterScale').addEventListener('change',()=>{if(state.comparisons.length)void guarded('metricGrid',renderComparisons);});$('useZoomPeriodBtn').addEventListener('click',useGraphZoom);$('clearPeriodBtn').addEventListener('click',()=>{$('analysisStart').value='';$('analysisEnd').value='';});eventGuard('runRatingBtn','ratingSummary',runRating);for(const id of ['ratingObsDepth','ratingObsDepthUnit','ratingObsFlow','ratingObsFlowUnit','ratingModelDepth','ratingModelDepthUnit','ratingModelFlow','ratingModelFlowUnit'])$(id)?.addEventListener('change',()=>{state.rating=null;});eventGuard('runDwfBtn','dwfSummary',runDwf);
  $('rainCriteriaMode').addEventListener('change',criteriaModeChanged);eventGuard('runRainEventsBtn','rainEventSummary',runRainEvents);eventGuard('runHealthBtn','healthBody',runHealth);
  document.addEventListener('change',event=>{
    const id=event.target?.id||'';
    if(['rainCriteriaMode','rainMinIntensity','rainIntensityDuration','rainEventDuration','rainTotalDepth','rainDryGap','rainFactor','rainSelect'].includes(id)||event.target?.closest?.('#exclusionRows'))invalidateRainEvents('Rainfall source, conversion, criteria or exclusion context changed.');
    if(['dwfFlowSelect','dwfFlowUnit','rainSelect','rainFactor','dwfDryDay','dwfBaselineDays','dwfAdpHours','analysisStart','analysisEnd'].includes(id)||event.target?.closest?.('#exclusionRows'))invalidateDwf('DWF source, unit, analysis period, exclusion or qualification criteria changed.');
    if(id==='gapInput')invalidateHealth('Maximum gap criterion changed.');
  },true);
  window.addEventListener('icm:source-pool-changed',()=>{invalidateRainEvents('Source pool changed.');invalidateDwf('Source pool changed.');invalidateHealth('Source pool changed.');});
  $('addExclusionBtn').addEventListener('click',()=>addExclusionRow());eventGuard('runSpillsBtn','obsSpillSummary',runSpills);eventGuard('runStorageBtn','storageSummary',runStorage);
  $('downloadWorkspaceBtn').addEventListener('click',()=>guarded('workspaceStatus',downloadWorkspace));$('loadWorkspaceBtn').addEventListener('click',()=>$('workspaceInput').click());$('workspaceInput').addEventListener('change',e=>e.target.files[0]&&guarded('workspaceStatus',()=>loadWorkspaceFile(e.target.files[0])));eventGuard('saveNamedWorkspaceBtn','workspaceStatus',saveNamedWorkspace);eventGuard('loadNamedWorkspaceBtn','workspaceStatus',loadNamedWorkspace);eventGuard('downloadReportBtn','workspaceStatus',downloadReport);eventGuard('downloadFourPeriodBtn','workspaceStatus',downloadFourPeriod);$('downloadManifestBtn')?.addEventListener('click',()=>guarded('workspaceStatus',downloadManifest));document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn)));
}
async function start(){window.ICMProjectRegistry?.mount();wireEvents();renderPool();renderSeriesOptions();renderExclusions();renderNamedWorkspaces();criteriaModeChanged();setEngineStatus('Initialising advanced analysis…','booting');void ensureEngineBoot().catch(()=>{});}
start();
