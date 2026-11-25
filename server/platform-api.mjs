import {
  RequestError, ProviderError, provider, readBody, readCookie, respond, sha256, throttle,
  isLoopback, handleMemberRequest,
} from './member-api.mjs';

const views = new Set(['dashboard', 'rankings', 'public_progress', 'rewards', 'feed', 'moderation', 'owner', 'blocked_members']);
const actions = new Set(['check_in', 'redeem', 'equip', 'unequip', 'post', 'like', 'report',
  'moderate', 'award', 'rule', 'role', 'catalog', 'season', 'point_adjust', 'set_block']);
const operationViews = new Set(['events', 'notices', 'access', 'protected', 'applications', 'studio']);
const operationActions = new Set(['apply', 'unlock', 'claim', 'issue_access', 'issue_claim', 'legacy_reserve',
  'event_save', 'event_publish', 'event_assign', 'application_review', 'notice_save', 'notice_publish',
  'notice_archive', 'recovery_review']);
const competitionViews = new Set(['matches', 'match_drafts', 'preview_champions']);
const competitionActions = new Set(['match_save', 'match_publish']);
const memberInteractions = new Set(['post', 'like', 'report']);
const editorialViews = new Set(['featured_content', 'campaign_studio']);
const editorialActions = new Set(['editorial_save', 'editorial_publish']);
const hostedOperations = new Set(['events', 'applications', 'studio', 'apply',
  'event_save', 'event_publish', 'event_assign', 'application_review']);
const hostedEventsOnly = new Set(['dashboard', ...hostedOperations]);
const states = new Set(['draft', 'scheduled', 'registration_open', 'live', 'completed', 'canceled', 'archived']);
const eventKinds = new Set(['gaming', 'community', 'stream', 'residency', 'screening', 'in_person', 'other']);
const categories = new Set(['overall', 'artist', 'producer', 'judge', 'spectator', 'creator', 'songwars']);
const periods = new Set(['all', 'season', 'month']);
const rules = new Set(['profile_complete', 'check_in', 'event_participation', 'songwars_participation',
  'battle_win', 'finals', 'championship', 'judging']);
const reasons = new Set(['harassment', 'spam', 'privacy', 'other']);
const usernamePattern = /^[a-z0-9][a-z0-9_-]{2,23}$/;
const slugPattern = /^[a-z0-9-]{3,40}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const errors = {
  signin: [401, 'Sign in to continue.'],
  forbidden: [403, 'Your account does not have permission for this action.'],
  missing: [404, 'This item is unavailable.'],
  unavailable: [409, 'This item cannot be redeemed. Championship badges are earned.'],
  owned: [409, 'You already own this reward.'],
  balance: [409, 'You do not have enough points.'],
  unowned: [403, 'Own the reward before equipping it.'],
  discoverable: [403, 'Enable a public profile in your account before posting to the member feed.'],
  duplicate: [409, 'This verified activity has already been recorded.'],
  stale: [409, 'Another edit was saved. Reopen the campaign studio before changing the draft.'],
  answer: [400, 'Answer the event’s application question before submitting.'],
  capacity: [409, 'This event is at capacity. Keep the applicant on the waitlist.'],
  closed: [409, 'This event or registration is closed. Save an approved status before publishing a draft.'],
  locked: [403, 'The member gate is locked.'],
  invalid_code: [403, 'The code cannot be used for this account and purpose.'],
  self: [403, 'Ask another authorized owner to review awards or roles for your account.'],
};

const valid = (condition, message = 'Check the submitted fields and try again.') => {
  if (!condition) throw new RequestError(400, message);
};
const text = (value, max) => {
  valid(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !value.includes('\0'));
  return value.trim();
};
const matches = (value, expression) => typeof value === 'string' && expression.test(value);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

function optionsFor(view, query) {
  if (view === 'rankings') {
    const page = Number(query.get('page') || 1);
    valid(integer(page, 1, 100), 'Enter a valid ranking page.');
    const category = query.get('category') || 'overall';
    const period = query.get('period') || 'all';
    valid(categories.has(category) && periods.has(period), 'Choose a ranking category and period.');
    return { category, period, page };
  }
  if (view === 'public_progress') {
    const username = query.get('username');
    valid(matches(username, usernamePattern));
    return { username };
  }
  if (view === 'feed' && query.has('before')) {
    const before = query.get('before');
    valid(before.length < 40 && /^\d{4}-\d\d-\d\dT/.test(before) && !Number.isNaN(Date.parse(before)));
    const id = query.get('beforeId');
    valid(id === null || matches(id, uuidPattern));
    return { before, id };
  }
  return {};
}

