(() => {
  const byId = id => document.getElementById(id);
  const status = byId('account-status');
  const access = byId('account-access');
  const dashboard = byId('member-dashboard');
  const profile = byId('member-profile');
  const codes = byId('member-codes');
  const codesList = byId('member-codes-list');
  const recoveryReference = byId('member-recovery-reference');

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
    profile.elements.discoverable.checked = account.discoverable;
    byId('account-handle').textContent = '@' + account.username;
    byId('recovery-reference-value').textContent = '';
    recoveryReference.hidden = true;
    status.textContent = '';
    access.hidden = true;
    dashboard.hidden = false;
    return true;
  }

  function onSubmit(form, handle) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      status.textContent = 'Working…';
      try {
        await handle(Object.fromEntries(new FormData(form)), form);
      } catch {
        status.textContent = 'Member accounts are temporarily unavailable. Please try again.';
      } finally {
        button.disabled = false;
      }
    });
  }

  onSubmit(byId('member-signup'), async (formData, form) => {
    const { code, data } = await request('signup', formData);
    status.textContent = data.message || data.error || 'Account setup is temporarily unavailable.';
    if (code === 202) {
      byId('login-email').value = formData.email;
      byId('login-password').focus();
      form.reset();
    }
  });

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
    await showSession();
  });

  onSubmit(byId('member-recover'), async (formData, form) => {
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
    const { code, data } = await request('profile', { ...formData, discoverable: profile.elements.discoverable.checked });
    status.textContent = code === 200 ? 'Profile saved.' : data.error || 'Could not save your profile.';
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

  showSession().catch(() => { status.textContent = 'Member accounts are temporarily unavailable.'; });
})();
