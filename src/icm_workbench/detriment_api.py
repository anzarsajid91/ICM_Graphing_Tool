"""ICM report-table comparisons, isolated from timestamp-series calculations."""
from __future__ import annotations

import csv
import json
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .parsers.csv import _read_text


def _token(value):
    value=re.sub(r"[\[(].*?[\])]", "", str(value)).replace("³","3")
    return re.sub(r"[^a-z0-9]", "", value.lower())


ALIASES={
    "asset_id":("nodeid","csoid","objectid","id","node","cso","assetid","asset","nodename","reference"),
    "flood":("floodvolume","maxfloodvolume","maximumfloodvolume","floodingvolume","floodedvolume","floodlostvolume","maxfloodlostvolume","floodvol","maxfloodvol"),
    "level":("maxlevel","maximumlevel","maximumwaterlevel","maxwaterlevel","waterlevel","level","waterelevation","maximumwaterelevation","head"),
    "ground":("groundlevel","groundelevation","coverlevel","gl"),
    "count":("spillcount","numberofspills","totalspills","spills"),
    "duration":("totaldurationofexceedances","exceedanceduration","totalspillduration","actualspillduration","spillingduration","spillduration","duration"),
    "critical_simulation":("criticalsimulation","simulation","sim","worstcasesimulation","networkrunensemblesim"),
    "start":("startofexceedance","startofspill","start","starttime"),
    "end":("endofexceedance","endofspill","end","endtime"),
    "attribute":("attribute","objectattribute"),
}


def _suggest(columns,kind):
    fields={}
    for field,aliases in ALIASES.items():
        for alias in aliases:
            found=next((c for c in columns if _token(c)==alias),None)
            if found is not None:fields[field]=found;break
    # Absolute dates must take precedence over elapsed-minute columns, which
    # have the same token after parenthetical unit text is removed.
    for field in ("start","end"):
        absolute=next((c for c in columns if _token(c) in ALIASES[field]
                       and re.search(r"(?i)absolute|date",c)),None)
        if absolute:fields[field]=absolute
    # The leading result measure is the critical parameter in a native worst
    # case export. Do not prefer an ancillary flood-volume column by alias rank.
    fields['flood']=next((c for c in columns if _token(c) in ALIASES['flood']),fields.get('flood'))
    value=fields.get("flood" if kind=="flooding" else "level")
    if value:fields["value"]=value
    return {k:v for k,v in fields.items() if k not in ("flood","level")}


def _infer_kind(columns):
    tokens={_token(c) for c in columns}
    if tokens.intersection(ALIASES['count']):return 'spill_summary'
    if (tokens.intersection(ALIASES['duration']) and tokens.intersection(ALIASES['start'])
            and tokens.intersection(ALIASES['end'])):return 'spill_detail'
    for column in columns:
        for kind,field in [('flooding','flood'),('level','level')]:
            if _token(column) in ALIASES[field]:return kind
    return 'ground' if tokens.intersection(ALIASES['ground']) else 'generic'


def _critical_kind(columns):
    tokens={_token(c) for c in columns}
    return _infer_kind(columns) if 'returnperiod' in tokens and tokens.intersection(ALIASES['critical_simulation']) else None


def _flood_measure(column):
    token=_token(column)
    return 'flood_lost_volume' if 'floodlost' in token else 'flood_volume' if 'flood' in token else 'other_volume'


