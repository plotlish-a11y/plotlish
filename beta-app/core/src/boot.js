/* Plotlish Core: generic shell + lightweight catalogue, lazy content load. No novel content. */
'use strict';
(async()=>{
 const request=async path=>{const res=await fetch(path,{cache:'no-cache'});if(!res.ok)throw Error('无法加载 '+path+'（HTTP '+res.status+'）');return await res.json()};
 const install=path=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=path;s.onload=resolve;s.onerror=()=>reject(Error('无法加载 '+path));document.body.appendChild(s)});
 const status=(title,message)=>{const app=document.getElementById('app');app.replaceChildren();const h=document.createElement('header');h.className='topbar';h.textContent='PLOTLISH · 追更英语';const main=document.createElement('main');main.className='pureEmpty';const hd=document.createElement('h1');hd.textContent=title;const p=document.createElement('p');p.textContent=message;const more=document.createElement('p');more.textContent='课程与网站程序分离；新增课程后无需重新制作网页。';more.className='muted';main.append(hd,p,more);app.append(h,main)};
 try{
  const catalog=await request('./courses/catalog.json');
  if(catalog.schema_version!=='plotlish-r231-web-v2'||!Array.isArray(catalog.chapters))throw Error('课程目录格式不正确');
  if(catalog.chapters.length===0){status('暂无课程','网站已正常启动。发布第一节课程后，书架将自动显示作品。');return}
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
  for(const ch of catalog.chapters){if(ch.cover)covers[ch.book_id]='./'+ch.cover;
   for(const [id,path] of Object.entries(ch.scene_images||{}))scenes[id]='./'+path}
  window.__PLOTLISH_INIT__={catalog:catalog.chapters,courses,covers,scenes};
  await install('./src/reader.js');
  await install('./src/nav.js');
 }catch(e){console.error('Plotlish startup failed:',e);status('课程加载失败',e.message+'。请检查课程包和部署日志。')}
})();
