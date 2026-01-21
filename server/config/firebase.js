import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : null;
let db;

if (FIREBASE_CONFIG && !admin.apps.length) {
    try {
        const firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(FIREBASE_CONFIG),
            databaseURL: `https://${FIREBASE_CONFIG.projectId}.firebaseio.com`
        });
        db = admin.firestore(firebaseApp);
        console.log('✅ Firestore initialized successfully.');
    } catch (e) {
        console.error('❌ Firebase Initialization Error:', e.message);
    }
} else if (admin.apps.length) {
    db = admin.firestore(admin.apps[0]);
} else {
    console.warn('❌ Firebase config not found.');
}

export { db, admin };