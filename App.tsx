/**
 * App.tsx — Vigil for Android
 *
 * React Native port of the Vigil web app.
 * Key differences from web version:
 *   - SVG via react-native-svg (same API, different imports)
 *   - Layout via StyleSheet + View/Text instead of divs
 *   - Storage via AsyncStorage (persistent across sessions)
 *   - Notifications via expo-notifications (real push)
 *   - Screen time via native UsageStats bridge (real data)
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Platform,
} from "react-native";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import {
  loadSettings,
  saveSettings,
  loadActiveDay,
  saveActiveDay,
  clearActiveDay,
  loadHistory,
  appendToHistory,
  DEFAULT_SETTINGS,
  AppSettings,
  DayLog,
} from "./src/storage";
import {
  requestNotificationPermission,
  scheduleBedtimeNudge,
  cancelBedtimeNudge,
} from "./src/notification";
import {
  requestUsagePermission,
  getTodayScreenTime,
  AppUsage,
} from "./src/useScreenTime";

import {
  syncWakeTime,
  syncBedBaseline,
  syncDayEnded,
  syncClearDay,
} from "./src/widgetSync";

// ─── Helpers ──────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(Math.floor(n)).padStart(2, "0");
}

function formatDuration(totalSeconds: number, showSeconds = true): string {
  const abs = Math.abs(totalSeconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (showSeconds) return `${h}:${pad(m)}:${pad(s)}`;
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: "short", month: "short", day: "numeric",
  });
}

function getBedTarget(wakeISO: string, settings: AppSettings): Date {
  const wake = new Date(wakeISO);
  const bed = new Date(wake);
  bed.setHours(settings.baselineBedH, settings.baselineBedM, 0, 0);
  if (bed <= wake) bed.setDate(bed.getDate() + 1);
  return bed;
}

// ─── Colours ──────────────────────────────────────────────────────────────

const C = {
  bg: "#0e0e0e",
  text: "#e8e0d0",
  textDim: "#b0a890",
  textFaint: "#6a6858",
  textGhost: "#4a4838",
  border: "#252318",
  borderDim: "#2a2818",
  sand: "#d4b87a",
  sandMid: "#9a8450",
  over: "#c04030",
  gold: "#d4b87a",
};

// ─── Screen constants ─────────────────────────────────────────────────────

type Screen = "onboarding" | "home" | "history" | "settings";
type HomeTab = "today" | "month" | "year";

// ─── App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [homeTab, setHomeTab] = useState<HomeTab>("today");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [wakeTime, setWakeTime] = useState<string | null>(null);
  const [bedTime, setBedTime] = useState<string | null>(null);
  const [dayEnded, setDayEnded] = useState(false);
  const [history, setHistoryState] = useState<DayLog[]>([]);
  const [screenTime, setScreenTime] = useState<AppUsage[]>([]);
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoSecs, setUndoSecs] = useState(5);
  const [now, setNow] = useState(new Date());

  const undoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Boot: load persisted state ─────────────────────────────────
  useEffect(() => {
    async function boot() {
      const [s, active, hist] = await Promise.all([
        loadSettings(),
        loadActiveDay(),
        loadHistory(),
      ]);
      setSettings(s);
      setHistoryState(hist);

      if (active?.wakeTime) {
        setWakeTime(active.wakeTime);
        if (active.bedTime) {
          setBedTime(active.bedTime);
          setDayEnded(true);
        }
        setScreen("home");
      } else if (hist.length > 0) {
        // Returning user who has no active day
        setScreen("home");
      }

      await requestNotificationPermission();
      await requestUsagePermission();
    }
    boot();
  }, []);

  // ── Clock tick ────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Refresh screen time every 5 min ──────────────────────────
  useEffect(() => {
    getTodayScreenTime().then(setScreenTime);
    const t = setInterval(() => getTodayScreenTime().then(setScreenTime), 5 * 60000);
    return () => clearInterval(t);
  }, []);

  // ── Derived values ────────────────────────────────────────────
  const bedTarget = wakeTime ? getBedTarget(wakeTime, settings) : null;
  const secsLeft = bedTarget ? Math.floor((bedTarget.getTime() - now.getTime()) / 1000) : null;
  const isOvertime = secsLeft !== null && secsLeft < 0;
  const totalWindow = wakeTime && bedTarget
    ? (bedTarget.getTime() - new Date(wakeTime).getTime()) / 1000
    : null;
  const elapsed = wakeTime ? (now.getTime() - new Date(wakeTime).getTime()) / 1000 : 0;
  const progress = totalWindow ? Math.min(Math.max(elapsed / totalWindow, 0), 1) : 0;



  // ── Actions ───────────────────────────────────────────────────
  const logWake = useCallback(async (time?: Date) => {
    const t = (time ?? new Date()).toISOString();
    setWakeTime(t);
    setScreen("home");
    await saveActiveDay({ wakeTime: t });
    await syncWakeTime(t);
    if (bedTarget) await scheduleBedtimeNudge(getBedTarget(t, settings).getTime());
  }, [settings]);

  const confirmBedtime = useCallback(() => {
    setUndoSecs(5);
    setUndoVisible(true);
    if (undoRef.current) clearInterval(undoRef.current);
    let rem = 5;
    undoRef.current = setInterval(async () => {
      rem -= 1;
      setUndoSecs(rem);
      if (rem <= 0) {
        clearInterval(undoRef.current!);
        undoRef.current = null;
        await commitBedtime();
      }
    }, 1000);
  }, [wakeTime, settings]);

  const commitBedtime = useCallback(async () => {
    const bn = new Date();
    setBedTime(bn.toISOString());
    setDayEnded(true);
    setUndoVisible(false);
    await cancelBedtimeNudge();
    await syncDayEnded();
    if (wakeTime) {
      const log: DayLog = {
        date: new Date(wakeTime).toISOString().split("T")[0],
        wakeTime,
        bedTime: bn.toISOString(),
        baselineBedH: settings.baselineBedH,
        baselineBedM: settings.baselineBedM,
        overtime: bedTarget ? bn > bedTarget : false,
      };
      await appendToHistory(log);
      await saveActiveDay({ wakeTime, bedTime: bn.toISOString() });
      setHistoryState(await loadHistory());
    }
  }, [wakeTime, settings, bedTarget]);

  const undoBedtime = useCallback(() => {
    if (undoRef.current) { clearInterval(undoRef.current); undoRef.current = null; }
    setUndoVisible(false);
  }, []);

  const saveSettingsAndApply = useCallback(async (s: AppSettings) => {
    setSettings(s);
    await saveSettings(s);
    await syncBedBaseline(s.baselineBedH, s.baselineBedM);
  }, []);

  // ── Month/Year data ───────────────────────────────────────────
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const curDay = now.getDate();
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
  const monthProgress =
    (curDay - 1 + (now.getHours() * 60 + now.getMinutes()) / 1440) / daysInMonth;
  const dayOfYear = Math.floor((now.getTime() - new Date(curYear, 0, 0).getTime()) / 86400000);
  const isLeap = (curYear % 4 === 0 && curYear % 100 !== 0) || curYear % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;
  const yearProgress = dayOfYear / daysInYear;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ── Render ────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 72 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── ONBOARDING ── */}
          {screen === "onboarding" && (
            <View style={[s.pad, { paddingTop: 72, alignItems: "center" }]}>
              <Text style={[s.label, { marginBottom: 12 }]}>conscious time</Text>
              <Text style={[s.serif, { fontSize: 64, color: C.text }]}>Vigil</Text>
              <Text style={[s.body, { textAlign: "center", marginTop: 20, marginBottom: 56, lineHeight: 22 }]}>
                A mirror for your waking hours.{"\n"}No coaching. No goals. Only what is.
              </Text>
              <View style={{ width: "100%", marginBottom: 32 }}>
                <Text style={[s.label, { marginBottom: 20 }]}>Set your baseline</Text>
                <Text style={[s.sublabel, { marginBottom: 8 }]}>TARGET BEDTIME</Text>
                <View style={s.row}>
                  {/* Simple inline pickers — swap with @react-native-picker/picker */}
                  <TouchableOpacity
                    style={s.pickerBtn}
                    onPress={() => saveSettingsAndApply({
                      ...settings,
                      baselineBedH: (settings.baselineBedH + 1) % 24,
                    })}
                  >
                    <Text style={s.pickerVal}>{pad(settings.baselineBedH)}</Text>
                    <Text style={s.pickerLabel}>hour ↕</Text>
                  </TouchableOpacity>
                  <Text style={[s.body, { color: C.textFaint, paddingHorizontal: 8 }]}>:</Text>
                  <TouchableOpacity
                    style={s.pickerBtn}
                    onPress={() => saveSettingsAndApply({
                      ...settings,
                      baselineBedM: (settings.baselineBedM + 15) % 60,
                    })}
                  >
                    <Text style={s.pickerVal}>{pad(settings.baselineBedM)}</Text>
                    <Text style={s.pickerLabel}>min ↕</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={[s.btnPrimary, { width: "100%", marginBottom: 10 }]} onPress={() => setScreen("home")}>
                <Text style={s.btnPrimaryText}>Begin</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── HOME ── */}
          {screen === "home" && (
            <View>
              <View style={[s.row, s.pad, { paddingTop: 24, justifyContent: "space-between" }]}>
                <Text style={s.sectionTitle}>VIGIL</Text>
                <Text style={[s.sectionTitle]}>{formatDate(now)}</Text>
              </View>

              {/* Tab bar */}
              <View style={[s.row, { borderBottomWidth: 1, borderBottomColor: C.borderDim, marginHorizontal: 28, marginTop: 16 }]}>
                {(["today", "month", "year"] as HomeTab[]).map(tab => (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setHomeTab(tab)}
                    style={[s.tab, homeTab === tab && s.tabActive]}
                  >
                    <Text style={[s.tabText, homeTab === tab && s.tabTextActive]}>
                      {tab.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* TODAY */}
              {homeTab === "today" && (
                <View style={[s.pad, { paddingTop: 28, alignItems: "center" }]}>
                  {!wakeTime && (
                    <View style={{ width: "100%", alignItems: "center" }}>
                      <Text style={[s.label, { marginBottom: 32 }]}>DAY NOT STARTED</Text>
                      <Text style={[s.serif, { fontSize: 42, color: C.textGhost, marginBottom: 36 }]}>
                        {formatTime(now)}
                      </Text>
                      <TouchableOpacity style={[s.btnPrimary, { width: "100%", marginBottom: 10 }]} onPress={() => logWake()}>
                        <Text style={s.btnPrimaryText}>Start</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {wakeTime && dayEnded && (
                    <View style={{ alignItems: "center" }}>
                      <Text style={[s.label, { marginBottom: 20 }]}>DAY ENDED</Text>
                      <Text style={[s.serif, { fontSize: 42, color: C.textGhost }]}>
                        {formatDuration(elapsed, false)}
                      </Text>
                      <Text style={[s.tiny, { marginTop: 6, color: C.textFaint }]}>awake today</Text>
                      {bedTime && (
                        <Text style={[s.body, { marginTop: 16, color: C.textFaint }]}>
                          Slept at {formatTime(new Date(bedTime))}
                        </Text>
                      )}
                    </View>
                  )}

                  {wakeTime && !dayEnded && (
                    <View style={{ width: "100%", alignItems: "center" }}>
                      {/* Countdown */}
                      {isOvertime ? (
                        <View style={{ alignItems: "center", marginBottom: 16 }}>
                          <Text style={[s.tiny, { color: C.over, letterSpacing: 2, marginBottom: 4 }]}>OVERTIME</Text>
                          <Text style={[s.serif, { fontSize: 42, color: C.over }]}>
                            +{formatDuration(Math.abs(secsLeft!))}
                          </Text>
                        </View>
                      ) : (
                        <View style={{ alignItems: "center", marginBottom: 16 }}>
                          <Text style={[s.serif, { fontSize: 55, color: C.text }]}>
                            {formatDuration(secsLeft!)}
                          </Text>
                          <Text style={[s.tiny, { color: C.textFaint, marginTop: 4 }]}>REMAINING</Text>
                        </View>
                      )}

                      {/* Stats row */}
                      <View style={[s.row, { width: "100%", gap: 1, marginBottom: 1 }]}>
                        {[
                          { label: "ELAPSED", value: formatDuration(elapsed, false) },
                          { label: "TARGET BED", value: bedTarget ? formatTime(bedTarget) : "—" },
                          { label: "WINDOW", value: totalWindow ? `${(totalWindow / 3600).toFixed(1)}h` : "—" },
                        ].map(({ label, value }) => (
                          <View key={label} style={s.statCell}>
                            <Text style={s.statLabel}>{label}</Text>
                            <Text style={s.statValue}>{value}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Screen time */}
                      <View style={[s.card, { width: "100%", marginBottom: 1 }]}>
                        <Text style={[s.tiny, { color: C.textFaint, marginBottom: 14 }]}>SCREEN TIME — TODAY</Text>
                        {screenTime.slice(0, 4).map(({ displayName, minutes, packageName }) => (
                          <View key={packageName} style={{ marginBottom: 10 }}>
                            <View style={[s.row, { justifyContent: "space-between", marginBottom: 4 }]}>
                              <Text style={[s.body, { color: C.textDim }]}>{displayName}</Text>
                              <Text style={[s.tiny, { color: C.textFaint }]}>{minutes}m</Text>
                            </View>
                            <View style={s.barTrack}>
                              <View style={[s.barFill, { width: `${Math.min((minutes / 120) * 100, 100)}%` as any }]} />
                            </View>
                          </View>
                        ))}
                      </View>

                      <TouchableOpacity style={[s.btnGhost, { width: "100%" }]} onPress={confirmBedtime}>
                        <Text style={s.btnGhostText}>End day — confirm bedtime now</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* MONTH */}
              {homeTab === "month" && (
                <View style={s.pad}>
                  <View style={[s.row, { justifyContent: "space-between", marginBottom: 24 }]}>
                    <Text style={[s.body, { color: C.textDim, letterSpacing: 1 }]}>
                      {now.toLocaleDateString([], { month: "long", year: "numeric" }).toUpperCase()}
                    </Text>
                    <Text style={[s.tiny, { color: C.textFaint }]}>day {curDay} of {daysInMonth}</Text>
                  </View>

                  {/* Day bubbles */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 28 }}>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const d = i + 1;
                      const isToday = d === curDay;
                      const isPast = d < curDay;
                      const isFuture = d > curDay;
                      return (
                        <View key={d} style={[
                          s.dayBubble,
                          isPast && { backgroundColor: "#2a2818" },
                          isToday && { backgroundColor: "#9a8450" },
                          isFuture && { borderColor: "#3a3828" },
                        ]}>
                          {isToday && (
                            <View style={[s.dayFill, { height: `${progress * 100}%` as any }]} />
                          )}
                          <Text style={[s.tiny, {
                            color: isPast ? "#9a9070" : isToday ? "#0e0e0e" : "#5a5848",
                            position: "relative", zIndex: 1,
                          }]}>{d}</Text>
                        </View>
                      );
                    })}
                  </View>

                  <ProgressBar label="MONTH ELAPSED" pct={monthProgress} />
                  <View style={s.callout}>
                    <Text style={[s.body, { color: C.textFaint }]}>Days remaining</Text>
                    <Text style={[s.body, { color: C.textDim }]}>{daysInMonth - curDay}</Text>
                  </View>
                </View>
              )}

              {/* YEAR */}
              {homeTab === "year" && (
                <View style={s.pad}>
                  <View style={[s.row, { justifyContent: "space-between", marginBottom: 24 }]}>
                    <Text style={[s.body, { color: C.textDim, letterSpacing: 1 }]}>{curYear}</Text>
                    <Text style={[s.tiny, { color: C.textFaint }]}>day {dayOfYear} of {daysInYear}</Text>
                  </View>

                  {/* Month bubbles — 2 rows of 6 */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
                    {monthNames.map((name, i) => {
                      const isPast = i < curMonth;
                      const isNow = i === curMonth;
                      const isFuture = i > curMonth;
                      const dInMo = new Date(curYear, i + 1, 0).getDate();
                      const fill = isNow
                        ? (curDay - 1 + (now.getHours() * 60 + now.getMinutes()) / 1440) / dInMo
                        : isPast ? 1 : 0;
                      return (
                        <View key={i} style={[
                          s.monthBubble,
                          isNow && { borderColor: C.sandMid },
                          isFuture && { borderColor: "#2a2818" },
                        ]}>
                          {!isFuture && (
                            <View style={[s.dayFill, { height: `${fill * 100}%` as any, backgroundColor: isPast ? "#2a2818" : "#6e5e3a" }]} />
                          )}
                          <Text style={[s.tiny, { fontSize: 8, color: isFuture ? "#4a4838" : isPast ? "#7a7868" : C.gold, zIndex: 1 }]}>
                            {name}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <ProgressBar label="YEAR ELAPSED" pct={yearProgress} />
                  <View style={s.callout}>
                    <Text style={[s.body, { color: C.textFaint }]}>Days remaining in {curYear}</Text>
                    <Text style={[s.body, { color: C.textDim }]}>{daysInYear - dayOfYear}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── HISTORY ── */}
          {screen === "history" && (
            <View style={[s.pad, { paddingTop: 24, justifyContent: "space-between" }]}>
              <Text style={[s.sectionTitle, { marginBottom: 36 }]}>History</Text>
              {history.map((day, i) => (
                <View key={i} style={s.historyRow}>
                  <Text style={[s.body, { color: C.textDim, width: 96 }]}>
                    {new Date(day.date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <View style={[s.row, { marginBottom: 8 }]}>
                      <Text style={s.histTag}>WAKE </Text>
                      <Text style={s.histVal}>{formatTime(new Date(day.wakeTime))}  </Text>
                      <Text style={s.histTag}>BED </Text>
                      <Text style={[s.histVal, day.overtime && { color: C.over }]}>
                        {day.bedTime ? formatTime(new Date(day.bedTime)) : "—"}
                      </Text>
                    </View>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, {
                        width: `${Math.min(((day.bedTime ? (new Date(day.bedTime).getTime() - new Date(day.wakeTime).getTime()) / 3600000 : 0) / 16) * 100, 100)}%` as any,
                        backgroundColor: day.overtime ? "#6a1810" : "#4a4030",
                      }]} />
                    </View>
                    {day.overtime && (
                      <Text style={[s.tiny, { color: C.over, marginTop: 4 }]}>overtime</Text>
                    )}
                  </View>
                </View>
              ))}
              {history.length === 0 && (
                <Text style={[s.body, { color: C.textGhost }]}>No days logged yet.</Text>
              )}
            </View>
          )}

          {/* ── SETTINGS ── */}
          {screen === "settings" && (
            <View style={[s.pad, { paddingTop: 24, justifyContent: "space-between" }]}>
              <Text style={s.sectionTitle}>Baseline</Text>
              <Text style={[s.sublabel, { marginTop: 28, marginBottom: 10 }]}>TARGET BEDTIME</Text>
              <View style={s.row}>
                <TouchableOpacity style={s.pickerBtn} onPress={() =>
                  saveSettingsAndApply({ ...settings, baselineBedH: (settings.baselineBedH + 1) % 24 })
                }>
                  <Text style={s.pickerVal}>{pad(settings.baselineBedH)}</Text>
                  <Text style={s.pickerLabel}>hour ↕</Text>
                </TouchableOpacity>
                <Text style={[s.body, { color: C.textFaint, paddingHorizontal: 8 }]}>:</Text>
                <TouchableOpacity style={s.pickerBtn} onPress={() =>
                  saveSettingsAndApply({ ...settings, baselineBedM: (settings.baselineBedM + 15) % 60 })
                }>
                  <Text style={s.pickerVal}>{pad(settings.baselineBedM)}</Text>
                  <Text style={s.pickerLabel}>min ↕</Text>
                </TouchableOpacity>
              </View>

              <View style={[s.divider, { marginVertical: 36 }]} />

            </View>
          )}
        </ScrollView>

        {/* ── UNDO TOAST ── */}
        {undoVisible && (
          <View style={s.undoToast}>
            <Text style={[s.body, { color: C.textDim }]}>
              Committing in {undoSecs}s
            </Text>
            <TouchableOpacity onPress={undoBedtime} style={s.undoBtn}>
              <Text style={[s.tiny, { color: C.text }]}>UNDO</Text>
            </TouchableOpacity>
          </View>
        )}



        {/* ── BOTTOM NAV ── */}
        {screen !== "onboarding" && (
          <View style={s.nav}>
            {([
              { id: "home", label: "Now" },
              { id: "history", label: "Log" },
              { id: "settings", label: "Setup" },
            ] as { id: Screen; label: string }[]).map(({ id, label }) => (
              <TouchableOpacity
                key={id}
                style={[s.navItem, screen === id && s.navItemActive]}
                onPress={() => setScreen(id)}
              >
                <Text style={[s.navText, screen === id && s.navTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── Small components ─────────────────────────────────────────────────────

function ProgressBar({ label, pct }: { label: string; pct: number }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={[{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }]}>
        <Text style={{ fontSize: 9, fontWeight: "600", color: "#6a6858", letterSpacing: 1.5 }}>{label}</Text>
        <Text style={{ fontSize: 9, fontWeight: "600", color: "#6a6858" }}>{(pct * 100).toFixed(1)}%</Text>
      </View>
      <View style={{ height: 1, backgroundColor: "#252318" }}>
        <View style={{ height: "100%", width: `${pct * 100}%` as any, backgroundColor: "#6a5c38" }} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  pad: { paddingHorizontal: 28 },
  row: { flexDirection: "row", alignItems: "center" },
  divider: { height: 1, backgroundColor: "#252318" },
  card: { backgroundColor: "#0e0e0e", borderWidth: 1, borderColor: "#252318", padding: 16 },
  callout: { flexDirection: "row", justifyContent: "space-between", padding: 14, backgroundColor: "#0a0a08", borderWidth: 1, borderColor: "#2a2818" },

  serif: { fontFamily: Platform.OS === "android" ? "serif" : "Georgia", fontWeight: "500" },
  label: { fontSize: 11, fontWeight: "600", color: "#6a6858", letterSpacing: 3, textTransform: "uppercase" },
  sublabel: { fontSize: 11, fontWeight: "600", color: "#8a8870", letterSpacing: 2, textTransform: "uppercase" },
  sectionTitle: { fontSize: 11, fontWeight: "600", color: "#9a9070", letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 },
  body: { fontSize: 13, fontWeight: "600", color: "#b0a890" },
  tiny: { fontSize: 11, fontWeight: "600", color: "#6a6858", letterSpacing: 1.5 },

  btnPrimary: { backgroundColor: "#d8ceb9", paddingVertical: 14, alignItems: "center" },
  btnPrimaryText: { fontSize: 11, fontWeight: "600", color: "#0e0e0e", letterSpacing: 2, textTransform: "uppercase" },
  btnGhost: { borderWidth: 1, borderColor: "#3a3828", paddingVertical: 13, alignItems: "center" },
  btnGhostText: { fontSize: 11, fontWeight: "600", color: "#9a9070", letterSpacing: 2, textTransform: "uppercase" },

  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 1, borderBottomColor: "transparent", marginBottom: -1 },
  tabActive: { borderBottomColor: "#e8e0d0" },
  tabText: { fontSize: 11, fontWeight: "600", color: "#5a5848", letterSpacing: 2 },
  tabTextActive: { color: "#e8e0d0" },

  statCell: { flex: 1, backgroundColor: "#0e0e0e", paddingVertical: 12, alignItems: "center" },
  statLabel: { fontSize: 11, fontWeight: "600", color: "#6a6858", letterSpacing: 1.5, marginBottom: 4 },
  statValue: { fontSize: 12, fontWeight: "600", color: "#b0a890" },

  barTrack: { height: 1, backgroundColor: "#252318" },
  barFill: { height: "100%" as any, backgroundColor: "#4a4030" },

  dayBubble: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent", overflow: "hidden", position: "relative" },
  dayFill: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#6e5e3a" },
  monthBubble: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#3a3828", backgroundColor: "#0a0a08", overflow: "hidden" },

  historyRow: { borderTopWidth: 1, borderTopColor: "#252318", paddingVertical: 18, flexDirection: "row", gap: 14 },
  histTag: { fontSize: 11, fontWeight: "600", color: "#6a6858" },
  histVal: { fontSize: 12, fontWeight: "600", color: "#c0b898", marginRight: 12 },

  nav: { flexDirection: "row", backgroundColor: "#0a0a08", borderTopWidth: 1, marginBottom: 24, borderRadius: 12, borderTopColor: "#252318" },
  navItem: { flex: 1, paddingVertical: 16, alignItems: "center", borderTopWidth: 1, borderTopColor: "transparent" },
  navItemActive: { borderTopColor: "#e8e0d0" },
  navText: { fontSize: 11, fontWeight: "600", color: "#4a4838", letterSpacing: 2, textTransform: "uppercase" },
  navTextActive: { color: "#e8e0d0" },

  undoToast: { position: "absolute", bottom: 80, left: 20, right: 20, backgroundColor: "#181612", borderWidth: 1, borderColor: "#3a3828", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  undoBtn: { borderWidth: 1, borderColor: "#4a4838", paddingHorizontal: 14, paddingVertical: 7 },

  pickerBtn: { flex: 1, backgroundColor: "#141410", borderWidth: 1, borderColor: "#3a3828", padding: 12, alignItems: "center" },
  pickerVal: { fontSize: 22, fontWeight: "600", color: "#e8e0d0" },
  pickerLabel: { fontSize: 11, fontWeight: "600", color: "#6a6858", marginTop: 2 },
});