"""No proprietary novel fixture required: all tests generate dummy course JSON."""
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from build import build


def dummy(ch='01',chapter_id=None,book_id='demo-story',**updates):
    course={
        'book':'Demo Story','book_id':book_id,
        'chapter':f'Chapter {ch}','chapter_id':chapter_id or f'{book_id}-ch{ch}',
        'sentences':['A simple sentence.','Another simple sentence.'],
        'ids':[f'dummy-{ch}-001',f'dummy-{ch}-002'],
        'translations':['这是第一句。','这是第二句。'],
        'annotations':[], 'scenes':[], 'paragraphBreaks':[0],
        'genre':'Sample', 'level':'A2'
    }
    course.update(updates)
    return course


def make_zip(where,name,course,files=None):
    where.mkdir(parents=True,exist_ok=True)
    result=where/name
    with zipfile.ZipFile(result,'w') as z:
        z.writestr('course.json',json.dumps(course,ensure_ascii=False))
        for file,data in (files or {}).items():z.writestr(file,data)
    return result


class BuildTests(unittest.TestCase):
    def test_empty_site(self):
        with tempfile.TemporaryDirectory() as t:
            tmp=Path(t);pk=tmp/'packages';pk.mkdir();out=tmp/'dist'
            build(pk,out)
            self.assertEqual(json.loads((out/'courses/catalog.json').read_text())['chapters'],[])
            self.assertTrue((out/'index.html').exists())
            self.assertFalse((out/'assets/covers').exists())

    def test_new_course_without_html_edit(self):
        with tempfile.TemporaryDirectory() as t:
            tmp=Path(t);pk=tmp/'packages'
            make_zip(pk,'demo-ch01.zip',dummy())
            build(pk,tmp/'dist')
            catalog=json.loads((tmp/'dist/courses/catalog.json').read_text())
            self.assertEqual(len(catalog['chapters']),1)
            self.assertEqual(catalog['chapters'][0]['sentences_count'],2)
            self.assertTrue((tmp/'dist/courses/demo-story-ch01.json').exists())

    def test_add_second_chapter(self):
        with tempfile.TemporaryDirectory() as t:
            tmp=Path(t);pk=tmp/'pk';make_zip(pk,'first.zip',dummy())
            make_zip(pk,'second.zip',dummy(ch='02'))
            build(pk,tmp/'dist')
            chapters=json.loads((tmp/'dist/courses/catalog.json').read_text())['chapters']
            self.assertEqual([x['chapter_number'] for x in chapters],[1,2])

    def test_invalid_translation_count_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            tmp=Path(t);pk=tmp/'pk';make_zip(pk,'bad.zip',dummy(translations=['只有一条。']))
            with self.assertRaisesRegex(ValueError,'数量不一致'):build(pk,tmp/'dist')

    def test_unsafe_zip_paths_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            tmp=Path(t);pk=tmp/'pk'
            make_zip(pk,'bad.zip',dummy(),files={'../escape.txt':b'bad'})
            with self.assertRaisesRegex(ValueError,'不安全'):build(pk,tmp/'dist')
            self.assertFalse((tmp/'escape.txt').exists())

    def test_duplicate_chapter_id_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            tmp=Path(t);pk=tmp/'pk';make_zip(pk,'a.zip',dummy());make_zip(pk,'b.zip',dummy())
            with self.assertRaisesRegex(ValueError,'重复章节 ID'):build(pk,tmp/'dist')

    def test_duplicate_chapter_number_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            tmp=Path(t);pk=tmp/'pk';make_zip(pk,'a.zip',dummy())
            make_zip(pk,'b.zip',dummy(chapter_id='demo-story-01'))
            with self.assertRaisesRegex(ValueError,'重复作品章节序号'):build(pk,tmp/'dist')

    def test_wrong_image_path_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            tmp=Path(t);pk=tmp/'pk'
            make_zip(pk,'bad.zip',dummy(scenes=[{'scene_id':'demo-scene-01','start_index':0}]))
            with self.assertRaisesRegex(ValueError,'缺少场景图片'):build(pk,tmp/'dist')

    def test_duplicate_notes_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            tmp=Path(t);pk=tmp/'pk'
            note={'id':'n1','sentenceIndex':0,'phrase':'simple'}
            make_zip(pk,'bad.zip',dummy(annotations=[note,note]))
            with self.assertRaisesRegex(ValueError,'知识点 ID 重复'):build(pk,tmp/'dist')

    def test_never_delete_unmanaged_directory(self):
        with tempfile.TemporaryDirectory() as t:
            tmp=Path(t);pk=tmp/'pk';pk.mkdir();out=tmp/'private';out.mkdir();(out/'keep').write_text('important')
            with self.assertRaisesRegex(ValueError,'禁止删除'):build(pk,out)
            self.assertEqual((out/'keep').read_text(),'important')

if __name__=='__main__':unittest.main()
