// Intro screen: 张卓远 fills in quietly out of ASCII characters, stroke by stroke
// in writing order, then "daniel zhang" types out and the screen fades away.
// Shown once per session. Esc / S / click skips it.
//
// The final frame is Daniel's hand-tuned ASCII (NAME_ART); the rasterizer only supplies
// the stroke order it fills in by. Shared as window.IntroArt, so the terminal's hidden
// `name` command can print the same animation as text inside the console.
(() => {
  'use strict';

  /* ---------- config ---------- */

  const GLYPHS = window.INTRO_GLYPHS;
  const LABEL = 'daniel zhang';
  const RAMP = ':=+*#';          // light to dense, picked by how much of a cell the strokes cover
  const MIN_COVERAGE = 0.2;       // cells only grazed by a stroke stay empty, so edges stay crisp
  const FULL_COVERAGE = 0.7;      // from here on a cell gets the densest character
  const SUPERSAMPLE = 4;          // offscreen pixels per cell edge, for coverage

  const FILL_TIME = 850;          // ms from first stroke starting to last stroke starting
  const STROKE_TIME = 150;        // ms for one stroke to fill along its length
  const JITTER = 90;              // ms of random delay per cell
  const CELL_FADE = 220;          // ms for a cell to settle into its character
  const TYPE_START = 600;         // ms
  const TYPE_SPEED = 35;          // ms per letter
  const HOLD = 300;               // ms after everything is in place
  const FADE_OUT = 450;           // ms, matches the CSS transition

  // Deterministic pseudo-random in [0, 1) so the fill looks the same after a resize.
  const hash = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  /* ---------- rasterizer (shared) ---------- */

  // Rasterizes the glyphs onto a character grid, one stroke at a time, so each cell
  // knows its final density and which stroke (and how far along it) reaches it first.
  // glyphCols is the width of one glyph in cells; aspect is cell width / cell height.
  // Returns grid units only: { cols, rows, cells: [{ col, row, char, start }], fillEnd }.
  function rasterize(glyphCols, aspect) {
    const strokeCount = GLYPHS.reduce((n, g) => n + g.strokes.length, 0);
    const glyphRows = Math.round(glyphCols * aspect);
    const gap = Math.round(glyphCols * 0.12);       // between glyphs, in columns
    const count = GLYPHS.length;
    const cols = count * glyphCols + (count - 1) * gap;
    const rows = glyphRows;

    const off = document.createElement('canvas');
    off.width = cols * SUPERSAMPLE;
    off.height = rows * SUPERSAMPLE;
    const octx = off.getContext('2d', { willReadFrequently: true });
    const scaleX = (glyphCols * SUPERSAMPLE) / 1024;
    const scaleY = (glyphRows * SUPERSAMPLE) / 1024;

    const coverageOf = (data, col, row) => {
      let sum = 0;
      for (let y = 0; y < SUPERSAMPLE; y++) {
        for (let x = 0; x < SUPERSAMPLE; x++) {
          sum += data[((row * SUPERSAMPLE + y) * off.width + col * SUPERSAMPLE + x) * 4 + 3];
        }
      }
      return sum / (255 * SUPERSAMPLE * SUPERSAMPLE);
    };

    const grid = new Map();   // "col,row" -> cell
    let strokeIndex = 0;

    GLYPHS.forEach((glyph, g) => {
      // This glyph's top-left corner, in cells.
      const ox = g * (glyphCols + gap);
      const oy = 0;
      glyph.strokes.forEach((d, s) => {
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.clearRect(0, 0, off.width, off.height);
        // Glyph data has y pointing up with the top at 900.
        octx.setTransform(scaleX, 0, 0, -scaleY, ox * SUPERSAMPLE, oy * SUPERSAMPLE + 900 * scaleY);
        octx.fill(new Path2D(d));
        const data = octx.getImageData(0, 0, off.width, off.height).data;
        const median = glyph.medians[s];
        const startTime = (strokeIndex / Math.max(1, strokeCount - 1)) * FILL_TIME;

        for (let row = oy; row < oy + glyphRows; row++) {
          for (let col = ox; col < ox + glyphCols; col++) {
            const coverage = coverageOf(data, col, row);
            if (coverage <= 0) continue;
            const key = `${col},${row}`;
            const existing = grid.get(key);
            if (existing) {
              existing.coverage = Math.min(1, existing.coverage + coverage);
              continue;
            }
            // How far along this stroke's centerline the cell sits, 0 to 1.
            const ux = ((col - ox + 0.5) * 1024) / glyphCols;
            const uy = 900 - ((row - oy + 0.5) * 1024) / glyphRows;
            let nearest = 0;
            let best = Infinity;
            median.forEach(([mx, my], i) => {
              const dist = (mx - ux) ** 2 + (my - uy) ** 2;
              if (dist < best) { best = dist; nearest = i; }
            });
            const along = median.length > 1 ? nearest / (median.length - 1) : 0;
            grid.set(key, {
              col,
              row,
              coverage,
              start: startTime + along * STROKE_TIME + hash(col * 31 + row * 17) * JITTER,
            });
          }
        }
        strokeIndex++;
      });
    });

    const cells = [...grid.values()].filter((c) => c.coverage >= MIN_COVERAGE);
    for (const cell of cells) {
      // A steep ramp: mostly covered cells get the solid characters, so strokes read
      // as clean lines rather than soft gradients.
      const t = clamp01((cell.coverage - MIN_COVERAGE) / (FULL_COVERAGE - MIN_COVERAGE));
      cell.char = RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))];
    }
    const fillEnd = Math.max(...cells.map((c) => c.start)) + CELL_FADE;
    return { cols, rows, cells, fillEnd };
  }

  // One frame of a rasterized art as HTML text: settling cells show a red dot, then their
  // character; below, the label types out with a red block cursor (blinking if asked).
  function renderText({ cols, rows, cells }, t, { done = false, labelPad = '', blink = false } = {}) {
    const lines = Array.from({ length: rows }, () => Array(cols).fill(' '));
    for (const cell of cells) {
      const p = (t - cell.start) / CELL_FADE;
      if (p <= 0) continue;
      if (p < 0.45) lines[cell.row][cell.col] = '<span class="accent">·</span>';
      else lines[cell.row][cell.col] = p > 0.5 ? cell.char : '·';
    }
    const typed = Math.max(0, Math.min(LABEL.length, Math.floor((t - TYPE_START) / TYPE_SPEED)));
    const cursorOn = !done && t >= TYPE_START && (!blink || Math.floor(t / 500) % 2 === 0);
    const cursor = cursorOn ? '<span class="accent">█</span>' : '';
    const label = t >= TYPE_START ? labelPad + LABEL.slice(0, typed) + cursor : '';
    return `${lines.map((row) => row.join('').trimEnd()).join('\n')}\n\n${label}`;
  }

  /* ---------- the name as drawn (hand-tuned) ---------- */

  // Daniel's hand-tuned final frame of 张卓远: three glyphs of ART_GLYPH_COLS columns
  // with ART_GAP-column gaps between them, drawn for 13px characters.
  const NAME_ART = [
    "                                                 =:",
    "                                                 ##*                          =",
    "       :+++*:  ###                               =##*##*+                     +###        :=:",
    "      :++==##:  ##    ##                         :#:                            =*   +#####*=",
    "          *#    ##  =##=                   ::::=+*#****###",
    "     ++=+###    ##:##:                     :##:        =##                   =**:        :=*###+",
    "     =##        #*      *+:                 *#*******  ##                 =*#+### :########",
    "     ##   :  =*####*+++===                   #*       ##+                   ##     +*  ##",
    "    *##+++##*   #*##                         =#++###  +*                     :#:     ##  #=     :",
    "          ##:   #= =#*                            ##    =+*##*                +#    ##   #=     #+",
    "          ##    #:   ###=             =++*###****###***********:               #+ +*:    ##+==+###",
    "         *#+    #: := :####*=          ==:        #*                     +####*####+:      +***+=",
    "     ++:+##    +#*#=                              #*                               :*###*+=:",
    "      +###     ##*                                #*                                   :+########*:",
    "                                                  #=",
  ];
  const ART_GLYPH_COLS = 31;
  const ART_GAP = 4;
  const ART_ASPECT = 0.6 / 1.15;   // character width / line height

  // The hand-drawn art as { cols, rows, cells, fillEnd }, like rasterize() returns, so it
  // animates the same way. Each cell takes its fill time from the rasterized strokes at
  // the same spot (or the nearest stroke cell), so it still fills in writing order.
  // vertical stacks the three glyphs top to bottom for narrow screens.
  let timedCells = null;
  function nameArt({ vertical = false } = {}) {
    if (!timedCells) {
      const strokes = rasterize(ART_GLYPH_COLS, ART_ASPECT).cells;
      timedCells = [];
      NAME_ART.forEach((line, row) => {
        [...line].forEach((char, col) => {
          if (char === ' ') return;
          let start = 0;
          let best = Infinity;
          for (const c of strokes) {
            const dist = (c.col - col) ** 2 + ((c.row - row) * 2) ** 2;
            if (dist < best) { best = dist; start = c.start; }
          }
          timedCells.push({ col, row, char, start });
        });
      });
    }

    const pitch = ART_GLYPH_COLS + ART_GAP;
    const glyphRows = NAME_ART.length;
    const gapRows = Math.round(glyphRows * 0.25);
    const cells = vertical
      ? timedCells.map((c) => {
        const g = Math.floor(c.col / pitch);
        return { ...c, col: c.col - g * pitch, row: c.row + g * (glyphRows + gapRows) };
      })
      : timedCells;
    const count = GLYPHS.length;
    return {
      cols: vertical ? ART_GLYPH_COLS : count * ART_GLYPH_COLS + (count - 1) * ART_GAP,
      rows: vertical ? count * glyphRows + (count - 1) * gapRows : glyphRows,
      cells,
      fillEnd: Math.max(...cells.map((c) => c.start)) + CELL_FADE,
    };
  }

  window.IntroArt = GLYPHS ? { nameArt, renderText, timing: { CELL_FADE, TYPE_START, TYPE_SPEED, LABEL } } : null;

  /* ---------- full-screen intro ---------- */

  const gate = document.getElementById('gate');

  let seenThisSession = false;
  try {
    seenThisSession = Boolean(sessionStorage.getItem('gate'));
  } catch {
    // storage blocked (private mode etc.): just show the intro
  }

  if (seenThisSession || !GLYPHS || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gate.remove();
    return;
  }

  const pre = gate.querySelector('.gate-art');

  let art = null;          // the name art, rebuilt on resize
  let labelPad = '';

  // The art has a fixed size, so the font size scales it to the screen: a row on
  // desktop; on phones the glyphs stack vertically so each gets the full width.
  function build() {
    const width = innerWidth;
    const height = innerHeight;
    const narrow = width < 600;
    art = nameArt({ vertical: narrow });
    // Characters are 0.6em wide and 1.15em tall; leave room for the label below.
    const fit = Math.min((width * (narrow ? 0.9 : 0.8)) / (art.cols * 0.6), (height * 0.8) / ((art.rows + 3) * 1.15));
    const fontSize = Math.max(6, Math.min(16, Math.floor(fit)));
    labelPad = ' '.repeat(Math.max(0, Math.floor((art.cols - LABEL.length) / 2)));
    pre.style.fontSize = `${fontSize}px`;
    // Fixed to the full art width, so the drawing stays centred while it fills in.
    pre.style.width = `${art.cols}ch`;
  }

  function draw(t) {
    pre.innerHTML = renderText(art, t, { labelPad, blink: true });
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
    if (t > Math.max(art.fillEnd, typedEnd) + HOLD) leave();
    raf = requestAnimationFrame(frame);
  }

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 's' || e.key === 'S') leave();
  });
  gate.addEventListener('click', leave);
  addEventListener('resize', build);

  // Wait for the mono font so the characters measure right; don't hang if it never comes.
  Promise.race([
    document.fonts.load("14px 'IBM Plex Mono'"),
    new Promise((resolve) => setTimeout(resolve, 600)),
  ]).finally(() => {
    build();
    raf = requestAnimationFrame(frame);
  });
})();
