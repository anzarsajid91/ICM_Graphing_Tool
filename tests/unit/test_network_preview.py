import importlib.util
from pathlib import Path


def test_preview_staging_preserves_release_and_isolates_browser_storage(tmp_path):
    spec = importlib.util.spec_from_file_location('preview', Path('scripts/stage_network_preview.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    production, preview = tmp_path/'production', tmp_path/'test'
    for root, name in [(production, 'MAIN'), (preview, 'BRANCH')]:
        (root/'assets').mkdir(parents=True)
        (root/'index.html').write_text(f'<head><title>{name}</title></head><body></body>')
        (root/'assets'/'runtime.js').write_text(name)
    original = {p.relative_to(production): p.read_bytes() for p in production.rglob('*') if p.is_file()}
    module.stage(production, preview)
    for path, content in original.items():
        assert (production/path).read_bytes() == content
    target = production/'preview'/'network-annual-review'
    assert (target/'assets'/'runtime.js').read_text() == 'BRANCH'
    html = (target/'index.html').read_text()
    assert 'TEST PREVIEW' in html and 'hydra-network-annual-preview:' in html
    assert "['getItem','setItem','removeItem']" in html


def test_uiux_preview_has_distinct_storage_and_preserves_existing_previews(tmp_path):
    spec = importlib.util.spec_from_file_location('preview', Path('scripts/stage_network_preview.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    production, preview = tmp_path/'production', tmp_path/'test'
    production.mkdir(); preview.mkdir()
    (production/'index.html').write_text('<head><title>MAIN</title></head>')
    (preview/'index.html').write_text('<head><title>UIUX</title></head>')
    module.stage(production, preview)
    previous = (production/'preview/network-annual-review/index.html').read_bytes()
    main = (production/'index.html').read_bytes()
    module.stage(production, preview, 'unified-uiux')
    assert (production/'index.html').read_bytes() == main
    assert (production/'preview/network-annual-review/index.html').read_bytes() == previous
    html = (production/'preview/unified-uiux/index.html').read_text()
    assert 'hydra-unified-uiux-preview:' in html
    assert 'hydra-network-annual-preview:' not in html
    import pytest
    with pytest.raises(ValueError, match='Unknown isolated preview'):
        module.stage(production, preview, '../escape')
