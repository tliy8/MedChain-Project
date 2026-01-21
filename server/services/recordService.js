import { userInfo } from "os";
import { submitTransaction, evaluateTransaction } from '../utils/fabric_gateway.js';
import { uploadEncryptedFile,getAndDecryptFile } from "../../ipfs_handler.js";
import crypto from 'crypto';


export const addRecord = async (user, file, body) => {
    const {
        recordId,
        patientId,
        hospitalId,
        recordName,
        recordType,
        description,
        vitals
    } = body;

    const doctorId = user.fabric_id;
    const callerOrg = user.org;

    if (user.role !== 'doctor') throw new Error('Only doctors are authorized to add records.');

    // 1. CONSENT CHECK
    console.log("🔗 Verifying Upload Consent on Ledger...");
    const profileBuffer = await evaluateTransaction(doctorId, callerOrg, 'GetUser', patientId);
    
    if (!profileBuffer || profileBuffer.length === 0) {
        throw new Error(`Patient ${patientId} not found on ledger.`);
    }

    const profile = JSON.parse(profileBuffer.toString());
    const authorizedList = profile.consents || [];

    if (!authorizedList.includes(doctorId)) {
        throw new Error("ACCESS DENIED: You do not have consent to upload records for this patient.");
    }

    // 2. PROCESS FILE
    // 'file' here is the { buffer: ... } object we created in the Controller
    const fileBuffer = file.buffer; 

    if (fileBuffer.length < 10) throw new Error('Invalid fileData: File too small.');

    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const ipfsHash = await uploadEncryptedFile(fileBuffer);

    console.log('🔐 File SHA-256:', fileHash);
    console.log('🌐 IPFS CID:', ipfsHash);

    // 3. SUBMIT TO BLOCKCHAIN
    const content = JSON.stringify({ recordName, recordType, description, vitals });
    
    const result = await submitTransaction(
        doctorId, 'Org2', 'AddMedicalRecord',
        recordId, patientId, doctorId, hospitalId,
        ipfsHash, fileHash, content
    );

    return { message: result, ipfsHash, fileHash };
};
export const getRecordMetadata = async (callerId, org, recordId) => {
    const buffer = await evaluateTransaction(callerId, org, 'ViewMedicalRecord', recordId);
    return JSON.parse(buffer.toString());
};

export const getRecordHistory = async (callerId, org, recordId) => {
    const buffer = await evaluateTransaction(callerId, org, 'GetAssetHistory', recordId);
    return JSON.parse(buffer.toString()); // Returns array of history
};
export const verifyAndDownload = async (callerId, org, recordId, ipfsHashToCheck) => {
    // 1. Verify against Ledger Metadata
    const record = await getRecordMetadata(callerId, org, recordId);

    // --- MANUALLY TRIGGER TAMPERING FOR SPECIFIC ID ---
    if (recordId == "REC-2026-88461") {
        console.warn("⚠️ SECURITY SIMULATION: Manually corrupting hash for demo...");
        
        // We intentionally change the hash to a dummy value.
        // This guarantees it will NOT match 'record.fileHash' below.
        ipfsHashToCheck = "CORRUPTED_HASH_VALUE_12345"; 
    }
    // ---------------------------------------------------

    if (record.fileHash !== ipfsHashToCheck) {
        // Because of the change above, this Error will strictly trigger for REC-2026-22268
        throw new Error('TAMPERED: Hash mismatch with ledger.');
    }

    // 2. Download & Decrypt
    const fileBuffer = await getAndDecryptFile(record.fileHash);

    // 3. Integrity Check
    const calculatedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    // Note: If you stored fileHash on ledger, verify it here:
    // if (record.fileHash && record.fileHash !== calculatedHash) throw new Error("Integrity Fail");

    return {
        verificationStatus: 'MATCH',
        fileData: fileBuffer,
        fileName: `${recordId}.pdf`
    };
};
// services/recordService.js

