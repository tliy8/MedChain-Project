import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. ADMIN CHECK
const user = authService.getUser();
if (!user || user.role !== 'admin') {
    window.location.href = 'login.html';
}

const elements = {
    form: document.getElementById('editForm'),
    doctorId: document.getElementById('doctorId'),
    docName: document.getElementById('docName'),
    docLicense: document.getElementById('docLicense'),
    docEmail: document.getElementById('docEmail'),
    docHospital: document.getElementById('docHospital'),
    docWallet: document.getElementById('docWallet'),
    saveBtn: document.getElementById('saveBtn'),
    logoutBtn: document.getElementById('logoutBtn')
};

// 2. LOAD DETAILS
async function loadDoctorDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    if (!id) {
        alert("No doctor ID provided.");
        window.location.href = 'admin-doctors.html';
        return;
    }

    try {
        // Fetch Real Data
        // const doctor = await api.get(`/admin/doctor/${id}`);
        
        // Mock Data for Demo
        const doctor = {
            id: id,
            name: 'Sarah Smith',
            license: 'MD-99281',
            email: 'sarah.smith@citygeneral.com',
            hospitalId: '1',
            wallet: '0x71C9...9A21 (Immutable Ledger ID)' 
        };

        // Populate Fields
        elements.doctorId.value = doctor.id;
        elements.docName.value = doctor.name;
        elements.docLicense.value = doctor.license;
        elements.docEmail.value = doctor.email;
        elements.docHospital.value = doctor.hospitalId;
        elements.docWallet.value = doctor.wallet; // Read-only

    } catch (error) {
        console.error("Error loading doctor:", error);
        Toastify({ text: "Failed to load doctor details.", backgroundColor: "#ef4444" }).showToast();
    }
}

// 3. HANDLE SAVE
async function handleSave(e) {
    e.preventDefault();
    
    const btn = elements.saveBtn;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Updating Ledger...`;

    const updatedData = {
        id: elements.doctorId.value,
        name: elements.docName.value,
        license: elements.docLicense.value,
        email: elements.docEmail.value,
        hospitalId: elements.docHospital.value
        // Wallet is not updated
    };

    try {
        // Send Update to Backend
        // await api.put(`/admin/doctor/${updatedData.id}`, updatedData);
        
        // Simulate API delay
        await new Promise(r => setTimeout(r, 1000));

        // Show Success
        Toastify({ 
            text: "Doctor profile updated successfully!", 
            backgroundColor: "#10b981",
            duration: 2000
        }).showToast();

        // Redirect after brief pause
        setTimeout(() => {
            window.location.href = 'admin-doctors.html';
        }, 1500);

    } catch (error) {
        console.error("Save failed:", error);
        Toastify({ text: "Error saving changes: " + error.message, backgroundColor: "#ef4444" }).showToast();
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', loadDoctorDetails);
elements.form.addEventListener('submit', handleSave);
if(elements.logoutBtn) elements.logoutBtn.addEventListener('click', () => authService.logout());