function payloadFor(action, body) {
  const { id, parent, reward, username, activity, category, reason, role, enabled, decision, liked,
    active, cost, xp, points, key, name } = body;
  switch (action) {
    case 'check_in': return {};
    case 'set_block':
      valid(matches(username, usernamePattern) && typeof body.blocked === 'boolean');
      return { username, blocked: body.blocked };
    case 'redeem':
    case 'equip':
    case 'unequip':
      valid(matches(reward, slugPattern));
      return { reward };
    case 'post':
      valid(matches(id, uuidPattern) && (parent == null || matches(parent, uuidPattern)));
      return { id, parent: parent ?? null, body: text(body.body, 800) };
    case 'like':
      valid(matches(id, uuidPattern) && typeof liked === 'boolean');
      return { id, liked };
    case 'report':
      valid(matches(id, uuidPattern) && reasons.has(reason));
      return { id, reason };
    case 'moderate':
      valid(matches(id, uuidPattern) && ['hide', 'dismiss'].includes(decision));
      return { id, decision };
    case 'award':
      valid(matches(username, usernamePattern) && rules.has(activity) &&
        !['check_in', 'profile_complete'].includes(activity) && categories.has(category));
      return { username, activity, category, source: text(body.source, 90) };
    case 'point_adjust':
      valid(matches(username, usernamePattern) && integer(points, -10000, 10000) && points !== 0);
      return { username, points, source: text(body.source, 90) };
    case 'rule':
      valid(rules.has(activity) && integer(xp, 0, 10000) && integer(points, 0, 10000));
      return { activity, xp, points };
    case 'role':
      valid(matches(username, usernamePattern) && ['moderator', 'event_staff', 'judge'].includes(role) &&
        typeof enabled === 'boolean');
      return { username, role, enabled };
    case 'catalog':
      valid(matches(reward, slugPattern) && typeof active === 'boolean' && integer(cost, 1, 10000));
      return { reward, active, cost };
    case 'season':
      valid(matches(key, /^[a-z0-9-]{1,32}$/));
      return { key, name: text(name, 80) };
  }
}

const optionalText = (value, max) => value == null || value === '' ? null : text(value, max);
const timestamp = value => {
  if (!value) return null;
  valid(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:\.\d+)?Z$/.test(value)
    && !Number.isNaN(Date.parse(value)), 'Use a UTC date and time.');
  return new Date(value).toISOString();
};
const secureLink = value => {
  if (!value) return null;
  let url;
  try { url = new URL(text(value, 500)); }
  catch { throw new RequestError(400, 'Enter a valid HTTPS link.'); }
  valid(url.protocol === 'https:' && !url.username && !url.password, 'Enter a public HTTPS link.');
  return url.href;
};

function operationOptions(view, query) {
  if (view === 'protected') {
    const scope = query.get('scope');
    valid(matches(scope, slugPattern));
    return { scope };
  }
  if (['applications', 'matches', 'match_drafts'].includes(view)) {
    const id = query.get('id');
    valid(matches(id, uuidPattern));
    return { id };
  }
  return {};
}

