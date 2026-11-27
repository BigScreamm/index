/* PDF'ten tablo çıkarma (nöbet çizelgesi / yemek listesi için) — dış paket yok, yalnızca Node'un zlib modülü.
 *
 * Ne yapar: PDF'in sayfalarındaki metni harf harf, konumuyla birlikte çıkarır; harfleri satırlara ve kelime gruplarına
 * birleştirir; başlık satırı ("Gün | Tarih | 1. Nöbet Yeri Bahçe | …") bulunursa her kelime grubunu x konumuna göre
 * doğru sütuna yerleştirip bir ızgara (satır × sütun) döndürür. Izgara, Excel/Word ile aynı çözümleyicilere verilir.
 *
 * Desteklenen PDF'ler: Chrome/Edge "PDF olarak kaydet" (Skia), Word/Excel "PDF olarak kaydet", LibreOffice çıktıları.
 * Metin yazı tiplerinin ToUnicode tablosuyla (Türkçe İ, Ş, Ğ… dahil) çözülür; nesne akışları (PDF 1.5+) desteklenir.
 * Desteklenmeyen: taranmış (resim) PDF'ler — içlerinde metin yoktur; o durumda anlaşılır bir hata verilir.
 */
"use strict";
var zlib = require("zlib");

/* ---------------- Nesneler ---------------- */
function readObjects(buf) {
  var s = buf.toString("latin1"), objs = {}, re = /(\d+)\s+(\d+)\s+obj\b/g, m;
  while ((m = re.exec(s))) {
    var start = m.index + m[0].length, end = s.indexOf("endobj", start);
    if (end < 0) break;
    var body = s.slice(start, end), si = body.search(/\bstream\r?\n/);
    var o = { dict: body, stream: null };
    if (si >= 0) {
      o.dict = body.slice(0, si);
      var dataStart = start + si + body.slice(si).match(/^stream\r?\n/)[0].length;
      var lm = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(o.dict), dataEnd;
      if (lm && dataStart + +lm[1] <= end) dataEnd = dataStart + +lm[1];
      else { dataEnd = s.lastIndexOf("endstream", end); if (s[dataEnd - 1] === "\n") dataEnd--; if (s[dataEnd - 1] === "\r") dataEnd--; }
      o.stream = buf.slice(dataStart, dataEnd);
    }
    objs[m[1]] = o;
    re.lastIndex = end;
  }
  /* Nesne akışları (ObjStm): Word ve LibreOffice sözlükleri bunların içine sıkıştırır */
  Object.keys(objs).forEach(function (k) {
    var o = objs[k];
    if (!o.stream || !/\/Type\s*\/ObjStm/.test(o.dict)) return;
    var data; try { data = decodeStream(o, objs).toString("latin1"); } catch (e) { return; }
    var n = +(/\/N\s+(\d+)/.exec(o.dict) || [])[1], first = +(/\/First\s+(\d+)/.exec(o.dict) || [])[1];
    var head = data.slice(0, first).trim().split(/\s+/).map(Number);
    for (var i = 0; i < n; i++) {
      var num = head[2 * i], off = first + head[2 * i + 1], next = i + 1 < n ? first + head[2 * i + 3] : data.length;
      if (!objs[num]) objs[num] = { dict: data.slice(off, next), stream: null };
    }
  });
  return objs;
}
function resolve(v, objs) { var m = /^\s*(\d+)\s+\d+\s+R\s*$/.exec(v || ""); return m && objs[m[1]] ? objs[m[1]].dict : v; }
/* Sözlükten bir anahtarın değeri (iç içe << >> ve [ ] dengeli); dolaylı başvuru çözülür */
function getVal(dict, key, objs) {
  var re = new RegExp("/" + key + "(?![A-Za-z0-9])\\s*"), m = re.exec(dict || "");
  if (!m) return null;
  var i = m.index + m[0].length, c = dict[i];
  if (c === "<" && dict[i + 1] === "<") { var d = 0, j = i; for (; j < dict.length; j++) { if (dict[j] === "<" && dict[j + 1] === "<") { d++; j++; } else if (dict[j] === ">" && dict[j + 1] === ">") { d--; j++; if (!d) break; } } return dict.slice(i, j + 1); }
  if (c === "[") { var e = 0, k = i; for (; k < dict.length; k++) { if (dict[k] === "[") e++; else if (dict[k] === "]") { e--; if (!e) break; } } return resolveIn(dict.slice(i, k + 1)); }
  var rm = /^(\d+)\s+\d+\s+R/.exec(dict.slice(i));
  if (rm) return objs && objs[rm[1]] ? objs[rm[1]].dict : null;
  return (/^[^\s\/<>\[\]]+|^\/[^\s\/<>\[\]]+/.exec(dict.slice(i)) || [""])[0];
  function resolveIn(x) { return x; }
}
function refOf(dict, key) { var m = new RegExp("/" + key + "\\s+(\\d+)\\s+\\d+\\s+R").exec(dict || ""); return m ? m[1] : null; }
function decodeStream(o, objs) {
  var data = o.stream, f = getVal(o.dict, "Filter", objs) || "";
  if (/FlateDecode/.test(f)) {
    try { data = zlib.inflateSync(data); } catch (e) { data = zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); }
    var pred = /\/Predictor\s+(\d+)/.exec(o.dict);
    if (pred && +pred[1] >= 10) data = pngUnpredict(data, +((/\/Columns\s+(\d+)/.exec(o.dict) || [])[1] || 1));
  } else if (f && !/^\s*$/.test(f) && !/\[\s*\]/.test(f)) throw new Error("desteklenmeyen sıkıştırma: " + f);
  return data;
}
function pngUnpredict(data, cols) {
  var out = [], prev = Buffer.alloc(cols), rowLen = cols + 1;
  for (var r = 0; r + rowLen <= data.length; r += rowLen) {
    var t = data[r], row = Buffer.from(data.slice(r + 1, r + rowLen));
    for (var i = 0; i < cols; i++) { var up = prev[i], left = i ? row[i - 1] : 0; if (t === 1) row[i] = (row[i] + left) & 255; else if (t === 2) row[i] = (row[i] + up) & 255; }
    out.push(row); prev = row;
  }
  return Buffer.concat(out);
}

