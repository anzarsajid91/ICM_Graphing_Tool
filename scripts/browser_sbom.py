"""CycloneDX browser inventory with vendored hashes; not a vulnerability verdict."""
import json
from pathlib import Path
manifest = json.loads(Path('web/vendor/manifest.json').read_text())
components = [{'type': 'library', 'name': name, 'version': value['version'],
               'externalReferences': [{'type': 'distribution', 'url': value['source']}]}
              for name, value in manifest['dependencies'].items()]
for item in manifest['files']:
    if item['path'].endswith('.whl'):
        name, version = item['path'].rsplit('/', 1)[-1].split('-')[:2]
        components.append({'type': 'library', 'name': name, 'version': version,
                           'purl': 'pkg:pypi/'+name.replace('_', '-')+'@'+version})

    components.append({'type': 'file', 'name': item['path'],
                       'hashes': [{'alg': 'SHA-256', 'content': item['sha256']}]})
lock = json.loads(Path('package-lock.json').read_text())
for name, value in lock['packages'].items():
    if name:
        components.append({'type': 'library', 'name': name.removeprefix('node_modules/'),
                           'version': value['version'], 'scope': 'optional'})
for name, revision in json.loads(Path('security/action-pins.json').read_text())['refs'].items():
    components.append({'type': 'application', 'name': name, 'version': revision})
print(json.dumps({'bomFormat': 'CycloneDX', 'specVersion': '1.6', 'version': 1,
                  'metadata': {'component': {'type': 'application', 'name': 'Hydra Bench browser build'}},
                  'components': components}, indent=2))
