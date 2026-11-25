import fs from 'node:fs/promises';
import path from 'node:path';
import {launch,nav,settle,snapshot,shot,write,browserName,out,upload,saveDownload} from './browser-common.mjs';
const {browser,page,guard,errors,blocked,identity}=await launch();
const result={identity,browser:browser.version(),modes:[],journey:[]};
const ui=selector=>page.locator(selector);
const click=selector=>ui(selector).click({timeout:9000});
const fixture=await fs.readFile('/workspace/hydra-evidence/v301/baseline/network-expanded.csv','utf8');
const monitors=await fs.readFile('/workspace/hydra-evidence/v301/baseline/monitor-locations.csv','utf8');
const contextAudit=page.getByRole('dialog',{name:'Model Context Import Audit'});
let failure;
async function exportMenu() {if(!await ui('.ns-export-menu').evaluate(node=>node.open))await click('.ns-export-menu > summary');}
const view=async label=>page.evaluate(label=>{
  const svg=document.querySelector('#nsSvg'), rect=svg.getBoundingClientRect();
  const path=[...svg.querySelectorAll('[data-ns-wire]')].map(el=>el.getAttribute('d'));
  const node=[...svg.querySelectorAll('[data-ns-node]')].map(el=>el.getAttribute('data-ns-node'));
  const labels=[...svg.querySelectorAll('[data-ns-label]:not([data-ns-label-suppressed])')];
  const displayed=el=>!el.closest('[hidden]')&&getComputedStyle(el).display!=='none';
  const byKey=key=>svg.querySelector(`[data-ns-node="${key}"]`);
  const overlaps=labels.filter(displayed).map(el=>({t:el.textContent,rect:el.getBoundingClientRect()})).flatMap((a,i,all)=>all.slice(i+1).filter(b=>a.rect.width>0&&b.rect.width>0&&a.rect.x<b.rect.right&&a.rect.right>b.rect.x&&a.rect.y<b.rect.bottom&&a.rect.bottom>b.rect.y).map(b=>[a.t,b.t]));
  const groupEls=[...svg.querySelectorAll('[data-ns-branch-group]')];
  const canvas=document.getElementById('nsCanvas'), source=ICMNetworkSchematic.snapshot();
  const text=canvas.innerText;
  return {label,mode:svg.getAttribute('aria-label'),canvas:{width:Math.round(rect.width),height:Math.round(rect.height)}, nodes:node.length,connectors:path.length,sourceNodes:source.nodes.length,sourceEdges:source.edges.length,groupCount:groupEls.length, groupExamples:groupEls.slice(0,5).map(el=>el.getAttribute('aria-label')),renderedLabelCount:labels.length,labelOverlaps:overlaps.length,overlapExamples:overlaps.slice(0,8),controls:['SPLIT','CSO-01','PS-01','WEIR-IN','WEIR-OUT','OUT-MAIN','OUT-SPILL','W-06'].map(k=>[k,Boolean(byKey(k))]),monitors:[...svg.querySelectorAll('[aria-label*="FM-0"]')].map(el=>el.getAttribute('aria-label')).slice(0,12),zoom:document.querySelector('#nsZoom')?.textContent,keyboardStops:svg.querySelectorAll('[tabindex="0"]').length,viewport:{w:innerWidth,h:innerHeight,scrollWidth:document.documentElement.scrollWidth}, text:text?.trim().slice(0,400)};
},label);
const photo=async name=>{await ui('#nsCanvas').screenshot({path:path.join(out,'screens',name+'-'+browserName+'.jpg'),type:'jpeg',quality:85,animations:'disabled'});};
try {
  await nav(page,'network','Schematic');
  await ui('#nsLoad').waitFor({state:'attached'});
  await exportMenu();
  result.loadEntry=await ui('.ns-export-actions').innerText();
  await upload(page,'#nsLoadInput','network-expanded.csv',fixture);
  await contextAudit.waitFor({timeout:10000});
  result.journey.push({stage:'network audit',text:await contextAudit.innerText()});
  if(await ui('#nsContextUnits').isVisible())await ui('#nsContextUnits').check();
  await click('#nsContextApply');
  await contextAudit.waitFor({state:'hidden'});
  await click('#nsOpenMonitorImport');
  await upload(page,'#nsMonitorFile','monitor-locations.csv',monitors);
  await ui('#nsMonitorApply').waitFor();
  await page.waitForFunction(()=>!document.getElementById('nsMonitorApply').disabled);
  result.journey.push({stage:'monitor preview',text:await ui('#nsMonitorPreview').innerText()});
  await click('#nsMonitorApply');
  result.journey.push({stage:'monitor apply',text:await ui('#nsMonitorMessage').innerText()});
  await click('#nsMonitorClose');
  if(await ui('.ns-export-menu').evaluate(node=>node.open))await click('.ns-export-menu > summary');
  for(const [mode,id] of [['detailed','nsDetailed'],['engineering','nsOverview'],['strategic','nsStrategic']]) {
    await click('#'+id);await click('#nsFit');await settle(page);
    result.modes.push(await view(mode));
    await photo('network-'+mode);
    await exportMenu();
    await ui('#nsPublicationTitle').fill(`Synthetic expanded network | ${mode}`);
    const saved=await saveDownload(page,ui('#nsSvgExport'),`network-${mode}-${browserName}.svg`);
    const svg=await fs.readFile(path.join(out,'outputs',saved.saved),'utf8');
    result.modes.at(-1).export={...saved, viewBox:svg.match(/viewBox="([^"]+)"/)?.[1],knownLabels:['SPLIT','CSO-01','PS-01','OUT-MAIN','OUT-SPILL','FM-01','FM-02','W-06','Nominal direction','Topological simplification'].filter(label=>svg.includes(label)),textNodes:(svg.match(/<text\b/g)||[]).length,scriptPresent:/<script\b/.test(svg),title:svg.match(/<title[^>]*>([^<]+)<\/title>/)?.[1],desc:svg.match(/<desc[^>]*>([^<]+)<\/desc>/)?.[1]};
    if(mode==='engineering'&&browserName==='chromium'){
      await exportMenu();
      result.modes.at(-1).png=await saveDownload(page,ui('#nsPngExport'),'network-engineering-chromium.png');
      await exportMenu();
      const [popup]=await Promise.all([page.waitForEvent('popup'),click('#nsPdfExport')]);
      await popup.getByRole('button',{name:'Print / save PDF'}).waitFor();
      await popup.pdf({path:path.join(out,'outputs','network-engineering-chromium.pdf'),preferCSSPageSize:true});
      result.modes.at(-1).pdf={title:await popup.title(),lines:(await popup.locator('body').innerText()).slice(0,500)};
      await popup.close();
    }
    if(await ui('.ns-export-menu').evaluate(node=>node.open))await click('.ns-export-menu > summary');
  }
  const finder=ui('#nsAssetSearch');
  await finder.fill('W-06');await finder.press('Enter');await settle(page);
  const selected=()=>page.evaluate(()=>({popup:document.getElementById('nsPopup').innerText,reach:document.getElementById('nsReach').innerText,focus:document.activeElement.id, current:document.querySelector('#nsSvg').getAttribute('aria-label'),select:document.querySelector('#nsCanvas .ns-asset.is-selected')?.getAttribute('data-ns-node')}));
  result.journey.push({stage:'strategic find W-06',...await selected()});
  await shot(page,'network-strategic-selected-'+browserName);
  await click('#nsOverview');await settle(page);
  result.journey.push({stage:'switch to engineering while W-06 selected',...await selected()});
  await finder.fill('SPLIT');await finder.press('Enter');
  await click('#nsReviewTools > summary');
  await click('[data-ns-trace="down"]');
  const traceButton=ui('#nsIsolateBranch');
  if(await traceButton.isEnabled())await traceButton.click();
  result.journey.push({stage:'downstream trace on SPLIT',status:await ui('#nsStatus').innerText(),...await view('trace')});
  await click('#nsClearTrace');await click('#nsReviewTools > summary');
  await click('#nsLongSection');
  await ui('#nsRouteStart').selectOption({label:'IN-W'});
  await ui('#nsRouteEnd').selectOption({label:'OUT-MAIN'});
  result.journey.push({stage:'ambiguous route',message:await ui('#nsRouteMessage').innerText(),openProfileDisabled:await ui('#nsOpenProfile').isDisabled(),choices:await ui('#nsRouteBranch option').allTextContents()});
  await ui('#nsRouteBranch select').selectOption({label:'SPLIT.1 → C-01'});
  await click('#nsOpenProfile');
  result.journey.push({stage:'route IN-W to OUT-MAIN',text:(await ui('#nsProfile').innerText()).slice(0,2500)});
  await shot(page,'network-route-'+browserName);
  await click('#nsCloseRoute');
  await page.setViewportSize({width:1024,height:768});await click('#nsFit');await settle(page);
  result.narrow=await view('engineering1024');
  await shot(page,'network-1024-loaded-'+browserName);
  await click('#nsFullscreen');await settle(page);
  result.fullscreen=await view('engineering1024-full');
  await ui('#nsCanvas').press('Escape');
  result.fullscreenEscaped=await ui('#nsFullscreen').getAttribute('aria-pressed');
} catch(error) {
  failure=error;
  result.failure=error.message;
  result.final=await snapshot(page,'failure state').catch(()=>null);
  await shot(page,'network-failure-'+browserName).catch(()=>{});
} finally {
  result.errors=errors;result.blocked=blocked;
  try {guard.assertClean();result.privacy='pass';} finally {await write('logs/network-'+browserName+'.json',result);await browser.close();}
}
if(failure)throw failure;
