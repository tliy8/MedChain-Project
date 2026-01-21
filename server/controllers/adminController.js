import * as adminService from '../services/adminService.js';

export const getStats = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access Denied: Admin only." });
    }
    try {
        const stats = await adminService.getSystemStats(req.user.fabric_id, req.user.org);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: "Failed to generate stats" });
    }
};

export const getDoctors = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access Denied" });
    }
    try {
        const doctors = await adminService.getAllDoctors(req.user.fabric_id, req.user.org);
        res.json(doctors);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch doctor registry" });
    }
};

export const getEvents = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access Denied: Admin only." });
    }
    try {
        const events = await adminService.getSystemEvents(req.user.fabric_id, req.user.org);
        res.json(events);
    } catch (error) {
        console.error("Audit Log Error:", error);
        res.status(500).json({ error: "Failed to generate audit log: " + error.message });
    }
};