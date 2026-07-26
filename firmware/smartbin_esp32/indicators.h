/**
 * SmartBin+ — Local Indicators
 * =============================================================================
 * Red LED, buzzer and OLED status display.
 *
 * These run entirely on the ESP32, independently of the network. That is the
 * point: a bin that has reached capacity signals it locally whether or not
 * Firebase is reachable. A collection worker standing next to the bin should
 * not need the cloud to tell them it is full.
 *
 * This is the "edge processing" the literature survey (§VII-C) argues for —
 * threshold evaluation happening on the device rather than round-tripping
 * through the cloud.
 */

#ifndef SMARTBIN_INDICATORS_H
#define SMARTBIN_INDICATORS_H

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "config.h"

#define OLED_WIDTH   128
#define OLED_HEIGHT  64
#define OLED_ADDRESS 0x3C

static Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);

static bool oledAvailable = false;
static unsigned long lastBuzzerAt = 0;
static bool wasAboveThreshold = false;

/**
 * Initialise LED, buzzer and OLED.
 */
inline void indicatorsBegin() {
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);

  // A missing OLED must not stop the device. Sensing and uploading are the
  // primary function; the display is a convenience.
  oledAvailable = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS);

  if (oledAvailable) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println(F("SmartBin+"));
    display.println(BIN_ID);
    display.println(F("Starting..."));
    display.display();
  }
#if DEBUG_SERIAL
  else {
    Serial.println(F("[oled] not detected at 0x3C - continuing without display"));
  }
#endif
}

/**
 * Sound the buzzer.
 *
 * Rate-limited by BUZZER_REARM_MS. Without that, a bin sitting at 82% would
 * beep on every reading cycle and someone would disconnect the buzzer within
 * a day.
 *
 * @param force Bypass the rate limit.
 */
inline void indicatorsBeep(bool force = false) {
  unsigned long now = millis();

  if (!force && (now - lastBuzzerAt) < BUZZER_REARM_MS) return;

  lastBuzzerAt = now;

  for (uint8_t i = 0; i < BUZZER_BEEPS; i++) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(BUZZER_BEEP_MS);
    digitalWrite(PIN_BUZZER, LOW);
    if (i < BUZZER_BEEPS - 1) delay(BUZZER_BEEP_MS);
  }
}

/**
 * Update the LED and buzzer for the current fill level.
 *
 * The LED is solid above the threshold. The buzzer fires only on the
 * transition into that state, not continuously while in it.
 *
 * @param fillPercent
 */
inline void indicatorsUpdateAlert(float fillPercent) {
  bool aboveThreshold = fillPercent >= ALERT_THRESHOLD;

  digitalWrite(PIN_LED_RED, aboveThreshold ? HIGH : LOW);

  // Rising edge only.
  if (aboveThreshold && !wasAboveThreshold) {
    indicatorsBeep(true);
#if DEBUG_SERIAL
    Serial.print(F("[alert] threshold crossed at "));
    Serial.print(fillPercent, 1);
    Serial.println(F("%"));
#endif
  }

  wasAboveThreshold = aboveThreshold;
}

/**
 * Draw the status screen.
 *
 * @param fillPercent
 * @param distanceCm
 * @param status       "Empty" / "Half" / "Full"
 * @param wifiConnected
 * @param uploadOk     Whether the last upload succeeded.
 * @param sensorOk
 */
inline void indicatorsShowStatus(float fillPercent, float distanceCm,
                                 const char* status, bool wifiConnected,
                                 bool uploadOk, bool sensorOk) {
  if (!oledAvailable) return;

  display.clearDisplay();

  // Header
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(BIN_ID);

  // Wi-Fi indicator, right-aligned
  display.setCursor(OLED_WIDTH - 24, 0);
  display.print(wifiConnected ? F("WiFi") : F("----"));

  display.drawLine(0, 10, OLED_WIDTH, 10, SSD1306_WHITE);

  if (!sensorOk) {
    display.setTextSize(1);
    display.setCursor(0, 20);
    display.println(F("SENSOR FAULT"));
    display.setCursor(0, 32);
    display.println(F("No valid echo"));
    display.setCursor(0, 44);
    display.println(F("Check wiring"));
    display.display();
    return;
  }

  // Fill percentage, large
  display.setTextSize(3);
  display.setCursor(0, 18);
  display.print((int)(fillPercent + 0.5f));
  display.setTextSize(2);
  display.print(F("%"));

  // Status word
  display.setTextSize(1);
  display.setCursor(0, 44);
  display.print(status);

  // Distance
  display.setCursor(OLED_WIDTH - 46, 44);
  display.print(distanceCm, 1);
  display.print(F("cm"));

  // Fill bar
  display.drawRect(0, 55, OLED_WIDTH, 8, SSD1306_WHITE);
  int barWidth = (int)((fillPercent / 100.0f) * (OLED_WIDTH - 2));
  if (barWidth > 0) display.fillRect(1, 56, barWidth, 6, SSD1306_WHITE);

  // Threshold tick on the bar
  int thresholdX = (int)((ALERT_THRESHOLD / 100.0f) * (OLED_WIDTH - 2));
  display.drawLine(thresholdX, 53, thresholdX, 64, SSD1306_WHITE);

  // Upload failure marker — small, but visible on inspection.
  if (!uploadOk) {
    display.setCursor(OLED_WIDTH - 8, 44);
    display.print(F("!"));
  }

  display.display();
}

/**
 * Show a connection message during boot or reconnection.
 *
 * @param line1
 * @param line2
 */
inline void indicatorsShowMessage(const char* line1, const char* line2) {
  if (!oledAvailable) return;

  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(F("SmartBin+"));
  display.println(BIN_ID);
  display.drawLine(0, 18, OLED_WIDTH, 18, SSD1306_WHITE);
  display.setCursor(0, 26);
  display.println(line1);
  if (line2) display.println(line2);
  display.display();
}

/**
 * @return true if the OLED was detected at startup.
 */
inline bool indicatorsOledAvailable() {
  return oledAvailable;
}

#endif  // SMARTBIN_INDICATORS_H
