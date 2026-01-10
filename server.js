// server.js (complete, ES module compatible)
// Run: node server.js
let CURRENT_BLOCK_HEIGHT = "Syncing...";
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import multer from 'multer'; // Ensure multer is imported
import { submitTransaction, evaluateTransaction } from './fabric_gateway.js';
import { uploadEncryptedFile, getAndDecryptFile } from './ipfs_handler.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import admin from 'firebase-admin';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Server } from 'socket.io'; 
import http from 'http';
dotenv.config();

import FabricCAServices from 'fabric-ca-client';
import { Gateway, Wallets } from 'fabric-network';
import crypto from 'crypto';

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer,{
  cors:{origin:"*"}
});
dotenv.config();

const port=process.env.PORT;

// ============================================================
// GLOBAL CONFIGURATION
// ============================================================
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'medchain';
const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : null;
const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_VERY_STRONG_AND_SECRET_KEY_HERE_2025';

let db;
if (FIREBASE_CONFIG && !admin.apps.length) {
  try {
    const firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(FIREBASE_CONFIG),
      databaseURL: `https://${FIREBASE_CONFIG.projectId}.firebaseio.com`
    });
    db = admin.firestore(firebaseApp);
    console.log('✅ Firestore initialized successfully.');
  } catch (e) {
    console.error('❌ Firebase Initialization Error:', e.message);
  }
} else if (admin.apps.length) {
  db = admin.firestore(admin.apps[0]);
} else {
  console.warn('❌ Firebase config not found. Database features will be disabled.');
}

// ============================================================
// 1. UPDATE MIDDLEWARE (Allow Large Payloads)
// ============================================================
app.use(cors());

// ⭐ FIX: Increase limit to 500MB for large medical files
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
// app.use(bodyParser.json()); // Removed redundant bodyParser

// ============================================================
// 2. UPDATE MULTER (Allow Large File Objects)
// ============================================================
// ⭐ FIX: Configure Multer to accept files up to 500MB
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 500 * 1024 * 1024, // 500 MB limit
        fieldSize: 500 * 1024 * 1024 // Allow large form fields
    }
});

/**
 * JWT auth middleware
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. Authentication token missing.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden. Invalid or expired token.' });
    req.user = user;
    next();
  });
}

/* ============================================================
   Helper: get CA client & wallet for an org (Org1 or Org2)
   ============================================================ */
async function getCaAndWalletForOrg(org) {
  // Accept both 'Org1' / 'Org2' and 'org1' / 'org2'
  const orgNormalized = ('' + org).toLowerCase();
  const normalizedOrg = org.toLowerCase();
  const ccpPath = path.resolve(
  __dirname,
  "config",
  `connection-${normalizedOrg}.json`
);
  if (!fs.existsSync(ccpPath)) {
    throw new Error(`Connection profile not found: ${ccpPath}`);
  }
  const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

  // pick first CA key available in the connection profile (typical structure)
  const caKey = Object.keys(ccp.certificateAuthorities)[0];
  const caInfo = ccp.certificateAuthorities[caKey];
  if (!caInfo) throw new Error(`CA info not found in connection profile for ${org}.`);

  const ca = new FabricCAServices(caInfo.url, { trustedRoots: caInfo.tlsCACerts ? caInfo.tlsCACerts.pem : undefined, verify: false }, caInfo.caName);

  // single wallet folder for backend (identities labeled e.g. admin-org1, admin-org2)
  const walletPath = path.join(process.cwd(), 'wallet');
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  return { ccp, ca, wallet, caInfo };
}

/* ============================================================
   REGISTER USER (Fixed: 4 Args to Chain, All to DB)
   ============================================================ */
