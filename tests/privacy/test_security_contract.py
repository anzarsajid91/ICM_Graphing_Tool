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
