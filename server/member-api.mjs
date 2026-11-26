import { parseAvatar } from './avatar.mjs';

const cookieName = '__Host-exm_session';
const signupCookie = '__Host-exm_signup';
const signupCookieSeconds = 600;
const signupPaths = new Set(['/api/members/signup', '/api/members/signup-verify', '/api/members/signup-complete']);
const emailPattern = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const usernamePattern = /^[a-z0-9][a-z0-9_-]{2,23}$/;
const creativeRoles = new Set([
  'artist', 'producer', 'songwriter', 'photographer', 'filmmaker', 'animator',
  'streamer', 'gamer', 'designer', 'entertainer', 'creator',
]);
const byteEncoder = new TextEncoder();
const cookieAttributes = 'Path=/; Secure; HttpOnly; SameSite=Lax';

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class ProviderError extends Error {
  constructor(status) {
    super('Member provider unavailable');
    this.status = status;
  }
}

const respond = (data, status = 200, headers = {}) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
});
const toHex = buffer => Array.from(new Uint8Array(buffer), byte =>
  byte.toString(16).padStart(2, '0')).join('');
const randomHex = bytes => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async value => toHex(await crypto.subtle.digest('SHA-256', byteEncoder.encode(value)));
const normalizeEmail = email => typeof email === 'string' ? email.trim().toLowerCase() : '';
const normalizeUsername = username => typeof username === 'string' ? username.trim().toLowerCase() : '';

function readCookie(request, name = cookieName) {
  const cookies = request.headers.get('Cookie')?.split(';') ?? [];
  return cookies.map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(name + '='))?.slice(name.length + 1) ?? '';
}

async function readBody(request, maxBytes = 4096) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
    throw new RequestError(415, 'Send a JSON request.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Request body is required.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let json = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new RequestError(413, 'Request is too large.');
      json += decoder.decode(value, { stream: true });
    }
    const data = JSON.parse(json + decoder.decode());
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch (error) {
    if (error instanceof RequestError) throw error;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  throw new RequestError(400, 'Invalid request body.');
}

function validEmail(value) {
  const email = normalizeEmail(value);
  if (email.length > 254 || !emailPattern.test(email)) {
    throw new RequestError(400, 'Enter an email address.');
  }
  return email;
}

export function signupRehearsalEmail(env, mode = env.EXM_MEMBER_MODE) {
  const email = normalizeEmail(env.EXM_SIGNUP_REHEARSAL_EMAIL);
  return mode === 'members' && email.length <= 254 && emailPattern.test(email) ? email : '';
}

function enrollmentEmail(value, enrollment) {
  if (!enrollment.public && normalizeEmail(value) !== enrollment.rehearsalEmail) {
    throw new RequestError(403, 'Public signup is closed.');
  }
  return validEmail(value);
}

function credentials(body, signup) {
  const email = validEmail(body.email);
  return { email, ...accountCredentials(body, signup) };
}

function accountCredentials(body, signup) {
  const password = typeof body.password === 'string' ? body.password : '';
  const bytes = byteEncoder.encode(password).length;
  if (bytes > 72 || (signup ? [...password].length < 12 : !password)) {
    throw new RequestError(400, 'Enter a password between 12 characters and 72 UTF-8 bytes.');
  }
  const username = normalizeUsername(body.username);
  if (signup) {
    if (password !== body.confirmPassword) throw new RequestError(400, 'The passwords must match.');
    if (!usernamePattern.test(username)) {
      throw new RequestError(400, 'Use 3–24 letters, digits, hyphens or underscores for the username.');
    }
  }
  return { password, username };
}

// Profiles link out to approved platforms. No remote image or media loads on view.
const socialRoots = ['instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'twitch.tv',
  'soundcloud.com', 'spotify.com', 'bandcamp.com', 'vimeo.com', 'github.com', 'behance.net'];
