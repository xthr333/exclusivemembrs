import { rankCompetition } from './songwars-competition.js';

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
const legacyHref = id => 'legacy.html?artist=' + encodeURIComponent(id);
const memberHref = username => 'member.html?username=' + encodeURIComponent(username);

function leaderboard(target, data) {
  const panel = target.querySelector('#legacy-scores');
  const period = target.querySelector('#legacy-period');
  const tabs = [...target.querySelectorAll('[role="tab"]')];
  const publicProfiles = new Map();
  const discovery = data.producerDiscovery ?? [];
  const publicRoutes = new Map([...data.artists, ...data.producers, ...discovery].map(row => [row.id, row.link]));
  const artistHref = id => {
    if (publicProfiles.has(id)) return memberHref(publicProfiles.get(id));
    const path = publicRoutes.get(id);
    return path && /^[a-z0-9-]+\.html$/.test(path) ? path : legacyHref(id);
  };
  const artistLink = (id, name) => {
    const anchor = link(name, artistHref(id), 'events-artist-name');
    anchor.dataset.artistId = id;
    return anchor;
  };
  let selected = tabs[0];

  function render() {
    const category = selected.dataset.category;
    const ranked = rankCompetition(data[category], period.value);

    panel.replaceChildren();
    if (!ranked.length) {
      const role = category === 'artists' ? 'artist' : 'producer';
      panel.append(el('p', 'No verified ' + role + ' competition results in this period.', 'events-empty'));
      if (category === 'producers') {
        const roster = el('article', null, 'events-result');
        roster.append(el('h3', 'Meet the producers'));
        for (const producer of discovery) {
          const profile = el('p');
          profile.append(artistLink(producer.id, producer.name), ' · EXM Producer');
          roster.append(profile);
        }
        roster.append(link('Browse the EXM roster', 'artists.html', 'text-link'));
        panel.append(roster);
      }
      return;
    }

    const table = el('table', null, 'events-rank');
    const columns = el('colgroup');
    for (const css of ['rank-place', 'rank-artist', 'rank-titles', 'rank-wins']) columns.append(el('col', null, css));
    table.append(columns);
    const header = table.createTHead().insertRow();
    for (const label of ['Rank', category === 'artists' ? 'Artist' : 'Producer', 'Titles', 'Wins']) {
      const cell = el('th', label);
      cell.scope = 'col';
      header.append(cell);
    }
    const body = table.createTBody();
    for (const artist of ranked) {
      const row = body.insertRow();
      row.dataset.rank = String(artist.rank);
      row.insertCell().textContent = String(artist.rank);
      const avatar = el('span', artist.name.slice(0, 2).toUpperCase(), 'events-avatar');
      avatar.setAttribute('aria-hidden', 'true');
      const identity = el('span');
      identity.append(artistLink(artist.id, artist.name));
      if (artist.round) identity.append(el('small', 'Best round: ' + artist.round.label));
      const artistCell = row.insertCell();
      const artistLayout = el('div', null, 'events-artist');
      artistLayout.append(avatar, identity);
      artistCell.append(artistLayout);
      row.insertCell().textContent = String(artist.titles);
      row.insertCell().textContent = artist.wins ?? '—';
    }
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

  if (window.EXMHostedMode === 'members') {
    fetch('/api/members/roster-credits', { credentials: 'omit' }).then(async response => {
      if (!response.ok) return;
      const { entries } = await response.json();
      for (const entry of entries ?? []) {
        if (entry.linked && /^[a-z0-9][a-z0-9_-]{2,23}$/.test(entry.publicUsername ?? '')) {
          publicProfiles.set(entry.handle, entry.publicUsername);
        }
      }
      for (const name of panel.querySelectorAll('[data-artist-id]')) {
        name.href = artistHref(name.dataset.artistId);
      }
    }).catch(() => {});
  }
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
    target.querySelector('#events-eyebrow').textContent = isResults ? 'SongWars' : 'SongWars Competition';
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
  const isArchive = target.dataset.legacyView === 'archive';
  if (isArchive) {
    target.querySelector('.events-titlebar h1').textContent = artist.name;
    const hero = el('header', null, 'legacy-player-hero');
    const avatar = el('span', artist.name.slice(0, 2).toUpperCase(), 'events-avatar');
    avatar.setAttribute('aria-hidden', 'true');
    hero.append(avatar, el('p', 'SONGWARS ARTIST', 'events-eyebrow'));
    section.append(hero);
  }
  section.append(el('h2', isArchive ? 'SongWars record' : artist.name + ' · SongWars record'));
  const stats = el('div', null, 'legacy-player-stats');
  const knownWins = artist.seasons.filter(record => Number.isInteger(record.wins));
  const stat = (value, label) => {
    const card = el('div');
    card.append(el('strong', String(value)), el('span', label));
    return card;
  };
  stats.append(stat(total, 'Legacy Points'));
  const titles = artist.seasons.filter(record => record.champion).length;
  if (titles) stats.append(stat(titles, 'Verified championships'));
  if (knownWins.length) stats.append(stat(knownWins.reduce((sum, record) => sum + record.wins, 0), 'Recorded wins'));
  section.append(stats);
  const recordLink = artist.link && !location.pathname.endsWith('/' + artist.link) &&
    !location.pathname.endsWith('/' + artist.link.replace('.html', ''));
  if (recordLink) section.append(link('Open EXM roster profile', artist.link, 'text-link'));
  // Winner-only archive entries retain credit without inventing bouts or payouts.
  const winnerOnly = data.results.filter(result => artist.archiveCredits?.includes(result.id));
  for (const result of winnerOnly) {
    const credit = el('p', null, 'legacy-winner-credit');
    credit.append(el('strong', result.label), document.createTextNode(' · Winner'));
    section.append(credit);
  }
  for (const record of artist.seasons) {
    const result = data.results.find(item => item.id === record.id);
    section.append(el('h3', result.label));
    if (record.champion && !record.bouts) {
      section.append(el('p', 'Winner', 'legacy-winner-credit'));
      continue;
    }
    if (record.champion) section.append(el('p', 'SongWars Champion', 'champion-mark'));
    section.append(el('p', record.points + ' Legacy Points' + (record.wins == null ? '' : ' · ' + record.wins + ' wins')));
    if (!record.bouts) continue;
    const disclosure = el('details', null, 'events-bracket');
    disclosure.append(el('summary', 'Match results'));
    const bouts = el('ul', null, 'events-matches');
    for (const bout of record.bouts) {
      const match = data.brackets.find(item => item.id === bout.id);
      const item = el('li', match.stage + ' · ' + (bout.won ? 'Win vs. ' + match.opponent : 'Loss vs. ' + match.winner));
      if (match.outOf != null) item.append(el('span', 'Judge Score ' + (bout.won ? match.score : match.opponentScore) + ' / ' + match.outOf, 'events-score'));
      bouts.append(item);
    }
    disclosure.append(bouts);
    section.append(disclosure);
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
      if (target.closest('#public-profile')) {
        const showVerifiedHistory = () => {
          const artist = data.artists.find(row => row.id === target.dataset.person);
          if (artist && !target.firstElementChild) profile(target, data, artist);
        };
        document.addEventListener('exm:profile', showVerifiedHistory);
        showVerifiedHistory();
        continue;
      }
      const id = target.dataset.person || params.get('artist');
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
