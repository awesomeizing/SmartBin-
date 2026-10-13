# SmartBin 4-bin ESP32 controller

This sketch matches the physical four-bin wiring used by the project.

| Bin | HC-SR04 TRIG | HC-SR04 ECHO | LED | TCA9548A OLED |
|---|---:|---:|---:|---:|
| BIN-01 | GPIO 5 | GPIO 27 | GPIO 26 | channel 3 |
| BIN-02 | GPIO 18 | GPIO 34 | GPIO 25 | channel 1 |
| BIN-03 | GPIO 19 | GPIO 35 | GPIO 4 | channel 2 |
| BIN-04 | GPIO 23 | GPIO 32 | GPIO 14 | channel 0 |

Shared: buzzer GPIO 13, SDA GPIO 16, SCL GPIO 17, TCA address `0x70`, SSD1306 address `0x3C`.

## Cloud flow

`HC-SR04 → ESP32 → POST /api/telemetry → Firebase Realtime Database → React dashboard`

The ESP32 posts one record for each bin every 15 seconds. The server calculates fill from the authoritative 11 cm empty / 3 cm full calibration and stores history. The dashboard marks a bin offline after 180 seconds without telemetry.

## Before flashing

Edit the constants at the top of `smartbin_4bin.ino`:

- `WIFI_SSID`
- `WIFI_PASSWORD`
- `DEVICE_API_KEY` — must exactly match Vercel's `IOT_DEVICE_API_KEY`
- `TELEMETRY_URL` — change if the deployment URL changes

Install Arduino libraries: **Adafruit GFX Library**, **Adafruit SSD1306**, and **ArduinoJson**. Select an ESP32 Dev Module.

The sketch uses `WiFiClientSecure::setInsecure()` as a prototype convenience for the Vercel HTTPS endpoint. For a security-hardened production deployment, replace it with CA certificate validation.

## Important wiring note

HC-SR04 ECHO can be a 5 V signal while ESP32 GPIO is 3.3 V logic. Use the appropriate voltage divider/level shifting on ECHO before connecting it to the ESP32.

Do not commit real Wi-Fi credentials or the device API key to the repository.
