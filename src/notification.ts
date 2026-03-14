/**
 * notifications.ts
 * STUBBED — expo-notifications is not supported in Expo Go SDK 53+.
 * Replace this file's contents with the real implementation when you
 * run: npx expo run:android  (dev build)
 */

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function scheduleBedtimeNudge(_bedTargetMs: number): Promise<void> {
  // no-op in Expo Go
}

export async function cancelBedtimeNudge(): Promise<void> {
  // no-op in Expo Go
}