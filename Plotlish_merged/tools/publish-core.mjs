/** Local publishing library; public site is static. Node 18+; no dependencies. */
import {readFile,writeFile,rename,mkdir,stat,copyFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {convert,validatePublic} from './build-public.mjs';

export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const MAX_JSON_BYTES=2_000_000;
const CATALOG_REL='courses/catalog.json';
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const hash=obj=>createHash('sha256').update(typeof obj==='string'?obj:JSON.stringify(obj)).digest('hex');
const safeId=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9_-]{2,100}$/.test(s);
const now=()=>new Date().toISOString().replace(/[:.]/g,'-');
const defaultCatalog=()=>({schema_version:'ers-catalog-v1',lessons:[]});
const full=(root,rel)=>join(root,rel);
const json=async file=>JSON.parse(await readFile(file,'utf8'));
async function atomicJSON(file,obj){await mkdir(dirname(file),{recursive:true});const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;try{await writeFile(tmp,JSON.stringify(obj,null,2)+'\n','utf8');await rename(tmp,file)}catch(e){await unlink(tmp).catch(()=>{});throw e}}

export function getPaths(root=ROOT){const base=resolve(root);return {base,site:join(base,'site'),catalog:join(base,'site',CATALOG_REL),sources:join(base,'lessons'),history:join(base,'private_publish_history')}}
export async function readCatalog(root=ROOT){const p=getPaths(root);let catalog;try{catalog=await json(p.catalog)}catch(e){if(e.code==='ENOENT')return defaultCatalog();throw e}
 assert(catalog?.schema_version==='ers-catalog-v1'&&Array.isArray(catalog.lessons),'网站目录格式无效');const ids=new Set();
 for(const item of catalog.lessons){assert(safeId(item.lesson_id)&&/^courses\/[a-z0-9_-]+\/[0-9]{1,3}\.json$/.test(item.url),'网站目录含非法路径或课程 ID');assert(!ids.has(item.lesson_id),'网站目录存在重复 lesson_id');ids.add(item.lesson_id)}
 return catalog;
}
export function prepare(input,meta={}){
 assert(input&&typeof input==='object'&&!Array.isArray(input),'请提供课程 JSON 对象');
 const published=convert(input,meta);validatePublic(published);
 assert(safeId(published.lesson_id)&&safeId(published.book_id),'课程或作品标识无效');
 const path=`courses/${published.lesson_id}/${published.chapter}.json`;
 const words=published.sentences.reduce((n,s)=>n+(s.english.match(/[a-z]+(?:['’][a-z]+)*/gi)||[]).length,0);
 return {published,path,summary:{lesson_id:published.lesson_id,book_id:published.book_id,title:published.title,chapter:published.chapter,level:published.level,synopsis:published.synopsis,sentences:published.sentences.length,annotations:published.annotations.length,words,hasAudio:false,sourceFormat:input.format,warnings:[...(input.format==='english-reader-lesson-v1'?['旧版 v1 没有正文翻译指纹，自动校验无法证明译文语义一致，请人工审校。']:[]),'音频尚未提供：学生端仅使用浏览器自带语音。','等级标签仅供参考，未通过 CEFR 校准。']}};
}
function catalogEntry(p,path){return {lesson_id:p.lesson_id,book_id:p.book_id,series_id:p.series_id,chapter:p.chapter,episode_number:p.episode_number,title:p.title,subtitle:p.subtitle,level:p.level,level_note:p.level_note,series:p.series,synopsis:p.synopsis,genre:p.genre,sentences_count:p.sentences.length,url:path}}
async function backup(root,id,files,reason){const dir=join(getPaths(root).history,now()+'_'+reason+'_'+id);await mkdir(dir,{recursive:true});for(const [filename,src] of files){try{await copyFile(src,join(dir,filename))}catch(e){if(e.code!=='ENOENT')throw e}}return dir}

export async function publish(input,{root=ROOT,replace=false,meta={}}={}){
 const {published,path,summary}=prepare(input,meta);const dirs=getPaths(root);const cat=await readCatalog(root);
 // Published source snapshot retains editor-facing metadata so a later re-publish has the same category/level.
 const storedInput=structuredClone(input);storedInput.lesson={...storedInput.lesson,level:published.level,synopsis:published.synopsis,genre:published.genre};
 const index=cat.lessons.findIndex(x=>x.lesson_id===published.lesson_id);
 const target=full(dirs.site,path);const source=full(dirs.sources,`${published.lesson_id}.json`);
 let old=null;try{old=await json(target)}catch(e){if(e.code!=='ENOENT')throw e}
 const unchanged=old&&hash(old)===hash(published);
 if(index>=0&&unchanged)return {status:'unchanged',summary};
 if(index>=0)assert(cat.lessons[index].chapter===published.chapter&&cat.lessons[index].book_id===published.book_id,'lesson_id 已被另一章节或作品使用，请修正后再发布');
 assert(!cat.lessons.some(l=>l.lesson_id!==published.lesson_id&&l.book_id===published.book_id&&l.series_id===published.series_id&&l.episode_number===published.episode_number),'同一作品的这个章节号已被另一个 lesson_id 使用');
 assert(index<0||replace,`课程 ${published.lesson_id} 已存在且内容不同。请预览差异并勾选“允许更新已有章节”。`);
 // Unique public paths protect against accidental clobber by another catalog item.
 assert(!cat.lessons.some((l,i)=>i!==index&&l.url===path),'目标路径已被另一门课程使用');
 if(index<0)cat.lessons.push(catalogEntry(published,path));else cat.lessons[index]=catalogEntry(published,path);
 cat.lessons.sort((a,b)=>String(a.series_id).localeCompare(String(b.series_id))||String(a.book_id).localeCompare(String(b.book_id))||(a.episode_number||0)-(b.episode_number||0));
 // Back up existing published resources outside site. Do not publish author originals.
 const archive=await backup(root,published.lesson_id,[['catalog.json',dirs.catalog],['chapter.json',target],['author-source.json',source]],index>=0?'update':'new');
 await mkdir(dirname(target),{recursive:true});await mkdir(dirname(source),{recursive:true});
 const previousChapter=old;const previousSource=await readFile(source,'utf8').catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 try{
  await atomicJSON(target,published);
  await atomicJSON(source,storedInput);
  await atomicJSON(dirs.catalog,cat);
 }catch(e){
  // Best-effort restore on failed commit; catalog was written last.
  if(previousChapter)await atomicJSON(target,previousChapter).catch(()=>{});else await unlink(target).catch(()=>{});
  if(previousSource!==null)await writeFile(source,previousSource).catch(()=>{});else await unlink(source).catch(()=>{});
  throw e;
 }
 return {status:index>=0?'updated':'published',summary,archive};
}
export async function unpublish(id,{root=ROOT}={}){
 assert(safeId(id),'无效的 lesson_id');const cat=await readCatalog(root);const index=cat.lessons.findIndex(x=>x.lesson_id===id);assert(index>=0,'课程未发布或已下架');
 const dirs=getPaths(root),item=cat.lessons[index],target=join(dirs.site,item.url),source=join(dirs.sources,`${id}.json`);
 const archive=await backup(root,id,[['catalog.json',dirs.catalog],['chapter.json',target],['author-source.json',source]],'unpublish');
 cat.lessons.splice(index,1);await atomicJSON(dirs.catalog,cat);
 await unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e});
 // Keep editable source outside public site so a mistaken unpublish doesn't lose work.
 return {status:'unpublished',lesson_id:id,archive};
}
export async function getPublishedStatus(input,{root=ROOT,meta={}}={}){
 const {published,summary}=prepare(input,meta),catalog=await readCatalog(root);const item=catalog.lessons.find(x=>x.lesson_id===published.lesson_id);
 if(!item)return {...summary,publish_state:'new'};
 const existing=await json(join(getPaths(root).site,item.url));
 return {...summary,publish_state:hash(existing)===hash(published)?'unchanged':'changed',old_sentences:existing.sentences?.length||0,old_annotations:existing.annotations?.length||0};
}
