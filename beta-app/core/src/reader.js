'use strict';
(()=>{
const $=id=>document.getElementById(id);
const INIT=window.__PLOTLISH_INIT__;
if(!INIT)throw new Error('课程目录未初始化');
const BOOK_DATA=Object.fromEntries(INIT.courses.map(c=>[c.chapter_id,c]));
const CATALOG=INIT.catalog;
const BOOK_PROFILES=INIT.bookProfiles||{};
const HOMEPAGE=INIT.homepage||{schema_version:1,featured_book_id:null,sections:[]};
const LIBRARY=window.PlotlishLibrary;
const allCovers=INIT.covers;
const ALL_COURSES=BOOK_DATA;
const chaptersFor=bookId=>INIT.courses.filter(c=>c.book_id===bookId).sort((a,b)=>(a.chapter_number||0)-(b.chapter_number||0));
const BOOK_CODES=Object.fromEntries([...new Set(INIT.courses.map(c=>c.book_id))].map(id=>[id,chaptersFor(id)[0].chapter_id]));
const ALL_NOTES=INIT.courses.flatMap(c=>(c.annotations||[]).map(n=>({...n,book_id:c.book_id,chapter_id:c.chapter_id,book:c.book,chapter:c.chapter,sentence:n.sentence||c.sentences?.[n.sentenceIndex]||''})));
const coverFor=c=>allCovers[c.book_id]||'';
const lastSelected=(()=>{try{return localStorage.getItem('plotlish.student.r23.last-book')}catch(e){return null}})();
const query=new URL(location.href).searchParams;
const urlChapter=query.get('chapter');
const urlBook=query.get('book');
const urlBookId=urlBook;
const BOOK_SWITCH=(BOOK_DATA[urlChapter]?urlChapter:(BOOK_DATA[urlBook]?urlBook:(BOOK_CODES[urlBookId]||BOOK_DATA[lastSelected]&&lastSelected||CATALOG[0].chapter_id)));
const course=BOOK_DATA[BOOK_SWITCH];
if(!course)throw Error('课程文件不完整');
const chapterNum=c=>String(c.chapter_number||1).padStart(2,'0');
const numberOfBooks=new Set(INIT.courses.map(c=>c.book_id)).size;
function bookLink(code,view='book',sentenceId=null){const u=new URL(location.href);u.searchParams.set('chapter',code);u.searchParams.delete('book');u.hash='#'+(view==='reader'?(sentenceId?'reader/'+encodeURIComponent(sentenceId):'reader'):'book');return u.href}
function openBookByCode(code,view='book',sentenceId=null){if(code===BOOK_SWITCH){if(view==='reader')goReader(sentenceId?course.ids.indexOf(sentenceId):null);else route('book');return;}stopAudio();location.assign(bookLink(code,view,sentenceId));}
function hasStartedChapter(c){try{return JSON.parse(localStorage.getItem('plotlish.student.r21.chapter.'+c.chapter_id+'.started'))===true}catch(e){return false}}
// Catalogue-driven shelf and discovery. One card per published book, not one card per chapter.
function uniqueBooks(){
 const ids=[...new Set(CATALOG.map(c=>c.book_id))];
 return ids.map(id=>({id,chapters:chaptersFor(id)})).filter(b=>b.chapters.length).map(b=>{
  const preferred=b.chapters.find(c=>c.chapter_id===lastSelected)||b.chapters.find(c=>hasStartedChapter(c)&&!completedChapter(c))||b.chapters.find(c=>hasStartedChapter(c))||b.chapters[0];
  return {...b,first:b.chapters[0],preferred,profile:BOOK_PROFILES[b.id]||{}};
 });
}
function savedPosition(c){
 if(completedChapter(c))return 100;
 if(!hasStartedChapter(c))return 0;
 if(c.chapter_id===course.chapter_id){
  const possible=Math.round(((state?.selected||0)+1)/Math.max(1,course.sentences.length)*100);
  return Math.max(1,Math.min(99,possible));
 }
 // Other chapters are catalogue metadata, not full loaded texts: exact position is unavailable.
 return null;
}
function elt(tag,cls='',txt=''){const node=document.createElement(tag);if(cls)node.className=cls;if(txt)node.textContent=txt;return node}
function action(text,cls,handler){const b=elt('button',cls,text);b.type='button';b.addEventListener('click',handler);return b}
function bookCover(book,cls){
 const out=elt('div',cls);const src=coverFor(book.first);
 if(src){const img=elt('img');img.src=src;img.alt=book.first.book+' 小说封面';img.loading='lazy';out.append(img)}
 else{out.classList.add('noCover');out.textContent='PLOTLISH'}
 return out;
}
function bookMeta(book){return {title:book.first.book,titleZh:book.profile.title_zh||'',genre:book.first.genre||'',level:book.first.level||'英语精读',synopsis:book.first.synopsis||''}}
let shelfFilter='all';
function shelfStatus(b){
 const started=b.chapters.some(hasStartedChapter),done=b.chapters.every(completedChapter);
 if(!started)return 'want';
 if(done)return b.profile.publication_state==='completed'?'finished':'following';
 return 'reading';
}
const shelfStatusLabel={want:'想读',reading:'在读',following:'追更中',finished:'已读完'};
function refreshShelfAndEditorial(){
 const books=uniqueBooks(), lookup=new Map(books.map(b=>[b.id,b]));
 const featured=lookup.get(HOMEPAGE.featured_book_id);
 const sections=HOMEPAGE.sections||[];
 const editorialIds=[...new Set(sections.flatMap(section=>section.book_ids||[]))];
 const grid=$('homeBookGrid');grid.replaceChildren();grid.classList.toggle('editorialGrouped',sections.length>0);
 for(const section of sections){
  const picks=(section.book_ids||[]).map(id=>lookup.get(id)).filter(Boolean);if(!picks.length)continue;
  const block=elt('section','editorialGroup');block.append(elt('h3','editorialSectionTitle',section.title));
  const collection=elt('div','editorialCardGrid');collection.classList.toggle('singleBook',picks.length===1);
  collection.append(...picks.map(createDiscoverCard));block.append(collection);grid.append(block);
 }
 $('shelfBooksCount').textContent=editorialIds.length+' 部编辑精选';
 $('shelfEmpty').hidden=editorialIds.length!==0;
 const wanted=new Set(LIBRARY.get());
 const personal=books.filter(b=>wanted.has(b.id)).sort((a,b)=>Number(hasStartedChapter(b.preferred))-Number(hasStartedChapter(a.preferred)));
 const filtered=personal.filter(b=>shelfFilter==='all'||shelfStatus(b)===shelfFilter);
 const personalGrid=$('personalShelfGrid');personalGrid.replaceChildren(...filtered.map(b=>{
  const m=bookMeta(b),status=shelfStatus(b),card=elt('article','shelfBookCard');card.append(bookCover(b,'shelfBookCover'));
  const info=elt('div','shelfBookInfo');info.append(elt('span','shelfChip',shelfStatusLabel[status]));info.append(elt('h3','',m.title));
  if(m.titleZh)info.append(elt('p','shelfBookZh',m.titleZh));info.append(elt('p','shelfBookDesc',m.synopsis));
  const pct=savedPosition(b.preferred);const statusText=status==='want'?'尚未开始精读':b.preferred.chapter+(pct===null?'':' · '+pct+'%');info.append(elt('p','shelfBookStatus',statusText));
  if(status!=='want'&&pct!==null){const track=elt('div','shelfBookTrack');track.setAttribute('role','progressbar');track.setAttribute('aria-label','当前章节阅读进度');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(pct));const fill=elt('span');fill.style.width=pct+'%';track.append(fill);info.append(track)}
  const actions=elt('div','shelfBookActions');actions.append(action(status==='want'?'开始阅读 →':'继续阅读 →','primary',()=>openBookByCode(b.preferred.chapter_id,'reader')),action('详情','',()=>openBookByCode(b.preferred.chapter_id,'book')),action('移出书架','',()=>toggleShelf(b.id)));info.append(actions);card.append(info);return card;
 }));
 personalGrid.classList.toggle('singleBook',filtered.length===1);
 const revoked=LIBRARY.get().filter(id=>!lookup.has(id));
 if(shelfFilter==='all')for(const id of revoked){const item=elt('article','unavailableBookCard');item.append(elt('strong','','已下架作品 · '+id),elt('p','','该作品目前无法公开阅读。原有学习记录不会因此删除。'),action('移出书架','',()=>toggleShelf(id)));personalGrid.append(item)}
 $('personalShelfCount').textContent=personal.length+' 部在书架中';
 $('personalShelfEmpty').hidden=filtered.length>0||(shelfFilter==='all'&&revoked.length>0);
 $('shelfStatBooks').textContent=LIBRARY.get().length;
 $('shelfStatStarted').textContent=CATALOG.filter(hasStartedChapter).length;
 $('shelfStatCompleted').textContent=CATALOG.filter(completedChapter).length;
 let words=[];try{const v=JSON.parse(localStorage.getItem('plotlish.student.r21.wordbook')||'[]');if(Array.isArray(v))words=v}catch(e){}
 $('shelfStatWords').textContent=words.length;
 if($('bookHeroSave')){$('bookHeroSave').textContent=LIBRARY.has(course.book_id)?'移出书架 ✓':'加入书架 ＋';$('bookHeroSave').setAttribute('aria-pressed',String(LIBRARY.has(course.book_id)))}
 document.querySelectorAll('[data-save-book]').forEach(b=>{const saved=LIBRARY.has(b.dataset.saveBook);b.textContent=saved?'已加入书架 ✓':'加入书架 ＋';b.setAttribute('aria-pressed',String(saved))});
}
function toggleShelf(id){
 const saved=LIBRARY.has(id),ok=saved?LIBRARY.remove(id):LIBRARY.add(id);
 if(!ok){toast('此浏览器禁止持久化书架，请检查隐私设置');return}
 refreshShelfAndEditorial();
 if(state.view==='stories')refreshStoryResults();
 toast(saved?'已移出书架，原阅读记录不会删除':'已加入我的书架');
}
function createDiscoverCard(b){
 const m=bookMeta(b),card=elt('article','discoverNovelCard');card.append(bookCover(b,'discoverNovelCover'));
 const info=elt('div','discoverNovelInfo');const chips=elt('div','discoverNovelChips');chips.append(elt('span','shelfChip',m.level),elt('span','shelfChip',m.genre));info.append(chips);
 info.append(elt('h3','',m.title));if(m.titleZh)info.append(elt('p','discoverNovelZh',m.titleZh));
 info.append(elt('p','discoverNovelSynopsis',m.synopsis));info.append(elt('p','discoverNovelAvailable','已开放 '+b.chapters.length+' 章 · '+(hasStartedChapter(b.preferred)?'可继续阅读':'可开始精读')));
 const buttons=elt('div','discoverNovelActions');buttons.append(action('查看作品与章节 →','primary',()=>openBookByCode(b.preferred.chapter_id,'book')),action(hasStartedChapter(b.preferred)?'继续阅读':'开始阅读','',()=>openBookByCode(b.preferred.chapter_id,'reader')));const saved=action(LIBRARY.has(b.id)?'已加入书架 ✓':'加入书架 ＋','',()=>toggleShelf(b.id));saved.dataset.saveBook=b.id;saved.setAttribute('aria-pressed',String(LIBRARY.has(b.id)));buttons.append(saved);info.append(buttons);card.append(info);return card;
}
let refreshStoryResults=()=>{};
function setupStoryFilters(){
 const books=uniqueBooks(),genre=$('storyGenre'),level=$('storyLevel');
 const addOption=(parent,value)=>{const opt=document.createElement('option');opt.value=value;opt.textContent=value;parent.append(opt)};
 for(const value of [...new Set(books.flatMap(b=>(b.first.genre||'').split(/\s*[·•,]\s*/).map(g=>g.trim()).filter(Boolean)))].sort())addOption(genre,value);
 for(const value of [...new Set(books.map(b=>b.first.level||'英语精读'))].sort())addOption(level,value);
 const render=()=>{
  const term=$('storySearch').value.trim().toLocaleLowerCase(),g=genre.value,l=level.value;
  const selected=books.filter(b=>{const m=bookMeta(b);return (!term||[m.title,m.titleZh,m.genre,m.level,m.synopsis].join(' ').toLocaleLowerCase().includes(term))&&(!g||m.genre.split(/\s*[·•,]\s*/).includes(g))&&(!l||m.level===l)});
  const root=$('storyBookGrid');root.replaceChildren(...selected.map(createDiscoverCard));
  root.classList.toggle('singleBook',selected.length===1);
  $('storyResultsCount').textContent='找到 '+selected.length+' / '+books.length+' 部作品';$('storyEmpty').hidden=selected.length>0;
 };
 $('storySearch').addEventListener('input',render);genre.addEventListener('change',render);level.addEventListener('change',render);
 $('resetStoryFilters').addEventListener('click',()=>{$('storySearch').value='';genre.value='';level.value='';render();$('storySearch').focus()});
 refreshStoryResults=render;render();
}
// Optional book guide/characters; missing R2.4 metadata leaves the page intact.
function safeText(parent,tag,value,cls=''){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=value;parent.append(el);return el}
function renderCourseProfile(){
 const profile=BOOK_PROFILES[course.book_id]||{};
 const wrapper=$('courseOverview');wrapper.hidden=false;
 const guide=profile.guide||{},cast=profile.characters||[],openChapters=chaptersFor(course.book_id);
 const intro=$('courseIntroPanel'),learning=$('courseLearningPanel');
 intro.replaceChildren();learning.replaceChildren();
 const roster=cast.filter(c=>c.intro_chapter===1||openChapters.some(ch=>
  ch.chapter_number>=c.intro_chapter&&(hasStartedChapter(ch)||completedChapter(ch))));
 function makeCast(parent,list){
  const grid=safeText(parent,'div','','castGrid');
  for(const c of list){
   const card=safeText(grid,'article','','castCard');const src=profile.portrait_paths?.[c.id];
   if(src){const img=document.createElement('img');img.src='./'+src;img.loading='lazy';img.alt=(c.name_zh||c.name)+' 人物插画';card.append(img)}
   else safeText(card,'div','人物插画待完善','castPlaceholder');
   const detail=safeText(card,'div','','castCardCopy');safeText(detail,'h4',c.name_zh||c.name);
   if(c.name_zh&&c.name)safeText(detail,'div',c.name,'castEnglishName');
   if(c.role)safeText(detail,'div',c.role,'castRole');
   if(c.bio)safeText(detail,'p',c.bio);
  }
  return grid;
 }
 const layout=safeText(intro,'div','','courseIntroLayout');
 const summary=safeText(layout,'section','','courseIntroSummary');safeText(summary,'h3','故事简介');
 safeText(summary,'p',guide.intro_zh||course.synopsis,'courseSynopsisZh');
 const highlights=safeText(layout,'section','','courseIntroCast');safeText(highlights,'h3','主要人物');
 if(roster.length)makeCast(highlights,roster);
 else safeText(highlights,'p','人物介绍将在阅读中逐步解锁。','muted');
  if(guide.tagline)safeText(learning,'p',guide.tagline,'muted');
 const lists=safeText(learning,'div','','courseGuideLists');
 for(const [heading,rows] of [['学习目标',guide.learning_goals||[]],['推荐学习方法',guide.study_tips||[]]]){
  const box=safeText(lists,'section','');safeText(box,'strong',heading);
  if(rows.length){const ul=safeText(box,'ul','');for(const r of rows)safeText(ul,'li',r)}
  else safeText(box,'p','暂未设置，直接开始阅读即可。','muted');
 }
 const tabs=[...wrapper.querySelectorAll('[data-course-tab]')],panels={intro,learning};
 const activate=active=>{
  for(const b of tabs){const on=b===active;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1}
  for(const [key,panel] of Object.entries(panels))panel.hidden=key!==active.dataset.courseTab;
 };
 for(const t of tabs){t.onclick=()=>activate(t);
  t.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   e.preventDefault();const idx=tabs.indexOf(t);const chosen=e.key==='Home'?tabs[0]:e.key==='End'?tabs[tabs.length-1]:tabs[(idx+tabs.length+(e.key==='ArrowRight'?1:-1))%tabs.length];activate(chosen);chosen.focus();};
 }
 activate(tabs.find(t=>t.classList.contains('active'))||tabs[0]);
}
function completedChapter(c){try{return JSON.parse(localStorage.getItem('plotlish.student.r21.chapter.'+c.chapter_id+'.completed'))===true}catch(e){return false}}
function makeUnitLinks(parent,c,cls='courseUnitList'){
 if(!Array.isArray(c.units)||!c.units.length)return;
 const wrap=safeText(parent,'div','',cls);wrap.setAttribute('aria-label',c.chapter+' 学习单元');
 for(const unit of c.units){const btn=safeText(wrap,'button',unit.title);btn.type='button';btn.title=unit.description||'';
  btn.onclick=()=>openBookByCode(c.chapter_id,'reader',unit.start_id)}
}
function setupBookNavigation(){
 // Discovery and library cards are rendered after reading state is initialized.
 renderCourseProfile();
 const book=$('bookView');book.querySelector('.bookHero .eyebrow').textContent='PLOTLISH ORIGINAL · ENGLISH FICTION';
 book.querySelector('.bookHero h1').textContent=course.book;
 book.querySelector('.bookHero .lead').textContent=course.synopsis;
 $('bookHeroTitleZh').textContent=BOOK_PROFILES[course.book_id]?.title_zh||'';
 const chapters=chaptersFor(course.book_id),count=chapters.length;
 book.querySelector('.sectionBar span').textContent='共 '+count+' 章可阅读';
 const tags=book.querySelectorAll('.bookHeroTags span');if(tags[0])tags[0].textContent=course.genre||'Mystery';if(tags[1])tags[1].textContent=course.level||'英语精读';if(tags[2])tags[2].textContent='已开放 '+count+' 章';
 const row=book.querySelector('.chapterRow'),rowParent=row.parentNode;
 function fillRow(r,c,isCurrent){
  r.dataset.chapterId=c.chapter_id;
  r.querySelector('.chapterNum').textContent=chapterNum(c);
  r.querySelector('strong').textContent=c.chapter;
  r.querySelector('.muted').textContent=(c.subtitle||'')+' · '+(c.sentences_count ?? c.sentences.length)+' 句 · 逐句译文';
  r.querySelectorAll('.courseUnitList,.courseChapterProgress').forEach(el=>el.remove());
  makeUnitLinks(r.querySelector('.chapterNum').nextElementSibling,c);
  const progress=safeText(r.querySelector('.chapterNum').nextElementSibling,'div',completedChapter(c)?'✓ 本章已完成':(hasStartedChapter(c)?'已开始学习':'尚未开始'),'courseChapterProgress');
  const btn=r.querySelector('button');btn.textContent=hasStartedChapter(c)?'继续阅读 →':'开始阅读 →';
  if(!isCurrent){btn.removeAttribute('id');btn.onclick=()=>openBookByCode(c.chapter_id,'reader')}
 }
 const ordered=[];
 for(const c of chapters){
  const r=c.chapter_id===course.chapter_id?row:row.cloneNode(true);fillRow(r,c,c.chapter_id===course.chapter_id);ordered.push(r);
 }
 row.replaceWith(...ordered);
 refreshBookProgress();
 const info=book.querySelector('.chapterRow:last-of-type + p.small');if(info)info.textContent='所有章节都使用同一套阅读器，学习记录按章节保存。';
 const hdr=$('readerView').querySelector('.chapterHeader');hdr.querySelector('strong').textContent=course.chapter;hdr.querySelector('span').textContent=course.book+' · Chapter '+chapterNum(course);
 const meta=$('readerView').querySelector('.paperMeta span');const metaLevel=document.createElement('em');metaLevel.textContent='· '+course.level;meta.replaceChildren(document.createTextNode('CHAPTER '+chapterNum(course)+' '),metaLevel);
 const ch=$('chapterDrawer');ch.querySelector('.eyebrow').textContent=course.book.toUpperCase();ch.querySelector('.chapterDrawerCurrent strong').textContent=course.chapter;ch.querySelector('.chapterDrawerCurrent .chapterDrawerIndex').textContent=chapterNum(course);ch.querySelector('.chapterDrawerCurrent .muted').textContent='当前章节 · '+course.sentences.length+' 句';
 const oldUnitLinks=ch.querySelector('.drawerUnits');if(oldUnitLinks)oldUnitLinks.remove();
 const currentUnits=course.units||[];if(currentUnits.length)makeUnitLinks(ch.querySelector('.chapterDrawerCurrent').parentNode,course,'drawerUnits');
 const other=chapters.filter(c=>c.chapter_id!==course.chapter_id);const future=ch.querySelector('.chapterDrawerFuture');future.replaceChildren();
 for(const c of other){const box=safeText(future,'div','');const btn=safeText(box,'button','第 '+chapterNum(c)+' 章 · '+c.chapter,'chapterNavLink');btn.type='button';btn.onclick=()=>openBookByCode(c.chapter_id,'reader');makeUnitLinks(box,c,'drawerUnits')}
 if(!other.length){const msg=document.createElement('p');msg.textContent='目前本作品只开放这一章。';future.append(msg)}
 $('reviewView').querySelector('h1').textContent='读完 '+course.chapter;
 $('reviewView').querySelector('.eyebrow').textContent='CHAPTER '+chapterNum(course)+' · FINISHED READING';
 document.title='PLOTLISH · '+course.book;
}
setupBookNavigation();
const LEGACY='plotlish.student.r2.'+course.chapter_id+'.';
const PREFIX='plotlish.student.r21.';
const STORAGE=PREFIX+'chapter.'+course.chapter_id+'.';
const storageKey=k=>k==='prefs'?PREFIX+'preferences':k==='notes'?PREFIX+'wordbook':STORAGE+k;
const sessionStore=new Map();let storageError=false;
function getRaw(k){if(sessionStore.has(k))return sessionStore.get(k);try{return localStorage.getItem(k)}catch(e){storageError=true;return null}}
function setRaw(k,v){sessionStore.set(k,v);try{localStorage.setItem(k,v);return true}catch(e){storageError=true;const n=$('storageNotice');if(n)n.textContent='本次浏览器限制本地保存；目前仅临时记住记录，请使用导出备份。';return false}}
function delRaw(k){sessionStore.delete(k);try{localStorage.removeItem(k);return true}catch(e){storageError=true;return false}}
function ownedKeys(){const keys=new Set([...sessionStore.keys()]);try{for(let i=0;i<localStorage.length;i++)keys.add(localStorage.key(i))}catch(e){}return [...keys]}
function read(key,def){try{let next=getRaw(storageKey(key));if(next!==null){let val=JSON.parse(next);return val===null?def:val}const old=getRaw(LEGACY+key);return old===null?def:JSON.parse(old)}catch(e){return def}}
function save(key,value){return setRaw(storageKey(key),JSON.stringify(value))}
function stored(k){try{return JSON.parse(getRaw(storageKey(k)))}catch(e){return null}}
// Old R2 data is copied once; no original keys are overwritten until the user explicitly clears all data.
function migrateR2(){const marker=PREFIX+'migrated.'+course.chapter_id;if(getRaw(marker))return;const legacyKeys=['prefs','sentenceId','notes','familiar','completed','reflection'];const snapshot={};for(const k of legacyKeys){const val=getRaw(LEGACY+k);if(val!==null){snapshot[k]=val;if(getRaw(storageKey(k))===null)setRaw(storageKey(k),val)}}if(Object.keys(snapshot).length)setRaw(PREFIX+'migration.backup.'+course.chapter_id,JSON.stringify(snapshot));setRaw(marker,'1')}
migrateR2();
function toast(m){$('toast').textContent=m;$('toast').classList.add('visible');clearTimeout(toast.t);toast.t=setTimeout(()=>$('toast').classList.remove('visible'),3200)}

