"""DOM/browser injection tests. Network navigation is blocked in this sandbox."""
import json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
CAT=json.loads((ROOT/'site/courses/catalog.json').read_text())
COURSE=json.loads((ROOT/'site'/CAT['lessons'][0]['url']).read_text())
APP=(ROOT/'site/assets/app.js').read_text()
CSS=(ROOT/'site/assets/styles.css').read_text()

def inject_page(page,name):
 html=(ROOT/'site'/name).read_text()
 html=re.sub(r'<link rel="stylesheet"[^>]*>',f'<style>{CSS}</style>',html)
 html=re.sub(r'<script type="module"[^>]*></script>','',html)
 page.set_content(html,wait_until='load')
 page.evaluate('''({cat,course}) => {
   window.__localMap=window.__localMap || {};
   Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return window.__localMap[k]??null},setItem(k,v){window.__localMap[k]=v}}});
   window.fetch=async url=>({ok:true,json:async()=>url.includes('catalog')?cat:course});
 }''', {'cat':CAT,'course':COURSE})
 page.add_script_tag(content=APP)

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(1440,900),(390,844),(320,720)]:
  context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1)
  page=context.new_page();errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
  inject_page(page,'index.html')
  page.wait_for_selector('.book-card')
  assert page.locator('.book-card').count()==1
  assert 'reader.html?lesson=everyone-has-a-mission-01' in page.locator('a.chapter-link').get_attribute('href')
  page.screenshot(path=str(ROOT/'tests'/f'library_{width}.png'))
  page2=context.new_page();page2.on('pageerror',lambda e: errors.append(str(e)))
  inject_page(page2,'reader.html')
  page2.wait_for_selector('.story-sentence')
  assert page2.locator('.story-sentence').count()==63
  assert page2.locator('.study-en').inner_text().startswith('The last thing Nora')
  assert '苦咖啡' in page2.locator('.study-zh').inner_text()
  assert page2.locator('.note-underline').count()>0
  page2.locator('.story-sentence').nth(3).click()
  assert page2.locator('.study-en').inner_text().startswith('"Drink it')
  assert '趁热喝' in page2.locator('.study-zh').inner_text()
  page2.locator('.study-tab[data-tab="vocab"]').click()
  assert 'take a sip' in page2.locator('#studyContent').inner_text()
  page2.locator('.study-tab[data-tab="grammar"]').click()
  assert 'PAST PERFECT' in page2.locator('#studyContent').inner_text()
  page2.locator('.study-tab[data-tab="sentence"]').click()
  page2.locator('#toggleZh').click()
  assert page2.locator('.inline-translation').count()==63
  # call initReader again against the same mocked storage to emulate reload
  page2.evaluate('initReader()');page2.wait_for_timeout(75)
  assert page2.locator('.story-sentence.active').get_attribute('data-index')=='3'
  assert page2.locator('.inline-translation').count()==63
  docWidth=page2.evaluate('document.documentElement.scrollWidth')
  assert docWidth<=width+1,(width,docWidth)
  assert not errors,(width,errors)
  page2.screenshot(path=str(ROOT/'tests'/f'reader_{width}.png'))
  print('Reader and library',width,'PASS; maxWidth',docWidth)
  context.close()
 # creator regression: inject original HTML, execute its inline scripts
 ctx=browser.new_context(viewport={'width':1440,'height':900})
 page=ctx.new_page();errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
 author=(ROOT/'author/English_Reader_Studio_V2_6_Alpha.html').read_text()
 page.set_content(author,wait_until='load');page.wait_for_timeout(400)
 assert page.locator('#storyInfo').inner_text().startswith('1 句'),page.locator('#storyInfo').inner_text()
 assert page.evaluate('lessonMeta.title')=='Untitled Story'
 assert page.evaluate('annotations.length')==0
 assert not page.evaluate('lessonMeta.sentence_translations.length')
 # Source JSON: import must bind explicit sentence IDs and fingerprint before touching current project
 source=ROOT/'lessons/everyone-has-a-mission-01.json'
 page.locator('#importLesson').set_input_files(str(source))
 page.wait_for_timeout(300)
 assert '章节导入成功' in page.locator('#lessonStatus').inner_text(),page.locator('#lessonStatus').inner_text()
 bound=page.evaluate('({first:lessonMeta.sentence_translations[0],hash:lessonMeta.translation_source_hash,source:projectKey(raw),length:sentences.length})')
 assert bound['hash']==bound['source'] and bound['length']==63 and '苦咖啡' in bound['first'],bound
 # Second unrelated story, fully tagged v2: the old 63-sentence data must not leak.
 novel={
 'format':'english-reader-lesson-v2','lesson_id':'second-story-01',
 'article':'Anna found a notebook. She opened it slowly. There was a name inside.',
 'lesson':{'title':'The Notebook','chapter':'01','subtitle':'新的一本书','series':'Short Mysteries','level':'A2','synopsis':'第二个独立的故事','genre':'MYSTERY',
           'sentence_translations':['安娜发现了一本笔记本。','她慢慢翻开了它。','里面有一个名字。'],
           'grammar':{},'question':'What did Anna find?','questionHelp':'', 'cards':[]},
 'annotations':[{'id':'a1','phrase':'slowly','kind':'word','meaning':'慢慢地','explain':'副词','example':'','sentenceIndex':1}]
 }
 # JS's projectKey and Intl.Segmenter generate the exact v2 fingerprint and sentence IDs.
 novel=page.evaluate('''d => { d.lesson.translation_source_hash=projectKey(d.article);
 d.sentence_ids=segment(d.article).map((s,i)=>String(i+1).padStart(3,'0')+'-'+projectKey(s.text));return d; }''',novel)
 from playwright.sync_api import FilePayload
 page.locator('#importLesson').set_input_files({'name':'novel.json','mimeType':'application/json','buffer':json.dumps(novel,ensure_ascii=False).encode('utf-8')})
 page.wait_for_timeout(350)
 assert '章节导入成功' in page.locator('#lessonStatus').inner_text(),page.locator('#lessonStatus').inner_text()
 assert page.evaluate('sentences.length')==3
 assert page.evaluate('annotations.length')==1
 assert page.evaluate('lessonMeta.level')=='A2'
 assert page.evaluate('lessonMeta.genre')=='MYSTERY'
 assert not page.evaluate('lessonMeta.sentence_translations.some(s=>s.includes("诺拉"))')
 assert page.locator('.brand').inner_text().startswith('THE NOTEBOOK')
 # Corrupt next input; must reject without overwriting active course.
 bad=json.loads(json.dumps(novel,ensure_ascii=False));bad['article']='Anna found a red notebook. She opened it slowly. There was a name inside.'
 bad['sentence_ids']=page.evaluate("article => segment(article).map((s,i)=>String(i+1).padStart(3,'0')+'-'+projectKey(s.text))",bad['article'])
 page.locator('#importLesson').set_input_files({'name':'broken.json','mimeType':'application/json','buffer':json.dumps(bad).encode('utf-8')})
 page.wait_for_timeout(250)
 assert '指纹不匹配' in page.locator('#lessonStatus').inner_text(),page.locator('#lessonStatus').inner_text()
 assert page.evaluate('lessonMeta.title')=='The Notebook'
 assert page.evaluate('sentences.length')==3
 assert not errs,errs
 print('Author empty bootstrap + v2 JSON import PASS')
 browser.close()
