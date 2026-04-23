//VigilWidget.kt
package com.vigil

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import java.util.Calendar
import android.app.AlarmManager

class VigilWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (id in appWidgetIds) {
            updateWidget(context, appWidgetManager, id)
        }
    }
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == AppWidgetManager.ACTION_APPWIDGET_UPDATE) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, VigilWidget::class.java))
            onUpdate(context, mgr, ids)
        }
    }

    override fun onEnabled(context: Context) {
        scheduleUpdates(context)
    }

    companion object {
        private const val PREFS_NAME = "com.vigil.widget"
        private const val KEY_WAKE_TIME = "wakeTime"
        private const val KEY_BED_H = "baselineBedH"
        private const val KEY_BED_M = "baselineBedM"
        private const val KEY_DAY_ENDED = "dayEnded"

        fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            widgetId: Int
        ) {
            android.util.Log.d("VigilWidget", "updateWidget called")
            val views = RemoteViews(context.packageName, R.layout.vigil_widget)
            val now = Calendar.getInstance()

            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val wakeTimeMs = prefs.getLong(KEY_WAKE_TIME, 0L)
            val bedH = prefs.getInt(KEY_BED_H, 23)
            val bedM = prefs.getInt(KEY_BED_M, 45)
            val dayEnded = prefs.getBoolean(KEY_DAY_ENDED, false)

            if (wakeTimeMs > 0 && !dayEnded) {
                val bedTarget = Calendar.getInstance().apply {
                    timeInMillis = wakeTimeMs
                    set(Calendar.HOUR_OF_DAY, bedH)
                    set(Calendar.MINUTE, bedM)
                    set(Calendar.SECOND, 0)
                    if (timeInMillis <= wakeTimeMs) add(Calendar.DAY_OF_YEAR, 1)
                }

                val secsLeft = (bedTarget.timeInMillis - now.timeInMillis) / 1000
                val isOvertime = secsLeft < 0
                val abs = Math.abs(secsLeft)
                val h = abs / 3600
                val m = (abs % 3600) / 60
                val s = abs % 60

val timeStr = if (isOvertime)
    "+${h}h ${m.toString().padStart(2,'0')}m"
else
    "${h}h ${m.toString().padStart(2,'0')}m"

                views.setTextViewText(R.id.widget_countdown_label,
                    if (isOvertime) "OVERTIME" else "ACTIVE")
                views.setTextViewText(R.id.widget_countdown, timeStr)
                views.setTextColor(R.id.widget_countdown,
                    if (isOvertime) 0xFFC04030.toInt() else 0xFFE8E0D0.toInt())
                views.setTextColor(R.id.widget_countdown_label,
                    if (isOvertime) 0xFFAA3020.toInt() else 0xFF6A6858.toInt())
            } else if (dayEnded) {
                views.setTextViewText(R.id.widget_countdown, "—")
                views.setTextViewText(R.id.widget_countdown_label, "DAY ENDED")
            } else {
                views.setTextViewText(R.id.widget_countdown, "—:——:——")
                views.setTextViewText(R.id.widget_countdown_label, "NOT STARTED")
            }

            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_countdown, pendingIntent)

            val totalDaysInMonth = now.getActualMaximum(Calendar.DAY_OF_MONTH)
            val currentDay = now.get(Calendar.DAY_OF_MONTH)
            val monthPct = (currentDay.toFloat() / totalDaysInMonth * 100).toInt()
            val daysLeftInMonth = totalDaysInMonth - currentDay

            // Year progress
            val dayOfYear = now.get(Calendar.DAY_OF_YEAR)
            val totalDaysInYear = if (now.getActualMaximum(Calendar.DAY_OF_YEAR) == 366) 366 else 365
            val yearPct = (dayOfYear.toFloat() / totalDaysInYear * 100).toInt()
            val daysLeftInYear = totalDaysInYear - dayOfYear
            val currentYear = now.get(Calendar.YEAR)

            views.setTextViewText(R.id.widget_month_pct, "$monthPct%")
views.setTextViewText(R.id.widget_month_days_val, "$daysLeftInMonth days remaining")
            views.setTextViewText(R.id.widget_year_pct, "$yearPct%")
views.setTextViewText(R.id.widget_year_days_val, "$daysLeftInYear days remaining in $currentYear")

            appWidgetManager.updateAppWidget(widgetId, views)
        }

        fun scheduleUpdates(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
    val intent = Intent(context, VigilWidget::class.java).apply {
        action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(ComponentName(context, VigilWidget::class.java))
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
    }
    val pendingIntent = PendingIntent.getBroadcast(
        context, 0, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    alarmManager.setRepeating(
        android.app.AlarmManager.RTC,
        System.currentTimeMillis() + 1000,
        60_000L,
        pendingIntent
    )
}
    }
}