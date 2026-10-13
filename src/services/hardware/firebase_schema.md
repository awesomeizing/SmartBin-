# SmartBin+ ESP32 Firebase Schema

This document outlines the exact NoSQL schema used by the SmartBin+ platform. ESP32 devices must adhere to this structure when pushing data to Firebase Realtime Database.

## Root Paths

- `/bins/{binId}`: The core device object.
- `/logs/{binId}`: Connection logs, errors, and system events.
- `/alerts`: Global alert registry (can be written to by devices or backend services).

---

## 1. The `Bin` Object
Path: `/bins/{binId}`

The bin object is strictly separated into `meta`, `live`, `health`, and `reserved` nodes to optimize listener bandwidth.

### `meta` (Static Information)
Written once during provisioning. ESP32 usually only reads this, but may write its MAC address or firmware version here on first boot.
```json
{
  "binId": "BIN-01",          // Real hardware node ID: BIN-01, BIN-02, BIN-03, BIN-04
  "label": "Bin 1",           // Human-readable name
  "zone": "Zone-A",           // Collection zone
  "address": "Main Entrance, Global Academy of Technology",
  "location": {
    "lat": 12.9606,
    "lng": 77.4900,
    "source": "manual"
  },
  "depthCm": 11,              // Calibration: 11 cm (EMPTY) down to 3 cm (FULL)
  "thresholdPct": 80,         // When to trigger a FULL alert & turn LED on
  "capacity": 20,             // Total volume in liters
  "source": "device",         // "device" | "simulated"
  "installedAt": 1715623000000
}
```

### `live` (Real-time Telemetry)
Written by the ESP32 every 30–60 seconds (or immediately on threshold trigger).
```json
{
  "distanceCm": 7.0,          // Raw ultrasonic reading (11cm = 0%, 3cm = 100%)
  "fillPct": 50,              // Calculated: ((11 - distanceCm) / (11 - 3)) * 100
  "binStatus": "Half",        // "Empty" (0–49%), "Half" (50–79%), "Full" (80–100%)
  "messageStatus": "Delivered",
  "rssi": -65,                // WiFi signal strength in dBm
  "batteryPct": 92,           // Battery 0–100%
  "uptimeSec": 3600,          // Seconds since last ESP reset
  "firmware": "v2.1.4",       // Current firmware version
  "timestamp": 1715623050000  // Epoch ms of reading
}
```

### `health` (Diagnostics)
Updated by ESP32 heartbeat or daily self-test.
```json
{
  "sensorOk": true,           // HC-SR04/JSN-SR04T status
  "wifiOk": true,             // Connection status
  "ledOk": true,              // Indicator LED status
  "buzzerOk": true,           // Audio alert status
  "oledOk": true,             // Screen status
  "healthScore": 100,         // 0-100 based on hardware health
  "lastMaintenance": null     // Epoch ms of last physical repair
}
```

### `reserved` (Additional Sensors)
Used for bins equipped with environmental sensors.
```json
{
  "temperatureC": 28.5,       // DHT11/22 or DS18B20
  "humidityPct": 60.2,        // DHT11/22
  "gasPpm": 120               // MQ2/MQ135 VOC/Methane level
}
```

---

## 2. Device Logs
Path: `/logs/{binId}/{pushId}`

The ESP32 can `push` events here for debugging.
```json
{
  "type": "boot",             // "boot", "error", "ota_start", "ota_success"
  "message": "Cold boot from deep sleep",
  "timestamp": 1715623000000
}
```

---

## ESP32 Implementation Guidelines

1. **Deep Sleep**: Wake every X minutes to push to `/bins/{binId}/live`.
2. **Interrupts**: If motion or sudden fill is detected, wake immediately and push.
3. **Data Usage**: Do NOT fetch the entire `/bins` object. Only push to `live` and `health`. Use `PATCH` or specific path updates (`/bins/{binId}/live/fillPct`).
4. **Time Sync**: Use NTP on boot to ensure `timestamp` is accurate. If NTP fails, omit the timestamp and rely on the server timestamp `ServerValue.TIMESTAMP`.
