// ByteForce Frontend - Complete Application Logic
// Configure your backend URL (Wispbyte host). On Vercel, set NEXT_PUBLIC_BACKEND_URL
// Auto-detect protocol based on current page to avoid mixed content issues
const getBackendUrl = () => {
    // Check for explicit configuration first
    if (window.BACKEND_URL) return window.BACKEND_URL;
    if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_BACKEND_URL) {
        return process.env.NEXT_PUBLIC_BACKEND_URL;
    }
    
    // Check for manual protocol override in localStorage
    const manualUrl = localStorage.getItem('bf_backend_url');
    if (manualUrl) return manualUrl;
    
    // Auto-detect protocol to avoid mixed content issues
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//87.106.62.92:14137`;
};

let BACKEND_URL = getBackendUrl();

// Log environment variables for debugging
console.log('Environment check:');
console.log('window.BACKEND_URL:', window.BACKEND_URL);
console.log('process.env.NEXT_PUBLIC_BACKEND_URL:', typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_BACKEND_URL : 'undefined');
console.log('Final BACKEND_URL:', BACKEND_URL);

// Global state
let currentUser = null;
let currentWhitelists = [];
let currentResellers = [];

// Storage helpers
function saveToken(token) { localStorage.setItem('bf_token', token); }
function getToken() { return localStorage.getItem('bf_token'); }
function clearToken() { localStorage.removeItem('bf_token'); }

// API helper with fallback for HTTPS/HTTP issues and CORS proxy
async function api(path, options = {}) {
    const headers = Object.assign({'Content-Type': 'application/json'}, options.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    try {
        console.log(`Making API request to: ${BACKEND_URL}${path}`);
        
        // First try direct request
        const res = await fetch(`${BACKEND_URL}${path}`, {
            ...options,
            headers,
            mode: 'cors'
        });
        
        if (!res.ok) {
            let data = null;
            try { 
                data = await res.json(); 
                console.log('Error response data:', data);
            } catch (parseError) {
                console.log('Failed to parse error response:', parseError);
            }
            const msg = (data && (data.message || data.error)) || `HTTP ${res.status}: ${res.statusText}`;
            throw new Error(msg);
        }
        
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) return res.json();
        return res.text();
    } catch (error) {
        console.error('API Error:', error);
        
        // If direct request fails and we're on HTTPS trying HTTP, try CORS proxy
        if (error.name === 'TypeError' && window.location.protocol === 'https:' && 
            (BACKEND_URL.startsWith('http://') || error.message.includes('Mixed Content') || error.message.includes('Failed to fetch'))) {
            
            console.log('Trying CORS proxy for mixed content issue...');
            try {
                // Try multiple CORS proxy services
                const proxyServices = [
                    `https://api.allorigins.win/raw?url=${encodeURIComponent(BACKEND_URL + path)}`,
                    `https://corsproxy.io/?${encodeURIComponent(BACKEND_URL + path)}`,
                    `https://proxy.cors.sh/${BACKEND_URL + path}`
                ];
                
                let proxyRes = null;
                for (const proxyUrl of proxyServices) {
                    try {
                        console.log(`Trying proxy: ${proxyUrl}`);
                        proxyRes = await fetch(proxyUrl, {
                            method: options.method || 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                                // Note: Authorization headers might be stripped by proxy
                            },
                            body: options.body
                        });
                        if (proxyRes) break;
                    } catch (proxyError) {
                        console.log(`Proxy ${proxyUrl} failed:`, proxyError);
                        continue;
                    }
                }
                
                if (!proxyRes) {
                    throw new Error('All CORS proxy services failed');
                }
                
                console.log('CORS proxy response status:', proxyRes.status);
                
                if (!proxyRes.ok) {
                    let proxyData = null;
                    try {
                        proxyData = await proxyRes.json();
                    } catch {}
                    const proxyMsg = (proxyData && (proxyData.message || proxyData.error)) || `Proxy HTTP ${proxyRes.status}`;
                    throw new Error(proxyMsg);
                }
                
                const data = await proxyRes.json();
                console.log('CORS proxy request successful:', data);
                return data;
            } catch (proxyError) {
                console.error('CORS proxy also failed:', proxyError);
                throw proxyError;
            }
        }
        
        throw error;
    }
}

