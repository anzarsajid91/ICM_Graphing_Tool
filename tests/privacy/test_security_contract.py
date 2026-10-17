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
