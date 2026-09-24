import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);

const root=process.cwd();
const baseUrl=(process.env.ICM_BASE_URL||'http://127.0.0.1:8000/').replace(/\/?$/,'/');
const liveMode=Boolean(process.env.ICM_BASE_URL);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,timezoneId:'Asia/Kolkata'});
const page=await context.newPage();
const consoleErrors=[];
const failedRequests=[];
let stage='startup';
page.on('pageerror',e=>consoleErrors.push(`pageerror: ${String(e)}`));
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(`console: ${m.text()}`);});
page.on('requestfailed',r=>failedRequests.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText||'failed'}`));

async function optionValue(selector,needle){return page.locator(`${selector} option`).evaluateAll((opts,n)=>opts.find(x=>x.textContent.includes(n))?.value||'',needle);}
const routeAliases={
  'verification/comparison':['graphs','comparison'],
  'verification/rating':['graphs','rating'],
  'verification/dwf':['graphs','dwf'],
  'verification/storage':['spills','storage'],
  'rainfall/events':['survey','rainfall-check'],
  'survey/data-health':['survey','fdv-check'],
  'survey/rainfall-response':['survey','rainfall-check'],
  'survey/flow-continuity':['survey','volume-balance'],
  'spills/thresholds':['spills','assessment'],
  'spills/results':['spills','assessment'],
  'report/builder':['reports','report-generation'],
  'report/workspace':['reports','workspace'],
};
async function precisionRoute(workspace,subpage){
  await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__?.navigate),null,{timeout:30000});
  const expected=routeAliases[workspace+'/'+subpage]||[workspace,subpage];
  await page.evaluate(([w,p])=>window.__ICM_PRECISION_WORKBENCH__.navigate(w,p,false),[workspace,subpage]);
  await page.waitForFunction(([w,p])=>{const r=window.__ICM_PRECISION_WORKBENCH__?.route?.();return r?.workspace===w&&r?.page===p;},expected);
}
async function clickTab(name){
  const routes={
    graph:['data','time-series'],
    compare:['graphs','comparison'],
    'rain-events':['survey','rainfall-check'],
    'data-health':['survey','fdv-check'],
    spills:['spills','assessment'],
    storage:['spills','storage'],
    workspace:['reports','report-generation']
  };
  const next=routes[name];
  if(next){await precisionRoute(next[0],next[1]);return;}
  await page.locator(`[data-tab="${name}"]`).evaluate(el=>el.click());
}
async function downloadFrom(selector){const pending=page.waitForEvent('download');await page.click(selector);return pending;}
async function filePayload(filePath,name=path.basename(filePath)){return {name,mimeType:'text/csv',buffer:await fs.readFile(filePath)};}
async function captureEvidence(name){
  const dir=process.env.ICM_EVIDENCE_DIR;
  if(!dir)return;
  await fs.mkdir(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,`${name}.png`),fullPage:false});
  await page.screenshot({path:path.join(dir,`${name}-full.png`),fullPage:true});
}
const performanceEvidence={schema_version:2,build:process.env.GITHUB_SHA||'local',mode:liveMode?'live':'local-artifact'};
async function writePerformanceEvidence(){
  const dir=process.env.ICM_EVIDENCE_DIR;
  if(!dir)return;
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'fastpath-performance.json'),JSON.stringify(performanceEvidence,null,2)+'\n','utf8');
}
async function measureColdReferenceImport(){
  if(liveMode)return null;
  const probe=await context.newPage();
  const sourcePath=path.join(root,'reference/current-tool/sample-data/fdv/FM01.fdv');
  const buffer=await fs.readFile(sourcePath);
  const navigationStart=Date.now();
  try{
    await probe.goto(baseUrl+'?cold_import='+Date.now(),{waitUntil:'domcontentloaded'});
    const domReadyMs=Date.now()-navigationStart;
    const selectedAt=Date.now();
    await probe.setInputFiles('#fileInput',{name:'Cold-FM01.fdv',mimeType:'text/plain',buffer});
    const outcome=await Promise.race([
      probe.waitForSelector('#timeChart .main-svg',{state:'attached',timeout:60000}).then(()=>({kind:'graph',ms:Date.now()-selectedAt})),
      probe.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes('Cold-FM01.fdv')&&row.textContent.includes('Error')),null,{timeout:60000}).then(()=>({kind:'error',ms:Date.now()-selectedAt}))
    ]);
    const previewEvidence=await probe.evaluate(()=>({
      engineStatus:window.__ICM_WORKBENCH__?.status||null,
      graphMode:window.__ICM_WORKBENCH__?.lastGraphMode||null,
      route:window.__ICM_PRECISION_WORKBENCH__?.route?.()||null,
      preview:window.__ICM_WORKBENCH__?.fastpathPreview||null,
      record:window.__ICM_WORKBENCH__?.fastpath?.last||null,
      row:[...document.querySelectorAll('#poolBody tr')].find(row=>row.textContent.includes('Cold-FM01.fdv'))?.textContent||null
    }));
    let engineReadyFromNavigationMs=null;
    try{
      await probe.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='ready',null,{timeout:120000});
      engineReadyFromNavigationMs=Date.now()-navigationStart;
    }catch{}
    await probe.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes('Cold-FM01.fdv')&&row.textContent.includes('Ready')),null,{timeout:60000});
    const finalEvidence=await probe.evaluate(()=>({
      record:window.__ICM_WORKBENCH__?.fastpath?.last||null,
      reconciliation:window.__ICM_WORKBENCH__?.fastpath?.last?.reconciliation||null,
      row:[...document.querySelectorAll('#poolBody tr')].find(row=>row.textContent.includes('Cold-FM01.fdv'))?.textContent||null
    }));
    return {dataset:'FM01.fdv',bytes:buffer.length,domReadyMs,selectionOutcome:outcome.kind,timeToOutcomeMs:outcome.ms,
      engineReadyFromNavigationMs,selectionAtFromNavigationMs:selectedAt-navigationStart,previewEvidence,finalEvidence};
  }finally{
    await probe.close();
  }
}
async function measureFreshFastPathImport({dataset,relativePath,sourcePath,inputName,mimeType='text/csv',archiveMember=null,timeoutMs=120000}){
  if(liveMode)return null;
  const probe=await context.newPage();
  const resolvedPath=sourcePath||path.join(root,relativePath);
  const sourceStat=await fs.stat(resolvedPath);
  const usePathUpload=sourceStat.size>50*1024*1024;
  const buffer=usePathUpload?null:await fs.readFile(resolvedPath);
  const navigationStart=Date.now();
  try{
    await probe.goto(baseUrl+'?fresh_fastpath='+encodeURIComponent(dataset)+'&t='+Date.now(),{waitUntil:'domcontentloaded'});
    const domReadyMs=Date.now()-navigationStart;
    const selectedAt=Date.now();
    await probe.setInputFiles('#fileInput',usePathUpload?resolvedPath:{name:inputName,mimeType,buffer});
    const outcome=await Promise.race([
      probe.waitForSelector('#timeChart .main-svg',{state:'attached',timeout:60000}).then(()=>({kind:'graph',ms:Date.now()-selectedAt})),
      probe.waitForFunction(name=>[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes(name)&&row.textContent.includes('Error')),inputName,{timeout:60000}).then(()=>({kind:'error',ms:Date.now()-selectedAt}))
    ]);
    const previewEvidence=await probe.evaluate(name=>({
      engineStatus:window.__ICM_WORKBENCH__?.status||null,
      graphMode:window.__ICM_WORKBENCH__?.lastGraphMode||null,
      route:window.__ICM_PRECISION_WORKBENCH__?.route?.()||null,
      preview:window.__ICM_WORKBENCH__?.fastpathPreview||null,
      record:window.__ICM_WORKBENCH__?.fastpath?.last||null,
      row:[...document.querySelectorAll('#poolBody tr')].find(row=>row.textContent.includes(name))?.textContent||null
    }),inputName);
    let engineReadyFromNavigationMs=null;
    try{
      await probe.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='ready',null,{timeout:timeoutMs});
      engineReadyFromNavigationMs=Date.now()-navigationStart;
    }catch{}
    await probe.waitForFunction(name=>[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes(name)&&row.textContent.includes('Ready')),inputName,{timeout:timeoutMs});
    const finalEvidence=await probe.evaluate(()=>({
      record:window.__ICM_WORKBENCH__?.fastpath?.last||null,
      reconciliation:window.__ICM_WORKBENCH__?.fastpath?.last?.reconciliation||null
    }));
    return {dataset,archiveMember,bytes:sourceStat.size,uploadMode:usePathUpload?'path':'buffer',domReadyMs,selectionOutcome:outcome.kind,timeToOutcomeMs:outcome.ms,
      engineReadyFromNavigationMs,selectionAtFromNavigationMs:selectedAt-navigationStart,previewEvidence,finalEvidence};
  }finally{await probe.close();}
}
async function extractFirstModelReference(){
  const zipPath=path.join(root,'reference/current-tool/sample-data/other/StationA_Modelled Data.zip');
  const targetDir=await fs.mkdtemp(path.join(os.tmpdir(),'icm-model-reference-'));
  const script=[
    'import pathlib,sys,zipfile',
    'archive=pathlib.Path(sys.argv[1]); target_dir=pathlib.Path(sys.argv[2])',
    'with zipfile.ZipFile(archive) as z:',
    '    members=[m for m in z.infolist() if not m.is_dir() and m.filename.lower().endswith((".csv",".hyd")) and "__MACOSX" not in m.filename]',
    '    if not members: raise SystemExit("No CSV/HYD model members found")',
    '    member=members[0]',
    '    suffix=pathlib.Path(member.filename).suffix.lower() or ".csv"',
    '    target=target_dir/("StationA_Modelled_First"+suffix)',
    '    target.write_bytes(z.read(member))',
    '    print(target)',
    '    print(member.filename,file=sys.stderr)',
  ].join('\n');
  const {stdout,stderr}=await execFileAsync('python',['-c',script,zipPath,targetDir],{maxBuffer:1024*1024});
  return {sourcePath:stdout.trim(),archiveMember:stderr.trim(),inputName:path.basename(stdout.trim())};
}

async function verifyClearDuringPendingImport(){
  if(liveMode)return null;
  const probe=await context.newPage(),probeErrors=[];
  probe.on('pageerror',error=>probeErrors.push('pageerror: '+String(error)));
  probe.on('console',message=>{if(message.type()==='error')probeErrors.push('console: '+message.text());});
  try{
    await probe.goto(baseUrl+'?pending_clear='+Date.now(),{waitUntil:'domcontentloaded'});
    await probe.waitForFunction(()=>document.querySelector('#engineStatus')?.textContent.includes('Initialising advanced analysis'),null,{timeout:30000});
    const payload=Buffer.from([
      'timestamp,Depth (m)',
      '2026-02-01T00:00:00,0.2',
      '2026-02-01T00:01:00,0.3',
      ''
    ].join('\n'),'utf8');
    await probe.setInputFiles('#fileInput',{name:'pending-clear.csv',mimeType:'text/csv',buffer:payload});
    await probe.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes('pending-clear.csv')&&row.textContent.includes('Preview ready')),null,{timeout:30000});
    const before=await probe.evaluate(()=>({
      rows:document.querySelectorAll('#poolBody tr').length,
      engineStatus:document.querySelector('#engineStatus')?.textContent||null
    }));
    await probe.locator('#clearPoolBtn').evaluate(el=>el.click());
    await probe.waitForFunction(()=>document.querySelectorAll('#poolBody tr').length===0,null,{timeout:30000});
    await probe.waitForFunction(()=>/ready/i.test(document.querySelector('#engineStatus')?.textContent||''),null,{timeout:30000});
    await probe.waitForTimeout(1500);
    const after=await probe.evaluate(()=>({
      rows:document.querySelectorAll('#poolBody tr').length,
      registrySources:window.ICMProjectRegistry?.snapshot()?.sources?.length??null,
      observedOptions:[...document.querySelectorAll('#observedSelect option')].map(o=>o.textContent),
      sourcePool:window.__ICM_WORKBENCH__?.sourcePool||null,
      errors:window.__ICM_WORKBENCH__?.errors||[]
    }));
    if(after.rows!==0||after.registrySources!==0||after.observedOptions.some(x=>x.includes('pending-clear.csv'))){
      throw new Error('Cleared pending import reappeared after authoritative engine readiness: '+JSON.stringify({before,after}));
    }
    const materialErrors=probeErrors.filter(x=>!x.includes('favicon.ico'));
    if(materialErrors.length)throw new Error('Pending-clear probe console/page errors: '+materialErrors.join(' | '));
    return {before,after};
  }finally{await probe.close();}
}

async function verifyRestartDuringPendingImport(){
  if(liveMode)return null;
  const probe=await context.newPage(),probeErrors=[];
  probe.on('pageerror',error=>probeErrors.push('pageerror: '+String(error)));
  probe.on('console',message=>{if(message.type()==='error')probeErrors.push('console: '+message.text());});
  try{
    await probe.goto(baseUrl+'?pending_restart='+Date.now(),{waitUntil:'domcontentloaded'});
    await probe.waitForFunction(()=>/ready/i.test(document.querySelector('#engineStatus')?.textContent||''),null,{timeout:30000});
    const basePayload=Buffer.from([
      'timestamp,Depth (m)',
      '2026-02-01T00:00:00,0.2',
      '2026-02-01T00:01:00,0.3',
      ''
    ].join('\n'),'utf8');
    await probe.setInputFiles('#fileInput',{name:'restart-base.csv',mimeType:'text/csv',buffer:basePayload});
    await probe.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes('restart-base.csv')&&row.textContent.includes('Ready')),null,{timeout:30000});

    const pendingPath=path.join(root,'reference/current-tool/sample-data/other/StationA_EDM.csv');
    await probe.setInputFiles('#fileInput',pendingPath);
    await probe.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes('StationA_EDM.csv')&&row.textContent.includes('Preview ready')),null,{timeout:30000});
    await probe.evaluate(async()=>{
      if(typeof window.cancelCurrentOperation!=='function')throw new Error('cancelCurrentOperation is not available to the browser acceptance probe');
      await window.cancelCurrentOperation();
    });
    await probe.waitForFunction(()=>/ready/i.test(document.querySelector('#engineStatus')?.textContent||''),null,{timeout:30000});
    await probe.waitForFunction(()=>![...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes('StationA_EDM.csv')),null,{timeout:30000});
    await probe.waitForTimeout(1000);
    const result=await probe.evaluate(()=>({
      rows:[...document.querySelectorAll('#poolBody tr')].map(row=>row.textContent),
      registrySources:(window.ICMProjectRegistry?.snapshot()?.sources||[]).map(x=>x.name),
      sourcePool:window.__ICM_WORKBENCH__?.sourcePool||null,
      errors:window.__ICM_WORKBENCH__?.errors||[]
    }));
    if(result.rows.length!==1||!result.rows[0].includes('restart-base.csv')||result.registrySources.length!==1||!result.registrySources[0].includes('restart-base.csv')){
      throw new Error('Worker restart did not retain only authoritative-ready sources: '+JSON.stringify(result));
    }
    const materialErrors=probeErrors.filter(x=>!x.includes('favicon.ico'));
    if(materialErrors.length)throw new Error('Pending-restart probe console/page errors: '+materialErrors.join(' | '));
    return result;
  }finally{await probe.close();}
}

async function verifyFastPathFailureFallsBack(){
  if(liveMode)return null;
  const probe=await context.newPage(),probeConsole=[],probePageErrors=[],probeFailedRequests=[];
  probe.on('console',message=>{if(message.type()==='error')probeConsole.push(message.text());});
  probe.on('pageerror',error=>probePageErrors.push(String(error)));
  probe.on('requestfailed',request=>probeFailedRequests.push(request.url()+' :: '+(request.failure()?.errorText||'failed')));
  try{
    await probe.route('**/assets/fastpath-worker.js*',route=>route.fulfill({
      status:200,
      contentType:'text/javascript',
      body:'throw new Error("forced FastPath worker failure");'
    }));
    await probe.goto(baseUrl+'?fastpath_failure_fallback='+Date.now(),{waitUntil:'domcontentloaded'});
    // "No files loaded." exists in static HTML, so it cannot prove runtime.start()
    // has executed. engineStatus is changed only after wireEvents() attaches the
    // import handlers, making this a deterministic readiness boundary.
    await probe.waitForFunction(()=>document.querySelector('#engineStatus')?.textContent.includes('Initialising advanced analysis'),null,{timeout:30000});
    const payload=Buffer.from(['timestamp,Depth (m)','2026-02-01T00:00:00,0.2','2026-02-01T00:01:00,0.3',''].join('\n'),'utf8');
    await probe.setInputFiles('#fileInput',{name:'fastpath-fallback.csv',mimeType:'text/csv',buffer:payload});
    try{
      await probe.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes('fastpath-fallback.csv')&&row.textContent.includes('Ready')),null,{timeout:120000});
    }catch(error){
      const state=await probe.evaluate(()=>({
        readyState:document.readyState,
        engineStatus:document.querySelector('#engineStatus')?.textContent||null,
        poolSummary:document.querySelector('#poolSummary')?.textContent||null,
        rows:[...document.querySelectorAll('#poolBody tr')].map(row=>row.textContent),
        selectedFiles:[...document.querySelector('#fileInput')?.files||[]].map(file=>({name:file.name,size:file.size})),
        diagnostic:window.__ICM_WORKBENCH__?{
          status:window.__ICM_WORKBENCH__.status,
          errors:window.__ICM_WORKBENCH__.errors,
          fastpathWarnings:window.__ICM_WORKBENCH__.fastpathWarnings,
          fastpath:window.__ICM_WORKBENCH__.fastpath,
          worker:window.__ICM_WORKBENCH__.worker,
          engineReadyAt:window.__ICM_WORKBENCH__.engineReadyAt,
          sourcePool:window.__ICM_WORKBENCH__.sourcePool,
          stateSummary:window.__ICM_WORKBENCH__.stateSummary?.()
        }:null
      }));
      throw new Error('FastPath fallback probe timed out: '+JSON.stringify({state,probeConsole,probePageErrors,probeFailedRequests,cause:String(error)}));
    }
    return await probe.evaluate(()=>({
      row:[...document.querySelectorAll('#poolBody tr')].find(row=>row.textContent.includes('fastpath-fallback.csv'))?.textContent||null,
      errors:window.__ICM_WORKBENCH__?.errors||[],
      parsed:[...document.querySelectorAll('#observedSelect option')].some(option=>option.textContent.trim()==='fastpath-fallback.csv — Depth (m)')
    }));
  }finally{await probe.close();}
}

async function verifyMixedSiblingImport(){
  const probe=await context.newPage(),probeErrors=[];
  probe.on('pageerror',error=>probeErrors.push(String(error)));
  try{
    await probe.goto(baseUrl+'?mixed_import='+Date.now(),{waitUntil:'domcontentloaded'});
    await probe.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='ready',null,{timeout:120000});
    const valid={name:'sibling-valid.csv',mimeType:'text/csv',buffer:Buffer.from('timestamp,Depth (m)\n2026-02-01T00:00:00,0.2\n2026-02-01T00:01:00,0.3\n')};
    const invalid={name:'sibling-invalid.fdv',mimeType:'text/plain',buffer:Buffer.from('this is not a valid FDV file\n')};
    await probe.setInputFiles('#fileInput',[valid,invalid]);
    await probe.waitForFunction(()=>document.querySelectorAll('#poolBody tr').length===2&&[...document.querySelectorAll('#poolBody tr')].some(r=>r.textContent.includes('sibling-valid.csv')&&r.textContent.includes('Ready'))&&[...document.querySelectorAll('#poolBody tr')].some(r=>r.textContent.includes('sibling-invalid.fdv')&&r.textContent.includes('Error')),null,{timeout:90000});
    const result=await probe.evaluate(()=>({
      rows:[...document.querySelectorAll('#poolBody tr')].map(r=>r.textContent),
      validMapped:[...document.querySelectorAll('#observedSelect option')].some(o=>o.textContent.includes('sibling-valid.csv')),
      summary:document.querySelector('#poolSummary')?.textContent||'',
    }));
    if(!result.validMapped||!result.summary.includes('1 parsed successfully'))throw new Error('Valid sibling did not remain usable after another file failed: '+JSON.stringify(result));
    if(probeErrors.length)throw new Error('Mixed sibling import produced browser errors: '+probeErrors.join(' | '));
    return result;
  }finally{await probe.close();}
}

async function inspectReportHtml(html,minFigures=1){
  const p=await context.newPage();
  const reportErrors=[],reportFailedRequests=[];
  p.on('pageerror',e=>reportErrors.push(`pageerror: ${String(e)}`));
  p.on('console',m=>{if(m.type()==='error')reportErrors.push(`console: ${m.text()}`);});
  p.on('requestfailed',r=>reportFailedRequests.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText||'failed'}`));
  try{
    const dir=process.env.ICM_EVIDENCE_DIR;
    if(dir){
      await fs.mkdir(dir,{recursive:true});
      await fs.writeFile(path.join(dir,`report-${minFigures}-figures.html`),html,'utf8');
    }
    await p.route('https://**/*',route=>route.abort());
    await p.setContent(html,{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>[...document.images].every(x=>x.complete),null,{timeout:30000});
    try{
      await p.waitForFunction(()=>[...document.querySelectorAll('.report-plot')].every(el=>el._fullLayout&&el.querySelector('.main-svg')),null,{timeout:60000});
    }catch(error){
      const plotState=await p.evaluate(()=>({
        readyState:document.readyState,
        plotlyType:typeof window.Plotly,
        plots:[...document.querySelectorAll('.report-plot')].map(el=>({
          id:el.id,
          width:el.getBoundingClientRect().width,
          height:el.getBoundingClientRect().height,
          fullLayout:Boolean(el._fullLayout),
          svg:Boolean(el.querySelector('.main-svg')),
          text:el.textContent?.slice(0,240)||'',
          payload:Boolean(document.getElementById(el.id+'-data')),
        })),
      }));
      throw new Error(`Offline report Plotly render failed: ${JSON.stringify({plotState,reportErrors,reportFailedRequests,cause:String(error)})}`);
    }
    const result=await p.evaluate((minFigures)=>{
      const root=document.documentElement;
      const figures=[...document.querySelectorAll('.figure img,.figure .report-plot')];
      const zero=figures.filter(x=>x.getBoundingClientRect().width<=0||x.getBoundingClientRect().height<=0).length;
      return {
        overflow:root.scrollWidth-root.clientWidth,
        figures:figures.length,
        zero,
        headers:document.querySelectorAll('.report-header').length,
        tables:document.querySelectorAll('.table-wrap').length,
        minFigures,
      };
    },minFigures);
    if(dir)await p.screenshot({path:path.join(dir,`report-${minFigures}-figures.png`),fullPage:true});
    await p.emulateMedia({media:'print'});
    const print=await p.evaluate(()=>{
      const root=document.documentElement;
      const figures=[...document.querySelectorAll('.figure img,.figure .report-plot')];
      const tableEscapes=[...document.querySelectorAll('.table-wrap')].filter(el=>el.scrollWidth>el.clientWidth+2).length;
      return {
        overflow:root.scrollWidth-root.clientWidth,
        zero:figures.filter(x=>x.getBoundingClientRect().width<=0||x.getBoundingClientRect().height<=0).length,
        tableEscapes,
        pageRule:[...document.styleSheets].some(sheet=>{try{return [...sheet.cssRules].some(rule=>rule.type===CSSRule.PAGE_RULE);}catch{return false;}}),
      };
    });
    if(print.overflow>2||print.zero||print.tableEscapes)throw new Error('Print-layout containment failed: '+JSON.stringify(print));
    if(dir)await p.pdf({path:path.join(dir,`report-${minFigures}-figures-print.pdf`),format:'A4',landscape:minFigures>=4,printBackground:true});
    await p.emulateMedia({media:'screen'});
    return {...result,print};
  }finally{await p.close();}
}
async function verifyStationAThresholdChain(){
  const probe=await context.newPage();
  const probeErrors=[];
  probe.on('pageerror',e=>probeErrors.push('pageerror: '+String(e)));
  probe.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon.ico'))probeErrors.push('console: '+m.text());});
  const nav=async(workspace,subpage)=>{
    await probe.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__?.navigate),null,{timeout:30000});
    await probe.evaluate(([w,p])=>window.__ICM_PRECISION_WORKBENCH__.navigate(w,p,false),[workspace,subpage]);
    await probe.waitForFunction(([w,p])=>{const r=window.__ICM_PRECISION_WORKBENCH__?.route?.();return r?.workspace===w&&r?.page===p;},[workspace,subpage]);
  };
  try{
    await probe.goto(baseUrl+'?station_a_threshold='+Date.now(),{waitUntil:'domcontentloaded'});
    await probe.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='ready',null,{timeout:120000});
    await probe.setInputFiles('#fileInput',[
      path.join(root,'reference/current-tool/sample-data/other/StationA_EDM.csv'),
      path.join(root,'reference/current-tool/sample-data/other/StationA_Rainfall.csv'),
    ]);
    await probe.waitForFunction(()=>['StationA_EDM.csv','StationA_Rainfall.csv'].every(name=>[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes(name)&&row.textContent.includes('Ready'))),null,{timeout:240000});
    await nav('data','series-mapping');
    const selected=await probe.evaluate(()=>{
      const obs=[...document.querySelectorAll('#observedSelect option')].find(o=>{
        if(!/StationA_EDM\.csv/i.test(o.textContent)||!o.value)return false;
        const mapped=mappingObject(o.value);
        return mapped&&['depth','level'].includes(String(seriesQuantity(mapped.item,mapped.col)||'').toLowerCase());
      });
      const rain=[...document.querySelectorAll('#rainSelect option')].find(o=>{
        if(!/StationA_Rainfall\.csv/i.test(o.textContent)||!o.value)return false;
        const mapped=mappingObject(o.value);
        return mapped&&String(seriesQuantity(mapped.item,mapped.col)||'').toLowerCase()==='rainfall';
      });
      const mapped=obs?.value?mappingObject(obs.value):null;
      return {observed:obs?.value||'',observedLabel:obs?.textContent||'',observedQuantity:mapped?seriesQuantity(mapped.item,mapped.col):null,observedUnit:mapped?seriesUnit(mapped.item,mapped.col):null,observedReference:mapped?seriesReference(mapped.item,mapped.col):null,rain:rain?.value||'',rainLabel:rain?.textContent||''};
    });
    if(!selected.observed||!selected.rain)throw new Error('Station A reference files did not expose an authoritative Level and rainfall mapping: '+JSON.stringify(selected));
    if(String(selected.observedQuantity).toLowerCase()!=='level'||selected.observedUnit!=='m'||selected.observedReference!=='AD')throw new Error('Station A HYD reference metadata must preserve Level · m · AD: '+JSON.stringify(selected));
    await probe.selectOption('#observedSelect',selected.observed);
    await probe.selectOption('#modelSelect',[]);
    await probe.selectOption('#rainSelect',selected.rain);
    await probe.click('#applyMappingBtn');
    await probe.waitForFunction(()=>document.querySelector('#timeChart')?.data?.length>0&&window.__ICM_WORKBENCH__?.lastGraphStatistics?.length>0,null,{timeout:120000});
    await nav('data','time-series');
    const support=await probe.evaluate(()=>{
      const row=(window.__ICM_WORKBENCH__.lastGraphStatistics||[]).find(x=>['depth','level'].includes(String(x.statistics?.quantity||'').toLowerCase()));
      return row?{quantity:row.statistics.quantity,unit:row.statistics.unit,min:Number(row.statistics.minimum),max:Number(row.statistics.maximum)}:null;
    });
    if(!support||!Number.isFinite(support.min)||!Number.isFinite(support.max)||support.max<support.min)throw new Error('Station A hydraulic support unavailable: '+JSON.stringify(support));
    const stationAxisTitle=await probe.evaluate(()=>document.querySelector('#timeChart')?.layout?.yaxis?.title?.text||'');
    if(!/Level/i.test(stationAxisTitle)||!/\(m\)/i.test(stationAxisTitle)||!/\bAD\b/i.test(stationAxisTitle))throw new Error('Station A hydraulic axis must identify Level, metre unit and AD reference: '+stationAxisTitle);
    const threshold=Number((support.min+(support.max-support.min)*0.6).toPrecision(10));
    await probe.fill('#graphObsThreshold',String(threshold));
    await probe.waitForFunction(value=>{
      const chart=document.querySelector('#timeChart');
      return (chart?.layout?.shapes||[]).some(s=>s.type==='line'&&s.yref!=='paper'&&Math.abs(Number(s.y0)-value)<1e-9);
    },threshold,{timeout:120000});
    const graphContext=(await probe.locator('#graphObsThresholdContext').textContent())||'';
    if(!new RegExp(support.quantity,'i').test(graphContext)||!/\bm\b/i.test(graphContext)||!/\bAD\b/i.test(graphContext))throw new Error('Station A graph threshold context must identify Level, unit and absolute datum: '+graphContext);
    await nav('spills','assessment');
    const controlValue=Number(await probe.inputValue('#obsThreshold'));
    if(Math.abs(controlValue-threshold)>1e-9)throw new Error('Station A threshold changed between Time Series and Spills: '+JSON.stringify({threshold,controlValue}));
    await probe.click('#runSpillsBtn');
    await probe.waitForFunction(()=>document.querySelector('#spillRunStatus')?.textContent.includes('Completed in'),null,{timeout:120000});
    const calcValue=await probe.evaluate(()=>Number(state.spillSnapshot?.config?.analysis?.observed_threshold));
    if(Math.abs(calcValue-threshold)>1e-9)throw new Error('Station A spill snapshot did not consume the graph threshold: '+JSON.stringify({threshold,calcValue}));
    await nav('reports','report-generation');
    await probe.uncheck('#reportIncludeComparison');
    await probe.uncheck('#reportIncludeSurvey');
    const pending=probe.waitForEvent('download');
    await probe.click('#downloadReportBtn');
    const download=await pending;
    const html=await fs.readFile(await download.path(),'utf8');
    const marker='<script type="application/json" id="assessment-time-graph-data">';
    const start=html.indexOf(marker),end=start>=0?html.indexOf('</script>',start+marker.length):-1;
    if(start<0||end<0)throw new Error('Station A report time-series payload missing.');
    const plot=JSON.parse(html.slice(start+marker.length,end));
    const reportThreshold=(plot.layout?.shapes||[]).find(s=>s.type==='line'&&s.yref!=='paper');
    if(!reportThreshold||Math.abs(Number(reportThreshold.y0)-threshold)>1e-9)throw new Error('Station A report threshold line differs from the configured/calculated threshold: '+JSON.stringify({threshold,reportThreshold}));
    const reportLevelAxis=plot.layout?.yaxis?.title?.text||'';
    if(!/Level/i.test(reportLevelAxis)||!/\(m\)/i.test(reportLevelAxis)||!/\bAD\b/i.test(reportLevelAxis))throw new Error('Station A report level axis must retain quantity, unit and AD reference: '+reportLevelAxis);
    if(!html.includes('Observed / EDM hydraulic threshold')||!html.includes(String(threshold))||!html.includes('AD'))throw new Error('Station A report settings do not record the configured Level threshold with its vertical reference.');
    const dir=process.env.ICM_EVIDENCE_DIR;
    if(dir){
      await fs.mkdir(dir,{recursive:true});
      await fs.writeFile(path.join(dir,'station-a-threshold-chain-report.html'),html,'utf8');
      await probe.screenshot({path:path.join(dir,'station-a-threshold-chain.png'),fullPage:true});
    }
    if(probeErrors.length)throw new Error('Station A probe browser errors: '+probeErrors.join(' | '));
    return {observed:selected.observedLabel,rain:selected.rainLabel,quantity:support.quantity,unit:support.unit,reference:selected.observedReference,threshold,controlValue,calcValue,reportValue:Number(reportThreshold.y0)};
  }finally{
    await probe.close();
  }
}

