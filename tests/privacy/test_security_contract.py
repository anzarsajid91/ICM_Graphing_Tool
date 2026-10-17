import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts'))
from release_integrity import write_manifest, verify
from verify_security_claims import verify_claims


class SecurityContractTests(unittest.TestCase):
    def test_claim_evidence_matches(self):
        verify_claims(ROOT)

    def test_claim_evidence_change_fails(self):
        import shutil
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            register = json.loads((ROOT/'security/claims.json').read_text())
            for rel in ['security/claims.json', *register['evidence_sha256']]:
                target = root/rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT/rel, target)
            (root/'web/assets/analysis-worker.js').write_text('changed evidence')
            with self.assertRaisesRegex(ValueError, 'evidence changed'):
                verify_claims(root)

    def test_canonical_bytes_survive_autocrlf_checkout(self):
        import subprocess
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'.gitattributes').write_bytes((ROOT/'.gitattributes').read_bytes())
            source = root/'web/assets/synthetic.js'
            vendor = root/'web/vendor/synthetic.bin'
            source.parent.mkdir(parents=True)
            vendor.parent.mkdir(parents=True)
            source.write_bytes(b'const synthetic = 1;\n')
            vendor.write_bytes(b'fixed\r\nbytes\x00')
            for command in [
                ['git', 'init', '-q'],
                ['git', '-c', 'core.autocrlf=true', 'add', '.'],
                ['git', '-c', 'core.autocrlf=true', 'checkout-index', '--all', '--force', '--prefix=out/'],
            ]:
                subprocess.run(command, cwd=root, check=True, capture_output=True)
            self.assertEqual((root/'out/web/assets/synthetic.js').read_bytes(), source.read_bytes())
            self.assertEqual((root/'out/web/vendor/synthetic.bin').read_bytes(), vendor.read_bytes())

    def test_artifact_tamper_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp)
            (site/'build.json').write_text(json.dumps({'commit':'synthetic','app_version':'v1.000'}))
            (site/'index.html').write_text('synthetic')
            write_manifest(site)
            verify(site)
            (site/'index.html').write_text('tampered')
            with self.assertRaisesRegex(ValueError, 'artifact files'):
                verify(site)

    def test_missing_hidden_artifact_file_fails(self):
        # upload-artifact must retain .nojekyll; omitting it is not an exact build.
        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp)
            (site/'build.json').write_text(json.dumps({'commit':'synthetic','app_version':'v1.000'}))
            (site/'index.html').write_text('synthetic')
            hidden = site/'.nojekyll'
            hidden.touch()
            write_manifest(site)
            verify(site)
            hidden.unlink()
            with self.assertRaisesRegex(ValueError, 'artifact files'):
                verify(site)

    def test_deployment_control_is_explicit_not_a_served_asset(self):
        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp)
            (site/'build.json').write_text(json.dumps({'commit':'synthetic','app_version':'v1.000'}))
            (site/'index.html').write_text('synthetic')
            (site/'.nojekyll').touch()
            (site/'.hidden.js').write_text('fixed synthetic asset')
            write_manifest(site)
            manifest = json.loads((site/'release-integrity.json').read_text())
            self.assertEqual(manifest['schema'], 2)
            self.assertEqual(manifest['deployment_controls'], {
                '.nojekyll': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'})
            from release_integrity import served_entries
            served = served_entries(manifest)
            self.assertNotIn('.nojekyll', served)
            self.assertIn('index.html', served)
            self.assertIn('.hidden.js', served)
            for field, value in [
                ('schema', 1),
                ('deployment_controls', {}),
                ('deployment_controls', {'.nojekyll':'0' * 64}),
                ('deployment_controls', {'.hidden.js':manifest['files']['.hidden.js']}),
            ]:
                invalid = {**manifest, field:value}
                (site/'release-integrity.json').write_text(json.dumps(invalid))
                with self.assertRaises(ValueError):
                    verify(site)
            manifest['deployment_controls']['index.html'] = manifest['files']['index.html']
            (site/'release-integrity.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'deployment control'):
                verify(site)

    def test_nonempty_deployment_control_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp)
            (site/'build.json').write_text(json.dumps({'commit':'synthetic','app_version':'v1.000'}))
            (site/'.nojekyll').write_text('unexpected content')
            with self.assertRaisesRegex(ValueError, 'deployment control'):
                write_manifest(site)

    def test_live_resources_require_every_http_asset_not_deployment_controls(self):
        from contextlib import contextmanager
        from types import SimpleNamespace
        from unittest.mock import patch
        from urllib.error import HTTPError
        from urllib.parse import urlsplit
        from verify_live_integrity import verify as verify_live
        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp)
            commit = '0' * 40
            (site/'build.json').write_text(json.dumps({'commit':commit,'app_version':'v1.000'}))
            (site/'index.html').write_text('synthetic')
            (site/'.hidden.js').write_text('fixed synthetic asset')
            (site/'.nojekyll').touch()
            write_manifest(site)
            remote = {p.name:p.read_bytes() for p in site.iterdir() if p.name != '.nojekyll'}
            requested = []
            @contextmanager
            def open_resource(url, timeout):
                relative = urlsplit(url).path.removeprefix('/app/')
                requested.append(relative)
                if relative not in remote:
                    raise HTTPError(url, 404, 'Not served', {}, None)
                yield SimpleNamespace(url=url, read=lambda:remote[relative])
            with patch('urllib.request.urlopen', side_effect=open_resource):
                try:
                    verify_live(site, 'https://synthetic.invalid/app/', commit)
                except HTTPError as error:
                    self.fail('Live verifier requested a non-HTTP deployment control: '+str(error.url))
                self.assertNotIn('.nojekyll', requested)
                self.assertIn('.hidden.js', requested)
                remote['index.html'] = b'tampered'
                with self.assertRaisesRegex(ValueError, 'Live fixed asset mismatch'):
                    verify_live(site, 'https://synthetic.invalid/app/', commit)
                remote.pop('index.html')
                with self.assertRaises(HTTPError):
                    verify_live(site, 'https://synthetic.invalid/app/', commit)
