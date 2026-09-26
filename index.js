/**
 * @format
 */

import { LogBox } from 'react-native';

// Firebase namespaced API warnings flood LogBox and can stall first paint in
// bridgeless/dev. The yellow banner also sits on top of the onboarding
// Next button, so taps never reach it. Ignore until the modular migration
// is complete. Fatal errors still open the full-screen LogBox.
LogBox.ignoreAllLogs();
LogBox.ignoreLogs([
  /This method is deprecated \(as well as all React Native Firebase/,
  /migrating-to-v22/,
  /setBackgroundMessageHandler/,
  /setLayoutAnimationEnabledExperimental is currently a no-op/,
]);

// ─── Firebase background message handler ────────────────────────────────────
// Must be registered before the app component mounts.
//
// Two types of FCM messages:
//   1. notification + data  → OS auto-shows the notification (static text, no timer).
//      We do nothing here to avoid duplicates.
//   2. data-only (no notification field)  → OS shows nothing automatically.
//      We intercept here and display via notifee WITH a live countdown timer.
//
// ⚠️  For the countdown timer to appear in background push notifications,
//     the server MUST send data-only FCM messages (no "notification" field).
//     Include these fields in the FCM data payload:
//       title, body, timerMinutes, imageUrl, productId  (all strings)
try {
  const messaging = require('@react-native-firebase/messaging').default;

  messaging().setBackgroundMessageHandler(async remoteMessage => {
    // If the app is currently active (foreground), Firebase's onMessage
    // handler in App.tsx will show the in-app banner — skip here to avoid
    // a duplicate system notification popup.
    try {
      const { AppState } = require('react-native');
      if (AppState.currentState === 'active') return;
    } catch (_) {}

    // Deduplicate by message ID — prevents double-display when both the
    // background handler and the foreground onMessage handler fire for the
    // same message during a foreground↔background state transition.
    try {
      const { isDuplicate } = require('./src/utils/notifDedup');
      if (isDuplicate(remoteMessage.messageId)) return;
    } catch (_) {}

    // Skip if this is a notification+data message — the OS already shows it
    if (remoteMessage.notification) return;

    // Data-only message: we must display it ourselves
    const data = remoteMessage.data || {};
    const title = data.title;
    if (!title) return; // nothing to show

    try {
      const notifee = require('@notifee/react-native').default;
      const { AndroidImportance, AndroidStyle } = require('@notifee/react-native');

      await notifee.createChannel({
        id: 'push_channel_v3',
        name: 'Push Sound Channel v3',
        importance: AndroidImportance.HIGH,
        sound: 'push',
        vibration: true,
        vibrationPattern: [300, 500],
      });

      const timerMins = data.timerMinutes ? parseInt(data.timerMinutes, 10) : 0;

      // ── Flipkart-style timer in title ────────────────────────────────────────
      // Compute the initial H:MM:SS string from timerMinutes, then embed it in
      // the title using an HTML <font> tag so Android renders it in blue bold.
      // Example result: "Under ₹299  <font color="#4169E1"><b>4:24:00</b></font>"
      let displayTitle = title;
      if (timerMins > 0) {
        const h = Math.floor(timerMins / 60);
        const m = timerMins % 60;
        const timerStr = h > 0
          ? `${h}:${String(m).padStart(2, '0')}:00`
          : `${String(m).padStart(2, '0')}:00`;
        displayTitle = `${title}  <font color="#4169E1"><b>${timerStr}</b></font>`;
      }

      // offerEndsAt → Android shows a LIVE countdown in the notification timestamp
      // area (next to app name). Combined with the HTML timer in the title this
      // gives the Flipkart-style "4:24:29" experience.
      const offerEndsAt = timerMins > 0
        ? Date.now() + timerMins * 60 * 1000
        : undefined;

      const androidConfig = {
        channelId: 'push_channel_v3',
        importance: AndroidImportance.HIGH,
        smallIcon: 'ic_launcher',
        sound: 'push',
        pressAction: { id: 'default' },
        actions: [{ title: 'Dismiss', pressAction: { id: 'dismiss' } }],
        // Live countdown in the notification timestamp area
        ...(offerEndsAt ? { timestamp: offerEndsAt, showTimestamp: true } : {}),
        // Full-width BigPicture image (Flipkart style)
        ...(data.imageUrl
          ? {
              style: {
                type: AndroidStyle.BIGPICTURE,
                picture: data.imageUrl,
              },
            }
          : {}),
      };

      await notifee.displayNotification({
        title: displayTitle,
        body: data.body || '',
        data,
        android: androidConfig,
        ios: {
          sound: 'push.mp3',
          ...(data.imageUrl ? { attachments: [{ url: data.imageUrl }] } : {}),
        },
      });
    } catch (err) {
      console.warn('[BGHandler] notifee display error:', err);
    }
  });
} catch (_) {
  // Firebase not installed or not configured – skip
}

// ─── Notifee background event handler ───────────────────────────────────────
// Handles action-button presses (e.g. "Dismiss") while the app is in the
// background or in quit state.
try {
  const notifee = require('@notifee/react-native').default;
  const { EventType } = require('@notifee/react-native');

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const notificationId = detail?.notification?.id;

    if (type === EventType.ACTION_PRESS && detail?.pressAction?.id === 'dismiss') {
      // Cancel the notification when the Dismiss button is tapped
      if (notificationId) {
        await notifee.cancelNotification(notificationId);
      }
    }
    // NOTE: PRESS (tap on body) when backgrounded is handled by
    // messaging().onNotificationOpenedApp() in App.tsx
  });
} catch (_) {
  // Notifee not installed – skip
}

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
