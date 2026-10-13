/**
 * =============================================================================
 * SmartBin+ — 4-Bin ESP32 Firmware
 * =============================================================================
 * ONE ESP32 controls FOUR physical bins.
 *
 * Hardware configuration (EXACT — matches dashboard hardware.ts):
 *
 *  BIN-01: TRIG=5  ECHO=27 LED=26  OLED TCA9548A ch=3  Device=ESP32-SMARTBIN-01
 *  BIN-02: TRIG=18 ECHO=34 LED=25  OLED TCA9548A ch=1  Device=ESP32-SMARTBIN-02
 *  BIN-03: TRIG=19 ECHO=35 LED=4   OLED TCA9548A ch=2  Device=ESP32-SMARTBIN-03
 *  BIN-04: TRIG=23 ECHO=32 LED=14  OLED TCA9548A ch=0  Device=ESP32-SMARTBIN-04
 *
 *  Shared:
 *    BUZZER  = GPIO 13
 *    I2C SDA = GPIO 16
 *    I2C SCL = GPIO 17
 *    TCA9548A address = 0x70
 *    SSD1306  address = 0x3C
 *    OLED     = 128×64 px
 *
 * Fill calibration:
 *    EMPTY = 11 cm → 0%
 *    FULL  =  3 cm → 100%
 *    fillPct = clamp(((11 - distance) / 8) * 100, 0, 100)
 *
 * Status thresholds:
 *    0–49%   → OK      (LED off)
 *    50–79%  → FILLING (LED on)
 *    80–100% → FULL    (LED on + buzzer once)
 *
 * Telemetry payload sent to POST /api/telemetry:
 *    { deviceId, binId, distanceCm, timestamp }
 *    Optional: rssi, batteryPct, uptimeSec, firmware
 *
 * Required Arduino libraries (Library Manager):
 *    ArduinoJson     by Benoit Blanchon  (v6.x)
 *    Adafruit SSD1306
 *    Adafruit GFX Library
 *
 * Board: ESP32 Dev Module, partition: Default 4MB
 * Serial baud: 115200
 * =============================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// =============================================================================
// USER CONFIGURATION — edit these before flashing
// =============================================================================

#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"

/** Must match IOT_DEVICE_API_KEY on the server. Leave empty to disable auth. */
#define DEVICE_API_KEY   "YOUR_DEVICE_API_KEY"

/** Full URL of your Vercel deployment, e.g. https://smartbin.vercel.app/api/telemetry */
#define TELEMETRY_URL    "https://YOUR_VERCEL_APP.vercel.app/api/telemetry"

/** Firmware version string reported in telemetry. */
#define FIRMWARE_VERSION "2.0.0-4bin"

// =============================================================================
// HARDWARE PINOUT — DO NOT MODIFY (matches hardware.ts)
// =============================================================================

#define NUM_BINS   4
#define PIN_BUZZER 13
#define I2C_SDA    16
#define I2C_SCL    17
#define TCA_ADDR   0x70
#define OLED_ADDR  0x3C
#define OLED_W     128
#define OLED_H     64

// Per-bin GPIO configuration (indexed 0–3 for BIN-01 … BIN-04)
static const uint8_t PIN_TRIG[NUM_BINS] = { 5,  18, 19, 23 };
static const uint8_t PIN_ECHO[NUM_BINS] = { 27, 34, 35, 32 };
static const uint8_t PIN_LED [NUM_BINS] = { 26, 25,  4, 14 };
// TCA9548A channel for each bin's OLED
static const uint8_t OLED_CHAN[NUM_BINS] = { 3, 1, 2, 0 };

static const char* BIN_IDS   [NUM_BINS] = { "BIN-01", "BIN-02", "BIN-03", "BIN-04" };
static const char* DEVICE_IDS[NUM_BINS] = {
  "ESP32-SMARTBIN-01", "ESP32-SMARTBIN-02",
  "ESP32-SMARTBIN-03", "ESP32-SMARTBIN-04"
};

// =============================================================================
// SENSING CONSTANTS
// =============================================================================

