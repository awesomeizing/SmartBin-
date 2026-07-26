/**
 * SmartBin+ — Data Export
 * =============================================================================
 * CSV and PDF export for bins, alerts, history and the event timeline.
 *
 * The CSV column set deliberately matches the normalized schema in report
 * §3.1 — Timestamp, Bin ID, Distance_cm, Fill_Level_%, Bin_Status,
 * Message_Status — so an exported file is directly comparable with the data
 * format the report specifies.
 *
 * PDF generation uses the browser's own print pipeline rather than a library.
 * jsPDF plus autotable is roughly 400 KB for something `window.print()` does
 * natively, with better text rendering and no font embedding problems.
 *
 * @module js/utils/export
 */

import { schemaTimestamp, dateTime, escapeHtml } from './format.js';
import { PROJECT, DataSource, PROVENANCE_LABEL } from '../../config/constants.js';

/* ---------------------------------------------------------------------------
 * CSV
 * ------------------------------------------------------------------------- */

/**
 * Escape a value for CSV.
 *
 * Fields containing a comma, quote or newline must be quoted, with internal
 * quotes doubled. Bin labels and addresses are user-entered, so this is not
 * theoretical.
 *
 * @param {any} value
 * @returns {string}
 */
function csvCell(value) {
  if (value === null || value === undefined) return '';

  const str = String(value);
  if (!/[",\n\r]/.test(str)) return str;

  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Build a CSV string.
 *
 * @param {string[]} headers
 * @param {Array<Array<any>>} rows
 * @returns {string}
 */
export function toCsv(headers, rows) {
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ];

  // CRLF line endings: Excel on Windows handles these most predictably, and
  // this project will almost certainly be opened in Excel.
  return lines.join('\r\n');
}

/**
 * Trigger a file download.
 *
 * @param {string} content
 * @param {string} filename
 * @param {string} [mimeType='text/csv;charset=utf-8;']
 */
export function download(content, filename, mimeType = 'text/csv;charset=utf-8;') {
  // BOM so Excel recognises UTF-8 and does not mangle the ° and ₂ characters.
  const blob = new Blob(['﻿' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export the current bin state.
 *
 * @param {object[]} bins
 */
export function exportBinsCsv(bins) {
  const headers = [
    'Timestamp', 'Bin ID', 'Label', 'Zone', 'Address',
    'Distance_cm', 'Fill_Level_%', 'Bin_Status', 'Message_Status',
    'Battery_%', 'Signal_dBm', 'Uptime_s', 'Latitude', 'Longitude',
    'Depth_cm', 'Threshold_%', 'Device_State', 'Data_Source',
  ];

  const rows = bins.map((bin) => {
    const live = bin.live ?? {};
    const meta = bin.meta ?? {};

    return [
      live.timestamp ? schemaTimestamp(live.timestamp) : '',
      bin.binId,
      meta.label ?? '',
      meta.zone ?? '',
      meta.address ?? '',
      live.distanceCm ?? '',
      live.fillPct ?? '',
      live.binStatus ?? '',
      live.messageStatus ?? '',
      live.batteryPct ?? '',
      live.rssi ?? '',
      live.uptimeSec ?? '',
      meta.location?.lat ?? '',
      meta.location?.lng ?? '',
      meta.depthCm ?? '',
      meta.thresholdPct ?? '',
      bin.deviceState ?? '',
      // Provenance travels with the export. A spreadsheet of mixed real and
      // simulated readings with no way to tell them apart would be worse than
      // no export at all.
      PROVENANCE_LABEL[meta.source ?? DataSource.PLACEHOLDER] ?? '',
    ];
  });

  download(toCsv(headers, rows), filename('bins'));
}

/**
 * Export history for one bin, in the report §3.1 schema.
 *
 * @param {string} binId
 * @param {object[]} records
 */
export function exportHistoryCsv(binId, records) {
  const headers = ['Timestamp', 'Bin ID', 'Distance_cm', 'Fill_Level_%', 'Bin_Status'];

  const rows = records.map((record) => [
    schemaTimestamp(record.timestamp),
    binId,
    record.distanceCm ?? '',
    record.fillPct ?? '',
    record.binStatus ?? '',
  ]);

  download(toCsv(headers, rows), filename(`history-${binId}`));
}

/**
 * Export the alert log.
 * @param {object[]} alerts
 */
export function exportAlertsCsv(alerts) {
  const headers = [
    'Raised', 'Alert ID', 'Bin ID', 'Type', 'Severity', 'State',
    'Message', 'Acknowledged', 'Resolved', 'Resolution', 'Data_Source',
  ];

  const rows = alerts.map((alert) => [
    alert.raisedAt ? schemaTimestamp(alert.raisedAt) : '',
    alert.alertId ?? '',
    alert.binId ?? '',
    alert.type ?? '',
    alert.severity ?? '',
    alert.state ?? '',
    alert.message ?? '',
    alert.acknowledgedAt ? schemaTimestamp(alert.acknowledgedAt) : '',
    alert.resolvedAt ? schemaTimestamp(alert.resolvedAt) : '',
    alert.resolution ?? '',
    PROVENANCE_LABEL[alert.source ?? DataSource.PLACEHOLDER] ?? '',
  ]);

  download(toCsv(headers, rows), filename('alerts'));
}

/**
 * Export the event timeline.
 * @param {object[]} events
 */
export function exportEventsCsv(events) {
  const headers = ['Timestamp', 'Event ID', 'Kind', 'Bin ID', 'Detail', 'Actor'];

  const rows = events.map((event) => [
    schemaTimestamp(event.timestamp),
    event.id ?? '',
    event.kind ?? '',
    event.binId ?? '',
    event.detail ?? '',
    event.actor ?? '',
  ]);

  download(toCsv(headers, rows), filename('events'));
}

/* ---------------------------------------------------------------------------
 * PDF
 * ------------------------------------------------------------------------- */

/**
 * Generate a PDF report via the browser print pipeline.
 *
 * Opens a styled document in a new window and calls print. The user chooses
 * "Save as PDF" in the print dialogue. Light-themed deliberately — a dark
 * report wastes toner and reads badly on paper.
 *
 * @param {object} data
 * @param {object[]} data.bins
 * @param {object[]} data.alerts
 * @param {object|null} data.route
 * @param {object} data.summary
 */
export function exportPdfReport({ bins, alerts, route, summary }) {
  const win = window.open('', '_blank', 'width=900,height=700');

  if (!win) {
    alert('Please allow pop-ups for this site to generate the PDF report.');
    return;
  }

  win.document.write(buildReportHtml({ bins, alerts, route, summary }));
  win.document.close();

  // Give the browser a moment to lay the document out before printing;
  // calling print() immediately can produce a blank first page.
  win.onload = () => setTimeout(() => win.print(), 300);
}

/**
 * @returns {string}
 */
function buildReportHtml({ bins, alerts, route, summary }) {
  const generated = dateTime(Date.now());

  const provenance = bins.reduce((acc, bin) => {
    const source = bin.meta?.source ?? DataSource.PLACEHOLDER;
    acc[source] = (acc[source] ?? 0) + 1;
    return acc;
  }, {});

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>SmartBin+ Operations Report</title>
<style>
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'DM Sans', -apple-system, system-ui, sans-serif;
    font-size: 10pt; line-height: 1.5; color: #0F172A; margin: 0;
  }
  h1 { font-size: 20pt; letter-spacing: -0.5pt; margin: 0 0 4pt; }
  h2 {
    font-size: 11pt; margin: 20pt 0 8pt; padding-bottom: 4pt;
    border-bottom: 1px solid #CBD5E1; text-transform: uppercase;
    letter-spacing: 0.6pt; color: #475569;
  }
  .sub { color: #64748B; font-size: 9pt; margin-bottom: 16pt; }
  .meta { display: flex; gap: 24pt; flex-wrap: wrap; margin-bottom: 4pt; }
  .meta div { font-size: 8.5pt; color: #64748B; }
  .meta strong { display: block; color: #0F172A; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 6pt; }
  th, td {
    text-align: left; padding: 5pt 6pt; font-size: 8.5pt;
    border-bottom: 1px solid #E2E8F0;
  }
  th {
    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5pt;
    color: #64748B; border-bottom: 1px solid #94A3B8;
  }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .tag {
    display: inline-block; padding: 1pt 5pt; font-size: 7pt;
    border-radius: 3pt; border: 1px solid currentColor;
  }
  .t-green { color: #15803D; } .t-amber { color: #B45309; }
  .t-red { color: #B91C1C; } .t-grey { color: #64748B; }
  .note {
    margin-top: 8pt; padding: 8pt 10pt; background: #F8FAFC;
    border-left: 2px solid #94A3B8; font-size: 8.5pt; color: #475569;
  }
  footer {
    margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #CBD5E1;
    font-size: 8pt; color: #94A3B8;
  }
</style></head><body>

<h1>SmartBin+ Operations Report</h1>
<div class="sub">
  ${escapeHtml(PROJECT.title)}<br>
  ${escapeHtml(PROJECT.courseCode)} · Group ${escapeHtml(PROJECT.groupNo)} ·
  ${escapeHtml(PROJECT.institute)}
</div>

<div class="meta">
  <div><strong>${escapeHtml(generated)}</strong>Generated</div>
  <div><strong>${bins.length}</strong>Bins registered</div>
  <div><strong>${summary?.critical ?? 0}</strong>Requiring collection</div>
  <div><strong>${alerts.filter((a) => a.state !== 'resolved').length}</strong>Open alerts</div>
</div>

<div class="note">
  <strong>Data provenance.</strong>
  ${provenance.device ?? 0} bin(s) reporting from physical devices,
  ${provenance.simulated ?? 0} simulated,
  ${provenance.placeholder ?? 0} registered but awaiting hardware.
  Simulated readings are produced by the Simulation Engine and are not sensor
  measurements.
</div>

<h2>Bin Status</h2>
<table>
  <thead><tr>
    <th>Bin ID</th><th>Label</th><th>Zone</th>
    <th class="num">Fill</th><th class="num">Distance</th>
    <th>Status</th><th>Source</th><th>Last reading</th>
  </tr></thead>
  <tbody>
    ${bins.map((bin) => {
      const live = bin.live ?? {};
      const meta = bin.meta ?? {};
      const fill = live.fillPct;
      const tone = !Number.isFinite(fill) ? 't-grey'
                 : fill >= 80 ? 't-red' : fill >= 51 ? 't-amber' : 't-green';

      return `<tr>
        <td>${escapeHtml(bin.binId)}</td>
        <td>${escapeHtml(meta.label ?? '')}</td>
        <td>${escapeHtml(meta.zone ?? '')}</td>
        <td class="num ${tone}">${Number.isFinite(fill) ? fill.toFixed(1) + '%' : '—'}</td>
        <td class="num">${Number.isFinite(live.distanceCm) ? live.distanceCm.toFixed(1) + ' cm' : '—'}</td>
        <td class="${tone}">${escapeHtml(live.binStatus ?? '—')}</td>
        <td><span class="tag t-grey">${escapeHtml(PROVENANCE_LABEL[meta.source ?? DataSource.PLACEHOLDER] ?? '')}</span></td>
        <td>${live.timestamp ? escapeHtml(dateTime(live.timestamp)) : '—'}</td>
      </tr>`;
    }).join('')}
  </tbody>
</table>

${route ? `
<h2>Route Optimisation</h2>
<div class="meta">
  <div><strong>${route.optimizedKm} km</strong>Optimised route</div>
  <div><strong>${route.traditionalKm} km</strong>Traditional round</div>
  <div><strong>${route.savedKm} km</strong>Distance saved</div>
  <div><strong>${route.fuelSavedL} L</strong>Fuel saved</div>
  <div><strong>${route.co2SavedKg} kg</strong>CO₂ avoided</div>
</div>
<div class="note">
  Distances are straight-line (haversine); actual road distance will be higher.
  Fuel and CO₂ figures are derived from assumed constants —
  ${escapeHtml(route.meta?.assumptions?.fuelEconomy ?? '')} vehicle economy and
  ${escapeHtml(route.meta?.assumptions?.emissionFactor ?? '')} — not measured values.
</div>` : ''}

<h2>Open Alerts</h2>
${alerts.filter((a) => a.state !== 'resolved').length === 0
  ? '<p style="font-size:9pt;color:#64748B">No open alerts.</p>'
  : `<table>
      <thead><tr>
        <th>Raised</th><th>Bin</th><th>Type</th><th>Severity</th><th>Message</th>
      </tr></thead>
      <tbody>
        ${alerts.filter((a) => a.state !== 'resolved').map((alert) => `
          <tr>
            <td>${alert.raisedAt ? escapeHtml(dateTime(alert.raisedAt)) : '—'}</td>
            <td>${escapeHtml(alert.binId ?? '—')}</td>
            <td>${escapeHtml(alert.type ?? '')}</td>
            <td class="${alert.severity === 'critical' ? 't-red' : 't-amber'}">
              ${escapeHtml(alert.severity ?? '')}
            </td>
            <td>${escapeHtml(alert.message ?? '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`}

<footer>
  Generated by SmartBin+ · ${escapeHtml(PROJECT.phase)} ·
  ${escapeHtml(PROJECT.institute)}, ${escapeHtml(PROJECT.academicYear)}<br>
  Fill-level bands per project report §3.1: Empty 0–50%, Half 51–79%, Full 80–100%.
</footer>

</body></html>`;
}

/**
 * Timestamped filename.
 * @param {string} prefix
 * @param {string} [extension='csv']
 * @returns {string}
 */
function filename(prefix, extension = 'csv') {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
                `-${pad(now.getHours())}${pad(now.getMinutes())}`;

  return `smartbin-${prefix}-${stamp}.${extension}`;
}

export default {
  toCsv, download,
  exportBinsCsv, exportHistoryCsv, exportAlertsCsv, exportEventsCsv,
  exportPdfReport,
};
