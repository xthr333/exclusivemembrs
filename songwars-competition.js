export function rankCompetition(artists, season) {
  const compareRecord = (left, right) =>
    right.titles - left.titles ||
    (right.wins ?? 0) - (left.wins ?? 0) ||
    (right.round?.order ?? 0) - (left.round?.order ?? 0);

  const standings = artists.flatMap(artist => {
    const records = artist.seasons.filter(record => season === 'all' || record.id === season);
    const archiveTitles = (artist.archiveCredits ?? []).filter(id => season === 'all' || id === season);
    if (!records.length && !archiveTitles.length) return [];
    const scored = records.filter(record => Number.isInteger(record.wins));
    const round = records.reduce((best, record) =>
      record.round && (!best || record.round.order > best.order) ? record.round : best, null);
    return [{
      ...artist,
      titles: new Set([...records.filter(record => record.champion).map(record => record.id), ...archiveTitles]).size,
      appearances: new Set([...records.map(record => record.id), ...archiveTitles]).size,
      wins: scored.length ? scored.reduce((sum, record) => sum + record.wins, 0) : null,
      round,
    }];
  }).sort((left, right) => compareRecord(left, right) ||
    left.name.localeCompare(right.name, 'en') || left.id.localeCompare(right.id, 'en'));

  for (const [index, entry] of standings.entries()) {
    const previous = standings[index - 1];
    entry.rank = previous && compareRecord(previous, entry) === 0 ? previous.rank : index + 1;
  }
  return standings.slice(0, 50);
}
