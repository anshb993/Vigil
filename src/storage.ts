/**
 * storage.ts
 * Typed AsyncStorage helpers. All app data goes through here.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface DayLog {
  date: string;        // ISO date string "2026-03-08"
  wakeTime: string;    // ISO datetime
  bedTime: string | null;
  baselineBedH: number;
  baselineBedM: number;
  overtime: boolean;
}

export interface AppSettings {
  baselineBedH: number;
  baselineBedM: number;
  forgeEnabled: boolean;
  forgeAmountCents: number;
  forgeCharity: string;
  distractionApps: string[]; // package names e.g. "com.instagram.android"
}

const KEYS = {
  SETTINGS:    "vigil:settings",
  HISTORY:     "vigil:history",
  ACTIVE_DAY:  "vigil:activeDay",
};

// ── Settings ──────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  baselineBedH: 23,
  baselineBedM: 45,
  forgeEnabled: false,
  forgeAmountCents: 500,  // $5.00
  forgeCharity: "GiveDirectly",
  distractionApps: [
    "com.instagram.android",
    "com.twitter.android",
    "com.zhiliaoapp.musically", // TikTok
    "com.reddit.frontpage",
  ],
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(s));
}

// ── Active day ────────────────────────────────────────────────────

export async function loadActiveDay(): Promise<Partial<DayLog> | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.ACTIVE_DAY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveActiveDay(day: Partial<DayLog>): Promise<void> {
  await AsyncStorage.setItem(KEYS.ACTIVE_DAY, JSON.stringify(day));
}

export async function clearActiveDay(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.ACTIVE_DAY);
}

// ── History ───────────────────────────────────────────────────────

export async function loadHistory(): Promise<DayLog[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function appendToHistory(day: DayLog): Promise<void> {
  const history = await loadHistory();
  // Avoid duplicates for same date
  const filtered = history.filter((d) => d.date !== day.date);
  const updated = [day, ...filtered].slice(0, 365); // keep 1 year max
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
}

// ── Utility ───────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}