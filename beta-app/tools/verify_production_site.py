#!/usr/bin/env python3
"""Production release gate; a successful empty-site build is not publishable."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
from verify_beta_site import verify_site

ROOT = Path(__file__).resolve().parents[1]

def safe_asset(dist: Path, rel: str) -> Path:
    if not isinstance(rel, str) or not rel or rel.startswith(('/', '\\')):
        raise ValueError(f'Unsafe asset path: {rel!r}')
    path = (dist / rel).resolve()
    if not path.is_relative_to(dist.resolve()) or not path.is_file():
        raise ValueError(f'Missing / escaping public asset: {rel!r}')
    return path

def verify_production(dist: Path, min_chapters=1, min_books=1):
    dist = Path(dist)
    verify_site(dist)
    catalog = json.loads(safe_asset(dist,'courses/catalog.json').read_text(encoding='utf-8'))
    chapters, books = catalog.get('chapters',[]), catalog.get('books',{})
    if len(chapters) < min_chapters or len(books) < min_books:
        raise ValueError(f'BLOCKED: production requires at least {min_books} book(s) and {min_chapters} chapter(s); found {len(books)}, {len(chapters)}')
    for chapter in chapters:
        body = json.loads(safe_asset(dist, chapter['path']).read_text(encoding='utf-8'))
        length = len(body.get('sentences',[]))
        if not length or len(body.get('translations',[]))!=length or len(body.get('ids',[]))!=length:
            raise ValueError(f'Chapter data/translation mismatch: {chapter["chapter_id"]}')
        if len(set(body['ids']))!=length:
            raise ValueError(f'Duplicate sentence ID: {chapter["chapter_id"]}')
        if any(not isinstance(x,str) or not x.strip() for x in body['sentences']):
            raise ValueError(f'Blank English sentence: {chapter["chapter_id"]}')
        if any(not isinstance(x,str) or not x.strip() for x in body['translations']):
            raise ValueError(f'Blank translation: {chapter["chapter_id"]}')
        if body.get('book_id')!=chapter['book_id'] or body.get('chapter_id')!=chapter['chapter_id']:
            raise ValueError(f'Chapter metadata mismatch: {chapter["chapter_id"]}')
        for rel in chapter.get('scene_images',{}).values():
            safe_asset(dist,rel)
    print(f'PRODUCTION SITE READY: {len(books)} books / {len(chapters)} chapters')
    return catalog

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--site',type=Path,default=ROOT/'dist')
    ap.add_argument('--min-chapters',type=int,default=1)
    ap.add_argument('--min-books',type=int,default=1)
    a=ap.parse_args()
    try:verify_production(a.site,a.min_chapters,a.min_books)
    except (AssertionError,ValueError,KeyError,FileNotFoundError) as exc:
        print(f'PRODUCTION BLOCKED: {exc}',file=sys.stderr);sys.exit(1)
