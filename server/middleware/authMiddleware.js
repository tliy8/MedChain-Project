import jwt from 'jsonwebtoken';
import multer from 'multer';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_VERY_STRONG_AND_SECRET_KEY_HERE_2025';

// 1. JWT Middleware
export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. Authentication token missing.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden. Invalid or expired token.' });
        req.user = user;
        next();
    });
}

// 2. Upload Middleware (Multer)
export const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 500 * 1024 * 1024, // 500 MB
        fieldSize: 500 * 1024 * 1024 
    }
});