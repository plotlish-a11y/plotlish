#!/usr/bin/env python3
"""Plotlish R2.5: immutable student site build from book/chapter source folders.

Sources: packages/<book-id>/book.json + chapters/chNNN/course.json.
Published content only reaches dist.  Core and source packages are never changed.
"""
import argparse
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORE = ROOT / 'core'
ID = re.compile(r'^[a-z0-9][a-z0-9-]{1,99}$')
CHAPTER_FOLDER = re.compile(r'^ch([0-9]{3})$')
SCENE_FILE = re.compile(r'^[a-z0-9][a-z0-9-]{1,99}\.webp$')
MAX_JSON = 2_000_000
MAX_IMAGE = 25 * 1024 * 1024
MAX_CHAPTER_TOTAL = 80 * 1024 * 1024
MAX_CHAPTER_FILES = 80
MAX_BOOK_CHAPTERS = 999
MAX_CAST = 40
MAX_COURSE_UNITS = 30


def check(condition, reason):
    if not condition:
        raise ValueError(str(reason))


def valid_id(value, where):
    check(isinstance(value, str) and ID.fullmatch(value), f'{where} 格式错误: {value!r}')


def read_json(path):
    check(path.is_file() and not path.is_symlink(), f'缺少文件或文件为符号链接: {path}')
    check(path.stat().st_size <= MAX_JSON, f'JSON 大小超过 2 MB: {path}')
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (UnicodeError, json.JSONDecodeError) as e:
        raise ValueError(f'{path}: JSON 无法解析：{e}') from e
    check(isinstance(data, dict), f'{path}: JSON 必须是对象')
    return data


def assert_source_file(path, max_bytes):
    check(path.is_file() and not path.is_symlink(), f'文件不存在或为符号链接: {path}')
    check(path.stat().st_size <= max_bytes, f'文件过大: {path}')


def assert_webp(path):
    assert_source_file(path, MAX_IMAGE)
    with path.open('rb') as f:
        header = f.read(12)
    check(len(header) == 12 and header[:4] == b'RIFF' and header[8:] == b'WEBP',
          f'图片不是有效 WebP 格式: {path}')


def status(obj, source):
    s = obj.get('status')
    check(s in ('draft', 'published'), f'{source}: status 必须是 draft 或 published，不能省略')
    return s


def load_book(book_dir):
    valid_id(book_dir.name, '作品文件夹')
    book = read_json(book_dir / 'book.json')
    check(book.get('schema_version') == 'plotlish-book-v1', f'{book_dir}: schema_version 必须是 plotlish-book-v1')
    check(book.get('book_id') == book_dir.name, f'{book_dir}: book_id 必须与文件夹名称一致')
    status(book, book_dir / 'book.json')
    for field in ('title', 'level', 'genre'):
        check(isinstance(book.get(field), str) and book[field].strip(), f'{book_dir}: {field} 必须是非空字符串')
    check(book.get('publication_state','ongoing') in ('ongoing','completed'), f'{book_dir}: publication_state 必须是 ongoing 或 completed')
    for field in ('title_zh', 'synopsis'):
        check(isinstance(book.get(field, ''), str), f'{book_dir}: {field} 必须是字符串')
    return book


