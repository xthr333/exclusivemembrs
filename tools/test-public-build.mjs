import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(import.meta.dirname, '../dist');
const pages = readdirSync(out).filter(file => file.endsWith('.html'));
const privatePages = ['account.html', 'member.html', 'member-hub.html'];
const unavailable = [...privatePages, 'server', 'supabase', 'tools', '.dev.vars',
  'member-account.js', 'member-community.js', 'member-platform.js', 'member-operations.js', 'editorial-preview.js'];
for (const name of unavailable) assert.ok(!existsSync(resolve(out, name)), name + ' must stay out of public assets');
for (const page of pages) {
  const html = readFileSync(resolve(out, page), 'utf8');
  assert.doesNotMatch(html, /Preview test accounts|Synthetic contact|Local test finals|local preview/i, page);
  for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) continue;
    const file = value.split(/[?#]/, 1)[0].replace(/^\//, '');
    assert.ok(existsSync(resolve(out, file)), page + ' links to missing ' + value);
  }
}
assert.match(readFileSync(resolve(out, 'index.html'), 'utf8'), /SongWars IV interest form/);
assert.match(readFileSync(resolve(out, 'events.html'), 'utf8'), /46–39\.5/);
assert.match(readFileSync(resolve(out, 'hall-of-fame.html'), 'utf8'), /BitchYouNotAYop/);
assert.match(readFileSync(resolve(out, 'artists.html'), 'utf8'), /href="mayo\.html"/);
assert.match(readFileSync(resolve(out, 'admin.html'), 'utf8'), /supabase/i);
assert.match(readFileSync(resolve(out, 'shop.html'), 'utf8'), /exclusivemembrs\.printify\.me\/product/);
console.log('PASS: ' + pages.length + ' public pages have working local assets and links, with isolated member and fixture surfaces excluded.');
