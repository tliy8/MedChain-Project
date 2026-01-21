import { submitTransaction, evaluateTransaction } from '../utils/fabric_gateway.js';

export const grantConsent = async (patientId, providerId, org) => {
    // Logic extracted from server.js
    const result = await submitTransaction(
        patientId, 
        'Org1', // Patients are usually Org1
        'GrantConsent', 
        patientId, 
        providerId
    );
    return { message: result };
};

export const revokeConsent = async (patientId, providerId, org) => {
    const result = await submitTransaction(
        patientId, 
        'Org1', 
        'RevokeConsent', 
        patientId, 
        providerId
    );
    return { message: result };
};

export const checkConsent = async (doctorId, doctorOrg, patientId) => {
    console.log(`🔍 Consent check: Doctor ${doctorId} → Patient ${patientId}`);

    // Fetch Patient Profile from Blockchain
    const profileBuffer = await evaluateTransaction(
        doctorId,
        doctorOrg,
        'GetUser',
        patientId
    );

    if (!profileBuffer || profileBuffer.length === 0) {
        throw new Error('Patient not found');
    }

    const profile = JSON.parse(profileBuffer.toString());
    const authorizedList = profile.consents || [];

    const isAllowed = authorizedList.includes(doctorId);

    console.log(isAllowed ? `✅ Consent OK` : `⛔ Consent DENIED`);
    
    return { allowed: isAllowed };
};