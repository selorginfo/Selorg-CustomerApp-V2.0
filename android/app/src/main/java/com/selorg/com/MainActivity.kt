package com.selorg.com

import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.views.view.ReactViewGroup
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory

class MainActivity : ReactActivity() {
  private var inputRebound = false
  private var lastOverlaySweep = 0L

  override fun getMainComponentName(): String = "Selorg"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
    super.onCreate(null)
    window.decorView.viewTreeObserver.addOnGlobalLayoutListener { sweepDebugOverlay() }
  }

  override fun onResume() {
    super.onResume()
    val decor = window.decorView
    decor.post {
      sweepDebugOverlay(force = true)
      // windowDisablePreview leaves the VRI without an input channel on API 37.
      // Toggling focus before the first layout hides the surface, so wait until
      // the window has a size, then drop and restore focus on a later frame.
      scheduleInputRebind()
    }
  }

  private fun scheduleInputRebind() {
    if (inputRebound || isFinishing) return
    val decor = window.decorView
    if (decor.width == 0 || decor.height == 0) {
      decor.post { scheduleInputRebind() }
      return
    }
    inputRebound = true
    decor.post {
      window.addFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE)
      decor.postDelayed({
        if (!isFinishing) {
          window.clearFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE)
        }
      }, 80)
    }
  }

  /**
   * Dev builds mount a full-screen DebuggingOverlay above the app. If its
   * wrapper keeps the default pointer events, it eats every tap. Keep that
   * overlay out of hit testing.
   */
  private fun sweepDebugOverlay(force: Boolean = false) {
    val now = SystemClock.uptimeMillis()
    if (!force && now - lastOverlaySweep < 400) return
    lastOverlaySweep = now
    neutralizeDebugOverlay(window.decorView)
  }

  private fun neutralizeDebugOverlay(view: View) {
    if (view.javaClass.name.endsWith("DebuggingOverlay")) {
      view.isClickable = false
      view.setOnTouchListener { _, _ -> false }
      val parent = view.parent
      if (parent is ReactViewGroup && parent.pointerEvents != PointerEvents.NONE) {
        parent.pointerEvents = PointerEvents.NONE
      }
    }
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        neutralizeDebugOverlay(view.getChildAt(i))
      }
    }
  }
}
