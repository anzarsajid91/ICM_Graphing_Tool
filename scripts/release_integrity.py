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


def served_entries(manifest):
    if manifest.get('schema') != 2:
        raise ValueError('Unsupported artifact integrity schema')
    files = manifest['files']
    # Pages consumes this empty build-control file; it is not an HTTP resource.
    # No other file, including other dotfiles, may acquire this classification.
    controls = {'.nojekyll': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'} if '.nojekyll' in files else {}
    if manifest.get('deployment_controls') != controls or any(files[k] != v for k, v in controls.items()):
        raise ValueError('Invalid deployment control classification')
    return {name: digest for name, digest in files.items() if name not in controls}


def write_manifest(site):
    metadata = json.loads((site/'build.json').read_text())
    files = entries(site)
    manifest = {
        'schema': 2, 'commit': metadata['commit'], 'app_version': metadata['app_version'],
        'files': files,
        'deployment_controls': {'.nojekyll': files['.nojekyll']} if '.nojekyll' in files else {}}
    served_entries(manifest)
    (site/'release-integrity.json').write_text(json.dumps(manifest, indent=2)+'\n')


def verify(site):
    manifest = json.loads((site/'release-integrity.json').read_text())
    metadata = json.loads((site/'build.json').read_text())
    served_entries(manifest)
    if manifest['files'] != entries(site):
        raise ValueError('Release artifact files do not match the integrity manifest')
    if any(manifest[k] != metadata[k] for k in ('commit', 'app_version')):
        raise ValueError('Release identity mismatch')
    print(f'Artifact integrity: {len(manifest["files"])} files; {manifest["commit"]}')


if __name__ == '__main__':
    verify(Path(sys.argv[1]))
