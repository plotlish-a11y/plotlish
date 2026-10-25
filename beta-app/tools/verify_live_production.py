#!/usr/bin/env python3
"""Verify completed production deployment by authenticated Cloudflare API.

The public pages.dev URL is separately probed. A 403 at the public hostname is
reported as an access problem, not as evidence that the Cloudflare deploy failed.
"""
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

PROJECT = 'plotlish'
ALIAS = 'https://plotlish.pages.dev/release.json'
API = 'https://api.cloudflare.com/client/v4/accounts/{account}/pages/projects/{project}/deployments'


def find_approved_deployment(payload, commit):
    if payload.get('success') is not True or not isinstance(payload.get('result'), list):
        raise ValueError('Cloudflare API did not return a valid deployment list')
    matching = []
    for item in payload['result']:
        if not isinstance(item, dict) or item.get('project_name') != PROJECT:
            continue
        meta = (item.get('deployment_trigger') or {}).get('metadata') or {}
        if (item.get('environment') == 'production'
                and meta.get('branch') == 'main'
                and meta.get('commit_hash') == commit):
            matching.append(item)
    for item in matching:
        if (item.get('latest_stage') or {}).get('status') == 'success':
            return item
    return None


def check_public_url(url, expected, timeout=12):
    """Return ('ok'|'mismatch'|'restricted'|'unavailable', human detail)."""
    headers = {'Accept': 'application/json',
               'Cache-Control': 'no-cache',
               'User-Agent': 'Plotlish-Production-Release-Verification/1.0'}
    req = Request(url + '?' + urlencode({'sha': expected['commit']}), headers=headers)
    try:
        with urlopen(req, timeout=timeout) as response:
            data = json.load(response)
        return ('ok', 'Public release manifest matches the approved build') if data == expected else ('mismatch', 'Public release manifest differs from approved build')
    except HTTPError as exc:
        return ('restricted' if exc.code in (401, 403) else 'unavailable',
                f'HTTP {exc.code} from {url}; CF-Ray={exc.headers.get("cf-ray", "unknown")}')
    except (URLError, TimeoutError, ValueError, json.JSONDecodeError, OSError) as exc:
        return 'unavailable', f'{type(exc).__name__}: {exc}'


def api_payload(account, token, timeout=20):
    req = Request(API.format(account=account, project=PROJECT) + '?env=production&per_page=20',
                  headers={'Authorization': 'Bearer ' + token,
                           'Accept': 'application/json',
                           'User-Agent': 'Plotlish-Production-Release-Verification/1.0'})
    with urlopen(req, timeout=timeout) as response:
        return json.load(response)


def append_summary(lines):
    output = os.environ.get('GITHUB_STEP_SUMMARY')
    if output:
        with open(output, 'a', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')


def main():
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID_PROD', '').strip()
    token = os.environ.get('CLOUDFLARE_API_TOKEN_PROD', '').strip()
    commit = os.environ.get('GITHUB_SHA', '').strip()
    version = os.environ.get('EXPECT_VERSION', '').strip()
    expected = json.loads(Path('dist/release.json').read_text(encoding='utf-8'))
    if not account or not token or not commit or not version:
        raise ValueError('Missing deployment verification environment values')
    if expected.get('commit') != commit or expected.get('version') != version:
        raise ValueError('Local release manifest does not match expected version and commit')

    found = None
    for attempt in range(8):
        response = api_payload(account, token)
        found = find_approved_deployment(response, commit)
        if found:
            break
        if attempt < 7:
            time.sleep(5)
    if not found:
        raise ValueError('Cloudflare API has not confirmed a successful main/production deployment for this exact commit')
    print('CLOUDFLARE PRODUCTION DEPLOYMENT CONFIRMED:', commit, found.get('url', ''))

    # Public visibility is a separate condition and may be blocked by Access,
    # WAF, or anti-bot rules. Don't mark successful upload as failed for a 403.
    state = detail = None
    for attempt in range(4):
        state, detail = check_public_url(ALIAS, expected)
        if state == 'ok':
            break
        if attempt < 3 and state == 'mismatch':
            time.sleep(5)  # CDN alias propagation
        else:
            break
    summary = ['### Production verification',
               '- Cloudflare API: **successful production deployment verified**',
               f'- Commit: `{commit}`',
               f'- Deployment URL: {found.get("url", "not provided")}']
    if state == 'ok':
        print('PUBLIC PRODUCTION VERIFIED:', version)
        summary.append('- Public pages.dev release.json: **accessible and matches approved build**')
    elif state == 'mismatch':
        summary.append('- Public pages.dev release.json: **VERSION MISMATCH**')
        append_summary(summary)
        raise ValueError('Cloudflare deploy succeeded but public alias is serving a different release manifest: '+detail)
    else:
        msg = ('Cloudflare production deployed, but anonymous public access is NOT verified. '
               + detail + '. Check Cloudflare Access/WAF and test the site in an incognito browser.')
        print('::warning title=Public website not verified::' + msg.replace('\n', ' '))
        print('PUBLIC SITE ACCESS UNVERIFIED:', detail)
        summary.append('- Public pages.dev release.json: **not verified** (' + detail + ')')
        summary.append('- Investigate Access/WAF/public visibility separately; do not claim the website is publicly accessible.')
    append_summary(summary)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('PRODUCTION DEPLOY VERIFICATION FAILED:', str(exc), file=sys.stderr)
        sys.exit(1)