#define EMPTY_CM       11.0f   // → 0%   fill
#define FULL_CM         3.0f   // → 100% fill
#define SENSOR_MIN_CM   2.0f
#define SENSOR_MAX_CM  30.0f   // reject readings beyond this (lid open, echo miss)
#define MEDIAN_SAMPLES  5      // rolling median window
#define SAMPLE_DELAY_MS 60
#define ALERT_THRESH   80.0f   // FULL threshold %
#define FILLING_THRESH 50.0f   // FILLING threshold %

// =============================================================================
// TIMING
// =============================================================================

#define SENSE_INTERVAL_MS   2000UL   // local read + OLED refresh
#define UPLOAD_INTERVAL_MS  60000UL  // telemetry POST to server
#define WIFI_TIMEOUT_MS     20000UL
#define RECONNECT_INIT_MS   1000UL
#define RECONNECT_MAX_MS    30000UL

// =============================================================================
// BUZZER
// =============================================================================

#define BUZZER_BEEPS       3
#define BUZZER_BEEP_MS   180
#define BUZZER_REARM_MS  900000UL   // 15 minutes between full-bin alerts

// =============================================================================
// PER-BIN STATE
// =============================================================================

struct BinState {
  float   distanceCm   = -1.0f;
  float   fillPct      = 0.0f;
  bool    sensorOk     = false;
  bool    wasAboveFull = false;
  uint32_t lastBuzzerMs = 0;
};

static BinState bins[NUM_BINS];

// =============================================================================
// SHARED
// =============================================================================

static Adafruit_SSD1306 oled(OLED_W, OLED_H, &Wire, -1);
static bool oledAvailable = false;

static unsigned long lastSenseAt  = 0;
static unsigned long lastUploadAt = 0;
static unsigned long reconnectDelay = RECONNECT_INIT_MS;
static unsigned long lastReconnectAt = 0;

static uint32_t uploadAttempts  = 0;
static uint32_t uploadSuccesses = 0;

// =============================================================================
// TCA9548A I2C MUX
// =============================================================================

/** Select one TCA9548A output channel (0–7) for I2C routing. */
void tcaSelect(uint8_t ch) {
  Wire.beginTransmission(TCA_ADDR);
  Wire.write(1 << ch);
  Wire.endTransmission();
}

/** Deselect all TCA9548A channels. */
void tcaDeselect() {
  Wire.beginTransmission(TCA_ADDR);
  Wire.write(0x00);
  Wire.endTransmission();
}

// =============================================================================
// HC-SR04 ULTRASONIC SENSOR
// =============================================================================

static const float SOUND_CM_PER_US = 0.0343f;
static const unsigned long ECHO_TIMEOUT_US = (unsigned long)((SENSOR_MAX_CM * 2.0f) / SOUND_CM_PER_US);

float readRaw(uint8_t binIdx) {
  uint8_t trig = PIN_TRIG[binIdx];
  uint8_t echo = PIN_ECHO[binIdx];

  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);

  unsigned long dur = pulseIn(echo, HIGH, ECHO_TIMEOUT_US);
  if (dur == 0) return -1.0f;
  return (dur * SOUND_CM_PER_US) / 2.0f;
}

bool isValidReading(float d) {
  return d >= SENSOR_MIN_CM && d <= SENSOR_MAX_CM;
}

float sortedMedian(float* arr, uint8_t n) {
  // Insertion sort on small array
  for (uint8_t i = 1; i < n; i++) {
    float key = arr[i];
    int8_t j = i - 1;
    while (j >= 0 && arr[j] > key) { arr[j+1] = arr[j]; j--; }
    arr[j+1] = key;
  }
  return (n % 2 == 1) ? arr[n/2] : (arr[n/2-1] + arr[n/2]) / 2.0f;
}

/** Reads one bin with median filter. Returns -1 on sensor fault. */
float readFiltered(uint8_t binIdx) {
  float valid[MEDIAN_SAMPLES];
  uint8_t cnt = 0;
  for (uint8_t i = 0; i < MEDIAN_SAMPLES; i++) {
    float r = readRaw(binIdx);
    if (isValidReading(r)) valid[cnt++] = r;
    if (i < MEDIAN_SAMPLES - 1) delay(SAMPLE_DELAY_MS);
  }
  if (cnt < (MEDIAN_SAMPLES / 2) + 1) return -1.0f;
  return sortedMedian(valid, cnt);
}

