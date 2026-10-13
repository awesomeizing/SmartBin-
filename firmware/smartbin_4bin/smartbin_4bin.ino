/*
 * SmartBin+ — 4-Bin ESP32 Controller
 *
 * One ESP32 reads all four physical bins, drives their local LEDs/OLEDs,
 * drives the shared buzzer, and posts one telemetry record per bin to:
 *   https://smart-bins-alpha.vercel.app/api/telemetry
 *
 * Hardware supplied for the project:
 *   Bin 1: TRIG 5,  ECHO 27, LED 26, OLED mux channel 3
 *   Bin 2: TRIG 18, ECHO 34, LED 25, OLED mux channel 1
 *   Bin 3: TRIG 19, ECHO 35, LED 4,  OLED mux channel 2
 *   Bin 4: TRIG 23, ECHO 32, LED 14, OLED mux channel 0
 *   Shared: buzzer 13, I2C SDA 16, SCL 17, TCA9548A 0x70, OLED 0x3C
 *
 * Calibration:
 *   EMPTY_DISTANCE_CM = 11
 *   FULL_DISTANCE_CM  = 3
 *   fill = ((11 - distance) / 8) * 100, clamped 0..100
 *
 * Install Arduino libraries:
 *   Adafruit GFX Library
 *   Adafruit SSD1306
 *   ArduinoJson
 *
 * IMPORTANT: do not commit real Wi-Fi/API credentials to GitHub.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"
#define DEVICE_API_KEY  "YOUR_IOT_DEVICE_API_KEY"
#define TELEMETRY_URL   "https://smart-bins-alpha.vercel.app/api/telemetry"
#define CONTROLLER_ID   "ESP32-SMARTBIN-01"
#define FIRMWARE_VERSION "2.0.0"

#define SDA_PIN 16
#define SCL_PIN 17
#define TCA_ADDR 0x70
#define OLED_ADDR 0x3C
#define OLED_WIDTH 128
#define OLED_HEIGHT 64

#define BUZZER_PIN 13
#define EMPTY_DISTANCE_CM 11.0f
#define FULL_DISTANCE_CM 3.0f
#define FULL_THRESHOLD 80.0f
#define TELEMETRY_INTERVAL_MS 15000UL
#define SENSOR_INTERVAL_MS 2000UL
#define WIFI_RETRY_INTERVAL_MS 5000UL
#define SERIAL_BAUD 115200

struct BinConfig {
  const char* binId;
  uint8_t trig;
  uint8_t echo;
  uint8_t led;
  uint8_t muxChannel;
};

BinConfig bins[4] = {
  {"BIN-01", 5,  27, 26, 3},
  {"BIN-02", 18, 34, 25, 1},
  {"BIN-03", 19, 35, 4,  2},
  {"BIN-04", 23, 32, 14, 0},
};

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
float distances[4] = {11, 11, 11, 11};
float fills[4] = {0, 0, 0, 0};
bool sensorOk[4] = {false, false, false, false};
bool lastFull[4] = {false, false, false, false};
unsigned long lastSense = 0;
unsigned long lastTelemetry = 0;
unsigned long lastWifiAttempt = 0;
bool displayReady = false;

void selectMux(uint8_t channel) {
  if (channel > 7) return;
  Wire.beginTransmission(TCA_ADDR);
  Wire.write(1 << channel);
  Wire.endTransmission();
}

float readDistanceCm(uint8_t trig, uint8_t echo) {
  digitalWrite(trig, LOW);
  delayMicroseconds(3);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  unsigned long duration = pulseIn(echo, HIGH, 30000UL);
  if (duration == 0) return NAN;
  float distance = duration * 0.0343f / 2.0f;
  if (distance < 2.0f || distance > 400.0f) return NAN;
  return distance;
}

float fillFromDistance(float distance) {
  float fill = ((EMPTY_DISTANCE_CM - distance) / (EMPTY_DISTANCE_CM - FULL_DISTANCE_CM)) * 100.0f;
  return constrain(fill, 0.0f, 100.0f);
}

const char* statusForFill(float fill) {
  if (fill >= 80.0f) return "Full";
  if (fill >= 50.0f) return "Half";
  return "Empty";
}

void drawBinDisplay(uint8_t i) {
  if (!displayReady) return;
  selectMux(bins[i].muxChannel);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(bins[i].binId);
  display.setCursor(88, 0);
  display.print(WiFi.status() == WL_CONNECTED ? "NET" : "OFF");
  display.setTextSize(2);
  display.setCursor(0, 16);
  if (!sensorOk[i]) {
    display.println("ERROR");
    display.setTextSize(1);
    display.setCursor(0, 42);
    display.println("Sensor unavailable");
  } else {
    display.print(fills[i], 1);
    display.println("%");
    display.setTextSize(1);
    display.setCursor(0, 43);
    display.print(distances[i], 1);
    display.print(" cm  ");
    display.println(statusForFill(fills[i]));
  }
  display.display();
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWifiAttempt < WIFI_RETRY_INTERVAL_MS) return;
  lastWifiAttempt = millis();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[wifi] connecting");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 8000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[wifi] connected: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[wifi] offline; local sensing continues");
  }
}

bool postTelemetry(uint8_t i) {
  if (WiFi.status() != WL_CONNECTED || !sensorOk[i]) return false;

  WiFiClientSecure client;
  client.setInsecure(); // Prototype deployment. Replace with server CA validation for production.
  HTTPClient http;
  if (!http.begin(client, TELEMETRY_URL)) return false;
  http.setTimeout(7000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  JsonDocument payload;
  payload["deviceId"] = CONTROLLER_ID;
  payload["binId"] = bins[i].binId;
  payload["distanceCm"] = roundf(distances[i] * 10.0f) / 10.0f;
  payload["rssi"] = WiFi.RSSI();
  payload["uptimeSec"] = millis() / 1000UL;
  payload["firmware"] = FIRMWARE_VERSION;

  String body;
  serializeJson(payload, body);
  int status = http.POST(body);
  String response = http.getString();
  http.end();

  Serial.printf("[telemetry] %s %.1fcm %.1f%% -> HTTP %d\n", bins[i].binId, distances[i], fills[i], status);
  return status >= 200 && status < 300;
}

void updateLocalState() {
  bool anyFull = false;
  for (uint8_t i = 0; i < 4; i++) {
    float d = readDistanceCm(bins[i].trig, bins[i].echo);
    sensorOk[i] = isfinite(d);
    if (sensorOk[i]) {
      distances[i] = d;
      fills[i] = fillFromDistance(d);
      digitalWrite(bins[i].led, fills[i] >= FULL_THRESHOLD ? HIGH : LOW);
      if (fills[i] >= FULL_THRESHOLD) anyFull = true;
    } else {
      digitalWrite(bins[i].led, LOW);
    }
    drawBinDisplay(i);
    Serial.printf("[sense] %s: %.1f cm -> %.1f%% %s\n", bins[i].binId, distances[i], fills[i], sensorOk[i] ? statusForFill(fills[i]) : "ERROR");
  }

  if (anyFull) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(120);
    digitalWrite(BUZZER_PIN, LOW);
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(500);
  Wire.begin(SDA_PIN, SCL_PIN);

  for (uint8_t i = 0; i < 4; i++) {
    pinMode(bins[i].trig, OUTPUT);
    pinMode(bins[i].echo, INPUT);
    pinMode(bins[i].led, OUTPUT);
    digitalWrite(bins[i].trig, LOW);
    digitalWrite(bins[i].led, LOW);
  }
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  selectMux(0);
  displayReady = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  connectWifi();
  updateLocalState();
  lastSense = millis();
  lastTelemetry = millis() - TELEMETRY_INTERVAL_MS;
}

void loop() {
  unsigned long now = millis();
  connectWifi();

  if (now - lastSense >= SENSOR_INTERVAL_MS) {
    lastSense = now;
    updateLocalState();
  }

  if (now - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
    lastTelemetry = now;
    for (uint8_t i = 0; i < 4; i++) postTelemetry(i);
  }

  delay(20);
}
