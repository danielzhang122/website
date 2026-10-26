// Intro screen: 张卓远 fills in quietly out of ASCII characters, stroke by stroke
// in writing order, then "daniel zhang" types out and the screen fades away.
// Shown once per session. Esc / S / click skips it.
(() => {
  'use strict';

  const gate = document.getElementById('gate');

  let seenThisSession = false;
  try {
    seenThisSession = Boolean(sessionStorage.getItem('gate'));
  } catch {
    // storage blocked (private mode etc.): just show the intro
  }

  const GLYPHS = window.INTRO_GLYPHS;
  if (seenThisSession || !GLYPHS || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gate.remove();
    return;
  }

  /* ---------- config ---------- */

  const LABEL = 'daniel zhang';
  const RAMP = '·:-=+*#';        // light to dense, picked by how much of a cell the strokes cover
  const MIN_COVERAGE = 0.12;      // cells with less stroke than this stay empty
  // Character size, set per screen in build(): smaller on phones so all three glyphs fit.
  let FONT_SIZE = 14;             // px
  let CELL_W = FONT_SIZE * 0.6;   // IBM Plex Mono advance width
  let CELL_H = FONT_SIZE * 1.15;
  const SUPERSAMPLE = 4;          // offscreen pixels per cell edge, for coverage

  const FILL_TIME = 850;          // ms from first stroke starting to last stroke starting
  const STROKE_TIME = 150;        // ms for one stroke to fill along its length
  const JITTER = 90;              // ms of random delay per cell
  const CELL_FADE = 220;          // ms for a cell to settle into its character
  const TYPE_START = 600;         // ms
  const TYPE_SPEED = 35;          // ms per letter
  const HOLD = 300;               // ms after everything is in place
  const FADE_OUT = 450;           // ms, matches the CSS transition

  const COLORS = { ink: '#d8d8d8', accent: '#e5484d' };

  // Deterministic pseudo-random in [0, 1) so the fill looks the same after a resize.
  const hash = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  /* ---------- layout ---------- */

  const canvas = gate.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const strokeCount = GLYPHS.reduce((n, g) => n + g.strokes.length, 0);

  let cells = [];          // { x, y, char, start }
  let label = { x: 0, y: 0 };
  let fillEnd = 0;

  // Rasterizes the glyphs onto a small offscreen grid, one stroke at a time, so each
  // cell knows its final density and which stroke (and how far along it) reaches it first.
  function build() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = innerWidth;
    const height = innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const narrow = width < 600;
    FONT_SIZE = narrow ? 9 : 14;
    CELL_W = FONT_SIZE * 0.6;
    CELL_H = FONT_SIZE * 1.15;
    ctx.font = `400 ${FONT_SIZE}px 'IBM Plex Mono', ui-monospace, monospace`;
    ctx.textBaseline = 'top';

    const glyphCols = Math.max(12, Math.min(40, Math.floor((width * (narrow ? 0.9 : 0.78)) / 3.2 / CELL_W)));
    const glyphRows = Math.round((glyphCols * CELL_W) / CELL_H);
    const gap = Math.round(glyphCols * 0.12);
    const cols = GLYPHS.length * glyphCols + (GLYPHS.length - 1) * gap;
    const rows = glyphRows;

    const off = document.createElement('canvas');
    off.width = cols * SUPERSAMPLE;
    off.height = rows * SUPERSAMPLE;
    const octx = off.getContext('2d', { willReadFrequently: true });
    const scaleX = (glyphCols * SUPERSAMPLE) / 1024;
    const scaleY = (rows * SUPERSAMPLE) / 1024;

    const coverageOf = (data, col, row) => {
      let sum = 0;
      for (let y = 0; y < SUPERSAMPLE; y++) {
        for (let x = 0; x < SUPERSAMPLE; x++) {
          sum += data[((row * SUPERSAMPLE + y) * off.width + col * SUPERSAMPLE + x) * 4 + 3];
        }
      }
      return sum / (255 * SUPERSAMPLE * SUPERSAMPLE);
    };

    const left = Math.round((width - cols * CELL_W) / 2);
    const top = Math.round(height * 0.44 - (rows * CELL_H) / 2);
    const grid = new Map();   // "col,row" -> cell
    let strokeIndex = 0;

    GLYPHS.forEach((glyph, g) => {
      const originX = g * (glyphCols + gap) * SUPERSAMPLE;
      glyph.strokes.forEach((d, s) => {
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.clearRect(0, 0, off.width, off.height);
        // Glyph data has y pointing up with the top at 900.
        octx.setTransform(scaleX, 0, 0, -scaleY, originX, 900 * scaleY);
        octx.fill(new Path2D(d));
        const data = octx.getImageData(0, 0, off.width, off.height).data;
        const median = glyph.medians[s];
        const startTime = (strokeIndex / Math.max(1, strokeCount - 1)) * FILL_TIME;

        const colFrom = Math.floor(originX / SUPERSAMPLE);
        for (let row = 0; row < rows; row++) {
          for (let col = colFrom; col < colFrom + glyphCols; col++) {
            const coverage = coverageOf(data, col, row);
            if (coverage <= 0) continue;
            const key = `${col},${row}`;
            const existing = grid.get(key);
            if (existing) {
              existing.coverage = Math.min(1, existing.coverage + coverage);
              continue;
            }
            // How far along this stroke's centerline the cell sits, 0 to 1.
            const ux = ((col - colFrom + 0.5) * 1024) / glyphCols;
            const uy = 900 - ((row + 0.5) * 1024) / rows;
            let nearest = 0;
            let best = Infinity;
            median.forEach(([mx, my], i) => {
              const dist = (mx - ux) ** 2 + (my - uy) ** 2;
              if (dist < best) { best = dist; nearest = i; }
            });
            const along = median.length > 1 ? nearest / (median.length - 1) : 0;
            grid.set(key, {
              x: left + col * CELL_W,
              y: top + row * CELL_H,
              coverage,
              start: startTime + along * STROKE_TIME + hash(col * 31 + row * 17) * JITTER,
            });
          }
        }
        strokeIndex++;
      });
    });

    cells = [...grid.values()].filter((c) => c.coverage >= MIN_COVERAGE);
    for (const cell of cells) {
      // sqrt leans toward the denser characters, so thin strokes still read clearly.
      const t = Math.sqrt(clamp01((cell.coverage - MIN_COVERAGE) / (1 - MIN_COVERAGE)));
      cell.char = RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))];
    }
    fillEnd = Math.max(...cells.map((c) => c.start)) + CELL_FADE;
    label = {
      x: Math.round((width - LABEL.length * CELL_W) / 2),
      y: Math.round(top + rows * CELL_H + CELL_H * 2.5),
    };
  }

  /* ---------- drawing ---------- */

  function draw(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const cell of cells) {
      const p = (t - cell.start) / CELL_FADE;
      if (p <= 0) continue;
      const settled = p >= 1;
      ctx.globalAlpha = settled ? 1 : 0.25 + 0.75 * p;
      ctx.fillStyle = p < 0.45 ? COLORS.accent : COLORS.ink;
      ctx.fillText(settled || p > 0.5 ? cell.char : '·', cell.x, cell.y);
    }

    ctx.globalAlpha = 1;
    const typed = Math.max(0, Math.min(LABEL.length, Math.floor((t - TYPE_START) / TYPE_SPEED)));
    if (t >= TYPE_START) {
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(LABEL.slice(0, typed), label.x, label.y);
      if (Math.floor(t / 500) % 2 === 0) {
        ctx.fillStyle = COLORS.accent;
        ctx.fillText('█', label.x + typed * CELL_W, label.y);
      }
    }
  }

  /* ---------- timeline ---------- */

  let startedAt = 0;
  let leaving = false;
  let raf = 0;

  function leave() {
    if (leaving) return;
    leaving = true;
    try {
      sessionStorage.setItem('gate', '1');
    } catch {
      // storage blocked: the intro just plays again next time
    }
    gate.classList.add('is-leaving');
    setTimeout(() => {
      cancelAnimationFrame(raf);
      gate.remove();
    }, FADE_OUT);
  }

  function frame(now) {
    if (!startedAt) startedAt = now;
    const t = now - startedAt;
    draw(t);
    const typedEnd = TYPE_START + LABEL.length * TYPE_SPEED;
    if (t > Math.max(fillEnd, typedEnd) + HOLD) leave();
    raf = requestAnimationFrame(frame);
  }

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 's' || e.key === 'S') leave();
  });
  gate.addEventListener('click', leave);
  addEventListener('resize', build);

  // Wait for the mono font so the characters measure right; don't hang if it never comes.
  Promise.race([
    document.fonts.load(`${FONT_SIZE}px 'IBM Plex Mono'`),
    new Promise((resolve) => setTimeout(resolve, 600)),
  ]).finally(() => {
    build();
    raf = requestAnimationFrame(frame);
  });
})();
