/*
 * registerHospital.js
 * Registers a specific Hospital Admin under Org2
 * Usage: node registerHospital.js <hospitalId> <hospitalSecret>
 * Example: node registerHospital.js admin-sunway sunway123
 */

const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        const hospitalId = process.argv[2]; // e.g. 'admin-sunway'
        const hospitalSecret = process.argv[3]; // e.g. 'password'

        if (!hospitalId || !hospitalSecret) {
            console.log('Usage: node registerHospital.js <hospitalId> <password>');
            return;
        }

        // 1. Load Org2 Connection Profile
        const ccpPath = path.resolve(__dirname, 'config', 'connection-org2.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // 2. Create CA Client
        const caInfo = ccp.certificateAuthorities['ca.org2.example.com'];
        const ca = new FabricCAServices(caInfo.url);

        // 3. Connect to Wallet
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // 4. Check if already exists
        const userIdentity = await wallet.get(hospitalId);
        if (userIdentity) {
            console.log(`An identity for the user "${hospitalId}" already exists in the wallet`);
            return;
        }

        // 5. Must use an existing Org2 Admin to register new users
        // Ensure you ran enrollAdmin.js for Org2 first!
        const adminIdentity = await wallet.get('admin-org2');
        if (!adminIdentity) {
            console.log('An identity for the admin user "admin-org2" does not exist in the wallet');
            console.log('Run the enrollAdmin.js script first');
            return;
        }

        // 6. Register the User
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin-org2');

        const secret = await ca.register({
            affiliation: 'org2.department1',
            enrollmentID: hospitalId,
            role: 'client',
            attrs: [{ name: 'role', value: 'hospital', ecert: true }] // Attribute-Based Access Control tag
        }, adminUser);

        // 7. Enroll the User
        const enrollment = await ca.enroll({
            enrollmentID: hospitalId,
            enrollmentSecret: secret
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org2MSP',
            type: 'X.509',
        };

        await wallet.put(hospitalId, x509Identity);
        console.log(`Successfully registered and enrolled user "${hospitalId}" and imported it into the wallet`);

    } catch (error) {
        console.error(`Failed to register user: ${error}`);
    }
}

main();