function profileLinks(values) {
  if (values == null) return null;
  if (!Array.isArray(values) || values.length > 3) {
    throw new RequestError(400, 'Use up to three public social or portfolio links.');
  }
  return [...new Set(values.map(value => {
    let url;
    try { if (typeof value === 'string' && value.length <= 400) url = new URL(value); }
    catch {}
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.port ||
        !socialRoots.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) {
      throw new RequestError(400, 'Use HTTPS links from approved social and portfolio sites.');
    }
    return url.href;
  }))];
}

function provider(env) {
  const authURL = env.EXM_MEMBER_AUTH_URL;
  const dataURL = env.EXM_MEMBER_DATA_URL;
  const service = env.EXM_MEMBER_SERVICE_ROLE_KEY;
  const anon = env.EXM_MEMBER_ANON_KEY;
  if (!authURL || !dataURL || !service || !anon || !/^[a-f0-9]{64}$/i.test(env.EXM_MEMBER_PEPPER ?? '')) {
    throw new RequestError(503, 'Member accounts are temporarily unavailable.');
  }
  const signingKey = crypto.subtle.importKey(
    'raw', Uint8Array.from(env.EXM_MEMBER_PEPPER.match(/../g), bytes => parseInt(bytes, 16)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const digest = async (purpose, value) =>
    toHex(await crypto.subtle.sign('HMAC', await signingKey, byteEncoder.encode(purpose + ':' + value)));

  const request = async (base, path, key, payload, method = 'POST') => {
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
    const result = await fetch(base.replace(/\/$/, '') + path, {
      method, redirect: 'manual', signal: AbortSignal.timeout(8000),
      headers,
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    if (!result.ok) throw new ProviderError(result.status);
    const raw = await result.text();
    return raw ? JSON.parse(raw) : null;
  };

  return {
    rpc: (name, parameters = {}) => request(dataURL, '/rpc/exm_member_' + name, service, parameters),
    alias: async email => (await digest('login', email)) + '@members.exclusivemembrs.com',
    digest,
    createAccount: payload => request(authURL, '/admin/users', service, payload),
    readSignupAccount: id => request(authURL, '/admin/users/' + id, service, undefined, 'GET'),
    updateSignupAccount: (id, payload) => request(authURL, '/admin/users/' + id, service, payload, 'PUT'),
    sendSignupCode: (email, confirmed) => confirmed
      ? request(authURL, '/otp', anon, { email, create_user: false })
      : request(authURL, '/resend', anon, { email, type: 'signup' }),
    verifySignupCode: (email, token) => request(authURL, '/verify', anon, { email, token, type: 'email' }),
    signIn: payload => request(authURL, '/token?grant_type=password', anon, payload),
  };
}

async function throttle(db, request, action, principal, limits = [24, 8]) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const buckets = [
    [await db.digest(action + ':ip', ip), limits[0]],
    [await db.digest(action + ':principal', principal), limits[1]],
  ];
  const outcome = await Promise.all(buckets.map(([p_bucket, p_max]) => db.rpc('rate', { p_bucket, p_max })));
  if (!outcome.every(Boolean)) throw new RequestError(429, 'Too many attempts. Try again in about 15 minutes.');
}

export function isLoopback(url) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
}

async function signup(db, request, body) {
  const { email, password, username } = credentials(body, true);
  if (!email.endsWith('.test')) throw new RequestError(403, 'Only test addresses are accepted in this preview.');
  await throttle(db, request, 'signup', email, [6, 8]);
  const alias = await db.alias(email);
  try {
    await db.createAccount({
      email: alias, password, email_confirm: true, app_metadata: { exm_username: username },
    });
  } catch (error) {
    // Signup conflicts, including a username constraint failure reported by
    // Auth as a database error, receive the same response as a valid account.
    if (!(error instanceof ProviderError) || ![400, 409, 422, 500].includes(error.status)) throw error;
  }
  return respond({ message: 'If your account was created, you can sign in to save your one-time recovery codes.' }, 202);
}

function checkSignupAge(birthDate) {
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new RequestError(400, 'Enter a valid date of birth.');
  }
  const date = new Date(birthDate + 'T00:00:00Z');
  const today = new Date().toISOString().slice(0, 10);
  if (!Number.isFinite(date.getTime()) || !date.toISOString().startsWith(birthDate) || birthDate < '1900-01-01' || birthDate > today) {
    throw new RequestError(400, 'Enter a valid date of birth.');
  }
  const minimumBirthday = String(date.getUTCFullYear() + 13).padStart(4, '0') + birthDate.slice(4);
  if (minimumBirthday > today) throw new RequestError(403, 'You must be at least 13 to create an EXM account.');
}

async function beginPublicSignup(db, request, body, enrollment) {
  const email = enrollmentEmail(body.email, enrollment);
  checkSignupAge(body.birthDate);
  if (body.privacyAccepted !== true) throw new RequestError(400, 'Acknowledge the account privacy information to continue.');
  await throttle(db, request, 'public_signup', email, [8, 4]);
  const state = () => db.rpc('public_signup_state', { p_email: email });
  let existing = await state();
  if (existing === 'missing') {
    try {
      await db.createAccount({
        email, password: randomHex(30), email_confirm: false, app_metadata: { exm_registration_pending: true },
      });
    } catch (error) {
      // Handle races and existing addresses without changing their credentials.
      if (!(error instanceof ProviderError) || ![400, 409, 422].includes(error.status)) throw error;
    }
    existing = await state();
  }
  if (existing === 'unconfirmed' || existing === 'confirmed') {
    await db.sendSignupCode(email, existing === 'confirmed');
  }
  return respond({ message: 'Check your inbox for the EXM signup code if your address can be registered. If you already have an account, sign in or use account recovery.' }, 202);
}

async function verifyPublicSignup(db, request, body, enrollment) {
  const email = enrollmentEmail(body.email, enrollment);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!/^\d{6,10}$/.test(code)) throw new RequestError(400, 'Enter the code from your email.');
  await throttle(db, request, 'public_signup_verify', email, [24, 6]);
  if (!['unconfirmed', 'confirmed'].includes(await db.rpc('public_signup_state', { p_email: email }))) {
    throw new RequestError(401, 'This signup code is invalid or expired.');
  }
  let result;
  try {
    result = await db.verifySignupCode(email, code);
  } catch (error) {
    if (error instanceof ProviderError && [400, 401, 403, 422].includes(error.status)) {
      throw new RequestError(401, 'This signup code is invalid or expired.');
    }
    throw error;
  }
  const id = result?.user?.id;
  if (!/^[a-f0-9-]{36}$/.test(id ?? '') || result.user.app_metadata?.exm_registration_pending !== true ||
      result.user.email !== email || !result.user.email_confirmed_at) {
    throw new RequestError(401, 'This signup code is invalid or expired.');
  }
  const scope = enrollment.public ? 'p' : 'r';
  const key = scope + '.' + id + '.' + (Math.floor(Date.now() / 1000) + signupCookieSeconds);
  const token = key + '.' + await db.digest('public_signup_verified', key + ':' + (scope === 'r' ? email : ''));
  return respond({ verified: true }, 200, {
    'Set-Cookie': signupCookie + '=' + token + '; ' + cookieAttributes + '; Max-Age=' + signupCookieSeconds,
  });
}

