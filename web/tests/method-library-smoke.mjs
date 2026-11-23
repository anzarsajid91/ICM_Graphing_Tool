import assert from 'node:assert/strict';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1280,height:900}});
const guard=installPrivacyGuard(context,base,{canaries:['SYNTHETIC-USER-METHOD-FILTER']});
const methodCount=34;
const page=await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));

try {
  await guard.navigate(page,base);
  await page.route('**/assets/method-library.json*',async route=>{
    const response=await route.fetch(),data=await response.json();
    const method=data.methods.find(entry=>entry.name==='Multi-event verification matrix');
    method.references.push({label:'Modified CIWEM URL',url:method.references[0].url+'?review=SYNTHETIC-USER-METHOD-FILTER'});
    await route.fulfill({response,json:data});
  },{times:1});
  await page.route('**/assets/method-library.json*',route=>route.fulfill({status:503,body:'Synthetic unavailable'}),{times:1});
  await page.getByRole('button',{name:'About',exact:true}).click();
  const open=page.getByRole('button',{name:'Open engineering method library',exact:true});
  await open.click();
  const panel=page.locator('#tab-method-library'),status=panel.getByRole('status');
  await status.filter({hasText:'could not be loaded'}).waitFor();
  await panel.getByRole('button',{name:'Retry loading methods'}).click();
  await status.filter({hasText:`${methodCount} of ${methodCount} methods`}).waitFor();
  const search=panel.getByLabel('Search methods');
  await search.fill('SYNTHETIC-USER-METHOD-FILTER');
  assert.equal(await status.innerText(),`0 of ${methodCount} methods`);
  await search.fill('Villemonte');
  assert.equal(await status.innerText(),`1 of ${methodCount} methods`);
  const structure=panel.locator('summary').filter({hasText:'Hydraulic structures and supplied ratings'});
  await structure.focus();await page.keyboard.press('Space');
  const source=panel.getByRole('link',{name:'USBR reference describing the Villemonte relation'});
  await source.waitFor();
  assert.match(await source.getAttribute('href'),/^https:\/\/www\.usbr\.gov\//);
  assert.match(await source.getAttribute('rel'),/noreferrer/);
  await panel.getByRole('button',{name:'Open Structures',exact:true}).click();
  await page.locator('#structureScreenForm').waitFor();
  await page.getByRole('button',{name:'About',exact:true}).click();
  await open.click();
  assert.equal(await search.inputValue(),'Villemonte');
  await search.fill('Fully contracted V-notch weirs');
  await panel.getByText('Fully contracted V-notch weirs',{exact:true}).click();
  const notch=panel.getByRole('link',{name:'USBR V-notch equation and applicability conditions',exact:true});
  assert.equal(await notch.getAttribute('href'),'https://www.usbr.gov/tsc/techreferences/mands/wmm/chap07_07.html');
  assert.equal(await notch.getAttribute('referrerpolicy'),'no-referrer');
  assert.match(await panel.innerText(),/0\.0198966004009 m³\/s/);
  await search.fill('');
  await panel.getByLabel('Jurisdiction').selectOption('England');
  assert.equal(await status.innerText(),`2 of ${methodCount} methods`);
  await panel.getByLabel('Category').selectOption('Hydraulics');
  assert.equal(await status.innerText(),`0 of ${methodCount} methods`);
  await panel.getByLabel('Category').selectOption('Design flows');
  assert.equal(await status.innerText(),`2 of ${methodCount} methods`);
  await panel.getByLabel('Jurisdiction').selectOption('Scotland');
  assert.equal(await status.innerText(),`2 of ${methodCount} methods`);
  await panel.getByText('Scotland municipal treatment design flows',{exact:true}).click();
  const sepa=panel.getByRole('link',{name:'SEPA municipal sewage treatment works guide'});
  assert.match(await sepa.getAttribute('href'),/^https:\/\/www\.sepa\.org\.uk\/media\//);
  assert.equal(await sepa.getAttribute('referrerpolicy'),'no-referrer');
  await panel.getByRole('button',{name:'Open Treatment flows',exact:true}).click();
  await page.locator('#sepaTreatmentForm').waitFor();
  await page.getByRole('button',{name:'About',exact:true}).click();await open.click();
  await panel.getByLabel('Jurisdiction').selectOption('Ireland');
  await panel.getByText('Uisce Éireann new-network peak foul flow',{exact:true}).click();
  const uisce=panel.getByRole('link',{name:'Uisce Éireann wastewater infrastructure code, Revision 3'});
  assert.match(await uisce.getAttribute('href'),/^https:\/\/www\.water\.ie\/.*Rev-03\.pdf$/);
  assert.equal(await uisce.getAttribute('referrerpolicy'),'no-referrer');
  await panel.getByRole('button',{name:'Open Peak foul flow',exact:true}).click();
  await page.locator('#foulLoadingForm').waitFor();
  await page.getByRole('button',{name:'About',exact:true}).click();await open.click();
  await panel.getByText('Ireland combined overflow design screening',{exact:true}).click();
  const irish=panel.getByRole('link',{name:'EPA-published storm overflow design guidance'});
  assert.match(await irish.getAttribute('href'),/^https:\/\/www\.epa\.ie\/.*UrbanWasteWater2\.pdf$/);
  await panel.getByLabel('Jurisdiction').selectOption('Wales');
  assert.equal(await status.innerText(),`1 of ${methodCount} methods`);
  await panel.getByText('Wales GN066 continuation-flow screening',{exact:true}).click();
  const wales=panel.getByRole('link',{name:'NRW GN066 performance classification guidance'});
  assert.match(await wales.getAttribute('href'),/^https:\/\/cdnfd\.cyfoethnaturiol\.cymru\/.*gn066/);
  assert.equal(await wales.getAttribute('referrerpolicy'),'no-referrer');
  await panel.getByRole('button',{name:'Open Formula A',exact:true}).click();
  await page.locator('#designFlowForm').waitFor();
  await page.getByRole('button',{name:'About',exact:true}).click();await open.click();
  await panel.getByLabel('Jurisdiction').selectOption('');await panel.getByLabel('Category').selectOption('');
  await search.fill('ICM land-use defaults for catchment review');
  await panel.getByText('ICM land-use defaults for catchment review',{exact:true}).click();
  const landUse=panel.getByRole('link',{name:'Land Use Data Fields',exact:true});
  assert.equal(await landUse.getAttribute('href'),'https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-16A33809-93A2-4A23-B0AA-B41B0C1A2D12.htm');
  assert.equal(await landUse.getAttribute('referrerpolicy'),'no-referrer');
  await search.fill('Modelled continuation during physical spills');
  await panel.getByText('Modelled continuation during physical spills',{exact:true}).click();
  const overflow=panel.getByRole('link',{name:"England's source guidance on continuation during spills",exact:true});
  assert.match(await overflow.getAttribute('href'),/gov\.uk.*#formula-a$/);
  await search.fill('Multi-event verification matrix');
  await panel.getByText('Multi-event verification matrix',{exact:true}).click();
  const ciwem=panel.getByRole('link',{name:'CIWEM UDG verification guidance, sections 5.2 and 5.3'});
  assert.match(await ciwem.getAttribute('href'),/^https:\/\/www\.ciwem\.org\/assets\/pdf\/.*\.pdf$/);
  assert.equal(await ciwem.getAttribute('referrerpolicy'),'no-referrer');
  assert.equal(await panel.getByRole('link',{name:'Modified CIWEM URL'}).count(),0);
  await panel.getByRole('button',{name:'Open Verification matrix',exact:true}).click();
  await page.locator('#hbVerificationForm').waitFor();
  await page.getByRole('button',{name:'About',exact:true}).click();await open.click();
  await search.fill('Manning circular gravity sizing');
  await panel.getByText('Manning circular gravity sizing',{exact:true}).click();
  const fhwa=panel.getByRole('link',{name:/FHWA Urban Drainage Design Manual/});
  assert.equal(await fhwa.getAttribute('href'),'https://www.fhwa.dot.gov/engineering/hydraulics/pubs/hif24006.pdf');
  assert.equal(await fhwa.getAttribute('referrerpolicy'),'no-referrer');
  await panel.getByRole('button',{name:'Open Gravity sizing',exact:true}).click();
  await page.locator('#hbManningForm').waitFor();
  await page.getByRole('button',{name:'About',exact:true}).click();await open.click();
  await search.fill('Darcy full-bore gravity sizing');
  await panel.getByText('Darcy full-bore gravity sizing',{exact:true}).click();
  for(const [label,url] of [['Colebrook (1939)','https://www.emerald.com/jince/article/11/4/133/417643'],
    ['DOE Fundamentals Handbook, Fluid Flow','https://www.energy.gov/documents/doe-hdbk-1012-92vol3']]){
    const link=panel.getByRole('link',{name:label,exact:true});
    assert.equal(await link.getAttribute('href'),url);assert.equal(await link.getAttribute('referrerpolicy'),'no-referrer');
  }
  await search.fill('Fixed-factor pipe system screening and pump duty');
  await panel.getByText('Fixed-factor pipe system screening and pump duty',{exact:true}).click();
  const nist=panel.getByRole('link',{name:'NIST Guide to the SI, Appendix B',exact:true});
  assert.equal(await nist.getAttribute('href'),'https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors');
  assert.equal(await nist.getAttribute('referrerpolicy'),'no-referrer');
  for(const [title,label,url] of [
    ['Rectangular and trapezoidal gravity sizing','FHWA HDS-4, section 4.3.2','https://www.fhwa.dot.gov/engineering/hydraulics/pubs/08090/HDS4_608.pdf'],
    ['ICM model loading from Waste Water and Trade Waste events','Autodesk native event CSV','https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-3477644E-D576-47EE-8805-395CCC74C5DC.htm'],
  ]){
    await search.fill(title);await panel.getByText(title,{exact:true}).click();
    const link=panel.getByRole('link',{name:label,exact:true});
    assert.equal(await link.getAttribute('href'),url);assert.equal(await link.getAttribute('referrerpolicy'),'no-referrer');
  }
  await search.fill('Derived time-series intervals');
  await panel.getByText('Derived time-series intervals',{exact:true}).click();
  await panel.getByText(/half-open/).first().waitFor();
  for(const [title,source,route] of [
    ['Weekly flow survey review and volume balance','CIWEM UDG Code of Practice for Hydraulic Modelling, 2017','Volume balance'],
    ['Simulation results and long-section interpretation','InfoWorks ICM 2026 link results','Simulation results'],
    ['Detriment criteria and matched report evidence','InfoWorks ICM 2025 Worst Case Report View','Scenario comparison'],
  ]){
    await search.fill(title);
    assert.equal(await status.innerText(),`1 of ${methodCount} methods`);
    const entry=panel.getByText(title,{exact:true});await entry.click();
    const reference=panel.getByRole('link',{name:source,exact:true});
    assert.match(await reference.getAttribute('href'),/^https:\/\/(?:www\.ciwem\.org|help\.autodesk\.com)\//);
    assert.equal(await reference.getAttribute('referrerpolicy'),'no-referrer');
    await panel.getByRole('button',{name:'Open '+route,exact:true}).click();
    await page.getByRole('tab',{name:route,exact:true,selected:true}).waitFor();
    await page.getByRole('button',{name:'About',exact:true}).click();await open.click();
  }
  await page.setViewportSize({width:400,height:850});
  const sizes=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);
  assert(sizes[0]<=sizes[1]+2);
  await panel.getByRole('button',{name:'Close method library',exact:true}).click();
  assert(await panel.isHidden());
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('METHOD_LIBRARY_PASS '+engine);
} finally {await browser.close();}
