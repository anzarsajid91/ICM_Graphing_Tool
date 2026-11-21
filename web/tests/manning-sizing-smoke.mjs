import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1280,height:960}});
const guard=installPrivacyGuard(context,base),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const root=page.locator('#tab-manning-sizing'),form=root.locator('#hbManningForm'),status=root.locator('#hbManningStatus');
const mode=form.getByRole('combobox',{name:'Calculation',exact:true}),table=root.getByRole('table',{name:'Calculated sections',exact:true});
const fill=async values=>{for(const [field,input] of Object.entries(values))await form.locator('[name='+field+']').fill(String(input));};

try{
  await guard.navigate(page,base);await page.locator('button[data-workspace="hydraulics"]').click();
  await page.locator('#pipeCapacityForm').waitFor();
  await page.getByRole('tab',{name:'Manning sizing',exact:true}).click();await form.waitFor();assert(await table.isHidden());
  assert(await form.locator('[name=target]').isHidden());
  const run=form.getByRole('button',{name:'Calculate Manning result',exact:true});
  await fill({n:.013,diameter:600,gradient:.005,fill:50});await run.click();
  await status.getByText('Calculation ready.',{exact:false}).waitFor({timeout:90000});
  assert.match(await root.locator('#hbManningSummary').innerText(),/434\.1717 L\/s.*Full-bore reference/s);
  assert.match(await table.locator('tbody tr').innerText(),/300.*0\.15.*217\.0859.*1\.535568.*921,341/s);
  assert.match(await root.locator('#hbManningSections').innerText(),/50% of diameter/);
  await root.getByRole('button',{name:'Show depth–discharge plot',exact:true}).click();
  await root.locator('#hbManningPlotStatus').getByText('Plot ready.',{exact:false}).waitFor();
  const trace=await root.locator('#hbManningPlot').evaluate(chart=>chart.data.map(row=>({x:row.x,y:row.y})));
  assert.equal(trace[0].x.length,81);assert.equal(trace[0].y.at(-1),600);
  assert(Math.abs(trace[1].x[0]-217.085862993291)<1e-9);assert.deepEqual(trace[1].y,[300]);
  const keep=root.getByRole('button',{name:'Keep as a trial',exact:true}),trials=root.getByRole('table',{name:'Manning trials',exact:true});
  await keep.click();assert.equal(await trials.locator('tbody tr').count(),1);
  await mode.selectOption('depth');assert(await table.isHidden());assert(await form.locator('[name=fill]').isHidden());
  await fill({target:450});await run.click();await status.getByText('Two free-surface depths satisfy the target',{exact:false}).waitFor();
  assert.equal(await table.locator('tbody tr').count(),2);
  const depths=await table.locator('tbody tr td:first-child').allTextContents();
  assert(Number(depths[0])<.94*600&&Number(depths[1])>.94*600);
  assert((await table.locator('tbody tr td:nth-child(4)').allTextContents()).every(value=>Number(value)===450));
  await keep.click();assert.equal(await trials.locator('tbody tr').count(),2);
  await trials.getByRole('button',{name:'Remove trial 1',exact:true}).click();assert.equal(await trials.locator('tbody tr').count(),1);
  await mode.selectOption('diameter');assert(await form.locator('[name=diameter]').isHidden());
  await fill({gradient:.015,target:500});await run.click();await status.getByText('Calculation ready.',{exact:false}).waitFor();
  assert.match(await root.locator('#hbManningSummary').innerText(),/514\.8512 mm.*Continuous required diameter/s);
  const csvRequested=page.waitForEvent('download');await root.getByRole('button',{name:'Download calculation CSV',exact:true}).click();
  const csv=await fs.readFile(await (await csvRequested).path(),'utf8');
  assert.match(csv,/circular-manning-uniform-si-v1/);assert.match(csv,/FHWA HEC-22/);assert.match(csv,/0\.514851153/);
  await keep.click();assert.equal(await trials.locator('tbody tr').count(),2);
  await mode.selectOption('gradient');assert(await form.locator('[name=gradient]').isHidden());
  await fill({diameter:600,target:434.1717259865819});await run.click();await status.getByText('Calculation ready.',{exact:false}).waitFor();
  assert.match(await root.locator('#hbManningSummary').innerText(),/0\.005 m\/m.*Required energy gradient/s);
  await keep.click();
  const trialRequested=page.waitForEvent('download');await root.getByRole('button',{name:'Download trial comparison CSV',exact:true}).click();
  const trialCsv=await fs.readFile(await (await trialRequested).path(),'utf8');
  for(const name of ['Normal depth','Required diameter','Required gradient'])assert(trialCsv.includes(name));
  if(process.env.ICM_EVIDENCE_DIR){await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await page.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-manning-sizing-'+engine+'.png'});}
  await root.getByRole('button',{name:'Clear trials',exact:true}).click();assert(await trials.isHidden());
  await mode.selectOption('capacity');await fill({diameter:10,gradient:.0005,fill:100,viscosity_m2_s:.01});
  await run.click();await status.getByText('Outside the turbulent screening range.',{exact:false}).waitFor();
  assert(await keep.isDisabled());assert(await root.getByRole('button',{name:'Show depth–discharge plot',exact:true}).isDisabled());
  await fill({gradient:0});await run.click();await status.getByText('Zero gradient gives zero uniform-flow capacity.',{exact:true}).waitFor();
  assert.match(await root.locator('#hbManningSummary').innerText(),/0 L\/s/);
  await page.setViewportSize({width:640,height:760});
  const layout=await root.evaluate(root=>({viewport:innerWidth,width:document.documentElement.scrollWidth,
    spilling:[root,...root.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>innerWidth+2&&!el.closest('.table-wrap')).slice(0,12).map(el=>
      [el.tagName,el.id||el.className,Math.round(el.getBoundingClientRect().right),el.scrollWidth,el.clientWidth])}));
  assert(layout.width<=layout.viewport+2,'The sizing panel fits the zoom-equivalent desktop width '+JSON.stringify(layout));
  await run.focus();await run.press('Enter');await status.getByText('Zero gradient gives zero uniform-flow capacity.',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Pipe capacity',exact:true}).click();await page.locator('#pipeCapacityForm').waitFor();
  await page.getByRole('button',{name:'Calculate capacity',exact:true}).click();
  await page.locator('#pipeCapacityResult').getByText(/^202\.65 L\/s ·/).waitFor();
  assert.deepEqual(errors,[]);guard.assertClean();console.log('MANNING_SIZING_PASS '+engine);
}finally{await browser.close();}
