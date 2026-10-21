#!/usr/bin/env python3
"""Plotlish Pure immutable build: core + validated chapter ZIPs -> dist.
Usage: python tools/build.py [--packages-dir packages] [--output dist]
Never writes to core/ or packages/. Rejects unsafe archives and duplicate IDs.
"""
import argparse
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORE = ROOT / 'core'
ID = re.compile(r'^[a-z0-9][a-z0-9-]{1,99}$')
MAX_ZIP = 25 * 1024 * 1024
MAX_TOTAL_UNPACKED = 80 * 1024 * 1024
MAX_FILE = 25 * 1024 * 1024
MAX_FILES = 80


def check(condition, reason):
    if not condition:
        raise ValueError(reason)


def valid_id(value, where):
    check(isinstance(value, str) and ID.fullmatch(value), f'{where} 格式错误: {value!r}')


def load_course_from_zip(path):
    check(path.stat().st_size <= MAX_ZIP, f'{path.name}: ZIP 超过 25 MiB')
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        check(0 < len(infos) <= MAX_FILES, f'{path.name}: 文件数量异常')
        check(len({i.filename for i in infos}) == len(infos), f'{path.name}: 重复路径')
        total = 0
        file_names = set()
        for item in infos:
            if item.is_dir():
                continue
            total += item.file_size
            check(item.file_size <= MAX_FILE and total <= MAX_TOTAL_UNPACKED,
                  f'{path.name}: 解压体积超限')
            # Reject traversal, symlink and directories aside from images/.
            n = item.filename
            check(not n.startswith('/') and '\\' not in n and '..' not in n.split('/'),
                  f'{path.name}: 不安全的 ZIP 路径 {n!r}')
            check(((item.external_attr >> 16) & 0o170000) != 0o120000,
                  f'{path.name}: 不允许符号链接')
            check(n in ('course.json', 'glossary.json') or bool(re.fullmatch(r'images/[a-z0-9][a-z0-9-]{1,99}\.webp', n)) or n == 'cover.webp',
                  f'{path.name}: 不支持的文件 {n!r}，只允许 course.json、glossary.json、cover.webp、images/<scene-id>.webp')
            file_names.add(n)
        check('course.json' in file_names, f'{path.name}: 缺少 course.json')
        check(z.getinfo('course.json').file_size <= 2_000_000, f'{path.name}: JSON 超过 2 MB')
        course = json.loads(z.read('course.json').decode('utf-8'))
        check(isinstance(course, dict), f'{path.name}: course.json 必须是对象')
        required = ['book', 'book_id', 'chapter', 'chapter_id', 'sentences', 'ids', 'translations']
        check(all(key in course for key in required), f'{path.name}: 缺少必需字段')
        valid_id(course['book_id'], 'book_id')
        valid_id(course['chapter_id'], 'chapter_id')
        for field in ['book', 'chapter']:
            check(isinstance(course[field], str) and course[field].strip(), f'{path.name}: {field} 不能为空')
        sentences, ids, trans = (course[x] for x in ('sentences', 'ids', 'translations'))
        check(all(isinstance(v, list) for v in (sentences, ids, trans)), f'{path.name}: 正文、ID、翻译必须是数组')
        check(len(sentences) > 0 and len(sentences) == len(ids) == len(trans), f'{path.name}: 正文/译文/ID 数量不一致')
        check(all(isinstance(x, str) and x.strip() for x in sentences + ids + trans), f'{path.name}: 正文或译文含空白')
        check(len(set(ids)) == len(ids), f'{path.name}: 句子 ID 重复')
        # Enforce immutable ID types; allow legacy R2.3.1 IDs without altering them.
        check(all(len(x) <= 150 for x in ids), f'{path.name}: 句子 ID 过长')
        chapter_match = re.search(r'(?:-|_)ch(?:apter)?0*([1-9][0-9]*)$', course['chapter_id'])
        if not chapter_match:
            chapter_match = re.search(r'(?:-|_)0*([1-9][0-9]*)$', course['chapter_id'])
        check(chapter_match is not None, f'{path.name}: chapter_id 必须以 -01 或 -ch01 等章节号结尾')
        number = int(chapter_match.group(1))
        check(number <= 999, f'{path.name}: 章节号超出范围')
        seen_notes = set()
        enriched = []
        for n in course.get('annotations', []):
            check(isinstance(n, dict) and isinstance(n.get('id'), str) and n['id'].strip(), f'{path.name}: 知识点 ID 无效')
            check(n['id'] not in seen_notes, f'{path.name}: 知识点 ID 重复 {n["id"]}')
            seen_notes.add(n['id'])
            i = n.get('sentenceIndex')
            check(type(i) is int and 0 <= i < len(sentences), f'{path.name}: 知识点句序无效')
            phrase = n.get('phrase')
            check(isinstance(phrase, str) and phrase.strip() and phrase.casefold() in sentences[i].casefold(),
                  f'{path.name}: 知识点短语未匹配原句')
            enriched.append({**n, 'sentence': sentences[i]})
        breaks = course.get('paragraphBreaks', [])
        check(isinstance(breaks, list) and all(type(v) is int and 0 <= v < len(sentences) for v in breaks), f'{path.name}: 段落标记越界')
        scene_images = {}
        for s in course.get('scenes', []):
            check(isinstance(s, dict), f'{path.name}: 场景格式错误')
            sid = s.get('scene_id')
            valid_id(sid, 'scene_id')
            check(sid not in scene_images, f'{path.name}: 重复场景 {sid}')
            check(type(s.get('start_index')) is int and 0 <= s['start_index'] < len(sentences),
                  f'{path.name}: 场景插入位置错误 {sid}')
            image_path = f'images/{sid}.webp'
            check(image_path in file_names, f'{path.name}: 缺少场景图片 {image_path}')
            scene_images[sid] = f'assets/scenes/{course["book_id"]}/{sid}.webp'
        check({n for n in file_names if n.startswith('images/')} == {f'images/{k}.webp' for k in scene_images},
              f'{path.name}: 有未引用的场景图片')
        images = {name: z.read(name) for name in file_names if name.endswith('.webp')}
        if 'glossary.json' in file_names:
            check(z.getinfo('glossary.json').file_size <= 2_000_000, f'{path.name}: 词典超过 2 MB')
            glossary = json.loads(z.read('glossary.json').decode('utf-8'))
            check(isinstance(glossary, dict) and all(isinstance(k, str) and isinstance(v, str) and len(k) <= 100 and len(v) <= 500 for k,v in glossary.items()), f'{path.name}: 词典数据格式无效')
            course['glossary'] = glossary
    return course, number, enriched, scene_images, images


