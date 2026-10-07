/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import AppProviders from './src/context/AppProviders';
import ToastHost from './src/components/ToastHost';
import { useAuth } from './src/context/AuthContext';
import {
  registerPushTokenIfAvailable,
  setForegroundMessageHandler,
} from './src/services/pushNotifications';
import { setPendingNavigation } from './src/utils/navigationRef';
import { notificationTarget, openNotificationTarget } from './src/utils/notificationRoute';
import InAppNotificationBanner, {
  NotificationPayload,
} from './src/components/InAppNotificationBanner';
import { PermissionsAndroid, Platform } from 'react-native';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  const requestPermissions = async () => {
    if (Platform.OS !== 'android') return;
    try {
      // Build list of permissions that are NOT already granted.
      // Using check() before request() prevents the dialog from
      // appearing on every app launch after the user has already decided.
      const toRequest: string[] = [];

      // Location is requested when the user taps current location / Add Address.
      // Asking here races the splash screen and Android then skips the real prompt.

      // POST_NOTIFICATIONS was added in Android 13 (API 33)
      if (Platform.Version >= 33) {
        const notifGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (!notifGranted) {
          toRequest.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }
      }

      // READ/WRITE_EXTERNAL_STORAGE are deprecated on Android 10+ (API 29)
      if (Platform.Version < 29) {
        const readGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        );
        if (!readGranted) {
          toRequest.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        }
        const writeGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        );
        if (!writeGranted) {
          toRequest.push(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
        }
      }

      if (toRequest.length > 0) {
        await PermissionsAndroid.requestMultiple(toRequest as any);
      }
    } catch (err) {
      console.warn(err);
    }
  };

  useEffect(() => {
    // Defer until after first paint so BootTheme/Splash aren't covered by
    // the system permission sheet (reads as a black/blank launch).
    const t = setTimeout(() => {
      requestPermissions();
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <View style={styles.container}>
        <AppProviders>
          <AppContent />
        </AppProviders>
      </View>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { isAuthenticated } = useAuth();
  const [banner, setBanner] = useState<NotificationPayload | null>(null);

  // Navigate to ProductDetail from a notification data payload
  // Orders, refunds, tickets, wallet and products — not just Product Detail.
  const handleNotificationNavigation = (data?: Record<string, string>) => {
    openNotificationTarget(data);
  };

  useEffect(() => {
    const setupNotifee = async () => {
      try {
        const notifee = require('@notifee/react-native').default;
        const { AndroidImportance } = require('@notifee/react-native');

        // Request permissions (required for iOS)
        await notifee.requestPermission({
          sound: true,
          announcement: true,
          badge: true,
          alert: true,
        });

        // Target custom sound channel - NEW ID (v3) forces Android to re-read sound and IMPORTANCE for popup!
        await notifee.createChannel({
          id: 'push_channel_v3',
          name: 'Push Sound Channel v3',
          importance: AndroidImportance.HIGH,
          sound: 'push',
          vibration: true,
          vibrationPattern: [300, 500],
        });
      } catch (err) {
        console.warn('Channel creation error:', err);
      }
    };
    setupNotifee();

    // Handle notifications when app is in foreground — show in-app banner only.
    // We support two FCM message types:
    //   • notification+data (legacy): title/body in remoteMessage.notification
    //   • data-only (current):        title/body in remoteMessage.data
    // Never call notifee.displayNotification() here — that would add a second
    // system popup on top of the in-app banner (duplicate).
    const unsubscribe = setForegroundMessageHandler(remoteMessage => {
      try {
        // Deduplicate — prevents double-display when the background handler
        // in index.js already processed this message during a state transition
        const { isDuplicate } = require('./src/utils/notifDedup');
        if (isDuplicate((remoteMessage as any)?.messageId)) return;

        // Resolve title from either notification field (legacy) or data field (data-only)
        const title =
          remoteMessage?.notification?.title ||
          (remoteMessage?.data?.title as string | undefined);
        if (!title) return;

        const notifData: Record<string, string> = {};
        if (remoteMessage?.data) {
          Object.entries(remoteMessage.data).forEach(([k, v]) => {
            if (typeof v === 'string') notifData[k] = v;
          });
        }
        const body =
          remoteMessage?.notification?.body ||
          (notifData.body ?? undefined);

        setBanner({ title, body, data: notifData as any });
      } catch (err) {
        console.warn('Foreground notification error:', err);
      }
    });

    // Handle press / action-press on notifee system notification (foreground)
    let notifeeUnsubscribe: (() => void) | undefined;
    try {
      const notifee = require('@notifee/react-native').default;
      const { EventType } = require('@notifee/react-native');
      notifeeUnsubscribe = notifee.onForegroundEvent(
        async ({ type, detail }: { type: number; detail: any }) => {
          if (type === EventType.ACTION_PRESS && detail?.pressAction?.id === 'dismiss') {
            await notifee.cancelNotification(detail?.notification?.id);
          } else if (type === EventType.PRESS) {
            const data = detail?.notification?.data as Record<string, string> | undefined;
            handleNotificationNavigation(data);
          }
        },
      );
    } catch {}

    return () => {
      unsubscribe?.();
      notifeeUnsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      registerPushTokenIfAvailable();
    }
  }, [isAuthenticated]);

  // Handle notification tap when app was in background (opened from notification)
  useEffect(() => {
    try {
      const messaging = require('@react-native-firebase/messaging').default;

      // App opened from background notification tap
      const unsubBackground = messaging().onNotificationOpenedApp(
        (remoteMessage: any) => {
          const data = remoteMessage?.data as Record<string, string> | undefined;
          if (data) {
            // Small delay to ensure navigation is mounted
            setTimeout(() => handleNotificationNavigation(data), 300);
          }
        },
      );

      // App opened from quit state (cold start) via notification tap.
      // Navigation is not ready yet — store the destination and let
      // NavigationContainer.onReady + the auth-redirect useEffect consume it.
      messaging()
        .getInitialNotification()
        .then((remoteMessage: any) => {
          const target = notificationTarget(remoteMessage?.data);
          if (target) setPendingNavigation(target.screen, target.params);
        })
        .catch(() => {});

      return () => {
        unsubBackground();
      };
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <RootNavigator />
      <ToastHost />
      <InAppNotificationBanner
        notification={banner}
        onDismiss={() => setBanner(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});

export default App;
