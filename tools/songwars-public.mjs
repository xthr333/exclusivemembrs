import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { legacyArchive } from './songwars-legacy-data.mjs';

const source = JSON.parse(readFileSync(new URL('../content/songwars-legacy.json', import.meta.url)));
const archive = legacyArchive(source);
const seasonThreeRounds = source.seasons.find(season => season.id === 's3').rounds;
const roundByStage = new Map(seasonThreeRounds.map(({ stage, order, label }) => [stage, { order, label }]));
assert.equal(roundByStage.size, seasonThreeRounds.length);
assert.ok(new Set(seasonThreeRounds.map(round => round.order)).size === seasonThreeRounds.length);
assert.ok(seasonThreeRounds.every(round => Number.isInteger(round.order) && round.order > 0 && round.label));
assert.ok(archive.matches.every(match => roundByStage.has(match.stage)));
for (const season of source.seasons.filter(season => season.creditedArtist)) {
  assert.ok(archive.people.has(season.creditedArtist));
  assert.ok(season.credits.includes(archive.people.get(season.creditedArtist).name));
}

const final = archive.matches.find(match => match.stage === 'Final');
const seasonTwo = source.seasons.find(season => season.id === 's2');
const results = [...source.seasons].reverse().map(({ id, label, status, credits }) => ({
  id, label,
  ...(status === 'pending' ? { listedArtist: credits[0] } : { winner: id === 's3' ? final.winner.name : credits[0] }),
  ...(id === 's3' ? { artists: credits, finalScore: [final.score, final.opponentScore] } : {}),
}));
const brackets = archive.matches.map(({ id, stage, winner, opponent, score, opponentScore, outOf }) => ({
  id, stage, winner: winner.name, opponent: opponent.name,
  ...(outOf == null ? {} : { score, opponentScore, outOf }),
}));
const artists = [...archive.people.values()].map(({ id, name, link, team }) => ({
  id, name, ...(link ? { link } : {}),
  archiveCredits: source.seasons.filter(season => season.status === 'archive' && season.creditedArtist === id)
    .map(season => season.id),
  archiveListings: source.seasons.filter(season => season.status === 'pending' && season.creditedArtist === id)
    .map(season => season.id),
  seasons: ['s3', 's2'].flatMap(season => {
    const played = season === 's3' && team.bouts.length > 0;
    const champion = season === 's3' ? final.winner === team :
      seasonTwo.status === 'verified' && seasonTwo.creditedArtist === id;
    if (!played && !champion) return [];
    const awards = archive.awards.filter(row => row.person === id && row.season === season);
    return [{
      id: season, points: awards.reduce((sum, row) => sum + row.points, 0),
      ...(played ? {
        wins: team.wins,
        round: team.bouts.map(match => roundByStage.get(match.stage))
          .reduce((best, current) => current.order > best.order ? current : best),
        bouts: team.bouts.map(match => ({ id: match.id, won: match.winner === team })),
      } : {}),
      ...(champion ? { champion: true } : {}),
    }];
  }),
}));
const producerDiscovery = source.producerDiscovery.map(({ id, name, link }) => ({ id, name, link }));
const generated = [
  ['songwars-legacy.json', { results, brackets, artists, producers: [], producerDiscovery }],
  ['songwars-public.json', { results }],
];
for (const [file, data] of generated) {
  const path = new URL('../' + file, import.meta.url);
  const contents = JSON.stringify(data, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    assert.equal(readFileSync(path, 'utf8'), contents, file + ' is stale. Run npm run sync-layout.');
  } else {
    writeFileSync(path, contents);
  }
}
