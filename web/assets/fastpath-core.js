(function(root){
  'use strict';

  const INVALID_SENTINELS=new Set([9999,-9999,99999,-99999]);
  const TIME_NAMES=new Set(['time','date','datetime','timestamp','p_datetime']);
  const NUMBER_RE=/[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;

  const normalise=text=>String(text??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const pad=n=>String(n).padStart(2,'0');
  function modelClockFromEpoch(epoch){
    const d=new Date(epoch);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  function epochFromParts(y,m,d,h=0,mi=0,s=0){
    const epoch=Date.UTC(Number(y),Number(m)-1,Number(d),Number(h),Number(mi),Number(s));
    const check=new Date(epoch);
    if(check.getUTCFullYear()!==Number(y)||check.getUTCMonth()+1!==Number(m)||check.getUTCDate()!==Number(d)||
       check.getUTCHours()!==Number(h)||check.getUTCMinutes()!==Number(mi)||check.getUTCSeconds()!==Number(s))return null;
    return epoch;
  }
  function decodeText(bytes){
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||0);
    if(data.length>=2&&data[0]===0xff&&data[1]===0xfe)return new TextDecoder('utf-16le').decode(data);
    if(data.length>=2&&data[0]===0xfe&&data[1]===0xff)return new TextDecoder('utf-16be').decode(data);
    if(data.length>=3&&data[0]===0xef&&data[1]===0xbb&&data[2]===0xbf)return new TextDecoder('utf-8').decode(data);
    const sample=data.subarray(0,Math.min(4096,data.length));
    let evenNull=0,oddNull=0;
    for(let i=0;i<sample.length;i+=1)if(sample[i]===0)(i%2===0?evenNull++:oddNull++);
    if(sample.length&&evenNull+oddNull>=Math.max(2,Math.floor(sample.length/8))){
      return new TextDecoder(evenNull>oddNull?'utf-16be':'utf-16le').decode(data);
    }
    return new TextDecoder('utf-8',{fatal:false}).decode(data);
  }
  function parseTimestamp(value){
    const raw=String(value??'').trim();
    let m=raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/);
    if(m)return epochFromParts(m[1],m[2],m[3],m[4]||0,m[5]||0,m[6]||0);
    m=raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/);
    if(m)return epochFromParts(m[3],m[2],m[1],m[4]||0,m[5]||0,m[6]||0);
    return null;
  }
  function dt10(token){
    const raw=String(token??'').trim();
    if(!/^\d{10}$/.test(raw))return null;
    const yy=Number(raw.slice(0,2)),year=yy<=79?2000+yy:1900+yy;
    return epochFromParts(year,raw.slice(2,4),raw.slice(4,6),raw.slice(6,8),raw.slice(8,10),0);
  }
  function inferQuantity(text){
    const n=normalise(text);
    if(n.includes('rain'))return 'rainfall';
    // Resolve level/stage before the velocity shorthand. "level" itself contains
    // the substring "vel", so broad substring matching would misclassify a
    // hydraulic level column as velocity and break FastPath/authoritative parity.
    if(['level','stage','maod','mald','water_level'].some(x=>n.includes(x)))return 'level';
    if(n.includes('velocity')||n==='vel'||/(^|_)vel($|_)/.test(n))return 'velocity';
    if((n.includes('flow_m3_s')||n.includes('flow')||n.includes('discharge'))&&!n.includes('overflow'))return 'flow';
    if(n.includes('depth'))return 'depth';
    return null;
  }
  function unitKey(unit){
    if(unit==null)return '';
    return String(unit).trim().toLowerCase().replace(/³/g,'3').replace(/²/g,'2')
      .replace(/\bper\b/g,'/').replace(/·/g,'').replace(/\s+/g,'')
      .replace(/seconds?/g,'s').replace(/secs?/g,'s')
      .replace(/hours?/g,'h').replace(/hrs?/g,'h')
      .replace(/days?/g,'d')
      .replace(/litres?/g,'l').replace(/liters?/g,'l')
      .replace(/metres?/g,'m').replace(/meters?/g,'m');
  }
  function canonicalUnit(quantity,unit){
    const u=unitKey(unit);
    if(quantity==='depth'||quantity==='level'){
      if(['m','m_ad','mad','maod'].includes(u))return ['m',1];
      if(['mm','millimetre','millimetres','millimeter','millimeters'].includes(u))return ['m',.001];
    }
    if(quantity==='flow'){
      if(['m3/s','m3s','cumec','cumecs'].includes(u))return ['m³/s',1];
      if(['l/s','ls','lps'].includes(u))return ['m³/s',.001];
      if(['ml/d','mld','megalitre/d','megalitres/d','megaliter/d','megaliters/d'].includes(u))return ['m³/s',1000/86400];
      if(['m3/d','m3d'].includes(u))return ['m³/s',1/86400];
    }
    if(quantity==='velocity'&&['m/s','ms','mps'].includes(u))return ['m/s',1];
    if(quantity==='rainfall'){
      if(['mm/h','mmh'].includes(u))return ['mm/h',1];
      if(u==='mm')return ['mm',1];
    }
    return [null,null];
  }
  function detectUnit(text,quantity){
    const raw=String(text??'').trim(),candidates=[];
    const bracketed=[...raw.matchAll(/[\(\[]\s*([^\)\]]+?)\s*[\)\]]/g)].map(x=>x[1]).reverse();
    candidates.push(...bracketed);
    const patterns=[
      [/\bml\s*\/\s*d\b/i,'Ml/d'],[/\bm\s*3\s*\/\s*s\b/i,'m3/s'],[/\bl\s*\/\s*s\b/i,'L/s'],
      [/\bm\s*3\s*\/\s*d\b/i,'m3/d'],[/\bmm\s*\/\s*(?:h|hr|hour)\b/i,'mm/h'],[/\bm\s*\/\s*s\b/i,'m/s']
    ];
    for(const [re,label] of patterns)if(re.test(raw))candidates.push(label);
    const n=normalise(raw.toLowerCase().replace(/³/g,'3'));
    for(const [suffix,label] of [['ml_d','Ml/d'],['mld','Ml/d'],['m3_s','m3/s'],['m_3_s','m3/s'],['l_s','L/s'],['lps','L/s'],['m3_d','m3/d'],['mm_h','mm/h'],['mm_hr','mm/h'],['m_s','m/s'],['mps','m/s']]){
      if(n.endsWith(suffix))candidates.push(label);
    }
    if(quantity==='depth'||quantity==='level'){
      if(/(?:^|[\(\[\s_])mm(?:$|[\)\]\s_])/i.test(raw))candidates.push('mm');
      else if(/(?:^|[\(\[\s_])m(?:$|[\)\]\s_])/i.test(raw))candidates.push('m');
    }
    if(quantity==='rainfall'&&/(?:^|[\(\[\s_])mm(?:$|[\)\]\s_])/i.test(raw))candidates.push('mm');
    for(const candidate of candidates){
      if(canonicalUnit(quantity,candidate)[0]!=null)return String(candidate).trim();
    }
    return null;
  }
  function numeric(value){
    const raw=String(value??'').trim();
    if(!raw)return {value:null,missing:true,nonNumeric:false,sentinel:false};
    const n=Number(raw);
    if(!Number.isFinite(n))return {value:null,missing:true,nonNumeric:true,sentinel:false};
    if(INVALID_SENTINELS.has(n))return {value:null,missing:true,nonNumeric:false,sentinel:true};
    return {value:n,missing:false,nonNumeric:false,sentinel:false};
  }
  function stats(values){
    let count=0,missing=0,sum=0,min=Infinity,max=-Infinity;
    for(const value of values){
      if(value==null||!Number.isFinite(Number(value))){missing+=1;continue;}
      const n=Number(value);count+=1;sum+=n;if(n<min)min=n;if(n>max)max=n;
    }
    return {valid_count:count,missing_count:missing,minimum:count?min:null,mean:count?sum/count:null,maximum:count?max:null};
  }
  function displayIndices(values,limit=15000){
    const n=values.length,max=Math.max(2,Number(limit)||15000);
    if(n<=max)return Array.from({length:n},(_,i)=>i);
    if(max<8){
      const out=[];for(let i=0;i<max;i++)out.push(Math.round(i*(n-1)/(max-1)));return [...new Set(out)];
    }
    const buckets=Math.max(1,Math.floor(max/4)),selected=new Set([0,n-1]);
    for(let b=0;b<buckets;b++){
      const left=Math.floor(b*n/buckets),right=Math.floor((b+1)*n/buckets);
      if(right<=left)continue;
      selected.add(left);selected.add(right-1);
      let minIndex=-1,maxIndex=-1,min=Infinity,maxValue=-Infinity,firstMissing=-1,lastMissing=-1;
      for(let i=left;i<right;i++){
        const v=values[i];
        if(v==null||!Number.isFinite(Number(v))){if(firstMissing<0)firstMissing=i;lastMissing=i;continue;}
        const num=Number(v);if(num<min){min=num;minIndex=i;}if(num>maxValue){maxValue=num;maxIndex=i;}
      }
      if(minIndex>=0)selected.add(minIndex);if(maxIndex>=0)selected.add(maxIndex);
      if(firstMissing>=0){selected.add(firstMissing);selected.add(lastMissing);}
    }
    let out=[...selected].sort((a,b)=>a-b);
    if(out.length>max){
      const reduced=[];for(let i=0;i<max;i++)reduced.push(out[Math.round(i*(out.length-1)/(max-1))]);
      out=[...new Set(reduced)].sort((a,b)=>a-b);
    }
    return out;
  }
  function seriesPreview(column,quantity,originalUnit,canonical,values,timestamps,maxPoints){
    const s=stats(values),idx=displayIndices(values,maxPoints);
    return {
      column,quantity,original_unit:originalUnit||null,canonical_unit:canonical||null,
      unit_status:canonical?'resolved':'unresolved',display_only:true,source_count:values.length,display_count:idx.length,
      timestamps:idx.map(i=>timestamps[i]),values:idx.map(i=>values[i]),statistics:s
    };
  }
  function headerValues(lines,marker){
    const out=[],wanted=String(marker).toUpperCase();
    for(let i=0;i<lines.length;i++){
      if(!lines[i].trim().toUpperCase().startsWith(wanted))continue;
      let text=lines[i].includes(':')?lines[i].split(':').slice(1).join(':').trim():'';
      if(text.includes(','))text=text.slice(text.indexOf(',')+1);
      out.push(...text.split(',').map(x=>x.trim()).filter(Boolean));
      for(let j=i+1;j<lines.length&&lines[j].trimStart().startsWith('*+');j++){
        const tail=lines[j].trimStart().slice(2).trim().replace(/^,/,'');
        out.push(...tail.split(',').map(x=>x.trim()).filter(Boolean));
      }
      break;
    }
    return out;
  }
  function parseFdv(name,text,options){
    const lines=String(text??'').replace(/^\uFEFF/,'').split(/\r?\n/);
    let cstart=-1,cend=-1,monitor=String(name||'').replace(/\.fdv(?:\.txt)?$/i,'');
    for(let i=0;i<lines.length;i++){
      const s=lines[i].trim();
      if(s.startsWith('**IDENTIFIER:')){
        const tail=lines[i].split(':').slice(1).join(':').trim();
        if(tail.includes(','))monitor=tail.slice(tail.indexOf(',')+1).trim()||monitor;
      }else if(s==='*CSTART')cstart=i;
      else if(s==='*CEND'){cend=i;break;}
    }
    const fields=headerValues(lines,'**FIELD:').map(x=>x.toUpperCase());
    const units=headerValues(lines,'**UNITS:');
    if(cstart<0||cend<0||!fields.length)throw new Error('FDV header is incomplete: FIELD/CSTART/CEND required');
    while(units.length<fields.length)units.push('');
    const names=headerValues(lines,'**CONSTANTS:').map(x=>x.toUpperCase()),tokens=[];
    for(const line of lines.slice(cstart+1,cend))tokens.push(...line.trim().split(/\s+/).filter(Boolean));
    const constants={};for(let i=0;i<Math.min(names.length,tokens.length);i++)constants[names[i]]=tokens[i];
    const dates=tokens.filter(x=>/^\d{10}$/.test(x));
    const start=dt10(constants.START??dates[0]??'');
    let intervalRaw=constants.INTERVAL;
    if(intervalRaw==null&&dates.length>1){
      const pos=tokens.lastIndexOf(dates[dates.length-1]);if(pos>=0&&pos+1<tokens.length)intervalRaw=tokens[pos+1];
    }
    const interval=Number(intervalRaw);
    if(start==null)throw new Error('FDV start timestamp not found');
    if(!Number.isFinite(interval)||interval<=0)throw new Error('FDV interval is ambiguous or invalid; explicit valid interval required');
    const dataTokens=[];
    for(const line of lines.slice(cend+1)){
      if(line.trimStart().startsWith('*'))continue;
      const matches=line.match(NUMBER_RE);if(matches)dataTokens.push(...matches);
    }
    if(!dataTokens.length)throw new Error('FDV contains no data records');
    if(dataTokens.length%fields.length)throw new Error(`FDV field-count mismatch/truncated record: ${dataTokens.length} values for ${fields.length} fields`);
    const rows=dataTokens.length/fields.length,timestamps=Array.from({length:rows},(_,i)=>modelClockFromEpoch(start+i*interval*60000));
    const columns=[],series=[],channels={};let sentinels=0;
    for(let j=0;j<fields.length;j++){
      const field=fields[j],quantity=({FLOW:'flow',DEPTH:'depth',VELOCITY:'velocity',LEVEL:'level'})[field]||field.toLowerCase();
      const [canonical,factor]=canonicalUnit(quantity,units[j]);
      if(canonical==null||factor==null)throw new Error(`Unknown/unsupported FDV unit for ${field}: ${JSON.stringify(units[j])}`);
      const values=new Array(rows);let missing=0;
      for(let i=0;i<rows;i++){
        const raw=Number(dataTokens[i*fields.length+j]);
        if(INVALID_SENTINELS.has(raw)){values[i]=null;sentinels+=1;missing+=1;}else values[i]=raw*factor;
      }
      columns.push(quantity);
      channels[quantity]={field,quantity,original_unit:units[j],canonical_unit:canonical,factor,unit_status:'resolved'};
      series.push(seriesPreview(quantity,quantity,units[j],canonical,values,timestamps,options.maxPoints));
    }
    return {
      schema_version:1,eligible:true,format:'fdv_ascii',source:{name:String(name||'')},monitor,rows,
      start:timestamps[0],end:timestamps[timestamps.length-1],columns,
      metadata:{monitor,interval_min:interval,channels,constants,time_basis:'model clock/unspecified',timestamp_convention:'instantaneous'},
      audit:{rows,sentinel_count:sentinels,field_count:fields.length,duplicate_timestamps:0},series,warnings:[]
    };
  }
  function parseCsvLine(line,delimiter){
    const out=[];let current='',quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(quoted){
        if(ch==='"'&&line[i+1]==='"'){current+='"';i+=1;}
        else if(ch==='"')quoted=false;
        else current+=ch;
      }else if(ch==='"')quoted=true;
      else if(ch===delimiter){out.push(current);current='';}
      else current+=ch;
    }
    out.push(current);return out.map(x=>x.trim());
  }
  function timeColumnIndex(fields){
    for(let i=0;i<fields.length;i++){
      const n=normalise(fields[i]);if(TIME_NAMES.has(n)||[...TIME_NAMES].some(t=>n.includes(t)))return i;
    }
    return -1;
  }
  function findCsvHeader(lines){
    const delimiters=[',','\t',';'];
    for(let i=0;i<Math.min(lines.length,120);i++){
      const line=lines[i];if(!line.trim())continue;
      for(const delimiter of delimiters){
        const fields=parseCsvLine(line,delimiter),timeIndex=timeColumnIndex(fields);
        if(fields.length>=2&&timeIndex>=0)return {index:i,delimiter,fields,timeIndex};
      }
    }
    return null;
  }
  function hydQuantity(text){
    const head=String(text).slice(0,24000).toUpperCase();
    if(head.includes('U_VELOCITY'))return ['velocity','m/s'];
    if(head.includes('U_FLOW'))return ['flow','m³/s'];
    if(head.includes('U_LEVEL')||head.includes('M AD')||head.includes('MAOD'))return ['level','m'];
    return ['depth','m'];
  }
  function sortSeries(epochs,timestamps,seriesValues){
    let sorted=true;for(let i=1;i<epochs.length;i++){if(epochs[i]<epochs[i-1]){sorted=false;break;}}
    if(sorted)return {timestamps,seriesValues};
    const order=Array.from({length:epochs.length},(_,i)=>i).sort((a,b)=>epochs[a]-epochs[b]||a-b);
    return {timestamps:order.map(i=>timestamps[i]),seriesValues:seriesValues.map(values=>order.map(i=>values[i]))};
  }
  function parseCsv(name,text,options){
    const clean=String(text??'').replace(/^\uFEFF/,'');
    const lines=clean.split(/\r?\n/),low=clean.slice(0,24000).toLowerCase();
    const hydSignature=low.includes('type=hyd')||low.includes('u_level')||low.includes('u_flow')||low.includes('u_velocity');
    let head=null;
    if(hydSignature){
      for(let i=0;i<Math.min(lines.length,160)&&!head;i++){
        for(const delimiter of [',','\t',';']){
          const fields=parseCsvLine(lines[i],delimiter),timeIndex=timeColumnIndex(fields);
          if(fields.length>=2&&timeIndex>=0&&normalise(fields[timeIndex])==='p_datetime'){
            head={index:i,delimiter,fields,timeIndex};
            break;
          }
        }
      }
    }
    if(!head)head=findCsvHeader(lines);
    if(!head)throw new Error('Could not detect a supported timestamp column');
    const isHyd=hydSignature&&normalise(head.fields[head.timeIndex])==='p_datetime';
    if(isHyd){
      const [quantity,unit]=hydQuantity(clean),epochs=[],timestamps=[],values=[];
      let invalid=0,duplicates=0,sentinelCount=0,nonNumeric=0;const seen=new Set();
      for(let i=head.index+1;i<lines.length;i++){
        if(!lines[i].trim())continue;
        const parts=parseCsvLine(lines[i],head.delimiter);
        if(parts.length<2)continue;
        const epoch=parseTimestamp(parts[0]);if(epoch==null){invalid+=1;continue;}
        if(seen.has(epoch))duplicates+=1;else seen.add(epoch);
        const n=numeric(parts[1]);if(n.sentinel)sentinelCount+=1;if(n.nonNumeric)nonNumeric+=1;
        epochs.push(epoch);timestamps.push(modelClockFromEpoch(epoch));values.push(n.value);
      }
      if(!timestamps.length)throw new Error('No valid P_DATETIME/value rows found');
      const sorted=sortSeries(epochs,timestamps,[values]),preview=seriesPreview('value',quantity,unit,unit,sorted.seriesValues[0],sorted.timestamps,options.maxPoints);
      return {
        schema_version:1,eligible:true,format:'icm_hyd_p_datetime_csv',source:{name:String(name||'')},monitor:null,rows:timestamps.length,
        start:sorted.timestamps[0],end:sorted.timestamps[sorted.timestamps.length-1],columns:['value'],
        metadata:{quantity,original_unit:unit,canonical_unit:unit,unit_status:'resolved',conversion_factor:1,time_basis:'model clock/unspecified',timestamp_convention:'instantaneous'},
        audit:{rows:timestamps.length,invalid_timestamps:invalid,duplicate_timestamps:duplicates,sentinel_count:sentinelCount,non_numeric_count:nonNumeric},
        series:[preview],warnings:[]
      };
    }

    const valueIndexes=head.fields.map((_,i)=>i).filter(i=>i!==head.timeIndex),epochs=[],timestamps=[],rawValues=valueIndexes.map(()=>[]);
    const audits=valueIndexes.map(()=>({sentinel_count:0,non_numeric_count:0,missing_count_after_clean:0,numeric_count:0}));
    let invalid=0,duplicates=0;const seen=new Set();
    for(let i=head.index+1;i<lines.length;i++){
      if(!lines[i].trim())continue;
      const parts=parseCsvLine(lines[i],head.delimiter);
      const epoch=parseTimestamp(parts[head.timeIndex]??'');
      if(epoch==null){invalid+=1;continue;}
      if(seen.has(epoch))duplicates+=1;else seen.add(epoch);
      epochs.push(epoch);timestamps.push(modelClockFromEpoch(epoch));
      for(let j=0;j<valueIndexes.length;j++){
        const n=numeric(parts[valueIndexes[j]]??'');
        rawValues[j].push(n.value);
        if(n.sentinel)audits[j].sentinel_count+=1;
        if(n.nonNumeric)audits[j].non_numeric_count+=1;
        if(n.missing)audits[j].missing_count_after_clean+=1;
        else audits[j].numeric_count+=1;
      }
    }
    if(!timestamps.length)throw new Error('No valid timestamp rows found');
    const keep=valueIndexes.map((index,j)=>({index,j})).filter(x=>audits[x.j].numeric_count>0);
    if(!keep.length)throw new Error('No numeric value columns found');
    const selectedRaw=keep.map(x=>rawValues[x.j]),sorted=sortSeries(epochs,timestamps,selectedRaw),columns=[],series=[],columnAudit={},quantityByColumn={},seriesMetadata={};
    for(let k=0;k<keep.length;k++){
      const {index,j}=keep[k],column=String(head.fields[index]).trim(),quantity=inferQuantity(column)||inferQuantity(name);
      const original=detectUnit(column,quantity)||detectUnit(name,quantity),[canonical,factor]=quantity&&original?canonicalUnit(quantity,original):[null,null];
      const values=sorted.seriesValues[k].map(v=>v==null?null:(canonical!=null&&factor!=null?Number(v)*factor:Number(v)));
      columns.push(column);quantityByColumn[column]=quantity;columnAudit[column]={sentinel_count:audits[j].sentinel_count,non_numeric_count:audits[j].non_numeric_count,missing_count_after_clean:audits[j].missing_count_after_clean};
      seriesMetadata[column]={quantity,original_unit:original,canonical_unit:canonical,conversion_factor:factor,unit_status:canonical?'resolved':'unresolved'};
      series.push(seriesPreview(column,quantity,original,canonical,values,sorted.timestamps,options.maxPoints));
    }
    return {
      schema_version:1,eligible:true,format:'tabular_csv',source:{name:String(name||'')},monitor:null,rows:timestamps.length,
      start:sorted.timestamps[0],end:sorted.timestamps[sorted.timestamps.length-1],columns,
      metadata:{columns,quantity_by_column:quantityByColumn,series_metadata:seriesMetadata,time_basis:'model clock/unspecified',timestamp_convention:'instantaneous'},
      audit:{rows:timestamps.length,invalid_timestamps:invalid,duplicate_timestamps:duplicates,column_audit:columnAudit},series,warnings:[]
    };
  }
  function ineligible(name,error){
    return {schema_version:1,eligible:false,format:null,source:{name:String(name||'')},monitor:null,rows:0,start:null,end:null,columns:[],metadata:{},audit:{},series:[],warnings:[String(error?.message||error)],error:String(error?.message||error)};
  }
  function parseText(name,text,options={}){
    const opts={maxPoints:Math.max(100,Number(options.maxPoints)||15000)};
    try{
      const n=String(name||'').toLowerCase();
      if(n.endsWith('.fdv')||n.endsWith('.fdv.txt'))return parseFdv(name,text,opts);
      if(n.endsWith('.csv')||n.endsWith('.hyd'))return parseCsv(name,text,opts);
      return ineligible(name,'FastPath preview supports FDV and CSV/HYD sources only');
    }catch(error){return ineligible(name,error);}
  }

  root.ICMFastPathCore=Object.freeze({schemaVersion:1,parseText,canonicalUnit,detectUnit,inferQuantity,parseTimestamp,decodeText});
})(typeof self!=='undefined'?self:globalThis);
