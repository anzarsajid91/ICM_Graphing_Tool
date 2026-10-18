"""Read-only inventory of Actions evidence associated with retired fixtures.

The historical filename is retained for existing references. Deletion and run
cancellation are unavailable, including when invoked directly. This repository
administration tool is never imported by the browser application. It reads Git
metadata, not engineering file contents or historical log/artifact contents.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
import urllib.request

REPO = 'anzarsajid91/ICM_Graphing_Tool'
BASE = 'https://api.github.com/repos/' + REPO
EMPTY = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'


def request(path):
    # GET is fixed: this helper has no method/body argument or mutation endpoint.
    req = urllib.request.Request(BASE + path, method='GET', headers={
        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    })
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read())


def original_sources(sha):
    commit = request('/git/commits/' + sha)
    tree = request('/git/trees/' + commit['tree']['sha'] + '?recursive=1')
    if tree.get('truncated'):
        raise ValueError('Incomplete tree: inventory classification unavailable')
    paths = {entry['path']: entry for entry in tree['tree']}
    synthetic = 'reference/current-tool/synthetic-manifest.json' in paths
    populated = any(entry['type'] == 'blob' and entry['sha'] != EMPTY and
                    (path.startswith('reference/current-tool/sample-data/') or
                     path.startswith('reference/current-tool/reports/'))
                    for path, entry in paths.items())
    return sha, populated and not synthetic


def pages(path, key):
    page = 1
    while True:
        rows = request(path + f'?per_page=100&page={page}')[key]
        if not rows:
            break
        yield from rows
        page += 1


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    if os.environ.get('GITHUB_REPOSITORY') != REPO:
        raise ValueError('Inventory is restricted to the configured repository')
    earliest = os.environ['REFERENCE_UPLOAD_NOT_BEFORE']
    artifacts = [artifact for artifact in pages('/actions/artifacts', 'artifacts')
                 if not artifact['expired'] and artifact['created_at'] >= earliest
                 and artifact['name'] != 'github-pages' and 'preview' not in artifact['name']]
    runs = []
    for run in pages('/actions/runs', 'workflow_runs'):
        if run['created_at'] < earliest:
            break
        if run['status'] == 'completed':
            runs.append(run)
    heads = {artifact['workflow_run']['head_sha'] for artifact in artifacts}
    heads.update(run['head_sha'] for run in runs)
    with ThreadPoolExecutor(max_workers=8) as pool:
        classified = dict(pool.map(original_sources, sorted(heads)))
    print(json.dumps({
        'read_only': True,
        'classified_heads': len(heads),
        'candidate_artifact_ids': sorted(artifact['id'] for artifact in artifacts
                                         if classified[artifact['workflow_run']['head_sha']]),
        'candidate_run_ids': sorted(run['id'] for run in runs if classified[run['head_sha']]),
        'deleted_artifacts': 0,
        'deleted_run_logs': 0,
        'limitation': 'Metadata classification only; it does not establish data authenticity or authorise deletion.',
    }), flush=True)


if __name__ == '__main__':
    main()
