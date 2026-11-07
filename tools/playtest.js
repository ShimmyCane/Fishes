#!/usr/bin/env node
// Fishes playtest: headless checks against the real game, served from this folder.
//
//   node tools/playtest.js            run every check
//   node tools/playtest.js layout     button and joystick overlap at six screen sizes
//   node tools/playtest.js allies     ally price rises with each buy and falls back when allies die
//   node tools/playtest.js smoke [s]  play for s seconds (default 20) and report page errors
//
// Needs Playwright. In this environment it is preinstalled; the script looks in the global
// npm root and uses the pinned Chromium at /opt/pw-browsers/chromium when present.
// Exit code 1 if any check fails, so it can gate a PR.

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through to the global install */ }
  const global = execSync('npm root -g').toString().trim();
  return require(path.join(global, 'playwright'));
}

// A tiny static server for the repo folder, so cookies and fetches behave as on a real host.
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  return new Promise(function (resolve) {
    const srv = http.createServer(function (req, res) {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) || 'index.html');
      const file = p.endsWith('/') ? path.join(p, 'index.html') : p;
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', function () { resolve({ srv: srv, url: 'http://127.0.0.1:' + srv.address().port + '/index.html' }); });
  });
}

async function launch(chromium) {
  const exe = '/opt/pw-browsers/chromium';
  return chromium.launch(Object.assign({ args: ['--no-sandbox'] }, fs.existsSync(exe) ? { executablePath: exe } : {}));
}

// Open the page, optionally in joystick mode, and start a run.
async function startRun(browser, url, size, w, h, control) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  if (control) await page.addInitScript(function (c) { localStorage.setItem('fish_control', c); }, control);
  await page.goto(url);
  await page.click('#btn-play');
  await page.waitForTimeout(500);
  if (size) await page.evaluate(function (s) { window.FishGame.debugSetSize(s); }, size);
  return { page: page, errors: errors };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
}

async function layout(browser, url) {
  const sizes = [[1024, 768], [768, 1024], [390, 844], [844, 390], [667, 375], [1366, 1024]];
  for (const [w, h] of sizes) {
    const ctx = await startRun(browser, url, 0, w, h, 'joystick');
    const rects = await ctx.page.evaluate(function () {
      return ['joy', 'ally', 'attack', 'sprint', 'gear', 'hud'].map(function (id) {
        const e = id === 'hud' ? document.querySelector('.hud') : document.getElementById(id);
        const b = e.getBoundingClientRect();
        return { id: id, l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width };
      });
    });
    const hits = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], c = rects[j];
      if (!a.w || !c.w) continue;   // hidden (ally on the title screen, joystick in tap mode)
      if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) hits.push(a.id + '/' + c.id);
    }
    check('layout ' + w + 'x' + h, hits.length === 0, hits.length ? 'overlaps: ' + hits.join(', ') : '');
    await ctx.page.close();
  }
}

