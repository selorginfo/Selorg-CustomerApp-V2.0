import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { locationsApi } from './locations-api.service';

/**
 * Mobile port of selorg-web-app/src/services/locationService.ts.
 *
 * A real GPS fix is used when the device has one. The Android emulator's
 * built-in GPS is a fixed dummy at Googleplex, Mountain View, California
 * (37.422, -122.084). That point is rejected. The app then asks Google for
 * this device's own network location (the same public IP the website sees),
 * not the emulator mock.
 *
 * Permission is requested on the user action, not at app launch.
 */
/**
 * Android Studio's default AVD location. Anything inside this box is the
 * dummy, not the person holding the phone.
 */
function isEmulatorDummyFix(latitude: number, longitude: number): boolean {
  return Math.abs(latitude - 37.4219983) < 0.05 && Math.abs(longitude - -122.084) < 0.05;
}
Geolocation.setRNConfiguration({
  skipPermissionRequests: true,
  authorizationLevel: 'whenInUse',
  locationProvider: 'playServices',
});

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface ResolvedPlace extends Coordinates {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  formatted: string;
}

export type LocationFailure =
  | 'permission_denied'
  | 'permission_blocked'
  | 'services_disabled'
  | 'timeout'
  | 'unavailable'
  | 'unknown';

export class LocationError extends Error {
  code: LocationFailure;
  constructor(code: LocationFailure, message: string) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

export function isValidLatitude(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= -90 && n <= 90;
}

export function isValidLongitude(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= -180 && n <= 180;
}

export function isValidCoordPair(lat: unknown, lng: unknown): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng) && !(lat === 0 && lng === 0);
}

type Access = 'granted' | 'denied' | 'blocked';

async function androidAccess(): Promise<Access> {
  const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
  if ((await PermissionsAndroid.check(fine)) || (await PermissionsAndroid.check(coarse))) {
    return 'granted';
  }
  // Both must be requested together or Android 12+ will not show the precise/approximate dialog.
  const result = await PermissionsAndroid.requestMultiple([fine, coarse]);
  const fineResult = result[fine];
  const coarseResult = result[coarse];
  if (
    fineResult === PermissionsAndroid.RESULTS.GRANTED ||
    coarseResult === PermissionsAndroid.RESULTS.GRANTED
  ) {
    return 'granted';
  }
  if (
    fineResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
    coarseResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
  ) {
    return 'blocked';
  }
  return 'denied';
}

function iosAccess(): Promise<Access> {
  return new Promise(resolve => {
    Geolocation.requestAuthorization(
      () => resolve('granted'),
      () => resolve('denied'),
    );
  });
}

/** Returns whether the system dialog granted access. Does not open Settings. */
export async function requestLocationPermission(): Promise<boolean> {
  const access = Platform.OS === 'ios' ? await iosAccess() : await androidAccess();
  return access === 'granted';
}

export async function requestLocationAccess(): Promise<Access> {
  return Platform.OS === 'ios' ? iosAccess() : androidAccess();
}

export function openAppSettings() {
  Linking.openSettings().catch(() => undefined);
}

export function openLocationSettings() {
  if (Platform.OS === 'android') {
    Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => openAppSettings());
    return;
  }
  Linking.openURL('App-Prefs:Privacy&path=LOCATION').catch(() => openAppSettings());
}

/** Settings redirect for a blocked permission or GPS that is switched off. */
export function presentLocationFailure(err: unknown) {
  const code = err instanceof LocationError ? err.code : (err as { code?: number | string })?.code;
  if (code === 'permission_blocked' || code === 'permission_denied' || code === 'PERMISSION_DENIED' || code === 1) {
    Alert.alert(
      code === 'permission_blocked' ? 'Location permission blocked' : 'Location permission needed',
      'Allow location for Selorg. If the system prompt did not appear, enable location in Settings and try again.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: openAppSettings },
      ],
    );
    return;
  }
  if (code === 'services_disabled' || code === 2) {
    Alert.alert('Location is turned off', 'Turn on device location (GPS), then try again.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Turn on location', onPress: openLocationSettings },
    ]);
    return;
  }
  if (code === 'timeout' || code === 3) {
    Alert.alert('Location timed out', 'GPS did not respond. Move outdoors or turn location on, then try again.');
    return;
  }
  Alert.alert('Could not get your location', 'Try again, or enter the address manually.');
}