// Alert helpers
function showAlert(msg, type = 'info') {
    const el = document.getElementById('alert');
    if (!el) return;
    el.textContent = msg;
    el.className = `alert ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
}

function hideAlert() {
    const el = document.getElementById('alert');
    if (el) el.classList.add('hidden');
}

// Connection testing function
async function testConnection(url) {
    try {
        // Try direct connection first
        const response = await fetch(`${url}/api/health`, { 
            method: 'GET',
            timeout: 5000,
            mode: 'cors'
        });
        if (response.ok) return true;
    } catch (directError) {
        console.log(`Direct connection to ${url} failed:`, directError);
    }
    
    // If direct fails and we're on HTTPS trying HTTP, try CORS proxy
    if (window.location.protocol === 'https:' && url.startsWith('http://')) {
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url + '/api/health')}`;
            const proxyResponse = await fetch(proxyUrl, { 
                method: 'GET',
                timeout: 5000
            });
            if (proxyResponse.ok) {
                console.log(`CORS proxy connection to ${url} successful`);
                return true;
            }
        } catch (proxyError) {
            console.log(`CORS proxy connection to ${url} failed:`, proxyError);
        }
    }
    
    return false;
}

// Try alternative backend URLs
async function findWorkingBackend() {
    const alternatives = [
        BACKEND_URL,
        'http://87.106.62.92:14137',
        'https://87.106.62.92:14137',
        'http://172.18.0.30:14137'
    ];
    
    for (const url of alternatives) {
        console.log(`Testing backend: ${url}`);
        if (await testConnection(url)) {
            console.log(`Working backend found: ${url}`);
            BACKEND_URL = url;
            localStorage.setItem('bf_backend_url', url);
            return url;
        }
    }
    return null;
}

// Login functionality
function initLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    
    // Show current backend URL for debugging
    console.log('Backend URL:', BACKEND_URL);
    
    // Add connection test button
    addConnectionTestButton();
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const body = { 
            username: fd.get('username'), 
            password: fd.get('password') 
        };
        
        console.log('Attempting login with:', body);
        
        try {
            hideAlert();
            showAlert('Connecting to server...', 'info');
            
            const resp = await api('/api/auth/login', { 
                method: 'POST', 
                body: JSON.stringify(body) 
            });
            
            console.log('Login response:', resp);
            console.log('Response type:', typeof resp);
            console.log('Response keys:', Object.keys(resp || {}));
            
            // Handle different response formats
            let token, user;
            if (resp && typeof resp === 'object') {
                // Check if response has success field (backend format)
                if (resp.success !== undefined && !resp.success) {
                    throw new Error(resp.message || 'Login failed');
                }
                
                token = resp.token || resp.access_token;
                user = resp.user || resp.data;
                
                // If no separate user object, the response might be the user data
                if (!user && resp.username) {
                    user = resp;
                }
            } else {
                throw new Error('Invalid response format from server');
            }
            
            if (!token) {
                throw new Error('No token received from server');
            }
            
            if (!user || !user.username) {
                throw new Error('No user data received from server');
            }
            
            console.log('Extracted token:', token ? 'Present' : 'Missing');
            console.log('Extracted user:', user);
            console.log('User role:', user.role);
            
            saveToken(token);
            currentUser = user;
            
            showAlert('Login successful! Redirecting...', 'success');
            
            // Redirect based on role with better debugging
            setTimeout(() => {
                const userRole = user.role;
                console.log('User role for redirect:', userRole);
                
                if (userRole === 'admin') {
                    console.log('Redirecting to admin dashboard...');
                    window.location.href = '/admin.html';
                } else if (userRole === 'reseller') {
                    console.log('Redirecting to reseller dashboard...');
                    window.location.href = '/dashboard.html';
                } else {
                    console.log('Unknown role, redirecting to default dashboard...');
                    window.location.href = '/dashboard.html';
                }
            }, 1500);
            
        } catch (err) {
            console.error('Login error:', err);
            
            // If connection failed, try to find alternative backend
            if (err.message.includes('Failed to fetch') || err.message.includes('Connection failed')) {
                showAlert('Connection failed. Testing alternative connections...', 'info');
                
                const workingUrl = await findWorkingBackend();
                if (workingUrl) {
                    showAlert(`Found working connection: ${workingUrl}. Please try again.`, 'success');
                } else {
                    showAlert('Unable to connect to backend server. Please check your connection or try manual configuration.', 'danger');
                    showManualConfigOption();
                }
            } else {
                showAlert(err.message || 'Login failed. Please check your credentials and server connection.', 'danger');
            }
        }
    });
}

