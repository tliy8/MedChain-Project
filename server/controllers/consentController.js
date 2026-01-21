import * as consentService from '../services/consentService.js';

export const grant = async (req, res) => {
    try {
        const patientId = req.user.fabric_id;
        const { providerId } = req.body;
        
        if (!providerId) return res.status(400).json({ error: 'Missing providerId.' });

        const result = await consentService.grantConsent(patientId, providerId, req.user.org);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: `Consent failed: ${error.message}` });
    }
};

export const revoke = async (req, res) => {
    try {
        const patientId = req.user.fabric_id;
        const { providerId } = req.body;

        const result = await consentService.revokeConsent(patientId, providerId, req.user.org);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const check = async (req, res) => {
    try {
        const doctorId = req.user.fabric_id;
        const doctorOrg = req.user.org;
        const { patientId } = req.params;

        const result = await consentService.checkConsent(doctorId, doctorOrg, patientId);
        res.json(result);
    } catch (error) {
        console.error('[CONSENT CHECK ERROR]', error);
        // Default to false if error occurs (fail safe)
        res.status(500).json({ allowed: false });
    }
};