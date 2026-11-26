import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { legacyArchive } from './songwars-legacy-data.mjs';

const source = JSON.parse(readFileSync(new URL('../content/songwars-legacy.json', import.meta.url)));
const archive = legacyArchive(source);
const final = archive.matches.find(match => match.stage === 'Final');
const results = [...source.seasons].reverse().map(({ id, label, credits }) => ({
  id, label,
  winner: id === 's3' ? final.winner.name : credits[0],
  ...(id === 's3' ? { artists: credits, finalScore: [final.score, final.opponentScore] } : {}),
}));
const brackets = archive.matches.map(({ id, stage, winner, opponent, score, opponentScore, outOf }) => ({
  id, stage, winner: winner.name, opponent: opponent.name,
  ...(outOf == null ? {} : { score, opponentScore, outOf }),
}));
const artists = [...archive.people.values()].map(({ id, name, link, team }) => ({
  id, name, ...(link ? { link } : {}),
  seasons: ['s3', 's2'].flatMap(season => {
    const awards = archive.awards.filter(row => row.person === id && row.season === season);
    if (!awards.length) return [];
    return [{
      id: season, points: awards.reduce((sum, row) => sum + row.points, 0),
      ...(season === 's3' ? { wins: team.wins, bouts: team.bouts.map(match => ({
        id: match.id, won: match.winner === team,
      })) } : {}),
      ...(awards.some(row => row.event === 'championship') ? { champion: true } : {}),
    }];
  }),
}));
const generated = [
  ['songwars-legacy.json', { results, brackets, artists, producers: [] }],
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
