/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
'use strict';

const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const value=(number,digits=7)=>Number.isFinite(number)?Number(number.toPrecision(digits)).toLocaleString(undefined,{maximumFractionDigits:12}):'—';
const labels={capacity:'Capacity at known depth',depth:'Normal depth',diameter:'Required diameter',gradient:'Required gradient'};

function mount(){
  const root=document.getElementById('tab-manning-sizing');
  root.innerHTML=`<article class="panel"><div class="panel-head"><div><h2>Manning circular pipe sizing</h2>
    <p>Steady, uniform gravity flow in one clean circular barrel. Enter a reviewed Manning coefficient and energy gradient.</p></div></div>
    <form id="hbManningForm" class="mapping-grid">
    <label>Calculation<select name="mode"><option value="capacity">Capacity at known depth</option><option value="depth">Normal depth</option>
    <option value="diameter">Required full-bore diameter</option><option value="gradient">Required full-bore gradient</option></select></label>
    <label>Manning n (s/m^(1/3))<input name="n" type="number" min="0.001" max="0.2" step="any" placeholder="0.013" required></label>
    <label>Kinematic viscosity (m²/s)<input name="viscosity_m2_s" type="number" min="0.000000001" max="0.01" step="any" value="0.000001" required></label>
    <label data-mode="capacity depth gradient">Internal diameter (mm)<input name="diameter" type="number" min="1" max="20000" step="any" required></label>
    <label data-mode="capacity depth diameter">Energy gradient (m/m)<input name="gradient" type="number" min="0" max="1" step="any" required></label>
    <label data-mode="capacity">Water depth (% of diameter)<input name="fill" type="number" min="0" max="100" step="any" value="100" required></label>
    <label data-mode="depth diameter gradient">Target discharge (L/s)<input name="target" type="number" min="0" step="any" required></label>
    <div class="actions"><button class="btn primary" type="submit">Calculate Manning result</button></div></form>
    <p id="hbManningStatus" role="status"></p><section id="hbManningResult" aria-label="Calculated Manning result" hidden>
    <div id="hbManningSummary" class="summary-box"></div><div id="hbManningSections" class="pipe-section-views"></div>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Calculated hydraulic sections"><table class="data-table"><caption>Calculated sections</caption>
    <thead><tr><th scope="col">Depth (mm)</th><th scope="col">Area (m²)</th><th scope="col">Hydraulic radius (m)</th><th scope="col">Flow (L/s)</th>
    <th scope="col">Mean velocity (m/s)</th><th scope="col">Reynolds number</th><th scope="col">Darcy equivalent f</th></tr></thead><tbody id="hbManningRows"></tbody></table></div>
    <p>Low-Reynolds results are withheld. Full-bore sizing is a continuous hydraulic requirement. Review available diameters, gradient, controls and transitions for the actual installation.</p>
    <div class="actions"><button class="btn" type="button" id="hbManningPlotButton">Show depth–discharge plot</button>
    <button class="btn" type="button" id="hbManningKeep">Keep as a trial</button><button class="btn" type="button" id="hbManningAudit">Download calculation CSV</button></div>
    <p id="hbManningPlotStatus" role="status"></p><div id="hbManningPlot" role="group" aria-label="Uniform-flow depth versus discharge"></div></section>
    <section id="hbManningTrials" aria-label="Manning trial comparison" hidden><h3>Compare pipe trials</h3>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Saved Manning trial results"><table class="data-table"><caption>Manning trials</caption>
    <thead><tr><th scope="col">Calculation</th><th scope="col">Diameter (mm)</th><th scope="col">Energy gradient (m/m)</th><th scope="col">Manning n</th>
    <th scope="col">Full-bore capacity (L/s)</th><th scope="col">Calculated depths (mm)</th><th scope="col">Action</th></tr></thead><tbody id="hbManningTrialRows"></tbody></table></div>
    <div class="actions"><button class="btn" id="hbManningTrialExport" type="button">Download trial comparison CSV</button>
    <button class="btn" id="hbManningClear" type="button">Clear trials</button></div></section></article>`;
  const $=id=>root.querySelector('#'+id),form=$('hbManningForm'),fields=form.elements;
  const status=$('hbManningStatus'),result=$('hbManningResult'),sections=$('hbManningSections'),chart=$('hbManningPlot');
  const plotStatus=$('hbManningPlotStatus'),submit=form.querySelector('[type=submit]');
  let generation=0,plotGeneration=0,calculation=null;
  const trials=[];

  function showFields(){
    for(const label of form.querySelectorAll('[data-mode]')){
      label.hidden=!label.dataset.mode.split(' ').includes(fields.mode.value);
      const field=label.querySelector('input');field.disabled=label.hidden;field.required=!label.hidden;
    }
  }
  function clear(message){
    ++generation;++plotGeneration;calculation=null;result.hidden=true;submit.disabled=false;
    if(chart.data)globalThis.Plotly?.purge(chart);
    plotStatus.textContent='';if(message)status.textContent=message;
  }
  function currentInputs(){
    const number=key=>fields[key].disabled?null:fields[key].valueAsNumber;
    return {mode:fields.mode.value,n:number('n'),viscosity_m2_s:number('viscosity_m2_s'),
      diameter_m:fields.diameter.disabled?null:number('diameter')/1000,gradient:number('gradient'),
      depth_fraction:fields.fill.disabled?null:number('fill')/100,discharge_m3_s:fields.target.disabled?null:number('target')/1000};
  }
  const mul=(number,factor)=>Number.isFinite(number)?number*factor:null;
  function cellRow(body,entries){const row=node('tr');for(const text of entries)row.append(node('td',text));body.append(row);return row;}
  function geometry(point){
    const figure=node('figure'),pipe=node('div'),water=node('div');pipe.className='pipe-section-circle';pipe.setAttribute('aria-hidden','true');
    water.className='pipe-section-water';water.style.height=100*point.depth_fraction+'%';pipe.append(water);
    figure.append(pipe,node('figcaption',value(100*point.depth_fraction,5)+'% of diameter'));return figure;
  }
  const descriptions={
    supported:'Calculation ready. Review the full-bore reference and each retained section solution.',
    'outside turbulent screening range':'Outside the turbulent screening range. Review viscosity, geometry or a suitable alternative method.',
    'above capacity envelope':'The target exceeds the circular uniform-flow capacity envelope.',
    'dry section':'Dry section. Enter a positive water depth to assess flow.',
    'zero gradient':'Zero gradient gives zero uniform-flow capacity.',
    'zero target discharge':'Zero target discharge gives no moving-flow normal depth.',
    'positive target and gradient required':'Required diameter needs positive flow and positive gradient.',
    'outside supported diameter range':'The continuous required diameter is outside 1–20,000 mm.',
    'outside supported gradient range':'The required gradient exceeds the supported 1 m/m range.',
  };
  function display(output){
    const summary=$('hbManningSummary'),rows=$('hbManningRows');summary.replaceChildren();sections.replaceChildren();rows.replaceChildren();
    const diameterLabel=output.mode==='diameter'?(output.status==='supported'?'Continuous required diameter':'Candidate diameter'):'Internal diameter';
    const slopeLabel=output.mode==='gradient'?(output.status==='supported'?'Required energy gradient':'Candidate energy gradient'):'Energy gradient';
    for(const [label,number,unit] of [[diameterLabel,mul(output.diameter_m,1000),'mm'],[slopeLabel,output.gradient,'m/m'],
      ['Full-bore reference',mul(output.full_bore?.discharge_m3_s,1000),'L/s']]){
      const item=node('div');item.append(node('strong',value(number)+' '+unit),node('span',label));summary.append(item);
    }
    for(const point of output.solutions){
      sections.append(geometry(point));cellRow(rows,[point.depth_m*1000,point.area_m2,point.hydraulic_radius_m,
        mul(point.discharge_m3_s,1000),point.velocity_m_s,point.reynolds,point.darcy_equivalent].map(number=>value(number)));
    }
    $('hbManningPlotButton').disabled=!output.curve?.some(point=>Number.isFinite(point[1])&&point[1]>0);
    $('hbManningKeep').disabled=output.status!=='supported'||trials.length>=20;
    status.textContent=(descriptions[output.status]||output.status)+(output.solutions.length===2?' Two free-surface depths satisfy the target at this gradient.':'');
    result.hidden=false;
  }
  fields.mode.onchange=()=>{showFields();clear('Choose inputs for the selected calculation.');};
  form.oninput=event=>{if(event.target!==fields.mode)clear('Inputs changed. Calculate the current trial.');};
  form.onsubmit=async event=>{
    event.preventDefault();clear('Calculating uniform flow…');const ticket=generation,input=currentInputs();submit.disabled=true;
    try{
      await ensureEngineBoot();const output=await engine.call('circular_manning_capacity',input);
      if(ticket!==generation)return;
      calculation={input,output};display(output);
    }catch(error){if(ticket===generation)status.textContent=conciseErrorMessage(error);}
    finally{if(ticket===generation)submit.disabled=false;}
  };
  $('hbManningPlotButton').onclick=async()=>{
    const item=calculation;if(!item)return;
    const update=++plotGeneration;plotStatus.textContent='Drawing the supported depth–discharge curve…';
    try{
      const plotly=await loadVendorScript('Plotly');if(update!==plotGeneration)return;
      const traces=[{x:item.output.curve.map(row=>mul(row[1],1000)),y:item.output.curve.map(row=>row[0]*1000),
        mode:'lines',name:'Manning conveyance',connectgaps:false},
        {x:item.output.solutions.map(row=>mul(row.discharge_m3_s,1000)),y:item.output.solutions.map(row=>row.depth_m*1000),mode:'markers',name:'Calculated section'}];
      await plotly.react(chart,traces,{...(window.HydraDesign?.chartLayout()||{}),height:370,margin:{l:72,r:24,t:20,b:80},
        xaxis:{title:{text:'Discharge (L/s)'},rangemode:'tozero'},yaxis:{title:{text:'Water depth above invert (mm)'},rangemode:'tozero'}},
        plotConfig('hydra-manning-depth-discharge'));
      if(update===plotGeneration)plotStatus.textContent='Plot ready. Blank portions fall below the supported Reynolds range.';
    }catch(error){if(update===plotGeneration)plotStatus.textContent=conciseErrorMessage(error);}
  };

  const trialColumns=['Calculation','Diameter (mm)','Energy gradient (m/m)','Manning n (s/m^(1/3))','Full-bore capacity (L/s)','Calculated depths (mm)'];
  const trialRow=(output,format=String)=>[labels[output.mode],mul(output.diameter_m,1000),output.gradient,output.n,mul(output.full_bore?.discharge_m3_s,1000),
    output.solutions.map(point=>format(point.depth_m*1000)).join(' / ')];
  function renderTrials(){
    $('hbManningTrials').hidden=!trials.length;
    const rows=$('hbManningTrialRows');rows.replaceChildren();
    trials.forEach((trial,index)=>{
      const row=cellRow(rows,trialRow(trial.output,value).map(item=>typeof item==='number'?value(item):item||'—'));
      const action=node('td'),remove=node('button','Remove');remove.type='button';remove.className='btn';
      remove.setAttribute('aria-label','Remove trial '+(index+1));remove.onclick=()=>{
        trials.splice(index,1);renderTrials();const next=rows.querySelector('button');(next||$('hbManningKeep')).focus();
      };action.append(remove);row.append(action);
    });
    $('hbManningKeep').disabled=calculation?.output.status!=='supported'||trials.length>=20;
  }
  $('hbManningKeep').onclick=()=>{
    if(calculation?.output.status!=='supported'||trials.length>=20)return;
    trials.push(calculation);renderTrials();status.textContent=trials.length+' trial(s) retained for comparison.';
  };
  $('hbManningClear').onclick=()=>{trials.length=0;renderTrials();$('hbManningKeep').focus();};
  function exportRows(name,rows){downloadBlob(name,rows.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');}
  const references=['Reference','FHWA HEC-22, 4th edition, chapter 9.1.3 and USACE HEC-RAS Uniform Flow Computations'];
  $('hbManningAudit').onclick=()=>{
    if(!calculation)return;
    const {output,input}=calculation;
    exportRows('hydra-circular-manning-calculation.csv',[['Build',buildToken],['Method',output.method],references,
      ['Equation','Q = A × R^(2/3) × sqrt(S) / n'],['Inputs (SI)',JSON.stringify(input)],['Status',output.status],trialColumns,
      trialRow(output),['Depth (m)','Area (m²)','Hydraulic radius (m)','Discharge (m³/s)','Velocity (m/s)','Reynolds','Darcy equivalent f'],
      ...output.solutions.map(row=>[row.depth_m,row.area_m2,row.hydraulic_radius_m,row.discharge_m3_s,row.velocity_m_s,row.reynolds,row.darcy_equivalent])]);
  };
  $('hbManningTrialExport').onclick=()=>exportRows('hydra-manning-trials.csv',[['Build',buildToken],references,trialColumns,...trials.map(item=>trialRow(item.output))]);
  showFields();
}

window.HydraGravitySizing={mount};
})();
