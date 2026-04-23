package com.vigil

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.*
import java.util.Calendar

class UsageStatsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "UsageStats"

    @ReactMethod
    fun checkAndRequestPermission(promise: Promise) {
        val appOps = reactApplicationContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            reactApplicationContext.packageName
        )
        if (mode == AppOpsManager.MODE_ALLOWED) {
            promise.resolve(true)
        } else {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(false)
        }
    }

    @ReactMethod
fun getTodayUsage(promise: Promise) {
    try {
        val usm = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE)
            as UsageStatsManager

        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        val startOfDay = cal.timeInMillis
        val now = System.currentTimeMillis()

        val stats = usm.queryUsageStats(
            UsageStatsManager.INTERVAL_BEST, startOfDay, now
        )

        val result = Arguments.createMap()
        val ownPackage = reactApplicationContext.packageName

        stats?.forEach { stat ->
            if (stat.packageName != ownPackage && stat.totalTimeInForeground > 0) {
                // only include if last used today
                if (stat.lastTimeUsed >= startOfDay) {
                    result.putDouble(stat.packageName, stat.totalTimeInForeground.toDouble())
                }
            }
        }

        promise.resolve(result)
    } catch (e: Exception) {
        promise.reject("USAGE_STATS_ERROR", e.message)
    }
}

    @ReactMethod
    fun getLastUsed(packageName: String, promise: Promise) {
        try {
            val usm = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE)
                as UsageStatsManager

            val now = System.currentTimeMillis()
            val startOfDay = now - 24 * 60 * 60 * 1000

            val stats = usm.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY, startOfDay, now
            )

            val stat = stats?.find { it.packageName == packageName }
            promise.resolve(stat?.lastTimeUsed?.toDouble() ?: 0.0)
        } catch (e: Exception) {
            promise.reject("USAGE_STATS_ERROR", e.message)
        }
    }
}