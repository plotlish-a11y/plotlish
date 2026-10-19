import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publish,readCatalog} from '../tools/publish-core.mjs';
import {convert,fnv,segment} from '../tools/build-public.mjs';
const root=new URL('../',import.meta.url);
const source=JSON.parse(await readFile(new URL('../lessons/everyone-has-a-mission-01.json',import.meta.url),'utf8'));
const second={
 format:'english-reader-lesson-v2', lesson_id:'the-blue-notebook-01',
 article:'The blue notebook was on the table. Anna opened it slowly. She found a strange note.',
 lesson:{title:'The Blue Notebook',chapter:'01',series:'Short Mysteries',subtitle:'一本蓝色笔记本',level:'A2',genre:'MYSTERY',synopsis:'安娜发现了一本写着秘密的笔记本。',sentence_translations:['蓝色笔记本放在桌上。','安娜慢慢翻开了它。','她发现了一张奇怪的便条。'],grammar:{label:'SIMPLE PAST',term:'opened',meaning:'过去式',quote:'Anna opened it slowly.',explain:'简单过去时',example:'Anna walked home.'},cards:[],question:'What did Anna find?',questionHelp:'Answer in one sentence.'},
 annotations:[{id:'a01',kind:'word',sentenceIndex:1,phrase:'slowly',meaning:'慢慢地',explain:'副词',example:'She walked slowly.'}]
};
second.lesson.translation_source_hash=fnv(second.article);
second.sentence_ids=segment(second.article).map((s,i)=>`${String(i+1).padStart(3,'0')}-${fnv(s.text)}`);
test('creator HTML contains no embedded story body, translation, or character-specific notes',async()=>{
 const html=await readFile(new URL('../author/English_Reader_Studio_V2_6_Alpha.html',import.meta.url),'utf8');
 for(const token of ['The last thing Nora remembered','Everyone Has a Mission','The woman arrived just as Lily','诺拉最后记得','const referenceStory=','const defaultZh='])assert.equal(html.includes(token),false,`Unexpected embedded demo: ${token}`);
 assert.ok(html.includes("const BASE_NOTES = [];"));
 assert.ok(html.includes("const CHAPTER = 'Write or import your English story here.';"));
});
test('different stories produce isolated public data without shared hardcoded metadata',async()=>{
 const a=convert(source),b=convert(second);assert.equal(a.level,'B1');assert.equal(b.level,'A2');
 assert.equal(a.genre,'SYSTEM THRILLER');assert.equal(b.genre,'MYSTERY');
 assert.equal(b.sentences.length,3);assert.equal(b.annotations.length,1);
 assert.equal(b.annotations[0].sentence_id,b.sentences[1].sentence_id);
 assert.ok(!JSON.stringify(b).includes('Nora'));
 const dir=await mkdtemp(join(tmpdir(),'plotlish-isolation-'));await mkdir(join(dir,'site','courses'),{recursive:true});
 await publish(source,{root:dir});await publish(second,{root:dir});const cat=await readCatalog(dir);
 assert.equal(cat.lessons.length,2);assert.equal(new Set(cat.lessons.map(c=>c.book_id)).size,2);
 const aa=JSON.parse(await readFile(join(dir,'site',cat.lessons.find(c=>c.lesson_id===source.lesson_id).url),'utf8'));
 const bb=JSON.parse(await readFile(join(dir,'site',cat.lessons.find(c=>c.lesson_id===second.lesson_id).url),'utf8'));
 assert.equal(aa.sentences.length,63);assert.equal(bb.sentences.length,3);
 assert.equal(bb.title,'The Blue Notebook');assert.equal(bb.level,'A2');
 assert.ok(!JSON.stringify(bb).includes('Nora'));
});
test('v2 is fingerprint and explicit sentence ID bound; cannot silently relink translation',()=>{
 const wrong=structuredClone(second);wrong.article='The red notebook was on the table. Anna opened it slowly. She found a strange note.';
 assert.throws(()=>convert(wrong),/指纹/);
 const missing=structuredClone(second);delete missing.lesson.translation_source_hash;
 assert.throws(()=>convert(missing),/指纹/);
 const old=structuredClone(second);old.format='english-reader-lesson-v1';delete old.lesson.translation_source_hash;delete old.sentence_ids;
 const converted=convert(old);assert.equal(converted.sentences.length,3);
});
test('public cover and study sections do not hardcode one story',async()=>{
 const js=await readFile(new URL('../site/assets/app.js',import.meta.url),'utf8');
 for(const name of ['Everyone Has a Mission','Nora','A SYSTEM REBIRTH STORY'])assert.equal(js.includes(name),false);
 assert.ok(js.includes('chapter.genre'));
});