const defaults={hoverDelay:750,lastImageMode:'compact',clickSpeak:true,nextSpeak:true,pageSpeak:false,mode:'pages',fontSize:19,lineHeight:1.65,voice:'',rate:1,translation:'current',explain:true,scenes:true,imageMode:'compact',readingPreset:'assisted',hoverTranslation:true};
const prefs={...defaults,...read('prefs',{})};
$('hoverTranslation').checked=prefs.hoverTranslation!==false;
const state={view:'home',lastStory:'home',fromNotebook:'home',selected:Math.max(0,course.ids.indexOf(read('sentenceId',course.ids[0]))),anchorOffset:Math.max(0,read('offset',0)||0),page:0,pages:[],notes:read('notes',[]),familiar:read('familiar',[]),completed:read('completed',false),drawer:false,notebookReturn:null,activeNote:null,settingsTab:'audio',openModal:null,restoreFocus:null,voiceList:[],scrollRestore:0,scrollAtEnd:false};
const sceneData=INIT.scenes;
const inlineScenes=()=>window.innerWidth<=800||!prefs.explain;
const companionSceneAt=index=>{const visible=Object.keys(sceneData).length?(course.scenes||[]).filter(s=>s.start_index<=index&&sceneData[s.scene_id]):[];return visible[visible.length-1]||null};
function paintSceneCompanion(){const section=$('sceneCompanion');if(!section)return;const scene=!inlineScenes()&&prefs.scenes&&prefs.explain?companionSceneAt(state.selected):null;section.hidden=!scene;if(!scene)return;const img=$('companionImage');const src=sceneData[scene.scene_id];if(img.getAttribute('src')!==src)img.src=src;img.alt=scene.alt||scene.title||'当前剧情插图';$('companionTitle').textContent=scene.title||'当前剧情';$('companionImageButton').setAttribute('aria-label','放大当前场景：'+(scene.title||'剧情插图'));section.classList.toggle('isLarge',prefs.imageMode==='full');}

