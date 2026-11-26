import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import app from '../server/production.mjs';
import { isLoopback, provider } from '../server/member-api.mjs';

const env = { ...process.env, EXM_MEMBER_MODE: 'events' };
for (const name of ['EXM_MEMBER_AUTH_URL', 'EXM_MEMBER_DATA_URL']) {
  assert.ok(env[name] && isLoopback(env[name]), 'Only run against the local fixture.');
}
assert.equal(env.EXM_PREVIEW_DB_CONTAINER, 'exm-integrated-fixture-pg');
assert.equal(env.EXM_PREVIEW_DB_NAME, 'exm_fixture');
env.ASSETS = { async fetch(request) {
  const path = new URL(request.url).pathname;
  const file = path === '/' ? '/index.html' : path.includes('.') ? path : path + '.html';
  const data = await readFile(new URL('../dist' + file, import.meta.url)).catch(() => null);
  return new Response(data, { status: data ? 200 : 404 });
} };
const origin = 'https://exclusivemembrs.com';
const suffix = randomBytes(6).toString('hex');
const password = 'Isolated hosted workflow test ' + suffix;
const ip = '192.0.2.' + (parseInt(suffix.slice(0, 2), 16) % 247 + 1);
const send = (path, { data, cookie, mode = 'events', host = origin, requestOrigin = origin } = {}) =>
  app.fetch(new Request(host + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Origin: requestOrigin, Cookie: cookie || '', 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: data === undefined ? undefined : JSON.stringify(data),
  }), { ...env, EXM_MEMBER_MODE: mode });
const platform = (path, options) => send('/api/platform/' + path, options);
const members = (path, options) => send('/api/members/' + path, options);

assert.equal((await send('/account', { mode: 'off' })).status, 404);
assert.equal((await platform('events', { mode: 'off' })).status, 404);
assert.equal((await send('/', { mode: 'off' })).status, 200);
assert.equal((await send('/__exm/account')).status, 404);
assert.equal((await send('/api/preview/login')).status, 404);
assert.equal((await send('/api/exm-mode.js', { host: 'https://unrelated.invalid' })).status, 404);
assert.equal((await send('/account', { host: 'https://www.exclusivemembrs.com' })).headers.get('Location'), origin + '/account');
const page = await send('/account');
assert.equal(page.headers.get('X-Robots-Tag'), 'noindex, nofollow');
assert.doesNotMatch(await page.text(), /Preview test accounts|Create a test account/);
assert.doesNotMatch(await (await send('/member-account.js')).text(), /api\/preview\/login|test-fixture/);
assert.equal((await members('signup', { data: {} })).status, 403);
assert.equal((await members('recover', { data: {} })).status, 403);

const db = provider(env);
const handles = ['host-owner-' + suffix, 'host-artist-' + suffix];
const accounts = await Promise.all(handles.map(username =>
  db.createAccount({ email: username + '@example.com', password, email_confirm: true })));
for (const account of accounts) assert.match(account.id, /^[a-f0-9-]{36}$/);
const localSql = sql => execFileSync('docker', ['exec', '-i', env.EXM_PREVIEW_DB_CONTAINER, 'psql',
  '-U', 'postgres', '-d', env.EXM_PREVIEW_DB_NAME, '-v', 'ON_ERROR_STOP=1', '-q'], { input: sql });
localSql(`insert into exm_member.profiles(id,username,display_name) values
  ('${accounts[0].id}','${handles[0]}','Rehearsal owner'), ('${accounts[1].id}','${handles[1]}','Rehearsal artist');
  insert into exm_member.staff(profile_id,role) values ('${accounts[0].id}','owner');`);
async function login(username) {
  const response = await members('login', { data: { email: username + '@example.com', password } });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), { recoveryCodes: [] });
  assert.match(response.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Lax/);
  return response.headers.get('Set-Cookie').split(';')[0];
}
const [owner, ordinary] = await Promise.all(handles.map(login));
const event = { id: randomUUID(), name: 'Rehearsal event', description: 'Isolated database', kind: 'community',
  status: 'registration_open', capacity: 1, interest: 'https://example.com/interest', question: 'Why apply?' };
assert.equal((await platform('event_save', { cookie: ordinary, data: event })).status, 403);
assert.equal((await platform('event_save', { cookie: owner, data: event, requestOrigin: 'https://bad.invalid' })).status, 403);
assert.equal((await platform('event_save', { cookie: owner, data: event })).status, 200);
assert.ok(!(await (await platform('events')).json()).items.some(item => item.id === event.id));
assert.equal((await platform('studio', { cookie: owner })).status, 200);
assert.equal((await platform('studio', { cookie: ordinary })).status, 403);
assert.equal((await platform('event_publish', { cookie: owner, data: { id: event.id } })).status, 200);
const application = { event: event.id, name: 'Rehearsal applicant', contact: 'local-' + suffix + '@example.com', answer: 'To learn.' };
assert.equal((await platform('apply', { data: application })).status, 200);
assert.equal((await platform('apply', { data: application })).status, 200);
const review = 'applications?id=' + event.id;
assert.equal((await platform(review)).status, 401);
assert.equal((await platform(review, { cookie: ordinary })).status, 403);
const stored = (await (await platform(review, { cookie: owner })).json()).items;
assert.equal(stored.length, 1);
assert.equal(stored[0].contact, application.contact);
assert.equal((await platform('application_review', { cookie: owner,
  data: { event: event.id, id: stored[0].id, status: 'approved' } })).status, 200);
