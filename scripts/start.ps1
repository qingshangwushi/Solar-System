<#
.SYNOPSIS
  启动 Web3D 太阳系开发环境（Windows PowerShell）。
.DESCRIPTION
  1. 检查 Node/pnpm 版本
  2. 安装依赖（若 node_modules 缺失）
  3. 启动 dev 服务器（前台运行，Ctrl+C 退出）
.PARAMETER Port
  静态服务器端口，默认 8080。
.PARAMETER NoInstall
  跳过依赖安装检查。
.EXAMPLE
  .\scripts\start.ps1
  .\scripts\start.ps1 -Port 9000 -NoInstall
#>
[CmdletBinding()]
param(
    [int]$Port = 8080,
    [switch]$NoInstall
)

$ErrorActionPreference = 'Stop'
Set-Location -Path (Resolve-Path (Join-Path $PSScriptRoot '..'))

Write-Host '==> 启动 Web3D 太阳系开发环境' -ForegroundColor Cyan

# 1. 检查 Node
try {
    $nodeVersion = (node --version) 2>$null
    if (-not $nodeVersion) { throw 'node not found' }
    Write-Host "    Node: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Error 'Node.js 未安装或不在 PATH。请安装 Node.js >= 20。'
    exit 1
}

# 2. 检查 pnpm
try {
    $pnpmVersion = (pnpm --version) 2>$null
    if (-not $pnpmVersion) { throw 'pnpm not found' }
    Write-Host "    pnpm: $pnpmVersion" -ForegroundColor Green
} catch {
    Write-Error 'pnpm 未安装。请运行 corepack enable 或 npm install -g pnpm。'
    exit 1
}

# 3. 依赖安装检查
if (-not $NoInstall) {
    if (-not (Test-Path 'node_modules')) {
        Write-Host '==> 安装依赖（pnpm install）' -ForegroundColor Cyan
        pnpm install --no-frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            Write-Error 'pnpm install 失败'
            exit 1
        }
    } else {
        Write-Host '    node_modules 已存在，跳过安装' -ForegroundColor DarkGray
    }
}

# 4. 设置环境变量
$env:PORT = $Port.ToString()
$env:NODE_ENV = 'development'

Write-Host "==> 启动 dev 服务器（端口 $Port）" -ForegroundColor Cyan
Write-Host '    按 Ctrl+C 退出' -ForegroundColor DarkGray
Write-Host ''

pnpm dev
