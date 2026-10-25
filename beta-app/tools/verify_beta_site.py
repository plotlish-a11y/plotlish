#!/usr/bin/env python3
"""Check generated beta site; an empty, not-yet-published course shelf is valid."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'


def verify_site(dist=DIST, require_chapter=None, require_book=None,
                require_scenes=None, require_sentences=None):
    dist = Path(dist)
    catalog_path = dist / 'courses' / 'catalog.json'
    assert catalog_path.is_file(), '缺少 courses/catalog.json'
    cat = json.loads(catalog_path.read_text(encoding='utf8'))
    assert cat.get('schema_version') == 'plotlish-r231-web-v2', '意外的课程数据格式'
    chapters = cat.get('chapters')
    assert isinstance(chapters, list), 'chapters 必须是数组（允许为空）'
    featured = dist / 'homepage.json'
    assert featured.is_file(), '缺少 homepage.json 首页配置'
    home = json.loads(featured.read_text(encoding='utf8'))
    assert home.get('schema_version')==1 and isinstance(home.get('sections'),list), '首页推荐配置无效'
    published_ids={c['book_id'] for c in chapters}
    if home.get('featured_book_id') is not None:
        assert home['featured_book_id'] in published_ids, '主推作品未发布'
    for section in home['sections']:
        assert isinstance(section,dict) and isinstance(section.get('book_ids'),list), '精选栏目格式错误'
        assert all(book_id in published_ids for book_id in section['book_ids']), '精选包含未发布作品'
    ids = [c['chapter_id'] for c in chapters]
    assert len(set(ids)) == len(chapters), '存在重复章节 ID'
    books = cat.get('books', {})
    assert isinstance(books, dict), 'books 必须是对象'
    for bid, meta in books.items():
        assert any(c.get('book_id') == bid for c in chapters), f'无公开章节却发布了资料：{bid}'
        if meta.get('hero'):
            assert (dist / meta['hero']).is_file(), f'横幅图片缺失：{meta["hero"]}'
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
    # Local clean-core builds are allowed to be empty; test-site deployment is not.
    if require_book is not None:
        assert require_book in books, f'部署校验失败：缺少作品 {require_book}'
    if require_chapter is not None:
        matching = [c for c in chapters if c.get('chapter_id') == require_chapter]
        assert len(matching) == 1, f'部署校验失败：课程目录缺少章节 {require_chapter}'
        item = matching[0]
        body = json.loads((dist / item['path']).read_text(encoding='utf8'))
        if require_sentences is not None:
            assert len(body.get('sentences', [])) == require_sentences, '部署校验失败：章节句子数不符'
            assert len(body.get('translations', [])) == require_sentences, '部署校验失败：中文对照数不符'
        if require_scenes is not None:
            assert len(body.get('scenes', [])) == require_scenes, '部署校验失败：章节场景数量不符'
            assert len(item.get('scene_images', {})) == require_scenes, '部署校验失败：章节插图数量不符'
    for bad in ['author', 'private_publish_history', 'packages', 'tools', '.github']:
        assert not (dist / bad).exists(), f'私有或开发文件被放入公开站点：{bad}'
    for required in ['index.html', 'src/boot.js', 'src/reader.js', 'src/shell.js', 'src/library.js', 'src/styles.css']:
        assert (dist / required).is_file(), f'网站基础文件缺失：{required}'
    print(f'BETA SITE CHECK OK: {len(chapters)} chapters; ' + ('required published content verified' if require_chapter else 'empty shelf allowed for local builds'))


if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--site',type=Path,default=DIST)
    parser.add_argument('--require-book',type=str,default=None)
    parser.add_argument('--require-chapter',type=str,default=None)
    parser.add_argument('--require-scenes',type=int,default=None)
    parser.add_argument('--require-sentences',type=int,default=None)
    args=parser.parse_args()
    verify_site(args.site, require_chapter=args.require_chapter,
                require_book=args.require_book, require_scenes=args.require_scenes,
                require_sentences=args.require_sentences)
