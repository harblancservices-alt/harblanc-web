$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
# Remove stale git lock files (they block git operations)
Remove-Item -Force (Join-Path $root '.git\index.lock')
Remove-Item -Force (Join-Path $root '.git\ORIG_HEAD.lock')
Remove-Item -Force (Join-Path $root '.git\HEAD.lock')
# Remove helper scripts/logs created during this session
$junk = @(
  '_chk.bat','_chk_result.txt','_fix.bat','_fix_result.txt','_sync.bat','_sync_result.txt',
  '_lightmigrate.ps1','_runmigrate.bat','_migrate_log.txt',
  '_fixbuttons.ps1','_runfix.bat','_fixbuttons_log.txt',
  '_fixtints.ps1','_runtints.bat','_fixtints_log.txt',
  '_restore.ps1','_restore.bat','_restore_log.txt'
)
foreach ($j in $junk) { Remove-Item -Force (Join-Path $root $j) }
# Confirm git is unlocked and list remaining root entries
$out = Join-Path $root '_cleanup_done.txt'
"index.lock exists: $([System.IO.File]::Exists((Join-Path $root '.git\index.lock')))" | Out-File -FilePath $out -Encoding utf8
"--- root contents ---" | Out-File -FilePath $out -Append -Encoding utf8
Get-ChildItem -Path $root -Force | Select-Object -ExpandProperty Name | Out-File -FilePath $out -Append -Encoding utf8
"DONE" | Out-File -FilePath $out -Append -Encoding utf8