/* ---------------- Yazı tipleri ---------------- */
var GLYPH = { space: " ", Idotaccent: "İ", dotlessi: "ı", Scedilla: "Ş", scedilla: "ş", Gbreve: "Ğ", gbreve: "ğ", Ccedilla: "Ç", ccedilla: "ç", Odieresis: "Ö", odieresis: "ö", Udieresis: "Ü", udieresis: "ü", hyphen: "-", period: ".", comma: ",", colon: ":", slash: "/", parenleft: "(", parenright: ")", quotesingle: "'", quoteright: "’", endash: "–", emdash: "—", ampersand: "&", zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };
function parseCMap(text) {
  var map = {}, len = 1, m;
  var cs = /<([0-9a-fA-F]+)>\s*<[0-9a-fA-F]+>\s*endcodespacerange/.exec(text) || /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(text);
  if (cs) len = cs[1].length / 2;
  var hexU = function (h) { var s = ""; for (var i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.substr(i, 4), 16)); if (h.length === 2) s = String.fromCharCode(parseInt(h, 16)); return s; };
  var blocks = text.split(/beginbf(?:char|range)/);
  text.replace(/beginbfchar([\s\S]*?)endbfchar/g, function (_, b) { var r = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g; while ((m = r.exec(b))) map[parseInt(m[1], 16)] = hexU(m[2]); });
  text.replace(/beginbfrange([\s\S]*?)endbfrange/g, function (_, b) {
    var r = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([^\]]*)\])/g;
    while ((m = r.exec(b))) {
      var lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
      if (m[4] !== undefined) { var base = m[4], last = parseInt(base.slice(-4) || base, 16); for (var c = lo; c <= hi && c - lo < 65536; c++) map[c] = hexU(base.slice(0, -4)) + String.fromCharCode(last + c - lo); }
      else { var arr = m[5].match(/<([0-9a-fA-F]*)>/g) || []; for (var j = 0; j < arr.length; j++) map[lo + j] = hexU(arr[j].slice(1, -1)); }
    }
  });
  void blocks;
  return { map: map, len: len };
}
function loadFont(dict, objs) {
  var f = { bytes: 1, map: null, widths: {}, dw: 1000, enc: {} };
  var sub = (getVal(dict, "Subtype", objs) || "").replace("/", "");
  if (sub === "Type0") {
    f.bytes = 2;
    var desc = getVal(dict, "DescendantFonts", objs) || "", dref = /(\d+)\s+\d+\s+R/.exec(desc), dd = dref && objs[dref[1]] ? objs[dref[1]].dict : desc;
    var dw = /\/DW\s+(\d+)/.exec(dd || ""); if (dw) f.dw = +dw[1];
    var W = getVal(dd, "W", objs);
    if (W) { var toks = W.replace(/[\[\]]/g, function (b) { return " " + b + " "; }).trim().split(/\s+/), i = 1;
      while (i < toks.length - 1) { var c0 = +toks[i]; if (toks[i + 1] === "[") { i += 2; while (toks[i] !== "]" && i < toks.length) f.widths[c0++] = +toks[i++]; i++; } else { var c1 = +toks[i + 1], w = +toks[i + 2]; for (var c = c0; c <= c1; c++) f.widths[c] = w; i += 3; } } }
  } else {
    var fc = +(getVal(dict, "FirstChar", objs) || 0), ws = getVal(dict, "Widths", objs);
    if (ws) (ws.match(/-?[\d.]+/g) || []).forEach(function (w, j) { f.widths[fc + j] = +w; });
    f.dw = 500;
    var enc = getVal(dict, "Encoding", objs) || "";
    var diff = /\/Differences\s*\[([^\]]*)\]/.exec(enc);
    if (diff) { var code = 0; diff[1].replace(/(\d+)|\/([^\s\/\[\]]+)/g, function (_, n, name) { if (n) code = +n; else { f.enc[code] = GLYPH[name] || (/^uni([0-9A-F]{4})$/.test(name) ? String.fromCharCode(parseInt(name.slice(3), 16)) : (name.length === 1 ? name : "")); code++; } return ""; }); }
  }
  var tu = refOf(dict, "ToUnicode");
  if (tu && objs[tu] && objs[tu].stream) { try { var cm = parseCMap(decodeStream(objs[tu], objs).toString("latin1")); f.map = cm.map; f.bytes = sub === "Type0" ? 2 : cm.len; } catch (e) {} }
  return f;
}
var CP1252 = { 128: "€", 130: "‚", 132: "„", 133: "…", 145: "‘", 146: "’", 147: "“", 148: "”", 150: "–", 151: "—" };
function decodeChar(f, code) {
  if (f.map && f.map[code] !== undefined) return f.map[code];
  if (f.enc[code] !== undefined) return f.enc[code];
  if (f.bytes === 1) return CP1252[code] || String.fromCharCode(code);
  return "";
}

