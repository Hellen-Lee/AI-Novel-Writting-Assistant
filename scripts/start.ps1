# 开发一键启动：.\scripts\start.ps1
# 生产一键启动：.\scripts\start.ps1 -Prod
param(
  [switch]$Prod
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
if ($Prod) {
  node (Join-Path $PSScriptRoot "start.mjs") --prod
} else {
  node (Join-Path $PSScriptRoot "start.mjs")
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
