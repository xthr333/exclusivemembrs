import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.EXM_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.EXM_CHROMIUM || undefined });
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://localhost';
const profile = { username: 'reward-fixture', displayName: 'Reward Fixture', avatar: 'initials' };
const item = {
  slug: 'signal-frame', name: 'Analog Signal', kind: 'frame', appearance: 'signal',
  cost: 15, active: true, owned: false, equipped: false,
};
let releaseProfile;
let releaseRedemption;
let redemptionRequests = 0;
let redeemed = false;
const profileResponse = new Promise(resolve => { releaseProfile = resolve; });
const redemptionResponse = new Promise(resolve => { releaseRedemption = resolve; });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  page.setDefaultTimeout(10000);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/platform/rewards') {
      return route.fulfill({ json: { points: redeemed ? 10 : 25, items: [{ ...item, owned: redeemed }] } });
    }
    if (url.pathname === '/api/members/session') {
      await profileResponse;
      return route.fulfill({ json: { profile } });
    }
    if (url.pathname === '/api/platform/redeem') {
      redemptionRequests++;
      await redemptionResponse;
      redeemed = true;
      return route.fulfill({ json: { ok: true, points: 10 } });
    }
    return route.fulfill({ path: resolve(root, '.' + url.pathname) });
  });

  const requestedProfile = page.waitForRequest(origin + '/api/members/session');
  await page.goto(origin + '/member-hub.html#rewards', { waitUntil: 'domcontentloaded' });
  await requestedProfile;
  await page.getByText('25 Rewards Points available').waitFor();
  const redeem = page.getByRole('button', { name: 'Redeem for 15 points' });
  assert.equal(await redeem.isEnabled(), true);

  const requestedRedemption = page.waitForRequest(origin + '/api/platform/redeem');
  await redeem.click();
  await requestedRedemption;
  assert.equal(await redeem.isEnabled(), false);
  await page.getByLabel('Show').selectOption('frame');
  assert.equal(await redeem.isEnabled(), false);

  releaseProfile();
  await page.getByText(profile.displayName, { exact: true }).waitFor();
  assert.equal(await redeem.isEnabled(), false);
  releaseRedemption();
  await page.getByText('10 Rewards Points available').waitFor();
  await page.getByRole('button', { name: 'Equip', exact: true }).waitFor();
  assert.equal(redemptionRequests, 1);
  console.log('PASS: the Rewards Shop loads before optional profile data, and pending redemption stays disabled across filtering and preview updates.');
} finally {
  releaseProfile();
  releaseRedemption();
  await browser.close();
}
