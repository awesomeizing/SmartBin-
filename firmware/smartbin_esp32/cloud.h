/**
 * SmartBin+ — Wi-Fi and Firebase Transport
 * =============================================================================
 * Wi-Fi association with exponential back-off, and authenticated writes to the
 * Firebase Realtime Database over HTTPS.
 *
 * REPORT §5.2 item 2:
 *   "Intermittent Wi-Fi disconnections caused data gaps in the Firebase
 *    timeline. An automatic reconnection handler with exponential back-off
 *    (initial retry: 1 s, max: 30 s) was added to the firmware to ensure
 *    resilient cloud connectivity."
 *
 * REPORT §5.2 item 4:
 *   "The ESP32's 520 KB SRAM required careful JSON object sizing to avoid heap
 *    fragmentation over long uptime periods. Static buffer allocation using
 *    StaticJsonDocument<256> replaced dynamic allocation, reducing heap churn."
 *
 * Both are implemented below. The static document is the reason this firmware
 * can run for weeks without the slow memory decay that kills naive ESP32
 * projects.
 */

#ifndef SMARTBIN_CLOUD_H
#define SMARTBIN_CLOUD_H

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"

/** Current back-off delay, doubling on each failure up to RECONNECT_MAX_MS. */
static unsigned long reconnectDelay = RECONNECT_INITIAL_MS;
static unsigned long lastReconnectAttempt = 0;

/** Firebase ID token from the device service account. */
static String idToken = "";
static unsigned long tokenExpiresAt = 0;

/** Whether the most recent upload succeeded — surfaced on the OLED. */
static bool lastUploadOk = false;

/**
 * Connect to Wi-Fi, blocking up to WIFI_CONNECT_TIMEOUT_MS.
 *
 * @return true if associated.
 */
inline bool cloudConnectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

#if DEBUG_SERIAL
  Serial.print(F("[wifi] connecting to "));
  Serial.println(WIFI_SSID);
#endif

  unsigned long started = millis();

  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - started > WIFI_CONNECT_TIMEOUT_MS) {
#if DEBUG_SERIAL
      Serial.println(F("[wifi] connection timed out"));
#endif
      return false;
    }
    delay(250);
  }

#if DEBUG_SERIAL
  Serial.print(F("[wifi] connected, IP "));
  Serial.print(WiFi.localIP());
  Serial.print(F(", RSSI "));
  Serial.println(WiFi.RSSI());
#endif

  // Success resets the back-off — the next outage starts from 1 s again.
  reconnectDelay = RECONNECT_INITIAL_MS;
  return true;
}

/**
 * Attempt reconnection, respecting the current back-off interval.
 *
 * Non-blocking: returns immediately if it is not yet time to retry, so the
 * main loop keeps sensing and driving the local indicators during an outage.
 *
 * @return true if connected.
 */
inline bool cloudEnsureConnection() {
  if (WiFi.status() == WL_CONNECTED) {
    reconnectDelay = RECONNECT_INITIAL_MS;
    return true;
  }

  unsigned long now = millis();
  if (now - lastReconnectAttempt < reconnectDelay) return false;

  lastReconnectAttempt = now;

#if DEBUG_SERIAL
  Serial.print(F("[wifi] reconnecting, back-off "));
  Serial.print(reconnectDelay);
  Serial.println(F(" ms"));
#endif

  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Short blocking window; if it fails we back off and let the loop continue.
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 5000) {
    delay(200);
  }

  if (WiFi.status() == WL_CONNECTED) {
    reconnectDelay = RECONNECT_INITIAL_MS;
    idToken = "";          // force re-authentication
#if DEBUG_SERIAL
    Serial.println(F("[wifi] reconnected"));
#endif
    return true;
  }

  // Exponential back-off, capped. REPORT §5.2 item 2.
  reconnectDelay = min(reconnectDelay * RECONNECT_FACTOR, (unsigned long)RECONNECT_MAX_MS);
  return false;
}

/**
 * Authenticate the device service account and cache an ID token.
 *
 * Tokens are valid for one hour; this refreshes at 55 minutes to avoid
 * writing with a token that expires mid-request.
 *
 * @return true if a valid token is held.
 */