// =============================================================================
// FILL CALCULATION — must match server formula
// =============================================================================

float calculateFill(float d) {
  if (d < 0) return 0.0f;
  float pct = ((EMPTY_CM - d) / (EMPTY_CM - FULL_CM)) * 100.0f;
  return constrain(pct, 0.0f, 100.0f);
}

const char* fillStatus(float pct) {
  if (pct >= ALERT_THRESH)   return "Full";
  if (pct >= FILLING_THRESH) return "Half";
  return "Empty";
}

// =============================================================================
// INDICATORS — LED + BUZZER
// =============================================================================

void updateIndicators(uint8_t idx, float pct) {
  bool above = pct >= ALERT_THRESH;
  digitalWrite(PIN_LED[idx], above || pct >= FILLING_THRESH ? HIGH : LOW);

  // Rising edge: buzz once, then honour rearm interval
  if (above && !bins[idx].wasAboveFull) {
    unsigned long now = millis();
    if (now - bins[idx].lastBuzzerMs >= BUZZER_REARM_MS) {
      bins[idx].lastBuzzerMs = now;
      for (uint8_t b = 0; b < BUZZER_BEEPS; b++) {
        digitalWrite(PIN_BUZZER, HIGH);
        delay(BUZZER_BEEP_MS);
        digitalWrite(PIN_BUZZER, LOW);
        if (b < BUZZER_BEEPS - 1) delay(BUZZER_BEEP_MS);
      }
    }
  }
  bins[idx].wasAboveFull = above;
}

// =============================================================================
// OLED via TCA9548A
// =============================================================================

void drawBinOled(uint8_t idx) {
  if (!oledAvailable) return;
  tcaSelect(OLED_CHAN[idx]);

  BinState& b = bins[idx];
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1);

  // Header: BIN-XX
  oled.setCursor(0, 0);
  oled.print(BIN_IDS[idx]);
  oled.setCursor(OLED_W - 24, 0);
  oled.print(WiFi.status() == WL_CONNECTED ? F("WiFi") : F("----"));
  oled.drawLine(0, 10, OLED_W, 10, SSD1306_WHITE);

  if (!b.sensorOk) {
    oled.setCursor(0, 20); oled.println(F("SENSOR FAULT"));
    oled.setCursor(0, 32); oled.println(F("No valid echo"));
    oled.setCursor(0, 44); oled.println(F("Check wiring"));
    oled.display();
    tcaDeselect();
    return;
  }

  // Large fill percentage
  oled.setTextSize(3);
  oled.setCursor(0, 18);
  oled.print((int)(b.fillPct + 0.5f));
  oled.setTextSize(2);
  oled.print(F("%"));

  // Status word + distance
  oled.setTextSize(1);
  oled.setCursor(0, 44);
  oled.print(fillStatus(b.fillPct));
  oled.setCursor(OLED_W - 46, 44);
  oled.print(b.distanceCm, 1);
  oled.print(F("cm"));

  // Fill bar
  oled.drawRect(0, 55, OLED_W, 8, SSD1306_WHITE);
  int bw = (int)((b.fillPct / 100.0f) * (OLED_W - 2));
  if (bw > 0) oled.fillRect(1, 56, bw, 6, SSD1306_WHITE);
  int tx = (int)((ALERT_THRESH / 100.0f) * (OLED_W - 2));
  oled.drawLine(tx, 53, tx, 64, SSD1306_WHITE);

  oled.display();
  tcaDeselect();
}

void oledMessage(uint8_t idx, const char* l1, const char* l2) {
  if (!oledAvailable) return;
  tcaSelect(OLED_CHAN[idx]);
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(0, 0); oled.println(F("SmartBin+"));
  oled.setCursor(0, 12); oled.println(BIN_IDS[idx]);
  oled.drawLine(0, 22, OLED_W, 22, SSD1306_WHITE);
  oled.setCursor(0, 30); oled.println(l1);
  if (l2) { oled.setCursor(0, 42); oled.println(l2); }
  oled.display();
  tcaDeselect();
}

