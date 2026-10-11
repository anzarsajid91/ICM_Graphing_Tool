import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../assets/design-system.js',import.meta.url),'utf8');
const requests=[];let fail=true;
const context={window:{},document:{currentScript:{src:'https://example.test/preview/assets/design-system.js?v=fixed'}},URL,Uint8Array,String,btoa:s=>Buffer.from(s,'binary').toString('base64'),fetch:async(url,options)=>{
 requests.push({url,options});return {ok:!fail,arrayBuffer:async()=>Uint8Array.from([0,1,127,128,255]).buffer};
}};
vm.runInNewContext(code,context);
const design=context.window.HydraDesign;
assert.equal(design.reportFontCss(),'');assert.equal(requests.length,0,'No eager export font fetch');
await assert.rejects(design.prepareReportFont(),/typeface/);
fail=false;
const [first,second]=await Promise.all([design.prepareReportFont(),design.prepareReportFont()]);
assert.equal(first,second);assert.match(first,/data:font\/woff2;base64,AAF\/gP8=/);
await design.prepareReportFont();assert.equal(requests.length,2,'Concurrent and repeat exports reuse font bytes; failed preparation retries');
for(const request of requests){assert.equal(request.url,'https://example.test/preview/vendor/inter-4.1/InterVariable.woff2');assert.equal(request.options.referrerPolicy,'no-referrer');assert.equal(request.options.credentials,'omit');assert.equal(request.options.mode,'same-origin');assert.equal(request.options.body,undefined);}
assert.match(design.family,/^"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif$/);
console.log('Design font contracts passed: fixed local resource, no eager fetch, retry, caching and exact binary embedding.');
