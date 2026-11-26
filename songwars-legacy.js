const el = (tag, text, css) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (css) node.className = css;
  return node;
};
const link = (label, href, css) => {
  const node = el('a', label, css);
  node.href = href;
  return node;
};
const artistHref = artist => 'legacy.html?artist=' + encodeURIComponent(artist.id);

function leaderboard(target, data) {
  const panel = target.querySelector('#legacy-scores');
  const period = target.querySelector('#legacy-period');
  const tabs = [...target.querySelectorAll('[role="tab"]')];
  let selected = tabs[0];

  function render() {
    const season = period.value;
    const ranked = data[selected.dataset.category].flatMap(artist => {
      const records = artist.seasons.filter(record => season === 'all' || record.id === season);
      if (!records.length) return [];
      const wins = records.filter(record => Number.isInteger(record.wins));
      return [{
        ...artist,
        points: records.reduce((sum, record) => sum + record.points, 0),
        wins: wins.length ? wins.reduce((sum, record) => sum + record.wins, 0) : null,
        champion: records.some(record => record.champion),
      }];
    }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    panel.replaceChildren();
    if (!ranked.length) {
      const category = selected.dataset.category === 'artists' ? 'artist' : 'producer';
      panel.append(el('p', 'No verified ' + category + ' competition results in this period.', 'events-empty'));
      return;
    }

    const table = el('table', null, 'events-rank');
    const columns = el('colgroup');
    for (const css of ['rank-place', 'rank-artist', 'rank-wins', 'rank-points']) columns.append(el('col', null, css));
    table.append(columns);
    const header = table.createTHead().insertRow();
    for (const label of ['Rank', selected.textContent.trim() === 'Artists' ? 'Artist' : 'Producer', 'Wins', 'Legacy Points']) {
      const cell = el('th', label);
      cell.scope = 'col';
      header.append(cell);
    }
    const body = table.createTBody();
    let lastPoints;
    let rank = 0;
    ranked.slice(0, 50).forEach((artist, index) => {
      if (artist.points !== lastPoints) rank = index + 1;
      lastPoints = artist.points;
      const row = body.insertRow();
      row.dataset.rank = String(rank);
      row.insertCell().textContent = String(rank);
      const name = link(artist.name, artistHref(artist), 'events-artist-name');
      const avatar = el('span', artist.name.slice(0, 2).toUpperCase(), 'events-avatar');
      avatar.setAttribute('aria-hidden', 'true');
      const identity = el('span');
      identity.append(name);
      if (artist.champion) identity.append(el('small', 'Champion'));
      const artistCell = row.insertCell();
      const artistLayout = el('div', null, 'events-artist');
      artistLayout.append(avatar, identity);
      artistCell.append(artistLayout);
      row.insertCell().textContent = artist.wins ?? '—';
      row.insertCell().textContent = String(artist.points);
    });
    panel.append(table);
  }

  function activate(tab) {
    selected = tab;
    for (const choice of tabs) {
      choice.setAttribute('aria-selected', String(choice === tab));
      choice.tabIndex = choice === tab ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', tab.id);
    render();
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      const positions = { ArrowLeft: 1 - tabs.indexOf(tab), ArrowRight: 1 - tabs.indexOf(tab), Home: 0, End: 1 };
      if (!Object.hasOwn(positions, event.key)) return;
      event.preventDefault();
      const next = tabs[positions[event.key]];
      activate(next);
      next.focus();
    });
  }
  period.addEventListener('change', render);
  activate(selected);
}

const roundIds = { Opening: 'bracket', Quarterfinal: 'round-quarters', Semifinal: 'round-semis', Final: 'round-final' };
const resultLinks = new Map([
  ['songwars-history', 'results'], ['calendar-past', 'results'], ['calendar-live', 'event-board'],
  ['legacy-bracket', 'bracket'], ['legacy-participants', 'bracket'], ['legacy-judging', 'results'],
  ['calendar-event-songwars-iii', 'double-impact'],
  ['calendar-upcoming', 'featured-event'], ['calendar-event-songwars-iv', 'featured-event'],
]);

const publishedScore = match => match.outOf == null ? null : match.score + '–' + match.opponentScore + ' / ' + match.outOf;

function renderResults(target, data) {
  target.replaceChildren();
  for (const result of data.results) {
    const row = el('article', null, 'events-result');
    row.append(el('h3', result.label));
    if (result.finalScore) {
      row.id = 'double-impact';
      row.append(el('p', [result.winner, result.artists.join(' + '), result.finalScore.join('–')].join(' • ')));
      const bracket = el('details', null, 'events-bracket');
      bracket.append(el('summary', 'View bracket'));
      for (const [stage, id] of Object.entries(roundIds)) {
        const round = el('section');
        round.id = id;
        round.append(el('h4', stage));
        const matches = el('ul', null, 'events-matches');
        for (const match of data.brackets.filter(bout => bout.stage === stage)) {
          const score = publishedScore(match);
          const item = el('li');
          item.append(el('span', match.winner + ' defeated ' + match.opponent));
          if (score) item.append(el('span', 'Judge Score ' + score, 'events-score'));
          matches.append(item);
        }
        round.append(matches);
        bracket.append(round);
      }
      row.append(bracket);
    } else {
      row.append(el('p', 'Winner — ' + result.winner));
    }
    target.append(row);
  }
}

