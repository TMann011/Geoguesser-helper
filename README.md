# GeoGuessr Pro Utility Suite - Chromium Extension (Manifest V3)

A high-performance Chrome / Chromium extension engineered for GeoGuessr that intercepts panorama metadata, extracts coordinates, predicts locations, renders tactical HUD telemetry, and automates game assistance.

---

## Architecture Overview

- **`manifest.json`**: Manifest V3 extension configuration with host permissions for `https://*.geoguessr.com/*`.
- **`injected.js`**: Main-world execution script intercepting `fetch` and `XMLHttpRequest` streams for game tokens and Street View metadata.
- **`content.js`**: Isolated-world bridge connecting page events with the extension background worker and rendering the custom HUD.
- **`background.js`**: Service worker handling telemetry relay, storage, and cross-tab communication.
- **`hud/`**: Floating tactical HUD stylesheet and in-game coordinate display.
- **`popup/`**: Interactive popup settings console for toggling features, hotkeys, and automation thresholds.
- **`icons/`**: Standard extension iconography (16px, 48px, 128px).

---

## Installation (Load Unpacked)

1. Open your Chromium-based browser (Google Chrome, Brave, Microsoft Edge, Opera).
2. Navigate to: `chrome://extensions/`
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** in the top-left menu.
5. Select this folder directly.
6. Navigate to [GeoGuessr](https://www.geoguessr.com) and start playing!
