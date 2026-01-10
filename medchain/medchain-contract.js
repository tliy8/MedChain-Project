// SPDX-License-Identifier: Apache-2.0

'use strict';

const { Contract } = require('fabric-contract-api');

class MedChainContract extends Contract {

    // Extract CN (common name)
    async getInvokerId(ctx) {
        const id = ctx.clientIdentity.getID(); 
        // This splits the ID string to get the CN part (e.g., 'doctor01')
        return id.split('::')[1].split('/CN=')[1];
    }

    // Extract ORG from MSP (Org1MSP, Org2MSP)
    async getInvokerOrg(ctx) {
        return ctx.clientIdentity.getMSPID(); 
    }

    // Debug helper
    async WhoAmI(ctx) {
        return {
            id: await this.getInvokerId(ctx),
            msp: await this.getInvokerOrg(ctx),
            full: ctx.clientIdentity.getID()
        };
    }

    /* ============================================================
        USER REGISTRATION
        ============================================================ */

    async RegisterUser(ctx, userId, name, role, org) {
        const invoker = await this.getInvokerId(ctx);
        const msp = await this.getInvokerOrg(ctx);

        // Allowed admins:
        const isOrg1Admin = (msp === "Org1MSP" && invoker.toLowerCase().includes("admin"));
        const isOrg2Admin = (msp === "Org2MSP" && invoker.toLowerCase().includes("admin"));

        // Validate admin rights
        if (!isOrg1Admin && !isOrg2Admin) {
            throw new Error(`Only Org1/Org2 admins can register users.`);
        }

        // Prevent wrong-org registration
        if (role === 'patient' && msp !== "Org1MSP") {
            throw new Error(`Patients can ONLY be registered by Org1 admin.`);
        }
        if ((role === 'doctor' || role === 'hospital') && msp !== "Org2MSP") {
            throw new Error(`Doctors/Hospitals can ONLY be registered by Org2 admin.`);
        }

        const exists = await ctx.stub.getState(userId);
        if (exists && exists.length > 0) {
            throw new Error(`User ${userId} already exists.`);
        }

        const user = {
            userId,
            name,
            role,
            org,
            consents: [],
            docType: 'user'
        };

        await ctx.stub.putState(userId, Buffer.from(JSON.stringify(user)));
        const eventName = role === 'hospital' ? 'HospitalAdded' : (role === 'doctor' ? 'DoctorAdded' : 'PatientRegistered');
        const eventPayload = Buffer.from(JSON.stringify(user));
        ctx.stub.setEvent(eventName, eventPayload);
        return `User ${userId} (${role}) registered successfully.`;
    }

    /* ============================================================
        CONSENT MANAGEMENT
        ============================================================ */

    async GrantConsent(ctx, patientId, providerId) {
        const invoker = await this.getInvokerId(ctx);

        // Only patient himself can grant consent
        if (invoker !== patientId) {
            throw new Error(`Only patient ${patientId} can grant consent.`);
        }

        const patientBytes = await ctx.stub.getState(patientId);
        if (!patientBytes) throw new Error(`Patient ${patientId} not found.`);

        const patient = JSON.parse(patientBytes.toString());

        // Check provider exists
        const provBytes = await ctx.stub.getState(providerId);
        if (!provBytes) throw new Error(`Provider ${providerId} does not exist.`);

        const provider = JSON.parse(provBytes.toString());

        // Ensure provider is doctor/hospital
        if (provider.role !== 'doctor' && provider.role !== 'hospital') {
            throw new Error(`Consent can only be granted to doctors or hospitals.`);
        }

        // Add consent
        if (!patient.consents.includes(providerId)) {
            patient.consents.push(providerId);
        }

        await ctx.stub.putState(patientId, Buffer.from(JSON.stringify(patient)));
        const eventPayload = Buffer.from(JSON.stringify({ patient: patientId, provider: providerId, status: "GRANTED" }));
        ctx.stub.setEvent('ConsentGranted', eventPayload);
        return `Consent granted to ${providerId}`;
    }
    /* ============================================================
        MEDICAL RECORD MANAGEMENT (Fixed Timestamp)
       ============================================================ */

async AddMedicalRecord(
    ctx,
    recordId,
    patientId,
    doctorId,
    hospitalId,
    ipfsCid,   // 🔄 renamed for clarity (CID)
    fileHash,  // ✅ NEW: SHA-256 hash
    content
) {
    const exists = await this.AssetExists(ctx, recordId);
    if (exists) {
        throw new Error(`The record ${recordId} already exists`);
    }

    let parsedContent;
    try {
        parsedContent = JSON.parse(content);
    } catch (e) {
        throw new Error(`Invalid content format`);
    }

    // ⭐ Deterministic ledger timestamp
    const txTimestamp = ctx.stub.getTxTimestamp();
    const timeInMilliseconds = txTimestamp.seconds.low * 1000;

    const record = {
        docType: 'MedicalRecord',
        recordId,
        patientId,
        doctorId,
        hospitalId,

        ipfsCid,     // 🌐 IPFS address
        fileHash,    // 🔐 SHA-256 (USED FOR VERIFICATION)

        timestamp: timeInMilliseconds,
        ...parsedContent
    };

    await ctx.stub.putState(
        recordId,
        Buffer.from(JSON.stringify(record))
    );

    // 🔔 Event includes BOTH CID + hash
    const eventPayload = {
        recordId,
        patientId,
        doctorId,
        hospitalId,
        ipfsCid,
        fileHash
    };

    ctx.stub.setEvent(
        'MedicalRecordAdded',
        Buffer.from(JSON.stringify(eventPayload))
    );

    return `Record ${recordId} added successfully.`;
}