// =============================================================================
// Wi-Fi
// =============================================================================

bool wifiConnect() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - t > WIFI_TIMEOUT_MS) return false;
    delay(250);
  }
  reconnectDelay = RECONNECT_INIT_MS;
  return true;
}

void wifiEnsure() {
  if (WiFi.status() == WL_CONNECTED) { reconnectDelay = RECONNECT_INIT_MS; return; }
  unsigned long now = millis();
  if (now - lastReconnectAt < reconnectDelay) return;
  lastReconnectAt = now;
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 5000) delay(200);
  if (WiFi.status() == WL_CONNECTED) {
    reconnectDelay = RECONNECT_INIT_MS;
    Serial.println(F("[wifi] reconnected"));
  } else {
    reconnectDelay = min(reconnectDelay * 2UL, (unsigned long)RECONNECT_MAX_MS);
  }
}

// =============================================================================
// TELEMETRY POST
// =============================================================================

bool postTelemetry(uint8_t idx) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(TELEMETRY_URL);
  http.addHeader("Content-Type", "application/json");
  if (strlen(DEVICE_API_KEY) > 0) {
    http.addHeader("X-API-Key", DEVICE_API_KEY);
  }

  StaticJsonDocument<256> doc;
  doc["deviceId"]    = DEVICE_IDS[idx];
  doc["binId"]       = BIN_IDS[idx];
  doc["distanceCm"]  = round(bins[idx].distanceCm * 10) / 10.0f;
  doc["timestamp"]   = (unsigned long)millis();  // server uses NTP-based time; this is uptime
  doc["rssi"]        = WiFi.RSSI();
  doc["uptimeSec"]   = millis() / 1000;
  doc["firmware"]    = FIRMWARE_VERSION;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  http.end();

  bool ok = (code == 200);
  Serial.print(F("[upload] ")); Serial.print(BIN_IDS[idx]);
  Serial.print(F(" → HTTP ")); Serial.print(code);
  Serial.print(F(" (")); Serial.print(bins[idx].fillPct, 1); Serial.println(F("%)"));
  return ok;
}

// =============================================================================
// SETUP
// =============================================================================

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println(F("\n=== SmartBin+ 4-Bin Firmware ==="));
  Serial.print(F("Firmware : ")); Serial.println(F(FIRMWARE_VERSION));

  // Sensor + LED pins
  for (uint8_t i = 0; i < NUM_BINS; i++) {
    pinMode(PIN_TRIG[i], OUTPUT);
    pinMode(PIN_ECHO[i], INPUT);
    pinMode(PIN_LED[i],  OUTPUT);
    digitalWrite(PIN_TRIG[i], LOW);
    digitalWrite(PIN_LED[i],  LOW);
    Serial.print(F("  BIN-0")); Serial.print(i + 1);
    Serial.print(F(": TRIG=")); Serial.print(PIN_TRIG[i]);
    Serial.print(F(" ECHO=")); Serial.print(PIN_ECHO[i]);
    Serial.print(F(" LED="));  Serial.println(PIN_LED[i]);
  }

  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  // I2C + TCA9548A + OLEDs
  Wire.begin(I2C_SDA, I2C_SCL);
  delay(50);

  // Probe OLEDs through each TCA channel
  bool anyOled = false;
  for (uint8_t i = 0; i < NUM_BINS; i++) {
    tcaSelect(OLED_CHAN[i]);
    if (oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
      anyOled = true;
      oled.clearDisplay();
      oled.setTextColor(SSD1306_WHITE);
      oled.setTextSize(1);
      oled.setCursor(0, 0); oled.println(F("SmartBin+"));
      oled.setCursor(0, 12); oled.print(BIN_IDS[i]);
      oled.setCursor(0, 24); oled.println(F("Starting..."));
      oled.display();
      Serial.print(F("  OLED OK: ")); Serial.print(BIN_IDS[i]);
      Serial.print(F(" (TCA ch ")); Serial.print(OLED_CHAN[i]); Serial.println(F(")"));
    } else {
      Serial.print(F("  OLED MISSING: ")); Serial.println(BIN_IDS[i]);
    }
    tcaDeselect();
  }
  oledAvailable = anyOled;

  // Wi-Fi
  Serial.print(F("[wifi] connecting to ")); Serial.println(F(WIFI_SSID));
  bool connected = wifiConnect();
  if (connected) {
    Serial.print(F("[wifi] connected, IP ")); Serial.println(WiFi.localIP());
  } else {
    Serial.println(F("[wifi] failed — running in local-only mode"));
  }

  for (uint8_t i = 0; i < NUM_BINS; i++) {
    oledMessage(i, connected ? "WiFi OK" : "WiFi FAIL", "Sensing...");
  }

  // Initial sensor read (populate state immediately)
  delay(100);
  for (uint8_t i = 0; i < NUM_BINS; i++) {
    float d = readFiltered(i);
    if (d > 0) {
      bins[i].distanceCm = d;
      bins[i].fillPct    = calculateFill(d);
      bins[i].sensorOk   = true;
    } else {
      bins[i].sensorOk = false;
      Serial.print(F("[sense] FAULT: ")); Serial.println(BIN_IDS[i]);
    }
    updateIndicators(i, bins[i].fillPct);
    drawBinOled(i);
  }

  lastSenseAt  = millis();
  lastUploadAt = millis() - UPLOAD_INTERVAL_MS; // upload immediately on first loop
}

