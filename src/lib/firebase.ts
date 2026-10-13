import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const env = import.meta.env;
export const firebaseConfig = { apiKey: env.VITE_FIREBASE_API_KEY || 'REPLACE_ME', authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'REPLACE_ME.firebaseapp.com', databaseURL: env.VITE_FIREBASE_DATABASE_URL || 'https://REPLACE_ME.firebasedatabase.app', projectId: env.VITE_FIREBASE_PROJECT_ID || 'REPLACE_ME', storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'REPLACE_ME.appspot.com', messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'REPLACE_ME', appId: env.VITE_FIREBASE_APP_ID || 'REPLACE_ME' };
export const IS_FIREBASE_CONFIGURED = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_DATABASE_URL && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
export const IS_DEMO_MODE = env.VITE_SMARTBIN_DEMO_MODE === 'true';
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
