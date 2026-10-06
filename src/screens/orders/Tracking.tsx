import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  ImageSourcePropType,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily, radii } from '../../theme';
import { images } from '../../theme/images';
import { ScreenContainer, Header, Icon, PrimaryButton, StateView } from '../../components';
import CancelOrderSheet from '../../components/CancelOrderSheet';
import { LiveTrackingMap, type MapCoord } from '../../components/orders/LiveTrackingMap';
import { useOrders } from '../../context/OrdersContext';
import { useSupport } from '../../context/SupportContext';
import { ordersApi, type OrderTracking } from '../../services/orders.service';
import { subscribeToOrder } from '../../services/realtime.service';
import { isValidMapCoord } from '../../services/maps/directions';
import { showToast } from '../../utils/toast';
import { mmkvStorage } from '../../lib/storage';
import DeliveredCelebration from '../../components/DeliveredCelebration';
import { RootStackParamList } from '../../navigation/types';

const STEP_ORDER = ['pending', 'confirmed', 'getting-packed', 'on-the-way', 'arrived', 'delivered'];
/** The design's timeline starts at `confirmed` — "pending" is folded into placement. */
const TRIP_STEPS = STEP_ORDER.slice(1);

const STEP_LABELS: Record<string, string> = {
  confirmed: 'Order confirmed',
  'getting-packed': 'Getting packed',
  'on-the-way': 'On the way',
  arrived: 'Rider arrived',
  delivered: 'Delivered to your address',
};

const MAP_HEIGHT = Math.min(340, Math.round(Dimensions.get('window').height * 0.38));

function toCoord(point?: { latitude?: number; longitude?: number } | null): MapCoord | null {
  if (!point) return null;
  const next = { latitude: Number(point.latitude), longitude: Number(point.longitude) };
  return isValidMapCoord(next) ? next : null;
}

