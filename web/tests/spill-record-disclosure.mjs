// Native spill record disclosure; synthetic values exercise the actual renderer.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {installPrivacyGuard} from './privacy-network.mjs';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await chromium.launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000}});
const page=await context.newPage(),privacy=installPrivacyGuard(context,base),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__);
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('spills','assessment',false));
 const records=page.locator('#spillRecordDetails'),summary=records.locator('summary');
 assert.equal(await records.count(),1,'Spill records have one disclosure below monthly evidence');
 assert.equal(await records.evaluate(el=>el.open),false,'Spill records start collapsed');
 await page.evaluate(()=>{
   const event=(hour,duration_seconds)=>({start:`2026-09-01T${hour}:00:00`,end:new Date(Date.parse(`2026-09-01T${hour}:00:00Z`)+duration_seconds*1000).toISOString().slice(0,19),duration_seconds});
   const result=events=>({events,yearly_summary:[],monthly_summary:[],total_spill_count:events.length,total_spill_duration_hours:1,count_status:'definitive'});
   state.spills={observed:result([event('01',1800),event('04',900)]),model:result([event('07',2700)])};renderSpills();
 });
 assert.equal(await records.evaluate(el=>el.open),false,'Calculating/rendering does not expand the records');
 assert.equal(await page.locator('#eventBody tr').count(),3,'Every observed/modelled physical interval remains present');
 assert.equal(await page.locator('#eventBody').isVisible(),false);
 assert.equal(await summary.locator('.spill-record-show').isVisible(),true);
 await summary.click();assert.equal(await records.evaluate(el=>el.open),true);
 assert.equal(await summary.locator('.spill-record-hide').isVisible(),true);
 const rows=await page.locator('#eventBody tr').allTextContents();
 assert.deepEqual(rows.map(row=>row.includes('Observed')?'Observed':'Modelled'),['Observed','Observed','Modelled']);
 assert.match(rows[0],/0\.5/);assert.match(rows[1],/0\.25/);assert.match(rows[2],/0\.75/);
 assert.equal(await page.evaluate(()=>Boolean(document.getElementById('spillComparison').compareDocumentPosition(document.getElementById('spillRecordDetails'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
 await summary.focus();await summary.press('Space');assert.equal(await records.evaluate(el=>el.open),false);
 await summary.press('Enter');assert.equal(await records.evaluate(el=>el.open),true);
 await page.evaluate(()=>renderSpills());assert.equal(await records.evaluate(el=>el.open),true,'An explicitly opened record view survives result refresh');
 await page.reload();await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__);
 assert.equal(await records.evaluate(el=>el.open),false,'A fresh app load defaults to collapsed');
 assert.deepEqual(errors,[]);privacy.assertClean();
 console.log('SPILL_RECORD_DISCLOSURE_PASS: collapsed default, observed/modelled intervals, pointer/keyboard toggle and refresh semantics.');
}finally{await browser.close();}
