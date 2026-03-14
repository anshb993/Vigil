/**
 * useScreenTime.ts
 * JS wrapper around the native UsageStats module.
 * Falls back to mock data on iOS / simulators.
 */
import { NativeModules, Platform } from "react-native";

const { UsageStats } = NativeModules;

export interface AppUsage {
  packageName: string;
  displayName: string;
  minutes: number;
}

// Human-readable names for common apps
const APP_NAMES: Record<string, string> = {
  "com.instagram.android":    "Instagram",
  "com.twitter.android":      "Twitter / X",
  "com.zhiliaoapp.musically": "TikTok",
  "com.reddit.frontpage":     "Reddit",
  "com.google.android.youtube": "YouTube",
  "com.whatsapp":             "WhatsApp",
  "com.facebook.katana":      "Facebook",
  "com.snapchat.android":     "Snapchat",
};

const MOCK_DATA: AppUsage[] = [
  { packageName: "com.whatsapp",             displayName: "WhatsApp",  minutes: 47 },
  { packageName: "com.android.chrome",       displayName: "Browser",   minutes: 91 },
  { packageName: "com.instagram.android",    displayName: "Instagram", minutes: 68 },
  { packageName: "com.google.android.youtube", displayName: "YouTube", minutes: 34 },
];

/**
 * Request usage stats permission.
 * Returns true if already granted, false if the settings screen was opened.
 */
export async function requestUsagePermission(): Promise<boolean> {
  if (Platform.OS !== "android" || !UsageStats) return false;
  return UsageStats.checkAndRequestPermission();
}

/**
 * Get today's screen time, sorted by most used.
 * Returns mock data on non-Android platforms.
 */
export async function getTodayScreenTime(): Promise<AppUsage[]> {
  if (Platform.OS !== "android" || !UsageStats) {
    return MOCK_DATA;
  }

  try {
    const raw: Record<string, number> = await UsageStats.getTodayUsage();
    return Object.entries(raw)
      .map(([pkg, ms]) => ({
        packageName: pkg,
        displayName: APP_NAMES[pkg] ?? pkg.split(".").pop() ?? pkg,
        minutes: Math.round(ms / 60000),
      }))
      .filter((a) => a.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8); // top 8 apps
  } catch {
    return MOCK_DATA;
  }
}

/**
 * Check if a specific app was opened since a given timestamp.
 * Used by Forge Mode monitoring.
 */
export async function wasAppOpenedSince(
  packageName: string,
  sinceMs: number
): Promise<boolean> {
  if (Platform.OS !== "android" || !UsageStats) return false;
  try {
    const lastUsed: number = await UsageStats.getLastUsed(packageName);
    return lastUsed > sinceMs;
  } catch {
    return false;
  }
}