<#
  从 GitHub 仓库拉取最新文件并重装。更新 CSS/JS 不需要管理员；
  若检测到 omni.ja 补丁被 Zen 更新覆盖，会提示你再跑一次 install.bat（那步要管理员）。
#>
[CmdletBinding()]
param(
    [string]$Repo = "baihuazidongd/zen-tab-grid",
    [string]$Branch = "main"
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$base = "https://raw.githubusercontent.com/$Repo/$Branch"
$files = @("userChrome.css", "userChrome.js", "loader-snippet.txt", "install.ps1", "uninstall.ps1", "README.md")

Write-Host "从 $base 拉取更新…"
foreach ($f in $files) {
    try {
        Invoke-WebRequest -Uri "$base/$f" -OutFile (Join-Path $here $f) -UseBasicParsing -TimeoutSec 30
        Write-Host "  更新 $f"
    } catch {
        Write-Host "  跳过 $f（$($_.Exception.Message)）" -ForegroundColor Yellow
    }
}

& (Join-Path $here "install.ps1") -NoPatch

$omni = $null
foreach ($c in @((Join-Path ${env:ProgramFiles} "Zen Browser"), (Join-Path $env:LOCALAPPDATA "Programs\Zen Browser"))) {
    if (Test-Path (Join-Path $c "browser\omni.ja")) { $omni = Join-Path $c "browser\omni.ja"; break }
}
$needPatch = $true
if ($omni) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    try {
        $z = [System.IO.Compression.ZipFile]::Open($omni, 'Read')
        $e = $z.GetEntry("chrome/browser/content/browser/browser-main.js")
        $sr = New-Object System.IO.StreamReader($e.Open()); $txt = $sr.ReadToEnd(); $sr.Dispose()
        $z.Dispose()
        $needPatch = -not $txt.Contains('zenuserchrome')
    } catch { Write-Host "读取 omni.ja 失败：$($_.Exception.Message)" -ForegroundColor Yellow }
}
if ($needPatch) {
    Write-Host ""
    Write-Host "注意：二进制补丁缺失（可能是 Zen 刚更新过）。请完全退出 Zen，再右键 install.bat →「以管理员身份运行」。" -ForegroundColor Yellow
} else {
    Write-Host "二进制补丁完好，重启 Zen 即可。"
}
