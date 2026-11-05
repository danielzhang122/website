// Plays one of three ASCII Magic pieces (MIT), picked at random on each load, as real
// page text at the top of the console: their player in dom mode rewrites a <pre> each
// frame instead of painting a canvas, so it uses the page font and is selectable like
// everything else. The art is part of the page, not printed output, so it stays
// through whoami and clear. The hidden mercury, klein and torus commands print the same
// pieces into the console through window.ChromeArt.
import { play, frameText } from 'https://www.ascii-magic.com/ascii/player.js';

const BASE = 'https://www.ascii-magic.com/ascii/pieces/';
const PIECES = ['liquid-chrome', 'torus-knot', 'klein-bottle'];
// gamma 1.15 matches the old contrast="100". mono skips the pieces' colour spans (the
// art is shown grayscale anyway), so each frame is one plain-text update. liquid-chrome
// turns it off to read which cells are backdrop (see playPiece).
const LOOK = { look: 'dense', gamma: 1.15, mono: true };
// The dense look's glyphs from faint to heavy, split into the art's three layers
// (light, mid, red in the HTML): mid tones rose, faint glyphs red, the rest text colour.
// liquid-chrome's backdrop is the exception: it always stays text colour (see split()).
const DARK = new Set(".'`^\",:;Il!i");
const MID = new Set('><~+_-?][}{1)(|/tfjrxnuvcz');
// Marks a cell still building in (shown as a red dot); no piece draws this character.
const BUILDING = '\u0001';
// liquid-chrome paints its backdrop in a four-step "bg" gradient starting at this colour
// and the mercury in other colours, so a cell's colour key says exactly which it is.
const BACKDROP_FIRST = '#0a0912';

// The colour keys liquid-chrome uses for its backdrop (empty if the piece ever changes).
function backdropKeys(palette) {
  const keys = Object.keys(palette);
  const i = keys.findIndex((k) => String(palette[k]).toLowerCase() === BACKDROP_FIRST);
  return new Set(i < 0 ? [] : keys.slice(i, i + 4));
}

// Splits one frame's text into the three layers' text. color holds the frame's colour
// keys (liquid-chrome only); cells drawn in a backdrop colour stay text colour.
function split(text, color, backdrop) {
  const rows = text.split('\n');
  const keys = color ? color.split('\n') : null;
  const light = [], mid = [], red = [];
  rows.forEach((r, y) => {
    const k = keys ? [...keys[y]] : null;
    let l = '', m = '', d = '';
    for (let x = 0; x < r.length; x++) {
      const c = r[x];
      if (c === BUILDING) { l += ' '; m += ' '; d += '·'; }
      else if (k && backdrop.has(k[x])) { l += c; m += ' '; d += ' '; }
      else if (MID.has(c)) { l += ' '; m += c; d += ' '; }
      else if (DARK.has(c)) { l += ' '; m += ' '; d += c; }
      else { l += c; m += ' '; d += ' '; }
    }
    light.push(l); mid.push(m); red.push(d);
  });
  return [light.join('\n'), mid.join('\n'), red.join('\n')];
}

// The build-in, timed like the name art: cells start top to bottom, left to right, over
// BUILD ms (plus JITTER), show a red dot for SETTLE ms, then their glyph.
const BUILD = 900;
const JITTER = 90;
const SETTLE = 220;

// Waits for the next animation frame, or 50 ms if a background tab pauses frames.
const nextFrame = () => new Promise((resolve) => {
  const fallback = setTimeout(resolve, 50);
  requestAnimationFrame(() => { clearTimeout(fallback); resolve(); });
});

// Plays piece in art (a .chrome-art with its three <pre> layers). With build, the first
// frame assembles itself before the animation starts from that same frame; skip()
// returning true finishes the build at once, and ready() runs once the art has its full
// size. Resolves to the player's stop function.
async function playPiece(art, piece, { build = false, skip = () => false, ready = () => {} } = {}) {
  const layers = [...art.children];
  // draw() replaces whatever the player writes here, so don't let it build that DOM every frame.
  Object.defineProperty(layers[0], 'innerHTML', { set() {} });
  const mod = await import(`${BASE}${piece}.js`);
  // Only liquid-chrome's dotted backdrop is kept out of the red (the other two read better
  // with every faint glyph red), so only it needs the frames' colour keys.
  const backdrop = piece === 'liquid-chrome' ? backdropKeys(mod.meta.palette) : new Set();
  const look = backdrop.size ? { ...LOOK, mono: false } : LOOK;
  const colorOf = (f) => (backdrop.size && typeof f !== 'string' ? f.color : null);
  const draw = (text, color) => split(text, color, backdrop).forEach((t, i) => { layers[i].textContent = t; });
  const opts = { dom: true, look, maxFps: 24, onFrame: (f) => draw(frameText(f), colorOf(f)) };
  if (build) {
    let first = '', firstColor = null;
    play(layers[0], mod, { ...opts, still: true, onFrame: (f) => { first = frameText(f); firstColor = colorOf(f); } });
    const rows = first.split('\n');
    const cols = Math.max(...rows.map((r) => r.length));
    const starts = rows.map((r, y) => [...r].map((_, x) => ((y + x / cols) / rows.length) * BUILD + Math.random() * JITTER));
    ready();   // the still frame already gives the art its full size
    const startedAt = performance.now();
    for (let t = 0; t < BUILD + JITTER + SETTLE && !skip(); t = performance.now() - startedAt) {
      draw(rows.map((r, y) => [...r].map((c, x) => (c === ' ' || t >= starts[y][x] + SETTLE ? c : t >= starts[y][x] ? BUILDING : ' ')).join('')).join('\n'), firstColor);
      await nextFrame();
    }
  }
  // Off screen the player only stops drawing and its frame loop keeps the page awake, so stop it
  // there and resume from the same moment.
  let t0 = 0;
  const start = () => play(layers[0], mod, { ...opts, t0, onFrame: (f, t) => { t0 = t; opts.onFrame(f); } });
  let stop = start();
  if (!build) ready();
  const seen = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) { stop?.(); stop = null; } else if (!stop) stop = start();
  }, { rootMargin: '100px' });
  seen.observe(art);
  return () => { seen.disconnect(); stop?.(); };
}

window.ChromeArt = { playPiece };

const art = document.querySelector('#console > .chrome-art');
// Hidden at phone widths (see style.css), so hold off there: a player's frame loop never sleeps.
const wide = matchMedia('(min-width: 641px)');
function startArt() {
  if (!wide.matches) return;
  wide.removeEventListener('change', startArt);
  playPiece(art, PIECES[Math.floor(Math.random() * PIECES.length)]);
}
if (art) {
  wide.addEventListener('change', startArt);
  startArt();
}
