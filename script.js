window.ICO = function (k) {
  var ns = document.querySelector("svg").namespaceURI;
  var v = document.createElementNS(ns, "svg"), u = document.createElementNS(ns, "use");
  v.setAttribute("viewBox", [0, 0, 40, 40].join(" ")); v.setAttribute("aria-hidden", "true");
  u.setAttribute("href", "#" + k); v.appendChild(u);
  return v.outerHTML;
};

// Gosok foto: penutup foto digambar di kanvas, lalu dihapus pelan-pelan oleh jari / mouse.
// Kalau sekitar separuh permukaannya sudah tergosok, sisanya terbuka sendiri (onDone dipanggil).
window.scratchify = function (cv, onDone, opts) {
  opts = opts || {};
  var use = cv.querySelector("use");
  var key = use ? (use.getAttribute("href") || "").replace("#", "") : "";
  var tint = (cv.style.getPropertyValue("--tint") || "#ffdde4").trim();
  cv.classList.add("scratch");
  cv.textContent = "";
  var canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  cv.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  if (!ctx) { if (onDone) cv.addEventListener("click", function () { onDone(); }); return; }

  var THRESHOLD = 0.5;
  var ready = false, painted = false, done = false, down = false, last = null;
  var dpr = 1, cssW = 0, cssH = 0, brush = 16, cell = 10, cols = 0, rows = 0, grid = null, marked = 0, ro = null;

  function finish() {
    if (done) return;
    done = true; down = false;
    canvas.style.pointerEvents = "none";
    if (ro) ro.disconnect();
    if (onDone) onDone();
  }

  if (opts.focusable) {
    cv.setAttribute("role", "button");
    cv.setAttribute("tabindex", "0");
    cv.setAttribute("aria-label", "Foto tertutup. Gosok untuk membuka, atau tekan Enter.");
    cv.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); finish(); }
    });
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loadIcon() {
    return new Promise(function (resolve) {
      var sym = key && document.getElementById(key);
      if (!sym) return resolve(null);
      var inner = "", ser = new XMLSerializer();
      for (var i = 0; i < sym.childNodes.length; i++) inner += ser.serializeToString(sym.childNodes[i]);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (sym.getAttribute("viewBox") || "0 0 40 40") + '">' + inner + "</svg>";
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }

  function loadFont() {
    if (!(document.fonts && document.fonts.load)) return Promise.resolve();
    return Promise.race([
      document.fonts.load("20px Caveat").catch(function () {}),
      new Promise(function (r) { setTimeout(r, 700); })
    ]);
  }

  function paint(icon) {
    var w = canvas.width, h = canvas.height, s = dpr;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    // dasar warna + titik-titik
    roundRect(0, 0, w, h, 7 * s);
    ctx.fillStyle = tint; ctx.fill();
    ctx.save();
    roundRect(0, 0, w, h, 7 * s); ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,.55)";
    var step = 11 * s;
    for (var y = step / 2; y < h; y += step) for (var x = step / 2; x < w; x += step) { ctx.beginPath(); ctx.arc(x, y, 1.6 * s, 0, 6.2832); ctx.fill(); }
    ctx.restore();
    // bingkai putih tipis
    roundRect(1.25 * s, 1.25 * s, w - 2.5 * s, h - 2.5 * s, 6 * s);
    ctx.lineWidth = 2.5 * s; ctx.strokeStyle = "#f3f5fa"; ctx.stroke();
    // ikon
    if (icon) {
      var isz = Math.min(w * 0.5, h * 0.42, 150 * s);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.22)"; ctx.shadowBlur = 4 * s; ctx.shadowOffsetY = 2 * s;
      ctx.drawImage(icon, (w - isz) / 2, h * 0.44 - isz / 2, isz, isz);
      ctx.restore();
    }
    // tulisan
    var fs = Math.max(14, Math.min(22, cssW / 11)) * s;
    ctx.font = fs + "px Caveat, cursive";
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(27,33,56,.72)";
    ctx.fillText(cssW >= 140 ? "gosok ya ✦" : "gosok ✦", w / 2, h - Math.max(10, cssH * 0.06) * s);
  }

  function setup() {
    var w = cv.offsetWidth, h = cv.offsetHeight;
    if (ready || done || w < 20 || h < 20) return;
    ready = true;
    if (ro) ro.disconnect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = w; cssH = h;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    brush = Math.max(11, Math.min(22, Math.min(w, h) * 0.09)) * dpr;   // radius kuas, dalam piksel kanvas
    cell = Math.max(6 * dpr, brush * 0.75);
    cols = Math.ceil(canvas.width / cell); rows = Math.ceil(canvas.height / cell);
    grid = new Uint8Array(cols * rows); marked = 0;
    Promise.all([loadIcon(), loadFont()]).then(function (r) { paint(r[0]); painted = true; });
  }

  function mark(x, y) {
    var i0 = Math.max(0, Math.floor((x - brush) / cell)), i1 = Math.min(cols - 1, Math.floor((x + brush) / cell));
    var j0 = Math.max(0, Math.floor((y - brush) / cell)), j1 = Math.min(rows - 1, Math.floor((y + brush) / cell));
    for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
      var dx = (i + 0.5) * cell - x, dy = (j + 0.5) * cell - y;
      if (dx * dx + dy * dy <= brush * brush && !grid[j * cols + i]) { grid[j * cols + i] = 1; marked++; }
    }
  }

  function stroke(e) {
    // offsetX/Y sudah dalam koordinat lokal elemen, jadi tetap pas walau foto miring / bergoyang
    var x = e.offsetX, y = e.offsetY;
    if (typeof x !== "number" || isNaN(x)) {
      var r = canvas.getBoundingClientRect();
      x = e.clientX - r.left; y = e.clientY - r.top;
    }
    var X = x * (canvas.width / (canvas.offsetWidth || cssW)), Y = y * (canvas.height / (canvas.offsetHeight || cssH));
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = brush * 2;
    ctx.beginPath();
    if (last) ctx.moveTo(last.x, last.y); else ctx.moveTo(X, Y);
    ctx.lineTo(X + (last ? 0 : 0.01), Y);
    ctx.stroke();
    if (last) {
      var dx = X - last.x, dy = Y - last.y, n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / (cell * 0.5)));
      for (var k = 1; k <= n; k++) mark(last.x + dx * k / n, last.y + dy * k / n);
    } else mark(X, Y);
    last = { x: X, y: Y };
    if (marked / (cols * rows) >= THRESHOLD) finish();
  }

  function end() { down = false; last = null; }
  canvas.addEventListener("pointerdown", function (e) {
    if (done) return;
    if (!ready) setup();
    if (!painted) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    down = true; last = null;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    stroke(e);
  });
  canvas.addEventListener("pointermove", function (e) { if (down && !done) stroke(e); });
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("lostpointercapture", end);
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // ukuran baru dihitung saat bagian itu benar-benar tampil (halaman lain disembunyikan)
  if ("ResizeObserver" in window) { ro = new ResizeObserver(setup); ro.observe(cv); }
  setup();
};

