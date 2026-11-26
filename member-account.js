(() => {
  const byId = id => document.getElementById(id);
  const status = byId('account-status');
  const access = byId('account-access');
  const dashboard = byId('member-dashboard');
  const profile = byId('member-profile');
  const codes = byId('member-codes');
  const codesList = byId('member-codes-list');
  const recoveryReference = byId('member-recovery-reference');
  const rosterBadges = byId('account-roster-badges');
  const hosted = Boolean(window.EXMHostedMode);
  const rewardsDestination = 'member-hub.html#rewards';
  const returnToRewards = window.EXMHostedMode !== 'events' &&
    new URLSearchParams(location.search).get('next') === 'rewards';
  const continueRewards = byId('account-continue-rewards');
  const photo = byId('profile-photo');
  const photoPreview = byId('profile-photo-preview');
  const photoStatus = byId('profile-photo-status');
  const saveStatus = byId('profile-save-status');
  const saveButton = profile.querySelector('button[type="submit"]');
  let pendingPhoto = null;
  let photoVersion = 0;
  let preparingPhoto = false;

  // Canvas can emit extended WebP with a color profile. Keep only the opaque
  // still-image chunk so the server can enforce its narrow avatar format.
  function avatarWebp(data) {
    const prefix = 'data:image/webp;base64,';
    if (!data.startsWith(prefix)) return '';
    const bytes = Uint8Array.from(atob(data.slice(prefix.length)), c => c.charCodeAt(0));
    if (bytes.length < 20) return '';
    const tag = offset => String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const view = new DataView(bytes.buffer);
    if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length) return '';
    if (tag(12) !== 'VP8X') return data;
    if (view.getUint32(16, true) !== 10 || bytes.length < 30 || bytes[20] !== 0x20) return '';
    let still = null;
    for (let i = 30; i + 8 <= bytes.length;) {
      const size = view.getUint32(i + 4, true);
      const end = i + 8 + size + (size % 2);
      if (end > bytes.length) return '';
      if (['VP8 ', 'VP8L'].includes(tag(i))) {
        if (still || end !== bytes.length) return '';
        still = bytes.subarray(i, end);
      } else if (tag(i) !== 'ICCP') return '';
      i = end;
    }
    if (!still) return '';
    const clean = new Uint8Array(12 + still.length);
    clean.set(bytes.subarray(0, 12));
    new DataView(clean.buffer).setUint32(4, clean.length - 8, true);
    clean.set(still, 12);
    let binary = '';
    for (const byte of clean) binary += String.fromCharCode(byte);
    return prefix + btoa(binary);
  }

  photo.addEventListener('change', async () => {
    const version = ++photoVersion;
    pendingPhoto = null;
    photoPreview.hidden = true;
    const file = photo.files[0];
    if (!file) {
      preparingPhoto = false;
      saveButton.disabled = false;
      photoStatus.textContent = '';
      restoreAvatarPreview();
      return;
    }
    preparingPhoto = true;
    saveButton.disabled = true;
    saveStatus.textContent = '';
    photoStatus.textContent = 'Preparing your preview…';
    const url = URL.createObjectURL(file);
    try {
      if (file.size > 25 * 1024 * 1024) {
        throw new Error('This photo is over 25 MB. Choose a smaller photo.');
      }
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('This browser could not open the photo. On iPhone, try a screenshot or export it as JPEG.'));
        image.src = url;
      });
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 50_000_000) {
        throw new Error('Choose a photo up to 50 megapixels.');
      }
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('This browser could not make an avatar preview.');
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      ctx.fillStyle = '#20222b';
      ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 256, 256);
      let optimized;
      for (const quality of [.83, .7, .55, .4]) {
        optimized = avatarWebp(canvas.toDataURL('image/webp', quality));
        if (optimized.startsWith('data:image/webp;base64,') && optimized.length <= 65559) break;
      }
      if (!optimized.startsWith('data:image/webp;base64,') || optimized.length > 65559) {
        throw new Error('This browser could not make a small WebP. Try a different image or browser.');
      }
      if (version !== photoVersion) return;
      pendingPhoto = optimized.split(',')[1];
      photoPreview.src = optimized;
      photoPreview.hidden = false;
      profile.elements.avatar.value = 'custom';
      photoStatus.textContent = 'Photo ready. Tap Save profile below to apply it.';
    } catch (error) {
      if (version === photoVersion) {
        photoStatus.textContent = error.message;
        photo.value = '';
        restoreAvatarPreview();
      }
    } finally {
      URL.revokeObjectURL(url);
      if (version === photoVersion) {
        preparingPhoto = false;
        saveButton.disabled = false;
      }
    }
  });

  let savedAvatar = 'initials';
  let savedAvatarURL = '';
  function restoreAvatarPreview() {
    profile.elements.avatar.value = savedAvatar;
    photoPreview.hidden = savedAvatar !== 'custom' || !savedAvatarURL;
    if (!photoPreview.hidden) photoPreview.src = savedAvatarURL;
  }

  async function request(action, payload) {
    const response = await fetch('/api/members/' + action, payload === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    return { code: response.status, data };
  }

  function showAccess() {
    status.textContent = '';
    access.hidden = false;
    dashboard.hidden = true;
    codesList.replaceChildren();
    codes.hidden = true;
    continueRewards.hidden = true;
    ++photoVersion;
    preparingPhoto = false;
    saveButton.disabled = false;
    saveStatus.textContent = '';
    pendingPhoto = null;
    photo.value = '';
    photoPreview.removeAttribute('src');
    photoPreview.hidden = true;
    photoStatus.textContent = '';
    rosterBadges.replaceChildren();
    rosterBadges.hidden = true;
  }

  async function showRosterBadges(username) {
    rosterBadges.replaceChildren();
    rosterBadges.hidden = true;
    if (!hosted) return;
    const { code, data } = await request('roster-credits');
    if (code !== 200 || dashboard.hidden || byId('account-handle').textContent !== '@' + username) return;
    const entry = data.entries.find(candidate => candidate.linked && candidate.handle === username);
    if (!entry) return;
    const labels = [
      ...(entry.founder ? ['Founder'] : []),
      ...(entry.category === 'artist' ? ['EXM Artist'] : entry.category === 'producer' ? ['EXM Producer'] : []),
      ...entry.titles.map(title => 'SongWars champion · ' + title.title),
    ];
    for (const label of labels) {
      const badge = document.createElement('span');
      badge.className = label === 'Founder' ? 'champion-mark founder-mark' : 'champion-mark';
      badge.textContent = label;
      rosterBadges.append(badge, ' ');
    }
    rosterBadges.hidden = labels.length === 0;
  }

  async function showSession() {
    const { code, data } = await request('session');
    if (code === 401) {
      showAccess();
      return false;
    }
    if (code !== 200 || !data.profile) throw new Error('Member API unavailable');
    const account = data.profile;
    profile.elements.displayName.value = account.displayName;
    profile.elements.bio.value = account.bio;
    savedAvatar = account.avatar;
    savedAvatarURL = '/api/members/avatar?username=' + encodeURIComponent(account.username);
    if (!pendingPhoto) {
      restoreAvatarPreview();
    }
    profile.querySelectorAll('[name="links"]').forEach((input, position) => {
      input.value = account.links[position] || '';
    });
    profile.elements.discoverable.checked = account.discoverable;
    for (const input of profile.querySelectorAll('[name="creativeRoles"]')) {
      input.checked = account.creativeRoles.includes(input.value);
    }
    byId('account-handle').textContent = '@' + account.username;
    byId('recovery-reference-value').textContent = '';
    recoveryReference.hidden = true;
    status.textContent = '';
    access.hidden = true;
    dashboard.hidden = false;
    if (['#edit-profile', '#profile-visibility'].includes(location.hash)) {
      byId(location.hash.slice(1)).scrollIntoView();
    }
    showRosterBadges(account.username).catch(() => {});
    return true;
  }

  function onSubmit(form, handle) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const isProfile = form === profile;
      if (button.disabled) return;
      button.disabled = true;
      if (isProfile) photo.disabled = true;
      const feedback = isProfile ? saveStatus : status;
      feedback.textContent = isProfile ? 'Saving profile…' : 'Working…';
      try {
        await handle(Object.fromEntries(new FormData(form)), form);
      } catch {
        feedback.textContent = 'Member accounts are temporarily unavailable. Please try again.';
      } finally {
        if (isProfile) photo.disabled = false;
        button.disabled = isProfile && preparingPhoto;
      }
    });
  }

  /* exm:fixture */
  onSubmit(byId('member-signup'), async (formData, form) => {
    const { code, data } = await request('signup', formData);
    status.textContent = data.message || data.error || 'Account setup is temporarily unavailable.';
    if (code === 202) {
      byId('login-email').value = formData.email;
      byId('login-password').focus();
      form.reset();
    }
  });
  /* /exm:fixture */

  if (window.EXMPublicSignup === true) {
    const signupPanel = byId('public-signup');
    const start = byId('public-signup-start');
    const verify = byId('public-signup-verify');
    const finish = byId('public-signup-finish');
    let signupEmail = '';
    const showSignupStep = step => {
      for (const form of [start, verify, finish]) form.hidden = form !== step;
      step.querySelector('input').focus();
    };

    signupPanel.hidden = false;
    onSubmit(start, async formData => {
      const { code, data } = await request('signup', {
        email: formData.email, birthDate: formData.birthDate, privacyAccepted: formData.privacyAccepted === 'on',
      });
      status.textContent = data.message || data.error || 'Signup is temporarily unavailable.';
      if (code !== 202) return;
      signupEmail = formData.email;
      start.reset();
      showSignupStep(verify);
    });
    onSubmit(verify, async formData => {
      const { code, data } = await request('signup-verify', { email: signupEmail, code: formData.code });
      if (code !== 200) {
        status.textContent = data.error || 'Email verification is temporarily unavailable.';
        return;
      }
      status.textContent = 'Email verified. Choose your username and password.';
      verify.reset();
      showSignupStep(finish);
    });
    onSubmit(finish, async formData => {
      const { code, data } = await request('signup-complete', formData);
      status.textContent = data.message || data.error || 'Signup is temporarily unavailable.';
      if (code === 401) {
        finish.reset();
        byId('public-signup-email').value = signupEmail;
        showSignupStep(start);
      } else if (code === 201) {
        finish.reset();
        byId('login-email').value = signupEmail;
        signupEmail = '';
        start.hidden = false;
        finish.hidden = true;
        byId('login-password').focus();
      }
    });
    byId('public-signup-restart').addEventListener('click', () => {
      verify.reset();
      status.textContent = '';
      byId('public-signup-email').value = signupEmail;
      showSignupStep(start);
    });
  }

  onSubmit(byId('member-login'), async (formData, form) => {
    const { code, data } = await request('login', formData);
    if (code !== 200) {
      status.textContent = data.error || 'Sign-in is temporarily unavailable.';
      return;
    }
    form.reset();
    // Show the one-time copy immediately even if the following session read fails.
    access.hidden = true;
    dashboard.hidden = false;
    codes.hidden = !data.recoveryCodes?.length;
    const items = (data.recoveryCodes || []).map(code => {
      const item = document.createElement('li');
      const value = document.createElement('code');
      value.textContent = code;
      item.append(value);
      return item;
    });
    codesList.replaceChildren(...items);
    if (await showSession() && returnToRewards) {
      if (items.length) continueRewards.hidden = false;
      else location.replace(rewardsDestination);
    }
  });

  if (window.EXMHostedMode === 'events') {
    const recoveryForm = byId('member-recover');
    recoveryForm.previousElementSibling.textContent = 'Contact EXM support for account assistance.';
    recoveryForm.replaceWith(Object.assign(document.createElement('a'), {
      href: 'contact.html', textContent: 'Contact EXM support',
    }));
  } else onSubmit(byId('member-recover'), async (formData, form) => {
    recoveryReference.hidden = true;
    byId('recovery-reference-value').textContent = '';
    const { code, data } = await request('recover', formData);
    status.textContent = data.error || (code === 200 ? 'Recovery reference created.' : 'Recovery is temporarily unavailable.');
    if (code !== 200) return;
    byId('recovery-reference-value').textContent = data.reference;
    recoveryReference.hidden = false;
    form.reset();
  });

  onSubmit(profile, async formData => {
    const progress = byId('profile-save-progress');
    progress.textContent = '';
    const { code, data } = await request('profile', {
      ...formData,
      creativeRoles: new FormData(profile).getAll('creativeRoles'),
      links: new FormData(profile).getAll('links').map(link => link.trim()).filter(Boolean),
      discoverable: profile.elements.discoverable.checked,
      avatarData: formData.avatar === 'custom' ? pendingPhoto : null,
    });
    saveStatus.textContent = code === 200 ? 'Profile saved.' : data.error || 'Could not save your profile.';
    if (code === 200) {
      savedAvatar = formData.avatar;
      pendingPhoto = null;
      photo.value = '';
      photoStatus.textContent = '';
      restoreAvatarPreview();
      const awards = (data.awards || []).map(award => award === 'first_bio' ? 'First bio earned.' : 'First custom avatar earned.').join(' ');
      const wallet = data.progress;
      if (wallet) progress.textContent = [awards, wallet.points + ' spendable points.',
        wallet.xp + ' lifetime XP.', wallet.nextLevelXp ? (wallet.nextLevelXp - wallet.xp) + ' XP to the next level.' : ''].filter(Boolean).join(' ');
    }
  });

  byId('member-logout').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const { code, data } = await request('logout', {});
      if (code === 200 || code === 401) showAccess();
      else status.textContent = data.error || 'Could not sign out.';
    } catch {
      status.textContent = 'Could not sign out. Please try again.';
    } finally {
      button.disabled = false;
    }
  });

  /* exm:fixture */
  fetch('/api/preview/login').then(async response => {
    if (!response.ok) return;
    const { profiles } = await response.json();
    byId('preview-signin').hidden = false;
    const group = byId('preview-signin-buttons');
    for (const name of profiles) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-dark';
      button.textContent = 'Test ' + name;
      button.addEventListener('click', async () => {
        if (group.querySelector('button:disabled')) return;
        button.disabled = true;
        try {
          const result = await fetch('/api/preview/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: name }),
          });
          if (result.ok) location.assign('member-hub.html');
          else status.textContent = (await result.json()).error || 'Preview sign-in is unavailable.';
        } catch {
          status.textContent = 'Preview sign-in is unavailable.';
        } finally {
          button.disabled = false;
        }
      });
      group.append(button);
    }
  }).catch(() => {});

  if (location.hostname === 'localhost' && new URLSearchParams(location.search).has('test-fixture')) {
    byId('fixture-signup').hidden = false;
  }
  /* /exm:fixture */
  showSession().then(signedIn => {
    if (signedIn && returnToRewards && codes.hidden) location.replace(rewardsDestination);
  }).catch(() => { status.textContent = 'Member accounts are temporarily unavailable.'; });
})();