/* ---------------- İçerik akışı yorumlayıcı ---------------- */
function tokenize(s) {
  var out = [], i = 0, n = s.length;
  while (i < n) {
    var c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "%") { while (i < n && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    if (c === "(") { var d = 1, j = i + 1, str = ""; while (j < n && d) { var ch = s[j]; if (ch === "\\") { var nx = s[j + 1]; var esc = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[nx]; if (esc) { str += esc; j += 2; } else if (/[0-7]/.test(nx)) { var oct = /^[0-7]{1,3}/.exec(s.slice(j + 1))[0]; str += String.fromCharCode(parseInt(oct, 8)); j += 1 + oct.length; } else if (nx === "\r" || nx === "\n") { j += 2; } else { str += nx; j += 2; } continue; } if (ch === "(") d++; else if (ch === ")") { d--; if (!d) break; } str += ch; j++; } out.push({ t: "s", v: str }); i = j + 1; continue; }
    if (c === "<" && s[i + 1] !== "<") { var e = s.indexOf(">", i), hex = s.slice(i + 1, e).replace(/\s/g, ""); if (hex.length % 2) hex += "0"; var b = ""; for (var k = 0; k < hex.length; k += 2) b += String.fromCharCode(parseInt(hex.substr(k, 2), 16)); out.push({ t: "s", v: b }); i = e + 1; continue; }
    if (c === "<" || c === ">") { out.push({ t: "op", v: c + c }); i += 2; continue; }
    if (c === "[" || c === "]") { out.push({ t: c }); i++; continue; }
    if (c === "/") { var m = /^\/[^\s\/\[\]<>()%{}]*/.exec(s.slice(i, i + 128)); out.push({ t: "n", v: m[0].slice(1) }); i += m[0].length; continue; }
    var w = /^[^\s\/\[\]<>()%{}]+/.exec(s.slice(i, i + 64));
    if (!w) { i++; continue; }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w[0])) out.push({ t: "num", v: +w[0] }); else out.push({ t: "op", v: w[0] });
    i += w[0].length;
    if (w[0] === "BI") { var ei = s.indexOf("EI", i); i = ei < 0 ? n : ei + 2; out.pop(); }
  }
  return out;
}
function mul(a, b) { return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]; }
function runContent(content, fontsDict, objs, glyphs, page, fontCache, xobjs, depth) {
  var toks = tokenize(content), st = [], ctm = [1, 0, 0, 1, 0, 0], stack = [];
  var font = null, size = 12, Tc = 0, Tw = 0, Tz = 1, TL = 0, Ts = 0, tm = [1, 0, 0, 1, 0, 0], tlm = tm.slice();
  function getFont(name) {
    if (fontCache[name]) return fontCache[name];
    var ref = new RegExp("/" + name.replace(/[+.]/g, "\\$&") + "\\s+(\\d+)\\s+\\d+\\s+R").exec(fontsDict || "");
    var f = ref && objs[ref[1]] ? loadFont(objs[ref[1]].dict, objs) : { bytes: 1, map: null, widths: {}, dw: 500, enc: {} };
    return (fontCache[name] = f);
  }
  function show(str) {
    if (!font) return;
    for (var i = 0; i < str.length; i += font.bytes) {
      var code = font.bytes === 2 ? (str.charCodeAt(i) << 8 | str.charCodeAt(i + 1)) : str.charCodeAt(i);
      var ch = decodeChar(font, code), w0 = (font.widths[code] !== undefined ? font.widths[code] : font.dw) / 1000;
      var trm = mul([size * Tz, 0, 0, size, 0, Ts], mul(tm, ctm));
      var adv = (w0 * size + Tc + (ch === " " && font.bytes === 1 ? Tw : 0)) * Tz;
      var hsize = Math.sqrt(trm[2] * trm[2] + trm[3] * trm[3]);
      var wDev = w0 * Math.sqrt(trm[0] * trm[0] + trm[1] * trm[1]);
      if (ch && ch !== "\u0000") glyphs.push({ ch: ch, x: trm[4], y: trm[5], w: wDev, size: hsize, page: page });
      tm = mul([1, 0, 0, 1, adv, 0], tm);
    }
  }
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (t.t !== "op") { st.push(t); continue; }
    var op = t.v, nums = st.filter(function (x) { return x.t === "num"; }).map(function (x) { return x.v; });
    switch (op) {
      case "q": stack.push(ctm.slice()); break;
      case "Q": if (stack.length) ctm = stack.pop(); break;
      case "cm": if (nums.length >= 6) ctm = mul(nums.slice(-6), ctm); break;
      case "BT": tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); break;
      case "Tf": { var nm = st.filter(function (x) { return x.t === "n"; }).pop(); if (nm) font = getFont(nm.v); if (nums.length) size = nums[nums.length - 1]; break; }
      case "Tc": Tc = nums.pop() || 0; break;
      case "Tw": Tw = nums.pop() || 0; break;
      case "Tz": Tz = (nums.pop() || 100) / 100; break;
      case "TL": TL = nums.pop() || 0; break;
      case "Ts": Ts = nums.pop() || 0; break;
      case "Tm": if (nums.length >= 6) { tm = nums.slice(-6); tlm = tm.slice(); } break;
      case "Td": tlm = mul([1, 0, 0, 1, nums[nums.length - 2] || 0, nums[nums.length - 1] || 0], tlm); tm = tlm.slice(); break;
      case "TD": TL = -(nums[nums.length - 1] || 0); tlm = mul([1, 0, 0, 1, nums[nums.length - 2] || 0, nums[nums.length - 1] || 0], tlm); tm = tlm.slice(); break;
      case "T*": tlm = mul([1, 0, 0, 1, 0, -TL], tlm); tm = tlm.slice(); break;
      case "Tj": { var s1 = st.filter(function (x) { return x.t === "s"; }).pop(); if (s1) show(s1.v); break; }
      case "'": tlm = mul([1, 0, 0, 1, 0, -TL], tlm); tm = tlm.slice(); var s2 = st.filter(function (x) { return x.t === "s"; }).pop(); if (s2) show(s2.v); break;
      case '"': tlm = mul([1, 0, 0, 1, 0, -TL], tlm); tm = tlm.slice(); var s3 = st.filter(function (x) { return x.t === "s"; }).pop(); if (s3) show(s3.v); break;
      case "TJ": {
        var open = -1; for (var k = st.length - 1; k >= 0; k--) if (st[k].t === "[") { open = k; break; }
        st.slice(open + 1).forEach(function (x) { if (x.t === "s") show(x.v); else if (x.t === "num") tm = mul([1, 0, 0, 1, -x.v / 1000 * size * Tz, 0], tm); });
        break;
      }
      case "Do": {
        var xn = st.filter(function (x) { return x.t === "n"; }).pop();
        if (xn && xobjs && depth < 4) {
          var xr = new RegExp("/" + xn.v + "\\s+(\\d+)\\s+\\d+\\s+R").exec(xobjs), xo = xr && objs[xr[1]];
          if (xo && /\/Subtype\s*\/Form/.test(xo.dict) && xo.stream) {
            try {
              var mat = (/\/Matrix\s*\[([^\]]*)\]/.exec(xo.dict) || [])[1], mx = mat ? mat.trim().split(/\s+/).map(Number) : [1, 0, 0, 1, 0, 0];
              var res = getVal(xo.dict, "Resources", objs) || "", fd = getVal(res, "Font", objs) || fontsDict, xd = getVal(res, "XObject", objs) || "";
              var sub = glyphs.length; runContent(decodeStream(xo, objs).toString("latin1"), fd, objs, glyphs, page, {}, xd, depth + 1);
              var m2 = mul(mx, ctm); for (var g = sub; g < glyphs.length; g++) { var gx = glyphs[g].x, gy = glyphs[g].y; glyphs[g].x = gx * m2[0] + gy * m2[2] + m2[4]; glyphs[g].y = gx * m2[1] + gy * m2[3] + m2[5]; }
            } catch (e) {}
          }
        }
        break;
      }
    }
    st = [];
  }
}

