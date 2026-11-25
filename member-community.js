(() => {
  const byId = id => document.getElementById(id);
  const rolesText = roles => roles.map(role => role[0].toUpperCase() + role.slice(1)).join(' · ');
  const api = path => '/api/members/' + path;

  const filters = byId('directory-filters');
  if (filters) {
    const status = byId('directory-status');
    const results = byId('directory-results');
    const more = byId('directory-more');
    const search = filters.querySelector('button');
    let params = new URLSearchParams();
    let after = '';

    async function load(append) {
      status.textContent = 'Loading members…';
      if (!append) {
        results.replaceChildren();
        more.hidden = true;
      }
      search.disabled = true;
      more.disabled = true;
      try {
        const query = new URLSearchParams(params);
        if (append) query.set('after', after);
        const response = await fetch(api('directory?' + query));
        if (!response.ok) throw new Error('Directory unavailable');
        const { profiles, nextAfter } = await response.json();
        const items = profiles.map(profile => {
          const item = document.createElement('li');
          item.className = 'platform-card';
          const link = document.createElement('a');
          link.className = 'text-link';
          link.href = 'member.html?username=' + encodeURIComponent(profile.username);
          link.textContent = profile.displayName;
          const detail = document.createElement('p');
          detail.textContent = '@' + profile.username + (profile.creativeRoles.length ? ' · ' + rolesText(profile.creativeRoles) : '');
          item.append(link, detail);
          return item;
        });
        results.append(...items);
        after = nextAfter || '';
        filters.hidden = false;
        more.hidden = !after;
        status.textContent = results.children.length ? 'Showing ' + results.children.length + ' members.' : 'No members matched this search.';
      } catch {
        status.textContent = 'The member directory is temporarily unavailable. The artist roster above is available.';
      } finally {
        search.disabled = false;
        more.disabled = false;
      }
    }
    filters.addEventListener('submit', event => {
      event.preventDefault();
      params = new URLSearchParams(new FormData(filters));
      load(false);
    });
    more.addEventListener('click', () => load(true));
    load(false);
  }

  const details = byId('public-profile');
  if (details) {
    const status = byId('public-profile-status');
    const button = byId('public-profile-follow');
    const username = new URLSearchParams(location.search).get('username') || '';
    let following = false;

    async function load() {
      const response = await fetch(api('public-profile?username=' + encodeURIComponent(username)));
      if (response.status === 404) {
        details.hidden = true;
        status.textContent = 'This profile is unavailable.';
        return false;
      }
      if (!response.ok) throw new Error('Profile unavailable');
      const { profile } = await response.json();
      byId('member-name').textContent = profile.displayName;
      byId('public-profile-handle').textContent = '@' + profile.username;
      byId('public-profile-roles').textContent = rolesText(profile.creativeRoles);
      byId('public-profile-bio').textContent = profile.bio;
      byId('public-profile-counts').textContent = profile.followers + (profile.followers === 1 ? ' follower' : ' followers') + ' · ' + profile.following + ' following';
      button.hidden = !profile.canFollow;
      following = profile.isFollowing;
      button.textContent = following ? 'Unfollow' : 'Follow';
      details.hidden = false;
      status.textContent = '';
      return true;
    }

    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await fetch(api('follow'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, follow: !following }),
        });
        if (response.status === 401) {
          status.textContent = 'Sign in to follow members.';
          return;
        }
        if (!response.ok) throw new Error('Follow unavailable');
        if (await load()) status.textContent = following ? 'Following this member.' : 'Unfollowed this member.';
      } catch {
        status.textContent = 'Could not update this follow. Please try again.';
      } finally {
        button.disabled = false;
      }
    });
    load().catch(() => { status.textContent = 'Member profiles are temporarily unavailable.'; });
  }
})();