// Add connection test button to login form
function addConnectionTestButton() {
    const form = document.getElementById('loginForm');
    if (!form || document.getElementById('connectionTestBtn')) return;
    
    const button = document.createElement('button');
    button.id = 'connectionTestBtn';
    button.type = 'button';
    button.className = 'login-btn';
    button.style.marginTop = '10px';
    button.style.backgroundColor = '#28a745';
    button.innerHTML = '<i class="fas fa-network-wired"></i> Test Connection';
    
    button.addEventListener('click', async () => {
        showAlert('Testing connection...', 'info');
        const workingUrl = await findWorkingBackend();
        if (workingUrl) {
            showAlert(`Connection successful: ${workingUrl}`, 'success');
        } else {
            showAlert('No working backend found. Please check server status.', 'danger');
            showManualConfigOption();
        }
    });
    
    form.appendChild(button);
}

// Show manual configuration option
function showManualConfigOption() {
    if (document.getElementById('manualConfig')) return;
    
    const container = document.querySelector('.login-card');
    const configDiv = document.createElement('div');
    configDiv.id = 'manualConfig';
    configDiv.style.marginTop = '20px';
    configDiv.style.padding = '15px';
    configDiv.style.backgroundColor = 'var(--bg-darker)';
    configDiv.style.borderRadius = '8px';
    configDiv.style.border = '1px solid var(--border-color)';
    
    configDiv.innerHTML = `
        <h4 style="margin: 0 0 10px 0; color: var(--text-primary);">Manual Backend Configuration</h4>
        <input type="url" id="manualBackendUrl" placeholder="Enter backend URL (e.g., http://your-server:14137)" 
               style="width: 100%; padding: 10px; margin: 10px 0; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
        <button type="button" id="setBackendBtn" style="width: 100%; padding: 10px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">
            Set Backend URL
        </button>
    `;
    
    container.appendChild(configDiv);
    
    document.getElementById('setBackendBtn').addEventListener('click', () => {
        const url = document.getElementById('manualBackendUrl').value.trim();
        if (url) {
            BACKEND_URL = url;
            localStorage.setItem('bf_backend_url', url);
            showAlert(`Backend URL set to: ${url}`, 'success');
            configDiv.remove();
        }
    });
}

// Dashboard initialization
async function initDashboard() {
    try {
        // Get current user
        currentUser = await api('/api/auth/me');
        
        // Update UI with user info
        updateUserInfo();
        updateNavigation();
        
        // Load dashboard data
        await loadDashboardData();
        
        // Setup event listeners
        setupEventListeners();
        
    } catch (err) {
        console.error('Dashboard init error:', err);
        if (err.message.includes('Unauthorized')) {
            clearToken();
            window.location.href = '/';
        } else {
            showAlert('Failed to load dashboard: ' + err.message, 'danger');
        }
    }
}

