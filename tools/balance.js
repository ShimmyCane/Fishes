#!/usr/bin/env node
// Fishes balance lab: plays whole games headless, fast, with a bot, and reports how the game is paced.
//
//   node tools/balance.js                       4 runs each of medium and hard, average bot
//   node tools/balance.js --runs 8 --diff easy,medium,hard --skill novice,average,expert
//   node tools/balance.js --tune mealDiv=11,lockRate=0.3   try tuning values (see TUNING in js/species.js)
//   node tools/balance.js --json out.json        also write every run as JSON
//   node tools/balance.js --minutes 16           stop a run after this many game minutes (endless play after level 20)
//
// The game runs in real Chromium with its own rules; only the page's frame loop is paused, and the bot advances it
// with FishGame.debugStep (30 steps a game second). A 15-minute game takes about 20-60 seconds of real time.
// The bot sees about one screen around it (sightLens fish lengths), swims to the best food, runs from what can bite it,
// and sprints to escape. Three skills (novice, average, expert) differ in reaction time, sight, caution and sprinting.
//
// What it reports, per difficulty and skill: how far runs get and how long they take, seconds spent on each level,
// lives lost and what took them, and flags where the game misses the targets in schematic.md
// (a full run of 8-15 minutes on medium, no level much slower than its neighbours, deaths that rise with difficulty).
// Exit code 0 always: this is a measuring tool, not a gate. tools/playtest.js is the gate.

'use strict';
const fs = require('fs');
const { gameData, loadPlaywright, serve, launch } = require('./harness');

// ---------- options ----------
function parseArgs(argv) {
  const o = { runs: 4, diff: ['medium', 'hard'], skill: ['average'], tune: {}, json: null, minutes: 16, workers: 3, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--runs') { o.runs = Number(v); i++; }
    else if (a === '--diff') { o.diff = v.split(','); i++; }
    else if (a === '--skill') { o.skill = v.split(','); i++; }
    else if (a === '--json') { o.json = v; i++; }
    else if (a === '--minutes') { o.minutes = Number(v); i++; }
    else if (a === '--workers') { o.workers = Number(v); i++; }
    else if (a === '--quiet') { o.quiet = true; }
    else if (a === '--tune') {
      v.split(',').forEach(function (kv) { const p = kv.split('='); o.tune[p[0]] = Number(p[1]); });
      i++;
    } else { console.log('unknown option ' + a); process.exit(2); }
  }
  return o;
}

// Bot skills. reaction: seconds between decisions. sightLens: how far it sees, in its own lengths (one screen is
// about 5-6 lengths from the middle to the side). fleeLens: how close a danger must be before it runs.
// noise: aim error in radians. sprintFlee / sprintChase: whether it sprints to escape or to catch food.
const SKILLS = {
  novice:  { reaction: 0.35, sightLens: 4.5, fleeLens: 2.0, noise: 0.45, sprintFlee: false, sprintChase: false, avoidSpiky: false },
  average: { reaction: 0.2,  sightLens: 6,   fleeLens: 3.0, noise: 0.2,  sprintFlee: true,  sprintChase: false, avoidSpiky: true },
  expert:  { reaction: 0.1,  sightLens: 7,   fleeLens: 4.0, noise: 0.05, sprintFlee: true,  sprintChase: true,  avoidSpiky: true }
};