def _read_table(path,kind="auto"):
    text,encoding=_read_text(Path(path));lines=text.splitlines()
    candidates=[]
    for index,line in enumerate(lines[:100]):
        for delimiter in (",","\t",";"):
            fields=next(csv.reader([line],delimiter=delimiter))
            fields=[x.strip() for x in fields]
            if len(fields)<2:continue
            score=10*sum(_token(c) in ALIASES['asset_id'] for c in fields)
            score+=sum(_token(c) in aliases for c in fields for aliases in ALIASES.values())
            candidates.append((score,-index,len(fields),index,delimiter,fields))
    if not candidates:raise ValueError("No report header found. Export a CSV or paste a tab-separated grid with headings.")
    _,_,_,index,delimiter,columns=max(candidates,key=lambda r:r[:3])
    if len(set(columns))!=len(columns) or any(not c for c in columns):
        raise ValueError("Report column headings must be non-empty and unique.")
    records=[]
    for number,fields in enumerate(csv.reader(lines[index+1:],delimiter=delimiter),index+2):
        if not fields or not any(x.strip() for x in fields):continue
        if len(fields)!=len(columns):raise ValueError(f"Report row {number} has {len(fields)} cells; expected {len(columns)}.")
        records.append({column:value.strip() for column,value in zip(columns,fields)})
    if not records:raise ValueError("The report contains no asset rows.")
    if len(records)>200000:raise ValueError("Report exceeds 200,000 rows. Export the selected assessment scope.")
    if kind=="auto":
        kind=_infer_kind(columns)
    return columns,records,kind,encoding


def parse_detriment_report(path,report_kind="auto"):
    columns,records,kind,encoding=_read_table(path,report_kind)
    mapping=_suggest(columns,kind)
    numeric_dates=sum(bool(re.fullmatch(r'\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}(?::\d{2})?',value))
                      for row in records for column,value in row.items()
                      if re.search(r'\((?:m3|m³|l/s|m|%)\)',column,re.I))
    date_only=sum(bool(re.fullmatch(r'\d{2}/\d{2}/\d{4}',row.get(mapping.get(field),'')))
                  for row in records for field in ('start','end'))
    warnings=[]
    if numeric_dates:warnings.append(f'{numeric_dates} date-formatted cells occur in numeric columns. Values are preserved; mapped non-numeric results remain unavailable.')
    if date_only:warnings.append(f'{date_only} date-only event boundaries are interpreted as 00:00 in the common model clock.')
    if kind=='spill_detail':warnings.append('Detail rows do not declare an authoritative UK 12/24 spill count. Confirm the exported-row basis or supply a summary.')
    return json.dumps({"format":"icm_report_table","columns":columns,"rows":len(records),"start":None,"end":None,
        "metadata":{"source_kind":"detriment_report","report_kind":kind,"source_encoding":encoding,
                    "mapping_suggestions":mapping,"critical_kind":_critical_kind(columns),"warnings":warnings,
                    "datum":_datum({'mapping':mapping}),
                    "mapping_by_kind":{k:_suggest(columns,k) for k in ('flooding','level','spill','ground')}},
        "preview_rows":records[:8],"audit":{"report_rows":len(records),"malformed_rows":0,
                    "numeric_date_cells":numeric_dates,"date_only_boundaries":date_only}},ensure_ascii=False)


def _number(value):
    raw=("" if value is None else str(value)).strip().replace("−","-")
    if re.fullmatch(r"[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?",raw):raw=raw.replace(",","")
    try:n=Decimal(raw)
    except InvalidOperation:return None
    return n if n.is_finite() else None


def _unit_from_header(column,dimension):
    low=str(column).lower().replace("³","3")
    candidates=re.findall(r"[\[(]([^\])]+)[\])]",low)
    candidates+=re.findall(r"\b(mm|m3|m|mins?|minutes?|hours?|h)\s*$",low)
    known={"level":{"m","mm","maod","mad"},
           "volume":{"m3","l","litres","liters","ml"},
           "duration":{"min","mins","minute","minutes","h","hr","hours","s","sec","seconds"},
           "flow":{"m3/s","l/s","ml/d"},"count":{"spills","events","count"}}
    for raw in candidates:
        key=re.sub(r"[\s_]","",raw)
        declared=next((d for d,units in known.items() if key in units),None)
        if declared and declared!=dimension:
            raise ValueError(f"Incompatible physical dimension in {column!r}: declared {declared}, assessed {dimension}.")
        if declared:return "mm" if key=="mm" else "m" if key in ("maod","mad") else key
    return None


