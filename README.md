# Vigil — Conscious Time Tracker

> A mirror for your waking hours.

## What it does

- Tracks your waking hours from the moment you start your day to bedtime
- Shows a live countdown to your baseline bedtime
- Flags overtime if you're past your target
- Visualises the current day, month, and year as they pass
- Logs your daily history
- Displays a home screen widget with a live countdown and month/year progress


## Stack

- **React Native** with Expo bare workflow
- **TypeScript** (JS side), **Kotlin** (native side)
- **AsyncStorage** for app data
- **SharedPreferences** for widget data
- **Android only** (for now)


## Getting Started

### Prerequisites

- Node.js
- Android Studio + Android SDK
- A physical Android device (recommended) or emulator
- Expo CLI

### Install dependencies

```bash
npm install
```

### Run on Android

```bash
npx expo run:android
```

### Build release APK

```bash
cd android
.\gradlew.bat assembleRelease
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`


## Colour System

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#0e0e0e` | Primary background |
| `text` | `#e8e0d0` | Primary text |
| `textDim` | `#b0a890` | Secondary text |
| `textFaint` | `#6a6858` | Labels, metadata |
| `textGhost` | `#4a4838` | Inactive elements |
| `border` | `#252318` | Dividers |
| `sand` | `#d4b87a` | Gold accent |
| `over` | `#c04030` | Overtime red |


## Known Limitations

- **Screen time** — currently returns mock data. Real data requires registering `UsageStatsModule.kt` and granting the `PACKAGE_USAGE_STATS` permission.
- **Notifications** — stubbed out. Requires a dev build (`npx expo run:android`) to restore `expo-notifications`.
- **Forge Mode** — UI and toggle exist, payment integration not yet implemented.
- **Midnight reset** — no automatic new day reset yet. Must manually tap "Start New Day".
- **iOS** — not in scope yet.


## Roadmap

- [ ] Midnight auto-reset
- [ ] Real UsageStats integration
- [ ] Restore notifications (dev build)
- [ ] Forge Mode — charitable donation on distraction app open
- [ ] Play Store release via EAS Build


## License

Private project. Not open source.
