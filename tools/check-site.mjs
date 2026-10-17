/** Validate entire static site before a public deployment. */
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {getPaths,readCatalog} from './publish-core.mjs';
import {validatePublic} from './build-public.mjs';
export async function checkSite(root){
 const paths=getPaths(root),cat=await readCatalog(paths.base);
 for(const f of ['index.html','reader.html','assets/app.js','assets/styles.css']){
  const st=await stat(join(paths.site,f));if(!st.isFile())throw Error(`网站资源不是文件：${f}`);
 }
 const seen=new Set();
 for(const l of cat.lessons){
  if(seen.has(l.url))throw Error('网站目录路径冲突：'+l.url);seen.add(l.url);
  const c=JSON.parse(await readFile(join(paths.site,l.url),'utf8'));
  validatePublic(c);
  if(c.lesson_id!==l.lesson_id||c.chapter!==l.chapter||c.book_id!==l.book_id||c.level!==l.level||c.sentences.length!==l.sentences_count)
    throw Error('章节信息与目录不一致：'+l.lesson_id);
 }
 return {works:new Set(cat.lessons.map(c=>c.series_id+':'+c.book_id)).size,chapters:cat.lessons.length};
}
if(process.argv[1]&&process.argv[1].endsWith('check-site.mjs')){
 checkSite().then(s=>console.log(`网站发布检查通过：${s.works} 部故事，${s.chapters} 章。`)).catch(e=>{console.error('网站发布检查失败：'+e.message);process.exitCode=1});
}
