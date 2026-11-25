import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
try{
  const context=await browser.newContext({...browserContextOptions(),viewport:{width:1024,height:800},acceptDownloads:true});
  const guard=installPrivacyGuard(context,base),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await guard.navigate(page,base);
  const workspace=name=>page.locator('.pw-primary-nav [data-workspace="'+name+'"]').click();
  async function chooser(button,id){
    await button.focus();
    const [picker]=await Promise.all([page.waitForEvent('filechooser'),button.press('Enter')]);
    assert.equal(await picker.element().getAttribute('id'),id);
    return picker;
  }
  await workspace('network');
  const network=await chooser(page.locator('#nsStartImport'),'nsLoadInput');
  await network.setFiles({name:'invalid-network.json',mimeType:'application/json',buffer:Buffer.from('not JSON')});
  await page.waitForFunction(()=>document.querySelector('#nsLoadInput').value==='');
  await page.locator('#nsStartImport').waitFor();
  await workspace('survey');
  const cards=page.locator('#surveyReviewReadiness');
  for(const [label,id] of [['Load association workbook','assocFileInput'],['Add FDV monitor files','fileInput'],['Add rainfall R files','fileInput']]){
    const picker=await chooser(cards.getByRole('button',{name:label}),id);
    await picker.setFiles([]);
  }
  await workspace('graphs');
  const datasets=await chooser(page.locator('#comparisonInputAction'),'fileInput');
  function file(name,minutes){
    const lines=minutes.map(i=>'2026-01-01 00:'+String(i).padStart(2,'0')+':00,0.1');
    return {name,mimeType:'text/csv',buffer:Buffer.from(['Time,Flow (m3/s)',...lines].join('\n'))};
  }
  await datasets.setFiles([file('Observed-synthetic.csv',[0,1,2,3]),file('Model-synthetic.csv',[0,1,2,3])]);
  await page.waitForFunction(()=>[...state.files.values()].filter(item=>item.status==='ready').length===2,null,{timeout:90000});
  await workspace('graphs');
  await page.locator('#comparisonInputAction').click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'observedSelect');
  await page.locator('#guidedImportReview summary').click();
  const review=page.locator('#guidedImportReview');
  await review.getByRole('combobox',{name:/Role for Observed-synthetic/}).selectOption('observed');
  await review.getByRole('combobox',{name:/Role for Model-synthetic/}).selectOption('model');
  await review.getByRole('button',{name:'Apply suggested setup'}).click();
  await page.locator('#timeBasisConfirmed').check();
  await page.locator('#applyMappingBtn').click();
  await page.waitForFunction(()=>state.mapping.observed&&state.mapping.models.length===1);
  await workspace('graphs');
  assert(await page.locator('#comparisonInputAction').isHidden());
  await page.locator('#analysisEnd').fill('2026-01-01T00:04');
  await page.locator('#runCompareBtn').click();
  await page.waitForFunction(()=>state.comparisonSnapshot?.results?.[0]?.result?.coverage?.requested_seconds===240,null,{timeout:90000});
  await workspace('reports');
  await page.getByLabel('Report template',{exact:true}).selectOption('verification');
  const card=page.locator('#reportReadinessGrid [data-result="comparison"]');
  await card.getByRole('button',{name:'Review Comparison'}).waitFor();
  assert.equal(await card.locator('strong').innerText(),'Partial');
  const reason=await card.locator('small').innerText();
  assert.match(reason,/Joint time support 180 s of 240 s requested/);
  assert.match(await page.locator('[data-result="survey-association"] small').innerText(),/Omitted from this report/);
  const dir=process.env.ICM_EVIDENCE_DIR;
  if(dir){
    await fs.mkdir(dir,{recursive:true});
    await page.locator('#reportReadinessGrid').screenshot({path:dir+'/'+engine+'-prepared.png'});
  }
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:90000}),page.locator('#downloadReportBtn').click()]);
  const html=await fs.readFile(await download.path(),'utf8');
  assert(html.includes('<dt>Comparison · Partial</dt><dd>'+reason+'</dd>'));
  assert(!html.includes('<dt>Survey association'));
  await card.getByRole('button',{name:'Review Comparison'}).click();
  await page.locator('#verificationEvidenceStatus').waitFor();
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('Prerequisite recovery and scoped report basis passed in '+engine+': '+reason);
}finally{await browser.close();}
