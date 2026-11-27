/*
 * Okul Dijital Pano — Yerel Ağ Sunucusu
 * -------------------------------------
 * Node.js'in yerleşik modülleri dışında hiçbir paket gerektirmez (npm install gerekmez).
 * Çalıştırma: node server.js
 *
 * Ne yapar:
 *  - public/index.html'i (pano arayüzü) ağdaki tüm cihazlara sunar.
 *  - Ayarları data/state.json dosyasında, yüklenen görsel/videoları data/media/ klasöründe saklar
 *    (artık tarayıcı hafızası değil, TEK bir merkezi kaynak — tüm ekranlar aynı içeriği görür).
 *  - Boş bir portu kendisi bulur, PC'nin yerel ağ IP adresini kendisi tespit edip ekrana yazar.
 *  - Basit bir oturum/token tabanlı girişle yönetim işlemlerini (kaydetme, medya yükleme/silme) korur.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const PREFERRED_PORT = 8080;

fs.mkdirSync(MEDIA_DIR, { recursive: true });

/* Günlük: konsola yazılan her [Hata]/[Uyarı]/[YouTube]… satırı data/pano.log dosyasına da eklenir; dosya 1 MB'ı aşınca
   pano.log.1 olarak döndürülür. Konsol penceresi kapanmış ya da sunucu .bat ile arka planda başlamışsa sorun buradan okunur. */
var LOG_FILE = path.join(DATA_DIR, "pano.log"), logSize = -1;
var rawLog = console.log.bind(console);
console.log = function () {
  var line = Array.prototype.slice.call(arguments).join(" ");
  rawLog(line);
  if (!/^\[/.test(line)) return; /* açılış banner'ı gibi serbest metin dosyaya yazılmaz */
  try {
    if (logSize < 0) { try { logSize = fs.statSync(LOG_FILE).size; } catch (e) { logSize = 0; } }
    if (logSize > 1024 * 1024) { try { fs.renameSync(LOG_FILE, LOG_FILE + ".1"); } catch (e) {} logSize = 0; }
    var rec = new Date().toISOString() + " " + line + "\n";
    fs.appendFileSync(LOG_FILE, rec); logSize += rec.length;
  } catch (e) {}
};

/* ---------------- Varsayılan durum ---------------- */
function defaultState() {
  return {
    auth: { user: "admin", pass: b64("admin123") },
    brand: { name: "Okul Adınız", sub: "Dijital Bilgi Panosu", logo: "", accent: "#f2a93b", theme: "lacivert" },
    duty: [
      { loc: "ZEMİN-A", name: "Ad Soyad" }, { loc: "ZEMİN-B", name: "Ad Soyad" },
      { loc: "1.KAT-A", name: "Ad Soyad" }, { loc: "1.KAT-B", name: "Ad Soyad" },
      { loc: "ÖNBAHÇE", name: "Ad Soyad" }, { loc: "ARKABAHÇE", name: "Ad Soyad" }, { loc: "İDARECİ", name: "Ad Soyad" }
    ],
    schedule: [
      { name: "1. Ders", start: "08:30", end: "09:10", brk: false },
      { name: "Teneffüs", start: "09:10", end: "09:20", brk: true },
      { name: "2. Ders", start: "09:20", end: "10:00", brk: false },
      { name: "Teneffüs", start: "10:00", end: "10:10", brk: true },
      { name: "3. Ders", start: "10:10", end: "10:50", brk: false },
      { name: "Teneffüs", start: "10:50", end: "11:00", brk: true },
      { name: "4. Ders", start: "11:00", end: "11:40", brk: false },
      { name: "Öğle Arası", start: "11:40", end: "12:30", brk: true },
      { name: "5. Ders", start: "12:30", end: "13:10", brk: false },
      { name: "Teneffüs", start: "13:10", end: "13:20", brk: true },
      { name: "6. Ders", start: "13:20", end: "14:00", brk: false },
      { name: "Teneffüs", start: "14:00", end: "14:10", brk: true },
      { name: "7. Ders", start: "14:10", end: "14:50", brk: false }
    ],
    weather: { cond: "Parçalı bulutlu", icon: "i-cloud-sun", temp: 22, feels: 21, min: 15, max: 24, auto: true, lastUpdated: null, source: "" },
    countdown: { enabled: false, label: "LGS'ye Kalan Süre", targetDate: "" },
    ticker: ["Bu alana okulunuza ait duyuruları ekleyebilirsiniz.", "Yönetim panelinden istediğiniz kadar duyuru satırı ekleyip sıralayabilirsiniz."],
    tickerSpeed: 1,
    module: { title: "Bilgilendirme", text: "Bu alanı istediğiniz içerikle özelleştirebilirsiniz: nöbet kuralları, güvenlik uyarıları, günün sözü vb.", autoSpecialDays: true },
    menu: [
      { day: "Pazartesi", items: "Menü bilgisi girilmedi" }, { day: "Salı", items: "Menü bilgisi girilmedi" },
      { day: "Çarşamba", items: "Menü bilgisi girilmedi" }, { day: "Perşembe", items: "Menü bilgisi girilmedi" },
      { day: "Cuma", items: "Menü bilgisi girilmedi" }
    ],
    hours: { enabled: true, start: "08:30", end: "16:00", days: [1, 2, 3, 4, 5] },
    emergency: { active: false, title: "", text: "", color: "red", icon: "alert", minutes: 0, nonce: 0, startedAt: 0, until: 0 },
    emergencyPresets: [
      { name: "Deprem tatbikatı", title: "DEPREM TATBİKATI", text: "Çök – Kapan – Tutun! Sakin olun, öğretmeninizin yönlendirmesini bekleyin.", color: "orange", icon: "alert", minutes: 10 },
      { name: "Tahliye / yangın", title: "TAHLİYE", text: "Sınıflar sırayla ve sakin şekilde toplanma alanına çıkıyor. Öğretmeninizi takip edin.", color: "red", icon: "alert", minutes: 15 },
      { name: "Erken çıkış", title: "ERKEN ÇIKIŞ DUYURUSU", text: "Bugün dersler erken sona erecektir. Ayrıntılar için sınıf öğretmeninize başvurun.", color: "blue", icon: "info", minutes: 0 },
      { name: "Veli toplantısı", title: "VELİ TOPLANTISI", text: "Veli toplantısı bugün yapılacaktır. Velilerimiz sınıflarında beklenmektedir.", color: "green", icon: "bell", minutes: 0 }
    ],
    honor: { enabled: false, title: "Onur Köşesi", cleanLabel: "Ayın En Temiz Sınıfı", cleanName: "", cleanNote: "", studentLabel: "Ayın Öğrencisi", studentName: "", studentClass: "", studentNote: "" },
    media: []
  };
}
function b64(s) { return Buffer.from(s, "utf8").toString("base64"); }

/* ---------------- Durumu oku / yaz ---------------- */
function mergeDefaultsServer(parsed) {
  var d2 = defaultState();
  for (var k in d2) {
    if (!(k in parsed) || parsed[k] === null || parsed[k] === undefined) parsed[k] = d2[k];
    else if (d2[k] && typeof d2[k] === "object" && !Array.isArray(d2[k])) {
      if (typeof parsed[k] !== "object" || Array.isArray(parsed[k])) parsed[k] = d2[k];
      else for (var sk in d2[k]) { if (!(sk in parsed[k])) parsed[k][sk] = d2[k][sk]; }
    } else if (Array.isArray(d2[k]) && !Array.isArray(parsed[k])) parsed[k] = d2[k];
  }
  return parsed;
}
function readStateFile(file) { return mergeDefaultsServer(JSON.parse(fs.readFileSync(file, "utf8"))); }
function loadState() {
  if (!fs.existsSync(STATE_FILE) && !fs.existsSync(STATE_FILE + ".bak")) { var d = defaultState(); writeStateAtomic(d); return d; }
  try { return readStateFile(STATE_FILE); }
  catch (e) {
    console.log("[Uyarı] state.json okunamadı (" + e.message + "); yedekten (state.json.bak) dönülüyor.");
    try { return readStateFile(STATE_FILE + ".bak"); } catch (e2) { console.log("[Uyarı] Yedek de okunamadı; varsayılan ayarlarla başlanıyor."); return defaultState(); }
  }
}
/* Ani elektrik kesintisinde dosyanın yarım kalmaması için: önce geçici dosyaya yaz, sonra yer değiştir; bir önceki sürümü .bak olarak sakla */
function writeStateAtomic(st) {
  var tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(st, null, 2));
  try { if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, STATE_FILE + ".bak"); } catch (e) {}
  fs.renameSync(tmp, STATE_FILE);
}
/* Durum sürümü: her kayıtta artar. Ekranlar son gördükleri sürümü (?v=) gönderir; değişmediyse sunucu tüm durumu
   (logo base64 dahil, yüzlerce KB olabilir) yeniden serileştirip göndermek yerine küçük bir {same:1} yanıtı döner. */
