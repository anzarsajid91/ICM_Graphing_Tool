/* Canonical browser-side project/domain registry.
 *
 * Imported files are classified once into sources, engineering series, assets
 * and relationships. Existing selectors remain for backwards-compatible
 * workflows, but they are now projections of this registry rather than each
 * tool rediscovering file/column meaning independently.
 */
(function(global){
  const AUXILIARY=new Set([
    'second','seconds','elapsedsecond','elapsedseconds','simulationsecond',
    'simulationseconds','timeindex','timestep','timesteps','row','rowid','index'
  ]);
  const norm=value=>String(value??'').trim();
  const token=value=>norm(value).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const stem=name=>norm(name).split(/[\\/]/).pop().replace(/\.(?:fdv|r|csv|hyd|txt|xlsx)$/i,'').replace(/\.(?:fdv|r)$/i,'');
  const key=(sourceId,column)=>JSON.stringify([sourceId,column]);

  function quantityFor(parsed,column){
    const metadata=parsed?.metadata||{};
    const detail=metadata.channels?.[column]||metadata.series_metadata?.[column]||{};
    const direct=detail.quantity||metadata.quantity_by_column?.[column]||metadata.quantity;
    if(direct)return String(direct).toLowerCase();
    const t=token(column);
    if(t.includes('rain'))return 'rainfall';
    if(t.includes('velocity')||t==='vel')return 'velocity';
    if(t.includes('flow')||t==='q'||t.includes('discharge'))return 'flow';
    if(t.includes('depth'))return 'depth';
    if(t.includes('level')||t.includes('stage'))return 'level';
    return null;
  }
  function unitFor(parsed,column){
    const metadata=parsed?.metadata||{};
    const detail=metadata.channels?.[column]||metadata.series_metadata?.[column]||{};
    return detail.canonical_unit||metadata.canonical_unit||detail.original_unit||metadata.original_unit||null;
  }
  function roleFor(name,parsed,quantities){
    const n=norm(name).toLowerCase();
    const format=String(parsed?.format||'').toLowerCase();
    if(quantities.includes('rainfall')||format.includes('rainfall')||/\.(r|r\.txt)$/i.test(name))return 'rainfall';
    if(/model|simulat|scenario|icm[_ -]?result/i.test(n))return 'model';
    if(format==='fdv_ascii'||/observ|monitor|telemetry|survey|edm|flowmeter|\bfm\d*/i.test(n))return 'observed';
    return 'unclassified';
  }
  function assetKind(role,parsed){
    if(role==='rainfall')return 'rain-gauge';
    if(role==='observed'&&String(parsed?.format||'')==='fdv_ascii')return 'flow-monitor';
    if(role==='model')return 'model-result';
    return 'source';
  }

  class ProjectRegistry{
    constructor(){
      this.sources=new Map();
      this.series=new Map();
      this.assets=new Map();
      this.relationships=[];
      this.associationSource=null;
      this.version=1;
    }
    registerSource(item){
      if(!item?.id||!item?.parsed)return null;
      this.removeSource(item.id);
      const columns=(item.parsed.columns||[]).map(String).filter(col=>!AUXILIARY.has(token(col)));
      const quantities=[...new Set(columns.map(col=>quantityFor(item.parsed,col)).filter(Boolean))];
      const role=roleFor(item.displayName||item.file?.name||'',item.parsed,quantities);
      const metadata=item.parsed.metadata||{};
      const assetId=norm(metadata.monitor)||stem(item.displayName||item.file?.name||item.id)||item.id;
      const source={
        id:item.id,
        name:item.displayName||item.file?.name||item.id,
        path:item.virtualPath,
        format:item.parsed.format||'unknown',
        role,
        assetId,
        assetKind:assetKind(role,item.parsed),
        quantities,
        rows:Number(item.parsed.rows||0),
        start:item.parsed.start||null,
        end:item.parsed.end||null,
        seriesKeys:[],
      };
      this.sources.set(source.id,source);
      const asset=this.assets.get(assetId)||{id:assetId,kind:source.assetKind,sourceIds:[],seriesKeys:[],metadata:{}};
      if(!asset.sourceIds.includes(source.id))asset.sourceIds.push(source.id);
      asset.kind=asset.kind==='source'?source.assetKind:asset.kind;
      if(metadata.monitor)asset.metadata.monitor=metadata.monitor;
      this.assets.set(assetId,asset);
      for(const column of columns){
        const seriesKey=key(source.id,column);
        const series={
          key:seriesKey,
          sourceId:source.id,
          assetId,
          role,
          column,
          quantity:quantityFor(item.parsed,column),
          unit:unitFor(item.parsed,column),
          label:`${source.name} — ${column}`,
        };
        this.series.set(seriesKey,series);
        source.seriesKeys.push(seriesKey);
        asset.seriesKeys.push(seriesKey);
      }
      this.render();
      return source;
    }
    removeSource(sourceId){
      const existing=this.sources.get(sourceId);
      if(!existing)return;
      for(const seriesKey of existing.seriesKeys||[])this.series.delete(seriesKey);
      const asset=this.assets.get(existing.assetId);
      if(asset){
        asset.sourceIds=asset.sourceIds.filter(id=>id!==sourceId);
        asset.seriesKeys=asset.seriesKeys.filter(k=>this.series.has(k));
        if(!asset.sourceIds.length&&!asset.seriesKeys.length)this.assets.delete(existing.assetId);
      }
      this.sources.delete(sourceId);
      this.render();
    }
    clearSources(){
      this.sources.clear();
      this.series.clear();
      this.assets.clear();
      this.relationships=[];
      this.associationSource=null;
      this.render();
    }
    setRelationships(records=[],source='fm_rg_assoc.xlsx'){
      this.relationships=[];
      this.associationSource=source||'fm_rg_assoc.xlsx';
      for(const record of records||[]){
        const downstream=norm(record.monitor);
        if(!downstream)continue;
        const asset=this.assets.get(downstream)||{id:downstream,kind:'flow-monitor',sourceIds:[],seriesKeys:[],metadata:{}};
        asset.kind='flow-monitor';
        asset.metadata={...asset.metadata,rainGauge:record.rain_gauge||null,diameterMm:record.diameter_mm??null};
        this.assets.set(downstream,asset);
        for(const upstream of record.upstream||[]){
          const up=norm(upstream);
          if(!up)continue;
          if(!this.assets.has(up))this.assets.set(up,{id:up,kind:'flow-monitor',sourceIds:[],seriesKeys:[],metadata:{}});
          this.relationships.push({type:'upstream-flow',from:up,to:downstream,source:this.associationSource});
        }
        if(record.rain_gauge){
          const gauge=norm(record.rain_gauge);
          if(!this.assets.has(gauge))this.assets.set(gauge,{id:gauge,kind:'rain-gauge',sourceIds:[],seriesKeys:[],metadata:{}});
          this.relationships.push({type:'rainfall-association',from:gauge,to:downstream,source:this.associationSource});
        }
      }
      this.render();
    }
    listSeries(filter={}){
      let rows=[...this.series.values()];
      if(filter.role)rows=rows.filter(x=>x.role===filter.role);
      if(filter.quantity)rows=rows.filter(x=>x.quantity===filter.quantity);
      if(filter.assetId)rows=rows.filter(x=>x.assetId===filter.assetId);
      return rows;
    }
    getSeries(seriesKey){return this.series.get(seriesKey)||null;}
    source(sourceId){return this.sources.get(sourceId)||null;}
    snapshot(){
      return {
        schema:'icm-project-registry-v1',
        sources:[...this.sources.values()].map(x=>({...x})),
        series:[...this.series.values()].map(x=>({...x})),
        assets:[...this.assets.values()].map(x=>({...x,sourceIds:[...x.sourceIds],seriesKeys:[...x.seriesKeys]})),
        relationships:this.relationships.map(x=>({...x})),
        associationSource:this.associationSource,
      };
    }
    mount(){
      if(document.getElementById('domainRegistryPanel'))return;
      const mapping=document.querySelector('.mapping-panel');
      if(!mapping)return;
      const panel=document.createElement('details');
      panel.id='domainRegistryPanel';
      panel.className='panel domain-registry-panel';
      panel.innerHTML='<summary><strong>Project data registry</strong><span id="domainRegistrySummary">No classified project data yet.</span></summary><div class="domain-registry-body"><p>Sources are classified once into engineering assets and quantities, then reused by graphing, verification, survey, rainfall, spill and reporting workflows.</p><div id="domainRegistryMetrics" class="summary-box"></div><div class="table-wrap"><table class="data-table compact"><thead><tr><th>Asset</th><th>Role</th><th>Source</th><th>Quantities</th><th>Relationships</th></tr></thead><tbody id="domainRegistryBody"></tbody></table></div></div>';
      mapping.insertAdjacentElement('afterend',panel);
      this.render();
    }
    render(){
      const summary=document.getElementById('domainRegistrySummary');
      const metrics=document.getElementById('domainRegistryMetrics');
      const body=document.getElementById('domainRegistryBody');
      if(!summary||!metrics||!body)return;
      summary.textContent=`${this.assets.size} asset${this.assets.size===1?'':'s'} · ${this.sources.size} source${this.sources.size===1?'':'s'} · ${this.series.size} engineering series`;
      const roles=[...this.sources.values()].reduce((acc,x)=>(acc[x.role]=(acc[x.role]||0)+1,acc),{});
      metrics.innerHTML=[
        ['Assets',this.assets.size],
        ['Engineering series',this.series.size],
        ['Observed sources',roles.observed||0],
        ['Model sources',roles.model||0],
        ['Rainfall sources',roles.rainfall||0],
        ['Relationships',this.relationships.length],
      ].map(([label,value])=>`<div><strong>${value}</strong><span>${label}</span></div>`).join('');
      const escape=s=>String(s??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
      body.innerHTML=[...this.assets.values()].sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})).map(asset=>{
        const sourceNames=asset.sourceIds.map(id=>this.sources.get(id)?.name).filter(Boolean);
        const quantities=[...new Set(asset.seriesKeys.map(k=>this.series.get(k)?.quantity).filter(Boolean))];
        const rel=this.relationships.filter(x=>x.from===asset.id||x.to===asset.id);
        const relText=rel.slice(0,3).map(x=>x.type==='upstream-flow'?`${x.from} → ${x.to}`:`${x.from} ↔ ${x.to}`).join(', ');
        const role=asset.sourceIds.map(id=>this.sources.get(id)?.role).find(Boolean)||asset.kind;
        return `<tr><td><strong>${escape(asset.id)}</strong><br><small>${escape(asset.kind)}</small></td><td>${escape(role)}</td><td>${escape(sourceNames.join(', ')||'association only')}</td><td>${escape(quantities.join(', ')||'—')}</td><td>${escape(relText||'—')}</td></tr>`;
      }).join('');
    }
  }

  global.ICMProjectRegistry=new ProjectRegistry();
})(window);
