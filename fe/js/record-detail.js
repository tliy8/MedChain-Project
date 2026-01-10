import { authService } from './services/auth.service.js';
import { api } from './services/api.service.js';

// 1. AUTH CHECK
if (!authService.isAuthenticated()) window.location.href = 'login.html';

const elements = {
    recordTitle: document.getElementById('recordTitle'),
    recordDate: document.getElementById('recordDate'),
    fileViewer: document.getElementById('fileViewer'),
    vitalsContainer: document.getElementById('vitalsContainer'),
    metaId: document.getElementById('metaId'),
    metaDoctor: document.getElementById('metaDoctor'),
    metaHospital: document.getElementById('metaHospital'),
    metaHash: document.getElementById('metaHash')
};

/* ============================================================
   2. INTELLIGENT VIEWER UTILITIES
   ============================================================ */

// A. ROBUST MIME DETECTOR (Magic Bytes + Extension + Heuristics)
function detectSmartMimeType(base64, fileName) {
    try {
        const binary = atob(base64.substring(0, 50)); 
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const header = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

        // 1. MAGIC BYTES (Binary Formats)
        if (header.startsWith('25504446')) return 'application/pdf'; // PDF
        if (header.startsWith('89504E47')) return 'image/png'; // PNG
        if (header.startsWith('FFD8FF')) return 'image/jpeg';  // JPEG
        if (header.startsWith('47494638')) return 'image/gif'; // GIF
        if (header.startsWith('424D')) return 'image/bmp';     // BMP
        if (header.startsWith('52494646') && header.substring(16, 24) === '57454250') return 'image/webp'; // WebP

        // 2. EXTENSION CHECK (Crucial for Text/Medical Data)
        if (fileName) {
            const ext = fileName.split('.').pop().toLowerCase();
            const textExtensions = ['txt', 'bat', 'js', 'json', 'xml', 'html', 'css', 'md', 'log', 'csv', 'hl7'];
            if (textExtensions.includes(ext)) return `text/${ext === 'txt' ? 'plain' : ext}`;
        }

        // 3. HEURISTIC TEXT CHECK (Last Resort)
        // If no magic bytes, check if the first 50 chars are printable ASCII
        const isText = Array.from(bytes).every(b => (b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13);
        if (isText) return 'text/plain';

        return 'application/octet-stream'; // Unknown binary
    } catch (e) {
        return 'application/octet-stream';
    }
}

// B. HELPER: CONVERT BASE64 TO BLOB
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

// C. HELPER: SAFE TEXT DECODER
function base64ToTextSafe(base64) {
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
        return "Error decoding text content.";
    }
}

// D. HTML ESCAPE
function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ============================================================
   3. DATA FETCHING
   ============================================================ */
async function loadRecordDetail() {
    const params = new URLSearchParams(window.location.search);
    const recordId = params.get('id');

    if (!recordId) {
        alert("No record ID.");
        return;
    }

    if(elements.fileViewer) {
        elements.fileViewer.innerHTML = `<div class="p-10 text-center text-gray-500"><span class="material-symbols-outlined animate-spin text-3xl mb-2">sync</span><p>Decrypting secure file from IPFS...</p></div>`;
    }

    try {
        const response = await api.get(`/record/${recordId}`);
        renderRecord(response);
    } catch (error) {
        if(elements.fileViewer) {
            elements.fileViewer.innerHTML = `<div class="p-10 text-center text-red-500"><span class="material-symbols-outlined text-3xl mb-2">error</span><p>${error.message}</p></div>`;
        }
    }
}

/* ============================================================
   4. RENDER LOGIC
   ============================================================ */
