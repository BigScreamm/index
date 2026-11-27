@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
rem Kullanim: yedekle.bat [hedef-klasor]   (hedef verilmezse Belgeler\OkulPano-Yedek kullanilir)
set "HEDEF=%~1"
if "%HEDEF%"=="" set "HEDEF=%USERPROFILE%\Documents\OkulPano-Yedek"
if /i "%HEDEF%"=="sessiz" set "HEDEF=%USERPROFILE%\Documents\OkulPano-Yedek"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "TARIH=%%i"
set "KLASOR=%HEDEF%\yedek-%TARIH%"
mkdir "%KLASOR%" 2>nul
robocopy "%~dp0data" "%KLASOR%\data" /E /R:1 /W:1 /NFL /NDL /NJH /NJS >nul
if errorlevel 8 (
  echo Yedek alinamadi.
) else (
  echo Yedek alindi: %KLASOR%
)
rem 8 haftadan eski yedekleri sil
powershell -NoProfile -Command "Get-ChildItem -LiteralPath '%HEDEF%' -Directory -Filter 'yedek-*' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-56) } | Remove-Item -Recurse -Force"
if /i not "%~1"=="sessiz" if /i not "%~2"=="sessiz" pause
