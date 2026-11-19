// A vintage TV's bulging glass: an SVG displacement filter on #console (see the end of css/style.css).
// The map pushes each pixel toward the screen's middle, magnifying the centre and leaving the corners put.
(() => {
  const K = 0.07;      // bulge strength: the centre is magnified by 1 / (1 - K)
  const N = 512;       // map resolution; the browser smooths it up to screen size
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
      <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" result="bent"/>
      <feConvolveMatrix in="bent" order="3" kernelMatrix="1 2 1 2 8 2 1 2 1" divisor="20" edgeMode="none" preserveAlpha="false"/>
    </filter>`;
  document.body.appendChild(svg);
  const filter = svg.querySelector('filter');
  const lens = svg.querySelector('feImage');

  // The lens covers the viewport, in #console's own coordinates. The filter's region reaches a
  // screen above and below, so a fast scroll never outruns it and clips the text.
  let queued = false;
  function place() {
    queued = false;
    const r = consoleEl.getBoundingClientRect();
    const w = innerWidth, h = innerHeight;
    // feDisplacementMap's scale is the full range of shift: twice the largest shift, in pixels.
    // feDisplacementMap moves whole pixels, so bent lines step; feConvolveMatrix blends each pixel
    // a little with its neighbours, smoothing the steps (like a CRT's soft phosphor). Chrome's
    // Gaussian blur can't go this light: below 0.8 it does nothing, at 0.8 it's already soft.
    svg.querySelector('feDisplacementMap').setAttribute('scale', (K * Math.max(w, h) / 2).toFixed(1));
    for (const [k, v] of Object.entries({ x: -r.left, y: -r.top, width: w, height: h })) lens.setAttribute(k, v);
    for (const [k, v] of Object.entries({ x: -r.left, y: -r.top - h, width: w, height: 3 * h })) filter.setAttribute(k, v);
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(place); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  new ResizeObserver(queue).observe(consoleEl);
  place();
  document.documentElement.classList.add('fisheye');
})();