    async ViewMedicalRecord(ctx, recordId) {
        const recordBytes = await ctx.stub.getState(recordId);
        if (!recordBytes || recordBytes.length === 0) {
            throw new Error(`Record ${recordId} not found.`);
        }
        return JSON.parse(recordBytes.toString());
    }

    /* ============================================================
        AUDIT LOG (Transaction)
        ============================================================ */

    async LogRecordAccess(ctx, recordId) {
        // NOTE: We MUST also fix the timestamp in this transactional function!
        const invokerId = await this.getInvokerId(ctx);
        const invokerMSP = await this.getInvokerOrg(ctx);

        // 2. Get the current record state
        const recordBytes = await ctx.stub.getState(recordId);
        if (!recordBytes || recordBytes.length === 0) {
            throw new Error(`Record ${recordId} does not exist for logging access.`);
        }
        const record = JSON.parse(recordBytes.toString());

        // 3. Ensure the accessHistory array exists
        if (!record.accessHistory) {
            record.accessHistory = [];
        }
        
        // ⭐ CRITICAL FIX FOR LOGGING ACCESS: Use Deterministic Timestamp
        const timestampProtobuf = ctx.stub.getTxTimestamp(); 
        
        let seconds; // NO TYPE ANNOTATION
        let nanos;   // NO TYPE ANNOTATION

        try {
            seconds = parseInt(timestampProtobuf.seconds.toString());
            nanos = parseInt(timestampProtobuf.nanos.toString());
        } catch (e) {
            seconds = timestampProtobuf.seconds;
            nanos = timestampProtobuf.nanos;
        }

        const timestampInMs = seconds * 1000 + nanos / 1000000;
        const deterministicTimestamp = new Date(timestampInMs).toISOString(); 


        // 4. Create the log entry
        const accessLogEntry = {
            action: 'VIEWED',
            user: invokerId,
            org: invokerMSP,
            timestamp: deterministicTimestamp, // FIXED HERE
        };

        // 5. Append the log entry
        record.accessHistory.push(accessLogEntry);

        // 6. Update the ledger state (This is the INVOKE transaction)
        await ctx.stub.putState(recordId, Buffer.from(JSON.stringify(record)));

        return `Access logged for record ${recordId} by ${invokerId}.`;
    }

    /* ============================================================
        DATA RETRIEVAL
        ============================================================ */

    async GetUser(ctx, userId) {
        const bytes = await ctx.stub.getState(userId);
        if (!bytes || bytes.length === 0) {
            throw new Error(`User ${userId} does not exist`);
        }
        return JSON.parse(bytes.toString());
    }
    async QueryRecordsByDoctor(ctx, doctorId) {
        const queryString = {
            selector: {
                docType: 'MedicalRecord',
                doctorId: doctorId
            }
        };
        return await this._getQueryResultForQueryString(ctx, JSON.stringify(queryString));
    }
    async QueryRecord(ctx, recordId) {
        const bytes = await ctx.stub.getState(recordId);
        if (!bytes || bytes.length === 0) {
            throw new Error(`Record ${recordId} does not exist`);
        }
        return JSON.parse(bytes.toString());
    }
    /* ============================================================
        DASHBOARD QUERIES (Add this to chaincode.js)
        ============================================================ */

    // Query ALL records for a specific patient
    async QueryRecordsByPatient(ctx, patientId) {
        const queryString = {
            selector: {
                docType: 'MedicalRecord',  // Matches Add function
                patientId: patientId       // Matches Add function
            }
        };
        return await this._getQueryResultForQueryString(ctx, JSON.stringify(queryString));
    }
    /* ============================================================
        ADMIN DASHBOARD QUERIES
        ============================================================ */

