import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Vigil",
  slug: "vigil",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    backgroundColor: "#0e0e0e",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0e0e0e",
    },
    package: "com.yourname.vigil",
    permissions: [
      // For UsageStats (screen time) - user grants manually in Settings
      "android.permission.PACKAGE_USAGE_STATS",
      // For scheduling bedtime nudge notifications
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.SCHEDULE_EXACT_ALARM",
    ],
  },
  plugins: [
    [
      "expo-notifications",
      {
        color: "#d4b87a",
      },
    ],
  ],
});