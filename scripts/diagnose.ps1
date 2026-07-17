<#
.SYNOPSIS
  收集 Web3D 太阳系项目诊断信息并生成报告（Windows PowerShell）。
.DESCRIPTION
  生成一份 JSON 诊断包，包含：
  - 系统信息（OS/CPU/内存/Node/pnpm/Rust 版本）
  - 项目元信息（版本、workspace 包列表）
  - 端口占用情况
  - 关键文件清单与大小
  - typecheck 结果
  - 测试结果
  输出到 release/checksums/diagnostics-<timestamp>.json
.PARAMETER Out
  输出文件路径，默认 release/checksums/diagnostics-<timestamp>.json。
.PARAMETER SkipTests
  跳过测试运行（仅收集元信息）。
.EXAMPLE
  .\scripts/diagnose.ps1
  .\scripts/diagnose.ps1 -SkipTests
#>
[CmdletBinding()]
param(
    [string]$Out,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Continue'
Set-Location -Path (Resolve-Path (Join-Path $PSScriptRoot '..'))

Write-Host '==> 收集诊断信息' -ForegroundColor Cyan

$report = [ordered]@{
    schema = 'solar-system-diagnostics/v1'
    generated_at = (Get-Date).ToUniversalTime().ToString('o')
    system = @{}
    project = @{}
    ports = @()
    files = @()
    typecheck = @{}
    tests = @{}
}

# 1. 系统信息
$os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
$cpu = Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
$report.system = @{
    os = if ($os) { $os.Caption } else { $env:OS }
    os_version = if ($os) { $os.Version } else { $null }
    arch = $env:PROCESSOR_ARCHITECTURE
    cpu = if ($cpu) { $cpu.Name } else { $null }
    cpu_cores = if ($cpu) { $cpu.NumberOfCores } else { $null }
    memory_total_mb = if ($os) { [math]::Round($os.TotalVisibleMemorySize / 1024, 1) } else { $null }
    memory_free_mb = if ($os) { [math]::Round($os.FreePhysicalMemory / 1024, 1) } else { $null }
    hostname = $env:COMPUTERNAME
    node_version = (node --version) 2>$null
    pnpm_version = (pnpm --version) 2>$null
    rust_version = (rustc --version) 2>$null
    wasm_pack_version = (wasm-pack --version) 2>$null
}

# 2. 项目信息
$rootPackage = Get-Content 'package.json' -Raw | ConvertFrom-Json
$report.project = @{
    name = $rootPackage.name
    version = $rootPackage.version
    package_manager = $rootPackage.packageManager
    workspace_root = (Get-Location).Path
}

# 3. 端口占用
foreach ($p in @(8080, 5173)) {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($c in $conns) {
            $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            $report.ports += @{
                port = $p
                state = 'listen'
                pid = $c.OwningProcess
                process = if ($proc) { $proc.ProcessName } else { 'unknown' }
            }
        }
    } else {
        $report.ports += @{ port = $p; state = 'free' }
    }
}

# 4. 关键文件
$keyFiles = @(
    'data-src/normalized/catalog.json',
    'data-src/normalized/search-index.json',
    'data-src/normalized/benchmark.json',
    'release/manifests/manifest.json',
    'packages/server/src/server.ts',
    'packages/renderer-core/src/productization.ts',
    'packages/terrain-engine/src/index.ts',
    'tools/build-release.sh'
)
foreach ($f in $keyFiles) {
    if (Test-Path $f) {
        $item = Get-Item $f
        $report.files += @{
            path = $f
            size = $item.Length
            modified = $item.LastWriteTimeUtc.ToString('o')
            exists = $true
        }
    } else {
        $report.files += @{ path = $f; exists = $false }
    }
}

# 5. typecheck
Write-Host '    运行 typecheck...' -ForegroundColor DarkGray
$tcOutput = & pnpm -r typecheck 2>&1
$report.typecheck = @{
    exit_code = $LASTEXITCODE
    passed = ($LASTEXITCODE -eq 0)
    output = ($tcOutput | Out-String).Trim()
}

# 6. 测试
if (-not $SkipTests) {
    Write-Host '    运行测试...' -ForegroundColor DarkGray
    $testOutput = & pnpm -r test 2>&1
    $report.tests = @{
        exit_code = $LASTEXITCODE
        passed = ($LASTEXITCODE -eq 0)
        output = ($testOutput | Out-String).Trim()
    }
} else {
    $report.tests = @{ skipped = $true }
}

# 输出
if (-not $Out) {
    $ts = (Get-Date).ToString('yyyyMMdd-HHmmss')
    $Out = "release/checksums/diagnostics-$ts.json"
}
$outDir = Split-Path -Parent $Out
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$json = $report | ConvertTo-Json -Depth 10
Set-Content -Path $Out -Value $json -Encoding UTF8

Write-Host ''
Write-Host "==> 诊断报告已生成：$Out" -ForegroundColor Green
Write-Host "    typecheck: $(if ($report.typecheck.passed) { 'PASS' } else { 'FAIL' })" -ForegroundColor $(if ($report.typecheck.passed) { 'Green' } else { 'Red' })
if (-not $SkipTests) {
    Write-Host "    tests:     $(if ($report.tests.passed) { 'PASS' } else { 'FAIL' })" -ForegroundColor $(if ($report.tests.passed) { 'Green' } else { 'Red' })
}
Write-Host "    端口监听:   $(($report.ports | Where-Object { $_.state -eq 'listen' }).Count) 个" -ForegroundColor Cyan
Write-Host "    关键文件:   $(($report.files | Where-Object { $_.exists }).Count) / $($report.files.Count) 存在" -ForegroundColor Cyan
