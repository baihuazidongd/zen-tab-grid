<#
  Zen 标签页网格 + 滚轮横向翻页 —— 一键安装
  作用：
    1) 把 userChrome.css / userChrome.js 放进你的 Zen 配置目录
    2) 打开 legacyUserProfileCustomizations.stylesheets（否则 CSS 根本不加载）
    3) 给 browser/omni.ja 打一个极小补丁，让 Zen 启动时加载 userChrome.js
       （第 3 步需要管理员；不需要时加 -NoPatch，只是滚轮横向翻页会失效）

  用法：
    右键 install.bat → 以管理员身份运行            （完整安装）
    或 powershell -File install.ps1 -NoPatch       （只装 CSS/JS，不改二进制）
  撤销：uninstall.bat
  更新：update.bat（拉取仓库最新文件并重装）
#>
[CmdletBinding()]
param(
    [string]$ProfileDir = "",
    [string]$InstallDir = "",
    [switch]$NoPatch,
    [switch]$SkipAdminCheck
)
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot

# ---------- 自动定位 Zen 配置目录（读 profiles.ini，不写死任何用户名） ----------
# 注意 Zen/Firefox 的两个坑：
#   1) [Install<hash>] 段的 Default= 存的是「路径」，不是 ProfileN 的下标
#   2) 可能另有 [ProfileX] 带 Default=1 的空壳配置（Zen 自动建的），不能拿它当在用配置
function Resolve-ZenProfile {
    $ini = Join-Path $env:APPDATA "zen\profiles.ini"
    if (-not (Test-Path $ini)) { throw "找不到 $ini，请手动传 -ProfileDir <配置目录>" }
    $lines = Get-Content $ini

    $profiles = @{}      # path(小写、正斜杠) -> 完整目录
    $installDefault = ""
    $flagDefault = ""
    $cur = ""
    foreach ($l in $lines) {
        if ($l -match '^\[(.+)\]\s*$') { $cur = $Matches[1]; continue }
        if ($cur -match '^Profile' -and $l -match '^\s*Path\s*=\s*(.+?)\s*$') {
            $p = $Matches[1].Trim()
            $key = $p.ToLower().Replace('\', '/')
            $profiles[$key] = $p
        }
        if ($cur -match '^Install' -and $l -match '^\s*Default\s*=\s*(.+?)\s*$') { $installDefault = $Matches[1].Trim() }
    }
    if (-not $profiles.Count) { throw "profiles.ini 里没有任何 [ProfileN]，请手动传 -ProfileDir" }

    $root = Join-Path $env:APPDATA "zen"
    function To-Dir([string]$p) {
        $k = $p.Trim().Replace('\', '/')
        if ([System.IO.Path]::IsPathRooted($p)) { return $p }
        return (Join-Path $root $p)
    }

    # 优先：[Install*] 的 Default 路径
    if ($installDefault) {
        $k = $installDefault.ToLower().Replace('\', '/')
        if ($profiles.ContainsKey($k)) { return (To-Dir $profiles[$k]) }
        $d = To-Dir $installDefault
        if (Test-Path $d) { return $d }
    }
    # 其次：只有一个配置就直接用它
    if ($profiles.Count -eq 1) { return (To-Dir ($profiles.Values | Select-Object -First 1)) }
    # 最后：取 prefs.js 最近被写过的那个（= 真正在用的配置），避免被 Default=1 的空壳骗走
    $best = $null; $bestT = [datetime]::MinValue
    foreach ($v in $profiles.Values) {
        $dir = To-Dir $v
        $prefs = Join-Path $dir "prefs.js"
        if (Test-Path $prefs) {
            $t = (Get-Item $prefs).LastWriteTime
            if ($t -gt $bestT) { $bestT = $t; $best = $dir }
        }
    }
    if ($best) { return $best }
    throw "无法确定在用配置目录（profiles.ini 有多个候选），请手动传 -ProfileDir"
}

# ---------- 自动定位 Zen 安装目录 ----------
function Resolve-ZenInstall {
    $cands = @(
        (Join-Path ${env:ProgramFiles} "Zen Browser"),
        (Join-Path ${env:ProgramFiles(x86)} "Zen Browser"),
        (Join-Path $env:LOCALAPPDATA "Programs\Zen Browser")
    )
    foreach ($c in $cands) { if (Test-Path (Join-Path $c "zen.exe")) { return $c } }
    $proc = Get-CimInstance Win32_Process -Filter "Name='zen.exe'" | Select-Object -First 1
    if ($proc -and $proc.ExecutablePath) { return Split-Path $proc.ExecutablePath -Parent }
    throw "找不到 Zen 安装目录，请手动传 -InstallDir"
}

if (-not $ProfileDir) { $ProfileDir = Resolve-ZenProfile }
if (-not (Test-Path $ProfileDir)) { throw "配置目录不存在：$ProfileDir" }
Write-Host "配置目录：$ProfileDir"

# ---------- 1) 放置 CSS / JS ----------
$chromeDir = Join-Path $ProfileDir "chrome"
if (-not (Test-Path $chromeDir)) { New-Item -ItemType Directory -Path $chromeDir | Out-Null }
Copy-Item (Join-Path $here "userChrome.css") (Join-Path $chromeDir "userChrome.css") -Force
Copy-Item (Join-Path $here "userChrome.js")  (Join-Path $chromeDir "userChrome.js")  -Force
Write-Host "已写入 userChrome.css / userChrome.js"

# ---------- 2) 打开 userChrome.css 加载开关 ----------
$userJs = Join-Path $ProfileDir "user.js"
$prefLine = 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);'
$existing = if (Test-Path $userJs) { Get-Content $userJs -Raw } else { "" }
if ($existing -notmatch [regex]::Escape("legacyUserProfileCustomizations.stylesheets")) {
    $header = "`n# ---- zen-tab-grid ----`n"
    Add-Content -Path $userJs -Value ($header + $prefLine + "`n")
    Write-Host "已在 user.js 打开样式表开关"
} else {
    Write-Host "样式表开关已存在，跳过"
}

# ---------- 3) omni.ja 补丁 ----------
if ($NoPatch) {
    Write-Host "已按 -NoPatch 跳过二进制补丁（滚轮横向翻页需要它）。"
    Write-Host "完成：重启 Zen 生效。"
    return
}

if (-not $InstallDir) { $InstallDir = Resolve-ZenInstall }
$omni   = Join-Path $InstallDir "browser\omni.ja"
$backup = "$omni.bak"
$target = "chrome/browser/content/browser/browser-main.js"

Write-Host "Zen 安装目录：$InstallDir"

if (-not $SkipAdminCheck -and -not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
        ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "补丁这一步需要管理员权限：请右键 install.bat →「以管理员身份运行」" -ForegroundColor Yellow
    exit 2
}
if (-not (Test-Path $omni)) { throw "找不到 $omni" }

try { $fs = [System.IO.File]::Open($omni, 'Open', 'ReadWrite', 'None'); $fs.Close() }
catch { Write-Host "omni.ja 被占用（Zen 还在运行）。请完全退出 Zen（菜单 → 退出）后重跑。" -ForegroundColor Yellow; exit 3 }

Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($omni, 'Read')
try {
    $entry = $zip.GetEntry($target)
    if (-not $entry) { throw "$omni 里没有 $target，Zen 结构可能已变，请把 Zen 版本反馈给我" }
    $sr = New-Object System.IO.StreamReader($entry.Open())
    $orig = $sr.ReadToEnd(); $sr.Dispose()
} finally { $zip.Dispose() }

if ($orig.Contains('zenuserchrome')) {
    Write-Host "补丁已在，无需重复。"
} else {
    $loader = Get-Content (Join-Path $here "loader-snippet.txt") -Raw
    $tmp = Join-Path $env:TEMP "omni-patched.ja"
    if (Test-Path $tmp) { Remove-Item $tmp -Force }

    $src = [System.IO.Compression.ZipFile]::Open($omni, 'Read')
    $dst = [System.IO.Compression.ZipFile]::Open($tmp, 'Create')
    try {
        $srcCount = $src.Entries.Count
        foreach ($e in $src.Entries) {
            $new = $dst.CreateEntry($e.FullName, [System.IO.Compression.CompressionLevel]::NoCompression)
            $new.LastWriteTime = $e.LastWriteTime
            $out = $new.Open()
            if ($e.FullName -eq $target) {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($orig + "`n" + $loader)
                $out.Write($bytes, 0, $bytes.Length)
            } else {
                $in = $e.Open(); $in.CopyTo($out); $in.Dispose()
            }
            $out.Dispose()
        }
    } finally { $dst.Dispose(); $src.Dispose() }

    $chk = [System.IO.Compression.ZipFile]::Open($tmp, 'Read')
    try {
        $n = $chk.Entries.Count
        $en2 = $chk.GetEntry($target)
        $sr2 = New-Object System.IO.StreamReader($en2.Open()); $t2 = $sr2.ReadToEnd(); $sr2.Dispose()
    } finally { $chk.Dispose() }
    if ($n -ne $srcCount) { throw "条目数不一致（$n vs $srcCount），已放弃替换" }
    if (-not $t2.Contains('zenuserchrome')) { throw "新包里没找到加载器，已放弃替换" }

    if (-not (Test-Path $backup)) { Copy-Item $omni $backup; Write-Host "已备份 -> $backup" }
    Copy-Item $tmp $omni -Force
    Remove-Item $tmp -Force
    Write-Host "补丁已写入 $omni（$n 个条目，含加载器）"
}

Write-Host ""
Write-Host "完成。重启 Zen 即生效。Zen 自动更新后若失效，重跑 update.bat 或 install.bat。"