function operationPayload(action, body, hosted) {
  const { id, event, status, name, legacy, scope, username, code, role } = body;
  if (['event_publish', 'notice_publish', 'notice_archive', 'recovery_review'].includes(action)) {
    valid(matches(id, uuidPattern));
    return { id };
  }
  switch (action) {
    case 'editorial_save':
    case 'editorial_publish': {
      const { revision, creator, description } = body;
      valid(integer(revision, 0, 2147483646));
      if (action === 'editorial_publish') return { revision };
      valid((event == null || matches(event, uuidPattern)) && (creator == null || matches(creator, slugPattern)));
      return { revision, event: event ?? null, creator: creator ?? null, description: creator ? optionalText(description, 180) : null };
    }
    case 'match_publish':
      valid(matches(id, uuidPattern) && matches(event, uuidPattern));
      return { id, event };
    case 'match_save': {
      const { stage, position, leftScore, rightScore, winner, championship } = body;
      const validScore = score => typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 999;
      valid(matches(id, uuidPattern) && matches(event, uuidPattern) && integer(position, 1, 100) &&
        validScore(leftScore) && validScore(rightScore) && ['left', 'right'].includes(winner) &&
        typeof championship === 'boolean');
      const tie = optionalText(body.tie, 180);
      valid(leftScore === rightScore ? tie !== null : winner === (leftScore > rightScore ? 'left' : 'right'),
        'The winner must match the higher score. Ties require a recorded tiebreak.');
      return { id, event, position, stage: text(stage, 60), leftScore, rightScore, winner, championship, tie,
        left: text(body.left, 80), right: text(body.right, 80) };
    }
    case 'event_save': {
      const { kind, capacity } = body;
      const format = body.format || 'open';
      valid(matches(id, uuidPattern) && eventKinds.has(kind) && states.has(status) && ['open', 'solo', 'duo'].includes(format) &&
        (capacity == null || integer(capacity, 1, 500)), 'Choose an event type, status and valid capacity.');
      const opensAt = timestamp(body.opensAt);
      const closesAt = timestamp(body.closesAt);
      valid(!opensAt || !closesAt || opensAt < closesAt, 'Registration close must come after opening.');
      return {
        id, kind, format, status, name: text(name, 80), description: text(body.description, 600), capacity: capacity ?? null,
        startsAt: timestamp(body.startsAt), opensAt, closesAt, link: secureLink(body.link),
        stream: secureLink(body.stream), recap: secureLink(body.recap),
        interest: secureLink(body.interest), registration: secureLink(body.registration),
        rsvp: secureLink(body.rsvp), tickets: secureLink(body.tickets), replay: secureLink(body.replay),
        rules: optionalText(body.rules, 600), question: optionalText(body.question, 200),
      };
    }
    case 'apply': {
      valid(matches(event, uuidPattern));
      const contact = text(body.contact, 254).toLowerCase();
      if (hosted) valid(/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(contact) && !contact.endsWith('.test'),
        'Enter a valid contact email.');
      else valid(/^[^\s@]+@[^\s@]+\.test$/.test(contact), 'Use a synthetic email ending in .test for this preview.');
      return { event, name: text(name, 80), contact, answer: optionalText(body.answer, 600) || '' };
    }
    case 'application_review':
      valid(matches(event, uuidPattern) && matches(id, uuidPattern) &&
        ['pending', 'approved', 'waitlisted', 'declined'].includes(status));
      return { event, id, status };
    case 'event_assign':
      valid(matches(event, uuidPattern) && matches(username, usernamePattern) && ['event_staff', 'judge'].includes(role));
      return { event, username, role };
    case 'notice_save': {
      valid(matches(id, uuidPattern) && typeof body.pinned === 'boolean' && (event == null || matches(event, uuidPattern)));
      const publishAt = timestamp(body.publishAt);
      const expiresAt = timestamp(body.expiresAt);
      valid(!publishAt || !expiresAt || publishAt < expiresAt, 'Expiry must come after publication.');
      return { id, event: event ?? null, pinned: body.pinned, name: text(name, 80),
        description: text(body.description, 600), publishAt, expiresAt, link: secureLink(body.link) };
    }
    case 'unlock':
    case 'issue_access':
      valid(matches(scope, slugPattern) && (action === 'unlock' ? matches(code, /^[0-9a-f]{32}$/i)
        : (username == null || matches(username, usernamePattern))), 'Check the access code and scope.');
      return action === 'unlock' ? { scope, code: code.toLowerCase() } : { scope, ...(username == null ? {} : { username }) };
    case 'claim':
    case 'issue_claim':
    case 'legacy_reserve':
      valid(matches(legacy, /^test-[a-z0-9-]{1,40}$/), 'Use a test- legacy identity in the preview.');
      if (action === 'claim') {
        valid(matches(code, /^[0-9a-f]{32}$/i), 'Enter a valid claim code.');
        return { legacy, code: code.toLowerCase() };
      }
      if (action === 'issue_claim') {
        valid(matches(username, usernamePattern));
        return { legacy, username };
      }
      valid(body.verified === true, 'Confirm that this test identity was verified.');
      return { legacy, name: text(name, 80) };
  }
}

function domainResponse(result) {
  if (!result?.error) return respond(result);
  const [status, message] = errors[result.error] || [503, 'The platform is temporarily unavailable.'];
  return respond({ error: message }, status);
}

