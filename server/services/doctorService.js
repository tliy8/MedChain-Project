import { submitTransaction, evaluateTransaction } from '../utils/fabric_gateway.js';

// Helper for "Time Ago" calculation
function timeAgo(timestamp) {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return Math.floor(seconds) + " seconds ago";
}

export const getDashboardStats = async (doctorId, org) => {
    let patientLookup = {}; 

    // 1. Build Patient Lookup Map (ID -> Name)
    try {
        const patientsBuffer = await evaluateTransaction(doctorId, org, 'QueryAllPatients');
        const patientsRaw = JSON.parse(patientsBuffer.toString());

        patientsRaw.forEach(p => {
            const actualPatient = p.Record || p; 
            const pId = actualPatient.userId || actualPatient.id || actualPatient.Key || p.Key;
            const pName = actualPatient.name || actualPatient.fullName || "Unknown";

            if (pId) {
                patientLookup[pId] = pName;
                patientLookup[pId.trim()] = pName;
            }
        });
    } catch (e) {
        console.warn("[Dashboard] Patient lookup failed:", e.message);
    }

    // 2. Fetch All Records (to filter for this doctor)
    let allRecords = [];
    try {
        // Try specific query first
        try {
            const buff = await evaluateTransaction(doctorId, org, 'QueryRecordsByDoctor', doctorId);
            allRecords = JSON.parse(buff.toString());
        } catch(e) {
            // Fallback: Query all records and filter manually
            const buff = await evaluateTransaction(doctorId, org, 'QueryAllMedicalRecords');
            allRecords = JSON.parse(buff.toString());
        }
    } catch(ex) {
        console.warn("[Dashboard] Failed to fetch records:", ex.message);
    }

    // 3. Filter Records: Is Doctor Approved? OR Did they view it?
    const doctorRecords = allRecords.filter(r => {
        const actualRecord = r.Record || r; 
        const isApproved = actualRecord.approvedDoctor === doctorId;
        const hasAccess = actualRecord.accessHistory && actualRecord.accessHistory.some(log => log.user === doctorId);
        return isApproved || hasAccess;
    });

    // 4. Calculate Stats & Activity Feed
    const uniquePatients = new Set();
    let totalAccessCount = 0;
    const activities = [];

    doctorRecords.forEach(rawRecord => {
        const r = rawRecord.Record || rawRecord; 
        
        const patientIdKey = r.owner || r.patientId || r.patient || "UnknownID";
        uniquePatients.add(patientIdKey);

        const pName = patientLookup[patientIdKey] || patientLookup[patientIdKey.trim()] || "Unknown";
        const recordName = r.recordType || r.recordName || r.recordId; 
        
        const activityBase = {
            recordId: r.recordId,
            recordName: recordName,
            patientId: patientIdKey,
            patientName: pName, 
            txHash: r.ipfsHash || "0x..." 
        };

        // Upload Event
        if (r.approvedDoctor === doctorId) {
            activities.push({ ...activityBase, type: 'upload', timestamp: r.timestamp });
        }

        // View Events
        if (r.accessHistory) {
            const myViews = r.accessHistory.filter(log => log.user === doctorId);
            totalAccessCount += myViews.length;
            myViews.forEach(log => {
                activities.push({ ...activityBase, type: 'view', timestamp: log.timestamp });
            });
        }
    });

    // 5. Final Formatting
    const recentActivity = activities
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5)
        .map(act => ({
            type: act.type,
            recordId: act.recordId,
            recordName: act.recordName,
            patientId: act.patientId,
            patientName: act.patientName,
            time: timeAgo(act.timestamp),
            status: "Confirmed",
            txHash: act.txHash
        }));

    return {
        patientsSeen: uniquePatients.size,
        totalAccess: totalAccessCount,
        recentInteractions: recentActivity
    };
};

export const getAllPatients = async (doctorId, org) => {
    try {
        const buffer = await evaluateTransaction(doctorId, org, 'QueryAllPatients');
        return JSON.parse(buffer.toString());
    } catch (error) {
        console.warn("Patient Search Error:", error);
        return [];
    }
};

export const getAllDoctors = async (callerId, org) => {
    const buffer = await evaluateTransaction(callerId, org, 'QueryAllDoctors');
    return JSON.parse(buffer.toString());
};