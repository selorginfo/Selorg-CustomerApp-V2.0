import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  UIManager,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type LatLng,
  type MapViewProps,
} from 'react-native-maps';
import { colors, fontFamily } from '../../theme';
import {
  fetchDrivingRoute,
  isValidMapCoord,
  movedFarEnough,
  type RouteInfo,
} from '../../services/maps/directions';
import { curvedPath, easeOutCubic, headingBetween, lerpLatLng, regionFor } from '../../utils/mapAnim';
import { RiderMapMarker } from './RiderMapMarker';
import Icon from '../Icon';

export type MapCoord = { latitude: number; longitude: number };

export interface LiveTrackingMapProps {
  height?: number;
  destination?: MapCoord | null;
  store?: MapCoord | null;
  rider?: MapCoord | null;
  heading?: number | null;
  /** Hide the rider pin after delivery / cancel. */
  showRider?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onRouteInfo?: (info: RouteInfo | null) => void;
}

const MAP_VIEW_MANAGERS = [
  // New Architecture (Fabric) — registered when newArchEnabled=true
  'RNMapsMapView',
  'RNMapsGoogleMapView',
  // Old Architecture bridge names
  'AIRMap',
  'AIRGoogleMap',
] as const;

/** True when react-native-maps is linked in this native build. */
function isNativeMapsAvailable(): boolean {
  try {
    const getConfig =
      typeof UIManager.getViewManagerConfig === 'function'
        ? UIManager.getViewManagerConfig.bind(UIManager)
        : null;
    if (getConfig) {
      return MAP_VIEW_MANAGERS.some(name => getConfig(name) != null);
    }
    const managers = UIManager as unknown as Record<string, unknown>;
    return MAP_VIEW_MANAGERS.some(name => managers[name] != null);
  } catch {
    return false;
  }
}

/**
 * Smoothly interpolates marker position toward live GPS fixes
 * (requestAnimationFrame + ease-out — avoids jumpy teleports).
 */
function useSmoothRider(
  target: LatLng | null,
  liveHeading?: number | null,
): { coord: LatLng | null; heading: number } {
  const [coord, setCoord] = useState<LatLng | null>(target);
  const [heading, setHeading] = useState(0);
  const displayRef = useRef<LatLng | null>(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!target) {
      displayRef.current = null;
      setCoord(null);
      return;
    }

    const from = displayRef.current;
    if (!from) {
      displayRef.current = target;
      setCoord(target);
      if (typeof liveHeading === 'number' && Number.isFinite(liveHeading)) {
        setHeading(liveHeading);
      }
      return;
    }

    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    const start = Date.now();
    const duration = 900;
    const origin = { ...from };
    const dest = { ...target };
    const startHeading = headingBetween(origin, dest);

    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const e = easeOutCubic(t);
      const next = lerpLatLng(origin, dest, e);
      displayRef.current = next;
      setCoord(next);
      if (typeof liveHeading === 'number' && Number.isFinite(liveHeading)) {
        setHeading(liveHeading);
      } else if (t > 0.05) {
        setHeading(startHeading);
      }
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
    // Only re-run when the GPS fix identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.latitude, target?.longitude, liveHeading]);

  return { coord, heading };
}

/**
 * Real Google Maps live delivery tracking for the customer app.
 * Uses PROVIDER_GOOGLE + Directions polyline + socket GPS with smooth animation.
 */
