import importlib.util
import json
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('verify_vendor', ROOT / 'scripts/verify_vendor.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


def test_checked_in_runtime_matches_manifest_and_upstream_wheel_hashes():
    manifest = verifier.verify_vendor(ROOT)
    assert manifest['dependencies']['SheetJS']['version'] == '0.20.3'
    vendor = ROOT / 'web/vendor/pyodide-0.29.4'
    lock = json.loads((vendor / 'pyodide-lock.json').read_text())
    entries = {Path(f['path']).name: f for f in manifest['files']}
    for name in manifest['dependencies']['Pyodide']['packages']:
        package = lock['packages'][name]
        assert entries[package['file_name']]['sha256'] == package['sha256']


def test_changed_vendor_bytes_fail_closed(tmp_path):
    vendor = tmp_path / 'web/vendor'
    vendor.mkdir(parents=True)
    (vendor / 'runtime.js').write_bytes(b'changed')
    (vendor / 'manifest.json').write_text(json.dumps({'files':[
        {'path':'runtime.js','bytes':7,'sha256':'0'*64}]}))
    with pytest.raises(ValueError, match='integrity failure'):
        verifier.verify_vendor(tmp_path)
