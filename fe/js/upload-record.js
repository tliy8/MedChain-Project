// js/upload-record.js
import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. AUTH CHECK
if (!authService.isAuthenticated()) window.location.href = 'login.html';

const urlParams = new URLSearchParams(window.location.search);
const patientId = urlParams.get('id');
const doctorId = localStorage.getItem('fabricId');

if (!patientId) {
    alert("No patient selected.");
    window.location.href = 'doc-search.html';
}

// 2. DOM ELEMENTS
const elements = {
    // Sidebar
    sidebarName: document.getElementById('sidebarName'),
    sidebarId: document.getElementById('sidebarId'),
    connectedPeer: document.getElementById('connectedPeer'),
    nodeIdentity: document.getElementById('nodeIdentity'),
    logoutBtn: document.getElementById('logoutBtn'),
    
    // Patient Info
    patientName: document.getElementById('selectedPatientName'),
    patientId: document.getElementById('selectedPatientId'),
    patientAvatar: document.getElementById('patientAvatar'),
    signerId: document.getElementById('signerId'),
    
    // Inputs
    recordId: document.getElementById('recordIdInput'),
    dateInput: document.getElementById('dateInput'),
    recordName: document.getElementById('recordName'),
    recordType: document.getElementById('recordType'),
    descriptionInput: document.getElementById('descriptionInput'),
    heartRateInput: document.getElementById('heartRateInput'),
    bpSystolicInput: document.getElementById('bpSystolicInput'),
    bpDiastolicInput: document.getElementById('bpDiastolicInput'),
    weightInput: document.getElementById('weightInput'),
    fileInput: document.getElementById('file-upload'),
    
    // File UI
    emptyState: document.getElementById('empty-state'),
    fileSelected: document.getElementById('file-selected'),
    filename: document.getElementById('filename'),
    filesize: document.getElementById('filesize'),
    removeFileBtn: document.getElementById('removeFileBtn'),
    hashDisplay: document.getElementById('hash-display'),
    fileHash: document.getElementById('fileHash'),
    
    // Buttons & Modal
    submitBtn: document.getElementById('submitBtn'),
    modal: document.getElementById('confirmModal'),
    modalPatientName: document.getElementById('modalPatientName'),
    modalHash: document.getElementById('modalHash'),
    cancelModalBtn: document.getElementById('cancelModalBtn'),
    confirmUploadBtn: document.getElementById('confirmUploadBtn'),
    signingState: document.getElementById('signing-state'),
    uploadingState: document.getElementById('uploading-state')
};

let selectedFile = null;
let fileBase64 = null;

if(elements.logoutBtn) elements.logoutBtn.addEventListener('click', () => authService.logout());

// 3. LOAD INFO
async function loadDoctorProfile() {
    let profile = { name: localStorage.getItem('name') || "Doctor", fabricId: localStorage.getItem('fabricId') || "...", org: localStorage.getItem('org') || "Org2" };
    try {
        const apiProfile = await api.get('/user/me');
        if(apiProfile && apiProfile.name) profile = apiProfile;
    } catch(e) {}
    elements.sidebarName.innerText = `Dr. ${profile.name.replace(/^Dr\.\s+/i, '')}`;
    elements.sidebarId.innerText = `ID: ${profile.fabricId}`;
    elements.nodeIdentity.innerText = profile.fabricId;
    elements.connectedPeer.innerText = 'peer0.org2.medchain.net';
}
async function verifyConsentOrBlock() {
    try {
        const res = await api.get(`/record/check-consent/${patientId}`);

        if (!res.allowed) {
            Toastify({
                text: "ACCESS DENIED: Patient did not grant consent.",
                backgroundColor: "#EF4444",
                duration: 4000,
                gravity: "top",
                position: "center"
            }).showToast();

            setTimeout(() => {
                window.location.href = 'doc-search.html';
            }, 1500);

            throw new Error("Consent denied");
        }
    } catch (err) {
        console.error("Consent check failed", err);
        window.location.href = 'doc-search.html';
    }
}

async function loadPatient() {
    elements.signerId.innerText = doctorId || "Unknown";
    try {
        const user = await api.get(`/user/${patientId}`);
        elements.patientName.innerText = user.name;
        elements.patientId.innerText = user.userId;
        elements.patientAvatar.innerText = user.name.substring(0,2).toUpperCase();
    } catch (e) {
        console.error(e);
    }
}
await verifyConsentOrBlock();
loadDoctorProfile();
loadPatient();

