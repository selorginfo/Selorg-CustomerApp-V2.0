import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BillSummaryCard from '../../components/BillSummaryCard';
import { Header, Icon, PrimaryButton, ScreenContainer, StateView } from '../../components';
import type { IconName } from '../../components';
import { colors, fontFamily, radii } from '../../theme';
import { formatCurrency } from '../../utils/format';
import { useCart } from '../../context/CartContext';
import { showToast } from '../../utils/toast';
import { isValidIndianMobile } from '../../utils/validation';
import { useAddress } from '../../context/AddressContext';
import { useWallet } from '../../context/WalletContext';
import type { PayMethod } from '../../context/OrdersContext';
import { deliveryApi, type DeliveryEstimate } from '../../services/delivery.service';
import { mmkvStorage } from '../../lib/storage';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TIP_OPTIONS = [0, 10, 20, 30];

/** Checkout's method ids in the vocabulary the pricing engine expects. */
const PAY_METHOD_TO_API: Record<PayMethod, string> = {
  online: 'upi',
  cod: 'cash',
  wallet: 'wallet',
};

const PAY_METHODS: { id: PayMethod; icon: IconName; title: string }[] = [
  { id: 'online', icon: 'card', title: 'Pay online' },
  { id: 'wallet', icon: 'wallet', title: 'Selorg Wallet' },
  { id: 'cod', icon: 'rupee', title: 'Cash on delivery' },
];

function last10(value: string): string {
  return value.replace(/\D/g, '').slice(-10);
}

// Shared web-parity rule (src/utils/validation.ts) — same /^[6-9]\d{9}$/ check.

