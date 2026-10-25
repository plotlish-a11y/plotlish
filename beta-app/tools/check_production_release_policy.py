#!/usr/bin/env python3
"""Validate release version syntax, not its release stage.

The user controls when main is deployed. Candidate labels are valid and no
artificial RC-vs-stable promotion gate should prevent publishing.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PATTERN = re.compile(r'v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?')


def verify_version(text: str) -> str:
    version = text.strip()
    if not PATTERN.fullmatch(version):
        raise ValueError('RELEASE_VERSION must be a valid version such as v1.0.0 or v1.0.0-rc.3')
    return version


def main():
    try:
        version = verify_version((ROOT / 'RELEASE_VERSION').read_text(encoding='utf-8'))
        print('RELEASE VERSION LABEL:', version, '(RC builds allowed)')
    except (OSError, ValueError) as exc:
        print('INVALID RELEASE VERSION:', exc, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
