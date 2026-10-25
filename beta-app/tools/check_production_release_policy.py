#!/usr/bin/env python3
"""Release-only deployment gate: never auto-publish a candidate build.

This check intentionally does not change Beta builds, content import, or reader code.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def verify_version(text: str) -> str:
    version = text.strip()
    if not re.fullmatch(r'v?([1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
        raise ValueError('Production requires an explicitly approved stable version (e.g. v1.0.0); pre-release RC builds are blocked')
    return version


def main():
    try:
        version = verify_version((ROOT / 'RELEASE_VERSION').read_text(encoding='utf-8'))
        print('STABLE PRODUCTION VERSION APPROVED FOR PIPELINE:', version)
    except (OSError, ValueError) as exc:
        print('PRODUCTION DEPLOY BLOCKED:', exc, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
