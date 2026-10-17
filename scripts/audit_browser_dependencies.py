"""Audit public package identities; preserve raw matches and fail on unresolved findings.

CI only. Never pass user data to this scanner. A bounded applicability review is
not a general advisory ignore: changed bytes/version/advisory or a new ID fails.
"""
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def disposition(vulnerability, ecosystem, name, version, root=ROOT):
    review = json.loads((root/'security/dependency-applicability.json').read_text())
    package = review['package']
    if (ecosystem, name, version) != (package['ecosystem'], package['name'], package['vendor_version']):
        return 'unresolved'
    path = root/package['path']
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != package['sha256']:
        return 'unresolved'
    fields = {key: vulnerability.get(key) for key in ['id', 'modified', 'details', 'affected']}
    for record in review['advisories']:
        if record['id'] == vulnerability.get('id') and record['reviewed_fields'] == fields:
            return record['disposition']
    return 'unresolved'


def main():
    manifest = json.loads((ROOT/'web/vendor/manifest.json').read_text())
    packages = [('npm', 'plotly.js', manifest['dependencies']['Plotly']['version']),
                ('npm', 'xlsx', manifest['dependencies']['SheetJS']['version'])]
    for item in manifest['files']:
        if item['path'].endswith('.whl'):
            name, version = item['path'].rsplit('/', 1)[-1].split('-')[:2]
            packages.append(('PyPI', name.replace('_', '-'), version))
    # The WASM interpreter/stdlib are not the PyPI namespace named pyodide.
    results = []
    for ecosystem, name, version in packages:
        payload = json.dumps({'package': {'ecosystem': ecosystem, 'name': name}, 'version': version}).encode()
        request = urllib.request.Request('https://api.osv.dev/v1/query', data=payload,
                                         headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=60) as response:
            report = json.load(response)
        findings = [{'id': v['id'], 'disposition': disposition(v, ecosystem, name, version),
                     'raw_advisory': v} for v in report.get('vulns', [])]
        results.append({'ecosystem': ecosystem, 'name': name, 'version': version, 'findings': findings})
    Path('browser-dependency-audit.json').write_text(json.dumps(results, indent=2)+'\n')
    if any(f['disposition'] != 'not_affected' for row in results for f in row['findings']):
        raise SystemExit('Unresolved browser advisories; review and remediate before release.')
    print('No unresolved indexed advisories; reviewed matches retained. WASM coverage is separate.')


if __name__ == '__main__':
    main()
