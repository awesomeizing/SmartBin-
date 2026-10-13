# SmartBin+ — four physical bins, one live dashboard

```
 Bin 1   Bin 2   Bin 3   Bin 4      4 × HC-SR04, 4 × LED, 4 × OLED, 1 buzzer
   │       │       │       │
   └───────┴───┬───┴───────┘
               │                    one ESP32, TCA9548A I²C multiplexer
          Wi-Fi │
               ▼
     Firebase Realtime Database      device service account, rules-validated
               │
               │ push (not polling)
               ▼
        SmartBin+ web app            dashboard · map · alerts · charts
```

The website is the monitoring system for four real bins. When the ESP32 is
off, the dashboard says so. When it powers on, the bins turn themselves
online and show real readings, with no page refresh.

---

## The hardware

One ESP32 drives all four bins.

| Bin | TRIG | ECHO | LED | OLED (mux ch.) | Device ID |
|-----|------|------|-----|----------------|-----------|
| 1 | 5 | 27 | 26 | 3 | `ESP32-SMARTBIN-01` |
| 2 | 18 | 34 | 25 | 1 | `ESP32-SMARTBIN-02` |
| 3 | 19 | 35 | 4 | 2 | `ESP32-SMARTBIN-03` |
| 4 | 23 | 32 | 14 | 0 | `ESP32-SMARTBIN-04` |

Shared: buzzer **GPIO 13** · I²C **SDA 16 / SCL 17** · TCA9548A **0x70** ·
SSD1306 128×64 **0x3C**

> **Two electrical notes.** GPIO 34 and 35 are *input-only* — correct for
> ECHO, unusable for anything else. And HC-SR04 ECHO idles at **5 V** while
> the ESP32 is 3.3 V tolerant only: every ECHO line needs a level shifter or
> a 1 kΩ / 2 kΩ divider, or the pins will eventually fail.

### Fill calculation

Two-point calibration of the sensor as mounted, not the bin's geometry:

```
fillPct = ((11 − distanceCm) / (11 − 3)) × 100,  clamped to 0…100
```

| 11 cm | 9 cm | 7 cm | 5 cm | 3 cm |
|-------|------|------|------|------|
| 0 % | 25 % | 50 % | 75 % | 100 % |

Bands: **OK** 0–49 · **FILLING** 50–79 · **FULL** 80–100.

The firmware computes this locally so the LED and OLED react instantly; the
web app **recomputes it from the raw distance** and that value is what a
human sees. A device with a wrong constant cannot mislead the dashboard.

---

## Setup

### 1. Firebase (once)

1. <https://console.firebase.google.com> → **Add project**.
2. **Build → Realtime Database → Create Database**. Pick a region near you
   (`asia-southeast1` for India). Start in **locked mode**.
3. **Build → Authentication → Get started → Email/Password → Enable**.
4. **Authentication → Users → Add user** — this is the account the *hardware*
   signs in as. Use something like `device@smartbin.local` and a long
   password. **Do not reuse your own login.** Copy the generated **UID**.
5. **Realtime Database → Rules** — paste the contents of
   `firebase-rules.json`, replace **both** occurrences of `DEVICE_UID` with
   the UID from step 4, and **Publish**.
6. **Project settings → General → Your apps → Web** — register an app and
   copy the config values.

### 2. Web app

```bash
cp .env.example .env.local     # paste the Firebase values from step 6
npm install
npm run dev                    # http://localhost:5173
```

Set `VITE_DATA_MODE=simulation` in `.env.local` to develop without hardware.
Simulated data is always labelled **SIMULATION** on screen and can never
appear in a real deployment.

### 3. Firmware

```
firmware/smartbin_esp32/
  smartbin_esp32.ino   main loop
  config.h             ← your credentials and the wiring table
  bins.h               4-bin sensing, LEDs, buzzer, multiplexed OLEDs
  cloud.h              Wi-Fi + authenticated Firebase writes
```

Arduino IDE → Library Manager, install:
**ArduinoJson** (v6), **Adafruit SSD1306**, **Adafruit GFX**.
Board: **ESP32 Dev Module**.

Fill in `config.h`:

| Setting | Value |
|---|---|
| `WIFI_SSID` / `WIFI_PASSWORD` | your network |
| `FIREBASE_HOST` | the database URL from step 1.2 |
| `FIREBASE_API_KEY` | the Web API key from step 1.6 |
| `DEVICE_EMAIL` / `DEVICE_PASSWORD` | the service account from step 1.4 |

Flash it. The serial monitor at 115200 should show each bin uploading.

---

## Verifying the chain

Before the hardware is ready, open **`/hardware/test`**. It injects telemetry
exactly as an ESP32 would and writes to the real database, so you can watch
one reading travel the whole path: ingestion → Firebase → realtime push →
bin state → cards, map, statistics, alerts.

Two behaviours worth checking by hand:

- **Stop sending for ~50 s.** That bin alone drops to *Offline*. The other
  three are untouched. Resume, and it returns to *Online* with no refresh.
- **Press "Fault"** on a bin. The device stays *Online* while the bin shows
  *Sensor error* — not `0 %`. A missing echo must never read as an empty bin.

```bash
npm test          # 31 tests over the fill formula, status ladder,
                  # device isolation, offline/reconnect, and fault handling
npm run build
```

---

## How it is put together

| Concern | Lives in |
|---|---|
| The four bins, wiring, thresholds, timeouts | `src/config/devices.config.ts` |
| Real vs simulation mode | `src/config/mode.ts` |
| Fill formula, status ladder, liveness, stats | `src/lib/telemetry.ts` |
| Firebase subscription + liveness clock | `src/hooks/useLiveBins.ts` |
| Telemetry writes and validation | `src/services/telemetry/` |
| Server-side validation | `firebase-rules.json` |

`src/config/devices.config.ts` is the single source of truth. A fifth bin is
added there and nowhere else — the dashboard, map, statistics and tests all
read from it. No component hard-codes a bin ID, a GPIO number or a threshold.

### Why there is no `POST /api/telemetry`

The backend *is* Firebase Realtime Database. The ESP32 writes to it over
authenticated HTTPS and every subscribed browser is pushed the change in
milliseconds. A serverless function in between would add a hop that cannot
hold a realtime connection open — Vercel functions are request-scoped — so it
would make the system strictly worse. Validation that cannot be skipped lives
in `firebase-rules.json`, enforced by Google's servers.

This is also why the app deploys to Vercel unchanged: the frontend is static,
and the realtime connection is browser-to-Firebase.

### What the dashboard refuses to do

- No `Math.random()` in any production path.
- An unmeasured bin shows `--`, never `0 %`. Zero would claim it is empty.
- An offline bin is never labelled *OK*, and never says "updated just now".
- With every bin offline, average fill is `--`, not `0 %`.
- A bin exists because it is in the registry, not because a database row is —
  so a bin that has never reported still appears, as *Waiting for device*.
