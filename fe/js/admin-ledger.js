import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. ADMIN AUTH CHECK
if (!authService.isAuthenticated()) {
    window.location.href = 'login.html';
}

const elements = {
    tableBody: document.getElementById('ledgerTableBody'),
    resultCount: document.getElementById('resultCount'),
    
    // Filters
    filterType: document.getElementById('filterType'),
    filterActor: document.getElementById('filterActor'),
    filterTxId: document.getElementById('filterTxId'),
    filterDate: document.getElementById('filterDate'),
    
    applyBtn: document.getElementById('applyFilters'),
    resetBtn: document.getElementById('resetFilters'),
    logoutBtn: document.getElementById('logoutBtn')
};

let allEvents = [];

// 2. LOAD DATA
async function loadLedgerEvents() {
    try {
        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="p-12 text-center">
                    <div class="flex flex-col items-center gap-3">
                        <span class="material-symbols-outlined animate-spin text-3xl text-indigo-600">sync</span>
                        <span class="text-gray-500 font-medium">Aggregating Ledger Events...</span>
                    </div>
                </td>
            </tr>`;
        
        console.log("📡 Fetching events from API...");
        const response = await api.get('/admin/events');
        console.log("✅ Data Received:", response);
        
        allEvents = response;
        renderTable(allEvents);

    } catch (error) {
        console.error("Load Error:", error);
        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="p-8 text-center text-red-500 font-bold">
                    Error connecting to peer: ${error.message}
                </td>
            </tr>`;
    }
}

// 3. RENDER TABLE
function renderTable(data) {
    if (!data || data.length === 0) {
        elements.tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">No events found.</td></tr>`;
        elements.resultCount.innerText = "Showing 0 results";
        return;
    }

    elements.resultCount.innerText = `Showing ${data.length} results`;

    const html = data.map(event => {
        // Date Logic
        let dateStr;
        if (event.timestamp.startsWith('2024-01-01')) {
            dateStr = `<span class="text-gray-400 italic">Genesis Block</span>`;
        } else {
            const dateObj = new Date(event.timestamp);
            dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
        }
        
        // --- BADGE COLOR LOGIC ---
        let badgeClass = 'bg-gray-100 text-gray-600 border-gray-200';
        let icon = 'info';

        // DOCTOR ACTIONS
        if (event.eventName === 'MedicalDataUploaded') { 
            badgeClass = 'bg-green-100 text-green-700 border-green-200'; 
            icon = 'cloud_upload'; 
        }
        else if (event.eventName === 'DoctorRegistered') { 
            badgeClass = 'bg-indigo-100 text-indigo-700 border-indigo-200'; 
            icon = 'medical_services'; 
        }

        // VIEWING ACTIONS (Shared)
        else if (event.eventName === 'MedicalDataViewed') { 
            badgeClass = 'bg-purple-100 text-purple-700 border-purple-200'; 
            icon = 'visibility'; 
        }
        
        // PATIENT ACTIONS
        else if (event.eventName === 'ConsentGranted') { 
            badgeClass = 'bg-blue-100 text-blue-700 border-blue-200'; 
            icon = 'verified_user'; 
        }
        else if (event.eventName === 'UserRegistered') { 
            badgeClass = 'bg-teal-100 text-teal-700 border-teal-200'; 
            icon = 'person_add'; 
        }

        return `
        <tr class="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5">
            <td class="px-6 py-4 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                ${dateStr}
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold border uppercase tracking-wide ${badgeClass}">
                    <span class="material-symbols-outlined text-[14px]">${icon}</span>
                    ${event.eventName}
                </span>
            </td>
            <td class="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                ${event.caller || 'System'}
                <span class="block text-[10px] font-normal text-gray-400">${event.msp || ''}</span>
            </td>
            <td class="px-6 py-4 text-xs text-gray-600 dark:text-gray-300 font-mono break-all max-w-xs">
                ${event.data || '-'}
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex justify-end gap-2 items-center">
                    <span class="font-mono text-[10px] text-gray-400 bg-gray-50 dark:bg-black/20 px-1.5 py-0.5 rounded border border-gray-100 dark:border-white/10">
                        ${(event.txId || '0x000').substring(0, 8)}...
                    </span>
                </div>
            </td>
        </tr>
    `}).join('');

    elements.tableBody.innerHTML = html;
}

// 4. FILTER LOGIC
function applyFilters() {
    const type = elements.filterType.value;
    const actor = elements.filterActor.value.toLowerCase();
    const txId = elements.filterTxId.value.toLowerCase();
    const date = elements.filterDate.value;

    const filtered = allEvents.filter(ev => {
        const matchType = type ? ev.eventName === type : true;
        const matchActor = actor ? (ev.caller || '').toLowerCase().includes(actor) : true;
        const matchTx = txId ? (ev.txId || '').toLowerCase().includes(txId) : true;
        
        let matchDate = true;
        if (date) {
            const evDate = new Date(ev.timestamp).toISOString().split('T')[0];
            matchDate = evDate === date;
        }

        return matchType && matchActor && matchTx && matchDate;
    });

    renderTable(filtered);
}

function resetFilters() {
    elements.filterType.value = "";
    elements.filterActor.value = "";
    elements.filterTxId.value = "";
    elements.filterDate.value = "";
    renderTable(allEvents);
}

// 5. EVENT LISTENERS
if (elements.applyBtn) elements.applyBtn.addEventListener('click', applyFilters);
if (elements.resetBtn) elements.resetBtn.addEventListener('click', resetFilters);
if (elements.logoutBtn) elements.logoutBtn.addEventListener('click', () => authService.logout());

// INIT
document.addEventListener('DOMContentLoaded', loadLedgerEvents);