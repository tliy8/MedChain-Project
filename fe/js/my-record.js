import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. AUTH CHECK
if (!authService.isAuthenticated() || localStorage.getItem('role') !== 'patient') {
    window.location.href = 'login.html';
}

// 2. DOM ELEMENTS
const elements = {
    // Sidebar & Header
    sidebarName: document.getElementById('sidebarName'),
    sidebarId: document.getElementById('sidebarId'),
    walletAddressSidebar: document.getElementById('walletAddressSidebar'),
    logoutBtn: document.getElementById('logoutBtn'),
    
    // Main Content
    recordsContainer: document.getElementById('recordsContainer')
};

// 3. EVENT LISTENERS
if(elements.logoutBtn) elements.logoutBtn.addEventListener('click', () => authService.logout());

// 4. HELPER: Generate Wallet Hash from Certificate
async function generateCertHash(certificateString) {
    if(!certificateString) return "No Cert";
    const msgBuffer = new TextEncoder().encode(certificateString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `0x${hashHex.substring(0, 6)}...${hashHex.substring(hashHex.length - 4)}`;
}

// 5. HELPER: Format Date
function formatDate(timestamp) {
    if(!timestamp) return 'Unknown Date';
    return new Date(timestamp).toLocaleDateString(undefined, { 
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// 6. MAIN LOAD FUNCTION
async function loadPageData() {
    try {
        // --- 1. IMMEDIATE UI UPDATE (From Local Storage) ---
        const localName = localStorage.getItem('name');
        const localId = localStorage.getItem('fabricId');

        if(elements.sidebarName) elements.sidebarName.innerText = localName || "Patient";
        if(elements.sidebarId) elements.sidebarId.innerText = `Patient ID: ${localId || "..."}`;

        // --- 2. FETCH REAL USER PROFILE ---
        const me = await api.get('/user/me');
        const myId = me.userId || me.fabricId || me.id || localId;

        if (!myId) {
             console.error("Critical: No User ID found.");
             return; 
        }

        // --- 3. UPDATE SIDEBAR WITH REAL DATA ---
        if(elements.sidebarName) elements.sidebarName.innerText = me.name || localName || "Patient";
        if(elements.sidebarId) elements.sidebarId.innerText = `Patient ID: ${myId}`;

        if (elements.walletAddressSidebar) {
            if (me.certificate) {
                elements.walletAddressSidebar.innerText = await generateCertHash(me.certificate);
            } else {
                elements.walletAddressSidebar.innerText = "No Certificate";
            }
        }

        // --- 4. LOAD RECORDS ---
        const records = await api.get(`/record/patient/${myId}`);
        renderRecords(records);

    } catch (err) {
        console.error("Page Load Error:", err);
    }
}

// 7. RENDER RECORDS
function renderRecords(records) {
    if(!elements.recordsContainer) return;
    elements.recordsContainer.innerHTML = ''; 

    if (!records || records.length === 0) {
        elements.recordsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">folder_off</span>
                <p>No medical records found.</p>
            </div>`;
        return;
    }

    const sortedRecords = records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    sortedRecords.forEach(record => {
        let icon = "description";
        let colorClass = "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400";
        let dotColor = "bg-primary";
        const title = record.recordName || record.recordType || record.recordId;
        const titleLower = title.toLowerCase();
        
        if (titleLower.includes("blood")) { icon = "hematology"; colorClass = "bg-red-50 text-red-600"; dotColor = "bg-red-500"; }
        else if (titleLower.includes("scan")) { icon = "radiology"; colorClass = "bg-purple-50 text-purple-600"; dotColor = "bg-purple-500"; }
        
        const dateStr = formatDate(record.timestamp);
        // Handle both old 'ipfsCid' and new 'ipfsHash' naming
        const displayHash = record.ipfsHash || record.ipfsCid || "";
        const shortHash = displayHash.length > 10 ? displayHash.substring(0, 10) + '...' : 'Pending...';

        const card = document.createElement('div');
        card.className = "relative group";
        card.innerHTML = `
            <div class="absolute -left-[41px] top-4 size-5 rounded-full ${dotColor} border-4 border-white dark:border-surface-dark shadow-md z-10"></div>
            <div class="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/5 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all">
                <div class="flex flex-col md:flex-row justify-between gap-4">
                    <div class="flex gap-4">
                        <div class="size-14 rounded-xl ${colorClass} flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-2xl">${icon}</span>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-gray-900 dark:text-white">${title}</h3>
                            <p class="text-sm text-gray-500">Encrypted on IPFS</p>
                            <div class="mt-1 text-xs font-mono text-gray-400 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[12px]">tag</span> 
                                CID: ${shortHash}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="text-right hidden md:block">
                            <p class="text-xs text-gray-400">Date Uploaded</p>
                            <p class="text-sm font-bold text-gray-500">${dateStr}</p>
                        </div>
                        <button class="view-btn px-5 py-2 rounded-lg bg-gray-100 dark:bg-white/5 text-primary font-bold text-sm hover:bg-primary hover:text-white transition-colors flex items-center gap-2">
                            <span class="material-symbols-outlined text-lg">visibility</span>
                            View
                        </button>
                    </div>
                </div>
            </div>`;

        // Click Handler -> Triggers Real Verification
        const btn = card.querySelector('.view-btn');
        btn.addEventListener('click', () => {
             verifyAndOpen(record.recordId); 
        });
        
        elements.recordsContainer.appendChild(card);
    });
}

// ============================================================
// 8. REAL BLOCKCHAIN VERIFICATION LOGIC (Legacy + New)
// ============================================================
async function verifyAndOpen(recordId) {
    const modal = document.getElementById('integrityModal');
    const statusText = document.getElementById('integrityStatus');
    const progressBar = document.getElementById('integrityProgress');
    const spinner = document.getElementById('integritySpinner');
    const icon = document.getElementById('integrityIcon');
    
    // Data Fields
    const detailsDiv = document.getElementById('integrityDetails');
    const docIdEl = document.getElementById('integrityDocId');
    const cidEl = document.getElementById('integrityCid'); 
    const ledgerHashEl = document.getElementById('ledgerHashDisplay');
    const ipfsHashEl = document.getElementById('ipfsHashDisplay');
    
    // Button
    const viewBtn = document.getElementById('viewVerifiedFileBtn');

    // A. RESET UI
    if(modal) modal.classList.remove('hidden');
    if(detailsDiv) detailsDiv.classList.add('hidden');
    if(viewBtn) viewBtn.classList.add('hidden'); // Hide button initially
    if(progressBar) progressBar.style.width = '10%';
    
    if(statusText) {
        statusText.innerText = "Querying Smart Contract...";
        statusText.className = "text-sm text-gray-500 dark:text-gray-400 mb-6 font-mono";
    }
    if(spinner) spinner.classList.remove('hidden');
    if(icon) {
        icon.innerText = 'shield';
        icon.className = 'material-symbols-outlined absolute inset-0 flex items-center justify-center text-primary text-2xl';
    }
    
    // Reset colors
    if(ledgerHashEl) ledgerHashEl.className = "block text-[10px] font-mono text-gray-600 dark:text-gray-300 break-all bg-blue-50 dark:bg-blue-900/10 p-1.5 rounded mt-1 border border-blue-100 dark:border-blue-900/20";
    if(ipfsHashEl) ipfsHashEl.className = "block text-[10px] font-mono text-gray-600 dark:text-gray-300 break-all bg-purple-50 dark:bg-purple-900/10 p-1.5 rounded mt-1 border border-purple-100 dark:border-purple-900/20";

    try {
        // B. CALL API
        const response = await api.get(`/record/${recordId}`);

        if (response && response.metadata) {
            const integrity = response.integrity || {};
            console.log(response)
            // C. STEP 1: SHOW LEDGER DATA
            setTimeout(() => {
                if(progressBar) progressBar.style.width = '50%';
                statusText.innerText = "Ledger Data Found. Fetching IPFS File...";
                
                if(detailsDiv) detailsDiv.classList.remove('hidden');
                
                // Show Signer
                if(docIdEl) docIdEl.innerText = response.metadata.doctorId || "Unknown";
                
                // Show CID
                if(cidEl) cidEl.innerText = integrity.cidFromLedger || "N/A";

                // Show Trusted Ledger Hash
                if(ledgerHashEl) {
                    if (integrity.hashFromLedger === "Legacy record" || !integrity.hashFromLedger) {
                        ledgerHashEl.innerText = "N/A (Legacy Record)";
                    } else {
                        ledgerHashEl.innerText = integrity.hashFromLedger;
                    }
                }

            }, 800);

            // D. STEP 2: SHOW CALCULATED HASH
            setTimeout(() => {
                if(progressBar) progressBar.style.width = '80%';
                statusText.innerText = "Calculating File Hash...";
                
                if(ipfsHashEl) ipfsHashEl.innerText = integrity.calculatedHash || "Error";

            }, 1600);

            // E. STEP 3: FINAL VERDICT
            setTimeout(() => {
                if(progressBar) progressBar.style.width = '100%';
                
                const status = integrity.verificationStatus;

                // --- SUCCESS CASES ---
                if (status === 'VALID' || status === 'NO_HASH') {
                    
                    if (status === 'VALID') {
                        // 1. FULL SECURITY (Green)
                        statusText.innerText = "INTEGRITY VERIFIED: Double-Check Passed.";
                        statusText.className = "text-sm text-green-600 font-bold mb-6 font-mono";
                        if(ledgerHashEl) {
                            ledgerHashEl.classList.add('text-green-600', 'font-bold', 'bg-green-50');
                            ledgerHashEl.innerText = integrity.hashFromLedger; 
                        }
                    } else {
                        // 2. LEGACY SECURITY (Blue)
                        statusText.innerText = "INTEGRITY VERIFIED (Via IPFS CID).";
                        statusText.className = "text-sm text-blue-600 font-bold mb-6 font-mono";
                        if(ledgerHashEl) ledgerHashEl.classList.add('text-gray-400', 'italic');
                    }

                    if(icon) {
                        icon.innerText = 'check_circle';
                        icon.className = 'material-symbols-outlined absolute inset-0 flex items-center justify-center text-green-500 text-3xl animate-bounce';
                    }
                    if(spinner) spinner.classList.add('hidden');

                    // ⭐ SHOW BUTTON (Requires User Interaction for New Tab)
                    if(viewBtn) {
                        viewBtn.classList.remove('hidden');
                        viewBtn.onclick = () => {
                            // Open detail page in new tab
                            window.open(`record-detail.html?id=${recordId}`, '_blank');
                            // Close modal in background
                            modal.classList.add('hidden');
                        };
                    }

                } 
                // --- FAILURE CASE ---
                else {
                    statusText.innerText = "WARNING: HASH MISMATCH! FILE MAY BE CORRUPT.";
                    statusText.className = "text-sm text-red-600 font-bold mb-6 font-mono";
                    
                    if(ledgerHashEl) ledgerHashEl.classList.add('text-red-600', 'font-bold', 'bg-red-50', 'border-red-200');
                    if(ipfsHashEl) ipfsHashEl.classList.add('text-red-600', 'font-bold', 'bg-red-50', 'border-red-200');
                    
                    if(icon) icon.innerText = 'warning';
                    if(spinner) spinner.classList.add('hidden');
                }
            }, 2400);

        } else {
            throw new Error("Invalid response from ledger");
        }

    } catch (error) {
        console.error("Verification Failed:", error);
        if(statusText) {
            statusText.innerText = "Verification Failed: " + (error.message || "Network Error");
            statusText.className = "text-sm text-red-500 font-bold mb-6";
        }
        if(spinner) spinner.classList.add('hidden');
        if(icon) icon.innerText = 'error';
    }
}

// INITIALIZE
document.addEventListener('DOMContentLoaded', loadPageData);