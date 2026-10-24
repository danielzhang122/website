// Scroll progress bar along the top, and fade-in of .reveal elements.
(() => {
  'use strict';

  const bar = document.getElementById('scroll-progress');
  const doc = document.documentElement;

  addEventListener('scroll', () => {
    const scrollable = doc.scrollHeight - doc.clientHeight;
    bar.style.width = `${(doc.scrollTop / scrollable) * 100}%`;
  }, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
})();