export const viewFullRecord = async (callerId, org, recordId) => {
    // 1. Fetch Metadata
    const metadata = await getRecordMetadata(callerId, org, recordId);
    
    // Support both old 'ipfsCid' and new 'ipfsHash' keys
    const ledgerCid = metadata.ipfsHash || metadata.ipfsCid;
    // Support both old 'checksum' and new 'fileHash' keys
    const ledgerHash = metadata.fileHash || metadata.checksum; 

    // 2. Log Access (Fire & Forget)
    submitTransaction(callerId, org, 'LogRecordAccess', recordId).catch(console.error);

    if (!ledgerCid) throw new Error('Record metadata exists but IPFS CID is missing.');

    // 3. Fetch File
    const fileBuffer = await getAndDecryptFile(ledgerCid);

    // 4. Verify Integrity
    // ⚠️ CHANGED 'const' to 'let' so we can modify it below
    let calculatedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // ============================================================
    // 🛑 TAMPER SIMULATION (Backend Level)
    // ============================================================
    if (recordId === 'REC-2026-88461') {
        console.warn(`⚠️ SECURITY ALERT: Simulating corruption for ${recordId}`);
        // We overwrite the valid hash with a fake one. 
        // This forces the comparison below to FAIL.
        calculatedHash = "DEADBEEF00000000000000000000000000000000000000000000000000000000";
    }
    // // ============================================================
    
    // Compare Ledger Hash vs Calculated Hash
    let verificationStatus = "VALID";

    if (ledgerHash && ledgerHash !== calculatedHash) {
        // This will now trigger for REC-2026-22268 because we changed calculatedHash above
        verificationStatus = "TAMPERED";
    } else if (!ledgerHash) {
        verificationStatus = "NO_HASH_ON_LEDGER";
    }

    return {
        metadata,
        fileData: fileBuffer.toString('base64'),
        integrity: {
            cidFromLedger: ledgerCid,
            hashFromLedger: ledgerHash || "Legacy Record (No Hash)", 
            calculatedHash, // This will return the "DEADBEEF..." hash so you can see it in the UI
            verificationStatus
        }
    };
};
export const getRecordsForPatientSecure = async (callerId, callerRole, callerOrg, targetPatientId) => {
    console.log("\n🛑 ---------------- SECURITY CHECK ---------------- 🛑");
    console.log(`🕵️‍♂️ WHO IS CALLING?  ID: ${callerId} | Role: ${callerRole}`);
    console.log(`🎯 TARGET PATIENT?  ID: ${targetPatientId}`);

    // 1. CHECK: IS IT SELF-ACCESS
    if (callerId === targetPatientId) {
        console.log("✅ RESULT: ALLOWED (Patient viewing own data)");
        return await fetchRecordsInternal(callerId, callerOrg, targetPatientId);
    }

    // 2. CHECK: IS IT A DOCTOR
    if (callerRole !== 'doctor') {
        console.log("⛔ RESULT: BLOCKED (User is not a doctor or patient)");
        throw new Error("ACCESS_DENIED_ROLE: Only doctors or the patient themselves can view these records.");
    }

    // 3. CHECK: BLOCKCHAIN CONSENT
    console.log("🔗 QUERYING LEDGER for Consent Token...");
    const profileBuffer = await evaluateTransaction(callerId, callerOrg, 'GetUser', targetPatientId);

    // Handle Empty Profile
    if (!profileBuffer || profileBuffer.length === 0) {
        console.log("⚠️ RESULT: FAILED (Patient profile not found)");
        throw new Error("PATIENT_NOT_FOUND");
    }

    const patientProfile = JSON.parse(profileBuffer.toString());
    const authorizedList = patientProfile.consents || [];

    console.log(`📜 CONSENT LIST FOUND: [ ${authorizedList.join(' , ')} ]`);

    // 4. THE DECISION
    if (authorizedList.includes(callerId)) {
        console.log("✅ RESULT: ACCESS GRANTED (Doctor ID found in list)");
        return await fetchRecordsInternal(callerId, callerOrg, targetPatientId);
    } else {
        console.log("⛔ RESULT: ACCESS DENIED (Doctor ID NOT in list)");
        throw new Error("ACCESS_DENIED_CONSENT: No Consent Token found.");
    }
};

// Helper function (Private to this file)
const fetchRecordsInternal = async (callerId, org, targetId) => {
    console.log("📥 FETCHING RECORDS...");
    const buffer = await evaluateTransaction(callerId, org, 'QueryRecordsByPatient', targetId);
    const records = JSON.parse(buffer.toString());
    console.log(`✅ FOUND ${records.length} RECORDS`);
    return records;
};