// Legacy R2 deliberately stored scenes=false because it had no approved images.
// Only carry forward an explicit R2.1 image choice, not the forced legacy default.
const SCENE_USER_CHOICE=PREFIX+'scenes.user-choice.v1';
if(Object.keys(sceneData).length&&prefs.scenes===false&&getRaw(SCENE_USER_CHOICE)!=='1'){
 prefs.scenes=true;
 save('prefs',prefs);
}
// R2.2: older R2.1 settings had only a boolean for scenes, preserve intentional hiding.
const earlierPrefs=read('prefs',{});
if(!['compact','full','hidden'].includes(earlierPrefs.imageMode))prefs.imageMode=prefs.scenes?'compact':'hidden';
prefs.scenes=prefs.imageMode!=='hidden';
if(prefs.imageMode!=='hidden')prefs.lastImageMode=prefs.imageMode;
const ann=course.annotations||[];
const annAt=i=>ann.filter(n=>n.sentenceIndex===i);
const speech={kind:'idle',status:'idle',generation:0,utterance:null,index:-1};
let pendingMeasure=false,activeRoute=null;
const stableID=i=>course.ids[Math.max(0,Math.min(course.ids.length-1,i))];
const posFromID=id=>{let v=course.ids.indexOf(id);return v<0?0:v};
function persist(){save('prefs',prefs);save('sentenceId',stableID(state.selected));save('notes',state.notes);save('familiar',state.familiar);save('completed',state.completed);save('offset',state.anchorOffset)}
function label(tag,text,cls){const el=document.createElement(tag);el.textContent=text||'';if(cls)el.className=cls;return el}
function hide(el,h){el.hidden=!!h}
function hasSpeech(){return typeof speechSynthesis!=='undefined'&&typeof SpeechSynthesisUtterance!=='undefined'}
function scoreVoice(v){const lang=(v.lang||'').toLowerCase();const online=!v.localService||/online|natural|neural/i.test(v.name);const locale=lang==='en-us'?0:lang==='en-gb'?20:lang.startsWith('en-ca')?30:lang.startsWith('en-au')?40:60;return (online?0:100)+locale+(/microsoft/i.test(v.name)?0:5)}
function voicesChanged(){if(!hasSpeech())return;const voices=speechSynthesis.getVoices().filter(v=>/^en/i.test(v.lang)).sort((a,b)=>scoreVoice(a)-scoreVoice(b));state.voiceList=voices;const sel=$('voice');const old=prefs.voice;sel.replaceChildren();sel.add(new Option('自动选择可用英语语音',''));for(const v of voices){const online=!v.localService||/online|natural|neural/i.test(v.name);sel.add(new Option((online?'在线 · ':'本机 · ')+(v.lang||'English')+' · '+v.name,v.voiceURI));}if(old&&voices.some(v=>v.voiceURI===old))sel.value=old;else sel.value='';}
function playbackUI(){let isContinuous=speech.kind==='continuous';const b=$('playContinuous');b.textContent=isContinuous?(speech.status==='paused'?'▶ 继续':'Ⅱ 暂停'):'▶ 连续朗读';$('playStatus').textContent=speech.kind==='idle'?'点击句子可试听，↑↓ 切换句子':speech.status==='paused'?'朗读已暂停':isContinuous?'正在连续朗读':'正在朗读当前句';}
function stopAudio(){++speech.generation;try{if(hasSpeech())speechSynthesis.cancel()}catch(e){}speech.kind='idle';speech.status='idle';speech.index=-1;speech.utterance=null;playbackUI()}
function startSpeech(index,kind){if(!hasSpeech()){toast('当前浏览器不支持语音合成，请更换浏览器');return}stopAudio();const gen=++speech.generation;const utter=new SpeechSynthesisUtterance(course.sentences[index]);utter.lang='en-US';utter.rate=Number(prefs.rate)||1;let v=state.voiceList.find(v=>v.voiceURI===prefs.voice)||(state.voiceList[0]||null);if(v){utter.voice=v;utter.lang=v.lang||'en-US'}speech.kind=kind;speech.status='playing';speech.index=index;speech.utterance=utter;
utter.onend=()=>{if(gen!==speech.generation||speech.status==='idle')return;if(kind==='continuous'&&index<course.sentences.length-1){selectSentence(index+1,{origin:'speech',speak:false});startSpeech(index+1,'continuous')}else{stopAudio();if(kind==='continuous')toast('已经朗读到本章结尾。你可以选择完成本章或继续阅读。')}};
utter.onerror=e=>{if(gen!==speech.generation)return;const err=e?.error;if(err==='interrupted'||err==='canceled')return;stopAudio();toast('发音失败，请在设置里切换发音人')};
try{speechSynthesis.speak(utter);playbackUI()}catch(e){stopAudio();toast('发音启动失败')}
}
function playContinuous(){if(speech.kind==='continuous'){try{if(speech.status==='paused'){speechSynthesis.resume();speech.status='playing'}else{speechSynthesis.pause();speech.status='paused'}}catch(e){}playbackUI();return}startSpeech(state.selected,'continuous')}
const views=['home','stories','shelf','book','reader','notebook','review'];
function route(view,{push=true,origin=null}={}){if(view!=='reader')window.__plotlishCloseWordDetail?.();
 if(!views.includes(view))view='home';
 const changed=state.view!==view;
 if(!changed&&push)return;
 if(changed){closeChapterDrawer();hide($('readerOptions'),true)}
 if(changed&&speech.kind!=='idle')stopAudio();
 if(state.view==='reader'&&changed)closeDrawer();
 if(view==='notebook'&&changed)state.fromNotebook=origin||state.view;
 state.view=view;
 if(view==='reader'){save('started',true);if(!LIBRARY.has(course.book_id)&&!LIBRARY.add(course.book_id))toast('本地书架保存失败，请导出记录');try{localStorage.setItem('plotlish.student.r23.last-book',BOOK_SWITCH)}catch(e){}}
 document.title=(view==='reader'?course.chapter+' · '+course.book+' · ':view==='book'?course.book+' · ':view==='notebook'?'生词本 · ':view==='stories'?'发现故事 · ':view==='shelf'?'我的书架 · ':'首页 · ')+'Plotlish';
 for(const id of views)$(id+'View').classList.toggle('active',id===view);
 $('navHome').classList.toggle('active',view==='home');
 $('navLibrary').classList.toggle('active',view==='shelf');
 $('navStory').classList.toggle('active',view==='stories'||view==='book'||view==='reader'||view==='review');
 $('navWords').classList.toggle('active',view==='notebook');
 $('resumeTop').textContent=view==='reader'?'正在阅读':'继续阅读 ↗';
 if(view==='reader'){hide($('readerIntro'),read('guideHidden',false)===true);requestPageReflow();setTimeout(()=>{if(state.view==='reader'){paint();if(prefs.mode==='scroll')scrollToSelected()}},0)}
 if(view==='book'){renderCourseProfile();refreshBookProgress()};
 if(view==='stories')refreshStoryResults();if(view==='shelf')refreshShelfAndEditorial();
 if(view==='notebook')renderNotebook();if(view==='review')renderReview();updateHomePosition();
 const value=view==='reader'?'reader/'+stableID(state.selected):view;
 try{const url='#'+value;if(push&&location.hash!==url)history.pushState({view,idx:state.selected},'',url);else if(!push&&location.hash!==url)history.replaceState({view,idx:state.selected},'',url)}catch(e){}
}
function goReader(i=null,opts={}){save('started',true);try{localStorage.setItem('plotlish.student.r23.last-book',BOOK_SWITCH)}catch(e){};if(Number.isInteger(i)){state.selected=Math.min(course.ids.length-1,Math.max(0,i));state.anchorOffset=0;}route('reader',opts)}
function backFromNotebook(){route(views.includes(state.fromNotebook)&&state.fromNotebook!=='notebook'?state.fromNotebook:'home')}
function browserNav(){const raw=location.hash.replace(/^#/,'');let match=raw.match(/^reader\/(.+)$/);let view=match?'reader':(views.includes(raw)?raw:'home');if(match){const found=course.ids.indexOf(decodeURIComponent(match[1]));if(found>=0){state.selected=found;state.anchorOffset=0;}}route(view,{push:false});}
const floatingTranslation=label('div','','floatingTranslation');floatingTranslation.id='floatingTranslation';floatingTranslation.hidden=true;
floatingTranslation.append(label('span','','floatingText'));const floatClose=label('button','×','');floatClose.type='button';floatClose.setAttribute('aria-label','暂时隐藏当前句翻译');floatClose.onclick=()=>{floatingTranslation.hidden=true};floatingTranslation.append(floatClose);$('readerView').append(floatingTranslation);
function updateHomePosition(){
 const featured=uniqueBooks().find(b=>b.id===HOMEPAGE.featured_book_id)||null;
 const started=read('started',false)===true;
 const position=state.selected+1,total=Math.max(1,course.sentences.length);
 const percent=state.completed?100:started?Math.max(1,Math.min(99,Math.round(position/total*100))):0;
 const welcome=$('homeWelcome');welcome.hidden=false;
 welcome.querySelector('h2').textContent=featured?featured.first.book:'每个故事，都是一次新的英语阅读。';
 welcome.querySelector('p').textContent=featured?(featured.first.synopsis||'打开本期主推，开始阅读。'):'本站尚未设置主推作品。你仍可以在发现故事中查看全部已发布小说。';
 $('homeContinue').hidden=!featured;$('homeViewDetail').hidden=!featured;
 $('homeContinue').textContent='开始精读 →';
 $('homePosition').textContent='';
 const resume=$('homeResumePanel');resume.hidden=!started;
 if(resume.parentElement?.id!=='homeResumeSlot')$('homeResumeSlot').append(resume);
 resume.querySelector('h2').textContent=course.book;
 resume.querySelector('.homeResumeChapter').textContent='Chapter '+chapterNum(course)+' · '+course.chapter;
 $('homeResumeStatus').textContent=state.completed?'本章已完成':'上次读到第 '+position+' / '+total+' 句';
 $('homeResumePercent').textContent=percent+'%';$('homeProgressFill').style.width=percent+'%';$('homeProgressFill').parentElement.setAttribute('aria-valuenow',String(percent));
 $('resumeTop').textContent=state.view==='reader'?'正在阅读':started?'继续阅读 ↗':'开始阅读 ↗';
 configureCovers();refreshBookProgress();refreshShelfAndEditorial();
}
function configureCovers(){
 const featured=uniqueBooks().find(b=>b.id===HOMEPAGE.featured_book_id)||null;
 const feature=$('homeView')?.querySelector('.shelfFeature');
 const home=$('homeCoverArt');
 if(feature){
  const hero=featured?.profile.hero||null,cover=featured?coverFor(featured.first):null;
  feature.classList.toggle('hasStoryHero',!!hero);feature.classList.toggle('hasStoryCover',!hero&&!!cover);
  feature.classList.toggle('noFeatured',!featured);
  feature.style.backgroundImage=hero?`linear-gradient(90deg,rgba(11,25,23,.98) 0%,rgba(11,25,23,.94) 34%,rgba(11,25,23,.46) 69%,rgba(11,25,23,.10) 100%),url("./${hero}")`:'';
  home.hidden=!featured||!!hero;
  home.style.backgroundImage=cover?`url("${cover}")`:'';
  home.querySelector('.coverFallback')?.toggleAttribute('hidden',!!cover);
  if(featured)home.setAttribute('aria-label',featured.first.book+' 小说封面');
 }
 const hero=BOOK_PROFILES[course.book_id]?.hero,cover=coverFor(course);
 const artwork=$('bookHeroArtwork');
 if(artwork){artwork.style.backgroundImage=hero?'url("./'+hero+'")':cover?'linear-gradient(90deg,#102522 3%,rgba(16,37,34,.65) 70%),url("'+cover+'")':'';artwork.classList.toggle('hasHero',!!hero)}
}
function refreshBookProgress(){
 const current=chaptersFor(course.book_id).find(c=>c.chapter_id===course.chapter_id)||course;
 const started=hasStartedChapter(current),finished=completedChapter(current);
 const label=finished?'重读第一章 →':started?'继续阅读 →':'开始精读第一章 →';
 const start=$('bookHeroStart');if(start)start.textContent=label;
 for(const row of document.querySelectorAll('#bookChapterSection .chapterRow')){
  const c=chaptersFor(course.book_id).find(ch=>ch.chapter_id===row.dataset.chapterId);if(!c)continue;
  const done=completedChapter(c),begun=hasStartedChapter(c);const progress=row.querySelector('.courseChapterProgress');
  if(progress)progress.textContent=done?'✓ 本章已完成':begun?'已开始学习':'尚未开始';
  const btn=row.querySelector('button.primary');if(btn)btn.textContent=done?'重读章节 →':begun?'继续阅读 →':'开始阅读 →';
 }
}

// Reading pagination is measured from rendered font metrics, not fixed sentence counts.
function renderMarked(parent,i,text,offset=0){
 const spans=[];for(const n of annAt(i)){
  const full=course.sentences[i].toLowerCase(),needle=n.phrase.toLowerCase();let st=full.indexOf(needle);
  while(st>=0){const en=st+needle.length;if(st<offset+text.length&&en>offset)spans.push({start:Math.max(st,offset)-offset,end:Math.min(en,offset+text.length)-offset,n});st=full.indexOf(needle,st+needle.length)}
 }
 spans.sort((a,b)=>a.start-b.start);let last=0;
 for(const x of spans){if(x.start<last)continue;parent.appendChild(document.createTextNode(text.slice(last,x.start)));const node=label('span',text.slice(x.start,x.end),'noteWord');node.dataset.noteId=x.n.id;node.tabIndex=0;node.setAttribute('role','button');node.setAttribute('aria-label','查看知识点：'+x.n.phrase);parent.append(node);last=x.end}
 parent.appendChild(document.createTextNode(text.slice(last)));
}
function makeRow(seg,{measure=false}={}){
 let row=label('div','','readingSentence'+(seg.break?' paragraphStart':''));row.dataset.index=seg.i;row.dataset.start=String(seg.start||0);row.dataset.end=String(seg.end??course.sentences[seg.i].length);
 if(seg.start>0)row.dataset.fragment='true';let number=label('span',seg.start>0?'↳':String(seg.i+1),'number');let words=label('span','','sentenceText');renderMarked(words,seg.i,seg.text,seg.start||0);row.append(number,words);
 if(prefs.translation==='bilingual'&&seg.end===course.sentences[seg.i].length){row.append(label('span','','rowSpacer'));row.append(label('span',course.translations[seg.i],'translatedInline'))}
 if(!measure){row.tabIndex=0;row.setAttribute('aria-label','第 '+(seg.i+1)+' 句：'+seg.text);if(seg.i===state.selected)row.classList.add('isSelected')}
 return row;
}
function renderScene(seg,{measure=false}={}){const s=course.scenes?.find(x=>x.start_index===seg.sceneIndex);if(!inlineScenes()||!s||!prefs.scenes||!sceneData[s.scene_id])return document.createComment('scene');const fig=label('figure','','sceneFigure');fig.classList.toggle('imageFull',prefs.imageMode==='full');if(measure){const placeholder=label('div','','sceneMeasure');fig.append(placeholder,label('figcaption',s.title));return fig}const button=label('button','','sceneImageButton');button.type='button';button.setAttribute('aria-label','放大场景插图：'+s.title);const img=document.createElement('img');img.src=sceneData[s.scene_id];img.alt=s.alt||s.title;img.loading='lazy';button.append(img);button.onclick=()=>openSceneModal(s);fig.append(button,label('figcaption',s.title));return fig}
function openSceneModal(scene){const img=$('fullSceneImage');img.src=sceneData[scene.scene_id];img.alt=scene.alt||scene.title;$('fullSceneTitle').textContent=scene.title;showModal('sceneModal')}
function makeSegment(seg,opts={}){return seg.type==='scene'?renderScene(seg,opts):makeRow(seg,opts)}
function measureSetup(){const text=$('pageText');const css=getComputedStyle(text);const m=$('measureText');m.style.width=Math.max(80,text.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight))+'px';m.style.fontSize=prefs.fontSize+'px';m.style.lineHeight=String(prefs.lineHeight)}
function tryHeight(segs){const m=$('measureText');m.replaceChildren(...segs.map(s=>makeSegment(s,{measure:true})));return m.scrollHeight;}
function availableHeight(){const el=$('pageText');const cs=getComputedStyle(el);return Math.max(85,el.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom)-(prefs.scenes?46:20))}
function paragraphAt(i){return course.paragraphBreaks.includes(i)}
function splitFit(i,start,end,part,current,maxH){
 const txt=course.sentences[i],poss=[];
 for(let j=start+1;j<end;j++){if(/\s/.test(txt[j-1]))poss.push(j)}
 if(!poss.length||poss[poss.length-1]!==end)poss.push(end);
 let lo=0,hi=poss.length-1,best=-1;
 while(lo<=hi){let m=(lo+hi)>>1,at=poss[m],test={i,start,end:at,text:txt.slice(start,at),part,break:part===0&&paragraphAt(i)};if(tryHeight([...current,test])<=maxH){best=m;lo=m+1}else hi=m-1}
 if(best>=0)return poss[best];
 // A single long unbroken token: split at a Unicode code-point boundary rather than hiding its tail.
 let a=start+1,b=end,res=start+1;while(a<=b){let m=(a+b)>>1;let test={i,start,end:m,text:txt.slice(start,m),part,break:part===0&&paragraphAt(i)};if(tryHeight([...current,test])<=maxH){res=m;a=m+1}else b=m-1}return Math.min(end,Math.max(start+1,res));
}
function paginate(){
 if(state.view!=='reader'||prefs.mode!=='pages')return;const oldScenePage=state.pages[state.page]?.length===1&&state.pages[state.page][0].type==='scene'?state.pages[state.page][0].sceneIndex:null;measureSetup();let maxH=availableHeight(),pages=[],current=[];
 const flush=()=>{if(current.length){pages.push(current);current=[]}};
 for(let i=0;i<course.sentences.length;i++){
  const scene=course.scenes?.find(x=>x.start_index===i);
  if(inlineScenes()&&prefs.scenes&&scene&&sceneData[scene.scene_id]){
   // Keep the original 4:3 geometry. Start at a page boundary so the image is
   // never squeezed; add accompanying prose below when space permits.
   flush();current.push({type:'scene',sceneIndex:i});
   // Keep the first line of the following paragraph on the image page when
   // space allows; otherwise keep the whole image on its own page.
   const previewEnd=Math.min(course.sentences[i].length,Math.max(1,Math.min(70,(course.sentences[i].match(/^.{1,70}(?=\s|$)/)||[''])[0].length||70)));
   const lead={i,start:0,end:previewEnd,text:course.sentences[i].slice(0,previewEnd),part:0,break:paragraphAt(i)};
   if(tryHeight([...current,lead])>maxH)flush();
  }
  let start=0,part=0,guard=0,end=course.sentences[i].length;
  while(start<end&&guard++<1000){let seg={i,start,end,text:course.sentences[i].slice(start,end),part,break:part===0&&paragraphAt(i)};
   if(tryHeight([...current,seg])<=maxH){current.push(seg);start=end;break}
   if(current.length&&current.some(s=>s.type!=='scene')){flush();continue}
   const split=splitFit(i,start,end,part,current,maxH);current.push({...seg,end:split,text:course.sentences[i].slice(start,split)});flush();start=split;part++;
  }
 }
 flush();state.pages=pages.length?pages:[[]];
 let p=state.pages.findIndex(pg=>pg.some(s=>s.type!=='scene'&&s.i===state.selected&&s.start<=state.anchorOffset&&s.end>state.anchorOffset));
 if(p<0)p=state.pages.findIndex(pg=>pg.some(s=>s.type!=='scene'&&s.i===state.selected));if(inlineScenes()&&oldScenePage!==null){const still=state.pages.findIndex(pg=>pg.length===1&&pg[0].type==='scene'&&pg[0].sceneIndex===oldScenePage);if(still>=0)p=still;}state.page=Math.max(0,p);
}
function paintPage(){const root=$('pageText');root.replaceChildren();const segs=state.pages[state.page]||[];for(const seg of segs)root.appendChild(makeSegment(seg));root.classList.toggle('sceneOnlyPage',segs.length===1&&segs[0].type==='scene');$('pageNumber').textContent=(state.page+1)+' / '+state.pages.length+' 页';$('prevPage').disabled=state.page===0;$('nextPage').disabled=state.page>=state.pages.length-1;hide($('finishChapter'),state.page!==state.pages.length-1);$('sentencePosition').textContent='第 '+(state.selected+1)+' / '+course.sentences.length+' 句';}
function paintScroll(){const root=$('scrollText');root.replaceChildren();for(let i=0;i<course.sentences.length;i++){let scene=course.scenes?.find(x=>x.start_index===i);if(inlineScenes()&&prefs.scenes&&scene&&sceneData[scene.scene_id])root.appendChild(renderScene({sceneIndex:i}));root.appendChild(makeRow({i,text:course.sentences[i],start:0,end:course.sentences[i].length,break:paragraphAt(i)}))}const scrollFinish=label('button','完成本章 ✓','primary scrollFinish');scrollFinish.onclick=completeChapter;root.appendChild(scrollFinish);$('pageNumber').textContent='连续阅读';$('prevPage').disabled=true;$('nextPage').disabled=true;hide($('finishChapter'),true);}
function paint(){const strip=$('floatingTranslation');if(strip){strip.hidden=prefs.explain||prefs.translation!=='current'||state.view!=='reader';strip.querySelector('.floatingText').textContent=course.translations[state.selected]};document.documentElement.style.setProperty('--reader-size',prefs.fontSize+'px');document.documentElement.style.setProperty('--reader-leading',String(prefs.lineHeight));$('pageBody').classList.toggle('scrollReading',prefs.mode==='scroll');$('pageText').hidden=prefs.mode==='scroll';$('scrollText').hidden=prefs.mode!=='scroll';$('readerLayout').classList.toggle('noExplain',!prefs.explain);$('explainPanel').hidden=!prefs.explain;if(prefs.mode==='pages')paintPage();else paintScroll();paintSceneCompanion();paintExplanation();playbackUI()}
function selectSentence(index,{origin='click',speak=null,noteId=null,keepContinuous=false,pageHint=null,offset=0}={}){
 index=Math.min(course.sentences.length-1,Math.max(0,index));if(!keepContinuous)stopAudio();const previous=state.selected;state.selected=index;state.activeNote=noteId;
 const speakNow=speak===null?(origin==='click'?prefs.clickSpeak:origin==='next'?prefs.nextSpeak:false):speak;
 if(state.view==='reader'){
  if(prefs.mode==='pages'){
   const p=(Number.isInteger(pageHint)?pageHint:-1);
   if(p>=0&&state.pages[p]?.some(s=>s.i===index&&s.type!=='scene'))state.page=p;
   else{const match=state.pages.findIndex(pg=>pg.some(s=>s.i===index&&s.type!=='scene'&&s.start<=offset&&s.end>offset));state.page=Math.max(0,match)}
  }
  state.anchorOffset=Math.max(0,offset);paint();if(prefs.mode==='scroll')scrollToSelected();if(noteId&&innerWidth<=800)openDrawer();
 }
 persist();replaceCurrentReaderEntry();if(speakNow&&!keepContinuous)startSpeech(index,'sentence');
}
function replaceCurrentReaderEntry(){if(state.view!=='reader')return;try{history.replaceState({view:'reader',idx:state.selected},'','#reader/'+stableID(state.selected))}catch(e){}}
function changeSentence(d){let next=state.selected+d;if(next<0||next>=course.sentences.length){toast(next>=course.sentences.length?'已经到本章最后一句':'已经是第一句');return}selectSentence(next,{origin:'next'})}
function changePage(d){dismissWordHint();closeWordDetail();if(prefs.mode!=='pages'){$('pageBody').scrollBy({top:(d>0?1:-1)*$('pageBody').clientHeight*.85,behavior:'smooth'});return}let next=state.page+d;if(next<0||next>=state.pages.length){if(next>=state.pages.length)toast('已到最后一页，完成本章请点击明确的完成按钮。');return}stopAudio();state.page=next;const fragment=state.pages[next].find(x=>x.type!=='scene');if(fragment){state.selected=fragment.i;state.anchorOffset=fragment.start}else if(state.pages[next].length===1&&state.pages[next][0].type==='scene'){state.selected=state.pages[next][0].sceneIndex;state.anchorOffset=0}state.activeNote=null;paint();persist();replaceCurrentReaderEntry();if(prefs.pageSpeak)startSpeech(state.selected,'sentence')}
function scrollToSelected(){if(prefs.mode!=='scroll')return;const el=$('scrollText').querySelector('.readingSentence[data-index="'+state.selected+'"]');el?.scrollIntoView({block:'nearest',behavior:'instant'})}
function requestPageReflow(){if(pendingMeasure)return;pendingMeasure=true;requestAnimationFrame(()=>{pendingMeasure=false;if(state.view==='reader'){/* Reveal the target layout before measuring or a hidden page has zero height. */$('pageBody').classList.toggle('scrollReading',prefs.mode==='scroll');$('pageText').hidden=prefs.mode==='scroll';$('scrollText').hidden=prefs.mode!=='scroll';if(prefs.mode==='pages')paginate();paint();if(prefs.mode==='scroll')scrollToSelected()}})}
function openDrawer(){if(innerWidth>800)return;state.drawer=true;state.drawerRestoreFocus=document.activeElement;hide($('overlayShade'),false);hide($('mobileDrawer'),false);paintExplanation();$('closeDrawer').focus()}
function closeDrawer(){if(!state.drawer)return;state.drawer=false;hide($('overlayShade'),true);hide($('mobileDrawer'),true);if(state.drawerRestoreFocus?.isConnected)state.drawerRestoreFocus.focus();state.drawerRestoreFocus=null}
function fillExplanation(root){root.replaceChildren();let labelTop=label('div','当前句翻译','asideOverline');root.append(labelTop);if(prefs.translation==='hidden'){root.appendChild(label('p','中文已隐藏，可在阅读设置中开启。','emptyHelp'))}else if(prefs.translation==='bilingual'){root.appendChild(label('p','正文已逐句显示中文，此处不重复展示。','emptyHelp'))}else{root.appendChild(label('div',course.translations[state.selected],'translation'))}
 const tools=label('div','','translationTools');let s=label('button','▶ 听本句');s.onclick=()=>startSpeech(state.selected,'sentence');let copy=label('button','复制英文');copy.onclick=async()=>{try{await navigator.clipboard.writeText(course.sentences[state.selected]);toast('已复制英文句子')}catch(e){toast('当前环境不支持复制，请选中文字复制')}};tools.append(s,copy);root.appendChild(tools);let notes=annAt(state.selected);if(!notes.length)return;root.appendChild(label('div','','asideDivider'));root.appendChild(label('div','本句知识点','asideOverline'));
 const buttons=label('div','','noteSelector');for(const n of notes){let b=label('button',n.phrase);const active=state.activeNote===n.id||(!state.activeNote&&n===notes[0]);b.classList.toggle('active',active);b.onclick=()=>{state.activeNote=n.id;paintExplanation()};buttons.appendChild(b)}root.appendChild(buttons);const current=notes.find(n=>n.id===state.activeNote)||notes[0];root.append(label('div',current.phrase,'noteTitle'));root.append(label('div',current.meaning,'noteMeaning'));if(current.explain)root.append(label('p',current.explain,'noteExplanation'));if(current.example)root.append(label('p','例句：'+current.example,'noteExample'));const actions=label('div','','noteActions');let b=label('button',state.notes.includes(current.id)?'★ 已收藏 · 取消':'☆ 收藏到生词本');b.className=state.notes.includes(current.id)?'isSaved':'';b.onclick=()=>{if(state.notes.includes(current.id))state.notes=state.notes.filter(id=>id!==current.id);else state.notes.push(current.id);if(!state.notes.includes(current.id))state.familiar=state.familiar.filter(x=>x!==current.id);persist();paintExplanation();toast(state.notes.includes(current.id)?'已收藏':'已取消收藏')};let wordSpeak=label('button','▶ 听表达');wordSpeak.onclick=()=>speakPhrase(current.phrase);actions.append(b,wordSpeak);root.append(actions)}
