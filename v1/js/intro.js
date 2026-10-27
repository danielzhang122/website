// Intro screen: 张卓远 is plotted stroke by stroke like a CNC toolpath, with a
// live G-code feed, while ASCII characters settle into each stroke right behind
// the tool. The characters (grains) shy away from the cursor. On exit the name
// bursts apart and some of its grains become the site's background particle
// network. Shown once per session.
//
// Everything runs off one virtual clock (vt), so speeding up is just scaling time.
// Timeline: plot → lock (brief hold) → release (exit) → finish.
// Click speeds up the plot (or exits once locked); Esc / S skips straight to the site.
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

  const GLYPHS = window.INTRO_GLYPHS;
  if (seenThisSession || !GLYPHS || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gate.remove();
    markReady();
    loadChatbot();
    return;
  }

  /* ---------- config ---------- */

  const LABEL = 'daniel zhang';
  const SCRAMBLE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789#$%&@';
  const RAMP = '.:-=+*#%@';       // light to dense, picked by how much of a cell the strokes cover
  const SPARK_CHARS = "*+.'`";
  const MIN_COVERAGE = 0.12;      // cells with less stroke than this stay empty

  const START_DELAY = 120;        // ms before the first move
  const CUT_TIME = 1100;          // ms spent cutting all strokes
  const RAPID_FACTOR = 4.5;       // rapids (G00) move this much faster than cuts
  const MIN_RAPID = 18;           // ms, shortest rapid move
  const FILL_DELAY = 90;          // ms between the tool passing and grains landing
  const FILL_SPREAD = 130;        // ms of random jitter on top of that
  const GRAIN_FADE_IN = 380;      // ms for a grain to fall into place
  const COOL_DOWN = 480;          // ms for a fresh cut to cool from hot red to toolpath blue
  const HOME_TIME = 240;          // ms for the tool to return home after the last stroke
  const LOCK_HOLD = 380;          // ms the finished name holds before exiting
  const RELEASE_DURATION = 1000;  // ms for the exit
  const RUSH_SPEED = 3;           // time multiplier after a click
  const FEED_RATE = 2400;         // shown in the G-code feed, mm/min
  const FEED_LINES = 6;           // G-code lines visible at once

  const REPEL_RADIUS = 90;        // px around the cursor that pushes grains
  const REPEL_FORCE = 2600;       // px/s² at the cursor itself
  const SPRING = 90;              // pull back to the grain's home position
  const DRAG = 0.86;              // velocity kept per 60 fps frame
  const RELEASE_DRAG = 0.95;      // lighter drag so the exit burst carries

  /* ---------- helpers ---------- */

  // Deterministic pseudo-random in [0, 1) so grains look the same on every resize.
  const hash = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const randomChar = (seed) => SCRAMBLE_CHARS[Math.floor(hash(seed) * SCRAMBLE_CHARS.length)];

  // Reveals LABEL left to right as progress grows; unrevealed letters flicker.
  function scrambledLabel(progress, tick) {
    const revealed = Math.floor(clamp01(progress) * LABEL.length);
    return Array.from(LABEL, (char, i) => {
      if (char === ' ' || i < revealed) return char;
      return randomChar(i * 31 + tick * 7.13);
    }).join('');
  }

  // Sprite atlas layout: every character pre-rendered once in each of these colors.
  const COLOR = { red: 0, blue: 1, rain: 2, head: 3, sparkHot: 4, spark: 5 };
  const COLOR_VALUES = ['#ff3355', '#e4f5ff', '#ff2a4d', '#d2f0ff', '#ffd6dd', '#ff3a5c'];
  const ATLAS_CHARS = [...new Set(RAMP + SCRAMBLE_CHARS + SPARK_CHARS)];
  const charIndex = new Map(ATLAS_CHARS.map((char, i) => [char, i]));
  const sprite = (char, color) => color * ATLAS_CHARS.length + charIndex.get(char);

  /* ---------- state ---------- */

  const canvas = gate.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const nameLabel = gate.querySelector('.gate-name');
  const feed = gate.querySelector('.gate-log');

  let width = 0;
  let height = 0;
  let glyphSize = 0;          // px per glyph box
  let unit = 0;               // px per glyph unit (data is on a 1024 grid)
  let origin = { x: 0, y: 0 };    // plotter (0, 0): baseline of the first glyph
  let home = { x: 0, y: 0 };      // where the tool parks
  let wordBounds = { left: 0, right: 0, top: 0, bottom: 0 };
  let strokes = [];
  let grains = [];
  let rainColumns = [];
  let events = [];
  let schedule = {};
  let cutSpeed = 1;           // px per ms
  let dpr = 1;
  let cellW = 0;              // px per character cell
  let cellH = 0;
  let atlas = null;           // pre-rendered characters, see buildAtlas()
  let atlasCell = { w: 0, h: 0 };
  let bed = null;             // pre-rendered dot grid
  let sparks = [];

  let vt = 0;                 // virtual time, ms since the plot started
  let lastFrame = 0;
  let rushing = false;
  let released = false;
  let running = true;
  let shownEvents = -1;
  let shownStatus = '';
  const pointer = { x: -1e4, y: -1e4 };

  /* ---------- scene setup ---------- */

  function build() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(1.5, devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    glyphSize = Math.min((width * 0.88) / 2.94, height * 0.46);
    unit = glyphSize / 1024;
    cellW = Math.max(6, Math.round(glyphSize / 48));
    cellH = Math.round(cellW * 1.6); // monospace aspect
    const advance = glyphSize * 0.97;
    const left = (width - (advance * 2 + glyphSize)) / 2;
    const top = height * 0.44 - glyphSize / 2;
    origin = { x: left, y: top + 900 * unit };
    home = { x: left - glyphSize * 0.14, y: top + glyphSize * 0.08 };
    wordBounds = { left, right: left + advance * 2 + glyphSize, top, bottom: top + glyphSize };

    strokes = [];
    GLYPHS.forEach((glyph, ci) => {
      const ox = left + ci * advance;
      glyph.strokes.forEach((outline, si) => {
        const pts = glyph.medians[si].map(([x, y]) => ({ x: ox + x * unit, y: top + (900 - y) * unit }));
        const cum = [0];
        for (let i = 1; i < pts.length; i++) {
          cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
        }
        strokes.push({
          char: glyph.char,
          index: si + 1,
          count: glyph.strokes.length,
          path: new Path2D(outline),
          ox,
          top,
          pts,
          cum,
          len: cum[cum.length - 1],
        });
      });
    });

    planSchedule();
    sampleGrains();
    buildRain();
    buildBed(dpr);
    buildAtlas();

    // The visible ink sits roughly between y = 860 and y = -40 on the glyph grid.
    gate.style.setProperty('--word-top', `${top + 40 * unit}px`);
    gate.style.setProperty('--word-height', `${900 * unit}px`);
    shownEvents = -1;
    shownStatus = '';
  }

  // Times for every move: a rapid to each stroke's start, then a cut along its centerline.
  function planSchedule() {
    const total = strokes.reduce((sum, st) => sum + st.len, 0);
    cutSpeed = total / CUT_TIME;
    const rapidSpeed = cutSpeed * RAPID_FACTOR;
    const coords = (p) => {
      const x = ((p.x - origin.x) / unit / 10).toFixed(1).padStart(5);
      const y = ((origin.y - p.y) / unit / 10).toFixed(1).padStart(5);
      return `X${x} Y${y}`;
    };
    let lineNumber = 10;
    const block = (text) => `N${String(lineNumber++).padStart(3, '0')} ${text}`;

    events = [{ t: 0, text: 'G21 G90 ; mm, absolute' }];
    let t = START_DELAY;
    let pos = { ...home };
    for (const st of strokes) {
      st.rapidFrom = { ...pos };
      st.rapidStart = t;
      events.push({ t, text: block(`G00 ${coords(st.pts[0])}`) });
      t += Math.max(MIN_RAPID, Math.hypot(st.pts[0].x - pos.x, st.pts[0].y - pos.y) / rapidSpeed);

      st.cutStart = t;
      events.push({ t, text: block(`G01 ${coords(st.pts[st.pts.length - 1])} F${FEED_RATE}`) });
      t += st.len / cutSpeed;
      st.cutEnd = t;
      pos = st.pts[st.pts.length - 1];
    }

    const plotEnd = t;
    const lockStart = plotEnd + FILL_DELAY + FILL_SPREAD + GRAIN_FADE_IN * 0.7;
    const releaseStart = lockStart + LOCK_HOLD;
    schedule = {
      plotEnd,
      homeFrom: { ...pos },
      lockStart,
      releaseStart,
      end: releaseStart + RELEASE_DURATION,
    };
    events.push({ t: plotEnd, text: block('G28 ; home') });
    events.push({ t: lockStart - 80, text: 'M30 ; program end' });
    events.push({ t: lockStart, text: '> 开启', final: true });
  }

  // Rasterize the stroke outlines and lay a character grid over them. Every cell
  // the strokes cover becomes a grain, its character denser the more is covered.
  // Each grain knows its stroke and how far along it sits, so it lands right behind the tool.
  function sampleGrains() {
    const offscreen = document.createElement('canvas');
    offscreen.width = Math.ceil(width);
    offscreen.height = Math.ceil(height);
    const c = offscreen.getContext('2d', { willReadFrequently: true });
    const strokeTransform = (st) => c.setTransform(unit, 0, 0, -unit, st.ox, st.top + 900 * unit);

    c.fillStyle = '#fff';
    for (const st of strokes) {
      strokeTransform(st);
      c.fill(st.path);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);

    const pixels = c.getImageData(0, 0, offscreen.width, offscreen.height).data;
    const inside = (x, y) => pixels[(y * offscreen.width + x) * 4 + 3] >= 110;

    grains = [];
    const startX = Math.max(0, Math.floor(wordBounds.left));
    const startY = Math.max(0, Math.floor(wordBounds.top));
    for (let top = startY; top < wordBounds.bottom && top + cellH <= offscreen.height; top += cellH) {
      for (let left = startX; left < wordBounds.right && left + cellW <= offscreen.width; left += cellW) {
        // Share of the cell the strokes cover, sampled every other pixel.
        let hits = 0;
        let samples = 0;
        for (let y = top; y < top + cellH; y += 2) {
          for (let x = left; x < left + cellW; x += 2) {
            samples++;
            if (inside(x, y)) hits++;
          }
        }
        const coverage = hits / samples;
        if (coverage < MIN_COVERAGE) continue;

        const x = left + cellW / 2;
        const y = top + cellH / 2;
        const id = x * 7.31 + y * 1.97;
        if (hash(id) > 0.93) continue; // erode the strokes a bit

        // Edge cells can have their center just outside every stroke;
        // those go to whichever centerline is nearest.
        let owner = null;
        for (const st of strokes) {
          if (x < st.ox - 4 || x > st.ox + glyphSize + 4) continue;
          strokeTransform(st);
          if (c.isPointInPath(st.path, x, y)) {
            owner = st;
            break;
          }
        }

        // How far along the stroke this grain is: the nearest centerline point's share.
        let nearest = 0;
        let nearestDist = Infinity;
        let nearestStroke = owner;
        for (const st of owner ? [owner] : strokes) {
          st.pts.forEach((p, i) => {
            const d = (p.x - x) ** 2 + (p.y - y) ** 2;
            if (d < nearestDist) {
              nearestDist = d;
              nearest = i;
              nearestStroke = st;
            }
          });
        }
        owner = nearestStroke;
        const along = owner.cum[nearest] / owner.len;

        const level = clamp01(coverage + (hash(id + 7) - 0.5) * 0.2);
        grains.push({
          homeX: x,
          homeY: y,
          // Displacement from home (cursor pushes, exit burst) and its velocity.
          dx: 0,
          dy: 0,
          vx: 0,
          vy: 0,
          char: RAMP[Math.round(level * (RAMP.length - 1))],
          seed: id,
          alpha: 0.85 + 0.15 * hash(id + 3),
          blue: hash(id + 21) < 0.4,
          fallHeight: 22 + 90 * hash(id + 5),
          landAt: lerp(owner.cutStart, owner.cutEnd, along) + FILL_DELAY + hash(id + 9) * FILL_SPREAD,
          shimmer: hash(id + 17) * 60,
        });
      }
    }
  }

  // Rain columns of falling characters, densest over the word.
  function buildRain() {
    rainColumns = [];
    const mid = width / 2;
    const spread = Math.max(wordBounds.right - wordBounds.left, width * 0.3) * 0.62;
    for (let x = cellW, k = 0; x < width; x += cellW * 1.6, k++) {
      const distance = (x - mid) / spread;
      const weight = 0.12 + 0.88 * Math.exp(-distance * distance);
      rainColumns.push({
        x,
        head: hash(k + 1.7) * height * 1.4 - height * 0.2,
        speed: (50 + 190 * hash(k + 2.9)) * (0.6 + weight),
        length: 30 + height * 0.55 * hash(k + 4.1) * (0.35 + weight),
        weight,
      });
    }
  }

  // Faint dot grid, like a plotter bed. Rendered once, copied each frame.
  function buildBed(dpr) {
    bed = document.createElement('canvas');
    bed.width = canvas.width;
    bed.height = canvas.height;
    const b = bed.getContext('2d');
    b.scale(dpr, dpr);
    b.fillStyle = 'rgba(138, 216, 255, .09)';
    const gap = Math.max(14, glyphSize / 16);
    for (let y = gap / 2; y < height; y += gap) {
      for (let x = gap / 2; x < width; x += gap) b.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    }
  }

  // Every character in every color, rendered once; frames copy cells out of it
  // with drawImage, which is far cheaper than thousands of fillText calls.
  function buildAtlas() {
    const w = Math.ceil(cellW * dpr);
    const h = Math.ceil(cellH * dpr);
    atlas = document.createElement('canvas');
    atlas.width = w * ATLAS_CHARS.length;
    atlas.height = h * COLOR_VALUES.length;
    const a = atlas.getContext('2d');
    a.font = `800 ${Math.round((cellW / 0.6) * dpr)}px "JetBrains Mono", monospace`;
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    COLOR_VALUES.forEach((color, row) => {
      a.fillStyle = color;
      ATLAS_CHARS.forEach((char, col) => a.fillText(char, col * w + w / 2, row * h + h / 2));
    });
    atlasCell = { w, h };
  }

  /* ---------- motion ---------- */

  function pointAlong(st, distance) {
    if (distance <= 0) return st.pts[0];
    for (let i = 1; i < st.pts.length; i++) {
      if (st.cum[i] >= distance) {
        const t = (distance - st.cum[i - 1]) / (st.cum[i] - st.cum[i - 1] || 1);
        return { x: lerp(st.pts[i - 1].x, st.pts[i].x, t), y: lerp(st.pts[i - 1].y, st.pts[i].y, t) };
      }
    }
    return st.pts[st.pts.length - 1];
  }

  // Where the tool is at time t, and whether it's cutting.
  function toolAt(t) {
    if (t < strokes[0].rapidStart) return { ...home, cutting: false };
    for (const st of strokes) {
      if (t < st.cutStart) {
        const k = easeInOut(clamp01((t - st.rapidStart) / (st.cutStart - st.rapidStart)));
        return {
          x: lerp(st.rapidFrom.x, st.pts[0].x, k),
          y: lerp(st.rapidFrom.y, st.pts[0].y, k),
          cutting: false,
          stroke: st,
        };
      }
      if (t <= st.cutEnd) return { ...pointAlong(st, (t - st.cutStart) * cutSpeed), cutting: true, stroke: st };
    }
    const k = easeInOut(clamp01((t - schedule.plotEnd) / HOME_TIME));
    return { x: lerp(schedule.homeFrom.x, home.x, k), y: lerp(schedule.homeFrom.y, home.y, k), cutting: false };
  }

  // Grains are pushed away from the cursor and spring back home.
  // Grains at rest with the cursor out of reach are skipped entirely.
  function updateGrains(dt) {
    const seconds = dt / 1000;
    const releasing = released;
    const drag = Math.pow(releasing ? RELEASE_DRAG : DRAG, dt / 16.7);
    const repelSq = REPEL_RADIUS * REPEL_RADIUS;
    const pointerNearWord = !releasing &&
      pointer.x > wordBounds.left - REPEL_RADIUS && pointer.x < wordBounds.right + REPEL_RADIUS &&
      pointer.y > wordBounds.top - REPEL_RADIUS && pointer.y < wordBounds.bottom + REPEL_RADIUS;

    for (const g of grains) {
      if (vt < g.landAt) continue;
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

  function updateSparks(tool, dt) {
    const seconds = dt / 1000;
    if (tool.cutting && sparks.length < 140) {
      for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 220;
        sparks.push({
          x: tool.x,
          y: tool.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          age: 0,
          hot: Math.random() < 0.6,
          char: SPARK_CHARS[Math.floor(Math.random() * SPARK_CHARS.length)],
        });
      }
    }
    for (const p of sparks) {
      p.age += dt;
      p.vy += 420 * seconds; // gravity
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
    }
    sparks = sparks.filter((p) => p.age < 280);
  }

  /* ---------- drawing ---------- */

  // Characters are drawn in batches grouped by opacity, so a frame sets globalAlpha
  // a few dozen times instead of thousands. 20 opacity steps is seamless.
  const ALPHA_STEPS = 20;
  const alphaStep = (alpha) => Math.round(clamp01(alpha) * ALPHA_STEPS);
  const spriteBuckets = Array.from({ length: ALPHA_STEPS + 1 }, () => []);

  function clearBuckets() {
    for (const bucket of spriteBuckets) bucket.length = 0;
  }

  // Draws the bucketed [x, y, sprite] triples, centered on (x, y), scaled from the cell size.
  function drawBuckets(scale = 1) {
    const { w, h } = atlasCell;
    const dw = cellW * scale;
    const dh = cellH * scale;
    const perRow = ATLAS_CHARS.length;
    spriteBuckets.forEach((items, step) => {
      if (!items.length) return;
      ctx.globalAlpha = step / ALPHA_STEPS;
      for (let k = 0; k < items.length; k += 3) {
        const s = items[k + 2];
        ctx.drawImage(
          atlas, (s % perRow) * w, Math.floor(s / perRow) * h, w, h,
          items[k] - dw / 2, items[k + 1] - dh / 2, dw, dh,
        );
      }
    });
    ctx.globalAlpha = 1;
  }

  // Each column's characters sit on the cell grid and its head steps down it,
  // trailing a tail that fades out. Characters change slowly and out of sync.
  function drawRain(dt, intensity) {
    clearBuckets();
    rainColumns.forEach((col, k) => {
      col.head += (col.speed * dt) / 1000;
      if (col.head - col.length > height) {
        col.head = -Math.random() * height * 0.4;
        col.length = 30 + height * 0.55 * Math.random() * (0.35 + col.weight);
      }
      const alpha = col.weight * 0.32 * intensity;
      if (alpha < 0.01) return;

      const headRow = Math.floor(col.head / cellH);
      const rows = Math.max(1, Math.round(col.length / cellH));
      for (let r = 0; r < rows; r++) {
        const row = headRow - r;
        const y = (row + 0.5) * cellH;
        if (y < -cellH || y > height + cellH) continue;
        const char = randomChar(k * 13.7 + row * 1.31 + Math.floor(vt / 400 + hash(k + row * 0.7)) * 0.53);
        if (r === 0) spriteBuckets[alphaStep(alpha * 1.4)].push(col.x, y, sprite(char, COLOR.head));
        else spriteBuckets[alphaStep(alpha * (1 - r / rows))].push(col.x, y, sprite(char, COLOR.rain));
      }
    });
    drawBuckets(0.8);
  }

  function tracePolyline(st, length) {
    ctx.beginPath();
    ctx.moveTo(st.pts[0].x, st.pts[0].y);
    for (let i = 1; i < st.pts.length; i++) {
      if (st.cum[i] >= length) {
        const p = pointAlong(st, length);
        ctx.lineTo(p.x, p.y);
        return;
      }
      ctx.lineTo(st.pts[i].x, st.pts[i].y);
    }
  }

  // Cuts glow hot red while fresh, then cool to a thin blue toolpath that fades at the lock.
  function drawToolpath() {
    const fade = vt < schedule.lockStart ? 1 : 1 - clamp01((vt - schedule.lockStart) / (LOCK_HOLD * 0.8));
    if (fade <= 0) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const st of strokes) {
      if (vt < st.rapidStart) break;

      // Rapid move: a dashed line from where the tool was to the stroke start.
      const sinceCut = vt - st.cutStart;
      if (sinceCut < 220) {
        ctx.globalAlpha = 0.55 * (sinceCut < 0 ? 1 : 1 - sinceCut / 220) * fade;
        ctx.strokeStyle = '#8ad8ff';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(st.rapidFrom.x, st.rapidFrom.y);
        ctx.lineTo(st.pts[0].x, st.pts[0].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (vt < st.cutStart) break;

      const length = vt < st.cutEnd ? (vt - st.cutStart) * cutSpeed : st.len;
      const heat = vt < st.cutEnd ? 1 : 1 - clamp01((vt - st.cutEnd) / COOL_DOWN);

      ctx.globalAlpha = 0.42 * fade;
      ctx.strokeStyle = '#8ad8ff';
      ctx.lineWidth = 1;
      tracePolyline(st, length);
      ctx.stroke();

      if (heat > 0) {
        ctx.globalAlpha = 0.3 * heat * fade;
        ctx.strokeStyle = '#ff3a5c';
        ctx.lineWidth = Math.max(4, glyphSize * 0.03);
        ctx.stroke();
        ctx.globalAlpha = heat * fade;
        ctx.strokeStyle = '#ffe1e7';
        ctx.lineWidth = Math.max(1.3, glyphSize * 0.006);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Crosshair reticle with a glow (red while cutting) and a live coordinate readout.
  function drawTool(tool) {
    const fade = vt < schedule.lockStart ? 1 : 1 - clamp01((vt - schedule.lockStart) / (LOCK_HOLD * 0.7));
    if (fade <= 0) return;
    const r = Math.max(5, glyphSize * 0.022);
    const { x, y } = tool;

    ctx.globalAlpha = (tool.cutting ? 0.35 : 0.15) * fade;
    ctx.fillStyle = tool.cutting ? '#ff3a5c' : '#8ad8ff';
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.95 * fade;
    ctx.strokeStyle = '#8ad8ff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r * 2.3, y);
    ctx.lineTo(x - r * 1.3, y);
    ctx.moveTo(x + r * 1.3, y);
    ctx.lineTo(x + r * 2.3, y);
    ctx.moveTo(x, y - r * 2.3);
    ctx.lineTo(x, y - r * 1.3);
    ctx.moveTo(x, y + r * 1.3);
    ctx.lineTo(x, y + r * 2.3);
    ctx.stroke();

    ctx.fillStyle = tool.cutting ? '#ffffff' : '#8ad8ff';
    ctx.beginPath();
    ctx.arc(x, y, tool.cutting ? 2 : 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.85 * fade;
    ctx.fillStyle = '#8ad8ff';
    ctx.font = `600 ${Math.max(9, Math.round(glyphSize * 0.034))}px "JetBrains Mono", monospace`;
    const mmX = ((x - origin.x) / unit / 10).toFixed(1);
    const mmY = ((origin.y - y) / unit / 10).toFixed(1);
    ctx.fillText(`X${mmX} Y${mmY}`, x + r * 2.8, y - r * 1.4);
    ctx.globalAlpha = 1;
  }

  function drawSparks() {
    clearBuckets();
    for (const p of sparks) {
      spriteBuckets[alphaStep(1 - p.age / 280)].push(p.x, p.y, sprite(p.char, p.hot ? COLOR.sparkHot : COLOR.spark));
    }
    drawBuckets(0.7);
  }

  function drawGrains() {
    const fadeOut = released ? 1 - clamp01((vt - schedule.releaseStart) / (RELEASE_DURATION * 0.7)) : 1;
    const locked = vt >= schedule.lockStart && !released;
    // Share of landed grains glitching to a random character at any moment.
    const glitchOdds = released ? 0.5 : locked ? 0.03 : 0.005;
    const glitchTick = Math.floor(vt / 110) * 3.7;
    const scrambleTick = Math.floor(vt / 50);
    clearBuckets();

    for (const g of grains) {
      if (g.handedOff || vt < g.landAt) continue;
      const t = Math.min(1, (vt - g.landAt) / GRAIN_FADE_IN);
      const fall = 1 - easeOutCubic(t);

      let alpha = g.alpha * (0.3 + 0.7 * t) * fadeOut;
      if (locked) alpha *= 0.84 + 0.16 * Math.sin(vt * 0.006 + g.shimmer);
      const step = alphaStep(alpha);
      if (step === 0) continue;

      // Falling grains flicker through random characters and settle on their own on landing.
      const glitch = t < 1 || hash(g.seed + glitchTick) < glitchOdds;
      const char = glitch ? randomChar(g.seed + scrambleTick) : g.char;
      spriteBuckets[step].push(
        g.homeX + g.dx,
        g.homeY + g.dy - g.fallHeight * fall,
        sprite(char, g.blue ? COLOR.blue : COLOR.red),
      );
    }
    drawBuckets();
  }

  /* ---------- text overlays (the DOM only changes when the text does) ---------- */

  function updateOverlays(tool) {
    const done = strokes.filter((st) => vt >= st.cutEnd).length;
    const finished = done === strokes.length;

    const label = finished ? LABEL : scrambledLabel(done / strokes.length / 0.8, Math.floor(vt / 85));
    if (nameLabel.textContent !== label) nameLabel.textContent = label;

    const percent = String(Math.round((done / strokes.length) * 100));
    if (gate.getAttribute('aria-valuenow') !== percent) gate.setAttribute('aria-valuenow', percent);

    let passed = 0;
    while (passed < events.length && events[passed].t <= vt) passed++;
    const status = finished
      ? `${strokes.length}/${strokes.length} strokes`
      : tool.stroke ? `${tool.stroke.char} · stroke ${tool.stroke.index}/${tool.stroke.count}` : 'homing';
    if (passed === shownEvents && status === shownStatus) return;
    shownEvents = passed;
    shownStatus = status;

    const head = document.createElement('div');
    head.className = 'status';
    const word = document.createElement('b');
    word.textContent = finished ? 'PLOT OK ' : 'PLOTTING ';
    head.append(word, status);

    const lines = events.slice(Math.max(0, passed - FEED_LINES), passed).map((ev, i, list) => {
      const line = document.createElement('div');
      line.textContent = ev.text;
      if (ev.final) line.className = 'final';
      else if (i === list.length - 1) line.className = 'now';
      return line;
    });
    feed.replaceChildren(head, ...lines);
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
    released = true;
    sparks = [];

    const cx = width / 2;
    const cy = (wordBounds.top + wordBounds.bottom) / 2;
    for (const g of grains) {
      const ox = g.homeX + g.dx - cx;
      const oy = g.homeY + g.dy - cy;
      const d = Math.hypot(ox, oy) || 1;
      const speed = 250 + 900 * Math.random();
      const wobble = (Math.random() - 0.5) * 0.8;
      g.vx += (ox / d + wobble) * speed;
      g.vy += (oy / d - wobble) * speed;
    }

    const network = window.particleNetwork;
    if (network) {
      const visible = grains.filter((g) => vt >= g.landAt);
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
  }

  function frame(now) {
    if (!running) return;
    const real = Math.min(64, now - lastFrame);
    lastFrame = now;
    const dt = rushing && vt < schedule.lockStart ? real * RUSH_SPEED : real;
    vt += dt;

    if (!released && vt >= schedule.releaseStart) release();
    if (vt >= schedule.end) {
      finish();
      return;
    }

    const tool = toolAt(vt);
    updateGrains(dt);
    updateSparks(tool, dt);

    ctx.clearRect(0, 0, width, height);
    const backdrop = released ? 1 - clamp01((vt - schedule.releaseStart) / (RELEASE_DURATION * 0.5)) : 1;
    ctx.globalAlpha = backdrop;
    ctx.drawImage(bed, 0, 0, width, height);
    ctx.globalAlpha = 1;
    drawRain(dt, released ? backdrop : 0.45 + 0.55 * clamp01(vt / schedule.plotEnd));
    drawToolpath();
    drawGrains();
    drawSparks();
    if (!released) {
      drawTool(tool);
      updateOverlays(tool);
    }

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
    if (vt < schedule.lockStart) rushing = true;
    else if (!released) vt = schedule.releaseStart;
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
    if (!released) build();
  });

  build();
  // The atlas is drawn in JetBrains Mono; redraw it once the webfont has arrived.
  document.fonts?.load('800 16px "JetBrains Mono"').then(() => {
    if (running) buildAtlas();
  }, () => {});
  lastFrame = performance.now();
  requestAnimationFrame(frame);
})();
