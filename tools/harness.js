// Shared by tools/playtest.js and tools/balance.js: load Playwright, serve this folder, launch Chromium,
// and read the game's data (js/species.js) the way the page does.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// The game's data (species, levels, fishLen, TUNING), loaded the way the page loads it, so checks use the same numbers.
function gameData(tuning) {
  const box = { window: tuning ? { FishTuning: tuning } : {} };
  require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'js/species.js'), 'utf8'), box);
  return box.window.FishData;
}

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

module.exports = { ROOT, gameData, loadPlaywright, serve, launch };
