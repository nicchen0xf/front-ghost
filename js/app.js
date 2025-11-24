// ByteForce Frontend - Complete Application Logic
// Configure your backend URL (Wispbyte host). On Vercel, set NEXT_PUBLIC_BACKEND_URL
// Auto-detect protocol based on current page to avoid mixed content issues
const getBackendUrl = () => {
    // Check for explicit configuration first
    if (window.BACKEND_URL) return window.BACKEND_URL;
    if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_BACKEND_URL) {
        return process.env.NEXT_PUBLIC_BACKEND_URL;
    }
    
    // Auto-detect protocol to avoid mixed content issues
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//87.106.82.92:14137`;
};

const BACKEND_URL = getBackendUrl();

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

// API helper
async function api(path, options = {}) {
    const headers = Object.assign({'Content-Type': 'application/json'}, options.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    try {
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
    } catch (error) {
        console.error('API Error:', error);
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

// Login functionality
function initLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    
    // Show current backend URL for debugging
    console.log('Backend URL:', BACKEND_URL);
    
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
            
            saveToken(resp.token);
            currentUser = resp.user;
            
            showAlert('Login successful! Redirecting...', 'success');
            
            // Redirect based on role
            setTimeout(() => {
                if (resp.user.role === 'admin') {
                    window.location.href = '/admin.html';
                } else {
                    window.location.href = '/dashboard.html';
                }
            }, 500);
            
        } catch (err) {
            console.error('Login error:', err);
            showAlert(err.message || 'Login failed. Please check your credentials and server connection.', 'danger');
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
