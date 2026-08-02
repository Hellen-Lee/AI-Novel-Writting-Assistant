# 一键构建前端 + 后端（仓库根目录执行：.\scripts\build.ps1）
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
node (Join-Path $PSScriptRoot "build.mjs") @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