function updateUserInfo() {
    // Update sidebar user info
    const userInfoContent = document.getElementById('userInfoContent');
    if (userInfoContent) {
        userInfoContent.innerHTML = `
            <div class="user-info-item">
                <span class="user-info-label">User:</span>
                <span class="user-info-value">${currentUser.username}</span>
            </div>
            ${currentUser.role === 'reseller' ? `
                <div class="user-info-item">
                    <span class="user-info-label">Plan:</span>
                    <span class="user-info-value">${currentUser.plan || 'Basic'}</span>
                </div>
                <div class="user-info-item">
                    <span class="user-info-label">Balance:</span>
                    <span class="user-info-value user-balance-value">$${(currentUser.balance || 0).toFixed(2)}</span>
                </div>
            ` : ''}
            <div class="user-info-item">
                <span class="user-info-label">Role:</span>
                <span class="user-info-value">${currentUser.role === 'admin' ? 'Administrator' : 'Seller'}</span>
            </div>
        `;
    }
    
    // Update top bar user info
    const topBarUsername = document.getElementById('topBarUsername');
    if (topBarUsername) {
        topBarUsername.textContent = currentUser.username;
    }
}

function updateNavigation() {
    if (currentUser.role === 'reseller') {
        // Update reseller navigation
        const sidebarNav = document.getElementById('sidebarNav');
        if (sidebarNav) {
            sidebarNav.innerHTML = `
                <li class="sidebar-nav-item">
                    <a href="/dashboard.html" class="sidebar-nav-link active">
                        <i class="fas fa-home"></i>
                        <span>Dashboard</span>
                    </a>
                </li>
                <li class="sidebar-nav-item">
                    <a href="#" class="sidebar-nav-link" onclick="showWhitelistsSection()">
                        <i class="fas fa-list"></i>
                        <span>My Whitelists</span>
                    </a>
                </li>
            `;
        }
        
        // Show reseller-specific sections
        const quickActionsCard = document.getElementById('quickActionsCard');
        const pricingCard = document.getElementById('pricingCard');
        if (quickActionsCard) quickActionsCard.style.display = 'block';
        if (pricingCard) pricingCard.style.display = 'block';
    }
}

async function loadDashboardData() {
    try {
        // Load stats
        const stats = await api('/api/stats');
        updateStatsGrid(stats);
        
        // Load pricing
        const pricing = await api('/api/pricing');
        updatePricingGrid(pricing);
        
        // Load whitelists
        await loadWhitelists();
        
        // Load activity logs
        await loadActivityLogs();
        
        // Load admin-specific data if admin
        if (currentUser.role === 'admin') {
            await loadPlanStats();
        }
        
    } catch (err) {
        console.error('Error loading dashboard data:', err);
        showAlert('Error loading data: ' + err.message, 'danger');
    }
}

