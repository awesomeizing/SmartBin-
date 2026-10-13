/* SmartBin+ 4-bin ESP32 controller. One ESP32 reads all four physical bins. */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define DEVICE_API_KEY "YOUR_IOT_DEVICE_API_KEY"
#define TELEMETRY_URL "https://smart-bins-alpha.vercel.app/api/telemetry"
#define CONTROLLER_ID "ESP32-SMARTBIN-01"
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

struct BinConfig{const char* id;uint8_t trig;uint8_t echo;uint8_t led;uint8_t mux;};
BinConfig bins[4]={{"BIN-01",5,27,26,3},{"BIN-02",18,34,25,1},{"BIN-03",19,35,4,2},{"BIN-04",23,32,14,0}};
Adafruit_SSD1306 display(OLED_WIDTH,OLED_HEIGHT,&Wire,-1);
float distanceCm[4]={11,11,11,11},fillPct[4]={0,0,0,0};bool sensorOk[4]={false,false,false,false};unsigned long lastSense=0,lastTelemetry=0,lastWifiAttempt=0;bool displayReady=false;
void mux(uint8_t c){Wire.beginTransmission(TCA_ADDR);Wire.write(1<<c);Wire.endTransmission();}
float readCm(uint8_t trig,uint8_t echo){digitalWrite(trig,LOW);delayMicroseconds(3);digitalWrite(trig,HIGH);delayMicroseconds(10);digitalWrite(trig,LOW);unsigned long d=pulseIn(echo,HIGH,30000UL);if(!d)return NAN;float cm=d*.0343f/2.0f;return(cm<2||cm>400)?NAN:cm;}
float fill(float cm){return constrain(((EMPTY_DISTANCE_CM-cm)/(EMPTY_DISTANCE_CM-FULL_DISTANCE_CM))*100.0f,0.0f,100.0f);}
const char* status(float f){return f>=80?"Full":f>=50?"Half":"Empty";}
void oled(uint8_t i){if(!displayReady)return;mux(bins[i].mux);display.clearDisplay();display.setTextColor(SSD1306_WHITE);display.setTextSize(1);display.setCursor(0,0);display.print(bins[i].id);display.setCursor(88,0);display.print(WiFi.status()==WL_CONNECTED?"NET":"OFF");display.setTextSize(2);display.setCursor(0,16);if(!sensorOk[i]){display.print("ERROR");}else{display.print(fillPct[i],1);display.print("%");display.setTextSize(1);display.setCursor(0,43);display.print(distanceCm[i],1);display.print(" cm ");display.print(status(fillPct[i]));}display.display();}
void wifi(){if(WiFi.status()==WL_CONNECTED||millis()-lastWifiAttempt< WIFI_RETRY_INTERVAL_MS)return;lastWifiAttempt=millis();WiFi.mode(WIFI_STA);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);unsigned long start=millis();while(WiFi.status()!=WL_CONNECTED&&millis()-start<8000)delay(250);Serial.println(WiFi.status()==WL_CONNECTED?"[wifi] connected":"[wifi] offline");}
bool postBin(uint8_t i){if(WiFi.status()!=WL_CONNECTED||!sensorOk[i])return false;WiFiClientSecure client;client.setInsecure();HTTPClient http;if(!http.begin(client,TELEMETRY_URL))return false;http.setTimeout(7000);http.addHeader("Content-Type","application/json");http.addHeader("X-Device-Key",DEVICE_API_KEY);JsonDocument doc;doc["deviceId"]=CONTROLLER_ID;doc["binId"]=bins[i].id;doc["distanceCm"]=roundf(distanceCm[i]*10)/10.0f;doc["rssi"]=WiFi.RSSI();doc["uptimeSec"]=millis()/1000UL;doc["firmware"]=FIRMWARE_VERSION;String body;serializeJson(doc,body);int code=http.POST(body);http.end();Serial.printf("[telemetry] %s %.1fcm %.1f%% -> %d\n",bins[i].id,distanceCm[i],fillPct[i],code);return code>=200&&code<300;}
void sense(){bool anyFull=false;for(uint8_t i=0;i<4;i++){float d=readCm(bins[i].trig,bins[i].echo);sensorOk[i]=isfinite(d);if(sensorOk[i]){distanceCm[i]=d;fillPct[i]=fill(d);digitalWrite(bins[i].led,fillPct[i]>=FULL_THRESHOLD);if(fillPct[i]>=FULL_THRESHOLD)anyFull=true;}else digitalWrite(bins[i].led,LOW);oled(i);Serial.printf("[sense] %s %.1fcm %.1f%% %s\n",bins[i].id,distanceCm[i],fillPct[i],sensorOk[i]?status(fillPct[i]):"ERROR");}if(anyFull){digitalWrite(BUZZER_PIN,HIGH);delay(120);digitalWrite(BUZZER_PIN,LOW);}}
void setup(){Serial.begin(115200);Wire.begin(SDA_PIN,SCL_PIN);for(auto &b:bins){pinMode(b.trig,OUTPUT);pinMode(b.echo,INPUT);pinMode(b.led,OUTPUT);digitalWrite(b.trig,LOW);digitalWrite(b.led,LOW);}pinMode(BUZZER_PIN,OUTPUT);digitalWrite(BUZZER_PIN,LOW);mux(0);displayReady=display.begin(SSD1306_SWITCHCAPVCC,OLED_ADDR);wifi();sense();lastSense=millis();lastTelemetry=millis()-TELEMETRY_INTERVAL_MS;}
void loop(){unsigned long now=millis();wifi();if(now-lastSense>=SENSOR_INTERVAL_MS){lastSense=now;sense();}if(now-lastTelemetry>=TELEMETRY_INTERVAL_MS){lastTelemetry=now;for(uint8_t i=0;i<4;i++)postBin(i);}delay(20);}