var stateVer = Date.now(), pubCache = null;
function saveState(st) {
  stateVer++; pubCache = null;
  try { writeStateAtomic(st); } catch (e) { console.log("[Hata] Ayarlar kaydedilemedi: " + e.message); }
}
function publicStateJson() {
  var yt = !!findTool("yt-dlp");
  if (pubCache && pubCache.ver === stateVer && pubCache.yt === yt) return pubCache.json;
  var pub = Object.assign({}, state);
  pub.auth = { user: state.auth.user }; // yalnızca kullanıcı adı; parola özeti asla gönderilmez
  pub.ytStream = yt;
  pub.v = stateVer + (yt ? "y" : "n");
  pubCache = { ver: stateVer, yt: yt, json: JSON.stringify(pub) };
  return pubCache.json;
}

var state = loadState();
var tokens = {}; // oturum jetonları (birden fazla yönetici aynı anda giriş yapabilir): token -> bitiş zamanı
var TOKEN_TTL = 12 * 60 * 60 * 1000;
function newToken() {
  var t = crypto.randomBytes(16).toString("hex"); tokens[t] = Date.now() + TOKEN_TTL;
  Object.keys(tokens).forEach(function (k) { if (tokens[k] < Date.now()) delete tokens[k]; });
  return t;
}
/* Parola: scrypt + tuz ile saklanır. Eski sürümlerden kalan base64 kayıtlar ilk başarılı girişte otomatik yükseltilir. */
function hashPass(plain) {
  var salt = crypto.randomBytes(16).toString("hex");
  return "scrypt$" + salt + "$" + crypto.scryptSync(String(plain), salt, 32).toString("hex");
}
function safeEq(a, b) {
  var x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function verifyPass(stored, plain) {
  stored = String(stored || ""); plain = String(plain == null ? "" : plain);
  if (stored.indexOf("scrypt$") === 0) {
    var p = stored.split("$");
    return p.length === 3 && safeEq(crypto.scryptSync(plain, p[1], 32).toString("hex"), p[2]);
  }
  return safeEq(b64(plain), stored); /* eski biçim */
}
var loginFails = {}; // IP -> { n, until }

/* Medya listesinin tek doğru kaynağı sunucudur: yönetim sayfası eski bir listeyle kaydetse bile silinen medya geri gelmez,
   yeni yüklenenler kaybolmaz. İstemciden yalnızca sıra ve düzenlenebilir alanlar (süre, açıklama, ses, döngü) alınır. */
function mergeMedia(serverList, incoming) {
  var byId = {}; (serverList || []).forEach(function (m) { byId[m.id] = m; });
  var out = [], used = {};
  (Array.isArray(incoming) ? incoming : []).forEach(function (m) {
    if (!m || !byId[m.id] || used[m.id]) return;
    var base = byId[m.id]; used[m.id] = true;
    ["duration", "caption", "sound", "soundAuto", "loop"].forEach(function (k) { if (m[k] !== undefined) base[k] = m[k]; });
    out.push(base);
  });
  (serverList || []).forEach(function (m) { if (!used[m.id]) out.push(m); });
  return out;
}
/* Otomatik hava durumunu sunucu kendisi çeker; yönetim sayfasından gelen eski kopya daha yeni değerlerin üzerine yazmasın */
function mergeWeather(cur, inc) {
  inc = inc && typeof inc === "object" ? inc : cur;
  if (inc.auto !== false && cur && cur.lastUpdated && (!inc.lastUpdated || cur.lastUpdated > inc.lastUpdated)) {
    var out = JSON.parse(JSON.stringify(cur)); out.auto = inc.auto; return out;
  }
  return inc;
}

/* ---------------- Yardımcılar ---------------- */
function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" }, headers || {}));
  res.end(body);
}
function sendJson(res, code, obj) { send(res, code, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8" }); }
var MAX_JSON = 30 * 1024 * 1024;        // ayarlar/menü dosyası (logo dahil)
var MAX_UPLOAD = 2 * 1024 * 1024 * 1024; // tek istekte medya yükleme üst sınırı
function readBody(req, cb, limit) {
  var chunks = [], size = 0, dead = false;
  limit = limit || MAX_JSON;
  var res = req._res;
  req.on("data", function (c) {
    if (dead) return;
    size += c.length;
    if (size > limit) {
      dead = true; chunks = [];
      if (res && !res.headersSent) { res.writeHead(413, { "Content-Type": "application/json; charset=utf-8", "Connection": "close" }); res.end(JSON.stringify({ ok: false, error: "Dosya çok büyük." })); }
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", function () { if (!dead) cb(Buffer.concat(chunks)); });
  req.on("error", function () { dead = true; });
}
/* ---- yt-dlp / ffmpeg yardımcıları ---- */
var childProcess = require("child_process");
/* Bulunamayan araç da önbelleğe alınır (60 sn). Önceden "yok" sonucu hiç saklanmadığından her /api/state isteğinde
   (her TV, 15 sn'de bir) spawnSync çalışıyor ve tüm sunucu döngüsünü bloke ediyordu. Sonradan klasöre konan exe 1 dk içinde bulunur. */
var toolCache = {}, TOOL_MISS_TTL = 60 * 1000;
function findTool(name) {
  var c = toolCache[name];
  if (c && (c.path || c.exp > Date.now())) return c.path;
  var candidates = [path.join(__dirname, name + ".exe"), path.join(__dirname, name), name];
  for (var i = 0; i < candidates.length; i++) {
    try {
      var r = childProcess.spawnSync(candidates[i], [name === "ffmpeg" ? "-version" : "--version"], { timeout: 8000, windowsHide: true });
      if (!r.error && r.status === 0) { toolCache[name] = { path: candidates[i] }; return candidates[i]; }
    } catch (e) {}
  }
  toolCache[name] = { path: null, exp: Date.now() + TOOL_MISS_TTL }; return null;
}
/* ---- YouTube'u diske indirmeden TV'ye aktarma: yt-dlp doğrudan video adresini bulur, sunucu aktarır ---- */
/* Okul ağı (MEB/FATİH) kök sertifikası: certs/ klasöründeki .pem/.crt dosyaları güvenilir sayılır */
var tlsMod = require("tls");
var extraCa = [];
(function loadExtraCa() {
  var dir = path.join(__dirname, "certs");
  try {
    fs.readdirSync(dir).forEach(function (f) {
      if (!/\.(pem|crt|cer)$/i.test(f)) return;
      var raw = fs.readFileSync(path.join(dir, f));
      var txt = raw.toString("latin1");
      if (txt.indexOf("BEGIN CERTIFICATE") >= 0) {
        (txt.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || []).forEach(function (c) { extraCa.push(c + "\n"); });
      } else { /* DER biçimi */
        extraCa.push("-----BEGIN CERTIFICATE-----\n" + raw.toString("base64").replace(/(.{64})/g, "$1\n") + "\n-----END CERTIFICATE-----\n");
      }
    });
  } catch (e) {}
})();
var caForNode = extraCa.length ? (tlsMod.rootCertificates || []).concat(extraCa) : undefined;
var caBundlePath = null;
if (extraCa.length) {
  try { caBundlePath = path.join(DATA_DIR, "ca-bundle.pem"); fs.writeFileSync(caBundlePath, (tlsMod.rootCertificates || []).concat(extraCa).join("\n")); } catch (e) { caBundlePath = null; }
}
var ytUrlCache = {}, ytPending = {}, ytInsecure = false, ytYtdlpMode = 0;
var YT_VARIANTS = [
  [],
  ["--js-runtimes", "node"],
  ["--js-runtimes", "node", "--extractor-args", "youtube:player_client=tv_embedded,web_safari"],
  ["--js-runtimes", "node", "--extractor-args", "youtube:player_client=mweb"]
];
var ytVariant = 0, ytFail = {};
function ytAuthArgs() {
  var cf = path.join(__dirname, "cookies.txt");
  if (fs.existsSync(cf)) return ["--cookies", cf];
  if (process.env.YT_COOKIES_BROWSER) return ["--cookies-from-browser", process.env.YT_COOKIES_BROWSER];
  return [];
}
function resolveYoutubeUrl(vid0, low, cb) {
  var vid = vid0, key = vid0 + (low ? ":L" : ":H"), hq = !low && !!findTool("ffmpeg");
  var c = ytUrlCache[key];
  if (c && c.exp > Date.now()) return cb(null, c.url);
  var f = ytFail[key];
  if (f && f.exp > Date.now()) return cb(new Error(f.msg));
  if (ytPending[key]) return ytPending[key].push(cb);
  ytPending[key] = [cb];
  var tool = findTool("yt-dlp");
  var done = function (err, url) {
    var l = ytPending[key]; delete ytPending[key];
    if (url) ytUrlCache[key] = { url: url, exp: Date.now() + 25 * 60 * 1000 };
    else ytFail[key] = { msg: err.message, exp: Date.now() + 90 * 1000 }; /* TV her birkaç saniyede yeniden dener; yt-dlp'yi boşuna çalıştırma */
    ytNote(vid0, !!url, url ? (url.indexOf("\n") >= 0 ? "yüksek kalite (ffmpeg birleştirme)" : (low ? "uyumlu mp4 (360p)" : "mp4")) : err.message);
    l.forEach(function (fn) { fn(err, url); });
  };
  if (!tool) return done(new Error("yt-dlp yok"));
  var certRe = /CERTIFICATE_VERIFY_FAILED|certificate verify failed|self[- ]signed certificate/i;
  var botRe = /not a bot|Sign in to confirm/i;
  var firstErr = "";
  /* certMode 0: normal; 1: sistem sertifika deposu + MEB kök sertifikası; 2: doğrulamayı atla (son çare) */
  function run(variant, certMode) {
    var out = "", err = "";
    var fmt = hq ? "bv[vcodec^=avc1][height<=720]+ba[acodec^=mp4a]/b[vcodec^=avc1][acodec^=mp4a][height<=720]/18/b[ext=mp4][height<=720]" : "b[vcodec^=avc1][acodec^=mp4a][height<=720]/18/b[ext=mp4][height<=720]";
    var args = ["-g", "-f", fmt, "--no-playlist", "--no-warnings"];
    if (certMode === 1) args.push("--compat-options", "no-certifi");
    if (certMode === 2) args.push("--no-check-certificates");
    args = args.concat(YT_VARIANTS[variant], ytAuthArgs());
    args.push("https://www.youtube.com/watch?v=" + vid);
    var env = Object.assign({}, process.env);
    if (caBundlePath) { env.SSL_CERT_FILE = caBundlePath; env.REQUESTS_CA_BUNDLE = caBundlePath; }
    var p = childProcess.spawn(tool, args, { windowsHide: true, env: env });
    var t = setTimeout(function () { try { p.kill(); } catch (e) {} }, 30000);
    p.stdout.on("data", function (d) { out += d; });
    p.stderr.on("data", function (d) { err += d; });
    p.on("error", function (e) { clearTimeout(t); done(e); });
    p.on("close", function (code) {
      clearTimeout(t);
      var lines = out.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(function (x) { return /^https?:\/\//.test(x); });
      if (code === 0 && lines.length) { ytYtdlpMode = certMode || ytYtdlpMode; ytVariant = variant; return done(null, lines.slice(0, 2).join("\n")); }
      if (certMode < 2 && certRe.test(err)) {
        console.log("[YouTube] Sertifika hatası; " + (certMode === 0 ? "sistem sertifika deposu ve MEB sertifikasıyla" : "doğrulama atlanarak") + " yeniden deneniyor.");
        return run(variant, certMode + 1);
      }
      var lastLine = (err.trim().split(/\r?\n/).pop() || "adres alınamadı").slice(0, 300);
      if (!firstErr) firstErr = lastLine;
      if (variant < YT_VARIANTS.length - 1) {
        console.log("[YouTube] Yöntem " + (variant + 1) + " başarısız (" + lastLine.slice(0, 120) + "); yöntem " + (variant + 2) + " deneniyor.");
        return run(variant + 1, certMode);
      }
      var msg = botRe.test(firstErr + lastLine)
        ? "YouTube bu ağdan 'bot değilsiniz' doğrulaması istiyor. Çözüm: sunucu klasörüne cookies.txt ekleyin (README bölüm 13)."
        : lastLine.slice(0, 200);
      console.log("[YouTube] " + vid + " adres alınamadı: " + firstErr);
      done(new Error(msg));
    });
  }
  run(ytVariant, ytYtdlpMode);
}
/* YouTube video sunucusundan TV'ye aktarım — PARÇALI.
   TV "bytes=93565-" gibi sonu açık aralıklar ister. Bu isteği YouTube'a aynen iletmek, YouTube'un büyük/sonu açık aralıkları
   kasıtlı yavaşlatmasına takılıyordu: veri damla damla geliyor, TV'deki video donup kalıyordu. Artık TV'ye tek ve kesintisiz bir
   yanıt verilir, ama veri YouTube'dan arka arkada 8 MB'lık KAPALI aralıklarla çekilir (yt-dlp'nin kendi indirme yöntemi).
   Bir parça yarıda koparsa kalınan bayttan en fazla 2 kez yeniden denenir. Diske hiçbir şey yazılmaz. */
var YT_CHUNK = 8 * 1024 * 1024;
var YT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
/* Tek bir aralık isteği (yönlendirme ve okul ağı sertifika geri dönüşüyle); cb(err, yanıt, sonUrl) */
function upstreamGet(url, range, redirects, cb) {
  var mod = url.indexOf("https:") === 0 ? require("https") : require("http");
  var headers = { "User-Agent": YT_UA }; if (range) headers.Range = range;
  var answered = false;
  var up = mod.get(url, { headers: headers, rejectUnauthorized: !ytInsecure, ca: caForNode }, function (r) {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && redirects < 4) { r.resume(); answered = true; return upstreamGet(r.headers.location, range, redirects + 1, cb); }
    answered = true; cb(null, r, url, up);
  });
  up.on("error", function (e) {
    if (answered) return; /* yanıt geldikten sonraki kopuş yanıt akışında ('aborted'/'error') ele alınır */
    if (!ytInsecure && /SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|CERT_/i.test(String(e && e.code))) {
      console.log("[YouTube] Sertifika zinciri doğrulanamadı (okul ağı SSL incelemesi); doğrulama atlanarak yeniden deneniyor.");
      ytInsecure = true; return upstreamGet(url, range, redirects, cb);
    }
    cb(e);
  });
  up.setTimeout(20000, function () { up.destroy(new Error("zaman aşımı (20 sn veri yok)")); });
  return up;
}
function pipeUpstream(url, req, res, redirects, onFail) {
  var rm = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range || ""));
  var start = rm ? +rm[1] : 0, wantEnd = rm && rm[2] !== "" ? +rm[2] : -1;
  var pos = start, end = -1, total = -1, cur = null, closed = false, retries = 0, srcUrl = url;
  res.on("close", function () { closed = true; if (cur) { try { cur.destroy(); } catch (e) {} } });
  function chunkRange() { var last = pos + YT_CHUNK - 1; if (end >= 0 && last > end) last = end; return "bytes=" + pos + "-" + last; }
  function fail(why) {
    if (closed) return;
    if (res.headersSent) {
      if (retries < 2) { retries++; console.log("[YouTube] aktarım kesildi (" + why + "), " + pos + ". bayttan yeniden deneniyor"); return next(); }
      console.log("[YouTube] aktarım kesildi: " + why); try { res.destroy(); } catch (e) {} return;
    }
    console.log("[YouTube] bağlantı hatası: " + why); onFail(0);
  }
  function next() {
    if (closed) return;
    cur = upstreamGet(srcUrl, chunkRange(), redirects, function (err, r, finalUrl) {
      if (closed) { if (r) r.resume(); return; }
      if (err) return fail(err.code || err.message);
      var settled = false; /* bir parçanın sonu tek kez işlenir: 'end', 'error' ve 'aborted' birlikte gelebilir */
      var once = function (fn) { return function (x) { if (settled) return; settled = true; fn(x); }; };
      if (r.statusCode === 416 && !res.headersSent) { r.resume(); res.writeHead(416, { "Content-Range": r.headers["content-range"] || "bytes */*" }); return res.end(); } /* dosya dışı aralık: TV'ye olduğu gibi */
      if (r.statusCode >= 400) { r.resume(); return res.headersSent ? fail("HTTP " + r.statusCode) : onFail(r.statusCode); }
      srcUrl = finalUrl; /* yönlendirme sonrası adres: sonraki parçalar doğrudan oraya */
      if (!res.headersSent) {
        var cr = /\/(\d+)\s*$/.exec(String(r.headers["content-range"] || ""));
        if (r.statusCode !== 206 || !cr) { /* kaynak aralık desteklemiyor: eski davranış, olduğu gibi aktar */
          var h0 = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };
          if (r.headers["content-length"]) h0["Content-Length"] = r.headers["content-length"];
          res.writeHead(r.statusCode, h0); if (req.method === "HEAD") { r.resume(); return res.end(); } return r.pipe(res);
        }
        total = +cr[1]; end = wantEnd >= 0 ? Math.min(wantEnd, total - 1) : total - 1;
        if (start > end) { r.resume(); res.writeHead(416, { "Content-Range": "bytes */" + total }); return res.end(); }
        var h = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Content-Length": end - start + 1 };
        if (rm) h["Content-Range"] = "bytes " + start + "-" + end + "/" + total;
        if (pos === 0 && !rm) console.log("[YouTube] aktarım başladı: " + Math.round(total / 1048576 * 10) / 10 + " MB, " + (YT_CHUNK / 1048576) + " MB'lık parçalarla");
        res.writeHead(rm ? 206 : 200, h);
        if (req.method === "HEAD") { r.resume(); return res.end(); }
      }
      r.on("data", function (c) {
        if (pos + c.length > end + 1) c = c.slice(0, end + 1 - pos); /* fazla gelen veri gönderilmez */
        pos += c.length; retries = 0;
        if (c.length && res.write(c) === false) { r.pause(); res.once("drain", function () { r.resume(); }); } /* TV yavaşsa beklenir; bellek şişmez */
      });
      r.on("end", once(function () { if (closed) return; if (pos > end) return res.end(); next(); }));
      r.on("error", once(function (e) { fail(e.code || e.message); }));
      r.on("aborted", once(function () { fail("kaynak bağlantıyı kesti"); }));
    });
  }
  next();
}
/* Yüksek kalite: ffmpeg.exe varsa ayrı video+ses akışları diske yazmadan, yeniden kodlamadan (-c copy) birleştirilip TV'ye aktarılır */
var ytSrc = {};
function serveMerged(vid, urls, req, res, fallback) {
  var ffmpeg = findTool("ffmpeg"), toks = [];
  var port = server.address().port;
  var local = urls.map(function (u) { var t = crypto.randomBytes(8).toString("hex"); ytSrc[t] = u; toks.push(t); return "http://127.0.0.1:" + port + "/yt-src/" + t; });
  var args = ["-loglevel", "error", "-i", local[0], "-i", local[1], "-map", "0:v:0", "-map", "1:a:0", "-c", "copy",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1"];
  var p = childProcess.spawn(ffmpeg, args, { windowsHide: true });
  var started = false, errTxt = "";
  var cleanup = function () { toks.forEach(function (t) { delete ytSrc[t]; }); };
  p.stderr.on("data", function (d) { errTxt += d; if (errTxt.length > 2000) errTxt = errTxt.slice(-2000); });
  p.stdout.once("data", function () { started = true; });
  p.stdout.on("data", function (chunk) {
    if (!res.headersSent) {
      console.log("[YouTube] yüksek kalite (ffmpeg birleştirme) aktarımı başladı");
      res.writeHead(200, { "Content-Type": "video/mp4", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
    }
    if (res.write(chunk) === false) { p.stdout.pause(); res.once("drain", function () { try { p.stdout.resume(); } catch (e) {} }); } /* TV yavaşsa ffmpeg beklesin; bellek şişmesin */
  });
  p.on("error", function (e) { cleanup(); console.log("[YouTube] ffmpeg çalıştırılamadı: " + e.message); if (!res.headersSent) fallback(); });
  p.on("close", function () {
    cleanup();
    if (!started) { console.log("[YouTube] ffmpeg başarısız (" + errTxt.trim().split(/\r?\n/).pop() + "); düşük kaliteye geçiliyor."); if (!res.headersSent) return fallback(); }
    try { res.end(); } catch (e) {}
  });
  res.on("close", function () { try { p.kill(); } catch (e) {} cleanup(); });
}
/* Son YouTube denemesi: yönetim panelinde (Medya sekmesi) gösterilir; sorun TV'de görünmeden teşhis edilsin */
var ytLast = null;
function ytNote(vid, ok, msg) { ytLast = { vid: vid, ok: ok, msg: String(msg || "").slice(0, 300), at: Date.now() }; }
function serveYoutube(vid, req, res) {
  var tried = false;
  /* ?q=low: TV yüksek kalite (ffmpeg ile birleştirilmiş, boyutu belirsiz) akışı oynatamadıysa düz mp4 ister — en uyumlu biçim */
  var forceLow = /[?&]q=low(?:&|$)/.test(req.url);
  function go(low) {
    resolveYoutubeUrl(vid, low, function (err, joined) {
      if (err) return send(res, 502, "YouTube adresi alınamadı: " + err.message);
      var urls = joined.split("\n");
      if (urls.length === 2 && !low) { /* düşük kalite istendiyse birleştirme yok (geri dönüş döngüsü olmasın): ilk parça */
        if (req.method === "HEAD") { res.writeHead(200, { "Content-Type": "video/mp4" }); return res.end(); }
        return serveMerged(vid, urls, req, res, function () { go(true); });
      }
      pipeUpstream(urls[0], req, res, 0, function (code) {
        console.log("[YouTube] kaynak hatası: " + code);
        ytNote(vid, false, "YouTube video sunucusu yanıt vermedi (HTTP " + code + ")");
        delete ytUrlCache[vid + (low ? ":L" : ":H")];
        if (!tried && !res.headersSent) { tried = true; return go(low); }
        if (!res.headersSent) send(res, 502, "YouTube kaynağı yanıt vermedi (" + code + ")");
      });
    });
  }
  go(forceLow);
}

function requireAuth(req) {
  var token = req.headers["x-auth-token"];
  return !!token && !!tokens[token] && tokens[token] > Date.now();
}
var IMAGE_EXT = { ".jpg": 1, ".jpeg": 1, ".png": 1, ".gif": 1, ".webp": 1, ".bmp": 1 };
var VIDEO_EXT = { ".mp4": 1, ".webm": 1, ".mov": 1, ".m4v": 1 };
var MIME = { ".bmp": "image/bmp", ".m4v": "video/mp4", ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff" };

/* Akışlı multipart/form-data ayrıştırıcı (dış paket kullanmadan).
   Bellekte yalnızca sınır (boundary) uzunluğu kadar kuyruk tutulur; dosya gövdesi doğrudan diske akar.
   Yalnızca görsel/video uzantıları yazılır (güvenlik: .html vb. yüklenip sunulmasın). TV yavaş diske yazarken
   geri basınç (backpressure) uygulanır: disk yetişemezse istek duraklatılır. */
function streamMultipartToDisk(req, boundary, cb) {
  var delim = Buffer.from("\r\n--" + boundary);
  var buf = Buffer.from("\r\n"); // ilk sınırın önünde CRLF yoktur; tek tip arama için eklenir
  var mode = "seek", size = 0, finished = false;
  var files = [], cur = null, pendingWrites = 0, ended = false;

  function fail(err) {
    if (finished) return; finished = true;
    if (cur && cur.ws) { cur.ws.destroy(); }
    files.forEach(function (f) { if (f.id) fs.unlink(path.join(MEDIA_DIR, f.id), function () {}); });
    try { req.resume(); } catch (e) {} // kalan gövde boşaltılır, yanıt gönderilebilsin
    cb(err, []);
  }
  function maybeDone() {
    if (finished || !ended || pendingWrites > 0) return;
    if (mode !== "end") return fail(new Error("Yükleme yarım kaldı."));
    finished = true; cb(null, files);
  }
  function openPart(headerText) {
    var fileMatch = /filename="([^"]*)"/i.exec(headerText);
    cur = { filename: fileMatch ? path.basename(fileMatch[1]) : null, ws: null };
    if (!cur.filename) return; // dosya olmayan form alanı: atlanır
    var ext = path.extname(cur.filename).toLowerCase();
    var kind = IMAGE_EXT[ext] ? "image" : (VIDEO_EXT[ext] ? "video" : null);
    var rec = { filename: cur.filename, id: null, kind: kind };
    files.push(rec);
    if (!kind) return;
    rec.id = crypto.randomBytes(8).toString("hex") + ext;
    pendingWrites++;
    cur.ws = fs.createWriteStream(path.join(MEDIA_DIR, rec.id));
    cur.ws.on("drain", function () { req.resume(); });
    cur.ws.on("error", function () { rec.id = null; });
    cur.ws.on("close", function () { pendingWrites--; maybeDone(); });
  }
  function write(chunk) {
    if (cur && cur.ws && chunk.length && cur.ws.write(chunk) === false) req.pause();
  }
  function closePart() { if (cur && cur.ws) cur.ws.end(); cur = null; }

  req.on("data", function (chunk) {
    if (finished) return;
    size += chunk.length;
    if (size > MAX_UPLOAD) { var e = new Error("Dosya çok büyük."); e.code = 413; return fail(e); }
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      var idx;
      if (mode === "seek") {
        idx = buf.indexOf(delim);
        if (idx < 0) { buf = buf.slice(Math.max(0, buf.length - delim.length + 1)); return; }
        buf = buf.slice(idx + delim.length); mode = "after";
      } else if (mode === "after") {
        if (buf.length < 2) return;
        if (buf[0] === 45 && buf[1] === 45) { mode = "end"; buf = Buffer.alloc(0); return; } // "--": son sınır
        buf = buf.slice(2); mode = "head";
      } else if (mode === "head") {
        idx = buf.indexOf("\r\n\r\n");
        if (idx < 0) { if (buf.length > 16384) fail(new Error("Geçersiz istek.")); return; }
        openPart(buf.slice(0, idx).toString("utf8"));
        buf = buf.slice(idx + 4); mode = "body";
      } else if (mode === "body") {
        idx = buf.indexOf(delim);
        if (idx < 0) {
          var safe = buf.length - delim.length + 1; // sınırın bir kısmı sonda olabilir; o kadarı bekletilir
          if (safe > 0) { write(buf.slice(0, safe)); buf = buf.slice(safe); }
          return;
        }
        write(buf.slice(0, idx)); closePart();
        buf = buf.slice(idx + delim.length); mode = "after";
      } else return; // "end": kapanış sonrası epilog yok sayılır
    }
  });
  req.on("end", function () { ended = true; if (cur) closePart(); maybeDone(); });
  req.on("aborted", function () { fail(new Error("Yükleme iptal edildi.")); });
  req.on("error", function () { fail(new Error("Yükleme hatası.")); });
}

/* ---------------- Ağ bilgisi ---------------- */
function getLanAddresses() {
  var ifaces = os.networkInterfaces();
  var out = [];
  Object.keys(ifaces).forEach(function (name) {
    (ifaces[name] || []).forEach(function (i) {
      if (i.family === "IPv4" && !i.internal) out.push({ iface: name, ip: i.address });
    });
  });
  return out;
}

/* ---------------- Acil duyuru süresi + ekran durumu ---------------- */
function emergencyTick() {
  var em = state.emergency;
  if (em && em.active && em.until && Date.now() > em.until) { em.active = false; em.until = 0; saveState(state); }
}
setInterval(emergencyTick, 10000);
var clients = {}; // id -> { id, ip, kind, mode, ver, at, since }
function noteClient(req) {
  try {
    var qs = req.url.indexOf("?") >= 0 ? req.url.slice(req.url.indexOf("?") + 1) : "", q = {};
    qs.split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) { try { q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) {} } });
    if (!q.c) return; // yalnızca kendini tanıtan ekranlar (tv/pc)
    var id = String(q.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || (req.socket.remoteAddress || "?");
    var ip = String(req.socket.remoteAddress || "?").replace(/^::ffff:/, "");
    var c = clients[id] || (clients[id] = { id: id, since: Date.now() });
    c.ip = ip; c.kind = q.c === "tv" ? "tv" : "pc"; c.mode = q.m === "sleep" ? "sleep" : "on"; c.at = Date.now();
    c.errs = Math.max(0, Math.min(999, parseInt(q.e, 10) || 0));
    var ids = Object.keys(clients);
    if (ids.length > 50) ids.forEach(function (k) { if (Date.now() - clients[k].at > 7 * 86400000) delete clients[k]; });
  } catch (e) {}
}

/* ---------------- Günlük otomatik yedek (ayarlar) ---------------- */
var BACKUP_DIR = path.join(DATA_DIR, "backups");
function dailyBackup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    var d = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
    var f = path.join(BACKUP_DIR, "state-" + d + ".json");
    if (!fs.existsSync(f) && fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, f);
    var all = fs.readdirSync(BACKUP_DIR).filter(function (n) { return /^state-\d{4}-\d{2}-\d{2}\.json$/.test(n); }).sort();
    while (all.length > 14) { try { fs.unlinkSync(path.join(BACKUP_DIR, all.shift())); } catch (e) { break; } }
  } catch (e) { console.log("[Yedek] alınamadı: " + e.message); }
}
setTimeout(dailyBackup, 5000);
setInterval(dailyBackup, 6 * 60 * 60 * 1000);

