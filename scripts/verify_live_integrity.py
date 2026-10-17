"""Compare fixed live resources against a locally rebuilt approved revision.

CI-only; never supplied engineering data. Rebuild expected _site first with the
exact TARGET_SHA, full history and normal source/vendor/claim gates enabled.
"""
import concurrent.futures
import hashlib
import json
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit
from release_integrity import verify as verify_artifact, served_entries


def verify(site, base, commit):
    if urlsplit(base).scheme != 'https' or not base.endswith('/'):
        raise ValueError('An HTTPS application root is required')
    verify_artifact(site)
    expected = json.loads((site/'release-integrity.json').read_text())
    if expected['commit'] != commit or len(commit) != 40:
        raise ValueError('Expected artifact revision mismatch')
    def download(relative):
        if relative.startswith('/') or any(x in relative for x in ('..', ':', '?', '#', '%', '\\')):
            raise ValueError('Unsafe fixed artifact path')
        with urllib.request.urlopen(base+relative+'?v='+commit, timeout=60) as response:
            if not response.url.startswith(base):
                raise ValueError('Artifact redirect left the application root')
            return response.read()
    actual = json.loads(download('release-integrity.json'))
    if actual != expected:
        raise ValueError('Live manifest differs from the rebuilt reviewed revision')
    def check(item):
        relative, expected_hash = item
        if hashlib.sha256(download(relative)).hexdigest() != expected_hash:
            raise ValueError('Live fixed asset mismatch: '+relative)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        list(executor.map(check, served_entries(expected).items()))
    print(f'Live artifact verified: {commit}, {len(served_entries(expected))} HTTP resources; '
          f'{len(expected["deployment_controls"])} deployment controls verified in the review build, not published as HTTP assets')


if __name__ == '__main__':
    verify(Path(sys.argv[1]), sys.argv[2], sys.argv[3])
