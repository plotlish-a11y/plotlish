"""R2.4 offline automated tests: dummy fixtures live only in temporary directories."""
import json
import base64
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build import build
from import_chapter import import_chapter
from verify_beta_site import verify_site


WEBP_WHITE = base64.b64decode('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAUAmJaQAA3AA/vz0AAA=')
WEBP_BLACK = base64.b64decode('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAUAmJaQAA3AA/v02aAA=')


def make_book(packages, name='alpha-book', **changes):
    book = dict(schema_version='plotlish-book-v1', book_id=name, title='Alpha Book',
                title_zh='测试小说', level='B1', genre='Adventure',
                synopsis='Book synopsis.', status='published')
    book.update(changes)
    folder = packages / name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'book.json').write_text(json.dumps(book, ensure_ascii=False), encoding='utf8')
    return folder


def make_chapter(book, no=1, **updates):
    name = book.name
    data = dict(chapter_id=f'{name}-ch{no:03d}', chapter=f'Chapter {no}', status='published',
                sentences=['A simple sentence.', 'Another simple sentence.'],
                ids=[f'{name}-s{no:03d}-001', f'{name}-s{no:03d}-002'],
                translations=['这是第一句。', '这是第二句。'],
                annotations=[], scenes=[], paragraphBreaks=[0])
    data.update(updates)
    path = book / 'chapters' / f'ch{no:03d}'
    path.mkdir(parents=True, exist_ok=True)
    (path / 'course.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf8')
    return path


def make_zip(path, data, files=None):
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('course.json', json.dumps(data, ensure_ascii=False))
        for k, v in (files or {}).items():
            z.writestr(k, v)
    return path


