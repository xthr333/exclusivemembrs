(() => {
  const byId = id => document.getElementById(id);
  const labels = {
    profile_complete: 'Profile completed', check_in: 'Daily check-in', event_participation: 'Event participation',
    songwars_participation: 'SongWars participation', battle_win: 'SongWars battle win', finals: 'Finals appearance',
    championship: 'Championship', judging: 'Verified judging', redeem: 'Reward redeemed', reverse: 'Points correction',
  };
  const pretty = value => labels[value] || String(value).replaceAll('_', ' ');
  const date = value => new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' });
  const fmt = value => Number(value).toLocaleString();

  function el(tag, text, classes) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (classes) node.className = classes;
    return node;
  }

  function memberLink(name, username) {
    const link = el('a', name, 'text-link');
    link.href = 'member.html?username=' + encodeURIComponent(username);
    return link;
  }

  async function api(path, data) {
    const response = await fetch('/api/platform/' + path, data === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || 'This tool is temporarily unavailable.'), { status: response.status });
    return result;
  }

  function sample(item, kind) {
    const node = el('span', item.name, 'cosmetic-sample cosmetic-' + item.appearance);
    node.dataset.kind = kind;
    return node;
  }

  function cosmetics(target, equipped) {
    const items = Object.entries(equipped || {}).map(([kind, item]) => sample(item, kind));
    target.replaceChildren(...items);
    if (!items.length) target.append(el('p', 'No cosmetics equipped.'));
  }

  window.EXMMemberUI = { api, el, actionButton, field, formFor, pretty, date };
  const publicProgress = byId('public-progress');
  if (publicProgress) {
    const username = new URLSearchParams(location.search).get('username') || '';
    api('public_progress?username=' + encodeURIComponent(username)).then(data => {
      const avatar = byId('public-avatar');
      if (data.equipped?.frame) avatar.classList.add('cosmetic-' + data.equipped.frame.appearance);
      publicProgress.append(el('p', data.rank + ' · Level ' + data.level + ' · ' + fmt(data.xp) + ' XP'));
      cosmetics(publicProgress, data.equipped);
    }).catch(() => {});
    return;
  }

  const status = byId('hub-status');
  if (!status) return;
  const panels = [...document.querySelectorAll('[data-panel]')];
  const viewLinks = [...document.querySelectorAll('[data-view]')];
  const signedOut = byId('hub-signed-out');
  const rankingForm = byId('rankings-filter');
  const catalogButton = byId('catalog-switch');
  const inventoryButton = byId('inventory-switch');
  const feedMore = byId('feed-more');
  let requestNumber = 0;
  let inventory = false;
  let before = null;
  let blockedAfter = '';
  let roles = [];
  let rankingPage = 1;

  function setList(id, values, empty) {
    byId(id).replaceChildren(...(values.length ? values : [el('li', empty)]));
  }

  function actionButton(label, callback) {
    const button = el('button', label, 'btn btn-dark');
    button.type = 'button';
    button.addEventListener('click', () => callback(button));
    return button;
  }

  async function mutate(button, path, payload, message) {
    if (button.disabled) return false;
    button.disabled = true;
    try {
      await api(path, payload);
      await load(message);
      return true;
    } catch (error) {
      status.textContent = error.message;
      return false;
    } finally {
      if (button.isConnected && button.id !== 'daily-check-in') button.disabled = false;
      if (button.id === 'daily-check-in' && button.textContent === 'Check in today') button.disabled = false;
    }
  }

  function showDashboard(data) {
    byId('member-welcome').textContent = 'Welcome, @' + data.username;
    byId('member-rank').textContent = data.rank + ' · Level ' + data.level + ' · ' + fmt(data.xp) + ' lifetime XP';
    byId('member-balance').textContent = fmt(data.points) + ' spendable points';
    byId('member-completion').textContent = data.profileComplete ? 'Profile complete.' : 'Add a display name, bio and one creative role to complete your profile.';
    const official = data.upcoming.map(item => {
      const line = el('li');
      const link = el('a', item.name);
      link.href = 'events.html#event-' + encodeURIComponent(item.id);
      line.append(link, item.starts_at ? ' · ' + date(item.starts_at) + ' (UTC)' : '');
      return line;
    });
    official.push(...data.announcements.map(item => el('li', item.name)));
    setList('dashboard-official', official, 'See Events and Announcements for the official EXM schedule.');
    byId('member-streak').textContent = data.streak + (data.streak === 1 ? ' day' : ' days') + ' in your current streak';
    const progress = byId('member-progress');
    progress.max = data.nextLevelXp ? data.nextLevelXp - data.levelFloor : 1;
    progress.value = data.nextLevelXp ? data.xp - data.levelFloor : 1;
    const next = data.nextLevelXp ? fmt(data.nextLevelXp - data.xp) + ' XP to level ' + (data.level + 1) : 'Maximum level';
    progress.setAttribute('aria-valuetext', next);
    byId('member-next-level').textContent = next;
    const checkIn = byId('daily-check-in');
    checkIn.disabled = data.checkedIn;
    checkIn.textContent = data.checkedIn ? 'Checked in today' : 'Check in today';
    cosmetics(byId('dashboard-cosmetics'), data.equipped);
    setList('points-history', data.history.map(entry => {
      const points = entry.points > 0 ? '+' + entry.points : String(entry.points);
      return el('li', date(entry.occurred_at) + ' · ' + pretty(entry.activity) + ' · ' + points + ' points · +' + entry.xp + ' XP');
    }), 'Your verified activity and redemptions will appear here.');
    setList('followed-milestones', data.milestones.map(entry => {
      const line = el('li');
      line.append(memberLink(entry.display_name, entry.username), ' · ' + pretty(entry.activity));
      return line;
    }), 'Milestones from members you follow will appear here.');
  }

  function showRankings(data) {
    const period = rankingForm.elements.period.value === 'season' ? data.season + ' · ' : '';
    byId('rank-period').textContent = period + 'Page ' + data.page;
    byId('rank-previous').disabled = data.page <= 1;
    byId('rank-next').disabled = !data.hasNext;
    setList('rank-rows', data.rows.map(row => {
      const line = el('li');
      line.append(el('strong', '#' + row.rank), memberLink(row.display_name, row.username), el('strong', fmt(row.score) + ' XP'));
      return line;
    }), 'No verified scores in this category and period yet.');
  }

  function showRewards(data) {
    byId('rewards-balance').textContent = fmt(data.points) + ' points available';
    catalogButton.setAttribute('aria-pressed', String(!inventory));
    inventoryButton.setAttribute('aria-pressed', String(inventory));
    const items = data.items.filter(item => inventory ? item.owned : item.active);
    const cards = items.map(item => {
      const card = el('article', null, 'platform-card');
      card.append(el('h3', item.name), sample(item, item.kind));
      card.append(el('p', item.kind + ' · ' + (item.cost == null ? 'Earned only' : item.cost + ' points')));
      if (item.owned) {
        const action = item.equipped ? 'unequip' : 'equip';
        card.append(actionButton(item.equipped ? 'Unequip' : 'Equip', button =>
          mutate(button, action, { reward: item.slug }, item.equipped ? 'Item unequipped.' : 'Cosmetic equipped.')));
      } else if (item.cost != null) {
        const button = actionButton('Redeem for ' + item.cost + ' points', button =>
          mutate(button, 'redeem', { reward: item.slug }, 'Reward added to your inventory.'));
        button.disabled = item.cost > data.points;
        card.append(button);
      }
      return card;
    });
    byId('reward-items').replaceChildren(...cards);
    if (!items.length) byId('reward-items').append(el('p', 'Your inventory is empty.'));
  }

  function field(form, label, name, options, type = 'text') {
    const wrapper = el('label', label);
    const input = el(options ? 'select' : 'input');
    input.name = name;
    if (options) {
      for (const [value, title] of options) {
        const choice = el('option', title);
        choice.value = value;
        input.append(choice);
      }
    } else {
      input.type = type;
      if (type === 'number') {
        input.min = 0;
        input.max = 10000;
        input.value = 0;
      }
    }
    input.required = true;
    wrapper.append(input);
    form.append(wrapper);
    return input;
  }

  function formFor(card, submitLabel, submit) {
    const form = el('form', null, 'hub-form');
    form.method = 'post';
    const button = el('button', submitLabel, 'btn btn-dark');
    button.type = 'submit';
    form.addEventListener('submit', event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      submit(button, values);
    });
    card.append(form);
    return { form, finish: () => form.append(button) };
  }

  function reportForm(id, label) {
    const details = el('details');
    details.append(el('summary', label));
    const { form, finish } = formFor(details, 'Send report', (button, values) =>
      mutate(button, 'report', { id, reason: values.reason }, 'Report sent for moderator review.'));
    field(form, 'Reason', 'reason', [
      ['harassment', 'Harassment'], ['spam', 'Spam'], ['privacy', 'Privacy'], ['other', 'Other'],
    ]);
    finish();
    return details;
  }

  function postingId(form) {
    form.dataset.requestId ||= crypto.randomUUID();
    return form.dataset.requestId;
  }

  function feedText(value, className) {
    const paragraph = el('p', null, className);
    const parts = value.split(/(https:\/\/[^\s<>"']+)/gi);
    for (const part of parts) {
      let parsed;
      try { if (part.startsWith('https://')) parsed = new URL(part); } catch {}
      if (!parsed || parsed.username || parsed.password) {
        paragraph.append(document.createTextNode(part));
      } else {
        const link = el('a', part, 'text-link');
        link.href = parsed.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer ugc';
        paragraph.append(link);
      }
    }
    return paragraph;
  }

  function feedCard(item) {
    const card = el('article', null, 'platform-card');
    const title = el('h3');
    title.append(memberLink(item.display_name, item.username));
    card.append(title, el('p', date(item.created_at)), feedText(item.body, 'feed-body'));
    const actions = el('div', null, 'hub-actions');
    const like = actionButton(item.liked ? 'Unlike' : 'Like', button =>
      mutate(button, 'like', { id: item.id, liked: !item.liked }, item.liked ? 'Like removed.' : 'Post liked.'));
    like.setAttribute('aria-pressed', String(item.liked));
    actions.append(like, el('span', fmt(item.likes) + ' likes'), reportForm(item.id, 'Report post'));
    card.append(actions);
    const comments = el('div', null, 'feed-comments');
    for (const comment of item.comments) {
      const entry = el('div');
      entry.append(memberLink(comment.display_name, comment.username), feedText(comment.body), reportForm(comment.id, 'Report comment'));
      comments.append(entry);
    }
    if (item.comments.length) card.append(comments);
    const { form, finish } = formFor(card, 'Send comment', (button, values) =>
      mutate(button, 'post', { id: postingId(form), parent: item.id, body: values.comment }, 'Comment posted.'));
    const comment = field(form, 'Comment on ' + item.display_name + '’s post', 'comment');
    comment.maxLength = 800;
    comment.addEventListener('input', () => { delete form.dataset.requestId; });
    finish();
    return card;
  }

  function showFeed(data, append = false) {
    if (!append) byId('feed-items').replaceChildren();
    byId('feed-items').append(...data.items.map(feedCard));
    if (!append && !data.items.length) byId('feed-items').append(el('p', 'No community updates yet.'));
    const tail = data.hasMore ? data.items.at(-1) : null;
    before = tail ? { before: tail.created_at, beforeId: tail.id } : null;
    feedMore.hidden = !before;
  }

  function showModeration(data) {
    const cards = data.items.map(item => {
      const card = el('article', null, 'platform-card');
      card.append(el('h3', '@' + item.username), el('p', item.body), el('p', 'Reported for ' + item.reasons.join(', ')));
      const actions = el('div', null, 'hub-actions');
      for (const decision of ['hide', 'dismiss']) {
        actions.append(actionButton(decision === 'hide' ? 'Hide content' : 'Dismiss reports', button =>
          mutate(button, 'moderate', { id: item.id, decision }, 'Moderation decision recorded.')));
      }
      card.append(actions);
      return card;
    });
    byId('moderation-items').replaceChildren(...cards);
    if (!cards.length) byId('moderation-items').append(el('p', 'No open reports.'));
  }

  function ownerCard(title, fields, action, buttonLabel, prepare = value => value) {
    const card = el('article', null, 'platform-card');
    card.append(el('h3', title));
    const { form, finish } = formFor(card, buttonLabel, (button, values) =>
      mutate(button, action, prepare(values), 'Owner action recorded.'));
    for (const params of fields) field(form, ...params);
    finish();
    return card;
  }

  function showOwner(data) {
    const rules = data.rules.map(rule => [rule.activity, pretty(rule.activity)]);
    const verification = rules.filter(([rule]) => !['profile_complete', 'check_in'].includes(rule));
    const awards = ownerCard('Record verified activity', [
      ['Member handle', 'username'], ['Activity', 'activity', verification],
      ['Scoring category', 'category', ['overall', 'artist', 'producer', 'judge', 'spectator', 'creator', 'songwars'].map(x => [x, pretty(x)])],
      ['Unique official result or activity reference', 'source'],
    ], 'award', 'Record activity');
    const thresholds = ownerCard('Award settings', [
      ['Activity', 'activity', rules], ['Lifetime XP', 'xp', null, 'number'], ['Spendable points', 'points', null, 'number'],
    ], 'rule', 'Save award settings', values => ({ ...values, xp: Number(values.xp), points: Number(values.points) }));
    const awardForm = thresholds.querySelector('form');
    const selectRule = () => {
      const rule = data.rules.find(rule => rule.activity === awardForm.elements.activity.value);
      awardForm.elements.xp.value = rule.xp;
      awardForm.elements.points.value = rule.points;
    };
    awardForm.elements.activity.addEventListener('change', selectRule);
    selectRule();
    const rolesCard = ownerCard('Appoint staff', [
      ['Member handle', 'username'], ['Role', 'role', [['moderator', 'Moderator'], ['event_staff', 'Event staff'], ['judge', 'Judge']]],
      ['Permission', 'enabled', [['true', 'Grant'], ['false', 'Remove']]],
    ], 'role', 'Save permission', values => ({ ...values, enabled: values.enabled === 'true' }));
    const catalog = ownerCard('Reward catalog', [
      ['Reward', 'reward', data.rewards.map(reward => [reward.slug, reward.name])],
      ['Cost in points', 'cost', null, 'number'], ['Catalog visibility', 'active', [['true', 'Visible'], ['false', 'Hidden']]],
    ], 'catalog', 'Save reward', values => ({ ...values, cost: Number(values.cost), active: values.active === 'true' }));
    const catalogForm = catalog.querySelector('form');
    catalogForm.elements.cost.min = 1;
    const selectReward = () => {
      const reward = data.rewards.find(reward => reward.slug === catalogForm.elements.reward.value);
      catalogForm.elements.cost.value = reward.cost ?? 1;
      catalogForm.elements.cost.readOnly = reward.cost == null;
      catalogForm.elements.active.value = String(reward.active);
    };
    catalogForm.elements.reward.addEventListener('change', selectReward);
    selectReward();
    const season = ownerCard('Leaderboard season', [['Season key', 'key'], ['Season name', 'name']], 'season', 'Save season');
    season.querySelector('form').elements.key.value = data.season.key;
    season.querySelector('form').elements.name.value = data.season.name;
    const correction = ownerCard('Audited points correction', [
      ['Member handle', 'username'], ['Points change', 'points', null, 'number'], ['Unique correction reference', 'source'],
    ], 'point_adjust', 'Record correction', values => ({ ...values, points: Number(values.points) }));
    correction.querySelector('input[name="points"]').min = -10000;
    byId('owner-content').replaceChildren(awards, thresholds, rolesCard, catalog, season, correction);
    setList('audit-items', data.audit.map(entry => el('li', date(entry.occurred_at) + ' · ' + pretty(entry.action) + ' · ' + entry.subject)), 'No owner actions recorded.');
  }

  function showBlocks(data, append = false) {
    const list = byId('blocked-members');
    if (!append) list.replaceChildren();
    for (const username of data.members) {
      const row = el('li', null, 'hub-actions');
      row.append(el('span', '@' + username), actionButton('Unblock ' + username, button =>
        mutate(button, 'set_block', { username, blocked: false }, 'Member unblocked.')));
      list.append(row);
    }
    if (!append && !data.members.length) list.append(el('li', 'You have no blocked members.'));
    blockedAfter = data.nextAfter || '';
    byId('blocked-more').hidden = !blockedAfter;
  }

  const eventsOnly = window.EXMHostedMode === 'events';
  if (window.EXMHostedMode) document.querySelector('[data-view="access"]').hidden = true;
  if (eventsOnly) {
    for (const link of viewLinks) link.hidden = true;
    const staffLink = document.querySelector('[data-view="staff"]');
    staffLink.textContent = 'Event dashboard';
  }

  async function load(message = '') {
    const requested = location.hash.slice(1);
    const view = eventsOnly ? 'staff' :
      panels.some(panel => panel.dataset.panel === requested) ? requested : 'dashboard';
    const request = ++requestNumber;
    signedOut.hidden = true;
    panels.forEach(panel => { panel.hidden = panel.dataset.panel !== view; });
    viewLinks.forEach(link => {
      if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    status.textContent = 'Loading…';
    try {
      if (view === 'dashboard') {
        const data = await api('dashboard');
        if (request !== requestNumber) return;
        roles = data.roles;
        showDashboard(data);
      } else if (view === 'rankings') {
        const query = new URLSearchParams(new FormData(rankingForm));
        query.set('page', rankingPage);
        const data = await api('rankings?' + query);
        if (request !== requestNumber) return;
        showRankings(data);
      } else if (view === 'feed') {
        const data = await api('feed');
        if (request !== requestNumber) return;
        showFeed(data);
      } else if (view === 'rewards') {
        const data = await api('rewards');
        if (request !== requestNumber) return;
        showRewards(data);
      } else if (view === 'access') {
        await window.EXMMemberOperations.access();
      } else if (view === 'privacy') {
        const data = await api('blocked_members');
        if (request !== requestNumber) return;
        showBlocks(data);
      } else if (view === 'staff') {
        const data = await api('dashboard');
        roles = data.roles;
        const canModerate = !eventsOnly && (roles.includes('owner') || roles.includes('moderator'));
        const isOwner = roles.includes('owner');
        const canOperate = isOwner || roles.includes('event_staff') || roles.includes('judge');
        if (!canModerate && !canOperate) throw new Error('This account does not have staff access.');
        const [reports, owner] = await Promise.all([canModerate ? api('moderation') : null, !eventsOnly && isOwner ? api('owner') : null]);
        if (request !== requestNumber) return;
        byId('moderation-tools').hidden = !canModerate;
        byId('owner-tools').hidden = !owner;
        if (reports) showModeration(reports);
        if (owner) showOwner(owner);
        byId('operations-tools').hidden = !canOperate;
        if (canOperate) await window.EXMMemberOperations.studio(isOwner,
          isOwner || (!window.EXMHostedMode && roles.includes('event_staff')), isOwner || roles.includes('judge'));
      }
      if (request === requestNumber) status.textContent = message;
    } catch (error) {
      if (request !== requestNumber) return;
      panels.forEach(panel => { panel.hidden = true; });
      status.textContent = error.status === 401 ? '' : error.message;
      signedOut.hidden = error.status !== 401;
    } finally {
      if (request === requestNumber) {
        document.querySelector('[data-view="staff"]').hidden = !roles.some(role => ['owner', 'moderator', 'event_staff', 'judge'].includes(role));
      }
    }
  }

  byId('daily-check-in').addEventListener('click', event =>
    mutate(event.currentTarget, 'check_in', {}, 'Today’s check-in is saved.'));
  byId('new-post').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = byId('post-text');
    if (await mutate(form.querySelector('button'), 'post', { id: postingId(form), body: input.value }, 'Update posted.')) {
      form.reset();
      delete form.dataset.requestId;
    }
  });
  byId('post-text').addEventListener('input', () => { delete byId('new-post').dataset.requestId; });
  feedMore.addEventListener('click', async () => {
    feedMore.disabled = true;
    const request = requestNumber;
    try {
      const data = await api('feed?' + new URLSearchParams(before));
      if (request === requestNumber) showFeed(data, true);
    } catch (error) {
      if (request === requestNumber) status.textContent = error.message;
    } finally {
      feedMore.disabled = false;
    }
  });
  byId('blocked-more').addEventListener('click', async event => {
    const button = event.currentTarget;
    const request = requestNumber;
    button.disabled = true;
    try {
      const data = await api('blocked_members?after=' + encodeURIComponent(blockedAfter));
      if (request === requestNumber) showBlocks(data, true);
    } catch (error) {
      if (request === requestNumber) status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  rankingForm.addEventListener('submit', event => { event.preventDefault(); rankingPage = 1; load(); });
  byId('rank-previous').addEventListener('click', () => { rankingPage = Math.max(1, rankingPage - 1); load(); });
  byId('rank-next').addEventListener('click', () => { rankingPage += 1; load(); });
  catalogButton.addEventListener('click', () => { inventory = false; load(); });
  inventoryButton.addEventListener('click', () => { inventory = true; load(); });
  addEventListener('hashchange', () => load());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => load(), { once: true });
  else load();
})();
