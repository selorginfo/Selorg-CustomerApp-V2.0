import { Platform } from 'react-native';

/** Map React Native platform to selorg-service payment/cart platform enum. */
export function apiPlatform(): 'android' | 'ios' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}
