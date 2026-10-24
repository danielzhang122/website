// Types and deletes a rotating list of words at the end of the hero terminal.
(() => {
  'use strict';

  const WORDS = ['robots', 'mechanical parts', 'nuclear tooling', 'things that survive hardware testing'];
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