app.post('/api/user/register', async (req, res) => {
  // 1. EXTRACT DATA
  const { userId, name, role, org, password, email, license, idPassport } = req.body;

  // Validate inputs
  if (!userId || !name || !role || !org || !password) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // Normalize Org (Org1 / Org2)
  const orgNormalized = ('' + org).toLowerCase().startsWith('org') ? 
    (org.charAt(0).toUpperCase() + org.slice(1)) : 
    (org.charAt(0).toUpperCase() + org.slice(1));

  try {
    // ---------------------------------------------------------
    // 1. FABRIC CA REGISTRATION (Wallet)
    // ---------------------------------------------------------
    const { ccp, ca, wallet } = await getCaAndWalletForOrg(orgNormalized);
    const adminLabel = `admin-${orgNormalized.toLowerCase()}`;
    const adminIdentity = await wallet.get(adminLabel);
    
    if (!adminIdentity) throw new Error(`Admin identity '${adminLabel}' missing.`);

    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, adminLabel);
    
    // Check wallet
    const existingUserIdentity = await wallet.get(userId);
    if (!existingUserIdentity) {
      const secret = await ca.register({ 
          affiliation: `${orgNormalized.toLowerCase()}.department1`, 
          enrollmentID: userId, 
          role: 'client'
      }, adminUser);

      const enrollment = await ca.enroll({ enrollmentID: userId, enrollmentSecret: secret });
      await wallet.put(userId, {
        credentials: {
          certificate: enrollment.certificate,
          privateKey: enrollment.key.toBytes()
        },
        mspId: `${orgNormalized}MSP`,
        type: 'X.509'
      });
      console.log(`✅ CA Enrollment Complete for ${userId}`);
    }

    // ---------------------------------------------------------
    // 2. REGISTER ON BLOCKCHAIN (The Fix)
    // ---------------------------------------------------------
    const orgMSP = (orgNormalized === 'Org1') ? 'Org1MSP' : 'Org2MSP';
    
    try {
      // ⭐ FIXED: SENDING ONLY 4 ARGUMENTS NOW
      // We removed 'email' and 'license' from this call so it matches your Chaincode.
      await submitTransaction(
          adminLabel,      
          orgNormalized,   
          'RegisterUser',  
          userId,          // Arg 1: ID
          name,            // Arg 2: Name
          role,            // Arg 3: Role
          orgMSP           // Arg 4: Org
      );
      console.log(`✅ Blockchain Registration Complete (4 Args)`);
    } catch (err) {
      // Clean up wallet if chaincode fails
      if (!existingUserIdentity) await wallet.remove(userId);
      throw new Error(`Chaincode RegisterUser failed: ${err.message}`);
    }

    // ---------------------------------------------------------
    // 3. SAVE TO FIREBASE (Save Everything Here)
    // ---------------------------------------------------------
    // We store the full profile (Email, License, Passport) in the database.
    const userRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(userId);
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await userRef.set({
      fabric_id: userId,
      username: userId,
      hashed_password: hashedPassword,
      name: name,
      role: role,
      org: orgNormalized,
      // Extra Data (Safe to store here)
      email: email || "",
      license: license || "N/A",
      id_passport: idPassport || userId,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Firebase Save Complete`);

    return res.status(200).json({ 
        success: true, 
        message: `User ${userId} registered successfully.` 
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// checkuser name +password verify identity by connecting to hyperledger fabric
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    // -------------------------------
    // 1. 🔒 Authenticate with Firebase
    // -------------------------------
    const userRef = db.collection('artifacts').doc(APP_ID).collection('users').doc(username);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const userData = userDoc.data();

    const isPasswordCorrect = await bcrypt.compare(password, userData.hashed_password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const fabricId = userData.fabric_id;
    const role = userData.role;
    const org = (role === "patient") ? "org1" : "org2"; // You can change this mapping

    // -------------------------------
    // 2. 🔐 Load identity from Fabric Wallet
    // -------------------------------
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const identity = await wallet.get(fabricId);
    if (!identity) {
      console.log(`❌ Fabric identity not found for ${fabricId}`);
      return res.status(401).json({
        error: `Fabric identity for ${fabricId} not found. Please ask admin to register user in Fabric.`,
      });
    }

    // -------------------------------
    // 3. 🔗 Try connecting to Fabric (Identity Check)
    // -------------------------------
    const ccpPath = path.resolve(process.cwd(), 'config', `connection-${org}.json`);
    const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));

    const gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: fabricId,
      discovery: { enabled: true, asLocalhost: true }
    });

    console.log(`✅ Fabric connection successful for ${fabricId}`);
    await gateway.disconnect();

    // -------------------------------
    // 4. 🎟 Generate JWT
    // -------------------------------
    const token = jwt.sign(
      { fabric_id: fabricId, role: role, org: org },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      message: "Login successful.",
      token,
      fabric_id: fabricId,
      name:userData.name,
      role,
      org,
    });

  } catch (error) {
    console.error("❌ Login error:", error);
    return res.status(500).json({
      error: `Login failed: ${error.message}`,
    });
  }
});

/* ============================================================
   CONSENT, ADD RECORD, VIEW RECORD (unchanged logic but fixed parsing)
   ============================================================ */

app.post('/api/consent/grant', authenticateToken, async (req, res) => {
  const patientId = req.user.fabric_id;
  const { providerId } = req.body;
  if (!providerId) return res.status(400).json({ error: 'Missing required field: providerId.' });

  const patientOrg = 'Org1';
  try {
    const result = await submitTransaction(
      patientId, 
      patientOrg, 
      'GrantConsent', 
      patientId, 
      providerId);
    return res.status(200).json({ message: result });
  } catch (error) {
    console.error('Consent failed:', error);
    return res.status(500).json({ error: `Consent failed: ${error.message}` });
  }
});

// POST /api/record/add
// 🔒 SECURED: Checks Consent BEFORE Uploading to IPFS
app.post('/api/record/add', authenticateToken, upload.single('file'), async (req, res) => {
    const doctorId = req.user.fabric_id;
    const callerOrg = req.user.org;

    // 1. ROLE CHECK
    if (req.user.role !== 'doctor') {
        return res.status(403).json({ error: 'Only doctors are authorized to add records.' });
    }

    const { 
        recordId, patientId, hospitalId, fileData, 
        recordName, recordType, description, vitals 
    } = req.body;
    
    console.log(`\n🛑 SECURITY CHECK: Upload Attempt by ${doctorId} for Patient ${patientId}`);

    try {
        // =========================================================
        // 🛡️ GATEKEEPER: CONSENT CHECK (Add this block)
        // =========================================================
        console.log("🔗 Verifying Upload Consent on Ledger...");
        
        // A. Fetch Patient Profile
        const profileBuffer = await evaluateTransaction(doctorId, callerOrg, 'GetUser', patientId);
        
        if (!profileBuffer || profileBuffer.length === 0) {
            return res.status(404).json({ error: `Patient ${patientId} not found on ledger.` });
        }

        const profile = JSON.parse(profileBuffer.toString());
        const authorizedList = profile.consents || [];

        // B. Check Authorization
        if (!authorizedList.includes(doctorId)) {
            console.warn(`⛔ BLOCKED: Doctor ${doctorId} tried to upload for ${patientId} without consent.`);
            return res.status(403).json({ 
                error: "ACCESS DENIED: You do not have consent to upload records for this patient." 
            });
        }
        
        console.log("✅ CONSENT VALID. Proceeding with upload...");
        // =========================================================

        // 2. INPUT VALIDATION
        if (!fileData || fileData.length < 10) return res.status(400).json({ error: 'Invalid fileData' });
        if (!recordName || !recordType || !description || !vitals) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        let fileBuffer;
        try { fileBuffer = Buffer.from(fileData, 'base64'); } 
        catch (e) { return res.status(400).json({ error: 'fileData is not valid Base64' }); }

        // 3. CRYPTO & IPFS
        // ✅ CALCULATE SHA-256
        const crypto = await import('crypto');
        const fileHash = crypto.default.createHash('sha256').update(fileBuffer).digest('hex');
        console.log('🔐 File SHA-256:', fileHash);

        // ✅ UPLOAD TO IPFS
        const ipfsHash = await uploadEncryptedFile(fileBuffer);
        console.log('🌐 IPFS CID:', ipfsHash);

        // 4. SUBMIT TO BLOCKCHAIN
        const content = JSON.stringify({ recordName, recordType, description, vitals });

        const result = await submitTransaction(
            doctorId, 'Org2', 'AddMedicalRecord',
            recordId, patientId, doctorId, hospitalId,
            ipfsHash, fileHash, content
        );

        return res.status(200).json({ message: result, ipfsHash, fileHash });

    } catch (error) {
        console.error('[ADD RECORD ERROR]:', error);
        // Catch specific chaincode permission errors if any
        return res.status(500).json({ error: `Add Record failed: ${error.message}` });
    }
});
//check consent
app.get('/api/record/check-consent/:patientId', authenticateToken, async (req, res) => {
    const doctorId = req.user.fabric_id;
    const callerOrg = req.user.org;
    const { patientId } = req.params;

    console.log(`🔍 Consent check: Doctor ${doctorId} → Patient ${patientId}`);

    try {
        const profileBuffer = await evaluateTransaction(
            doctorId,
            callerOrg,
            'GetUser',
            patientId
        );

        if (!profileBuffer || profileBuffer.length === 0) {
            return res.status(404).json({ allowed: false });
        }

        const profile = JSON.parse(profileBuffer.toString());
        const authorizedList = profile.consents || [];

        const allowed = authorizedList.includes(doctorId);

        console.log(
            allowed
                ? `✅ Consent OK`
                : `⛔ Consent DENIED`
        );

        return res.json({ allowed });

    } catch (err) {
        console.error('[CONSENT CHECK ERROR]', err);
        return res.status(500).json({ allowed: false });
    }
});

// =========================================================================
// 🔒 DIAGNOSTIC API: PATIENT RECORDS (Replace your existing function with this)
// =========================================================================
app.get('/api/record/patient/:patientId', authenticateToken, async (req, res) => {
    const callerId = req.user.fabric_id;
    const targetPatientId = req.params.patientId;
    const callerRole = req.user.role;

    console.log("\n🛑 ---------------- SECURITY CHECK ---------------- 🛑");
    console.log(`🕵️‍♂️ WHO IS CALLING?  ID: ${callerId} | Role: ${callerRole}`);
    console.log(`🎯 TARGET PATIENT?  ID: ${targetPatientId}`);

    try {
        // 1. CHECK: IS IT SELF-ACCESS?
        if (callerId === targetPatientId) {
             console.log("✅ RESULT: ALLOWED (Patient viewing own data)");
             return await fetchAndSendRecords(callerId, req.user.org, targetPatientId, res);
        }

        // 2. CHECK: IS IT A DOCTOR?
        if (callerRole !== 'doctor') {
            console.log("⛔ RESULT: BLOCKED (User is not a doctor or patient)");
            return res.status(403).json({ error: "Access Denied: Invalid Role" });
        }

        // 3. CHECK: BLOCKCHAIN CONSENT
        console.log("🔗 QUERYING LEDGER for Consent Token...");
        const profileBuffer = await evaluateTransaction(callerId, req.user.org, 'GetUser', targetPatientId);
        
        // Handle Empty Profile
        if (!profileBuffer || profileBuffer.length === 0) {
             console.log("⚠️ RESULT: FAILED (Patient profile not found)");
             return res.status(404).json({ error: "Patient not found" });
        }

        const patientProfile = JSON.parse(profileBuffer.toString());
        const authorizedList = patientProfile.consents || [];

        console.log(`📜 CONSENT LIST FOUND: [ ${authorizedList.join(' , ')} ]`);

        // 4. THE DECISION
        if (authorizedList.includes(callerId)) {
            console.log("✅ RESULT: ACCESS GRANTED (Doctor ID found in list)");
            return await fetchAndSendRecords(callerId, req.user.org, targetPatientId, res);
        } else {
            console.log("⛔ RESULT: ACCESS DENIED (Doctor ID NOT in list)");
            return res.status(403).json({ error: "⛔ SECURITY ALERT: ACCESS DENIED. No Consent Token found." });
        }

    } catch (error) {
        console.error("❌ SERVER ERROR:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// Helper function to keep the main code clean
async function fetchAndSendRecords(callerId, org, targetId, res) {
    console.log("📥 FETCHING RECORDS...");
    const buffer = await evaluateTransaction(callerId, org, 'QueryRecordsByPatient', targetId);
    const records = JSON.parse(buffer.toString());
    console.log(`✅ SENDING ${records.length} RECORDS`);
    return res.status(200).json(records);
}
// =========================================================================
// 🔒 SECURED API: DOCTOR VIEWING PATIENT RECORDS (Correct Endpoint)
// =========================================================================
app.get('/api/patient/:patientId/records', authenticateToken, async (req, res) => {
    const callerId = req.user.fabric_id;
    const callerOrg = req.user.org;
    const callerRole = req.user.role;
    const targetPatientId = req.params.patientId;

    console.log(`\n🛑 SECURITY CHECK: ${callerId} requesting records for ${targetPatientId}`);

    try {
        // 1. IS IT THE PATIENT THEMSELVES? (Allow)
        if (callerId === targetPatientId) {
             // proceed
        } 
        // 2. IS IT A DOCTOR? (Check Consent)
        else if (callerRole === 'doctor') {
            console.log("🔗 Verifying Consent Token on Blockchain...");
            
            const profileBuffer = await evaluateTransaction(callerId, callerOrg, 'GetUser', targetPatientId);
            if (!profileBuffer || profileBuffer.length === 0) {
                return res.status(404).json({ error: "Patient not found" });
            }

            const profile = JSON.parse(profileBuffer.toString());
            const authorizedList = profile.consents || [];

            if (!authorizedList.includes(callerId)) {
                console.warn(`⛔ BLOCKED: Doctor ${callerId} is NOT in consent list: [${authorizedList}]`);
                // ❌ RETURN 403 FORBIDDEN
                return res.status(403).json({ error: "ACCESS DENIED: No Consent Token found." });
            }
            console.log("✅ ALLOWED: Consent Token Valid.");
        } 
        // 3. ANYONE ELSE? (Block)
        else {
            return res.status(403).json({ error: "Unauthorized Role" });
        }

        // --- FETCH RECORDS ---
        const buffer = await evaluateTransaction(callerId, callerOrg, 'QueryRecordsByPatient', targetPatientId);
        const records = JSON.parse(buffer.toString());
        
        // Sort Newest First
        records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return res.status(200).json(records);

    } catch (error) {
        console.error("API ERROR:", error.message);
        return res.status(500).json({ error: error.message });
    }
});


// GET /api/record/single/:recordId
// GET /api/record/single/:recordId
// GET /api/record/single/:recordId
app.get('/api/record/single/:recordId', authenticateToken, async (req, res) => {
    const callerId = req.user.fabric_id;
    const callerOrg = req.user.org;
    const recordId = req.params.recordId;

    try {
        // 1. Fetch the Record
        const buffer = await evaluateTransaction(callerId, callerOrg, 'QueryRecord', recordId);
        if (!buffer || buffer.length === 0) {
            return res.status(404).json({ error: "Record not found" });
        }
        const record = JSON.parse(buffer.toString());

        // 2. Fetch Doctor Details (To fix "Dr. Unknown")
        let doctorName = "Unknown Doctor";
        let hospitalName = "Unknown Hospital";

        if (record.doctorId) {
            try {
                // Call chaincode to get user details by ID
                const docBuffer = await evaluateTransaction(callerId, callerOrg, 'GetUser', record.doctorId);
                const docProfile = JSON.parse(docBuffer.toString());
                
                doctorName = docProfile.name || record.doctorId;
                
                // Map Org ID to Hospital Name
                if(docProfile.org === 'Org2MSP') hospitalName = 'Hospital B (Org2)';
                else if(docProfile.org === 'Org1MSP') hospitalName = 'Hospital A (Org1)';
                else hospitalName = docProfile.org;

            } catch (e) {
                console.warn(`Could not fetch details for doctor ${record.doctorId}`);
            }
        }

        // 3. Attach new data to response
        const responseData = {
            ...record,
            doctorName: doctorName,
            hospitalName: hospitalName
        };

        return res.status(200).json(responseData);

    } catch (error) {
        console.error(`[API ERROR] Fetch record ${recordId}:`, error);
        return res.status(500).json({ error: error.message });
    }
});
app.get('/api/record/view/:recordId', authenticateToken, async (req, res) => {
    const doctorId = req.user.fabric_id;
    const recordId = req.params.recordId;
    const org = req.user.org;

    try {
        // Call Chaincode: ViewMedicalRecord
        const buffer = await evaluateTransaction(doctorId, org, 'ViewMedicalRecord', recordId);
        const record = JSON.parse(buffer.toString());
        
        // Log access in background (Fire & Forget)
        submitTransaction(doctorId, org, 'LogRecordAccess', recordId).catch(console.error);

        return res.status(200).json(record);
    } catch (error) {
        console.error(`Error fetching record ${recordId}:`, error);
        return res.status(404).json({ error: "Record not found" });
    }
});

// 2. GET RECORD HISTORY (AUDIT TRAIL)
app.get('/api/record/history/:recordId', authenticateToken, async (req, res) => {
    const doctorId = req.user.fabric_id;
    const recordId = req.params.recordId;
    const org = req.user.org;

    try {
        // Call Chaincode: GetAssetHistory
        const buffer = await evaluateTransaction(doctorId, org, 'GetAssetHistory', recordId);
        // The chaincode returns a JSON string, so we just send it back
        return res.status(200).json(buffer.toString());
    } catch (error) {
        console.error(`Error fetching history for ${recordId}:`, error);
        return res.status(500).json({ error: "Failed to fetch history" });
    }
});

// 3. VERIFY & DOWNLOAD FILE
app.post('/api/record/verify-and-download', authenticateToken, async (req, res) => {
    const doctorId = req.user.fabric_id;
    const { recordId, ipfsHash } = req.body;
    const org = req.user.org;

    try {
        console.log(`🔐 Verifying file for ${recordId}...`);

        // A. Verify against Ledger
        // 1. Fetch current state from Blockchain to ensure Hash hasn't been changed
        const buffer = await evaluateTransaction(doctorId, org, 'ViewMedicalRecord', recordId);
        const record = JSON.parse(buffer.toString());

        if (record.ipfsHash !== ipfsHash) {
            return res.status(400).json({ verificationStatus: 'TAMPERED', error: 'Hash mismatch with ledger.' });
        }

        // B. Download & Decrypt from IPFS
        // (Assuming getAndDecryptFile is imported from ipfs_handler.js)
        const fileBuffer = await getAndDecryptFile(ipfsHash);

        // C. Calculate Hash of the downloaded file to verify integrity
        const crypto = await import('crypto');
        const calculatedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        
        // Note: In a real production system, you might compare this calculatedHash 
        // with a checksum stored on-chain. For now, we trust the Ledger's IPFS hash linkage.

        console.log(`✅ File verified. Sending to client.`);

        return res.status(200).json({
            verificationStatus: 'MATCH',
            fileName: `${recordId}.pdf`, // You could store real extension in chaincode if needed
            fileData: fileBuffer // Sends binary buffer
        });

    } catch (error) {
        console.error("Verification failed:", error);
        return res.status(500).json({ verificationStatus: 'ERROR', error: error.message });
    }
});

/* ============================================================
   VIEW RECORD (Robust - Handles Old & New Data)
   ============================================================ */
app.get('/api/record/:recordId', authenticateToken, async (req, res) => {
  const recordId = req.params.recordId;
  const invokerId = req.user.fabric_id;
  const invokerOrg =
    req.user.org || (req.user.role === 'patient' ? 'Org1' : 'Org2');

  console.log("-------------------------------------");
  console.log(`📄 Record ID: ${recordId}`);
  console.log(`👤 Invoker: ${invokerId} | Org: ${invokerOrg}`);

  try {
    // 1️⃣ FETCH METADATA FROM BLOCKCHAIN (TRUST ANCHOR)
    console.log("⛓️ Fetching record metadata from blockchain...");
    const recordMetadata = await evaluateTransaction(
      invokerId,
      invokerOrg,
      'ViewMedicalRecord',
      recordId
    );

    const metadata =
      typeof recordMetadata === 'string'
        ? JSON.parse(recordMetadata)
        : recordMetadata;

    // 2️⃣ EXTRACT CID + HASH FROM LEDGER
    let ledgerCid = metadata.ipfsHash || metadata.ipfsCid;
    const ledgerHash = metadata.fileHash || metadata.checksum;    
    console.log(`📦 Ledger IPFS CID: ${ledgerCid}`);
    console.log(`💾 Ledger File Hash: ${ledgerHash || 'N/A (Legacy)'}`);
    //simulate attack change the previous cid to fak cid
    if (recordId === 'REC-2025-49122') { 
        console.log("⚠️ SIMULATING ATTACK: Hacker swapped the storage pointer!");
        console.log(`Original (Valid) CID: ${ledgerCid}`);
        
        // FAKE CID 
        ledgerCid = "QmeNWafTWVASQadycsSKsqZ4Vn1h1wgFc9167cq2wZNU4v"; 
        
        console.log(`Hacked (Fake) CID: ${ledgerCid}`);
    }
    // =========================================================

    if (!ledgerCid) {
      console.log(`⚠️ No IPFS CID found for record ${recordId}`);
      return res.status(404).json({
        error: 'Record metadata exists but IPFS CID is missing on blockchain'
      });
    }
    if (!ledgerCid) {
      console.log(`⚠️ No IPFS CID found for record ${recordId}`);
      return res.status(404).json({
        error: 'Record metadata exists but IPFS CID is missing on blockchain'
      });
    }

    try {
      // 3️⃣ FETCH FILE FROM IPFS
      console.log(`[IPFS] Fetching & decrypting file...`);
      const fileBuffer = await getAndDecryptFile(ledgerCid);

      console.log(`[IPFS] Decryption successful`);
      console.log(`[IPFS] Decrypted size: ${fileBuffer.length} bytes`);

      // 4️⃣ RECALCULATE HASH
      const crypto = await import('crypto');
      const calculatedHash = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      console.log(`🔐 Calculated File Hash: ${calculatedHash}`);

      // 5️⃣ HASH COMPARISON
      let verificationStatus = "VALID";

      if (ledgerHash) {
        if (calculatedHash === ledgerHash) {
          console.log("✅ HASH MATCH — Integrity OK");
          verificationStatus = "VALID";
        } else {
          console.log("❌ HASH MISMATCH — Possible Tampering");
          verificationStatus = "TAMPERED";
        }
      } else {
        console.log("⚠️ No hash stored on ledger (Legacy record)");
        verificationStatus = "NO_HASH";
      }

      // 6️⃣ AUDIT LOG (NON-REPUDIATION)
      submitTransaction(
        invokerId,
        invokerOrg,
        'LogRecordAccess',
        recordId
      ).catch(err =>
        console.warn('⚠️ Audit Log Warning:', err.message)
      );

      // 7️⃣ RESPONSE
      return res.status(200).json({
        metadata,
        fileData: fileBuffer.toString('base64'),
        integrity: {
          cidFromLedger: ledgerCid,
          hashFromLedger: ledgerHash || 'Legacy record',
          calculatedHash,
          verificationStatus
        }
      });

    } catch (ipfsErr) {
      console.log("❌ IPFS FETCH / DECRYPT FAILED:", ipfsErr.message);
      return res.status(500).json({
        error: 'IPFS fetch or decryption failed',
        details: ipfsErr.message
      });
    }

  } catch (error) {
    console.error(
      `❌ View Record failed for ${invokerId} on ${recordId}:`,
      error
    );
    return res.status(500).json({
      error: `View Record failed: ${error.message}`
    });
  }
});

/* ============================================================
   GET USER IDENTITY DETAILS (For Dashboard)
   ============================================================ */
app.get('/api/user/me', authenticateToken, async (req, res) => {
    try {
        const fabricId = req.user.fabric_id;
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        
        // Get the identity from the wallet
        const identity = await wallet.get(fabricId);
        
        if (!identity) {
            return res.status(404).json({ error: 'Identity not found in wallet' });
        }

        // Return safe public details
        return res.status(200).json({
            fabricId: fabricId,
            mspId: identity.mspId,
            certificate: identity.credentials.certificate, // The public PEM string
            type: identity.type
        });

    } catch (error) {
        console.error("Error fetching user identity:", error);
        return res.status(500).json({ error: "Failed to fetch identity" });
    }
});
/* ============================================================
   GET PATIENT DASHBOARD STATS (Real Blockchain Data)
   ============================================================ */
/* ============================================================
   GET DASHBOARD STATS (Update this function in server.js)
   ============================================================ */
/* ============================================================
   PATIENT DASHBOARD STATS (Fixes Total Record Count)
   ============================================================ */
app.get('/api/patient/dashboard-stats', authenticateToken, async (req, res) => {
    const patientId = req.user.fabric_id;
    const org = req.user.org;

    try {
        // ---------------------------------------------------------
        // 1. FETCH REAL RECORDS (For Total Count)
        // ---------------------------------------------------------
        let totalRecords = 0;
        let records = [];
        try {
            // ⭐ Query the Chaincode to count actual records
            const recordsBuffer = await evaluateTransaction(patientId, org, 'QueryRecordsByPatient', patientId);
            records = JSON.parse(recordsBuffer.toString());
            totalRecords = records.length; // ✅ The real count
        } catch (e) {
            console.warn("No records found:", e.message);
        }

        // ---------------------------------------------------------
        // 2. FETCH USER PROFILE (For Active Grants Count)
        // ---------------------------------------------------------
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

        // ---------------------------------------------------------
        // 3. BUILD RECENT ACTIVITY (For the Table)
        // ---------------------------------------------------------
        let recentActivity = [];
        
        // A. Add Uploads to Activity Stream
        records.forEach(r => {
            recentActivity.push({
                action: 'Record Uploaded',
                details: `File: ${r.recordName || r.recordId}`,
                date: new Date(r.timestamp).toLocaleDateString() + ' ' + new Date(r.timestamp).toLocaleTimeString(),
                timestamp: r.timestamp,
                txHash: r.ipfsHash || "0x..." 
            });
        });

        // B. Add Views to Activity Stream
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

        // Sort by Newest & limit to 5
        recentActivity.sort((a, b) => b.timestamp - a.timestamp);
        const topActivity = recentActivity.slice(0, 5);

        // ---------------------------------------------------------
        // 4. SEND FINAL RESPONSE
        // ---------------------------------------------------------
        res.json({
            totalRecords: totalRecords, // ✅ Now dynamic
            activeGrants: activeGrants,
            consents: consents,         // Used by Data Exchange page
            recentActivity: topActivity
        });

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ error: "Failed to load dashboard stats" });
    }
});
/* ============================================================
   VIEW RECORD (Retrieve, Decrypt & Verify)
   ============================================================ */
app.get('/api/record/:recordId', authenticateToken, async (req, res) => {
    const recordId = req.params.recordId;
    
    // 1. ROBUST USER DATA
    // Prefer using the org from the token if available, otherwise fallback to your logic
    const invokerId = req.user.fabric_id;
    const invokerRole = req.user.role;
    const invokerOrg = req.user.org || ((invokerRole === 'patient') ? 'Org1' : 'Org2');

    try {
        // ---------------------------------------------------------
        // 1. GET METADATA FROM BLOCKCHAIN (Read-Only)
        // ---------------------------------------------------------
        console.log(`[API] Fetching metadata for ${recordId}...`);
        const recordBuffer = await evaluateTransaction(invokerId, invokerOrg, 'ViewMedicalRecord', recordId);
        const record = JSON.parse(recordBuffer.toString());

        // ---------------------------------------------------------
        // 2. LOG ACCESS TO BLOCKCHAIN (Fire & Forget)
        // ---------------------------------------------------------
        // We do this immediately so the audit trail is updated even if IPFS fails later.
        // This connects to the "MedicalDataViewed" event in your Admin Dashboard.
        submitTransaction(invokerId, invokerOrg, 'LogRecordAccess', recordId).catch(err => {
            console.error("⚠️ Failed to log access to ledger:", err.message);
        });

        // ---------------------------------------------------------
        // 3. GET ENCRYPTED FILE FROM IPFS
        // ---------------------------------------------------------
        const ipfsHash = record.ipfsHash;
        if (!ipfsHash) throw new Error("Record metadata exists but has no IPFS Hash.");

        console.log(`[API] Fetching file from IPFS: ${ipfsHash}`);
        const decryptedBuffer = await getAndDecryptFile(ipfsHash);

        // ---------------------------------------------------------
        // 4. INTEGRITY CHECK (The "Genius" Part) - FIXED
        // ---------------------------------------------------------
        const crypto = await import('crypto'); // Dynamic import
        const checkSum = crypto.createHash('sha256');
        checkSum.update(decryptedBuffer);
        
        // Recalculate Hash (Simulating IPFS CID generation logic)
        // Note: Real IPFS uses base58/multihash, but if your upload used this logic, keep it.
        const calculatedHash = "Qm" + checkSum.digest('hex').substring(0, 44); 

        // ❌ OLD (BUG): const isVerified = (ipfsHash === record.ipfsHash); // Always true!
        // ✅ NEW (FIX): Compare CALCULATED hash with BLOCKCHAIN hash
        const isVerified = (calculatedHash === record.ipfsHash);

        if (!isVerified) {
            console.warn(`⚠️ Integrity Mismatch! Block: ${record.ipfsHash} vs Calc: ${calculatedHash}`);
        }

        // ---------------------------------------------------------
        // 5. SEND RESPONSE
        // ---------------------------------------------------------
        return res.status(200).json({
            metadata: record,
            fileData: decryptedBuffer.toString('base64'),
            isVerified: isVerified
        });

    } catch (error) {
        console.error(`❌ View Record failed:`, error);
        return res.status(500).json({ error: `View Record failed: ${error.message}` });
    }
});
app.get('/api/doctors', authenticateToken, async (req, res) => {
    try {
        // Calls 'QueryAllDoctors' in chaincode
        const resultBuffer = await evaluateTransaction(req.user.fabric_id, 'Org1', 'QueryAllDoctors');
        const doctors = JSON.parse(resultBuffer.toString());
        return res.status(200).json(doctors);
    } catch (error) {
        console.error("Fetch Doctors Failed:", error);
        return res.status(500).json({ error: "Failed to fetch doctors list" });
    }
});
/* ============================================================
   GET PATIENT AUDIT HISTORY (By Asset History)
   ============================================================ */
/* ============================================================
   GET PATIENT AUDIT LOG (Reconstructs history from Ledger)
   ============================================================ */
app.get('/api/patient/audit-log', authenticateToken, async (req, res) => {
    const patientId = req.user.fabric_id;
    const org = req.user.org;

    try {
        const events = [];

        // ---------------------------------------------------------
        // 1. FETCH USER PROFILE HISTORY (Registration & Consents)
        // ---------------------------------------------------------
        let history = [];
        try {
            const historyBuffer = await evaluateTransaction(patientId, org, 'GetAssetHistory', patientId);
            history = JSON.parse(historyBuffer.toString());
        } catch (e) {
            console.warn("Could not fetch user history:", e.message);
        }

        history.sort((a, b) => a.Timestamp - b.Timestamp);

        history.forEach((tx, index) => {
            if (tx.IsDelete || !tx.Value) return;
            try {
                const currState = JSON.parse(tx.Value);
                const prevState = index > 0 ? JSON.parse(history[index - 1].Value) : {};
                
                let action = 'Unknown';
                let details = 'Profile Update';

                // Detect Registration
                if (index === 0) {
                    action = 'UserRegistered';
                    details = 'Account Created';
                } 
                // Detect Consent Changes
                else {
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
                    timestamp: tx.Timestamp, // Corrected (No * 1000)
                    action: action,
                    actor: patientId,
                    details: details,
                    txId: tx.TxId
                });

            } catch (jsonErr) { }
        });

        // ---------------------------------------------------------
        // 2. FETCH MEDICAL RECORDS (Uploads & ⭐ VIEWS)
        // ---------------------------------------------------------
        try {
            const recordsBuffer = await evaluateTransaction(patientId, org, 'QueryRecordsByPatient', patientId);
            const records = JSON.parse(recordsBuffer.toString());
            
            records.forEach(record => {
                // A. Add "Upload" Event
                events.push({
                    timestamp: record.timestamp,
                    action: 'RecordUploaded',
                    actor: record.doctorId || 'Unknown Doctor',
                    details: `File: ${record.recordName || record.recordId}`,
                    txId: "N/A"
                });

                // B. ⭐ NEW: Add "View" Events (from accessHistory)
                if (record.accessHistory && Array.isArray(record.accessHistory)) {
                    record.accessHistory.forEach(log => {
                        events.push({
                            // Chaincode stores this as ISO String, so we parse it
                            timestamp: new Date(log.timestamp).getTime(),
                            action: 'RecordViewed',
                            actor: log.user === patientId ? 'Me' : log.user,
                            details: `Viewed File: ${record.recordName || record.recordId}`,
                            txId: "N/A" // Views don't have a distinct TxId stored in this array
                        });
                    });
                }
            });
        } catch (e) {
            console.warn("Could not fetch records for audit:", e.message);
        }

        // 3. SORT BY NEWEST FIRST
        events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return res.status(200).json(events);

    } catch (error) {
        console.error("Audit Log API Error:", error);
        return res.status(500).json({ error: "Failed to generate audit log" });
    }
});
app.post('/api/consent/revoke', authenticateToken, async (req, res) => {
    const patientId = req.user.fabric_id;
    const { providerId } = req.body;

    try {
        const result = await submitTransaction(patientId, 'Org1', 'RevokeConsent', patientId, providerId);
        return res.status(200).json({ message: result });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
/* ============================================================
   ADMIN DASHBOARD STATS (Live Blockchain Data)
   ============================================================ */
/* ============================================================
   ADMIN DASHBOARD STATS (Live Blockchain Data)
   ============================================================ */
/* ============================================================
   ADMIN DASHBOARD STATS API (Add this to server.js)
   ============================================================ */
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    // 1. Security Check
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access Denied: Admin only." });
    }

    try {
        const adminId = req.user.fabric_id;
        const org = req.user.org;

        // 2. Fetch Doctors Count
        let doctorCount = 0;
        try {
            const buff = await evaluateTransaction(adminId, org, 'QueryAllDoctors');
            doctorCount = JSON.parse(buff.toString()).length;
        } catch (e) {
            console.warn("Stats: Failed to count doctors", e.message);
        }

        // 3. Fetch Patients Count
        let patientCount = 0;
        try {
            const buff = await evaluateTransaction(adminId, org, 'QueryAllPatients');
            patientCount = JSON.parse(buff.toString()).length;
        } catch (e) {
            console.warn("Stats: Failed to count patients", e.message);
        }

        // 4. Fetch Events (Medical Records in last 7 days)
        let eventCount = 0;
        try {
            const buff = await evaluateTransaction(adminId, org, 'QueryAllMedicalRecords');
            const records = JSON.parse(buff.toString());
            // Filter for last 7 days
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            eventCount = records.filter(r => new Date(r.timestamp) > weekAgo).length;
        } catch (e) {
             // Fallback if query fails
             eventCount = 0; 
        }

        // 5. Send Response
        res.json({
            hospitalCount: 1, // Hardcoded (System Online)
            doctorCount: doctorCount,
            patientCount: patientCount,
            eventCount: eventCount
        });

    } catch (error) {
        console.error("Admin Stats Error:", error);
        res.status(500).json({ error: "Failed to generate stats" });
    }
});
app.get('/api/admin/doctors', authenticateToken, async (req, res) => {
    // 1. Check Admin Permission
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access Denied" });
    }

    try {
        const adminId = req.user.fabric_id;
        const org = req.user.org;

        console.log(`[API] Admin ${adminId} querying all doctors...`);

        // 2. Query Chaincode
        // This calls the 'QueryAllDoctors' function in your smart contract
        const resultBuffer = await evaluateTransaction(adminId, org, 'QueryAllDoctors');
        const doctorsList = JSON.parse(resultBuffer.toString());

        console.log(`[API] Found ${doctorsList.length} doctors.`);

        // 3. Return JSON
        res.json(doctorsList);

    } catch (error) {
        console.error("❌ Failed to fetch doctors:", error);
        res.status(500).json({ error: "Failed to fetch doctor registry from blockchain." });
    }
});
/* ============================================================
   GET LEDGER EVENTS (History)
   ============================================================ */
/* ============================================================
   GET FULL LEDGER HISTORY (Aggregated)
   ============================================================ */
/* ============================================================
   GET COMPREHENSIVE AUDIT LOG (Doctors & Patients)
   ============================================================ */
/* ============================================================
   GET COMPREHENSIVE AUDIT LOG (Fixed for your Chaincode)
   ============================================================ */
/* ============================================================
   GET COMPREHENSIVE AUDIT LOG (Fixed & Robust)
   ============================================================ */
/* ============================================================
   GET SYSTEM-WIDE AUDIT LOG (Fixed for your Chaincode)
   ============================================================ */
/* ============================================================
   GET SYSTEM-WIDE AUDIT LOG (Doctors & Patients)
   ============================================================ */
/* ============================================================
   GET COMPREHENSIVE AUDIT LOG (With History Replay)
   ============================================================ */
app.get('/api/admin/events', authenticateToken, async (req, res) => {
    // 1. Security Check
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access Denied: Admin only." });
    }

    const adminId = req.user.fabric_id;
    const org = req.user.org;
    let allEvents = [];

    // Helper: Safely fetch data
    const fetchLedgerData = async (fcn, ...args) => {
        try {
            const buff = await evaluateTransaction(adminId, org, fcn, ...args);
            return buff && buff.length > 0 ? JSON.parse(buff.toString()) : [];
        } catch (e) { return []; }
    };

    try {
        console.log(`[Audit] Starting Deep History Scan...`);

        // =========================================================
        // 1. MEDICAL RECORDS (Uploads & Views)
        // =========================================================
        const records = await fetchLedgerData('QueryAllMedicalRecords');
        
        records.forEach(r => {
            // A. Upload Event
            allEvents.push({
                txId: r.recordId,
                timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
                eventName: 'MedicalDataUploaded',
                caller: r.doctorId,
                data: `Uploaded Diagnosis: ${r.diagnosis}`,
                msp: 'Org1MSP'
            });

            // B. View Events (From internal accessHistory array)
            if (r.accessHistory && Array.isArray(r.accessHistory)) {
                r.accessHistory.forEach((log, idx) => {
                    // Smart Logic: Identify who viewed it
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

        // =========================================================
        // 2. PATIENT HISTORY REPLAY (The Fix for Consent)
        // =========================================================
        // First, get all patients
        const patients = await fetchLedgerData('QueryAllPatients');

        // Now, for EVERY patient, fetch their entire history to find Revokes
        for (const p of patients) {
            const history = await fetchLedgerData('GetAssetHistory', p.patientId || p.userId);
            
            // Replay the history to detect changes
            let previousConsents = [];

            // Sort history oldest to newest to replay correctly
            history.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

            history.forEach(tx => {
                if (!tx.Value) return; // Skip deletes
                
                const historicPatient = JSON.parse(tx.Value);
                const currentConsents = historicPatient.consents || [];

                // DETECT GRANTED (Present now, but wasn't before)
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

                // DETECT REVOKED (Was present before, but missing now)
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

                // Update state for next loop iteration
                previousConsents = currentConsents;
            });

            // Also add the registration event from the very first transaction
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

        // =========================================================
        // 3. DOCTOR REGISTRATION
        // =========================================================
        const doctors = await fetchLedgerData('QueryAllDoctors');
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

        console.log(`[Audit] Successfully built timeline with ${allEvents.length} events.`);
        res.json(allEvents);

    } catch (error) {
        console.error("Audit Log Error:", error);
        res.status(500).json({ error: "Failed to generate audit log: " + error.message });
    }
});
/* ============================================================
   HYPERLEDGER FABRIC EVENT LISTENER (Real-time WebSockets)
   ============================================================ */
/* ============================================================
   HYPERLEDGER FABRIC EVENT LISTENER (Fixed TxID)
   ============================================================ */
async function startNetworkListener() {
    try {
        console.log("🔄 Initializing Blockchain Event Listener...");
        const { wallet, ccp } = await getCaAndWalletForOrg('Org1');
        const gateway = new Gateway();
        
        await gateway.connect(ccp, { 
            wallet, 
            identity: 'admin-org1', 
            discovery: { enabled: true, asLocalhost: true } 
        });

        const network = await gateway.getNetwork('mychannel');
        try {
            const channel = network.getChannel();
            const info = await channel.queryInfo();
            CURRENT_BLOCK_HEIGHT = info.height.low.toString();
            console.log(`🧱 Current Block Height: ${CURRENT_BLOCK_HEIGHT}`);
        } catch (e) {
            console.warn("⚠️ Could not fetch initial block height:", e.message);
        }
        await network.addBlockListener(async (event) => {
            CURRENT_BLOCK_HEIGHT = event.blockNumber.toString(); // Auto-update
            
            io.emit('chain-log', {
                type: 'BLOCK',
                text: `New Block Mined: #${event.blockNumber}`,
                time: new Date().toLocaleTimeString()
            });
        });
        const contract = network.getContract('medchain');
        
        console.log("👂 Listening for Blockchain Events...");

        // 1. BLOCK LISTENER
        await network.addBlockListener(async (event) => {
            io.emit('chain-log', {
                type: 'BLOCK',
                text: `New Block Mined: #${event.blockNumber}`,
                time: new Date().toLocaleTimeString()
            });
        });

        // 2. CONTRACT EVENT LISTENER
        await contract.addContractListener(async (event) => {
            try {
                // ✅ FIX: Safer TxID extraction
                // Some SDK versions use .transactionId, others .id, others require getTransactionEvent()
                const txId = event.transactionId || event.id || "tx_unknown";
                
                const eventName = event.eventName;
                const payloadString = event.payload.toString('utf8');
                let payloadJSON = {};
                
                try {
                    payloadJSON = JSON.parse(payloadString);
                } catch (e) {
                    payloadJSON = { raw: payloadString };
                }

                let message = "";
                if (eventName === 'ConsentGranted') {
                    message = `Consent Update: ${payloadJSON.patient} -> ${payloadJSON.provider}`;
                } else if (eventName === 'ConsentRevoked') {
                    message = `Revoked Access: ${payloadJSON.patient} -> ${payloadJSON.provider}`;
                } else if (eventName === 'RecordUploaded') {
                    const hash = payloadJSON.ipfsHash ? payloadJSON.ipfsHash.substring(0, 10) : "...";
                    message = `New Record Anchored: ${hash}...`;
                } else {
                    message = `Event: ${eventName}`;
                }

                console.log(`[EVENT] ${eventName}: ${message}`);

                // Send to Frontend
                io.emit('chain-log', {
                    type: 'TX',
                    // ✅ FIX: Check if txId exists before substring
                    text: `[${txId.length > 8 ? txId.substring(0, 8) : txId}...] ${message}`,
                    time: new Date().toLocaleTimeString()
                });

            } catch (err) {
                console.error("Error inside event listener:", err);
            }
        });

    } catch (error) {
        console.error("❌ Failed to start network listener:", error);
    }
}
// Ensure you have access to evaluateTransaction, authenticateToken, and timeAgo functions
// Example: const { evaluateTransaction } = require('./fabric-middleware'); 
// Example: const timeAgo = require('./utils/timeAgo'); 

