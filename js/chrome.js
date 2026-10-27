// Plays ASCII Magic's "liquid-chrome" piece (MIT) as real page text: their player
// in dom mode rewrites a <pre> each frame instead of painting a canvas, so it uses
// the page font and is selectable like everything else.
//
// The banner holding the <pre> is printed (cloned) into #screen by js/terminal.js,
// and printed again after `clear` or a session restore, so each printed copy is
// started when it appears and stopped when it's removed.
import { play } from 'https://www.ascii-magic.com/ascii/player.js';
import * as piece from 'https://www.ascii-magic.com/ascii/pieces/liquid-chrome.js';

const screen = document.getElementById('screen');
const OPTIONS = { dom: true, look: { look: 'dense', gamma: 1.15 } };  // gamma 1.15 = contrast 100
const playing = new Map();   // <pre> -> stop()

function start(pre) {
  if (!playing.has(pre)) playing.set(pre, play(pre, piece, OPTIONS));
}

function sweep(root, action) {
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches('.chrome-art')) action(root);
  root.querySelectorAll('.chrome-art').forEach(action);
}

function stop(pre) {
  playing.get(pre)?.();
  playing.delete(pre);
}

new MutationObserver((records) => {
  for (const { addedNodes, removedNodes } of records) {
    removedNodes.forEach((node) => sweep(node, stop));
    addedNodes.forEach((node) => sweep(node, start));
  }
}).observe(screen, { childList: true });

// The banner may already be printed by the time this module finishes loading.
sweep(screen, start);
