import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. AUTH CHECK
if (!authService.isAuthenticated()) window.location.href = 'login.html';

// 2. DOM ELEMENTS
const elements = {
    welcomeName: document.getElementById('welcomeName'),
    sidebarName: document.getElementById('sidebarName'),
    sidebarId: document.getElementById('sidebarId'),
    connectedPeer: document.getElementById('connectedPeer'),
    nodeIdentity: document.getElementById('nodeIdentity'),
    logoutBtn: document.getElementById('logoutBtn'),
    blockHeight: document.getElementById('blockHeight'),
    statPatientsSeen: document.getElementById('statPatientsSeen'),
    statTotalAccess: document.getElementById('statTotalAccess'),
    tableBody: document.getElementById('patientInteractionTableBody'),
    refreshBtn: document.getElementById('refreshBtn'),
};

// 3. EVENT LISTENERS
if(elements.logoutBtn) elements.logoutBtn.addEventListener('click', () => authService.logout());
if(elements.refreshBtn) elements.refreshBtn.addEventListener('click', loadDashboardData);

// 4. HELPER: Time Ago
function timeSince(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return Math.floor(seconds) + " secs ago";
}

// 5. LOAD DATA
async function loadDashboardData() {
    const profile = { 
        name: localStorage.getItem('name') || "Doctor", 
        fabricId: localStorage.getItem('fabricId') || "...", 
        org: localStorage.getItem('org') || "Org2" 
    };
    
    const displayName = `Dr. ${profile.name.replace(/^Dr\.\s+/i, '')}`;

    if(elements.welcomeName) elements.welcomeName.innerText = displayName;
    if(elements.sidebarName) elements.sidebarName.innerText = displayName;
    if(elements.sidebarId) elements.sidebarId.innerText = `ID: ${profile.fabricId}`;
    
    // Sidebar Identity Updates
    if(elements.nodeIdentity) elements.nodeIdentity.innerText = profile.fabricId;
    if(elements.connectedPeer) elements.connectedPeer.innerText = 'peer0.org2.medchain.net';

    try {
        const data = await api.get('/doctor/dashboard-stats'); 
        renderStats(data);
        renderActivityTable(data.recentInteractions);
    } catch (e) {
        console.error("Dashboard Load Error:", e);
        if(elements.tableBody) elements.tableBody.innerHTML = `<tr><td colspan="2" class="px-6 py-8 text-center text-red-500">Could not load dashboard data.</td></tr>`;
    }
}

function renderStats(data) {
    if(!data) return;
    if(elements.statPatientsSeen) elements.statPatientsSeen.innerText = data.patientsSeen || 0;
    if(elements.statTotalAccess) elements.statTotalAccess.innerText = data.totalAccess || 0;
    if(elements.blockHeight) elements.blockHeight.innerText = data.blockHeight || '--'; 
}

// ⭐ UPDATED: ADDS PATIENT ID TAG ⭐
function renderActivityTable(logs) {
    if(!elements.tableBody) return;

    if (!logs || logs.length === 0) {
        elements.tableBody.innerHTML = `<tr><td colspan="2" class="px-6 py-8 text-center text-gray-500">No recent activity found.</td></tr>`;
        return;
    }

    const html = logs.map(log => {
        const timeAgo = log.time; 
        
        // 1. Record Name
        const nameToDisplay = (log.recordName && log.recordName !== "undefined")
            ? log.recordName
            : log.recordId;
            
        const formattedName = `<span class="font-bold text-gray-900 dark:text-white">${nameToDisplay}</span>`;

        // 2. Patient ID Badge (The part you were missing)
        // Checks log.patientId. If missing, checks log.patient as fallback
        const pid = log.patientId || log.patient || log.owner;
        const patientBadge = pid 
            ? `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/20">
                 <span class="material-symbols-outlined text-[12px] mr-1">person</span> ${pid}
               </span>`
            : '';

        // 3. Icons
        let activityDescription = "";
        let icon = "";
        let iconColor = "";

        if (log.type === 'upload') {
            activityDescription = `Uploaded ${formattedName}${patientBadge}`;
            icon = 'upload_file';
            iconColor = 'bg-green-50 text-green-600';
        } else if (log.type === 'view') {
            activityDescription = `Viewed :  ${formattedName}${patientBadge}`;
            icon = 'visibility';
            iconColor = 'bg-blue-50 text-blue-600';
        } else {
            activityDescription = `Action on ${formattedName}${patientBadge}`;
            icon = 'sync';
            iconColor = 'bg-gray-50 text-gray-600';
        }

        return `
        <tr class="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="size-8 rounded-full ${iconColor} flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-sm">${icon}</span>
                    </div>
                    <span class="text-sm text-gray-600 dark:text-gray-400 flex items-center flex-wrap">
                        ${activityDescription}
                    </span>
                </div>
            </td>
            <td class="px-6 py-4 text-right text-xs text-gray-400 font-mono">
                ${timeAgo}
            </td>
        </tr>`;
    }).join('');

    elements.tableBody.innerHTML = html;
}

// 6. INITIALIZE
document.addEventListener('DOMContentLoaded', loadDashboardData);