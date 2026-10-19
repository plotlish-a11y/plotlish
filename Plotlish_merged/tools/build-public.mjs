#!/usr/bin/env node
/** English Reader Studio public-data builder. Node 18+; no third-party packages. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function fnv(input) {
  let h=2166136261;
  for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619)}
  return (h>>>0).toString(16);
}
export function segment(input) {
  const result=[];
  input.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean).forEach((p,pidx)=>{
    const seg=typeof Intl.Segmenter!=='undefined'
      ? Array.from(new Intl.Segmenter('en',{granularity:'sentence'}).segment(p)).map(x=>x.segment.trim()).filter(Boolean)
      : p.match(/[^.!?]+[.!?]+["'”’]?|[^.!?]+$/g)||[p];
    for(const text of seg)result.push({text,para:pidx});
  });
  return result;
}
function check(ok,msg){if(!ok)throw Error('课程校验失败：'+msg)}
function slug(s){return (String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'lesson').slice(0,80)}
function fields(obj,keys){return Object.fromEntries(keys.map(k=>[k,typeof obj?.[k]==='string'?obj[k]:'']))}
export function convert(legacy,metadata={}){
 check(legacy&&['english-reader-lesson-v1','english-reader-lesson-v2'].includes(legacy.format),'不支持的格式（只支持 v1/v2）');
 check(typeof legacy.article==='string'&&legacy.article.trim().length>0,'英文正文为空');
 check(legacy.article.trim()!=='Write or import your English story here.','请先完成真实正文再发布');
 check(legacy.lesson&&typeof legacy.lesson==='object','缺少 lesson');
 const parts=segment(legacy.article);
 const zh=legacy.lesson.sentence_translations;
 check(Array.isArray(zh),'缺少逐句中文翻译');
 check(parts.length===zh.length,`英文 ${parts.length} 句，但译文 ${zh.length} 条。不能按位置静默配对`);
 check(zh.every(s=>typeof s==='string'&&s.trim()),'逐句翻译存在空白或非字符串（请先补全再发布）');
 if(legacy.format==='english-reader-lesson-v2')check(legacy.lesson.translation_source_hash===fnv(legacy.article),'v2 翻译与文章来源指纹不匹配或缺失');
 if(legacy.format==='english-reader-lesson-v2')check(Array.isArray(legacy.sentence_ids),'v2 缺少逐句 IDs');
 if(Array.isArray(legacy.sentence_ids)){
  check(legacy.sentence_ids.length===parts.length,'句子ID数量不匹配');
  legacy.sentence_ids.forEach((id,i)=>check(id===`${String(i+1).padStart(3,'0')}-${fnv(parts[i].text)}`,`句子 ${i+1} 的ID与当前英文不一致`));
 }
 const title=String(legacy.lesson.title||'Untitled').trim();
 const chapter=String(legacy.lesson.chapter||'01').trim();
 check(title.length>0&&chapter.length>0,'课程标题或章节号为空');
 check(/^\d{1,3}$/.test(chapter),'章节号只能包含 1–3 位数字');
 const lesson_id=String(legacy.lesson_id||legacy.lesson.lesson_id||`${slug(title)}-${chapter.replace(/\W/g,'')}`).toLowerCase();
 check(/^[a-z0-9][a-z0-9_-]{2,100}$/.test(lesson_id),'lesson_id 格式不合适');
 if(legacy.format==='english-reader-lesson-v2')check(legacy.sentence_ids.length===parts.length,'v2 句子 ID 数量无效');
 const sentences=parts.map((s,i)=>({
  sentence_id:`${String(i+1).padStart(3,'0')}-${fnv(s.text)}`,
  paragraph:s.para, english:s.text, chinese:zh[i]
 }));
 const notes=[];
 const noteIds=new Set();
 for(const n of legacy.annotations||[]){
  check(n&&typeof n.id==='string'&&n.id,'存在无效知识点ID');
  check(!noteIds.has(n.id),`重复知识点ID：${n.id}`);noteIds.add(n.id);
  check(Number.isInteger(n.sentenceIndex)&&n.sentenceIndex>=0&&n.sentenceIndex<sentences.length,`知识点 ${n.id} 缺少有效的 sentenceIndex`);
  const sentence=sentences[n.sentenceIndex];
  check(typeof n.phrase==='string'&&n.phrase.length>0,`知识点 ${n.id} 词语为空`);
  const at=sentence.english.toLocaleLowerCase('en').indexOf(n.phrase.toLocaleLowerCase('en'));
  check(at>=0,`知识点 ${n.id} 的词语在所指向句子中不存在`);
  // Existing source contains 4 case-only mismatches (MISSION BLOCKS in all caps).
  // Bind to the exact rendered substring, keeping source file unchanged.
  notes.push({annotation_id:n.id,sentence_id:sentence.sentence_id,...fields(n,['phrase','kind','meaning','explain','example']),phrase:sentence.english.slice(at,at+n.phrase.length)});
 }
 const grammar=fields(legacy.lesson.grammar,['label','term','meaning','quote','explain','example']);
 const cards=Array.isArray(legacy.lesson.cards)?legacy.lesson.cards.map(c=>fields(c,['w','zh','quote','ex','tip'])):[];
 const episode_number=/^\d+$/.test(chapter)?Number(chapter):null;
 const level=String(metadata.level||legacy.lesson.level||legacy.level||'Unrated').trim();
 check(['Pre-A1','A1','A2','B1','B2','C1','C2','Unrated'].includes(level),'课程难度标签无效');
 const synopsis=String(metadata.synopsis??legacy.lesson.synopsis??legacy.synopsis??'英文连载故事与阅读练习').trim().slice(0,500);
 const published={
  schema_version:'ers-public-v1',lesson_id,revision:fnv(legacy.article),
  series_id:slug(legacy.lesson.series||'English Through Stories'),book_id:slug(title), series: String(legacy.lesson.series||'English Through Stories'),
  title,subtitle:String(legacy.lesson.subtitle||''),chapter,episode_number,
  level, level_note:level==='Unrated'?'尚未确定 CEFR 阅读难度':'难度参考：'+level+'；尚未经过 CEFR 标准化验证',
  synopsis,genre:String(metadata.genre||legacy.lesson.genre||legacy.genre||'ENGLISH STORY').trim().slice(0,80),
  sentences,annotations:notes,cards,grammar,
  practice:{question:String(legacy.lesson.question||''),help:String(legacy.lesson.questionHelp||'')},
  audio:null // No distributable audio supplied; never publish misleading audio URLs.
 };
 validatePublic(published);
 return published;
}
export function validatePublic(c){
 check(c?.schema_version==='ers-public-v1','公开课程版本错误');
 check(Array.isArray(c.sentences)&&c.sentences.length>0,'公开课程没有句子');
 const ids=new Set();
 for(const s of c.sentences){
  check(s.sentence_id===`${String(ids.size+1).padStart(3,'0')}-${fnv(s.english)}`,'公开句子 ID 无效');
  check(!ids.has(s.sentence_id),'公开句子ID重复');ids.add(s.sentence_id);
  check(typeof s.chinese==='string'&&s.chinese.trim(),'句子翻译无效');
 }
 const noteIds=new Set();
 for(const n of c.annotations||[]){
  check(n&&typeof n.annotation_id==='string'&&!noteIds.has(n.annotation_id),'知识点编号重复或缺失');noteIds.add(n.annotation_id);
  check(ids.has(n.sentence_id),'知识点指向了不存在的句子');
  const s=c.sentences.find(x=>x.sentence_id===n.sentence_id);
  check(typeof n.phrase==='string'&&s.english.toLowerCase().includes(n.phrase.toLowerCase()),'知识点的原文匹配失败');
 }
}
// Phase 1 builder deliberately disabled because it replaced the entire catalog.
export async function build(){throw Error('原单章节构建命令已停用。请运行「启动_课程发布器.bat」来安全地增量发布课程。')}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 build().then(result=>console.log('已生成网站课程：',JSON.stringify(result))).catch(e=>{console.error(e.message);process.exitCode=1});
}