function renderRecord(response) {
    const record = response.metadata || {};
    const integrity = response.integrity || {};
    const fileBase64 = response.fileData;
    const recName = record.recordName || record.recordType || "Medical Record";

    // 1. Render Metadata
    elements.recordTitle.innerText = recName;
    elements.recordDate.innerText = new Date(record.timestamp).toLocaleString();
    elements.metaId.innerText = record.recordId;
    elements.metaDoctor.innerText = record.doctorName || record.doctorId || "Unknown";
    elements.metaHospital.innerText = record.hospitalName || record.hospitalId || "Unknown";
    elements.metaHash.innerText = integrity.cidFromLedger || record.ipfsCid || "N/A";

    // 2. Render Vitals
    if (elements.vitalsContainer && record.vitals) {
        const v = record.vitals;
        elements.vitalsContainer.innerHTML = `
            <div class="bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-white/5 p-6 shadow-sm mb-6">
                <div class="flex items-center gap-2 mb-4"><span class="material-symbols-outlined text-red-500">favorite</span><h3 class="font-bold text-gray-900 dark:text-white">Vitals</h3></div>
                <div class="grid grid-cols-3 gap-3 text-center">
                    <div class="bg-gray-50 rounded-xl p-3"><p class="text-[10px] text-gray-500">Heart Rate</p><p class="font-bold">${v.heartRate || '--'}</p></div>
                    <div class="bg-gray-50 rounded-xl p-3"><p class="text-[10px] text-gray-500">BP</p><p class="font-bold">${v.bp || v.bloodPressure || '--'}</p></div>
                    <div class="bg-gray-50 rounded-xl p-3"><p class="text-[10px] text-gray-500">Weight</p><p class="font-bold">${v.weight || '--'}</p></div>
                </div>
            </div>`;
    }

    // 3. CALL UNIVERSAL VIEWER
    if (elements.fileViewer) {
        renderUniversalViewer(elements.fileViewer, fileBase64, recName, record.fileType);
    }
}

/* ============================================================
   5. UNIVERSAL VIEWER FUNCTION
   ============================================================ */
function renderUniversalViewer(container, fileBase64, recordName, originalMime) {
    if (!fileBase64) {
        container.innerHTML = `<div class="p-10 text-center text-gray-400">No file content available.</div>`;
        return;
    }

    container.innerHTML = ''; // Clear loading state

    // 1. Intelligent Detection
    let mime = detectSmartMimeType(fileBase64, recordName);
    
    // Fallback to server-provided MIME if detection returns generic octet-stream
    if (mime === 'application/octet-stream' && originalMime) {
        mime = originalMime;
    }

    const blob = base64ToBlob(fileBase64, mime);
    const blobUrl = URL.createObjectURL(blob);
    const ext = recordName.includes('.') ? recordName.split('.').pop().toUpperCase() : 'FILE';

    // === A. PDF VIEWER ===
    if (mime === 'application/pdf') {
        container.innerHTML = `
            <iframe src="${blobUrl}" width="100%" height="100%" class="rounded-lg shadow-sm" style="border:none; min-height:600px;"></iframe>
        `;
    }
    // === B. IMAGE VIEWER ===
    else if (mime.startsWith('image/')) {
        container.innerHTML = `
            <div class="flex items-center justify-center h-full bg-gray-50 dark:bg-black/20 p-4 min-h-[600px] overflow-auto rounded-lg">
                <img src="${blobUrl}" class="max-w-full max-h-[800px] object-contain shadow-lg" alt="Record Image" />
            </div>`;
    }
    // === C. TEXT / CODE / XML / HL7 VIEWER ===
    else if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) {
        const textContent = base64ToTextSafe(fileBase64);
        container.innerHTML = `
            <div class="h-full flex flex-col min-h-[600px] border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
                <div class="bg-gray-100 dark:bg-[#1e1e1e] border-b border-gray-300 dark:border-gray-700 px-4 py-2 flex justify-between items-center">
                    <span class="font-bold text-gray-600 dark:text-gray-300 text-xs font-mono uppercase">
                        <span class="material-symbols-outlined text-[14px] align-middle mr-1">code</span> ${ext} EDITOR VIEW
                    </span>
                    <span class="text-xs text-gray-500">${(blob.size / 1024).toFixed(2)} KB</span>
                </div>
                <div class="flex-1 bg-white dark:bg-[#1e1e1e] text-gray-800 dark:text-[#d4d4d4] p-4 overflow-auto font-mono text-sm leading-relaxed">
                    <pre class="whitespace-pre-wrap break-all">${escapeHtml(textContent)}</pre>
                </div>
            </div>`;
    }
    // === D. FALLBACK (Download Only) ===
    else {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-[600px] text-center p-10 bg-gray-50 dark:bg-white/5 rounded-lg border border-dashed border-gray-300">
                <div class="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                    <span class="material-symbols-outlined text-4xl text-blue-500">folder_zip</span>
                </div>
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Preview Not Supported</h3>
                <p class="text-gray-500 mb-6 max-w-sm">
                    This file format (<strong>${ext}</strong>) cannot be viewed in the browser, but it is safe to download.
                </p>
                <a href="${blobUrl}" download="${recordName}" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all flex items-center gap-2 shadow-md">
                    <span class="material-symbols-outlined">download</span> Download ${ext} File
                </a>
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', loadRecordDetail);