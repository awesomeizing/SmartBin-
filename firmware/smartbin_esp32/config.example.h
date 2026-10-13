/**
 * SmartBin+ — Firmware Configuration (4-bin build)
 * =============================================================================
 * ONE ESP32 drives all four physical bins:
 *   · four HC-SR04 ultrasonic sensors
 *   · four indicator LEDs
 *   · four SSD1306 OLEDs behind a TCA9548A I2C multiplexer
 *   · one shared buzzer
 *
 * SECURITY: this file holds Wi-Fi and Firebase credentials. Copy it to
 * config.h from config.example.h and keep config.h out of git.
 *
 * The calibration and threshold values below are mirrored in
 * src/config/devices.config.ts. A dashboard and a device that disagree about
 * what "80 % full" means is worse than either being wrong alone — if you
 * change one, change both.
 */

#ifndef SMARTBIN_CONFIG_H
#define SMARTBIN_CONFIG_H

/* ---------------------------------------------------------------------------
 * NETWORK
 * ------------------------------------------------------------------------- */
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

/* ---------------------------------------------------------------------------
 * FIREBASE
 * Console → Project Settings → General → Web API Key, and
 * Realtime Database → the URL at the top of the Data tab.
 * ------------------------------------------------------------------------- */
#define FIREBASE_HOST   "https://YOUR-PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_API_KEY "YOUR_WEB_API_KEY"

/**
 * Device service account.
 *
 * Create a dedicated Email/Password user in Firebase Authentication for the
 * hardware — never reuse an administrator login. The security rules in
 * firebase-rules.json grant this account write access to bins/{id}/live and
 * nothing else.
 */
#define DEVICE_EMAIL    "device@smartbin.local"
#define DEVICE_PASSWORD "YOUR_DEVICE_PASSWORD"

#define FIRMWARE_VERSION "2.0.0"

/* ---------------------------------------------------------------------------
 * BIN COUNT
 * ------------------------------------------------------------------------- */
#define BIN_COUNT 4

/* ---------------------------------------------------------------------------
 * PER-BIN WIRING
 *
 *   Bin   TRIG   ECHO   LED   OLED channel
 *   ----  -----  -----  ----  ------------
 *    1      5     27     26        3
 *    2     18     34     25        1
 *    3     19     35      4        2
 *    4     23     32     14        0
 *
 * NOTE — GPIO 34 and 35 are INPUT-ONLY on the ESP32. That is fine for ECHO
 * (an input) and would be broken for TRIG or an LED. Do not swap them.
 *
 * NOTE — HC-SR04 ECHO idles at 5 V and the ESP32 pins are 3.3 V tolerant
 * only. Each ECHO line must go through a level shifter or a divider
 * (1 kΩ series + 2 kΩ to ground works). Driving these pins at 5 V will
 * eventually destroy the input.
 *
 * Defined as initialisers so bins live in ARRAYS, never as four copy-pasted
 * blocks of code.
 * ------------------------------------------------------------------------- */
#define BIN_IDS        { "BIN-01", "BIN-02", "BIN-03", "BIN-04" }
#define BIN_DEVICE_IDS { "ESP32-SMARTBIN-01", "ESP32-SMARTBIN-02", \
                         "ESP32-SMARTBIN-03", "ESP32-SMARTBIN-04" }
#define BIN_LABELS     { "Bin 1", "Bin 2", "Bin 3", "Bin 4" }

#define PINS_TRIG      {  5, 18, 19, 23 }
#define PINS_ECHO      { 27, 34, 35, 32 }
#define PINS_LED       { 26, 25,  4, 14 }
#define OLED_CHANNELS  {  3,  1,  2,  0 }

/* ---------------------------------------------------------------------------
 * SHARED HARDWARE
 * ------------------------------------------------------------------------- */
#define PIN_BUZZER      13
#define PIN_I2C_SDA     16
#define PIN_I2C_SCL     17

#define TCA9548A_ADDR   0x70
#define OLED_ADDR       0x3C
#define OLED_WIDTH      128
#define OLED_HEIGHT     64

/* ---------------------------------------------------------------------------
 * SENSOR CALIBRATION — mirrors src/config/devices.config.ts
 *
 *   fillPct = ((EMPTY_DISTANCE_CM - d) / (EMPTY_DISTANCE_CM - FULL_DISTANCE_CM)) * 100
 *
 *   11 cm → 0 %      7 cm → 50 %      3 cm → 100 %
 *
 * These are MEASURED values for the prototype, not the bin's geometric
 * depth — the sensor sits below the lid, so the usable travel is 8 cm.
 * ------------------------------------------------------------------------- */
#define EMPTY_DISTANCE_CM 11.0f
#define FULL_DISTANCE_CM   3.0f

/** HC-SR04 datasheet limits. A reading outside this is a FAULT, not 0 %. */
#define SENSOR_MIN_CM   2.0f
#define SENSOR_MAX_CM   400.0f

/** Five-sample rolling median rejects the single-sample spikes HC-SR04 emits. */
#define MEDIAN_WINDOW   5
#define SAMPLE_DELAY_MS 40

/** Echo wait before declaring no-echo, microseconds (~400 cm round trip). */
#define ECHO_TIMEOUT_US 25000UL

/* ---------------------------------------------------------------------------
 * THRESHOLDS — mirrors src/config/devices.config.ts
 * OK 0–49 · FILLING 50–79 · FULL 80–100
 * ------------------------------------------------------------------------- */
#define BAND_OK_MAX      49.0f
#define BAND_FILLING_MAX 79.0f
#define ALERT_THRESHOLD  80.0f

/* ---------------------------------------------------------------------------
 * TIMING
 *
 * The dashboard marks a device OFFLINE after DEVICE_OFFLINE_TIMEOUT_MS
 * (50 s by default). UPLOAD_INTERVAL_MS must stay comfortably below that or
 * a healthy bin will flicker offline between transmissions.
 * ------------------------------------------------------------------------- */
#define UPLOAD_INTERVAL_MS   15000UL   // telemetry + heartbeat, every 15 s
#define SENSE_INTERVAL_MS     2000UL   // ultrasonic sampling

/**
 * OLED redraw interval.
 *
 * Much faster than sensing, because the faces blink, the waste level ripples
 * and the FULL banner flashes. Four 1 KB frames at 400 kHz take roughly
 * 100 ms, so 200 ms leaves headroom.
 */
#define DISPLAY_INTERVAL_MS    200UL
#define RECONNECT_INITIAL_MS  1000UL
#define RECONNECT_MAX_MS     30000UL
#define RECONNECT_FACTOR      2
#define WIFI_CONNECT_TIMEOUT_MS 20000UL

/* ---------------------------------------------------------------------------
 * INDICATORS
 * ------------------------------------------------------------------------- */
#define BUZZER_BEEP_MS  180
#define BUZZER_BEEPS    3

/**
 * Buzzer re-arm interval.
 *
 * Without this, a bin sitting at 82 % would beep on every cycle and the
 * buzzer would be disconnected by the end of the first day.
 */
#define BUZZER_REARM_MS 900000UL   // 15 minutes

/* ---------------------------------------------------------------------------
 * DIAGNOSTICS
 * ------------------------------------------------------------------------- */
#define SERIAL_BAUD     115200
#define DEBUG_SERIAL    1

#endif  // SMARTBIN_CONFIG_H
