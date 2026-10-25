#!/usr/bin/env python3
"""Generate immutable checksums to verify the live Pages deployment matches this build."""
import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from verify_production_site import safe_asset,verify_production

# Keep a checksum for every deployed file, including the course assets.
# The release.json manifest itself is generated after this inventory.
FILES=('index.html','courses/catalog.json','src/reader.js','src/styles.css','src/boot.js')

def create_manifest(dist,commit,version,allow_empty=False):
    dist=Path(dist)
    if not re.fullmatch(r'[0-9a-f]{40}',commit):
        raise ValueError('Commit must be a full 40-character Git SHA')
    if not re.fullmatch(r'v\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?(?:\+[A-Za-z0-9.]+)?',version):
        raise ValueError('Invalid release version')
    catalog=verify_production(dist,allow_empty=allow_empty)
    for rel in FILES:
        safe_asset(dist,rel)
    sha={}
    for path in sorted(dist.rglob('*')):
        if path.is_symlink():
            raise ValueError(f'Symlink in deployment output: {path}')
        if path.is_file():
            rel=path.relative_to(dist).as_posix()
            if rel!='release.json':
                sha[rel]=hashlib.sha256(path.read_bytes()).hexdigest()
    manifest={'schema':1,'version':version,'commit':commit,'chapters':len(catalog['chapters']),
              'books':len(catalog['books']),'checksums':sha}
    (dist/'release.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return manifest

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--site',type=Path,default=Path(__file__).resolve().parents[1]/'dist')
    ap.add_argument('--commit',default=os.environ.get('GITHUB_SHA',''))
    ap.add_argument('--version',required=True)
    ap.add_argument('--allow-empty',action='store_true')
    a=ap.parse_args()
    try:print(json.dumps(create_manifest(a.site,a.commit,a.version,allow_empty=a.allow_empty),ensure_ascii=False))
    except (ValueError,AssertionError,KeyError) as exc:print('RELEASE BLOCKED:',str(exc),file=sys.stderr);sys.exit(1)