def build(packages_dir, output):
    check(output != CORE and not CORE in output.parents, '不允许覆盖 core/')
    check(output != packages_dir and not packages_dir in output.parents, '不允许覆盖课程包目录')
    if output.exists():
        check((output / '.plotlish-generated').exists(), '输出目录已存在且并非工具生成，禁止删除')
        shutil.rmtree(output)
    shutil.copytree(CORE, output)
    (output / '.plotlish-generated').write_text('Automatically generated; do not edit here.\n', encoding='utf8')
    destination = output / 'courses'
    destination.mkdir(exist_ok=True)
    chapters, books, annotation_ids, image_owners = [], {}, set(), {}
    seen_chapters = set()
    archives = sorted(packages_dir.glob('*.zip')) if packages_dir.exists() else []
    for archive in archives:
        course, num, enriched, scene_images, images = load_course_from_zip(archive)
        book_id, chapter_id = course['book_id'], course['chapter_id']
        check(chapter_id not in seen_chapters, f'重复章节 ID: {chapter_id}')
        seen_chapters.add(chapter_id)
        check((book_id, num) not in [(v['book_id'], v['chapter_number']) for v in chapters], f'重复作品章节序号: {book_id} / {num}')
        for n in enriched:
            check(n['id'] not in annotation_ids, f'跨章节重复知识点 ID：{n["id"]}')
            annotation_ids.add(n['id'])
        if book_id in books:
            check(books[book_id] == course['book'], f'{archive.name}: book_id 对应的作品名不一致')
        books[book_id] = course['book']
        for name, content in images.items():
            if name == 'cover.webp':
                dest = output / 'assets' / 'covers' / f'{book_id}.webp'
            else:
                dest = output / scene_images[name[len('images/'):-len('.webp')]]
            if dest in image_owners:
                check(image_owners[dest] == content, f'{archive.name}: 同一路径存在不同图片 {dest}')
            image_owners[dest] = content
        rel = f'courses/{chapter_id}.json'
        (output / rel).write_text(json.dumps(course, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
        chapters.append({
            'chapter_id': chapter_id, 'book_id': book_id, 'chapter_number': num,
            'title': course['chapter'], 'chapter': course['chapter'], 'book': course['book'],
            'level': course.get('level','Unrated'), 'genre': course.get('genre','English story'),
            'subtitle': course.get('subtitle',''), 'synopsis': course.get('synopsis',''),
            'path': rel, 'cover': None,
            'scene_images': scene_images, 'sentences_count': len(course['sentences']),
            'ids': course['ids'], 'annotations': enriched,
        })
    for dest, raw in image_owners.items():
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(raw)
    for c in chapters:
        cover = f'assets/covers/{c["book_id"]}.webp'
        c['cover'] = cover if (output / cover).is_file() else None
    chapters.sort(key=lambda c:(c['book_id'], c['chapter_number']))
    (destination / 'catalog.json').write_text(json.dumps({'schema_version':'plotlish-r231-web-v2','chapters':chapters},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(f'BUILD OK: {len(chapters)} chapter(s), {len(books)} work(s); output={output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--packages-dir',type=Path,default=ROOT/'packages')
    parser.add_argument('--output',type=Path,default=ROOT/'dist')
    args=parser.parse_args()
    try:
        build(args.packages_dir.resolve(),args.output.resolve())
    except Exception as e:
        print('BUILD FAILED:', e, file=sys.stderr)
        sys.exit(1)
