import {writeEvidence} from './evidence-output.mjs';
// Test-side inventory of rendered synthetic workflows. Never shipped in the release.
import fs from 'node:fs/promises';
import path from 'node:path';
export async function recordControls(page,directory,state){
 if(!directory)return;
 const rows=await page.evaluate(state=>{
  const route=window.__ICM_PRECISION_WORKBENCH__?.route?.();
  return [...document.querySelectorAll('[id],table,[data-ns-binding],[data-ns-summary-row],[data-ns-summary],[data-ns-effective-threshold],[data-review-id],[data-review-kind],[data-week-row],[data-state],[data-result],[data-source-id],button,input,select,textarea,summary,a[href],[role="button"],dialog,[role="dialog"],.chart,.table-wrap')].filter(el=>(!(el instanceof SVGElement)||el.id==='nsSvg'||el.matches('[role="button"]'))&&el.getClientRects().length&&!el.closest('[hidden],[inert]')&&getComputedStyle(el).visibility!=='hidden').map(el=>({
   route:route?route.workspace+'/'+route.page:'legacy',state,tag:el.tagName,id:el.id,classes:el.className?.baseVal??el.className,
   label:el.getAttribute('aria-label')||el.labels?.[0]?.textContent?.trim()||el.textContent?.trim().slice(0,120)||el.title,
   role:el.getAttribute('role'),disabled:Boolean(el.disabled),expanded:el.getAttribute('aria-expanded'),current:el.getAttribute('aria-current'),
   logicalRoot:el.closest('.pw-page-surface,.tab-panel,.pw-inspector,.pw-rail')?.id||'',
   attributes:[...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])
  }));
 },state);
 await fs.mkdir(directory,{recursive:true});
 const observed=await page.evaluate(()=>window.__uiuxControlEvidence||[]);
 await writeEvidence(path.join(directory,state+'-controls.json'),JSON.stringify([...observed,...rows],null,2));
}

// Capture intermediate synthetic popovers, busy controls and conditional panels in tested journeys.
// Never loaded by the product; bounded and deduplicated; does not alter app state or handlers.
export async function observeControls(page){
 if(process.env.ICM_UIUX_OBSERVE==='0')return;
 await page.addInitScript(()=>{
  const records=new Map();let timer;
  const capture=()=>{
   const route=window.__ICM_PRECISION_WORKBENCH__?.route?.();
   for(const el of document.querySelectorAll('[id],table,[data-ns-binding],[data-ns-summary-row],[data-ns-summary],[data-ns-effective-threshold],[data-review-id],[data-review-kind],[data-week-row],[data-state],[data-result],[data-source-id],button,input,select,textarea,summary,a[href],[role="button"],[role="dialog"]')){
    if((el instanceof SVGElement)&&el.id!=='nsSvg'&&!el.matches('[role="button"]'))continue;
    if(!el.getClientRects().length||el.closest('[hidden],[inert]')||getComputedStyle(el).visibility==='hidden')continue;
    const row={route:route?route.workspace+'/'+route.page:'startup',state:'intermediate interaction',tag:el.tagName,id:el.id,classes:el.className?.baseVal??el.className,label:el.getAttribute('aria-label')||el.labels?.[0]?.textContent?.trim()||el.textContent?.trim().slice(0,120)||el.title,role:el.getAttribute('role'),disabled:Boolean(el.disabled),expanded:el.getAttribute('aria-expanded'),current:el.getAttribute('aria-current'),logicalRoot:el.closest('.pw-page-surface,.tab-panel,.pw-inspector,.pw-rail')?.id||'',attributes:[...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])};
    const key=JSON.stringify([row.route,row.tag,row.id,row.classes,row.label,row.disabled,row.expanded,row.current]);
    if(records.size<20000)records.set(key,row);
   }
   window.__uiuxControlEvidence=[...records.values()];
  };
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(capture,150);};
  document.addEventListener('click',()=>{clearTimeout(timer);timer=setTimeout(capture,0);},{passive:true});
  for(const event of ['change','focusin','keyup'])document.addEventListener(event,schedule,{passive:true});
  document.addEventListener('DOMContentLoaded',()=>{capture();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','disabled','aria-expanded','aria-current']});});
 });
}
