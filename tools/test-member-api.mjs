import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handleMemberRequest } from '../server/member-api.mjs';

const env = { ...process.env, EXM_MEMBER_PREVIEW_SIGNUP: 'fixture' };
for (const variable of ['EXM_MEMBER_AUTH_URL', 'EXM_MEMBER_DATA_URL']) {
  const target = new URL(env[variable]);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), variable + ' must be local');
}
const runId = randomBytes(5).toString('hex');
const worker = env.EXM_MEMBER_WORKER_ORIGIN ? new URL(env.EXM_MEMBER_WORKER_ORIGIN) : null;
if (worker) assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(worker.hostname), 'Worker must be local');
const origin = worker?.origin || 'http://localhost';
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
  return worker ? fetch(request) : handleMemberRequest(request, env);
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
assert.deepEqual(Object.keys(session).sort(), ['avatar', 'bio', 'creativeRoles', 'discoverable', 'displayName', 'id', 'links', 'username']);

const profile = {
  displayName: 'Local artist ' + runId, bio: '<b>Treated as text</b>',
  discoverable: false, creativeRoles: ['artist', 'producer'],
};
assert.equal((await call('profile', { payload: profile })).status, 401);
assert.equal((await call('profile', { payload: { ...profile, creativeRoles: ['admin'] }, cookie })).status, 400);
assert.equal((await call('profile', { payload: profile, cookie })).status, 200);
response = await call('session', { cookie });
assert.deepEqual((await response.json()).profile, { ...session, ...profile });

const firstPublic = 'public-profile?username=' + first.username;
const secondPublic = 'public-profile?username=' + second.username;
const directory = 'directory?q=' + runId + '&role=artist';
assert.equal((await call(firstPublic)).status, 404);
assert.deepEqual(await (await call(directory)).json(), { profiles: [], nextAfter: null });
assert.equal((await call('signup', { payload: second })).status, 202);
const secondLogin = await call('login', { payload: second });
assert.equal(secondLogin.status, 200);
const secondCookie = secondLogin.headers.get('set-cookie').split(';')[0];
assert.equal((await call(secondPublic)).status, 404, 'New profiles are private until they opt in');
assert.equal((await call('profile', {
  cookie: secondCookie, payload: { displayName: second.username, bio: '', discoverable: true },
})).status, 200);
const visibleProfile = { ...profile, discoverable: true };
assert.equal((await call('profile', { payload: visibleProfile, cookie })).status, 200);
assert.deepEqual(await (await call(directory)).json(), {
  profiles: [{ username: first.username, displayName: profile.displayName, creativeRoles: profile.creativeRoles, avatar: 'initials' }],
  nextAfter: null,
});
assert.deepEqual(await (await call(directory + '&after=' + first.username)).json(), { profiles: [], nextAfter: null });
const firstDetails = (await (await call(firstPublic)).json()).profile;
assert.equal(firstDetails.canFollow, false);
assert.equal(firstDetails.id, undefined);
assert.equal(firstDetails.email, undefined);
const follow = { username: second.username, follow: true };
assert.equal((await call('follow', { payload: follow })).status, 401);
assert.equal((await call('follow', { payload: { ...follow, username: first.username }, cookie })).status, 404);
const parallelFollows = await Promise.all([call('follow', { payload: follow, cookie }), call('follow', { payload: follow, cookie })]);
assert.ok(parallelFollows.every(result => result.ok));
assert.equal((await (await call(secondPublic)).json()).profile.followers, 1);
assert.equal((await (await call(secondPublic, { cookie })).json()).profile.isFollowing, true);
assert.equal((await (await call(firstPublic, { cookie: secondCookie })).json()).profile.following, 1);
assert.equal((await call('profile', { payload: profile, cookie })).status, 200);
assert.equal((await (await call(secondPublic)).json()).profile.followers, 0);
assert.equal((await call('follow', { payload: { ...follow, follow: false }, cookie })).status, 200);
assert.equal((await call('logout', { payload: {}, cookie: secondCookie })).status, 200);

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

console.log('PASS: local Auth + Postgres signup, duplicate handling, role-filtered discovery, profile privacy, follow/unfollow, permission and session checks, concurrent one-time recovery, rate limits and logout.');
