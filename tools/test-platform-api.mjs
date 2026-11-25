import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import app from '../server/member-dev.mjs';
import { isLoopback } from '../server/member-api.mjs';

const env = { ...process.env, EXM_MEMBER_PREVIEW_SIGNUP: 'fixture', EXM_PREVIEW_CONSOLE: '1' };
for (const name of ['EXM_MEMBER_AUTH_URL', 'EXM_MEMBER_DATA_URL']) {
  assert.ok(env[name] && isLoopback(env[name]), 'Only isolated loopback providers are allowed.');
}
const worker = env.EXM_MEMBER_WORKER_ORIGIN;
if (worker) assert.ok(isLoopback(worker), 'Worker must be local.');
const origin = worker ? new URL(worker).origin : 'http://localhost';
const runId = randomBytes(6).toString('hex');
const ip = '198.51.100.' + (parseInt(runId.slice(0, 2), 16) % 247 + 1);
function send(path, { data, cookie, crossOrigin = false, config = env } = {}) {
  const headers = { Origin: crossOrigin ? 'https://unknown.test' : origin, 'CF-Connecting-IP': ip };
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const request = new Request(origin + '/api/' + path, {
    method: data === undefined ? 'GET' : 'POST', headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return worker && config === env ? fetch(request) : app.fetch(request, config);
}

const platform = (action, cookie, data) => send('platform/' + action, { cookie, data });
async function read(action, cookie) {
  const response = await platform(action, cookie);
  assert.equal(response.status, 200, action);
  return response.json();
}
const testAccount = action => ({
  email: action + '-' + runId + '@example.test',
  username: action + '-' + runId,
  password: 'Integration fixture credentials',
  confirmPassword: 'Integration fixture credentials',
});
async function login(account) {
  const create = await send('members/signup', { data: account });
  assert.equal(create.status, 202);
  const result = await send('members/login', { data: account });
  assert.equal(result.status, 200, account.username);
  return result.headers.get('set-cookie').split(';')[0];
}
async function demo(profile) {
  const result = await send('preview/login', { data: { profile } });
  assert.equal(result.status, 200, profile);
  assert.deepEqual(await result.json(), { profile });
  return result.headers.get('set-cookie').split(';')[0];
}

const artistAccount = testAccount('artist');
const producerAccount = testAccount('prod');
assert.equal((await send('members/signup', { data: artistAccount,
  config: { ...env, EXM_MEMBER_PREVIEW_SIGNUP: '' } })).status, 403);
assert.equal((await send('members/signup', { data: { ...artistAccount, email: 'visitor@example.com' } })).status, 403);
assert.equal((await platform('feed')).status, 401);
assert.equal((await platform('check_in', undefined, {})).status, 401);

const [artist, producer] = await Promise.all([login(artistAccount), login(producerAccount)]);
for (const [account, cookie] of [[artistAccount, artist], [producerAccount, producer]]) {
  assert.equal((await send('members/profile', { cookie, data: {
    displayName: account.username, bio: '', discoverable: true,
  } })).status, 200);
}
const owner = await demo('owner');
const moderator = await demo('moderator');
assert.equal((await platform('moderation', artist)).status, 403);
assert.equal((await platform('owner', moderator)).status, 403);
assert.equal((await platform('rule', artist, { activity: 'check_in', xp: 9000, points: 9000 })).status, 403);
assert.equal((await send('platform/check_in', { data: {}, cookie: artist, crossOrigin: true })).status, 403);

const before = await read('dashboard', artist);
const checkIns = await Promise.all([platform('check_in', artist, {}), platform('check_in', artist, {})]);
assert.ok(checkIns.every(result => result.ok));
assert.deepEqual((await Promise.all(checkIns.map(result => result.json()))).map(result => result.awarded).sort(), [false, true]);
const after = await read('dashboard', artist);
assert.equal(after.xp - before.xp, 5);
assert.equal(after.points - before.points, 5);
assert.equal(after.streak, 1);
assert.equal(after.checkedIn, true);

const officialArtist = { username: artistAccount.username, activity: 'event_participation', category: 'artist', source: 'fixture-' + runId };
const officialProd = { ...officialArtist, username: producerAccount.username, category: 'producer' };
assert.equal((await platform('award', owner, officialArtist)).status, 200);
assert.equal((await platform('award', owner, officialProd)).status, 200);
assert.equal((await platform('award', owner, officialArtist)).status, 409);
assert.equal((await platform('award', owner, { ...officialArtist, username: 'preview-owner' })).status, 403);
const artistRank = (await read('rankings?category=artist&period=season')).rows;
const producerRank = (await read('rankings?category=producer&period=month')).rows;
assert.equal(artistRank.find(member => member.username === artistAccount.username).score, 25);
assert.equal(producerRank.find(member => member.username === producerAccount.username).score, 25);
assert.ok(!artistRank.some(member => member.username === producerAccount.username));
assert.ok(!producerRank.some(member => member.username === artistAccount.username));

assert.equal((await platform('equip', artist, { reward: 'signal-frame' })).status, 403);
assert.equal((await platform('redeem', artist, { reward: 'champion-badge' })).status, 409);
const spending = await Promise.all(['signal-frame', 'chrome-frame'].map(reward => platform('redeem', artist, { reward })));
assert.deepEqual(spending.map(result => result.status).sort(), [200, 409]);
const selected = ['signal-frame', 'chrome-frame'][spending.findIndex(result => result.ok)];
assert.equal((await platform('redeem', artist, { reward: selected })).status, 409);
assert.equal((await platform('equip', artist, { reward: selected })).status, 200);
const inventory = await read('rewards', artist);
const equipped = inventory.items.find(item => item.slug === selected);
assert.equal(equipped.owned, true);
assert.equal(equipped.equipped, true);
assert.equal(inventory.points, 30 - equipped.cost);
const profile = await read('public_progress?username=' + artistAccount.username);
assert.equal(profile.xp, 30);
assert.equal(profile.points, undefined);
assert.equal(profile.equipped.frame.name, equipped.name);
assert.equal((await platform('unequip', artist, { reward: selected })).status, 200);
assert.equal((await platform('award', owner, { ...officialProd, activity: 'championship', source: 'TEST result ' + runId })).status, 200);
assert.ok((await read('rewards', producer)).items.find(item => item.slug === 'champion-badge').owned);

const post = { id: randomUUID(), body: '<span>Plain text test ' + runId + '</span>' };
assert.equal((await platform('post', artist, post)).status, 200);
assert.equal((await platform('post', artist, post)).status, 200);
const comment = { id: randomUUID(), parent: post.id, body: 'A local test comment' };
assert.equal((await platform('post', producer, comment)).status, 200);
assert.equal((await platform('like', producer, { id: post.id, liked: true })).status, 200);
assert.equal((await platform('like', producer, { id: post.id, liked: true })).status, 200);
const feed = (await read('feed', artist)).items.filter(item => item.id === post.id);
assert.equal(feed.length, 1);
assert.equal(feed[0].body, post.body);
assert.equal(feed[0].likes, 1);
assert.equal(feed[0].comments[0].id, comment.id);
assert.equal((await send('members/follow', { cookie: artist, data: { username: producerAccount.username, follow: true } })).status, 200);
assert.equal((await send('members/follow', { cookie: producer, data: { username: artistAccount.username, follow: true } })).status, 200);
const artistBlock = { username: producerAccount.username, blocked: true };
assert.equal((await platform('set_block', undefined, artistBlock)).status, 401);
assert.equal((await platform('set_block', artist, { username: artistAccount.username, blocked: true })).status, 404);
assert.equal((await platform('set_block', artist, artistBlock)).status, 200);
assert.equal((await platform('set_block', artist, artistBlock)).status, 200);
assert.deepEqual((await read('blocked_members', artist)).members, [producerAccount.username]);
assert.deepEqual((await read('blocked_members', producer)).members, []);
assert.ok(!(await read('feed', producer)).items.some(item => item.id === post.id));
const afterBlock = (await read('feed', artist)).items.find(item => item.id === post.id);
assert.equal(afterBlock.likes, 0);
assert.equal(afterBlock.comments.length, 0);
assert.equal((await platform('post', producer, { ...comment, id: randomUUID() })).status, 404);
assert.equal((await platform('like', producer, { id: post.id, liked: true })).status, 404);
assert.equal((await send('members/follow', { cookie: producer, data: { username: artistAccount.username, follow: true } })).status, 404);
const publicIdentity = 'members/public-profile?username=' + producerAccount.username;
const signedProfile = (await (await send(publicIdentity, { cookie: artist })).json()).profile;
const anonymousProfile = (await (await send(publicIdentity)).json()).profile;
assert.equal(signedProfile.blockedByViewer, true);
assert.equal(signedProfile.canFollow, false);
assert.equal(signedProfile.following, 0);
assert.equal(anonymousProfile.blockedByViewer, false);
assert.equal((await platform('set_block', artist, { ...artistBlock, blocked: false })).status, 200);
assert.ok((await read('feed', producer)).items.some(item => item.id === post.id));
assert.equal((await (await send(publicIdentity, { cookie: artist })).json()).profile.isFollowing, false);

assert.equal((await platform('report', producer, { id: post.id, reason: 'spam' })).status, 200);
assert.equal((await platform('moderate', artist, { id: post.id, decision: 'hide' })).status, 403);
assert.ok((await read('moderation', moderator)).items.some(item => item.id === post.id));
assert.equal((await platform('moderate', moderator, { id: post.id, decision: 'hide' })).status, 200);
assert.ok(!(await read('feed', artist)).items.some(item => item.id === post.id));
assert.ok((await read('owner', owner)).audit.some(entry => entry.subject === post.id));

assert.equal((await platform('protected?scope=preview-studio', artist)).status, 403);
assert.equal((await platform('issue_access', artist, { scope: 'preview-studio' })).status, 403);
const issued = await platform('issue_access', owner, { scope: 'preview-studio', username: artistAccount.username });
assert.equal(issued.status, 200);
const unlock = { scope: 'preview-studio', code: (await issued.json()).code };
assert.equal((await platform('unlock', producer, unlock)).status, 403);
assert.equal((await platform('unlock', artist, { ...unlock, code: randomBytes(16).toString('hex') })).status, 403);
assert.equal((await platform('unlock', artist, unlock)).status, 200);
assert.equal((await platform('unlock', artist, unlock)).status, 403);
assert.ok((await read('protected?scope=preview-studio', artist)).body.includes('protected test studio'));
assert.equal((await platform('protected?scope=preview-studio', producer)).status, 403);

const legacy = 'test-' + runId;
const reserve = { legacy, name: 'TEST · Archive participant', verified: true };
assert.equal((await platform('legacy_reserve', artist, reserve)).status, 403);
assert.equal((await platform('legacy_reserve', owner, { ...reserve, verified: false })).status, 400);
assert.equal((await platform('legacy_reserve', owner, reserve)).status, 200);
const issueClaim = await platform('issue_claim', owner, { legacy, username: artistAccount.username });
assert.equal(issueClaim.status, 200);
const claim = { legacy, code: (await issueClaim.json()).code };
assert.equal((await platform('claim', producer, claim)).status, 403);
assert.equal((await platform('claim', artist, claim)).status, 200);
assert.equal((await platform('claim', artist, claim)).status, 403);
assert.equal((await read('access', artist)).legacy, reserve.name);

const draft = {
  id: randomUUID(), name: 'TEST · Creator workshop ' + runId, description: 'Synthetic registration.',
  kind: 'community', status: 'draft', capacity: 1, question: 'What are you making?',
};
assert.equal((await platform('event_save', owner, draft)).status, 200);
assert.equal((await platform('event_publish', owner, { id: draft.id })).status, 409);
assert.ok(!(await read('events')).items.some(item => item.id === draft.id));
assert.equal((await platform('event_save', owner, { ...draft, status: 'registration_open' })).status, 200);
assert.ok(!(await read('events')).items.some(item => item.id === draft.id));
assert.equal((await platform('event_publish', owner, { id: draft.id })).status, 200);
assert.ok((await read('events')).items.some(item => item.id === draft.id));
const application = { event: draft.id, name: 'TEST · Guest one', contact: 'guest-one-' + runId + '@example.test', answer: 'Test answer' };
assert.equal((await platform('apply', undefined, application)).status, 200);
assert.equal((await platform('apply', undefined, application)).status, 200);
assert.equal((await platform('apply', undefined, { ...application, name: 'TEST · Guest two', contact: 'guest-two-' + runId + '@example.test' })).status, 200);
assert.equal((await platform('applications?id=' + draft.id, producer)).status, 403);
const applications = (await read('applications?id=' + draft.id, owner)).items;
assert.equal(applications.length, 2);
assert.ok(!(JSON.stringify(await read('events'))).includes(application.contact));
const staffRole = { username: producerAccount.username, role: 'event_staff', enabled: true };
assert.equal((await platform('role', owner, staffRole)).status, 200);
assert.equal((await platform('applications?id=' + draft.id, producer)).status, 403);
assert.equal((await platform('event_assign', owner, { ...staffRole, event: draft.id })).status, 200);
const decisions = await Promise.all(applications.map(item =>
  platform('application_review', producer, { event: draft.id, id: item.id, status: 'approved' })));
assert.deepEqual(decisions.map(result => result.status).sort(), [200, 409]);
const waitlisted = applications[decisions.findIndex(result => !result.ok)];
assert.equal((await platform('application_review', producer, { event: draft.id, id: waitlisted.id, status: 'waitlisted' })).status, 200);
assert.equal((await platform('apply', undefined, { ...application, name: 'TEST · Guest three', contact: 'guest-three-' + runId + '@example.test' })).status, 200);

const phase = { ...draft, status: 'completed', format: 'duo' };
assert.equal((await platform('event_save', owner, phase)).status, 200);
assert.equal((await platform('event_publish', owner, { id: draft.id })).status, 200);
const match = { id: randomUUID(), event: draft.id, position: 1, championship: true, stage: 'Final',
  left: 'TEST · Left duo', right: 'TEST · Right duo', leftScore: 42.5, rightScore: 42.5, winner: 'right' };
assert.equal((await platform('match_save', owner, match)).status, 400, 'A tie needs a decision record');
const scoring = { ...match, tie: 'Synthetic tiebreak decision' };
assert.equal((await platform('match_save', producer, scoring)).status, 403, 'Application review does not grant judging');
assert.equal((await platform('role', owner, { ...staffRole, role: 'judge' })).status, 200);
assert.equal((await platform('event_assign', owner, { ...staffRole, role: 'judge', event: draft.id })).status, 200);
assert.equal((await platform('match_save', producer, scoring)).status, 200);
assert.ok(!(await read('matches?id=' + draft.id)).items.length);
assert.equal((await platform('match_publish', producer, { id: match.id, event: draft.id })).status, 403);
assert.equal((await platform('match_publish', owner, { id: match.id, event: draft.id })).status, 200);
assert.equal((await read('matches?id=' + draft.id)).items[0].winner, 'right');
assert.ok((await read('preview_champions')).items.some(row => row.id === match.id));
assert.equal((await platform('match_save', owner, { ...scoring, leftScore: 44, winner: 'left' })).status, 200);
assert.equal((await read('matches?id=' + draft.id)).items[0].winner, 'right', 'Draft corrections remain private');
assert.equal((await platform('match_publish', owner, { id: match.id, event: draft.id })).status, 200);
assert.equal((await read('matches?id=' + draft.id)).items[0].winner, 'left');

const notice = { id: randomUUID(), name: 'TEST · Preview announcement ' + runId, description: 'Pinned fixture', pinned: true, event: draft.id };
assert.equal((await platform('notice_save', owner, notice)).status, 200);
assert.ok(!(await read('notices')).items.some(item => item.id === notice.id));
assert.equal((await platform('notice_publish', owner, { id: notice.id })).status, 200);
assert.ok((await read('notices')).items.some(item => item.id === notice.id && item.pinned));
assert.equal((await platform('notice_archive', owner, { id: notice.id })).status, 200);
assert.ok(!(await read('notices')).items.some(item => item.id === notice.id));
const pointsBefore = await read('dashboard', artist);
const adjustment = { username: artistAccount.username, points: -1, source: 'fixture-correction-' + runId };
assert.equal((await platform('point_adjust', owner, adjustment)).status, 200);
assert.equal((await platform('point_adjust', owner, adjustment)).status, 409);
const corrected = await read('dashboard', artist);
assert.equal(corrected.xp, pointsBefore.xp);
assert.equal(corrected.points, pointsBefore.points - 1);

const editorial = await read('campaign_studio', owner);
const editorialPayload = { revision: editorial.revision, event: draft.id, creator: 'vantiva', description: 'Isolated test spotlight' };
assert.equal((await platform('campaign_studio', moderator)).status, 403);
assert.equal((await platform('editorial_save', artist, editorialPayload)).status, 403);
assert.equal((await platform('editorial_save', owner, { ...editorialPayload, creator: 'unverified-person' })).status, 404);
const publishedBeforeEdit = await read('featured_content');
assert.equal((await platform('editorial_save', owner, editorialPayload)).status, 200);
assert.deepEqual(await read('featured_content'), publishedBeforeEdit);
assert.equal((await platform('editorial_save', owner, editorialPayload)).status, 409);
assert.equal((await platform('editorial_publish', owner, { revision: editorial.revision })).status, 409);
const saved = await read('campaign_studio', owner);
assert.equal((await platform('editorial_publish', owner, { revision: saved.revision })).status, 200);
const featured = await read('featured_content');
assert.equal(featured.campaign.id, draft.id);
assert.equal(featured.creator.slug, 'vantiva');
assert.equal(featured.creator.description, editorialPayload.description);
const fallback = { revision: saved.revision, event: null, creator: null, description: '' };
assert.equal((await platform('editorial_save', owner, fallback)).status, 200);
assert.equal((await platform('editorial_publish', owner, { revision: saved.revision + 1 })).status, 200);
assert.deepEqual(await read('featured_content'), { campaign: null, creator: null });

const unauthorizedRpc = await fetch(env.EXM_MEMBER_DATA_URL + '/rpc/exm_member_platform_write', {
  method: 'POST', headers: { Authorization: 'Bearer ' + env.EXM_MEMBER_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_token: null, p_action: 'award', p_payload: officialArtist }),
});
assert.ok([401, 403, 404].includes(unauthorizedRpc.status));
console.log('PASS: local sessions, closed public signup, role boundaries, duplicate check-ins, category isolation, concurrent spending, inventory and earned-only badge, moderated feed, scoped gates and claims, event preview and concurrent application decisions, scoring and corrections, notices, privacy blocks, owner-only campaign drafts, audit and database ACLs.');