async function finishPublicSignup(db, request, body, enrollment) {
  const token = readCookie(request, signupCookie);
  const parts = token.match(/^([pr])\.([a-f0-9-]{36})\.(\d{10})\.([a-f0-9]{64})$/);
  const invalidProof = () => new RequestError(401, 'Verify your email again to finish signup.');
  if (!parts || Number(parts[3]) <= Math.floor(Date.now() / 1000)) throw invalidProof();
  const [, scope, id, expires, signature] = parts;
  const rehearsal = scope === 'r';
  if (rehearsal ? !enrollment.rehearsalEmail : !enrollment.public) throw invalidProof();
  const email = rehearsal ? enrollment.rehearsalEmail : '';
  if (rehearsal && body.email !== undefined && normalizeEmail(body.email) !== email) throw invalidProof();
  const expected = await db.digest('public_signup_verified', scope + '.' + id + '.' + expires + ':' + email);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (mismatch) throw invalidProof();
  await throttle(db, request, 'public_signup_finish', id, [24, 8]);
  const { username, password } = accountCredentials(body, true);
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!displayName || [...displayName].length > 60 || /[\u0000-\u001f\u007f]/.test(displayName)) {
    throw new RequestError(400, 'Enter a display name up to 60 characters.');
  }
  try {
    if (rehearsal) {
      const account = await db.readSignupAccount(id);
      if (account?.id !== id || normalizeEmail(account.email) !== email || !account.email_confirmed_at ||
          account.app_metadata?.exm_registration_pending !== true) throw invalidProof();
    }
    await db.updateSignupAccount(id, {
      password, app_metadata: { exm_registration_pending: false, exm_signup_handle: username, exm_signup_name: displayName },
    });
  } catch (error) {
    if (rehearsal && error instanceof ProviderError && error.status === 404) throw invalidProof();
    if (error instanceof ProviderError && [400, 409, 422, 500].includes(error.status)) {
      throw new RequestError(409, 'The account could not be set up with that username. Try another username, or verify your email again if your session expired.');
    }
    throw error;
  }
  return respond({ message: 'Account created. Sign in to save your one-time recovery codes.' }, 201, {
    'Set-Cookie': signupCookie + '=; ' + cookieAttributes + '; Max-Age=0',
  });
}

