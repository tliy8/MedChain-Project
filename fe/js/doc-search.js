// js/doc-search.js
import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. AUTH CHECK
if (!authService.isAuthenticated()) {
    window.location.href = 'login.html';
}

const doctorId = localStorage.getItem('fabricId'); 

const elements = {
    // Search Elements
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    tableBody: document.getElementById('resultsTableBody'),
    resultCount: document.getElementById('resultCount'),
    
    // Sidebar Elements
    sidebarName: document.getElementById('sidebarName'),
    sidebarId: document.getElementById('sidebarId'),
    connectedPeer: document.getElementById('connectedPeer'),
    nodeIdentity: document.getElementById('nodeIdentity'),
    logoutBtn: document.getElementById('logoutBtn')
};

let allPatients = []; 

// Logout
if(elements.logoutBtn) elements.logoutBtn.addEventListener('click', () => authService.logout());

// 2. LOAD SIDEBAR PROFILE
async function loadDoctorProfile() {
    let profile = { 
        name: localStorage.getItem('name') || "Doctor", 
        fabricId: localStorage.getItem('fabricId') || "...",
        org: localStorage.getItem('org') || "Org2"
    };
    
    try {
        const apiProfile = await api.get('/user/me');
        if(apiProfile && apiProfile.name) profile = apiProfile;
    } catch(e) {}

    const displayName = `Dr. ${profile.name.replace(/^Dr\.\s+/i, '')}`;
    
    if(elements.sidebarName) elements.sidebarName.innerText = displayName;
    if(elements.sidebarId) elements.sidebarId.innerText = `ID: ${profile.fabricId}`;
    if(elements.nodeIdentity) elements.nodeIdentity.innerText = profile.fabricId;
    if(elements.connectedPeer) elements.connectedPeer.innerText = 'peer0.org2.medchain.net';
}

// 3. LOAD PATIENTS
async function loadPatients() {
    try {
        elements.tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500"><span class="material-symbols-outlined animate-spin align-middle mr-2">sync</span>Fetching Patient Registry...</td></tr>`;

        allPatients = await api.get('/doctor/patients');
        renderTable(allPatients);

    } catch (error) {
        console.error("Search Error:", error);
        elements.tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-red-500">Failed to load registry.</td></tr>`;
        if(elements.resultCount) elements.resultCount.innerText = "0 Patients";
    }
}

// 4. RENDER TABLE (UPDATED WITH UPLOAD BUTTON)
function renderTable(patients) {
    if (!patients || patients.length === 0) {
        elements.tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">No patients found.</td></tr>`;
        if(elements.resultCount) elements.resultCount.innerText = "0 Patients";
        return;
    }

    if(elements.resultCount) elements.resultCount.innerText = `${patients.length} Patients Found`;

    const html = patients.map(p => {
        const hasConsent = p.consents && p.consents.includes(doctorId);
        
        // Status Badge
        let statusBadge = hasConsent 
            ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200"><span class="material-symbols-outlined text-sm">check_circle</span> Granted</span>`
            : `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200"><span class="material-symbols-outlined text-sm">lock</span> Restricted</span>`;
            
        // Action Buttons
        let actionBtn;
        if (hasConsent) {
            actionBtn = `
            <div class="flex items-center justify-end gap-2">
                <button onclick="window.location.href='doc-patient-record.html?id=${p.userId}'" 
                    class="px-4 py-2 rounded-lg bg-white border border-gray-200 text-primary font-bold text-xs hover:bg-gray-50 flex items-center gap-2 transition-colors">
                    <span class="material-symbols-outlined text-base">visibility</span> View
                </button>
                
                <button onclick="window.location.href='doc-upload-record.html?id=${p.userId}'" 
                    class="px-4 py-2 rounded-lg bg-primary border border-primary text-white font-bold text-xs hover:bg-primary/90 flex items-center gap-2 shadow-sm transition-colors">
                    <span class="material-symbols-outlined text-base">upload_file</span> Upload
                </button>
            </div>
            `;
        } else {
            actionBtn = `
                <button disabled class="px-4 py-2 rounded-lg bg-gray-100 text-gray-400 font-bold text-xs cursor-not-allowed flex items-center gap-2">
                    <span class="material-symbols-outlined text-base">lock</span> No Access
                </button>`;
        }

        return `
        <tr class="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="size-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-sm">
                        ${p.name.substring(0,2).toUpperCase()}
                    </div>
                    <div>
                        <p class="font-bold text-gray-900 dark:text-white">${p.name}</p>
                        <p class="text-xs text-gray-500">Org: ${p.org}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 text-gray-600 dark:text-gray-300 font-mono text-xs">${p.userId}</td>
            <td class="px-6 py-4">${statusBadge}</td>
            <td class="px-6 py-4 text-right">${actionBtn}</td>
        </tr>`;
    }).join('');

    elements.tableBody.innerHTML = html;
}

// 5. SEARCH LOGIC
elements.searchBtn.addEventListener('click', () => {
    const query = elements.searchInput.value.toLowerCase();
    const filtered = allPatients.filter(p => p.name.toLowerCase().includes(query) || p.userId.toLowerCase().includes(query));
    renderTable(filtered);
});

elements.searchInput.addEventListener('keyup', (e) => {
    if(e.key === 'Enter') elements.searchBtn.click();
});

// INITIALIZE
document.addEventListener('DOMContentLoaded', () => {
    loadDoctorProfile();
    loadPatients();
});