(function () {
  // Ganti nama di sini, semua tulisan "Nama" ikut berubah.
  var NAMA = "Hanif";
  document.querySelectorAll(".js-nama").forEach(function (el) { el.textContent = NAMA; });
  document.title = "Happy 22nd Birthday, " + NAMA;

  var bgm = document.getElementById("bgm");
  var splash = document.getElementById("splash");
  var musicBtn = document.getElementById("musicBtn");

  function label() { musicBtn.textContent = bgm.paused ? "putar musik" : "jeda musik"; }
  bgm.addEventListener("play", label);
  bgm.addEventListener("pause", label);
  bgm.addEventListener("error", function () { musicBtn.hidden = true; });
  label();

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- tic tac toe: harus menang dulu sebelum masuk ----------
  // Hanif = kucing biru (jalan duluan), Adel = kucing bunga. Kalau kalah atau seri, papan diulang sampai menang.
  var boardEl = document.getElementById("ttt");
  var statusEl = document.getElementById("tttStatus");
  var cells = Array.prototype.slice.call(boardEl.querySelectorAll(".ttt-cell"));
  var LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  var ICON = { P: "ico-catb", A: "ico-catc" };
  var board = [], busy = false, fails = 0, entered = false;

  function say(t) { statusEl.textContent = t; }
  function empties() { var r = []; for (var i = 0; i < 9; i++) if (!board[i]) r.push(i); return r; }
  function winner() {
    for (var i = 0; i < LINES.length; i++) {
      var l = LINES[i];
      if (board[l[0]] && board[l[0]] === board[l[1]] && board[l[0]] === board[l[2]]) return { who: board[l[0]], line: l };
    }
    return null;
  }
  // kotak yang tinggal satu lagi untuk melengkapi garis milik "who" (-1 kalau tidak ada)
  function spotFor(who) {
    for (var i = 0; i < LINES.length; i++) {
      var l = LINES[i], mine = 0, free = -1;
      for (var k = 0; k < 3; k++) { if (board[l[k]] === who) mine++; else if (!board[l[k]]) free = l[k]; }
      if (mine === 2 && free >= 0) return free;
    }
    return -1;
  }
  // Adel main kurang jago: makin sering Hanif kalah, makin ceroboh (biar nggak kejebak ulang terus)
  function aiMove() {
    var skill = Math.max(0, 0.8 - fails * 0.3), m = -1;
    if (Math.random() < skill) m = spotFor("A");
    if (m < 0 && Math.random() < skill) m = spotFor("P");
    if (m < 0) { var e = empties(); m = e[(Math.random() * e.length) | 0]; }
    return m;
  }
  function put(i, who) {
    board[i] = who;
    cells[i].innerHTML = ICO(ICON[who]);
    cells[i].disabled = true;
  }
  function reset() {
    board = [null, null, null, null, null, null, null, null, null];
    busy = false;
    cells.forEach(function (c) { c.innerHTML = ""; c.classList.remove("win", "lose"); c.disabled = false; });
    say(fails ? "ronde " + (fails + 1) + ", giliranmu lagi, Hanif" : "giliranmu, Hanif (kucing biru)");
  }
  function lost(msg, line) {
    busy = true;
    fails++;
    if (line) line.forEach(function (k) { cells[k].classList.add("lose"); });
    say(msg);
    setTimeout(reset, 2000);
  }
  function enter() {
    if (entered) return;
    entered = true;
    document.body.classList.remove("locked");
    document.body.classList.add("splash-gone");
    splash.classList.add("gone");
    // setelah splash selesai memudar, salju dan gelembung kembali ke belakang isi halaman
    setTimeout(function () { document.body.classList.remove("splash-on", "splash-gone"); }, 800);
    window.scrollTo(0, 0);
  }
  function won(line) {
    busy = true;
    line.forEach(function (k) { cells[k].classList.add("win"); });
    cells.forEach(function (c) { c.disabled = true; });
    say("yey, menang! kamu keren!");
    // dipanggil langsung dari ketukan terakhir, jadi browser mengizinkan suara
    try { var p = bgm.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    if (window.burst) {
      var r = boardEl.getBoundingClientRect();
      window.burst(r.left + r.width / 2, r.top + r.height / 2, 110);
    }
    setTimeout(enter, reduceMotion ? 500 : 1700);
  }

  cells.forEach(function (c, i) {
    c.addEventListener("click", function () {
      if (busy || board[i]) return;
      put(i, "P");
      var w = winner();
      if (w) { won(w.line); return; }
      if (!empties().length) { lost("seri nih, belum menang... ulang lagi yaa"); return; }
      busy = true;
      say("Adel lagi mikir...");
      setTimeout(function () {
        put(aiMove(), "A");
        var w2 = winner();
        if (w2) { lost("yahh kalah :( ulang lagi yaa", w2.line); return; }
        if (!empties().length) { lost("seri nih, belum menang... ulang lagi yaa"); return; }
        busy = false;
        say("giliranmu, Hanif");
      }, 550);
    });
  });
  reset();

  musicBtn.addEventListener("click", function () {
    try {
      if (bgm.paused) { var p = bgm.play(); if (p && p.catch) p.catch(function () {}); }
      else { bgm.pause(); }
    } catch (e) {}
  });

  // Ketuk foto untuk memperbesar. Album (halaman 07) punya tombol sebelumnya/berikutnya.
  var box = document.getElementById("lightbox");
  var boxImg = box.querySelector("img");
  var cnt = box.querySelector(".lb-count");
  var al = Array.prototype.slice.call(document.querySelectorAll(".album .al"));
  var cur = -1;
  function show(i) {
    if (i < 0 || i >= al.length) return;
    cur = i;
    boxImg.src = al[i].getAttribute("data-full");
    cnt.textContent = (i + 1) + " / " + al.length;
    box.classList.add("on", "scroll");
    box.scrollTop = 0;
  }
  function closeBox() { box.classList.remove("on", "scroll"); cur = -1; }
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest(".al") : null;
    if (t) { show(al.indexOf(t)); return; }
    var act = e.target.closest("[data-lb]");
    if (act) {
      var a = act.getAttribute("data-lb");
      if (a === "prev") show(cur - 1); else if (a === "next") show(cur + 1); else closeBox();
      return;
    }
    var img = e.target.closest(".ph img");
    if (img) { boxImg.src = img.src; box.classList.remove("scroll"); box.classList.add("on"); return; }
    if (box.classList.contains("on")) {
      if (!box.classList.contains("scroll") || e.target === box) closeBox();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeBox();
    else if (box.classList.contains("scroll")) {
      if (e.key === "ArrowLeft") show(cur - 1);
      else if (e.key === "ArrowRight") show(cur + 1);
    }
  });
})();

// Salju yang jatuh pelan di belakang tulisan.
(function () {
  var cv = document.getElementById("snow");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var W = 0, H = 0, flakes = [];

  function make(anywhere) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : -30,
      r: 6 + Math.random() * 12,
      vy: 0.25 + Math.random() * 0.6,
      sw: Math.random() * Math.PI * 2,
      ss: 0.004 + Math.random() * 0.01,
      a: 0.07 + Math.random() * 0.14,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.01
    };
  }

  function setup() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.round(Math.min(60, (W * H) / 22000));
    flakes = [];
    for (var i = 0; i < n; i++) flakes.push(make(true));
  }

  function draw(f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    ctx.globalAlpha = f.a;
    ctx.strokeStyle = "#ffdde4";
    ctx.lineWidth = Math.max(1, f.r / 7);
    ctx.lineCap = "round";
    for (var i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, f.r);
      ctx.moveTo(0, f.r * 0.55); ctx.lineTo(f.r * 0.28, f.r * 0.8);
      ctx.moveTo(0, f.r * 0.55); ctx.lineTo(-f.r * 0.28, f.r * 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      if (!reduce) {
        f.y += f.vy; f.sw += f.ss; f.x += Math.sin(f.sw) * 0.4; f.rot += f.vr;
        var pt = window.__ptr;
        if (pt) {
          var ddx = f.x - pt.x, ddy = f.y - pt.y, d2 = ddx * ddx + ddy * ddy;
          if (d2 < 16900 && d2 > 1) { var dd = Math.sqrt(d2), pw = (130 - dd) / 130; f.x += ddx / dd * pw * 3.2; f.y += ddy / dd * pw * 2.2; }
        }
        if (f.y > H + 30) { f.y = -30; f.x = Math.random() * W; }
      }
      draw(f);
    }
    if (!reduce) window.requestAnimationFrame(frame);
  }

  setup();
  frame();
  window.addEventListener("resize", function () { setup(); if (reduce) frame(); });
})();

