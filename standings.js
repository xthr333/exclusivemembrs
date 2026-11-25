(() => {
  const form = document.getElementById('standings-filter');
  const status = document.getElementById('standings-status');
  const rows = document.getElementById('standings-rows');
  const previous = document.getElementById('standings-previous');
  const next = document.getElementById('standings-next');
  const formatter = new Intl.NumberFormat();
  let page = 1;
  let request;

  function entry(row) {
    const item = document.createElement('li');
    const rank = document.createElement('strong');
    rank.textContent = '#' + row.rank;
    const credit = document.createElement('div');
    const member = document.createElement('a');
    member.href = '/member?username=' + encodeURIComponent(row.username);
    member.textContent = row.display_name;
    credit.append(member);
    if (row.champion) {
      const badge = document.createElement('p');
      badge.className = 'champion-mark';
      badge.textContent = 'SongWars Champion';
      credit.append(badge);
    }
    if (row.titles?.length) {
      const titles = document.createElement('p');
      titles.textContent = row.titles.join(' · ');
      credit.append(titles);
    }
    const score = document.createElement('strong');
    score.textContent = formatter.format(row.score) + ' XP';
    item.append(rank, credit, score);
    return item;
  }

  async function load() {
    request?.abort();
    const current = new AbortController();
    request = current;
    const query = new URLSearchParams(new FormData(form));
    query.set('page', page);
    status.textContent = 'Loading standings…';
    rows.replaceChildren();
    previous.disabled = next.disabled = true;
    try {
      const response = await fetch('/api/platform/rankings?' + query, { signal: current.signal });
      if (!response.ok) throw new Error('Standings unavailable');
      const result = await response.json();
      if (request !== current) return;
      rows.start = (result.page - 1) * 25 + 1;
      rows.replaceChildren(...result.rows.map(entry));
      const period = query.get('period') === 'season' ? result.season : 'All-time';
      status.textContent = result.rows.length ? period + ' · Page ' + result.page :
        'No verified scores for this category and period yet.';
      previous.disabled = result.page <= 1;
      next.disabled = !result.hasNext;
    } catch {
      if (request === current) status.textContent = 'Standings are temporarily unavailable. Try again.';
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    page = 1;
    load();
  });
  previous.addEventListener('click', () => { if (page > 1) { page--; load(); } });
  next.addEventListener('click', () => { page++; load(); });
  load();
})();
