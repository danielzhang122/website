// Full-screen viewer for any <img>/<video> marked with data-lightbox.
// Arrow buttons and ← / → cycle through the media in the same [data-gallery].
(() => {
  'use strict';

  const box = document.getElementById('lightbox');
  const image = box.querySelector('img');
  const video = box.querySelector('video');
  const caption = box.querySelector('.lightbox-caption');
  const counter = box.querySelector('.lightbox-count');
  const prevButton = box.querySelector('.lightbox-prev');
  const nextButton = box.querySelector('.lightbox-next');

  let group = [];
  let index = 0;
  let opener = null;

  // Thumbnails are keyboard-reachable buttons. Set on the #content originals,
  // so the copies js/terminal.js prints inherit it.
  for (const media of document.querySelectorAll('[data-lightbox]')) {
    media.tabIndex = 0;
    media.setAttribute('role', 'button');
  }
  box.tabIndex = -1;

  const isOpen = () => box.classList.contains('is-open');
  const titleOf = (media) => media.dataset.title || (media.tagName === 'VIDEO' ? media.getAttribute('aria-label') : media.alt);

  function show(i) {
    index = (i + group.length) % group.length;
    const media = group[index];
    const isVideo = media.tagName === 'VIDEO';
    const src = media.currentSrc || media.getAttribute('src');
    const title = titleOf(media);

    image.hidden = isVideo;
    video.hidden = !isVideo;
    if (isVideo) {
      image.removeAttribute('src');
      video.src = src;
      video.setAttribute('aria-label', title);
      video.play().catch(() => {}); // autoplay can be refused; the video just stays paused
    } else {
      video.pause();
      video.removeAttribute('src');
      image.src = src;
      image.alt = media.alt || title;
    }

    const heading = document.createElement('strong');
    heading.textContent = title;
    const description = media.dataset.caption;
    caption.replaceChildren(heading, description ? Object.assign(document.createElement('span'), { textContent: description }) : '');
    if (media.dataset.repo) {
      caption.append(Object.assign(document.createElement('a'), {
        href: media.dataset.repo, target: '_blank', rel: 'noopener noreferrer', textContent: 'Repo',
      }));
    }

    const multiple = group.length > 1;
    counter.textContent = multiple ? `${index + 1} / ${group.length}` : '';
    prevButton.hidden = nextButton.hidden = !multiple;
  }

  function open(media) {
    const gallery = media.closest('[data-gallery]');
    group = gallery ? [...gallery.querySelectorAll('[data-lightbox]')] : [media];
    show(group.indexOf(media));
    box.classList.add('is-open');
    opener = document.activeElement;
    box.focus();
  }

  function close() {
    box.classList.remove('is-open');
    video.pause();
    opener?.focus();
  }

  // The clickable area is the media itself or the figure wrapping it,
  // so clicks on overlaid captions still open the viewer.
  function mediaFor(target) {
    const host = target.closest('[data-lightbox], figure');
    if (!host) return null;
    return host.matches('[data-lightbox]') ? host : host.querySelector('[data-lightbox]');
  }

  prevButton.addEventListener('click', () => show(index - 1));
  nextButton.addEventListener('click', () => show(index + 1));

  document.addEventListener('click', (e) => {
    if (e.target.closest('.lightbox-nav, .lightbox-caption a')) return;
    if (isOpen()) {
      close();
      return;
    }
    const media = mediaFor(e.target);
    if (media) open(media);
  });

  addEventListener('keydown', (e) => {
    if (isOpen()) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') show(index + 1);
      else if (e.key === 'ArrowLeft') show(index - 1);
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement) {
      const media = mediaFor(document.activeElement);
      if (!media) return;
      e.preventDefault(); // Space would otherwise scroll the page
      open(media);
    }
  });
})();
