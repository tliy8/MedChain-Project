import express from 'express';
import * as recordController from '../controllers/recordController.js';
import { authenticateToken, upload } from '../middleware/authMiddleware.js'; // Helper we made earlier

const router = express.Router();
// 1. Add Record (Protected + File Upload)
router.post('/add', authenticateToken, recordController.addRecord);
// 2. View Full Record (Metadata + IPFS + Integrity)
router.get('/:recordId', authenticateToken, recordController.viewRecord);
// 3. Get Audit History
router.get('/history/:recordId', authenticateToken, recordController.getHistory);
// 4. Verify & Download (Specific Hash)
router.post('/verify-and-download', authenticateToken, recordController.verifyDownload);
router.get('/patient/:patientId', authenticateToken, recordController.getPatientRecords);

export default router;