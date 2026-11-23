/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";

const SAVED_WORKSPACES='icm-workbench-named', RECOVERY_PREFIX='icm-workbench-named-corrupt-';
const SCHEMATIC='hydra-network-schematic-v1';
const SESSION_KEYS=['icm-pw-recent-pages-v1','icm-pw-route-scroll','icm-pw-focus-canvas','icm-pw-rail-collapsed'];
const node=(tag,text)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;return result;};
const showBytes=value=>new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(value/1024)+' KiB';
const countLabel=(count,singular,plural=singular+'s')=>count+' '+(count===1?singular:plural);
let open;

function workspaceKeys(storage){
  return Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(key=>key===SAVED_WORKSPACES||key?.startsWith(RECOVERY_PREFIX));
}
const textBytes=value=>new TextEncoder().encode(value||'').byteLength;

function savedInventory(){
  try{
    const storage=window.localStorage,keys=workspaceKeys(storage),raw=storage.getItem(SAVED_WORKSPACES);
    let count=0;
    if(raw){
      try{const record=JSON.parse(raw);count=record&&typeof record==='object'&&!Array.isArray(record)?Object.keys(record).length:null;}
      catch{count=null;}
    }
    const copies=keys.filter(key=>key!==SAVED_WORKSPACES).length;
    const bytes=keys.reduce((total,key)=>total+textBytes(storage.getItem(key)),0);
    return {count,copies,bytes,schematic:storage.getItem(SCHEMATIC),hasCopies:keys.length>0};
  }catch{return null;}
}

