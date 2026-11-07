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
  function makeFlora(info) {
    var count = Math.max(5, Math.round(info.W / 260)), list = [], i;
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
    var d = e.desc || e.sp, len = lenFor(e.size, d.shape), lw = 2.4 / cam.scale;
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
    else genericFish(len, d.hr || 0.5, d, t, lw);
    ctx.restore();
  }

  // ---------- levels and populations ----------
  // Sea anemones are the safe spots (v0.11): spread around the sea. A fish under one is not hunted there.
  var ANEMONE_R = 90;
  function makeAnemones(info) {
    var count = Math.max(4, Math.round(info.W / 420)), list = [], i;
    for (i = 0; i < count; i++) {
      var ax = ((((i + rand(-0.3, 0.3)) * info.W / count) % info.W) + info.W) % info.W;
      list.push({ x: ax, y: bedY(ax) - 10 });
    }
    return list;
  }

  function enterLevel(n) {
    var r = run;
    // Fish keep their places around you: remember each offset, then place them again on the new, larger sea.
    var offs = r.npcs.map(function (o) { return dxW(o.x, r.x); });
    r.info = D.levelInfo(n);
    r.level = n;
    r.goal = r.info.goal;
    r.x = r.info.W / 2;
    r.y = r.info.H / 2;
    r.npcs.forEach(function (o, i) { o.x = wrapX(r.x + offs[i]); o.anchor = { x: o.x, y: o.anchor.y }; });
    r.anemones = makeAnemones(r.info);
    r.flora = makeFlora(r.info);
    r.vx = 0;
    r.vy = 0;
    r.inv = 2.5;
    cam.x = r.x;
    cam.y = r.y;
    // The fish already around you stay. New species only appear far away, gradually (see fillPopulations).
    if (r.zoneFrom !== r.info.zone) { r.zoneOld = r.zoneFrom || r.info.zone; r.zoneFrom = r.info.zone; r.bgT = 0; }
    var lead = D.leadOf(n), evolved = !!r.form && r.form.id !== lead.id;
    r.form = lead;
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
  function liveAllies() { return run.npcs.filter(function (o) { return o.ally && !o.dead; }).length; }
  function allyCost() { return liveAllies() + 1; }
  function buyAlly() {
    if (!run || mode !== 'play' || paused) return;
    var cost = allyCost();
    if (run.size - cost < 1) { floatText(run.x, run.y, 'Need ' + cost + ' EXP'); return; }
    run.size -= cost;
    run.allySpent = (run.allySpent || 0) + cost;   // test hook: what buys have charged in total
    spawnPod(true);
    floatText(run.x, run.y, '-' + cost + ' EXP: ally');
    FishSound.play('eat');
  }

  // An ally's meal feeds you: half of what you would get from the same meal (v0.10).
  // Growth is checked after the NPC update, not here, so a level change cannot happen mid-loop.
  var ALLY_SHARE = 0.5;
  function allyCredit(meal) {
    var r = run, span = Math.max(0.5, r.goal - r.info.enterSize), gain;
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
    n.size = Math.max(0.5, r.size * 0.5);                      // the pod grows as you grow
    n.hp = Math.min(n.hp, maxHpOf(n.size)); n.maxHp = maxHpOf(n.size);
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
    var prey = big || away ? null : findNear(n, 220, function (o) { return !o.pod && o.sp.kind !== 'food' && fightPower(o) <= fightPower(n) && (!n.ally || nearYou(o)); });
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
    var fits = function (sp) {
      if (sp.kind === 'food') return false;
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

  function fillPopulations(initial) {
    var r = run, n = r.info.n, counts = {}, i;
    // Food first: plankton from tier 1, krill from tier 2.
    r.npcs.forEach(function (o) { if (!o.dead) counts[o.sp.id] = (counts[o.sp.id] || 0) + 1; });
    SPECIES.forEach(function (sp) {
      if (sp.kind !== 'food' || sp.tier > n) return;
      var target = Math.round(sp.base * (1 + 0.05 * (n - 1)));
      var add = Math.min(target - (counts[sp.id] || 0), initial ? target : 4);
      for (i = 0; i < add; i++) spawnNPC(sp, initial);
    });
    // Fish: a tier-sized population, split into threats and edible fish by the ratio.
    var c = census();
    var need = Math.round(22 + 3 * n) - c.fish;
    var budget = initial ? 999 : 2;
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
    var sp = speedFor(r.size) * (sprint ? 2.1 : 1);
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
    var r = run, best = null, bd = 240;
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
    var speed = sp.speed * n.spd * (1 + 0.03 * (r.info.n - 1));
    var tx = null, ty = null, s = 0, k = 2.5;

    if (sp.kind === 'food') {
      var fw = wander(n, 300);
      tx = fw.x; ty = fw.y; s = speed * 0.5;
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
    n.vx += (dvx - n.vx) * Math.min(1, dt * k);
    n.vy += (dvy - n.vy) * Math.min(1, dt * k);
    n.x = wrapX(n.x + n.vx * dt + currentAt(n.y) * dt);
    n.y = clamp(n.y + n.vy * dt, 20, bedY(n.x) - 10);
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

  function checkGrowth() {
    while (run && mode === 'play' && run.size >= run.goal) {
      if (run.info.n >= 20) {
        // Endless (v0.9): no win and no time cap after level 20. The goal keeps rising, and the score goes up.
        run.goal = run.goal * 1.25;
        FishSound.play('levelup');
        showBanner('Endless', 'Next goal: size ' + run.goal.toFixed(0), 2500);
        continue;
      }
      FishSound.play('levelup');
      enterLevel(run.info.n + 1);
    }
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
      var span = Math.max(0.5, r.goal - r.info.enterSize);
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
    // v0.10: a fight with a fish of any size. Each side bites on its own timer, for its attack value.
    // Hidden under an anemone, the fish cannot bite you; you can still bite it.
    if (canBite(sp) && !r.hidden && n.biteT <= 0) {
      n.biteT = STRIKE_S;
      hurt(n, atkOf(n.size));
      if (mode !== 'play' || run !== r) return;   // you may have lost a life (the fish is then reset)
    }
    if (r.biteT <= 0) {
      r.biteT = BITE_S;
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
    if (r.t >= CFG.TIME_LIMIT && r.info.n < 20) { endRun('time'); return; }   // endless after level 20: no time cap

    updatePlayer(dt);

    updatePods();
    r.spawnT = (r.spawnT || 0) - dt;
    if (r.spawnT <= 0) { r.spawnT = 1.2; fillPopulations(false); }

    var predators = r.npcs.filter(function (o) {
      return !o.dead && (o.sp.kind === 'hunter' || o.sp.kind === 'ambush');
    });
    var i;
    for (i = 0; i < r.npcs.length; i++) {
      if (!r.npcs[i].dead) updateNPC(r.npcs[i], dt, predators);
    }
    if (r.growPending) { r.growPending = false; checkGrowth(); }   // ally meals add to your size (v0.10)

    // Fights between fish (v0.10): any fish bites any fish it touches, except food and its own species.
    // Each bite takes off the attacker's attack value; a fish is out when its health reaches zero.
    // An ally's kill feeds you (half a meal), and an ally that is killed counts as lost, not eaten.
    for (i = 0; i < r.npcs.length; i++) {
      var eater = r.npcs[i];
      if (eater.dead || eater.biteT > 0 || !canBite(eater.sp)) continue;
      for (var j = 0; j < r.npcs.length; j++) {
        var meal = r.npcs[j];
        if (meal === eater || meal.dead || meal.sp.kind === 'food' || meal.sp === eater.sp) continue;
        var md = distW(eater, meal);
        if (md < (lenFor(eater.size, eater.sp.shape) + lenFor(meal.size, meal.sp.shape)) * 0.36) {
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
    var W = run.info.W, H = run.info.H, w = mapCanvas.width, h = mapCanvas.height, P = run.size;
    var mx = function (x) { return ((x % W) + W) % W / W * w; };
    var my = function (y) { return clamp(y / H, 0, 1) * h; };
    mapCtx.clearRect(0, 0, w, h);
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
    (run.anemones || []).forEach(function (a) { mapCtx.fillRect(mx(a.x) - 2, my(a.y) - 2, 4, 4); });
    mapCtx.fillStyle = '#ff7a6b';
    run.npcs.forEach(function (o) {
      if (o.dead || o.pod || o.sp.kind === 'food') return;
      if (canHurt(o.sp) && o.size >= P * 1.1) {
        mapCtx.beginPath(); mapCtx.arc(mx(o.x), my(o.y), 2.5, 0, Math.PI * 2); mapCtx.fill();
      }
    });
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = OUT;
    mapCtx.beginPath(); mapCtx.arc(mx(run.x), my(run.y), 3.5, 0, Math.PI * 2); mapCtx.fill(); mapCtx.stroke();
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
      if (healthBarsOn() && e.maxHp > 1) drawHealthBar(e, len);
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

  function updateCamera(dt) {
    var r = run;
    var phone = Math.min(CW, CH) < 600 ? 2.5 : 1;   // phones: everything in play is 2.5x larger
    var ZOOM = 4;                                    // v0.10: the whole world is drawn 4x larger; the camera follows the fish
    var viewW = 900 + r.size * 10, viewH = 560 + r.size * 6;
    cam.scale = Math.min(CW / viewW, CH / viewH) * phone * ZOOM;
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
    var span = Math.max(1, r.goal - r.info.enterSize);
    var pct = clamp((r.size - r.info.enterSize) / span, 0, 1);
    $('hud-level').textContent = 'Level ' + r.level + ' · ' + r.info.name;
    $('hud-zone').textContent = r.info.zone.name + ' · ' + D.DIFFICULTY[r.difficulty].label;
    $('size-fill').style.width = (pct * 100).toFixed(1) + '%';
    $('size-text').textContent = r.info.n >= 20
      ? 'Score ' + scoreOf(r) + ' · Size ' + r.size.toFixed(1)
      : 'Size ' + r.size.toFixed(1) + ' / ' + Math.round(r.goal);
    $('ally-cost').textContent = allyCost();
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
      difficulty: getDifficulty(), form: D.leadOf(1), npcEaten: 0, hitBy: '', goal: 2, packSeq: 0,
      zoneFrom: null, zoneOld: null, bgT: 1,
      hp: playerMaxHp(D.START_SIZE), maxHp: playerMaxHp(D.START_SIZE), biteT: 0, quietT: 0, podSpawns: 0
    };
    run.x = run.info.W / 2;
    run.y = run.info.H / 2;
    run.anemones = makeAnemones(run.info);
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
    refreshNotes();
    refreshDbStatus();
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
      FishNotes.sendPending().then(function () { refreshNotes(); refreshDbStatus(); });
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
  var testFish = null;
  window.FishGame = {
    resize: resize,
    debugSpawnBeside: function (size) {
      if (!run || mode !== 'play') return;
      var f = { sp: { id: 'test', name: 'Test fish', tier: run.info.n, kind: 'hunter', temper: 'wary', shape: 'round', size: size, speed: 60, col: '#8a8a8a' },
        x: run.x + 40, y: run.y, vx: 0, vy: 0, size: size, spd: 1, facing: 1, t: 0, anchor: { x: run.x + 40, y: run.y }, tgt: null, tT: 0,
        cool: 0, lunge: 0, lx: 0, ly: 0, locked: false, lockT: 0, dead: false, hp: maxHpOf(size), maxHp: maxHpOf(size), biteT: 0, arrive: 0 };
      f.maxHp = f.hp;
      run.npcs.push(f);
      testFish = f;
    },
    debugSetSize: function (s) { if (run && mode === 'play') { run.size = s; checkGrowth(); } },
    loopErrors: function () { return errorLog.slice(); },
    bedAt: function (x) { return run ? bedY(x) : null; },
    surfAt: function (x) { return run ? surfY(x) : null; },
    debugMove: function (x, y) { if (run && mode === 'play') { run.x = wrapX(x); run.y = y; cam.x = run.x; cam.y = y; } },
    // Test hooks (v0.10): kill every living ally, to check the price falls back; read the ally count and price.
    debugKillAllies: function () { if (run) run.npcs.forEach(function (o) { if (o.ally) o.dead = true; }); },
    state: function () {
      return {
        mode: mode, level: run && run.level, size: run && run.size, npcs: run ? run.npcs.length : 0,
        eaten: run ? run.eaten : 0, allySpent: run ? run.allySpent || 0 : 0,
        px: run ? run.x : null, py: run ? run.y : null, W: run ? run.info.W : null, hidden: run ? !!run.hidden : null,
        anemones: run && run.anemones ? run.anemones : null,
        belowBed: run ? Math.max.apply(null, [-9999].concat(run.npcs.filter(function (o) { return !o.dead; }).map(function (o) { return o.y - bedY(o.x); }))) : null,
        air: run ? !!run.air : null, flora: run && run.flora ? run.flora.length : null, bedNear: run ? Math.round(bedY(run.x)) : null,
        allies: run ? run.npcs.filter(function (o) { return o.ally && !o.dead; }).length : 0,
        allyCost: run ? run.npcs.filter(function (o) { return o.ally && !o.dead; }).length + 1 : null,
        locks: run ? run.lockedCount : 0, lives: run && run.lives,
        npcEaten: run && run.npcEaten, difficulty: run && run.difficulty, form: run && run.form && run.form.id,
        census: run ? census() : null, spread: run ? spread() : null,
        arriving: run ? run.npcs.filter(function (o) { return o.arrive > 0; }).length : 0,
        pods: run ? run.npcs.filter(function (o) { return o.pod && !o.dead; }).length : 0,
        nearestFood: run ? Math.round(Math.min.apply(null, [9999].concat(run.npcs.filter(function (o) { return o.sp.kind === 'food'; }).map(function (o) { return distXY(o.x, o.y, run.x, run.y); })))) : null, foods: run ? run.npcs.filter(function (o) { return o.sp.kind === 'food'; }).length : 0,
        chum: run ? run.npcs.filter(function (o) { return o.sp === CHUM; }).length : 0, hp: run && run.hp, maxHp: run && run.maxHp,
        player: run && { x: run.x, y: run.y }, cam: { x: cam.x, y: cam.y, scale: cam.scale },
        hunters: run ? run.npcs.filter(function (o) { return o.sp.kind === 'hunter'; }).map(function (o) { return { x: o.x, y: o.y, size: o.size, locked: o.locked }; }) : [],
        testFish: testFish ? { x: testFish.x, y: testFish.y, hp: testFish.hp, maxHp: testFish.maxHp, dead: !!testFish.dead } : null
      };
    }
  };
})();
