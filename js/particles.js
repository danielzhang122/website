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
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < mouse.radius) {
        const push = ((mouse.radius - d) / mouse.radius) * 3;
        p.x += (dx / d) * push;
        p.y += (dy / d) * push;
      }

      p.x += p.vx;
      p.y += p.vy;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    for (const p of points) {
      ctx.fillStyle = p.blue ? 'rgba(138, 216, 255, .9)' : 'rgba(224, 25, 63, .85)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.lineWidth = 1;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > LINK_DISTANCE) continue;

        const alpha = (1 - d / LINK_DISTANCE) * 0.55;
        const nearMouse = Math.hypot(a.x - mouse.x, a.y - mouse.y) < mouse.radius;
        if (nearMouse) ctx.strokeStyle = `rgba(210, 238, 255, ${alpha})`;
        else if (a.blue && b.blue) ctx.strokeStyle = `rgba(138, 216, 255, ${alpha})`;
        else ctx.strokeStyle = `rgba(255, 58, 92, ${alpha})`;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
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

  addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  document.addEventListener('mouseleave', () => {
    mouse.x = mouse.y = -1e4;
  });
  addEventListener('resize', init);

  init();
  requestAnimationFrame(loop);
})();