// Halaman 01 sampai 06: hanya satu bagian yang tampil, pindah lewat tombol.
(function () {
  var main = document.querySelector("main");
  if (!main) return;
  var pages = Array.prototype.filter.call(main.children, function (el) { return el.tagName === "SECTION"; });
  if (pages.length < 2) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var cur = 0;

  function btn(cls, text) {
    var b = document.createElement("button");
    b.type = "button"; b.className = cls; b.textContent = text;
    return b;
  }

  function catBtn(text) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "pg-num";
    b.innerHTML = '<svg viewBox="0 0 52 46" aria-hidden="true"><path class="hd" d="M7 22 L6 3 L19 11 Q26 9.5 33 11 L46 3 L45 22 Q50 32 42 39 Q26 46 10 39 Q2 32 7 22 Z"/><circle class="ey" cx="19" cy="20" r="1.9"/><circle class="ey" cx="33" cy="20" r="1.9"/></svg><span class="n"></span>';
    b.querySelector(".n").textContent = text;
    return b;
  }

  var nav = document.createElement("nav");
  nav.className = "pager";
  nav.setAttribute("aria-label", "Halaman");
  var tabs = pages.map(function (sec, i) {
    var no = sec.querySelector(".sec-no");
    var h = sec.querySelector("h2");
    var b = catBtn(no ? no.textContent.trim() : String(i + 1));
    if (h) b.title = h.textContent.trim();
    b.addEventListener("click", function () { go(i); });
    nav.appendChild(b);
    return b;
  });
  main.insertBefore(nav, pages[0]);

  var foot = document.createElement("div");
  foot.className = "pager-foot";
  var prev = btn("pg-btn", "← sebelumnya");
  var count = document.createElement("span");
  count.className = "count";
  var next = btn("pg-btn", "selanjutnya →");
  prev.addEventListener("click", function () { go(cur - 1); });
  next.addEventListener("click", function () { go(cur + 1); });
  foot.appendChild(prev); foot.appendChild(count); foot.appendChild(next);
  main.appendChild(foot);

  var timer = null;
  function go(i, quiet) {
    if (i < 0 || i >= pages.length) return;
    if (!quiet && i === cur) return;
    cur = i;
    document.dispatchEvent(new CustomEvent("pagechange", { detail: i }));
    tabs.forEach(function (b, k) {
      b.classList.toggle("on", k === i);
      if (k === i) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    prev.style.visibility = i === 0 ? "hidden" : "visible";
    next.style.visibility = i === pages.length - 1 ? "hidden" : "visible";
    count.textContent = (i + 1) + " / " + pages.length;
    clearTimeout(timer);
    if (quiet || reduce) {
      pages.forEach(function (sec, k) { sec.classList.remove("out"); sec.classList.toggle("on", k === i); });
      if (!quiet) window.scrollTo(0, 0);
      return;
    }
    // fade: halaman lama memudar, lalu halaman baru muncul pelan
    var leaving = pages.filter(function (sec) { return sec.classList.contains("on"); });
    leaving.forEach(function (sec) { sec.classList.remove("on"); sec.classList.add("out"); });
    window.scrollTo({ top: 0, behavior: "smooth" });
    timer = setTimeout(function () {
      pages.forEach(function (sec) { sec.classList.remove("out", "on"); });
      pages[i].classList.add("on");
      window.scrollTo(0, 0);
    }, leaving.length ? 380 : 0);
  }

  main.classList.add("paged");
  go(0, true);
  window.goPage = go;
  window.getPage = function () { return cur; };
  window.pageCount = pages.length;
})();

// Confetti pink + biru, kue ulang tahun, dan karakter yang bisa diketuk.
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var cv = document.getElementById("confetti");
  var ctx = cv && cv.getContext ? cv.getContext("2d") : null;
  var W = 0, H = 0, parts = [], running = false;
  var cols = ["#ffdde4", "#ff8fab", "#aab2d6", "#f3f5fa", "#ffd27a"];

  function size() {
    if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener("resize", size);

  function step() {
    ctx.clearRect(0, 0, W, H);
    for (var i = parts.length - 1; i >= 0; i--) {
      var q = parts[i];
      q.vy += 0.13; q.vx *= 0.99; q.x += q.vx; q.y += q.vy; q.rot += q.vr; q.life -= 1;
      if (q.life <= 0 || q.y > H + 20) { parts.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(q.x, q.y); ctx.rotate(q.rot);
      ctx.globalAlpha = Math.min(1, q.life / 30);
      ctx.fillStyle = q.c;
      ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
      ctx.restore();
    }
    if (parts.length) window.requestAnimationFrame(step);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  window.burst = function (x, y, n) {
    if (reduce || !ctx) return;
    n = n || 70;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 5,
        w: 5 + Math.random() * 6, h: 3 + Math.random() * 5, rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * cols.length) | 0],
        life: 90 + Math.random() * 60 });
    }
    if (!running) { running = true; window.requestAnimationFrame(step); }
  };

  // kue: ketuk lilin untuk meniup / menyalakan lagi
  var cake = document.querySelector(".cake");
  var hint = document.querySelector(".cake-hint");
  if (cake && hint) cake.addEventListener("click", function () {
    var off = cake.classList.toggle("out");
    hint.textContent = off ? "make a wish, Hanif (ketuk lagi buat nyalain)" : "ketuk lilinnya, terus make a wish";
    if (off) { var r = cake.getBoundingClientRect(); window.burst(r.left + r.width / 2, r.top + 30, 70); }
  });

  // karakter di halaman 04 loncat kalau diketuk
  Array.prototype.forEach.call(document.querySelectorAll(".duo-c"), function (el) {
    el.addEventListener("click", function () {
      el.classList.remove("hop"); void el.offsetWidth; el.classList.add("hop");
    });
  });
})();

// Gelembung latar (kue, balon, puding) dan amplop yang bisa dibuka.
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var box = document.getElementById("bubbles");
  if (box) {
    var icons = ["ico-cupcake", "ico-catb", "ico-balloon", "ico-pudding", "ico-catc", "ico-slice", "ico-star", "ico-catb", "ico-cupcake", "ico-catc"];
    var n = Math.round(Math.max(8, Math.min(16, window.innerWidth / 45)));
    for (var i = 0; i < n; i++) {
      var size = 44 + Math.random() * 34, dur = 22 + Math.random() * 20;
      var el = document.createElement("span");
      el.className = "bub";
      el.style.width = el.style.height = size + "px";
      el.style.left = (Math.random() * 94) + "%";
      el.style.setProperty("--d", dur + "s");
      el.style.setProperty("--dl", (-Math.random() * dur) + "s");
      el.style.setProperty("--sx", (14 + Math.random() * 30) + "px");
      el.style.setProperty("--o", (0.17 + Math.random() * 0.1).toFixed(2));
      if (reduce) el.style.bottom = (Math.random() * 88) + "%";
      el.innerHTML = ICO(icons[i % icons.length]);
      box.appendChild(el);
    }
  }

  var sec = document.getElementById("letterSec");
  var env = sec ? sec.querySelector(".envelope") : null;
  if (env) env.addEventListener("click", function () {
    if (sec.classList.contains("opened")) return;
    sec.classList.add("opened");
    var k = reduce ? 0 : 1;
    setTimeout(function () { sec.classList.add("fading"); }, 2100 * k);
    setTimeout(function () { sec.classList.add("done"); }, 2700 * k);
  });
})();

