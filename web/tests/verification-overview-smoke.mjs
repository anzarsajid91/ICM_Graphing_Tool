import {trackControls} from './control-evidence.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (process.env.ICM_BROWSER==='firefox'?firefox:chromium).launch(browserLaunchOptions());
let writeControlEvidence;
try{
  const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1050},acceptDownloads:true});
  const page=await context.newPage(),privacy=installPrivacyGuard(context,base);
  writeControlEvidence=await trackControls(page.context(),'verification-overview-smoke-control-evidence.json');
  const evidence=process.env.ICM_EVIDENCE_DIR;
  if(evidence)await fs.mkdir(evidence,{recursive:true});
  await privacy.navigate(page,base);
  await page.getByRole('link',{name:'Start verification'}).click();
  const summary=page.locator('#verificationEvidenceStatus');
  assert.match(await summary.textContent(),/Run an observed and modelled comparison/);
  await page.locator('.pw-primary-nav [data-workspace="data"]').click();
  function file(name, shift){
    const rows=[0,1,2,3].map(i=>'2026-01-01 00:0'+i+':00,'+(0.2+i*0.01+shift));
    return {name,mimeType:'text/csv',buffer:Buffer.from(['Time,Flow (m3/s)',...rows,''].join('\n'))};
  }
  await page.setInputFiles('#fileInput',[file('Observed-synthetic.csv',0),file('Model-synthetic.csv',.01)]);
  await page.waitForFunction(()=>[...state.files.values()].filter(item=>item.status==='ready').length===2,null,{timeout:60000});
  await page.locator('#guidedImportReview summary').click();
  const review=page.locator('#guidedImportReview');
  await review.getByRole('combobox',{name:/Role for Observed-synthetic/}).waitFor();
  assert.match(await review.locator('tbody').textContent(),/Observed-synthetic.*flow/i);
  for(const width of [1440,1024,768]){
    await page.setViewportSize({width,height:1050});
    const clipped=await review.locator('th').evaluateAll(headers=>headers
      .filter(header=>header.scrollWidth>header.clientWidth+1)
      .map(header=>header.textContent));
    assert.deepEqual(clipped,[],`Import Review column headings fit at ${width}px`);
  }
  await page.setViewportSize({width:1440,height:1050});
  await review.getByRole('combobox',{name:/Role for Observed-synthetic/}).selectOption('observed');
  await review.getByRole('combobox',{name:/Role for Model-synthetic/}).selectOption('model');
  if(evidence){await review.scrollIntoViewIfNeeded();await page.screenshot({path:evidence+'/import-review.png'});}
  const before=await page.evaluate(()=>JSON.stringify(state.mapping));
  await review.getByRole('button',{name:'Apply suggested setup'}).click();
  assert.match(await page.locator('#guidedImportStatus').textContent(),/Selections staged/);
  assert.equal(await page.evaluate(()=>JSON.stringify(state.mapping)),before);
  await page.locator('#timeBasisConfirmed').check();
  await page.locator('#applyMappingBtn').click();
  await page.waitForFunction(()=>state.mapping.observed&&state.mapping.models.length===1);
  await page.evaluate(()=>window.__ICM_WORKBENCH__.ensureTimeSeriesComparisonMetrics());
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('graphs','overview'));
  const row=page.locator('#verificationEvidenceTable tbody tr');
  assert.match(await summary.textContent(),/Current evidence/);
  assert.match(await row.textContent(),/0\.01/);
  await page.getByLabel('Decision').selectOption('Requires investigation');
  await page.getByLabel('Review comments').fill('Synthetic check');
  await page.getByRole('button',{name:'Save engineer review'}).click();
  assert.match(await row.textContent(),/Requires investigation/);
  const evidencePanel=page.locator('.hb-review-grid article'),reviewPanel=page.locator('.hb-review-tools');
  const wideEvidence=await evidencePanel.boundingBox(),wideReview=await reviewPanel.boundingBox();
  assert.ok(wideReview.x>=wideEvidence.x+wideEvidence.width-1,'Verification review docks beside evidence');
  if(evidence)await page.screenshot({path:evidence+'/verification-review.png'});
  await page.setViewportSize({width:920,height:900});
  const narrowEvidence=await evidencePanel.boundingBox(),narrowReview=await reviewPanel.boundingBox();
  assert.ok(narrowReview.y>=narrowEvidence.y+narrowEvidence.height-1,'Verification review stacks below the evidence');
  await page.setViewportSize({width:1024,height:800});
  const saved=await page.evaluate(()=>workspaceObject());
  assert.equal(saved.verification_reviews.length,1);
  assert.equal(saved.verification_reviews[0].comments,'Synthetic check');
  assert.equal(await page.evaluate(()=>window.__ICM_WORKBENCH__.verificationReviews.report().length),1);
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('reports','report-generation'));
  const template=page.getByLabel('Report template',{exact:true});
  await template.selectOption('verification');
  assert.equal(await page.locator('#reportIncludeTimeSeries').isChecked(),true);
  assert.equal(await page.locator('#reportIncludeSpillsStorage').isChecked(),false);
  assert.equal(await page.locator('#reportIncludeSurvey').isChecked(),false);
  assert.equal(await page.locator('#reportSectionList li').first().getAttribute('data-report-section'),'comparison');
  await page.getByRole('button',{name:'Move Comparison diagnostics later',exact:true}).click();
  assert.equal(await page.locator('#reportSectionList li').first().getAttribute('data-report-section'),'time-series');
  await page.getByRole('button',{name:'Move Comparison diagnostics earlier',exact:true}).click();
  assert.equal(await page.locator('#reportSectionList li').first().getAttribute('data-report-section'),'comparison');
  const reportSettings=await page.evaluate(()=>workspaceObject());
  assert.equal(reportSettings.report_options.section_order[0],'comparison');
  await page.getByRole('button',{name:'Preview assessment report',exact:true}).click();
  const preview=page.getByRole('dialog',{name:'Assessment report preview'});
  await preview.waitFor({timeout:90000});
  const document=preview.frameLocator('iframe');
  await document.locator('#assessment-time-graph .main-svg').first().waitFor({timeout:30000});
  assert.match(await document.locator('main').innerText(),/Synthetic check/);
  const [previewDownload]=await Promise.all([page.waitForEvent('download'),preview.getByRole('button',{name:'Download preview',exact:true}).click()]);
  const previewHtml=await fs.readFile(await previewDownload.path(),'utf8');
  assert(previewHtml.indexOf('Observed vs modelled comparison')<previewHtml.indexOf('Full time-period graph'));
  assert(!previewHtml.includes('<h2>Spill / EDM assessment</h2>'));
  await preview.getByRole('button',{name:'Close',exact:true}).click();
  await preview.waitFor({state:'hidden'});
  await template.selectOption('general');
  await page.evaluate(async workspace=>{await applyWorkspace(workspace);},reportSettings);
  assert.equal(await page.locator('#reportSectionList li').first().getAttribute('data-report-section'),'comparison');
  assert.equal(await page.locator('#reportIncludeSpillsStorage').isChecked(),false);
  const downloaded=page.waitForEvent('download');
  await page.locator('#downloadReportBtn').click();
  const report=await fs.readFile(await (await downloaded).path(),'utf8');
  assert.match(report,/Verification engineer review/);
  assert.match(report,/Requires investigation/);
  assert.match(report,/Synthetic check/);
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('graphs','overview'));

  await page.evaluate(()=>window.__ICM_WORKBENCH__.verificationReviews.restore([]));
  assert.match(await row.textContent(),/Not reviewed/);
  await page.evaluate(async workspace=>{
    await applyWorkspace(workspace);
    await window.__ICM_WORKBENCH__.ensureTimeSeriesComparisonMetrics();
    window.__ICM_PRECISION_WORKBENCH__.navigate('graphs','overview');
  },saved);
  assert.match(await row.textContent(),/Requires investigation/);

  await page.evaluate(()=>{
    document.querySelector('#gapInput').value='120';
    window.__ICM_PRECISION_WORKBENCH__.navigate('graphs','overview');
  });
  assert.match(await summary.textContent(),/Stale evidence/);
  assert.match(await row.textContent(),/Stale review/);
  assert.equal(await page.evaluate(()=>window.__ICM_WORKBENCH__.verificationReviews.report().length),0);
  assert.equal(await page.getByRole('button',{name:'Save engineer review'}).isDisabled(),true);
  await page.evaluate(()=>{
    // Insert an already-qualified synthetic rainfall window to exercise the
    // hydraulic event workflow independently of rainfall qualification.
    state.rainEvents=[{start:'2026-01-01T00:00:00',end:'2026-01-01T00:03:00',total_depth_mm:6}];
    state.rainEventResult={count:1};
    state.rainEventSignature=rainEventInputSignature();
    window.__ICM_PRECISION_WORKBENCH__.navigate('graphs','events');
  });
  await page.getByRole('button',{name:'Compare selected event'}).click();
  await page.waitForFunction(()=>document.querySelector('#verificationEventResult').textContent.includes('Observed volume'));
  const event=await page.locator('#verificationEventResult').textContent();
  assert.match(event,/38\.7 m³.*Observed volume/);
  assert.match(event,/40\.5 m³.*Modelled volume/);
  assert.match(event,/0\.01 m³\/s.*Peak error/);
  await page.locator('button[data-workspace="home"]').click();
  const resumeEvent=page.locator('#hbRecentWork').getByRole('button',{name:'Verification · Event Review',exact:true});
  await resumeEvent.click();
  await page.waitForFunction(()=>document.querySelector('#verificationEventResult').textContent.includes('Observed volume'));
  assert.equal(await page.locator('#verificationEventResult').textContent(),event);
  await page.getByRole('button',{name:'Open event in Time Series'}).click();
  await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__.route().workspace==='data'&&
    JSON.stringify(window.__ICM_WORKBENCH__.uiV2.graphRange)===JSON.stringify(['2026-01-01T00:00:00','2026-01-01T00:03:00']));
  await page.locator('#clearPoolBtn').click();
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().files===0);
  await page.locator('button[data-workspace="home"]').click();await resumeEvent.click();
  assert(await page.getByRole('button',{name:'Compare selected event'}).isDisabled());
  assert(!/Observed volume/.test(await page.locator('#verificationEventResult').textContent()));
  privacy.assertClean();
  console.log('Verification overview rendered authoritative metrics and blocked review of stale evidence.');
}finally{try{await writeControlEvidence?.();}finally{await browser.close();}}
