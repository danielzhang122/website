// Hanging neon sign in the left margin, simulated as a damped pendulum.
// Brushing past it with the cursor swings it; clicking near it gives it a kick.
(() => {
  'use strict';

  const container = document.getElementById('neon-sign');
  const sign = container.querySelector('.neon-sign-text');
  const wires = [...container.querySelectorAll('line')]; // [glow, core, glow, core]: left pair, right pair
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SIGN_TOP = 230;           // px from page top; matches .neon-sign-text in CSS
  const WIRE_SPREAD = 0.27;       // wires attach at ±27% of the sign's width from its center
  const STIFFNESS = 5;            // pull back toward hanging straight down
  const DAMPING = 0.38;
  const SWAY = 0.04;              // strength of the idle breeze
  const MAX_ANGLE = 0.6;          // rad; the sign bounces off this limit
  const MAX_SPEED = 6;            // rad/s
  const BRUSH_RANGE = 70;         // px around the sign where the cursor affects it
  const KICK_RANGE = 180;         // px from the sign's center where a click kicks it

  const clampAbs = (value, max) => Math.max(-max, Math.min(max, value));

  let angle = reducedMotion ? 0 : 0.05;
  let velocity = 0;
  let centerX = 0;
  let width = 0;
  let height = 0;
  let visible = false;
  let lastMouseX = null;

  function draw() {
    const offset = width * WIRE_SPREAD;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    wires.forEach((line, i) => {
      const d = i < 2 ? -offset : offset;
      line.setAttribute('x2', centerX + d * cos);
      line.setAttribute('y2', SIGN_TOP + d * sin);
    });
    sign.style.transform = `translateX(-50%) rotate(${angle}rad)`;
  }

  function layout() {
    visible = getComputedStyle(container).display !== 'none';
    if (!visible) return;

    // Center the sign in the empty margin left of the content column.
    centerX = Math.max(60, (innerWidth - 1080) / 4);
    sign.style.left = `${centerX}px`;
    width = sign.offsetWidth;
    height = sign.offsetHeight;

    wires.forEach((line, i) => {
      line.setAttribute('x1', centerX + (i < 2 ? -1 : 1) * width * WIRE_SPREAD);
      line.setAttribute('y1', 0);
    });
    draw();
  }

  layout();
  addEventListener('resize', layout);
  document.fonts?.ready.then(layout); // the sign's size depends on the web font

  if (reducedMotion) return;

  addEventListener('mousemove', (e) => {
    const dx = lastMouseX === null ? 0 : clampAbs(e.pageX - lastMouseX, 80);
    lastMouseX = e.pageX;
    if (!dx || !visible) return;

    // Distance from the cursor to the sign's bounding box.
    const gapX = Math.max(Math.abs(e.pageX - centerX) - width / 2, 0);
    const gapY = Math.max(SIGN_TOP - e.pageY, e.pageY - SIGN_TOP - height, 0);
    const proximity = Math.max(0, 1 - Math.hypot(gapX, gapY) / BRUSH_RANGE);
    if (!proximity) return;

    // Pushing low on the sign has more leverage than pushing near the hinge.
    const leverage = Math.max(0.15, Math.min(1, (e.pageY - SIGN_TOP) / height));
    velocity = clampAbs(velocity - dx * proximity * proximity * 0.03 * leverage, MAX_SPEED);
  });

  addEventListener('mousedown', (e) => {
    if (!visible) return;
    const dx = centerX - e.pageX;
    const distance = Math.hypot(dx, SIGN_TOP + height / 2 - e.pageY);
    if (distance < KICK_RANGE) {
      velocity = clampAbs(velocity - Math.sign(dx || 1) * (1 - distance / KICK_RANGE) * 4, MAX_SPEED);
    }
  });

  let previous = performance.now();

  function tick(now) {
    const dt = Math.min((now - previous) / 1000, 0.05) || 0.016;
    previous = now;

    const onScreen = SIGN_TOP + height > scrollY - 60 && SIGN_TOP < scrollY + innerHeight + 60;
    if (visible && onScreen) {
      const breeze = STIFFNESS * SWAY * Math.sin((now / 1000) * 0.9);
      velocity += (-STIFFNESS * Math.sin(angle) - DAMPING * velocity + breeze) * dt;
      angle += velocity * dt;
      if (Math.abs(angle) > MAX_ANGLE) {
        angle = Math.sign(angle) * MAX_ANGLE;
        velocity *= -0.35;
      }
      draw();
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