inline bool cloudAuthenticate() {
  if (idToken.length() > 0 && millis() < tokenExpiresAt) return true;
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;

  String url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=";
  url += FIREBASE_API_KEY;

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> request;
  request["email"] = DEVICE_EMAIL;
  request["password"] = DEVICE_PASSWORD;
  request["returnSecureToken"] = true;

  String body;
  serializeJson(request, body);

  int status = http.POST(body);

  if (status != 200) {
#if DEBUG_SERIAL
    Serial.print(F("[auth] failed, HTTP "));
    Serial.println(status);
#endif
    http.end();
    return false;
  }

  // The auth response includes the full token, so this buffer must be
  // generous — an ID token alone is around 900 bytes.
  StaticJsonDocument<1536> response;
  DeserializationError error = deserializeJson(response, http.getString());
  http.end();

  if (error) {
#if DEBUG_SERIAL
    Serial.print(F("[auth] parse error: "));
    Serial.println(error.c_str());
#endif
    return false;
  }

  idToken = response["idToken"].as<String>();
  tokenExpiresAt = millis() + (55UL * 60UL * 1000UL);   // refresh at 55 min

#if DEBUG_SERIAL
  Serial.println(F("[auth] device authenticated"));
#endif

  return idToken.length() > 0;
}

/**
 * Upload a telemetry reading.
 *
 * Writes to bins/{BIN_ID}/live via a PUT, replacing the node. History is
 * appended by the dashboard rather than the device, to keep the firmware's
 * request count and payload size down.
 *
 * @param distanceCm
 * @param fillPercent
 * @param binStatus   "Empty" / "Half" / "Full"
 * @param sensorOk
 * @return true on HTTP 200.
 */
inline bool cloudUpload(float distanceCm, float fillPercent,
                        const char* binStatus, bool sensorOk) {
  if (!cloudEnsureConnection()) { lastUploadOk = false; return false; }
  if (!cloudAuthenticate())     { lastUploadOk = false; return false; }

  HTTPClient http;

  String url = String(FIREBASE_HOST) + "/bins/" + BIN_ID + "/live.json?auth=" + idToken;

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // StaticJsonDocument, not DynamicJsonDocument. REPORT §5.2 item 4 — this is
  // what prevents heap fragmentation over long uptime.
  StaticJsonDocument<256> payload;

  payload["distanceCm"]    = round(distanceCm * 10) / 10.0;
  payload["fillPct"]       = round(fillPercent * 10) / 10.0;
  payload["binStatus"]     = binStatus;
  payload["messageStatus"] = "Delivered";
  payload["rssi"]          = WiFi.RSSI();
  payload["uptimeSec"]     = millis() / 1000;
  payload["firmware"]      = FIRMWARE_VERSION;
  payload["timestamp"]     = (unsigned long)(millis());

  String body;
  serializeJson(payload, body);

  int status = http.PUT(body);
  http.end();

  lastUploadOk = (status == 200);

#if DEBUG_SERIAL
  if (lastUploadOk) {
    Serial.print(F("[cloud] uploaded "));
    Serial.print(fillPercent, 1);
    Serial.print(F("% ("));
    Serial.print(distanceCm, 1);
    Serial.println(F(" cm)"));
  } else {
    Serial.print(F("[cloud] upload failed, HTTP "));
    Serial.println(status);
  }
#endif

  // A 401 means the token expired early; clear it so the next cycle
  // re-authenticates rather than repeating a doomed request.
  if (status == 401) idToken = "";

  return lastUploadOk;
}

/**
 * Report component health to bins/{BIN_ID}/health.
 *
 * @param sensorOk
 * @return true on success.
 */
inline bool cloudUploadHealth(bool sensorOk) {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (!cloudAuthenticate()) return false;

  HTTPClient http;

  String url = String(FIREBASE_HOST) + "/bins/" + BIN_ID + "/health.json?auth=" + idToken;

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<192> payload;
  payload["sensorOk"]  = sensorOk;
  payload["wifiOk"]    = true;
  payload["updatedAt"] = (unsigned long)millis();

  String body;
  serializeJson(payload, body);

  int status = http.PATCH(body);
  http.end();

  return status == 200;
}

/** @return true if the last upload succeeded. */
inline bool cloudLastUploadOk() { return lastUploadOk; }

/** @return current Wi-Fi RSSI, or 0 when disconnected. */
inline int cloudRssi() {
  return WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
}

/** @return true if associated with the access point. */
inline bool cloudWiFiConnected() {
  return WiFi.status() == WL_CONNECTED;
}

#endif  // SMARTBIN_CLOUD_H
