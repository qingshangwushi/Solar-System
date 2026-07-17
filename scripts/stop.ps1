<#
.SYNOPSIS
  停止 Web3D 太阳系开发服务器（Windows PowerShell）。
.DESCRIPTION
  终止占用 8080 / 5173 端口的进程，并清理可能残留的 node 子进程。
.PARAMETER Port
  要释放的端口列表，默认 8080,5173。
.EXAMPLE
  .\scripts\stop.ps1
  .\scripts\stop.ps1 -Port 9000,3000
#>
[CmdletBinding()]
param(
    [int[]]$Port = @(8080, 5173)
)

$ErrorActionPreference = 'Continue'
Write-Host '==> 停止 Web3D 太阳系开发服务器' -ForegroundColor Cyan

$killed = 0
foreach ($p in $Port) {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Host "    端口 $p：无监听进程" -ForegroundColor DarkGray
        continue
    }
    foreach ($conn in $conns) {
        try {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction Stop
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            Write-Host "    端口 $p：终止进程 $($proc.Id) ($($proc.ProcessName))" -ForegroundColor Yellow
            $killed++
        } catch {
            Write-Host "    端口 $p：进程 $($conn.OwningProcess) 已退出" -ForegroundColor DarkGray
        }
    }
}

# 兜底：清理残留的 node/vite 子进程（保守策略，仅杀名字含 vite 或 solar-server 的）
Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -match '^(vite|solar-server)$'
} | ForEach-Object {
    Write-Host "    终止残留进程 $($_.Id) ($($_.ProcessName))" -ForegroundColor Yellow
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    $killed++
}

if ($killed -eq 0) {
    Write-Host '    未发现运行中的开发服务器' -ForegroundColor Green
} else {
    Write-Host "    共终止 $killed 个进程" -ForegroundColor Green
}
