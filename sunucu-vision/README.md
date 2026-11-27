# Okul Dijital Pano — Yerel Ağ (LAN) Sürümü

Bu sürüm, panoyu **bir bilgisayarda çalıştırıp aynı ağdaki (Wi-Fi/LAN) istediğiniz sayıda TV veya akıllı tahtanın tarayıcısından** açabilmenizi sağlar. Tüm ekranlar **aynı içeriği otomatik senkron** gösterir; yönetim panelinden yaptığınız değişiklik (~20 saniye içinde) tüm ekranlara yansır.

> Tek bir ekranda, internetsiz/ağsız kullanmak isterseniz, daha önce verdiğim **tek dosyalık offline sürüm** (`okul-dijital-pano.html`) hâlâ geçerli ve bu sürümden bağımsız çalışır. Bu LAN sürümü, birden fazla ekranı aynı anda ve senkron yönetmek isteyenler içindir.

## 1. Gereksinim: Node.js

Panoyu çalıştıracağınız bilgisayarda (okul ofisindeki bir masaüstü/dizüstü olabilir) **Node.js** kurulu olmalı.

- https://nodejs.org adresinden **LTS** sürümünü indirip kurun (Windows/Mac/Linux hepsinde çalışır).
- Kurulumdan sonra bir kez doğrulamak için komut satırında: `node -v` yazın; bir sürüm numarası görmelisiniz.

Bu adım dışında **hiçbir ek paket kurulumu (npm install) gerekmiyor** — sunucu yalnızca Node'un kendi yerleşik özellikleriyle yazıldı.

## 2. Dosyaları yerleştirin

Bu zip'in içindekileri bilgisayarınızda bir klasöre çıkarın (örn. `C:\okul-pano\` veya masaüstünde bir klasör). Klasör yapısı şöyle kalmalı:

```
okul-pano-sunucu/
  server.js
  public/
    index.html
  data/
    media/
```

`data/` klasörü ayarlarınızı ve yüklediğiniz görsel/videoları saklayacak — silmeyin.

## 3. Sunucuyu başlatın

Klasörün içinde bir komut satırı (Windows'ta klasöre girip adres çubuğuna `cmd` yazabilirsiniz) açıp:

```
node server.js
```

yazın. Ekranda şöyle bir şey göreceksiniz:

```
=======================================================
  Okul Dijital Pano sunucusu çalışıyor
=======================================================
  Aynı ağdaki TV/akıllı tahta tarayıcısında şu adres(ler)i açın:
    -> http://192.168.1.23:8080   (Wi-Fi)

  Yönetim paneline de aynı adresten, sağ üstteki dişli
  ikonuyla giriş yapabilirsiniz (varsayılan: admin / admin123).
=======================================================
```

**Bu pencereyi kapatmayın** — kapatırsanız sunucu durur ve ekranlardaki gösterim de durur. Bilgisayarın ekran koruyucu/uyku moduna geçmemesini de ayarlamanız önerilir.

IP adresi ve port, her bilgisayarda/ağda farklı çıkabilir; siz de yönetim panelindeki **"Ağ yayını"** sekmesinden bu adresi her zaman görebilirsiniz.

## 4. TV/akıllı tahtalarda açın

Aynı Wi-Fi/ağdaki her TV veya akıllı tahtanın tarayıcısına, sunucunun bastığı adresi (örn. `http://192.168.1.23:8080`) yazın. Hepsi aynı panoyu, aynı anda gösterecektir.

> **Not:** Medya galerisine YouTube linki eklerseniz, o video oynatılırken sunucu bilgisayarın değil, **o anda panoyu görüntüleyen TV'nin** internete çıkabiliyor olması gerekir (YouTube içeriği doğrudan TV'nin tarayıcısına yüklenir).

Tam ekran için TV'nin tarayıcısında F11 (veya ilgili tam ekran kısayolu) kullanabilir, ya da panonun sağ üstündeki gizli tam ekran butonunu kullanabilirsiniz.

## 5. Yönetim paneli

Herhangi bir ekrandan (sunucu bilgisayar dahil, aynı ağdaki başka bir bilgisayar/telefon da olur) aynı adresi açıp sağ üstteki dişli ikonuna basarak giriş yapabilirsiniz.

