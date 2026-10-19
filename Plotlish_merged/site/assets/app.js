const $=(id)=>document.getElementById(id);
const node=(tag,className='',txt=null)=>{const e=document.createElement(tag);if(className)e.className=className;if(txt!==null)e.textContent=String(txt);return e};
const getJSON=async url=>{const res=await fetch(url,{cache:'no-cache'});if(!res.ok)throw Error(`请求失败 (${res.status})`);return await res.json()};
function showError(container,err){container.replaceChildren(node('div','error',`页面未能加载：${err.message}。请刷新页面重试；如仍失败，可能是课程文件尚未发布完整。`))}
const storage={get(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
function makeCover(chapter){const wrap=node('div','cover');const top=node('div','cover-top',chapter.series||'PLOTLISH STORIES');const title=node('div','cover-title',chapter.title||'English Story');const bottom=node('div','cover-bottom',chapter.genre||'ENGLISH STORY');wrap.append(top,title,bottom);return wrap}
function libraryCard(chapters){
 const c=chapters[0];
 const card=node('article','book-card'),cover=makeCover(c),body=node('div','book-info');
 cover.querySelector('.cover-title').textContent=c.title;
 const meta=node('div','book-meta'),level=node('span','pill',(c.level==='Unrated'?'未分级':c.level+' · 阅读示例'));
 meta.append(level,node('span','',`${chapters.length} 个章节`));
 body.append(meta,node('h3','',c.title),node('div','book-sub',c.subtitle),node('p','book-desc',c.synopsis||'英文连载故事与阅读练习'));
 const chapterList=node('div','chapter-list');
 for(const ch of chapters){
  const link=node('a','chapter-link');link.href=`./reader.html?lesson=${encodeURIComponent(ch.lesson_id)}`;
  const name=node('span','',`第 ${String(ch.episode_number||ch.chapter).padStart(2,'0')} 章`);
  link.append(name,node('small','',`${ch.sentences_count} 句 · 阅读 ↗`));chapterList.append(link);
 }
 body.append(chapterList);card.append(cover,body);return card;
}
async function initLibrary(){
 const host=$('libraryContent');try{const cat=await getJSON('./courses/catalog.json');
  if(cat.schema_version!=='ers-catalog-v1'||!Array.isArray(cat.lessons))throw Error('课程目录格式错误');
  const groups=new Map();for(const c of cat.lessons){
   const key=(c.series_id||c.series||'')+'::'+(c.book_id||c.title);
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);
  }
  const list=node('div','book-list');for(const chapters of groups.values()){
   chapters.sort((a,b)=>(a.episode_number||0)-(b.episode_number||0));list.append(libraryCard(chapters));
  }
  if(!groups.size)list.append(node('p','emptytext','当前还没有开放的课程。'));
  const count=document.getElementById('libraryCount');if(count)count.textContent=`/ 已开放 ${cat.lessons.length} 章 · ${groups.size} 部故事`;
  host.replaceChildren(list);
 }catch(e){showError(host,e)}
}
const state={lesson:null,selected:0,maxVisited:0,showAll:false,tab:'sentence',activeNoteId:null,progressKey:''};
function saveProgress(){const s=state.lesson?.sentences[state.selected];if(!s)return;storage.set(state.progressKey,{sentence_id:s.sentence_id,maxVisited:state.maxVisited,showAll:state.showAll})}
function updateProgress(){const n=state.lesson.sentences.length;
 const percent=Math.round(100*(state.maxVisited+1)/n);
 $('meterFill').style.width=percent+'%';$('meterValue').setAttribute('aria-valuenow',String(percent));$('meterText').textContent=percent+'%';
 $('positionText').textContent=`第 ${state.selected+1} / ${n} 句`;
 for(const id of ['prevSentence','mobilePrev'])$(id).disabled=state.selected===0;
 for(const id of ['nextSentence','mobileNext'])$(id).disabled=state.selected===n-1;
 $('toggleZh').setAttribute('aria-pressed',String(state.showAll));$('toggleZh').textContent=state.showAll?'隐藏全部翻译':'显示全部翻译';
}
function notesFor(s){return (state.lesson.annotations||[]).filter(n=>n.sentence_id===s.sentence_id)}
function insertAnnotatedLine(button,s,notes){
 const source=s.english;const matches=[];
 for(const note of notes){const at=source.toLowerCase().indexOf(note.phrase.toLowerCase());if(at>=0)matches.push({start:at,end:at+note.phrase.length,id:note.annotation_id})}
 matches.sort((a,b)=>a.start-b.start||b.end-a.end);
 let offset=0;for(const item of matches){if(item.start<offset)continue;
  button.append(document.createTextNode(source.slice(offset,item.start)));
  const mark=node('span','note-underline',source.slice(item.start,item.end));mark.dataset.annotation=item.id;
  button.append(mark);offset=item.end;
 }button.append(document.createTextNode(source.slice(offset)));
}
function renderStory(){
 const host=$('storyText');host.replaceChildren();
 let para=null,lastPara=-1;
 state.lesson.sentences.forEach((s,i)=>{
  if(s.paragraph!==lastPara){para=node('p','story-paragraph');host.append(para);lastPara=s.paragraph}
  const notes=notesFor(s);const button=node('button','story-sentence'+(state.selected===i?' active':''));button.type='button';button.dataset.index=String(i);
  button.setAttribute('aria-label',`第 ${i+1} 句：${s.english}`);
  button.setAttribute('aria-pressed',String(state.selected===i));
  insertAnnotatedLine(button,s,notes);para.append(button);
  if(state.showAll){para.append(node('span','inline-translation',s.chinese||'本句暂无翻译'))}
  else if(state.selected===i){para.append(node('span','inline-translation only-mobile',s.chinese||'本句暂无翻译'))}
  para.append(document.createTextNode(' '));
 });
}
function renderSentencePanel(){
 const s=state.lesson.sentences[state.selected];const host=$('studyContent');host.replaceChildren();
 host.append(node('p','study-en',s.english),node('p','study-zh',s.chinese||'本句暂无中文翻译'));
 const controls=node('div','listen-actions');const play=node('button','small-action','▶ 朗读当前句');const stop=node('button','small-action','停止');play.type='button';stop.type='button';
 play.addEventListener('click',()=>speak(s.english));stop.addEventListener('click',stopSpeaking);controls.append(play,stop);host.append(controls);
 host.append(node('div','study-hint','使用浏览器/系统自带英语语音，音色因设备而异；本章尚无可分发的预制朗读音频。'));
 const notes=notesFor(s);host.append(node('h3','study-section-heading','本句知识点'));
 if(notes.length){const list=node('div','notes-list');for(const n of notes){const c=noteCard(n);if(n.annotation_id===state.activeNoteId)c.style.borderColor='#86a692';list.append(c)}host.append(list)}
 else host.append(node('p','emptytext','这一句没有预设知识点，可继续阅读。'));
}
function noteCard(n){const c=node('div','note-card');c.append(node('span','note-type',n.kind==='word'?'VOCABULARY':n.kind==='grammar'?'GRAMMAR':'PHRASE'),node('h4','',n.phrase),node('div','vocab-meaning',n.meaning),node('p','',n.explain));if(n.example)c.append(node('p','example',n.example));return c}
function renderVocabPanel(){const host=$('studyContent');host.replaceChildren(node('h3','study-section-heading','本章重点表达'));
 if(!(state.lesson.cards||[]).length){host.append(node('p','emptytext','暂无重点表达'));return}
 state.lesson.cards.forEach((c,i)=>{const part=node('div','vocab-item');part.append(node('span','note-type',`EXPRESSION ${String(i+1).padStart(2,'0')}`),node('div','vocab-term',c.w),node('div','vocab-meaning',c.zh),node('div','vocab-tip',c.tip));
 if(c.quote)part.append(node('div','vocab-tip',`原文：${c.quote}`));if(c.ex)part.append(node('div','vocab-tip',`例句：${c.ex}`));host.append(part)});
}
function renderGrammarPanel(){const host=$('studyContent');host.replaceChildren();const g=state.lesson.grammar||{};
 host.append(node('span','note-type',g.label||'LANGUAGE POINT'),node('h3','',g.term||'本章语法重点'),node('p','study-zh',g.meaning||''));
 if(g.quote)host.append(node('div','grammar-quote',g.quote));
 if(g.explain)host.append(node('p','vocab-tip',g.explain));if(g.example)host.append(node('p','vocab-tip',`例句：${g.example}`));
 host.append(node('h3','study-section-heading','试着用英语表达'));
 host.append(node('p','study-zh',state.lesson.practice?.question||'尝试复述这一集发生的事。'));
 if(state.lesson.practice?.help)host.append(node('div','vocab-tip',state.lesson.practice.help));
}
function renderPanel(){document.querySelectorAll('.study-tab').forEach(b=>{b.classList.toggle('active',b.dataset.tab===state.tab);b.setAttribute('aria-selected',String(b.dataset.tab===state.tab))});
 if(state.tab==='sentence')renderSentencePanel();else if(state.tab==='vocab')renderVocabPanel();else renderGrammarPanel();
}
function selectSentence(i,scroll=false){
 if(i<0||i>=state.lesson.sentences.length)return;
 if(i!==state.selected){stopSpeaking();state.selected=i;state.maxVisited=Math.max(state.maxVisited,i);state.activeNoteId=null;saveProgress();}
 renderStory();renderPanel();updateProgress();
 if(scroll){const s=$('storyText').querySelector(`[data-index="${i}"]`);s?.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'})}
}
function speak(text){
 const status=$('audioState');if(!('speechSynthesis' in window)){status.textContent='此浏览器不支持系统语音朗读。';return}
 try{window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.92;
  const voices=window.speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith('en'));
  if(voices.length)utterance.voice=voices.find(v=>/natural|neural|online/i.test(v.name))||voices[0];
  utterance.onstart=()=>status.textContent='正在使用浏览器语音朗读…';
  utterance.onerror=()=>status.textContent='朗读失败，请检查浏览器语音与系统设置。';
  utterance.onend=()=>status.textContent='朗读结束。';window.speechSynthesis.speak(utterance);
 }catch{status.textContent='语音功能不可用。'}
}
function stopSpeaking(){if('speechSynthesis' in window)window.speechSynthesis.cancel();if($('audioState'))$('audioState').textContent='已停止朗读。'}
function buildReaderUI(){
 $('readerRoot').innerHTML=`
 <section class="reader-intro">
  <div class="breadcrumb"><span id="readerSeries"></span> / <span id="chapterNum"></span></div>
  <h1 id="storyTitle"></h1><p class="reader-subtitle" id="storySubtitle"></p>
  <div class="reader-chiprow"><span class="pill" id="levelBadge"></span><span id="levelDisclaimer"></span></div>
  <div class="reading-meter"><div class="meter-track" role="progressbar" aria-label="最高阅读位置" aria-valuemin="0" aria-valuemax="100" id="meterValue"><div class="meter-value" id="meterFill"></div></div><span class="meter-number" id="meterText">0%</span></div>
 </section>
 <section class="reading-layout">
  <div class="paper" id="paper">
   <div class="paper-toolbar"><span>STORY · READING</span><button type="button" id="toggleZh" class="small-action" aria-pressed="false">显示全部翻译</button></div>
   <div class="story-text" id="storyText" aria-label="英文小说正文"></div>
   <div class="paper-bottom"><button id="prevSentence" class="small-action" type="button">← 上一句</button><span id="positionText">1 / 1</span><button id="nextSentence" type="button" class="nav-lesson-btn">下一句 →</button></div>
  </div>
  <aside id="studyPanel" class="study-panel" aria-label="当前句讲解">
   <div class="study-panel-label">STUDY NOTES / 学习笔记</div>
   <div role="tablist" aria-label="讲解类别" class="study-tabs"><button class="study-tab active" type="button" data-tab="sentence" role="tab" aria-selected="true">当前句</button><button class="study-tab" type="button" data-tab="vocab" role="tab" aria-selected="false">重点表达</button><button class="study-tab" type="button" data-tab="grammar" role="tab" aria-selected="false">语法 · 练习</button></div>
   <div id="studyContent" class="study-content"></div><div id="audioState" class="note-only" role="status" aria-live="polite"></div>
  </aside>
 </section>
 <div class="mobile-bar" aria-label="移动端阅读工具"><button type="button" id="mobilePrev">← 上句</button><button type="button" id="mobileNotes" class="center">句子讲解</button><button type="button" id="mobileNext">下句 →</button></div>`;
 // progressbar uses its outer track; fill is separate to keep ARIA on outer node
}
function renderChapterNavigation(catalog,meta){
 const related=catalog.lessons.filter(c=>(c.book_id||c.title)===(meta.book_id||meta.title)&&c.series_id===meta.series_id)
  .sort((a,b)=>(a.episode_number||0)-(b.episode_number||0));
 if(related.length<2)return;
 const nav=node('nav','chapter-switch');nav.setAttribute('aria-label','切换故事章节');
 const caption=node('strong','','继续阅读 · 故事章节');nav.append(caption);
 const links=node('div','chapter-switch-links');for(const c of related){
  const a=node('a','chapter-switch-link'+(c.lesson_id===meta.lesson_id?' current':''),`第 ${c.chapter} 章`);
  a.href='./reader.html?lesson='+encodeURIComponent(c.lesson_id);
  if(c.lesson_id===meta.lesson_id)a.setAttribute('aria-current','page');links.append(a);
 }
 nav.append(links);$('readerRoot').append(nav);
}
function renderHeader(){const l=state.lesson;
 $('readerSeries').textContent=l.series||'PLOTLISH STORIES';$('chapterNum').textContent='CHAPTER '+String(l.chapter).padStart(2,'0');$('storyTitle').textContent=l.title;
 document.title=`${l.title} · Plotlish · 追更英语`;
 $('storySubtitle').textContent=l.subtitle;$('levelBadge').textContent=(l.level==='Unrated'?'未分级':l.level+' · 阅读示例');$('levelDisclaimer').textContent='等级仅供参考，未经过正式 CEFR 校准';
}
function bindReader(){
 $('storyText').addEventListener('click',e=>{const b=e.target.closest('[data-index]');if(!b)return;state.tab='sentence';selectSentence(Number(b.dataset.index));const n=e.target.closest('[data-annotation]');if(n)state.activeNoteId=n.dataset.annotation;renderPanel()});
 $('prevSentence').addEventListener('click',()=>selectSentence(state.selected-1,true));$('nextSentence').addEventListener('click',()=>selectSentence(state.selected+1,true));
 $('mobilePrev').addEventListener('click',()=>selectSentence(state.selected-1,true));$('mobileNext').addEventListener('click',()=>selectSentence(state.selected+1,true));
 $('mobileNotes').addEventListener('click',()=>{state.tab='sentence';renderPanel();$('studyPanel').scrollIntoView({behavior:'smooth',block:'start'})});
 $('toggleZh').addEventListener('click',()=>{state.showAll=!state.showAll;saveProgress();renderStory();updateProgress()});
 document.querySelectorAll('.study-tab').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;renderPanel()}));
 document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','BUTTON','SELECT'].includes(document.activeElement?.tagName))return;
  if(e.key==='ArrowRight')selectSentence(state.selected+1,true);else if(e.key==='ArrowLeft')selectSentence(state.selected-1,true)});
 window.addEventListener('pagehide',stopSpeaking);
}
function validateLesson(lesson){
 if(lesson?.schema_version!=='ers-public-v1'||!Array.isArray(lesson.sentences)||!lesson.sentences.length)throw Error('课程数据格式错误');
 const ids=new Set();for(const s of lesson.sentences){if(!s.sentence_id||!s.english||typeof s.chinese!=='string'||ids.has(s.sentence_id))throw Error('课程中有损坏或重复的句子数据');ids.add(s.sentence_id)}
 for(const n of lesson.annotations||[])if(!ids.has(n.sentence_id))throw Error('知识点关联到了不存在的句子');
}
async function initReader(){const host=$('readerRoot');try{
 const cat=await getJSON('./courses/catalog.json');if(cat.schema_version!=='ers-catalog-v1'||!Array.isArray(cat.lessons))throw Error('课程目录无效');
 const params=new URLSearchParams(location.search),requested=params.get('lesson');
 const meta=cat.lessons.find(x=>x.lesson_id===requested)||(!requested?cat.lessons[0]:null);
 if(!meta)throw Error('没有找到所选章节');
 // Only load paths from the trusted local course manifest. No arbitrary URL query fetching.
 if(!/^courses\/[a-z0-9_-]+\/[a-z0-9_-]+\.json$/.test(meta.url))throw Error('章节路径无效');
 const lesson=await getJSON('./'+meta.url);validateLesson(lesson);
 if(lesson.lesson_id!==meta.lesson_id)throw Error('目录与章节ID不一致');
 state.lesson=lesson;state.progressKey=`ers-progress-v1:${lesson.lesson_id}:${lesson.revision}`;
 const saved=storage.get(state.progressKey);const idx=lesson.sentences.findIndex(s=>s.sentence_id===saved?.sentence_id);
 state.selected=idx>=0?idx:0;state.maxVisited=Math.min(lesson.sentences.length-1,Math.max(state.selected,Number.isInteger(saved?.maxVisited)?saved.maxVisited:0));state.showAll=!!saved?.showAll;
 buildReaderUI();renderHeader();renderChapterNavigation(cat,meta);bindReader();selectSentence(state.selected);saveProgress();
 }catch(e){showError(host,e)}
}
if(document.body.dataset.page==='library')initLibrary();else if(document.body.dataset.page==='reader')initReader();
