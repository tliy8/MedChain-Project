import express from 'express';
import * as authController from '../controllers/authController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
// Example of a protected route using the middleware
router.get('/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

export default router;