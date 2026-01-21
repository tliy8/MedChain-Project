import express from 'express';
import * as patientController from '../controllers/patientController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// 1. Dashboard Statistics (Cards & Activity Feed)
router.get('/dashboard-stats', authenticateToken, patientController.getDashboardStats);

// 2. Audit Trail (History Timeline)
router.get('/audit-log', authenticateToken, patientController.getAuditLog);

// 3. View Records (Secure Endpoint for Doctors & Patients)
router.get('/:patientId/records', authenticateToken, patientController.getRecords);

router.get('/:patientId', authenticateToken, patientController.getUser);
export default router;