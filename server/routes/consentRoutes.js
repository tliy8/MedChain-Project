import express from 'express';
import * as consentController from '../controllers/consentController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Route: /api/consent/grant
router.post('/grant', authenticateToken, consentController.grant);

// Route: /api/consent/revoke
router.post('/revoke', authenticateToken, consentController.revoke);

// Route: /api/consent/check-consent/:patientId
router.get('/check-consent/:patientId', authenticateToken, consentController.check);

export default router;