- Varsayılan giriş: **admin / admin123** — ilk girişte Hesap sekmesinden değiştirin.
- Yaptığınız her değişiklik sunucuda saklanır ve tüm ekranlara birkaç saniye içinde yansır.
- Aynı anda yalnızca bir yönetim oturumu geçerlidir (biri giriş yaparsa öncekinin oturumu kapanır) — bu basit bir güvenlik önlemidir, çok kullanıcılı eşzamanlı düzenleme için tasarlanmamıştır.

## 6. Güvenlik duvarı uyarısı (Windows)

İlk çalıştırmada Windows Güvenlik Duvarı "Node.js'in ağ erişimine izin verilsin mi?" diye sorabilir — **İzin Ver**'e basmazsanız diğer cihazlar sunucuya bağlanamaz.

## 7. Bilgisayar her açıldığında otomatik başlatmak isterseniz

En basit yöntem: `node server.js` komutunu içeren bir `.bat` dosyası (Windows) oluşturup bu dosyayı Windows'un **Başlangıç (Startup)** klasörüne kısayol olarak eklemek. İsterseniz bu adımı birlikte de ayarlayabiliriz.

## 8. Sorun giderme

- **TV'de açılmıyor:** Sunucu bilgisayarla TV'nin aynı Wi-Fi/ağda olduğundan emin olun (misafir ağı farklı bir ağ sayılır, aynı ağda olmalılar). Güvenlik duvarı izinlerini kontrol edin.
- **IP adresi değişti:** Router yeniden başlarsa IP değişebilir; yönetim panelindeki "Ağ yayını" sekmesinden güncel adresi kontrol edip TV'lerde adresi güncelleyin. Sabit bir IP istiyorsanız router ayarlarından bu bilgisayara **statik IP / DHCP rezervasyonu** tanımlayabilirsiniz (bunu nasıl yapacağınızı da anlatabilirim).
- **"Port dolu" gibi bir durum:** Sunucu otomatik olarak bir sonraki boş portu dener, elle bir şey yapmanıza gerek yok.

## 9. TV sayfası (Vestel / Opera TV — Chromium 53 gibi eski tarayıcılar için)

`public/tv.html`, eski TV tarayıcıları için **sıfırdan yazılmış**, yalnızca TV'de gösterim yapan ayrı bir sayfadır:

