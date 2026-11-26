import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercise the shipped request functions without a browser, account, or network.
for (const [file, start, end, name] of [
  ['member-account.js', '  async function request(', '\n  function showAccess', 'request'],
  ['member-platform.js', '  async function requestJSON(', '\n  const api =', 'requestJSON'],
]) {
  const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  const body = source.slice(source.indexOf(start), source.indexOf(end));
  let calls, timer, cleared, controller;
  const make = fetch => {
    calls = 0; cleared = false;
    return new Function('fetch', 'AbortController', 'setTimeout', 'clearTimeout', body + '\nreturn ' + name)(
      (...args) => { calls++; return fetch(...args); },
      class extends AbortController { constructor() { super(); controller = this; } },
      callback => { timer = callback; return 1; },
      () => { cleared = true; },
    );
  };
  let request = make(async () => ({ ok: true, status: 200, json: async () => ({ saved: true }) }));
  await request('profile', { bio: 'Retain this edit' });
  assert.equal(calls, 1);
  assert.ok(cleared);

  request = make(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Invalid JSON'); } }));
  await assert.rejects(request('profile', {}), 'Malformed success is never reported as a saved change');
  assert.ok(cleared);

  request = make((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
  }));
  const stalled = request('redeem', { slug: 'example' });
  timer();
  await assert.rejects(stalled, /timed out/);
  assert.ok(controller.signal.aborted);
  assert.ok(cleared);
  assert.equal(calls, 1, 'Timed-out mutations must not be retried automatically');

  request = make(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in required' }) }));
  if (name === 'requestJSON') await assert.rejects(request('profile'), error => error.status === 401);
  else assert.equal((await request('profile')).code, 401);
  assert.ok(cleared);
}
console.log('PASS: member request timeout, malformed response, expired session, cleanup and no automatic mutation retry.');