async function waitReady(){
  try{await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='ready'&&document.querySelector('#engineStatus')?.textContent.includes('ready'),null,{timeout:120000});}
  catch(err){const status=await page.locator('#engineStatus').textContent().catch(()=>'(missing)');const diag=await page.evaluate(()=>window.__ICM_WORKBENCH__||null).catch(()=>null);throw new Error(`Engine readiness failed. status=${status}; diagnostic=${JSON.stringify(diag)}; original=${err}`);}
}
function denseCsv(){
  const lines=['timestamp,level'];
  const base=Date.UTC(2026,0,1,0,0,0);
  for(let i=0;i<40000;i++){
    const stamp=new Date(base+i*60000).toISOString().replace('.000Z','');
    const level=(i%100>=25&&i%100<=45)?2.2:0.45;
    lines.push(`${stamp},${level}`);
  }
  return Buffer.from(lines.join('\n'),'utf8');
}
function rainfallR(values){
  return Buffer.from(`*CSTART\n2601010000 2601010006 2\n*CEND\n${values.join(' ')}\n`,'utf8');
}
function surveyFdv(monitor,flow,depth,velocity,count=200){
  const header=[
    `**IDENTIFIER: 1,${monitor}`,
    '**FIELD: 3,FLOW,DEPTH,VELOCITY',
    '**UNITS: 3,m3/s,m,m/s',
    '**CONSTANTS: 2,START,INTERVAL',
    '*CSTART',
    '2601050000 2',
    '*CEND',
  ];
  const data=Array.from({length:count},()=>`${flow} ${depth} ${velocity}`);
  return Buffer.from([...header,...data].join('\n')+'\n','utf8');
}
function surveyRatingFdv(monitor,count=200){
  const header=[
    `**IDENTIFIER: 1,${monitor}`,
    '**FIELD: 3,FLOW,DEPTH,VELOCITY',
    '**UNITS: 3,m3/s,m,m/s',
    '**CONSTANTS: 2,START,INTERVAL',
    '*CSTART',
    '2601050000 2',
    '*CEND',
  ];
  const data=Array.from({length:count},(_,i)=>{
    const depth=0.20+0.0025*i;
    const flow=1.50*Math.pow(depth,1.50);
    const velocity=0.45+0.05*Math.sin(i/10);
    return `${flow.toFixed(6)} ${depth.toFixed(6)} ${velocity.toFixed(6)}`;
  });
  return Buffer.from([...header,...data].join('\n')+'\n','utf8');
}
function surveyRainfallR(){
  const values=Array.from({length:200},(_,i)=>i<20?12:0);
  return Buffer.from(`*CSTART\n2601050000 2601050640 2\n*CEND\n${values.join(' ')}\n`,'utf8');
}
let cachedAssociationWorkbook=null;
async function associationWorkbook({variant=false}={}){
  if(!variant&&cachedAssociationWorkbook)return {name:'fm_rg_assoc.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(cachedAssociationWorkbook)};
  const bytes=await page.evaluate(variant=>{
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([
      ['FDV_Name','RG','Pipe Diameter (mm)','Upstream Trace'],
      ['FM03','RG02',600,variant?'FM01':'FM01, FM02'],
      ['FM01','RG01',450,''],
      ['FM02','RG01',450,''],
    ]);
    XLSX.utils.book_append_sheet(wb,ws,'Associations');
    return Array.from(new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'})));
  },variant);
  const buffer=Buffer.from(bytes);
  if(!variant)cachedAssociationWorkbook=Buffer.from(buffer);
  return {name:'fm_rg_assoc.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer};
}

try{
  stage='mixed-success import isolation';
  performanceEvidence.mixedSiblingImport=await verifyMixedSiblingImport();
  await writePerformanceEvidence();

  stage='cold import baseline';
  performanceEvidence.coldImport=await measureColdReferenceImport();
  await writePerformanceEvidence();
  if(!liveMode){
    const cold=performanceEvidence.coldImport,engineAfterSelection=Number(cold.engineReadyFromNavigationMs)-Number(cold.selectionAtFromNavigationMs);
    if(cold.selectionOutcome!=='graph'||cold.previewEvidence?.graphMode!=='fastpath-preview')throw new Error('Cold FastPath preview did not render: '+JSON.stringify(cold));
    if(cold.previewEvidence?.route?.workspace!=='data'||cold.previewEvidence?.route?.page!=='sources')throw new Error('Cold FastPath preview must not take navigation away from Data / Sources: '+JSON.stringify(cold.previewEvidence?.route));
    if(cold.previewEvidence?.engineStatus==='ready'||!(cold.timeToOutcomeMs<engineAfterSelection))throw new Error('Cold FastPath preview did not render before authoritative engine readiness: '+JSON.stringify(cold));
    if(cold.finalEvidence?.reconciliation?.status!=='matched')throw new Error('Cold FastPath preview did not reconcile exactly with authoritative FM01 parsing: '+JSON.stringify(cold.finalEvidence));
  }
  if(!liveMode){
  stage='fresh CSV FastPath benchmarks';
  performanceEvidence.freshCsvImports=[];
  const modelReference=await extractFirstModelReference();
  for(const spec of [
    {dataset:'StationA_EDM.csv',relativePath:'reference/current-tool/sample-data/other/StationA_EDM.csv',inputName:'Cold-StationA_EDM.csv'},
    {dataset:'StationA_Rainfall.csv',relativePath:'reference/current-tool/sample-data/other/StationA_Rainfall.csv',inputName:'Cold-StationA_Rainfall.csv'},
    {dataset:'StationA_Modelled Data.zip / first model member',sourcePath:modelReference.sourcePath,inputName:modelReference.inputName,archiveMember:modelReference.archiveMember,timeoutMs:240000},
  ]){
    const measured=await measureFreshFastPathImport(spec);
    performanceEvidence.freshCsvImports.push(measured);
    await writePerformanceEvidence();
    const engineAfterSelection=Number(measured.engineReadyFromNavigationMs)-Number(measured.selectionAtFromNavigationMs);
    if(measured.selectionOutcome!=='graph'||measured.previewEvidence?.graphMode!=='fastpath-preview')throw new Error('Fresh CSV FastPath preview did not render: '+JSON.stringify(measured));
    if(measured.previewEvidence?.route?.workspace!=='data'||measured.previewEvidence?.route?.page!=='sources')throw new Error('Fresh FastPath preview must prepare the graph without changing the user-selected Data / Sources page: '+JSON.stringify(measured.previewEvidence?.route));
    if(measured.previewEvidence?.engineStatus==='ready'||!(measured.timeToOutcomeMs<engineAfterSelection))throw new Error('Fresh CSV preview did not render before authoritative engine readiness: '+JSON.stringify(measured));
    if(measured.finalEvidence?.reconciliation?.status!=='matched')throw new Error('Fresh CSV FastPath preview did not reconcile exactly: '+JSON.stringify(measured));
    if(measured.archiveMember){
      const previewColumns=(measured.previewEvidence?.preview?.series||[]).map(x=>String(x.column||''));
      if(previewColumns.some(x=>/^seconds?$/i.test(x)))throw new Error('Model FastPath preview must hide auxiliary Seconds from the engineering graph: '+JSON.stringify(measured));
      if(!previewColumns.length)throw new Error('Model FastPath preview did not expose an engineering series: '+JSON.stringify(measured));
    }
  }
  }
  stage='Station A threshold control-to-report chain';
  performanceEvidence.stationAThresholdChain=await verifyStationAThresholdChain();
  await writePerformanceEvidence();

    stage='FastPath failure falls back to authoritative import';
  performanceEvidence.fastpathFailureFallback=await verifyFastPathFailureFallsBack();
  if(!liveMode&&!performanceEvidence.fastpathFailureFallback?.parsed)throw new Error('A FastPath worker failure must not prevent authoritative parsing: '+JSON.stringify(performanceEvidence.fastpathFailureFallback));
  stage='clear during pending FastPath import';
  performanceEvidence.pendingImportClear=await verifyClearDuringPendingImport();
  await writePerformanceEvidence();
  stage='analysis-worker restart during pending FastPath import';
  performanceEvidence.pendingImportRestart=await verifyRestartDuringPendingImport();
  await writePerformanceEvidence();
  stage='open application';
  const applicationNavigationStart=Date.now();
  await page.goto(baseUrl+(liveMode?`?live_verify=${Date.now()}`:''),{waitUntil:'domcontentloaded'});
  performanceEvidence.applicationDomReadyMs=Date.now()-applicationNavigationStart;
  await waitReady();
  performanceEvidence.applicationEngineReadyMs=Date.now()-applicationNavigationStart;
  await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__?.navigate&&document.querySelector('.pw-rail')&&document.querySelector('.pw-inspector')),null,{timeout:30000});
  stage='Precision Workbench shell and responsive layout';
  const primaryLabels=await page.locator('.pw-primary-nav button').allTextContents();
  if(primaryLabels.map(x=>x.trim()).join('|')!=='Data / Time Series|Spills|Flow Survey|Graphs|Reports')throw new Error('Precision Workbench primary navigation mismatch: '+JSON.stringify(primaryLabels));
  for(const size of [{width:1366,height:768},{width:1487,height:1058},{width:1920,height:1080}]){
    await page.setViewportSize(size);
    await precisionRoute('data','sources');
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,rail:document.querySelector('.pw-rail')?.getBoundingClientRect().width,work:document.querySelector('.pw-workarea')?.getBoundingClientRect().width}));
    if(layout.overflow>1)throw new Error(`Document horizontal overflow at ${size.width}x${size.height}: ${JSON.stringify(layout)}`);
    if(!(layout.rail>0&&layout.work>0))throw new Error('Precision shell regions missing: '+JSON.stringify(layout));
  }
  await page.setViewportSize({width:1440,height:1000});
  await precisionRoute('data','sources');
  const architecture=await page.evaluate(()=>({
    execution:window.__ICM_WORKBENCH__?.execution,
    mainThreadPyodide:typeof loadPyodide,
    registryMounted:Boolean(window.ICMProjectRegistry&&document.querySelector('#domainRegistryPanel')),
    pageBuild:document.querySelector('meta[name="icm-build-sha"]')?.content||null,
    runtimeBuild:window.__ICM_WORKBENCH__?.buildToken||null,
    workerBuild:window.__ICM_WORKBENCH__?.workerBuildToken||null,
    localAssetUrls:[...document.querySelectorAll('script[src],link[href]')].map(el=>el.src||el.href).filter(url=>/\/assets\//.test(url)&&new URL(url).origin===location.origin),
  }));
  if(architecture.execution!=='web-worker'||architecture.mainThreadPyodide!=='undefined'||!architecture.registryMounted)throw new Error('Worker/domain architecture not active: '+JSON.stringify(architecture));
  if(!architecture.pageBuild||architecture.pageBuild!==architecture.runtimeBuild||architecture.pageBuild!==architecture.workerBuild)throw new Error('Page/runtime/worker release versions are not coherent: '+JSON.stringify(architecture));
  if(architecture.localAssetUrls.some(url=>!new URL(url).searchParams.get('v')))throw new Error('A local JS/CSS asset is not release-versioned: '+JSON.stringify(architecture.localAssetUrls));
  if(!((await page.locator('footer').textContent())||'').includes('© 2026 Anzar Sajid'))throw new Error('Live footer copyright missing');

  stage='import preserves active Precision route';
  const routeImportCases=[
    {route:['spills','assessment'],input:'#fileInput',name:'route-spills.csv'},
    {route:['survey','fdv-check'],input:'#fileInput',name:'route-survey.csv'},
    {route:['graphs','comparison'],input:'#fileInput',name:'route-graphs.csv'},
    {route:['reports','report-generation'],input:'#folderInput',name:'route-reports.csv'},
  ];
  for(const [index,testCase] of routeImportCases.entries()){
    await precisionRoute(testCase.route[0],testCase.route[1]);
    const before=await page.locator('#poolBody tr').count();
    const payload=Buffer.from('timestamp,Depth (m)\n2026-01-01T00:00:00,'+(0.1+index/10).toFixed(2)+'\n2026-01-01T00:01:00,'+(0.2+index/10).toFixed(2)+'\n');
    if(testCase.input==='#folderInput'){
      const dir=await fs.mkdtemp(path.join(os.tmpdir(),'icm-route-folder-'));
      await fs.writeFile(path.join(dir,testCase.name),payload);
      await page.setInputFiles(testCase.input,dir);
    }else{
      await page.setInputFiles(testCase.input,{name:testCase.name,mimeType:'text/csv',buffer:payload});
    }
    await page.waitForFunction(([expected,name])=>document.querySelectorAll('#poolBody tr').length===expected&&[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes(name)&&row.textContent.includes('Ready')),[before+1,testCase.name],{timeout:60000});
    const route=await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.route());
    if(route.workspace!==testCase.route[0]||route.page!==testCase.route[1])throw new Error('Import changed the active Precision route: '+JSON.stringify({testCase,route}));
  }
  await precisionRoute('data','sources');
  await page.click('#clearPoolBtn');
  await page.waitForFunction(()=>document.querySelectorAll('#poolBody tr').length===0);

  stage='source pool and collapsed file list';
  const observedPath=path.join(root,'examples/demo/observed.csv');
  const modelPath=path.join(root,'examples/demo/model.csv');
  const rainPath=path.join(root,'examples/demo/rainfall.csv');
  const observedPayload=await filePayload(observedPath);
  await page.setInputFiles('#fileInput',[
    observedPayload,
    await filePayload(modelPath),
    await filePayload(rainPath),
    {name:'auxiliary-observed.csv',mimeType:'text/csv',buffer:Buffer.from(observedPayload.buffer)},
    {name:'dense-observed.csv',mimeType:'text/csv',buffer:denseCsv()},
  ]);
  await page.waitForFunction(()=>document.querySelectorAll('#poolBody tr').length===5&&document.querySelector('#poolSummary')?.textContent.includes('5 parsed successfully'),null,{timeout:90000});
  if(await page.locator('#poolBody tr').count()!==5)throw new Error('Expected five source-pool rows');
  const registryAfterInitialLoad=await page.evaluate(()=>window.ICMProjectRegistry?.snapshot());
  if(!registryAfterInitialLoad||registryAfterInitialLoad.sources.length!==5||registryAfterInitialLoad.series.length<5)throw new Error('Canonical project registry did not classify the initial source pool: '+JSON.stringify(registryAfterInitialLoad));
  if(!registryAfterInitialLoad.sources.some(x=>x.role==='model')||!registryAfterInitialLoad.sources.some(x=>x.role==='rainfall'))throw new Error('Project registry role classification is incomplete: '+JSON.stringify(registryAfterInitialLoad.sources));
  await page.waitForFunction(()=>getComputedStyle(document.querySelectorAll('#poolBody tr')[3]).display==='none');
  if(!((await page.locator('#sourcePoolToggle').textContent())||'').includes('Show all 5'))throw new Error('Collapsed source pool should offer Show all 5');
  await page.click('#sourcePoolToggle');
  if(await page.locator('#poolBody tr').nth(4).evaluate(el=>getComputedStyle(el).display)==='none')throw new Error('Expanded source pool did not reveal all rows');
  await page.click('#sourcePoolToggle');

  stage='observed-only mapping without rainfall';
  await precisionRoute('data','series-mapping');
  const denseObserved=await optionValue('#observedSelect','dense-observed.csv — level');
  const rain=await optionValue('#rainSelect','rainfall.csv — rainfall');
  if(!denseObserved||!rain)throw new Error('Expected dense observed and rainfall series options');
  if((await page.inputValue('#obsColor')).toLowerCase()!=='#d32f2f')throw new Error('Observed default colour should be reference red');
  await page.selectOption('#observedSelect',denseObserved);
  await page.selectOption('#modelSelect',[]);
  await page.selectOption('#rainSelect','');
  await page.click('#applyMappingBtn');
  await page.waitForSelector('#timeChart .main-svg',{state:'attached',timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('0 comparison scenario')&&document.querySelector('#mappingStatus')?.textContent.includes('rainfall not mapped'));
  const fullDensity=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts?.observed);
  if(!fullDensity||fullDensity.raw!==40000||fullDensity.shown>15000||fullDensity.native!==false)throw new Error(`Full adaptive density incorrect: ${JSON.stringify(fullDensity)}`);
  const observedOnlyLayout=await page.evaluate(()=>{const chart=document.querySelector('#timeChart');return {traceCount:chart.data.filter(t=>t.type!=='table').length,hasTable:chart.data.some(t=>t.type==='table'),hasRainTrace:chart.data.some(t=>t.type!=='table'&&t.yaxis==='y2'),hasY2:Boolean(chart.layout.yaxis2),hydDomain:chart.layout.yaxis.domain,observedColour:chart.data.find(t=>t.type!=='table')?.line?.color};});
  if(observedOnlyLayout.traceCount!==1||!observedOnlyLayout.hasTable||observedOnlyLayout.hasRainTrace||observedOnlyLayout.hasY2||observedOnlyLayout.hydDomain[0]<.28||observedOnlyLayout.hydDomain[1]!==1)throw new Error(`Observed-only/no-rain graph layout incorrect: ${JSON.stringify(observedOnlyLayout)}`);
  if(String(observedOnlyLayout.observedColour).toLowerCase()!=='#d32f2f')throw new Error('Observed plotted trace should be red, got '+JSON.stringify(observedOnlyLayout.observedColour));

  stage='same-series observed and comparison mapping without rainfall';
  await page.selectOption('#modelSelect',[denseObserved]);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('1 comparison scenario')&&document.querySelector('#mappingStatus')?.textContent.includes('rainfall not mapped'));
  await page.waitForFunction(()=>document.querySelector('#timeChart')?.data?.filter(t=>t.type!=='table').length===2&&document.querySelector('#timeChart')?.data?.some(t=>t.type==='table'),null,{timeout:60000});
  const comparisonNoRainLayout=await page.evaluate(()=>{const chart=document.querySelector('#timeChart'),lines=chart.data.filter(t=>t.type!=='table');return {traceCount:lines.length,hasTable:chart.data.some(t=>t.type==='table'),hasRainTrace:lines.some(t=>t.yaxis==='y2'),hasY2:Boolean(chart.layout.yaxis2),hydDomain:chart.layout.yaxis.domain,observedColour:lines[0]?.line?.color,modelColour:lines[1]?.line?.color};});
  if(comparisonNoRainLayout.traceCount!==2||!comparisonNoRainLayout.hasTable||comparisonNoRainLayout.hasRainTrace||comparisonNoRainLayout.hasY2||comparisonNoRainLayout.hydDomain[0]<.28||comparisonNoRainLayout.hydDomain[1]!==1)throw new Error(`Observed+comparison/no-rain graph layout incorrect: ${JSON.stringify(comparisonNoRainLayout)}`);
  if(String(comparisonNoRainLayout.observedColour).toLowerCase()!=='#d32f2f')throw new Error('Observed comparison trace should remain red, got '+JSON.stringify(comparisonNoRainLayout.observedColour));
  if(String(comparisonNoRainLayout.modelColour).toLowerCase()!=='#5755d9')throw new Error('First model plotted trace should use #5755d9, got '+JSON.stringify(comparisonNoRainLayout.modelColour));

  stage='observed-only mapping with rainfall';
  await page.selectOption('#modelSelect',[]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('0 comparison scenario')&&document.querySelector('#mappingStatus')?.textContent.includes('rainfall mapped'));
  await page.waitForFunction(()=>Boolean(document.querySelector('#timeChart')?.layout?.yaxis2),null,{timeout:60000});

  stage='rainfall-only mapping';
  await page.selectOption('#observedSelect','');
  await page.selectOption('#modelSelect',[]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('Observed: not mapped')&&document.querySelector('#mappingStatus')?.textContent.includes('rainfall mapped'),null,{timeout:60000});
  await precisionRoute('data','time-series');
  const rainfallOnly=await page.evaluate(()=>{
    const chart=document.querySelector('#timeChart'),lines=(chart?.data||[]).filter(t=>t.type!=='table');
    return{
      lineNames:lines.map(t=>t.name),
      axes:lines.map(t=>t.yaxis||'y'),
      yTitle:chart?.layout?.yaxis?.title?.text||'',
      y2:Boolean(chart?.layout?.yaxis2),
      panelOrder:window.__ICM_WORKBENCH__.lastPanelOrder,
      observedThresholdHidden:document.querySelector('#v2GraphToolbar [data-threshold-role="observed"]')?.hidden,
      modelThresholdHidden:document.querySelector('#v2GraphToolbar [data-threshold-role="model"]')?.hidden,
    };
  });
  if(JSON.stringify(rainfallOnly.lineNames)!==JSON.stringify(['Rainfall'])||JSON.stringify(rainfallOnly.axes)!==JSON.stringify(['y'])||!/Rainfall/i.test(rainfallOnly.yTitle)||rainfallOnly.y2||JSON.stringify(rainfallOnly.panelOrder)!==JSON.stringify(['rainfall'])||rainfallOnly.observedThresholdHidden!==true||rainfallOnly.modelThresholdHidden!==true)throw new Error('Rainfall-only mapping must render a full rainfall panel with no hydraulic thresholds: '+JSON.stringify(rainfallOnly));

  await precisionRoute('data','series-mapping');
  await page.selectOption('#observedSelect',denseObserved);
  await page.selectOption('#modelSelect',[]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>Boolean(document.querySelector('#timeChart')?.layout?.yaxis2),null,{timeout:60000});

  stage='graph threshold controls and rainfall top band';
  await precisionRoute('data','time-series');
  const focusLayout=await page.evaluate(()=>({
    focus:document.body.classList.contains('pw-focus-canvas'),
    rail:document.querySelector('.pw-rail')?.getBoundingClientRect().width||0,
    work:document.querySelector('.pw-workarea')?.getBoundingClientRect().width||0,
    inspectorPosition:getComputedStyle(document.querySelector('.pw-inspector')).position,
    inspectorToggleVisible:getComputedStyle(document.querySelector('#pwInspectorToggle')).display!=='none',
    railToggleHidden:document.querySelector('#pwRailToggle')?.hidden
  }));
  if(!focusLayout.focus||focusLayout.rail>90||focusLayout.work<1100||focusLayout.inspectorPosition!=='fixed'||!focusLayout.inspectorToggleVisible||focusLayout.railToggleHidden!==true)throw new Error('Graph-heavy routes must default to a focused analytical canvas: '+JSON.stringify(focusLayout));
  await page.waitForFunction(()=>document.querySelector('#timeChart')?.getBoundingClientRect().width>1000,null,{timeout:10000});
  await page.click('#pwInspectorToggle');
  await page.waitForFunction(()=>document.querySelector('#pwInspector')?.classList.contains('is-open'));
  await page.click('#pwInspectorClose');
  await page.waitForFunction(()=>!document.querySelector('#pwInspector')?.classList.contains('is-open'));
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.setFocus(false));
  const standardLayout=await page.evaluate(()=>({
    focus:document.body.classList.contains('pw-focus-canvas'),
    rail:document.querySelector('.pw-rail')?.getBoundingClientRect().width||0,
    labelled:[...document.querySelectorAll('.pw-primary-nav .pw-nav-label')].every(x=>getComputedStyle(x).display!=='none'),
    railToggleHidden:document.querySelector('#pwRailToggle')?.hidden
  }));
  if(standardLayout.focus||standardLayout.rail<180||!standardLayout.labelled||standardLayout.railToggleHidden)throw new Error('Explicit standard layout must restore labelled navigation: '+JSON.stringify(standardLayout));
  // Return to the intended graph-first default before the remaining analytical
  // assertions and screenshots so review evidence represents the shipped experience.
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.setFocus(true));
  await page.waitForFunction(()=>document.body.classList.contains('pw-focus-canvas')&&document.querySelector('#timeChart')?.getBoundingClientRect().width>1000,null,{timeout:10000});
  const levelThresholdControls=await page.evaluate(()=>({
    observedHidden:document.querySelector('#v2GraphToolbar [data-threshold-role="observed"]')?.hidden,
    modelHidden:document.querySelector('#v2GraphToolbar [data-threshold-role="model"]')?.hidden
  }));
  if(levelThresholdControls.observedHidden!==false||levelThresholdControls.modelHidden!==true)throw new Error('Observed level data must expose the observed threshold control while keeping the unmapped model threshold hidden: '+JSON.stringify(levelThresholdControls));
  const levelThresholdContext=(await page.locator('#graphObsThresholdContext').textContent())||'';
  if(!levelThresholdContext.includes('Absolute level')||!levelThresholdContext.includes('reference / datum not supplied'))throw new Error('Level threshold must expose quantity/reference context: '+levelThresholdContext);

  // Numeric edge cases: zero and valid negative absolute levels are legitimate
  // values and must not be lost through truthiness checks.
  await page.fill('#graphObsThreshold','0');
  await page.waitForFunction(()=>Number((document.querySelector('#timeChart')?.layout?.shapes||[]).find(s=>s.type==='line'&&s.yref!=='paper')?.y0)===0,null,{timeout:60000});
  await page.fill('#graphObsThreshold','-0.25');
  await page.waitForFunction(()=>Number((document.querySelector('#timeChart')?.layout?.shapes||[]).find(s=>s.type==='line'&&s.yref!=='paper')?.y0)===-0.25,null,{timeout:60000});
  await page.fill('#graphObsThreshold','99');
  await page.waitForFunction(()=>document.querySelector('#graphObsThresholdContext')?.textContent.includes('outside plotted support'),null,{timeout:60000});
  await page.fill('#graphObsThreshold','1.5');
  await page.waitForFunction(()=>{
    const chart=document.querySelector('#timeChart');
    const thresholdLegend=(chart?.data||[]).filter(t=>/threshold|spill level/i.test(String(t.name||'')));
    const thresholdShapes=(chart?.layout?.shapes||[]).filter(s=>s.type==='line'&&s.yref!=='paper');
    return thresholdLegend.length===1&&thresholdShapes.length===1&&thresholdShapes[0].yref==='y'&&Number(thresholdShapes[0].y0)===1.5;
  },null,{timeout:60000});
  const levelThresholdPresentation=await page.evaluate(()=>{
    const chart=document.querySelector('#timeChart');
    return{
      thresholdLegend:(chart.data||[]).filter(t=>/threshold|spill level/i.test(String(t.name||''))).map(t=>t.name),
      thresholdShapes:(chart.layout.shapes||[]).filter(s=>s.type==='line'&&s.yref!=='paper').map(s=>({yref:s.yref,y0:s.y0,dash:s.line?.dash}))
    };
  });
  if(levelThresholdPresentation.thresholdLegend.length!==1||levelThresholdPresentation.thresholdShapes.length!==1||levelThresholdPresentation.thresholdShapes[0].dash!=='dash')throw new Error('Observed level threshold must be visible as one dashed line on the hydraulic level axis: '+JSON.stringify(levelThresholdPresentation));
  const graphLayout=await page.evaluate(()=>({hyd:document.querySelector('#timeChart').layout.yaxis.domain,rain:document.querySelector('#timeChart').layout.yaxis2.domain,rainRange:document.querySelector('#timeChart').layout.yaxis2.range}));
  if(!(graphLayout.hyd[1]<graphLayout.rain[0]&&(graphLayout.rain[0]-graphLayout.hyd[1])>=.04))throw new Error(`Rainfall and hydraulic panels are not independently separated: ${JSON.stringify(graphLayout)}`);
  if(!(graphLayout.rainRange[0]>graphLayout.rainRange[1]))throw new Error(`Rainfall axis should be reversed top-down: ${JSON.stringify(graphLayout.rainRange)}`);
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphStatistics?.length===2&&document.querySelector('#timeChart')?.data?.some(t=>t.type==='table'),null,{timeout:60000});
  const graphStatsPresentation=await page.evaluate(()=>{
    const chart=document.querySelector('#timeChart'),table=chart.data.find(t=>t.type==='table');
    return{
      externalHidden:document.querySelector('#graphStatistics')?.hidden===true,
      header:(table?.header?.values||[]).map(x=>String(x).replace(/<[^>]+>/g,'')),
      domain:table?.domain?.y,
      rows:(table?.cells?.values?.[0]||[]).map(String),
    };
  });
  if(!graphStatsPresentation.externalHidden)throw new Error('Graph statistics should be integrated into the Plotly figure rather than duplicated below it.');
  if(JSON.stringify(graphStatsPresentation.header)!==JSON.stringify(['Series','Unit','Min','Max','Average','Total']))throw new Error('Plotly statistics band does not match the reference contract: '+JSON.stringify(graphStatsPresentation));
  if(!Array.isArray(graphStatsPresentation.domain)||graphStatsPresentation.domain[1]>.24)throw new Error('Statistics table must occupy a dedicated lower Plotly band: '+JSON.stringify(graphStatsPresentation.domain));
  const noRangeSlider=await page.evaluate(()=>!document.querySelector('#timeChart')?.layout?.xaxis?.rangeslider?.visible);
  if(!noRangeSlider)throw new Error('Main graph overview/range slider should be removed');
  await captureEvidence('01-data-graph');

  stage='adaptive zoom restores native timestep';
  await page.evaluate(()=>Plotly.relayout(document.querySelector('#timeChart'),{'xaxis.range[0]':'2026-01-01T00:00:00','xaxis.range[1]':'2026-01-01T02:00:00'}));
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts?.observed?.native===true&&window.__ICM_WORKBENCH__.lastGraphPointCounts.observed.raw<=121,null,{timeout:60000});
  const zoomDensity=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts.observed);
  if(zoomDensity.raw!==121||zoomDensity.shown!==zoomDensity.raw)throw new Error(`Zoomed window should show native points: ${JSON.stringify(zoomDensity)}`);

  const plotted=await page.evaluate(()=>document.querySelector('#timeChart').data[0]);
  if(plotted.x.length!==121||plotted.x[0]!=='2026-01-01T00:00:00'||plotted.x[120]!=='2026-01-01T02:00:00')throw new Error('Native source timestamps are incorrect');
  if(plotted.y[25]!==2.2||plotted.y[46]!==0.45)throw new Error('Native source values are incorrect');
  await page.evaluate(()=>Plotly.relayout(document.querySelector('#timeChart'),{'xaxis.autorange':true}));
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts?.observed?.raw===40000);

  stage='observed-only yearly spill calculation';
  await precisionRoute('spills','thresholds');
  if(await page.inputValue('#obsThreshold')!=='1.5')throw new Error('Graph observed threshold was not synchronised to spill calculation');
  // Exercise the reverse direction from the user's reported workflow: edit the
  // canonical spill threshold, return to Time Series, refresh, and require the
  // same line/value to be visible on the vertical hydraulic axis.
  await page.fill('#obsThreshold','1.55');
  await page.waitForFunction(()=>document.querySelector('#graphObsThreshold')?.value==='1.55');
  await precisionRoute('data','time-series');
  await page.click('#refreshGraphBtn');
  await page.waitForFunction(()=>{
    const chart=document.querySelector('#timeChart');
    const lines=(chart?.layout?.shapes||[]).filter(s=>s.type==='line'&&s.yref!=='paper');
    return lines.length===1&&lines[0].yref==='y'&&Number(lines[0].y0)===1.55;
  },null,{timeout:60000});
  await precisionRoute('spills','thresholds');
  if(await page.inputValue('#obsThreshold')!=='1.55')throw new Error('Spill threshold changed while returning from the graph.');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>document.querySelector('#spillRunStatus')?.textContent.includes('Completed in'),null,{timeout:60000});
  await precisionRoute('spills','results');
  await page.waitForSelector('#obsMonthly .v2-yearly-title',{timeout:60000});
  if(await page.locator('#obsMonthly tbody tr').count()<1)throw new Error('Observed yearly spill table missing');
  if(!((await page.locator('#spillComparison').textContent())||'').includes('model result is optional'))throw new Error('Observed-only spill workflow should not require a model');

  stage='map comparison scenario for calibration workflows';
  await precisionRoute('data','series-mapping');
  const obsDepth=await optionValue('#observedSelect','observed.csv — depth');
  const obsFlow=await optionValue('#ratingObsFlow','observed.csv — flow');
  const modelDepth=await optionValue('#modelSelect','model.csv — depth');
  const modelFlow=await optionValue('#ratingModelFlow','model.csv — flow');
  if(!obsDepth||!obsFlow||!modelDepth||!modelFlow)throw new Error('Expected demo depth/flow series options were not created');

  stage='model-only hydraulic threshold workflow';
  await page.selectOption('#observedSelect','');
  await page.selectOption('#modelSelect',[modelDepth]);
  await page.selectOption('#rainSelect','');
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('Observed: not mapped')&&document.querySelector('#mappingStatus')?.textContent.includes('1 comparison scenario')&&document.querySelector('#mappingStatus')?.textContent.includes('rainfall not mapped')&&!document.querySelector('#applyMappingBtn')?.disabled&&window.__ICM_WORKBENCH__?.uiV2?.graphRefreshing===false,null,{timeout:60000});
  await precisionRoute('data','time-series');
  const modelOnlyThresholdControls=await page.evaluate(()=>({
    observedHidden:document.querySelector('#v2GraphToolbar [data-threshold-role="observed"]')?.hidden,
    modelHidden:document.querySelector('#v2GraphToolbar [data-threshold-role="model"]')?.hidden,
    modelTrace:(document.querySelector('#timeChart')?.data||[]).some(t=>/^Simulated:/.test(String(t.name||''))),
    yTitle:document.querySelector('#timeChart')?.layout?.yaxis?.title?.text||''
  }));
  if(modelOnlyThresholdControls.observedHidden!==true||modelOnlyThresholdControls.modelHidden!==false||!modelOnlyThresholdControls.modelTrace||!/Depth/i.test(modelOnlyThresholdControls.yTitle))throw new Error('Model-only Depth mapping must render the model and expose only its hydraulic threshold: '+JSON.stringify(modelOnlyThresholdControls));
  await page.fill('#graphModelThreshold','1.05');
  await page.waitForFunction(()=>{const chart=document.querySelector('#timeChart');return (chart?.layout?.shapes||[]).some(s=>s.type==='line'&&s.yref==='y'&&Math.abs(Number(s.y0)-1.05)<1e-9);},null,{timeout:60000});
  await precisionRoute('spills','assessment');
  if(await page.inputValue('#obsThreshold')!=='')throw new Error('Observed threshold must remain cleared in a model-only mapping.');
  if(await page.inputValue('#modelThreshold')!=='1.05')throw new Error('Model-only threshold did not persist into Spills.');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>document.querySelector('#spillRunStatus')?.textContent.includes('Completed in')&&Boolean(state.spills?.model)&&!state.spills?.observed&&Math.abs(Number(state.spillSnapshot?.config?.analysis?.model_threshold)-1.05)<1e-9,null,{timeout:60000});
  const modelOnlySpill=await page.evaluate(()=>({observed:Boolean(state.spills?.observed),model:Boolean(state.spills?.model),threshold:state.spillSnapshot?.config?.analysis?.model_threshold}));
  if(modelOnlySpill.observed||!modelOnlySpill.model||Math.abs(Number(modelOnlySpill.threshold)-1.05)>1e-9)throw new Error('Model-only spill calculation did not consume the canonical model threshold: '+JSON.stringify(modelOnlySpill));

  await precisionRoute('data','series-mapping');
  await page.selectOption('#observedSelect',obsDepth);
  await page.selectOption('#modelSelect',[modelDepth]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>{
    const text=document.querySelector('#mappingStatus')?.textContent||'';
    return !text.includes('Observed: not mapped')&&text.includes('observed.csv')&&text.includes('1 comparison scenario')&&text.includes('rainfall mapped');
  },null,{timeout:60000});
  if(await page.inputValue('#obsThreshold')!=='')throw new Error('Incompatible Level → Depth remapping must clear the previous hydraulic threshold rather than silently reusing it.');
  const depthThresholdControls=await page.evaluate(()=>({
    observedHidden:document.querySelector('#v2GraphToolbar [data-threshold-role="observed"]')?.hidden,
    modelHidden:document.querySelector('#v2GraphToolbar [data-threshold-role="model"]')?.hidden
  }));
  if(depthThresholdControls.observedHidden||depthThresholdControls.modelHidden)throw new Error('Observed and model depth-threshold controls should be available for a depth-vs-depth mapping: '+JSON.stringify(depthThresholdControls));
  if(await page.locator('#modelPickerTrigger').count()!==1)throw new Error('Model series must use a compact checkbox dropdown trigger');
  await page.click('#modelPickerTrigger');
  if(await page.locator('#modelPickerPopover input[type="search"]').count()!==1)throw new Error('Model dropdown search field missing');
  if(await page.locator('#modelPickerPopover input[type="checkbox"]').count()<1)throw new Error('Model dropdown checkboxes missing');
  await page.click('#modelPickerTrigger');
  for(const id of ['#observedFlowColour','#observedDepthColour','#observedVelocityColour','#rainColor'])if(await page.locator(id).count()!==1)throw new Error('Per-series colour control missing: '+id);
  const modelColour=await page.inputValue('#modelColourControls .model-colour');
  const colourWidth=await page.locator('#modelColourControls .model-colour').evaluate(el=>el.getBoundingClientRect().width);
  if(modelColour.toLowerCase()!=='#5755d9')throw new Error(`First model default colour should match the reference simulated blue, got ${modelColour}`);
  if(colourWidth>90)throw new Error(`Model colour picker should be a compact swatch, width=${colourWidth}`);
  await clickTab('graph');
  await page.fill('#graphObsThreshold','1.0');
  await page.fill('#graphModelThreshold','1.0');
  await page.waitForFunction(()=>{
    const chart=document.querySelector('#timeChart');
    const thresholdShapes=(chart?.layout?.shapes||[]).filter(x=>x.type==='line'&&x.yref!=='paper');
    const thresholdTraces=(chart?.data||[]).filter(t=>/threshold/i.test(String(t.name||'')));
    return thresholdShapes.length===1&&thresholdTraces.length===1&&/Observed \+ model depth threshold/i.test(thresholdTraces[0].name||'');
  },null,{timeout:60000});
  await page.fill('#graphModelThreshold','1.1');
  await page.waitForFunction(()=>{
    const chart=document.querySelector('#timeChart');
    const thresholdShapes=(chart?.layout?.shapes||[]).filter(x=>x.type==='line'&&x.yref!=='paper');
    const thresholdTraces=(chart?.data||[]).filter(t=>/threshold|spill level/i.test(String(t.name||'')));
    return thresholdShapes.length===2&&thresholdTraces.length===2&&thresholdTraces.every(t=>t.line?.dash==='dash'&&(t.yaxis||'y')==='y');
  },null,{timeout:60000});

  stage='hydraulic threshold flow ineligibility';
  await precisionRoute('data','series-mapping');
  const observedFlowMapping=await optionValue('#observedSelect','observed.csv — flow');
  if(!observedFlowMapping)throw new Error('Observed flow mapping unavailable for threshold ineligibility regression.');
  await page.selectOption('#observedSelect',observedFlowMapping);
  await page.selectOption('#modelSelect',[]);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#v2GraphToolbar [data-threshold-role="observed"]')?.hidden===true);
  if(await page.inputValue('#obsThreshold')!=='')throw new Error('Depth threshold was not cleared when the mapping became Flow.');
  await precisionRoute('spills','assessment');
  await page.fill('#obsThreshold','1');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>/Depth or Level|Flow and Velocity/.test(document.querySelector('#spillRunStatus')?.textContent||''),null,{timeout:10000});
  if(!/Depth or Level|Flow and Velocity/.test((await page.locator('#spillRunStatus').textContent())||''))throw new Error('Flow-only spill calculation did not reject a hydraulic-level threshold explicitly.');
  await precisionRoute('data','series-mapping');
  await page.selectOption('#observedSelect',obsDepth);
  await page.selectOption('#modelSelect',[modelDepth]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('1 comparison scenario'));
  await precisionRoute('data','time-series');
  await page.fill('#graphObsThreshold','1.0');
  await page.fill('#graphModelThreshold','1.1');

  stage='calibration comparison and diagnostics';
  await clickTab('compare');
  await page.click('#runCompareBtn');
  await page.waitForFunction(()=>document.querySelectorAll('#scenarioBody tr').length===1&&document.querySelectorAll('#metricGrid .metric').length>=10,null,{timeout:60000});
  const comparisonValidity=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastComparisonValidity);
  if(!comparisonValidity||comparisonValidity.status!=='partial'||!(Number(comparisonValidity.coverage)>0&&Number(comparisonValidity.coverage)<1))throw new Error(`Comparison validity contract should expose the demo telemetry gap as partial support: ${JSON.stringify(comparisonValidity)}`);
  let metricText=await page.locator('#metricGrid').textContent();
  if(!metricText.includes('Calculation status')||!metricText.includes('Valid support')||!metricText.includes('Pearson r')||!metricText.includes('Regression R²')||!metricText.includes('Slope')||!metricText.includes('Intercept'))throw new Error('Comparison validity/regression cards are missing: '+metricText);
  for(const id of ['scatterChart','residualChart','cumulativeChart','exceedanceChart'])await page.waitForSelector(`#${id} .main-svg`,{timeout:60000});
  const linearScatter=await page.evaluate(()=>{
    const chart=document.querySelector('#scatterChart'),markers=(chart?.data||[]).filter(t=>t.mode==='markers'),fits=(chart?.data||[]).filter(t=>/ fit$/.test(String(t.name||''))),agreement=(chart?.data||[]).filter(t=>String(t.name||'')==='1:1 agreement');
    return {xType:chart?.layout?.xaxis?.type,yType:chart?.layout?.yaxis?.type,xTitle:chart?.layout?.xaxis?.title?.text,yTitle:chart?.layout?.yaxis?.title?.text,markers:markers.length,fits:fits.length,agreement:agreement.length,hover:markers[0]?.hovertemplate||''};
  });
  if(linearScatter.xType!=='linear'||linearScatter.yType!=='linear'||linearScatter.markers<1||linearScatter.fits<1||linearScatter.agreement!==1||!linearScatter.hover.includes('Observed:')||!/Observed .+\(/.test(linearScatter.xTitle||'')||!/Modelled .+\(/.test(linearScatter.yTitle||''))throw new Error('Linear scatter acceptance failed: '+JSON.stringify(linearScatter));
  const scatterSwitchStart=performance.now();
  await page.selectOption('#scatterScale','log');
  await page.waitForFunction(()=>document.querySelector('#scatterChart')?.layout?.xaxis?.type==='log'&&document.querySelector('#scatterChart')?.layout?.yaxis?.type==='log',null,{timeout:10000});
  performanceEvidence.scatterScaleSwitchMs=performance.now()-scatterSwitchStart;
  if(performanceEvidence.scatterScaleSwitchMs>1500)throw new Error('Scatter scale interaction exceeded the 1500 ms responsiveness budget: '+performanceEvidence.scatterScaleSwitchMs);
  await writePerformanceEvidence();
  metricText=await page.locator('#metricGrid').textContent();
  if(!metricText.includes('Positive pairs')||!metricText.includes('Removed ≤0 pairs'))throw new Error('Log scatter sample accounting is missing: '+metricText);
  const logScatter=await page.evaluate(()=>{const chart=document.querySelector('#scatterChart'),points=(chart?.data||[]).filter(t=>t.mode==='markers').flatMap(t=>(t.x||[]).map((x,i)=>[Number(x),Number(t.y?.[i])]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])));return {points,xType:chart?.layout?.xaxis?.type,yType:chart?.layout?.yaxis?.type};});
  if(logScatter.points.some(([x,y])=>x<=0||y<=0))throw new Error('Log scatter contains a nonpositive plotted pair: '+JSON.stringify(logScatter));
  await page.selectOption('#scatterScale','linear');
  await page.waitForFunction(()=>document.querySelector('#scatterChart')?.layout?.xaxis?.type==='linear');
  await precisionRoute('graphs','comparison');
  await captureEvidence('08-graphs-comparison');

  stage='multiple model scenarios and long legend containment';
  const longScenarioName='model-scenario-B-long-name-for-legend-containment-and-report-selection.csv';
  const modelVariantBytes=await fs.readFile(modelPath);
  await page.setInputFiles('#fileInput',{name:longScenarioName,mimeType:'text/csv',buffer:modelVariantBytes});
  await page.waitForFunction(name=>[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes(name)&&row.textContent.includes('Ready')),longScenarioName,{timeout:60000});
  await precisionRoute('data','series-mapping');
  const variantDepth=await optionValue('#modelSelect',longScenarioName+' — depth');
  if(!variantDepth)throw new Error('Second long-named model scenario did not expose a depth series.');
  await page.selectOption('#observedSelect',obsDepth);
  await page.selectOption('#modelSelect',[modelDepth,variantDepth]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('2 comparison scenario'),null,{timeout:60000});
  await precisionRoute('graphs','comparison');
  await page.click('#runCompareBtn');
  await page.waitForFunction(()=>document.querySelectorAll('#scenarioBody tr').length===2,null,{timeout:60000});
  const multiScenario=await page.evaluate(()=>{
    const chart=document.querySelector('#scatterChart'),markers=(chart?.data||[]).filter(t=>t.mode==='markers');
    const panel=document.querySelector('#tab-compare>.panel')?.getBoundingClientRect();
    const legend=chart?.querySelector('.legend')?.getBoundingClientRect();
    return{
      markers:markers.map(t=>({name:t.name,colour:t.marker?.color,points:(t.x||[]).length})),
      rows:[...document.querySelectorAll('#scenarioBody tr')].map(row=>row.textContent),
      documentOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      legendWithinPanel:!legend||!panel||(legend.right<=panel.right+2&&legend.left>=panel.left-2),
    };
  });
  if(multiScenario.markers.length!==2||multiScenario.markers.some(x=>x.points<2)||new Set(multiScenario.markers.map(x=>x.colour)).size!==2)throw new Error('Multi-scenario scatter must render two independently styled authoritative pair clouds: '+JSON.stringify(multiScenario));
  if(!multiScenario.rows.some(x=>x.includes(longScenarioName))||multiScenario.documentOverflow>2||!multiScenario.legendWithinPanel)throw new Error('Long multi-scenario legend/table containment failed: '+JSON.stringify(multiScenario));
  await captureEvidence('08b-graphs-multiple-scenarios');

  stage='depth-only agreement fit';
  await precisionRoute('verification','rating');
  const od=await optionValue('#ratingObsDepth','observed.csv — depth');
  const of=await optionValue('#ratingObsFlow','observed.csv — flow');
  const md=await optionValue('#ratingModelDepth','model.csv — depth');
  const mf=await optionValue('#ratingModelFlow','model.csv — flow');
  await page.selectOption('#ratingObsDepth',od);await page.selectOption('#ratingObsDepthUnit','m');await page.selectOption('#ratingObsFlow','');
  await page.selectOption('#ratingObsFlowUnit','m3/s');await page.selectOption('#ratingModelDepth',md);await page.selectOption('#ratingModelDepthUnit','m');
  await page.selectOption('#ratingModelFlow','');await page.selectOption('#ratingModelFlowUnit','m3/s');
  await page.click('#runRatingBtn');
  await page.waitForFunction(()=>document.querySelector('#ratingSummary')?.textContent.includes('Valid paired points'),null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#ratingChart')?.data?.length>=3,null,{timeout:60000});

  stage='flow-depth rating';
  await precisionRoute('verification','rating');
  await page.selectOption('#ratingObsFlow',of);await page.selectOption('#ratingModelFlow',mf);
  await page.click('#runRatingBtn');
  await page.waitForFunction(()=>document.querySelector('#ratingSummary')?.textContent.includes('Data-fitted / Generic Rating Curve'),null,{timeout:60000});
  await page.waitForSelector('#ratingChart .main-svg',{timeout:60000});

  stage='dry weather flow';
  await precisionRoute('verification','dwf');
  const dwf=await optionValue('#dwfFlowSelect','observed.csv — flow');
  await page.selectOption('#dwfFlowSelect',dwf);
  await page.selectOption('#dwfFlowUnit','m3/s');
  await page.fill('#analysisStart','2026-01-01T00:02');
  await page.fill('#analysisEnd','2026-01-01T00:12');
  await page.locator('#analysisStart').dispatchEvent('change');
  await page.locator('#analysisEnd').dispatchEvent('change');
  await page.click('#runDwfBtn');
  await page.waitForSelector('#dwfSummary .summary-box',{timeout:60000});
  const boundedDwf=await page.evaluate(()=>window.__ICM_WORKBENCH__.dwfResult);
  if(boundedDwf?.analysis_start!=='2026-01-01T00:02:00'||boundedDwf?.analysis_end!=='2026-01-01T00:12:00'||boundedDwf?.flow_unit!=='m³/s')throw new Error('DWF did not consume the shared analysis period / canonical flow unit: '+JSON.stringify(boundedDwf));
  if(await page.evaluate(()=>window.__ICM_WORKBENCH__.dwfFresh?.())!==true)throw new Error('Fresh DWF result was not bound to its source/criteria/period signature.');
  await page.fill('#analysisStart','');
  await page.fill('#analysisEnd','');
  await page.locator('#analysisStart').dispatchEvent('change');
  await page.locator('#analysisEnd').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#dwfSummary')?.textContent.includes('Stale DWF result cleared.'));
  await page.click('#runDwfBtn');
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.dwfFresh?.()===true&&document.querySelector('#dwfSummary .summary-box'),null,{timeout:60000});
  await page.fill('#dwfDryDay','0.8');
  await page.locator('#dwfDryDay').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#dwfSummary')?.textContent.includes('Stale DWF result cleared.'));
  if(await page.evaluate(()=>window.__ICM_WORKBENCH__.dwfFresh?.())!==false)throw new Error('DWF criteria change did not invalidate the prior result.');
  await page.fill('#dwfDryDay','1');
  await page.locator('#dwfDryDay').dispatchEvent('change');
  await page.click('#runDwfBtn');
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.dwfFresh?.()===true&&document.querySelector('#dwfSummary .summary-box'),null,{timeout:60000});
  await captureEvidence('09-verification-dwf');

  stage='rainfall event workflow and cumulative multi-R plot';
  await clickTab('rain-events');
  await page.setInputFiles('#fileInput',[
    {name:'storm-alpha.r',mimeType:'text/plain',buffer:rainfallR([6,12,0,3])},
    {name:'storm-beta.R',mimeType:'text/plain',buffer:rainfallR([3,3,3,3])},
  ]);
  await page.waitForFunction(()=>{
    const rows=[...document.querySelectorAll('#poolBody tr')].map(row=>row.textContent||'');
    return rows.some(text=>text.includes('storm-alpha.r')&&text.includes('Ready'))&&rows.some(text=>text.includes('storm-beta.R')&&text.includes('Ready'))&&window.__ICM_WORKBENCH__.lastCumulativeRainfall?.files===2;
  },null,{timeout:90000});
  const cumulativeRain=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastCumulativeRainfall);
  if(cumulativeRain.traces!==2)throw new Error(`Expected two cumulative rainfall traces: ${JSON.stringify(cumulativeRain)}`);
  const totals=[...cumulativeRain.totals].sort((a,b)=>a.file.localeCompare(b.file));
  if(Math.abs(Number(totals[0]?.total_mm)-0.7)>1e-9||Math.abs(Number(totals[1]?.total_mm)-0.4)>1e-9)throw new Error(`Unexpected cumulative rainfall totals: ${JSON.stringify(totals)}`);
  await page.waitForSelector('#cumulativeRainChart .main-svg',{timeout:60000});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastRainfallQuality?.gauge_count===2,null,{timeout:60000});
  if(await page.locator('#multiGaugeRainTable tbody tr').count()!==2)throw new Error('Multi-gauge rainfall quality table should contain both .R gauges');

  await page.selectOption('#rainCriteriaMode','manual');
  await page.fill('#rainMinIntensity','1');
  await page.fill('#rainIntensityDuration','2');
  await page.fill('#rainEventDuration','4');
  await page.fill('#rainTotalDepth','0.1');
  await page.fill('#rainDryGap','4');
  await page.click('#runRainEventsBtn');
  await page.waitForFunction(()=>document.querySelector('#rainEventSummary')?.textContent.includes('qualifying events'),null,{timeout:60000});
  if(await page.locator('#rainEventBody tr').count()<1)throw new Error('Manual rainfall criteria should identify the demo event');
  if(await page.evaluate(()=>window.__ICM_WORKBENCH__.rainEventsFresh?.())!==true)throw new Error('Fresh rainfall-event result was not bound to source/criteria/exclusion dependencies.');
  await page.fill('#rainMinIntensity','1.1');
  await page.locator('#rainMinIntensity').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#rainEventSummary')?.textContent.includes('Stale rainfall-event result cleared.')&&window.__ICM_WORKBENCH__.rainEventsFresh?.()===false&&state.rainEvents.length===0);
  await page.fill('#rainMinIntensity','1');
  await page.locator('#rainMinIntensity').dispatchEvent('change');
  await page.click('#runRainEventsBtn');
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.rainEventsFresh?.()===true&&document.querySelectorAll('#rainEventBody tr').length>0,null,{timeout:60000});
  // runRainEvents awaits the optional observed/model Event Response after event
  // detection. Do not mutate sources/mappings until that guarded operation has
  // fully completed, otherwise the correct late-result rejection is mistaken
  // for an application error by the acceptance harness.
  await page.waitForFunction(()=>!document.body.classList.contains('operation-busy'),null,{timeout:60000});
  await precisionRoute('rainfall','events');
  await captureEvidence('10-rainfall-events');

  stage='data health';
  await clickTab('data-health');
  await page.click('#runHealthBtn');
  await page.waitForFunction(()=>document.querySelectorAll('#healthBody tr').length>0,null,{timeout:60000});
  if(await page.evaluate(()=>window.__ICM_WORKBENCH__.healthFresh?.())!==true)throw new Error('Fresh Data Health result was not bound to source/gap dependencies.');
  await page.fill('#gapInput','901');
  await page.locator('#gapInput').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#healthBody')?.textContent.includes('Stale Data Health result cleared.')&&window.__ICM_WORKBENCH__.healthFresh?.()===false);
  await page.fill('#gapInput','900');
  await page.locator('#gapInput').dispatchEvent('change');
  await page.click('#runHealthBtn');
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.healthFresh?.()===true&&document.querySelectorAll('#healthBody tr').length>0,null,{timeout:60000});
  await captureEvidence('02-survey-data-health');
  const healthHead=await page.locator('#healthBody').evaluate(el=>el.closest('table')?.querySelector('thead')?.textContent||'');
  if(!healthHead.includes('Flatline')||!healthHead.includes('Out of range')||!healthHead.includes('Zero %'))throw new Error('Enhanced FDV flow-survey screening columns are missing');

  stage='association workbook and canonical survey navigation';
  await precisionRoute('survey','fdv-check');
  const navLabels=await page.locator('.pw-primary-nav button').allTextContents();
  if(navLabels.map(x=>x.trim()).join('|')!=='Data / Time Series|Spills|Flow Survey|Graphs|Reports')throw new Error('Unexpected Precision navigation: '+JSON.stringify(navLabels));
  if(navLabels.some(x=>/storage/i.test(x)))throw new Error('Storage must remain a Spills subtab, not a primary workspace: '+JSON.stringify(navLabels));
  const flowSurveySubtabs=await page.locator('.pw-secondary-nav button').allTextContents();
  if(flowSurveySubtabs.map(x=>x.trim()).join('|')!=='FDV Check|Rainfall Check|Volume Balance')throw new Error('Unexpected Flow Survey subtab sequence: '+JSON.stringify(flowSurveySubtabs));
  const workflowGuide=await page.locator('#workflowGuide').textContent();
  if(!workflowGuide.includes('Workflow')||!workflowGuide.includes('Survey')||!workflowGuide.includes('FSAT Event Response')||!workflowGuide.includes('volume balance'))throw new Error('Contextual Survey workflow guide is incomplete: '+workflowGuide);
  const activeTabStyle=await page.locator('.pw-primary-nav button[aria-current="page"]').evaluate(el=>({fontWeight:getComputedStyle(el).fontWeight,background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
  if(Number(activeTabStyle.fontWeight)<600||activeTabStyle.background==='rgba(0, 0, 0, 0)')throw new Error('Active Precision workspace does not visually stand out: '+JSON.stringify(activeTabStyle));
  await page.setInputFiles('#assocFileInput',await associationWorkbook());
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.survey?.association?.records?.length===3&&document.querySelectorAll('#surveyAssociationTable tbody > tr').length===3,null,{timeout:60000});
  if(await page.locator('#surveyAssociationTable tbody > tr').count()!==3)throw new Error('Association workbook did not produce three survey relationships');
  const assocText=await page.locator('#surveyAssociationPanel').textContent();
  if(!assocText.includes('authoritative')||!assocText.includes('FM03')||!assocText.includes('RG02'))throw new Error('Association precedence/context is not visible in Survey');
  const registryWithRelationships=await page.evaluate(()=>window.ICMProjectRegistry?.snapshot());
  if(!registryWithRelationships||registryWithRelationships.relationships.length<5||!registryWithRelationships.assets.some(x=>x.id==='FM03'))throw new Error('Association workbook was not projected into the project registry: '+JSON.stringify(registryWithRelationships));
  const assocLayout=await page.evaluate(()=>{const panel=document.querySelector('#surveyAssociationPanel').getBoundingClientRect();const wrap=document.querySelector('#surveyAssociationTable .survey-table-wrap').getBoundingClientRect();return{panelRight:panel.right,wrapRight:wrap.right};});
  if(assocLayout.wrapRight>assocLayout.panelRight+1)throw new Error('Survey association table escapes its panel: '+JSON.stringify(assocLayout));

  stage='professional FDV and rainfall assessment';
  await precisionRoute('survey','rainfall-response');
  const surveyDepth=await optionValue('#surveyDepthSelect','observed.csv — depth');
  const surveyVelocity=await optionValue('#surveyVelocitySelect','observed.csv — velocity');
  const surveyFlow=await optionValue('#surveyFlowSelect','observed.csv — flow');
  const surveyRain=await optionValue('#surveyRainSelect','rainfall.csv — rainfall');
  if(!surveyDepth||!surveyVelocity||!surveyFlow||!surveyRain)throw new Error('Professional survey mapping options are missing');
  await page.selectOption('#surveyDepthSelect',surveyDepth);
  await page.selectOption('#surveyVelocitySelect',surveyVelocity);
  await page.selectOption('#surveyFlowSelect',surveyFlow);
  await page.selectOption('#surveyRainSelect',surveyRain);
  await page.selectOption('#surveyDepthUnit','m');
  await page.selectOption('#surveyVelocityUnit','m/s');
  await page.selectOption('#surveyFlowUnit','m3/s');
  await page.selectOption('#surveyPopulation','under50');
  await page.click('#runProfessionalSurveyBtn');
  await page.waitForFunction(()=>document.querySelector('#professionalSurveyStatus')?.textContent.includes('Assessment complete'),null,{timeout:90000});
  const professional=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastProfessionalSurvey);
  if(!professional?.network||professional.network.gauge_count<2)throw new Error(`Professional rainfall network assessment missing: ${JSON.stringify(professional)}`);
  if(!professional?.monitor?.weeks?.length)throw new Error(`Professional weekly monitor assessment missing: ${JSON.stringify(professional)}`);
  if(await page.locator('#professionalWeeklyBody tr').count()<1)throw new Error('Professional weekly monitor table is empty');
  if(!((await page.locator('#professionalSurveyMethod').textContent())||'').includes('18 h'))throw new Error('Professional assessment methodology is not exposed in the UI');

  stage='complete association-driven survey assessment';
  await precisionRoute('survey','rainfall-response');
  await page.setInputFiles('#fileInput',[
    {name:'FM01.fdv',mimeType:'text/plain',buffer:surveyFdv('FM01',0.10,0.20,0.40)},
    {name:'FM02.fdv',mimeType:'text/plain',buffer:surveyFdv('FM02',0.10,0.20,0.40)},
    {name:'FM03.fdv',mimeType:'text/plain',buffer:surveyRatingFdv('FM03')},
    {name:'RG01.r',mimeType:'text/plain',buffer:surveyRainfallR()},
    {name:'RG02.r',mimeType:'text/plain',buffer:surveyRainfallR()},
  ]);
  await page.waitForFunction(()=>{
    const rows=[...document.querySelectorAll('#poolBody tr')].map(row=>row.textContent||'');
    return ['FM01.fdv','FM02.fdv','FM03.fdv','RG01.r','RG02.r'].every(name=>rows.some(text=>text.includes(name)&&text.includes('Ready')));
  },null,{timeout:90000});
  await page.waitForFunction(()=>document.querySelector('#surveyAssociationSummary')?.textContent.includes('3/3'),null,{timeout:60000});
  await page.selectOption('#surveyPopulation','under50');
  await page.click('#runCompleteSurveyBtn');
  await page.waitForFunction(()=>document.querySelector('#completeSurveyStatus')?.textContent.includes('Complete survey assessment calculated'),null,{timeout:120000});
  const schematic=await page.evaluate(()=>({nodes:document.querySelectorAll('#surveyNetworkSchematic .schematic-monitor').length,pipes:document.querySelectorAll('#surveyNetworkSchematic .schematic-pipe-inner').length,text:document.querySelector('#surveyNetworkSchematic')?.textContent||''}));
  if(schematic.nodes<3||schematic.pipes<2||!schematic.text.includes('Association schematic'))throw new Error('Association-driven flow monitor schematic is incomplete: '+JSON.stringify(schematic));
  const completeToggle=page.locator('#completeSurveyPanel .tool-collapse-toggle').first();
  if(await completeToggle.count()){
    await completeToggle.click();
    if(!(await page.locator('#completeSurveyPanel').evaluate(el=>el.classList.contains('tool-collapsed'))))throw new Error('Complete Survey section did not collapse');
    await completeToggle.click();
  }
  const completeSurvey=await page.evaluate(()=>window.__ICM_WORKBENCH__.survey?.batch);
  if(!completeSurvey||completeSurvey.monitors?.length!==3)throw new Error('Complete survey did not assess all association-workbook monitors: '+JSON.stringify(completeSurvey));
  if(!completeSurvey.source_policy?.association_workbook_authoritative)throw new Error('Association workbook precedence is not explicit in complete survey result');
  const fm03Balance=(completeSurvey.volume_balance?.rows||[]).find(x=>x.downstream_monitor==='FM03');
  if(!fm03Balance||fm03Balance.rag!=='Green'||fm03Balance.legacy_fsat_status!=='OK')throw new Error('Expected FM03 downstream volume balance to reconcile Green/OK: '+JSON.stringify(fm03Balance));
  if(!((await page.locator('#surveyBalanceTable').textContent())||'').includes('Likely source / first check'))throw new Error('Volume-balance diagnostic recommendation column is missing');

  // Association/topology is a calculation dependency. Change the FM03 upstream
  // topology and require the already-calculated complete/balance evidence to
  // become stale without being silently deleted.
  const completeSignatureBeforeTopology=await page.evaluate(()=>window.__ICM_WORKBENCH__.surveyDependencySignature?.('complete'));
  await precisionRoute('survey','fdv-check');
  await page.setInputFiles('#assocFileInput',await associationWorkbook({variant:true}));
  await page.waitForFunction(previous=>window.__ICM_WORKBENCH__.surveyDependencySignature?.('complete')!==previous,completeSignatureBeforeTopology,{timeout:60000});
  const topologyStale=await page.evaluate(()=>({
    completeExists:Boolean(window.__ICM_WORKBENCH__.survey?.batch),
    balanceExists:Boolean(window.__ICM_WORKBENCH__.survey?.balance),
    completeFresh:window.__ICM_WORKBENCH__.surveyFresh?.('complete'),
    balanceFresh:window.__ICM_WORKBENCH__.surveyFresh?.('balance'),
  }));
  if(!topologyStale.completeExists||!topologyStale.balanceExists||topologyStale.completeFresh!==false||topologyStale.balanceFresh!==false)throw new Error('Association topology change did not stale dependent survey evidence: '+JSON.stringify(topologyStale));
  await page.setInputFiles('#assocFileInput',await associationWorkbook());
  await page.waitForFunction(original=>window.__ICM_WORKBENCH__.surveyDependencySignature?.('complete')===original,completeSignatureBeforeTopology,{timeout:60000});
  if(await page.evaluate(()=>window.__ICM_WORKBENCH__.surveyFresh?.('complete')!==true||window.__ICM_WORKBENCH__.surveyFresh?.('balance')!==true))throw new Error('Restoring the exact authoritative association context did not restore dependency equivalence.');

  // Capture Data Health again with representative FM/RG survey sources populated.
  await precisionRoute('survey','data-health');
  await page.click('#runHealthBtn');
  await page.waitForFunction(()=>document.querySelectorAll('#healthBody tr').length>=10,null,{timeout:120000});
  await captureEvidence('02-survey-data-health');
  await precisionRoute('survey','flow-continuity');
  const continuityLayout=await page.evaluate(()=>{
    const wrap=document.querySelector('#surveyBalanceTable .balance-table-wrap');
    const table=wrap?.querySelector('table');
    return{
      overflow:wrap?(wrap.scrollWidth-wrap.clientWidth):999,
      wrapWidth:wrap?.clientWidth||0,
      tableWidth:table?.getBoundingClientRect().width||0,
      headings:[...(table?.querySelectorAll('th')||[])].map(x=>x.textContent.trim())
    };
  });
  if(continuityLayout.overflow>2||Math.abs(continuityLayout.tableWidth-continuityLayout.wrapWidth)>2)throw new Error('Flow-continuity diagnostic table must fit its workspace without horizontal scrolling: '+JSON.stringify(continuityLayout));
  if(!continuityLayout.headings.includes('Likely source / first check')||!continuityLayout.headings.includes('Recommendation'))throw new Error('Flow-continuity table must retain diagnosis and recommendation evidence: '+JSON.stringify(continuityLayout.headings));
  await page.waitForFunction(()=>document.querySelector('#globalOperation')?.hidden===true&&!document.body.classList.contains('operation-busy'),null,{timeout:60000});
  await captureEvidence('03-survey-flow-continuity');

  stage='diameter-informed fm_rg_assoc rating curve';
  await precisionRoute('graphs','rating');
  const fm03RatingDepth=await optionValue('#ratingObsDepth','FM03.fdv — depth');
  const fm03RatingFlow=await optionValue('#ratingObsFlow','FM03.fdv — flow');
  if(!fm03RatingDepth||!fm03RatingFlow)throw new Error('FM03 rating depth/flow options are missing after association-driven import.');
  await page.selectOption('#ratingObsDepth',fm03RatingDepth);
  await page.selectOption('#ratingObsFlow',fm03RatingFlow);
  await page.selectOption('#ratingModelDepth','');
  await page.selectOption('#ratingModelFlow','');
  await page.click('#runRatingBtn');
  await page.waitForFunction(()=>document.querySelector('#ratingSummary')?.textContent.includes('Diameter-informed data fit'),null,{timeout:60000});
  const diameterRating=await page.evaluate(()=>({
    text:document.querySelector('#ratingSummary')?.textContent||'',
    diagnostic:window.__ICM_WORKBENCH__.lastRating||null,
    crownLines:(document.querySelector('#ratingChart')?.layout?.shapes||[]).filter(x=>x.xref==='x'&&x.yref==='paper').length,
  }));
  if(diameterRating.diagnostic?.monitor!=='FM03'||Number(diameterRating.diagnostic?.diameter_mm)!==600||diameterRating.crownLines<1||!diameterRating.text.includes('fm_rg_assoc.xlsx')){
    throw new Error('Monitor-specific fm_rg_assoc diameter was not applied/provenanced correctly: '+JSON.stringify(diameterRating));
  }
  await captureEvidence('08b-diameter-rating');

  stage='FDV stacked hydraulic graph';
  await precisionRoute('data','series-mapping');
  const fmDepth=await optionValue('#observedSelect','FM01.fdv — depth');
  const fmRain=await optionValue('#rainSelect','RG01.r — rainfall');
  if(!fmDepth||!fmRain)throw new Error('FM01 FDV depth or RG01 rainfall option missing');
  await page.selectOption('#observedSelect',fmDepth);
  await page.selectOption('#modelSelect',[]);
  await page.selectOption('#rainSelect',fmRain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphMode==='fdv-multi-variable',null,{timeout:60000});
  // The previous demo Depth threshold had unresolved units. FM01 resolves Depth
  // explicitly to metres, so the unit-safe remapping contract must clear the
  // old numeric value rather than silently reinterpret it. Reassign the
  // threshold explicitly in the new FDV context before testing its presentation.
  if(await page.inputValue('#obsThreshold')!=='')throw new Error('Unresolved-unit Depth threshold must be cleared when remapped to an explicitly metre-based FDV Depth series.');
  await precisionRoute('data','time-series');
  await page.fill('#graphObsThreshold','0.20');
  await page.waitForFunction(()=>{
    const chart=document.querySelector('#timeChart');
    const lines=(chart?.layout?.shapes||[]).filter(s=>s.type==='line'&&s.yref!=='paper');
    return lines.length===1&&Math.abs(Number(lines[0].y0)-0.20)<1e-9;
  },null,{timeout:60000});
  const fdvThresholdControls=await page.evaluate(()=>({
    observedHidden:document.querySelector('#v2GraphToolbar [data-threshold-role="observed"]')?.hidden,
    modelHidden:document.querySelector('#v2GraphToolbar [data-threshold-role="model"]')?.hidden
  }));
  if(fdvThresholdControls.observedHidden!==false||fdvThresholdControls.modelHidden!==true)throw new Error('Observed-only FDV graph must expose only the observed depth-threshold control: '+JSON.stringify(fdvThresholdControls));
  const fdvGraph=await page.evaluate(()=>{
    const chart=document.querySelector('#timeChart');
    const axes=Object.entries(chart.layout).filter(([k])=>/^yaxis\d*$/.test(k)).map(([key,a])=>({key,title:a.title?.text||a.title||'',domain:a.domain,overlaying:a.overlaying,range:a.range}));
    const axisRef=key=>key==='yaxis'?'y':key.replace('yaxis','y');
    const depthAxis=axes.find(x=>/Depth/i.test(String(x.title)));
    const depthRef=depthAxis?axisRef(depthAxis.key):null;
    const thresholdShapes=(chart.layout.shapes||[]).filter(s=>s.type==='line'&&s.yref!=='paper');
    const thresholdTraces=(chart.data||[]).filter(t=>/threshold|spill level/i.test(String(t.name||'')));
    return{
      order:window.__ICM_WORKBENCH__.lastPanelOrder,
      names:chart.data.map(t=>t.name),
      axes,
      depthRef,
      thresholdShapes:thresholdShapes.map(s=>({yref:s.yref,y0:s.y0,y1:s.y1,dash:s.line?.dash})),
      thresholdTraces:thresholdTraces.map(t=>({name:t.name,yaxis:t.yaxis||'y',dash:t.line?.dash})),
      xaxis:{anchor:chart.layout.xaxis?.anchor,position:chart.layout.xaxis?.position,side:chart.layout.xaxis?.side,title:chart.layout.xaxis?.title?.text||chart.layout.xaxis?.title||'',range:chart.layout.xaxis?.range},
      annotations:(chart.layout.annotations||[]).map(a=>String(a.text||'')),
      table:(()=>{const t=chart.data.find(x=>x.type==='table');return t?{header:(t.header?.values||[]).map(v=>String(v).replace(/<[^>]+>/g,'')),series:(t.cells?.values?.[0]||[]).map(String),units:(t.cells?.values?.[1]||[]).map(String),totals:(t.cells?.values?.[5]||[]).map(String),domain:t.domain?.y}:null;})(),
      colours:Object.fromEntries(chart.data.filter(t=>t.type!=='table'&&t.name).map(t=>[t.name,t.line?.color||t.marker?.color||null])),
      externalStatsHidden:document.querySelector('#graphStatistics')?.hidden===true
    };
  });
  if(JSON.stringify(fdvGraph.order)!==JSON.stringify(['rainfall','flow','depth','velocity']))throw new Error('FDV panel order must be rainfall/flow/depth/velocity: '+JSON.stringify(fdvGraph));
  if(fdvGraph.axes.some(x=>x.overlaying))throw new Error('FDV hydraulic channels must use separate stacked panels, not overlay axes: '+JSON.stringify(fdvGraph.axes));
  for(const token of ['Rainfall','Flow','Depth','Velocity'])if(!fdvGraph.axes.some(x=>String(x.title).includes(token)))throw new Error('Missing FDV panel/unit axis '+token+': '+JSON.stringify(fdvGraph.axes));
  if(fdvGraph.xaxis.anchor!=='free'||!(Number(fdvGraph.xaxis.position)>.12&&Number(fdvGraph.xaxis.position)<.30)||fdvGraph.xaxis.side!=='bottom')throw new Error('FDV time axis must be shared at the bottom of the hydraulic panels, above the statistics band: '+JSON.stringify(fdvGraph.xaxis));
  if(!Array.isArray(fdvGraph.xaxis.range)||!String(fdvGraph.xaxis.range[0]||'').startsWith('2026-01-05')||!String(fdvGraph.xaxis.range[1]||'').startsWith('2026-01-05'))throw new Error('FDV default time range must come from the currently mapped 5 Jan support, not stale event overlays: '+JSON.stringify(fdvGraph.xaxis.range));
  for(const token of ['Rainfall','Flow','Depth','Velocity'])if(!fdvGraph.annotations.some(x=>x.includes(token)))throw new Error('FDV panel heading missing for '+token+': '+JSON.stringify(fdvGraph.annotations));
  if(!fdvGraph.depthRef||fdvGraph.thresholdShapes.some(x=>x.yref!==fdvGraph.depthRef))throw new Error('Every visible threshold line must belong to the Depth axis only: '+JSON.stringify(fdvGraph));
  if(fdvGraph.thresholdTraces.length!==1||fdvGraph.thresholdTraces[0].yaxis!==fdvGraph.depthRef)throw new Error('With no model selected, only the observed depth threshold may appear: '+JSON.stringify(fdvGraph.thresholdTraces));
  if(!fdvGraph.table||JSON.stringify(fdvGraph.table.header)!==JSON.stringify(['Series','Unit','Min','Max','Average','Total']))throw new Error('FDV graph must contain the reference-style Plotly statistics band: '+JSON.stringify(fdvGraph.table));
  for(const row of ['Observed Flow','Observed Depth','Observed Velocity','Rainfall'])if(!fdvGraph.table.series.some(x=>x.includes(row)))throw new Error('FDV statistics row missing '+row+': '+JSON.stringify(fdvGraph.table.series));
  if(!fdvGraph.table.units.some(x=>/mm\/h/i.test(x)))throw new Error('Rainfall statistics must expose mm/h: '+JSON.stringify(fdvGraph.table.units));
  if(fdvGraph.colours['Observed flow']?.toLowerCase()!=='#d32f2f'||fdvGraph.colours['Observed depth']?.toLowerCase()!=='#d32f2f'||fdvGraph.colours['Observed velocity']?.toLowerCase()!=='#d32f2f'||fdvGraph.colours['Rainfall']?.toLowerCase()!=='#4a90e2')throw new Error('FDV default colours do not match the observed-red reference convention: '+JSON.stringify(fdvGraph.colours));
  if(!fdvGraph.externalStatsHidden)throw new Error('FDV statistics must not be duplicated outside the Plotly figure.');
  await precisionRoute('data','time-series');
  await captureEvidence('01b-fdv-stacked-graph');
  await precisionRoute('data','series-mapping');
  // Restore the two-scenario comparison mapping used by the remainder of the
  // acceptance workflow so workspace/report persistence is exercised against
  // the same multi-scenario state already proven above.
  await page.selectOption('#observedSelect',obsDepth);
  await page.selectOption('#modelSelect',[modelDepth,variantDepth]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('2 comparison scenario'),null,{timeout:60000});
  stage='spill exclusions in Asia/Kolkata and annual comparison';
  await precisionRoute('spills','thresholds');
  // Multiple comparison scenarios require an explicit active spill model.
  // Select model.csv so observed/model spill acceptance is deterministic and
  // does not rely on a hidden default after the earlier observed-only FDV phase.
  await page.selectOption('#spillModelSelect',modelDepth);
  await page.fill('#obsThreshold','1.0');
  await page.fill('#modelThreshold','1.0');
  await page.click('#addExclusionBtn');
  await page.fill('.ex-row [data-field="start"]','2026-01-01T00:08');
  await page.fill('.ex-row [data-field="end"]','2026-01-01T00:10');
  await page.fill('.ex-row [data-field="reason"]','Automated acceptance-test exclusion');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>document.querySelector('#spillRunStatus')?.textContent.includes('Completed in'),null,{timeout:60000});
  await page.waitForFunction(()=>!document.body.classList.contains('operation-busy'),null,{timeout:10000});
  const exclusionLayout=await page.evaluate(()=>{const row=document.querySelector('.ex-row');const start=row?.querySelector('label:nth-of-type(2)')?.getBoundingClientRect();const reason=row?.querySelector('label:nth-of-type(5)')?.getBoundingClientRect();const check=row?.querySelector('input[type="checkbox"]')?.getBoundingClientRect();return{reasonBelow:Boolean(start&&reason&&reason.top>start.top+4),checkboxWidth:check?.width||0};});
  if(!exclusionLayout.reasonBelow||exclusionLayout.checkboxWidth>22)throw new Error('Exclusion editor did not resolve to the intended two-row hierarchy: '+JSON.stringify(exclusionLayout));
  await captureEvidence('04-spill-thresholds-exclusions');
  await precisionRoute('spills','results');
  await page.waitForSelector('#obsMonthly .v2-yearly-title',{timeout:60000});
  await page.waitForSelector('#modelMonthly .v2-yearly-title',{timeout:60000});
  if(await page.locator('#spillComparison tbody tr').count()<1)throw new Error('Annual observed/model spill comparison missing');
  const spillDiag=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastSpills);
  if(!spillDiag?.observed)throw new Error(`Observed spill diagnostic missing: ${JSON.stringify(spillDiag)}`);
  if(Math.abs(Number(spillDiag.observed.excluded_seconds)-120)>0.001)throw new Error(`Expected 120 seconds excluded in model clock, got ${JSON.stringify(spillDiag)}`);
  if(!spillDiag.observed.yearly?.length)throw new Error('Yearly spill summary missing from browser diagnostic');
  console.log('NUMERICAL_PARITY '+JSON.stringify({rainfall_totals_mm:totals.map(x=>Number(x.total_mm)),fm03_balance_ratio:Number(fm03Balance.balance_ratio),fm03_rag:fm03Balance.rag,fm03_legacy:fm03Balance.legacy_fsat_status,excluded_seconds:Number(spillDiag.observed.excluded_seconds)}));

  stage='storage and monthly volume';
  await precisionRoute('verification','storage');
  await page.locator('#tab-storage').scrollIntoViewIfNeeded();
  const level=await optionValue('#storageLevelSelect','model.csv — depth');
  const flow=await optionValue('#storageFlowSelect','model.csv — flow');
  await page.selectOption('#storageLevelSelect',level);await page.selectOption('#storageFlowSelect',flow);
  await page.selectOption('#storageLevelUnit','m');await page.selectOption('#storageFlowUnit','m3/s');
  await page.fill('#storageThreshold','1.0');
  await page.click('#runStorageBtn');
  await page.waitForFunction(()=>Boolean(window.__ICM_WORKBENCH__.lastStorage),null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#storageSummary')?.textContent.trim().length>0&&document.querySelector('#monthlyVolume')?.textContent.trim().length>0,null,{timeout:60000});
  await captureEvidence('11-verification-storage');

  stage='workspace persistence and reports';
  await precisionRoute('report','workspace');
  await page.fill('#workspaceName','Acceptance workspace');
  await page.click('#saveNamedWorkspaceBtn');
  await page.waitForFunction(()=>[...document.querySelectorAll('#namedWorkspaceSelect option')].some(o=>o.textContent==='Acceptance workspace'));

  const workspaceDownload=await downloadFrom('#downloadWorkspaceBtn');
  const workspacePath=await workspaceDownload.path();
  const workspace=JSON.parse(await fs.readFile(workspacePath,'utf8'));
  if(workspace.schema_version!==3||workspace.time_basis!=='model clock/unspecified')throw new Error(`Unexpected workspace schema/time basis: ${JSON.stringify(workspace)}`);
  if(workspace.report_options?.scatter_scale!=='current'||workspace.report_options?.include_time_series!==true||workspace.report_options?.include_spills_storage!==true||workspace.report_options?.include_comparison!==true||workspace.report_options?.include_survey!==true||!workspace.report_options?.scenarios?.length)throw new Error('Workspace did not persist report section/scatter/scenario options: '+JSON.stringify(workspace.report_options));
  if(workspace.exclusions?.[0]?.start!=='2026-01-01T00:08')throw new Error(`Exclusion wall clock shifted in Asia/Kolkata: ${JSON.stringify(workspace.exclusions)}`);
  if(workspace.exclusions?.[0]?.end!=='2026-01-01T00:10')throw new Error(`Exclusion end shifted in Asia/Kolkata: ${JSON.stringify(workspace.exclusions)}`);
  if(workspace.analysis?.dwf_flow?.column!=='flow'||workspace.analysis?.dwf_flow_unit!=='m3/s'||Number(workspace.analysis?.dwf_dry_day_mm)!==1||Number(workspace.analysis?.dwf_baseline_days)!==28||Number(workspace.analysis?.dwf_adp_hours)!==6)throw new Error('DWF source/unit/criteria were not persisted in the workspace: '+JSON.stringify(workspace.analysis));
  const savedRatingUnits={
    obsDepth:workspace.analysis?.rating_obs_depth_unit,
    obsFlow:workspace.analysis?.rating_obs_flow_unit,
    modelDepth:workspace.analysis?.rating_model_depth_unit,
    modelFlow:workspace.analysis?.rating_model_flow_unit,
  };
  if(JSON.stringify(savedRatingUnits)!==JSON.stringify({obsDepth:'m',obsFlow:'m3/s',modelDepth:'m',modelFlow:'m3/s'}))throw new Error('Rating unit overrides were not persisted in the workspace: '+JSON.stringify(savedRatingUnits));

  // A workspace must not advertise completion before its asynchronous mapping
  // and graph restoration has actually finished.
  await page.evaluate(()=>{
    const original=window.ICMGraph.applyMapping;
    const status=document.querySelector('#workspaceStatus');
    window.__workspaceRestoreProbe={completed:false,prematureLoaded:false};
    const observer=new MutationObserver(()=>{
      if(status?.textContent.includes('Workspace loaded.')&&!window.__workspaceRestoreProbe.completed){
        window.__workspaceRestoreProbe.prematureLoaded=true;
      }
    });
    if(status)observer.observe(status,{childList:true,subtree:true,characterData:true});
    window.ICMGraph.applyMapping=async function(...args){
      await new Promise(resolve=>setTimeout(resolve,300));
      try{return await original.apply(this,args);}
      finally{
        window.__workspaceRestoreProbe.completed=true;
        window.ICMGraph.applyMapping=original;
      }
    };
  });
  // Report choices belong to Report Generation under the canonical Precision
  // navigation. Mutate them there, then return to Workspace Save / Restore to
  // prove that loading the workspace restores those choices.
  await precisionRoute('reports','report-generation');
  await page.selectOption('#reportScatterScale','log');
  await page.uncheck('#reportIncludeSurvey');
  await page.selectOption('#reportScenarioSelect',[]);
  await precisionRoute('reports','workspace');
  await page.setInputFiles('#workspaceInput',workspacePath);
  await page.waitForFunction(()=>document.querySelector('#workspaceStatus')?.textContent.includes('Workspace loaded.'),null,{timeout:60000});
  const restoredReportOptions=await page.evaluate(()=>({
    scatter:document.querySelector('#reportScatterScale')?.value,
    includeSurvey:document.querySelector('#reportIncludeSurvey')?.checked,
    scenarios:[...document.querySelector('#reportScenarioSelect')?.selectedOptions||[]].length,
  }));
  if(restoredReportOptions.scatter!=='current'||restoredReportOptions.includeSurvey!==true||restoredReportOptions.scenarios<1)throw new Error('Workspace did not restore report choices after mapping relink: '+JSON.stringify(restoredReportOptions));
  await page.waitForFunction(()=>!document.body.classList.contains('operation-busy'),null,{timeout:10000});
  const restoreReady=await page.evaluate(()=>({
    mappingCompleted:Boolean(window.__workspaceRestoreProbe?.completed),
    prematureLoaded:Boolean(window.__workspaceRestoreProbe?.prematureLoaded),
    observedMapped:Boolean(state.mapping.observed),
    plottedTraces:Array.isArray(document.querySelector('#timeChart')?.data)?document.querySelector('#timeChart').data.length:0,
  }));
  if(!restoreReady.mappingCompleted||restoreReady.prematureLoaded||!restoreReady.observedMapped||restoreReady.plottedTraces<1)throw new Error(`Workspace announced loaded before restoration completed: ${JSON.stringify(restoreReady)}`);
  const restoredRatingUnits=await page.evaluate(()=>({
    obsDepth:document.querySelector('#ratingObsDepthUnit')?.value,
    obsFlow:document.querySelector('#ratingObsFlowUnit')?.value,
    modelDepth:document.querySelector('#ratingModelDepthUnit')?.value,
    modelFlow:document.querySelector('#ratingModelFlowUnit')?.value,
  }));
  if(JSON.stringify(restoredRatingUnits)!==JSON.stringify({obsDepth:'m',obsFlow:'m3/s',modelDepth:'m',modelFlow:'m3/s'}))throw new Error('Rating unit overrides were not restored: '+JSON.stringify(restoredRatingUnits));
  const restoredDwf=await page.evaluate(()=>({
    flow:document.querySelector('#dwfFlowSelect')?.selectedOptions?.[0]?.textContent||'',
    unit:document.querySelector('#dwfFlowUnit')?.value||'',
    dryDay:Number(document.querySelector('#dwfDryDay')?.value),
    baseline:Number(document.querySelector('#dwfBaselineDays')?.value),
    adp:Number(document.querySelector('#dwfAdpHours')?.value),
    fresh:window.__ICM_WORKBENCH__.dwfFresh?.(),
  }));
  if(!/observed\.csv — flow/i.test(restoredDwf.flow)||restoredDwf.unit!=='m3/s'||restoredDwf.dryDay!==1||restoredDwf.baseline!==28||restoredDwf.adp!==6||restoredDwf.fresh!==false)throw new Error('Workspace did not restore DWF configuration while correctly withholding derived DWF results: '+JSON.stringify(restoredDwf));

  stage='workspace migration and source reattachment guidance';
  const legacyWorkspace=JSON.parse(JSON.stringify(workspace));
  legacyWorkspace.schema_version=1;
  legacyWorkspace.navigation={workspace:'verification',page:'storage'};
  await page.setInputFiles('#workspaceInput',{name:'legacy-workspace-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacyWorkspace))});
  await page.waitForFunction(()=>document.querySelector('#workspaceStatus')?.textContent.includes('Workspace loaded.')&&
    window.__ICM_WORKBENCH__?.workspaceRestore?.navigation?.workspace==='spills'&&
    window.__ICM_WORKBENCH__?.workspaceRestore?.navigation?.page==='storage'&&
    window.__ICM_PRECISION_WORKBENCH__?.route?.().workspace==='spills'&&
    window.__ICM_PRECISION_WORKBENCH__?.route?.().page==='storage',null,{timeout:60000});
  const legacyRoute=await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.route());
  if(legacyRoute.workspace!=='spills'||legacyRoute.page!=='storage')throw new Error('Supported v1 workspace / legacy Storage route did not migrate to Spills / Storage Assessment: '+JSON.stringify(legacyRoute));

  const missingWorkspace=JSON.parse(JSON.stringify(workspace));
  missingWorkspace.source_references=[...(missingWorkspace.source_references||[]),{
    sha256:'0000000000000000000000000000000000000000000000000000000000000000',
    display_name:'missing-or-changed-source.csv',
    file_name:'missing-or-changed-source.csv',
    size:1234,
    format:'tabular_csv'
  }];
  await page.setInputFiles('#workspaceInput',{name:'workspace-missing-source.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(missingWorkspace))});
  await page.waitForFunction(()=>document.querySelector('#workspaceStatus')?.textContent.includes('Workspace loaded with unresolved sources.'),null,{timeout:60000});
  const reattachGuidance=(await page.locator('#workspaceStatus').textContent())||'';
  if(!reattachGuidance.includes('Reattach missing or changed files in Data / Sources')||!reattachGuidance.includes('Not run or Stale'))throw new Error('Missing/changed workspace sources lack actionable reattachment/staleness guidance: '+reattachGuidance);

  const beforeUnsupported=await page.evaluate(()=>({mapping:JSON.stringify(state.mapping),files:state.files.size}));
  await page.setInputFiles('#workspaceInput',{name:'unsupported-workspace-v99.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema_version:99,navigation:{workspace:'data',page:'sources'}}))});
  await page.waitForFunction(()=>/Unsupported workspace schema version 99/i.test(document.querySelector('#workspaceStatus')?.textContent||''),null,{timeout:10000});
  const afterUnsupported=await page.evaluate(()=>({mapping:JSON.stringify(state.mapping),files:state.files.size,status:document.querySelector('#workspaceStatus')?.textContent||''}));
  if(afterUnsupported.mapping!==beforeUnsupported.mapping||afterUnsupported.files!==beforeUnsupported.files)throw new Error('Unsupported workspace schema mutated the active workspace before failing safely: '+JSON.stringify({beforeUnsupported,afterUnsupported}));
  // This is an intentional negative-path acceptance case. Once the safe,
  // non-mutating rejection has been asserted, consume its expected diagnostic so
  // the final browser-error gate remains reserved for unexpected failures.
  for(let i=consoleErrors.length-1;i>=0;i--){
    if(/Unsupported workspace schema version 99/i.test(consoleErrors[i]))consoleErrors.splice(i,1);
  }
  await page.evaluate(()=>{
    const errors=window.__ICM_WORKBENCH__?.errors;
    if(!Array.isArray(errors))return;
    for(let i=errors.length-1;i>=0;i--){
      if(/Unsupported workspace schema version 99/i.test(String(errors[i]?.message||'')))errors.splice(i,1);
    }
  });

  // Return to the canonical current workspace before recalculating report inputs.
  await page.setInputFiles('#workspaceInput',workspacePath);
  await page.waitForFunction(()=>document.querySelector('#workspaceStatus')?.textContent.startsWith('Workspace loaded.'),null,{timeout:60000});

  // Workspace import intentionally invalidates calculated snapshots. Recalculate every
  // analysis used by the report rather than weakening stale-result export guards.
  await clickTab('compare');
  await page.click('#runCompareBtn');
  await page.waitForFunction(()=>Boolean(state.comparisonSnapshot)&&state.comparisonSnapshot.signature===analysisSignature());
  await precisionRoute('spills','thresholds');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>Boolean(state.spillSnapshot)&&state.spillSnapshot.signature===analysisSignature(),null,{timeout:60000});
  const freshObservedThreshold=await page.inputValue('#obsThreshold');
  const changedObservedThreshold=String(Number(freshObservedThreshold||0)+0.01);
  await page.fill('#obsThreshold',changedObservedThreshold);
  await precisionRoute('reports','report-generation');
  await page.waitForFunction(()=>document.querySelector('#reportPreflight [data-result="spill"] .report-readiness-state')?.textContent.trim()==='Stale');
  await precisionRoute('spills','assessment');
  await page.fill('#obsThreshold',freshObservedThreshold);
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>Boolean(state.spillSnapshot)&&state.spillSnapshot.signature===analysisSignature(),null,{timeout:60000});
  await precisionRoute('spills','results');
  const spillLayout=await page.evaluate(()=>{const panel=document.querySelector('#tab-spills .panel')?.getBoundingClientRect();const wraps=[...document.querySelectorAll('#tab-spills .two-col .table-wrap')].map(x=>x.getBoundingClientRect());return {panelRight:panel?.right||0,wraps:wraps.map(x=>({left:x.left,right:x.right,width:x.width}))};});
  if(spillLayout.wraps.some(x=>x.right>spillLayout.panelRight+1))throw new Error(`Spill yearly tables escape the panel: ${JSON.stringify(spillLayout)}`);

  // Workspace import invalidates derived storage evidence as well. Re-run Storage
  // on the restored source/unit/threshold inputs so Report Generation is tested
  // against a fresh dependency-signed storage result rather than weakening the
  // stale-result guard.
  await precisionRoute('spills','storage');
  await page.click('#runStorageBtn');
  await page.waitForFunction(()=>Boolean(state.storage)&&state.storageSignature===storageInputSignature(),null,{timeout:60000});

  // File/exclusion changes correctly invalidate survey snapshots. Re-run both the
  // legacy single-monitor assessment and the association-driven complete survey
  // so report assertions exercise fresh, auditable results.
  await precisionRoute('survey','rainfall-response');
  await page.click('#runProfessionalSurveyBtn');
  await page.waitForFunction(()=>Boolean(window.__ICM_WORKBENCH__.lastProfessionalSurvey),null,{timeout:120000});
  await page.click('#runCompleteSurveyBtn');
  await page.waitForFunction(()=>Boolean(window.__ICM_WORKBENCH__.survey?.batch),null,{timeout:120000});

  // Workspace restore invalidates the derived rating result. Recalculate it on the
  // restored monitor-specific inputs so report export is proven against fresh,
  // authoritative rating evidence rather than a persisted/stale chart.
  await precisionRoute('graphs','rating');
  const restoredFm03Depth=await optionValue('#ratingObsDepth','FM03.fdv — depth');
  const restoredFm03Flow=await optionValue('#ratingObsFlow','FM03.fdv — flow');
  if(!restoredFm03Depth||!restoredFm03Flow)throw new Error('Restored workspace lost FM03 rating inputs.');
  await page.selectOption('#ratingObsDepth',restoredFm03Depth);
  await page.selectOption('#ratingObsFlow',restoredFm03Flow);
  await page.selectOption('#ratingModelDepth','');
  await page.selectOption('#ratingModelFlow','');
  await page.click('#runRatingBtn');
  await page.waitForFunction(()=>Boolean(state.rating)&&state.rating.signature===ratingInputSignature()&&document.querySelector('#ratingSummary')?.textContent.includes('Diameter-informed data fit'),null,{timeout:60000});

  // Regression guard for live-regression #11: presentation-only rerenders must
  // not invalidate a fresh engineering result when the exclusion state is unchanged.
  const surveyBeforeExclusionRerender=await page.evaluate(()=>({
    batch:Boolean(window.__ICM_WORKBENCH__.survey?.batch),
    balance:Boolean(window.__ICM_WORKBENCH__.survey?.balance),
    exclusions:JSON.stringify(state.exclusions||[]),
  }));
  await page.evaluate(()=>renderExclusions());
  await page.waitForTimeout(0);
  const surveyAfterExclusionRerender=await page.evaluate(()=>({
    batch:Boolean(window.__ICM_WORKBENCH__.survey?.batch),
    balance:Boolean(window.__ICM_WORKBENCH__.survey?.balance),
    exclusions:JSON.stringify(state.exclusions||[]),
  }));
  if(!surveyAfterExclusionRerender.batch||!surveyAfterExclusionRerender.balance||surveyAfterExclusionRerender.exclusions!==surveyBeforeExclusionRerender.exclusions)throw new Error(`DOM-only exclusion rerender invalidated unchanged survey results: ${JSON.stringify({before:surveyBeforeExclusionRerender,after:surveyAfterExclusionRerender})}`);

  // Regression guard: rendering the source table is presentation-only and must not
  // invalidate source-dependent engineering results when state.files is unchanged.
  const sourceResultBeforeDomRender=await page.evaluate(()=>({
    professional:Boolean(window.__ICM_WORKBENCH__.lastProfessionalSurvey),
    complete:Boolean(window.__ICM_WORKBENCH__.survey?.batch),
    balance:Boolean(window.__ICM_WORKBENCH__.survey?.balance),
    fileCount:state.files.size,
  }));
  await page.evaluate(()=>renderPool());
  await page.waitForTimeout(0);
  const sourceResultAfterDomRender=await page.evaluate(()=>({
    professional:Boolean(window.__ICM_WORKBENCH__.lastProfessionalSurvey),
    complete:Boolean(window.__ICM_WORKBENCH__.survey?.batch),
    balance:Boolean(window.__ICM_WORKBENCH__.survey?.balance),
    fileCount:state.files.size,
  }));
  if(!sourceResultAfterDomRender.professional||!sourceResultAfterDomRender.complete||!sourceResultAfterDomRender.balance||sourceResultAfterDomRender.fileCount!==sourceResultBeforeDomRender.fileCount)throw new Error(`DOM-only source-pool rerender invalidated unchanged results: ${JSON.stringify({before:sourceResultBeforeDomRender,after:sourceResultAfterDomRender})}`);

  await clickTab('workspace');
  await page.waitForSelector('#reportPreflight',{timeout:10000});
  const readiness=await page.evaluate(()=>Object.fromEntries(
    [...document.querySelectorAll('#reportPreflight [data-result]')].map(item=>[
      item.dataset.result,
      {
        label:item.querySelector('.report-readiness-state')?.textContent?.trim()||'',
        state:item.querySelector('.report-readiness-state')?.dataset.state||'',
        reason:item.querySelector('.report-readiness-reason')?.textContent?.trim()||''
      }
    ])
  ));
  if(readiness.comparison?.label!=='Partial')throw new Error('Demo comparison has incomplete valid support and must be reported as Partial, not Current: '+JSON.stringify(readiness.comparison));
  for(const key of ['spill','storage','professional-survey','complete-survey','volume-balance','rating']){
    const row=readiness[key];
    if(!row||!['Current','Partial','Blocked'].includes(row.label)||!row.reason)throw new Error(`Report readiness for ${key} must expose a current/partial/blocked engineering state with a reason: ${JSON.stringify(row)}`);
  }
  if(readiness['survey-association']?.label!=='Current'||!readiness['survey-association']?.reason)throw new Error('Loaded survey association must be reported as Current with dependency context: '+JSON.stringify(readiness['survey-association']));
  const reportOptionsUi=await page.evaluate(()=>({
    sections:['reportIncludeTimeSeries','reportIncludeSpillsStorage','reportIncludeComparison','reportIncludeSurvey'].map(id=>({id,checked:document.getElementById(id)?.checked})),
    scatter:document.querySelector('#reportScatterScale')?.value,
    scenarios:[...document.querySelector('#reportScenarioSelect')?.selectedOptions||[]].map(o=>o.textContent.trim()),
  }));
  if(reportOptionsUi.sections.some(x=>x.checked!==true)||reportOptionsUi.scatter!=='current'||reportOptionsUi.scenarios.length<2)throw new Error('Report Generation options did not initialise with both mapped model scenarios: '+JSON.stringify(reportOptionsUi));
  const reportScenarioChoices=await page.locator('#reportScenarioSelect option').evaluateAll(options=>options.map(o=>({value:o.value,label:o.textContent.trim()})));
  if(reportScenarioChoices.length<2)throw new Error('Report scenario selector did not expose both mapped model scenarios: '+JSON.stringify(reportScenarioChoices));
  await page.selectOption('#reportScenarioSelect',[reportScenarioChoices[0].value]);
  await page.selectOption('#reportScatterScale','log');
    const reportSpacing=await page.evaluate(()=>{const top=document.querySelector('#namedWorkspaceSelect')?.closest('.actions')?.getBoundingClientRect();const bottom=document.querySelector('.report-actions')?.getBoundingClientRect();return{gap:top&&bottom?bottom.top-top.bottom:null};});
  if(reportSpacing.gap!=null&&reportSpacing.gap<8)throw new Error('Report action controls are still crowded: '+JSON.stringify(reportSpacing));
  await captureEvidence('05-report-workspace');
  const reportDownload=await downloadFrom('#downloadReportBtn');
  const report=await fs.readFile(await reportDownload.path(),'utf8');
  const reportPlotMarker='<script type="application/json" id="assessment-time-graph-data">';
  const reportPlotStart=report.indexOf(reportPlotMarker);
  const reportPlotEnd=reportPlotStart>=0?report.indexOf('</script>',reportPlotStart+reportPlotMarker.length):-1;
  if(reportPlotStart<0||reportPlotEnd<0)throw new Error('Assessment report full-period Plotly payload missing');
  const reportPlot=JSON.parse(report.slice(reportPlotStart+reportPlotMarker.length,reportPlotEnd));
  const populatedReportTraces=(reportPlot.data||[]).filter(t=>/^(Observed|Model|Rainfall)/.test(String(t.name||''))&&Array.isArray(t.x)&&t.x.filter(Boolean).length>0);
  if(populatedReportTraces.length<3)throw new Error('Assessment report full-period graph contains empty mapped traces: '+JSON.stringify((reportPlot.data||[]).map(t=>({name:t.name,points:(t.x||[]).filter(Boolean).length}))));
  const reportRange=reportPlot.layout?.xaxis?.range||[];
  if(!String(reportRange[0]||'').startsWith('2026-01-01T00:00')||!String(reportRange[1]||'').startsWith('2026-01-01T00:14'))throw new Error('Assessment report analytical period shifted from model clock: '+JSON.stringify(reportRange));
  const reportScatterMarker='<script type="application/json" id="assessment-scatter-report-data">';
  const reportScatterStart=report.indexOf(reportScatterMarker),reportScatterEnd=reportScatterStart>=0?report.indexOf('</script>',reportScatterStart+reportScatterMarker.length):-1;
  if(reportScatterStart<0||reportScatterEnd<0)throw new Error('Selected report scatter payload missing.');
  const reportScatter=JSON.parse(report.slice(reportScatterStart+reportScatterMarker.length,reportScatterEnd));
  const selectedScatterMarkers=(reportScatter.data||[]).filter(t=>t.mode==='markers');
  if(selectedScatterMarkers.length!==1||!String(selectedScatterMarkers[0].name||'').includes(reportScenarioChoices[0].label.split(' — ')[0]))throw new Error('Report did not honor the selected single-scenario subset: '+JSON.stringify({choices:reportScenarioChoices,markers:selectedScatterMarkers.map(t=>t.name)}));
  if(reportScatter.layout?.xaxis?.type!=='log'||reportScatter.layout?.yaxis?.type!=='log')throw new Error('Report-selected log scatter was not rendered on logarithmic axes.');
  if(!report.includes('© 2026 Anzar Sajid'))throw new Error('Report copyright missing');
  if(!report.includes('Audit appendix'))throw new Error('Report audit appendix missing');
  if(!report.includes('project_registry')||!report.includes('web-worker'))throw new Error('Report audit appendix is missing canonical project registry / worker execution provenance');
  if(!report.includes('report-header')||!report.includes('Assessment configuration')||!report.includes('Full time-period graph')||!report.includes('Project data context')||!report.includes('Source provenance'))throw new Error('Professional assessment report structure missing');
  const reportGraphIndex=report.indexOf('Full time-period graph'),reportSpillIndex=report.indexOf('Spill / EDM assessment'),reportScenarioIndex=report.indexOf('Scenario comparison');
  if(!(reportGraphIndex>=0&&reportSpillIndex>reportGraphIndex&&reportScenarioIndex>reportSpillIndex))throw new Error('Assessment report must follow the supplied Station A review order: full-period graph, spill/EDM tables, then scenario diagnostics.');
  if(!report.includes('Observed / EDM hydraulic threshold')||!report.includes('Model hydraulic threshold'))throw new Error('Assessment report settings must identify the observed and model hydraulic threshold values explicitly.');
  if(report.includes('<h3>Graph statistics</h3>'))throw new Error('Assessment report should not duplicate graph statistics outside the reference-style figure.');
  if(!report.includes('Observed spills by month')||!report.includes('Model spills by month')||!report.includes('Observed vs modelled monthly spill comparison'))throw new Error('Assessment report is missing the reference-style monthly spill tables.');
  if(!report.includes('Professional flow-survey / rainfall assessment')||!report.includes('professional_flow_survey'))throw new Error('Professional flow-survey assessment missing from report/audit appendix');
  if(!report.includes('Complete flow-survey context')||!report.includes('Flow continuity / volume balance')||!report.includes('fm_rg_assoc.xlsx'))throw new Error('Association-driven complete survey context missing from exported report');
  if(!report.includes('Diameter-informed empirical Q–H rating curve')||!report.includes('rating_diagnostic')||!report.includes('600 mm'))throw new Error('Fresh diameter-informed rating chart/provenance missing from exported report');
  if(!report.includes('Observed vs modelled log₁₀ scatter')||!report.includes('Positive observed/modelled pairs only'))throw new Error('Report-selected log scatter and its positive-only population note are missing.');
  if(!report.includes('Storage Assessment'))throw new Error('Selected Storage Assessment section is missing from the report.');
  if(report.includes('Cumulative-volume diagnostic where dimensional flow support is available.')||report.includes('Time-weighted exceedance diagnostic where available.'))throw new Error('Unavailable flow-only diagnostics must not be exported as blank report figures');

  if(!report.includes('report-grid')||!report.includes('table-wrap'))throw new Error('Professional report layout classes missing');
  const reportLayout=await inspectReportHtml(report,3);
  if(reportLayout.headers!==1||reportLayout.figures<reportLayout.minFigures||reportLayout.zero||reportLayout.overflow>2)throw new Error(`Assessment report visual containment failed: ${JSON.stringify(reportLayout)}`);
  await page.fill('#reportYear','2026');
  const fourDownload=await downloadFrom('#downloadFourPeriodBtn');
  const fourReport=await fs.readFile(await fourDownload.path(),'utf8');
  if(!fourReport.includes('Four-Period Report')||!fourReport.includes('separate rainfall band'))throw new Error('Four-period report methodology/layout note missing');
  if((fourReport.match(/class="report-page"/g)||[]).length!==4)throw new Error('Four-period report should contain four print-safe period pages');
  if(!fourReport.includes('A4 landscape'))throw new Error('Four-period report should use landscape print layout');
  if((fourReport.match(/Period statistics/g)||[]).length!==0)throw new Error('Four-period report should integrate statistics in each Plotly figure rather than duplicate separate tables');
  const fourLayout=await inspectReportHtml(fourReport,4);
  if(fourLayout.headers!==1||fourLayout.figures!==4||fourLayout.zero||fourLayout.overflow>2)throw new Error(`Four-period report visual containment failed: ${JSON.stringify(fourLayout)}`);
  if(await page.locator('#downloadManifestBtn').count()!==0)throw new Error('Standalone provenance CSV export should not be user-facing.');
  const reportNavText=(await page.locator('.pw-secondary-nav').textContent())||'';
  if(/Provenance/i.test(reportNavText))throw new Error('Standalone provenance page should be removed from Report navigation.');

  stage='uploaded current-tool FDV reference regression';
  await precisionRoute('data','sources');
  const referenceFdv=await fs.readFile(path.join(root,'reference/current-tool/sample-data/fdv/FM01.fdv'));
  const referenceRain=await fs.readFile(path.join(root,'reference/current-tool/sample-data/rainfall/RG01.R'));
  const beforeReferenceFiles=await page.locator('#poolBody tr').count();
  const warmReferenceSelectedAt=Date.now();
  await page.setInputFiles('#fileInput',[
    {name:'Reference_FM01.fdv',mimeType:'text/plain',buffer:referenceFdv},
    {name:'Reference_RG01.R',mimeType:'text/plain',buffer:referenceRain},
  ]);
  await page.waitForFunction(expected=>document.querySelectorAll('#poolBody tr').length===expected,beforeReferenceFiles+2,{timeout:90000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].filter(r=>/Reference_(FM01|RG01)/.test(r.textContent)).every(r=>r.textContent.includes('Ready')),null,{timeout:90000});
  performanceEvidence.warmReferencePair={datasets:['FM01.fdv','RG01.R'],bytes:referenceFdv.length+referenceRain.length,authoritativeReadyMs:Date.now()-warmReferenceSelectedAt};
  await precisionRoute('data','series-mapping');
  const referenceDepth=await optionValue('#observedSelect','Reference_FM01.fdv — depth');
  const referenceRainKey=await optionValue('#rainSelect','Reference_RG01.R — rainfall');
  if(!referenceDepth||!referenceRainKey)throw new Error('Uploaded current-tool FM01/RG01 reference series did not parse into mapping options');
  await page.selectOption('#observedSelect',referenceDepth);
  await page.selectOption('#modelSelect',[]);
  await page.selectOption('#rainSelect',referenceRainKey);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphMode==='fdv-multi-variable'&&window.__ICM_WORKBENCH__.lastGraphStatistics?.length===4,null,{timeout:90000});
  performanceEvidence.warmReferencePair.firstMappedGraphMs=Date.now()-warmReferenceSelectedAt;
  await precisionRoute('data','time-series');
  await page.fill('#graphObsThreshold','');
  await page.waitForTimeout(500);
  const referenceEvidence=await page.evaluate(()=>{
    const stats=window.__ICM_WORKBENCH__.lastGraphStatistics||[];
    const byQuantity=Object.fromEntries(stats.map(row=>[String(row.statistics?.quantity||'').toLowerCase(),row.statistics]));
    const chart=document.querySelector('#timeChart'),table=chart.data.find(t=>t.type==='table');
    return{
      byQuantity,
      pointCounts:window.__ICM_WORKBENCH__.lastGraphPointCounts,
      order:window.__ICM_WORKBENCH__.lastPanelOrder,
      colours:Object.fromEntries(chart.data.filter(t=>t.type!=='table'&&t.name).map(t=>[t.name,t.line?.color||null])),
      tableHeader:(table?.header?.values||[]).map(v=>String(v).replace(/<[^>]+>/g,'')),
      tableSeries:(table?.cells?.values?.[0]||[]).map(String),
      tableTotals:(table?.cells?.values?.[5]||[]).map(String),
      xRange:chart.layout.xaxis?.range,
    };
  });
  const near=(actual,expected,tol=1e-6)=>Math.abs(Number(actual)-Number(expected))<=tol;
  const rf=referenceEvidence.byQuantity.flow,rd=referenceEvidence.byQuantity.depth,rv=referenceEvidence.byQuantity.velocity,rr=referenceEvidence.byQuantity.rainfall;
  if(!rf||!rd||!rv||!rr)throw new Error('Reference FM01/RG01 statistics quantities missing: '+JSON.stringify(referenceEvidence.byQuantity));
  if(!near(rf.minimum,.039)||!near(rf.maximum,.769)||!near(rf.mean,.128931055,1e-8))throw new Error('Reference FM01 flow statistics mismatch: '+JSON.stringify(rf));
  if(!near(rd.minimum,.113)||!near(rd.maximum,.47)||!near(rd.mean,.1882285105,1e-8))throw new Error('Reference FM01 depth statistics mismatch: '+JSON.stringify(rd));
  if(!near(rv.minimum,.42)||!near(rv.maximum,1.48)||!near(rv.mean,.8804642627,1e-8))throw new Error('Reference FM01 velocity statistics mismatch: '+JSON.stringify(rv));
  if(!near(rr.minimum,0)||!near(rr.maximum,66)||!near(rr.mean,.1264818213,1e-8)||!near(rr.total,85,1e-6))throw new Error('Reference RG01 rainfall statistics/total mismatch: '+JSON.stringify(rr));
  if(JSON.stringify(referenceEvidence.order)!==JSON.stringify(['rainfall','flow','depth','velocity']))throw new Error('Reference FDV panel order mismatch: '+JSON.stringify(referenceEvidence.order));
  if(referenceEvidence.colours['Observed flow']?.toLowerCase()!=='#d32f2f'||referenceEvidence.colours['Observed depth']?.toLowerCase()!=='#d32f2f'||referenceEvidence.colours['Observed velocity']?.toLowerCase()!=='#d32f2f'||referenceEvidence.colours['Rainfall']?.toLowerCase()!=='#4a90e2')throw new Error('Reference FDV colours mismatch: '+JSON.stringify(referenceEvidence.colours));
  if(JSON.stringify(referenceEvidence.tableHeader)!==JSON.stringify(['Series','Unit','Min','Max','Average','Total']))throw new Error('Reference Plotly statistics header mismatch: '+JSON.stringify(referenceEvidence.tableHeader));
  if(!referenceEvidence.tableTotals.some(x=>/85(?:\.0+)? mm/.test(x)))throw new Error('Reference rainfall total 85 mm missing from Plotly statistics: '+JSON.stringify(referenceEvidence.tableTotals));
  if(referenceEvidence.pointCounts?.observed?.raw!==20161||referenceEvidence.pointCounts?.rainfall?.raw!==20161)throw new Error('Reference full-period source counts mismatch: '+JSON.stringify(referenceEvidence.pointCounts));
  if(!String(referenceEvidence.xRange?.[0]||'').startsWith('2026-02-01')||!String(referenceEvidence.xRange?.[1]||'').startsWith('2026-03-01'))throw new Error('Reference graph support mismatch: '+JSON.stringify(referenceEvidence.xRange));
  stage='authoritative FDV channel navigation';
  const channelPresentation=await page.locator('#v2ChannelNav').evaluate(el=>({
    visible:!el.hidden,
    inStrip:Boolean(el.closest('#v2ChannelStrip')),
    inInspector:Boolean(el.closest('#pwInspector'))
  }));
  if(!channelPresentation.visible||!channelPresentation.inStrip||channelPresentation.inInspector)throw new Error('FDV channel navigation should remain graph-adjacent after authoritative handoff: '+JSON.stringify(channelPresentation));
  await page.click('#v2ChannelNav [data-channel="flow"]');
  await page.waitForFunction(()=>JSON.stringify(window.__ICM_WORKBENCH__.lastPanelOrder)===JSON.stringify(['rainfall','flow']),null,{timeout:60000});
  const selectedChannelMode=await page.evaluate(()=>window.__ICM_WORKBENCH__.uiV2?.channelMode||null);
  if(selectedChannelMode!=='flow')throw new Error('Flow channel navigation did not retain its selected state: '+JSON.stringify(selectedChannelMode));
  if(await page.locator('#v2GraphToolbar [data-threshold-role="observed"]').evaluate(el=>!el.hidden))throw new Error('Flow-only FDV view must not expose a hydraulic-level threshold control.');
  await page.click('#v2ChannelNav [data-channel="velocity"]');
  await page.waitForFunction(()=>JSON.stringify(window.__ICM_WORKBENCH__.lastPanelOrder)===JSON.stringify(['rainfall','velocity']),null,{timeout:60000});
  if(await page.locator('#v2GraphToolbar [data-threshold-role="observed"]').evaluate(el=>!el.hidden))throw new Error('Velocity-only FDV view must not expose a hydraulic-level threshold control.');
  await page.click('#v2ChannelNav [data-channel="depth"]');
  await page.waitForFunction(()=>JSON.stringify(window.__ICM_WORKBENCH__.lastPanelOrder)===JSON.stringify(['rainfall','depth']),null,{timeout:60000});
  if(await page.locator('#v2GraphToolbar [data-threshold-role="observed"]').evaluate(el=>el.hidden))throw new Error('Depth FDV view must expose the observed hydraulic threshold control.');
  await page.click('#v2ChannelNav [data-channel="combined"]');
  await page.waitForFunction(()=>JSON.stringify(window.__ICM_WORKBENCH__.lastPanelOrder)===JSON.stringify(['rainfall','flow','depth','velocity']),null,{timeout:60000});
  await captureEvidence('01c-reference-fdv-graph');

  stage='simulated-series auxiliary column filtering';
  await page.setInputFiles('#fileInput',{name:'simulated-export.csv',mimeType:'text/csv',buffer:Buffer.from('timestamp,Seconds,Dummy Nodes\n2026-02-01T00:00:00,0,1.0\n2026-02-01T00:01:00,60,1.1\n')});
  await page.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].some(r=>r.textContent.includes('simulated-export.csv')&&r.textContent.includes('Ready')),null,{timeout:60000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#modelSelect option')].filter(o=>o.textContent.includes('simulated-export.csv')).length===1,null,{timeout:60000});
  const simOptions=await page.locator('#modelSelect option').evaluateAll(opts=>opts.filter(o=>o.textContent.includes('simulated-export.csv')).map(o=>o.textContent));
  if(simOptions.length!==1||simOptions.some(x=>/—\s*Seconds\b/i.test(x)))throw new Error('Simulated export should expose one user series and hide auxiliary Seconds: '+JSON.stringify(simOptions));

  stage='multi-file drag and drop regression';
  await precisionRoute('graphs','comparison');
  const routeBeforeDrop=await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.route());
  const beforeDrop=await page.locator('#poolBody tr').count();
  await page.evaluate(()=>{
    window.__sourcePoolEventEvidence={count:0,details:[]};
    window.addEventListener('icm:source-pool-changed',event=>{
      window.__sourcePoolEventEvidence.count+=1;
      window.__sourcePoolEventEvidence.details.push(event.detail||null);
    });
    const textA='timestamp,depth\n2026-02-01T00:00:00,0.2\n2026-02-01T00:15:00,0.3\n';
    const textB='timestamp,depth\n2026-02-01T00:00:00,0.4\n2026-02-01T00:15:00,0.5\n';
    const a=new File([textA],'drag-a.csv',{type:'text/csv',lastModified:1770000000000});
    const b=new File([textB],'drag-b.csv',{type:'text/csv',lastModified:1770000001000});
    const event=new Event('drop',{bubbles:true,cancelable:true});
    Object.defineProperty(event,'dataTransfer',{value:{
      items:[{getAsFile:()=>a}],
      files:[a,b],
    }});
    document.querySelector('#dropzone').dispatchEvent(event);
  });
  await page.waitForFunction(expected=>document.querySelectorAll('#poolBody tr').length===expected,beforeDrop+2,{timeout:90000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].slice(-2).every(row=>row.textContent.includes('Ready')),null,{timeout:90000});
  await page.waitForFunction(()=>document.querySelector('#globalOperation')?.hidden===true&&!document.body.classList.contains('operation-busy'),null,{timeout:10000});
  const operationUi=await page.evaluate(()=>({exists:Boolean(document.querySelector('#globalOperation')),hidden:document.querySelector('#globalOperation')?.hidden,bodyBusy:document.body.classList.contains('operation-busy')}));
  if(!operationUi.exists||operationUi.hidden!==true||operationUi.bodyBusy)throw new Error('Global operation indicator did not return to an idle state: '+JSON.stringify(operationUi));
  const sourceEventEvidence=await page.evaluate(()=>({
    events:window.__sourcePoolEventEvidence,
    professional:Boolean(window.__ICM_WORKBENCH__.lastProfessionalSurvey),
    professionalFresh:window.__ICM_WORKBENCH__.professionalSurveyFresh?.()??null,
    complete:Boolean(window.__ICM_WORKBENCH__.survey?.batch),
    completeFresh:window.__ICM_WORKBENCH__.surveyFresh?.('complete')??null,
    balance:Boolean(window.__ICM_WORKBENCH__.survey?.balance),
    balanceFresh:window.__ICM_WORKBENCH__.surveyFresh?.('balance')??null,
    route:window.__ICM_PRECISION_WORKBENCH__.route(),
  }));
  if(sourceEventEvidence.events?.count!==1||sourceEventEvidence.events?.details?.[0]?.reason!=='ingest')throw new Error('Real multi-file ingestion must emit exactly one source-pool state event: '+JSON.stringify(sourceEventEvidence));
  if(!sourceEventEvidence.professional||!sourceEventEvidence.complete||!sourceEventEvidence.balance||sourceEventEvidence.professionalFresh!==false||sourceEventEvidence.completeFresh!==false||sourceEventEvidence.balanceFresh!==false)throw new Error('Source-pool change must retain prior evidence but mark every source-dependent survey result stale: '+JSON.stringify(sourceEventEvidence));
  if(sourceEventEvidence.route?.workspace!==routeBeforeDrop.workspace||sourceEventEvidence.route?.page!==routeBeforeDrop.page)throw new Error('Drag/drop import changed the active Precision route: '+JSON.stringify({before:routeBeforeDrop,after:sourceEventEvidence.route}));

  stage='FastPath handoff preserves applied mapping';
  await precisionRoute('data','series-mapping');
  const mappingBeforeHandoff=await page.evaluate(()=>({
    observed:document.querySelector('#observedSelect')?.value||'',
    models:[...document.querySelectorAll('#modelSelect option:checked')].map(o=>o.value),
    rain:document.querySelector('#rainSelect')?.value||'',
    mode:window.__ICM_WORKBENCH__?.lastGraphMode||null
  }));
  const handoffPayload=Buffer.from([
    'timestamp,Depth (m)',
    '2026-02-01T00:00:00,0.21',
    '2026-02-01T00:01:00,0.22',
    ''
  ].join('\n'),'utf8');
  await page.setInputFiles('#fileInput',{name:'handoff-extra.csv',mimeType:'text/csv',buffer:handoffPayload});
  await page.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].some(row=>row.textContent.includes('handoff-extra.csv')&&row.textContent.includes('Ready')),null,{timeout:60000});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.lastGraphMode!=='fastpath-preview',null,{timeout:60000});
  const mappingAfterHandoff=await page.evaluate(()=>({
    observed:document.querySelector('#observedSelect')?.value||'',
    models:[...document.querySelectorAll('#modelSelect option:checked')].map(o=>o.value),
    rain:document.querySelector('#rainSelect')?.value||'',
    mode:window.__ICM_WORKBENCH__?.lastGraphMode||null
  }));
  if(mappingAfterHandoff.observed!==mappingBeforeHandoff.observed||
     JSON.stringify(mappingAfterHandoff.models)!==JSON.stringify(mappingBeforeHandoff.models)||
     mappingAfterHandoff.rain!==mappingBeforeHandoff.rain){
    throw new Error('FastPath authoritative handoff changed the applied mapping: '+JSON.stringify({before:mappingBeforeHandoff,after:mappingAfterHandoff}));
  }
  performanceEvidence.handoffMappingPreservation={before:mappingBeforeHandoff,after:mappingAfterHandoff};

  stage='supplied real FDV and rainfall graph/report regression';
  await precisionRoute('data','sources');
  await page.click('#clearPoolBtn');
  await page.waitForFunction(()=>document.querySelectorAll('#poolBody tr').length===0,null,{timeout:30000});
  const referenceRoot=path.join(root,'reference/current-tool/sample-data');
  const realFdv=await fs.readFile(path.join(referenceRoot,'fdv/FM01.fdv'));
  const realRain=await fs.readFile(path.join(referenceRoot,'rainfall/RG01.R'));
  await page.setInputFiles('#fileInput',[
    {name:'Reference-FM01.fdv',mimeType:'text/plain',buffer:realFdv},
    {name:'Reference-RG01.R',mimeType:'text/plain',buffer:realRain},
  ]);
  await page.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].filter(r=>/Reference-(FM01|RG01)/.test(r.textContent)).filter(r=>r.textContent.includes('Ready')).length===2,null,{timeout:120000});
  await precisionRoute('data','series-mapping');
  await page.selectOption('#observedSelect',await optionValue('#observedSelect','Reference-FM01.fdv — depth'));
  await page.selectOption('#modelSelect',[]);
  await page.selectOption('#rainSelect',await optionValue('#rainSelect','Reference-RG01.R — rainfall'));
  await precisionRoute('data','time-series');
  // Appearance controls live in the contextual inspector on graph-first routes.
  // Open the inspector before interacting with them so acceptance follows the
  // shipped user path rather than trying to click an off-canvas detail panel.
  const inspector=page.locator('#pwInspector');
  if(!(await inspector.evaluate(el=>el.classList.contains('is-open')))){
    await page.click('#pwInspectorToggle');
    await page.waitForFunction(()=>document.querySelector('#pwInspector')?.classList.contains('is-open'));
  }
  const rainfallAppearance=page.locator('#pwInspector details.appearance-panel');
  if(!(await rainfallAppearance.evaluate(el=>el.open)))await rainfallAppearance.locator('summary').click();
  await page.locator('#rainFactor').waitFor({state:'visible'});
  await page.fill('#rainFactor','1');
  await precisionRoute('data','series-mapping');
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphStatistics?.some(r=>r.label?.includes('Reference-RG01')&&r.statistics?.total===85),null,{timeout:120000});
  const realEvidence=await page.evaluate(()=>({statistics:window.__ICM_WORKBENCH__.lastGraphStatistics,layout:document.querySelector('#timeChart').layout,panelDomains:window.__ICM_WORKBENCH__.lastPanelDomains}));
  const realFlow=realEvidence.statistics.find(r=>r.statistics.quantity==='flow').statistics;
  if(Math.abs(realFlow.mean-.1289310550071921)>1e-10||Math.abs(realFlow.total-311912.16)>1e-5)throw new Error('Real FDV native statistics differ from independent reference arithmetic: '+JSON.stringify(realFlow));
  const domains=realEvidence.panelDomains;
  if(!(domains?.velocity?.[1]<domains?.depth?.[0]&&domains?.depth?.[1]<domains?.flow?.[0]&&domains?.flow?.[1]<domains?.rainfall?.[0]))throw new Error('Real FDV semantic panel domains overlap: '+JSON.stringify(domains));
  await precisionRoute('data','time-series');
  await captureEvidence('07-real-fdv-rainfall');
  await precisionRoute('report','builder');
  await page.fill('#reportYear','2026');
  const realDownload=await downloadFrom('#downloadFourPeriodBtn');
  const realReport=await fs.readFile(await realDownload.path(),'utf8');
  const realFdvPlotMarker='<script type="application/json" id="period-graph-0-data">';
  const realFdvPlotStart=realReport.indexOf(realFdvPlotMarker),realFdvPlotEnd=realFdvPlotStart>=0?realReport.indexOf('</script>',realFdvPlotStart+realFdvPlotMarker.length):-1;
  if(realFdvPlotStart<0||realFdvPlotEnd<0)throw new Error('Real FDV four-period graph payload missing.');
  const realFdvPlot=JSON.parse(realReport.slice(realFdvPlotStart+realFdvPlotMarker.length,realFdvPlotEnd));
  if(Number(realFdvPlot.layout?.margin?.l||0)<100)throw new Error('Real FDV four-period report left margin is insufficient for hydraulic axis titles: '+JSON.stringify(realFdvPlot.layout?.margin));
  if(Number(realFdvPlot.layout?.height||0)>600)throw new Error('Real FDV four-period graph is too tall for an intact landscape print page: '+JSON.stringify({height:realFdvPlot.layout?.height}));
  if((realReport.match(/class="figure period-figure"/g)||[]).length!==4||!realReport.includes('page-break-before:always'))throw new Error('Four-period report is missing explicit graph/metrics print pagination.');
  const realLayout=await inspectReportHtml(realReport,4);
  if(realLayout.figures!==4||realLayout.zero||realLayout.overflow>2)throw new Error('Real-data report layout failed: '+JSON.stringify(realLayout));

  stage='final browser diagnostics';
  const diag=await page.evaluate(()=>window.__ICM_WORKBENCH__);
  const materialErrors=consoleErrors.filter(x=>!x.includes('favicon.ico'));
  if(materialErrors.length)throw new Error(`Browser console/page errors: ${materialErrors.join(' | ')}`);
  if(diag.errors?.length)throw new Error(`Workbench recorded operation errors: ${JSON.stringify(diag.errors)}`);
  if(failedRequests.filter(x=>!x.includes('favicon.ico')).length)throw new Error(`Failed browser requests: ${failedRequests.join(' | ')}`);
  await captureEvidence('06-final-state');
  performanceEvidence.acceptance={status:'passed'};
  await writePerformanceEvidence();
  console.log('PERFORMANCE_EVIDENCE '+JSON.stringify(performanceEvidence));

  console.log(`${liveMode?'Live Pages':'Local artifact'} browser acceptance passed at ${baseUrl}: hardened multi-file drag/drop, auxiliary column filtering, FDV depth/flow/velocity auto-graphing, dense adaptive zoom, no range slider, compact statistics/reports, unified spill dash style, survey schematic, collapsible workflows, survey assessment, spills, storage and workspace outputs.`);
} catch(err) {
  performanceEvidence.acceptance={status:'failed',stage,error:String(err)};
  await writePerformanceEvidence().catch(error=>console.error('Could not persist performance evidence:',error));
  const status=await page.locator('#engineStatus').textContent().catch(()=>'(missing)');
  const diag=await page.evaluate(()=>window.__ICM_WORKBENCH__||null).catch(()=>null);
  console.error(`ACCEPTANCE FAILURE at stage: ${stage}`);
  console.error(`Engine status: ${status}`);
  console.error(`Workbench diagnostic: ${JSON.stringify(diag)}`);
  console.error(`Console errors: ${JSON.stringify(consoleErrors)}`);
  console.error(`Failed requests: ${JSON.stringify(failedRequests)}`);
  await page.screenshot({path:process.env.ICM_FAILURE_SCREENSHOT||'/tmp/icm-workbench-failure.png',fullPage:true}).catch(()=>{});
  throw err;
} finally {
  await browser.close();
}