/* ---------------- Sayfalar ---------------- */
function pageList(objs) {
  var root = null, out = [];
  Object.keys(objs).forEach(function (k) { if (!root && /\/Type\s*\/Catalog/.test(objs[k].dict)) root = objs[k].dict; });
  function walk(num, inh, seen) {
    var o = objs[num]; if (!o || seen[num]) return; seen[num] = 1;
    var res = getVal(o.dict, "Resources", objs) || inh;
    if (/\/Type\s*\/Pages/.test(o.dict)) { var kids = getVal(o.dict, "Kids", objs) || ""; (kids.match(/(\d+)\s+\d+\s+R/g) || []).forEach(function (r) { walk(r.split(/\s+/)[0], res, seen); }); }
    else if (/\/Type\s*\/Page\b/.test(o.dict)) out.push({ num: num, res: res });
  }
  var pr = root && refOf(root, "Pages"); if (pr) walk(pr, "", {});
  if (!out.length) Object.keys(objs).forEach(function (k) { if (/\/Type\s*\/Page\b/.test(objs[k].dict)) out.push({ num: k, res: getVal(objs[k].dict, "Resources", objs) || "" }); });
  return out;
}
function extractGlyphs(buf) {
  if (buf.slice(0, 5).toString("latin1") !== "%PDF-") throw new Error("Dosya geçerli bir PDF değil.");
  if (/\/Encrypt\s/.test(buf.toString("latin1"))) throw new Error("PDF parola/şifreleme korumalı; korumasız olarak yeniden kaydedip deneyin.");
  var objs = readObjects(buf), glyphs = [];
  pageList(objs).forEach(function (p, pi) {
    var pd = objs[p.num].dict, fonts = getVal(p.res, "Font", objs) || "", xobjs = getVal(p.res, "XObject", objs) || "";
    var cont = getVal(pd, "Contents", objs) || "", refs = (cont.match(/(\d+)\s+\d+\s+R/g) || []).map(function (r) { return r.split(/\s+/)[0]; });
    if (!refs.length) { var cr = refOf(pd, "Contents"); if (cr) refs = [cr]; }
    var text = refs.map(function (r) { try { return decodeStream(objs[r], objs).toString("latin1"); } catch (e) { return ""; } }).join("\n");
    runContent(text, fonts, objs, glyphs, pi, {}, xobjs, 0);
  });
  return glyphs;
}

