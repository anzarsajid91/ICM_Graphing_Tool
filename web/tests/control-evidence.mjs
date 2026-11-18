// Fixture-only browser QA. Record control identities and activation counts,
// without emitting input values or treating activation as a functional pass.
import fs from 'node:fs/promises';
import path from 'node:path';

export async function trackControls(context, file) {
  const folder=process.env.ICM_EVIDENCE_DIR;
  if(!folder)return;
  const records=new Map();
  await context.exposeBinding('recordHydraControl',(_,route,id,action,surface)=>{
    const key=JSON.stringify([route,id]);
    const row=records.get(key)||{route,id,enabled:false,disabled:false,activations:0,surfaces:[]};
    if(surface&&!row.surfaces.some(item=>JSON.stringify(item)===JSON.stringify(surface)))row.surfaces.push(surface);
    if(action==='activate')row.activations++;
    else if(action==='enabled')row.enabled=true;
    else row.disabled=true;
    records.set(key,row);
  });
  await context.addInitScript(()=>{
    const selector='button,[role="button"],input[type="button"],input[type="submit"],summary,a[href]';
    const seen=new Set();
    const route=()=>{
      const current=window.__ICM_PRECISION_WORKBENCH__?.route();
      return current?current.workspace+'/'+current.page:'initial';
    };
    const id=element=>{
      if(element.id)return '#'+element.id;
      const keys=['data-workspace','data-page','data-tab','data-schematic-zoom','data-schematic-fit','data-opt','data-action','data-spill-action','data-network-action'];
      const attributes=keys.filter(key=>element.hasAttribute(key)).map(key=>key+'='+element.getAttribute(key));
      const caption=(element.getAttribute('aria-label')||element.getAttribute('title')||element.textContent||'').trim().replace(/\s+/g,' ').slice(0,100);
      return element.tagName.toLowerCase()+':'+(attributes.length?attributes.join(','):caption);
    };
    const record=(element,action)=>{
      const where=route(),control=id(element);
      const key=JSON.stringify([where,control,action]);
      if(action!=='activate'&&seen.has(key))return;
      seen.add(key);
      const surface={
        title:document.title,
        documentKind:location.protocol==='blob:'?'local-blob':location.protocol==='about:'?'local-about':'application',
        downloadAnchor:element.tagName==='A'&&element.hasAttribute('download'),
        tag:element.tagName,
      };
      void window.recordHydraControl(where,control,action,surface);
    };
    const scan=()=>{
      for(const button of document.querySelectorAll(selector)){
        if(!button.getClientRects().length||button.closest('[hidden],[inert]')||getComputedStyle(button).visibility==='hidden')continue;
        record(button,button.matches(':disabled,[aria-disabled="true"]')?'disabled':'enabled');
      }
    };
    let timer;
    const schedule=()=>{
      clearTimeout(timer);
      timer=setTimeout(scan,150);
    };
    document.addEventListener('click',event=>{
      const element=event.target instanceof Element&&event.target.closest(selector);
      if(event.isTrusted&&element)record(element,'activate');
    },true);
    addEventListener('DOMContentLoaded',()=>{
      new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','aria-disabled','disabled','open','class']});
      scan();
    });
    addEventListener('hashchange',schedule);
  });
  return async()=>{
    await fs.mkdir(folder,{recursive:true});
    const controls=[...records.values()].sort((a,b)=>a.route.localeCompare(b.route)||a.id.localeCompare(b.id));
    const enabled=controls.filter(row=>row.enabled);
    await fs.writeFile(path.join(folder,file),JSON.stringify({
      controls,
      enabled:enabled.length,
      activated:enabled.filter(row=>row.activations).length,
      needsEvidence:enabled.filter(row=>!row.activations).map(({route,id})=>({route,id})),
      note:'Activation is inventory evidence. Functional acceptance requires the suite assertion or an explicit manual outcome.'
    },null,2)+'\n');
  };
}
