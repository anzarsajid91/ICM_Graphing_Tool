"""Validate the static transparency contract; this does not certify its claims."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def verify_claims(root=ROOT):
    register = json.loads((root/'security/claims.json').read_text())
    claims = register['claims']
    if {c['id'] for c in claims} != {f'SC-{i:02}' for i in range(1, 9)} or len(claims) != 8:
        raise ValueError('Exactly eight mandatory security sections are required')
    for claim in claims:
        for field in ['statement', 'evidence', 'scope', 'limitation', 'status', 'owner']:
            if not claim.get(field):
                raise ValueError(f'Missing claim field: {claim["id"]}/{field}')
        if claim['status'] not in {'verified', 'conditional', 'unverified'}:
            raise ValueError('Unknown claim verification status')
        for relative in claim['evidence']:
            path = root/relative
            if not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
                raise ValueError(f'Missing/unsafe claim evidence: {relative}')
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            if register['evidence_sha256'].get(relative) != actual:
                raise ValueError(f'Security claim evidence changed: {relative}; documented maintainer claim review required')
    if claims[5]['statement'].split('.')[0] != 'Verification status is not available for this build':
        raise ValueError('No supported exact-build verification assertion has been approved')
    print('Security claim structure and evidence digests match; semantic review remains mandatory.')


if __name__ == '__main__':
    verify_claims()
