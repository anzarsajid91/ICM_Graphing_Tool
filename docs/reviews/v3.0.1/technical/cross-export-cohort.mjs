import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '/workspace/hydra-v301-production/node_modules/playwright/index.mjs';
import { browserLaunchOptions,browserContextOptions } from '/workspace/hydra-v301-production/web/tests/browser-environment.mjs';
import { installPrivacyGuard } from '/workspace/hydra-v301-production/web/tests/privacy-network.mjs';

const base='https://anzarsajid91.github.io/ICM_Graphing_Tool/';
const sha='ccc36427c12f003e5d9b1fee61632770b31952cc';
const browser=await chromium.launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1440,height:1000}});
const guard=installPrivacyGuard(context,base,{buildToken:sha,canaries:['A-CROSS-ID','A-CROSS-REPORT']});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const note={identity:sha,browser:browser.version(),errors};

try{
  await guard.navigate(page,base);
  assert.equal(await page.locator('meta[name="icm-build-sha"]').getAttribute('content'),sha);
  await page.getByRole('link',{name:'Open Data / time series'}).click();
  await page.locator('#dtReportUpload summary').click();
  const fixture=(name,values)=>({name,mimeType:'text/csv',buffer:Buffer.from(
    'Node ID,Flood volume (m³),Simulation\nA-CROSS-ID-001,'+values[0]+',Matched Synthetic\nA-CROSS-ID-002,'+
    values[1]+',Matched Synthetic\nA-CROSS-ID-003,'+values[2]+',Matched Synthetic\n')});
  const files=[fixture('A-CROSS-REPORT-baseline.csv',[2,1,0]),fixture('A-CROSS-REPORT-proposed.csv',[9,2,0])];
  await page.setInputFiles('#dtFileInput',files);
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===2,null,{timeout:90000});
  await page.locator('.pw-primary-nav [data-workspace="detriment"]').click();
  const field=key=>page.locator('#dtForm [data-key="'+key+'"]');
  await field('a.id').selectOption({label:files[0].name});
  await field('b.id').selectOption({label:files[1].name});
  await field('scope').fill('A-CROSS-REPORT shared scope');
  await field('scope_confirmed').check();
  await field('threshold').fill('5');
  await page.click('#runDetrimentBtn');
  await page.locator('#dtResults [data-key="filter"]').selectOption('detriment');
  await page.waitForFunction(()=>Boolean(document.querySelector('#dtChart')?.data?.[0]?.y?.length));
  note.displayedRows=await page.locator('#dtTable tbody tr td:first-child').allTextContents();
  note.chartIds=await page.locator('#dtChart').evaluate(el=>el.data[0].y);
  await page.evaluate(()=>{
    const original = Plotly.toImage.bind(Plotly);
    window.crossExportFigures=[];
    Plotly.toImage=(chart,...args)=>{
      if(chart?.id)window.crossExportFigures.push({id:chart.id,series:chart.data.map(trace=>({x:trace.x,y:trace.y}))});
      return original(chart,...args);
    };
  });
  const download=page.waitForEvent('download');
  await page.click('#dtExportViewHtml');
  const artifact=await download;
  const html=await readFile(await artifact.path(),'utf8');
  const embedded=/<img alt="Change by asset" src="([^"]+)"/.exec(html)?.[1];
  note.exportedRows=[...html.matchAll(/<tr><td>(A-CROSS-ID-\d+)<\/td><td class="dt-/g)].map(match=>match[1]);
  note.chartCapture=await page.evaluate(()=>window.crossExportFigures);
  note.embeddedChartSha256=createHash('sha256').update(embedded||'').digest('hex');
  if(embedded?.startsWith('data:image/png;base64,')){
    const png=Buffer.from(embedded.split(',')[1],'base64');
    await writeFile(new URL('cross-export-cohort-embedded.png',import.meta.url),png);
  }
  note.filename=artifact.suggestedFilename();
  assert.deepEqual(note.displayedRows,note.exportedRows);
  assert.deepEqual(errors,[]);
  guard.assertClean();
  note.guard='pass';
  console.log(JSON.stringify(note,null,2));
}catch(error){
  note.failure=String(error);console.error(error);process.exitCode=1;
}finally{
  await writeFile(new URL('cross-export-cohort.json',import.meta.url),JSON.stringify(note,null,2)+'\n');
  await browser.close();
}
