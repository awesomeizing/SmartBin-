/**
 * =============================================================================
 * SmartBin+ — ESP32 Firmware
 * =============================================================================
 * An IoT Based Intelligent Waste Monitoring and Route Optimization System
 * Major Project Phase-I · Course Code CSEP23605 · Group 54
 * Department of Computer Science and Engineering
 * Global Academy of Technology, Bengaluru · 2025-2026
 *
 * -----------------------------------------------------------------------------
 * WHAT THIS DOES
 *
 * Every SENSE_INTERVAL_MS the device takes a filtered ultrasonic reading,
 * computes the fill percentage, updates the OLED, and drives the LED and
 * buzzer locally. Every UPLOAD_INTERVAL_MS it transmits that reading to the
 * Firebase Realtime Database.
 *
 * The local indicators are deliberately independent of the network. A bin that
 * has reached capacity signals it whether or not the cloud is reachable — the
 * edge-processing approach the literature survey argues for (§VII-C).
 *
 * -----------------------------------------------------------------------------
 * LOOP, per report §5.1 Step 2
 *
 *   1. Trigger an HC-SR04 pulse
 *   2. Compute distance from echo-pulse duration
 *   3. Derive fill-level percentage
 *   4. Classify bin status ("Empty", "Half", "Full")
 *   5. Serialize the record as JSON
 *   6. POST it to Firebase with a 60-second inter-reading interval
 *
 * -----------------------------------------------------------------------------
 * WIRING — report §5.1 Step 1
 *
 *   HC-SR04 TRIG  -> GPIO 5
 *   HC-SR04 ECHO  -> GPIO 18
 *   HC-SR04 VCC   -> 5V      (regulated via LM2596)
 *   HC-SR04 GND   -> GND
 *
 *   Red LED  (+)  -> GPIO 2   via 220R resistor
 *   Buzzer   (+)  -> GPIO 4
 *   OLED SDA      -> GPIO 21
 *   OLED SCL      -> GPIO 22
 *
 *   Power: 9V supply -> LM2596 buck converter -> ESP32 VIN
 *   Add 100uF and 10uF bypass capacitors at the ESP32 power pins. Report §5.2
 *   item 3 documents why: direct USB supply caused voltage sag during Wi-Fi
 *   radio bursts, producing sporadic microcontroller resets.
 *
 * -----------------------------------------------------------------------------
 * REQUIRED LIBRARIES (Arduino Library Manager)
 *
 *   ArduinoJson          by Benoit Blanchon      (v6.x)
 *   Adafruit SSD1306     by Adafruit
 *   Adafruit GFX Library by Adafruit
 *
 * Board: "ESP32 Dev Module", ESP32 board package v2.0.x
 *
 * -----------------------------------------------------------------------------
 * SETUP
 *
 *   1. Copy config.h and fill in your Wi-Fi and Firebase credentials
 *   2. Set BIN_ID to match the bin's registration in the dashboard
 *   3. Create a device service account in Firebase Authentication
 *      (Email/Password) — do not reuse an administrator login
 *   4. Flash, then watch the serial monitor at 115200 baud
 *
 * =============================================================================
 */

#include "config.h"
#include "sensor.h"
#include "indicators.h"
#include "cloud.h"

/* ---------------------------------------------------------------------------
 * STATE
 * ------------------------------------------------------------------------- */

static unsigned long lastSenseAt = 0;
static unsigned long lastUploadAt = 0;
static unsigned long lastHealthAt = 0;

static float currentDistanceCm = -1.0f;
static float currentFillPercent = 0.0f;
static const char* currentStatus = "Empty";

/** Uploads attempted and succeeded — printed periodically as a delivery rate. */
static uint32_t uploadAttempts = 0;
static uint32_t uploadSuccesses = 0;

/* ---------------------------------------------------------------------------
 * SETUP
 * ------------------------------------------------------------------------- */

