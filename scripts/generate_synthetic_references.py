"""Generate independent engineering fixtures. Never read or transform uploaded data.

The seed controls a fictional network, storms and hydraulics, not a mapping from
real assets. All file bytes, including archive and workbook metadata, are new.
"""
from __future__ import annotations
import csv
import hashlib
import io
import json
import math
import random
import shutil
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from xml.sax.saxutils import escape
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'reference/current-tool'
SEED = 8349071265
START = datetime(2028, 4, 3)
END = START + timedelta(days=32)
STEP = 2
COUNT = 32 * 24 * 60 // STEP + 1
YEARS = [2029, 2030, 2031]
VOLUME_FIELDS = ['Node ID','Ground level (m AD)','Max Flood/Lost Volume (m3)','Return period','Duration','Simulation','Max Level (m AD)','Max Flood depth (m)','Max Flood volume (m3)','Max Volume lost (m3)','Max Infiltration loss (l/s)','Max Inflow (l/s)','Max Direct runoff (l/s)','Cumulative inflow (m3)','Volume at flood level (m3)','Volume at ground level (m3)','Max Volume (m3)','Volume balance (m3)','Volume balance (%)']
LEVEL_FIELDS = [x for x in VOLUME_FIELDS if x != 'Max Flood/Lost Volume (m3)']
LEVEL_FIELDS.remove('Max Level (m AD)'); LEVEL_FIELDS.insert(2, 'Max Level (m AD)')
SPILL_FIELDS = ['Attribute','Units','ID','Threshold Flow (l/s)','Minimum Volume (m3)','Network','Run','Sim','Start of Spill (mins)','Start of Spill (absolute)','End of Spill (mins)','End of Spill (absolute)','Spill Duration (mins)','Peak Flow (l/s)','Time of peak (mins)','Time of peak (absolute)','Spill Volume (m3)','Pass forward link','Initial pass forward flow','Minimum pass forward flow','Maximum pass forward flow','Sim ID']


def write_csv(path, fields, rows):
    with path.open('w', newline='', encoding='utf-8') as stream:
        writer = csv.writer(stream, lineterminator="\n"); writer.writerow(fields); writer.writerows(rows)


