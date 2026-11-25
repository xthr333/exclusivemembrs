(() => {
  const { api, el, actionButton, field, formFor, pretty, date } = window.EXMMemberUI;
  const byId = id => document.getElementById(id);
  const hosted = Boolean(window.EXMHostedMode);
  const states = ['draft', 'scheduled', 'registration_open', 'live', 'completed', 'canceled', 'archived'];
  const kinds = ['gaming', 'community', 'stream', 'residency', 'screening', 'in_person', 'other'];
  const choices = items => items.map(item => [item, pretty(item)]);
  const utc = value => value ? value + 'Z' : null;

  function appendLink(parent, href, label) {
    if (!href) return;
    const parsed = new URL(href);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return;
    const link = el('a', label + ' ↗', 'text-link');
    link.href = parsed.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const paragraph = el('p');
    paragraph.append(link);
    parent.append(paragraph);
  }

  function task(parent, label, callback) {
    const note = el('p');
    note.setAttribute('role', 'status');
    parent.append(note);
    const run = async (button, values) => {
      if (button.disabled) return;
      button.disabled = true;
      note.textContent = 'Working…';
      try {
        note.textContent = (await callback(values)) || 'Saved.';
      } catch (error) {
        note.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
    return label ? formFor(parent, label, run) : run;
  }

  function useValue(form, title, name, value, options = null, type = 'text', required = true) {
    const input = field(form, title, name, options, type);
    input.required = required;
    if (value != null) input.value = value;
    return input;
  }

  function resultCard(result) {
    const card = el('article', null, 'platform-card');
    card.append(el('p', 'LOCAL TEST RESULT · ' + result.stage, 'kicker'));
    card.append(el('h3', result.winner === 'left' ? result.left : result.right));
    card.append(el('p', result.left + ' ' + result.leftScore + '–' + result.rightScore + ' ' + result.right));
    if (result.tie) card.append(el('p', 'Tiebreak: ' + result.tie));
    if (result.championship) card.append(el('p', 'Preview champion', 'champion-mark'));
    return card;
  }

  function eventCard(event) {
    const card = el('article', null, 'platform-card');
    card.append(el('p', (hosted ? '' : 'LOCAL PREVIEW · ') + pretty(event.status), 'kicker'));
    card.append(el('h3', event.name), el('p', event.description));
    if (event.startsAt) card.append(el('p', 'Starts ' + event.startsAt.replace('T', ' ').replace(/:00(?:\.000)?Z$/, ' UTC')));
    if (event.rules) card.append(el('p', event.rules));
    if (event.format && event.format !== 'open') card.append(el('p', 'Format: ' + event.format));
    if (!hosted && ['live', 'completed'].includes(event.status)) {
      const results = el('div');
      const loadMatches = task(card, null, async () => {
        const { items } = await api('matches?id=' + encodeURIComponent(event.id));
        results.replaceChildren(...items.map(resultCard));
        return items.length ? 'Published preview results loaded.' : 'No results published yet.';
      });
      card.append(actionButton('Show published test results', loadMatches), results);
    }
    appendLink(card, event.link, 'Event website');
    if (['scheduled', 'registration_open'].includes(event.status)) {
      appendLink(card, event.interest, 'Express interest');
      appendLink(card, event.registration, 'Register externally');
    }
    if (['scheduled', 'registration_open', 'live'].includes(event.status)) {
      appendLink(card, event.rsvp, 'RSVP');
      appendLink(card, event.tickets, 'Tickets');
    }
    appendLink(card, event.stream, event.status === 'live' ? 'Watch live' : 'Broadcast');
    appendLink(card, event.replay, 'Watch replay');
    appendLink(card, event.recap, 'Results and recap');
    const now = Date.now();
    if (event.status === 'registration_open' && (!event.opensAt || Date.parse(event.opensAt) <= now)
        && (!event.closesAt || Date.parse(event.closesAt) > now)) {
      const { form, finish } = task(card, hosted ? 'Submit application' : 'Submit test application', async values => {
        await api('apply', { event: event.id, ...values });
        form.reset();
        return hosted ? 'Application received. EXM staff will review your submission.' :
          'Test interest received. Staff review decides placement.';
      });
      if (hosted) form.append(el('p', 'EXM event staff use your contact details to review this application. Share only the information this form asks for.'));
      field(form, hosted ? 'Display name' : 'Test display name', 'name').maxLength = 80;
      const email = field(form, hosted ? 'Contact email' : 'Synthetic contact ending in .test', 'contact', null, 'email');
      email.maxLength = 254;
      if (event.question) field(form, event.question, 'answer').maxLength = 600;
      finish();
    }
    return card;
  }

  async function showPublicBoard(id, endpoint, render) {
    const section = byId(id);
    if (!section) return;
    try {
      const { items } = await api(endpoint);
      if (!items.length) return;
      section.querySelector('.platform-grid').append(...items.map(render));
      section.hidden = false;
    } catch {
      // The public archive and existing update feed do not depend on member APIs.
    }
  }

  function noticeCard(item) {
    const card = el('article', null, 'platform-card');
    if (item.pinned) card.append(el('p', 'PINNED', 'kicker'));
    card.append(el('h3', item.name), el('p', item.description));
    if (item.event) {
      const link = el('a', 'Related EXM event', 'text-link');
      link.href = 'events.html#event-' + encodeURIComponent(item.event);
      card.append(link);
    }
    appendLink(card, item.link, 'Announcement link');
    return card;
  }

  async function access() {
    const data = await api('access');
    const target = byId('gate-content');
    const cards = data.scopes.map(scope => {
      const card = el('article', null, 'platform-card');
      card.append(el('h3', scope.title));
      if (scope.granted) {
        const run = task(card, null, async () => {
          const result = await api('protected?scope=' + encodeURIComponent(scope.slug));
          return result.body;
        });
        card.append(actionButton('Open protected preview', run));
      } else {
        const { form, finish } = task(card, 'Unlock preview studio', async ({ code }) => {
          await api('unlock', { scope: scope.slug, code });
          await access();
        });
        const input = field(form, 'Single-use access code', 'code', null, 'password');
        input.maxLength = 32;
        input.autocomplete = 'off';
        finish();
      }
      return card;
    });
    const claim = el('article', null, 'platform-card');
    claim.append(el('h3', 'Verified legacy claim'));
    if (data.legacy) claim.append(el('p', 'Linked test identity: ' + data.legacy));
    else {
      const { form, finish } = task(claim, 'Claim test identity', async values => {
        await api('claim', values);
        await access();
      });
      field(form, 'Test identity key', 'legacy').maxLength = 45;
      const code = field(form, 'Single-use claim code', 'code', null, 'password');
      code.maxLength = 32;
      code.autocomplete = 'off';
      finish();
    }
    target.replaceChildren(...cards, claim);
  }

  function codesCard(data) {
    const card = el('article', null, 'platform-card');
    card.append(el('h3', 'Temporary access and claims'), el('p',
      'Use synthetic identities. Issued codes appear once here and expire after 24 hours. Keep them in the isolated preview.'));
    const accessCode = task(card, 'Issue access code', async values => {
      const { code } = await api('issue_access', { scope: 'preview-studio', ...(values.username ? { username: values.username } : {}) });
      return 'One-time studio code: ' + code;
    });
    useValue(accessCode.form, 'Bind to member handle (optional)', 'username', '', null, 'text', false);
    accessCode.finish();

    const reserve = task(card, 'Reserve verified test identity', async values => {
      await api('legacy_reserve', { ...values, verified: values.verified === 'yes' });
      return 'Test identity reserved. Refresh staff tools before issuing a claim.';
    });
    field(reserve.form, 'Test identity key starting with test-', 'legacy').maxLength = 45;
    field(reserve.form, 'Synthetic display name', 'name').maxLength = 80;
    field(reserve.form, 'Fixture ownership confirmed', 'verified', [['no', 'Confirm verification'], ['yes', 'Verified test identity']]);
    reserve.finish();

    const unclaimed = data.legacy.filter(item => !item.claimed);
    if (unclaimed.length) {
      const claim = task(card, 'Issue claim code', async values => {
        const { code } = await api('issue_claim', values);
        return 'One-time claim code: ' + code;
      });
      field(claim.form, 'Reserved test identity', 'legacy', unclaimed.map(item => [item.slug, item.name]));
      field(claim.form, 'Verified recipient handle', 'username').maxLength = 24;
      claim.finish();
    }
    return card;
  }

  function editorCard(item, type, rebuild) {
    const old = item?.draft || {};
    const id = item?.id || crypto.randomUUID();
    const eventEditor = type === 'event';
    const card = el('article', null, 'platform-card');
    card.append(el('h3', item ? old.name : (eventEditor ? (hosted ? 'New event' : 'New test event') : 'New preview announcement')));
    if (item) card.append(el('p', item.archived ? 'Archived' : item.published ? (hosted ? 'Published' : 'Published in local preview') : 'Draft'));
    const { form, finish } = task(card, eventEditor ? 'Save event draft' : 'Save announcement draft', async values => {
      const dates = eventEditor ? { startsAt: utc(values.startsAt), opensAt: utc(values.opensAt), closesAt: utc(values.closesAt) }
        : { publishAt: utc(values.publishAt), expiresAt: utc(values.expiresAt) };
      const extra = eventEditor ? { capacity: values.capacity ? Number(values.capacity) : null }
        : { event: values.event || null, pinned: values.pinned === 'true' };
      await api(type + '_save', { ...values, ...dates, ...extra, id });
      await rebuild();
    });
    useValue(form, 'Name', 'name', old.name).maxLength = 80;
    useValue(form, 'Description', 'description', old.description).maxLength = 600;
    useValue(form, 'External HTTPS link', 'link', old.link, null, 'url', false);
    if (eventEditor) {
      useValue(form, 'Template', 'kind', old.kind || 'community', choices(kinds));
      useValue(form, 'Competition format', 'format', old.format || 'open', choices(['open', 'solo', 'duo']));
      useValue(form, 'Event status', 'status', old.status || 'draft', choices(states));
      const capacity = useValue(form, 'Capacity (optional)', 'capacity', old.capacity, null, 'number', false);
      capacity.min = 1;
      capacity.max = 500;
      if (!old.capacity) capacity.value = '';
      for (const [title, name] of [['Starts (UTC)', 'startsAt'], ['Registration opens (UTC)', 'opensAt'], ['Registration closes (UTC)', 'closesAt']]) {
        useValue(form, title, name, old[name]?.slice(0, 16), null, 'datetime-local', false);
      }
      useValue(form, 'Eligibility and rules', 'rules', old.rules, null, 'text', false).maxLength = 600;
      useValue(form, 'Application question', 'question', old.question, null, 'text', false).maxLength = 200;
      useValue(form, 'Broadcast URL', 'stream', old.stream, null, 'url', false);
      useValue(form, 'Recap or results URL', 'recap', old.recap, null, 'url', false);
      for (const [label, key] of [['Interest form', 'interest'], ['External registration', 'registration'],
        ['RSVP', 'rsvp'], ['Tickets', 'tickets'], ['Replay', 'replay']]) {
        useValue(form, label + ' URL', key, old[key], null, 'url', false);
      }
    } else {
      useValue(form, 'Pinned', 'pinned', String(Boolean(old.pinned)), [['false', 'No'], ['true', 'Yes']]);
      useValue(form, 'Related event ID (optional)', 'event', old.event, null, 'text', false);
      useValue(form, 'Publish at (UTC)', 'publishAt', old.publishAt?.slice(0, 16), null, 'datetime-local', false);
      useValue(form, 'Expires at (UTC)', 'expiresAt', old.expiresAt?.slice(0, 16), null, 'datetime-local', false);
    }
    finish();
    if (item) {
      const details = el('details');
      details.append(el('summary', 'Preview saved draft'), el('p', old.name), el('p', old.description), el('p', 'Record ID: ' + id));
      if (eventEditor) details.append(el('p', 'Status: ' + pretty(old.status)));
      card.append(details);
      const publish = task(card, null, async () => { await api(type + '_publish', { id }); await rebuild(); });
      card.append(actionButton(hosted ? 'Publish saved event' : 'Publish saved draft to preview', publish));
      if (!eventEditor && !item.archived) {
        const archive = task(card, null, async () => { await api('notice_archive', { id }); await rebuild(); });
        card.append(actionButton('Archive announcement', archive));
      }
    }
    return card;
  }

  async function applications(target, id) {
    const { items } = await api('applications?id=' + encodeURIComponent(id));
    const records = items.map(record => {
      const card = el('article', null, 'platform-card');
      card.append(el('h4', record.display_name), el('p', record.contact), el('p', record.answer));
      const { form, finish } = task(card, 'Save review', async values => {
        await api('application_review', { event: id, id: record.id, status: values.status });
        return 'Review saved.';
      });
      useValue(form, 'Application status', 'status', record.status, choices(['pending', 'approved', 'waitlisted', 'declined']));
      finish();
      return card;
    });
    target.replaceChildren(...records);
    if (!records.length) target.append(el('p', hosted ? 'No applications received.' : 'No test applications received.'));
  }

  async function scoring(panel, event, owner) {
    const { items } = await api('match_drafts?id=' + encodeURIComponent(event));
    const render = (item = null) => {
      const old = item?.draft || {};
      const id = item?.id || crypto.randomUUID();
      const card = el('section', null, 'platform-card');
      card.append(el('h4', item ? old.stage : 'Record test match'));
      const edit = task(card, 'Save scoring draft', async values => {
        await api('match_save', { ...values, id, event, position: Number(values.position),
          leftScore: Number(values.leftScore), rightScore: Number(values.rightScore),
          championship: values.championship === 'true' });
        await scoring(panel, event, owner);
      });
      for (const [label, name, value] of [
        ['Round or stage', 'stage', old.stage], ['Left test entrant or team', 'left', old.left],
        ['Right test entrant or team', 'right', old.right],
      ]) useValue(edit.form, label, name, value);
      const position = useValue(edit.form, 'Display order', 'position', old.position ?? 1, null, 'number');
      position.min = 1;
      position.max = 100;
      for (const side of ['left', 'right']) {
        const score = useValue(edit.form, pretty(side) + ' score', side + 'Score', old[side + 'Score'] ?? 0, null, 'number');
        score.max = 999;
        score.step = 'any';
      }
      useValue(edit.form, 'Winner', 'winner', old.winner || 'left', choices(['left', 'right']));
      useValue(edit.form, 'Tiebreak note (required for ties)', 'tie', old.tie, null, 'text', false).maxLength = 180;
      useValue(edit.form, 'Championship match', 'championship', String(Boolean(old.championship)), [['false', 'No'], ['true', 'Yes']]);
      edit.finish();
      if (owner && item) {
        const publish = task(card, null, async () => {
          await api('match_publish', { id, event });
          await scoring(panel, event, owner);
        });
        if (item.published) card.append(el('p', 'A score is published in the local preview.'));
        card.append(actionButton('Publish verified test score', publish));
      }
      return card;
    };
    panel.replaceChildren(render(), ...items.map(render));
  }

  async function campaignStudio(rebuild) {
    const data = await api('campaign_studio');
    const card = el('article', null, 'platform-card');
    card.append(el('h3', 'Featured event and member spotlight'));
    const pending = Boolean(data.revision > data.publishedRevision);
    card.append(el('p', pending ? 'Saved draft awaiting approval.' : 'Editorial preview is up to date.'));
    const draft = task(card, 'Save editorial draft', async values => {
      await api('editorial_save', { revision: data.revision, event: values.event || null,
        creator: values.creator || null, description: values.description.trim() });
      await rebuild();
    });
    useValue(draft.form, 'Featured campaign', 'event', data.draft.event || '', [
      ['', 'Official SongWars campaign'], ...data.events.map(event => [event.id, event.name]),
    ], 'text', false);
    useValue(draft.form, 'Creator spotlight', 'creator', data.draft.creator || '', [
      ['', 'Official community spotlight'], ...data.creators.map(person => [person.slug, person.name]),
    ], 'text', false);
    useValue(draft.form, 'Spotlight description (optional)', 'description', data.draft.description, null, 'text', false).maxLength = 180;
    draft.finish();
    if (pending) {
      const featured = data.events.find(event => event.id === data.draft.event);
      const creator = data.creators.find(person => person.slug === data.draft.creator);
      const details = el('details');
      details.append(el('summary', 'Review saved editorial draft'),
        el('p', 'Campaign: ' + (featured?.name || 'Official SongWars campaign')),
        el('p', 'Spotlight: ' + (creator?.name || 'Official community spotlight')));
      if (data.draft.description) details.append(el('p', data.draft.description));
      card.append(details);
      const publish = task(card, null, async () => {
        await api('editorial_publish', { revision: data.revision });
        await rebuild();
      });
      card.append(actionButton('Publish saved editorial draft to preview', publish));
    }
    const view = el('a', 'View homepage in this preview', 'text-link');
    view.href = 'index.html';
    const footer = el('p');
    footer.append(view);
    card.append(footer);
    return card;
  }

  async function studio(owner, canReview, canScore) {
    const data = await api('studio');
    const target = byId('operations-tools');
    const rebuild = () => studio(owner, canReview, canScore);
    const group = el('div', null, 'platform-grid hub-grid');
    const children = [el('h3', 'Events and applications')];
    if (owner) group.append(editorCard(null, 'event', rebuild));
    for (const event of data.events) {
      const card = owner ? editorCard(event, 'event', rebuild) : el('article', null, 'platform-card');
      if (!owner) card.append(el('h3', event.draft.name), el('p', event.draft.description));
      if (canReview) {
        const list = el('div');
        const review = task(card, null, async () => { await applications(list, event.id); return 'Applications loaded.'; });
        card.append(actionButton(hosted ? 'Review applications' : 'Review test applications', review), list);
      }
      if (canScore && !hosted) {
        const scoringPanel = el('div');
        const openScoring = task(card, null, async () => { await scoring(scoringPanel, event.id, owner); return 'Scoring drafts loaded.'; });
        card.append(actionButton('Open scoring and corrections', openScoring), scoringPanel);
      }
      if (owner) {
        const assign = task(card, 'Assign event permissions', async values => {
          await api('event_assign', { event: event.id, ...values });
          return 'Event assignment saved.';
        });
        field(assign.form, 'Appointed staff handle', 'username');
        field(assign.form, 'Event role', 'role', choices(['event_staff', 'judge']));
        assign.finish();
      }
      group.append(card);
    }
    if (!data.events.length && !owner) group.append(el('p', 'No events assigned to this account.'));
    children.push(group);
    if (owner && hosted) {
      const claims = el('article', null, 'platform-card');
      claims.append(el('h3', 'Verified roster claims'),
        el('p', 'Confirm ownership through EXM’s approved contact before linking an accepted invitation.'));
      const { form, finish } = task(claims, 'Link verified invite', async values => {
        await api('roster_link', values);
        form.reset();
        return 'The invited account is linked to its roster profile.';
      });
      field(form, 'Roster handle', 'handle').maxLength = 24;
      field(form, 'Verified invitation email', 'email', null, 'email').maxLength = 254;
      finish();
      children.push(claims);
    }
    if (owner && !hosted) {
      children.unshift(await campaignStudio(rebuild));
      const notices = el('div', null, 'platform-grid hub-grid');
      notices.append(editorCard(null, 'notice', rebuild), ...data.notices.map(item => editorCard(item, 'notice', rebuild)));
      children.push(el('h3', 'Announcements'), notices, codesCard(data));
    }
    if (owner && (!hosted || window.EXMHostedMode === 'members')) {
      const recovery = el('article', null, 'platform-card');
      recovery.append(el('h3', 'Recovery references'),
        el('p', 'Verify account ownership through the Auth provider before approving any password reset.'));
      for (const item of data.recovery) {
        const row = el('div');
        row.append(el('p', '@' + item.username + ' · ' + date(item.created_at) + ' · ' + item.reference));
        const review = task(row, null, async () => { await api('recovery_review', { id: item.reference }); await rebuild(); });
        row.append(actionButton('Mark reference reviewed', review));
        recovery.append(row);
      }
      if (!data.recovery.length) recovery.append(el('p', 'No open references.'));
      children.push(recovery);
    }
    target.replaceChildren(...children);
  }

  window.EXMMemberOperations = { access, studio };
  showPublicBoard('event-board', 'events', item => {
    const card = eventCard(item);
    card.id = 'event-' + item.id;
    return card;
  });
  showPublicBoard('notice-board', 'notices', noticeCard);
  showPublicBoard('preview-champions', 'preview_champions', resultCard);
})();