- Sunucu, eski TV tarayıcısını (Opera TV, HbbTV, Chromium 70'ten eski) **otomatik tanır** ve ana adreste (`http://IP:8080`) bu sayfayı verir. Elle açmak için: `http://IP:8080/tv`
- Bilgisayar/telefon/yeni tarayıcılar yine tam sürümü (yönetim paneli dahil) görür. **Yönetim panelini bilgisayardan açın**; TV sayfası yalnızca gösterim içindir, değişiklikler 15 saniye içinde TV'ye yansır.
- Sabit 1920×1080 sahne ekrana göre ölçeklenir (1280×720 dahil). CSS Grid, `clamp()`, `backdrop-filter`, `gap`, `async/await` gibi eski tarayıcıda olmayan özellikler **kullanılmaz**; yalnızca ES5 JavaScript ve düz renkler vardır.
- Yazı tipi (Inter) sunucudan yüklenir, TV'de yüklü yazı tiplerine bağlı değildir.
- Duyurular kayan yazı yerine tek tek, yumuşak geçişle gösterilir (eski TV'lerde kayan yazı titrer).
- Hava durumunu TV'nin kendisi çeker; çekemezse sunucudaki son değerler gösterilir. Sunucuya ulaşılamazsa son bilgiler gösterilir ve ekranın altında uyarı çıkar.
- YouTube TV sayfasında gösterilmez (okul filtresi / eski tarayıcı); **mp4 yükleyin**. Sayfa her gece 03:30'da kendini yeniler.

## 10. Yüklenen videolar TV'de oynamıyorsa

- Video **H.264 (mp4) + AAC ses**, tercihen 1280×720, ~2,5 Mb/sn olmalıdır. Eski TV tarayıcıları H.265/HEVC, 4K veya yüksek bitrate videoları oynatamaz.
- Dönüştürme (FFmpeg): `ffmpeg -i video.mp4 -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -vf scale=1280:-2 -b:v 2500k -c:a aac -b:a 128k -movflags +faststart tv-video.mp4`
- Sunucu artık videoları parça parça (HTTP Range) sunar; TV tarayıcıları bunu ister.
- Oynatılamayan video 3 saniye sonra atlanır, pano takılı kalmaz.

## 11. Videoda ses açma / kapama
Yönetim paneli → **Medya** sekmesi → video kartındaki **🔇 Ses kapalı / 🔊 Ses açık** düğmesine basın. Ayar her video için ayrı saklanır ve TV'ye yaklaşık 15 sn içinde yansır. Varsayılan sessizdir. Ses seviyesi TV kumandasından ayarlanır. Modern tarayıcılar kullanıcı etkileşimi olmadan sesli otomatik oynatmayı engelleyebilir; bu durumda video sessiz oynar.

Not: Videonun sesi yalnızca TV sayfasında (tv.html) çalar. Sunucu bilgisayarında açık olan panoda video her zaman sessizdir (özel olarak sesli açmak için adresin sonuna `?ses=1` ekleyin).

## 12. Yemek listesini Word / Excel'den toplu yükleme
Yönetim paneli → **Yemek menüsü** → **Word / Excel'den yükle**. Desteklenen: `.xlsx`, `.docx`, `.csv`, `.txt` (eski `.xls`/`.doc` dosyalarını “Farklı kaydet” ile `.xlsx`/`.docx` yapın).
- Her satırda **tarih** ve/veya **gün adı** ile yemekler bulunmalı; yemekler birden çok sütunda olabilir (Çorba | Ana yemek | …), virgülle birleştirilir.
- **Aylık takvim düzeni (MEB taşımalı yemek listesi şablonu):** her hafta için bir tarih satırı (*02 Kasım 2026 Pazartesi | 03 Kasım 2026 Salı | …*) ve altında o günlerin yemek satırları. Her tarih satırı yeni haftayı başlatır; “16-20 KASIM 2026 ARA TATİL” gibi tek hücrelik satırlar o günler için tatil girişi olarak eklenir; ay sonundaki yarım hafta da okunur.
- Günler sütun başlığı olan yatay tablolar ve “Pazartesi: çorba, pilav…” biçimindeki düz yazılar da okunur.
- Tarihli (aylık) liste yüklenirse panoda yalnızca **bulunulan hafta** görünür; hafta sonu gelecek hafta gösterilir. Böylece listeyi ayda bir yüklemek yeter.
- Örnek şablon: `samples/yemek-listesi-ornek.xlsx` ve `.docx`.

## Nöbetçi listesini Word / Excel'den toplu yükleme
Yönetim paneli → **Nöbetçi personel** → **Word / Excel'den yükle**. Desteklenen: `.xlsx`, `.docx`, `.csv`, `.txt` (eski `.xls`/`.doc` dosyalarını “Farklı kaydet” ile `.xlsx`/`.docx` yapın). Yüklemeden önce önizleme gösterilir; onaylayınca mevcut listenin yerine geçer.
- **Haftalık çizelge** (okullardaki en yaygın biçim): ilk sütunda nöbet yerleri, başlıkta günler (*Nöbet Yeri | Pazartesi | Salı | … | Cuma*), hücrelerde öğretmen adları. Günler satırda, nöbet yerleri başlıkta olan çizelgeler de okunur.
- **Uzun liste:** *Gün | Nöbet Yeri | Öğretmen* (gün hücresi boşsa üstteki gün sürer). **Günsüz liste:** *Nöbet Yeri | Öğretmen*.
- **Düz metin** (Word paragrafları / .txt): “Pazartesi” satırının altında “Zemin Kat: Ayşe Yılmaz” gibi satırlar.
- Haftalık çizelge yüklenince panoda (TV ve bilgisayar) **yalnızca bugünün nöbetçileri** görünür, başlıkta gün adı yazar; hafta sonu pazartesi gösterilir. Her satırdaki gün seçimiyle elle de düzenlenebilir; günü “Her gün” olan satırlar her gün görünür.
- Örnek şablon: `samples/nobet-listesi-ornek.xlsx` ve `.docx`.

## 13. YouTube videolarını TV'de oynatmak (yt-dlp, diske kaydetmeden)
**Neden TV'de açılmıyordu:** TV'nin tarayıcısı (Opera TV / Chromium 53) YouTube'un güncel oynatıcısını açamaz. Çözüm: sunucu bilgisayar, YouTube'daki videonun doğrudan adresini `yt-dlp` ile bulur ve görüntüyü TV'ye **canlı aktarır**; TV bunu sıradan mp4 gibi oynatır. **Hiçbir video dosyası diske kaydedilmez**, depolama dolmaz.

Kurulum (sunucu bilgisayarda, bir kez):
1. https://github.com/yt-dlp/yt-dlp/releases adresinden `yt-dlp.exe` dosyasını indirip `server.js` ile **aynı klasöre** koyun. (İsteğe bağlı ama **görüntü kalitesi için önerilir:** `ffmpeg.exe` dosyasını da aynı klasöre koyun, aşağıya bakın.)
2. Sunucuyu yeniden başlatın. Yönetim paneli → Medya → YouTube linki ekle. TV 15 sn içinde videoyu oynatmaya başlar.

Notlar: Görüntü TV'ye sunucu üzerinden aktığı için sunucu bilgisayar açık ve internete bağlı olmalıdır. Her oynatmada video yeniden çekilir (internet kotası kullanır); uzun videolar yerine kısa klipler önerilir. Kalite hazır mp4 biçimiyle sınırlıdır (çoğunlukla 360p–720p). Süre alanı videonun ekranda kalma süresidir. YouTube bir şey değiştirirse `yt-dlp -U` ile güncelleyin.

Okul ağında "CERTIFICATE_VERIFY_FAILED / self signed certificate" hatası: Okul (MEB/FATİH) ağı HTTPS trafiğini inceleyip kendi sertifikasıyla (MEB `fatihca` kök sertifikası) yeniden imzalar. Tarayıcılar buna Windows'tan güvenir ama yt-dlp ve Node güvenmez. Bu pakette **`certs/meb-fatihca.pem`** (MEB kök sertifikası, yalnızca genel anahtar) hazır gelir; sunucu açılırken `certs/` klasöründeki sertifikaları güvenilir sayar (başka bir ağ sertifikası eklemek için `.pem/.crt/.cer` dosyasını bu klasöre koyun). Sırayla şunlar denenir: (1) normal, (2) yt-dlp için Windows sertifika deposu + MEB sertifikası, (3) hâlâ olmuyorsa son çare olarak yalnızca YouTube aktarımında doğrulamayı atlama. Hangi adımın kullanıldığı sunucu konsolunda `[YouTube] …` satırlarıyla görünür.

### "Sign in to confirm you're not a bot" hatası (YouTube bot doğrulaması)
Okulun tek internet adresini çok kişi kullandığı için YouTube bazen "bot değilsiniz" doğrulaması ister; yt-dlp bunu aşamaz. Sunucu önce birkaç farklı yöntemi dener (JS çalıştırıcısı olarak Node, farklı oynatıcı istemcileri). Olmazsa **giriş çerezi** gerekir:
1. Sunucu bilgisayardaki tarayıcıda YouTube'a (tercihen bu iş için açılmış ayrı bir Google hesabıyla) giriş yapın.
2. Tarayıcıya "Get cookies.txt LOCALLY" gibi bir eklenti kurup youtube.com çerezlerini `cookies.txt` olarak dışa aktarın.
3. Dosyayı `server.js` ile aynı klasöre koyun; sunucu otomatik kullanır (yeniden başlatmak gerekmez, ama hatalı denemeler 90 sn önbellekte tutulur).
Alternatif: Firefox kullanıyorsanız sunucuyu başlatmadan önce `set YT_COOKIES_BROWSER=firefox` yazın (Chrome/Edge'in yeni sürümlerinde çerez şifrelemesi nedeniyle bu yöntem çalışmaz).
Önemli: Çerez dosyası hesabınızın oturumudur; kimseyle paylaşmayın. YouTube otomasyon araçlarını kısıtlayabilir, bu yöntem her zaman garanti değildir. **Her koşulda çalışan yol videoyu mp4 olarak yüklemektir** (Medya → dosya yükle).

### Görüntü kalitesi (ffmpeg.exe)
YouTube artık 360p'nin üstünde hazır (video+ses birleşik) mp4 vermiyor; yalnızca `yt-dlp.exe` varsa görüntü **360p** olur ve yerel mp4'e göre bulanık görünür. `ffmpeg.exe` dosyasını (https://www.gyan.dev/ffmpeg/builds/ → "release essentials", içindeki `bin\ffmpeg.exe`) `server.js` ile aynı klasöre koyarsanız sunucu **720p** video ile sesi ayrı ayrı alıp yeniden kodlamadan (`-c copy`, işlemciyi yormaz, diske yazmaz) birleştirerek TV'ye aktarır. ffmpeg başarısız olursa otomatik olarak 360p'ye döner (konsolda `[YouTube] ffmpeg başarısız…` yazar). Yüksek kalite akışında TV videoda ileri sarma yapamaz (zaten gerekmez). Eski haline dönmek için `ffmpeg.exe` dosyasını klasörden çıkarın.


### TV'de YouTube oynamıyorsa: önce durumu okuyun
Yönetim paneli → **Medya** sekmesindeki **TV YouTube akışı** kutusu sunucunun gördüğünü yazar: yt-dlp bulundu mu, ffmpeg/cookies.txt var mı ve TV'nin son isteği başarılı mı (başarısızsa YouTube'un verdiği hata). Bilgisayar ekranı YouTube'un kendi oynatıcısını kullandığından orada oynaması TV'ye akışın çalıştığını göstermez. yt-dlp yoksa TV de medya alanında bunu yazar. ffmpeg ile gönderilen 720p akışı TV oynatamazsa TV kendiliğinden uyumlu 360p mp4'e geçer. YouTube öğesinin **süre** ayarı TV'de de uygulanır.

**TV'de YouTube videosu birkaç saniye sonra donup kalıyorsa (Kasım 2026'da düzeltildi):** TV videoyu "buradan sonuna kadar" biçiminde parça parça ister; YouTube bu tür büyük istekleri kasıtlı yavaşlattığı için veri yetişmiyor, görüntü donuyordu. Sunucu artık veriyi YouTube'dan 8 MB'lık küçük parçalar halinde çekip TV'ye kesintisiz aktarır (yt-dlp'nin kendi indirme yöntemi); bir parça koparsa kaldığı yerden devam eder. Diske yine hiçbir şey yazılmaz. Günlükte artık her parça için değil, akış başında tek satır görünür: `[YouTube] aktarım başladı: 35.7 MB, 8 MB'lık parçalarla`.

## Son denetim sonrası değişiklikler (güvenlik ve dayanıklılık)

- **Parola**: artık `scrypt` ile özetlenerek saklanır; eski kayıtlar ilk girişte otomatik yükseltilir. Oturum jetonları 12 saat geçerlidir, çıkışta iptal edilir. 8 hatalı denemeden sonra o IP 5 dakika engellenir.
- **Kayıt güvenliği**: `state.json` önce geçici dosyaya yazılıp yer değiştirilir ve `state.json.bak` yedeği tutulur; dosya bozulursa yedekten açılır.
- **Yükleme**: yalnızca jpg/png/gif/webp/bmp ve mp4/webm/mov/m4v kabul edilir; büyük yüklemelerde zaman aşımı yoktur. Sayfadaki eski bir sekme, silinmiş medyayı geri getiremez.
- **Hava durumu**: sunucu kendisi 30 dakikada bir Open-Meteo'dan çeker (SSL incelemesi için `certs/` kullanılır); TV doğrudan çekemezse bu değeri gösterir.
- **TV**: video öğeleri slayt geçişinde bellekten bırakılır, duyuru şeridi yazı tipi yüklendikten sonra yeniden ölçülür, hava durumu saati TV saat diliminden bağımsız İstanbul saatiyle gösterilir.
- **Çökme koruması**: beklenmeyen bir hata sunucuyu kapatmaz, günlüğe yazılır.

## Ek temalar (TV'de yerleşimi değiştirenler)

Yönetim paneli > Tema bölümünde "· TV" yazan üç tema vardır: **Orman (Doğal)** (krem kartlar, yeşil zemin), **Yan Şerit** (solda saat/hava/duyuru şeridi, sağda ders programı) ve **Kara Tahta** (tebeşir yazısı, yapışkan not kâğıtları). Bunlar yalnızca TV sayfasında (`tv.html`) yerleşimi de değiştirir; bilgisayar sayfasında yalnızca renk paleti uygulanır. Tema değişikliği TV'ye en geç 15 saniyede yansır.

## Onur Köşesi

Yönetim paneli > **Onur köşesi**: "Ayın en temiz sınıfı" ve "Ayın öğrencisi" bilgilerini girin. "Yemek menüsü yerine Onur Köşesi'ni yayınla" kutusu işaretlenince panodaki (TV ve bilgisayar) yemek menüsü bölümü Onur Köşesi'ne dönüşür; kutuyu kaldırınca yemek menüsü geri gelir. Kutu anında kaydedilir; yemek menüsü verileri silinmez. Alt başlıklar ve bölüm başlığı değiştirilebilir, boş bırakılan bölüm gösterilmez.

## Kiosk kararlılığı (TV sayfası)

- Hata sınırı: her bölümün çizimi ayrı korunur; bir bölümdeki hata diğerlerini durdurmaz. 1 dakikada 8'den fazla hata olursa sayfa kendini yeniler (en fazla 3 dakikada bir).
- Yenilemeler (gece 03:30, hata fırtınası, uzun donma) yalnızca sunucu son 2 dakikada yanıt verdiyse yapılır; çevrimdışıyken yenilenip hata sayfasında takılmaz.
- Yoklama zinciri tektir; sunucu kapalıyken 15 → 30 → 60 sn aralıkla yavaşlar, açılınca otomatik toparlanır.
- Video bekçisi: 30 sn boyunca ilerlemeyen video yeniden başlatılır ya da sıradakine geçilir.

## Otomatik başlatma, yedek, çalışma saatleri, acil duyuru, ekran durumu

**Windows'ta otomatik başlatma:** `otomatik-baslat-kur.bat` dosyasına çift tıklayın (yönetici izni ister). Pano sunucusunun her oturum açılışında başlamasını (çökerse 5 sn içinde yeniden başlar: `baslat.bat`), uykunun kapanmasını, 8080 portunun güvenlik duvarında açılmasını ve cuma 16:30'da haftalık yedek alınmasını ayarlar. Elektrik kesintisinden sonra kendiliğinden açılması için ayrıca Windows'ta otomatik oturum açma (`netplwiz`) ve BIOS'ta "AC Power Loss → Power On" gerekir. Geri almak için `otomatik-baslat-kaldir.bat`. Bu betikler Windows içindir; Linux/Mac'te `node server.js` komutunu kendi başlatma sisteminizle (systemd/launchd) çalıştırın.

**Yedek:** (1) Sunucu her gün `data/backups/state-GÜN.json` dosyasına ayarların kopyasını alır (son 14 gün). (2) `yedekle.bat` tüm `data` klasörünü (medya dahil) Belgeler\OkulPano-Yedek içine tarihli klasör olarak kopyalar; `yedekle.bat D:\Yedek` ile farklı bir diski (USB, ağ) hedefleyebilirsiniz. Eski (8 hafta) yedekler silinir. Geri yüklemek için yedekteki `data` klasörünü sunucunun yanına kopyalayın.

**Çalışma saatleri:** Yönetim > Ağ yayını > "Ekran çalışma saatleri". Varsayılan: hafta içi 08:30–16:00. Dışında TV ekranı siyah olur ve video/animasyon durur; saat gelince kendiliğinden açılır. (TV'yi fiziksel olarak kapatmaz; TV'nin kendi uyku zamanlayıcısını da kullanabilirsiniz.)

**Acil duyuru:** Yönetim > Acil duyuru. Başlık, metin, renk, simge ve otomatik kapanma süresi serbest; hazır duyurular eklenip silinebilir. Yayınlayınca tüm TV/ekranlarda tam ekran görünür, çalışma saati dışında olsa bile; videolar durur. Kaldırınca pano kaldığı yerden devam eder.

**Ekran durumu:** Yönetim > Ağ yayını > "Ekran durumu": her TV 15 sn'de bir kendini bildirir; bağlantısı kopan ekran kırmızı görünür.

**Medya yükleme:** 1920 pikselden büyük görseller yüklemeden önce tarayıcıda küçültülür; yüklemede ilerleme çubuğu vardır. Yemek menüsü dosyası yüklenince önce önizleme gösterilir, onaylayınca uygulanır.

## Ses düzeltmeleri ve sorun giderme

- Ses ayarını (açık / kapalı / otomatik) değiştirmek artık videoyu baştan başlatmaz; ayar oynayan videoya anında uygulanır.
- Otomatik ses: programda "Teneffüs" kutusu işaretli satırlar ya da adında teneffüs / öğle arası / ara geçen satırlar teneffüs sayılır; açık, ders saatlerinde ve ders dışında kapalı olur.
- TV'de sorun gidermek için panonun adresinin sonuna `?debug=1` ekleyin (ör. `http://192.168.1.10:8080/?debug=1`): sol altta "ses: otomatik · teneffüs · SESLİ" gibi bir satır görünür.

## Performans, kararlılık ve ekran uyumu güncellemesi (Ekim 2026)

- **Sunucu yükü:** Ekranlar son gördükleri durum sürümünü gönderir; değişiklik yoksa sunucu tüm ayarları (logo dahil) göndermek yerine ~30 baytlık bir yanıt döner.
- **yt-dlp/ffmpeg yoksa** sunucu artık her istekte bunları aramaz (sonuç 1 dk önbellekte); önceden her TV yoklamasında sunucu kısa süre donuyordu.
- **Medya yükleme akışlı:** büyük videolar belleğe alınmadan doğrudan diske yazılır.
- **Kayan yazı** (TV ve bilgisayar) tarayıcının ekran kartı katmanında kayar; sayfa meşgulken takılmaz. Bilgisayar sayfasında 20 sn'de bir başa sarma hatası giderildi.
- **Okunabilirlik:** bütün temalarda (TV ve bilgisayar) görünen her yazı, uzaktan ve parlak ışıkta okunabilmesi için en az WCAG 4.5:1 karşıtlıkta (büyük yazıda 3:1). Okulun seçtiği vurgu rengi ne olursa olsun yazı rengi buna göre kendiliğinden ayarlanır; TV'deki en küçük yazılar (nöbet yeri etiketi, ŞİMDİ rozeti) büyütüldü, geçmiş dersler soluk ama okunur.
- **Sunucu günlüğü:** `data/pano.log` — hata ve uyarılar tarih damgasıyla buraya da yazılır; konsol penceresi kapalı olsa bile sorun buradan okunur.
- **Görünüm gözden geçirmesi:** sağ sütun kartları boş alan bırakmadan dolar; Kara Tahta temasında saat/tarih taşması giderildi, nöbetçi etiketleri okunur boyutta; uzun nöbetçi adı tek satırda kısalır; yönetim panelindeki alt düğmeler belirgin.
- **Görseller medya alanına sığdırılır:** dikey afiş ya da geniş pankart kırpılmadan tamamen görünür; boş kalan kenarları aynı görselin bulanık, koyu kopyası doldurur (siyah bant yok). Oranı alana uyan görsellerde bu dolgu eklenmez. Videolar eskisi gibi alanı doldurur.
- **Bilgisayar sayfası:** ekran boyutuna orantılı ölçek (4K ekranda artık her şey yarı boyutta kalmıyor, 1366×768'de ders listesi görünüyor); uzun okul adı iki satıra iner; 13 satırlık ders programı kesilmeden sığar; Vision temasında ağır bulanıklık efekti kiosk panellerinde kapatıldı (görünüm aynı); gizlenen slayttaki video bellekten bırakılır; donan video atlanır; hata sınırı, otomatik toparlanma ve gece 03:30 yenilemesi; sunucu kapalıyken son bilinen içerik gösterilir.
- **TV sayfası:** geri sayım açıkken okul adı artık geri sayım kutusunun altına girmez (gerekirse yazı küçülür); slayt geçişi görsel/video hazır olunca yapılır; saat saniye sınırına hizalı; 1 saatten uzun ders geri sayımı kırpılmaz; TV'nin eski hava durumu verisi sunucudaki yeni değeri ezmez.
