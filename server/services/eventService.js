import { Gateway } from 'fabric-network';
import { getCaAndWalletForOrg } from '../utils/fabricUtils.js'; // Ensure this matches your file path

let CURRENT_BLOCK_HEIGHT = 0;

export const startNetworkListener = async (io) => {
    try {
        console.log("🔄 Initializing Blockchain Event Listener...");
        
        // 1. Connect as Admin to listen
        const { wallet, ccp } = await getCaAndWalletForOrg('Org1');
        const gateway = new Gateway();
        
        await gateway.connect(ccp, { 
            wallet, 
            identity: 'admin-org1', 
            discovery: { enabled: true, asLocalhost: true } 
        });

        // 2. Get Network & Channel
        const network = await gateway.getNetwork('mychannel');
        const contract = network.getContract('medchain');
        const channel = network.getChannel();

        // 3. Get Initial Block Height
        try {
            const info = await channel.queryInfo();
            CURRENT_BLOCK_HEIGHT = info.height.low.toString();
            console.log(`🧱 Current Block Height: ${CURRENT_BLOCK_HEIGHT}`);
        } catch (e) {
            console.warn("⚠️ Could not fetch initial block height:", e.message);
        }

        console.log("👂 Listening for Blockchain Events...");

        // 4. BLOCK LISTENER (New Blocks)
        await network.addBlockListener(async (event) => {
            CURRENT_BLOCK_HEIGHT = event.blockNumber.toString();
            
            io.emit('chain-log', {
                type: 'BLOCK',
                text: `New Block Mined: #${event.blockNumber}`,
                time: new Date().toLocaleTimeString()
            });
        });

        // 5. CONTRACT EVENT LISTENER (Specific Actions)
        await contract.addContractListener(async (event) => {
            try {
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
                // Formatter for specific events
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

                // Send to Frontend via Socket.io
                io.emit('chain-log', {
                    type: 'TX',
                    text: `[${txId.length > 8 ? txId.substring(0, 8) : txId}...] ${message}`,
                    time: new Date().toLocaleTimeString()
                });

            } catch (err) {
                console.error("Error processing contract event:", err);
            }
        });

    } catch (error) {
        console.error("❌ Failed to start network listener:", error);
    }
};