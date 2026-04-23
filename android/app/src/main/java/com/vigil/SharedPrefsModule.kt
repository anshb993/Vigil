
package com.vigil

import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager

class SharedPrefsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SharedPrefs"

    private val prefs by lazy {
        reactApplicationContext.getSharedPreferences(
            "com.vigil.widget",
            Context.MODE_PRIVATE
        )
    }

    @ReactMethod
    fun setWakeTime(timestampMs: Double, promise: Promise) {
        prefs.edit().putLong("wakeTime", timestampMs.toLong()).apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun setBedBaseline(h: Int, m: Int, promise: Promise) {
        prefs.edit()
            .putInt("baselineBedH", h)
            .putInt("baselineBedM", m)
            .apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun setDayEnded(ended: Boolean, promise: Promise) {
        prefs.edit().putBoolean("dayEnded", ended).apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun clearDay(promise: Promise) {
        prefs.edit()
            .remove("wakeTime")
            .putBoolean("dayEnded", false)
            .apply()
        promise.resolve(null)
    }
}

