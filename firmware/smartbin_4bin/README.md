# SmartBin+ 4-Bin Firmware — README

## Overview

This firmware runs on a **single ESP32** that controls all **four physical SmartBin units** simultaneously.

---

## Wiring Table

| Signal         | BIN-01   | BIN-02   | BIN-03   | BIN-04   |
|----------------|----------|----------|----------|----------|
| HC-SR04 TRIG   | GPIO 5   | GPIO 18  | GPIO 19  | GPIO 23  |
| HC-SR04 ECHO   | GPIO 27  | GPIO 34  | GPIO 35  | GPIO 32  |
| Status LED (+) | GPIO 26  | GPIO 25  | GPIO 4   | GPIO 14  |
| OLED TCA ch    | ch 3     | ch 1     | ch 2     | ch 0     |

| Signal         | Pin      | Notes                          |
|----------------|----------|--------------------------------|
| Shared Buzzer  | GPIO 13  | All four bins share one buzzer |
| I2C SDA        | GPIO 16  | TCA9548A + all OLEDs           |
| I2C SCL        | GPIO 17  | TCA9548A + all OLEDs           |
| TCA9548A addr  | 0x70     |                                |
| SSD1306 addr   | 0x3C     |                                |
| OLED resolution| 128×64   |                                |

> ⚠ **HC-SR04 ECHO 5V Warning**: The HC-SR04 ECHO pin outputs 5 V. The ESP32 GPIO inputs are 3.3 V tolerant. Use a **voltage divider (1 kΩ + 2 kΩ)** or a **level-shifter** on ECHO to protect the ESP32. Alternatively, use an HC-SR04-compatible 3.3V module.

---

## Required Arduino Libraries

Install from **Arduino Library Manager** (Sketch → Include Library → Manage Libraries):

| Library                  | Author            | Version |
|--------------------------|-------------------|---------|
| ArduinoJson              | Benoit Blanchon   | 6.x     |
| Adafruit SSD1306         | Adafruit          | latest  |
| Adafruit GFX Library     | Adafruit          | latest  |

The ESP32 Arduino core is required but is **not** installed from Library Manager:
- Add board URL in Arduino IDE Preferences: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
- Boards Manager → search "esp32" → install **esp32 by Espressif Systems** v2.0.x

---

## ESP32 Board Selection

| Setting        | Value                      |
|----------------|----------------------------|
| Board          | ESP32 Dev Module           |
| Partition      | Default 4MB                |
| Upload Speed   | 921600                     |
| CPU Frequency  | 240 MHz                    |
| Flash Mode     | QIO                        |

---

## Configuration

Edit the top of `smartbin_4bin.ino` before flashing:

```cpp
#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"
#define DEVICE_API_KEY   "YOUR_DEVICE_API_KEY"   // matches IOT_DEVICE_API_KEY on server
#define TELEMETRY_URL    "https://your-app.vercel.app/api/telemetry"
```

---

## Telemetry URL

The firmware POSTs to:

```
POST https://<your-vercel-app>/api/telemetry
Content-Type: application/json
X-API-Key: <DEVICE_API_KEY>

{
  "deviceId": "ESP32-SMARTBIN-01",
  "binId": "BIN-01",
  "distanceCm": 6.8,
  "timestamp": "<ISO or uptime ms>",
  "rssi": -62,
  "uptimeSec": 3600,
  "firmware": "2.0.0-4bin"
}
```

One POST is sent **per bin per upload cycle** (60 seconds by default = 4 POSTs per minute total).

---

## Flashing Instructions

1. Install Arduino IDE 2.x.
2. Install the ESP32 board package (see above).
3. Install all required libraries.
4. Open `smartbin_4bin/smartbin_4bin.ino`.
5. Edit `WIFI_SSID`, `WIFI_PASSWORD`, `DEVICE_API_KEY`, and `TELEMETRY_URL`.
6. Connect the ESP32 via USB.
7. Select **Tools → Board → ESP32 Dev Module**.
8. Select the correct **Port**.
9. Click **Upload** (Ctrl+U).
10. Open **Serial Monitor** at **115200 baud**.

---

## Serial Monitor Baud Rate

```
115200
```

---

## Calibration Values

These match the physical prototype and **must not be changed** without also updating `hardware.ts` in the frontend:

| Parameter             | Value   |
|-----------------------|---------|
| EMPTY_DISTANCE_CM     | 11 cm   |
| FULL_DISTANCE_CM      | 3 cm    |
| Fill formula          | `((11 - d) / 8) * 100` |
| OK threshold          | 0–49%   |
| FILLING threshold     | 50–79%  |
| FULL threshold        | 80–100% |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `[sense] FAULT: BIN-XX` | HC-SR04 not responding | Check TRIG/ECHO wiring; check 5V supply for sensor |
| OLED MISSING at startup | TCA9548A not detected | Check SDA/SCL (GPIO 16/17), I2C address 0x70 |
| HTTP 401 on upload | Wrong API key | Verify `DEVICE_API_KEY` matches `IOT_DEVICE_API_KEY` on Vercel |
| HTTP 400 on upload | binId mismatch | Verify `TELEMETRY_URL` points to correct Vercel deployment |
| Repeated Wi-Fi fails | Credentials wrong | Re-flash after correcting `WIFI_SSID` / `WIFI_PASSWORD` |
| Dashboard shows OFFLINE | Telemetry stopped >180s | Check serial for upload errors; verify server is running |

---

## Fill Formula Verification

| Distance | Expected fill% |
|----------|---------------|
| 11 cm    | 0%            |
| 7 cm     | 50%           |
| 3 cm     | 100%          |
| 5 cm     | 75%           |
| 9 cm     | 25%           |
