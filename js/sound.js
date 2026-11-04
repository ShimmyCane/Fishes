/* Fishes — sound. Web Audio tones only (no sound files).
   The audio context is created on the first touch, because iPad Safari
   suspends audio until a user gesture. */
(function () {
  'use strict';

  var ctx = null;
  var KEY = 'fish_sound';

  function enabled() {
    try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; }
  }

  function setEnabled(on) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* private mode */ }
  }

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, when, slide) {
    var c = ensure();
    if (!c) return;
    var t = c.currentTime + (when || 0);
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }

  var SOUNDS = {
    eat: function () { tone(660, 0.08, 'triangle', 0.16, 0, 980); },
    grow: function () { [523, 659, 784].forEach(function (f, i) { tone(f, 0.16, 'triangle', 0.16, i * 0.07); }); },
    lock: function () { tone(180, 0.16, 'square', 0.07, 0); tone(150, 0.2, 'square', 0.07, 0.2); },
    hurt: function () { tone(300, 0.35, 'sawtooth', 0.12, 0, 90); },
    levelup: function () { [392, 523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.16, i * 0.09); }); },
    win: function () { [523, 659, 784, 1046, 784, 1046, 1318].forEach(function (f, i) { tone(f, 0.25, 'triangle', 0.17, i * 0.12); }); },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.3, 'sine', 0.15, i * 0.18); }); },
    click: function () { tone(520, 0.05, 'sine', 0.12, 0); }
  };

  window.FishSound = {
    unlock: function () { ensure(); },
    play: function (name) {
      if (!enabled() || !SOUNDS[name]) return;
      try { SOUNDS[name](); } catch (e) { /* audio is optional */ }
    },
    enabled: enabled,
    setEnabled: setEnabled
  };
})();
