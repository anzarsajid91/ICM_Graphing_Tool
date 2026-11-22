/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
'use strict';

const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const value=(number,digits=7)=>Number.isFinite(number)?Number(number.toPrecision(digits)).toLocaleString(undefined,{maximumFractionDigits:12}):'—';
const labels={capacity:'Capacity at known depth',depth:'Normal depth',diameter:'Required diameter',gradient:'Required gradient'};
const methods={manning:'Manning',darcy:'Darcy–Weisbach'};
const shapes={circle:'Circular pipe',box:'Closed rectangular conduit',rectangle:'Open rectangular channel',trapezoid:'Open trapezoidal channel'};
let publishedSheet=null;

function mount(){
  const root=document.getElementById('tab-manning-sizing');
  root.innerHTML=`<article class="panel"><div class="panel-head"><div><h2>Gravity pipe and channel sizing</h2>
    <p>Review steady uniform flow in one clean barrel or prismatic open channel. Enter the reviewed roughness and energy gradient.</p></div></div>
    <form id="hbManningForm" class="mapping-grid">
    <label>Hydraulic method<select name="method"><option value="manning">Manning</option><option value="darcy">Darcy–Weisbach</option></select></label>
    <label>Section shape<select name="shape"><option value="circle">Circular pipe</option><option value="box">Closed rectangular conduit</option>
    <option value="rectangle">Open rectangular channel</option><option value="trapezoid">Open trapezoidal channel</option></select></label>
    <label>Calculation<select name="mode"><option value="capacity">Capacity at known depth</option><option value="depth">Normal depth</option>
    <option value="diameter">Required full-bore diameter</option><option value="gradient">Required full-bore gradient</option></select></label>
    <label data-method="manning">Manning n (s/m^(1/3))<input name="n" type="number" min="0.001" max="0.2" step="any" placeholder="0.013" required></label>
    <label data-method="darcy">Absolute roughness (mm)<input name="roughness" type="number" min="0" step="any"></label>
    <label>Kinematic viscosity (m²/s)<input name="viscosity_m2_s" type="number" min="0.000000001" max="0.01" step="any" value="0.000001" required></label>
    <label data-mode="capacity depth gradient" data-shape="circle">Internal diameter (mm)<input name="diameter" type="number" min="1" max="20000" step="any" required></label>
    <label data-shape="box rectangle trapezoid">Bottom width (mm)<input name="width" type="number" min="1" max="100000" step="any"></label>
    <label data-shape="box rectangle trapezoid">Maximum section depth (mm)<input name="maxDepth" type="number" min="1" max="100000" step="any"></label>
    <label data-shape="trapezoid">Side slope (horizontal to 1 vertical)<input name="sideSlope" type="number" min="0" max="20" step="any"></label>
    <label data-mode="capacity depth diameter">Energy gradient (m/m)<input name="gradient" type="number" min="0" max="1" step="any" required></label>
    <label data-mode="capacity"><span id="hbManningFillLabel">Water depth (% of diameter)</span><input name="fill" type="number" min="0" max="100" step="any" value="100" required></label>
    <label data-mode="depth diameter gradient">Target discharge (L/s)<input name="target" type="number" min="0" step="any" required></label>
    <div class="actions"><button class="btn" id="hbDarcyCapacity" type="button" hidden>Open Colebrook–White capacity</button>
    <button class="btn primary" type="submit">Calculate gravity result</button></div></form>
    <p id="hbManningStatus" role="status"></p><section id="hbManningResult" aria-label="Calculated gravity result" hidden>
    <div id="hbManningSummary" class="summary-box"></div><div id="hbManningSections" class="pipe-section-views"></div>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Calculated hydraulic sections"><table class="data-table"><caption>Calculated sections</caption>
    <thead><tr><th scope="col">Depth (mm)</th><th scope="col">Area (m²)</th><th scope="col">Hydraulic radius (m)</th><th scope="col">Flow (L/s)</th>
    <th scope="col">Mean velocity (m/s)</th><th scope="col">Reynolds number</th><th scope="col">Darcy f</th>
    <th scope="col" data-prismatic-result hidden>Froude number</th><th scope="col" data-prismatic-result hidden>Specific energy (m)</th></tr></thead><tbody id="hbManningRows"></tbody></table></div>
    <p id="hbGravityMethodBasis"></p><p id="hbGravityLimits">Review section geometry, controls and transitions for the actual installation.</p>
    <div class="actions"><button class="btn" type="button" id="hbManningPlotButton">Show depth–discharge plot</button>
    <button class="btn" type="button" id="hbManningKeep">Keep as a trial</button><button class="btn" type="button" id="hbManningAudit">Download calculation CSV</button></div>
    <p id="hbManningPlotStatus" role="status"></p><div id="hbManningPlot" role="group" aria-label="Uniform-flow depth versus discharge"></div></section>
    <section id="hbManningTrials" aria-label="Gravity trial comparison" hidden><h3>Compare pipe trials</h3>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Saved gravity trial results"><table class="data-table"><caption>Gravity sizing trials</caption>
    <thead><tr><th scope="col">Calculation</th><th scope="col">Method</th><th scope="col">Section dimensions</th><th scope="col">Energy gradient (m/m)</th><th scope="col">Roughness</th>
    <th scope="col">Full-bore capacity (L/s)</th><th scope="col">Free-surface limit (L/s)</th><th scope="col">Calculated depths (mm)</th><th scope="col">Action</th></tr></thead><tbody id="hbManningTrialRows"></tbody></table></div>
    <div class="actions"><button class="btn" id="hbManningTrialExport" type="button">Download trial comparison CSV</button>
    <button class="btn" id="hbManningClear" type="button">Clear trials</button></div></section></article>`;
  const $=id=>root.querySelector('#'+id),form=$('hbManningForm'),fields=form.elements;
  const status=$('hbManningStatus'),result=$('hbManningResult'),sections=$('hbManningSections'),chart=$('hbManningPlot');
  const plotStatus=$('hbManningPlotStatus'),submit=form.querySelector('[type=submit]');
  let generation=0,plotGeneration=0,calculation=null;
  const trials=[];
  const reportSheet={id:'gravitySizingForm',title:'Gravity sizing calculation sheet',content:node('div'),
    snapshot:null,revision:null,isCurrent:()=>Boolean(calculation)};
  publishedSheet=reportSheet;

  function showFields(){
    const darcy=fields.method.value==='darcy';
    for(const option of fields.shape.options)option.disabled=darcy&&option.value!=='circle';
    if(darcy)fields.shape.value='circle';
    const prismatic=fields.shape.value!=='circle';
    const direct=new Set(['capacity','depth']);
    for(const option of fields.mode.options)option.disabled=darcy&&direct.has(option.value)||prismatic&&!direct.has(option.value);
    if(darcy&&direct.has(fields.mode.value))fields.mode.value='diameter';
    if(prismatic&&!direct.has(fields.mode.value))fields.mode.value='capacity';
    $('hbDarcyCapacity').hidden=!darcy;
    $('hbManningFillLabel').textContent='Water depth (% of '+(prismatic?'section depth':'diameter')+')';
    for(const label of form.querySelectorAll('[data-mode],[data-method],[data-shape]')){
      const {mode,method,shape}=label.dataset;
      label.hidden=Boolean(mode&&!mode.split(' ').includes(fields.mode.value)||method&&method!==fields.method.value||shape&&!shape.split(' ').includes(fields.shape.value));
      const field=label.querySelector('input');field.disabled=label.hidden;field.required=!label.hidden;
    }
  }
  function clear(message){
    ++generation;++plotGeneration;calculation=null;result.hidden=true;submit.disabled=false;
    if(reportSheet.snapshot){
      reportSheet.snapshot=null;reportSheet.revision=null;reportSheet.content.replaceChildren();
      window.dispatchEvent(new Event('icm:calculation-sheets-changed'));
    }
    if(chart.data)globalThis.Plotly?.purge(chart);
    plotStatus.textContent='';if(message)status.textContent=message;
  }
  function currentInputs(){
    const number=key=>fields[key].disabled?null:fields[key].valueAsNumber;
    const common={mode:fields.mode.value,viscosity_m2_s:number('viscosity_m2_s'),gradient:number('gradient'),
      discharge_m3_s:fields.target.disabled?null:number('target')/1000};
    if(fields.shape.value!=='circle')return {...common,shape:fields.shape.value,width_m:number('width')/1000,max_depth_m:number('maxDepth')/1000,
      side_slope:number('sideSlope'),n:number('n'),depth_fraction:fields.fill.disabled?null:number('fill')/100};
    return {...common,diameter_m:fields.diameter.disabled?null:number('diameter')/1000,
      ...(fields.method.value==='darcy'?{roughness_m:number('roughness')/1000}:{n:number('n'),depth_fraction:fields.fill.disabled?null:number('fill')/100})};
  }
  const mul=(number,factor)=>Number.isFinite(number)?number*factor:null;
  function cellRow(body,entries){const row=node('tr');for(const text of entries)row.append(node('td',text));body.append(row);return row;}
  function geometry(point,output){
    if(output.shape){
      const figure=node('figure'),ns='http://www.w3.org/2000/svg',graphic=document.createElementNS(ns,'svg');
      const add=(tag,attributes)=>{const el=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,value);graphic.append(el);};
      graphic.setAttribute('viewBox','0 0 108 76');graphic.setAttribute('width','104');graphic.setAttribute('height','76');graphic.setAttribute('aria-hidden','true');
      const extent=output.width_m+2*output.side_slope*output.max_depth_m,base=49*output.width_m/extent,spread=49-base;
      const level=70-64*point.depth_fraction,water=base+spread*point.depth_fraction;
      if(point.depth_fraction>0)add('polygon',{points:[[54-base,70],[54+base,70],[54+water,level],[54-water,level]].map(p=>p.join(',')).join(' '),fill:'#a3b8e8',stroke:'#555fa8'});
      const profile='M5 6L'+(54-base)+' 70H'+(54+base)+'L103 6';
      add('path',{d:profile+(output.shape==='box'?'Z':''),stroke:'currentColor','stroke-width':'2',fill:'none'});
      figure.append(graphic,node('figcaption',value(100*point.depth_fraction,5)+'% of section depth'));return figure;
    }
    const figure=node('figure'),pipe=node('div'),water=node('div');pipe.className='pipe-section-circle';pipe.setAttribute('aria-hidden','true');
    water.className='pipe-section-water';water.style.height=100*point.depth_fraction+'%';pipe.append(water);
    figure.append(pipe,node('figcaption',value(100*point.depth_fraction,5)+'% of diameter'));return figure;
  }
  const descriptions={
    supported:'Calculation ready. Review the full-bore reference and each retained section solution.',
    'outside turbulent screening range':'Outside the turbulent screening range. Review viscosity, geometry or a suitable alternative method.',
    'above capacity envelope':'The target exceeds the circular uniform-flow capacity envelope.',
    'above free-surface capacity':'The target exceeds the supported free-surface capacity at the reviewed maximum depth.',
    'at free-surface crown limit':'The target reaches the free-surface limit just below the crown. Review pressurised and transition conditions separately.',
    'dry section':'Dry section. Enter a positive water depth to assess flow.',
    'zero gradient':'Zero gradient gives zero uniform-flow capacity.',
    'zero target discharge':'Zero target discharge gives no moving-flow normal depth.',
    'positive target and gradient required':'Required diameter needs positive flow and positive gradient.',
    'outside supported diameter range':'The continuous required diameter is outside 1–20,000 mm.',
    'outside supported gradient range':'The required gradient exceeds the supported 1 m/m range.',
    'unsupported target flow regime':'The target flow is outside the supported Reynolds range for the selected calculation.',
    'no diameter in supported range':'No circular diameter satisfies the target within the supported geometry and Reynolds ranges.',
  };
  function display(output){
    const summary=$('hbManningSummary'),rows=$('hbManningRows');summary.replaceChildren();sections.replaceChildren();rows.replaceChildren();
    const diameterLabel=output.mode==='diameter'?(output.status==='supported'?'Continuous required diameter':'Candidate diameter'):'Internal diameter';
    const slopeLabel=output.mode==='gradient'?(output.status==='supported'?'Required energy gradient':'Candidate energy gradient'):'Energy gradient';
    const items=output.shape?[
      ['Bottom width',mul(output.width_m,1000),'mm'],['Maximum section depth',mul(output.max_depth_m,1000),'mm'],[slopeLabel,output.gradient,'m/m'],
      [output.shape==='box'?'Free-surface crown limit':'Maximum-depth reference',mul(output.free_surface_limit.discharge_m3_s,1000),'L/s'],
      ...(output.full_bore?[['Full-bore reference',mul(output.full_bore.discharge_m3_s,1000),'L/s']]:[]),
      ...(Number.isFinite(output.critical_depth_m)?[['Critical depth',mul(output.critical_depth_m,1000),'mm']]:[]),
    ]:[[diameterLabel,mul(output.diameter_m,1000),'mm'],[slopeLabel,output.gradient,'m/m'],['Full-bore reference',mul(output.full_bore?.discharge_m3_s,1000),'L/s']];
    for(const [label,number,unit] of items){
      const item=node('div');item.append(node('strong',value(number)+' '+unit),node('span',label));summary.append(item);
    }
    for(const heading of root.querySelectorAll('[data-prismatic-result]'))heading.hidden=!output.shape;
    for(const point of output.solutions){
      sections.append(geometry(point,output));cellRow(rows,[point.depth_m*1000,point.area_m2,point.hydraulic_radius_m,
        mul(point.discharge_m3_s,1000),point.velocity_m_s,point.reynolds,point.darcy_equivalent??point.friction_factor,
        ...(output.shape?[point.froude,point.specific_energy_m]:[])].map(number=>value(number)));
    }
    $('hbGravityMethodBasis').textContent=calculation.method==='manning'?'Manning uses a reviewed n and the displayed Darcy-equivalent resistance. Low-Reynolds results are withheld.':
      'Darcy–Weisbach uses laminar or Colebrook–White resistance. Transitional results are withheld.';
    $('hbGravityLimits').textContent=output.shape?
      'The section drawing is schematic. Free-surface results assume uniform flow and use hydraulic depth A/T and a velocity-head coefficient of 1. Review controls, overtopping and transitions separately.':
      'Full-bore sizing is a continuous hydraulic requirement. Review available diameters, gradient, controls and transitions for the actual installation.';
    $('hbManningPlotButton').disabled=!output.curve?.some(point=>Number.isFinite(point[1])&&point[1]>0);
    $('hbManningKeep').disabled=output.status!=='supported'||trials.length>=20;
    status.textContent=(descriptions[output.status]||output.status)+(output.solutions.length===2?' Two free-surface depths satisfy the target at this gradient.':'');
    result.hidden=false;
    updateReportSheet();
  }
  fields.mode.onchange=()=>{showFields();clear('Choose inputs for the selected calculation.');};
  fields.method.onchange=()=>{showFields();clear('Choose inputs for the selected method.');};
  fields.shape.onchange=()=>{showFields();clear('Choose inputs for the selected section.');};
  form.oninput=event=>{if(![fields.mode,fields.method,fields.shape].includes(event.target))clear('Inputs changed. Calculate the current trial.');};
  window.addEventListener('icm:assessment-context-restored',()=>clear('Workspace restored. Calculate the current trial.'));
  $('hbDarcyCapacity').onclick=()=>window.__ICM_PRECISION_WORKBENCH__.navigate('hydraulics','capacity',true);
  form.onsubmit=async event=>{
    event.preventDefault();clear('Calculating uniform flow…');const ticket=generation,input=currentInputs(),method=fields.method.value;submit.disabled=true;
    try{
      await ensureEngineBoot();
      const operation=input.shape?'prismatic_manning_capacity':method==='darcy'?'circular_darcy_sizing':'circular_manning_capacity';
      const output=await engine.call(operation,input);
      if(ticket!==generation)return;
      calculation={input,output,method};display(output);
    }catch(error){if(ticket===generation)status.textContent=conciseErrorMessage(error);}
    finally{if(ticket===generation)submit.disabled=false;}
  };
  $('hbManningPlotButton').onclick=async()=>{
    const item=calculation;if(!item)return;
    const update=++plotGeneration;plotStatus.textContent='Drawing the supported depth–discharge curve…';
    try{
      const plotly=await loadVendorScript('Plotly');if(update!==plotGeneration)return;
      const traces=[{x:item.output.curve.map(row=>mul(row[1],1000)),y:item.output.curve.map(row=>row[0]*1000),
        mode:'lines',name:item.output.shape?'Free-surface Manning':methods[item.method]+' conveyance',connectgaps:false},
        {x:item.output.solutions.map(row=>mul(row.discharge_m3_s,1000)),y:item.output.solutions.map(row=>row.depth_m*1000),mode:'markers',name:'Calculated section'}];
      if(item.output.shape==='box'&&Number.isFinite(item.output.full_bore.discharge_m3_s))traces.push({
        x:[item.output.full_bore.discharge_m3_s*1000],y:[item.output.max_depth_m*1000],mode:'markers',name:'Full-bore reference'});
      await plotly.react(chart,traces,{...(window.HydraDesign?.chartLayout()||{}),height:370,margin:{l:72,r:24,t:20,b:80},
        xaxis:{title:{text:'Discharge (L/s)'},rangemode:'tozero'},yaxis:{title:{text:'Water depth above invert (mm)'},rangemode:'tozero'}},
        plotConfig('hydra-gravity-depth-discharge'));
      if(update===plotGeneration)plotStatus.textContent='Plot ready. Gaps indicate unsupported depth or resistance conditions.';
    }catch(error){if(update===plotGeneration)plotStatus.textContent=conciseErrorMessage(error);}
  };

  const trialColumns=['Calculation','Method','Section dimensions','Energy gradient (m/m)','Roughness basis','Full-bore capacity (L/s)','Free-surface limit (L/s)','Calculated depths (mm)'];
  const trialRow=({output,method},format=String)=>[labels[output.mode],methods[method],output.shape?
    shapes[output.shape]+' · '+format(output.width_m*1000)+' × '+format(output.max_depth_m*1000)+' mm'+(output.shape==='trapezoid'?' · '+format(output.side_slope)+'H:1V':''):
    (Number.isFinite(output.diameter_m)?format(output.diameter_m*1000)+' mm':'Unavailable'),output.gradient,
    method==='manning'?format(output.n)+' s/m^(1/3)':format(output.roughness_m*1000)+' mm',mul(output.full_bore?.discharge_m3_s,1000),
    mul(output.free_surface_limit?.discharge_m3_s,1000),
    output.solutions.map(point=>format(point.depth_m*1000)).join(' / ')];
  function renderTrials(){
    $('hbManningTrials').hidden=!trials.length;
    const rows=$('hbManningTrialRows');rows.replaceChildren();
    trials.forEach((trial,index)=>{
      const row=cellRow(rows,trialRow(trial,value).map(item=>typeof item==='number'?value(item):item||'—'));
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
  const references={manning:['Reference','FHWA HEC-22, 4th edition, chapter 9.1.3 and USACE HEC-RAS Uniform Flow Computations'],
    prismatic:['Section reference','FHWA HDS-4, section 4.3.2 and USACE HEC-RAS Uniform Flow Computations'],
    darcy:['Reference','C. F. Colebrook (1939) and DOE Fundamentals Handbook DOE-HDBK-1012/3-92, Fluid Flow']};
  function auditRows(){
    const {output,input,method}=calculation;
    return [['Build',buildToken],['Method',output.method],references[output.shape?'prismatic':method],
      ['Equation',method==='manning'?'Q = A × R^(2/3) × sqrt(S) / n':'S = f × V²/(2gD)'],['Inputs (SI)',JSON.stringify(input)],['Status',output.status],trialColumns,
      trialRow(calculation),...(output.shape?[['Critical depth (m)',output.critical_depth_m],['Free-surface basis','Fr = V / sqrt(gA/T). Specific energy = y + V²/(2g).']]:[]),
      ['Depth (m)','Area (m²)','Hydraulic radius (m)','Discharge (m³/s)','Velocity (m/s)','Reynolds','Darcy f',
        ...(output.shape?['Free-surface width (m)','Froude number','Specific energy (m)']:[])],
      ...output.solutions.map(row=>[row.depth_m,row.area_m2,row.hydraulic_radius_m,row.discharge_m3_s,row.velocity_m_s,row.reynolds,row.darcy_equivalent??row.friction_factor,
        ...(output.shape?[row.top_width_m,row.froude,row.specific_energy_m]:[])])];
  }
  function updateReportSheet(){
    const {input,output,method}=calculation;
    const inputs=[['Hydraulic method',methods[method]],['Calculation',labels[input.mode]],['Section',shapes[input.shape||'circle']]];
    for(const [key,label] of Object.entries({diameter_m:'Diameter (m)',width_m:'Bottom width (m)',max_depth_m:'Maximum section depth (m)',
      side_slope:'Side slope (H:1V)',gradient:'Energy gradient (m/m)',roughness_m:'Absolute roughness (m)',n:'Manning n (s/m^(1/3))',
      viscosity_m2_s:'Kinematic viscosity (m²/s)',depth_fraction:'Water depth fraction',discharge_m3_s:'Target flow (m³/s)'})){
      if(Number.isFinite(input[key]))inputs.push([label,input[key]]);
    }
    reportSheet.content.replaceChildren(...[$('hbManningSummary'),sections,result.querySelector('.table-wrap'),$('hbGravityMethodBasis'),$('hbGravityLimits')].map(item=>item.cloneNode(true)));
    for(const element of reportSheet.content.querySelectorAll('[id]'))element.removeAttribute('id');
    reportSheet.snapshot={title:reportSheet.title,summary:status.textContent,inputs,
      identity:[['Hydra Bench version',document.querySelector('meta[name="hydra-bench-version"]')?.content||'Unavailable'],
        ['Application revision',buildToken],['Calculation engine revision',window.__ICM_WORKBENCH__?.workerBuildToken||'Unavailable'],
        ['Method version',output.method],['Calculated at (UTC)',new Date().toISOString()]],
      rows:[...auditRows(),['Full-bore capacity (m³/s)',output.full_bore?.discharge_m3_s??null],
        ...output.solutions.flatMap((point,index)=>[['Solution '+(index+1)+' depth (m)',point.depth_m],['Solution '+(index+1)+' discharge (m³/s)',point.discharge_m3_s]])]};
    reportSheet.revision='gravity:'+generation;
    window.dispatchEvent(new Event('icm:calculation-sheets-changed'));
  }
  $('hbManningAudit').onclick=()=>{
    if(calculation)exportRows('hydra-'+(calculation.output.shape?'prismatic':'circular')+'-gravity-calculation.csv',auditRows());
  };
  $('hbManningTrialExport').onclick=()=>exportRows('hydra-gravity-trials.csv',[['Build',buildToken],...Object.values(references),trialColumns,...trials.map(item=>trialRow(item))]);
  showFields();
}

window.HydraGravitySizing={mount,sheet:()=>publishedSheet};
})();
