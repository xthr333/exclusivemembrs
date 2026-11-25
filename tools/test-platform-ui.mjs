import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { handleMemberRequest } from '../server/member-api.mjs';

const { chromium } = await import(process.env.EXM_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '../dist');
const origin = 'https://exm.test';
const browser = await chromium.launch({ executablePath: process.env.EXM_CHROMIUM || undefined });

try {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  // Serve the actual built files in Chromium. Block every external service,
  // including Supabase, to verify the public fallback without production calls.
  const serve = async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const file = resolve(root, '.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep)) return route.abort();
    if (!(await stat(file).catch(() => null))?.isFile()) {
      return route.fulfill({ status: 404, path: resolve(root, '404.html') });
    }
    return route.fulfill({ path: file });
  };
  await context.route('**/*', serve);

  const page = await context.newPage();
  const pages = (await readdir(root)).filter(file => file.endsWith('.html'));
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    for (const file of pages) {
      await page.goto(origin + '/' + file);
      await page.locator('h1').waitFor();
      const widths = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      assert.ok(widths[0] <= widths[1], file + ': document overflow at ' + width + ' px');
      const broken = await page.locator('img').evaluateAll(images =>
        images.filter(img => img.complete && !img.naturalWidth).map(img => img.getAttribute('src')));
      assert.deepEqual(broken, [], file + ': broken loaded images');
    }
  }

  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(origin + '/');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  assert.equal(await nav.locator('[aria-current="page"]').textContent(), 'Home');
  const menu = nav.getByRole('button', { name: 'Menu' });
  const more = nav.getByText('More', { exact: true });
  await menu.click();
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await more.click();
  const contact = nav.getByRole('link', { name: 'Contact', exact: true });
  await contact.focus();
  await page.keyboard.press('Escape');
  assert.equal(await contact.isVisible(), false);
  assert.equal(await more.evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  assert.equal(await menu.evaluate(node => node === document.activeElement), true);
  await menu.click();
  await more.click();
  await contact.click();
  await page.waitForURL(origin + '/contact.html');

  await page.setViewportSize({ width: 390, height: 650 });
  await page.goto(origin + '/');
  const logo = page.locator('.welcome-logo');
  assert.equal(await logo.evaluate(node => getComputedStyle(node).animationName), 'none');
  for (const action of await page.locator('.welcome-copy .btn').all()) {
    const box = await action.boundingBox();
    assert.ok(box && box.y + box.height <= 650, 'Hero action fits in a short mobile viewport');
  }
  await page.getByText('Showing saved EXM updates', { exact: false }).waitFor();
  assert.ok(await page.locator('#homeUpdates article').count());
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  assert.equal(await logo.evaluate(node => getComputedStyle(node).animationName), 'exm-logo-glitch');
  assert.equal(await logo.evaluate(node => getComputedStyle(node).animationIterationCount), '1');

  const noScript = await browser.newContext({
    javaScriptEnabled: false, viewport: { width: 320, height: 640 },
  });
  await noScript.route('**/*', serve);
  const fallback = await noScript.newPage();
  await fallback.goto(origin + '/missing/nested/page');
  const fallbackNav = fallback.getByRole('navigation', { name: 'Main navigation' });
  await fallbackNav.getByRole('link', { name: 'Media', exact: true }).click();
  await fallback.waitForURL(origin + '/media.html');
  await fallbackNav.getByText('More', { exact: true }).click();
  await fallbackNav.getByRole('link', { name: 'EXM Divisions' }).click();
  await fallback.waitForURL(origin + '/divisions.html');
  assert.equal(await fallback.getByRole('link', { name: 'See the W3 portfolio' }).getAttribute('href'), 'studios.html');
  if (process.env.EXM_MEMBER_UI_TEST === '1') {
    for (const variable of ['EXM_MEMBER_AUTH_URL', 'EXM_MEMBER_DATA_URL']) {
      assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env[variable]).hostname));
    }
    await context.route('**/api/members/*', async route => {
      const incoming = route.request();
      const headers = await incoming.allHeaders();
      const response = await handleMemberRequest(new Request(incoming.url(), {
        method: incoming.method(), headers, body: incoming.postData() ?? undefined,
      }), process.env);
      await route.fulfill({
        status: response.status, headers: Object.fromEntries(response.headers), body: await response.text(),
      });
    });

    await page.goto(origin + '/account.html');
    const runId = randomBytes(5).toString('hex');
    const email = 'browser-' + runId + '@example.test';
    const username = 'browser-' + runId;
    const password = 'Local browser test password';
    await page.locator('#signup-email').fill(email);
    await page.locator('#signup-username').fill(username);
    await page.locator('#signup-password').fill(password);
    await page.locator('#confirm-password').fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByText('If your account was created', { exact: false }).waitFor();
    assert.equal(await page.locator('#login-email').inputValue(), email);
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText('@' + username, { exact: true }).waitFor();
    assert.equal(await page.locator('#member-codes-list li').count(), 8);
    const code = await page.locator('#member-codes-list code').first().textContent();
    assert.ok((await context.cookies()).some(cookie => cookie.name === '__Host-exm_session' && cookie.secure && cookie.httpOnly));
    await page.getByLabel('Display name', { exact: true }).fill('Local browser profile');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await page.getByText('Profile saved.', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('@' + username, { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), 'Local browser profile');
    assert.equal(await page.locator('#member-codes').isVisible(), false);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    await page.locator('#recovery-username').fill(username);
    await page.getByLabel('Recovery code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Create support reference' }).click();
    await page.getByText('Recovery reference created.', { exact: true }).waitFor();
    assert.match(await page.locator('#recovery-reference-value').textContent(), /^[0-9a-f-]{36}$/);
    console.log('PASS: Chromium signup, recovery-code display, secure session, profile edit, reload, logout, and recovery reference with local data.');
  }
  console.log('PASS: ' + pages.length * 2 + ' Chromium layout checks, short mobile hero, keyboard navigation, reduced motion, and offline/no-script fallbacks.');
} finally {
  await browser.close();
}
