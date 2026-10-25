"""Production deployment guard tests use synthetic, non-copyrighted course data."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

TOOLS=Path(__file__).resolve().parents[1]/'tools'
sys.path.insert(0,str(TOOLS))
from check_production_cloudflare_target import determine_target
from verify_production_site import verify_production,safe_asset
from create_release_manifest import create_manifest
from verify_release_manifest import verify_manifest
from check_production_release_policy import verify_version

class ProductionReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.dist=Path(self.temp.name)
        for f in ['index.html','src/boot.js','src/reader.js','src/shell.js','src/library.js','src/styles.css']:
            path=self.dist/f
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text('synthetic test asset',encoding='utf8')
        (self.dist/'homepage.json').write_text(json.dumps({'schema_version':1,'featured_book_id':None,'sections':[]}))
        (self.dist/'courses').mkdir()
        self.write_catalog(False)
    def tearDown(self):self.temp.cleanup()
    def write_catalog(self, populated):
        chapters=[{'chapter_id':'sample-ch001','book_id':'sample','path':'courses/sample-ch001.json','sentences_count':2}] if populated else []
        obj={'schema_version':'plotlish-r231-web-v2','books':{'sample':{}} if populated else {},'chapters':chapters}
        (self.dist/'courses/catalog.json').write_text(json.dumps(obj),encoding='utf8')
        if populated:
            (self.dist/'courses/sample-ch001.json').write_text(json.dumps({
                'book_id':'sample','chapter_id':'sample-ch001','ids':['s01','s02'],
                'sentences':['A clear sentence.','Another sentence.'],
                'translations':['一句清晰的中文。','第二句中文。']}),encoding='utf8')
    def test_empty_development_build_fails_production(self):
        with self.assertRaisesRegex(ValueError,'production requires'):
            verify_production(self.dist)
    def test_valid_minimal_published_build(self):
        self.write_catalog(True)
        self.assertEqual(len(verify_production(self.dist)['chapters']),1)
    def test_blank_translations_are_blocked(self):
        self.write_catalog(True)
        path=self.dist/'courses/sample-ch001.json';data=json.loads(path.read_text());data['translations'][0]=' '
        path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'Blank translation'):
            verify_production(self.dist)
    def test_escaping_asset_paths_rejected(self):
        with self.assertRaisesRegex(ValueError,'Missing / escaping'):
            safe_asset(self.dist,'../outside.json')
    def test_release_manifest_identifies_exact_artifacts(self):
        self.write_catalog(True)
        output=create_manifest(self.dist,'a'*40,'v1.0.0-rc.1')
        self.assertEqual(output['books'],1)
        self.assertEqual(len(output['checksums']['src/reader.js']),64)
        self.assertEqual(json.loads((self.dist/'release.json').read_text())['commit'],'a'*40)
        self.assertIn('courses/sample-ch001.json',output['checksums'])
        verify_manifest(self.dist,'v1.0.0-rc.1','a'*40)
    def test_mutated_content_is_not_approved(self):
        self.write_catalog(True)
        create_manifest(self.dist,'b'*40,'v0.9.0-rc.1+build.3.1')
        path=self.dist/'courses/sample-ch001.json'
        path.write_text(path.read_text().replace('A clear sentence.','A different sentence.'))
        with self.assertRaisesRegex(ValueError,'Changed release file'):
            verify_manifest(self.dist,'v0.9.0-rc.1+build.3.1','b'*40)

    def test_added_unchecked_file_is_not_approved(self):
        self.write_catalog(True)
        create_manifest(self.dist,'c'*40,'v0.9.0-rc.1+build.2.1')
        (self.dist/'extra.html').write_text('surprise')
        with self.assertRaisesRegex(ValueError,'Files missing or unexpectedly added'):
            verify_manifest(self.dist,'v0.9.0-rc.1+build.2.1','c'*40)

    def test_release_candidates_cannot_auto_deploy(self):
        for value in ['v0.9.0-rc.1','v1.0.0-rc.3','v1.0.0-beta.2','v1.0.0+build.4','main','', 'v0.9.9']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                verify_version(value)
        self.assertEqual(verify_version('v1.0.0'), 'v1.0.0')
        self.assertEqual(verify_version('1.2.4'), '1.2.4')

    def test_reduced_motion_does_not_animate_reader_font_size(self):
        css=(TOOLS.parent/'core/src/styles.css').read_text(encoding='utf-8')
        self.assertIn('animation:none!important;transition:none!important',css)
        self.assertNotIn('transition-duration:.01ms!important',css)

    def test_wrong_cloudflare_host_or_branch_rejected(self):
        result={'success':True,'result':{'name':'plotlish','subdomain':'plotlish.pages.dev','production_branch':'main'}}
        self.assertEqual(determine_target(result),'main')
        for key,wrong in [('name','plotlish-test'),('subdomain','plotlish-test.pages.dev'),('production_branch','beta')]:
            body=json.loads(json.dumps(result));body['result'][key]=wrong
            with self.assertRaises(ValueError):determine_target(body)
    def test_git_integrated_deploy_requires_explicit_opt_in(self):
        result={'success':True,'result':{'name':'plotlish','subdomain':'plotlish.pages.dev',
            'production_branch':'main','source':{'type':'github'}}}
        with self.assertRaisesRegex(ValueError,'Git-connected'):
            determine_target(result)
        with self.assertRaisesRegex(ValueError,'Disable native'):
            determine_target(result,allow_git=True)
        result['result']['source']['config']={'production_deployments_enabled':False}
        self.assertEqual(determine_target(result,allow_git=True),'main')
        result['result']['source']['config']['production_deployments_enabled']=True
        with self.assertRaisesRegex(ValueError,'Disable native'):
            determine_target(result,allow_git=True)

if __name__=='__main__':unittest.main()
