import {trackControls} from './control-evidence.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await chromium.launch(browserLaunchOptions());
let writeControlEvidence;
try{
  const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:390,height:800}});
  const privacy=installPrivacyGuard(context,base);
  const page=await context.newPage();
  writeControlEvidence=await trackControls(page.context(),'hydraulics-smoke-control-evidence.json');
  await privacy.navigate(page,base);
  await page.getByRole('link',{name:'Run hydraulic calculations'}).click();
  const keep=page.getByRole('button',{name:'Add current result'});
  const table=page.locator('#pipeComparisonTable');
  const result=page.locator('#pipeCapacityResult');
  await page.getByRole('button',{name:'Calculate capacity'}).click();
  await page.locator('.pipe-section-views figure').waitFor({timeout:60000});
  assert.match(await result.textContent(),/202\.65 L\/s/);
  await keep.click();
  assert.equal(await table.locator('tbody tr').count(),1);
  assert.equal(await keep.isDisabled(),true);
  await page.getByLabel('Design discharge (L/s)').fill('212.78');
  assert.equal(await page.locator('.pipe-section-views figure').count(),0);
  await page.getByRole('button',{name:'Assess design flow'}).click();
  await page.locator('.pipe-section-views figure').nth(1).waitFor({timeout:60000});
  await keep.click();
  assert.equal(await table.locator('tbody tr').count(),2);
  assert.equal(await table.locator('meter').count(),2);
  assert.match(await table.locator('tbody tr').last().textContent(),/396\.24 \/ 442\.74/);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export comparison CSV'}).click();
  const csv=await fs.readFile(await (await download).path(),'utf8');
  assert.match(csv,/"full_capacity_L_s","design_flow_L_s","normal_depths_mm"/);
  assert.equal(csv.split('\r\n').length,3);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.getByRole('button',{name:'Clear comparison'}).click();
  assert.equal(await table.isVisible(),false);
  const disclose=page.getByText('Calculate gradient from ICM conduit fields',{exact:true});
  await disclose.click();
  await page.locator('#pipeUseInvertGradient').click();
  assert.match(await result.innerText(),/Enter both invert levels/);
  const form=page.locator('#pipeCapacityForm');
  await form.locator('[name="usInvert"]').fill('100');
  await form.locator('[name="dsInvert"]').fill('99');
  await form.locator('[name="conduitLength"]').fill('200');
  await page.locator('#pipeUseInvertGradient').click();
  assert.equal(Number(await form.locator('[name="gradient"]').inputValue()),0.005);
  assert.match(await result.innerText(),/Calculated gradient applied/);
  await form.locator('[name="dsInvert"]').fill('101');
  await page.locator('#pipeUseInvertGradient').click();
  assert.match(await result.innerText(),/outside the supported/);
  // Hold one real worker reply so the waiting controls are deterministic.
  await page.evaluate(()=>{
   const original=engine._message.bind(engine);
   let held;
   engine._message=message=>{
    if(message.type==='result'&&!held){held=message;return;}
    return original(message);
   };
   window.releaseFirstQueueResult=async()=>{
    while(!held)await new Promise(resolve=>setTimeout(resolve,20));
    engine._message=original;original(held);
   };
   const args={diameter_m:.45,gradient:0.005,roughness_m:.0015,viscosity_m2_s:1e-6};
   window.queueOutcomes=Array.from({length:4},()=>engine.call('circular_pipe_capacity',args).then(()=>true,e=>e.message));
  });
  await page.getByText('Process queue',{exact:true}).click();
  const queued=await page.locator('[data-prioritise-job]').evaluateAll(els=>els.map(el=>el.dataset.prioritiseJob));
  assert.equal(queued.length,3);
  await page.locator('[data-prioritise-job="'+queued[2]+'"]').click();
  assert.equal(await page.locator('[data-prioritise-job]').first().getAttribute('data-prioritise-job'),queued[2]);
  await page.locator('[data-cancel-job="'+queued[0]+'"]').click();
  assert.equal(await page.locator('[data-cancel-job="'+queued[0]+'"]').count(),0);
  await page.evaluate(()=>window.releaseFirstQueueResult());
  const outcomes=await page.evaluate(()=>Promise.all(window.queueOutcomes));
  assert.deepEqual(outcomes,[true,'Queued analysis cancelled.',true,true]);
  privacy.assertClean();
  console.log('Hydraulic capacity, two normal depths, comparison, local export and narrow layout passed.');
}finally{try{await writeControlEvidence?.();}finally{await browser.close();}}
