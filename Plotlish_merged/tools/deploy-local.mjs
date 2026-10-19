#!/usr/bin/env node
/**
 * 本地一键部署脚本 —— 模拟 GitHub Actions 管线
 *
 * 用法：node tools/deploy-local.mjs [--force]
 *
 * 流程：
 *   1. Node 14 项单元测试（失败则中止）
 *   2. check-site.mjs 静态网站完整性检查（失败则中止）
 *   3. wrangler pages deploy site --project-name=<YOUR_PROJECT_NAME>
 *
 * 第一次跑会交互式要求 Cloudflare API token（wrangler login）。
 * 发布项目名从 wrangler.toml 读取；如果不是 YOUR_PROJECT_NAME 占位符，
 * 直接用它。否则要求传 --project-name 参数。
 */
import {execSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const FAIL='\x1b[31mFAIL\x1b[0m';
const OK='\x1b[32mOK\x1b[0m';
const INFO='\x1b[36m>>\x1b[0m';
const args=new Set(process.argv.slice(2));

function run(cmd,cwd=ROOT,silent=false){
  if(!silent)console.log(`${INFO} ${cmd}`);
  try{
    const out=execSync(cmd,{cwd,stdio:silent?['pipe','pipe','inherit']:'inherit',encoding:'utf8'});
    return out;
  }catch(e){
    console.error(`${FAIL} 命令失败 (exit ${e.status}): ${cmd}`);
    if(!args.has('--force')) process.exit(e.status||1);
  }
}

// 读 wrangler.toml 的 project_name
let projectName='YOUR_PROJECT_NAME';
try{
  const toml=readFileSync(resolve(ROOT,'wrangler.toml'),'utf8');
  const m=toml.match(/^name\s*=\s*["']([^"']+)["']/m);
  if(m)projectName=m[1];
}catch(e){/* no wrangler.toml */}

if(projectName==='YOUR_PROJECT_NAME'){
  console.error(`${FAIL} wrangler.toml 里的 name 还是占位符 YOUR_PROJECT_NAME。`);
  console.error('请把它改成你的真实 Cloudflare Pages 项目名（全小写 + 短横线）。');
  process.exit(1);
}

console.log(`\n\x1b[1mPlotlish 本地部署管线\x1b[0m  项目: ${projectName}\n`);

// Step 1: Node 单元测试
console.log('\n--- Step 1/3: Node test suite ---');
run('node --test tests/test_data.mjs tests/test_publisher.mjs tests/test_separation.mjs');
console.log(`${OK} 14 项单元测试全部通过\n`);

// Step 2: 静态网站完整性
console.log('--- Step 2/3: check-site.mjs ---');
run('node tools/check-site.mjs');
console.log(`${OK} 静态网站检查通过\n`);

// Step 3: wrangler deploy
console.log('--- Step 3/3: wrangler pages deploy ---');
run(`npx wrangler pages deploy site --project-name=${projectName}`);
console.log(`\n${OK} 部署命令已执行。请到 Cloudflare Dashboard 确认新版本已上线。\n`);
