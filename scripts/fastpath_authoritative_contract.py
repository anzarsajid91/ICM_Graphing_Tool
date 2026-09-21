from __future__ import annotations
import json
from pathlib import Path

from icm_workbench.browser_api import parse_source, series_data, clear_cache

ROOT=Path(__file__).resolve().parents[1]
FILES=[
    ROOT/'reference/current-tool/sample-data/fdv/FM01.fdv',
    ROOT/'reference/current-tool/sample-data/other/StationA_EDM.csv',
    ROOT/'reference/current-tool/sample-data/other/StationA_Rainfall.csv',
]

out={}
for path in FILES:
    parsed=json.loads(parse_source(str(path)))
    series={}
    for col in parsed['columns']:
        data=json.loads(series_data(str(path),col,max_points=20))
        s=data.get('statistics') or {}
        series[col]={
            'quantity':s.get('quantity'),
            'unit':s.get('unit'),
            'minimum':s.get('minimum'),
            'mean':s.get('mean'),
            'maximum':s.get('maximum'),
            'valid_count':s.get('valid_count'),
            'missing_count':s.get('missing_count'),
        }
    out[path.name]={
        'format':parsed['format'],
        'rows':parsed['rows'],
        'start':parsed['start'],
        'end':parsed['end'],
        'columns':parsed['columns'],
        'audit':parsed.get('audit') or {},
        'series':series,
    }
    clear_cache()
print(json.dumps(out,separators=(',',':')))
