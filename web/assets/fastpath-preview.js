(function(root){
  'use strict';
  const previewState={item:null,mode:'combined'};
  const nextPaint=function(){return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});};
  const numberText=function(v){return v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:4});};
  const unitText=function(s){return s.canonical_unit||s.original_unit||'unresolved';};

  function ensureBar(){
    const chart=document.getElementById('timeChart');
    if(!chart)return null;
    let bar=document.getElementById('fastpathPreviewBar');
    if(!bar){
      bar=document.createElement('div');
      bar.id='fastpathPreviewBar';
      bar.className='fastpath-preview-bar';
      bar.hidden=true;
      chart.insertAdjacentElement('beforebegin',bar);
    }
    return bar;
  }
  function quantities(item){
    const found=[];
    for(const s of item&&item.preview&&item.preview.series||[]){
      const q=String(s.quantity||'').toLowerCase();
      if(['flow','depth','velocity','rainfall','level'].includes(q)&&!found.includes(q))found.push(q);
    }
    return found;
  }
  function availableModes(item){
    const q=quantities(item),modes=[];
    for(const name of ['flow','depth','velocity','rainfall','level'])if(q.includes(name))modes.push(name);
    if((item&&item.preview&&item.preview.series||[]).length>1)modes.push('combined');
    return modes.length?modes:['combined'];
  }
  function selectedSeries(item,mode){
    const rows=item&&item.preview&&item.preview.series||[];
    if(mode==='combined')return rows.slice(0,6);
    const selected=rows.filter(function(s){return String(s.quantity||'').toLowerCase()===mode;});
    return (selected.length?selected:rows).slice(0,6);
  }
  function renderBar(item){
    const bar=ensureBar();if(!bar)return;
    const modes=availableModes(item);
    if(!modes.includes(previewState.mode))previewState.mode=modes.includes('combined')?'combined':modes[0];
    const total=item.preview&&item.preview.series?item.preview.series.length:0,extra=Math.max(0,total-6);
    bar.hidden=false;
    const buttons=modes.map(function(mode){
      const label=mode.charAt(0).toUpperCase()+mode.slice(1);
      return '<button type="button" data-fastpath-mode="'+esc(mode)+'" class="'+(mode===previewState.mode?'active':'')+'">'+esc(label)+'</button>';
    }).join('');
    bar.innerHTML='<div class="fastpath-preview-copy"><strong>Fast preview</strong><span>Display-only · advanced engineering validation continues in the background'+(extra?' · first 6 of '+total+' series shown':'')+'</span></div>'+
      '<div class="fastpath-channel-nav">'+buttons+'</div>'+
      '<span class="fastpath-preview-status" id="fastpathPreviewStatus">Validating…</span>';
    bar.querySelectorAll('[data-fastpath-mode]').forEach(function(button){
      button.addEventListener('click',function(){
        previewState.mode=button.dataset.fastpathMode;
        void renderPreview(item,previewState.mode,false);
      });
    });
  }
  function statisticTrace(series){
    return {
      type:'table',name:'Preview statistics',domain:{x:[0,1],y:[0,.20]},
      columnwidth:[2.2,1,1,1,1,1],
      header:{values:['Series','Unit','Min','Mean','Max','Valid samples'],align:['left','center','right','right','right','right'],fill:{color:'#f2f4f7'},line:{color:'#d9e1e8',width:1},font:{family:'system-ui, sans-serif',size:11,color:'#263746'},height:27},
      cells:{values:[
        series.map(function(s){return s.column;}),
        series.map(unitText),
        series.map(function(s){return numberText(s.statistics&&s.statistics.minimum);}),
        series.map(function(s){return numberText(s.statistics&&s.statistics.mean);}),
        series.map(function(s){return numberText(s.statistics&&s.statistics.maximum);}),
        series.map(function(s){return Number(s.statistics&&s.statistics.valid_count||0).toLocaleString();})
      ],align:['left','center','right','right','right','right'],fill:{color:'#fff'},line:{color:'#e4e9ed',width:1},font:{family:'system-ui, sans-serif',size:10.5,color:'#253746'},height:25},
      hoverinfo:'skip'
    };
  }
  function colourFor(series,index){
    const q=String(series.quantity||'').toLowerCase();
    if(q==='rainfall')return '#4A90E2';
    return index===0?'#ff0000':['#c73333','#a63e3e','#d45a5a','#8e3030','#e06b6b'][index%5];
  }
  async function renderPreview(item,requestedMode,navigate){
    if(!item||!item.preview||!item.preview.eligible||!item.preview.series||!item.preview.series.length)return null;
    previewState.item=item;
    if(requestedMode)previewState.mode=requestedMode;
    renderBar(item);
    if(navigate!==false&&root.__ICM_PRECISION_WORKBENCH__&&root.__ICM_PRECISION_WORKBENCH__.navigate)root.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',false);
    const series=selectedSeries(item,previewState.mode);
    const plotBottom=.285,plotTop=1,gap=series.length>1?.025:0;
    const share=Math.max(.08,(plotTop-plotBottom-gap*Math.max(0,series.length-1))/Math.max(1,series.length));
    const traces=[],layout={
      template:'plotly_white',
      title:{text:(item.preview.monitor||item.displayName)+' · Fast preview',x:.01,xanchor:'left',font:{size:18,color:'#263746'}},
      height:Math.max(620,Math.min(1020,420+series.length*150)),
      margin:{l:86,r:42,t:88,b:38},
      hovermode:'x unified',
      legend:{orientation:'h',y:1.025,x:1,xanchor:'right',yanchor:'bottom',font:{size:11}},
      xaxis:{title:null,showgrid:false,zeroline:false,anchor:'free',position:.27,side:'bottom',rangeslider:{visible:false},automargin:true,tickfont:{size:10,color:'#506272'}},
      annotations:[{xref:'paper',x:.5,yref:'paper',y:.218,text:'<b>Preview statistics</b>',showarrow:false,xanchor:'center',yanchor:'bottom',font:{size:11,color:'#263746'}}],
      paper_bgcolor:'#fff',plot_bgcolor:'#fff',uirevision:'icm-fastpath-preview-v1'
    };
    let top=plotTop;
    series.forEach(function(s,index){
      const bottom=Math.max(plotBottom,top-share),axisNumber=index+1,axisKey=axisNumber===1?'yaxis':'yaxis'+axisNumber,axisRef=axisNumber===1?'y':'y'+axisNumber;
      const q=String(s.quantity||s.column||'value'),unit=unitText(s),unresolved=s.unit_status!=='resolved';
      layout[axisKey]={title:{text:q.charAt(0).toUpperCase()+q.slice(1)+' ('+unit+')',standoff:10},domain:[bottom,top],anchor:'x',showgrid:q!=='rainfall',gridcolor:'#e8eef3',zeroline:false,automargin:true,tickfont:{size:10,color:'#506272'},titlefont:{size:11,color:unresolved?'#a15c00':'#263746'}};
      if(q==='rainfall')layout[axisKey].autorange='reversed';
      traces.push({x:s.timestamps,y:s.values,name:s.column,type:s.display_count>8000?'scattergl':'scatter',mode:'lines',connectgaps:false,yaxis:axisRef,line:{color:colourFor(s,index),width:q==='rainfall'?1:1.7},hovertemplate:'%{x}<br>'+s.column+': %{y:.4g}'+(unresolved?' · unit unresolved':'')+'<extra></extra>'});
      top=bottom-gap;
    });
    traces.push(statisticTrace(series));
    const chart=document.getElementById('timeChart');
    if(chart){chart.style.height=layout.height+'px';chart.style.minHeight=layout.height+'px';}
    await Plotly.react('timeChart',traces,layout,{responsive:true,displaylogo:false,scrollZoom:true});
    const graphPaintAt=performance.now();
    await nextPaint();
    const statsPaintAt=performance.now();
    root.__ICM_WORKBENCH__.lastGraphMode='fastpath-preview';
    root.__ICM_WORKBENCH__.fastpathPreview={sourceId:item.id,mode:previewState.mode,series:series.map(function(s){return {column:s.column,quantity:s.quantity,unit_status:s.unit_status,source_count:s.source_count,display_count:s.display_count};})};
    return {graphPaintAt:graphPaintAt,statsPaintAt:statsPaintAt,mode:previewState.mode};
  }
  function markValidated(item,reconciliation){
    if(!previewState.item||previewState.item.id!==item.id)return;
    const status=document.getElementById('fastpathPreviewStatus');
    if(status){
      status.textContent=reconciliation&&reconciliation.status==='matched'?'Validated · advanced analysis ready':'Validated with warning';
      status.classList.toggle('warning',!reconciliation||reconciliation.status!=='matched');
    }
  }
  function clear(){
    previewState.item=null;previewState.mode='combined';
    const bar=document.getElementById('fastpathPreviewBar');if(bar)bar.hidden=true;
  }
  function active(){return previewState.item?{sourceId:previewState.item.id,mode:previewState.mode}:null;}
  root.ICMFastPath=Object.freeze({renderPreview:renderPreview,markValidated:markValidated,clear:clear,active:active});
})(window);