def _factor(source,column,dimension,field="unit"):
    units={"level":{"m":Decimal(1),"mm":Decimal(".001")},
           "volume":{"m3":Decimal(1),"l":Decimal(".001"),"litres":Decimal(".001"),"liters":Decimal(".001"),"ml":Decimal(1000)},
           "duration":{"h":Decimal(1),"hr":Decimal(1),"hours":Decimal(1),"min":Decimal(1)/60,"mins":Decimal(1)/60,"minute":Decimal(1)/60,"minutes":Decimal(1)/60,"s":Decimal(1)/3600,"sec":Decimal(1)/3600,"seconds":Decimal(1)/3600}}
    declared=_unit_from_header(column,dimension)
    selected=str(source.get(field) or "auto").lower().replace("³","3").replace(" ","")
    if selected=="auto":selected=declared
    if selected not in units[dimension]:raise ValueError(f"Resolve the {dimension} unit for {column!r} before comparison.")
    if declared and units[dimension][selected]!=units[dimension][declared]:
        raise ValueError(f"Selected unit contradicts the declared unit in {column!r}.")
    return units[dimension][selected]


def _source(config,kind,detail=False):
    if not config or not config.get("path"):raise ValueError("Select both report sources from Data Sources.")
    columns,records,report_kind,_=_read_table(config["path"],config.get("report_kind","auto"))
    critical=_critical_kind(columns)
    if kind in ('flooding','level') and critical and critical!=kind:
        raise ValueError(f'This is a {critical}-critical worst-case report. Upload the separate {kind} worst-case export; ancillary values are not independent worst cases.')
    mapping=dict(config.get("mapping") or _suggest(columns,kind))
    if critical and kind in ('flooding','level') and mapping.get('value')!=_suggest(columns,critical).get('value'):
        raise ValueError('Map the leading critical measure column from this worst-case report; ancillary results belong to that critical simulation and are not independent worst cases.')
    id_column=mapping.get("asset_id")
    if id_column not in columns:raise ValueError("Map the asset ID column for every selected report.")
    required=['value'] if kind in ('flooding','level') else (['duration'] if detail else ['count','duration']) if kind=='spill' else ['ground']
    for field in required:
        if mapping.get(field) not in columns:raise ValueError(f"Map the {field} column in {config.get('name') or 'report'}.")
    if kind=='spill':
        token=_token(mapping.get('duration',''))
        if 'period' in token or ('block' in token and 'actual' not in token):
            raise ValueError('Spill-block period is not actual exceedance duration; map the duration statistic.')
    attribute=mapping.get('attribute');attribute_value=str(config.get('attribute_value') or '').strip()
    if attribute in columns:
        values={r[attribute] for r in records}
        if len(values)>1 and not attribute_value:raise ValueError("Report contains multiple attributes. Select the assessed attribute.")
        if attribute_value:records=[r for r in records if r[attribute]==attribute_value]
        if not records:raise ValueError('No report rows match the selected attribute. Correct the selection before comparison.')
    if kind=='spill':
        for column in columns:
            if _token(column) in ('network','run','sim','simulation','simid'):
                values={r[column] for r in records if r[column]}
                if len(values)>1:raise ValueError(f'Spill report contains multiple {column} values. Export one scenario/run before comparing.')
    grouped={}
    for row in records:
        asset=row[id_column].strip()
        if not asset:raise ValueError("Report contains a blank asset ID.")
        if asset in grouped and not detail:raise ValueError(f"Duplicate asset ID {asset!r}; select one attribute/run or correct the report.")
        grouped.setdefault(asset,[]).append(row)
    return dict(config,mapping=mapping,groups=grouped,report_kind=report_kind)


def _value(source,row,field,dimension=None,unit_field="unit",nonnegative=False):
    column=source['mapping'].get(field)
    if not row or not column:return None
    if field=='count':_unit_from_header(column,'count')
    value=_number(row.get(column))
    if value is None or (nonnegative and value<0):return None
    return value*_factor(source,column,dimension,unit_field) if dimension else value


