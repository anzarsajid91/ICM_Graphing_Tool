/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
(() => {
"use strict";

const quantities={flow:'Flow',depth:'Depth',level:'Level',velocity:'Velocity'};
const MAX_CHANNELS=8, MAX_DISPLAY_POINTS=50000;
const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const formatCount=value=>value.toLocaleString();
let openDialog;

function mount(){
  const dialog=node('dialog');dialog.id='hbMonitorCompare';dialog.setAttribute('aria-labelledby','hbMonitorCompareTitle');
  dialog.innerHTML=`<article class="panel">
    <div class="panel-head"><div><h2 id="hbMonitorCompareTitle">Compare monitoring locations</h2><p>Review compatible monitoring series on a common project-clock axis.</p></div>
      <button type="button" class="btn" id="hbMonitorCompareClose">Close comparison</button></div>
    <form id="hbMonitorCompareForm"><div class="mapping-grid">
      <label>Quantity<select name="quantity"><option value="flow">Flow</option><option value="depth">Depth</option><option value="level">Level</option><option value="velocity">Velocity</option></select></label>
      <label>Filter monitoring sources<input type="search" name="query" maxlength="120" placeholder="Find an ID or filename"></label>
      <label>Rainfall overlay<select name="rain"></select></label>
      <label>Start on project clock (optional)<input name="start" type="datetime-local" step="1"></label>
      <label>End on project clock (optional)<input name="end" type="datetime-local" step="1"></label>
      <label>Maximum valid gap (s)<input name="gap" type="number" step="any" min="0.001" value="900" required></label>
      <label id="hbMonitorCompareDatum" hidden>Shared vertical datum<input name="datum" maxlength="128" disabled></label>
    </div>
    <fieldset class="hb-monitor-compare-choices"><legend>Monitoring series</legend><p id="hbMonitorCompareCount"></p><div id="hbMonitorCompareChoices"></div></fieldset>
    <p><label class="hb-transform-confirm"><input type="checkbox" name="clock" required> The selected sources use the same project clock</label></p>
    <div class="actions"><button type="submit" class="btn primary">Plot monitoring series</button></div></form>
    <p id="hbMonitorCompareStatus" role="status"></p>
    <section id="hbMonitorCompareView" aria-label="Monitoring comparison" hidden>
      <div class="actions"><button type="button" id="hbMonitorCompareFit" class="btn">Fit view</button>
        <button type="button" id="hbMonitorCompareCsv" class="btn">Download plotted samples CSV</button></div>
      <fieldset class="hb-monitor-compare-choices"><legend>Series visibility</legend><div id="hbMonitorCompareVisibility"></div></fieldset>
      <div id="hbMonitorComparePlot" role="group" aria-label="Synchronized monitoring and rainfall time series"></div>
      <p id="hbMonitorCompareCoverage"></p>
    </section></article>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id),form=$('hbMonitorCompareForm'),fields=form.elements;
  const choices=$('hbMonitorCompareChoices'),count=$('hbMonitorCompareCount'),status=$('hbMonitorCompareStatus');
  const chart=$('hbMonitorComparePlot'),visibility=$('hbMonitorCompareVisibility'),view=$('hbMonitorCompareView');
  const submit=form.querySelector('[type="submit"]'),selected=new Set();
  let request=0,record=null,prepared=null;

  const series=()=>allSeries().filter(({item,col})=>item.status==='ready'&&item.hash&&seriesUnit(item,col)&&
    item.parsed?.metadata?.time_basis!=='timezone-aware/unresolved');
  const quantity=({item,col})=>seriesQuantity(item,col);
  const isMonitor=row=>row.role!=='model'&&(row.role==='observed'||Boolean(row.item.parsed.metadata?.monitor)||row.item.parsed.format==='tabular_csv');
  const candidate=row=>isMonitor(row)&&quantity(row)===fields.quantity.value;
  const candidates=()=>series().filter(candidate);
  const pickRain=()=>series().find(row=>row.key===fields.rain.value&&quantity(row)==='rainfall');
  const fingerprint=({item,col})=>[item.hash,col,seriesQuantity(item,col),seriesUnit(item,col),seriesReference(item,col)];
  const selectionSignature=()=>JSON.stringify([...candidates().filter(row=>selected.has(row.key)),pickRain()].filter(Boolean).map(fingerprint));
  function clearResult(message){
    ++request;view.hidden=true;record=null;prepared=null;
    if(chart.data)globalThis.Plotly?.purge(chart);
    if(message)status.textContent=message;
  }
  function renderChoices(rows=candidates()){
    const query=fields.query.value.toLocaleLowerCase().trim();
    const shown=rows.filter(row=>row.label.toLocaleLowerCase().includes(query));
    choices.replaceChildren();
    for(const row of shown){
      const label=node('label'),input=node('input');input.type='checkbox';input.checked=selected.has(row.key);
      input.disabled=selected.size>=MAX_CHANNELS&&!input.checked;
      input.onchange=()=>{
        if(input.checked)selected.add(row.key);else selected.delete(row.key);
        clearResult('Selection changed. Plot the current monitoring series.');
        count.textContent=selected.size+' of '+MAX_CHANNELS+' selected.';
        for(const item of choices.querySelectorAll('input'))item.disabled=selected.size>=MAX_CHANNELS&&!item.checked;
      };
      label.append(input,node('span',row.label));choices.append(label);
    }
    count.textContent=rows.length?selected.size+' of '+MAX_CHANNELS+' selected.'+(shown.length?'':' No matching sources.'):
      'Import observations with the selected quantity and resolved units.';
  }
  function refresh(){
    const rows=candidates(),keys=new Set(rows.map(row=>row.key));
    for(const key of selected)if(!keys.has(key))selected.delete(key);
    const old=fields.rain.value;
    const rain=series().filter(row=>quantity(row)==='rainfall'&&rainfallSemanticsFor(row.item,row.col)!=='unresolved');
    fields.rain.replaceChildren(new Option('No rainfall overlay',''),...rain.map(row=>new Option(row.label,row.key)));
    fields.rain.value=rain.some(row=>row.key===old)?old:'';
    renderChoices(rows);
    const level=fields.quantity.value==='level';
    $('hbMonitorCompareDatum').hidden=!level;fields.datum.required=level;fields.datum.disabled=!level;
    if(prepared&&prepared!==selectionSignature())clearResult('A source changed. Plot the current monitoring series.');
  }
  fields.quantity.onchange=()=>{selected.clear();clearResult();refresh();};
  fields.query.oninput=()=>renderChoices();
  for(const name of ['rain','start','end','gap','datum','clock'])fields[name].onchange=()=>
    clearResult(record||submit.disabled?'Settings changed. Plot the current monitoring series.':'');

  form.onsubmit=async event=>{
    event.preventDefault();clearResult();
    const rows=candidates().filter(row=>selected.has(row.key)),rain=pickRain();
    if(rows.length<2||rows.length>MAX_CHANNELS){status.textContent='Select between two and eight compatible monitoring series.';return;}
    const unit=seriesUnit(rows[0].item,rows[0].col),start=fields.start.value||null,end=fields.end.value||null;
    if(rows.some(row=>seriesUnit(row.item,row.col)!==unit)){status.textContent='Resolve canonical units before comparing these channels.';return;}
    if(start&&end&&start>=end){status.textContent='Choose a later end time.';return;}
    const datum=fields.datum.disabled?'':fields.datum.value.trim();
    if(!fields.datum.disabled&&(!datum||rows.some(row=>seriesReference(row.item,row.col)&&seriesReference(row.item,row.col)!==datum))){
      status.textContent='Confirm a common vertical datum that agrees with each declared source datum.';return;
    }
    const sequence=++request,identity=selectionSignature(),gap=fields.gap.valueAsNumber,q=fields.quantity.value;
    prepared=identity;submit.disabled=true;status.textContent='Loading a local plot slice for each series…';
    try{
      await ensureEngineBoot();
      const plotly=await loadVendorScript('Plotly');
      const data=[];
      for(const row of rain?[...rows,rain]:rows){
        if(sequence!==request)return;
        const result=await engine.call('series_data',{path:row.item.virtualPath,column:row.col,start,end,max_points:5000,max_gap_seconds:gap});
        if(result.timestamp.length>MAX_DISPLAY_POINTS)throw new Error('This series has too many visible samples and gap boundaries. Enter a smaller time window.');
        if(row===rain)result.value=result.value.map(value=>Number.isFinite(value)&&value>=0?value:null);
        data.push({name:row.label,hash:row.item.hash,unit:seriesUnit(row.item,row.col),rain:row===rain,result});
      }
      if(sequence!==request||identity!==selectionSignature())return;
      const sampled=data.filter(item=>!item.rain&&item.result.value.some(Number.isFinite)).length;
      if(!sampled){status.textContent='The selected window contains no valid monitoring samples.';return;}
      const traces=data.map((item,index)=>({
        x:item.result.timestamp,y:item.result.value,name:esc(item.name),yaxis:item.rain?'y2':'y',
        type:item.result.display_count>2500?'scattergl':'scatter',mode:'lines+markers',connectgaps:false,
        line:{color:item.rain?'#137da1':palette[index],width:1.8,shape:item.rain?'hv':'linear'},marker:{size:3},
        hovertemplate:'%{x}<br>%{y:.5g} '+esc(item.unit)+'<extra></extra>'
      }));
      const layout={...(window.HydraDesign?.chartLayout()||{}),height:410,showlegend:false,hovermode:'x unified',
        margin:{l:70,r:rain?68:30,t:20,b:60},xaxis:{title:{text:'Project clock'},type:'date'},
        yaxis:{title:{text:quantities[q]+' ('+esc(unit)+')'+(datum?' · '+esc(datum):'')}},
        ...(rain?{yaxis2:{title:{text:'Rainfall ('+esc(seriesUnit(rain.item,rain.col))+')'},overlaying:'y',side:'right',autorange:'reversed',showgrid:false}}:{})};
      if(start&&end)layout.xaxis.range=[start,end];
      view.hidden=false;
      await plotly.react(chart,traces,layout,plotConfig('hydra-monitor-comparison',{modeBarButtonsToRemove:['select2d','lasso2d']}));
      if(sequence!==request||identity!==selectionSignature()){clearResult();return;}
      visibility.replaceChildren(...data.map((item,index)=>{
        const label=node('label'),input=node('input'),swatch=node('span');
        input.type='checkbox';input.checked=true;
        input.onchange=()=>void plotly.restyle(chart,{visible:input.checked},[index]);
        swatch.className='hb-monitor-swatch';swatch.style.background=traces[index].line.color;swatch.setAttribute('aria-hidden','true');
        label.append(input,swatch,node('span',item.name));return label;
      }));
      record={data,datum,gap,quantity:q};prepared=identity;
      const summaries=data.map(row=>row.name+' · '+formatCount(row.result.display_count)+' of '+formatCount(row.result.raw_count)+' source samples displayed');
      $('hbMonitorCompareCoverage').textContent=summaries.join(' · ')+'. Zoom uses the rendered series.';
      status.textContent='Plot ready. '+(sampled===rows.length?'Review relative timing and gaps before comparing measurements.':
        (rows.length-sampled)+' selected monitoring series have no samples in this window.');
    }catch(error){if(sequence===request)clearResult(conciseErrorMessage(error));}
    finally{submit.disabled=false;}
  };
  $('hbMonitorCompareFit').onclick=()=>{
    if(!record)return;
    const ranges={'xaxis.autorange':true,'yaxis.autorange':true};
    if(record.data.some(item=>item.rain))ranges['yaxis2.autorange']='reversed';
    void globalThis.Plotly.relayout(chart,ranges);
  };
  $('hbMonitorCompareCsv').onclick=()=>{
    if(!record||prepared!==selectionSignature()){clearResult('The source changed. Plot the current monitoring series.');return;}
    const rows=[['Build',buildToken],['Data','Display samples. Source files retain the full resolution.'],['Quantity',record.quantity],['Datum',record.datum],['Gap (s)',record.gap],
      ['Source','Source SHA-256','Project clock','Displayed value','Unit']];
    for(const {name,hash,unit,result} of record.data)for(const [index,time] of result.timestamp.entries()){
      if(time!==null)rows.push([name,hash,time,result.value[index],unit]);
    }
    downloadBlob('hydra-monitor-comparison.csv',rows.map(row=>row.map(ICMSafeCSV.cell).join(',')).join('\r\n'),'text/csv');
  };
  $('hbMonitorCompareClose').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{clearResult();status.textContent='';});
  window.addEventListener('icm:source-pool-changed',refresh);
  window.addEventListener('icm:rainfall-interpretation-changed',refresh);
  window.addEventListener('icm:route-changed',({detail})=>{if(detail.workspace!=='data'&&dialog.open)dialog.close();});
  return ()=>{refresh();if(!dialog.open)dialog.showModal();};
}

window.HydraMonitorComparison={open(){openDialog??=mount();openDialog();}};
})();
