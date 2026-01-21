import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db, admin } from '../config/firebase.js';
import { getCaAndWalletForOrg } from '../utils/fabricUtils.js';
import { submitTransaction } from '../utils/fabric_gateway.js'; // Keep your existing gateway file
import path from 'path';
import { Wallets, Gateway } from 'fabric-network';
import fs from 'fs';

const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_VERY_STRONG_AND_SECRET_KEY_HERE_2025';
const APP_ID = 'medchain';

export const registerUser = async (data) => {
    const { userId, name, role, org, password, email, license, idPassport } = data;
    const orgNormalized = ('' + org).toLowerCase().startsWith('org') ? 
        (org.charAt(0).toUpperCase() + org.slice(1)) : 
        (org.charAt(0).toUpperCase() + org.slice(1));

    // 1. Fabric CA Registration
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
    }

    // 2. Register on Blockchain
    const orgMSP = (orgNormalized === 'Org1') ? 'Org1MSP' : 'Org2MSP';
    await submitTransaction(adminLabel, orgNormalized, 'RegisterUser', userId, name, role, orgMSP);

    // 3. Save to Firebase
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.collection('artifacts').doc(APP_ID).collection('users').doc(userId).set({
        fabric_id: userId, username: userId, hashed_password: hashedPassword,
        name, role, org: orgNormalized, email: email || "", license: license || "N/A",
        id_passport: idPassport || userId, created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, message: `User ${userId} registered successfully.` };
};

export const loginUser = async (username, password) => {
    // 1. Firebase Check
    const userDoc = await db.collection('artifacts').doc(APP_ID).collection('users').doc(username).get();
    if (!userDoc.exists) throw new Error('Invalid username or password.');
    
    const userData = userDoc.data();
    const isMatch = await bcrypt.compare(password, userData.hashed_password);
    if (!isMatch) throw new Error('Invalid username or password.');

    // 2. Wallet Check
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    const identity = await wallet.get(userData.fabric_id);
    if (!identity) throw new Error(`Fabric identity for ${userData.fabric_id} not found.`);

    // 3. Generate Token
    const token = jwt.sign({ fabric_id: userData.fabric_id, role: userData.role, org: userData.org }, JWT_SECRET, { expiresIn: "1h" });
    
    return { 
        message: "Login successful.", token, fabric_id: userData.fabric_id, 
        name: userData.name, role: userData.role, org: userData.org 
    };
};