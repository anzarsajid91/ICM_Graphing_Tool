"""Historical evidence maintenance must be manual and incapable of deletion."""
import contextlib
import io
import json
import os
from pathlib import Path
import re
import runpy
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'scripts/purge_retired_reference_evidence.py'
REPO = 'anzarsajid91/ICM_Graphing_Tool'
OLD, SYNTHETIC = 'a' * 40, 'b' * 40
DATE = '2026-10-17T00:00:00Z'


class EvidenceInventoryTests(unittest.TestCase):
    def run_inventory(self, *, truncated=False, args=()):
        calls = []

        def transport(request, timeout):
            url = urlsplit(request.full_url)
            calls.append((request.get_method(), url.path))
            self.assertEqual(url.netloc, 'api.github.com')
            self.assertEqual(request.get_method(), 'GET', 'Evidence inventory attempted a mutation')
            self.assertEqual(timeout, 60)
            path = url.path.removeprefix('/repos/' + REPO)
            page = parse_qs(url.query).get('page', ['1'])[0]
            artifact = lambda number, name, sha=OLD, **kw: dict(
                id=number, name=name, created_at=DATE, expired=False,
                workflow_run={'head_sha': sha}, **kw)
            if path == '/actions/artifacts':
                payload = {'artifacts': [] if page != '1' else [
                    artifact(111, 'retired-evidence'), artifact(112, 'precision-preview'),
                    artifact(113, 'github-pages'), artifact(114, 'synthetic-evidence', SYNTHETIC)]}
            elif path == '/actions/runs':
                payload = {'workflow_runs': [] if page != '1' else [
                    {'id': 201, 'head_sha': OLD, 'created_at': DATE, 'status': 'completed'},
                    {'id': 202, 'head_sha': SYNTHETIC, 'created_at': DATE, 'status': 'completed'},
                    {'id': 203, 'head_sha': OLD, 'created_at': DATE, 'status': 'in_progress'}]}
            elif path.startswith('/git/commits/'):
                payload = {'tree': {'sha': path.rsplit('/', 1)[1]}}
            elif path.startswith('/git/trees/'):
                sha = path.rsplit('/', 1)[1]
                payload = {'truncated': truncated, 'tree': [
                    {'path': 'reference/current-tool/sample-data/synthetic.csv', 'type': 'blob', 'sha': 'c' * 40}]}
                if sha == SYNTHETIC:
                    payload['tree'].append({'path': 'reference/current-tool/synthetic-manifest.json', 'type': 'blob', 'sha': 'd' * 40})
            elif path == '/actions/workflows/reference-evidence-cleanup.yml/runs':
                payload = {'workflow_runs': []}  # Old implementation must still fail on its DELETE.
            else:
                self.fail('Unexpected inventory endpoint: ' + path)
            return io.BytesIO(json.dumps(payload).encode())

        output = io.StringIO()
        with patch.dict(os.environ, {'GH_TOKEN': 'synthetic-token', 'GITHUB_REPOSITORY': REPO,
                                    'GITHUB_RUN_ID': '999', 'REFERENCE_UPLOAD_NOT_BEFORE': '2026-09-20T13:11:47Z'}), \
             patch('sys.argv', [str(SCRIPT), *args]), \
             patch('urllib.request.urlopen', side_effect=transport), contextlib.redirect_stdout(output):
            runpy.run_path(str(SCRIPT), run_name='__main__')
        return json.loads(output.getvalue()), calls

    def test_real_candidate_inventory_cannot_delete_artifacts_or_logs(self):
        report, calls = self.run_inventory()
        self.assertTrue(report['read_only'])
        self.assertEqual(report['candidate_artifact_ids'], [111])
        self.assertEqual(report['candidate_run_ids'], [201])
        self.assertEqual(report['deleted_artifacts'], 0)
        self.assertEqual(report['deleted_run_logs'], 0)
        self.assertTrue(calls)
        self.assertTrue(all(method == 'GET' for method, _ in calls))

    def test_delete_flag_is_rejected_before_network_access(self):
        with patch('sys.argv', [str(SCRIPT), '--delete']), patch('urllib.request.urlopen') as network, \
             contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            runpy.run_path(str(SCRIPT), run_name='__main__')
        self.assertEqual(error.exception.code, 2)
        network.assert_not_called()

    def test_incomplete_history_tree_does_not_produce_success(self):
        with self.assertRaisesRegex(ValueError, 'Incomplete tree'):
            self.run_inventory(truncated=True)

    def test_workflow_is_manual_read_only_and_main_only(self):
        workflow = (ROOT / '.github/workflows/reference-evidence-cleanup.yml').read_text()
        trigger = re.search(r'^on:\s*\n(.*?)^permissions:', workflow, re.M | re.S)
        self.assertIsNotNone(trigger)
        self.assertEqual(trigger.group(1).strip(), 'workflow_dispatch:')
        self.assertNotRegex(workflow, r'actions:\s*write|contents:\s*write')
        self.assertIn('actions: read', workflow)
        self.assertIn("github.event_name == 'workflow_dispatch'", workflow)
        self.assertIn("github.ref == 'refs/heads/main'", workflow)


if __name__ == '__main__':
    unittest.main()
