import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handleMemberRequest } from '../server/member-api.mjs';

const env = process.env;
for (const variable of ['EXM_MEMBER_AUTH_URL', 'EXM_MEMBER_DATA_URL']) {
  const target = new URL(env[variable]);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), variable + ' must be local');
}
const runId = randomBytes(5).toString('hex');
const origin = 'https://exm.test';
const password = 'Local member test password';
const [first, second] = ['one', 'two'].map(tag => ({
  email: tag + '-' + runId + '@example.test',
  username: tag + '-' + runId,
  password,
  confirmPassword: password,
}));

function call(action, { payload, cookie, testOrigin = origin, ip = '192.0.2.' + (parseInt(runId.slice(0, 2), 16) % 247 + 1) } = {}) {
  const headers = { Origin: testOrigin, 'CF-Connecting-IP': ip };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const request = new Request(origin + '/api/members/' + action, {
    method: payload === undefined ? 'GET' : 'POST', headers, body: JSON.stringify(payload),
  });
  return handleMemberRequest(request, env);
}

assert.equal((await call('session')).status, 401);
assert.equal((await call('signup', { payload: first, testOrigin: 'https://other.test' })).status, 403);
assert.equal((await call('signup', { payload: { ...first, confirmPassword: 'mismatch' } })).status, 400);
assert.equal((await call('signup', { payload: { ...first, password: 'ü'.repeat(40), confirmPassword: 'ü'.repeat(40) } })).status, 400);

const created = await call('signup', { payload: first });
assert.equal(created.status, 202);
const conflict = await call('signup', { payload: { ...second, username: first.username.toUpperCase() } });
assert.equal(conflict.status, 202);
const duplicateEmail = await call('signup', { payload: { ...second, email: first.email.toUpperCase() } });
assert.equal(duplicateEmail.status, 202);
assert.equal(await created.text(), await conflict.text());
const login = await call('login', { payload: first });
assert.equal(login.status, 200);
assert.equal(login.headers.get('cache-control'), 'no-store');
const sessionCookie = login.headers.get('set-cookie');
assert.match(sessionCookie, /^__Host-exm_session=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400$/);
const cookie = sessionCookie.split(';')[0];
const loginPayload = await login.json();
assert.deepEqual(Object.keys(loginPayload), ['recoveryCodes']);
const codes = loginPayload.recoveryCodes;
assert.equal(codes.length, 8);
assert.equal(new Set(codes).size, 8);
assert.ok(codes.every(code => /^[a-f0-9]{32}$/.test(code)));

const invalid = await call('login', { payload: { email: first.email, password: 'Wrong password' } });
const unknown = await call('login', { payload: second });
assert.equal(invalid.status, 401);
assert.equal(unknown.status, invalid.status);
assert.equal(await invalid.text(), await unknown.text());
assert.equal(invalid.headers.get('set-cookie'), null);

let response = await call('session', { cookie });
assert.equal(response.status, 200);
const session = (await response.json()).profile;
assert.equal(session.username, first.username);
assert.deepEqual(Object.keys(session).sort(), ['bio', 'discoverable', 'displayName', 'id', 'username']);

const profile = { displayName: 'Local artist', bio: '<b>Treated as text</b>', discoverable: false };
assert.equal((await call('profile', { payload: profile })).status, 401);
assert.equal((await call('profile', { payload: profile, cookie })).status, 200);
response = await call('session', { cookie });
assert.deepEqual((await response.json()).profile, { ...session, ...profile });

const relogin = await call('login', { payload: first });
assert.equal(relogin.status, 200);
assert.deepEqual((await relogin.json()).recoveryCodes, []);
assert.equal((await call('recover', { payload: { username: second.username, code: codes[0] } })).status, 401);
const recovery = { payload: { username: first.username, code: codes[0] } };
const attempts = await Promise.all([call('recover', recovery), call('recover', recovery)]);
assert.deepEqual(attempts.map(result => result.status).sort(), [200, 401]);
const { reference } = await attempts.find(result => result.ok).json();
assert.match(reference, /^[0-9a-f-]{36}$/);

const revoked = await call('logout', { payload: {}, cookie });
assert.equal(revoked.status, 200);
assert.match(revoked.headers.get('set-cookie'), /Max-Age=0$/);
assert.equal((await call('session', { cookie })).status, 401);

for (let attempt = 0; attempt < 9; attempt++) {
  const limited = await call('recover', {
    ip: '192.0.2.249',
    payload: { username: 'rate-' + runId, code: 'f'.repeat(32) },
  });
  assert.equal(limited.status, attempt < 8 ? 401 : 429);
}

const publicRpc = await fetch(env.EXM_MEMBER_DATA_URL + '/rpc/exm_member_session', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + env.EXM_MEMBER_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_token: '0'.repeat(64) }),
});
assert.ok([401, 403, 404].includes(publicRpc.status), 'Anon cannot access the member session RPC');

const directSignup = await fetch(env.EXM_MEMBER_AUTH_URL + '/signup', {
  method: 'POST',
  headers: { apikey: env.EXM_MEMBER_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'bypass-' + runId + '@example.test', password }),
});
assert.ok([400, 401, 403, 422].includes(directSignup.status), 'Public signup is disabled');

console.log('PASS: local Auth + Postgres signup, duplicate handling, profile, permission and session checks, concurrent one-time recovery, rate limits and logout.');
