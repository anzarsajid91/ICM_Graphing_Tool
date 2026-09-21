import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);
const root=process.cwd();
const baselineUrl=(process.env.ICM_BASELINE_URL||'http://127.0.0.1:8001/').replace(/\/?$/,'/');
const currentUrl=(process.env.ICM_CURRENT_URL||'http://127.0.0.1:8000/').replace(/\/?$/,'/');
const evidenceDir=process.env.ICM_BASELINE_EVIDENCE_DIR||'/tmp/icm-baseline-evidence';
const baselineSha=process.env.ICM_BASELINE_SHA||'cb66e762b23c5cd59cf61b42a6c4b52655307cfc';
const currentSha=process.env.GITHUB_SHA||'local';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Kolkata'});

async function extractModel(){
  const archive=path.join(root,'reference/current-tool/sample-data/other/StationA_Modelled Data.zip');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'icm-baseline-model-'));
  const py=[
    'import pathlib,sys,zipfile',
    'a=pathlib.Path(sys.argv[1]); d=pathlib.Path(sys.argv[2])',
    'with zipfile.ZipFile(a) as z:',
    ' m=[x for x in z.infolist() if not x.is_dir() and x.filename.lower().endswith((".csv",".hyd")) and "__MACOSX" not in x.filename][0]',
    ' p=d/("StationA_Modelled Data"+pathlib.Path(m.filename).suffix.lower())',
    ' p.write_bytes(z.read(m)); print(p); print(m.filename,file=sys.stderr)',
  ].join('\n');
  const {stdout,stderr}=await execFileAsync('python',['-c',py,archive,dir]);
  return {sourcePath:stdout.trim().split(/\r?\n/).at(-1),archiveMember:stderr.trim().split(/\r?\n/).at(-1)};
}

async function waitRuntimeWired(page){
  await page.waitForSelector('#fileInput',{state:'attached',timeout:30000});
  await page.waitForFunction(()=>Boolean(window.__ICM_WORKBENCH__),null,{timeout:30000});
  // Both baseline and PR25 wire import handlers synchronously before the
  // authoritative worker boot is awaited. A small equal settling interval
  // avoids racing script evaluation while keeping the comparison symmetric.
  await page.waitForTimeout(100);
}

async function chooseFirstSeriesAndGraph(page){
  const observed=await page.locator('#observedSelect option').evaluateAll(opts=>opts.find(o=>o.value)?.value||'');
  const rain=await page.locator('#rainSelect option').evaluateAll(opts=>opts.find(o=>o.value)?.value||'');
  if(observed)await page.selectOption('#observedSelect',observed);
  else if(rain)await page.selectOption('#rainSelect',rain);
  else throw new Error('No graphable authoritative series became available.');
  await page.locator('#applyMappingBtn').evaluate(el=>el.click());
  await page.waitForSelector('#timeChart .main-svg',{state:'attached',timeout:60000});
}

async function measure(url,kind,spec){
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push('pageerror: '+String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon.ico'))errors.push('console: '+m.text());});
  try{
    await page.goto(url+'?benchmark='+encodeURIComponent(spec.dataset)+'&t='+Date.now(),{waitUntil:'domcontentloaded'});
    await waitRuntimeWired(page);
    const selectedAt=Date.now();
    await page.setInputFiles('#fileInput',spec.sourcePath);
    let firstGraphMs=null;
    if(kind==='current'){
      try{
        await page.waitForSelector('#timeChart .main-svg',{state:'attached',timeout:60000});
        firstGraphMs=Date.now()-selectedAt;
      }catch{}
    }
    await page.waitForFunction(name=>[...document.querySelectorAll('#poolBody tr')].some(r=>r.textContent.includes(name)&&r.textContent.includes('Ready')),spec.inputName,{timeout:spec.timeoutMs||240000});
    const authoritativeReadyMs=Date.now()-selectedAt;
    if(kind==='baseline'){
      await chooseFirstSeriesAndGraph(page);
      firstGraphMs=Date.now()-selectedAt;
    }
    const state=await page.evaluate(name=>({
      row:[...document.querySelectorAll('#poolBody tr')].find(r=>r.textContent.includes(name))?.textContent||null,
      graphMode:window.__ICM_WORKBENCH__?.lastGraphMode||null,
      reconciliation:window.__ICM_WORKBENCH__?.fastpath?.last?.reconciliation?.status||null,
      recordedFastPath:window.__ICM_WORKBENCH__?.fastpath?.last||null
    }),spec.inputName);
    if(errors.length)throw new Error(errors.join(' | '));
    return {firstGraphMs,authoritativeReadyMs,state};
  }finally{await page.close();}
}

const model=await extractModel();
const datasets=[
  {dataset:'FM01.fdv',inputName:'FM01.fdv',sourcePath:path.join(root,'reference/current-tool/sample-data/fdv/FM01.fdv'),timeoutMs:180000},
  {dataset:'StationA_EDM.csv',inputName:'StationA_EDM.csv',sourcePath:path.join(root,'reference/current-tool/sample-data/other/StationA_EDM.csv'),timeoutMs:240000},
  {dataset:'StationA_Rainfall.csv',inputName:'StationA_Rainfall.csv',sourcePath:path.join(root,'reference/current-tool/sample-data/other/StationA_Rainfall.csv'),timeoutMs:300000},
  {dataset:'StationA_Modelled Data.csv',inputName:path.basename(model.sourcePath),sourcePath:model.sourcePath,archiveMember:model.archiveMember,timeoutMs:360000},
];

const output={schema_version:1,baseline_sha:baselineSha,current_sha:currentSha,environment:'same GitHub Actions job / Playwright Chromium / local release artifacts',datasets:[]};
try{
  for(const spec of datasets){
    const stat=await fs.stat(spec.sourcePath);
    const baseline=await measure(baselineUrl,'baseline',spec);
    const current=await measure(currentUrl,'current',spec);
    if(current.firstGraphMs==null)throw new Error('Current FastPath produced no first graph for '+spec.dataset);
    if(!(current.firstGraphMs<current.authoritativeReadyMs))throw new Error('Current preview did not beat authoritative readiness for '+spec.dataset);
    if(!(current.firstGraphMs<baseline.authoritativeReadyMs))throw new Error('Current first graph did not beat baseline authoritative availability for '+spec.dataset);
    output.datasets.push({
      dataset:spec.dataset,
      archive_member:spec.archiveMember||null,
      bytes:stat.size,
      baseline,
      current,
      first_graph_improvement_ms:baseline.firstGraphMs-current.firstGraphMs,
      first_graph_improvement_percent:baseline.firstGraphMs?100*(baseline.firstGraphMs-current.firstGraphMs)/baseline.firstGraphMs:null,
      versus_baseline_authoritative_boundary_ms:baseline.authoritativeReadyMs-current.firstGraphMs,
      versus_baseline_authoritative_boundary_percent:100*(baseline.authoritativeReadyMs-current.firstGraphMs)/baseline.authoritativeReadyMs
    });
  }
  await fs.mkdir(evidenceDir,{recursive:true});
  await fs.writeFile(path.join(evidenceDir,'baseline-fastpath-comparison.json'),JSON.stringify(output,null,2)+'\n','utf8');
  console.log('BASELINE_FASTPATH_COMPARISON '+JSON.stringify(output));
}finally{
  await browser.close();
}
