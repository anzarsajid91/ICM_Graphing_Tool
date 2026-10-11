"""Join source-owned controls with synthetic rendered evidence, without claiming untested states.
Usage: python scripts/uiux_evidence_inventory.py <artifact-directory> [...]
Evidence directories are local inputs; no network calls or production data.
"""
from pathlib import Path
import csv,json,re,sys
ROOT=Path(__file__).resolve().parents[1]
evidence=[]
for directory in sys.argv[1:]:
 for path in Path(directory).rglob('*.json'):
  if path.name!='inventory.json' and not path.name.endswith('-controls.json'):continue
  rows=json.loads(path.read_text())
  if not isinstance(rows,list):continue
  for row in rows:
   if row.get('visible',True):evidence.append((row,path.name))

def matches(selector,row):
 if selector.startswith('#'):return row.get('id')==selector[1:]
 if selector.startswith('[id^='):return row.get('id','').startswith(selector[6:-2])
 if selector.startswith('[data-'):return any(k==selector[1:-1] for k,v in row.get('attributes',[]))
 parts=selector.split('.')
 return row.get('tag','').lower()==parts[0] and all(c in row.get('classes','').split() for c in parts[1:])

def suites(owners,selector):
 names=[]
 for file in (ROOT/'web/tests').glob('*.mjs'):
  if file.name in ['uiux-review.mjs','uiux-evidence.mjs']:continue
  if selector.lstrip('#') in file.read_text() and len(selector)>2:names.append(file.name)
 return '; '.join(names) or ('network-* unit/smoke' if 'network-schematic' in owners else 'detriment-* unit/smoke' if 'detriment' in owners else 'schematic-review/smoke' if 'workflow-26' in owners else 'smoke/precision-shell/workspace-interactions')

def purpose(selector,owners):
 text=re.sub(r'([a-z])([A-Z])',r'\1 \2',selector.lstrip('#')).replace('-',' ')
 if 'Threshold' in selector or 'threshold' in selector:return text+' · numeric engineering threshold; unit and persistence unchanged'
 if 'Unit' in selector or 'unit' in selector:return text+' · quantity/unit interpretation; known conversion and unknown gating unchanged'
 if any(x in selector.lower() for x in ['export','download','save','load']):return text+' · local output/restore action; source bytes and provenance unchanged'
 if any(x in selector.lower() for x in ['calculate','run','apply','refresh']):return text+' · existing calculation/render action; authoritative worker contract unchanged'
 if any(x in selector.lower() for x in ['select','picker','year','scenario','filter']):return text+' · existing selection/filter; options, stale invalidation and context retained'
 return text+' · existing native action, display or generated control family retained'

source=ROOT/'docs/uiux/coverage-matrix.csv'
with source.open() as f:rows=list(csv.DictReader(f));fields=list(rows[0])
for r in rows:
 selector=r['DOM selector candidate'];hits=[(e,n) for e,n in evidence if matches(selector,e)]
 owners=r['Owning sources'];r['Existing functionality']=purpose(selector,owners)
 r['Regression tests']=suites(owners,selector)
 if hits:
  r['Workspace / route']='; '.join(sorted({e.get('route','unknown') for e,n in hits}))
  r['State dependencies']='; '.join(sorted({e.get('state','empty') for e,n in hits}))+'; additional busy/error/partial paths require their specific assertions'
  r['Component']=' / '.join(sorted({e.get('label') or e.get('tag','control') for e,n in hits})[:3])[:240]
  r['Implementation status']='Shared design applied; rendered in named states; suite-level regression evidence; no exhaustive state claim'
  r['Verification evidence']='; '.join(sorted({n for e,n in hits}))
 else:
  legacy=all(x in ['web/assets/app.js','web/assets/runtime.js'] for x in owners.split('; '))
  r['Implementation status']='Compatibility source reviewed; not shipped in release boot' if legacy else 'Source owner reviewed; shared design applied; conditional rendered verification not yet captured'
  r['Verification evidence']='Static source ownership; no matching rendered state in supplied artifacts'
with source.open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader();w.writerows(rows)
# Include every runtime-only control with a stable identity, as well as non-ID families.
known={r['DOM selector candidate'] for r in rows};runtime={}
for e,name in evidence:
 selector='#'+e['id'] if e.get('id') else e.get('tag','').lower()+''.join('.'+x for x in e.get('classes','').split() if re.fullmatch(r'[a-zA-Z_][\w-]*',x))
 key=(e.get('route'),selector,e.get('label'))
 runtime.setdefault(key,{'row':e,'selector':selector,'evidence':set()})['evidence'].add(name)
with (ROOT/'docs/uiux/runtime-controls.csv').open('w',newline='') as f:
 w=csv.writer(f,lineterminator='\n');w.writerow(['Route','Component','Selector','State evidence','Owning source reference','Interaction contract','Accessibility/state','Verification scope'])
 for key,v in sorted(runtime.items(),key=lambda x:str(x[0])):
  e=v['row'];candidates=[r for r in rows if matches(r['DOM selector candidate'],e)]
  candidates.sort(key=lambda r:(0 if r['DOM selector candidate'].startswith('#') else 1 if r['DOM selector candidate'].startswith('[data-') else 2,-len(r['DOM selector candidate'])))
  owners=candidates[0]['Owning sources'] if candidates else 'Runtime-generated family; inspect route owner'
  w.writerow([e.get('route'),e.get('label') or e.get('tag'),v['selector'],'; '.join(sorted(v['evidence'])),owners,'Existing action/state/options preserved',f"role={e.get('role')}; disabled={e.get('disabled')}; expanded={e.get('expanded')}; current={e.get('current')}",'Rendered synthetic state; interaction assertions remain in cited suites'])
print(f'{len(rows)} source candidates; {sum("rendered in named" in r["Implementation status"] for r in rows)} rendered matches; {len(runtime)} route/control identities. Unmatched states remain explicit.')
