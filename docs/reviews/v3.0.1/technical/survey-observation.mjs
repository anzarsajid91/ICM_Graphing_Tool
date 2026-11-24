import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { chromium, firefox } from '/workspace/hydra-v301-production/node_modules/playwright/index.mjs';
import { browserLaunchOptions,browserContextOptions } from '/workspace/hydra-v301-production/web/tests/browser-environment.mjs';
import { installPrivacyGuard } from '/workspace/hydra-v301-production/web/tests/privacy-network.mjs';

const require=createRequire(import.meta.url);
const XLSX=require('/workspace/hydra-v301-production/web/vendor/sheetjs-0.20.3/xlsx.full.min.js');
const base='https://anzarsajid91.github.io/ICM_Graphing_Tool/';
const sha='ccc36427c12f003e5d9b1fee61632770b31952cc';
const name=process.env.ICM_BROWSER||'chromium';
const browser=await {chromium,firefox}[name].launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000}});
const guard=installPrivacyGuard(context,base,{buildToken:sha,canaries:['A-TECH','FM01','FM02']});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const proof={browser:browser.version(),errors};
try {
 await guard.navigate(page,base);
 assert.equal(await page.locator('meta[name="icm-build-sha"]').getAttribute('content'),sha);
 proof.identity=sha;
 await page.getByRole('link',{name:'Open Data / time series'}).click();
 function fdv(monitor){
   return {name:monitor+'.FDV',mimeType:'text/plain',buffer:Buffer.from(
     '**IDENTIFIER: 1,'+monitor+'\n**FIELD: 3,FLOW,DEPTH,VELOCITY\n**UNITS: 3,m3/s,m,m/s\n**CONSTANTS: 2,START,INTERVAL\n*CSTART\n2601050000 1\n*CEND\n'+
     '0.1 0.2 0.5\n'.repeat(5))};
 }
 const files=[fdv('FM01'),fdv('FM02')];
 for(const file of files)await writeFile(new URL(file.name,import.meta.url),file.buffer);
 await page.setInputFiles('#fileInput',files);
 await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===2,null,{timeout:90000});
 const workbook=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
   ['FDV_Name','RG','Pipe Diameter (mm)','Upstream Trace'],
   ['FM02','RG01',600,'FM01'],
   ['FM01','RG01',450,'']
 ]),'Associations');
 const buffer=Buffer.from(XLSX.write(workbook,{type:'array',bookType:'xlsx'}));
 await writeFile(new URL('A-TECH-survey-associations.xlsx',import.meta.url),buffer);
 await page.setInputFiles('#assocFileInput',{name:'fm_rg_assoc.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
 await page.waitForFunction(()=>window.__ICM_WORKBENCH__.survey.association?.records?.length===2,null,{timeout:90000});
 const showBalance=async()=>{
   await page.locator('.pw-primary-nav [data-workspace="survey"]').click();
   await page.getByRole('tab',{name:'Volume balance',exact:true}).click();
 };
 const run=async()=>{
   await page.click('#runSurveyBalanceBtn');
   await page.waitForFunction(()=>Boolean(window.__ICM_WORKBENCH__.survey.balance&&window.__ICM_WORKBENCH__.surveyFresh('balance')),null,{timeout:90000});
   return page.evaluate(()=>window.__ICM_WORKBENCH__.survey.balance);
 };
 await showBalance();
 proof.before=await run();
 await page.locator('.pw-primary-nav [data-workspace="spills"]').click();
 await page.locator('#addExclusionBtn').click();
 const row=page.locator('#exclusionRows .ex-row').last();
 for(const [field,value] of [['start','2026-01-05T00:00'],['end','2026-01-05T00:02'],['reason','A-TECH-synthetic sensor outage']]){
   await row.locator('[data-field="'+field+'"]').fill(value);
   await row.locator('[data-field="'+field+'"]').press('Tab');
 }
 await row.locator('[data-field="scope"]').selectOption('survey:monitor:FM01:flow');
 await showBalance();
 proof.upstreamExcluded=await run();
 proof.rendered=await page.locator('#surveyBalancePanel').innerText();
 await page.locator('.pw-primary-nav [data-workspace="spills"]').click();
 await row.locator('[data-field="scope"]').selectOption('survey:monitor:FM02:flow');
 await showBalance();
 proof.downstreamExcluded=await run();
 proof.downstreamRendered=await page.locator('#surveyBalancePanel').innerText();
 proof.expected={duration:240,rawVolumeEach:24,commonSeconds:120,commonVolumeEach:12,commonRatio:1};
 assert.deepEqual(errors,[]);
 guard.assertClean();
 proof.guard='pass';
 console.log(JSON.stringify({before:proof.before.rows,upstreamExcluded:proof.upstreamExcluded.rows,downstreamExcluded:proof.downstreamExcluded.rows},null,2));
} catch(error) {
 proof.failure=String(error);proof.at=error.stack;
 try{proof.visibleText=(await page.locator('body').innerText({timeout:2000})).slice(-10000);}catch{}
 try{guard.assertClean();proof.guard='pass';}catch(guardError){proof.guard=String(guardError);}
 console.error(error);
 process.exitCode=1;
} finally {
 await writeFile(new URL('observations-'+name+'-survey.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');
 await browser.close();
}