def cat(dist):
    return json.loads((dist / 'courses' / 'catalog.json').read_text(encoding='utf8'))['chapters']


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.tmp = Path(self.temp.name)
        self.packages = self.tmp / 'packages'
        self.packages.mkdir()
        self.out = self.tmp / 'dist'

    def compile(self):
        build(self.packages, self.out)
        verify_site(self.out)
        return cat(self.out)

    def test_deployment_guard_rejects_empty_site_but_allows_local_core_build(self):
        self.assertEqual(self.compile(), [])
        with self.assertRaisesRegex(AssertionError, '缺少作品'):
            verify_site(self.out, require_book='the-runaway-bride')
        with self.assertRaisesRegex(AssertionError, '缺少章节'):
            verify_site(self.out, require_chapter='the-runaway-bride-ch001')

    def test_deployment_guard_accepts_published_chapter_and_checks_counts(self):
        make_chapter(make_book(self.packages))
        self.compile()
        verify_site(self.out, require_book='alpha-book',
                    require_chapter='alpha-book-ch001', require_sentences=2,
                    require_scenes=0)
        with self.assertRaisesRegex(AssertionError, '句子数不符'):
            verify_site(self.out, require_chapter='alpha-book-ch001', require_sentences=3)
        with self.assertRaisesRegex(AssertionError, '场景数量不符'):
            verify_site(self.out, require_chapter='alpha-book-ch001', require_scenes=1)

    def test_r28_online_only_dictionary_and_quick_reader_settings(self):
        reader=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        html=(ROOT/'core/index.html').read_text(encoding='utf8')
        styles=(ROOT/'core/src/styles.css').read_text(encoding='utf8')
        for marker in ('dictionary.cambridge.org/dictionary/english-chinese-simplified/',
                       'cn.bing.com/dict/?mkt=zh-CN&setlang=ZH&q=',
                       "link.target='_blank'", "link.rel='noopener noreferrer'",
                       "prefs.dictionaryProvider==='bing'?'bing':'cambridge'",
                       'dictionaryProvider:"cambridge"', "brian/i.test(v.name"):
            self.assertIn(marker, reader)
        for marker in ('id="dictionaryProvider"','id="quickVoice"','id="quickVoicePanel"',
                       'id="quickTranslation"','id="quickTranslationPanel"',
                       'data-quick-translation="hidden"','data-quick-translation="current"',
                       'data-quick-translation="bilingual"'):
            self.assertIn(marker, html)
        for removed in ('id="hoverWordDetail"','id="quickClick"','id="quickAuto"',
                        'id="presetButtons"','id="translationMode"'):
            self.assertNotIn(removed, html)
        self.assertNotIn('本地暂未收录', reader)
        self.assertNotIn('HOVER_DICTIONARY', reader)
        self.assertIn('readerQuickPanel', styles)

    def test_reading_only_completion_has_no_exercise_controls(self):
        html=(ROOT/'core/index.html').read_text(encoding='utf8')
        js=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        for obsolete in ('id="reflection"', 'id="reviewQuestion"',
                         'id="showReviewHint"', 'id="grammarTitle"'):
            self.assertNotIn(obsolete, html)
        for required in ('id="reviewReturn"','id="reviewWords"',
                         'id="reviewHome"','id="reviewBook"'):
            self.assertIn(required,html)
        self.assertNotIn("$('reflection').addEventListener",js)
        self.assertIn('FINISHED READING',js)

    def test_r27_shelf_uses_compact_horizontal_cards(self):
        css=(ROOT/'core/src/styles.css').read_text(encoding='utf8')
        self.assertIn('#shelfView .shelfBookGrid{display:grid;grid-template-columns:minmax(0,1fr)',css)
        self.assertIn('#shelfView .shelfBookCard{display:flex;flex-direction:row',css)
        self.assertIn('#shelfView .shelfBookCover{flex:none;width:112px;height:168px',css)
        self.assertIn('#shelfView .shelfBookCover img{width:100%;height:100%;object-fit:contain}',css)
        self.assertIn('#shelfView .shelfChip{display:inline-flex;',css)
        self.assertIn('#shelfView .shelfBookCover{width:92px;height:138px',css)
        self.assertNotIn('#shelfView .shelfBookCover{width:100%;height:230px',css)

    def test_r27_shelf_progress_not_guessed(self):
        js=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        self.assertIn("if(status!=='want'&&pct!==null)",js)
        self.assertIn("track.setAttribute('aria-valuenow',String(pct))",js)
        self.assertIn("fill.style.width=pct+'%'",js)
        self.assertNotIn('pct??8',js)

    def test_r27_c_reader_companion_is_generic(self):
        html=(ROOT/'core/index.html').read_text(encoding='utf8')
        js=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        for marker in ('id="sceneCompanion"','id="companionImageButton"',
                       'id="companionHideScene"','id="companionImage"'):
            self.assertIn(marker,html)
        self.assertIn('function paintSceneCompanion()',js)
        self.assertIn('companionSceneAt(state.selected)',js)
        self.assertIn('function openSceneModal(scene)',js)
        self.assertNotIn('the-runaway-bride',html)

    def test_r27_c_only_reached_scene_is_displayed(self):
        js=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        self.assertIn('s.start_index<=index&&sceneData[s.scene_id]',js)
        self.assertNotIn('||course.scenes[0];if(found)openSceneModal(found)',js)

    def test_r27_c_mobile_images_not_clipped(self):
        css=(ROOT/'core/src/styles.css').read_text(encoding='utf8')
        js=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        self.assertIn('aspect-ratio:4/3;object-fit:contain',css)
        self.assertIn('height:auto!important',css)
        self.assertIn("current.push({type:'scene',sceneIndex:i})",js)
        self.assertIn('if(tryHeight([...current,lead])>maxH)flush()',js)
        self.assertNotIn('compactHeight:32',js)

    def test_r27_c_illustrations_follow_reader_mode(self):
        js=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        self.assertIn('window.innerWidth<=800||!prefs.explain',js)
        self.assertIn('paintSceneCompanion();paintExplanation()',js)
        self.assertIn('if(inlineScenes()&&prefs.scenes&&scene',js)

    def test_r27_c_pagination_reflow_reveals_page_before_measure(self):
        js=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        self.assertIn("$('pageText').hidden=prefs.mode==='scroll';$('scrollText').hidden=prefs.mode!=='scroll';if(prefs.mode==='pages')paginate()",js)
        self.assertIn("const inlineScenes=()=>window.innerWidth<=800||!prefs.explain",js)

    def test_r27_c_core_has_no_course_assets(self):
        # A published build with zero packages remains empty; test pictures are external.
        self.assertEqual(self.compile(),[])
        self.assertFalse((self.out/'assets').exists())
        self.assertFalse((ROOT/'packages'/'the-runaway-bride').exists())

    def test_r26_stage2_cinematic_home_reuses_imported_hero(self):
        src=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        css=(ROOT/'core/src/styles.css').read_text(encoding='utf8')
        self.assertIn("feature.classList.toggle('hasStoryHero',!!hero)",src)
        self.assertIn('feature.style.backgroundImage=hero?',src)
        self.assertIn('#homeView .shelfFeature.hasStoryHero',css)
        self.assertNotIn('the-runaway-bride',src)

    def test_r26_stage2_full_cover_and_one_book_layout(self):
        css=(ROOT/'core/src/styles.css').read_text(encoding='utf8')
        js=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        self.assertIn('#storiesView .discoverBookGrid.singleBook',css)
        self.assertIn('#storiesView .discoverNovelCover img{height:100%;width:100%;object-fit:contain',css)
        self.assertIn("root.classList.toggle('singleBook',selected.length===1)",js)

    def test_r26_stage2_pure_empty_has_no_fake_artwork(self):
        boot=(ROOT/'core/src/boot.js').read_text(encoding='utf8')
        css=(ROOT/'core/src/styles.css').read_text(encoding='utf8')
        shell=(ROOT/'core/src/shell.js').read_text(encoding='utf8')
        self.assertIn("classList.add('noPublishedCourses')",shell)
        self.assertIn("await install('./src/shell.js')",boot)
        self.assertIn('#homeView.noPublishedCourses .shelfFeature',css)
        for token in ('the-runaway-bride','/assets/heroes/','/assets/covers/'):
            self.assertNotIn(token,boot)

    def test_r26_stage2_shelf_discovery_structure(self):
        html=(ROOT / 'core/index.html').read_text(encoding='utf8')
        for required in ('id="homeBookGrid"', 'id="storyBookGrid"', 'id="storySearch"',
                         'id="storyGenre"', 'id="storyLevel"', 'id="homeResumePanel"',
                         'id="homeExplore"', 'id="shelfStatCompleted"'):
            self.assertIn(required, html)
        self.assertNotIn('id="homeDiscover"', html)
        self.assertNotIn('id="discoverBook"', html)

    def test_r26_stage2_dynamic_cards_and_route_handlers(self):
        script=(ROOT / 'core/src/reader.js').read_text(encoding='utf8')
        self.assertIn('function uniqueBooks()', script)
        self.assertIn('function refreshShelfAndEditorial()', script)
        self.assertIn('function setupStoryFilters()', script)
        self.assertIn("bindClick('homeExplore',()=>route('stories'))", script)
        self.assertIn("if(view==='stories')refreshStoryResults()", script)
        self.assertIn("const PREFIX='plotlish.student.r21.'", script)
        self.assertNotIn('applyCard(card,course,scope,true)', script)

    def test_r26_stage2_draft_site_keeps_empty_library_shell(self):
        make_book(self.packages,status='draft')
        self.compile()
        html=(self.out/'index.html').read_text(encoding='utf8')
        boot=(self.out/'src/boot.js').read_text(encoding='utf8')
        self.assertIn('id="shelfEmpty"', html)
        self.assertIn("$('shelfEmpty').hidden=false", (self.out/'src/shell.js').read_text(encoding='utf8'))
        self.assertIn("$('storyEmpty').hidden=false", (self.out/'src/shell.js').read_text(encoding='utf8'))
        self.assertIn('id="resetStoryFilters"', html)

    def test_r26_stage2_no_changes_to_chapter_contract(self):
        script=(ROOT / 'core/src/reader.js').read_text(encoding='utf8')
        for token in ('function renderCourseProfile()', 'function makeUnitLinks(',
                      'function goReader(', 'function persist()', 'function migrateR2()'):
            self.assertIn(token,script)

    def test_r26_hero_asset_is_published_in_profile_and_output(self):
        book = make_book(self.packages)
        (book / 'hero.webp').write_bytes(WEBP_WHITE)
        make_chapter(book)
        built = self.compile()
        self.assertEqual(len(built), 1)
        profile = json.loads((self.out / 'courses/catalog.json').read_text())['books']['alpha-book']
        self.assertEqual(profile['hero'], 'assets/heroes/alpha-book.webp')
        self.assertTrue((self.out / profile['hero']).is_file())
        self.assertEqual((self.out / profile['hero']).read_bytes(), WEBP_WHITE)

    def test_r26_missing_hero_falls_back_without_broken_reference(self):
        book = make_book(self.packages)
        make_chapter(book)
        self.compile()
        profile = json.loads((self.out / 'courses/catalog.json').read_text())['books']['alpha-book']
        self.assertIsNone(profile['hero'])
        self.assertFalse((self.out / 'assets/heroes/alpha-book.webp').exists())

    def test_r26_draft_hero_never_leaks_into_public_build(self):
        book = make_book(self.packages, status='draft')
        (book / 'hero.webp').write_bytes(WEBP_WHITE)
        make_chapter(book)
        self.compile()
        catalog = json.loads((self.out / 'courses/catalog.json').read_text())
        self.assertEqual(catalog['books'], {})
        self.assertFalse((self.out / 'assets/heroes/alpha-book.webp').exists())

    def test_r26_draft_chapter_never_leaks_hero_when_book_is_published(self):
        book = make_book(self.packages)
        (book / 'hero.webp').write_bytes(WEBP_WHITE)
        make_chapter(book, status='draft')
        self.compile()
        catalog = json.loads((self.out / 'courses/catalog.json').read_text())
        self.assertEqual(catalog['books'], {})
        self.assertFalse((self.out / 'assets/heroes/alpha-book.webp').exists())

    def test_r26_hero_rejects_invalid_image_and_unknown_root_files(self):
        book = make_book(self.packages)
        make_chapter(book)
        (book / 'hero.webp').write_bytes(b'FAKE IMAGE')
        with self.assertRaises(ValueError):
            build(self.packages, self.out)
        (book / 'hero.webp').unlink()
        (book / 'random-cover.webp').write_bytes(WEBP_WHITE)
        with self.assertRaises(ValueError):
            build(self.packages, self.out)

    def test_r26_book_html_hooks_and_a11y_tabs_present(self):
        site = ROOT / 'core' / 'index.html'
        markup = site.read_text(encoding='utf8')
        for key in ['bookHeroArtwork','bookHeroTitleZh','bookHeroStart','bookHeroChapters',
                    'courseIntroPanel','courseLearningPanel','bookRead','bookChapterSection']:
            self.assertIn(f'id="{key}"', markup)
        self.assertIn('aria-controls="courseIntroPanel"', markup)
        self.assertIn('aria-selected="false" tabindex="-1"', markup)
        self.assertNotIn('id="bookTabCharacters"', markup)
        self.assertNotIn('id="courseCharactersPanel"', markup)

    def test_r26_single_character_gallery_shares_single_roster(self):
        script=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        self.assertIn("if(roster.length)makeCast(highlights,roster);",script)
        self.assertNotIn("roster.slice(0,4)",script)
        self.assertNotIn("$('courseCharactersPanel')",script)
        self.assertEqual(script.count('makeCast(highlights,roster)'),1)

    def test_r26_hero_tags_not_repeated_in_eyebrow(self):
        script=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
        self.assertIn("textContent='PLOTLISH ORIGINAL · ENGLISH FICTION'",script)
        self.assertNotIn("toUpperCase()+' · '+course.level+' · PLOTLISH ORIGINAL'",script)

    def test_r26_zero_catalog_hides_irrelevant_filters(self):
        script=(ROOT/'core/src/boot.js').read_text(encoding='utf8')
        style=(ROOT/'core/src/styles.css').read_text(encoding='utf8')
        self.assertIn("querySelector('.discoverToolbar').hidden=true",(ROOT/'core/src/shell.js').read_text(encoding='utf8'))
        self.assertIn('discoverToolbar[hidden]{display:none!important}',style)

    def test_r26_header_detail_navigation_label_is_truthful(self):
        html=(ROOT/'core/index.html').read_text(encoding='utf8')
        self.assertIn('id="homeBookDetail" type="button">查看作品详情</button>',html)
        self.assertNotIn('data-course-tab="characters"',html)

    def test_r27_empty_homepage_config_is_emitted(self):
        self.compile()
        cfg=json.loads((self.out/'homepage.json').read_text())
        self.assertEqual(cfg,{'schema_version':1,'featured_book_id':None,'sections':[]})
        self.assertTrue((self.out/'src/library.js').exists())
        self.assertTrue((self.out/'src/shell.js').exists())

    def test_r27_editorial_selects_only_public_books(self):
        book=make_book(self.packages)
        make_chapter(book)
        config=self.tmp/'homepage.json'
        data={'schema_version':1,'featured_book_id':'alpha-book','sections':[{'id':'editors','title':'编辑精选','book_ids':['alpha-book']}]}
        config.write_text(json.dumps(data),encoding='utf8')
        build(self.packages,self.out,config)
        verify_site(self.out)
        self.assertEqual(json.loads((self.out/'homepage.json').read_text()),data)

    def test_r27_draft_recommended_book_is_rejected(self):
        book=make_book(self.packages,status='draft')
        make_chapter(book)
        config=self.tmp/'homepage.json'
        config.write_text(json.dumps({'schema_version':1,'featured_book_id':'alpha-book','sections':[]}),encoding='utf8')
        with self.assertRaises(ValueError):build(self.packages,self.out,config)
        self.assertFalse(self.out.exists())

    def test_r27_unknown_recommendation_is_rejected(self):
        config=self.tmp/'homepage.json'
        config.write_text(json.dumps({'schema_version':1,'featured_book_id':None,'sections':[{'id':'staff','title':'精选','book_ids':['missing-book']}]}),encoding='utf8')
        with self.assertRaises(ValueError):build(self.packages,self.out,config)

    def test_r27_personal_library_is_separate_from_legacy_records(self):
        js=(ROOT/'core/src/library.js').read_text()
        html=(ROOT/'core/index.html').read_text()
        reader=(ROOT/'core/src/reader.js').read_text()
        self.assertIn('plotlish.reader.library.v1',js)
        self.assertIn('id="shelfView"',html)
        self.assertIn('id="navHome"',html)
        self.assertIn('id="navLibrary"',html)
        self.assertIn("const PREFIX='plotlish.student.r21.'",reader)
        self.assertIn('LIBRARY.add(course.book_id)',reader)
        self.assertIn('LIBRARY.get()',reader)
        self.assertIn('editorialSectionTitle',reader)
        self.assertIn('schema:4,bookId:',reader)

    def test_r27_no_novel_assets_in_core(self):
        files=[p for p in (ROOT/'core').rglob('*') if p.is_file()]
        self.assertFalse(any(p.suffix.lower() in ('.webp','.png','.jpg','.jpeg') for p in files))
        for p in files:
            if p.suffix in ('.js','.html','.json'):
                self.assertNotIn('the-runaway-bride',p.read_text(encoding='utf8'))

    def test_r25_course_profile_and_units_are_published(self):
        book = make_book(self.packages)
        (book / 'course-guide.json').write_text(json.dumps({
            'schema_version':'plotlish-course-guide-v1','tagline':'Hello',
            'intro':'An introduction.', 'learning_goals':['Practice reading'],
            'study_tips':['Read first']}, ensure_ascii=False), encoding='utf8')
        (book / 'characters.json').write_text(json.dumps({
            'schema_version':'plotlish-characters-v1','characters':[
                {'id':'hero','name':'Hero','name_zh':'主角','intro_chapter':1,
                 'role':'Lead','bio':'A spoiler-free bio.','portrait':'characters/hero.webp'}
            ]},ensure_ascii=False),encoding='utf8')
        (book / 'characters').mkdir()
        (book / 'characters/hero.webp').write_bytes(WEBP_WHITE)
        ch=make_chapter(book, 1, units=[
            {'unit_id':'alpha-book-ch001-part01','title':'Opening',
             'start_id':'alpha-book-s001-001'},
            {'unit_id':'alpha-book-ch001-part02','title':'Second',
             'start_id':'alpha-book-s001-002'}])
        compiled=self.compile()
        catalog=json.loads((self.out/'courses/catalog.json').read_text())
        profile=catalog['books']['alpha-book']
        self.assertEqual(len(profile['characters']),1)
        self.assertEqual(profile['guide']['intro'],'An introduction.')
        self.assertTrue((self.out/profile['portrait_paths']['hero']).is_file())
        self.assertEqual(len(compiled[0]['units']),2)
        self.assertEqual(json.loads((self.out/compiled[0]['path']).read_text())['units'][1]['start_id'],'alpha-book-s001-002')

    def test_r25_draft_book_profile_and_portraits_never_public(self):
        book=make_book(self.packages,status='draft')
        (book/'course-guide.json').write_text(json.dumps({'schema_version':'plotlish-course-guide-v1','intro':'DRAFT PRIVATE'}))
        (book/'characters.json').write_text(json.dumps({'schema_version':'plotlish-characters-v1','characters':[
            {'id':'hero','name':'Hero','intro_chapter':1,'portrait':'characters/hero.webp'}]}))
        (book/'characters').mkdir()
        (book/'characters/hero.webp').write_bytes(WEBP_BLACK)
        make_chapter(book)
        self.assertEqual(self.compile(),[])
        self.assertNotIn('alpha-book',json.loads((self.out/'courses/catalog.json').read_text())['books'])
        self.assertFalse((self.out/'assets/characters').exists())

    def test_r25_no_profile_emitted_for_no_published_chapters(self):
        book=make_book(self.packages)
        (book/'course-guide.json').write_text(json.dumps({'schema_version':'plotlish-course-guide-v1','intro':'PRIVATE UNTIL RELEASE'}))
        make_chapter(book,status='draft')
        self.assertEqual(self.compile(),[])
        self.assertEqual(json.loads((self.out/'courses/catalog.json').read_text())['books'],{})

    def test_r25_locked_cast_not_published_until_chapter_is_available(self):
        book=make_book(self.packages)
        (book/'characters.json').write_text(json.dumps({'schema_version':'plotlish-characters-v1','characters':[
            {'id':'one','name':'One','intro_chapter':1,'portrait':''},
            {'id':'five','name':'Five','intro_chapter':5,'portrait':''}]}))
        make_chapter(book)
        self.compile()
        cast=json.loads((self.out/'courses/catalog.json').read_text())['books']['alpha-book']['characters']
        self.assertEqual([c['id'] for c in cast],['one'])

    def test_r25_units_have_to_point_to_known_stable_ids(self):
        book=make_book(self.packages)
        make_chapter(book,units=[{'unit_id':'wrong-unit','title':'First','start_id':'unknown'}])
        with self.assertRaisesRegex(ValueError,'单元起始句 ID 不存在'):self.compile()

    def test_r25_units_must_appear_in_increasing_order(self):
        book=make_book(self.packages)
        make_chapter(book,units=[
            {'unit_id':'later','title':'Second','start_id':'alpha-book-s001-002'},
            {'unit_id':'earlier','title':'First','start_id':'alpha-book-s001-001'}])
        with self.assertRaisesRegex(ValueError,'单元必须按阅读顺序排列'):self.compile()

    def test_r25_character_portraits_cannot_be_unreferenced(self):
        book=make_book(self.packages)
        (book/'characters').mkdir()
        (book/'characters/unreferenced.webp').write_bytes(WEBP_WHITE)
        make_chapter(book)
        with self.assertRaisesRegex(ValueError,'人物立绘与 characters.json 引用不匹配'):self.compile()

    def test_r25_profile_validation_failure_does_not_destroy_previous_site(self):
        book=make_book(self.packages)
        make_chapter(book)
        self.compile()
        before=(self.out/'courses/catalog.json').read_bytes()
        (book/'course-guide.json').write_text(json.dumps({'schema_version':'bad-version','intro':'Error'}))
        with self.assertRaisesRegex(ValueError,'schema_version'):build(self.packages,self.out)
        self.assertEqual((self.out/'courses/catalog.json').read_bytes(),before)

    def test_empty_library(self):
        self.assertEqual(self.compile(), [])
        self.assertTrue((self.out / 'src/reader.js').is_file())
        self.assertFalse((self.out / 'packages').exists())

    def test_single_published_chapter(self):
        book = make_book(self.packages)
        make_chapter(book)
        c = self.compile()
        self.assertEqual(len(c), 1)
        self.assertEqual(c[0]['sentences_count'], 2)
        self.assertEqual(c[0]['book'], 'Alpha Book')
        self.assertEqual(json.loads((self.out / c[0]['path']).read_text())['genre'], 'Adventure')

    def test_chapter_sorted(self):
        book = make_book(self.packages)
        make_chapter(book, 12)
        make_chapter(book, 2)
        self.assertEqual([c['chapter_number'] for c in self.compile()], [2,12])

    def test_multiple_books_are_separated(self):
        a = make_book(self.packages)
        b = make_book(self.packages, 'bravo-book', title='Bravo Book')
        make_chapter(a); make_chapter(b)
        chapters = self.compile()
        self.assertEqual([c['book'] for c in chapters], ['Alpha Book', 'Bravo Book'])
        self.assertEqual(len({c['path'] for c in chapters}), 2)

    def test_draft_chapter_is_not_published(self):
        book = make_book(self.packages)
        make_chapter(book, 1, status='draft', sentences=['SECRET DRAFT SENTENCE.'],
                     ids=['alpha-secret-01'], translations=['草稿不会公开。'])
        make_chapter(book, 2)
        c = self.compile()
        self.assertEqual(len(c), 1)
        self.assertFalse((self.out / 'courses/alpha-book-ch001.json').exists())
        self.assertNotIn('SECRET DRAFT', (self.out / 'courses/catalog.json').read_text())
        self.assertFalse((self.out / 'packages').exists())

    def test_draft_book_hides_published_chapters(self):
        book = make_book(self.packages, status='draft')
        make_chapter(book)
        self.assertEqual(self.compile(), [])

    def test_published_book_without_chapters(self):
        make_book(self.packages)
        self.assertEqual(self.compile(), [])

    def test_invalid_course_rejected(self):
        book = make_book(self.packages)
        make_chapter(book, translations=['只有一句。'])
        with self.assertRaisesRegex(ValueError, '数量不一致'):
            self.compile()

    def test_invalid_draft_is_also_rejected(self):
        book = make_book(self.packages)
        make_chapter(book, status='draft', annotations=[{'id':'x', 'sentenceIndex':12, 'phrase':'invalid'}])
        with self.assertRaisesRegex(ValueError, '知识点句序'):
            self.compile()

    def test_duplicate_sentence_ids_between_chapters_rejected(self):
        book = make_book(self.packages)
        make_chapter(book)
        make_chapter(book, 2, ids=['alpha-book-s001-001', 'another'])
        with self.assertRaisesRegex(ValueError, '跨章节重复句子 ID'):
            self.compile()

    def test_duplicate_annotation_ids_rejected(self):
        book = make_book(self.packages)
        note = [{'id':'note-123', 'sentenceIndex':0, 'phrase':'simple'}]
        make_chapter(book, 1, annotations=note)
        make_chapter(book, 2, annotations=note)
        with self.assertRaisesRegex(ValueError, '跨章节重复知识点 ID'):
            self.compile()

    def test_chapter_folder_mismatch_rejected(self):
        book = make_book(self.packages)
        make_chapter(book, 1, chapter_id='alpha-book-ch002')
        with self.assertRaisesRegex(ValueError, '目录 chNNN'):
            self.compile()

    def test_book_id_folder_mismatch_rejected(self):
        make_book(self.packages, book_id='wrong-name')
        with self.assertRaisesRegex(ValueError, 'book_id 必须与文件夹'):
            self.compile()

    def test_status_required(self):
        book = make_book(self.packages)
        chapter = make_chapter(book)
        data = json.loads((chapter / 'course.json').read_text())
        del data['status']
        (chapter / 'course.json').write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'status'):
            self.compile()

    def test_cover_and_scene_assets(self):
        book = make_book(self.packages)
        (book / 'cover.webp').write_bytes(WEBP_WHITE)
        chapter = make_chapter(book, 1, scenes=[{'scene_id':'opening', 'start_index':0, 'title':'Opening'}])
        (chapter / 'images').mkdir()
        (chapter / 'images/opening.webp').write_bytes(WEBP_BLACK)
        c = self.compile()[0]
        self.assertTrue((self.out / c['cover']).is_file())
        self.assertTrue((self.out / c['scene_images']['opening']).is_file())

    def test_same_scene_ids_are_isolated_across_chapters(self):
        book = make_book(self.packages)
        for no in (1,2):
            ch = make_chapter(book, no, scenes=[{'scene_id':'opening','start_index':0}])
            (ch / 'images').mkdir()
            (ch / 'images/opening.webp').write_bytes(WEBP_WHITE if no == 1 else WEBP_BLACK)
        chapters = self.compile()
        self.assertNotEqual(chapters[0]['scene_images']['opening'], chapters[1]['scene_images']['opening'])
        self.assertEqual((self.out / chapters[0]['scene_images']['opening']).read_bytes(), WEBP_WHITE)

    def test_missing_image_rejected(self):
        book = make_book(self.packages)
        make_chapter(book, 1, scenes=[{'scene_id':'opening', 'start_index':0}])
        with self.assertRaisesRegex(ValueError, '插图文件与 scenes'):
            self.compile()

    def test_draft_image_not_deployed(self):
        book = make_book(self.packages, status='draft')
        (book / 'cover.webp').write_bytes(WEBP_WHITE)
        chapter = make_chapter(book, 1, scenes=[{'scene_id':'opening', 'start_index':0}])
        (chapter / 'images').mkdir()
        (chapter / 'images/opening.webp').write_bytes(WEBP_BLACK)
        self.assertEqual(self.compile(), [])
        self.assertFalse((self.out / 'assets/covers').exists())
        self.assertFalse((self.out / 'assets/scenes').exists())

    def test_missing_grammar_is_safe_to_render(self):
        book = make_book(self.packages)
        make_chapter(book)
        chapter = self.compile()[0]
        data = json.loads((self.out / chapter['path']).read_text())
        self.assertTrue(data['grammar']['term'])
        self.assertIn('question', data)
        self.assertIn('questionHelp', data)

    def test_glossary_merged(self):
        book = make_book(self.packages)
        ch = make_chapter(book)
        (ch / 'glossary.json').write_text('{"hello": "你好"}', encoding='utf8')
        c = self.compile()[0]
        self.assertEqual(json.loads((self.out / c['path']).read_text())['glossary'], {'hello': '你好'})

    def test_unknown_files_rejected(self):
        book = make_book(self.packages)
        ch = make_chapter(book)
        (ch / 'private.txt').write_text('private')
        with self.assertRaisesRegex(ValueError, '不支持的文件'):
            self.compile()

    def test_flat_zip_rejected(self):
        (self.packages / 'old-chapter.zip').write_bytes(b'any')
        with self.assertRaisesRegex(ValueError, '不要直接放 ZIP'):
            self.compile()

    def test_build_does_not_destroy_existing_success_on_error(self):
        book = make_book(self.packages)
        ch = make_chapter(book)
        self.compile()
        expected = (self.out / 'courses/catalog.json').read_bytes()
        bad = json.loads((ch / 'course.json').read_text())
        bad['translations'] = []
        (ch / 'course.json').write_text(json.dumps(bad))
        with self.assertRaises(ValueError):
            build(self.packages, self.out)
        self.assertEqual((self.out / 'courses/catalog.json').read_bytes(), expected)

    def test_never_delete_unmanaged_output(self):
        self.out.mkdir()
        (self.out / 'important.txt').write_text('do not delete')
        with self.assertRaisesRegex(ValueError, '禁止删除'):
            self.compile()
        self.assertEqual((self.out / 'important.txt').read_text(), 'do not delete')

    def test_legacy_zip_import_draft(self):
        book = make_book(self.packages)
        course = dict(chapter_id='alpha-book-ch001', chapter='Chapter 1', book='Alpha Book',
                      book_id='alpha-book', sentences=['Sentence.'], ids=['stable-001'],
                      translations=['句子。'], scenes=[], annotations=[])
        zip_path = make_zip(self.tmp / 'chapter.zip', course)
        import_chapter(zip_path, book.name, self.packages)
        self.assertEqual(json.loads((book/'chapters/ch001/course.json').read_text())['status'], 'draft')
        self.assertEqual(self.compile(), [])
        modified = json.loads((book/'chapters/ch001/course.json').read_text())
        modified['status'] = 'published'
        (book/'chapters/ch001/course.json').write_text(json.dumps(modified))
        self.assertEqual(len(self.compile()), 1)

    def test_import_zip_path_traversal_rejected(self):
        book = make_book(self.packages)
        z = self.tmp / 'bad.zip'
        with zipfile.ZipFile(z,'w') as output:
            output.writestr('course.json','{}')
            output.writestr('../danger.txt','bad')
        with self.assertRaisesRegex(ValueError, '不安全'):
            import_chapter(z, book.name, self.packages)
        self.assertFalse((self.tmp / 'danger.txt').exists())

    def test_import_refuses_implicit_overwrite(self):
        book = make_book(self.packages)
        make_chapter(book)
        z = make_zip(self.tmp / 'chapter.zip', dict(chapter_id='alpha-book-ch001',chapter='Chapter 1',
                     sentences=['Updated.'],ids=['stable-01'],translations=['更新。']))
        with self.assertRaisesRegex(ValueError, '章节已存在'):
            import_chapter(z, book.name, self.packages)
        self.assertIn('simple', (book / 'chapters/ch001/course.json').read_text())

    def test_book_title_single_source_of_truth(self):
        book = make_book(self.packages)
        ch = make_chapter(book)
        obj = json.loads((ch / 'course.json').read_text())
        obj['book'] = 'Conflicting Title'
        (ch / 'course.json').write_text(json.dumps(obj))
        with self.assertRaisesRegex(ValueError, '作品名称'):
            self.compile()

    def test_empty_shelf_has_ui_shell(self):
        self.compile()
        boot = (self.out / 'src/boot.js').read_text()
        self.assertIn("await install('./src/shell.js')", boot)
        self.assertIn('暂无已发布课程', (self.out / 'src/shell.js').read_text())