def zip_bytes(path, entries):
    # Fresh metadata; no inherited paths, comments, timestamps, authors or extras.
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            info = zipfile.ZipInfo(name, (2032, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)


def workbook(path, rows):
    def cell(col, row, value):
        ref = f'{chr(65+col)}{row}'
        return f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'
    sheet = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    sheet += ''.join(f'<row r="{i}">'+''.join(cell(j,i,v) for j,v in enumerate(row))+'</row>' for i,row in enumerate(rows,1))
    sheet += '</sheetData></worksheet>'
    zip_bytes(path, {
        '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthetic associations" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml':sheet,
    })


def raw_stats(values, factor=1, interval=120, rain=False):
    values = np.asarray(values, dtype=float) * factor
    total = float(values.sum() * interval / 3600) if rain else float(((values[:-1]+values[1:])/2 * interval).sum())
    return {'rows':len(values),'minimum':float(values.min()),'maximum':float(values.max()),'mean':float(values.mean()),'total':total}


def main():
    rng = random.Random(SEED)
    noise = np.random.default_rng(SEED)
    monitors = [f'FM{x}' for x in rng.sample(range(2000,9900),9)]
    gauges = [f'RG{x}' for x in rng.sample(range(2000,9900),4)]
    station = f'CS{rng.randrange(2000,9900)}'
    # Independent topology with two tributary joins, a trunk and a spare gauge.
    upstream = [[],[],[],[0,1],[],[2,4],[3,5],[],[6,7]]
    diameters = [rng.choice([450,525,600,675]) for _ in monitors]
    diameters[3],diameters[5],diameters[6],diameters[8] = 1050,975,1500,1650
    if DEST.exists(): shutil.rmtree(DEST)
    sample = DEST/'sample-data'
    for sub in ['fdv','rainfall','other']:(sample/sub).mkdir(parents=True)
    (DEST/'reports/html').mkdir(parents=True)
    t = np.arange(COUNT)
    storms = np.zeros(COUNT)
    centres = sorted(rng.sample(range(700,COUNT-1200),3))
    for c in centres:
        width = rng.randrange(30,85)
        idx = np.arange(c,c+width)
        storms[idx] += rng.uniform(7,23)*(0.45+0.55*np.sin(np.linspace(0,np.pi,width)))
    gauge_data = []
    for i,gauge in enumerate(gauges):
        rainfall = np.round(storms * [1,.9,1.08,2.7][i] * noise.uniform(.94,1.06,COUNT),1)
        if i==2: rainfall[centres[0]:centres[0]+100] *= 4.5
        rainfall = np.round(rainfall,1)
        gauge_data.append(rainfall)
        text = f'**DATA_FORMAT: 1,ASCII\n**IDENTIFIER: 1,{gauge}\n**FIELD: 1,INTENSITY\n**UNITS: 1,MM/HR\n**FORMAT: 2,F15.1,[5]\n**CONSTANTS: 4,LOCATION,START,END,INTERVAL\n*CSTART\nSYNTHETIC {START:%y%m%d%H%M} {END:%y%m%d%H%M} {STEP}\n*CEND\n'
        text += '\n'.join(' '.join(f'{v:.1f}' for v in rainfall[j:j+5]) for j in range(0,COUNT,5))+'\n'
        (sample/'rainfall'/f'{gauge}.R').write_text(text)
    associations = []
    flows = []; fdv_stats = {}
    response = np.convolve(storms,np.exp(-np.arange(150)/35),mode='full')[:COUNT]/40
    for i,monitor in enumerate(monitors):
        flow = rng.uniform(6,14) + rng.uniform(2,4)*(1+np.sin(2*np.pi*t/720-rng.random())) + response*rng.uniform(.7,1.2)
        flow += noise.uniform(0,1,COUNT)
        for source in upstream[i]: flow += flows[source]
        flows.append(flow)
        velocity = np.round(.5 + .18*np.sin(2*np.pi*t/720) + .12*np.minimum(response/10,2) + noise.uniform(0,.04,COUNT),2)
        # Solve circular-segment area so Q = A(y)*v in the new network.
        diameter=diameters[i]/1000; target=flow/1000/velocity
        lo=np.zeros(COUNT);hi=np.full(COUNT,diameter)
        for _ in range(36):
            depth=(lo+hi)/2;theta=2*np.arccos(np.clip(1-2*depth/diameter,-1,1));area=diameter**2/8*(theta-np.sin(theta))
            lo=np.where(area<target,depth,lo);hi=np.where(area>=target,depth,hi)
        raw_flow=np.round(flow).astype(int);raw_depth=np.round((lo+hi)/2*1000).astype(int)
        text=f'**DATA_FORMAT: 1,ASCII\n**IDENTIFIER: 1,{monitor}\n**FIELD: 3,FLOW,DEPTH,VELOCITY\n**UNITS: 3,L/S,MM,M/S\n**FORMAT: 4,I5,I5,F5.2,[5]\n**CONSTANTS: 6,HEIGHT,MIN_VEL,MANHOLE_NO,START,END,INTERVAL\n*CSTART\n{diameters[i]} 0.1 SYNTHETIC_{rng.randrange(100000,999999)}\n{START:%y%m%d%H%M} {END:%y%m%d%H%M} {STEP}\n*CEND\n'
        text+='\n'.join(' '.join(f'{raw_flow[j]} {raw_depth[j]} {velocity[j]:.2f}' for j in range(k,min(k+5,COUNT))) for k in range(0,COUNT,5))+'\n'
        (sample/'fdv'/f'{monitor}.fdv').write_text(text)
        fdv_stats[monitor]={'flow':raw_stats(raw_flow,.001),'depth':raw_stats(raw_depth,.001),'velocity':raw_stats(velocity)}
        associations.append([monitor,gauges[i%3],diameters[i],', '.join(monitors[u] for u in upstream[i])])
    workbook(sample/'rainfall/fm_rg_assoc.xlsx',[['fdv_name','rain_name','Dia','upstream trace'],*associations])
    edm_start=datetime(2029,1,1);edm_end=datetime(2032,1,1);edm_count=int((edm_end-edm_start).total_seconds()/900)+1
    x=np.arange(edm_count)
    levels=np.round(5.1+.36*np.sin(x*2*np.pi/49.7)+.18*np.sin(x*2*np.pi/96)+noise.uniform(-.05,.05,edm_count),4)
    for centre in rng.sample(range(1000,edm_count-1000),180):
        length=rng.randrange(8,48);levels[centre:centre+length]+=np.round(rng.uniform(.3,1)*np.sin(np.linspace(0,np.pi,length)),4)
    edm_path=sample/'other'/f'{station}_EDM.csv'
    with edm_path.open('w') as f:
        f.write(f'!Version=1,type=HYD,encoding=MBCS\nUserSettings,U_LEVEL,U_CONDHEIGHT,U_VALUES,U_DATETIME\nUserSettingsValues,m AD,mm,m,dd-mm-yyyy hh:mm\nG_START,G_TS,G_NPROFILES\n{edm_start:%d/%m/%Y %H:%M:%S},900,1\nL_LINKID,L_INVERTLEVEL,L_CONDHEIGHT,L_GROUNDLEVEL,L_PTITLE\n{station},0,0,0,Synthetic level\nP_DATETIME,1\n')
        for j,value in enumerate(levels):f.write(f'{edm_start+timedelta(minutes=15*j):%d/%m/%Y %H:%M:%S},{value:.4f}\n')
    # Deliberately unresolved units and a long gap exercise missing != dry.
    rain_rows=[]
    for year in YEARS:
        for block in [datetime(year,2,7),datetime(year,10,12)]:
            values=np.zeros(24*30*20)
            for c in rng.sample(range(100,len(values)-100),5):values[c:c+40]=rng.uniform(6,18)
            for j,v in enumerate(values):rain_rows.append([(block+timedelta(minutes=2*j)).strftime('%d/%m/%Y %H:%M'),f'{v:.3f}'])
    write_csv(sample/'other'/f'{station}_Rainfall.csv',['Time','1'],rain_rows)
    # A large new model export keeps ingestion/performance coverage.
    buf=io.StringIO();writer=csv.writer(buf,lineterminator='\n');writer.writerow(['Time','Seconds',station+'.1'])
    model_start=datetime(2031,3,9);model_count=1008001
    for j in range(model_count):writer.writerow([(model_start+timedelta(seconds=30*j)).strftime('%d/%m/%Y %H:%M:%S'),j*30,f'{.1+.03*math.sin(j/540)+.015*math.sin(j/80):.5f}'])
    zip_bytes(sample/'other'/f'{station}_Modelled_Data.zip',{f'{station}_Modelled_Data.csv':buf.getvalue()})
    worst_rows=[]
    for i in range(47):
        ground=round(rng.uniform(18,57),3);level=round(ground+rng.uniform(-1,.3),3);flood=round(rng.uniform(0,21) if level>ground else 0,3);lost=round(rng.uniform(0,2),3)
        row={'Node ID':f'NODE_{rng.randrange(100000,999999)}','Ground level (m AD)':ground,'Max Level (m AD)':level,'Return period':rng.choice([2,5,10,30]),'Duration':'','Simulation':'Synthetic scenario Omega','Max Flood depth (m)':round(max(0,level-ground),3),'Max Flood volume (m3)':flood,'Max Volume lost (m3)':lost,'Max Flood/Lost Volume (m3)':round(flood+lost,3)}
        # Internally consistent storage/overflow values for a fictional node.
        ground_volume=round(rng.uniform(2,16),3)
        local_area=rng.uniform(8,40)
        flood=round(max(0,level-ground)*local_area,3)
        lost=round(flood*rng.uniform(0,.15),3)
        cumulative=round(rng.uniform(2000,16000),3)
        balance=round(cumulative*rng.uniform(-.003,.003),3)
        row.update({'Max Flood volume (m3)':flood,'Max Volume lost (m3)':lost,
                    'Max Flood/Lost Volume (m3)':round(flood+lost,3),
                    'Max Infiltration loss (l/s)':round(rng.uniform(0,.5),3),
                    'Max Inflow (l/s)':round(rng.uniform(10,100),3),
                    'Max Direct runoff (l/s)':round(rng.uniform(0,20),3),
                    'Cumulative inflow (m3)':cumulative,
                    'Volume at flood level (m3)':ground_volume,
                    'Volume at ground level (m3)':ground_volume,
                    'Max Volume (m3)':round(ground_volume+flood if level>=ground else ground_volume*rng.uniform(.4,.95),3),
                    'Volume balance (m3)':balance,
                    'Volume balance (%)':round(balance/cumulative*100,5)})
        worst_rows.append(row)
    write_csv(sample/'other/Worst_Case_Volume_Sample.csv',VOLUME_FIELDS,[[r[k] for k in VOLUME_FIELDS] for r in worst_rows])
    # Fresh controlled malformed numeric cells preserve the audit scenario.
    for i,row in enumerate(worst_rows):
        if i<11:row['Max Direct runoff (l/s)']=f'{i+1:02d}/01/1900 00:00'
    write_csv(sample/'other/Worst_Case_Level_Sample.csv',LEVEL_FIELDS,[[r[k] for k in LEVEL_FIELDS] for r in worst_rows])
    spill_rows=[]
    for i in range(83):
        start=datetime(2030,2,9)+timedelta(days=i*3,hours=rng.randrange(10));span=rng.randrange(60,400);duration=round(span*rng.uniform(.6,.94),1);peak=round(rng.uniform(8,27),3)
        row={k:'' for k in SPILL_FIELDS};row.update({'Attribute':'DS flow','Units':'l/s','ID':station+'.2','Threshold Flow (l/s)':.2,'Minimum Volume (m3)':0,'Network':'Synthetic network Delta','Run':'Synthetic run Omega','Sim':'Synthetic simulation Sigma','Start of Spill (absolute)':start.strftime('%d/%m/%Y %H:%M'),'End of Spill (absolute)':(start+timedelta(minutes=span)).strftime('%d/%m/%Y %H:%M'),'Spill Duration (mins)':duration,'Peak Flow (l/s)':peak,'Time of peak (absolute)':(start+timedelta(minutes=span//3)).strftime('%d/%m/%Y %H:%M'),'Spill Volume (m3)':round(peak*.5*duration*60/1000,3),'Sim ID':rng.randrange(-90000,-20000)})
        row['Sim ID']=-45678
        spill_rows.append(row)
    spill_rows[-1]['End of Spill (absolute)']= (datetime.strptime(spill_rows[-1]['Start of Spill (absolute)'],'%d/%m/%Y %H:%M')+timedelta(days=1)).strftime('%d/%m/%Y')
    write_csv(sample/'other/Statistical_Template_spills_Sample.csv',SPILL_FIELDS,[[r[k] for k in SPILL_FIELDS] for r in spill_rows])
    for year,scenario in [(2029,'Baseline'),(2030,'Baseline'),(2031,'Baseline'),(2031,'Option_C'),(2031,'Option_T')]:
        start=datetime(year,1,1);times=[(start+timedelta(hours=6*j)).isoformat() for j in range(120)];obs=[round(5.1+.6*math.sin(j/9)+rng.uniform(-.1,.1),3) for j in range(120)];model=[round(v*.98+.07,3) for v in obs]
        traces=[{'name':'Observed Depth','x':times,'y':obs,'type':'scatter','line':{'color':'#ff0000'}},{'name':scenario,'x':times,'y':model,'type':'scatter','line':{'color':'#0008ff'}},{'type':'table','header':{'values':['Series','Min','Max','Mean']},'cells':{'values':[['Observed','Model'],[min(obs),min(model)],[max(obs),max(model)],[sum(obs)/len(obs),sum(model)/len(model)]]}}]
        layout={'title':f'Synthetic {station} {year} {scenario}','shapes':[{'y0':5.7,'y1':5.7,'xref':'paper','x0':0,'x1':1,'name':'Spill threshold'}]}
        report=f'<!doctype html><html><head><meta charset="utf-8"><title>Synthetic demonstration</title></head><body><h1>SYNTHETIC DATA — no real asset or measurements</h1><div id="plot"></div><script src="../../../../web/vendor/plotly-3.1.0/plotly.min.js"></script><script>Plotly.newPlot("plot", {json.dumps(traces)}, {json.dumps(layout)});</script></body></html>\n'
        (DEST/'reports/html'/f'{station}_Spills_{year}_{scenario}.html').write_text(report)
    manifest={'schema_version':1,'data_kind':'fully synthetic, independently generated','seed':SEED,'station':station,'monitors':monitors,'gauges':gauges,'associated_gauges':gauges[:3],'association_rows':associations,'survey_start':START.isoformat(),'survey_end':END.isoformat(),'survey_rows':COUNT,'edm_rows':edm_count,'rainfall_csv_rows':len(rain_rows),'model_rows':model_count,'assessment_start':edm_start.isoformat(),'assessment_end':edm_end.isoformat(),'report_year':START.year,'fdv_statistics':fdv_stats,'rainfall_statistics':{g:raw_stats(v,interval=120,rain=True) for g,v in zip(gauges,gauge_data)},'detriment_rows':{'level':47,'flooding':47,'spill':83},'numeric_date_cells':11,'date_only_boundaries':1}
    manifest['files']={p.relative_to(DEST).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(DEST.rglob('*')) if p.is_file()}
    (DEST/'synthetic-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (DEST/'README.md').write_text('# Synthetic reference fixtures\n\nEvery dataset and report here is generated from scratch by `scripts/generate_synthetic_references.py`. No uploaded source file is read, shifted, scaled or pseudonymised. The seed describes only the fictional examples.\n\nThe FDV/R files and association workbook share a new network, identifiers, pipe sizes and timestamps. Flow/depth/velocity follow circular-pipe area relationships; upstream traces form an acyclic network. The fourth gauge is deliberately unassociated. CSV/HYD/ZIP formats retain their parser contracts. Long gaps and unresolved rainfall units remain deliberate test cases. Detriment exports include fresh date-in-numeric-field and date-only-boundary audit cases.\n\nThe original screenshots were removed because pixels cannot be reliably anonymised. Five freshly generated HTML reports preserve plot/table/threshold presentation examples. Expected statistics are calculated from the generated raw values independently of application parsers and engines.\n\nThese files are test examples only. They are excluded from the production Pages artifact. The application does not fetch them. Replacing current files does not remove old Git commits, branches, forks or cached artifacts.\n')
    print(json.dumps({k:manifest[k] for k in ['station','monitors','gauges','survey_rows','edm_rows','rainfall_csv_rows']}))

if __name__=='__main__':main()
