import { GOOGLE_MAPS_API_KEY } from '@env';
import type { LatLng } from 'react-native-maps';

export interface RouteInfo {
  distanceText: string;
  durationText: string;
  distanceMeters: number;
  durationSeconds: number;
  points: LatLng[];
  fromProvider: boolean;
  etaUnavailable?: boolean;
}

const cache = new Map<string, RouteInfo>();
const MAX_REASONABLE_METERS = 80_000;

function roundCoord(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function cacheKey(origin: LatLng, dest: LatLng): string {
  return `${roundCoord(origin.latitude)},${roundCoord(origin.longitude)}|${roundCoord(
    dest.latitude,
  )},${roundCoord(dest.longitude)}`;
}

/** Decode a Google encoded polyline into lat/lng points. */
export function decodePolyline(encoded: string): LatLng[] {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coords: LatLng[] = [];

  while (index < len) {
    let b = 0;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
}

function metersBetween(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function movedFarEnough(
  from: LatLng | null | undefined,
  to: LatLng,
  meters = 80,
): boolean {
  if (!from) return true;
  return metersBetween(from, to) >= meters;
}

function formatDistanceText(meters: number): string {
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDurationText(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function isValidMapCoord(point?: LatLng | null): point is LatLng {
  if (!point) return false;
  const { latitude: lat, longitude: lng } = point;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function estimateDistanceOnly(origin: LatLng, destination: LatLng): RouteInfo | null {
  if (!isValidMapCoord(origin) || !isValidMapCoord(destination)) return null;
  const distanceMeters = Math.round(metersBetween(origin, destination));
  if (distanceMeters <= 0 || distanceMeters > MAX_REASONABLE_METERS) return null;
  return {
    points: [origin, destination],
    distanceMeters,
    durationSeconds: 0,
    distanceText: formatDistanceText(distanceMeters),
    durationText: 'ETA unavailable',
    fromProvider: false,
    etaUnavailable: true,
  };
}

/**
 * Driving route via Google Directions.
 * Falls back to haversine distance-only when the key/API fails.
 */
export async function fetchDrivingRoute(
  origin: LatLng,
  destination: LatLng,
): Promise<RouteInfo | null> {
  if (!isValidMapCoord(origin) || !isValidMapCoord(destination)) return null;

  const key = (GOOGLE_MAPS_API_KEY || '').trim();
  if (!key) return estimateDistanceOnly(origin, destination);

  const id = cacheKey(origin, destination);
  const hit = cache.get(id);
  if (hit) return hit;

  try {
    const url =
      'https://maps.googleapis.com/maps/api/directions/json' +
      `?origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      `&mode=driving&key=${key}`;
    const res = await fetch(url);
    const json = (await res.json()) as {
      status?: string;
      routes?: Array<{
        overview_polyline?: { points?: string };
        legs?: Array<{
          distance?: { text?: string; value?: number };
          duration?: { text?: string; value?: number };
        }>;
      }>;
    };
    if (json.status !== 'OK' || !json.routes?.[0]) {
      return estimateDistanceOnly(origin, destination);
    }
    const route = json.routes[0];
    const encoded = route.overview_polyline?.points;
    const points = encoded ? decodePolyline(encoded) : [origin, destination];
    const legs = route.legs || [];
    const distanceMeters = legs.reduce((sum, l) => sum + (l.distance?.value || 0), 0);
    const durationSeconds = legs.reduce((sum, l) => sum + (l.duration?.value || 0), 0);
    if (distanceMeters > MAX_REASONABLE_METERS) return null;
    const info: RouteInfo = {
      points: points.length >= 2 ? points : [origin, destination],
      distanceMeters,
      durationSeconds,
      distanceText:
        legs[0]?.distance?.text ||
        (distanceMeters ? formatDistanceText(distanceMeters) : ''),
      durationText:
        legs[0]?.duration?.text ||
        (durationSeconds ? formatDurationText(durationSeconds) : 'ETA unavailable'),
      fromProvider: true,
      etaUnavailable: !durationSeconds,
    };
    cache.set(id, info);
    return info;
  } catch {
    return estimateDistanceOnly(origin, destination);
  }
}
