import type { LatLng } from 'react-native-maps';

export function metersBetween(a: LatLng, b: LatLng): number {
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

export function headingBetween(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  const u = Math.min(1, Math.max(0, t));
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * u,
    longitude: a.longitude + (b.longitude - a.longitude) * u,
  };
}

/** Ease-out cubic — fast start, soft settle (Zepto-style glide). */
export function easeOutCubic(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - u, 3);
}

/** Curved fallback when Google Directions is unavailable. */
export function curvedPath(origin: LatLng, dest: LatLng): LatLng[] {
  const mid: LatLng = {
    latitude: (origin.latitude + dest.latitude) / 2 + 0.0028,
    longitude: (origin.longitude + dest.longitude) / 2 - 0.0014,
  };
  const pts: LatLng[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({
      latitude: u * u * origin.latitude + 2 * u * t * mid.latitude + t * t * dest.latitude,
      longitude: u * u * origin.longitude + 2 * u * t * mid.longitude + t * t * dest.longitude,
    });
  }
  return pts;
}

export function regionFor(points: LatLng[]) {
  if (points.length === 0) {
    return {
      latitude: 13.0827,
      longitude: 80.2707,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }
  if (points.length === 1) {
    return {
      latitude: points[0].latitude,
      longitude: points[0].longitude,
      latitudeDelta: 0.018,
      longitudeDelta: 0.018,
    };
  }
  const lats = points.map(p => p.latitude);
  const lngs = points.map(p => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latPad = Math.max((maxLat - minLat) * 0.4, 0.008);
  const lngPad = Math.max((maxLng - minLng) * 0.4, 0.008);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: maxLat - minLat + latPad * 2,
    longitudeDelta: maxLng - minLng + lngPad * 2,
  };
}
