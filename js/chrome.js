// Plays one of three ASCII Magic pieces (MIT), picked at random on each load, as real
// page text at the top of the console: their player in dom mode rewrites a <pre> each
// frame instead of painting a canvas, so it uses the page font and is selectable like
// everything else. The art is part of the page, not printed output, so it stays
// through whoami and clear.
import { play } from 'https://www.ascii-magic.com/ascii/player.js';

const BASE = 'https://www.ascii-magic.com/ascii/pieces/';
const PIECES = ['liquid-chrome', 'torus-knot', 'klein-bottle'];
// gamma 1.15 matches the old contrast="100". mono skips the pieces' colour spans (the
// art is shown grayscale anyway), so each frame is one plain-text update.
const LOOK = { look: 'dense', gamma: 1.15, mono: true };
// The dense look's glyphs from faint to heavy, split into the art's three layers
// (light, mid, red in the HTML): mid tones rose, faint glyphs red (for liquid-chrome
// only those inside the shape, see split()), the rest text colour.
const DARK = new Set(".'`^\",:;Il!i");
const MID = new Set('><~+_-?][}{1)(|/tfjrxnuvcz');
// Gaps in the shape up to about twice this many cells wide are treated as closed when
// telling the inside of the shape from the backdrop.
const GAP = 2;

// A copy of the w x h mask with every set cell grown into a square of radius r.
function grow(mask, w, h, r) {
  const rowsGrown = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) rowsGrown[y * w + xx] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!rowsGrown[y * w + x]) continue;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) out[yy * w + x] = 1;
    }
  }
  return out;
}

// Splits one frame into the three layers' text. With keepBackdrop, faint glyphs in the
// backdrop and on the shape's outer edge stay text colour; otherwise every faint glyph
// is red.
function split(frame, keepBackdrop) {
  const rows = frame.split('\n');
  const inside = keepBackdrop ? insideShape(rows) : () => true;
  const light = [], mid = [], red = [];
  rows.forEach((r, y) => {
    let l = '', m = '', d = '';
    for (let x = 0; x < r.length; x++) {
      const c = r[x];
      if (MID.has(c)) { l += ' '; m += c; d += ' '; }
      else if (DARK.has(c) && inside(x, y)) { l += ' '; m += ' '; d += c; }
      else { l += c; m += ' '; d += ' '; }
    }
    light.push(l); mid.push(m); red.push(d);
  });
  return [light.join('\n'), mid.join('\n'), red.join('\n')];
}

// Returns inside(x, y): whether a cell of the frame (as rows) is inside the shape rather
// than in the backdrop or on the shape's outer edge.
function insideShape(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  // heavy[i]: the cell holds something other than a space or a faint glyph
  const heavy = new Uint8Array(w * h);
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      if (r[x] !== ' ' && !DARK.has(r[x])) heavy[y * w + x] = 1;
    }
  });
  // Find the backdrop: thicken the heavy cells by GAP so small gaps in the shape close,
  // flood in from the frame's edges around that, then grow the flooded area back by
  // GAP + 1. That covers the backdrop and the shape's outer border up to its first heavy
  // glyphs; faint glyphs it doesn't cover are inside the shape.
  const blocked = grow(heavy, w, h, GAP);
  const far = new Uint8Array(w * h);
  const stack = [];
  const visit = (x, y) => {
    const i = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || far[i] || blocked[i]) return;
    far[i] = 1;
    stack.push(x, y);
  };
  for (let x = 0; x < w; x++) { visit(x, 0); visit(x, h - 1); }
  for (let y = 0; y < h; y++) { visit(0, y); visit(w - 1, y); }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    visit(x - 1, y); visit(x + 1, y); visit(x, y - 1); visit(x, y + 1);
  }
  const outside = grow(far, w, h, GAP + 1);
  return (x, y) => !outside[y * w + x];
}

const art = document.querySelector('#console > .chrome-art');
if (art) {
  const layers = [...art.children];
  const name = PIECES[Math.floor(Math.random() * PIECES.length)];
  // Only liquid-chrome's dotted backdrop is kept out of the red; the other two read
  // better with every faint glyph red.
  const keepBackdrop = name === 'liquid-chrome';
  play(layers[0], await import(`${BASE}${name}.js`), {
    dom: true,
    look: LOOK,
    maxFps: 24,
    onFrame: (f) => {
      split(f, keepBackdrop).forEach((text, i) => { layers[i].textContent = text; });
    },
  });
}