/* ---------------- HTTP sunucusu ---------------- */
var server = http.createServer(function (req, res) {
  req._res = res;
  var urlPath;
  try { urlPath = decodeURIComponent(req.url.split("?")[0]); }
  catch (e) { return send(res, 400, "Geçersiz adres"); }

  /* ---- API ---- */
  if (urlPath === "/api/state" && req.method === "GET") {
    noteClient(req);
    emergencyTick();
    var body = publicStateJson();
    var known = /(?:^|[?&])v=([0-9]+[yn])(?:&|$)/.exec(req.url);
    if (known && known[1] === pubCache.ver + (pubCache.yt ? "y" : "n")) body = '{"same":1,"v":"' + known[1] + '"}';
    return send(res, 200, body, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  }

  if (urlPath === "/api/state" && req.method === "POST") {
    if (!requireAuth(req)) return sendJson(res, 401, { ok: false, error: "Yetkisiz." });
    return readBody(req, function (buf) {
      try {
        var incoming = JSON.parse(buf.toString("utf8"));
        if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) throw new Error("bad");
        incoming = mergeDefaultsServer(incoming);
        delete incoming.v; delete incoming.ytStream; delete incoming.same; // yalnızca yanıtta üretilen alanlar; dosyaya yazılmasın
        incoming.auth = state.auth; // parola bu uçtan asla değişmez (ayrı uç: /api/account)
        incoming.emergency = state.emergency; // acil duyuru yalnızca /api/emergency ile değişir (eski bir sekme yeniden açamasın)
        if (!Array.isArray(incoming.emergencyPresets)) incoming.emergencyPresets = state.emergencyPresets;
        if (incoming.emergencyPresets.length > 30) incoming.emergencyPresets = incoming.emergencyPresets.slice(0, 30);
        incoming.media = mergeMedia(state.media, incoming.media);
        incoming.weather = mergeWeather(state.weather, incoming.weather);
        state = incoming;
        saveState(state);
        send(res, 200, publicStateJson(), { "Content-Type": "application/json; charset=utf-8" });
      } catch (e) { sendJson(res, 400, { ok: false, error: "Geçersiz veri." }); }
    });
  }

  if (urlPath === "/api/menu/import" && req.method === "POST") {
    if (!requireAuth(req)) return sendJson(res, 401, { ok: false, error: "Yetkisiz. Lütfen yeniden giriş yapın." });
    var q = (req.url.split("?")[1] || "").match(/(?:^|&)name=([^&]*)/);
    var fname = q ? decodeURIComponent(q[1]) : "";
    return readBody(req, function (buf) {
      try {
        var r = require("./menu-import.js").importMenu(buf, fname);
        sendJson(res, 200, { ok: true, menu: r.menu, hasDate: r.hasDate, trimmed: r.trimmed });
      } catch (e) { sendJson(res, 400, { ok: false, error: e.message || "Dosya okunamadı." }); }
    });
  }

  if (urlPath === "/api/duty/import" && req.method === "POST") {
    if (!requireAuth(req)) return sendJson(res, 401, { ok: false, error: "Yetkisiz. Lütfen yeniden giriş yapın." });
    var dq = (req.url.split("?")[1] || "").match(/(?:^|&)name=([^&]*)/);
    var dname = dq ? decodeURIComponent(dq[1]) : "";
    return readBody(req, function (buf) {
      try {
        var r = require("./menu-import.js").importDuty(buf, dname);
        sendJson(res, 200, { ok: true, duty: r.duty, weekly: r.weekly });
      } catch (e) { sendJson(res, 400, { ok: false, error: e.message || "Dosya okunamadı." }); }
    });
  }

  if (urlPath === "/api/login" && req.method === "POST") {
    var ip = (req.socket.remoteAddress || "?");
    var lf = loginFails[ip];
    if (lf && lf.until > Date.now()) return sendJson(res, 429, { ok: false, error: "Çok fazla hatalı deneme. Birkaç dakika sonra tekrar deneyin." });
    return readBody(req, function (buf) {
      try {
        var body = JSON.parse(buf.toString("utf8"));
        if (safeEq(body.user || "", state.auth.user) && verifyPass(state.auth.pass, body.pass)) {
          delete loginFails[ip];
          if (String(state.auth.pass).indexOf("scrypt$") !== 0) { state.auth.pass = hashPass(body.pass); saveState(state); } /* eski kaydı yükselt */
          sendJson(res, 200, { ok: true, token: newToken() });
        } else {
          var f = loginFails[ip] || (loginFails[ip] = { n: 0, until: 0 });
          f.n++; if (f.n >= 8) { f.until = Date.now() + 5 * 60 * 1000; f.n = 0; }
          sendJson(res, 401, { ok: false });
        }
      } catch (e) { sendJson(res, 400, { ok: false }); }
    }, 64 * 1024);
  }

  if (urlPath === "/api/account" && req.method === "POST") {
    if (!requireAuth(req)) return sendJson(res, 401, { ok: false, error: "Yetkisiz." });
    return readBody(req, function (buf) {
      try {
        var body = JSON.parse(buf.toString("utf8"));
        if (!verifyPass(state.auth.pass, body.currentPass)) return sendJson(res, 400, { ok: false, error: "Mevcut şifre yanlış." });
        if (!body.newUser) return sendJson(res, 400, { ok: false, error: "Kullanıcı adı boş olamaz." });
        state.auth.user = String(body.newUser).slice(0, 64);
        if (body.newPass) state.auth.pass = hashPass(body.newPass);
        saveState(state);
        sendJson(res, 200, { ok: true });
      } catch (e) { sendJson(res, 400, { ok: false }); }
    }, 64 * 1024);
  }

  if (urlPath === "/api/logout" && req.method === "POST") { var lt = req.headers["x-auth-token"]; if (lt) delete tokens[lt]; return sendJson(res, 200, { ok: true }); }

  /* ---- Acil duyuru ---- */
  if (urlPath === "/api/emergency" && req.method === "POST") {
    if (!requireAuth(req)) return sendJson(res, 401, { ok: false, error: "Yetkisiz." });
    return readBody(req, function (buf) {
      try {
        var b = JSON.parse(buf.toString("utf8")), em = state.emergency;
        if (b.action === "stop") { em.active = false; em.until = 0; }
        else if (b.action === "start") {
          var colors = { red: 1, orange: 1, blue: 1, green: 1, yellow: 1 }, icons = { alert: 1, info: 1, bell: 1, check: 1, mega: 1, school: 1 };
          em.title = String(b.title || "").slice(0, 80); em.text = String(b.text || "").slice(0, 600);
          em.color = colors[b.color] ? b.color : "red"; em.icon = icons[b.icon] ? b.icon : "alert";
          em.minutes = Math.max(0, Math.min(1440, Number(b.minutes) || 0));
          em.active = true; em.nonce = Date.now(); em.startedAt = Date.now(); em.until = em.minutes > 0 ? Date.now() + em.minutes * 60000 : 0;
          if (!em.title && !em.text) return sendJson(res, 400, { ok: false, error: "Başlık veya metin girin." });
        } else return sendJson(res, 400, { ok: false });
        saveState(state);
        sendJson(res, 200, { ok: true, emergency: em });
      } catch (e) { sendJson(res, 400, { ok: false }); }
    }, 64 * 1024);
  }

  /* ---- Ekran durumu (TV'ler yoklama sırasında kendini bildirir) ---- */
  if (urlPath === "/api/clients" && req.method === "GET") {
    if (!requireAuth(req)) return sendJson(res, 401, { ok: false, error: "Yetkisiz." });
    var list = Object.keys(clients).map(function (k) { return clients[k]; }).sort(function (a, b) { return b.at - a.at; });
    return sendJson(res, 200, { ok: true, now: Date.now(), clients: list });
  }

  if (urlPath === "/api/network-info" && req.method === "GET") {
    return sendJson(res, 200, { addresses: getLanAddresses(), port: server.address().port });
  }

  /* ---- YouTube -> sunucuda mp4 olarak indir (eski TV tarayıcıları YouTube oynatamaz; mp4 sorunsuz oynar) ---- */
  if (urlPath === "/api/yt/status" && req.method === "GET") {
    return sendJson(res, 200, { ytdlp: !!findTool("yt-dlp"), ffmpeg: !!findTool("ffmpeg"), cookies: fs.existsSync(path.join(__dirname, "cookies.txt")), last: ytLast });
  }
  var ysm = /^\/yt-src\/([a-f0-9]{16})$/.exec(urlPath);
  if (ysm) {
    var ra = req.socket.remoteAddress || "";
    if (!/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ra) || !ytSrc[ysm[1]]) return send(res, 404, "Bulunamadı");
    return pipeUpstream(ytSrc[ysm[1]], req, res, 0, function () { if (!res.headersSent) send(res, 502, "kaynak hatası"); });
  }
  var ytm = /^\/yt\/([a-zA-Z0-9_-]{11})\.mp4$/.exec(urlPath);
  if (ytm && (req.method === "GET" || req.method === "HEAD")) {
    var known = state.media.some(function (m) { return m.type === "youtube" && m.youtubeId === ytm[1]; });
    if (!known || !findTool("yt-dlp")) return send(res, 404, "Bulunamadı");
    return serveYoutube(ytm[1], req, res);
  }

  if (urlPath === "/api/media" && req.method === "POST") {
    if (!requireAuth(req)) return sendJson(res, 401, { ok: false, error: "Yetkisiz." });
    var ct = req.headers["content-type"] || "";
    var boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct);
    if (!boundaryMatch) return sendJson(res, 400, { ok: false, error: "Geçersiz istek." });
    var boundary = boundaryMatch[1] || boundaryMatch[2];
    /* Akışlı yükleme: dosya parça parça doğrudan diske yazılır. Eskiden tüm istek (2 GB'a kadar) RAM'de birleştiriliyordu;
       büyük bir video Node sürecini bellek yetersizliğinden çökertebiliyordu. */
    return streamMultipartToDisk(req, boundary, function (err, files) {
      if (err) return sendJson(res, err.code === 413 ? 413 : 400, { ok: false, error: err.message });
      var added = [], rejected = [];
      files.forEach(function (f) {
        if (!f.id) { rejected.push(f.filename); return; }
        var item = { id: f.id, type: f.kind, name: f.filename, duration: f.kind === "video" ? 0 : 8, caption: "", url: "/media/" + f.id };
        state.media.push(item);
        added.push(item);
      });
      if (added.length) saveState(state);
      sendJson(res, 200, { ok: true, added: added, rejected: rejected, media: state.media });
    });
  }

  if (urlPath === "/api/media/link" && req.method === "POST") {
    if (!requireAuth(req)) return sendJson(res, 401, { ok: false, error: "Yetkisiz." });
    return readBody(req, function (buf) {
      try {
        var body = JSON.parse(buf.toString("utf8"));
        if (body.type !== "youtube" || !/^[a-zA-Z0-9_-]{11}$/.test(body.youtubeId || "")) {
          return sendJson(res, 400, { ok: false, error: "Geçersiz YouTube kimliği." });
        }
        var item = { id: "yt" + crypto.randomBytes(6).toString("hex"), type: "youtube", youtubeId: body.youtubeId,
          name: body.name || "YouTube video", duration: body.duration || 60, caption: "" };
        state.media.push(item);
        saveState(state);
        sendJson(res, 200, { ok: true, added: item, media: state.media });
      } catch (e) { sendJson(res, 400, { ok: false, error: "Geçersiz veri." }); }
    });
  }

  var delMatch = /^\/api\/media\/([a-zA-Z0-9_.-]+)$/.exec(urlPath);
  if (delMatch && req.method === "DELETE") {
    if (!requireAuth(req)) return sendJson(res, 401, { ok: false, error: "Yetkisiz." });
    var fid = delMatch[1];
    state.media = state.media.filter(function (m) { return m.id !== fid; });
    saveState(state);
    fs.unlink(path.join(MEDIA_DIR, path.basename(fid)), function () {});
    return sendJson(res, 200, { ok: true, media: state.media });
  }

  /* ---- Statik dosyalar: yüklenen medya ---- */
  if (urlPath.indexOf("/media/") === 0) {
    var mediaPath = path.join(MEDIA_DIR, path.basename(urlPath));
    return fs.stat(mediaPath, function (err, st) {
      if (err || !st.isFile()) return send(res, 404, "Bulunamadı");
      var type = MIME[path.extname(mediaPath).toLowerCase()] || "application/octet-stream";
      var size = st.size, start = 0, end = size - 1, code = 200;
      var rg = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
      if (rg && (rg[1] !== "" || rg[2] !== "")) {
        if (rg[1] === "") { start = Math.max(0, size - parseInt(rg[2], 10)); }       // son N bayt
        else { start = parseInt(rg[1], 10); if (rg[2] !== "") end = Math.min(end, parseInt(rg[2], 10)); }
        if (start > end || start >= size) {
          res.writeHead(416, { "Content-Range": "bytes */" + size });
          return res.end();
        }
        code = 206;
      }
      var h = { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": end - start + 1,
        "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" };
      if (code === 206) h["Content-Range"] = "bytes " + start + "-" + end + "/" + size;
      res.writeHead(code, h);
      if (req.method === "HEAD") return res.end();
      var rs = fs.createReadStream(mediaPath, { start: start, end: end });
      rs.on("error", function () { res.destroy(); });
      res.on("close", function () { rs.destroy(); });
      rs.pipe(res);
    });
  }

  /* ---- Statik dosyalar: arayüz (public/) ---- */
  // Eski TV tarayicilari (Opera TV / Chromium < 70) icin uyumlu sayfa: /tv veya otomatik
  var ua = String(req.headers["user-agent"] || "");
  var cm = /Chrome\/(\d+)/.exec(ua);
  var oldTv = /HbbTV|Opera TV|SmartTvA|VSTVB|Tizen|Web0S|NetCast/i.test(ua) || (cm && parseInt(cm[1], 10) < 70);
  var filePath = urlPath === "/tv" ? "/tv.html" : (urlPath === "/" ? (oldTv ? "/tv.html" : "/index.html") : urlPath);
  var full = path.join(PUBLIC_DIR, filePath);
  if (full !== PUBLIC_DIR && full.indexOf(PUBLIC_DIR + path.sep) !== 0) return send(res, 403, "Yasak");
  fs.readFile(full, function (err, data) {
    if (err) {
      // SPA: bilinmeyen yollar için ana sayfayı döndür
      return fs.readFile(path.join(PUBLIC_DIR, "index.html"), function (e2, d2) {
        if (e2) return send(res, 404, "Bulunamadı");
        send(res, 200, d2, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      });
    }
    var isFont = /\.woff2?$/i.test(full);
    send(res, 200, data, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream", "Cache-Control": isFont ? "public, max-age=604800" : "no-cache" });
  });
});

