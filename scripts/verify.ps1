<#
.SYNOPSIS
  验证 Web3D 太阳系项目环境与依赖（Windows PowerShell）。
.DESCRIPTION
  依次检查：
  1. Node.js >= 20
  2. pnpm >= 10
  3. Rust toolchain（cargo + wasm-pack，仅警告）
  4. node_modules 完整性
  5. data-src/normalized/catalog.json 存在
  6. 关键 workspace 包可达
  7. typecheck 通过
.EXAMPLE
  .\scripts\verify.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
Set-Location -Path (Resolve-Path (Join-Path $PSScriptRoot '..'))

$issues = @()
$ok = @()

Write-Host '==> 环境验证' -ForegroundColor Cyan

# 1. Node
$nodeVersion = (node --version) 2>$null
if ($nodeVersion -match 'v(\d+)') {
    $major = [int]$matches[1]
    if ($major -ge 20) {
        $ok += "Node $nodeVersion (>= 20)"
    } else {
        $issues += "Node 版本过低：$nodeVersion，需 >= 20"
    }
} else {
    $issues += 'Node.js 未安装或不在 PATH'
}

# 2. pnpm
$pnpmVersion = (pnpm --version) 2>$null
if ($pnpmVersion -match '^(\d+)') {
    $major = [int]$matches[1]
    if ($major -ge 10) {
        $ok += "pnpm $pnpmVersion (>= 10)"
    } else {
        $issues += "pnpm 版本过低：$pnpmVersion，需 >= 10"
    }
} else {
    $issues += 'pnpm 未安装或不在 PATH'
}

# 3. Rust（仅警告，CI 不强制）
$rustVersion = (rustc --version) 2>$null
if ($rustVersion) {
    $ok += "Rust: $rustVersion"
    $wasmPack = (wasm-pack --version) 2>$null
    if ($wasmPack) {
        $ok += "wasm-pack: $wasmPack"
    } else {
        $issues += 'wasm-pack 未安装（WASM 构建将不可用，运行 cargo install wasm-pack 修复）'
    }
} else {
    $issues += 'Rust toolchain 未安装（仅影响 WASM 构建）'
}

# 4. node_modules
if (Test-Path 'node_modules') {
    $ok += 'node_modules 已安装'
} else {
    $issues += 'node_modules 缺失，请运行 pnpm install'
}

# 5. catalog.json
$catalogPath = 'data-src/normalized/catalog.json'
if (Test-Path $catalogPath) {
    $size = (Get-Item $catalogPath).Length
    $ok += "catalog.json 存在（$size 字节）"
} else {
    $issues += "$catalogPath 不存在，请运行 python tools/catalog-pipeline/build_catalog.py"
}

# 6. 关键 workspace 包
$pkgs = @('packages/server', 'packages/renderer-core', 'packages/terrain-engine', 'apps/web')
foreach ($pkg in $pkgs) {
    if (Test-Path (Join-Path $pkg 'package.json')) {
        $ok += "  - $pkg"
    } else {
        $issues += "缺少 workspace 包：$pkg"
    }
}

# 7. typecheck
Write-Host ''
Write-Host '==> 运行 typecheck（pnpm -r typecheck）' -ForegroundColor Cyan
pnpm -r typecheck 2>&1 | Out-Host
if ($LASTEXITCODE -eq 0) {
    $ok += 'typecheck 通过'
} else {
    $issues += "typecheck 失败（exit $LASTEXITCODE）"
}

# 输出
Write-Host ''
Write-Host '==> 通过项' -ForegroundColor Green
$ok | ForEach-Object { Write-Host "    [OK] $_" -ForegroundColor Green }

if ($issues.Count -gt 0) {
    Write-Host ''
    Write-Host '==> 问题项' -ForegroundColor Red
    $issues | ForEach-Object { Write-Host "    [FAIL] $_" -ForegroundColor Red }
    Write-Host ''
    Write-Host "验证失败：$($issues.Count) 个问题" -ForegroundColor Red
    exit 1
} else {
    Write-Host ''
    Write-Host '所有检查通过' -ForegroundColor Green
    exit 0
}
