import type { Database } from 'firebase-admin/database';
import { getAdminAuth } from './firebaseAdmin.js';
import { buildTelemetryCsv } from './telemetryCsv.js';

export interface BinAlertEmail {
  id: string;
  binId: string;
  binLabel: string;
  severity: string;
  message: string;
  fillPct: number;
  distanceCm: number;
  raisedAt: number;
}

export interface EmailDispatchResult {
  sent: number;
  failed: number;
  skipped: string | null;
}

const EMAIL_API_URL = 'https://api.resend.com/emails';

/** Notify verified Firebase accounts that explicitly enabled email alerts. */
export async function emailAlertSubscribers(
  db: Database,
  alert: BinAlertEmail,
): Promise<EmailDispatchResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL;
  if (!apiKey || !from) return { sent: 0, failed: 0, skipped: 'email_provider_not_configured' };

  const subscriptions = await db.ref('notificationSubscriptions').once('value');
  const optedInUids: string[] = [];
  subscriptions.forEach((child) => {
    if (child.child('emailAlerts').val() === true && child.key) optedInUids.push(child.key);
  });
  if (optedInUids.length === 0) return { sent: 0, failed: 0, skipped: 'no_email_subscribers' };

  const [binsSnapshot, historySnapshot] = await Promise.all([
    db.ref('bins').once('value'),
    db.ref('history').once('value'),
  ]);
  const attachment = buildTelemetryCsv(binsSnapshot.val(), historySnapshot.val());
  const csvBase64 = Buffer.from(attachment, 'utf8').toString('base64');
  const auth = getAdminAuth();
  let sent = 0;
  let failed = 0;

  for (const uid of optedInUids) {
    try {
      const user = await auth.getUser(uid);
      if (!user.email || !user.emailVerified) continue;

      const response = await fetch(EMAIL_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `smartbin-alert-${alert.id}-${uid}`,
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: `SmartBin alert: ${alert.binLabel} needs collection`,
          text: [
            alert.message,
            `Fill level: ${alert.fillPct}%`,
            `Sensor distance: ${alert.distanceCm} cm`,
            `Raised: ${new Date(alert.raisedAt).toISOString()}`,
            '',
            'The attached CSV contains the latest readings for all connected bins and the stored telemetry history.',
          ].join('\n'),
          html: `<h2>${escapeHtml(alert.binLabel)} needs collection</h2><p>${escapeHtml(alert.message)}</p><p>Fill level: ${alert.fillPct}%<br>Sensor distance: ${alert.distanceCm} cm<br>Raised: ${new Date(alert.raisedAt).toISOString()}</p><p>The attached CSV contains the latest readings for all connected bins and the stored telemetry history.</p>`,
          attachments: [{
            filename: `smartbin-telemetry-${alert.binId}.csv`,
            content: csvBase64,
            content_type: 'text/csv',
          }],
        }),
      });

      if (response.ok) {
        sent += 1;
      } else {
        failed += 1;
        console.error('[alerts] email provider rejected a notification', response.status);
      }
    } catch (error) {
      failed += 1;
      console.error('[alerts] unable to deliver a notification', error instanceof Error ? error.message : 'unknown error');
    }
  }

  return { sent, failed, skipped: null };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}
