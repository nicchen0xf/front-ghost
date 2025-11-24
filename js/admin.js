// ByteForce Admin-specific functionality

// Admin section navigation
function showResellersSection() {
    hideAllSections();
    document.getElementById('resellersSection').classList.remove('hidden');
    document.getElementById('pageTitle').textContent = 'Resellers Management';
    updateActiveNav('resellers');
    loadResellers();
}

function showPlansSection() {
    hideAllSections();
    document.getElementById('plansSection').classList.remove('hidden');
    document.getElementById('pageTitle').textContent = 'Seller Plans';
    updateActiveNav('plans');
}

function showLogsSection() {
    hideAllSections();
    document.getElementById('logsSection').classList.remove('hidden');
    document.getElementById('pageTitle').textContent = 'Activity Logs';
    updateActiveNav('logs');
    loadAllLogs();
}

function showDashboardSection() {
    hideAllSections();
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('pageTitle').textContent = 'Admin Dashboard';
    updateActiveNav('dashboard');
}

function hideAllSections() {
    const sections = ['dashboardSection', 'resellersSection', 'whitelistsSection', 'plansSection', 'logsSection'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

function updateActiveNav(section) {
    const links = document.querySelectorAll('.sidebar-nav-link');
    links.forEach(link => link.classList.remove('active'));
    
    // Find the correct link based on onclick or href
    let activeSelector;
    switch(section) {
        case 'dashboard':
            activeSelector = '.sidebar-nav-link[href="/admin.html"]';
            break;
        case 'resellers':
            activeSelector = '.sidebar-nav-link[onclick*="showResellersSection"]';
            break;
        case 'whitelists':
            activeSelector = '.sidebar-nav-link[onclick*="showWhitelistsSection"]';
            break;
        case 'plans':
            activeSelector = '.sidebar-nav-link[onclick*="showPlansSection"]';
            break;
        case 'logs':
            activeSelector = '.sidebar-nav-link[onclick*="showLogsSection"]';
            break;
    }
    
    const activeLink = document.querySelector(activeSelector);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

// Resellers management
async function loadResellers() {
    try {
        currentResellers = await api('/api/admin/resellers');
        updateResellersTable();
        populateResellerSelect();
    } catch (err) {
        console.error('Error loading resellers:', err);
        showAlert('Error loading resellers: ' + err.message, 'danger');
    }
}

function updateResellersTable() {
    const tableBody = document.getElementById('resellersTableBody');
    if (!tableBody) return;
    
    if (currentResellers.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: var(--spacing-xl);">
                    <i class="fas fa-users" style="font-size: 2rem; margin-bottom: var(--spacing-sm); opacity: 0.5;"></i><br>
                    No resellers found
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = currentResellers.map(reseller => {
        const statusBadge = reseller.is_active 
            ? '<span class="badge badge-success">Active</span>'
            : '<span class="badge badge-danger">Inactive</span>';
        
        const createdAt = new Date(reseller.created_at).toLocaleDateString();
        
        const actions = `
            <div style="display: flex; gap: var(--spacing-xs);">
                <button class="btn btn-success btn-sm" onclick="creditReseller(${reseller.id})" title="Credit">
                    <i class="fas fa-plus"></i>
                </button>
                <button class="btn btn-warning btn-sm" onclick="debitReseller(${reseller.id})" title="Debit">
                    <i class="fas fa-minus"></i>
                </button>
                <button class="btn btn-${reseller.is_active ? 'secondary' : 'primary'} btn-sm" onclick="toggleReseller(${reseller.id})" title="${reseller.is_active ? 'Deactivate' : 'Activate'}">
                    <i class="fas fa-${reseller.is_active ? 'pause' : 'play'}"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteReseller(${reseller.id})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        return `
            <tr>
                <td><strong>${reseller.username}</strong></td>
                <td><span class="badge badge-info">${reseller.plan}</span></td>
                <td style="color: var(--success-color); font-weight: 600;">$${reseller.balance.toFixed(2)}</td>
                <td>${statusBadge}</td>
                <td style="font-size: 13px; color: var(--text-muted);">${createdAt}</td>
                <td>${actions}</td>
            </tr>
        `;
    }).join('');
}

function populateResellerSelect() {
    const resellerSelect = document.getElementById('resellerSelect');
    if (!resellerSelect) return;
    
    resellerSelect.innerHTML = currentResellers
        .filter(r => r.is_active)
        .map(r => `<option value="${r.id}">${r.username} (${r.plan})</option>`)
        .join('');
}

async function creditReseller(resellerId) {
    const amount = prompt('Enter amount to credit:');
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;
    
    try {
        await api(`/api/admin/resellers/${resellerId}/credit`, {
            method: 'POST',
            body: JSON.stringify({ amount: parseFloat(amount) })
        });
        
        await loadResellers();
        showAlert(`Successfully credited $${amount}!`, 'success');
    } catch (err) {
        showAlert(err.message, 'danger');
    }
}

async function debitReseller(resellerId) {
    const amount = prompt('Enter amount to debit:');
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;
    
    try {
        await api(`/api/admin/resellers/${resellerId}/debit`, {
            method: 'POST',
            body: JSON.stringify({ amount: parseFloat(amount) })
        });
        
        await loadResellers();
        showAlert(`Successfully debited $${amount}!`, 'success');
    } catch (err) {
        showAlert(err.message, 'danger');
    }
}

async function toggleReseller(resellerId) {
    const reseller = currentResellers.find(r => r.id === resellerId);
    if (!reseller) return;
    
    const action = reseller.is_active ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this reseller?`)) return;
    
    try {
        await api(`/api/admin/resellers/${resellerId}/toggle`, {
            method: 'POST'
        });
        
        await loadResellers();
        showAlert(`Reseller ${action}d successfully!`, 'success');
    } catch (err) {
        showAlert(err.message, 'danger');
    }
}

async function deleteReseller(resellerId) {
    const reseller = currentResellers.find(r => r.id === resellerId);
    if (!reseller) return;
    
    if (!confirm(`Are you sure you want to delete reseller "${reseller.username}"? This will also delete all their whitelists and data. This action cannot be undone.`)) return;
    
    try {
        await api(`/api/admin/resellers/${resellerId}`, {
            method: 'DELETE'
        });
        
        await loadResellers();
        showAlert('Reseller deleted successfully!', 'success');
    } catch (err) {
        showAlert(err.message, 'danger');
    }
}

// Add reseller modal
function showAddResellerModal() {
    const modal = document.getElementById('addResellerModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function hideAddResellerModal() {
    const modal = document.getElementById('addResellerModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Add reseller form handler
document.addEventListener('DOMContentLoaded', function() {
    const addResellerForm = document.getElementById('addResellerForm');
    if (addResellerForm) {
        addResellerForm.addEventListener('submit', handleAddReseller);
    }
});

async function handleAddReseller(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    
    const payload = {
        username: fd.get('username'),
        password: fd.get('password'),
        plan: fd.get('plan')
    };
    
    try {
        await api('/api/admin/resellers', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        hideAddResellerModal();
        e.target.reset();
        await loadResellers();
        await loadDashboardData(); // Refresh admin stats
        showAlert('Reseller created successfully!', 'success');
    } catch (err) {
        showAlert(err.message, 'danger');
    }
}

// Admin logs
async function loadAllLogs() {
    try {
        const logs = await api('/api/admin/logs?limit=200');
        updateLogsTable(logs);
    } catch (err) {
        console.error('Error loading admin logs:', err);
        showAlert('Error loading logs: ' + err.message, 'danger');
    }
}

function updateLogsTable(logs) {
    const tableBody = document.getElementById('logsTableBody');
    if (!tableBody) return;
    
    if (logs.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: var(--spacing-xl);">
                    <i class="fas fa-file-alt" style="font-size: 2rem; margin-bottom: var(--spacing-sm); opacity: 0.5;"></i><br>
                    No activity logs found
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = logs.map(log => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        
        // Color code actions
        let actionBadge = 'badge-secondary';
        if (log.action.includes('LOGIN')) actionBadge = 'badge-info';
        else if (log.action.includes('WHITELIST_ADDED')) actionBadge = 'badge-success';
        else if (log.action.includes('WHITELIST_REMOVED') || log.action.includes('DELETE')) actionBadge = 'badge-danger';
        else if (log.action.includes('CREDIT')) actionBadge = 'badge-success';
        else if (log.action.includes('DEBIT')) actionBadge = 'badge-warning';
        else if (log.action.includes('CREATED')) actionBadge = 'badge-primary';
        
        return `
            <tr>
                <td style="font-size: 13px; color: var(--text-muted);">${timestamp}</td>
                <td><span class="badge badge-secondary">User #${log.user_id}</span></td>
                <td><span class="badge ${actionBadge}">${log.action}</span></td>
                <td style="font-size: 13px; color: var(--text-secondary);">${log.details || '-'}</td>
            </tr>
        `;
    }).join('');
}

// Override whitelist modal for admin (includes reseller selection)
function showAddWhitelistModal() {
    const modal = document.getElementById('addWhitelistModal');
    const resellerGroup = document.getElementById('resellerSelectGroup');
    
    if (modal) {
        modal.classList.remove('hidden');
        
        // Show reseller selection for admin
        if (currentUser && currentUser.role === 'admin' && resellerGroup) {
            resellerGroup.style.display = 'block';
            populateResellerSelect();
        }
    }
}

// Initialize admin dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Set up click handlers for sidebar navigation
    const currentPath = window.location.pathname;
    if (currentPath.includes('admin.html')) {
        // Auto-load resellers for admin dropdown
        setTimeout(() => {
            if (currentUser && currentUser.role === 'admin') {
                loadResellers();
            }
        }, 1000);
    }
});
