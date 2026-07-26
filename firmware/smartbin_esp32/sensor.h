/**
 * SmartBin+ — Ultrasonic Sensing
 * =============================================================================
 * HC-SR04 driver with the outlier rejection and median filtering specified in
 * the project report.
 *
 * REPORT §3.1 (preprocessing):
 *   "The ESP32 firmware shall validate each sensor reading against bounds
 *    (0 cm to d_max cm), discard outliers arising from sensor noise or
 *    transient obstructions."
 *
 * REPORT §5.2 item 1 (implementation issue):
 *   "The HC-SR04 occasionally produced spurious readings when waste material
 *    was positioned at oblique angles to the sensor beam. A five-sample
 *    rolling median filter was implemented to suppress transient outliers
 *    without introducing perceptible latency."
 *
 * The fill formula here is identical to js/utils/fill.js. That duplication is
 * deliberate and unavoidable — two languages, one definition — and is the
 * reason both sites carry this comment.
 */

#ifndef SMARTBIN_SENSOR_H
#define SMARTBIN_SENSOR_H

#include <Arduino.h>
#include "config.h"

/** Speed of sound at ~20°C, in cm per microsecond. */
static const float SOUND_CM_PER_US = 0.0343f;

/**
 * Echo timeout in microseconds.
 *
 * Sized to SENSOR_MAX_CM for the round trip. Without a timeout, pulseIn()
 * blocks for a full second when no echo returns — which happens whenever the
 * lid is open or the beam hits waste at an oblique angle, so it is not an
 * edge case.
 */
static const unsigned long ECHO_TIMEOUT_US =
    (unsigned long)((SENSOR_MAX_CM * 2.0f) / SOUND_CM_PER_US);

/** Rolling sample buffer. */
static float sampleBuffer[MEDIAN_WINDOW];
static uint8_t sampleCount = 0;

/** Set false when a reading cannot be obtained; reported to the dashboard. */
static bool sensorHealthy = true;

/**
 * Initialise the sensor pins.
 */
inline void sensorBegin() {
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  // Settle time before the first reading; the HC-SR04 is unreliable if
  // triggered immediately after power-up.
  delay(50);
}

/**
 * Take one raw distance measurement.
 *
 * @return Distance in centimetres, or -1.0 if no valid echo returned.
 */
inline float sensorReadRaw() {
  // 10 microsecond trigger pulse — HC-SR04 datasheet requirement.
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duration = pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);

  if (duration == 0) return -1.0f;   // timed out — no echo

  // Round trip, so halve it.
  float distance = (duration * SOUND_CM_PER_US) / 2.0f;

  return distance;
}

/**
 * Validate a reading against physical bounds.
 *
 * REPORT §3.1. A reading well beyond the bin depth means the pulse missed the
 * waste surface entirely — an oblique echo, or the lid left open.
 *
 * @param distanceCm
 * @return true if the reading is plausible.
 */
inline bool sensorIsValid(float distanceCm) {
  if (distanceCm < 0) return false;
  if (distanceCm < SENSOR_MIN_CM) return false;
  if (distanceCm > SENSOR_MAX_CM) return false;

  // 1.5x the bin depth allows for a slightly deeper bin or a sensor mounted
  // a little above the lid, while still rejecting a missed echo.
  if (distanceCm > BIN_DEPTH_CM * 1.5f) return false;

  return true;
}

/**
 * Insertion sort. Chosen over qsort() because MEDIAN_WINDOW is 5 — for an
 * array that small, insertion sort is faster and adds no library weight.
 *
 * @param values  Array to sort in place.
 * @param length
 */
inline void sortAscending(float* values, uint8_t length) {
  for (uint8_t i = 1; i < length; i++) {
    float key = values[i];
    int8_t j = i - 1;

    while (j >= 0 && values[j] > key) {
      values[j + 1] = values[j];
      j--;
    }
    values[j + 1] = key;
  }
}

/**
 * Take a filtered distance reading.
 *
 * Collects MEDIAN_WINDOW samples, discards invalid ones, and returns the
 * median of what remains. Median rather than mean specifically because a
 * single wild outlier moves a mean but cannot move a median — which is
 * exactly the failure mode documented in report §5.2.
 *
 * @return Distance in centimetres, or -1.0 if no valid samples were obtained.
 */
inline float sensorReadFiltered() {
  float valid[MEDIAN_WINDOW];
  uint8_t validCount = 0;

  for (uint8_t i = 0; i < MEDIAN_WINDOW; i++) {
    float reading = sensorReadRaw();

    if (sensorIsValid(reading)) {
      valid[validCount++] = reading;
    }

    if (i < MEDIAN_WINDOW - 1) delay(SAMPLE_DELAY_MS);
  }

  // Fewer than half the samples valid means something is genuinely wrong,
  // not just noisy — report a fault rather than a confident median of two.
  if (validCount < (MEDIAN_WINDOW / 2) + 1) {
    sensorHealthy = false;
    return -1.0f;
  }

  sensorHealthy = true;

  sortAscending(valid, validCount);

  if (validCount % 2 == 1) {
    return valid[validCount / 2];
  }

  return (valid[validCount / 2 - 1] + valid[validCount / 2]) / 2.0f;
}

/**
 * Convert distance to fill percentage.
 *
 * REPORT §3.1:  fillPercent = (1 - d_measured / d_max) x 100
 *
 * The report prints this with a typographical error — the division and
 * subtraction are lost in the PDF conversion — but the intent is unambiguous
 * from the surrounding text. This is the same expression implemented in
 * js/utils/fill.js.
 *
 * @param distanceCm
 * @return Fill percentage clamped to [0, 100].
 */
inline float sensorFillPercent(float distanceCm) {
  if (distanceCm < 0) return 0.0f;

  float fill = (1.0f - (distanceCm / BIN_DEPTH_CM)) * 100.0f;

  // Clamping is physically necessary: waste heaped above the sensor plane
  // gives a negative distance ratio, and a misread can exceed the depth.
  if (fill < 0.0f)   fill = 0.0f;
  if (fill > 100.0f) fill = 100.0f;

  return fill;
}

/**
 * Classify a fill percentage. REPORT §3.1 — three states, exact strings.
 * The dashboard reads these values, so they must not be reworded.
 *
 * @param fillPercent
 * @return "Empty", "Half" or "Full".
 */
inline const char* sensorBinStatus(float fillPercent) {
  if (fillPercent <= BAND_EMPTY_MAX) return "Empty";
  if (fillPercent <= BAND_HALF_MAX)  return "Half";
  return "Full";
}

/**
 * @return false if the last filtered read failed.
 */
inline bool sensorIsHealthy() {
  return sensorHealthy;
}

#endif  // SMARTBIN_SENSOR_H
