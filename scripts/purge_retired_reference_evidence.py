"""Remove retained Actions outputs from runs containing retired source fixtures.

Only repository administration; never imported by the application. The current
deployment and static Pages/preview artifacts are excluded. Run records remain.
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
import os
import urllib.error
import urllib.request

REPO = 'anzarsajid91/ICM_Graphing_Tool'
BASE = 'https://api.github.com/repos/' + REPO
TOKEN = os.environ['GH_TOKEN']
EARLIEST_UPLOAD = os.environ['REFERENCE_UPLOAD_NOT_BEFORE']
EMPTY = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'
cache = {}


def request(path, method='GET'):
    req = urllib.request.Request(BASE + path, method=method, headers={
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    })
    with urllib.request.urlopen(req, timeout=60) as response:
        body = response.read()
        return json.loads(body) if body else None


def original_sources(sha):
    if sha not in cache:
        commit = request('/git/commits/' + sha)
        tree = request('/git/trees/' + commit['tree']['sha'] + '?recursive=1')
        assert not tree.get('truncated'), 'Incomplete tree: refuse uncertain deletion'
        paths = {e['path']: e for e in tree['tree']}
        synthetic = 'reference/current-tool/synthetic-manifest.json' in paths
        populated = any(e['type'] == 'blob' and e['sha'] != EMPTY and
                        (p.startswith('reference/current-tool/sample-data/') or
                         p.startswith('reference/current-tool/reports/'))
                        for p, e in paths.items())
        cache[sha] = populated and not synthetic
    return cache[sha]


def pages(path, key):
    page = 1
    while True:
        rows = request(path + f'?per_page=100&page={page}')[key]
        if not rows:
            break
        yield from rows
        page += 1


if __name__ == '__main__':
    assert os.environ['GITHUB_REPOSITORY'] == REPO
    # Stop superseded copies of this one-off maintenance job only.
    own_run = int(os.environ['GITHUB_RUN_ID'])
    older = request('/actions/workflows/reference-evidence-cleanup.yml/runs?per_page=100')['workflow_runs']
    for run in older:
        if run['id'] != own_run and run['status'] in ('in_progress', 'queued', 'pending'):
            try:
                request('/actions/runs/' + str(run['id']) + '/cancel', 'POST')
            except urllib.error.HTTPError as error:
                if error.code not in (409, 422):
                    raise
    # Gather before deleting so pagination cannot skip entries as the list shrinks.
    artifacts = list(pages('/actions/artifacts', 'artifacts'))
    candidates = [a for a in artifacts
                  if not a['expired'] and a['created_at'] >= EARLIEST_UPLOAD
                  and a['name'] != 'github-pages' and 'preview' not in a['name']]
    runs = []
    for run in pages('/actions/runs', 'workflow_runs'):
        if run['created_at'] < EARLIEST_UPLOAD:
            break
        if run['status'] == 'completed':
            runs.append(run)
    heads = {a['workflow_run']['head_sha'] for a in candidates}
    heads.update(r['head_sha'] for r in runs)
    # Classifications are read-only and deduplicated before any deletion.
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(original_sources, sorted(heads)))
    retired_artifacts = [a for a in candidates if cache[a['workflow_run']['head_sha']]]
    retired_runs = [r for r in runs if cache[r['head_sha']]]
    print(json.dumps({'classified_heads': len(heads),
                      'remaining_retired_artifacts': len(retired_artifacts),
                      'retired_runs_to_clear': len(retired_runs)}), flush=True)

    def delete_artifact(artifact):
        request('/actions/artifacts/' + str(artifact['id']), 'DELETE')
        return 1

    def delete_logs(run):
        try:
            request('/actions/runs/' + str(run['id']) + '/logs', 'DELETE')
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            return 0
        return 1

    # Independent evidence objects; a small pool keeps request concurrency low.
    with ThreadPoolExecutor(max_workers=4) as pool:
        deleted_artifacts = sum(pool.map(delete_artifact, retired_artifacts))
        print(json.dumps({'retired_reference_artifacts_deleted': deleted_artifacts}), flush=True)
        deleted_logs = sum(pool.map(delete_logs, retired_runs))
    print(json.dumps({'retired_reference_artifacts_deleted': deleted_artifacts,
                      'retired_reference_run_logs_deleted': deleted_logs,
                      'current_deployment_and_static_site_artifacts_preserved': True}), flush=True)
