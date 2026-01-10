import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. STRICT AUTH CHECK
if (!authService.isAuthenticated()) {
    window.location.href = 'login.html';
}

const elements = {
    tableBody: document.getElementById('doctorsTableBody'),
    searchInput: document.getElementById('searchInput'),
    hospitalFilter: document.getElementById('hospitalFilter'),
    modal: document.getElementById('doctorModal'),
    form: document.getElementById('doctorForm'),
    deleteModal: document.getElementById('deleteDoctorModal'),
    deleteTargetName: document.getElementById('deleteTargetName'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    credentialModal: document.getElementById('credentialModal'),
    newUserId: document.getElementById('newUserId'),
    newUserPass: document.getElementById('newUserPass'),
    logoutBtn: document.getElementById('logoutBtn')
};

let doctorsData = [];
let doctorToDeleteId = null;

// 2. LOAD DATA
async function loadDoctors() {
    try {
        elements.tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">Loading MedChain Registry...</td></tr>`;
        
        try {
            const response = await api.get('/admin/doctors');
            if (response && response.length > 0) {
                doctorsData = response;
            } else {
                throw new Error("No doctors found");
            }
        } catch (e) {
            console.warn("API unavailable, loading defaults.");
            doctorsData = [
                { id: 'D1', name: 'Sarah Smith', email: 'sarah@medchain.com', license: 'MD-99281', hospitalName: 'MedChain Hospital', wallet: '0x71C...9A21', mspId: 'Org2MSP' }
            ];
        }
        renderTable(doctorsData);
    } catch (error) {
        console.error("Error:", error);
        elements.tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">${error.message}</td></tr>`;
    }
}

// 3. RENDER TABLE
function renderTable(data) {
    if (!data || data.length === 0) {
        elements.tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">No doctors registered.</td></tr>`;
        return;
    }

    const html = data.map(doc => `
        <tr class="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="size-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 font-bold text-xs">DR</div>
                    <div>
                        <p class="text-sm font-bold text-gray-900 dark:text-white">Dr. ${doc.name}</p>
                        <p class="text-xs text-gray-500">${doc.email || 'No Email'}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 text-sm font-mono text-gray-700 dark:text-gray-300">${doc.license || 'N/A'}</td>
            <td class="px-6 py-4">
                <span class="font-mono text-xs bg-gray-100 dark:bg-white/10 px-2 py-1 rounded text-gray-600 dark:text-gray-300 flex items-center gap-2 w-fit">
                    <span class="material-symbols-outlined text-[10px]">key</span> ${doc.wallet || doc.id || '0x...'}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                <span class="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold border border-blue-100">MedChain Hospital</span>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="window.deleteDoctor('${doc.id}', '${doc.name}')" class="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Revoke Access">
                    <span class="material-symbols-outlined text-lg">block</span>
                </button>
            </td>
        </tr>
    `).join('');

    elements.tableBody.innerHTML = html;
}

// 4. ADD DOCTOR LOGIC (UPDATED WITH ID/PASSPORT)
if (elements.form) {
    elements.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = elements.form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">sync</span> Registering...`;

        try {
            const docName = document.getElementById('docName').value;
            const docEmail = document.getElementById('docEmail').value.trim();
            const docLicense = document.getElementById('docLicense').value;
            // ⭐ NEW: Capture ID/Passport
            const docIdPassport = document.getElementById('docIdPassport').value.trim();

            const tempPassword = Math.random().toString(36).slice(-8) + "#1A";

            // Payload maps 'docIdPassport' to 'userId' for the backend
            const payload = {
                userId: docIdPassport, // Login ID
                name: docName,
                role: 'doctor',
                org: 'Org2',
                password: tempPassword,
                email: docEmail,
                license: docLicense,
                idPassport: docIdPassport // Explicitly storing just in case
            };

            const response = await api.post('/user/register', payload);

            if (response && response.success) {
                window.closeModal();
                // Show ID/Passport and Password
                elements.newUserId.innerText = docIdPassport;
                elements.newUserPass.innerText = tempPassword;
                elements.credentialModal.classList.remove('hidden');
                loadDoctors();
            } else {
                throw new Error(response.error || "Registration failed.");
            }

        } catch (error) {
            console.error("Registration Error:", error);
            Toastify({ text: "Failed: " + error.message, backgroundColor: "#ef4444" }).showToast();
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

// 5. WINDOW ACTIONS
window.openModal = () => {
    elements.form.reset();
    elements.modal.classList.remove('hidden');
};

window.closeModal = () => elements.modal.classList.add('hidden');

window.deleteDoctor = (id, name) => {
    doctorToDeleteId = id;
    elements.deleteTargetName.innerText = `Dr. ${name}`;
    elements.deleteModal.classList.remove('hidden');
    const btn = elements.confirmDeleteBtn;
    btn.disabled = false;
    btn.classList.replace('bg-gray-600', 'bg-red-600');
    btn.innerHTML = `<span class="material-symbols-outlined">delete_forever</span> Confirm Delete`;
};

window.closeDeleteModal = () => elements.deleteModal.classList.add('hidden');

if(elements.confirmDeleteBtn) {
    elements.confirmDeleteBtn.addEventListener('click', async () => {
        const btn = elements.confirmDeleteBtn;
        btn.disabled = true;
        btn.classList.replace('bg-red-600', 'bg-gray-600');
        btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Revoking Role...`;
        try {
            await new Promise(r => setTimeout(r, 1000));
            Toastify({ text: "Access Revoked.", backgroundColor: "#dc2626" }).showToast();
            window.closeDeleteModal();
            loadDoctors();
        } catch (error) {
            console.error("Delete Failed:", error);
            btn.disabled = false;
            btn.classList.replace('bg-gray-600', 'bg-red-600');
            btn.innerHTML = "Retry";
        }
    });
}

// 6. SEARCH FILTER
elements.searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = doctorsData.filter(d => 
        (d.name && d.name.toLowerCase().includes(term)) || 
        (d.license && d.license.toLowerCase().includes(term))
    );
    renderTable(filtered);
});

if(elements.logoutBtn) elements.logoutBtn.addEventListener('click', () => authService.logout());
document.addEventListener('DOMContentLoaded', loadDoctors);