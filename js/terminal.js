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
  const TYPE_DELAY = reduceMotion ? 0 : 12;   // ms per character when a shortcut types a command
  const BLOCKS = 'h1, h2, h3, p, figure, .row, .thumbs > *';

  const SECTIONS = ['whoami', 'projects', 'hardware', 'experience', 'skills', 'certs', 'resume', 'art', 'contact'];

  const COMMANDS = {
    help: { help: 'list commands', run: printHelp },
    whoami: { help: 'who i am', run: () => printSection('whoami') },
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

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ---------- printing ---------- */

  let fastForward = false;   // set when a new command arrives mid-print

  // Appends a node, then uncovers its blocks one at a time like a slow terminal.
  async function reveal(node) {
    const blocks = [...node.querySelectorAll(BLOCKS)];
    if (BLOCK_DELAY) blocks.forEach((b) => b.classList.add('pending'));
    screen.appendChild(node);
    for (const block of blocks) {
      block.classList.remove('pending');
      if (BLOCK_DELAY && !fastForward) await wait(BLOCK_DELAY);
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

  function clear() {
    screen.replaceChildren();
    setHash('');
  }

  /* ---------- running commands ---------- */

  const past = [];       // command history for the up/down arrows
  let pastIndex = 0;
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
    if (text && past[past.length - 1] !== text) past.push(text);
    pastIndex = past.length;
    if (!text) return;

    const word = text.toLowerCase().split(/\s+/)[0];
    const name = ALIASES[word] || word;
    const command = COMMANDS[name];
    if (command) {
      await command.run();
      if (SECTIONS.includes(name)) setHash(name);
    } else {
      await printLine(`'${word}' is not recognized as a command. type help for the list.`, 'dim');
    }
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
  function submit(text, { typed = false } = {}) {
    fastForward = true;
    queue = queue.then(async () => {
      fastForward = false;
      if (typed) await typeOut(text);
      input.value = '';
      updateCursor();
      await run(text);
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
  document.addEventListener('click', (e) => {
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

  whenIntroGone().then(async () => {
    await printSection('banner');
    submit('whoami', { typed: true });
    const linked = location.hash.slice(1).toLowerCase();
    if (COMMANDS[linked] && linked !== 'whoami' && linked !== 'clear') submit(linked, { typed: true });
    if (finePointer) input.focus({ preventScroll: true });
  });
})();
