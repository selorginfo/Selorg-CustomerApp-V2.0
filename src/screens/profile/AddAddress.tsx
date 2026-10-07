import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { LatLng, MapPressEvent, Marker, MarkerDragStartEndEvent, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Header, Icon, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, radii } from '../../theme';
import { useAddress } from '../../context/AddressContext';
import type { RootStackParamList } from '../../navigation/types';
import {
  isValidCoordPair,
  lookupPincode,
  presentLocationFailure,
  resolveCurrentPlace,
  reverseGeocode,
  stopWatchingLocation,
  watchDeviceLocation,
} from '../../services/location.service';
import type { Coordinates } from '../../services/location.service';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'AddAddress'>;

const LABELS = ['Home', 'Work', 'Other'] as const;

// Camera only until a real GPS pin exists. Same India overview the website map uses.
// These coordinates are never saved.
const MAP_OVERVIEW: LatLng = { latitude: 20.5937, longitude: 78.9629 };
const OVERVIEW_DELTA = { latitudeDelta: 18, longitudeDelta: 18 };
const PIN_DELTA = { latitudeDelta: 0.008, longitudeDelta: 0.008 };

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: KeyboardTypeOptions;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  testID,
}: FieldProps & { testID?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        style={styles.input}
        testID={testID}
        accessibilityLabel={label}
      />
    </View>
  );
}

