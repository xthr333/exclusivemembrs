/* Small progressive enhancements. No checkout, private records or credentials. */
(() => {
  // Reading progress is decorative, not a claim about registration or sales.
  const reading = document.createElement('div');
  reading.className = 'reading-status';
  reading.setAttribute('aria-hidden','true');
  reading.append(document.createElement('span'));
  document.body.append(reading);
  let scheduled = false;
  const updateReading = () => {
    const total = document.documentElement.scrollHeight - innerHeight;
    reading.firstChild.style.width = `${total > 0 ? Math.min(100,Math.max(0,scrollY / total * 100)) : 100}%`;
    scheduled = false;
  };
  const queueReading = () => { if (!scheduled) {scheduled = true;requestAnimationFrame(updateReading);} };
  addEventListener('scroll',queueReading,{passive:true});
  addEventListener('resize',queueReading);
  updateReading();

  document.querySelectorAll('img').forEach(img => {
    const fallback = () => {
      if (img.dataset.fallbackApplied) return;
      img.dataset.fallbackApplied = 'true';
      const message = document.createElement('span');
      message.className = 'product-unavailable';
      message.textContent = img.alt ? `${img.alt} — image unavailable. ${img.closest('.product-gallery,.selected-product,.rotation-item') ? 'View the official store for product photos.' : 'Please reload or follow the page’s portfolio link.'}` : 'Image unavailable. Please reload.';
      img.replaceWith(message);
    };
    img.addEventListener('error', fallback, {once:true});
    if (img.complete && !img.naturalWidth) fallback();
  });

  document.querySelectorAll('.product-gallery').forEach(gallery => {
    gallery.addEventListener('click', event => {
      const button = event.target.closest('button[data-photo]');
      if (!button) return;
      const image = gallery.querySelector('.gallery-main img');
      const link = gallery.querySelector('.gallery-main');
      image.src = button.dataset.photo;
      image.alt = `${gallery.dataset.galleryTitle} — ${button.dataset.view} product mockup`;
      link.href = button.dataset.photo;
      gallery.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      gallery.querySelector('.gallery-caption').textContent = `${button.dataset.index} / ${gallery.querySelectorAll('button').length} · ${button.dataset.view} · Product mockup`;
    });
  });

  const filters = document.querySelector('.shop-filters');
  if (filters) filters.addEventListener('click', event => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    filters.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    document.querySelectorAll('.shop-category').forEach(section => {
      section.hidden = button.dataset.filter !== 'all' && button.dataset.filter !== section.dataset.category;
    });
    const status = document.getElementById('filter-status');
    if (status) status.textContent = `Showing ${button.textContent.toLowerCase()}.`;
  });

  // Keep Formspree's original endpoint and no-JS submission path. Never report
  // success until its server accepts the message; failures preserve the fields.
  document.querySelectorAll('form[action^="https://formspree.io/"]').forEach(form => {
    const status = document.createElement('p');
    status.className = 'form-status';
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    form.append(status);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const button = form.querySelector('[type="submit"]');
      if (button.disabled) return;
      const label = button.textContent;
      button.disabled = true;
      button.textContent = 'SENDING…';
      status.textContent = 'Sending your message…';
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(),15000) : null;
      try {
        const response = await fetch(form.action, {method:'POST', body:new FormData(form), headers:{Accept:'application/json'}, ...(controller ? {signal:controller.signal} : {})});
        if (!response.ok) throw new Error('Submission not accepted');
        status.textContent = 'Your message was sent. Thank you for reaching out to EXM.';
        form.reset();
      } catch {
        status.textContent = 'We couldn’t confirm delivery. Your message is still here—please try again or message @exclusivemembrs on Instagram.';
      } finally {if(timer !== null) clearTimeout(timer); button.disabled = false; button.textContent = label;}
    });
  });
})();
