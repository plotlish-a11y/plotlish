#!/usr/bin/env python3
"""Opt-in full-length browser regression, with synthetic data only.

Tests the previously stale computed-font/layout sequence. No real stories or
course artwork are bundled or published with the source repository.
"""
import os
import re
import urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
SOURCE=(
 'The visitor searched along the old corridor before returning to the quiet room. ',
 'The lights had been extinguished, but the envelope was still on the wooden table. ',
 'Nobody expected the message that arrived before the morning train departed. ',
 'The teacher asked for one more careful explanation of the unusual expression. ',
)
TARGET=(
 '来客沿着旧走廊寻找了一阵，然后返回安静的房间。',
 '灯已经熄灭，但那封信仍然放在木桌上。',
 '早班火车出发前收到的那条消息出乎所有人的意料。',
 '老师要求再仔细解释一遍这个不太常见的表达。',
)
sentences=[SOURCE[i%4]*(2 if i%13==0 else 1) for i in range(249)]
translations=[TARGET[i%4]*(3 if i%17==0 else 1) for i in range(249)]
scenes=[{'scene_id':f'scene-{idx}','start_index':idx,'title':f'Test scene {idx}','alt':'Synthetic scene'} for idx in (20,100,190)]
chapter={'book_id':'synthetic','chapter_id':'synthetic-ch001','book':'Synthetic Test Novel',
 'chapter':'Synthetic Chapter','chapter_number':1,'title':'Synthetic Chapter',
 'level':'B1','genre':'Test','synopsis':'No user story material',
 'sentences':sentences,'translations':translations,
 'ids':[f'sentence-{i:04d}' for i in range(249)],
 'paragraphBreaks':list(range(0,249,3)), 'units':[], 'annotations':[], 'scenes':scenes}
scene_svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" fill="#eee"/></svg>'
svg='data:image/svg+xml,'+urllib.parse.quote(scene_svg)
init={'catalog':[chapter],'courses':[chapter],'covers':{},
 'scenes':{s['scene_id']:svg for s in scenes},'bookProfiles':{},
 'homepage':{'schema_version':1,'featured_book_id':None,'sections':[]}}
html=(ROOT/'core/index.html').read_text(encoding='utf8')
html=re.sub(r'<script\b[^>]*\bsrc="[^"]+"[^>]*></script>','',html)
html=re.sub(r'<link\b[^>]*\bhref="\./src/styles\.css"[^>]*/>','',html)
reader=(ROOT/'core/src/reader.js').read_text(encoding='utf8')
reader=reader.replace('\n})();','\nwindow.__longQa={state,prefs,requestPageReflow,tryHeight,availableHeight};\n})();')
assert 'window.__longQa=' in reader


def setup(page):
    page.set_content(html,wait_until='domcontentloaded')
    page.add_style_tag(content=(ROOT/'core/src/styles.css').read_text(encoding='utf8'))
    page.evaluate('x=>window.__PLOTLISH_INIT__=x',init)
    for file in ('library.js','reader.js','nav.js'):
        page.add_script_tag(content=reader if file=='reader.js' else (ROOT/'core/src'/file).read_text(encoding='utf8'))
    page.evaluate('document.getElementById("resumeTop").click()')
    page.wait_for_timeout(90)


def verify(page,expected_font,expected_leading):
    out=page.evaluate('''()=>{const q=__longQa,root=document.getElementById('pageText'),style=getComputedStyle(root);
       const all=q.state.pages.flat().filter(s=>s.type!=='scene'&&!s.translationOnly);
       const text=Array.from({length:249},(_,i)=>all.filter(s=>s.i===i).map(s=>s.text).join(''));
       const overflow=q.state.pages.filter(pg=>q.tryHeight(pg)>q.availableHeight()+1).length;
       const zh=Array.from({length:249},()=>[]);
       for(const row of q.state.pages.flat()){
         if(row.type==='scene')continue;
         if(row.translationOnly)zh[row.i].push(row.translationText);
         else if(!row.suppressTranslation && row.end===__PLOTLISH_INIT__.courses[0].sentences[row.i].length)zh[row.i].push(__PLOTLISH_INIT__.courses[0].translations[row.i]);
       }
       const transMissing=q.prefs.translation==='bilingual'?zh.filter((v,i)=>v.join('')!==__PLOTLISH_INIT__.courses[0].translations[i]).length:0;
       return {font:parseFloat(style.fontSize),leading:parseFloat(style.lineHeight),
         expectedFont:q.prefs.fontSize,expectedLeading:q.prefs.lineHeight,
         missing:text.filter((x,i)=>x!==__PLOTLISH_INIT__.courses[0].sentences[i]).length,transMissing,
         overflow,horizontal:document.documentElement.scrollWidth-innerWidth,
         selected:q.state.selected,mode:q.prefs.mode,view:q.state.view};}''')
    assert out['view']=='reader' and out['mode']=='pages',out
    assert out['font']==expected_font and abs(out['leading']-expected_font*expected_leading)<0.5,out
    assert out['selected']==97,out
    assert out['missing']==0 and out['transMissing']==0 and out['overflow']==0 and out['horizontal']<=2,out
    return out


def modify(page,font,leading,translation):
    page.evaluate('''({font,leading,translation})=>{
       let a=document.getElementById('fontSize');a.value=String(font);a.dispatchEvent(new Event('change',{bubbles:true}));
       let b=document.getElementById('lineHeight');b.value=String(leading);b.dispatchEvent(new Event('change',{bubbles:true}));
       document.querySelector('[data-quick-translation="'+translation+'"]').click();
    }''',{'font':font,'leading':leading,'translation':translation})
    page.wait_for_timeout(180)


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'],
            executable_path='/usr/bin/chromium' if os.path.isfile('/usr/bin/chromium') else None)
        try:
            for width,height,reduce in [(1440,900,True),(390,844,True),(320,640,True),(960,720,False)]:
                page=browser.new_page(viewport={'width':width,'height':height},
                    reduced_motion='reduce' if reduce else 'no-preference')
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                setup(page)
                page.evaluate('''()=>{__longQa.state.selected=97;__longQa.state.anchorOffset=0;__longQa.requestPageReflow()}''')
                page.wait_for_timeout(90)
                for font,leading,trans in ((26,2.0,'bilingual'),(19,1.65,'current'),
                                           (23,1.82,'bilingual'),(17,1.65,'hidden')):
                    modify(page,font,leading,trans)
                    stat=verify(page,font,leading)
                assert not errors,errors
                print('LONG CHAPTER PASS',width,'reduced_motion=',reduce,
                      'pages=',len(page.evaluate('()=>__longQa.state.pages')))
                page.close()
        finally:browser.close()

if __name__=='__main__':run()
