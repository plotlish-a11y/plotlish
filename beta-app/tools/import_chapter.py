#!/usr/bin/env python3
"""Safely import a legacy one-chapter ZIP into an existing R2.4 book folder.

Example: python tools/import_chapter.py --book my-story --zip C:/Courses/ch01.zip
Default status is draft; --publish explicitly publishes the imported chapter.
"""
import argparse
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

from build import (ROOT, MAX_CHAPTER_FILES, MAX_CHAPTER_TOTAL, MAX_IMAGE, MAX_JSON,
                   SCENE_FILE, chapter_number, check, chapter_source,
                   load_book, validate_chapter, assert_webp)

MAX_ZIP = 25 * 1024 * 1024


def inspect_zip(archive):
    check(archive.is_file() and not archive.is_symlink(), f'ZIP 不存在或不是普通文件: {archive}')
    check(archive.stat().st_size <= MAX_ZIP, 'ZIP 超过 25 MiB')
    names, total = {}, 0
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        check(0 < len(infos) <= MAX_CHAPTER_FILES, 'ZIP 文件数量超过限制')
        for info in infos:
            name = info.filename
            check(not name.startswith('/') and not name.startswith('\\') and '\\' not in name
                  and all(x not in ('.', '..', '') for x in name.rstrip('/').split('/')),
                  f'ZIP 路径不安全: {name}')
            check(((info.external_attr >> 16) & 0o170000) != 0o120000, 'ZIP 不允许符号链接')
            if info.is_dir():
                check(name == 'images/', f'ZIP 不支持的文件夹: {name}')
                continue
            check(name not in names, f'ZIP 重复路径: {name}')
            check(name in ('course.json', 'glossary.json', 'cover.webp') or
                  (name.startswith('images/') and SCENE_FILE.fullmatch(name[7:])),
                  f'ZIP 不支持的文件: {name}')
            check(info.file_size <= (MAX_JSON if name.endswith('.json') else MAX_IMAGE),
                  f'ZIP 单文件过大: {name}')
            total += info.file_size
            check(total <= MAX_CHAPTER_TOTAL, 'ZIP 解压体积超限')
            names[name] = info
        check('course.json' in names, 'ZIP 缺少 course.json')
    return names


def import_chapter(archive, book_id, packages_dir, publish=False, replace=False, replace_cover=False):
    archive, packages_dir = Path(archive).resolve(), Path(packages_dir).resolve()
    from build import valid_id
    valid_id(book_id, 'book_id')
    book_dir = packages_dir / book_id
    check(book_dir.is_dir() and not book_dir.is_symlink(),
          f'先建立作品目录及 book.json，未找到: {book_dir}')
    book = load_book(book_dir)
    members = inspect_zip(archive)
    with tempfile.TemporaryDirectory(prefix='.plotlish-import-', dir=book_dir) as temporary:
        temp = Path(temporary)
        # Decompress only validated member names, never extractall().
        with zipfile.ZipFile(archive) as z:
            raw = json.loads(z.read('course.json').decode('utf8'))
            check(isinstance(raw, dict), 'ZIP course.json 必须是对象')
            number = chapter_number(raw.get('chapter_id'))
            raw['status'] = 'published' if publish else 'draft'
            stage = temp / f'ch{number:03d}'
            stage.mkdir()
            (stage / 'course.json').write_text(json.dumps(raw, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
            for name in members:
                if name in ('course.json', 'cover.webp'):
                    continue
                target = stage / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(name))
            course, files = chapter_source(stage)
            validate_chapter(course, book, stage, files)
            cover_bytes = z.read('cover.webp') if 'cover.webp' in members else None
            if cover_bytes is not None:
                check(len(cover_bytes) >= 12 and cover_bytes[:4] == b'RIFF' and cover_bytes[8:12] == b'WEBP',
                      'ZIP 封面不是 WebP 图片')
        chapters = book_dir / 'chapters'
        chapters.mkdir(exist_ok=True)
        dest = chapters / f'ch{number:03d}'
        check(not dest.exists() or replace, f'章节已存在: {dest}；如确需覆盖请传 --replace')
        cover = book_dir / 'cover.webp'
        if cover_bytes is not None and cover.exists() and cover.read_bytes() != cover_bytes:
            check(replace_cover, '作品已有不同封面；如确需替换请传 --replace-cover')
        previous = temp / 'previous'
        if dest.exists():
            check(dest.is_dir() and not dest.is_symlink(), '目标章节目录非法')
            dest.rename(previous)
        try:
            stage.rename(dest)
            if cover_bytes is not None and (not cover.exists() or replace_cover):
                cover.write_bytes(cover_bytes)
        except Exception:
            if dest.exists():
                shutil.rmtree(dest)
            if previous.exists():
                previous.rename(dest)
            raise
    print(f'IMPORT OK: {book_id}/ch{number:03d}, status={"published" if publish else "draft"}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--book', required=True, help='现有作品的 book_id（文件夹名称）')
    parser.add_argument('--zip', dest='zip_path', required=True, type=Path, help='旧版单章 ZIP 路径')
    parser.add_argument('--packages-dir', type=Path, default=ROOT / 'packages')
    parser.add_argument('--publish', action='store_true', help='导入后立即设为 published（默认 draft）')
    parser.add_argument('--replace', action='store_true', help='显式覆盖已有章节')
    parser.add_argument('--replace-cover', action='store_true', help='显式覆盖作品已有封面')
    args = parser.parse_args()
    try:
        import_chapter(args.zip_path, args.book, args.packages_dir, args.publish, args.replace, args.replace_cover)
    except (ValueError, OSError, UnicodeError, json.JSONDecodeError, zipfile.BadZipFile) as e:
        print('IMPORT FAILED:', e, file=sys.stderr)
        sys.exit(1)
