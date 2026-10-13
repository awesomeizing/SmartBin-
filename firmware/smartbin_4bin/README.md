# SmartBin 4-bin ESP32 controller

This sketch matches the physical four-bin wiring.

| Bin | TRIG | ECHO | LED | OLED mux |
|---|---:|---:|---:|---:|
| BIN-01 | 5 | 27 | 26 | 3 |
| BIN-02 | 18 | 34 | 25 | 1 |
| BIN-03 | 19 | 35 | 4 | 2 |
| BIN-04 | 23 | 32 | 14 | 0 |

Shared: buzzer GPIO 13, SDA GPIO 16, SCL GPIO 17, TCA9548A `0x70`, SSD1306 `0x3C`.

Cloud flow: `HC-SR04 → ESP32 → /api/telemetry → Firebase Realtime Database → React dashboard`.

Edit `WIFI_SSID`, `WIFI_PASSWORD`, and `DEVICE_API_KEY` in the sketch before flashing. The API key must match Vercel `IOT_DEVICE_API_KEY`.

Install Arduino libraries: Adafruit GFX, Adafruit SSD1306, ArduinoJson. Select ESP32 Dev Module.

Calibration is fixed to 11 cm empty and 3 cm full. The server remains authoritative for fill/status.

The prototype sketch uses `WiFiClientSecure::setInsecure()` for HTTPS convenience. Replace it with CA certificate validation for a hardened production deployment.

**Electrical note:** HC-SR04 ECHO may be 5 V; ESP32 GPIO is 3.3 V logic. Use the appropriate level shifting/voltage divider on ECHO.
