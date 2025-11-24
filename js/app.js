// Minimal SPA client for ByteForce API
// Configure your backend URL (Wispbyte host). On Vercel, set NEXT_PUBLIC_BACKEND_URL or replace at deploy.
const BACKEND_URL = http://87.106.82.92:14137 || (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_BACKEND_URL) || 'http://localhost:5000';

function saveToken(token) { localStorage.setItem('bf_token', token); }
function getToken() { return localStorage.getItem('bf_token'); }
function clearToken() { localStorage.removeItem('bf_token'); }

async function api(path, options={}) {
  const headers = Object.assign({'Content-Type': 'application/json'}, options.headers || {});
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch {}
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

function onIndex() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = { username: fd.get('username'), password: fd.get('password') };
    try {
      const resp = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
      saveToken(resp.token);
      location.href = '/dashboard.html';
    } catch (err) {
      showAlert(err.message || 'Login failed');
    }
  });
}

function showAlert(msg) {
  const el = document.getElementById('alert');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function renderDashboard() {
  const user = await api('/api/auth/me');
  document.getElementById('userInfo').textContent = `${user.username} (${user.role})`;
  const stats = await api('/api/stats');
  document.getElementById('stats').textContent = JSON.stringify(stats, null, 2);
  await loadWhitelists();
  await loadLogs();
}

async function loadWhitelists() {
  const items = await api('/api/whitelists');
  const ul = document.getElementById('whitelists');
  ul.innerHTML = '';
  for (const e of items) {
    const li = document.createElement('li');
    const actions = document.createElement('span');
    actions.style.float = 'right';
    const btnPause = document.createElement('button');
    btnPause.textContent = e.is_paused ? 'Resume' : 'Pause';
    btnPause.onclick = async () => { await api(`/api/whitelists/${e.id}/toggle-pause`, { method: 'POST' }); loadWhitelists(); };
    const btnDel = document.createElement('button');
    btnDel.style.marginLeft = '8px'; btnDel.textContent = 'Delete';
    btnDel.onclick = async () => { await api(`/api/whitelists/${e.id}`, { method: 'DELETE' }); loadWhitelists(); };
    actions.append(btnPause, btnDel);
    li.textContent = `${e.uid} [${e.region}] - ${new Date(e.expires_at).toLocaleString()} ${e.is_paused ? '(paused)' : ''}`;
    li.appendChild(actions);
    ul.appendChild(li);
  }
}

async function loadLogs() {
  const items = await api('/api/activity-logs');
  const ul = document.getElementById('logs');
  ul.innerHTML = '';
  for (const l of items) {
    const li = document.createElement('li');
    li.textContent = `${new Date(l.timestamp).toLocaleString()} - ${l.action} - ${l.details || ''}`;
    ul.appendChild(li);
  }
}

function wireDashboardActions() {
  const addForm = document.getElementById('addForm');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(addForm);
      const payload = {
        uid: fd.get('uid'),
        region: fd.get('region'),
        duration_days: parseInt(fd.get('duration_days'), 10)
      };
      try {
        await api('/api/whitelists', { method: 'POST', body: JSON.stringify(payload) });
        addForm.reset();
        await loadWhitelists();
      } catch (err) { alert(err.message); }
    });
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => { clearToken(); location.href = '/'; });
  }
}

(function init() {
  if (location.pathname.endsWith('/admin.html')) {
    if (!getToken()) { location.href = '/'; return; }
    return; // admin.html has its own inline script that calls the API
  }
  if (location.pathname.endsWith('/dashboard.html')) {
    if (!getToken()) { location.href = '/'; return; }
    renderDashboard().catch(err => { alert(err.message || 'Failed to load'); if (err.message.includes('Unauthorized')) { clearToken(); location.href = '/'; }});
    wireDashboardActions();
    return;
  }
  onIndex();
})();
