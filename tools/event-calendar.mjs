const views = [
  { id: 'upcoming', title: 'Upcoming', empty: 'There are no upcoming events on the calendar.', actions: ['interest', 'registration', 'rsvp', 'tickets'] },
  { id: 'live', title: 'Live', empty: 'Nothing is live right now.', actions: ['stream', 'rsvp', 'tickets'] },
  { id: 'past', title: 'Past', empty: 'Event recaps will appear here.', actions: ['replay', 'recap'] },
];
const labels = new Map(Object.entries({
  interest: 'Express interest', registration: 'Register', rsvp: 'RSVP', tickets: 'Tickets',
  stream: 'Watch live', replay: 'Watch replay', recap: 'Read recap',
}));
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = value => value.replace(/[&<>"']/g, character => entities[character]);

function safeLink(value) {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  if (value.startsWith('#')) return idPattern.test(value.slice(1));
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

function validate(events) {
  if (!Array.isArray(events)) throw new Error('The EXM event calendar must be a list.');
  const ids = new Set();
  const statuses = new Set(['draft', ...views.map(view => view.id)]);
  for (const event of events) {
    if (!event || typeof event.id !== 'string' || !idPattern.test(event.id) || ids.has(event.id) ||
        ![event.title, event.summary].every(text => typeof text === 'string' && text.trim()) ||
        !statuses.has(event.status)) {
      throw new Error('Each event needs a unique ID, title, summary and valid status.');
    }
    ids.add(event.id);
    if (event.date !== undefined) {
      const timestamp = Date.parse(event.date);
      if (typeof event.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) ||
          !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== event.date) {
        throw new Error(event.id + ': use a real calendar date in YYYY-MM-DD format.');
      }
    }
    if (!event.links || typeof event.links !== 'object' || Array.isArray(event.links) ||
        !Object.entries(event.links).every(([kind, url]) => labels.has(kind) && safeLink(url))) {
      throw new Error(event.id + ': use supported actions with public HTTPS links or page anchors.');
    }
  }
}

function card(event, actions) {
  const links = actions.filter(kind => Object.hasOwn(event.links, kind)).map(kind =>
    '<li><a class="text-link" href="' + escape(event.links[kind]) + '">' +
    (kind === 'interest' && event.links[kind].startsWith('#') ? 'Interest details' : labels.get(kind)) + '</a></li>');
  const time = event.date ? '<p><time datetime="' + event.date + '">' + dateFormat.format(new Date(event.date)) + '</time></p>' : '';
  return '<article class="card" id="calendar-event-' + event.id + '">\n' +
    '<h4>' + escape(event.title) + '</h4>\n' + time + '\n<p>' + escape(event.summary) + '</p>\n' +
    (links.length ? '<ul class="calendar-links">' + links.join('') + '</ul>\n' : '') + '</article>';
}

export function renderEventCalendar(events) {
  validate(events);
  const nav = views.map(view => '<a class="text-link" href="#calendar-' + view.id + '">' + view.title + '</a>');
  const sections = views.map(view => {
    const entries = events.filter(event => event.status === view.id);
    const content = entries.length ? '<div class="rules-grid">\n' + entries.map(event => card(event, view.actions)).join('\n') + '\n</div>' :
      '<p class="section-copy">' + view.empty + '</p>';
    return '<section class="calendar-group" aria-labelledby="calendar-' + view.id + '">\n' +
      '<h3 id="calendar-' + view.id + '">' + view.title + '</h3>\n' + content + '\n</section>';
  });
  return '<section class="section event-calendar" aria-labelledby="event-calendar-heading">\n' +
    '<h2 class="section-title" id="event-calendar-heading">EXM event calendar</h2>\n' +
    '<nav class="buttons" aria-label="Calendar views">' + nav.join('') + '</nav>\n' +
    sections.join('\n') + '\n</section>';
}
