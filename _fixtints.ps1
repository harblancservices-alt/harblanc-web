$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'src\app\admin'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$colors = 'red|amber|emerald|green|blue|indigo|purple|teal|sky|cyan|violet|rose'
$log = New-Object System.Collections.Generic.List[string]
Get-ChildItem -Path $root -Recurse -Filter *.tsx | ForEach-Object {
  $p = $_.FullName
  $o = [System.IO.File]::ReadAllText($p)
  $t = $o
  $t = [regex]::Replace($t, "bg-($colors)-950(/\d+)?", 'bg-$1-50')
  $t = [regex]::Replace($t, "bg-($colors)-900/\d+", 'bg-$1-100')
  $t = [regex]::Replace($t, "text-($colors)-50(/\d+)?\b", 'text-$1-800')
  $t = [regex]::Replace($t, "text-($colors)-100(/\d+)?\b", 'text-$1-800')
  $t = [regex]::Replace($t, "text-($colors)-200(/\d+)?\b", 'text-$1-700')
  $t = [regex]::Replace($t, "hover:text-($colors)-200(/\d+)?\b", 'hover:text-$1-900')
  $t = $t.Replace('border-l-zinc-500', 'border-l-line-strong')
  $t = $t.Replace('border-l-zinc-600', 'border-l-line-strong')
  $t = $t.Replace('border-l-zinc-700', 'border-l-line-strong')
  if ($t -ne $o) {
    [System.IO.File]::WriteAllText($p, $t, $utf8)
    $log.Add($_.Name)
  }
}
$out = Join-Path $PSScriptRoot '_fixtints_log.txt'
"FIXED $($log.Count) FILES:" | Out-File -FilePath $out -Encoding utf8
$log | Out-File -FilePath $out -Append -Encoding utf8
"DONE" | Out-File -FilePath $out -Append -Encoding utf8
