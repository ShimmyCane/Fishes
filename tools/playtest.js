#!/usr/bin/env node
// Fishes playtest: headless checks against the real game, served from this folder.
//
//   node tools/playtest.js            run every check
//   node tools/playtest.js layout     button and joystick overlap at six screen sizes
//   node tools/playtest.js allies     ally price rises with each buy and falls back when allies die
//   node tools/playtest.js looks      every fish has a look and draws without an error
//   node tools/playtest.js look       Settings → Look: four looks, saved, the dark look's short radar
//   node tools/playtest.js seafull    every level has food and predators; small fish do not bite you
//   node tools/playtest.js smoke [s]  play for s seconds (default 20) and report page errors
//
// Needs Playwright. In this environment it is preinstalled; the script looks in the global
// npm root and uses the pinned Chromium at /opt/pw-browsers/chromium when present.
// Exit code 1 if any check fails, so it can gate a PR.

'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, gameData, loadPlaywright, serve, launch } = require('./harness');
const GAME_DATA = gameData();

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
      // The HUD is two cards (the level card and the hearts and timer card); the bar itself spans the screen.
      return ['joy', 'ally', 'attack', 'sprint', 'gear', 'hudL', 'hudR', 'minimap'].map(function (id) {
        const e = id === 'hudL' ? document.querySelector('.hud-card:not(.hud-right)') : id === 'hudR' ? document.querySelector('.hud-right') : document.getElementById(id);
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
  // The start (and each level-up) gives 5 s of calm and invulnerability (v0.12): wait it out so the fish's bites count.
  await p.waitForTimeout(6000);
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
  // On-screen fish length in pixels: the sprite length (the game's own fishLen, as lenFor uses) times the camera scale.
  const onScreen = function (s) { return GAME_DATA.fishLen(s.size) * s.cam.scale; };
  const ratio = onScreen(last) / onScreen(first);
  check('the sea is at least 3000 wide at level 1', first.W >= 3000, 'W=' + first.W);
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
  // v0.12: three times the old denser sea, so about 12 times the sparse count. v0.13: the predators at level 1 are sized
  // to you now and eat some prey in the first seconds, so test the ratio (and a floor), not an exact count.
  check('denser sea is on by default: about three times the old denser count', on.fish >= 200 && on.fish >= 6 * off.fish, 'fish with denser sea on=' + on.fish + ', off=' + off.fish);
  check('turning denser sea off gives the sparse count', off.fish <= 40 && off.fish >= 10, 'fish with it off=' + off.fish);
  check('the trash toy is three times its old size', GAME_DATA.SPECIES.filter(function (x) { return x.id === 'toycar'; })[0].size === 4.8, 'toy size ' + GAME_DATA.SPECIES.filter(function (x) { return x.id === 'toycar'; })[0].size);
  check('no page errors (density)', on.errors.length === 0 && off.errors.length === 0, on.errors.concat(off.errors).join(' | '));
}

// v0.12 layout (2026-11-08): sprint is the same size as Ally and Attack; the mini map is at most a quarter of the screen
// wide, top right, with the hearts and timer card under it.
async function buttonsAndMap(browser, url) {
  const sizes = [[1024, 768], [768, 1024], [390, 844], [844, 390]];
  for (const [w, h] of sizes) {
    const ctx = await startRun(browser, url, 0, w, h, 'joystick');
    const r = await ctx.page.evaluate(function () {
      const box = function (sel) { const b = document.querySelector(sel).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      return { sprint: box('#sprint'), ally: box('#ally'), attack: box('#attack'), map: box('#minimap'), card: box('.hud-right') };
    });
    const same = Math.abs(r.sprint.w - r.ally.w) < 1 && Math.abs(r.sprint.h - r.ally.h) < 1 && Math.abs(r.attack.w - r.ally.w) < 1 && Math.abs(r.attack.h - r.ally.h) < 1;
    check('sprint is the same size as Ally and Attack at ' + w + 'x' + h, same,
      'sprint ' + r.sprint.w.toFixed(0) + 'x' + r.sprint.h.toFixed(0) + ', ally ' + r.ally.w.toFixed(0) + 'x' + r.ally.h.toFixed(0) + ', attack ' + r.attack.w.toFixed(0) + 'x' + r.attack.h.toFixed(0));
    const short = h <= 500;   // short landscape phones: the mini map is top left and the card stays top right
    check('the mini map is at most a quarter of the screen wide at ' + w + 'x' + h + (short ? ' (top left)' : ' (top right)'),
      r.map.w <= w / 4 + 1 && (short ? r.map.l < w / 2 : r.map.r >= w - 14 && r.map.l > w / 2),
      'map ' + r.map.w.toFixed(0) + ' px wide (a quarter is ' + (w / 4).toFixed(0) + ')');
    check('the hearts and timer card is ' + (short ? 'top right, clear of the mini map' : 'under the mini map, on the right') + ' at ' + w + 'x' + h,
      short ? r.card.l > w / 2 : (r.card.t >= r.map.b - 1 && r.card.l > w / 2),
      'map bottom ' + r.map.b.toFixed(0) + ', card top ' + r.card.t.toFixed(0) + ', card left ' + r.card.l.toFixed(0));
    await ctx.page.close();
  }
}

// The school, the bought allies and the friends together are at most 5 (2026-11-08: "more than five schools").
async function schoolCap(browser, url) {
  const ctx = await startRun(browser, url, 0, 1024, 768);
  const p = ctx.page;
  await p.evaluate(function () { window.FishGame.debugSetSize(200); });   // a big level: the school of 5 fills the cap
  await p.waitForTimeout(6000);
  for (let i = 0; i < 8; i++) { await p.evaluate(function () { document.getElementById('ally').click(); }); await p.waitForTimeout(250); }
  await p.waitForTimeout(500);
  const st = await p.evaluate(function () { return window.FishGame.state(); });
  check('the school, bought allies and friends together are at most 5', st.pods === 5 && st.allies === 0,
    'pods ' + st.pods + ' (school ' + (st.pods - st.allies - st.friends) + ', bought ' + st.allies + ', friends ' + st.friends + ')');
  check('no page errors (school cap)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// v0.12 performance (2026-11-09: "the game should move smoothly"): the grid search must match a brute-force search, and
// the canvas buffer must stay within its pixel budget on a big screen.
async function smoothness(browser, url) {
  const ctx = await startRun(browser, url, 70, 1024, 768);
  const p = ctx.page;
  await p.waitForTimeout(3000);
  const g = await p.evaluate(function () { return window.FishGame.debugGridCheck(); });
  check('the grid finds the same nearest fish as a full search', g && g.checked >= 20 && g.mismatches === 0,
    'checked ' + (g && g.checked) + ' fish among ' + (g && g.fish) + ', mismatches ' + (g && g.mismatches));
  const buf = await p.evaluate(function () { const c = document.getElementById('view'); return c ? c.width * c.height : 0; });
  check('the canvas buffer stays within about 2.2 million pixels (1024 x 768 screen)', buf > 0 && buf <= 2200000 * 1.02,
    'buffer ' + buf + ' pixels');
  check('no page errors (smoothness)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// Can you grow? (2026-11-08: "I can't find anything to eat at levels 1-2.") A bot holds the pointer on the nearest
// thing you can eat, as a finger does in tap-and-move, on a phone-sized screen. It must reach level 2 in 100 s.
// Also: every script and style link carries the build stamp, so a device does not keep an old cached copy.
async function growth(browser, url) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const links = (html.match(/(?:src|href)="(?:js|css)\/[^"]+"/g) || []);
  const stale = links.filter(function (l) { return l.indexOf('?b=' + GAME_DATA.CONFIG.BUILD + '"') < 0; });
  check('every script and style link carries the build stamp', links.length >= 6 && stale.length === 0,
    links.length + ' links, build ' + GAME_DATA.CONFIG.BUILD + (stale.length ? ', stale: ' + stale.join(' ') : ''));

  const W = 390, H = 844;
  const ctx = await startRun(browser, url, 0, W, H);
  const p = ctx.page;
  const title = await p.evaluate(function () { return document.getElementById('title-version').textContent; });
  check('the title shows the build', title.indexOf('build ' + GAME_DATA.CONFIG.BUILD) >= 0, title);
  const t0 = Date.now();
  let st = null, down = false, firstNear = null;
  while (Date.now() - t0 < 100000) {
    const g = await p.evaluate(function () { return { t: window.FishGame.debugTarget(), s: window.FishGame.state() }; });
    st = g.s;
    if (firstNear === null && g.t) firstNear = g.t.near;
    if (st.mode !== 'play' || st.level >= 2) break;
    let x = W / 2, y = H / 4;
    if (g.t && g.t.target) { x = g.t.target.sx; y = g.t.target.sy; }
    await p.mouse.move(Math.max(5, Math.min(W - 5, x)), Math.max(5, Math.min(H - 5, y)));
    if (!down) { await p.mouse.down(); down = true; }
    await p.waitForTimeout(120);
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  check('you can find food and grow from level 1 to level 2 (bot, 390x844)', st.level >= 2,
    'level ' + st.level + ' size ' + st.size.toFixed(1) + ' after ' + secs + ' s, eaten ' + st.eaten + ', edible things within 600 at the start: ' + firstNear);
  check('no page errors (growth)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// Family notes (2026-11-08): you can eat at level 1, the tide scatters your school, and landscape matches portrait.
async function familyNotes(browser, url) {
  // At level 1 every wild fish is under half your size; there is no size floor there, so a neon tetra is food.
  const ctx = await startRun(browser, url, 0, 1024, 768);
  const p = ctx.page;
  await p.evaluate(function () { window.FishGame.debugSpawnCreature('neon'); });
  for (let i = 0; i < 12; i++) {
    await p.evaluate(function () { const c = window.FishGame.state().testCreature; if (c && !c.dead) window.FishGame.debugMove(c.x, c.y); });
    await p.waitForTimeout(250);
  }
  const eat = await p.evaluate(function () { return window.FishGame.state(); });
  check('at level 1 you can eat a small fish (a neon tetra)', eat.testCreature && eat.testCreature.dead,
    'level ' + eat.level + ', size ' + eat.size.toFixed(1) + ', neon dead=' + (eat.testCreature && eat.testCreature.dead));

  check('no page errors (eating at level 1)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();

  // The tide's pull carries your school away from you; they regroup after. On Calm, so hunters do not eat the school
  // mid-check (a check that lost its school read 96, then nothing).
  const tp = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const terr = [];
  tp.on('pageerror', function (e) { terr.push(e.message); });
  await tp.addInitScript(function () { localStorage.setItem('fish_difficulty', 'calm'); });
  await tp.goto(url);
  await tp.click('#btn-play');
  await tp.waitForTimeout(500);
  await tp.evaluate(function () { window.FishGame.debugSetSize(95); });   // level 11: your school joins you
  await tp.waitForTimeout(6000);
  const before = await tp.evaluate(function () { return window.FishGame.state(); });
  await tp.evaluate(function () { window.FishGame.debugTide(); });
  // Read the school's distance through the pull (8-14 s) and keep the furthest; the tide's direction is random.
  await tp.waitForTimeout(8500);
  let during = null, far = 0;
  for (let i = 0; i < 11; i++) {
    const st = await tp.evaluate(function () { return window.FishGame.state(); });
    if (st.podDist !== null && st.podDist > far) { far = st.podDist; during = st; }
    await tp.waitForTimeout(500);
  }
  // The rule: at least twice as far as they usually keep (runs read 2.4x to 5x; the sea is random).
  check('the tide pulls your school away from you (at least twice as far)', before.pods >= 1 && during !== null && far >= 2 * before.podDist,
    'school ' + before.pods + ': average distance ' + before.podDist + ' -> furthest ' + far + ' (tide at ' + (during && during.tide) + ' s)');
  check('no page errors (tide and school)', terr.length === 0, terr.join(' | '));
  await tp.close();

  // The fish is the same size on screen in portrait and landscape (it used to be about 1.6x bigger in landscape).
  const onScreen = function (st) { return GAME_DATA.fishLen(st.size) * st.cam.scale; };
  const tall = await startRun(browser, url, 0, 390, 844);
  const wide = await startRun(browser, url, 0, 844, 390);
  await tall.page.waitForTimeout(500); await wide.page.waitForTimeout(500);
  const a = await tall.page.evaluate(function () { return window.FishGame.state(); });
  const b = await wide.page.evaluate(function () { return window.FishGame.state(); });
  const ratio = onScreen(b) / onScreen(a);
  check('the fish is the same size in portrait and landscape', Math.abs(ratio - 1) < 0.03,
    'portrait ' + onScreen(a).toFixed(0) + ' px, landscape ' + onScreen(b).toFixed(0) + ' px (x' + ratio.toFixed(2) + ')');
  await tall.page.close(); await wide.page.close();
}

// v0.12 evolution and the tide. Five forms on every level, a play style that steers which one you become,
// your form's numbers applied to you, a sea that stays the same height, and a tide that drags you.
async function evolutionAndTide(browser, url) {
  // Every level has five new forms, plus its first species.
  const short = [];
  for (let n = 1; n <= 20; n++) if (GAME_DATA.SPECIES.filter(function (sp) { return sp.tier === n && sp.form; }).length !== 5) short.push(n);
  check('every level has five forms you can evolve into', short.length === 0, short.length ? 'levels short: ' + short.join(', ') : '20 levels x 5');

  const ctx = await startRun(browser, url, 0, 1024, 768);
  const p = ctx.page;
  // A play style steers the odds: biting favours bite builds, swimming fast ones, allies tough ones.
  const odds = await p.evaluate(function () {
    const top = function (o) { return Object.keys(o).sort(function (x, y) { return o[y].share - o[x].share; })[0]; };
    const a = window.FishGame.debugFormOdds(10, 1, 0, 0), s = window.FishGame.debugFormOdds(10, 0, 1, 0), h = window.FishGame.debugFormOdds(10, 0, 0, 1);
    return { bite: a[top(a)], swim: s[top(s)], ally: h[top(h)] };
  });
  check('biting leans to hard bites, swimming to speed, allies to health',
    odds.bite.atk >= 1.2 && odds.swim.spd >= 1.15 && odds.ally.hp >= 1.25,
    'biting: ' + odds.bite.build + ' ' + odds.bite.share + ', swimming: ' + odds.swim.build + ' ' + odds.swim.share + ', allies: ' + odds.ally.build + ' ' + odds.ally.share);

  const first = await p.evaluate(function () { return window.FishGame.state(); });
  await p.evaluate(function () { window.FishGame.debugSetSize(70); });   // level 8
  await p.waitForTimeout(300);
  const st = await p.evaluate(function () { return window.FishGame.state(); });
  const fits = st.path.every(function (id, i) {
    const sp = GAME_DATA.SPECIES.filter(function (x) { return x.id === id; })[0];
    return sp && sp.tier === i + 1 && (sp.form || sp === GAME_DATA.leadOf(i + 1));
  });
  check('your evolution path has one form for each level you reached', st.path.length === st.level && fits,
    'level ' + st.level + ', path ' + st.path.join(' > '));
  const form = GAME_DATA.SPECIES.filter(function (x) { return x.id === st.form; })[0];
  const wantHp = Math.round(GAME_DATA.TUNING.playerHp * (10 + Math.floor(st.size / 2)) * (form.hp || 1));   // the game's own formula (TUNING)
  check("your form's health applies to you", st.maxHp === wantHp,
    'form ' + st.form + ' (' + st.formBuild + ', hp x' + (form.hp || 1) + '): max health ' + st.maxHp + ', expected ' + wantHp);
  check('the sea is the same height on every level, and only its width grows',
    first.H === st.H && st.H === GAME_DATA.levelInfo(20).H && st.W > first.W, 'H ' + first.H + ' -> ' + st.H + ', W ' + first.W + ' -> ' + st.W);

  // The tide: choppy waves first, then a pull that drags you while you do nothing.
  await p.waitForTimeout(5500);   // the calm after the level-up
  const calmSurf = await p.evaluate(function () { let m = 0; for (let x = 0; x < 4000; x += 37) m = Math.max(m, Math.abs(window.FishGame.surfAt(x))); return m; });
  await p.evaluate(function () { window.FishGame.debugTide(); });
  await p.waitForTimeout(4500);   // into the chop
  const chopSurf = await p.evaluate(function () { let m = 0; for (let x = 0; x < 4000; x += 37) m = Math.max(m, Math.abs(window.FishGame.surfAt(x))); return m; });
  check('a tide starts with choppy waves', chopSurf > calmSurf + 8, 'surface swing ' + calmSurf.toFixed(1) + ' -> ' + chopSurf.toFixed(1));
  // Wait for the game's own tide clock to reach the pull (8 s into the tide), since a busy browser runs slow.
  let a0 = null;
  for (let i = 0; i < 120 && !(a0 && a0.tide >= 8.5); i++) {
    await p.waitForTimeout(200);
    a0 = await p.evaluate(function () { return window.FishGame.state(); });
  }
  let a1 = a0;
  for (let i = 0; i < 120 && a1.tide !== null && a1.tide < 9.5; i++) {
    await p.waitForTimeout(100);
    a1 = await p.evaluate(function () { return window.FishGame.state(); });
  }
  let dx = a1.px - a0.px; if (dx > a1.W / 2) dx -= a1.W; if (dx < -a1.W / 2) dx += a1.W;
  check('the tide drags you along, even when you do not swim', Math.abs(dx) > 60 && a0.tide !== null,
    'moved ' + Math.round(dx) + ' in ' + ((a1.tide || 0) - (a0.tide || 0)).toFixed(1) + ' s of tide during the pull (tide at ' + a0.tide + ' s)');
  check('no page errors (evolution and tide)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// v0.12 eating: plankton is food only up to level 4, and a fish under half your size is not food for you.
async function edibleRules(browser, url) {
  const ctx = await startRun(browser, url, 70, 1024, 768);   // level 8
  const p = ctx.page;
  await p.waitForTimeout(6000);   // the calm after the level-up
  await p.evaluate(function () { window.FishGame.debugSpawnCreature('plankton'); });
  await p.evaluate(function () { const c = window.FishGame.state().testCreature; window.FishGame.debugMove(c.x, c.y); });
  await p.waitForTimeout(800);
  const food = await p.evaluate(function () { return window.FishGame.state(); });
  check('plankton is not food at level 8', food.testCreature && !food.testCreature.dead,
    'level ' + food.level + ', plankton dead=' + (food.testCreature && food.testCreature.dead));
  // A guppy (0.8) is far under half of your 70: you touch it for four seconds and it is not bitten.
  await p.evaluate(function () { window.FishGame.debugSpawnCreature('guppy'); });
  const start = await p.evaluate(function () { return window.FishGame.state().testCreature; });
  for (let i = 0; i < 16; i++) {
    await p.evaluate(function () { const c = window.FishGame.state().testCreature; if (c && !c.dead) window.FishGame.debugMove(c.x, c.y); });
    await p.waitForTimeout(250);
  }
  const small = await p.evaluate(function () { return window.FishGame.state().testCreature; });
  check('a baby fish under half your size is not food for you', !!small && !small.dead && !!start && small.hp >= start.hp,
    'guppy hp ' + (start && start.hp) + ' -> ' + (small && small.hp) + ', dead=' + (small && small.dead));
  // You never eat your own species: a fish of your form, touched for a while, is still there.
  const formId = await p.evaluate(function () { return window.FishGame.state().form; });
  await p.evaluate(function (id) { window.FishGame.debugSpawnCreature(id); }, formId);
  const own0 = await p.evaluate(function () { return window.FishGame.state().testCreature; });
  for (let i = 0; i < 12; i++) {
    await p.evaluate(function () { const c = window.FishGame.state().testCreature; if (c && !c.dead) window.FishGame.debugMove(c.x, c.y); });
    await p.waitForTimeout(250);
  }
  const own = await p.evaluate(function () { return window.FishGame.state().testCreature; });
  // Other fish may nip it in a busy sea; one bite of yours would take more than this (your attack x playerBite).
  const yourBite = (1 + Math.floor(70 / 8)) * GAME_DATA.TUNING.playerBite * 0.85;
  check('you never eat your own species', !!own && !own.dead && !!own0 && own.hp > own0.hp - yourBite,
    'form ' + formId + ': hp ' + (own0 && own0.hp) + ' -> ' + (own && own.hp) + ', dead=' + (own && own.dead));
  check('no page errors (edible rules)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// v0.12 friends and followers: a similar fish that stays just outside your bite range for 3 s joins you.
// Touching it resets the wait. Followers over the limit (2 x your size) are released one at a time.
async function friendsAndFollowers(browser, url) {
  const ctx = await startRun(browser, url, 12, 1024, 768);   // level 2: your form is a slim fish
  const p = ctx.page;
  await p.waitForTimeout(6000);   // the calm after the start
  // A fish of your own form (same shape as you) and 11 long against your 12, so it does not flee. v0.12: your form is random. Keep it in the friend band (not touching).
  await p.evaluate(function () { window.FishGame.debugSpawnCreature(window.FishGame.state().form, 11); });
  let st = null;
  for (let i = 0; i < 24; i++) {
    await p.evaluate(function () {
      const t = window.FishGame.state().testCreature;
      if (t && !t.dead && !t.friend) window.FishGame.debugMove(t.x - 110, t.y);
    });
    await p.waitForTimeout(250);
    st = await p.evaluate(function () { return window.FishGame.state(); });
    if (st.friends >= 1) break;
  }
  check('a similar fish that stays close, without touching you, joins you after 3 s',
    st.friends >= 1 && !!st.testCreature && st.testCreature.friend,
    'friends=' + st.friends + ', mass ' + st.followerMass + ' of limit ' + st.followerLimit + ', level ' + st.level);

  // Touching resets the wait: a clownfish is kept in the band for 2.4 s, touched once, then in the band for 2.4 s. No friend.
  await p.evaluate(function () { window.FishGame.debugSpawnCreature(window.FishGame.state().form, 11); });
  const touchOnce = async function (ms) {
    for (let t = 0; t < ms; t += 250) {
      await p.evaluate(function () {
        const c = window.FishGame.state().testCreature;
        if (c && !c.dead && !c.friend) window.FishGame.debugMove(c.x - 110, c.y);
      });
      await p.waitForTimeout(250);
    }
  };
  await touchOnce(2400);
  await p.evaluate(function () {   // touch it: put you on top of it for one step
    const c = window.FishGame.state().testCreature;
    if (c && !c.dead) window.FishGame.debugMove(c.x - 5, c.y);
  });
  await p.waitForTimeout(250);
  const mid = await p.evaluate(function () { return window.FishGame.state(); });
  await touchOnce(2400);
  const after = await p.evaluate(function () { return window.FishGame.state(); });
  check('touching a fish starts the three seconds again (it does not join)',
    after.testCreature && !after.testCreature.friend,
    'greet=' + (mid.testCreature && mid.testCreature.greetT) + ' then ' + (after.testCreature && after.testCreature.greetT) + ', friend=' + (after.testCreature && after.testCreature.friend));

  // Release: a friend of 11 with your size at 4 is over the limit (2 x 4 = 8). It is released, one at a time.
  await p.evaluate(function () { window.FishGame.debugSetSize(4); });
  await p.waitForTimeout(2500);
  const rel = await p.evaluate(function () { return window.FishGame.state(); });
  check('followers over the limit are released until you are under it',
    rel.friends === 0 && rel.followerMass <= rel.followerLimit + 0.01,
    'friends=' + rel.friends + ', mass ' + rel.followerMass + ' vs limit ' + rel.followerLimit);
  check('no page errors (friends)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// v0.12: a level-up starts a calm, and only one level comes per calm. Growth past the goal waits for the calm to end.
async function calmLevels(browser, url) {
  const ctx = await startRun(browser, url, 70, 1024, 768);   // level 6; the start sets a calm, so wait it out
  const p = ctx.page;
  await p.waitForTimeout(5500);
  const a = await p.evaluate(function () { return window.FishGame.state(); });
  await p.evaluate(function () { window.FishGame.debugGrow(1000); });   // far past the goal: one level, then the calm
  await p.waitForTimeout(200);
  const b = await p.evaluate(function () { return window.FishGame.state(); });
  await p.evaluate(function () { window.FishGame.debugGrow(1000); });   // straight away: must wait for the calm
  await p.waitForTimeout(200);
  const c = await p.evaluate(function () { return window.FishGame.state(); });
  check('a level-up starts a calm, and no second level comes during it',
    b.level === a.level + 1 && c.level === b.level && b.calm > 3 && b.calm <= 5,
    'level ' + a.level + ' -> ' + b.level + ' -> ' + c.level + ', calm ' + b.calm);
  await p.waitForTimeout(5500);
  const d = await p.evaluate(function () { return window.FishGame.state(); });
  check('when the calm ends, the next level comes once (not several at once)',
    d.level === b.level + 1 && d.calm > 0, 'level ' + b.level + ' -> ' + d.level + ' after the calm, calm now ' + d.calm);
  check('no page errors (calm levels)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// v0.12: your school changes form over a few seconds (a cross-fade), not all at once.
async function schoolForms(browser, url) {
  const ctx = await startRun(browser, url, 0, 1024, 768);
  const p = ctx.page;
  await p.evaluate(function () { window.FishGame.debugSetSize(95); });   // level 11: the school joins you
  await p.waitForTimeout(6000);                                          // the calm, and the school arrives
  const pods = await p.evaluate(function () { return window.FishGame.state(); });
  await p.evaluate(function () { window.FishGame.debugSetSize(1000); }); // a new form on each level up, to level 20
  await p.waitForTimeout(300);
  const early = await p.evaluate(function () { return window.FishGame.state(); });
  await p.waitForTimeout(2000);
  const mid = await p.evaluate(function () { return window.FishGame.state(); });
  await p.waitForTimeout(8000);
  const late = await p.evaluate(function () { return window.FishGame.state(); });
  check('your school changes form over a few seconds, then settles',
    pods.pods >= 1 && early.morphing >= 1 && mid.morphing >= 1 && late.morphing === 0,
    'school ' + pods.pods + ', changing at 0.3 s: ' + early.morphing + ', at 2.3 s: ' + mid.morphing + ', at 10 s: ' + late.morphing);
  check('no page errors (school forms)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// v0.12: a harmless creature is not food. You touch a turtle for four seconds and it is still there, unhurt.
async function harmlessIsNotFood(browser, url) {
  const ctx = await startRun(browser, url, 12, 1024, 768);
  const p = ctx.page;
  await p.waitForTimeout(6000);   // the calm after the start
  await p.evaluate(function () { window.FishGame.debugSpawnCreature('turtle'); });
  const start = await p.evaluate(function () { return window.FishGame.state().testCreature; });
  for (let i = 0; i < 16; i++) {
    await p.evaluate(function () {
      const s = window.FishGame.state();
      if (s.testCreature && !s.testCreature.dead) window.FishGame.debugMove(s.testCreature.x - 10, s.testCreature.y);   // inside your reach (about 27 at size 3)
    });
    await p.waitForTimeout(250);
  }
  const t = await p.evaluate(function () { return window.FishGame.state().testCreature; });
  check('a turtle is not food: you touch it and it is still there, unhurt',
    !!t && !t.dead && !!start && t.hp >= start.hp,
    'turtle hp ' + (start && start.hp) + ' -> ' + (t && t.hp) + ', dead=' + (t && t.dead));
  check('no page errors (harmless)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// v0.12 background items (Settings → Background items): clams, rocks, boats, a kelp forest, shrimp and urchins.
// Off removes them at once; on brings them back. The mini map is bigger on a tablet than on a phone.
async function backgroundItems(browser, url) {
  // Level 8 (size 70): scenery. A level-up pauses new spawns for its calm (5 s), so poll for up to 15 s.
  const ctx = await startRun(browser, url, 70, 1024, 768);
  const p = ctx.page;
  let st = null;
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(500);
    st = await p.evaluate(function () { return window.FishGame.state(); });
    if (st.creatures.clam >= 1 && st.creatures.rock >= 1 && st.creatures.boat >= 1 && st.forests >= 2) break;
  }
  check('clams, rocks, boats and a kelp forest are in the sea by default',
    st.creatures.clam >= 1 && st.creatures.rock >= 1 && st.creatures.boat >= 1 && st.forests >= 2,
    'level ' + st.level + ': clams=' + st.creatures.clam + ' rocks=' + st.creatures.rock + ' boats=' + st.creatures.boat + ' forests=' + st.forests);

  // Shrimp and urchins are edible prey from the early levels (their tier is 2), so check them on a fresh level-3 run.
  const food = await startRun(browser, url, 25, 1024, 768);   // level 3
  let fst = null;
  for (let i = 0; i < 40; i++) {
    await food.page.waitForTimeout(500);
    fst = await food.page.evaluate(function () { return window.FishGame.state(); });
    if (fst.creatures.shrimp >= 1 && fst.creatures.urchin >= 1) break;
  }
  check('shrimp and purple urchins come into the sea at level 3',
    fst.creatures.shrimp >= 1 && fst.creatures.urchin >= 1, 'level ' + fst.level + ': shrimp=' + fst.creatures.shrimp + ' urchins=' + fst.creatures.urchin);
  await food.page.close();

  await p.click('#gear');
  await p.waitForTimeout(300);
  await p.evaluate(function () { document.querySelectorAll('#panel details').forEach(function (d) { d.open = true; }); });
  await p.click('#bg-toggle');
  await p.waitForTimeout(800);
  const off = await p.evaluate(function () { return window.FishGame.state(); });
  check('turning background items off clears them and the kelp forests',
    off.creatures.bg === 0 && off.forests === 0, 'bg=' + off.creatures.bg + ' forests=' + off.forests);
  await p.click('#bg-toggle');
  await p.waitForTimeout(800);
  const on = await p.evaluate(function () { return window.FishGame.state(); });
  check('turning background items back on brings them back',
    on.creatures.bg >= 1 && on.forests >= 2, 'bg=' + on.creatures.bg + ' forests=' + on.forests);
  await p.click('#gear');
  await p.waitForTimeout(200);
  check('no page errors (background items)', ctx.errors.length === 0, ctx.errors.join(' | '));

  await p.setViewportSize({ width: 768, height: 1024 });
  await p.waitForTimeout(300);
  const tablet = await p.evaluate(function () { return document.getElementById('minimap').getBoundingClientRect().width; });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  const phone = await p.evaluate(function () { return document.getElementById('minimap').getBoundingClientRect().width; });
  // v0.12: the mini map is a quarter of the screen wide (it used to be a fixed 440 px on a tablet).
  check('the mini map is a quarter of the screen wide (tablet 768, phone 390)',
    Math.abs(tablet - 192) < 2 && Math.abs(phone - 97.5) < 2, 'tablet ' + Math.round(tablet) + ' px of 768, phone ' + Math.round(phone) + ' px of 390');
  await p.close();
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
  check('trash is in the sea by default', st.creatures.trash >= 1, 'trash=' + st.creatures.trash);
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
      if (s.testCreature && !s.testCreature.dead) window.FishGame.debugMove(s.testCreature.x - 10, s.testCreature.y);   // inside your reach (about 27 at size 3)
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
  // Trash in the sea: the Settings toggle takes it out (the room is clean), and it comes back when switched on.
  await p.click('#gear');
  await p.waitForTimeout(300);
  await p.evaluate(function () { document.querySelectorAll('#panel details').forEach(function (d) { d.open = true; }); });
  await p.click('#trash-toggle');
  await p.waitForTimeout(800);
  const clean = await p.evaluate(function () { return window.FishGame.state(); });
  check('turning trash off clears the sea', clean.creatures.trash === 0, 'trash=' + clean.creatures.trash);
  await p.click('#trash-toggle');
  await p.waitForTimeout(800);
  const back = await p.evaluate(function () { return window.FishGame.state(); });
  check('turning trash back on brings it back', back.creatures.trash >= 1, 'trash=' + back.creatures.trash);
  await p.click('#gear');
  await p.waitForTimeout(200);
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

// Allies stay with you when you level up (v0.11): they keep their places around you, as the other fish do.
async function allyStay(browser, url) {
  const ctx = await startRun(browser, url, 70, 1024, 768);
  const p = ctx.page;
  await p.waitForTimeout(300);
  await p.click('#ally');
  await p.waitForTimeout(300);
  const before = await p.evaluate(function () { return window.FishGame.state(); });
  if (before.allies === 0) { console.log('SKIP ally stay check: no ally survived to be tested. Re-run.'); await p.close(); return; }
  await p.evaluate(function () { window.FishGame.debugSetSize(95); });   // a level or two up
  await p.waitForTimeout(800);
  const after = await p.evaluate(function () { return window.FishGame.state(); });
  check('allies stay with you when you level up', after.level > before.level && after.allies > 0 && after.allyDist !== null && after.allyDist < 320,
    'level ' + before.level + '->' + after.level + ', nearest ally ' + after.allyDist + 'px away');
  check('no page errors (ally stay)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// Settings (v0.11): the family notes list shows its sign-in message when you are not signed in.
async function settingsPanel(browser, url) {
  const ctx = await startRun(browser, url, 0, 1024, 768);
  const p = ctx.page;
  await p.waitForTimeout(300);
  await p.click('#gear');
  await p.waitForTimeout(400);
  const msg = await p.evaluate(function () { const e = document.getElementById('status-msg'); return e ? e.textContent : null; });
  check('settings shows the note status list, with a sign-in message when signed out',
    msg !== null && /Sign in/.test(msg), 'status-msg="' + msg + '"');
  // Hide done notes: the toggle is there, and it flips its own state.
  await p.evaluate(function () { document.querySelectorAll('.note-box').forEach(function (d) { d.open = true; }); });
  await p.click('#hide-done');
  await p.waitForTimeout(200);
  const hd = await p.evaluate(function () { return document.getElementById('hide-done').getAttribute('aria-pressed'); });
  check('the hide-done-notes toggle switches on', hd === 'true', 'aria-pressed=' + hd);
  await p.click('#hide-done');
  await p.waitForTimeout(200);
  check('no page errors (settings)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// Calm (v0.11): no predators are spawned, and nothing can hurt you.
async function calm(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  await page.addInitScript(function () { localStorage.setItem('fish_difficulty', 'calm'); });
  await page.goto(url);
  await page.click('#btn-play');
  await page.waitForTimeout(500);
  await page.evaluate(function () { window.FishGame.debugSetSize(30); });   // a bigger level, with more fish
  await page.waitForTimeout(6000);
  const st = await page.evaluate(function () { return window.FishGame.state(); });
  // Smaller hunters are harmless to you; the rule is that nothing bigger than you is in the sea.
  const bigger = st.hunters.filter(function (h) { return h.size >= st.size * 1.1; }).length;
  check('calm: no predators bigger than you are in the sea', bigger === 0 && st.census.threat === 0,
    'bigger hunters=' + bigger + ' threats=' + st.census.threat + ' level=' + st.level + ' size=' + st.size.toFixed(1));
  check('no page errors (calm)', errors.length === 0, errors.join(' | '));
  await page.close();
}

// v0.13: every fish species has a look and draws without an error, at three sizes on screen (tiny, normal, close).
async function looks(browser, url) {
  const ctx = await startRun(browser, url, 0, 1024, 768);
  const r = await ctx.page.evaluate(function () {
    const c = document.createElement('canvas'); c.width = 300; c.height = 200; const g = c.getContext('2d');
    const out = { drawn: 0, noLook: [], errors: [] };
    window.FishData.SPECIES.forEach(function (sp) {
      if (['plankton', 'krill', 'trash', 'crab', 'clam', 'rock', 'boat', 'sub', 'urchin', 'shrimp'].indexOf(sp.shape) >= 0) return;
      if (!window.FishArt.lookOf(sp)) { out.noLook.push(sp.id); return; }
      [6, 40, 160].forEach(function (px) {
        try { g.save(); g.translate(150, 100); window.FishArt.draw(g, sp, px, { t: 1, ph: 0.3, sw: 0.8, lw: 1.5, px: px }); g.restore(); out.drawn++; }
        catch (e) { out.errors.push(sp.id + ': ' + e.message); g.restore(); }
      });
    });
    return out;
  });
  check('every fish species has a realistic look (js/fishart.js)', r.noLook.length === 0, r.noLook.length ? 'no look: ' + r.noLook.join(', ') : r.drawn + ' drawings');
  check('every fish draws without an error at three sizes', r.errors.length === 0, r.errors.slice(0, 3).join(' | '));
  check('no page errors (looks)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await ctx.page.close();
}

// v0.13: the sea is never empty. Before, nothing was big enough to eat or fear from level 13 on (species sizes were not
// scaled with the goals). At each level there are fish you can eat and, below the top levels, fish that can eat you.
async function seaFull(browser, url) {
  const ctx = await startRun(browser, url, 0, 1024, 768);
  const p = ctx.page;
  const rows = [];
  let ok = true;
  for (const n of [5, 11, 14, 18]) {
    await p.evaluate(function (g) { window.FishGame.debugSetSize(g); }, GAME_DATA.GOALS[n - 2] + 0.5);
    await p.waitForTimeout(6500);   // the calm after a level-up, then a few refills
    const st = await p.evaluate(function () { return window.FishGame.state(); });
    rows.push('L' + st.level + ' edible ' + st.census.edible + ' threats ' + st.census.threat);
    if (st.census.edible < 10 || (n < 17 && st.census.threat < 1)) ok = false;
  }
  check('every level has fish to eat and predators (levels 5, 11, 14, 18)', ok, rows.join(', '));
  // A fish under half your size does not bite you (TUNING.nibbleMin).
  await p.evaluate(function () { window.FishGame.debugSetSize(30); });
  await p.waitForTimeout(5600);   // wait out the calm (you cannot be bitten during it)
  const before = await p.evaluate(function () { const s = window.FishGame.debugStats(); return s.stats.dmgBy['Test fish'] || 0; });
  for (let i = 0; i < 6; i++) {
    await p.evaluate(function () { const s = window.FishGame.state(); window.FishGame.debugSpawnBeside(s.size * 0.4); });
    await p.waitForTimeout(400);
  }
  const after = await p.evaluate(function () { const s = window.FishGame.debugStats(); return s.stats.dmgBy['Test fish'] || 0; });
  check('a fish under half your size does not bite you', after === before, 'damage from small test fish: ' + (after - before));
  check('no page errors (sea full)', ctx.errors.length === 0, ctx.errors.join(' | '));
  await p.close();
}

// v0.13 Settings → Look: four looks; the choice is saved; each draws without an error; the dark look's radar is short
// in the deep and unlimited near the surface on an early level.
async function lookChoice(browser, url) {
  const ctx = await startRun(browser, url, 0, 1024, 768);
  const p = ctx.page;
  await p.click('#gear');
  await p.waitForTimeout(200);
  const opts = await p.evaluate(function () { return Array.from(document.querySelectorAll('#look-select option')).map(function (o) { return o.value; }); });
  check('Settings has a Look drop-down with four looks', opts.join(',') === 'real,pastel,ink,dark', opts.join(','));
  await p.selectOption('#look-select', 'ink');
  const saved = await p.evaluate(function () { return { ls: localStorage.getItem('fish_look'), look: window.FishGame.state().look }; });
  check('choosing a look saves it and takes effect', saved.ls === 'ink' && saved.look === 'ink', JSON.stringify(saved));
  await p.click('#panel-close').catch(function () {});
  const shallow = [];
  for (const look of ['real', 'pastel', 'ink', 'dark']) {
    await p.evaluate(function (l) { localStorage.setItem('fish_look', l); }, look);
    await p.reload(); await p.click('#btn-play'); await p.waitForTimeout(900);
    const le = await p.evaluate(function () { return window.FishGame.loopErrors().length; });
    shallow.push(look + ':' + le);
  }
  check('every look draws without an error', ctx.errors.length === 0 && shallow.every(function (x) { return x.endsWith(':0'); }), shallow.join(' ') + ' ' + ctx.errors.join(' | '));
  const near = await p.evaluate(function () { return window.FishGame.debugRadar(); });   // dark look, level 1
  await p.evaluate(function (g) { window.FishGame.debugSetSize(g); }, GAME_DATA.GOALS[13] + 0.5);   // level 15
  await p.waitForTimeout(5800);
  const deep = await p.evaluate(function () { const s = window.FishGame.state(); window.FishGame.debugMove(s.px, window.FishGame.bedAt(s.px) - 60); return 0; });
  await p.waitForTimeout(400);
  const far = await p.evaluate(function () { return { radar: window.FishGame.debugRadar(), W: window.FishGame.state().W }; });
  check('dark look: the radar sees the whole sea on level 1, and only nearby by the seabed on level 15',
    near === -1 && far.radar > 0 && far.radar < far.W / 3, 'level 1 radar ' + near + ', level 15 by the seabed ' + Math.round(far.radar) + ' of a sea ' + far.W + ' wide' + deep);
  await p.evaluate(function () { localStorage.removeItem('fish_look'); });
  await p.close();
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
    if (which === 'all' || which === 'allystay') await allyStay(browser, url);
    if (which === 'all' || which === 'settings') await settingsPanel(browser, url);
    if (which === 'all' || which === 'calm') await calm(browser, url);
    if (which === 'all' || which === 'calmlevels') await calmLevels(browser, url);
    if (which === 'all' || which === 'schoolforms') await schoolForms(browser, url);
    if (which === 'all' || which === 'harmless') await harmlessIsNotFood(browser, url);
    if (which === 'all' || which === 'background') await backgroundItems(browser, url);
    if (which === 'all' || which === 'friends') await friendsAndFollowers(browser, url);
    if (which === 'all' || which === 'edible') await edibleRules(browser, url);
    if (which === 'all' || which === 'evolution') await evolutionAndTide(browser, url);
    if (which === 'all' || which === 'notes') await familyNotes(browser, url);
    if (which === 'all' || which === 'growth') await growth(browser, url);
    if (which === 'all' || which === 'schoolcap') await schoolCap(browser, url);
    if (which === 'all' || which === 'buttons') await buttonsAndMap(browser, url);
    if (which === 'all' || which === 'smooth') await smoothness(browser, url);
    if (which === 'all' || which === 'looks') await looks(browser, url);
    if (which === 'all' || which === 'look') await lookChoice(browser, url);
    if (which === 'all' || which === 'seafull') await seaFull(browser, url);
    if (which === 'all' || which === 'smoke') await smoke(browser, url, which === 'smoke' ? secs : 10);
    if (!['all', 'layout', 'allies', 'fights', 'camera', 'density', 'life', 'creatures', 'pacing', 'allystay', 'settings', 'calm', 'calmlevels', 'schoolforms', 'harmless', 'background', 'friends', 'edible', 'evolution', 'notes', 'growth', 'schoolcap', 'buttons', 'smooth', 'looks', 'look', 'seafull', 'smoke'].includes(which)) { console.log('unknown check: ' + which); process.exitCode = 2; }
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
