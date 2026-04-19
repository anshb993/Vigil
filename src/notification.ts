import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function scheduleReminders(
  bedH: number,
  bedM: number,
  minutesBefore: number[]
): Promise<void> {
  await cancelAllReminders();

  const granted = await requestNotificationPermission();
  if (!granted) return;

  for (const mins of minutesBefore) {
    let triggerH = bedH;
    let triggerM = bedM - mins;

    if (triggerM < 0) {
      triggerM += 60;
      triggerH -= 1;
    }
    if (triggerH < 0) triggerH += 24;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Vigil",
        body: `${mins} minute${mins === 1 ? "" : "s"} left in your day.`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: triggerH,
        minute: triggerM,
      },
    });
  }
  // Bedtime alert
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Vigil",
      body: "Your day is done.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: bedH,
      minute: bedM,
    },
  });
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  console.log("VIGIL_NOTIF_COUNT:", scheduled.length);
  console.log("VIGIL_NOTIF_DATA:", JSON.stringify(scheduled));

}

export async function cancelAllReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    await Notifications.cancelScheduledNotificationAsync(notif.identifier);
  }
  console.log("VIGIL_CANCELLED:", scheduled.length, "notifications");
}