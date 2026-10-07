import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Header,
  Icon,
  LogoutConfirmSheet,
  PrimaryButton,
  ScreenContainer,
  useBottomNavHeight,
} from '../../components';
import { useOrders } from '../../context/OrdersContext';
import { useRefunds } from '../../context/RefundsContext';
import type { IconName } from '../../components';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { formatCurrency } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useNotifications } from '../../context/NotificationsContext';
import type { RootStackParamList } from '../../navigation/types';
import { normalizeApiAssetUrl } from '../../config/api';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Row {
  icon: IconName;
  label: string;
  onPress: () => void;
  trailing?: React.ReactNode;
}

export default function AccountScreen() {
  // The floating nav overlays the screen, so pad content out from under it.
  const navH = useBottomNavHeight();
  const navigation = useNavigation<Nav>();
  const { user, isGuest, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const { wallet } = useWallet();
  const { unreadCount } = useNotifications();
  const { orders } = useOrders();
  const { refunds } = useRefunds();

  const goLogin = () => navigation.navigate('EnterMobile', { mode: 'login' });

  const goGated = (route: keyof RootStackParamList, params?: any) => {
    if (isGuest) {
      goLogin();
      return;
    }
    navigation.navigate(route as any, params);
  };

  const rowsTop: Row[] = [
    { icon: 'box', label: 'My Orders', onPress: () => goGated('Orders') },
    { icon: 'heart', label: 'Wishlist', onPress: () => goGated('Wishlist') },
    { icon: 'pin', label: 'Addresses', onPress: () => goGated('Addresses') },
    {
      icon: 'wallet',
      label: 'Wallet',
      onPress: () => goGated('Wallet'),
      trailing: !isGuest ? <Text style={styles.trailingValue}>{formatCurrency(wallet.balance)}</Text> : undefined,
    },
    { icon: 'refund', label: 'Refunds', onPress: () => goGated('Refunds') },
    {
      icon: 'bell',
      label: 'Notifications',
      onPress: () => goGated('Notifications'),
      trailing: !isGuest && unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{unreadCount}</Text>
        </View>
      ) : undefined,
    },
  ];

  const rowsBottom: Row[] = [
    { icon: 'chat', label: 'Support', onPress: () => goGated('Support') },
    { icon: 'edit', label: 'Edit profile', onPress: () => goGated('EditProfile') },
    { icon: 'settings', label: 'Settings', onPress: () => goGated('Settings') },
    { icon: 'file', label: 'Terms of service', onPress: () => navigation.navigate('Legal', { type: 'terms' }) },
    { icon: 'shield', label: 'Privacy policy', onPress: () => navigation.navigate('Legal', { type: 'privacy' }) },
  ];

  // Three quick-stat tiles from the design's account screen.
  const stats: { key: string; icon: IconName; label: string; value: string; onPress: () => void }[] = [
    {
      key: 'wallet',
      icon: 'wallet',
      label: 'Wallet',
      value: formatCurrency(wallet.balance),
      onPress: () => goGated('Wallet'),
    },
    {
      key: 'orders',
      icon: 'box',
      label: 'Orders',
      value: `${orders.length} order${orders.length === 1 ? '' : 's'}`,
      onPress: () => goGated('Orders'),
    },
    {
      key: 'refunds',
      icon: 'refund',
      label: 'Refunds',
      value: `${refunds.length} item${refunds.length === 1 ? '' : 's'}`,
      onPress: () => goGated('Refunds'),
    },
  ];

  const renderRow = (row: Row) => (
    <Pressable key={row.label} onPress={row.onPress} style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon name={row.icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.rowLabel}>{row.label}</Text>
      {row.trailing || <Icon name="chevronRight" size={18} color={colors.textMuted} />}
    </Pressable>
  );

  const isTabRoot = navigation.getParent()?.getState()?.type === 'tab';

  const onLogout = () => setLogoutOpen(true);

  const confirmLogout = () => {
    logout();
    navigation.reset({ index: 0, routes: [{ name: 'EnterMobile' }] });
  };

  return (
    <ScreenContainer>
      <Header title="Account" hideBack={isTabRoot} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: navH }]}
        showsVerticalScrollIndicator={false}
      >
        {isGuest ? (
          <View style={styles.guestCard}>
            <View style={styles.avatar}>
              <Icon name="user" size={26} color={colors.white} />
            </View>
            <View style={styles.guestTextWrap}>
              <Text style={styles.guestTitle}>Guest</Text>
              <Text style={styles.guestSub}>Log in to see your profile, orders, wallet and more.</Text>
            </View>
            <PrimaryButton label="Log in" onPress={goLogin} size="sm" fullWidth={false} />
          </View>
        ) : (
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              {user?.avatarUrl ? (
                <Image
                  source={{ uri: normalizeApiAssetUrl(user.avatarUrl) }}
                  style={styles.avatarImg}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.avatarInitial}>{(user?.name || 'U')[0]}</Text>
              )}
            </View>
            <View style={styles.profileTextWrap}>
              <Text style={styles.profileName} numberOfLines={1}>{user?.name}</Text>
              {user?.phoneNumber ? <Text style={styles.profileSub} numberOfLines={1}>{user.phoneNumber}</Text> : null}
            </View>
            <Pressable style={styles.editChip} onPress={() => goGated('EditProfile')} hitSlop={6}>
              <Text style={styles.editChipLabel}>Edit</Text>
            </Pressable>
          </View>
        )}

        {!isGuest ? (
          <View style={styles.statRow}>
            {stats.map(s => (
              <Pressable key={s.key} style={styles.statTile} onPress={s.onPress}>
                <View style={styles.statIcon}>
                  <Icon name={s.icon} size={19} color={colors.primary} />
                </View>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statValue} numberOfLines={1}>{s.value}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.group}>{rowsTop.map(renderRow)}</View>
        <View style={styles.group}>{rowsBottom.map(renderRow)}</View>

        {!isGuest ? (
          <PrimaryButton testID="account-logout" label="Log out" kind="danger" onPress={onLogout} />
        ) : null}
      </ScrollView>

      <LogoutConfirmSheet
        visible={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={confirmLogout}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xxl - 2,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  guestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xxl - 2,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { fontFamily: fontFamily.bold, fontSize: 24, color: colors.white },
  profileTextWrap: { flex: 1, minWidth: 0 },
  editChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.md + 2,
    backgroundColor: colors.tint,
    flexShrink: 0,
  },
  editChipLabel: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primaryDark },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: spacing.md },
  statTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 7,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.text },
  statValue: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.textMuted, textAlign: 'center' },
  profileName: { fontFamily: fontFamily.bold, fontSize: 16.5, color: colors.text },
  profileSub: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  guestTextWrap: { flex: 1 },
  guestTitle: { fontFamily: fontFamily.bold, fontSize: 16.5, color: colors.text },
  guestSub: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  group: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xxl - 2,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  rowIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 14.5, color: colors.text },
  trailingValue: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.primary },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeLabel: { fontFamily: fontFamily.bold, fontSize: 10, color: colors.white },
});