// Album tali jemuran: foto digantung di tali dengan penjepit kayu dan bingkai kotak-kotak, ditutup stiker (ketuk untuk membuka), dengan hiasan bunga, pita, dan kucing.
(function () {
  var album = document.querySelector(".album");
  if (!album) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tiles = Array.prototype.slice.call(album.querySelectorAll(".al"));
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function shuffle(arr) { return arr.slice().sort(function () { return Math.random() - 0.5; }); }

  var skins = ["fr-pink", "fr-purple", "fr-blue", "fr-yellow", "fr-red", "fr-green", "fr-brown"];
  var shapes = ["", "sq", "", "ls", ""];
  var cornerIco = ["ico-bow", "ico-flower", "ico-hibi", "ico-btn", "ico-bfly", "ico-gstar", "ico-gem"];
  var corners = [{ top: -12, right: -14 }, { bottom: -12, left: -14 }, { bottom: -12, right: -14 }, { top: 8, left: -16 }];
  var decoIco = ["ico-catb", "ico-catc", "ico-hibi", "ico-btn", "ico-bfly", "ico-gem", "ico-gstar", "ico-bow", "ico-flower"];

  tiles.forEach(function (el, i) {
    el.classList.add(skins[i % skins.length]);
    var sh = shapes[(i * 3 + 1) % shapes.length];
    if (sh) el.classList.add(sh);
    el.style.setProperty("--pd", (i * 0.04).toFixed(2) + "s");
    el.style.setProperty("--fd", rnd(3.6, 6.2).toFixed(1) + "s");
    el.style.setProperty("--fdl", (-rnd(0, 5)).toFixed(1) + "s");
    // hiasan kecil di sudut bingkai (tidak semua foto)
    if (i % 3 === 1) {
      var c = pick(corners), st = document.createElement("span"), sz = rnd(26, 38);
      st.className = "stk";
      st.style.width = st.style.height = sz.toFixed(0) + "px";
      Object.keys(c).forEach(function (k) { st.style[k] = c[k] + "px"; });
      st.style.animationDelay = (-rnd(0, 3)) + "s";
      st.style.animationDuration = rnd(3, 5).toFixed(1) + "s";
      st.innerHTML = ICO(pick(cornerIco));
      el.appendChild(st);
    }
  });

  // ---- tali bergelombang dari tepi layar kiri ke kanan. Foto dikelompokkan 2 per tali di HP, 3 per tali di layar lebar.
  var SVGNS = document.querySelector("svg").namespaceURI;
  function geo() {
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var mainW = Math.min(860, vw);
    return { vw: vw, cw: mainW - 56, off: (vw - mainW) / 2 + 28, n: vw < 600 ? 2 : 3 };
  }
  function line(d, stroke, w, extra) {
    var p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", d); p.setAttribute("fill", "none"); p.setAttribute("stroke", stroke);
    p.setAttribute("stroke-width", w); p.setAttribute("stroke-linejoin", "round");
    if (extra) Object.keys(extra).forEach(function (k) { p.setAttribute(k, extra[k]); });
    return p;
  }
  function addRopeDeco(row, g, ri, y) {
    var spots = g.n === 2 ? [g.off + g.cw * 0.5] : [g.off + g.cw / 3, g.off + g.cw * 2 / 3];
    if (g.off >= 70) spots.push(g.off * 0.5, g.vw - g.off * 0.5);
    var cnt = ri % 3 === 1 ? 2 : 1;
    shuffle(spots).slice(0, cnt).forEach(function (x) {
      var k = pick(decoIco), sz = rnd(30, 42);
      var d = document.createElement("span");
      d.className = "dec";
      d.style.left = (x - g.off - sz / 2).toFixed(0) + "px";
      d.style.width = d.style.height = sz.toFixed(0) + "px";
      d.style.top = (y(x) - sz / 2).toFixed(0) + "px";
      d.style.animationDelay = (-rnd(0, 3)) + "s";
      d.innerHTML = ICO(k);
      row.appendChild(d);
    });
  }
  var lastW = 0;
  function layout() {
    var g = geo();
    var live = tiles.filter(function (el) { return el.isConnected; });
    var old = Array.prototype.slice.call(album.querySelectorAll(".rope"));
    var frag = document.createDocumentFragment();
    var slots = g.n === 2 ? [0.25, 0.75] : [1 / 6, 1 / 2, 5 / 6];
    var A = g.n === 2 ? 14 : 20, base = 12;
    for (var i = 0, ri = 0; i < live.length; i += g.n, ri++) {
      var row = document.createElement("div");
      row.className = "rope";
      row.setAttribute("data-n", g.n);
      var L = g.cw * (g.n === 2 ? rnd(0.9, 1.2) : rnd(0.8, 1.0)), ph = rnd(0, Math.PI * 2);
      var y = function (x) { return base + A + A * Math.sin(((x - g.off) / L) * Math.PI * 2 + ph); };
      // tali: bayangan, badan tali, dan serat yang lebih terang
      var H = base * 2 + A * 2 + 8, d = "";
      for (var x = 0; x <= g.vw + 8; x += 8) d += (x ? " L" : "M") + x + " " + y(x).toFixed(1);
      var svg = document.createElementNS(SVGNS, "svg");
      svg.setAttribute("class", "wire"); svg.setAttribute("width", g.vw); svg.setAttribute("height", H);
      svg.setAttribute("aria-hidden", "true"); svg.style.left = (-g.off) + "px";
      var sh = line(d, "rgba(0,0,0,.28)", 9, { "stroke-linecap": "round" }); sh.setAttribute("transform", "translate(0 4)");
      svg.appendChild(sh);
      svg.appendChild(line(d, "#b98b55", 9));
      svg.appendChild(line(d, "#e3c493", 9, { "stroke-dasharray": "2 5", opacity: ".85" }));
      svg.appendChild(line(d, "#8d6537", 9, { "stroke-dasharray": "1.5 9", "stroke-dashoffset": "3", opacity: ".7" }));
      row.appendChild(svg);
      live.slice(i, i + g.n).forEach(function (el, k) {
        var xc = g.off + g.cw * slots[k];
        var slope = Math.atan2(y(xc + 8) - y(xc - 8), 16) * 180 / Math.PI;
        el.style.marginTop = (y(xc) + 12).toFixed(0) + "px";
        el.style.setProperty("--r", (slope * 0.6 + rnd(-2, 2)).toFixed(1) + "deg");
        row.appendChild(el);
      });
      for (var k = live.slice(i, i + g.n).length; k < g.n; k++) {
        var gp = document.createElement("span"); gp.className = "gap"; row.appendChild(gp);
      }
      addRopeDeco(row, g, ri, y);
      frag.appendChild(row);
    }
    album.insertBefore(frag, album.firstChild);
    old.forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); });
    lastW = g.vw;
  }
  layout();
  window.addEventListener("load", layout);
  var rt = null;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if ((document.documentElement.clientWidth || window.innerWidth) !== lastW) layout(); }, 150);
  });

  // ---- stiker penutup
  var coverIco = ["ico-catb", "ico-catc", "ico-cupcake", "ico-balloon", "ico-pudding", "ico-slice", "ico-star", "ico-fish", "ico-yarn", "ico-gift", "ico-flower", "ico-paw", "ico-sparkle"];
  var tints = ["#ffdde4", "#aab2d6", "#ffe29a", "#ffe5d4", "#d9ccf0", "#c9ecdc"];
  var opened = 0;
  function byAct(a) { var l = document.getElementsByClassName("shuf"); for (var i = 0; i < l.length; i++) if (l[i].getAttribute("data-act") === a) return l[i]; return null; }
  var openBtn = byAct("open");
  var nOpen = document.getElementById("openedN");
  var nTotal = document.getElementById("totalN");

  function total() { return album.querySelectorAll(".al").length; }
  function updateCount() {
    if (nOpen) nOpen.textContent = opened;
    if (nTotal) nTotal.textContent = total();
    if (openBtn) openBtn.textContent = opened >= total() ? "tutup lagi" : "buka semua";
  }
  function addCover(el) {
    var cv = document.createElement("span");
    cv.className = "cv";
    cv.style.setProperty("--tint", pick(tints));
    cv.style.setProperty("--cr", rnd(-4, 4).toFixed(1) + "deg");
    cv.innerHTML = ICO(pick(coverIco));
    el.appendChild(cv);
    el.classList.add("covered");
    if (window.scratchify) window.scratchify(cv, function () { reveal(el, true); });
  }
  function reveal(el, sparkle) {
    if (!el.classList.contains("covered")) return;
    var cv = el.querySelector(".cv");
    el.classList.remove("covered");
    opened++; updateCount();
    if (cv) {
      cv.classList.add("peel");
      setTimeout(function () { if (cv.parentNode) cv.parentNode.removeChild(cv); }, reduce ? 0 : 480);
    }
    if (sparkle && !reduce && window.burst) {
      var r = el.getBoundingClientRect();
      window.burst(r.left + r.width / 2, r.top + r.height / 2, 14);
    }
  }
  function openAll() {
    tiles.forEach(function (el, i) {
      if (!document.body.contains(el)) return;
      setTimeout(function () { reveal(el, false); }, reduce ? 0 : i * 45);
    });
  }
  function closeAll() {
    tiles.forEach(function (el) {
      if (!document.body.contains(el) || el.classList.contains("covered")) return;
      addCover(el); opened--;
    });
    updateCount();
  }

  tiles.forEach(function (el) {
    addCover(el);
    // selama masih tertutup, ketukan tidak membuka foto besar (harus digosok dulu);
    // tombol keyboard (Enter/Spasi) tetap bisa membuka langsung
    el.addEventListener("click", function (e) {
      if (el.classList.contains("covered")) { e.stopPropagation(); if (e.detail === 0) reveal(el, true); }
    });
  });
  updateCount();

  var mess = byAct("mess");
  if (mess) mess.addEventListener("click", function () { layout(); });
  if (openBtn) openBtn.addEventListener("click", function () { if (opened >= total()) closeAll(); else openAll(); });
})();

