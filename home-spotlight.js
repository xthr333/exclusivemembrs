(() => {
  const priorSections = new Map([
    ['#songwars','events.html#featured-event'], ['#events','events.html'],
    ['#inside','artists.html'], ['#media','media.html'],
    ['#updates-title','updates.html'], ['#discord','artists.html#discord'],
  ]);
  if (priorSections.has(location.hash)) {
    location.replace(new URL(priorSections.get(location.hash), document.baseURI).href);
    return;
  }
  const track = document.getElementById('spotlight-track');
  const controls = document.getElementById('spotlight-controls');
  if (!track || !controls || typeof track.scrollBy !== 'function') return;
  const step = direction => {
    const card = track.firstElementChild;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    const end = track.scrollWidth - track.clientWidth;
    if (direction > 0 && track.scrollLeft >= end - 2) track.scrollTo({ left: 0, behavior });
    else if (direction < 0 && track.scrollLeft <= 2) track.scrollTo({ left: end, behavior });
    else track.scrollBy({ left: (card.getBoundingClientRect().width + gap) * direction, behavior });
  };
  for (const button of controls.querySelectorAll('button')) {
    button.addEventListener('click', () => step(Number(button.dataset.step)));
  }
  track.addEventListener('keydown', event => {
    if (event.target !== track || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    step(event.key === 'ArrowRight' ? 1 : -1);
  });
  controls.hidden = false;
})();
