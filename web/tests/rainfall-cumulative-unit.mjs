import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const nodes=new Map(['cumulativeRainChart','cumulativeRainSummary','cumulativeRainTotals','multiGaugeRainSummary','multiGaugeRainTable','rainFactor'].map(id=>[id,{value:'1',innerHTML:'',textContent:''}]));
const listeners=new Map(),calls=[];
let scheduled;
const sandbox={console,
  setTimeout(callback){scheduled=callback;return 1;},
  clearTimeout(){scheduled=undefined;},
  setInterval:()=>1,
  window:{addEventListener(name,callback){
    if(!listeners.has(name))listeners.set(name,[]);
    listeners.get(name).push(callback);
  }},
  document:{querySelector:()=>null,getElementById:id=>nodes.get(id)||null,addEventListener(){}},
  Plotly:{purge(){},async react(...args){sandbox.plot=args;}}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('web/assets/runtime.release.js','utf8').replace(/start\(\);\s*$/,''),sandbox);
vm.runInContext(`operationBegin=()=>{}; operationPaint=async()=>{}; operationEnd=()=>{};
engine.ready=true; engine.call=async(name,args)=>{ globalThis.calls.push({name,args});return name==='multi_gauge_rainfall_result'?{gauge_count:2,non_uniform_day_count:0,criteria:{variability_cv_limit_percent:40,strikes_required:2,rolling_window_days:7},gauges:[]}:{timestamp:[],value:[],raw_count:12,missing_count:0,negative_count:0,complete:true,final_total_mm:12,rainfall_semantics:args.rainfall_semantics};};
state.files.set('r',{id:'r',status:'ready',virtualPath:'/r.R',displayName:'r.R',parsed:{format:'rainfall_r_ascii',columns:['rainfall'],metadata:{interval_min:5,rainfall_semantics:'incremental_depth'}}});`,Object.assign(sandbox,{calls}));
// Exercise the real initialisation and event handlers without slicing the
// workbench bundle or depending on unrelated boot calls.
vm.runInContext(fs.readFileSync('web/assets/workbench-v3.js','utf8'),sandbox,{filename:'workbench-v3.js'});
async function refresh(event){
  const handlers=listeners.get(event);
  assert.ok(handlers?.length,'Expected a listener for '+event);
  for(const handle of handlers)handle();
  assert.equal(typeof scheduled,'function','Expected rainfall refresh to be scheduled');
  const callback=scheduled;
  scheduled=undefined;
  callback();
  // The stubbed engine and chart resolve on the microtask queue.
  await new Promise(setImmediate);
  assert.ok(sandbox.window.__ICM_WORKBENCH__.lastCumulativeRainfall,'Rainfall refresh completed');
}
await refresh('icm:source-pool-changed');
assert.equal(calls[0].args.rainfall_semantics,'incremental_depth','UI must pass resolved semantics');
assert.equal(sandbox.plot[3].scrollZoom,false,'Wheel scrolling must not zoom rainfall');
assert.match(nodes.get('cumulativeRainSummary').textContent,/incremental|per.source/i);
vm.runInContext(`state.files.set('i',{id:'i',status:'ready',virtualPath:'/i.R',displayName:'i.R',parsed:{format:'rainfall_r_ascii',columns:['rainfall'],metadata:{rainfall_semantics:'intensity'}}});`,sandbox);
await refresh('icm:source-pool-changed');
const quality=calls.findLast(x=>x.name==='multi_gauge_rainfall_result');
assert.deepEqual(JSON.parse(quality.args.sources_json).map(x=>x.rainfall_semantics),['incremental_depth','intensity']);
const routinePlot=sandbox.Plotly.react;
let releaseEngine;
sandbox.Plotly.react=async(...args)=>{
  await routinePlot(...args);
  vm.runInContext('engine.ready=false; engineBootPromise=globalThis.pendingRainfallWorker;',sandbox);
};
sandbox.pendingRainfallWorker=new Promise(resolve=>{releaseEngine=resolve;});
vm.runInContext(`const realRainCall=engine.call;
engine.call=async(...args)=>{if(!engine.ready)throw new Error('Reference Python worker is not ready.');return realRainCall(...args);};`,sandbox);
const qualityCallsBeforeRestart=calls.filter(x=>x.name==='multi_gauge_rainfall_result').length;
for(const callback of listeners.get('icm:source-pool-changed'))callback();
scheduled();await new Promise(setImmediate);
assert.equal(calls.filter(x=>x.name==='multi_gauge_rainfall_result').length,qualityCallsBeforeRestart);
assert.equal(sandbox.window.__ICM_WORKBENCH__.errors.length,0,'Worker restart must wait instead of publishing a rainfall error');
sandbox.Plotly.react=routinePlot;
vm.runInContext('engine.ready=true;',sandbox);releaseEngine();await new Promise(setImmediate);
assert.equal(calls.filter(x=>x.name==='multi_gauge_rainfall_result').length,qualityCallsBeforeRestart+1);
assert.ok(sandbox.window.__ICM_WORKBENCH__.lastCumulativeRainfall);
vm.runInContext(`state.rainfallSemanticsOverrides.set(sourceKey('r','rainfall'),'intensity')`,sandbox);
await refresh('icm:rainfall-interpretation-changed');
assert.equal(calls.filter(x=>x.name==='cumulative_rainfall_series').at(-2).args.rainfall_semantics,'intensity');
console.log('PASS cumulative rainfall UI: source semantics, mixed gauges, interpretation override and shared wheel config.');
