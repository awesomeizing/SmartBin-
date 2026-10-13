# SmartBin+ — Production Deployment Checklist

## Prerequisites

- [ ] Firebase project created with **Realtime Database** enabled
- [ ] Vercel account connected to your GitHub repository
- [ ] ESP32 hardware assembled and wired per firmware/smartbin_4bin/README.md
- [ ] Arduino IDE installed with ESP32 board package and required libraries

---

## Step 1 — Firebase Setup

1. Open [Firebase Console](https://console.firebase.google.com) → your project.
2. **Authentication** → Sign-in method → Enable **Email/Password**.
3. **Realtime Database** → Create database → Start in **test mode** (lock down with rules after initial test).
4. Import `firebase-rules.json` to set production-safe security rules.
5. In **Project Settings → General → Your apps** → copy all SDK config values.

---

## Step 2 — Vercel Environment Variables

In Vercel Dashboard → Project → Settings → Environment Variables, add **all** of the following:

### Frontend variables (exposed to browser)

| Variable                             | Value source                                  |
|--------------------------------------|-----------------------------------------------|
| `VITE_FIREBASE_API_KEY`              | Firebase SDK config → `apiKey`                |
| `VITE_FIREBASE_AUTH_DOMAIN`          | Firebase SDK config → `authDomain`            |
| `VITE_FIREBASE_DATABASE_URL`         | Firebase SDK config → `databaseURL`           |
| `VITE_FIREBASE_PROJECT_ID`           | Firebase SDK config → `projectId`             |
| `VITE_FIREBASE_STORAGE_BUCKET`       | Firebase SDK config → `storageBucket`         |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`  | Firebase SDK config → `messagingSenderId`     |
| `VITE_FIREBASE_APP_ID`               | Firebase SDK config → `appId`                 |
| `VITE_SMARTBIN_DEMO_MODE`            | `false`                                       |

### Server-side variables (NOT exposed to browser)

| Variable                      | Value source                                                                          |
|-------------------------------|---------------------------------------------------------------------------------------|
| `FIREBASE_DATABASE_URL`       | Firebase Realtime Database URL (same as `VITE_FIREBASE_DATABASE_URL`)                |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Project Settings → Service Accounts → Generate new private key (paste entire JSON as one line) |
| `IOT_DEVICE_API_KEY`          | A strong random secret string — must match `DEVICE_API_KEY` in ESP32 firmware        |

---

## Step 3 — Redeploy Vercel

After setting all environment variables:

```bash
vercel --prod
```

Or trigger a redeploy from the Vercel dashboard.

---

## Step 4 — Flash ESP32 Firmware

1. Open `firmware/smartbin_4bin/smartbin_4bin.ino` in Arduino IDE.
2. Edit the three config lines at the top:
   ```cpp
   #define WIFI_SSID       "YourNetworkName"
   #define WIFI_PASSWORD   "YourPassword"
   #define DEVICE_API_KEY  "same-secret-as-IOT_DEVICE_API_KEY-on-server"
   #define TELEMETRY_URL   "https://your-app.vercel.app/api/telemetry"
   ```
3. Select **Board → ESP32 Dev Module**.
4. Upload.
5. Open Serial Monitor at **115200 baud**.

---

## Step 5 — Verification

1. Open `https://your-app.vercel.app/bins`.
2. Confirm all four bins appear:
   - [ ] BIN-01 — ESP32-SMARTBIN-01
   - [ ] BIN-02 — ESP32-SMARTBIN-02
   - [ ] BIN-03 — ESP32-SMARTBIN-03
   - [ ] BIN-04 — ESP32-SMARTBIN-04
3. Confirm source badge shows **LIVE IoT** (not DEMO DATA).
4. Confirm **ONLINE** status for each bin.
5. Place an object near a sensor — confirm Distance and Fill % change within 60 seconds.
6. Remove all objects — confirm Fill % drops.
7. Hold hand 3 cm from sensor — confirm **FULL** status and alert generated.
8. Wait > 180 seconds with ESP32 unplugged — confirm **OFFLINE** status appears.
9. Reconnect ESP32 — confirm **ONLINE** status resumes.

---

## Step 6 — Configure Bin Locations (Optional)

Once physical bin GPS coordinates are surveyed:

1. Open `src/services/mockData.ts`.
2. Update `REAL_BIN_LOCATIONS` with actual latitude/longitude values.
3. For live mode, bin coordinates are stored in Firebase under `bins/{id}/meta/location`.
4. Use the `/api/telemetry` endpoint or Firebase Console to update coordinates.

---

## API Telemetry Reference

### Endpoint
```
POST /api/telemetry
Content-Type: application/json
X-API-Key: <IOT_DEVICE_API_KEY>
```

### Request payload
```json
{
  "deviceId": "ESP32-SMARTBIN-01",
  "binId": "BIN-01",
  "distanceCm": 6.8,
  "timestamp": "2026-10-13T14:00:00.000Z"
}
```

### Fill calculation (server-authoritative)
```
fillPct = clamp(((11 - distanceCm) / 8) * 100, 0, 100)
```

### Validation rules
- `deviceId` must be one of: `ESP32-SMARTBIN-01` … `ESP32-SMARTBIN-04`
- `binId` must be one of: `BIN-01` … `BIN-04`
- `deviceId` must correspond to its `binId` (e.g. `ESP32-SMARTBIN-03` can only write to `BIN-03`)
- `distanceCm` must be a finite, non-negative number

### Test with curl
```bash
curl -X POST https://your-app.vercel.app/api/telemetry \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_IOT_DEVICE_API_KEY" \
  -d '{"deviceId":"ESP32-SMARTBIN-01","binId":"BIN-01","distanceCm":6.5}'
```

---

## Offline Detection

| State      | Condition                                      |
|------------|------------------------------------------------|
| ONLINE     | Telemetry received within the last 180 seconds |
| OFFLINE    | No telemetry for > 180 seconds                 |

---

## Production Bin IDs

| Bin ID  | Device ID            | Controller |
|---------|----------------------|------------|
| BIN-01  | ESP32-SMARTBIN-01    | ESP32 GPIO 5/27/26 OLED ch3 |
| BIN-02  | ESP32-SMARTBIN-02    | ESP32 GPIO 18/34/25 OLED ch1 |
| BIN-03  | ESP32-SMARTBIN-03    | ESP32 GPIO 19/35/4 OLED ch2 |
| BIN-04  | ESP32-SMARTBIN-04    | ESP32 GPIO 23/32/14 OLED ch0 |

All four bins are controlled by **one physical ESP32 board**.
