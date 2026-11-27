@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Okul Dijital Pano Sunucusu
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden kurup tekrar deneyin.
  pause
  exit /b 1
)
:dongu
node server.js
echo [%date% %time%] Sunucu durdu, 5 saniye sonra yeniden baslatiliyor... >> "%~dp0data\server-restart.log"
timeout /t 5 /nobreak >nul
goto dongu
