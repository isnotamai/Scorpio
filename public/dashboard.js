(function() {
  'use strict';

  // -- Auth helpers --

  function getToken() { return localStorage.getItem('scorpio_token'); }
  function getUser() { try { return JSON.parse(localStorage.getItem('scorpio_user')); } catch { return null; } }
  function setAuth(token, user) {
    localStorage.setItem('scorpio_token', token);
    localStorage.setItem('scorpio_user', JSON.stringify(user));
  }
  function clearAuth() {
    localStorage.removeItem('scorpio_token');
    localStorage.removeItem('scorpio_user');
  }
  function authFetch(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, opts);
  }

  // Redirect to home if not logged in
  if (!getToken()) {
    window.location.href = '/';
    return;
  }

  // -- Ripple effect --

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.setProperty('--x', (e.clientX - rect.left) + 'px');
    ripple.style.setProperty('--y', (e.clientY - rect.top) + 'px');
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });

  // -- Toast --

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg || 'Done';
    toast.classList.remove('is-visible');
    void toast.offsetWidth;
    toast.classList.add('is-visible');
    setTimeout(() => toast.classList.remove('is-visible'), 1500);
  }

  function copyText(text) {
    navigator.clipboard.writeText(text);
    showToast('Copied!');
  }

  // -- Helpers --

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  }

  function formatDate(str) {
    if (!str) return '';
    const d = new Date(str.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
  }

  // -- Topbar --

  const cachedUser = getUser();
  if (cachedUser) {
    document.getElementById('auth-username').textContent = cachedUser.username;
    const badge = document.getElementById('auth-role-badge');
    badge.textContent = cachedUser.role || 'user';
    badge.className = 'auth-role-badge role-' + (cachedUser.role || 'user');
  }

  document.getElementById('btn-logout').addEventListener('click', async () => {
    try { await authFetch('/api/logout', {method: 'POST'}); } catch {}
    clearAuth();
    window.location.href = '/';
  });

  // -- Dashboard --

  async function loadDashboard() {
    // Pre-populate profile from cache
    if (cachedUser) {
      const un = cachedUser.username || '?';
      document.getElementById('dash-avatar').textContent = un.charAt(0).toUpperCase();
      document.getElementById('dash-profile-name').textContent = un;
      const rb = document.getElementById('dash-role-badge');
      rb.textContent = cachedUser.role || 'user';
      rb.className = 'auth-role-badge role-' + (cachedUser.role || 'user');
    }

    try {
      const res = await authFetch('/api/me');
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { clearAuth(); window.location.href = '/'; return; }
        throw new Error(data.error);
      }

      // Update stored user with fresh role
      setAuth(getToken(), data.user);

      // Topbar
      document.getElementById('auth-username').textContent = data.user.username;
      const topBadge = document.getElementById('auth-role-badge');
      topBadge.textContent = data.user.role || 'user';
      topBadge.className = 'auth-role-badge role-' + (data.user.role || 'user');
      const isUnlimited = data.quota.max === -1;
      const quotaText = isUnlimited ? data.quota.used + '/\u221E' : data.quota.used + '/' + data.quota.max;
      document.getElementById('auth-quota').textContent = quotaText;

      // Profile card
      const username = data.user.username || '?';
      document.getElementById('dash-avatar').textContent = username.charAt(0).toUpperCase();
      document.getElementById('dash-profile-name').textContent = username;
      const roleBadge = document.getElementById('dash-role-badge');
      roleBadge.textContent = data.user.role || 'user';
      roleBadge.className = 'auth-role-badge role-' + (data.user.role || 'user');

      // Quota bar
      const pct = isUnlimited ? 0 : Math.round((data.quota.used / data.quota.max) * 100);
      const fill = document.getElementById('dash-quota-fill');
      fill.style.width = isUnlimited ? '0%' : pct + '%';
      fill.classList.toggle('is-full', !isUnlimited && data.quota.used >= data.quota.max);
      document.getElementById('dash-quota-text').textContent = isUnlimited
        ? data.quota.used + ' / \u221E (unlimited)'
        : data.quota.used + ' / ' + data.quota.max;

      // Stats
      document.getElementById('dash-stat-files').textContent = data.files.length;
      document.getElementById('dash-stat-keys').textContent = data.api_keys.length;
      document.getElementById('dash-stat-usage').textContent = isUnlimited ? '\u221E' : pct + '%';

      // API Keys
      const keysList = document.getElementById('dash-keys-list');
      if (data.api_keys.length === 0) {
        keysList.innerHTML = '<div class="empty-state">No API keys yet</div>';
      } else {
        keysList.innerHTML = data.api_keys.map(k => `
          <div class="key-item">
            <span class="key-label">${escapeHtml(k.label)}</span>
            <div class="key-meta">
              <span class="key-preview">${escapeHtml(k.key_preview)}</span>
              ${k.created_at ? '<span class="key-date">' + formatDate(k.created_at) + '</span>' : ''}
            </div>
            <button class="btn-danger" data-delete-key="${k.id}">Delete</button>
          </div>
        `).join('');
        keysList.querySelectorAll('[data-delete-key]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Delete this API key?')) return;
            const id = btn.dataset.deleteKey;
            const r = await authFetch('/api/keys/' + id, {method: 'DELETE'});
            if (r.ok) loadDashboard();
            else { const d = await r.json(); showToast(d.error || 'Failed'); }
          });
        });
      }

      // Files
      const filesList = document.getElementById('dash-files-list');
      const fileCount = document.getElementById('dash-file-count');
      fileCount.textContent = data.files.length;
      if (data.files.length === 0) {
        filesList.innerHTML = '<div class="empty-state">No files uploaded yet</div>';
      } else {
        filesList.innerHTML = data.files.map(f => {
          const name = f.original_name || f.filename;
          const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif)$/i.test(name);
          const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(name);
          let thumbHtml;
          if (isImage) {
            thumbHtml = '<img class="file-thumb" src="' + escapeHtml(f.url) + '" alt="" loading="lazy">';
          } else if (isVideo) {
            thumbHtml = '<div class="file-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>';
          } else {
            thumbHtml = '<div class="file-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>';
          }
          return `
            <div class="file-item">
              ${thumbHtml}
              <div class="file-details">
                <span class="file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                <div class="file-meta">
                  <span class="file-size">${formatSize(f.size)}</span>
                  ${f.created_at ? '<span class="file-date">' + formatDate(f.created_at) + '</span>' : ''}
                </div>
              </div>
              <div class="file-actions">
                <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" class="icon-btn" title="View">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
                <button class="icon-btn" data-copy-url="${escapeHtml(f.url)}" title="Copy URL">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button class="icon-btn icon-btn--danger" data-delete-file="${f.id}" title="Delete">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
            </div>
          `;
        }).join('');

        filesList.querySelectorAll('[data-copy-url]').forEach(btn => {
          btn.addEventListener('click', () => copyText(btn.dataset.copyUrl));
        });

        filesList.querySelectorAll('[data-delete-file]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Delete this file? This cannot be undone.')) return;
            const id = btn.dataset.deleteFile;
            const r = await authFetch('/api/files/' + id, {method: 'DELETE'});
            if (r.ok) { showToast('File deleted'); loadDashboard(); }
            else { const d = await r.json(); showToast(d.error || 'Failed'); }
          });
        });
      }

      // Admin panel
      const adminPanel = document.getElementById('admin-panel');
      if (data.user.role === 'admin') {
        adminPanel.style.display = 'block';
        loadAdminUsers();
      } else {
        adminPanel.style.display = 'none';
      }
    } catch (err) {
      showToast(err.message || 'Failed to load dashboard');
    }
  }

  // -- Create API Key --

  document.getElementById('dash-create-key').addEventListener('click', async () => {
    const label = prompt('Label for new API key:', 'API Key');
    if (label === null) return;
    try {
      const res = await authFetch('/api/keys', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({label: label || 'API Key'}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      prompt('Your new API key (copy it now, it won\'t be shown again):', data.key);
      loadDashboard();
    } catch (err) {
      showToast(err.message);
    }
  });

  // -- Admin User Management --

  async function loadAdminUsers() {
    try {
      const res = await authFetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) return;

      const list = document.getElementById('admin-users-list');
      if (!data.users.length) {
        list.innerHTML = '<div class="empty-state">No users</div>';
        return;
      }

      list.innerHTML = data.users.map(u => {
        const roleOptions = data.roles.map(r =>
          '<option value="' + r + '"' + (r === u.role ? ' selected' : '') + '>' + r + '</option>'
        ).join('');
        const currentUser = getUser();
        const isSelf = currentUser && currentUser.id === u.id;
        return `
          <div class="user-row">
            <div class="user-info">
              <div class="user-name">${escapeHtml(u.username)}${isSelf ? ' <span style="color:#555">(you)</span>' : ''}</div>
              <div class="user-meta">${u.files} files \u00B7 ${u.api_keys} keys \u00B7 ${u.created_at}</div>
            </div>
            <select data-role-user="${u.id}" ${isSelf ? 'disabled' : ''}>${roleOptions}</select>
            ${isSelf ? '' : '<button class="btn-danger" data-delete-user="' + u.id + '">Delete</button>'}
          </div>
        `;
      }).join('');

      list.querySelectorAll('[data-role-user]').forEach(sel => {
        sel.addEventListener('change', async () => {
          const id = sel.dataset.roleUser;
          const role = sel.value;
          const r = await authFetch('/api/admin/users/' + id + '/role', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({role}),
          });
          if (r.ok) {
            showToast('Role updated');
          } else {
            const d = await r.json();
            showToast(d.error || 'Failed');
            loadAdminUsers();
          }
        });
      });

      list.querySelectorAll('[data-delete-user]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this user and all their data?')) return;
          const id = btn.dataset.deleteUser;
          const r = await authFetch('/api/admin/users/' + id, {method: 'DELETE'});
          if (r.ok) {
            showToast('User deleted');
            loadAdminUsers();
          } else {
            const d = await r.json();
            showToast(d.error || 'Failed');
          }
        });
      });
    } catch (err) {
      showToast(err.message);
    }
  }

  // Load dashboard on init
  loadDashboard();

})();