/* ---------------- Harfler -> satırlar -> kelime grupları ---------------- */
function toLines(glyphs) {
  var byPage = {};
  glyphs.forEach(function (g) { (byPage[g.page] = byPage[g.page] || []).push(g); });
  var lines = [];
  Object.keys(byPage).sort(function (a, b) { return a - b; }).forEach(function (p) {
    var gs = byPage[p].sort(function (a, b) { return b.y - a.y || a.x - b.x; }), cur = null;
    gs.forEach(function (g) {
      if (cur && Math.abs(cur.y - g.y) <= Math.max(1.5, 0.45 * Math.min(cur.size, g.size))) cur.gs.push(g);
      else { cur = { y: g.y, size: g.size, page: +p, gs: [g] }; lines.push(cur); }
    });
  });
  lines.forEach(function (l) {
    l.gs.sort(function (a, b) { return a.x - b.x; });
    var segs = [], seg = null, prevEnd = -1e9;
    l.gs.forEach(function (g) {
      var gap = g.x - prevEnd, sz = Math.max(g.size, 1);
      if (!seg || gap > 1.6 * sz) { seg = { text: "", x0: g.x, x1: g.x + g.w }; segs.push(seg); }
      else if (gap > 0.18 * sz && !/\s$/.test(seg.text) && g.ch !== " ") seg.text += " ";
      seg.text += g.ch; seg.x1 = Math.max(seg.x1, g.x + g.w); prevEnd = g.x + g.w;
    });
    l.segs = segs.map(function (s) { s.text = s.text.replace(/\s+/g, " ").trim(); return s; }).filter(function (s) { return s.text; });
    l.text = l.segs.map(function (s) { return s.text; }).join(" ");
  });
  return lines.filter(function (l) { return l.segs.length; });
}

