/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";

const hosts=new Set(["www.gov.uk","www.scottishwater.co.uk","www.sepa.org.uk","www1.eere.energy.gov",
  "help.autodesk.com","www.hec.usace.army.mil","www.usbr.gov"]);
const exactReferences=new Set([
  "https://www.ciwem.org/assets/pdf/Special%20Interest%20Groups/Urban%20Drainage%20Group/Code%20of%20Practice%20for%20the%20Hydraulic%20Modelling%20of%20Ur.pdf",
  "https://www.ciwem.org/assets/pdf/Special%20Interest%20Groups/Urban%20Drainage%20Group/WAPUG_User_Note_06.pdf",
  "https://unstats.un.org/unsd/envaccounting/waterGuidelines/Material/WMO_Guide_168_Vol_I_en_hydrological_practices.pdf",
  "https://www.itl.nist.gov/div898/software/dataplot/refman2/auxillar/correlat.htm",
  "https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors",
  "https://www.fhwa.dot.gov/engineering/hydraulics/pubs/hif24006.pdf",
  "https://www.fhwa.dot.gov/engineering/hydraulics/pubs/hds4intr.pdf",
  "https://www.water.ie/sites/default/files/2025-08/Code-of-Practice-for-Wastewater-Infrastructure-CDS-5020-03-Rev-03.pdf",
  "https://www.emerald.com/jince/article/11/4/133/417643",
  "https://www.energy.gov/documents/doe-hdbk-1012-92vol3",
]);
const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
function officialLink(source) {
  const url=new URL(source.url);
  if(url.protocol!=="https:"||url.username||url.password||(!hosts.has(url.host)&&!exactReferences.has(url.href)))return null;
  const link=element("a",source.label);link.href=url.href;link.target="_blank";link.rel="noopener noreferrer";
  link.referrerPolicy="no-referrer";return link;
}

function mount(navigate,routes) {
  const root=element("dialog");root.id="tab-method-library";root.setAttribute("aria-labelledby","hbMethodTitle");
  root.innerHTML=`<article class="panel">
    <div class="panel-head"><div><h2 id="hbMethodTitle">Engineering method library</h2><p>Search the methods applied by this build. Check assumptions and limitations against your project and the cited guidance.</p></div>
    <button type="button" id="hbMethodClose">Close method library</button></div>
    <div class="mapping-grid"><label>Search methods<input type="search" id="hbMethodSearch" maxlength="128"></label>
    <label>Category<select id="hbMethodCategory"><option value="">All categories</option></select></label>
    <label>Jurisdiction<select id="hbMethodJurisdiction"><option value="">All jurisdictions</option></select></label></div>
    <p id="hbMethodStatus" role="status"></p>
    <button type="button" id="hbMethodRetry" hidden>Retry loading methods</button><div id="hbMethodResults"></div>
  </article>`;
  document.body.append(root);
  const $=id=>root.querySelector("#"+id), search=$("hbMethodSearch"), category=$("hbMethodCategory"), jurisdiction=$("hbMethodJurisdiction");
  const results=$("hbMethodResults"), status=$("hbMethodStatus"), retry=$("hbMethodRetry");
  let entries=null,loading=false;
  function render(){
    if(!entries)return;
    const terms=search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches=entries.filter(entry=>(!category.value||entry.category===category.value)&&
      (!jurisdiction.value||entry.jurisdiction===jurisdiction.value)&&terms.every(term=>entry.text.includes(term)));
    status.textContent=`${matches.length} of ${entries.length} methods`;
    results.replaceChildren();
    for(const entry of matches){
      const row=element("details"),title=element("summary",entry.name);
      row.append(title,element("p",entry.category+" · "+entry.jurisdiction));
      for(const paragraph of entry.paragraphs)row.append(element("p",paragraph));
      const links=element("ul");
      for(const source of entry.references){const link=officialLink(source);if(link){const item=element("li");item.append(link);links.append(item);}}
      if(links.childNodes.length)row.append(element("h3","References"),links);
      if(Object.hasOwn(routes,entry.workspace)&&Object.hasOwn(routes[entry.workspace].pages,entry.page)){
        const button=element("button","Open "+routes[entry.workspace].pages[entry.page].label);button.type="button";
        button.onclick=()=>{root.close();navigate(entry.workspace,entry.page,true);};row.append(button);
      }
      results.append(row);
    }
    if(!matches.length)results.append(element("p","No methods match these filters."));
  }
  async function load(){
    if(loading||entries)return;
    loading=true;retry.hidden=true;status.textContent="Loading the method library…";
    try {
      const response=await fetch("assets/method-library.json?v="+encodeURIComponent(buildToken),{credentials:"same-origin",referrerPolicy:"no-referrer"});
      if(!response.ok)throw new Error("Method library unavailable");
      const data=await response.json();
      if(data.schema_version!==1||!Array.isArray(data.methods))throw new Error("Unexpected method library format");
      entries=data.methods.map(entry=>({...entry,text:[entry.name,entry.category,entry.jurisdiction,...entry.paragraphs,
        ...entry.references.map(reference=>reference.label)].join(" ").toLowerCase()}));
      for(const [select,key] of [[category,"category"],[jurisdiction,"jurisdiction"]])
        for(const value of [...new Set(entries.map(entry=>entry[key]))].sort())select.add(new Option(value,value));
      render();
    } catch {
      entries=null;status.textContent="This build's engineering method library could not be loaded.";retry.hidden=false;
    } finally {loading=false;}
  }
  search.oninput=render;category.onchange=render;jurisdiction.onchange=render;retry.onclick=()=>void load();
  $("hbMethodClose").onclick=()=>root.close();
  return ()=>{if(!root.open)root.showModal();void load();};
}

window.HydraMethodLibrary={install(about,navigate,routes){
  const action=element("div"),button=element("button","Open engineering method library");
  action.className="actions";button.type="button";button.setAttribute("aria-haspopup","dialog");action.append(button);
  about.querySelector(".pw-about-description").after(action);
  let open;
  button.onclick=()=>{open??=mount(navigate,routes);open();};
}};
})();
