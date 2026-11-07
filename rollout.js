/* Small progressive enhancements. No checkout, private records or credentials. */
(() => {
  document.querySelectorAll('img').forEach(img => {
    const fallback = () => {
      if (img.dataset.fallbackApplied) return;
      img.dataset.fallbackApplied = 'true';
      const message = document.createElement('span');
      message.className = 'product-unavailable';
      message.textContent = img.alt ? `${img.alt} — image unavailable. View the official store for product photos.` : 'Image unavailable.';
      img.replaceWith(message);
    };
    img.addEventListener('error', fallback, {once:true});
    if (img.complete && !img.naturalWidth) fallback();
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
      try {
        const response = await fetch(form.action, {method:'POST', body:new FormData(form), headers:{Accept:'application/json'}, signal:AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error('Submission not accepted');
        status.textContent = 'Your message was sent. Thank you for reaching out to EXM.';
        form.reset();
      } catch {
        status.textContent = 'We couldn’t confirm delivery. Your message is still here—please try again or message @exclusivemembrs on Instagram.';
      } finally {button.disabled = false; button.textContent = label;}
    });
  });
})();
