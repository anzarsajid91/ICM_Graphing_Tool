import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1440,height:1000}});
const guard=installPrivacyGuard(context,base,{canaries:['SYNTHETIC-COEFFICIENT-PROVENANCE']});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
  await guard.navigate(page,base);
  await page.locator('button[data-workspace="hydraulics"]').click();
  await page.getByRole('tab',{name:'Structures',exact:true}).click();
  const panel=page.locator('#tab-hydraulic-structures'),form=panel.locator('#structureScreenForm');
  const structureResult=panel.getByRole('table',{name:'Steady discharge screen'});
  const formButton=form.getByRole('button',{name:'Calculate',exact:true});
  const fill=async(label,value)=>form.getByLabel(label,{exact:true}).fill(String(value));
  await fill('Nominal upstream water level (m)',100.5);
  await fill('Nominal downstream water level (m)',100.2);
  await fill('Crest or opening invert level (m)',100);
  await fill('Common vertical datum','ODN');
  await fill('Effective width (m)',1.25);
  await fill('Free-flow discharge coefficient',0.6);
  await fill('Coefficient source and applicable range','SYNTHETIC-COEFFICIENT-PROVENANCE');
  await form.getByLabel('I reviewed the setup, datum and applicability').check();
  await formButton.click();
  try {await structureResult.waitFor({timeout:60000});}
  catch(error) {
    const state=await panel.evaluate(root=>({states:[...root.querySelectorAll('[role="status"]')].map(el=>el.textContent),
      invalid:[...root.querySelectorAll('#structureScreenForm :invalid')].map(el=>el.name),
      worker:window.__ICM_WORKBENCH__?.status,runtimeErrors:window.__ICM_WORKBENCH__?.errors||[]}));
    console.error('Synthetic structure test state',JSON.stringify(state));throw error;
  }
  assert.match(await structureResult.innerText(),/submerged-weir.*0\.69973365/s);
  await fill('Nominal downstream water level (m)',99.9);
  assert(await structureResult.isHidden());
  await formButton.click();await structureResult.getByText('free-weir',{exact:true}).waitFor();
  const firstDownload=page.waitForEvent('download');await form.getByRole('button',{name:'Download calculation CSV'}).click();
  assert.match(await fs.readFile(await (await firstDownload).path(),'utf8'),/"Coefficient source and applicability","SYNTHETIC-COEFFICIENT-PROVENANCE"/);

  await form.getByLabel('Structure',{exact:true}).selectOption('v-notch-weir');
  assert(await form.getByLabel('Effective width (m)').isHidden());
  assert(await form.getByLabel('Submerged-opening discharge coefficient').isHidden());
  assert.equal(await form.getByLabel('I reviewed the setup, datum and applicability').isChecked(),false);
  assert.equal(await form.getByLabel('Free-flow discharge coefficient').inputValue(),'');
  for(const [label,value] of [
    ['Nominal upstream water level (m)',.2286],['Nominal downstream water level (m)',-.09144],
    ['Crest or opening invert level (m)',0],['Notch angle (degrees)',60],['Average approach width (m)',1.524],
    ['Notch vertex height above pool invert (m)',.6096],['Chart head correction (m)',.0012192],
    ['Free-flow discharge coefficient',.576],['Coefficient source and applicable range','Synthetic USBR chart review'],
  ])await fill(label,value);
  await form.getByLabel('I reviewed the setup, datum and applicability').check();
  await formButton.click();await structureResult.getByText('free-v-notch',{exact:true}).waitFor();
  assert.match(await structureResult.innerText(),/0\.0198966004/);
  const notchDownload=page.waitForEvent('download');
  await form.getByRole('button',{name:'Download calculation CSV',exact:true}).click();
  const notchCsv=await fs.readFile(await (await notchDownload).path(),'utf8');
  assert.match(notchCsv,/usbr-kindsvater-shen-fully-contracted-v1[\s\S]*equation 7-3[\s\S]*0\.0012192/);
  await fill('Nominal downstream water level (m)',-.03);
  assert(await structureResult.isHidden());
  await formButton.click();await structureResult.getByText('v-notch-tailwater',{exact:true}).waitFor();
  await fill('Nominal downstream water level (m)',-.09144);
  await fill('Average approach width (m)',.95);
  await formButton.click();await structureResult.getByText('v-notch-contraction',{exact:true}).waitFor();
  await fill('Notch angle (degrees)',20);
  assert.equal(await form.getByLabel('Notch angle (degrees)').evaluate(input=>input.validity.rangeUnderflow),true);

  await form.getByLabel('Structure',{exact:true}).selectOption('orifice');
  await fill('Crest or opening invert level (m)',100);
  await fill('Coefficient source and applicable range','Synthetic orifice review');
  await form.getByLabel('I reviewed the setup, datum and applicability').check();
  await form.getByLabel('Orifice shape').selectOption('circular');
  assert(await form.getByLabel('Effective width (m)').isHidden());
  await fill('Opening height or diameter (m)',.5);
  await fill('Nominal upstream water level (m)',100.6);
  await fill('Nominal downstream water level (m)',101);
  await fill('Submerged-opening discharge coefficient',.62);
  await formButton.click();await structureResult.getByText('reverse-not-confirmed',{exact:true}).waitFor();
  await form.getByLabel('Confirm symmetric, reversible flow').check();
  await formButton.click();await structureResult.getByText('submerged-opening',{exact:true}).waitFor();
  assert.match(await structureResult.innerText(),/-0\.340978433/);
  await form.getByLabel('Structure',{exact:true}).selectOption('sluice');
  await fill('Free-flow discharge coefficient',.6);
  await fill('Nominal upstream water level (m)',101);
  await fill('Nominal downstream water level (m)',100.72);
  await formButton.click();await structureResult.getByText('gate-transition',{exact:true}).waitFor();

  const rating=panel.locator('#structureRatingForm');
  await rating.getByLabel('Signed level difference (m)').fill('0.5');
  await rating.getByLabel('Rating source and configuration').fill('Synthetic bench test');
  for(const [row,head,flow] of [[1,0,0],[2,1,0.4]]) {
    await rating.getByLabel('Rated head and flow pairs row '+row+' Head difference (m)').fill(String(head));
    await rating.getByLabel('Rated head and flow pairs row '+row+' Discharge (m³/s)').fill(String(flow));
  }
  await rating.getByRole('button',{name:'Calculate',exact:true}).click();
  const rated=panel.getByRole('table',{name:'Rated discharge'});
  await rated.getByText('0.2',{exact:true}).waitFor();
  await rating.getByLabel('Signed level difference (m)').fill('2');
  await rating.getByRole('button',{name:'Calculate',exact:true}).click();
  await rated.getByText('outside-curve',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Pipe capacity',exact:true}).click();
  await page.locator('#pipeCapacityForm').waitFor();
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('STRUCTURES_PASS '+engine);
} finally {await browser.close();}