function events(target, data) {
  leaderboard(target, data);
  renderResults(target.querySelector('#recent-results'), data);
  const standings = target.querySelector('#leaderboard');
  const results = target.querySelector('#results');
  const [standingsLink, resultsLink] = target.querySelectorAll('.events-nav a');
  function selectView() {
    const hash = location.hash.slice(1);
    const anchor = resultLinks.get(hash) || hash;
    const isResults = Boolean(anchor && anchor !== 'leaderboard' && anchor !== 'featured-event' && anchor !== 'main');
    standings.hidden = isResults;
    results.hidden = !isResults;
    target.querySelector('#events-title').textContent = isResults ? 'Results' : 'Leaderboard';
    target.querySelector('#events-eyebrow').textContent = isResults ? 'SongWars' : 'SongWars Legacy';
    target.querySelector('#events-filters').hidden = isResults;
    target.querySelector('#hall-link').hidden = !isResults;
    standingsLink.toggleAttribute('aria-current', !isResults);
    resultsLink.toggleAttribute('aria-current', isResults);
    (isResults ? resultsLink : standingsLink).setAttribute('aria-current', 'location');
    if (Object.values(roundIds).includes(anchor)) target.querySelector('.events-bracket').open = true;
    if (anchor && anchor !== 'leaderboard' && anchor !== 'results') {
      const destination = document.getElementById(anchor);
      if (destination instanceof HTMLDetailsElement) destination.open = true;
      destination?.scrollIntoView();
    }
  }
  window.addEventListener('hashchange', selectView);
  selectView();
}

function profile(target, data, artist) {
  const section = el('section', null, 'events-history');
  const total = artist.seasons.reduce((sum, record) => sum + record.points, 0);
  section.append(el('h2', artist.name + ' · SongWars record'), el('p', total + ' Legacy Points'));
  const recordLink = artist.link && !location.pathname.endsWith('/' + artist.link) &&
    !location.pathname.endsWith('/' + artist.link.replace('.html', ''));
  if (recordLink) section.append(link('Open EXM roster profile', artist.link, 'text-link'));
  for (const record of artist.seasons) {
    const result = data.results.find(item => item.id === record.id);
    section.append(el('h3', result.label));
    if (record.champion) section.append(el('p', 'SongWars Champion', 'champion-mark'));
    section.append(el('p', record.points + ' Legacy Points' + (record.wins == null ? '' : ' · ' + record.wins + ' wins')));
    if (!record.bouts) continue;
    const bouts = el('ul', null, 'events-matches');
    for (const bout of record.bouts) {
      const match = data.brackets.find(item => item.id === bout.id);
      const item = el('li', match.stage + ' · ' + (bout.won ? 'Win vs. ' + match.opponent : 'Loss vs. ' + match.winner));
      if (match.outOf != null) item.append(el('span', 'Judge Score ' + (bout.won ? match.score : match.opponentScore) + ' / ' + match.outOf, 'events-score'));
      bouts.append(item);
    }
    section.append(bouts);
  }
  target.append(section);
}

const views = [...document.querySelectorAll('[data-legacy-view]')];
const params = new URLSearchParams(location.search);
const archive = views.find(target => target.dataset.legacyView === 'archive');
if (archive && !params.get('artist')) location.replace('events.html' + (location.hash || '#results'));
if (document.getElementById('standings-filter')) {
  const redirectLegacy = () => {
    if (location.hash === '#legacy') location.replace('events.html');
  };
  window.addEventListener('hashchange', redirectLegacy);
  redirectLegacy();
}
if (views.length && !(archive && !params.get('artist'))) {
  fetch(new URL('./songwars-legacy.json', import.meta.url)).then(async response => {
    if (!response.ok) throw new Error('Archive unavailable');
    const data = await response.json();
    for (const target of views) {
      if (target.dataset.legacyView === 'events') {
        events(target, data);
        continue;
      }
      const id = target.dataset.person || params.get(archive ? 'artist' : 'username');
      const artist = data.artists.find(row => row.id === id);
      if (artist) profile(target, data, artist);
      else if (archive) target.querySelector('#artist-legacy').textContent = 'Artist record not found.';
    }
  }).catch(() => {
    const status = document.querySelector('#legacy-scores > p');
    if (status) status.textContent = 'Standings are temporarily unavailable.';
    const target = archive?.querySelector('#artist-legacy');
    if (target) target.textContent = 'This record is temporarily unavailable.';
  });
}
