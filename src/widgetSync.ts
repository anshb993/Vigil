// src/widgetSync.ts
//
// Call these from App.tsx whenever wake time, settings, or day
// state changes — keeps the widget in sync with the app.

import { NativeModules } from "react-native";

const { SharedPrefs } = NativeModules;

function isAvailable(): boolean {
  return !!SharedPrefs;
}

/** Call when user logs wake time */
export async function syncWakeTime(wakeTimeISO: string): Promise<void> {
  if (!isAvailable()) return;
  try {
    const ms = new Date(wakeTimeISO).getTime();
    await SharedPrefs.setWakeTime(ms);
  } catch (e) {
    console.warn("widgetSync.syncWakeTime failed:", e);
  }
}

/** Call when settings change (bedtime baseline) */
export async function syncBedBaseline(h: number, m: number): Promise<void> {
  if (!isAvailable()) return;
  try {
    await SharedPrefs.setBedBaseline(h, m);
  } catch (e) {
    console.warn("widgetSync.syncBedBaseline failed:", e);
  }
}

/** Call when day ends */
export async function syncDayEnded(): Promise<void> {
  if (!isAvailable()) return;
  try {
    await SharedPrefs.setDayEnded(true);
  } catch (e) {
    console.warn("widgetSync.syncDayEnded failed:", e);
  }
}

/** Call at start of new day / clear */
export async function syncClearDay(): Promise<void> {
  if (!isAvailable()) return;
  try {
    await SharedPrefs.clearDay();
  } catch (e) {
    console.warn("widgetSync.syncClearDay failed:", e);
  }
}
