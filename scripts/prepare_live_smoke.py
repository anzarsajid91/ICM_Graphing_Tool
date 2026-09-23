#!/usr/bin/env python3
"""Prepare the browser smoke harness for public Pages verification.

The fresh FastPath timing benchmarks depend on repository-local reference files and
are intentionally disabled by their measurement helpers in live mode.  The main
smoke flow must therefore skip the corresponding assertion block when exercising
the public Pages deployment.  Local/CI artifact runs remain unchanged.
"""
from __future__ import annotations

from pathlib import Path
import sys

START = "  stage='fresh CSV FastPath benchmarks';\n"
END = "  stage='FastPath failure falls back to authoritative import';\n"
GUARD = "  if(!liveMode){\n"
CLOSE = "  }\n"


def prepare(text: str) -> str:
    if GUARD + START in text:
        return text
    if START not in text or END not in text:
        raise ValueError('Expected FastPath benchmark markers were not found')
    text = text.replace(START, GUARD + START, 1)
    text = text.replace(END, CLOSE + END, 1)
    return text


def main() -> int:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else 'web/tests/smoke.mjs')
    original = target.read_text(encoding='utf-8')
    prepared = prepare(original)
    target.write_text(prepared, encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