/* Büyük video yüklemeleri 5 dakikadan uzun sürebilir; Node'un varsayılan istek zaman aşımını kaldır */
server.requestTimeout = 0;
server.headersTimeout = 60000;
/* Beklenmedik bir hata tüm panoyu kapatmasın: kaydet ve çalışmaya devam et */
process.on("uncaughtException", function (e) { console.log("[Hata] " + (e && e.stack || e)); });
process.on("unhandledRejection", function (e) { console.log("[Hata] " + (e && e.stack || e)); });

/* ---------------- Hava durumu (sunucu tarafı) ----------------
   TV'ler ve yönetim sayfası kapalı olsa bile hava durumu güncel kalsın diye sunucu kendisi çeker (Zonguldak, Open-Meteo).
   Okul ağındaki SSL incelemesi için certs/ klasöründeki kök sertifikalar kullanılır; olmazsa doğrulama atlanır. */
var WX_URL = "https://api.open-meteo.com/v1/forecast?latitude=41.4564&longitude=31.7987&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FIstanbul";
var WMO = { 0: ["Açık", "i-sun"], 1: ["Az bulutlu", "i-cloud-sun"], 2: ["Parçalı bulutlu", "i-cloud-sun"], 3: ["Bulutlu", "i-cloud"], 45: ["Sisli", "i-cloud"], 48: ["Kırağı sisi", "i-cloud"],
  51: ["Hafif çisenti", "i-cloud-rain"], 53: ["Çisenti", "i-cloud-rain"], 55: ["Yoğun çisenti", "i-cloud-rain"], 56: ["Donan çisenti", "i-cloud-rain"], 57: ["Yoğun donan çisenti", "i-cloud-rain"],
  61: ["Hafif yağmurlu", "i-cloud-rain"], 63: ["Yağmurlu", "i-cloud-rain"], 65: ["Kuvvetli yağmurlu", "i-cloud-rain"], 66: ["Donan yağmur", "i-cloud-rain"], 67: ["Kuvvetli donan yağmur", "i-cloud-rain"],
  71: ["Hafif kar yağışlı", "i-cloud-snow"], 73: ["Kar yağışlı", "i-cloud-snow"], 75: ["Kuvvetli kar yağışlı", "i-cloud-snow"], 77: ["Kar taneli", "i-cloud-snow"],
  80: ["Hafif sağanak", "i-cloud-rain"], 81: ["Sağanak yağışlı", "i-cloud-rain"], 82: ["Kuvvetli sağanak", "i-cloud-rain"], 85: ["Hafif kar sağanağı", "i-cloud-snow"], 86: ["Kuvvetli kar sağanağı", "i-cloud-snow"],
  95: ["Gök gürültülü sağanak", "i-cloud-rain"], 96: ["Dolulu gök gürültülü sağanak", "i-cloud-rain"], 99: ["Kuvvetli dolulu fırtına", "i-cloud-rain"] };
