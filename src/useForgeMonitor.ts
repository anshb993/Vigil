/**
 * useForgeMonitor.ts
 *
 * When Forge Mode is active and a day is running, polls UsageStats
 * every 60 seconds to detect if a distraction app was opened.
 * On detection → triggers charitable donation → notifies user.
 *
 * Donation flow uses GiveDirectly's API as an example.
 * Replace CHARITY_API_URL + your API key for production.
 */
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { wasAppOpenedSince } from "./useScreenTime";
import { AppSettings } from "./storage";

const POLL_INTERVAL_MS = 60_000; // check every 60 seconds

interface ForgeMonitorOptions {
  active: boolean;          // is a day currently running?
  settings: AppSettings;
  dayStartMs: number;       // when the day began (to check usage since then)
  onTrigger: (app: string) => void; // called when a distraction is detected
}

export function useForgeMonitor({
  active,
  settings,
  dayStartMs,
  onTrigger,
}: ForgeMonitorOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredRef = useRef<Set<string>>(new Set()); // avoid double-charging

  useEffect(() => {
    if (!active || !settings.forgeEnabled) return;

    async function check() {
      for (const pkg of settings.distractionApps) {
        if (triggeredRef.current.has(pkg)) continue;
        const opened = await wasAppOpenedSince(pkg, dayStartMs);
        if (opened) {
          triggeredRef.current.add(pkg);
          onTrigger(pkg);
          await triggerDonation(settings);
        }
      }
    }

    // Check when app comes to foreground
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });

    intervalRef.current = setInterval(check, POLL_INTERVAL_MS);
    check(); // immediate first check

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [active, settings.forgeEnabled, dayStartMs]);

  // Reset triggered set when a new day starts
  useEffect(() => {
    triggeredRef.current = new Set();
  }, [dayStartMs]);
}

/**
 * Fire the donation.
 * This is a placeholder — replace with your chosen charity's API.
 *
 * GiveDirectly API docs: https://www.givedirectly.org/api
 * Givebutter API docs:   https://givebutter.com/developers
 */
async function triggerDonation(settings: AppSettings): Promise<void> {
  const CHARITY_API_URL = "https://api.givedirectly.org/donate"; // example
  const amount = settings.forgeAmountCents;

  try {
    await fetch(CHARITY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_cents: amount,
        // In production: include user's saved payment method token
        // obtained during Forge Mode setup via Stripe or similar
      }),
    });
  } catch (e) {
    console.warn("Forge donation failed:", e);
    // In production: queue for retry
  }
}