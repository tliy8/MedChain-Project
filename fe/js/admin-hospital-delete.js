import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. ADMIN CHECK
const user = authService.getUser();
if (!user || user.role !== 'admin') {
    window.location.href = 'login.html';
}

const elements = {
    targetName: document.getElementById('targetName'),
    targetMsp: document.getElementById('targetMsp'),
    confirmBtn: document.getElementById('confirmDeleteBtn'),
    logoutBtn: document.getElementById('logoutBtn')
};

// 2. LOAD TARGET DATA
const urlParams = new URLSearchParams(window.location.search);
const targetId = urlParams.get('id');

async function loadTarget() {
    if (!targetId) {
        alert("No hospital selected.");
        window.location.href = 'admin-hospitals.html';
        return;
    }

    try {
        // Fetch Real Data
        // const hospital = await api.get(`/admin/hospital/${targetId}`);
        
        // Mock Data for Demo
        const hospital = {
            id: targetId,
            name: 'Sunway Medical Center', // Example from prompt
            mspId: 'Org3MSP'
        };

        elements.targetName.innerText = hospital.name;
        elements.targetMsp.innerText = `MSP ID: ${hospital.mspId}`;

    } catch (error) {
        console.error("Load Error:", error);
        elements.targetName.innerText = "Error Loading Details";
    }
}

// 3. EXECUTE DELETION
async function handleDeletion() {
    const btn = elements.confirmBtn;
    
    // UI Feedback: Processing State
    btn.disabled = true;
    btn.classList.replace('bg-red-600', 'bg-gray-600');
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Invoking Smart Contract...`;

    try {
        // Step 1: Blockchain Transaction
        // await api.post('/ledger/invoke', { 
        //     chaincode: 'medchain-cc',
        //     function: 'removeHospital', 
        //     args: [targetId] 
        // });
        
        await new Promise(r => setTimeout(r, 1500)); // Simulate Blockchain Latency

        // Update UI: Node Disconnection
        btn.innerHTML = `<span class="material-symbols-outlined animate-pulse">dns</span> Disconnecting Node...`;
        await new Promise(r => setTimeout(r, 1000)); // Simulate Network Ops

        // Step 2: Database Removal
        // await api.delete(`/admin/hospital/${targetId}`);

        // Success
        Toastify({ 
            text: "Hospital Removed & Node Disconnected", 
            backgroundColor: "#dc2626", 
            duration: 3000 
        }).showToast();

        // Redirect back
        setTimeout(() => {
            window.location.href = 'admin-hospitals.html';
        }, 1500);

    } catch (error) {
        console.error("Delete Failed:", error);
        Toastify({ text: "Deletion Failed: " + error.message, backgroundColor: "#000" }).showToast();
        btn.disabled = false;
        btn.classList.replace('bg-gray-600', 'bg-red-600');
        btn.innerHTML = `Confirm Delete (Irreversible)`;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', loadTarget);
elements.confirmBtn.addEventListener('click', handleDeletion);
if(elements.logoutBtn) elements.logoutBtn.addEventListener('click', () => authService.logout());