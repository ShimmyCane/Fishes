/* Fishes — notes for feedback.
   Every note is kept on this device first (localStorage, with a cookie backup).
   A note is marked sent once the family database (fish_notes) has accepted it.
   Unsent notes go up on each new note and automatically when the family account
   signs in. Failures are shown on the page, never hidden. */
(function () {
  'use strict';

  var CFG = window.FishData.CONFIG;
  var COOKIE = 'fish_notes';
  var LS_KEY = 'fish_notes_v1';
  var MAX_NOTES = 50;        // on this device
  var COOKIE_NOTES = 8;      // backup copy in the cookie (cookies hold about 4 KB)
  var MAX_TEXT = 300;

  var db = {
    configured: !!(CFG.supabaseUrl && CFG.supabaseKey),
    state: 'off',            // off | ready | saving | saved | sign-in needed | failed
    message: ''
  };
  db.state = db.configured ? 'ready' : 'off';

  function readCookie() {
    try {
      var parts = document.cookie ? document.cookie.split('; ') : [];
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].indexOf(COOKIE + '=') === 0) {
          return JSON.parse(decodeURIComponent(parts[i].slice(COOKIE.length + 1)));
        }
      }
    } catch (e) { /* bad cookie: ignore */ }
    return null;
  }

  function writeCookie(list) {
    var value = encodeURIComponent(JSON.stringify(list.slice(0, COOKIE_NOTES)));
    document.cookie = COOKIE + '=' + value + '; max-age=31536000; path=/; SameSite=Lax';
  }

  // localStorage is the main copy; the cookie is only used if localStorage is empty or blocked.
  function load() {
    var list = null;
    try { list = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { list = null; }
    if (!Array.isArray(list)) list = readCookie();
    return Array.isArray(list) ? list : [];
  }

  function save(list) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
    try { writeCookie(list); } catch (e) { /* cookie blocked */ }
  }

  function clip(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  }

  function pending() {
    return load().filter(function (n) { return !n.sent; }).length;
  }

  function markSent(at) {
    var list = load();
    list.forEach(function (n) { if (n.at === at) n.sent = true; });
    save(list);
  }

  function signInNeeded() {
    var waiting = pending();
    db.state = 'sign-in needed';
    db.message = waiting + (waiting === 1 ? ' note is' : ' notes are') +
      ' on this device. Sign in to the family database in ⚙️ to send them.';
  }

  // Sends one note. Resolves true when the database accepted it.
  function post(token, note, canRetry) {
    var url = CFG.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/' + CFG.notesTable;
    db.state = 'saving';
    db.message = '';
    return fetch(url, {
      method: 'POST',
      headers: {
        'apikey': CFG.supabaseKey,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        note: note.text,
        level: note.level,
        size: Math.round(note.size * 10) / 10,
        seconds: note.seconds
      })
    }).then(function (res) {
      if (res.ok) {
        markSent(note.at);
        db.state = 'saved';
        db.message = 'Saved to the family database.';
        return true;
      }
      if ((res.status === 401 || res.status === 403) && canRetry) {
        return window.FishFamily.refresh().then(function (fresh) {
          if (fresh) return post(fresh, note, false);
          signInNeeded();
          return false;
        });
      }
      if (res.status === 401 || res.status === 403) { signInNeeded(); return false; }
      db.state = 'failed';
      db.message = 'Database returned ' + res.status + '. The note is kept on this device and will be sent again.';
      return false;
    }).catch(function (err) {
      db.state = 'failed';
      db.message = 'Could not reach the database (' + (err && err.message || 'network') + '). The note is kept on this device and will be sent again.';
      return false;
    });
  }

  // Sends every unsent note, oldest first. Resolves with how many were sent.
  // One send at a time: a second call while one is running shares its result, so no note is posted twice.
  var sending = null;
  function sendPending() {
    if (sending) return sending;
    sending = sendPendingOnce().then(function (n) { sending = null; return n; },
      function (err) { sending = null; throw err; });
    return sending;
  }

  function sendPendingOnce() {
    if (!db.configured) return Promise.resolve(0);
    var unsent = load().filter(function (n) { return !n.sent; })
      .sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    if (!unsent.length) {
      if (db.state !== 'failed') db.state = db.configured ? 'ready' : 'off';
      return Promise.resolve(0);
    }
    return window.FishFamily.token().then(function (token) {
      if (!token) { signInNeeded(); return 0; }
      return unsent.reduce(function (chain, note) {
        return chain.then(function (count) {
          return post(token, note, true).then(function (ok) { return count + (ok ? 1 : 0); });
        });
      }, Promise.resolve(0));
    });
  }

  window.FishNotes = {
    list: load,
    pending: pending,
    sendPending: sendPending,

    // info: { level, size, seconds }. The note is saved on this device first, then sent if signed in.
    add: function (text, info) {
      var clean = clip(text);
      if (!clean) return Promise.resolve({ ok: false, reason: 'empty' });
      var note = {
        at: new Date().toISOString(),
        text: clean,
        level: info.level,
        size: info.size,
        seconds: Math.round(info.seconds),
        sent: false
      };
      var list = load();
      list.unshift(note);
      save(list.slice(0, MAX_NOTES));
      return sendPending().then(function () {
        var stillUnsent = pending();
        return { ok: true, sent: !stillUnsent || (db.state === 'saved'), db: db.state, pending: stillUnsent };
      });
    },

    status: function () { return { state: db.state, message: db.message, configured: db.configured, pending: pending() }; },
    clip: clip
  };
})();
