# Installs (or updates) the Workspace HUD in the running Harness Desktop profile.
#
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -ProfileName desktop
#
# The script copies the plugin into
#   $DSH_HOME\profiles\<profile>\node_modules\dsh-workspace-hud
# and makes sure "dsh-workspace-hud" is selected in dsh.profile.bundles.
# It also removes the pre-1.1 "@local/workspace-hud" installation.
[CmdletBinding()]
param(
  [string]$ProfileName = 'desktop',
  [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' })
)

$ErrorActionPreference = 'Stop'

$packageName = 'dsh-workspace-hud'
$legacyName = '@local/workspace-hud'
$source = $PSScriptRoot
$profileDir = Join-Path $DshHome (Join-Path 'profiles' $ProfileName)
$manifestPath = Join-Path $profileDir 'package.json'
$dest = Join-Path $profileDir (Join-Path 'node_modules' $packageName)
$legacyDir = Join-Path $profileDir 'node_modules\@local\workspace-hud'

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Harness profile not found: $profileDir. Start Harness once, or install from the Plugins page instead."
}

# 1. Copy the runtime files into the profile's node_modules.
$files = @(
  'package.json',
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'README.md',
  'README.zh.md',
  'LICENSE'
)
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($file in $files) {
  $from = Join-Path $source $file
  if (-not (Test-Path -LiteralPath $from)) { throw "Missing package file: $file" }
  Copy-Item -LiteralPath $from -Destination $dest -Force
}

# 2. Select the bundle, drop the legacy selection, and keep every other field.
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($null -eq $manifest.dsh) { $manifest | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{}) }
if ($null -eq $manifest.dsh.profile) { $manifest.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{}) }
$bundles = @($manifest.dsh.profile.bundles | Where-Object { $_ -and $_ -ne $legacyName })
if ($bundles -notcontains $packageName) { $bundles += $packageName }
$manifest.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue $bundles -Force

$json = $manifest | ConvertTo-Json -Depth 32
# Harness parses this file as JSON: write UTF-8 without a BOM.
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, $json + "`n", $utf8)

# 3. Remove the legacy package folder once the new bundle is selected.
if (Test-Path -LiteralPath $legacyDir) { Remove-Item -LiteralPath $legacyDir -Recurse -Force }
$legacyScope = Join-Path $profileDir (Join-Path 'node_modules' '@local')
if ((Test-Path -LiteralPath $legacyScope) -and -not (Get-ChildItem -LiteralPath $legacyScope -Force)) {
  Remove-Item -LiteralPath $legacyScope -Force
}

Write-Host "Installed $packageName -> $dest"
Write-Host "Profile bundles: $($bundles -join ', ')"
Write-Host 'Harness hot-reloads the profile and the client bundle; no restart should be needed.'
