"""Deterministic local artifact integrity, excluding the manifest itself.

Hashes detect corruption and mixed assets; they are not a signature or approval.
"""
import hashlib
import argparse
import json
import tarfile
from pathlib import Path, PurePosixPath


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


def verify_pages_tar(site, archive):
    verify(site)
    manifest = json.loads((site/'release-integrity.json').read_text())
    expected = {**served_entries(manifest), 'release-integrity.json':
                hashlib.sha256((site/'release-integrity.json').read_bytes()).hexdigest()}
    actual = {}
    with tarfile.open(archive, 'r:') as bundle:
        for member in bundle.getmembers():
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or '\\' in member.name:
                raise ValueError('Unsafe Pages package path')
            if member.isdir():
                continue
            if not member.isfile():
                raise ValueError('Non-regular Pages package entry')
            relative = name.as_posix()
            if relative in actual:
                raise ValueError('Duplicate Pages package entry')
            with bundle.extractfile(member) as content:
                actual[relative] = hashlib.file_digest(content, 'sha256').hexdigest()
    if actual != expected:
        raise ValueError('Pages package files do not match the tested HTTP assets and manifest')
    print(f'Pages publication archive verified: {len(actual)} files; {manifest["commit"]}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('site', type=Path)
    parser.add_argument('--pages-tar', type=Path)
    args = parser.parse_args()
    if args.pages_tar:
        verify_pages_tar(args.site, args.pages_tar)
    else:
        verify(args.site)
