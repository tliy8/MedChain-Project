/*
 * ipfs_handler.js
 * Manages file encryption, upload to IPFS, retrieval, and decryption.
 */

import { create } from 'ipfs-http-client';
import crypto from 'crypto';

// Configure IPFS Client (Ensure your IPFS daemon is running on this address/port)
const ipfs = create({ host: 'localhost', port: '5001', protocol: 'http' }); 
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

// 🚨 FIX: This key is now 32 bytes (64 hex characters) for AES-256. 
// DO NOT use this generic key in a production system. Generate a real one!
const ENCRYPTION_KEY = Buffer.from(
  'a1b2c3d4e5f67890a1b2c3d4e5f678901234567890abcdef1234567890abcdef',
  'hex'
);

const IV = Buffer.alloc(16, 0); // Initialization Vector (16 bytes)

// --- Helper Functions ---

function encryptData(buffer) {
    try {
        console.log("[IPFS] Encrypting data...");
        console.log("[IPFS] Using algorithm:", ENCRYPTION_ALGORITHM);
        console.log("[IPFS] Key length:", ENCRYPTION_KEY.length);
        console.log("[IPFS] IV length:", IV.length);

        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, IV);
        let encrypted = cipher.update(buffer);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        console.log("[IPFS] Encryption successful. Encrypted size:", encrypted.length);
        return encrypted;
    } catch (err) {
        console.error("❌ [IPFS] Encryption ERROR:", err);
        throw err;
    }
}

function decryptData(buffer) {
    try {
        console.log("[IPFS] Decrypting data...");
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, IV);

        let decrypted = decipher.update(buffer);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        console.log("[IPFS] Decryption successful. Decrypted size:", decrypted.length);
        return decrypted;
    } catch (err) {
        console.error("❌ [IPFS] Decryption ERROR:", err);
        throw err;
    }
}




// 1. Upload encrypted file to IPFS
async function uploadEncryptedFile(fileBuffer) {
    // A. Encrypt the file data
    const encryptedBuffer = encryptData(fileBuffer);

    // B. Upload the encrypted buffer to IPFS
    const result = await ipfs.add(encryptedBuffer);
    
    // C. Return the Content Identifier (CID)
    return result.cid.toString();
}

// 2. Retrieve and decrypt file from IPFS
async function getAndDecryptFile(ipfsHash) {
    // A. Retrieve the encrypted file from IPFS
    const chunks = [];
    for await (const chunk of ipfs.cat(ipfsHash)) {
        chunks.push(chunk);
    }
    const encryptedBuffer = Buffer.concat(chunks);

    // B. Decrypt the file data
    const decryptedBuffer = decryptData(encryptedBuffer);

    return decryptedBuffer;
}

// 3. EXPORT the functions 
export { uploadEncryptedFile, getAndDecryptFile };
