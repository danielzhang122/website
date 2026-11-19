// A vintage TV's bulging glass and screen outline, the hidden fisheye and outline commands (part of
// superhot; in retro, on desktop; see setFeatures in js/terminal.js): an SVG displacement filter on the console, the command
// bar and the intro (see the end of css/style.css). It magnifies the middle of the screen and bows
// straight lines outward, leaving the corners put.
(() => {
  const K = 0.065;     // bulge strength: the centre is magnified by 1 / (1 - K)
  const SHIFT = 0.2;   // device px each way for the two averaged bends that soften the steps (see place)
  const N = 512;       // map resolution; the browser smooths it up to screen size
  const root = document.documentElement;
  const consoleEl = document.getElementById('console');
  if (!consoleEl || !CSS.supports('filter', 'url(#a)')) return;
  // Phones get no fisheye at all: css/style.css applies none of it below 641px, and fx-live (the
  // click and hover redirect) stays off there.
  const phone = matchMedia('(max-width: 640px)');
  const shows = (name) => root.classList.contains(`sh-${name}`) && !root.classList.contains('no-retro') && !phone.matches;

  // Where the picture at screen point (cx, cy) comes from: x, y run -1..1 across the screen, and the
  // picture comes from p * (1 - K * (1 - r² / 2)) of the way out, r being the distance from the
  // middle, in half the screen's longer side (M / 2). So the middle is magnified and the corners
  // (r² = 2) stay put; the middles of the edges are pushed off screen by K / 2 of a half-screen.
  // (The 254/255 and 0.5/255 are the map's own rounding: channel 128 + 254 * shift, as first drawn.)
  function shiftAt(x, y, w, h) {
    const f = -(1 - (x * x + y * y) / 2);   // in units of K
    const scale = K * Math.max(w, h) / 2;
    return [x, y].map((v) => scale * (0.5 / 255 + (254 / 255) * v * f));
  }
  function source(cx, cy) {
    const w = innerWidth, h = innerHeight;
    const [dx, dy] = shiftAt(cx / w * 2 - 1, cy / h * 2 - 1, w, h);
    return [cx + dx, cy + dy];
  }

  // feDisplacementMap shifts by scale * (C / 255 - 0.5), C being the map's channel value. The largest
  // shift is K / 2 of a half-screen (at the middle of an edge), so scale = K * M / 2 fits it exactly.
  const scaleFor = (w, h) => K * Math.max(w, h) / 2;
  // Where a point of the unbent page is drawn: the screen point whose picture comes from it,
  // found by stepping back from it by the shift there (it settles within a few steps).
  function drawnAt(lx, ly) {
    if (!shows('fisheye')) return [lx, ly];   // the outline without the bend is a plain rectangle
    let x = lx, y = ly;
    for (let i = 0; i < 8; i++) [x, y] = ((s) => [lx - s[0], ly - s[1]])(source(x, y).map((v, k) => v - [x, y][k]));
    return [x, y];
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  // The map depends on the screen's shape (it's stretched across the screen), so it's redrawn when
  // that changes.
  function drawMap(w, h) {
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(N, N);
    const scale = scaleFor(w, h);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const [dx, dy] = shiftAt((i + 0.5) / N * 2 - 1, (j + 0.5) / N * 2 - 1, w, h);
        const o = (j * N + i) * 4;
        img.data[o] = Math.round(255 * (dx / scale + 0.5));
        img.data[o + 1] = Math.round(255 * (dy / scale + 0.5));
        img.data[o + 2] = 128;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  // One filter per bent element: each lines its lens up with the screen in its own coordinates.
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0';
  document.body.appendChild(svg);
  const lenses = [['console', consoleEl], ['bar', document.getElementById('shortcuts')], ['gate', document.getElementById('gate')]]
    .filter(([, el]) => el)
    .map(([name, el]) => {
      const id = `fisheye-${name}`;
      svg.insertAdjacentHTML('beforeend',
        `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feFlood flood-color="rgb(128,128,128)" result="flat"/>
          <feImage preserveAspectRatio="none" result="lens"/>
          <feMerge result="map"><feMergeNode in="flat"/><feMergeNode in="lens"/></feMerge>
          <feComponentTransfer in="map" result="mapA"><feFuncR type="linear" slope="1"/><feFuncG type="linear" slope="1"/></feComponentTransfer>
          <feComponentTransfer in="map" result="mapB"><feFuncR type="linear" slope="1"/><feFuncG type="linear" slope="1"/></feComponentTransfer>
          <feDisplacementMap in="SourceGraphic" in2="mapA" xChannelSelector="R" yChannelSelector="G" result="bentA"/>
          <feDisplacementMap in="SourceGraphic" in2="mapB" xChannelSelector="R" yChannelSelector="G" result="bentB"/>
          <feComposite in="bentA" in2="bentB" operator="arithmetic" k1="0" k2="0.5" k3="0.5" k4="0"/>
        </filter>`);
      const filter = svg.lastElementChild;
      el.style.setProperty('--fx-filter', `url(#${id})`);
      return {
        el,
        filter,
        image: filter.querySelector('feImage'),
        bends: filter.querySelectorAll('feDisplacementMap'),
        funcs: filter.querySelectorAll('feFuncR, feFuncG'),   // mapA's R and G, then mapB's
        // The console scrolls, so its filter reaches a screen above and below the lens: a fast
        // scroll never outruns it and clips the text. The bar and intro are fixed to the screen.
        reach: el === consoleEl ? 1 : 0,
      };
    });

  let mapFor = '';   // the screen size the map was drawn for
  let queued = false;
  function place() {
    queued = false;
    const w = innerWidth, h = innerHeight;
    if (mapFor !== `${w}x${h}`) {
      mapFor = `${w}x${h}`;
      const href = drawMap(w, h);
      for (const l of lenses) l.image.setAttribute('href', href);
    }
    const scale = scaleFor(w, h);
    // feDisplacementMap moves whole device pixels, so bent lines step. Two bends, offset by SHIFT
    // device pixels each way, put their steps in different places; averaged, each step becomes two
    // half steps. No blur on top: it softened the text more than it smoothed the steps.
    const d = SHIFT / devicePixelRatio / scale;   // SHIFT device px in the map's 0..1 units
    for (const l of lenses) {
      if (!l.el.isConnected) continue;   // the intro removes itself when done
      const r = l.el.getBoundingClientRect();
      for (const bend of l.bends) bend.setAttribute('scale', scale.toFixed(1));
      l.funcs.forEach((f, i) => f.setAttribute('intercept', (i < 2 ? -d : d).toFixed(4)));
      for (const [k, v] of Object.entries({ x: -r.left, y: -r.top, width: w, height: h })) l.image.setAttribute(k, v);
      const reach = l.reach * h;
      for (const [k, v] of Object.entries({ x: -r.left, y: -r.top - reach, width: w, height: h + 2 * reach })) l.filter.setAttribute(k, v);
    }
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(place); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  const resized = new ResizeObserver(queue);
  for (const l of lenses) resized.observe(l.el);
  place();
  root.classList.add('fisheye');

  /* ---------- the screen's outline ----------
     As in SUPERHOT's terminals: a thin glowing line around the picture, set in from the screen's
     edges and bent with it, black outside, a label and a clock set into its top edge. It's drawn
     as a vector line, so it stays smooth however it bends. The command bar sits inside it (see
     the end of css/style.css). */
  const frame = document.createElementNS(NS, 'svg');
  frame.setAttribute('class', 'crt-frame');
  frame.setAttribute('aria-hidden', 'true');
  // Drawn in window pixels (innerWidth x innerHeight, scrollbar included) and sized 100vw x 100vh to
  // match; preserveAspectRatio="none" so it never letterboxes and leaves an edge uncovered.
  frame.setAttribute('preserveAspectRatio', 'none');
  // The labels run along the bent top edge (#crt-top), so they curve with it. A mask cuts the line
  // and its glow behind each one: a soft-ended stroke along the same curve, cut to the label's
  // length, so the line fades out around it (a painted black box, or a hard cut through the glow,
  // shows as a dark rectangle).
  frame.innerHTML =
    `<defs>
      <path id="crt-top"/>
      <filter id="crt-soft"><feGaussianBlur stdDeviation="2.5"/></filter>
      <mask id="crt-gaps" maskUnits="userSpaceOnUse"><rect class="crt-mask-all"/><path class="crt-gap"/><path class="crt-gap"/></mask>
    </defs>
    <path class="crt-outside" fill-rule="evenodd"/>
    <g mask="url(#crt-gaps)"><path class="crt-line"/></g>
    <text class="crt-label"><textPath href="#crt-top">zhangdz.ca</textPath></text>
    <text class="crt-label" text-anchor="end"><textPath href="#crt-top"></textPath></text>`;
  document.body.appendChild(frame);
  const top = frame.querySelector('#crt-top');
  const outside = frame.querySelector('.crt-outside');
  const line = frame.querySelector('.crt-line');
  const gaps = frame.querySelectorAll('.crt-gap');
  const [label, clock] = frame.querySelectorAll('textPath');

  // The line follows the unbent rectangle INSET px in from the screen's edges, bent like the page.
  // Phones have none of it (see phone above), so the page keeps its full width there.
  const inset = (w, h) => (phone.matches ? 0 : Math.round(Math.max(14, Math.min(w, h) * 0.06)));
  const LABEL_IN = 44;   // px from each end of the top edge to its label
  const GAP = 3;         // px of broken line either side of a label, plus the soft round ends
  let frameFor = '';
  let open = 1;          // how far the screen is open, 0..1 (see powerOn and powerOff)
  let closing = false;   // exit is switching the TV off (see powerOff)
  function drawFrame() {
    const w = innerWidth, h = innerHeight;
    root.style.setProperty('--fx-inset', `${inset(w, h)}px`);
    // The bend pushes the middle of the bottom edge this far off screen: without the outline, the
    // command bar lifts its commands by as much (--fx-lift, css/style.css), or they'd be cut off.
    root.style.setProperty('--fx-lift', `${(-shiftAt(0, 1, w, h)[1]).toFixed(1)}px`);
    // Switching off without the outline, the whole screen closes.
    const m = closing && !shows('outline') ? 0 : inset(w, h);
    const key = `${w}x${h}x${open}x${m}x${shows('fisheye')}x${closing}`;
    if (frameFor === key) return;
    frameFor = key;
    if (!m && !closing) return;
    frame.setAttribute('viewBox', `0 0 ${w} ${h}`);
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: w, height: h })) frame.querySelector('.crt-mask-all').setAttribute(k, v);
    const STEPS = 96;   // points per side: enough that the curve reads as smooth
    // Opening, the rectangle grows out from a line across the middle.
    const half = Math.max(0.5, open * (h / 2 - m));
    const corners = [[m, h / 2 - half], [w - m, h / 2 - half], [w - m, h / 2 + half], [m, h / 2 + half]];
    const pts = [];
    corners.forEach(([ax, ay], i) => {
      const [bx, by] = corners[(i + 1) % 4];
      for (let k = 0; k < STEPS; k++) pts.push(drawnAt(ax + (bx - ax) * k / STEPS, ay + (by - ay) * k / STEPS));
    });
    const path = (ps) => `M${ps.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}`;
    const d = `${path(pts)}Z`;
    line.setAttribute('d', d);
    outside.setAttribute('d', `M0 0H${w}V${h}H0Z${d}`);
    top.setAttribute('d', path([...pts.slice(0, STEPS), pts[STEPS]]));
    fitLabels();
  }
  // Each label starts LABEL_IN along the top edge (the clock ends LABEL_IN from its far end).
  function fitLabels() {
    if (!inset(innerWidth, innerHeight) || closing) return;
    let total;
    try { total = top.getTotalLength(); } catch { return; }
    label.setAttribute('startOffset', LABEL_IN);
    clock.setAttribute('startOffset', (total - LABEL_IN).toFixed(1));
    [[label, LABEL_IN], [clock, total - LABEL_IN - clock.getComputedTextLength()]].forEach(([t, start], i) => {
      const len = t.getComputedTextLength();
      gaps[i].setAttribute('d', top.getAttribute('d'));
      // One dash, the label's length, moved along to it (a leading zero-length dash would draw a
      // round dot, cutting the corner).
      gaps[i].setAttribute('stroke-dasharray', `${(len + 2 * GAP).toFixed(1)} ${(2 * total).toFixed(0)}`);
      gaps[i].setAttribute('stroke-dashoffset', (GAP - start).toFixed(1));
    });
  }
  function tick() {
    const now = new Date();
    clock.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    fitLabels();
    setTimeout(tick, (60 - now.getSeconds()) * 1000 + 50);
  }
  addEventListener('resize', drawFrame);

  /* An old TV switching on: the screen opens from a bright line across the middle, out to the
     outline. It stays off through the intro (the intro is its own screen) and plays as the intro
     goes, or on load when there's no intro. */
  function powerOn() {
    if (!frame.classList.contains('is-off')) return;
    frame.classList.remove('is-off');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      open = 1;
      drawFrame();
      return;
    }
    frame.classList.add('is-opening');
    const LINE = 90, GROW = 420;   // ms as a line, then ms opening
    const start = performance.now();
    const step = (now) => {
      const t = Math.max(0, now - start - LINE) / GROW;
      open = t >= 1 ? 1 : 0.004 + 0.996 * (1 - (1 - t) ** 3);   // ease out
      drawFrame();
      if (t < 1) requestAnimationFrame(step);
      else frame.classList.remove('is-opening');
    };
    open = 0.004;
    drawFrame();
    requestAnimationFrame(step);
  }
  /* Switching off, for exit (js/terminal.js) while the outline shows: the reverse, closing to a
     bright line across the middle, which then fades. Resolves once the screen is dark. (It can
     close the whole screen without the outline too, via .is-closing in css/style.css.) */
  const SHUT = 300, OPEN = 420, LINE = 140;   // ms closing, ms opening, ms the line shows alone
  // Animates `open` from one value to another over ms, easing toward the end or the start.
  function animate(from, to, ms, ease) {
    const start = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        open = from + (to - from) * ease(t);
        drawFrame();
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  const easeIn = (t) => t ** 3, easeOut = (t) => 1 - (1 - t) ** 3;
  const LINE_OPEN = 0.004;   // open, as a line across the middle
  async function powerOff() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    closing = true;
    frame.classList.remove('is-off', 'is-opening');
    frame.classList.add('is-closing');
    await animate(1, LINE_OPEN, SHUT, easeIn);
    line.style.transition = `opacity ${LINE}ms`;
    line.style.opacity = '0';
    await new Promise((resolve) => setTimeout(resolve, LINE));
  }
  /* Switching superhot's outline off (js/terminal.js): the TV switches off to a line, apply() turns
     the features off behind it, and it switches back on, the whole screen, onto the plain page. */
  async function powerCycle(apply) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply();
      return;
    }
    closing = true;
    frame.classList.remove('is-off', 'is-opening');
    frame.classList.add('is-closing');
    await animate(1, LINE_OPEN, SHUT, easeIn);
    apply();
    await new Promise((resolve) => setTimeout(resolve, LINE));
    await animate(LINE_OPEN, 1, OPEN, easeOut);
    closing = false;
    frame.classList.remove('is-closing');
    drawFrame();
  }
  window.Fisheye = { powerOff, powerCycle, outlineShown: () => shows('outline') };

  frame.classList.add('is-off');
  const gate = document.getElementById('gate');
  if (gate?.isConnected && !gate.classList.contains('is-leaving')) {
    const watch = new MutationObserver(() => {
      if (!gate.isConnected || gate.classList.contains('is-leaving')) {
        watch.disconnect();
        powerOn();
      }
    });
    watch.observe(gate, { attributes: true, attributeFilter: ['class'] });
    watch.observe(document.body, { childList: true });
  } else {
    powerOn();
  }
  drawFrame();
  tick();
  // The labels take the page font, which may still be loading or change with the font commands.
  document.fonts?.ready.then(fitLabels);
  new MutationObserver(() => requestAnimationFrame(fitLabels)).observe(root, { attributes: true, attributeFilter: ['class'] });

  /* ---------- pointing at the bent picture ----------
     The filter only moves what's drawn: the browser still hit-tests the unbent layout, so a click
     or hover would land on whatever sits there instead of what's under the pointer. source() says
     where each screen point's picture comes from, so each click is sent on to that element, and
     hover is shown on it with .fx-hover (see the end of css/style.css), along with its cursor. */

  let hovered = [];   // the elements marked .fx-hover (see hover below)

  // On only while the bend shows. Kept in sync with the fisheye and outline commands and .no-retro,
  // which the retro command flips.
  let shown = false;   // the screen outline showing (or due to, after the intro)
  const sync = () => {
    const live = shows('fisheye');
    if (root.classList.contains('fx-live') !== live) root.classList.toggle('fx-live', live);
    if (!live) hover(null);
    drawFrame();   // the outline bends, or not, with the page
    // Switching the outline (or retro, with it) on switches the TV on again, unless the intro is up.
    const on = shows('outline');
    if (on && !shown && !closing && !frame.classList.contains('is-off') && !(gate?.isConnected && !gate.classList.contains('is-leaving'))) {
      frame.classList.add('is-off');
      powerOn();
    }
    shown = on;
  };
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['class'] });
  phone.addEventListener('change', sync);
  sync();

  // Bent elements whose clicks and hover are redirected. The intro skips on a click anywhere, and
  // the photo viewer isn't bent, so both keep the browser's own.
  const BENT = '#console, #shortcuts';
  const live = () => root.classList.contains('fx-live');
  function bentTarget(e) {
    if (!live() || !e.target.closest?.(BENT)) return null;
    const [x, y] = source(e.clientX, e.clientY);
    const el = document.elementFromPoint(x, y);
    return el && el.closest(BENT) ? { el, x, y } : null;
  }

  let resending = false;
  addEventListener('click', (e) => {
    if (resending || !e.isTrusted) return;
    const t = bentTarget(e);
    if (!t || t.el === e.target) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (t.el.matches('input, textarea')) t.el.focus();
    const init = { bubbles: true, cancelable: true, view: window, clientX: t.x, clientY: t.y, button: e.button, buttons: e.buttons, detail: e.detail };
    for (const k of ['ctrlKey', 'shiftKey', 'altKey', 'metaKey']) init[k] = e[k];
    resending = true;
    try { t.el.dispatchEvent(new MouseEvent('click', init)); } finally { resending = false; }
  }, true);

  // Hover: .fx-hover on the element under the bent pointer and its ancestors, and its cursor.
  function hover(el) {
    for (const a of hovered) a.classList.remove('fx-hover');
    hovered = [];
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      a.classList.add('fx-hover');
      hovered.push(a);
    }
    root.style.setProperty('--fx-cursor', cursorFor(el));
  }
  function cursorFor(el) {
    if (!el) return 'auto';
    if (el.closest('input, textarea')) return 'text';
    if (el.closest('.thumbs.featured figure')) return 'pointer';
    if (el.closest('.thumb, .thumbs img, .thumbs video')) return 'zoom-in';
    if (el.closest('a, button')) return 'pointer';
    return 'auto';
  }
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = bentTarget(e);
    hover(t ? t.el : null);
  }, { passive: true });
  document.addEventListener('pointerleave', () => hover(null));
})();