export async function handlePlatformRequest(request, env) {
  const url = new URL(request.url);
  const name = url.pathname.slice('/api/platform/'.length);
  const hosted = env.EXM_HOSTED === true;
  if (hosted && ((env.EXM_MEMBER_MODE === 'events' && !hostedEventsOnly.has(name)) ||
      ((operationViews.has(name) || operationActions.has(name) || editorialViews.has(name) || editorialActions.has(name) ||
        competitionViews.has(name) || competitionActions.has(name)) && !hostedOperations.has(name)))) {
    return respond({ error: 'Page not found.' }, 404);
  }
  const reading = request.method === 'GET' && (views.has(name) || operationViews.has(name) || competitionViews.has(name) || editorialViews.has(name));
  const writing = request.method === 'POST' && (actions.has(name) || operationActions.has(name) || competitionActions.has(name) || editorialActions.has(name));
  if (!reading && !writing) return respond({ error: 'Page not found.' }, 404);
  if (writing && request.headers.get('Origin') !== url.origin) {
    return respond({ error: 'Request origin was not accepted.' }, 403);
  }
  try {
    const db = provider(env);
    const cookie = readCookie(request);
    const p_token = matches(cookie, /^[a-f0-9]{64}$/) ? await sha256(cookie) : null;
    if (reading) {
      if (name === 'feed') {
        const cursor = optionsFor(name, url.searchParams);
        return domainResponse(await db.rpc('feed_visible', {
          p_token, p_before: cursor.before ?? null, p_before_id: cursor.id ?? null,
        }));
      }
      if (name === 'blocked_members') {
        const after = url.searchParams.get('after') || '';
        valid(after === '' || matches(after, usernamePattern));
        return domainResponse(await db.rpc('block_list', { p_token, p_after: after }));
      }
      const editorial = editorialViews.has(name);
      const competition = competitionViews.has(name);
      const operations = editorial || competition || operationViews.has(name);
      const reader = editorial ? 'editorial_read' : competition ? 'competition_read' : operations ? 'operations_read' : 'platform_read';
      return domainResponse(await db.rpc(reader, {
        p_token, p_view: name,
        p_options: operations ? operationOptions(name, url.searchParams) : optionsFor(name, url.searchParams),
      }));
    }
    if (operationActions.has(name) || competitionActions.has(name) || editorialActions.has(name)) {
      if (!hosted && (env.EXM_PREVIEW_CONSOLE !== '1' || !isLoopback(request.url))) return domainResponse({ error: 'forbidden' });
      if (!p_token && name !== 'apply') return domainResponse({ error: 'signin' });
      const operation = operationPayload(name, await readBody(request, name === 'event_save' ? 8192 : 4096), hosted);
      const sensitive = ['unlock', 'claim', 'apply'].includes(name);
      await throttle(db, request, 'operation:' + name, p_token || operation.contact, sensitive ? [32, 7] : [120, 60]);
      const issuance = ['issue_access', 'issue_claim'].includes(name);
      const issued = issuance ? Array.from(crypto.getRandomValues(new Uint8Array(16)),
        byte => byte.toString(16).padStart(2, '0')).join('') : null;
      const raw = issued || operation.code;
      if (raw) {
        const purpose = operation.scope ? 'scope:' + operation.scope : 'claim:' + operation.legacy;
        operation.hash = await db.digest(purpose, raw);
        delete operation.code;
      }
      const writer = editorialActions.has(name) ? 'editorial_write'
        : competitionActions.has(name) ? 'competition_write' : 'operations_write';
      const result = await db.rpc(writer, {
        p_token, p_action: name, p_payload: operation,
      });
      return issued && !result?.error ? respond({ ...result, code: issued }) : domainResponse(result);
    }
    if (!p_token) return domainResponse({ error: 'signin' });
    const p_payload = payloadFor(name, await readBody(request));
    await throttle(db, request, 'platform:' + name, p_token, [160, 60]);
    if (name === 'set_block') {
      return domainResponse(await db.rpc('set_block', { p_token, p_username: p_payload.username, p_block: p_payload.blocked }));
    }
    const writer = memberInteractions.has(name) ? 'interaction_write' : 'platform_write';
    return domainResponse(await db.rpc(writer, { p_token, p_action: name, p_payload }));
  } catch (error) {
    if (error instanceof RequestError) return respond({ error: error.message }, error.status);
    if (error instanceof ProviderError && error.status === 429) return respond({ error: 'Too many attempts.' }, 429);
    return respond({ error: 'The platform is temporarily unavailable.' }, 503);
  }
}

export async function handlePreviewLogin(request, env) {
  const url = new URL(request.url);
  if (env.EXM_PREVIEW_CONSOLE !== '1' || !isLoopback(request.url)) return respond({ error: 'Page not found.' }, 404);
  if (request.method === 'GET') return respond({ profiles: ['artist', 'producer', 'moderator', 'owner'] });
  if (request.method !== 'POST' || request.headers.get('Origin') !== url.origin) {
    return respond({ error: 'Request origin was not accepted.' }, 403);
  }
  try {
    const { profile } = await readBody(request);
    valid(['artist', 'producer', 'moderator', 'owner'].includes(profile));
    if (!env.EXM_PREVIEW_PASSWORD) return respond({ error: 'Preview accounts are unavailable.' }, 503);
    const response = await handleMemberRequest(new Request(url.origin + '/api/members/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url.origin,
        'CF-Connecting-IP': request.headers.get('CF-Connecting-IP') || 'local' },
      body: JSON.stringify({ email: 'exm-preview-' + profile + '@example.test', password: env.EXM_PREVIEW_PASSWORD }),
    }), env);
    if (!response.ok) return response;
    return respond({ profile }, 200, { 'Set-Cookie': response.headers.get('Set-Cookie') });
  } catch (error) {
    return respond({ error: error instanceof RequestError ? error.message : 'Preview accounts are unavailable.' },
      error instanceof RequestError ? error.status : 503);
  }
}