export function LiveTrackingMap({
  height = 300,
  destination,
  store,
  rider,
  heading: liveHeading,
  showRider = true,
  style,
  children,
  onRouteInfo,
}: LiveTrackingMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const didFit = useRef(false);
  const lastRouteOrigin = useRef<LatLng | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [tracksChanges, setTracksChanges] = useState(true);

  const dest = isValidMapCoord(destination) ? destination : null;
  const hub = isValidMapCoord(store) ? store : null;
  const riderTarget = showRider && isValidMapCoord(rider) ? rider : null;
  const { coord: riderCoord, heading } = useSmoothRider(riderTarget, liveHeading);

  // Brief tracksViewChanges window so custom marker redraws while animating.
  useEffect(() => {
    if (!riderCoord) return;
    setTracksChanges(true);
    const id = setTimeout(() => setTracksChanges(false), 1100);
    return () => clearTimeout(id);
  }, [riderTarget?.latitude, riderTarget?.longitude]);

  const routeOrigin = riderTarget ?? hub;

  useEffect(() => {
    didFit.current = false;
    lastRouteOrigin.current = null;
    setRoute(null);
  }, [dest?.latitude, dest?.longitude]);

  useEffect(() => {
    if (!routeOrigin || !dest) {
      setRoute(prev => (prev == null ? prev : null));
      onRouteInfo?.(null);
      return;
    }
    if (lastRouteOrigin.current && !movedFarEnough(lastRouteOrigin.current, routeOrigin, 70)) {
      return;
    }
    let cancelled = false;
    lastRouteOrigin.current = routeOrigin;
    (async () => {
      const next = await fetchDrivingRoute(routeOrigin, dest);
      if (cancelled) return;
      setRoute(next);
      onRouteInfo?.(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOrigin?.latitude, routeOrigin?.longitude, dest?.latitude, dest?.longitude]);

  const routePoints = useMemo(() => {
    if (route?.points && route.points.length >= 2) return route.points;
    if (routeOrigin && dest) return curvedPath(routeOrigin, dest);
    const pts: LatLng[] = [];
    if (hub) pts.push(hub);
    if (riderCoord) pts.push(riderCoord);
    if (dest) pts.push(dest);
    return pts;
  }, [route, routeOrigin, dest, hub, riderCoord]);

  const initialRegion = useMemo(() => regionFor(routePoints), [routePoints]);

  useEffect(() => {
    if (!mapRef.current || routePoints.length === 0) return;
    const t = setTimeout(() => {
      if (!mapRef.current) return;
      if (routePoints.length === 1) {
        mapRef.current.animateToRegion(regionFor(routePoints), 450);
        didFit.current = true;
        return;
      }
      mapRef.current.fitToCoordinates(routePoints, {
        edgePadding: { top: 56, right: 44, bottom: 48, left: 44 },
        animated: true,
      });
      didFit.current = true;
    }, didFit.current ? 0 : 180);
    return () => clearTimeout(t);
    // Fit once when route/points first appear; subsequent GPS is marker-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dest?.latitude,
    dest?.longitude,
    hub?.latitude,
    hub?.longitude,
    route?.fromProvider,
    Boolean(riderTarget),
  ]);

  const wrapStyle: StyleProp<ViewStyle> = [styles.wrap, { height }, style];

  if (!isNativeMapsAvailable()) {
    return (
      <View style={wrapStyle}>
        <View style={styles.fallback}>
          <Icon name="pin" size={22} color={colors.primary} />
          <Text style={styles.fallbackTitle}>Map unavailable</Text>
          <Text style={styles.fallbackSub}>Google Maps native module is not linked in this build.</Text>
        </View>
        <View style={styles.overlay} pointerEvents="box-none">
          {children}
        </View>
      </View>
    );
  }

  if (!dest && !hub && !riderCoord) {
    return (
      <View style={wrapStyle}>
        <View style={styles.fallback}>
          <Icon name="pin" size={22} color={colors.primary} />
          <Text style={styles.fallbackTitle}>Waiting for location</Text>
          <Text style={styles.fallbackSub}>Delivery pin appears once the address is confirmed.</Text>
        </View>
        <View style={styles.overlay} pointerEvents="box-none">
          {children}
        </View>
      </View>
    );
  }

  const mapProps: MapViewProps = {
    style: StyleSheet.absoluteFill,
    provider: PROVIDER_GOOGLE,
    initialRegion,
    showsUserLocation: false,
    showsMyLocationButton: false,
    showsCompass: false,
    toolbarEnabled: false,
    rotateEnabled: false,
    pitchEnabled: false,
    scrollEnabled: true,
    zoomEnabled: true,
    mapType: 'standard',
    customMapStyle: MAP_STYLE,
  };

  return (
    <View style={wrapStyle} pointerEvents="box-none">
      <MapView ref={mapRef} {...mapProps}>
        {hub ? (
          <Marker coordinate={hub} title="Selorg store" identifier="store" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.storePin}>
              <Icon name="box" size={14} color={colors.white} strokeWidth={2.2} />
            </View>
          </Marker>
        ) : null}

        {dest ? (
          <Marker coordinate={dest} title="Your address" identifier="destination" anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.destPin}>
              <View style={styles.destPinInner}>
                <Icon name="pin" size={14} color={colors.white} strokeWidth={2.4} />
              </View>
            </View>
          </Marker>
        ) : null}

        {showRider && riderCoord ? (
          <Marker
            coordinate={riderCoord}
            title="Delivery partner"
            identifier="rider"
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={Platform.OS === 'android' ? heading : heading}
            flat
            zIndex={20}
            tracksViewChanges={tracksChanges}
          >
            <RiderMapMarker />
          </Marker>
        ) : null}

        {routePoints.length >= 2 ? (
          <Polyline
            coordinates={routePoints}
            strokeColor={colors.primary}
            strokeWidth={4.5}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={route?.fromProvider ? undefined : [8, 10]}
          />
        ) : null}
      </MapView>
      <View style={styles.overlay} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

/** Soft, street-forward Google Map style (matches web tracking). */
const MAP_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f3f5f7' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d5e4f2' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e4e7ec' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8b919a' }] },
];

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    backgroundColor: '#e8eee8',
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 6,
    backgroundColor: '#e8eee8',
  },
  fallbackTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.text,
    marginTop: 4,
  },
  fallbackSub: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
  storePin: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  destPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderBottomRightRadius: 3,
    backgroundColor: colors.text,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  destPinInner: { transform: [{ rotate: '-45deg' }] },
});
