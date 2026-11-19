// A vintage TV's bulging glass, in retro only. Each line or block of the console is scaled about the
// screen's centre by how far it sits from the middle: biggest in the middle, normal size at the top and
// bottom edges. Straight left edges bow outward like a curved tube. CSS transforms, unlike an SVG
// displacement filter, draw text and images at full sharpness.
(() => {
  const K = 0.06;   // extra magnification in the middle of the screen
  const root = document.documentElement;
  const consoleEl = document.getElementById('console');
  if (!consoleEl) return;
  const SEL = 'p, pre, li, h1, h2, h3, figure, .row, .banner, .chrome-art, #prompt, img, video';

  let items = [];   // { el, top, height, left } in page coordinates, measured untransformed
  const on = () => !root.classList.contains('no-retro');

  // The outermost matching elements only, so nothing is transformed twice.
  function collect() {
    return [...consoleEl.querySelectorAll(SEL)].filter((el) => !el.parentElement.closest(SEL));
  }

  function measure() {
    for (const { el } of items) el.style.transform = '';
    items = on() ? collect().map((el) => {
      const r = el.getBoundingClientRect();
      return { el, top: r.top + scrollY, height: r.height, left: r.left };
    }) : [];
    apply();
  }

  function apply() {
    const W = innerWidth, H = innerHeight, cy = H / 2;
    for (const it of items) {
      const c = it.top - scrollY + it.height / 2;            // centre on screen
      if (c < -H || c > 2 * H) { it.el.style.transform = ''; continue; }
      const d = Math.max(-1.3, Math.min(1.3, (c - cy) / cy));
      const m = 1 + K * (1 - d * d);                          // magnification here
      const shift = (c - cy) * (m - 1);                       // push away from the middle
      it.el.style.transformOrigin = `${W / 2 - it.left}px 50%`;
      it.el.style.transform = `translateY(${shift.toFixed(2)}px) scale(${m.toFixed(4)})`;
    }
  }

  // Once per frame at most; each job keeps its own flag so a scroll never swallows a remeasure.
  const later = (fn) => { let queued = 0; return () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; fn(); }); }; };
  const remeasure = later(measure);
  addEventListener('scroll', later(apply), { passive: true });
  addEventListener('resize', remeasure);
  new ResizeObserver(remeasure).observe(consoleEl);
  new MutationObserver(remeasure).observe(consoleEl, { childList: true, subtree: true });
  new MutationObserver(remeasure).observe(root, { attributes: true, attributeFilter: ['class'] });
  measure();
})();
