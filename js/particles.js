// Background particle network. Points drift, link up when close,
// and get pushed away from the cursor.
(() => {
  'use strict';

  const canvas = document.getElementById('particles');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.remove();
    return;
  }

  const ctx = canvas.getContext('2d');
  const LINK_DISTANCE = 130;      // px; closer points get connected
  const MAX_POINTS = 160;
  const AREA_PER_POINT = 9000;    // px² of screen per point
  const BLUE_SHARE = 0.22;        // fraction of points drawn blue instead of red
  const mouse = { x: -1e4, y: -1e4, radius: 180 };

  let width = 0;
  let height = 0;
  let points = [];

  function init() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.min(MAX_POINTS, Math.floor((width * height) / AREA_PER_POINT));
    points = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.random() * 0.4 - 0.2,
      vy: Math.random() * 0.4 - 0.2,
      size: 1 + Math.random() * 2,
      blue: Math.random() < BLUE_SHARE,
    }));
  }

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function step(now) {
    for (const p of points) {
      if (p.glide) {
        // Flying in from where the intro left it; joins the normal drift on arrival.
        const { fromX, fromY, toX, toY, start, duration } = p.glide;
        const t = (now - start) / duration;
        if (t < 1) {
          const e = easeOutCubic(Math.max(0, t));
          p.x = fromX + (toX - fromX) * e;
          p.y = fromY + (toY - fromY) * e;
          continue;
        }
        p.x = toX;
        p.y = toY;
        delete p.glide;
      }

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > 0 && distSq < MOUSE_RADIUS_SQ) {
        const d = Math.sqrt(distSq);
        const push = ((mouse.radius - d) / mouse.radius) * 3;
        p.x += (dx / d) * push;
        p.y += (dy / d) * push;
      }

      p.x += p.vx;
      p.y += p.vy;
    }
  }

  // Links are grouped by color and (quantized) opacity so each group is one
  // stroke() call instead of one per link. 16 opacity steps is visually seamless.
  const LINK_MAX_ALPHA = 0.55;
  const ALPHA_STEPS = 16;
  const LINK_COLORS = ['255, 58, 92', '138, 216, 255', '210, 238, 255']; // red, blue, near cursor
  const LINK_STYLES = LINK_COLORS.map((rgb) =>
    Array.from({ length: ALPHA_STEPS + 1 }, (_, i) => `rgba(${rgb}, ${((i / ALPHA_STEPS) * LINK_MAX_ALPHA).toFixed(3)})`));
  const linkBuckets = LINK_COLORS.map(() => Array.from({ length: ALPHA_STEPS + 1 }, () => []));
  const LINK_DISTANCE_SQ = LINK_DISTANCE * LINK_DISTANCE;
  const MOUSE_RADIUS_SQ = mouse.radius * mouse.radius;

  function drawPoints(blue, style) {
    ctx.fillStyle = style;
    ctx.beginPath();
    for (const p of points) {
      if (p.blue !== blue) continue;
      ctx.moveTo(p.x + p.size, p.y);
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    drawPoints(false, 'rgba(224, 25, 63, .85)');
    drawPoints(true, 'rgba(138, 216, 255, .9)');

    for (const p of points) {
      const mx = p.x - mouse.x;
      const my = p.y - mouse.y;
      p.nearMouse = mx * mx + my * my < MOUSE_RADIUS_SQ;
    }

    for (const color of linkBuckets) for (const bucket of color) bucket.length = 0;

    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      for (let j = i + 1; j < points.length; j++) {
        const b = points[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > LINK_DISTANCE_SQ) continue;

        const step = Math.round((1 - Math.sqrt(distSq) / LINK_DISTANCE) * ALPHA_STEPS);
        if (step === 0) continue;
        const color = a.nearMouse ? 2 : a.blue && b.blue ? 1 : 0;
        linkBuckets[color][step].push(a.x, a.y, b.x, b.y);
      }
    }

    ctx.lineWidth = 1;
    linkBuckets.forEach((color, c) => {
      color.forEach((lines, step) => {
        if (!lines.length) return;
        ctx.strokeStyle = LINK_STYLES[c][step];
        ctx.beginPath();
        for (let k = 0; k < lines.length; k += 4) {
          ctx.moveTo(lines[k], lines[k + 1]);
          ctx.lineTo(lines[k + 2], lines[k + 3]);
        }
        ctx.stroke();
      });
    });
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!document.body.classList.contains('is-ready')) return; // stay idle behind the intro
    step(now);
    draw();
  }

  // The intro hands its grains over as starting points, so its name
  // visibly breaks apart into this network (see release() in js/intro.js).
  window.particleNetwork = {
    get count() {
      return points.length;
    },
    adopt(starts, duration) {
      const start = performance.now();
      starts.slice(0, points.length).forEach((s, i) => {
        const p = points[i];
        p.blue = s.blue;
        p.glide = { fromX: s.x, fromY: s.y, toX: p.x, toY: p.y, start, duration };
        p.x = s.x;
        p.y = s.y;
      });
    },
  };

  // The canvas is fixed to the viewport, so client coordinates map directly.
  addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }, { passive: true });
  document.addEventListener('mouseleave', () => {
    mouse.x = mouse.y = -1e4;
  });
  addEventListener('resize', init);

  init();
  requestAnimationFrame(loop);
})();
