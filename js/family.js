/* Fishes — family sign-in for the shared Family database (same project and
   family account as Expansion Wars). The password is sent only to Supabase and
   is never stored. The session tokens are kept on this device so the iPad stays
   signed in; signing out clears them. */
(function () {
  'use strict';

  var CFG = window.FishData.CONFIG;
  var KEY = 'fish_family_session';
  var TIMEOUT_MS = 8000;
  var listeners = [];
  var session = load();

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }

  function save(s) {
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch (e) { /* private mode: signed in for this page only */ }
  }

  function status() {
    return { signedIn: !!session, email: session ? session.email : '' };
  }

  function emit() { listeners.forEach(function (fn) { fn(status()); }); }

  function call(path, body, token) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(CFG.supabaseUrl.replace(/\/+$/, '') + path, {
      method: 'POST',
      signal: ctl ? ctl.signal : undefined,
      headers: {
        'apikey': CFG.supabaseKey,
        'Authorization': 'Bearer ' + (token || CFG.supabaseKey),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        clearTimeout(timer);
        if (!res.ok) {
          var err = new Error(json.error_description || json.msg || json.message || ('Sign-in failed (' + res.status + ')'));
          err.status = res.status;
          throw err;
        }
        return json;
      });
    }, function (err) {
      clearTimeout(timer);
      throw new Error('Could not reach the family database (' + (err && err.message || 'network') + ').');
    });
  }

  function remember(json, email) {
    session = {
      access: json.access_token,
      refresh: json.refresh_token,
      expires: Date.now() + (json.expires_in || 3600) * 1000 - 60000,
      email: email
    };
    save(session);
    emit();
  }

  function signIn(email, password) {
    return call('/auth/v1/token?grant_type=password', { email: email, password: password }).then(function (json) {
      remember(json, email);
      return status();
    });
  }

  // A refused refresh (400/401) ends the session. A network problem keeps it for next time.
  function refresh() {
    if (!session || !session.refresh) return Promise.resolve(null);
    return call('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh }).then(function (json) {
      remember(json, session.email);
      return session.access;
    }, function (err) {
      if (err && err.status) { session = null; save(null); emit(); }
      return null;
    });
  }

  // A valid access token for the database, or null when not signed in.
  function token() {
    if (!session) return Promise.resolve(null);
    if (Date.now() < session.expires) return Promise.resolve(session.access);
    return refresh();
  }

  function signOut() {
    session = null;
    save(null);
    emit();
  }

  window.FishFamily = {
    signIn: signIn,
    signOut: signOut,
    token: token,
    refresh: refresh,
    status: status,
    onChange: function (fn) { listeners.push(fn); fn(status()); }
  };
})();
