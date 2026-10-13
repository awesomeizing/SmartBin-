/**
 * SmartBin+ — ESP32 firmware, 4-bin build
 * =============================================================================
 *
 *   4 × HC-SR04  →  ESP32  →  Wi-Fi  →  Firebase RTDB  →  SmartBin+ website
 *
 * One board drives four bins. Each cycle it measures all four, drives each
 * bin's LED and OLED locally, sounds the shared buzzer if any bin is full,
 * and transmits one telemetry record per bin.
 *
 * -----------------------------------------------------------------------------
 * REQUIRED LIBRARIES (Arduino IDE → Library Manager)
 *   · ArduinoJson            by Benoit Blanchon      (v6.x)
 *   · Adafruit SSD1306       by Adafruit
 *   · Adafruit GFX Library   by Adafruit
 *   WiFi and HTTPClient ship with the ESP32 board package.
 *
 * BOARD:  ESP32 Dev Module
 *
 * -----------------------------------------------------------------------------
 * WIRING
 *
 *   Bin   TRIG   ECHO*   LED    OLED (TCA9548A channel)
 *   ----  -----  -----   ----   ----------------------
 *    1      5     27      26            3
 *    2     18     34      25            1
 *    3     19     35       4            2
 *    4     23     32      14            0
 *
 *   Buzzer  GPIO 13       I2C SDA  GPIO 16    TCA9548A  0x70
 *                         I2C SCL  GPIO 17    SSD1306   0x3C
 *
 *   * ECHO idles at 5 V. Every ECHO line needs a level shifter or a
 *     1 kΩ / 2 kΩ divider into the ESP32 pin. GPIO 34 and 35 are input-only,
 *     which is correct for ECHO and would be broken for anything else.
 *
 * -----------------------------------------------------------------------------
 * BEFORE FLASHING, set in config.h:
 *   WIFI_SSID · WIFI_PASSWORD · FIREBASE_HOST · FIREBASE_API_KEY
 *   DEVICE_EMAIL · DEVICE_PASSWORD
 */

#include "config.h"
#include "cloud.h"
#include "bins.h"

static const char* const DEVICE_IDS_ARR[BIN_COUNT] = BIN_DEVICE_IDS;

static unsigned long lastSense  = 0;
static unsigned long lastUpload = 0;

// ─────────────────────────────────────────────────────────────

void setup() {
#if DEBUG_SERIAL
  Serial.begin(SERIAL_BAUD);
  delay(300);
  Serial.println();
  Serial.println(F("=========================================="));
  Serial.println(F(" SmartBin+ v" FIRMWARE_VERSION " — 4-bin node"));
  Serial.println(F("=========================================="));
#endif

  binsBegin();

  if (cloudConnectWiFi()) {
    cloudAuthenticate();
  } else {
#if DEBUG_SERIAL
    Serial.println(F("[boot] no Wi-Fi — sensing locally, will retry"));
#endif
  }

  // Measure immediately so the OLEDs show real numbers rather than
  // "starting..." while the first interval elapses.
  senseAllBins();
  updateLeds();
  updateDisplays(cloudWiFiConnected());
}

// ─────────────────────────────────────────────────────────────

void loop() {
  unsigned long now = millis();

  // ── Local sensing ──────────────────────────────────────
  // Runs regardless of connectivity. A bin with no internet still lights its
  // LED and sounds the buzzer — the cloud is for reporting, not for deciding.
  if (now - lastSense >= SENSE_INTERVAL_MS) {
    lastSense = now;

    senseAllBins();
    updateLeds();
    updateBuzzer();
    updateDisplays(cloudWiFiConnected());
  }

  // ── Transmit ───────────────────────────────────────────
  // One record per bin. This doubles as the heartbeat: the dashboard marks a
  // device offline when its timestamp stops advancing, so a bin whose level
  // never changes must still transmit on every interval.
  if (now - lastUpload >= UPLOAD_INTERVAL_MS) {
    lastUpload = now;

    if (!cloudEnsureConnection()) {
#if DEBUG_SERIAL
      Serial.println(F("[loop] offline — skipping upload"));
#endif
      return;
    }

    for (uint8_t i = 0; i < BIN_COUNT; i++) {
      cloudUploadBin(
        BIN_ID[i],
        DEVICE_IDS_ARR[i],
        bins[i].distanceCm,
        bins[i].fillPct,
        bins[i].sensorOk
      );
      // Small gap so four back-to-back TLS requests do not starve the
      // watchdog on a slow link.
      delay(80);
    }
  }
}
