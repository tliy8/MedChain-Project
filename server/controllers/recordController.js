import * as recordService from '../services/recordService.js';

export const addRecord = async (req, res) => {
    const doctorId = req.user.fabric_id;
    const { 
        recordId, 
        patientId, 
        hospitalId, 
        recordName, 
        recordType, 
        description, 
        vitals,
        fileData // <--- Get Base64 string from JSON body
    } = req.body;

    console.log(`\n🛑 SECURITY CHECK: Upload Attempt by ${doctorId} for Patient ${patientId}`);

    try {
        // 1. INPUT VALIDATION
        // Check if fileData exists in the JSON body
        if (!fileData) {
            return res.status(400).json({ error: 'No file data uploaded.' });
        }
        
        // Validate required fields
        if (!recordName || !recordType || !description || !vitals) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        // 2. CONVERT BASE64 TO BUFFER
        let fileBuffer;
        try {
            fileBuffer = Buffer.from(fileData, 'base64');
        } catch (e) {
            return res.status(400).json({ error: 'Invalid Base64 file data.' });
        }

        // 3. CALL SERVICE
        // We create a "mock" file object to match what the Service expects
        const fileObj = { buffer: fileBuffer };

        const result = await recordService.addRecord(
            req.user, 
            fileObj, // Passing our manual buffer container
            req.body
        );

        res.status(200).json(result);

    } catch (error) {
        console.error('[ADD RECORD ERROR]', error);

        if (error.message.includes('not found on ledger')) {
            return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('ACCESS DENIED')) {
            return res.status(403).json({ error: error.message });
        }
        
        res.status(500).json({ error: `Add Record failed: ${error.message}` });
    }
};
export const getHistory = async (req, res) => {
    try {
        const { recordId } = req.params;
        const result = await recordService.getRecordHistory(req.user.fabric_id, req.user.org, recordId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch history" });
    }
};
export const verifyDownload = async (req, res) => {
    try {
        const { recordId, ipfsHash } = req.body;
        const result = await recordService.verifyAndDownload(req.user.fabric_id, req.user.org, recordId, ipfsHash);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ verificationStatus: 'ERROR', error: error.message });
    }
};
export const viewRecord = async (req, res) => {
    try {
        const { recordId } = req.params;
        const result = await recordService.viewFullRecord(req.user.fabric_id, req.user.org, recordId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
export const getPatientRecords = async (req, res) => {
    try {
        const callerId = req.user.fabric_id;
        const callerRole = req.user.role;
        const callerOrg = req.user.org;
        const targetPatientId = req.params.patientId;

        const records = await recordService.getRecordsForPatientSecure(callerId, callerRole, callerOrg, targetPatientId);
        
        return res.status(200).json(records);

    } catch (error) {
        // Map specific error messages to status codes
        if (error.message.includes("ACCESS_DENIED")) {
            return res.status(403).json({ error: error.message });
        }
        if (error.message === "PATIENT_NOT_FOUND") {
            return res.status(404).json({ error: "Patient not found" });
        }
        
        console.error("❌ SERVER ERROR:", error.message);
        return res.status(500).json({ error: error.message });
    }
};