var wxInsecure = false;
function refreshWeather() {
  if (!state.weather || state.weather.auto === false) return;
  var req = require("https").get(WX_URL, { rejectUnauthorized: !wxInsecure, ca: caForNode, headers: { "User-Agent": "okul-pano" } }, function (r) {
    var chunks = [];
    r.on("data", function (c) { chunks.push(c); });
    r.on("end", function () {
      try {
        if (r.statusCode !== 200) throw new Error("HTTP " + r.statusCode);
        var d = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        var info = WMO[d.current.weather_code] || ["Parçalı bulutlu", "i-cloud-sun"];
        if (!state.weather || state.weather.auto === false) return;
        state.weather.cond = info[0]; state.weather.icon = info[1];
        state.weather.temp = Math.round(d.current.temperature_2m); state.weather.feels = Math.round(d.current.apparent_temperature);
        state.weather.max = Math.round(d.daily.temperature_2m_max[0]); state.weather.min = Math.round(d.daily.temperature_2m_min[0]);
        state.weather.lastUpdated = Date.now(); state.weather.source = "Open-Meteo";
        saveState(state);
      } catch (e) { console.log("[Hava durumu] güncellenemedi: " + e.message); }
    });
  });
  req.on("error", function (e) {
    if (!wxInsecure && /SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|CERT_/i.test(String(e && e.code))) { wxInsecure = true; return refreshWeather(); }
    console.log("[Hava durumu] bağlantı hatası: " + (e && (e.code || e.message)));
  });
  req.setTimeout(15000, function () { req.destroy(); });
}
setTimeout(refreshWeather, 3000);
setInterval(refreshWeather, 30 * 60 * 1000);

