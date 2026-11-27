@echo off
chcp 65001 >nul
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Yonetici izni isteniyor...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
cd /d "%~dp0"
echo.
echo 1/4  Bilgisayar acilip oturum acilinca panoyu otomatik baslatma gorevi olusturuluyor...
schtasks /Create /F /TN "OkulDijitalPano" /TR "\"%~dp0baslat.bat\"" /SC ONLOGON /RL HIGHEST /DELAY 0000:30
echo.
echo 2/4  Haftalik yedek gorevi (cuma 16:30) olusturuluyor...
schtasks /Create /F /TN "OkulPanoYedek" /TR "\"%~dp0yedekle.bat\" sessiz" /SC WEEKLY /D FRI /ST 16:30
echo.
echo 3/4  Bilgisayarin uykuya gecmesi kapatiliyor (prize takili iken)...
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
echo.
echo 4/4  Guvenlik duvari: TV'lerin baglanabilmesi icin 8080 portuna izin veriliyor...
netsh advfirewall firewall delete rule name="Okul Dijital Pano" >nul 2>&1
netsh advfirewall firewall add rule name="Okul Dijital Pano" dir=in action=allow protocol=TCP localport=8080 >nul
echo.
echo Tamamlandi. NOT: Bilgisayarin elektrik kesintisinden sonra kendiliginden acilip pano baslatabilmesi icin
echo Windows'ta otomatik oturum acma (netplwiz) ve BIOS'ta "AC Power Loss: Power On" ayarlari gerekir.
echo.
pause
