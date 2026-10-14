import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminDb, isServerFirebaseConfigured, verifyFirebaseRequest } from './_lib/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isServerFirebaseConfigured()) {
    return res.status(503).json({ error: 'Firebase server configuration is required.' });
  }

  const user = await verifyFirebaseRequest(req);
  if (!user) return res.status(401).json({ error: 'Sign in again to manage notification settings.' });

  try {
    const db = getAdminDb();
    const subscriptionRef = db.ref(`notificationSubscriptions/${user.uid}`);

    if (req.method === 'GET') {
      const snapshot = await subscriptionRef.once('value');
      return res.status(200).json({
        emailAlerts: snapshot.child('emailAlerts').val() === true,
        emailVerified: user.email_verified === true,
        emailDeliveryConfigured: Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL),
      });
    }

    if (typeof req.body?.emailAlerts !== 'boolean') {
      return res.status(400).json({ error: 'emailAlerts must be true or false.' });
    }
    if (req.body.emailAlerts && user.email_verified !== true) {
      return res.status(403).json({ error: 'Verify this email address before enabling alert emails.' });
    }

    await subscriptionRef.update({
      emailAlerts: req.body.emailAlerts,
      updatedAt: Date.now(),
    });
    return res.status(200).json({ emailAlerts: req.body.emailAlerts });
  } catch (error) {
    console.error('[notification-settings] request failed', error instanceof Error ? error.message : 'unknown error');
    return res.status(500).json({ error: 'Unable to update notification settings.' });
  }
}
