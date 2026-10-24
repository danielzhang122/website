// Intro screen: a fake loading bar while 张卓远 assembles out of falling grains
// over red digital rain, then the screen splits open. Shown once per session.
//
// Phases: 'load' (counting to 100%) → 'lock' (brief hold) → 'open' (exit animation).
// Click speeds up the load (or opens once locked); Esc / S skips straight to the site.
(() => {
  'use strict';

  const gate = document.getElementById('gate');
  const root = document.documentElement;

  // The third-party chat widget waits until the intro is gone,
  // otherwise its fixed launcher covers the intro's hint text.
  let chatLoaded = false;
  function loadChatbot() {
    if (chatLoaded) return;
    chatLoaded = true;
    const script = document.createElement('script');
    script.src = 'https://sitespeak.ai/chatbots/f4df5065-fab6-4160-8050-6dfb8ce3ec4c.js';
    script.async = true;
    document.head.appendChild(script);
  }

  function markReady() {
    document.body.classList.add('is-ready');
  }

  let seenThisSession = false;
  try {
    seenThisSession = Boolean(sessionStorage.getItem('gate'));
  } catch {
    // storage blocked (private mode etc.): just show the intro
  }

  if (seenThisSession || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gate.remove();
    markReady();
    loadChatbot();
    return;
  }

  /* ---------- config ---------- */

  const WORD = '张卓远';
  const LABEL = 'daniel zhang';
  const SCRAMBLE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789#$%&@';
  const FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif';
  const LOAD_DURATION = 2400;     // ms for the simulated load to reach 100%
  const GRAIN_FADE_IN = 640;      // ms for a grain to fall into place
  const OPEN_DURATION = 950;      // ms; matches the slit-open animation in CSS

  // Progress curve as [time, progress] knots: three surges separated by two
  // stalls, so it feels like something is actually loading.
  const LOAD_CURVE = [[0, 0], [0.3, 0.38], [0.4, 0.41], [0.68, 0.77], [0.78, 0.8], [1, 1]];

  /* ---------- helpers ---------- */

  // Deterministic pseudo-random in [0, 1) so grains look the same on every resize.
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function simulatedProgress(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    for (let i = 0; i < LOAD_CURVE.length - 1; i++) {
      const [t0, p0] = LOAD_CURVE[i];
      const [t1, p1] = LOAD_CURVE[i + 1];
      if (t <= t1) return p0 + (p1 - p0) * easeOutCubic((t - t0) / (t1 - t0));
    }
    return 1;
  }

  // Reveals LABEL left to right as progress grows; unrevealed letters flicker.
  function scrambledLabel(progress, tick) {
    const revealed = Math.floor(clamp01(progress) * LABEL.length);
    return Array.from(LABEL, (char, i) => {
      if (char === ' ' || i < revealed) return char;
      return SCRAMBLE_CHARS[Math.floor(hash(i * 31 + tick * 7.13) * SCRAMBLE_CHARS.length)];
    }).join('');
  }

  /* ---------- state ---------- */

  const canvas = gate.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const nameLabel = gate.querySelector('.gate-name');
  const percentLabel = gate.querySelector('.gate-percent');

  let width = 0;
  let height = 0;
  let redGrains = [];
  let blueGrains = [];
  let rainColumns = [];
  let progress = 0;           // 0..1, what's currently displayed
  let phase = 'load';
  let rushing = false;        // user clicked to speed up
  let running = true;
  let startTime = performance.now();
  let lastFrame = startTime;

  /* ---------- scene setup ---------- */

  // Render the word off-screen, then sample its pixels into grains.
  function sampleWord() {
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const c = offscreen.getContext('2d', { willReadFrequently: true });

    c.font = `900 100px ${FONT}`;
    const fontSize = Math.max(24, Math.min((width * 0.84 * 100) / c.measureText(WORD).width, height * 0.3));
    c.font = `900 ${fontSize}px ${FONT}`;
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(WORD, width / 2, height / 2);

    const pixels = c.getImageData(0, 0, width, height).data;
    const spacing = Math.max(2, Math.round(fontSize / 44));
    const samples = [];
    const bounds = { left: width, right: 0, top: height, bottom: 0 };

    for (let y = 0; y < height; y += spacing) {
      for (let x = 0; x < width; x += spacing) {
        if (pixels[(y * width + x) * 4 + 3] < 110) continue; // outside the glyphs
        const id = x * 7.31 + y * 1.97;
        if (hash(id) > 0.78) continue;                      // erode the strokes a bit
        samples.push({ x, y, id });
        bounds.left = Math.min(bounds.left, x);
        bounds.right = Math.max(bounds.right, x);
        bounds.top = Math.min(bounds.top, y);
        bounds.bottom = Math.max(bounds.bottom, y);
      }
    }
    return { samples, spacing, bounds };
  }

  function build() {
    width = innerWidth;
    height = innerHeight;
    canvas.width = width;
    canvas.height = height;

    const { samples, spacing, bounds } = sampleWord();
    const wordWidth = Math.max(1, bounds.right - bounds.left);

    redGrains = [];
    blueGrains = [];
    for (const { x, y, id } of samples) {
      const grain = {
        x: x + (hash(id + 13) - 0.5) * spacing * 0.7,
        y,
        size: spacing * (0.55 + 0.6 * hash(id + 11)),
        alpha: 0.5 + 0.5 * hash(id + 3),
        fallHeight: 30 + 170 * hash(id + 5),
        // When this grain appears, as a progress value: mostly left to right, with jitter.
        revealAt: Math.min(1, (0.55 * (x - bounds.left)) / wordWidth + 0.45 * hash(id + 9)),
        appearedAt: -1,
      };
      (hash(id + 21) < 0.4 ? blueGrains : redGrains).push(grain);
    }

    gate.style.setProperty('--word-top', `${bounds.top}px`);
    gate.style.setProperty('--word-height', `${bounds.bottom - bounds.top}px`);

    // Rain columns, densest over the word.
    rainColumns = [];
    const mid = width / 2;
    const spread = Math.max(wordWidth, width * 0.3) * 0.62;
    for (let x = 6, k = 0; x < width; x += 15, k++) {
      const distance = (x - mid) / spread;
      const weight = 0.12 + 0.88 * Math.exp(-distance * distance);
      rainColumns.push({
        x: x + 0.5,
        head: hash(k + 1.7) * height * 1.4 - height * 0.2,
        speed: (50 + 190 * hash(k + 2.9)) * (0.6 + weight),
        length: 30 + height * 0.55 * hash(k + 4.1) * (0.35 + weight),
        weight,
      });
    }
  }

  /* ---------- drawing ---------- */

  function drawRain(dt) {
    const intensity = phase === 'load' ? 0.45 + 0.55 * progress : phase === 'open' ? 0 : 1;
    const speedUp = phase === 'open' ? 1.6 : 1;

    ctx.lineWidth = 1.3;
    ctx.setLineDash([1.4, 2.8]);
    for (const col of rainColumns) {
      col.head += (col.speed * dt * speedUp) / 1000;
      if (col.head - col.length > height) {
        col.head = -Math.random() * height * 0.4;
        col.length = 30 + height * 0.55 * Math.random() * (0.35 + col.weight);
      }

      const alpha = col.weight * 0.6 * intensity;
      if (alpha < 0.01) continue;

      // Two-tone tail: cheaper than a gradient per column.
      const top = col.head - col.length;
      const mid = col.head - col.length * 0.45;
      ctx.strokeStyle = `rgba(255, 42, 77, ${(alpha * 0.3).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(col.x, top);
      ctx.lineTo(col.x, mid);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 42, 77, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(col.x, mid);
      ctx.lineTo(col.x, col.head);
      ctx.stroke();

      ctx.fillStyle = '#d2f0ff';
      ctx.globalAlpha = Math.min(1, alpha * 1.4);
      ctx.fillRect(col.x - 1.1, col.head - 1.1, 2.2, 2.2);
      ctx.globalAlpha = 1;
    }
    ctx.setLineDash([]);
  }

  function drawGrains(now) {
    for (const [grains, color] of [[redGrains, '#e0193f'], [blueGrains, '#bfe6ff']]) {
      ctx.fillStyle = color;
      for (const g of grains) {
        if (g.appearedAt < 0) {
          if (g.revealAt > progress) continue;
          g.appearedAt = now;
        }
        const t = Math.min(1, (now - g.appearedAt) / GRAIN_FADE_IN);
        const fall = 1 - easeOutCubic(t);

        let alpha = g.alpha * (0.3 + 0.7 * t);
        if (phase === 'lock') alpha *= 0.84 + 0.16 * Math.sin(now * 0.006 + g.revealAt * 60); // shimmer
        ctx.globalAlpha = alpha;

        // Grains fall into place as vertical streaks that shrink to dots.
        ctx.fillRect(g.x, g.y - g.fallHeight * fall, g.size * 0.8, g.size * (1 + fall * g.fallHeight * 0.04));
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- lifecycle ---------- */

  function finish() {
    running = false;
    root.style.overflow = '';
    gate.remove();
    markReady();
    try {
      sessionStorage.setItem('gate', '1');
    } catch {
      // ignore: the intro will just play again next visit
    }
    loadChatbot();
  }

  function open() {
    if (phase === 'open') return;
    phase = 'open';
    gate.classList.add('is-opening');
    markReady(); // start the hero animation underneath while the slit opens
    setTimeout(finish, OPEN_DURATION);
  }

  function updateLoad(now, dt) {
    const target = rushing ? 1 : simulatedProgress((now - startTime) / LOAD_DURATION);
    const smoothing = Math.min(1, ((rushing ? 0.12 : 1) * dt) / 16.7);
    progress += (target - progress) * smoothing;
    if (target - progress < 0.002) progress = target;

    const percent = Math.round(progress * 100);
    percentLabel.textContent = `${String(percent).padStart(3, '0')}%`;
    nameLabel.textContent = scrambledLabel(percent / 70, Math.floor(now / 85));
    gate.setAttribute('aria-valuenow', percent);

    if (progress >= 1) {
      phase = 'lock';
      nameLabel.textContent = LABEL;
      percentLabel.textContent = '开启';
      setTimeout(open, 450);
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(64, now - lastFrame);
    lastFrame = now;

    if (phase === 'load') updateLoad(now, dt);
    ctx.clearRect(0, 0, width, height);
    drawRain(dt);
    drawGrains(now);

    requestAnimationFrame(frame);
  }

  /* ---------- input ---------- */

  addEventListener('keydown', (e) => {
    if (!gate.isConnected) return;
    if (e.key === 'Escape' || e.key.toLowerCase() === 's') {
      e.preventDefault();
      phase = 'open';
      finish();
    }
  });

  gate.addEventListener('click', () => {
    if (phase === 'load') rushing = true;
    else if (phase === 'lock') open();
  });

  gate.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      gate.click();
    }
  });

  /* ---------- start ---------- */

  root.style.overflow = 'hidden';
  addEventListener('resize', build);

  // Wait for the CJK font (up to 800 ms) so the word is sampled in the right typeface.
  const fontReady = document.fonts ? document.fonts.load(`900 100px "Noto Sans SC"`, WORD) : Promise.resolve();
  const timeout = new Promise((resolve) => setTimeout(resolve, 800));
  Promise.race([fontReady, timeout]).then(() => {
    startTime = lastFrame = performance.now();
    build();
    requestAnimationFrame(frame);
  });
})();