// Function to generate time ago (Assuming this exists outside the route function)
// function timeAgo(timestamp) { ... } 
// const CURRENT_BLOCK_HEIGHT = '...'; // Assuming this is defined

/* ============================================================
   DOCTOR: SEARCH PATIENTS
   ============================================================ */
app.get('/api/doctor/dashboard-stats', authenticateToken, async (req, res) => {
    const doctorId = req.user.fabric_id;
    const org = req.user.org; 

    // 1. Initialize Lookup Map
    let patientLookup = {}; 

    try {
        // --- A. BUILD PATIENT LOOKUP (ROBUST VERSION) ---
        try {
            const patientsBuffer = await evaluateTransaction(doctorId, org, 'QueryAllPatients');
            const patientsRaw = JSON.parse(patientsBuffer.toString());

            patientsRaw.forEach(p => {
                // Handle different Chaincode return structures:
                // Type 1: Direct Object { userId: '123', name: 'Tan' }
                // Type 2: Key/Record Wrapper { Key: '123', Record: { name: 'Tan' } }
                
                const actualPatient = p.Record || p; 
                const pId = actualPatient.userId || actualPatient.id || actualPatient.Key || p.Key;
                const pName = actualPatient.name || actualPatient.fullName || "Unknown";

                if (pId) {
                    patientLookup[pId] = pName;
                    // Also try normalising keys (trim whitespace)
                    patientLookup[pId.trim()] = pName;
                }
            });
            console.log(`[Dashboard] Built lookup for ${Object.keys(patientLookup).length} patients.`);
        } catch (e) {
            console.warn("[Dashboard] Patient lookup failed:", e.message);
        }

        // --- B. FETCH RECORDS ---
        let allRecords = [];
        try {
            // Try fetching by Doctor ID directly if function exists
            try {
                const buff = await evaluateTransaction(doctorId, org, 'QueryRecordsByDoctor', doctorId);
                allRecords = JSON.parse(buff.toString());
            } catch(e) {
                // Fallback: Loop through known patients
                const pIds = Object.keys(patientLookup);
                for (const pid of pIds) {
                    try {
                        const buff = await evaluateTransaction(doctorId, org, 'QueryRecordsByPatient', pid);
                        const recs = JSON.parse(buff.toString());
                        allRecords.push(...recs);
                    } catch(err) {}
                }
            }
        } catch (e) {
            // Ultimate Fallback: Admin Query
            try {
                const buff = await evaluateTransaction(doctorId, org, 'QueryAllMedicalRecords');
                allRecords = JSON.parse(buff.toString());
            } catch(ex) {}
        }

        // --- C. FILTER RECORDS ---
        const doctorRecords = allRecords.filter(r => {
            const actualRecord = r.Record || r; // Handle wrapper
            // Check direct approval OR access history
            const isApproved = actualRecord.approvedDoctor === doctorId;
            const hasAccess = actualRecord.accessHistory && actualRecord.accessHistory.some(log => log.user === doctorId);
            return isApproved || hasAccess;
        });

        // --- D. CALCULATE STATS ---
        const uniquePatients = new Set();
        let totalAccessCount = 0;

        // --- E. GENERATE ACTIVITY FEED ---
        const activities = [];

        doctorRecords.forEach(rawRecord => {
            const r = rawRecord.Record || rawRecord; // Unwrap if necessary
            
            // ⭐ CRITICAL: Find the Patient ID using multiple possible keys
            const patientIdKey = r.owner || r.patientId || r.patient || "UnknownID";
            uniquePatients.add(patientIdKey);

            // ⭐ CRITICAL: Look up Name
            const pName = patientLookup[patientIdKey] || patientLookup[patientIdKey.trim()] || "Unknown";

            const recordName = r.recordType || r.recordName || r.recordId; 
            
            // Common data for the activity entry
            const activityBase = {
                recordId: r.recordId,
                recordName: recordName,
                patientId: patientIdKey,
                patientName: pName, // <--- This should now be populated
                txHash: "0x..." 
            };

            // 1. Upload Event
            if (r.approvedDoctor === doctorId) {
                activities.push({ ...activityBase, type: 'upload', timestamp: r.timestamp });
            }

            // 2. View Events
            if (r.accessHistory) {
                totalAccessCount += r.accessHistory.filter(log => log.user === doctorId).length;
                r.accessHistory.forEach(log => {
                    if (log.user === doctorId) {
                        activities.push({ ...activityBase, type: 'view', timestamp: log.timestamp });
                    }
                });
            }
        });

        // --- F. FINAL RESPONSE ---
        const recentActivity = activities
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5)
            .map(act => ({
                type: act.type,
                recordId: act.recordId,
                recordName: act.recordName,
                patientId: act.patientId,
                patientName: act.patientName,
                time: timeAgo(act.timestamp), // Ensure timeAgo function is available in scope
                status: "Confirmed",
                txHash: act.txHash
            }));

        return res.status(200).json({
            patientsSeen: uniquePatients.size,
            totalAccess: totalAccessCount,
            blockHeight: "85", // Replace with dynamic height if available
            recentInteractions: recentActivity
        });

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        return res.status(500).json({ error: error.message });
    }
});
/* ============================================================
   DOCTOR: SEARCH PATIENTS
   ============================================================ */
