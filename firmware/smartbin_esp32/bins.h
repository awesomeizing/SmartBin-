/**
 * SmartBin+ — Four-bin sensing, display and indicators
 * =============================================================================
 * Everything per-bin lives in ARRAYS indexed 0..BIN_COUNT-1. There is no
 * readBin1() / readBin2() / readBin3() / readBin4(); adding a fifth bin means
 * extending the initialisers in config.h and nothing else.
 */

#ifndef SMARTBIN_BINS_H
#define SMARTBIN_BINS_H

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "config.h"

/* ---------------------------------------------------------------------------
 * REGISTRY
 * ------------------------------------------------------------------------- */

static const char* const BIN_ID[BIN_COUNT]     = BIN_IDS;
static const char* const DEVICE_ID[BIN_COUNT]  = BIN_DEVICE_IDS;
static const char* const BIN_LABEL[BIN_COUNT]  = BIN_LABELS;
static const uint8_t TRIG_PIN[BIN_COUNT]       = PINS_TRIG;
static const uint8_t ECHO_PIN[BIN_COUNT]       = PINS_ECHO;
static const uint8_t LED_PIN[BIN_COUNT]        = PINS_LED;
static const uint8_t OLED_CH[BIN_COUNT]        = OLED_CHANNELS;

/** Per-bin runtime state. */
struct BinState {
  float   distanceCm;   // last good reading, NAN when the sensor failed
  float   fillPct;      // derived from distanceCm, NAN when unknown
  bool    sensorOk;     // did the last read produce a plausible distance
  uint8_t status;       // 0 OK · 1 FILLING · 2 FULL · 3 SENSOR_ERROR
  unsigned long lastBuzzAt;
};

static BinState bins[BIN_COUNT];

enum : uint8_t { ST_OK = 0, ST_FILLING = 1, ST_FULL = 2, ST_FAULT = 3 };

static Adafruit_SSD1306 oled(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);

/* ---------------------------------------------------------------------------
 * I2C MULTIPLEXER
 *
 * All four OLEDs are SSD1306s at the same fixed address 0x3C, so they cannot
 * share a bus. The TCA9548A exposes one at a time; select the channel, talk
 * to "the" display, move on.
 * ------------------------------------------------------------------------- */

inline void muxSelect(uint8_t channel) {
  if (channel > 7) return;
  Wire.beginTransmission(TCA9548A_ADDR);
  Wire.write(1 << channel);
  Wire.endTransmission();
}

/** Deselect every channel — leaves the bus quiet between updates. */
inline void muxDisableAll() {
  Wire.beginTransmission(TCA9548A_ADDR);
  Wire.write(0);
  Wire.endTransmission();
}

/* ---------------------------------------------------------------------------
 * SENSING
 * ------------------------------------------------------------------------- */

/** One raw HC-SR04 reading in cm, or NAN on no-echo. */
inline float readDistanceOnce(uint8_t index) {
  digitalWrite(TRIG_PIN[index], LOW);
  delayMicroseconds(4);
  digitalWrite(TRIG_PIN[index], HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN[index], LOW);

  unsigned long duration = pulseIn(ECHO_PIN[index], HIGH, ECHO_TIMEOUT_US);
  if (duration == 0) return NAN;   // timed out — no echo came back

  // Speed of sound 343 m/s → 0.0343 cm/µs, halved for the round trip.
  float cm = (duration * 0.0343f) / 2.0f;
  if (cm < SENSOR_MIN_CM || cm > SENSOR_MAX_CM) return NAN;
  return cm;
}

/** Insertion sort — MEDIAN_WINDOW is 5, so nothing cleverer is warranted. */
inline void sortSmall(float* a, uint8_t n) {
  for (uint8_t i = 1; i < n; i++) {
    float key = a[i];
    int8_t j = i - 1;
    while (j >= 0 && a[j] > key) { a[j + 1] = a[j]; j--; }
    a[j + 1] = key;
  }
}