/* ---------------- Satırlar -> ızgara ---------------- */
function fold(s) { return String(s || "").replace(/İ/g, "i").replace(/I/g, "i").toLowerCase().replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c"); }
var HEAD_WORDS = /^(hafta|gun|gunler|tarih|nobet yeri|\d+\.? ?nobet yeri|yer|nobet yerleri|ogretmen|ogretmenler|ad soyad|adi soyadi|gorevli|corba|ana yemek|yemek|menu)$/;
function isHeadSeg(t) { return HEAD_WORDS.test(fold(t).replace(/[^a-z0-9. ]+/g, " ").replace(/\s+/g, " ").trim()); }
function pdfGrid(buf) {
  var glyphs = extractGlyphs(buf);
  if (!glyphs.length) throw new Error("PDF'te okunabilir metin yok (taranmış/resim PDF olabilir). Word/Excel'den 'PDF olarak kaydet' ile oluşturulmuş dosya kullanın ya da .xlsx/.docx yükleyin.");
  var lines = toLines(glyphs), hi = -1;
  for (var i = 0; i < lines.length && hi < 0; i++) { var n = lines[i].segs.filter(function (s) { return isHeadSeg(s.text); }).length; if (n >= 2) hi = i; }
  var plain = lines.map(function (l) { return l.text; });
  if (hi < 0) return { grid: lines.map(function (l) { return l.segs.map(function (s) { return s.text; }); }), lines: plain };
  /* Başlık bandı: başlık satırına dikeyde yakın (iki satırlı başlık hücreleri, ör. "1. Nöbet Yeri" / "Bahçe") */
  var H = lines[hi], band = lines.filter(function (l) { return l.page === H.page && Math.abs(l.y - H.y) <= 1.9 * H.size; });
  var hsegs = []; band.sort(function (a, b) { return b.y - a.y; }).forEach(function (l) { l.segs.forEach(function (s) { hsegs.push({ c: (s.x0 + s.x1) / 2, text: s.text, w: s.x1 - s.x0 }); }); });
  hsegs.sort(function (a, b) { return a.c - b.c; });
  var cols = [];
  hsegs.forEach(function (s) { var last = cols[cols.length - 1]; if (last && Math.abs(last.c - s.c) < Math.max(14, 1.4 * H.size)) { last.parts.push(s); } else cols.push({ c: s.c, parts: [s] }); });
  cols.forEach(function (c) { c.head = c.parts.map(function (p) { return p.text; }).join(" "); c.c = c.parts.reduce(function (a, p) { return a + p.c; }, 0) / c.parts.length; });
  var bounds = cols.map(function (c, k) { return k + 1 < cols.length ? (c.c + cols[k + 1].c) / 2 : Infinity; });
  var colOf = function (x) { for (var k = 0; k < bounds.length; k++) if (x < bounds[k]) return k; return bounds.length - 1; };
  var headKey = band.map(function (l) { return l.text; }).join("|");
  var grid = [cols.map(function (c) { return c.head; })];
  lines.forEach(function (l) {
    if (band.indexOf(l) >= 0) return;
    if (l.page === H.page && l.y > H.y) return; /* başlığın üstü (sayfa başlığı) */
    if (l.page !== H.page && isRepeatedHeader(l)) return;
    var row = cols.map(function () { return ""; });
    l.segs.forEach(function (s) { var k = colOf((s.x0 + s.x1) / 2); row[k] = row[k] ? row[k] + " " + s.text : s.text; });
    grid.push(row);
  });
  function isRepeatedHeader(l) { return l.segs.filter(function (s) { return isHeadSeg(s.text); }).length >= 2 || headKey.indexOf(l.text) >= 0 && l.segs.every(function (s) { return isHeadSeg(s.text) || headKey.indexOf(s.text) >= 0; }); }
  return { grid: grid, lines: plain };
}

module.exports = { pdfGrid: pdfGrid, extractGlyphs: extractGlyphs, toLines: toLines };