function mount(navigate){
  const dialog=node('dialog');dialog.id='hbLocalSecurity';dialog.setAttribute('aria-labelledby','hbLocalSecurityTitle');
  dialog.innerHTML=`<article class="panel"><div class="panel-head"><div><h2 id="hbLocalSecurityTitle">Local data and browser diagnostics</h2>
    <p>Inspect this tab’s resident data, Hydra Bench’s saved browser copies and browser-reported storage.</p></div><button type="button" class="btn" id="hbLocalSecurityClose">Close diagnostics</button></div>
    <section aria-labelledby="hbLocalSecurityInventory"><h3 id="hbLocalSecurityInventory">Local data inventory</h3><div class="table-wrap"><table class="data-table"><thead><tr>
    <th scope="col">Data</th><th scope="col">Observed in this browser</th><th scope="col">Scope</th></tr></thead><tbody id="hbLocalSecurityRows"></tbody></table></div></section>
    <div class="actions"><button type="button" class="btn" id="hbLocalSecuritySources">Manage current sources</button>
      <button type="button" class="btn" id="hbLocalSecurityResults">Manage indexed simulation results</button>
      <button type="button" class="btn" id="hbLocalSecuritySchematic">Manage schematic</button>
      <button type="button" class="btn" id="hbLocalSecuritySaved">Manage saved workspaces</button>
      <button type="button" class="btn" id="hbLocalSecurityRemove">Remove saved workspace copies</button></div>
    <section aria-labelledby="hbLocalSecurityRuntime"><h3 id="hbLocalSecurityRuntime">Browser capabilities</h3><div id="hbLocalSecurityCapabilities"></div>
      <p id="hbLocalSecurityStorage" role="status"></p><button type="button" class="btn" id="hbLocalSecurityRefresh">Refresh diagnostics</button></section>
    <p id="hbLocalSecurityAction" role="status"></p></article>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id),body=$('hbLocalSecurityRows'),capabilities=$('hbLocalSecurityCapabilities');
  const action=$('hbLocalSecurityAction'),remove=$('hbLocalSecurityRemove');
  let generation=0;

  function inventory(){
    const files=[...state.files.values()],ready=files.filter(file=>file.status==='ready');
    const results=window.HydraResultsWorkspace?.session?.sources()||[],saved=savedInventory();
    const readyBytes=ready.reduce((sum,item)=>sum+(Number.isFinite(item.file?.size)?item.file.size:0),0);
    const indexBytes=results.reduce((sum,result)=>sum+(Number.isFinite(result.allocationBytes)?result.allocationBytes:0),0);
    let network='Unavailable',session='Unavailable';
    if(saved){
      network='No stored record';
      if(saved.schematic){
        try{
          const record=JSON.parse(saved.schematic);
          network=Array.isArray(record?.nodes)&&Array.isArray(record?.edges)?
            `${record.nodes.length} nodes, ${record.edges.length} links · ${showBytes(textBytes(saved.schematic))} encoded text`:'Unreadable record';
        }catch{network='Unreadable record';}
      }
    }
    try{session=countLabel(SESSION_KEYS.filter(key=>window.sessionStorage.getItem(key)!==null).length,'navigation entry','navigation entries');}catch{}
    const rows=[['Ready source files',`${ready.length} ready / ${files.length} total · ${showBytes(readyBytes)} selected file size`,'Current tab'],
      ['Indexed simulation results',`${countLabel(results.length,'source')} · ${showBytes(indexBytes)} typed sample allocation`,'Current tab worker'],
      ['Named workspace copies',saved?`${saved.count??'Unreadable count'} saved · ${countLabel(saved.copies,'recovery record')} · ${showBytes(saved.bytes)} encoded text`:'Unavailable','Browser local storage'],
      ['Schematic autosave',network,'Browser local storage'],['Navigation state',session,'Tab session storage']];
    body.replaceChildren();
    for(const row of rows){const tr=body.insertRow();for(const value of row)tr.insertCell().textContent=value;}
    remove.disabled=!saved?.hasCopies;
  }
  async function refresh(){
    inventory();const id=++generation;
    const available=[['Secure context',globalThis.isSecureContext===true],['Web Workers',typeof Worker==='function'],
      ['Web Crypto digest',typeof globalThis.crypto?.subtle?.digest==='function'],['Storage estimate API',typeof navigator.storage?.estimate==='function']];
    const list=node('ul');for(const [label,found] of available)list.append(node('li',label+' · '+(found?'available':'unavailable')));
    capabilities.replaceChildren(list);
    const quota=$('hbLocalSecurityStorage');
    if(typeof navigator.storage?.estimate!=='function'){quota.textContent='Origin storage estimate unavailable.';return;}
    quota.textContent='Reading the browser’s origin storage estimate…';
    try{
      const estimate=await navigator.storage.estimate();if(id!==generation)return;
      quota.textContent=Number.isFinite(estimate.usage)&&Number.isFinite(estimate.quota)?
        `This origin reports ${showBytes(estimate.usage)} used and ${showBytes(estimate.quota)} quota. It can include other pages on the origin.`:
        'The browser did not provide an origin usage and quota estimate.';
    }catch{if(id===generation)quota.textContent='The browser declined to report origin storage usage.';}
  }
  $('hbLocalSecurityRefresh').onclick=()=>void refresh();
  $('hbLocalSecurityClose').onclick=()=>dialog.close();
  for(const [id,workspace,page] of [['Sources','data','time-series'],['Results','network','simulation-results'],
    ['Schematic','network','schematic'],['Saved','reports','workspace']])$('hbLocalSecurity'+id).onclick=()=>{dialog.close();navigate(workspace,page,true);};
  remove.onclick=()=>{
    if(!window.confirm('Remove all named Hydra Bench browser workspaces and their recovery copies? This affects saved browser copies. Export any setup you need first.'))return;
    try{
      const storage=window.localStorage,keys=workspaceKeys(storage);
      for(const key of keys)storage.removeItem(key);
      renderNamedWorkspaces();
      action.textContent='Removed the named workspace and recovery copies. The current tab’s sources and schematic remain available.';
    }catch{action.textContent='The browser restricted removal. Review the refreshed inventory.';}
    void refresh();
  };
  window.addEventListener('icm:source-pool-changed',()=>{if(dialog.open)inventory();});
  window.addEventListener('icm:simulation-sources-changed',()=>{if(dialog.open)inventory();});
  window.addEventListener('icm:route-changed',({detail})=>{if(detail.page!=='security'&&dialog.open)dialog.close();});
  return ()=>{action.textContent='';if(!dialog.open)dialog.showModal();void refresh();};
}

window.HydraLocalSecurity={open(navigate){open??=mount(navigate);open();}};
})();
