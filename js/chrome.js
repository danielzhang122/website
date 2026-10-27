// Plays ASCII Magic's "liquid-chrome" piece (MIT) as real page text at the top of the
// console: their player in dom mode rewrites a <pre> each frame instead of painting a
// canvas, so it uses the page font and is selectable like everything else. The <pre>
// is part of the page, not printed output, so it stays through whoami and clear.
import { play } from 'https://www.ascii-magic.com/ascii/player.js';
import * as piece from 'https://www.ascii-magic.com/ascii/pieces/liquid-chrome.js';

const pre = document.querySelector('#console > .chrome-art');
// gamma 1.15 matches the old contrast="100"
if (pre) play(pre, piece, { dom: true, look: { look: 'dense', gamma: 1.15 } });
