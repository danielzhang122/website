// Intro screen: 张卓远 assembles out of falling grains over red digital rain
// while a boot log ticks through. Grains shy away from the cursor. On exit the
// name bursts apart and some of its grains become the site's background
// particle network. Shown once per session.
//
// Phases: 'load' (boot log runs) → 'lock' (brief hold) → 'release' (exit).
// Click speeds up the load (or exits once locked); Esc / S skips straight to the site.
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

  const LOAD_DURATION = 1600;     // ms for the boot sequence to finish
  const LOCK_HOLD = 350;          // ms the finished name holds before exiting
  const RELEASE_DURATION = 1000;  // ms for the exit
  const GRAIN_FADE_IN = 450;      // ms for a grain to fall into place
  const FONT_TIMEOUT = 600;       // ms to wait for the CJK web font before falling back

  const REPEL_RADIUS = 90;        // px around the cursor that pushes grains
  const REPEL_FORCE = 2600;       // px/s² at the cursor itself
  const SPRING = 90;              // pull back to the grain's home position
  const DRAG = 0.86;              // velocity kept per 60 fps frame
  const RELEASE_DRAG = 0.95;      // lighter drag so the exit burst carries

  // Progress curve as [time, progress] knots: surges and stalls, so it reads as real work.
  const LOAD_CURVE = [[0, 0], [0.3, 0.38], [0.4, 0.41], [0.68, 0.77], [0.78, 0.8], [1, 1]];

  // [progress at which the line appears, label, status]
  const BOOT_LOG = [
    [0.0, 'POST', 'OK'],
    [0.16, 'servo bus', '12/12 actuators'],
    [0.34, 'IK solver', 'converged (eventually)'],
    [0.52, 'ASD calcs', 'verified (probably)'],
    [0.7, 'coffee', '3 cups, nominal'],
    [0.86, 'sleep', 'not found'],
  ];
  const LOG_LABEL_WIDTH = 13;     // label + dot leader, in characters
  const STATUS_DELAY = 0.07;      // progress after a line appears before its status prints

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
  const log = gate.querySelector('.gate-log');

  let width = 0;
  let height = 0;
  let grains = [];
  let wordBounds = { left: 0, right: 0, top: 0, bottom: 0 };
  let rainColumns = [];
  let progress = 0;           // 0..1, what's currently displayed
  let phase = 'load';
  let rushing = false;        // user clicked to speed up
  let running = true;
  let startTime = performance.now();
  let lastFrame = startTime;
  let releaseStart = 0;
  const pointer = { x: -1e4, y: -1e4 };

  /* ---------- boot log ---------- */

  // Build every line up front, hidden; updateLog() reveals them as progress grows.
  const logLines = BOOT_LOG.map(([at, label, status]) => {
    const line = document.createElement('div');
    const statusEl = document.createElement('span');
    statusEl.className = 'status';
    statusEl.textContent = status;
    statusEl.hidden = true;
    line.append(`${label} `.padEnd(LOG_LABEL_WIDTH, '.') + ' ', statusEl);
    line.hidden = true;
    log.append(line);
    return { at, line, statusEl };
  });

  const finalLine = document.createElement('div');
  finalLine.className = 'final';
  finalLine.textContent = '> 开启';
  finalLine.hidden = true;
  log.append(finalLine);

  // Only touch the DOM when something flips, so the log doesn't cost a layout per frame.
  function updateLog() {
    for (const { at, line, statusEl } of logLines) {
      const lineHidden = progress < at;
      const statusHidden = progress < Math.min(1, at + STATUS_DELAY);
      if (line.hidden !== lineHidden) line.hidden = lineHidden;
      if (statusEl.hidden !== statusHidden) statusEl.hidden = statusHidden;
    }
  }

  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

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

    grains = samples.map(({ x, y, id }) => ({
      homeX: x + (hash(id + 13) - 0.5) * spacing * 0.7,
      homeY: y,
      // Displacement from home (cursor pushes, exit burst) and its velocity.
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      size: spacing * (0.55 + 0.6 * hash(id + 11)),
      alpha: 0.5 + 0.5 * hash(id + 3),
      blue: hash(id + 21) < 0.4,
      fallHeight: 30 + 170 * hash(id + 5),
      // When this grain appears, as a progress value: mostly left to right, with jitter.
      revealAt: Math.min(1, (0.55 * (x - bounds.left)) / wordWidth + 0.45 * hash(id + 9)),
      appearedAt: -1,
    }));

    wordBounds = bounds;
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

  /* ---------- physics ---------- */

  // Grains are pushed away from the cursor and spring back home.
  // Grains at rest with the cursor out of reach are skipped entirely.
  function updateGrains(dt) {
    const seconds = dt / 1000;
    const releasing = phase === 'release';
    const drag = Math.pow(releasing ? RELEASE_DRAG : DRAG, dt / 16.7);
    const repelSq = REPEL_RADIUS * REPEL_RADIUS;
    const pointerNearWord = !releasing &&
      pointer.x > wordBounds.left - REPEL_RADIUS && pointer.x < wordBounds.right + REPEL_RADIUS &&
      pointer.y > wordBounds.top - REPEL_RADIUS && pointer.y < wordBounds.bottom + REPEL_RADIUS;

    for (const g of grains) {
      if (g.appearedAt < 0) continue;
      if (g.resting && !pointerNearWord && !releasing) continue;
      g.resting = false;

      if (!releasing) {
        if (pointerNearWord) {
          const px = g.homeX + g.dx - pointer.x;
          const py = g.homeY + g.dy - pointer.y;
          const distSq = px * px + py * py;
          if (distSq > 0 && distSq < repelSq) {
            const d = Math.sqrt(distSq);
            const push = REPEL_FORCE * (1 - d / REPEL_RADIUS);
            g.vx += (px / d) * push * seconds;
            g.vy += (py / d) * push * seconds;
          }
        }
        g.vx -= g.dx * SPRING * seconds;
        g.vy -= g.dy * SPRING * seconds;
      }

      g.vx *= drag;
      g.vy *= drag;
      g.dx += g.vx * seconds;
      g.dy += g.vy * seconds;

      // Snap to rest once the motion is sub-pixel.
      if (!releasing && Math.abs(g.dx) + Math.abs(g.dy) < 0.05 && Math.abs(g.vx) + Math.abs(g.vy) < 0.5) {
        g.dx = g.dy = g.vx = g.vy = 0;
        g.resting = true;
      }
    }
  }

  /* ---------- drawing ---------- */

  // Everything is drawn in batches grouped by color and opacity, so a frame is a
  // few dozen canvas calls instead of thousands. 20 opacity steps is visually seamless.
  const ALPHA_STEPS = 20;
  const alphaStep = (alpha) => Math.round(clamp01(alpha) * ALPHA_STEPS);
  const makeBuckets = (n) => Array.from({ length: n }, () => []);
  const tailBuckets = makeBuckets(ALPHA_STEPS + 1);
  const headBuckets = makeBuckets(ALPHA_STEPS + 1);
  const grainBuckets = makeBuckets(2 * (ALPHA_STEPS + 1)); // red steps, then blue steps

  function drawRain(now, dt) {
    let intensity = 1;
    if (phase === 'load') intensity = 0.45 + 0.55 * progress;
    else if (phase === 'release') intensity = 1 - clamp01((now - releaseStart) / (RELEASE_DURATION * 0.5));
    const speedUp = phase === 'release' ? 1.6 : 1;

    // Group segments by opacity step so each step is one stroke() call.
    for (const bucket of tailBuckets) bucket.length = 0;
    for (const bucket of headBuckets) bucket.length = 0;

    for (const col of rainColumns) {
      col.head += (col.speed * dt * speedUp) / 1000;
      if (col.head - col.length > height) {
        col.head = -Math.random() * height * 0.4;
        col.length = 30 + height * 0.55 * Math.random() * (0.35 + col.weight);
      }

      const alpha = col.weight * 0.6 * intensity;
      if (alpha < 0.01) continue;

      // Two-tone tail: a faint top half and a brighter bottom half.
      const mid = col.head - col.length * 0.45;
      tailBuckets[alphaStep(alpha * 0.3)].push(col.x, col.head - col.length, mid);
      tailBuckets[alphaStep(alpha)].push(col.x, mid, col.head);
      headBuckets[alphaStep(Math.min(1, alpha * 1.4))].push(col.x, col.head);
    }

    ctx.lineWidth = 1.3;
    ctx.setLineDash([1.4, 2.8]);
    ctx.strokeStyle = '#ff2a4d';
    tailBuckets.forEach((segments, step) => {
      if (!segments.length) return;
      ctx.globalAlpha = step / ALPHA_STEPS;
      ctx.beginPath();
      for (let k = 0; k < segments.length; k += 3) {
        ctx.moveTo(segments[k], segments[k + 1]);
        ctx.lineTo(segments[k], segments[k + 2]);
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);

    ctx.fillStyle = '#d2f0ff';
    headBuckets.forEach((heads, step) => {
      if (!heads.length) return;
      ctx.globalAlpha = step / ALPHA_STEPS;
      ctx.beginPath();
      for (let k = 0; k < heads.length; k += 2) ctx.rect(heads[k] - 1.1, heads[k + 1] - 1.1, 2.2, 2.2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawGrains(now) {
    const fadeOut = phase === 'release' ? 1 - clamp01((now - releaseStart) / (RELEASE_DURATION * 0.7)) : 1;
    for (const bucket of grainBuckets) bucket.length = 0;

    for (const g of grains) {
      if (g.handedOff) continue;
      if (g.appearedAt < 0) {
        if (g.revealAt > progress) continue;
        g.appearedAt = now;
      }
      const t = Math.min(1, (now - g.appearedAt) / GRAIN_FADE_IN);
      const fall = 1 - easeOutCubic(t);

      let alpha = g.alpha * (0.3 + 0.7 * t) * fadeOut;
      if (phase === 'lock') alpha *= 0.84 + 0.16 * Math.sin(now * 0.006 + g.revealAt * 60); // shimmer
      const step = alphaStep(alpha);
      if (step === 0) continue;

      // Grains fall into place as vertical streaks that shrink to dots.
      const bucket = grainBuckets[(g.blue ? ALPHA_STEPS + 1 : 0) + step];
      bucket.push(
        g.homeX + g.dx,
        g.homeY + g.dy - g.fallHeight * fall,
        g.size * 0.8,
        g.size * (1 + fall * g.fallHeight * 0.04),
      );
    }

    grainBuckets.forEach((rects, i) => {
      if (!rects.length) return;
      const blue = i > ALPHA_STEPS;
      ctx.fillStyle = blue ? '#bfe6ff' : '#e0193f';
      ctx.globalAlpha = (blue ? i - ALPHA_STEPS - 1 : i) / ALPHA_STEPS;
      ctx.beginPath();
      for (let k = 0; k < rects.length; k += 4) ctx.rect(rects[k], rects[k + 1], rects[k + 2], rects[k + 3]);
      ctx.fill();
    });
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

  // Burst the name outward. A sample of grains is handed to the background
  // particle network, which glides them out to become its points; the rest
  // fade on this canvas while the gate's backdrop fades away.
  function release() {
    if (phase === 'release') return;
    phase = 'release';
    releaseStart = performance.now();

    const cx = width / 2;
    const cy = height / 2;
    for (const g of grains) {
      const ox = g.homeX + g.dx - cx;
      const oy = g.homeY + g.dy - cy;
      const d = Math.hypot(ox, oy) || 1;
      const speed = 250 + 900 * Math.random();
      const wobble = (Math.random() - 0.5) * 0.8;
      g.vx += ((ox / d) + wobble) * speed;
      g.vy += ((oy / d) - wobble) * speed;
    }

    const network = window.particleNetwork;
    if (network) {
      const visible = grains.filter((g) => g.appearedAt >= 0);
      const picked = [];
      const want = Math.min(network.count, visible.length);
      for (let i = 0; i < want; i++) {
        const g = visible[Math.floor((i / want) * visible.length)]; // spread evenly over the word
        g.handedOff = true;
        picked.push({ x: g.homeX + g.dx, y: g.homeY + g.dy, blue: g.blue });
      }
      network.adopt(picked, RELEASE_DURATION * 1.6);
    }

    gate.classList.add('is-releasing');
    markReady(); // start the page underneath while the gate fades
    setTimeout(finish, RELEASE_DURATION);
  }

  function updateLoad(now, dt) {
    const target = rushing ? 1 : simulatedProgress((now - startTime) / LOAD_DURATION);
    const smoothing = Math.min(1, ((rushing ? 0.15 : 1) * dt) / 16.7);
    progress += (target - progress) * smoothing;
    if (target - progress < 0.002) progress = target;

    setText(nameLabel, scrambledLabel(progress / 0.7, Math.floor(now / 85)));
    const percent = String(Math.round(progress * 100));
    if (gate.getAttribute('aria-valuenow') !== percent) gate.setAttribute('aria-valuenow', percent);
    updateLog();

    if (progress >= 1) {
      phase = 'lock';
      nameLabel.textContent = LABEL;
      finalLine.hidden = false;
      setTimeout(release, LOCK_HOLD);
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(64, now - lastFrame);
    lastFrame = now;

    if (phase === 'load') updateLoad(now, dt);
    updateGrains(dt);

    ctx.clearRect(0, 0, width, height);
    drawRain(now, dt);
    drawGrains(now);

    requestAnimationFrame(frame);
  }

  /* ---------- input ---------- */

  addEventListener('keydown', (e) => {
    if (!gate.isConnected) return;
    if (e.key === 'Escape' || e.key.toLowerCase() === 's') {
      e.preventDefault();
      finish();
    }
  });

  gate.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  });
  gate.addEventListener('pointerleave', () => {
    pointer.x = pointer.y = -1e4;
  });

  gate.addEventListener('click', () => {
    if (phase === 'load') rushing = true;
    else if (phase === 'lock') release();
  });

  gate.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      gate.click();
    }
  });

  /* ---------- start ---------- */

  root.style.overflow = 'hidden';
  addEventListener('resize', () => {
    if (phase !== 'release') build();
  });

  // Wait briefly for the CJK font so the word is sampled in the right typeface.
  const fontReady = document.fonts ? document.fonts.load(`900 100px "Noto Sans SC"`, WORD) : Promise.resolve();
  const timeout = new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT));
  Promise.race([fontReady, timeout]).then(() => {
    startTime = lastFrame = performance.now();
    build();
    requestAnimationFrame(frame);
  });
})();