// =============================================================================
// LOOP
// =============================================================================

void loop() {
  unsigned long now = millis();

  // ── Sense all four bins ────────────────────────────────────────────────
  if (now - lastSenseAt >= SENSE_INTERVAL_MS) {
    lastSenseAt = now;

    for (uint8_t i = 0; i < NUM_BINS; i++) {
      float d = readFiltered(i);

      if (d > 0) {
        bins[i].distanceCm = d;
        bins[i].fillPct    = calculateFill(d);
        bins[i].sensorOk   = true;

        Serial.print(F("[sense] ")); Serial.print(BIN_IDS[i]);
        Serial.print(F(": ")); Serial.print(d, 1); Serial.print(F(" cm → "));
        Serial.print(bins[i].fillPct, 1); Serial.print(F("% ("));
        Serial.print(fillStatus(bins[i].fillPct)); Serial.println(F(")"));
      } else {
        bins[i].sensorOk = false;
        Serial.print(F("[sense] FAULT: ")); Serial.println(BIN_IDS[i]);
        // Do NOT update distanceCm or fillPct — keep last valid value for display
      }

      // Update indicators regardless (so LED reflects last known state)
      updateIndicators(i, bins[i].fillPct);
      drawBinOled(i);
    }
  }

  // ── Upload telemetry for all four bins ─────────────────────────────────
  if (now - lastUploadAt >= UPLOAD_INTERVAL_MS) {
    lastUploadAt = now;

    for (uint8_t i = 0; i < NUM_BINS; i++) {
      uploadAttempts++;
      if (postTelemetry(i)) {
        uploadSuccesses++;
      } else {
        // Retry once after 2s to handle transient failures
        delay(2000);
        if (postTelemetry(i)) uploadSuccesses++;
      }
      delay(200); // small gap between consecutive POSTs
    }

    Serial.print(F("[stats] delivery ")); Serial.print((uploadSuccesses * 100.0f) / uploadAttempts, 1);
    Serial.print(F("% (")); Serial.print(uploadSuccesses); Serial.print(F("/"));
    Serial.print(uploadAttempts); Serial.print(F(") uptime "));
    Serial.print(millis() / 1000); Serial.print(F("s heap "));
    Serial.print(ESP.getFreeHeap()); Serial.println(F("B"));
  }

  // ── Wi-Fi keep-alive ───────────────────────────────────────────────────
  wifiEnsure();

  delay(20); // feed watchdog
}