// ---------- the bot (runs inside the page) ----------
// Advances the game by `secs` game seconds and returns { ms, done }. Its memory lives on window.__bot.
function botChunk(args) {
  const G = window.FishGame, cfg = args.cfg, dt = 1 / 30, steps = Math.round(args.secs / dt);
  const b = window.__bot || (window.__bot = { dir: Math.random() * Math.PI * 2, dirT: 0, senseT: 0 });
  let ms = 0;
  function decide() {
    const s = G.debugSense(cfg.sightLens * 60 + 400);   // a generous box; the bot filters by its own sight below
    if (!s) return;
    const L = s.len, sight = cfg.sightLens * L;
    let fx = 0, fy = 0, nearest = 1e9, best = null, bestScore = -1;
    s.things.forEach(function (o) {
      const d = Math.hypot(o.dx, o.dy) || 1;
      if (d > sight + o.len / 2) return;
      const reach = (L + o.len) * 0.5;
      if (o.danger || o.sting) {
        const r = o.sting ? reach * 1.3 : cfg.fleeLens * L + o.len * 0.5;
        if (d < r) {
          const w = (o.locked ? 2 : 1) * (1 - d / r) * (o.sting ? 0.6 : 1);
          fx -= o.dx / d * w; fy -= o.dy / d * w;
          if (!o.sting) nearest = Math.min(nearest, d - reach);
        }
      }
      if (o.edible && !(cfg.avoidSpiky && o.spiky)) {
        const score = o.gain / (d + L) / (o.food ? 1 : 1 + 0.15 * o.hp);   // growth per distance, and per bite it takes
        if (score > bestScore) { bestScore = score; best = o; }
      }
    });
    // Keep off the surface (a hop wastes time) and the seabed.
    if (s.y < 120) fy += 0.6;
    if (s.bed - s.y < 90) fy -= 0.6;
    let dx = 0, dy = 0, sprint = false;
    const fm = Math.hypot(fx, fy);
    if (fm > 0.25) {
      dx = fx / fm; dy = fy / fm;
      if (best) { const bd = Math.hypot(best.dx, best.dy) || 1; dx += best.dx / bd * 0.25; dy += best.dy / bd * 0.25; }
      sprint = cfg.sprintFlee && s.stamina > 10 && nearest < 2.5 * L;
    } else if (best) {
      const bd = Math.hypot(best.dx, best.dy) || 1;
      dx = best.dx / bd + fx; dy = best.dy / bd + fy;
      sprint = cfg.sprintChase && s.stamina > 55 && bd < 4 * L && bd > L;
    } else {
      b.dirT -= cfg.reaction;
      if (b.dirT <= 0) { b.dir = Math.random() < 0.5 ? (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) : Math.random() * Math.PI * 2; b.dirT = 5; }
      dx = Math.cos(b.dir) + fx; dy = Math.sin(b.dir) * 0.4 + fy;
    }
    const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 2 * cfg.noise;
    G.debugSteer(Math.cos(a), Math.sin(a), sprint);
  }
  for (let i = 0; i < steps; i++) {
    b.senseT -= dt;
    if (b.senseT <= 0) { b.senseT = cfg.reaction; decide(); }
    ms += G.debugStep(dt, 1);
    if (G.debugMode() !== 'play') return { ms: ms, done: true };
  }
  return { ms: ms, done: false };
}

// ---------- one run ----------
async function playRun(browser, url, diff, skill, opts) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  if (Object.keys(opts.tune).length) await page.addInitScript(function (t) { window.FishTuning = t; }, opts.tune);
  await page.goto(url);
  await page.evaluate(function (d) { window.FishGame.debugSim(true); window.FishGame.debugNewRun(d); }, diff);
  let ms = 0, steps = 0, st = null;
  const cap = opts.minutes * 60;
  for (;;) {
    const r = await page.evaluate(botChunk, { cfg: SKILLS[skill], secs: 20 });
    ms += r.ms; steps += 600;
    st = await page.evaluate(function () { return window.FishGame.debugStats(); });
    if (r.done || st.level >= 20 || st.t >= cap) break;
  }
  await page.close();
  return {
    diff: diff, skill: skill, end: st.mode === 'play' ? (st.level >= 20 ? 'reached 20' : 'cap') : st.end,
    t: Math.round(st.t), level: st.level, size: +st.size.toFixed(1), lives: st.lives, score: st.score,
    levelAt: st.stats.levelAt, deaths: st.stats.deaths, dmg: Math.round(st.stats.dmg), dmgBy: st.stats.dmgBy,
    food: st.stats.food, fish: st.stats.fish, path: st.path, msPerStep: +(ms / steps).toFixed(3), errors: errors
  };
}