/**
 * Median-filtered distance for one bin.
 *
 * @return median of the valid samples, or NAN when fewer than three of the
 *         five came back. Returning NAN rather than a default is the whole
 *         point: a missing echo must never become "0 cm", which the
 *         dashboard would read as a full bin.
 */
inline float readDistance(uint8_t index) {
  float samples[MEDIAN_WINDOW];
  uint8_t valid = 0;

  for (uint8_t i = 0; i < MEDIAN_WINDOW; i++) {
    float cm = readDistanceOnce(index);
    if (!isnan(cm)) samples[valid++] = cm;
    delay(SAMPLE_DELAY_MS);
  }

  if (valid < 3) return NAN;
  sortSmall(samples, valid);
  return samples[valid / 2];
}

/**
 * Distance → fill percentage. Mirrors distanceToFillPercent() in
 * src/lib/telemetry.ts. The backend recomputes this from the raw distance
 * and is authoritative; this copy exists so the LED and OLED can act without
 * waiting for a round trip.
 */
inline float toFillPercent(float distanceCm) {
  if (isnan(distanceCm)) return NAN;
  float span = EMPTY_DISTANCE_CM - FULL_DISTANCE_CM;
  float pct = ((EMPTY_DISTANCE_CM - distanceCm) / span) * 100.0f;
  if (pct < 0.0f) pct = 0.0f;
  if (pct > 100.0f) pct = 100.0f;
  return pct;
}

inline uint8_t toStatus(float fillPct, bool sensorOk) {
  if (!sensorOk || isnan(fillPct)) return ST_FAULT;
  if (fillPct >= ALERT_THRESHOLD) return ST_FULL;
  if (fillPct > BAND_OK_MAX)      return ST_FILLING;
  return ST_OK;
}

/** Sample every bin and refresh its derived state. */
inline void senseAllBins() {
  for (uint8_t i = 0; i < BIN_COUNT; i++) {
    float cm = readDistance(i);

    bins[i].sensorOk   = !isnan(cm);
    bins[i].distanceCm = cm;
    bins[i].fillPct    = toFillPercent(cm);
    bins[i].status     = toStatus(bins[i].fillPct, bins[i].sensorOk);
  }
}

/* ---------------------------------------------------------------------------
 * INDICATORS
 * ------------------------------------------------------------------------- */

/**
 * Per-bin LED: lit when that bin is at or above the collection threshold.
 * BIN-01 FULL lights LED 1 and nothing else — the dashboard shows the same.
 */
inline void updateLeds() {
  for (uint8_t i = 0; i < BIN_COUNT; i++) {
    digitalWrite(LED_PIN[i], bins[i].status == ST_FULL ? HIGH : LOW);
  }
}

/** @return true if ANY bin is at or above the threshold. */
inline bool anyBinFull() {
  for (uint8_t i = 0; i < BIN_COUNT; i++) {
    if (bins[i].status == ST_FULL) return true;
  }
  return false;
}

/**
 * Shared buzzer on GPIO 13: sounds when any bin crosses the threshold,
 * then stays quiet for BUZZER_REARM_MS so a bin parked at 82 % does not
 * beep forever.
 */
inline void updateBuzzer() {
  static unsigned long lastBuzz = 0;
  static bool wasFull = false;

  bool isFull = anyBinFull();
  unsigned long now = millis();

  bool justCrossed = isFull && !wasFull;
  bool rearmed     = isFull && (now - lastBuzz > BUZZER_REARM_MS);

  if (justCrossed || rearmed) {
    for (uint8_t b = 0; b < BUZZER_BEEPS; b++) {
      digitalWrite(PIN_BUZZER, HIGH);
      delay(BUZZER_BEEP_MS);
      digitalWrite(PIN_BUZZER, LOW);
      delay(BUZZER_BEEP_MS);
    }
    lastBuzz = now;
  }

  wasFull = isFull;
}

