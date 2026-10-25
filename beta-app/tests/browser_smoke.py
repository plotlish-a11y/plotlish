#!/usr/bin/env python3
"""Optional Chromium browser regression using synthetic sample sentences, no real courses.
Run after `pip install playwright` and `playwright install chromium`.
"""
import json
import os
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

eng=('The lamp by the old window flickered softly as the visitors talked about their plans. ',
     'Nobody noticed the small envelope beneath the empty teacup. ',
     'One character looked out into the quiet street before the bell rang again. ')
zh=('窗边的灯轻轻闪烁，来客正在讨论计划。',
    '没有人注意到空茶杯下面的信封。',
    '铃声再次响起前，一个人望向寂静的街道。')
sentences=[eng[i%3]*(1+(i%5==0)) for i in range(14)]
translations=[zh[i%3]*(1+(i%7==0)) for i in range(14)]
ids=[f's{i:04d}' for i in range(len(sentences))]
scene={'scene_id':'scene_a','start_index':8,'title':'Study scene','alt':'Illustration used for regression'}
chapter={'book_id':'demo','chapter_id':'demo-ch001','book':'Synthetic Test Story',
 'chapter':'Chapter One','chapter_number':1,'title':'Chapter One','level':'B1','genre':'Test',
 'synopsis':'Test only','sentences':sentences,'translations':translations,'ids':ids,
 'paragraphBreaks':[0,8],
 'units':[],'annotations':[],'scenes':[scene], 'sentences_count':len(sentences)}
scene_svg="<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='#eedbd0'/></svg>"
import urllib.parse
init={'catalog':[chapter], 'courses':[chapter], 'covers':{},
 'scenes':{'scene_a':'data:image/svg+xml,'+urllib.parse.quote(scene_svg)},
 'bookProfiles':{},'homepage':{'schema_version':1,'featured_book_id':None,'sections':[]}}
html=(ROOT/'core/index.html').read_text(encoding='utf8')
html=re.sub(r'<script\b[^>]*\bsrc="[^"]+"[^>]*></script>','',html)
html=re.sub(r'<link\b[^>]*\bhref="\./src/styles\.css"[^>]*/>','',html)

def bootstrap(page):
    page.set_content(html,wait_until='domcontentloaded')
    page.add_style_tag(content=(ROOT/'core/src/styles.css').read_text(encoding='utf8'))
    page.evaluate('(x)=>window.__PLOTLISH_INIT__=x',init)
    for file in ('library.js','reader.js','nav.js'):
        src=(ROOT/'core/src'/file).read_text(encoding='utf8')
        if file=='reader.js':
            src=src.replace('\n})();','\nwindow.__qa={state,prefs,requestPageReflow,tryHeight,availableHeight,paintPage};\n})();')
        page.add_script_tag(content=src)
    page.evaluate('document.getElementById("resumeTop").click()')

def info(page):
    return page.evaluate('''()=>{let q=__qa,lim=q.availableHeight();let heights=q.state.pages.map(p=>q.tryHeight(p));let copy=q.state.pages.flat().filter(x=>x.type!=='scene'&&!x.translationOnly);let en=Array.from({length:14},(_,i)=>copy.filter(x=>x.i===i).map(x=>x.text).join(''));let rows=q.state.pages.flat().filter(x=>x.translationOnly);return {pages:q.state.pages.length,overflow:heights.filter(x=>x>lim+1).length,maxOver:Math.round(Math.max(0,...heights.map(x=>x-lim))),font:getComputedStyle(document.getElementById('pageText')).fontSize,selected:q.state.selected,missing:en.filter((x,i)=>x!==window.__PLOTLISH_INIT__.courses[0].sentences[i]).length, extraTranslations:rows.length,anchor:q.state.anchorOffset, total:heights.length, horizontal:document.documentElement.scrollWidth-innerWidth}}''')

def modify(page,id,value):
    page.evaluate('''({id,value})=>{let element=document.getElementById(id);element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}))}''',{'id':id,'value':value})
    page.wait_for_timeout(170)

def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'],executable_path='/usr/bin/chromium' if os.path.isfile('/usr/bin/chromium') else None)
        try:
            for width,height in [(1440,900),(960,720),(390,844),(320,640)]:
                page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce')
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                bootstrap(page);page.wait_for_timeout(180)
                assert page.locator('#readerView').is_visible()
                page.evaluate('''()=>{let q=__qa;q.state.selected=7;q.state.anchorOffset=0;q.requestPageReflow()}''')
                page.wait_for_timeout(150)
                for value in ('26','19'):
                    modify(page,'fontSize',value)
                    stat=info(page)
                    assert stat['font']==value+'px' and not stat['overflow'],(width,'font',value,stat)
                    assert stat['selected']==7 and stat['missing']==0,(width,'reading anchor or English text lost',stat)
                for value in ('2','1.82'):
                    modify(page,'lineHeight',value)
                    stat=info(page)
                    assert not stat['overflow'],(width,'leading',value,stat)
                for mode in ('bilingual','current','hidden'):
                    page.evaluate('''mode=>{const b=document.querySelector('[data-quick-translation="'+mode+'"]');b.click()}''',mode)
                    page.wait_for_timeout(180)
                    stat=info(page)
                    assert not stat['overflow'] and stat['missing']==0,(width,'translation',mode,stat)
                page.set_viewport_size({'width':max(320,width-60),'height':height})
                page.wait_for_timeout(200)
                stat=info(page)
                assert not stat['overflow'] and stat['horizontal']<=2,(width,'resize',stat)
                assert not errors,(width,errors)
                print('PASS',width,height,'pages',stat['pages'],'anchor',stat['selected'])
                page.close()
        finally:browser.close()

if __name__=='__main__':run()
