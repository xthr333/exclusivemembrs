import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { handleMemberRequest, isLoopback } from '../server/member-api.mjs';
import { handlePlatformRequest } from '../server/platform-api.mjs';

const env = { ...process.env, EXM_MEMBER_PREVIEW_SIGNUP: 'fixture' };
for (const name of ['EXM_MEMBER_AUTH_URL', 'EXM_MEMBER_DATA_URL']) {
  assert.ok(env[name] && isLoopback(env[name]), 'Only loopback fixtures are supported.');
}
const password = env.EXM_PREVIEW_PASSWORD;
assert.ok(password?.length >= 16 && password.length <= 64, 'Set a local test password.');
const origin = 'http://localhost';
const headers = { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.253' };
const fixtureNames = ['artist', 'producer', 'moderator', 'owner'];
const accounts = new Map();
async function request(path, data, cookie = '') {
  const input = new Request(origin + '/api/' + path, {
    method: data ? 'POST' : 'GET',
    headers: { ...headers, Cookie: cookie },
    body: data ? JSON.stringify(data) : undefined,
  });
  return (path.startsWith('members/') ? handleMemberRequest : handlePlatformRequest)(input, env);
}

for (const name of fixtureNames) {
  const username = 'preview-' + name;
  const email = 'exm-preview-' + name + '@example.test';
  let login = await request('members/login', { email, password });
  if (login.status === 401) {
    assert.equal((await request('members/signup', { username, email, password, confirmPassword: password })).status, 202);
    login = await request('members/login', { email, password });
  }
  assert.equal(login.status, 200, 'Could not sign in to the local test ' + name);
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  const { profile } = await (await request('members/session', undefined, cookie)).json();
  assert.equal(profile.username, username);
  assert.match(profile.id, /^[0-9a-f-]{36}$/);
  if (profile.displayName === username) {
    const creativeRoles = name === 'artist' || name === 'producer' ? [name] : ['creator'];
    const updated = await request('members/profile', {
      displayName: 'TEST · ' + name[0].toUpperCase() + name.slice(1),
      bio: 'Synthetic EXM preview account used for feature review.',
      creativeRoles, discoverable: ['artist', 'producer'].includes(name),
    }, cookie);
    assert.equal(updated.status, 200);
  }
  accounts.set(name, { id: profile.id, cookie, username });
}

const owner = accounts.get('owner');
const moderator = accounts.get('moderator');
// These named Docker resources belong to the local isolated fixture documented in the handoff.
const dbContainer = env.EXM_PREVIEW_DB_CONTAINER || 'exm-member-pg';
const dbName = env.EXM_PREVIEW_DB_NAME || 'exm_clean';
assert.ok(['exm-integrated-fixture-pg', 'exm-member-pg'].includes(dbContainer), 'Use a named local fixture.');
assert.ok(['exm_fixture', 'exm_clean'].includes(dbName), 'Use a dedicated fixture database.');
execFileSync('docker', ['exec', '-i', dbContainer, 'psql', '-U', 'postgres',
  '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-q'], {
  input: "insert into exm_member.staff(profile_id,role) values ('" + owner.id +
    "','owner'), ('" + moderator.id + "','moderator') on conflict do nothing;\n",
  stdio: ['pipe', 'ignore', 'inherit'],
});
for (const name of ['artist', 'producer']) {
  const result = await request('platform/award', {
    username: accounts.get(name).username, category: name, activity: 'event_participation', source: 'test-fixture-' + name,
  }, owner.cookie);
  assert.ok([200, 409].includes(result.status), 'Fixture activity failed: ' + result.status);
}
console.log('Preview artist, producer, moderator and owner are ready. No account credentials or codes were printed.');