/* ---------------------------------------------------------------------------
 * DISPLAYS
 * ------------------------------------------------------------------------- */

/** Face shown on the OLED — matches STATUS_FACE in src/lib/telemetry.ts. */
inline const char* statusFace(uint8_t status) {
  switch (status) {
    case ST_OK:      return ":)";
    case ST_FILLING: return ":|";
    case ST_FULL:    return ":(";
    default:         return "!!";
  }
}

inline const char* statusWord(uint8_t status) {
  switch (status) {
    case ST_OK:      return "OK";
    case ST_FILLING: return "FILLING";
    case ST_FULL:    return "FULL";
    default:         return "SENSOR ERR";
  }
}

/** Draw one bin's OLED. Assumes its mux channel is already selected. */
inline void drawBin(uint8_t index, bool online) {
  oled.clearDisplay();

  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.print(BIN_LABEL[index]);

  // Link state, top right — the device says the same thing as the website.
  oled.setCursor(92, 0);
  oled.print(online ? "WIFI" : "----");

  oled.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  if (bins[index].status == ST_FAULT) {
    oled.setTextSize(2);
    oled.setCursor(0, 22);
    oled.print("SENSOR");
    oled.setCursor(0, 42);
    oled.print("ERROR");
    oled.display();
    return;
  }

  // Percentage, large
  oled.setTextSize(3);
  oled.setCursor(0, 20);
  oled.print((int)round(bins[index].fillPct));
  oled.print("%");

  // Face
  oled.setTextSize(2);
  oled.setCursor(96, 24);
  oled.print(statusFace(bins[index].status));

  // Status word and raw distance
  oled.setTextSize(1);
  oled.setCursor(0, 48);
  oled.print(statusWord(bins[index].status));

  oled.setCursor(80, 48);
  oled.print(bins[index].distanceCm, 1);
  oled.print("cm");

  // Fill bar
  oled.drawRect(0, 58, 128, 6, SSD1306_WHITE);
  int w = (int)((bins[index].fillPct / 100.0f) * 126.0f);
  if (w > 0) oled.fillRect(1, 59, w, 4, SSD1306_WHITE);

  oled.display();
}

/** Refresh all four displays, one mux channel at a time. */
inline void updateDisplays(bool online) {
  for (uint8_t i = 0; i < BIN_COUNT; i++) {
    muxSelect(OLED_CH[i]);
    drawBin(i, online);
  }
  muxDisableAll();
}

/* ---------------------------------------------------------------------------
 * SETUP
 * ------------------------------------------------------------------------- */

inline void binsBegin() {
  for (uint8_t i = 0; i < BIN_COUNT; i++) {
    pinMode(TRIG_PIN[i], OUTPUT);
    pinMode(ECHO_PIN[i], INPUT);
    pinMode(LED_PIN[i], OUTPUT);
    digitalWrite(TRIG_PIN[i], LOW);
    digitalWrite(LED_PIN[i], LOW);

    bins[i].distanceCm = NAN;
    bins[i].fillPct    = NAN;
    bins[i].sensorOk   = false;
    bins[i].status     = ST_FAULT;
    bins[i].lastBuzzAt = 0;
  }

  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

  // Each display is initialised on its own mux channel.
  for (uint8_t i = 0; i < BIN_COUNT; i++) {
    muxSelect(OLED_CH[i]);
    if (!oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
#if DEBUG_SERIAL
      Serial.print(F("[oled] init failed on channel "));
      Serial.println(OLED_CH[i]);
#endif
      continue;
    }
    oled.clearDisplay();
    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(0, 24);
    oled.print(BIN_LABEL[i]);
    oled.setCursor(0, 40);
    oled.print(F("starting..."));
    oled.display();
  }
  muxDisableAll();
}

#endif  // SMARTBIN_BINS_H
