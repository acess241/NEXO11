$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "Iniciando Nexo Web (React/Vite)..." -ForegroundColor Green
Write-Host "Pasta: $root"

$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($npm) {
  & $npm.Source run dev -- --host 127.0.0.1
  exit $LASTEXITCODE
}

$nodeCandidates = @(
  "C:\Program Files\nodejs\node.exe",
  "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
  "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

$node = $nodeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $node) {
  Write-Host ""
  Write-Host "Node.js/NPM nao foi encontrado." -ForegroundColor Red
  Write-Host "Instale o Node.js LTS e rode novamente este arquivo."
  exit 1
}

& $node ".\node_modules\vite\bin\vite.js" --host 127.0.0.1
exit $LASTEXITCODE
