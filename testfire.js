import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

const FIREBASE_CONFIG = JSON.parse(process.env.FIREBASE_CONFIG);

const app = admin.initializeApp({
  credential: admin.credential.cert(FIREBASE_CONFIG)
});

const db = admin.firestore(app);

async function test() {
  const docRef = db.collection('test').doc('hello');
  await docRef.set({ message: 'Hello Firestore!' });
  const doc = await docRef.get();
  console.log(doc.data());
}

test();
