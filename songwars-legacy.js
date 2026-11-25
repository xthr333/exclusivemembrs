import { legacyArchive, legacyRanking } from './songwars-legacy-data.js';

const el = (tag, text, css) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (css) node.className = css;
  return node;
};
const link = (label, href) => {
  const node = el('a', label, 'text-link');
  node.href = href;
  return node;
};
const profileLink = person => link(person.name, 'legacy.html?artist=' + encodeURIComponent(person.id));
const score = (match, team) => match?.outOf ? (match.winner === team ? match.score : match.opponentScore) + ' / ' + match.outOf : '—';
const statements = {
  unresolved: 'Howtoact and HGW have verified results. Their artist identities are pending.',
  points: 'Legacy Points track verified competition history separately from lifetime XP and spendable rewards points.',
  s2: 'Season II placement data is incomplete. The confirmed champion receives 40 verified-minimum Legacy Points.',
};

function list(parent, heading, rows) {
  const section = el('section', null, 'platform-card');
  section.append(el('h3', heading));
  const items = el('ul', null, 'legacy-list');
  for (const row of rows) items.append(el('li', row));
  section.append(items);
  parent.append(section);
}

function archivePage(target, archive) {
  const { source, teams, matches } = archive;
  const sections = el('div', null, 'platform-grid hub-grid');
  list(sections, 'Season credits', source.seasons.map(season =>
    season.label + ' · ' + season.credits.join(' & ') +
    (season.status === 'archive' ? ' · Archive credit' : season.status === 'pending' ? ' · Verification pending' : ' · Verified title')));
  list(sections, 'Season II · Announced opening matchups', source.s2Announced.map(pair => pair.join(' vs. ')));
  list(sections, 'Season II · Recap credits', source.s2Credits);
  list(sections, 'Season II · Lineup conflict', [...source.s2Disputed, 'Runner-up and round results pending final bracket or VOD.']);
  list(sections, 'Cross-season aliases', source.crossSeasonAliases.map(pair => [...new Set(pair)].join(' / ')));
  list(sections, 'Season III · Approved roster only', source.s3ApprovalOnly.map(([team, ...names]) => team + ' · ' + names.join(', ')));
  list(sections, 'Season III · Lineup notes only', source.s3LineupOnly.map(([team, ...names]) => team + ' · ' + names.join(', ')));
  target.prepend(el('p', statements.s2), sections);
  const bracket = el('section', null, 'platform-section');
  bracket.append(el('h2', 'Season III bracket'));
  const bouts = el('ol', null, 'legacy-list');
  for (const match of matches) {
    const result = match.outOf ? match.score + '–' + match.opponentScore + ' / ' + match.outOf : 'Score unpublished';
    bouts.append(el('li', match.stage + ' · ' + match.winner.name + ' defeated ' + match.opponent.name + ' · ' + result));
  }
  bracket.append(bouts);
  target.querySelector('#legacy-bracket').append(bracket);
  const participants = el('section', null, 'platform-section');
  participants.append(el('h2', 'Season III participants'), el('p', statements.unresolved));
  const groups = el('div', null, 'platform-grid hub-grid');
  const final = matches.find(match => match.stage === 'Final');
  for (const team of teams.values()) {
    const card = el('article', null, 'platform-card');
    const placement = team === final.winner ? ' · Champion' : team === final.opponent ? ' · Finalist' : '';
    card.append(el('h3', team.name), el('p', team.wins + '–' + team.losses + ' played' + placement));
    for (const [id, name] of team.artists) {
      const credit = el('p');
      credit.append(profileLink({ id, name }));
      card.append(credit);
    }
    if (!team.artists.length) card.append(el('p', 'Artist attribution pending.'));
    groups.append(card);
  }
  participants.append(groups);
  list(participants, 'Wildcard', source.wildcard.map(([id, detail, value, outOf]) =>
    teams.get(id).name + ' · ' + detail + ' · ' + (100 * value / outOf).toFixed(2).replace(/\.00$/, '') + '% (' + value + '/' + outOf + ')'));
  target.querySelector('#legacy-participants').append(participants);
  const judging = el('section', null, 'platform-section');
  judging.append(el('h2', 'Judging credits'), el('p', 'Published Season III results document panel size. Individual scoring shifts are pending verification.'));
  for (const [key, label] of [['s2','Season II'],['s3','Season III']]) {
    list(judging, label, source.judges.filter(row => row[0] === key).map(([, name, status]) => name + ' · ' + status));
  }
  target.querySelector('#legacy-judging').append(judging);
}

