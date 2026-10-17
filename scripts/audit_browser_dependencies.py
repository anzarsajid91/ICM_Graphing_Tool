"""Query OSV using public package identities only; fail closed on errors/findings.

Not loaded by the browser. Do not add file contents or project metadata here.
"""
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT/'web/vendor/manifest.json').read_text())
packages = [('npm', 'plotly.js', manifest['dependencies']['Plotly']['version']),
            ('npm', 'xlsx', manifest['dependencies']['SheetJS']['version'])]
for item in manifest['files']:
    if item['path'].endswith('.whl'):
        name, version = item['path'].rsplit('/', 1)[-1].split('-')[:2]
        packages.append(('PyPI', name.replace('_', '-'), version))
# Pyodide's WASM interpreter/stdlib are a distribution, not the PyPI pyodide
# namespace. Do not create a false coverage assertion by querying that package.
results = []
for ecosystem, name, version in packages:
    payload = json.dumps({'package': {'ecosystem': ecosystem, 'name': name}, 'version': version}).encode()
    request = urllib.request.Request('https://api.osv.dev/v1/query', data=payload,
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        report = json.load(response)
    results.append({'ecosystem': ecosystem, 'name': name, 'version': version,
                    'vulnerabilities': [v['id'] for v in report.get('vulns', [])]})
Path('browser-dependency-audit.json').write_text(json.dumps(results, indent=2)+'\n')
if any(row['vulnerabilities'] for row in results):
    raise SystemExit('Browser dependency advisories found; review and remediate before release.')
print('No indexed advisories returned for these identities; WASM applicability requires review.')
