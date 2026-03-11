#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>

/* Pin Mapping */
#define DHTPIN 4
#define GASPIN 34
#define BUZZER 18

#define SDA_PIN 21
#define SCL_PIN 22

#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2);

int gasBaseline = 0;
int gasThreshold = 200;   // difference from baseline

void setup()
{
  Serial.begin(115200);

  Wire.begin(SDA_PIN, SCL_PIN);

  pinMode(BUZZER, OUTPUT);
  digitalWrite(BUZZER, LOW);

  dht.begin();

  lcd.init();
  lcd.backlight();

  lcd.setCursor(0,0);
  lcd.print("Food Monitor");
  lcd.setCursor(0,1);
  lcd.print("Calibrating...");
  
  Serial.println("Calibrating Gas Sensor...");

  delay(3000);

  /* Baseline calibration */
  for(int i=0;i<50;i++)
  {
    gasBaseline += analogRead(GASPIN);
    delay(100);
  }

  gasBaseline = gasBaseline / 50;

  Serial.print("Gas Baseline: ");
  Serial.println(gasBaseline);

  lcd.clear();
}

void loop()
{
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  int gasValue = analogRead(GASPIN);

  if (isnan(temperature) || isnan(humidity))
  {
    Serial.println("DHT Error");
    lcd.clear();
    lcd.setCursor(0,0);
    lcd.print("Sensor Error");
    delay(2000);
    return;
  }

  Serial.print("Temp: ");
  Serial.println(temperature);

  Serial.print("Humidity: ");
  Serial.println(humidity);

  Serial.print("Gas: ");
  Serial.println(gasValue);

  lcd.clear();

  lcd.setCursor(0,0);
  lcd.print("T:");
  lcd.print(temperature);
  lcd.print("C ");

  lcd.print("H:");
  lcd.print(humidity);

  lcd.setCursor(0,1);
  lcd.print("Gas:");
  lcd.print(gasValue);

  /* Gas condition logic */

  if(gasValue > gasBaseline + gasThreshold)
  {
    digitalWrite(BUZZER, HIGH);
    lcd.setCursor(11,1);
    lcd.print("BAD");
  }
  else if(gasValue > gasBaseline + 100)
  {
    digitalWrite(BUZZER, LOW);
    lcd.setCursor(11,1);
    lcd.print("WARN");
  }
  else
  {
    digitalWrite(BUZZER, LOW);
    lcd.setCursor(11,1);
    lcd.print("OK ");
  }

  delay(2000);
}