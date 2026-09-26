# AgriWeather LK

A software-only agricultural weather intelligence MVP using open weather data.

## Features
- Location search
- Current temperature, humidity, wind and precipitation probability
- ET₀ and near-surface soil moisture from the weather model
- 7-day forecast
- Temperature/rain probability chart
- Rule-based irrigation, spraying, disease-risk and heat-stress indicators
- Crop selector
- No hardware
- No API key required for this MVP

## Data
Weather data: Open-Meteo (https://open-meteo.com/)

## Run locally
Open `index.html` in a browser. If your browser blocks API requests from local files, use a simple local server:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy on GitHub Pages
1. Create a public GitHub repository, e.g. `agriweather-lk`.
2. Upload `index.html`, `style.css`, and `app.js`.
3. Open Settings → Pages.
4. Under Build and deployment, choose "Deploy from a branch".
5. Select `main` and `/ (root)`.
6. Save and open the generated Pages URL.

GitHub Pages hosts static HTML/CSS/JS directly from a repository.