// ---------- report ----------
function median(a) { if (!a.length) return null; const s = a.slice().sort(function (x, y) { return x - y; }); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
function mmss(s) { if (s === null || s === undefined) return '  -  '; s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

function report(runs, D, opts) {
  const lines = [], flags = [];
  const groups = {};
  runs.forEach(function (r) { (groups[r.diff + ' / ' + r.skill] = groups[r.diff + ' / ' + r.skill] || []).push(r); });
  lines.push('## Summary (' + runs.length + ' runs' + (Object.keys(opts.tune).length ? ', tuning ' + JSON.stringify(opts.tune) : '') + ')');
  lines.push('');
  lines.push('| difficulty / bot | runs | ended (count) | median level | median time | reached 20 | median time to 20 | lives lost | fish / food meals | ms per step |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  Object.keys(groups).forEach(function (k) {
    const g = groups[k], ends = {};
    g.forEach(function (r) { ends[r.end] = (ends[r.end] || 0) + 1; });
    const won = g.filter(function (r) { return r.level >= 20; });
    lines.push('| ' + k + ' | ' + g.length + ' | ' + Object.keys(ends).map(function (e) { return e + ' ' + ends[e]; }).join(', ') +
      ' | ' + median(g.map(function (r) { return r.level; })) + ' | ' + mmss(median(g.map(function (r) { return r.t; }))) +
      ' | ' + won.length + '/' + g.length + ' | ' + mmss(median(won.map(function (r) { return r.levelAt[19]; }))) +
      ' | ' + mean(g.map(function (r) { return 3 - r.lives; })).toFixed(1) +
      ' | ' + Math.round(mean(g.map(function (r) { return r.fish; }))) + ' / ' + Math.round(mean(g.map(function (r) { return r.food; }))) +
      ' | ' + mean(g.map(function (r) { return r.msPerStep; })).toFixed(2) + ' |');
  });

  // Seconds on each level (median over the runs that finished the level).
  lines.push('');
  lines.push('## Seconds spent on each level (median of runs that finished it)');
  lines.push('');
  const keys = Object.keys(groups);
  lines.push('| level | goal | ' + keys.join(' | ') + ' |');
  lines.push('|---|---|' + keys.map(function () { return '---'; }).join('|') + '|');
  const perLevel = {};
  keys.forEach(function (k) {
    perLevel[k] = [];
    for (let n = 1; n < 20; n++) {
      const v = groups[k].filter(function (r) { return r.levelAt[n] !== undefined && r.levelAt[n] !== null; })
        .map(function (r) { return r.levelAt[n] - r.levelAt[n - 1]; });
      perLevel[k].push(median(v));
    }
  });
  for (let n = 1; n < 20; n++) {
    lines.push('| ' + n + ' | ' + Math.round(D.GOALS[n - 1]) + ' | ' + keys.map(function (k) { const v = perLevel[k][n - 1]; return v === null ? '-' : Math.round(v); }).join(' | ') + ' |');
  }

  // Deaths: where and by what.
  lines.push('');
  lines.push('## Lives lost: what took them, and at which levels');
  lines.push('');
  keys.forEach(function (k) {
    const by = {}, at = {};
    groups[k].forEach(function (r) { r.deaths.forEach(function (d) { by[d.by] = (by[d.by] || 0) + 1; at[d.level] = (at[d.level] || 0) + 1; }); });
    const top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).slice(0, 6).map(function (x) { return x + ' ' + by[x]; });
    const lv = Object.keys(at).sort(function (a, b) { return a - b; }).map(function (x) { return 'L' + x + ':' + at[x]; });
    lines.push('- **' + k + '**: ' + (top.length ? top.join(', ') : 'none') + (lv.length ? ' — at ' + lv.join(' ') : ''));
  });

  // Flags against the targets in schematic.md.
  keys.forEach(function (k) {
    const g = groups[k], diff = g[0].diff, skill = g[0].skill;
    const won = g.filter(function (r) { return r.level >= 20; });
    const limit = (D.DIFFICULTY[diff] && D.DIFFICULTY[diff].limit) || D.CONFIG.TIME_LIMIT;
    if ((diff === 'medium' || diff === 'hard') && skill !== 'novice') {
      const t20 = median(won.map(function (r) { return r.levelAt[19]; }));
      if (won.length < g.length / 2) flags.push(k + ': only ' + won.length + '/' + g.length + ' runs reach level 20 (target: most average runs finish).');
      else if (t20 < 8 * 60) flags.push(k + ': level 20 in ' + mmss(t20) + ', faster than the 8-minute target.');
      else if (t20 > 15 * 60) flags.push(k + ': level 20 in ' + mmss(t20) + ', past the 15-minute target.');
    }
    const pl = perLevel[k].filter(function (v) { return v !== null; });
    const mid = median(pl);
    perLevel[k].forEach(function (v, i) {
      if (v !== null && mid && v > 2.2 * mid) flags.push(k + ': level ' + (i + 1) + ' takes ' + Math.round(v) + ' s, over twice the typical level (' + Math.round(mid) + ' s).');
      if (v !== null && mid && v < 0.35 * mid) flags.push(k + ': level ' + (i + 1) + ' takes ' + Math.round(v) + ' s, under a third of the typical level (' + Math.round(mid) + ' s).');
    });
    if (g.some(function (r) { return r.errors.length; })) flags.push(k + ': page errors: ' + g.map(function (r) { return r.errors.join(' | '); }).join(' | '));
    if (limit && diff !== 'calm') { /* the limit is reported in the summary; Easy and Calm stop at 5 minutes by design */ }
  });
  const lost = function (d, s) { const g = groups[d + ' / ' + s]; return g ? mean(g.map(function (r) { return 3 - r.lives; })) : null; };
  opts.skill.forEach(function (s) {
    const e = lost('easy', s), m = lost('medium', s), h = lost('hard', s);
    if (m !== null && h !== null && h + 0.25 < m) flags.push(s + ' bot loses fewer lives on hard (' + h.toFixed(1) + ') than on medium (' + m.toFixed(1) + ').');
    if (e !== null && m !== null && m + 0.25 < e) flags.push(s + ' bot loses fewer lives on medium (' + m.toFixed(1) + ') than on easy (' + e.toFixed(1) + ').');
  });
  lines.push('');
  lines.push('## Flags');
  lines.push('');
  lines.push(flags.length ? flags.map(function (f) { return '- ' + f; }).join('\n') : '- none: every measured target is met');
  return lines.join('\n');
}

