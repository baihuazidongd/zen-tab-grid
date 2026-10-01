@echo off
rem Build zen-tab-grid.exe using only the C# compiler that ships with Windows.
setlocal
cd /d "%~dp0.."
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo [error] csc.exe not found. Install .NET Framework 4.x developer pack,
  echo         or just use install.bat instead of the exe.
  exit /b 1
)
"%CSC%" /nologo /target:exe /platform:anycpu /optimize+ ^
  /reference:System.IO.Compression.dll ^
  /reference:System.IO.Compression.FileSystem.dll ^
  /resource:userChrome.css ^
  /resource:userChrome.js ^
  /resource:loader-snippet.txt ^
  /out:zen-tab-grid.exe ^
  src\Program.cs
if errorlevel 1 exit /b 1
echo built: %~dp0zen-tab-grid.exe