function speakPhrase(phrase){if(!hasSpeech()){toast('当前浏览器不支持英语语音');return}stopAudio();const gen=++speech.generation;const u=new SpeechSynthesisUtterance(phrase);u.lang='en-US';u.rate=Number(prefs.rate)||1;let v=state.voiceList.find(v=>v.voiceURI===prefs.voice)||state.voiceList[0];if(v){u.voice=v;u.lang=v.lang}speech.kind='sentence';speech.status='playing';u.onend=()=>{if(gen===speech.generation)stopAudio()};u.onerror=()=>{if(gen===speech.generation)stopAudio()};speechSynthesis.speak(u);playbackUI()}
function paintExplanation(){if(state.view!=='reader')return;fillExplanation($('explainContent'));if(state.drawer)fillExplanation($('drawerContent'))}
function familiarFor(id){const n=ALL_NOTES.find(v=>v.id===id);if(!n)return false;if(n.chapter_id===course.chapter_id)return state.familiar.includes(id);try{const raw=getRaw(PREFIX+'chapter.'+n.chapter_id+'.familiar');return raw!==null&&JSON.parse(raw)?.includes(id)===true}catch(e){return false}}
function allFamiliarIds(){const collected=new Set(state.familiar);for(const c of Object.values(ALL_COURSES)){if(c.chapter_id===course.chapter_id)continue;try{const raw=getRaw(PREFIX+'chapter.'+c.chapter_id+'.familiar');for(const id of(raw===null?[]:JSON.parse(raw)||[]))collected.add(id)}catch(e){}}return [...collected]}
function setNoteFamiliar(id,on){const n=ALL_NOTES.find(x=>x.id===id);if(!n)return;
 if(n.chapter_id===course.chapter_id){state.familiar=on?[...new Set([...state.familiar,id])]:state.familiar.filter(x=>x!==id);persist();return}
 const key=PREFIX+'chapter.'+n.chapter_id+'.familiar';let vals=[];try{vals=JSON.parse(getRaw(key))||[]}catch(e){}vals=on?[...new Set([...vals,id])]:vals.filter(x=>x!==id);setRaw(key,JSON.stringify(vals));
}
function renderNotebook(){
 const root=$('wordList');root.replaceChildren();
 const search=($('wordSearch').value||'').trim().toLocaleLowerCase();
 let list=state.notes.map(id=>ALL_NOTES.find(a=>a.id===id)).filter(Boolean);
 if(search)list=list.filter(n=>[n.phrase,n.meaning,n.explain,n.sentence].some(t=>String(t||'').toLocaleLowerCase().includes(search)));
 if($('wordOnlyNew').checked)list=list.filter(n=>!familiarFor(n.id));
 const sort=$('wordSort').value;
 if(sort==='alpha')list.sort((a,b)=>a.phrase.localeCompare(b.phrase,'en'));
 else if(sort==='chapter')list.sort((a,b)=>a.sentenceIndex-b.sentenceIndex);
 else list.sort((a,b)=>state.notes.indexOf(b.id)-state.notes.indexOf(a.id));
 $('wordCount').textContent='显示 '+list.length+' / '+state.notes.length+' 条';
 if(!list.length){root.appendChild(label('p',state.notes.length?'没有符合筛选的收藏，请修改筛选条件。':'还没有收藏表达。阅读时点选带下划线的短语即可收藏。','lead'));return}
 for(const n of list){const id=n.id;const card=label('article','','wordCard');card.classList.toggle('isFamiliar',familiarFor(id));
 const head=label('div','','wordCardHead');head.append(label('h3',n.phrase));const remove=label('button','取消收藏');remove.onclick=()=>{state.notes=state.notes.filter(x=>x!==id);setNoteFamiliar(id,false);persist();renderNotebook()};head.append(remove);card.append(head,label('p',n.meaning),label('p',n.explain||'','muted small'));card.append(label('div',n.book+' · '+n.chapter,'muted tiny'),label('div',n.sentence,'context'));
 const bar=label('div','','wordCardActions');const listen=label('button','▶ 试听表达');listen.onclick=()=>speakPhrase(n.phrase);const back=label('button','↗ 回到原文','primary');back.onclick=()=>{stopAudio();if(n.chapter_id!==course.chapter_id){setRaw(PREFIX+'pending-note-target',JSON.stringify({book:n.book_id,chapter:n.chapter_id,noteId:n.id,sentenceIndex:n.sentenceIndex}));location.assign(bookLink(n.chapter_id,'reader'));return}state.activeNote=n.id;goReader(n.sentenceIndex);if(innerWidth<=800)setTimeout(openDrawer,30)};
 const familiar=label('button',familiarFor(id)?'✓ 已熟悉':'标记已熟悉','familiarToggle');familiar.setAttribute('aria-pressed',String(familiarFor(id)));familiar.onclick=()=>{setNoteFamiliar(id,!familiarFor(id));renderNotebook()};bar.append(listen,back,familiar);card.append(bar);root.append(card)}
}

