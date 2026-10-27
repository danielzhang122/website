// Plays one of three ASCII Magic pieces (MIT), picked at random on each load, as real
// page text at the top of the console: their player in dom mode rewrites a <pre> each
// frame instead of painting a canvas, so it uses the page font and is selectable like
// everything else. The <pre> is part of the page, not printed output, so it stays
// through whoami and clear.
import { play } from 'https://www.ascii-magic.com/ascii/player.js';

const BASE = 'https://www.ascii-magic.com/ascii/pieces/';
const PIECES = ['liquid-chrome', 'torus-knot', 'klein-bottle'];
// gamma 1.15 matches the old contrast="100". mono skips the pieces' colour spans (the
// art is shown grayscale anyway), so each frame is one plain-text update.
const LOOK = { look: 'dense', gamma: 1.15, mono: true };

const pre = document.querySelector('#console > .chrome-art');
if (pre) {
  const name = PIECES[Math.floor(Math.random() * PIECES.length)];
  play(pre, await import(`${BASE}${name}.js`), { dom: true, look: LOOK, maxFps: 24 });
}
