/* Fishes — how the fish look (v0.13).
   A realistic renderer for every fish: a body drawn from its real body plan (reef fish, tuna, shark, billfish, eel,
   flatfish, sunfish, ray...), the right tail and fins, natural colours (dark back, pale belly), the species' own
   markings, and a swimming motion (tail beat, rowing fins, a gentle body wave) that speeds up as the fish swims faster.

   It only draws. Gameplay never reads it: sizes, shapes for the rules (sp.shape) and colours used elsewhere stay in
   js/species.js. The look of a species is LOOKS[id] below, merged over defaults from its shape and colours, so a new
   species looks reasonable with no entry, and an entry makes it accurate.

   FishArt.draw(ctx, sp, len, o) draws sp in local space (nose to +x, centre at 0,0, about len long) and returns true,
   or false for shapes it does not handle (creatures and items stay in game.js).
   o: { t: seconds, ph: swim phase in beats, sw: swim effort 0-1.5, lw: outline width, px: length on screen in pixels }.
   FishArt.beat(speed, len) is the tail beats a second for a fish swimming at speed (game.js advances ph with it). */
(function () {
  'use strict';
  var TAU = Math.PI * 2;

  // ---------- colour helpers ----------
  var rgbCache = {};
  function rgb(hex) {
    var c = rgbCache[hex];
    if (c) return c;
    var h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    c = rgbCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return c;
  }
  function mix(a, b, t) {
    var p = rgb(a), q = rgb(b);
    return 'rgb(' + Math.round(p[0] + (q[0] - p[0]) * t) + ',' + Math.round(p[1] + (q[1] - p[1]) * t) + ',' + Math.round(p[2] + (q[2] - p[2]) * t) + ')';
  }
  function hexOf(s) {   // mix() returns rgb(); keep hex for later mixing
    if (s.charAt(0) === '#') return s;
    var m = s.match(/\d+/g);
    return '#' + ((1 << 24) | (m[0] << 16) | (m[1] << 8) | +m[2]).toString(16).slice(1);
  }
  function shade(hex, t) { return hexOf(t < 0 ? mix(hex, '#05080c', -t) : mix(hex, '#ffffff', t)); }
  function rgba(hex, a) { var p = rgb(hex); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; }
  function hash(i, k) { var x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }

  // ---------- looks: realistic data per species ----------
  // body: fish | puffer | angler | eel | oar | shark | whale | ray | mola | flat | jelly | turtle
  // Profile: hr (depth / length), nose (0.35 blunt .. 0.9 pointed), peak (where the body is deepest, 0 tail - 1 nose),
  //   ped (tail-stalk depth), hump. Fins: tail, dorsal, anal, pect, finH. Head: snout, mouth, eye (size), iris, gills,
  //   barbels. Colours: back, col (flank), belly, fin, tailCol, tip. pat: markings (see drawPattern).
  var LOOKS = {
    // Tier 1
    guppy: { back: '#7d8a6e', col: '#c9c6a8', belly: '#efe9d8', tail: 'fan', tailCol: '#ff7a2f', fin: '#ffb070', finH: 0.7,
      pat: [{ t: 'eyespot', x: -0.3, y: 0.1, r: 0.14, c: '#16181c', ring: '#ff9a3d' }, { t: 'blotch', x: 0.0, y: 0.2, r: 0.16, c: '#3a7bd5', a: 0.55 }, { t: 'blotch', x: -0.5, y: -0.25, r: 0.12, c: '#ff8a3d', a: 0.7 }] },
    neon: { back: '#56624f', col: '#7f8f8a', belly: '#e8eaea', tail: 'fork', tailCol: '#cfd8d8', fin: '#d8e0e0', alpha: 0.95,
      pat: [{ t: 'hstripe', y: -0.12, w: 0.24, c: '#27d3ff', x0: -0.75, x1: 0.75, glow: true }, { t: 'hstripe', y: 0.32, w: 0.34, c: '#e3263a', x0: -0.75, x1: 0.05 }] },
    zebrafish: { back: '#8a8054', col: '#e9d8a0', belly: '#f4ecd2', tail: 'fork', fin: '#e9d8a0',
      pat: [{ t: 'hstripe', y: -0.36, w: 0.14, c: '#2b4fa8' }, { t: 'hstripe', y: 0.02, w: 0.16, c: '#2b4fa8' }, { t: 'hstripe', y: 0.38, w: 0.12, c: '#2b4fa8' }] },
    turtle: { body: 'turtle', col: '#6b7a3a', back: '#4a5a2a', belly: '#e8dcb0', fin: '#5a6a3a', skin: '#8a8a5a' },

    // Tier 2
    clownfish: { back: '#e2560a', col: '#ff7a1a', belly: '#ff9a4a', fin: '#ff7a1a', tip: '#111111', tail: 'round', hr: 0.5, nose: 0.45,
      pat: [{ t: 'bands', at: [0.42, -0.02, -0.66], w: [0.13, 0.17, 0.09], c: '#ffffff', edge: '#121212' }] },
    goby: { back: '#7a6646', col: '#c8b48a', belly: '#ece0c4', fin: '#bfa77a', tail: 'round', dorsal: 'two', hr: 0.24, nose: 0.4, eye: 1.3, eyeY: -0.55,
      pat: [{ t: 'spots', c: '#4f3f2a', n: 16, r: 0.12, a: 0.7 }, { t: 'dotrow', y: 0.05, c: '#3a2e1e', n: 5, r: 0.16 }] },
    blenny: { back: '#5d6a3a', col: '#8a9a5a', belly: '#d8d8b0', fin: '#7a8a50', tail: 'round', dorsal: 'long', anal: 'long', hr: 0.26, nose: 0.35, cirri: true,
      pat: [{ t: 'mottle', c: '#3f4a24', n: 6 }] },
    dottyback: { back: '#5a2a9a', col: '#7a3fc0', belly: '#9a5ad0', fin: '#7a3fc0', tail: 'round', dorsal: 'long', anal: 'long', hr: 0.3,
      pat: [{ t: 'rear', x: -0.1, c: '#ffd02a' }] },

    // Tier 3
    wrasse: { back: '#9ab8e8', col: '#e8f0ff', belly: '#f6f8ff', fin: '#c8d8f8', tail: 'truncate', dorsal: 'long', anal: 'long', hr: 0.24,
      pat: [{ t: 'wedge', c: '#141418', y: 0, w0: 0.08, w1: 0.42 }, { t: 'rear', x: -0.3, c: '#2d6fd0', a: 0.75 }] },
    herring: { back: '#2f5a74', col: '#a8bccc', belly: '#eef3f6', fin: '#b8c8d4', tail: 'deep', hr: 0.24, nose: 0.6, shine: 0.35 },
    sardine: { back: '#24546e', col: '#a2b6c6', belly: '#eef2f6', fin: '#b0c4d0', tail: 'deep', hr: 0.24, shine: 0.35,
      pat: [{ t: 'dotrow', y: -0.18, c: '#1a3446', n: 6, r: 0.1 }] },
    hawkfish: { back: '#b81e18', col: '#e8302a', belly: '#f26a50', fin: '#e8402a', tip: '#1a1a1a', tail: 'truncate', dorsal: 'spiny', hr: 0.34, nose: 0.5, cirri: true,
      pat: [{ t: 'hstripe', y: -0.82, w: 0.16, c: '#1a1a1a', x0: -0.6, x1: 0.4 }] },
    moon: { body: 'jelly', col: '#dfeaf5', fin: '#c98fc0' },

    // Tier 4
    anchovy: { back: '#3f6e6a', col: '#9ab8b4', belly: '#e6eef0', fin: '#b8cccc', tail: 'deep', hr: 0.2, nose: 0.55, mouth: 'big', alpha: 0.92,
      pat: [{ t: 'hstripe', y: 0.02, w: 0.16, c: '#e8eef6' }] },
    pufferfish: { body: 'puffer', back: '#9a8a54', col: '#d8c890', belly: '#f6f0dc', fin: '#c8b070',
      pat: [{ t: 'spots', c: '#3a2e18', n: 14, r: 0.07, y1: 0.2 }, { t: 'bars', c: '#5a4a28', n: 3, top: -0.1, a: 0.5 }] },
    butterflyfish: { back: '#f0c81a', col: '#ffe14a', belly: '#fff2a8', fin: '#ffd21a', tip: '#ffffff', tail: 'truncate', hr: 0.72, nose: 0.75, snout: 'short',
      dorsal: 'deep', anal: 'deep', pat: [{ t: 'mask', x: 0.62, w: 0.13, c: '#121212' }, { t: 'eyespot', x: -0.42, y: -0.42, r: 0.18, c: '#141414', ring: '#fff6c0' }] },
    sergeant: { back: '#e8d84a', col: '#e8ecdf', belly: '#f4f6ef', fin: '#d8dcc8', tail: 'fork', hr: 0.55, nose: 0.55,
      pat: [{ t: 'bands', at: [0.42, 0.16, -0.1, -0.36, -0.6], w: 0.08, c: '#1a1a1a', a: 0.85 }] },
    cardinalfish: { back: '#a8281a', col: '#d8402a', belly: '#f07a5a', fin: '#d84a30', tail: 'fork', dorsal: 'two', hr: 0.4, eye: 1.6, alpha: 0.9 },

    // Tier 5
    parrotfish: { back: '#1a9a7a', col: '#2fbf9a', belly: '#9ae0c8', fin: '#ff9a7a', tailCol: '#ff8a6a', tail: 'lyre', hr: 0.4, nose: 0.4, snout: 'beak', dorsal: 'long', anal: 'long',
      pat: [{ t: 'scales', c: '#ff9a8a' }, { t: 'hstripe', y: 0.55, w: 0.1, c: '#ff8aa0', x0: 0.3, x1: 1 }] },
    damsel: { back: '#1a3fc8', col: '#2f7fff', belly: '#7ab0ff', fin: '#2f6ff0', tail: 'fork', hr: 0.5, nose: 0.5, shine: 0.3 },
    moray: { body: 'eel', col: '#c8b070', back: '#8a7040', fin: '#b8a060', mouth: 'teeth', pat: [{ t: 'spots', c: '#2a1e10', n: 40, r: 0.35 }] },
    scorpionfish: { back: '#6a2a1a', col: '#a8503a', belly: '#d8907a', fin: '#b8604a', tail: 'round', dorsal: 'spiny', pect: 'fan', hr: 0.4, nose: 0.4, mouth: 'big', cirri: true,
      pat: [{ t: 'mottle', c: '#e0a070', n: 7 }, { t: 'mottle', c: '#4a1a10', n: 6 }] },
    seachub: { back: '#4a5a68', col: '#8a9aa8', belly: '#dce2e6', fin: '#7a8a98', tail: 'fork', hr: 0.42, nose: 0.45,
      pat: [{ t: 'hstripe', y: -0.2, w: 0.04, c: '#c8a85a', a: 0.6 }, { t: 'hstripe', y: 0.15, w: 0.04, c: '#c8a85a', a: 0.6 }] },

    // Tier 6
    angelfish: { back: '#1a6a9a', col: '#3aa0c8', belly: '#f2d23a', fin: '#2a7ab0', tip: '#5fd0ff', tailCol: '#ffd21a', tail: 'truncate', hr: 0.82, nose: 0.5,
      dorsal: 'trail', anal: 'trail', pat: [{ t: 'scales', c: '#ffe46a' }, { t: 'blotch', x: 0.58, y: -0.62, r: 0.16, c: '#1a2a8a' }] },
    tang: { back: '#1238b8', col: '#1f5fe0', belly: '#4a86f0', fin: '#1a3fb0', tip: '#111a40', tailCol: '#ffd21a', tail: 'lunate', hr: 0.6, nose: 0.45, dorsal: 'long', anal: 'long',
      pat: [{ t: 'palette', c: '#0a0f24' }] },
    lionfish: { back: '#a03a22', col: '#f2e6d8', belly: '#f8efe4', fin: '#e8c8b0', tail: 'round', dorsal: 'lion', pect: 'fan', hr: 0.36, nose: 0.45, cirri: true,
      pat: [{ t: 'bands', at: [0.62, 0.45, 0.28, 0.1, -0.08, -0.26, -0.44, -0.62], w: 0.08, c: '#a8341e' }] },
    trumpetfish: { back: '#8a6a20', col: '#c8a040', belly: '#e8d08a', fin: '#b8902e', tail: 'round', dorsal: 'rear', anal: 'rear', hr: 0.12, nose: 0.9, snout: 'tube', barbels: 1,
      pat: [{ t: 'bands', at: [0.4, 0.15, -0.1, -0.35], w: 0.05, c: '#f2e6b0', a: 0.5 }] },
    porcupinefish: { body: 'puffer', back: '#a89a78', col: '#d8c8a0', belly: '#f4ecd8', fin: '#c8b890', spines: 2,
      pat: [{ t: 'spots', c: '#1e1e1e', n: 16, r: 0.08 }] },

    // Tier 7
    mackerel: { back: '#1f5f66', col: '#9ab8c0', belly: '#f2f6f8', fin: '#7aa0a8', tail: 'deep', dorsal: 'two', finlets: true, hr: 0.22, nose: 0.7, shine: 0.4,
      pat: [{ t: 'waves', c: '#0e2226' }] },
    triggerfish: { back: '#4a5058', col: '#7a8088', belly: '#a8acb0', fin: '#6a7078', tail: 'lyre', dorsal: 'trigger', anal: 'long', hr: 0.6, nose: 0.6, eyeX: 0.5, eyeY: -0.45,
      pat: [{ t: 'hstripe', y: -0.4, w: 0.04, c: '#7ab0d8', a: 0.5, x0: 0.2, x1: 0.8 }] },
    bonito: { back: '#1f3f6a', col: '#8aa0b8', belly: '#eef2f6', fin: '#2f4f78', tail: 'lunate', hr: 0.27, shine: 0.35,
      pat: [{ t: 'obstripes', c: '#152a48', n: 7 }] },
    sweetlips: { back: '#c8c4b8', col: '#f4f2ea', belly: '#fbfaf6', fin: '#ffd23a', tailCol: '#ffd23a', tail: 'truncate', hr: 0.4, nose: 0.4, mouth: 'lips',
      pat: [{ t: 'hstripe', y: -0.55, w: 0.12, c: '#151515' }, { t: 'hstripe', y: -0.15, w: 0.13, c: '#151515' }, { t: 'hstripe', y: 0.25, w: 0.12, c: '#151515' }, { t: 'hstripe', y: 0.62, w: 0.1, c: '#151515' }] },
    snook: { back: '#7a7450', col: '#d0c8a0', belly: '#f2eedc', fin: '#c8b86a', tail: 'fork', dorsal: 'two', hr: 0.24, nose: 0.75, mouth: 'under',
      pat: [{ t: 'lline', c: '#121212', w: 0.06 }] },

    // Tier 8
    mullet: { back: '#4a5660', col: '#a8b0b6', belly: '#eceeee', fin: '#8a9298', tail: 'fork', dorsal: 'two', hr: 0.24, nose: 0.38,
      pat: [{ t: 'hstripe', y: -0.3, w: 0.05, c: '#4a5660', a: 0.5 }, { t: 'hstripe', y: 0, w: 0.05, c: '#4a5660', a: 0.5 }, { t: 'hstripe', y: 0.3, w: 0.05, c: '#4a5660', a: 0.4 }] },
    rockfish: { back: '#a03818', col: '#d8582a', belly: '#f0a07a', fin: '#d8602a', tail: 'truncate', dorsal: 'spiny', hr: 0.38, nose: 0.5, mouth: 'big',
      pat: [{ t: 'mottle', c: '#f3c4a8', n: 6 }] },
    snapper: { back: '#c83a3a', col: '#ea6a62', belly: '#f8c8c0', fin: '#e85050', tail: 'fork', dorsal: 'spiny', hr: 0.4, nose: 0.65, iris: '#e83030' },
    bluefish: { back: '#2f5a7a', col: '#90a8b8', belly: '#eef2f4', fin: '#5a7a90', tail: 'fork', dorsal: 'two', hr: 0.26, nose: 0.65, mouth: 'teeth',
      pat: [{ t: 'blotch', x: 0.28, y: 0.12, r: 0.12, c: '#121a22' }] },
    grouper: { back: '#6a4a2a', col: '#c8a878', belly: '#e8d8b8', fin: '#a8885a', tail: 'round', dorsal: 'spiny', hr: 0.4, nose: 0.45, mouth: 'big',
      pat: [{ t: 'bars', c: '#4a3018', n: 5, top: 0.8, a: 0.7 }, { t: 'blotch', x: -0.62, y: -0.4, r: 0.18, c: '#141008' }, { t: 'mask', x: 0.7, w: 0.05, c: '#4a3018', a: 0.7 }] },

    // Tier 9
    jack: { back: '#4a6a62', col: '#c8d0c8', belly: '#eef2ee', fin: '#e0c040', tail: 'deep', dorsal: 'two', anal: 'tuna', hr: 0.4, nose: 0.5, hump: 0.12, scutes: true,
      pat: [{ t: 'blotch', x: 0.5, y: -0.2, r: 0.07, c: '#101010' }] },
    pompano: { back: '#8a9aa6', col: '#d8e0e8', belly: '#f2e690', fin: '#f0d060', tail: 'deep', anal: 'tuna', hr: 0.5, nose: 0.4, shine: 0.4 },
    amberjack: { back: '#6a5a3a', col: '#b8b098', belly: '#eeeae0', fin: '#a89058', tail: 'deep', dorsal: 'two', hr: 0.28, nose: 0.62,
      pat: [{ t: 'hstripe', y: -0.1, w: 0.1, c: '#d8a040', a: 0.75 }, { t: 'mask', x: 0.68, w: 0.05, c: '#3a2a12', a: 0.8, top: true }] },
    trevally: { back: '#5a7a72', col: '#b8c8c0', belly: '#eef2ee', fin: '#d8c860', tail: 'deep', dorsal: 'two', anal: 'tuna', hr: 0.38, nose: 0.5, hump: 0.08, scutes: true },
    barracuda: { back: '#3a4a5a', col: '#b8c4d0', belly: '#eef2f6', fin: '#7a8a9a', tail: 'fork', dorsal: 'two', hr: 0.17, nose: 0.85, mouth: 'under', eye: 1.1, shine: 0.35,
      pat: [{ t: 'bars', c: '#2a3440', n: 18, top: -0.15, a: 0.55 }, { t: 'spots', c: '#141a20', n: 10, r: 0.08, x0: -0.7, x1: -0.1, y0: 0.15, y1: 0.6 }] },

    // Tier 10
    mahi: { back: '#1f8a7a', col: '#b8c83a', belly: '#f2e04a', fin: '#2a9a8a', tail: 'deep', dorsal: 'long', anal: 'long', hr: 0.32, nose: 0.3, hump: 0.25,
      pat: [{ t: 'spots', c: '#2a8ad8', n: 18, r: 0.07 }] },
    bonefish: { back: '#5a6a6a', col: '#c8ccc4', belly: '#f2f2ee', fin: '#a8aca4', tail: 'deep', hr: 0.24, nose: 0.6, snout: 'over',
      pat: [{ t: 'hstripe', y: -0.4, w: 0.04, c: '#5a6a6a', a: 0.6 }, { t: 'hstripe', y: -0.15, w: 0.04, c: '#5a6a6a', a: 0.6 }] },
    yellowfin: { back: '#18284a', col: '#9aa8b8', belly: '#eef2f6', fin: '#f2c81a', tail: 'lunate', dorsal: 'yellowfin', anal: 'yellowfin', finlets: '#f2c81a', hr: 0.27, shine: 0.35,
      pat: [{ t: 'hstripe', y: -0.15, w: 0.1, c: '#f2c81a', a: 0.7 }] },
    bluefin: { back: '#141f3a', col: '#7a8aa0', belly: '#f2f4f8', fin: '#23345a', tail: 'lunate', finlets: '#f2c81a', hr: 0.3, nose: 0.7, shine: 0.35, keel: true },

    // Tier 11
    rainbowrunner: { back: '#1f5aa8', col: '#7ab0d8', belly: '#e8f0f4', fin: '#d8c84a', tail: 'deep', hr: 0.2, nose: 0.75,
      pat: [{ t: 'hstripe', y: -0.15, w: 0.1, c: '#9ad8f8' }, { t: 'hstripe', y: 0.05, w: 0.1, c: '#f2d66b' }, { t: 'hstripe', y: 0.22, w: 0.08, c: '#9ad8f8' }] },
    cobia: { back: '#3a2a1e', col: '#6b4f3a', belly: '#e8dcc8', fin: '#4a3a2a', tail: 'lunate', dorsal: 'cobia', hr: 0.22, nose: 0.5, snout: 'flat',
      pat: [{ t: 'hstripe', y: -0.05, w: 0.1, c: '#e8dcc8' }, { t: 'hstripe', y: 0.18, w: 0.08, c: '#2a1e14' }] },
    dogtooth: { back: '#1a2a48', col: '#8a9ab0', belly: '#eef2f6', fin: '#2a3a58', tail: 'lunate', finlets: '#c8d0d8', hr: 0.27, mouth: 'teeth', shine: 0.3 },
    sailfish: { body: 'fish', back: '#13306a', col: '#7a90b8', belly: '#eef2f6', fin: '#2a4a9a', tail: 'lunate', dorsal: 'sail', snout: 'bill', hr: 0.18, nose: 0.8,
      pat: [{ t: 'bars', c: '#a8c8f0', n: 12, top: 0.4, a: 0.55 }] },
    reefshark: { body: 'shark', back: '#6e7c8a', col: '#97a4b0', belly: '#f4f6f8', fin: '#6e7c8a', tip: '#1e2328' },

    // Tier 12
    seabream: { back: '#7a8a96', col: '#c8d0d4', belly: '#eef0f0', fin: '#9aa4aa', tail: 'fork', dorsal: 'spiny', hr: 0.45, nose: 0.5,
      pat: [{ t: 'mask', x: 0.78, w: 0.06, c: '#e8b830', top: true }, { t: 'blotch', x: 0.42, y: -0.35, r: 0.1, c: '#2a2a30' }] },
    permit: { back: '#4a5660', col: '#b7c4cc', belly: '#eef0f2', fin: '#3a4048', tail: 'deep', anal: 'tuna', hr: 0.55, nose: 0.38, shine: 0.4 },
    wahoo: { back: '#1a4a6a', col: '#7ab0c8', belly: '#eef4f8', fin: '#1a4a6a', tail: 'lunate', dorsal: 'long', hr: 0.15, nose: 0.85, snout: 'beak2',
      pat: [{ t: 'bars', c: '#1a3a7a', n: 22, top: 0.45, a: 0.75 }] },
    marlin: { back: '#162f5a', col: '#5a7ab0', belly: '#eef2f6', fin: '#22408a', tail: 'lunate', dorsal: 'tall', snout: 'bill', hr: 0.2, nose: 0.8,
      pat: [{ t: 'bars', c: '#a8d0f8', n: 12, top: 0.5, a: 0.7 }] },

    // Tier 13
    lanternfish: { back: '#1e2a3a', col: '#5a6a7a', belly: '#b8c4d0', fin: '#4a5a6a', tail: 'fork', hr: 0.3, nose: 0.35, eye: 1.8, shine: 0.45,
      pat: [{ t: 'photo', c: '#a8f0ff' }] },
    hatchetfish: { back: '#5a6a7a', col: '#c8d4dc', belly: '#eef4f8', fin: '#a8b8c0', tail: 'fork', hr: 0.75, nose: 0.4, peak: 0.6, botK: 1.35, topK: 0.6, eye: 1.8, eyeY: -0.7, shine: 0.6,
      pat: [{ t: 'photo', c: '#a8f0ff', y: 0.75 }] },
    lookdown: { back: '#8a9aa6', col: '#d4dee6', belly: '#f2f6f8', fin: '#b8c4cc', tail: 'deep', dorsal: 'banner', anal: 'tuna', hr: 0.82, nose: 0.3, peak: 0.42, eyeX: 0.45, eyeY: 0.1, shine: 0.6 },
    opah: { back: '#3a4a7a', col: '#c87a6a', belly: '#e8b8a0', fin: '#e8302a', tail: 'lunate', dorsal: 'trail', hr: 0.68, nose: 0.5,
      pat: [{ t: 'spots', c: '#f8f0e0', n: 22, r: 0.07 }] },
    snakemackerel: { back: '#2a2a32', col: '#5a5e6a', belly: '#9aa0aa', fin: '#2a2a32', tail: 'fork', dorsal: 'two', finlets: true, hr: 0.14, nose: 0.85, mouth: 'fangs', eye: 1.3 },

    // Tier 14
    escolar: { back: '#241a20', col: '#4a3a40', belly: '#6a5a60', fin: '#2a2024', tail: 'fork', dorsal: 'two', finlets: true, hr: 0.24, eye: 1.4 },
    sunfish: { body: 'mola', back: '#7a8a9a', col: '#b9c6d6', belly: '#e8eef4', fin: '#8a9aaa' },
    anglerfish: { body: 'angler', back: '#2a2420', col: '#4a3e34', belly: '#6a5a4a', fin: '#3a302a' },
    lancetfish: { back: '#5a6a80', col: '#b6c0d0', belly: '#e8ecf2', fin: '#3a4a60', tail: 'fork', dorsal: 'sail', hr: 0.12, nose: 0.85, mouth: 'fangs', shine: 0.5 },

    // Tier 15
    pomfret: { back: '#3a4048', col: '#8a9098', belly: '#c8ccd0', fin: '#3a4048', tail: 'deep', dorsal: 'long', anal: 'long', hr: 0.55, nose: 0.35, shine: 0.4 },
    sablefish: { back: '#2a3038', col: '#4f5864', belly: '#a8b0b8', fin: '#2a3038', tail: 'fork', dorsal: 'two', hr: 0.22, nose: 0.55 },
    thresher: { body: 'shark', back: '#5a5a7a', col: '#8a8aa8', belly: '#f2f2f6', fin: '#5a5a7a', tail: 'thresher', eye: 1.6 },
    swordfish: { back: '#2a2a32', col: '#6a6058', belly: '#c8c0b8', fin: '#2a2a32', tail: 'lunate', dorsal: 'sword', snout: 'sword', hr: 0.2, nose: 0.8, eye: 1.4, keel: true },

    // Tier 16
    oilfish: { back: '#2a221e', col: '#5a4a40', belly: '#8a7a6a', fin: '#2a221e', tail: 'fork', dorsal: 'two', finlets: true, hr: 0.22, eye: 1.3,
      pat: [{ t: 'scales', c: '#2a221e' }] },
    cuskeel: { body: 'eel', col: '#c8a08a', back: '#8a6a5a', fin: '#b89a8a', taper: 0.55, barbels: 2 },
    hammerhead: { body: 'shark', back: '#6a6a5a', col: '#9a9a88', belly: '#f2f2ec', fin: '#6a6a5a', snout: 'hammer', dorsal: 'tallshark' },
    gulper: { body: 'eel', col: '#1a1a22', back: '#0e0e14', fin: '#2a2a36', mouth: 'gulper', glowTip: '#ff7aa0' },

    // Tier 17
    viperfish: { back: '#1a2a3a', col: '#5a7a8a', belly: '#9ab0c0', fin: '#1a2a3a', tail: 'fork', dorsal: 'viper', hr: 0.14, nose: 0.4, mouth: 'fangs', eye: 1.4,
      pat: [{ t: 'photo', c: '#7ae8ff' }, { t: 'scales', c: '#2a3a4a' }] },
    tripodfish: { back: '#3a3440', col: '#7a7480', belly: '#b8b4bc', fin: '#5a5460', tail: 'fork', hr: 0.16, nose: 0.5, eye: 0.8, tripod: true },
    coelacanth: { back: '#1e2a5a', col: '#3a4a8a', belly: '#6a7ab0', fin: '#2a3a7a', tail: 'lobe3', pect: 'lobe', dorsal: 'two', anal: 'lobe', hr: 0.3, nose: 0.45, eye: 1.3, iris: '#d8f040',
      pat: [{ t: 'spots', c: '#e8eef8', n: 18, r: 0.12, a: 0.85 }] },
    oarfish: { body: 'oar', col: '#e6e9f7', fin: '#ff4a4a', pat: [{ t: 'streaks', c: '#3a4a6a' }] },
    frilled: { body: 'eel', col: '#6a4a40', back: '#4a3028', fin: '#5a3a30', taper: 0.7, mouth: 'teeth', frill: true },

    // Tier 18
    goblin: { body: 'shark', back: '#c88a90', col: '#e8a8ae', belly: '#f6d4d8', fin: '#d8949a', snout: 'goblin', hr: 0.2, eye: 0.7 },
    megamouth: { body: 'shark', back: '#3a3a44', col: '#5a5a66', belly: '#a8a8b4', fin: '#3a3a44', snout: 'mega', nose: 0.3, hr: 0.28, mouth: 'mega' },
    sixgill: { body: 'shark', back: '#4a4038', col: '#6b5d52', belly: '#a89a8e', fin: '#4a4038', gills: 6, dorsal: 'rear', eye: 1.3, iris: '#3ac88a' },
    whiteshark: { body: 'shark', back: '#4f5a66', col: '#8996a3', belly: '#fbfcfd', fin: '#4f5a66', hr: 0.27, nose: 0.75, belt: true, tail: 'lunateShark' },

    // Tier 19
    greenland: { body: 'shark', back: '#3a3a34', col: '#5a5a52', belly: '#8a8a80', fin: '#3a3a34', hr: 0.24, nose: 0.5, dorsal: 'lowshark', eye: 0.8, iris: '#e8f0f0' },
    bluemarlin: { back: '#0f2a5a', col: '#3a6aa8', belly: '#eef2f8', fin: '#1a3a7a', tail: 'lunate', dorsal: 'tall', snout: 'bill', hr: 0.22, nose: 0.8,
      pat: [{ t: 'bars', c: '#9ac8f8', n: 14, top: 0.5, a: 0.6 }] },
    sandtiger: { body: 'shark', back: '#8a7a5a', col: '#b0a58a', belly: '#e8e0d0', fin: '#8a7a5a', dorsal: 'twinshark', mouth: 'ragged',
      pat: [{ t: 'spots', c: '#7a4a2a', n: 18, r: 0.08, y1: 0.2 }] },

    // Tier 20
    basking: { body: 'shark', back: '#4a4a4a', col: '#6a6a68', belly: '#9a9a96', fin: '#4a4a4a', gills: 'huge', snout: 'basking', hr: 0.26, eye: 0.5, mouth: 'mega' },
    whaleshark: { body: 'whale', back: '#2a3a52', col: '#4a5e7a', belly: '#e8eef4', fin: '#2a3a52', pat: [{ t: 'grid', c: '#f2f6fa' }] },
    giantsunfish: { body: 'mola', back: '#6a7a8a', col: '#a8b8c8', belly: '#e0e8ee', fin: '#7a8a9a' },

    // Background food fish
    squid: { body: 'squid' },

    // Forms you can evolve into (a selection made accurate; the rest take their colours and shape from species.js)
    betta: { back: '#7a1018', col: '#c0392b', belly: '#d85a4a', fin: '#8e44ad', tailCol: '#a0306a', tail: 'veil', dorsal: 'veil', anal: 'veil', hr: 0.3, shine: 0.45 },
    danio: { back: '#7a8aa0', col: '#d8e2f0', belly: '#f2f4f8', fin: '#ffb3c1', tail: 'fork', hr: 0.24, shine: 0.5, pat: [{ t: 'hstripe', y: 0.1, w: 0.12, c: '#ff8aa0', x0: -0.7, x1: 0.2 }] },
    platy: { back: '#d8601a', col: '#ff8a3d', belly: '#ffc070', fin: '#ffc36b', tail: 'truncate', hr: 0.42 },
    swordtail: { back: '#c84a2a', col: '#ff6b4a', belly: '#ffa07a', fin: '#ffd166', tail: 'sword', tip: '#1a1a1a', hr: 0.3, pat: [{ t: 'hstripe', y: 0, w: 0.1, c: '#b8302a' }] },
    molly: { back: '#14161c', col: '#2a2e38', belly: '#3a404c', fin: '#2a2e38', tail: 'round', dorsal: 'sail', hr: 0.36 },
    mudskipper: { back: '#5a4a32', col: '#8a7a5a', belly: '#c8b890', fin: '#5f9ad0', tail: 'round', dorsal: 'two', hr: 0.22, nose: 0.3, eye: 1.6, eyeY: -0.95, pect: 'lobe',
      pat: [{ t: 'spots', c: '#7ac0e8', n: 14, r: 0.07 }, { t: 'mottle', c: '#3a2e1e', n: 5 }] },
    sculpin: { back: '#4a3a2a', col: '#8a6b4a', belly: '#d8c0a0', fin: '#7a5a3a', tail: 'round', dorsal: 'two', pect: 'fan', hr: 0.34, nose: 0.3, peak: 0.75, mouth: 'big', cirri: true,
      pat: [{ t: 'mottle', c: '#2a1e14', n: 7 }] },
    gunnel: { body: 'eel', col: '#b0845a', back: '#7a5a3a', fin: '#9a7048', pat: [{ t: 'dotrow', c: '#1e140c', n: 11, y: -0.6, r: 0.4 }] },
    weever: { back: '#8a7a5a', col: '#d8c49a', belly: '#f2e8d4', fin: '#c8b48a', tail: 'truncate', dorsal: 'two', hr: 0.22, eyeY: -0.7, mouth: 'up',
      pat: [{ t: 'spine', c: '#141414' }] },
    dragonet: { back: '#a85a1a', col: '#e0a03a', belly: '#f2d07a', fin: '#3fa9e0', tail: 'round', dorsal: 'sail', hr: 0.2, eyeY: -0.8,
      pat: [{ t: 'spots', c: '#3fa9e0', n: 16, r: 0.1 }] },
    flounder: { body: 'flat', back: '#6a5a40', col: '#a08868', belly: '#c8b490', fin: '#8a7454', pat: [{ t: 'spots', c: '#d8a050', n: 14, r: 0.1 }, { t: 'mottle', c: '#4a3a24', n: 6 }] },
    halibut: { body: 'flat', back: '#4a3e30', col: '#7a6a58', belly: '#a0907c', fin: '#5a4a3a', pat: [{ t: 'mottle', c: '#2e2418', n: 8 }] },
    redmullet: { back: '#d0603a', col: '#f08a6b', belly: '#ffe0c8', fin: '#ffd0a8', tail: 'fork', dorsal: 'two', hr: 0.26, nose: 0.4, barbels: 2,
      pat: [{ t: 'hstripe', y: 0, w: 0.08, c: '#ffd23a', a: 0.7 }] },
    hogfish: { back: '#c87a6a', col: '#f0b8a0', belly: '#f8e0d4', fin: '#d9573f', tail: 'lyre', dorsal: 'hog', hr: 0.4, nose: 0.85, snout: 'short',
      pat: [{ t: 'blotch', x: 0.2, y: -0.75, r: 0.25, c: '#3a1a14', a: 0.8 }] },
    goatfish: { back: '#c8b890', col: '#f2e6c9', belly: '#faf6ec', fin: '#ffd23a', tailCol: '#ffd23a', tail: 'deep', dorsal: 'two', hr: 0.24, barbels: 2,
      pat: [{ t: 'hstripe', y: 0, w: 0.14, c: '#ffd23a' }] },
    squirrelfish: { back: '#b82a1a', col: '#e8553e', belly: '#ffc8b8', fin: '#ffd0c0', tail: 'deep', dorsal: 'spiny', hr: 0.38, eye: 1.8,
      pat: [{ t: 'hstripe', y: -0.4, w: 0.06, c: '#ffe0d8' }, { t: 'hstripe', y: -0.05, w: 0.06, c: '#ffe0d8' }, { t: 'hstripe', y: 0.3, w: 0.06, c: '#ffe0d8' }] },
    soldierfish: { back: '#a82a1a', col: '#d94a3a', belly: '#f2a090', fin: '#f2a090', tip: '#ffffff', tail: 'deep', dorsal: 'spiny', hr: 0.4, eye: 1.8 },
    bannerfish: { back: '#d8d8d0', col: '#f4f1ea', belly: '#fbfaf6', fin: '#f2e04a', tailCol: '#f2e04a', tail: 'truncate', dorsal: 'banner', anal: 'deep', hr: 0.8, nose: 0.75, snout: 'short',
      pat: [{ t: 'bands', at: [0.4, -0.1], w: [0.2, 0.2], c: '#151515' }] },
    surgeonfish: { back: '#3a5a8a', col: '#5f86b8', belly: '#9ab0d0', fin: '#3a5a8a', tailCol: '#3a5a8a', tail: 'lunate', dorsal: 'long', anal: 'long', hr: 0.55,
      pat: [{ t: 'blotch', x: -0.62, y: 0, r: 0.08, c: '#ffd34d' }] },
    moorishidol: { back: '#e8d04a', col: '#fff4d0', belly: '#fffaf0', fin: '#f2f2f2', tailCol: '#141414', tail: 'fork', dorsal: 'banner', anal: 'deep', hr: 0.85, nose: 0.85, snout: 'tube',
      pat: [{ t: 'bands', at: [0.45, -0.2], w: [0.24, 0.3], c: '#141414' }, { t: 'rear', x: -0.55, c: '#ffd02a' }] },
    batfish: { back: '#8a7a5a', col: '#c9b48a', belly: '#e8dcc0', fin: '#8a7a5a', tail: 'truncate', dorsal: 'trail', anal: 'trail', hr: 0.9,
      pat: [{ t: 'bands', at: [0.62, 0.3], w: 0.1, c: '#3a2e1e', a: 0.8 }] },
    filefish: { back: '#7a8a3a', col: '#b8c96b', belly: '#dce6a8', fin: '#9aaa50', tail: 'round', dorsal: 'trigger', hr: 0.5, nose: 0.75, snout: 'short',
      pat: [{ t: 'spots', c: '#f28a2a', n: 18, r: 0.06 }] },
    coraltrout: { back: '#b8302a', col: '#e05a4a', belly: '#f2a090', fin: '#d84a3a', tail: 'truncate', dorsal: 'spiny', hr: 0.32, mouth: 'big',
      pat: [{ t: 'spots', c: '#3a8ae8', n: 26, r: 0.05 }] },
    yellowtail: { back: '#7a90b0', col: '#c9d6e0', belly: '#eef2f4', fin: '#ffd23a', tailCol: '#ffd23a', tail: 'deep', hr: 0.3,
      pat: [{ t: 'hstripe', y: -0.02, w: 0.12, c: '#ffd23a', x0: -1, x1: 0.85 }] },
    blackgrouper: { back: '#2a2a24', col: '#5a5a50', belly: '#8a8a80', fin: '#3a3a33', tail: 'truncate', dorsal: 'spiny', hr: 0.36, mouth: 'big',
      pat: [{ t: 'mottle', c: '#2a2a24', n: 8 }] },
    queentrigger: { back: '#3a7a8a', col: '#5fa9c9', belly: '#e0c04a', fin: '#5fa9c9', tail: 'lyre', dorsal: 'trigger', anal: 'long', hr: 0.6, eyeX: 0.5,
      pat: [{ t: 'hstripe', y: 0.35, w: 0.06, c: '#3ac8f8', x0: 0.2, x1: 1 }, { t: 'hstripe', y: 0.55, w: 0.05, c: '#3ac8f8', x0: 0.3, x1: 1 }] },
    napoleon: { back: '#2a6a6a', col: '#3f9a8a', belly: '#7ad0b8', fin: '#2a7a7a', tail: 'round', hr: 0.42, hump: 0.3, mouth: 'lips', pat: [{ t: 'scales', c: '#1a4a4a' }] },
    spanishmack: { back: '#3a5a7a', col: '#c4d6e8', belly: '#f2f6f8', fin: '#5a7a98', tail: 'lunate', dorsal: 'two', finlets: true, hr: 0.18, nose: 0.8,
      pat: [{ t: 'spots', c: '#e8c04a', n: 20, r: 0.08, y0: -0.6, y1: 0.4 }] },
    tarpon: { back: '#4a6a7a', col: '#d8e2ea', belly: '#f6f8fa', fin: '#8aa0b8', tail: 'deep', dorsal: 'banner', hr: 0.26, mouth: 'up', shine: 0.5, pat: [{ t: 'scales', c: '#8aa0b8', big: true }] },
    skipjack: { back: '#1f2f5a', col: '#8aa0c0', belly: '#eef2f6', fin: '#2a3a68', tail: 'lunate', finlets: true, hr: 0.3,
      pat: [{ t: 'hstripe', y: 0.25, w: 0.05, c: '#2a3a68' }, { t: 'hstripe', y: 0.42, w: 0.05, c: '#2a3a68' }, { t: 'hstripe', y: 0.58, w: 0.05, c: '#2a3a68' }] },
    albacore: { back: '#1a2a4a', col: '#8a9ab8', belly: '#eef2f6', fin: '#2a3a5a', tail: 'lunate', finlets: true, pect: 'long', hr: 0.28 },
    kingmack: { back: '#3a4a5a', col: '#9aaabb', belly: '#eef2f4', fin: '#5a6a7a', tail: 'lunate', dorsal: 'two', finlets: true, hr: 0.17, nose: 0.85, mouth: 'teeth' },
    blacktip: { body: 'shark', back: '#7a8590', col: '#a8b2bc', belly: '#f6f8fa', fin: '#7a8590', tip: '#141414' },
    nurse: { body: 'shark', back: '#7a6040', col: '#b89a6b', belly: '#d8c8a8', fin: '#8a7050', nose: 0.35, dorsal: 'twinshark', tail: 'nurse', barbels: 2, eye: 0.6 },
    lemon: { body: 'shark', back: '#a89a60', col: '#d8c48a', belly: '#f2ead0', fin: '#a89a60', dorsal: 'twinshark', nose: 0.6 },
    spinner: { body: 'shark', back: '#7a8590', col: '#a8b4c0', belly: '#f4f6f8', fin: '#7a8590', tip: '#1a1a1a', nose: 0.9, hr: 0.2 },
    bonnethead: { body: 'shark', back: '#7a8590', col: '#9aa8b4', belly: '#eef2f4', fin: '#7a8590', snout: 'bonnet' },
    blueshark: { body: 'shark', back: '#1f4fa8', col: '#3f6fb8', belly: '#f2f6fa', fin: '#1f4fa8', pect: 'longshark', hr: 0.18, nose: 0.9, eye: 1.3 },
    gianttrevally: { back: '#3a4a5a', col: '#8a9aa8', belly: '#d8dee4', fin: '#3a4a5a', tail: 'deep', dorsal: 'two', anal: 'tuna', hr: 0.4, hump: 0.18, scutes: true },
    dragonfish: { body: 'eel', col: '#16161e', back: '#0a0a10', fin: '#16161e', mouth: 'fangs', barbels: 1, glowTip: '#5fd0c0', photo: true },
    barreleye: { back: '#3a3a44', col: '#7a7a88', belly: '#a8a8b4', fin: '#7a7a88', tail: 'fork', hr: 0.32, dome: true, eye: 0.01 },
    swallower: { back: '#14141a', col: '#2a2a30', belly: '#3a3a44', fin: '#2a2a30', tail: 'fork', dorsal: 'long', anal: 'long', hr: 0.22, botK: 1.8, mouth: 'fangs' },
    fangtooth: { back: '#1a1414', col: '#3a2a2a', belly: '#4a3a3a', fin: '#2a2020', tail: 'fork', hr: 0.45, nose: 0.3, peak: 0.75, mouth: 'fangs', eye: 0.7 },
    pelicaneel: { body: 'eel', col: '#1a1a24', back: '#0e0e16', fin: '#2a2a36', mouth: 'gulper', glowTip: '#ff7aa0' },
    stargazer: { back: '#5a4e3a', col: '#a89a7a', belly: '#e8e0d0', fin: '#6b5f4a', tail: 'round', hr: 0.38, nose: 0.3, peak: 0.8, eyeY: -0.95, mouth: 'up',
      pat: [{ t: 'spots', c: '#f2ead8', n: 30, r: 0.05, y1: 0 }] },
    ghostshark: { back: '#9a9aa8', col: '#c4c4cc', belly: '#e8e8ee', fin: '#8a8a98', tail: 'rat', dorsal: 'tallshark', pect: 'longshark', hr: 0.24, nose: 0.4, eye: 2, iris: '#5ad8c8' },
    monkfish: { body: 'angler', back: '#5a4a32', col: '#8a7a5a', belly: '#c8b890', fin: '#5a4a3a', flat: true },
    seatoad: { body: 'angler', back: '#8a3a2a', col: '#c47a5a', belly: '#e8b098', fin: '#8a4a3a' },
    seadevil: { body: 'angler', back: '#0e0e12', col: '#22222a', belly: '#2e2e38', fin: '#1a1a22', lureCol: '#5fd0c0' },
    dreamer: { body: 'angler', back: '#1e1424', col: '#3a2a40', belly: '#4a3a50', fin: '#2a1e30', lureCol: '#ffd0f0' },
    coffinfish: { body: 'puffer', back: '#a85a4a', col: '#e0a090', belly: '#f2d0c8', fin: '#b06a5a', spines: 0, pat: [{ t: 'spots', c: '#8a3a2a', n: 18, r: 0.06 }] },
    lingcod: { back: '#4a4a32', col: '#8a8a6b', belly: '#d8d8c0', fin: '#5a5a40', tail: 'truncate', dorsal: 'long', hr: 0.24, mouth: 'big',
      pat: [{ t: 'mottle', c: '#3a3a22', n: 8 }] },
    grenadier: { back: '#5a6068', col: '#9aa0a8', belly: '#c8ccd0', fin: '#6b7078', tail: 'rat', dorsal: 'tallshark', hr: 0.26, nose: 0.6, eye: 1.6 },
    roughy: { back: '#c8501a', col: '#e8703a', belly: '#f2a070', fin: '#e06a3a', tail: 'fork', dorsal: 'spiny', hr: 0.5, nose: 0.3, eye: 1.5, mouth: 'big' },
    hagfish: { body: 'eel', col: '#c49a9a', back: '#9a7070', fin: '#b08a8a', barbels: 3, eyeless: true },
    rattail: { back: '#5a5a68', col: '#9a9aa8', belly: '#c8c8d0', fin: '#6b6b78', tail: 'rat', dorsal: 'tallshark', hr: 0.24, nose: 0.75, eye: 1.6 },
    snailfish: { back: '#d8b8b0', col: '#f0d8d0', belly: '#f8ece8', fin: '#e8c8c0', tail: 'rat', dorsal: 'long', anal: 'long', hr: 0.3, nose: 0.3, peak: 0.8, alpha: 0.8 },
    sevengill: { body: 'shark', back: '#6a6a60', col: '#8a8a80', belly: '#c8c8c0', fin: '#5a5a50', gills: 7, dorsal: 'rear', nose: 0.45, pat: [{ t: 'spots', c: '#2a2a24', n: 22, r: 0.05 }] },
    ribbonfish: { body: 'oar', col: '#e0e8f0', fin: '#ff8a8a' },
    sleeper: { body: 'shark', back: '#2e2e34', col: '#4a4a52', belly: '#6a6a72', fin: '#2e2e34', dorsal: 'lowshark', nose: 0.45, hr: 0.25 },
    atlbluefin: { back: '#141f3a', col: '#7a8aa0', belly: '#f2f4f8', fin: '#23345a', tail: 'lunate', finlets: '#f2c81a', hr: 0.3, keel: true },
    tiger: { body: 'shark', back: '#6a6a58', col: '#9a9a88', belly: '#eeeee4', fin: '#6a6a58', nose: 0.5, pat: [{ t: 'bars', c: '#3a3a2a', n: 14, top: 0.1, a: 0.55 }] },
    mako: { body: 'shark', back: '#24408a', col: '#4a6ab0', belly: '#f2f6fa', fin: '#24408a', tail: 'lunateShark', nose: 0.9, keel: true },
    longfinmako: { body: 'shark', back: '#1e3878', col: '#3a5aa0', belly: '#eef2f8', fin: '#1e3878', tail: 'lunateShark', pect: 'longshark', nose: 0.85, eye: 1.4 },
    manta: { body: 'ray', col: '#1e2130', back: '#14161f', belly: '#f0f0f0', fin: '#1e2130' },
    whitetip: { body: 'shark', back: '#7a7a72', col: '#9a9a90', belly: '#f2f2ee', fin: '#7a7a72', tip: '#f8f8f8', pect: 'longshark', dorsal: 'roundshark', nose: 0.45 },
    bull: { body: 'shark', back: '#6a6a64', col: '#8a8a84', belly: '#eeeeea', fin: '#6a6a64', nose: 0.4, hr: 0.28 },
    greathammer: { body: 'shark', back: '#6a7078', col: '#9aa0a8', belly: '#f2f4f6', fin: '#6a7078', snout: 'hammer', dorsal: 'tallshark' },
    blackmarlin: { back: '#141e36', col: '#4a5a78', belly: '#e8ecf2', fin: '#1a2440', tail: 'lunate', dorsal: 'low', snout: 'bill', hr: 0.22, nose: 0.8 },
    sturgeon: { back: '#5a5a4a', col: '#9a9a8a', belly: '#d8d8c8', fin: '#6b6b5a', tail: 'shark', dorsal: 'rear', hr: 0.18, nose: 0.95, snout: 'sturgeon', barbels: 4, scutes: 'rows' },
    goliath: { back: '#4a4430', col: '#6b6040', belly: '#a89a70', fin: '#4a4430', tail: 'round', dorsal: 'spiny', hr: 0.42, nose: 0.4, mouth: 'big',
      pat: [{ t: 'spots', c: '#2a2414', n: 30, r: 0.05 }, { t: 'bars', c: '#2a2414', n: 5, top: 0.6, a: 0.35 }] },
    giantgrouper: { back: '#3a3a2a', col: '#6b6b58', belly: '#a8a890', fin: '#4a4a3a', tail: 'round', dorsal: 'spiny', hr: 0.42, nose: 0.4, mouth: 'big',
      pat: [{ t: 'mottle', c: '#e8e0a0', n: 6 }] }
  };

  // Defaults by the shape the rules use.
  var SHAPE = {
    round: { body: 'fish', hr: 0.5, nose: 0.5, peak: 0.55, ped: 0.2, tail: 'truncate', dorsal: 'std', anal: 'std' },
    slim: { body: 'fish', hr: 0.28, nose: 0.65, peak: 0.6, ped: 0.13, tail: 'fork', dorsal: 'std', anal: 'std' },
    torpedo: { body: 'fish', hr: 0.28, nose: 0.75, peak: 0.55, ped: 0.07, tail: 'lunate', dorsal: 'tuna', anal: 'tuna', finlets: true },
    puff: { body: 'puffer' }, lantern: { body: 'fish', hr: 0.32, nose: 0.4, eye: 1.6, tail: 'fork', pat: [{ t: 'photo', c: '#a8f0ff' }] },
    eel: { body: 'eel' }, lure: { body: 'angler' }, oar: { body: 'oar' }, whale: { body: 'whale' },
    jelly: { body: 'jelly' }, turtle: { body: 'turtle' }, squid: { body: 'squid' }
  };
  var BODY = {   // defaults per body plan, under the species' own values
    fish: { nose: 0.55, peak: 0.58, ped: 0.15, topK: 1, botK: 1, tail: 'fork', dorsal: 'std', anal: 'std', pect: 'std', eye: 1, mouth: 'small' },
    shark: { hr: 0.24, nose: 0.85, peak: 0.6, ped: 0.1, topK: 1, botK: 0.82, tail: 'shark', dorsal: 'shark', anal: 'shark', pect: 'shark', gills: 5, eye: 0.7, mouth: 'shark', iris: '#101418' },
    whale: { hr: 0.26, nose: 0.3, peak: 0.6, ped: 0.1, topK: 0.95, botK: 0.85, tail: 'shark', dorsal: 'shark', anal: 'shark', pect: 'shark', gills: 5, eye: 0.45, mouth: 'whale', iris: '#101418' },
    puffer: { hr: 0.78, nose: 0.4, peak: 0.5, ped: 0.22, tail: 'round', dorsal: 'rear', anal: 'rear', pect: 'std', eye: 1.3, mouth: 'beak', spines: 1 },
    angler: { hr: 0.72, nose: 0.3, peak: 0.6, ped: 0.2, tail: 'round', dorsal: 'rear', anal: 'rear', pect: 'std', eye: 0.6, mouth: 'angler' }
  };

  function legacyPat(sp) {   // patterns implied by the old species fields
    var p = [];
    if (sp.stripe) p.push({ t: 'hstripe', y: 0, w: 0.22, c: sp.stripe });
    if (sp.bands) p.push({ t: 'bands', at: sp.bands, w: 0.16, c: sp.bandCol || '#ffffff' });
    if (sp.spots) p.push({ t: 'spots', c: sp.spotCol || '#ffffff', n: 12, r: 0.1 });
    if (sp.glow) p.push({ t: 'photo', c: '#a8f0ff' });
    return p;
  }
  // ---------- looks (v0.13 Settings → Look): realistic, pastel, ink, dark ----------
  // pastel: soft, light colours, a firm outline, cartoon eyes, no fine detail.
  // ink: an ink drawing on pale blue paper: paper-white body, dark ink outline and markings, hatching for shade.
  //   (game.js then tones the whole scene blue, so colours left on creatures and items read as blue ink too.)
  // dark: the realistic fish, a little dimmer. The fog and the short radar are game.js's.
  var style = 'real';
  function lum(hex) { var c = rgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function pastel(hex) { return shade(hexOf(mix(hex, '#f4ecff', 0.12)), 0.42); }
  var INK = '#1a2a3c', PAPER = '#f1f5f8';
  function inked(hex) { var l = lum(hex); return l < 0.45 ? INK : l < 0.75 ? '#6a8094' : '#ffffff'; }
  function styled(lk) {
    var o = {}, k;
    for (k in lk) o[k] = lk[k];
    var keys = ['col', 'back', 'belly', 'fin', 'tailCol', 'tip', 'finlets'];
    if (style === 'pastel') {
      keys.forEach(function (k2) { if (typeof o[k2] === 'string' && o[k2].charAt(0) === '#') o[k2] = pastel(o[k2]); });
      o.back = shade(o.col, -0.12); o.belly = shade(o.col, 0.35);
      o.edge = '#2d3a4a'; o.lineK = 1.35; o.lineA = 1; o.shine = 0; o.cartoonEye = true; o.alpha = 0;
      o.pat = (lk.pat || []).filter(function (p) { return p.t !== 'scales' && p.t !== 'mottle' && p.t !== 'photo'; })
        .map(function (p) { var q = {}, j; for (j in p) q[j] = p[j]; if (q.c) q.c = pastel(q.c); if (q.edge) q.edge = pastel(q.edge); if (q.ring) q.ring = pastel(q.ring); return q; });
      o.iris = '#ffffff';
    } else if (style === 'ink') {
      o.col = PAPER; o.back = '#d6e1ea'; o.belly = '#ffffff'; o.fin = '#e6eef4'; o.tailCol = '#e6eef4';
      o.tip = lk.tip ? INK : null; o.finlets = lk.finlets ? INK : lk.finlets;
      o.edge = INK; o.lineK = 1.25; o.lineA = 1; o.shine = 0; o.iris = INK; o.ink = true; o.alpha = 0;
      o.pat = (lk.pat || []).filter(function (p) { return p.t !== 'photo'; })
        .map(function (p) { var q = {}, j; for (j in p) q[j] = p[j]; if (q.c) q.c = inked(q.c); if (q.edge) q.edge = INK; if (q.ring) q.ring = '#ffffff'; q.a = Math.min(q.a === undefined ? 1 : q.a, 0.85); return q; });
      o.lureCol = '#ffffff'; o.glowTip = lk.glowTip ? '#ffffff' : lk.glowTip; o.skin = PAPER;
    } else if (style === 'dark') {
      keys.forEach(function (k2) { if (typeof o[k2] === 'string' && o[k2].charAt(0) === '#') o[k2] = shade(o[k2], -0.18); });
      o.edge = shade(o.back, -0.45); o.shine = (lk.shine === undefined ? 0.22 : lk.shine) * 0.5;
    }
    return o;
  }
  function setStyle(s2) { style = s2 === 'pastel' || s2 === 'ink' || s2 === 'dark' ? s2 : 'real'; }

  function lookOf(sp) {
    if (sp._look !== undefined && sp._lookFor === sp.id && sp._lookStyle === style) return sp._look;
    var lk0 = baseLook(sp);
    sp._look = lk0 && style !== 'real' ? styled(lk0) : lk0;
    sp._lookFor = sp.id; sp._lookStyle = style;
    return sp._look;
  }
  function baseLook(sp) {
    if (sp._base && sp._baseFor === sp.id) return sp._base;
    var id = String(sp.id || '').replace(/-pod$/, ''), own = LOOKS[id] || {};
    var base = SHAPE[sp.shape];
    if (!base && !own.body) { sp._baseFor = sp.id; return (sp._base = null); }
    var lk = {}, k;
    base = base || {};
    var body = own.body || base.body || 'fish';
    var b = BODY[body] || BODY.fish;
    for (k in BODY.fish) lk[k] = BODY.fish[k];
    for (k in b) lk[k] = b[k];
    for (k in base) lk[k] = base[k];
    if (sp.hr && !own.hr && body === 'fish') lk.hr = sp.hr;
    if (sp.finH) lk.finH = sp.finH;
    lk.col = sp.col; lk.fin = sp.fin || sp.col; lk.tailCol = sp.tail || null;
    lk.back = shade(sp.col, -0.35); lk.belly = sp.belly || shade(sp.col, 0.55);
    lk.pat = legacyPat(sp).concat(base.pat || []);
    if (sp.spiky && body === 'fish') lk.spiky = true;
    for (k in own) lk[k] = own[k];
    lk.body = body;
    if (!lk.tailCol) lk.tailCol = lk.fin;
    lk.edge = shade(lk.back, -0.45);
    sp._base = lk; sp._baseFor = sp.id;
    return lk;
  }

  // ---------- the body profile ----------
  // A fish's outline from the tail stalk (s = 0) to the nose (s = 1): depth p(s) in [ped, 1], deepest at `peak`.
  function profile(lk, s) {
    var k = Math.log(0.5) / Math.log(lk.peak), q = Math.pow(Math.max(0, Math.min(1, s)), k);
    var e = q > 0.5 ? lk.nose : 0.9, v = 4 * q * (1 - q);
    return lk.ped + (1 - lk.ped) * Math.pow(Math.max(0, v), e);
  }

  // Builds the outline points for a fish body plan. Returns { top: [[x,y]...], bot: [...], xp, xn, H, L, wave(s) }.
  function outline(lk, len, ph, sw, n) {
    var L = len / 2, H = len * lk.hr / 2, xn = L, xp = -0.72 * L, top = [], bot = [], i;
    var A = H * 0.1 * sw, w0 = ph * TAU;
    var wave = function (s) { var u = 1 - s; return A * Math.sin(w0 - u * 2.6) * u * u; };
    for (i = 0; i <= n; i++) {
      var s = i / n, x = xp + s * (xn - xp), p = profile(lk, s), w = wave(s);
      var hump = lk.hump ? lk.hump * Math.exp(-Math.pow((s - 0.78) / 0.12, 2)) : 0;
      top.push([x, -H * (p * lk.topK + hump) + w]);
      bot.push([x, H * p * lk.botK + w]);
    }
    return { top: top, bot: bot, xp: xp, xn: xn, H: H, L: L, wave: wave };
  }
  function tracePts(ctx, pts, first) {
    var i;
    if (first) ctx.moveTo(pts[0][0], pts[0][1]); else ctx.lineTo(pts[0][0], pts[0][1]);
    for (i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }
  function bodyPath(ctx, o) {
    ctx.beginPath();
    tracePts(ctx, o.bot, true);                         // tail stalk to nose along the belly
    tracePts(ctx, o.top.slice().reverse(), false);      // and back along the back
    ctx.closePath();
  }
  // y of the back / belly at x (linear between samples).
  function edgeAt(o, x, side) {
    var pts = side < 0 ? o.top : o.bot, n = pts.length - 1, s = (x - o.xp) / (o.xn - o.xp), i = Math.max(0, Math.min(n - 1, Math.floor(s * n)));
    var a = pts[i], b = pts[i + 1], f = Math.max(0, Math.min(1, (x - a[0]) / ((b[0] - a[0]) || 1)));
    return a[1] + (b[1] - a[1]) * f;
  }

  // ---------- fins ----------
  function finFill(ctx, lk, col, alpha) {
    ctx.fillStyle = rgba(col, alpha === undefined ? (lk.alpha || 1) * 0.88 : alpha);
  }
  function finTipGrad(ctx, lk, x0, y0, x1, y1, col) {
    if (!lk.tip) return rgba(col, 0.9);
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(col, 0.9)); g.addColorStop(0.65, rgba(col, 0.9)); g.addColorStop(1, rgba(lk.tip, 0.95));
    return g;
  }
  // A fin along the back (side -1) or belly (side 1) from s0 to s1, raised h (in H), with a shape.
  function edgeFin(ctx, lk, o, s0, s1, h, side, kind, t) {
    var x0 = o.xp + s0 * (o.xn - o.xp), x1 = o.xp + s1 * (o.xn - o.xp), H = o.H, y0 = edgeAt(o, x0, side), y1 = edgeAt(o, x1, side);
    var flex = Math.sin(t * 2.2 + s0 * 3) * 0.06;
    var hh = side * H * h, tx, ty, i;
    ctx.beginPath();
    ctx.moveTo(x1, y1 - side * H * 0.05);
    if (kind === 'tri') {        // a pointed triangle swept back (sharks, tuna)
      tx = x0 + (x1 - x0) * 0.15 - o.L * 0.12; ty = edgeAt(o, x0, side) + hh;
      ctx.quadraticCurveTo(x1 - (x1 - x0) * 0.2, ty * 0.7 + y1 * 0.3, tx, ty);
      ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.25, (y0 + ty) / 2 + hh * 0.1, x0, y0 - side * H * 0.03);
    } else if (kind === 'sickle') {   // a long curved blade (yellowfin)
      tx = x0 - o.L * 0.35; ty = y0 + hh;
      ctx.quadraticCurveTo(x1 - o.L * 0.05, y1 + hh * 0.6, tx, ty);
      ctx.quadraticCurveTo(x0 + o.L * 0.02, y0 + hh * 0.35, x0, y0);
    } else if (kind === 'spiny') {    // spines in front, a soft round part behind
      var n = 9;
      for (i = 0; i <= n; i++) {
        var f = i / n, x = x1 + (x0 - x1) * f, ey = edgeAt(o, x, side);
        var spike = f < 0.6 ? (i % 2 ? 0.45 : 1) * (0.7 + 0.3 * Math.sin(f * 5)) : 0.85 * Math.sin(Math.PI * (f - 0.6) / 0.8 + Math.PI * 0.1);
        ctx.lineTo(x, ey + hh * spike * (1 + flex));
      }
      ctx.lineTo(x0, y0);
    } else if (kind === 'trail') {    // tall, sweeping back into a long trailing point (angelfish, batfish)
      tx = x0 - o.L * 0.45; ty = y0 + hh * 1.05;
      ctx.quadraticCurveTo(x1 - (x1 - x0) * 0.3, y1 + hh * 1.0, tx, ty + hh * flex);
      ctx.quadraticCurveTo(x0 - o.L * 0.05, y0 + hh * 0.2, x0, y0);
    } else if (kind === 'banner') {   // a long white streamer from the front rays (moorish idol, bannerfish, lookdown)
      tx = x0 - o.L * 0.8; ty = y0 + hh * 1.6;
      ctx.quadraticCurveTo(x1 - o.L * 0.05, y1 + hh * 1.3, tx, ty + hh * flex * 3);
      ctx.quadraticCurveTo(x1 - o.L * 0.15, y1 + hh * 0.7, x0, y0);
    } else {                          // round soft fin; 'long' fins are low and run the length of the back
      var steps = 6;
      for (i = 1; i < steps; i++) {
        var f2 = i / steps, x2 = x1 + (x0 - x1) * f2, e2 = edgeAt(o, x2, side);
        var bulge = kind === 'rounded' ? Math.sin(Math.PI * f2) : Math.pow(Math.sin(Math.PI * Math.min(1, f2 * 1.1)), 0.6);
        ctx.lineTo(x2, e2 + hh * bulge * (1 + flex));
      }
      ctx.lineTo(x0, y0);
    }
    ctx.closePath();
  }
  function drawFinShape(ctx, lk, col, a, y0, y1) {
    if (lk.tip && y1 !== undefined) ctx.fillStyle = finTipGrad(ctx, lk, 0, y0, 0, y1, col);   // dark or white fin tips
    else finFill(ctx, lk, col, a);
    ctx.fill();
    ctx.strokeStyle = rgba(lk.edge, 0.55);
    ctx.stroke();
  }
  function dorsal(ctx, lk, o, t, detail) {
    var k = lk.dorsal, fh = lk.finH || 1, c = lk.fin;
    if (k === 'none') return;
    var put = function (s0, s1, h, kind) {
      edgeFin(ctx, lk, o, s0, s1, h * fh, -1, kind, t);
      var ye = edgeAt(o, o.xp + s1 * (o.xn - o.xp), -1);
      drawFinShape(ctx, lk, c, undefined, ye, ye - o.H * h * fh);
    };
    if (k === 'std') put(0.38, 0.72, 0.55, 'soft');
    else if (k === 'tall') put(0.55, 0.78, 1.6, 'tri');
    else if (k === 'low') put(0.55, 0.78, 0.7, 'tri');
    else if (k === 'spiny') put(0.25, 0.75, 0.6, 'spiny');
    else if (k === 'lion') { put(0.25, 0.75, 1.3, 'spiny'); }
    else if (k === 'sail') put(0.18, 0.88, 1.7, 'rounded');
    else if (k === 'veil') put(0.15, 0.7, 1.1, 'trail');
    else if (k === 'long') put(0.1, 0.85, 0.4, 'soft');
    else if (k === 'deep') put(0.15, 0.75, 0.3, 'soft');
    else if (k === 'two') { put(0.2, 0.42, 0.45, 'soft'); put(0.5, 0.7, 0.55, 'spiny'); }
    else if (k === 'tuna') { put(0.3, 0.38, 0.6, 'tri'); put(0.55, 0.75, 0.45, 'tri'); }
    else if (k === 'yellowfin') { put(0.55, 0.75, 0.45, 'tri'); put(0.32, 0.4, 1.3, 'sickle'); }
    else if (k === 'trail') put(0.2, 0.7, 0.9, 'trail');
    else if (k === 'banner') { put(0.2, 0.62, 0.3, 'soft'); put(0.5, 0.66, 0.9, 'banner'); }
    else if (k === 'trigger') { put(0.12, 0.42, 0.35, 'soft'); put(0.6, 0.72, 0.6, 'tri'); }
    else if (k === 'hog') put(0.15, 0.75, 0.7, 'spiny');
    else if (k === 'cobia') { put(0.15, 0.45, 0.45, 'tri'); put(0.5, 0.68, 0.18, 'spiny'); }
    else if (k === 'sword') put(0.6, 0.76, 1.5, 'tri');
    else if (k === 'viper') { put(0.62, 0.68, 0.5, 'tri'); if (detail) { ctx.strokeStyle = rgba(lk.fin, 0.8); ctx.beginPath(); var vx = o.xp + 0.66 * (o.xn - o.xp); ctx.moveTo(vx, edgeAt(o, vx, -1)); ctx.quadraticCurveTo(vx + o.L * 0.3, -o.H * 3, vx + o.L * 0.6, -o.H * 2.2); ctx.stroke(); } }
    else if (k === 'shark') { put(0.48, 0.64, 1.1, 'tri'); put(0.12, 0.18, 0.4, 'tri'); }
    else if (k === 'tallshark') { put(0.47, 0.62, 1.6, 'tri'); put(0.12, 0.18, 0.4, 'tri'); }
    else if (k === 'roundshark') { put(0.45, 0.63, 1.2, 'rounded'); put(0.12, 0.18, 0.35, 'tri'); }
    else if (k === 'lowshark') { put(0.48, 0.6, 0.5, 'tri'); put(0.15, 0.22, 0.35, 'tri'); }
    else if (k === 'twinshark') { put(0.45, 0.58, 0.8, 'tri'); put(0.2, 0.32, 0.7, 'tri'); }
    else if (k === 'rear') put(0.15, 0.3, 0.7, 'tri');
  }
  function anal(ctx, lk, o, t) {
    var k = lk.anal, fh = lk.finH ? Math.min(lk.finH, 1.3) : 1, c = lk.fin;
    if (k === 'none') return;
    var put = function (s0, s1, h, kind) {
      edgeFin(ctx, lk, o, s0, s1, h * fh, 1, kind, t);
      var ye = edgeAt(o, o.xp + s1 * (o.xn - o.xp), 1);
      drawFinShape(ctx, lk, c, undefined, ye, ye + o.H * h * fh);
    };
    if (k === 'std') put(0.2, 0.42, 0.45, 'soft');
    else if (k === 'long') put(0.08, 0.55, 0.35, 'soft');
    else if (k === 'deep') put(0.12, 0.5, 0.35, 'soft');
    else if (k === 'tuna') put(0.28, 0.38, 0.5, 'tri');
    else if (k === 'yellowfin') put(0.3, 0.38, 1.2, 'sickle');
    else if (k === 'trail') put(0.15, 0.5, 0.85, 'trail');
    else if (k === 'veil') put(0.1, 0.55, 1.0, 'trail');
    else if (k === 'shark') put(0.16, 0.24, 0.35, 'tri');
    else if (k === 'rear') put(0.12, 0.26, 0.6, 'tri');
    else if (k === 'lobe') put(0.18, 0.3, 0.6, 'rounded');
    // pelvic fins, small, under the chest
    if (lk.body !== 'puffer' && lk.body !== 'angler') {
      var sP = lk.body === 'shark' || lk.body === 'whale' ? 0.32 : 0.62;
      edgeFin(ctx, lk, o, sP - 0.05, sP + 0.04, lk.body === 'shark' ? 0.4 : 0.35, 1, 'tri', t);
      drawFinShape(ctx, lk, c, 0.75 * (lk.alpha || 1));
    }
  }
  function pectoral(ctx, lk, o, t, ph, sw) {
    var k = lk.pect, L = o.L, H = o.H;
    var sx = lk.body === 'shark' || lk.body === 'whale' ? 0.62 : 0.66, x = o.xp + sx * (o.xn - o.xp);
    var y = edgeAt(o, x, 1) * 0.35;
    var row = Math.sin(ph * TAU * 0.5 + t * 2) * (0.25 + 0.15 * (1.2 - Math.min(1.2, sw)));
    ctx.save();
    ctx.translate(x, y);
    if (k === 'shark' || k === 'longshark') {   // a stiff triangle hanging from the lower flank, swept back
      var ln = (k === 'longshark' ? 1.5 : 0.95) * H, by = edgeAt(o, x, 1) * 0.55 - y;
      ctx.translate(0, by);
      ctx.rotate(row * 0.12);
      ctx.beginPath(); ctx.moveTo(L * 0.1, 0); ctx.quadraticCurveTo(-L * 0.02, ln * 0.5, -L * 0.18 - ln * 0.35, ln); ctx.quadraticCurveTo(-L * 0.12, ln * 0.4, -L * 0.12, 0); ctx.closePath();
      ctx.fillStyle = finTipGrad(ctx, lk, 0, 0, -L * 0.18, ln, lk.fin); ctx.fill(); ctx.strokeStyle = rgba(lk.edge, 0.5); ctx.stroke();
    } else if (k === 'fan') {         // lionfish and sculpin: huge fans with rays
      ctx.rotate(0.7 + row * 0.4);
      var R = L * 0.75, i;
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (i = 0; i <= 8; i++) { var a = -0.2 + i * 0.22; ctx.lineTo(-Math.cos(a) * R * (i % 2 ? 0.85 : 1), Math.sin(a) * R * (i % 2 ? 0.85 : 1)); }
      ctx.closePath(); finFill(ctx, lk, lk.fin, 0.55); ctx.fill();
      ctx.strokeStyle = rgba(lk.back, 0.7);
      ctx.beginPath(); for (i = 0; i <= 8; i += 2) { var a2 = -0.2 + i * 0.22; ctx.moveTo(0, 0); ctx.lineTo(-Math.cos(a2) * R * 1.1, Math.sin(a2) * R * 1.1); } ctx.stroke();
    } else if (k === 'long') {        // albacore: a long sword-like pectoral
      ctx.rotate(0.15 + row * 0.15);
      ctx.beginPath(); ctx.moveTo(0, -H * 0.06); ctx.quadraticCurveTo(-L * 0.4, H * 0.05, -L * 0.85, H * 0.18); ctx.quadraticCurveTo(-L * 0.35, H * 0.15, 0, H * 0.08); ctx.closePath();
      finFill(ctx, lk, lk.fin); ctx.fill(); ctx.strokeStyle = rgba(lk.edge, 0.5); ctx.stroke();
    } else if (k === 'lobe') {        // coelacanth and mudskipper: a fleshy lobe with a fin on the end
      ctx.rotate(0.6 + row * 0.5);
      ctx.beginPath(); ctx.ellipse(-L * 0.12, 0, L * 0.14, H * 0.12, 0, 0, TAU); ctx.fillStyle = lk.col; ctx.fill();
      ctx.beginPath(); ctx.ellipse(-L * 0.3, 0, L * 0.12, H * 0.22, 0, 0, TAU); finFill(ctx, lk, lk.fin); ctx.fill(); ctx.strokeStyle = rgba(lk.edge, 0.5); ctx.stroke();
    } else {
      ctx.rotate(0.45 + row);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-L * 0.12, -H * 0.22, -L * 0.3, -H * 0.05); ctx.quadraticCurveTo(-L * 0.12, H * 0.12, 0, 0);
      finFill(ctx, lk, lk.fin, 0.7 * (lk.alpha || 1)); ctx.fill(); ctx.strokeStyle = rgba(lk.edge, 0.4); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- the tail ----------
  function tail(ctx, lk, o, ph, sw, t) {
    var L = o.L, H = o.H, k = lk.tail, xp = o.xp, yp = o.wave(0);
    var swing = Math.sin(ph * TAU - 2.8), fore = 0.62 + 0.38 * Math.abs(Math.cos(ph * TAU - 2.8));
    var a = (0.12 + 0.18 * Math.min(1.5, sw)) * swing * (k === 'shark' || k === 'thresher' ? 0.6 : 1);
    var ped = Math.max(o.H * lk.ped * 0.9, 1);
    var th = H * (k === 'lunate' || k === 'lunateShark' ? 1.25 : k === 'fan' || k === 'veil' ? 1.6 : 1.0), tl = L * 0.5;
    if (lk.body === 'shark' || lk.body === 'whale') th = H * 1.35;
    if (k === 'none') return;
    ctx.save();
    ctx.translate(xp + 1, yp);
    ctx.rotate(a);
    ctx.scale(fore, 1);
    ctx.beginPath();
    ctx.moveTo(0, -ped);
    if (k === 'fork' || k === 'deep' || k === 'sword') {
      var notch = k === 'deep' ? 0.35 : 0.6;
      ctx.quadraticCurveTo(-tl * 0.45, -th * 0.55, -tl, -th);
      ctx.quadraticCurveTo(-tl * 0.75, -th * 0.4, -tl * notch, 0);
      ctx.quadraticCurveTo(-tl * 0.75, th * 0.4, -tl * (k === 'sword' ? 1.9 : 1), th * (k === 'sword' ? 0.75 : 1));
      if (k === 'sword') ctx.lineTo(-tl * 0.9, th * 0.45);
      ctx.quadraticCurveTo(-tl * 0.45, th * 0.55, 0, ped);
    } else if (k === 'lunate' || k === 'lunateShark') {
      ctx.quadraticCurveTo(-tl * 0.3, -th * 0.5, -tl * 0.95, -th * 1.05);
      ctx.quadraticCurveTo(-tl * 0.55, -th * 0.35, -tl * 0.45, 0);
      ctx.quadraticCurveTo(-tl * 0.55, th * 0.35, -tl * 0.95, th * (k === 'lunateShark' ? 0.9 : 1.05));
      ctx.quadraticCurveTo(-tl * 0.3, th * 0.5, 0, ped);
    } else if (k === 'round' || k === 'fan' || k === 'veil') {
      var r = k === 'round' ? 1 : 1.35;
      ctx.bezierCurveTo(-tl * 0.4 * r, -th * 1.0, -tl * 1.05 * r, -th * 0.85, -tl * 1.05 * r, 0);
      ctx.bezierCurveTo(-tl * 1.05 * r, th * 0.85, -tl * 0.4 * r, th * 1.0, 0, ped);
    } else if (k === 'truncate' || k === 'lyre') {
      var lyre = k === 'lyre' ? 0.3 : 0;
      ctx.quadraticCurveTo(-tl * 0.35, -th * 0.6, -tl * (0.8 + lyre), -th * 0.95);
      ctx.quadraticCurveTo(-tl * (0.72 - lyre * 0.3), 0, -tl * (0.8 + lyre), th * 0.95);
      ctx.quadraticCurveTo(-tl * 0.35, th * 0.6, 0, ped);
    } else if (k === 'shark' || k === 'thresher' || k === 'nurse') {   // the upper lobe is longer (heterocercal)
      var up = k === 'thresher' ? 2.6 : k === 'nurse' ? 1.3 : 1.15, low = k === 'nurse' ? 0.15 : 0.6;
      ctx.quadraticCurveTo(-tl * 0.6 * up, -th * 0.45 * Math.min(up, 1.4), -tl * 1.15 * up, -th * (k === 'nurse' ? 0.5 : 1.05));
      ctx.quadraticCurveTo(-tl * 0.85, -th * 0.15, -tl * 0.6, th * 0.05);
      ctx.lineTo(-tl * 0.72, th * low);
      ctx.quadraticCurveTo(-tl * 0.3, th * 0.35, 0, ped);
    } else if (k === 'lobe3') {                         // coelacanth: three lobes
      ctx.quadraticCurveTo(-tl * 0.5, -th * 0.9, -tl * 0.85, -th * 0.7);
      ctx.lineTo(-tl * 0.7, -th * 0.15); ctx.quadraticCurveTo(-tl * 1.25, 0, -tl * 0.7, th * 0.15);
      ctx.lineTo(-tl * 0.85, th * 0.7); ctx.quadraticCurveTo(-tl * 0.5, th * 0.9, 0, ped);
    } else if (k === 'rat') {                           // a long tapering tail with no fan (grenadiers, rattails)
      ctx.quadraticCurveTo(-tl * 0.8, -ped * 0.6, -tl * 2.2, 0);
      ctx.quadraticCurveTo(-tl * 0.8, ped * 0.6, 0, ped);
    }
    ctx.closePath();
    var tc = lk.tailCol || lk.fin;
    ctx.fillStyle = finTipGrad(ctx, lk, 0, 0, -tl, 0, tc);
    if (k === 'fan' || k === 'veil') { ctx.globalAlpha *= 0.85; }
    ctx.fill();
    ctx.strokeStyle = rgba(lk.edge, 0.55);
    ctx.stroke();
    if ((k === 'fan' || k === 'veil' || k === 'round' || k === 'fork' || k === 'deep') && o.detail) {   // fin rays
      ctx.strokeStyle = rgba(shade(tc, -0.3), 0.35); ctx.lineWidth *= 0.6; ctx.beginPath();
      for (var i = -3; i <= 3; i++) { ctx.moveTo(-tl * 0.05, i * ped * 0.25); ctx.lineTo(-tl * 0.85, i * th * 0.27); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- markings (clipped to the body) ----------
  function drawPattern(ctx, lk, o, p, detail) {
    var L = o.L, H = o.H, i, n;
    ctx.globalAlpha = p.a === undefined ? 1 : p.a;
    ctx.fillStyle = p.c;
    switch (p.t) {
      case 'bands':
        p.at.forEach(function (x, j) {
          var w = (Array.isArray(p.w) ? p.w[j] : p.w) * L, cx = x * L;
          if (p.edge) { ctx.fillStyle = p.edge; ctx.fillRect(cx - w / 2 - L * 0.025, -H * 1.5, w + L * 0.05, H * 3); ctx.fillStyle = p.c; }
          ctx.beginPath(); ctx.moveTo(cx - w / 2, -H * 1.5); ctx.quadraticCurveTo(cx - w * 0.8, 0, cx - w / 2, H * 1.5);
          ctx.lineTo(cx + w / 2, H * 1.5); ctx.quadraticCurveTo(cx + w * 0.2, 0, cx + w / 2, -H * 1.5); ctx.fill();
        });
        break;
      case 'hstripe':
        ctx.fillRect((p.x0 === undefined ? -1.2 : p.x0) * L, (p.y - p.w / 2) * H, ((p.x1 === undefined ? 1.2 : p.x1) - (p.x0 === undefined ? -1.2 : p.x0)) * L, p.w * H);
        if (p.glow && detail) { ctx.globalAlpha = 0.35; ctx.fillRect((p.x0 || -1) * L, (p.y - p.w) * H, ((p.x1 || 1) - (p.x0 || -1)) * L, p.w * 2 * H); }
        break;
      case 'wedge':      // a stripe that widens toward the tail (cleaner wrasse)
        ctx.beginPath(); ctx.moveTo(L * 1.05, (p.y - p.w0 / 2) * H); ctx.lineTo(-L * 1.3, (p.y - p.w1 / 2) * H); ctx.lineTo(-L * 1.3, (p.y + p.w1 / 2) * H); ctx.lineTo(L * 1.05, (p.y + p.w0 / 2) * H); ctx.fill();
        break;
      case 'spots':
        n = p.n || 12;
        for (i = 0; i < n; i++) {
          var sx = ((p.x0 === undefined ? -0.7 : p.x0) + hash(i, 1) * ((p.x1 === undefined ? 0.9 : p.x1) - (p.x0 === undefined ? -0.7 : p.x0))) * L;
          var sy = ((p.y0 === undefined ? -0.85 : p.y0) + hash(i, 2) * ((p.y1 === undefined ? 0.85 : p.y1) - (p.y0 === undefined ? -0.85 : p.y0))) * H;
          ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.6, (p.r || 0.1) * H * (0.7 + 0.6 * hash(i, 3))), 0, TAU); ctx.fill();
        }
        break;
      case 'dotrow':
        for (i = 0; i < p.n; i++) { ctx.beginPath(); ctx.arc((0.55 - i * 1.3 / p.n) * L, p.y * H, Math.max(0.6, p.r * H), 0, TAU); ctx.fill(); }
        break;
      case 'waves':      // mackerel: dark wavy bars over the back
        ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(0.6, H * 0.09); ctx.beginPath();
        for (i = 0; i < 12; i++) {
          var wx = (0.62 - i * 0.12) * L;
          ctx.moveTo(wx, -H * 1.1);
          for (var k2 = 1; k2 <= 4; k2++) ctx.lineTo(wx + (k2 % 2 ? 1 : -1) * L * 0.04, -H * 1.1 + k2 * H * 0.24);
        }
        ctx.stroke();
        break;
      case 'bars':       // vertical bars across the upper body (tiger shark, barracuda, marlin, wahoo, grouper)
        n = p.n || 8;
        for (i = 0; i < n; i++) {
          var bx = (0.75 - (i + 0.5) * 1.6 / n) * L, bw = L * 0.6 / n;
          ctx.beginPath(); ctx.moveTo(bx - bw / 2, -H * 1.3); ctx.lineTo(bx + bw / 2, -H * 1.3); ctx.lineTo(bx + bw * 0.25, (p.top || 0) * H); ctx.lineTo(bx - bw * 0.25, (p.top || 0) * H); ctx.fill();
        }
        break;
      case 'obstripes':  // bonito: oblique dark stripes on the back
        ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(0.6, H * 0.08); ctx.beginPath();
        for (i = 0; i < p.n; i++) { var oy = -H * (0.9 - i * 0.12); ctx.moveTo(L * 0.7, oy); ctx.lineTo(-L * 1.0, oy + H * 0.45); }
        ctx.stroke();
        break;
      case 'mask':
        ctx.fillRect((p.x - p.w / 2) * L, -H * 1.3, p.w * L, p.top ? H * 0.9 : H * 2.6);
        break;
      case 'eyespot':
        ctx.fillStyle = p.ring || '#ffffff'; ctx.beginPath(); ctx.arc(p.x * L, p.y * H, p.r * H * 1.3, 0, TAU); ctx.fill();
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x * L, p.y * H, p.r * H, 0, TAU); ctx.fill();
        break;
      case 'blotch':
        ctx.beginPath(); ctx.arc(p.x * L, p.y * H, p.r * H, 0, TAU); ctx.fill();
        break;
      case 'rear':
        ctx.fillRect(-L * 1.3, -H * 1.5, (p.x + 1.3) * L, H * 3);
        break;
      case 'mottle':
        n = p.n || 6;
        ctx.globalAlpha *= 0.55;
        for (i = 0; i < n; i++) { ctx.beginPath(); ctx.ellipse((-0.6 + hash(i, 7) * 1.4) * L, (-0.7 + hash(i, 8) * 1.4) * H, L * (0.08 + 0.1 * hash(i, 9)), H * (0.15 + 0.2 * hash(i, 4)), hash(i, 5) * 3, 0, TAU); ctx.fill(); }
        break;
      case 'scales':
        if (!detail) break;
        ctx.strokeStyle = rgba(p.c, 0.35); ctx.lineWidth = Math.max(0.4, H * 0.025); ctx.beginPath();
        var step = H * (p.big ? 0.42 : 0.28);
        for (var sxx = L * 0.45; sxx > -L * 0.8; sxx -= step) for (var syy = -H; syy < H; syy += step) {
          var off = (Math.round((L * 0.45 - sxx) / step) % 2) * step / 2;
          ctx.moveTo(sxx, syy + off - step / 2); ctx.arc(sxx, syy + off, step / 2, -Math.PI / 2, Math.PI / 2, true);
        }
        ctx.stroke();
        break;
      case 'palette':    // blue tang: a black sweep from the eye along the back, with a loop
        ctx.beginPath(); ctx.moveTo(L * 0.62, -H * 0.3); ctx.quadraticCurveTo(L * 0.1, -H * 0.85, -L * 0.7, -H * 0.15);
        ctx.quadraticCurveTo(-L * 0.25, -H * 0.05, -L * 0.1, H * 0.25); ctx.quadraticCurveTo(L * 0.05, -H * 0.2, L * 0.62, -H * 0.05); ctx.fill();
        ctx.fillStyle = lk.col; ctx.beginPath(); ctx.ellipse(-L * 0.08, -H * 0.32, L * 0.14, H * 0.12, -0.2, 0, TAU); ctx.fill();
        break;
      case 'lline':
        ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(0.6, p.w * H); ctx.beginPath(); ctx.moveTo(L * 0.5, -H * 0.25); ctx.quadraticCurveTo(0, -H * 0.15, -L * 1.1, 0); ctx.stroke();
        break;
      case 'photo':      // light organs along the belly
        if (!detail) break;
        ctx.globalAlpha = 0.95; ctx.fillStyle = p.c;
        for (i = 0; i < 9; i++) { var px = (0.55 - i * 0.15) * L; ctx.beginPath(); ctx.arc(px, (p.y || 0.62) * H, Math.max(0.7, H * 0.07), 0, TAU); ctx.arc(px - L * 0.07, (p.y || 0.62) * H + H * 0.18, Math.max(0.6, H * 0.055), 0, TAU); ctx.fill(); }
        break;
      case 'grid':       // whale shark: rows of pale spots between pale stripes
        ctx.strokeStyle = rgba(p.c, 0.7); ctx.lineWidth = Math.max(0.6, H * 0.04); ctx.beginPath();
        for (i = 0; i < 12; i++) { var gx = (0.5 - i * 0.13) * L; ctx.moveTo(gx, -H * 1.2); ctx.lineTo(gx - L * 0.02, H * 0.3); }
        for (i = 0; i < 3; i++) { var gy = -H * (0.75 - i * 0.3); ctx.moveTo(L * 0.6, gy); ctx.lineTo(-L * 1.1, gy + H * 0.1); }
        ctx.stroke();
        for (i = 0; i < 60; i++) { ctx.beginPath(); ctx.arc((0.85 - hash(i, 3) * 1.8) * L, (-1 + hash(i, 4) * 1.3) * H, Math.max(0.6, H * 0.045), 0, TAU); ctx.fill(); }
        break;
      case 'streaks':
        ctx.strokeStyle = rgba(p.c, 0.6); ctx.lineWidth = Math.max(0.5, H * 0.15); ctx.beginPath();
        for (i = 0; i < 14; i++) { var qx = (0.8 - i * 0.12) * L; ctx.moveTo(qx, -H * 0.3); ctx.lineTo(qx - L * 0.05, H * 0.3); }
        ctx.stroke();
        break;
      case 'spine':      // weever: a black, venomous first dorsal
        ctx.fillRect(L * 0.2, -H * 1.4, L * 0.15, H * 0.5);
        break;
    }
    ctx.globalAlpha = 1;
  }

  // ---------- head ----------
  function head(ctx, lk, o, lw, detail) {
    var L = o.L, H = o.H, xn = o.xn;
    var ex = L * (lk.eyeX || (lk.body === 'shark' || lk.body === 'whale' ? 0.7 : 0.66));
    var ytop = edgeAt(o, ex, -1), ybot = edgeAt(o, ex, 1), ey = ytop + (ybot - ytop) * (0.38 + (lk.eyeY ? lk.eyeY * 0.3 : 0)) + o.wave(1) * 0;
    var er = Math.max(0.9, H * 0.15 * (lk.eye || 1) * (lk.body === 'shark' ? 0.75 : 1)), sn = lk.snout;
    ctx.lineWidth = lw * 0.6;
    // snout extensions, drawn first so the body overlaps their base
    if (sn === 'bill') {
      ctx.fillStyle = shade(lk.back, 0.05); ctx.beginPath(); ctx.moveTo(xn - L * 0.05, ey - H * 0.05); ctx.lineTo(xn + L * 0.75, ey + H * 0.05); ctx.lineTo(xn - L * 0.05, ey + H * 0.25); ctx.closePath(); ctx.fill();
    } else if (sn === 'sword') {
      ctx.fillStyle = shade(lk.back, 0.1); ctx.beginPath(); ctx.moveTo(xn - L * 0.05, ey - H * 0.12); ctx.lineTo(xn + L * 0.95, ey + H * 0.02); ctx.lineTo(xn + L * 0.95, ey + H * 0.08); ctx.lineTo(xn - L * 0.05, ey + H * 0.3); ctx.closePath(); ctx.fill();
    } else if (sn === 'tube') {
      ctx.fillStyle = lk.col; ctx.beginPath(); ctx.moveTo(xn - L * 0.1, -H * 0.18); ctx.lineTo(xn + L * 0.32, -H * 0.04); ctx.lineTo(xn + L * 0.32, H * 0.1); ctx.lineTo(xn - L * 0.1, H * 0.2); ctx.closePath(); ctx.fill();
    } else if (sn === 'sturgeon') {
      ctx.fillStyle = lk.col; ctx.beginPath(); ctx.moveTo(xn - L * 0.1, -H * 0.45); ctx.lineTo(xn + L * 0.3, -H * 0.05); ctx.lineTo(xn - L * 0.1, H * 0.25); ctx.closePath(); ctx.fill();
    } else if (sn === 'goblin') {
      ctx.fillStyle = lk.col; ctx.beginPath(); ctx.moveTo(xn - L * 0.1, -H * 0.6); ctx.lineTo(xn + L * 0.4, -H * 0.45); ctx.quadraticCurveTo(xn + L * 0.45, -H * 0.3, xn + L * 0.35, -H * 0.25); ctx.lineTo(xn - L * 0.05, -H * 0.05); ctx.closePath(); ctx.fill();
    }
    if (sn === 'hammer' || sn === 'bonnet') {   // the hammer: a flat blade across the head (seen side-on, a tall bar)
      var hb = sn === 'hammer' ? 1.5 : 0.9;
      ctx.fillStyle = shade(lk.back, 0.1); ctx.beginPath();
      ctx.ellipse(xn - L * 0.06, -H * 0.15, L * 0.07, H * hb, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = rgba(lk.edge, 0.6); ctx.stroke();
      ex = xn - L * 0.06; ey = -H * (0.15 + hb * 0.85); er = Math.max(0.9, er);
    }
    // gill cover
    if (lk.body === 'shark' || lk.body === 'whale') {
      var gs = lk.gills === 'huge' ? 6 : lk.gills || 5;
      ctx.strokeStyle = rgba(lk.edge, 0.55); ctx.lineWidth = lw * (lk.gills === 'huge' ? 1.2 : 0.7); ctx.beginPath();
      for (var g = 0; g < gs; g++) {
        var gx = L * (0.5 - g * 0.045), gt = edgeAt(o, gx, -1), gb = edgeAt(o, gx, 1);
        var span = lk.gills === 'huge' ? 0.85 : 0.35;
        ctx.moveTo(gx, gt + (gb - gt) * (0.5 - span / 2)); ctx.quadraticCurveTo(gx - L * 0.02, gt + (gb - gt) * 0.5, gx, gt + (gb - gt) * (0.5 + span / 2));
      }
      ctx.stroke();
      if (lk.frill) { ctx.strokeStyle = rgba('#c84a4a', 0.7); ctx.beginPath(); ctx.moveTo(L * 0.5, edgeAt(o, L * 0.5, -1) * 0.6); ctx.lineTo(L * 0.5, edgeAt(o, L * 0.5, 1) * 0.8); ctx.stroke(); }
    } else if (lk.body !== 'puffer' && detail) {
      var cx2 = L * 0.4, ct = edgeAt(o, cx2, -1), cb = edgeAt(o, cx2, 1);
      ctx.strokeStyle = rgba(lk.edge, 0.4); ctx.lineWidth = lw * 0.6; ctx.beginPath();
      ctx.moveTo(cx2 + L * 0.06, ct * 0.75); ctx.quadraticCurveTo(cx2 - L * 0.06, (ct + cb) * 0.25, cx2 + L * 0.08, cb * 0.8); ctx.stroke();
    }
    // mouth
    var m = lk.mouth, mx = xn - L * 0.02, my = edgeAt(o, xn - L * 0.05, 1) * 0.25 + edgeAt(o, xn - L * 0.05, -1) * 0.1;
    ctx.strokeStyle = rgba(lk.edge, 0.7); ctx.lineWidth = lw * 0.6; ctx.beginPath();
    if (m === 'shark') { var sy2 = edgeAt(o, L * 0.78, 1) * 0.75; ctx.moveTo(L * 0.86, sy2); ctx.quadraticCurveTo(L * 0.76, sy2 + H * 0.12, L * 0.62, sy2 + H * 0.02); }
    else if (m === 'mega' || m === 'whale') { var wy = m === 'whale' ? 0 : H * 0.1; ctx.moveTo(xn, wy); ctx.quadraticCurveTo(L * 0.82, wy + H * 0.12, L * 0.62, wy + H * 0.08); if (m === 'mega') { ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(xn, wy - H * 0.06); ctx.lineTo(L * 0.66, wy - H * 0.02); } }
    else if (m === 'big' || m === 'teeth' || m === 'fangs' || m === 'ragged') { ctx.moveTo(mx, my); ctx.lineTo(L * 0.62, my + H * 0.18); }
    else if (m === 'under') { ctx.moveTo(xn + L * 0.04, my + H * 0.05); ctx.lineTo(L * 0.66, my + H * 0.12); }
    else if (m === 'up') { ctx.moveTo(xn, my - H * 0.2); ctx.lineTo(L * 0.72, my - H * 0.05); }
    else if (m === 'beak') { ctx.stroke(); ctx.fillStyle = '#efe8d8'; ctx.beginPath(); ctx.ellipse(xn - L * 0.02, my, L * 0.05, H * 0.1, 0, 0, TAU); ctx.fill(); ctx.beginPath(); }
    else if (m === 'lips') { ctx.stroke(); ctx.fillStyle = shade(lk.col, -0.1); ctx.beginPath(); ctx.ellipse(xn - L * 0.02, my, L * 0.04, H * 0.12, 0, 0, TAU); ctx.fill(); ctx.beginPath(); }
    else { ctx.moveTo(mx, my); ctx.lineTo(xn - L * 0.1, my + H * 0.06); }
    ctx.stroke();
    if (sn === 'beak') { ctx.fillStyle = '#e8f0e8'; ctx.beginPath(); ctx.moveTo(xn + L * 0.02, my - H * 0.12); ctx.quadraticCurveTo(xn + L * 0.06, my, xn + L * 0.02, my + H * 0.12); ctx.lineTo(xn - L * 0.06, my); ctx.closePath(); ctx.fill(); }
    if ((m === 'teeth' || m === 'fangs' || m === 'ragged') && detail) {
      ctx.fillStyle = '#f6f2e6'; var tn = m === 'fangs' ? 3 : 5, tlen = m === 'fangs' ? H * 0.35 : H * 0.12;
      for (var ti = 0; ti < tn; ti++) { var tx = xn - L * 0.04 - ti * L * 0.06, ty = my + ti * H * 0.035; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - L * 0.015, ty + tlen * (ti % 2 ? 0.6 : 1)); ctx.lineTo(tx - L * 0.03, ty); ctx.fill(); }
    }
    // barbels and cirri
    if (lk.barbels && detail) {
      ctx.strokeStyle = rgba(shade(lk.col, -0.2), 0.8); ctx.lineWidth = lw * 0.5; ctx.beginPath();
      for (var bi = 0; bi < lk.barbels; bi++) { ctx.moveTo(xn - L * 0.05 - bi * L * 0.04, my + H * 0.08); ctx.quadraticCurveTo(xn - bi * L * 0.03, my + H * 0.4, xn - L * 0.1 - bi * L * 0.05, my + H * (0.6 + bi * 0.1)); }
      ctx.stroke();
    }
    if (lk.cirri && detail) { ctx.strokeStyle = rgba(lk.fin, 0.9); ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.moveTo(ex, ey - er); ctx.lineTo(ex + er * 0.4, ey - er * 2.6); ctx.stroke(); }
    if (lk.dome) {   // barreleye: a clear dome over two green tube eyes
      ctx.fillStyle = 'rgba(200,240,255,0.25)'; ctx.strokeStyle = 'rgba(220,250,255,0.6)'; ctx.beginPath(); ctx.ellipse(L * 0.55, -H * 0.55, L * 0.25, H * 0.6, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5ad8a8'; ctx.beginPath(); ctx.arc(L * 0.55, -H * 0.55, Math.max(1, H * 0.16), 0, TAU); ctx.fill();
      return;
    }
    if (lk.eyeless) return;
    if (lk.cartoonEye) {   // pastel look: a big white eye with a dark pupil and an outline
      er = Math.max(1.4, er * 1.35);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
      ctx.strokeStyle = lk.edge; ctx.lineWidth = lw * 0.7; ctx.stroke();
      ctx.fillStyle = '#2d3a4a'; ctx.beginPath(); ctx.arc(ex + er * 0.25, ey, er * 0.55, 0, TAU); ctx.fill();
      return;
    }
    // the eye: iris, pupil, a highlight
    ctx.fillStyle = lk.iris || (lk.body === 'shark' ? '#101418' : '#d2b04a');
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
    if (er > 1.6) {
      ctx.fillStyle = '#06080a'; ctx.beginPath(); ctx.arc(ex + er * 0.12, ey, er * 0.66, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(ex + er * 0.35, ey - er * 0.35, er * 0.24, 0, TAU); ctx.fill();
    }
  }

  // ---------- a whole fish (fish, shark, whale and puffer body plans) ----------
  function drawFish(ctx, lk, len, o) {
    var detail = o.px > 46, n = o.px < 22 ? 8 : 14, sw = o.sw, ph = o.ph, t = o.t, lw = o.lw;
    var b = outline(lk, len, ph, sw, n);
    b.detail = detail;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.lineWidth = lw * 0.7;
    if (lk.alpha) ctx.globalAlpha *= lk.alpha;
    // behind the body: tail, the far pectoral, dorsal and anal fins
    tail(ctx, lk, b, ph, sw, t);
    if (o.px > 14) { dorsal(ctx, lk, b, t, detail); anal(ctx, lk, b, t); }
    if (lk.tripod && detail) {   // tripodfish: long stilts under the body
      ctx.strokeStyle = rgba(lk.fin, 0.8); ctx.lineWidth = lw * 0.6; ctx.beginPath();
      ctx.moveTo(b.L * 0.3, b.H * 0.8); ctx.lineTo(b.L * 0.2, b.H * 6); ctx.moveTo(b.L * 0.25, b.H * 0.8); ctx.lineTo(b.L * 0.4, b.H * 6);
      ctx.moveTo(-b.L * 0.65, b.H * 0.3); ctx.lineTo(-b.L * 0.9, b.H * 6); ctx.stroke(); ctx.lineWidth = lw * 0.7;
    }
    // body: countershaded (dark back, pale belly), the species' markings, then a soft sheen along the back
    bodyPath(ctx, b);
    var top = -b.H * lk.topK, bot = b.H * lk.botK;
    var g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, lk.back); g.addColorStop(0.42, lk.col); g.addColorStop(0.72, lk.col); g.addColorStop(1, lk.belly);
    ctx.fillStyle = g;
    ctx.fill();
    if (o.px > 10 && (lk.pat.length || lk.belt || lk.shine !== 0)) {
      ctx.save();
      ctx.clip();
      if (lk.belt) {   // a sharp line between a grey back and a white belly (great white)
        ctx.fillStyle = lk.belly; ctx.beginPath(); ctx.moveTo(b.L * 1.1, b.H * 0.05);
        for (var bx = b.L; bx > -b.L; bx -= b.L / 5) ctx.lineTo(bx, b.H * (0.1 + 0.12 * Math.sin(bx / b.L * 9)));
        ctx.lineTo(-b.L, b.H * 2); ctx.lineTo(b.L * 1.1, b.H * 2); ctx.fill();
      }
      for (var i = 0; i < lk.pat.length; i++) drawPattern(ctx, lk, b, lk.pat[i], detail);
      var sh = ctx.createLinearGradient(0, top, 0, bot);
      var shine = lk.shine === undefined ? 0.22 : lk.shine;
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.28, 'rgba(255,255,255,' + shine + ')'); sh.addColorStop(0.45, 'rgba(255,255,255,0)');
      sh.addColorStop(0.85, 'rgba(0,10,20,0)'); sh.addColorStop(1, 'rgba(0,10,20,0.18)');
      ctx.fillStyle = sh; ctx.fillRect(-b.L * 1.2, top - 2, b.L * 2.4, bot - top + 4);
      if (lk.scutes && detail) {   // a ridge of bony scutes along the tail stalk (jacks)
        ctx.strokeStyle = rgba(lk.edge, 0.45); ctx.lineWidth = lw * 0.6; ctx.beginPath();
        for (var si = 0; si < 7; si++) { var scx = b.xp + si * b.L * 0.06; ctx.moveTo(scx, b.wave(0) - b.H * 0.05); ctx.lineTo(scx + b.L * 0.03, b.wave(0) + b.H * 0.05); }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (lk.ink && o.px > 24) inkHatch(ctx, b, lw);
    ctx.strokeStyle = rgba(lk.edge, lk.lineA || 0.75);
    ctx.lineWidth = lw * 0.7 * (lk.lineK || 1);
    bodyPath(ctx, b);
    ctx.stroke();
    if (lk.finlets && detail) {   // tuna and mackerel: small finlets between the second dorsal and the tail
      ctx.fillStyle = typeof lk.finlets === 'string' ? lk.finlets : lk.fin;
      for (var fi = 0; fi < 6; fi++) {
        var fx = b.xp + (0.05 + fi * 0.045) * (b.xn - b.xp), fy = edgeAt(b, fx, -1), fb = edgeAt(b, fx, 1), fs = b.H * 0.16;
        ctx.beginPath(); ctx.moveTo(fx + fs, fy); ctx.lineTo(fx - fs * 0.4, fy - fs); ctx.lineTo(fx, fy); ctx.fill();
        ctx.beginPath(); ctx.moveTo(fx + fs, fb); ctx.lineTo(fx - fs * 0.4, fb + fs); ctx.lineTo(fx, fb); ctx.fill();
      }
    }
    if (lk.spiky || lk.body === 'puffer' && lk.spines !== 0) {   // spines all round (pufferfish, porcupinefish)
      var sl = b.H * (lk.spines === 2 ? 0.35 : 0.18);
      ctx.strokeStyle = rgba(lk.edge, 0.8); ctx.lineWidth = lw * 0.55; ctx.beginPath();
      for (var k = 0; k < 22; k++) {
        var x = b.xp + (k / 21) * (b.xn - b.xp) * 0.95, side = k % 2 ? -1 : 1, ey = edgeAt(b, x, side);
        ctx.moveTo(x, ey); ctx.lineTo(x - sl * 0.4, ey + side * sl);
      }
      ctx.stroke();
    }
    if (o.px > 12) pectoral(ctx, lk, b, t, ph, sw);
    head(ctx, lk, b, lw, detail);
    if (lk.body === 'angler') angler(ctx, lk, b, t, lw);
  }

  // ink look: shade the lower body with fine diagonal hatching, as a pen drawing would.
  function inkHatch(ctx, b, lw) {
    ctx.save();
    bodyPath(ctx, b); ctx.clip();
    ctx.strokeStyle = 'rgba(26,42,60,0.45)'; ctx.lineWidth = lw * 0.45; ctx.beginPath();
    var gap = Math.max(lw * 2.2, b.H * 0.16), x;
    for (x = -b.L * 1.2; x < b.L * 1.2; x += gap) { ctx.moveTo(x, b.H * 0.15); ctx.lineTo(x + b.H * 0.9, b.H * 1.1); }
    ctx.stroke();
    ctx.restore();
  }

  function angler(ctx, lk, b, t, lw) {   // the lure on its stalk, and a gaping mouth with needle teeth
    var L = b.L, H = b.H, sx = L * 0.55, sy = edgeAt(b, sx, -1), tipx = L * 1.15, tipy = -H * 1.65 + Math.sin(t * 2.3) * H * 0.12;
    ctx.strokeStyle = rgba(lk.back, 0.9); ctx.lineWidth = lw * 1.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(L * 0.9, -H * 2.1, tipx, tipy); ctx.stroke();
    var lc = lk.lureCol || '#fff2b0', gr = ctx.createRadialGradient(tipx, tipy, 0, tipx, tipy, H * 0.7);
    gr.addColorStop(0, rgba(lc, 0.9)); gr.addColorStop(1, rgba(lc, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(tipx, tipy, H * 0.7, 0, TAU); ctx.fill();
    ctx.fillStyle = lc; ctx.beginPath(); ctx.arc(tipx, tipy, Math.max(1, H * 0.1), 0, TAU); ctx.fill();
    ctx.fillStyle = '#100808'; ctx.beginPath(); ctx.moveTo(L * 1.0, -H * 0.15); ctx.quadraticCurveTo(L * 0.6, H * 0.1, L * 0.35, H * 0.05); ctx.quadraticCurveTo(L * 0.6, H * 0.5, L * 1.02, H * 0.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2ece0';
    for (var i = 0; i < 6; i++) {
      var x = L * (0.95 - i * 0.09); ctx.beginPath(); ctx.moveTo(x, -H * 0.1 + i * H * 0.03); ctx.lineTo(x - L * 0.02, H * 0.12); ctx.lineTo(x - L * 0.04, -H * 0.08 + i * H * 0.03); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, H * 0.33 - i * H * 0.04); ctx.lineTo(x - L * 0.02, H * 0.15); ctx.lineTo(x - L * 0.04, H * 0.32 - i * H * 0.04); ctx.fill();
    }
  }

  // ---------- eels (moray, cusk eel, gulper, frilled shark, dragonfish, hagfish) ----------
  function drawEel(ctx, lk, len, o) {
    var L = len / 2, th = len * 0.075 * (lk.thick || 1), n = o.px < 30 ? 10 : 20, pts = [], i, t = o.t, ph = o.ph;
    var taper = lk.taper || 0.85;
    for (i = 0; i <= n; i++) {
      var u = i / n, x = -L + u * len, amp = len * 0.06 * (1 - u * 0.75) * (0.6 + 0.6 * Math.min(1.2, o.sw + 0.3));
      pts.push([x, Math.sin(u * 7 - ph * TAU) * amp, th * (u > 0.88 ? 0.75 + 0.25 * (1 - u) / 0.12 : Math.pow(u, 0.4) * taper + (1 - taper) * u + 0.08)]);
    }
    var top = [], bot = [];
    for (i = 0; i <= n; i++) {
      var p = pts[i], q = pts[Math.min(n, i + 1)], r2 = pts[Math.max(0, i - 1)];
      var dx = q[0] - r2[0], dy = q[1] - r2[1], dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
      top.push([p[0] + nx * p[2] * 0.5 * -1, p[1] - ny * p[2] * 0.5]); bot.push([p[0] - nx * p[2] * 0.5 * -1, p[1] + ny * p[2] * 0.5]);
    }
    // a continuous fin along the back and belly
    ctx.lineJoin = 'round';
    if (o.px > 20) {
      ctx.fillStyle = rgba(lk.fin, 0.7); ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
      for (i = 1; i <= Math.floor(n * 0.75); i++) ctx.lineTo(top[i][0], top[i][1] - th * 0.35 * Math.sin(Math.PI * i / n));
      for (i = Math.floor(n * 0.75); i >= 0; i--) ctx.lineTo(top[i][0], top[i][1]);
      ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
    for (i = 1; i <= n; i++) ctx.lineTo(top[i][0], top[i][1]);
    ctx.quadraticCurveTo(L + th * 0.6, pts[n][1], bot[n][0], bot[n][1]);
    for (i = n - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, -th, 0, th);
    g.addColorStop(0, lk.back || shade(lk.col, -0.3)); g.addColorStop(0.5, lk.col); g.addColorStop(1, shade(lk.col, 0.3));
    ctx.fillStyle = g; ctx.fill();
    if (lk.pat && lk.pat.length && o.px > 30) {
      ctx.save(); ctx.clip();
      var fake = { L: L, H: th * 0.6, xp: -L, xn: L };
      for (i = 0; i < lk.pat.length; i++) drawPattern(ctx, lk, fake, lk.pat[i], true);
      ctx.restore();
    }
    ctx.strokeStyle = rgba(lk.edge, 0.7); ctx.lineWidth = o.lw * 0.7; ctx.stroke();
    var hx = pts[n][0], hy = pts[n][1];
    if (lk.mouth === 'gulper') {   // a huge hinged jaw
      ctx.fillStyle = '#05050a'; ctx.beginPath(); ctx.moveTo(hx + th * 0.3, hy); ctx.lineTo(hx + th * 3.2, hy - th * 1.2); ctx.lineTo(hx + th * 3.4, hy + th * 1.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(lk.fin, 0.8); ctx.stroke();
    } else if (lk.mouth === 'teeth' || lk.mouth === 'fangs') {
      ctx.fillStyle = '#2a0e0e'; ctx.beginPath(); ctx.moveTo(hx + th * 0.6, hy + th * 0.05); ctx.lineTo(hx - th * 0.7, hy + th * 0.2); ctx.lineTo(hx + th * 0.6, hy + th * 0.35); ctx.fill();
      if (o.px > 50) { ctx.fillStyle = '#f2ece0'; for (i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(hx + th * 0.5 - i * th * 0.3, hy + th * 0.07); ctx.lineTo(hx + th * 0.42 - i * th * 0.3, hy + th * 0.22); ctx.lineTo(hx + th * 0.34 - i * th * 0.3, hy + th * 0.07); ctx.fill(); } }
    }
    if (lk.glowTip) {   // a glowing tail tip (gulper) or chin lure (dragonfish)
      var gx = lk.barbels ? hx : pts[0][0], gy = lk.barbels ? hy + th * 1.6 : pts[0][1], gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, th * 1.2);
      gg.addColorStop(0, rgba(lk.glowTip, 0.9)); gg.addColorStop(1, rgba(lk.glowTip, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy, th * 1.2, 0, TAU); ctx.fill();
    }
    if (lk.barbels && o.px > 30) { ctx.strokeStyle = rgba(lk.col, 0.9); ctx.lineWidth = o.lw * 0.5; ctx.beginPath(); for (i = 0; i < lk.barbels; i++) { ctx.moveTo(hx + th * 0.4, hy + th * 0.2); ctx.lineTo(hx + th * (0.8 + i * 0.3), hy + th * (0.9 + i * 0.4)); } ctx.stroke(); }
    if (!lk.eyeless) {
      var er = Math.max(0.9, th * 0.22);
      ctx.fillStyle = lk.iris || '#d8c04a'; ctx.beginPath(); ctx.arc(hx - th * 0.15, hy - th * 0.18, er, 0, TAU); ctx.fill();
      ctx.fillStyle = '#06080a'; ctx.beginPath(); ctx.arc(hx - th * 0.1, hy - th * 0.18, er * 0.6, 0, TAU); ctx.fill();
    }
  }

  // ---------- oarfish and ribbonfish ----------
  function drawOar(ctx, lk, len, o) {
    var L = len / 2, Hh = Math.max(1.5, len * 0.035), n = 24, i, top = [], bot = [];
    for (i = 0; i <= n; i++) {
      var u = i / n, x = -L + u * len, y = Math.sin(u * 5 - o.ph * TAU * 0.5) * len * 0.035, h = Hh * (0.25 + 0.75 * Math.min(1, u * 1.6)) * (u > 0.95 ? 0.7 : 1);
      top.push([x, y - h]); bot.push([x, y + h]);
    }
    ctx.fillStyle = rgba(lk.fin, 0.85); ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
    for (i = 1; i <= n; i++) ctx.lineTo(top[i][0], top[i][1] - Hh * (0.8 + 0.3 * Math.sin(i * 0.9 + o.t * 3)));
    for (i = n; i >= 0; i--) ctx.lineTo(top[i][0], top[i][1]);
    ctx.fill();
    // the red crest plume on the head
    var hx = top[n][0], hy = top[n][1];
    ctx.strokeStyle = rgba(lk.fin, 0.95); ctx.lineWidth = o.lw * 0.8; ctx.beginPath();
    for (i = 0; i < 5; i++) { ctx.moveTo(hx - Hh * i * 0.6, hy); ctx.quadraticCurveTo(hx - Hh * (2 + i), hy - Hh * 4, hx - Hh * (5 + i * 2), hy - Hh * (3 + Math.sin(o.t * 2 + i))); }
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
    for (i = 1; i <= n; i++) ctx.lineTo(top[i][0], top[i][1]);
    for (i = n; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, -Hh, 0, Hh); g.addColorStop(0, '#c8d0e0'); g.addColorStop(0.5, lk.col); g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g; ctx.fill();
    if (lk.pat && o.px > 40) {
      ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(40,60,90,0.45)'; ctx.lineWidth = Hh * 0.4; ctx.beginPath();
      for (i = 2; i < n; i += 2) { ctx.moveTo(top[i][0], top[i][1]); ctx.lineTo(bot[i][0] - Hh, bot[i][1]); }
      ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = 'rgba(80,90,110,0.6)'; ctx.lineWidth = o.lw * 0.6; ctx.stroke();
    ctx.fillStyle = '#10141a'; ctx.beginPath(); ctx.arc(hx - Hh * 0.8, (top[n][1] + bot[n][1]) / 2 - Hh * 0.2, Math.max(0.8, Hh * 0.4), 0, TAU); ctx.fill();
  }

  // ---------- ocean sunfish (Mola): a tall disc with no real tail ----------
  function drawMola(ctx, lk, len, o) {
    var L = len / 2, H = len * 0.48, t = o.t, flap = Math.sin(o.ph * TAU) * 0.35;
    var fin = function (dir) {   // the tall dorsal (up) and anal (down) fins scull side to side
      var sk = 1 - Math.abs(Math.sin(o.ph * TAU + (dir > 0 ? 0 : Math.PI))) * 0.35;
      ctx.beginPath(); ctx.moveTo(-L * 0.25, dir * H * 0.7); ctx.quadraticCurveTo(-L * 0.4, dir * H * 1.6 * sk, -L * (0.55 + flap * 0.1 * dir), dir * H * 1.75 * sk);
      ctx.quadraticCurveTo(-L * 0.65, dir * H * 1.1, -L * 0.6, dir * H * 0.5); ctx.closePath();
      ctx.fillStyle = rgba(lk.fin, 0.95); ctx.fill(); ctx.strokeStyle = rgba(lk.edge, 0.55); ctx.lineWidth = o.lw * 0.6; ctx.stroke();
    };
    fin(-1); fin(1);
    ctx.beginPath(); ctx.moveTo(L * 0.95, -H * 0.1);
    ctx.bezierCurveTo(L * 0.9, -H * 1.0, -L * 0.3, -H * 1.05, -L * 0.62, -H * 0.75);
    for (var i = 0; i <= 8; i++) { var a = -0.75 + i * 1.5 / 8; ctx.lineTo(-L * (0.68 + 0.06 * (i % 2)), H * a); }   // the clavus: a scalloped rudder
    ctx.bezierCurveTo(-L * 0.3, H * 1.05, L * 0.9, H * 1.0, L * 0.95, H * 0.1);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, -H, 0, H); g.addColorStop(0, lk.back); g.addColorStop(0.5, lk.col); g.addColorStop(1, lk.belly);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = rgba(lk.edge, 0.7); ctx.lineWidth = o.lw * 0.7; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,0.12)'; for (i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(-L * 0.4 + hash(i, 2) * L * 1.2, -H * 0.7 + hash(i, 3) * H * 1.4, H * 0.1, 0, TAU); ctx.fill(); } ctx.restore();
    ctx.fillStyle = rgba(lk.fin, 0.8); ctx.beginPath(); ctx.ellipse(L * 0.4, H * 0.05, L * 0.1, H * 0.16, 0.6 + Math.sin(t * 2) * 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c8b870'; ctx.beginPath(); ctx.arc(L * 0.68, -H * 0.22, Math.max(1, H * 0.08), 0, TAU); ctx.fill();
    ctx.fillStyle = '#06080a'; ctx.beginPath(); ctx.arc(L * 0.69, -H * 0.22, Math.max(0.7, H * 0.05), 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(lk.edge, 0.8); ctx.beginPath(); ctx.arc(L * 0.92, H * 0.05, H * 0.05, -1, 1); ctx.stroke();
  }

  // ---------- manta ray: wide wings that beat up and down ----------
  function drawRay(ctx, lk, len, o) {
    var L = len / 2, flap = Math.sin(o.ph * TAU * 0.6), W = len * 0.55;
    var wing = function (dir) {
      var tipY = -dir * W * (0.35 + 0.55 * flap * dir);
      ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.quadraticCurveTo(L * 0.1, tipY * 0.6, -L * 0.15, tipY);
      ctx.quadraticCurveTo(-L * 0.25, tipY * 0.4, -L * 0.55, 0); ctx.closePath();
    };
    ctx.lineWidth = o.lw * 0.6;
    wing(-1); ctx.fillStyle = shade(lk.col, -0.1); ctx.fill();
    // tail, body
    ctx.strokeStyle = lk.back; ctx.lineWidth = Math.max(0.8, len * 0.012); ctx.beginPath(); ctx.moveTo(-L * 0.5, 0); ctx.quadraticCurveTo(-L * 0.9, Math.sin(o.t * 2) * len * 0.03, -L * 1.3, 0); ctx.stroke();
    ctx.lineWidth = o.lw * 0.6;
    ctx.beginPath(); ctx.ellipse(0, 0, L * 0.55, len * 0.09, 0, 0, TAU);
    var g = ctx.createLinearGradient(0, -len * 0.09, 0, len * 0.09); g.addColorStop(0, lk.back); g.addColorStop(0.6, lk.col); g.addColorStop(1, lk.belly);
    ctx.fillStyle = g; ctx.fill();
    wing(1); var g2 = ctx.createLinearGradient(0, -W, 0, W); g2.addColorStop(0, lk.back); g2.addColorStop(0.5, lk.col); g2.addColorStop(1, lk.belly); ctx.fillStyle = g2; ctx.fill();
    ctx.strokeStyle = rgba('#000000', 0.35); ctx.stroke();
    // cephalic fins (the "horns") and a pale shoulder patch
    ctx.fillStyle = lk.back; ctx.beginPath(); ctx.ellipse(L * 0.6, -len * 0.04, L * 0.1, len * 0.025, -0.4, 0, TAU); ctx.ellipse(L * 0.6, len * 0.04, L * 0.1, len * 0.025, 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(240,240,240,0.35)'; ctx.beginPath(); ctx.ellipse(L * 0.2, -len * 0.05, L * 0.15, len * 0.04, 0.3, 0, TAU); ctx.fill();
  }

  // ---------- flatfish: an oval disc with a fringe of fin, both eyes on top ----------
  function drawFlat(ctx, lk, len, o) {
    var L = len / 2, H = len * 0.28, w = Math.sin(o.ph * TAU) * H * 0.08, i;
    ctx.beginPath();
    for (i = 0; i <= 24; i++) {   // the rippling fringe all round
      var a = i / 24 * TAU, r = 1.12 + 0.05 * Math.sin(a * 9 + o.t * 6);
      var x = Math.cos(a) * L * 0.85 * r, y = Math.sin(a) * H * r + w * Math.cos(a);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.fillStyle = rgba(lk.fin, 0.85); ctx.fill();
    tail(ctx, Object.assign({}, lk, { tail: 'round', ped: 0.2 }), { L: L, H: H * 0.7, xp: -L * 0.85, wave: function () { return w; }, ped: 0.2, detail: false }, o.ph, o.sw, o.t);
    ctx.beginPath(); ctx.ellipse(0, w * 0.3, L * 0.85, H, 0, 0, TAU);
    var g = ctx.createLinearGradient(0, -H, 0, H); g.addColorStop(0, lk.back); g.addColorStop(1, lk.col); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    var fake = { L: L, H: H };
    for (i = 0; i < lk.pat.length; i++) drawPattern(ctx, lk, fake, lk.pat[i], o.px > 40);
    ctx.restore();
    ctx.strokeStyle = rgba(lk.edge, 0.7); ctx.lineWidth = o.lw * 0.6; ctx.stroke();
    for (i = 0; i < 2; i++) {
      var ex = L * (0.6 - i * 0.08), ey = -H * (0.55 - i * 0.35);
      ctx.fillStyle = '#d8c060'; ctx.beginPath(); ctx.arc(ex, ey, Math.max(0.8, H * 0.12), 0, TAU); ctx.fill();
      ctx.fillStyle = '#06080a'; ctx.beginPath(); ctx.arc(ex, ey, Math.max(0.6, H * 0.075), 0, TAU); ctx.fill();
    }
  }

  // ---------- moon jellyfish and lion's mane: a pulsing see-through bell ----------
  function drawJelly(ctx, lk, len, o, sp) {
    var R = len * 0.42, pulse = Math.sin(o.t * 2.6), sx = 1 + 0.1 * pulse, sy = 1 - 0.12 * pulse, i, mane = sp.id === 'lionsmane';
    var bell = mane ? '#d8783a' : (lk.col || '#dfeaf5'), gon = mane ? '#f7c87a' : (lk.fin || '#c98fc0');
    // tentacles first, behind the bell
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(mane ? '#e8a060' : '#e8f0ff', mane ? 0.55 : 0.45); ctx.lineWidth = Math.max(0.5, o.lw * 0.4);
    var count = mane ? 22 : 16, longT = mane ? 3.2 : 0.55;
    ctx.beginPath();
    for (i = 0; i < count; i++) {
      var x0 = -R * sx * 0.95 + i * (2 * R * sx * 0.95) / (count - 1), wob = Math.sin(o.t * 1.7 + i * 0.7) * R * 0.25;
      ctx.moveTo(x0, R * 0.05); ctx.bezierCurveTo(x0 + wob, R * longT * 0.4, x0 - wob, R * longT * 0.7, x0 + wob * 0.5, R * longT);
    }
    ctx.stroke();
    // oral arms
    ctx.strokeStyle = rgba(mane ? '#c85a2a' : '#f0e0f0', 0.6); ctx.lineWidth = Math.max(0.8, R * 0.09);
    ctx.beginPath();
    for (i = 0; i < 4; i++) { var ax = (i - 1.5) * R * 0.18; ctx.moveTo(ax, R * 0.05); ctx.quadraticCurveTo(ax + Math.sin(o.t + i) * R * 0.2, R * (mane ? 1.2 : 0.6), ax, R * (mane ? 1.8 : 0.9)); }
    ctx.stroke();
    // the bell
    ctx.beginPath(); ctx.ellipse(0, 0, R * sx, R * 0.75 * sy, 0, Math.PI, 0);
    ctx.quadraticCurveTo(0, R * 0.2, -R * sx, 0); ctx.closePath();
    var g = ctx.createRadialGradient(0, -R * 0.35, R * 0.1, 0, -R * 0.1, R * 1.1);
    g.addColorStop(0, rgba(bell, 0.75)); g.addColorStop(0.7, rgba(bell, 0.45)); g.addColorStop(1, rgba(bell, 0.25));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = Math.max(0.5, o.lw * 0.5); ctx.stroke();
    if (!mane) {   // the four horseshoe gonads of a moon jelly
      ctx.strokeStyle = rgba(gon, 0.85); ctx.lineWidth = Math.max(0.6, R * 0.07);
      for (i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc((i - 1.5) * R * 0.38, -R * 0.28 * sy, R * 0.13, Math.PI * 0.1, Math.PI * 1.9); ctx.stroke(); }
    } else {
      ctx.fillStyle = rgba(gon, 0.5); ctx.beginPath(); ctx.ellipse(0, -R * 0.3 * sy, R * 0.5, R * 0.25, 0, 0, TAU); ctx.fill();
    }
  }

  // ---------- green sea turtle ----------
  function drawTurtle(ctx, lk, len, o) {
    var L = len / 2, H = len * 0.3, stroke = Math.sin(o.ph * TAU * 0.5), i;
    ctx.lineWidth = o.lw * 0.6; ctx.strokeStyle = rgba('#1e2810', 0.7);
    var flipper = function (x, y, ln, wd, ang, far) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(0, -wd * 0.4); ctx.quadraticCurveTo(-ln * 0.4, -wd, -ln, wd * 0.2); ctx.quadraticCurveTo(-ln * 0.4, wd * 0.6, 0, wd * 0.4); ctx.closePath();
      ctx.fillStyle = far ? shade(lk.skin, -0.25) : lk.skin; ctx.fill(); ctx.stroke(); ctx.restore();
    };
    flipper(L * 0.35, -H * 0.2, L * 0.9, H * 0.45, -0.6 - stroke * 0.7, true);   // far front flipper
    flipper(-L * 0.6, 0, L * 0.35, H * 0.3, -0.2, true);
    // head
    ctx.beginPath(); ctx.ellipse(L * 0.98, -H * 0.05, L * 0.2, H * 0.3, 0.1, 0, TAU); ctx.fillStyle = lk.skin; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#10140a'; ctx.beginPath(); ctx.arc(L * 1.06, -H * 0.12, Math.max(0.8, H * 0.06), 0, TAU); ctx.fill();
    // shell: domed carapace with scutes
    ctx.beginPath(); ctx.moveTo(L * 0.8, H * 0.3); ctx.bezierCurveTo(L * 0.7, -H * 1.1, -L * 0.8, -H * 1.0, -L * 0.85, H * 0.3); ctx.quadraticCurveTo(0, H * 0.55, L * 0.8, H * 0.3);
    var g = ctx.createLinearGradient(0, -H, 0, H * 0.4); g.addColorStop(0, lk.back); g.addColorStop(1, lk.col);
    ctx.fillStyle = g; ctx.fill(); ctx.stroke();
    if (o.px > 30) {
      ctx.save(); ctx.clip(); ctx.strokeStyle = rgba('#e8d8a0', 0.4); ctx.lineWidth = o.lw * 0.7; ctx.beginPath();
      for (i = -2; i <= 2; i++) { ctx.moveTo(i * L * 0.3, -H); ctx.lineTo(i * L * 0.3 + L * 0.05, H * 0.4); }
      ctx.moveTo(-L, -H * 0.35); ctx.quadraticCurveTo(0, -H * 0.55, L, -H * 0.35); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = lk.belly; ctx.beginPath(); ctx.moveTo(L * 0.78, H * 0.3); ctx.quadraticCurveTo(0, H * 0.62, -L * 0.82, H * 0.3); ctx.quadraticCurveTo(0, H * 0.45, L * 0.78, H * 0.3); ctx.fill();
    flipper(L * 0.4, H * 0.25, L * 1.0, H * 0.5, 0.5 + stroke * 0.7, false);    // near front flipper
    flipper(-L * 0.55, H * 0.3, L * 0.4, H * 0.32, 0.4, false);
  }

  // ---------- squid ----------
  function drawSquid(ctx, sp, len, o) {
    var L = len / 2, H = len * 0.13, i, pulse = Math.sin(o.ph * TAU) * 0.1;
    var col = sp.col || '#c99cd8';
    ctx.lineCap = 'round'; ctx.strokeStyle = rgba(shade(col, 0.2), 0.85); ctx.lineWidth = Math.max(0.6, H * 0.18);
    ctx.beginPath();
    for (i = 0; i < 8; i++) { var y0 = (i - 3.5) * H * 0.18, wv = Math.sin(o.t * 4 + i) * H * 0.35; ctx.moveTo(-L * 0.25, y0); ctx.quadraticCurveTo(-L * 0.6, y0 * 1.6 + wv, -L * (0.85 + (i === 3 || i === 4 ? 0.35 : 0)), y0 * 1.2 + wv * 1.5); }
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-L * 0.3, -H * 0.8); ctx.quadraticCurveTo(L * 0.4, -H * (1.2 + pulse), L * 0.95, 0); ctx.quadraticCurveTo(L * 0.4, H * (1.2 + pulse), -L * 0.3, H * 0.8); ctx.closePath();
    var g = ctx.createLinearGradient(0, -H, 0, H); g.addColorStop(0, shade(col, -0.2)); g.addColorStop(1, shade(col, 0.4)); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = rgba(shade(col, -0.45), 0.35); for (i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc(-L * 0.2 + hash(i, 1) * L, -H + hash(i, 2) * 2 * H, H * 0.12, 0, TAU); ctx.fill(); } ctx.restore();
    ctx.fillStyle = rgba(shade(col, 0.2), 0.9); ctx.beginPath(); ctx.moveTo(L * 0.95, 0); ctx.lineTo(L * 0.55, -H * 1.3); ctx.lineTo(L * 0.5, 0); ctx.lineTo(L * 0.55, H * 1.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f6f0d8'; ctx.beginPath(); ctx.arc(-L * 0.2, -H * 0.2, Math.max(1, H * 0.35), 0, TAU); ctx.fill();
    ctx.fillStyle = '#10141a'; ctx.beginPath(); ctx.arc(-L * 0.2, -H * 0.2, Math.max(0.7, H * 0.2), 0, TAU); ctx.fill();
  }

  // ---------- the cheap version for fish only a few pixels long ----------
  function drawTiny(ctx, lk, len) {
    var L = len / 2, H = Math.max(0.6, len * Math.min(lk.hr || 0.4, 0.8) / 2);
    ctx.fillStyle = lk.col;
    ctx.beginPath(); ctx.ellipse(0, 0, L, H, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = lk.tailCol || lk.fin;
    ctx.beginPath(); ctx.moveTo(-L * 0.8, 0); ctx.lineTo(-L * 1.3, -H); ctx.lineTo(-L * 1.3, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lk.back; ctx.beginPath(); ctx.ellipse(0, -H * 0.4, L * 0.8, H * 0.45, 0, 0, TAU); ctx.fill();
  }

  function draw(ctx, sp, len, o) {
    var lk = lookOf(sp);
    if (!lk) return false;
    if (lk.body === 'jelly') { drawJelly(ctx, lk, len, o, sp); return true; }
    if (lk.body === 'turtle') { drawTurtle(ctx, lk, len, o); return true; }
    if (lk.body === 'squid') { drawSquid(ctx, sp, len, o); return true; }
    if (o.px < 9 && lk.body !== 'oar' && lk.body !== 'ray') { drawTiny(ctx, lk, len); return true; }
    if (lk.body === 'eel') drawEel(ctx, lk, len, o);
    else if (lk.body === 'oar') drawOar(ctx, lk, len, o);
    else if (lk.body === 'mola') drawMola(ctx, lk, len, o);
    else if (lk.body === 'ray') drawRay(ctx, lk, len, o);
    else if (lk.body === 'flat') drawFlat(ctx, lk, len, o);
    else drawFish(ctx, lk, len, o);
    return true;
  }

  // Tail beats a second: faster when swimming hard, slower for big fish.
  function beat(speed, len) {
    return (1.2 + Math.min(3.5, speed / 45)) / (1 + len / 260);
  }

  window.FishArt = { draw: draw, beat: beat, lookOf: lookOf, setStyle: setStyle, style: function () { return style; }, LOOKS: LOOKS };
})();