function renderReview(){ /* Reading-only: completion summary, no questions or writing assignments. */ }
function completeChapter(){if(prefs.mode==='scroll'){const body=$('pageBody');const actuallyAtEnd=body.scrollTop+body.clientHeight>=body.scrollHeight-30;if(!actuallyAtEnd){toast('请先阅读至文章结尾，再标记本章完成。');return}}state.completed=true;persist();route('review');toast('本章已标记为阅读完成')}
function showModal(id){state.restoreFocus=document.activeElement;const el=$(id);el.hidden=false;state.openModal=id;el.querySelector('button')?.focus()}
function closeModal(){if(!state.openModal)return;$(state.openModal).hidden=true;state.openModal=null;state.restoreFocus?.focus?.();state.restoreFocus=null}
function focusSafe(){const el=document.activeElement;return !['INPUT','TEXTAREA','SELECT','BUTTON','A','SUMMARY'].includes(el?.tagName)&&!el?.isContentEditable&&!el?.closest?.('[role=button],[role=dialog],.sceneImageButton')}
function bindClick(id,fn){$(id).addEventListener('click',fn)}
// R2.1 learning-data controls: only owned keys; never modify browser history or website accounts.
function exportPayload(){
 const rawRecords={};
 for(const key of ownedKeys())if((key.startsWith('plotlish.student.r21.')||key.startsWith('plotlish.student.r2.')||key==='plotlish.student.r23.last-book')&&key.length<240){
  const raw=getRaw(key);if(typeof raw==='string'&&raw.length<=110000)rawRecords[key]=raw;
 }
 const chapters={};
 function savedChapter(c,key,fallback){if(c.chapter_id===course.chapter_id){if(key==='sentenceId')return stableID(state.selected);if(key==='offset')return state.anchorOffset;if(key==='completed')return !!state.completed;if(key==='reflection')return read('reflection','');if(key==='started')return read('started',false)===true}
  try{const v=getRaw(PREFIX+'chapter.'+c.chapter_id+'.'+key);return v===null?fallback:JSON.parse(v)}catch(e){return fallback}}
 for(const c of Object.values(ALL_COURSES))chapters[c.chapter_id]={sentenceId:savedChapter(c,'sentenceId',c.ids[0]),offset:savedChapter(c,'offset',0),completed:savedChapter(c,'completed',false),reflection:savedChapter(c,'reflection',''),started:savedChapter(c,'started',false)};
 return {format:'plotlish-student-learning-data',schema:4,bookId:'all',exportedAt:new Date().toISOString(),data:{prefs:{...prefs},chapters,noteIds:[...state.notes],familiarIds:allFamiliarIds().filter(id=>state.notes.includes(id)),bookshelf:LIBRARY.get(),rawRecords}};
}
function downloadJSON(){const obj=exportPayload();const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='Plotlish_learning_backup_'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);toast('备份已生成，请确认浏览器下载成功。')}
function validBackup(b){if(!b||b.format!=='plotlish-student-learning-data'||![2,3,4].includes(b.schema)||!b.data||typeof b.data!=='object')return false;if(!b.data.prefs||!b.data.chapters||typeof b.data.chapters!=='object'||!Array.isArray(b.data.noteIds))return false;if(b.data.noteIds.some(x=>typeof x!=='string'||x.length>180)||b.data.noteIds.length>10000)return false;if(b.data.familiarIds!==undefined&&(!Array.isArray(b.data.familiarIds)||b.data.familiarIds.some(x=>typeof x!=='string'||x.length>180)))return false;if(b.schema>=3&&b.bookId!=='all')return false;if(b.schema===4&&(!Array.isArray(b.data.bookshelf)||b.data.bookshelf.length>1000||b.data.bookshelf.some(id=>!LIBRARY.norm([id]).length)))return false;if(b.schema===4&&b.data.rawRecords!==undefined&&(!b.data.rawRecords||Array.isArray(b.data.rawRecords)||typeof b.data.rawRecords!=='object'||Object.keys(b.data.rawRecords).length>4000||Object.entries(b.data.rawRecords).some(([k,v])=>k.length>240||!(k.startsWith('plotlish.student.r21.')||k.startsWith('plotlish.student.r2.')||k==='plotlish.student.r23.last-book')||typeof v!=='string'||v.length>110000)))return false;return true}
function normalizePrefs(data){const out={...defaults};for(const k of Object.keys(defaults)){const v=data?.[k];if(v===undefined)continue;if(['clickSpeak','nextSpeak','pageSpeak','explain','scenes','hoverTranslation'].includes(k)&&typeof v==='boolean')out[k]=v;else if((k==='imageMode'||k==='lastImageMode')&&['compact','full','hidden'].includes(v))out[k]=v;else if(k==='hoverDelay'&&[550,750,1000].includes(Number(v)))out[k]=Number(v);else if(k==='readingPreset'&&['immersive','assisted','study','custom'].includes(v))out[k]=v;else if(k==='mode'&&['pages','scroll'].includes(v))out[k]=v;else if(k==='translation'&&['hidden','current','bilingual'].includes(v))out[k]=v;else if(k==='voice'&&typeof v==='string'&&v.length<200)out[k]=v;else if(k==='rate'&&Number(v)>=0.5&&Number(v)<=1.75)out[k]=Number(v);else if(k==='fontSize'&&Number(v)>=14&&Number(v)<=30)out[k]=Number(v);else if(k==='lineHeight'&&Number(v)>=1.4&&Number(v)<=2.2)out[k]=Number(v)}if(data&&!['compact','full','hidden'].includes(data.imageMode))out.imageMode=data.scenes===false?'hidden':'compact';out.scenes=out.imageMode!=='hidden';if(!['full','compact'].includes(out.lastImageMode))out.lastImageMode=out.imageMode==='full'?'full':'compact';return out}
function applySnapshot(obj,mode="replace"){
 const data=obj.data,c=data.chapters[course.chapter_id]||{},nextPrefs=normalizePrefs(data.prefs);
 const ownIds=new Set(ann.map(n=>n.id));
 const incoming=data.noteIds.filter(id=>ownIds.has(id));
 const otherBookNotes=state.notes.filter(id=>!ownIds.has(id));
 const currentOwnNotes=state.notes.filter(id=>ownIds.has(id));
 const validNotes=mode==='merge'?[...new Set([...state.notes,...incoming])]:[...new Set([...otherBookNotes,...incoming])];
 const nextFamiliar=mode==='merge'?[...new Set([...state.familiar,...(data.familiarIds||[]).filter(id=>ownIds.has(id)&&validNotes.includes(id))])]:[...new Set((data.familiarIds||[]).filter(id=>ownIds.has(id)&&validNotes.includes(id)))];
 const nextPos=course.ids.includes(c.sentenceId)?c.sentenceId:course.ids[0];
 const inferredStarted=c.started===true||c.completed===true||nextPos!==course.ids[0];
 let changes={notes:validNotes,familiar:nextFamiliar,sentenceId:nextPos,offset:Number.isInteger(c.offset)&&c.offset>=0?c.offset:0,completed:c.completed===true,reflection:typeof c.reflection==='string'?c.reflection.slice(0,100000):'',started:inferredStarted};
 if(mode==='merge'){changes.notes=validNotes;changes.sentenceId=stableID(state.selected);changes.offset=state.anchorOffset;changes.completed=!!state.completed||c.completed===true;changes.reflection=read('reflection','')||changes.reflection;changes.started=read('started',false)===true||inferredStarted;}
 const originals={};for(const k of Object.keys(changes))originals[k]=getRaw(storageKey(k));
 try{for(const [k,v] of Object.entries(changes)){if(!setRaw(storageKey(k),JSON.stringify(v)))throw Error('浏览器禁止保存，已停止恢复')}}catch(e){for(const [k,v] of Object.entries(originals)){if(v===null)delRaw(storageKey(k));else setRaw(storageKey(k),v)}throw e}
 stopAudio();state.notes=changes.notes;state.familiar=changes.familiar;state.selected=posFromID(changes.sentenceId);state.anchorOffset=changes.offset;state.completed=changes.completed;
 syncSettings();renderReview();if(state.view==='reader')requestPageReflow();if(state.view==='notebook')renderNotebook();updateHomePosition();
}
function updateDataSummary(){const n=$('dataSummary');if(!n)return;n.style.whiteSpace='pre-line';n.textContent='当前作品：'+course.book+' · '+course.chapter+'\n阅读位置：第 '+(state.selected+1)+' / '+course.sentences.length+' 句\n收藏：'+state.notes.length+' 条（已熟悉 '+state.familiar.length+'） · 本章完成：'+(state.completed?'是':'否')+'\n数据位置：本浏览器的本地存储（不能跨设备自动同步）。';}
function clearOwned(scope){
 const values={position:['sentenceId','offset','started'],completed:['completed'],prefs:['prefs'],notes:['notes','familiar'],reflection:['reflection'],all:['prefs','sentenceId','offset','started','notes','completed','reflection']};
 const selected=values[scope]||[];
 const matching=scope==='all'?ownedKeys().filter(k=>k.startsWith(LEGACY)||k.startsWith(PREFIX)||k==='plotlish.student.r23.last-book'||k===LIBRARY.KEY):[...selected.map(storageKey),...(scope==='notes'?Object.values(ALL_COURSES).map(c=>PREFIX+'chapter.'+c.chapter_id+'.familiar'):[])];
 const original=new Map(matching.map(k=>[k,getRaw(k)]));
 // Clearing everything must not resurrect old R2 keys through the one-time migration routine.
 const tombstone=PREFIX+'migrated.'+course.chapter_id;
 if(scope==='all'&&!original.has(tombstone))original.set(tombstone,getRaw(tombstone));
 const ok=(success,msg)=>{if(!success)throw Error(msg+'；可能是浏览器禁止本地存储，请先导出备份')};
 try{
  if(scope==='all'){
   for(const k of matching)ok(delRaw(k),'清除记录未成功');
   ok(setRaw(tombstone,'1'),'迁移状态无法保存');
  }else for(const key of new Set(matching))ok(setRaw(key,'null'),'清除记录未成功');
 }catch(error){
  for(const [k,v] of original)try{if(v===null)delRaw(k);else setRaw(k,v)}catch(e){}
  throw error;
 }
 if(selected.includes('prefs')||scope==='all'){Object.assign(prefs,defaults);prefs.scenes=prefs.imageMode!=='hidden';}
 if(selected.includes('sentenceId')||scope==='all'){state.selected=0;state.anchorOffset=0;}
 if(selected.includes('notes')||scope==='all'){state.notes=[];state.familiar=[];}
 if(selected.includes('completed')||scope==='all')state.completed=false;
 /* Legacy reflection data is retained for backup compatibility, with no exercise UI. */
 stopAudio();syncSettings();renderReview();if(state.view==='reader')requestPageReflow();if(state.view==='notebook')renderNotebook();updateHomePosition();
}
function clearSelectedData(){const scope=$('clearScope').value;const descriptions={position:'阅读位置',completed:'章节完成状态',prefs:'全部阅读偏好',notes:'所有收藏词汇',reflection:'旧版笔记记录',all:'全部本地学习数据'};const title=descriptions[scope];if(!confirm('确认清除「'+title+'」？此操作无法撤销。建议先导出学习数据。'))return;try{clearOwned(scope);updateDataSummary();toast(storageError?'已从当前会话清除；浏览器存储受限，请确认永久删除状态。':title+'已清除。')}catch(e){toast('清除失败：'+String(e.message||e))}}
function applyGlobalSnapshot(obj,mode){
 const data=obj.data,nextPrefs=normalizePrefs(data.prefs),incomingIds=data.noteIds.filter(id=>ALL_NOTES.some(n=>n.id===id));
 const nextNotes=mode==='merge'?[...new Set([...state.notes,...incomingIds])]:[...new Set(incomingIds)];
 const incomingFamiliar=(data.familiarIds||[]).filter(id=>nextNotes.includes(id)&&ALL_NOTES.some(n=>n.id===id));
 const nextFamiliar=mode==='merge'?[...new Set([...allFamiliarIds(),...incomingFamiliar])]:[...new Set(incomingFamiliar)];
 const records=new Map([[storageKey('prefs'),mode==='merge'?{...prefs}:nextPrefs],[storageKey('notes'),nextNotes]]);
 if(obj.schema===4)records.set(LIBRARY.KEY,JSON.stringify({schema:1,items:mode==='merge'?[...new Set([...LIBRARY.get(),...data.bookshelf])]:data.bookshelf}));
 const keys=['sentenceId','offset','completed','reflection','started'];
 for(const c of Object.values(ALL_COURSES)){
  const ch=data.chapters[c.chapter_id];const base=PREFIX+'chapter.'+c.chapter_id+'.';
  if(ch){
   const valid={sentenceId:c.ids.includes(ch.sentenceId)?ch.sentenceId:c.ids[0],offset:Number.isInteger(ch.offset)&&ch.offset>=0?ch.offset:0,completed:ch.completed===true,reflection:typeof ch.reflection==='string'?ch.reflection.slice(0,100000):'',started:ch.started===true};
   if(mode==='merge'){
    for(const key of keys){let previous;try{const v=getRaw(base+key);previous=v===null?null:JSON.parse(v)}catch(e){previous=null}
     if(previous!==null){if(key==='completed'||key==='started')valid[key]=previous===true||valid[key];else valid[key]=previous}
    }
   }
   for(const key of keys)records.set(base+key,valid[key]);
  }
  records.set(base+'familiar',nextFamiliar.filter(id=>ALL_NOTES.some(n=>n.id===id&&n.chapter_id===c.chapter_id)));
 }
 // Restore raw saved keys before known chapters; the normalized chapter record wins on collision.
 const rawEntries=obj.schema===4&&data.rawRecords?new Map(Object.entries(data.rawRecords)):new Map();
 if(mode==='merge')for(const k of [...rawEntries.keys()])if(getRaw(k)!==null)rawEntries.delete(k);
 const old=new Map([...new Set([...rawEntries.keys(),...records.keys()])].map(key=>[key,getRaw(key)]));
 try{for(const [key,val] of rawEntries)if(!setRaw(key,val))throw Error('浏览器拒绝保存原始学习数据');for(const [key,val] of records){if(!setRaw(key,key===LIBRARY.KEY?val:JSON.stringify(val)))throw Error('浏览器拒绝保存，恢复已停止')}}catch(e){for(const [key,val] of old){if(val===null)delRaw(key);else setRaw(key,val)}throw e}
 stopAudio();Object.assign(prefs,mode==='merge'?prefs:nextPrefs);prefs.scenes=prefs.imageMode!=='hidden';state.notes=nextNotes;state.familiar=nextFamiliar.filter(id=>ALL_NOTES.some(n=>n.id===id&&n.chapter_id===course.chapter_id));
 const cur=data.chapters[course.chapter_id];if(cur&&mode==='replace'){state.selected=posFromID(cur.sentenceId);state.anchorOffset=Number.isInteger(cur.offset)?cur.offset:0;state.completed=cur.completed===true}
 syncSettings();renderReview();if(state.view==='reader')requestPageReflow();if(state.view==='notebook')renderNotebook();updateHomePosition();
}
async function importBackup(file){if(!file)return;try{
 if(file.size>5*1024*1024)throw Error('备份超过 5MB');const obj=JSON.parse(await file.text());if(!validBackup(obj))throw Error('不兼容或已损坏的学习记录备份');const mode=$('importMode').value;
 if(obj.schema>=3){if(!confirm(mode==='replace'?'用备份替换已有的学习记录和全局设置？':'合并学习记录和个人书架，保留已有阅读位置与设置？'))return;applyGlobalSnapshot(obj,mode)}
 else{if(obj.bookId!==course.book_id||!obj.data.chapters[course.chapter_id])throw Error('旧版备份属于其他作品，请先打开对应作品后再导入');if(!confirm(mode==='replace'?'确认替换当前作品学习记录？':'确认合并当前作品收藏记录？'))return;applySnapshot(obj,mode)}
 updateDataSummary();toast(storageError?'当前环境无法持久保存，请保留备份':'学习记录已恢复。');
 }catch(e){toast('导入失败：'+String(e.message||e))}finally{$('importFile').value=''}
}
// Navigation keeps the last story context and provides a distinct, explicit library destination.
bindClick('brand',()=>route('home'));bindClick('navHome',()=>route('home'));bindClick('navLibrary',()=>route('shelf'));bindClick('navStory',()=>route('stories'));bindClick('navWords',()=>route('notebook'));bindClick('resumeTop',()=>goReader());bindClick('homeContinue',()=>{const b=uniqueBooks().find(b=>b.id===HOMEPAGE.featured_book_id);if(b)openBookByCode(b.first.chapter_id,'reader')});bindClick('homeExplore',()=>route('stories'));bindClick('homeViewDetail',()=>{const b=uniqueBooks().find(b=>b.id===HOMEPAGE.featured_book_id);if(b)openBookByCode(b.first.chapter_id,'book')});bindClick('backLibrary',()=>route('stories'));bindClick('bookRead',()=>goReader());bindClick('backBook',openChapterDrawer);bindClick('wordsBack',backFromNotebook);
// Reader chapter drawer is a non-routing overlay. Do not push browser history.
let chapterOpen=false,chapterFocus=null;
function openChapterDrawer(){if(chapterOpen)return;hide($('readerOptions'),true);$('readerOptionsToggle').setAttribute('aria-expanded','false');closeDrawer();if(state.openModal)closeModal();const nav=$('readerQuickNav');nav.hidden=true;$('readerNavToggle').setAttribute('aria-expanded','false');chapterFocus=document.activeElement;chapterOpen=true;hide($('chapterShade'),false);hide($('chapterDrawer'),false);$('backBook').setAttribute('aria-expanded','true');$('closeChapterDrawer').focus()}
function closeChapterDrawer(){if(!chapterOpen)return;chapterOpen=false;hide($('chapterShade'),true);hide($('chapterDrawer'),true);$('backBook').setAttribute('aria-expanded','false');if(chapterFocus?.isConnected)chapterFocus.focus();chapterFocus=null}
bindClick('closeChapterDrawer',closeChapterDrawer);bindClick('chapterShade',closeChapterDrawer);bindClick('drawerCurrent',closeChapterDrawer);bindClick('drawerBookDetail',()=>{closeChapterDrawer();route('book')});
bindClick('homeResumeDirect',()=>goReader());bindClick('shelfGoExplore',()=>route('stories'));bindClick('bookHeroSave',()=>toggleShelf(course.book_id));for(const b of document.querySelectorAll('[data-shelf-filter]'))b.addEventListener('click',()=>{shelfFilter=b.dataset.shelfFilter;for(const c of document.querySelectorAll('[data-shelf-filter]'))c.classList.toggle('active',c===b);refreshShelfAndEditorial()});bindClick('homeBookDetail',()=>route('book'));bindClick('bookHeroStart',()=>goReader());
bindClick('bookHeroChapters',()=>{$('bookChapterSection').scrollIntoView({behavior:'smooth',block:'start'})});
bindClick('currentScene',()=>{hide($('readerOptions'),true);showCurrentScene()});
bindClick('companionImageButton',()=>{const scene=companionSceneAt(state.selected);if(scene)openSceneModal(scene)});
bindClick('companionHideScene',()=>setImageFromBool(false));
const imgNav=document.createElement('button');imgNav.textContent='▧　查看当前场景';imgNav.type='button';imgNav.id='quickCurrentScene';$('readerQuickNav').append(imgNav);imgNav.onclick=()=>{hide($('readerQuickNav'),true);$('readerNavToggle').setAttribute('aria-expanded','false');showCurrentScene()};
function showCurrentScene(){if(!course.scenes?.length)return;const found=[...course.scenes].reverse().find(sc=>sc.start_index<=state.selected&&sceneData[sc.scene_id])||null;if(found)openSceneModal(found)}
bindClick('dismissIntro',()=>{save('guideHidden',true);hide($('readerIntro'),true);requestPageReflow()});
bindClick('finishChapter',completeChapter);bindClick('prevPage',()=>changePage(-1));bindClick('nextPage',()=>changePage(1));bindClick('prevSentence',()=>changeSentence(-1));bindClick('nextSentence',()=>changeSentence(1));bindClick('playContinuous',playContinuous);bindClick('stopSpeech',stopAudio);bindClick('speakSelected',()=>startSpeech(state.selected,'sentence'));bindClick('copySentence',async()=>{try{await navigator.clipboard.writeText(course.sentences[state.selected]);toast('已复制')}catch(e){toast('无法复制')}});
bindClick('toggleExplain',()=>{prefs.explain=!prefs.explain;persist();syncSettings();paint();requestPageReflow()});bindClick('collapseExplain',()=>{prefs.explain=false;persist();syncSettings();paint();requestPageReflow()});bindClick('openExplainMobile',openDrawer);bindClick('closeDrawer',closeDrawer);bindClick('overlayShade',closeDrawer);bindClick('toggleSettings',()=>showModal('settingsModal'));bindClick('settingsTop',()=>{closeDrawer();showModal('settingsModal')});bindClick('dataTop',()=>{updateDataSummary();showModal('privacyModal')});bindClick('dataFromSettings',()=>{closeModal();updateDataSummary();showModal('privacyModal')});bindClick('toggleHelp',()=>{hide($('readerOptions'),true);showModal('helpModal')});bindClick('quickAuto',()=>{prefs.nextSpeak=!prefs.nextSpeak;syncSettings();persist();toast(prefs.nextSpeak?'切句自动朗读已开启':'切句自动朗读已关闭')});
bindClick('quickClick',()=>{prefs.clickSpeak=!prefs.clickSpeak;syncSettings();persist();toast(prefs.clickSpeak?'点句自动朗读已开启':'点句自动朗读已关闭')});
bindClick('quickClickMobile',()=>{prefs.clickSpeak=!prefs.clickSpeak;syncSettings();persist();$('readerQuickNav').hidden=true;$('readerNavToggle').setAttribute('aria-expanded','false');toast(prefs.clickSpeak?'点句自动朗读已开启':'点句自动朗读已关闭')});
bindClick('exportData',downloadJSON);bindClick('importData',()=>$('importFile').click());$('importFile').addEventListener('change',e=>importBackup(e.target.files?.[0]));bindClick('clearData',clearSelectedData);$('clearScope').addEventListener('change',()=>updateDataSummary());
bindClick('reviewReturn',()=>goReader());bindClick('reviewWords',()=>route('notebook'));bindClick('reviewHome',()=>route('shelf'));bindClick('reviewBook',()=>route('book'));
for(const b of document.querySelectorAll('.closeModal'))b.addEventListener('click',closeModal);for(const id of ['settingsModal','helpModal','privacyModal','sceneModal'])$(id).addEventListener('click',e=>{if(e.target===$(id))closeModal()});
for(const b of document.querySelectorAll('[data-settings-tab]'))b.addEventListener('click',()=>{for(const x of document.querySelectorAll('[data-settings-tab]'))x.classList.toggle('active',x===b);for(const x of document.querySelectorAll('[data-settings-panel]'))x.classList.toggle('active',x.dataset.settingsPanel===b.dataset.settingsTab)});
function prefChange(id,key,callback){$(id).addEventListener('change',e=>{prefs[key]=e.target.type==='checkbox'?e.target.checked:e.target.value;if(key==='rate'||key==='fontSize'||key==='lineHeight')prefs[key]=Number(prefs[key]);persist();callback?.()})}
$('imageMode').addEventListener('change',e=>{prefs.imageMode=e.target.value;if(prefs.imageMode!=='hidden')prefs.lastImageMode=prefs.imageMode;prefs.scenes=prefs.imageMode!=='hidden';setRaw(SCENE_USER_CHOICE,'1');persist();syncSettings();requestPageReflow()});
for(const button of document.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>{
 const p=button.dataset.preset;prefs.readingPreset=p;
 if(p==='immersive'){prefs.translation='hidden';prefs.explain=false}
 else if(p==='assisted'){prefs.translation='current';prefs.explain=true}
 else if(p==='study'){prefs.translation='bilingual';prefs.explain=true}
 persist();syncSettings();paint();requestPageReflow();
});
$('wordSearch').addEventListener('input',renderNotebook);$('wordSort').addEventListener('change',renderNotebook);$('wordOnlyNew').addEventListener('change',renderNotebook);
function updatePreset(){
 const matched=prefs.translation==='hidden'&&!prefs.explain?'immersive':prefs.translation==='current'&&prefs.explain?'assisted':prefs.translation==='bilingual'&&prefs.explain?'study':'custom';
 prefs.readingPreset=matched;
 for(const b of document.querySelectorAll('[data-preset]')){b.classList.toggle('active',b.dataset.preset===matched);b.setAttribute('aria-pressed',String(b.dataset.preset===matched))}
 const note=$('presetStatus');if(note)note.textContent=matched==='custom'?'当前配置：自定义（由下方详细设置组合而成）':'当前模式：'+({immersive:'沉浸阅读',assisted:'辅助阅读',study:'对照精读'}[matched]);
}
function setImageFromBool(on){
 if(!on&&prefs.imageMode!=='hidden')prefs.lastImageMode=prefs.imageMode;
 prefs.imageMode=on?(prefs.lastImageMode==='full'?'full':'compact'):'hidden';
 prefs.scenes=on;setRaw(SCENE_USER_CHOICE,'1');persist();syncSettings();requestPageReflow();
}
prefChange('hoverTranslation','hoverTranslation');prefChange('hoverDelay','hoverDelay');prefChange('autoClick','clickSpeak',syncSettings);prefChange('autoNext','nextSpeak',syncSettings);prefChange('autoPage','pageSpeak');prefChange('voice','voice');prefChange('rate','rate');prefChange('fontSize','fontSize',requestPageReflow);prefChange('lineHeight','lineHeight',requestPageReflow);prefChange('showScenes','scenes',()=>{prefs.imageMode=prefs.scenes?(prefs.lastImageMode==='full'?'full':'compact'):'hidden';if(prefs.scenes)prefs.lastImageMode=prefs.imageMode;setRaw(SCENE_USER_CHOICE,'1');syncSettings();requestPageReflow()});prefChange('translationMode','translation',()=>{prefs.readingPreset='custom';syncSettings();requestPageReflow();paintExplanation()});prefChange('showExplain','explain',()=>{prefs.readingPreset='custom';syncSettings();paint();requestPageReflow()});for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{if(prefs.mode===b.dataset.mode)return;prefs.mode=b.dataset.mode;stopAudio();persist();syncSettings();requestPageReflow()});
function syncSettings(){$('imageMode').value=prefs.imageMode;$('hoverTranslation').checked=prefs.hoverTranslation!==false;$('hoverDelay').value=prefs.hoverDelay;updatePreset();$('autoClick').checked=prefs.clickSpeak;$('autoNext').checked=prefs.nextSpeak;$('autoPage').checked=prefs.pageSpeak;$('fontSize').value=prefs.fontSize;$('lineHeight').value=prefs.lineHeight;$('showScenes').checked=prefs.scenes;$('showExplain').checked=prefs.explain;$('voice').value=prefs.voice;$('rate').value=prefs.rate;$('translationMode').value=prefs.translation;$('quickClick').textContent='点句朗读 · '+(prefs.clickSpeak?'开':'关');$('quickClick').setAttribute('aria-pressed',String(prefs.clickSpeak));$('quickClickMobile').textContent='▶　点句自动朗读：'+(prefs.clickSpeak?'开':'关');$('quickClickMobile').setAttribute('aria-pressed',String(prefs.clickSpeak));$('quickAuto').textContent='切句朗读 · '+(prefs.nextSpeak?'开':'关');$('quickAuto').setAttribute('aria-pressed',String(prefs.nextSpeak));$('quickScenes').textContent='插图 · '+(prefs.scenes?'开':'关');$('quickScenes').setAttribute('aria-pressed',String(prefs.scenes));$('quickScenesMobile').textContent='▧　插图：'+(prefs.scenes?'开':'关');$('toggleExplain').textContent=prefs.explain?'讲解 ✓':'显示讲解';$('toggleExplain').setAttribute('aria-pressed',String(prefs.explain));for(const b of document.querySelectorAll('[data-mode]'))b.classList.toggle('active',b.dataset.mode===prefs.mode);}
let mobileLookupMode=false;
function clickSentenceEvent(e){if(e.detail>1)return;let note=e.target.closest('[data-note-id]');let row=e.target.closest('.readingSentence');if(!row)return;
 if(mobileLookupMode&&matchMedia('(pointer:coarse)').matches&&!note){
   let found=locateWordAt(e.clientX,e.clientY);if(found){stopAudio();showWordHint(found,{force:true})}else dismissWordHint();
   return;
 }
 selectSentence(Number(row.dataset.index),{origin:'click',noteId:note?.dataset.noteId||null,speak:null,pageHint:state.page,offset:Number(row.dataset.start)||0})}