// ---------- main ----------
(async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const D = gameData(opts.tune);
  const jobs = [];
  opts.diff.forEach(function (d) { opts.skill.forEach(function (s) { for (let i = 0; i < opts.runs; i++) jobs.push([d, s]); }); });
  const { chromium } = loadPlaywright();
  const { srv, url } = await serve();
  const runs = [];
  const t0 = Date.now();
  // A few browsers side by side: each runs its share of the jobs, one at a time.
  const workers = [];
  for (let w = 0; w < Math.max(1, opts.workers); w++) {
    workers.push((async function () {
      const browser = await launch(chromium);
      try {
        for (;;) {
          const job = jobs.shift();
          if (!job) break;
          const r = await playRun(browser, url, job[0], job[1], opts);
          runs.push(r);
          if (!opts.quiet) console.log(pad(r.diff + '/' + r.skill, 16) + ' ' + pad(r.end, 11) + ' level ' + pad(r.level, 3) + mmss(r.t) +
            '  lives lost ' + (3 - r.lives) + (r.deaths.length ? ' (' + r.deaths.map(function (d) { return d.by + ' L' + d.level; }).join(', ') + ')' : ''));
        }
      } finally { await browser.close(); }
    })());
  }
  await Promise.all(workers);
  srv.close();
  console.log('');
  console.log(report(runs, D, opts));
  console.log('');
  console.log('(' + runs.length + ' runs in ' + Math.round((Date.now() - t0) / 1000) + ' s of real time)');
  if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(runs, null, 1));
})();
