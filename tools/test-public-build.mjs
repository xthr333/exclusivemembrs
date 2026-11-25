import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderEventCalendar } from './event-calendar.mjs';

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
const eventsPage = readFileSync(resolve(out, 'events.html'), 'utf8');
assert.match(eventsPage, /46–39\.5/);
for (const view of ['upcoming', 'live', 'past']) {
  assert.ok(eventsPage.includes('href="#calendar-' + view + '"'));
  assert.ok(eventsPage.includes('id="calendar-' + view + '"'));
}
assert.match(eventsPage, /id="featured-event"[\s\S]*?<a[^>]*href="https:\/\/songwars-s3-registration\.b26xkz4v97\.chatgpt\.site\/season-4"/);
assert.match(eventsPage, /id="calendar-event-songwars-iv"[\s\S]*?<a[^>]*href="#featured-event"/);
assert.match(eventsPage, /id="calendar-event-songwars-iii"[\s\S]*?<a[^>]*href="#double-impact"/);
const event = {
  id: 'fixture', title: '<Title>', status: 'upcoming', summary: 'A & B', date: '2024-02-29',
  links: Object.fromEntries(['interest', 'registration', 'rsvp', 'tickets', 'stream', 'replay', 'recap']
    .map(action => [action, 'https://example.com/' + action])),
};
const calendar = renderEventCalendar([
  event, { ...event, id: 'live-fixture', status: 'live' }, { ...event, id: 'past-fixture', status: 'past' },
  { ...event, id: 'unreleased', title: 'Unreleased draft', status: 'draft' },
]);
const card = id => calendar.match(new RegExp('id="calendar-event-' + id + '"[\\s\\S]+?</article>'))[0];
assert.match(card('fixture'), /&lt;Title&gt;[\s\S]+A &amp; B[\s\S]+interest[\s\S]+registration[\s\S]+rsvp[\s\S]+tickets/);
assert.doesNotMatch(card('fixture'), /example\.com\/(stream|replay|recap)/);
assert.match(card('live-fixture'), /example\.com\/stream/);
assert.match(card('past-fixture'), /example\.com\/replay[\s\S]+example\.com\/recap/);
assert.doesNotMatch(card('past-fixture'), /example\.com\/(interest|registration|rsvp|tickets|stream)/);
assert.doesNotMatch(calendar, /Unreleased draft|calendar-event-unreleased/);
assert.throws(() => renderEventCalendar([event, event]), /unique ID/);
assert.throws(() => renderEventCalendar([{ ...event, date: '2025-02-29' }]), /real calendar date/);
assert.throws(() => renderEventCalendar([{ ...event, links: { tickets: 'javascript:alert(1)' } }]), /public HTTPS/);
assert.match(readFileSync(resolve(out, 'hall-of-fame.html'), 'utf8'), /BitchYouNotAYop/);
assert.match(readFileSync(resolve(out, 'artists.html'), 'utf8'), /href="mayo\.html"/);
assert.match(readFileSync(resolve(out, 'admin.html'), 'utf8'), /supabase/i);
assert.match(readFileSync(resolve(out, 'shop.html'), 'utf8'), /exclusivemembrs\.printify\.me\/product/);
console.log('PASS: ' + pages.length + ' public pages have working local assets and links, with isolated member and fixture surfaces excluded.');
