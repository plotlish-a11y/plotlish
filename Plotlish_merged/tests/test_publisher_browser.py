"""Publisher browser UI test; local HTTP navigation is blocked by sandbox policy."""
import json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'tools/publisher.html').read_text()
SCRIPT=(ROOT/'tools/publisher-ui.js').read_text()
D=ROOT/'lessons/everyone-has-a-mission-01.json'
CAT=json.loads((ROOT/'site/courses/catalog.json').read_text())
S={'lesson_id':'everyone-has-a-mission-01','book_id':'everyone-has-a-mission','title':'Everyone Has a Mission','chapter':'01','level':'B1','sentences':63,'annotations':15,'words':343,'sourceFormat':'english-reader-lesson-v2','publish_state':'unchanged','warnings':['测试：人工检查语义准确性']}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [1280,390]:
  context=b.new_context(viewport={'width':width,'height':860},device_scale_factor=1)
  page=context.new_page();errs=[];page.on('pageerror',lambda e: errs.append(str(e)))
  page.set_content(re.sub(r'<script type="module"[^>]*></script>','',HTML),wait_until='load')
  page.evaluate('''({cat,summary})=>{window.fetch=async(url,options)=>({ok:true,json:async()=>url.includes('catalog')?{ok:true,catalog:cat}:{ok:true,result:url.includes('validate')?summary:{status:'unchanged'}}})}''',{'cat':CAT,'summary':S})
  page.add_script_tag(content=SCRIPT)
  page.wait_for_selector('.item')
  page.locator('#lessonFile').set_input_files(str(D))
  page.wait_for_function("document.querySelector('#summary').textContent.includes('63 |')")
  assert 'Everyone Has a Mission' in page.locator('#summary').inner_text()
  assert page.locator('#publish').is_enabled()
  page.locator('#reviewed').check()
  page.locator('#publish').click()
  page.wait_for_function("document.querySelector('#notice').textContent.includes('内容未改变')")
  assert not errs,errs
  full=page.evaluate('document.documentElement.scrollWidth')
  assert full<=width+1,(width,full)
  page.screenshot(path=str(ROOT/'tests'/('publisher_desktop.png' if width==1280 else 'publisher_mobile.png')),full_page=True)
  print('Publisher UI',width,'PASS')
  context.close()
 b.close()
