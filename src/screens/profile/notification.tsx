import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header, Icon, ScreenContainer, StateView } from '../../components';
import type { IconName } from '../../components';
import { colors, fontFamily, radii, spacing } from '../../theme';
import type { NotificationItem } from '../../context/NotificationsContext';
import { useNotifications } from '../../context/NotificationsContext';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TYPE_ICON: Record<string, IconName> = {
  order: 'truck',
  wallet: 'wallet',
  promo: 'tag',
};

export default function NotificationsScreen() {
  const navigation = useNavigation<Nav>();
  const { notifications, markRead, markAllRead, deleteNotification } = useNotifications();
  const hasUnread = notifications.some((n: NotificationItem) => !n.read);

  return (
    <ScreenContainer>
      <Header
        title="Notifications"
        onBack={() => navigation.goBack()}
        right={
          hasUnread ? (
            <Pressable onPress={() => markAllRead()} hitSlop={8} style={styles.markAllBtn}>
              <Text style={styles.markAllLabel}>Mark all read</Text>
            </Pressable>
          ) : undefined
        }
      />
      {notifications.length === 0 ? (
        <StateView
          kind="empty"
          title="You're all caught up"
          message="New updates about orders, wallet and offers will appear here."
          icon="bell"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {notifications.map((n: NotificationItem) => (
            <Pressable
              key={n.id}
              onPress={() => markRead(n.id)}
              style={[styles.row, { backgroundColor: n.read ? colors.card : colors.white, borderColor: n.read ? colors.border : colors.primarySoft }]}
            >
              <View style={styles.iconTile}>
                <Icon name={TYPE_ICON[n.type] || 'bell'} size={19} color={colors.primary} />
              </View>
              <View style={styles.textWrap}>
                <View style={styles.titleRow}>
                  {!n.read ? <View style={styles.dot} /> : null}
                  <Text style={[styles.title, { fontFamily: n.read ? fontFamily.semibold : fontFamily.bold }]}>{n.title}</Text>
                </View>
                <Text style={styles.body}>{n.body}</Text>
                <Text style={styles.time}>
                  {new Date(n.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <Pressable onPress={() => deleteNotification(n.id)} hitSlop={8} style={styles.closeBtn}>
                <Icon name="x" size={15} color={colors.textMuted} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  markAllBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  markAllLabel: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primary },
  row: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: 14,
    marginBottom: 10,
  },
  iconTile: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  title: { fontSize: 13.5, color: colors.text },
  body: { fontFamily: fontFamily.medium, fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 17.5 },
  time: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.textMuted, marginTop: 6 },
  closeBtn: { alignSelf: 'flex-start' },
});
