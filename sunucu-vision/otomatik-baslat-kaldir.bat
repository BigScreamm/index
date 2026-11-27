@echo off
chcp 65001 >nul
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
schtasks /Delete /F /TN "OkulDijitalPano"
schtasks /Delete /F /TN "OkulPanoYedek"
netsh advfirewall firewall delete rule name="Okul Dijital Pano" >nul 2>&1
echo Otomatik baslatma ve yedek gorevleri kaldirildi.
pause
