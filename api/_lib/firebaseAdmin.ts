import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import type { VercelRequest } from '@vercel/node';

const ADMIN_APP_NAME = 'smartbin-server';

export function isServerFirebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_DATABASE_URL &&
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  );
}

export function getFirebaseAdminApp() {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) return existing;

  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!databaseURL || !serviceAccountJson) {
    throw new Error('Firebase server credentials are not configured');
  }

  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(serviceAccountJson) as Record<string, unknown>;
  } catch {
    throw new Error('Firebase service account JSON is invalid');
  }

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Firebase service account JSON is incomplete');
  }

  return initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
    databaseURL,
  }, ADMIN_APP_NAME);
}

export function getAdminDb() {
  return getDatabase(getFirebaseAdminApp());
}

export function getAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export async function verifyFirebaseRequest(req: VercelRequest) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+(.+)$/i)
    : null;

  if (!match) return null;
  try {
    return await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return null;
  }
}
