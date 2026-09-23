import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('web/assets/runtime.release.js','utf8').replace(/start\(\);\s*$/, '');
const store=new Map();
const localStorage={
  getItem:k=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k),
};

class FakeWorker {
  constructor(){
    this.listeners={message:[],error:[]};
    this.ready=false;
    this.failNext=false;
  }
  addEventListener(type,fn){(this.listeners[type]||(this.listeners[type]=[])).push(fn);}
  _emit(type,data){for(const fn of this.listeners[type]||[])fn({data,...data});}
  postMessage(message){
    setTimeout(()=>{
      if(this.failNext){
        this.failNext=false;
        this._emit('message',{type:'result',id:message.id,ok:false,error:'expected'});
        return;
      }
      if(message.type==='boot'){
        this.ready=true;
        this._emit('message',{type:'result',id:message.id,ok:true,result:{ready:true,manifestCount:42,execution:'web-worker',buildToken:'test-build'}});
        return;
      }
      if(message.type==='call'){
        this._emit('message',{type:'result',id:message.id,ok:true,result:message.args});
        return;
      }
      if(message.type==='clear'||message.type==='addFile'){
        this._emit('message',{type:'result',id:message.id,ok:true,result:true});
      }
    },message?.args?.start==='10:00'?2:1);
  }
  terminate(){this.terminated=true;}
}

const sandbox={
  window:{},
  console,
  document:{getElementById:()=>null,querySelector:selector=>selector==='meta[name="icm-build-sha"]'?{content:'test-build'}:null},
  setTimeout,clearTimeout,
  requestAnimationFrame:fn=>setTimeout(fn,0),
  crypto:globalThis.crypto,
  localStorage,store,
  Worker:FakeWorker,
};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);

await vm.runInContext(`(async()=>{
  const boot=await engine.boot();
  window.bootInfo=boot;
  const results=await Promise.all([
    engine.call('series_data',{start:'00:00',end:'02:00'}),
    engine.call('series_data',{start:'10:00',end:'12:00'})
  ]);
  window.queueResults=results;
  engine.worker.failNext=true;
  try{await engine.call('series_data',{start:'failed'});}catch(err){window.expectedFailure=String(err.message||err);}
  window.recovered=await engine.call('series_data',{start:'recovered'});
  const stalledFastPath=new BrowserFastPathEngine(10);
  try{await stalledFastPath.parse({file:{name:'stalled.csv'}},new ArrayBuffer(8));}
  catch(err){window.fastPathTimeout=String(err.message||err);}
  try{await stalledFastPath.parse({file:{name:'stalled-again.csv'}},new ArrayBuffer(8));}
  catch(err){window.fastPathDisabled=String(err.message||err);}
  state.exclusions=[
    {id:'observed',start:'2026-01-01T00:00',end:'2026-01-01T01:00',reason:'EDM',scope:'observed'},
    {id:'model',start:'2026-01-01T00:00',end:'2026-01-01T01:00',reason:'model',scope:'model'},
    {id:'disabled',start:'2026-01-01T00:00',end:'2026-01-01T01:00',reason:'disabled',scope:'both',enabled:false}
  ];
  window.observedMasks=exclusionPayload(true,'observed');
  window.modelMasks=exclusionPayload(true,'model');
  window.audit=exclusionPayload();
  window.migratedWorkspace=migrateBrowserWorkspace({schema_version:1,mappings:{},source_references:{},navigation:{workspace:'verification',page:'storage'}});
  localStorage.setItem('icm-workbench-named','{bad json');
  window.recoveredNamedStore=readNamedWorkspaces();
  window.quarantinedKeys=[...store.keys()].filter(k=>k.startsWith('icm-workbench-named-corrupt-'));
})()`,sandbox);

assert.equal(sandbox.window.bootInfo.execution,'web-worker');
assert.equal(sandbox.window.queueResults[0].start,'00:00');
assert.equal(sandbox.window.queueResults[1].start,'10:00');
assert.match(sandbox.window.expectedFailure,/expected/);
assert.equal(sandbox.window.recovered.start,'recovered');
assert.match(sandbox.window.fastPathTimeout,/timed out/i);
assert.match(sandbox.window.fastPathDisabled,/timed out/i);
assert.equal(sandbox.window.observedMasks.length,1);
assert.equal(sandbox.window.observedMasks[0].id,'observed');
assert.equal(sandbox.window.modelMasks[0].id,'model');
assert.equal(sandbox.window.audit.length,3);
assert.equal(sandbox.window.migratedWorkspace.schema_version,3);
assert.equal(sandbox.window.migratedWorkspace.navigation.workspace,'spills');
assert.equal(sandbox.window.migratedWorkspace.navigation.page,'storage');
assert.deepEqual(Object.keys(sandbox.window.recoveredNamedStore),[]);
assert.equal(sandbox.window.quarantinedKeys.length,1);
console.log('Runtime regressions passed: worker RPC isolation/recovery, bounded FastPath failure fallback, scoped masks, workspace migration and corrupt local-state recovery.');
