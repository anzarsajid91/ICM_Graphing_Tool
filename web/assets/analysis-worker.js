/* Dedicated Pyodide analysis worker.
 *
 * All Python parsing and engineering calculations run here so the DOM/main
 * thread stays responsive. The worker loads only the authoritative
 * icm_workbench package; web/python_bridge.py is now a compatibility shim.
 */
const PYODIDE_INDEX='https://cdn.jsdelivr.net/pyodide/v0.29.4/full/';
const WORKER_URL=new URL(self.location.href);
const BUILD_TOKEN=WORKER_URL.searchParams.get('v')||'local';
const SITE_ROOT=new URL('../',WORKER_URL);
function releaseUrl(relative){
  const url=new URL(relative,SITE_ROOT);
  url.searchParams.set('v',BUILD_TOKEN);
  return url;
}
const MODULES={
  python_bridge:'icm_workbench.browser_api',
  advanced_bridge:'icm_workbench.advanced_api',
};
let pyodide=null;
let ready=false;
let queue=Promise.resolve();

function progress(stage,percent=null,detail=''){
  self.postMessage({type:'progress',stage,percent,detail});
}
function reply(id,result){self.postMessage({type:'result',id,ok:true,result});}
function fail(id,error){
  self.postMessage({
    type:'result',id,ok:false,
    error:String(error?.message||error),
    stack:String(error?.stack||''),
  });
}

async function fetchText(url,label){
  const r=await fetch(url,{cache:'no-cache'});
  if(!r.ok)throw new Error(`${label} unavailable (${r.status}).`);
  return r.text();
}

async function boot(){
  if(ready)return {ready:true};
  progress('Starting Python worker',5,'Loading the isolated Pyodide runtime.');
  importScripts(PYODIDE_INDEX+'pyodide.js');
  if(typeof loadPyodide!=='function')throw new Error('Pinned Pyodide worker loader was not available.');
  pyodide=await loadPyodide({indexURL:PYODIDE_INDEX});
  progress('Starting Python worker',20,'Loading NumPy and pandas.');
  await pyodide.loadPackage(['numpy','pandas']);

  const manifestUrl=releaseUrl('python/package-manifest.json');
  const manifestResponse=await fetch(manifestUrl,{cache:'no-cache'});
  if(!manifestResponse.ok)throw new Error(`Python package manifest unavailable (${manifestResponse.status}).`);
  const files=await manifestResponse.json();
  if(!Array.isArray(files)||!files.length)throw new Error('Python package manifest is empty or invalid.');

  pyodide.FS.mkdirTree('/workbench');
  pyodide.FS.mkdirTree('/data');
  for(let i=0;i<files.length;i+=1){
    const rel=String(files[i]);
    if(!rel.startsWith('icm_workbench/')||!rel.endsWith('.py'))throw new Error(`Unsafe manifest entry: ${rel}`);
    const parent=`/workbench/${rel}`.split('/').slice(0,-1).join('/');
    pyodide.FS.mkdirTree(parent);
    const code=await fetchText(releaseUrl(`python/${rel}`),`Reference engine module ${rel}`);
    pyodide.FS.writeFile(`/workbench/${rel}`,code,{encoding:'utf8'});
    if(i===0||i===files.length-1||i%8===0){
      progress('Starting Python worker',20+Math.round(55*(i+1)/files.length),`Loading engineering modules ${i+1}/${files.length}.`);
    }
  }
  await pyodide.runPythonAsync(
    "import sys\n"+
    "sys.path.insert(0, '/workbench')\n"+
    "from icm_workbench import browser_api, advanced_api\n"
  );
  ready=true;
  progress('Python worker ready',100,`${files.length} engineering modules loaded off the UI thread.`);
  return {ready:true,manifestCount:files.length,execution:'web-worker',buildToken:BUILD_TOKEN};
}

async function addFile(path,bytes){
  if(!ready)throw new Error('Python worker is not ready.');
  if(!path||!String(path).startsWith('/data/'))throw new Error('Unsafe worker data path.');
  const payload=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  pyodide.FS.writeFile(String(path),payload);
  return true;
}

async function callPython(name,args={},module='python_bridge'){
  if(!ready)throw new Error('Python worker is not ready.');
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name)))throw new Error('Unsafe Python operation name.');
  const target=MODULES[module];
  if(!target)throw new Error('Unsupported browser bridge.');
  progress('Running analysis',null,String(name));
  pyodide.globals.set('_bridge_args',JSON.stringify(args||{}));
  pyodide.globals.set('_bridge_module',target);
  pyodide.globals.set('_bridge_name',String(name));
  const out=await pyodide.runPythonAsync(
    "import json, importlib\n"+
    "_m=importlib.import_module(_bridge_module)\n"+
    "_a=json.loads(_bridge_args)\n"+
    "getattr(_m, _bridge_name)(**_a)"
  );
  progress('Analysis complete',100,String(name));
  return typeof out==='string'?JSON.parse(out):out;
}

async function clear(){
  return callPython('clear_cache',{},'python_bridge');
}

async function handle(message){
  const {id,type}=message||{};
  if(type==='boot')return reply(id,await boot());
  if(type==='addFile')return reply(id,await addFile(message.path,message.bytes));
  if(type==='call')return reply(id,await callPython(message.name,message.args,message.module));
  if(type==='clear')return reply(id,await clear());
  if(type==='ping')return reply(id,{ready});
  throw new Error(`Unsupported worker message: ${type}`);
}

self.addEventListener('message',event=>{
  const message=event.data||{};
  queue=queue.then(()=>handle(message)).catch(error=>fail(message.id,error));
});
