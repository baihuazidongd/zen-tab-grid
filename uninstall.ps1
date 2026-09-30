<#
  撤销 zen-tab-grid 的 omni.ja 补丁（还原安装前的备份）。
  CSS / JS 与配置开关不动；要彻底回到原状，另外删除配置目录下的 chrome 文件夹。
#>
[CmdletBinding()]
param([string]$InstallDir = "", [switch]$SkipAdminCheck)
$ErrorActionPreference = 'Stop'

function Resolve-ZenInstall {
    $cands = @((Join-Path ${env:ProgramFiles} "Zen Browser"),
               (Join-Path ${env:ProgramFiles(x86)} "Zen Browser"),
               (Join-Path $env:LOCALAPPDATA "Programs\Zen Browser"))
    foreach ($c in $cands) { if (Test-Path (Join-Path $c "zen.exe")) { return $c } }
    $proc = Get-CimInstance Win32_Process -Filter "Name='zen.exe'" | Select-Object -First 1
    if ($proc -and $proc.ExecutablePath) { return Split-Path $proc.ExecutablePath -Parent }
    throw "找不到 Zen 安装目录，请传 -InstallDir"
}

if (-not $InstallDir) { $InstallDir = Resolve-ZenInstall }
$omni = Join-Path $InstallDir "browser\omni.ja"
$backup = "$omni.bak"

if (-not $SkipAdminCheck -and -not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
        ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "需要管理员权限：请右键 uninstall.bat →「以管理员身份运行」" -ForegroundColor Yellow
    exit 2
}
if (-not (Test-Path $backup)) { throw "没有备份 $backup，无法还原" }
try { $fs = [System.IO.File]::Open($omni, 'Open', 'ReadWrite', 'None'); $fs.Close() }
catch { Write-Host "Zen 还在运行，请先完全退出（菜单 → 退出）。" -ForegroundColor Yellow; exit 3 }

Copy-Item $backup $omni -Force
Write-Host "已还原 $omni"
Write-Host "如需一并清掉样式：删除配置目录下的 chrome\userChrome.css 与 chrome\userChrome.js"