function updateStatsGrid(stats) {
    const statsGrid = document.getElementById('statsGrid');
    if (!statsGrid) return;
    
    if (currentUser.role === 'admin') {
        statsGrid.innerHTML = `
            <div class="stat-card primary">
                <div class="stat-header">
                    <span class="stat-label">Total Resellers</span>
                    <div class="stat-icon">
                        <i class="fas fa-users"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.total_resellers || 0}</div>
                <div class="stat-change">Active accounts</div>
            </div>
            <div class="stat-card success">
                <div class="stat-header">
                    <span class="stat-label">Active UIDs</span>
                    <div class="stat-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.total_uids || 0}</div>
                <div class="stat-change">Currently whitelisted</div>
            </div>
            <div class="stat-card info">
                <div class="stat-header">
                    <span class="stat-label">Total Balance</span>
                    <div class="stat-icon">
                        <i class="fas fa-wallet"></i>
                    </div>
                </div>
                <div class="stat-value">$${(stats.total_balance || 0).toFixed(2)}</div>
                <div class="stat-change">All resellers combined</div>
            </div>
            <div class="stat-card warning">
                <div class="stat-header">
                    <span class="stat-label">System Status</span>
                    <div class="stat-icon">
                        <i class="fas fa-server"></i>
                    </div>
                </div>
                <div class="stat-value">Online</div>
                <div class="stat-change">All systems operational</div>
            </div>
        `;
    } else {
        // Reseller stats
        const activeCount = currentWhitelists.filter(w => w.is_active).length;
        const expiredCount = currentWhitelists.filter(w => !w.is_active).length;
        
        statsGrid.innerHTML = `
            <div class="stat-card info">
                <div class="stat-header">
                    <span class="stat-label">Current Balance</span>
                    <div class="stat-icon">
                        <i class="fas fa-wallet"></i>
                    </div>
                </div>
                <div class="stat-value">$${(currentUser.balance || 0).toFixed(2)}</div>
                <div class="stat-change">Available credits</div>
            </div>
            <div class="stat-card success">
                <div class="stat-header">
                    <span class="stat-label">Active UIDs</span>
                    <div class="stat-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                </div>
                <div class="stat-value">${activeCount}</div>
                <div class="stat-change">Currently working</div>
            </div>
            <div class="stat-card primary">
                <div class="stat-header">
                    <span class="stat-label">Total UIDs</span>
                    <div class="stat-icon">
                        <i class="fas fa-list"></i>
                    </div>
                </div>
                <div class="stat-value">${currentWhitelists.length}</div>
                <div class="stat-change">All whitelists</div>
            </div>
            <div class="stat-card warning">
                <div class="stat-header">
                    <span class="stat-label">Expired UIDs</span>
                    <div class="stat-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                </div>
                <div class="stat-value">${expiredCount}</div>
                <div class="stat-change">Need renewal</div>
            </div>
        `;
    }
}

function updatePricingGrid(pricing) {
    const pricingGrid = document.getElementById('pricingGrid');
    if (!pricingGrid) return;
    
    const plans = [
        { days: 7, price: pricing[7] || 2.0 },
        { days: 30, price: pricing[30] || 5.0 },
        { days: 60, price: pricing[60] || 15.0 },
        { days: 365, price: pricing[365] || 35.0 }
    ];
    
    pricingGrid.innerHTML = plans.map(plan => `
        <div style="background: var(--bg-darker); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
            <div style="color: var(--primary-color); font-size: 14px; font-weight: 600; margin-bottom: 8px;">
                ${plan.days === 365 ? 'PERMANENT' : `${plan.days} DAYS`}
            </div>
            <div style="font-size: 28px; font-weight: 700; color: var(--text-primary);">$${plan.price.toFixed(2)}</div>
            ${plan.days === 365 ? '<div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">Permanent</div>' : ''}
        </div>
    `).join('');
}

async function loadWhitelists() {
    try {
        currentWhitelists = await api('/api/whitelists');
        updateWhitelistsTable();
    } catch (err) {
        console.error('Error loading whitelists:', err);
    }
}