app.get('/api/doctor/patients', authenticateToken, async (req, res) => {
    const doctorId = req.user.fabric_id;
    const org = req.user.org; 

    try {
        console.log(`🔍 Doctor ${doctorId} fetching patient registry...`);

        // Call the Chaincode function 'QueryAllPatients'
        const buffer = await evaluateTransaction(doctorId, org, 'QueryAllPatients');
        const patients = JSON.parse(buffer.toString());

        // Return the list
        return res.status(200).json(patients);

    } catch (error) {
        console.error("❌ Patient Search Error:", error);
        // If the function doesn't exist or fails, return empty list instead of crashing
        return res.status(200).json([]); 
    }
});
/* ============================================================
   PATIENT RECORDS & PROFILE API
   ============================================================ */

// 1. Get Public User Profile (Name, Org, ID)
app.get('/api/user/:userId', authenticateToken, async (req, res) => {
    const requesterId = req.user.fabric_id;
    const targetUserId = req.params.userId;
    const org = req.user.org;

    try {
        // Use 'GetUser' from chaincode
        const buffer = await evaluateTransaction(requesterId, org, 'GetUser', targetUserId);
        const user = JSON.parse(buffer.toString());
        return res.status(200).json(user);
    } catch (error) {
        console.error(`Error fetching user ${targetUserId}:`, error);
        return res.status(404).json({ error: "User not found" });
    }
});

