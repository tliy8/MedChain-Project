import express from 'express';
import * as doctorController from '../controllers/doctorController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// 1. Doctor Dashboard Stats
router.get('/dashboard-stats', authenticateToken, doctorController.getDashboardStats);

// 2. Get All Patients (For searching)
router.get('/patients', authenticateToken, doctorController.getPatients);

// 3. Get All Doctors (Public list for referral or selection)
router.get('/list', authenticateToken, doctorController.listDoctors);

export default router;