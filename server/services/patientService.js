import { submitTransaction, evaluateTransaction } from '../utils/fabric_gateway.js';

export const getDashboardStats = async (patientId, org) => {
    // 1. Fetch Real Records (Count)
    let totalRecords = 0;
    let records = [];
    try {
        const recordsBuffer = await evaluateTransaction(patientId, org, 'QueryRecordsByPatient', patientId);
        records = JSON.parse(recordsBuffer.toString());
        totalRecords = records.length;
    } catch (e) {
        console.warn("No records found:", e.message);
    }

    // 2. Fetch User Profile (Active Grants)
    let activeGrants = 0;
    let consents = [];
    try {
        const userBuffer = await evaluateTransaction(patientId, org, 'GetUser', patientId);
        const user = JSON.parse(userBuffer.toString());
        if (user.consents && Array.isArray(user.consents)) {
            activeGrants = user.consents.length;
            consents = user.consents;
        }
    } catch (e) {
        console.warn("Could not fetch user profile:", e.message);
    }

    // 3. Build Recent Activity (Mix of Uploads & Views)
    let recentActivity = [];
    
    // Add Uploads
    records.forEach(r => {
        recentActivity.push({
            action: 'Record Uploaded',
            details: `File: ${r.recordName || r.recordId}`,
            date: new Date(r.timestamp).toLocaleDateString() + ' ' + new Date(r.timestamp).toLocaleTimeString(),
            timestamp: r.timestamp,
            txHash: r.ipfsHash || "0x..." 
        });
    });

    // Add Views
    records.forEach(r => {
        if(r.accessHistory && Array.isArray(r.accessHistory)) {
            r.accessHistory.forEach(log => {
                recentActivity.push({
                    action: 'Record Viewed',
                    details: `Viewed by: ${log.user}`,
                    date: new Date(log.timestamp).toLocaleString(),
                    timestamp: new Date(log.timestamp).getTime(),
                    txHash: "View-Action"
                });
            });
        }
    });

    // Sort Newest & Limit to 5
    recentActivity.sort((a, b) => b.timestamp - a.timestamp);
    const topActivity = recentActivity.slice(0, 5);

    return {
        totalRecords,
        activeGrants,
        consents,
        recentActivity: topActivity
    };
};

export const getAuditLog = async (patientId, org) => {
    const events = [];

    // 1. Fetch User History (Registration & Consents)
    let history = [];
    try {
        const historyBuffer = await evaluateTransaction(patientId, org, 'GetAssetHistory', patientId);
        history = JSON.parse(historyBuffer.toString());
    } catch (e) { console.warn("No user history:", e.message); }

    history.sort((a, b) => a.Timestamp - b.Timestamp);

    history.forEach((tx, index) => {
        if (tx.IsDelete || !tx.Value) return;
        try {
            const currState = JSON.parse(tx.Value);
            const prevState = index > 0 ? JSON.parse(history[index - 1].Value) : {};
            
            let action = 'Unknown';
            let details = 'Profile Update';

            if (index === 0) {
                action = 'UserRegistered';
                details = 'Account Created';
            } else {
                const currConsents = currState.consents || [];
                const prevConsents = prevState.consents || [];

                if (currConsents.length > prevConsents.length) {
                    action = 'ConsentGranted';
                    const added = currConsents.find(c => !prevConsents.includes(c));
                    details = `Granted to: ${added || 'Provider'}`;
                } else if (currConsents.length < prevConsents.length) {
                    action = 'ConsentRevoked';
                    const removed = prevConsents.find(c => !currConsents.includes(c));
                    details = `Revoked from: ${removed || 'Provider'}`;
                }
            }
            events.push({
                timestamp: tx.Timestamp,
                action, actor: patientId, details, txId: tx.TxId
            });
        } catch (e) {}
    });

    // 2. Fetch Medical Records (Uploads & Views)
    try {
        const recordsBuffer = await evaluateTransaction(patientId, org, 'QueryRecordsByPatient', patientId);
        const records = JSON.parse(recordsBuffer.toString());
        
        records.forEach(record => {
            events.push({
                timestamp: record.timestamp,
                action: 'RecordUploaded',
                actor: record.doctorId || 'Unknown',
                details: `File: ${record.recordName || record.recordId}`,
                txId: "N/A"
            });

            if (record.accessHistory) {
                record.accessHistory.forEach(log => {
                    events.push({
                        timestamp: new Date(log.timestamp).getTime(),
                        action: 'RecordViewed',
                        actor: log.user === patientId ? 'Me' : log.user,
                        details: `Viewed File: ${record.recordName}`,
                        txId: "N/A"
                    });
                });
            }
        });
    } catch (e) {}

    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return events;
};


export const getPatientRecordsSecure = async (callerId, callerOrg, callerRole, targetPatientId) => {
    
    // [RESTORED] Initial Log
    console.log(`\n🛑 SECURITY CHECK: ${callerId} requesting records for ${targetPatientId}`);

    // 1. IS IT THE PATIENT THEMSELVES? (Allow)
    if (callerId === targetPatientId) {
        // Allowed: Patient accessing their own records
    } 
    // 2. IS IT A DOCTOR? (Check Consent)
    else if (callerRole === 'doctor') {
        // [RESTORED] Verification Log
        console.log("🔗 Verifying Consent Token on Blockchain...");

        const profileBuffer = await evaluateTransaction(callerId, callerOrg, 'GetUser', targetPatientId);
        
        if (!profileBuffer || profileBuffer.length === 0) {
            // [MATCH] Use exact string "Patient not found" for Controller 404 check
            throw new Error("Patient not found"); 
        }
        
        const profile = JSON.parse(profileBuffer.toString());
        const authorizedList = profile.consents || [];

        if (!authorizedList.includes(callerId)) {
            // [RESTORED] Blocked Log
            console.warn(`⛔ BLOCKED: Doctor ${callerId} is NOT in consent list: [${authorizedList}]`);
            throw new Error("ACCESS DENIED: No Consent Token found.");
        }
        
        // [RESTORED] Success Log
        console.log("✅ ALLOWED: Consent Token Valid.");
    } 
    // 3. ANYONE ELSE? (Block)
    else {
        throw new Error("Unauthorized Role");
    }

    // --- FETCH RECORDS ---
    const buffer = await evaluateTransaction(callerId, callerOrg, 'QueryRecordsByPatient', targetPatientId);
    
    // Safety check: ensure buffer exists (Logic Improvement from original, but safe to keep)
    if (!buffer || buffer.length === 0) {
        return [];
    }

    try {
        let records = JSON.parse(buffer.toString());
        
        // [MATCH] Sort Newest First
        records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return records;
    } catch (e) {
        console.error("JSON Parse Error:", e);
        return []; 
    }
};

export const getUserSecure = async (requesterId, org, role, targetUserId) => {
    // 1. (Optional) Role-based logic
    // if (role === 'patient' && requesterId !== targetUserId) throw new Error("ACCESS DENIED");

    // 2. Call Chaincode
    const buffer = await evaluateTransaction(requesterId, org, 'GetUser', targetUserId);
    
    // SAFETY CHECK: Ensure we actually got data back
    if (!buffer || buffer.length === 0) {
        throw new Error(`User ${targetUserId} does not exist.`);
    }

    return JSON.parse(buffer.toString());
};