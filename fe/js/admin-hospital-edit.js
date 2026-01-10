import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. ADMIN CHECK
const user = authService.getUser();
if (!user || user.role !== 'admin') {
    window.location.href = 'login.html';
}

const elements = {
    form: document.getElementById('editForm'),
    hospitalId: document.getElementById('hospitalId'),
    hospitalName: document.getElementById('hospitalName'),
    mspId: document.getElementById('mspId'),
    contactPerson: document.getElementById('contactPerson'),
    contactEmail: document.getElementById('contactEmail'),
    contactPhone: document.getElementById('contactPhone'),
    physicalAddress: document.getElementById('physicalAddress'),
    saveBtn: document.getElementById('saveBtn'),
    logoutBtn: document.getElementById('logoutBtn')
};

// 2. LOAD DETAILS
async function loadHospitalDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    if (!id) {
        alert("No hospital ID provided.");
        window.location.href = 'admin-hospitals.html';
        return;
    }

    try {
        // Fetch from API
        // const hospital = await api.get(`/admin/hospital/${id}`);
        
        // Mock Data for Demo (Simulating a fetch)
        const hospital = {
            id: id,
            name: 'City General Hospital',
            mspId: 'Org1MSP', // Immutable
            contact: 'Dr. Alice Williams',
            email: 'admin@citygeneral.com',
            phone: '+1 (555) 123-4567',
            address: '123 Medical Plaza, Metropolis, NY 10012'
        };

        // Populate Fields
        elements.hospitalId.value = hospital.id;
        elements.hospitalName.value = hospital.name;
        elements.mspId.value = hospital.mspId; // Read-only in HTML
        elements.contactPerson.value = hospital.contact;
        elements.contactEmail.value = hospital.email;
        elements.contactPhone.value = hospital.phone || '';
        elements.physicalAddress.value = hospital.address || '';

    } catch (error) {
        console.error("Error loading hospital:", error);
        Toastify({ text: "Failed to load hospital details.", backgroundColor: "#ef4444" }).showToast();
    }
}

// 3. HANDLE SAVE
async function handleSave(e) {
    e.preventDefault();
    
    const btn = elements.saveBtn;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Saving...`;

    const updatedData = {
        id: elements.hospitalId.value,
        name: elements.hospitalName.value,
        contact: elements.contactPerson.value,
        email: elements.contactEmail.value,
        phone: elements.contactPhone.value,
        address: elements.physicalAddress.value
        // Note: mspId is NOT sent or is ignored by backend for updates
    };

    try {
        // Send Update to Backend
        // await api.put(`/admin/hospital/${updatedData.id}`, updatedData);
        
        // Simulate API delay
        await new Promise(r => setTimeout(r, 1000));

        // Show Success
        Toastify({ 
            text: "Hospital profile updated successfully!", 
            backgroundColor: "#10b981",
            duration: 2000
        }).showToast();

        // Redirect after brief pause
        setTimeout(() => {
            window.location.href = 'admin-hospitals.html';
        }, 1500);

    } catch (error) {
        console.error("Save failed:", error);
        Toastify({ text: "Error saving changes: " + error.message, backgroundColor: "#ef4444" }).showToast();
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', loadHospitalDetails);
elements.form.addEventListener('submit', handleSave);
if(elements.logoutBtn) elements.logoutBtn.addEventListener('click', () => authService.logout());