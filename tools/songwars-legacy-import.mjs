import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legacyArchive, legacyRanking } from './songwars-legacy-data.mjs';

const source = JSON.parse(readFileSync(new URL('../content/songwars-legacy.json', import.meta.url)));
const archive = legacyArchive(source);
assert.equal(archive.matches.length, 13);
assert.equal(new Set(archive.matches.map(row => row.id)).size, 13);
assert.equal(archive.teams.size, 12);
assert.equal(archive.people.size, 20);
assert.deepEqual([...archive.teams.values()].filter(team => !team.artists.length).map(team => team.id), ['howtoact','hgw']);
assert.equal(new Set(archive.awards.map(row => [row.season,row.person,row.event].join('/'))).size, archive.awards.length);
assert.equal(archive.awards.length, 53);
assert.ok(archive.awards.every(row => archive.people.has(row.person)));
assert.deepEqual(legacyRanking(archive,'all').slice(0,3).map(row => [row.id,row.points,row.rank]).sort(),
  [['1ilriskk',80,2],['bitchyounotayop',90,1],['mayo_',80,2]]);
assert.deepEqual(legacyRanking(archive,'s2').map(row => [row.id,row.points]), [['bitchyounotayop',40]]);
assert.equal(legacyRanking(archive,'s3').find(row => row.id === 'wasi').points, 50);
assert.equal(legacyRanking(archive,'s3').find(row => row.id === 'jaykurtt').points, 10);
assert.ok(!archive.awards.some(row => /judge|wildcard|bye|approval/.test(row.event)));
assert.equal(archive.matches.find(row => row.id === 'final').outOf, 50);
assert.equal(archive.matches.filter(row => row.outOf == null).length, 1);

if (process.argv.includes('--award-json')) {
  console.log(JSON.stringify(archive.awards.map(row => [row.season, row.person, row.event, row.points])));
} else if (!process.argv.includes('--sql')) {
  console.log('PASS: 13 matches, 12 teams, 20 attributed artists, 2 unresolved teams, 1 verified S2 title, 53 non-spendable award rows.');
} else {
  const val = value => value == null ? 'null' : typeof value === 'number' ? String(value) : "'" + value.replaceAll("'","''") + "'";
  const insert = (table, columns, rows) => console.log(
    'insert into exm_member.' + table + '(' + columns + ') values\n' +
    rows.map(row => '(' + row.map(val).join(',') + ')').join(',\n') + '\non conflict do nothing;');
  const people = [...archive.people.values()];
  insert('reserved_handles','username',people.map(person => [person.id]));
  insert('roster_credits','handle,credit,category,route',
    people.map(person => [person.id,person.name,'roster','/legacy?artist=' + person.id]));
  insert('songwars_legacy_seasons','season,label,held_on,verification,source,credits',
    source.seasons.map(season => [season.id,season.label,season.date,season.status,
      season.source || 'EXM War Archive',JSON.stringify(season.credits)]));
  insert('songwars_legacy_teams','season,team,name',source.teams.map(team => ['s3', team.id,team.name]));
  insert('songwars_legacy_credits','season,team,person,credited_as,source',people.map(person =>
    ['s3',person.team.id,person.id,person.name,'EXM official results + November approved roster identity check']));
  insert('songwars_legacy_matches','season,match_key,stage,winner,opponent,winner_score,opponent_score,denominator,source,verification',
    archive.matches.map(row => ['s3',row.id,row.stage,row.winner.id,row.opponent.id,row.score,row.opponentScore,row.outOf,'EXM official results','verified']));
  insert('songwars_legacy_awards','season,person,source_key,legacy_points',archive.awards.map(row => [row.season,row.person,row.event,row.points]));
}
