from scripts.prepare_live_smoke import prepare


def test_live_smoke_wraps_local_only_fastpath_benchmarks():
    source = """try{\n  stage='fresh CSV FastPath benchmarks';\n  const measured=await measureFreshFastPathImport(spec);\n  const engineAfterSelection=Number(measured.engineReadyFromNavigationMs);\n  stage='FastPath failure falls back to authoritative import';\n}\n"""
    prepared = prepare(source)
    assert "if(!liveMode){\n  stage='fresh CSV FastPath benchmarks';" in prepared
    assert "  }\n  stage='FastPath failure falls back to authoritative import';" in prepared


def test_live_smoke_preparation_is_idempotent():
    source = """  stage='fresh CSV FastPath benchmarks';\n  const measured=await measureFreshFastPathImport(spec);\n  stage='FastPath failure falls back to authoritative import';\n"""
    once = prepare(source)
    assert prepare(once) == once
