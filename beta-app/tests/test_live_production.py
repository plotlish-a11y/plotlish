"""Check Cloudflare deployment separately from access to the public hostname."""
import json
import sys
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from verify_live_production import find_approved_deployment, check_public_url

class DummyResponse:
    def __init__(self, data): self.data = BytesIO(json.dumps(data).encode())
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, *args): return self.data.read(*args)

class ProductionLiveCheckTests(unittest.TestCase):
    def payload(self, environment='production', branch='main', sha='a'*40, status='success'):
        return {'success':True, 'result': [{
            'project_name':'plotlish','environment':environment,
            'deployment_trigger':{'metadata':{'branch':branch,'commit_hash':sha}},
            'latest_stage':{'status':status}, 'url':'https://example.plotlish.pages.dev'}]}
    def test_requires_exact_commit_branch_environment_and_success(self):
        self.assertIsNotNone(find_approved_deployment(self.payload(), 'a'*40))
        for key, value in [('environment','preview'),('branch','beta'),('sha','b'*40),('status','failure')]:
            with self.subTest(key=key):
                args={key:value}
                self.assertIsNone(find_approved_deployment(self.payload(**args),'a'*40))
    def test_bad_cloudflare_response_rejected(self):
        with self.assertRaises(ValueError):find_approved_deployment({'success':False,'result':[]},'a'*40)
    def test_forbidden_public_url_is_a_warning_condition(self):
        error=HTTPError('https://plotlish.pages.dev/release.json',403,'Forbidden',{},None)
        with patch('verify_live_production.urlopen',side_effect=error):
            state, message=check_public_url('https://plotlish.pages.dev/release.json',{'commit':'a'*40})
        self.assertEqual(state,'restricted')
        self.assertIn('403',message)
    def test_matching_public_version(self):
        release={'commit':'a'*40,'version':'v1.0.0'}
        with patch('verify_live_production.urlopen',return_value=DummyResponse(release)):
            self.assertEqual(check_public_url('https://plotlish.pages.dev/release.json',release)[0],'ok')
    def test_mismatched_public_version(self):
        release={'commit':'a'*40,'version':'v1.0.0'}
        with patch('verify_live_production.urlopen',return_value=DummyResponse({'commit':'b'*40})):
            self.assertEqual(check_public_url('https://plotlish.pages.dev/release.json',release)[0],'mismatch')
    def test_full_check_proceeds_with_cloudflare_verified_and_403_public(self):
        import os
        import tempfile
        from verify_live_production import main
        release={'commit':'a'*40,'version':'v1.0.0'}
        with tempfile.TemporaryDirectory() as td:
            from pathlib import Path
            import contextlib
            old=Path.cwd()
            try:
                os.chdir(td)
                Path('dist').mkdir()
                Path('dist/release.json').write_text(json.dumps(release))
                env={'CLOUDFLARE_ACCOUNT_ID_PROD':'x'*32,
                     'CLOUDFLARE_API_TOKEN_PROD':'test-token',
                     'GITHUB_SHA':'a'*40, 'EXPECT_VERSION':'v1.0.0'}
                with patch.dict(os.environ,env), \
                     patch('verify_live_production.api_payload',return_value=self.payload()), \
                     patch('verify_live_production.check_public_url',return_value=('restricted','HTTP 403')):
                    main()  # public restriction is visible as a warning, not a failed upload
            finally:
                os.chdir(old)
    def test_full_check_blocks_when_deployment_not_confirmed(self):
        import os
        import tempfile
        from verify_live_production import main
        with tempfile.TemporaryDirectory() as td:
            from pathlib import Path
            old=Path.cwd()
            try:
                os.chdir(td)
                Path('dist').mkdir()
                Path('dist/release.json').write_text(json.dumps({'commit':'a'*40,'version':'v1.0.0'}))
                env={'CLOUDFLARE_ACCOUNT_ID_PROD':'x'*32,
                     'CLOUDFLARE_API_TOKEN_PROD':'test-token',
                     'GITHUB_SHA':'a'*40, 'EXPECT_VERSION':'v1.0.0'}
                with patch.dict(os.environ,env), \
                     patch('verify_live_production.api_payload',return_value=self.payload(sha='b'*40)), \
                     patch('verify_live_production.time.sleep',return_value=None), \
                     self.assertRaisesRegex(ValueError,'has not confirmed'):
                    main()
            finally:
                os.chdir(old)
    def test_workflow_uses_cloudflare_api_verify_not_anonymous_only(self):
        workflow=(Path(__file__).resolve().parents[2]/'.github/workflows/plotlish-production.yml').read_text()
        self.assertIn('python tools/verify_live_production.py',workflow)
        self.assertIn('CLOUDFLARE_API_TOKEN_PROD',workflow)
        self.assertNotIn('PYVERIFY',workflow)

if __name__=='__main__':unittest.main()
