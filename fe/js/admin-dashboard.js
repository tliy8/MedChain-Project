import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

console.log("🚀 [DEBUG] Admin Dashboard Script Loaded");

// 1. ADMIN AUTH CHECK
if (!authService.isAuthenticated()) {
    window.location.href = 'login.html';
}

// 2. DOM ELEMENTS
const elements = {
    valHospitals: document.getElementById('val-hospitals'),
    valDoctors: document.getElementById('val-doctors'),
    valPatients: document.getElementById('val-patients'),
    valEvents: document.getElementById('val-events'),
    alertsContainer: document.getElementById('alertsContainer'),
    logoutBtn: document.getElementById('logoutBtn')
};

// Check if elements exist
console.log("🔍 [DEBUG] DOM Elements Check:", {
    hospitals: !!elements.valHospitals,
    doctors: !!elements.valDoctors,
    patients: !!elements.valPatients,
    events: !!elements.valEvents
});

// 3. LOGOUT LOGIC
if(elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', () => {
        console.log("🚪 [DEBUG] Logging out...");
        authService.logout();
    });
}

// 4. LOAD DASHBOARD DATA
async function loadAdminDashboard() {
    console.log("📡 [DEBUG] Calling API: /admin/stats...");

    try {
        // Attempt fetch
        const response = await api.get('/admin/stats');
        const stats = response.data ?? response; // supports both cases
        elements.valHospitals.innerText = stats.hospitalCount;
        elements.valDoctors.innerText   = stats.doctorCount;
        elements.valPatients.innerText  = stats.patientCount;
        elements.valEvents.innerText    = stats.eventCount;

        
        // Log the RAW result from backend
        console.log("✅ [DEBUG] API Success! Payload:", JSON.stringify(stats, null, 2));

        if (!stats) {
            throw new Error("API returned empty/null response");
        }

        // Update UI with logs
        console.log(`🎨 [DEBUG] Updating UI: Hospitals=${stats.hospitalCount}`);
        if (elements.valHospitals) elements.valHospitals.innerText = stats.hospitalCount;
        
        console.log(`🎨 [DEBUG] Updating UI: Doctors=${stats.doctorCount}`);
        if (elements.valDoctors) elements.valDoctors.innerText = stats.doctorCount;
        
        console.log(`🎨 [DEBUG] Updating UI: Patients=${stats.patientCount}`);
        if (elements.valPatients) elements.valPatients.innerText = stats.patientCount;
        
        console.log(`🎨 [DEBUG] Updating UI: Events=${stats.eventCount}`);
        if (elements.valEvents) elements.valEvents.innerText = stats.eventCount;

    } catch (error) {
        console.error("❌ [DEBUG] API FAILED:", error);
        
        // Update UI to show error
        const errText = "ERR";
        if (elements.valHospitals) elements.valHospitals.innerText = errText;
        if (elements.valDoctors) elements.valDoctors.innerText = errText;
        if (elements.valPatients) elements.valPatients.innerText = errText;
        if (elements.valEvents) elements.valEvents.innerText = errText;

        alert("API Error: " + error.message + "\nCheck Console (F12) for details.");
    }
}

// 5. LIVE SOCKET LISTENER
function initSocketListener() {
    if (typeof io === 'undefined') {
        console.warn("⚠️ [DEBUG] Socket.io script not loaded in HTML");
        return;
    }

    console.log("🔌 [DEBUG] Connecting to Socket.io...");
    const socket = io('http://localhost:3000'); 

    socket.on('connect', () => {
        console.log("✅ [DEBUG] Socket connected:", socket.id);
    });

    socket.on('connect_error', (err) => {
        console.error("❌ [DEBUG] Socket Connection Error:", err);
    });

    socket.on('chain-log', (data) => {
        console.log("📨 [DEBUG] Socket Event Received:", data);
        addAlertCard(data);
    });
}

function addAlertCard(data) {
    if (!elements.alertsContainer) return;

    let color = 'blue';
    let icon = 'info';
    let title = 'Network Info';

    if (data.type === 'BLOCK') {
        color = 'green';
        icon = 'deployed_code';
        title = 'New Block Mined';
    } else if (data.type === 'TX') {
        color = 'purple';
        icon = 'receipt_long';
        title = 'Transaction';
    }

    const cardHtml = `
        <div class="flex gap-4 p-4 rounded-xl bg-${color}-50 dark:bg-${color}-900/10 border border-${color}-100 dark:border-${color}-900/20 animate-fade-in">
            <div class="shrink-0">
                <div class="size-10 rounded-full bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center text-${color}-600">
                    <span class="material-symbols-outlined">${icon}</span>
                </div>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start">
                    <h4 class="text-sm font-bold text-gray-900 dark:text-white">${title}</h4>
                    <span class="text-[10px] font-mono text-gray-400">Just now</span>
                </div>
                <p class="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed break-all">
                    ${data.text}
                </p>
            </div>
        </div>
    `;

    if (elements.alertsContainer.innerText.includes('Loading')) {
        elements.alertsContainer.innerHTML = '';
    }
    elements.alertsContainer.insertAdjacentHTML('afterbegin', cardHtml);
}

// Start
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚦 [DEBUG] DOMContentLoaded - Starting App");
    loadAdminDashboard();
    initSocketListener();
});