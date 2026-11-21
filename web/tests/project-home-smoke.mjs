import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000}});
const guard=installPrivacyGuard(context,base),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const dashboard=page.locator('#hbProjectDashboard'),recent=page.locator('#hbRecentWork'),guides=page.locator('#hbGuidedWorkflows');
const route=()=>page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.route());
try{
  await guard.navigate(page,base);
  await dashboard.waitFor();
  assert.deepEqual(await route(),{workspace:'home',page:'overview'});
  assert.match(await dashboard.innerText(),/0 ready of 0/);
  assert.match(await recent.innerText(),/Open a workspace/);
  assert.equal(await guides.locator('summary').count(),6);
  await dashboard.getByRole('button',{name:'Open workspace for Imported sources'}).click();
  await page.setInputFiles('#fileInput',{name:'synthetic-home.csv',mimeType:'text/csv',buffer:Buffer.from(
    'Timestamp,Flow (L/s)\n2025-01-01 00:00,10\n2025-01-01 00:05,20\n2025-01-01 00:10,12\n'
  )});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===1,null,{timeout:90000});
  await page.locator('[data-workspace="home"]').click();
  assert.match(await dashboard.innerText(),/1 ready of 1/);
  await recent.getByRole('button',{name:'Data / time series · Time series',exact:true}).click();
  assert.deepEqual(await route(),{workspace:'data',page:'time-series'});
  await page.locator('[data-workspace="home"]').click();
  await guides.locator('summary').filter({hasText:'Network investigation'}).focus();
  await page.keyboard.press('Space');
  await guides.getByRole('button',{name:'Open Network investigation'}).click();
  await page.locator('#nsSvg').waitFor();
  assert.deepEqual(await route(),{workspace:'network',page:'schematic'});
  await page.locator('[data-workspace="home"]').click();
  await dashboard.waitFor();
  await guard.navigate(page,base,{waitUntil:'domcontentloaded'});
  await dashboard.waitFor();
  assert.deepEqual(await route(),{workspace:'home',page:'overview'});
  assert.equal(await recent.getByRole('button',{name:'Network Schematic · Schematic',exact:true}).count(),1);
  assert.match(await dashboard.innerText(),/0 ready of 0/,'Reload reports the actual unloaded source pool');
  await recent.getByRole('button',{name:'Clear recent pages'}).click();
  assert.match(await recent.innerText(),/Open a workspace/);
  await page.setViewportSize({width:1024,height:850});
  const sizes=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);
  assert(sizes[0]<=sizes[1]+2);
  if(process.env.ICM_EVIDENCE_DIR){
    await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await dashboard.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-project-dashboard-'+engine+'.png'});
  }
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('PROJECT_HOME_PASS '+engine);
}finally{await browser.close();}
