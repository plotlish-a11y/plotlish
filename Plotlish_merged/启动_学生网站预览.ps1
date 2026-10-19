# English Reader Studio 学生端本机预览。Win10/11 内置 PowerShell 5.1；无需 Python/Node。
# 使用 TcpListener 避免 HttpListener URLACL 权限问题。仅监听 127.0.0.1。
$ErrorActionPreference = 'Stop'
$siteRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'site'))
if (!(Test-Path (Join-Path $siteRoot 'index.html'))) { throw '未找到 site/index.html' }
$port = 8788
$server = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
try { $server.Start() } catch { throw "端口 $port 已被占用，请关闭旧预览窗口后重试。" }
$address = "http://127.0.0.1:$port/"
Write-Host "学生端本地预览：$address" -ForegroundColor Green
Write-Host '关闭此窗口可停止服务；仅本机可访问。'
try { Start-Process $address } catch { Write-Host '请复制上面的地址到浏览器访问。' }
function SendReply($stream, [int]$code, [byte[]]$body, [string]$mime) {
  $reason = if($code -eq 200){'OK'}elseif($code -eq 403){'Forbidden'}elseif($code -eq 404){'Not Found'}else{'Bad Request'}
  $header = "HTTP/1.1 $code $reason`r`nContent-Type: $mime`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
  $head = [Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($head,0,$head.Length)
  $stream.Write($body,0,$body.Length)
  $stream.Flush()
}
try {
 while ($true) {
  $client = $server.AcceptTcpClient()
  try {
   $client.ReceiveTimeout = 10000
   $stream = $client.GetStream()
   $reader = [IO.StreamReader]::new($stream,[Text.Encoding]::ASCII,$false,1024,$true)
   $requestLine = $reader.ReadLine()
   if (!$requestLine -or $requestLine -notmatch '^GET\s+([^\s]+)\s+HTTP/1\.[01]$') {
     SendReply $stream 400 ([Text.Encoding]::UTF8.GetBytes('Bad Request')) 'text/plain; charset=utf-8'
     continue
   }
   $pathPart = $matches[1].Split('?')[0]
   $hostValue = ''
   while ($true) {
    $line = $reader.ReadLine()
    if ($null -eq $line -or $line -eq '') { break }
    if ($line -match '^Host:\s*(.+)$') { $hostValue=$matches[1].Trim() }
   }
   if ($hostValue -notin @("127.0.0.1:$port","localhost:$port")) {
     SendReply $stream 403 ([Text.Encoding]::UTF8.GetBytes('Forbidden')) 'text/plain; charset=utf-8'
     continue
   }
   $route = [Uri]::UnescapeDataString($pathPart).TrimStart('/')
   if (!$route) { $route = 'index.html' }
   $route = $route.Replace('/',[string][IO.Path]::DirectorySeparatorChar)
   $filePath = [IO.Path]::GetFullPath([IO.Path]::Combine($siteRoot,$route))
   $safePrefix = $siteRoot.TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
   if (!$filePath.StartsWith($safePrefix,[StringComparison]::OrdinalIgnoreCase)) {
     SendReply $stream 403 ([Text.Encoding]::UTF8.GetBytes('Forbidden')) 'text/plain; charset=utf-8'
     continue
   }
   if (!(Test-Path -LiteralPath $filePath -PathType Leaf)) {
     SendReply $stream 404 ([Text.Encoding]::UTF8.GetBytes('Not Found')) 'text/plain; charset=utf-8'
     continue
   }
   $ext=[IO.Path]::GetExtension($filePath).ToLowerInvariant()
   $mime = switch($ext){
    '.html' {'text/html; charset=utf-8'}
    '.js' {'application/javascript; charset=utf-8'}
    '.css' {'text/css; charset=utf-8'}
    '.json' {'application/json; charset=utf-8'}
    '.svg' {'image/svg+xml'}
    '.png' {'image/png'}
    '.mp3' {'audio/mpeg'}
    '.wav' {'audio/wav'}
    default {'application/octet-stream'}
   }
   SendReply $stream 200 ([IO.File]::ReadAllBytes($filePath)) $mime
  } catch {
   Write-Warning "请求异常：$($_.Exception.Message)"
  } finally {try{$client.Close()}catch{}}
 }
} finally { $server.Stop() }
