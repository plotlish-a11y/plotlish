# Requires a manually-created Cloudflare Pages Direct Upload project and Wrangler auth.
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
if (!(Test-Path (Join-Path $PSScriptRoot 'site/index.html'))) { throw '缺少学生网站 site/index.html' }
$cfg=Join-Path $PSScriptRoot '.ers_pages_project.txt'
$name=''
if (Test-Path $cfg) { $name=(Get-Content -LiteralPath $cfg -Raw).Trim() }
if (!$name) {
 Write-Host '请先在 Cloudflare Workers & Pages 创建 Direct Upload 类型项目。' -ForegroundColor Yellow
 $name=(Read-Host '输入你已经创建的 Cloudflare Pages 项目名').Trim()
 if ($name -notmatch '^[a-z0-9][a-z0-9-]{1,57}$') { throw '项目名格式不正确，请使用小写英文字母、数字和短横线。' }
 Set-Content -LiteralPath $cfg -Value $name -Encoding UTF8
}
& node.exe tools/check-site.mjs
if ($LASTEXITCODE -ne 0) { throw '网站内容检查失败，已停止部署。' }
Write-Host "准备发布 site/ 到 Cloudflare Pages 项目：$name" -ForegroundColor Yellow
Write-Host '首次使用可能会要求 Cloudflare 登录授权；部署会更新该网站的公开内容。'
$answer=Read-Host '确定上传当前公开网站？请输入 YES'
if ($answer -cne 'YES') { Write-Host '已取消';exit 0 }
& npx.cmd wrangler pages deploy site --project-name $name
if ($LASTEXITCODE -ne 0) { throw "Wrangler 部署失败（退出码 $LASTEXITCODE），网站可能未更新。" }
Write-Host 'Wrangler 返回成功。请使用实际网站网址验证新课程是否可见。' -ForegroundColor Green
