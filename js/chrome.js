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
// (light, mid, red in the HTML): dark areas red, mid tones rose, the rest text colour.
const DARK = ".'`^\",:;Il!i";
const MID = '><~+_-?][}{1)(|/tfjrxnuvcz';
const keep = (chars) => new RegExp(`[^${(chars + '\n').replace(/[\]\\^-]/g, '\\$&')}]`, 'g');
const drop = (chars) => new RegExp(`[${chars.replace(/[\]\\^-]/g, '\\$&')}]`, 'g');
const ONLY_DARK = keep(DARK);
const ONLY_MID = keep(MID);
const NOT_LIGHT = drop(DARK + MID);

const art = document.querySelector('#console > .chrome-art');
if (art) {
  const [light, mid, red] = art.children;
  const name = PIECES[Math.floor(Math.random() * PIECES.length)];
  play(light, await import(`${BASE}${name}.js`), {
    dom: true,
    look: LOOK,
    maxFps: 24,
    // Split each frame into three plain-text layers by how heavy each glyph is.
    onFrame: (f) => {
      light.textContent = f.replace(NOT_LIGHT, ' ');
      mid.textContent = f.replace(ONLY_MID, ' ');
      red.textContent = f.replace(ONLY_DARK, ' ');
    },
  });
}
