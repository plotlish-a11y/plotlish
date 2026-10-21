#!/usr/bin/env python3
"""Check generated beta site; an empty, not-yet-published course shelf is valid."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'


def verify_site(dist=DIST):
    dist = Path(dist)
    catalog_path = dist / 'courses' / 'catalog.json'
    assert catalog_path.is_file(), '缺少 courses/catalog.json'
    cat = json.loads(catalog_path.read_text(encoding='utf8'))
    assert cat.get('schema_version') == 'plotlish-r231-web-v2', '意外的课程数据格式'
    chapters = cat.get('chapters')
    assert isinstance(chapters, list), 'chapters 必须是数组（允许为空）'
    ids = [c['chapter_id'] for c in chapters]
    assert len(set(ids)) == len(chapters), '存在重复章节 ID'
    books = cat.get('books', {})
    assert isinstance(books, dict), 'books 必须是对象'
    for bid, meta in books.items():
        assert any(c.get('book_id') == bid for c in chapters), f'无公开章节却发布了资料：{bid}'
        for path in meta.get('portrait_paths', {}).values():
            assert (dist / path).is_file(), f'人物图片缺失：{path}'
    for c in chapters:
        if c.get('units'):
            assert c['units'][0]['start_id'] == c['ids'][0], f'首单元未指向第一句：{c["chapter_id"]}'
        assert c.get('sentences_count', 0) > 0, f"空章节：{c['chapter_id']}"
        assert (dist / c['path']).is_file(), f"缺少章节：{c['chapter_id']}"
        if c.get('cover'):
            assert (dist / c['cover']).is_file(), f"缺少封面：{c['chapter_id']}"
        for p in c.get('scene_images', {}).values():
            assert (dist / p).is_file(), f"缺少插图：{c['chapter_id']}"
    for bad in ['author', 'private_publish_history', 'packages', 'tools', '.github']:
        assert not (dist / bad).exists(), f'私有或开发文件被放入公开站点：{bad}'
    for required in ['index.html', 'src/boot.js', 'src/reader.js', 'src/styles.css']:
        assert (dist / required).is_file(), f'网站基础文件缺失：{required}'
    print(f'BETA SITE CHECK OK: {len(chapters)} chapters; empty shelf is allowed')


if __name__ == '__main__':
    verify_site()
