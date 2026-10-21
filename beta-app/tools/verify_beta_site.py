#!/usr/bin/env python3
"""Build output safeguards for Plotlish Beta, independent of the old main site."""
import json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
D=R/'dist'
cat=json.loads((D/'courses/catalog.json').read_text(encoding='utf8'))
assert cat.get('schema_version')=='plotlish-r231-web-v2','意外的课程数据格式'
chapters=cat.get('chapters')
assert isinstance(chapters,list) and chapters, '生成的书架为空'
ids={c['chapter_id'] for c in chapters}
required={'last-platform-01', 'evil-supporting-role-ch01'}
assert required.issubset(ids),f'基础两章丢失：{sorted(required-ids)}'
assert len(ids)==len(chapters),'存在重复章节 ID'
for c in chapters:
    assert c.get('sentences_count',0)>0, f"空章节：{c['chapter_id']}"
    assert (D/c['path']).is_file(), f"缺少章节：{c['chapter_id']}"
    if c.get('cover'):assert (D/c['cover']).is_file(), f"缺少封面：{c['chapter_id']}"
    for p in c.get('scene_images',{}).values():
        assert (D/p).is_file(), f"缺少插图：{c['chapter_id']}"
for bad in ['author','private_publish_history','packages','tools','.github']:
    assert not (D/bad).exists(),f'私有或开发文件被放入公开站点：{bad}'
assert (D/'index.html').is_file(), '未生成 index.html'
print(f'BETA SITE CHECK OK: {len(chapters)} chapters, target is plotlish-test only')
