/* Dedicated report workspace. Report tables never become hydraulic time series. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const forced=new WeakMap(),configs={},results={};
let kind='flooding',generation=0,busy=false,selected=null,poolSignature='';
const titles={flooding:'Flooding detriment',level:'Level detriment',spill:'Spill detriment'};
const isReport=item=>item?.status==='ready'&&item.parsed?.metadata?.source_kind==='detriment_report';
const reports=()=>[...state.files.values()].filter(isReport);
function detectReport(text){
  const lines=String(text).split(/\r?\n/).slice(0,100);
  // Native time series keep their existing import path, even if an ID is present.
  if(lines.some(l=>/TYPE\s*=\s*HYD/i.test(l)||l.split(/[,;\t]/).some(c=>/^(?:time|date|datetime|timestamp|pdatetime|seconds|elapsedseconds|simulationseconds)$/.test(c.trim().replace(/[\[(].*?[\])]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase()))))return null;
  return lines.some(l=>/(?:node\s*id|cso\s*id|asset\s*id|object\s*id|\bID\b)/i.test(l)&&/(?:flood|level|ground|spill|exceedance|duration|elevation)/i.test(l))?'auto':null;
}
function reportKind(file,buffer){return forced.get(file)||(buffer&&/\.csv$/i.test(file.name)?detectReport(new TextDecoder().decode(buffer.slice(0,32768))):null);}
const csvCell=value=>'"'+(typeof value==='string'&&/^[\s]*[=+\-@\t\r\n]/.test(value)?"'":'')+String(value??'').replaceAll('"','""')+'"';
function csv(result,rows){
  const fields=['asset_id','status','a','b','delta','unit','ground_a','ground_b','freeboard_a','freeboard_b','freeboard_change','duration_a_hours','duration_b_hours','duration_delta_hours','critical_a','critical_b','flags','scenario_a','scenario_b','source_a_sha256','source_b_sha256','threshold','freeboard_required','scope','period_start','period_end','template','counting_mode','method','ground_source_sha256','source_a_mapping','source_b_mapping','evidence_a','evidence_b','scenario_a_configuration','scenario_b_configuration','ground_configuration','detail_a_configuration','detail_b_configuration','date_convention','boundary_policy','asset_selection_ids','asset_selection_absent_ids','asset_selection_column','asset_selection_duplicates_removed'];
  const common={scenario_a:result.scenario_a.name,scenario_b:result.scenario_b.name,source_a_sha256:result.scenario_a.sha256,source_b_sha256:result.scenario_b.sha256,threshold:result.criteria.threshold,freeboard_required:result.criteria.freeboard_required,scope:result.scenario_a.scope,period_start:result.scenario_a.period_start,period_end:result.scenario_a.period_end,template:result.scenario_a.template,counting_mode:result.counting_mode,method:result.method,ground_source_sha256:result.ground_source?.sha256,source_a_mapping:JSON.stringify(result.scenario_a.mapping),source_b_mapping:JSON.stringify(result.scenario_b.mapping),scenario_a_configuration:JSON.stringify(result.scenario_a),scenario_b_configuration:JSON.stringify(result.scenario_b),ground_configuration:JSON.stringify(result.ground_source),detail_a_configuration:JSON.stringify(result.detail_source_a),detail_b_configuration:JSON.stringify(result.detail_source_b),date_convention:result.date_convention,boundary_policy:result.boundary_policy};
  // Record the list once, rather than multiplying a long selection into every row.
  const selection={asset_selection_ids:JSON.stringify(result.asset_selection?.ids||[]),asset_selection_absent_ids:JSON.stringify(result.asset_selection?.absent||[]),asset_selection_column:result.asset_selection?.column||'auto',asset_selection_duplicates_removed:result.asset_selection?.duplicates_removed||0};
  return [fields.map(csvCell).join(','),...rows.map((row,index)=>{
    const values={...common,...row,flags:row.flags.join('; '),evidence_a:JSON.stringify(row.evidence_a),evidence_b:JSON.stringify(row.evidence_b),...(index===0?selection:{})};
    return fields.map(f=>csvCell(values[f])).join(',');
  })].join('\r\n');
}
function filterRows(rows,filter,search){return rows.filter(r=>(filter==='all'||(filter==='unresolved'?(r.status==='unavailable'||r.status==='unmatched'||r.flags.includes('freeboard_unavailable')):r.status===filter||r.flags.includes(filter)))&&r.asset_id.toLowerCase().includes(String(search).toLowerCase()));}
// Clipboard IDs remain strings. Never infer numbers, prefixes or fuzzy matches.
const idHeading=value=>/^(?:id|identifier|nodeid|manholeid|linkid|assetid|objectid|csoid|usnodeid|dsnodeid)$/.test(String(value).toLowerCase().replace(/[^a-z0-9]/g,''));
function clipboardCells(text,delimiter){
  const rows=[];let row=[],cell='',quoted=false,atStart=true;
  const pushCell=()=>{row.push(cell.trim());cell='';atStart=true;};
  const pushRow=()=>{pushCell();if(row.some(Boolean))rows.push(row);row=[];};
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'&&(quoted||atStart)){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
    }else if(!quoted&&ch==='\n')pushRow();
    else if(!quoted&&(delimiter?ch===delimiter:/[,;\t]/.test(ch)))pushCell();
    else {cell+=ch;if(!/\s/.test(ch))atStart=false;}
  }
  if(quoted)throw Error('A quoted ID is unfinished. Close the quote before applying.');
  pushRow();return rows;
}
function parseIdList(text,column='auto',knownIds=[]){
  const raw=String(text??'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  if(!raw)return {ids:[],duplicates:0,columns:[],error:null,mode:'list'};
  try{
    // Inspect potential grid headings before treating delimiters as an ID list.
    const delimiter=raw.includes('\t')?'\t':raw.includes(';')?';':',';
    const grid=clipboardCells(raw,delimiter),head=grid[0]||[],candidates=head.map((v,i)=>idHeading(v)?i:-1).filter(i=>i>=0);
    const gridLike=(candidates.length>0&&grid.length>1)||(delimiter==='\t'&&grid.length>1&&head.length>1);
    const columns=gridLike||/^\d+$/.test(column)?Array.from({length:grid.reduce((n,r)=>Math.max(n,r.length),0)},(_,i)=>({value:String(i),label:'Column '+(i+1)+(candidates.length?' · '+(head[i]||'unnamed'):'' )})):[];
    let values,mode='list';
    if(column!=='list'&&(gridLike||/^\d+$/.test(column))){
      const index=column==='auto'?(candidates.length===1?candidates[0]:null):Number(column);
      if(index===null||!Number.isInteger(index)||index<0||index>=columns.length)return {ids:[],duplicates:0,columns,error:'Choose the ID column, or select All cells if this is an ID list.',mode:'grid'};
      const body=candidates.length?grid.slice(1):grid;
      if(body.some(row=>index>=row.length))return {ids:[],duplicates:0,columns,error:'Some grid rows are missing the selected ID column. Check the pasted grid.',mode:'grid'};
      values=body.map(row=>row[index]);mode='grid';
    }else{
      values=clipboardCells(raw,null).flat();
      if(!/[\r\n]/.test(String(text))&&!/[\n,;\t]/.test(raw)&&!knownIds.includes(raw)&&/\s/.test(raw)){
        // A single horizontal list may use spaces; quoted IDs keep their spaces.
        const tokens=raw.match(/"(?:""|[^"])*"|'[^']*'|[^\s]+/g)||[];
        values=tokens.map(v=>v.replace(/^"|"$/g,'').replaceAll('""','"').replace(/^'|'$/g,''));
      }
      if(values.length>1&&!knownIds.includes(values[0])&&idHeading(values[0]))values.shift();
    }
    const ids=[],seen=new Set();let duplicates=0;
    for(let value of values){value=String(value).trim();if(value.startsWith("'")&&value.endsWith("'")&&value.length>1)value=value.slice(1,-1);if(!value)continue;if(seen.has(value)){duplicates++;continue;}seen.add(value);ids.push(value);}
    if(!ids.length)return {ids,duplicates,columns,error:'No IDs found in the selected column or list.',mode};
    return {ids,duplicates,columns,error:null,mode};
  }catch(error){return {ids:[],duplicates:0,columns:[],error:error.message,mode:'list'};}
}
function selectIdRows(rows,ids){if(!ids.length)return rows.slice();const lookup=new Map(rows.map(row=>[row.asset_id,row]));return ids.map(id=>lookup.get(id)).filter(Boolean);}
function idMatchSummary(rows,ids){const known=new Set(rows.map(r=>r.asset_id));return {requested:ids.length,found:ids.filter(id=>known.has(id)).length,absent:ids.filter(id=>!known.has(id))};}
function summariseRows(rows){
  const comparable=rows.filter(r=>r.delta!=null);
  return {assets:rows.length,matched:rows.filter(r=>r.matched).length,detriment:rows.filter(r=>r.status==='detriment').length,risk:rows.filter(r=>r.status==='risk').length,improved:rows.filter(r=>r.status==='improvement').length,unresolved:rows.filter(r=>['unmatched','unavailable'].includes(r.status)||r.flags.includes('freeboard_unavailable')).length,max_increase:comparable.length?comparable.reduce((n,r)=>Math.max(n,r.delta),0):null};
}
function sectionData(row,minimum){return {ground_a:row.ground_a??null,ground_b:row.ground_b??null,water_a:row.a??null,water_b:row.b??null,minimum_a:row.ground_a!=null&&minimum!=null?row.ground_a-Number(minimum):null,minimum_b:row.ground_b!=null&&minimum!=null?row.ground_b-Number(minimum):null};}
function timelineData(events){return events.filter(e=>e.start&&e.end).map(e=>({start:e.start,end:e.end,duration_hours:e.duration_hours}));}
function pairedData(rows){return [{name:'A · baseline',x:rows.map(r=>r.asset_id),y:rows.map(r=>r.a),type:'bar',marker:{color:'#788f9c'}},{name:'B · proposed',x:rows.map(r=>r.asset_id),y:rows.map(r=>r.b),type:'bar',marker:{color:'#167983'}}];}
function relinkSource(reference,list){if(!reference?.sha256)return null;const matches=list.filter(x=>x.hash===reference.sha256);return matches.length===1?matches[0]:matches.find(x=>x.displayName===reference.name)||null;}
function reportOnlyWorkspace(w){return Boolean(w.detriment&&!w.mapping?.observed&&!(w.mapping?.models||[]).length&&!w.mapping?.rain&&Object.values(w.detriment).some(c=>c?.a?.reference||c?.b?.reference));}
function defaults(){return {a:{id:'',mapping:{},unit:'auto',duration_unit:'auto'},b:{id:'',mapping:{},unit:'auto',duration_unit:'auto'},ground:{id:'',mapping:{},unit:'auto'},detail_a:{id:'',mapping:{},duration_unit:'auto'},detail_b:{id:'',mapping:{},duration_unit:'auto'},threshold:'',freeboard_required:'',datum:'',scope:'',scope_confirmed:false,elevation_confirmed:false,period_start:'',period_end:'',template:'',counting_mode:'summary',filter:'detriment',search:'',sort:'severity',asset_ids_text:'',asset_ids_column:'auto',asset_ids:[],asset_ids_source:'',asset_ids_active_column:'auto',asset_ids_duplicates:0};}
function config(){return configs[kind]||(configs[kind]=defaults());}
function label(text,content){return '<label class="dt-field"><span>'+escape(text)+'</span>'+content+'</label>';}
function selectInput(key,options,value){return '<select data-key="'+escape(key)+'">'+options.map(([v,t])=>'<option value="'+escape(v)+'"'+(String(value??'')===v?' selected':'')+'>'+escape(t)+'</option>').join('')+'</select>';}
function input(key,value,type='text',extra=''){return '<input data-key="'+escape(key)+'" type="'+type+'" value="'+escape(value)+'" '+extra+'>';}
function idSelectorHtml(){return '<section class="dt-id-selector"><h3>Manhole / link IDs</h3><label class="dt-field" for="dtAssetIds"><span>Paste the assets to assess · optional</span><textarea id="dtAssetIds" rows="4" spellcheck="false" aria-describedby="dtIdsHelp dtIdsPreview" placeholder="00123&#10;MH-12&#10;MH-12.1">'+escape(config().asset_ids_text)+'</textarea></label><p class="dt-muted" id="dtIdsHelp">Paste a list or copied ICM grid. Accepts lines, commas, semicolons or tabs; a single horizontal list can use spaces. Put IDs containing spaces on separate lines or in quotes. Matching uses the complete, case-sensitive report ID.</p><div id="dtIdColumn"></div><p id="dtIdsPreview" class="dt-muted" role="status"></p><div class="dt-id-actions"><button id="dtApplyIds" type="button">Apply list</button><button id="dtClearIds" type="button">Clear</button></div></section>';}
function idDraft(){return parseIdList(config().asset_ids_text,config().asset_ids_column,results[kind]?.rows.map(r=>r.asset_id)||[]);}
function renderIdPreview(){
  if(!$('dtIdsPreview'))return;const c=config(),p=idDraft(),column=$('dtIdColumn');
  column.innerHTML=p.columns.length?'<label class="dt-field" for="dtIdsColumn"><span>ID column</span><select id="dtIdsColumn">'+[['auto','Automatic'],['list','All cells · ID list'],...p.columns.map(x=>[x.value,x.label])].map(([v,t])=>'<option value="'+escape(v)+'"'+(c.asset_ids_column===v?' selected':'')+'>'+escape(t)+'</option>').join('')+'</select></label>':'';
  $('dtIdsColumn')?.addEventListener('change',e=>{c.asset_ids_column=e.target.value;renderIdPreview();});
  const pending=c.asset_ids_text!==c.asset_ids_source||c.asset_ids_column!==c.asset_ids_active_column;
  $('dtIdsPreview').textContent=p.error?p.error:p.ids.length?p.ids.length+' unique IDs'+(p.duplicates?' · '+p.duplicates+(p.duplicates===1?' duplicate removed':' duplicates removed'):'')+' · '+p.ids.slice(0,5).join(', ')+(p.ids.length>5?'…':'')+(pending?' · Apply to update results.':''):c.asset_ids.length?'Blank draft: Apply or Clear to remove the current list.':'No list applied: assess all report assets.';
  $('dtApplyIds').disabled=Boolean(p.error);$('dtIdsPreview').classList.toggle('dt-id-error',Boolean(p.error));
}
function applyIdList(){
  const c=config(),p=idDraft();if(p.error){renderIdPreview();return;}
  if(p.ids.length&&!c.asset_ids.length){c.filter_before_ids=c.filter;c.sort_before_ids=c.sort;}
  c.asset_ids=p.ids;c.asset_ids_source=c.asset_ids_text;c.asset_ids_active_column=c.asset_ids_column;c.asset_ids_duplicates=p.duplicates;
  if(p.ids.length){c.filter='all';c.search='';c.sort='list';}else restoreListFilters(c);
  selected=null;renderIdPreview();renderResults();
}
function restoreListFilters(c){c.filter=c.filter_before_ids||'detriment';c.sort=c.sort_before_ids||'severity';delete c.filter_before_ids;delete c.sort_before_ids;}
function clearIdList(){const c=config();c.asset_ids_text='';c.asset_ids_source='';c.asset_ids_column='auto';c.asset_ids_active_column='auto';c.asset_ids_duplicates=0;c.asset_ids=[];c.search='';restoreListFilters(c);selected=null;$('dtAssetIds').value='';renderIdPreview();renderResults();}
function bindIdSelector(){
  $('dtAssetIds').addEventListener('input',e=>{config().asset_ids_text=e.target.value;renderIdPreview();});
  $('dtApplyIds').onclick=applyIdList;$('dtClearIds').onclick=clearIdList;renderIdPreview();
}
function sourceCard(slot,title,role){
  const c=config()[slot],item=state.files.get(c.id),columns=item?.parsed?.columns||[],m=c.mapping;
  let fields=role==='ground'?['asset_id','ground']:role==='detail'?['asset_id','duration','start','end','attribute']:kind==='spill'?['asset_id',...(config().counting_mode==='summary'?['count']:[]),'duration','start','end','attribute']:['asset_id','value',...(kind==='level'?['ground']:[]),'critical_simulation','attribute'];
  const warning=(item?.parsed?.metadata?.warnings||[]).map(w=>'<p class="dt-import-warning">'+escape(w)+'</p>').join('');
  const names={asset_id:'Asset ID',value:kind==='level'?'Maximum water-level elevation':'Flood volume',ground:'Ground level (optional in A/B)',count:'Spill count',duration:'Actual total duration',start:'Exceedance start',end:'Exceedance end',attribute:'Attribute (if exported)',critical_simulation:'Critical simulation'};
  return '<section class="dt-source"><h3>'+escape(title)+'</h3>'+warning+label('Report in Data Sources',selectInput(slot+'.id',[['','Select report…'],...reports().map(x=>[x.id,x.displayName])],c.id))+(item?'<details class="dt-mapping" open><summary>Column mapping & units</summary><div class="dt-fields">'+fields.map(f=>label(names[f],selectInput(slot+'.mapping.'+f,[['','Not mapped'],...columns.map(x=>[x,x])],m[f]))).join('')+(role==='ground'?label('Ground unit',selectInput(slot+'.unit',[['auto','From heading'],['m','m'],['mm','mm']],c.unit)):role!=='detail'&&kind!=='spill'?label('Value unit',selectInput(slot+'.unit',kind==='flooding'?[['auto','From heading'],['m³','m³'],['L','L'],['Ml','Ml']]:[['auto','From heading'],['m','m'],['mm','mm']],c.unit)):'')+((kind==='spill'&&role!=='ground')?label('Duration unit',selectInput(slot+'.duration_unit',[['auto','From heading'],['h','hours'],['min','minutes'],['s','seconds']],c.duration_unit)):'')+(kind==='level'&&role==='scenario'?label('Ground unit',selectInput(slot+'.ground_unit',[['auto','From heading'],['m','m'],['mm','mm']],c.ground_unit||'auto')):'')+(m.attribute?label('Attribute value to assess',input(slot+'.attribute_value',c.attribute_value||'')):'')+ '</div></details><details><summary>Source preview · '+item.parsed.rows+' rows</summary><div class="dt-scroll"><table><thead><tr>'+columns.map(x=>'<th>'+escape(x)+'</th>').join('')+'</tr></thead><tbody>'+(item.parsed.preview_rows||[]).map(r=>'<tr>'+columns.map(x=>'<td>'+escape(r[x])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>':'<p class="dt-muted">Upload or paste a report in Data / Time Series → Data Sources.</p>')+'</section>';
}
function readKey(key){return key.split('.').reduce((v,k)=>v?.[k],config());}
function setKey(key,value){const parts=key.split('.');let c=config();for(const p of parts.slice(0,-1))c=c[p];c[parts.at(-1)]=value;}
function invalidate(message='Inputs changed. Recalculate to refresh the evidence.'){generation++;results[kind]=null;selected=null;if($('dtStatus'))$('dtStatus').textContent=message;renderResults();}
function bindForm(){
  $('dtForm').querySelectorAll('[data-key]').forEach(el=>el.addEventListener(el.type==='checkbox'?'change':el.tagName==='SELECT'?'change':'input',()=>{
    const key=el.dataset.key,value=el.type==='checkbox'?el.checked:el.value;setKey(key,value);
    if(key.endsWith('.id')){const slot=key.split('.')[0],item=state.files.get(value),meta=item?.parsed?.metadata,mappingKind=slot==='ground'?'ground':slot.startsWith('detail')?'spill':kind;config()[slot].mapping={...(meta?.mapping_by_kind?.[mappingKind]||meta?.mapping_suggestions||{})};config()[slot].reference=item?{sha256:item.hash,name:item.displayName}:null;if(kind==='level'&&!config().datum&&meta?.datum)config().datum=meta.datum.toUpperCase();}
    invalidate();if(key.endsWith('.id')||key==='counting_mode'||key.endsWith('.mapping.attribute'))renderForm();
  }));
}
function renderForm(){
  const openSections=[...$('dtForm').querySelectorAll('details[data-dt-disclosure][open]')].map(el=>el.dataset.dtDisclosure);
  const c=config();$('dtForm').innerHTML='<div class="dt-sources">'+sourceCard('a','Scenario A · baseline','scenario')+sourceCard('b','Scenario B · proposed','scenario')+'</div><section class="dt-criteria"><h3>Assessment criteria</h3><div class="dt-fields">'+label('Common assessment scope',input('scope',c.scope,'text','placeholder="e.g. 30-year, same storms and climate allowance"'))+(kind!=='spill'?label('Increase tolerance ('+(kind==='level'?'m':'m³')+')',input('threshold',c.threshold,'number','min="0" step="any" placeholder="Enter tolerance"')):'')+(kind==='level'?label('Minimum freeboard (m) · optional',input('freeboard_required',c.freeboard_required,'number','min="0" step="any" placeholder="Leave blank to assess levels only"'))+label('Common vertical datum',input('datum',c.datum,'text','placeholder="e.g. AOD"')):'')+(kind==='spill'?label('Period start (inclusive)',input('period_start',c.period_start,'date'))+label('Period end (exclusive)',input('period_end',c.period_end,'date'))+label('Same statistics-template settings',input('template',c.template,'text','placeholder="threshold, integral, counting method, exclusions"'))+label('Counting basis',selectInput('counting_mode',[['summary','Authoritative summary Spill count'],['block-rows','Exported spill-block rows'],['physical-events','Exported physical-event rows']],c.counting_mode)):'')+'</div><label class="dt-check"><input data-key="scope_confirmed" type="checkbox"'+(c.scope_confirmed?' checked':'')+'> I confirm matching scope, periods, model basis and completed ICM runs.</label>'+(kind==='level'?'<label class="dt-check"><input data-key="elevation_confirmed" type="checkbox"'+(c.elevation_confirmed?' checked':'')+'> These are maximum water-level elevations in the declared datum.</label><details data-dt-disclosure="ground"><summary>Separate common ground-level table (optional)</summary>'+sourceCard('ground','Ground levels · shared basis','ground')+'</details>':'')+(kind==='spill'?'<p class="dt-muted">Detail rows are counted only under your explicit exported-row basis. They are never inferred as UK 12/24 spills. Actual exceedance durations are retained separately from block counts. Detail dates use ISO or day/month/year model clock; rows crossing or outside the selected period are blocked pending period-specific boundary attribution.</p><details data-dt-disclosure="spill-detail"><summary>Optional exceedance detail for evidence</summary><div class="dt-sources">'+sourceCard('detail_a','Scenario A detail','detail')+sourceCard('detail_b','Scenario B detail','detail')+'</div></details>':'<p class="dt-muted">Change = B − A. A change exactly equal to tolerance does not exceed it.'+(kind==='level'?' Freeboard = ground − maximum water level; a breach is strictly below the minimum.':' New flooding below tolerance is shown as a risk.')+'</p>')+'</section>';
  $('dtForm').querySelectorAll('details[data-dt-disclosure]').forEach(el=>{el.open=openSections.includes(el.dataset.dtDisclosure);});
  $('dtForm').insertAdjacentHTML('afterbegin',idSelectorHtml());bindForm();bindIdSelector();
}
function number(v,signed=false){return v==null?'—':(signed&&v>0?'+':'')+new Intl.NumberFormat('en-GB',{maximumFractionDigits:6}).format(v);}
const badge=r=>'<span class="dt-badge dt-'+r.status+'">'+escape(r.status)+'</span>';
function scopedRows(){return selectIdRows(results[kind]?.rows||[],config().asset_ids);}
function visibleRows(){const c=config(),r=results[kind];if(!r)return [];const rank={detriment:0,risk:1,unavailable:2,unmatched:2,improvement:3,unchanged:4};const rows=filterRows(scopedRows(),c.filter,c.search);return c.sort==='list'?rows:rows.sort((a,b)=>c.sort==='asset'?a.asset_id.localeCompare(b.asset_id):c.sort==='delta'?(b.delta??-Infinity)-(a.delta??-Infinity):(rank[a.status]-rank[b.status]||(b.delta??-Infinity)-(a.delta??-Infinity)||a.asset_id.localeCompare(b.asset_id)));}
function idSelectionEvidence(){const c=config();return {ids:c.asset_ids.slice(),column:c.asset_ids_active_column,duplicates_removed:c.asset_ids_duplicates,...idMatchSummary(results[kind]?.rows||[],c.asset_ids)};}
function exportViewSignature(){return JSON.stringify({filter:config().filter,search:config().search,sort:config().sort,selection:idSelectionEvidence(),selected});}
function renderResults(){
  if(!$('dtResults'))return;const r=results[kind],c=config();$('dtExportCsv').disabled=!r;$('dtExportHtml').disabled=!r;
  if(!r){$('dtResults').innerHTML='<div class="dt-empty"><span class="dt-empty-mark">Δ</span><h3>Compare your ICM report evidence</h3><p>Select baseline A and proposed B, verify the mapped columns and assessment criteria, then calculate.</p><button type="button" id="dtGoData">Open Data Sources</button></div>';$('dtGoData').onclick=()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',true);$('dtDrawer').hidden=true;return;}
  const rows=visibleRows(),active=c.asset_ids.length>0,selection=idMatchSummary(r.rows,c.asset_ids),s=active?summariseRows(rows):r.summary;
  if(active&&selected&&!rows.some(row=>row.asset_id===selected))selected=null;
  const viewStatus=active?(rows.length?(s.unresolved?'partial':'complete'):'unavailable'):r.status;
  $('dtStatus').textContent='Assessment complete · '+s.detriment+' detriment · '+s.unresolved+' unresolved.'+(active?' Applied list: '+selection.requested+' requested, '+rows.length+' shown.':'')+' Exports use the current table filter.';
  const selectionHtml=active?'<section class="dt-selection-status" aria-label="Applied asset selection"><strong>'+selection.requested+' requested · '+selection.found+' found · '+selection.absent.length+' absent from both reports</strong><p>Tables, charts, summary figures and exports use the applied list and current view filters. '+c.asset_ids_duplicates+(c.asset_ids_duplicates===1?' duplicate removed.':' duplicates removed.')+'</p>'+(selection.absent.length?'<details><summary>IDs absent from both reports</summary><p>'+escape(selection.absent.join(', '))+'</p></details>':'')+'</section>':'';
  $('dtResults').innerHTML='<div class="dt-comparison"><strong>'+escape(r.scenario_a.name)+' <span>→</span> '+escape(r.scenario_b.name)+'</strong><span>'+escape(r.scenario_a.scope)+' · '+s.matched+'/'+s.assets+' matched · '+escape(viewStatus)+' evidence</span></div>'+selectionHtml+'<div class="dt-metrics">'+[['Matched assets',s.matched,''],['Detriment',s.detriment,'danger'],['Maximum increase',number(s.max_increase,true)+'<small class="dt-metric-unit">'+escape(kind==='spill'?r.count_unit||'spills':kind==='level'?'m':'m³')+'</small>',''],['Risk / unresolved',s.risk+' / '+s.unresolved,'warning']].map(([t,v,color])=>'<div class="dt-metric '+color+'"><span>'+t+'</span><strong>'+v+'</strong></div>').join('')+'</div><section class="dt-chart-panel"><h3>'+(kind==='spill'?(r.count_unit==='spills'?'Spill count change':'Exported row count change'):'Change by asset')+'</h3><p class="dt-muted">'+(kind==='spill'?'Actual duration change is shown separately below.':'Positive values show an increase from baseline A. Dashed line marks the tolerance.')+' Largest 20 comparable changes by absolute magnitude shown.'+(active?' From the applied list and current view filters.':'')+'</p><div id="dtChart"></div>'+((kind==='level'||kind==='spill')?'<h3>Scenario A / B · '+(kind==='level'?'maximum level':'spill count')+'</h3><div id="dtPairedChart"></div>':'')+(kind==='spill'?'<h3>Actual duration change (hours)</h3><div id="dtDurationChart"></div>':'')+'</section><section class="dt-table-panel"><div class="dt-table-tools">'+label('Show',selectInput('filter',[['detriment','Detriment only'],['all',active?'All selected assets':'All assets'],['risk','Risk / within tolerance'],...(kind==='flooding'?[['new_flooding','New flooding']]:kind==='level'?[['new_freeboard_breach','New freeboard breach'],['existing_breach_worsening','Existing breach worsening']]:[['spill_count_detriment','Increased spill count'],['duration_increase','Increased duration']]),['improvement','Improved'],['unresolved','Unresolved']],c.filter))+label('Find asset',input('search',c.search,'search','placeholder="Manhole or CSO ID"'))+label('Sort',selectInput('sort',[...(active?[['list','Pasted list order']]:[]),['severity','Severity'],['delta','Largest increase'],['asset','Asset ID']],c.sort))+'<span>'+rows.length+' shown</span></div><div class="dt-scroll"><table id="dtTable"><thead><tr><th>Asset</th><th>Status</th><th>A ('+escape(r.rows[0]?.unit||'')+')</th><th>B ('+escape(r.rows[0]?.unit||'')+')</th><th>Δ B − A</th>'+(kind==='level'?'<th>Freeboard A / B (m)</th>':kind==='spill'?'<th>Duration A / B (h)</th><th>Δ duration (h)</th>':'')+'<th>Assessment flags</th><th>Evidence</th></tr></thead><tbody>'+rows.map(row=>'<tr><td><strong>'+escape(row.asset_id)+'</strong></td><td>'+badge(row)+'</td><td>'+number(row.a)+'</td><td>'+number(row.b)+'</td><td class="dt-delta">'+number(row.delta,true)+' '+escape(row.unit)+'</td>'+(kind==='level'?'<td>'+number(row.freeboard_a)+' / '+number(row.freeboard_b)+'</td>':kind==='spill'?'<td>'+number(row.duration_a_hours)+' / '+number(row.duration_b_hours)+'</td><td>'+number(row.duration_delta_hours,true)+'</td>':'')+'<td>'+escape(row.flags.map(x=>x.replaceAll('_',' ')).join(' · '))+'</td><td><button type="button" data-asset="'+escape(row.asset_id)+'">Inspect</button></td></tr>').join('')+'</tbody></table>'+(rows.length?'':'<p class="dt-muted">No assets match this filter.</p>')+'</div></section>';
  $('dtResults').querySelectorAll('[data-key]').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{const key=el.dataset.key,v=el.value;setKey(key,v);if(key==='search'){const focus=el.selectionStart;renderResults();const next=$('dtResults').querySelector('[data-key="search"]');next.focus();next.setSelectionRange(focus,focus);}else renderResults();}));
  $('dtResults').querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>{selected=b.dataset.asset;renderDrawer();});
  drawCharts(active?{...r,rows}:r);renderDrawer();
}
function drawCharts(r){
  const chartRows=r.rows.filter(x=>x.delta!==null).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||b.delta-a.delta).slice(0,20).reverse();
  const colors={detriment:'#bc3d4a',risk:'#b9771c',improvement:'#168277',unchanged:'#82939d',unavailable:'#82939d',unmatched:'#82939d'};
  function plot(id,field,unit){
    if(!window.Plotly||!$(id))return;
    const data=r.rows.filter(x=>x[field]!=null).sort((a,b)=>Math.abs(b[field])-Math.abs(a[field])||b[field]-a[field]).slice(0,20).reverse();
    Plotly.react($(id),[{type:'bar',orientation:'h',y:data.map(x=>x.asset_id),x:data.map(x=>x[field]),marker:{color:data.map(x=>colors[x.status])},hovertemplate:'%{y}: %{x} '+unit+'<extra></extra>'}],{height:Math.max(240,data.length*24+80),margin:{l:85,r:25,t:10,b:45},paper_bgcolor:'#fff',plot_bgcolor:'#fff',font:{family:'Inter, system-ui',color:'#334a59',size:12},xaxis:{title:{text:'B − A ('+unit+')'},zeroline:true,zerolinewidth:2,zerolinecolor:'#526975',gridcolor:'#e9eff2'},yaxis:{type:'category',automargin:true},showlegend:false,shapes:kind!=='spill'?[{type:'line',xref:'x',yref:'paper',x0:Number(r.criteria.threshold),x1:Number(r.criteria.threshold),y0:0,y1:1,line:{color:'#b9771c',dash:'dash',width:1.5}}]:[]},{responsive:true,displaylogo:false,modeBarButtonsToRemove:['select2d','lasso2d']});
  }
  plot('dtChart','delta',kind==='spill'?r.count_unit||'spills':kind==='level'?'m':'m³');if(kind==='spill')plot('dtDurationChart','duration_delta_hours','h');
  if((kind==='level'||kind==='spill')&&window.Plotly){const values=chartRows.flatMap(x=>[x.a,x.b]).filter(x=>x!=null);Plotly.react($('dtPairedChart'),pairedData(chartRows),{barmode:'group',height:300,margin:{l:65,r:20,t:15,b:70},paper_bgcolor:'#fff',plot_bgcolor:'#fff',font:{family:'Inter, system-ui',size:11},xaxis:{type:'category'},yaxis:{title:{text:kind==='level'?'Maximum level (m '+escape(r.scenario_a.datum)+')':(r.count_unit==='spills'?'Spill count':r.count_unit)},...(kind==='level'&&values.length?{range:[Math.min(...values)-.1,Math.max(...values)+.1]}:{})},legend:{orientation:'h'}},{responsive:true,displaylogo:false});}
}
function rawEvidence(raw){return raw?'<dl class="dt-evidence">'+Object.entries(raw).map(([k,v])=>'<dt>'+escape(k)+'</dt><dd>'+escape(v)+'</dd>').join('')+'</dl>':'<p>Asset absent from this report.</p>';}
function renderDrawer(){
  const row=results[kind]?.rows.find(x=>x.asset_id===selected),drawer=$('dtDrawer');drawer.hidden=!row;if(!row){resizeAssessmentCharts();return;}
  drawer.innerHTML='<button class="dt-close" id="dtClose" type="button" aria-label="Close asset evidence">×</button><small>ASSET EVIDENCE</small><h2>'+escape(row.asset_id)+'</h2>'+badge(row)+'<p>'+escape(row.flags.map(x=>x.replaceAll('_',' ')).join(' · '))+'</p><p><strong>Δ '+number(row.delta,true)+' '+escape(row.unit)+'</strong></p>'+(kind==='level'?'<p>Ground A / B: '+number(row.ground_a)+' / '+number(row.ground_b)+' m<br>Freeboard A / B: '+number(row.freeboard_a)+' / '+number(row.freeboard_b)+' m</p>':'')+(kind==='level'?'<h3>A / B elevation section</h3><div id="dtSectionChart"></div>':kind==='spill'?'<h3>Exceedance timeline · model clock</h3><div id="dtTimelineChart"></div><p class="dt-muted">Bars show exported start/end spans. Actual exceedance duration is retained independently; a spill-block span can include non-spilling intervals.</p>':'')+'<h3>Scenario A · raw report</h3>'+rawEvidence(row.evidence_a)+'<h3>Scenario B · raw report</h3>'+rawEvidence(row.evidence_b)+(kind==='spill'?['a','b'].map(s=>'<h3>Scenario '+s.toUpperCase()+' · exceedance details</h3>'+((row['details_'+s]||[]).length?'<div class="dt-scroll"><table><thead><tr><th>Start</th><th>End</th><th>Actual duration (h)</th></tr></thead><tbody>'+row['details_'+s].map(e=>'<tr><td>'+escape(e.start)+'</td><td>'+escape(e.end)+'</td><td>'+number(e.duration_hours)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="dt-muted">No detail report linked.</p>')).join(''):'')+'<p class="dt-muted">Display values use up to six decimal places. CSV retains calculated numeric precision and raw source evidence.</p>';
  drawEvidenceCharts(row);resizeAssessmentCharts();
  $('dtClose').onclick=()=>{selected=null;drawer.hidden=true;resizeAssessmentCharts();};
}
function resizeAssessmentCharts(){if(!window.Plotly)return;requestAnimationFrame(()=>{for(const id of ['dtChart','dtPairedChart','dtDurationChart']){const el=$(id);if(el?.data)Promise.resolve(Plotly.Plots.resize(el)).catch(()=>{});}});}
function drawEvidenceCharts(row){
  if(!window.Plotly)return;const r=results[kind],layout={height:330,margin:{l:65,r:20,t:15,b:110},font:{family:'Inter, system-ui',size:11},legend:{orientation:'v',x:0,y:-.3,font:{size:10}},paper_bgcolor:'#fff',plot_bgcolor:'#fff'};
  if(kind==='level'){
    const d=sectionData(row,r.criteria.freeboard_required),values=Object.values(d).filter(x=>x!=null),traces=[['Ground',[d.ground_a,d.ground_b],'#8d7756','solid'],['Water level',[d.water_a,d.water_b],'#167983','solid'],['Minimum freeboard envelope',[d.minimum_a,d.minimum_b],'#bc3d4a','dash']].filter(([_n,ys])=>ys.some(x=>x!=null)).map(([name,y,color,dash])=>({name,x:['A','B'],y,type:'scatter',mode:'lines+markers',line:{color,dash},connectgaps:false}));
    Plotly.react($('dtSectionChart'),traces,{...layout,xaxis:{type:'category'},yaxis:{title:{text:'Elevation (m '+r.scenario_a.datum+')'},...(values.length?{range:[Math.min(...values)-.1,Math.max(...values)+.1]}:{})}},{responsive:true,displaylogo:false});
  }
  if(kind==='spill'){
    const clock=value=>Date.parse(value.replace(' ','T')+'Z'),traces=['a','b'].map(side=>{const events=timelineData(row['details_'+side]||[]);return {name:'Scenario '+side.toUpperCase(),type:'bar',orientation:'h',y:events.map(()=>side==='a'?'A · baseline':'B · proposed'),base:events.map(e=>clock(e.start)),x:events.map(e=>clock(e.end)-clock(e.start)),customdata:events.map(e=>[e.start,e.end,e.duration_hours]),marker:{color:side==='a'?'#788f9c':'#167983'},hovertemplate:'%{customdata[0]} → %{customdata[1]}<br>Actual duration: %{customdata[2]} h<extra>%{fullData.name}</extra>'};});
    Plotly.react($('dtTimelineChart'),traces,{...layout,height:270,margin:{l:90,r:12,t:15,b:75},showlegend:false,barmode:'overlay',xaxis:{type:'date',nticks:4,tickformat:'%b\n%Y',tickangle:0,automargin:true,title:{text:'Exported event span',standoff:15}},yaxis:{type:'category',automargin:true}},{responsive:true,displaylogo:false});
  }
}
function sourceConfig(slot){const c=config()[slot],item=state.files.get(c.id);if(!item){if(slot==='a'||slot==='b')throw Error('Select both reports from Data Sources.');return null;}return {...c,path:item.virtualPath,name:item.displayName,sha256:item.hash,report_kind:item.parsed.metadata.report_kind,datum:config().datum,scope:config().scope.trim(),period_start:config().period_start,period_end:config().period_end,template:config().template.trim()};}
async function calculate(){
  if(busy)return;const c=config(),runKind=kind,runGeneration=++generation;busy=true;$('runDetrimentBtn').disabled=true;$('dtStatus').textContent='Comparing authoritative report values…';
  try{
    if(kind==='level'&&!c.elevation_confirmed)throw Error('Confirm water-level elevations and the common vertical datum.');
    const a=sourceConfig('a'),b=sourceConfig('b');if(a.path===b.path)throw Error('Select separate baseline and proposed reports.');
    const criteria={scope_confirmed:c.scope_confirmed,threshold:kind==='spill'?0:c.threshold,freeboard_required:c.freeboard_required===''?null:c.freeboard_required,counting_mode:c.counting_mode};
    const result=await engine.call('detriment_result',{kind,scenario_a_json:JSON.stringify(a),scenario_b_json:JSON.stringify(b),criteria_json:JSON.stringify(criteria),ground_json:JSON.stringify(kind==='level'?sourceConfig('ground'):null),detail_a_json:JSON.stringify(kind==='spill'?sourceConfig('detail_a'):null),detail_b_json:JSON.stringify(kind==='spill'?sourceConfig('detail_b'):null)},'advanced_bridge');
    if(runGeneration!==generation||runKind!==kind)return;
    results[kind]=result;selected=null;renderIdPreview();renderResults();
  }catch(err){if(runGeneration===generation&&runKind===kind){results[kind]=null;renderResults();$('dtStatus').textContent=String(err?.message||err);}}finally{busy=false;$('runDetrimentBtn').disabled=false;}
}
async function exportHtml(){
  const r=results[kind];if(!r)return;
  const rows=visibleRows(),exportKind=kind,exportGeneration=generation,exportView=exportViewSignature(),selection=idSelectionEvidence();
  const button=$('dtExportHtml');button.disabled=true;
  try{
    const figures=[];
    for(const [id,title] of [['dtChart','Change by asset'],['dtPairedChart','Scenario A / B'],['dtDurationChart','Actual duration change'],['dtSectionChart','Selected asset · elevation section'],['dtTimelineChart','Selected asset · exported event spans']]){
      if(['dtSectionChart','dtTimelineChart'].includes(id)&&$('dtDrawer').hidden)continue;
      const chart=$(id);if(!chart?.data?.length)continue;
      const src=await Plotly.toImage(chart,{format:'png',width:1100,height:Number(chart.layout?.height)||400,scale:1.5});
      figures.push('<figure><h3>'+escape(title)+'</h3><img alt="'+escape(title)+'" src="'+src+'"></figure>');
    }
    if(exportGeneration!==generation||exportKind!==kind||results[kind]!==r||exportView!==exportViewSignature())throw Error('Assessment changed during export. Recalculate and export the current evidence.');
    const unit=r.rows[0]?.unit||'',level=exportKind==='level',spill=exportKind==='spill',exportStatus=selection.ids.length?(rows.length?(summariseRows(rows).unresolved?'partial':'complete'):'unavailable'):r.status;
    const evidence={criteria:r.criteria,scenario_a:r.scenario_a,scenario_b:r.scenario_b,ground_source:r.ground_source,detail_source_a:r.detail_source_a,detail_source_b:r.detail_source_b,date_convention:r.date_convention,boundary_policy:r.boundary_policy,counting_mode:r.counting_mode,asset_selection:selection};
    const body='<style>.dt-report img{width:100%;height:auto}.dt-report figure{margin:20px 0;break-inside:avoid}.dt-report pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px}.dt-report table{font-variant-numeric:tabular-nums}.dt-report .dt-detriment{color:#a02d3e}.dt-report .dt-risk{color:#8c5e17}.dt-report .dt-improvement{color:#0c7266}</style><article class="dt-report">'+
      '<h2>'+escape(r.scenario_a.name)+' → '+escape(r.scenario_b.name)+'</h2><p>'+escape(r.method)+'</p><p>Scope: '+escape(r.scenario_a.scope)+'. Evidence status: '+escape(exportStatus)+'.</p>'+
      '<p>Filtered table: '+rows.length+'/'+r.rows.length+' assets · '+escape(config().filter)+' · search '+escape(config().search||'(none)')+'. Charts show the largest 20 comparable changes by absolute magnitude '+(selection.ids.length?'within the applied list and current view filters':'across all report assets')+'. Optional selected-asset figures show '+escape(selected||'(none)')+'.</p>'+
      (spill?'<p>Counting basis: '+escape(r.counting_mode)+' ('+escape(r.count_unit)+'). Actual duration is independent of the exported start/end span. Detail rows are not automatically UK 12/24 counts.</p>':'')+
      (selection.ids.length?'<h2>Applied manhole / link IDs</h2><p>'+selection.requested+' requested · '+selection.found+' found · '+selection.absent.length+' absent from both reports · '+selection.duplicates_removed+(selection.duplicates_removed===1?' duplicate removed.</p>':' duplicates removed.</p>')+'<p>Requested IDs: '+escape(selection.ids.join(', '))+'</p>'+(selection.absent.length?'<p>Absent IDs: '+escape(selection.absent.join(', '))+'</p>':''):'')+figures.join('')+'<h2>Assessment results</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>Asset</th><th>Status</th><th>A ('+escape(unit)+')</th><th>B ('+escape(unit)+')</th><th>Δ B − A</th>'+
      (level?'<th>Ground A / B (m)</th><th>Freeboard A / B (m)</th>':spill?'<th>Actual duration A / B (h)</th><th>Δ duration (h)</th>':'')+'<th>Flags</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td>'+escape(x.asset_id)+'</td><td class="dt-'+escape(x.status)+'">'+escape(x.status)+'</td><td>'+number(x.a)+'</td><td>'+number(x.b)+'</td><td>'+number(x.delta,true)+' '+escape(x.unit)+'</td>'+
        (level?'<td>'+number(x.ground_a)+' / '+number(x.ground_b)+'</td><td>'+number(x.freeboard_a)+' / '+number(x.freeboard_b)+'</td>':spill?'<td>'+number(x.duration_a_hours)+' / '+number(x.duration_b_hours)+'</td><td>'+number(x.duration_delta_hours,true)+'</td>':'')+
        '<td>'+escape(x.flags.join('; '))+'</td></tr>').join('')+'</tbody></table></div><h2>Assessment criteria and source provenance</h2><pre>'+escape(JSON.stringify(evidence,null,2))+'</pre><h2>Asset evidence · full calculation precision</h2><pre>'+escape(JSON.stringify(rows,null,2))+'</pre></article>';
    downloadBlob('icm-'+exportKind+'-detriment.html',reportShell('Hydra Bench · '+titles[exportKind],'Baseline A compared with proposed B · '+r.scenario_a.scope,body,true),'text/html');
  }catch(error){$('dtStatus').textContent='Report export failed: '+String(error?.message||error);}
  finally{if(results[kind])button.disabled=false;}
}
function refresh(){const list=reports(),signature=list.map(x=>x.id+':'+x.hash).sort().join('|');if(signature===poolSignature)return;poolSignature=signature;generation++;for(const k of Object.keys(configs)){results[k]=null;for(const slot of ['a','b','ground','detail_a','detail_b']){const c=configs[k][slot];if(!state.files.has(c.id)){const match=relinkSource(c.reference,list);c.id=match?.id||'';}}}if($('dtForm')){renderForm();renderResults();$('dtStatus').textContent='Report sources changed. Verify selection and recalculate.';}}
function persist(){return JSON.parse(JSON.stringify(configs,(_key,value)=>value));}
function installPersistence(){
  const originalSave=workspaceObject;workspaceObject=function(...args){const w=originalSave(...args);w.detriment=persist();for(const c of Object.values(w.detriment))for(const slot of ['a','b','ground','detail_a','detail_b']){delete c[slot].id;}return w;};
  const originalRestore=applyWorkspace;applyWorkspace=async function(w){await originalRestore(w);generation++;for(const k of ['flooding','level','spill']){configs[k]=Object.assign(defaults(),w.detriment?.[k]||{});results[k]=null;for(const slot of ['a','b','ground','detail_a','detail_b']){const c=configs[k][slot];const match=relinkSource(c.reference,reports());c.id=match?.id||'';c.mapping=c.mapping||{};}}if($('dtForm')){renderForm();renderResults();$('dtStatus').textContent='Configuration restored. Recalculate to create current evidence.';}};
}
function mount(){
  const panel=document.createElement('section');panel.id='tab-detriment';panel.className='tab-panel';panel.hidden=true;
  panel.innerHTML='<div class="panel dt-workspace"><div class="dt-top"><div><small>SCENARIO COMPARISON</small><h2 id="dtTitle">Flooding detriment</h2></div><div class="dt-actions"><button id="dtExportCsv" type="button" disabled>Export CSV</button><button id="dtExportHtml" type="button" disabled>Export assessment</button><button id="runDetrimentBtn" type="button" class="primary">Calculate detriment</button></div></div><p id="dtStatus" class="dt-status" role="status">Upload ICM reports in Data Sources to begin.</p><div class="dt-layout"><aside id="dtForm" aria-label="Comparison setup"></aside><div id="dtResults"></div><aside id="dtDrawer" class="dt-drawer" hidden aria-label="Asset evidence"></aside></div></div>';
  document.querySelector('main.shell').appendChild(panel);
  const upload=document.createElement('details');upload.id='dtReportUpload';upload.className='dt-upload';upload.innerHTML='<summary>ICM assessment reports · upload or paste</summary><p>Worst-case flooding/level reports, ground levels, or exceedance summary/detail. Reports share the source pool and remain separate from time-series mappings.</p><div class="dt-upload-controls">'+label('Report type','<select id="dtReportType"><option value="auto">Detect report type</option><option value="flooding">Flooding worst case</option><option value="level">Level worst case</option><option value="ground">Ground levels</option><option value="spill_summary">Spill / exceedance summary</option><option value="spill_detail">Exceedance detail</option><option value="generic">Other report (map columns)</option></select>')+'<button id="dtUploadBtn" type="button">Add report files</button><input id="dtFileInput" type="file" multiple accept=".csv,.tsv,.txt" hidden></div><div class="dt-paste">'+label('Pasted report name','<input id="dtPasteName" placeholder="e.g. Baseline flooding">')+label('Paste copied grid with headings','<textarea id="dtPasteGrid" rows="4" placeholder="Copy the ICM or spreadsheet report including its header row"></textarea>')+'<button id="dtPasteBtn" type="button">Add pasted report</button><span id="dtUploadStatus" role="status"></span></div>';
  document.querySelector('.source-panel').appendChild(upload);
  async function addFiles(files){try{for(const f of files)forced.set(f,$('dtReportType').value);$('dtUploadStatus').textContent='Importing reports…';await importGuard(()=>ingestFiles(files));$('dtUploadStatus').textContent='Review source status and mapping previews before assessment.';}catch(err){$('dtUploadStatus').textContent=String(err?.message||err);}}
  $('dtUploadBtn').onclick=()=>$('dtFileInput').click();$('dtFileInput').onchange=async e=>{await addFiles([...e.target.files]);e.target.value='';};
  $('dtPasteBtn').onclick=async()=>{const name=$('dtPasteName').value.trim(),text=$('dtPasteGrid').value;if(!name||!text.trim()){$('dtUploadStatus').textContent='Enter a report name and paste a grid with headings.';return;}await addFiles([new File([text],name.replace(/\.(csv|tsv|txt)$/i,'')+'.csv',{type:'text/csv'})]);};
  $('runDetrimentBtn').onclick=calculate;$('dtExportCsv').onclick=()=>{if(results[kind])downloadBlob('icm-'+kind+'-detriment.csv',csv({...results[kind],asset_selection:idSelectionEvidence()},visibleRows()),'text/csv');};$('dtExportHtml').onclick=exportHtml;
  renderForm();renderResults();installPersistence();refresh();
}
window.ICMDetriment={escape,csvCell,csv,sectionData,timelineData,pairedData,relinkSource,reportOnlyWorkspace,filterRows,parseIdList,selectIdRows,idMatchSummary,summariseRows,idSelectionEvidence,visibleRows,isReport,detectReport,reportKind,refresh,result:()=>results[kind],config:()=>config(),routes:{label:'Detriment Assessment',icon:'verify',pages:Object.fromEntries(Object.entries(titles).map(([k,t])=>[k,{label:t,title:t,description:'Compare baseline A with proposed B using ICM report evidence, explicit criteria and auditable asset-level results.',tab:'detriment',root:()=>$('tab-detriment')}]))}};
window.addEventListener('icm:source-pool-changed',refresh);
window.addEventListener('icm:route-changed',e=>{if(e.detail.workspace==='detriment'){if(kind!==e.detail.page){kind=e.detail.page;generation++;selected=null;}renderForm();renderResults();$('dtTitle').textContent=titles[kind];}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