async function login(db, request, body, hosted, backupCodes) {
  const { email, password } = credentials(body, false);
  await throttle(db, request, 'login', email);
  const authEmail = hosted ? email : await db.alias(email);
  let result;
  try {
    result = await db.signIn({ email: authEmail, password });
  } catch (error) {
    if (error instanceof ProviderError && [400, 401, 403, 422].includes(error.status)) {
      throw new RequestError(401, 'We could not sign you in with those credentials.');
    }
    throw error;
  }
  const accountId = result?.user?.id;
  if (!accountId) throw new ProviderError(502);
  if (hosted && result.user.factors?.some(factor => factor.status === 'verified')) {
    throw new RequestError(403, 'This account requires additional verification. Contact EXM support.');
  }
  const token = randomHex(32);
  const codes = backupCodes ? Array.from({ length: 8 }, () => randomHex(16)) : [];
  const session = { p_id: accountId, p_token: await sha256(token) };
  if (backupCodes) session.p_codes = await Promise.all(codes.map(code => db.digest('recovery', code)));
  const procedure = !hosted ? 'open_session' : backupCodes ? 'open_hosted_session_with_codes' : 'open_hosted_session';
  const issued = await db.rpc(procedure, session);
  if (issued === null) throw new RequestError(401, 'We could not sign you in with those credentials.');
  return respond({ recoveryCodes: issued ? codes : [] }, 200, {
    'Set-Cookie': cookieName + '=' + token + '; ' + cookieAttributes + '; Max-Age=86400',
  });
}

async function recover(db, request, body) {
  const username = normalizeUsername(body.username);
  const code = typeof body.code === 'string' ? body.code.toLowerCase().trim() : '';
  if (!usernamePattern.test(username) || !/^[a-f0-9]{32}$/.test(code)) {
    throw new RequestError(400, 'Enter your username and a 32-character recovery code.');
  }
  await throttle(db, request, 'recover', username);
  const reference = await db.rpc('start_recovery', {
    p_username: username, p_code: await db.digest('recovery', code),
  });
  if (!reference) throw new RequestError(401, 'We could not validate those recovery details.');
  return respond({ reference });
}