function readFreshFix(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      pos =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      err => reject(err),
      // Same options as the website: a new GPS fix, never a cached network point.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

function mapNativeError(err: { code?: number; message?: string }): LocationError {
  if (err?.code === 1) return new LocationError('permission_denied', 'Location permission denied');
  if (err?.code === 2) return new LocationError('services_disabled', 'Location services are turned off');
  if (err?.code === 3) return new LocationError('timeout', 'Location request timed out');
  return new LocationError('unavailable', err?.message || 'Location unavailable');
}

/**
 * Location of THIS device's network, not the emulator GPS mock and not the
 * API server's data-center IP. The request is made by the phone, so Google
 * sees the same connection the website uses.
 */
async function locateFromThisDevice(): Promise<Coordinates | null> {
  const key = String(GOOGLE_MAPS_API_KEY || '').trim();
  if (key) {
    try {
      const res = await fetch(`https://www.googleapis.com/geolocation/v1/geolocate?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ considerIp: true }),
      });
      const json = (await res.json()) as {
        location?: { lat?: number; lng?: number };
        accuracy?: number;
      };
      const lat = json?.location?.lat;
      const lng = json?.location?.lng;
      if (isValidCoordPair(lat, lng) && !isEmulatorDummyFix(lat, lng)) {
        return { latitude: lat, longitude: lng, accuracy: json.accuracy };
      }
    } catch {
      // Try the backend next. It uses the machine running the API.
    }
  }
  try {
    const approx = await locationsApi.getApproximate();
    if (
      approx &&
      isValidCoordPair(approx.latitude, approx.longitude) &&
      !isEmulatorDummyFix(approx.latitude, approx.longitude)
    ) {
      return { latitude: approx.latitude, longitude: approx.longitude };
    }
  } catch {
    return null;
  }
  return null;
}

/** Fresh device GPS. The emulator's California mock is never returned. */
export async function getCurrentPosition(): Promise<Coordinates> {
  const access = await requestLocationAccess();
  if (access === 'blocked') {
    throw new LocationError('permission_blocked', 'Location permission is blocked. Enable it in Settings.');
  }
  if (access !== 'granted') {
    throw new LocationError('permission_denied', 'Location permission denied');
  }
  let gps: Coordinates | null = null;
  try {
    const fix = await readFreshFix();
    if (isValidCoordPair(fix.latitude, fix.longitude) && !isEmulatorDummyFix(fix.latitude, fix.longitude)) {
      return fix;
    }
    gps = fix;
  } catch (err) {
    if (err instanceof LocationError) throw err;
    const mapped = mapNativeError(err as { code?: number; message?: string });
    if (mapped.code === 'permission_denied') throw mapped;
  }
  const network = await locateFromThisDevice();
  if (network) return network;
  if (gps && isEmulatorDummyFix(gps.latitude, gps.longitude)) {
    throw new LocationError(
      'unavailable',
      'The emulator GPS is the default California point. Set a location in the emulator extended controls, or try on a phone.',
    );
  }
  throw new LocationError('unavailable', 'Could not read a real device location');
}

/** Live GPS while Add Address is following the device. */
export function watchDeviceLocation(
  onFix: (coords: Coordinates) => void,
  onError?: (err: LocationError) => void,
): number {
  return Geolocation.watchPosition(
    pos => {
      // A live watch otherwise pulls the pin back to the emulator's California mock.
      if (isEmulatorDummyFix(pos.coords.latitude, pos.coords.longitude)) return;
      onFix({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    },
    err => onError?.(mapNativeError(err)),
    {
      enableHighAccuracy: true,
      distanceFilter: 15,
      interval: 3000,
      fastestInterval: 1500,
      timeout: 20000,
      maximumAge: 0,
    },
  );
}

export function stopWatchingLocation(watchId: number | null | undefined) {
  if (watchId == null) return;
  Geolocation.clearWatch(watchId);
}

function emptyPlace(coords: Coordinates): ResolvedPlace {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
    formatted: '',
  };
}

/** GET /locations/reverse — same backend call as the website. */
export async function reverseGeocode(coords: Coordinates): Promise<ResolvedPlace> {
  const base = emptyPlace(coords);
  try {
    const remote = await locationsApi.reverse(coords.latitude, coords.longitude);
    if (!remote) return base;
    return {
      ...base,
      line1: remote.line1 || '',
      line2: remote.line2 || '',
      city: remote.city || '',
      state: remote.state || '',
      pincode: remote.pincode || '',
      formatted: remote.formattedAddress || '',
    };
  } catch {
    return base;
  }
}

/** Permission + fresh GPS + reverse geocode. Throws LocationError. */
export async function resolveCurrentPlace(): Promise<ResolvedPlace> {
  const coords = await getCurrentPosition();
  return reverseGeocode(coords);
}

export interface PincodePlace {
  city: string;
  state: string;
  area: string;
}

function cleanPinLocality(name: string, city: string): string {
  const trimmed = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!trimmed) return '';
  if (city && trimmed.toLowerCase() === city.toLowerCase()) return '';
  return trimmed;
}

/** India Post PIN lookup, with Google geocode as the same fallback the website uses. */
export async function lookupPincode(pincode: string): Promise<PincodePlace | null> {
  const pin = pincode.replace(/\D/g, '');
  if (!/^\d{6}$/.test(pin)) return null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    if (res.ok) {
      const data = (await res.json()) as Array<{
        Status?: string;
        PostOffice?: Array<{
          Name?: string;
          District?: string;
          State?: string;
          Division?: string;
          DeliveryStatus?: string;
        }> | null;
      }>;
      const offices = data?.[0]?.Status === 'Success' ? data[0].PostOffice || [] : [];
      const office = offices.find(row => row.DeliveryStatus === 'Delivery') || offices[0];
      const city = String(office?.District || office?.Division || '').trim();
      const state = String(office?.State || '').trim();
      if (city || state) {
        return { city, state, area: cleanPinLocality(String(office?.Name || ''), city) };
      }
    }
  } catch {
    // Fall through to the maps geocoder.
  }
  const resolved = await geocodeAddressQuery(`${pin}, India`);
  if (!resolved?.city && !resolved?.state) return null;
  return {
    city: resolved?.city || '',
    state: resolved?.state || '',
    area: cleanPinLocality(resolved?.line2 || '', resolved?.city || ''),
  };
}

/** Suggestions + place details, matching the website when the form has no map pin yet. */
export async function geocodeAddressQuery(query: string): Promise<ResolvedPlace | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  const run = async (): Promise<ResolvedPlace | null> => {
    const suggestions = await locationsApi.getSuggestions({ q });
    const withPlace = (suggestions || []).find(s => String(s.placeId || '').trim());
    if (withPlace?.placeId) {
      const resolved = await locationsApi.placeDetails(String(withPlace.placeId));
      if (resolved && isValidCoordPair(resolved.latitude, resolved.longitude)) {
        return {
          latitude: Number(resolved.latitude),
          longitude: Number(resolved.longitude),
          line1: resolved.line1 || '',
          line2: resolved.line2 || '',
          city: resolved.city || '',
          state: resolved.state || '',
          pincode: resolved.pincode || '',
          formatted: resolved.formattedAddress || '',
        };
      }
    }
    return null;
  };
  try {
    return await Promise.race([
      run(),
      new Promise<null>(resolve => {
        setTimeout(() => resolve(null), 8000);
      }),
    ]);
  } catch {
    return null;
  }
}