// 4. FILE HANDLING
elements.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    selectedFile = file;
    elements.filename.innerText = file.name;
    elements.filesize.innerText = (file.size / 1024 / 1024).toFixed(2) + " MB";
    
    elements.emptyState.classList.add('hidden');
    elements.fileSelected.classList.remove('hidden');
    elements.fileSelected.classList.add('flex');
    elements.submitBtn.disabled = false;
    elements.submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    elements.submitBtn.classList.add('hover:bg-primary/90');

    const reader = new FileReader();
    reader.onload = async (event) => {
        fileBase64 = event.target.result.split(',')[1];
        const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fileBase64));
        const hashArray = Array.from(new Uint8Array(buffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        elements.hashDisplay.classList.remove('hidden');
        elements.fileHash.innerText = "0x" + hashHex;
    };
    reader.readAsDataURL(file);
});

elements.removeFileBtn.addEventListener('click', () => {
    elements.fileInput.value = "";
    selectedFile = null;
    fileBase64 = null;
    elements.emptyState.classList.remove('hidden');
    elements.fileSelected.classList.add('hidden');
    elements.fileSelected.classList.remove('flex');
    elements.hashDisplay.classList.add('hidden');
    elements.submitBtn.disabled = true;
    elements.submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
});

// 5. SUBMIT VALIDATION (The "Not Null" Check)
elements.submitBtn.addEventListener('click', (e) => {
    e.preventDefault();

    // --- STRICT VALIDATION LOGIC ---
    const errors = [];

    if (!elements.dateInput.value) errors.push("Date of Visit is required.");
    if (!elements.recordName.value.trim()) errors.push("Record Name is required.");
    if (!elements.recordType.value.trim()) errors.push("Category is required.");
    if (!elements.descriptionInput.value.trim()) errors.push("Description is required.");
    
    if (!elements.heartRateInput.value) errors.push("Heart Rate is required.");
    if (!elements.weightInput.value) errors.push("Weight is required.");
    if (!elements.bpSystolicInput.value) errors.push("Systolic BP is required.");
    if (!elements.bpDiastolicInput.value) errors.push("Diastolic BP is required.");

    if (!selectedFile) errors.push("Please attach a medical file.");

    if (errors.length > 0) {
        // Show first error
        Toastify({ 
            text: `Missing: ${errors[0]}`, 
            backgroundColor: "#EF4444", // Red color
            duration: 3000,
            gravity: "top", 
            position: "right"
        }).showToast();
        return; // STOP HERE
    }

    // If valid, open modal
    elements.modalPatientName.innerText = elements.patientName.innerText;
    elements.modalHash.innerText = elements.fileHash.innerText;
    elements.modal.classList.remove('hidden');
});

elements.cancelModalBtn.addEventListener('click', () => {
    elements.modal.classList.add('hidden');
});

// 6. UPLOAD TO BLOCKCHAIN
elements.confirmUploadBtn.addEventListener('click', async () => {
    elements.signingState.classList.add('hidden');
    elements.uploadingState.classList.remove('hidden');
    elements.uploadingState.classList.add('flex');

    const payload = {
        recordId: elements.recordId.value,
        patientId: patientId,
        hospitalId: localStorage.getItem('org') || "Org2",
        recordName: elements.recordName.value,
        recordType: elements.recordType.value,
        fileData: fileBase64,
        description: elements.descriptionInput.value,
        vitals: {
            heartRate: parseInt(elements.heartRateInput.value),
            bloodPressure: `${elements.bpSystolicInput.value}/${elements.bpDiastolicInput.value}`,
            weight: parseFloat(elements.weightInput.value),
        }
    };

    try {
        await api.post('/record/add', payload);
        Toastify({ text: "Record Anchored on Blockchain!", backgroundColor: "#10B981", duration: 3000 }).showToast();
        setTimeout(() => window.location.href = `doc-patient-record.html?id=${patientId}`, 1500);
    } catch (error) {
        console.error("Upload failed:", error);
        Toastify({ text: "Upload Failed: " + error.message, backgroundColor: "#EF4444", duration: 3000 }).showToast();
        elements.modal.classList.add('hidden');
        elements.signingState.classList.remove('hidden');
        elements.uploadingState.classList.add('hidden');
        elements.uploadingState.classList.remove('flex');
    }
});