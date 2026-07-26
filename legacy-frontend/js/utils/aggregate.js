/**
 * SmartBin+ — History Aggregation
 * =============================================================================
 * Buckets raw history records into the series the analytics charts consume.
 *
 * A note on scale: this deployment has four bins. Fleet-wide averages across
 * four sensors are statistically thin, so the analytics view leans on per-bin
 * comparison and time-series depth rather than aggregate means that would
 * need hundreds of bins to mean anything. The aggregation here supports both,
 * but the UI favours the former.
 *
 * @module js/utils/aggregate
 */

import { THRESHOLDS } from '../../config/app.config.js';

/**
 * @typedef {Object} HistoryRecord
 * @property {number} fillPct
 * @property {number} distanceCm
 * @property {string} binStatus
 * @property {number} timestamp
 */

/**
 * Bucket records into fixed intervals and average the fill level in each.
 *
 * Empty buckets return null rather than 0, so Chart.js draws a gap instead of
 * a line dropping to the floor. A gap says "no data"; a zero says "the bin
 * was empty", and they are not the same claim.
 *
 * @param {HistoryRecord[]} records
 * @param {object} options
 * @param {number} options.bucketMs   Bucket width.
 * @param {number} options.buckets    Number of buckets, ending now.
 * @param {(ts: number) => string} options.labelFn
 * @returns {{labels: string[], values: Array<number|null>, counts: number[]}}
 */
export function bucketHistory(records, { bucketMs, buckets, labelFn }) {
  const now = Date.now();
  const start = now - buckets * bucketMs;

  /** @type {Array<{sum: number, count: number}>} */
  const bins = Array.from({ length: buckets }, () => ({ sum: 0, count: 0 }));

  for (const record of records) {
    if (!Number.isFinite(record.timestamp) || !Number.isFinite(record.fillPct)) continue;
    if (record.timestamp < start) continue;

    const index = Math.min(
      buckets - 1,
      Math.floor((record.timestamp - start) / bucketMs)
    );

    if (index < 0) continue;

    bins[index].sum += record.fillPct;
    bins[index].count++;
  }

  return {
    labels: bins.map((_, i) => labelFn(start + i * bucketMs + bucketMs / 2)),
    values: bins.map((b) => (b.count > 0 ? Math.round((b.sum / b.count) * 10) / 10 : null)),
    counts: bins.map((b) => b.count),
  };
}

/**
 * Hourly series for the last 24 hours.
 * @param {HistoryRecord[]} records
 * @returns {{labels: string[], values: Array<number|null>, counts: number[]}}
 */
export function dailySeries(records) {
  return bucketHistory(records, {
    bucketMs: 60 * 60 * 1000,
    buckets: 24,
    labelFn: (ts) => new Date(ts).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    }),
  });
}

/**
 * Daily series for the last 7 days.
 * @param {HistoryRecord[]} records
 */
export function weeklySeries(records) {
  return bucketHistory(records, {
    bucketMs: 24 * 60 * 60 * 1000,
    buckets: 7,
    labelFn: (ts) => new Date(ts).toLocaleDateString('en-IN', { weekday: 'short' }),
  });
}

/**
 * Daily series for the last 30 days.
 * @param {HistoryRecord[]} records
 */
export function monthlySeries(records) {
  return bucketHistory(records, {
    bucketMs: 24 * 60 * 60 * 1000,
    buckets: 30,
    labelFn: (ts) => new Date(ts).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short',
    }),
  });
}

/**
 * Count collection events per bucket.
 *
 * A collection is inferred from a large drop in fill level between
 * consecutive readings — the signature of a bin being emptied. Threshold is
 * generous (30 points) so ordinary settling and compaction are not
 * miscounted as collections.
 *
 * @param {HistoryRecord[]} records  Chronological.
 * @param {number} [dropThreshold=30]
 * @returns {Array<{timestamp: number, from: number, to: number}>}
 */
export function detectCollections(records, dropThreshold = 30) {
  const collections = [];

  for (let i = 1; i < records.length; i++) {
    const previous = records[i - 1].fillPct;
    const current = records[i].fillPct;

    if (Number.isFinite(previous) && Number.isFinite(current)) {
      if (previous - current >= dropThreshold) {
        collections.push({
          timestamp: records[i].timestamp,
          from: previous,
          to: current,
        });
      }
    }
  }

  return collections;
}

/**
 * Collections per day over a window.
 *
 * @param {HistoryRecord[]} records
 * @param {number} [days=7]
 * @returns {{labels: string[], values: number[]}}
 */
