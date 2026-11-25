// Reproduce DE-03 and DE-15 with the independent review's synthetic assets.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const name=process.env.ICM_BROWSER||'chromium';
const browser=await ({chromium,firefox}[name]).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1024,height:768}});
const guard=installPrivacyGuard(context,base,{canaries:['A-CROSS-ID','A-CROSS-REPORT','A-TECH-spill']});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const evidenceDir=process.env.ICM_EVIDENCE_DIR;
const field=key=>page.locator('#dtForm [data-key="'+key+'"]');
const route=async pageName=>{
  await page.locator('.pw-primary-nav [data-workspace="detriment"]').click();
  if (pageName==='spill') await page.locator('.pw-secondary-nav [data-page="spill"]').click();
};
async function exportFile(id){
  const next=page.waitForEvent('download');
  await page.locator('#'+id).focus();
  await page.keyboard.press('Enter');
  const file=await next;
  return readFile(await file.path(),'utf8');
}
const fixture=(name,values)=>({name,mimeType:'text/csv',buffer:Buffer.from('Node ID,Flood volume (m³),Simulation\n'+
  values.map((value,index)=>'A-CROSS-ID-00'+(index+1)+','+value+',Matched Synthetic').join('\n')+'\n')});
async function chooseSources(sources){
  await field('a.id').selectOption({label:sources[0].name});
  await field('b.id').selectOption({label:sources[1].name});
  await field('scope').fill('Synthetic common scope');
  await field('scope_confirmed').check();
}
async function run(){
  await page.click('#runDetrimentBtn');
  await page.waitForFunction(()=>Boolean(window.ICMDetriment.result()),null,{timeout:90000});
  return page.evaluate(()=>window.ICMDetriment.result());
}
try{
  await guard.navigate(page,base);
  await page.getByRole('link',{name:'Open Data / time series'}).click();
  await page.locator('#dtReportUpload summary').click();
  const flood=[fixture('A-CROSS-REPORT-baseline.csv',[2,1,0]),fixture('A-CROSS-REPORT-proposed.csv',[9,2,0])];
  const spill=await Promise.all(['baseline','proposed'].map(async stage=>{
    const filename='A-TECH-spill-'+stage+'.csv';
    return {name:filename,mimeType:'text/csv',buffer:await readFile('docs/reviews/v3.0.1/technical/'+filename)};
  }));
  await page.setInputFiles('#dtFileInput',[...flood,...spill]);
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===4,null,{timeout:120000});
  await route('flooding');await chooseSources(flood);await field('threshold').fill('5');await run();
  await page.locator('#dtResults [data-key="filter"]').selectOption('detriment');
  await page.evaluate(()=>{
    const original=Plotly.toImage.bind(Plotly);
    window.capturedDetrimentFigures=[];
    Plotly.toImage=(chart,...args)=>{
      window.capturedDetrimentFigures.push(chart.data.map(trace=>({x:[...trace.x],y:[...trace.y]})));
      return original(chart,...args);
    };
  });
  const html=await exportFile('dtExportViewHtml');
  const figures=await page.evaluate(()=>window.capturedDetrimentFigures);
  assert.deepEqual(figures,[[{x:[7],y:['A-CROSS-ID-001']}]]);
  assert.match(html,/<td>A-CROSS-ID-001<\/td>/);
  assert.doesNotMatch(html,/A-CROSS-ID-00[23]/);
  const png=/<img alt="Change by asset" src="data:image\/png;base64,([^"]+)"/.exec(html);
  assert.ok(png);
  if(evidenceDir){await mkdir(evidenceDir,{recursive:true});await writeFile(path.join(evidenceDir,name+'-filtered-change.png'),Buffer.from(png[1],'base64'));}
  await route('spill');await chooseSources(spill);
  await field('period_start').fill('2025-01-01');await field('period_end').fill('2026-01-01');
  await field('template').fill('Same synthetic summary statistics');await field('spill_combination_policy').selectOption('either_criterion');
  const result=await run();
  assert.equal(result.summary.unresolved,2);assert.equal(result.summary.detriment,3);
  const count=result.rows.find(row=>row.asset_id==='COUNT'),duration=result.rows.find(row=>row.asset_id==='DURATION');
  assert.deepEqual([count.count_status,count.duration_status,count.delta],['detriment','unavailable',3]);
  assert.deepEqual([duration.count_status,duration.duration_status,duration.duration_delta_hours],['unavailable','detriment',2.25]);
  await page.locator('#dtResults [data-key="filter"]').selectOption('unresolved');
  assert.deepEqual((await page.locator('#dtTable tbody tr td:first-child').allTextContents()).sort(),['COUNT','DURATION']);
  await page.evaluate(()=>window.capturedDetrimentFigures=[]);
  const partial=await exportFile('dtExportViewHtml');
  assert.doesNotMatch(partial,/<td>COMPLETE<\/td>/);
  assert.match(partial,/Count: unavailable · duration: detriment/);
  assert.match(partial,/Count: detriment · duration: unavailable/);
  const groups=await page.evaluate(()=>window.capturedDetrimentFigures);
  assert.deepEqual(groups[0],[{x:[3],y:['COUNT']}]);
  assert.deepEqual(groups.find(traces=>traces[0].y.includes('DURATION')),[{x:[2.25],y:['DURATION']}]);
  assert.deepEqual(groups.find(traces=>traces.length===2),[{x:['COUNT'],y:[2]},{x:['COUNT'],y:[5]}]);
  const csv=await exportFile('dtExportViewCsv');assert.match(csv,/"count_status","duration_status"/);
  assert.doesNotMatch(csv,/"COMPLETE"/);
  if(evidenceDir)await page.screenshot({path:path.join(evidenceDir,name+'-independent-criteria.png')});
  guard.assertClean();assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:name,floodExport:figures,spillChange:groups,spillSummary:result.summary,privacy:'pass',errors}));
}finally{await browser.close();}
