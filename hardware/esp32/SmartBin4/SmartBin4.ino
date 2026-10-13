#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// SmartBin 4-bin ESP32 firmware.
// Bin IDs and pins match the physical prototype.
// Fill calibration: 11 cm = empty, 3 cm = full.

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* TELEMETRY_URL = "https://YOUR-VERCEL-DOMAIN.vercel.app/api/telemetry";
const char* DEVICE_API_KEY = "YOUR_IOT_DEVICE_API_KEY";

#define SDA_PIN 16
#define SCL_PIN 17
#define TCA_ADDR 0x70
#define OLED_ADDR 0x3C
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define BUZZER_PIN 13
#define EMPTY_DISTANCE_CM 11.0f
#define FULL_DISTANCE_CM 3.0f
#define TELEMETRY_INTERVAL_MS 15000UL

const uint8_t TRIG_PINS[4] = {5, 18, 19, 23};
const uint8_t ECHO_PINS[4] = {27, 34, 35, 32};
const uint8_t LED_PINS[4]  = {26, 25, 4, 14};
const char* BIN_IDS[4] = {"BIN-001", "BIN-002", "BIN-003", "BIN-004"};
const char* DEVICE_IDS[4] = {"ESP32-SMARTBIN-01", "ESP32-SMARTBIN-02", "ESP32-SMARTBIN-03", "ESP32-SMARTBIN-04"};
const uint8_t OLED_CHANNELS[4] = {3, 1, 2, 0};

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
unsigned long lastTelemetry = 0;

void selectMux(uint8_t channel) {
  Wire.beginTransmission(TCA_ADDR);
  Wire.write(1 << channel);
  Wire.endTransmission();
}

float readDistanceCm(uint8_t index) {
  digitalWrite(TRIG_PINS[index], LOW);
  delayMicroseconds(3);
  digitalWrite(TRIG_PINS[index], HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PINS[index], LOW);
  unsigned long duration = pulseIn(ECHO_PINS[index], HIGH, 30000UL);
  if (duration == 0) return NAN;
  return duration * 0.0343f / 2.0f;
}

float fillFromDistance(float distanceCm) {
  float value = ((EMPTY_DISTANCE_CM - distanceCm) / (EMPTY_DISTANCE_CM - FULL_DISTANCE_CM)) * 100.0f;
  return constrain(value, 0.0f, 100.0f);
}

const char* statusForFill(float fill) {
  if (fill >= 80.0f) return "Full";
  if (fill >= 50.0f) return "Half";
  return "Empty";
}

void drawBinFace(uint8_t index, float distance, float fill, bool sensorOk) {
  selectMux(OLED_CHANNELS[index]);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(BIN_IDS[index]);
  display.setCursor(0, 14);
  if (!sensorOk) {
    display.setTextSize(2);
    display.println("ERROR");
  } else {
    display.setTextSize(2);
    display.print((int)round(fill));
    display.println("%");
    display.setTextSize(1);
    display.setCursor(0, 39);
    display.print(distance, 1);
    display.println(" cm");
    display.setCursor(0, 52);
    display.println(statusForFill(fill));
  }
  display.display();
}

bool sendTelemetry(uint8_t index, float distanceCm, float fill, const char* status) {
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFiClientSecure client;
  client.setInsecure(); // Replace with a CA certificate for strict TLS validation in production.
  HTTPClient http;
  if (!http.begin(client, TELEMETRY_URL)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  String body = "{\"deviceId\":\"" + String(DEVICE_IDS[index]) +
                "\",\"binId\":\"" + String(BIN_IDS[index]) +
                "\",\"distanceCm\":" + String(distanceCm, 2) +
                ",\"rssi\":" + String(WiFi.RSSI()) +
                ",\"uptimeSec\":" + String(millis() / 1000UL) +
                ",\"firmware\":\"smartbin-4.0.0\"}";
  int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000UL) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  for (uint8_t i = 0; i < 4; i++) {
    pinMode(TRIG_PINS[i], OUTPUT);
    pinMode(ECHO_PINS[i], INPUT);
    pinMode(LED_PINS[i], OUTPUT);
    digitalWrite(TRIG_PINS[i], LOW);
    digitalWrite(LED_PINS[i], LOW);
  }
  connectWiFi();
}

void loop() {
  bool anyFull = false;
  for (uint8_t i = 0; i < 4; i++) {
    float distance = readDistanceCm(i);
    bool ok = isfinite(distance) && distance >= 0 && distance <= 400;
    float fill = ok ? fillFromDistance(distance) : 0;
    const char* status = ok ? statusForFill(fill) : "Error";
    digitalWrite(LED_PINS[i], ok && fill >= 80.0f ? HIGH : LOW);
    if (ok && fill >= 80.0f) anyFull = true;
    drawBinFace(i, distance, fill, ok);
    if (ok) sendTelemetry(i, distance, fill, status);
    Serial.printf("%s %s distance=%.2fcm fill=%.1f%%\n", BIN_IDS[i], status, distance, fill);
    delay(80);
  }
  digitalWrite(BUZZER_PIN, anyFull ? HIGH : LOW);
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  delay(TELEMETRY_INTERVAL_MS);
}
