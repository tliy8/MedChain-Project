import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

/* ================================
   AUTH CHECK
================================ */
if (!authService.isAuthenticated()) {
    window.location.replace('login.html');
}
const doctorId = localStorage.getItem('fabricId'); 

/* ================================
   READ PATIENT ID
================================ */
const urlParams = new URLSearchParams(window.location.search);
const patientId = urlParams.get('id');

if (!patientId) {
    alert("No patient ID provided!");
    window.location.replace('doc-search.html');
}

/* ================================
   DOM ELEMENTS
================================ */
const elements = {
    sidebarName: document.getElementById('sidebarName'),
    sidebarId: document.getElementById('sidebarId'),
    logoutBtn: document.getElementById('logoutBtn'),
    pagePatientName: document.getElementById('pagePatientName'),
    pagePatientIC: document.getElementById('pagePatientIC'),
    recordsContainer: document.getElementById('recordsContainer'),
    addNewRecordBtn: document.getElementById('addNewRecordBtn'),
    latestHeartRate: document.getElementById('latestHeartRate'),
    latestBP: document.getElementById('latestBP'),
    latestWeight: document.getElementById('latestWeight')
};

/* ================================
   LOGOUT
================================ */
if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', () => authService.logout());
}

/* ================================
   CONSENT CHECK (SINGLE SOURCE OF TRUTH)
================================ */
async function checkConsentOrBlock() {
    try {
        await api.get(`/patient/${patientId}/records`);
        return true;
    } catch (e) {
        if (e.status === 403) {
            alert("⛔ ACCESS DENIED: Patient has NOT given consent.");
        } else {
            alert("❌ Unable to verify access.");
        }
        window.location.replace("doc-search.html");
        return false;
    }
}

/* ================================
   LOAD DOCTOR PROFILE
================================ */
async function loadDoctorProfile() {
    console.log("👤 loadDoctorProfile called");

    // Debug 1: Check if elements exist
    if (!elements.sidebarName) console.error("❌ Error: sidebarName element not found in DOM");
    if (!elements.sidebarId) console.error("❌ Error: sidebarId element not found in DOM");
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
    console.log(sdebarname);
    if(elements.sidebarName) elements.sidebarName.innerText = displayName;
    if(elements.sidebarId) elements.sidebarId.innerText = `ID: ${profile.fabricId}`;
    if(elements.nodeIdentity) elements.nodeIdentity.innerText = profile.fabricId;
    if(elements.connectedPeer) elements.connectedPeer.innerText = 'peer0.org2.medchain.net';
}

/* ================================
   LOAD PATIENT DETAILS
================================ */
async function loadPatientDetails() {
    try {
        const p = await api.get(`/patient/${patientId}`);
        if (elements.pagePatientName)
            elements.pagePatientName.innerText = `Patient: ${p.name}`;
        if (elements.pagePatientIC)
            elements.pagePatientIC.innerText = `ID: ${p.userId} • Org: ${p.org}`;
    } catch {
        if (elements.pagePatientName)
            elements.pagePatientName.innerText = "Unknown Patient";
    }
}

/* ================================
   LOAD MEDICAL RECORDS
================================ */
async function loadMedicalRecords() {
    try {
        const records = await api.get(`/patient/${patientId}/records`);
        renderRecords(records);
    } catch {
        if (elements.recordsContainer) {
            elements.recordsContainer.innerHTML = `
                <div class="text-red-500 text-center py-6">
                    Failed to load records.
                </div>`;
        }
    }
}

