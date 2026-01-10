import { api } from './services/api.service.js';

// 1. Get ID from URL (e.g. ?id=REC-2024...)
const urlParams = new URLSearchParams(window.location.search);
const recordId = urlParams.get('id');

const elements = {
    metaType: document.getElementById('metaType'), // Add these IDs to your HTML metadata section
    metaPatient: document.getElementById('metaPatient'),
    metaDate: document.getElementById('metaDate'),
    hashDisplay: document.getElementById('ipfs-hash'),
    pdfPreview: document.getElementById('pdf-preview'),
    btnVerified: document.getElementById('btn-verified'),
    statusBanner: document.getElementById('banner-verified')
};

async function loadRecordDetail() {
    if (!recordId) {
        alert("No Record ID provided!");
        return;
    }

    try {
        Toastify({ text: "Fetching & Decrypting from IPFS...", backgroundColor: "#3617cf", duration: 2000 }).showToast();

        // 1. Call Backend
        const data = await api.get(`/record/${recordId}`);
        const metadata = data.metadata.metadata; // Blockchain metadata
        const fileBase64 = data.fileData; // Decrypted file

        // 2. Update UI Metadata
        // (Ensure your doc-record-detail.html elements have these IDs if you want them updated)
        // elements.metaType.innerText = metadata.type;
        // elements.metaDate.innerText = metadata.date;

        // 3. Update Hash Visuals
        document.getElementById('ipfs-hash').innerHTML = 
            `<span class="text-blue-400 break-all">${data.metadata.ipfsHash}</span>`;

        // 4. Render the File
        renderFile(fileBase64, metadata.type);

    } catch (error) {
        console.error(error);
        Toastify({ text: "Error loading record: " + error.message, backgroundColor: "#EF4444" }).showToast();
    }
}

function renderFile(base64Data, type) {
    const container = document.getElementById('pdf-preview');
    container.innerHTML = ''; // Clear placeholder
    container.classList.remove('opacity-50');

    // Basic detection based on type or just try to render
    // For FYP, we can assume Images or PDF
    
    if (type && (type.includes('Scan') || type.includes('X-Ray'))) {
        // Render Image
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${base64Data}`;
        img.className = "max-w-full rounded-lg shadow-lg";
        container.appendChild(img);
    } else {
        // Render PDF (using Embed or Iframe)
        const embed = document.createElement('embed');
        embed.src = `data:application/pdf;base64,${base64Data}`;
        embed.type = "application/pdf";
        embed.width = "100%";
        embed.height = "600px";
        container.appendChild(embed);
    }
}

loadRecordDetail();