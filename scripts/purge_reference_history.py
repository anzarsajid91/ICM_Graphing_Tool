"""Selectively purge retired reference blobs in an isolated Git checkout.

Never uploads source data or changes application/fixture bytes. Publication uses
the caller's existing checkout credentials and an exact-head force-with-lease.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = [
    'docs/post-pr25-implementation-ledger.md',
    'docs/reference-graph-report-review.md',
    'docs/reference/current-tool-graph-report-contract.md',
    'docs/icm-buddy-reference-validation.md',
    'docs/fastpath-performance.md',
    'tests/unit/test_parsers.py',
]


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


def run(root, *args):
    subprocess.run(args, cwd=root, check=True)


def entries(root, revision, *paths):
    output = git(root, 'ls-tree', '-r', '-z', revision, '--', *paths)
    return {entry.split('\t', 1)[1]: entry.split('\t', 1)[0].split()[2]
            for entry in output.split('\0') if entry}


def protected(root):
    return entries(root, 'HEAD', 'web', 'src', 'reference', 'app.py')


def version(root):
    return json.loads(subprocess.check_output(
        [sys.executable, '-c', 'import json;from scripts.app_version import release_version;'
         'print(json.dumps(release_version()))'], cwd=root, text=True))


def prepare(source, destination):
    old_head = git(source, 'rev-parse', 'HEAD')
    before = protected(source)
    before_version = version(source)
    paths = ['reference/current-tool', *EVIDENCE]
    current = set(entries(source, old_head, *paths).values())
    current_paths = set(entries(source, old_head, 'reference/current-tool'))
    retired = set()
    retired_names = set()
    for commit in git(source, 'rev-list', old_head, '--', *paths).splitlines():
        retired.update(entries(source, commit, *paths).values())
        for path in entries(source, commit, 'reference/current-tool'):
            if path not in current_paths and not path.endswith('.gitkeep'):
                name = Path(path).name
                retired_names.add(name.encode())
                prefix = name.split('_')[0]
                if len(prefix) >= 6:
                    retired_names.add(prefix.encode())
    # Empty .gitkeep objects are shared by unrelated directories.
    empty = hashlib.sha1(b'blob 0\0').hexdigest()
    retired.difference_update(current | {empty})
    # Retire obsolete reference-reading helper snapshots;
    # they can retain filenames and measured expectations after raw-file removal.
    # Every current file remains protected, including current test helpers.
    protected_current = set(entries(source, old_head).values())
    inspected = {}
    helper_roots = ['scripts', 'tests', 'web/tests', 'docs', '.github/workflows']
    for commit in git(source, 'rev-list', old_head, '--', *helper_roots).splitlines():
        for path, sha in entries(source, commit, *helper_roots).items():
            if sha in protected_current or not path.endswith(('.py', '.mjs', '.md', '.json', '.yml')):
                continue
            if sha not in inspected:
                content = subprocess.check_output(['git', '-C', str(source), 'cat-file', 'blob', sha])
                inspected[sha] = b'current-tool' in content
            if inspected[sha]:
                retired.add(sha)
    paths.extend(helper_roots)
    if not retired:
        print(json.dumps({'status': 'already-clean', 'retired_blobs': 0}))
        return old_head, False
    first_affected = next(commit for commit in
        git(source, 'rev-list', '--reverse', old_head, '--', *paths).splitlines()
        if retired.intersection(entries(source, commit, *paths).values()))
    parents = git(source, 'show', '-s', '--format=%P', first_affected).split()
    assert len(parents) == 1, 'Earliest reference evidence needs manual ancestry review'
    safe_parent = parents[0]
    destination.mkdir()
    run(destination, 'git', 'init', '-q', '-b', 'cleanup-empty')
    run(destination, 'git', 'fetch', '-q', '--no-tags', str(source),
        f'{old_head}:refs/heads/main')
    run(destination, 'git', 'checkout', '-q', 'main')
    blob_file = destination.parent / 'retired-blobs.txt'
    blob_file.write_text('\n'.join(sorted(retired)) + '\n')
    run(destination, sys.executable, '-m', 'git_filter_repo', '--force',
        '--sensitive-data-removal', '--no-fetch', '--refs', f'{safe_parent}..refs/heads/main',
        '--strip-blobs-with-ids', str(blob_file), '--message-callback',
        'for token in ' + repr(sorted(retired_names, key=len, reverse=True)) +
        ':\n    message = message.replace(token, b"retired reference")\nreturn message')
    mapping = {}
    for line in (destination / '.git/filter-repo/commit-map').read_text().splitlines()[1:]:
        old, new = line.split()
        if new != '0' * 40:
            mapping[old] = new
    # Versioning and historical benchmark checkouts use actual commit identities.
    # Resolve short hashes too; no application source is rewritten.
    for path in [destination / 'release-history.json',
                 *(destination / '.github/workflows').glob('*.yml'),
                 *(destination / 'docs').rglob('*.md')]:
        original = path.read_text()
        def replace(match):
            value = match.group(0)
            try:
                full = subprocess.check_output(
                    ['git', '-C', str(source), 'rev-parse', '--verify', f'{value}^{{commit}}'],
                    text=True, stderr=subprocess.DEVNULL).strip()
            except subprocess.CalledProcessError:
                return value
            return mapping.get(full, value)
        changed = re.sub(r'\b[0-9a-f]{7,40}\b', replace, original)
        if changed != original:
            path.write_text(changed)
    identity = json.loads(git(source, 'log', '-1', '--format={"name":"%an","email":"%ae"}'))
    # This one-off workflow must disappear from the published clean tree so a
    # force update cannot automatically trigger another rewrite.
    (destination / '.github/workflows/reference-history-cleanup.yml').unlink(missing_ok=True)
    run(destination, 'git', 'config', 'user.name', identity['name'])
    run(destination, 'git', 'config', 'user.email', identity['email'])
    run(destination, 'git', 'add', 'release-history.json', '.github/workflows', 'docs')
    if git(destination, 'diff', '--cached', '--name-only'):
        run(destination, 'git', 'commit', '-q', '-m',
            'Remap release and benchmark identities after reference-data purge')
    assert protected(destination) == before, 'Application or synthetic fixture bytes changed'
    assert git(destination, 'rev-parse', safe_parent) == safe_parent, 'Untainted prefix changed'
    assert version(destination) == before_version, 'Published version changed'
    reachable = {line.split()[0] for line in
                 git(destination, 'rev-list', '--objects', 'main').splitlines()}
    assert not (retired & reachable), 'Retired reference evidence remains reachable'
    messages = git(destination, 'log', '--format=%B', 'main').encode()
    assert not any(name in messages for name in retired_names), 'Retired filename remains in commit message'
    ledger = json.loads((destination / 'release-history.json').read_text())
    git(destination, 'merge-base', '--is-ancestor', ledger['baseline_commit'], 'HEAD')
    for item in ledger['merged_prs']:
        git(destination, 'cat-file', '-e', item['commit'] + '^{commit}')
    run(destination, sys.executable, 'scripts/verify_data_confidentiality.py')
    run(destination, sys.executable, '-m', 'unittest', 'discover', '-s', 'tests/privacy', '-v')
    run(destination, 'node', 'web/tests/privacy-network-unit.mjs')
    run(destination, sys.executable, '-m', 'pytest')
    run(destination, sys.executable, 'scripts/build_pages.py')
    new_head = git(destination, 'rev-parse', 'HEAD')
    summary = {'status': 'verified', 'retired_blobs': len(retired),
               'version': before_version['app_version'], 'head': new_head,
               'application_and_synthetic_fixtures_unchanged': True}
    (destination.parent / 'cleanup-verification.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary))
    return new_head, True


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--destination', type=Path, required=True)
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    source_head = git(ROOT, 'rev-parse', 'HEAD')
    clean_head, changed = prepare(ROOT, args.destination.resolve())
    if args.publish and changed:
        # Refuse extra branches/tags; they require separate explicit treatment.
        refs = git(ROOT, 'ls-remote', '--heads', '--tags', 'origin').splitlines()
        assert len(refs) == 1 and refs[0].split()[1] == 'refs/heads/main', 'Unexpected refs'
        assert refs[0].split()[0] == source_head, 'Remote main changed during cleanup'
        run(ROOT, 'git', 'fetch', '-q', str(args.destination.resolve()), clean_head)
        run(ROOT, 'git', 'push', f'--force-with-lease=refs/heads/main:{source_head}',
            'origin', f'{clean_head}:refs/heads/main')
        print('Verified selective history cleanup published to main.')
