(function () {
  'use strict';
  var META = 'meridukaan.sync.v1';
  var meta = null, active = false, busy = false, timer = null, conflict = null, hooks;
  try { meta = JSON.parse(localStorage.getItem(META) || 'null'); }
  catch (error) { console.error('Cannot read sync metadata:', error); }

  function saveMeta() {
    localStorage.setItem(META, JSON.stringify(meta));
  }
  function status(text) { document.getElementById('syncStatus').textContent = text; }
  function summary(snapshot) {
    var last = snapshot.entries.slice(-3).map(function (entry) {
      var label = entry.itemId || entry.category || entry.type;
      return label + (entry.type === 'adjustment' ? ': stock ' + entry.qty : ': ₹' + entry.amount);
    }).join(', ');
    return snapshot.entries.length + ' entries' + (last ? ' (latest: ' + last + ')' : '');
  }
  function showConflict(remote) {
    conflict = remote;
    var local = hooks.get();
    document.getElementById('syncConflictDetails').textContent =
      'This device: ' + summary(local) + '. Account: ' + summary(remote.snapshot) + '.';
    document.getElementById('syncConflict').hidden = false;
    document.getElementById('syncAlert').hidden = false;
    status('Sync paused: choose which version to keep.');
  }
  function hideConflict() {
    conflict = null;
    document.getElementById('syncConflict').hidden = true;
    document.getElementById('syncAlert').hidden = true;
  }
  async function request(url, options) {
    var response = await fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {}));
    var data;
    try { data = await response.json(); }
    catch (error) { throw new Error('Sync service is unavailable. Your data remains on this device.'); }
    if (!response.ok) {
      var err = new Error(data.error || 'Sync failed.');
      err.status = response.status;
      throw err;
    }
    return data;
  }
  function body(data) {
    return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  }
  function schedule() {
    if (!active || conflict) return;
    clearTimeout(timer);
    timer = setTimeout(sync, 800);
  }
  async function sync() {
    if (!active || busy || conflict) return;
    if (!navigator.onLine) { status('Offline. Changes are saved here and pending sync.'); return; }
    busy = true;
    try {
      var remote = await request('/api/shop');
      if (!meta || meta.username !== remote.username) {
        meta = { username: remote.username, revision: null, dirty: true };
        saveMeta();
      }
      if (remote.snapshot && (meta.revision === null || (remote.revision !== meta.revision && meta.dirty))) {
        showConflict(remote);
        return;
      }
      if (remote.snapshot && remote.revision !== meta.revision && !meta.dirty) {
        if (!hooks.canReplace()) { status('Finish the current entry before syncing.'); return; }
        hooks.replace(remote.snapshot);
        meta.revision = remote.revision;
        saveMeta();
      } else if (meta.dirty || !remote.snapshot) {
        var sent = JSON.stringify(hooks.get());
        var result = await request('/api/shop', Object.assign({ method: 'PUT' }, body({
          revision: remote.revision, snapshot: JSON.parse(sent)
        })));
        meta.revision = result.revision;
        meta.dirty = JSON.stringify(hooks.get()) !== sent;
        saveMeta();
      }
      status(meta.dirty ? 'Changes pending sync.' : 'Synced as ' + meta.username + '.');
    } catch (error) {
      if (error.status === 401) {
        active = false;
        document.getElementById('syncForm').hidden = false;
        document.getElementById('syncLogout').hidden = true;
        hooks.onSessionChange();
        status('Session expired. Sign in again to sync.');
      } else if (error.status === 409) {
        status('Another device changed the account. Checking versions…');
        setTimeout(sync, 0);
      } else status(error.message || 'Sync failed; your data remains on this device.');
    } finally {
      busy = false;
      if (active && meta && meta.dirty && !conflict && navigator.onLine) {
        clearTimeout(timer);
        timer = setTimeout(sync, 10000);
      }
    }
  }
  async function login(register) {
    if (!window.isSecureContext) {
      status('Sync requires HTTPS (or localhost). Your local data is unchanged.');
      return;
    }
    var username = document.getElementById('syncUser').value.trim().toLowerCase();
    var password = document.getElementById('syncPassword').value;
    if (!document.getElementById('syncForm').reportValidity()) return;
    if ((!meta || meta.username !== username) &&
        !window.confirm('Signing in can sync this device’s shop data to this account. Continue?')) return;
    try {
      var user = await request(register ? '/api/register' : '/api/login',
        Object.assign({ method: 'POST' }, body({ username: username, password: password })));
      document.getElementById('syncPassword').value = '';
      document.getElementById('syncPassword').type = 'password';
      document.getElementById('togglePassword').setAttribute('aria-pressed', 'false');
      window.MeriDukaan.renderPasswordToggle();
      active = true;
      if (!meta || meta.username !== user.username) {
        meta = { username: user.username, revision: null, dirty: true };
        saveMeta();
      }
      document.getElementById('syncForm').hidden = true;
      document.getElementById('syncLogout').hidden = false;
      hideConflict();
      hooks.onAuthenticated();
      await sync();
    } catch (error) { status(error.message); }
  }
  async function chooseRemote() {
    if (!window.confirm('Replace all shop data on this device with the account version?')) return;
    if (!hooks.canReplace()) return status('Finish the current entry before replacing data.');
    var before = JSON.stringify(hooks.get());
    try {
      var remote = await request('/api/shop');
      if (!remote.snapshot) throw new Error('The account has no saved version.');
      if (before !== JSON.stringify(hooks.get()) || !hooks.canReplace()) throw new Error('Local data changed. Review the conflict again.');
      hooks.replace(remote.snapshot);
      meta.revision = remote.revision;
      meta.dirty = false;
      saveMeta();
      hideConflict();
      status('Account version loaded on this device.');
    } catch (error) { status(error.message); }
  }
  async function chooseLocal() {
    if (!window.confirm('Replace the account’s complete shop data with this device’s version?')) return;
    try {
      var sent = JSON.stringify(hooks.get());
      var result = await request('/api/shop', Object.assign({ method: 'PUT' }, body({
        revision: conflict.revision, snapshot: JSON.parse(sent)
      })));
      meta.revision = result.revision;
      meta.dirty = JSON.stringify(hooks.get()) !== sent;
      saveMeta();
      hideConflict();
      status('This device’s version was saved to the account.');
      if (meta.dirty) schedule();
    } catch (error) {
      if (error.status === 409) {
        try { showConflict(await request('/api/shop')); }
        catch (refreshError) { status(refreshError.message); }
      } else status(error.message);
    }
  }
  window.ShopSync = {
    init: function (callbacks) {
      hooks = callbacks;
      document.getElementById('togglePassword').addEventListener('click', function () {
        var password = document.getElementById('syncPassword');
        var visible = password.type === 'password';
        password.type = visible ? 'text' : 'password';
        this.setAttribute('aria-pressed', visible ? 'true' : 'false');
        window.MeriDukaan.renderPasswordToggle();
      });
      document.getElementById('syncForm').addEventListener('submit', function (e) { e.preventDefault(); login(false); });
      document.getElementById('syncRegister').addEventListener('click', function () { login(true); });
      document.getElementById('syncKeepLocal').addEventListener('click', chooseLocal);
      document.getElementById('syncKeepRemote').addEventListener('click', chooseRemote);
      document.getElementById('syncLogout').addEventListener('click', async function () {
        try {
          await request('/api/logout', { method: 'POST' });
          active = false;
          hideConflict();
          document.getElementById('syncForm').hidden = false;
          document.getElementById('syncLogout').hidden = true;
          hooks.onSessionChange();
          status('Signed out. Shop data remains on this device.');
        } catch (error) { status(error.message); }
      });
      window.addEventListener('online', schedule);
      setInterval(sync, 30000);
      if (meta && meta.username) {
        active = true;
        document.getElementById('syncForm').hidden = true;
        document.getElementById('syncLogout').hidden = false;
        schedule();
      }
    },
    changed: function () {
      if (!meta) return;
      try { meta.dirty = true; saveMeta(); schedule(); }
      catch (error) { status('Could not save sync status. ' + error.message); }
    },
    isActive: function () { return active; }
  };
})();
