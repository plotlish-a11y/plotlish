const $=id=>document.getElementById(id);
let candidate=null,status=null;
const text=(node,value,type='')=>{node.textContent=value;node.classList.remove('error','success','warning');if(type)node.classList.add(type)};
function title(s){return String(s??'')}
async function api(path,data){
 const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-ERS-Local-Publisher':'1'},body:JSON.stringify(data)});
 const body=await res.json();if(!body.ok)throw Error(body.error||'请求失败');return body.result;
}
function reset(){candidate=null;status=null;$('level').value='Unrated';$('synopsis').value='';$('lessonFile').value='';$('reviewed').checked=false;$('replace').checked=false;$('publish').disabled=true;text($('summary'),'尚未选择课程文件。');text($('notice'),'')}
function display(s){const lines=[`作品：${s.title}`,`章节：${s.chapter} · ${s.level}`,`课程 ID：${s.lesson_id}`,`句子：${s.sentences} | 知识点：${s.annotations} | 约 ${s.words} 个英文词`, `状态：${{new:'尚未发布',changed:'内容已更新',unchanged:'与已发布版本一致'}[s.publish_state]||s.publish_state}`];
 if(s.warnings?.length)lines.push('\n发布前提醒：\n'+s.warnings.map(w=>'• '+w).join('\n'));
 text($('summary'),lines.join('\n'));$('publish').disabled=false;
}
const meta=()=>({level:$('level').value,synopsis:$('synopsis').value});
async function revalidate(){if(!candidate)return;status=await api('/_api/validate',{lesson:candidate,meta:meta()});display(status)}
for(const id of ['level','synopsis'])$(id).addEventListener('change',async()=>{try{await revalidate()}catch(e){text($('notice'),'课程元数据不合格：'+e.message,'error')}});
$('lessonFile').addEventListener('change',async e=>{
 const f=e.target.files[0];candidate=null;status=null;$('publish').disabled=true;
 if(!f)return;
 if(f.size>2_000_000){text($('summary'),'文件超过 2 MB。','error');return}
 try{candidate=JSON.parse(await f.text());const defaults=await api('/_api/validate',{lesson:candidate});$('level').value=defaults.level;$('synopsis').value=defaults.synopsis||'';await revalidate();text($('notice'),'校验完成，请检查上方课程内容。','success')}
 catch(err){candidate=null;text($('summary'),'文件不符合发布要求：'+err.message,'error');text($('notice'),'')}
});
$('reset').addEventListener('click',reset);
$('publish').addEventListener('click',async()=>{
 if(!candidate||!status)return;
 if(!$('reviewed').checked){text($('notice'),'请先确认人工审核和版权检查。','error');return}
 const existing=status.publish_state==='changed';if(existing&&!$('replace').checked){text($('notice'),'检测到现有章节有变化；请勾选允许覆盖。','error');return}
 if(existing&&!confirm(`确定更新「${title(status.title)}」第 ${title(status.chapter)} 章吗？旧版本会保留在本地备份目录。`))return;
 $('publish').disabled=true;
 try{const result=await api('/_api/publish',{lesson:candidate,replace:$('replace').checked,meta:meta()});text($('notice'),({published:'已发布到本地学生网站。',updated:'课程已更新，旧版本已备份。',unchanged:'内容未改变，无须重新发布。'}[result.status]||result.status)+' 注意：这还不是公网部署。','success');await revalidate();await refresh()}
 catch(err){text($('notice'),'发布失败：'+err.message,'error')}
 finally{$('publish').disabled=false}
});
async function refresh(){const container=$('publishedList');try{
 const {catalog}=await (await fetch('/_api/catalog',{cache:'no-store'})).json();container.replaceChildren();
 if(!catalog.lessons.length){const p=document.createElement('p');p.className='muted';p.textContent='还没有公开章节。';container.append(p);return}
 for(const c of catalog.lessons){
  const div=document.createElement('div');div.className='item';const info=document.createElement('div');const h=document.createElement('h3');h.textContent=c.title+' · 第 '+c.chapter+' 章';const sm=document.createElement('small');sm.textContent=c.lesson_id+' · '+c.sentences_count+' 句';info.append(h,sm);
  const actions=document.createElement('div');actions.className='actions';actions.style.marginTop='0';const a=document.createElement('a');a.className='btn secondary';a.textContent='阅读';a.href='/reader.html?lesson='+encodeURIComponent(c.lesson_id);a.target='_blank';a.rel='noopener';const del=document.createElement('button');del.type='button';del.className='btn danger';del.textContent='下架';del.onclick=async()=>{
   if(!confirm(`确定将「${c.title}」第 ${c.chapter} 章从学生网站下架？原始课程会保留在私有目录。`))return;
   try{await api('/_api/unpublish',{id:c.lesson_id});text($('notice'),'已从本地目录下架。云端网站仍须重新部署才会同步。','success');await refresh()}
   catch(err){text($('notice'),'下架失败：'+err.message,'error')}
  };
  actions.append(a,del);div.append(info,actions);container.append(div);
 }
 }catch(e){text(container,'读取课程目录失败：'+e.message,'error')}}
refresh();