def _datum(source,field=None):
    declared=str(source.get('datum') or '').strip().casefold()
    column=str(source.get('mapping',{}).get(field) if field else source.get('mapping',{}).get('value') or source.get('mapping',{}).get('ground') or '')
    detected='aod' if re.search(r'(?i)m\s*aod|maod',column) else 'ad' if re.search(r'(?i)m\s*ad\b',column) else None
    if detected and declared and declared!=detected:raise ValueError("Selected datum contradicts the report heading.")
    return declared or detected


def _report_datetime(value):
    raw=str(value or '').strip()
    try:parsed=datetime.fromisoformat(raw)
    except ValueError:
        parsed=None
        for fmt in ('%d/%m/%Y %H:%M:%S.%f','%d/%m/%Y %H:%M:%S','%d/%m/%Y %H:%M','%d/%m/%Y',
                    '%d-%b-%Y %H:%M:%S','%d-%b-%Y %H:%M','%d/%b/%Y %H:%M:%S','%d/%b/%Y %H:%M'):
            try:parsed=datetime.strptime(raw,fmt);break
            except ValueError:continue
    if parsed is None or parsed.tzinfo is not None:
        raise ValueError("Resolve report date/time values to ISO or day/month/year in a common model clock.")
    return parsed


def _validate_detail_period(source,start,end):
    for field in ('start','end'):
        if not source['mapping'].get(field):
            raise ValueError("Map detail start and end dates to verify the declared period and event boundaries.")
    for asset,records in source['groups'].items():
        seen=set()
        for row in records:
            a=_report_datetime(row.get(source['mapping']['start']));b=_report_datetime(row.get(source['mapping']['end']))
            if (a,b) in seen:raise ValueError(f'Duplicate detail event boundaries for {asset!r}; resolve duplicate or mixed-run evidence before counting.')
            seen.add((a,b))
            if b<=a:raise ValueError("Detail end date must be later than its start.")
            if a<start or a>=end or b>end:
                raise ValueError("Detail row lies outside or crosses the declared period boundary. Export period-specific evidence with explicit boundary attribution before assessment.")


def _detail_events(source,asset):
    if not source:return []
    events=[]
    for raw in source['groups'].get(asset,[]):
        duration=_value(source,raw,'duration','duration','duration_unit',True)
        events.append({'start':_report_datetime(raw.get(source['mapping'].get('start'))).isoformat(sep=' '),'end':_report_datetime(raw.get(source['mapping'].get('end'))).isoformat(sep=' '),
                       'duration_hours':float(duration) if duration is not None else None,'source_row':raw})
    return events


def _spill_values(source,asset,mode):
    raw_rows=source['groups'].get(asset,[])
    if not raw_rows:return None,None
    if mode=='summary':
        row=raw_rows[0];count=_value(source,row,'count',nonnegative=True)
        if count is not None and count!=int(count):count=None
        return count,_value(source,row,'duration','duration','duration_unit',True)
    durations=[_value(source,r,'duration','duration','duration_unit',True) for r in raw_rows]
    return Decimal(len(raw_rows)),sum(durations,Decimal(0)) if all(v is not None for v in durations) else None


