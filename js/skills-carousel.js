// 3D skills carousel: drag or flick to spin, drifts slowly when idle,
// click (or the button) to pause. Flattens into a list on small screens via CSS.
(() => {
  'use strict';

  const carousel = document.getElementById('skills-carousel');
  const ring = document.getElementById('skills-ring');
  const pauseButton = document.getElementById('skills-pause');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MOBILE_MAX_WIDTH = 650;   // matches the media query in CSS
  const DRAG_SENSITIVITY = 0.35;  // degrees per px dragged
  const FRICTION = 0.92;          // momentum kept per frame after a flick
  const IDLE_SPEED = 0.15;        // degrees per frame
  const CLICK_TOLERANCE = 6;      // px of movement before a press counts as a drag

  let angle = 0;
  let velocity = 0;
  let lastX = 0;
  let dragDistance = 0;
  let dragging = false;
  let paused = false;
  let inView = false;
  let frame = 0;

  const pointerX = (e) => (e.touches ? e.touches[0].pageX : e.pageX);

  function startDrag(e) {
    dragging = true;
    dragDistance = 0;
    velocity = 0;
    lastX = pointerX(e);
  }

  function drag(e) {
    if (!dragging) return;
    const x = pointerX(e);
    const dx = x - lastX;
    lastX = x;
    dragDistance += Math.abs(dx);
    velocity = dx * DRAG_SENSITIVITY;
    angle += velocity;
  }

  function endDrag() {
    dragging = false;
  }

  function setPaused(value) {
    paused = value;
    pauseButton.textContent = paused ? '▶ PLAY' : '❚❚ PAUSE';
    pauseButton.setAttribute('aria-pressed', paused);
  }

  carousel.addEventListener('mousedown', startDrag);
  carousel.addEventListener('touchstart', startDrag, { passive: true });
  addEventListener('mousemove', drag);
  addEventListener('touchmove', drag, { passive: true });
  addEventListener('mouseup', endDrag);
  addEventListener('touchend', endDrag);

  pauseButton.addEventListener('click', () => setPaused(!paused));

  carousel.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (dragDistance > CLICK_TOLERANCE) {
      if (link) e.preventDefault(); // releasing a drag over a link shouldn't follow it
      return;
    }
    if (!link) setPaused(!paused);
  });

  function spin() {
    if (!inView) {
      frame = 0;
      return;
    }
    if (innerWidth > MOBILE_MAX_WIDTH) {
      if (!dragging) {
        if (Math.abs(velocity) > 0.01) {
          angle += velocity;
          velocity *= FRICTION;
        } else if (!paused && !reducedMotion) {
          angle -= IDLE_SPEED;
        }
      }
      ring.style.transform = `rotateY(${angle}deg)`;
    }
    frame = requestAnimationFrame(spin);
  }

  // Only animate while the carousel is on screen.
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView && !frame) frame = requestAnimationFrame(spin);
  }).observe(carousel);
})();
