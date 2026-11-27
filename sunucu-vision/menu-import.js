/* Yemek listesi içe aktarma: .xlsx, .docx, .csv, .txt  (dış paket yok; yalnızca Node'un kendi modülleri) */
"use strict";
var zlib = require("zlib");

var DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
var DAY_KEYS = ["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"];
var MONTHS = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];

function fold(s) {
  return String(s == null ? "" : s).replace(/İ/g, "i").replace(/I/g, "i").toLowerCase()
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u");
}
function clean(s) { return String(s == null ? "" : s).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, ", ").replace(/^[\s,]+|[\s,]+$/g, ""); }

/* ---------- ZIP okuyucu ---------- */
function readZip(buf) {
  var eocd = -1, i;
  for (i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Dosya geçerli bir Word/Excel dosyası değil.");
  var count = buf.readUInt16LE(eocd + 10), off = buf.readUInt32LE(eocd + 16), files = {};
  for (i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    var method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    var nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    var lho = buf.readUInt32LE(off + 42);
    var name = buf.slice(off + 46, off + 46 + nlen).toString("utf8");
    files[name] = { method: method, csize: csize, lho: lho };
    off += 46 + nlen + elen + clen;
  }
  return {
    has: function (n) { return !!files[n]; },
    names: function () { return Object.keys(files); },
    read: function (n) {
      var f = files[n]; if (!f) return null;
      var p = f.lho, nl = buf.readUInt16LE(p + 26), el = buf.readUInt16LE(p + 28);
      var data = buf.slice(p + 30 + nl + el, p + 30 + nl + el + f.csize);
      return (f.method === 0 ? data : zlib.inflateRawSync(data, { maxOutputLength: 64 * 1024 * 1024 })).toString("utf8");
    }
  };
}

function xmlText(s) {
  return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); }).replace(/&amp;/g, "&");
}
function collect(re, str, fn) { var m, out = []; re.lastIndex = 0; while ((m = re.exec(str))) out.push(fn(m)); return out; }

/* ---------- XLSX -> ızgara ---------- */
function colIndex(ref) {
  var letters = ref.replace(/[^A-Z]/gi, "").toUpperCase(), n = 0;
  for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}
function serialToDate(n) {
  var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return pad(d.getUTCDate()) + "." + pad(d.getUTCMonth() + 1) + "." + d.getUTCFullYear();
}
function pad(n) { return (n < 10 ? "0" : "") + n; }

function xlsxGrid(zip) {
  var shared = [];
  if (zip.has("xl/sharedStrings.xml")) {
    var sx = zip.read("xl/sharedStrings.xml");
    shared = collect(/<si\b[^>]*>([\s\S]*?)<\/si>/g, sx, function (m) {
      return collect(/<t\b[^>]*>([\s\S]*?)<\/t>/g, m[1], function (t) { return xmlText(t[1]); }).join("");
    });
  }
  var sheets = zip.names().filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); })
    .sort(function (a, b) { return parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10); });
  if (!sheets.length) throw new Error("Excel dosyasında sayfa bulunamadı.");
  /* İlk sayfa boşsa sıradakine bak */
  for (var s = 0; s < sheets.length; s++) {
    var xml = zip.read(sheets[s]), grid = [];
    collect(/<row\b[^>]*>([\s\S]*?)<\/row>/g, xml, function (rm) {
      var row = [];
      var cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cm;
      while ((cm = cellRe.exec(rm[1]))) {
        var attrs = cm[1], inner = cm[2] || "";
        var ref = (/\br="([A-Z]+\d+)"/.exec(attrs) || [])[1];
        var type = (/\bt="(\w+)"/.exec(attrs) || [])[1];
        var ci = ref ? colIndex(ref) : row.length, val = "";
        var v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (type === "s" && v) val = shared[parseInt(v[1], 10)] || "";
        else if (type === "inlineStr") val = collect(/<t\b[^>]*>([\s\S]*?)<\/t>/g, inner, function (t) { return xmlText(t[1]); }).join("");
        else if (v) {
          val = xmlText(v[1]);
          var num = parseFloat(val);
          if (type !== "str" && !isNaN(num) && num > 36526 && num < 73050) val = serialToDate(num);
        }
        row[ci] = clean(val);
      }
      grid.push(row);
    });
    if (grid.some(function (r) { return r.some(function (c) { return c; }); })) return grid;
  }
  return [];
}

