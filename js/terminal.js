// The site as an old console: each command prints a [data-cmd] section from
// #content into #screen. Shortcut buttons type their command out and run it,
// and #name in the URL runs that command on load, so sections can be linked.
(() => {
  'use strict';

  const screen = document.getElementById('screen');
  const form = document.getElementById('prompt');
  const input = document.getElementById('cmd');
  const cursor = form.querySelector('.cursor');
  const content = document.getElementById('content');
  const lightbox = document.getElementById('lightbox');

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;

  const BLOCK_DELAY = reduceMotion ? 0 : 3;   // ms between printed blocks
  const BOOT_DELAY = reduceMotion ? 0 : 22;   // slower, so the first screen visibly builds line by line
  const TYPE_DELAY = reduceMotion ? 0 : 12;   // ms per character when a shortcut types a command
  const BLOCKS = '.chrome-art, h1, h2, h3, p, figure, .row, .thumbs > *';

  const SECTIONS = ['whoami', 'projects', 'hardware', 'experience', 'skills', 'certs', 'resume', 'art', 'contact'];

  const COMMANDS = {
    help: { help: 'list commands', run: printHelp },
    whoami: { help: 'who i am', run: printWhoami },
    projects: { help: 'things i have built', run: () => printSection('projects') },
    hardware: { help: 'bench work and cad', run: () => printSection('hardware') },
    experience: { help: 'work and school', run: () => printSection('experience') },
    skills: { help: 'tools and standards', run: () => printSection('skills') },
    certs: { help: 'certifications', run: () => printSection('certs') },
    resume: { help: 'one-page pdf', run: () => printSection('resume') },
    art: { help: 'painting, drawing, carving', run: () => printSection('art') },
    contact: { help: 'email and links', run: () => printSection('contact') },
    clear: { help: 'clear the screen', run: clear },
  };
  const ALIASES = { ls: 'help', '?': 'help', about: 'whoami', cls: 'clear', cv: 'resume' };

  // Easter eggs: work when typed, but stay out of help and tab completion.
  const HIDDEN = {
    name: printNameArt,
    zhuoyuan: printNameArt,
    '张卓远': printNameArt,
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ---------- printing ---------- */

  let fastForward = false;   // set when a new command arrives mid-print
  let pace = BOOT_DELAY;     // ms between blocks; drops to BLOCK_DELAY once the first screen is up
  let restoring = false;     // re-printing a saved session after a refresh: instant, no scrolling

  // Appends a node, then uncovers its blocks one at a time like a slow terminal.
  async function reveal(node) {
    const blocks = [...node.querySelectorAll(BLOCKS)];
    const delay = restoring ? 0 : pace;
    if (delay) blocks.forEach((b) => b.classList.add('pending'));
    screen.appendChild(node);
    for (const block of blocks) {
      block.classList.remove('pending');
      if (delay && !fastForward) await wait(delay);
    }
  }

  // Autoplaying videos only decode while they're on screen.
  const videoObserver = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) target.play().catch(() => {}); // autoplay can be refused
      else target.pause();
    }
  }, { rootMargin: '200px' });

  async function printSection(name) {
    const copy = content.querySelector(`[data-cmd="${name}"]`).cloneNode(true);
    copy.removeAttribute('data-cmd');
    copy.classList.add('output');
    // Videos in #content stay idle; printed copies play.
    copy.querySelectorAll('video').forEach((video) => { video.autoplay = true; });
    await reveal(copy);
    copy.querySelectorAll('video').forEach((video) => videoObserver.observe(video));
  }

  // The banner (art and name) comes with whoami, so it can be brought back after clear.
  async function printWhoami() {
    await printSection('banner');
    await printSection('whoami');
  }

  function printLine(text, className = '') {
    const line = document.createElement('p');
    line.className = className;
    line.textContent = text;
    return reveal(line);
  }

  function echo(text) {
    const line = document.createElement('p');
    line.className = 'cmdline';
    const ps = document.createElement('span');
    ps.className = 'ps';
    ps.textContent = '>';
    line.append(ps, ` ${text}`);
    screen.appendChild(line);
    return line;
  }

  function printHelp() {
    const list = document.createElement('div');
    list.className = 'output';
    for (const [name, { help }] of Object.entries(COMMANDS)) {
      const row = document.createElement('div');
      row.className = 'row';
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'key cmd';
      key.dataset.run = name;
      key.textContent = name;
      const desc = document.createElement('p');
      desc.className = 'dim';
      desc.textContent = help;
      row.append(key, desc);
      list.appendChild(row);
    }
    return reveal(list);
  }

  // Puts the command in the address bar so the section can be linked. The URL is
  // built from location so a <base> tag can't point it at another page.
  function setHash(name) {
    const url = location.pathname + location.search + (name ? `#${name}` : '');
    try {
      history.replaceState(null, '', url);
    } catch {
      // some file:// setups refuse URL changes; linking just won't update
    }
  }

  // Easter egg: prints the intro's 张卓远 animation into the console as text, at the
  // same 13px as the Liquid Chrome art, and leaves the finished frame in the scrollback.
  function printNameArt(line) {
    const art = window.IntroArt;
    if (!art) return printLine('name art is unavailable.', 'dim');
    const { CELL_FADE, TYPE_START, TYPE_SPEED, LABEL } = art.timing;

    const charW = 13 * 0.6;     // IBM Plex Mono advance width at 13px
    const charH = 13 * 1.15;    // matches .name-art line-height
    // A narrow console (phones) stacks the glyphs vertically so each gets the full width.
    const vertical = screen.clientWidth < 520;
    const glyphCols = vertical
      ? Math.max(10, Math.min(30, Math.floor(screen.clientWidth / charW)))
      : Math.max(10, Math.min(32, Math.floor(screen.clientWidth / charW / 3.3)));
    const { cols, rows, cells, fillEnd } = art.rasterize(glyphCols, charW / charH, { vertical });
    const labelPad = ' '.repeat(Math.max(0, Math.floor((cols - LABEL.length) / 2)));
    const end = Math.max(fillEnd, TYPE_START + LABEL.length * TYPE_SPEED) + 100;

    const pre = document.createElement('pre');
    pre.className = 'name-art';
    pre.setAttribute('role', 'img');
    pre.setAttribute('aria-label', '张卓远 (Daniel Zhang) drawn in ASCII');
    screen.appendChild(pre);

    // One frame as text. Settling cells show a red dot, then their character.
    function render(t, done) {
      const lines = Array.from({ length: rows }, () => Array(cols).fill(' '));
      for (const cell of cells) {
        const p = (t - cell.start) / CELL_FADE;
        if (p <= 0) continue;
        if (p < 0.45) lines[cell.row][cell.col] = '<span class="accent">·</span>';
        else lines[cell.row][cell.col] = p > 0.5 ? cell.char : '·';
      }
      const typed = Math.max(0, Math.min(LABEL.length, Math.floor((t - TYPE_START) / TYPE_SPEED)));
      const cursor = !done && t >= TYPE_START ? '<span class="accent">█</span>' : '';
      const label = t >= TYPE_START ? labelPad + LABEL.slice(0, typed) + cursor : '';
      pre.innerHTML = `${lines.map((row) => row.join('').trimEnd()).join('\n')}\n\n${label}`;
    }

    // Draw the empty first frame (full height) and scroll now, so the animation
    // plays in view instead of finishing off screen before the usual scroll.
    render(0, false);
    if (line && !restoring) scrollAfter(line);

    return new Promise((resolve) => {
      if (reduceMotion || restoring) {
        render(Infinity, true);
        resolve();
        return;
      }
      let startedAt = 0;
      const frame = (now) => {
        if (!startedAt) startedAt = now;
        const t = now - startedAt;
        // A new command finishes it instantly, like any other print.
        if (t >= end || fastForward) {
          render(Infinity, true);
          resolve();
          return;
        }
        render(t, false);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  function clear() {
    screen.replaceChildren();
    setHash('');
    ran = [];
    saveSession();
  }

  /* ---------- running commands ---------- */

  const past = [];       // command history for the up/down arrows
  let pastIndex = 0;

  // The session survives a refresh: the commands run (re-printed on load) and the
  // arrow-key history, kept per tab in sessionStorage. `clear` empties the re-print list.
  const SESSION_KEY = 'console';
  const MAX_SAVED = 50;
  let ran = [];
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY)) || {};
    if (Array.isArray(saved.ran)) ran = saved.ran.slice(-MAX_SAVED);
    if (Array.isArray(saved.past)) past.push(...saved.past.slice(-MAX_SAVED));
    pastIndex = past.length;
  } catch {
    // storage blocked or unreadable: start a fresh session
  }

  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ran: ran.slice(-MAX_SAVED), past: past.slice(-MAX_SAVED) }));
    } catch {
      // storage blocked: a refresh just starts fresh
    }
  }
  let queue = Promise.resolve();

  // Keeps the new output readable: a long one starts at the top of the screen,
  // a short one just scrolls far enough to show the prompt again.
  function scrollAfter(line) {
    if (!line.isConnected) {
      scrollTo({ top: 0 });
      return;
    }
    const lineTop = line.getBoundingClientRect().top + scrollY - 16;
    const promptBottom = form.getBoundingClientRect().bottom + scrollY;
    const bar = document.getElementById('shortcuts').offsetHeight;
    const target = Math.min(lineTop, promptBottom + bar + 24 - innerHeight);
    scrollTo({ top: Math.max(0, target), behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  async function run(raw) {
    const text = raw.trim();
    const line = echo(text);
    if (!restoring && text && past[past.length - 1] !== text) past.push(text);
    pastIndex = past.length;
    if (!text) return;

    const word = text.toLowerCase().split(/\s+/)[0];
    const name = ALIASES[word] || word;
    const command = COMMANDS[name];
    if (HIDDEN[name]) {
      await HIDDEN[name](line);
    } else if (command) {
      await command.run();
      if (SECTIONS.includes(name)) setHash(name);
    } else {
      await printLine(`'${word}' is not recognized as a command. type help for the list.`, 'dim');
    }
    if (restoring) return;
    if (name !== 'clear') ran.push(text);
    saveSession();
    scrollAfter(line);
  }

  async function typeOut(text) {
    for (let i = 1; i <= text.length; i++) {
      input.value = text.slice(0, i);
      updateCursor();
      if (TYPE_DELAY) await wait(TYPE_DELAY);
    }
  }

  // Commands run one after another; a new one makes the current print finish instantly.
  // `after` runs once the command has printed (used to jump to a specific item).
  function submit(text, { typed = false, after } = {}) {
    fastForward = true;
    queue = queue.then(async () => {
      fastForward = false;
      if (typed) await typeOut(text);
      input.value = '';
      updateCursor();
      await run(text);
      after?.();
    }).catch((error) => {
      // One failed command shouldn't jam every command after it.
      console.error(error);
    });
    return queue;
  }

  /* ---------- input ---------- */

  function updateCursor() {
    cursor.style.left = `${input.selectionStart ?? input.value.length}ch`;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    updateCursor();
    submit(text);
  });

  input.addEventListener('keydown', (e) => {
    if (lightbox.classList.contains('is-open')) return;

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      pastIndex = Math.max(0, Math.min(past.length, pastIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = past[pastIndex] ?? '';
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const start = input.value.trim().toLowerCase();
      if (!start) return;
      const matches = Object.keys(COMMANDS).filter((name) => name.startsWith(start));
      if (matches.length === 1) {
        input.value = matches[0];
      } else if (matches.length > 1) {
        echo(input.value);
        printLine(matches.join('   '), 'dim');
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clear();
    }
    requestAnimationFrame(updateCursor);
  });

  for (const type of ['input', 'click', 'focus', 'select']) input.addEventListener(type, updateCursor);

  // Shortcut bar and the command names printed by help.
  // Scrolls to the newest printed copy of [data-id="id"] and flashes it.
  function showItem(id) {
    const matches = screen.querySelectorAll(`[data-id="${id}"]`);
    const item = matches[matches.length - 1];
    if (!item) return;
    item.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    item.classList.remove('is-shown');
    void item.offsetWidth;   // restart the flash if it's already running
    item.classList.add('is-shown');
  }

  // Featured thumbs: data-show="command:id" runs the command, then jumps to the item.
  function showFrom(target) {
    const [command, id] = target.dataset.show.split(':');
    submit(command, { typed: true, after: () => showItem(id) });
  }

  addEventListener('keydown', (e) => {
    const target = e.key === 'Enter' && document.activeElement?.closest?.('[data-show]');
    if (target) showFrom(target);
  });

  document.addEventListener('click', (e) => {
    const shown = e.target.closest('[data-show]');
    if (shown) {
      showFrom(shown);
      return;
    }
    const button = e.target.closest('[data-run]');
    if (button) {
      submit(button.dataset.run, { typed: true });
      if (finePointer) input.focus({ preventScroll: true });
      return;
    }
    // Clicking empty console space puts you back at the prompt, like a real terminal.
    // Desktop only, so tapping around on a phone doesn't keep opening the keyboard.
    if (finePointer && !e.target.closest('a, button, [data-lightbox], figure, #lightbox')
        && !String(getSelection())) {
      input.focus({ preventScroll: true });
    }
  });

  addEventListener('hashchange', () => {
    const name = location.hash.slice(1).toLowerCase();
    if (COMMANDS[name]) submit(name, { typed: true });
  });

  /* ---------- boot ---------- */

  // Resolves when the intro starts fading out (or right away if there is none), so the
  // first screen is already printing underneath instead of flashing an empty terminal.
  function whenIntroLeaving() {
    return new Promise((resolve) => {
      const gate = document.getElementById('gate');
      if (!gate || gate.classList.contains('is-leaving')) return resolve();
      const observer = new MutationObserver(() => {
        if (gate.isConnected && !gate.classList.contains('is-leaving')) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(gate, { attributes: true, attributeFilter: ['class'] });
      observer.observe(document.body, { childList: true });
    });
  }

  // Resolves once the intro is fully removed; focus waits for this so the
  // intro's skip keys never land in the prompt.
  function whenIntroGone() {
    return new Promise((resolve) => {
      if (!document.getElementById('gate')) return resolve();
      new MutationObserver((_, observer) => {
        if (document.getElementById('gate')) return;
        observer.disconnect();
        resolve();
      }).observe(document.body, { childList: true });
    });
  }

  whenIntroLeaving().then(async () => {
    if (ran.length) {
      // Refreshed mid-session: re-print everything instantly and land at the prompt.
      queue = queue.then(async () => {
        restoring = true;
        try {
          for (const text of ran) await run(text);
        } finally {
          restoring = false;
        }
      }).catch((error) => {
        // A broken saved session shouldn't leave the prompt hidden.
        console.error(error);
      });
      await queue;
      pace = BLOCK_DELAY;
      document.getElementById('console').classList.remove('is-booting');
      scrollTo({ top: document.documentElement.scrollHeight });
      return;
    }

    await submit('whoami', { typed: true });
    pace = BLOCK_DELAY;
    document.getElementById('console').classList.remove('is-booting');
    const linked = location.hash.slice(1).toLowerCase();
    if (COMMANDS[linked] && linked !== 'whoami' && linked !== 'clear') submit(linked, { typed: true });
  });

  whenIntroGone().then(() => {
    if (finePointer) input.focus({ preventScroll: true });
  });
})();
