/*
 * initAdmin.js
 * This script creates the INITIAL Admin account in Firebase & Fabric.
 * Run this ONCE to bootstrap your system.
 */

import admin from 'firebase-admin';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

// 1. SETUP FIREBASE
// (Must match your server.js config)
const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : null;

if (!FIREBASE_CONFIG) {
    console.error("❌ Error: FIREBASE_CONFIG not found in .env");
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(FIREBASE_CONFIG),
        databaseURL: `https://${FIREBASE_CONFIG.projectId}.firebaseio.com`
    });
}
const db = admin.firestore();

// 2. DEFINE THE SUPER ADMIN
const SUPER_ADMIN = {
    userId: 'admin01',          // The ID used to login
    password: 'password123',    // Change this!
    name: 'System Administrator',
    role: 'admin',              // ⭐ CRITICAL: This allows access to Admin Dashboard
    org: 'Org1',                // Admins usually belong to Org1 (Hospital A) or Org2
    fabricId: 'admin01'         // Same as userId for simplicity
};

async function createAdmin() {
    console.log(`🚀 Initializing Super Admin: ${SUPER_ADMIN.userId}...`);

    try {
        // A. Hash the Password
        const hashedPassword = await bcrypt.hash(SUPER_ADMIN.password, 10);

        // B. Save to Firestore (Simulating the 'users' table)
        // Note: We are writing directly to DB, skipping Fabric CA for this "Web Login" part
        // The server.js login checks Firestore first.
        await db.collection('artifacts').doc('medchain').collection('users').doc(SUPER_ADMIN.userId).set({
            fabric_id: SUPER_ADMIN.fabricId,
            username: SUPER_ADMIN.userId,
            hashed_password: hashedPassword,
            name: SUPER_ADMIN.name,
            role: SUPER_ADMIN.role,
            org: SUPER_ADMIN.org,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`
        ✅ SUCCESS! Admin Account Created.
        -----------------------------------
        User:     ${SUPER_ADMIN.userId}
        Password: ${SUPER_ADMIN.password}
        Role:     ${SUPER_ADMIN.role}
        -----------------------------------
        👉 You can now go to 'login.html' and sign in.
        `);

        // Note: For full functionality, you will eventually need to register this
        // identity in the Fabric Wallet too. But for "Dashboard Access", this is enough.
        
    } catch (error) {
        console.error("❌ Failed to create admin:", error);
    }
}

createAdmin();