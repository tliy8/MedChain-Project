import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
//Routes
import authRoutes from './routes/authRoutes.js';
import consentRoutes from './routes/consentRoutes.js'
import recordRoutes from './routes/recordRoutes.js'
import patientRoutes from './routes/patientRoutes.js';
import doctorRoutes from './routes/doctorRoutes.js';
import adminRoutes from './routes/adminRoutes.js'

//services
import { startNetworkListener } from './services/eventService.js';

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// GLOBAL CONFIG
const port = process.env.PORT

// MIDDLEWARE
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// ROUTES
app.use('/api/user', authRoutes);
app.use('/api/auth', authRoutes); 
app.use('/api/consent',consentRoutes);
app.use('/api/record',recordRoutes);
app.use('/api/patient',patientRoutes);
app.use('/api/doctor',doctorRoutes);
app.use('/api/admin',adminRoutes);

// START SERVER
httpServer.listen(port, () => {
    console.log(`✅ MedChain Backend Server listening on port ${port}`);
    startNetworkListener(io);
});