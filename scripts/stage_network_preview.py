"""Append a test preview without modifying any production release bytes."""
from pathlib import Path
import hashlib
import shutil
import sys


def stage(production, preview):
    production, preview = Path(production), Path(preview)
    before = {p.relative_to(production): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in production.rglob('*') if p.is_file() and 'preview' not in p.relative_to(production).parts}
    target = production / 'preview' / 'network-annual-review'
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(preview, target)
    isolation = """<script>
// Preview storage is independent of the main application on this same origin.
(()=>{const prefix='hydra-network-annual-preview:';for(const name of ['getItem','setItem','removeItem']){const native=Storage.prototype[name];Storage.prototype[name]=function(key,...args){return native.call(this,prefix+key,...args);};}})();
</script>"""
    index = target / 'index.html'
    html = index.read_text(encoding='utf-8')
    html = html.replace('</head>', isolation+'\n</head>')
    html = html.replace('<title>', '<title>TEST PREVIEW · ', 1)
    index.write_text(html, encoding='utf-8')
    for name, digest in before.items():
        assert hashlib.sha256((production/name).read_bytes()).hexdigest() == digest, name
    print(f'Preview staged; {len(before)} production files unchanged.')


if __name__ == '__main__':
    stage(*sys.argv[1:])
