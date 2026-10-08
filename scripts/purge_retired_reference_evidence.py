"""Remove retained Actions outputs from runs containing retired source fixtures.

Only repository administration; never imported by the application. The current
deployment and static Pages/preview artifacts are excluded. Run records remain.
"""
from __future__ import annotations

import json
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
    # Gather before deleting so pagination cannot skip entries as the list shrinks.
    artifacts = list(pages('/actions/artifacts', 'artifacts'))
    deleted_artifacts = 0
    for artifact in artifacts:
        name = artifact['name']
        if (artifact['expired'] or artifact['created_at'] < EARLIEST_UPLOAD or
                name == 'github-pages' or 'preview' in name):
            continue
        if original_sources(artifact['workflow_run']['head_sha']):
            request('/actions/artifacts/' + str(artifact['id']), 'DELETE')
            deleted_artifacts += 1
    deleted_logs = 0
    for run in pages('/actions/runs', 'workflow_runs'):
        if run['created_at'] < EARLIEST_UPLOAD:
            break
        if run['status'] != 'completed':
            continue
        if original_sources(run['head_sha']):
            try:
                request('/actions/runs/' + str(run['id']) + '/logs', 'DELETE')
            except urllib.error.HTTPError as error:
                if error.code != 404:
                    raise
            else:
                deleted_logs += 1
    print(json.dumps({'retired_reference_artifacts_deleted': deleted_artifacts,
                      'retired_reference_run_logs_deleted': deleted_logs,
                      'current_deployment_and_static_site_artifacts_preserved': True}))
