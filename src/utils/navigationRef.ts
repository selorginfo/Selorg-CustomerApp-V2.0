import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

// ---------------------------------------------------------------------------
// Pending navigation — used to queue a navigate() call that arrives before
// the NavigationContainer is ready (quit-state / cold-start scenario).
// Consumed once inside NavigationContainer's onReady callback.
// ---------------------------------------------------------------------------
let _pendingScreen: string | null = null;
let _pendingParams: any = null;

export function setPendingNavigation(screen: string, params?: any) {
  _pendingScreen = screen;
  _pendingParams = params ?? null;
}

/** Called from NavigationContainer onReady — returns true if something was executed. */
export function consumePendingNavigation(): boolean {
  if (!_pendingScreen || !navigationRef.isReady()) return false;
  const screen = _pendingScreen;
  const params = _pendingParams;
  _pendingScreen = null;
  _pendingParams = null;
  navigationRef.navigate(screen as any, params);
  return true;
}

export function navigate(name: string, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name as any, params);
  }
}

export function reset(name: string, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.reset({
      index: 0,
      routes: [{ name: name as any, params }],
    });
  }
}