def optional_book_content(book_dir):
    """Validate optional public guide and spoiler-light cast, including portrait assets.

    Draft content is validated but never exported when the book is unpublished.
    Every exported bio must be suitable for public discovery after unlock.
    """
    guide_file = book_dir / 'course-guide.json'
    cast_file = book_dir / 'characters.json'
    guide, characters, portraits = {}, [], {}
    if guide_file.exists():
        guide = read_json(guide_file)
        check(guide.get('schema_version') == 'plotlish-course-guide-v1', f'{guide_file}: schema_version 错误')
        for k in ('tagline', 'intro', 'intro_zh'):
            check(isinstance(guide.get(k, ''), str) and len(guide.get(k, '')) <= 5000, f'{guide_file}: {k} 无效')
        for k in ('learning_goals', 'study_tips'):
            val = guide.get(k, [])
            check(isinstance(val, list) and len(val) <= 12 and all(isinstance(v, str) and 0 < len(v.strip()) <= 300 for v in val), f'{guide_file}: {k} 无效')
    if cast_file.exists():
        cast = read_json(cast_file)
        check(cast.get('schema_version') == 'plotlish-characters-v1', f'{cast_file}: schema_version 错误')
        characters = cast.get('characters', [])
        check(isinstance(characters, list) and len(characters) <= MAX_CAST, f'{cast_file}: characters 无效')
        used = set()
        for c in characters:
            check(isinstance(c, dict), f'{cast_file}: 人物条目必须是对象')
            key = c.get('id')
            valid_id(key, '人物 ID')
            check(key not in used, f'{cast_file}: 重复人物 ID')
            used.add(key)
            for k in ('name', 'name_zh', 'role', 'bio'):
                v = c.get(k, '')
                check(isinstance(v, str) and (v.strip() if k == 'name' else True) and len(v) <= 600, f'{cast_file}: {k} 无效')
            ch = c.get('intro_chapter')
            check(type(ch) is int and 1 <= ch <= MAX_BOOK_CHAPTERS, f'{cast_file}: intro_chapter 错误')
            portrait = c.get('portrait', '')
            check(isinstance(portrait, str), f'{cast_file}: portrait 格式错误')
            if portrait:
                check(portrait == f'characters/{key}.webp', f'{cast_file}: portrait 必须等于 characters/{key}.webp')
                portraits[portrait] = book_dir / portrait
    portrait_dir = book_dir / 'characters'
    files = set()
    if portrait_dir.exists():
        check(portrait_dir.is_dir() and not portrait_dir.is_symlink(), f'{portrait_dir}: 文件夹无效')
        for entry in portrait_dir.iterdir():
            check(entry.is_file() and not entry.is_symlink() and SCENE_FILE.fullmatch(entry.name), f'{entry}: 人物文件名无效')
            files.add(f'characters/{entry.name}')
    check(files == set(portraits), f'{book_dir}: 人物立绘与 characters.json 引用不匹配')
    for image in portraits.values():
        assert_webp(image)
    return guide, characters, portraits


def chapter_number(chapter_id):
    valid_id(chapter_id, 'chapter_id')
    m = re.search(r'-(?:ch)?0*([1-9][0-9]*)$', chapter_id)
    check(m is not None, f'chapter_id 必须以 -ch001 或 -001 等章节编号结尾: {chapter_id}')
    num = int(m.group(1))
    check(1 <= num <= MAX_BOOK_CHAPTERS, f'章节编号超出 001～999: {chapter_id}')
    return num


