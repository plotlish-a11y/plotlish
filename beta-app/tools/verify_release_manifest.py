#!/usr/bin/env python3
"""Verify an immutable production artifact before Wrangler touches the live site."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from verify_production_site import safe_asset, verify_production


def verify_manifest(dist:Path, expected_version:str, expected_commit:str):
    dist=Path(dist)
    verify_production(dist)
    data=json.loads(safe_asset(dist,'release.json').read_text(encoding='utf-8'))
    if data.get('schema')!=1 or data.get('version')!=expected_version or data.get('commit')!=expected_commit:
        raise ValueError('Expected version, commit, or manifest schema mismatch')
    if not isinstance(data.get('checksums'),dict) or not data['checksums']:
        raise ValueError('Missing checksum inventory')
    listed=set(data['checksums'])
    actual=set()
    for path in dist.rglob('*'):
        if path.is_symlink():raise ValueError(f'Symlink in artifact: {path}')
        if path.is_file() and path.relative_to(dist).as_posix()!='release.json':
            rel=path.relative_to(dist).as_posix()
            actual.add(rel)
    if actual!=listed:
        raise ValueError(f'Files missing or unexpectedly added: {sorted(actual^listed)}')
    for rel, sha in data['checksums'].items():
        if not re.fullmatch(r'[0-9a-f]{64}',sha):
            raise ValueError(f'Invalid checksum: {rel}')
        got=hashlib.sha256(safe_asset(dist,rel).read_bytes()).hexdigest()
        if got!=sha:raise ValueError(f'Changed release file: {rel}')
    print(f'VERIFIED: {len(listed)} files, {expected_version}, {expected_commit}')
    return data

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--site',type=Path,default=Path(__file__).resolve().parents[1]/'dist')
    ap.add_argument('--version',required=True)
    ap.add_argument('--commit',required=True)
    a=ap.parse_args()
    try: verify_manifest(a.site,a.version,a.commit)
    except (ValueError,AssertionError,FileNotFoundError,KeyError,TypeError) as exc:
        print('DEPLOY BLOCKED:',exc,file=sys.stderr)
        sys.exit(1)