void setup() {
#if DEBUG_SERIAL
  Serial.begin(SERIAL_BAUD);
  delay(400);   // let the USB serial settle before the banner

  Serial.println();
  Serial.println(F("============================================"));
  Serial.println(F(" SmartBin+ ESP32 Firmware"));
  Serial.print  (F(" Bin ID     : ")); Serial.println(BIN_ID);
  Serial.print  (F(" Firmware   : ")); Serial.println(FIRMWARE_VERSION);
  Serial.print  (F(" Bin depth  : ")); Serial.print(BIN_DEPTH_CM); Serial.println(F(" cm"));
  Serial.print  (F(" Threshold  : ")); Serial.print(ALERT_THRESHOLD); Serial.println(F(" %"));
  Serial.print  (F(" Upload gap : ")); Serial.print(UPLOAD_INTERVAL_MS / 1000); Serial.println(F(" s"));
  Serial.println(F("============================================"));
#endif

  indicatorsBegin();
  sensorBegin();

  indicatorsShowMessage("Connecting to", WIFI_SSID);

  if (cloudConnectWiFi()) {
    indicatorsShowMessage("WiFi connected", "Authenticating");
    cloudAuthenticate();
  } else {
    // Continue regardless. Local sensing and indication are the primary
    // function; the device is useful standing next to the bin even with no
    // network at all.
    indicatorsShowMessage("WiFi failed", "Running offline");
#if DEBUG_SERIAL
    Serial.println(F("[setup] no network - continuing in local-only mode"));
#endif
    delay(1500);
  }

  // Take a first reading immediately so the display is not blank on boot.
  currentDistanceCm = sensorReadFiltered();

  if (currentDistanceCm > 0) {
    currentFillPercent = sensorFillPercent(currentDistanceCm);
    currentStatus = sensorBinStatus(currentFillPercent);
  }

  indicatorsShowStatus(currentFillPercent, currentDistanceCm, currentStatus,
                       cloudWiFiConnected(), true, sensorIsHealthy());

  lastSenseAt = millis();

  // Force an upload on the first loop iteration rather than waiting a full
  // interval — useful when demonstrating the device.
  lastUploadAt = millis() - UPLOAD_INTERVAL_MS;
}

/* ---------------------------------------------------------------------------
 * LOOP
 * ------------------------------------------------------------------------- */

void loop() {
  unsigned long now = millis();

  /* --- Sense ------------------------------------------------------------ */
  if (now - lastSenseAt >= SENSE_INTERVAL_MS) {
    lastSenseAt = now;

    float distance = sensorReadFiltered();

    if (distance > 0) {
      currentDistanceCm = distance;
      currentFillPercent = sensorFillPercent(distance);
      currentStatus = sensorBinStatus(currentFillPercent);

      // Local threshold evaluation — LED and buzzer respond immediately,
      // without waiting for a cloud round trip.
      indicatorsUpdateAlert(currentFillPercent);

#if DEBUG_SERIAL
      Serial.print(F("[sense] "));
      Serial.print(distance, 1);
      Serial.print(F(" cm -> "));
      Serial.print(currentFillPercent, 1);
      Serial.print(F("% ("));
      Serial.print(currentStatus);
      Serial.println(F(")"));
#endif
    }
#if DEBUG_SERIAL
    else {
      Serial.println(F("[sense] no valid reading - sensor fault"));
    }
#endif

    indicatorsShowStatus(currentFillPercent, currentDistanceCm, currentStatus,
                         cloudWiFiConnected(), cloudLastUploadOk(),
                         sensorIsHealthy());
  }

  /* --- Upload ----------------------------------------------------------- */
  if (now - lastUploadAt >= UPLOAD_INTERVAL_MS) {
    lastUploadAt = now;
    uploadAttempts++;

    if (cloudUpload(currentDistanceCm, currentFillPercent,
                    currentStatus, sensorIsHealthy())) {
      uploadSuccesses++;
    }

#if DEBUG_SERIAL
    // Report §3.2 sets a 95% delivery-rate target. Printing the measured rate
    // makes that checkable during testing rather than merely asserted.
    if (uploadAttempts > 0) {
      Serial.print(F("[stats] delivery rate "));
      Serial.print((uploadSuccesses * 100.0f) / uploadAttempts, 1);
      Serial.print(F("% ("));
      Serial.print(uploadSuccesses);
      Serial.print(F("/"));
      Serial.print(uploadAttempts);
      Serial.print(F(") | uptime "));
      Serial.print(millis() / 1000);
      Serial.print(F(" s | free heap "));
      Serial.print(ESP.getFreeHeap());
      Serial.println(F(" B"));
    }
#endif

    indicatorsShowStatus(currentFillPercent, currentDistanceCm, currentStatus,
                         cloudWiFiConnected(), cloudLastUploadOk(),
                         sensorIsHealthy());
  }

  /* --- Health report ----------------------------------------------------- */
  // Less frequent than telemetry: component health changes rarely, and every
  // extra request costs power on a battery-powered unit.
  if (now - lastHealthAt >= UPLOAD_INTERVAL_MS * 5) {
    lastHealthAt = now;
    cloudUploadHealth(sensorIsHealthy());
  }

  /* --- Connection maintenance -------------------------------------------- */
  // Non-blocking; respects the exponential back-off internally so a long
  // outage does not stall sensing or the local indicators.
  cloudEnsureConnection();

  // Small yield keeps the watchdog fed and the Wi-Fi stack responsive.
  delay(20);
}
