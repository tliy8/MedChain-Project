import * as authService from '../services/authService.js';

export const register = async (req, res) => {
    try {
        const { userId, name, role, org, password } = req.body;
        if (!userId || !name || !role || !org || !password) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }
        const result = await authService.registerUser(req.body);
        res.status(200).json(result);
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing required fields.' });

        const result = await authService.loginUser(username, password);
        res.status(200).json(result);
    } catch (error) {
        console.error('Login Error:', error);
        res.status(401).json({ error: error.message });
    }
};