for(const rootId of ['pageText','scrollText']){$(rootId).addEventListener('click',clickSentenceEvent);$(rootId).addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;let note=e.target.closest('[data-note-id]');let row=e.target.closest('.readingSentence');if(!row)return;e.preventDefault();e.stopPropagation();selectSentence(Number(row.dataset.index),{origin:'click',noteId:note?.dataset.noteId||null,speak:null,pageHint:state.page,offset:Number(row.dataset.start)||0})})}
window.addEventListener('keydown',e=>{if(chapterOpen&&e.key==='Tab'){const fs=[...$('chapterDrawer').querySelectorAll('button:not([disabled])')];if(fs.length){let i=fs.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();fs[fs.length-1].focus()}else if(!e.shiftKey&&i===fs.length-1){e.preventDefault();fs[0].focus()}}return}if(e.key==='Tab'&&state.openModal){const els=[...$(state.openModal).querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length>0);if(els.length){let first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}return}if(e.key==='Escape'){if(!$('readerOptions').hidden){e.preventDefault();hide($('readerOptions'),true);$('readerOptionsToggle').focus()}else if(chapterOpen){e.preventDefault();closeChapterDrawer()}else if(state.openModal){e.preventDefault();closeModal()}else if(state.drawer){e.preventDefault();closeDrawer()}else if(speech.kind!=='idle'){e.preventDefault();stopAudio()}return}if(chapterOpen)return;if(e.ctrlKey||e.metaKey||e.altKey||!focusSafe()||state.openModal||state.drawer||state.view!=='reader')return;const k=e.key.toLowerCase();if(!['arrowleft','arrowright','arrowup','arrowdown',' ','r','t','?'].includes(k)||e.repeat&&['arrowleft','arrowright','arrowup','arrowdown',' ','r'].includes(k))return;e.preventDefault();if(k==='arrowleft')changePage(-1);if(k==='arrowright')changePage(1);if(k==='arrowup')changeSentence(-1);if(k==='arrowdown')changeSentence(1);if(k==='r')startSpeech(state.selected,'sentence');if(k===' ')playContinuous();if(k==='t'){prefs.translation=prefs.translation==='hidden'?'current':'hidden';prefs.readingPreset='custom';persist();syncSettings();paintExplanation();requestPageReflow();toast(prefs.translation==='hidden'?'已隐藏中文翻译':'已显示中文翻译')}if(k==='?')showModal('helpModal')});
window.addEventListener('hashchange',browserNav);window.addEventListener('popstate',browserNav);
$('pageBody').addEventListener('scroll',()=>{if(prefs.mode==='scroll'){const el=$('pageBody');state.scrollAtEnd=el.scrollTop+el.clientHeight>=el.scrollHeight-28}},{passive:true});
window.addEventListener('pagehide',()=>{persist();stopAudio()});window.addEventListener('resize',requestPageReflow);
if('ResizeObserver'in window)new ResizeObserver(requestPageReflow).observe($('pageBody'));
$('quickScenes').onclick=$('quickScenesMobile').onclick=()=>setImageFromBool(!prefs.scenes);
if(hasSpeech()){voicesChanged();speechSynthesis.addEventListener?.('voiceschanged',voicesChanged);setTimeout(voicesChanged,500)}else{$('voice').add(new Option('当前浏览器不支持朗读',''))}
$('showScenes').disabled=!Object.keys(sceneData).length; if(!Object.keys(sceneData).length){prefs.scenes=false;$('illustrationNotice').textContent='没有可用的场景插图；课程正文仍可完整阅读。'}else{$('illustrationNotice').textContent='电脑端图片位于右侧学习面板；手机连续阅读时随文显示，分页时以独立图片页完整展示。'}
// Keep the two frequently used sound switches accessible. Low-frequency actions in one menu.
const optionsButton=label('button','更多 ···','icon-button');optionsButton.id='readerOptionsToggle';optionsButton.type='button';optionsButton.setAttribute('aria-expanded','false');optionsButton.setAttribute('aria-label','更多阅读操作');optionsButton.setAttribute('aria-controls','readerOptions');
const optionsPopup=label('div','','readerOptions');optionsPopup.id='readerOptions';optionsPopup.hidden=true;optionsPopup.setAttribute('role','group');optionsPopup.setAttribute('aria-label','更多阅读操作');
const tools=document.querySelector('.readerHeaderTools');tools.insertBefore(optionsButton,$('readerNavToggle'));
for(const id of ['quickScenes','currentScene','toggleHelp'])optionsPopup.append($(id));
document.querySelector('.readerHeader').append(optionsPopup);
function closeReaderOptions(){hide(optionsPopup,true);optionsButton.setAttribute('aria-expanded','false')}
optionsButton.onclick=()=>{const willOpen=optionsPopup.hidden;hide(optionsPopup,!willOpen);optionsButton.setAttribute('aria-expanded',String(willOpen));};
document.addEventListener('pointerdown',e=>{if(!optionsPopup.hidden&&!optionsPopup.contains(e.target)&&!optionsButton.contains(e.target))closeReaderOptions()});
setupStoryFilters();configureCovers();let routeHash=location.hash;if(routeHash)browserNav();else route('home',{push:false});syncSettings();renderReview();playbackUI();
const pendingTarget=(()=>{try{return JSON.parse(getRaw(PREFIX+'pending-note-target'))}catch(e){return null}})();
if(pendingTarget?.book===course.book_id&&pendingTarget?.chapter===course.chapter_id){delRaw(PREFIX+'pending-note-target');setTimeout(()=>{state.activeNote=pendingTarget.noteId;goReader(Math.min(course.ids.length-1,Math.max(0,pendingTarget.sentenceIndex||0)));state.activeNote=pendingTarget.noteId;paintExplanation();if(innerWidth<=800)openDrawer()},120)}

