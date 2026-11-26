import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isLoopback } from '../server/member-api.mjs';

const base = process.env.EXM_MEMBER_WORKER_ORIGIN || 'http://127.0.0.1:8788';
assert.ok(isLoopback(base), 'Avatar UI tests require the isolated preview Worker.');
const { chromium } = await import(process.env.EXM_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.EXM_CHROMIUM || undefined });
const temporaryFiles = await mkdtemp(join(tmpdir(), 'exm-avatar-ui-'));
const username = 'avatar-' + randomBytes(6).toString('hex');
const email = username + '@example.test';
const password = 'Local test ' + randomBytes(16).toString('hex');

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const signup = await context.request.post(base + '/api/members/signup', {
    headers: { Origin: base }, data: { username, email, password, confirmPassword: password },
  });
  assert.equal(signup.status(), 202, 'Preview-fixture signup');
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.goto(base + '/account');
  const signIn = page.locator('#member-login');
  async function logIn() {
    await signIn.getByLabel('Email', { exact: true }).fill(email);
    await signIn.getByLabel('Password', { exact: true }).fill(password);
    await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await logIn();

  const fileInput = page.getByLabel('Upload a profile photo');
  const cameraInput = page.getByLabel('Or take a profile photo');
  const preview = page.locator('#profile-photo-preview');
  const photoStatus = page.locator('#profile-photo-status');
  const save = page.getByRole('button', { name: 'Save profile' });
  const saved = page.locator('#profile-save-status').getByText('Profile saved.', { exact: true });
  const previewReady = photoStatus.getByText('Photo ready. Tap Save profile below to apply it.', { exact: true });
  const avatarURL = base + '/api/members/avatar?username=' + username;
  await fileInput.waitFor();
  assert.equal(await cameraInput.getAttribute('capture'), 'user');
  assert.equal(await fileInput.getAttribute('capture'), null);

  async function read(path) {
    return page.evaluate(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Isolated API error ' + response.status + ' at ' + url);
      return response.json();
    }, path);
  }

  async function image(name, mimeType, color, width = 40, height = 60) {
    const imageData = await page.evaluate(({ mimeType, color, width, height }) => {
      const canvas = Object.assign(document.createElement('canvas'), { width, height });
      const drawing = canvas.getContext('2d');
      drawing.fillStyle = color;
      drawing.fillRect(0, 0, width, height);
      return canvas.toDataURL(mimeType, 0.85);
    }, { mimeType, color, width, height });
    assert.ok(imageData.startsWith('data:' + mimeType + ';base64,'), name + ' fixture format');
    return { name, mimeType, buffer: Buffer.from(imageData.split(',')[1], 'base64') };
  }

  async function select(file, input = fileInput) {
    await input.setInputFiles(file);
    await previewReady.waitFor();
    const source = await preview.getAttribute('src');
    assert.match(source, /^data:image\/webp;base64,/);
    return source;
  }

  async function checkSavedAvatar(expected) {
    await preview.waitFor();
    assert.equal(await page.locator('#profile-avatar').inputValue(), 'custom');
    await page.waitForFunction(() => {
      const photo = document.getElementById('profile-photo-preview');
      return photo.naturalWidth === 256 && photo.naturalHeight === 256;
    });
    const avatar = await page.evaluate(async url => {
      const response = await fetch(url);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { status: response.status, mimeType: response.headers.get('content-type'), bytes: Array.from(bytes) };
    }, avatarURL);
    assert.equal(avatar.status, 200);
    assert.equal(avatar.mimeType, 'image/webp');
    assert.deepEqual(Buffer.from(avatar.bytes), Buffer.from(expected.split(',')[1], 'base64'),
      'The Worker serves the selected image in the signed-in browser');
  }

  async function saveAndCheck(expected) {
    assert.ok(Buffer.from(expected.split(',')[1], 'base64').length <= 49152, 'Upload uses the stored-image size cap');
    await save.click();
    await saved.waitFor();
    await page.reload();
    await checkSavedAvatar(expected);
  }

  const jpeg = await image('camera.jpg', 'image/jpeg', '#a62836');
  const png = await image('screenshot.png', 'image/png', '#1c6d2c');
  const webp = await image('share.webp', 'image/webp', '#2842a6');
  const phoneJpeg = await image('phone.jpg', 'image/jpeg', '#523d6c', 4032, 3024);
  const initial = await read('/api/platform/dashboard');
  const bio = 'Isolated photo and profile regression';
  await page.getByLabel('Bio', { exact: true }).fill(bio);
  await page.locator('#profile-visibility').uncheck();
  await saveAndCheck(await select(jpeg, cameraInput));
  assert.equal((await read('/api/platform/dashboard')).points - initial.points, 20, 'First bio and photo add 10 points each');
  for (const file of [png, webp, phoneJpeg]) await saveAndCheck(await select(file));
  assert.equal((await read('/api/platform/dashboard')).points - initial.points, 20, 'Further uploads do not repeat the milestones');

  const savedPhoto = await preview.getAttribute('src');
  assert.ok(savedPhoto.endsWith(username));
  const oversizedFile = join(temporaryFiles, 'too-large.jpg');
  await writeFile(oversizedFile, '');
  await truncate(oversizedFile, 25 * 1024 * 1024 + 1);
  for (const [file, error] of [
    [{ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('Invalid image') }, 'This browser could not open the photo.'],
    [oversizedFile, 'This photo is over 25 MB.'],
    [await image('too-many-pixels.jpg', 'image/jpeg', '#444444', 8000, 6400), 'Choose a photo up to 50 megapixels.'],
  ]) {
    await fileInput.setInputFiles(file);
    await photoStatus.getByText(error, { exact: false }).waitFor();
    assert.equal(await preview.getAttribute('src'), savedPhoto);
    assert.equal(await save.isEnabled(), true);
  }

  const beforeCancel = await select(jpeg);
  await fileInput.dispatchEvent('cancel');
  assert.equal(await preview.getAttribute('src'), beforeCancel, 'Closing the picker preserves the already selected photo');
  await fileInput.setInputFiles([]);
  assert.equal(await photoStatus.textContent(), '');
  assert.equal(await preview.getAttribute('src'), savedPhoto);
  assert.equal(await save.isEnabled(), true);

  // Delay only the older blob's native image load to make the order deterministic.
  await page.evaluate(() => {
    const makeURL = URL.createObjectURL;
    const imageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    let olderURL;
    URL.createObjectURL = function (file) {
      const url = makeURL.call(this, file);
      if (file.name === 'older.png') olderURL = url;
      return url;
    };
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...imageSource,
      set(url) {
        if (url !== olderURL) return imageSource.set.call(this, url);
        window.releaseOlderAvatar = () => new Promise((resolve, reject) => {
          this.addEventListener('load', resolve, { once: true });
          this.addEventListener('error', reject, { once: true });
          imageSource.set.call(this, url);
        });
      },
    });
  });
  await fileInput.setInputFiles({ ...png, name: 'older.png' });
  await page.waitForFunction(() => typeof window.releaseOlderAvatar === 'function');
  assert.equal(await save.isEnabled(), false, 'Save stays disabled during preparation');
  const replacement = await select(webp);
  await page.evaluate(() => window.releaseOlderAvatar());
  assert.equal(await preview.getAttribute('src'), replacement, 'A late decode cannot replace the newer selection');
  assert.equal(await save.isEnabled(), true);
  await saveAndCheck(replacement);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await logIn();
  await checkSavedAvatar(replacement);
  assert.equal(await page.getByLabel('Bio', { exact: true }).inputValue(), bio);
  const { profile } = await read('/api/members/public-profile?view=self');
  assert.equal(profile.bio, bio);
  assert.equal(profile.publiclyVisible, false);
  assert.equal((await requestAsGuest('public-profile?username=' + username)).status, 404);
  await page.locator('#profile-visibility').check();
  await save.click();
  await saved.waitFor();
  const optedIn = await requestAsGuest('public-profile?username=' + username);
  assert.equal(optedIn.status, 200);
  assert.equal((await optedIn.json()).profile.bio, bio);

  function requestAsGuest(path) {
    return fetch(base + '/api/members/' + path);
  }

  await page.goto(base + '/member-hub');
  await page.getByRole('button', { name: 'Check in today', exact: true }).click();
  await page.getByRole('button', { name: 'Checked in today', exact: true }).waitFor();
  const earned = await read('/api/platform/dashboard');
  assert.equal(earned.points - initial.points, 25);
  await page.getByRole('navigation', { name: 'Member hub' }).getByRole('link', { name: 'Rewards Shop' }).click();
  const reward = page.locator('#reward-items article').filter({ has: page.getByRole('heading', { name: 'Opening Night', exact: true }) });
  await reward.getByRole('button', { name: 'Redeem for 10 points', exact: true }).click();
  await page.locator('#hub-status').getByText('Reward added to your inventory.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'My inventory', exact: true }).click();
  await reward.getByRole('button', { name: 'Equip', exact: true }).click();
  await reward.getByRole('button', { name: 'Unequip', exact: true }).waitFor();
  await page.reload();
  await reward.getByRole('button', { name: 'Unequip', exact: true }).waitFor();
  const redeemed = await read('/api/platform/dashboard');
  assert.equal(redeemed.points, earned.points - 10);
  assert.equal(redeemed.xp, earned.xp, 'Redeeming a reward preserves XP');
  assert.equal(redeemed.equipped.badge.name, 'Opening Night');

  console.log('PASS: isolated Chromium photo library and camera-input file, save/reload and new sign-in, photo limits and replacement, private/public profile, first bio/photo and check-in earnings, redemption/equip persistence.');
} finally {
  await Promise.all([browser.close(), rm(temporaryFiles, { recursive: true })]);
}
