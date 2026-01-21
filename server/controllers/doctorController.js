import * as doctorService from '../services/doctorService.js';

export const getDashboardStats = async (req, res) => {
    try {
        const stats = await doctorService.getDashboardStats(req.user.fabric_id, req.user.org);
        res.status(200).json(stats);
    } catch (error) {
        console.error("Doctor Dashboard Error:", error);
        res.status(500).json({ error: error.message });
    }
};

export const getPatients = async (req, res) => {
    try {
        const patients = await doctorService.getAllPatients(req.user.fabric_id, req.user.org);
        res.status(200).json(patients);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const listDoctors = async (req, res) => {
    try {
        // Use the caller's ID (could be patient or doctor)
        const doctors = await doctorService.getAllDoctors(req.user.fabric_id, req.user.org);
        res.status(200).json(doctors);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch doctors list" });
    }
};