// Section 03 dan 04: tiap polaroid ditutup stiker (digosok untuk membuka) dan diberi hiasan stiker di sudutnya.
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function shuffle(arr) { return arr.slice().sort(function () { return Math.random() - 0.5; }); }
  var coverIco = ["ico-catb", "ico-catc", "ico-cupcake", "ico-balloon", "ico-pudding", "ico-slice", "ico-star", "ico-fish", "ico-yarn", "ico-gift", "ico-flower", "ico-paw", "ico-sparkle"];
  var decoIco = ["ico-catb", "ico-catc", "ico-star", "ico-paw", "ico-fish", "ico-yarn", "ico-sparkle", "ico-flower", "ico-gift", "ico-cupcake", "ico-balloon", "ico-pudding", "ico-slice", "ico-sparkle"];
  var tints = ["#ffdde4", "#aab2d6", "#ffe29a", "#ffe5d4", "#d9ccf0", "#c9ecdc"];
  var corners = [
    { top: -16, left: -15 }, { top: -16, right: -15 },
    { bottom: -13, left: -15 }, { bottom: -13, right: -15 }
  ];

  Array.prototype.forEach.call(document.querySelectorAll("section.pola"), function (sec) {
    var phs = Array.prototype.filter.call(sec.querySelectorAll(".ph"), function (p) { return p.querySelector("img"); });
    var first = sec.querySelector(".sub");
    if (!phs.length || !first) return;
    var opened = 0;

    var ctl = document.createElement("div");
    ctl.className = "album-ctl";
    ctl.innerHTML = '<button class="shuf" type="button">buka semua</button>' +
      '<p class="album-count"><span class="pn">0</span> / <span class="pt"></span> foto terbuka · gosok fotonya ya buat ngintip</p>';
    first.parentNode.insertBefore(ctl, first.nextSibling);
    var btn = ctl.querySelector(".shuf");
    var nOpen = ctl.querySelector(".pn");
    ctl.querySelector(".pt").textContent = phs.length;

    function update() {
      nOpen.textContent = opened;
      btn.textContent = opened >= phs.length ? "tutup lagi" : "buka semua";
    }
    function addCover(ph) {
      var cv = document.createElement("span");
      cv.className = "cv";
      cv.style.setProperty("--tint", pick(tints));
      cv.style.setProperty("--cr", rnd(-3, 3).toFixed(1) + "deg");
      cv.innerHTML = ICO(pick(coverIco));
      cv.addEventListener("click", function (e) { e.stopPropagation(); });
      ph.appendChild(cv);
      ph.classList.add("covered");
      if (window.scratchify) window.scratchify(cv, function () { reveal(ph, true); }, { focusable: true });
    }
    function reveal(ph, sparkle) {
      if (!ph.classList.contains("covered")) return;
      var cv = ph.querySelector(".cv");
      ph.classList.remove("covered");
      opened++; update();
      if (cv) {
        cv.classList.add("peel");
        setTimeout(function () { if (cv.parentNode) cv.parentNode.removeChild(cv); }, reduce ? 0 : 480);
      }
      if (sparkle && !reduce && window.burst) {
        var r = ph.getBoundingClientRect();
        window.burst(r.left + r.width / 2, r.top + Math.min(r.height / 2, 260), 18);
      }
    }
    function openAll() {
      phs.forEach(function (ph, i) { setTimeout(function () { reveal(ph, false); }, reduce ? 0 : i * 140); });
    }
    function closeAll() {
      phs.forEach(function (ph) {
        if (ph.classList.contains("covered")) return;
        addCover(ph); opened--;
      });
      update();
    }
    btn.addEventListener("click", function () { if (opened >= phs.length) closeAll(); else openAll(); });

    phs.forEach(function (ph, i) {
      addCover(ph);
      // gerakan seperti foto di halaman 07: muncul membal, lalu menggantung dan bergoyang pelan (tiap foto beda tempo)
      ph.style.setProperty("--pd", (i * 0.08).toFixed(2) + "s");
      ph.style.setProperty("--fd", rnd(4, 6.6).toFixed(1) + "s");
      ph.style.setProperty("--fdl", (-rnd(0, 5)).toFixed(1) + "s");
      ph.style.setProperty("--sw", rnd(0.7, 1.3).toFixed(2) + "deg");
      ph.style.setProperty("--r", (i % 2 ? rnd(1.3, 2.3) : -rnd(1.6, 2.6)).toFixed(1) + "deg");
      // hiasan stiker di 2-3 sudut polaroid
      var picks = shuffle(corners).slice(0, Math.random() < 0.5 ? 3 : 2);
      picks.forEach(function (c) {
        var st = document.createElement("span");
        st.className = "stk ph-stk";
        var sz = rnd(30, 46);
        st.style.width = st.style.height = sz + "px";
        Object.keys(c).forEach(function (k) { st.style[k] = c[k] + "px"; });
        st.style.animationDelay = (-rnd(0, 3)) + "s";
        st.style.animationDuration = rnd(2.4, 4.2).toFixed(1) + "s";
        st.innerHTML = ICO(pick(decoIco));
        ph.appendChild(st);
      });
    });
    update();
  });
})();

