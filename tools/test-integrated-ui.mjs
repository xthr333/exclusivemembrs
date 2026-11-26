import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { isLoopback } from '../server/member-api.mjs';

const base = process.env.EXM_MEMBER_WORKER_ORIGIN || 'http://127.0.0.1:8788';
assert.ok(isLoopback(base), 'UI tests are local only.');
const { chromium } = await import(process.env.EXM_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.EXM_CHROMIUM || undefined });
const run = randomBytes(4).toString('hex');
async function pageFor(name, viewport = { width: 390, height: 762 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  if (name) {
    await page.goto(base + '/account');
    await page.getByRole('button', { name: 'Test ' + name, exact: true }).click();
    await page.getByRole('heading', { name: 'Welcome, @preview-' + name }).waitFor();
  }
  return page;
}
const go = (page, name) => page.getByRole('navigation', { name: 'Member hub', exact: true })
  .getByRole('link', { name, exact: true }).click();
function card(page, heading) {
  return page.locator('article').filter({ has: page.getByRole('heading', { name: heading, exact: true }) });
}

try {
  const shopGuest = await pageFor();
  await shopGuest.goto(base + '/member-hub#rewards');
  const shopSignIn = shopGuest.getByRole('link', { name: 'Sign in to Rewards Shop' });
  await shopSignIn.waitFor();
  assert.equal(await shopSignIn.getAttribute('href'), 'account.html?next=rewards');
  await shopGuest.context().close();

  const artist = await pageFor('artist');
  await artist.goto(base + '/account');
  const photoInput = artist.getByLabel('Upload a profile photo');
  await photoInput.waitFor();
  const phoneJpeg = await artist.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8064;
    canvas.height = 6048;
    const context = canvas.getContext('2d');
    context.fillStyle = '#a62836';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  await photoInput.setInputFiles({
    name: 'phone-photo.jpg', mimeType: 'image/jpeg',
    // A 48.8 MP input larger than the retired 4 MiB source limit.
    buffer: Buffer.concat([Buffer.from(phoneJpeg, 'base64'), Buffer.alloc(5 * 1024 * 1024)]),
  });
  await artist.getByText('Photo ready. Tap Save profile below to apply it.', { exact: true }).waitFor();
  await artist.getByRole('button', { name: 'Save profile' }).click();
  await artist.locator('#profile-save-status').getByText('Profile saved.', { exact: true }).waitFor();
  await artist.reload();
  await artist.locator('#profile-photo-preview').waitFor();
  assert.equal(await artist.locator('#profile-avatar').inputValue(), 'custom');
  await photoInput.setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('Invalid image') });
  await artist.locator('#profile-photo-status').getByText('This browser could not open the photo.', { exact: false }).waitFor();
  await artist.locator('#profile-photo-preview').waitFor();
  assert.equal(await artist.locator('#profile-avatar').inputValue(), 'custom');
  assert.equal(await artist.getByRole('button', { name: 'Save profile' }).isEnabled(), true);
  await artist.goto(base + '/account?next=rewards');
  await artist.waitForURL(/member-hub(?:\.html)?#rewards$/);
  await artist.getByRole('heading', { name: 'EXM Rewards Shop' }).waitFor();
  await go(artist, 'Dashboard');
  await artist.getByRole('heading', { name: 'Welcome, @preview-artist' }).waitFor();
  const check = artist.getByRole('button', { name: 'Check in today' });
  if (await check.isVisible()) await check.click();
  await artist.getByRole('button', { name: 'Checked in today' }).waitFor();
  const rank = await artist.locator('#member-rank').textContent();
  await go(artist, 'Rewards Shop');
  const reward = card(artist, 'Opening Night');
  await reward.waitFor();
  const redeem = reward.getByRole('button', { name: 'Redeem for 10 points' });
  if (await redeem.isVisible()) await redeem.click();
  await artist.getByRole('button', { name: 'My inventory' }).click();
  await reward.waitFor();
  const equip = reward.getByRole('button', { name: 'Equip', exact: true });
  if (await equip.isVisible()) await equip.click();
  await reward.getByRole('button', { name: 'Unequip' }).waitFor();
  await go(artist, 'Dashboard');
  await artist.getByRole('heading', { name: 'Welcome, @preview-artist' }).waitFor();
  assert.equal(await artist.locator('#member-rank').textContent(), rank);
  await artist.locator('#dashboard-cosmetics').getByText('Opening Night', { exact: true }).waitFor();

  await go(artist, 'Leaderboards');
  await artist.getByLabel('Category').selectOption('artist');
  await artist.getByRole('button', { name: 'Show rankings' }).click();
  const results = artist.locator('#rank-rows');
  await results.getByRole('link', { name: 'TEST · Artist', exact: true }).waitFor();
  await results.getByRole('link', { name: 'TEST · Producer', exact: true }).waitFor({ state: 'hidden' });
  await results.getByRole('link', { name: 'TEST · Artist', exact: true }).click();
  await artist.getByRole('heading', { name: 'TEST · Artist', exact: true }).waitFor();
  await artist.getByText('Opening Night', { exact: true }).waitFor();

  await artist.goto(base + '/member-hub#feed');
  const update = '<strong>TEST browser update ' + run + '</strong>';
  await artist.getByLabel('Your update').fill(update);
  await artist.getByRole('button', { name: 'Post update' }).click();
  await artist.getByText(update, { exact: true }).waitFor();
  assert.equal(await artist.locator('.feed-body strong').count(), 0);

  const producer = await pageFor('producer');
  await go(producer, 'Community feed');
  const item = producer.locator('article').filter({ hasText: update });
  await item.getByRole('button', { name: 'Like', exact: true }).click();
  await item.getByRole('button', { name: 'Unlike', exact: true }).waitFor();
  await item.getByRole('textbox', { name: /Comment on/ }).fill('TEST comment ' + run);
  await item.getByRole('button', { name: 'Send comment' }).click();
  await item.getByText('TEST comment ' + run, { exact: true }).waitFor();
  await item.getByText('Report post', { exact: true }).click();
  await item.getByRole('button', { name: 'Send report' }).click();
  await producer.getByText('Report sent for moderator review.').waitFor();

  const moderator = await pageFor('moderator', { width: 1100, height: 845 });
  await go(moderator, 'Staff tools');
  const report = moderator.locator('article').filter({ hasText: update });
  await report.getByRole('button', { name: 'Hide content' }).click();
  await moderator.getByText('Moderation decision recorded.').waitFor();
  assert.equal(await moderator.getByRole('heading', { name: 'Owner controls' }).isVisible(), false);
  await producer.reload();
  await producer.getByRole('heading', { name: 'Community feed' }).waitFor();
  await producer.waitForFunction(() => !document.querySelector('#hub-status').textContent.includes('Loading'));
  assert.equal(await producer.getByText(update, { exact: true }).isVisible(), false);

  const owner = await pageFor('owner', { width: 1280, height: 860 });
  await go(owner, 'Staff tools');
  const editor = card(owner, 'New test event');
  const eventName = 'TEST · Browser workshop ' + run;
  await editor.getByLabel('Name', { exact: true }).fill(eventName);
  await editor.getByLabel('Description', { exact: true }).fill('Synthetic community workshop.');
  await editor.getByLabel('Event status').selectOption('registration_open');
  await editor.getByLabel('Application intake').selectOption('artist');
  await editor.getByLabel('Discord voice channel', { exact: false }).fill('Isolated test voice channel');
  await editor.getByRole('button', { name: 'Save event draft' }).click();
  const eventEditor = card(owner, eventName);
  await eventEditor.getByRole('button', { name: 'Publish saved draft to preview' }).click();
  await eventEditor.getByText('Published in local preview').waitFor();

  const guest = await pageFor();
  const editorial = card(owner, 'Featured event and member spotlight');
  await editorial.getByLabel('Featured campaign').selectOption({ label: eventName });
  await editorial.getByLabel('Creator spotlight').selectOption('vantiva');
  await editorial.getByLabel('Spotlight description (optional)').fill('TEST · Editorial spotlight');
  await editorial.getByRole('button', { name: 'Save editorial draft' }).click();
  const publishHomepage = editorial.getByRole('button', { name: 'Publish saved editorial draft to preview' });
  await publishHomepage.waitFor();
  await guest.goto(base + '/');
  await guest.locator('.welcome-copy').getByRole('link', { name: 'Explore Events' }).waitFor();
  assert.equal(await guest.locator('#preview-featured-creator').count(), 0);
  await publishHomepage.click();
  await editorial.getByText('Editorial preview is up to date.').waitFor();
  await guest.reload();
  await guest.locator('#preview-featured-creator').getByRole('link', { name: 'Vantiva' }).waitFor();
  await guest.goto(base + '/events#results');
  await guest.locator('#preview-featured-event').getByRole('heading', { name: eventName, exact: true }).waitFor();
  await guest.getByRole('link', { name: 'SongWars IV interest' }).waitFor();
  await editorial.getByLabel('Featured campaign').selectOption('');
  await editorial.getByLabel('Creator spotlight').selectOption('');
  await editorial.getByRole('button', { name: 'Save editorial draft' }).click();
  await publishHomepage.click();
  await editorial.getByText('Editorial preview is up to date.').waitFor();

  await guest.goto(base + '/events#results');
  await guest.locator('#event-board summary').filter({ hasText: eventName }).click();
  const publicEvent = card(guest, eventName);
  await publicEvent.getByLabel('Test display name').fill('TEST · Browser guest ' + run);
  await publicEvent.getByLabel('Synthetic contact ending in .test').fill('browser-' + run + '@example.test');
  await publicEvent.getByLabel('Discord username').fill('browser.' + run);
  await publicEvent.getByLabel('Instagram handle or profile link').fill('@browser.' + run);
  await publicEvent.getByLabel('Public music link').fill('https://example.com/music');
  await publicEvent.getByLabel('I joined the EXM Discord server').check();
  await publicEvent.getByLabel('I can access the event voice channel').check();
  await publicEvent.getByRole('button', { name: 'Submit test application' }).click();
  await publicEvent.getByText('Test interest received.', { exact: false }).waitFor();
  await eventEditor.getByRole('button', { name: 'Review test applications' }).click();
  const guestRecord = card(owner, 'TEST · Browser guest ' + run);
  await guestRecord.getByLabel('Application status').selectOption('approved');
  await guestRecord.getByRole('button', { name: 'Save review' }).click();
  await guestRecord.getByText('Verify Discord server membership and event voice-channel access before approval.', { exact: true }).waitFor();
  await guestRecord.getByLabel('I verified EXM Discord membership and access to the event voice channel').check();
  await guestRecord.getByRole('button', { name: 'Save review' }).click();
  await guestRecord.getByText('Review saved.', { exact: true }).waitFor();

  await producer.goto(base + '/member?username=preview-artist');
  await producer.getByRole('button', { name: 'Block member', exact: true }).click();
  await producer.getByRole('button', { name: 'Unblock member', exact: true }).waitFor();
  await producer.goto(base + '/member-hub#privacy');
  const unblock = producer.getByRole('button', { name: 'Unblock preview-artist' });
  await unblock.click();
  await producer.getByText('You have no blocked members.').waitFor();

  await guest.goto(base + '/hall-of-fame');
  await guest.getByRole('heading', { name: 'BallHogs' }).waitFor();
  await guest.getByRole('link', { name: 'BitchYouNotAYop' }).waitFor();
  assert.equal(await guest.getByText('SongWars Champion', { exact: true }).count(), 2);
  console.log('PASS: shared Worker preview across mobile and desktop, signed-in roles, check-in, redemption/equip, rankings/profile, text-only moderation, event publishing, guest intake/review, campaign/spotlight approval, blocks and verified champions.');
} finally {
  await browser.close();
}
