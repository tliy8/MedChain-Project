/*
 * enrollAdmin.js
 * Enrolls the 'admin' user for Org1 and Org2 and stores their identity in the wallet.
 * This identity is used by the backend to register new patients, doctors, and hospitals.
 *
 * NOTE: Run this script ONCE before starting the main server.
 */

'use strict';

import FabricCAServices from 'fabric-ca-client';
import { Wallets } from 'fabric-network';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Fix __dirname for ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration Variables ---
const ORG1_CA_HOST = 'ca.org1.example.com'; 
const ORG2_CA_HOST = 'ca.org2.example.com';
const ORG1_MSP_ID = 'Org1MSP';
const ORG2_MSP_ID = 'Org2MSP';
const ADMIN_ID = 'admin';       // Default CA Admin Username
const ADMIN_SECRET = 'adminpw'; // Default CA Admin Password
// -------------------------------

const walletPath = path.join(process.cwd(), 'wallet');

// Helper function to build the CA client object
function buildCAClient(ccp, caHostName) {
    const caInfo = ccp.certificateAuthorities[caHostName];
    const caTLSCACerts = caInfo.tlsCACerts.pem;
    return new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);
}

// Main enrollment logic for a single organization
async function enrollAdmin(orgName, ccpPath, caHostName, mspId) {
    console.log(`\nStarting admin enrollment for ${orgName}...`);

    try {
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
        const caClient = buildCAClient(ccp, caHostName);
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        
        const identityLabel = `admin-${orgName.toLowerCase()}`;
        const identity = await wallet.get(identityLabel);

        if (identity) {
            console.log(`✅ Admin identity for ${orgName} already exists in the wallet.`);
            return;
        }

        // 1. Enroll the admin user 
        const enrollment = await caClient.enroll({ 
            enrollmentID: ADMIN_ID, 
            enrollmentSecret: ADMIN_SECRET 
        });
        
        // 2. Create the identity object
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: mspId,
            type: 'X.509',
        };

        // 3. Import the identity into the wallet
        await wallet.put(identityLabel, x509Identity);
        console.log(`✅ Successfully enrolled admin for ${orgName} and imported identity: ${identityLabel}`);

    } catch (error) {
        console.error(`❌ Failed to enroll admin for ${orgName}: ${error}`);
        process.exit(1);
    }
}

// --- Execution Block ---
(async () => {
    const ccpOrg1Path = path.resolve(__dirname, 'config', 'connection-org1.json');
    const ccpOrg2Path = path.resolve(__dirname, 'config', 'connection-org2.json');

    if (!fs.existsSync(ccpOrg1Path) || !fs.existsSync(ccpOrg2Path)) {
        console.error("\nERROR: Connection profiles not found in the 'config' folder.");
        console.error("Please place 'connection-org1.json' and 'connection-org2.json' there.");
        return;
    }
    
    // Ensure the wallet directory exists
    if (!fs.existsSync(walletPath)) {
        fs.mkdirSync(walletPath);
    }

    await enrollAdmin('Org1', ccpOrg1Path, ORG1_CA_HOST, ORG1_MSP_ID);
    console.log('---');
    await enrollAdmin('Org2', ccpOrg2Path, ORG2_CA_HOST, ORG2_MSP_ID);

    console.log('\nAdmin setup complete. You can now run the server.js.');
})();
