// Scroll progress bar along the top, and fade-in of .reveal elements.
(() => {
  'use strict';

  const bar = document.getElementById('scroll-progress');
  const doc = document.documentElement;

  addEventListener('scroll', () => {
    const scrollable = doc.scrollHeight - doc.clientHeight;
    bar.style.transform = `scaleX(${scrollable > 0 ? doc.scrollTop / scrollable : 0})`;
  }, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

  // Autoplaying videos only decode while they're on screen.
  const videoObserver = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) target.play().catch(() => {}); // autoplay can be refused
      else target.pause();
    }
  }, { rootMargin: '200px' });

  document.querySelectorAll('video[autoplay]').forEach((video) => videoObserver.observe(video));
})();
