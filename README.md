# 🌾 AgriWeather LK

A software-only agricultural decision-support platform for Sri Lanka, built around open weather data.

## Included versions

### V1 — Weather intelligence
- Location-based weather
- Current temperature, humidity, wind and rainfall
- ET₀
- Model soil moisture
- 7-day forecast

### V2 — Farmer & farm records
- Firebase email/password authentication
- Farm profiles
- Crop and area
- Farm location
- Harvest/output records

### V3 — Farming Date Advisor
- Planting/transplanting
- Harvesting
- Spraying
- Fertilizing
- 14-day candidate windows
- Crop-aware rule sets
- Explainable suitability scores

### V4 — Farm analytics foundation
- Harvest yield
- Price/kg
- Quality
- Notes
- Historical farm records that can later support crop/yield models

### V5 — Automated risk engine
- Heavy rain
- Heat
- Strong wind
- Wet-condition disease watch
- Farm-specific alert records

### V6 — Telegram alerts
- Scheduled GitHub Actions worker
- Telegram Bot API integration
- User-configurable chat ID
- Encrypted GitHub secret for bot token

### V7 — WhatsApp alerts
- WhatsApp Cloud API integration scaffold
- User-configurable international phone number
- Access token and phone-number ID kept server-side

### V8 — ML-ready data foundation
The stored farm + weather + output records provide a foundation for future:
- yield prediction
- crop-specific farming-window models
- anomaly detection
- risk classification
- farm-specific recommendations

## Architecture

```text
Open-Meteo
    ↓
Web dashboard ───── Firebase Auth
    │                    │
    ├────────────── Firestore
    │                    │
    ↓                    ↓
Farming Advisor      Farm/Harvest data
    │                    │
    └──────────────┬─────┘
                   ↓
           GitHub Actions worker
                   ↓
             Risk detection
              ↙          ↘
        Telegram       WhatsApp
```

## 1. Create Firebase

Create a Firebase project and register a Web App.

Enable:
- Authentication → Email/Password
- Cloud Firestore

Firebase documentation:
https://firebase.google.com/docs/web/setup

Copy `public/config.example.js` to `public/config.js` and fill in the Web App configuration.

The Firebase web config is not a secret; the important protection is Authentication + Firestore Security Rules.

## 2. Apply Firestore rules

Use the included `firestore.rules` in Firebase Console → Firestore → Rules, or Firebase CLI.

The rules are deliberately owner-based. Do not replace them with `allow read, write: if true`.

## 3. Run locally

A static server is recommended because ES modules work better through HTTP:

```bash
python -m http.server 8000 --directory public
```

Open:
http://localhost:8000

## 4. Deploy the website

GitHub Pages can host the `public/` static site. If using the repository root as the Pages source, either move/copy the contents of `public/` to the root or use a GitHub Actions deployment workflow.

Important: do not commit `public/config.js` if you later add anything sensitive to it. Never put bot tokens or service-account credentials in frontend code.

## 5. Telegram

1. Create a Telegram bot using BotFather.
2. Obtain the bot token.
3. Have the farmer start the bot and obtain the destination chat ID.
4. Put the bot token in GitHub repository Secrets as:
   `TELEGRAM_BOT_TOKEN`
5. Farmers store only their chat ID in the web app.

The worker calls Telegram's official `sendMessage` API.

## 6. WhatsApp

Configure the official WhatsApp Business/Cloud API credentials in GitHub Secrets:
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION`

The farmer stores only their international phone number.

For proactive business-initiated WhatsApp messaging, follow Meta's current template/messaging-window requirements rather than assuming arbitrary text messages can always be delivered.

## 7. GitHub Actions alert worker

The workflow runs every 3 hours and can also be started manually.

Add repository secrets:
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `TELEGRAM_BOT_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION`

### Firebase service account

Create a service account credential with access appropriate for the Firestore worker. Store the entire JSON credential as the GitHub secret value.

Never commit this JSON to GitHub.

## 8. Future ML pipeline

Do not train a model immediately.

First collect a meaningful dataset:

```text
Farm
 ├─ location
 ├─ crop
 ├─ variety
 ├─ planting date
 ├─ weather history
 ├─ farming events
 └─ harvest
      ├─ yield
      ├─ quality
      └─ price
```

Then derive features such as:
- cumulative rainfall
- rainfall anomalies
- growing degree days
- ET₀ accumulation
- heat days
- wet-day counts
- wind exposure
- crop-stage weather summaries

Use those features for later validation of crop/yield models.

## Safety / agricultural scope

This is decision-support software. It should not claim certainty or replace local agronomist guidance. Crop thresholds should be validated against local agricultural research and crop-specific sources before being used operationally.

## License

Choose a license before public release (MIT/Apache-2.0/etc.) based on how you want others to reuse the project.
