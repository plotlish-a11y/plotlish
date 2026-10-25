#!/usr/bin/env python3
"""Fail-closed Cloudflare project/branch/account verification before production upload."""
import json
import os
import re
import sys
from urllib.request import Request,urlopen
from urllib.parse import quote

PROJECT='plotlish'
HOST='plotlish.pages.dev'
BRANCH='main'  # change only after verifying the actual Pages project

def determine_target(body, allow_git=False):
    if body.get('success') is not True or not isinstance(body.get('result'),dict):
        raise ValueError('Cloudflare API did not confirm the project')
    r=body['result']
    if r.get('name')!=PROJECT or r.get('subdomain','').lower()!=HOST:
        raise ValueError('Cloudflare project/hostname mismatch (expected plotlish.pages.dev)')
    branch=r.get('production_branch')
    if branch!=BRANCH:
        raise ValueError(f'Production branch mismatch (expected {BRANCH}, got {branch!r}); no deploy')
    source=r.get('source')
    if isinstance(source,dict) and source.get('type') in ('github','gitlab'):
        if not allow_git:
            raise ValueError('Git-connected Pages project: explicitly opt in after disabling Cloudflare native production autobuilds')
        config=source.get('config')
        if not isinstance(config,dict) or config.get('production_deployments_enabled') is not False:
            raise ValueError('Disable native Cloudflare production deployments before Wrangler auto deploy')
    return branch

def main():
    account=os.environ.get('CLOUDFLARE_ACCOUNT_ID_PROD','').strip()
    token=os.environ.get('CLOUDFLARE_API_TOKEN_PROD','').strip()
    if not account or not token:raise ValueError('Missing separate PROD Cloudflare secrets')
    if not re.fullmatch(r'[a-zA-Z0-9_-]{12,100}',account):raise ValueError('Invalid account ID')
    req=Request('https://api.cloudflare.com/client/v4/accounts/'+quote(account,safe='')+'/pages/projects/'+PROJECT,
        headers={'Authorization':'Bearer '+token,'Accept':'application/json'})
    with urlopen(req,timeout=25) as response:body=json.load(response)
    branch=determine_target(body,os.environ.get('ALLOW_GIT_INTEGRATED_PROD')=='true')
    output=os.environ.get('GITHUB_OUTPUT')
    if not output:raise ValueError('GITHUB_OUTPUT missing; only approved CI may deploy')
    with open(output,'a',encoding='utf8') as file:file.write('production_branch='+branch+'\n')
    print('Verified production Pages target: '+HOST+'; branch '+branch)

if __name__=='__main__':
    try:main()
    except Exception as e:print('PRODUCTION DEPLOY BLOCKED: '+str(e),file=sys.stderr);sys.exit(1)
