import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { isLoopback } from '../server/member-api.mjs';
import worker from '../server/production.mjs';

const env = { ...process.env, EXM_MEMBER_RELEASE: '', EXM_MEMBER_MODE: 'members', EXM_PUBLIC_SIGNUP: 'verified-email' };
for (const name of ['EXM_MEMBER_AUTH_URL', 'EXM_MEMBER_DATA_URL', 'EXM_SIGNUP_TEST_INBOX']) {
  assert.ok(env[name] && isLoopback(env[name]), name + ' must use the isolated local fixture.');
}
const origin = 'https://exclusivemembrs.com';
const run = randomBytes(5).toString('hex');
const ip = '198.51.100.' + (Number.parseInt(run.slice(0, 2), 16) % 254 + 1);
const email = 'scope-signup-' + run + '@example.test';
const username = 'signup-' + run;
const password = 'Local signup test only ' + run + '!';
const request = (path, body, cookie, config = env, requestOrigin = origin) =>
  worker.fetch(new Request(origin + '/api/members/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Origin: requestOrigin, 'CF-Connecting-IP': ip, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), config);

for (const path of ['signup', 'signup-verify', 'signup-complete']) {
  assert.equal((await request(path, {}, null, { ...env, EXM_PUBLIC_SIGNUP: '' })).status, 403);
  assert.equal((await request(path, {}, null, { ...env, EXM_MEMBER_MODE: 'events' })).status, 403);
}
assert.equal((await request('signup', {}, null, env, 'https://friend.example.test')).status, 403);
const underageDate = new Date();
underageDate.setUTCFullYear(underageDate.getUTCFullYear() - 12);
assert.equal((await request('signup', { email, birthDate: underageDate.toISOString().slice(0, 10), privacyAccepted: true })).status, 403);
assert.equal((await request('signup', { email, birthDate: '2010-02-31', privacyAccepted: true })).status, 400);
assert.equal((await request('signup', { email, birthDate: '2000-01-02' })).status, 400);
assert.equal((await request('signup-complete', {})).status, 401);
assert.equal((await request('signup-verify', { email, code: 'bad-code' })).status, 400);

const birthdayAt13 = new Date();
const originalMonth = birthdayAt13.getUTCMonth();
birthdayAt13.setUTCFullYear(birthdayAt13.getUTCFullYear() - 13);
if (birthdayAt13.getUTCMonth() !== originalMonth) birthdayAt13.setUTCDate(0);
const enrollment = { email, birthDate: birthdayAt13.toISOString().slice(0, 10), privacyAccepted: true };
const signup = await request('signup', enrollment);
assert.equal(signup.status, 202, 'The isolated auth and SMTP services must accept the verification request.');
assert.equal((await request('login', { email, password })).status, 401);
const inbox = new URL(env.EXM_SIGNUP_TEST_INBOX);
inbox.searchParams.set('email', email);
const code = await (await fetch(inbox)).text();
assert.ok(/^\d{6,10}$/.test(code), 'The local inbox must receive a visible one-time email code.');
const verified = await request('signup-verify', { email, code });
assert.equal(verified.status, 200, 'The isolated provider must verify the received signup code.');
assert.deepEqual(await verified.json(), { verified: true });
assert.ok(!((await request('signup-verify', { email, code })).ok), 'An old one-time code cannot be replayed.');
assert.equal((await request('login', { email, password })).status, 401);

// A verified account that loses its enrollment cookie can prove the mailbox
// again. It still has no EXM profile or usable password before completion.
assert.equal((await request('signup', enrollment)).status, 202);
const resumeCode = await (await fetch(inbox)).text();
assert.match(resumeCode, /^\d{6,10}$/);
const resumed = await request('signup-verify', { email, code: resumeCode });
assert.equal(resumed.status, 200);
const cookie = resumed.headers.get('Set-Cookie');
assert.match(cookie, /__Host-exm_signup=.*Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=600/);
const proof = cookie.split(';')[0];
const wrongProof = proof.slice(0, -1) + (proof.endsWith('0') ? '1' : '0');
const fields = { username, displayName: 'Test EXM Artist', password, confirmPassword: password };
assert.equal((await request('signup-complete', fields, wrongProof)).status, 401);
assert.equal((await request('signup-complete', { ...fields, username: 'ybdd' }, proof)).status, 409);
const alternatePassword = password + 'alternate';
const attempts = [fields, { ...fields, password: alternatePassword, confirmPassword: alternatePassword }];
const results = await Promise.all(attempts.map(details => request('signup-complete', details, proof)));
assert.deepEqual(results.map(result => result.status).sort(), [201, 409], 'Signup completion must be single-use under concurrency.');
const setup = results.find(result => result.status === 201);
assert.match(setup.headers.get('Set-Cookie'), /__Host-exm_signup=;.*Max-Age=0/);

const winningPassword = attempts[results.findIndex(result => result.status === 201)].password;
const losingPassword = attempts[results.findIndex(result => result.status === 409)].password;
const replayPassword = password + 'sequential-replay';
const replay = await request('signup-complete', {
  ...fields, password: replayPassword, confirmPassword: replayPassword,
}, proof);
assert.ok(!replay.ok, 'A completed public enrollment must reject even an otherwise unexpired proof.');
assert.equal((await request('login', { email, password: replayPassword })).status, 401);
assert.equal((await request('login', { email, password: losingPassword })).status, 401);
const login = await request('login', { email, password: winningPassword });
assert.equal(login.status, 200);
const { recoveryCodes } = await login.json();
assert.equal(recoveryCodes.length, 8);
const session = login.headers.get('Set-Cookie').split(';')[0];
const sessionResult = await request('session', undefined, session);
const { profile } = await sessionResult.json();
assert.equal(profile.username, username);
assert.equal(profile.displayName, 'Test EXM Artist');
assert.equal(profile.discoverable, false);
assert.ok(!Object.hasOwn(profile, 'birthDate') && !Object.hasOwn(profile, 'email'));
assert.equal((await request('public-profile?username=' + username)).status, 404);
assert.equal((await request('public-profile?view=self', undefined, session)).status, 200);
const second = await request('login', { email, password: winningPassword });
assert.deepEqual(await second.json(), { recoveryCodes: [] });
assert.equal((await request('recover', { username, code: recoveryCodes[0] })).status, 200);
assert.equal((await request('recover', { username, code: recoveryCodes[0] })).status, 401);

const eligibleEmail = 'rehearsal-' + run + '@example.test';
const closed = { ...env, EXM_PUBLIC_SIGNUP: '' };
const rehearsal = { ...closed, EXM_SIGNUP_REHEARSAL_EMAIL: eligibleEmail };
const modeScript = await worker.fetch(new Request(origin + '/api/exm-mode.js'), rehearsal);
const modeBody = await modeScript.text();
assert.equal(modeScript.status, 200);
assert.match(modeBody, /EXMPublicSignup = false; window\.EXMSignupRehearsal = true;/);
assert.ok(!modeBody.includes(eligibleEmail), 'The rehearsal address must stay server-side.');
const declineEmail = 'closed-' + run + '@example.test';
assert.equal((await request('signup', { ...enrollment, email: declineEmail }, null, rehearsal)).status, 403);
assert.equal((await request('signup-verify', { email: declineEmail, code }, null, rehearsal)).status, 403);
assert.equal((await request('signup-complete', fields, proof, rehearsal)).status, 401, 'Public proofs require public enrollment.');
assert.equal((await request('signup', { ...enrollment, email: eligibleEmail }, null, rehearsal)).status, 202);
inbox.searchParams.set('email', eligibleEmail);
const rehearsalCode = await (await fetch(inbox)).text();
assert.match(rehearsalCode, /^\d{6,10}$/);
assert.equal((await request('signup-verify', { email: declineEmail, code: rehearsalCode }, null, rehearsal)).status, 403);
const rehearsalVerified = await request('signup-verify', { email: eligibleEmail, code: rehearsalCode }, null, rehearsal);
assert.equal(rehearsalVerified.status, 200);
const rehearsalProof = rehearsalVerified.headers.get('Set-Cookie').split(';')[0];
const rehearsalFields = { ...fields, username: 'rehearsal-' + run };
assert.equal((await request('signup-complete', rehearsalFields, rehearsalProof, closed)).status, 403);
assert.equal((await request('signup-complete', rehearsalFields, rehearsalProof, env)).status, 401, 'Public enable does not extend removed rehearsal proofs.');
assert.equal((await request('signup-complete', rehearsalFields, rehearsalProof, { ...rehearsal, EXM_SIGNUP_REHEARSAL_EMAIL: declineEmail })).status, 401);
assert.equal((await request('signup-complete', { ...rehearsalFields, email: declineEmail }, rehearsalProof, rehearsal)).status, 401);
assert.equal((await request('signup-complete', rehearsalFields, rehearsalProof.replace('signup=r.', 'signup=p.'), env)).status, 401);
assert.equal((await request('signup-complete', rehearsalFields, rehearsalProof, rehearsal)).status, 201);
assert.ok(!(await request('signup-complete', rehearsalFields, rehearsalProof, rehearsal)).ok, 'A completed rehearsal proof must fail closed.');
const rehearsalLogin = await request('login', { email: eligibleEmail, password }, null, closed);
assert.equal(rehearsalLogin.status, 200, 'A finished account can sign in after rehearsal is removed.');
console.log('PASS: isolated hosted age/consent, email and recovery, concurrent completion, private profiles, and exact-address rehearsal with revoked proofs.');
