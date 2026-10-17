# English Reader Studio V2.6 Alpha: Windows 10/11 built-in PowerShell 5.1 + WASAPI.
# Open only 127.0.0.1; no cloud credentials, no telemetry, no paid APIs.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$index = Join-Path $here 'English_Reader_Studio_V2_6_Alpha.html'
$source = Join-Path $here 'WASAPI_Loopback.cs'
$audioRoot = Join-Path $here 'Recorded_Audio'
if (!(Test-Path $index) -or !(Test-Path $source)) { Write-Host '程序文件不完整，请重新解压完整 ZIP。' -ForegroundColor Red; Read-Host '按 Enter 退出'; exit 2 }
New-Item -ItemType Directory -Force -Path $audioRoot | Out-Null
try {
  Add-Type -TypeDefinition ([IO.File]::ReadAllText($source,[Text.Encoding]::UTF8)) -ReferencedAssemblies 'System.dll','System.Core.dll' -ErrorAction Stop
} catch {
  Write-Host 'Windows WASAPI 辅助程序编译失败。' -ForegroundColor Red
  Write-Host $_.Exception.Message
  Read-Host '按 Enter 退出'
  exit 3
}

function Reply([IO.Stream]$stream,[byte[]]$bytes,[string]$type,[int]$code=200) {
  $label = if($code -eq 200){'OK'}elseif($code -eq 400){'Bad Request'}elseif($code -eq 403){'Forbidden'}elseif($code -eq 404){'Not Found'}elseif($code -eq 409){'Conflict'}else{'Internal Server Error'}
  $text = "HTTP/1.1 $code $label`r`nContent-Type: $type`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`nX-Content-Type-Options: nosniff`r`nX-Frame-Options: DENY`r`nReferrer-Policy: no-referrer`r`n`r`n"
  $head=[Text.Encoding]::ASCII.GetBytes($text)
  $stream.Write($head,0,$head.Length)
  $stream.Write($bytes,0,$bytes.Length)
  $stream.Flush()
}
function JsonReply([IO.Stream]$s,[object]$obj,[int]$code=200) {
  $json = ConvertTo-Json -InputObject $obj -Depth 6 -Compress
  Reply $s ([Text.Encoding]::UTF8.GetBytes($json)) 'application/json; charset=utf-8' $code
}
function ParseRequest([IO.Stream]$stream) {
  $arr=[Collections.Generic.List[byte]]::new(); $state=0; $terminator=[byte[]](13,10,13,10)
  while($arr.Count -lt 16384){
    $b=$stream.ReadByte()
    if($b -lt 0){throw '客户端连接已断开。'}
    $arr.Add([byte]$b)
    if($b -eq $terminator[$state]){$state++}elseif($b -eq 13){$state=1}else{$state=0}
    if($state -eq 4){break}
  }
  if($state -ne 4){throw 'HTTP请求过长。'}
  $lines=[Text.Encoding]::ASCII.GetString($arr.ToArray()).Split(@("`r`n"),[StringSplitOptions]::None)
  $parts=$lines[0].Split(' ')
  if($parts.Length -lt 2){throw 'HTTP请求格式错误。'}
  $len=0;$origin='';$host=''
  foreach($line in $lines) {
    if($line -match '^Content-Length:\s*(\d+)'){$len=[int]$matches[1]}
    if($line -match '^Origin:\s*(.+)$'){$origin=$matches[1].Trim()}
    if($line -match '^Host:\s*(.+)$'){$host=$matches[1].Trim()}
  }
  if($len -lt 0 -or $len -gt 8192){throw '请求内容过长。'}
  $body=New-Object byte[] $len
  $pos=0
  while($pos -lt $len){$n=$stream.Read($body,$pos,$len-$pos);if($n -le 0){throw '请求内容不完整。'};$pos+=$n}
  return @{method=$parts[0];path=$parts[1];body=[Text.Encoding]::UTF8.GetString($body);origin=$origin;host=$host}
}
$server=$null;$port=0
foreach($p in 18766..18772){
  try {$server=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$p);$server.Start();$port=$p;break}
  catch{try{$server.Stop()}catch{};$server=$null}
}
if(!$server){Write-Host '本机端口不可用，请关闭已经启动的工作台。';Read-Host '按 Enter 退出';exit 4}
$base = "http://127.0.0.1:$port"
$currentId=$null
Write-Host ''
Write-Host 'English Reader Studio V2.6 Alpha' -ForegroundColor Cyan
Write-Host "地址: $base/"
Write-Host '数字内录只捕获 Windows 默认扬声器/耳机的系统输出。' -ForegroundColor Yellow
Write-Host '不需要 Python，不需要收费 API。请保持此窗口打开。'
Write-Host '关闭此窗口即停止录音服务。'
try { Start-Process 'msedge.exe' "$base/" } catch { try {Start-Process "$base/"} catch {Write-Host '请手动打开上述网址。'} }
try {
  while($true) {
    $client=$server.AcceptTcpClient()
    try {
      $client.ReceiveTimeout=30000;$client.SendTimeout=30000
      $stream=$client.GetStream()
      try {
        $r=ParseRequest $stream
        if($r.host -notin @("127.0.0.1:$port","localhost:$port")){JsonReply $stream @{error='Host not allowed'} 403;continue}
        if($r.method -eq 'POST' -and $r.origin -ne $base) {JsonReply $stream @{error='Cross-origin request denied'} 403;continue}
        if($r.method -eq 'GET' -and $r.path -eq '/'){
          Reply $stream ([IO.File]::ReadAllBytes($index)) 'text/html; charset=utf-8'
        } elseif($r.method -eq 'GET' -and $r.path -eq '/api/health') {
          JsonReply $stream @{ok=$true;service='WASAPI Loopback';version='2.6-alpha';recording=[WASAPILoopback]::IsRecording}
        } elseif($r.method -eq 'POST' -and $r.path -eq '/api/capture/start') {
          if([WASAPILoopback]::IsRecording){JsonReply $stream @{error='已有录音正在进行。'} 409;continue}
          $currentId=[Guid]::NewGuid().ToString('N')
          $file=Join-Path $audioRoot ("capture_$currentId.wav")
          $state=[WASAPILoopback]::Start($file)
          JsonReply $stream @{ok=$state.ok;captureId=$currentId;message=$state.message}
        } elseif($r.method -eq 'POST' -and $r.path -eq '/api/capture/stop') {
          $state=[WASAPILoopback]::Stop()
          if(!$state.ok){
            try{Remove-Item -LiteralPath $state.file -Force -ErrorAction SilentlyContinue}catch{}
            JsonReply $stream @{ok=$false;message=$state.message;durationSec=$state.durationSec;peak=$state.peak;rms=$state.rms;format=$state.format}
          }else{
            JsonReply $stream @{ok=$true;message=$state.message;captureId=$currentId;durationSec=$state.durationSec;peak=$state.peak;rms=$state.rms;format=$state.format;bytes=$state.bytes}
          }
        } elseif($r.method -eq 'GET' -and $r.path -match '^/api/capture/audio\?id=([0-9a-f]{32})$') {
          $id=$matches[1]
          $file=Join-Path $audioRoot ("capture_$id.wav")
          if(!(Test-Path -LiteralPath $file)){JsonReply $stream @{error='没有这个音频文件。'} 404;continue}
          $bytes=[IO.File]::ReadAllBytes($file)
          Reply $stream $bytes 'audio/wav'
        } else {
          JsonReply $stream @{error='Unknown endpoint'} 404
        }
      } catch {
        $err=$_.Exception.GetBaseException().Message
        Write-Host ("请求错误: "+$err) -ForegroundColor DarkYellow
        try{JsonReply $stream @{error=$err} 400}catch{}
      }
    } finally {$client.Close()}
  }
}finally{$server.Stop()}
