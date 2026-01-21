import express from 'express';
import * as adminController from '../controllers/adminController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Matches: /api/admin/stats
router.get('/stats', authenticateToken, adminController.getStats);

// Matches: /api/admin/doctors
router.get('/doctors', authenticateToken, adminController.getDoctors);

// Matches: /api/admin/events
router.get('/events', authenticateToken, adminController.getEvents);

export default router;