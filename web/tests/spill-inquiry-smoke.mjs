import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1240,height:1000}});
const guard=installPrivacyGuard(context,base,{canaries:['SYNTHETIC-SPILL-DEPTH','SYNTHETIC-SPILL-FLOW','SYNTHETIC-SPILL-RAIN']});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const dialog=page.getByRole('dialog',{name:'Investigate physical discharges'}),status=dialog.getByRole('status');
const open=page.getByRole('button',{name:'Investigate physical discharges',exact:true});
const select=async(control,label)=>control.selectOption(await control.locator('option').filter({hasText:label}).getAttribute('value'));
const upload=(name,column,values)=>({name,mimeType:'text/csv',buffer:Buffer.from('Timestamp,'+column+'\n'+values.map((v,i)=>
  new Date(Date.UTC(2025,0,1,0,i)).toISOString().slice(0,-5)+','+v).join('\n'))});

try{
  await guard.navigate(page,base);
  await page.locator('button[data-workspace="spills"]').click();
  await open.click();await status.getByText('Calculate current spill evidence',{exact:false}).waitFor();
  assert(await dialog.getByRole('button',{name:'Review discharge intervals'}).isDisabled());
  await dialog.getByRole('button',{name:'Close investigation'}).click();
  await page.locator('button[data-workspace="data"]').click();
  await page.setInputFiles('#fileInput',[
    upload('SYNTHETIC-SPILL-DEPTH.csv','Depth (m)',[0,2,2,0,'',0,2,0]),
    upload('=SYNTHETIC-SPILL-FLOW.csv','Flow (m3/s)',[-1,1,1,-1,0,0,1,0]),
    upload('SYNTHETIC-SPILL-RAIN.csv','Rainfall (mm/h)',[6,6,6,6,6,6,-1,6])]);
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===3,null,{timeout:90000});
  await select(page.locator('#observedSelect'),'SYNTHETIC-SPILL-DEPTH');
  await page.locator('#applyMappingBtn').click();
  await page.waitForFunction(()=>Boolean(state.mapping.observed));
  await page.locator('button[data-workspace="spills"]').click();
  await page.locator('#obsThreshold').fill('1');
  await page.locator('#runSpillsBtn').click();
  await page.getByRole('region',{name:'Annual spill evidence table'}).waitFor({timeout:60000});
  await open.click();
  const review=dialog.getByRole('button',{name:'Review discharge intervals'}),table=dialog.getByRole('table');
  await review.click();await status.getByText('Discharge evidence is ready',{exact:false}).waitFor();
  const evidence=dialog.locator('#hbSpillInquiryBasis');
  assert.match(await evidence.innerText(),/2 physical intervals · 12\/24 assessment count 1/);
  assert.match(await table.locator('tbody tr').first().innerText(),/Unlinked.*Unlinked/s);
  assert.match(await table.locator('tbody tr').nth(1).innerText(),/interrupted evidence/);

  await select(dialog.getByRole('combobox',{name:'Spill flow source (optional)',exact:true}),'SYNTHETIC-SPILL-FLOW');
  await select(dialog.getByRole('combobox',{name:'Representative rainfall gauge (optional)',exact:true}),'SYNTHETIC-SPILL-RAIN');
  await dialog.getByRole('checkbox',{name:/supporting records share/}).check();
  await review.click();await status.getByText('Discharge evidence is ready',{exact:false}).waitFor();
  const cells=index=>table.locator('tbody tr').nth(index).locator('td').allTextContents();
  assert.deepEqual((await cells(0)).slice(1,5),['2 / 2','First detected interval','90','0.2']);
  assert.deepEqual((await cells(1)).slice(1,5),['1 / 1','3 · interrupted evidence','45','Withheld · 0.5 / 1 min']);
  const ordering=dialog.getByRole('combobox',{name:'Sort by',exact:true});
  for(const choice of ['duration_s','volume_m3','rain_mm','start'])await ordering.selectOption(choice);
  const filter=dialog.getByRole('spinbutton',{name:'Minimum duration (min)'});
  await filter.fill('3');await dialog.getByText('No matching physical discharge intervals.').waitFor();
  await filter.fill('1.5');assert.equal(await table.locator('tbody tr').count(),1);
  await filter.fill('0');
  const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download discharge register CSV'}).click();
  const csv=await fs.readFile(await (await download).path(),'utf8');
  assert.match(csv,/physical-spill-register-v1[\s\S]*12\/24 count[\s\S]*"90"/);
  assert.match(csv,/'=SYNTHETIC-SPILL-FLOW\.csv/);
  if(process.env.ICM_EVIDENCE_DIR){await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await dialog.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-spill-inquiry-'+engine+'.png'});}
  await dialog.getByRole('button',{name:'Plot discharge 1 in Time series'}).click();
  await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__.route().page==='time-series');
  assert(await dialog.isHidden());
  await page.waitForFunction(()=>{
    const range=document.querySelector('#timeChart')?.layout?.xaxis?.range;
    return range?.length===2&&range.every((stamp,i)=>String(stamp).includes(['00:00:30','00:02:30'][i]));
  });
  await page.locator('button[data-workspace="spills"]').click();
  await page.locator('#obsThreshold').fill('2');await open.click();
  await status.getByText('Calculate current spill evidence',{exact:false}).waitFor();
  await page.keyboard.press('Escape');

  await page.locator('button[data-workspace="data"]').click();
  await page.setInputFiles('#fileInput',upload('synthetic-repeat-discharges.csv','Depth (m)',Array.from({length:57},(_,i)=>i%2===1?2:0)));
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===4,null,{timeout:90000});
  await select(page.locator('#observedSelect'),'synthetic-repeat-discharges');
  await page.locator('#applyMappingBtn').click();
  await page.locator('button[data-workspace="spills"]').click();
  await page.locator('#obsThreshold').fill('1');await page.locator('#runSpillsBtn').click();
  await page.waitForFunction(()=>state.spillSnapshot?.results?.observed?.events.length===28,null,{timeout:60000});
  await open.click();
  await dialog.getByRole('combobox',{name:'Spill flow source (optional)',exact:true}).selectOption('');
  await dialog.getByRole('combobox',{name:'Representative rainfall gauge (optional)',exact:true}).selectOption('');
  await review.click();await status.getByText('Discharge evidence is ready',{exact:false}).waitFor();
  await dialog.getByText('Showing 1–25 of 28 matching intervals.').waitFor();
  await dialog.getByRole('button',{name:'Next page'}).click();
  await dialog.getByText('Showing 26–28 of 28 matching intervals.').waitFor();
  await dialog.getByRole('button',{name:'Previous page'}).click();
  await dialog.getByText('Showing 1–25 of 28 matching intervals.').waitFor();
  await dialog.getByRole('button',{name:'Close investigation'}).click();
  assert.deepEqual(errors,[]);guard.assertClean();
  console.log('SPILL_INQUIRY_PASS '+engine);
}finally{await browser.close();}
