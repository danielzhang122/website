// A vintage TV's bulging glass: an SVG displacement filter on #console (see the end of css/style.css).
// The map pushes each pixel toward the screen's middle, magnifying the centre and leaving the corners put.
(() => {
  const K = 0.065;     // bulge strength: the centre is magnified by 1 / (1 - K)
  const SHIFT = 0.3;   // device px each way for the two averaged bends that halve the steps (see place)
  const N = 512;       // map resolution; the browser smooths it up to screen size
  const root = document.documentElement;
  const consoleEl = document.getElementById('console');
  if (!consoleEl || !CSS.supports('filter', 'url(#a)')) return;

  // Displacement in half-screens: d = -K * p * (1 - r^2 / 2); its largest value is K / 2.
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1;
      const f = -K * (1 - (x * x + y * y) / 2);
      const o = (j * N + i) * 4;
      // Channel value 0..255 maps to -1..1 of the maximum shift (K / 2).
      img.data[o] = Math.round(128 + 127 * (x * f) / (K / 2));
      img.data[o + 1] = Math.round(128 + 127 * (y * f) / (K / 2));
      img.data[o + 2] = 128;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0';
  svg.innerHTML =
    `<filter id="fisheye" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-color="rgb(128,128,128)" result="flat"/>
      <feImage href="${c.toDataURL()}" preserveAspectRatio="none" result="lens"/>
      <feMerge result="map"><feMergeNode in="flat"/><feMergeNode in="lens"/></feMerge>
      <feComponentTransfer in="map" result="mapA"><feFuncR type="linear" slope="1"/><feFuncG type="linear" slope="1"/></feComponentTransfer>
      <feComponentTransfer in="map" result="mapB"><feFuncR type="linear" slope="1"/><feFuncG type="linear" slope="1"/></feComponentTransfer>
      <feDisplacementMap in="SourceGraphic" in2="mapA" xChannelSelector="R" yChannelSelector="G" result="bentA"/>
      <feDisplacementMap in="SourceGraphic" in2="mapB" xChannelSelector="R" yChannelSelector="G" result="bentB"/>
      <feComposite in="bentA" in2="bentB" operator="arithmetic" k1="0" k2="0.5" k3="0.5" k4="0"/>
    </filter>`;
  document.body.appendChild(svg);
  const filter = svg.querySelector('filter');
  const lens = svg.querySelector('feImage');
  const bends = svg.querySelectorAll('feDisplacementMap');
  const funcs = svg.querySelectorAll('feFuncR, feFuncG');   // mapA's R and G, then mapB's

  // The lens covers the viewport, in #console's own coordinates. The filter's region reaches a
  // screen above and below, so a fast scroll never outruns it and clips the text.
  let queued = false;
  function place() {
    queued = false;
    const r = consoleEl.getBoundingClientRect();
    const w = innerWidth, h = innerHeight;
    // feDisplacementMap's scale is the full range of shift: twice the largest shift, in pixels.
    const scale = K * Math.max(w, h) / 2;
    for (const bend of bends) bend.setAttribute('scale', scale.toFixed(1));
    // feDisplacementMap moves whole device pixels, so bent lines step. Two bends, offset by SHIFT
    // device pixels each way, put their steps in different places; averaged, each step becomes two
    // half steps. No blur on top: it softened the text more than it smoothed the steps.
    const d = SHIFT / devicePixelRatio / scale;   // SHIFT device px in the map's 0..1 units
    funcs.forEach((f, i) => f.setAttribute('intercept', (i < 2 ? -d : d).toFixed(4)));
    for (const [k, v] of Object.entries({ x: -r.left, y: -r.top, width: w, height: h })) lens.setAttribute(k, v);
    for (const [k, v] of Object.entries({ x: -r.left, y: -r.top - h, width: w, height: 3 * h })) filter.setAttribute(k, v);
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(place); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  new ResizeObserver(queue).observe(consoleEl);
  place();
  root.classList.add('fisheye');

  /* ---------- pointing at the bent picture ----------
     The filter only moves what's drawn: the browser still hit-tests the unbent layout, so a click
     or hover would land on whatever sits there instead of what's under the pointer. The map says
     where each screen pixel's picture comes from, so each click is sent on to that element, and
     hover is shown on it with .fx-hover (see the end of css/style.css), along with its cursor. */

  // Where the picture at a screen point comes from: the same sum feDisplacementMap does.
  // Its shift is scale * (C / 255 - 0.5), with scale = K * M / 2 and C from the map above.
  function source(cx, cy) {
    const w = innerWidth, h = innerHeight, M = Math.max(w, h);
    const x = cx / w * 2 - 1, y = cy / h * 2 - 1;
    const f = -K * (1 - (x * x + y * y) / 2);
    const shift = (v) => (K * M / 2) * ((128 + 127 * (v * f) / (K / 2)) / 255 - 0.5);
    return [cx + shift(x), cy + shift(y)];
  }

  // On only while the bend shows (retro). Kept in sync with .no-retro, which the retro command flips.
  const sync = () => {
    const live = !root.classList.contains('no-retro');
    if (root.classList.contains('fx-live') !== live) root.classList.toggle('fx-live', live);
    if (!live) hover(null);
  };
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['class'] });
  sync();

  // Elements drawn over the console (the command bar, the photo viewer, the intro) aren't bent.
  const OVER = '#shortcuts, #lightbox, #gate';
  const live = () => root.classList.contains('fx-live');
  function bentTarget(e) {
    if (!live() || e.target.closest?.(OVER)) return null;
    const [x, y] = source(e.clientX, e.clientY);
    const el = document.elementFromPoint(x, y);
    return el && !el.closest(OVER) ? { el, x, y } : null;
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
  let hovered = [];
  function hover(el) {
    for (const a of hovered) a.classList.remove('fx-hover');
    hovered = [];
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      a.classList.add('fx-hover');
      hovered.push(a);
    }
    consoleEl.style.setProperty('--fx-cursor', cursorFor(el));
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
    hover(t && consoleEl.contains(t.el) ? t.el : null);
  }, { passive: true });
  document.addEventListener('pointerleave', () => hover(null));
})();
