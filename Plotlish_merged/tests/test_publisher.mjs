import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {publish,unpublish,readCatalog,getPublishedStatus} from '../tools/publish-core.mjs';
const template=JSON.parse(await readFile(new URL('../lessons/everyone-has-a-mission-01.json',import.meta.url),'utf8'));
const data=()=>structuredClone(template);
async function tempRoot(){const root=await mkdtemp(join(tmpdir(),'ers-publish-'));await mkdir(join(root,'site','courses'),{recursive:true});return root}
test('first upload, second distinct chapter, and sorted bookshelf',async()=>{
 const root=await tempRoot();const d1=data();
 const one=await publish(d1,{root});assert.equal(one.status,'published');
 const d2=data();d2.lesson.chapter='02';d2.lesson_id='everyone-has-a-mission-02';d2.lesson.lesson_id=d2.lesson_id; // another chapter needs a different stable ID
 const two=await publish(d2,{root});assert.equal(two.status,'published');
 const catalog=await readCatalog(root);assert.equal(catalog.lessons.length,2);
 assert.deepEqual(catalog.lessons.map(x=>x.chapter),['01','02']);
 assert.equal(catalog.lessons[0].book_id,catalog.lessons[1].book_id);
 assert.notEqual(catalog.lessons[0].lesson_id,catalog.lessons[1].lesson_id);
 for(const l of catalog.lessons){const c=JSON.parse(await readFile(join(root,'site',l.url),'utf8'));assert.equal(c.lesson_id,l.lesson_id);assert.equal(c.sentences.length,63)}
});
test('same content is no-op; changed translation needs explicit replace; backups and no loss',async()=>{
 const root=await tempRoot(),d=data();await publish(d,{root});const unchanged=await publish(d,{root});assert.equal(unchanged.status,'unchanged');
 const next=data();next.lesson.sentence_translations[0]='这是改过的第一句翻译。';
 assert.equal((await getPublishedStatus(next,{root})).publish_state,'changed');
 await assert.rejects(()=>publish(next,{root}),/已存在且内容不同/);
 assert.equal((await readCatalog(root)).lessons.length,1);
 const revised=await publish(next,{root,replace:true});assert.equal(revised.status,'updated');
 assert.match((await readFile(join(root,'site','courses','everyone-has-a-mission-01','01.json'),'utf8')),/这是改过的第一句翻译/);
 assert.match((await readFile(join(revised.archive,'chapter.json'),'utf8')),/诺拉最后记得/);
});
test('reject invalid input without changing published content',async()=>{
 const root=await tempRoot();await publish(data(),{root});const before=await readFile(join(root,'site','courses','catalog.json'),'utf8');
 const invalid=data();invalid.lesson.chapter='../private';await assert.rejects(()=>publish(invalid,{root}),/章节号/);
 const missing=data();missing.lesson.sentence_translations[4]='';await assert.rejects(()=>publish(missing,{root}),/空白/);
 const broken=data();broken.lesson.sentence_translations.pop();await assert.rejects(()=>publish(broken,{root}),/英文 63 句/);
 assert.equal(await readFile(join(root,'site','courses','catalog.json'),'utf8'),before);
});
test('unpublish removes public lesson but retains private editable source and backup',async()=>{
 const root=await tempRoot();await publish(data(),{root});const res=await unpublish('everyone-has-a-mission-01',{root});assert.equal(res.status,'unpublished');
 assert.equal((await readCatalog(root)).lessons.length,0);
 await assert.rejects(()=>access(join(root,'site','courses','everyone-has-a-mission-01','01.json')));
 await access(join(root,'lessons','everyone-has-a-mission-01.json'));
 await access(join(res.archive,'chapter.json'));
});
