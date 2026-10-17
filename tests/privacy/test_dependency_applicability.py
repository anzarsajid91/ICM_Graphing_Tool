"""Synthetic decision tests: no network or engineering data."""
import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts'))
from audit_browser_dependencies import disposition


class ApplicabilityTests(unittest.TestCase):
    def setUp(self):
        self.records = json.loads((ROOT/'security/dependency-applicability.json').read_text())
        self.advisory = copy.deepcopy(self.records['advisories'][0]['reviewed_fields'])

    def check(self, advisory=None, version='0.20.3', ecosystem='npm', name='xlsx'):
        return disposition(advisory or self.advisory, ecosystem, name, version)

    def test_exact_reviewed_vendor_and_advisory(self):
        for record in self.records['advisories']:
            self.assertEqual(self.check(record['reviewed_fields']), 'not_affected')

    def test_unreviewed_id_and_changed_advisory_fail(self):
        for field in ['id', 'modified', 'details', 'affected']:
            changed = copy.deepcopy(self.advisory)
            changed[field] = 'changed'
            self.assertEqual(self.check(changed), 'unresolved')

    def test_other_package_and_version_fail(self):
        for args in [{'version':'0.18.5'}, {'version':'0.20.4'}, {'ecosystem':'PyPI'}, {'name':'other'}]:
            self.assertEqual(self.check(**args), 'unresolved')

    def test_tampered_vendor_fails(self):
        from unittest.mock import patch
        with patch('audit_browser_dependencies.hashlib.sha256') as digest:
            digest.return_value.hexdigest.return_value = 'changed'
            self.assertEqual(self.check(), 'unresolved')
