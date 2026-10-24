// Types and deletes a rotating list of words at the end of the hero terminal.
(() => {
  'use strict';

  const WORDS = [
    'robots',
    'mechanical parts',
    'nuclear tooling',
    'things that survive hardware testing',
    'excuses to buy more servos',
  ];
  const TYPE_DELAY = 70;      // ms per character typed
  const DELETE_DELAY = 35;    // ms per character deleted
  const HOLD_FULL = 1400;     // pause once a word is fully typed
  const HOLD_EMPTY = 300;     // pause before typing the next word

  const output = document.getElementById('terminal-typed');
  let wordIndex = 0;
  let length = 0;
  let deleting = false;

  function tick() {
    const word = WORDS[wordIndex];
    length += deleting ? -1 : 1;
    output.textContent = word.slice(0, length);

    let delay = deleting ? DELETE_DELAY : TYPE_DELAY;
    if (!deleting && length === word.length) {
      deleting = true;
      delay = HOLD_FULL;
    } else if (deleting && length === 0) {
      deleting = false;
      wordIndex = (wordIndex + 1) % WORDS.length;
      delay = HOLD_EMPTY;
    }
    setTimeout(tick, delay);
  }

  tick();
})();

// Drag the terminal around by its title bar. Double-click the bar to send it home.
(() => {
  'use strict';

  const terminal = document.querySelector('.terminal');
  const handle = terminal.querySelector('header');
  const NAV_HEIGHT = 56; // keep the title bar reachable below the sticky nav

  let offsetX = 0;
  let offsetY = 0;
  let grabX = 0;
  let grabY = 0;
  let limits = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function moveTo(x, y) {
    offsetX = x;
    offsetY = y;
    terminal.style.translate = x || y ? `${x}px ${y}px` : '';
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    grabX = e.clientX - offsetX;
    grabY = e.clientY - offsetY;

    // Work out how far it can travel before leaving the viewport.
    const rect = terminal.getBoundingClientRect();
    limits = {
      minX: offsetX - rect.left,
      maxX: offsetX + innerWidth - rect.right,
      minY: offsetY - rect.top + NAV_HEIGHT,
      maxY: offsetY + innerHeight - rect.top - handle.offsetHeight,
    };

    handle.setPointerCapture(e.pointerId);
    terminal.classList.add('is-dragging');
  });

  handle.addEventListener('pointermove', (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    moveTo(
      clamp(e.clientX - grabX, limits.minX, limits.maxX),
      clamp(e.clientY - grabY, limits.minY, limits.maxY),
    );
  });

  const release = () => terminal.classList.remove('is-dragging');
  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);

  handle.addEventListener('dblclick', () => moveTo(0, 0));
})();
