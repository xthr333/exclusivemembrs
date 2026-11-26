export function legacyArchive(source) {
  const teams = new Map(source.teams.map(team => [team.id, { ...team, wins: 0, losses: 0, bouts: [] }]));
  const people = new Map();
  const awards = [];
  const record = (season, person, event, points) => awards.push({ season, person, event, points });
  for (const team of teams.values()) {
    for (const [id, name, link] of team.artists) {
      if (people.has(id)) throw new Error('Duplicate Season III artist identity.');
      people.set(id, { id, name, link, team, s2: false, s3: true });
      record('s3', id, 'participation', 10);
    }
  }
  const matches = source.matches.map(([id, stage, winnerId, opponentId, score, opponentScore, outOf]) => {
    const winner = teams.get(winnerId);
    const opponent = teams.get(opponentId);
    const match = { id, stage, winner, opponent, score, opponentScore, outOf };
    winner.wins++;
    opponent.losses++;
    winner.bouts.push(match);
    opponent.bouts.push(match);
    for (const [person] of winner.artists) record('s3', person, 'win:' + id, 10);
    if (stage === 'Final') {
      for (const team of [winner, opponent]) {
        for (const [person] of team.artists) record('s3', person, 'finalist', 10);
      }
      for (const [person] of winner.artists) record('s3', person, 'championship', 20);
    }
    return match;
  });
  people.get('bitchyounotayop').s2 = true;
  record('s2', 'bitchyounotayop', 'participation', 10);
  record('s2', 'bitchyounotayop', 'finalist', 10);
  record('s2', 'bitchyounotayop', 'championship', 20);
  return { source, teams, people, matches, awards };
}

export function legacyRanking(archive, season) {
  const totals = new Map();
  for (const row of archive.awards) {
    if (season !== 'all' && row.season !== season) continue;
    totals.set(row.person, (totals.get(row.person) || 0) + row.points);
  }
  const ranked = [...totals].map(([id, points]) => ({ ...archive.people.get(id), points }));
  ranked.sort((left, right) => right.points - left.points || left.name.localeCompare(right.name));
  return ranked.map((person, index) => {
    const tied = ranked.findIndex(row => row.points === person.points);
    return { ...person, rank: Math.min(tied, index) + 1 };
  });
}
