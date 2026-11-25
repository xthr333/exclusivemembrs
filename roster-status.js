(() => {
  if (location.hostname !== 'exclusivemembrs.com') return;
  const statuses = document.querySelectorAll('[data-roster-status]');
  if (!statuses.length) return;
  fetch('/api/members/roster-credits').then(async response => {
    if (!response.ok) return;
    const { entries } = await response.json();
    const byHandle = new Map(entries.map(entry => [entry.handle, entry]));
    for (const status of statuses) {
      const entry = byHandle.get(status.dataset.rosterStatus);
      if (entry) status.textContent = entry.linked ? 'Verified account' : 'Unclaimed';
    }
  }).catch(() => {});
})();
