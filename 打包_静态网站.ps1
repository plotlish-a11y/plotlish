$ErrorActionPreference='Stop'
$dir=Join-Path $PSScriptRoot 'site'
if (!(Test-Path (Join-Path $dir 'index.html'))) { throw '找不到学生网站目录 site/' }
$out=Join-Path $PSScriptRoot '学生网站_上传用.zip'
if (Test-Path $out) { Remove-Item -LiteralPath $out -Force }
Compress-Archive -Path (Join-Path $dir '*') -DestinationPath $out -CompressionLevel Optimal
Write-Host "已打包：$out" -ForegroundColor Green
Write-Host '此 ZIP 仅含 site/ 的公开资源，不含 author/ 和课程草稿。'
