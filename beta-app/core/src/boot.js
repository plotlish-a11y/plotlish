/* Plotlish Core: generic shell + lightweight catalogue, lazy content load. No novel content. */
'use strict';
(async()=>{
 const request=async path=>{const res=await fetch(path,{cache:'no-cache'});if(!res.ok)throw Error('无法加载 '+path+'（HTTP '+res.status+'）');return await res.json()};
 const install=path=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=path;s.onload=resolve;s.onerror=()=>reject(Error('无法加载 '+path));document.body.appendChild(s)});
 const status=(title,message)=>{const app=document.getElementById('app');app.replaceChildren();const h=document.createElement('header');h.className='topbar';h.textContent='PLOTLISH · 追更英语';const main=document.createElement('main');main.className='pureEmpty';const hd=document.createElement('h1');hd.textContent=title;const p=document.createElement('p');p.textContent=message;const more=document.createElement('p');more.textContent='课程与网站程序分离；新增课程后无需重新制作网页。';more.className='muted';main.append(hd,p,more);app.append(h,main)};
 // Keep the actual student website shell when there are no published courses.
 // Do not load the reading engine without a chapter: its controls need real text.
 const showEmptyLibrary=()=>{
  const $=id=>document.getElementById(id);
  const home=$('homeView'), stories=$('storiesView');
  const open=view=>{
   home.classList.toggle('active',view==='home');
   stories.classList.toggle('active',view==='stories');
   $('navLibrary').classList.toggle('active',view==='home');
   $('navStory').classList.toggle('active',view==='stories');
   (view==='home'?home:stories).scrollTop=0;
  };
  $('navLibrary').onclick=()=>open('home');
  $('navStory').onclick=()=>open('stories');
  $('brand').onclick=()=>open('home');
  // Tools requiring an active lesson are unavailable until one is published.
  ['navWords','resumeTop','dataTop','settingsTop','homeContinue'].forEach(id=>{const el=$(id);if(el)el.hidden=true});
  const homePanel=home.querySelector('.bookTileCopy');
  homePanel.replaceChildren();
  const title=document.createElement('strong');title.textContent='暂无课程';
  const help=document.createElement('p');help.className='muted';help.textContent='正在重新制作课程。第一章发布后，作品会自动出现在书架。';
  homePanel.append(title,help);
  home.querySelector('.sectionBar span').textContent='0 部作品 · 0 章可读';
  const storyPanel=stories.querySelector('.discoverCopy');
  storyPanel.replaceChildren();
  const storyTitle=document.createElement('h2');storyTitle.textContent='暂无课程';
  const storyHelp=document.createElement('p');storyHelp.textContent='课程准备中，发布后可在这里查看章节。';
  storyPanel.append(storyTitle,storyHelp);
  stories.querySelector('.sectionBar span').textContent='0 部作品 · 0 章可读';
  stories.querySelector('.lead').textContent='新的英语故事正在准备中。';
  // Replace generic placeholder covers with neutral decorative text only.
  const cover=home.querySelector('.bookTile .tinyCover');if(cover)cover.textContent='PLOTLISH';
  const sCover=stories.querySelector('.discoverCard .tinyCover');if(sCover)sCover.textContent='PLOTLISH';
  open('home');
 };
 try{
  const catalog=await request('./courses/catalog.json');
  if(catalog.schema_version!=='plotlish-r231-web-v2'||!Array.isArray(catalog.chapters))throw Error('课程目录格式不正确');
  if(catalog.chapters.length===0){showEmptyLibrary();return}
  const ids=new Set();for(const c of catalog.chapters){if(ids.has(c.chapter_id))throw Error('重复章节 '+c.chapter_id);ids.add(c.chapter_id)}
  const query=new URL(location.href).searchParams;
  let previous;try{previous=localStorage.getItem('plotlish.student.r23.last-book')}catch(e){}
  const book=query.get('book');
  const chapter=catalog.chapters.find(c=>c.chapter_id===query.get('chapter'))||
    catalog.chapters.find(c=>c.chapter_id===query.get('book'))||
    catalog.chapters.find(c=>c.book_id===book)||
    catalog.chapters.find(c=>c.chapter_id===previous)||
    catalog.chapters[0];
  const active=await request('./'+chapter.path); // Only chosen chapter body is fetched
  if(active.chapter_id!==chapter.chapter_id||active.book_id!==chapter.book_id)throw Error('目录章节 ID 与正文不一致');
  if(!Array.isArray(active.sentences)||!Array.isArray(active.ids)||!Array.isArray(active.translations)||!active.sentences.length||active.sentences.length!==active.ids.length||active.ids.length!==active.translations.length)throw Error('当前章节数据结构不完整');
  const courses=catalog.chapters.map(meta=>meta.chapter_id===chapter.chapter_id?
    {...active,chapter_number:meta.chapter_number,sentences_count:active.sentences.length}:
    {...meta,chapter:meta.title,sentences:[],annotations:meta.annotations||[],ids:meta.ids||[],scenes:[]});
  const covers={};const scenes={};
  for(const ch of catalog.chapters){if(ch.cover)covers[ch.book_id]='./'+ch.cover;}
  // Scene IDs are local to a chapter, so only map the active chapter's images.
  for(const [id,path] of Object.entries(chapter.scene_images||{}))scenes[id]='./'+path;
  window.__PLOTLISH_INIT__={catalog:catalog.chapters,courses,covers,scenes,bookProfiles:catalog.books||{}};
  await install('./src/reader.js');
  await install('./src/nav.js');
 }catch(e){console.error('Plotlish startup failed:',e);status('课程加载失败',e.message+'。请检查课程包和部署日志。')}
})();
