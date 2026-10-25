#!/usr/bin/env python3
"""Confirm the intended Pages project and determine its actual production branch.
No credential contents are printed. Fails closed on unexpected API responses.
"""
import json, os, re, sys
from urllib.request import Request, urlopen
from urllib.parse import quote

PROJECT = 'plotlish-test'
EXPECTED_HOST = 'plotlish-test.pages.dev'

def determine_target(body):
    if body.get('success') is not True or not isinstance(body.get('result'),dict):
        raise RuntimeError('Cloudflare API 未确认项目；禁止发布')
    r=body['result']
    if r.get('name') != PROJECT:
        raise RuntimeError('Cloudflare 项目名不是 plotlish-test；禁止发布')
    sub=r.get('subdomain')
    if sub is not None and sub.lower() != EXPECTED_HOST:
        raise RuntimeError('Pages 域名不符合预期；禁止发布')
    branch=r.get('production_branch')
    if not isinstance(branch,str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}',branch) or '..' in branch:
        raise RuntimeError('Cloudflare 正式分支缺失或不安全；禁止发布')
    return branch

def main():
    account=os.environ.get('CLOUDFLARE_ACCOUNT_ID_BETA','').strip()
    token=os.environ.get('CLOUDFLARE_API_TOKEN_BETA','').strip()
    if not account or not token:
        raise RuntimeError('缺少 GitHub Secrets：CLOUDFLARE_API_TOKEN_BETA / CLOUDFLARE_ACCOUNT_ID_BETA')
    url=f'https://api.cloudflare.com/client/v4/accounts/{quote(account,safe="")}/pages/projects/{PROJECT}'
    req=Request(url,headers={'Authorization':'Bearer '+token, 'Accept':'application/json'})
    with urlopen(req, timeout=25) as response:
        branch=determine_target(json.load(response))
    output=os.environ.get('GITHUB_OUTPUT')
    if not output: raise RuntimeError('当前环境缺少 GITHUB_OUTPUT，拒绝自动发布')
    with open(output,'a',encoding='utf8') as f:
        f.write('production_branch='+branch+'\n')
    print('CLOUDFLARE TARGET OK: project=plotlish-test, host=plotlish-test.pages.dev, production branch='+branch)

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('DEPLOYMENT BLOCKED:',str(exc), file=sys.stderr)
        sys.exit(1)