// Predators can eat a new ally at once, so the rules are checked as invariants, not as a fixed sequence:
// the price always equals living allies + 1, and each buy charges the price shown just before it.
async function allies(browser, url) {
  const ctx = await startRun(browser, url, 70, 1024, 768);   // level 6, so there is EXP to spend
  const p = ctx.page;
  const read = function () { return p.evaluate(function () { return window.FishGame.state(); }); };
  let ok = true, detail = [];
  let buys = 0;
  for (let tries = 0; buys < 3 && tries < 12; tries++) {
    const before = await read();
    await p.click('#ally');
    await p.waitForTimeout(60);
    const after = await read();
    // Size also moves from meals and ally shares, so the charge is read from the spend counter, not from size.
    const charged = after.allySpent - before.allySpent;
    if (charged === 0 && after.allies === before.allies) continue;   // no buy happened (too little EXP)
    buys++;
    if (Math.abs(charged - before.allyCost) > 0.01) ok = false;
    if (after.allyCost !== after.allies + 1) ok = false;
    detail.push('charged ' + charged.toFixed(1) + ' at price ' + before.allyCost + ', now ' + after.allyCost + ' with ' + after.allies + ' alive');
  }
  if (buys < 1) ok = false;   // allies die fast in a busy sea, so one purchase is enough to check the price rule
  check('ally price = living allies + 1, and each buy charges it', ok, detail.join('; '));

  const alive = await read();
  if (alive.allies > 0) {
    await p.evaluate(function () { window.FishGame.debugKillAllies(); });
    await p.waitForTimeout(100);
    const dead = await read();
    check('ally price falls back when allies die', dead.allyCost === 1 && dead.allies === 0,
      'allies=' + dead.allies + ' price=' + dead.allyCost);
  } else {
    console.log('SKIP ally death check: no ally survived long enough to test (predators nearby). Re-run.');
  }
  check('no page errors (allies)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// Fights (v0.10): any fish can fight any fish. A bigger fish beside you takes your bite, and bites back.
async function fights(browser, url) {
  const ctx = await startRun(browser, url, 12, 1024, 768);
  const p = ctx.page;
  await p.waitForTimeout(3000);   // you start with 2.5 s of invulnerability; wait it out so the fish's bites count
  const before = await p.evaluate(function () { return window.FishGame.state(); });
  await p.evaluate(function () { window.FishGame.debugSpawnBeside(20); });   // bigger than you (size 12)
  // The current carries you off, so keep you beside the test fish for a few seconds.
  for (let i = 0; i < 16; i++) {
    await p.evaluate(function () {
      const s = window.FishGame.state();
      if (s.testFish && !s.testFish.dead) window.FishGame.debugMove(s.testFish.x - 30, s.testFish.y);
    });
    await p.waitForTimeout(250);
  }
  const after = await p.evaluate(function () { return window.FishGame.state(); });
  const tf = after.testFish;
  const youHit = !!tf && (tf.dead || tf.hp < tf.maxHp);   // you bit it
  const itHit = after.hp < before.hp;                      // it bit you back
  check('a bigger fish takes your bites and bites back', youHit && itHit,
    'its hp ' + (tf ? tf.hp + '/' + tf.maxHp : 'n/a') + ', your hp ' + before.hp.toFixed(1) + ' -> ' + after.hp.toFixed(1));
  check('no page errors (fights)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// Camera (v0.11): on screen, a fish grows 25% from level 1 to level 20, interpolated by level.
async function camera(browser, url) {
  const ctx = await startRun(browser, url, 0, 1024, 768);
  const p = ctx.page;
  const read = function () { return p.evaluate(function () { return window.FishGame.state(); }); };
  await p.waitForTimeout(300);
  const first = await read();
  await p.evaluate(function () { window.FishGame.debugSetSize(400); });   // past the level-20 goal (300)
  await p.waitForTimeout(600);
  const last = await read();
  // On-screen fish length in pixels: the sprite length (22 + 5 x size, as lenFor in game.js) times the camera scale.
  const onScreen = function (s) { return (22 + 5 * s.size) * s.cam.scale; };
  const ratio = onScreen(last) / onScreen(first);
  check('the sea is at least 3200 wide at level 1', first.W >= 3200, 'W=' + first.W);
  check('fish looks 25% bigger by level 20 (interpolated), not more',
    last.level === 20 && Math.abs(ratio - 1.25) < 0.02,
    'level ' + first.level + '->' + last.level + ', size ' + first.size.toFixed(1) + '->' + last.size.toFixed(0) +
    ', on screen ' + onScreen(first).toFixed(0) + 'px->' + onScreen(last).toFixed(0) + 'px (x' + ratio.toFixed(3) + ')');
  // Halfway through the levels the growth is interpolated, not stepped. A fresh game, since levels only go up.
  const mctx = await startRun(browser, url, 0, 1024, 768);
  await mctx.page.waitForTimeout(300);
  const start = await mctx.page.evaluate(function () { return window.FishGame.state(); });
  await mctx.page.evaluate(function () { window.FishGame.debugSetSize(60); });   // level 10: 9/19 of the way
  await mctx.page.waitForTimeout(600);
  const mid = await mctx.page.evaluate(function () { return window.FishGame.state(); });
  await mctx.page.close();
  const expectMid = 1 + 0.25 * (mid.level - 1) / 19;
  const midRatio = onScreen(mid) / onScreen(start);
  check('growth is interpolated between levels 1 and 20', mid.level > 1 && mid.level < 20 && Math.abs(midRatio - expectMid) < 0.02,
    'level ' + mid.level + ': x' + midRatio.toFixed(3) + ', expected x' + expectMid.toFixed(3));
  check('no page errors (camera)', ctx.errors.length === 0 && mctx.errors.length === 0, ctx.errors.concat(mctx.errors).join(' | '));
  await p.close();
}

// Density (v0.11): the bigger sea keeps the fish as dense as before by default, and the setting turns that off.
async function density(browser, url) {
  const fishAt = async function (dense) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errors = [];
    page.on('pageerror', function (e) { errors.push(e.message); });
    if (dense === 'off') await page.addInitScript(function () { localStorage.setItem('fish_dense', 'off'); });
    await page.goto(url);
    await page.click('#btn-play');
    await page.waitForTimeout(500);
    const ctx = { page: page, errors: errors };
    await ctx.page.evaluate(function () { window.FishGame.debugSetSize(3); });
    await ctx.page.waitForTimeout(1500);
    const st = await ctx.page.evaluate(function () { return window.FishGame.state(); });
    await ctx.page.close();
    return { fish: st.census.fish, errors: ctx.errors };
  };
  const on = await fishAt('on'), off = await fishAt('off');
  check('denser sea is on by default: about four times the fish at level 1', on.fish >= 80, 'fish with denser sea on=' + on.fish + ', off=' + off.fish);
  check('turning denser sea off gives the sparse count', off.fish <= 40 && off.fish >= 10, 'fish with it off=' + off.fish);
  check('no page errors (density)', on.errors.length === 0 && off.errors.length === 0, on.errors.concat(off.errors).join(' | '));
}

// Creatures (v0.11): turtles, crabs, jellyfish and gulls live in the sea. Jellyfish sting, crabs stay on the bed.
async function creatures(browser, url) {
  const ctx = await startRun(browser, url, 0, 1024, 768);
  const p = ctx.page;
  // Creatures respawn when they are eaten, so poll for a few seconds rather than read once.
  let st = null;
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(500);
    st = await p.evaluate(function () { return window.FishGame.state(); });
    if (st.creatures.turtle >= 1 && st.creatures.crab >= 1 && st.birds >= 1) break;
  }
  check('turtles, crabs and gulls are in the sea at level 1',
    st.creatures.turtle >= 1 && st.creatures.crab >= 1 && st.birds >= 1,
    'turtles=' + st.creatures.turtle + ' crabs=' + st.creatures.crab + ' gulls=' + st.birds);

  // A jellyfish stings you when you touch it, and you cannot eat it. Keep it beside you, after the start invulnerability.
  await p.waitForTimeout(2500);
  const before = await p.evaluate(function () { return window.FishGame.state(); });
  await p.evaluate(function () { window.FishGame.debugSpawnCreature('moon'); });
  for (let i = 0; i < 12; i++) {
    await p.evaluate(function () {
      const s = window.FishGame.state();
      if (s.testCreature && !s.testCreature.dead) window.FishGame.debugMove(s.testCreature.x - 30, s.testCreature.y);
    });
    await p.waitForTimeout(250);
  }
  const jelly = await p.evaluate(function () { return window.FishGame.state(); });
  check('a jellyfish stings you and cannot be eaten',
    jelly.hp < before.hp && jelly.testCreature && !jelly.testCreature.dead,
    'your hp ' + before.hp.toFixed(1) + ' -> ' + jelly.hp.toFixed(1) + ', jellyfish dead=' + (jelly.testCreature && jelly.testCreature.dead));

  // A crab walks the seabed: it sits just above the bed wherever it goes.
  await p.evaluate(function () { window.FishGame.debugSpawnCreature('crab'); });
  await p.waitForTimeout(2000);
  const crab = await p.evaluate(function () {
    const s = window.FishGame.state();
    return { x: s.testCreature.x, y: s.testCreature.y, bed: window.FishGame.bedAt(s.testCreature.x) };
  });
  check('a crab stays on the seabed', Math.abs(crab.y - (crab.bed - 12)) < 1,
    'crab y=' + crab.y.toFixed(1) + ', bed at its x=' + crab.bed.toFixed(1));
  // Jellyfish come in from level 3.
  await p.evaluate(function () { window.FishGame.debugSetSize(25); });   // level 3 (starts at 21)
  await p.waitForTimeout(2500);
  const l3 = await p.evaluate(function () { return window.FishGame.state(); });
  check('jellyfish are in the sea from level 3', l3.level >= 3 && l3.creatures.moon >= 1,
    'level ' + l3.level + ', jellyfish=' + l3.creatures.moon);
  check('no page errors (creatures)', ctx.errors.length === 0, ctx.errors.join(' | '));

  await p.close();
}

// Life in the sea (v0.11): enough anemones and kelp that the view always has some, at every level.
async function life(browser, url) {
  const ctx = await startRun(browser, url, 0, 1024, 768);
  const p = ctx.page;
  await p.waitForTimeout(300);
  const st = await p.evaluate(function () { return window.FishGame.state(); });
  const anemones = (st.anemones || []).length, flora = st.flora || 0;
  check('anemones spaced about every 210 units across the sea', anemones >= Math.floor(st.W / 210) && anemones <= Math.ceil(st.W / 210) + 1,
    'anemones=' + anemones + ' for W=' + st.W);
  check('kelp patches spaced about every 130 units across the sea', flora >= Math.floor(st.W / 130) && flora <= Math.ceil(st.W / 130) + 1,
    'kelp=' + flora + ' for W=' + st.W);
  check('no page errors (life)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// Pacing, allies and predation (v0.11).
async function pacing(browser, url) {
  const ctx = await startRun(browser, url, 0, 1024, 768);
  const p = ctx.page;
  await p.waitForTimeout(300);
  const st = await p.evaluate(function () { return window.FishGame.state(); });
  check('levels 1 to 5 need three times the growth (level 1 goal is 12)', Math.abs(st.goal - 12) < 0.01, 'goal=' + st.goal);

  // Allies heal after a pause from being hurt, and Attack sends them at your target. Allies can be killed at once
  // in a busy sea, and a fight keeps them from resting, so each check buys an ally and tries up to three times.
  let healRises = 0, healDetail = '';
  for (let attempt = 0; attempt < 3 && healRises < 1; attempt++) {
    await p.evaluate(function () { window.FishGame.debugSetSize(70); });   // level 6 (starts at 57)
    await p.waitForTimeout(200);
    await p.click('#ally');
    await p.waitForTimeout(200);
    if ((await p.evaluate(function () { return window.FishGame.state().allies; })) === 0) continue;
    await p.evaluate(function () { window.FishGame.debugHurtAllies(3); });
    // Sample the allies' health for 8 seconds. Predators may still bite them, so look for steps where health rose.
    const samples = [];
    for (let i = 0; i < 16; i++) {
      await p.waitForTimeout(500);
      samples.push(await p.evaluate(function () { return window.FishGame.state().allyHp; }));
    }
    healRises = samples.slice(1).filter(function (v, i) { return v > samples[i] + 0.05; }).length;
    healDetail = 'ally hp samples ' + samples.map(function (v) { return v.toFixed(1); }).join(' ');
  }
  if (healRises === 0 && !healDetail) console.log('SKIP ally heal check: no ally survived to be tested. Re-run.');
  else check('allies heal after a pause from being hurt', healRises >= 1, healDetail);

  let atkOk = false, atkDetail = '', atkTried = false;
  for (let attempt = 0; attempt < 3 && !atkOk; attempt++) {
    await p.evaluate(function () { window.FishGame.debugSetSize(70); });
    await p.waitForTimeout(200);
    await p.click('#ally');
    await p.waitForTimeout(200);
    if ((await p.evaluate(function () { return window.FishGame.state().allies; })) === 0) continue;
    atkTried = true;
    // A fish bigger than your ally: a small one dies at once, and allies would run from a bigger one unless commanded.
    await p.evaluate(function () { window.FishGame.debugSpawnBeside(40); });
    await p.click('#attack');
    await p.waitForTimeout(150);
    const atk = await p.evaluate(function () { return window.FishGame.state(); });
    await p.click('#attack');
    await p.waitForTimeout(150);
    const again = await p.evaluate(function () { return window.FishGame.state(); });
    atkOk = !!atk.command && atk.commandCooldown > 0 && again.commandCooldown > 0;
    atkDetail = 'command=' + JSON.stringify(atk.command) + ' cooldown=' + atk.commandCooldown.toFixed(1);
  }
  if (!atkTried) console.log('SKIP Attack check: no ally survived to command. Re-run.');
  else check('Attack sends allies at your target, then waits 20 seconds', atkOk, atkDetail);
  check('no page errors (pacing)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();

  // Small fish eat plankton: at level 3 and above, fish eat the plankton they touch.
  const fctx = await startRun(browser, url, 14, 1024, 768);
  await fctx.page.waitForTimeout(12000);
  const fed = await fctx.page.evaluate(function () { return window.FishGame.state(); });
  check('fish eat plankton they touch', fed.fedFish > 0, 'fish meals on plankton in 12 s at level ' + fed.level + ': ' + fed.fedFish);
  check('no page errors (feeding)', fctx.errors.length === 0, fctx.errors.join(' | '));
  await fctx.page.close();
}

async function smoke(browser, url, seconds) {
  const ctx = await startRun(browser, url, 12, 1024, 768, 'joystick');
  for (let i = 0; i < 3; i++) { await ctx.page.click('#ally'); await ctx.page.waitForTimeout(100); }
  await ctx.page.waitForTimeout(seconds * 1000);
  const st = await ctx.page.evaluate(function () { return window.FishGame.state(); });
  console.log('      after ' + seconds + 's: mode=' + st.mode + ' level=' + st.level + ' size=' + (st.size || 0).toFixed(2) +
    ' allies=' + st.allies + ' eaten=' + st.npcEaten);
  check('smoke: no page errors', ctx.errors.length === 0, ctx.errors.join(' | '));
  await ctx.page.close();
}

(async function main() {
  const which = process.argv[2] || 'all';
  const secs = Number(process.argv[3]) || 20;
  const { chromium } = loadPlaywright();
  const { srv, url } = await serve();
  const browser = await launch(chromium);
  try {
    if (which === 'all' || which === 'layout') await layout(browser, url);
    if (which === 'all' || which === 'allies') await allies(browser, url);
    if (which === 'all' || which === 'fights') await fights(browser, url);
    if (which === 'all' || which === 'camera') await camera(browser, url);
    if (which === 'all' || which === 'density') await density(browser, url);
    if (which === 'all' || which === 'creatures') await creatures(browser, url);
    if (which === 'all' || which === 'life') await life(browser, url);
    if (which === 'all' || which === 'pacing') await pacing(browser, url);
    if (which === 'all' || which === 'smoke') await smoke(browser, url, which === 'smoke' ? secs : 10);
    if (!['all', 'layout', 'allies', 'fights', 'camera', 'density', 'life', 'creatures', 'pacing', 'smoke'].includes(which)) { console.log('unknown check: ' + which); process.exitCode = 2; }
  } catch (e) {
    check('harness error', false, e.message.split('\n')[0]);
  } finally {
    await browser.close();
    srv.close();
  }
  const failed = results.filter(function (r) { return !r.ok; }).length;
  if (failed) process.exitCode = 1;
  console.log(results.length - failed + '/' + results.length + ' checks passed');
})();
