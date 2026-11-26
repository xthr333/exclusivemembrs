import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderEventCalendar } from './event-calendar.mjs';

const out = resolve(import.meta.dirname, '../dist');
const root = resolve(out, '..');
const pages = readdirSync(out).filter(file => file.endsWith('.html'));
const privatePages = ['account.html', 'member.html', 'member-hub.html'];
const unavailable = [...privatePages, 'CODEX-FINISH-HANDOFF.md', 'CONNECTED-FIX-HANDOFF.md', 'RECOVERY-HANDOFF.md', 'server', 'supabase', 'tools', '.dev.vars',
  'member-account.js', 'member-community.js', 'member-platform.js', 'member-operations.js', 'editorial-preview.js'];
for (const name of unavailable) assert.ok(!existsSync(resolve(out, name)), name + ' must stay out of public assets');
const legacyExclusions = readFileSync(resolve(root, '_config.yml'), 'utf8').split('\n')
  .filter(line => /^  - /.test(line)).map(line => line.slice(4));
for (const name of unavailable.filter(name => name !== '.dev.vars')) {
  assert.ok(legacyExclusions.includes(name), name + ' must stay out of GitHub Pages');
}
for (const page of pages) {
  const html = readFileSync(resolve(out, page), 'utf8');
  const legacyHtml = readFileSync(resolve(root, page), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  for (const markup of [html, legacyHtml]) {
    for (const [, path] of markup.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const filename = path.replace(/^\//, '').split(/[?#]/, 1)[0];
      assert.ok(!unavailable.includes(filename), page + ' references preview-only ' + path);
    }
    assert.doesNotMatch(markup, /id="(?:members|event-board|notice-board|preview-champions)"/, page);
  }
  assert.doesNotMatch(html, /Preview test accounts|Synthetic contact|Local test finals|local preview/i, page);
  for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) continue;
    const file = value.split(/[?#]/, 1)[0].replace(/^\//, '');
    assert.ok(existsSync(resolve(out, file)), page + ' links to missing ' + value);
  }
}
assert.match(readFileSync(resolve(out, 'index.html'), 'utf8'), /href="events.html">Explore Events/);
const eventsPage = readFileSync(resolve(out, 'events.html'), 'utf8');
assert.match(eventsPage, /<h1 id="events-title">Leaderboard/);
assert.match(eventsPage, /<section id="results" aria-labelledby="events-title" hidden>/);
assert.match(eventsPage, /id="featured-event" href="https:\/\/songwars-s3-registration\.b26xkz4v97\.chatgpt\.site\/season-4"/);
assert.ok(!existsSync(resolve(out, 'songwars-legacy-data.js')));
assert.ok(!existsSync(resolve(out, 'content')));
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
const hall = readFileSync(resolve(out, 'hall-of-fame.html'), 'utf8');
const roster = readFileSync(resolve(out, 'artists.html'), 'utf8');
assert.match(roster, /href="https:\/\/www\.instagram\.com\/exclusivemembrs\/">Need help claiming your artist profile\?/);
assert.equal([...roster.matchAll(/data-roster-status="([^"]+)"/g)].length, 11);
assert.match(roster, /data-roster-status="ybdd">Verified account/);
for (const handle of ['03wayne', 'oxxx', '1ilriskk', 'mayo_', 'bitchyounotayop']) {
  assert.ok(roster.includes('data-roster-status="' + handle + '">Unclaimed'));
}
const ybdd = readFileSync(resolve(out, 'ybdd.html'), 'utf8');
const o3 = readFileSync(resolve(out, '03wayne.html'), 'utf8');
assert.match(ybdd, /champion-mark">Founder<.*champion-mark">EXM Artist</);
assert.doesNotMatch(o3, />Founder</);
assert.match(hall, /href="1ilriskk.html">LR<\/a> and <a href="mayo.html">Mayo_<\/a>/);
assert.match(readFileSync(resolve(out, '1ilriskk.html'), 'utf8'), /SongWars champion · Season III · Double Impact/);
assert.match(hall, /id="season-i"[\s\S]*?Mayo_<\/a>[\s\S]*?<p>Archive listing<\/p>/);
assert.doesNotMatch(hall, /pending verification/i);
assert.match(readFileSync(resolve(out, 'artists.html'), 'utf8'), /href="mayo\.html"/);
assert.match(readFileSync(resolve(out, 'admin.html'), 'utf8'), /supabase/i);
assert.match(readFileSync(resolve(out, 'shop.html'), 'utf8'), /exclusivemembrs\.printify\.me\/product/);
console.log('PASS: ' + pages.length + ' public pages have working local assets and links, with isolated member and fixture surfaces excluded.');
