// js/dashboard.js
import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. CHECK AUTH
if (!authService.isAuthenticated()) {
    window.location.href = 'login.html';
}

const fabricId = localStorage.getItem('fabricId');

// 2. SETUP UI ELEMENTS
const elements = {
    walletAddressSidebar: document.getElementById('walletAddressSidebar'),
    sidebarName: document.getElementById('sidebarName'),
    sidebarId: document.getElementById('sidebarId'),
    logoutBtn: document.getElementById('logoutBtn'),
    welcomeHeader: document.getElementById('welcomeHeader'),
    
    mspIdentity: document.getElementById('mspIdentity'),
    mspOrg: document.getElementById('mspOrg'),
    certSnippet: document.getElementById('certSnippet'),
    statTotalRecords: document.getElementById('statTotalRecords'),
    statActiveGrants: document.getElementById('statActiveGrants'),
    activityTableBody: document.getElementById('activityTableBody'),
    refreshBtn: document.getElementById('refreshBtn')
};

// 3. LOGOUT LOGIC
if(elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', () => {
        authService.logout();
    });
}

// 4. REFRESH LOGIC
if(elements.refreshBtn) {
    elements.refreshBtn.addEventListener('click', () => {
        elements.refreshBtn.classList.add('animate-spin');
        loadDashboardData().finally(() => {
            setTimeout(() => elements.refreshBtn.classList.remove('animate-spin'), 500);
        });
    });
}

// 5. LOAD USER IDENTITY
async function loadUserIdentity() {
    try {
        const localName = localStorage.getItem('name');
        const localId = localStorage.getItem('fabricId');
        
        if(elements.sidebarName) elements.sidebarName.innerText = localName || "User";
        if(elements.welcomeHeader) elements.welcomeHeader.innerText = localName || "User";
        if(elements.sidebarId) elements.sidebarId.innerText = `Patient ID: ${localId}`;

        // Fetch Real Data
        const identityData = await api.get('/user/me');

        // Generate Pseudo-Wallet Address from Cert
        const certHash = await generateCertHash(identityData.certificate);
        if(elements.walletAddressSidebar) elements.walletAddressSidebar.innerText = certHash; 
 
        if(elements.mspIdentity) elements.mspIdentity.innerText = identityData.fabricId;
        if(elements.mspOrg) elements.mspOrg.innerText = identityData.mspId;

        // Format Certificate
        let rawCert = identityData.certificate;
        if(rawCert) {
            rawCert = rawCert.replace('-----BEGIN CERTIFICATE-----', '').replace('-----END CERTIFICATE-----', '').replace(/\n/g, '');
            const shortCert = `${rawCert.substring(0, 60)}......${rawCert.substring(rawCert.length - 40)}`;
            if(elements.certSnippet) elements.certSnippet.innerText = shortCert;
        }

    } catch (error) {
        console.error("Failed to load identity:", error);
        if(elements.certSnippet) {
            elements.certSnippet.innerText = "Error loading blockchain identity.";
            elements.certSnippet.classList.add("text-red-500");
        }
    }
}

async function generateCertHash(certificateString) {
    if(!certificateString) return "0x000...000";
    const msgBuffer = new TextEncoder().encode(certificateString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `0x${hashHex.substring(0, 6)}...${hashHex.substring(hashHex.length - 4)}`;
}

// 6. FETCH & RENDER DASHBOARD DATA
async function loadDashboardData() {
    try {
        if(elements.activityTableBody) {
            elements.activityTableBody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-gray-500"><span class="material-symbols-outlined animate-spin align-middle mr-2">sync</span>Syncing ledger...</td></tr>`;
        }
        
        // REAL API CALL
        const stats = await api.get('/patient/dashboard-stats');

        if(elements.statTotalRecords) elements.statTotalRecords.innerText = stats.totalRecords || 0;
        if(elements.statActiveGrants) elements.statActiveGrants.innerText = stats.activeGrants || 0;

        if (stats.recentActivity && stats.recentActivity.length > 0) {
            renderActivityTable(stats.recentActivity);
        } else {
            if(elements.activityTableBody) {
                elements.activityTableBody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-gray-500">No activity found on blockchain.</td></tr>`;
            }
        }

    } catch (error) {
        console.error("Failed to load dashboard data:", error);
        if(elements.activityTableBody) {
            elements.activityTableBody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-red-500">Failed to load blockchain data. Check connection.</td></tr>`;
        }
    }
}

// Helper: Determine Style based on activity text
function getActivityStyle(actionText) {
    const lower = actionText.toLowerCase();
    if (lower.includes('upload') || lower.includes('add')) {
        return { icon: 'cloud_upload', color: 'blue' };
    } else if (lower.includes('grant') || lower.includes('allow')) {
        return { icon: 'key', color: 'teal' };
    } else if (lower.includes('revoke') || lower.includes('remove') || lower.includes('block')) {
        return { icon: 'block', color: 'red' };
    } else if (lower.includes('view') || lower.includes('access')) {
        return { icon: 'visibility', color: 'purple' };
    }
    return { icon: 'article', color: 'gray' };
}

function renderActivityTable(activities) {
    if(!elements.activityTableBody) return;

    const html = activities.map(act => {
        // Automatically determine icon/color based on the action text from backend
        const style = getActivityStyle(act.action);
        
        return `
        <tr class="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5">
            <td class="py-4">
                <div class="flex items-center gap-3">
                    <div class="size-8 rounded-full bg-${style.color}-100 dark:bg-${style.color}-500/10 flex items-center justify-center text-${style.color}-600 dark:text-${style.color}-400">
                        <span class="material-symbols-outlined text-sm">${style.icon}</span>
                    </div>
                    <div>
                        <p class="font-bold text-gray-900 dark:text-white">${act.action}</p>
                        <p class="text-xs text-gray-500">${act.details || 'Blockchain Transaction'}</p> 
                    </div>
                </div>
            </td>
            <td class="py-4 text-gray-600 dark:text-gray-400 font-mono text-xs">${act.date}</td>
            <td class="py-4">
                <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-gray-500 bg-gray-100 dark:bg-white/5 px-2 py-1 rounded border border-gray-200 dark:border-transparent group-hover:border-primary/30 group-hover:text-primary transition-colors cursor-pointer" title="${act.txHash}">
                        ${act.txHash.substring(0, 10)}...${act.txHash.substring(act.txHash.length - 6)}
                    </span>
                    <button class="text-gray-400 hover:text-primary transition-colors">
                        <span class="material-symbols-outlined text-sm">open_in_new</span>
                    </button>
                </div>
            </td>
            <td class="py-4 text-right">
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-500/10 dark:text-green-400">
                    <span class="size-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    Confirmed
                </span>
            </td>
        </tr>
    `}).join('');

    elements.activityTableBody.innerHTML = html;
}

// INITIALIZE
loadUserIdentity();
loadDashboardData();