export default function AddAddressScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { addresses, saveAddress } = useAddress();
  const addressId = route.params?.addressId;
  const existing = addressId ? addresses.find(a => a.id === addressId) : undefined;

  const mapRef = useRef<MapView>(null);
  const mapReady = useRef(false);
  const pendingRegion = useRef<Region | null>(null);
  const followLive = useRef(!addressId);
  const watchId = useRef<number | null>(null);

  const [label, setLabel] = useState<string>(existing?.label || 'Home');
  const [line1, setLine1] = useState(existing?.line1 || '');
  const [line2, setLine2] = useState(existing?.line2 || '');
  const [landmark, setLandmark] = useState(existing?.landmark || '');
  const [city, setCity] = useState(existing?.city || '');
  const [stateVal, setStateVal] = useState(existing?.state || '');
  const [pincode, setPincode] = useState(existing?.pincode || '');

  const hasExistingPin = isValidCoordPair(existing?.latitude, existing?.longitude);
  const [coords, setCoords] = useState<LatLng>(
    hasExistingPin
      ? { latitude: existing!.latitude, longitude: existing!.longitude }
      : MAP_OVERVIEW,
  );
  const [pinSet, setPinSet] = useState(hasExistingPin);
  const [locating, setLocating] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const initialRegion: Region = {
    ...coords,
    ...(hasExistingPin ? PIN_DELTA : OVERVIEW_DELTA),
  };

  const applyResolvedFields = (
    p: {
      line1: string;
      line2: string;
      city: string;
      state: string;
      pincode: string;
    },
    force = false,
  ) => {
    const pick = (prev: string, next: string) => (force ? next || prev : prev || next);
    setLine1(prev => pick(prev, p.line1));
    setLine2(prev => pick(prev, p.line2));
    setCity(prev => pick(prev, p.city));
    setStateVal(prev => pick(prev, p.state));
    setPincode(prev => pick(prev, p.pincode));
  };

  const focusMap = (next: LatLng) => {
    const region: Region = { ...next, ...PIN_DELTA };
    if (mapReady.current && mapRef.current) {
      mapRef.current.animateToRegion(region, 350);
      pendingRegion.current = null;
    } else {
      pendingRegion.current = region;
    }
  };

  const movePin = async (next: LatLng, animate = false, forceFields = false) => {
    setCoords(next);
    setPinSet(true);
    if (animate) focusMap(next);
    setGeocoding(true);
    try {
      const place = await reverseGeocode(next);
      applyResolvedFields(place, forceFields);
    } finally {
      setGeocoding(false);
    }
  };

  const stopLive = () => {
    stopWatchingLocation(watchId.current);
    watchId.current = null;
  };

  const onUseMyLocation = async () => {
    if (locating) return;
    followLive.current = true;
    setLocating(true);
    try {
      setShowUser(true);
      const place = await resolveCurrentPlace();
      const fix = { latitude: place.latitude, longitude: place.longitude };
      setCoords(fix);
      setPinSet(true);
      focusMap(fix);
      applyResolvedFields(place, true);
      stopLive();
      let last = fix;
      watchId.current = watchDeviceLocation((next: Coordinates) => {
        if (!followLive.current || !isValidCoordPair(next.latitude, next.longitude)) return;
        setCoords(next);
        setPinSet(true);
        focusMap(next);
        const moved =
          Math.abs(last.latitude - next.latitude) > 0.0004 ||
          Math.abs(last.longitude - next.longitude) > 0.0004;
        if (!moved) return;
        last = next;
        reverseGeocode(next).then(resolved => {
          if (followLive.current) applyResolvedFields(resolved, false);
        });
      });
    } catch (e: unknown) {
      presentLocationFailure(e);
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!addressId) {
      onUseMyLocation();
    }
    return () => stopLive();
    // Live fix only on a new address. Editing keeps the saved pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId]);

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const handleSave = async () => {
    // Ref guard: a fast double tap fires before the disabled state renders.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    let ok = false;
    try {
      ok = await saveAddress({
      id: addressId ?? null,
      label,
      line1,
      line2,
      landmark,
      city,
      state: stateVal,
      pincode,
      latitude: pinSet ? coords.latitude : 0,
      longitude: pinSet ? coords.longitude : 0,
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    if (ok) navigation.goBack();
  };

  return (
    <ScreenContainer>
      <Header title={addressId ? 'Edit address' : 'Add address'} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        testID="address-form-scroll"
      >
        {/* Fields first so ADDRESS LINE 1 is always on-screen even if MapView hangs on emulator */}
        <View style={styles.labelRow} testID="address-label-row">
          {LABELS.map(l => {
            const active = label === l;
            return (
              <Pressable
                key={l}
                style={[styles.labelChip, active && styles.labelChipActive]}
                onPress={() => setLabel(l)}
                testID={`address-label-${l.toLowerCase()}`}
              >
                <Text style={[styles.labelChipText, active && styles.labelChipTextActive]}>{l}</Text>
              </Pressable>
            );
          })}
        </View>

        <Field
          label="ADDRESS LINE 1"
          value={line1}
          onChangeText={setLine1}
          placeholder="House / flat, building"
          testID="address-line1"
        />
        <Field
          label="ADDRESS LINE 2 (optional)"
          value={line2}
          onChangeText={setLine2}
          placeholder="Area, locality"
          testID="address-line2"
        />
        <Field
          label="LANDMARK (optional)"
          value={landmark}
          onChangeText={setLandmark}
          placeholder="Near a known place"
          testID="address-landmark"
        />
        <View style={styles.row2}>
          <View style={styles.row2Item}>
            <Field label="CITY" value={city} onChangeText={setCity} placeholder="City" testID="address-city" />
          </View>
          <View style={styles.row2Item}>
            <Field
              label="PINCODE"
              value={pincode}
              onChangeText={raw => {
                const pin = raw.replace(/\D/g, '').slice(0, 6);
                setPincode(pin);
                if (pin.length !== 6) return;
                lookupPincode(pin).then(found => {
                  if (!found) return;
                  setCity(prev => prev || found.city);
                  setStateVal(prev => prev || found.state);
                  setLine2(prev => prev || found.area);
                });
              }}
              placeholder="600001"
              keyboardType="numeric"
              testID="address-pincode"
            />
          </View>
        </View>
        <Field label="STATE" value={stateVal} onChangeText={setStateVal} placeholder="State" testID="address-state" />

        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            showsUserLocation={showUser}
            showsMyLocationButton={false}
            onMapReady={() => {
              mapReady.current = true;
              if (pendingRegion.current) {
                mapRef.current?.animateToRegion(pendingRegion.current, 350);
                pendingRegion.current = null;
              }
            }}
            onPress={(e: MapPressEvent) => {
              followLive.current = false;
              movePin(e.nativeEvent.coordinate, false, true);
            }}
          >
            {pinSet && (
              <Marker
                coordinate={coords}
                draggable
                onDragStart={() => {
                  followLive.current = false;
                }}
                onDragEnd={(e: MarkerDragStartEndEvent) =>
                  movePin(e.nativeEvent.coordinate, false, true)
                }
              />
            )}
          </MapView>

          {!pinSet && (
            <View pointerEvents="none" style={styles.mapHint}>
              <Icon name="pin" size={16} color={colors.primaryDark} />
              <Text style={styles.mapHintText}>Tap the map to drop a pin</Text>
            </View>
          )}

          <Pressable
            style={styles.locateBtn}
            onPress={onUseMyLocation}
            disabled={locating}
            testID="address-use-location"
          >
            {locating ? (
              <ActivityIndicator size="small" color={colors.primaryDark} />
            ) : (
              <Icon name="navigation" size={16} color={colors.primaryDark} />
            )}
            <Text style={styles.locateBtnText}>
              {locating ? 'Locating…' : 'Use my location'}
            </Text>
          </Pressable>

          {geocoding && (
            <View pointerEvents="none" style={styles.geocodeBadge}>
              <ActivityIndicator size="small" color={colors.white} />
            </View>
          )}
        </View>
      </ScrollView>
      <View style={styles.bottomBar}>
        <PrimaryButton
          testID="address-save"
          label={saving ? 'Saving…' : 'Save address'}
          onPress={handleSave}
          disabled={saving}
          loading={saving}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16 },
  mapWrap: {
    height: 190,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.tint,
    marginBottom: 16,
  },
  mapHint: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.lg,
  },
  mapHintText: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.primaryDark },
  locateBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.lg,
    elevation: 2,
  },
  locateBtnText: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.primaryDark },
  geocodeBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  labelChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radii.md + 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  labelChipActive: { borderColor: colors.primary, backgroundColor: colors.tint },
  labelChipText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.textMuted },
  labelChipTextActive: { color: colors.primaryDark },
  field: { marginBottom: 14 },
  fieldLabel: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.text, letterSpacing: 0.3 },
  input: {
    marginTop: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: colors.text,
  },
  row2: { flexDirection: 'row', gap: 12 },
  row2Item: { flex: 1 },
  bottomBar: {
    padding: 16,
    paddingTop: 6,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
