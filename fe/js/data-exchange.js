import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. AUTH CHECK
if (!authService.isAuthenticated()) {
    window.location.href = 'login.html';
}
const socket = io('http://localhost:3000'); // Connect to Backend
socket.on('chain-log', (data) => {
    const terminal = document.getElementById('terminal-logs');
    
    // Determine Color based on Type
    let colorClass = "text-gray-400";
    if (data.type === 'BLOCK') colorClass = "text-green-400";
    if (data.type === 'TX') colorClass = "text-blue-400";

    // Create Log Line
    const newLog = `
        <p class="animate-fade-in font-mono text-xs mb-1">
            <span class="${colorClass}">[${data.time}]</span> 
            ${data.text}
        </p>
    `;

    // Add to top of list
    terminal.insertAdjacentHTML('afterbegin', newLog);
});
const elements = {
    tableBody: document.querySelector('tbody'),
    terminalLogs: document.getElementById('terminal-logs'),
    
    // Modal Elements
    modal: document.getElementById('contractModal'),
    step1: document.getElementById('modal-step-1'),
    step2: document.getElementById('modal-step-2'),
    step3: document.getElementById('modal-step-3'),
    targetHospitalEl: document.getElementById('target-hospital'),
    actionTypeEl: document.getElementById('action-type'),
    statActiveGrants: document.getElementById('statActiveGrants'),
    statRevoked: document.getElementById('statRevoked'),
    walletAddressSidebar: document.getElementById('walletAddressSidebar'),
    sidebarName:document.getElementById('sidebarName'),
    sidebarId:document.getElementById('sidebarId')
};

let currentAction = null;
let currentProviderId = null;

// ============================================================
// 1. LOAD CONSENT DATA (Real Logic)
// ============================================================
async function loadConsentData() {
    try {
        elements.tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">Loading network data...</td></tr>`;

        // --- 1. Load Identity & Wallet Hash ---
        const myidentity = await api.get('/user/me');
        if (elements.walletAddressSidebar) {
            const certHash = await generateCertHash(myidentity.certificate);
            elements.walletAddressSidebar.innerText = certHash;
        }
        
        // --- 2. Load User Profile for Sidebar ---
        const name = localStorage.getItem('name');
        const fabricId = localStorage.getItem('fabricId');
        if(elements.sidebarName) elements.sidebarName.innerText = name || "Unknown User";
        if(elements.sidebarId) elements.sidebarId.innerText = `ID: ${fabricId || "..."}`;


        // --- 3. Fetch Doctors List (Providers) ---
        let doctors = [];
        try {
            // Should fetch real doctors registered under Org2
            doctors = await api.get('/doctor/list');
            if (!doctors || doctors.length === 0) {
                 // Fallback mock list if API /doctors fails or returns empty, for testing UI flow
                 doctors = [
                    { userId: "doc-ahmad", name: "Dr. Ahmad Shagi", org: "UM Specialist Hospital" },
                    { userId: "doc-sarah", name: "Dr. Sarah Lim", org: "UM Specialist Hospital" }
                ];
            }
        } catch(e) {
            console.warn("API /doctors failed, using mock list.");
             doctors = [
                { userId: "doc-ahmad", name: "Dr. Ahmad Shagi", org: "UM Specialist Hospital" },
                { userId: "doc-sarah", name: "Dr. Sarah Lim", org: "UM Specialist Hospital" }
            ];
        }

        // --- 4. Fetch Consent Status from Blockchain ---
        let myConsents = [];
        try {
            const stats = await api.get('/patient/dashboard-stats');
            myConsents = stats.consents || [];
            
            // Update Active Grants Count
            if(elements.statActiveGrants) {
                elements.statActiveGrants.innerText = myConsents.length.toString();
            }
            
            // Revoked is hard to track without history query, so we default to 0 for FYP simplicity
            if(elements.statRevoked) {
                elements.statRevoked.innerText = "0"; 
            } 

        } catch(e) {
            console.error("Dashboard Stats API failed:", e);
        }

        // --- 5. Render the table ---
        renderTable(doctors, myConsents);

    } catch (error) {
        console.error("Failed to load consent data:", error);
        elements.tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">Error loading data. Ensure backend is running.</td></tr>`;
    }
}

