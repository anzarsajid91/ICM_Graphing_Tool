import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const elements={engineStatus:{innerHTML:''},poolSummary:{textContent:''},timeBasisConfirmed:{checked:true},levelDatumConfirmed:{checked:true}};
const events=[];
class FakeWorker{
  static instances=[];
  static failBoot=false;
  constructor(){this.listeners={};this.messages=[];FakeWorker.instances.push(this);}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  emit(type,data){for(const fn of this.listeners[type]||[])fn({data,...data});}
  postMessage(message){
    this.messages.push(message);
    setTimeout(()=>{
      const ok=!(message.type==='boot'&&FakeWorker.failBoot);
      const result=message.type==='boot'?{ready:true,buildToken:'test',manifestCount:42}:
        message.name==='parse_detriment_report'?{columns:['Node ID','Flood volume'],metadata:{source_kind:'detriment_report'}}:
        message.name==='parse_source'?{columns:['Value'],metadata:{}}:
        message.name==='set_series_quantity'?{quantity:message.args.quantity,user_unit:message.args.unit,canonical_unit:message.args.quantity==='flow'?'m³/s':'m',unit_status:'confirmed'}:true;
      this.emit('message',{type:'result',id:message.id,ok,result,error:ok?undefined:'Network failure'});
    },0);
  }
  terminate(){this.terminated=true;}
}
const sandbox={window:{dispatchEvent:event=>events.push(event)},document:{getElementById:id=>elements[id]||null,querySelector:()=>({content:'test'}),body:{classList:{remove(){}}}},console,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),performance,Worker:FakeWorker,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},localStorage:{getItem:()=>null},crypto:globalThis.crypto};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('web/assets/runtime.release.js','utf8').replace(/start\(\);\s*$/,''),sandbox);
vm.runInContext(`
  operationUpdate=()=>{};renderPool=()=>{};renderSeriesOptions=()=>{};
  for(const [id,status,reportKind] of [['hydraulic','ready',null],['preview','preview-only',null],['report','error','flooding']]){
    state.files.set(id,{id,status,reportKind,advancedUnavailable:status==='error',virtualPath:'/data/'+id,file:{arrayBuffer:async()=>new ArrayBuffer(4)},parsed:{columns:['Value']}});
  }
  state.mapping.observed=sourceKey('hydraulic','Value');
  state.seriesQuantityOverrides.set(sourceKey('hydraulic','Value'),'flow');
  state.seriesUnitOverrides.set(sourceKey('hydraulic','Value'),'L/s');
  state.seriesUnitOverrides.set(sourceKey('preview','Value'),'mm');
`,sandbox);
await vm.runInContext('engine.boot()',sandbox);
const oldWorker=FakeWorker.instances.at(-1);
oldWorker.emit('error',{message:'Worker crashed'});
assert.match(elements.engineStatus.innerHTML,/Retry Python/);
await vm.runInContext('Promise.all([recoverAuthoritativeEngine(),recoverAuthoritativeEngine()])',sandbox);
assert.equal(FakeWorker.instances.length,2,'Concurrent retries share one recovery');
const restored=FakeWorker.instances.at(-1);
assert.equal(restored.messages.filter(x=>x.type==='addFile').length,3);
assert.equal(restored.messages.filter(x=>x.name==='parse_detriment_report').length,1);
assert.equal(restored.messages.filter(x=>x.name==='parse_source').length,2);
const overrides=restored.messages.filter(x=>x.name==='set_series_quantity').map(x=>x.args);
assert.deepEqual(overrides.map(x=>[x.path,x.quantity,x.unit]),[['/data/hydraulic','flow','L/s'],['/data/preview',null,'mm']]);
assert.equal(vm.runInContext('[...state.files.values()].every(x=>x.status===\'ready\')',sandbox),true);
assert.equal(vm.runInContext('state.mapping.observed',sandbox),'["hydraulic","Value"]');
assert.equal(vm.runInContext("seriesUnit(state.files.get('hydraulic'),'Value')",sandbox),'m³/s','Canonical metadata restored alongside overrides');
assert.equal(elements.timeBasisConfirmed.checked,true);
assert.equal(elements.levelDatumConfirmed.checked,true);
oldWorker.emit('error',{message:'Late error from terminated worker'});
assert.equal(vm.runInContext('engine.ready',sandbox),true);
FakeWorker.failBoot=true;
await vm.runInContext('recoverAuthoritativeEngine()',sandbox);
assert.match(elements.engineStatus.innerHTML,/Retry Python/);
assert.equal(vm.runInContext('engineBootPromise',sandbox),null);
FakeWorker.failBoot=false;
await vm.runInContext('recoverAuthoritativeEngine()',sandbox);
assert.equal(vm.runInContext('engine.ready',sandbox),true);
assert.doesNotMatch(elements.engineStatus.innerHTML,/Retry Python/);
console.log('Engine recovery passed: crashed/failed boot, retained sources, report imports, unit/quantity restoration, concurrent retries, old-worker events and repeat recovery.');
