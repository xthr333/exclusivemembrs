/* Artist links and bracket navigation work without scripts; these only enhance them. */
(() => {
  const status = document.querySelector('.share-status');
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const copy = async () => {
    try {
      if (!navigator.clipboard || !canonical) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(canonical);
      status.textContent = 'Link copied. Send it to your people. ✦';
    } catch {
      status.textContent = `Copy this link: ${canonical || location.href}`;
    }
  };
  document.querySelector('[data-copy-profile]')?.addEventListener('click',copy);
  document.querySelector('[data-share-profile]')?.addEventListener('click',async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({title:document.title,url:canonical || location.href});
      status.textContent = 'Shared. ✦';
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'Could not open sharing. Try Copy link instead.';
    }
  });
  document.querySelectorAll('.round-nav a').forEach(link => link.addEventListener('click',event => {
    const round = document.querySelector(link.hash);
    const scroller = document.querySelector('.bracket-scroll');
    if (!round || !scroller) return;
    event.preventDefault();
    const left = round.offsetLeft - scroller.querySelector('.bracket-column').offsetLeft;
    try {
      scroller.scrollTo({left,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    } catch {scroller.scrollLeft = left;}
    try {scroller.focus({preventScroll:true});} catch {scroller.focus();}
    history.replaceState(null,'',link.hash);
  }));
})();
