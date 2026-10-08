"""Conservative network-source change gate; not a proof of non-exfiltration."""
from __future__ import annotations

import ast
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NETWORK_JS = re.compile(
    r"\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection|"
    r"RTCDataChannel|WebTransport|importScripts|sendBeacon|sendDataToCloud)\b"
    r"|\bnew\s+(?:Worker|SharedWorker|Image)\b"
    r"|\.(?:src|href|action)\s*=(?!=)|\.(?:submit|share)\s*\("
    r"|\bwindow\.open\s*\(|\bimport\s*\(|\bnew\s+Function\b"
    r"|setAttribute\(\s*['\"](?:src|href|action)['\"]"
    r"|\b(?:window|document)\.location\b"
    r"|createElement\(\s*['\"](?:script|iframe|form|link|img|object|embed)['\"]"
    r"|show(?:SendToCloud|EditInChartStudio)\s*:\s*true",
    re.IGNORECASE,
)
NETWORK_PYTHON = {
    'requests', 'httpx', 'aiohttp', 'urllib', 'http', 'socket', 'websockets',
    'ftplib', 'smtplib', 'webbrowser', 'js', 'pyodide', 'micropip', 'subprocess',
}


def network_capable(text: str, suffix: str) -> bool:
    if suffix == '.js':
        return bool(NETWORK_JS.search(text))
    if suffix == '.py':
        tree = ast.parse(text)
        for node in ast.walk(tree):
            names = ([a.name for a in node.names] if isinstance(node, ast.Import)
                     else [node.module or ''] if isinstance(node, ast.ImportFrom)
                     else [])
            if any(name.split('.')[0] in NETWORK_PYTHON for name in names):
                return True
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id in {'__import__', 'eval', 'exec'}:
                    return True
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr in {'import_module', 'urlopen', 'pyfetch', 'open_url'}:
                    return True
        return False
    if suffix in {'.html', '.css'}:
        # Namespace strings and embedded SVG data URLs are not remote resources.
        cleaned = re.sub(r'data:[^\s"<>]+', '', text)
        return bool(re.search(r'(?:src|href)\s*=\s*[\'\"]\s*(?:https?:)?//|'
                              r'(?:url\(|@import\s+)[\s\'\"]*(?:https?:)?//', cleaned, re.I))
    return False


def verify(root: Path = ROOT) -> None:
    inventory = json.loads((root/'security/network-source-approvals.json').read_text())
    approvals = inventory['sources']
    seen = set()
    failures = []
    candidates = [p for p in (root/'web').rglob('*')
                  if not ({'vendor','tests'} & set(p.relative_to(root/'web').parts))]
    candidates += list((root/'src/icm_workbench').rglob('*.py'))
    for path in candidates:
        if not path.is_file() or path.suffix not in {'.js', '.py', '.html', '.css'}:
            continue
        relative = path.relative_to(root).as_posix()
        data = path.read_bytes()
        if not network_capable(data.decode('utf-8'), path.suffix):
            continue
        seen.add(relative)
        approval = approvals.get(relative, {})
        if approval.get('sha256') != hashlib.sha256(data).hexdigest() or not approval.get('review'):
            failures.append(relative + ': unreviewed/changed network-capable source')
    for relative in set(approvals) - seen:
        failures.append(relative + ': stale approval; review/remove it explicitly')
    vendor_manifest = root/'web/vendor/manifest.json'
    if hashlib.sha256(vendor_manifest.read_bytes()).hexdigest() != inventory['vendor_manifest_sha256']:
        failures.append('web/vendor/manifest.json: dependency update requires confidentiality review')
    from verify_vendor import verify_vendor
    verify_vendor(root)
    if failures:
        raise RuntimeError('DATA CONFIDENTIALITY GATE FAILED:\n' + '\n'.join(failures))
    print(f'Data confidentiality source gate passed: {len(seen)} reviewed network-capable sources.')


if __name__ == '__main__':
    verify()
