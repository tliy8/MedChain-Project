import * as patientService from '../services/patientService.js';

export const getDashboardStats = async (req, res) => {
    try {
        const stats = await patientService.getDashboardStats(req.user.fabric_id, req.user.org);
        res.status(200).json(stats);
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ error: "Failed to load dashboard stats" });
    }
};

export const getAuditLog = async (req, res) => {
    try {
        const logs = await patientService.getAuditLog(req.user.fabric_id, req.user.org);
        res.status(200).json(logs);
    } catch (error) {
        console.error("Audit Log Error:", error);
        res.status(500).json({ error: "Failed to generate audit log" });
    }
};

// controller/patientController.js
export const getRecords = async (req, res) => {
    try {
        const { patientId } = req.params;
        const records = await patientService.getPatientRecordsSecure(
            req.user.fabric_id, 
            req.user.org, 
            req.user.role, 
            patientId
        );
        res.status(200).json(records);
    } catch (error) {
        console.error("Get Records Error:", error.message);

        // --- FIX STARTS HERE ---
        let status = 500; // Default to Internal Server Error

        if (error.message.includes("ACCESS DENIED") || error.message.includes("Unauthorized Role")) {
            status = 403; // Forbidden
        } else if (error.message.includes("Patient not found")) {
            status = 404; // Not Found
        }
        // --- FIX ENDS HERE ---

        res.status(status).json({ error: error.message });
    }
};

export const getUser = async (req, res) => {
    try {
        // MATCHING THE ROUTE PARAMETER
        const { patientId } = req.params; 
        
        const user = await patientService.getUserSecure(
            req.user.fabric_id,
            req.user.org,
            req.user.role,
            patientId // Passing patientId instead of userId
        );

        res.status(200).json(user);

    } catch (error) {
        console.error("Get User Error:", error.message);
        
        let status = 500;
        if (error.message.includes("ACCESS DENIED")) {
            status = 403;
        } else if (error.message.includes("does not exist") || error.message.includes("not found")) {
            status = 404;
        }

        res.status(status).json({ error: error.message });
    }
};