// Halaman 08: daftar lagu. Cukup ubah isi SONGS di bawah ini.
//   title  = judul lagu          artist = nama penyanyi
//   src    = file mp3 di folder (mis. "lagu/01.mp3"). Kalau diisi, tombol play memutar di halaman dengan bar berjalan.
//   link   = (opsional, dipakai kalau src kosong) link Spotify/YouTube; tombol play membukanya, tanpa bar.
//   icon   = ikon cover: ico-catb, ico-catc, ico-cupcake, ico-slice, ico-balloon, ico-pudding, ico-star, ico-paw,
//            ico-fish, ico-yarn, ico-sparkle, ico-flower, ico-gift, ico-hibi, ico-bow, ico-btn, ico-bfly, ico-gem, ico-gstar
//   tint   = warna latar cover       desc = deskripsi di bawah kotak lagu
(function () {
  var SONGS = [
    { title: "Paris in the Rain", artist: "Lauv", src: "lagu/paris-in-the-rain.mp3", icon: "ico-balloon", tint: "#aab2d6",
      desc: "anywhere with you feels right, anywhere with you feels like paris in the rain" },
    { title: "Dive", artist: "Ed Sheeran", src: "lagu/dive.mp3", icon: "ico-gift", tint: "#ffe5d4",
      desc: "so don't call me baby, unless you mean it" },
    { title: "Mean It", artist: "Lauv", src: "lagu/mean-it.mp3", icon: "ico-cupcake", tint: "#d9ccf0",
      desc: "last night we were more than fine, just tell me if you changed your mind" },
    { title: "Super Far", artist: "LANY", src: "lagu/super-far.mp3", icon: "ico-fish", tint: "#c9ecdc",
      desc: "but my heart is so invested, I don't wanna face the truth" },
    { title: "Cause You Have To", artist: "LANY", src: "lagu/cause-you-have-to.mp3", icon: "ico-catc", tint: "#ffdde4",
      desc: "do you only love me cause you have to?" },
    { title: "Payphone", artist: "Maroon 5", src: "lagu/payphone.mp3", icon: "ico-paw", tint: "#ffe5d4",
      desc: "where are the plans we made for two?" },
    { title: "Malibu Nights", artist: "LANY", src: "lagu/malibu-nights.mp3", icon: "ico-pudding", tint: "#c9ecdc",
      desc: "I've got way too much time to be this hurt" },
    { title: "Falling", artist: "Harry Styles", src: "lagu/falling.mp3", icon: "ico-gem", tint: "#c9ecdc",
      desc: "what if I'm someone you won't talk about?" },
    { title: "Hati-Hati di Jalan", artist: "Tulus", src: "lagu/hati-hati-di-jalan.mp3", icon: "ico-catb", tint: "#aab2d6",
      desc: "kau melanjutkan perjalananmu, ku melanjutkan perjalananku" }
  ];

  var list = document.getElementById("songList");
  var sec = document.getElementById("songsSec");
  if (!list || !sec) return;
  var bgm = document.getElementById("bgm");
  var audio = new Audio();
  audio.preload = "none";
  var cur = null, bgmWas = false;

  var PLAY = '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  var PAUSE = '<svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>';
  function esc(t) { var d = document.createElement("div"); d.textContent = t == null ? "" : t; return d.innerHTML.replace(/"/g, "&quot;"); }
  function fmt(n) { n = Math.max(0, Math.floor(n)); return Math.floor(n / 60) + ":" + ("0" + (n % 60)).slice(-2); }

  function paint(s, t, d) {
    var f = d > 0 && isFinite(d) ? Math.min(1, t / d) : 0;
    s.fill.style.width = (f * 100) + "%";
    s.cat.style.left = (f * 100) + "%";
    s.el.textContent = fmt(t);
    s.rm.textContent = d > 0 && isFinite(d) ? (t > 0.5 ? "-" : "") + fmt(Math.ceil(d - t)) : "--:--";
    s.slider.setAttribute("aria-valuenow", Math.round(f * 100));
  }
  function setPlaying(s, yes) {
    s.root.classList.toggle("on", yes);
    s.btn.setAttribute("aria-label", (yes ? "Jeda " : "Putar ") + s.title);
  }
  function resetUI(s) { paint(s, 0, s.dur || 0); setPlaying(s, false); }
  function duckBgm() { if (bgm && !bgm.paused) { bgm.pause(); bgmWas = true; } }
  function restoreBgm() {
    if (bgm && bgmWas) { bgmWas = false; try { var p = bgm.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  }
  function fail() {
    if (cur) { resetUI(cur); cur = null; }
    restoreBgm();
    if (window.toast) window.toast("file lagunya belum ketemu, cek folder lagu/ ya");
  }

  var items = SONGS.map(function (d) {
    var root = document.createElement("article");
    root.className = "song" + (d.src ? "" : " nobar");
    root.innerHTML =
      '<div class="sbox"><div class="srow">' +
        '<div class="sart" style="background:' + esc(d.tint || "#ffdde4") + '">' + ICO(d.icon || "ico-catb") + '</div>' +
        '<div class="stx"><span class="stt">' + esc(d.title) + '</span><span class="ssg">' + esc(d.artist) + '</span></div>' +
        '<button class="spl" type="button">' + PLAY + PAUSE + '</button></div>' +
      '<div class="spr"><span class="sel">0:00</span>' +
        '<div class="sbw" role="slider" tabindex="0" aria-label="Posisi lagu" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
          '<div class="sbar"><div class="sfill"></div></div><span class="scat">' + ICO("ico-catb") + '</span></div>' +
        '<span class="sfish" aria-hidden="true">' + ICO("ico-fish") + '</span><span class="srm">--:--</span></div></div>' +
      '<p class="sdesc"></p>';
    root.querySelector(".sdesc").textContent = d.desc || "";
    list.appendChild(root);

    var s = {
      d: d, title: d.title, src: d.src || "", link: d.link || "", dur: 0, root: root,
      btn: root.querySelector(".spl"), slider: root.querySelector(".sbw"),
      fill: root.querySelector(".sfill"), cat: root.querySelector(".scat"),
      el: root.querySelector(".sel"), rm: root.querySelector(".srm")
    };
    setPlaying(s, false);

    // ambil durasi total supaya langsung tampil sebelum lagunya diputar
    // (dijalankan sekali, waktu halaman 08 pertama kali dibuka, biar halaman lain nggak ikut berat)
    if (s.src) s.probe = function () {
      var probe = new Audio();
      probe.preload = "metadata";
      probe.addEventListener("loadedmetadata", function () { s.dur = probe.duration; if (cur !== s) paint(s, 0, s.dur); });
      probe.src = s.src;
      s.probe = null;
    };

    // geser / ketuk bar untuk loncat ke bagian lain (hanya untuk lagu yang sedang aktif)
    var drag = false;
    function seek(e) {
      if (cur !== s) return;
      var dur = audio.duration || s.dur;
      if (!dur || !isFinite(dur)) return;
      var r = s.slider.getBoundingClientRect();
      audio.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur;
      paint(s, audio.currentTime, dur);
    }
    s.slider.addEventListener("pointerdown", function (e) {
      if (cur !== s) return;
      drag = true;
      try { s.slider.setPointerCapture(e.pointerId); } catch (x) {}
      seek(e);
    });
    s.slider.addEventListener("pointermove", function (e) { if (drag) seek(e); });
    s.slider.addEventListener("pointerup", function () { drag = false; });
    s.slider.addEventListener("pointercancel", function () { drag = false; });
    s.slider.addEventListener("keydown", function (e) {
      if (cur !== s) return;
      var dur = audio.duration || s.dur, step = e.key === "ArrowRight" ? 5 : e.key === "ArrowLeft" ? -5 : 0;
      if (!step) return;
      e.preventDefault(); e.stopPropagation();
      audio.currentTime = Math.min(dur, Math.max(0, audio.currentTime + step));
      paint(s, audio.currentTime, dur);
    });

    s.btn.addEventListener("click", function () {
      if (!s.src) { if (s.link) window.open(s.link, "_blank", "noopener"); return; }
      if (cur === s) {
        if (audio.paused) { var p0 = audio.play(); if (p0 && p0.catch) p0.catch(fail); } else audio.pause();
        return;
      }
      if (cur) resetUI(cur);
      cur = s;
      duckBgm();
      audio.src = s.src;
      var p = audio.play();
      if (p && p.catch) p.catch(function (err) { if (!err || err.name !== "AbortError") fail(); });
    });
    return s;
  });

  audio.addEventListener("play", function () { if (cur) { setPlaying(cur, true); duckBgm(); } });
  audio.addEventListener("pause", function () { if (cur && !audio.ended) setPlaying(cur, false); });
  audio.addEventListener("loadedmetadata", function () { if (cur) { cur.dur = audio.duration; paint(cur, audio.currentTime, cur.dur); } });
  audio.addEventListener("timeupdate", function () { if (cur) paint(cur, audio.currentTime, audio.duration || cur.dur); });
  audio.addEventListener("ended", function () { if (cur) { resetUI(cur); cur = null; } restoreBgm(); });
  audio.addEventListener("error", function () { if (cur) fail(); });

  // pindah dari halaman 08: lagu dijeda dan musik latar balik lagi
  var main = document.querySelector("main");
  var idx = Array.prototype.filter.call(main.children, function (n) { return n.tagName === "SECTION"; }).indexOf(sec);
  var probed = false;
  document.addEventListener("pagechange", function (e) {
    if (e.detail === idx && !probed) { probed = true; items.forEach(function (s) { if (s.probe) s.probe(); }); }
    if (e.detail !== idx && cur && !audio.paused) { audio.pause(); restoreBgm(); }
  });
  window.__songs = items;
})();

// Tambahan interaksi: efek ketuk, jejak kursor, salju yang menghindar, geser/panah pindah halaman,
// progres baca, teks muncul saat digulir, typewriter, bintang & kucing yang bisa diajak main, swipe di foto besar.
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var body = document.body;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function burst(x, y, n) { if (window.burst) window.burst(x, y, n); }

  // ---------- posisi jari / kursor, dipakai salju ----------
  window.__ptr = null;
  document.addEventListener("pointerdown", function (e) { window.__ptr = { x: e.clientX, y: e.clientY }; }, { passive: true });
  document.addEventListener("pointermove", function (e) { window.__ptr = { x: e.clientX, y: e.clientY }; }, { passive: true });
  function clearPtr(e) { if (e.pointerType !== "mouse") window.__ptr = null; }
  document.addEventListener("pointerup", clearPtr);
  document.addEventListener("pointercancel", clearPtr);
  document.documentElement.addEventListener("mouseleave", function () { window.__ptr = null; });

  // ---------- toast kecil ----------
  var toastEl = document.createElement("div");
  toastEl.className = "toast";
  toastEl.setAttribute("role", "status");
  body.appendChild(toastEl);
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, 3400);
  }
  window.toast = toast;

  // ---------- hati & bintang kecil: ketuk di mana saja, jejak kursor di desktop ----------
  var glyphs = ["♡", "✦", "✧", "♥"];
  var cols = ["#ffdde4", "#ff8fab", "#ffd27a", "#aab2d6"];
  var live = 0;
  function spawn(x, y, ch, spread, dur) {
    if (live > 44) return;
    var el = document.createElement("span"), gone = false;
    el.className = "tapfx";
    el.textContent = ch;
    el.style.left = x + "px"; el.style.top = y + "px";
    el.style.color = pick(cols);
    el.style.fontSize = rnd(12, 22).toFixed(0) + "px";
    el.style.setProperty("--dx", rnd(-spread, spread).toFixed(0) + "px");
    el.style.setProperty("--dy", (-rnd(spread * 0.6, spread * 1.8)).toFixed(0) + "px");
    el.style.setProperty("--rt", rnd(-60, 60).toFixed(0) + "deg");
    el.style.animationDuration = dur + "ms";
    live++;
    function rm() { if (gone) return; gone = true; live--; if (el.parentNode) el.parentNode.removeChild(el); }
    el.addEventListener("animationend", rm);
    setTimeout(rm, dur + 300);
    body.appendChild(el);
  }
  if (!reduce) {
    document.addEventListener("pointerdown", function (e) {
      for (var i = 0; i < 5; i++) spawn(e.clientX, e.clientY, pick(glyphs), 46, rnd(700, 1100));
    }, { passive: true });
    var lastTrail = 0;
    document.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var t = performance.now();
      if (t - lastTrail < 80) return;
      lastTrail = t;
      spawn(e.clientX, e.clientY, pick(["✦", "✧"]), 14, 800);
    }, { passive: true });
  }

  // ---------- progres baca di bagian atas ----------
  var bar = document.getElementById("progress");
  function prog() {
    if (!bar) return;
    var n = window.pageCount || 1, c = window.getPage ? window.getPage() : 0;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var f = h > 10 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
    bar.style.width = (((c + 0.12 + 0.88 * f) / n) * 100).toFixed(1) + "%";
  }
  window.addEventListener("scroll", prog, { passive: true });
  window.addEventListener("resize", prog);
  document.addEventListener("pagechange", function () { setTimeout(prog, 60); setTimeout(prog, 480); });
  prog();

  // ---------- pindah halaman dengan tombol panah atau geser layar ----------
  function lbOn() { var b = document.getElementById("lightbox"); return !!(b && b.classList.contains("on")); }
  document.addEventListener("keydown", function (e) {
    if (!window.goPage || body.classList.contains("locked") || lbOn()) return;
    if (e.target && e.target.closest && e.target.closest("[role=slider]")) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var c = window.getPage();
    if (e.key === "ArrowRight") window.goPage(c + 1);
    else if (e.key === "ArrowLeft") window.goPage(c - 1);
  });
  var sx = 0, sy = 0, st0 = 0, tracking = false;
  document.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1 || body.classList.contains("locked") || lbOn() || (e.target && e.target.closest && e.target.closest("[role=slider], .cv.scratch"))) { tracking = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st0 = Date.now(); tracking = true;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (!tracking || !window.goPage) return;
    tracking = false;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st0 > 700 || Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    var c = window.getPage();
    window.goPage(dx < 0 ? c + 1 : c - 1);
  }, { passive: true });
  var pf = document.querySelector(".pager-foot");
  if (pf) {
    var hint = document.createElement("p");
    hint.className = "swipe-hint";
    hint.textContent = "tips: geser layar ke kiri/kanan buat pindah halaman (di laptop: panah ← →, angka 1–8, dan M buat musik)";
    pf.parentNode.insertBefore(hint, pf.nextSibling);
  }

  // ---------- teks muncul pelan-pelan saat digulir ----------
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    Array.prototype.forEach.call(document.querySelectorAll("main > section p"), function (p) {
      if (p.matches(".cake-hint, .album-count, .env-hint, .star-msg")) return;
      p.classList.add("rv");
      io.observe(p);
    });
  }

  // ---------- tagline diketik setelah layar pembuka hilang ----------
  var tg = document.querySelector(".tagline");
  if (tg && !reduce) {
    var full = tg.textContent.trim();
    tg.innerHTML = '<span class="sr-only"></span><span aria-hidden="true"><span class="ty-v"></span><span class="ty-h" style="visibility:hidden"></span></span>';
    tg.querySelector(".sr-only").textContent = full;
    var tv = tg.querySelector(".ty-v"), th = tg.querySelector(".ty-h");
    th.textContent = full;
    var typeIt = function () {
      var i = 0;
      tv.classList.add("typing");
      (function tick() {
        i++;
        tv.textContent = full.slice(0, i); th.textContent = full.slice(i);
        if (i < full.length) setTimeout(tick, 28 + Math.random() * 45);
        else tv.classList.remove("typing");
      })();
    };
    if (body.classList.contains("splash-on")) {
      var mo = new MutationObserver(function () {
        if (body.classList.contains("splash-gone")) { mo.disconnect(); setTimeout(typeIt, 800); }
      });
      mo.observe(body, { attributes: true, attributeFilter: ["class"] });
    } else typeIt();
  }

  // ---------- halaman 02: ketuk bintangnya satu-satu ----------
  var starsBox = document.querySelector(".stars");
  var stars = starsBox ? Array.prototype.slice.call(starsBox.querySelectorAll(".star")) : [];
  if (stars.length) {
    var starMsg = document.createElement("p");
    starMsg.className = "star-msg";
    starMsg.setAttribute("aria-live", "polite");
    starMsg.textContent = "ketuk bintangnya satu-satu ✦";
    starsBox.parentNode.insertBefore(starMsg, starsBox.nextSibling);
    var hit = {};
    stars.forEach(function (el, i) {
      el.addEventListener("click", function () {
        if (el.animate && !reduce) {
          el.animate([{ transform: "rotate(0deg) scale(1)" }, { transform: "rotate(200deg) scale(1.6)" }, { transform: "rotate(360deg) scale(1)" }],
            { duration: 650, easing: "cubic-bezier(.2,1.4,.4,1)" });
        }
        var r = el.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, 26);
        el.classList.add("lit");
        hit[i] = 1;
        var n = Object.keys(hit).length;
        if (n < stars.length) starMsg.textContent = n + " / " + stars.length + " bintang ✦";
        else {
          starMsg.textContent = stars.length + " / " + stars.length + " bintang terkumpul ✦ happy birthday, Hanif!";
          starMsg.classList.add("full");
          burst(window.innerWidth / 2, r.top, 90);
        }
      });
    });
  }

  // ---------- halaman 04: kucing bisa ngomong macam-macam ----------
  var lines = [
    ["ayo main", "onmic ga?", "mro yuk!", "aku main assassin ya!", "aku main gusion nih", "yey!"],
    ["gas!", "ayoo", "yuk!", "aku main support ya!", "keren!", "mvp-nya kamu"]
  ];
  Array.prototype.forEach.call(document.querySelectorAll(".duo-c"), function (el, i) {
    var b = el.querySelector(".bubble"), set = lines[i % 2], k = 0;
    if (!b) return;
    el.addEventListener("click", function () {
      k = (k + 1) % set.length;
      b.textContent = set[k];
      if (b.animate && !reduce) {
        b.animate([{ transform: "translateX(-50%) scale(.6)" }, { transform: "translateX(-50%) scale(1.14)" }, { transform: "translateX(-50%) scale(1)" }], { duration: 340 });
      }
      var r = el.getBoundingClientRect();
      if (!reduce) for (var j = 0; j < 3; j++) spawn(r.left + r.width / 2, r.top + 8, "♡", 40, 1100);
    });
  });

  // ---------- easter egg: ketuk judul 5 kali ----------
  var h1 = document.querySelector(".hero h1"), taps = 0, tapTimer;
  if (h1) h1.addEventListener("click", function () {
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function () { taps = 0; }, 1200);
    if (taps >= 5) {
      taps = 0;
      for (var i = 0; i < 5; i++) setTimeout(function () { burst(rnd(60, window.innerWidth - 60), rnd(80, window.innerHeight * 0.6), 60); }, i * 220);
      toast("psst… kamu nemu easter egg! happy birthday, Hanif!");
    }
  });

  // ---------- album & polaroid: kabari kalau semua foto sudah dibuka ----------
  Array.prototype.forEach.call(document.querySelectorAll(".album-ctl"), function (ctl) {
    var a = ctl.querySelector("#openedN, .pn"), t = ctl.querySelector("#totalN, .pt"), done = false;
    if (!a || !t) return;
    new MutationObserver(function () {
      var o = parseInt(a.textContent, 10) || 0, tot = parseInt(t.textContent, 10) || 0;
      if (tot > 0 && o >= tot) {
        if (!done) { done = true; toast("semua fotonya udah kebuka!"); burst(window.innerWidth / 2, window.innerHeight * 0.45, 70); }
      } else done = false;
    }).observe(ctl, { childList: true, subtree: true, characterData: true });
  });

  // ---------- amplop: hati melayang waktu dibuka ----------
  var env = document.querySelector("#letterSec .envelope");
  if (env) env.addEventListener("click", function once() {
    env.removeEventListener("click", once);
    var r = env.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 50);
    if (!reduce) for (var i = 0; i < 8; i++) setTimeout(function () { spawn(r.left + rnd(0, r.width), r.top + r.height * 0.5, "♡", 90, 1500); }, i * 110);
  });

  // ---------- foto besar: geser kiri/kanan untuk pindah foto ----------
  var lb = document.getElementById("lightbox"), lx = 0, ly = 0;
  if (lb) {
    lb.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) { lx = e.touches[0].clientX; ly = e.touches[0].clientY; }
    }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (!lb.classList.contains("scroll")) return;
      var t = e.changedTouches[0], dx = t.clientX - lx, dy = t.clientY - ly;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        var b = lb.querySelector('[data-lb="' + (dx < 0 ? "next" : "prev") + '"]');
        if (b) b.click();
      }
    }, { passive: true });
  }
})();

