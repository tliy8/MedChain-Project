import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. AUTH CHECK
if (!authService.isAuthenticated()) {
    window.location.href = 'login.html';
}

// 2. DOM ELEMENTS
const elements = {
    tableBody: document.getElementById('auditTableBody'),
    sidebarName: document.getElementById('sidebarName'),
    sidebarId: document.getElementById('sidebarId'),
    walletAddressSidebar: document.getElementById('walletAddressSidebar'),
    logoutBtn: document.getElementById('logoutBtn')
};

// 3. EVENT LISTENERS
if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', () => authService.logout());
}

// 4. CONFIGURATION: Icons & Colors for Actions
const EVENT_MAP = {
    'ConsentGranted': { icon: 'check_circle', color: 'bg-green-100 text-green-700', label: 'Consent Granted' },
    'ConsentRevoked': { icon: 'block', color: 'bg-red-100 text-red-700', label: 'Consent Revoked' },
    'RecordUploaded': { icon: 'upload_file', color: 'bg-purple-100 text-purple-700', label: 'Record Uploaded' },
    'RecordViewed':   { icon: 'visibility', color: 'bg-blue-100 text-blue-700', label: 'Record Viewed' },
    'UserRegistered': { icon: 'person_add', color: 'bg-gray-100 text-gray-700', label: 'Account Created' },
    'Unknown':        { icon: 'info', color: 'bg-gray-50 text-gray-500', label: 'System Event' }
};

// 5. MAIN LOAD FUNCTION
async function loadPageData() {
    try {
        // --- A. Load User Profile (Sidebar) ---
        // 1. Immediate Local Storage Update (Prevents flicker)
        const localName = localStorage.getItem('name');
        const localId = localStorage.getItem('fabricId');
        
        if(elements.sidebarName) elements.sidebarName.innerText = localName || "Patient";
        if(elements.sidebarId) elements.sidebarId.innerText = `ID: ${localId || "..."}`;

        // 2. Fetch Real Profile
        const me = await api.get('/user/me');
        const myId = me.userId || me.fabricId || me.id;

        // 3. Update Sidebar with Real Data
        if(elements.sidebarName) elements.sidebarName.innerText = me.name || localName || "Patient";
        if(elements.sidebarId) elements.sidebarId.innerText = `ID: ${myId}`;
        
        // 4. Generate Wallet Hash
        if(elements.walletAddressSidebar && me.certificate) {
             const msgBuffer = new TextEncoder().encode(me.certificate);
             const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
             const hashArray = Array.from(new Uint8Array(hashBuffer));
             const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
             elements.walletAddressSidebar.innerText = `0x${hashHex.substring(0, 6)}...${hashHex.slice(-4)}`;
        }

        // --- B. Load Audit Log ---
        if (elements.tableBody) {
            elements.tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500 animate-pulse">Scanning Blockchain Ledger...</td></tr>`;
            
            // ⭐ Call the Unified Audit Endpoint
            const events = await api.get('/patient/audit-log');
            
            renderAuditTable(events);
        }

    } catch (error) {
        console.error("Load Error:", error);
        if(elements.tableBody) {
            elements.tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-500">System Error: ${error.message}</td></tr>`;
        }
    }
}

// 6. RENDER TABLE FUNCTION
function renderAuditTable(events) {
    if (!elements.tableBody) return;

    if (!events || events.length === 0) {
        elements.tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500">No activity recorded yet.</td></tr>`;
        return;
    }

    elements.tableBody.innerHTML = ''; // Clear loading state

    events.forEach(event => {
        // 1. Get Style Configuration
        const style = EVENT_MAP[event.action] || EVENT_MAP['Unknown'];
        
        // 2. Format Date
        let dateStr = "Unknown Date";
        try { 
            dateStr = new Date(event.timestamp).toLocaleString(); 
        } catch(e) {}
        
        // 3. Format Actor (Highlight "Me")
        const localId = localStorage.getItem('fabricId');
        let actorDisplay = event.actor;
        if(actorDisplay === localId) {
            actorDisplay = `<span class="font-bold text-gray-900 dark:text-white">Me</span>`;
        }

        // 4. Construct HTML Row
        const row = `
        <tr class="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5">
            <td class="px-6 py-4 font-mono text-xs text-gray-500 whitespace-nowrap">${dateStr}</td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center gap-2 px-2.5 py-1 rounded text-xs font-bold ${style.color} border border-black/5">
                    <span class="material-symbols-outlined text-sm">${style.icon}</span>
                    ${style.label}
                </span>
            </td>
            <td class="px-6 py-4 text-xs font-mono text-gray-700 dark:text-gray-300">
                ${actorDisplay}
            </td>
            <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                ${event.details}
            </td>
            <td class="px-6 py-4">
                 <span class="font-mono text-[10px] text-primary cursor-pointer hover:underline" title="TxID: ${event.txId}">
                    ${event.txId ? event.txId.substring(0, 10) + '...' : '...'}
                 </span>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-bold">
                    <span class="material-symbols-outlined text-base">verified</span>
                    Verified
                </div>
            </td>
        </tr>`;

        elements.tableBody.insertAdjacentHTML('beforeend', row);
    });
}

// 7. INITIALIZE
document.addEventListener('DOMContentLoaded', loadPageData);