def validate_chapter(course, book, chapter_dir, files=None):
    """Return course JSON for existing reader, enriched annotations, scene map and file refs.

    files: {'images/a.webp': path, 'glossary.json': path}, from canonical source.
    ZIP import calls same routine with its temporary staging source.
    """
    check(isinstance(course, dict), f'{chapter_dir}: course.json 必须是对象')
    check(course.get('status') in ('draft', 'published'), f'{chapter_dir}: status 必须是 draft 或 published')
    check(isinstance(course.get('chapter'), str) and course['chapter'].strip(), f'{chapter_dir}: 章节标题不能为空')
    number = chapter_number(course.get('chapter_id'))
    expected = CHAPTER_FOLDER.fullmatch(chapter_dir.name)
    check(expected is not None and int(expected.group(1)) == number,
          f'{chapter_dir}: 目录 chNNN 必须与 chapter_id 的章节编号一致')
    # Compatible with authored lessons that still repeat a title/ID.
    check(course.get('book_id', book['book_id']) == book['book_id'], f'{chapter_dir}: 章节 book_id 与所属作品不一致')
    check(course.get('book', book['title']) == book['title'], f'{chapter_dir}: 章节作品名称与 book.json 不一致')
    check(course['chapter_id'].startswith(book['book_id'] + '-'), f'{chapter_dir}: chapter_id 必须以前缀 {book["book_id"]}- 开头')
    for field in ('subtitle', 'grammarTitle', 'grammarDesc', 'grammarExample', 'reviewQuestion', 'reviewHint'):
        check(isinstance(course.get(field, ''), str), f'{chapter_dir}: {field} 格式错误')
    grammar = course.get('grammar', {})
    check(isinstance(grammar, dict), f'{chapter_dir}: grammar 必须是对象')
    check(all(isinstance(grammar.get(k, ''), str) for k in ('term', 'explain', 'example')),
          f'{chapter_dir}: grammar.term/explain/example 必须是字符串')
    for field in ('question', 'questionHelp'):
        check(isinstance(course.get(field, ''), str), f'{chapter_dir}: {field} 必须是字符串')
    sentences = course.get('sentences')
    ids = course.get('ids')
    translations = course.get('translations')
    check(all(isinstance(v, list) for v in (sentences, ids, translations)), f'{chapter_dir}: sentences、ids、translations 必须是数组')
    check(len(sentences) > 0 and len(sentences) == len(ids) == len(translations), f'{chapter_dir}: 正文/译文/ID 数量不一致')
    check(all(isinstance(x, str) and x.strip() for x in sentences + ids + translations), f'{chapter_dir}: 正文/译文/ID 有空值')
    check(all(len(x) <= 150 for x in ids) and len(set(ids)) == len(ids), f'{chapter_dir}: 句子 ID 重复或过长')
    # Units are stable sentence-ID anchors: changing a preceding sentence does
    # not displace the unit when authors retain its ID.
    units = course.get('units', [])
    check(isinstance(units, list) and len(units) <= MAX_COURSE_UNITS, f'{chapter_dir}: units 格式错误')
    unit_ids, unit_positions = set(), []
    for unit in units:
        check(isinstance(unit, dict), f'{chapter_dir}: 单元必须是对象')
        uid = unit.get('unit_id')
        valid_id(uid, 'unit_id')
        check(uid not in unit_ids, f'{chapter_dir}: 重复单元 ID')
        unit_ids.add(uid)
        check(isinstance(unit.get('title'), str) and 0 < len(unit['title'].strip()) <= 120,
              f'{chapter_dir}: 单元标题无效')
        check(isinstance(unit.get('description', ''), str) and len(unit.get('description', '')) <= 500,
              f'{chapter_dir}: 单元说明无效')
        start_id = unit.get('start_id')
        check(isinstance(start_id, str) and start_id in ids, f'{chapter_dir}: 单元起始句 ID 不存在')
        pos = ids.index(start_id)
        check(not unit_positions or pos > unit_positions[-1], f'{chapter_dir}: 单元必须按阅读顺序排列')
        unit_positions.append(pos)
    check(not units or unit_positions[0] == 0, f'{chapter_dir}: 第一个单元必须从正文第一句开始')
    notes = course.get('annotations', [])
    check(isinstance(notes, list), f'{chapter_dir}: annotations 必须是数组')
    enriched, used_notes = [], set()
    for n in notes:
        check(isinstance(n, dict) and isinstance(n.get('id'), str) and n['id'].strip(), f'{chapter_dir}: 知识点 ID 错误')
        check(n['id'] not in used_notes, f'{chapter_dir}: 知识点 ID 重复')
        used_notes.add(n['id'])
        i = n.get('sentenceIndex')
        check(type(i) is int and 0 <= i < len(sentences), f'{chapter_dir}: 知识点句序错误')
        p = n.get('phrase')
        check(isinstance(p, str) and p.strip() and p.casefold() in sentences[i].casefold(),
              f'{chapter_dir}: 知识点短语未匹配原句')
        enriched.append({**n, 'sentence': sentences[i]})
    breaks = course.get('paragraphBreaks', [])
    check(isinstance(breaks, list) and all(type(i) is int and 0 <= i < len(sentences) for i in breaks),
          f'{chapter_dir}: 段落标记越界')
    scenes = course.get('scenes', [])
    check(isinstance(scenes, list), f'{chapter_dir}: scenes 必须是数组')
    scene_images, used_scenes = {}, set()
    for scene in scenes:
        check(isinstance(scene, dict), f'{chapter_dir}: 场景格式错误')
        sid = scene.get('scene_id')
        valid_id(sid, 'scene_id')
        check(sid not in used_scenes, f'{chapter_dir}: 场景 ID 重复: {sid}')
        used_scenes.add(sid)
        check(type(scene.get('start_index')) is int and 0 <= scene['start_index'] < len(sentences),
              f'{chapter_dir}: 场景插入位置错误: {sid}')
        scene_images[sid] = f'assets/scenes/{book["book_id"]}/{course["chapter_id"]}/{sid}.webp'
    files = files or {}
    img_names = {p for p in files if p.startswith('images/')}
    expected_imgs = {f'images/{sid}.webp' for sid in used_scenes}
    check(img_names == expected_imgs, f'{chapter_dir}: 插图文件与 scenes 引用不一致')
    for name, path in files.items():
        if name.startswith('images/'):
            check(SCENE_FILE.fullmatch(name[7:]), f'{chapter_dir}: 插图文件名无效 {name}')
            assert_webp(path)
    glossary = course.get('glossary', {})
    if 'glossary.json' in files:
        check('glossary' not in course, f'{chapter_dir}: glossary 不要同时放进 course.json 和 glossary.json')
        glossary = read_json(files['glossary.json'])
    check(isinstance(glossary, dict) and all(isinstance(k, str) and isinstance(v, str) and len(k) <= 100 and len(v) <= 500 for k, v in glossary.items()),
          f'{chapter_dir}: glossary 格式错误')
    normalized = {**course, 'book_id': book['book_id'], 'book': book['title'],
                  'level': book['level'], 'genre': book['genre'], 'synopsis': book.get('synopsis', ''),
                  'glossary': glossary,
                  'grammar': {'term': grammar.get('term') or '本章语法讲解',
                              'explain': grammar.get('explain') or '本章暂无专项语法讲解。',
                              'example': grammar.get('example', '')},
                  'question': course.get('question', ''),
                  'questionHelp': course.get('questionHelp', '')}
    return normalized, number, enriched, scene_images


