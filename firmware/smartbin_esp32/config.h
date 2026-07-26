/**
 * SmartBin+ — Firmware Configuration
 * =============================================================================
 * Per-device settings. Every bin gets its own copy of this file with a
 * different BIN_ID.
 *
 * SECURITY: this file contains Wi-Fi and Firebase credentials. Add it to
 * .gitignore before committing. A template is provided as config.example.h.
 *
 * Values marked REPORT are fixed by the Major Project Phase-I report
 * (CSEP23605) and match the web application exactly. If you change one here,
 * change it in config/app.config.js too — a dashboard and a device that
 * disagree about what "80% full" means is worse than either being wrong alone.
 */

#ifndef SMARTBIN_CONFIG_H
#define SMARTBIN_CONFIG_H

/* ---------------------------------------------------------------------------
 * DEVICE IDENTITY
 * Each physical bin needs a unique ID matching its Firebase registration.
 * ------------------------------------------------------------------------- */
#define BIN_ID          "BIN-001"
#define FIRMWARE_VERSION "1.0.0"

/* ---------------------------------------------------------------------------
 * NETWORK
 * ------------------------------------------------------------------------- */
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

/* ---------------------------------------------------------------------------
 * FIREBASE
 * From Firebase Console → Project Settings → General → Web API Key,
 * and Realtime Database → the URL shown at the top of the Data tab.
 * ------------------------------------------------------------------------- */
#define FIREBASE_HOST   "https://YOUR-PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_API_KEY "YOUR_WEB_API_KEY"

/**
 * Device service account.
 *
 * Create a dedicated Email/Password user in Firebase Authentication for the
 * devices — do NOT reuse an administrator login. The security rules grant
 * this account write access to bins/{id}/live only.
 */
#define DEVICE_EMAIL    "device@smartbin.local"
#define DEVICE_PASSWORD "YOUR_DEVICE_PASSWORD"

/* ---------------------------------------------------------------------------
 * PINS — REPORT §5.1 Step 1
 * "The HC-SR04 ultrasonic sensor's TRIG and ECHO pins were connected to
 *  GPIO 5 and GPIO 18 of the ESP32 development board, respectively."
 * ------------------------------------------------------------------------- */
#define PIN_TRIG        5     // REPORT
#define PIN_ECHO        18    // REPORT
#define PIN_LED_RED     2
#define PIN_BUZZER      4
#define PIN_OLED_SDA    21
#define PIN_OLED_SCL    22

/* ---------------------------------------------------------------------------
 * SENSING — REPORT §3.3, §3.1, §5.2
 * ------------------------------------------------------------------------- */

/** d_max: sensor-to-bottom distance when empty. REPORT §3.3 — 20 cm bin. */
#define BIN_DEPTH_CM    20.0f

/** HC-SR04 datasheet limits. REPORT §3.3. */
#define SENSOR_MIN_CM   2.0f
#define SENSOR_MAX_CM   400.0f

/** Rolling median window. REPORT §5.2 item 1 — "five-sample rolling median". */
#define MEDIAN_WINDOW   5

/** Delay between the samples that feed one median, in milliseconds. */
#define SAMPLE_DELAY_MS 60

/* ---------------------------------------------------------------------------
 * THRESHOLDS — REPORT §3.1
 * Bands: Empty 0-50, Half 51-79, Full 80-100.
 * ------------------------------------------------------------------------- */
#define BAND_EMPTY_MAX  50.0f
#define BAND_HALF_MAX   79.0f
#define ALERT_THRESHOLD 80.0f

/* ---------------------------------------------------------------------------
 * TIMING — REPORT §3.1, §5.2
 * ------------------------------------------------------------------------- */

/** Transmit interval. REPORT §3.1 — "default: 60 seconds". */
#define UPLOAD_INTERVAL_MS   60000UL

/** Local sensor read interval — the OLED updates faster than we transmit. */
#define SENSE_INTERVAL_MS    2000UL

/** Reconnect back-off. REPORT §5.2 item 2 — "initial retry: 1 s, max: 30 s". */
#define RECONNECT_INITIAL_MS 1000UL
#define RECONNECT_MAX_MS     30000UL
#define RECONNECT_FACTOR     2

/** Wi-Fi association timeout on boot. */
#define WIFI_CONNECT_TIMEOUT_MS 20000UL

/* ---------------------------------------------------------------------------
 * INDICATORS
 * ------------------------------------------------------------------------- */

/** Buzzer beep duration when the threshold is first crossed, milliseconds. */
#define BUZZER_BEEP_MS  180

/** Number of beeps on a threshold breach. */
#define BUZZER_BEEPS    3

/**
 * Buzzer re-arm interval.
 *
 * Without this a bin sitting at 82% would beep every reading cycle, and the
 * buzzer would be disconnected by the end of the first day.
 */
#define BUZZER_REARM_MS 900000UL   // 15 minutes

/* ---------------------------------------------------------------------------
 * DIAGNOSTICS
 * ------------------------------------------------------------------------- */
#define SERIAL_BAUD     115200

/** Set to 0 to silence serial output in a deployed unit. */
#define DEBUG_SERIAL    1

#endif  // SMARTBIN_CONFIG_H
