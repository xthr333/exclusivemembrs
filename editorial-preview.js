(() => {
  // The static campaign remains the fallback and the only source on the live site.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  const states = {
    scheduled: 'Upcoming test event', registration_open: 'Test registration open',
    live: 'Test event live', completed: 'Test event recap',
  };
  const profileSlugs = /^(?:mayo|bitchyounotayop|vantiva)$/;
  const eventIds = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function featureEvent(campaign) {
    if (!campaign || !eventIds.test(campaign.id) || !Object.hasOwn(states, campaign.status)) return;
    const lead = document.querySelector('.welcome-copy .btn');
    const poster = document.querySelector('#songwars .event-visual');
    const copy = document.querySelector('#songwars .event-copy');
    const url = 'events.html#event-' + campaign.id;
    const original = document.createElement('a');
    original.className = 'text-link';
    original.href = lead.getAttribute('href');
    original.textContent = 'SongWars IV interest form';
    copy.querySelector('.buttons').append(original);
    lead.href = url;
    lead.textContent = 'Explore featured event';
    poster.href = url;
    poster.setAttribute('aria-label', 'Details for ' + campaign.name);
    poster.classList.add('preview-event-poster');
    poster.querySelector('.event-roman').textContent = 'EXM';
    poster.querySelector('.event-wordmark').textContent = campaign.name;
    poster.querySelector('.event-badge').textContent = 'Local preview';
    poster.querySelector('.event-floor').textContent = states[campaign.status];
    copy.querySelector('.kicker').textContent = states[campaign.status];
    copy.querySelector('h2').textContent = campaign.name;
    copy.querySelector('p:not(.kicker)').textContent = campaign.description;
    copy.querySelector('.btn').href = url;
  }

  function featureCreator(creator) {
    if (!creator || !profileSlugs.test(creator.slug)) return;
    const spotlight = document.querySelector('#inside .platform-card');
    spotlight.querySelector('.kicker').textContent = 'Preview creator spotlight';
    spotlight.querySelector('h3').textContent = creator.name;
    spotlight.querySelector('p:not(.kicker)').textContent = creator.description || 'Explore this creator’s public EXM profile.';
    const link = spotlight.querySelector('a');
    link.href = creator.slug + '.html';
    link.textContent = 'View ' + creator.name + '’s profile';
  }

  fetch('/api/platform/featured_content', { signal: AbortSignal.timeout(4000) })
    .then(response => response.ok ? response.json() : null)
    .then(content => {
      if (!content) return;
      featureEvent(content.campaign);
      featureCreator(content.creator);
    }).catch(() => {});
})();
