import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { rankCompetition } from '../songwars-competition.js';
const root=path.resolve(import.meta.dirname,'..');
const pages=fs.readdirSync(root).filter(f=>f.endsWith('.html'));
let links=0,scripts=0;
for(const file of pages){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert.match(html,/<html lang="en"/i,`${file}: language`);
  assert.match(html,/<meta name="viewport"/i,`${file}: viewport`);
  assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1,`${file}: exactly one h1`);
  assert.equal((html.match(/<main(?:\s|>)/g)||[]).length,1,`${file}: one main`);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,`${file}: unique IDs`);
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
    let url=match[1];if(/^(https?:|mailto:|tel:|data:)/i.test(url))continue;
    const [pathname,anchor]=url.split('#');
    const local=decodeURIComponent(pathname.split('?')[0]);
    const target=local?path.resolve(root,local.replace(/^\//,'')):path.join(root,file);
    assert.ok(fs.existsSync(target),`${file}: missing ${url}`);
    if(anchor&&target.endsWith('.html')) {
      const markup = fs.readFileSync(target,'utf8');
      const dynamic = markup.match(/data-deep-links="([^"]+)"/)?.[1].split(' ') ?? [];
      assert.ok(markup.includes(`id="${anchor}"`) || dynamic.includes(anchor),`${file}: missing anchor ${url}`);
    }
    links++;
  }
  for(const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)){new vm.Script(m[1],{filename:file});scripts++;}
}
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.js'))){execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'inherit'});scripts++;}
for(const file of ['updates.json','songwars-public.json','wrangler.jsonc'])JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const publicData = JSON.parse(fs.readFileSync(path.join(root, 'songwars-legacy.json'), 'utf8'));
assert.deepEqual(Object.keys(publicData), ['results', 'brackets', 'artists', 'producers', 'producerDiscovery']);
assert.equal(publicData.brackets.length, 13);
assert.equal(publicData.artists.length, 20);
assert.deepEqual(publicData.results.find(result => result.id === 's3').finalScore, [46, 39.5]);
assert.deepEqual(Object.keys(publicData.results.find(result => result.id === 's1')), ['id', 'label', 'winner']);
assert.deepEqual(Object.keys(publicData.brackets.find(result => result.id === 'opening-4')), ['id', 'stage', 'winner', 'opponent']);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'songwars-public.json'),'utf8')), { results: publicData.results });
assert.deepEqual(publicData.producers, []);
assert.deepEqual(publicData.producerDiscovery.map(({ id, link }) => [id, link]), [['vantiva', 'vantiva.html']]);
const competitive = rankCompetition(publicData.artists, 'all');
assert.deepEqual(competitive.slice(0, 3).map(({ id, rank, titles, wins }) => [id, rank, titles, wins]), [
  ['mayo_', 1, 3, 4], ['bitchyounotayop', 2, 2, 3], ['1ilriskk', 3, 1, 4],
]);
const quarterfinalist = competitive.findIndex(entry => entry.id === 'pg23');
const opening = competitive.findIndex(entry => entry.id === 'ayco');
assert.ok(quarterfinalist < opening);
assert.equal(competitive[quarterfinalist].wins, 0);
assert.equal(competitive[quarterfinalist].round.label, 'Quarterfinal');
const seasonTwo = rankCompetition(publicData.artists, 's2');
assert.equal(seasonTwo.length, 1);
assert.equal(seasonTwo[0].wins, null);
assert.equal(seasonTwo[0].round, null);
assert.equal(seasonTwo[0].titles, 1);
assert.deepEqual(publicData.artists.find(artist => artist.id === 'mayo_').archiveCredits, ['pilot', 's1']);
const fixtures = Array.from({ length: 51 }, (_, index) => ({
  id: String(index), name: 'Rehearsal ' + String(index).padStart(2, '0'),
  seasons: [{ id: 'rehearsal', wins: 2, points: index }],
}));
assert.equal(rankCompetition(fixtures, 'rehearsal').length, 50);
assert.ok(rankCompetition(fixtures, 'rehearsal').every(entry => entry.rank === 1));
assert.equal(rankCompetition(fixtures, 'rehearsal')[0].id, '0');
const research = /contact_email|artist_one_discord|artist_two_discord|attendance_at|s2Disputed|crossSeasonAliases|s3ApprovalOnly|WILDCARD RECAP|rounds unverified|pending verification|later reported dropped|lineup conflict/i;
for (const name of ['events.html','standings.html','legacy.html','hall-of-fame.html','songwars-legacy.json','songwars-public.json','songwars-legacy.js']) {
  assert.doesNotMatch(fs.readFileSync(path.join(root,name),'utf8'), research, name);
}
console.log(`PASS: ${pages.length} pages, ${links} local links/assets, ${scripts} script syntax checks and SongWars display-field privacy checks.`);
