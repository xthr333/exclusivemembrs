(() => {
  const byId = id => document.getElementById(id);
  const rolesText = roles => roles.map(role => role[0].toUpperCase() + role.slice(1)).join(' · ');
  const api = path => '/api/members/' + path;

  function renderAvatar(avatar, profile) {
    if (profile.avatar === 'custom') {
      const photo = document.createElement('img');
      photo.src = api('avatar?username=' + encodeURIComponent(profile.username));
      photo.className = 'member-photo';
      photo.width = photo.height = 96;
      photo.alt = '';
      photo.addEventListener('error', () => { avatar.textContent = profile.username.slice(0, 2).toUpperCase(); }, { once: true });
      avatar.replaceChildren(photo);
    } else if (profile.avatar === 'chrome') {
      const logo = document.createElement('img');
      logo.src = 'assets/brand/exm-logo.webp';
      logo.width = 90;
      logo.height = 36;
      logo.alt = '';
      avatar.replaceChildren(logo);
    } else {
      avatar.textContent = profile.username.slice(0, 2).toUpperCase();
    }
  }

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
          const avatar = document.createElement('span');
          avatar.className = 'member-avatar';
          avatar.setAttribute('aria-hidden', 'true');
          renderAvatar(avatar, profile);
          item.append(avatar, link, detail);
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
    const block = byId('public-profile-block');
    const username = new URLSearchParams(location.search).get('username') || '';
    let following = false;
    let blocked = false;

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
      renderAvatar(byId('public-avatar'), profile);
      byId('public-profile-team').textContent = profile.staffRoles.length
        ? 'EXM team · ' + profile.staffRoles.map(role => role.replaceAll('_', ' ')).join(' · ') : '';
      byId('public-champion').hidden = !profile.champion;
      byId('public-profile-links').replaceChildren(...profile.links.map(value => {
        const url = new URL(value);
        const item = document.createElement('li');
        if (url.protocol === 'https:') {
          const link = document.createElement('a');
          link.href = url.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = url.hostname.replace(/^www\./, '') + ' ↗';
          item.append(link);
        }
        return item;
      }));
      const history = byId('public-profile-history');
      history.hidden = !profile.verifiedActivity.length;
      history.querySelector('ul').replaceChildren(...profile.verifiedActivity.map(entry => {
        const item = document.createElement('li');
        item.textContent = new Date(entry.occurred_at).toLocaleDateString(undefined, { timeZone: 'UTC' }) +
          ' · ' + entry.activity.replaceAll('_', ' ');
        return item;
      }));
      byId('public-profile-counts').textContent = profile.followers + (profile.followers === 1 ? ' follower' : ' followers') + ' · ' + profile.following + ' following';
      block.hidden = !profile.canBlock;
      blocked = profile.blockedByViewer;
      block.textContent = blocked ? 'Unblock member' : 'Block member';
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
    block.addEventListener('click', async () => {
      if (block.disabled) return;
      block.disabled = true;
      try {
        const response = await fetch('/api/platform/set_block', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, blocked: !blocked }),
        });
        if (!response.ok) throw new Error('Block setting unavailable');
        if (await load()) status.textContent = blocked ? 'Member blocked. Manage blocks in the Member hub.' : 'Member unblocked.';
      } catch {
        status.textContent = 'Could not update the block. Try again.';
      } finally {
        block.disabled = false;
      }
    });
    load().catch(() => { status.textContent = 'Member profiles are temporarily unavailable.'; });
  }
})();
