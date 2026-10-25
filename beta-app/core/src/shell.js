/* Pure-site shell for an empty public catalog. Chapter reading engine not required. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id),LIBRARY=window.PlotlishLibrary;
 let view='home';
 const rows=['home','stories','shelf','notebook'];
 function open(dest,push=true){if(!rows.includes(dest))dest='home';view=dest;
  for(const id of rows)$(id+'View').classList.toggle('active',id===dest);
  $('navHome').classList.toggle('active',dest==='home');$('navLibrary').classList.toggle('active',dest==='shelf');$('navStory').classList.toggle('active',dest==='stories');$('navWords').classList.toggle('active',dest==='notebook');
  document.title=(dest==='home'?'首页':dest==='stories'?'发现故事':dest==='shelf'?'我的书架':'生词本')+' · Plotlish';
  if(push){history.pushState({},'','#'+dest)}
  if(dest==='shelf')renderShelf();if(dest==='notebook')renderWords();
 }
 function renderShelf(){const grid=$('personalShelfGrid');grid.replaceChildren();for(const id of LIBRARY.get()){const art=document.createElement('article');art.className='unavailableBookCard';const strong=document.createElement('strong');strong.textContent='暂不可阅读 · '+id;const p=document.createElement('p');p.textContent='目前没有公开课程，书架记录仍保存在本浏览器中。';const button=document.createElement('button');button.textContent='移出书架';button.onclick=()=>{if(LIBRARY.remove(id))renderShelf();else alert('无法保存，请检查浏览器隐私设置')};art.append(strong,p,button);grid.append(art)}$('personalShelfCount').textContent=LIBRARY.get().length+' 部在书架中';$('personalShelfEmpty').hidden=LIBRARY.get().length>0}
 function renderWords(){let items=[];try{const data=JSON.parse(localStorage.getItem('plotlish.student.r21.wordbook')||'[]');if(Array.isArray(data))items=data}catch(e){}$('wordCount').textContent='保留 '+items.length+' 条收藏';$('wordList').replaceChildren();const p=document.createElement('p');p.className='muted';p.textContent=items.length?'已保留 '+items.length+' 条旧课程收藏。重新导入对应课程后可查看原文与解释。':'还没有收藏的词语。导入课程后可以在精读时收藏。';$('wordList').append(p)}
 function rawSnapshot(){const data={};try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('plotlish.student.r21.')||k.startsWith('plotlish.student.r2.')||k==='plotlish.student.r23.last-book'){const v=localStorage.getItem(k);if(k.length<=240&&typeof v==='string'&&v.length<=110000)data[k]=v}}}catch(e){}return data}
 function exportData(){
  const raw=rawSnapshot(),chapters={},p='plotlish.student.r21.chapter.';
  for(const [key,v] of Object.entries(raw)){if(!key.startsWith(p))continue;const rest=key.slice(p.length),i=rest.lastIndexOf('.');if(i<0)continue;const id=rest.slice(0,i),field=rest.slice(i+1);if(!/^[a-z0-9-]{2,100}$/.test(id)||!['sentenceId','offset','completed','reflection','started'].includes(field))continue;try{chapters[id]??={};chapters[id][field]=JSON.parse(v)}catch(e){}}
  let pref={},notes=[];try{pref=JSON.parse(raw['plotlish.student.r21.preferences']||'{}')||{}}catch(e){}try{notes=JSON.parse(raw['plotlish.student.r21.wordbook']||'[]')||[]}catch(e){}if(!Array.isArray(notes))notes=[];
  const obj={format:'plotlish-student-learning-data',schema:4,bookId:'all',exportedAt:new Date().toISOString(),data:{prefs:pref,chapters,noteIds:notes,familiarIds:[],bookshelf:LIBRARY.get(),rawRecords:raw}};
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='Plotlish_learning_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)
 }
 async function restore(file){if(!file)return;try{
  if(file.size>5*1024*1024)throw Error('文件超过5MB');const obj=JSON.parse(await file.text());
  if(obj?.format!=='plotlish-student-learning-data'||![2,3,4].includes(obj.schema)||!obj.data||!obj.data.chapters||!Array.isArray(obj.data.noteIds)||typeof obj.data.prefs!=='object')throw Error('备份格式无法识别');
  const d=obj.data,records={},prefix='plotlish.student.r21.chapter.';
  if(obj.schema===4){if(!Array.isArray(d.bookshelf)||d.bookshelf.length>1000||d.bookshelf.some(id=>LIBRARY.norm([id]).length!==1))throw Error('书架数据不合法');if(d.rawRecords!==undefined){if(!d.rawRecords||Array.isArray(d.rawRecords)||typeof d.rawRecords!=='object'||Object.keys(d.rawRecords).length>4000)throw Error('原始数据格式不合法');for(const [k,v] of Object.entries(d.rawRecords)){if(k.length>240||!(k.startsWith('plotlish.student.r21.')||k.startsWith('plotlish.student.r2.')||k==='plotlish.student.r23.last-book')||typeof v!=='string'||v.length>110000)throw Error('备份包含非法数据键');records[k]=v}}}
  if(Object.keys(records).length===0){records['plotlish.student.r21.preferences']=JSON.stringify(d.prefs);records['plotlish.student.r21.wordbook']=JSON.stringify(d.noteIds);for(const [id,ch] of Object.entries(d.chapters)){if(!/^[a-z0-9-]{2,100}$/.test(id)||!ch||typeof ch!=='object')continue;for(const field of ['sentenceId','offset','completed','reflection','started'])if(ch[field]!==undefined)records[prefix+id+'.'+field]=JSON.stringify(ch[field])}}
  if(!confirm('确认恢复学习记录？当前数据可以先导出作为备份。'))return;
  const original=rawSnapshot(),oldShelf=LIBRARY.get();const mode=$('importMode').value;
  try{for(const [key,v] of Object.entries(records))if(mode==='replace'||localStorage.getItem(key)===null)localStorage.setItem(key,v);if(obj.schema===4&&!(mode==='merge'?LIBRARY.merge(d.bookshelf):LIBRARY.replace(d.bookshelf)))throw Error('无法保存书架')}
  catch(e){for(const k of Object.keys(records)){if(original[k]===undefined)localStorage.removeItem(k);else localStorage.setItem(k,original[k])}LIBRARY.replace(oldShelf);throw e}
  renderShelf();renderWords();alert('本地学习记录已恢复')
 }catch(e){alert('导入失败：'+e.message)}finally{$('importFile').value=''}}
 function modal(id){$(id).hidden=false;$(id).querySelector('.closeModal')?.focus()}
 for(const [id,dest] of [['brand','home'],['navHome','home'],['navStory','stories'],['navLibrary','shelf'],['navWords','notebook'],['homeExplore','stories'],['shelfGoExplore','stories'],['wordsBack','home']])$(id)?.addEventListener('click',()=>open(dest));
 $('homeWelcome').querySelector('h2').textContent='故事还在准备中';$('homeWelcome').querySelector('p').textContent='目前还没有公开课程。完成课程导入与发布后，站长推荐的小说会显示在这里。';
 $('homeContinue').hidden=true;$('homeViewDetail').hidden=true;$('homeResumePanel').hidden=true;$('homeCoverArt').hidden=true;
 $('homeView').classList.add('noPublishedCourses');$('storiesView').classList.add('noPublishedCourses');$('homeView').querySelector('.shelfFeature').classList.add('noFeatured');$('homeBookGrid').replaceChildren();$('shelfEmpty').hidden=false;$('shelfBooksCount').textContent='0 部编辑精选';
 $('storyBookGrid').replaceChildren();$('storyResultsCount').textContent='0 部作品';$('storyEmpty').hidden=false;$('storyEmpty').querySelector('strong').textContent='暂无已发布课程';$('storyEmpty').querySelector('p').textContent='站长发布课程后，这里会自动显示全部公开小说。';$('resetStoryFilters').hidden=true;$('storiesView').querySelector('.discoverToolbar').hidden=true;
 $('resumeTop').hidden=true;for(const id of ['shelfStatBooks','shelfStatStarted','shelfStatCompleted','shelfStatWords'])$(id).textContent='0';$('shelfStatBooks').textContent=LIBRARY.get().length;
 $('dataTop').onclick=()=>{$('dataSummary').textContent='当前没有公开课程。个人书架：'+LIBRARY.get().length+' 部；旧学习记录仍会保存在当前浏览器。';modal('privacyModal')};
 $('settingsTop').onclick=()=>{let p={};try{p=JSON.parse(localStorage.getItem('plotlish.student.r21.preferences')||'{}')}catch(e){};for(const [id,key] of [['fontSize','fontSize'],['lineHeight','lineHeight'],['rate','rate'],['imageMode','imageMode'],['translationMode','translation']]){if(p[key]!==undefined)$(id).value=String(p[key])}modal('settingsModal')};
 for(const b of document.querySelectorAll('.closeModal'))b.onclick=()=>b.closest('.modalBackdrop').hidden=true;
 for(const b of document.querySelectorAll('[data-settings-tab]'))b.onclick=()=>{for(const t of document.querySelectorAll('[data-settings-tab]'))t.classList.toggle('active',t===b);for(const section of document.querySelectorAll('[data-settings-panel]'))section.classList.toggle('active',section.dataset.settingsPanel===b.dataset.settingsTab)};
 function changePref(k,value){try{const p=JSON.parse(localStorage.getItem('plotlish.student.r21.preferences')||'{}');p[k]=value;localStorage.setItem('plotlish.student.r21.preferences',JSON.stringify(p))}catch(e){alert('无法保存设置：'+e.message)}}
 for(const [id,key] of [['fontSize','fontSize'],['lineHeight','lineHeight'],['rate','rate'],['imageMode','imageMode'],['translationMode','translation'],['voice','voice'],['hoverDelay','hoverDelay']])$(id).addEventListener('change',e=>changePref(key,['fontSize','lineHeight','rate','hoverDelay'].includes(key)?Number(e.target.value):e.target.value));
 for(const [id,key] of [['autoClick','clickSpeak'],['autoNext','nextSpeak'],['autoPage','pageSpeak'],['hoverTranslation','hoverTranslation'],['showExplain','explain']])$(id).addEventListener('change',e=>changePref(key,e.target.checked));
 for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>changePref('mode',b.dataset.mode);
 for(const b of document.querySelectorAll('[data-preset]'))b.onclick=()=>changePref('readingPreset',b.dataset.preset);
 $('dataFromSettings').onclick=()=>{$('settingsModal').hidden=true;$('dataTop').click()};
 $('exportData').onclick=exportData;$('importData').onclick=()=>$('importFile').click();$('importFile').onchange=e=>restore(e.target.files?.[0]);
 $('clearData').onclick=()=>{const scope=$('clearScope').value;if(!confirm('确认清除所选记录？建议先导出备份。'))return;try{const wanted=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key.startsWith('plotlish.student.r21.')&&!key.startsWith('plotlish.student.r2.'))continue;if(scope==='all'||(scope==='notes'&&/wordbook|familiar/.test(key))||(scope==='prefs'&&/preferences/.test(key))||(scope==='completed'&&/completed/.test(key))||(scope==='position'&&/sentenceId|offset|started/.test(key))||(scope==='reflection'&&/reflection/.test(key)))wanted.push(key)}for(const k of wanted)localStorage.removeItem(k);if(scope==='all')LIBRARY.replace([]);$('dataTop').click();renderShelf();renderWords()}catch(e){alert('清除失败：'+e.message)}};
 window.addEventListener('popstate',()=>open(location.hash.slice(1),false));window.addEventListener('hashchange',()=>open(location.hash.slice(1),false));
 open(location.hash.slice(1)||'home',false);
})();