function renderTable(doctors, myConsents) {
    elements.tableBody.innerHTML = "";

    if (doctors.length === 0) {
        elements.tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">No doctors found in network.</td></tr>`;
        return;
    }

    doctors.forEach(doc => {
        const isGranted = myConsents.includes(doc.userId);
        
        const statusBadge = isGranted 
            ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200"><span class="relative flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>Granted</span>`
            : `<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">Not Allowed</span>`;

        const actionBtn = isGranted
            ? `<button onclick="openContractModal('${doc.userId}', '${doc.name}', 'revoke')" class="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 transition-colors">Revoke</button>`
            : `<button onclick="openContractModal('${doc.userId}', '${doc.name}', 'grant')" class="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold shadow hover:bg-primary/90 transition-colors">Grant Access</button>`;

        const row = `
        <tr class="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="size-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold">Dr</div>
                    <div>
                        <p class="font-bold text-gray-900 dark:text-white">${doc.name}</p>
                        <p class="text-xs text-gray-500">ID: ${doc.userId}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">${statusBadge}</td>
            <td class="px-6 py-4"><span class="text-xs font-mono text-gray-400">0x${btoa(doc.userId).substr(0,8)}...</span></td>
            <td class="px-6 py-4"><div class="flex items-center gap-1 text-green-600 text-sm font-bold"><span class="material-symbols-outlined text-lg">verified</span>Yes</div></td>
            <td class="px-6 py-4 text-right">${actionBtn}</td>
        </tr>`;
        
        elements.tableBody.insertAdjacentHTML('beforeend', row);
    });
}
async function generateCertHash(certificateString) {
    const msgBuffer = new TextEncoder().encode(certificateString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `0x${hashHex.substring(0, 6)}...${hashHex.substring(hashHex.length - 4)}`;
}
// ============================================================
// 2. TRANSACTION LOGIC
// ============================================================

// Attached to window so onclick in HTML works
window.openContractModal = (id, name, type) => {
    currentAction = type;
    currentProviderId = id;
    
    elements.step1.classList.remove('hidden');
    elements.step2.classList.add('hidden');
    elements.step3.classList.add('hidden');
    
    elements.targetHospitalEl.innerText = name; 
    elements.actionTypeEl.innerText = type.toUpperCase();
    elements.actionTypeEl.className = type === 'grant' ? "font-bold text-primary" : "font-bold text-red-500";

    elements.modal.classList.remove('hidden');
};

window.closeModal = () => {
    elements.modal.classList.add('hidden');
};

window.signTransaction = async () => {
    // 1. UI: Show Loading
    elements.step1.classList.add('hidden');
    elements.step2.classList.remove('hidden');

    try {
        const endpoint = currentAction === 'grant' ? '/consent/grant' : '/consent/revoke';
        
        // 2. Execute Transaction
        await api.post(endpoint, { providerId: currentProviderId });

        // 3. UI: Show Success
        elements.step2.classList.add('hidden');
        elements.step3.classList.remove('hidden');

        // 4. ✅ FIX: WAIT 2 SECONDS BEFORE REFRESHING DATA
        // This gives the Blockchain time to update the "World State"
        setTimeout(() => {
            loadConsentData(); 
        }, 2000);

    } catch (error) {
        console.error(error);
        alert("Transaction Failed: " + error.message);
        window.closeModal();
    }
};
function loadUserProfile() {
    // Retrieve data saved during Login
    const name = localStorage.getItem('name');
    const fabricId = localStorage.getItem('fabricId');

    // Update UI
    if(elements.sidebarName) elements.sidebarName.innerText = name || "Unknown User";
    if(elements.sidebarId) elements.sidebarId.innerText = `ID: ${fabricId || "..."}`;
}
loadUserProfile();

// INITIALIZE
loadConsentData();