    // Used for "Doctor Management" Page
    async QueryAllDoctors(ctx) {
        const queryString = {
            selector: {
                docType: 'user',
                role: 'doctor'
            }
        };
        return await this._getQueryResultForQueryString(ctx, JSON.stringify(queryString));
    }

    // Used for "Hospital Management" Page
    async QueryAllHospitals(ctx) {
        const queryString = {
            selector: {
                docType: 'user',
                role: 'hospital'
            }
        };
        return await this._getQueryResultForQueryString(ctx, JSON.stringify(queryString));
    }

    // Helper function for queries
    async _getQueryResultForQueryString(ctx, queryString) {
        const resultsIterator = await ctx.stub.getQueryResult(queryString);
        const results = [];
        while (true) {
            const res = await resultsIterator.next();
            if (res.value && res.value.value.toString()) {
                results.push(JSON.parse(res.value.value.toString('utf8')));
            }
            if (res.done) {
                await resultsIterator.close();
                return JSON.stringify(results);
            }
        }
    }
    async RevokeConsent(ctx, patientId, providerId) {
        const invoker = await this.getInvokerId(ctx);

        if (invoker !== patientId) {
            throw new Error(`Only patient ${patientId} can revoke consent.`);
        }

        const patientBytes = await ctx.stub.getState(patientId);
        if (!patientBytes) throw new Error(`Patient ${patientId} not found.`);

        const patient = JSON.parse(patientBytes.toString());

        // Filter out the provider ID from the array
        const initialLength = patient.consents.length;
        patient.consents = patient.consents.filter(id => id !== providerId);

        if (patient.consents.length === initialLength) {
            throw new Error(`Provider ${providerId} did not have consent to begin with.`);
        }

        await ctx.stub.putState(patientId, Buffer.from(JSON.stringify(patient)));

        // Emit Event for Audit Log
        const eventPayload = Buffer.from(JSON.stringify({ patient: patientId, provider: providerId, status: "REVOKED" }));
        ctx.stub.setEvent('ConsentRevoked', eventPayload);

        return `Consent revoked for ${providerId}`;
    }
    async QueryAllPatients(ctx) {
        const queryString = {
            selector: {
                docType: 'user',
                role: 'patient'
            }
        };
        return await this._getQueryResultForQueryString(ctx, JSON.stringify(queryString));
    }
    async UpdateUser(ctx, userId, newName, newEmail) {
        // Access Check: Only Admins (Simplified check for brevity)
        const msp = await this.getInvokerOrg(ctx);
        if (msp !== "Org1MSP" && msp !== "Org2MSP") {
             throw new Error("Only admins can update users.");
        }

        const userBytes = await ctx.stub.getState(userId);
        if (!userBytes || userBytes.length === 0) {
            throw new Error(`User ${userId} does not exist`);
        }

        const user = JSON.parse(userBytes.toString());
        
        // Update fields
        user.name = newName;
        // In a real app, you might store email in the user object too
        user.email = newEmail; 

        await ctx.stub.putState(userId, Buffer.from(JSON.stringify(user)));
        return `User ${userId} updated successfully.`;
    }
async GetAssetHistory(ctx, assetId) {
        const iterator = await ctx.stub.getHistoryForKey(assetId);
        const history = [];

        while (true) {
            const res = await iterator.next();
            if (res.value) {
                const rawTime = res.value.timestamp;
                
                // 🛠️ FIX: Convert Fabric Timestamp to JavaScript Milliseconds
                let milliseconds;
                try {
                    // Handle Fabric's Long object for seconds
                    const seconds = rawTime.seconds.low || rawTime.seconds;
                    milliseconds = (seconds * 1000) + (rawTime.nanos / 1000000);
                } catch(e) {
                    milliseconds = Date.now(); // Fallback
                }

                const tx = {
                    TxId: res.value.tx_id,
                    Timestamp: milliseconds,   // Now it is a readable number!
                    IsDelete: res.value.is_delete,
                    Value: ""
                };

                if (!res.value.is_delete) {
                    // Send as string, let frontend JSON.parse it
                    tx.Value = res.value.value.toString('utf8');
                }
                
                history.push(tx);
            }

            if (res.done) {
                await iterator.close();
                return JSON.stringify(history);
            }
        }
    }
    async AssetExists(ctx, id) {
        const assetJSON = await ctx.stub.getState(id);
        return assetJSON && assetJSON.length > 0;
    }
    async QueryAllMedicalRecords(ctx) {
        const queryString = {
            selector: {
                docType: 'MedicalRecord'
            }
        };
        return await this._getQueryResultForQueryString(ctx, JSON.stringify(queryString));
    }
}


module.exports = MedChainContract;