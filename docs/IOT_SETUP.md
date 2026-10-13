# SmartBin IoT deployment

The production path is:

`ESP32 -> POST /api/telemetry -> Firebase Realtime Database -> React dashboard`

## Four physical devices

| Bin | Device | TRIG | ECHO | LED | OLED mux |
|---|---|---:|---:|---:|---:|
| BIN-001 | ESP32-SMARTBIN-01 | GPIO 5 | GPIO 27 | GPIO 26 | TCA channel 3 |
| BIN-002 | ESP32-SMARTBIN-02 | GPIO 18 | GPIO 34 | GPIO 25 | TCA channel 1 |
| BIN-003 | ESP32-SMARTBIN-03 | GPIO 19 | GPIO 35 | GPIO 4 | TCA channel 2 |
| BIN-004 | ESP32-SMARTBIN-04 | GPIO 23 | GPIO 32 | GPIO 14 | TCA channel 0 |

Shared hardware: buzzer GPIO 13, I2C SDA GPIO 16, SCL GPIO 17, TCA9548A address 0x70, SSD1306 address 0x3C.

## Fill calibration

- Empty distance: 11 cm
- Full distance: 3 cm
- `fill = ((11 - distance) / 8) * 100`, clamped to 0–100
- 0–49%: Empty/healthy
- 50–79%: Half/warning
- 80–100%: Full/critical
- Telemetry stale for more than 180 seconds: OFFLINE

The server recalculates fill from `distanceCm`; the browser never trusts a client-provided percentage.

## Firebase

Create a Firebase Realtime Database and configure the `VITE_FIREBASE_*` variables for the frontend. The frontend subscribes to `/bins` in real time.

For the Vercel function configure:

- `FIREBASE_DATABASE_URL`
- `FIREBASE_SERVICE_ACCOUNT_JSON` — the complete service-account JSON as one secret
- `IOT_DEVICE_API_KEY` — a long random secret shared only with the ESP32 devices

Do not commit any Firebase service-account JSON, API secret, Wi-Fi password, or production `.env` file.

## Vercel

Deploy the repository normally. The `api/telemetry.ts` file becomes `/api/telemetry` automatically.

The ESP32 sends:

```json
{
  "deviceId": "ESP32-SMARTBIN-01",
  "binId": "BIN-001",
  "distanceCm": 6.8,
  "rssi": -54,
  "uptimeSec": 12345,
  "firmware": "smartbin-4.0.0"
}
```

with the `X-Device-Key` header.

## Firmware

Open `hardware/esp32/SmartBin4/SmartBin4.ino` in Arduino IDE. Install Adafruit GFX and Adafruit SSD1306 libraries, set Wi-Fi credentials, the deployed `/api/telemetry` URL, and the same device API key. Flash the firmware to the ESP32.

Each board uses the same firmware. The four-board identity is controlled by `BIN_IDS`, `DEVICE_IDS`, and the pin arrays in the sketch.

## Locations

Physical bin coordinates are intentionally not invented. `src/constants/hardware.ts` marks all four locations as unconfigured. Set each location only after you know the actual installation coordinates; then the map can render truthful markers.

## Production behavior

There is no random production telemetry. Demo/mock data is used only when the frontend Firebase configuration is absent. Once Firebase variables are configured, the dashboard uses the four real hardware IDs and their actual last-seen timestamps.
