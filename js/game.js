/* Fishes — game rules, AI, drawing, input and the ⚙️ panel.
   Canvas 2D, no build step. World units are game units; the camera zooms out
   as the fish grows. See schematic.md for the rules and tuning constants. */
(function () {
  'use strict';

  var D = window.FishData;
  var SPECIES = D.SPECIES;
  var CFG = D.CONFIG;
  var OUT = '#2d3a4a';

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('view');
  var ctx = canvas.getContext('2d');

  var CW = 0, CH = 0, DPR = 1;
  var mode = 'title';         // title | play | over
  var run = null;
  var paused = false;
  var cam = { x: 0, y: 0, scale: 1 };
  var keys = {};
  var control = 'tap';                       // 'tap' (finger/mouse moves you) or 'joystick' (bottom-left stick)
  var joy = { id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
  var ptr = { down: false, x: 0, y: 0 };
  var sprintHeld = false;
  var bubbles = [];
  var hudTimer = 0;
  var best = 0;
  var showErrors = false;
  var errorLog = [];

  try { best = Number(localStorage.getItem('fish_best')) || 0; } catch (e) { best = 0; }
  try { showErrors = localStorage.getItem('fish_show_errors') === 'on'; } catch (e) { showErrors = false; }
  try { control = localStorage.getItem('fish_control') === 'joystick' ? 'joystick' : 'tap'; } catch (e) { control = 'tap'; }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  // ---------- the sea wraps left to right (v0.11) ----------
  // Positions stay in [0, W). Differences take the shorter way round the sea.
  function wrapX(x) { var W = run.info.W; return ((x % W) + W) % W; }
  function dxW(a, b) { var W = run.info.W, d = a - b; return d - W * Math.round(d / W); }
  function distXY(ax, ay, bx, by) { return Math.hypot(dxW(ax, bx), ay - by); }
  function distW(a, b) { return distXY(a.x, a.y, b.x, b.y); }

  // ---------- seabed, surface, current and kelp (v0.11) ----------
  // The seabed and the surface are periodic in x (period W): whole numbers of waves per sea, so the right edge meets the left.
  var GRAV = 1400;   // gravity for a fish that hops out of the water
  function bedY(x) {
    var W = run.info.W, H = run.info.H, u = 2 * Math.PI * wrapX(x) / W;
    return H - 140 + 45 * Math.sin(3 * u + 0.7) + 22 * Math.sin(5 * u + 2.1) + 10 * Math.sin(8 * u);
  }
  function surfY(x) {
    var W = run.info.W, u = 2 * Math.PI * wrapX(x) / W;
    return 6 * Math.sin(3 * u) + 3 * Math.sin(7 * u + 1);
  }
  // Sideways drift by depth: bands flow in opposite directions, so the sea moves in layers.
  function currentAt(y) { return 40 * Math.sin(2 * Math.PI * y / (run.info.H * 0.6)); }
  function hopHeight(size) { return clamp(30 + size * 3, 30, 140); }
  // Kelp patches on the seabed: small fish and plankton gather round them, and ambush fish patrol them.
  // v0.11: about twice as much kelp and twice as many anemones as before, so the sea looks lived in.
  var FLORA_SPACING = 130, ANEMONE_SPACING = 210;   // world units per patch / anemone
  function makeFlora(info) {
    var count = Math.max(8, Math.round(info.W / FLORA_SPACING)), list = [], i;
    for (i = 0; i < count; i++) {
      list.push({ x: ((((i + rand(0.2, 0.8)) * info.W / count) % info.W) + info.W) % info.W,
        h: rand(70, 140), n: 5 + Math.floor(Math.random() * 4), seed: Math.random() * 10 });
    }
    return list;
  }
  function mmss(sec) { sec = Math.floor(sec); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

  // Length of a fish on screen (world units). Food is drawn smaller.
  function lenFor(size, shape) {
    if (shape === 'plankton') return 10 + size * 10;
    if (shape === 'krill') return 10 + size * 8;
    return 22 + size * 5;
  }

  function hexMix(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    var g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    var bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }

  // The player takes the form of its tier's lead species (evolution).
  function playerDesc() { return run ? D.leadOf(run.level) : D.leadOf(1); }

  // ---------- canvas setup and background ----------
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    CW = window.innerWidth;
    CH = window.innerHeight;
    canvas.width = Math.round(CW * DPR);
    canvas.height = Math.round(CH * DPR);
    canvas.style.width = CW + 'px';
    canvas.style.height = CH + 'px';
    bubbles = [];
    for (var i = 0; i < 28; i++) {
      bubbles.push({ x: Math.random(), y: Math.random(), r: rand(2, 7), s: rand(0.02, 0.07), p: Math.random() * 6 });
    }
  }

  function paintSea(z) {
    var g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, z.top);
    g.addColorStop(1, z.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
  }

  function drawBackground(z, t) {
    paintSea(z);
    // When the zone changes, the old colours fade out over two seconds instead of cutting over.
    if (run && run.bgT < 1 && run.zoneOld) {
      ctx.globalAlpha = 1 - run.bgT;
      paintSea(run.zoneOld);
      ctx.globalAlpha = 1;
    }

    if (z.rays) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      for (var i = 0; i < 5; i++) {
        var x = CW * (0.12 + i * 0.2) + Math.sin(t * 0.4 + i) * 30;
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x + 50, 0); ctx.lineTo(x + 170, CH); ctx.lineTo(x + 110, CH);
        ctx.closePath(); ctx.fill();
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    bubbles.forEach(function (b) {
      var y = (((b.y - t * b.s) % 1) + 1) % 1;
      ctx.beginPath();
      ctx.arc(b.x * CW + Math.sin(t + b.p) * 10, y * CH, b.r, 0, Math.PI * 2);
      ctx.stroke();
    });

  }

  // ---------- drawing fish (local coords: nose to the right, origin = centre) ----------
  function genericFish(len, hr, d, t, lw) {
    var L = len / 2, Hh = len * hr / 2;
    var col = d.col, fin = d.fin || col, tail = d.tail || fin;
    var fh = d.finH || 1;
    var wig = Math.sin(t * 13) * Hh * 0.35;

    ctx.lineWidth = lw;
    ctx.strokeStyle = OUT;
    ctx.lineJoin = 'round';

    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(-L * 0.7, 0);
    ctx.quadraticCurveTo(-L * 1.05, -Hh * 0.9 + wig, -L * 1.4, -Hh * 1.1 + wig);
    ctx.quadraticCurveTo(-L * 1.2, wig * 0.2, -L * 1.4, Hh * 1.1 + wig);
    ctx.quadraticCurveTo(-L * 1.05, Hh * 0.9 + wig, -L * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = fin;
    ctx.beginPath();
    ctx.moveTo(-L * 0.35, -Hh * 0.7);
    ctx.quadraticCurveTo(-L * 0.05, -Hh * (0.9 + 0.8 * fh), L * 0.3, -Hh * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    var g = ctx.createLinearGradient(0, -Hh, 0, Hh);
    g.addColorStop(0, hexMix(col, '#ffffff', 0.35));
    g.addColorStop(0.6, col);
    g.addColorStop(1, hexMix(col, OUT, 0.22));
    ctx.beginPath();
    ctx.ellipse(0, 0, L, Hh, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    ctx.clip();
    if (d.belly) {
      ctx.fillStyle = d.belly;
      ctx.beginPath();
      ctx.ellipse(0, Hh * 0.8, L * 1.05, Hh * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (d.stripe) {
      ctx.fillStyle = d.stripe;
      ctx.fillRect(-L, -Hh * 0.12, len, Hh * 0.26);
    }
    if (d.bands) {
      ctx.fillStyle = d.bandCol || '#ffffff';
      d.bands.forEach(function (bx) { ctx.fillRect(bx * L - L * 0.09, -Hh * 1.2, L * 0.18, Hh * 2.4); });
    }
    if (d.spots) {
      ctx.fillStyle = d.spotCol || '#ffffff';
      for (var i = 0; i < 12; i++) {
        var sx = (-0.8 + (i % 4) * 0.5) * L + ((i * 37) % 7) * 0.02 * L;
        var sy = (-0.5 + Math.floor(i / 4) * 0.5) * Hh;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1.2, Hh * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(0, 0, L, Hh, 0, 0, Math.PI * 2);
    ctx.lineWidth = lw;
    ctx.strokeStyle = OUT;
    ctx.stroke();

    ctx.fillStyle = fin;
    ctx.beginPath();
    ctx.ellipse(L * 0.1, Hh * 0.35, L * 0.22, Hh * 0.28, 0.5 + Math.sin(t * 9) * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (d.spiky) {
      ctx.lineWidth = lw * 0.8;
      for (var k = 0; k < 10; k++) {
        var a = k / 10 * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * L * 0.98, Math.sin(a) * Hh * 0.98);
        ctx.lineTo(Math.cos(a) * (L + 3), Math.sin(a) * (Hh + 3));
        ctx.stroke();
      }
    }

    var er = Math.max(2.2, Hh * 0.2), ex = L * 0.45, ey = -Hh * 0.18;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = lw * 0.8;
    ctx.stroke();
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.arc(ex + er * 0.25, ey, er * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  function eelFish(len, d, t, lw) {
    var L = len / 2, th = Math.max(2.5, len * 0.075), pts = [];
    for (var i = 0; i <= 16; i++) {
      var u = i / 16;
      pts.push([-L + u * len, Math.sin(u * 5 - t * 6) * len * 0.07 * (0.3 + u)]);
    }
    var path = function () {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = th + lw * 2;
    ctx.stroke();
    path();
    ctx.strokeStyle = d.col;
    ctx.lineWidth = th;
    ctx.stroke();
    var hx = pts[16][0], hy = pts[16][1], er = Math.max(2, th * 0.45);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx - th * 0.3, hy - th * 0.3, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.arc(hx - th * 0.1, hy - th * 0.3, er * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function lureFish(len, d, t, lw) {
    var L = len / 2, Hh = len * d.hr / 2;
    var lx = L * 0.35, ly = -Hh * 0.9;
    var tipx = L * 0.85, tipy = -Hh * 2.3 - len * 0.02 * Math.sin(t * 3);
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = lw * 2.4;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(lx + L * 0.2, -Hh * 1.8, tipx, tipy);
    ctx.stroke();
    ctx.strokeStyle = '#e7dcff';
    ctx.lineWidth = lw;
    ctx.stroke();
    var gr = ctx.createRadialGradient(tipx, tipy, 0, tipx, tipy, len * 0.2);
    gr.addColorStop(0, 'rgba(255,246,190,1)');
    gr.addColorStop(1, 'rgba(255,246,190,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(tipx, tipy, len * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6be';
    ctx.beginPath();
    ctx.arc(tipx, tipy, Math.max(2, len * 0.035), 0, Math.PI * 2);
    ctx.fill();
    genericFish(len, d.hr, d, t, lw);
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < 4; i++) {
      var tx = L * (0.72 + i * 0.07);
      ctx.beginPath();
      ctx.moveTo(tx, Hh * 0.15);
      ctx.lineTo(tx + L * 0.03, Hh * 0.5);
      ctx.lineTo(tx + L * 0.06, Hh * 0.15);
      ctx.fill();
    }
  }

  function lanternFish(len, d, t, lw) {
    genericFish(len, d.hr, d, t, lw);
    var L = len / 2, Hh = len * d.hr / 2;
    for (var i = 0; i < 6; i++) {
      var x = (-0.6 + i * 0.24) * L, y = Hh * 0.55, r = Math.max(2, Hh * 0.9);
      var gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(190,255,255,0.95)');
      gr.addColorStop(1, 'rgba(190,255,255,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // v0.11 creatures. Drawn in the fish's own space: the body is about len long, facing right.
  function jellyFish(len, d, t, lw) {
    var R = len * 0.4, pulse = 1 + 0.12 * Math.sin(t * 3), i, k;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = d.col; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.ellipse(0, 0, R * pulse, R * 0.8 / pulse, 0, Math.PI, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = d.fin; ctx.lineWidth = lw * 0.6;
    for (i = 0; i < 5; i++) {
      var x0 = -R * 0.8 + i * R * 0.4, wob = Math.sin(t * 2 + i) * R * 0.2;
      ctx.beginPath(); ctx.moveTo(x0, 0);
      for (k = 1; k <= 2; k++) ctx.bezierCurveTo(x0 + wob, R * 0.5 * k, x0 - wob, R * 0.5 * k + R * 0.25, x0, R * 0.6 * k + R * 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function turtleShape(len, d, t, lw) {
    var L = len / 2, H = len * 0.32, paddle = Math.sin(t * 2) * 0.6;
    ctx.lineWidth = lw * 0.8; ctx.strokeStyle = OUT;
    ctx.fillStyle = d.belly || '#e8e0b0';
    ctx.beginPath(); ctx.ellipse(L * 0.95, 0, L * 0.22, H * 0.28, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // head
    ctx.fillStyle = d.fin;
    [[L * 0.35, 1, 0.5], [L * 0.35, -1, 0.5], [-L * 0.55, 1, 0.35], [-L * 0.55, -1, 0.35]].forEach(function (f) {   // flippers
      ctx.save(); ctx.translate(f[0], f[1] * H * 0.9); ctx.rotate(f[1] * (paddle + 0.3));
      ctx.beginPath(); ctx.ellipse(0, 0, L * f[2], H * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    });
    ctx.fillStyle = d.col;
    ctx.beginPath(); ctx.ellipse(0, 0, L, H, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // shell
    ctx.strokeStyle = d.fin; ctx.lineWidth = lw * 0.7;
    ctx.beginPath(); ctx.ellipse(0, 0, L * 0.55, H * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  }

  function crabShape(len, d, t, lw) {
    var W = len / 2, H = len * 0.3, i, side;
    ctx.lineWidth = lw * 0.7; ctx.strokeStyle = OUT;
    ctx.strokeStyle = d.fin;
    for (side = -1; side <= 1; side += 2) {   // legs: three a side, wiggling as it walks
      for (i = 0; i < 3; i++) {
        var lx = -W * 0.3 + i * W * 0.35, wig = Math.sin(t * 6 + i + side) * 2;
        ctx.beginPath(); ctx.moveTo(lx, side * H * 0.4); ctx.lineTo(lx + wig, side * H * 1.3); ctx.stroke();
      }
    }
    ctx.strokeStyle = OUT; ctx.fillStyle = d.col;
    ctx.beginPath(); ctx.ellipse(0, 0, W * 0.75, H * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // shell
    for (side = -1; side <= 1; side += 2) {   // claws
      ctx.beginPath(); ctx.moveTo(W * 0.5, side * H * 0.3); ctx.lineTo(W * 0.95, side * H * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(W * 1.05, side * H * 1.0, H * 0.4, H * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (side = -1; side <= 1; side += 2) {   // eyes on stalks
      ctx.beginPath(); ctx.moveTo(W * 0.4, -H * 0.5); ctx.lineTo(W * 0.4 + side * W * 0.05, -H * 1.0); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(W * 0.4 + side * W * 0.05, -H * 1.05, lw * 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Sea birds (v0.11): gulls glide over the surface. They are scenery only, so they do not touch the game.
  function makeBirds(info) {
    var list = [], n = 2 + Math.floor(info.n / 4), i;
    for (i = 0; i < n; i++) {
      var x = rand(0, info.W);
      list.push({ x: x, y: surfY(x) - rand(170, 280), dir: Math.random() < 0.5 ? 1 : -1, speed: rand(40, 70), t: rand(0, 6) });
    }
    return list;
  }
  function updateBirds(dt) {
    (run.birds || []).forEach(function (b) { b.x = wrapX(b.x + b.dir * b.speed * dt); b.t += dt; });
  }
  function drawBirds() {
    (run.birds || []).forEach(function (b) {
      var flap = Math.sin(b.t * 9) * 0.6;
      ctx.save(); ctx.translate(b.x, b.y + Math.sin(b.t * 2) * 5); ctx.scale(b.dir, 1);
      ctx.strokeStyle = '#3a4150'; ctx.lineWidth = 2 / cam.scale; ctx.fillStyle = '#f4f6fa';
      ctx.beginPath(); ctx.moveTo(-16, -4 + flap * 12); ctx.quadraticCurveTo(-7, -2, 0, 0); ctx.quadraticCurveTo(7, -2, 16, -4 + flap * 12); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
  }

  // v0.11 trash: drawn simply, one shape per kind, so it reads at a glance as something that should not be here.
  function trashShape(len, d, t, lw) {
    var L = len / 2, H = len * 0.25, wob = Math.sin(t * 1.5) * H * 0.2;
    ctx.lineWidth = lw * 0.8; ctx.strokeStyle = OUT; ctx.fillStyle = d.col;
    if (d.trashKind === 'sock') {
      ctx.beginPath(); ctx.moveTo(-L * 0.6, -H); ctx.lineTo(L * 0.2, -H); ctx.lineTo(L * 0.25, H * 1.2 + wob); ctx.lineTo(L * 0.7, H * 1.2 + wob);
      ctx.lineTo(L * 0.7, H * 1.9 + wob); ctx.lineTo(-L * 0.6, H * 1.9 + wob); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = d.fin; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.moveTo(-L * 0.6, -H * 0.3); ctx.lineTo(L * 0.2, -H * 0.3); ctx.stroke();
    } else if (d.trashKind === 'underwear') {
      ctx.beginPath(); ctx.moveTo(-L * 0.7, -H * 0.4); ctx.lineTo(L * 0.7, -H * 0.4); ctx.lineTo(L * 0.4, H * 1.6 + wob); ctx.lineTo(0, H * 0.6);
      ctx.lineTo(-L * 0.4, H * 1.6 + wob); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = d.fin; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.moveTo(-L * 0.7, -H * 0.4); ctx.lineTo(L * 0.7, -H * 0.4); ctx.stroke();
    } else if (d.trashKind === 'toycar') {
      ctx.fillRect(-L * 0.7, -H * 0.8, L * 1.4, H * 1.2); ctx.strokeRect(-L * 0.7, -H * 0.8, L * 1.4, H * 1.2);
      ctx.fillStyle = d.fin;
      [-L * 0.45, L * 0.45].forEach(function (x) { ctx.beginPath(); ctx.arc(x, H * 0.6, H * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    } else {   // bottle
      ctx.beginPath(); ctx.ellipse(0, 0, L * 0.9, H * 1.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = d.fin; ctx.fillRect(-L * 0.25, -H * 1.9, L * 0.5, H * 0.9); ctx.strokeRect(-L * 0.25, -H * 1.9, L * 0.5, H * 0.9);
    }
  }

  // v0.12 background items. Drawn simply, one shape each, so they read at a glance.
  function clamShape(len, d, t, lw) {   // a shell on the sand that opens and shuts slowly
    var L = len / 2, open = 0.5 + 0.5 * Math.sin(t * 0.5), Ry = L * (0.45 + 0.2 * open), i, a;
    ctx.lineWidth = lw * 0.8; ctx.strokeStyle = OUT; ctx.fillStyle = d.col;
    ctx.beginPath(); ctx.ellipse(0, 0, L, Ry, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = d.fin; ctx.lineWidth = lw * 0.6; ctx.beginPath();
    for (i = 1; i <= 3; i++) { a = Math.PI + i * Math.PI / 4; ctx.moveTo(0, 0); ctx.lineTo(L * Math.cos(a), Ry * Math.sin(a)); }
    ctx.stroke();
    ctx.fillStyle = d.fin; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.ellipse(0, 0, L, L * 0.12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  function rockShape(len, d, lw) {
    var L = len / 2, pts = [[-1, 0.3], [-0.6, -0.6], [0.1, -0.9], [0.8, -0.5], [1, 0.2], [0.5, 0.8], [-0.4, 0.85]], i;
    ctx.beginPath();
    for (i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i][0] * L, pts[i][1] * L * 0.6); else ctx.moveTo(pts[i][0] * L, pts[i][1] * L * 0.6); }
    ctx.closePath();
    ctx.fillStyle = d.col; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.8; ctx.fill(); ctx.stroke();
    ctx.fillStyle = d.fin; ctx.beginPath(); ctx.arc(-L * 0.2, -L * 0.2, L * 0.18, 0, Math.PI * 2); ctx.fill();
  }
  function boatShape(len, d, t, lw) {   // a rowing boat rocking on the surface
    var L = len / 2, H = len * 0.12, bob = Math.sin(t * 1.2) * H * 0.2;
    ctx.lineWidth = lw * 0.8; ctx.strokeStyle = OUT;
    ctx.fillStyle = d.fin;
    ctx.beginPath(); ctx.moveTo(-L, bob); ctx.lineTo(L, bob); ctx.lineTo(L * 0.7, H + bob); ctx.lineTo(-L * 0.7, H + bob);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = d.col; ctx.fillRect(-L * 0.35, -H * 1.1 + bob, L * 0.7, H * 1.1); ctx.strokeRect(-L * 0.35, -H * 1.1 + bob, L * 0.7, H * 1.1);
    ctx.beginPath(); ctx.moveTo(0, -H * 1.1 + bob); ctx.lineTo(0, -H * 3 + bob); ctx.stroke();   // mast
    ctx.beginPath(); ctx.moveTo(0, -H * 3 + bob); ctx.lineTo(L * 0.5, -H * 1.2 + bob); ctx.lineTo(0, -H * 1.2 + bob);
    ctx.closePath(); ctx.fill(); ctx.stroke();   // sail
  }
  function subShape(len, d, t, lw) {   // a small submarine: hull, conning tower, periscope, porthole, tail
    var L = len / 2, H = len * 0.17;
    ctx.lineWidth = lw * 0.8; ctx.strokeStyle = OUT;
    ctx.fillStyle = d.col;
    ctx.beginPath(); ctx.ellipse(0, 0, L, H, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = d.fin; ctx.fillRect(-L * 0.2, -H * 2.1, L * 0.3, H * 1.2); ctx.strokeRect(-L * 0.2, -H * 2.1, L * 0.3, H * 1.2);
    ctx.beginPath(); ctx.moveTo(0, -H * 2.1); ctx.lineTo(0, -H * 2.8); ctx.lineTo(L * 0.1, -H * 2.8); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(L * 0.35, -H * 0.1, Math.max(2, H * 0.3), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = d.fin; ctx.beginPath(); ctx.moveTo(-L * 0.9, 0); ctx.lineTo(-L * 1.25, -H * 0.9); ctx.lineTo(-L * 1.25, H * 0.9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function squidShape(len, d, t, lw) {   // a squid: a long mantle, a fin, and tentacles that trail and wave
    var L = len / 2, H = len * 0.13, i, y0, wv;
    ctx.lineCap = 'round'; ctx.strokeStyle = d.fin; ctx.lineWidth = lw * 0.9;
    for (i = 0; i < 6; i++) {
      y0 = (i - 2.5) * H * 0.35; wv = Math.sin(t * 4 + i) * H * 0.5;
      ctx.beginPath(); ctx.moveTo(-L * 0.35, y0); ctx.quadraticCurveTo(-L * 0.8, y0 + wv, -L * 1.0, y0 + wv * 1.5); ctx.stroke();
    }
    ctx.fillStyle = d.col; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.ellipse(-L * 0.1, 0, L * 0.7, H * 1.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = d.fin; ctx.beginPath(); ctx.moveTo(-L * 0.6, 0); ctx.lineTo(-L * 0.85, -H * 1.3); ctx.lineTo(-L * 0.85, H * 1.3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(L * 0.35, -H * 0.2, Math.max(1.5, H * 0.35), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1d2a33'; ctx.beginPath(); ctx.arc(L * 0.37, -H * 0.2, Math.max(1, H * 0.15), 0, Math.PI * 2); ctx.fill();
  }
  function urchinShape(len, d, t, lw) {   // a round body with spines all round (the spines are the protection)
    var R = len * 0.3, i, a, r2;
    ctx.lineCap = 'round'; ctx.strokeStyle = d.fin; ctx.lineWidth = lw * 0.9;
    for (i = 0; i < 14; i++) {
      a = i * Math.PI * 2 / 14 + Math.sin(t * 0.8 + i) * 0.05; r2 = R * (1.6 + 0.3 * ((i * 7) % 3) / 2);
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); ctx.stroke();
    }
    ctx.fillStyle = d.col; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  function shrimpShape(len, d, t, lw) {   // a curled body with feelers at the head (right)
    var L = len / 2, rad = len * 0.07, i, x, y, hx = L * 0.72, hy = -L * 0.5;
    ctx.lineWidth = lw * 0.6; ctx.strokeStyle = OUT; ctx.fillStyle = d.col;
    for (i = 0; i < 5; i++) {
      x = -L * 0.8 + i * L * 0.38; y = -Math.pow(i / 4, 2) * L * 0.5 + Math.sin(t * 5 + i) * rad * 0.2;
      ctx.beginPath(); ctx.arc(x, y, rad * (1.1 - i * 0.08), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = d.fin; ctx.lineWidth = lw * 0.5; ctx.beginPath();
    ctx.moveTo(hx, hy); ctx.lineTo(hx + L * 0.33, hy - L * 0.3); ctx.moveTo(hx, hy); ctx.lineTo(hx + L * 0.23, hy - L * 0.4); ctx.stroke();
    ctx.fillStyle = '#1d2a33'; ctx.beginPath(); ctx.arc(hx, hy, rad * 0.35, 0, Math.PI * 2); ctx.fill();
  }

  // v0.11 trash on or off (Settings → Trash in the sea). On by default.
  function trashOn() {
    try { return localStorage.getItem('fish_trash') !== 'off'; } catch (e) { return true; }
  }

  function oarFish(len, d, t, lw) {
    var L = len / 2, Hh = Math.max(2, len * d.hr / 2), wv = Math.sin(t * 2) * Hh * 0.4;
    ctx.fillStyle = d.fin;
    ctx.lineWidth = lw * 0.8;
    ctx.strokeStyle = OUT;
    for (var i = 0; i < 16; i++) {
      var x = -L * 0.9 + i * (L * 1.8 / 16);
      ctx.beginPath();
      ctx.moveTo(x, -Hh * 0.6);
      ctx.lineTo(x + L * 0.04, -Hh * 2.2 + wv);
      ctx.lineTo(x + L * 0.08, -Hh * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, L, Hh, 0, 0, Math.PI * 2);
    ctx.fillStyle = d.col;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(L * 0.9, -Hh * 0.2, Math.max(2, Hh * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }

  function planktonDraw(len, d) {
    var r = Math.max(2, len * 0.5);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = d.col;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#a8d8ea';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  function drawEntity(e, t) {
    if (e.friend && e.joinT !== undefined && e.joinT < JOIN_S) {   // v0.12: a new friend fades in as it joins you
      ctx.globalAlpha = 0.4 + 0.6 * e.joinT / JOIN_S; drawBody(e, e.desc || e.sp, t); ctx.globalAlpha = 1;
      return;
    }
    if (e.morph) {   // v0.12: a school member changing form cross-fades from its old look to its new one
      var p = clamp(e.morph.t / e.morph.dur, 0, 1);
      ctx.globalAlpha = 1 - p; drawBody(e, e.morph.from, t);
      ctx.globalAlpha = p; drawBody(e, e.sp, t);
      ctx.globalAlpha = 1;
      return;
    }
    drawBody(e, e.desc || e.sp, t);
  }
  function drawBody(e, d, t) {
    var len = lenFor(e.size, d.shape), lw = 2.4 / cam.scale;
    var f = e.facing || 1;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(f, 1);
    ctx.rotate(clamp((e.vy || 0) / 500, -0.3, 0.3) * f);
    var shape = d.shape;
    if (shape === 'plankton') planktonDraw(len, d);
    else if (shape === 'eel') eelFish(len, d, t, lw);
    else if (shape === 'lure') lureFish(len, d, t, lw);
    else if (shape === 'lantern') lanternFish(len, d, t, lw);
    else if (shape === 'oar') oarFish(len, d, t, lw);
    else if (shape === 'jelly') jellyFish(len, d, t, lw);
    else if (shape === 'turtle') turtleShape(len, d, t, lw);
    else if (shape === 'crab') crabShape(len, d, t, lw);
    else if (shape === 'trash') trashShape(len, d, t, lw);
    else if (shape === 'clam') clamShape(len, d, t, lw);
    else if (shape === 'rock') rockShape(len, d, lw);
    else if (shape === 'boat') boatShape(len, d, t, lw);
    else if (shape === 'sub') subShape(len, d, t, lw);
    else if (shape === 'squid') squidShape(len, d, t, lw);
    else if (shape === 'urchin') urchinShape(len, d, t, lw);
    else if (shape === 'shrimp') shrimpShape(len, d, t, lw);
    else genericFish(len, d.hr || 0.5, d, t, lw);
    ctx.restore();
  }

  // ---------- levels and populations ----------
  // Sea anemones are the safe spots (v0.11): spread around the sea. A fish under one is not hunted there.
  var ANEMONE_R = 90;
  function makeAnemones(info) {
    var count = Math.max(6, Math.round(info.W / ANEMONE_SPACING)), list = [], i;
    for (i = 0; i < count; i++) {
      var ax = ((((i + rand(-0.3, 0.3)) * info.W / count) % info.W) + info.W) % info.W;
      list.push({ x: ax, y: bedY(ax) - 10 });
    }
    return list;
  }

  // v0.12: after a level-up the sea is calm for CALM_S seconds. No new fish swim in, you cannot level up again,
  // and nothing bites your school, so a run of meals cannot jump several levels at once.
  // Your school changes form over morphTime (slow species take longer, quick ones less).
  var CALM_S = 5;
  function morphTime(sp) { return sp.speed < 40 ? 7 : sp.speed >= 100 ? 3.5 : 5; }
  // v0.12 background items (Settings → Background items). On by default.
  function bgOn() { try { return localStorage.getItem('fish_bg') !== 'off'; } catch (e) { return true; } }

  function enterLevel(n) {
    var r = run;
    // Fish keep their places around you: remember each offset, then place them again on the new, larger sea.
    var offs = r.npcs.map(function (o) { return dxW(o.x, r.x); });
    var offY = r.npcs.map(function (o) { return o.y - r.y; });   // v0.11: keep the height too, so allies stay with you
    r.info = D.levelInfo(n);
    r.level = n;
    r.goal = r.info.goal;
    r.x = r.info.W / 2;
    r.y = r.info.H / 2;
    r.npcs.forEach(function (o, i) {
      o.x = wrapX(r.x + offs[i]);
      o.y = clamp(r.y + offY[i], 20, bedY(o.x) - 10);
      o.anchor = { x: o.x, y: o.anchor.y + (o.y - (r.y + offY[i])) };
    });
    r.anemones = makeAnemones(r.info);
    r.birds = makeBirds(r.info);
    r.flora = makeFlora(r.info);
    syncForest();
    r.vx = 0;
    r.vy = 0;
    r.inv = CALM_S;   // v0.12: the calm: nothing bites you while it lasts
    r.calmT = CALM_S;
    cam.x = r.x;
    cam.y = r.y;
    // The fish already around you stay. New species only appear far away, gradually (see fillPopulations).
    if (r.zoneFrom !== r.info.zone) { r.zoneOld = r.zoneFrom || r.info.zone; r.zoneFrom = r.info.zone; r.bgT = 0; }
    var lead = D.leadOf(n), evolved = !!r.form && r.form.id !== lead.id;
    r.form = lead;
    if (evolved) r.npcs.forEach(function (o) {   // v0.12: your school changes form over a few seconds, not at once
      if (o.pod && !o.dead) o.morph = { from: o.morph ? o.morph.from : o.sp, t: 0, dur: morphTime(lead) };
    });
    showBanner(evolved ? 'Evolved into ' + lead.name + '!' : 'Level ' + n + ': ' + r.info.name,
      (evolved ? 'Level ' + n + ': ' + r.info.name + '. ' : '') + r.info.zone.name + '. Goal: size ' + r.info.goal, 3200);
  }

  function spawnNPC(sp, initial) {
    var r = run, W = r.info.W, H = r.info.H, x = 0, y = 0, tries = 0;
    if (r.arriving) {
      // Arrivals come in from the far side of the sea (the sea wraps, so there are no edges).
      x = wrapX(r.x + (Math.random() < 0.5 ? -1 : 1) * rand(W * 0.35, W * 0.5));
      y = rand(40, bedY(x) - 30);
    } else {
      do {
        x = wrapX(r.x + rand(-W / 2, W / 2));
        y = rand(40, bedY(x) - 30);
        tries++;
      } while (distXY(x, y, r.x, r.y) < (initial ? 380 : 520) && tries < 12);
    }
    r.npcs.push({
      sp: sp, x: x, y: y, vx: 0, vy: 0,
      size: sp.kind === 'food' ? sp.size : sp.size * rand(0.9, 1.12),
      spd: rand(0.9, 1.1), facing: Math.random() < 0.5 ? 1 : -1,
      t: rand(0, 6), anchor: { x: x, y: y }, tgt: null, tT: 0,
      cool: rand(0, 2), lunge: 0, lx: 0, ly: 0, locked: false, lockT: 0, dead: false,
      hp: maxHpOf(sp.size), maxHp: maxHpOf(sp.size), biteT: 0,
      arrive: r.arriving ? 6 : 0
    });
    // Kelp: plankton and small fish gather round a patch, ambush fish patrol one (the loop).
    var nn = r.npcs[r.npcs.length - 1], pa = r.flora && r.flora.length ? r.flora[Math.floor(Math.random() * r.flora.length)] : null;
    var gather = !r.arriving && pa && ((sp.kind === 'food' && Math.random() < 0.6) || (sp.kind === 'prey' && Math.random() < 0.6) || (sp.kind === 'ambush' && Math.random() < 0.8));
    if (gather) {
      var ax = wrapX(pa.x + rand(-70, 70)), ay = bedY(ax) - rand(40, 110);
      if (distXY(ax, ay, r.x, r.y) > (initial ? 380 : 520)) {
        nn.anchor = { x: ax, y: ay }; nn.x = ax; nn.y = ay;
        if (sp.kind === 'ambush') nn.patch = pa;
      }
    }
  }

  // ---------- combat: health, bites and chum ----------
  // A bite takes off the attacker's attack value. Small fish have 1 health, so one bite is enough;
  // bigger fish take several bites, with a pause between bites (player 0.6 s, fish 0.9 s).
  // The player's bite timer is at least one second (v0.8), and eating chum or plankton also starts it.
  var BITE_S = 1.0, STRIKE_S = 0.9;
  // Hit points are doubled (v0.8). Fish of size 4 or more take several bites (4 to 10); smaller fish go in two or more.
  // From level 10 on, fish have twice the hit points again (v0.9): several bites to take down a prey.
  function maxHpOf(size) {
    var late = run && run.info.n >= 10 ? 2 : 1;
    return late * 2 * (size >= 4 ? Math.max(2, Math.round(size / 2)) : Math.max(1, Math.round(size / 3)));
  }
  function atkOf(size) { return 1 + Math.floor(size / 8); }
  function playerMaxHp(size) { return 2 * (10 + Math.floor(size / 2)); }
  var CHUM = { id: 'chum', name: 'Chum', kind: 'food', temper: 'docile', shape: 'plankton', size: 0.6, speed: 20, col: '#ffb4a2' };

  // A fish of size 4 or more leaves chum behind when it dies. Chum draws small fish in to feed and school.
  function dropChum(n) {
    if (n.sp.kind === 'food' || n.size < 4) return;
    var count = Math.min(12, Math.max(1, Math.round(n.size / 4)));   // bits: about a quarter of its size, in pieces
    for (var i = 0; i < count; i++) {
      run.npcs.push({
        sp: CHUM, x: n.x + rand(-40, 40), y: n.y + rand(-40, 40), vx: 0, vy: 0, size: CHUM.size,
        spd: 1, facing: 1, t: rand(0, 6), anchor: { x: n.x, y: n.y }, tgt: null, tT: 0, cool: 0,
        lunge: 0, lx: 0, ly: 0, locked: false, lockT: 0, dead: false, hp: 1, maxHp: 1, biteT: 0, life: 25
      });
    }
  }

  // A pack hunter that locks on wakes its pack-mates within 500 (v0.9): the pack hunts together.
  function shareLock(n) {
    if (n.pack === undefined) return;
    run.npcs.forEach(function (o) {
      if (o !== n && o.pack === n.pack && !o.dead && !o.locked && distW(o, n) < 500) {
        o.locked = true;
        o.lockT = n.lockT;
      }
    });
  }

  // ---------- your school (from level 10) ----------
  // A pod of your own species follows you, bites smaller fish, and grows with you.
  // Eating chum near the pod has a chance to add a member (up to 12).
  // The school grows with your level, and it does not come back once its members are eaten (v0.8).
  // run.podSpawns counts every member ever added (levels and chum), so a dead member is never replaced.
  function podTarget() { return run.info.n >= 10 ? Math.min(12, 2 + (run.info.n - 10)) : 0; }

  // The school takes on your current species when you evolve (v0.8).
  function podSpecies() {
    if (!run.podSp || run.podFor !== run.form.id) {
      run.podFor = run.form.id;
      run.podSp = Object.assign({}, run.form, { id: run.form.id + '-pod', kind: 'prey', temper: 'docile', school: true });
    }
    return run.podSp;
  }

  // bought: an ally from the ally button (it does not count toward the school's level-based members).
  function spawnPod(bought) {
    var r = run, a = rand(0, Math.PI * 2);
    if (!bought) r.podSpawns = (r.podSpawns || 0) + 1;
    r.npcs.push({
      sp: podSpecies(), pod: true, ally: !!bought, podA: a, x: r.x + Math.cos(a) * 90, y: r.y + Math.sin(a) * 90,
      vx: 0, vy: 0, size: Math.max(0.5, r.size * 0.5), spd: 1, facing: 1, t: rand(0, 6), anchor: { x: r.x, y: r.y },
      tgt: null, tT: 0, cool: 0, lunge: 0, lx: 0, ly: 0, locked: false, lockT: 0, dead: false,
      hp: 0, maxHp: 0, biteT: 0, arrive: 0
    });
    r.npcs[r.npcs.length - 1].hp = maxHpOf(r.size * 0.5);
    r.npcs[r.npcs.length - 1].maxHp = r.npcs[r.npcs.length - 1].hp;
  }

  function updatePods() {
    var r = run, want = podTarget();
    while ((r.podSpawns || 0) < want) spawnPod();   // only new levels add members; eaten ones stay gone
  }

  // Allies (v0.9): one EXP (size) buys an allied fish. Each living ally adds one to the price,
  // so when allies die the price falls back with them.
  // v0.12 followers: your bought allies and your friends. Their total size may not exceed ALLY_LIMIT x your size.
  // Over the limit, one follower is released at a time (it turns back into a wild fish) until you are under it.
  // Friends (see tendFollowers) are not bought, so they do not raise the price of the next ally.
  var ALLY_LIMIT = 2, RELEASE_S = 0.6;
  function followers() { return run.npcs.filter(function (o) { return o.ally && !o.dead; }); }
  function followerMass() { return followers().reduce(function (a, o) { return a + o.size; }, 0); }
  function liveAllies() { return run.npcs.filter(function (o) { return o.ally && !o.friend && !o.dead; }).length; }
  function allyCost() { return liveAllies() + 1; }

  // v0.12 friends: a fish of your body shape, 90% to 100% of your size, that stays just outside your bite range
  // for FRIEND_S seconds joins you. Touching it (an attack) or moving away starts the wait again.
  // A released friend waits FRIEND_BACK_S before it can be befriended again.
  var FRIEND_S = 3, JOIN_S = 2, FRIEND_BACK_S = 20;
  function joinFriend(o) {
    o.ally = true; o.pod = true; o.friend = true; o.joinT = 0; o.greetT = 0;
    o.podA = Math.random() * Math.PI * 2;   // its place round you, as the school has
    burst(o.x, o.y, '#5fd0c0', 8);
    floatText(o.x, o.y, 'Friend!');
    FishSound.play('eat');
  }
  function releaseFollower(o) {
    o.ally = false; o.pod = false; o.friend = false; o.morph = null; o.joinT = undefined; o.greetT = 0;
    o.friendBackAt = run.t + FRIEND_BACK_S;
    burst(o.x, o.y, '#9aa5ad', 6);
    floatText(o.x, o.y, 'Released');
  }
  function tendFollowers(dt) {
    var r = run, P = r.size, shape = playerDesc().shape;
    r.releaseT = Math.max(0, (r.releaseT || 0) - dt);
    if (followerMass() > ALLY_LIMIT * P && r.releaseT <= 0) {
      var big = null;
      followers().forEach(function (o) { if (!big || o.size > big.size) big = o; });
      if (big) releaseFollower(big);
      r.releaseT = RELEASE_S;
    }
    r.npcs.forEach(function (o) {
      if (o.dead) return;
      var eligible = !o.pod && !o.ally && o.sp.kind === 'prey' && !o.sp.sting && !o.sp.trash && o.sp.shape === shape &&
        o.size >= P * 0.9 && o.size <= P && r.t >= (o.friendBackAt || 0);
      // The same reach as checkContact (contact below 0.36 of the two lengths); the friend band is just outside it.
      var sum = lenFor(P, 'round') + lenFor(o.size, o.sp.shape), d = distW(o, r);
      if (!eligible || d < sum * 0.36 || d > sum * 0.9) { o.greetT = 0; return; }
      o.greetT = (o.greetT || 0) + dt;
      if (o.greetT >= FRIEND_S && followerMass() + o.size <= ALLY_LIMIT * P) joinFriend(o);
    });
  }
  function buyAlly() {
    if (!run || mode !== 'play' || paused) return;
    var cost = allyCost();
    // v0.11: EXP is size. Buying spends the growth of this level, never the levels you have already reached.
    if (run.size - cost < run.info.enterSize) { floatText(run.x, run.y, 'Not enough EXP left on this level'); return; }
    // v0.12: an ally would be as big as half of you; refuse it if the followers would go over the limit.
    if (followerMass() + Math.max(0.5, run.size * 0.5) > ALLY_LIMIT * run.size) { floatText(run.x, run.y, 'Your allies are full'); return; }
    run.size -= cost;
    run.allySpent = (run.allySpent || 0) + cost;   // test hook: what buys have charged in total
    spawnPod(true);
    floatText(run.x, run.y, '-' + cost + ' EXP: ally');
    FishSound.play('eat');
  }

  // v0.11: allies heal like you do. Four seconds without a hit, then they regain a third of their health a second.
  // Eating food heals an ally by 1 at once.
  function healAlly(n, amount) { n.hp = Math.min(n.maxHp, n.hp + amount); }
  // v0.11 Attack: for 8 seconds your allies go for the fish you last bit (or the nearest fish near you), and
  // stop running from bigger ones. Ready again after 20 seconds.
  var CMD_S = 8, CMD_COOL = 20;
  function commandAllies() {
    if (!run || mode !== 'play' || paused) return;
    if (followers().length === 0) { floatText(run.x, run.y, 'No allies'); return; }
    if ((run.cmdCd || 0) > 0) { floatText(run.x, run.y, 'Ready in ' + Math.ceil(run.cmdCd) + 's'); return; }
    var tgt = run.lastBit && !run.lastBit.dead && !run.lastBit.pod && distW(run.lastBit, run) < 400 ? run.lastBit : null;
    if (!tgt) {
      var best = 300;
      run.npcs.forEach(function (o) {
        if (o.ally || o.pod || o.dead || o.sp.kind === 'food' || o.sp.kind === 'harmless') return;
        var d = distW(o, run);
        if (d < best) { best = d; tgt = o; }
      });
    }
    if (!tgt) { floatText(run.x, run.y, 'No target'); return; }
    run.cmd = { target: tgt, t: CMD_S };
    run.cmdCd = CMD_COOL;
    floatText(tgt.x, tgt.y, 'Attack!');
    FishSound.play('eat');
  }

  // An ally's meal feeds you: half of what you would get from the same meal (v0.10).
  // Growth is checked after the NPC update, not here, so a level change cannot happen mid-loop.
  var ALLY_SHARE = 0.5;
  function allyCredit(meal) {
    var r = run, span = Math.max(0.5, r.info.meal), gain;
    gain = meal.sp.kind === 'food' ? meal.size * 0.4 : Math.max(meal.size * 0.25, span / (r.info.n >= 20 ? 10 : 9));
    gain *= ALLY_SHARE;
    r.size += gain;
    r.growPending = true;
    floatText(meal.x, meal.y, '+' + gain.toFixed(1));
  }

  function updatePodMember(n, dt) {
    var r = run, sp = n.sp;
    n.t += dt;
    n.biteT = Math.max(0, n.biteT - dt);
    if (n.morph) {   // v0.12: the school changes form over a few seconds (the old and new looks cross-fade, see drawEntity)
      n.morph.t += dt;
      if (n.morph.t >= n.morph.dur) { n.sp = podSpecies(); n.morph = null; }
    }
    if (n.friend && n.joinT !== undefined && n.joinT < JOIN_S) n.joinT += dt;   // a new friend fades in as it joins
    if (!n.friend) n.size = Math.max(0.5, r.size * 0.5);       // the pod grows as you grow; a friend keeps its own size
    n.hp = Math.min(n.hp, maxHpOf(n.size)); n.maxHp = maxHpOf(n.size);
    if (n.ally) {   // v0.11: heal after a pause without a hit
      if (n.lastHp !== undefined && n.hp < n.lastHp) n.quietT = 0; else n.quietT = (n.quietT || 0) + dt;
      if (n.quietT > 4 && n.hp < n.maxHp) healAlly(n, n.maxHp / 3 * dt);
      n.lastHp = n.hp;
    }
    // Run from a predator four times its size (v0.8). An ally runs from any fish that could eat it (v0.10).
    // Otherwise attack: the nearest fish it can eat within 220 (only fish up to 0.6x its size, so the school is
    // not overpowering). Otherwise an ally eats the nearest chum or plankton. Otherwise keep station beside you.
    // Allies stay near you (v0.10): they only hunt or forage within LEASH of you, and an ally past it heads back.
    var LEASH = 300;
    var nearYou = function (o) { return distW(o, r) < LEASH; };
    var away = n.ally && distW(n, r) > LEASH;
    // v0.10: values decide. Run from a fish that out-fights this one (attack x health); go for one it can beat.
    // The bites come from the fight loop in update(), so this only steers.
    var big = findNear(n, 260, function (o) { return !o.pod && canBite(o.sp) && fightPower(o) > fightPower(n); });
    var prey = big || away ? null : findNear(n, 220, function (o) { return !o.pod && o.sp.kind !== 'food' && o.sp.kind !== 'harmless' && fightPower(o) <= fightPower(n) && (!n.ally || nearYou(o)); });
    var cmd = n.ally && r.cmd && !r.cmd.target.dead ? r.cmd.target : null;   // v0.11: Attack overrides running and foraging
    if (cmd) { big = null; prey = cmd; }
    var food = big || prey || away || !n.ally ? null : findFeed(n, nearYou);
    var tx, ty, s;
    if (big) {
      var bdx = dxW(n.x, big.x), bdy = n.y - big.y, bd = Math.hypot(bdx, bdy) || 1;
      tx = n.x + bdx / bd * 260; ty = n.y + bdy / bd * 260; s = 260;
    } else if (prey) {
      tx = prey.x; ty = prey.y; s = 190;
    } else if (food) {
      tx = food.x; ty = food.y; s = 170;
      if (distW(food, n) < 30 && !food.dead) {
        food.dead = true;
        burst(food.x, food.y, food.sp.col || '#ffffff', 4);
        allyCredit(food);
        healAlly(n, 1);
      }
    } else {
      tx = r.x + Math.cos(n.podA + n.t * 0.5) * 90; ty = r.y + Math.sin(n.podA + n.t * 0.5) * 90; s = 200;
    }
    var tdx = dxW(tx, n.x), tdy = ty - n.y, dd = Math.hypot(tdx, tdy) || 1;
    n.vx += (tdx / dd * s - n.vx) * Math.min(1, dt * 4);
    n.vy += (tdy / dd * s - n.vy) * Math.min(1, dt * 4);
    n.x = wrapX(n.x + n.vx * dt); n.y = clamp(n.y + n.vy * dt, 20, bedY(n.x) - 10);
    if (Math.abs(n.vx) > 3) n.facing = n.vx > 0 ? 1 : -1;
  }

  // A school fish that is bitten calls on its schoolmates. Nearby schoolmates bite back at the attacker.
  function schoolDefend(victim, attacker) {
    if (!victim.sp.school) return;
    var r = run, isPlayer = attacker === null;
    var ax = isPlayer ? r.x : attacker.x, ay = isPlayer ? r.y : attacker.y;
    for (var i = 0; i < r.npcs.length; i++) {
      var o = r.npcs[i];
      if (o === victim || o === attacker || o.dead || o.sp !== victim.sp || o.biteT > 0) continue;
      if (distW(o, victim) > 220 || distXY(o.x, o.y, ax, ay) > 260) continue;
      o.biteT = STRIKE_S;
      var dmg = atkOf(o.size);
      if (isPlayer) { hurt(o, dmg); continue; }
      attacker.hp -= dmg;
      burst(attacker.x, attacker.y, '#d9473a', 3);
      if (attacker.hp <= 0 && !attacker.dead) { attacker.dead = true; dropChum(attacker); }
    }
  }

  function findNear(n, rad, test) {
    var best = null, bd = rad;
    for (var i = 0; i < run.npcs.length; i++) {
      var o = run.npcs[i];
      if (o === n || o.dead || !test(o)) continue;
      var d = distW(o, n);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // Food close by: chum first, then plankton and krill.
  function findFeed(n, ok) {
    var keep = ok || function () { return true; };
    return findNear(n, 260, function (o) { return o.sp === CHUM && keep(o); }) ||
      findNear(n, 180, function (o) { return o.sp.kind === 'food' && keep(o); });
  }

  // ---------- populations: the sea adapts to your size ----------
  // Only a non-docile fish with a damaging temper (hunter or ambusher) can hurt you.
  function canHurt(sp) { return (sp.kind === 'hunter' || sp.kind === 'ambush') && sp.temper !== 'docile'; }
  // v0.10: any fish can fight any fish. Food and harmless fish never bite; every other fish does, docile or not.
  // Fights are decided by the values: each bite takes off the attacker's attack, and a fish is out when its health is gone.
  function canBite(sp) { return sp.kind !== 'food' && sp.kind !== 'harmless'; }
  // A fish's fighting value, attack times the bites it can still take. Allies use it to pick fights they can win.
  function fightPower(o) { return atkOf(o.size) * Math.max(1, o.hp); }
  function isThreat(o, P) { return canHurt(o.sp) && o.size >= P * 1.1; }
  function isEdible(o, P) { return o.sp.kind !== 'harmless' && o.sp.kind !== 'food' && o.size <= P * 0.87; }

  // Fish by tier relative to you: below (prey side), same, above (predator side).
  function spread() {
    var t = run.info.n, out = { below: 0, same: 0, above: 0 };
    run.npcs.forEach(function (o) {
      if (o.dead || o.pod || o.sp.kind === 'food') return;
      var d = o.sp.tier - t;
      if (d < 0) out.below++; else if (d === 0) out.same++; else out.above++;
    });
    return out;
  }

  function census() {
    var P = run.size, c = { fish: 0, threat: 0, edible: 0, harmless: 0, food: 0 };
    run.npcs.forEach(function (o) {
      if (o.dead || o.pod) return;
      if (o.sp.kind === 'food') { c.food++; return; }
      c.fish++;
      if (o.sp.kind === 'harmless') c.harmless++;
      if (isThreat(o, P)) c.threat++;
      if (isEdible(o, P)) c.edible++;
    });
    return c;
  }

  // Share of new fish that are threats: the difficulty ratio, raised by up to 50% as time passes.
  function threatShare() {
    var base = D.DIFFICULTY[run.difficulty].share;
    return Math.min(0.7, base * (1 + 0.5 * run.tension));
  }

  // Pick a species for a role. Predators come from 1–3 tiers above you, prey from 0–3 tiers below.
  // Size still decides who is a threat or edible. If nothing fits that window, any size-fitting species is used.
  function pickSpecies(role, P) {
    var t = run.info.n;
    var inTiers = function (sp) {
      if (role === 'threat') return sp.tier > t && sp.tier <= t + 3;
      if (role === 'harmless') return sp.tier >= t && sp.tier <= t + 3;
      return sp.tier <= t && sp.tier >= t - 3;
    };
    var bg = bgOn();
    var fits = function (sp) {
      if (sp.kind === 'food' || sp.bg) return false;   // v0.12: background items are placed by fillCreatures, by level
      if (role === 'threat') return canHurt(sp) && sp.size >= P * 1.15 && sp.size <= P * 1.9;
      if (role === 'harmless') return sp.kind === 'harmless' && sp.size <= P * 1.6;
      return sp.kind !== 'harmless' && sp.size >= P * 0.25 && sp.size <= P * 0.85;
    };
    var pool = SPECIES.filter(function (sp) { return fits(sp) && inTiers(sp); });
    if (!pool.length) pool = SPECIES.filter(fits);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  function pickRole(c) {
    if (c.harmless < 1 + Math.floor(run.info.n / 3) && Math.random() < 0.08) return 'harmless';
    var total = c.threat + c.edible;
    return (total === 0 || c.threat / total < threatShare()) ? 'threat' : 'edible';
  }

  // v0.11: the sea is twice as big in each direction, so with the same fish it would be four times as empty.
  // "Denser sea" (on by default) keeps the fish as dense as before the sea grew: four times the fish.
  function denseOn() {
    try { return localStorage.getItem('fish_dense') !== 'off'; } catch (e) { return true; }
  }
  // v0.11: a few turtles, crabs and jellyfish for each level, so the sea is busier than fish alone.
  // Each kind has a target; a new one comes in at most one per refill, and only from its own tier on.
  var CREATURE_TARGETS = [['turtle', function (n) { return 1 + Math.floor(n / 4); }],
    ['crab', function (n) { return 3 + Math.floor(n / 2); }],
    ['moon', function (n) { return 1 + Math.floor(n / 3); }],
    ['sock', function (n) { return 2 + Math.floor(n / 2); }],
    ['underwear', function (n) { return 2 + Math.floor(n / 2); }],
    ['toycar', function (n) { return 2 + Math.floor(n / 2); }],
    ['bottle', function (n) { return 2 + Math.floor(n / 2); }],
    // v0.12 background items, by level (their tier gates them). Scenery and floating things never hunt. Shrimp, squid
    // and urchins are food: they are placed here, not by size, so they are in the sea at the levels where they belong.
    ['clam', function (n) { return 2 + Math.floor(n / 3); }],
    ['rock', function (n) { return 2 + Math.floor(n / 2); }],
    ['boat', function (n) { return 1 + Math.floor(n / 4); }],
    ['sub', function (n) { return 1 + Math.floor(n / 8); }],
    ['lionsmane', function (n) { return 1 + Math.floor(n / 4); }],
    ['shrimp', function (n) { return 3 + Math.floor(n / 2); }],
    ['urchin', function (n) { return 2 + Math.floor(n / 3); }],
    ['longurchin', function (n) { return 1 + Math.floor(n / 4); }],
    ['squid', function (n) { return 2 + Math.floor(n / 3); }]];
  // v0.12 kelp forest: tall, thick seaweed patches. They are on while background items are on, and go when it is off.
  function makeForests(info) {
    var count = Math.max(2, Math.round(info.W / 700)), list = [], i;
    for (i = 0; i < count; i++) {
      list.push({ x: rand(0, info.W), h: rand(170, 260), n: 9 + Math.floor(Math.random() * 4), seed: Math.random() * 10, forest: true });
    }
    return list;
  }
  function syncForest() {
    var r = run, on = bgOn();
    if (!r || !r.flora) return;
    r.flora = r.flora.filter(function (f) { return !f.forest || on; });
    if (on && !r.flora.some(function (f) { return f.forest; })) r.flora = r.flora.concat(makeForests(r.info));
  }
  function fillCreatures() {
    var r = run, n = r.info.n, trash = trashOn(), bg = bgOn();
    if (!trash) r.npcs.forEach(function (o) { if (o.sp.trash) o.dead = true; });   // the room is clean: the trash goes
    if (!bg) r.npcs.forEach(function (o) { if (o.sp.bg) o.dead = true; });        // v0.12: so do the background items
    syncForest();
    CREATURE_TARGETS.forEach(function (c) {
      var sp = SPECIES.filter(function (x) { return x.id === c[0]; })[0];
      if (!sp || sp.tier > n || (sp.trash && !trash) || (sp.bg && !bg)) return;
      var have = r.npcs.filter(function (o) { return !o.dead && o.sp.id === sp.id; }).length;
      if (have < c[1](n)) spawnNPC(sp, false);
    });
  }

  function fillPopulations(initial) {
    var r = run, n = r.info.n, counts = {}, i;
    fillCreatures();
    var dense = denseOn() ? 4 : 1;   // (3200 x 2000) / (1600 x 1000) = 4
    // Food first: plankton from tier 1, krill from tier 2.
    r.npcs.forEach(function (o) { if (!o.dead) counts[o.sp.id] = (counts[o.sp.id] || 0) + 1; });
    SPECIES.forEach(function (sp) {
      if (sp.kind !== 'food' || sp.tier > n) return;
      var target = Math.round(sp.base * (1 + 0.05 * (n - 1)) * dense);
      var add = Math.min(target - (counts[sp.id] || 0), initial ? target : 4 * dense);
      for (i = 0; i < add; i++) spawnNPC(sp, initial);
    });
    // Fish: a tier-sized population, split into threats and edible fish by the ratio.
    var c = census();
    var need = Math.round((22 + 3 * n) * dense) - c.fish;
    var budget = initial ? 999 : 2 * dense;
    while (need > 0 && budget > 0) {
      var role = pickRole(c), actual = role;
      var sp = pickSpecies(role, r.size);
      if (!sp) { actual = 'edible'; sp = pickSpecies('edible', r.size); }
      if (!sp) break;
      spawnNPC(sp, initial);
      var lead = r.npcs[r.npcs.length - 1], made = 1;
      if (sp.kind === 'hunter' && Math.random() < 0.6) {   // hunters often come in packs of 2 to 3 (v0.9)
        var pk = ++r.packSeq, extra = 1 + Math.floor(Math.random() * 2), pi;
        lead.pack = pk;
        for (pi = 0; pi < extra; pi++) {
          spawnNPC(sp, initial);
          var mate = r.npcs[r.npcs.length - 1];
          mate.x = wrapX(lead.x + rand(-120, 120));
          mate.y = clamp(lead.y + rand(-120, 120), 40, bedY(mate.x) - 30);
          mate.anchor = { x: mate.x, y: mate.y };
          mate.arrive = lead.arrive;
          mate.pack = pk;
          made++;
        }
      }
      c.fish += made;
      if (actual === 'threat') c.threat += made;
      else if (actual === 'harmless') c.harmless += made;
      else c.edible += made;
      need -= made;
      budget--;
    }
  }

  // ---------- player ----------
  function speedFor(size) { return 200 * clamp(1.15 - 0.0045 * size, 0.62, 1.15); }

  function toWorld(sx, sy) {
    return { x: cam.x + (sx - CW / 2) / cam.scale, y: cam.y + (sy - CH / 2) / cam.scale };
  }

  function updatePlayer(dt) {
    var r = run, dx = 0, dy = 0;
    r.biteT = Math.max(0, (r.biteT || 0) - dt);
    r.maxHp = playerMaxHp(r.size);
    r.hp = Math.min(r.hp, r.maxHp);
    r.quietT = (r.quietT || 0) + dt;
    if (r.quietT > 4 && r.hp < r.maxHp) r.hp = Math.min(r.maxHp, r.hp + 3 * dt);
    if (control === 'joystick' && Math.hypot(joy.dx, joy.dy) > 0.15) {
      dx = joy.dx; dy = joy.dy;
      var jm = Math.hypot(dx, dy);
      if (jm > 1) { dx /= jm; dy /= jm; }
    } else if (control === 'tap' && ptr.down) {
      var w = toWorld(ptr.x, ptr.y);
      var ex = dxW(w.x, r.x), ey = w.y - r.y, dist = Math.hypot(ex, ey);
      if (dist > 14) { dx = ex / dist; dy = ey / dist; }
    }
    var kx = (keys.ArrowRight || keys.d || keys.D ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.A ? 1 : 0);
    var ky = (keys.ArrowDown || keys.s || keys.S ? 1 : 0) - (keys.ArrowUp || keys.w || keys.W ? 1 : 0);
    if (kx || ky) {
      var kl = Math.hypot(kx, ky);
      dx = kx / kl;
      dy = ky / kl;
    }
    var moving = dx !== 0 || dy !== 0;
    var sprint = (sprintHeld || keys.Shift || keys[' ']) && moving && r.stamina > 0;
    if (sprint) {
      r.stamina = Math.max(0, r.stamina - 38 * dt);
      r.sprintCd = 0.8;
    } else {
      r.sprintCd -= dt;
      if (r.sprintCd <= 0) r.stamina = Math.min(100, r.stamina + 24 * dt);
    }
    r.sprinting = sprint;
    var sp = speedFor(r.size) * (1 + 0.03 * (r.info.n - 1)) * (sprint ? 2.1 : 1);   // v0.11: +3% a level, like the fish
    var k = Math.min(1, dt * 7);
    r.vx += (dx * sp - r.vx) * k;
    if (!r.air) r.vy += (dy * sp - r.vy) * k;
    r.x = wrapX(r.x + r.vx * dt + currentAt(r.y) * 0.5 * dt);
    if (r.air) {
      // In the air: gravity, then a splash when you land back on the surface.
      r.vy += GRAV * dt;
      r.y += r.vy * dt;
      if (r.y >= 0 && r.vy > 0) {
        r.air = false; r.y = 0; r.vy = 0;
        burst(r.x, 0, '#cfeeff', Math.min(24, 8 + Math.floor(r.size / 2)));
        FishSound.play('eat');
      }
    } else {
      r.y += r.vy * dt;
      if (r.y < 0) {
        // Swimming up through the surface: hop out, higher the bigger the fish.
        r.air = true; r.y = 0; r.vy = -Math.sqrt(2 * GRAV * hopHeight(r.size));
      }
      if (r.y > bedY(r.x) - 10) { r.y = bedY(r.x) - 10; r.vy = Math.min(0, r.vy); }
    }
    r.hidden = !!r.air || (r.anemones || []).some(function (a) { return distXY(a.x, a.y, r.x, r.y) < ANEMONE_R; });
    if (Math.abs(r.vx) > 6) r.facing = r.vx > 0 ? 1 : -1;
    if (r.inv > 0) r.inv -= dt;
  }

  // ---------- NPC behaviour ----------
  function wander(n, rad) {
    var r = run;
    if (n.tT <= 0 || !n.tgt) {
      var tx = wrapX(n.anchor.x + rand(-rad, rad));
      n.tgt = { x: tx, y: clamp(n.anchor.y + rand(-rad * 0.6, rad * 0.6), 20, bedY(tx) - 20) };
      n.tT = rand(2, 4);
    }
    return n.tgt;
  }

  // Nearest fish this predator can eat (at least 1.25x smaller), within 240 units.
  function findPrey(n) {
    var r = run, best = null, bd = 240 + 12 * r.info.n;   // v0.11: hunters look further on deeper levels
    for (var i = 0; i < r.npcs.length; i++) {
      var o = r.npcs[i];
      if (o === n || o.dead || o.sp.kind === 'food' || o.sp.kind === 'harmless') continue;
      if (o.size * 1.25 > n.size) continue;
      var d = distW(o, n);
      if (o.hp < o.maxHp) d *= 0.5;   // once a fish is hurt, others go for it
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  function updateNPC(n, dt, predators) {
    var sp = n.sp, r = run;
    if (n.pod) { updatePodMember(n, dt); return; }
    n.biteT = Math.max(0, (n.biteT || 0) - dt);
    if (n.life !== undefined) { n.life -= dt; if (n.life <= 0) { n.dead = true; return; } }
    n.t += dt;
    n.cool = Math.max(0, n.cool - dt);
    n.tT -= dt;
    var dxp = dxW(r.x, n.x), dyp = r.y - n.y, dp = Math.hypot(dxp, dyp) || 1;
    var speed = sp.speed * n.spd * (1 + 0.03 * (r.info.n - 1)) * (1 + Math.min(0.4, n.size / 250));   // v0.11: bigger fish are faster
    var tx = null, ty = null, s = 0, k = 2.5;

    if (sp.kind === 'food') {
      // v0.11: plankton and krill scatter from any other fish that swims close (you still catch them on contact).
      var threatF = findNear(n, 170, function (o) { return o.sp.kind !== 'food' && o.sp.kind !== 'harmless' && !o.pod; });
      if (threatF) {
        var fx2 = dxW(n.x, threatF.x), fy2 = n.y - threatF.y;
        var fl2 = Math.hypot(fx2, fy2) || 1;
        tx = n.x + fx2 / fl2 * 300; ty = n.y + fy2 / fl2 * 300; s = speed * 1.6; k = 4;
      } else {
        var fw = wander(n, 300);
        tx = fw.x; ty = fw.y; s = speed * 0.5;
      }
    } else if (sp.kind === 'prey') {
      var fx = 0, fy = 0, threat = false, i, pr;
      if (!r.hidden && r.size >= n.size * 1.15 && dp < 320) { threat = true; fx -= dxp / dp; fy -= dyp / dp; }
      var scatter = false;
      for (i = 0; i < predators.length; i++) {
        pr = predators[i];
        if (pr.size < n.size * 1.15) continue;
        var ddx = dxW(n.x, pr.x), ddy = n.y - pr.y, dd = Math.hypot(ddx, ddy) || 1;
        // A predator 2.5x their size makes prey scatter from further away.
        var huge = pr.size >= n.size * 2.5;
        if (dd < (huge ? 420 : 280)) { threat = true; scatter = scatter || huge; fx += ddx / dd; fy += ddy / dd; }
      }
      if (threat) {
        var fl = Math.hypot(fx, fy) || 1;
        tx = n.x + fx / fl * 400; ty = n.y + fy / fl * 400; s = speed * (scatter ? 2.2 : 1.7); k = 6;
      } else if (findFeed(n)) {
        var fd = findFeed(n); tx = fd.x; ty = fd.y; s = speed * 0.7;
      } else if (sp.school) {
        var cx = 0, cy = 0, c = 0, j;
        for (j = 0; j < r.npcs.length; j++) {
          var o = r.npcs[j];
          if (o === n || o.sp !== sp || o.dead) continue;
          var ex = dxW(o.x, n.x), ey = o.y - n.y;
          if (ex * ex + ey * ey < 260 * 260) { cx += o.x; cy += o.y; c++; }
        }
        if (c > 0) { tx = cx / c; ty = cy / c; s = speed * 0.8; }
      }
      if (tx === null) { var pw = wander(n, 350); tx = pw.x; ty = pw.y; s = speed * 0.5; }
    } else if (sp.kind === 'ambush') {
      var range = sp.range || 160;
      if (n.lunge > 0) {
        n.lunge -= dt;
        tx = n.lx; ty = n.ly; s = speed * 3.2; k = 8;
      } else if (sp.temper === 'aggressive' && n.cool <= 0 && !r.hidden && r.size * 1.1 < n.size && dp < range + n.size * 2) {
        n.lunge = 0.9; n.cool = 3.5;
        n.lx = r.x; n.ly = r.y;
        tx = n.lx; ty = n.ly; s = speed * 3.2; k = 8;
      } else {
        var ambushPrey = n.cool <= 0 ? findPrey(n) : null;
        if (ambushPrey) {
          n.lunge = 0.9; n.cool = 3.5; n.lx = ambushPrey.x; n.ly = ambushPrey.y;
          tx = n.lx; ty = n.ly; s = speed * 3.2; k = 8;
        } else {
          if (n.patch) {   // a loop round its kelp: the fish grazes what gathers there
            tx = n.anchor.x + Math.cos(n.t * 0.45) * 100; ty = n.anchor.y + Math.sin(n.t * 0.45) * 30; s = speed * 0.8;
          } else {
            tx = n.anchor.x + Math.sin(n.t * 0.6) * 30; ty = n.anchor.y + Math.cos(n.t * 0.5) * 20; s = speed * 0.35;
          }
        }
      }
    } else if (sp.kind === 'hunter') {
      var canEat = !r.hidden && r.size * 1.1 < n.size;   // the player is prey to this fish (not while hidden under an anemone)
      var playerBig = r.size > n.size * 1.25;  // a bigger fish scares it off
      if (n.locked) {
        n.lockT -= dt;
        if (!canEat || n.lockT <= 0 || dp > sp.sense * 2.2) {
          n.locked = false;
          n.cool = 4;
        } else {
          tx = r.x; ty = r.y; s = sp.speed * (1.1 + 0.3 * r.tension) * n.spd; k = 4;
        }
      }
      if (!n.locked) {
        if (playerBig && dp < 220) {
          tx = n.x - dxp / dp * 400; ty = n.y - dyp / dp * 400; s = speed * 1.2; k = 5;
        } else if (sp.temper === 'aggressive' && canEat && n.cool <= 0 && dp < sp.sense && Math.random() < (0.4 + 0.6 * r.tension) * dt) {
          n.locked = true;
          n.lockT = 7 + 2 * r.tension;
          shareLock(n);
          tx = r.x; ty = r.y; s = sp.speed * (1.1 + 0.3 * r.tension) * n.spd; k = 4;
        } else {
          var chumNear = sp.temper !== 'docile' ? findNear(n, 300, function (o) { return o.sp === CHUM; }) : null;
          var hunted = sp.temper !== 'docile' ? findPrey(n) : null;
          var food = !hunted && sp.temper !== 'docile' ? findNear(n, 260, function (o) { return o.sp.kind === 'food'; }) : null;
          if (chumNear) { tx = chumNear.x; ty = chumNear.y; s = speed * 0.9; k = 3; }
          else if (hunted) { tx = hunted.x; ty = hunted.y; s = speed * 1.1; k = 3; }
          else if (food) { tx = food.x; ty = food.y; s = speed * 0.6; }
          else { var hw = wander(n, 900); tx = hw.x; ty = hw.y; s = speed * 0.6; }
        }
      }
    } else { // harmless
      var bw = wander(n, 600);
      tx = bw.x; ty = bw.y + Math.sin(n.t * 0.7) * 40; s = speed * 0.5;
    }

    if (n.arrive > 0) { n.arrive -= dt; tx = r.x; ty = r.y; s = speed * 0.7; }
    var dvx = 0, dvy = 0;
    if (tx !== null) {
      var ddx2 = dxW(tx, n.x), ddy2 = ty - n.y, dd2 = Math.hypot(ddx2, ddy2);
      if (dd2 > 2) { dvx = ddx2 / dd2 * s; dvy = ddy2 / dd2 * s; }
    }
    var turn = k / (1 + n.size / 120);   // v0.11: bigger fish are less nimble on turns
    n.vx += (dvx - n.vx) * Math.min(1, dt * turn);
    n.vy += (dvy - n.vy) * Math.min(1, dt * turn);
    n.x = wrapX(n.x + n.vx * dt + currentAt(n.y) * dt);
    n.y = clamp(n.y + n.vy * dt, 20, bedY(n.x) - 10);
    if (sp.bed) n.y = bedY(n.x) - 12;   // v0.11: crabs walk the seabed
    if (sp.surf) n.y = surfY(n.x) - 26;   // v0.12: boats float on the surface
    if (Math.abs(n.vx) > 3) n.facing = n.vx > 0 ? 1 : -1;
  }

  // ---------- eating, being eaten, growing ----------
  function burst(x, y, col, count) {
    for (var i = 0; i < count; i++) {
      run.parts.push({ x: x, y: y, vx: rand(-120, 120), vy: rand(-120, 40), life: 0.6, max: 0.6, col: col, r: rand(2, 5) });
    }
  }

  function floatText(x, y, txt) {
    run.parts.push({ x: x, y: y, vx: 0, vy: -60, life: 0.9, max: 0.9, txt: txt });
  }

  function updateParts(dt) {
    run.parts.forEach(function (p) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
    });
    run.parts = run.parts.filter(function (p) { return p.life > 0; });
  }

  // v0.12: one level at a time. A level-up starts the calm, and no other level-up can happen until it is over.
  // Growth past the goal is kept, so the next level comes when the calm ends (update checks it every frame).
  function checkGrowth() {
    if (!run || mode !== 'play' || (run.calmT || 0) > 0 || run.size < run.goal) return;
    FishSound.play('levelup');
    if (run.info.n >= 20) {
      // Endless (v0.9): no win and no time cap after level 20. The goal keeps rising, and the score goes up.
      run.goal = run.goal * 1.25;
      run.calmT = CALM_S;
      showBanner('Endless', 'Next goal: size ' + run.goal.toFixed(0), 2500);
      return;
    }
    enterLevel(run.info.n + 1);
  }

  function eatNPC(n) {
    var r = run, gain;
    n.dead = true;
    if (n.sp.spiky) {
      r.size = Math.max(0.6, r.size - 2);
      floatText(n.x, n.y, 'Spines! -2');
      FishSound.play('hurt');
    } else {
      // A level takes about nine fish meals at most: each meal gives at least a ninth of the level's size range.
      var span = Math.max(0.5, r.info.meal);
      gain = n.sp.kind === 'food' ? n.size * 0.4 : Math.max(n.size * 0.25, span / (r.info.n >= 20 ? 10 : 9));   // level 20: ten meals (v0.9)
      r.size += gain;
      floatText(n.x, n.y, '+' + gain.toFixed(1));
      FishSound.play('eat');
    }
    r.eaten++;
    burst(n.x, n.y, n.sp.col || '#ffffff', 6);
    dropChum(n);
    if (n.sp === CHUM) {
      var pod = run.npcs.filter(function (o) { return o.pod && !o.dead && distW(o, n) < 240; });
      var members = run.npcs.filter(function (o) { return o.pod && !o.dead; }).length;
      if (pod.length && (run.podSpawns || 0) < 12 && Math.random() < 0.5) spawnPod();   // fed chum: the group grows
    }
    checkGrowth();
  }

  function hurt(n, dmg) {
    var r = run;
    if (D.DIFFICULTY[r.difficulty] && D.DIFFICULTY[r.difficulty].calm) return;   // v0.11 Calm: nothing can hurt you
    r.hitBy = n.sp.name;
    if (r.inv > 0) return;
    r.quietT = 0;
    r.hp = Math.max(0, r.hp - dmg);
    burst(r.x, r.y, '#d9473a', 6 + dmg);
    if (r.hp > 0) { floatText(r.x, r.y, '-' + dmg); return; }
    r.lives--;
    FishSound.play('hurt');
    r.size = Math.max(r.info.enterSize, r.size * 0.75);
    r.hp = playerMaxHp(r.size);
    if (r.lives <= 0) { r.lives = 0; endRun('eaten'); return; }
    r.x = r.info.W / 2;
    r.y = r.info.H / 2;
    r.vx = 0;
    r.vy = 0;
    r.inv = 3;
    r.npcs.forEach(function (o) { o.locked = false; o.cool = 3; });
    r.npcs = r.npcs.filter(function (o) { return distW(o, r) > 420; });
    cam.x = r.x;
    cam.y = r.y;
    showBanner('Ouch!', r.lives + (r.lives === 1 ? ' life' : ' lives') + ' left. Swim on!', 2200);
  }

  function checkContact(n) {
    var r = run, sp = n.sp;
    if (n.pod) return;          // your school neither hurts you nor is eaten by you
    if (n.arrive > 0) return;   // arriving fish do not touch you until they have settled
    var d = distW(n, r);
    var reach = (lenFor(r.size, 'round') + lenFor(n.size, sp.shape)) * 0.36;
    if (d > reach) return;
    if (sp.kind === 'food') {   // plankton and chum bits go in one go; they also start the bite timer
      if (r.size >= n.size * 1.15) { r.biteT = Math.max(r.biteT, BITE_S); eatNPC(n); }
      return;
    }
    // v0.11: a jellyfish stings you on contact, every 1.5 s, and cannot be eaten. Hidden under an anemone, you are safe.
    if (sp.sting) {
      if (n.biteT <= 0 && !r.hidden) { n.biteT = 1.5; hurt(n, 2); if (mode !== 'play' || run !== r) return; }
      return;
    }
    // v0.12: harmless creatures (crabs, turtles, clams, rocks, boats, a submarine) are never food: you touch them and move on.
    if (sp.kind === 'harmless') return;
    // v0.10: a fight with a fish of any size. Each side bites on its own timer, for its attack value.
    // Hidden under an anemone, the fish cannot bite you; you can still bite it.
    if (canBite(sp) && !r.hidden && n.biteT <= 0) {
      n.biteT = STRIKE_S;
      hurt(n, atkOf(n.size));
      if (mode !== 'play' || run !== r) return;   // you may have lost a life (the fish is then reset)
    }
    if (r.biteT <= 0) {
      r.biteT = BITE_S;
      r.lastBit = n;   // v0.11: the target your allies join when you use Attack
      n.hp -= atkOf(r.size);
      burst(n.x, n.y, '#d9473a', 5);
      schoolDefend(n, null);
      if (n.hp <= 0) eatNPC(n);
    }
  }

  // ---------- rules, timing, ending ----------
  function scoreOf(r) { return r.level * 100 + Math.floor(r.size * 10) + r.eaten * 2; }

  function endRun(reason) {
    var r = run;
    if (!r || mode !== 'play') return;
    mode = 'over';
    var score = scoreOf(r) + (reason === 'win' ? 500 : 0);
    r.score = score;
    if (score > best) {
      best = score;
      try { localStorage.setItem('fish_best', String(best)); } catch (e) { /* private mode */ }
    }
    var title, text;
    if (reason === 'win') {
      title = 'You are the largest fish ever!';
      text = 'From a baby fish to a whale shark in ' + mmss(r.t) + '. Plankton, to the very top.';
      FishSound.play('win');
    } else if (reason === 'quit') {
      title = 'Game ended';
      text = 'You reached level ' + r.level + ' (' + r.info.name + ') at size ' + r.size.toFixed(1) + '.';
    } else if (reason === 'eaten') {
      title = 'Eaten!';
      text = 'Eaten by a ' + (r.hitBy || 'bigger fish') + '. You reached level ' + r.level + ' (' + r.info.name + ') at size ' + r.size.toFixed(1) + '.';
      FishSound.play('lose');
    } else {
      title = "Time's up";
      text = 'Fifteen minutes in the sea. You reached level ' + r.level + ' (' + r.info.name + ').';
      FishSound.play('lose');
    }
    text += ' Score ' + score + '. Best ' + best + '.';
    showCard(title, text);
  }

  function update(dt) {
    var r = run;
    r.t += dt;
    r.tension = clamp((r.t - CFG.TENSION.start) / (CFG.TENSION.full - CFG.TENSION.start), 0, 1);
    r.bgT = Math.min(1, (r.bgT || 0) + dt / 2);
    r.calmT = Math.max(0, (r.calmT || 0) - dt);   // v0.12: the calm after a level-up
    if (r.t >= CFG.TIME_LIMIT && r.info.n < 20) { endRun('time'); return; }   // endless after level 20: no time cap

    updatePlayer(dt);

    updatePods();
    updateBirds(dt);
    if (r.cmd) { r.cmd.t -= dt; if (r.cmd.t <= 0 || r.cmd.target.dead) r.cmd = null; }
    if (r.cmdCd > 0) r.cmdCd = Math.max(0, r.cmdCd - dt);
    r.spawnT = (r.spawnT || 0) - dt;
    // v0.12: no new fish swim in during the calm; the sea you have settles first.
    if (r.spawnT <= 0) { r.spawnT = 1.2; if (r.calmT <= 0) fillPopulations(false); }

    var predators = r.npcs.filter(function (o) {
      return !o.dead && (o.sp.kind === 'hunter' || o.sp.kind === 'ambush');
    });
    var i;
    for (i = 0; i < r.npcs.length; i++) {
      if (!r.npcs[i].dead) updateNPC(r.npcs[i], dt, predators);
    }
    // Ally meals add to your size (v0.10). v0.12: growth past the goal waits for the calm to end, then one level.
    if (r.growPending || r.size >= r.goal) { r.growPending = false; checkGrowth(); }

    // Fights between fish (v0.10): any fish bites any fish it touches, except food and its own species.
    // Each bite takes off the attacker's attack value; a fish is out when its health reaches zero.
    // An ally's kill feeds you (half a meal), and an ally that is killed counts as lost, not eaten.
    for (i = 0; i < r.npcs.length; i++) {
      var eater = r.npcs[i];
      if (eater.dead || eater.biteT > 0 || !canBite(eater.sp)) continue;
      for (var j = 0; j < r.npcs.length; j++) {
        var meal = r.npcs[j];
        if (meal === eater || meal.dead || meal.sp === eater.sp) continue;
        // v0.12: your school never fights itself, nothing bites it during the calm, and harmless creatures are not food.
        if (eater.pod && meal.pod) continue;
        if (meal.pod && r.calmT > 0) continue;
        if (meal.sp.kind === 'harmless') continue;
        var md = distW(eater, meal);
        if (md < (lenFor(eater.size, eater.sp.shape) + lenFor(meal.size, meal.sp.shape)) * 0.36) {
          if (meal.sp.kind === 'food') {   // v0.11: small fish eat plankton and chum they touch
            meal.dead = true; eater.biteT = Math.max(eater.biteT, 0.3); r.fedFish = (r.fedFish || 0) + 1;
            burst(meal.x, meal.y, meal.sp.col || '#ffffff', 3);
            if (eater.ally) healAlly(eater, 1);
            break;
          }
          eater.biteT = STRIKE_S;
          meal.hp -= atkOf(eater.size);
          burst(meal.x, meal.y, '#d9473a', 4);
          schoolDefend(meal, eater);
          if (meal.hp <= 0) {
            meal.dead = true;
            if (!meal.pod) r.npcEaten++;
            burst(meal.x, meal.y, meal.sp.col || '#ffffff', 4);
            dropChum(meal);
            if (eater.ally) allyCredit(meal);
          }
          break;
        }
      }
    }

    tendFollowers(dt);   // v0.12: friends join, and followers over the limit are released

    var locks = 0;
    for (i = 0; i < r.npcs.length; i++) if (r.npcs[i].locked) locks++;
    if (locks > (r.lockedCount || 0)) FishSound.play('lock');
    r.lockedCount = locks;

    var list = r.npcs.slice();
    var lvl = r.info.n;
    for (i = 0; i < list.length; i++) {
      if (list[i].dead) continue;
      checkContact(list[i]);
      if (mode !== 'play' || run.info.n !== lvl) break;
    }
    if (mode === 'play') r.npcs = r.npcs.filter(function (o) { return !o.dead; });
    updateParts(dt);
    if (r.bannerT > 0) {
      r.bannerT -= dt;
      if (r.bannerT <= 0) hideBanner();
    }
  }

  // ---------- rendering ----------
  // Screen-side x for a world x: the nearest copy of it to the camera (the sea wraps).
  function viewX(x) { return cam.x + dxW(x, cam.x); }

  // The sea surface and the sky above it: a wavy line that tiles with the sea.
  function drawSurface() {
    var halfW = CW / 2 / cam.scale + 60, x0 = cam.x - halfW, x1 = cam.x + halfW, x;
    ctx.fillStyle = 'rgba(232,247,255,0.92)';
    ctx.beginPath();
    ctx.moveTo(x0, -4000);
    for (x = x0; x <= x1; x += 12) ctx.lineTo(x, surfY(x));
    ctx.lineTo(x1, -4000);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3 / cam.scale;
    ctx.beginPath();
    for (x = x0; x <= x1; x += 12) { if (x === x0) ctx.moveTo(x, surfY(x)); else ctx.lineTo(x, surfY(x)); }
    ctx.stroke();
  }

  // The seabed: a bumpy line of hills, sand below it. It tiles with the sea.
  function drawSeabed(zone) {
    var halfW = CW / 2 / cam.scale + 60, x0 = cam.x - halfW, x1 = cam.x + halfW, x;
    ctx.fillStyle = zone.sand;
    ctx.beginPath();
    ctx.moveTo(x0, run.info.H + 4000);
    for (x = x0; x <= x1; x += 12) ctx.lineTo(x, bedY(x));
    ctx.lineTo(x1, run.info.H + 4000);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(45,58,74,0.35)';
    ctx.lineWidth = 3 / cam.scale;
    ctx.beginPath();
    for (x = x0; x <= x1; x += 12) { if (x === x0) ctx.moveTo(x, bedY(x)); else ctx.lineTo(x, bedY(x)); }
    ctx.stroke();
  }

  // Kelp: swaying stalks rising from the seabed.
  function drawFlora(t) {
    var halfW = CW / 2 / cam.scale + 300;
    (run.flora || []).forEach(function (f) {
      var px = viewX(f.x);
      if (px < cam.x - halfW || px > cam.x + halfW) return;
      var base = bedY(f.x), i;
      for (i = 0; i < f.n; i++) {
        var off = (i - (f.n - 1) / 2) * 12, sway = Math.sin(t * 1.3 + f.seed + i * 0.5) * 14;
        var hgt = f.h * (0.75 + 0.25 * (((i * 37) % 5) / 4));
        ctx.strokeStyle = i % 2 ? '#2f8f5b' : '#3fa36b';
        ctx.lineWidth = 7 / cam.scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px + off, base + 6);
        ctx.quadraticCurveTo(px + off + sway * 0.3, base - hgt * 0.5, px + off + sway, base - hgt);
        ctx.stroke();
      }
    });
  }

  // A sea anemone: a pink mound with tentacles that wave (a safe spot, see ANEMONE_R).
  function drawAnemone(x, y, t) {
    var k = 1 / cam.scale, i;
    ctx.save();
    ctx.lineCap = 'round';
    for (i = 0; i < 7; i++) {
      var bx = x + (i - 3) * 9, sway = Math.sin(t * 1.6 + i) * 10 * k;
      ctx.strokeStyle = i % 2 ? '#f48fb1' : '#ff9ec4';
      ctx.lineWidth = 6 * k;
      ctx.beginPath();
      ctx.moveTo(bx, y + 22);
      ctx.quadraticCurveTo(bx + sway * 0.6, y - 10, bx + sway, y - 34 - (i % 3) * 6 * k);
      ctx.stroke();
    }
    ctx.fillStyle = '#e3a0b8';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.5 * k;
    ctx.beginPath();
    ctx.ellipse(x, y + 26, 46, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Mini map (v0.11): the whole sea, left to right, with the right edge joining the left.
  // Red: big predators that can hurt you. Pink: anemones (safe spots). White: you. The box is what the screen shows.
  var mapCanvas = $('minimap'), mapCtx = mapCanvas ? mapCanvas.getContext('2d') : null;
  function drawMinimap() {
    if (!mapCtx) return;
    // v0.12: drawn in a 170 x 68 space. The canvas is K times that, so the bigger tablet map stays sharp.
    var W = run.info.W, H = run.info.H, K = mapCanvas.width / 170, w = 170, h = 68, P = run.size;
    var mx = function (x) { return ((x % W) + W) % W / W * w; };
    var my = function (y) { return clamp(y / H, 0, 1) * h; };
    mapCtx.setTransform(1, 0, 0, 1, 0, 0);
    mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapCtx.setTransform(K, 0, 0, K, 0, 0);
    mapCtx.fillStyle = '#e9fbf5';
    mapCtx.fillRect(0, 0, w, h);
    var halfW = CW / 2 / cam.scale, halfH = CH / 2 / cam.scale, bx = mx(cam.x - halfW), bw = 2 * halfW / W * w;
    mapCtx.strokeStyle = 'rgba(45,58,74,0.5)';
    mapCtx.lineWidth = 1.5;
    [bx - w, bx, bx + w].forEach(function (x0) { mapCtx.strokeRect(x0, my(cam.y - halfH), bw, 2 * halfH / H * h); });
    mapCtx.strokeStyle = 'rgba(45,58,74,0.45)';
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    for (var mxp = 0; mxp <= w; mxp += 2) {
      var wx2 = mxp / w * W, yb = my(bedY(wx2));
      if (mxp === 0) mapCtx.moveTo(mxp, yb); else mapCtx.lineTo(mxp, yb);
    }
    mapCtx.stroke();
    mapCtx.fillStyle = '#ff7fb0';
    (run.anemones || []).forEach(function (a) { mapCtx.fillRect(mx(a.x) - 3, my(a.y) - 3, 6, 6); });   // v0.11: bigger dots on the mini map
    mapCtx.fillStyle = '#ff7a6b';
    run.npcs.forEach(function (o) {
      if (o.dead || o.pod || o.sp.kind === 'food') return;
      if (canHurt(o.sp) && o.size >= P * 1.1) {
        mapCtx.beginPath(); mapCtx.arc(mx(o.x), my(o.y), 4.5, 0, Math.PI * 2); mapCtx.fill();
      }
    });
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = OUT;
    mapCtx.beginPath(); mapCtx.arc(mx(run.x), my(run.y), 5.5, 0, Math.PI * 2); mapCtx.fill(); mapCtx.stroke();
  }
  function render(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var z = run ? run.info.zone : D.ZONES[0];
    drawBackground(z, t);
    if (!run) return;
    drawMinimap();

    ctx.save();
    ctx.translate(CW / 2, CH / 2);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.x, -cam.y);

    drawSurface();
    drawSeabed(run.info.zone);
    drawFlora(t);
    (run.anemones || []).forEach(function (a) { drawAnemone(viewX(a.x), a.y, t); });
    drawBirds();

    var list = run.npcs.slice();
    var playerVisible = !(run.inv > 0 && Math.floor(t * 10) % 2 === 0);
    if (playerVisible) {
      list.push({ x: run.x, y: run.y, vy: run.vy, facing: run.facing, size: run.size, desc: playerDesc(), isPlayer: true, hp: run.hp, maxHp: run.maxHp });
    }
    list.sort(function (a, b) { return a.size - b.size; });
    list = list.map(function (e) { return Object.assign({}, e, { x: viewX(e.x) }); });
    list.forEach(function (e) { drawEntity(e, t + (e.t || 0)); });

    list.forEach(function (e) {
      var shape = e.isPlayer ? e.desc.shape : e.sp.shape;
      var len = lenFor(e.size, shape);
      if (healthBarsOn() && (e.isPlayer || e.maxHp > 2)) drawHealthBar(e, len);   // v0.11: small fish that die in one bite get no bar
      if (e.ally && !e.isPlayer) {   // v0.11: a dashed teal ring marks your bought allies, apart from the school
        ctx.save(); ctx.strokeStyle = '#5fd0c0'; ctx.lineWidth = 2 / cam.scale; ctx.setLineDash([6 / cam.scale, 5 / cam.scale]);
        ctx.beginPath(); ctx.arc(e.x, e.y, len * 0.6, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      if (e.isPlayer || e.sp.kind === 'food' || e.sp.kind === 'harmless') return;
      // Readable at a glance: coral = can hurt you, mint = you can eat it.
      var danger = canHurt(e.sp) && e.size >= run.size * 1.1;
      var edible = !danger && run.size >= e.size * 1.15;
      if (!danger && !edible) return;
      ctx.fillStyle = danger ? '#ff7a6b' : '#7fd8a8';
      ctx.beginPath();
      ctx.arc(e.x, e.y - len * 0.65 - 22 / cam.scale, 4 / cam.scale, 0, Math.PI * 2);
      ctx.fill();
    });

    // Bite timer: a ring round you that fills up as your next bite comes ready.
    var ready = 1 - clamp(run.biteT / BITE_S, 0, 1);
    var plen = lenFor(run.size, playerDesc().shape);
    ctx.lineWidth = 3 / cam.scale;
    ctx.strokeStyle = 'rgba(45,58,74,0.25)';
    ctx.beginPath(); ctx.arc(viewX(run.x), run.y, plen * 0.75, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ready >= 1 ? '#8fe0b5' : '#ffb27a';
    ctx.beginPath(); ctx.arc(viewX(run.x), run.y, plen * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ready); ctx.stroke();

    list.forEach(function (n) {
      if (!n.locked) return;
      var rad = lenFor(n.size, n.sp.shape) * 0.75 + 6 / cam.scale;
      ctx.setLineDash([8 / cam.scale, 6 / cam.scale]);
      ctx.strokeStyle = '#ff7a6b';
      ctx.lineWidth = 3 / cam.scale;
      ctx.beginPath();
      ctx.arc(n.x, n.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // v0.12: a teal ring fills round a fish you are befriending. Full, it joins you (FRIEND_S seconds).
    list.forEach(function (n) {
      if (!(n.greetT > 0) || n.ally) return;
      var rad = lenFor(n.size, n.sp.shape) * 0.75 + 8 / cam.scale;
      ctx.strokeStyle = '#5fd0c0'; ctx.lineWidth = 3 / cam.scale;
      ctx.beginPath();
      ctx.arc(n.x, n.y, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(n.greetT / FRIEND_S, 0, 1));
      ctx.stroke();
    });

    run.parts.forEach(function (p) {
      var a = Math.max(0, p.life / p.max);
      if (p.txt) {
        ctx.globalAlpha = a;
        ctx.fillStyle = OUT;
        ctx.font = 'bold ' + (18 / cam.scale) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.txt, viewX(p.x), p.y);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(viewX(p.x), p.y, p.r / cam.scale * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
    ctx.restore();
  }

  function healthBarsOn() {
    try { return localStorage.getItem('fish_healthbars') !== 'off'; } catch (e) { return true; }
  }

  function drawHealthBar(e, len) {
    var w = Math.max(18, len * 0.9), h = 5 / cam.scale;
    var x = e.x - w / 2, y = e.y - len * 0.65 - 10 / cam.scale;
    ctx.lineWidth = 1.5 / cam.scale;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = OUT;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = e.isPlayer ? '#8fe0b5' : '#ff9a8a';
    ctx.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), h);
  }

  // v0.11: on screen, a fish grows 25% from level 1 to level 20, interpolated by level (not by size).
  // The view widens to hold that. The view never shows more than 80% of the sea's width, so the wrapped edges stay out
  // of view; the sea grows 16% a level (species.js) so that holds at level 20 on desktop and phones.
  var FISH_GROWTH = 0.25;
  function updateCamera(dt) {
    var r = run;
    var phone = Math.min(CW, CH) < 600 ? 2.5 : 1;   // phones: everything in play is 2.5x larger
    var ZOOM = 3;                                    // v0.11: the whole world is drawn 3x larger (was 4x: zoomed out 25%); the camera follows the fish
    var t = clamp((r.info.n - 1) / 19, 0, 1);        // 0 at level 1, 1 at level 20
    // At level 1 the view is 930 x 578 (900 + 10 x 3, 560 + 6 x 3, the start size); the scale there is the base.
    var base = Math.min(CW / 930, CH / 578) * phone * ZOOM;
    var want = base * lenFor(D.START_SIZE, 'round') / lenFor(r.size, 'round') * (1 + FISH_GROWTH * t);
    var least = CW * phone * ZOOM / (0.9 * r.info.W);   // the smallest scale that keeps the view inside 90% of the sea
    cam.scale = Math.max(want, least);
    var k = Math.min(1, dt * 4);
    cam.x = wrapX(cam.x + dxW(r.x, cam.x) * k);
    cam.y += (r.y - cam.y) * k;
  }

  // ---------- HUD, banner and overlays ----------
  function showBanner(title, sub, ms) {
    run.bannerT = ms / 1000;
    var el = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    el.hidden = false;
  }

  function hideBanner() { $('banner').hidden = true; }

  function updateHUD() {
    var r = run;
    if (!r) return;
    var span = Math.max(1, r.info.goal - r.info.enterSize);
    var pct = clamp((r.size - r.info.enterSize) / span, 0, 1);
    $('hud-level').textContent = 'Level ' + r.level + ' · ' + r.info.name;
    $('hud-zone').textContent = r.info.zone.name + ' · ' + D.DIFFICULTY[r.difficulty].label;
    $('size-fill').style.width = (pct * 100).toFixed(1) + '%';
    $('size-text').textContent = r.info.n >= 20
      ? 'Score ' + scoreOf(r) + ' · Size ' + r.size.toFixed(1)
      : 'Size ' + r.size.toFixed(1) + ' / ' + Math.round(r.goal);
    $('ally-cost').textContent = allyCost();
    $('attack-text').textContent = (r.cmdCd || 0) > 0 ? 'Ready in ' + Math.ceil(r.cmdCd) + 's' : 'Attack';
    $('hud-lives').textContent = '❤️'.repeat(r.lives) || '—';
    $('hud-time').textContent = mmss(r.t) + ' / 15:00';
    $('sprint').style.setProperty('--stam', Math.round(r.stamina) + '%');
    $('hp-fill').style.width = (clamp(r.hp / r.maxHp, 0, 1) * 100).toFixed(0) + '%';
    $('lock-pill').hidden = !(r.lockedCount > 0);
  }

  function showCard(title, text) {
    $('card-title').textContent = title;
    $('card-text').textContent = text;
    $('card').hidden = false;
    document.body.setAttribute('data-mode', 'over');
  }

  function hideCard() { $('card').hidden = true; }

  var DIFF_KEY = 'fish_difficulty';
  function getDifficulty() {
    try { var d = localStorage.getItem(DIFF_KEY); if (D.DIFFICULTY[d]) return d; } catch (e) { /* private mode */ }
    return 'medium';
  }
  function refreshDiff() {
    var cur = getDifficulty(), info = D.DIFFICULTY[cur];
    document.querySelectorAll('[data-diff]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-diff') === cur));
    });
    $('diff-ratio').textContent = info.label + ': ' + info.ratio + '. It gets harder after 2:30.';
  }

  function refreshControl() {
    $('control-toggle').textContent = control === 'joystick' ? 'Joystick' : 'Tap and move';
    $('control-toggle').setAttribute('aria-pressed', String(control === 'joystick'));
    $('joy').hidden = control !== 'joystick';
  }

  function showTitle() {
    mode = 'title';
    $('title-version').textContent = 'Fishes v' + CFG.VERSION + ' · ' + CFG.VERSION_DATE;
    $('panel-version').textContent = 'Fishes v' + CFG.VERSION + ' · ' + CFG.VERSION_DATE;
    run = null;
    paused = false;
    hideCard();
    hideBanner();
    $('lock-pill').hidden = true;
    $('title-best').textContent = best ? 'Best score: ' + best : 'No best score yet';
    $('title').hidden = false;
    $('panel').hidden = true;
    document.body.setAttribute('data-mode', 'title');
    refreshDbStatus();
    refreshDiff();
    refreshControl();
  }

  function startRun() {
    FishSound.unlock();
    FishSound.play('click');
    hideCard();
    $('title').hidden = true;
    run = {
      level: 1, info: D.levelInfo(1), t: 0, tension: 0,
      lives: CFG.LIVES, eaten: 0, size: D.START_SIZE,
      x: 0, y: 0, vx: 0, vy: 0, facing: 1,
      stamina: 100, sprintCd: 0, sprinting: false, inv: 2.5,
      npcs: [], parts: [], spawnT: 0, bannerT: 0, lockedCount: 0, score: 0,
      difficulty: getDifficulty(), form: D.leadOf(1), npcEaten: 0, hitBy: '', goal: D.levelInfo(1).goal, packSeq: 0,
      zoneFrom: null, zoneOld: null, bgT: 1,
      hp: playerMaxHp(D.START_SIZE), maxHp: playerMaxHp(D.START_SIZE), biteT: 0, quietT: 0, podSpawns: 0
    };
    run.x = run.info.W / 2;
    run.y = run.info.H / 2;
    run.anemones = makeAnemones(run.info);
    run.birds = makeBirds(run.info);
    run.flora = makeFlora(run.info);
    cam.x = run.x;
    cam.y = run.y;
    mode = 'play';
    paused = false;
    fillPopulations(true);
    showBanner('Level 1: ' + run.info.name, 'Swim with your finger. Eat plankton to grow.', 3200);
    document.body.setAttribute('data-mode', 'play');
    updateHUD();
  }

  // ---------- panel (⚙️) and notes ----------
  function openPanel() {
    $('panel').hidden = false;
    $('control-toggle').textContent = control === 'joystick' ? 'Joystick' : 'Tap and move';
    paused = true;
    $('sound-toggle').setAttribute('aria-pressed', String(FishSound.enabled()));
    $('sound-toggle').textContent = FishSound.enabled() ? 'On' : 'Off';
    $('errors-toggle').setAttribute('aria-pressed', String(showErrors));
    $('errors-toggle').textContent = showErrors ? 'On' : 'Off';
    $('hp-toggle').setAttribute('aria-pressed', String(healthBarsOn()));
    $('hp-toggle').textContent = healthBarsOn() ? 'On' : 'Off';
    $('dense-toggle').setAttribute('aria-pressed', String(denseOn()));
    $('dense-toggle').textContent = denseOn() ? 'On' : 'Off';
    $('trash-toggle').setAttribute('aria-pressed', String(trashOn()));
    $('trash-toggle').textContent = trashOn() ? 'On' : 'Off';
    $('bg-toggle').setAttribute('aria-pressed', String(bgOn()));
    $('bg-toggle').textContent = bgOn() ? 'On' : 'Off';
    refreshNotes();
    refreshDbStatus();
    refreshStatusBoard();
  }

  function closePanel() {
    $('panel').hidden = true;
    paused = false;
  }

  function refreshDbStatus() {
    var s = FishNotes.status();
    var labels = {
      off: 'Database: not connected',
      ready: 'Database: ready',
      saving: 'Database: saving…',
      saved: 'Database: saved',
      'sign-in needed': 'Database: sign in to send notes',
      failed: 'Database: failed'
    };
    var text = labels[s.state] || 'Database: ' + s.state;
    if (s.pending > 0 && s.state !== 'saved') {
      text = s.pending + (s.pending === 1 ? ' note' : ' notes') + ' on this device, not yet in the cloud. ' + (s.state === 'saving' ? 'Sending…' : 'Sign in to send them.');
    }
    var el = $('db-status');
    el.textContent = text;
    el.setAttribute('data-state', s.state);
    if (s.message) el.title = s.message;
    $('title-db').textContent = text;
    $('title-db').setAttribute('data-state', s.state);
  }

  // v0.11: family notes with a status you can change from the panel. Needs the family sign-in.
  var NOTE_STATUS = {
    start: { glyph: '◌', label: 'Start anew' },
    testing: { glyph: '🟡', label: 'Testing' },
    done: { glyph: '✅', label: 'Done' }
  };
  var NEXT_STATUS = { start: 'testing', testing: 'done', done: 'start' };
  // Hide done notes (this device only; the family table is not changed).
  function hideDoneOn() {
    try { return localStorage.getItem('fish_hide_done') === 'on'; } catch (e) { return false; }
  }
  function refreshStatusBoard() {
    var msg = $('status-msg'), box = $('status-list');
    if (!window.FishFamily || !window.FishNotes) return;
    var hideBtn = $('hide-done');
    hideBtn.setAttribute('aria-pressed', String(hideDoneOn()));
    hideBtn.textContent = 'Hide done notes: ' + (hideDoneOn() ? 'On' : 'Off');
    window.FishFamily.token().then(function (token) {
      box.innerHTML = '';
      if (!token) { msg.textContent = 'Sign in to see and change the status of notes.'; return; }
      msg.textContent = 'Loading notes…';
      return window.FishNotes.remoteList(token).then(function (rows) {
        var hidden = hideDoneOn() ? rows.filter(function (n) { return n.status === 'done'; }).length : 0;
        var shown = rows.filter(function (n) { return !(hideDoneOn() && n.status === 'done'); });
        if (!rows.length) msg.textContent = 'No notes in the family table yet.';
        else if (!shown.length) msg.textContent = 'All ' + rows.length + ' notes are done and hidden.';
        else msg.textContent = hidden ? hidden + ' done ' + (hidden === 1 ? 'note is' : 'notes are') + ' hidden.' : '';
        shown.forEach(function (n) { box.appendChild(statusRow(n)); });
      });
    }).catch(function (err) {
      msg.textContent = 'Could not load notes (' + (err && err.message || 'network') + ').';
    });
  }
  $('hide-done').addEventListener('click', function () {
    var on = !hideDoneOn();
    try { localStorage.setItem('fish_hide_done', on ? 'on' : 'off'); } catch (e) { /* private mode */ }
    refreshStatusBoard();
  });
  function statusRow(n) {
    var item = document.createElement('div');
    item.className = 'note-item';
    var meta = document.createElement('small');
    meta.textContent = 'Level ' + n.level + ' · size ' + Number(n.size).toFixed(1) + ' · ' + mmss(n.seconds || 0);
    var text = document.createElement('p');
    text.textContent = n.note;
    var btn = document.createElement('button');
    btn.className = 'status-btn';
    btn.setAttribute('data-status', n.status);
    btn.setAttribute('aria-label', 'Status: ' + NOTE_STATUS[n.status].label + '. Tap to change.');
    btn.textContent = NOTE_STATUS[n.status].glyph + ' ' + NOTE_STATUS[n.status].label;
    btn.addEventListener('click', function () {
      var next = NEXT_STATUS[n.status];
      btn.disabled = true;
      window.FishFamily.token().then(function (token) {
        if (!token) { $('status-msg').textContent = 'Sign in to change the status.'; btn.disabled = false; return; }
        return window.FishNotes.remoteSetStatus(token, n.id, next).then(function (ok) {
          if (!ok) { $('status-msg').textContent = 'Could not change the status. Try again.'; btn.disabled = false; return; }
          n.status = next;
          btn.setAttribute('data-status', next);
          btn.textContent = NOTE_STATUS[next].glyph + ' ' + NOTE_STATUS[next].label;
          btn.setAttribute('aria-label', 'Status: ' + NOTE_STATUS[next].label + '. Tap to change.');
          btn.disabled = false;
        });
      });
    });
    item.appendChild(meta);
    item.appendChild(text);
    item.appendChild(btn);
    return item;
  }

  function refreshNotes() {
    var list = FishNotes.list().slice(0, 5);
    var box = $('note-list');
    box.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No notes yet.';
      box.appendChild(empty);
      return;
    }
    list.forEach(function (n) {
      var item = document.createElement('div');
      item.className = 'note-item';
      var meta = document.createElement('small');
      meta.textContent = 'Level ' + n.level + ' · size ' + Number(n.size).toFixed(1) + ' · ' + mmss(n.seconds || 0);
      meta.textContent += n.sent ? ' · in the cloud' : ' · on this device only';
      var text = document.createElement('p');
      text.textContent = n.text;
      item.appendChild(meta);
      item.appendChild(text);
      box.appendChild(item);
    });
  }

  function saveNote() {
    var text = $('note-text').value;
    var status = $('note-status');
    var info = run ? { level: run.level, size: run.size, seconds: run.t } : { level: 0, size: 0, seconds: 0 };
    if (!FishNotes.clip(text)) { status.textContent = 'Write a note first.'; return; }
    status.textContent = 'Saving…';
    FishNotes.add(text, info).then(function (res) {
      if (res && res.ok) {
        $('note-text').value = '';
        status.textContent = res.sent
          ? 'Saved to the family database.'
          : 'Saved on this device. It will go to the cloud once you sign in.';
      } else {
        status.textContent = 'Not saved. Write a note first.';
      }
      refreshNotes();
      refreshDbStatus();
    });
  }

  // ---------- errors (bottom of the page, only when opted in) ----------
  function reportError(msg) {
    errorLog.push(String(msg));
    errorLog = errorLog.slice(-5);
    renderErrors();
  }

  function renderErrors() {
    var box = $('errors');
    if (!showErrors || !errorLog.length) { box.hidden = true; return; }
    box.hidden = false;
    box.textContent = errorLog.join('\n');
  }

  window.addEventListener('error', function (e) { reportError(e.message || 'Script error'); });
  window.addEventListener('unhandledrejection', function (e) {
    reportError(e.reason && e.reason.message ? e.reason.message : 'Unhandled promise error');
  });

  // ---------- input ----------
  canvas.addEventListener('pointerdown', function (ev) {
    FishSound.unlock();
    if (mode !== 'play' || paused) return;
    ptr.down = true;
    ptr.x = ev.clientX;
    ptr.y = ev.clientY;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* not supported */ }
    ev.preventDefault();
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (ptr.down) { ptr.x = ev.clientX; ptr.y = ev.clientY; }
  });
  function pointerUp() { ptr.down = false; }
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);

  var sprintBtn = $('sprint');
  sprintBtn.addEventListener('pointerdown', function (ev) {
    ev.preventDefault();
    FishSound.unlock();
    sprintHeld = true;
    try { sprintBtn.setPointerCapture(ev.pointerId); } catch (e) { /* not supported */ }
  });
  ['pointerup', 'pointercancel'].forEach(function (name) {
    sprintBtn.addEventListener(name, function () { sprintHeld = false; });
  });

  window.addEventListener('keydown', function (e) {
    var k = e.key;
    keys[k] = true;
    if (k === ' ' || k.indexOf('Arrow') === 0) e.preventDefault();
    if (k === 'Escape' && mode === 'play') { if ($('panel').hidden) openPanel(); else closePanel(); }
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });
  window.addEventListener('blur', function () { keys = {}; sprintHeld = false; ptr.down = false; });

  // Buttons
  $('btn-play').addEventListener('click', startRun);
  $('ally').addEventListener('click', buyAlly);
  $('attack').addEventListener('click', commandAllies);
  $('control-toggle').addEventListener('click', function () {
    control = control === 'tap' ? 'joystick' : 'tap';
    try { localStorage.setItem('fish_control', control); } catch (e) { /* private mode */ }
    refreshControl();
  });
  $('panel-end').addEventListener('click', function () { closePanel(); endRun('quit'); });
  document.querySelectorAll('[data-diff]').forEach(function (b) {
    b.addEventListener('click', function () {
      try { localStorage.setItem(DIFF_KEY, b.getAttribute('data-diff')); } catch (e) { /* private mode */ }
      refreshDiff();
    });
  });
  $('btn-howto').addEventListener('click', function () { $('howto').hidden = !$('howto').hidden; });
  $('card-again').addEventListener('click', startRun);
  $('card-title-btn').addEventListener('click', showTitle);
  $('card-note').addEventListener('click', function () { hideCard(); openPanel(); });
  $('gear').addEventListener('click', function () { if ($('panel').hidden) openPanel(); else closePanel(); });
  $('panel-close').addEventListener('click', closePanel);
  $('panel-title').addEventListener('click', function () { closePanel(); showTitle(); });
  $('sound-toggle').addEventListener('click', function () {
    var on = !FishSound.enabled();
    FishSound.setEnabled(on);
    $('sound-toggle').setAttribute('aria-pressed', String(on));
    $('sound-toggle').textContent = on ? 'On' : 'Off';
    if (on) FishSound.play('click');
  });
  $('errors-toggle').addEventListener('click', function () {
    showErrors = !showErrors;
    try { localStorage.setItem('fish_show_errors', showErrors ? 'on' : 'off'); } catch (e) { /* private mode */ }
    $('errors-toggle').setAttribute('aria-pressed', String(showErrors));
    $('errors-toggle').textContent = showErrors ? 'On' : 'Off';
    renderErrors();
  });
  $('note-save').addEventListener('click', saveNote);
  $('trash-toggle').addEventListener('click', function () {
    var on = !trashOn();
    try { localStorage.setItem('fish_trash', on ? 'on' : 'off'); } catch (e) { /* private mode */ }
    $('trash-toggle').setAttribute('aria-pressed', String(on));
    $('trash-toggle').textContent = on ? 'On' : 'Off';
    if (run && mode === 'play') fillCreatures();   // takes effect at once: off removes the trash
  });
  $('bg-toggle').addEventListener('click', function () {
    var on = !bgOn();
    try { localStorage.setItem('fish_bg', on ? 'on' : 'off'); } catch (e) { /* private mode */ }
    $('bg-toggle').setAttribute('aria-pressed', String(on));
    $('bg-toggle').textContent = on ? 'On' : 'Off';
    if (run && mode === 'play') fillCreatures();   // takes effect at once: off removes the background items, on brings them back
  });
  $('dense-toggle').addEventListener('click', function () {
    var on = !denseOn();
    try { localStorage.setItem('fish_dense', on ? 'on' : 'off'); } catch (e) { /* private mode */ }
    $('dense-toggle').setAttribute('aria-pressed', String(on));
    $('dense-toggle').textContent = on ? 'On' : 'Off';
  });
  $('hp-toggle').addEventListener('click', function () {
    var on = !healthBarsOn();
    try { localStorage.setItem('fish_healthbars', on ? 'on' : 'off'); } catch (e) { /* private mode */ }
    $('hp-toggle').setAttribute('aria-pressed', String(on));
    $('hp-toggle').textContent = on ? 'On' : 'Off';
  });

  $('family-in').addEventListener('click', function () {
    var email = $('family-email').value.trim(), pass = $('family-pass').value;
    var line = $('family-status');
    if (!email || !pass) { line.textContent = 'Enter the family email and password.'; return; }
    line.textContent = 'Signing in…';
    window.FishFamily.signIn(email, pass).then(function () {
      $('family-pass').value = '';
      line.textContent = 'Signed in. Notes now go to the family database.';
      refreshDbStatus();
    }).catch(function (err) {
      $('family-pass').value = '';
      line.textContent = err.message;
      reportError('Family sign-in: ' + err.message);
    });
  });
  $('family-out').addEventListener('click', function () {
    window.FishFamily.signOut();
    refreshDbStatus();
  });
  window.FishFamily.onChange(function (s) {
    $('family-status').textContent = s.signedIn ? 'Signed in as ' + s.email + '.' : 'Not signed in.';
    $('family-out').hidden = !s.signedIn;
    $('family-in').hidden = s.signedIn;
    if (s.signedIn) {
      FishNotes.sendPending().then(function () { refreshNotes(); refreshDbStatus(); refreshStatusBoard(); });
    }
  });

  window.addEventListener('resize', resize);

  // Joystick (bottom-left, when Controls is set to Joystick in ⚙️).
  var joyEl = $('joy'), knob = $('joy-knob');
  // Knob travel is a share of the stick's on-screen width (one third), so it scales with the stick.
  var joyMax = 1;
  function joyMove(ev) {
    var max = joyMax, x = ev.clientX - joy.cx, y = ev.clientY - joy.cy, d = Math.hypot(x, y);
    if (d > max) { x = x / d * max; y = y / d * max; }
    joy.dx = x / max; joy.dy = y / max;
    knob.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
  }
  joyEl.addEventListener('pointerdown', function (ev) {
    FishSound.unlock();
    joy.id = ev.pointerId;
    var b = joyEl.getBoundingClientRect();
    joy.cx = b.left + b.width / 2; joy.cy = b.top + b.height / 2;
    joyMax = b.width / 3;
    try { joyEl.setPointerCapture(ev.pointerId); } catch (e) { /* not supported */ }
    joyMove(ev);
    ev.preventDefault();
  });
  joyEl.addEventListener('pointermove', function (ev) { if (ev.pointerId === joy.id) joyMove(ev); });
  function joyEnd(ev) {
    if (ev.pointerId !== joy.id) return;
    joy.id = null; joy.dx = 0; joy.dy = 0;
    knob.style.transform = 'translate(0px, 0px)';
  }
  joyEl.addEventListener('pointerup', joyEnd);
  joyEl.addEventListener('pointercancel', joyEnd);

  // No pinch or double-tap zoom on this page: the whole screen has to stay in view.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (name) {
    document.addEventListener(name, function (e) { e.preventDefault(); }, { passive: false });
  });
  document.addEventListener('touchmove', function (e) { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });

  // ---------- main loop ----------
  var last = 0;
  function frame(ts) {
    var secs = ts / 1000;
    var dt = Math.min(0.05, last ? (ts - last) / 1000 : 0);
    last = ts;
    try {
      if (mode === 'play' && !paused && run) {
        update(dt);
        if (mode === 'play') updateCamera(dt);
        hudTimer -= dt;
        if (hudTimer <= 0 && mode === 'play') { hudTimer = 0.1; updateHUD(); }
      } else if (run && mode === 'play' && !paused) {
        updateCamera(dt);
      }
      render(secs);
    } catch (err) {
      reportError(err && err.message ? err.message : 'Game loop error');
    }
    requestAnimationFrame(frame);
  }

  resize();
  showTitle();
  requestAnimationFrame(frame);
  // Test hook (used by the headless checks): jump to a size and apply the level rules.
  // Test hook (v0.10): a fish of the given size placed beside you, to check fights. The last one is read back by state().
  var testFish = null, testCreature = null;
  window.FishGame = {
    resize: resize,
    // Test hook (v0.11): a creature of the given species id placed beside you. Read back through state().testCreature.
    debugSpawnCreature: function (id, size) {
      if (!run || mode !== 'play') return;
      var sp = SPECIES.filter(function (x) { return x.id === id; })[0];
      if (!sp) return;
      spawnNPC(sp, false);
      var f = run.npcs[run.npcs.length - 1];
      if (size) { f.size = size; f.hp = maxHpOf(size); f.maxHp = f.hp; }   // test hook: a fish of a chosen size
      f.x = run.x + 40; f.y = run.y; f.arrive = 0; f.anchor = { x: f.x, y: f.y };
      testCreature = f;
    },
    debugSpawnBeside: function (size) {
      if (!run || mode !== 'play') return;
      var f = { sp: { id: 'test', name: 'Test fish', tier: run.info.n, kind: 'hunter', temper: 'wary', shape: 'round', size: size, speed: 60, col: '#8a8a8a' },
        x: run.x + 40, y: run.y, vx: 0, vy: 0, size: size, spd: 1, facing: 1, t: 0, anchor: { x: run.x + 40, y: run.y }, tgt: null, tT: 0,
        cool: 0, lunge: 0, lx: 0, ly: 0, locked: false, lockT: 0, dead: false, hp: maxHpOf(size), maxHp: maxHpOf(size), biteT: 0, arrive: 0 };
      f.maxHp = f.hp;
      run.npcs.push(f);
      testFish = f;
    },
    // Test hooks. debugSetSize skips the calm, so a check can set any size; debugGrow goes through the calm rules.
    debugSetSize: function (s) { if (run && mode === 'play') { run.size = s; while (run && mode === 'play' && run.info.n < 20 && run.size >= run.goal) { run.calmT = 0; checkGrowth(); } } },
    debugGrow: function (s) { if (run && mode === 'play') { run.size = s; checkGrowth(); } },
    loopErrors: function () { return errorLog.slice(); },
    bedAt: function (x) { return run ? bedY(x) : null; },
    surfAt: function (x) { return run ? surfY(x) : null; },
    debugMove: function (x, y) { if (run && mode === 'play') { run.x = wrapX(x); run.y = y; cam.x = run.x; cam.y = y; } },
    // Test hooks (v0.10): kill every living ally, to check the price falls back; read the ally count and price.
    debugKillAllies: function () { if (run) run.npcs.forEach(function (o) { if (o.ally) o.dead = true; }); },
    // Test hook (v0.11): take health from every living ally, to check that they heal.
    debugHurtAllies: function (d) { if (run) run.npcs.forEach(function (o) { if (o.ally && !o.dead) o.hp = Math.max(0.1, o.hp - d); }); },
    state: function () {
      return {
        mode: mode, level: run && run.level, size: run && run.size, npcs: run ? run.npcs.length : 0,
        eaten: run ? run.eaten : 0, allySpent: run ? run.allySpent || 0 : 0,
        px: run ? run.x : null, py: run ? run.y : null, W: run ? run.info.W : null, hidden: run ? !!run.hidden : null,
        anemones: run && run.anemones ? run.anemones : null,
        belowBed: run ? Math.max.apply(null, [-9999].concat(run.npcs.filter(function (o) { return !o.dead; }).map(function (o) { return o.y - bedY(o.x); }))) : null,
        air: run ? !!run.air : null, flora: run && run.flora ? run.flora.filter(function (f) { return !f.forest; }).length : null,
        forests: run && run.flora ? run.flora.filter(function (f) { return f.forest; }).length : null,
        calm: run ? +(run.calmT || 0).toFixed(2) : null, bedNear: run ? Math.round(bedY(run.x)) : null,
        morphing: run ? run.npcs.filter(function (o) { return o.morph && !o.dead; }).length : null,
        allies: run ? run.npcs.filter(function (o) { return o.ally && !o.friend && !o.dead; }).length : 0,
        friends: run ? run.npcs.filter(function (o) { return o.friend && !o.dead; }).length : 0,
        followerMass: run ? +followerMass().toFixed(2) : null, followerLimit: run ? +(ALLY_LIMIT * run.size).toFixed(2) : null,
        allyCost: run ? run.npcs.filter(function (o) { return o.ally && !o.friend && !o.dead; }).length + 1 : null,
        locks: run ? run.lockedCount : 0, lives: run && run.lives,
        npcEaten: run && run.npcEaten, difficulty: run && run.difficulty, form: run && run.form && run.form.id,
        census: run ? census() : null, spread: run ? spread() : null,
        arriving: run ? run.npcs.filter(function (o) { return o.arrive > 0; }).length : 0,
        pods: run ? run.npcs.filter(function (o) { return o.pod && !o.dead; }).length : 0,
        nearestFood: run ? Math.round(Math.min.apply(null, [9999].concat(run.npcs.filter(function (o) { return o.sp.kind === 'food'; }).map(function (o) { return distXY(o.x, o.y, run.x, run.y); })))) : null, foods: run ? run.npcs.filter(function (o) { return o.sp.kind === 'food'; }).length : 0,
        chum: run ? run.npcs.filter(function (o) { return o.sp === CHUM; }).length : 0, hp: run && run.hp, maxHp: run && run.maxHp,
        player: run && { x: run.x, y: run.y }, cam: { x: cam.x, y: cam.y, scale: cam.scale },
        hunters: run ? run.npcs.filter(function (o) { return o.sp.kind === 'hunter'; }).map(function (o) { return { x: o.x, y: o.y, size: o.size, locked: o.locked }; }) : [],
        testFish: testFish ? { x: testFish.x, y: testFish.y, hp: testFish.hp, maxHp: testFish.maxHp, dead: !!testFish.dead } : null,
        allyHp: run ? run.npcs.filter(function (o) { return o.ally && !o.dead; }).reduce(function (a, o) { return a + o.hp; }, 0) : null,
        allyDist: run ? (function () { var d = null; run.npcs.forEach(function (o) { if (o.ally && !o.dead) { var v = distW(o, run); if (d === null || v < d) d = v; } }); return d === null ? null : Math.round(d); })() : null,
        goal: run ? run.goal : null, fedFish: run ? run.fedFish || 0 : null,
        command: run && run.cmd ? { t: run.cmd.t, target: !run.cmd.target.dead } : null,
        commandCooldown: run ? run.cmdCd || 0 : null,
        testCreature: testCreature ? { x: testCreature.x, y: testCreature.y, hp: testCreature.hp, dead: !!testCreature.dead,
          friend: !!testCreature.friend, greetT: testCreature.greetT || 0, size: testCreature.size } : null,
        birds: run && run.birds ? run.birds.length : null,
        creatures: run ? { trash: run.npcs.filter(function (o) { return !o.dead && o.sp.trash; }).length,
          turtle: run.npcs.filter(function (o) { return !o.dead && o.sp.id === 'turtle'; }).length,
          crab: run.npcs.filter(function (o) { return !o.dead && o.sp.id === 'crab'; }).length,
          moon: run.npcs.filter(function (o) { return !o.dead && o.sp.id === 'moon'; }).length,
          bg: run.npcs.filter(function (o) { return !o.dead && o.sp.bg; }).length,   // v0.12 background items (all kinds)
          clam: run.npcs.filter(function (o) { return !o.dead && o.sp.id === 'clam'; }).length,
          rock: run.npcs.filter(function (o) { return !o.dead && o.sp.id === 'rock'; }).length,
          boat: run.npcs.filter(function (o) { return !o.dead && o.sp.id === 'boat'; }).length,
          sub: run.npcs.filter(function (o) { return !o.dead && o.sp.id === 'sub'; }).length,
          urchin: run.npcs.filter(function (o) { return !o.dead && o.sp.id === 'urchin'; }).length,
          shrimp: run.npcs.filter(function (o) { return !o.dead && o.sp.id === 'shrimp'; }).length,
          squid: run.npcs.filter(function (o) { return !o.dead && o.sp.id === 'squid'; }).length,
          lionsmane: run.npcs.filter(function (o) { return !o.dead && o.sp.id === 'lionsmane'; }).length } : null
      };
    }
  };
})();