assert.equal((await (await platform(review, { cookie: owner })).json()).items[0].status, 'approved');
assert.ok(!(await (await platform('events')).text()).includes(application.contact));
assert.equal((await platform('check_in', { cookie: ordinary, data: {} })).status, 404);

const mode = 'members';
const newLogin = await members('login', { mode, data: { email: handles[1] + '@example.com', password } });
assert.equal(newLogin.status, 200);
const { recoveryCodes } = await newLogin.json();
assert.equal(recoveryCodes.length, 8);
const backup = { mode, data: { username: handles[1], code: recoveryCodes[0] } };
const [firstRecovery, usedCode] = await Promise.all([members('recover', backup), members('recover', backup)]);
assert.deepEqual([firstRecovery.status, usedCode.status].sort(), [200, 401]);
assert.equal((await members('profile', { mode, cookie: ordinary, data: {
  displayName: 'Rehearsal artist', bio: '', discoverable: true, creativeRoles: ['artist'],
} })).status, 200);
assert.equal((await platform('check_in', { mode, cookie: ordinary, data: {} })).status, 200);
assert.equal((await platform('award', { mode, cookie: owner, data: {
  username: handles[1], activity: 'event_participation', category: 'artist', source: event.id,
} })).status, 200);
const ranking = async category => (await (await platform('rankings?category=' + category, { mode })).json()).rows;
assert.ok((await ranking('artist')).some(row => row.username === handles[1] && row.score === 25));
assert.ok(!(await ranking('producer')).some(row => row.username === handles[1]));
for (const action of ['redeem', 'equip']) {
  assert.equal((await platform(action, { mode, cookie: ordinary, data: { reward: 'signal-frame' } })).status, 200);
}
assert.ok((await (await platform('rewards', { mode, cookie: ordinary })).json()).items
  .some(item => item.slug === 'signal-frame' && item.owned && item.equipped));
assert.equal((await platform('owner', { mode, cookie: ordinary })).status, 403);
const standings = await ranking('artist');
assert.ok(standings.every(row => Array.isArray(row.titles) && typeof row.champion === 'boolean'));
assert.equal((await members('signup', { mode, data: {} })).status, 403);
localSql("insert into exm_member.award_rules values ('first_bio',3,4),('first_avatar',5,6) on conflict do nothing;");
const photo = 'UklGRi4AAABXRUJQVlA4ICIAAABQAQCdASoQABAAAUAmJQBOgCgAAP74I2+pW/XRVki3AAAA';
const profileEdit = { displayName:'Rehearsal artist', bio:'Profile save fixture.', creativeRoles:['artist'],
  discoverable:false, avatar:'custom' };
assert.equal((await members('profile', { mode, cookie:ordinary, data:{ ...profileEdit, avatarData:'aW52YWxpZA==' } })).status, 400);
assert.equal((await members('profile', { mode, cookie:ordinary, data:profileEdit })).status, 400);
const savedPhoto = await members('profile', { mode, cookie:ordinary, data:{ ...profileEdit, avatarData:photo } });
assert.equal(savedPhoto.status, 200);
const profileResult = await savedPhoto.json();
assert.deepEqual(profileResult.awards, ['first_bio','first_avatar']);
const repeatedEdit = await members('profile', { mode, cookie:ordinary, data:{ ...profileEdit, avatarData:photo } });
const repeatedResult = await repeatedEdit.json();
assert.deepEqual(repeatedResult.awards, []);
assert.equal(repeatedResult.progress.points, profileResult.progress.points);
assert.equal(repeatedResult.progress.xp, profileResult.progress.xp);
const profilePath = 'public-profile?username=' + handles[1];
const selfPath = 'public-profile?view=self';
assert.equal((await members(profilePath, { mode })).status, 404);
assert.equal((await members(profilePath, { mode, cookie:owner })).status, 404);
assert.equal((await members(selfPath, { mode })).status, 401);
for (const path of [selfPath, profilePath]) {
  const response = await members(path, { mode, cookie:ordinary });
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  const { profile } = await response.json();
  assert.equal(profile.isSelf, true);
  assert.equal(profile.publiclyVisible, false);
  assert.equal(profile.username, handles[1]);
  assert.equal(profile.bio, profileEdit.bio);
  assert.equal(profile.founder, false);
  assert.ok(!Object.hasOwn(profile, 'email'));
}
const avatarPath = 'avatar?username=' + handles[1];
assert.equal((await members(avatarPath, { mode })).status, 404);
assert.equal((await members(avatarPath, { mode, cookie:owner })).status, 404);
const ownAvatar = await members(avatarPath, { mode, cookie:ordinary });
assert.equal(ownAvatar.headers.get('Content-Type'), 'image/webp');
assert.equal(Buffer.from(await ownAvatar.arrayBuffer()).toString('base64'), photo);
assert.equal((await members('profile', { mode, cookie:ordinary, data:{ ...profileEdit, discoverable:true } })).status, 200);
assert.equal((await members(avatarPath, { mode })).status, 200);
const publicProfile = (await (await members(profilePath, { mode })).json()).profile;
assert.equal(publicProfile.isSelf, false);
assert.ok(!Object.hasOwn(publicProfile, 'publiclyVisible'));
const freshSignIn = await members('login', { mode, data:{ email:handles[1] + '@example.com', password } });
assert.equal(freshSignIn.status, 200);
const freshSession = await members('session', { mode, cookie:freshSignIn.headers.get('Set-Cookie').split(';')[0] });
assert.equal((await freshSession.json()).profile.avatar, 'custom');
console.log('PASS: isolated production Worker routes, session cookies, publish and review, application privacy, signup and recovery gates, category rankings, redemption and equip.');
