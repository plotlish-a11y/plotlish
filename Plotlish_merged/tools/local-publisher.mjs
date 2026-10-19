/** English Reader Studio local-only publishing console. No cloud credentials required. */
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {ROOT,MAX_JSON_BYTES,readCatalog,publish,unpublish,getPublishedStatus} from './publish-core.mjs';
const port=Number(process.env.ERS_PUBLISH_PORT||8789);
const host='127.0.0.1';
const base=`http://${host}:${port}`;
const site=join(ROOT,'site');
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4'};
function send(res,status,data,type='application/json; charset=utf-8'){
 const body=typeof data==='string'?data:JSON.stringify(data);
 res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'"});
 res.end(body);
}
const error=(res,e)=>send(res,400,{ok:false,error:e.message||'请求失败'});
async function bodyJSON(req){
 const chunks=[];let bytes=0;
 for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_JSON_BYTES){req.destroy();throw Error('课程 JSON 不能超过 2 MB')}chunks.push(chunk)}
 const raw=Buffer.concat(chunks).toString('utf8');return JSON.parse(raw);
}
async function serveFile(res,file){
 const data=await readFile(file);send(res,200,data.toString('utf8'),TYPES[extname(file)]||'application/octet-stream');
}
async function serveBinary(res,file){const data=await readFile(file);res.writeHead(200,{'Content-Type':TYPES[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data)}
const server=http.createServer(async(req,res)=>{
 try{
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host||''))return send(res,403,{ok:false,error:'拒绝非本机 Host 请求'});
  const url=new URL(req.url,base);const pathname=decodeURIComponent(url.pathname);
  if(pathname==='/_studio'&&req.method==='GET')return await serveFile(res,join(ROOT,'tools','publisher.html'));
  if(pathname==='/_studio.js'&&req.method==='GET')return await serveFile(res,join(ROOT,'tools','publisher-ui.js'));
  if(pathname==='/_api/catalog'&&req.method==='GET')return send(res,200,{ok:true,catalog:await readCatalog()});
  if(pathname.startsWith('/_api/')&&req.method==='POST'){
   const origin=req.headers.origin;
   if(origin!==base&&origin!==`http://localhost:${port}`)return send(res,403,{ok:false,error:'跨站提交已被拒绝'});
   if(req.headers['x-ers-local-publisher']!=='1'||!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,403,{ok:false,error:'缺少本地发布确认请求头'});
   const body=await bodyJSON(req);let result;
   if(pathname==='/_api/validate')result=await getPublishedStatus(body.lesson,{meta:body.meta||{}});
   else if(pathname==='/_api/publish')result=await publish(body.lesson,{replace:body.replace===true,meta:body.meta||{}});
   else if(pathname==='/_api/unpublish')result=await unpublish(body.id);
   else return send(res,404,{ok:false,error:'未知接口'});
   return send(res,200,{ok:true,result});
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{ok:false,error:'仅支持 GET / HEAD'});
  if(pathname.startsWith('/_'))return send(res,404,{ok:false,error:'不存在的路径'});
  // Only the public /site directory may be served. No source_lessons, author or backups exposed.
  const rel=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
  const file=resolve(site,rel);
  if(!(file===site||file.startsWith(site+sep)))return send(res,403,{ok:false,error:'禁止路径穿越'});
  const fstat=await stat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(!fstat?.isFile())return send(res,404,{ok:false,error:'文件不存在'});
  return await serveBinary(res,file);
 }catch(e){console.error('[PUBLISHER]',e.message);return error(res,e)}
});
server.listen(port,host,()=>{console.log(`\nEnglish Reader Studio 本地发布器: ${base}/_studio`);console.log(`学生网站本地预览: ${base}/`);console.log('仅监听本机。Ctrl+C 可退出。\n')});
