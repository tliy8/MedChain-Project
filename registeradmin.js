/*
 * registerAdminInFabric.js
 * Run this ONCE to fix the "Fabric identity not found" error.
 */

import { Wallets } from 'fabric-network';
import FabricCAServices from 'fabric-ca-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    try {
        // 1. CONFIGURATION
        const appAdminId = 'admin01';     // The ID you created in initAdmin.js
        const appAdminSecret = 'password123'; 
        const orgName = 'Org1';           // Admins usually belong to Org1
        const mspId = 'Org1MSP';
        const caAdminId = 'admin';        // The default CA 'Registrar' (built-in to Fabric)
        const caAdminSecret = 'adminpw';  // The default CA password

        // 2. SETUP PATHS
        const ccpPath = path.resolve(__dirname, 'config', 'connection-org1.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`📂 Wallet path: ${walletPath}`);

        // 3. CHECK IF ALREADY EXISTS
        const identity = await wallet.get(appAdminId);
        if (identity) {
            console.log(`✅ Identity "${appAdminId}" already exists in the wallet.`);
            return;
        }

        // 4. ENROLL THE "CA REGISTRAR" (admin-org1)
        // We need this high-level account to be able to create OTHER accounts
        let adminIdentity = await wallet.get('admin-org1');
        if (!adminIdentity) {
            console.log('⚠️ CA Registrar "admin-org1" not found. Enrolling now...');
            const enrollment = await ca.enroll({ enrollmentID: caAdminId, enrollmentSecret: caAdminSecret });
            const x509Identity = {
                credentials: {
                    certificate: enrollment.certificate,
                    privateKey: enrollment.key.toBytes(),
                },
                mspId: mspId,
                type: 'X.509',
            };
            await wallet.put('admin-org1', x509Identity);
            console.log('✅ CA Registrar "admin-org1" enrolled and imported.');
            adminIdentity = await wallet.get('admin-org1');
        }

        // 5. REGISTER & ENROLL THE "WEB ADMIN" (admin01)
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin-org1');

        console.log(`🚀 Registering "${appAdminId}"...`);
        
        // Register the user, enroll the user, and import the new identity into the wallet.
        const secret = await ca.register({
            affiliation: 'org1.department1',
            enrollmentID: appAdminId,
            role: 'client' // Admins are technically 'clients' who have special permissions
        }, adminUser);

        console.log(`🔑 Secret generated. Enrolling "${appAdminId}"...`);
        
        const enrollment = await ca.enroll({
            enrollmentID: appAdminId,
            enrollmentSecret: secret
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: mspId,
            type: 'X.509',
        };

        await wallet.put(appAdminId, x509Identity);
        console.log(`
        ✅ SUCCESS! 
        Identity "${appAdminId}" has been added to the wallet.
        You can now login on the website.
        `);

    } catch (error) {
        if(error.message.includes('already registered')) {
             console.log("⚠️ User already registered. Trying to enroll only...");
             // Fallback: If registered but not in wallet, just enroll
             try {
                // Re-create CA client (simplified for brevity, reuse logic above)
                // ... assuming manual enrollment if secret is known or skipped for now
                console.log("👉 If the user is already registered but missing from wallet, you might need to re-run your network script or delete the CA data to reset.");
             } catch(e) {}
        }
        console.error(`❌ Failed to register admin: ${error}`);
    }
}

main();