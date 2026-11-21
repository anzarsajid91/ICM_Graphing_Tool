import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1440,height:1000}});
const guard=installPrivacyGuard(context,base,{canaries:['SYNTHETIC-REVIEW-LOCAL']});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const panel=page.locator('#tab-series-quality'),quality=page.getByRole('button',{name:'Source diagnostics',exact:true});
const status=panel.locator('#hbQualityStatus');

try {
  await guard.navigate(page,base);
  await page.locator('button[data-workspace="data"]').click();
  await quality.click();
  assert.match(await panel.innerText(),/Import an instantaneous series/);
  await panel.getByRole('button',{name:'Close diagnostics'}).click();
  const time=[0,60,120,180,240,300,360,360,480,510,570,630];
  const value=[10,10,10,10,50,10,'',20,20,-10,-10,-10];
  const fmt=(seconds)=>new Date(Date.UTC(2025,0,1,0,0,seconds)).toISOString().slice(0,-1);
  const compose=(times,values)=>'Timestamp,Flow (L/s)\n'+times.map((s,i)=>fmt(s)+','+values[i]).join('\n');
  const times=Array.from({length:220},(_,index)=>index*60);
  let random=21;
  const series=times.map(()=>{random=(random*48271)%2147483647;return (random/10000).toFixed(4);});
  const inputs=[['flag-synthetic.csv',compose(time,value)],['clock-synthetic-a.csv',compose(times,series)],
    ['clock-synthetic-b.csv',compose(times.map(s=>s+(s<6600?120:180)),series)]];
  await page.setInputFiles('#fileInput',inputs.map(([name,text])=>({name,mimeType:'text/csv',buffer:Buffer.from(text)})));
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===3,null,{timeout:90000});
  await quality.click();
  const source=panel.getByLabel('Source series');
  async function pick(select, filename){
    const option=select.locator('option').filter({hasText:filename});
    await select.selectOption({value:await option.getAttribute('value')});
  }
  await pick(source,'flag-synthetic.csv');
  assert.match(await panel.locator('#hbQualityUnit').innerText(),/m³\/s/);
  await panel.getByLabel('Expected timestep (s)').fill('60');
  await panel.getByText('Value diagnostics',{exact:true}).click();
  await panel.getByLabel('Maximum flatline amplitude').fill('0');
  await panel.getByLabel('Minimum flatline duration (s)').fill('120');
  await panel.getByLabel('Abrupt change threshold').fill('0.03');
  await panel.getByLabel('Lower plausible value').fill('0');
  await panel.getByLabel('Upper plausible value').fill('0.04');
  const run=panel.getByRole('button',{name:'Review source quality'});
  await run.click();await status.filter({hasText:'Diagnostic review ready'}).waitFor({timeout:60000});
  const findings=panel.getByRole('table',{name:'Diagnostic candidates and engineer decisions'});
  for(const text of ['Duplicate timestamp','Missing values','Potential flatline','Potential spike','Below screening bound'])
    assert.match(await findings.innerText(),new RegExp(text));
  const filter=panel.getByLabel('Filter diagnostics');
  await filter.selectOption('long-timestep');
  const row=findings.locator('tbody tr');assert.equal(await row.count(),1);
  await row.getByLabel('Long timestep review decision').selectOption('accepted');
  await row.getByRole('button',{name:'Add review exclusion'}).click();
  assert.match(await status.innerText(),/Enter a reason/);
  await row.getByLabel('Long timestep review note').fill('SYNTHETIC-REVIEW-LOCAL');
  await row.getByRole('button',{name:'Add review exclusion'}).click();
  await row.getByRole('button',{name:'Exclusion recorded'}).waitFor();
  assert.match(await page.locator('#exclusionRows input[data-field="reason"]').first().inputValue(),/SYNTHETIC-REVIEW-LOCAL/);
  const exported=page.waitForEvent('download');await panel.getByRole('button',{name:'Download diagnostic review CSV'}).click();
  const csv=await fs.readFile(await (await exported).path(),'utf8');
  assert.match(csv,/"Source SHA-256","[a-f0-9]{64}"/);
  assert.match(csv,/"accepted","SYNTHETIC-REVIEW-LOCAL","true"/);

  await pick(source,'clock-synthetic-a.csv');
  assert(await findings.isHidden());
  await panel.getByText('Clock comparison',{exact:true}).click();
  await pick(panel.getByLabel('Reference record of the same signal'),'clock-synthetic-b.csv');
  await run.click();
  await status.filter({hasText:'Confirm the reference'}).waitFor();
  await panel.getByLabel('The reference records the same signal on its own clock').check();
  await run.click();await status.filter({hasText:'Diagnostic review ready'}).waitFor({timeout:60000});
  const clock=await panel.locator('#hbQualityClock').innerText();
  assert.match(clock,/candidate reference shift -120 s/);
  assert.match(clock,/candidate reference shift -180 s/);
  assert.match(clock,/Change in candidate shift -60 s/);
  await page.keyboard.press('Escape');
  assert(await panel.isHidden());
  assert(await quality.evaluate(button=>document.activeElement===button));
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('SERIES_QUALITY_PASS '+engine);
} finally {await browser.close();}