function updateWhitelistsTable() {
    const tableBody = document.getElementById('whitelistsTableBody');
    const adminTableBody = document.getElementById('adminWhitelistsTableBody');
    
    if (!tableBody && !adminTableBody) return;
    
    const tbody = tableBody || adminTableBody;
    
    if (currentWhitelists.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: var(--spacing-xl);">
                    <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: var(--spacing-sm); opacity: 0.5;"></i><br>
                    No whitelists found
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = currentWhitelists.map(item => {
        const statusBadge = item.is_active 
            ? '<span class="badge badge-success">Active</span>'
            : '<span class="badge badge-danger">Expired</span>';
        
        const expiresAt = item.expires_at ? new Date(item.expires_at).toLocaleString() : 'N/A';
        
        const actions = `
            <button class="btn btn-danger btn-sm" onclick="deleteWhitelist('${item.id}')">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        if (currentUser.role === 'admin') {
            return `
                <tr>
                    <td><code>${item.uid}</code></td>
                    <td><span class="badge badge-secondary">${item.region}</span></td>
                    <td>Reseller #${item.seller_id}</td>
                    <td style="font-size: 13px;">${expiresAt}</td>
                    <td>${statusBadge}</td>
                    <td>${actions}</td>
                </tr>
            `;
        } else {
            return `
                <tr>
                    <td><code>${item.uid}</code></td>
                    <td><span class="badge badge-secondary">${item.region}</span></td>
                    <td style="font-size: 13px;">${expiresAt}</td>
                    <td>${statusBadge}</td>
                    <td>${actions}</td>
                </tr>
            `;
        }
    }).join('');
}

async function loadActivityLogs() {
    try {
        const logs = await api('/api/activity-logs');
        updateActivityTable(logs);
    } catch (err) {
        console.error('Error loading activity logs:', err);
    }
}

function updateActivityTable(logs) {
    const tableBody = document.getElementById('activityTableBody');
    const logsTableBody = document.getElementById('logsTableBody');
    
    if (!tableBody && !logsTableBody) return;
    
    const tbody = tableBody || logsTableBody;
    
    if (logs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: var(--spacing-xl);">
                    No activity logs found
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = logs.slice(0, 20).map(log => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        
        if (currentUser.role === 'admin' && logsTableBody) {
            return `
                <tr>
                    <td style="font-size: 13px; color: var(--text-muted);">${timestamp}</td>
                    <td>${log.user_id}</td>
                    <td><span class="badge badge-info">${log.action}</span></td>
                    <td style="font-size: 13px;">${log.details || '-'}</td>
                </tr>
            `;
        } else {
            return `
                <tr>
                    <td style="font-size: 13px; color: var(--text-muted);">${timestamp}</td>
                    <td><span class="badge badge-info">${log.action}</span></td>
                    <td style="font-size: 13px;">${log.details || '-'}</td>
                </tr>
            `;
        }
    }).join('');
}

function setupEventListeners() {
    // Logout buttons
    const logoutBtns = document.querySelectorAll('#logoutBtn, #topBarLogout');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            clearToken();
            window.location.href = '/';
        });
    });
    
    // Add whitelist form
    const addWhitelistForm = document.getElementById('addWhitelistForm');
    if (addWhitelistForm) {
        addWhitelistForm.addEventListener('submit', handleAddWhitelist);
    }
    
    // Filter handlers
    const regionFilter = document.getElementById('regionFilter');
    const statusFilter = document.getElementById('statusFilter');
    
    if (regionFilter) {
        regionFilter.addEventListener('change', filterWhitelists);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', filterWhitelists);
    }
}

async function handleAddWhitelist(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    
    const payload = {
        uid: fd.get('uid'),
        region: fd.get('region'),
        duration_days: parseInt(fd.get('duration_days'), 10)
    };
    
    // Add reseller_id for admin
    if (currentUser.role === 'admin') {
        payload.reseller_id = fd.get('reseller_id');
    }
    
    try {
        await api('/api/whitelists', { 
            method: 'POST', 
            body: JSON.stringify(payload) 
        });
        
        hideAddWhitelistModal();
        e.target.reset();
        await loadWhitelists();
        await loadDashboardData(); // Refresh stats
        showAlert('Whitelist added successfully!', 'success');
    } catch (err) {
        showAlert(err.message, 'danger');
    }
}

async function deleteWhitelist(entryId) {
    if (!confirm('Are you sure you want to delete this whitelist?')) return;
    
    try {
        await api(`/api/whitelists/${entryId}`, { method: 'DELETE' });
        await loadWhitelists();
        await loadDashboardData(); // Refresh stats
        showAlert('Whitelist deleted successfully!', 'success');
    } catch (err) {
        showAlert(err.message, 'danger');
    }
}

function filterWhitelists() {
    const regionFilter = document.getElementById('regionFilter');
    const statusFilter = document.getElementById('statusFilter');
    
    if (!regionFilter || !statusFilter) return;
    
    const region = regionFilter.value;
    const status = statusFilter.value;
    
    let filtered = [...currentWhitelists];
    
    if (region !== 'all') {
        filtered = filtered.filter(item => item.region === region);
    }
    
    if (status !== 'all') {
        if (status === 'active') {
            filtered = filtered.filter(item => item.is_active);
        } else if (status === 'expired') {
            filtered = filtered.filter(item => !item.is_active);
        }
    }
    
    // Update table with filtered data
    const originalWhitelists = currentWhitelists;
    currentWhitelists = filtered;
    updateWhitelistsTable();
    currentWhitelists = originalWhitelists; // Restore original data
}

// Modal helpers
function showAddWhitelistModal() {
    const modal = document.getElementById('addWhitelistModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function hideAddWhitelistModal() {
    const modal = document.getElementById('addWhitelistModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Section navigation
function showWhitelistsSection() {
    // Hide all sections
    const sections = ['dashboardSection', 'resellersSection', 'whitelistsSection', 'plansSection', 'logsSection'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    // Show whitelists section
    const whitelistsSection = document.getElementById('whitelistsSection');
    if (whitelistsSection) {
        whitelistsSection.classList.remove('hidden');
    }
    
    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = currentUser.role === 'admin' ? 'UID Management' : 'My Whitelists';
    }
    
    // Update active nav
    updateActiveNav('whitelists');
}

function updateActiveNav(section) {
    const links = document.querySelectorAll('.sidebar-nav-link');
    links.forEach(link => link.classList.remove('active'));
    
    const activeLink = document.querySelector(`.sidebar-nav-link[onclick*="${section}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

// Admin-specific functions
async function loadPlanStats() {
    if (currentUser.role !== 'admin') return;
    
    try {
        // This would need to be implemented in the backend
        // For now, we'll show placeholder data
        const planStatsGrid = document.getElementById('planStatsGrid');
        if (planStatsGrid) {
            planStatsGrid.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md);">
                    <div class="stat-card info">
                        <div class="stat-header">
                            <span class="stat-label">Basic Plans</span>
                        </div>
                        <div class="stat-value">0</div>
                        <div class="stat-change">Active subscriptions</div>
                    </div>
                    <div class="stat-card primary">
                        <div class="stat-header">
                            <span class="stat-label">Standard Plans</span>
                        </div>
                        <div class="stat-value">0</div>
                        <div class="stat-change">Active subscriptions</div>
                    </div>
                    <div class="stat-card warning">
                        <div class="stat-header">
                            <span class="stat-label">Premium Plans</span>
                        </div>
                        <div class="stat-value">0</div>
                        <div class="stat-change">Active subscriptions</div>
                    </div>
                </div>
            `;
        }
    } catch (err) {
        console.error('Error loading plan stats:', err);
    }
}

// Router and initialization
function init() {
    const path = window.location.pathname;
    
    if (path.endsWith('/admin.html')) {
        if (!getToken()) {
            window.location.href = '/';
            return;
        }
        initDashboard();
    } else if (path.endsWith('/dashboard.html')) {
        if (!getToken()) {
            window.location.href = '/';
            return;
        }
        initDashboard();
    } else {
        // Login page
        if (getToken()) {
            // Check if user is admin or reseller and redirect accordingly
            api('/api/auth/me')
                .then(user => {
                    if (user.role === 'admin') {
                        window.location.href = '/admin.html';
                    } else {
                        window.location.href = '/dashboard.html';
                    }
                })
                .catch(() => {
                    clearToken();
                    initLogin();
                });
        } else {
            initLogin();
            // Auto-fill credentials from URL parameters if present
            autoFillCredentials();
        }
    }
}

// Auto-fill credentials from URL parameters for testing
function autoFillCredentials() {
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('username');
    const password = urlParams.get('password');
    
    if (username && password) {
        setTimeout(() => {
            const usernameField = document.querySelector('input[name="username"]');
            const passwordField = document.querySelector('input[name="password"]');
            
            if (usernameField && passwordField) {
                usernameField.value = username;
                passwordField.value = password;
                
                // Auto-submit if both fields are filled
                const form = document.getElementById('loginForm');
                if (form) {
                    form.dispatchEvent(new Event('submit'));
                }
            }
        }, 100);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