def chapter_source(chapter_dir):
    check(chapter_dir.is_dir() and not chapter_dir.is_symlink(), f'章节目录非法：{chapter_dir}')
    expected = {'course.json'}
    files = {}
    for path in chapter_dir.rglob('*'):
        check(not path.is_symlink(), f'不允许课程目录包含符号链接: {path}')
        if path.is_dir():
            check(path == chapter_dir / 'images', f'章节内出现非预期文件夹: {path}')
            continue
        rel = path.relative_to(chapter_dir).as_posix()
        check(rel in ('course.json', 'glossary.json') or (rel.startswith('images/') and SCENE_FILE.fullmatch(rel[7:])),
              f'章节内出现不支持的文件: {path}')
        if rel != 'course.json':
            files[rel] = path
        expected.add(rel)
    check('course.json' in expected and (chapter_dir / 'course.json').is_file(), f'章节缺少 course.json: {chapter_dir}')
    check(len(expected) <= MAX_CHAPTER_FILES, f'章节文件数量超过 {MAX_CHAPTER_FILES}: {chapter_dir}')
    check(sum((chapter_dir / p).stat().st_size for p in expected) <= MAX_CHAPTER_TOTAL, f'章节文件体积超过限制: {chapter_dir}')
    return read_json(chapter_dir / 'course.json'), files


