package com.selorg.com

import android.app.Application
import android.os.Build
import android.preference.PreferenceManager
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
   * Physical devices default to localhost, which requires `adb reverse tcp:8081 tcp:8081`.
   * On wireless ADB this tunnel still works even when the router blocks direct LAN access
   * (AP/client isolation), so localhost + reverse is more reliable than the LAN IP.
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
    if (port <= 0) {
      return
    }

    // Prefer localhost — traffic is forwarded via `adb reverse` and works over wireless
    // ADB even when the router blocks device-to-device LAN (AP isolation).
    val host = "localhost:$port"
    val prefs = PreferenceManager.getDefaultSharedPreferences(this)
    if (prefs.getString("debug_http_host", null) != host) {
      prefs.edit().putString("debug_http_host", host).apply()
    }
  }
}
