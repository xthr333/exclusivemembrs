(() => {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  const slugs = /^(?:mayo|bitchyounotayop|vantiva)$/;
  const eventIds = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function el(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function featureEvent(campaign) {
    const calendar = document.getElementById('event-calendar-heading');
    if (!calendar || !campaign || !eventIds.test(campaign.id)) return;
    const card = el('aside');
    card.className = 'section platform-section';
    card.id = 'preview-featured-event';
    const link = el('a', 'Open featured event');
    link.href = '#event-' + campaign.id;
    card.append(el('p', 'Featured in this preview'), el('h2', campaign.name),
      el('p', campaign.description), link);
    calendar.closest('section').before(card);
  }

  function featureCreator(creator) {
    const spotlight = document.getElementById('spotlight-track');
    if (!spotlight || !creator || !slugs.test(creator.slug)) return;
    const card = el('li');
    card.className = 'platform-card';
    card.id = 'preview-featured-creator';
    const link = el('a', creator.name);
    link.href = creator.slug + '.html';
    const title = el('h3');
    title.append(link);
    card.append(title, el('p', creator.description || 'Preview creator spotlight'));
    spotlight.prepend(card);
  }

  fetch('/api/platform/featured_content', { signal: AbortSignal.timeout(4000) })
    .then(response => response.ok ? response.json() : null)
    .then(content => {
      if (!content) return;
      featureEvent(content.campaign);
      featureCreator(content.creator);
    }).catch(() => {});
})();
