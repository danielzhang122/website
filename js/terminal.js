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

  const TYPE_DELAY = reduceMotion ? 0 : 12;   // ms per character when a shortcut types a command
  // Output types itself out: at least TYPE_MIN character a frame, faster for long output
  // so even a big section finishes in about TYPE_FRAMES frames (~0.7 s).
  const TYPE_MIN = 1;
  const TYPE_FRAMES = 40;
  // Things that pop in whole when the typing reaches them, instead of being typed.
  const MEDIA = 'figure, .thumbs > :is(img, video)';

  const SECTIONS = ['whoami', 'projects', 'misc', 'interests', 'experience', 'skills', 'certs', 'resume', 'art', 'contact'];

  const COMMANDS = {
    help: { help: 'list commands', run: printHelp },
    whoami: { help: 'who i am', run: printWhoami },
    projects: { help: 'things i have built', run: () => printSection('projects') },
    misc: { help: 'bench tests, cad and side builds', run: () => printSection('misc') },
    interests: { help: 'what i do outside work', run: () => printSection('interests') },
    experience: { help: 'work and school', run: () => printSection('experience') },
    skills: { help: 'tools and standards', run: () => printSection('skills') },
    certs: { help: 'certifications', run: () => printSection('certs') },
    resume: { help: 'one-page pdf', run: () => printSection('resume') },
    art: { help: 'painting, drawing, carving', run: () => printSection('art') },
    contact: { help: 'email and links', run: () => printSection('contact') },
    clear: { help: 'clear the screen', run: clear },
    retro: { help: 'toggle the crt screen effect', run: toggleRetro },
  };
  // hardware was misc's old name; kept so old #hardware links and saved sessions still work.
  const ALIASES = { ls: 'help', '?': 'help', about: 'whoami', cls: 'clear', cv: 'resume', hardware: 'misc' };

  // Easter eggs: work when typed, but stay out of help and tab completion.
  const HIDDEN = {
    name: printNameArt,
    zhuoyuan: printNameArt,
    '张卓远': printNameArt,
    og: printOg,
    mercury: (line) => printPiece(line, 'liquid-chrome'),
    klein: (line) => printPiece(line, 'klein-bottle'),
    torus: (line) => printPiece(line, 'torus-knot'),
    history: printHistory,
    sudo: (line, text) => (/^sudo\s+rm\s/i.test(text) ? rm(line, text) : printLine('nice try.', 'dim')),
    rm,
    exit,
    logout: exit,
    coffee: () => mailMe('coffee?', "i'm in. "),
    hire: () => mailMe('hiring', "let's talk: "),
    vga: toggleVga,
  };
  // Not re-run when a refresh restores the session: clear and rm reset it themselves,
  // and retro and vga would flip the saved setting back.
  const UNSAVED = ['clear', 'retro', 'vga', 'rm', 'sudo'];

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ---------- printing ---------- */

  let fastForward = false;   // set when a new command arrives mid-print
  let restoring = false;     // re-printing a saved session after a refresh: instant, no scrolling

  // Waits for the next animation frame, or 50 ms if frames aren't coming (a background
  // tab pauses them), so typing never stalls the command queue.
  const nextFrame = () => new Promise((resolve) => {
    const fallback = setTimeout(resolve, 50);
    requestAnimationFrame(() => {
      clearTimeout(fallback);
      resolve();
    });
  });

  // Appends a node and types its text out, keeping links and formatting intact. Media
  // (photos, videos, the chrome art) appear when the typing reaches them.
  async function reveal(node) {
    if (restoring || reduceMotion) {
      screen.appendChild(node);
      return;
    }

    // In document order: text nodes to type, and media to uncover.
    const steps = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.nodeType === Node.ELEMENT_NODE) return n.matches(MEDIA) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        if (n.parentElement.closest(MEDIA) || !n.data.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        n.classList.add('pending');
        steps.push({ media: n });
      } else {
        steps.push({ text: n, full: n.data });
        n.data = '';
      }
    }

    screen.appendChild(node);
    const total = steps.reduce((sum, step) => sum + (step.full ? step.full.length : 0), 0);
    const perFrame = Math.max(TYPE_MIN, Math.ceil(total / TYPE_FRAMES));

    let i = 0;
    while (i < steps.length) {
      let budget = fastForward ? Infinity : perFrame;   // a new command finishes this one instantly
      while (i < steps.length && budget > 0) {
        const step = steps[i];
        if (step.media) {
          step.media.classList.remove('pending');
          step.media.classList.add('printing');
          i++;
          continue;
        }
        const shown = step.text.data.length;
        const take = Math.min(budget, step.full.length - shown);
        step.text.data = step.full.slice(0, shown + take);
        budget -= take;
        if (step.text.data.length === step.full.length) i++;
      }
      follow(node);
      if (i < steps.length) await nextFrame();
    }
  }

  // Keeps the newest typed line in view, like a terminal following its output, but
  // never scrolls the command line above the top of the screen.
  function follow(node) {
    const box = node.getBoundingClientRect();
    const bar = document.getElementById('shortcuts').offsetHeight;
    const overflow = box.bottom + bar + 24 - innerHeight;
    const room = box.top - 64;   // leaves the "> command" line just above the output visible
    const by = Math.min(overflow, room);
    if (by > 0) scrollBy(0, by);
  }

  // Autoplaying videos only decode while they're on screen.
  const videoObserver = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) target.play().catch(() => {}); // autoplay can be refused
      else target.pause();
    }
  }, { rootMargin: '200px' });

  // The reverse of reveal: erases the nodes' text from the end backwards, hiding media
  // as the erasing reaches it and dropping each node once it's empty.
  async function unreveal(nodes) {
    if (!restoring && !reduceMotion) {
      const steps = [];
      for (const owner of nodes) {
        const walker = document.createTreeWalker(owner, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => {
            if (n.nodeType === Node.ELEMENT_NODE) return n.matches(MEDIA) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
            if (n.parentElement.closest(MEDIA) || !n.data.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        });
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          steps.push(n.nodeType === Node.ELEMENT_NODE ? { owner, media: n } : { owner, text: n });
        }
      }
      const total = steps.reduce((sum, step) => sum + (step.text ? step.text.data.length : 0), 0);
      const perFrame = Math.max(TYPE_MIN, Math.ceil(total / TYPE_FRAMES));

      let i = steps.length - 1;
      while (i >= 0) {
        let budget = fastForward ? Infinity : perFrame;   // a new command finishes this one instantly
        while (i >= 0 && budget > 0) {
          const step = steps[i];
          if (step.media) {
            step.media.classList.add('pending');
          } else {
            const take = Math.min(budget, step.text.data.length);
            step.text.data = step.text.data.slice(0, step.text.data.length - take);
            budget -= take;
            if (step.text.data.length) continue;
          }
          i--;
          if (steps[i]?.owner !== step.owner) step.owner.remove();
        }
        if (i >= 0) await nextFrame();
      }
    }
    nodes.forEach((node) => node.remove());
  }

  async function printSection(name) {
    const copy = content.querySelector(`[data-cmd="${name}"]`).cloneNode(true);
    copy.removeAttribute('data-cmd');
    copy.dataset.from = name;   // lets clear find the whoami it keeps
    copy.classList.add('output');
    // Videos in #content stay idle; printed copies play.
    copy.querySelectorAll('video').forEach((video) => { video.autoplay = true; });
    await reveal(copy);
    copy.querySelectorAll('video').forEach((video) => videoObserver.observe(video));
  }

  // Once the page has loaded, fetch every photo and video into the browser cache, so a
  // printed section shows its media straight away. Skipped when the visitor asked to save data.
  addEventListener('load', () => {
    if (navigator.connection?.saveData) return;
    const sources = new Set([...content.querySelectorAll('img, video')].map((media) => media.getAttribute('src')));
    for (const src of sources) fetch(src, { priority: 'low' }).catch(() => {});
  });

  // The banner (art and name) comes with whoami, so the two print as one block.
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
    list.className = 'output list';
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

  // Toggling retro or vga doesn't swap the look in one go: an invisible sweep runs down the
  // screen, and each block of text takes the new look as it passes. For retro, the CRT
  // scanlines wipe in or out with it; for vga, each block switches font and its characters
  // regenerate (each starts as a dot, flickers through scrambled glyphs and settles, in random
  // order, like rm -rf / in reverse).
  let sweepFrame = 0;
  let regenerating = [];     // { n, full, start, at }: text nodes mid-regeneration
  let regenFrame = 0;
  const SWEEP_MS = 900;      // the sweep's trip down the screen
  const REGEN = 380;         // ms over which a block's characters start settling
  const REGEN_CELL = 110;    // ms each flickers before it settles
  const SCRAMBLE = '·:=+*#%@';
  // The look a block keeps until the sweep reaches it.
  const PINNED = ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'textAlign', 'textShadow', 'fontSynthesis'];

  // The block-level element a text node sits in.
  function blockOf(node) {
    let el = node.parentElement;
    while (el && getComputedStyle(el).display.startsWith('inline')) el = el.parentElement;
    return el;
  }

  // The visible text nodes whose block is el.
  function ownText(el) {
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.data.trim() && n.parentElement.getClientRects().length && blockOf(n) === el) nodes.push(n);
    }
    return nodes;
  }

  // Each visible block of page text (the console and the command bar), in document order.
  // The ASCII art has its own font rules and animation, so it just switches with the page.
  function textBlocks() {
    const found = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.data.trim() || !n.parentElement.getClientRects().length) continue;
      const el = blockOf(n);
      if (el && !el.closest('.chrome-art, .name-art, .gate-art, #gate, #lightbox, script')) found.add(el);
    }
    return [...found];
  }

  function regenTick(now) {
    regenerating = regenerating.filter((cell) => {
      const t = now - cell.start;
      cell.n.data = cell.full.map((c, i) => {
        if (!c.trim() || t >= cell.at[i] + REGEN_CELL) return c;
        if (t < cell.at[i]) return '·';
        return SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];
      }).join('');
      return t < REGEN + REGEN_CELL;
    });
    regenFrame = regenerating.length ? requestAnimationFrame(regenTick) : 0;
  }

  function regenerate(nodes) {
    const start = performance.now();
    for (const n of nodes) {
      const full = [...n.data];
      regenerating.push({ n, full, start, at: full.map(() => Math.random() * REGEN) });
    }
    if (!regenFrame && regenerating.length) regenFrame = requestAnimationFrame(regenTick);
  }

  // Lets a block take the new look; with animate, its text regenerates into it.
  function release(el, animate) {
    if (!el.hasAttribute('data-px')) return;
    el.removeAttribute('data-px');
    for (const prop of PINNED) el.style[prop] = '';
    // The banner's "Hard on the eyes?" / "Miss the glow?" changes as the sweep passes too.
    el.querySelectorAll('[data-retro-label]').forEach((label) => { label.style.display = ''; });
    if (animate) regenerate(ownText(el));
  }

  function endSweep() {
    cancelAnimationFrame(sweepFrame);
    sweepFrame = 0;
    cancelAnimationFrame(regenFrame);
    regenFrame = 0;
    for (const { n, full } of regenerating) n.data = full.join('');
    regenerating = [];
    document.querySelectorAll('[data-px]').forEach((el) => release(el, false));
    document.querySelectorAll('[data-retro-label]').forEach((label) => { label.style.display = ''; });
    const root = document.documentElement;
    root.classList.remove('crt-entering', 'crt-leaving');
    root.style.removeProperty('--sweep');
  }

  // apply switches the classes on <html>; crt is 'crt-entering' or 'crt-leaving' when the
  // scanlines change, and regen regenerates the text as the sweep passes it.
  function sweep(apply, crt, regen) {
    const root = document.documentElement;
    // Hold the banner's label as it is, then pin every block to its current look.
    document.querySelectorAll('[data-retro-label]').forEach((label) => {
      label.style.display = getComputedStyle(label).display;
    });
    const blocks = textBlocks();
    const looks = blocks.map((el) => {
      const cs = getComputedStyle(el);
      return Object.fromEntries(PINNED.map((prop) => [prop, cs[prop]]));
    });
    blocks.forEach((el, i) => {
      el.dataset.px = '';
      Object.assign(el.style, looks[i]);
    });

    root.style.setProperty('--sweep', '0px');
    if (crt) root.classList.add(crt);
    apply();
    window.snapPixels?.();

    // Blocks above the screen switch now, out of sight; the rest wait for the sweep.
    const waiting = blocks.filter((el) => {
      if (el.getBoundingClientRect().bottom > 0) return true;
      release(el, false);
      return false;
    });
    const startedAt = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - startedAt) / SWEEP_MS);
      const y = (1 - Math.cos(p * Math.PI)) / 2 * innerHeight;   // eases in and out
      root.style.setProperty('--sweep', `${y}px`);
      // In document order, so roughly top to bottom; re-measured as released blocks reflow.
      while (waiting.length && (p === 1 || waiting[0].getBoundingClientRect().top <= y)) {
        const el = waiting.shift();
        release(el, regen && el.getBoundingClientRect().top < innerHeight);
      }
      if (p < 1) sweepFrame = requestAnimationFrame(tick);
      else {
        sweepFrame = 0;
        root.classList.remove('crt-entering', 'crt-leaving');
        root.style.removeProperty('--sweep');
      }
    };
    sweepFrame = requestAnimationFrame(tick);
  }

  // Flips one look (retro or vga), saves the choice, and reports it.
  function toggleLook(name, isOn, setOn, crt) {
    endSweep();
    const on = !isOn();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setOn(on);
    else sweep(() => setOn(on), crt ? (on ? 'crt-entering' : 'crt-leaving') : '', !crt);
    window.snapPixels?.();
    try {
      localStorage.setItem(name, on ? 'on' : 'off');
    } catch {
      // storage blocked: the choice lasts until the page closes
    }
    return printLine(`${name} ${on ? 'on' : 'off'}`, 'dim');
  }

  // The CRT screen effect, on by default.
  function toggleRetro() {
    const root = document.documentElement;
    return toggleLook('retro', () => !root.classList.contains('no-retro'), (on) => root.classList.toggle('no-retro', !on), true);
  }

  // Easter egg: the IBM VGA pixel font, off by default.
  function toggleVga() {
    const root = document.documentElement;
    return toggleLook('vga', () => root.classList.contains('vga'), (on) => root.classList.toggle('vga', on), false);
  }

  // Easter egg: a link to the archived first version of the site.
  function printOg() {
    const line = document.createElement('p');
    const link = document.createElement('a');
    link.href = 'v1/';
    link.textContent = 'zhangdz.ca/v1';
    line.append(link);
    return reveal(line);
  }

  // Easter egg: prints the intro's 张卓远 animation into the console as text, at the
  // same 13px as the Liquid Chrome art, and leaves the finished frame in the scrollback.
  function printNameArt(line) {
    const art = window.IntroArt;
    if (!art) return printLine('name art is unavailable.', 'dim');
    const { CELL_FADE, TYPE_START, TYPE_SPEED, LABEL } = art.timing;

    // The art is drawn for 13px characters; when the console is too narrow for the
    // row of three (phones), the glyphs stack vertically.
    // Cascadia Mono's advance width at 13px, or the pixel font's at 16px in vga (see .name-art).
    const pxu = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pxu')) || 1;
    const charW = document.documentElement.classList.contains('vga') ? 8 * pxu : 13 * (1200 / 2048);
    const vertical = screen.clientWidth < art.nameArt().cols * charW;
    const { cols, rows, cells, fillEnd } = art.nameArt({ vertical });
    const labelPad = ' '.repeat(Math.max(0, Math.floor((cols - LABEL.length) / 2)));
    const end = Math.max(fillEnd, TYPE_START + LABEL.length * TYPE_SPEED) + 100;

    const pre = document.createElement('pre');
    pre.className = 'name-art';
    pre.setAttribute('role', 'img');
    pre.setAttribute('aria-label', '张卓远 (Daniel Zhang) drawn in ASCII');
    screen.appendChild(pre);

    const drawing = { cols, rows, cells };
    const render = (t, done) => { pre.innerHTML = art.renderText(drawing, t, { done, labelPad }); };

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
      const startedAt = performance.now();
      const frame = () => {
        const t = performance.now() - startedAt;
        // A new command finishes it instantly, like any other print.
        if (t >= end || fastForward) {
          render(Infinity, true);
          resolve();
          return;
        }
        render(t, false);
        nextFrame().then(frame);
      };
      nextFrame().then(frame);
    });
  }

  // Easter egg: prints one of the banner's ASCII Magic pieces (js/chrome.js), which
  // builds itself in like the name art and then keeps playing.
  const stopPieces = [];
  // chrome.js is a module, so it runs after this (deferred) script but before
  // DOMContentLoaded; a restored session can get here before it.
  const chromeArtLoaded = new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  async function printPiece(line, piece) {
    await chromeArtLoaded;
    if (!window.ChromeArt) return printLine('that art is unavailable.', 'dim');
    const art = document.createElement('div');
    art.className = 'chrome-art egg';
    art.setAttribute('role', 'img');
    art.setAttribute('aria-label', `${piece.replace('-', ' ')} in ASCII`);
    for (const layer of ['', 'chrome-mid', 'chrome-red']) {
      const pre = document.createElement('pre');
      pre.className = layer;
      art.appendChild(pre);
    }
    screen.appendChild(art);
    try {
      stopPieces.push(await window.ChromeArt.playPiece(art, piece, {
        build: !restoring && !reduceMotion,
        skip: () => fastForward,
        // Scroll once the art has its full height, so the build plays in view.
        ready: () => { if (line && !restoring) scrollAfter(line); },
      }));
    } catch {
      art.remove();   // the piece didn't load
      await printLine('that art is unavailable.', 'dim');
    }
  }

  // Easter egg: the commands typed this session, numbered like bash.
  function printHistory() {
    const list = document.createElement('p');
    list.className = 'dim';
    list.style.whiteSpace = 'pre';
    const width = String(past.length).length + 2;
    list.textContent = past.map((text, i) => `${String(i + 1).padStart(width)}  ${text}`).join('\n');
    return reveal(list);
  }

  // Easter egg: rm -rf / crumbles the whole screen, then whoami comes back.
  function rm(line, text) {
    return /^(sudo\s+)?rm\s+-(rf|fr)\s+\/\*?$/i.test(text) ? crumble() : printLine('rm: permission denied', 'dim');
  }

  const CRUMBLE = 600;        // ms over which characters start crumbling, in random order
  const CRUMBLE_CELL = 100;   // ms each shows a dot before it's gone

  async function crumble() {
    stopPieces.splice(0).forEach((stop) => stop());
    endSweep();   // so it crumbles the real text, not a half-regenerated one
    if (!restoring && !reduceMotion) {
      screen.querySelectorAll(MEDIA).forEach((media) => media.classList.add('pending'));
      const nodes = [];
      const walker = document.createTreeWalker(screen, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const full = [...n.data];
        nodes.push({ n, full, at: full.map(() => Math.random() * CRUMBLE) });
      }
      const startedAt = performance.now();
      for (let t = 0; t < CRUMBLE + CRUMBLE_CELL && !fastForward; t = performance.now() - startedAt) {
        for (const { n, full, at } of nodes) {
          n.data = full.map((c, i) => (!c.trim() || t < at[i] ? c : t < at[i] + CRUMBLE_CELL ? '·' : ' ')).join('');
        }
        await nextFrame();
      }
    }
    screen.replaceChildren();
    setHash('');
    ran = ['whoami'];
    saveSession();
    await printWhoami();
    await printLine('just kidding.', 'dim');
  }

  // Easter egg: a fresh visit, intro and all.
  function exit() {
    try {
      sessionStorage.removeItem('gate');
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // storage blocked: the reload starts fresh anyway
    }
    location.reload();
    // Never resolves, so run() can't save the session again before the page goes.
    return new Promise(() => {});
  }

  // Easter egg: a ready-made email. Not opened again when a refresh re-prints it.
  function mailMe(subject, lead) {
    const address = content.querySelector('a[href^="mailto:"]').getAttribute('href').slice('mailto:'.length);
    const link = document.createElement('a');
    link.href = `mailto:${address}?subject=${encodeURIComponent(subject)}`;
    link.textContent = address;
    const line = document.createElement('p');
    line.append(lead, link);
    if (!restoring) location.href = link.href;
    return reveal(line);
  }

  // Erases everything below the first whoami, which stays put, so the page never goes blank.
  async function clear() {
    stopPieces.splice(0).forEach((stop) => stop());
    setHash('');
    ran = ['whoami'];
    saveSession();
    const kept = screen.querySelector('[data-from="whoami"]');
    if (!kept) {
      screen.replaceChildren();
      await printWhoami();
      return;
    }
    const after = [];
    for (let n = kept.nextElementSibling; n; n = n.nextElementSibling) after.push(n);
    await unreveal(after);
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

  // Typo tolerance: the nearest command or alias, within 1 edit (2 for names over 6 letters).
  // Easter eggs need exact spelling.
  function closest(word) {
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of [...Object.keys(COMMANDS), ...Object.keys(ALIASES)]) {
      if (candidate.length < 3) continue;   // ls, cv and ? would swallow any short word
      const distance = editDistance(word, candidate);
      if (distance <= (candidate.length > 6 ? 2 : 1) && distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best && (ALIASES[best] || best);
  }

  // Edits between two words: inserts, deletes, substitutions and swapped neighbours.
  function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  async function run(raw) {
    const text = raw.trim();
    const line = echo(text);
    if (!restoring && text && past[past.length - 1] !== text) past.push(text);
    pastIndex = past.length;
    if (!text) return;

    const word = text.toLowerCase().split(/\s+/)[0];
    const exact = ALIASES[word] || word;
    const name = COMMANDS[exact] || HIDDEN[exact] ? exact : closest(word) || exact;
    const command = COMMANDS[name];
    if (HIDDEN[name]) {
      await HIDDEN[name](line, text);
    } else if (command) {
      await command.run();
      if (SECTIONS.includes(name)) setHash(name);
    } else {
      await printLine(`'${word}' is not recognized as a command. type help for the list.`, 'dim');
    }
    if (restoring) return;
    if (!UNSAVED.includes(name)) ran.push(text);
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
      submit('clear'); // queued, so it can't interleave with a print in progress
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
    const hash = location.hash.slice(1).toLowerCase();
    const name = ALIASES[hash] || hash;
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
      document.getElementById('console').classList.remove('is-booting');
      scrollTo({ top: document.documentElement.scrollHeight });
      return;
    }

    // Read a linked section (#projects) before whoami runs, since whoami rewrites the hash.
    const hash = location.hash.slice(1).toLowerCase();
    const linked = ALIASES[hash] || hash;
    await submit('whoami', { typed: true });
    document.getElementById('console').classList.remove('is-booting');
    if (COMMANDS[linked] && linked !== 'whoami' && linked !== 'clear') submit(linked, { typed: true });
  });

  whenIntroGone().then(() => {
    if (finePointer) input.focus({ preventScroll: true });
  });
})();
