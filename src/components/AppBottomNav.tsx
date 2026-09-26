import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, fontFamily } from '../theme';
import { useCart } from '../context/CartContext';
import type { IconName } from './Icon';
import AnimatedIcon from './AnimatedIcon';

export type AppTabKey = 'home' | 'category' | 'cart' | 'order' | 'profile';

const TABS: { key: AppTabKey; label: string; icon: IconName; route: string }[] = [
  { key: 'home', label: 'Home', icon: 'home', route: 'HomeTab' },
  { key: 'category', label: 'Categories', icon: 'categories', route: 'CategoriesTab' },
  { key: 'cart', label: 'Cart', icon: 'shoppingCart', route: 'CartTab' },
  { key: 'order', label: 'Orders', icon: 'receipt', route: 'OrdersTab' },
  { key: 'profile', label: 'Account', icon: 'user', route: 'ProfileTab' },
];

const SIDE_TABS = TABS.filter(t => t.key !== 'cart');
const INACTIVE = '#9AA69A';

/** Height of the white pill: paddingVertical * 2 + icon + label row. */
const BAR_H = 58;
/** Room reserved above the pill for the cart FAB's overhang. */
const FAB_OVERHANG = 30;
/** Smallest gap kept under the pill on devices with no bottom inset. */
const MIN_BOTTOM_GAP = 12;

/**
 * Space the floating nav covers at the bottom of the screen. The nav overlays
 * the content, so scrollable screens must pad their content by this much for
 * their last row to stay reachable.
 */
export function useBottomNavHeight() {
  const insets = useSafeAreaInsets();
  return FAB_OVERHANG + BAR_H + Math.max(insets.bottom, MIN_BOTTOM_GAP);
}

interface StandaloneProps {
  active: AppTabKey;
  onNavigate: (key: AppTabKey) => void;
}

function CartFab({ onPress, count, active }: { onPress: () => void; count: number; active: boolean }) {
  // `pop .3s` on the badge whenever the count changes.
  const pop = useRef(new Animated.Value(1)).current;
  const prev = useRef(count);
  useEffect(() => {
    if (prev.current === count) return;
    prev.current = count;
    if (count <= 0) return;
    pop.setValue(0.7);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 4, tension: 160 }).start();
  }, [count, pop]);

  return (
    <View style={styles.fabSlot} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={[styles.cartFab, active && styles.cartFabActive]}
        hitSlop={6}
        testID="tab-cart"
        accessibilityRole="button"
        accessibilityLabel="Cart"
        accessibilityState={{ selected: active }}
      >
        <AnimatedIcon name="shoppingCart" motion="pop" trigger={count} size={24} color={colors.white} strokeWidth={2.4} />
        {count > 0 ? (
          <Animated.View style={[styles.cartBadge, { transform: [{ scale: pop }] }]}>
            <Text style={styles.cartBadgeLabel} testID="tab-cart-badge">
              {count > 99 ? '99+' : count}
            </Text>
          </Animated.View>
        ) : null}
      </Pressable>
    </View>
  );
}

function TabButton({
  tab,
  active,
  onPress,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.item}
      onPress={onPress}
      hitSlop={8}
      testID={`tab-${tab.key}`}
      accessibilityRole="button"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.itemIcon, active && styles.itemIconActive]}>
        <AnimatedIcon
          name={tab.icon}
          motion={['pop', 'bounce']}
          active={active}
          size={22}
          color={active ? colors.primary : INACTIVE}
          strokeWidth={active ? 2.4 : 2}
        />
      </View>
      <Text style={[styles.itemLabel, active && styles.itemLabelActive]} numberOfLines={1}>
        {tab.label}
      </Text>
    </Pressable>
  );
}

function NavBody({
  active,
  onPress,
  bottomPad,
}: {
  active: AppTabKey;
  onPress: (key: AppTabKey) => void;
  bottomPad: number;
}) {
  const { totalItems } = useCart();
  const cartActive = active === 'cart';

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(bottomPad, MIN_BOTTOM_GAP) }]}
      pointerEvents="box-none"
    >
      <CartFab onPress={() => onPress('cart')} count={totalItems} active={cartActive} />
      <View style={styles.bar}>
        <View style={styles.side}>
          {SIDE_TABS.slice(0, 2).map(tab => (
            <TabButton key={tab.key} tab={tab} active={active === tab.key} onPress={() => onPress(tab.key)} />
          ))}
        </View>
        {/* Gap the centre FAB sits in — mirrors the design's mask notch. */}
        <View style={styles.notch} />
        <View style={styles.side}>
          {SIDE_TABS.slice(2).map(tab => (
            <TabButton key={tab.key} tab={tab} active={active === tab.key} onPress={() => onPress(tab.key)} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** Standalone nav for stack screens (e.g. CategoryProducts). */
export function AppBottomNav({ active, onNavigate }: StandaloneProps) {
  const insets = useSafeAreaInsets();
  return <NavBody active={active} onPress={onNavigate} bottomPad={insets.bottom} />;
}

/** Custom tab bar for MainTabNavigator. */
export function MainTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const routeName = state.routes[state.index]?.name;
  const active = TABS.find(t => t.route === routeName)?.key ?? ('home' as AppTabKey);

  const onPress = (key: AppTabKey) => {
    const tab = TABS.find(t => t.key === key);
    if (!tab) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: state.routes.find(r => r.name === tab.route)?.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(tab.route);
    }
  };

  return <NavBody active={active} onPress={onPress} bottomPad={insets.bottom} />;
}

const styles = StyleSheet.create({
  // Floating pill: pinned to the bottom edge and overlaying the screen, so
  // content scrolls underneath it instead of being cut off above it.
  // paddingTop reserves room for the FAB's overhang so it stays inside the
  // bar's measured bounds (outside them, Android drops the touches).
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: FAB_OVERHANG,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 6,
    shadowColor: '#14231A',
    shadowOpacity: 0.32,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  side: { flex: 1, flexDirection: 'row' },
  notch: { width: 78, flexGrow: 0, flexShrink: 0 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  itemIcon: { alignItems: 'center', justifyContent: 'center' },
  itemIconActive: { transform: [{ translateY: -1 }] },
  itemLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    lineHeight: 13,
    marginTop: 3,
    color: INACTIVE,
  },
  itemLabelActive: { fontFamily: fontFamily.bold, color: colors.primary },

  fabSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 2,
    alignItems: 'center',
    zIndex: 3,
  },
  cartFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  cartFabActive: { borderWidth: 3, borderColor: '#CFECCD' },
  cartBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2.5,
    // The nav is transparent now, so the ring can't borrow the page colour.
    borderColor: colors.white,
  },
  cartBadgeLabel: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.white },
});

export default AppBottomNav;
