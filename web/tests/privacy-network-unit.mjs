import assert from 'node:assert/strict';
import {requestViolation,installPrivacyGuard} from './privacy-network.mjs';
import {EventEmitter} from 'node:events';
const options={baseUrl:'https://example.test/tool/',paths:new Set(['','assets/runtime.js','python/kernel.py']),buildToken:'reviewed-sha',navigations:new Set()};
const resource={url:'https://example.test/tool/assets/runtime.js?v=reviewed-sha'};
assert.equal(requestViolation(resource,options),null);
assert.equal(requestViolation({...resource,headers:{accept:'*/*',referer:'https://example.test/tool/'}},options),null);
for(const candidate of [
  {...resource,method:'POST',body:Buffer.from('synthetic-private-result')},
  {...resource,method:'GET',body:Buffer.alloc(0)},
  {url:'https://collector.test/upload'},
  {url:'https://example.test/tool/assets/runtime.js?filename=synthetic-client.csv'},
  {url:'https://example.test/tool/assets/runtime.js?v=synthetic-measurement'},
  {url:'https://example.test/tool/unknown-source.csv'},
  {url:'https://example.test/tool/../other/upload'},
  {...resource,headers:{'x-project-result':'synthetic-secret'}},
  {...resource,headers:{referer:'https://example.test/tool/?source=synthetic-client'}},
  {url:'wss://example.test/tool/socket'},
])assert.ok(requestViolation(candidate,options),JSON.stringify(candidate));
options.navigations.add('https://example.test/tool/?test_run=123');
assert.equal(requestViolation({url:'https://example.test/tool/?test_run=123',navigation:true},options),null);
assert.ok(requestViolation({url:'https://example.test/tool/?test_run=123'},options));
assert.ok(requestViolation({url:'https://example.test/tool/?test_run=124',navigation:true},options));
const context=new EventEmitter(),page=new EventEmitter();context.pages=()=>[page];
const monitor=installPrivacyGuard(context,options.baseUrl,options);
context.emit('request',{
  url:()=>resource.url,method:()=>'GET',postDataBuffer:()=>null,headers:()=>({}),isNavigationRequest:()=>false,
});
monitor.assertClean();
page.emit('websocket',{});
assert.throws(()=>monitor.assertClean(),/Data-confidentiality network violations/);
const popup=new EventEmitter();context.emit('page',popup);popup.emit('websocket',{});
assert.throws(()=>monitor.assertClean(),/Data-confidentiality network violations/);
console.log('Privacy network negative/positive contracts passed.');