class OnlineGlossContractTests(unittest.TestCase):
    """Regression guards against reintroducing link-only hover cards."""

    @classmethod
    def setUpClass(cls):
        cls.reader = (ROOT / 'core/src/reader.js').read_text(encoding='utf-8')
        cls.html = (ROOT / 'core/index.html').read_text(encoding='utf-8')

    def test_hover_card_really_fetches_a_chinese_meaning(self):
        self.assertIn('async function requestChineseGloss(word)', self.reader)
        self.assertIn('requestChineseGloss(data.word).then(apply)', self.reader)
        self.assertIn('value.textContent=result?.meaning', self.reader)
        self.assertNotIn("label('div','在线查询英汉释义','hoverMeaning')", self.reader)

    def test_only_free_anonymous_provider_urls_are_used(self):
        self.assertIn('api.mymemory.translated.net/get', self.reader)
        self.assertIn('freedictionaryapi.com/api/v1/entries/en/', self.reader)
        self.assertIn('wordResults=new Map()', self.reader)
        self.assertIn('hoverRenderToken++', self.reader)

    def test_settings_describe_real_inline_gloss(self):
        self.assertIn('在线获取中文词义', self.html)
        self.assertIn('免费接口可能限流', self.html)

if __name__ == '__main__':
    unittest.main()
