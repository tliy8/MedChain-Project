/*
 * ca_handler.js
 * Handles dynamic registration and enrollment of new users (patients/doctors/hospitals).
 * Called by the /api/user/register endpoint in server.js.
 */

'use strict';

import { Wallets } from 'fabric-network';
import FabricCAServices from 'fabric-ca-client';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const walletPath = path.join(process.cwd(), 'wallet');

// Helper function to create a CA client from the connection profile
function buildCAClient(ccp, caHostName) {
    const caInfo = ccp.certificateAuthorities[caHostName];
    const caTLSCACerts = caInfo.tlsCACerts.pem;
    return new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);
}

// Main function to handle user registration and certificate enrollment
async function registerAndEnrollUser(userId, userRole, orgName, orgMSP) {
    
    // 1️⃣ Configure paths based on the organization
    const orgConfig = {
        Org1: { caHost: 'ca.org1.example.com', ccpFile: 'connection-org1.json', adminId: 'admin-org1' },
        Org2: { caHost: 'ca.org2.example.com', ccpFile: 'connection-org2.json', adminId: 'admin-org2' }
    };

    const config = orgConfig[orgName];
    if (!config) {
        throw new Error(`Invalid organization name: ${orgName}`);
    }

    // 2️⃣ Fix __dirname usage for ESM
    const ccpPath = path.resolve(__dirname, 'config', config.ccpFile);
    if (!fs.existsSync(ccpPath)) {
        throw new Error(`Connection profile not found: ${ccpPath}`);
    }
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    const caClient = buildCAClient(ccp, config.caHost);
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    // 3️⃣ Check if user already exists in the wallet
    const userExists = await wallet.get(userId);
    if (userExists) {
        throw new Error(`Identity ${userId} already exists in wallet.`);
    }

    // 4️⃣ Check for Admin Identity (needed to register new users)
    const adminUser = await wallet.get(config.adminId);
    if (!adminUser) {
        throw new Error(`Admin identity ${config.adminId} not found. Run enrollAdmin.js first.`);
    }

    // 5️⃣ Build a user object for authenticating with the CA
    const provider = wallet.getProviderRegistry().getProvider(adminUser.type);
    const adminUserObj = await provider.getUserContext(adminUser, config.adminId);

    // 6️⃣ Register the new user with Fabric CA
    const secret = await caClient.register({
        affiliation: `${orgName.toLowerCase()}.department1`,
        enrollmentID: userId,
        role: 'client',
        attrs: [{ name: 'role', value: userRole, ecert: true }]
    }, adminUserObj);

    // 7️⃣ Enroll the user to get their certificates and private key
    const enrollment = await caClient.enroll({
        enrollmentID: userId,
        enrollmentSecret: secret
    });

    // 8️⃣ Create the X.509 Identity object
    const x509Identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes(),
        },
        mspId: orgMSP,
        type: 'X.509',
    };

    // 9️⃣ Import the new identity into the wallet
    await wallet.put(userId, x509Identity);
    
    return { success: true, message: `Successfully registered and enrolled ${userId} for ${orgName}` };
}

export { registerAndEnrollUser };