/* ---------------- Boş port bulma + başlatma ---------------- */
server.on("listening", function () {
  var port = server.address().port;
  var addrs = getLanAddresses();
  console.log("");
  console.log("=======================================================");
  console.log("  Okul Dijital Pano sunucusu çalışıyor");
  console.log("=======================================================");
  if (addrs.length === 0) {
    console.log("  Bu bilgisayarın bir yerel ağ (LAN/Wi-Fi) IP'si bulunamadı.");
    console.log("  Aynı bilgisayarda test için: http://localhost:" + port);
  } else {
    console.log("  Aynı ağdaki TV/akıllı tahta tarayıcısında şu adres(ler)i açın:");
    addrs.forEach(function (a) { console.log("    -> http://" + a.ip + ":" + port + "   (" + a.iface + ")"); });
  }
  console.log("");
  console.log("  Yönetim paneline de aynı adresten, sağ üstteki dişli");
  console.log("  ikonuyla giriş yapabilirsiniz (varsayılan: admin / admin123).");
  console.log("=======================================================");
  console.log("");
});

/* Boş port arama: PREFERRED_PORT'tan başlayıp ilk boş portu bulur, sonra gerçek sunucuyu orada başlatır. */
function findFreePortAndStart(port) {
  var tester = http.createServer();
  tester.once("error", function (err) {
    if (err.code === "EADDRINUSE") { findFreePortAndStart(port + 1); }
    else { console.error(err); }
  });
  tester.once("listening", function () {
    tester.close(function () { server.listen(port); });
  });
  tester.listen(port);
}
server.on("error", function (err) {
  if (err.code === "EADDRINUSE") { findFreePortAndStart(server.address() ? server.address().port + 1 : PREFERRED_PORT + 1); }
  else { console.error("Sunucu hatası:", err); }
});
findFreePortAndStart(PREFERRED_PORT);