def collect(packages_dir):
    """Validate all source, including drafts; return published lessons and referenced assets."""
    chapters, books, used_ids, used_notes, used_sentence_ids, used_numbers = [], set(), set(), set(), set(), set()
    book_profiles = {}
    assets = {}
    if not packages_dir.exists():
        return chapters, assets, books, book_profiles
    check(packages_dir.is_dir() and not packages_dir.is_symlink(), 'packages 必须是普通文件夹')
    for child in sorted(packages_dir.iterdir()):
        check(not child.is_symlink(), f'不允许课程仓库包含符号链接: {child}')
        if child.is_file():
            check(child.name in ('README.md', '.gitkeep'),
                  f'不支持 packages 根目录文件 {child.name}；请按作品建立文件夹，不要直接放 ZIP')
            continue
        book = load_book(child)
        books.add(book['book_id'])
        guide, cast, portraits = optional_book_content(child)
        for book_file in child.iterdir():
            check(not book_file.is_symlink(), f'不允许符号链接: {book_file}')
            check(book_file.name in ('book.json', 'cover.webp', 'hero.webp', 'chapters', 'course-guide.json', 'characters.json', 'characters'), f'作品目录不支持此文件: {book_file}')
        if (child / 'cover.webp').exists():
            assert_webp(child / 'cover.webp')
        if (child / 'hero.webp').exists():
            assert_webp(child / 'hero.webp')
        # Profiles are emitted only when both the book and at least one chapter
        # are published. Never package drafts or unused cast portraits.
        if book['status'] == 'published':
            book_profiles[book['book_id']] = {
                'book_id': book['book_id'], 'title': book['title'],
                'title_zh': book.get('title_zh', ''), 'publication_state': book.get('publication_state','ongoing'), 'guide': guide, 'characters': cast,
                'hero': f'assets/heroes/{book["book_id"]}.webp' if (child / 'hero.webp').is_file() else None,
                '_hero_source': child / 'hero.webp' if (child / 'hero.webp').is_file() else None,
                'portrait_paths': {c['id']: f'assets/characters/{book["book_id"]}/{c["id"]}.webp'
                                   for c in cast if c.get('portrait')},
                '_portrait_sources': portraits,
            }
        chapter_root = child / 'chapters'
        if not chapter_root.exists():
            continue
        check(chapter_root.is_dir() and not chapter_root.is_symlink(), f'非法章节目录：{chapter_root}')
        for ch_dir in sorted(chapter_root.iterdir()):
            check(CHAPTER_FOLDER.fullmatch(ch_dir.name) is not None, f'必须使用 ch001 等章节目录名: {ch_dir}')
            lesson, files = chapter_source(ch_dir)
            normalized, num, enriched, scene_images = validate_chapter(lesson, book, ch_dir, files)
            chapter_id = normalized['chapter_id']
            check(chapter_id not in used_ids, f'重复章节 ID: {chapter_id}')
            check((book['book_id'], num) not in used_numbers, f'重复作品章节序号: {book["book_id"]} / {num}')
            used_ids.add(chapter_id)
            used_numbers.add((book['book_id'], num))
            for note in enriched:
                check(note['id'] not in used_notes, f'跨章节重复知识点 ID: {note["id"]}')
                used_notes.add(note['id'])
            for sentence_id in normalized['ids']:
                check(sentence_id not in used_sentence_ids, f'跨章节重复句子 ID: {sentence_id}')
                used_sentence_ids.add(sentence_id)
            if book['status'] != 'published' or normalized['status'] != 'published':
                continue
            cover = f'assets/covers/{book["book_id"]}.webp' if (child / 'cover.webp').is_file() else None
            if cover:
                assets[cover] = child / 'cover.webp'
            for sid, asset_path in scene_images.items():
                assets[asset_path] = files[f'images/{sid}.webp']
            rel = f'courses/{chapter_id}.json'
            chapters.append({
                'chapter_id': chapter_id, 'book_id': book['book_id'], 'chapter_number': num,
                'title': normalized['chapter'], 'chapter': normalized['chapter'],
                'book': book['title'], 'level': book['level'], 'genre': book['genre'],
                'subtitle': normalized.get('subtitle', ''), 'synopsis': book.get('synopsis', ''),
                'path': rel, 'cover': cover, 'scene_images': scene_images,
                'sentences_count': len(normalized['sentences']), 'ids': normalized['ids'],
                'units': normalized.get('units', []),
                'annotations': enriched, '_body': normalized,
            })
    chapters.sort(key=lambda c: (c['book_id'], c['chapter_number']))
    return chapters, assets, books, book_profiles