// Every reader page supports explicit completion, without auto-completing on overflow navigation.

// Offline, non-mutating word hover: locate the real text range under the pointer.
// This does not add spans to the text, so existing pagination and note click targets stay unchanged.
const HOVER_DICTIONARY={...JSON.parse($('hoverGlossaryData').textContent),...(course.glossary||{})};
const hint=document.createElement('div');hint.id='hoverWordHint';hint.setAttribute('role','tooltip');hint.hidden=true;document.body.append(hint);
const detailPanel=label('aside','','');detailPanel.id='hoverWordDetail';detailPanel.hidden=true;detailPanel.setAttribute('role','dialog');detailPanel.setAttribute('aria-label','阅读器内词典详情');$('readerView').append(detailPanel);
function closeWordDetail(){detailPanel.hidden=true;detailPanel.replaceChildren()}
window.__plotlishCloseWordDetail=closeWordDetail;
function openWordDetail(data,meaning){
 dismissWordHint();const head=label('div','','hwd-top');const headTitle=label('span','词典详情 · 阅读器内','hwd-label');
 const close=label('button','关闭 ×','');close.type='button';close.onclick=e=>{e.stopPropagation();closeWordDetail()};head.append(headTitle,close);
 const word=label('h3',data.word,'hwd-word');const value=label('div',meaning||'本地词库暂未收录该词','hwd-meaning');
 const exampleTitle=label('div','所在原句','hwd-caption');const sentence=label('div',data.sentence||'该句暂不可用','hwd-sentence');
 const actions=label('div','','hwd-actions');const listen=label('button','▶ 单词发音','');listen.type='button';listen.onclick=e=>{e.stopPropagation();speakPhrase(data.word)};actions.append(listen);
 const foot=label('div','显示的是本地已有释义和原句，未收录的解释不会凭空生成。','hwd-notice');
 detailPanel.replaceChildren(head,word,value,exampleTitle,sentence,actions,foot);detailPanel.hidden=false;close.focus();
}
document.addEventListener('pointerdown',e=>{if(!detailPanel.hidden&&!detailPanel.contains(e.target)&&!hint.contains(e.target))closeWordDetail()},{capture:true});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!detailPanel.hidden){e.preventDefault();e.stopImmediatePropagation();closeWordDetail()}},true);