// Interaksi baru: tulis wish setelah lilin ditiup, ornamen yang bisa diketuk,
// pintasan keyboard (angka 1-8 dan M), dan perayaan kecil di halaman terakhir.
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var body = document.body;
  function say(msg) { if (window.toast) window.toast(msg); }
  function pop(x, y, n) { if (window.burst) window.burst(x, y, n); }

  // ---------- 1. tulis wish: muncul setelah lilin ditiup, lalu terbang jadi bintang ----------
  var cake = document.querySelector(".cake");
  var wrap = document.querySelector(".cake-wrap");
  if (cake && wrap) {
    var form = document.createElement("form");
    form.className = "wish";
    form.hidden = true;
    form.autocomplete = "off";
    var input = document.createElement("input");
    input.type = "text";
    input.maxLength = 80;
    input.placeholder = "tulis wish-mu, aku ga bakal bisa liat";
    input.setAttribute("aria-label", "Tulis wish");
    input.setAttribute("enterkeyhint", "send");
    var send = document.createElement("button");
    send.type = "submit";
    send.className = "shuf";
    send.textContent = "terbangkan ✦";
    form.appendChild(input);
    form.appendChild(send);
    wrap.appendChild(form);

    // kecilkan huruf secukupnya supaya seluruh placeholder muat di kotak (layar sempit sekalipun)
    var measure = document.createElement("canvas").getContext("2d");
    function fit() {
      if (form.hidden || !input.clientWidth || !measure) return;
      var cs = getComputedStyle(input);
      var avail = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
      var base = 22;
      measure.font = base + "px " + cs.fontFamily;
      var w = measure.measureText(input.placeholder).width;
      input.style.fontSize = (w > avail ? Math.max(13, Math.floor(base * avail / w * 10) / 10) : base) + "px";
    }
    function sync() { form.hidden = !cake.classList.contains("out"); fit(); }
    new MutationObserver(sync).observe(cake, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    sync();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.replace(/\s+/g, " ").trim();
      if (!text) { say("tulis dulu wish-nya yaa ✦"); input.focus(); return; }
      input.value = "";
      input.blur();
      var r = cake.getBoundingClientRect();
      var cx = r.left + r.width / 2, top = r.top + 10;
      pop(cx, top, 40);
      if (!reduce) {
        var note = document.createElement("div");
        note.className = "wishnote";
        note.textContent = "✦ " + text + " ✦";
        note.style.left = cx + "px";
        note.style.top = top + "px";
        document.body.appendChild(note);
        if (note.animate) {
          var fly = note.animate([
            { opacity: 0, transform: "translate(-50%, 0) scale(.6)" },
            { opacity: 1, transform: "translate(-50%, -40px) scale(1)", offset: .15 },
            { opacity: 1, transform: "translate(-50%, -190px) scale(1)", offset: .7 },
            { opacity: 0, transform: "translate(-50%, -290px) scale(.9)" }
          ], { duration: 3600, easing: "ease-out" });
          fly.onfinish = function () { if (note.parentNode) note.parentNode.removeChild(note); };
        } else if (note.parentNode) note.parentNode.removeChild(note);
      }
      say("wish-nya udah terbang ke langit ✦ semoga terkabul");
    });
  }

  // ---------- 2. ornamen ✦ ♡ ✦: ketuk buat pesan kecil ----------
  var notes = [
    "semangat terus, Hanif ✦",
    "jangan lupa minum air putih ya",
    "semoga harimu menyenangkan ♡",
    "jaga kesehatan ya, jangan begadang",
    "senyum dulu dong ✦"
  ];
  var ni = 0;
  Array.prototype.forEach.call(document.querySelectorAll(".orn"), function (el) {
    el.addEventListener("click", function () {
      el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse");
      var r = el.getBoundingClientRect();
      pop(r.left + r.width / 2, r.top + r.height / 2, 22);
      say(notes[ni % notes.length]);
      ni++;
    });
  });

  // ---------- 3. pintasan keyboard: angka 1-8 loncat halaman, M putar/jeda musik ----------
  function lbOpen() { var b = document.getElementById("lightbox"); return !!(b && b.classList.contains("on")); }
  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (body.classList.contains("locked") || lbOpen()) return;
    var t = e.target;
    if (t && t.closest && t.closest("input, textarea, select, [contenteditable], [role=slider]")) return;
    if (/^[1-9]$/.test(e.key) && window.goPage && window.pageCount) {
      var n = parseInt(e.key, 10);
      if (n <= window.pageCount) window.goPage(n - 1);
    } else if (e.key === "m" || e.key === "M") {
      var mb = document.getElementById("musicBtn");
      if (mb && !mb.hidden) mb.click();
    }
  });

  // ---------- 4. halaman terakhir: perayaan kecil, sekali saja ----------
  var celebrated = false;
  document.addEventListener("pagechange", function (e) {
    if (celebrated || !window.pageCount || e.detail !== window.pageCount - 1) return;
    celebrated = true;
    setTimeout(function () {
      pop(window.innerWidth / 2, window.innerHeight * 0.35, 80);
      say("kamu sampai di halaman terakhir ✦ makasih ya udah baca sampe sini");
    }, 700);
  });
})();

