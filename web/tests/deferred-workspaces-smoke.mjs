import assert from 'node:assert/strict';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000}});
const guard=installPrivacyGuard(context,base),page=await context.newPage();
const assets=new Map(['hydraulic-design.js','simulation-results.js','series-quality.js','monitor-comparison.js','spill-inquiry.js','local-security-diagnostics.js','survey-monitor-diagnostics.js'].map(name=>[name,0]));
const errors=[];page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{
  const name=new URL(request.url()).pathname.split('/').at(-1);
  if(assets.has(name))assets.set(name,assets.get(name)+1);
});
try {
  await guard.navigate(page,base);
  await page.locator('#hbProjectDashboard').waitFor();
  assert.deepEqual([...assets.values()],[0,0,0,0,0,0,0]);
  await page.locator('button[data-workspace="network"]').click();
  await page.locator('#nsSvg').waitFor();
  assert.deepEqual([...assets.values()],[0,0,0,0,0,0,0],'Schematic entry keeps the optional reviewers unloaded');
  await page.getByRole('tab',{name:'Simulation results'}).click();
  await page.locator('#hbResultsImport').waitFor();
  assert.deepEqual([...assets.values()],[0,1,0,0,0,0,0]);

  await page.route('**/assets/hydraulic-design.js*',route=>route.fulfill({status:503,body:'Synthetic temporary failure'}),{times:1});
  await page.locator('button[data-workspace="hydraulics"]').click();
  await page.locator('#pipeCapacityForm').waitFor();
  assert.equal(assets.get('hydraulic-design.js'),0);
  await page.getByRole('tab',{name:'System curve',exact:true}).click();
  const retry=page.getByRole('button',{name:'Retry opening system curve',exact:true});
  await retry.click();await page.locator('#pipeSystemForm').waitFor();
  await page.getByRole('tab',{name:'Formula A',exact:true}).click();
  await page.locator('#designFlowForm').waitFor();
  assert.equal(assets.get('hydraulic-design.js'),2);

  await page.locator('button[data-workspace="data"]').click();
  assert.equal(assets.get('series-quality.js'),0);
  await page.getByRole('button',{name:'Source diagnostics',exact:true}).click();
  await page.getByRole('dialog',{name:'Time-series quality diagnostics',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  assert(await page.locator('#tab-series-quality').isHidden());
  assert.equal(assets.get('series-quality.js'),1);
  await page.getByRole('button',{name:'Compare monitoring locations',exact:true}).click();
  await page.locator('#hbMonitorCompare').waitFor();await page.keyboard.press('Escape');
  assert.equal(assets.get('monitor-comparison.js'),1);
  await page.locator('button[data-workspace="spills"]').click();
  assert.equal(assets.get('spill-inquiry.js'),0);
  await page.getByRole('button',{name:'Investigate physical discharges',exact:true}).click();
  await page.locator('#hbSpillInquiry').waitFor();await page.keyboard.press('Escape');
  assert.equal(assets.get('spill-inquiry.js'),1);
  await page.locator('button[data-workspace="survey"]').click();
  assert.equal(assets.get('survey-monitor-diagnostics.js'),0);
  await page.getByRole('button',{name:'Investigate monitor readings',exact:true}).click();
  await page.getByRole('dialog',{name:'Investigate monitor readings',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(assets.get('survey-monitor-diagnostics.js'),1);
  await page.getByRole('button',{name:'About',exact:true}).click();
  await page.getByRole('tab',{name:'IT Security',exact:true}).click();
  assert.equal(assets.get('local-security-diagnostics.js'),0);
  await page.getByRole('button',{name:'Open local data diagnostics',exact:true}).click();
  await page.locator('#hbLocalSecurity').waitFor();await page.keyboard.press('Escape');
  assert.equal(assets.get('local-security-diagnostics.js'),1);
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('DEFERRED_WORKSPACES_PASS '+engine);
} finally {await browser.close();}