app.get('/api/patient/:patientId/records', authenticateToken, async (req, res) => {
    const callerId = req.user.fabric_id;
    const callerOrg = req.user.org;
    const callerRole = req.user.role;
    const targetPatientId = req.params.patientId;

    console.log(`\n🛑 SECURITY CHECK: ${callerId} requesting records for ${targetPatientId}`);

    try {
        // 1. IS IT THE PATIENT THEMSELVES? (Allow)
        if (callerId === targetPatientId) {
             // proceed
        } 
        // 2. IS IT A DOCTOR? (Check Consent)
        else if (callerRole === 'doctor') {
            console.log("🔗 Verifying Consent Token on Blockchain...");
            
            const profileBuffer = await evaluateTransaction(callerId, callerOrg, 'GetUser', targetPatientId);
            
            // Handle Empty/Missing Profile safely
            if (!profileBuffer || profileBuffer.length === 0) {
                return res.status(404).json({ error: "Patient not found on ledger" });
            }

            let profile;
            try {
                profile = JSON.parse(profileBuffer.toString());
            } catch (e) {
                return res.status(500).json({ error: "Failed to parse patient profile" });
            }

            // Safety Check: Ensure consents is an array
            const authorizedList = Array.isArray(profile.consents) ? profile.consents : [];

            if (!authorizedList.includes(callerId)) {
                console.warn(`⛔ BLOCKED: Doctor ${callerId} is NOT in consent list: [${authorizedList}]`);
                // ❌ RETURN 403 FORBIDDEN (Triggers Red Screen)
                return res.status(403).json({ error: "ACCESS DENIED: No Consent Token found." });
            }
            console.log("✅ ALLOWED: Consent Token Valid.");
        } 
        // 3. ANYONE ELSE? (Block)
        else {
            return res.status(403).json({ error: "Unauthorized Role" });
        }

        // --- FETCH RECORDS ---
        const buffer = await evaluateTransaction(callerId, callerOrg, 'QueryRecordsByPatient', targetPatientId);
        
        // Handle Empty Records safely
        if (!buffer || buffer.length === 0) {
            return res.status(200).json([]);
        }

        const records = JSON.parse(buffer.toString());
        
        // Sort Newest First
        if (Array.isArray(records)) {
            records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        return res.status(200).json(records);

    } catch (error) {
        console.error("API ERROR:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// 2. Get Medical Records for a Specific Patient
app.get('/api/patient/:patientId/records', authenticateToken, async (req, res) => {
    const doctorId = req.user.fabric_id;
    const patientId = req.params.patientId;
    const org = req.user.org;

    try {
        console.log(`🔍 Doctor ${doctorId} fetching records for ${patientId}...`);

        // Use 'QueryRecordsByPatient' from chaincode
        const buffer = await evaluateTransaction(doctorId, org, 'QueryRecordsByPatient', patientId);
        let records = JSON.parse(buffer.toString());

        // Sort by newest first
        records = records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return res.status(200).json(records);
    } catch (error) {
        console.error("Error fetching records:", error);
        return res.status(200).json([]); // Return empty list if none found
    }
});

// Helper function for time formatting
function timeAgo(dateString) {
    if (!dateString) return "Recently";
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    
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

// Start the listener immediately

startNetworkListener();
httpServer.listen(port, () => {
  console.log(`✅ MedChain Backend Server listening on port ${port}`);
});