def detriment_result(kind,scenario_a_json,scenario_b_json,criteria_json,ground_json="null",detail_a_json="null",detail_b_json="null"):
    if kind not in ('flooding','level','spill'):raise ValueError("Unsupported detriment assessment.")
    criteria=json.loads(criteria_json);a_config=json.loads(scenario_a_json);b_config=json.loads(scenario_b_json)
    if not criteria.get('scope_confirmed'):raise ValueError("Please confirm matching assessment scope and completed ICM runs.")
    if not a_config.get('scope') or a_config.get('scope')!=b_config.get('scope'):
        raise ValueError("Scenario assessment scopes must match.")
    threshold=_number(criteria.get('threshold',0))
    if threshold is None or threshold<0:raise ValueError("Detriment tolerance/threshold must be finite and non-negative.")
    required=_number(criteria.get('freeboard_required')) if criteria.get('freeboard_required') is not None else None
    if criteria.get('freeboard_required') is not None and (required is None or required<0):raise ValueError("Required freeboard must be finite and non-negative.")
    mode=criteria.get('counting_mode','summary')
    count_unit={'summary':'spills','block-rows':'spill-block rows','physical-events':'physical events'}.get(mode,'spills')
    if kind=='spill':
        if mode not in ('summary','block-rows','physical-events'):raise ValueError("Select an explicit spill counting mode.")
        for field in ('period_start','period_end','template'):
            if not a_config.get(field) or a_config.get(field)!=b_config.get(field):raise ValueError(f"Spill {field} must be declared and match between A and B.")
        try:
            if datetime.fromisoformat(a_config['period_end'])<=datetime.fromisoformat(a_config['period_start']):raise ValueError('end before start')
        except (ValueError,TypeError):raise ValueError("The spill assessment period must have a valid start and later end.") from None
        if mode=='summary' and any(s.get('report_kind')=='spill_detail' or not s.get('mapping',{}).get('count') for s in (a_config,b_config)):
            raise ValueError("Upload Exceedance Summary for authoritative Spill count, or explicitly select the exported detail counting mode.")
    a=_source(a_config,kind,detail=kind=='spill' and mode!='summary');b=_source(b_config,kind,detail=kind=='spill' and mode!='summary')
    if kind=='flooding':
        measures=[_flood_measure(s['mapping']['value']) for s in (a,b)]
        if 'other_volume' not in measures and measures[0]!=measures[1]:
            raise ValueError('Scenario flood-volume measures must match: flood-only and combined flood/lost volume cannot be compared as the same measure.')
    if kind=='level':
        if not _datum(a) or _datum(a)!=_datum(b):raise ValueError("Level reports must share a declared vertical datum.")
        for source in (a,b):
            if source['mapping'].get('ground') and _datum(source,'ground')!=_datum(source):
                raise ValueError('Inline ground and water-level datum must match.')
        if any('depth' in _token(s['mapping']['value']) for s in (a,b)):raise ValueError("Maximum depth cannot substitute for water-level elevation.")
    if kind=='spill' and mode=='summary' and any('exceed' in _token(s['mapping']['count']) for s in (a,b)):
        raise ValueError("Exceedance count is not an authoritative block Spill count.")
    ground_config=json.loads(ground_json);ground=_source(ground_config,'ground') if ground_config else None
    if kind=='level' and ground and _datum(ground,'ground')!=_datum(a):raise ValueError("Ground levels must use the same vertical datum as water levels.")
    detail_sources=[_source(json.loads(raw),'spill',detail=True) if json.loads(raw) else None for raw in (detail_a_json,detail_b_json)]
    if kind=='spill':
        start=_report_datetime(a_config['period_start']);end=_report_datetime(a_config['period_end'])
        for source in ([a,b] if mode!='summary' else [])+[d for d in detail_sources if d]:
            _validate_detail_period(source,start,end)
    rows=[]
    for asset in sorted(set(a['groups'])|set(b['groups'])):
        ra=(a['groups'].get(asset) or [None])[0];rb=(b['groups'].get(asset) or [None])[0]
        values=[];durations=[]
        for source,raw in ((a,ra),(b,rb)):
            if kind=='spill':v,t=_spill_values(source,asset,mode);durations.append(t)
            else:v=_value(source,raw,'value','volume' if kind=='flooding' else 'level',nonnegative=kind=='flooding')
            values.append(v)
        va,vb=values;delta=vb-va if va is not None and vb is not None else None
        row={'asset_id':asset,'a':va,'b':vb,'delta':delta,'unit':{'flooding':'m³','level':'m','spill':count_unit}[kind],
             'matched':bool(ra is not None and rb is not None),'flags':[],'status':'unchanged',
             'evidence_a':ra,'evidence_b':rb,
             'critical_a':(ra or {}).get(a['mapping'].get('critical_simulation')),
             'critical_b':(rb or {}).get(b['mapping'].get('critical_simulation'))}
        flags=row['flags']
        if not row['matched']:row['status']='unmatched';flags.append('missing_scenario_b' if rb is None else 'missing_scenario_a')
        elif delta is None:row['status']='unavailable';flags.append('invalid_or_missing_value')
        elif kind in ('flooding','level'):
            if delta>threshold:flags.append('flood_detriment' if kind=='flooding' else 'level_detriment');row['status']='detriment'
            elif delta>0:flags.append('increase_within_tolerance');row['status']='risk'
            elif delta<0:flags.append('improvement');row['status']='improvement'
            else:flags.append('unchanged')
            if kind=='flooding' and va==0 and vb>0:flags.append('new_flooding')
        if kind=='level':
            grounds=[]
            for source,raw in ((a,ra),(b,rb)):
                if ground:
                    gr=(ground['groups'].get(asset) or [None])[0];g=_value(ground,gr,'ground','level')
                else:
                    gs=dict(source,ground_unit=source.get('ground_unit') or ('auto' if _unit_from_header(source['mapping'].get('ground'),'level') else source.get('unit')))
                    g=_value(gs,raw,'ground','level','ground_unit')
                grounds.append(g)
            ga,gb=grounds;fa=ga-va if ga is not None and va is not None else None;fb=gb-vb if gb is not None and vb is not None else None
            row.update(ground_a=ga,ground_b=gb,freeboard_a=fa,freeboard_b=fb,freeboard_change=fb-fa if fa is not None and fb is not None else None)
            if ga is not None and gb is not None and ga!=gb:flags.append('ground_level_changed')
            if required is not None:
                if fa is None or fb is None:flags.append('freeboard_unavailable')
                elif fb<required:
                    if fa>=required:flags.append('new_freeboard_breach');row['status']='detriment'
                    elif fb<fa:flags.append('existing_breach_worsening');row['status']='detriment'
                    else:flags.append('existing_breach_improving' if fb>fa else 'existing_breach_unchanged');row['status']='risk' if row['status']!='detriment' else row['status']
                elif fa<required:flags.append('freeboard_breach_resolved')
        if kind=='spill':
            ta,tb=durations;dt=tb-ta if ta is not None and tb is not None else None
            row.update(duration_a_hours=ta,duration_b_hours=tb,duration_delta_hours=dt,
                       details_a=_detail_events(detail_sources[0] or (a if mode!='summary' else None),asset),
                       details_b=_detail_events(detail_sources[1] or (b if mode!='summary' else None),asset))
            if row['matched'] and (delta is None or dt is None):row['status']='unavailable';flags.append('invalid_or_missing_count_or_duration')
            elif row['matched']:
                if delta>0:row['status']='detriment';flags.append('spill_count_detriment')
                elif delta<0:row['status']='improvement';flags.append('count_improvement')
                if dt>0:
                    flags.append('duration_increase')
                    if delta<0:flags.append('mixed_result')
                    if delta<=0:row['status']='risk'
                elif dt<0:flags.append('duration_improvement');row['status']='improvement' if delta<=0 else row['status']
                if not flags:flags.append('unchanged')
        rows.append(row)
    summary={'assets':len(rows),'matched':sum(r['matched'] for r in rows),
             **{key:sum(r['status']==status for r in rows) for key,status in [('detriment','detriment'),('risk','risk'),('improved','improvement')]},
             'unresolved':sum(r['status'] in ('unmatched','unavailable') or 'freeboard_unavailable' in r['flags'] for r in rows),
             'max_increase':max([r['delta'] for r in rows if r['delta'] is not None]+[Decimal(0)])}
    result={'kind':kind,'rows':rows,'summary':summary,'criteria':criteria,'scenario_a':a_config,'scenario_b':b_config,
            'ground_source':ground_config,'detail_source_a':json.loads(detail_a_json),'detail_source_b':json.loads(detail_b_json),
            'date_convention':'ISO or day/month/year model clock','boundary_policy':'reject crossing or out-of-period detail rows','status':'partial' if summary['unresolved'] else 'complete',
            'method':'Matched report assets; unrounded canonical B minus A; strict tolerance exceedance; missing assets never zero',
            'counting_mode':mode if kind=='spill' else None,'count_unit':count_unit if kind=='spill' else None}
    return json.dumps(result,default=lambda v:float(v) if isinstance(v,Decimal) else str(v),ensure_ascii=False,allow_nan=False)
