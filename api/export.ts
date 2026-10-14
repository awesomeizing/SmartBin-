import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminDb, isServerFirebaseConfigured, verifyFirebaseRequest } from './_lib/firebaseAdmin.js';
import { buildTelemetryCsv } from './_lib/telemetryCsv.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isServerFirebaseConfigured()) {
    return res.status(503).json({ error: 'Firebase server configuration is required.' });
  }

  const user = await verifyFirebaseRequest(req);
  if (!user) return res.status(401).json({ error: 'Sign in again to export telemetry.' });

  try {
    const db = getAdminDb();
    const [binsSnapshot, historySnapshot] = await Promise.all([
      db.ref('bins').once('value'),
      db.ref('history').once('value'),
    ]);
    const csv = buildTelemetryCsv(binsSnapshot.val(), historySnapshot.val());
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="smartbin-telemetry-${date}.csv"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    console.error('[export] telemetry export failed', error instanceof Error ? error.message : 'unknown error');
    return res.status(500).json({ error: 'Unable to export telemetry data.' });
  }
}
