import { submitTransaction, evaluateTransaction } from '../utils/fabric_gateway.js';

// Helper to safely fetch data
const fetchLedgerData = async (adminId, org, fcn, ...args) => {
    try {
        const buff = await evaluateTransaction(adminId, org, fcn, ...args);
        return buff && buff.length > 0 ? JSON.parse(buff.toString()) : [];
    } catch (e) { return []; }
};

export const getSystemStats = async (adminId, org) => {
    // 1. Fetch Doctors Count
    const doctors = await fetchLedgerData(adminId, org, 'QueryAllDoctors');
    const doctorCount = doctors.length;

    // 2. Fetch Patients Count
    const patients = await fetchLedgerData(adminId, org, 'QueryAllPatients');
    const patientCount = patients.length;

    // 3. Fetch Recent Events (Last 7 Days)
    const records = await fetchLedgerData(adminId, org, 'QueryAllMedicalRecords');
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const eventCount = records.filter(r => new Date(r.timestamp) > weekAgo).length;

    return {
        hospitalCount: 1, // Hardcoded as per original logic
        doctorCount,
        patientCount,
        eventCount
    };
};

export const getAllDoctors = async (adminId, org) => {
    return await fetchLedgerData(adminId, org, 'QueryAllDoctors');
};

export const getSystemEvents = async (adminId, org) => {
    console.log(`[Audit] Starting Deep History Scan...`);
    let allEvents = [];

    // 1. MEDICAL RECORDS (Uploads & Views)
    const records = await fetchLedgerData(adminId, org, 'QueryAllMedicalRecords');
    
    records.forEach(r => {
        // Upload Event
        allEvents.push({
            txId: r.recordId,
            timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
            eventName: 'MedicalDataUploaded',
            caller: r.doctorId,
            data: `Uploaded Diagnosis: ${r.diagnosis}`,
            msp: 'Org1MSP'
        });

        // View Events (from internal accessHistory)
        if (r.accessHistory && Array.isArray(r.accessHistory)) {
            r.accessHistory.forEach((log, idx) => {
                let viewerRole = 'User';
                if (log.user === r.patientId) viewerRole = 'Patient (Self)';
                else if (log.user.toLowerCase().includes('doc')) viewerRole = 'Doctor';

                allEvents.push({
                    txId: `view_${r.recordId}_${idx}`, 
                    timestamp: log.timestamp || new Date().toISOString(),
                    eventName: 'MedicalDataViewed',
                    caller: log.user,
                    data: `${viewerRole} viewed Record: ${r.recordId}`,
                    msp: log.org || 'Org1MSP'
                });
            });
        }
    });

    // 2. PATIENT HISTORY REPLAY (Consent Changes)
    const patients = await fetchLedgerData(adminId, org, 'QueryAllPatients');

    for (const p of patients) {
        // Fetch history for every patient
        const history = await fetchLedgerData(adminId, org, 'GetAssetHistory', p.patientId || p.userId);
        
        // Sort Oldest -> Newest to replay
        history.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
        
        let previousConsents = [];

        history.forEach(tx => {
            if (!tx.Value) return;
            const historicPatient = JSON.parse(tx.Value);
            const currentConsents = historicPatient.consents || [];

            // Detect Granted
            const granted = currentConsents.filter(id => !previousConsents.includes(id));
            granted.forEach(providerId => {
                allEvents.push({
                    txId: tx.TxId,
                    timestamp: new Date(tx.Timestamp).toISOString(),
                    eventName: 'ConsentGranted',
                    caller: p.patientId || p.userId,
                    data: `Granted access to: ${providerId}`,
                    msp: 'Org1MSP'
                });
            });

            // Detect Revoked
            const revoked = previousConsents.filter(id => !currentConsents.includes(id));
            revoked.forEach(providerId => {
                allEvents.push({
                    txId: tx.TxId,
                    timestamp: new Date(tx.Timestamp).toISOString(),
                    eventName: 'ConsentRevoked',
                    caller: p.patientId || p.userId,
                    data: `Revoked access from: ${providerId}`,
                    msp: 'Org1MSP'
                });
            });

            previousConsents = currentConsents;
        });

        // Add Registration Event
        if (history.length > 0) {
            const firstTx = history[0];
            allEvents.push({
                txId: firstTx.TxId,
                timestamp: new Date(firstTx.Timestamp).toISOString(),
                eventName: 'UserRegistered',
                caller: 'System',
                data: `New Patient Registered: ${p.name}`,
                msp: 'Org1MSP'
            });
        }
    }

    // 3. DOCTOR REGISTRATION
    const doctors = await fetchLedgerData(adminId, org, 'QueryAllDoctors');
    doctors.forEach(d => {
        allEvents.push({
            txId: d.docId || 'reg_doc',
            timestamp: d.timestamp || '2024-01-01T08:00:00Z',
            eventName: 'DoctorRegistered',
            caller: 'Admin',
            data: `Doctor Registered: ${d.name}`,
            msp: d.org || 'Org2MSP'
        });
    });

    // Final Sort: Newest First
    allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return allEvents;
};