let hoverTimer=null,hoverDismissTimer=null,hoverCandidate='',hoverWord='',hoverBox=null;
function dismissWordHint(){clearTimeout(hoverTimer);clearTimeout(hoverDismissTimer);hoverCandidate='';hint.hidden=true;hoverWord='';hoverBox=null}
function delayDismissWordHint(){if(hint.classList.contains('mobileWordHint'))return;clearTimeout(hoverTimer);clearTimeout(hoverDismissTimer);hoverDismissTimer=setTimeout(dismissWordHint,380)}
hint.addEventListener('pointerenter',()=>clearTimeout(hoverDismissTimer));
hint.addEventListener('pointerleave',()=>{if(!hint.classList.contains('mobileWordHint'))dismissWordHint()});
hint.addEventListener('click',e=>e.stopPropagation());
function locateWordAt(x,y){
 let r=null;
 if(document.caretRangeFromPoint)r=document.caretRangeFromPoint(x,y);
 else if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(p){r=document.createRange();r.setStart(p.offsetNode,p.offset);r.collapse(true)}}
 if(!r||r.startContainer.nodeType!==Node.TEXT_NODE)return null;
 const node=r.startContainer,holder=node.parentElement;
 if(!holder?.closest('.sentenceText'))return null;
 const t=node.textContent;const off=r.startOffset;
 const pat=/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;let m;
 while((m=pat.exec(t))){if(off<m.index||off>m.index+m[0].length)continue;
  const wordRange=document.createRange();wordRange.setStart(node,m.index);wordRange.setEnd(node,m.index+m[0].length);
  const box=wordRange.getBoundingClientRect();if(x<box.left-3||x>box.right+3||y<box.top-3||y>box.bottom+3)continue;
  return {word:m[0],box,noteId:holder.closest('[data-note-id]')?.dataset.noteId||null,sentence:holder.closest('.readingSentence')?.querySelector('.sentenceText')?.textContent?.trim()||''};
 }return null;
}
function showWordHint(data,{force=false}={}){if(force){clearTimeout(hoverTimer);clearTimeout(hoverDismissTimer);}if(!data||(!force&&prefs.hoverTranslation===false))return;
 const word=data.word.toLowerCase().replaceAll('’',"'");const curriculumNote=ann.find(n=>n.id===data.noteId);let zh=curriculumNote?(curriculumNote.meaning+(curriculumNote.explain?' · '+curriculumNote.explain:'')):HOVER_DICTIONARY[word];
 const IRREGULAR={was:'be',were:'be',is:'be',are:'be',went:'go',gone:'go',had:'have',has:'have',did:'do',done:'do',came:'come',seen:'see',saw:'see',took:'take',taken:'take',said:'say',knew:'know',known:'know',thought:'think',bought:'buy',brought:'bring',found:'find',left:'leave',felt:'feel',made:'make',wrote:'write',written:'write',ran:'run',sat:'sit'};
  if(!zh&&IRREGULAR[word])zh=HOVER_DICTIONARY[IRREGULAR[word]];
  if(!zh&&word.endsWith("'s"))zh=HOVER_DICTIONARY[word.slice(0,-2)];
 if(!zh&&word.endsWith('ies'))zh=HOVER_DICTIONARY[word.slice(0,-3)+'y'];
 if(!zh&&word.endsWith('s'))zh=HOVER_DICTIONARY[word.slice(0,-1)];
 const name=label('div',data.word,'hoverWord');const value=label('div',zh||'本地词库暂未收录该词','hoverMeaning');
 const detail=label('button','查看详情','hoverDetail');detail.type='button';
 detail.setAttribute('aria-label','查看 '+data.word+' 的词典详情');
 detail.onclick=e=>{e.preventDefault();e.stopPropagation();openWordDetail(data,zh)};
 const content=[name,value,detail];if(force){const close=label('button','关闭 ×','hoverClose');close.type='button';close.onclick=e=>{e.preventDefault();e.stopPropagation();dismissWordHint()};content.push(close)}hint.replaceChildren(...content);
 hint.hidden=false;const rect=data.box;const max=Math.max(0,innerWidth-268);hint.style.left=Math.max(8,Math.min(rect.left,max))+'px';
 hint.style.top=Math.max(8,rect.top-76)+'px';
 if(rect.top<78)hint.style.top=Math.min(innerHeight-80,rect.bottom+10)+'px';if(force){hint.classList.add('mobileWordHint');hint.style.left='10px';hint.style.top='auto'}else hint.classList.remove('mobileWordHint');hoverWord=data.word;hoverBox=rect;
}
function onWordMove(e){
 if(e.pointerType==='touch')return;
 if(!detailPanel.hidden||prefs.hoverTranslation===false||state.openModal||chapterOpen||state.drawer||state.view!=='reader'||e.pointerType==='touch'){dismissWordHint();return}
 const target=e.target?.closest?.('.sentenceText');if(!target){delayDismissWordHint();return}
 const data=locateWordAt(e.clientX,e.clientY);if(!data){delayDismissWordHint();return}
 const key=data.word+'@'+Math.round(data.box.left)+'@'+Math.round(data.box.top);
 if(key===hoverCandidate)return;
 dismissWordHint();hoverCandidate=key;hoverTimer=setTimeout(()=>{if(hoverCandidate===key)showWordHint(data)},prefs.hoverDelay||750);
}
for(const id of ['pageText','scrollText']){
 $(id).addEventListener('pointermove',onWordMove,{passive:true});
 $(id).addEventListener('pointerleave',delayDismissWordHint);
 // Detailed word lookup is activated only by the tooltip's explicit button.
 // Double-click is not a separate word-lookup command: it would first trigger
 // ordinary sentence clicks and inadvertently start speech.
}
const mobileLookupButton=label('button','查词模式：关');mobileLookupButton.type='button';mobileLookupButton.id='mobileLookupButton';mobileLookupButton.setAttribute('aria-pressed','false');$('readerQuickNav').append(mobileLookupButton);
mobileLookupButton.onclick=()=>{mobileLookupMode=!mobileLookupMode;mobileLookupButton.setAttribute('aria-pressed',String(mobileLookupMode));mobileLookupButton.textContent='查词模式：'+(mobileLookupMode?'开（点击单词查释义）':'关');dismissWordHint();$('readerQuickNav').hidden=true;$('readerNavToggle').setAttribute('aria-expanded','false');toast(mobileLookupMode?'查词模式已开启：点单词看词义；再次选择可关闭。':'已恢复普通句子点击')};
window.addEventListener('scroll',()=>{if(!hint.classList.contains('mobileWordHint'))dismissWordHint();if(!detailPanel.hidden)closeWordDetail()},true);

})();
