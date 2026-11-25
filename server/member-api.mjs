const cookieName = '__Host-exm_session';
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

function readCookie(request) {
  const cookies = request.headers.get('Cookie')?.split(';') ?? [];
  return cookies.map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(cookieName + '='))?.slice(cookieName.length + 1) ?? '';
}

async function readBody(request) {
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
      if (bytes > 4096) throw new RequestError(413, 'Request is too large.');
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

function credentials(body, signup) {
  const email = normalizeEmail(body.email);
  if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
    throw new RequestError(400, 'Enter an email address.');
  }
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
  return { email, password, username };
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

  const request = async (base, path, key, payload) => {
    const result = await fetch(base.replace(/\/$/, '') + path, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

async function signup(db, request, body) {
  const { email, password, username } = credentials(body, true);
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

async function login(db, request, body) {
  const { email, password } = credentials(body, false);
  await throttle(db, request, 'login', email);
  const alias = await db.alias(email);
  let result;
  try {
    result = await db.signIn({ email: alias, password });
  } catch (error) {
    if (error instanceof ProviderError && [400, 401, 403, 422].includes(error.status)) {
      throw new RequestError(401, 'We could not sign you in with those credentials.');
    }
    throw error;
  }
  const accountId = result?.user?.id;
  if (!accountId) throw new ProviderError(502);
  const token = randomHex(32);
  const codes = Array.from({ length: 8 }, () => randomHex(16));
  const issued = await db.rpc('open_session', {
    p_id: accountId, p_token: await sha256(token),
    p_codes: await Promise.all(codes.map(code => db.digest('recovery', code))),
  });
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
    '/api/members/signup': 'POST', '/api/members/login': 'POST',
    '/api/members/session': 'GET', '/api/members/logout': 'POST',
    '/api/members/profile': 'POST', '/api/members/recover': 'POST',
    '/api/members/directory': 'GET', '/api/members/public-profile': 'GET', '/api/members/follow': 'POST',
  };
  const method = available[url.pathname];
  if (!method) return respond({ error: 'Page not found.' }, 404);
  if (request.method !== method) return respond({ error: 'Method not allowed.' }, 405, { Allow: method });
  if (method === 'POST' && request.headers.get('Origin') !== url.origin) {
    return respond({ error: 'Request origin was not accepted.' }, 403);
  }

  try {
    const db = provider(env);
    const path = url.pathname;
    if (path === '/api/members/signup') return await signup(db, request, await readBody(request));
    if (path === '/api/members/login') return await login(db, request, await readBody(request));
    if (path === '/api/members/recover') return await recover(db, request, await readBody(request));

    const token = readCookie(request);
    const p_token = /^[a-f0-9]{64}$/.test(token) ? await sha256(token) : null;
    if (path === '/api/members/directory') {
      const p_query = (url.searchParams.get('q') || '').trim().toLowerCase();
      const p_role = url.searchParams.get('role') || '';
      const p_after = url.searchParams.get('after') || '';
      if (p_query.length > 60 || p_query.includes('\0') || (p_role && !creativeRoles.has(p_role)) ||
          (p_after && !usernamePattern.test(p_after))) {
        throw new RequestError(400, 'Check the directory search filters.');
      }
      const rows = await db.rpc('directory', { p_query, p_role, p_after });
      const profiles = rows.slice(0, 20);
      return respond({ profiles, nextAfter: rows.length > 20 ? profiles.at(-1).username : null });
    }
    if (path === '/api/members/public-profile') {
      const p_username = normalizeUsername(url.searchParams.get('username'));
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

    const body = await readBody(request);
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
    const changed = await db.rpc('save_profile', {
      p_token, p_display_name: name, p_bio: bio, p_discoverable: body.discoverable, p_roles: [...new Set(roles)],
    });
    if (!changed) throw new RequestError(401, 'Sign in to continue.');
    return respond({ saved: true });
  } catch (error) {
    if (error instanceof RequestError) return respond({ error: error.message }, error.status);
    if (error instanceof ProviderError && error.status === 429) {
      return respond({ error: 'Too many attempts. Try again shortly.' }, 429);
    }
    return respond({ error: 'Member accounts are temporarily unavailable.' }, 503);
  }
}
