#Requires -Version 5.1
<#
  Deploy dsh-work-buddy into a dsh profile.

      .\deploy.ps1              # profile "web"
      .\deploy.ps1 other        # another profile

  Why this script exists: the plugin is installed with link:, so the profile
  always loads THIS folder. Editing lib/client.js here is enough -- restart
  dsh web and the new bundle is served. A github: install would snapshot the
  repo at install time and silently keep serving the old sprite.
#>
$ErrorActionPreference = 'Stop'

$here        = Split-Path -Parent $MyInvocation.MyCommand.Path
$profileName = if ($args.Count -ge 1) { [string]$args[0] } else { 'web' }
$spec        = 'link:' + ($here -replace '\\', '/')
$manifest    = Join-Path $env:USERPROFILE ".dsh\profiles\$profileName\package.json"
$installed   = Join-Path $env:USERPROFILE ".dsh\profiles\$profileName\node_modules\dsh-work-buddy"

Write-Host "profile : $profileName"
Write-Host "source  : $here"
Write-Host ""

if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
  throw "dsh not on PATH - open a shell where 'dsh --version' works"
}
foreach ($rel in @('package.json', 'cordis.patch.yml', 'lib\index.js', 'lib\client.js')) {
  if (-not (Test-Path (Join-Path $here $rel))) { throw "missing $rel - run this from the plugin folder" }
}

# 1 -- drop whatever is installed now (a github: snapshot, an older link, ...)
Write-Host "[1/4] removing any existing install ..."
& dsh plugin --profile $profileName remove dsh-work-buddy | Out-Host
# a failed remove just means it was not installed; keep going

# 2 -- link this folder
Write-Host ""
Write-Host "[2/4] linking $here ..."
& dsh plugin --profile $profileName add $spec | Out-Host
if ($LASTEXITCODE -ne 0) { throw "dsh plugin add failed (exit $LASTEXITCODE)" }

# 3 -- verify what the profile will actually load
Write-Host ""
Write-Host "[3/4] verifying ..."
$ok = $true
if (-not (Test-Path $installed)) { Write-Host "  MISSING  node_modules\dsh-work-buddy" -ForegroundColor Red; $ok = $false }
else {
  $clientPath = Join-Path $installed 'lib\client.js'
  $client     = if (Test-Path $clientPath) { [IO.File]::ReadAllText($clientPath) } else { '' }
  $pkg        = [IO.File]::ReadAllText((Join-Path $installed 'package.json'))
  $ver        = [regex]::Match($pkg, '"version":\s*"([^"]+)"').Groups[1].Value

  $isRobot    = $client.Contains('BASE32')
  $isHuman    = $client.Contains('BASE16')

  Write-Host ("  version ......... {0}" -f $ver)
  Write-Host ("  robot sprite .... {0}" -f $isRobot)
  Write-Host ("  old human sprite  {0}" -f $isHuman)

  if (-not $isRobot -or $isHuman) {
    Write-Host "  -> still the old sprite; the link did not take" -ForegroundColor Red
    $ok = $false
  }
  $m = Get-Content $manifest -Raw | ConvertFrom-Json
  $isBundle = @($m.dsh.profile.bundles) -contains 'dsh-work-buddy'
  Write-Host ("  bundle layer .... {0}" -f $isBundle)
  if (-not $isBundle) { $ok = $false }
}

if (-not $ok) { Write-Host ""; Write-Host "deploy incomplete" -ForegroundColor Red; exit 2 }

# 4 -- restart
Write-Host ""
Write-Host "[4/4] restart" -ForegroundColor Green
Write-Host "  The client bundle is snapshotted when the process boots, so a page"
Write-Host "  refresh is NOT enough - the dsh web process has to come up again."
Write-Host ""
$answer = Read-Host "  Restart dsh web now via the market endpoint on port 3080? [y/N]"
if ($answer -match '^(y|yes)$') {
  try {
    $r = Invoke-RestMethod -Method Post -TimeoutSec 15 `
      -Uri 'http://127.0.0.1:3080/dsh-market/restart' `
      -Headers @{ Origin = 'http://127.0.0.1:3080' }
    Write-Host "  restart scheduled: $($r | ConvertTo-Json -Compress)" -ForegroundColor Green
    Write-Host "  this page will reconnect in a few seconds"
  } catch {
    Write-Host "  restart call failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  fall back: Ctrl+C the terminal running 'dsh web', then run it again"
  }
} else {
  Write-Host "  ok - restart it yourself when ready (Ctrl+C, then 'dsh web')"
}