/* ---------- DOCX -> ızgara + satırlar ---------- */
function docxParse(zip) {
  if (!zip.has("word/document.xml")) throw new Error("Word dosyasında metin bulunamadı.");
  var xml = zip.read("word/document.xml");
  function paraText(p) {
    var t = p.replace(/<w:tab\s*\/>/g, "<w:t> </w:t>").replace(/<w:br\s*\/>/g, "<w:t>\n</w:t>");
    return collect(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, t, function (m) { return xmlText(m[1]); }).join("");
  }
  var grids = [];
  collect(/<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g, xml, function (tm) {
    var grid = [];
    collect(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g, tm[1], function (rm) {
      var row = collect(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g, rm[1], function (cm) {
        return clean(collect(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, cm[1], function (pm) { return paraText(pm[1]); })
          .filter(function (x) { return x.replace(/\s/g, ""); }).join("\n"));
      });
      grid.push(row);
    });
    grids.push(grid);
  });
  var lines = collect(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, ""), function (pm) { return paraText(pm[1]); })
    .map(clean).filter(function (x) { return x; });
  return { grids: grids, lines: lines };
}

/* ---------- Gün / tarih tanıma ---------- */
function findDay(cell) {
  if (!cell || cell.length > 45) return -1;
  var f = " " + fold(cell).replace(/[^a-z0-9]+/g, " ") + " ";
  for (var i = 0; i < DAY_KEYS.length; i++) {
    if (f.indexOf(" " + DAY_KEYS[i] + " ") >= 0) return i;
  }
  return -1;
}
function findDate(cell) {
  if (!cell || cell.length > 45) return null;
  var m = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4}|\d{2})\b/.exec(cell), d, mo, y;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else if ((m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(cell))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = /\b(\d{1,2})\s+([a-zçğıöşüİ]+)\s*(\d{4})?/i.exec(fold(cell));
    if (!m) return null;
    mo = MONTHS.indexOf(m[2]) + 1; if (!mo) return null;
    d = +m[1]; y = m[3] ? +m[3] : new Date().getFullYear();
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y + "-" + pad(mo) + "-" + pad(d);
}
function isoWeekday(iso) { var p = iso.split("-"); return (new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay() + 6) % 7; }

function isBlankRow(r) { return !r.some(function (c) { return c && String(c).replace(/\s/g, ""); }); }

/* Hücre yalnızca tarih (ve gün adı) mı? "02 Kasım 2026 Pazartesi", "2.11.2026", "Pazartesi 02.11.2026" -> evet;
   "16-20 KASIM 2026 ARA TATİL" -> hayır (içinde başka söz var). */
