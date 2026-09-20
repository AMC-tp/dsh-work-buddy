#Requires -Version 5.1
<#
  Install dsh-work-buddy into a dsh profile.

      .\install.ps1            # installs into the "web" profile
      .\install.ps1 other      # installs into another profile

  dsh plugin forwards to pnpm inside the profile directory, which is what
  writes package.json, pnpm-lock.yaml and the dsh.profile.bundles row.
#>
$ErrorActionPreference = 'Stop'

$here        = Split-Path -Parent $MyInvocation.MyCommand.Path
$profileName = if ($args.Count -ge 1) { [string]$args[0] } else { 'web' }
$spec        = 'link:' + ($here -replace '\\', '/')

Write-Host "profile : $profileName"
Write-Host "plugin  : $here"
Write-Host ""

# 1 -- the loader needs all four of these to exist before we hand it over.
foreach ($rel in @('package.json', 'cordis.patch.yml', 'lib\index.js', 'lib\client.js')) {
  if (-not (Test-Path (Join-Path $here $rel))) {
    throw "missing $rel - this script must run from inside the plugin folder"
  }
}

# 2 -- dsh has to be reachable.
if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
  throw "dsh was not found on PATH; open a shell where 'dsh --version' works, then re-run"
}

# 3 -- hand the folder to dsh. `link:` symlinks, so keep this folder where it is.
& dsh plugin --profile $profileName add $spec
$code = $LASTEXITCODE
if ($code -ne 0) {
  Write-Host ""
  Write-Host "dsh plugin add failed (exit $code)." -ForegroundColor Red
  Write-Host "If pnpm printed a build-script key, add it under allowBuilds in"
  Write-Host "  $env:USERPROFILE\.dsh\profiles\$profileName\pnpm-workspace.yaml"
  Write-Host "and run this script again. This plugin has no dependencies and no"
  Write-Host "build step, so that should not happen."
  exit $code
}

# 4 -- verify the profile really picked it up.
$manifestPath = Join-Path $env:USERPROFILE ".dsh\profiles\$profileName\package.json"
$manifest     = Get-Content $manifestPath -Raw | ConvertFrom-Json
$isDep        = [bool]$manifest.dependencies.'dsh-work-buddy'
$isBundle     = @($manifest.dsh.profile.bundles) -contains 'dsh-work-buddy'
$isLinked     = Test-Path (Join-Path $env:USERPROFILE ".dsh\profiles\$profileName\node_modules\dsh-work-buddy\lib\client.js")

Write-Host ""
Write-Host "dependency declared : $isDep"
Write-Host "bundle layer active : $isBundle"
Write-Host "client bundle found : $isLinked"

if (-not ($isDep -and $isBundle -and $isLinked)) {
  Write-Host ""
  Write-Host "Installed but the profile does not look complete - inspect:" -ForegroundColor Yellow
  Write-Host "  $manifestPath"
  exit 2
}

Write-Host ""
Write-Host "Installed. Now restart the harness so the host half mounts:" -ForegroundColor Green
Write-Host "  stop the running 'dsh web', then start it again"
Write-Host ""
Write-Host "After restart the buddy appears bottom-right; click it for the tally."