export function collectionsPerDay(records, days = 7) {
  const collections = detectCollections(records);
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.now() - days * dayMs;

  const counts = new Array(days).fill(0);

  for (const collection of collections) {
    if (collection.timestamp < start) continue;
    const index = Math.min(days - 1, Math.floor((collection.timestamp - start) / dayMs));
    if (index >= 0) counts[index]++;
  }

  return {
    labels: Array.from({ length: days }, (_, i) =>
      new Date(start + i * dayMs).toLocaleDateString('en-IN', { weekday: 'short' })
    ),
    values: counts,
  };
}

/**
 * Time spent in each fill band, as a proportion of readings.
 *
 * Answers a question a fleet average cannot: is this bin usually near
 * capacity, or does it spike occasionally? Two bins with identical mean fill
 * can have very different collection needs.
 *
 * @param {HistoryRecord[]} records
 * @returns {{empty: number, half: number, full: number, total: number}}
 */
export function timeInBands(records) {
  const result = { empty: 0, half: 0, full: 0, total: 0 };

  for (const record of records) {
    if (!Number.isFinite(record.fillPct)) continue;

    result.total++;
    if (record.fillPct <= THRESHOLDS.BAND_EMPTY_MAX) result.empty++;
    else if (record.fillPct <= THRESHOLDS.BAND_HALF_MAX) result.half++;
    else result.full++;
  }

  return result;
}

/**
 * Mean fill rate in percentage points per hour.
 *
 * Only rising intervals are counted; a drop is a collection, not negative
 * accumulation, and averaging it in would understate how fast the bin fills.
 *
 * @param {HistoryRecord[]} records
 * @returns {number|null}
 */
export function meanFillRate(records) {
  const rates = [];

  for (let i = 1; i < records.length; i++) {
    const deltaPct = records[i].fillPct - records[i - 1].fillPct;
    const deltaHours = (records[i].timestamp - records[i - 1].timestamp) / 3_600_000;

    if (deltaPct > 0 && deltaHours > 0 && deltaHours < 24) {
      rates.push(deltaPct / deltaHours);
    }
  }

  if (rates.length === 0) return null;

  return Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100;
}

/**
 * Per-zone aggregation, for the heatmap.
 *
 * @param {object[]} bins
 * @returns {Array<{zone: string, bins: object[], meanFill: number, maxFill: number, criticalCount: number}>}
 */
export function aggregateByZone(bins) {
  const zones = new Map();

  for (const bin of bins) {
    const zone = bin.meta?.zone ?? 'Unzoned';
    if (!zones.has(zone)) zones.set(zone, []);
    zones.get(zone).push(bin);
  }

  return [...zones.entries()]
    .map(([zone, zoneBins]) => {
      const fills = zoneBins
        .map((b) => b.live?.fillPct)
        .filter(Number.isFinite);

      return {
        zone,
        bins: zoneBins,
        meanFill: fills.length
          ? Math.round((fills.reduce((a, b) => a + b, 0) / fills.length) * 10) / 10
          : 0,
        maxFill: fills.length ? Math.max(...fills) : 0,
        criticalCount: fills.filter((f) => f >= THRESHOLDS.ALERT_PCT).length,
        reportingCount: fills.length,
      };
    })
    .sort((a, b) => b.meanFill - a.meanFill);
}

/**
 * Alert response times bucketed for a distribution chart.
 *
 * @param {object[]} alerts
 * @returns {{labels: string[], values: number[]}}
 */
export function responseTimeDistribution(alerts) {
  const buckets = [
    { label: '< 5 min',   max: 5 },
    { label: '5–15 min',  max: 15 },
    { label: '15–60 min', max: 60 },
    { label: '1–4 hr',    max: 240 },
    { label: '> 4 hr',    max: Infinity },
  ];

  const counts = new Array(buckets.length).fill(0);

  for (const alert of alerts) {
    if (!Number.isFinite(alert.raisedAt) || !Number.isFinite(alert.acknowledgedAt)) continue;

    const minutes = (alert.acknowledgedAt - alert.raisedAt) / 60000;
    const index = buckets.findIndex((b) => minutes < b.max);
    counts[index === -1 ? buckets.length - 1 : index]++;
  }

  return { labels: buckets.map((b) => b.label), values: counts };
}

export default {
  bucketHistory, dailySeries, weeklySeries, monthlySeries,
  detectCollections, collectionsPerDay, timeInBands, meanFillRate,
  aggregateByZone, responseTimeDistribution,
};