export async function handleMemberRequest(request, env) {
  const url = new URL(request.url);
  const available = {
    '/api/members/signup': 'POST', '/api/members/signup-verify': 'POST', '/api/members/signup-complete': 'POST',
    '/api/members/login': 'POST',
    '/api/members/session': 'GET', '/api/members/logout': 'POST',
    '/api/members/profile': 'POST', '/api/members/recover': 'POST',
    '/api/members/directory': 'GET', '/api/members/public-profile': 'GET', '/api/members/follow': 'POST',
    '/api/members/roster-credits': 'GET',
    '/api/members/avatar': 'GET',
  };
  const method = available[url.pathname];
  if (!method) return respond({ error: 'Page not found.' }, 404);
  if (request.method !== method) return respond({ error: 'Method not allowed.' }, 405, { Allow: method });
  if (method === 'POST' && request.headers.get('Origin') !== url.origin) {
    return respond({ error: 'Request origin was not accepted.' }, 403);
  }
  const hosted = env.EXM_HOSTED === true;
  const backupCodes = !hosted || env.EXM_MEMBER_MODE === 'members';
  const fixtureSignup = !hosted && env.EXM_MEMBER_PREVIEW_SIGNUP === 'fixture' && isLoopback(request.url);
  const enrollment = {
    public: hosted && env.EXM_MEMBER_MODE === 'members' && env.EXM_PUBLIC_SIGNUP === 'verified-email',
    rehearsalEmail: hosted ? signupRehearsalEmail(env) : '',
  };
  if (signupPaths.has(url.pathname) && !enrollment.public && !enrollment.rehearsalEmail &&
      !(fixtureSignup && url.pathname === '/api/members/signup')) {
    return respond({ error: 'Public signup is closed.' }, 403);
  }
  if (hosted && !backupCodes && url.pathname === '/api/members/recover') {
    return respond({ error: 'Use the EXM support contact for account assistance.' }, 403);
  }

  try {
    const db = provider(env);
    const path = url.pathname;
    if (path === '/api/members/roster-credits') {
      if (env.EXM_HOSTED !== true) return respond({ error: 'Page not found.' }, 404);
      return respond({ entries: await db.rpc('roster_credits') });
    }
    if (path === '/api/members/signup') {
      const body = await readBody(request);
      return await (fixtureSignup ? signup(db, request, body) : beginPublicSignup(db, request, body, enrollment));
    }
    if (path === '/api/members/signup-verify') return await verifyPublicSignup(db, request, await readBody(request), enrollment);
    if (path === '/api/members/signup-complete') return await finishPublicSignup(db, request, await readBody(request), enrollment);
    if (path === '/api/members/login') return await login(db, request, await readBody(request), hosted, backupCodes);
    if (path === '/api/members/recover') return await recover(db, request, await readBody(request));

    const token = readCookie(request);
    const p_token = /^[a-f0-9]{64}$/.test(token) ? await sha256(token) : null;
    if (path === '/api/members/avatar') {
      const p_username = normalizeUsername(url.searchParams.get('username'));
      if (!usernamePattern.test(p_username)) return respond({ error: 'Avatar unavailable.' }, 404);
      const encoded = await db.rpc('avatar_read', { p_token, p_username });
      if (!encoded) return respond({ error: 'Avatar unavailable.' }, 404);
      return new Response(Uint8Array.from(atob(encoded), byte => byte.charCodeAt(0)), {
        headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff' },
      });
    }
    if (path === '/api/members/directory') {
      const p_query = (url.searchParams.get('q') || '').trim().toLowerCase();
      const p_role = url.searchParams.get('role') || '';
      const p_after = url.searchParams.get('after') || '';
      const p_history = url.searchParams.get('history') || '';
      const p_affiliation = url.searchParams.get('affiliation') || '';
      if (!['', 'champion', 'songwars'].includes(p_history) || !['', 'staff'].includes(p_affiliation) ||
          p_query.length > 60 || p_query.includes('\0') || (p_role && !creativeRoles.has(p_role)) ||
          (p_after && !usernamePattern.test(p_after))) {
        throw new RequestError(400, 'Check the directory search filters.');
      }
      const rows = await db.rpc('roster', { p_query, p_role, p_after, p_history, p_affiliation });
      const profiles = rows.slice(0, 20);
      return respond({ profiles, nextAfter: rows.length > 20 ? profiles.at(-1).username : null });
    }
    if (path === '/api/members/public-profile') {
      const self = url.searchParams.get('view') === 'self';
      const account = self && p_token ? await db.rpc('session', { p_token }) : null;
      if (self && !account) throw new RequestError(401, 'Sign in to view your profile.');
      const p_username = self ? account.username : normalizeUsername(url.searchParams.get('username'));
      if (!usernamePattern.test(p_username)) throw new RequestError(404, 'Profile unavailable.');
      const profile = await db.rpc('public_profile', { p_username, p_viewer: p_token });
      if (!profile) throw new RequestError(404, 'Profile unavailable.');
      return respond({ profile });
    }

    if (!p_token) throw new RequestError(401, 'Sign in to continue.');
    if (path === '/api/members/logout') {
      await db.rpc('close_session', { p_token });
      return respond({ signedOut: true }, 200, {
        'Set-Cookie': cookieName + '=; ' + cookieAttributes + '; Max-Age=0',
      });
    }
    if (path === '/api/members/session') {
      const profile = await db.rpc('session', { p_token });
      if (!profile) throw new RequestError(401, 'Sign in to continue.');
      return respond({ profile });
    }

    const body = await readBody(request, path === '/api/members/profile' ? 73728 : 4096);
    if (path === '/api/members/follow') {
      const p_username = normalizeUsername(body.username);
      if (!usernamePattern.test(p_username) || typeof body.follow !== 'boolean') {
        throw new RequestError(400, 'Check the requested profile.');
      }
      await throttle(db, request, 'follow', p_token, [50, 40]);
      const changed = await db.rpc('set_follow', { p_token, p_username, p_follow: body.follow });
      if (changed === null) throw new RequestError(401, 'Sign in to continue.');
      if (!changed) throw new RequestError(404, 'Follow could not be changed.');
      return respond({ following: body.follow });
    }

    const name = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const bio = typeof body.bio === 'string' ? body.bio.trim() : null;
    const roles = body.creativeRoles ?? [];
    if (!name || [...name].length > 60 || bio === null || [...bio].length > 600 ||
      name.includes('\0') || bio.includes('\0') || typeof body.discoverable !== 'boolean' ||
      !Array.isArray(roles) || roles.length > 8 || roles.some(role => !creativeRoles.has(role))) {
      throw new RequestError(400, 'Check the profile fields and try again.');
    }
    const p_avatar = body.avatar ?? null;
    if (p_avatar !== null && !['initials', 'chrome', 'custom'].includes(p_avatar)) {
      throw new RequestError(400, 'Choose a profile avatar style.');
    }
    if (body.avatarData != null && (p_avatar !== 'custom' || !parseAvatar(body.avatarData))) {
      throw new RequestError(400, 'Upload an optimized still WebP avatar up to 256×256 and 48 KiB.');
    }
    await throttle(db, request, 'profile_save', p_token, [50, 30]);
    const changed = await db.rpc('save_profile', {
      p_token, p_name: name, p_bio: bio, p_visible: body.discoverable,
      p_roles: [...new Set(roles)], p_avatar, p_links: profileLinks(body.links), p_image: body.avatarData ?? null,
    });
    if (!changed) throw new RequestError(401, 'Sign in to continue.');
    if (changed.error === 'image_missing') throw new RequestError(400, 'Choose a photo to use a custom avatar.');
    return respond(changed);
  } catch (error) {
    if (error instanceof RequestError) return respond({ error: error.message }, error.status);
    if (error instanceof ProviderError && error.status === 429) {
      return respond({ error: 'Too many attempts. Try again shortly.' }, 429);
    }
    return respond({ error: 'Member accounts are temporarily unavailable.' }, 503);
  }
}

export { RequestError, ProviderError, provider, readBody, readCookie, respond, sha256, throttle };
