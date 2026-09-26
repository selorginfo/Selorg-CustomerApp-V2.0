import React, { useMemo, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily, radii, shadows } from '../../theme';
import { ScreenContainer, Header, StatusPill, PrimaryButton, StateView, SkeletonList, useBottomNavHeight } from '../../components';
import { useOrders } from '../../context/OrdersContext';
import { formatCurrency } from '../../utils/format';
import type { Order } from '../../context/OrdersContext';
import { RootStackParamList } from '../../navigation/types';

type FilterKey = 'all' | 'active' | 'delivered' | 'cancelled';

const isActiveStatus = (status: Order['status']) => !['delivered', 'cancelled'].includes(status);

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'All',
  active: 'Active',
  delivered: 'Completed',
  cancelled: 'Cancelled',
};

const EMPTY_COPY: Record<Exclude<FilterKey, 'all'>, string> = {
  active: 'active',
  delivered: 'completed',
  cancelled: 'cancelled',
};

const EMPTY_ORDERS_LOTTIE = require('../../../assets/lottie/empty-orders.json');

export default function Orders() {
  // The floating nav overlays the screen, so pad content out from under it.
  const navH = useBottomNavHeight();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { orders, reorder, loading } = useOrders();
  const [filter, setFilter] = useState<FilterKey>('all');

  const isTabRoot = navigation.getParent()?.getState()?.type === 'tab';

  const counts = useMemo(
    () => ({
      all: orders.length,
      active: orders.filter(o => isActiveStatus(o.status)).length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
    }),
    [orders],
  );

  const list = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'active') return orders.filter(o => isActiveStatus(o.status));
    return orders.filter(o => o.status === filter);
  }, [orders, filter]);

  const header = <Header title="My Orders" hideBack={isTabRoot} onBack={() => navigation.goBack()} />;

  if (loading && orders.length === 0) {
    return (
      <ScreenContainer>
        {header}
        <SkeletonList count={4} padBottom={navH} />
      </ScreenContainer>
    );
  }

  if (orders.length === 0) {
    return (
      <ScreenContainer>
        {header}
        <StateView
          kind="empty"
          lottieSource={EMPTY_ORDERS_LOTTIE}
          title="No orders yet"
          message="When you place an order it'll show up here."
          ctaLabel="Start shopping"
          onCta={() => navigation.navigate('Main')}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {header}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRailOuter}
        contentContainerStyle={styles.filterRail}
      >
        {(Object.keys(FILTER_LABELS) as FilterKey[]).map(key => {
          const on = filter === key;
          return (
            <Pressable key={key} style={[styles.filterChip, on && styles.filterChipOn]} onPress={() => setFilter(key)}>
              <Text style={[styles.filterLabel, on && styles.filterLabelOn]}>{FILTER_LABELS[key]}</Text>
              <Text style={[styles.filterCount, on && styles.filterCountOn]}>({counts[key]})</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {list.length === 0 ? (
        <StateView
          kind="empty"
          lottieSource={EMPTY_ORDERS_LOTTIE}
          title="Nothing here"
          message={`No ${EMPTY_COPY[filter as Exclude<FilterKey, 'all'>]} orders right now.`}
        />
      ) : (
        <ScrollView
          testID="orders-list"
          contentContainerStyle={[styles.content, { paddingBottom: navH }]}
          showsVerticalScrollIndicator={false}
        >
          {list.map(order => {
            const active = isActiveStatus(order.status);
            const placedDate = new Date(order.placedAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });

            return (
              <Pressable
                key={order.id}
                style={styles.card}
                testID={`order-item-${order.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Order ${order.orderNumber}`}
                onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
              >
                <View style={styles.topRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                    <Text style={styles.placedDate}>
                      {order.items.length} item{order.items.length === 1 ? '' : 's'} ·{' '}
                      {formatCurrency(order.totalBill)}
                    </Text>
                  </View>
                  <StatusPill status={order.status} />
                </View>

                <View style={styles.thumbRow}>
                  {order.items.slice(0, 4).map((item, idx) => (
                    <View key={item.id + idx} style={styles.thumbWrap}>
                      <Image source={item.image as ImageSourcePropType} style={styles.thumb} resizeMode="contain" />
                    </View>
                  ))}
                  {order.items.length > 4 ? (
                    <View style={[styles.thumbWrap, styles.moreThumb]}>
                      <Text style={styles.moreThumbLabel}>+{order.items.length - 4}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.bottomRow}>
                  <Text style={styles.placedMeta}>Placed on {placedDate}</Text>
                  <View style={styles.actionsRow}>
                    {active ? (
                      <PrimaryButton
                        label="Track"
                        size="sm"
                        fullWidth={false}
                        onPress={() => navigation.navigate('Tracking')}
                      />
                    ) : order.status === 'delivered' ? (
                      <>
                        <PrimaryButton
                          label="Reorder"
                          kind="ghost"
                          size="sm"
                          fullWidth={false}
                          onPress={() => {
                            void reorder(order).then(ok => {
                              if (ok) navigation.navigate('Checkout');
                            });
                          }}
                        />
                        <PrimaryButton
                          label="Rate"
                          size="sm"
                          fullWidth={false}
                          onPress={() => navigation.navigate('RateOrder', { orderId: order.id })}
                        />
                      </>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filterRailOuter: { flexGrow: 0, flexShrink: 0 },
  filterRail: { gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  filterChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterLabel: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.textMuted },
  filterLabelOn: { color: colors.white },
  filterCount: { fontFamily: fontFamily.bold, fontSize: 11, color: colors.textMuted, opacity: 0.85 },
  filterCountOn: { color: colors.white },

  content: { padding: 16, paddingTop: 8, paddingBottom: 32, gap: 14 },
  flex1: { flex: 1, minWidth: 0 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl + 2,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.card,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  orderNumber: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text },
  placedDate: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  thumbRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  thumbWrap: {
    width: 40,
    height: 40,
    borderRadius: 9,
    backgroundColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: { width: '80%', height: '80%' },
  moreThumb: { backgroundColor: colors.tint },
  moreThumbLabel: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.primaryDark },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  placedMeta: { flex: 1, minWidth: 0, fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted },
  actionsRow: { flexDirection: 'row', gap: 8, flexShrink: 0 },
});