def validate_homepage(homepage_config, chapters):
    """Validate editorial selections against the published chapter list only."""
    data = {'schema_version': 1, 'featured_book_id': None, 'sections': []}
    if homepage_config is None:
        return data
    source = Path(homepage_config)
    data = read_json(source)
    check(data.get('schema_version') == 1, '首页配置 schema_version 必须为 1')
    check(set(data) <= {'schema_version','featured_book_id','sections'}, '首页配置含有不支持的字段')
    allowed = {c['book_id'] for c in chapters}
    featured = data.get('featured_book_id')
    if featured is not None:
        valid_id(featured, '主推作品 ID')
        check(featured in allowed, f'主推作品尚未发布或不存在：{featured}')
    sections = data.get('sections', [])
    check(isinstance(sections, list) and len(sections)<=6, '首页精选栏目最多6个')
    used=set()
    for section in sections:
        check(isinstance(section,dict) and set(section)=={'id','title','book_ids'}, '首页栏目必须有 id/title/book_ids')
        valid_id(section['id'], '首页栏目 ID')
        check(section['id'] not in used, '重复首页栏目 ID')
        used.add(section['id'])
        check(isinstance(section['title'],str) and 0<len(section['title'].strip())<=60, '栏目标题无效')
        ids=section['book_ids']
        check(isinstance(ids,list) and len(ids)<=18, '每个栏目最多18部作品')
        check(len(ids)==len(set(ids)), f'首页栏目存在重复作品: {section["id"]}')
        for book_id in ids:
            valid_id(book_id,'精选作品 ID')
            check(book_id in allowed, f'精选作品尚未发布或不存在：{book_id}')
    return {'schema_version':1,'featured_book_id':featured,'sections':sections}


def build(packages_dir, output, homepage_config=None):
    packages_dir, output = Path(packages_dir).resolve(), Path(output).resolve()
    check(output not in (ROOT, CORE, packages_dir) and CORE not in output.parents and packages_dir not in output.parents,
          '输出目录不能覆盖源码或嵌套在课程和 core 下')
    check(CORE.is_dir(), f'缺少学生网站核心目录: {CORE}')
    if output.exists():
        check(output.is_dir() and not output.is_symlink() and (output / '.plotlish-generated').is_file(),
              '输出目录已存在且非工具生成，禁止删除')
    chapters, assets, books, profiles = collect(packages_dir)  # Validate before touching dist.
    homepage = validate_homepage(homepage_config, chapters)
    published_books = {c['book_id'] for c in chapters}
    # Drop books that do not yet have a published chapter. This also removes
    # book-level assets for drafts and future chapters from the public output.
    profiles = {k: v for k, v in profiles.items() if k in published_books}
    for book_id, profile in profiles.items():
        published_nums = {c['chapter_number'] for c in chapters if c['book_id'] == book_id}
        profile['characters'] = [c for c in profile['characters'] if c['intro_chapter'] in published_nums]
        profile['portrait_paths'] = {k: v for k, v in profile['portrait_paths'].items()
                                     if any(c['id'] == k for c in profile['characters'])}
        for key, rel in profile['portrait_paths'].items():
            assets[rel] = profile['_portrait_sources'][f'characters/{key}.webp']
        if profile['_hero_source'] is not None:
            assets[profile['hero']] = profile['_hero_source']
        del profile['_hero_source']
        del profile['_portrait_sources']
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.plotlish-stage-', dir=output.parent) as temp:
        temp = Path(temp)
        stage = temp / 'site'
        shutil.copytree(CORE, stage, symlinks=False)
        (stage / '.plotlish-generated').write_text('Automatically generated by Plotlish R2.5; do not edit.\n', encoding='utf8')
        (stage / 'homepage.json').write_text(json.dumps(homepage, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        destination = stage / 'courses'
        destination.mkdir(exist_ok=True)
        for c in chapters:
            (stage / c['path']).write_text(json.dumps(c.pop('_body'), ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        for rel, path in assets.items():
            target = stage / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
        catalog = {'schema_version': 'plotlish-r231-web-v2', 'chapters': chapters, 'books': profiles}
        (destination / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        previous = temp / 'previous'
        if output.exists():
            output.rename(previous)
        try:
            stage.rename(output)
        except Exception:
            if previous.exists():
                previous.rename(output)
            raise
    print(f'BUILD OK: {len(chapters)} published chapter(s), {len({c["book_id"] for c in chapters})} published book(s), {len(books)} source book(s); output={output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--packages-dir', type=Path, default=ROOT / 'packages')
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    parser.add_argument('--homepage-config', type=Path, default=None, help='站长首页推荐配置（课程内容层），纯净核心只包含空模板')
    args = parser.parse_args()
    try:
        build(args.packages_dir, args.output, args.homepage_config)
    except (ValueError, OSError) as e:
        print('BUILD FAILED:', e, file=sys.stderr)
        sys.exit(1)
