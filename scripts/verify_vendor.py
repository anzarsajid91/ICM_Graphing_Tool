"""Fail closed on missing or changed checked-in browser dependencies."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path


def verify_vendor(root: Path | None = None) -> dict:
    root = root or Path(__file__).resolve().parents[1]
    vendor = root / 'web' / 'vendor'
    manifest = json.loads((vendor / 'manifest.json').read_text())
    listed = set()
    for entry in manifest['files']:
        relative = entry['path']
        path = vendor / relative
        if not path.resolve().is_relative_to(vendor.resolve()):
            raise ValueError(f'Unsafe vendor path: {relative}')
        data = path.read_bytes()
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError(f'Vendor integrity failure: {relative}')
        listed.add(relative)
    actual = {p.relative_to(vendor).as_posix() for p in vendor.rglob('*') if p.is_file() and p.name != 'manifest.json'}
    if listed != actual:
        raise ValueError(f'Unlisted/missing vendor files: {listed ^ actual}')
    print(f'Verified {len(listed)} pinned browser dependency files.')
    return manifest


if __name__ == '__main__':
    verify_vendor()
