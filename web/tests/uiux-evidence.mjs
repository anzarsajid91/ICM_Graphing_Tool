// Test-side inventory of rendered synthetic workflows. Never shipped in the release.
import fs from 'node:fs/promises';
import path from 'node:path';
export async function recordControls(page,directory,state){
 if(!directory)return;
 const rows=await page.evaluate(state=>{
  const route=window.__ICM_PRECISION_WORKBENCH__?.route?.();
  return [...document.querySelectorAll('button,input,select,textarea,summary,a[href],[role="button"],dialog,[role="dialog"],.chart,.table-wrap')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert]')&&getComputedStyle(el).visibility!=='hidden').map(el=>({
   route:route?route.workspace+'/'+route.page:'legacy',state,tag:el.tagName,id:el.id,classes:el.className?.baseVal??el.className,
   label:el.getAttribute('aria-label')||el.labels?.[0]?.textContent?.trim()||el.textContent?.trim().slice(0,120)||el.title,
   role:el.getAttribute('role'),disabled:Boolean(el.disabled),expanded:el.getAttribute('aria-expanded'),current:el.getAttribute('aria-current'),
   logicalRoot:el.closest('.pw-page-surface,.tab-panel,.pw-inspector,.pw-rail')?.id||'',
   attributes:[...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])
  }));
 },state);
 await fs.mkdir(directory,{recursive:true});
 await fs.writeFile(path.join(directory,state+'-controls.json'),JSON.stringify(rows,null,2));
}
