"""Deterministic local artifact integrity, excluding the manifest itself.

Hashes detect corruption and mixed assets; they are not a signature or approval.
"""
import hashlib
import json
import sys
from pathlib import Path


def entries(site):
    return {p.relative_to(site).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(site.rglob('*')) if p.is_file() and p != site/'release-integrity.json'}


def write_manifest(site):
    metadata = json.loads((site/'build.json').read_text())
    (site/'release-integrity.json').write_text(json.dumps({
        'schema': 1, 'commit': metadata['commit'], 'app_version': metadata['app_version'],
        'files': entries(site)}, indent=2)+'\n')


def verify(site):
    manifest = json.loads((site/'release-integrity.json').read_text())
    metadata = json.loads((site/'build.json').read_text())
    if manifest['files'] != entries(site):
        raise ValueError('Release artifact files do not match the integrity manifest')
    if any(manifest[k] != metadata[k] for k in ('commit', 'app_version')):
        raise ValueError('Release identity mismatch')
    print(f'Artifact integrity: {len(manifest["files"])} files; {manifest["commit"]}')


if __name__ == '__main__':
    verify(Path(sys.argv[1]))
