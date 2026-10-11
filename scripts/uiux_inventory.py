"""Inventory source selector candidates; runtime capture completes conditional ownership.
Never treats static discovery as browser verification or full interactive coverage.
"""
from pathlib import Path
import re, csv
ROOT=Path(__file__).resolve().parents[1]
paths=[ROOT/'web/index.html', *sorted((ROOT/'web/assets').glob('*.js'))]
records={}
for p in paths:
    s=p.read_text()
    for pattern,kind in [(r'\bid=["\']([\w-]+)["\']','id'),(r'data-([\w-]+)(?:=["\']([^"\']*)["\'])?','data')]:
        for m in re.finditer(pattern,s):
            selector=('[id^="'+m[1]+'"]' if m[1].endswith('-') else '#'+m[1]) if kind=='id' else '[data-'+m[1]+']'
            record=records.setdefault(selector,{'owners':set(),'kind':kind})
            record['owners'].add(p.relative_to(ROOT).as_posix())
    for m in re.finditer(r'<(button|input|select|textarea|summary|dialog|table)\b([^>]*)>',s,re.I):
        # Include unnamed/dynamic controls that cannot be found by a static ID.
        attrs=m[2]
        if re.search(r'\bid=',attrs):continue
        cls=re.search(r'class=["\']([^"\']+)',attrs)
        classes=[c for c in (cls[1].split() if cls else []) if re.fullmatch(r'[a-zA-Z_][\w-]*',c)]
        selector=m[1]+(''.join('.'+c for c in classes) if classes else '')
        record=records.setdefault(selector,{'owners':set(),'kind':'dynamic markup'})
        record['owners'].add(p.relative_to(ROOT).as_posix())
out=ROOT/'docs/uiux/coverage-matrix.csv'
with out.open('w',newline='') as f:
    w=csv.writer(f,lineterminator="\n")
    w.writerow(['Workspace / route','Component','DOM selector candidate','Owning sources','Existing functionality','Proposed treatment','Interaction contract','State dependencies','Accessibility requirements','Regression tests','Implementation status','Verification evidence'])
    for selector,r in sorted(records.items()):
        owners='; '.join(sorted(r['owners']))
        workspace=('Network Schematic' if 'network-schematic' in owners else 'Detriment' if 'detriment-workspace' in owners else 'Flow Survey / Monthly Review' if 'workflow-26' in owners or 'workbench-survey' in owners else 'Global / shared / route ownership pending runtime inventory')
        w.writerow([workspace,r['kind'],selector,owners,'Preserve existing action/value/state','Shared native controls/surface/type tokens','Retain IDs, handlers, options and source bytes','Empty, loaded, busy, stale, error, partial; conditional runtime review required','Name, keyboard, visible focus, semantic state; colour-independent evidence','Existing smoke/unit suites + uiux-review; per-state browser evidence pending','Source owner reviewed; shared tokens applied; interaction/state verification pending','Static source discovery only'])
print(f'{len(records)} selector candidates; runtime ownership/state verification remains required')
