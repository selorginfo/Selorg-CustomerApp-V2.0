package com.selorg.com

import android.app.Application
import android.os.Build
import android.preference.PreferenceManager
import android.provider.Settings
import com.facebook.react.PackageList
import com.facebook.react.R as ReactR
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    configurePhysicalDevicePackagerHost()
    loadReactNative(this)
  }

  /**
   * Physical devices use localhost when `adb reverse` forwards the packager port.
   * If that tunnel is down, set the host from the computer:
   * `adb shell settings put global debug_http_host <lan-ip>:<metro-port>`
   */
  @Suppress("DEPRECATION")
  private fun configurePhysicalDevicePackagerHost() {
    if (!BuildConfig.DEBUG) {
      return
    }
    val fingerprint = Build.FINGERPRINT
    val isEmulator =
        fingerprint.contains("generic") ||
            fingerprint.startsWith("google/sdk_gphone") ||
            fingerprint.contains("vbox")
    if (isEmulator) {
      return
    }

    val port = resources.getInteger(ReactR.integer.react_native_dev_server_port)
    // `adb shell settings put global debug_http_host <ip>:<port>` overrides
    // localhost when wireless ADB reverse does not forward packager traffic.
    val fromAdb =
        try {
          Settings.Global.getString(contentResolver, "debug_http_host")?.trim().orEmpty()
        } catch (_: SecurityException) {
          ""
        }
    val host =
        when {
          fromAdb.isNotEmpty() -> fromAdb
          port > 0 -> "localhost:$port"
          else -> return
        }
    val prefs = PreferenceManager.getDefaultSharedPreferences(this)
    if (prefs.getString("debug_http_host", null) != host) {
      prefs.edit().putString("debug_http_host", host).apply()
    }
  }
}