export default function Tracking() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { activeOrder, canCancel, openTracking, rateOrder } = useOrders();
  const { chatWithRider, newTicket } = useSupport();
  const [cancelVisible, setCancelVisible] = useState(false);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [rider, setRider] = useState<{ name?: string; phone?: string } | null>(null);
  const [destination, setDestination] = useState<MapCoord | null>(null);
  const [store, setStore] = useState<MapCoord | null>(null);
  const [riderGps, setRiderGps] = useState<MapCoord | null>(null);
  const [riderHeading, setRiderHeading] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const orderId = activeOrder?.id;

  const applyTracking = useCallback((t: OrderTracking) => {
    const mins =
      typeof t.deliveryTimeMinutes === 'number'
        ? t.deliveryTimeMinutes
        : typeof t.etaMinutes === 'number'
          ? t.etaMinutes
          : null;
    if (mins != null) setEtaMinutes(mins);

    const partner = t.deliveryPartner;
    if (partner?.name) {
      setRider({ name: partner.name, phone: partner.phone || undefined });
    } else if (t.rider?.name) {
      setRider({ name: t.rider.name, phone: t.rider.phone });
    }

    const dest = toCoord(t.destination);
    if (dest) setDestination(dest);
    const hub = toCoord(t.storeLocation);
    if (hub) setStore(hub);

    const loc = toCoord(t.riderLocation);
    if (loc) setRiderGps(loc);
    if (typeof t.riderLocation?.heading === 'number') {
      setRiderHeading(t.riderLocation.heading);
    }
  }, []);

  useEffect(() => {
    if (!orderId) return;
    openTracking(orderId);
    ordersApi
      .getTracking(orderId)
      .then(applyTracking)
      .catch(() => {});
  }, [orderId, openTracking, applyTracking]);

  // Live order status + rider GPS over /customer-socket.io
  useEffect(() => {
    if (!orderId) return;
    const refresh = () => {
      openTracking(orderId).catch(() => {});
      ordersApi.getTracking(orderId).then(applyTracking).catch(() => {});
    };
    return subscribeToOrder(orderId, {
      onStatus: refresh,
      onRiderLocation: payload => {
        const next = toCoord({
          latitude: payload.latitude,
          longitude: payload.longitude,
        });
        if (next) setRiderGps(next);
        if (typeof payload.heading === 'number' && Number.isFinite(payload.heading)) {
          setRiderHeading(payload.heading);
        }
      },
    });
  }, [orderId, openTracking, applyTracking]);

  // Celebrate the moment an order reads as delivered — including the first time
  // it is opened after being delivered in the background. The storage key makes
  // it one-shot per order so revisiting tracking does not replay it. This sits
  // above the early return below: hooks must run on every render.
  const isDelivered = activeOrder?.status === 'delivered';
  useEffect(() => {
    if (!isDelivered || !orderId) return;
    const seenKey = `delivered-celebrated:${orderId}`;
    if (mmkvStorage.getItem(seenKey)) return;
    mmkvStorage.setItem(seenKey, '1');
    setCelebrate(true);
  }, [isDelivered, orderId]);

  if (!activeOrder) {
    return (
      <ScreenContainer>
        <Header title="Tracking on Map" onBack={() => navigation.goBack()} />
        <StateView
          kind="empty"
          icon="truck"
          title="No active order"
          message="Your active order will appear here for live tracking."
          ctaLabel="Shop now"
          onCta={() => navigation.navigate('Main')}
        />
      </ScreenContainer>
    );
  }

  const order = activeOrder;
  const cancelled = order.status === 'cancelled';
  const delivered = order.status === 'delivered';

  const curIdx = STEP_ORDER.indexOf(order.status);
  const fallbackMins = Math.max(0, 5 - Math.max(curIdx, 0)) * 5;
  const mins = etaMinutes ?? fallbackMins;
  const etaLabel = `${mins}:00`;

  const statusLabel = cancelled ? 'Cancelled' : delivered ? 'Delivered' : STEP_LABELS[order.status] || order.status;
  const firstItem = order.items[0];
  const showRiderOnMap = !cancelled && !delivered && (curIdx >= STEP_ORDER.indexOf('on-the-way') || !!riderGps);

  const handleCallRider = () => {
    if (rider?.phone) {
      Linking.openURL(`tel:${rider.phone}`).catch(() =>
        showToast('Could not open dialer', 'err'),
      );
      return;
    }
    showToast(rider?.name ? `Calling ${rider.name}…` : 'Rider contact unavailable', 'info');
  };

  const handleChat = async () => {
    try {
      const ticket = await chatWithRider();
      navigation.navigate('TicketDetail', { ticketId: ticket.id });
    } catch {
      // toast shown in context
    }
  };

  const handleHelp = async () => {
    try {
      const ticket = await newTicket();
      navigation.navigate('TicketDetail', { ticketId: ticket.id });
    } catch {
      // toast shown in context
    }
  };

  const handleRateShipper = async (stars: number) => {
    try {
      await rateOrder(order.id, stars);
      navigation.navigate('RatingSuccess');
    } catch {
      showToast('Could not submit rating', 'err');
    }
  };

  return (
    <View style={styles.root}>
      <LiveTrackingMap
        height={MAP_HEIGHT}
        destination={destination}
        store={store}
        rider={riderGps}
        heading={riderHeading}
        showRider={showRiderOnMap}
      >
        <SafeAreaView edges={['top']} style={styles.mapHeaderSafe} pointerEvents="box-none">
          <View style={styles.mapHeader}>
            <Pressable onPress={() => navigation.goBack()} style={styles.mapChip} hitSlop={8}>
              <Icon name="chevronLeft" size={20} color={colors.text} />
            </Pressable>
            <Text style={styles.mapTitle}>Tracking on Map</Text>
            <Pressable onPress={handleHelp} style={styles.mapChip} hitSlop={8} accessibilityLabel="Help">
              <Icon name="help" size={19} color={colors.text} strokeWidth={2.2} />
            </Pressable>
          </View>
        </SafeAreaView>
      </LiveTrackingMap>

      {/* Sheet overlapping the map */}
      <View style={styles.sheet}>
        <View style={styles.sheetHandleWrap}>
          <View style={styles.sheetHandle} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}
        >
          <Text style={styles.headline}>
            {cancelled
              ? 'This order was cancelled'
              : delivered
                ? 'Your order has been delivered'
                : `Your order is coming in ${etaLabel}`}
          </Text>

          {/* Order card */}
          <View style={styles.orderCard}>
            <View style={styles.orderThumb}>
              {firstItem?.image ? (
                <Image source={firstItem.image as ImageSourcePropType} style={styles.orderThumbImg} resizeMode="contain" />
              ) : (
                <Icon name="box" size={22} color={colors.textMuted} />
              )}
            </View>
            <View style={styles.orderBody}>
              <Text style={styles.orderTitle}>Selorg Fresh Order</Text>
              <Text style={styles.orderIdRow}>
                <Text style={styles.orderIdLabel}>ID: </Text>
                <Text style={styles.orderIdValue}>{order.orderNumber}</Text>
              </Text>
              <View style={styles.orderMetaRow}>
                <Text style={styles.orderItems}>
                  {order.items.length} Item{order.items.length === 1 ? '' : 's'}
                </Text>
                <Text style={[styles.orderStatus, cancelled && styles.orderStatusCancelled]}>{statusLabel}</Text>
              </View>
            </View>
          </View>

          {/* Rider */}
          {!cancelled && !delivered ? (
            <View style={styles.riderRow}>
              <View style={styles.riderAvatar}>
                <Image source={images.rider} style={styles.riderAvatarImg} resizeMode="cover" />
              </View>
              <View style={styles.riderBody}>
                <Text style={styles.riderName}>{rider?.name || 'Your delivery partner'}</Text>
                <Text style={styles.riderSub}>
                  {riderGps
                    ? 'Live on the map'
                    : rider?.name
                      ? 'On the way to you'
                      : 'Assigned once your order is packed'}
                </Text>
              </View>
              <Pressable onPress={handleChat} style={styles.riderChat} hitSlop={4} accessibilityLabel="Chat">
                <Icon name="chat" size={18} color={colors.white} strokeWidth={2.2} />
              </Pressable>
              <Pressable onPress={handleCallRider} style={styles.riderCall} hitSlop={4} accessibilityLabel="Call">
                <Icon name="phone" size={18} color={colors.white} strokeWidth={2.2} />
              </Pressable>
            </View>
          ) : null}

          {/* Trip timeline */}
          <Text style={styles.tripLabel}>TRIP</Text>
          {cancelled ? (
            <View style={styles.cancelledRow}>
              <Icon name="x" size={20} color={colors.danger} strokeWidth={2.4} />
              <View style={styles.flex1}>
                <Text style={styles.cancelledTitle}>Order cancelled</Text>
                <Text style={styles.cancelledSub}>Refund initiated if applicable</Text>
              </View>
            </View>
          ) : (
            <View>
              {TRIP_STEPS.map((step, i) => {
                const idx = i + 1;
                const done = idx <= curIdx;
                const last = idx === STEP_ORDER.length - 1;
                const entry = order.timeline.find(t => t.status === step);
                const time = entry
                  ? new Date(entry.timestamp).toLocaleTimeString('en-IN', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : '';
                return (
                  <View key={step} style={styles.stepRow}>
                    <View style={styles.rail}>
                      <View style={[styles.dot, done && styles.dotOn]}>
                        {last ? (
                          <Icon name="pin" size={13} color={done ? colors.white : '#B7C1B6'} strokeWidth={2.2} />
                        ) : done ? (
                          <Icon name="check" size={13} color={colors.white} strokeWidth={3} />
                        ) : (
                          <View style={styles.dotInner} />
                        )}
                      </View>
                      {!last ? <View style={[styles.line, idx < curIdx && styles.lineOn]} /> : null}
                    </View>
                    <View style={[styles.stepBody, { paddingBottom: last ? 0 : 20 }]}>
                      <Text style={[styles.stepLabel, done && styles.stepLabelOn]}>{STEP_LABELS[step]}</Text>
                      <Text style={[styles.stepTime, done && styles.stepTimeOn]}>
                        {done ? time : last ? `About ${etaLabel}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Rate the shipper */}
          {delivered ? (
            <View style={styles.shipperBlock}>
              <Text style={styles.shipperTitle}>HOW IS YOUR SHIPPER?</Text>
              <Text style={styles.shipperSub}>
                Your feedback will help us improve the delivery experience.
              </Text>
              <View style={styles.shipperStars}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Pressable key={n} onPress={() => handleRateShipper(n)} hitSlop={6}>
                    <Icon name="star" size={32} color="#DCE0D8" fill="#DCE0D8" strokeWidth={0} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            {!cancelled && !delivered && canCancel(order) ? (
              <PrimaryButton label="Cancel order" kind="danger" onPress={() => setCancelVisible(true)} />
            ) : null}
            {delivered ? (
              <PrimaryButton
                label="Report an issue / return"
                kind="ghost"
                icon="refund"
                onPress={() => navigation.navigate('ReturnRequest', { orderId: order.id })}
              />
            ) : null}
            <PrimaryButton label="Need help with this order" kind="ghost" icon="help" onPress={handleHelp} />
          </View>
        </ScrollView>
      </View>

      <CancelOrderSheet visible={cancelVisible} order={order} onClose={() => setCancelVisible(false)} />

      <DeliveredCelebration
        visible={celebrate}
        orderNumber={order.orderNumber}
        onRate={() => {
          setCelebrate(false);
          navigation.navigate('RateOrder', { orderId: order.id });
        }}
        onClose={() => setCelebrate(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  flex1: { flex: 1 },

  mapHeaderSafe: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 },
  mapHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 8 },
  mapChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.bold, fontSize: 15, color: colors.text },

  sheet: {
    flex: 1,
    marginTop: -18,
    backgroundColor: colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#14231A',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -10 },
    elevation: 10,
  },
  sheetHandleWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  sheetContent: { paddingHorizontal: 16, paddingTop: 8 },

  headline: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text },

  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  orderThumb: {
    width: 58,
    height: 58,
    borderRadius: radii.lg,
    backgroundColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  orderThumbImg: { width: '86%', height: '86%' },
  orderBody: { flex: 1, minWidth: 0 },
  orderTitle: { fontFamily: fontFamily.bold, fontSize: 14.5, color: colors.text },
  orderIdRow: { marginTop: 2 },
  orderIdLabel: { fontFamily: fontFamily.bold, fontSize: 11.5, color: colors.danger },
  orderIdValue: { fontFamily: fontFamily.bold, fontSize: 11.5, color: colors.textMuted },
  orderMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5 },
  orderItems: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textMuted },
  orderStatus: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primary },
  orderStatusCancelled: { color: colors.danger },

  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.tint,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderAvatarImg: { width: '100%', height: '100%' },
  riderBody: { flex: 1, minWidth: 0 },
  riderName: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text },
  riderSub: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  riderChat: {
    width: 44,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderCall: {
    width: 44,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tripLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 11.5,
    letterSpacing: 1,
    color: colors.textMuted,
    marginTop: 16,
    marginBottom: 12,
  },
  stepRow: { flexDirection: 'row' },
  rail: { alignItems: 'center', width: 24 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.primary },
  dotInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.disabled },
  line: { width: 2, flex: 1, minHeight: 24, backgroundColor: colors.border },
  lineOn: { backgroundColor: colors.primary },
  stepBody: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  stepLabel: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 13.5, color: colors.textMuted },
  stepLabelOn: { fontFamily: fontFamily.bold, color: colors.text },
  stepTime: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: colors.textMuted, opacity: 0.6 },
  stepTimeOn: { color: colors.text, opacity: 1 },

  cancelledRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cancelledTitle: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.danger },
  cancelledSub: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textMuted, marginTop: 2 },

  shipperBlock: {
    marginTop: 16,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  shipperTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text, letterSpacing: 0.3 },
  shipperSub: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
    maxWidth: 250,
  },
  shipperStars: { flexDirection: 'row', gap: 10, marginTop: 14 },

  actions: { marginTop: 16, gap: 10 },
});