/* ================================
   RENDER RECORDS (ORIGINAL STYLE)
================================ */
function renderRecords(records) {
    if (!elements.recordsContainer) return;

    if (!records || records.length === 0) {
        elements.recordsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">folder_off</span>
                <p>No medical records found.</p>
            </div>`;
        return;
    }

    records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latest = records[0];

    if (latest?.vitals) {
        if (elements.latestHeartRate)
            elements.latestHeartRate.innerText =
                `${latest.vitals.heartRate || '--'} bpm`;
        if (elements.latestBP)
            elements.latestBP.innerText =
                `${latest.vitals.bloodPressure || '--'} mmHg`;
        if (elements.latestWeight)
            elements.latestWeight.innerText =
                `${latest.vitals.weight || '--'} kg`;
    }

    elements.recordsContainer.innerHTML = records.map(r => {
        let iconColor = "bg-blue-500";
        if (r.recordType?.toLowerCase().includes('report')) iconColor = "bg-purple-500";
        if (r.recordType?.toLowerCase().includes('scan')) iconColor = "bg-orange-500";

        const dateStr = new Date(r.timestamp).toLocaleDateString();
        const shortHash = r.ipfsHash ? `${r.ipfsHash.substring(0,8)}...` : 'No File';
        const title = r.recordName || r.recordType || "Medical Record";

        return `
        <div class="relative group">
            <div class="absolute -left-[41px] top-1 size-5 rounded-full ${iconColor} border-4 border-white shadow-md"></div>
            <div class="flex flex-col sm:flex-row justify-between gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors">
                <div class="flex-1">
                    <h4 class="font-bold">${title}</h4>
                    <p class="text-sm text-gray-500 mb-2">
                        Uploaded by Dr. ${r.doctorId || 'Unknown'}
                    </p>
                    <div class="text-xs font-mono text-gray-400">
                        CID: ${shortHash} • ${dateStr}
                    </div>
                </div>
                <button
                    onclick="window.verifyAndOpen('${r.recordId}')"
                    class="px-4 py-2 rounded-lg border text-xs font-bold flex items-center gap-2">
                    <span class="material-symbols-outlined text-base">visibility</span>
                    View File
                </button>
            </div>
        </div>`;
    }).join('');
}

/* ================================
   🔐 ORIGINAL VERIFY MODAL (UNCHANGED)
================================ */
window.verifyAndOpen = async (recordId) => {
    const modal = document.getElementById('integrityModal');
    const statusText = document.getElementById('integrityStatus');
    const progressBar = document.getElementById('integrityProgress');
    const spinner = document.getElementById('integritySpinner');
    const icon = document.getElementById('integrityIcon');
    const detailsDiv = document.getElementById('integrityDetails');
    const viewBtn = document.getElementById('viewVerifiedFileBtn');

    const docIdEl = document.getElementById('integrityDocId');
    const cidEl = document.getElementById('integrityCid');
    const ledgerHashEl = document.getElementById('ledgerHashDisplay');
    const ipfsHashEl = document.getElementById('ipfsHashDisplay');

    modal.classList.remove('hidden');
    detailsDiv.classList.add('hidden');
    viewBtn.classList.add('hidden');
    progressBar.style.width = '10%';
    statusText.innerText = "Querying Smart Contract...";
    spinner.classList.remove('hidden');
    icon.innerText = 'shield';

    try {
        const response = await api.get(`/record/${recordId}`);
        const integrity = response.integrity;

        setTimeout(() => {
            progressBar.style.width = '50%';
            statusText.innerText = "Ledger Data Found. Fetching IPFS File...";
            detailsDiv.classList.remove('hidden');
            docIdEl.innerText = response.metadata.doctorId || "Unknown";
            cidEl.innerText = integrity.cidFromLedger || "N/A";
            ledgerHashEl.innerText = integrity.hashFromLedger || "N/A";
        }, 800);

        setTimeout(() => {
            progressBar.style.width = '80%';
            statusText.innerText = "Calculating File Hash...";
            ipfsHashEl.innerText = integrity.calculatedHash || "Error";
        }, 1600);

        setTimeout(() => {
            progressBar.style.width = '100%';
            spinner.classList.add('hidden');

            if (integrity.verificationStatus === 'VALID' ||
                integrity.verificationStatus === 'NO_HASH') {

                statusText.innerText = "INTEGRITY VERIFIED";
                statusText.className = "text-green-600 font-bold";
                icon.innerText = 'check_circle';

                viewBtn.classList.remove('hidden');
                viewBtn.onclick = () => {
                    window.open(`doc-record-detail.html?id=${recordId}`, '_blank');
                    modal.classList.add('hidden');
                };
            } else {
                statusText.innerText = "WARNING: FILE INTEGRITY FAILED";
                statusText.className = "text-red-600 font-bold";
                icon.innerText = 'warning';
            }
        }, 2400);

    } catch {
        statusText.innerText = "Verification failed.";
        spinner.classList.add('hidden');
        icon.innerText = 'error';
    }
};
/* ================================
   SETUP UPLOAD LINK (FOOLPROOF)
================================ */
const uploadLink = document.getElementById('addNewRecordLink');

if (uploadLink && patientId) {
    // 1. Set the destination URL directly in the HTML
    // CHECK YOUR FILENAME: Is it 'doc-upload-record.html' or 'doc_upload_record.html'?
    uploadLink.href = `doc-upload-record.html?id=${patientId}`; 
    
    console.log(`✅ Link set to: ${uploadLink.href}`);
} else if (!uploadLink) {
    console.error("❌ Link element 'addNewRecordLink' not found in HTML.");
}

/* ================================
   BOOTSTRAP (NO RACE CONDITION)
================================ */
document.addEventListener('DOMContentLoaded', async () => {
    loadDoctorProfile();
    const allowed = await checkConsentOrBlock();
    if (!allowed) return;
    loadPatientDetails();
    loadMedicalRecords();
});
