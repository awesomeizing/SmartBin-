type RecordValue = Record<string, unknown>;

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Prevent spreadsheet formula execution when users open an export.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const COLUMNS = [
  'recordType', 'binId', 'label', 'zone', 'address', 'latitude', 'longitude',
  'depthCm', 'thresholdPct', 'capacityLiters', 'installedAt', 'source', 'deviceId',
  'distanceCm', 'fillPct', 'binStatus', 'batteryPct', 'rssi', 'uptimeSec',
  'firmware', 'temperatureC', 'humidityPct', 'gasPpm', 'sensorOk', 'wifiOk',
  'healthScore', 'timestamp',
];

/** Build an export containing each bin's latest reading and saved history. */
export function buildTelemetryCsv(
  binsValue: unknown,
  historyValue: unknown = {},
): string {
  const bins = (binsValue && typeof binsValue === 'object' ? binsValue : {}) as Record<string, RecordValue>;
  const histories = (historyValue && typeof historyValue === 'object' ? historyValue : {}) as Record<string, RecordValue>;
  const rows: unknown[][] = [COLUMNS];

  for (const [binId, rawBin] of Object.entries(bins)) {
    const bin = rawBin && typeof rawBin === 'object' ? rawBin : {};
    const meta = (bin.meta && typeof bin.meta === 'object' ? bin.meta : {}) as RecordValue;
    const live = (bin.live && typeof bin.live === 'object' ? bin.live : {}) as RecordValue;
    const health = (bin.health && typeof bin.health === 'object' ? bin.health : {}) as RecordValue;
    const reserved = (bin.reserved && typeof bin.reserved === 'object' ? bin.reserved : {}) as RecordValue;
    const deviceId = meta.deviceId ?? '';

    if (Object.keys(live).length > 0) {
      rows.push([
        'latest', binId, meta.label, meta.zone, meta.address,
        (meta.location as RecordValue | undefined)?.lat,
        (meta.location as RecordValue | undefined)?.lng,
        meta.depthCm, meta.thresholdPct, meta.capacity, meta.installedAt, meta.source, deviceId,
        live.distanceCm, live.fillPct, live.binStatus, live.batteryPct,
        live.rssi, live.uptimeSec, live.firmware, reserved.temperatureC,
        reserved.humidityPct, reserved.gasPpm, health.sensorOk, health.wifiOk,
        health.healthScore, live.timestamp,
      ]);
    }

    const records = histories[binId] && typeof histories[binId] === 'object'
      ? histories[binId]
      : {};
    for (const record of Object.values(records)) {
      if (!record || typeof record !== 'object') continue;
      const history = record as RecordValue;
      rows.push([
        'history', binId, meta.label, meta.zone, meta.address,
        (meta.location as RecordValue | undefined)?.lat,
        (meta.location as RecordValue | undefined)?.lng,
        meta.depthCm, meta.thresholdPct, meta.capacity, meta.installedAt, meta.source, deviceId,
        history.distanceCm, history.fillPct, history.binStatus, '', '', '',
        '', '', '', '', '', '', '', history.timestamp,
      ]);
    }
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