function isDateHead(cell) {
  if (!cell || cell.length > 40 || !findDate(cell)) return false;
  var f = " " + fold(cell).replace(/[^a-z0-9]+/g, " ") + " ";
  f = f.replace(/\d+/g, " ");
  MONTHS.concat(DAY_KEYS).forEach(function (w) { f = f.split(" " + w + " ").join(" "); });
  return !/[a-z]/.test(f);
}
/* "16-20 KASIM 2026 ARA TATİL" / "16 - 20 Kasım" -> o aralıktaki hafta içi günleri için tatil satırları */
function holidayRows(text) {
  var m = /(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*[.\/\s]\s*([a-zçğıöşü]+|\d{1,2})[.\/\s]*(\d{4})?/i.exec(fold(text));
  if (!m) return [];
  var mo = /^\d+$/.test(m[3]) ? +m[3] : MONTHS.indexOf(m[3]) + 1, y = m[4] ? +m[4] : new Date().getFullYear(), out = [];
  if (mo < 1 || mo > 12) return [];
  for (var d = +m[1]; d <= +m[2] && d <= 31; d++) {
    var iso = y + "-" + pad(mo) + "-" + pad(d), wd = isoWeekday(iso);
    if (wd < 5) out.push({ day: DAYS[wd], date: iso, items: clean(text) });
  }
  return out;
}

/* 0) Aylık takvim (MEB okul yemek listeleri): her hafta bir blok — başta tarih satırı (sütun başına bir gün),
      altında o günlerin yemek satırları; bloklar arasında "ARA TATİL" gibi tek hücrelik not satırları olabilir.
      Örnek: KASIM_TAŞIMALI_YEMEK_MENÜSÜ.docx — 02-06 / 09-13 / [16-20 ARA TATİL] / 23-27 / 30 Kasım. */
function gridToMenuBlocks(grid) {
  var out = [], cols = null, width = 0;
  grid.forEach(function (row) {
    var filled = [], heads = 0, c;
    for (c = 0; c < row.length; c++) { if (row[c]) { filled.push(c); if (isDateHead(row[c])) heads++; } }
    if (!filled.length) return;
    if (heads && heads === filled.length) { /* yeni hafta: tarih satırı */
      cols = {}; width = Math.max(width, row.length);
      filled.forEach(function (ci) {
        var date = findDate(row[ci]), dy = findDay(row[ci]);
        var it = { day: DAYS[dy >= 0 ? dy : isoWeekday(date)], date: date, items: "" };
        cols[ci] = it; out.push(it);
      });
      return;
    }
    /* Tek hücrelik ve tablo genişliğinden dar satır (birleştirilmiş hücre): tatil/not -> haftayı kapat */
    if (filled.length === 1 && row.length < width) {
      holidayRows(row[filled[0]]).forEach(function (h) { out.push(h); });
      cols = null; return;
    }
    if (!cols) return; /* ilk tarih satırından önceki başlık ("KASIM") */
    filled.forEach(function (ci) { var it = cols[ci]; if (it) it.items = it.items ? it.items + ", " + row[ci] : row[ci]; });
  });
  return out;
}

/* ---------- Ortak çözümleyici: ızgara -> [{day, date, items}] ---------- */
function gridToMenu(grid) {
  var out = [], r, c;
  grid = grid.map(function (row) { return (row || []).map(function (x) { return clean(x); }); });

  /* 0) Aylık takvim: en az bir satırda 3+ tarih başlığı ve en az 2 tarih satırı (çok haftalı) */
  var headRows = grid.filter(function (row) {
    var n = 0, f = 0; row.forEach(function (x) { if (x) { f++; if (isDateHead(x)) n++; } });
    return n && n === f;
  });
  if (headRows.length >= 2 && headRows.some(function (row) { return row.filter(isDateHead).length >= 3; })) {
    out = gridToMenuBlocks(grid);
    if (out.length) return out;
  }

  /* 1) Yatay düzen: bir satırda en az 3 gün adı (günler sütun başlığı) */
  for (r = 0; r < Math.min(grid.length, 6); r++) {
    var dayCols = [];
    for (c = 0; c < grid[r].length; c++) { var di = findDay(grid[r][c]); if (di >= 0) dayCols.push({ c: c, day: di, date: findDate(grid[r][c]) }); }
    if (dayCols.length >= 3) {
      dayCols.forEach(function (dc) {
        var parts = [], date = dc.date;
        for (var rr = r + 1; rr < grid.length; rr++) {
          var v = grid[rr][dc.c]; if (!v) continue;
          var dd = findDate(v);
          if (dd && v.length <= 20) { if (!date) date = dd; continue; }
          parts.push(v);
        }
        out.push({ day: DAYS[dc.day], date: date || "", items: parts.join(", ") });
      });
      return out;
    }
  }

  /* 2) Dikey düzen: her satır bir gün */
  grid.forEach(function (row) {
    if (isBlankRow(row)) return;
    var day = -1, date = null, used = {};
    row.forEach(function (cell, i) {
      if (!cell) return;
      var dd = findDate(cell), dy = findDay(cell);
      if (dy >= 0 && day < 0) { day = dy; used[i] = true; }
      if (dd && !date && cell.length <= 30) { date = dd; used[i] = true; }
    });
    if (day < 0 && date) day = isoWeekday(date);
    if (day < 0) return; /* başlık / boş / alakasız satır */
    var items = [];
    row.forEach(function (cell, i) { if (cell && !used[i]) items.push(cell); });
    out.push({ day: DAYS[day], date: date || "", items: items.join(", ") });
  });
  return out;
}

/* ---------- Düz metin (Word paragrafları, .txt) ---------- */
function linesToMenu(lines) {
  var out = [], cur = null;
  lines.forEach(function (line) {
    var head = line.length <= 60 ? line : line.slice(0, 60);
    var dy = findDay(head.split(/[:\-–—]/)[0]), dt = findDate(head.split(/[:\-–—]/)[0]);
    if (dy >= 0 || (dt && line.length < 25)) {
      if (dy < 0) dy = isoWeekday(dt);
      var rest = line.replace(/^[^:\-–—]*[:\-–—]\s*/, "");
      cur = { day: DAYS[dy], date: dt || "", items: (rest !== line ? rest : "") };
      out.push(cur);
    } else if (cur) {
      cur.items = cur.items ? cur.items + ", " + line : line;
    }
  });
  return out;
}

function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  var first = text.split(/\r?\n/)[0] || "";
  var delim = (first.split(";").length > first.split(",").length) ? ";" : (first.indexOf("\t") >= 0 ? "\t" : ",");
  var rows = [], row = [], cell = "", q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows;
}

