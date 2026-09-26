import { Platform } from 'react-native';
import { pushApi } from './push.service';

export type PushPlatform = 'ios' | 'android';

/**
 * Register the device for push notifications.
 * Call this after the user is logged in (e.g. in App.tsx or after login).
 *
 * Requires Firebase Cloud Messaging (FCM):
 * 1. npm install @react-native-firebase/app @react-native-firebase/messaging
 * 2. Add GoogleService-Info.plist (iOS) and google-services.json (Android)
 * 3. See PUSH_SETUP.md for full setup
 */
export async function registerPushTokenIfAvailable(): Promise<void> {
  if (__DEV__) console.log('[Push] Starting registration...');
  try {
    const { PermissionsAndroid } = require('react-native');
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
    }

    // Use standard dynamic require for the messaging module
    const messaging = require('@react-native-firebase/messaging').default;

    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    if (!enabled) {
      if (__DEV__)
        console.warn(
          '[Push] Permission denied. User must allow notifications in Settings.',
        );
      return;
    }
    if (__DEV__) console.log('[Push] Permission granted');

    const token = await messaging().getToken();
    if (!token) {
      if (__DEV__)
        console.warn(
          '[Push] No FCM token received. Check GoogleService-Info.plist / google-services.json',
        );
      return;
    }
    if (__DEV__)
      console.log('[Push] Got FCM token:', token.substring(0, 20) + '...');

    const platform: PushPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
    try {
      await pushApi.registerToken(token, platform);
      if (__DEV__)
        console.log('[Push] Token registered successfully with backend');
      messaging().onTokenRefresh(async (newToken: string) => {
        try {
          await pushApi.registerToken(newToken, platform);
        } catch (e) {
          if (__DEV__)
            console.warn('[Push] Token refresh registration failed:', (e as any)?.message || e);
        }
      });
    } catch (e) {
      if (__DEV__)
        console.warn(
          '[Push] Backend registration failed:',
          (e as any)?.message || 'Unknown error',
        );
    }
  } catch (err) {
    if (__DEV__) {
      console.warn(
        '[Push] Registration failed:',
        (err as Error)?.message || err,
      );
    }
  }
}

/**
 * Set up foreground message handler (optional).
 * Call once at app startup (e.g. in App.tsx).
 */
export function setForegroundMessageHandler(
  handler: (remoteMessage: {
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
  }) => void,
): (() => void) | undefined {
  try {
    // Use standard dynamic require for the messaging module
    const messaging = require('@react-native-firebase/messaging').default;
    return messaging().onMessage(handler);
  } catch {
    // Firebase not configured or not installed
    return undefined;
  }
}
