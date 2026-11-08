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

  // First home visit: percentage reflects actual critical image/font promises.
  // No fabricated identity checks, sound, minimum waiting time, or loading trap.
  let seen = false;
  try { seen = sessionStorage.getItem('exmWelcomeSeen') === '1'; } catch {}
  if (document.body.classList.contains('rollout-home') && !seen && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const entry = document.createElement('div');
    entry.className = 'entry-panel';
    entry.setAttribute('role','dialog');
    entry.setAttribute('aria-modal','true');
    entry.setAttribute('aria-label','Welcome to EXM');
    entry.innerHTML = '<div class="entry-shell"><img src="assets/brand/exm-logo.webp" alt="ExclusiveMembrs" width="220" height="88"><p class="entry-title">WELCOME TO EXM ✦</p><div class="entry-meter"><strong>0%</strong><span>LOADING THE LOOK</span></div><div class="entry-track" aria-hidden="true"><span></span></div><button type="button">Enter now ↗</button></div>';
    document.body.append(entry);
    const content = document.querySelector('main');
    const nav = document.querySelector('.navbar');
    const footer = document.querySelector('footer');
    const regions = [content,nav,footer].filter(Boolean);
    regions.forEach(el=>el.inert=true);
    const button = entry.querySelector('button');
    const previousFocus = document.activeElement;
    button.focus({preventScroll:true});
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      regions.forEach(el=>el.inert=false);
      entry.remove();
      try {sessionStorage.setItem('exmWelcomeSeen','1');} catch {}
      if (previousFocus && previousFocus !== document.body) previousFocus.focus({preventScroll:true});
    };
    button.addEventListener('click',close);
    entry.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){e.preventDefault();button.focus();}});
    const imageReady = img => new Promise(resolve=>{
      if(img.complete)return resolve();
      img.addEventListener('load',resolve,{once:true});
      img.addEventListener('error',resolve,{once:true});
    });
    const critical = [...document.querySelectorAll('.nav-mark,.welcome-logo')].map(imageReady);
    if(document.fonts)critical.push(document.fonts.ready);
    let complete=0;
    critical.forEach(task=>Promise.resolve(task).finally(()=>{
      if(closed)return;
      const percent=Math.round(++complete / critical.length * 100);
      entry.querySelector('strong').textContent=`${percent}%`;
      entry.querySelector('.entry-track span').style.width=`${percent}%`;
    }));
    Promise.allSettled(critical).then(()=>{
      if(closed)return;
      entry.querySelector('.entry-meter span').textContent='IT’S EXCLUSIVE.';
      setTimeout(close,180);
    });
    setTimeout(close,2200); // A failed CDN must never block the site.
  }

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