// Parallax: lapisan yang berbeda bergerak dengan kecepatan berbeda supaya halaman terasa punya kedalaman.
//   - gelembung latar bergeser pelan saat digulir dan sedikit berlawanan arah dengan kursor
//   - judul dan tagline di atas bergerak lebih lambat daripada halaman
//   - polaroid (halaman 03, 04) dan tali foto (halaman 07) bergeser tipis sesuai posisinya di layar
//   - dua kucing di halaman 04 menoleh ke arah kursor (hanya di perangkat dengan mouse)
// Semua nilai dipasang lewat properti CSS `translate`. Ubah angka di bagian "PENGATURAN" kalau mau lebih kuat / lebih halus.
(function () {
  var mm = window.matchMedia;
  if (mm && mm("(prefers-reduced-motion: reduce)").matches) return;
  if (window.CSS && CSS.supports && !CSS.supports("translate", "0 1px")) return;

  // ---------- PENGATURAN ----------
  var BG_SCROLL = 0.10;   // latar turun sebanyak ini x tinggi layar dari atas ke bawah halaman
  var BG_POINTER = 10;    // px, latar bergeser berlawanan dengan kursor
  var CAT_POINTER = 8;    // px, kucing halaman 04 menoleh ke kursor
  // selector, mode ("scroll" = ikut jarak gulir, "center" = ikut jarak dari tengah layar), kedalaman, batas geser (px)
  var LAYERS = [
    { sel: ".hero h1", mode: "scroll", depth: 0.12, max: 40 },
    { sel: ".tagline", mode: "scroll", depth: 0.06, max: 24 },
    { sel: ".pola .ph", mode: "center", depth: [-0.025, 0.02], max: 10 },
    { sel: ".rope", mode: "center", depth: [-0.03, 0.02], max: 12 }
  ];
  // --------------------------------

  var root = document.documentElement;
  var bubbles = document.getElementById("bubbles");
  var hover = !!(mm && mm("(hover: hover) and (pointer: fine)").matches);
  var mx = 0, my = 0, queued = false;
  var meta = new WeakMap();
  var selAll = LAYERS.map(function (l) { return l.sel; }).join(",");

  function clamp(v, m) { return v < -m ? -m : v > m ? m : v; }

  function metaOf(el) {
    var m = meta.get(el);
    if (m) return m;
    for (var i = 0; i < LAYERS.length; i++) {
      if (!el.matches(LAYERS[i].sel)) continue;
      var L = LAYERS[i], d = L.depth;
      if (Array.isArray(d)) d = d[Array.prototype.indexOf.call(el.parentNode.children, el) % 2];
      m = { mode: L.mode, depth: d, max: L.max, now: 0 };
      meta.set(el, m);
      return m;
    }
    return null;
  }

  function frame() {
    queued = false;
    var vh = window.innerHeight, vc = vh / 2, sy = window.scrollY || window.pageYOffset || 0;
    var els = document.querySelectorAll(selAll), jobs = [], i;

    // 1) baca dulu semua posisi, 2) baru tulis, supaya browser tidak menghitung ulang tata letak berkali-kali
    for (i = 0; i < els.length; i++) {
      var el = els[i], m = metaOf(el);
      if (!m) continue;
      var r = el.getBoundingClientRect();
      if (!r.height || r.bottom < -300 || r.top > vh + 300) continue;
      var v = m.mode === "scroll" ? sy * m.depth : -((r.top + r.height / 2 - m.now) - vc) * m.depth;
      jobs.push([el, m, clamp(v, m.max)]);
    }
    for (i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      if (Math.abs(j[2] - j[1].now) < 0.15) continue;
      j[1].now = j[2];
      j[0].style.translate = "0 " + j[2].toFixed(1) + "px";
    }

    if (bubbles) {
      var h = root.scrollHeight - vh, f = h > 10 ? clamp(sy / h, 1) : 0;
      if (f < 0) f = 0;
      bubbles.style.translate = (-mx * BG_POINTER).toFixed(1) + "px " + (-(f * BG_SCROLL * vh) - my * BG_POINTER * 0.6).toFixed(1) + "px";
    }

    if (hover) {
      var cats = document.querySelectorAll(".duo .chr");
      for (i = 0; i < cats.length; i++) {
        var k = i % 2 ? 1.5 : 1;
        cats[i].style.translate = (mx * CAT_POINTER * k).toFixed(1) + "px " + (my * CAT_POINTER * 0.5 * k).toFixed(1) + "px";
      }
    }
  }

  function request() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(frame);
  }

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  if (hover) {
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      mx = (e.clientX / (window.innerWidth || 1) - 0.5) * 2;
      my = (e.clientY / (window.innerHeight || 1) - 0.5) * 2;
      request();
    }, { passive: true });
  }
  // pindah halaman, album diacak ulang, atau tulisan diketik: hitung ulang
  document.addEventListener("pagechange", function () { request(); setTimeout(request, 60); setTimeout(request, 500); });
  var mainEl = document.querySelector("main");
  if (mainEl && "MutationObserver" in window) new MutationObserver(request).observe(mainEl, { childList: true, subtree: true });
  request();
})();