function importMenu(buf, filename) {
  var ext = (String(filename || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
  var menu = [];
  if (ext === "pdf") {
    var pm = require("./pdf-tablo.js").pdfGrid(buf);
    menu = gridToMenu(pm.grid);
    if (!menu.length) menu = linesToMenu(pm.lines);
  } else if (ext === "xlsx" || ext === "xlsm") {
    menu = gridToMenu(xlsxGrid(readZip(buf)));
  } else if (ext === "docx") {
    var d = docxParse(readZip(buf));
    d.grids.forEach(function (g) { if (!menu.length) menu = gridToMenu(g); });
    if (!menu.length) menu = linesToMenu(d.lines);
  } else if (ext === "csv" || ext === "txt") {
    var text = buf.toString("utf8");
    menu = ext === "csv" ? gridToMenu(parseCsv(text)) : [];
    if (!menu.length) menu = linesToMenu(text.split(/\r?\n/).map(clean).filter(function (x) { return x; }));
  } else if (ext === "xls" || ext === "doc") {
    throw new Error("Eski biçim (." + ext + ") okunamıyor. Dosyayı Word/Excel'de “Farklı kaydet” ile ." + (ext === "xls" ? "xlsx" : "docx") + " olarak kaydedip tekrar deneyin.");
  } else {
    throw new Error("Desteklenen biçimler: .pdf, .xlsx, .docx, .csv, .txt");
  }
  menu = menu.filter(function (m) { return m.items; });
  if (!menu.length) throw new Error("Dosyada gün adı/tarih ve yemek içeren satır bulunamadı. Her satırda bir gün adı (veya tarih) ve yemekler olmalı; örnek şablona bakın.");
  /* Tarihi olmayan listede ilk 7 gün */
  var hasDate = menu.some(function (m) { return m.date; });
  var trimmed = false;
  if (!hasDate && menu.length > 7) { menu = menu.slice(0, 7); trimmed = true; }
  if (menu.length > 120) menu = menu.slice(0, 120);
  return { menu: menu, hasDate: hasDate, trimmed: trimmed };
}

/* ================= Nöbetçi listesi içe aktarma =================
   Desteklenen düzenler (Excel/Word tablosu veya CSV):
   1) Haftalık çizelge, günler sütunda:   Nöbet Yeri | Pazartesi | Salı | ... | Cuma   (hücrelerde öğretmen adları)
   2) Haftalık çizelge, günler satırda:   Gün | Zemin Kat | 1. Kat | Bahçe ...         (başlık satırında nöbet yerleri)
   3) Uzun liste:                         Gün | Nöbet Yeri | Öğretmen   (gün hücresi birleştirilmiş/boş ise üstteki gün sürer)
   4) Günsüz liste:                       Nöbet Yeri | Öğretmen
   Düz metin (Word paragrafları, .txt): "Pazartesi" başlığı + altında "Zemin Kat: Ayşe Yılmaz" satırları, ya da yalnız "Yer: Ad" satırları. */
var LOC_RE = /\b(yer|yeri|konum|bolge|bolum|kat|alan|mekan|nokta|koridor|gorev yeri)\b/;
var NAME_RE = /\b(ogretmen|ogretmenler|ogretmenin|ad|adi|ad soyad|adi soyadi|isim|personel|nobetci|gorevli|sorumlu)\b/;
var DAY_HEAD_RE = /^(gun|gunler|tarih)$/;
function headKind(cell) {
  var f = fold(cell).replace(/[^a-z0-9]+/g, " ").trim();
  if (!f || f.length > 30) return "";
  if (DAY_HEAD_RE.test(f)) return "day";
  if (NAME_RE.test(f)) return "name";
  if (LOC_RE.test(f)) return "loc";
  return "";
}
function dayOf(cell) {
  var d = findDay(cell);
  if (d < 0) { var dt = findDate(cell); if (dt && String(cell).length <= 30) d = isoWeekday(dt); }
  return d;
}
function dutyItem(loc, name, day, date) {
  loc = clean(loc).slice(0, 40); name = clean(name).slice(0, 80);
  if (!name || name === "-" || name === "—") return null;
  var it = { loc: loc, name: name, day: day >= 0 ? DAYS[day] : "" };
  if (date) it.date = date;
  return it;
}
/* 0) TARİHLİ çizelge (her satır belirli bir gün): Hafta | Gün | Tarih | 1. Nöbet Yeri Bahçe | 2. Nöbet Yeri 1. Kat …
      Örnek: Gelik Ayiçi 100. Yıl Ortaokulu "2026 KASIM-ARALIK-OCAK AYI NÖBET ÇİZELGESİ" (PDF). Her satırın tarihi saklanır;
      panoda yalnız o tarihin nöbetçileri görünür. Tarihsiz satırlar (alttaki TEK/ÇİFT sayım tablosu gibi) atlanır.
      "RESMİ TATİL" gibi tatil hücresi o gün için tek bir bilgi satırı olur. */
function locLabel(head) {
  var h = clean(head), f = fold(h);
  var m = /^\s*\d+\s*\.?\s*nobet yeri\s*/.exec(f);
  if (m) { var rest = h.slice(m[0].length).replace(/^[\s:–—-]+/, ""); if (rest) return rest; } /* "1. Nöbet Yeri Bahçe" -> "Bahçe" */
  return h;
}
function gridToDutyDated(grid) {
  var out = [], r, c, width = 0;
  grid.forEach(function (row) { width = Math.max(width, row.length); });
  /* Tarih sütunu: en az 3 satırında yalnız tarih (ve gün adı) olan sütun */
  var dateCol = -1;
  for (c = 0; c < width && dateCol < 0; c++) { var n = 0; for (r = 0; r < grid.length; r++) if (isDateHead(grid[r][c])) n++; if (n >= 3) dateCol = c; }
  if (dateCol < 0) return out;
  var firstData = -1; for (r = 0; r < grid.length; r++) if (isDateHead(grid[r][dateCol])) { firstData = r; break; }
  var hr = -1; for (r = firstData - 1; r >= 0 && r >= firstData - 4; r--) if (grid[r].some(function (x) { return x; })) { hr = r; break; }
  if (hr < 0) return out;
  var head = grid[hr], locCols = [];
  for (c = 0; c < width; c++) {
    if (c === dateCol) continue;
    var f = fold(head[c] || "").replace(/[^a-z0-9]+/g, " ").trim();
    if (!f || /^(hafta|haftalar|gun|gunler|tarih|sira|no|sira no)$/.test(f)) continue;
    locCols.push(c);
  }
  if (!locCols.length) return out;
  for (r = firstData; r < grid.length; r++) {
    var row = grid[r], iso = isDateHead(row[dateCol]) ? findDate(row[dateCol]) : null;
    if (!iso) continue;
    var wd = isoWeekday(iso), holiday = null;
    locCols.forEach(function (ci) { var v = row[ci]; if (v && /tatil|bayram/i.test(fold(v))) holiday = v; });
    if (holiday) { out.push({ loc: /tatil/.test(fold(holiday)) ? "Tatil" : "Not", name: clean(holiday).slice(0, 80), day: DAYS[wd], date: iso, note: true }); continue; }
    locCols.forEach(function (ci) { var it = dutyItem(locLabel(head[ci]), row[ci], wd, iso); if (it) out.push(it); });
  }
  return out;
}
function gridToDuty(grid) {
  var out = [], r, c, push = function (it) { if (it) out.push(it); };
  grid = grid.map(function (row) { return (row || []).map(function (x) { return clean(x); }); }).filter(function (r) { return !isBlankRow(r); });
  if (!grid.length) return out;
  var dated = gridToDutyDated(grid);
  if (dated.length) return dated;
  var width = Math.max.apply(null, grid.map(function (r) { return r.length; }));

  /* 1) Başlık satırında en az 3 gün adı: günler sütunda */
  for (r = 0; r < Math.min(grid.length, 6); r++) {
    var dayCols = [];
    for (c = 0; c < grid[r].length; c++) { var di = findDay(grid[r][c]); if (di >= 0) dayCols.push({ c: c, day: di }); }
    if (dayCols.length >= 3) {
      var locCol = -1;
      for (c = 0; c < dayCols[0].c; c++) { if (headKind(grid[r][c]) === "loc" || locCol < 0) locCol = c; }
      for (var rr = r + 1; rr < grid.length; rr++) {
        var loc = locCol >= 0 ? grid[rr][locCol] : "";
        if (locCol >= 0 && !loc) continue; /* nöbet yeri boş: tablo altı imza/not satırı */
        dayCols.forEach(function (dc) { push(dutyItem(loc, grid[rr][dc.c], dc.day)); });
      }
      return out;
    }
  }

  /* Başlık satırı: anahtar kelimelerle sütun türleri */
  var hr = -1, kinds = [];
  for (r = 0; r < Math.min(grid.length, 6) && hr < 0; r++) {
    var k = grid[r].map(headKind);
    if (k.indexOf("name") >= 0 || (k.indexOf("loc") >= 0 && k.indexOf("day") >= 0)) { hr = r; kinds = k; }
  }

  /* 3) / 4) Uzun liste ya da günsüz liste (Yer | Öğretmen [| Gün]) */
  if (hr >= 0 && kinds.indexOf("name") >= 0) {
    var nC = kinds.indexOf("name"), lC = kinds.indexOf("loc"), dC = kinds.indexOf("day"), lastDay = -1;
    for (r = hr + 1; r < grid.length; r++) {
      var row = grid[r];
      if (dC >= 0) { var d0 = dayOf(row[dC]); if (d0 >= 0) lastDay = d0; }
      push(dutyItem(lC >= 0 ? row[lC] : "", row[nC], dC >= 0 ? lastDay : -1));
    }
    return out;
  }

  /* 2) İlk sütunda (en az 3 satırda) gün adı: günler satırda, başlık satırında nöbet yerleri */
  var dayRows = [];
  for (r = 0; r < grid.length; r++) { var dd = dayOf(grid[r][0]); if (dd >= 0) dayRows.push({ r: r, day: dd }); }
  if (dayRows.length >= 3) {
    var head = dayRows[0].r > 0 ? grid[dayRows[0].r - 1] : [];
    dayRows.forEach(function (dr) {
      for (var cc = 1; cc < width; cc++) push(dutyItem(head[cc] || "", grid[dr.r][cc], dr.day));
    });
    return out;
  }

  /* 4b) Başlıksız iki sütun: ilk dolu hücre yer, ikincisi ad; satırda gün varsa o gün */
  grid.forEach(function (row) {
    var cells = [], day = -1;
    row.forEach(function (x) { if (!x) return; var d1 = dayOf(x); if (d1 >= 0 && day < 0 && x.length <= 30) day = d1; else cells.push(x); });
    if (cells.length >= 2) push(dutyItem(cells[0], cells.slice(1).join(", "), day));
    else if (cells.length === 1 && day >= 0) push(dutyItem("", cells[0], day));
  });
  return out;
}
function linesToDuty(lines) {
  var out = [], day = -1;
  lines.forEach(function (line) {
    var d = dayOf(line);
    if (d >= 0 && line.length <= 30 && !/[:\t]/.test(line)) { day = d; return; } /* "Pazartesi" / "21.10.2026 Salı" başlığı */
    var m = /^\s*([^:\t–—]{1,40}?)\s*(?::|\t|\s[-–—]\s)\s*(.+)$/.exec(line);
    if (!m) return;
    var hd = dayOf(m[1]);
    if (hd >= 0 && m[1].length <= 30) { day = hd; var m2 = /^\s*([^:\t–—]{1,40}?)\s*(?::|\t|\s[-–—]\s)\s*(.+)$/.exec(m[2]); if (m2) { var it2 = dutyItem(m2[1], m2[2], day); if (it2) out.push(it2); } return; }
    var it = dutyItem(m[1], m[2], day); if (it) out.push(it);
  });
  return out;
}
function importDuty(buf, filename) {
  var ext = (String(filename || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
  var duty = [];
  if (ext === "pdf") {
    var pg = require("./pdf-tablo.js").pdfGrid(buf);
    duty = gridToDuty(pg.grid);
    if (!duty.length) duty = linesToDuty(pg.lines);
  } else if (ext === "xlsx" || ext === "xlsm") {
    duty = gridToDuty(xlsxGrid(readZip(buf)));
  } else if (ext === "docx") {
    var d = docxParse(readZip(buf));
    d.grids.forEach(function (g) { if (!duty.length) duty = gridToDuty(g); });
    if (!duty.length) duty = linesToDuty(d.lines);
  } else if (ext === "csv" || ext === "txt") {
    var text = buf.toString("utf8");
    duty = ext === "csv" ? gridToDuty(parseCsv(text)) : [];
    if (!duty.length) duty = linesToDuty(text.split(/\r?\n/).map(clean).filter(function (x) { return x; }));
  } else if (ext === "xls" || ext === "doc") {
    throw new Error("Eski biçim (." + ext + ") okunamıyor. Dosyayı Word/Excel'de “Farklı kaydet” ile ." + (ext === "xls" ? "xlsx" : "docx") + " olarak kaydedip tekrar deneyin.");
  } else {
    throw new Error("Desteklenen biçimler: .pdf, .xlsx, .docx, .csv, .txt");
  }
  if (!duty.length) throw new Error("Dosyada nöbet yeri ve öğretmen adı içeren satır bulunamadı. Örnek şablona bakın (Nöbet Yeri | Pazartesi | Salı | … ya da Nöbet Yeri | Öğretmen).");
  var weekly = duty.some(function (x) { return x.day; }), dated = duty.some(function (x) { return x.date; });
  if (dated) {
    /* Tarihli çizelge: tarih sırası, gün içinde dosyadaki sıra; uzun dönem (ör. bütün yıl) için üst sınır daha geniş */
    duty = duty.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) { return (a.x.date || "9").localeCompare(b.x.date || "9") || a.i - b.i; }).map(function (o) { return o.x; });
    if (duty.length > 1500) duty = duty.slice(0, 1500);
    var days = {}; duty.forEach(function (x) { if (x.date) days[x.date] = 1; }); var ks = Object.keys(days).sort();
    return { duty: duty, weekly: true, dated: true, from: ks[0], to: ks[ks.length - 1], dayCount: ks.length };
  }
  /* Haftalık listede satırlar güne göre gruplanır (yönetim panelinde düzenlemesi kolay olsun); gün içi sıra korunur */
  if (weekly) duty = duty.map(function (x, i) { return { x: x, i: i, d: x.day ? DAYS.indexOf(x.day) : -1 }; })
    .sort(function (a, b) { return (a.d - b.d) || (a.i - b.i); }).map(function (o) { return o.x; });
  if (duty.length > 200) duty = duty.slice(0, 200);
  return { duty: duty, weekly: weekly };
}

module.exports = { importMenu: importMenu, importDuty: importDuty };
