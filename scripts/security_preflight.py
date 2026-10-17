"""Developer feedback only; GitHub review and required checks are authoritative."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
commands = [
    ['npm', 'ci', '--ignore-scripts'],
    ['npm', 'audit', '--audit-level=low'],
    ['gitleaks', 'git', '--redact', '--no-banner'],
    [sys.executable, 'scripts/verify_data_confidentiality.py'],
    [sys.executable, 'scripts/verify_security_claims.py'],
    [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests/privacy', '-v'],
    ['node', 'web/tests/privacy-network-unit.mjs'],
    ['node', '--check', 'web/assets/precision-workbench.js'],
    [sys.executable, '-m', 'pytest'],
]
for command in commands:
    subprocess.run(command, cwd=ROOT, check=True)
for script in sorted((ROOT/'web/tests').glob('*-unit.mjs')):
    subprocess.run(['node', str(script)], cwd=ROOT, check=True)
print('Local preflight passed; this is not independent release approval.')
