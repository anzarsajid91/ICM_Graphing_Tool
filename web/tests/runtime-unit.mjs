import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('web/assets/runtime.release.js','utf8').replace(/start\(\);\s*$/, '');
const store=new Map();const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const sandbox={window:{},console,document:{getElementById:()=>null},setTimeout,clearTimeout,crypto:globalThis.crypto,localStorage,store};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
await vm.runInContext(`(async()=>{
  engine.ready=true;
  let args;
  engine.pyodide={globals:{set:(_,value)=>{args=value}},runPythonAsync:async()=>{await new Promise(r=>setTimeout(r,10));return args;}};
  const results=await Promise.all([engine.call('series_data',{start:'00:00',end:'02:00'}),engine.call('series_data',{start:'10:00',end:'12:00'})]);
  window.queueResults=results;
  let fail=true;
  engine.pyodide.runPythonAsync=async()=>{if(fail){fail=false;throw new Error('expected');}return args;};
  try{await engine.call('series_data',{start:'failed'});}catch{}
  window.recovered=await engine.call('series_data',{start:'recovered'});
  state.exclusions=[{id:'observed',start:'2026-01-01T00:00',end:'2026-01-01T01:00',reason:'EDM',scope:'observed'},
    {id:'model',start:'2026-01-01T00:00',end:'2026-01-01T01:00',reason:'model',scope:'model'},
    {id:'disabled',start:'2026-01-01T00:00',end:'2026-01-01T01:00',reason:'disabled',scope:'both',enabled:false}];
  window.observedMasks=exclusionPayload(true,'observed');
  window.modelMasks=exclusionPayload(true,'model');
  window.audit=exclusionPayload();
  window.migratedWorkspace=migrateBrowserWorkspace({schema_version:1,mappings:{},source_references:{}});
  localStorage.setItem('icm-workbench-named','{bad json');
  window.recoveredNamedStore=readNamedWorkspaces();
  window.quarantinedKeys=[...store.keys()].filter(k=>k.startsWith('icm-workbench-named-corrupt-'));
})()`,sandbox);
assert.equal(sandbox.window.queueResults[0].start,'00:00');
assert.equal(sandbox.window.queueResults[1].start,'10:00');
assert.equal(sandbox.window.recovered.start,'recovered');
assert.equal(sandbox.window.observedMasks.length,1);
assert.equal(sandbox.window.observedMasks[0].id,'observed');
assert.equal(sandbox.window.modelMasks[0].id,'model');
assert.equal(sandbox.window.audit.length,3);
assert.equal(sandbox.window.migratedWorkspace.schema_version,3);
assert.deepEqual(Object.keys(sandbox.window.recoveredNamedStore),[]);
assert.equal(sandbox.window.quarantinedKeys.length,1);
console.log('Runtime regressions passed: request isolation, queue recovery, scoped masks, workspace migration and corrupt local-state recovery.');
