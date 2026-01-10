import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

if (!authService.isAuthenticated()) {
    window.location.href = 'login.html';
}

const elements = {
    tableBody: document.getElementById('hospitalsTableBody'),
    searchInput: document.getElementById('searchInput'),
    statusFilter: document.getElementById('statusFilter'),
    modal: document.getElementById('addModal'),
    modalTitle: document.getElementById('modalTitle'),
    form: document.getElementById('hospitalForm'),
    logoutBtn: document.getElementById('logoutBtn')
};

// 1. HARDCODED SINGLE TRUTH
// This array defines the ONLY data that will ever appear on this page.
const MEDCHAIN_ONLY = [
    { 
        id: 'ORG2_ROOT', 
        name: 'MedChain Hospital', 
        mspId: 'Org2MSP', 
        contact: 'System Admin', 
        email: 'admin@medchain.com', 
        status: 'Online', 
        nodeIp: '10.0.5.2' 
    }
];

// 2. LOAD & RENDER
async function loadHospitals() {
    // Clear any loading text or residual html
    elements.tableBody.innerHTML = ''; 
    
    // Directly render the single hospital. No API calls needed if we are forcing this view.
    renderTable(MEDCHAIN_ONLY);
}

// 3. RENDER FUNCTION
function renderTable(data) {
    const html = data.map(hospital => `
        <tr class="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="size-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg">M</div>
                    <div>
                        <p class="text-sm font-bold text-gray-900 dark:text-white">${hospital.name}</p>
                        <p class="text-xs text-gray-500">${hospital.email}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="font-mono text-xs bg-gray-100 dark:bg-white/10 px-2 py-1 rounded text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/5">${hospital.mspId}</span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-gray-400 text-sm">person</span>
                    ${hospital.contact}
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 border border-green-200 dark:border-green-500/20">
                    <span class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    Online
                </span>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-2">
                    <button onclick="window.editHospital('${hospital.id}')" class="p-1.5 text-gray-400 hover:text-green-600 transition-colors" title="Edit">
                        <span class="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button disabled class="p-1.5 text-gray-300 cursor-not-allowed opacity-50" title="Locked">
                        <span class="material-symbols-outlined text-lg">lock</span>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    elements.tableBody.innerHTML = html;
}

// 4. HANDLERS
window.editHospital = (id) => {
    const nameInput = document.getElementById('hospitalName');
    if(nameInput) nameInput.value = "MedChain Hospital";
    elements.modalTitle.innerText = "Edit Node Details";
    elements.modal.classList.remove('hidden');
}

window.openAddModal = () => {
    elements.form.reset();
    elements.modalTitle.innerText = "Add New Hospital";
    elements.modal.classList.remove('hidden');
}

window.closeModal = () => elements.modal.classList.add('hidden');

if(elements.logoutBtn) elements.logoutBtn.addEventListener('click', () => authService.logout());
document.addEventListener('DOMContentLoaded', loadHospitals);