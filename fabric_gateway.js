// fabric_gateway.js
import { Gateway, Wallets } from 'fabric-network';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHANNEL_NAME = 'mychannel';      // Change to your actual channel name
const CHAINCODE_NAME = 'medchain';     // Your deployed chaincode name

/**
 * Connect to Fabric network and return contract object for the given user/org
 * @param {string} userId - User identity in the wallet
 * @param {string} orgName - Organization name, e.g., 'Org1' or 'Org2'
 */
async function getContract(userId, orgName) {
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const identity = await wallet.get(userId);
    if (!identity) {
        throw new Error(`Identity ${userId} not found in wallet. Has the user been registered?`);
    }

    // Load correct connection profile
    const ccpPath = path.resolve(__dirname, 'config', `connection-${orgName.toLowerCase()}.json`);
    if (!fs.existsSync(ccpPath)) {
        throw new Error(`Connection profile not found: ${ccpPath}`);
    }
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    const gateway = new Gateway();
    try {
        await gateway.connect(ccp, {
            wallet,
            identity: userId,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(CHANNEL_NAME);
        const contract = network.getContract(CHAINCODE_NAME);

        return { gateway, contract };
    } catch (error) {
        throw new Error(`Failed to connect to Fabric network: ${error.message}`);
    }
}

/**
 * Submit (write) transaction to the ledger
 */
async function submitTransaction(userId, orgName, functionName, ...args) {
    const { gateway, contract } = await getContract(userId, orgName);
    try {
        const result = await contract.submitTransaction(functionName, ...args);
        return result.toString();
    } finally {
        gateway.disconnect();
    }
}

/**
 * Evaluate (read-only) transaction from the ledger
 */
async function evaluateTransaction(userId, orgName, functionName, ...args) {
    const { gateway, contract } = await getContract(userId, orgName);
    try {
        const result = await contract.evaluateTransaction(functionName, ...args);
        return result.toString(); // returns string (can JSON.parse later)
    } finally {
        gateway.disconnect();
    }
}

export { submitTransaction, evaluateTransaction,getContract };