function profile(target, archive, person) {
  const total = archive.awards.filter(row => row.person === person.id).reduce((sum,row) => sum + row.points,0);
  target.append(el('h2', person.name + ' · SongWars record'), el('p', total + ' verified Legacy Points'));
  if (person.link) target.append(link('Open EXM profile', person.link));
  const champion = archive.awards.filter(row => row.person === person.id && row.event === 'championship');
  for (const row of champion) {
    target.append(el('p', 'SongWars Champion · ' + archive.source.seasons.find(season => season.id === row.season).label, 'champion-mark'));
  }
  if (person.s2) target.append(el('p', statements.s2));
  if (person.s3) {
    target.append(el('p', 'Season III · ' + person.team.name + ' · ' + person.team.wins + '–' + person.team.losses + ' played'));
    list(target, 'Verified Season III bouts', person.team.bouts.map(match =>
      match.stage + ' · ' + (match.winner === person.team ? 'Win vs. ' + match.opponent.name : 'Loss vs. ' + match.winner.name) +
      ' · Judge Score ' + score(match, person.team)));
  }
}

function standings(target, archive) {
  const form = target.querySelector('form');
  const results = target.querySelector('[data-legacy-scores]');
  const tabs = [...form.querySelectorAll('[role="tab"]')];
  let category = 'artist';
  function render() {
    results.replaceChildren();
    const period = form.elements.season.value;
    if (category === 'producer') {
      results.append(el('p', 'No verified producer competition results qualify for these standings.'));
      results.append(link('Vantiva · verified EXM producer roster credit', 'vantiva.html'));
      return;
    }
    const table = el('table', null, 'legacy-table');
    const head = table.createTHead().insertRow();
    for (const label of ['Rank','Artist','EXM tag','Legacy Points','Verified wins','Judge Score¹']) {
      const cell = el('th', label);
      cell.scope = 'col';
      head.append(cell);
    }
    const body = table.createTBody();
    for (const person of legacyRanking(archive,period).slice(0,50)) {
      const row = body.insertRow();
      row.insertCell().textContent = String(person.rank);
      const artist = row.insertCell();
      const emblem = el('span', person.name.slice(0, 2).toUpperCase(), 'legacy-emblem');
      emblem.setAttribute('aria-hidden', 'true');
      artist.append(emblem, profileLink(person));
      const earnedTitle = archive.awards.some(award => award.person === person.id && award.event === 'championship' &&
        (period === 'all' || award.season === period));
      if (earnedTitle) artist.append(el('small', 'SongWars Champion'));
      row.insertCell().textContent = person.link ? '@' + person.id : '—';
      row.insertCell().textContent = String(person.points);
      row.insertCell().textContent = period === 's2' ? '—' : String(person.team.wins);
      row.insertCell().textContent = period === 's2' ? '—' :
        score([...person.team.bouts].reverse().find(match => match.outOf), person.team);
    }
    const wrap = el('div', null, 'legacy-table-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('aria-label','Scrollable Legacy standings table');
    wrap.append(table);
    results.append(wrap, el('p','¹ Most recent published score within the selected period. Unpublished scores use a dash. Older results are incomplete.'));
  }
  function selectTab(tab) {
    category = tab.dataset.category;
    results.setAttribute('aria-labelledby',tab.id);
    for (const choice of tabs) {
      choice.setAttribute('aria-selected',String(choice === tab));
      choice.tabIndex = choice === tab ? 0 : -1;
    }
    render();
  }
  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const positions = { ArrowLeft:1-tabs.indexOf(tab), ArrowRight:1-tabs.indexOf(tab), Home:0, End:1 };
      if (!Object.hasOwn(positions,event.key)) return;
      event.preventDefault();
      const next = tabs[positions[event.key]];
      selectTab(next);
      next.focus();
    });
  }
  form.addEventListener('change', render);
  render();
}

const views = [...document.querySelectorAll('[data-legacy-view]')];
if (views.length) {
  fetch(new URL('./songwars-legacy.json', import.meta.url)).then(async response => {
    if (!response.ok) throw new Error('Legacy archive unavailable.');
    const archive = legacyArchive(await response.json());
    for (const target of views) {
      const type = target.dataset.legacyView;
      if (type === 'standings') standings(target, archive);
      if (type === 'archive') {
        const id = new URLSearchParams(location.search).get('artist');
        const person = archive.people.get(id);
        if (person) profile(target, archive, person);
        else if (id) target.append(el('p', 'This historical artist record was not found.'));
        else archivePage(target, archive);
        if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
      }
      if (type === 'profile') {
        const person = archive.people.get(target.dataset.person || new URLSearchParams(location.search).get('username'));
        if (person) profile(target,archive,person);
      }
    }
  }).catch(() => {
    for (const target of views) target.append(el('p','The Legacy archive is temporarily unavailable.'));
  });
}
