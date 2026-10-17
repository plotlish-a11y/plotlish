import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {convert,fnv,segment,validatePublic} from '../tools/build-public.mjs';
const src=JSON.parse(await readFile(new URL('../lessons/everyone-has-a-mission-01.json',import.meta.url),'utf8'));
const fresh=()=>structuredClone(src);
test('source chapter converts with 63 correctly paired sentences',()=>{
 const out=convert(fresh());assert.equal(out.sentences.length,63);assert.equal(out.annotations.length,15);
 assert.match(out.sentences[0].chinese,/苦咖啡/);assert.equal(out.sentences[0].english,'The last thing Nora remembered was the taste of bitter coffee.');
 assert.equal(out.annotations.find(n=>n.annotation_id==='n09').phrase,'COMPENSATION');
 assert.equal(out.annotations.find(n=>n.annotation_id==='n15').phrase,'ASK FOR MERCY');
 validatePublic(out);
});
test('reject wrong translation count',()=>{const d=fresh();d.lesson.sentence_translations.pop();assert.throws(()=>convert(d),/英文 63 句，但译文 62 条/)});
test('reject incorrect content fingerprint',()=>{const d=fresh();d.lesson.translation_source_hash='ffff';assert.throws(()=>convert(d),/来源指纹不匹配/)});
test('reject mismatched v2 sentence ids',()=>{const d=fresh();d.format='english-reader-lesson-v2';d.sentence_ids=segment(d.article).map((s,i)=>`${String(i+1).padStart(3,'0')}-${fnv(s.text)}`);d.sentence_ids[1]='wrong';assert.throws(()=>convert(d),/句子 2 的ID/)});
test('reject annotation bound to wrong sentence',()=>{const d=fresh();d.annotations[0].sentenceIndex=2;assert.throws(()=>convert(d),/知识点 n01/)});
test('reject duplicate annotation identifiers',()=>{const d=fresh();d.annotations[1].id=d.annotations[0].id;assert.throws(()=>convert(d),/重复知识点ID/)});
