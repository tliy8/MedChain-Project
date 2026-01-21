import fs from 'fs';
import path from 'path';
import FabricCAServices from 'fabric-ca-client';
import { Wallets } from 'fabric-network';

export async function getCaAndWalletForOrg(org) {
    const orgNormalized = ('' + org).toLowerCase();
    const ccpPath = path.resolve(process.cwd(), "config", `connection-${orgNormalized}.json`);
    
    if (!fs.existsSync(ccpPath)) {
        throw new Error(`Connection profile not found: ${ccpPath}`);
    }
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    const caKey = Object.keys(ccp.certificateAuthorities)[0];
    const caInfo = ccp.certificateAuthorities[caKey];
    const ca = new FabricCAServices(caInfo.url, { trustedRoots: caInfo.tlsCACerts ? caInfo.tlsCACerts.pem : undefined, verify: false }, caInfo.caName);

    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    return { ccp, ca, wallet, caInfo };
}