// No hardcoded fallback promise: when the live estimate is unavailable we hide
// the window rather than showing an invented one.

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Hermes-safe (no Intl) 12h clock: "4:35 PM". */
function formatClockTime(d: Date): string {
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

function dayLabel(d: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return d.toDateString() === now.toDateString()
    ? 'Today'
    : d.toDateString() === tomorrow.toDateString()
      ? 'Tomorrow'
      : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Backend promiseText is a range like "30-40 mins". */
function parsePromiseRange(promiseText?: string): [number, number] | null {
  const m = promiseText?.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  const lo = parseInt(m[1], 10);
  const hi = parseInt(m[2], 10);
  return lo > 0 && hi >= lo ? [lo, hi] : null;
}

function resolveEtaRange(estimate: DeliveryEstimate | null): [number, number] | null {
  const fromApi = parsePromiseRange(estimate?.promiseText);
  if (fromApi) return fromApi;
  if (estimate?.etaMinutes && estimate.etaMinutes > 0) {
    return [Math.max(8, estimate.etaMinutes - 5), estimate.etaMinutes + 5];
  }
  return null;
}

/** "Today, 4:30 – 4:40 PM" for ranges. */
function formatExpectedDelivery(range: [number, number]): string {
  const start = new Date(Date.now() + range[0] * 60000);
  const end = new Date(Date.now() + range[1] * 60000);
  const startDay = dayLabel(start);
  const endDay = dayLabel(end);
  return startDay === endDay
    ? `${startDay}, ${formatClockTime(start)} – ${formatClockTime(end)}`
    : `${startDay}, ${formatClockTime(start)} – ${endDay}, ${formatClockTime(end)}`;
}

export default function CheckoutScreen() {
  const navigation = useNavigation<Nav>();
  const cart = useCart();
  const { items, totalItems, tip, setTip, grandTotal, coupon, discount, applyCoupon, removeCoupon } = cart;
  const { selectedAddress } = useAddress();
  const wallet = useWallet();

  const { refreshCart, setPricingContext } = cart;

  // Re-price on entry. Cart totals otherwise persist from whenever the cart was
  // last mutated, so checkout could quote a stale bill (e.g. FREE delivery)
  // while the order is priced server-side at submit time and charges more.
  useFocusEffect(
    useCallback(() => {
      refreshCart();
    }, [refreshCart]),
  );


  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null);
  const [orderForSomeone, setOrderForSomeone] = useState(false);
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('online');
  const [couponInput, setCouponInput] = useState('');
  // Keep the quote live: changing address or payment method re-runs the
  // server-side pricing engine, so the delivery fee shown is always the fee
  // that will be charged for the current selection.
  useEffect(() => {
    setPricingContext({
      zone: selectedAddress?.city ?? null,
      paymentMethod: PAY_METHOD_TO_API[payMethod],
    });
  }, [selectedAddress?.city, payMethod, setPricingContext]);

  useEffect(() => {
    const storeId = mmkvStorage.getItem('assignedStoreId');
    if (!storeId || !selectedAddress?.latitude || !selectedAddress?.longitude) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    deliveryApi
      .getEstimate({
        storeId,
        latitude: selectedAddress.latitude,
        longitude: selectedAddress.longitude,
        cartItemCount: totalItems || 1,
      })
      .then(res => {
        if (cancelled) return;
        // Keep any response that carries a usable promise; resolveEtaRange
        // decides whether it is renderable.
        setEstimate(res ?? null);
      })
      .catch(err => {
        if (cancelled) return;
        setEstimate(null);
        console.warn('[checkout] delivery estimate failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAddress, totalItems]);

  if (items.length === 0) {
    return (
      <ScreenContainer>
        <Header title="Checkout" onBack={() => navigation.goBack()} />
        <View style={styles.emptyWrap}>
          <StateView
            kind="empty"
            title="Your cart is empty"
            message="Add items to your cart before checking out."
            ctaLabel="Browse products"
            onCta={() => navigation.navigate('Main')}
            icon="shoppingCart"
          />
        </View>
      </ScreenContainer>
    );
  }

  const walletCovers = wallet.covers(grandTotal);
  const hasAddress = !!selectedAddress;
  const etaRange = resolveEtaRange(estimate);

  const ctaLabel = !hasAddress
    ? 'Add address'
    : payMethod === 'cod'
      ? 'Place order'
      : payMethod === 'wallet'
        ? 'Pay with Wallet'
        : 'Proceed to Pay';

  const onContinue = () => {
    if (!hasAddress) {
      navigation.navigate('Addresses', { fromCheckout: true });
      return;
    }
    if (orderForSomeone) {
      const name = receiverName.trim();
      const phone = last10(receiverPhone);
      if (name.length < 2) {
        showToast("Enter the receiver's name", 'err');
        return;
      }
      if (!isValidIndianMobile(phone)) {
        showToast('Enter a valid 10-digit receiver number starting with 6–9', 'err');
        return;
      }
      navigation.navigate('Payment', {
        method: payMethod,
        receiver: { name, phone },
      });
      return;
    }
    navigation.navigate('Payment', { method: payMethod });
  };

  const handleApplyCoupon = () => {
    if (!couponInput.trim()) return;
    applyCoupon(couponInput.trim());
    setCouponInput('');
  };

  return (
    <ScreenContainer>
      <Header
        title="Checkout"
        subtitle={`${totalItems} item${totalItems === 1 ? '' : 's'}`}
        onBack={() => navigation.goBack()}
      />
      <View style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Address */}
          <Text style={styles.sectionLabel}>DELIVERY ADDRESS</Text>
          <Pressable
            style={[styles.addressCard, !hasAddress && styles.addressCardMissing]}
            onPress={() => navigation.navigate('Addresses', { fromCheckout: true })}
            testID="checkout-address"
            accessibilityRole="button"
            accessibilityLabel={hasAddress ? 'Change delivery address' : 'Select delivery address'}
          >
            <Icon name="pin" size={20} color={colors.primary} />
            <View style={styles.addressBody} testID="checkout-address-select">
              <Text style={styles.addressTitle}>{hasAddress ? selectedAddress.label : 'Select delivery address'}</Text>
              {hasAddress ? (
                <Text style={styles.addressSub}>
                  {selectedAddress.line1}, {selectedAddress.city} {selectedAddress.pincode}
                </Text>
              ) : (
                <Text style={styles.addressMissing}>Required to place order</Text>
              )}
            </View>
            <Text style={styles.addressAction}>{hasAddress ? 'Change' : 'Add'}</Text>
          </Pressable>

          <View style={styles.etaCard} testID="checkout-eta">
            <View style={styles.etaIconWrap}>
              <Icon name="zap" size={18} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.etaBody}>
              <View style={styles.etaTitleRow}>
                <Icon name="clock" size={12} color={colors.primaryDark} strokeWidth={2.2} />
                <Text style={styles.etaTitle}>EXPECTED DELIVERY</Text>
              </View>
              {etaRange ? (
                <View style={styles.etaTimeRow}>
                  <Icon name="zap" size={14} color={colors.primaryDark} strokeWidth={2.4} />
                  <Text style={styles.etaTime}>
                    Delivered in {etaRange[0]} to {etaRange[1]} mins
                  </Text>
                </View>
              ) : (
                <View style={styles.etaTimeRow}>
                  <Text style={styles.etaTime}>Delivery time unavailable</Text>
                </View>
              )}
              <Text style={styles.etaSub}>
                {etaRange ? formatExpectedDelivery(etaRange) : 'We could not fetch a delivery window for this address.'}
                {typeof estimate?.distanceKm === 'number' ? ` · ${estimate.distanceKm.toFixed(1)} km away` : ''}
                {typeof estimate?.deliveryFee === 'number'
                  ? estimate.deliveryFee === 0
                    ? ' · FREE delivery'
                    : ` · ${formatCurrency(estimate.deliveryFee)} delivery`
                  : ''}
              </Text>
              {hasAddress ? (
                <Text style={styles.etaAddr} numberOfLines={1}>
                  Deliver to {selectedAddress.label} · {selectedAddress.city} {selectedAddress.pincode}
                </Text>
              ) : null}
            </View>
          </View>

          <Pressable
            style={styles.giftToggle}
            onPress={() => {
              setOrderForSomeone(on => {
                if (on) {
                  setReceiverName('');
                  setReceiverPhone('');
                }
                return !on;
              });
            }}
            hitSlop={4}
          >
            <View style={[styles.checkbox, orderForSomeone && styles.checkboxOn]}>
              {orderForSomeone ? <Icon name="check" size={13} color={colors.white} strokeWidth={3} /> : null}
            </View>
            <Text style={styles.giftLabel}>This order is for someone else</Text>
          </Pressable>

          {orderForSomeone ? (
            <View style={styles.receiverCard}>
              <Text style={styles.receiverHeading}>RECEIVER DETAILS</Text>
              <View style={styles.receiverRow}>
                <Icon name="user" size={16} color={colors.textMuted} strokeWidth={2} />
                <TextInput
                  value={receiverName}
                  onChangeText={setReceiverName}
                  placeholder="Receiver name"
                  placeholderTextColor={colors.textMuted}
                  style={styles.receiverInput}
                />
              </View>
              <View style={[styles.receiverRow, styles.receiverRowLast]}>
                <Icon name="phone" size={16} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.receiverPrefix}>+91</Text>
                <TextInput
                  value={receiverPhone}
                  onChangeText={v => setReceiverPhone(v.replace(/[^0-9]/g, '').slice(0, 10))}
                  keyboardType="number-pad"
                  maxLength={10}
                  placeholder="Receiver number"
                  placeholderTextColor={colors.textMuted}
                  style={styles.receiverInput}
                />
              </View>
            </View>
          ) : null}

          {/* Order summary */}
          <Text style={styles.sectionLabel}>ORDER SUMMARY</Text>
          <View style={styles.summaryCard}>
            {items.map((it, idx) => (
              <View key={it.id} style={[styles.summaryRow, idx < items.length - 1 && styles.summaryRowBorder]}>
                <View style={styles.summaryImageWrap}>
                  <Image source={it.image as ImageSourcePropType} style={styles.summaryImage} resizeMode="contain" />
                </View>
                <View style={styles.summaryInfo}>
                  <Text style={styles.summaryName} numberOfLines={1}>{it.name}</Text>
                  <Text style={styles.summarySub}>{it.unit} · Qty {it.quantity}</Text>
                </View>
                <Text style={styles.summaryPrice}>{formatCurrency(it.price * it.quantity)}</Text>
              </View>
            ))}
          </View>

          {/* Tip */}
          <Text style={styles.sectionLabel}>DELIVERY TIP</Text>
          <View style={styles.tipRow}>
            {TIP_OPTIONS.map(t => {
              const active = tip === t;
              return (
                <Pressable key={t} style={[styles.tipChip, active && styles.tipChipActive]} onPress={() => setTip(t)}>
                  <Text style={[styles.tipLabel, active && styles.tipLabelActive]}>{t === 0 ? 'None' : `₹${t}`}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Payment method */}
          <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>
          <View style={styles.methodCard}>
            {PAY_METHODS.map((m, i) => {
              const on = payMethod === m.id;
              const low = m.id === 'wallet' && !walletCovers;
              const sub =
                m.id === 'online'
                  ? 'UPI, cards & net banking'
                  : m.id === 'wallet'
                    ? low
                      ? 'Low balance · top up or pick another'
                      : `${formatCurrency(wallet.wallet.balance)} available`
                    : 'Pay when it arrives';
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setPayMethod(m.id)}
                  testID={`checkout-pay-${m.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={m.title}
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.methodRow,
                    i < PAY_METHODS.length - 1 && styles.methodRowBorder,
                    on && styles.methodRowOn,
                  ]}
                >
                  <View style={[styles.methodIcon, on && styles.methodIconOn]}>
                    <Icon name={m.icon} size={18} color={on ? colors.white : colors.primary} strokeWidth={2} />
                  </View>
                  <View style={styles.methodBody}>
                    <Text style={styles.methodTitle}>{m.title}</Text>
                    <Text style={[styles.methodSub, low && styles.methodSubLow]}>{sub}</Text>
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                </Pressable>
              );
            })}
          </View>

          {/* Coupon */}
          <View style={styles.couponWrap}>
            {coupon ? (
              <View style={styles.couponApplied}>
                <Icon name="tag" size={18} color={colors.primaryDark} />
                <View style={styles.couponAppliedText}>
                  <Text style={styles.couponAppliedTitle}>{coupon} applied</Text>
                  <Text style={styles.couponAppliedSub}>You saved {formatCurrency(discount)}</Text>
                </View>
                <Pressable onPress={removeCoupon} hitSlop={8}>
                  <Text style={styles.couponRemove}>Remove</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.couponRow}>
                <TextInput
                  value={couponInput}
                  onChangeText={setCouponInput}
                  placeholder="Enter coupon code"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  style={styles.couponInput}
                />
                <Pressable style={styles.couponApplyBtn} onPress={handleApplyCoupon} hitSlop={6}>
                  <Text style={styles.couponApplyLabel}>Apply</Text>
                </Pressable>
              </View>
            )}
          </View>

          <BillSummaryCard />
        </ScrollView>
      </View>

      <View style={styles.bottomBar}>
        <View style={styles.bottomTotalWrap}>
          <Text style={styles.bottomTotalLabel}>To pay</Text>
          <Text style={styles.bottomTotalValue}>{formatCurrency(grandTotal)}</Text>
        </View>
        <View style={styles.bottomBtnWrap}>
          <PrimaryButton
            testID="checkout-continue"
            label={ctaLabel}
            icon={hasAddress ? 'lock' : 'pin'}
            onPress={onContinue}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 0.4,
    marginTop: 18,
    marginBottom: 8,
  },

  addressCard: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addressCardMissing: { borderColor: colors.danger },
  addressBody: { flex: 1, minWidth: 0 },
  addressTitle: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },
  addressSub: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 1, lineHeight: 16 },
  addressMissing: { fontFamily: fontFamily.bold, fontSize: 11.5, color: colors.danger, marginTop: 1 },
  addressAction: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primary, flexShrink: 0 },

  etaCard: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.xl,
    padding: 14,
  },
  etaIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaBody: { flex: 1, minWidth: 0 },
  etaTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  etaTitle: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.primaryDark, letterSpacing: 0.4 },
  etaTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  etaTime: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text, flexShrink: 1 },
  etaSub: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  etaAddr: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 4 },

  giftToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingVertical: 2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  giftLabel: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.text },

  receiverCard: {
    marginTop: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  receiverHeading: { fontFamily: fontFamily.bold, fontSize: 11, color: colors.textMuted, letterSpacing: 0.4 },
  receiverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 9,
  },
  receiverRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  receiverPrefix: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.textMuted },
  receiverInput: { flex: 1, minWidth: 0, fontFamily: fontFamily.semibold, fontSize: 14, color: colors.text, padding: 0 },

  summaryCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  summaryRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryImageWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  summaryImage: { width: '100%', height: '100%' },
  summaryInfo: { flex: 1, minWidth: 0 },
  summaryName: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text },
  summarySub: { fontFamily: fontFamily.semibold, fontSize: 11, color: colors.textMuted, marginTop: 1 },
  summaryPrice: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text, flexShrink: 0 },

  tipRow: { flexDirection: 'row', gap: 8 },
  tipChip: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  tipChipActive: { borderColor: colors.primary, backgroundColor: colors.tint },
  tipLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.textMuted },
  tipLabelActive: { color: colors.primaryDark },

  methodCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  methodRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  methodRowOn: { backgroundColor: '#FFFFFF', borderColor: colors.primary },
  methodIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIconOn: { backgroundColor: colors.primary },
  methodBody: { flex: 1, minWidth: 0 },
  methodTitle: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },
  methodSub: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  methodSubLow: { color: colors.danger },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CCD3CB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  couponWrap: { marginTop: 18 },
  couponRow: { flexDirection: 'row', gap: 8 },
  couponInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.text,
  },
  couponApplyBtn: {
    paddingHorizontal: 18,
    borderRadius: radii.lg,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponApplyLabel: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.primaryDark },
  couponApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radii.xl - 2,
    padding: 14,
  },
  couponAppliedText: { flex: 1, minWidth: 0 },
  couponAppliedTitle: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.primaryDark },
  couponAppliedSub: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  couponRemove: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.danger },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingTop: 12,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomTotalWrap: { flexShrink: 0 },
  bottomTotalLabel: { fontFamily: fontFamily.semibold, fontSize: 10.5, color: colors.textMuted },
  bottomTotalValue: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.text, marginTop: 1 },
  bottomBtnWrap: { flex: 1, minWidth: 0 },
});
